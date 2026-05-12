# Full Globe Starter Kit — Design Spec

**Date:** 2026-05-08
**Status:** Approved, ready for implementation planning

## Goal

Bootstrap a beginner-friendly, production-clean starter kit for **CesiumJS + Google Photorealistic 3D Tiles**. The repo must:

1. Run out of the box after a user clones, adds API keys to `.env`, and runs `npm run dev` — showing photoreal NYC.
2. Self-customize via a Claude Code walkthrough: when a user opens this repo in Claude Code for the first time, Claude detects unconfigured state and proactively offers to walk through 5–8 qualifying questions, then applies surgical edits to tailor the project.

Two audiences, one repo: humans following the README, and humans who want Claude to set it up for them.

## Stack & Dependencies

- **Build tool:** Vite (default, recommended over Next.js / vanilla / CRA for new Cesium users)
- **Framework:** React 18+
- **Language:** TypeScript — picked specifically because Cesium ships its own `.d.ts` and IDE autocomplete on `viewer.scene.<dot>` is one of the best discovery aids for new Cesium users
- **CesiumJS:** `^1.120` (the `createGooglePhotorealistic3DTileset` helper requires `>=1.111`)
- **Cesium asset handling:** `vite-plugin-cesium` — *not* a hand-rolled `vite-plugin-static-copy` setup
- **Package manager:** npm (lowest barrier; user can swap)

## Repo Layout

```
.
├── CLAUDE.md                     # the customization flow + gotchas reference
├── README.md                     # human-facing setup guide
├── .env.example                  # VITE_GOOGLE_MAPS_API_KEY, VITE_CESIUM_ION_TOKEN
├── .gitignore                    # excludes .env, node_modules, dist
├── package.json
├── tsconfig.json
├── vite.config.ts                # vite-plugin-cesium wired in
├── index.html
└── src/
    ├── main.tsx                  # React mount point
    ├── App.tsx                   # mounts <CesiumViewer />
    ├── cesium/
    │   ├── viewer.ts             # createViewer() — all photoreal setup lives here
    │   └── config.ts             # default camera, env reads, Ion token init
    ├── components/
    │   └── CesiumViewer.tsx      # React wrapper around viewer.ts
    └── overlays/
        ├── README.md             # "add GeoJSON/CSV/KML/glTF here later"
        └── .gitkeep
```

## Ship Defaults

The repo runs as-is with these baked-in defaults. Customization questions modify them.

| Default | Value | Rationale |
|---|---|---|
| Camera | NYC: lat `40.7128`, lon `-74.0060`, alt `1500m`, pitch `-45°` | Most-recognizable photoreal landmarks for first-impression "wow" |
| UI chrome | None (clean canvas, no search/fly-to/toggle) | Beginner-friendly: focus on the globe |
| Default widgets | All disabled (timeline, animation, baseLayerPicker, geocoder, homeButton, sceneModePicker, navigationHelpButton, infoBox, selectionIndicator) | Clean photoreal canvas |
| Globe | `viewer.scene.globe.show = true` | **Must stay visible** — `scene.sampleHeightMostDetailed` and other height/terrain queries depend on it |
| Overlays | Empty `src/overlays/` directory with stub README | Documented extension point |
| Ion token | Defaults to `''` if env var unset | Allows app to run; README warns terrain will be flat |

## Required Cesium Setup (in `src/cesium/viewer.ts`)

This is the load-bearing rendering setup. All of these are required for photoreal tiles to look correct.

```ts
// 1. Init Ion token at module load (empty string is explicit fallback)
Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN ?? '';

// 2. Viewer with all default widgets disabled
const viewer = new Cesium.Viewer(container, {
  timeline: false, animation: false, baseLayerPicker: false,
  geocoder: false, homeButton: false, sceneModePicker: false,
  navigationHelpButton: false, infoBox: false, selectionIndicator: false,
});

// 3. Photoreal-friendly rendering — without these, tiles look washed-out
viewer.scene.highDynamicRange = true;
viewer.scene.postProcessStages.tonemapper = Cesium.Tonemapper.PBR_NEUTRAL;
viewer.scene.skyBox.show = false;
viewer.scene.sun.show = false;
viewer.scene.moon.show = false;
viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#c8dceb');

// 4. Photoreal tileset via official helper (handles attribution + session tokens)
const tileset = await Cesium.createGooglePhotorealistic3DTileset({
  key: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
});
viewer.scene.primitives.add(tileset);

// 5. Fly to default camera with -45° pitch so buildings are visible
viewer.camera.flyTo({
  destination: Cesium.Cartesian3.fromDegrees(lon, lat, alt),
  orientation: { pitch: Cesium.Math.toRadians(-45) },
});
```

**Non-negotiables:**
- Use `createGooglePhotorealistic3DTileset` helper, not a manual URL
- Do not strip credit display (helper handles attribution; required by Google ToS)
- Do not hide the globe (`globe.show` stays `true`)
- Cesium static assets come from `vite-plugin-cesium`, not CDN

## Environment Variables

`.env.example` ships with:

```
VITE_GOOGLE_MAPS_API_KEY=
VITE_CESIUM_ION_TOKEN=
```

`.gitignore` excludes `.env`. Both keys must use the `VITE_` prefix (browser-exposed).

## CLAUDE.md (Customization Flow)

The `CLAUDE.md` instructs any Claude Code session opened in this repo to:

### 1. Detect fresh state
On the first user message, check if the project is unconfigured. Signals:
- `.env` does not exist (only `.env.example`), **OR**
- `src/cesium/config.ts` still contains the marker comment `// FULLGLOBE_DEFAULT — customize via Claude walkthrough or edit directly`

If fresh, proactively offer: *"Looks like this is a fresh fork of the Full Globe Starter Kit. Want me to walk through ~6 quick questions to customize it for you?"*

If the user declines or says "not yet," do not push. They can ask later.

### 2. Ask the qualifying questions
Ask in a single batch (per user's instruction in original brief):

1. **Google Maps Platform API key** — do you have one yet? *(If no, link to instructions: enable Map Tiles API + billing.)*
2. **Cesium Ion access token** — have one? *(If no, offer to skip and warn the terrain will be flat without it. Provide signup link.)*
3. **Initial camera location** — NYC (default), SF, Tokyo, or custom lat/lon/altitude?
4. **Overlay data** — GeoJSON points/polygons, CSV of lat/lon, KML, glTF models, or just the globe for now?
5. **UI chrome** — none (default), search box, fly-to buttons, layer toggle, or all of the above?
6. **Framework swap** — keep Vite + React (recommended), migrate to vanilla HTML/JS, or migrate to Next.js? *(Rare; supported but warns full rescaffold required.)*

### 3. Apply edits via "modification map"
CLAUDE.md contains a structured map: each answer maps to specific file edits. Examples:

- Camera = SF → edit `src/cesium/config.ts` `DEFAULT_CAMERA` constant to `{ lat: 37.7749, lon: -122.4194, alt: 1500, pitch: -45 }`
- Overlay = GeoJSON → create `src/overlays/geojson-loader.ts` from documented snippet, add import to `App.tsx`
- UI = fly-to buttons → create `src/components/FlyToButtons.tsx` from documented snippet, mount in `App.tsx`
- Framework = Next.js → warn user this regenerates the project; preserve `.env`, `README.md`, `CLAUDE.md`, and `src/overlays/`; rescaffold the rest

After edits, remove the `// FULLGLOBE_DEFAULT` marker so the customization flow doesn't re-trigger.

### 4. Verify
After applying edits, run `npm run build` and report success/failure to the user. `build` is definitive — it catches both type errors and bundling issues that `tsc --noEmit` would miss. If the build fails, debug before claiming success.

### 5. Provide gotchas reference
CLAUDE.md also contains the full gotchas list (see README section below) so future Claude sessions can debug user issues without re-deriving them.

## README.md Contents

Human-facing setup guide. Sections:

1. **What this is** — one paragraph: photoreal globe in your browser, beginner-friendly Cesium starter
2. **Quick start** — clone, `cp .env.example .env`, fill keys, `npm install`, `npm run dev`
3. **Get a Google Maps API key**
   - Go to Google Cloud Console
   - Enable **Map Tiles API**
   - **Turn on billing** (the API silently 403s without it — single most common gotcha)
   - Create API key, paste into `.env` as `VITE_GOOGLE_MAPS_API_KEY`
4. **Get a Cesium Ion token**
   - cesium.com/ion → free tier is fine
   - Paste into `.env` as `VITE_CESIUM_ION_TOKEN`
   - Without it: app still runs, but terrain is flat (no default world terrain)
5. **HTTP referrer restriction note** — if you restrict the Google key by referrer, you must allow `http://localhost:5173/*` (Vite default port) or dev breaks
6. **Run dev / build** — `npm run dev`, `npm run build`, `npm run preview`
7. **Where to add overlays** — point to `src/overlays/` and its README stub
8. **Customize via Claude Code** — open the repo in Claude Code; it will offer to walk you through customization
9. **Common gotchas**
   - **Billing not enabled** on Google Cloud → silent 403s
   - **Referrer restriction** doesn't allow your dev port → tile requests fail
   - **Photoreal billing is per-session, not per-tile** → long dev sessions add up; close the tab when done
   - **`VITE_` prefix required** for any env var that needs to reach the browser
   - **Cesium static assets must come from `vite-plugin-cesium`**, not a CDN — otherwise widgets/workers break
   - **Don't hide the globe** — `scene.sampleHeightMostDetailed` and other terrain queries depend on it being visible

## What's NOT in scope

Per YAGNI, the starter kit explicitly does **not** include:

- Authentication / user accounts
- Server-side rendering (would conflict with Cesium's browser-only assets)
- Tests for the scaffold itself (it's a template; user adds tests as they build)
- Multiple framework templates pre-shipped (we ship one default; Claude rescaffolds on request)
- A pre-built UI library — the UI options in the customization flow are minimal hand-rolled components
- CI/CD config — user adds when they're ready to deploy

## Success Criteria

1. User clones the repo, adds two API keys to `.env`, runs `npm run dev`, and sees photoreal NYC at -45° pitch within 30 seconds.
2. User opens repo in Claude Code on a fresh clone; Claude proactively offers customization walkthrough on first message.
3. After answering 6 questions, Claude applies edits and `npm run build` succeeds.
4. README answers all setup questions a beginner will hit, including all five common gotchas.
5. No hidden globe, no manual photoreal URL, no CDN-loaded Cesium assets, no stripped attribution.
