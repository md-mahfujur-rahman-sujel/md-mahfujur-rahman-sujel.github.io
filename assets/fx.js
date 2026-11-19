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
    node.style.removeProperty('--fx-x');
    node.style.removeProperty('--fx-y');
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
        var rect = node.getBoundingClientRect();
        node.style.setProperty('--fx-x', (event.clientX - rect.left) + 'px');
        node.style.setProperty('--fx-y', (event.clientY - rect.top) + 'px');
      }, { passive: true });
      node.addEventListener('pointerleave', function () {
        node.style.removeProperty('--fx-alpha');
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
      var rect = node.getBoundingClientRect();
      node.style.setProperty('--fx-x', (event.clientX - rect.left) + 'px');
      node.style.setProperty('--fx-y', (event.clientY - rect.top) + 'px');
    }, { passive: true });
    node.addEventListener('pointerleave', function () {
      node.style.removeProperty('--fx-alpha');
    }, { passive: true });
  }
  if (reducedQuery) {
    if (reducedQuery.addEventListener) reducedQuery.addEventListener('change', enable);
    else if (reducedQuery.addListener) reducedQuery.addListener(enable);
  }
})();
