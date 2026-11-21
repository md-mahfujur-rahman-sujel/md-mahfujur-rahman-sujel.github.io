const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const views = ['home', 'work', 'about', 'stats', 'contact'];
const surfaces = [
  ['desktop', { width: 1280, height: 900 }],
  ['phone', { width: 390, height: 844 }]
];

test('first paint follows a saved theme before deferred scripts run', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('sujel-theme', 'dark'));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.theme-toggle')).toBeVisible();
  await expect(page.locator('.theme-toggle')).toHaveAttribute('aria-label', 'Switch to light theme');
});

test('theme choice toggles by button and T, persists, and follows system until manually changed', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.locator('.theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.keyboard.press('t');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => localStorage.getItem('sujel-theme'))).toBe('light');
});

test('system preference changes the theme until the visitor makes a manual choice', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.locator('.theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('views navigate on both surfaces in both themes without horizontal overflow', async ({ browser }) => {
  for (const theme of ['light', 'dark']) {
    for (const [surface, viewport] of surfaces) {
      const context = await browser.newContext({ viewport, colorScheme: theme, reducedMotion: 'reduce' });
      const page = await context.newPage();
      await page.goto('/');
      await page.evaluate(themeChoice => localStorage.setItem('sujel-theme', themeChoice), theme);
      await page.reload();
      for (const id of views) {
        const nav = surface === 'desktop' ? '.nav' : '.tabbar';
        await page.locator(`${nav} a[data-view="${id}"]`).click();
        await expect(page.locator(`#${id}`)).toBeVisible();
        await expect(page.locator(`${nav} a[data-view="${id}"]`)).toHaveAttribute('aria-current', 'page');
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
      }
      await context.close();
    }
  }
});

for (const [surface, viewport] of surfaces) {
  for (const theme of ['light', 'dark']) {
    test(`axe: ${theme} theme, ${surface}, every view`, async ({ browser }) => {
      const context = await browser.newContext({ viewport, colorScheme: theme, reducedMotion: 'reduce' });
      const page = await context.newPage();
      await page.goto('/');
      await page.evaluate(themeChoice => localStorage.setItem('sujel-theme', themeChoice), theme);
      await page.reload();
      for (const id of views) {
        if (id !== 'home') {
          const nav = surface === 'desktop' ? '.nav' : '.tabbar';
          await page.locator(`${nav} a[data-view="${id}"]`).click();
        }
        const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        expect(result.violations, `${theme} ${surface} ${id}`).toEqual([]);
      }
      await page.locator('.theme-toggle').focus();
      const focused = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(focused.violations, `${theme} ${surface} focused theme control`).toEqual([]);
      await context.close();
    });
  }
}

test('without JavaScript every view remains in the document and theme follows system color scheme', async ({ browser }) => {
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ javaScriptEnabled: false, colorScheme: theme, viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('.theme-toggle')).toBeHidden();
    for (const id of views) await expect(page.locator(`#${id}`)).toBeVisible();
    const background = await page.locator('body').evaluate(node => getComputedStyle(node).backgroundColor);
    expect(background).toBe(theme === 'light' ? 'rgb(238, 243, 255)' : 'rgb(3, 6, 15)');
    await context.close();
  }
});
