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
