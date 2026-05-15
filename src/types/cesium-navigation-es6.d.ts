declare module 'cesium-navigation-es6' {
  import type { Viewer, Cartographic, Rectangle } from 'cesium';

  interface CesiumNavigationOptions {
    defaultResetView?: Cartographic | Rectangle;
    orientation?: { heading?: number; pitch?: number; roll?: number };
    duration?: number;
    enableCompass?: boolean;
    enableZoomControls?: boolean;
    enableDistanceLegend?: boolean;
    enableCompassOuterRing?: boolean;
    resetTooltip?: string;
    zoomInTooltip?: string;
    zoomOutTooltip?: string;
  }

  class CesiumNavigation {
    constructor(viewer: Viewer, options?: CesiumNavigationOptions);
    destroy(): void;
  }

  export default CesiumNavigation;
}
