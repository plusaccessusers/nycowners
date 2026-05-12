import * as Cesium from 'cesium';

/**
 * Run a CallbackProperty-driven animation, then settle to a constant.
 *
 * `apply(t)` runs each frame with t in [0, 1].
 * `finalize()` is called once at completion. It should swap any
 * CallbackProperty in your entity for a ConstantProperty (or plain value)
 * so Cesium can cache the geometry from then on — otherwise the polygon
 * keeps re-tesselating every frame even after the animation ends.
 *
 * Required when `viewer.scene.requestRenderMode` is on (it is by default
 * in this starter): the helper calls `viewer.scene.requestRender()` each
 * tick because requestRenderMode does not redraw on its own.
 */
export function animate(
  viewer: Cesium.Viewer,
  durationMs: number,
  apply: (t: number) => void,
  finalize: () => void,
): void {
  const start = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / durationMs);
    apply(t);
    viewer.scene.requestRender();
    if (t < 1) {
      requestAnimationFrame(tick);
    } else {
      finalize();
      viewer.scene.requestRender();
    }
  };
  requestAnimationFrame(tick);
}
