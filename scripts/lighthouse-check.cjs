const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { launch } = require('chrome-launcher');
const lighthouseRunner = require('lighthouse').default;
const { start, root } = require('./serve.cjs');

const PORT = 8766;
const BUDGETS = {
  performance: 0.9,
  accessibility: 0.95,
  'best-practices': 0.95,
  lcp: 2500,
  cls: 0.05
};

(async () => {
  const server = await start(PORT);
  const results = {};
  const failures = [];
  try {
    for (const theme of ['light', 'dark']) {
      const chrome = await launch({
        chromePath: chromium.executablePath(),
        chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', ...(theme === 'dark' ? ['--force-dark-mode'] : [])]
      });
      try {
        const run = await lighthouseRunner(`http://127.0.0.1:${PORT}/`, {
          port: chrome.port,
          output: 'json',
          logLevel: 'error',
          onlyCategories: ['performance', 'accessibility', 'best-practices']
        });
        const report = run.lhr;
        if (report.runtimeError) throw new Error(`${theme}: ${report.runtimeError.code} ${report.runtimeError.message}`);
        const scores = Object.fromEntries(Object.entries(report.categories).map(([key, value]) => [key, value.score]));
        const lcp = report.audits['largest-contentful-paint'].numericValue;
        const cls = report.audits['cumulative-layout-shift'].numericValue;
        const metrics = { lcp: Number.isFinite(lcp) ? Math.round(lcp) : null, cls: Number.isFinite(cls) ? Number(cls.toFixed(3)) : null };
        for (const key of ['performance', 'accessibility', 'best-practices']) {
          if (scores[key] < BUDGETS[key]) failures.push(`${theme}: ${key} ${Math.round(scores[key] * 100)} < ${Math.round(BUDGETS[key] * 100)}`);
        }
        if (metrics.lcp == null || metrics.cls == null) failures.push(`${theme}: Lighthouse LCP/CLS metrics missing`);
        if (metrics.lcp > BUDGETS.lcp) failures.push(`${theme}: LCP ${metrics.lcp}ms > ${BUDGETS.lcp}ms`);
        if (metrics.cls > BUDGETS.cls) failures.push(`${theme}: CLS ${metrics.cls} > ${BUDGETS.cls}`);
        const output = path.join(root, '.validation', `lighthouse-${theme}-report.json`);
        fs.mkdirSync(path.dirname(output), { recursive: true });
        fs.writeFileSync(output, JSON.stringify(report));
        results[theme] = { scores, metrics, report: path.relative(root, output) };
      } finally { await chrome.kill(); }
    }
    console.log(JSON.stringify({ results, budgets: BUDGETS, failures }, null, 2));
    if (failures.length) process.exitCode = 1;
  } finally { await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exit(1); });
