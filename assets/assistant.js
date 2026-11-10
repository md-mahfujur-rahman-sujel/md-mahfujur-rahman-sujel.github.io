/* FAQ assistant: answers only from assets/faq.json. No network calls beyond that file, no AI service. */
(() => {
  'use strict';
  if (!window.fetch || !document.body) return;
  const STOP = new Set('a an the is are was were do does did he his him her i you your me my to of in on at for and or can what how who where when why which with about tell it this that please'.split(' '));
  const tokens = (s) => s.toLowerCase().replace(/[^a-z0-9.\s]/g, ' ').split(/\s+/).filter((t) => t && !STOP.has(t));
  let data = null;
  let loading = null;
  const load = () => loading || (loading = fetch('assets/faq.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).then((d) => (data = d)));

  const score = (item, text, toks) => {
    let s = 0;
    for (const k of item.k) {
      if (k.includes(' ') ? text.includes(k) : toks.includes(k)) s += k.includes(' ') ? 3 : 2;
    }
    for (const t of tokens(item.q)) if (toks.includes(t)) s += 1;
    return s;
  };
  const match = (input) => {
    const text = input.toLowerCase();
    const toks = tokens(input);
    const ranked = data.items.map((it) => ({ it, s: score(it, text, toks) })).sort((a, b) => b.s - a.s);
    return { best: ranked[0].s >= 2 ? ranked[0].it : null, near: ranked.filter((r) => r.s > 0).slice(0, 3).map((r) => r.it) };
  };

  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };
  const react = () => document.dispatchEvent(new CustomEvent('ironbot:react', { detail: { kind: 'think' } }));

  // Floating button + panel
  const fab = el('button', 'ast-fab');
  fab.type = 'button';
  fab.setAttribute('aria-haspopup', 'dialog');
  fab.setAttribute('aria-expanded', 'false');
  fab.setAttribute('aria-label', 'Open assistant');
  fab.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg>';
  const panel = el('section', 'ast-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Assistant');
  panel.hidden = true;
  const head = el('header', 'ast-head');
  const title = el('strong', 'ast-title', 'Assistant');
  const close = el('button', 'ast-close', '\u00d7');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close assistant');
  head.append(title, close);
  const log = el('div', 'ast-log');
  log.setAttribute('role', 'log');
  log.setAttribute('aria-live', 'polite');
  const chips = el('div', 'ast-chips');
  const form = el('form', 'ast-form');
  const input = el('input', 'ast-input');
  input.type = 'text';
  input.placeholder = 'Ask a question';
  input.setAttribute('aria-label', 'Your question');
  input.autocomplete = 'off';
  input.maxLength = 140;
  const send = el('button', 'ast-send', 'Send');
  send.type = 'submit';
  form.append(input, send);
  panel.append(head, log, chips, form);
  document.body.append(fab, panel);

  const say = (who, text, links) => {
    const m = el('div', 'ast-msg ast-' + who);
    m.append(el('p', '', text));
    if (links && links.length) {
      const row = el('p', 'ast-links');
      links.forEach((l) => {
        const a = el('a', '', l.label);
        a.href = l.href;
        if (/^https?:/.test(l.href)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
        else a.addEventListener('click', () => toggle(false));
        row.append(a);
      });
      m.append(row);
    }
    log.append(m);
    log.scrollTop = log.scrollHeight;
  };
  const setChips = (items) => {
    chips.textContent = '';
    items.forEach((it) => {
      const b = el('button', 'ast-chip', it.q);
      b.type = 'button';
      b.addEventListener('click', () => answerItem(it));
      chips.append(b);
    });
  };
  const answerItem = (it) => { react(); say('you', it.q); say('bot', it.a, it.links); setChips(data.items.filter((x) => x.id !== it.id).slice(0, 4)); };
  const ask = (text) => {
    react();
    say('you', text);
    const { best, near } = match(text);
    if (best) { say('bot', best.a, best.links); setChips(data.items.filter((x) => x.id !== best.id).slice(0, 4)); }
    else { say('bot', data.fallback, data.contact); setChips(near.length ? near : data.items.filter((x) => data.suggested.includes(x.id))); }
  };

  let started = false;
  let returnTo = null;
  function toggle(open) {
    panel.hidden = !open;
    fab.setAttribute('aria-expanded', String(open));
    if (!open) { if (returnTo && returnTo.focus) returnTo.focus(); return; }
    returnTo = document.activeElement;
    load().then(() => {
      title.textContent = data.name;
      panel.setAttribute('aria-label', data.name);
      if (!started) { started = true; say('bot', data.greeting); setChips(data.items.filter((x) => data.suggested.includes(x.id))); }
      input.focus();
    }).catch(() => { if (!started) { started = true; say('bot', 'The assistant could not load. Please use the LinkedIn or GitHub links on this page.'); } });
  }
  fab.addEventListener('click', () => toggle(panel.hidden));
  close.addEventListener('click', () => { toggle(false); fab.focus(); });
  panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { toggle(false); fab.focus(); } });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = input.value.trim();
    if (!v || !data) return;
    input.value = '';
    ask(v);
  });
})();
