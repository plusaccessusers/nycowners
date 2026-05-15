# NYC Top-50 Landowners Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an offline data-prep pipeline + Cesium runtime overlay to the existing Full Globe Starter Kit so users can see, toggle, and inspect parcels owned by NYC's top 50 landowners (by `lotarea`) over the Google photoreal 3D tiles.

**Architecture:** Two phases with no shared runtime state — a Node script aggregates MapPLUTO into `public/data/owners.geojson` + `public/data/owners-index.json`; a runtime `OwnersOverlay` factory loads those files into batched Cesium primitives (2 per owner) and exposes a small typed API consumed by a React sidebar and HTML waymarker.

**Tech Stack:** Vite + React 18 + TypeScript, Cesium 1.120, `stream-json` for streaming GeoJSON parse, `vitest` for unit tests on pure helpers.

**Reference spec:** [docs/superpowers/specs/2026-05-12-nyc-top-50-landowners-design.md](../specs/2026-05-12-nyc-top-50-landowners-design.md)

**Required reading before starting:** [CLAUDE.md](../../../CLAUDE.md) sections "Performance patterns" and "Things not to do". The on-demand rendering rules (`viewer.scene.requestRender()` after any custom scene mutation; never use `CallbackProperty` for static values) are load-bearing for this work.

---

## File Plan

**Created:**
- `scripts/palette.ts` — 50-entry Glasbey color palette (constant array)
- `scripts/prepare-data.ts` — Node script: stream MapPLUTO → write derived JSON
- `scripts/lib/aggregate.ts` — pure helpers (aggregation, palette assignment, height rule, altitude heuristic) — tested
- `scripts/lib/aggregate.test.ts` — unit tests for the above
- `src/types/owners.ts` — `OwnerIndexEntry`, `ParcelInfo`, `OwnersIndex`, `OwnersOverlay` types
- `src/overlays/owners-overlay.ts` — runtime factory + `OwnersOverlay` API
- `src/components/Sidebar.tsx` — left-side panel: sort, search, checkbox list, fly-to
- `src/components/Waymarker.tsx` — HTML overlay positioned over active parcel
- `public/data/owners.geojson` — generated (committed)
- `public/data/owners-index.json` — generated (committed)
- `vitest.config.ts` — minimal vitest config (Node environment, only `scripts/**`)

**Modified:**
- `package.json` — add deps (`stream-json`, `vitest`, `@types/node`), add `prepare-data` and `test` scripts
- `.gitignore` — ignore `data-raw/`
- `src/components/CesiumViewer.tsx` — accept `onReady(viewer)` prop, expose overlay handle
- `src/App.tsx` — layout root; holds viewer + overlay state, renders Sidebar and Waymarker
- `src/overlays/README.md` — document the owners overlay

**Untouched:** `src/cesium/viewer.ts`, `src/cesium/config.ts`, `src/cesium/animate.ts`, `vite.config.ts`, `tsconfig.json`, `index.html`.

---

## Testing Philosophy

The bulk of this feature is **visual + Cesium integration**, neither of which is productively unit-tested. The plan applies TDD to *pure logic* (data prep helpers; runtime altitude/height math) and **manual verification** to UI/rendering work. Each Stage-2 task includes explicit `npm run build` and dev-server visual checks. Do not skip them — they are the verification for that task.

**Per the user's POC-first preference (see MEMORY.md):** do not add entity resolution, fuzzy matching, or research-based aliasing. Owner strings are raw PLUTO `ownername`.

**Per the user's visual-companion preference (see MEMORY.md):** when visually verifying Stage 2, first toggle Google tiles off (or check polygons in isolation) before checking the layered look. Polygons should look clean and correct standalone.

---

## Stage 1 — Offline Data Prep

### Task 1.1: Unpack MapPLUTO shapefile → GeoJSON, gitignore the raw data

**Background:** NYC DCP only publishes MapPLUTO as Shapefile / File Geodatabase, not GeoJSON. The user has already downloaded the **clipped** shapefile zip (MapPLUTO 25v3.1, ~286 MB) and the controller has copied it into the worktree at `data-raw/nyc_mappluto.zip`. This task unpacks it and converts to GeoJSON via `ogr2ogr` (GDAL is installed locally at `/opt/homebrew/bin/ogr2ogr`).

**Files:**
- Modify: `.gitignore`
- Use: `data-raw/nyc_mappluto.zip` (pre-staged by controller)
- Create: `data-raw/MapPLUTO.geojson` (gitignored)

- [ ] **Step 1: Verify the zip is present**

Run: `ls -lh data-raw/nyc_mappluto.zip`
Expected: file exists, ~286 MB. If missing, stop and report BLOCKED — the controller staged this file; if it's gone, something has been lost.

- [ ] **Step 2: Append `data-raw/` to `.gitignore`**

Open `.gitignore` and add a new line at the bottom:

```
data-raw/
```

- [ ] **Step 3: Inspect the zip contents (for confidence, no extraction yet)**

Run: `unzip -l data-raw/nyc_mappluto.zip | head -25`

Expected entries include both `MapPLUTO.{shp,dbf,shx,prj,cpg}` (clipped) and `MapPLUTO_UNCLIPPED.{shp,...}` (unclipped). We want the **clipped** set.

- [ ] **Step 4: Extract only the clipped shapefile components**

Run:

```bash
unzip -o data-raw/nyc_mappluto.zip 'MapPLUTO.shp' 'MapPLUTO.dbf' 'MapPLUTO.shx' 'MapPLUTO.prj' 'MapPLUTO.cpg' -d data-raw/
ls -lh data-raw/MapPLUTO.*
```

Expected: 5 files at `data-raw/MapPLUTO.{shp,dbf,shx,prj,cpg}`. `.dbf` is ~940 MB.

- [ ] **Step 5: Convert to GeoJSON in WGS84**

MapPLUTO ships in NY State Plane (NAD83, EPSG:2263). The Cesium runtime expects WGS84 lon/lat. Reproject during the conversion:

```bash
ogr2ogr -f GeoJSON \
  -t_srs EPSG:4326 \
  -lco RFC7946=NO \
  data-raw/MapPLUTO.geojson \
  data-raw/MapPLUTO.shp
```

`-lco RFC7946=NO` disables the strict RFC 7946 right-hand-rule rewinding (faster, and Cesium tolerates either winding).

Expected: command exits 0; may take 2–6 minutes; emits a few non-fatal warnings about field-name truncation (Shapefile DBF has a 10-char column-name limit).

- [ ] **Step 6: Sanity-check the GeoJSON**

```bash
ls -lh data-raw/MapPLUTO.geojson
head -c 400 data-raw/MapPLUTO.geojson
```

Expected:
- File size between 1.5 GB and 4 GB (GeoJSON is verbose vs binary shapefile — this is normal).
- Starts with `{"type":"FeatureCollection",` and contains `"features":[`.

If the file is implausibly small (< 200 MB) or the header is missing the expected tokens, ogr2ogr failed silently — stop and report BLOCKED.

- [ ] **Step 7: Probe the property names**

Shapefile DBF column names are truncated to 10 characters, so some MapPLUTO fields may appear under shorter names in the GeoJSON. Use `ogrinfo` (ships with GDAL) to list the schema without parsing the huge GeoJSON:

```bash
ogrinfo -so data-raw/MapPLUTO.shp MapPLUTO | grep -E '^[A-Za-z]+: ' | head -100
```

Expected output: a list like `OwnerName: String (10.0)`, `BBL: Real (19.0)`, `Address: String (39.0)`, `NumFloors: Real (24.6)`, `YearBuilt: Integer (4.0)`, `LotArea: Real (24.6)`, `Latitude: Real (24.15)`, `Longitude: Real (24.15)`, etc.

**Capture the exact case-sensitive field names** (e.g., is it `OwnerName` or `ownername`?) and **flag any column whose required token is missing or differently spelled** in your report. Task 1.5 needs the exact names to read the GeoJSON properties correctly. Common things to confirm:

- Owner field (expected: `OwnerName` or `ownername`)
- BBL field
- Address field
- Number-of-floors field (expected: `NumFloors`)
- Year-built field (expected: `YearBuilt`)
- Lot area field (expected: `LotArea`)
- Latitude / Longitude fields

In your final report, paste the actual field names verbatim. If any required field is missing, report BLOCKED.

- [ ] **Step 8: Commit the gitignore change only**

```bash
git add .gitignore
git commit -m "chore: ignore data-raw/ (MapPLUTO source + derived geojson)"
```

`data-raw/MapPLUTO.geojson`, `data-raw/MapPLUTO.shp`, and `data-raw/nyc_mappluto.zip` must NOT appear in `git status` after this commit. Verify with `git status`.

---

### Task 1.2: Add dependencies and test infrastructure

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install runtime + dev dependencies**

Run:

```bash
npm install --save-dev stream-json @types/node vitest
```

This adds `stream-json` (streaming JSON parser, no native deps), `@types/node` (for the Node script), and `vitest` (test runner — shares Vite config, fastest path).

- [ ] **Step 2: Add scripts to `package.json`**

Modify the `"scripts"` block in `package.json` so it reads exactly:

```json
"scripts": {
  "dev": "vite",
  "build": "tsc --noEmit && vite build",
  "preview": "vite preview",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "prepare-data": "tsx scripts/prepare-data.ts"
}
```

- [ ] **Step 3: Install `tsx` to run the TypeScript script**

Run:

```bash
npm install --save-dev tsx
```

- [ ] **Step 4: Create `vitest.config.ts` at repo root**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/**/*.test.ts'],
  },
});
```

The scope is restricted to `scripts/**` so we don't accidentally pick up future React tests with the wrong environment.

- [ ] **Step 5: Verify the test runner boots**

Run: `npm test`
Expected: vitest exits successfully reporting "No test files found" (we haven't written any yet). If it errors instead, fix before continuing.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add stream-json, vitest, tsx for data prep pipeline"
```

---

### Task 1.3: Glasbey color palette

**Files:**
- Create: `scripts/palette.ts`

- [ ] **Step 1: Create the palette file with 50 entries**

```ts
// scripts/palette.ts
//
// Glasbey-style maximally-distinguishable palette, 50 colors.
// Source: https://github.com/glasbey-colors (CC0).
// Index N (0-based) is assigned to the N+1-ranked owner.
export const PALETTE_50: readonly string[] = [
  '#E63946', '#1D3557', '#F4A261', '#2A9D8F', '#E76F51',
  '#A8DADC', '#457B9D', '#F1FA8C', '#B5179E', '#7209B7',
  '#3A86FF', '#FB5607', '#FFBE0B', '#06D6A0', '#8338EC',
  '#FF006E', '#118AB2', '#073B4C', '#EF476F', '#FFD166',
  '#26547C', '#06A77D', '#D62246', '#4A4E69', '#9A8C98',
  '#C9ADA7', '#22223B', '#4361EE', '#3F37C9', '#480CA8',
  '#560BAD', '#00BBF9', '#F72585', '#7B2CBF', '#5A189A',
  '#3C096C', '#240046', '#FFD60A', '#FFC300', '#FF8500',
  '#FF6D00', '#FF5400', '#FF0054', '#9E0059', '#390099',
  '#8AC926', '#52B788', '#2D6A4F', '#1B4332', '#081C15',
] as const;

if (PALETTE_50.length !== 50) {
  throw new Error(`PALETTE_50 must have 50 entries, has ${PALETTE_50.length}`);
}
```

The runtime guard catches accidental edits that change the length.

- [ ] **Step 2: Verify the file parses**

Run: `npx tsc --noEmit scripts/palette.ts`
Expected: no output (success).

- [ ] **Step 3: Commit**

```bash
git add scripts/palette.ts
git commit -m "feat: add 50-color glasbey palette for owner visualization"
```

---

### Task 1.4: Pure helpers — types, height rule, altitude heuristic

**Files:**
- Create: `scripts/lib/aggregate.ts`
- Create: `scripts/lib/aggregate.test.ts`

- [ ] **Step 1: Write the failing test file**

```ts
// scripts/lib/aggregate.test.ts
import { describe, it, expect } from 'vitest';
import {
  extrudedHeightMeters,
  flyToAltitudeMeters,
  aggregateOwners,
  type RawParcel,
} from './aggregate';

describe('extrudedHeightMeters', () => {
  it('multiplies floors by 3.66', () => {
    expect(extrudedHeightMeters(10)).toBeCloseTo(36.6, 5);
  });
  it('defaults to 5 m when floors is 0', () => {
    expect(extrudedHeightMeters(0)).toBe(5);
  });
  it('defaults to 5 m when floors is null', () => {
    expect(extrudedHeightMeters(null)).toBe(5);
  });
});

describe('flyToAltitudeMeters', () => {
  it('clamps tiny lots up to the 400 m floor', () => {
    expect(flyToAltitudeMeters(100)).toBe(400);
  });
  it('clamps superblocks down to the 1500 m ceiling', () => {
    expect(flyToAltitudeMeters(10_000_000)).toBe(1500);
  });
  it('scales mid-sized lots as sqrt(area_sqm) * 4', () => {
    // 10_000 sqft = 929 sqm, sqrt(929) ≈ 30.48, * 4 ≈ 121.9 → clamps to 400
    expect(flyToAltitudeMeters(10_000)).toBe(400);
    // 1_000_000 sqft ≈ 92_900 sqm, sqrt ≈ 304.8, *4 ≈ 1219 (in range)
    expect(flyToAltitudeMeters(1_000_000)).toBeCloseTo(1219.4, 0);
  });
});

describe('aggregateOwners', () => {
  const parcels: RawParcel[] = [
    { ownername: 'NYCHA', bbl: '1', address: 'A', numfloors: 2, yearbuilt: 1960, lotarea: 100, lat: 0, lon: 0, geometry: {} as any },
    { ownername: 'NYCHA', bbl: '2', address: 'B', numfloors: 5, yearbuilt: 1965, lotarea: 500, lat: 0, lon: 0, geometry: {} as any },
    { ownername: 'TRINITY', bbl: '3', address: 'C', numfloors: 1, yearbuilt: 1900, lotarea: 300, lat: 0, lon: 0, geometry: {} as any },
    { ownername: 'SMALL', bbl: '4', address: 'D', numfloors: 1, yearbuilt: 2000, lotarea: 50, lat: 0, lon: 0, geometry: {} as any },
  ];

  it('ranks owners by total lotarea descending', () => {
    const { ranked } = aggregateOwners(parcels, 10);
    expect(ranked.map((r) => r.ownername)).toEqual(['NYCHA', 'TRINITY', 'SMALL']);
    expect(ranked[0].total_lotarea_sqft).toBe(600);
    expect(ranked[0].parcel_count).toBe(2);
  });

  it('slices to the requested top-N', () => {
    const { ranked } = aggregateOwners(parcels, 2);
    expect(ranked.map((r) => r.ownername)).toEqual(['NYCHA', 'TRINITY']);
  });

  it('identifies the largest parcel for each owner', () => {
    const { ranked } = aggregateOwners(parcels, 10);
    expect(ranked[0].largest_parcel.bbl).toBe('2');
    expect(ranked[0].largest_parcel.lotarea_sqft).toBe(500);
  });

  it('assigns palette colors by rank (#E63946 to rank 1)', () => {
    const { ranked } = aggregateOwners(parcels, 10);
    expect(ranked[0].color).toBe('#E63946');
    expect(ranked[1].color).toBe('#1D3557');
  });

  it('returns the set of top-N ownernames for downstream filtering', () => {
    const { topOwnerNames } = aggregateOwners(parcels, 2);
    expect(topOwnerNames.has('NYCHA')).toBe(true);
    expect(topOwnerNames.has('TRINITY')).toBe(true);
    expect(topOwnerNames.has('SMALL')).toBe(false);
  });
});
```

- [ ] **Step 2: Verify the test fails (file does not exist yet)**

Run: `npm test`
Expected: vitest reports failure to resolve `./aggregate`.

- [ ] **Step 3: Implement `scripts/lib/aggregate.ts`**

```ts
// scripts/lib/aggregate.ts
import { PALETTE_50 } from '../palette';

export interface RawParcel {
  ownername: string;
  bbl: string;
  address: string;
  numfloors: number | null;
  yearbuilt: number | null;
  lotarea: number;
  lat: number;
  lon: number;
  // GeoJSON Polygon or MultiPolygon geometry, kept opaque here.
  geometry: unknown;
}

export interface LargestParcelSummary {
  bbl: string;
  address: string;
  lat: number;
  lon: number;
  lotarea_sqft: number;
}

export interface RankedOwner {
  id: number;
  ownername: string;
  color: string;
  parcel_count: number;
  total_lotarea_sqft: number;
  largest_parcel: LargestParcelSummary;
}

export interface AggregateResult {
  ranked: RankedOwner[];
  topOwnerNames: Set<string>;
}

const SQFT_PER_SQM = 0.092903;

export function extrudedHeightMeters(numfloors: number | null): number {
  if (numfloors == null || numfloors <= 0) return 5;
  return numfloors * 3.66;
}

export function flyToAltitudeMeters(lotareaSqft: number): number {
  const sqm = lotareaSqft * SQFT_PER_SQM;
  const raw = Math.sqrt(Math.max(0, sqm)) * 4;
  return Math.min(1500, Math.max(400, raw));
}

interface Accumulator {
  ownername: string;
  totalLotArea: number;
  parcelCount: number;
  largest: RawParcel;
}

export function aggregateOwners(parcels: Iterable<RawParcel>, topN: number): AggregateResult {
  const acc = new Map<string, Accumulator>();
  for (const p of parcels) {
    const existing = acc.get(p.ownername);
    if (existing) {
      existing.totalLotArea += p.lotarea;
      existing.parcelCount += 1;
      if (p.lotarea > existing.largest.lotarea) existing.largest = p;
    } else {
      acc.set(p.ownername, {
        ownername: p.ownername,
        totalLotArea: p.lotarea,
        parcelCount: 1,
        largest: p,
      });
    }
  }

  const sorted = Array.from(acc.values()).sort((a, b) => b.totalLotArea - a.totalLotArea);
  const sliced = sorted.slice(0, topN);

  const ranked: RankedOwner[] = sliced.map((entry, i) => ({
    id: i + 1,
    ownername: entry.ownername,
    color: PALETTE_50[i],
    parcel_count: entry.parcelCount,
    total_lotarea_sqft: entry.totalLotArea,
    largest_parcel: {
      bbl: entry.largest.bbl,
      address: entry.largest.address,
      lat: entry.largest.lat,
      lon: entry.largest.lon,
      lotarea_sqft: entry.largest.lotarea,
    },
  }));

  const topOwnerNames = new Set(ranked.map((r) => r.ownername));
  return { ranked, topOwnerNames };
}
```

- [ ] **Step 4: Run tests, verify all pass**

Run: `npm test`
Expected: all `aggregate.test.ts` tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/aggregate.ts scripts/lib/aggregate.test.ts
git commit -m "feat: pure helpers for owner aggregation, height, altitude"
```

---

### Task 1.5: `prepare-data.ts` — the streaming pipeline

**Files:**
- Create: `scripts/prepare-data.ts`

This task is **not TDD'd** end-to-end — it's an I/O pipeline best verified by running it. The pure helpers it uses are already covered by Task 1.4.

- [ ] **Step 1: Write the script**

```ts
// scripts/prepare-data.ts
import { createReadStream, promises as fs } from 'node:fs';
import { resolve } from 'node:path';
// stream-json v2 + stream-chain v3 use lowercase, hyphenated module paths and
// require the `.js` suffix. The v1-era paths (`/streamers/StreamArray`,
// `/filters/Pick`) no longer resolve.
import { chain } from 'stream-chain';
import { parser } from 'stream-json';
import { streamArray } from 'stream-json/streamers/stream-array.js';
import { pick } from 'stream-json/filters/pick.js';
import {
  aggregateOwners,
  extrudedHeightMeters,
  type RawParcel,
} from './lib/aggregate';

const REPO = resolve(import.meta.dirname ?? __dirname, '..');
const INPUT = resolve(REPO, 'data-raw/MapPLUTO.geojson');
const OUTPUT_INDEX = resolve(REPO, 'public/data/owners-index.json');
const OUTPUT_GEOJSON = resolve(REPO, 'public/data/owners.geojson');
const TOP_N = 50;

interface MapPlutoFeature {
  type: 'Feature';
  geometry: unknown;
  properties: Record<string, unknown>;
}

function toRawParcel(f: MapPlutoFeature): RawParcel | null {
  const p = f.properties;
  // MapPLUTO property names are PascalCase in the GeoJSON produced by ogr2ogr
  // from the DCP shapefile (Task 1.1 verified: OwnerName, BBL, Address,
  // NumFloors, YearBuilt, LotArea, Latitude, Longitude). The 8 fields and
  // their capitalization were confirmed via `ogrinfo -so`; don't rename them
  // to lowercase here even if it feels more idiomatic — the live data uses
  // PascalCase.
  const ownername = typeof p.OwnerName === 'string' ? p.OwnerName.trim() : '';
  const bbl = p.BBL != null ? String(p.BBL) : '';
  const lotarea = typeof p.LotArea === 'number' ? p.LotArea : Number(p.LotArea);
  const lat = typeof p.Latitude === 'number' ? p.Latitude : Number(p.Latitude);
  const lon = typeof p.Longitude === 'number' ? p.Longitude : Number(p.Longitude);
  if (!ownername || !bbl || !isFinite(lotarea) || lotarea <= 0) return null;
  if (!isFinite(lat) || !isFinite(lon)) return null;
  if (!f.geometry) return null;
  const numfloorsRaw = p.NumFloors;
  const numfloors =
    numfloorsRaw == null || numfloorsRaw === '' ? null : Number(numfloorsRaw);
  const yearbuiltRaw = p.YearBuilt;
  const yearbuilt =
    yearbuiltRaw == null || yearbuiltRaw === '' || Number(yearbuiltRaw) === 0
      ? null
      : Number(yearbuiltRaw);
  const address = typeof p.Address === 'string' ? p.Address : '';
  return {
    ownername,
    bbl,
    address,
    numfloors: numfloors != null && isFinite(numfloors) ? numfloors : null,
    yearbuilt: yearbuilt != null && isFinite(yearbuilt) ? yearbuilt : null,
    lotarea,
    lat,
    lon,
    geometry: f.geometry,
  };
}

async function collectAllParcels(): Promise<RawParcel[]> {
  return new Promise((resolveP, rejectP) => {
    const parcels: RawParcel[] = [];
    const pipeline = chain([
      createReadStream(INPUT),
      parser(),
      pick({ filter: 'features' }),
      streamArray(),
    ]);
    pipeline.on('data', ({ value }: { value: MapPlutoFeature }) => {
      const p = toRawParcel(value);
      if (p) parcels.push(p);
    });
    pipeline.on('end', () => resolveP(parcels));
    pipeline.on('error', rejectP);
  });
}

async function main() {
  console.log(`[prepare-data] reading ${INPUT}`);
  const t0 = Date.now();
  const allParcels = await collectAllParcels();
  console.log(`[prepare-data] parsed ${allParcels.length} parcels in ${Date.now() - t0}ms`);

  const { ranked, topOwnerNames } = aggregateOwners(allParcels, TOP_N);

  const filtered = allParcels.filter((p) => topOwnerNames.has(p.ownername));
  const ownerNameToId = new Map(ranked.map((r) => [r.ownername, r.id]));

  console.log(`[prepare-data] keeping ${filtered.length} parcels for top ${TOP_N} owners`);

  const geojson = {
    type: 'FeatureCollection' as const,
    features: filtered.map((p) => ({
      type: 'Feature' as const,
      geometry: p.geometry,
      properties: {
        owner_id: ownerNameToId.get(p.ownername)!,
        bbl: p.bbl,
        address: p.address,
        numfloors: p.numfloors ?? 0,
        yearbuilt: p.yearbuilt,
        lotarea: p.lotarea,
        lat: p.lat,
        lon: p.lon,
        extruded_height_m: extrudedHeightMeters(p.numfloors),
      },
    })),
  };

  const index = {
    generated_at: new Date().toISOString(),
    source: 'MapPLUTO (see data-raw/)',
    metric: 'lotarea',
    owners: ranked,
  };

  await fs.mkdir(resolve(REPO, 'public/data'), { recursive: true });
  await fs.writeFile(OUTPUT_INDEX, JSON.stringify(index, null, 2));
  await fs.writeFile(OUTPUT_GEOJSON, JSON.stringify(geojson));
  console.log(`[prepare-data] wrote ${OUTPUT_INDEX}`);
  console.log(`[prepare-data] wrote ${OUTPUT_GEOJSON}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Note: `extruded_height_m` is precomputed into each feature so the runtime does not have to recompute it per-instance and the pure helper remains the single source of truth for the formula.

- [ ] **Step 2: Install `stream-chain` (peer of `stream-json`)**

Run: `npm install --save-dev stream-chain`

(`stream-json` requires `stream-chain` for the `chain()` helper but does not depend on it directly.)

- [ ] **Step 3: Run the script against the real MapPLUTO file**

The MapPLUTO GeoJSON is ~1.5 GB on disk and the script collects all ~1M parcels (including polygon geometry) into memory for a two-step rank-then-filter. Peak JS heap will run 3–5× source size — bump Node's old-space limit so it doesn't OOM:

```bash
NODE_OPTIONS='--max-old-space-size=8192' npm run prepare-data
```

Expected console output ends with two `wrote ...` lines. The script should complete in well under 5 minutes on an M-series Mac.

If it OOMs anyway (`FATAL ERROR: ... allocation failed`), first try `--max-old-space-size=12288`. If that still fails, the streaming setup is broken (parser is buffering the whole document instead of emitting per-feature) — investigate `pick`/`streamArray` wiring before continuing.

If the run completes but `[prepare-data] parsed N parcels` shows N < 100,000, the per-feature filter `toRawParcel` is rejecting too aggressively — log a sample of rejected features and adjust.

- [ ] **Step 4: Sanity-check the outputs**

Run:

```bash
ls -lh public/data/
node -e "const j=require('./public/data/owners-index.json'); console.log('owners:', j.owners.length); console.log('top 5:'); j.owners.slice(0,5).forEach(o => console.log(' ', o.id, o.ownername, o.parcel_count, o.total_lotarea_sqft))"
node -e "const j=require('./public/data/owners.geojson'); console.log('features:', j.features.length); console.log('owner_id range:', Math.min(...j.features.map(f=>f.properties.owner_id)), '-', Math.max(...j.features.map(f=>f.properties.owner_id)))"
```

Expected:
- `owners-index.json` contains exactly 50 owners.
- Rank 1 is plausibly a city/state agency (NYCHA, NYC Parks, NYC DCAS, etc. — exact name depends on PLUTO version).
- `owners.geojson` features count is between 20,000 and 150,000.
- `owner_id` range is `1` – `50`.
- `owners.geojson` file size is between 3 MB and 30 MB.

If anything looks badly wrong (e.g., 1 owner, 0 features, owner_id outside 1–50), debug before committing.

- [ ] **Step 5: Commit the script and the generated outputs**

```bash
git add scripts/prepare-data.ts package.json package-lock.json public/data/
git commit -m "feat: prepare-data pipeline + initial top-50 owners output"
```

The two derived files **are** committed (per the spec — they are inputs to the runtime, not transient build artifacts).

---

## Stage 2 — Runtime Overlay

### Task 2.1: Types

**Files:**
- Create: `src/types/owners.ts`

- [ ] **Step 1: Write `src/types/owners.ts`**

```ts
// src/types/owners.ts

export interface LargestParcel {
  bbl: string;
  address: string;
  lat: number;
  lon: number;
  lotarea_sqft: number;
}

export interface OwnerIndexEntry {
  id: number;
  ownername: string;
  color: string; // hex, e.g. "#E63946"
  parcel_count: number;
  total_lotarea_sqft: number;
  largest_parcel: LargestParcel;
}

export interface OwnersIndex {
  generated_at: string;
  source: string;
  metric: 'lotarea';
  owners: OwnerIndexEntry[];
}

export interface ParcelInfo {
  owner_id: number;
  ownername: string;
  color: string;
  bbl: string;
  address: string;
  numfloors: number; // 0 = no building
  yearbuilt: number | null;
  lat: number;
  lon: number;
  extruded_height_m: number;
}

export type ParcelPickHandler = (info: ParcelInfo | null) => void;

export interface OwnersOverlay {
  owners: OwnerIndexEntry[];
  setOwnerVisible(ownerId: number, show: boolean): void;
  setAllOwnersVisible(show: boolean): void;
  flyToOwnerLargest(ownerId: number): Promise<void>;
  flyToParcel(bbl: string): Promise<void>;
  /** Subscribe to parcel-pick events. Returns an unsubscribe function. */
  onParcelPicked(handler: ParcelPickHandler): () => void;
  /** Current active parcel, or null. Read-only snapshot. */
  getActiveParcel(): ParcelInfo | null;
  destroy(): void;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/owners.ts
git commit -m "feat: type definitions for OwnersOverlay API"
```

---

### Task 2.2: `CesiumViewer` accepts `onReady`

**Files:**
- Modify: `src/components/CesiumViewer.tsx`

- [ ] **Step 1: Replace the file with this content**

```tsx
import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import { createViewer } from '../cesium/viewer';

interface Props {
  onReady?: (viewer: Cesium.Viewer) => void;
}

export function CesiumViewer({ onReady }: Props) {
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
      onReady?.(v);
    });

    return () => {
      cancelled = true;
      if (viewer && !viewer.isDestroyed()) viewer.destroy();
    };
  }, [onReady]);

  return <div ref={containerRef} style={{ height: '100%', width: '100%', position: 'relative' }} />;
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Run dev server, confirm globe still loads**

Run: `npm run dev`

Open the printed URL in a browser. Expected: photoreal NYC, no overlay (none wired up yet). Stop the dev server with Ctrl-C.

- [ ] **Step 4: Commit**

```bash
git add src/components/CesiumViewer.tsx
git commit -m "feat: CesiumViewer exposes viewer instance via onReady prop"
```

---

### Task 2.3: `owners-overlay.ts` — factory + primitive construction

**Files:**
- Create: `src/overlays/owners-overlay.ts`

This task constructs the 100 primitives but does NOT yet wire up picking or fly-to. Those are Task 2.4. Splitting them keeps each commit small and testable.

- [ ] **Step 1: Write the factory file**

```ts
// src/overlays/owners-overlay.ts
import * as Cesium from 'cesium';
import type {
  OwnerIndexEntry,
  OwnersIndex,
  OwnersOverlay,
  ParcelInfo,
  ParcelPickHandler,
} from '../types/owners';

const INDEX_URL = '/data/owners-index.json';
const GEOJSON_URL = '/data/owners.geojson';

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

  for (const owner of index.owners) {
    const features = byOwnerFeatures.get(owner.id) ?? [];
    const fillColor = hexToCesiumColor(owner.color, 0.55);
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
        const outlineGeom = new Cesium.PolygonOutlineGeometry({
          polygonHierarchy: new Cesium.PolygonHierarchy(positions),
          height: 0,
          extrudedHeight: props.extruded_height_m,
        });
        const fillInst = new Cesium.GeometryInstance({
          geometry: fillGeom,
          attributes: {
            color: Cesium.ColorGeometryInstanceAttribute.fromColor(fillColor),
          },
        });
        const outlineInst = new Cesium.GeometryInstance({
          geometry: outlineGeom,
          attributes: {
            color: Cesium.ColorGeometryInstanceAttribute.fromColor(outlineColor),
          },
        });
        fillInstances.push(fillInst);
        outlineInstances.push(outlineInst);
        // record info — instance index is the current length minus 1
        const idx = fillInstances.length - 1;
        // We'll fill in the primitive uid below, after the primitive exists.
        // Store in a temporary list keyed by `pending:${owner.id}:${idx}`.
        lookup.byKey.set(`pending:${owner.id}:${idx}`, info);
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
    // PolygonOutlineGeometry pairs with PerInstanceColorAppearance({flat:true}),
    // NOT PolylineColorAppearance — the latter targets PolylineGeometry, a
    // different geometry type, and Cesium silently skips rendering on mismatch.
    const outline = new Cesium.Primitive({
      geometryInstances: outlineInstances,
      appearance: new Cesium.PerInstanceColorAppearance({
        flat: true,
        translucent: false,
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
    async flyToOwnerLargest() {
      // wired in Task 2.4
    },
    async flyToParcel() {
      // wired in Task 2.4
    },
    onParcelPicked(handler) {
      subs.add(handler);
      return () => subs.delete(handler);
    },
    getActiveParcel() {
      return activeParcel;
    },
    destroy() {
      for (const p of ownerPrimitives.values()) {
        viewer.scene.primitives.remove(p.fill);
        viewer.scene.primitives.remove(p.outline);
      }
      subs.clear();
      activeParcel = null;
    },
  };

  // Expose for Task 2.4 to extend without recreating
  (overlay as unknown as { __internal: unknown }).__internal = {
    ownerById,
    ownerPrimitives,
    lookup,
    subs,
    setActiveParcel(p: ParcelInfo | null) {
      activeParcel = p;
      for (const h of subs) h(p);
    },
  };

  return overlay;
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Run build to catch bundling issues**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Wire a temporary call into `App.tsx` to verify primitives render**

This is a throwaway change so we can visually verify the overlay before adding the sidebar. We'll replace `App.tsx` properly in Task 2.7.

Open `src/App.tsx` and replace its contents with:

```tsx
import { useState } from 'react';
import * as Cesium from 'cesium';
import { CesiumViewer } from './components/CesiumViewer';
import { createOwnersOverlay } from './overlays/owners-overlay';

export function App() {
  const [, setReady] = useState(false);
  return (
    <CesiumViewer
      onReady={(viewer: Cesium.Viewer) => {
        createOwnersOverlay(viewer).then(() => setReady(true));
      }}
    />
  );
}
```

- [ ] **Step 5: Run dev server and visually verify**

Run: `npm run dev`

Open the URL. Expected:
- NYC photoreal tiles load.
- Within ~2 seconds, translucent colored prisms appear over NYCHA, NYC Parks, etc.
- Camera pan/orbit feels smooth (60fps).
- Per the user's **visual-companion-clean-first** preference: spin the globe to look at polygons from above — colors should be visually distinct and prisms should appear cleanly extruded with outlines.

If polygons are missing or warp wildly, debug before continuing. Common issues:
- `polygonHierarchy` getting outer ring incorrectly → polygons look like spaghetti.
- Forgetting `vertexFormat` → fill primitive throws on construction.
- Forgetting `viewer.scene.requestRender()` after add → polygons appear only on camera move.

Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/overlays/owners-overlay.ts src/App.tsx
git commit -m "feat: OwnersOverlay factory builds batched primitives per owner"
```

---

### Task 2.4: Picking + fly-to in the overlay

**Files:**
- Modify: `src/overlays/owners-overlay.ts`

- [ ] **Step 1: Add picking and fly-to inside `createOwnersOverlay`**

Locate the `// wired in Task 2.4` blocks and replace the stub methods plus add a left-click handler. The full updated section (replace `flyToOwnerLargest`, `flyToParcel`, and add a screen-space handler) should be:

```ts
// After overlay is constructed, before `return overlay;`:

const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
handler.setInputAction((click: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
  const picked = viewer.scene.pick(click.position);
  if (!picked) {
    setActiveParcel(null);
    return;
  }
  const primitive = picked.primitive as { _ownerOverlayId?: number } | undefined;
  const instanceIndex = (picked as unknown as { id?: unknown }).id;
  // Cesium returns the GeometryInstance id when releaseGeometryInstances=false.
  // But we didn't set per-instance ids; instead, use the picked instance index via `picked.id` may be undefined.
  // Fallback: iterate fill primitives and find which one the picked.primitive matches, then resolve via lookup using picked.instanceId numeric.
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
    // We don't have numfloors / yearbuilt for the largest parcel in the index.
    // For the waymarker on fly-to, look them up from the GeoJSON by BBL.
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
```

Also add a `bblToInfo` map populated alongside `lookup` during feature iteration. Inside the feature loop, after constructing `info`, add:

```ts
bblToInfo.set(info.bbl, info);
```

And declare near the top of the factory:

```ts
const bblToInfo = new Map<string, ParcelInfo>();
```

Update `destroy()` to also call `handler.destroy()`:

```ts
destroy() {
  handler.destroy();
  for (const p of ownerPrimitives.values()) {
    viewer.scene.primitives.remove(p.fill);
    viewer.scene.primitives.remove(p.outline);
  }
  subs.clear();
  activeParcel = null;
}
```

Remove the now-unused `(overlay as unknown as { __internal: unknown }).__internal = …` block from Task 2.3 — picking and fly-to are wired directly on `overlay` here.

Also remove the duplicate `setActiveParcel` helper that previously existed inside the stub methods.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: no errors. If TS complains about `instanceId` not existing on the picked result, the cast above documents the runtime shape — Cesium's `scene.pick` returns `{ primitive, id, instanceId? }` where `instanceId` is the index into the `GeometryInstance[]` array. If picking still fails at runtime (instanceId is always `undefined`), fall back to `scene.drillPick` and match by primitive identity.

- [ ] **Step 3: Run dev server, click a parcel**

Run: `npm run dev`

Click a colored prism. The console should not log errors. We cannot yet *see* the pick result because the waymarker doesn't exist — add a one-line `overlay.onParcelPicked((p) => console.log('picked', p))` inside the temporary `App.tsx` from Task 2.3 just for this verification step, then remove it.

Expected: clicking a parcel logs a `ParcelInfo` object with the right owner name and BBL. Clicking empty terrain logs `null`.

If picks return the wrong `ParcelInfo`, the `instanceId` mapping is broken — investigate (likely the polygon-rings flattening for MultiPolygon parcels is out of sync between `fillInstances.length - 1` and the actual `GeometryInstance` index).

Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add src/overlays/owners-overlay.ts
git commit -m "feat: parcel picking and per-owner fly-to in OwnersOverlay"
```

---

### Task 2.5: Sidebar component

**Files:**
- Create: `src/components/Sidebar.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/Sidebar.tsx
import { useMemo, useState } from 'react';
import type { OwnersOverlay, OwnerIndexEntry } from '../types/owners';

type SortKey = 'rank-desc' | 'parcel-count-desc';

interface Props {
  overlay: OwnersOverlay;
}

const SIDEBAR_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: 12,
  left: 12,
  bottom: 12,
  width: 320,
  background: 'rgba(20, 22, 28, 0.92)',
  color: '#f5f5f5',
  borderRadius: 8,
  padding: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  zIndex: 10,
  fontFamily: 'system-ui, sans-serif',
  fontSize: 13,
  boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
};

const LIST_STYLE: React.CSSProperties = {
  overflowY: 'auto',
  flex: 1,
  marginTop: 4,
  paddingRight: 4,
};

const ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 0',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
};

export function Sidebar({ overlay }: Props) {
  const [sort, setSort] = useState<SortKey>('rank-desc');
  const [search, setSearch] = useState('');
  const [visibility, setVisibility] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(overlay.owners.map((o) => [o.id, true])),
  );

  const filteredSorted = useMemo<OwnerIndexEntry[]>(() => {
    const needle = search.trim().toLowerCase();
    const matched = needle
      ? overlay.owners.filter((o) => o.ownername.toLowerCase().includes(needle))
      : overlay.owners.slice();
    matched.sort((a, b) =>
      sort === 'parcel-count-desc' ? b.parcel_count - a.parcel_count : a.id - b.id,
    );
    return matched;
  }, [overlay.owners, sort, search]);

  function toggleOwner(id: number, show: boolean) {
    setVisibility((v) => ({ ...v, [id]: show }));
    overlay.setOwnerVisible(id, show);
  }

  function setAll(show: boolean) {
    setVisibility(Object.fromEntries(overlay.owners.map((o) => [o.id, show])));
    overlay.setAllOwnersVisible(show);
  }

  return (
    <div style={SIDEBAR_STYLE}>
      <div style={{ fontWeight: 600, fontSize: 14 }}>NYC Top-50 Landowners</div>

      <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
        <option value="rank-desc">Largest area first</option>
        <option value="parcel-count-desc">Most parcels first</option>
      </select>

      <input
        type="text"
        placeholder="Search owner name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ padding: 4 }}
      />

      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => setAll(true)} style={{ flex: 1 }}>All on</button>
        <button onClick={() => setAll(false)} style={{ flex: 1 }}>All off</button>
      </div>

      <div style={LIST_STYLE}>
        {filteredSorted.map((o) => (
          <div key={o.id} style={ROW_STYLE}>
            <input
              type="checkbox"
              checked={!!visibility[o.id]}
              onChange={(e) => toggleOwner(o.id, e.target.checked)}
            />
            <span
              style={{
                width: 12,
                height: 12,
                background: o.color,
                borderRadius: 2,
                flexShrink: 0,
              }}
            />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              #{o.id} {o.ownername}
            </span>
            <button
              onClick={() => overlay.flyToOwnerLargest(o.id)}
              title={`Fly to largest parcel (${o.parcel_count} total)`}
            >
              ✈
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "feat: Sidebar with sort, search, per-owner toggle and fly-to"
```

---

### Task 2.6: Waymarker component

**Files:**
- Create: `src/components/Waymarker.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/Waymarker.tsx
import { useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import type { ParcelInfo } from '../types/owners';

interface Props {
  viewer: Cesium.Viewer;
  parcel: ParcelInfo;
  onClose: () => void;
}

const CARD_STYLE: React.CSSProperties = {
  position: 'absolute',
  background: 'white',
  color: '#111',
  padding: '8px 10px',
  borderRadius: 6,
  boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
  fontFamily: 'system-ui, sans-serif',
  fontSize: 12,
  minWidth: 180,
  pointerEvents: 'auto',
  zIndex: 20,
  transform: 'translate(-50%, calc(-100% - 8px))',
};

export function Waymarker({ viewer, parcel, onClose }: Props) {
  const [screen, setScreen] = useState<{ x: number; y: number } | null>(null);
  const positionRef = useRef(
    Cesium.Cartesian3.fromDegrees(parcel.lon, parcel.lat, parcel.extruded_height_m),
  );

  useEffect(() => {
    positionRef.current = Cesium.Cartesian3.fromDegrees(
      parcel.lon,
      parcel.lat,
      parcel.extruded_height_m,
    );
  }, [parcel.lon, parcel.lat, parcel.extruded_height_m]);

  useEffect(() => {
    function update() {
      const canvasPos = viewer.scene.cartesianToCanvasCoordinates(
        positionRef.current,
        new Cesium.Cartesian2(),
      );
      if (!canvasPos || isNaN(canvasPos.x) || isNaN(canvasPos.y)) {
        setScreen(null);
        return;
      }
      // Hide if behind the camera.
      const cameraToPoint = Cesium.Cartesian3.subtract(
        positionRef.current,
        viewer.camera.position,
        new Cesium.Cartesian3(),
      );
      const dot = Cesium.Cartesian3.dot(cameraToPoint, viewer.camera.direction);
      if (dot <= 0) {
        setScreen(null);
        return;
      }
      setScreen({ x: canvasPos.x, y: canvasPos.y });
    }
    const removeListener = viewer.scene.postRender.addEventListener(update);
    update();
    return () => removeListener();
  }, [viewer, parcel.bbl]);

  if (!screen) return null;

  const floorsLine =
    parcel.numfloors > 0 ? `${parcel.numfloors} floors` : 'No building';
  const yearLine = parcel.yearbuilt != null ? `Built ${parcel.yearbuilt}` : 'Built —';

  return (
    <div style={{ ...CARD_STYLE, left: screen.x, top: screen.y }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div style={{ fontWeight: 700, flex: 1 }}>{parcel.ownername}</div>
        <button
          onClick={onClose}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 14 }}
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
      <div style={{ color: '#555', marginTop: 2 }}>
        {floorsLine} · {yearLine}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/Waymarker.tsx
git commit -m "feat: Waymarker HTML overlay tracks active parcel on screen"
```

---

### Task 2.7: Wire everything in `App.tsx`

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Replace `src/App.tsx`**

```tsx
import { useEffect, useState } from 'react';
import * as Cesium from 'cesium';
import { CesiumViewer } from './components/CesiumViewer';
import { Sidebar } from './components/Sidebar';
import { Waymarker } from './components/Waymarker';
import { createOwnersOverlay } from './overlays/owners-overlay';
import type { OwnersOverlay, ParcelInfo } from './types/owners';

export function App() {
  const [viewer, setViewer] = useState<Cesium.Viewer | null>(null);
  const [overlay, setOverlay] = useState<OwnersOverlay | null>(null);
  const [activeParcel, setActiveParcel] = useState<ParcelInfo | null>(null);

  useEffect(() => {
    if (!viewer) return;
    let disposed = false;
    let createdOverlay: OwnersOverlay | null = null;
    createOwnersOverlay(viewer).then((o) => {
      if (disposed) {
        o.destroy();
        return;
      }
      createdOverlay = o;
      setOverlay(o);
    });
    return () => {
      disposed = true;
      if (createdOverlay) createdOverlay.destroy();
    };
  }, [viewer]);

  useEffect(() => {
    if (!overlay) return;
    return overlay.onParcelPicked(setActiveParcel);
  }, [overlay]);

  return (
    <>
      <CesiumViewer onReady={setViewer} />
      {overlay && <Sidebar overlay={overlay} />}
      {viewer && activeParcel && (
        <Waymarker viewer={viewer} parcel={activeParcel} onClose={() => setActiveParcel(null)} />
      )}
    </>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Full visual verification (the load-bearing test for Stage 2)**

Run: `npm run dev`

Walk through the full interaction matrix:

1. **Load:** photoreal NYC appears, then ~50 colored polygon clusters fade in within a couple seconds. Sidebar shows on the left with 50 rows.
2. **Sort:** switching to "Most parcels first" reorders the list without changing the map.
3. **Search:** typing `nycha` (or another known top owner from the generated index) narrows the list; clearing it restores all 50.
4. **Toggle:** unchecking row #1 removes that owner's polygons from the map within ~100ms. Re-checking restores them.
5. **All off / All on:** removes / restores all polygons quickly. No noticeable hitch.
6. **Fly-to button:** clicking ✈ on row #1 flies the camera to that owner's largest parcel and the waymarker appears at the start of the flight with the correct owner name, floor count, and year.
7. **Direct click on a parcel:** waymarker switches to the clicked parcel; camera does not move.
8. **Click empty terrain:** waymarker disappears.
9. **Click ×:** waymarker disappears.
10. **Camera pan/orbit with all 50 visible:** subjectively 60fps. No long stalls.
11. **Visual-companion check (per user pref):** spin the globe so polygons are viewed from above with photoreal tiles fading behind — colors should be readable, prisms should look clean and extruded.

Anything that fails the matrix is a bug to fix before commit. Common issues:

- **Sidebar covers polygons:** intentional (left 12 px, 320 px wide). Fine.
- **Waymarker drifts laggily during orbit:** confirm the `postRender` listener is firing (add a `console.count` for one frame; remove after).
- **All toggles do nothing:** likely `setOwnerVisible` is being called but `scene.requestRender()` was forgotten. Per CLAUDE.md, on-demand rendering requires it.
- **Picks return the wrong parcel:** see Task 2.4 fallback (drillPick).

Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire OwnersOverlay, Sidebar, Waymarker into App"
```

---

### Task 2.8: Documentation update

**Files:**
- Modify: `src/overlays/README.md`

- [ ] **Step 1: Append an "Owners overlay" section**

Open `src/overlays/README.md` and append at the end:

```markdown

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
```

- [ ] **Step 2: Commit**

```bash
git add src/overlays/README.md
git commit -m "docs: document owners overlay in overlays README"
```

---

### Task 2.9: Spec commit (optional, do after the user reviews everything)

**Files:**
- The spec at `docs/superpowers/specs/2026-05-12-nyc-top-50-landowners-design.md` is currently uncommitted.

- [ ] **Step 1: Once the user has signed off on the working implementation, commit the spec and this plan**

```bash
git add docs/superpowers/specs/2026-05-12-nyc-top-50-landowners-design.md docs/superpowers/plans/2026-05-12-nyc-top-50-landowners.md
git commit -m "docs: top-50 landowners design spec and implementation plan"
```

The spec and plan capture intent for future POC-vs-v2 conversations — they outlive the code that implements them.

---

## Self-Review Notes

Spec coverage walked through section by section:
- "Goals (v1)" ✅ all implemented across Task 2.3 (prisms), 2.5 (sidebar), 2.6 (waymarker), 2.7 (wiring).
- "Non-Goals" ✅ none of them are implemented anywhere in the plan.
- "Phase 1 — Offline Data Prep" ✅ Tasks 1.1–1.5 cover download, palette, pure helpers, streaming pipeline, and output files (with the spec's exact JSON shape, plus `extruded_height_m` precomputed per parcel — this is an additive optimization the spec does not preclude).
- "Phase 2 — Runtime Rendering" ✅ Task 2.3 builds 2 primitives × 50 owners. Heights are baked at construction (no `CallbackProperty`). Task 2.7 calls `requestRender()` after visibility flips (in the overlay itself).
- "UI Components & File Structure" ✅ file tree matches Tasks 2.1–2.7.
- "Interactions" 1–8: sort/search/checkbox/all-on-off in Sidebar (Task 2.5); fly-to and pick in overlay (Task 2.4); waymarker dismissal in Task 2.6 + Task 2.7.
- "Performance Budget" — verified in Task 2.7 Step 4. The plan does not add automated performance tests (out of scope for POC).
- "Known Risks" — `stream-json` is used (R2 mitigated). MultiPolygon handled (R1's primitive count assumption). Pick reliability fallback documented in Task 2.4 (R8). Other risks are observe-after-running, not preventable in the plan.

Type consistency: `OwnersOverlay`, `ParcelInfo`, `OwnerIndexEntry`, `LargestParcel` are defined once in `src/types/owners.ts` (Task 2.1) and consumed everywhere else. Method names match across overlay, Sidebar, and Waymarker. The data prep emits `extruded_height_m`; runtime reads `extruded_height_m`. Consistent.

No placeholders, no "TBD"s, all code blocks complete.

---

## Out-of-Plan Decisions Worth Flagging to the Reviewer

1. **`extruded_height_m` precomputed in the GeoJSON output.** The spec computes it at runtime; the plan moves it to data prep so the formula has one source of truth (`scripts/lib/aggregate.ts`). The runtime just reads the number. If you prefer the spec's "compute at runtime" framing, tell me and I'll move the formula into `owners-overlay.ts` and drop the precomputed property.

2. **`tsx` added as a dev dependency** to run the TypeScript prep script directly. Alternative: pre-build the script with `tsc`. `tsx` is simpler for a POC and matches Vite's worldview.

3. **`vitest` added for the pure helpers only.** No React/Cesium tests, by design — those are best verified by running the app. If you'd rather have zero new dev deps and skip the unit tests, say so and I'll fold the aggregator into `prepare-data.ts` directly.

4. **Picking via `picked.instanceId`.** Cesium's documented surface; should work. The plan includes a `scene.drillPick` fallback in Task 2.4 Step 3 in case it doesn't.
