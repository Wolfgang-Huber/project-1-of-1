/* Transit nav: train parked under the current station; travels on click, then navigates. */
(function () {
  var route = document.querySelector('.route'); if (!route) return;
  var train = route.querySelector('.train');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var mobile = window.matchMedia('(max-width: 760px)');
  function spot(a) {
    var b = a.querySelector('.bullet').getBoundingClientRect(), r = route.getBoundingClientRect();
    var x = b.left + b.width / 2 - r.left, y = b.top + b.height / 2 - r.top;
    var yb = mobile.matches ? b.top + b.height / 2 - r.top + 36 : b.bottom - r.top + 8;
    return { x: x, y: yb, rot: 0 };                                          // parked under the current station
  }
  function place(a) { var s = spot(a); train.style.setProperty('--tx', s.x + 'px'); train.style.setProperty('--ty', s.y + 'px'); train.style.setProperty('--flip', flip); }
  var flip = sessionStorage.getItem('trainFlip') || '1';
  var current = route.querySelector('a[aria-current="page"]') || route.querySelector('a');
  place(current); train.classList.add('is-placed');
  window.addEventListener('resize', function () { if (!train.classList.contains('is-moving')) place(current); });
  document.addEventListener('click', function (e) { if (e.target.closest('.nav-toggle')) setTimeout(function () { place(current); }, 0); });
  route.addEventListener('click', function (e) {
    var a = e.target.closest('a');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    if (a === current) { e.preventDefault(); return; }
    if (reduce) return;                       // instant: normal navigation
    e.preventDefault();
    var go = function () { location.href = a.href; };
    var from = spot(current).x, to = spot(a).x;
    flip = to < from ? '-1' : '1'; try { sessionStorage.setItem('trainFlip', flip); } catch (_) {}
    train.classList.add('is-moving'); place(a);
    var done = false, fin = function () { if (!done) { done = true; go(); } };
    train.addEventListener('transitionend', fin, { once: true }); setTimeout(fin, 950);
  });
  window.addEventListener('pageshow', function (ev) { if (ev.persisted) { train.classList.remove('is-moving'); place(current); } });
})();
