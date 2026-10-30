# SUJEL.OS Mobile Redesign: Product Requirements Document

*Draft v1.0 · 29 Oct 2026 · Scope: md-mahfujur-rahman-sujel.github.io on phone-size screens (900 px and below) · Based on a review of the live site and the local repo*

## 1. Summary

On a phone, the site hides its main "workspace" hero and shows four dashboard panels as wide images that have to be swiped sideways. This PRD defines a phone-first redesign in which every element of the web version is present and readable without horizontal scrolling, and the page feels alive through one small, consistent motion system.

Three outcomes:

1. **Full parity.** Everything on the web version appears on the phone, reflowed rather than shrunk.
2. **No sideways swiping.** All content fits the screen width; the page scrolls in one direction.
3. **Smooth, lively motion.** Purposeful animation that respects battery, performance and reduced-motion settings.

Desktop (above 900 px) is unchanged in Phases 1 to 3.

## 2. Problem and evidence

What a phone visitor sees today, and why. Every item below comes from the current `index.html` and `assets/`.

1. **The hero is removed, not adapted.** Below 820 px, `.hero{display:none}` swaps the 1280×500 workspace graphic for a simplified card (`.mhero`). Missing on phones: the window title bar and quick-open pill, the activity rail, the Explorer file tree, the tab strip, the arc reactor, the System Monitor radar and bars, and the status bar. This is the "top part is hidden" problem.
2. **Four panels need sideways swiping.** Stack, Telemetry, Repository index and Activity are static SVG images, 1280 px wide by design, forced to `min-width: 860px` inside a scroll container with a "swipe sideways" hint. On a 390 px phone under half of each panel is visible, and 9.5 px labels render at about 6 px.
3. **Shrinking is not an option.** Fitting the 1280 px art to a 390 px screen scales text to about 30% (12 px becomes about 3.7 px). The panels must be rebuilt as responsive components.
4. **Decorative controls.** Tabs, filter chips (ALL / OWNED / COLLAB / LANGS) and "open repository" buttons drawn inside the images look tappable but do nothing. Text cannot be selected, and screen readers only get the alt text.
5. **The header eats space.** Below 900 px the sticky header stacks into two rows with a horizontally scrolling nav: roughly 90 px of a 700 px viewport, one more sideways scroller, and tap targets about 30 px tall (the minimum should be 44 px).
6. **Motion is passive.** Animation lives inside the images and plays whether or not it is on screen. On phones Ironbot is off by default, the reactor reacts only to a mouse pointer, hover effects have no touch equivalent, nothing reveals on scroll, and numbers never count up.
7. **Stale numbers.** Relative times such as "UPDATED 6D AGO" and "22H AGO" are baked into the images when the 3-hourly GitHub Action runs, and keep that wording until the next run. The generator is not in this repo.
8. **Housekeeping.** The 820 px block still carries dead rules (`.hero{overflow-x:auto}`, `.hero svg{min-width:900px}`). Breakpoints disagree (820 vs 900). There is no `viewport-fit=cover` or safe-area handling. The hero SVG's inline `<style>` defines generic class names (`.s`, `.m`, `.t`, `.bar`, `.rise`) that apply to the whole document and will collide with new components.

## 3. Goals, non-goals and success metrics

**Goals**

- G1. Every desktop hero element has a phone equivalent (section 6.2).
- G2. Zero horizontal scrollers for content at 320 to 900 px.
- G3. A motion system that makes the phone version feel lively and responsive to touch.
- G4. Panels become real components: tappable, selectable, accessible and always showing correct relative times.

**Non-goals**

- Changing the visual identity (palette, mono labels, window chrome, Ironbot character).
- Changing the desktop layout in Phases 1 to 3.
- Adding new content sections, a blog, a contact form or analytics.
- Redesigning the GitHub profile README (it keeps its SVG panels).

**Success metrics**

| Metric | Target |
| --- | --- |
| Horizontal overflow | `document.scrollingElement.scrollWidth` equals viewport width; no content container scrolls sideways at 320 to 900 px |
| Hero parity | 12 of 12 elements in the section 6.2 table present |
| Legibility | Body text 14 px or more; mono micro-labels 11 px or more; contrast 4.5:1 or better |
| Tap targets | 44×44 px minimum for every control |
| Lighthouse (mobile, throttled) | Performance 90+, Accessibility 95+, Best Practices 95+ |
| Core Web Vitals | LCP 2.5 s or less, CLS 0.05 or less, INP 200 ms or less |
| Smoothness | 55 fps or better while scrolling on a mid-range Android; no frame over 50 ms |
| Data freshness | Relative times computed in the browser from timestamps |

## 4. Devices and breakpoints

- **Compact layout: 900 px and below.** Replaces today's 820 / 900 split. Single column; 2-column grids from 600 px.
- **Desktop: above 900 px.** Unchanged.
- **Test sizes:** 320×568, 360×800, 390×844, 412×915, 430×932, 600×960 (small tablet), landscape 844×390. Landscape phones wider than 900 px fall to the desktop layout; revisit during QA.
- **Browsers:** iOS Safari 16+, Chrome for Android 110+, Samsung Internet, Firefox for Android.

## 5. Design principles

1. **Reflow, don't shrink.** Layouts rearrange; type size stays readable.
2. **Nothing hidden.** If it is on the web version, it is on the phone.
3. **One scroll direction.** No carousels or swipe rows for core content.
4. **Touch first.** No feature depends on hover.
5. **Balanced motion.** A few signature moves (rotating rings, moving data, typed lines) used consistently, not motion everywhere.
6. **Performance is a feature.** Animate transform and opacity only; pause what is off screen.
7. **Keep the SUJEL.OS identity.**

## 6. Requirements

Priorities: **P0** ships in Phase 1, **P1** in Phase 2 or 3, **P2** is optional.

### 6.1 App shell

- **S-1 (P0) Compact top bar.** 52 px plus safe-area inset. Logo mark and SUJEL.OS on the left, a "workspace — main" caption, a LIVE pill, and a quick-open button (replacing the ⌘K pill) that opens the Explorer sheet. The two-row header and the scrolling nav row are removed. GitHub and LinkedIn move to the hero chips and the Explorer sheet.
- **S-2 (P0) Bottom dock.** 56 px plus bottom safe-area inset, five items mirroring the desktop activity rail: Home, Projects, Stack, Stats (telemetry and repositories), Activity. The active item follows scroll position and a pill indicator slides between items. The dock hides on scroll down and returns on scroll up.
- **S-3 (P0) Explorer sheet.** A bottom sheet built from the desktop sidebar: about.md, projects/ (Apex-Arcade, Unrot, Oppzy), stack.json, telemetry.log, activity.log, plus the "GIT main · 3 projects" footer. Entries scroll to their section; project entries open the repo. Includes the Ironbot and "reduce motion" toggles (the desktop gear icon). Drag to dismiss; focus is trapped; Esc and the back gesture close it.
- **S-4 (P0) Hero tab strip.** The four tabs from the desktop window (about.md, projects/, stack.json, telemetry.log) fill the card width without scrolling and act as smooth-scroll links.

### 6.2 Hero parity

| Desktop element | Phone treatment |
| --- | --- |
| Window title bar: logo, SUJEL.OS, file / edit / view / run, "workspace — main", ⌘K pill, window dots | Top bar (S-1); the menu words become the Explorer sheet header |
| Activity rail (5 icons) | Bottom dock (S-2); settings icon becomes the gear in the Explorer sheet |
| Explorer tree, Git branch, "3 projects" | Explorer sheet (S-3), plus a collapsed "main · 3 projects" line at the foot of the hero |
| Tab strip | Four-tab strip inside the hero window (S-4) |
| Arc reactor and ONLINE pill | 112 to 128 px reactor centred above the name, same layered art; tap triggers a pulse |
| Name, role, education | Identity block; name wraps to two lines, sized with `clamp()` |
| Three rotating typed lines | Same lines, typed with a blinking cursor, rotating every 4 s |
| CSE · EWU · DHAKA · BD tags | Chip row under the identity block |
| System Monitor: radar sweep, STATUS / PROJECTS / STACK / REFRESH with bars | Full-width card: 96 px radar on the left, four rows with animated bars on the right |
| Three info cards: Education, Focus, Shipping | Three stacked cards (icon, headline, sub-line, progress hairline); never three-up below 900 px |
| Status bar: main, online, sync Xh, prompt with cursor, CSE · EWU · BD | Footer strip of the hero window; "sync Xh" computed from data |
| Ambient layer: grid, blooms, scan line | Kept, simplified to grid, two blooms and one scan line |

### 6.3 Projects

- **P-1 (P0)** One column at full width; two columns from 600 px. Cards keep their current art.
- **P-2 (P1)** Press feedback (scale to 0.98 over 120 ms), scroll reveal with stagger, and a 48 px or taller tap target.
- **P-3 (P2)** Rebuild the three cards as HTML so text is selectable and the whole card is one link.

### 6.4 Stack

- **K-1 (P0)** Replace the marquee image with two labelled tracks: FRONTEND (7 chips) and BACKEND + TOOLS (8 chips). Chips wrap; all 15 are visible at once.
- **K-2 (P1)** Chips pop in with stagger on reveal; a soft light "playhead" sweeps each track every 6 s or so; tapping a chip gives a ripple.
- **K-3 (P1)** The "15/15 loaded" counter counts up on reveal.

### 6.5 Telemetry

- **T-1 (P0) Node status.** 2×2 tiles: Repositories, Stars, Followers, Following; "Member since" line below.
- **T-2 (P0) Contributions.** Ring gauge with the 12-month total, year-elapsed line, Active and Peak values.
- **T-3 (P0) Languages.** Rows with name, percentage and a bar, and the total-bytes footer.
- **T-4 (P0) Streaks.** Current streak as a full-width card with a 14-day mini bar strip; Longest streak and Active days (with consistency %) as two half-width cards.
- **T-5 (P0) Activity carrier.** The 52-week bar chart sized to the screen width (bars of about 5 px), month ticks every two to three months, and a peak marker. Touch and drag shows a tooltip with week and count. A visually hidden table provides the same data to screen readers.
- **T-6 (P1)** Sync line: "SYNC OK · updated Xh ago", computed from `generatedAt`.

### 6.6 Repository index

- **R-1 (P0)** Vertical card list. Each card shows index, name, owner or collaborator role, the full description (wraps, never truncated), kind badge (WEB / ANDROID), language dot, stars, forks, "updated N days ago" (computed) and an "Open repository" button. The whole card is tappable.
- **R-2 (P1)** ALL / OWNED / COLLAB become working filters with an animated reorder. The LANGS chip becomes a language legend toggle (P2).

### 6.7 Activity

- **A-1 (P0)** Timeline list with type chip (PUSH and others), summary and relative time. Consecutive identical events collapse into one row (for example, "7 pushes · 22 to 23 h ago") that expands to the individual times.
- **A-2 (P1)** A `tail -f` prompt line with a blinking cursor at the end of the list; new events slide in when data refreshes.
- **A-3 (P2)** The "RAW JSON" tab from the desktop art opens a collapsible raw view.

### 6.8 Footer

Keep the current text and add "Data updated Xh ago". Add bottom padding equal to the dock height plus safe-area inset so the dock never covers it.

### 6.9 Ironbot on phones

- **B-1 (P1) Ironbot Lite.** Smaller (about 40×74 px), roams along the strip just above the dock instead of the whole screen, pauses while the page scrolls, and uses at most 8 particles (desktop allows 24). Tap gives the spin burst and toggles follow mode (drag to move it). It switches itself off if frames stay over 24 ms for 3 s, and is hidden under reduced motion. Only the figure captures touches, so it never blocks content. The toggle lives in the Explorer sheet. Default state is an open question (section 13).

## 7. Motion system

**Tokens**

- Durations: `--d-fast` 120 ms, `--d-base` 240 ms, `--d-slow` 480 ms, `--d-hero` 900 ms.
- Easings: `--ease-out` cubic-bezier(.2,.7,.2,1) (already used on the site), `--ease-spring` cubic-bezier(.34,1.56,.64,1), `--ease-in-out` cubic-bezier(.65,0,.35,1).
- Stagger: 60 ms per item, capped at six items.

**Choreography**

1. **Boot sequence (first load, 1.2 s or less).** Top bar fades in; reactor scales from 0.6 to 1 as its rings spin up; the name's gradient sweeps across; typed lines begin; System Monitor bars fill; info cards rise in stagger.
2. **Scroll reveal.** Sections and cards fade and rise 16 px once, when 15% visible (IntersectionObserver).
3. **Count-up.** Numbers (37, 03, 82%, language percentages, 15/15) count from zero over 900 ms with ease-out when they first reveal.
4. **Charts draw.** Ring gauge animates `stroke-dashoffset`; language and monitor bars scale in from the left; weekly bars grow from the baseline with a 10 ms stagger.
5. **Touch feedback.** Every tappable element scales to 0.97 on press (120 ms) and springs back; chips ripple. Optional 10 ms haptic tick on Android via `navigator.vibrate`.
6. **Reactor tap.** Tapping the reactor pulses its bloom and speeds the rings to 2.4 s per turn for 1.2 s (reusing the existing "near" state that desktop triggers by cursor proximity).
7. **Scroll-spy.** The dock indicator slides between items with transform only; the active section heading briefly brightens.
8. **Background drift.** The ambient blooms shift up to 12 px with scroll (transform only, via `animation-timeline: scroll()` where supported, otherwise static).
9. **Ambient loops.** Radar sweep, orbiting dots, scan lines, blinking cursors and chart sweeps keep running, but only while their section is on screen and the tab is visible.

**Performance rules**

- Animate `transform` and `opacity` only (plus `stroke-dashoffset` on rings). Never animate blur, filters or box-shadow.
- No more than six infinite animations running at once.
- Use `content-visibility: auto` on below-the-fold sections.
- `backdrop-filter` on the top bar only.
- Keep `will-change` to elements that animate continuously.
- Profile on a mid-range Android device, not only desktop emulation.

**Reduced motion**

Under `prefers-reduced-motion` (or the in-app toggle): no transforms, counters show final values, no parallax, Ironbot hidden, ambient loops off. Opacity changes of 150 ms or less are allowed.

## 8. Technical approach

**Options considered**

| Option | Verdict |
| --- | --- |
| A. Rebuild panels as HTML/CSS components fed by one JSON file | **Recommended.** Responsive, interactive, accessible; one renderer for all widths |
| B. Generate a second set of phone-width SVGs | Rejected. Still static (no filters, scrubbing or live times) and doubles maintenance |
| C. Scale the existing SVGs to fit | Rejected. Text falls to roughly 30% of its size |

**Recommended structure**

- Split the 67 KB `index.html` into `index.html`, `assets/site.css`, `assets/site.js` and `assets/skybot.js`, so styles and scripts cache separately.
- Scope every selector from the inline hero SVG under `.hero` before adding components (avoids the `.s`, `.m`, `.t`, `.bar`, `.rise` collisions).
- Add `viewport-fit=cover` to the viewport meta tag; use `env(safe-area-inset-*)` for the top bar, dock and footer; use `100svh` instead of `100vh` where needed.
- Extract the reactor group from the hero SVG into a reusable inline SVG used in both layouts.
- Components are hydrated from `data/stats.json`. If the fetch or JS fails, the existing SVG images render as a fallback so the page never shows an empty panel.

**Data contract (`data/stats.json`)**

```json
{
  "generatedAt": "ISO-8601 UTC",
  "profile": { "repos": 3, "stars": 0, "followers": 1, "following": 2, "memberSince": "2026-07" },
  "contributions": {
    "total": 37, "windowDays": 368, "activeDays": 8,
    "peak": { "date": "YYYY-MM-DD", "count": 15 },
    "currentStreak": { "days": 3, "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" },
    "longestStreak": { "days": 3, "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" },
    "weeks": [ { "start": "YYYY-MM-DD", "count": 0 } ]
  },
  "languages": [ { "name": "HTML", "pct": 41.0 } ],
  "bytesTotal": 0,
  "repos": [ { "name": "", "slug": "", "owner": "", "role": "owner|collaborator", "desc": "", "kind": "WEB|ANDROID", "language": "", "stars": 0, "forks": 0, "updatedAt": "ISO-8601" } ],
  "events": [ { "type": "push", "at": "ISO-8601", "repo": "", "summary": "" } ]
}
```

Values shown are the ones the current panels display. The browser computes every relative time ("6 days ago") from timestamps. The existing Action keeps producing the README SVGs and additionally writes this file.

**Cleanup in scope**

Remove `.mhero`, `.panel-scroll` and the dead 820 px rules; unify the breakpoint at 900 px; use `rem`-based type so browser font scaling works.

## 9. Accessibility

- Reflow at 320 CSS px with no two-dimensional scrolling (WCAG 1.4.10), including at 200% zoom.
- Dock is a `nav` with a label; the Explorer sheet is a modal dialog with focus trap, Esc and back-gesture close, and focus return to the opener.
- Charts carry text alternatives: ring gauge and bars expose values as text; the weekly chart has a hidden data table.
- Typed text keeps a static, screen-reader-visible version; the animated copy is `aria-hidden` (as on the current site).
- Keep the gold `:focus-visible` outline on all controls; contrast 4.5:1 or better for text.
- Motion honours `prefers-reduced-motion` and the in-app toggle.

## 10. Acceptance criteria

1. At 320, 360, 390, 430 and 600 px, no horizontal scrollbar appears and no element extends past the viewport.
2. All 12 rows of the section 6.2 table are visible on the phone, in the order Top bar, Hero, Identity, System Monitor, Info cards.
3. Stack, Telemetry, Repositories and Activity render as components with no `<img>` panels and no "swipe sideways" hint.
4. Repository filters work; every repo card and Explorer entry is a working link or scroll target.
5. Relative times update from timestamps with no image regeneration.
6. Every control measures at least 44×44 px; verified with a script.
7. Lighthouse mobile scores meet section 3 targets in CI.
8. With reduced motion on, nothing moves except opacity fades of 150 ms or less.
9. Scrolling the full page on a mid-range Android device holds 55 fps or better with Ironbot Lite on.
10. With JS disabled or `stats.json` unreachable, the SVG fallbacks show and the page still reads correctly.
11. Notched iPhones: no content is hidden under the notch, home indicator or dock.
12. Desktop screenshots above 900 px are visually unchanged in Phases 1 to 3.

## 11. Phases and rollout

Time estimates are rough.

| Phase | Scope | Rough effort |
| --- | --- | --- |
| 0. Prep | Locate the 3-hourly generator and agree the `stats.json` contract; set up the device test matrix; add `viewport-fit=cover`; scope the hero SVG styles; remove dead CSS | 0.5 day |
| 1. No-swipe release (P0) | App shell, hero parity, and all four panels rebuilt as components with the JSON data and SVG fallback | 2 to 3 days |
| 2. Motion (P1) | Motion tokens, boot sequence, scroll reveal, count-ups, chart draws, touch feedback, scroll-spy, reactor tap, Ironbot Lite | 1 to 2 days |
| 3. Polish and verify | Performance and accessibility passes, real-device QA, Lighthouse CI, release | 1 day |
| 4. Optional | Use the same components on desktop; rebuild project cards as HTML (P-3); raw JSON view (A-3) | 1 to 2 days |

Ship Phase 1 behind a normal commit to `main` (GitHub Pages deploys directly); keep the previous `index.html` tagged in git for a one-step rollback.

## 12. Risks

- **Generator not in this repo.** Without access to the Action, the panels cannot be fed JSON. Mitigation: Phase 0 locates it; fallback is a small Action added to this repo that calls the GitHub API.
- **Rebuild effort for charts.** Mitigation: the weekly chart and ring are simple SVG/CSS; no chart library is needed.
- **Animation jank on low-end phones.** Mitigation: transform and opacity only, off-screen pausing, Ironbot auto-off, real-device profiling.
- **Global SVG style collisions.** Mitigation: scope under `.hero` first (Phase 0).
- **Landscape phones above 900 px** get the desktop layout with small text. Mitigation: review in QA; raise the breakpoint or add a height-based rule.
- **Two renderers drifting apart** (README SVGs vs site components). Mitigation: both read the same data file.

## 13. Open questions

1. Where does the 3-hourly GitHub Action live, and can it be changed to also write `data/stats.json`?
2. Ironbot Lite: on by default on phones, or opt-in? The PRD assumes on, with auto-off on slow frames.
3. Bottom dock plus Explorer sheet is the assumed navigation. Switch to a simple top hamburger menu if you prefer less chrome.
4. Should desktop adopt the new components in Phase 4, or keep the SVG panels?
5. Is the Apex Arcade card's "50 browser games" and "React · TypeScript · Vite · PWA" copy current? The repository index lists it as a Browser Based Game Hub in HTML.
6. Keep the three typed hero lines as they are?
