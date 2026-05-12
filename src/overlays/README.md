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
