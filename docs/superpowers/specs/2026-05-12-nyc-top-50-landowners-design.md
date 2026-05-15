# NYC Top-50 Landowners Visualization — Design Spec

**Date:** 2026-05-12
**Status:** Approved through brainstorming; awaiting user review of this spec before plan writing.
**Scope:** Proof-of-concept visualization of NYC's top 50 landowners as colored 3D polygons over the existing Cesium photoreal globe, with a left-side sidebar for filtering, sorting, and parcel-level inspection.

## Summary

Add an offline data prep step and a runtime overlay system to the existing Full Globe Starter Kit so the user can see, toggle, and inspect the parcels owned by NYC's top 50 landowners. The "top 50" is determined by raw `ownername` aggregation on MapPLUTO `lotarea` — no entity resolution, no fuzzy matching, no external research. The visualization renders each parcel as a translucent extruded prism colored by owner, sitting on top of Google's photoreal 3D tiles. The user interacts via a left sidebar with sort, search, per-owner visibility toggle, and a "fly to largest parcel" button per owner. Clicking a parcel directly on the map, or clicking a fly-to button, places a single waymarker showing the owner name, floors, and year built.

## Goals & Non-Goals

### Goals (v1)

- Visualize the parcels owned by the top 50 NYC landowners ranked by total lot area.
- Render each parcel as a translucent 3D prism extruded by an estimate of its building height, colored by owner.
- Provide a left sidebar with sort, search, per-owner checkbox, bulk on/off, and per-owner fly-to.
- Provide a single active waymarker on parcel pick (via sidebar button or direct map click), showing owner name, number of floors, and year built.
- Keep the existing photoreal Google 3D tiles visible underneath the overlay.
- Maintain smooth interactivity: 60fps on camera moves, sub-100ms toggle response, on a mid-range MacBook with all 50 owners visible.

### Non-Goals (explicitly deferred)

- Owner aggregation / alias rollup ("NYCHA" vs "NEW YORK CITY HOUSING AUTHORITY" are separate entries in v1).
- JustFix-style LLC network resolution for private landlords.
- Address or BBL on the waymarker.
- Multi-marker pinning, hover previews, per-owner detail panels.
- Alternative ranking metrics (assessed value, building floor area, parcel count).
- Alphabetical sort (search covers the same need).
- Alternative fly-to anchors ("most valuable parcel" or curated flagship per owner).
- Top-only outline instead of full-prism wireframe.
- Mobile / responsive layout.

## Architecture Overview

The system has two distinct phases with no shared runtime state — only a derived data file.

### Phase 1 — Offline data prep

A Node script (`scripts/prepare-data.ts`, runs via `npm run prepare-data`) consumes raw MapPLUTO, ranks owners by total lot area, slices the top 50, and writes two artifacts to `public/data/`:

- `owners.geojson` — `FeatureCollection` of every parcel owned by a top-50 owner.
- `owners-index.json` — small ranked list of the 50 owners with colors, totals, and largest-parcel info.

Run once per MapPLUTO release. Raw MapPLUTO (~500 MB) stays gitignored; the derived ~5–15 MB output is committed.

### Phase 2 — Runtime

A Vite + React + Cesium app (the existing starter, modified). On boot, the app loads both static JSON files, builds batched Cesium primitives (two per owner — one for fill, one for outline), and mounts a React UI overlaying the viewer. All user interaction routes through a single `OwnersOverlay` API.

## Phase 1 — Offline Data Prep Pipeline

### Inputs

- **MapPLUTO 25v4 GeoJSON** — downloaded once from NYC DCP's open data portal, saved to `data-raw/MapPLUTO.geojson` (gitignored). The GeoJSON release is preferred over the shapefile because it keeps the pipeline pure-Node with zero native dependencies.

### Processing Steps

1. Stream-parse MapPLUTO using `stream-json` to avoid loading 500 MB into memory at once.
2. For each feature, retain only: `ownername`, `bbl`, `address`, `numfloors`, `yearbuilt`, `lotarea`, `latitude`, `longitude`, and the polygon geometry. Drop all other PLUTO columns.
3. Build an in-memory `Map<ownername, { totalLotArea, parcelCount, parcels: [] }>`. After the stream completes, sort entries by `totalLotArea` descending and slice the top 50.
4. Assign each owner a color from a precomputed **Glasbey palette** committed as `scripts/palette.ts` (50 maximally-distinguishable colors). Rank N gets palette entry N.
5. For each owner, identify their largest parcel by `lotarea` and capture its BBL, address, and centroid.
6. Write the two output files.

### Output 1 — `public/data/owners-index.json` (~10 KB)

```json
{
  "generated_at": "2026-05-12T...",
  "source": "MapPLUTO 25v4",
  "metric": "lotarea",
  "owners": [
    {
      "id": 1,
      "ownername": "NYC HOUSING AUTHORITY",
      "color": "#E63946",
      "parcel_count": 2453,
      "total_lotarea_sqft": 113612400,
      "largest_parcel": {
        "bbl": "1234567890",
        "address": "230 W 22ND ST",
        "lat": 40.7449,
        "lon": -73.9954,
        "lotarea_sqft": 234500
      }
    }
  ]
}
```

### Output 2 — `public/data/owners.geojson` (~5–15 MB)

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Polygon", "coordinates": [[...]] },
      "properties": {
        "owner_id": 1,
        "bbl": "1234567890",
        "address": "230 W 22ND ST",
        "numfloors": 6,
        "yearbuilt": 1962,
        "lotarea": 234500,
        "lat": 40.7449,
        "lon": -73.9954
      }
    }
  ]
}
```

Each feature stores `owner_id` only; runtime looks up `ownername` and color via the index. This saves ~5 MB versus denormalizing them onto every parcel.

### Edge Cases Handled by the Script

- **MultiPolygon geometries** (rare split parcels) — preserved as-is; Cesium renders them via multiple instances per feature.
- **Missing or zero `numfloors`** — passed through as 0; runtime renders these at a fixed 5 m height (see Phase 2).
- **Missing `yearbuilt`** — passed through as `null`; waymarker displays "—" for that field.

## Phase 2 — Runtime Rendering

### Bootstrap

After the existing `createViewer` resolves, the `CesiumViewer` component calls a new factory `createOwnersOverlay(viewer)` from `src/overlays/owners-overlay.ts`. The factory:

1. Fetches `owners-index.json` and `owners.geojson` in parallel.
2. Builds two Cesium primitives per owner (see below).
3. Registers a single `LEFT_CLICK` handler on `viewer.screenSpaceEventHandler` for parcel picking.
4. Returns an `OwnersOverlay` instance:

```ts
interface OwnersOverlay {
  owners: OwnerIndexEntry[];                       // ranked list for the sidebar
  setOwnerVisible(ownerId: number, show: boolean): void;
  flyToOwnerLargest(ownerId: number): Promise<void>;
  flyToParcel(bbl: string): Promise<void>;
  onParcelPicked(handler: (info: ParcelInfo | null) => void): () => void;
}
```

The returned object is the only surface React components talk to. No GeoJSON or Cesium types cross into React state.

### Primitive Structure

For each of the 50 owners, two `Cesium.Primitive`s are constructed:

- **Fill primitive** — one `GeometryInstance` per parcel, each wrapping a `Cesium.PolygonGeometry` with `polygonHierarchy` from the GeoJSON coordinates and the parcel's `extrudedHeight` (see height rules below). All instances share a `PerInstanceColorAppearance` configured with `translucent: true`, owner's color at alpha 0.55, closed prism faces enabled.
- **Outline primitive** — parallel `Cesium.PolygonOutlineGeometry` instances, same coordinates and heights, wrapped in `PolylineColorAppearance` with the owner's color at alpha 1.0. Cesium outlines all edges of the prism (top ring, bottom ring, vertical corners). A top-only outline is a v2 polish.

Toggling an owner's visibility sets `fillPrimitive.show` and `outlinePrimitive.show` together, then calls `viewer.scene.requestRender()` (required because of on-demand rendering — see CLAUDE.md performance rules). The operation is O(1) regardless of parcel count.

Total primitive count: 50 owners × 2 = **100 primitives**.

### Height Rules

```ts
extrudedHeight =
  numfloors > 0 ? numfloors * 3.66 : 5;   // meters
```

- `numfloors × 3.66` reflects an average 12 ft floor-to-floor height, applied as a proxy across all building types.
- `numfloors === 0` (or null) — typical for parks, parking lots, vacant land — defaults to **5 m** so the parcel remains visibly extruded rather than disappearing under the photoreal tiles.

### Heights Are Baked at Construction Time

No `CallbackProperty` is used. Per existing CLAUDE.md guidance, anything that doesn't animate stays a plain value so Cesium can cache the tessellation. The prisms only "animate" via visibility flip, which happens at the primitive level (show/hide), not at the geometry level.

## UI Components & File Structure

### Final File Tree

```
src/
├── App.tsx                         # MODIFIED — layout root
├── main.tsx                        # unchanged
├── components/
│   ├── CesiumViewer.tsx            # MODIFIED — lifts viewer ref via onReady callback
│   ├── Sidebar.tsx                 # NEW — top-50 list with sort, search, fly-to
│   └── Waymarker.tsx               # NEW — HTML overlay positioned over active parcel
├── cesium/
│   ├── viewer.ts                   # unchanged
│   ├── config.ts                   # unchanged
│   └── animate.ts                  # unchanged
├── overlays/
│   ├── README.md                   # MODIFIED — document the new overlay
│   └── owners-overlay.ts           # NEW — factory + OwnersOverlay API
└── types/
    └── owners.ts                   # NEW — TypeScript interfaces matching JSON schemas

scripts/
├── prepare-data.ts                 # NEW — offline data prep pipeline
└── palette.ts                      # NEW — 50-entry Glasbey color palette

public/data/
├── owners.geojson                  # NEW — generated by prepare-data
└── owners-index.json               # NEW — generated by prepare-data
```

### Responsibilities

- **`App.tsx`** — layout root. Holds two pieces of React state: the Cesium `viewer` instance (set when `CesiumViewer` calls `onReady`) and the `OwnersOverlay` instance (set after the factory resolves). Renders the viewer full-screen, the sidebar pinned to the left as an absolute-positioned overlay, and the waymarker conditionally when a parcel is active.
- **`CesiumViewer.tsx`** — existing component, modified to accept an `onReady(viewer)` prop and call it once the viewer is constructed.
- **`Sidebar.tsx`** — single file, no further splitting. Internal `useState` for `sort` (`"rank-desc" | "parcel-count-desc"`), `search` (string), and `visibility` (`Record<number, boolean>`, defaulted to `true` for all 50). Each interaction calls into the `OwnersOverlay` API.
- **`Waymarker.tsx`** — HTML overlay (not a Cesium entity). Rendered as a styled `<div>` positioned via `viewer.scene.cartesianToCanvasCoordinates`. Repositioned on `scene.postRender` so it tracks the camera. Hidden when the parcel goes off-screen or behind the camera.
- **`owners-overlay.ts`** — the runtime data + camera + picking layer. Single source of truth for parcel data and camera/marker actions.
- **`types/owners.ts`** — `OwnerIndexEntry`, `ParcelInfo`, and related interfaces.

### State Flow

The `OwnersOverlay` is the single source of truth. React components are thin views over it:

- Sidebar reads `overlay.owners` on mount; calls `setOwnerVisible(...)` and `flyToOwnerLargest(...)` on user actions.
- Waymarker subscribes via `overlay.onParcelPicked(handler)`; both the sidebar's fly-to button and direct map clicks route through the overlay API and fire the same event, so the marker renders regardless of which path triggered it.

## Interactions

### 1. Sort Dropdown

Two options in the sidebar header: "Largest area first" (default) and "Most parcels first". Sidebar holds `sort` state; on change the local `owners` array is re-sorted. Pure React state — never touches Cesium.

### 2. Search Box

Case-insensitive substring match against `ownername`. Hides non-matching rows in the sidebar. Search and sort compose: sort applies to the matching subset. Empty search shows the full list.

### 3. Per-Row Checkbox

Updates `visibility[ownerId]` in sidebar state, then calls `overlay.setOwnerVisible(ownerId, value)`. The overlay flips both primitives' `show` flags for that owner and calls `viewer.scene.requestRender()`.

### 4. All On / All Off Buttons

Iterate all 50 owners, batch the React state update, batch the overlay show-flag updates, single `requestRender()`. No 50 round-trips.

### 5. Per-Row Fly-To Button

Calls `overlay.flyToOwnerLargest(ownerId)`. The overlay:

1. Looks up the largest parcel from the index entry (BBL + centroid + `lotarea`).
2. Computes flight altitude via heuristic: convert `lotarea_sqft` to square meters (multiply by 0.0929), then `altitude = clamp(400, sqrt(lotarea_sqm) * 4, 1500)` meters. Small Manhattan lots zoom to ~400 m; NYCHA superblocks zoom to ~1500 m.
3. Calls `viewer.camera.flyTo({ destination, orientation: { pitch: -45° }, duration: 1.5s })`.
4. Fires `onParcelPicked` with the parcel's `ParcelInfo`. The waymarker appears immediately at flight start.

### 6. Direct Map Click

The overlay registers a `LEFT_CLICK` handler on `viewer.screenSpaceEventHandler`. On click, `viewer.scene.pick(event.position)` is called:

- **Hit on a parcel:** Cesium returns the picked primitive and the instance id. The overlay maintains a `parcelByPrimitiveAndInstance` lookup (built at construction time) that maps back to the original `ParcelInfo`. Fires `onParcelPicked` with that info. **Camera does not move** on direct clicks — only the waymarker updates.
- **Hit on empty terrain / photoreal tiles:** clears the active waymarker by firing `onParcelPicked(null)`.

### 7. Waymarker Dismissal

Three paths:

1. Clicking empty terrain (handled above).
2. Clicking a different parcel (replaces).
3. Clicking the small "×" on the waymarker itself.

Only one active waymarker exists at any time — enforced by the overlay storing a single `activeParcel: ParcelInfo | null`, not a list.

### 8. Waymarker Content

```
NYC HOUSING AUTHORITY
8 floors · Built 1962
```

Owner name on the first line (bold), then one line with floors and year built separated by a thin dot. `numfloors === 0` renders as "No building"; `yearbuilt === null` renders as "Built —". No address, no BBL, no lot area. Three fields exactly — owner, floors, year built.

## Performance Budget

Commitments measured on a mid-range MacBook (M1 or equivalent), Chrome stable:

- 60fps sustained during camera pan/orbit with all 50 owners visible.
- Sub-100ms perceived latency on checkbox toggle.
- Cold app load (HTML + JS + data) under 3 seconds on a fast local network.
- Initial GeoJSON parse and primitive construction under 1.5 seconds.

Measure after first prep run. If any budget is missed materially, the documented escalation path is converting per-owner primitives to glTF / 3D Tilesets — not pre-optimized.

## Known Risks

1. **Parcel count is an estimate.** Top-50 by area is projected to yield 30–80k parcels; actual could be higher. If it exceeds ~150k, batched primitives may not maintain the performance budget on lower-end machines and we'd escalate rendering.
2. **MapPLUTO memory.** The 500 MB GeoJSON would exceed Node's default heap with `JSON.parse`. The prep script uses `stream-json` specifically; this is a hard requirement of the implementation.
3. **50-color distinguishability.** Even with a Glasbey palette, mid-rank colors at a glance will look similar. The sidebar legend (swatch + name) is the authoritative key, not pure color recognition.
4. **Translucent z-fighting.** Overlapping prisms (e.g., a parking lot inside a larger campus) may flicker. Mitigation may need `disableDepthTestDistance` tuning. Test after first render.
5. **Many parcels have `numfloors === 0`.** Parks, parking lots, vacant land, and government property frequently lack a building. These render with a fixed 5 m extrusion so they remain visible; the waymarker displays "No building" for these cases regardless of visual height.
6. **The 12 ft floor-height proxy is rough.** Office and commercial buildings typically have taller floors (13–15 ft); some skyscrapers will render 10–20% shorter than reality. Acceptable for POC.
7. **MapPLUTO release cadence.** NYC publishes a new MapPLUTO version roughly quarterly. Re-running `prepare-data` and recommitting the derived files is a periodic maintenance chore.
8. **Pick reliability through translucent geometry.** Cesium's `scene.pick` should return the front-most primitive, but translucent geometries can occasionally pick through unexpectedly. If picking proves unreliable, switch to `scene.drillPick` and take the front-most hit.

## Open Questions for v2

These are explicitly out of scope for v1 but worth tracking:

- Owner aggregation strategy — manual alias list for known mega-owners (NYCHA, Trinity, NYC Parks, etc.) sourced from official publications. Discussed during brainstorming; deferred per POC-first scope.
- Alternative fly-to anchors — "most valuable parcel" or curated flagship per owner. "Largest" is a defensible mechanical default but produces unintuitive choices for some owners (e.g., flying to Trinity's largest lot rather than Trinity Church).
- Address or BBL on the waymarker — without it, parcels with the same owner look identical on the marker. May not be a real problem in practice; revisit after the POC is usable.
- Hover preview, multi-marker pinning, alphabetical sort, alternative ranking metrics.
