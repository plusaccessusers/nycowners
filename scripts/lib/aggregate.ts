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
