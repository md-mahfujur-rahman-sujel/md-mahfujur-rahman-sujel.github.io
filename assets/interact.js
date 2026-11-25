/* interact.js — SUJEL.OS interaction layer.
   1) Project cards: click opens a detail dialog (live repo facts from data/stats.json), hover shows a quick peek.
      Cards stay normal links: ctrl/cmd/middle-click, no JavaScript, or no dialog support open GitHub directly.
   2) Draggable 3D: spin the home globe, the contact globe and the arc reactor with a mouse or finger; they keep
      momentum and settle back. Clicking a globe gives it a spin kick and a ripple.
   Nothing here runs until the first pointer, scroll or key event, so first paint and the Lighthouse budgets are untouched.
   Spinning is skipped under reduced motion. No dependencies, no third-party requests. */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduceMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  var fineMQ = window.matchMedia("(hover: hover) and (pointer: fine)");
  var EVENTS = ["pointermove", "pointerdown", "touchstart", "scroll", "wheel", "keydown"];
  var started = false;

  function go() {
    if (started) return;
    started = true;
    EVENTS.forEach(function (n) { window.removeEventListener(n, go); });
    init();
  }
  EVENTS.forEach(function (n) { window.addEventListener(n, go, { passive: true }); });
  if ((window.scrollY || 0) > 0) go();

  var CSS = [
    ".o-orb,.cc>.gem.g-globe{cursor:grab;pointer-events:auto}",
    ".o-orb,.cc>.gem.g-globe,.rx-hit{touch-action:pan-y;-webkit-user-select:none;user-select:none}",
    ".is-grab,.is-grab *{cursor:grabbing!important}",
    ".rip{position:absolute;width:20px;height:20px;margin:-10px 0 0 -10px;border:2px solid var(--cyan);border-radius:50%;pointer-events:none;animation:rip .8s ease-out forwards}",
    "@keyframes rip{to{transform:scale(9);opacity:0}}",
    ".peek{position:fixed;left:0;top:0;z-index:90;pointer-events:none;padding:9px 13px;border-radius:12px;font:500 12.5px/1.3 var(--sans);white-space:nowrap;color:#fff;background:rgba(10,16,40,.94);box-shadow:0 12px 30px -10px rgba(0,0,40,.6),inset 0 0 0 1px rgba(255,255,255,.14);opacity:0;transition:opacity .15s}",
    ".peek.on{opacity:1}",
    ".card .go{font-size:24px}",
    ".pj{width:min(640px,94vw);max-width:none;max-height:90vh;padding:0;border:1px solid var(--line);border-radius:32px;background:var(--bg);color:var(--ink);box-shadow:0 40px 80px -20px rgba(0,0,0,.6);overflow:auto}",
    ".pj::backdrop{background:rgba(3,6,15,.7);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}",
    ".pj[open]{animation:pj-in .35s var(--ease)}",
    "@keyframes pj-in{from{opacity:0;transform:translateY(18px) scale(.96)}}",
    ".pj-in{padding:28px}",
    ".pj-top{display:flex;align-items:center;gap:22px}",
    ".pj-art{position:relative;flex:none;width:150px;height:150px}",
    ".pj-art .gem.t{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}",
    ".pj-head{display:flex;flex-direction:column;gap:8px;min-width:0}",
    ".pj h2{font-size:clamp(28px,4vw,40px)}",
    ".pj-desc{margin:18px 0 0;font-size:17px;line-height:1.55;color:var(--ink-2)}",
    ".pj-meta{display:flex;flex-wrap:wrap;gap:12px 28px;margin:20px 0 0}",
    ".pj-meta li{display:flex;flex-direction:column;gap:3px;font-size:15px}",
    ".pj-meta b{font:500 11px/1.3 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)}",
    ".pj-chips{margin-top:20px}",
    ".pj-act{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-top:26px}",
    ".pj-act .sp{flex:1}",
    "@media(max-width:560px){.pj{border-radius:26px}.pj-in{padding:22px 20px}.pj-top{flex-direction:column;align-items:flex-start}.pj-art{width:120px;height:120px}.pj-act .sp{display:none}}",
    "@media(prefers-reduced-motion:reduce){.pj[open],.rip{animation:none}}"
  ].join("");

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function init() {
    var style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);
    initProjects();
    if (!reduceMQ.matches) initDrag();
  }

  /* ================= project cards ================= */
  var statsPromise = null;
  function stats() {
    if (!statsPromise) {
      statsPromise = (window.fetch ? fetch("data/stats.json").then(function (r) { return r.ok ? r.json() : null; }) : Promise.resolve(null))
        .catch(function () { return null; });
    }
    return statsPromise;
  }
  function repoFor(href) {
    var slug = String(href).replace(/^https?:\/\/github\.com\//i, "").replace(/\/+$/, "").toLowerCase();
    return stats().then(function (d) {
      var list = (d && d.repos) || [];
      for (var i = 0; i < list.length; i++) if (String(list[i].slug).toLowerCase() === slug) return list[i];
      return null;
    });
  }
  function fmt(iso) {
    var d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
  }
  function roleLabel(r) { return r === "collaborator" ? "Collaborator" : r === "owner" ? "Owner" : ""; }
  function text(card, sel) { var n = card.querySelector(sel); return n ? n.textContent.trim() : ""; }

  function initProjects() {
    var cards = [].slice.call(document.querySelectorAll(".cards a.card"));
    if (!cards.length) return;
    var dlg = el("dialog", "pj");
    if (typeof dlg.showModal !== "function") return;
    dlg.setAttribute("aria-labelledby", "pj-t");
    var inner = el("div", "pj-in");
    var top = el("div", "pj-top");
    var art = el("div", "pj-art"); art.setAttribute("aria-hidden", "true");
    var head = el("div", "pj-head");
    var tag = el("p", "label");
    var title = el("h2"); title.id = "pj-t";
    head.appendChild(tag); head.appendChild(title);
    top.appendChild(art); top.appendChild(head);
    var desc = el("p", "pj-desc");
    var meta = el("ul", "pj-meta");
    var chips = el("div", "chips pj-chips");
    var act = el("div", "pj-act");
    var link = el("a", "btn white", "Open on GitHub ");
    link.target = "_blank"; link.rel = "noopener noreferrer";
    var arrow = el("span", null, "\u2197"); arrow.setAttribute("aria-hidden", "true");
    link.appendChild(arrow);
    var prev = el("button", "btn glass sm", "\u2190 Prev"); prev.type = "button";
    var next = el("button", "btn glass sm", "Next \u2192"); next.type = "button";
    var close = el("button", "btn glass sm", "Close"); close.type = "button";
    act.appendChild(link); act.appendChild(el("span", "sp")); act.appendChild(prev); act.appendChild(next); act.appendChild(close);
    [top, desc, meta, chips, act].forEach(function (n) { inner.appendChild(n); });
    dlg.appendChild(inner);
    document.body.appendChild(dlg);

    var idx = 0;
    function fill(i) {
      idx = (i + cards.length) % cards.length;
      var c = cards[idx];
      tag.textContent = text(c, ".tag");
      title.textContent = text(c, "h3");
      desc.textContent = text(c, "p");
      art.textContent = "";
      var g = c.querySelector(".gem");
      if (g) { var cl = g.cloneNode(true); cl.removeAttribute("style"); art.appendChild(cl); }
      chips.textContent = "";
      [].forEach.call(c.querySelectorAll(".chips .chip"), function (ch) { chips.appendChild(ch.cloneNode(true)); });
      link.href = c.href;
      meta.textContent = "";
      repoFor(c.href).then(function (r) {
        if (!r || cards[idx] !== c) return;
        meta.textContent = "";
        [["Language", r.language], ["Role", roleLabel(r.role)], ["Last updated", r.updatedAt ? fmt(r.updatedAt) : ""], ["Stars", r.stars > 0 ? String(r.stars) : ""]].forEach(function (p) {
          if (!p[1]) return;
          var li = el("li"); li.appendChild(el("b", null, p[0])); li.appendChild(el("span", null, p[1])); meta.appendChild(li);
        });
      });
    }
    function openAt(i) {
      hidePeek();
      fill(i);
      dlg.showModal();
      root.style.overflow = "hidden";
    }
    prev.addEventListener("click", function () { fill(idx - 1); });
    next.addEventListener("click", function () { fill(idx + 1); });
    close.addEventListener("click", function () { dlg.close(); });
    dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener("close", function () { root.style.overflow = ""; });
    dlg.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") fill(idx - 1);
      else if (e.key === "ArrowRight") fill(idx + 1);
    });

    cards.forEach(function (c) {
      c.setAttribute("aria-haspopup", "dialog");
      var go = c.querySelector(".go");
      if (go) go.textContent = "+";
    });
    document.addEventListener("click", function (e) {
      if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest && e.target.closest(".cards a.card");
      if (!a) return;
      e.preventDefault();
      openAt(cards.indexOf(a));
    });

    /* hover peek: one shared bubble, desktop pointers only */
    var peek = el("div", "peek"); peek.setAttribute("role", "tooltip"); peek.setAttribute("aria-hidden", "true");
    document.body.appendChild(peek);
    var hovered = null;
    function hidePeek() { hovered = null; peek.classList.remove("on"); }
    function showPeek(card) {
      hovered = card;
      repoFor(card.href).then(function (r) {
        if (hovered !== card) return;
        var bits = r ? [r.language, roleLabel(r.role), r.updatedAt ? "updated " + fmt(r.updatedAt) : ""].filter(Boolean) : [];
        bits.push("click for details");
        peek.textContent = bits.join(" \u00b7 ");
        var rect = card.getBoundingClientRect(), w = peek.offsetWidth, h = peek.offsetHeight;
        var left = Math.max(8, Math.min(window.innerWidth - w - 8, rect.right - w - 16));
        var topPx = rect.top - h - 8;
        if (topPx < 8) topPx = rect.top + 10;
        peek.style.left = left + "px";
        peek.style.top = topPx + "px";
        peek.classList.add("on");
      });
    }
    document.addEventListener("pointerover", function (e) {
      if (!fineMQ.matches || e.pointerType === "touch" || dlg.open) return;
      var c = e.target.closest && e.target.closest(".cards a.card");
      if (c && c !== hovered) showPeek(c);
      else if (!c) hidePeek();
    });
    window.addEventListener("scroll", hidePeek, { passive: true });
  }

  /* ================= draggable 3D ================= */
  function initDrag() {
    if (!("IntersectionObserver" in window)) return;
    var items = [], last = 0, raf = 0;

    function apply(s) {
      s.el.style.transform = "rotateX(" + s.rx.toFixed(2) + "deg) rotateY(" + s.ry.toFixed(2) + "deg)";
    }
    function ensure() {
      if (raf || document.hidden) return;
      if (!items.some(function (s) { return s.vis && s.active; })) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
    function frame(t) {
      raf = 0;
      var dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      items.forEach(function (s) {
        if (!s.vis || !s.active || s.drag) return;
        if (s.mode === "idle") {
          s.ry += s.vy * dt;
          s.vy += (s.idle - s.vy) * Math.min(1, dt * 1.2);
          s.rx += (s.baseX - s.rx) * Math.min(1, dt * 2.5);
        } else if (Math.abs(s.vy) > 10) {
          s.ry += s.vy * dt;
          s.vy *= Math.pow(0.08, dt);
          s.rx += (0 - s.rx) * Math.min(1, dt * 2);
        } else {
          var target = Math.round(s.ry / 360) * 360, k = Math.min(1, dt * 5);
          s.vy = 0;
          s.ry += (target - s.ry) * k;
          s.rx += (0 - s.rx) * k;
          if (Math.abs(target - s.ry) < 0.3 && Math.abs(s.rx) < 0.3) {
            s.el.style.transform = "";
            s.el.style.transition = "";
            s.active = false; s.ry = 0; s.rx = 0;
            return;
          }
        }
        apply(s);
      });
      ensure();
    }
    document.addEventListener("visibilitychange", ensure);

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        for (var i = 0; i < items.length; i++) if (items[i].host === en.target) items[i].vis = en.isIntersecting;
      });
      ensure();
    });

    function ripple(host, e) {
      var r = host.getBoundingClientRect(), i = el("i", "rip");
      i.style.left = (e.clientX - r.left) + "px";
      i.style.top = (e.clientY - r.top) + "px";
      host.appendChild(i);
      setTimeout(function () { if (i.parentNode) i.parentNode.removeChild(i); }, 900);
    }

    function add(host, spin, o) {
      if (!host || !spin) return null;
      var s = { host: host, el: spin, mode: o.mode, baseX: o.baseX || 0, rx: o.baseX || 0, ry: 0, vy: o.idle || 0, idle: o.idle || 0, vis: false, drag: false, moved: false, active: o.mode === "idle" };
      items.push(s);
      if (s.mode === "idle") { spin.style.animation = "none"; apply(s); }

      var sx = 0, sy = 0, lx = 0, ly = 0, lt = 0;
      host.addEventListener("pointerdown", function (e) {
        if (e.button) return;
        s.drag = true; s.moved = false; s.active = true;
        sx = lx = e.clientX; sy = ly = e.clientY; lt = e.timeStamp; s.vy = 0;
        if (s.mode === "return") {
          s.el.style.transition = "none";
          if (!s.el.style.transform) { s.rx = 0; s.ry = 0; }
        }
        try { host.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
        host.classList.add("is-grab");
      });
      host.addEventListener("pointermove", function (e) {
        if (!s.drag) return;
        if (!s.moved && Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 6) s.moved = true;
        if (!s.moved) return;
        var dx = e.clientX - lx, dy = e.clientY - ly, dt = (e.timeStamp - lt) / 1000 || 0.016;
        lx = e.clientX; ly = e.clientY; lt = e.timeStamp;
        s.ry += dx * 0.55;
        s.rx = Math.max(s.baseX - 55, Math.min(s.baseX + 55, s.rx - dy * 0.35));
        s.vy = Math.max(-900, Math.min(900, s.vy * 0.6 + (dx * 0.55 / dt) * 0.4));
        apply(s);
      });
      function end(e) {
        if (!s.drag) return;
        s.drag = false;
        host.classList.remove("is-grab");
        if (!s.moved) {
          if (s.mode === "idle") { s.vy += 360; ripple(host, e); }
          else { s.el.style.transition = ""; s.active = false; }
        } else if (e.timeStamp - lt > 90) {
          s.vy = 0;
        }
        ensure();
      }
      host.addEventListener("pointerup", end);
      host.addEventListener("pointercancel", end);
      io.observe(host);
      return s;
    }

    add(document.querySelector(".o-orb"), document.querySelector(".o-orb .g-spin"), { mode: "idle", baseX: 18, idle: 13.8 });
    add(document.querySelector(".cc>.gem.g-globe"), document.querySelector(".cc>.gem.g-globe .w"), { mode: "idle", baseX: -16, idle: 13.8 });
    var rx = add(document.querySelector(".rx-hit"), document.querySelector(".rx-body"), { mode: "return" });

    /* a drag on the reactor must not also toggle its power: swallow the click that follows a drag */
    var stage = document.querySelector(".stage");
    if (rx && stage) {
      stage.addEventListener("click", function (e) {
        if (rx.moved && e.target === rx.host) { e.stopPropagation(); e.preventDefault(); rx.moved = false; }
      }, true);
    }
  }
})();
