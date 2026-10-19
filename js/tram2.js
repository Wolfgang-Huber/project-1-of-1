/* About tram v2: CSS does all motion; JS only sequences states (no per-frame work). */
(function () {
  var el = document.querySelector('.tram2'); if (!el) return;
  var view = el.querySelector('.t2-view'), tram = el.querySelector('.t2-tram'), label = el.querySelector('.t2-label');
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches, busy = false;
  el.classList.add('is-idle-ready');
  function k() { return parseFloat(getComputedStyle(el).getPropertyValue('--k')) || 1; }
  function once(node, name, fn) { function h(e) { if (e.target === node && e.animationName === name) { node.removeEventListener('animationend', h); fn(); } } node.addEventListener('animationend', h); }
  function back() {
    el.classList.remove('is-driving'); el.classList.add('is-hidden');
    setTimeout(function () {
      if (reduce) { el.classList.remove('is-hidden'); busy = false; el.classList.remove('is-busy'); return; }
      el.classList.add('is-return');
      once(tram, 't2-return', function () { el.classList.remove('is-return', 'is-hidden', 'is-busy'); busy = false; });
    }, 700);
  }
  function go() {
    if (busy) return; busy = true; el.classList.add('is-busy');
    var kk = k(), w = view.clientWidth, idle = 128 * kk, dist = w - idle;
    el.style.setProperty('--x1', w + 'px');
    el.style.setProperty('--spin', (dist / (2 * Math.PI * 9 * kk) * 360).toFixed(0) + 'deg');
    el.style.setProperty('--dur', Math.max(4.5, Math.min(8, dist / 150)).toFixed(2) + 's');
    if (reduce) { setTimeout(back, 300); return; }
    el.classList.add('is-ding');
    setTimeout(function () { el.classList.remove('is-ding'); el.classList.add('is-driving'); once(tram, 't2-drive', back); }, 500);
  }
  tram.addEventListener('click', go); label.addEventListener('click', go);
  if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { el.classList.toggle('is-paused', !es[es.length - 1].isIntersecting); }).observe(el);
})();
