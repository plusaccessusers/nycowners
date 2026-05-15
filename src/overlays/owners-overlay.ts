// src/overlays/owners-overlay.ts
import * as Cesium from 'cesium';
import type {
  OwnersIndex,
  OwnersOverlay,
  ParcelInfo,
  ParcelPickHandler,
} from '../types/owners';

const INDEX_URL = '/data/owners-index.json';
const GEOJSON_URL = '/data/owners.geojson';

// 50-entry electric-neon palette. Every entry has at least one RGB channel
// maxed (FF) and at least one near zero — pure-saturated hues that read
// like Tron / Blade Runner over the black graticule. Picked to stay
// distinguishable at small swatch sizes by mixing primary, secondary, and
// tertiary positions on the HSL wheel.
const NEON_PALETTE: readonly string[] = [
  '#FF0080', '#00FFFF', '#FFFF00', '#FF00FF', '#00FF40',
  '#FF6600', '#00BFFF', '#BC00FF', '#FF0033', '#39FF14',
  '#FF00CC', '#00FFB3', '#FFCC00', '#0066FF', '#FF3300',
  '#9D00FF', '#00FF80', '#FF0066', '#33FFFF', '#FF9900',
  '#CC00FF', '#80FF00', '#FF3399', '#00CCFF', '#FFEE00',
  '#FF00AA', '#00FF00', '#FF6633', '#3300FF', '#FF99CC',
  '#00FFAA', '#FF00FF', '#66FF00', '#0099FF', '#FF1A66',
  '#7700FF', '#FFAA00', '#00FFE5', '#FF0099', '#33FF00',
  '#FF66CC', '#0033FF', '#FF8000', '#B3FF00', '#FF00E5',
  '#00FF66', '#FF4D00', '#1AFFFF', '#FFCC33', '#E500FF',
];

interface OwnerProperties {
  owner_id: number;
  bbl: string;
  address: string;
  numfloors: number;
  yearbuilt: number | null;
  lat: number;
  lon: number;
  extruded_height_m: number;
}

interface OwnersFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry:
      | { type: 'Polygon'; coordinates: number[][][] }
      | { type: 'MultiPolygon'; coordinates: number[][][][] };
    properties: OwnerProperties;
  }>;
}

function hexToCesiumColor(hex: string, alpha: number): Cesium.Color {
  const c = Cesium.Color.fromCssColorString(hex);
  return c.withAlpha(alpha);
}

/** Flatten a Polygon or MultiPolygon into one or more ring-coordinate arrays. */
function polygonRings(
  geom: OwnersFeatureCollection['features'][number]['geometry'],
): number[][][][] {
  if (geom.type === 'Polygon') return [geom.coordinates];
  return geom.coordinates;
}

interface OwnerPrimitives {
  fill: Cesium.Primitive;
  outline: Cesium.Primitive;
}

interface InstanceLookup {
  /** map from `${primitiveUid}:${instanceIndex}` → ParcelInfo */
  byKey: Map<string, ParcelInfo>;
}

export async function createOwnersOverlay(viewer: Cesium.Viewer): Promise<OwnersOverlay> {
  const [index, geojson]: [OwnersIndex, OwnersFeatureCollection] = await Promise.all([
    fetch(INDEX_URL).then((r) => r.json()),
    fetch(GEOJSON_URL).then((r) => r.json()),
  ]);

  // Override the prep-time Glasbey palette with a neon palette for the
  // Palantir-styled canvas. Mutates the loaded index in place so every
  // downstream consumer (sidebar swatches, fill/outline, waymarker accent)
  // sees the same color per owner.
  for (const owner of index.owners) {
    const neon = NEON_PALETTE[(owner.id - 1) % NEON_PALETTE.length];
    if (neon) owner.color = neon;
  }

  const ownerById = new Map(index.owners.map((o) => [o.id, o]));
  const byOwnerFeatures = new Map<number, typeof geojson.features>();
  for (const f of geojson.features) {
    const oid = f.properties.owner_id;
    const list = byOwnerFeatures.get(oid);
    if (list) list.push(f);
    else byOwnerFeatures.set(oid, [f]);
  }

  const ownerPrimitives = new Map<number, OwnerPrimitives>();
  const lookup: InstanceLookup = { byKey: new Map() };
  const bblToInfo = new Map<string, ParcelInfo>();

  for (const owner of index.owners) {
    const features = byOwnerFeatures.get(owner.id) ?? [];
    // Edges dominate the face: nearly-transparent fill (0.18) under a fully
    // opaque outline. Makes the prisms read like wireframes with a tint.
    const fillColor = hexToCesiumColor(owner.color, 0.18);
    const outlineColor = hexToCesiumColor(owner.color, 1.0);

    const fillInstances: Cesium.GeometryInstance[] = [];
    const outlineInstances: Cesium.GeometryInstance[] = [];

    features.forEach((f) => {
      const props = f.properties;
      const info: ParcelInfo = {
        owner_id: owner.id,
        ownername: owner.ownername,
        color: owner.color,
        bbl: props.bbl,
        address: props.address,
        numfloors: props.numfloors,
        yearbuilt: props.yearbuilt,
        lat: props.lat,
        lon: props.lon,
        extruded_height_m: props.extruded_height_m,
      };
      bblToInfo.set(info.bbl, info);
      // A MultiPolygon parcel becomes multiple instances, all keyed to the same info.
      for (const polygon of polygonRings(f.geometry)) {
        const outerRing = polygon[0];
        const positions = Cesium.Cartesian3.fromDegreesArray(
          outerRing.flatMap(([lon, lat]) => [lon, lat]),
        );
        const fillGeom = new Cesium.PolygonGeometry({
          polygonHierarchy: new Cesium.PolygonHierarchy(positions),
          height: 0,
          extrudedHeight: props.extruded_height_m,
          vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
        });
        const fillInst = new Cesium.GeometryInstance({
          geometry: fillGeom,
          attributes: {
            color: Cesium.ColorGeometryInstanceAttribute.fromColor(fillColor),
          },
        });
        fillInstances.push(fillInst);
        // record info — instance index is the current length minus 1
        const idx = fillInstances.length - 1;
        lookup.byKey.set(`pending:${owner.id}:${idx}`, info);

        // Glowing top-ring polyline at extruded_height_m. PolylineGeometry
        // supports a real `width` (vs PolygonOutlineGeometry's 1px GL_LINES);
        // PolylineMaterialAppearance + PolylineGlow gives a Tron-style halo.
        // GeoJSON ring is already closed (first == last vertex).
        const ringWithHeights: number[] = [];
        for (const [lon, lat] of outerRing) {
          ringWithHeights.push(lon, lat, props.extruded_height_m);
        }
        const topRingPositions = Cesium.Cartesian3.fromDegreesArrayHeights(ringWithHeights);
        if (topRingPositions.length >= 2) {
          const outlineGeom = new Cesium.PolylineGeometry({
            positions: topRingPositions,
            width: 3.5,
            vertexFormat: Cesium.PolylineMaterialAppearance.VERTEX_FORMAT,
            arcType: Cesium.ArcType.NONE,
          });
          outlineInstances.push(
            new Cesium.GeometryInstance({ geometry: outlineGeom }),
          );
        }
      }
    });

    if (fillInstances.length === 0) continue;

    const fill = new Cesium.Primitive({
      geometryInstances: fillInstances,
      appearance: new Cesium.PerInstanceColorAppearance({
        translucent: true,
        closed: true,
      }),
      releaseGeometryInstances: false, // we need them at pick time
      asynchronous: true,
    });
    // Glow outline: one PolylineMaterialAppearance per owner with that owner's
    // color baked into the PolylineGlow material. (PolylineMaterialAppearance
    // doesn't support per-instance color, but we already have one primitive
    // per owner, so that's fine.)
    const outline = new Cesium.Primitive({
      geometryInstances: outlineInstances,
      appearance: new Cesium.PolylineMaterialAppearance({
        material: Cesium.Material.fromType('PolylineGlow', {
          color: outlineColor,
          glowPower: 0.25,
          taperPower: 1.0,
        }),
        translucent: true,
      }),
      releaseGeometryInstances: false,
      asynchronous: true,
    });

    viewer.scene.primitives.add(fill);
    viewer.scene.primitives.add(outline);
    ownerPrimitives.set(owner.id, { fill, outline });

    // Re-key the temporary lookup entries to use the real fill primitive uid.
    // Cesium assigns `primitive.id` lazily; use a stable identity instead.
    const stablePrimId = (fill as unknown as { _ownerOverlayId?: number })._ownerOverlayId
      ?? owner.id;
    (fill as unknown as { _ownerOverlayId: number })._ownerOverlayId = stablePrimId;
    for (let idx = 0; idx < fillInstances.length; idx++) {
      const info = lookup.byKey.get(`pending:${owner.id}:${idx}`);
      if (!info) continue;
      lookup.byKey.delete(`pending:${owner.id}:${idx}`);
      lookup.byKey.set(`${stablePrimId}:${idx}`, info);
    }
  }

  viewer.scene.requestRender();

  // Picking, fly-to, subscriptions: wired in next task. Stubs:
  const subs = new Set<ParcelPickHandler>();
  let activeParcel: ParcelInfo | null = null;

  const overlay: OwnersOverlay = {
    owners: index.owners,
    setOwnerVisible(ownerId, show) {
      const p = ownerPrimitives.get(ownerId);
      if (!p) return;
      p.fill.show = show;
      p.outline.show = show;
      viewer.scene.requestRender();
    },
    setAllOwnersVisible(show) {
      for (const p of ownerPrimitives.values()) {
        p.fill.show = show;
        p.outline.show = show;
      }
      viewer.scene.requestRender();
    },
    async flyToOwnerLargest(_ownerId: number) {
      // wired below
    },
    async flyToParcel(_bbl: string) {
      // wired below
    },
    onParcelPicked(handler) {
      subs.add(handler);
      return () => subs.delete(handler);
    },
    getActiveParcel() {
      return activeParcel;
    },
    destroy() {
      handler.destroy();
      for (const p of ownerPrimitives.values()) {
        viewer.scene.primitives.remove(p.fill);
        viewer.scene.primitives.remove(p.outline);
      }
      subs.clear();
      activeParcel = null;
    },
  };

  // ── Picking & fly-to wiring ──────────────────────────────────────────────

  function setActiveParcel(p: ParcelInfo | null) {
    activeParcel = p;
    for (const h of subs) h(p);
  }

  async function flyToLatLon(lat: number, lon: number, altitude: number): Promise<void> {
    return new Promise((res) => {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lon, lat, altitude),
        orientation: { pitch: Cesium.Math.toRadians(-45) },
        duration: 1.5,
        complete: () => res(),
        cancel: () => res(),
      });
    });
  }

  const SQFT_PER_SQM = 0.092903;
  function flyToAltitude(lotareaSqft: number): number {
    const sqm = lotareaSqft * SQFT_PER_SQM;
    const raw = Math.sqrt(Math.max(0, sqm)) * 4;
    return Math.min(1500, Math.max(400, raw));
  }

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction((click: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
    const picked = viewer.scene.pick(click.position);
    if (!picked) {
      setActiveParcel(null);
      return;
    }
    const primitive = picked.primitive as { _ownerOverlayId?: number } | undefined;
    // Cesium returns the GeometryInstance id when releaseGeometryInstances=false.
    // `picked.instanceId` is the index into the GeometryInstance[] array.
    if (!primitive || primitive._ownerOverlayId == null) {
      setActiveParcel(null);
      return;
    }
    const idx = typeof (picked as unknown as { instanceId?: number }).instanceId === 'number'
      ? (picked as unknown as { instanceId: number }).instanceId
      : -1;
    const info = lookup.byKey.get(`${primitive._ownerOverlayId}:${idx}`);
    setActiveParcel(info ?? null);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  overlay.flyToOwnerLargest = async (ownerId: number) => {
    const owner = ownerById.get(ownerId);
    if (!owner) return;
    const lp = owner.largest_parcel;
    setActiveParcel({
      owner_id: owner.id,
      ownername: owner.ownername,
      color: owner.color,
      bbl: lp.bbl,
      address: lp.address,
      numfloors: bblToInfo.get(lp.bbl)?.numfloors ?? 0,
      yearbuilt: bblToInfo.get(lp.bbl)?.yearbuilt ?? null,
      lat: lp.lat,
      lon: lp.lon,
      extruded_height_m: bblToInfo.get(lp.bbl)?.extruded_height_m ?? 5,
    });
    await flyToLatLon(lp.lat, lp.lon, flyToAltitude(lp.lotarea_sqft));
  };

  overlay.flyToParcel = async (bbl: string) => {
    const info = bblToInfo.get(bbl);
    if (!info) return;
    setActiveParcel(info);
    await flyToLatLon(info.lat, info.lon, 600);
  };

  return overlay;
}
