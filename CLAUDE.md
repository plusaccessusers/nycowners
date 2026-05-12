# CLAUDE.md — Full Globe Starter Kit

This file gives Claude Code instructions for working in this repo. The most
important behavior is the **first-run customization flow** below.

## First-run customization flow

### When to trigger

On the **first user message** in any Claude Code session opened in this repo,
check whether the project is in a fresh / unconfigured state. Signals:

- `.env` does **not** exist (only `.env.example` is present), **OR**
- `src/cesium/config.ts` still contains the marker comment
  `// FULLGLOBE_DEFAULT — customize via Claude walkthrough or edit directly`.

If **either** signal is true, the project is unconfigured. Proactively offer
the walkthrough — do not wait to be asked:

> Looks like this is a fresh fork of the Full Globe Starter Kit. Want me to
> walk through ~6 quick questions to customize it for you? (You can also say
> "not now" and configure it manually.)

If the user declines, do not push. They can ask later.

### The questions (ask in a single batch)

Ask all six together in one message — the user wants a batch, not one at a time:

1. **Google Maps Platform API key** — do you have one yet? *(If not, link them
   to the README's "Get a Google Maps Platform API key" section. They need to
   enable the Map Tiles API and turn on billing or the API silently 403s.)*
2. **Cesium Ion access token** — have one? *(Free tier at cesium.com/ion is
   fine. If they skip it, warn that terrain will be flat without it.)*
3. **Initial camera location** — NYC (current default), San Francisco, Tokyo,
   or custom lat/lon/altitude?
4. **Overlay data** — GeoJSON points/polygons, CSV of lat/lon, KML, glTF
   models, or just the globe for now?
5. **UI chrome** — none (current default), search box, fly-to buttons, layer
   toggle, or all of the above?
6. **Framework swap** — keep Vite + React (recommended), migrate to vanilla
   HTML/JS, or migrate to Next.js? *(Rare. Warn the user a framework swap
   regenerates most of the project.)*

### Modification map

For each answer, apply these specific edits. After all edits are applied,
**remove the `// FULLGLOBE_DEFAULT` marker line** from `src/cesium/config.ts`
so the customization flow does not re-trigger.

#### Q1 — Google Maps API key

- If user has a key: instruct them to paste it into `.env` as
  `VITE_GOOGLE_MAPS_API_KEY`. Create `.env` from `.env.example` if it does not
  exist (`cp .env.example .env`). Do not commit `.env`.
- If user does not have a key: link them to the README setup section and pause
  the flow until they say they have one (or that they'll add it later).

#### Q2 — Cesium Ion token

- If user has a token: same as above, into `VITE_CESIUM_ION_TOKEN`.
- If user is skipping: leave `VITE_CESIUM_ION_TOKEN` empty in `.env`. Confirm:
  *"Got it — I'll leave Ion blank. Default terrain will be flat until you add
  a token."*

#### Q3 — Camera location

Edit `src/cesium/config.ts`, replacing the entire `DEFAULT_CAMERA` constant:

- **NYC** (default — no change needed):
  `{ lat: 40.7128, lon: -74.0060, alt: 1500, pitchDegrees: -45 }`
- **San Francisco**:
  `{ lat: 37.7749, lon: -122.4194, alt: 1500, pitchDegrees: -45 }`
- **Tokyo**:
  `{ lat: 35.6762, lon: 139.6503, alt: 1500, pitchDegrees: -45 }`
- **Custom**: ask for lat, lon, altitude (default 1500 m), pitch (default -45°)
  and substitute.

#### Q4 — Overlay data

Create the chosen loader file in `src/overlays/` and import it from
`src/components/CesiumViewer.tsx` after `createViewer` resolves. **Do not** add
loaders the user did not ask for.

- **GeoJSON** — create `src/overlays/geojson-loader.ts`:
  ```ts
  import * as Cesium from 'cesium';

  export async function loadGeoJson(viewer: Cesium.Viewer, url: string) {
    const dataSource = await Cesium.GeoJsonDataSource.load(url, {
      clampToGround: true,
    });
    viewer.dataSources.add(dataSource);
    return dataSource;
  }
  ```
- **CSV (lat/lon)** — create `src/overlays/csv-loader.ts`:
  ```ts
  import * as Cesium from 'cesium';

  export async function loadCsvPoints(viewer: Cesium.Viewer, url: string) {
    const text = await fetch(url).then((r) => r.text());
    const [header, ...rows] = text.trim().split(/\r?\n/);
    const cols = header.split(',').map((s) => s.trim().toLowerCase());
    const latIdx = cols.indexOf('lat');
    const lonIdx = cols.indexOf('lon');
    if (latIdx < 0 || lonIdx < 0) {
      throw new Error('CSV must have "lat" and "lon" columns');
    }
    for (const row of rows) {
      const cells = row.split(',');
      const lat = Number(cells[latIdx]);
      const lon = Number(cells[lonIdx]);
      if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
      viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat),
        point: { pixelSize: 8, color: Cesium.Color.YELLOW },
      });
    }
  }
  ```
- **KML** — create `src/overlays/kml-loader.ts`:
  ```ts
  import * as Cesium from 'cesium';

  export async function loadKml(viewer: Cesium.Viewer, url: string) {
    const dataSource = await Cesium.KmlDataSource.load(url, {
      camera: viewer.camera,
      canvas: viewer.canvas,
      clampToGround: true,
    });
    viewer.dataSources.add(dataSource);
    return dataSource;
  }
  ```
- **glTF** — create `src/overlays/gltf-loader.ts`:
  ```ts
  import * as Cesium from 'cesium';

  export function loadGltfModel(
    viewer: Cesium.Viewer,
    url: string,
    position: { lat: number; lon: number; alt?: number },
  ) {
    return viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(
        position.lon,
        position.lat,
        position.alt ?? 0,
      ),
      model: { uri: url, scale: 1 },
    });
  }
  ```
- **Just the globe**: skip — make no edits in `src/overlays/`.

For any overlay loader you create, also add a stub data file or a clear comment
in `src/overlays/README.md` showing how to wire it up in
`src/components/CesiumViewer.tsx`. **Do not** invoke the loader with a hardcoded
data path — the user supplies the data.

#### Q5 — UI chrome

Each option creates a new component under `src/components/` and mounts it in
`src/App.tsx`. **Only create what the user asks for.**

- **None** (default): skip.
- **Search box**: create `src/components/SearchBox.tsx`. Use the Cesium
  `Geocoder` widget *only if* the user enables `geocoder: true` in
  `viewer.ts` — otherwise hand-roll an input that calls
  `viewer.camera.flyTo` with user-entered coords.
- **Fly-to buttons**: create `src/components/FlyToButtons.tsx`:
  ```tsx
  import * as Cesium from 'cesium';

  type Props = { viewer: Cesium.Viewer | null };

  const PRESETS = [
    { label: 'NYC',    lat: 40.7128, lon: -74.0060 },
    { label: 'SF',     lat: 37.7749, lon: -122.4194 },
    { label: 'Tokyo',  lat: 35.6762, lon: 139.6503 },
  ];

  export function FlyToButtons({ viewer }: Props) {
    if (!viewer) return null;
    return (
      <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', gap: 8, zIndex: 1 }}>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() =>
              viewer.camera.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, 1500),
                orientation: { pitch: Cesium.Math.toRadians(-45) },
              })
            }
          >
            {p.label}
          </button>
        ))}
      </div>
    );
  }
  ```
  Wiring this in requires lifting the viewer instance out of `CesiumViewer.tsx`
  via `useState` and a callback prop. Do that lift when you add this component.
- **Layer toggle**: create `src/components/LayerToggle.tsx` that toggles
  `tileset.show` for each registered overlay/data source. Same viewer-lift
  pattern as fly-to buttons.

#### Q6 — Framework swap

This is destructive. Confirm with the user before proceeding:

> Switching frameworks regenerates `package.json`, `vite.config.ts`,
> `tsconfig.json`, `index.html`, and the entire `src/` directory. I'll preserve
> `.env`, `README.md`, `CLAUDE.md`, and `src/overlays/`. Continue?

If yes, regenerate the scaffold for the chosen framework, copying the rendering
settings from `src/cesium/viewer.ts` verbatim (those are framework-agnostic).
If unsure, refuse and ask the user to file an issue or do it manually — do not
guess at vanilla HTML or Next.js setup if the user is on a tight budget.

### After applying edits

1. Remove the `// FULLGLOBE_DEFAULT` marker line and the following explanatory
   comment line from `src/cesium/config.ts`.
2. Run `npm run build` and report success or failure to the user. `build` is
   definitive — it catches both type errors and bundling issues. If it fails,
   debug before claiming success.
3. Tell the user which files changed and how to start the dev server
   (`npm run dev`).

## Performance patterns (read this before adding polygons or animations)

The starter ships with **on-demand rendering** turned on in
`src/cesium/viewer.ts`:

```ts
viewer.clock.shouldAnimate = false;
viewer.scene.requestRenderMode = true;
viewer.scene.maximumRenderTimeChange = Infinity;
```

Idle = 0 frames. Camera moves and tile loads trigger renders automatically.
Two implications when adding overlays or custom code:

### Static polygons: plain values or ConstantProperty, never CallbackProperty

`CallbackProperty` is invoked every frame and Cesium assumes the value can
change, so the polygon is **re-tesselated every frame**. For polygons that
don't animate, pass plain values directly:

```ts
viewer.entities.add({
  polygon: {
    hierarchy: Cesium.Cartesian3.fromDegreesArray(coords),
    height: 0,
    extrudedHeight: 50,                            // plain number
    material: Cesium.Color.RED.withAlpha(0.5),     // plain Color
  },
});
```

Or wrap explicitly: `new Cesium.ConstantProperty(50)`. Same effect — Cesium
caches the tesselation.

### Animated polygons: use the `animate` helper, then settle to constants

If a polygon actually animates (grow-in, color pulse, etc.), use the helper at
[`src/cesium/animate.ts`](src/cesium/animate.ts) and **swap back to a
ConstantProperty when the animation finishes** so the polygon stops
re-tesselating:

```ts
import { animate } from '../cesium/animate';

const targetHeight = 80;
let current = 0;
const polygon = viewer.entities.add({
  polygon: {
    hierarchy: Cesium.Cartesian3.fromDegreesArray(coords),
    height: 0,
    extrudedHeight: new Cesium.CallbackProperty(() => current, false),
    material: Cesium.Color.RED.withAlpha(0.5),
  },
}).polygon!;

animate(
  viewer,
  1000,
  (t) => { current = targetHeight * (1 - Math.pow(1 - t, 3)); },
  () => { polygon.extrudedHeight = new Cesium.ConstantProperty(targetHeight); },
);
```

### The two rules

- **Mutate the scene from custom code → call `viewer.scene.requestRender()`.**
  `requestRenderMode` won't redraw on its own. The `animate` helper does this
  for you each tick.
- **A property that has stopped changing → make it a `ConstantProperty`.**
  Otherwise Cesium can't cache the geometry and you pay the per-frame cost
  forever.

The same pattern applies to any RAF-driven thing you write — orbits, fades,
hand-rolled fly-tos.

## Common gotchas (for debugging user issues)

When users report problems, check these first:

- **Blank map, 403s in network tab**: Google Cloud billing is not enabled.
  Most common issue.
- **Tiles fail with referrer error**: API key's HTTP referrer restrictions
  don't include `http://localhost:5173/*`.
- **Env var is undefined in browser**: missing the `VITE_` prefix.
- **Cesium widget/worker 404s in production**: someone bypassed
  `vite-plugin-cesium` (e.g., loading Cesium from a CDN). Use the plugin.
- **`scene.sampleHeightMostDetailed` returns nothing**: globe was hidden
  (`globe.show = false`). Keep it visible.
- **Surprise Google bill**: photoreal billing is per **session**, not per tile.
  Long dev sessions add up. Suggest closing the tab between iterations.

## Things not to do

- Do not strip the Google attribution / credit display. The
  `createGooglePhotorealistic3DTileset` helper handles it; Google's ToS require
  it.
- Do not switch from `vite-plugin-cesium` to a hand-rolled
  `vite-plugin-static-copy` setup.
- Do not load Cesium from a CDN.
- Do not hide the globe.
- Do not commit `.env`.
