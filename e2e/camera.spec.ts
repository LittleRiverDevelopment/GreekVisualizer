import { expect, test, type Locator, type Page } from '@playwright/test';

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface Camera {
  eye: Vec3;
  center: Vec3;
  up: Vec3;
}

test('keeps the 3D camera across inputs and resets it for axes, metric, and Reset camera', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'The orbit gesture is checked on the desktop layout.');
  test.setTimeout(120_000);
  await page.goto('./');
  const plot = page.locator('section[aria-label="3D surface"] .js-plotly-plot');
  await expect(plot).toBeVisible();
  await expect.poll(async () => closeEnough(await readCamera(plot), defaultCamera()), { timeout: 20_000 }).toBe(true);
  await plot.evaluate((el) => el.setAttribute('data-camera-node', 'kept'));

  const firstHit = await orbit(page, plot);
  const turned = await readCamera(plot);
  expect(turned, 'drag should move the camera').not.toBeNull();
  expect(eyeDistance(turned!, defaultCamera()), `orbit started on ${firstHit}`).toBeGreaterThan(0.35);

  await page.getByRole('slider', { name: 'Spot slider' }).fill('140');
  await expect(page.getByTestId('scenario-summary')).toContainText('spot 140');
  await expectHeld(plot, turned!);

  await page.getByRole('slider', { name: 'Strike slider' }).fill('120');
  await expect(page.getByTestId('scenario-summary')).toContainText('strike 120');
  await expectHeld(plot, turned!);

  await page.getByRole('slider', { name: 'Days to expiration slider' }).fill('80');
  await expect(page.getByTestId('scenario-summary')).toContainText('80');
  await expectHeld(plot, turned!);

  await page.getByRole('slider', { name: 'Volatility slider' }).fill('40');
  await expect(page.getByTestId('scenario-summary')).toContainText('40%');
  await expectHeld(plot, turned!);

  await page.getByRole('slider', { name: 'Risk-free rate slider' }).fill('2');
  await expect(page.getByTestId('scenario-summary')).toContainText('rate 2%');
  await expectHeld(plot, turned!);

  await page.getByRole('slider', { name: 'Dividend yield slider' }).fill('1');
  await expect(page.getByTestId('scenario-summary')).toContainText('dividend 1%');
  await expectHeld(plot, turned!);

  await page.getByTestId('right-put').click();
  await expect(page.getByTestId('scenario-summary')).toContainText('Put');
  await expectHeld(plot, turned!);

  await page.getByRole('checkbox', { name: 'Show surface contours' }).check();
  await expectHeld(plot, turned!);

  await page.getByRole('checkbox', { name: 'Show scenario marker' }).uncheck();
  await expectHeld(plot, turned!);

  await page.getByRole('button', { name: /low \(25/ }).click();
  await expectHeld(plot, turned!);

  await page.getByRole('slider', { name: 'Spot window from slider' }).fill('70');
  await expectHeld(plot, turned!);

  await expect(plot).toHaveAttribute('data-camera-node', 'kept');
  await waitUntilIdle(plot, turned!);

  await orbit(page, plot);
  const turnedAgain = await readCamera(plot);
  expect(eyeDistance(turnedAgain!, turned!)).toBeGreaterThan(0.35);
  await page.getByRole('slider', { name: 'Spot slider' }).fill('160');
  await expect(page.getByTestId('scenario-summary')).toContainText('spot 160');
  await expectHeld(plot, turnedAgain!);

  await page.getByTestId('metric-select').selectOption('delta');
  await expect(page.getByTestId('chart-summary')).toContainText(/delta/i);
  await waitUntilIdle(plot, defaultCamera());

  await orbit(page, plot);
  expect(eyeDistance((await readCamera(plot))!, defaultCamera())).toBeGreaterThan(0.35);
  await page.getByRole('radio', { name: 'Underlying × volatility' }).check();
  await expect(page.getByTestId('chart-summary')).toContainText(/volatility/i);
  await waitUntilIdle(plot, defaultCamera());

  await orbit(page, plot);
  expect(eyeDistance((await readCamera(plot))!, defaultCamera())).toBeGreaterThan(0.35);
  await page.getByRole('button', { name: 'Reset camera', exact: true }).click();
  await waitUntilIdle(plot, defaultCamera());
  await expect(plot).toHaveAttribute('data-camera-node', 'kept');
});

function defaultCamera(): Camera {
  return {
    eye: { x: 1.55, y: -1.6, z: 1.05 },
    center: { x: 0, y: 0, z: 0 },
    up: { x: 0, y: 0, z: 1 },
  };
}

async function expectHeld(plot: Locator, expected: Camera) {
  let last: Camera | null = null;
  try {
    await expect.poll(async () => {
      last = await readCamera(plot);
      return closeEnough(last, expected);
    }, { timeout: 15_000 }).toBe(true);
  } catch (error) {
    throw new Error(`held eye ${JSON.stringify(last?.eye)} center ${JSON.stringify(last?.center)} up ${JSON.stringify(last?.up)} expected eye ${JSON.stringify(expected.eye)}`, { cause: error });
  }
}

async function waitUntilIdle(plot: Locator, expected: Camera) {
  await expectHeld(plot, expected);
  await plot.page().waitForTimeout(800);
  expect(closeEnough(await readCamera(plot), expected)).toBe(true);
}

async function readCamera(plot: Locator): Promise<Camera | null> {
  return plot.evaluate((el) => {
    const scene = (el as {
      _fullLayout?: {
        scene?: {
          camera?: { eye?: unknown; center?: unknown; up?: unknown };
          _scene?: { getCamera?: () => { eye?: unknown; center?: unknown; up?: unknown } };
        };
      };
    })._fullLayout?.scene;
    const camera = scene?._scene?.getCamera?.() ?? scene?.camera;
    if (!camera) return null;
    const vec = (value: unknown) => {
      if (Array.isArray(value) && value.length >= 3) {
        const [x, y, z] = value as number[];
        return { x, y, z };
      }
      if (value && typeof value === 'object') {
        const point = value as { x?: number; y?: number; z?: number };
        if (typeof point.x === 'number' && typeof point.y === 'number' && typeof point.z === 'number') {
          return { x: point.x, y: point.y, z: point.z };
        }
      }
      return null;
    };
    const eye = vec(camera.eye);
    const center = vec(camera.center);
    const up = vec(camera.up);
    if (!eye || !center || !up) return null;
    return { eye, center, up };
  });
}

function closeEnough(actual: Camera | null, expected: Camera, epsilon = 0.05): boolean {
  if (!actual) return false;
  const left = glEquivalent(actual);
  const right = glEquivalent(expected);
  const groups = ['eye', 'center', 'up'] as const;
  const axes = ['x', 'y', 'z'] as const;
  return groups.every((group) => axes.every((axis) => Math.abs(left[group][axis] - right[group][axis]) <= epsilon));
}

/** Orbit reports the up vector perpendicular to the view. (0,0,1) and that vector are the same picture. */
function glEquivalent(camera: Camera): Camera {
  const fx = camera.center.x - camera.eye.x;
  const fy = camera.center.y - camera.eye.y;
  const fz = camera.center.z - camera.eye.z;
  const fl = Math.hypot(fx, fy, fz) || 1;
  const nx = fx / fl;
  const ny = fy / fl;
  const nz = fz / fl;
  const dot = camera.up.x * nx + camera.up.y * ny + camera.up.z * nz;
  const ux = camera.up.x - dot * nx;
  const uy = camera.up.y - dot * ny;
  const uz = camera.up.z - dot * nz;
  const ul = Math.hypot(ux, uy, uz) || 1;
  return {
    eye: camera.eye,
    center: camera.center,
    up: { x: ux / ul, y: uy / ul, z: uz / ul },
  };
}

function eyeDistance(a: Camera, b: Camera): number {
  return Math.hypot(a.eye.x - b.eye.x, a.eye.y - b.eye.y, a.eye.z - b.eye.z);
}

async function orbit(page: Page, plot: Locator): Promise<string> {
  await plot.scrollIntoViewIfNeeded();
  const box = await plot.boundingBox();
  if (!box) throw new Error('3D surface is not visible');
  const x = box.x + box.width * 0.34;
  const y = box.y + box.height * 0.5;
  const hit = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    if (!el) return 'none';
    return `${el.tagName}.${el.getAttribute('class') || ''}`;
  }, { x, y });
  const endX = Math.min(x + 90, box.x + box.width - 48);
  const endY = Math.max(y - 70, box.y + 48);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  return hit;
}
