# SUJEL.OS

A static, five-view portfolio with Liquid Glass Light and Stark Dark themes. GitHub Pages serves the files directly from the repository root; the site has no framework, server runtime, analytics, or third-party requests.

## Work locally

Run `npm run dev` and open `http://localhost:8765`. Edit `assets/liquid.css` and `assets/liquid.js`, then run `npm run build:assets` to refresh the minified files used by the page.

## Checks

- `npm test` — navigation, theme behavior, mobile layout, and axe checks across views and themes.
- `npm run test:critical` — CSS and JavaScript critical-path budget (40 KB raw).
- `npm run test:performance` — Lighthouse budgets for both themes.
- `npm run test:data` — GitHub snapshot generator tests.

The live theme follows the visitor's system preference on first visit and remembers a manual choice in local storage. The dual-theme product requirements are in [`PRD-DUAL-THEME.md`](PRD-DUAL-THEME.md).
