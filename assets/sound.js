(function () {
  "use strict";
  var VIEWS = ["home", "work", "about", "stats", "contact"];
  var root = document.documentElement;
  /* ---------------- sound effects: synthesised with Web Audio (no audio assets) ----------------
     The reactor's power-up / power-down play when you press the reactor, unless you have muted sound.
     Small UI sounds (nav ticks, button clicks, theme chime) play only after you switch sound on. */
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
    return {
      reactor: function (on) {
        lit = on;
        if (reactorOk()) play(on ? "up" : "down");
      }
    };
  }
  window.SujelSound = { init: initSound };
})();
