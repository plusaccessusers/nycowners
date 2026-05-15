import * as Cesium from 'cesium';
import CesiumNavigation from 'cesium-navigation-es6';
import '../styles/cesium-navigation-palantir.css';
import { CESIUM_ION_TOKEN, DEFAULT_CAMERA, GOOGLE_MAPS_API_KEY } from './config';

// Set the Ion token at module init. Empty string is an explicit, valid fallback:
// the viewer still constructs, just without Ion-hosted terrain/imagery.
Cesium.Ion.defaultAccessToken = CESIUM_ION_TOKEN;

export interface ViewerHandles {
  viewer: Cesium.Viewer;
  tileset: Cesium.Cesium3DTileset | null;
}

export async function createViewer(container: HTMLDivElement): Promise<ViewerHandles> {
  // All default widgets disabled for a clean photoreal canvas.
  const viewer = new Cesium.Viewer(container, {
    timeline: false,
    animation: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    infoBox: false,
    selectionIndicator: false,
  });

  // On-demand rendering — idle = 0 frames. Camera moves and tile loads
  // trigger renders automatically; any custom RAF code that mutates the
  // scene must call viewer.scene.requestRender(). See src/cesium/animate.ts
  // for the helper that handles this for animations.
  viewer.clock.shouldAnimate = false;
  viewer.scene.requestRenderMode = true;
  viewer.scene.maximumRenderTimeChange = Infinity;

  // Photoreal-friendly rendering. Without these the Google tiles look
  // oversaturated and washed out.
  viewer.scene.highDynamicRange = true;
  viewer.scene.postProcessStages.tonemapper = Cesium.Tonemapper.PBR_NEUTRAL;
  viewer.scene.skyBox!.show = false;
  viewer.scene.sun!.show = false;
  viewer.scene.moon!.show = false;
  // Palantir-style canvas: black background, lat/lon grid lines on the globe.
  viewer.scene.backgroundColor = Cesium.Color.BLACK;

  // Globe stays visible — required for scene.sampleHeightMostDetailed and
  // other terrain queries beginners will want later.
  viewer.scene.globe.show = true;

  // Black globe surface; the grid imagery layer (added below) draws white-ish
  // lines on top. Visible whenever the photoreal tileset is hidden ("Map only").
  viewer.scene.globe.baseColor = Cesium.Color.BLACK;

  // Replace any default imagery with a thin grid layer. With the Ion token
  // empty, default imagery is already absent, but `removeAll()` is cheap and
  // makes the intent explicit.
  viewer.imageryLayers.removeAll();
  const gridLayer = viewer.imageryLayers.addImageryProvider(
    new Cesium.GridImageryProvider({
      cells: 4,
      color: Cesium.Color.WHITE.withAlpha(0.1),
      glowColor: Cesium.Color.WHITE.withAlpha(0),
      glowWidth: 0,
      backgroundColor: Cesium.Color.TRANSPARENT,
    }),
  );
  // Tag the grid layer so the sidebar's "Map only" toggle can skip it.
  (gridLayer as unknown as { _isPalantirGrid: true })._isPalantirGrid = true;

  // Photoreal tiles via the official helper. The helper handles attribution
  // and session tokens automatically — do not strip credit display.
  let tileset: Cesium.Cesium3DTileset | null = null;
  if (!GOOGLE_MAPS_API_KEY) {
    // eslint-disable-next-line no-console
    console.warn(
      '[full-globe] VITE_GOOGLE_MAPS_API_KEY is empty. Photoreal 3D Tiles will not load. ' +
        'Add the key to .env (see .env.example) and restart the dev server.',
    );
  } else {
    tileset = await Cesium.createGooglePhotorealistic3DTileset({
      key: GOOGLE_MAPS_API_KEY,
    });
    viewer.scene.primitives.add(tileset);

    // Clip photoreal to the 5-borough outline. Decimated ring set (~9 rings,
    // ~5.6k verts total) so the signed-distance texture stays well within
    // Cesium's practical limits; the original 46-ring set rendered blank.
    try {
      const resp = await fetch('/data/nyc-boroughs.json');
      const data: { rings: Array<{ outer: [number, number][] }> } = await resp.json();
      const polygons = data.rings.map((r) => {
        const flat = r.outer.flatMap(([lon, lat]) => [lon, lat]);
        return new Cesium.ClippingPolygon({
          positions: Cesium.Cartesian3.fromDegreesArray(flat),
        });
      });
      tileset.clippingPolygons = new Cesium.ClippingPolygonCollection({
        polygons,
        // inverse: clip everything OUTSIDE the union of polygons → render only inside.
        inverse: true,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[full-globe] borough clipping data failed to load:', err);
    }
  }

  // Compass + zoom (+/−) controls + distance legend from cesium-navigation-es6.
  // Re-skinned via cesium-navigation-palantir.css.
  new CesiumNavigation(viewer, {
    enableCompass: true,
    enableZoomControls: true,
    enableDistanceLegend: true,
    enableCompassOuterRing: true,
  });

  // Fly to the configured default with a -45° pitch so buildings are visible.
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(
      DEFAULT_CAMERA.lon,
      DEFAULT_CAMERA.lat,
      DEFAULT_CAMERA.alt,
    ),
    orientation: {
      pitch: Cesium.Math.toRadians(DEFAULT_CAMERA.pitchDegrees),
    },
    duration: 0,
  });

  return { viewer, tileset };
}
