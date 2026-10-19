// Water-edge slosh. CSS keyframes do the idle drift; this tiny spring only runs while sloshing.
(function () {
  var el = document.querySelector('.waterline');
  if (!el) return;
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var E = 0, ph1 = 0, ph2 = 1.7, raf = 0, last = 0, lx = null, ly = null, lt = 0;
  function inBand(y) { var r = el.getBoundingClientRect(); return y > r.top - 30 && y < r.bottom + 10; }
  function clear() { ['--s1', '--s2', '--y1', '--y2'].forEach(function (k) { el.style.removeProperty(k); }); }
  function pump(v) { E = Math.min(1, E + v); if (!raf) { last = 0; raf = requestAnimationFrame(tick); } }
  function tick(now) {
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016; last = now;
    E *= Math.exp(-dt / 0.85);                               // settles smoothly
    var w = 6.283 * (0.8 + 1.6 * E);                         // faster wobble while energetic
    ph1 += dt * w; ph2 += dt * w * 1.23;
    var s1 = 1 + E * 0.5 * Math.sin(ph1), s2 = 1 + E * 0.4 * Math.sin(ph2);
    var y1 = E * 9 * Math.sin(ph1 * 0.5 + 0.8), y2 = E * 9 * Math.sin(ph2 * 0.5 + 2.1);
    if (E < 0.004) { clear(); raf = 0; return; }
    el.style.setProperty('--s1', s1.toFixed(4)); el.style.setProperty('--s2', s2.toFixed(4)); el.style.setProperty('--y1', y1.toFixed(2) + 'px'); el.style.setProperty('--y2', y2.toFixed(2) + 'px');
    raf = requestAnimationFrame(tick);
  }
  window.addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse' || !inBand(e.clientY)) { lx = null; return; }
    var now = performance.now();
    if (lx !== null) { var sp = Math.hypot(e.clientX - lx, e.clientY - ly) / Math.max(8, now - lt); pump(Math.min(0.12, sp * 0.05)); }
    lx = e.clientX; ly = e.clientY; lt = now;
  }, { passive: true });
  window.addEventListener('pointerdown', function (e) { if (inBand(e.clientY)) pump(e.pointerType === 'mouse' ? 0.5 : 0.8); }, { passive: true });
  if ('IntersectionObserver' in window) new IntersectionObserver(function (es) {
    var on = es[es.length - 1].isIntersecting; el.classList.toggle('is-paused', !on);
    if (!on && raf) { cancelAnimationFrame(raf); raf = 0; E = 0; clear(); }
  }).observe(el);
})();
