import * as Cesium from 'cesium';
import { CESIUM_ION_TOKEN, DEFAULT_CAMERA, GOOGLE_MAPS_API_KEY } from './config';

// Set the Ion token at module init. Empty string is an explicit, valid fallback:
// the viewer still constructs, just without Ion-hosted terrain/imagery.
Cesium.Ion.defaultAccessToken = CESIUM_ION_TOKEN;

export async function createViewer(container: HTMLDivElement): Promise<Cesium.Viewer> {
  // All default widgets disabled for a clean photoreal canvas.
  const viewer = new Cesium.Viewer(container, {
    timeline: false,
    animation: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    infoBox: false,
    selectionIndicator: false,
  });

  // On-demand rendering — idle = 0 frames. Camera moves and tile loads
  // trigger renders automatically; any custom RAF code that mutates the
  // scene must call viewer.scene.requestRender(). See src/cesium/animate.ts
  // for the helper that handles this for animations.
  viewer.clock.shouldAnimate = false;
  viewer.scene.requestRenderMode = true;
  viewer.scene.maximumRenderTimeChange = Infinity;

  // Photoreal-friendly rendering. Without these the Google tiles look
  // oversaturated and washed out.
  viewer.scene.highDynamicRange = true;
  viewer.scene.postProcessStages.tonemapper = Cesium.Tonemapper.PBR_NEUTRAL;
  viewer.scene.skyBox!.show = false;
  viewer.scene.sun!.show = false;
  viewer.scene.moon!.show = false;
  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#c8dceb');

  // Globe stays visible — required for scene.sampleHeightMostDetailed and
  // other terrain queries beginners will want later.
  viewer.scene.globe.show = true;

  // Photoreal tiles via the official helper. The helper handles attribution
  // and session tokens automatically — do not strip credit display.
  if (!GOOGLE_MAPS_API_KEY) {
    // eslint-disable-next-line no-console
    console.warn(
      '[full-globe] VITE_GOOGLE_MAPS_API_KEY is empty. Photoreal 3D Tiles will not load. ' +
        'Add the key to .env (see .env.example) and restart the dev server.',
    );
  } else {
    const tileset = await Cesium.createGooglePhotorealistic3DTileset({
      key: GOOGLE_MAPS_API_KEY,
    });
    viewer.scene.primitives.add(tileset);
  }

  // Fly to the configured default with a -45° pitch so buildings are visible.
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(
      DEFAULT_CAMERA.lon,
      DEFAULT_CAMERA.lat,
      DEFAULT_CAMERA.alt,
    ),
    orientation: {
      pitch: Cesium.Math.toRadians(DEFAULT_CAMERA.pitchDegrees),
    },
    duration: 0,
  });

  return viewer;
}
