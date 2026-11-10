const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { mockData, ready, violations } = require('./helpers.cjs');

const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 390, height: 844 };
const audit = page => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();

async function desktop(page) {
  await page.setViewportSize(DESKTOP);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockData(page);
  await ready(page);
}

test('command palette opens with Ctrl+K, filters, and jumps with the keyboard', async ({ page }) => {
  await desktop(page);
  await page.keyboard.press('Control+k');
  const palette = page.locator('dialog.os-palette');
  await expect(palette).toHaveAttribute('open', '');
  await expect(palette.locator('.os-input')).toBeFocused();

  const unfiltered = await palette.locator('.os-item').count();
  expect(unfiltered).toBeGreaterThan(9);
  await expect(palette.locator('.os-item').first()).toHaveAttribute('aria-selected', 'true');
  await expect(palette.locator('.os-input')).toHaveAttribute('aria-activedescendant', 'os-opt-0');
  await page.keyboard.press('ArrowDown');
  await expect(palette.locator('.os-input')).toHaveAttribute('aria-activedescendant', 'os-opt-1');
  await page.keyboard.press('ArrowUp');
  await expect(palette.locator('.os-input')).toHaveAttribute('aria-activedescendant', 'os-opt-0');

  await palette.locator('.os-input').fill('about');
  await expect(palette.locator('.os-item').first()).toContainText('About');
  await page.keyboard.press('Enter');

  await expect(palette).not.toHaveAttribute('open', '');
  expect(page.url()).toContain('#about');
  await expect(page.locator('#about')).toBeInViewport();
  await expect(page.locator('.nav .os-search')).toBeFocused();
});

test('command palette closes with Escape and returns focus, and the backdrop dismisses it', async ({ page }) => {
  await desktop(page);
  await page.locator('.nav .os-search').click();
  await expect(page.locator('dialog.os-palette')).toHaveAttribute('open', '');
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog.os-palette')).not.toHaveAttribute('open', '');
  await expect(page.locator('.nav .os-search')).toBeFocused();

  await page.keyboard.press('Control+k');
  await expect(page.locator('dialog.os-palette')).toHaveAttribute('open', '');
  await page.mouse.click(20, 500);
  await expect(page.locator('dialog.os-palette')).not.toHaveAttribute('open', '');
});

test('command palette can reach every section, the projects and the Ironbot toggle', async ({ page }) => {
  await desktop(page);
  await page.locator('.nav .os-search').click();
  const labels = await page.locator('dialog.os-palette .os-item span').allTextContents();
  for (const section of ['About', 'Projects', 'Stack', 'Telemetry', 'Repositories', 'Activity', 'Contact']) {
    expect(labels.some(label => label.trim() === section), `palette is missing the ${section} command`).toBe(true);
  }
  for (const command of ['GitHub', 'LinkedIn', 'Toggle Ironbot']) {
    expect(labels.some(label => label.trim() === command), `palette hides the ${command} command behind the result cap`).toBe(true);
  }

  await page.locator('dialog.os-palette .os-input').fill('ironbot');
  await expect(page.locator('dialog.os-palette .os-item')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(page.locator('#flyer-toggle')).toHaveAttribute('aria-pressed', 'false');
});

test('an unmatched palette search stays usable and accessible', async ({ page }) => {
  await desktop(page);
  await page.locator('.nav .os-search').click();
  await page.locator('dialog.os-palette .os-input').fill('zzzqqq');
  await expect(page.locator('dialog.os-palette .os-empty')).toBeVisible();
  await expect(page.locator('dialog.os-palette .os-item')).toHaveCount(0);
  expect(violations(await audit(page))).toEqual([]);
});

test('menu bar clock and search are desktop only, and the clock is decorative', async ({ page }) => {
  await desktop(page);
  await expect(page.locator('.nav .os-search')).toBeVisible();
  const clock = page.locator('.os-clock');
  await expect(clock).toBeVisible();
  await expect(clock).toHaveAttribute('aria-hidden', 'true');
  expect(await clock.textContent()).toMatch(/^\d{1,2}:\d{2}/);

  await page.setViewportSize(PHONE);
  await expect(page.locator('.nav .os-search')).not.toBeVisible();
  await expect(clock).not.toBeVisible();
  await expect(page.locator('.mobile-dock')).toBeVisible();
});

test('window chrome dresses desktop panels and leaves the phone alone', async ({ page }) => {
  await desktop(page);
  const border = selector => page.locator(selector).first().evaluate(node => getComputedStyle(node).borderTopWidth);
  expect(await border('.cards .card')).toBe('24px');
  expect(await border('.repo-card')).toBe('24px');

  await page.setViewportSize(PHONE);
  await ready(page);
  expect(await page.locator('.cards .card').first().evaluate(node => getComputedStyle(node).borderTopWidth)).not.toBe('24px');
});

test('reduced motion keeps the window hover lift off under both triggers', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await mockData(page);
  await ready(page);
  const lift = async () => {
    const card = page.locator('.cards .card').first();
    await card.scrollIntoViewIfNeeded();
    await card.hover();
    return card.evaluate(node => getComputedStyle(node).transform);
  };
  expect(await lift(), 'the hover lift is the effect being guarded').not.toBe('none');

  await page.evaluate(() => { document.documentElement.dataset.motion = 'reduced'; });
  expect(await lift(), 'the in-page motion toggle must stop the lift').toBe('none');

  await page.evaluate(() => { document.documentElement.dataset.motion = 'full'; });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await lift(), 'the OS preference must stop the lift').toBe('none');
});

test('assistant answers from faq.json, falls back honestly, and stays keyboard usable', async ({ page }) => {
  await desktop(page);
  await page.locator('.ast-fab').click();
  const panel = page.locator('.ast-panel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.ast-input')).toBeFocused();
  const name = await panel.locator('.ast-title').textContent();
  expect(name.length).toBeGreaterThan(0);
  await expect(panel.locator('.ast-bot').first()).toBeVisible();
  await expect(panel.locator('.ast-chip')).toHaveCount(4);

  await panel.locator('.ast-input').fill('where does he study');
  await panel.locator('.ast-send').click();
  await expect(panel.locator('.ast-you').last()).toContainText('where does he study');
  await expect(panel.locator('.ast-bot').last()).toContainText('East West University');

  await panel.locator('.ast-input').fill('what is your favourite cheese');
  await panel.locator('.ast-send').click();
  await expect(panel.locator('.ast-bot').last()).toContainText("I don't have an answer for that");
  await expect(panel.locator('.ast-links a').last()).toHaveText('GitHub');

  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(page.locator('.ast-fab')).toBeFocused();
  await expect(page.locator('.ast-fab')).toHaveAttribute('aria-expanded', 'false');

  await page.locator('.ast-fab').click();
  expect(violations(await audit(page))).toEqual([]);
});

test('assistant chips answer without typing and keep offering the rest', async ({ page }) => {
  await desktop(page);
  await page.locator('.ast-fab').click();
  const panel = page.locator('.ast-panel');
  const first = panel.locator('.ast-chip').first();
  const question = await first.textContent();
  await first.click();
  await expect(panel.locator('.ast-you').last()).toHaveText(question);
  await expect(panel.locator('.ast-bot').last()).toBeVisible();
  await expect(panel.locator('.ast-chip')).toHaveCount(4);
  expect(await panel.locator('.ast-chip').allTextContents()).not.toContain(question);
});

test('assistant says so plainly when faq.json cannot load', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockData(page);
  await page.route('**/assets/faq.json', route => route.fulfill({ status: 500, body: 'nope' }));
  await ready(page);
  await page.locator('.ast-fab').click();
  await expect(page.locator('.ast-bot')).toContainText('could not load');
  await expect(page.locator('.ast-chip')).toHaveCount(0);
});

test('the OS shell adds nothing without JavaScript and the panels stay readable', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: DESKTOP, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/');
  expect(await page.locator('.ast-fab').count()).toBe(0);
  expect(await page.locator('.ast-panel').count()).toBe(0);
  expect(await page.locator('.os-search').count()).toBe(0);
  expect(await page.locator('dialog.os-palette').count()).toBe(0);
  await expect(page.locator('#telemetry .panel-fallback')).toBeVisible();
  await expect(page.locator('.hero')).toBeVisible();
  await context.close();
});
