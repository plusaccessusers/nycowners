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
