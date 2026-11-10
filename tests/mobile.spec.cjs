const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { fixture, mockData, ready, overflow } = require('./helpers.cjs');

for (const [width, height] of [[320,568],[360,800],[390,844],[412,915],[430,932],[600,960],[844,390],[900,960]]) {
  test(`reflows and exposes all panels at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockData(page);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await ready(page);
    await expect(page.locator('.mobile-workspace')).toBeVisible();
    await expect(page.locator('.tech-chip')).toHaveCount(15);
    await expect(page.locator('.week-bar')).toHaveCount(52);
    await expect(page.locator('.repo-card')).toHaveCount(3);
    for (const id of ['top','projects','stack','telemetry','repositories','activity']) {
      await page.locator(`#${id}`).evaluate(node => node.scrollIntoView({ behavior: 'instant' }));
      expect(await overflow(page)).toEqual([]);
    }
    expect(await page.evaluate(() => document.scrollingElement.scrollWidth)).toBe(width);
    expect(errors).toEqual([]);
  });
}
test('every visible control is at least 44 by 44 CSS pixels', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await mockData(page); await ready(page);
  const small = () => page.evaluate(() => [...document.querySelectorAll('a,button,summary,input')].filter(node => {
    const r = node.getBoundingClientRect();
    return r.width && r.height && !node.closest('svg,details:not([open])>*:not(summary)') && (r.width < 43.9 || r.height < 43.9);
  }).map(node => ({ text: node.textContent, width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })));
  expect(await small()).toEqual([]);
  await page.locator('#explorer-open').click();
  expect(await small()).toEqual([]);
  expect(await overflow(page)).toEqual([]);
});
test('Explorer closes with Escape, browser back and a section link, returning focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockData(page); await ready(page);
  await page.locator('#explorer-open').click();
  await expect(page.locator('#explorer')).toBeVisible();
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => !!document.activeElement.closest('#explorer'))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('#explorer')).not.toBeVisible();
  await expect(page.locator('#explorer-open')).toBeFocused();
  await page.locator('#explorer-open').click();
  await page.goBack();
  await expect(page.locator('#explorer')).not.toBeVisible();
  await page.locator('#explorer-open').click();
  await page.locator('.explorer-tree a[href="#stack"]').click();
  await expect(page.locator('#explorer')).not.toBeVisible();
  await expect(page).toHaveURL(/#stack$/);
  await expect(page.locator('#stack')).toBeInViewport();
});
test('Explorer drag dismissal and scroll spy work', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockData(page); await ready(page);
  await page.locator('#explorer-open').click();
  await page.locator('#explorer').evaluate(async node => { await Promise.all(node.getAnimations().map(animation => animation.finished)); });
  const handle = await page.locator('.sheet-handle').boundingBox();
  await page.mouse.move(handle.x + 22, handle.y + 2); await page.mouse.down();
  await page.mouse.move(handle.x + 22, handle.y + 115, { steps: 10 }); await page.mouse.up();
  await expect(page.locator('#explorer')).not.toBeVisible();
  await page.locator('#stack').evaluate(node => node.scrollIntoView({ behavior: 'instant' }));
  await expect(page.locator('.mobile-dock a[aria-current]')).toHaveText('Stack');
  await page.locator('#repositories').evaluate(node => node.scrollIntoView({ behavior: 'instant' }));
  await expect(page.locator('.mobile-dock a[aria-current]')).toHaveText('Stats');
});
test('filters, chart keyboard input, grouped activity and raw JSON work', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockData(page); await ready(page);
  await page.getByRole('button', { name: 'OWNED', exact: true }).click();
  await expect(page.locator('.repo-card:visible')).toHaveCount(2);
  await page.getByRole('button', { name: 'COLLAB', exact: true }).click();
  await expect(page.locator('.repo-card:visible')).toHaveCount(1);
  await page.getByRole('button', { name: 'ALL', exact: true }).click();
  await expect(page.locator('.repo-card:visible')).toHaveCount(3);
  await page.getByRole('button', { name: 'LANGS', exact: true }).click();
  await expect(page.locator('.language-legend')).toBeVisible();
  const slider = page.getByRole('slider'); await slider.focus(); await page.keyboard.press('Home');
  await expect(slider).toHaveValue('0');
  const first = await page.locator('.chart-tooltip').textContent();
  await page.keyboard.press('ArrowRight'); await expect(slider).toHaveValue('1');
  expect(await page.locator('.chart-tooltip').textContent()).not.toBe(first);
  await page.locator('.event-group summary').click();
  await expect(page.locator('.event-group ul')).toBeVisible();
  await page.locator('.raw-data summary').click(); await expect(page.locator('.raw-data pre')).toBeVisible();
});
test('reduced motion toggle persists and disables all running motion and Ironbot', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockData(page); await ready(page);
  await page.locator('#explorer-open').click();
  await page.locator('#motion-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  await page.keyboard.press('Escape');
  await expect(page.locator('#flyer')).not.toBeVisible();
  expect(await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length)).toBe(0);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
});
test('unreachable data and disabled JavaScript keep readable SVG fallbacks', async ({ browser }) => {
  for (const javaScriptEnabled of [true, false]) {
    const context = await browser.newContext({ javaScriptEnabled, viewport: { width: 320, height: 568 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    if (javaScriptEnabled) await page.route('**/data/stats.json', route => route.fulfill({ status: 503, body: 'unavailable' }));
    await page.goto('/');
    await expect(page.locator('#telemetry .panel-fallback')).toBeVisible();
    await expect(page.locator('#telemetry .fallback-note')).toBeVisible();
    await expect(page.locator('.mobile-workspace h1')).toBeVisible();
    expect(await overflow(page)).toEqual([]);
    await context.close();
  }
});
test('data errors can be retried and malicious API text stays text', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let success = false;
  const stats = fixture(); stats.repos[0].desc = '<img src=x onerror="window.injected=true">';
  await page.route('**/data/stats.json', route => success ? route.fulfill({ json: stats }) : route.fulfill({ status: 503, body: '' }));
  await page.goto('/'); await expect(page.locator('.retry-data')).toBeEnabled();
  success = true; await page.locator('.retry-data').click();
  await expect(page.locator('#repositories')).toHaveClass(/has-data/);
  await expect(page.locator('.retry-data')).not.toBeVisible();
  await expect(page.locator('.repo-card').first()).toContainText('<img src=x');
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
  expect(await page.locator('.repo-card img').count()).toBe(0);
});
test('mobile accessibility audit has no WCAG A/AA violations', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockData(page); await ready(page);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(results.violations.map(issue => ({ id: issue.id, nodes: issue.nodes.map(node => node.target) }))).toEqual([]);
  await page.locator('#explorer-open').click();
  const sheet = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  expect(sheet.violations.map(issue => ({ id: issue.id, nodes: issue.nodes.map(node => node.target) }))).toEqual([]);
});
test('desktop renders the live components with the unified design system', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockData(page); await ready(page);
  await expect(page.locator('.hero')).toBeVisible();
  await expect(page.locator('.mobile-workspace')).not.toBeVisible();
  await expect(page.locator('.mobile-dock')).not.toBeVisible();
  await expect(page.locator('#telemetry-component')).toBeVisible();
  await expect(page.locator('#telemetry .panel-fallback')).not.toBeVisible();
  await expect(page.locator('#telemetry .retry-data')).not.toBeVisible();
  await expect(page.locator('#telemetry .data-notice')).not.toBeVisible();
  await expect(page.locator('.metric-card')).toHaveCount(4);
  await expect(page.locator('.week-bar')).toHaveCount(52);
  await expect(page.locator('.repo-card')).toHaveCount(3);
  await expect(page.locator('.tech-chip')).toHaveCount(15);
  await expect(page.locator('.cards .card')).toHaveCount(3);
  await expect(page.locator('.cards .card img')).toHaveCount(0);
  expect(await page.locator('.head-in').evaluate(node => getComputedStyle(node).flexDirection)).toBe('row');
  expect(await page.locator('.cards').evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' ').length)).toBe(3);
  expect(await page.locator('.repo-list').evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' ').length)).toBe(3);
});
test('the phone and desktop intros present the same copy and links', async ({ page }) => {
  await mockData(page); await ready(page);
  const intros = await page.evaluate(() => {
    const text = node => node.textContent.replace(/\u00a0/g, ' ').trim().replace(/\s+/g, ' ');
    const read = root => ({
      copy: [...root.querySelectorAll('.intro-kicker,h1,.intro-lead,dt,dd')].map(text).join('|'),
      actions: [...root.querySelectorAll('.intro-actions a')].map(link => `${text(link)} ${link.getAttribute('href')}`).join('|')
    });
    return { desktop: read(document.querySelector('.hero .intro')), mobile: read(document.querySelector('.mobile-workspace .intro')) };
  });
  expect(intros.mobile).toEqual(intros.desktop);
  expect(await page.locator('.hero-tabs,.window-caption,.typed-line,.system-monitor,.info-cards,.chips').count()).toBe(0);
});
test('desktop reflows without overflow and passes WCAG at 1280 and 1024', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockData(page);
  for (const width of [1280, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await ready(page);
    for (const id of ['top','projects','stack','telemetry','repositories','activity','contact']) {
      await page.locator(`#${id}`).evaluate(node => node.scrollIntoView({ behavior: 'instant' }));
      expect(await overflow(page)).toEqual([]);
    }
    expect(await page.evaluate(() => document.scrollingElement.scrollWidth)).toBe(width);
  }
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(results.violations.map(issue => ({ id: issue.id, nodes: issue.nodes.map(node => node.target) }))).toEqual([]);
});
test('desktop without JavaScript keeps the SVG fallbacks readable', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('#telemetry .panel-fallback')).toBeVisible();
  await expect(page.locator('#telemetry-component')).not.toBeVisible();
  await expect(page.locator('.cards .card')).toHaveCount(3);
  await expect(page.locator('.stack-component')).toBeVisible();
  expect(await overflow(page)).toEqual([]);
  await context.close();
});
test('critical CSS paints the fold exactly like the full stylesheets', async ({ browser }) => {
  const props = ['display', 'position', 'width', 'height', 'margin-top', 'padding-top', 'font-size', 'line-height',
    'font-family', 'font-weight', 'letter-spacing', 'color', 'background-color', 'background-image', 'background-clip',
    '-webkit-text-fill-color', 'text-shadow', 'border-radius', 'border-top-width', 'border-top-color',
    'flex-direction', 'justify-content', 'align-items', 'grid-template-columns', 'opacity', 'visibility', 'transform',
    'fill', 'stroke', 'stroke-width', 'stroke-dasharray'];
  // JavaScript stays off in both contexts so the markup is identical; the second one never
  // gets the full sheets, so what it paints is the inlined critical layer and nothing else.
  const grab = ({ fold, list }) => {
    const keep = [];
    [...document.querySelectorAll('body *')].forEach((node, index) => {
      const box = node.getBoundingClientRect();
      // A zero-width or zero-height box is still painted (an SVG line); display:none is both.
      if (!((box.width > 0 || box.height > 0) && box.top < fold)) return;
      const style = getComputedStyle(node);
      keep.push({
        index, bottom: Math.round(box.bottom), values: list.map(prop => style[prop]),
        element: `${node.tagName.toLowerCase()}${node.id ? '#' + node.id : ''}.${node.getAttribute('class') || ''}`.slice(0, 60)
      });
    });
    return keep;
  };
  for (const [width, height] of [[390, 844], [1280, 900]]) {
    const options = { javaScriptEnabled: false, viewport: { width, height }, reducedMotion: 'reduce' };
    const full = await browser.newContext(options);
    const critical = await browser.newContext(options);
    await critical.route('**/assets/*.css', route => route.abort());
    const a = await full.newPage(); await a.goto('/');
    const b = await critical.newPage(); await b.goto('/');
    const reference = new Map((await a.evaluate(grab, { fold: height, list: props })).map(entry => [entry.index, entry]));
    const painted = await b.evaluate(grab, { fold: height, list: props });
    const diffs = [];
    for (const entry of painted) {
      const wanted = reference.get(entry.index);
      if (!wanted) continue;
      props.forEach((prop, position) => {
        // A layer trimmed to the fold cannot size the content stacked below it.
        if (prop === 'height' && entry.bottom > height + 1) return;
        if (wanted.values[position] !== entry.values[position])
          diffs.push({ element: entry.element, prop, full: wanted.values[position], critical: entry.values[position] });
      });
    }
    expect(diffs.slice(0, 20), `${width}x${height}: ${diffs.length} above-the-fold paint diffs`).toEqual([]);
    await full.close(); await critical.close();
  }
});
test('critical CSS keeps the mobile first paint inside the viewport', async ({ browser }) => {
  // An unconstrained width="1280" fallback panel widens the layout viewport, and mobile
  // browsers shrink-to-fit around it: every fixed element then lands somewhere else and
  // jumps back when the sheets arrive. That jump is the 0.07 CLS this test guards.
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 412, height: 823 } });
  await context.route('**/assets/*.css', route => route.abort());
  const page = await context.newPage();
  await page.goto('/');
  const wide = await page.evaluate(() => {
    const de = document.documentElement;
    return { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, dockTop: Math.round(document.querySelector('.mobile-dock').getBoundingClientRect().top) };
  });
  expect(wide).toEqual({ scrollWidth: 412, clientWidth: 412, dockTop: 766 });
  await context.close();
});
test('200 percent text scaling reflows at 320 CSS pixels', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockData(page); await ready(page);
  await page.addStyleTag({ content: 'html{font-size:200%}' });
  for (const id of ['top','projects','stack','telemetry','repositories','activity']) {
    await page.locator(`#${id}`).evaluate(node => node.scrollIntoView({ behavior: 'instant' }));
    expect(await overflow(page)).toEqual([]);
  }
});
test('partial data keeps the unavailable contribution snapshot visible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const stats = fixture(); stats.contributions = null; stats.status = 'partial';
  await mockData(page, stats); await ready(page);
  await expect(page.locator('#telemetry-component')).toContainText('CONTRIBUTIONS');
  await expect(page.locator('#telemetry-component')).toContainText('UNAVAILABLE');
  await expect(page.locator('#telemetry-component img')).toBeVisible();
  await expect(page.locator('.sync-line')).toContainText('PARTIAL SYNC');
  await expect(page.locator('.activity-card')).toContainText('Activity mix is unavailable');
  await expect(page.locator('.contributed-list a')).toHaveCount(3);
});
test('zero contribution mix stays honest and keeps valid geometry', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const stats = fixture(); stats.contributions.types = { commits: 0, issues: 0, pullRequests: 0, codeReviews: 0 };
  await mockData(page, stats); await ready(page);
  const card = page.locator('.activity-card');
  await expect(card).toContainText('No classified contributions in this window yet.');
  await expect(card).toContainText('0%');
  const points = await card.locator('.radar-shape').getAttribute('points');
  expect(points).not.toContain('NaN');
  expect(points.trim().split(/\s+/)).toHaveLength(4);
});
test('activity overview shows the contribution mix and contributed repositories', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockData(page); await ready(page);
  const card = page.locator('.activity-card');
  await expect(card).toContainText('ACTIVITY OVERVIEW');
  await expect(card.locator('.radar-label')).toHaveCount(4);
  await expect(card).toContainText('95%');
  await expect(card).toContainText('Commits');
  await expect(card.locator('.radar-shape')).toHaveCount(1);
  await expect(card.locator('.contributed-list a')).toHaveCount(3);
  await card.scrollIntoViewIfNeeded();
  expect(await overflow(page)).toEqual([]);
});
test('activity overview degrades honestly without a type breakdown', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const stats = fixture(); delete stats.contributions.types; stats.status = 'partial';
  await mockData(page, stats); await ready(page);
  const card = page.locator('.activity-card');
  await expect(card).toContainText('authenticated data refresh');
  await expect(card.locator('.radar-svg')).toHaveCount(0);
  await expect(card.locator('.contributed-list a')).toHaveCount(3);
  await card.scrollIntoViewIfNeeded();
  expect(await overflow(page)).toEqual([]);
});
test('empty data and long descriptions stay accessible and untruncated', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const stats = fixture(); stats.events = []; stats.languages = []; stats.bytesTotal = 0;
  stats.repos[0].desc = 'A complete description '.repeat(30);
  await mockData(page, stats); await ready(page);
  await expect(page.locator('.repo-card').first()).toContainText(stats.repos[0].desc.trim());
  await expect(page.locator('#activity-component')).toContainText('No recent public events.');
  await expect(page.locator('.language-card')).toContainText('No language data yet.');
  expect(await overflow(page)).toEqual([]);
});
test('relative times advance without image regeneration', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const stats = fixture(); stats.generatedAt = new Date(Date.now() - 30000).toISOString();
  await page.clock.install();
  await mockData(page, stats); await ready(page);
  await expect(page.locator('.footer-sync')).toContainText('just now');
  await page.clock.fastForward(120000);
  await expect(page.locator('.footer-sync')).toContainText('2 minutes ago');
});
test('Ironbot, reactor and motion budget respond to touch settings', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockData(page); await ready(page);
  await expect(page.locator('#flyer')).toBeVisible();
  await page.locator('#flyer-btn').evaluate(node => node.click());
  await expect(page.locator('#flyer-btn')).toHaveAttribute('aria-pressed','true');
  await page.locator('.reactor-button').click();
  await expect(page.locator('.reactor-button')).toHaveClass(/is-pulsing/);
  expect(await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running' && animation.effect.getTiming().iterations === Infinity && !(animation.effect.target instanceof Element && animation.effect.target.closest('.x-orb'))).length)).toBeLessThanOrEqual(6);
  await page.locator('#explorer-open').click();
  await page.locator('#mobile-flyer-toggle').click();
  await expect(page.locator('#mobile-flyer-toggle')).toHaveAttribute('aria-pressed','false');
  await page.keyboard.press('Escape');
  await expect(page.locator('#flyer')).not.toBeVisible();
});
test('an Ironbot switched off under its old name stays off', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('skybot','off'));
  await mockData(page); await ready(page);
  await expect(page.locator('#flyer')).not.toBeVisible();
  await expect(page.locator('#mobile-flyer-toggle')).toContainText('Ironbot: off');
});
test('capture mobile panels after entrance animations settle', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('ironbot','off'));
  await mockData(page); await ready(page);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: testInfo.outputPath('mobile-hero.png') });
  await page.locator('.reactor-button').screenshot({ path: testInfo.outputPath('reactor-124.png') });
  for (const id of ['stack','telemetry','repositories','activity']) {
    await page.locator(`#${id}`).evaluate(node => node.scrollIntoView({ behavior:'instant' }));
    await page.waitForTimeout(2000);
    await page.locator(`#${id}`).screenshot({ path: testInfo.outputPath(`${id}-390.png`) });
  }
});
