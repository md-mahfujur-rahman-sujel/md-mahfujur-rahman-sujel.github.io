# SUJEL.OS

A static, one-page portfolio (Home, Work, About, Stats, Contact as sections of one long scroll) with Liquid Glass Light and Stark Dark themes. GitHub Pages serves the files directly from the repository root; the site has no framework, server runtime, analytics, or third-party requests.

## Work locally

Run `npm install` once, then `npm run dev` and open `http://localhost:8765`. Edit `assets/liquid.css` and `assets/liquid.js`, then run `npm run build:assets` to refresh the minified files used by the page. The same command copies GSAP and ScrollTrigger from `node_modules` into `assets/vendor/`.

## Scroll motion

`assets/motion.js` adds the GSAP scroll choreography. It loads after the page is interactive, is skipped for reduced motion and data saver, and the page works without it. **`assets/motion.js` and `assets/vendor/` must be committed**, because GitHub Pages serves them straight from the repository.

## Interaction

`assets/interact.js` is a lazy layer (starts on the first pointer, scroll or key event): project cards open a detail dialog and show a hover peek (repo facts come from `data/stats.json`), and the home globe, contact globe and arc reactor can be dragged to spin. It is committed as-is (not part of the minified build).

## Checks

- `npm test` — navigation, theme behavior, mobile layout, and axe checks across sections and themes.
- `npm run test:critical` — CSS and JavaScript critical-path budget (64 KB raw; `motion.js` and GSAP load later and are not counted).
- `npm run test:performance` — Lighthouse budgets for both themes.
- `npm run test:data` — GitHub snapshot generator tests.

The live theme follows the visitor's system preference on first visit and remembers a manual choice in local storage. The dual-theme product requirements are in [`PRD-DUAL-THEME.md`](PRD-DUAL-THEME.md).
