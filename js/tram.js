/* About: mini tram — waits peeking out of the left tunnel, drives to the right tunnel on press, loops. */
(function () {
  var strip = document.querySelector('.tram-strip');
  if (!strip) return;
  var view = strip.querySelector('.ts-view'), tram = strip.querySelector('.ts-tram'), svg = tram.querySelector('svg'), label = strip.querySelector('.ts-label');
  var PEEK = 50, busy = false;
  function tw() { return tram.offsetWidth || 112; }
  function startX() { return -tw() + PEEK; }
  function place(x, y, r) { tram.style.transform = 'translateX(' + x.toFixed(1) + 'px)'; svg.style.transform = 'translateY(' + (y || 0).toFixed(2) + 'px) rotate(' + (r || 0).toFixed(2) + 'deg)'; }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function anim(ms, fn, done) { var t0 = performance.now(); (function f(now) { var p = Math.min(1, (now - t0) / ms); fn(p); p < 1 ? requestAnimationFrame(f) : done && done(); })(t0); }
  function go() {
    if (busy) return; busy = true; label.classList.add('is-hidden');
    var x0 = startX(), x1 = view.clientWidth + 4, DRIVE = 4500;
    anim(380, function (p) { place(x0, 0, Math.sin(p * Math.PI * 5) * 2.2 * (1 - p)); }, function () { // ding wiggle
      anim(DRIVE, function (p) {
        var e = ease(p), sp = Math.sin(p * Math.PI);
        place(x0 + (x1 - x0) * e, -Math.abs(Math.sin(p * 60)) * 1.4 * sp, 0);
      }, function () {
        place(-tw() - 10, 0, 0); // hidden inside the left tunnel
        setTimeout(function () {
          anim(700, function (p) { place(-tw() - 10 + (PEEK + 10) * ease(p), 0, 0); }, function () { busy = false; label.classList.remove('is-hidden'); });
        }, 500);
      });
    });
  }
  tram.addEventListener('click', go); label.addEventListener('click', go);
  function rest() { if (!busy) place(startX(), 0, 0); }
  window.addEventListener('resize', rest); rest();
})();
