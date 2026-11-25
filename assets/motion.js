/* motion.js — SUJEL.OS scroll choreography with GSAP + ScrollTrigger (self-hosted in assets/vendor).
   Loads only after the page is interactive, so it never touches first paint or the critical budget.
   Everything here is transform-only and scrubbed to the scroll position. It is skipped entirely for
   reduced motion and data saver, and the page is complete without it (no libraries, no errors). */
(function () {
  "use strict";
  if (!window.matchMedia || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var conn = navigator.connection;
  if (conn && conn.saveData) return;

  function load(src, done) {
    var s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.onload = done;
    s.onerror = function () { /* offline, blocked or not built yet: the page works without it */ };
    document.head.appendChild(s);
  }

  function init() {
    if (!window.gsap || !window.ScrollTrigger) return;
    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.config({ ignoreMobileResize: true });

    /* matchMedia reverts every tween if the visitor turns on reduced motion while the page is open */
    gsap.matchMedia().add("(prefers-reduced-motion: no-preference)", function () {
      /* Home: the copy and the 3D stage drift apart at different speeds as you scroll past (depth, like a parallax hero).
         Transform only: no opacity or filter, so the glass tiles keep their backdrop blur. */
      var hero = { trigger: "#home", start: "top top", end: "bottom top", scrub: 0.6 };
      gsap.to(".home-copy", { yPercent: -34, ease: "none", scrollTrigger: hero });
      gsap.to(".stage", { yPercent: -18, scale: 0.7, rotation: 3, transformOrigin: "50% 40%", ease: "none", scrollTrigger: hero });
      /* each floating object also travels at its own speed, so the stage pulls apart in depth */
      gsap.utils.toArray(".stage .obj").forEach(function (el, i) {
        gsap.to(el, { y: -70 - (i % 4) * 45, ease: "none", scrollTrigger: hero });
      });

      /* Every section: the heading eases up, and the block under it grows from slightly small as it arrives (Apple-style). */
      gsap.utils.toArray(".head").forEach(function (el) {
        gsap.fromTo(el, { y: 110, scale: 0.94, transformOrigin: "0% 100%" }, {
          y: 0, scale: 1, ease: "none",
          scrollTrigger: { trigger: el, start: "top bottom", end: "top 55%", scrub: 0.8 }
        });
      });
      gsap.utils.toArray(".cards,.about,.stat-grid,.stats-2").forEach(function (el) {
        gsap.fromTo(el, { scale: 0.84, y: 140, rotationX: 9, transformPerspective: 1200 }, {
          scale: 1, y: 0, rotationX: 0, transformOrigin: "50% 0%", ease: "none",
          scrollTrigger: { trigger: el, start: "top bottom", end: "top 35%", scrub: 0.9 }
        });
      });

      /* Work: the section object floats at a different speed from the cards */
      gsap.utils.toArray(".sec-obj").forEach(function (el) {
        gsap.fromTo(el, { y: 60, rotation: -8 }, {
          y: -110, rotation: 8, ease: "none",
          scrollTrigger: { trigger: el.parentNode, start: "top bottom", end: "bottom top", scrub: true }
        });
      });

      /* Contact: the card settles into place and its globe rises into the corner */
      gsap.fromTo(".cc", { scale: 0.94 }, {
        scale: 1, transformOrigin: "50% 100%", ease: "none",
        scrollTrigger: { trigger: ".cc", start: "top bottom", end: "top 60%", scrub: true }
      });
      gsap.fromTo(".cc>.gem.t", { y: 60 }, {
        y: -10, ease: "none",
        scrollTrigger: { trigger: ".cc", start: "top bottom", end: "bottom bottom", scrub: true }
      });
    });

    /* live stats and fonts change section heights after load */
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
    setTimeout(function () { ScrollTrigger.refresh(); }, 1500);
  }

  function start() {
    load("assets/vendor/gsap.min.js", function () {
      load("assets/vendor/ScrollTrigger.min.js", init);
    });
  }
  /* Start on the first scroll or touch, not at load: the page is complete without this script, and keeping it out of the
     load window protects first paint, TBT and the Lighthouse budgets. It is local files, so it is ready in a blink. */
  var started = false, EVENTS = ["scroll", "wheel", "touchstart", "keydown", "pointerdown"];
  function go() {
    if (started) return;
    started = true;
    EVENTS.forEach(function (n) { window.removeEventListener(n, go); });
    start();
  }
  EVENTS.forEach(function (n) { window.addEventListener(n, go, { passive: true }); });
  if ((window.scrollY || 0) > 0) go(); /* the browser restored a scroll position */
})();
