import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import { createViewer, type ViewerHandles } from '../cesium/viewer';

interface Props {
  onReady?: (handles: ViewerHandles) => void;
}

export function CesiumViewer({ onReady }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let viewer: Cesium.Viewer | null = null;
    let cancelled = false;

    createViewer(container)
      .then((handles) => {
        if (cancelled) {
          handles.viewer.destroy();
          return;
        }
        viewer = handles.viewer;
        onReady?.(handles);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[full-globe] createViewer failed:', err);
      });

    return () => {
      cancelled = true;
      if (viewer && !viewer.isDestroyed()) viewer.destroy();
    };
  }, [onReady]);

  return <div ref={containerRef} style={{ height: '100%', width: '100%', position: 'relative' }} />;
}
