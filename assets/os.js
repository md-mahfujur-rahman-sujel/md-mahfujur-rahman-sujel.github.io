/* SUJEL.OS shell: status clock + command palette (Ctrl/Cmd+K). No dependencies. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const nav = $('.nav');
  if (!nav || typeof HTMLDialogElement === 'undefined') return;

  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const keyLabel = mac ? '\u2318 K' : 'Ctrl K';

  // Menu bar: search trigger + clock (desktop only via CSS)
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'nav-btn os-search';
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.innerHTML = 'Search <kbd aria-hidden="true">' + keyLabel + '</kbd>';
  const toggle = $('#flyer-toggle', nav);
  nav.insertBefore(trigger, toggle);
  const clock = document.createElement('span');
  clock.className = 'os-clock';
  clock.setAttribute('aria-hidden', 'true');
  const tick = () => { clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
  tick();
  setInterval(tick, 30000);
  nav.append(clock);

  // Commands are built from what is already on the page
  const go = (hash) => { location.hash = hash; };
  const open = (url) => window.open(url, '_blank', 'noopener,noreferrer');
  const commands = [
    ...$$('a', nav).map((a) => ({ label: a.textContent.trim(), hint: 'Go to section', run: () => go(a.getAttribute('href')) })),
    ...$$('#projects .card-head strong').map((s) => ({ label: s.textContent.trim(), hint: 'Project', run: () => go('#projects') })),
    { label: 'GitHub', hint: 'Open profile', run: () => open('https://github.com/md-mahfujur-rahman-sujel') },
    { label: 'LinkedIn', hint: 'Open profile', run: () => open('https://linkedin.com/in/md-mahfujur-rahman-sujel') },
  ];
  if (toggle) commands.push({ label: 'Toggle Ironbot', hint: 'Mascot on/off', run: () => toggle.click() });

  // Dialog
  const dlg = document.createElement('dialog');
  dlg.className = 'os-palette';
  dlg.setAttribute('aria-label', 'Command palette');
  dlg.innerHTML =
    '<input class="os-input" type="text" role="combobox" aria-expanded="true" aria-controls="os-list" aria-autocomplete="list" ' +
    'placeholder="Search sections, projects and links" autocomplete="off" spellcheck="false" aria-label="Search commands">' +
    '<ul class="os-list" id="os-list" role="listbox" aria-label="Commands"></ul>' +
    '<p class="os-empty" role="status" hidden></p>' +
    '<div class="os-foot" aria-hidden="true"><span>\u2191\u2193 navigate</span><span>Enter select</span><span>Esc close</span></div>';
  document.body.append(dlg);
  const input = $('.os-input', dlg);
  const list = $('.os-list', dlg);
  const empty = $('.os-empty', dlg);
  let shown = [];
  let index = 0;

  const render = () => {
    const q = input.value.trim().toLowerCase();
    shown = commands.filter((c) => !q || (c.label + ' ' + c.hint).toLowerCase().includes(q)).slice(0, 20);
    index = Math.min(index, Math.max(shown.length - 1, 0));
    list.innerHTML = '';
    // A listbox that owns no options fails WCAG 4.1.2, so the empty state is announced
    // from a status region instead and the popup is withdrawn from the accessibility tree.
    const none = shown.length === 0;
    list.hidden = none;
    empty.hidden = !none;
    if (none) empty.textContent = 'No matches. Try "projects", "stack" or "contact".';
    input.setAttribute('aria-expanded', String(!none));
    shown.forEach((c, i) => {
      const li = document.createElement('li');
      li.className = 'os-item';
      li.id = 'os-opt-' + i;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(i === index));
      const a = document.createElement('span');
      a.textContent = c.label;
      const b = document.createElement('small');
      b.textContent = c.hint;
      li.append(a, b);
      li.addEventListener('click', () => run(i));
      li.addEventListener('mousemove', () => { if (index !== i) { index = i; mark(); } });
      list.append(li);
    });
    mark();
  };
  const mark = () => {
    $$('.os-item', list).forEach((li, i) => li.setAttribute('aria-selected', String(i === index)));
    if (shown.length) input.setAttribute('aria-activedescendant', 'os-opt-' + index);
    else input.removeAttribute('aria-activedescendant');
    const cur = $('#os-opt-' + index, list);
    if (cur) cur.scrollIntoView({ block: 'nearest' });
  };
  const run = (i) => { const c = shown[i]; if (!c) return; dlg.close(); c.run(); };

  let returnTo = null;
  const show = () => {
    if (dlg.open) return;
    returnTo = document.activeElement;
    // A global shortcut leaves focus on <body>, which is not a useful place to return to.
    if (!returnTo || returnTo === document.body) returnTo = trigger;
    input.value = '';
    index = 0;
    render();
    dlg.showModal();
    input.focus();
    document.dispatchEvent(new CustomEvent('ironbot:react', { detail: { kind: 'wave' } }));
  };
  dlg.addEventListener('close', () => { if (returnTo && returnTo.focus) returnTo.focus(); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  input.addEventListener('input', () => { index = 0; render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); index = (index + 1) % Math.max(shown.length, 1); mark(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); index = (index - 1 + shown.length) % Math.max(shown.length, 1); mark(); }
    else if (e.key === 'Enter') { e.preventDefault(); run(index); }
  });
  trigger.addEventListener('click', show);
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); dlg.open ? dlg.close() : show(); }
  });
})();
