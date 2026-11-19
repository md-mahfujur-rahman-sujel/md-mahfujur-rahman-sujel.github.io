/* fx-v2.js — interactive layer for glass-v2.css. No dependencies, no network requests.
   Adds: scroll reveal, a cursor light, a pointer-following specular glare, card tilt,
   magnetic buttons, hero parallax with floating glass chips, and a sliding nav pill.
   Everything pointer-driven is desktop-only (fine pointer, hover, 901px+). Everything is
   off under reduced motion, whether from the OS or from the in-page toggle.
   Safe to remove: nothing else depends on it. */
(function () {
  'use strict';
  var root = document.documentElement;
  var hasMQ = typeof window.matchMedia === 'function';
  var mqReduce = hasMQ ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var mqDesk = hasMQ ? window.matchMedia('(min-width:901px) and (hover:hover) and (pointer:fine)') : { matches: false };
  function reduced() { return mqReduce.matches || root.getAttribute('data-motion') === 'reduced'; }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* ---------- 1. Scroll reveal (only below-the-fold items; hidden only once this script ran) ---------- */
  var REVEAL = 'main > section > .kicker, main > section > h2, main > section > .lead, .loop li, .contact-card, footer';
  var revealIO = null;
  var marked = [];
  function unmark(node) {
    node.classList.remove('fx-item', 'fx-in');
    node.style.removeProperty('--fx-d');
  }
  function startReveal() {
    if (revealIO || reduced() || !('IntersectionObserver' in window)) return;
    revealIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var node = entry.target;
        revealIO.unobserve(node);
        node.classList.add('fx-in');
        var delay = parseFloat(node.style.getPropertyValue('--fx-d')) || 0;
        // Drop the helper classes once the entrance is over, so hover transitions are not delayed.
        setTimeout(function () { unmark(node); }, 1100 + delay);
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -6% 0px' });
    var index = 0;
    var lastGroup = null;
    $$(REVEAL).forEach(function (node) {
      if (node.getBoundingClientRect().top < window.innerHeight) return;
      var group = node.closest('section') || node.parentNode;
      if (group !== lastGroup) { index = 0; lastGroup = group; }
      node.style.setProperty('--fx-d', Math.min(index, 4) * 90 + 'ms');
      index++;
      node.classList.add('fx-item');
      marked.push(node);
      revealIO.observe(node);
    });
    root.classList.add('fx-on');
  }
  function stopReveal() {
    if (revealIO) { revealIO.disconnect(); revealIO = null; }
    marked.forEach(unmark);
    marked = [];
    root.classList.remove('fx-on');
  }

  /* ---------- 2. Pointer effects: cursor light, glare, tilt, magnetic buttons, hero parallax ---------- */
  var GLASS = '.card,.repo-card,.metric-card,.stack-component,.streak-card,.contact-card,.hero-stage';
  var TILT = '.card,.repo-card';
  var glow = null;
  var raf = 0;
  var px = 0, py = 0, gx = 0, gy = 0;
  var lastTarget = null;
  var curTilt = null;
  var curCta = null;
  var stage = null;

  function pointerActive() { return mqDesk.matches && !reduced(); }
  function resetTilt(node) { node.style.removeProperty('--fx-rx'); node.style.removeProperty('--fx-ry'); }
  function resetCta(node) { node.style.removeProperty('--fx-tx'); node.style.removeProperty('--fx-ty'); }
  function resetPointer() {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (glow) glow.classList.remove('on');
    if (curTilt) { resetTilt(curTilt); curTilt = null; }
    if (curCta) { resetCta(curCta); curCta = null; }
    if (stage) { stage.style.removeProperty('--fx-px'); stage.style.removeProperty('--fx-py'); }
  }
  function frame() {
    raf = 0;
    if (!pointerActive()) { resetPointer(); return; }
    gx += (px - gx) * 0.16;
    gy += (py - gy) * 0.16;
    glow.style.transform = 'translate3d(' + gx.toFixed(1) + 'px,' + gy.toFixed(1) + 'px,0)';
    var target = lastTarget && lastTarget.closest ? lastTarget : null;

    var glass = target ? target.closest(GLASS) : null;
    if (glass) {
      var rg = glass.getBoundingClientRect();
      glass.style.setProperty('--mx', (px - rg.left).toFixed(0) + 'px');
      glass.style.setProperty('--my', (py - rg.top).toFixed(0) + 'px');
    }

    var tilt = target ? target.closest(TILT) : null;
    if (tilt !== curTilt) { if (curTilt) resetTilt(curTilt); curTilt = tilt; }
    if (tilt) {
      var rt = tilt.getBoundingClientRect();
      var nx = (px - rt.left) / rt.width - 0.5;
      var ny = (py - rt.top) / rt.height - 0.5;
      tilt.style.setProperty('--fx-ry', (nx * 8).toFixed(2) + 'deg');
      tilt.style.setProperty('--fx-rx', (-ny * 8).toFixed(2) + 'deg');
    }

    var cta = target ? target.closest('.cta') : null;
    if (cta !== curCta) { if (curCta) resetCta(curCta); curCta = cta; }
    if (cta) {
      var rc = cta.getBoundingClientRect();
      cta.style.setProperty('--fx-tx', clamp((px - (rc.left + rc.width / 2)) * 0.2, -8, 8).toFixed(1) + 'px');
      cta.style.setProperty('--fx-ty', clamp((py - (rc.top + rc.height / 2)) * 0.3, -6, 6).toFixed(1) + 'px');
    }

    if (stage) {
      var rs = stage.getBoundingClientRect();
      if (rs.bottom > 0 && rs.top < window.innerHeight) {
        stage.style.setProperty('--fx-px', ((px / window.innerWidth - 0.5) * 2).toFixed(3));
        stage.style.setProperty('--fx-py', ((py / window.innerHeight - 0.5) * 2).toFixed(3));
      }
    }
    if (Math.abs(px - gx) > 0.5 || Math.abs(py - gy) > 0.5) raf = requestAnimationFrame(frame);
  }
  function onMove(event) {
    if (event.pointerType && event.pointerType !== 'mouse') return;
    if (!pointerActive()) return;
    px = event.clientX;
    py = event.clientY;
    lastTarget = event.target;
    if (!glow) {
      glow = document.createElement('div');
      glow.className = 'fx-glow';
      glow.setAttribute('aria-hidden', 'true');
      document.body.appendChild(glow);
      gx = px;
      gy = py;
    }
    glow.classList.add('on');
    if (!raf) raf = requestAnimationFrame(frame);
  }

  /* ---------- 3. Floating glass chips around the reactor (decorative, desktop hero only) ---------- */
  function buildChips() {
    var host = document.querySelector('.hero .hero-stage');
    if (!host || host.querySelector('.fx-chips')) return;
    stage = host;
    var wrap = document.createElement('div');
    wrap.className = 'fx-chips';
    wrap.setAttribute('aria-hidden', 'true');
    [['a', 'React · TypeScript'], ['b', 'Kotlin · Android'], ['c', 'Spring Boot · MySQL'], ['d', 'Figma · UI/UX']].forEach(function (item) {
      var chip = document.createElement('span');
      chip.className = 'fx-chip ' + item[0];
      chip.appendChild(document.createElement('i'));
      chip.appendChild(document.createTextNode(item[1]));
      wrap.appendChild(chip);
    });
    host.insertBefore(wrap, host.firstChild);
  }

  /* ---------- 4. Sliding glass pill behind the active menu item ---------- */
  function buildNavPill() {
    var nav = document.querySelector('.nav');
    if (!nav || !('MutationObserver' in window)) return;
    var pill = document.createElement('span');
    pill.className = 'fx-pill';
    pill.setAttribute('aria-hidden', 'true');
    nav.insertBefore(pill, nav.firstChild);
    var placed = false;
    function place() {
      var active = nav.querySelector('a[aria-current="location"]');
      if (!active || !active.offsetWidth) {
        pill.style.opacity = '0';
        nav.classList.remove('fx-pill-on');
        return;
      }
      pill.style.width = active.offsetWidth + 'px';
      pill.style.height = active.offsetHeight + 'px';
      pill.style.transform = 'translate(' + active.offsetLeft + 'px,' + active.offsetTop + 'px)';
      pill.style.opacity = '1';
      nav.classList.add('fx-pill-on');
      if (!placed) { placed = true; requestAnimationFrame(function () { pill.classList.add('fx-pill-anim'); }); }
    }
    new MutationObserver(place).observe(nav, { attributes: true, subtree: true, attributeFilter: ['aria-current'] });
    window.addEventListener('resize', place);
    window.addEventListener('load', place);
    place();
  }

  /* ---------- 5. Third ambient glow for phones (.x-orb is exempt from the motion budget) ---------- */
  function buildOrb() {
    if (document.querySelector('.x-orb.c')) return;
    var orb = document.createElement('div');
    orb.className = 'x-orb c';
    orb.setAttribute('aria-hidden', 'true');
    document.body.appendChild(orb);
  }

  function sync() {
    if (reduced()) { stopReveal(); resetPointer(); } else { startReveal(); }
  }

  buildChips();
  buildNavPill();
  buildOrb();
  sync();
  document.addEventListener('pointermove', onMove, { passive: true });
  root.addEventListener('mouseleave', resetPointer);
  document.addEventListener('motionchange', sync);
  if (mqReduce.addEventListener) mqReduce.addEventListener('change', sync);
  else if (mqReduce.addListener) mqReduce.addListener(sync);
})();
