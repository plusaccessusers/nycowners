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
