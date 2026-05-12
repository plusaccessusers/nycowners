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

  return <div ref={containerRef} style={{ height: '100%', width: '100%', position: 'relative' }} />;
}
