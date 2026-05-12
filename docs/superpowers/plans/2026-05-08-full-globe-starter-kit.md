# Full Globe Starter Kit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap a beginner-friendly, runnable Cesium + Google Photorealistic 3D Tiles starter kit (Vite + React + TypeScript) with a CLAUDE.md-driven customization flow that triggers automatically on first interaction.

**Architecture:** Single-page Vite + React + TS app. Cesium viewer creation is isolated in `src/cesium/` with all photoreal rendering settings centralized in one module. A `CLAUDE.md` at the repo root encodes the auto-detection logic, qualifying questions, and a modification map so any Claude Code session opened in a fresh fork can offer to walk the user through customization.

**Tech Stack:** Vite ^5, React ^18, TypeScript ^5, CesiumJS ^1.120, vite-plugin-cesium ^1, npm.

**Spec:** [docs/superpowers/specs/2026-05-08-full-globe-starter-kit-design.md](../specs/2026-05-08-full-globe-starter-kit-design.md)

---

## Notes for the implementing engineer

- The working directory `/Users/mattmazur/Documents/Full Globe Starter Kit/` is **not yet a git repository**. Task 1 initializes it.
- This is a starter-kit/template project. There are **no unit tests** in the deliverable — the user adds tests as they build on top of the kit. Verification at each step is integration-level: `npm install` exits 0, `npm run build` exits 0, file contents match.
- Do **not** strip the Google attribution / credit display — `createGooglePhotorealistic3DTileset` handles it automatically and Google's ToS require it.
- Do **not** hide the globe (`viewer.scene.globe.show` must stay `true`). It is required for `scene.sampleHeightMostDetailed` and other terrain queries the user will likely add later.
- Do **not** load Cesium static assets from a CDN. Use `vite-plugin-cesium`. Hand-rolled `vite-plugin-static-copy` setups are explicitly rejected.
- The `// FULLGLOBE_DEFAULT` marker comment in `src/cesium/config.ts` is **load-bearing** — CLAUDE.md uses it to detect unconfigured state. The customization flow must remove this marker after applying edits.

---

## Task 1: Initialize git repo and package.json

**Files:**
- Create: `.gitignore`
- Create: `package.json`
- Run: `git init`, `npm install`

- [ ] **Step 1: Initialize git repo**

```bash
cd "/Users/mattmazur/Documents/Full Globe Starter Kit"
git init
```

Expected: `Initialized empty Git repository in ...`

- [ ] **Step 2: Create `.gitignore`**

Path: `/Users/mattmazur/Documents/Full Globe Starter Kit/.gitignore`

```
node_modules
dist
.env
.env.local
.DS_Store
*.log
```

- [ ] **Step 3: Create `package.json`**

Path: `/Users/mattmazur/Documents/Full Globe Starter Kit/package.json`

```json
{
  "name": "full-globe-starter-kit",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "cesium": "^1.120.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.6.3",
    "vite": "^5.4.11",
    "vite-plugin-cesium": "^1.2.23"
  }
}
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`
Expected: completes without errors, creates `node_modules/` and `package-lock.json`. Some peer-dep warnings are acceptable; hard failures are not.

- [ ] **Step 5: Commit**

```bash
git add .gitignore package.json package-lock.json
git commit -m "chore: initialize project with Vite + React + Cesium dependencies"
```

---

## Task 2: TypeScript and Vite config

**Files:**
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `.env.example`

- [ ] **Step 1: Create `tsconfig.json`**

Path: `/Users/mattmazur/Documents/Full Globe Starter Kit/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vite/client"]
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 2: Create `tsconfig.node.json`**

Path: `/Users/mattmazur/Documents/Full Globe Starter Kit/tsconfig.node.json`

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 3: Create `vite.config.ts`**

Path: `/Users/mattmazur/Documents/Full Globe Starter Kit/vite.config.ts`

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';

export default defineConfig({
  plugins: [react(), cesium()],
});
```

- [ ] **Step 4: Create `.env.example`**

Path: `/Users/mattmazur/Documents/Full Globe Starter Kit/.env.example`

```
# Google Maps Platform API key with the Map Tiles API enabled and billing turned on.
# Without billing the API silently returns 403 — the most common gotcha.
VITE_GOOGLE_MAPS_API_KEY=

# Cesium Ion access token (free tier is fine). Optional but recommended:
# without it the app still runs but terrain will be flat (no default world terrain).
VITE_CESIUM_ION_TOKEN=
```

- [ ] **Step 5: Commit**

```bash
git add tsconfig.json tsconfig.node.json vite.config.ts .env.example
git commit -m "chore: add TypeScript and Vite configuration"
```

---

## Task 3: Minimal HTML + React entry point

**Files:**
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`

This task gets a runnable React app on screen *before* introducing Cesium, so any Cesium failure in later tasks is unambiguous.

- [ ] **Step 1: Create `index.html`**

Path: `/Users/mattmazur/Documents/Full Globe Starter Kit/index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Full Globe Starter Kit</title>
    <style>
      html, body, #root { margin: 0; padding: 0; height: 100%; width: 100%; overflow: hidden; }
      body { font-family: system-ui, -apple-system, sans-serif; background: #c8dceb; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `src/main.tsx`**

Path: `/Users/mattmazur/Documents/Full Globe Starter Kit/src/main.tsx`

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 3: Create `src/App.tsx` (placeholder, Cesium added in later tasks)**

Path: `/Users/mattmazur/Documents/Full Globe Starter Kit/src/App.tsx`

```tsx
export function App() {
  return (
    <div style={{ height: '100%', width: '100%', display: 'grid', placeItems: 'center' }}>
      <p>Loading globe…</p>
    </div>
  );
}
```

- [ ] **Step 4: Verify build passes**

Run: `npm run build`
Expected: exit code 0, output written to `dist/`. No TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add index.html src/main.tsx src/App.tsx
git commit -m "feat: add minimal React entry point and HTML shell"
```

---

## Task 4: Cesium config module

**Files:**
- Create: `src/cesium/config.ts`

This module centralizes the default camera, env-var reads, and the `FULLGLOBE_DEFAULT` marker that CLAUDE.md uses to detect unconfigured state.

- [ ] **Step 1: Create `src/cesium/config.ts`**

Path: `/Users/mattmazur/Documents/Full Globe Starter Kit/src/cesium/config.ts`

```ts
// FULLGLOBE_DEFAULT — customize via Claude walkthrough or edit directly.
// Removing this marker comment signals that the project has been customized.

export interface CameraDefault {
  /** Latitude in degrees */
  lat: number;
  /** Longitude in degrees */
  lon: number;
  /** Altitude in meters above the ellipsoid */
  alt: number;
  /** Pitch in degrees; -90 looks straight down, 0 looks at the horizon */
  pitchDegrees: number;
}

// NYC — recognizable photoreal landmarks make for a strong first impression.
// Swap this constant (or let Claude swap it via the customization flow) to
// change the location the camera flies to on load.
export const DEFAULT_CAMERA: CameraDefault = {
  lat: 40.7128,
  lon: -74.0060,
  alt: 1500,
  pitchDegrees: -45,
};

// Browser-exposed env vars MUST use the VITE_ prefix or Vite strips them.
// Empty-string fallback for the Ion token is intentional: the app still runs,
// but terrain will be flat. The README explains this tradeoff.
export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';
export const CESIUM_ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN ?? '';
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: exit code 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/cesium/config.ts
git commit -m "feat: add Cesium config module with default camera and env reads"
```

---

## Task 5: Cesium viewer module

**Files:**
- Create: `src/cesium/viewer.ts`

All photoreal rendering settings live in this single module. Every line below is required for the tiles to look correct — do not omit any of the rendering settings.

- [ ] **Step 1: Create `src/cesium/viewer.ts`**

Path: `/Users/mattmazur/Documents/Full Globe Starter Kit/src/cesium/viewer.ts`

```ts
import * as Cesium from 'cesium';
import { CESIUM_ION_TOKEN, DEFAULT_CAMERA, GOOGLE_MAPS_API_KEY } from './config';

// Set the Ion token at module init. Empty string is an explicit, valid fallback:
// the viewer still constructs, just without Ion-hosted terrain/imagery.
Cesium.Ion.defaultAccessToken = CESIUM_ION_TOKEN;

export async function createViewer(container: HTMLDivElement): Promise<Cesium.Viewer> {
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

  // Photoreal-friendly rendering. Without these the Google tiles look
  // oversaturated and washed out.
  viewer.scene.highDynamicRange = true;
  viewer.scene.postProcessStages.tonemapper = Cesium.Tonemapper.PBR_NEUTRAL;
  viewer.scene.skyBox.show = false;
  viewer.scene.sun.show = false;
  viewer.scene.moon.show = false;
  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#c8dceb');

  // Globe stays visible — required for scene.sampleHeightMostDetailed and
  // other terrain queries beginners will want later.
  viewer.scene.globe.show = true;

  // Photoreal tiles via the official helper. The helper handles attribution
  // and session tokens automatically — do not strip credit display.
  if (!GOOGLE_MAPS_API_KEY) {
    // eslint-disable-next-line no-console
    console.warn(
      '[full-globe] VITE_GOOGLE_MAPS_API_KEY is empty. Photoreal 3D Tiles will not load. ' +
        'Add the key to .env (see .env.example) and restart the dev server.',
    );
  } else {
    const tileset = await Cesium.createGooglePhotorealistic3DTileset({
      key: GOOGLE_MAPS_API_KEY,
    });
    viewer.scene.primitives.add(tileset);
  }

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

  return viewer;
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: exit code 0, no errors. If Cesium types complain, double-check that `cesium` is installed and `@types/cesium` is NOT installed (Cesium ships its own `.d.ts` since v1.95).

- [ ] **Step 3: Commit**

```bash
git add src/cesium/viewer.ts
git commit -m "feat: add Cesium viewer with photoreal 3D tiles and rendering settings"
```

---

## Task 6: React wrapper and App integration

**Files:**
- Create: `src/components/CesiumViewer.tsx`
- Modify: `src/App.tsx` (replace placeholder)

- [ ] **Step 1: Create `src/components/CesiumViewer.tsx`**

Path: `/Users/mattmazur/Documents/Full Globe Starter Kit/src/components/CesiumViewer.tsx`

```tsx
import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import { createViewer } from '../cesium/viewer';

export function CesiumViewer() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let viewer: Cesium.Viewer | null = null;
    let cancelled = false;

    createViewer(container).then((v) => {
      if (cancelled) {
        v.destroy();
        return;
      }
      viewer = v;
    });

    return () => {
      cancelled = true;
      if (viewer && !viewer.isDestroyed()) viewer.destroy();
    };
  }, []);

  return <div ref={containerRef} style={{ height: '100%', width: '100%' }} />;
}
```

- [ ] **Step 2: Replace `src/App.tsx`**

Path: `/Users/mattmazur/Documents/Full Globe Starter Kit/src/App.tsx`

```tsx
import { CesiumViewer } from './components/CesiumViewer';

export function App() {
  return <CesiumViewer />;
}
```

- [ ] **Step 3: Verify build passes**

Run: `npm run build`
Expected: exit code 0. The Cesium asset bundle will be large (tens of MB) — this is normal.

- [ ] **Step 4: Commit**

```bash
git add src/components/CesiumViewer.tsx src/App.tsx
git commit -m "feat: mount Cesium viewer through React wrapper"
```

---

## Task 7: Overlays stub directory

**Files:**
- Create: `src/overlays/.gitkeep`
- Create: `src/overlays/README.md`

- [ ] **Step 1: Create `src/overlays/.gitkeep`**

Path: `/Users/mattmazur/Documents/Full Globe Starter Kit/src/overlays/.gitkeep`

(empty file)

- [ ] **Step 2: Create `src/overlays/README.md`**

Path: `/Users/mattmazur/Documents/Full Globe Starter Kit/src/overlays/README.md`

```markdown
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
```

- [ ] **Step 3: Commit**

```bash
git add src/overlays/.gitkeep src/overlays/README.md
git commit -m "feat: add overlays directory stub with extension guide"
```

---

## Task 8: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create `README.md`**

Path: `/Users/mattmazur/Documents/Full Globe Starter Kit/README.md`

```markdown
# Full Globe Starter Kit

A beginner-friendly, production-clean starter for **CesiumJS + Google
Photorealistic 3D Tiles**, built with Vite + React + TypeScript.

Clone, add two API keys, run `npm run dev`, see photoreal NYC.

## Quick start

```bash
git clone <your-fork-url> my-globe
cd my-globe
cp .env.example .env
# Open .env and paste your two API keys (see below)
npm install
npm run dev
```

Open http://localhost:5173 — you should see Manhattan from a 1500 m altitude,
pitched -45° so the buildings are visible.

## Get a Google Maps Platform API key

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project.
3. Enable the **Map Tiles API** for that project.
4. **Turn on billing.** Without billing, the API silently returns 403 and you
   will see no tiles. This is the single most common gotcha.
5. Create an API key under "Credentials" and paste it into `.env` as
   `VITE_GOOGLE_MAPS_API_KEY`.

### HTTP referrer restriction note

If you restrict your API key by HTTP referrer (recommended for production), you
**must** allow `http://localhost:5173/*` for local development with Vite, or
tile requests will fail.

## Get a Cesium Ion access token

1. Sign up at [cesium.com/ion](https://cesium.com/ion/) — the free tier is fine.
2. Create a token under "Access Tokens".
3. Paste it into `.env` as `VITE_CESIUM_ION_TOKEN`.

The Ion token is **optional**: the app still runs without it, but terrain will
be flat (no default world terrain) and you cannot use any Ion-hosted assets.

## Run dev / build

```bash
npm run dev       # start the Vite dev server (default port 5173)
npm run build     # type-check and produce a production bundle in dist/
npm run preview   # serve the production bundle locally
npm run typecheck # tsc --noEmit
```

## Where to add overlays

See [src/overlays/README.md](src/overlays/README.md) for the documented
extension point for GeoJSON, CSV, KML, and glTF data.

## Customize via Claude Code

Open this repo in [Claude Code](https://claude.ai/code). On your first message,
Claude will detect the unconfigured state and offer to walk you through ~6
customization questions (camera location, overlay format, optional UI, etc.)
and apply the edits for you.

If you'd rather configure manually, just edit `src/cesium/config.ts` directly.

## Common gotchas

| Symptom | Likely cause |
|---|---|
| Map area is blank, network shows 403s on `tile.googleapis.com` | Billing not enabled on your Google Cloud project |
| Tiles fail with referrer error | Your API key's HTTP referrer restrictions don't include `http://localhost:5173/*` |
| Surprisingly large Google bill | Photoreal billing is per **session**, not per tile — long dev sessions accumulate. Close the tab when you're done iterating. |
| Env var is `undefined` in the browser | Missing the `VITE_` prefix — Vite only exposes vars that start with `VITE_` |
| Cesium widgets/workers 404 in production | You bypassed `vite-plugin-cesium`. The plugin handles static asset copying — don't load Cesium from a CDN. |
| `scene.sampleHeightMostDetailed` returns nothing | You hid the globe (`globe.show = false`). Keep it visible — terrain queries depend on it. |

## Stack

- [CesiumJS](https://cesium.com/platform/cesiumjs/) ^1.120 (the photoreal helper requires ≥1.111)
- [vite-plugin-cesium](https://github.com/nshen/vite-plugin-cesium) for static asset handling
- [Vite](https://vitejs.dev/) ^5
- [React](https://react.dev/) ^18
- [TypeScript](https://www.typescriptlang.org/) ^5
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup guide and gotchas"
```

---

## Task 9: CLAUDE.md (the customization flow)

**Files:**
- Create: `CLAUDE.md`

This is the load-bearing file that drives auto-detection, the qualifying-question batch, and the modification map. The detection logic depends on the `// FULLGLOBE_DEFAULT` marker in `src/cesium/config.ts` (Task 4) — keep them consistent.

- [ ] **Step 1: Create `CLAUDE.md`**

Path: `/Users/mattmazur/Documents/Full Globe Starter Kit/CLAUDE.md`

````markdown
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
  import { useEffect, useState } from 'react';
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
````

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "feat: add CLAUDE.md with auto-detect customization flow"
```

---

## Task 10: Final integration verification

**Files:**
- None (verification only)

- [ ] **Step 1: Verify `npm run build` succeeds from a clean state**

Run:
```bash
rm -rf node_modules dist
npm install
npm run build
```

Expected: `npm install` exits 0 (peer-dep warnings okay), `npm run build` exits 0, `dist/` is created with `index.html` and a Cesium asset bundle. Bundle size will be tens of MB — that's expected.

- [ ] **Step 2: Smoke-test the dev server**

Run: `npm run dev`
Expected: Vite prints `Local: http://localhost:5173/` within a few seconds without errors. Stop the server with `Ctrl+C`.

If the user has filled in `VITE_GOOGLE_MAPS_API_KEY`, opening the URL in a browser should show photoreal NYC at -45° pitch. Without the key, the page renders but the console shows the warning from `viewer.ts` and no tiles load — both are correct behaviors.

- [ ] **Step 3: Confirm `// FULLGLOBE_DEFAULT` marker is present**

Run: `grep -n 'FULLGLOBE_DEFAULT' src/cesium/config.ts`
Expected: matches line 1 (or near top) of `src/cesium/config.ts`. This marker drives CLAUDE.md's first-run detection — if it's missing, the customization flow won't trigger for fresh forks.

- [ ] **Step 4: Confirm `.env` is git-ignored**

Run: `git check-ignore -v .env`
Expected: matches a line in `.gitignore`. (The file does not need to exist for `check-ignore` to confirm the rule.)

- [ ] **Step 5: Confirm tree layout**

Run: `git ls-files`
Expected output (order may vary):
```
.env.example
.gitignore
CLAUDE.md
README.md
docs/superpowers/plans/2026-05-08-full-globe-starter-kit.md
docs/superpowers/specs/2026-05-08-full-globe-starter-kit-design.md
index.html
package-lock.json
package.json
src/App.tsx
src/cesium/config.ts
src/cesium/viewer.ts
src/components/CesiumViewer.tsx
src/main.tsx
src/overlays/.gitkeep
src/overlays/README.md
tsconfig.json
tsconfig.node.json
vite.config.ts
```

- [ ] **Step 6: Final commit if anything was fixed during verification**

If steps 1–5 surfaced no issues, skip. Otherwise:

```bash
git add -A
git commit -m "fix: address verification issues from final integration check"
```

---

## Done

The starter kit is now:

- Runnable out of the box (clone → `.env` → `npm install` → `npm run dev`)
- TypeScript with full Cesium API autocomplete
- Photoreal-tile-correct (HDR, PBR_NEUTRAL tonemapper, sky/sun/moon hidden, globe visible, attribution preserved)
- Self-customizing via Claude Code (auto-detect-and-offer on first message)

Hand off to the user with a brief summary of what was built and a reminder that they need to fill in `.env` before `npm run dev` will show photoreal tiles.
