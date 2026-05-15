import { useMemo, useState } from 'react';
import * as Cesium from 'cesium';
import type { OwnersOverlay, OwnerIndexEntry } from '../types/owners';

type SortKey = 'rank-desc' | 'parcel-count-desc';

interface Props {
  overlay: OwnersOverlay;
  viewer: Cesium.Viewer | null;
  tileset: Cesium.Cesium3DTileset | null;
}

const MONO =
  "ui-monospace, 'JetBrains Mono', 'IBM Plex Mono', 'SF Mono', Menlo, Consolas, monospace";

const SIDEBAR_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: 12,
  left: 12,
  bottom: 12,
  width: 320,
  background: '#0a0b0d',
  color: '#e8e8e8',
  border: '1px solid rgba(255, 255, 255, 0.14)',
  borderRadius: 0,
  padding: '10px 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  zIndex: 10,
  fontFamily: MONO,
  fontSize: 11,
  letterSpacing: '0.02em',
  boxShadow: 'none',
};

const HEADER_STYLE: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 11,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: '#cfd2d6',
  paddingBottom: 8,
  borderBottom: '1px solid rgba(255, 255, 255, 0.14)',
};

const META_STYLE: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 9,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: '#6c7077',
  marginTop: 4,
};

const CONTROL_STYLE: React.CSSProperties = {
  background: '#111316',
  color: '#e8e8e8',
  border: '1px solid rgba(255, 255, 255, 0.18)',
  borderRadius: 0,
  fontFamily: MONO,
  fontSize: 11,
  padding: '6px 8px',
  outline: 'none',
  letterSpacing: '0.04em',
};

const BUTTON_STYLE: React.CSSProperties = {
  ...CONTROL_STYLE,
  cursor: 'pointer',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  fontSize: 10,
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
  gap: 8,
  padding: '4px 0',
  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
  fontFamily: MONO,
};

const ROW_ID_STYLE: React.CSSProperties = {
  width: 22,
  color: '#6c7077',
  fontSize: 10,
  flexShrink: 0,
  textAlign: 'right',
};

const SWATCH_STYLE: React.CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: 0,
  flexShrink: 0,
};

const NAME_STYLE: React.CSSProperties = {
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: 11,
  color: '#e8e8e8',
};

const FLY_BUTTON_STYLE: React.CSSProperties = {
  background: 'transparent',
  color: '#e8e8e8',
  border: '1px solid rgba(255, 255, 255, 0.22)',
  borderRadius: 0,
  fontFamily: MONO,
  fontSize: 10,
  padding: '2px 6px',
  cursor: 'pointer',
  letterSpacing: '0.08em',
};

export function Sidebar({ overlay, viewer, tileset }: Props) {
  const [sort, setSort] = useState<SortKey>('rank-desc');
  const [search, setSearch] = useState('');
  const [realWorld, setRealWorld] = useState(true);
  const [visibility, setVisibility] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(overlay.owners.map((o) => [o.id, true])),
  );

  function toggleRealWorld() {
    if (!viewer) return;
    const next = !realWorld;
    // Hide non-grid imagery layers (e.g. any future basemap). The Palantir
    // grid layer is tagged in viewer.ts and stays visible in both modes.
    for (let i = 0; i < viewer.imageryLayers.length; i++) {
      const layer = viewer.imageryLayers.get(i);
      const isGrid = (layer as unknown as { _isPalantirGrid?: boolean })._isPalantirGrid === true;
      if (isGrid) continue;
      layer.show = next;
    }
    if (tileset) tileset.show = next;
    if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = next;
    viewer.scene.requestRender();
    setRealWorld(next);
  }

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

  const visibleCount = Object.values(visibility).filter(Boolean).length;

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
      <div style={HEADER_STYLE}>NYC · Top-50 Landowners</div>

      <div style={META_STYLE}>
        Showing {visibleCount}/{overlay.owners.length} · {filteredSorted.length} match
        {filteredSorted.length === 1 ? '' : 'es'}
      </div>

      <select
        value={sort}
        onChange={(e) => setSort(e.target.value as SortKey)}
        style={CONTROL_STYLE}
      >
        <option value="rank-desc">Sort: largest area</option>
        <option value="parcel-count-desc">Sort: most parcels</option>
      </select>

      <input
        type="text"
        placeholder="search owner name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={CONTROL_STYLE}
      />

      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => setAll(true)} style={{ ...BUTTON_STYLE, flex: 1 }}>
          All on
        </button>
        <button onClick={() => setAll(false)} style={{ ...BUTTON_STYLE, flex: 1 }}>
          All off
        </button>
        <button
          onClick={toggleRealWorld}
          style={{ ...BUTTON_STYLE, flex: 1 }}
          disabled={!viewer}
        >
          {realWorld ? 'Map only' : 'Real world'}
        </button>
      </div>

      <div style={LIST_STYLE}>
        {filteredSorted.map((o) => (
          <div key={o.id} style={ROW_STYLE}>
            <input
              type="checkbox"
              checked={!!visibility[o.id]}
              onChange={(e) => toggleOwner(o.id, e.target.checked)}
              style={{ accentColor: o.color }}
            />
            <span style={ROW_ID_STYLE}>{String(o.id).padStart(2, '0')}</span>
            <span style={{ ...SWATCH_STYLE, background: o.color }} />
            <span style={NAME_STYLE}>{o.ownername}</span>
            <button
              onClick={() => overlay.flyToOwnerLargest(o.id)}
              title={`Fly to largest parcel (${o.parcel_count} total)`}
              style={FLY_BUTTON_STYLE}
            >
              →
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
