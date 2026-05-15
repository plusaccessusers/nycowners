# Overlays

This directory is the documented home for overlay data (GeoJSON, CSV of lat/lon,
KML, glTF models) and the loader code that adds them to the Cesium viewer.

## Adding overlay data

1. Drop the data file in this directory (e.g., `points.geojson`, `route.kml`).
2. Create a loader module here (e.g., `geojson-loader.ts`) that takes the
   `Cesium.Viewer` instance and adds entities/primitives to it.
3. Call your loader from `src/App.tsx` (or `src/components/CesiumViewer.tsx`)
   after the viewer is ready.

## Hint

If you opened this repo in Claude Code, just ask: *"Add a GeoJSON overlay
loader."* The CLAUDE.md customization flow includes a documented snippet for
each common overlay type.

## NYC Top-50 Landowners overlay

The `owners-overlay.ts` module loads `/data/owners-index.json` and
`/data/owners.geojson` (both committed under `public/data/`) and renders one
fill + one outline `Cesium.Primitive` per owner.

These files are produced offline by `npm run prepare-data` (see
[scripts/prepare-data.ts](../../scripts/prepare-data.ts)), which streams
MapPLUTO from `data-raw/MapPLUTO.geojson` (gitignored) and aggregates the top
50 owners by total `lotarea`. Re-run when MapPLUTO ships a new release.

`createOwnersOverlay(viewer)` returns an `OwnersOverlay` (see
[src/types/owners.ts](../types/owners.ts)). The Sidebar and Waymarker
components only depend on this API; they never touch GeoJSON or Cesium types.
