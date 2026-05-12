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
