const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { mockData, ready, violations } = require('./helpers.cjs');

const canvas = page => page.locator('#flyer-btn canvas.flyer-3d');
const figure = page => page.locator('#flyer-btn svg.flyer-fig');

async function desktop(page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockData(page);
  await ready(page);
}

async function mounted(page) {
  await expect(canvas(page)).toBeAttached({ timeout: 20000 });
  await expect(figure(page)).toHaveCSS('display', 'none');
}

test('desktop with WebGL swaps the SVG for the rendered GLB', async ({ page }) => {
  await desktop(page);
  await mounted(page);
  await expect(canvas(page)).toHaveAttribute('aria-hidden', 'true');
  const box = await canvas(page).boundingBox();
  expect(box.width).toBeGreaterThan(100);
  expect(box.height).toBeGreaterThan(140);
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.waitForTimeout(1200);
  expect(errors).toEqual([]);
});

test('the toggle governs the 3D layer as well as the SVG', async ({ page }) => {
  await desktop(page);
  await mounted(page);
  await page.evaluate(() => document.getElementById('mobile-flyer-toggle').click());
  await expect(canvas(page)).toHaveCount(0);
  await expect(figure(page)).not.toHaveCSS('display', 'none');
  await page.evaluate(() => document.getElementById('mobile-flyer-toggle').click());
  await mounted(page);
});

test('palette and assistant reactions reach the mounted renderer', async ({ page }) => {
  await desktop(page);
  await mounted(page);
  await page.evaluate(() => {
    window.__reacts = [];
    document.addEventListener('ironbot:react', event => window.__reacts.push(event.detail.kind));
  });
  await page.keyboard.press('Control+k');
  await expect(page.locator('dialog.os-palette')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog.os-palette')).toBeHidden();
  await page.locator('.ast-fab').click();
  await page.locator('.ast-panel .ast-chip').first().click();
  await expect(page.locator('.ast-panel .ast-bot').last()).toBeVisible();
  expect(await page.evaluate(() => window.__reacts)).toEqual(expect.arrayContaining(['wave', 'think']));
  // A reaction must never take the render loop down.
  await page.waitForTimeout(800);
  await expect(canvas(page)).toBeAttached();
});

test('a missing GLB falls back to the SVG without switching the bot off', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockData(page);
  await page.route('**/ironbot.glb', route => route.fulfill({ status: 404, body: 'gone' }));
  await ready(page);
  await page.waitForTimeout(2500);
  await expect(canvas(page)).toHaveCount(0);
  await expect(figure(page)).not.toHaveCSS('display', 'none');
  await expect(page.locator('#flyer')).toBeVisible();
});

test('without WebGL the SVG stays and the bundle is never fetched', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
      return original.call(this, type, ...rest);
    };
  });
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  await desktop(page);
  await page.waitForTimeout(2500);
  await expect(canvas(page)).toHaveCount(0);
  await expect(figure(page)).not.toHaveCSS('display', 'none');
  expect(requests.filter(url => url.includes('ironbot3d.bundle.js'))).toEqual([]);
});

test('reduced motion keeps the SVG and never mounts the renderer', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await desktop(page);
  await page.waitForTimeout(2500);
  await expect(canvas(page)).toHaveCount(0);
  await expect(page.locator('#flyer')).toBeHidden();
});

test('phones keep the SVG and never download the 3D bundle', async ({ page }) => {
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  await page.setViewportSize({ width: 390, height: 844 });
  await mockData(page);
  await ready(page);
  await page.waitForTimeout(2500);
  await expect(canvas(page)).toHaveCount(0);
  await expect(figure(page)).not.toHaveCSS('display', 'none');
  expect(requests.filter(url => url.includes('ironbot3d.bundle.js'))).toEqual([]);
});

test('the mounted renderer stays accessible and overflow-free', async ({ page }) => {
  await desktop(page);
  await mounted(page);
  const results = await new AxeBuilder({ page }).analyze();
  expect(violations(results)).toEqual([]);
});
