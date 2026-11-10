# SUJEL.OS design brief (Phase 1)

**Principle:** OS-flavoured, never OS-hidden. Every panel stays visible and readable; the shell adds polish and speed, not extra clicks.

- **Palette:** dark navy surfaces, one blue accent family (`--accent2`, `--cyan`, `--ice`). No red/gold chrome.
- **Windows:** each panel has a 24px title bar with three quiet controls. Desktop only (900px and up).
- **Menu bar:** brand, section links, Search (Ctrl/Cmd+K), Ironbot toggle, clock.
- **Command palette:** sections, projects, GitHub, LinkedIn, Ironbot toggle. Keyboard-first, ARIA combobox/listbox, Esc closes, focus returns.
- **Motion:** 120-240 ms ease-out transitions; all of it off under `prefers-reduced-motion`.
- **Phone:** keeps the existing dock and Explorer sheet; no window chrome, no palette trigger.
- **Rollback:** remove `assets/os.css`, `assets/os.js` and their tags in `index.html`.
