import { useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import type { ParcelInfo } from '../types/owners';

interface Props {
  viewer: Cesium.Viewer;
  parcel: ParcelInfo;
  onClose: () => void;
}

const MONO =
  "ui-monospace, 'JetBrains Mono', 'IBM Plex Mono', 'SF Mono', Menlo, Consolas, monospace";

const CARD_STYLE: React.CSSProperties = {
  position: 'absolute',
  background: '#0a0b0d',
  color: '#e8e8e8',
  padding: '8px 10px 8px 12px',
  border: '1px solid rgba(255, 255, 255, 0.18)',
  borderRadius: 0,
  boxShadow: '0 4px 18px rgba(0, 0, 0, 0.65)',
  fontFamily: MONO,
  fontSize: 11,
  letterSpacing: '0.04em',
  minWidth: 200,
  pointerEvents: 'auto',
  zIndex: 20,
  transform: 'translate(-50%, calc(-100% - 10px))',
};

const OWNER_STYLE: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 11,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  fontWeight: 600,
  flex: 1,
};

const META_STYLE: React.CSSProperties = {
  color: '#7d8088',
  marginTop: 4,
  fontSize: 10,
  letterSpacing: '0.06em',
};

const CLOSE_STYLE: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: 14,
  color: '#7d8088',
  padding: 0,
  marginLeft: 6,
  fontFamily: MONO,
  lineHeight: 1,
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
    parcel.numfloors > 0 ? `${parcel.numfloors} FL` : 'NO BLDG';
  const yearLine = parcel.yearbuilt != null ? `BUILT ${parcel.yearbuilt}` : 'BUILT —';

  return (
    <div
      style={{
        ...CARD_STYLE,
        left: screen.x,
        top: screen.y,
        borderLeft: `3px solid ${parcel.color}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        <div style={OWNER_STYLE}>{parcel.ownername}</div>
        <button onClick={onClose} style={CLOSE_STYLE} aria-label="Dismiss">
          ×
        </button>
      </div>
      <div style={META_STYLE}>
        {floorsLine} · {yearLine}
      </div>
    </div>
  );
}
