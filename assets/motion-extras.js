/* motion-extras.js — see motion-extras.css. Safe to remove: nothing else depends on it. */
(function () {
  'use strict';
  var root = document.documentElement;
  var small = window.matchMedia ? window.matchMedia('(max-width:900px)') : { matches: false };
  var rm = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  function reduced() { return rm.matches || root.getAttribute('data-motion') === 'reduced'; }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  if (!('IntersectionObserver' in window)) return;

  // 1. progress bar + ambient glows
  var bar = document.createElement('div'); bar.className = 'x-progress'; bar.setAttribute('aria-hidden', 'true');
  var a = document.createElement('div'); a.className = 'x-orb a'; a.setAttribute('aria-hidden', 'true');
  var b = document.createElement('div'); b.className = 'x-orb b'; b.setAttribute('aria-hidden', 'true');
  document.body.appendChild(bar); document.body.appendChild(a); document.body.appendChild(b);
  var ticking = false;
  function frame() {
    ticking = false;
    var h = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.transform = 'scaleX(' + (h > 0 ? Math.min(1, window.scrollY / h) : 0).toFixed(4) + ')';
  }
  window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }, { passive: true });
  frame();

  // 2. staggered entrance for chips and activity rows, as they scroll into view
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (x) {
      if (!x.isIntersecting) return;
      io.unobserve(x.target);
      x.target.classList.add('x-in');
    });
  }, { threshold: 0.2, rootMargin: '0px 0px -4% 0px' });
  function tag(root_) {
    ['.tech-chip', '.activity-event'].forEach(function (sel) {
      $$(sel, root_).forEach(function (n) {
        if (n.__x) return; n.__x = 1;
        var sibs = $$(sel, n.closest('.tech-track, .activity-list') || document);
        n.style.setProperty('--xj', Math.min(sibs.indexOf(n), 9));
        n.classList.add('x-item');
        if (reduced()) { n.classList.add('x-in'); return; }
        io.observe(n);
      });
    });
  }
  tag(document);
  root.classList.add('x-on');
  // their panels render after data loads, so watch for them
  new MutationObserver(function (m) {
    m.forEach(function (r) { r.addedNodes.forEach(function (n) { if (n.nodeType === 1) tag(n); }); });
  }).observe(document.body, { childList: true, subtree: true });

  // 3. repo filter pop
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('.filter-button');
    if (!btn || reduced() || !small.matches) return;
    setTimeout(function () {
      var cards = $$('.repo-card').filter(function (c) { return !c.hidden && c.offsetParent !== null; });
      cards.forEach(function (c, i) {
        c.classList.remove('x-pop'); void c.offsetWidth;
        c.style.setProperty('--xj', Math.min(i, 8)); c.classList.add('x-pop');
        setTimeout(function () { c.classList.remove('x-pop'); }, 900);
      });
    }, 30);
  });
})();
