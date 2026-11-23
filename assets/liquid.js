/* liquid.js — SUJEL.OS "Liquid Glass".
   One long scrolling page: the navbar scrolls to a section and highlights whichever one is in view.
   Also: sliding glass pill, scroll reveals (fade + rise + blur-in), aurora parallax, pointer light + tilt,
   3D stage parallax, light/dark theme, and live numbers from data/stats.json.
   No dependencies, no third-party requests. Without JavaScript the page is a normal scrolling document. */
(function () {
  "use strict";

  var VIEWS = ["home", "work", "about", "stats", "contact"];
  var THEME_COLOR = { dark: "#03060F", light: "#D8E3FA" };
  var root = document.documentElement;
  var reduceMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  var fineMQ = window.matchMedia("(hover: hover) and (pointer: fine)");
  var wideMQ = window.matchMedia("(min-width: 901px)");
  var reduced = function () { return reduceMQ.matches; };
  var themeToggle = document.querySelector(".theme-toggle");

  /* ---------------- light / dark theme ---------------- */
  function applyTheme(theme, save) {
    theme = theme === "light" ? "light" : "dark";
    root.setAttribute("data-theme", theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", THEME_COLOR[theme]);
    if (themeToggle) {
      var next = theme === "light" ? "dark" : "light";
      themeToggle.setAttribute("aria-label", "Switch to " + next + " theme");
      themeToggle.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
    }
    if (save) { try { localStorage.setItem("sujel-theme", theme); } catch (e) { /* storage may be blocked */ } }
  }
  if (themeToggle) {
    themeToggle.hidden = false;
    applyTheme(root.getAttribute("data-theme"), false); /* sync the button's label and state with the theme chosen before first paint */
    themeToggle.addEventListener("click", function () {
      applyTheme(root.getAttribute("data-theme") === "light" ? "dark" : "light", true);
    });
  }
  var colorMQ = window.matchMedia("(prefers-color-scheme: light)");
  function syncThemeToSystem() {
    try { if (!localStorage.getItem("sujel-theme")) applyTheme(colorMQ.matches ? "light" : "dark", false); }
    catch (e) { /* keep the first-paint preference */ }
  }
  if (colorMQ.addEventListener) colorMQ.addEventListener("change", syncThemeToSystem);
  else if (colorMQ.addListener) colorMQ.addListener(syncThemeToSystem);

  var sections = {};
  VIEWS.forEach(function (id) { sections[id] = document.getElementById(id); });
  var navs = [].slice.call(document.querySelectorAll(".nav, .tabbar"));
  var topbar = document.querySelector(".topbar");
  var scene = document.querySelector(".scene");
  var current = null;
  var statsShown = false;

  /* ---------------- glass pill under the current tab ---------------- */
  function placePill(nav, animate) {
    var pill = nav.querySelector(".pill");
    var cur = nav.querySelector('[aria-current="page"]');
    if (!pill || !cur) return;
    var nr = nav.getBoundingClientRect();
    var r = cur.getBoundingClientRect();
    if (!r.width || !nr.width) return; /* hidden at this breakpoint */
    pill.style.width = r.width + "px";
    pill.style.height = r.height + "px";
    pill.style.transform = "translate(" + (r.left - nr.left) + "px," + (r.top - nr.top) + "px)";
    pill.style.opacity = "1";
    nav.classList.add("has-pill");
    if (animate) pill.classList.add("anim");
  }
  function placeAllPills(animate) {
    navs.forEach(function (n) { placePill(n, animate); });
  }

  function markCurrent(id) {
    [].forEach.call(document.querySelectorAll("[data-view]"), function (a) {
      if (a.closest(".nav, .tabbar")) {
        if (a.getAttribute("data-view") === id) a.setAttribute("aria-current", "page");
        else a.removeAttribute("aria-current");
      }
    });
  }

  function setCurrent(id) {
    if (id === current) return;
    current = id;
    markCurrent(id);
    placeAllPills(true);
    /* keep the address bar in sync without adding history entries (only after the visitor interacts,
       so opening /#work is not rewritten before the browser has scrolled there) */
    if (!touched) return;
    try { history.replaceState(null, "", id === "home" ? location.pathname + location.search : "#" + id); } catch (e) { /* ignore */ }
  }
  var touched = false;
  ["wheel", "touchstart", "pointerdown", "keydown"].forEach(function (n) {
    window.addEventListener(n, function () { touched = true; }, { passive: true, once: true });
  });

  /* ---------------- scroll: spy, topbar blur, aurora parallax ---------------- */
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var y = window.scrollY || window.pageYOffset || 0;
      var vh = window.innerHeight;
      if (topbar) topbar.classList.toggle("scrolled", y > 8);

      var line = vh * 0.4, id = VIEWS[0];
      for (var i = 0; i < VIEWS.length; i++) {
        var el = sections[VIEWS[i]];
        if (el && el.getBoundingClientRect().top <= line) id = VIEWS[i];
      }
      if (vh + y >= document.documentElement.scrollHeight - 4) id = VIEWS[VIEWS.length - 1];
      setCurrent(id);

      if (scene && !reduced()) {
        var max = Math.max(1, document.documentElement.scrollHeight - vh);
        scene.style.setProperty("--sy", Math.min(1, y / max).toFixed(3));
      }
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });

  function goTo(id) {
    var el = sections[id];
    if (!el) return;
    var behavior = reduced() ? "auto" : "smooth";
    if (id === "home") window.scrollTo({ top: 0, behavior: behavior });
    else el.scrollIntoView({ behavior: behavior, block: "start" });
    try { el.setAttribute("tabindex", "-1"); el.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }

  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[data-view]");
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    e.preventDefault();
    goTo(a.getAttribute("data-view"));
  });

  /* 1-5 jump to a section, T toggles the theme (not while typing). Arrow keys keep scrolling normally. */
  document.addEventListener("keydown", function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (e.key.toLowerCase() === "t") {
      applyTheme(root.getAttribute("data-theme") === "light" ? "dark" : "light", true);
      return;
    }
    if (e.key >= "1" && e.key <= "5") goTo(VIEWS[+e.key - 1]);
  });

  /* ---------------- scroll reveal: fade + rise + blur-in ---------------- */
  var REVEAL = ".home-copy,.stage,.head,.about .lead,.loop li,.about .panel,.card,.stat,.stats-2 .panel,.cc,.foot";
  function initReveal() {
    if (!("IntersectionObserver" in window)) return; /* everything simply stays visible */
    var els = [].slice.call(document.querySelectorAll(REVEAL));
    var counts = [], parents = [];
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    els.forEach(function (el) {
      var k = parents.indexOf(el.parentNode);
      if (k < 0) { parents.push(el.parentNode); counts.push(0); k = parents.length - 1; }
      el.style.setProperty("--i", String(counts[k]++));
      el.classList.add("rv");
      io.observe(el);
    });
  }

  /* ---------------- pointer light + tilt + 3D stage parallax ---------------- */
  var raf = 0, lastEvt = null;
  document.addEventListener("pointermove", function (e) {
    if (reduced() || !fineMQ.matches || e.pointerType === "touch") return;
    lastEvt = e;
    if (!raf) raf = requestAnimationFrame(applyPointer);
  }, { passive: true });

  function applyPointer() {
    raf = 0;
    var e = lastEvt;
    if (!e) return;
    var g = e.target.closest && e.target.closest(".glass");
    if (g) {
      var r = g.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width;
      var py = (e.clientY - r.top) / r.height;
      g.style.setProperty("--mx", (px * 100).toFixed(1) + "%");
      g.style.setProperty("--my", (py * 100).toFixed(1) + "%");
      if (g.classList.contains("tilt")) {
        g.style.setProperty("--ry", ((px - 0.5) * 7).toFixed(2) + "deg");
        g.style.setProperty("--rx", ((0.5 - py) * 7).toFixed(2) + "deg");
      }
    }
    var stage = document.querySelector(".stage");
    if (stage && wideMQ.matches && (window.scrollY || 0) < window.innerHeight * 0.9) {
      stage.style.setProperty("--px", ((e.clientX / window.innerWidth - 0.5) * 2).toFixed(3));
      stage.style.setProperty("--py", ((e.clientY / window.innerHeight - 0.5) * 2).toFixed(3));
    }
  }

  /* ---------------- live numbers ---------------- */
  function setStat(key, value) {
    [].forEach.call(document.querySelectorAll('[data-stat="' + key + '"]'), function (el) {
      el.setAttribute("data-target", String(value));
      el.textContent = String(value);
    });
  }

  function countUp() {
    [].forEach.call(document.querySelectorAll("#stats [data-stat]"), function (el) {
      var target = Number(el.getAttribute("data-target"));
      if (!isFinite(target) || reduced()) return;
      var t0 = performance.now(), dur = 1100;
      (function tick(now) {
        var k = Math.min(1, (now - t0) / dur);
        var eased = 1 - Math.pow(1 - k, 3);
        el.textContent = String(Math.round(target * eased));
        if (k < 1) requestAnimationFrame(tick);
      })(t0);
    });
  }

  function initStatsCountUp() {
    var grid = document.querySelector(".stat-grid");
    if (!grid || !("IntersectionObserver" in window)) return;
    var io = new IntersectionObserver(function (entries) {
      if (entries.some(function (en) { return en.isIntersecting; })) {
        statsShown = true;
        countUp();
        io.disconnect();
      }
    }, { threshold: 0.3 });
    io.observe(grid);
  }

  function buildHeat(days) {
    var heat = document.getElementById("heat");
    if (!heat || !days || !days.length) return;
    heat.textContent = "";
    var frag = document.createDocumentFragment();
    var lead = new Date(days[0].date + "T00:00:00Z").getUTCDay(); /* 0 = Sunday row */
    for (var i = 0; i < lead; i++) {
      var blank = document.createElement("i");
      blank.style.visibility = "hidden";
      frag.appendChild(blank);
    }
    days.forEach(function (d) {
      var c = d.count, cell = document.createElement("i");
      if (c >= 10) cell.className = "l4";
      else if (c >= 6) cell.className = "l3";
      else if (c >= 3) cell.className = "l2";
      else if (c >= 1) cell.className = "l1";
      cell.setAttribute("data-d", d.date);
      cell.setAttribute("data-c", String(c));
      frag.appendChild(cell);
    });
    heat.appendChild(frag);
    var wrap = heat.parentNode;
    if (wrap) wrap.scrollLeft = wrap.scrollWidth; /* newest weeks first in view */
  }

  /* GitHub-style popup over a calendar cell: "3 contributions on Nov 15, 2026".
     One shared tooltip on <body> (an ancestor's backdrop-filter would trap a fixed child). Mouse: hover.
     Touch: tap a cell, tap elsewhere or scroll to dismiss. */
  function fmtDay(iso) {
    return new Date(iso + "T00:00:00Z").toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  }
  function initHeatTip() {
    var heat = document.getElementById("heat");
    if (!heat) return;
    var tip = document.createElement("div");
    tip.className = "heat-tip";
    tip.setAttribute("role", "tooltip");
    tip.setAttribute("aria-hidden", "true");
    document.body.appendChild(tip);
    var on = null;
    function hide() { tip.classList.remove("on"); on = null; }
    function show(cell) {
      if (cell === on) return;
      on = cell;
      var c = Number(cell.getAttribute("data-c"));
      tip.textContent = "";
      var b = document.createElement("b");
      b.textContent = (c ? c : "No") + " contribution" + (c === 1 ? "" : "s");
      tip.appendChild(b);
      tip.appendChild(document.createTextNode(" on " + fmtDay(cell.getAttribute("data-d"))));
      var r = cell.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
      var cx = r.left + r.width / 2;
      var left = Math.max(8, Math.min(window.innerWidth - w - 8, cx - w / 2));
      var top = r.top - h - 10, below = top < 8;
      if (below) top = r.bottom + 10;
      tip.style.left = left + "px";
      tip.style.top = top + "px";
      tip.style.setProperty("--ax", (cx - left) + "px");
      tip.classList.toggle("below", below);
      tip.classList.add("on");
    }
    function cellOf(e) { var t = e.target; return t && t.closest ? t.closest("#heat i[data-d]") : null; }
    heat.addEventListener("pointerover", function (e) {
      if (e.pointerType === "touch") return;
      var c = cellOf(e);
      if (c) show(c); else hide();
    });
    heat.addEventListener("pointerout", function (e) {
      if (e.pointerType === "touch") return;
      if (!e.relatedTarget || !heat.contains(e.relatedTarget)) hide();
    });
    heat.addEventListener("pointerdown", function (e) {
      var c = cellOf(e);
      if (c) show(c); else hide();
    });
    document.addEventListener("pointerdown", function (e) { if (!heat.contains(e.target)) hide(); });
    window.addEventListener("scroll", hide, { passive: true });
  }

  var TYPE_LABEL = { push: "PUSH", create: "NEW", delete: "DEL", pull_request: "PR", watch: "STAR", member: "TEAM", public: "OPEN" };

  function buildFeed(events) {
    var feed = document.getElementById("feed");
    if (!feed || !events || !events.length) return;
    feed.textContent = "";
    events.slice(0, 5).forEach(function (ev) {
      var li = document.createElement("li");
      var t = document.createElement("span"); t.className = "t"; t.textContent = TYPE_LABEL[ev.type] || String(ev.type || "").toUpperCase().slice(0, 5);
      var s = document.createElement("span"); s.className = "s"; s.textContent = String(ev.repo || "").split("/").pop();
      var time = document.createElement("time"); time.setAttribute("datetime", ev.at);
      time.textContent = new Date(ev.at).toLocaleDateString("en", { month: "short", day: "numeric" });
      var r = document.createElement("span"); r.className = "r"; r.textContent = (ev.summary || "") + " · " + (ev.repo || "");
      li.appendChild(t); li.appendChild(s); li.appendChild(time); li.appendChild(r);
      feed.appendChild(li);
    });
  }

  function applyStats(data) {
    var c = data.contributions || {};
    if (c.total != null) setStat("total", c.total);
    if (c.activeDays != null) setStat("active", c.activeDays);
    if (c.currentStreak && c.currentStreak.days != null) setStat("streak", c.currentStreak.days);
    if (c.peak && c.peak.count != null) setStat("peak", c.peak.count);
    if (data.repos && data.repos.length) setStat("projects", data.repos.length);
    buildHeat(c.days);
    buildFeed(data.events);
    var note = document.getElementById("stats-note");
    if (note && data.generatedAt) {
      var d = new Date(data.generatedAt);
      note.textContent = "Public GitHub activity, snapshot from " +
        d.toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric" }) +
        ". Refreshed every 3 hours.";
    }
    if (statsShown) countUp();
  }

  function loadStats() {
    if (!window.fetch) return;
    fetch("data/stats.json", { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(applyStats)
      .catch(function () { /* keep the saved numbers already in the markup */ });
  }

  /* ---------------- sound effects: synthesised with Web Audio (no files, no requests) ----------------
     The reactor's power-up / power-down play when you press the reactor, unless you have muted sound.
     Small UI sounds (nav ticks, button clicks, theme chime) play only after you switch sound on. */
  var sound = null;
  function initSound() {
    var AC = window.AudioContext || window.webkitAudioContext;
    var btn = document.querySelector(".sound-toggle");
    if (!AC) return;
    var ctx = null, master = null, room = null, noiseBuf = null, hum = null, lit = false, pref = null;
    try { pref = localStorage.getItem("sujel-sound"); } catch (e) { /* storage may be blocked */ }
    function uiOn() { return pref === "on"; }
    function reactorOk() { return pref !== "off"; }
    /* A small, dark room built from decaying noise that loses its highs as it fades (no audio files needed). */
    function makeRoom(c) {
      var rate = c.sampleRate, n = Math.floor(rate * 1.3), pre = Math.floor(rate * 0.012), buf = c.createBuffer(2, n, rate);
      for (var ch = 0; ch < 2; ch++) {
        var d = buf.getChannelData(ch), lp = 0;
        for (var i = pre; i < n; i++) {
          var k = (i - pre) / (n - pre), a = 0.62 + 0.36 * k;
          lp += ((Math.random() * 2 - 1) - lp) * (1 - a);
          d[i] = lp * Math.pow(1 - k, 3.2) * 3.2;
        }
      }
      var v = c.createConvolver();
      v.buffer = buf;
      return v;
    }
    function ac() {
      if (!ctx) {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.7;
        var comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -20; comp.knee.value = 14; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.2;
        master.connect(comp);
        comp.connect(ctx.destination);
        room = makeRoom(ctx);
        room.connect(master);
        var n = ctx.sampleRate, nd;
        noiseBuf = ctx.createBuffer(1, n, n);
        nd = noiseBuf.getChannelData(0);
        for (var i = 0; i < n; i++) nd[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === "suspended" && ctx.resume) { var p = ctx.resume(); if (p && p.catch) p.catch(function () {}); }
      return ctx;
    }
    /* dry to the master bus, plus an optional send into the room */
    function out(node, wet) {
      node.connect(master);
      if (wet) { var s = ctx.createGain(); s.gain.value = wet; node.connect(s); s.connect(room); }
    }
    /* A struck-glass note: a sine plus a few softer, faster-fading partials, low-passed, with a natural decay. */
    var PARTS = [[1, 1, 1], [2.01, 0.3, 0.55], [2.76, 0.22, 0.35], [5.4, 0.08, 0.18]];
    function glass(f, t, vel, dec, wet) {
      var c = ac(), g = c.createGain(), lp = c.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.value = Math.min(9000, f * 7); lp.Q.value = 0.4;
      lp.connect(g);
      out(g, wet);
      PARTS.forEach(function (p) {
        var o = c.createOscillator(), a = c.createGain(), d = dec * p[2];
        o.type = "sine"; o.frequency.value = f * p[0];
        a.gain.setValueAtTime(0.0001, t);
        a.gain.exponentialRampToValueAtTime(vel * p[1], t + 0.004);
        a.gain.exponentialRampToValueAtTime(0.0001, t + 0.004 + d);
        o.connect(a); a.connect(lp);
        o.start(t); o.stop(t + d + 0.06);
      });
    }
    /* the physical "touch" at the start of a sound: about 15 ms of softly filtered noise */
    function tap(t, vel, f) {
      var c = ac(), s = c.createBufferSource(), b = c.createBiquadFilter(), g = c.createGain();
      s.buffer = noiseBuf;
      b.type = "bandpass"; b.frequency.value = f; b.Q.value = 0.9;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vel, t + 0.0015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.016);
      s.connect(b); b.connect(g);
      out(g, 0.15);
      s.start(t, Math.random() * 0.8);
      s.stop(t + 0.03);
    }
    /* filtered noise that sweeps between two frequencies (risers, falls, air) */
    function air(t, a, d, vel, f1, f2, q, type) {
      var c = ac(), s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), end = t + a + d;
      s.buffer = noiseBuf; s.loop = true;
      f.type = type || "bandpass"; f.Q.value = q || 0.8;
      f.frequency.setValueAtTime(f1, t);
      f.frequency.exponentialRampToValueAtTime(f2, end);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vel, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, end);
      s.connect(f); f.connect(g);
      out(g, 0.25);
      s.start(t, Math.random() * 0.5);
      s.stop(end + 0.05);
    }
    /* a stack of sines under a sweeping low-pass: swells and spin-downs */
    function pad(freqs, t, a, d, vel, f1, f2, glide) {
      var c = ac(), g = c.createGain(), lp = c.createBiquadFilter(), end = t + a + d;
      lp.type = "lowpass"; lp.Q.value = 0.5;
      lp.frequency.setValueAtTime(f1, t);
      lp.frequency.exponentialRampToValueAtTime(f2, end);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vel, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, end);
      lp.connect(g);
      out(g, 0.2);
      freqs.forEach(function (f, i) {
        var o = c.createOscillator();
        o.type = "sine";
        o.frequency.setValueAtTime(f, t);
        if (glide) o.frequency.exponentialRampToValueAtTime(f * glide, end);
        o.detune.value = i % 2 ? 4 : -4;
        o.connect(lp);
        o.start(t); o.stop(end + 0.05);
      });
    }
    /* a soft low strike */
    function thump(t, f1, f2, vel, d) {
      var c = ac(), o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
      o.type = "sine";
      o.frequency.setValueAtTime(f1, t);
      o.frequency.exponentialRampToValueAtTime(f2, t + 0.2);
      lp.type = "lowpass"; lp.frequency.value = 240;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vel, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.006 + d);
      o.connect(lp); lp.connect(g);
      out(g, 0.1);
      o.start(t); o.stop(t + d + 0.08);
    }
    /* the reactor's idle hum: three low sines, low-passed, with a slow breathing movement; kept very quiet */
    function startHum(t) {
      if (hum) return;
      var c = ac(), g = c.createGain(), lp = c.createBiquadFilter(), lfo = c.createOscillator(), lg = c.createGain(), osc = [];
      lp.type = "lowpass"; lp.frequency.value = 420; lp.Q.value = 0.4;
      [[55, 1], [110.4, 0.5], [165.2, 0.18]].forEach(function (p) {
        var o = c.createOscillator(), og = c.createGain();
        o.type = "sine"; o.frequency.value = p[0]; og.gain.value = p[1];
        o.connect(og); og.connect(lp);
        o.start(t); osc.push(o);
      });
      lfo.frequency.value = 0.22; lg.gain.value = 0.004;
      lfo.connect(lg); lg.connect(g.gain);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.014, t + 1.4);
      lp.connect(g); g.connect(master);
      lfo.start(t); osc.push(lfo);
      hum = { g: g, osc: osc };
    }
    function stopHum(fade) {
      if (!hum || !ctx) return;
      var n = hum, t = ctx.currentTime;
      hum = null;
      n.g.gain.cancelScheduledValues(t);
      n.g.gain.setValueAtTime(Math.max(n.g.gain.value, 0.0001), t);
      n.g.gain.exponentialRampToValueAtTime(0.0001, t + fade);
      n.osc.forEach(function (o) { o.stop(t + fade + 0.05); });
    }
    /* one key for everything (D major pentatonic) so the sounds always sit together; one note per page */
    var SCALE = [587.33, 659.25, 739.99, 880, 987.77];
    var S = {
      tick: function (i) {
        var t = ac().currentTime + 0.005;
        tap(t, 0.06, 4800);
        glass(SCALE[i >= 0 && i < SCALE.length ? i : 3], t, 0.11, 0.22, 0.22);
      },
      click: function () {
        var t = ac().currentTime + 0.005;
        tap(t, 0.07, 2400);
        thump(t, 220, 150, 0.09, 0.09);
        glass(587.33, t + 0.004, 0.1, 0.3, 0.3);
      },
      chime: function () { /* rises for the light theme, falls for the dark one */
        var t = ac().currentTime + 0.005, light = root.getAttribute("data-theme") === "light";
        glass(light ? 880 : 1174.66, t, 0.06, 0.55, 0.35);
        glass(light ? 1318.51 : 783.99, t + 0.1, 0.055, 0.8, 0.4);
      },
      on: function () { /* sound switched on */
        var t = ac().currentTime + 0.005;
        glass(587.33, t, 0.055, 0.5, 0.35);
        glass(880, t + 0.09, 0.055, 0.55, 0.35);
        glass(1174.66, t + 0.18, 0.05, 0.9, 0.4);
      },
      up: function () {
        var t = ac().currentTime + 0.02, s = t + 1;
        pad([46, 92], t, 0.95, 0.9, 0.055, 140, 260, 0);
        pad([110, 164.8, 220, 329.6], t, 1, 1.1, 0.06, 250, 3000, 1.04);
        air(t, 0.95, 0.3, 0.1, 500, 5200, 0.7);
        thump(s, 95, 46, 0.11, 0.6);
        air(s, 0.004, 0.25, 0.1, 1200, 250, 0.5, "lowpass");
        glass(1760, s + 0.02, 0.09, 1.8, 0.55);
        glass(1318.51, s + 0.12, 0.06, 1.6, 0.55);
        startHum(s + 0.1);
      },
      down: function () {
        var t = ac().currentTime + 0.02;
        stopHum(0.6);
        thump(t + 0.02, 80, 40, 0.14, 0.5);
        pad([220, 329.6, 440], t, 0.01, 0.9, 0.07, 2400, 160, 0.6);
        air(t, 0.01, 0.9, 0.07, 3200, 160, 0.6, "lowpass");
      }
    };
    function play(name, arg) { try { S[name](arg); } catch (e) { /* audio unavailable */ } }
    function paint() {
      if (!btn) return;
      var on = pref === "on";
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.setAttribute("aria-label", on ? "Turn sound effects off" : "Turn sound effects on");
    }
    if (btn) {
      btn.hidden = false;
      paint();
      btn.addEventListener("click", function () {
        pref = pref === "on" ? "off" : "on";
        try { localStorage.setItem("sujel-sound", pref); } catch (e) { /* storage may be blocked */ }
        paint();
        if (pref === "on") play("on"); else stopHum(0.3);
      });
    }
    document.addEventListener("click", function (e) {
      if (!uiOn()) return;
      var t = e.target && e.target.closest ? e.target.closest("a,button") : null;
      if (!t || t.classList.contains("sound-toggle")) return;
      if (t.classList.contains("theme-toggle")) play("chime");
      else if (t.closest(".nav,.tabbar")) play("tick", VIEWS.indexOf(t.getAttribute("data-view")));
      else if (t.classList.contains("btn") || t.classList.contains("card")) play("click");
    });
    document.addEventListener("keydown", function (e) {
      if ((e.key !== "t" && e.key !== "T") || e.ctrlKey || e.metaKey || e.altKey || !uiOn()) return;
      var t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      play("chime");
    });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stopHum(0.3);
      else if (lit && reactorOk() && ctx) { try { startHum(ctx.currentTime + 0.1); } catch (e) { /* audio unavailable */ } }
    });
    sound = {
      reactor: function (on) {
        lit = on;
        if (reactorOk()) play(on ? "up" : "down");
      }
    };
  }

  /* ---------------- arc reactor: powers on when clicked / tapped (or P), off again on the next press ---------------- */
  function initReactor() {
    var rx = document.querySelector(".rx");
    var hit = document.querySelector(".rx-hit");
    if (!rx || !hit) return;
    var timer = 0;
    function toggle() {
      var on = rx.getAttribute("data-power") !== "on";
      rx.setAttribute("data-power", on ? "on" : "off");
      if (sound) sound.reactor(on);
      clearTimeout(timer);
      rx.classList.remove("rx-ignite");
      if (on && !reduced()) {
        void rx.offsetWidth;
        rx.classList.add("rx-ignite");
        timer = setTimeout(function () { rx.classList.remove("rx-ignite"); }, 1600);
        if (navigator.vibrate) navigator.vibrate([18, 40, 26]);
      }
    }
    hit.addEventListener("click", toggle);
    /* touch screens: the reactor leans toward the finger (the mouse does the same on desktop) */
    var stage = document.querySelector(".stage");
    if (stage) {
      var lean = function (e) {
        if (reduced() || wideMQ.matches || !e.touches.length) return;
        var t = e.touches[0], r = rx.getBoundingClientRect();
        var dx = (t.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2);
        var dy = (t.clientY - (r.top + r.height / 2)) / (window.innerHeight / 3);
        stage.style.setProperty("--px", Math.max(-1, Math.min(1, dx)).toFixed(3));
        stage.style.setProperty("--py", Math.max(-1, Math.min(1, dy)).toFixed(3));
      };
      var rest = function () { stage.style.setProperty("--px", "0"); stage.style.setProperty("--py", "0"); };
      stage.addEventListener("touchstart", lean, { passive: true });
      stage.addEventListener("touchmove", lean, { passive: true });
      stage.addEventListener("touchend", rest, { passive: true });
      stage.addEventListener("touchcancel", rest, { passive: true });
    }
    document.addEventListener("keydown", function (e) {
      if ((e.key !== "p" && e.key !== "P") || e.ctrlKey || e.metaKey || e.altKey) return;
      var t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      toggle();
    });
  }

  /* ---------------- CV viewer: modal on desktop; phones and no-JS fall back to a new tab ---------------- */
  function initCv() {
    var box = document.getElementById("cv"), link = document.querySelector("a[data-cv]");
    if (!box || !link || typeof box.showModal !== "function") return;
    var frame = box.querySelector("iframe");
    link.addEventListener("click", function (e) {
      if (!wideMQ.matches || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      e.preventDefault();
      if (!frame.getAttribute("src")) frame.setAttribute("src", link.getAttribute("href")); /* load the PDF only when asked */
      box.showModal();
      root.style.overflow = "hidden";
    });
    box.addEventListener("click", function (e) { if (e.target === box || e.target.hasAttribute("data-close")) box.close(); });
    box.addEventListener("close", function () { root.style.overflow = ""; });
  }

  /* ---------------- boot ---------------- */
  function boot() {
    initReveal();
    initSound();
    initReactor();
    initStatsCountUp();
    initHeatTip();
    initCv();
    onScroll();
    requestAnimationFrame(function () {
      placeAllPills(false);
      requestAnimationFrame(function () { placeAllPills(true); });
    });
    loadStats();
  }

  window.addEventListener("resize", function () { placeAllPills(false); onScroll(); });
  document.addEventListener("visibilitychange", function () { root.setAttribute("data-hidden", document.hidden ? "true" : "false"); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { placeAllPills(false); });
  window.addEventListener("load", function () { placeAllPills(false); onScroll(); });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
