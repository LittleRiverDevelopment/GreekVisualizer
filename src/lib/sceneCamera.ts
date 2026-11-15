/** Plotly scene camera vectors that a user sets by rotating, zooming, or panning. */
export interface SceneVec3 {
  x: number;
  y: number;
  z: number;
}

export interface SceneCamera {
  eye: SceneVec3;
  center: SceneVec3;
  up: SceneVec3;
  projection?: { type: 'perspective' | 'orthographic' };
}

export function cameraForPlotly(camera: SceneCamera): SceneCamera & { projection: { type: 'perspective' | 'orthographic' } } {
  return {
    ...cloneCamera(camera),
    projection: camera.projection ?? { type: 'perspective' },
  };
}

/** Opening view for the explorer surface. Reset camera, and axis or metric changes, return here. */
export const DEFAULT_SURFACE_CAMERA: SceneCamera = {
  eye: { x: 1.55, y: -1.6, z: 1.05 },
  center: { x: 0, y: 0, z: 0 },
  up: { x: 0, y: 0, z: 1 },
};

export function cloneCamera(camera: SceneCamera): SceneCamera {
  return {
    eye: { ...camera.eye },
    center: { ...camera.center },
    up: { ...camera.up },
  };
}

export function camerasClose(a: SceneCamera, b: SceneCamera, epsilon = 1e-3): boolean {
  const groups = ['eye', 'center', 'up'] as const;
  const axes = ['x', 'y', 'z'] as const;
  return groups.every((group) => axes.every((axis) => Math.abs(a[group][axis] - b[group][axis]) <= epsilon));
}

interface LiveCamera {
  eye?: unknown;
  center?: unknown;
  up?: unknown;
}

interface PlotCameraSource {
  _fullLayout?: {
    scene?: {
      camera?: LiveCamera;
      /** Plotly's gl3d scene. Its camera is the view on screen, including a drag that has not yet been written back to layout. */
      _scene?: { getCamera?: () => LiveCamera };
    };
  };
}

/**
 * Read the camera the user is looking through. The gl scene is ahead of
 * `layout.scene.camera` until a drag ends on the canvas, so prefer it.
 * Vectors may be objects or 3-arrays.
 */
export function readSceneCamera(el: HTMLElement): SceneCamera | null {
  const scene = (el as HTMLElement & PlotCameraSource)._fullLayout?.scene;
  if (!scene) return null;
  const live = scene._scene?.getCamera?.();
  return cameraFrom(live) ?? cameraFrom(scene.camera);
}

/**
 * Supply one camera for this react. `revision` stays constant while the view should stick.
 * It changes when the camera is meant to return to a programmed view, so Plotly does not
 * put the previous user camera back on top of that view.
 */
export function layoutWithSceneCamera(layout: unknown, camera: SceneCamera, revision: string): unknown {
  const record = layout && typeof layout === 'object' ? (layout as { scene?: Record<string, unknown> }) : {};
  return {
    ...record,
    uirevision: revision,
    scene: {
      ...(record.scene ?? {}),
      uirevision: revision,
      camera: cameraForPlotly(camera),
    },
  };
}

function cameraFrom(camera: LiveCamera | undefined): SceneCamera | null {
  if (!camera) return null;
  const eye = asVec3(camera.eye);
  const center = asVec3(camera.center);
  const up = asVec3(camera.up);
  if (!eye || !center || !up) return null;
  return { eye, center, up };
}

function asVec3(value: unknown): SceneVec3 | null {
  if (Array.isArray(value) && value.length >= 3) {
    const [x, y, z] = value;
    return finiteVec(x, y, z);
  }
  if (value && typeof value === 'object') {
    const vec = value as { x?: unknown; y?: unknown; z?: unknown };
    return finiteVec(vec.x, vec.y, vec.z);
  }
  return null;
}

function finiteVec(x: unknown, y: unknown, z: unknown): SceneVec3 | null {
  if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') return null;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  return { x, y, z };
}
