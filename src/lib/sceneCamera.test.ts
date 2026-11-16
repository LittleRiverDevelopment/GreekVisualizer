import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SURFACE_CAMERA,
  camerasClose,
  cloneCamera,
  layoutWithSceneCamera,
  readSceneCamera,
} from './sceneCamera';

describe('scene camera', () => {
  it('clones vectors so Plotly cannot mutate the stored camera', () => {
    const copy = cloneCamera(DEFAULT_SURFACE_CAMERA);
    copy.eye.x = 0;
    expect(DEFAULT_SURFACE_CAMERA.eye.x).toBe(1.55);
  });

  it('reads object and array vectors from the live plot', () => {
    const el = {
      _fullLayout: {
        scene: {
          camera: {
            eye: { x: 0.2, y: 2.4, z: 0.4 },
            center: [0.1, -0.2, 0],
            up: { x: 0, y: 0, z: 1 },
          },
        },
      },
    } as unknown as HTMLElement;
    expect(readSceneCamera(el)).toEqual({
      eye: { x: 0.2, y: 2.4, z: 0.4 },
      center: { x: 0.1, y: -0.2, z: 0 },
      up: { x: 0, y: 0, z: 1 },
    });
    const withLiveView = {
      _fullLayout: {
        scene: {
          camera: { eye: { x: 1, y: 1, z: 1 }, center: { x: 0, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 } },
          _scene: {
            getCamera: () => ({
              eye: { x: 0.4, y: 1.8, z: 0.2 },
              center: { x: 0, y: 0, z: 0 },
              up: { x: 0, y: 0, z: 1 },
            }),
          },
        },
      },
    } as unknown as HTMLElement;
    expect(readSceneCamera(withLiveView)?.eye).toEqual({ x: 0.4, y: 1.8, z: 0.2 });
    expect(camerasClose(readSceneCamera(el)!, {
      eye: { x: 0.2, y: 2.4, z: 0.4004 },
      center: { x: 0.1, y: -0.2, z: 0 },
      up: { x: 0, y: 0, z: 1 },
    })).toBe(true);
  });

  it('puts the supplied camera on the scene without dropping axis layout', () => {
    const layout = layoutWithSceneCamera(
      { scene: { xaxis: { title: { text: 'Spot' } } } },
      DEFAULT_SURFACE_CAMERA,
      'spot-days|price|0',
    ) as {
      uirevision: string;
      scene: { uirevision: string; camera: typeof DEFAULT_SURFACE_CAMERA; xaxis: { title: { text: string } } };
    };
    expect(layout.uirevision).toBe('spot-days|price|0');
    expect(layout.scene.uirevision).toBe('spot-days|price|0');
    expect(layout.scene.camera.eye).toEqual(DEFAULT_SURFACE_CAMERA.eye);
    expect(layout.scene.camera.projection).toEqual({ type: 'perspective' });
    expect(layout.scene.xaxis.title.text).toBe('Spot');
    layout.scene.camera.eye.x = 9;
    expect(DEFAULT_SURFACE_CAMERA.eye.x).toBe(1.55);
  });
});
