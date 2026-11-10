const fs = require('node:fs');
const path = require('node:path');
const { expect } = require('@playwright/test');

function fixture() {
  const stats = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/stats.json'), 'utf8'));
  const now = new Date();
  const days = Array.from({ length: 364 }, (_, index) => {
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 363 + index));
    return { date: day.toISOString().slice(0, 10), count: index % 9 === 0 || index > 360 ? index % 7 + 1 : 0 };
  });
  stats.generatedAt = now.toISOString();
  stats.status = 'ok';
  stats.contributions = {
    asOf: days.at(-1).date,
    total: days.reduce((sum, day) => sum + day.count, 0), windowDays: 364,
    activeDays: days.filter(day => day.count).length,
    peak: { date: days[6].date, count: 7 },
    currentStreak: { days: 3, from: days.at(-3).date, to: days.at(-1).date },
    longestStreak: { days: 3, from: days.at(-3).date, to: days.at(-1).date },
    types: { commits: 95, issues: 0, pullRequests: 5, codeReviews: 0 },
    days,
    weeks: Array.from({ length: 52 }, (_, index) => ({ start: days[index * 7].date, count: days.slice(index * 7, index * 7 + 7).reduce((sum, day) => sum + day.count, 0) }))
  };
  stats.events = [0, 1, 2].map(index => ({ id: String(index), type: 'push', at: new Date(Date.now() - (index + 1) * 3600000).toISOString(), repo: 'md-mahfujur-rahman-sujel/Apex-Arcade', summary: 'Pushed to main' }));
  return stats;
}

async function mockData(page, stats = fixture()) {
  await page.route('**/data/stats.json', route => route.fulfill({ json: stats }));
}

async function ready(page) {
  await page.goto('/');
  await expect(page.locator('#repositories')).toHaveClass(/has-data/);
}

async function overflow(page) {
  return page.evaluate(() => [...document.querySelectorAll('body *')].filter(node => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && style.display !== 'none' && style.visibility !== 'hidden' && !node.closest('svg,.sr-only,#flyer,.x-orb,dialog:not([open])') && ((node.scrollWidth > node.clientWidth + 1 && node.clientWidth > 0 && !['inline', 'contents'].includes(style.display)) || rect.right > innerWidth + 1 || rect.left < -1);
  }).map(node => ({ tag: node.tagName, class: node.className, width: node.clientWidth, scroll: node.scrollWidth })));
}

const violations = results => results.violations.map(issue => ({ id: issue.id, nodes: issue.nodes.map(node => node.target) }));

module.exports = { fixture, mockData, ready, overflow, violations };
