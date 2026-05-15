import { useCallback, useEffect, useState } from 'react';
import * as Cesium from 'cesium';
import { CesiumViewer } from './components/CesiumViewer';
import { Sidebar } from './components/Sidebar';
import { Waymarker } from './components/Waymarker';
import { createOwnersOverlay } from './overlays/owners-overlay';
import type { ViewerHandles } from './cesium/viewer';
import type { OwnersOverlay, ParcelInfo } from './types/owners';

export function App() {
  const [viewer, setViewer] = useState<Cesium.Viewer | null>(null);
  const [tileset, setTileset] = useState<Cesium.Cesium3DTileset | null>(null);
  const [overlay, setOverlay] = useState<OwnersOverlay | null>(null);
  const [activeParcel, setActiveParcel] = useState<ParcelInfo | null>(null);

  const handleViewerReady = useCallback((handles: ViewerHandles) => {
    setViewer(handles.viewer);
    setTileset(handles.tileset);
  }, []);

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
      <CesiumViewer onReady={handleViewerReady} />
      {overlay && <Sidebar overlay={overlay} viewer={viewer} tileset={tileset} />}
      {viewer && activeParcel && (
        <Waymarker viewer={viewer} parcel={activeParcel} onClose={() => setActiveParcel(null)} />
      )}
    </>
  );
}
