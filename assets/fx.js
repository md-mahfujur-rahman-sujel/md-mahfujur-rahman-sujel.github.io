/* Lightweight pointer lighting for glass surfaces; no layout reads during scroll. */
(function () {
  'use strict';
  var root = document.documentElement;
  var finePointer = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)');
  var reducedQuery = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  var selector = '.card, .repo-card, .hero-stage, .contact-card, .metric-card, .activity-card';
  function reduced() {
    return (reducedQuery && reducedQuery.matches) || root.getAttribute('data-motion') === 'reduced';
  }
  function clear(node) {
    node.classList.remove('fx-lit');
    node.classList.remove('fx-tilt');
    clearTimeout(node.__fxTimer);
    node.style.removeProperty('--fx-x');
    node.style.removeProperty('--fx-y');
    node.style.removeProperty('--fx-rotate-x');
    node.style.removeProperty('--fx-rotate-y');
    node.style.removeProperty('--fx-alpha');
  }
  function enable() {
    var targets = document.querySelectorAll(selector);
    if (!finePointer || !finePointer.matches || reduced()) {
      targets.forEach(clear);
      return;
    }
    function bind(node) {
      if (!node.matches || !node.matches(selector)) return;
      node.classList.add('fx-lit');
      if (node.__fxBound) return;
      node.__fxBound = true;
      node.addEventListener('pointermove', function (event) {
        if (reduced()) return;
        clearTimeout(node.__fxTimer);
        var rect = node.getBoundingClientRect();
        setPointerStyle(node, event, rect);
      }, { passive: true });
      node.addEventListener('pointerleave', function () {
        resetPointerStyle(node);
      }, { passive: true });
    }
    targets.forEach(bind);
  }
  enable();
  document.addEventListener('motionchange', enable);
  new MutationObserver(function (records) {
    records.forEach(function (record) {
      record.addedNodes.forEach(function (node) {
        if (node.nodeType !== 1) return;
        enableNode(node);
        node.querySelectorAll(selector).forEach(enableNode);
      });
    });
  }).observe(document.body, { childList: true, subtree: true });
  function enableNode(node) {
    if (reduced() || !finePointer || !finePointer.matches) return;
    if (!node.matches || !node.matches(selector)) return;
    node.classList.add('fx-lit');
    if (node.__fxBound) return;
    node.__fxBound = true;
    node.addEventListener('pointermove', function (event) {
      if (reduced()) return;
      clearTimeout(node.__fxTimer);
      var rect = node.getBoundingClientRect();
      setPointerStyle(node, event, rect);
    }, { passive: true });
    node.addEventListener('pointerleave', function () {
      resetPointerStyle(node);
    }, { passive: true });
  }
  function setPointerStyle(node, event, rect) {
    var x = (event.clientX - rect.left) / Math.max(rect.width, 1);
    var y = (event.clientY - rect.top) / Math.max(rect.height, 1);
    node.style.setProperty('--fx-x', (x * rect.width) + 'px');
    node.style.setProperty('--fx-y', (y * rect.height) + 'px');
    node.style.setProperty('--fx-rotate-x', ((.5 - y) * 7).toFixed(2) + 'deg');
    node.style.setProperty('--fx-rotate-y', ((x - .5) * 9).toFixed(2) + 'deg');
    node.classList.add('fx-tilt');
  }
  function resetPointerStyle(node) {
    node.style.removeProperty('--fx-alpha');
    node.style.setProperty('--fx-rotate-x', '0deg');
    node.style.setProperty('--fx-rotate-y', '0deg');
    node.__fxTimer = setTimeout(function () { node.classList.remove('fx-tilt'); }, 280);
  }
  if (reducedQuery) {
    if (reducedQuery.addEventListener) reducedQuery.addEventListener('change', enable);
    else if (reducedQuery.addListener) reducedQuery.addListener(enable);
  }
})();
