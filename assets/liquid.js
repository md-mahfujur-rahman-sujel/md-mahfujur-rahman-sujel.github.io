/* liquid.js — SUJEL.OS "Liquid Glass".
   One long scrolling page: the navbar scrolls to a section and highlights whichever one is in view.
   Also: sliding glass pill, scroll reveals (fade + rise + blur-in), aurora parallax, pointer light + tilt,
   3D stage parallax, light/dark theme, and live numbers from data/stats.json.
   No dependencies, no third-party requests. Without JavaScript the page is a normal scrolling document. */
(function () {
  "use strict";

  var VIEWS = ["home", "work", "about", "stats", "contact"];
  var THEME_COLOR = { dark: "#060B22", light: "#D8E3FA" };
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
      themeToggle.querySelector(".theme-icon").textContent = theme === "light" ? "☾" : "☼";
    }
    if (save) { try { localStorage.setItem("sujel-theme", theme); } catch (e) { /* storage may be blocked */ } }
  }
  if (themeToggle) {
    themeToggle.hidden = false;
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

  /* ---------------- arc reactor: powers on when clicked / tapped (or P), off again on the next press ---------------- */
  function initReactor() {
    var rx = document.querySelector(".rx");
    var hit = document.querySelector(".rx-hit");
    if (!rx || !hit) return;
    var timer = 0;
    function toggle() {
      var on = rx.getAttribute("data-power") !== "on";
      rx.setAttribute("data-power", on ? "on" : "off");
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
    document.addEventListener("keydown", function (e) {
      if ((e.key !== "p" && e.key !== "P") || e.ctrlKey || e.metaKey || e.altKey) return;
      var t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      toggle();
    });
  }

  /* ---------------- boot ---------------- */
  function boot() {
    initReveal();
    initReactor();
    initStatsCountUp();
    initHeatTip();
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
