# SUJEL.OS — dual-theme product requirements document

Status: implementation in progress · Scope: `md-mahfujur-rahman-sujel.github.io`

This document covers the next version of the site: **one page, two themes**.

- **Light theme — "Liquid Glass Light":** the current Liquid Glass design (five one-screen views, clear glass, CSS 3D objects, aurora), re-tuned as a true light theme.
- **Dark theme — "Stark Dark":** the earlier Iron Man / arc-reactor identity, rebuilt as a thin theme layer on top of the Liquid Glass structure instead of the old 190 KB stack.

`PRD.md` and `OS-DESIGN-BRIEF.md` describe the previous Iron Man build (`index-v1.html`) and are kept untouched for history. Where this document and `PRD.md` disagree, this document wins for anything the live `index.html` renders.

**Principle:** one structure, two skins. Content, routing, data and layout are shared; only tokens, materials and a few decorative elements change per theme. The new version must be *lighter* than what it replaces.

---

## 1. Goals and non-goals

### Goals
1. Keep the Liquid Glass design the owner likes, as the light theme.
2. Bring back the Iron Man resemblance (arc reactor, HUD, gold/blue/red accents, telemetry feel) as the dark theme.
3. Make the site more efficient: smaller payload, less GPU work, fewer files, faster first paint.
4. Let visitors switch themes at any time, with no flash of the wrong theme on load.
5. Keep the phone experience fixed: full hero visible, no horizontal-swipe panels.

### Non-goals
- No framework, bundler or build step needed to serve the site (the repo root is the site).
- No backend, analytics or third-party runtime requests.
- No third theme, no user-defined colours.
- No 3D/WebGL layer.

---

## 2. Audience and surfaces

Audience: recruiters and engineers arriving from the GitHub profile, LinkedIn or a CV link.

| Surface | Width | Navigation |
| --- | --- | --- |
| Desktop | 901px and up | Floating glass top bar with sliding pill, theme toggle, keys 1–5 and arrows |
| Phone / tablet | 900px and under | Floating glass tab bar, theme toggle in the top bar |

Both themes work on both surfaces, and without JavaScript (see 5.5).

---

## 3. Current state (baseline)

| Item | Today |
| --- | --- |
| Live page | `index.html` + `assets/liquid.css` (≈19 KB) + `assets/liquid.js` (≈10 KB) |
| Look | Dark navy page, colourful aurora, clear glass, `color-scheme: dark` |
| Old Iron Man stack | `index-v1.html` (≈76 KB) + `site.css`, `glass-v2.css`, `mobile.css`, `polish.css`, `os.*`, `assistant.*`, `motion-extras.*`, `fx-v2.js`, `ironbot.js`, `site.js` (≈190 KB CSS/JS) + SVG panels (≈125 KB) — **not loaded** by the live page |
| Social card | `assets/og-card.png`, ≈366 KB |
| Tests | Playwright suites and `critical-css.cjs` target the old DOM |

Baseline to beat: live CSS + JS ≈ 29 KB.

---

## 4. Theme definitions

### 4.1 Light — "Liquid Glass Light"
- **Background:** pale cool white-blue (`#EEF3FF` range) with a soft pastel aurora (blue, violet, cyan, a little pink).
- **Glass:** white tint (≈55–70% opacity), blur plus saturate, a darker 1px rim for definition, soft blue-tinted shadows.
- **Text:** deep navy ink. Muted text must still pass contrast (see 6.3).
- **Accent:** blue/violet. Primary button is solid dark navy with white text.
- **Hero objects:** orbs, cube and ring (current CSS 3D stage), recoloured for a light background.
- **Tone:** calm, friendly, modern.

### 4.2 Dark — "Stark Dark"
- **Background:** near-black navy (`#05080D` range) with a faint 32px grid and low-opacity blue/gold/maroon radial glows, as in the previous design.
- **Glass:** dark translucent fill, thin cyan/ice rim, corner brackets on cards and panels.
- **Text:** `#EEF6FF` primary, `#93A6BA` muted.
- **Accent:** reactor blue/cyan for structure, **gold `#FBCA03`** for the active nav item, kickers and primary button, **small red `#E10F19`** only on status lights, the brand dot and the reactor core.
- **Hero objects:** CSS arc reactor (rotating conic-gradient rings and a glowing core) replacing the orbs and cube; floating tiles/chips become HUD readouts (`STREAK 25D`, `PROJECTS 04`).
- **Extras:** optional first-visit boot line, telemetry arc gauges, optional Ironbot mascot (lazy, see 5.7).
- **Tone:** technical, cinematic.

### 4.3 What is shared
HTML structure and content, the five views, routing and keyboard controls, the sliding pill, pointer glare and card tilt, stats loading, heatmap and feed, and all copy. Colours, glass material, hero decoration and a few ornaments differ per theme.

---

## 5. Functional requirements

### 5.1 Theme model
- Theme is stored as `data-theme="light" | "dark"` on `<html>`.
- **First visit:** follow `prefers-color-scheme`. If the browser expresses no preference, use **dark**.
- **Manual choice** overrides the system preference and is saved in `localStorage` under key `sujel-theme`. Every `localStorage` read and write is wrapped in try/catch (private mode, blocked storage).
- If the user never chose manually, a change in the system preference updates the theme live.

### 5.2 Toggle
- Desktop: icon button in the top bar, next to "Say hello".
- Phone: icon button in the top bar (the tab bar keeps its five view tabs).
- It is a real `<button>` with `aria-pressed` (or a label that names the action, e.g. "Switch to light theme"), visible focus ring, 44×44px minimum touch target.
- Shortcut: `T` toggles the theme (not while typing in a field).
- Switching crossfades colours over ≈200–300ms; instant under reduced motion.

### 5.3 No flash of wrong theme
- A tiny inline script in `<head>`, before the stylesheet, reads the saved choice or system preference and sets `data-theme` before first paint.
- The same script sets `<meta name="theme-color">` and `color-scheme` to match.
- It must be under 1 KB and must not block on any network request.

### 5.4 Token architecture (CSS)
- `liquid.css` keeps structure and layout. Every colour used for text, borders, rims, highlights, fills and shadows becomes a CSS variable.
- Roughly 40 hardcoded `#fff` / `rgba(255,255,255,…)` values (glass rim, highlights, chips, white button, headline gradient, heatmap levels) are replaced with variables.
- Theme values live in two blocks, `[data-theme="light"]` and `[data-theme="dark"]`, in one file. A second stylesheet is allowed only for dark-only ornaments (reactor, brackets, grid) if it keeps the single-file total under the budget in 6.1.
- No `@supports`, `@layer` or nesting, to stay compatible with `scripts/critical-css.cjs`. No `var()` inside a shorthand that shares a rule with its longhands.

### 5.5 No-JavaScript behaviour
- Without JS the page stays a normal scrolling document with every view visible.
- Theme without JS: CSS `@media (prefers-color-scheme: light)` on `:root:not([data-theme])` provides the light tokens; otherwise dark. The toggle is hidden without JS.

### 5.6 Per-theme decoration
- Light shows orbs, cube and ring; dark shows the arc reactor, HUD readouts and grid. The inactive set is `display:none` so it costs no animation or paint.
- Looping animations are desktop-only and pause on hidden views, on a hidden tab, and under reduced motion.

### 5.7 Dark-theme extras (lazy)
- **Boot line:** one short typed "SUJEL.OS" line on the first dark-theme visit per session (`sessionStorage`), skippable with any key or click, never shown on phones or under reduced motion.
- **Telemetry gauges:** streak and total contributions as CSS conic-gradient arc gauges (replaces the 51 KB `telemetry.svg` idea).
- **Ironbot (optional):** loads `mascot.svg` and `ironbot.js` (≈33 KB) only when the theme is dark, on desktop, after idle, and with reduced motion off. It keeps its existing frame-time watchdog (switches itself off if frames stay above 24ms for three seconds) and its `ironbot` off-switch in `localStorage`. Never loaded in the light theme.
- **Command palette and FAQ assistant:** not in the first load. Either load on first interaction (Ctrl/Cmd+K or the assistant button) or drop; decision in section 10.

### 5.8 Views and content
The five views (Home, Work, About, Stats, Contact), their copy, links and structured data are unchanged. Stats come from `data/stats.json` as today; the heatmap DOM is built the first time the Stats view opens.

---

## 6. Non-functional requirements

### 6.1 Performance budgets
| Metric | Budget |
| --- | --- |
| Critical-path CSS + JS (both themes, no extras) | ≤ 40 KB raw (baseline 29 KB + ≈5 KB theme layer) |
| Lazy dark extras (Ironbot, palette, assistant) | not on the critical path; each loaded on demand |
| Lighthouse mobile — performance | ≥ 0.90 (both themes) |
| Accessibility / best practices | ≥ 0.95 |
| LCP | ≤ 2500 ms |
| CLS | ≤ 0.05 |
| `og-card.png` | ≤ 100 KB |

### 6.2 GPU and animation
- Aurora: 2 blurred blobs on desktop (down from 4 blobs + 2 ribbons); a static gradient on phones.
- Animate only `transform` and `opacity`. Add `contain: layout paint` to each `.view`.
- Backdrop blur only on large surfaces (top bar, tab bar, cards); dense panels use flat translucent fills on phones.
- Mobile keeps the motion budget: no looping animation other than ambient glows.

### 6.3 Accessibility
- Zero axe violations in both themes, on every view, and with the toggle focused.
- WCAG AA contrast (4.5:1 body, 3:1 large text and UI) measured on the real glass-over-aurora backgrounds, not just flat colours. Light-theme muted text and pastel glass are the highest-risk area.
- `prefers-reduced-motion` removes all animation and transitions, including the theme crossfade and hover transforms.
- Keyboard parity: toggle, view tabs, cards and any lazy extras all work without a pointer.

### 6.4 Privacy
No analytics, no third-party runtime requests. Client state is limited to `sujel-theme`, `ironbot` and the boot-line `sessionStorage` flag.

### 6.5 Browser support
Evergreen Chrome, Edge, Safari, Firefox. `backdrop-filter` is progressive enhancement: translucent fills must stay readable without it.

---

## 7. Repository and asset hygiene

- Move `index-v1.html` and the unused old assets (`site.css`, `glass-v2.css`, `mobile.css`, `polish.css`, `os.*`, `assistant.*`, `motion-extras.*`, `fx-v2.js`, `site.js`, and the old SVG panels that nothing references) into `/legacy`, or delete them. Git history keeps them either way. Anything reused (Ironbot files) stays in `assets/`.
- Confirm `node_modules`, `test-results` and `.validation` are not published (check `.gitignore` and the Pages source).
- Regenerate `og-card.png` for the default theme, ≤ 100 KB, and update the `og:image:alt` text.
- `favicon.svg` should read on light and dark browser chrome (use `prefers-color-scheme` inside the SVG or a neutral mark).

---

## 8. Delivery plan

| Phase | Work | Done when |
| --- | --- | --- |
| 1. Tokens | Replace hardcoded colours in `liquid.css` with variables; current look reproduced exactly under dark tokens | Visual diff of the old look is clean |
| 2. Light theme | Light tokens, light glass material, pastel aurora, recoloured hero objects | AA contrast passes on all five views |
| 3. Switching | Inline head script, toggle button, `T` key, persistence, crossfade, no-JS fallback | No flash on reload in either theme |
| 4. Stark Dark | Gold/blue/red palette, grid, brackets, reactor hero, HUD tiles, gold heatmap | Dark theme matches the Iron Man reference closely |
| 5. Dark extras | Telemetry gauges, boot line, lazy Ironbot (and palette/assistant if kept) | Extras absent from the critical path in Lighthouse |
| 6. Efficiency | Aurora reduction, pause-when-hidden, `contain`, lazy heatmap, OG card, legacy cleanup | Budgets in 6.1 met |
| 7. Tests and docs | Update Playwright suites for five views × two themes, axe in both, Lighthouse check; update README references | `npm test` and `npm run test:performance` pass |

Order matters: phase 1 must land before anything else, because both themes depend on the variable refactor.

---

## 9. Test plan

- **Playwright:** each view in each theme at desktop and phone widths; theme toggle, `T` shortcut, persistence across reload, system-preference change, no-JS render.
- **No-flash check:** load with a saved dark choice under a light system preference (and the reverse); the first painted frame has the correct `data-theme`.
- **axe:** all views, both themes, toggle focused, any extra open.
- **Lighthouse mobile:** both themes against the 6.1 budgets.
- **Reduced motion:** emulate `prefers-reduced-motion`; no running animations or transitions.
- **Payload check:** assert the critical-path byte total and that Ironbot files are not requested in the light theme or on phones.
- **Visual review:** screenshot each view in each theme next to the Figma file and `index-v1.html` for the dark theme.

---

## 10. Risks and open decisions

| Item | Note |
| --- | --- |
| Light-theme contrast | Pastel glass over a pale aurora can fail AA. Mitigation: stronger text colours and a slightly more opaque glass tint, verified on real backgrounds. |
| Colour refactor regressions | ≈40 hardcoded values touched. Mitigation: phase 1 is a no-visual-change refactor with screenshot diffs. |
| Test churn | Existing suites target the old DOM. Budget time in phase 7. |
| Figma reference | The Figma file could not be read automatically; the dark theme is based on `index-v1.html` and `assets/site.css`. Confirm against Figma during phase 4. |
| Accent rule | Resolved: gold is the main dark accent; red appears only on the brand/status light and reactor core. |
| Default with no system preference | Resolved: use dark. |
| Palette and FAQ assistant | Resolved: excluded from this version; the shared five-view navigation is the only shell interaction. |
| Ironbot | Resolved: retired from the live page and retained with the legacy build. |

---

## 11. Rollback

The theme layer is additive. To roll back to the single Liquid Glass look: remove the dark token block and dark-only ornaments, delete the toggle and the inline head script, and set the light or dark token block as the only `:root`. No content or data depends on the theme system.

---

## 12. Success criteria

1. Both themes ship, switch instantly, and persist without a flash.
2. Dark theme is recognisably the Iron Man design; light theme is recognisably the current Liquid Glass.
3. Critical-path CSS + JS ≤ 40 KB; all Lighthouse and axe gates pass in both themes.
4. Repo contains no unused legacy assets in the published root.
