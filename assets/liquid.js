/* liquid.js — SUJEL.OS "Liquid Glass".
   Five one-screen views, a sliding glass pill, pointer light + tilt, 3D stage parallax,
   and live numbers from data/stats.json. No dependencies, no third-party requests.
   Without JavaScript the page stays a normal scrolling document (see .no-js in liquid.css). */
(function () {
  "use strict";

  var VIEWS = ["home", "work", "about", "stats", "contact"];
  var root = document.documentElement;
  var reduceMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  var fineMQ = window.matchMedia("(hover: hover) and (pointer: fine)");
  var wideMQ = window.matchMedia("(min-width: 901px)");
  var reduced = function () { return reduceMQ.matches; };
  var themeToggle = document.querySelector(".theme-toggle");

  /* ---------------- light / Stark theme ---------------- */
  function applyTheme(theme, save) {
    theme = theme === "light" ? "light" : "dark";
    root.setAttribute("data-theme", theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "light" ? "#EEF3FF" : "#05080D");
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

  var viewEls = {};
  VIEWS.forEach(function (id) { viewEls[id] = document.getElementById(id); });
  var navs = [].slice.call(document.querySelectorAll(".nav, .tabbar"));
  var current = null;
  var statsShown = false;
  var stats = null;

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

  /* ---------------- view switching ---------------- */
  function fromHash() {
    var h = (location.hash || "").replace("#", "");
    return VIEWS.indexOf(h) > -1 ? h : "home";
  }

  function show(id, push) {
    if (!viewEls[id]) id = "home";
    if (id === current) return;
    var prev = current && viewEls[current];
    current = id;
    markCurrent(id);
    placeAllPills(true);

    if (push) {
      try { history.pushState({ view: id }, "", "#" + id); } catch (e) { location.hash = id; }
    }

    var next = viewEls[id];
    if (prev && !reduced()) {
      prev.classList.remove("active");
      prev.classList.add("leaving");
      setTimeout(function () { prev.classList.remove("leaving"); }, 220);
    } else if (prev) {
      prev.classList.remove("active");
    }
    next.classList.add("active");
    window.scrollTo(0, 0);
    try { next.setAttribute("tabindex", "-1"); next.focus({ preventScroll: true }); } catch (e) { /* ignore */ }

    if (id === "stats") onStatsShown();
  }

  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[data-view]");
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    e.preventDefault();
    show(a.getAttribute("data-view"), true);
  });
  window.addEventListener("popstate", function () { show(fromHash(), false); });
  window.addEventListener("hashchange", function () { show(fromHash(), false); });

  /* 1-5 jump between views, ← → step through them (not while typing) */
  document.addEventListener("keydown", function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (e.key.toLowerCase() === "t") {
      applyTheme(root.getAttribute("data-theme") === "light" ? "dark" : "light", true);
      return;
    }
    var i = VIEWS.indexOf(current);
    if (e.key >= "1" && e.key <= "5") { show(VIEWS[+e.key - 1], true); return; }
    if (e.key === "ArrowRight" && i < VIEWS.length - 1 && !(t && t.closest && t.closest(".heat-wrap"))) show(VIEWS[i + 1], true);
    if (e.key === "ArrowLeft" && i > 0 && !(t && t.closest && t.closest(".heat-wrap"))) show(VIEWS[i - 1], true);
  });

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
    if (stage && wideMQ.matches && current === "home") {
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

  function setGauge(key, value, max) {
    var gauge = document.querySelector('[data-gauge="' + key + '"]');
    if (gauge && isFinite(Number(value))) gauge.style.setProperty("--gauge", Math.max(0, Math.min(100, Number(value) / max * 100)).toFixed(1) + "%");
  }

  function countUp() {
    [].forEach.call(document.querySelectorAll("#stats [data-stat]"), function (el) {
      var target = Number(el.getAttribute("data-target"));
      if (!isFinite(target) || reduced()) return;
      var t0 = performance.now(), dur = 900;
      (function tick(now) {
        var k = Math.min(1, (now - t0) / dur);
        var eased = 1 - Math.pow(1 - k, 3);
        el.textContent = String(Math.round(target * eased));
        if (k < 1) requestAnimationFrame(tick);
      })(t0);
    });
  }

  function onStatsShown() {
    if (statsShown) return;
    statsShown = true;
    countUp();
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
      cell.title = d.date + ": " + c + (c === 1 ? " contribution" : " contributions");
      frag.appendChild(cell);
    });
    heat.appendChild(frag);
    var wrap = heat.parentNode;
    if (wrap) wrap.scrollLeft = wrap.scrollWidth; /* newest weeks first in view */
  }

  var TYPE_LABEL = { push: "PUSH", create: "NEW", delete: "DEL", pull_request: "PR", watch: "STAR", member: "TEAM", public: "OPEN" };

  function buildFeed(events) {
    var feed = document.getElementById("feed");
    if (!feed || !events || !events.length) return;
    feed.textContent = "";
    events.slice(0, 6).forEach(function (ev) {
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
    stats = data;
    var c = data.contributions || {};
    if (c.total != null) setStat("total", c.total);
    if (c.activeDays != null) setStat("active", c.activeDays);
    if (c.currentStreak && c.currentStreak.days != null) setStat("streak", c.currentStreak.days);
    if (c.peak && c.peak.count != null) setStat("peak", c.peak.count);
    if (data.repos && data.repos.length) setStat("projects", data.repos.length);
    if (c.total != null) setGauge("total", c.total, 1000);
    if (c.currentStreak && c.currentStreak.days != null) setGauge("streak", c.currentStreak.days, 30);
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

  /* ---------------- boot ---------------- */
  function boot() {
    show(fromHash(), false);
    /* first pill placement without sliding in from the corner */
    requestAnimationFrame(function () {
      placeAllPills(false);
      requestAnimationFrame(function () { placeAllPills(true); });
    });
    loadStats();
  }

  window.addEventListener("resize", function () { placeAllPills(false); });
  document.addEventListener("visibilitychange", function () { root.setAttribute("data-hidden", document.hidden ? "true" : "false"); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { placeAllPills(false); });
  window.addEventListener("load", function () { placeAllPills(false); });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
