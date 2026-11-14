import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('./');
});

test('loads the production app under the Pages subpath', async ({ page }) => {
  await expect(page).toHaveTitle(/GreekVisualizer/);
  await expect(page.getByRole('heading', { name: 'GreekVisualizer' })).toBeVisible();
  await expect(page.getByTestId('price-value')).toContainText('$');
  await expect(page.locator('.js-plotly-plot').first()).toBeVisible();
  const src = await page.locator('script[type="module"]').first().getAttribute('src');
  expect(src ?? '').toContain('/GreekVisualizer/');
  expect(page.url()).toContain('/GreekVisualizer/');
});

test('spot change updates the price', async ({ page }) => {
  const before = await page.getByTestId('price-value').innerText();
  await page.getByTestId('spot-input').fill('150');
  await expect(page.getByTestId('price-value')).not.toHaveText(before);
});

test('switching call and put changes the price', async ({ page }) => {
  const callPrice = await page.getByTestId('price-value').innerText();
  await page.getByTestId('right-put').click();
  await expect(page.getByTestId('price-value')).not.toHaveText(callPrice);
  await expect(page.getByTestId('scenario-summary')).toContainText('Put');
});

test('metric change updates the chart summary', async ({ page }) => {
  await page.getByTestId('metric-select').selectOption('vega');
  await expect(page.getByTestId('chart-summary')).toContainText(/vega/i);
  await expect(page.getByTestId('scenario-summary')).toContainText('Vega');
});

test('reset restores the default spot', async ({ page }) => {
  await page.getByTestId('spot-input').fill('150');
  await expect(page.getByTestId('spot-input')).toHaveValue('150');
  await page.getByTestId('reset').click();
  await expect(page.getByTestId('spot-input')).toHaveValue('100');
  await expect(page.getByTestId('scenario-summary')).toContainText('spot 100');
});

test('a shared scenario URL restores state', async ({ page }) => {
  await page.getByTestId('spot-input').fill('123');
  await expect(page).toHaveURL(/[?&]S=123(?:&|$)/);
  const shared = page.url();
  await page.goto('about:blank');
  await page.goto(shared);
  await expect(page.getByTestId('spot-input')).toHaveValue('123');
  await expect(page.getByTestId('scenario-summary')).toContainText('spot 123');
});

test('has no horizontal overflow', async ({ page }) => {
  await expect(page.getByTestId('chart-summary')).toBeVisible();
  await page.waitForTimeout(1000);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('desktop keeps the mobile input toggle hidden', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'The toggle is for narrow screens.');
  await expect(page.getByRole('button', { name: 'Hide inputs' })).toBeHidden();
});

test('strategy and American sections render', async ({ page }) => {
  await page.getByRole('tab', { name: 'Strategy' }).click();
  await expect(page.getByRole('heading', { name: 'Legs' })).toBeVisible();
  await expect(page.getByText(/one expiration/i)).toBeVisible();
  await page.getByRole('tab', { name: 'American' }).click();
  await expect(page.getByRole('heading', { name: 'American binomial tree' })).toBeVisible();
  await expect(page.getByText(/not the Black–Scholes formula/i)).toBeVisible();
});
