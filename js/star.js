/* Living mascot star: blink, happy eyes, follow pointer, idle float. rAF only, no libraries. */
(function () {
  var root = document.querySelector('.hero-star');
  if (!root) return;
  var svg = root.querySelector('svg');
  var bob = svg.querySelector('.st-bob'), face = svg.querySelector('.st-face'), bow = svg.querySelector('.st-bow');
  var glasses = svg.querySelector('.st-glasses'), pupils = svg.querySelectorAll('.st-pupil'), lidsR = svg.querySelectorAll('.st-eyelid'), lid = 0, eyesO = svg.querySelector('.st-eyes-open'), eyesC = svg.querySelector('.st-eyes-closed'), shadow = svg.querySelector('.st-shadow'), back = svg.querySelector('.st-back'), dark = svg.querySelector('.st-dark'), light = svg.querySelector('.st-light'), vx = 0, vy = 0;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var tx = 0, ty = 0, x = 0, y = 0, lastMove = -1e9, t0 = performance.now();
  var blinkUntil = 0, happyUntil = 0, hover = false;

  function aim(cx, cy) {
    var r = root.getBoundingClientRect();
    var dx = cx - (r.left + r.width / 2), dy = cy - (r.top + r.height * 0.45);
    var d = Math.hypot(dx, dy), k = Math.min(1, d / Math.max(220, r.width)) / (d || 1);
    tx = dx * k; ty = dy * k; lastMove = performance.now();
  }
  window.addEventListener('pointermove', function (e) { aim(e.clientX, e.clientY); }, { passive: true });
  window.addEventListener('pointerdown', function (e) { aim(e.clientX, e.clientY); }, { passive: true });
  window.addEventListener('touchmove', function (e) { var t = e.touches[0]; if (t) aim(t.clientX, t.clientY); }, { passive: true });
  svg.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') hover = true; });
  svg.addEventListener('pointerleave', function () { hover = false; });
  var spinStart = -1, spinDir = 1, spinQueued = false, SPIN_MS = 900;
  function startSpin() { spinStart = performance.now(); spinDir = Math.random() < 0.5 ? -1 : 1; happyUntil = spinStart + SPIN_MS + 250; }
  svg.addEventListener('click', function () { if (spinStart < 0) startSpin(); else spinQueued = true; });
  function spinXf(now) {
    if (spinStart < 0) return '';
    var p = (now - spinStart) / SPIN_MS;
    if (p >= 1) { spinStart = -1; if (spinQueued) { spinQueued = false; startSpin(); } return ''; }
    var c = 1.9, q = p - 1, e = 1 + (c + 1) * q * q * q + c * q * q; // springy ease-out (overshoot)
    var squash = p < 0.18 ? Math.sin(p / 0.18 * Math.PI) * 0.12 : 0;              // little squash at start
    var bounce = p > 0.7 ? Math.sin((p - 0.7) / 0.3 * Math.PI) * 0.07 : 0;         // bounce at the end
    return 'rotateZ(' + (spinDir * 360 * e).toFixed(2) + 'deg) scale(' + (1 + squash - bounce * 0.5).toFixed(3) + ',' + (1 - squash + bounce).toFixed(3) + ') ';
  }

  function scheduleBlink() {
    setTimeout(function () {
      var now = performance.now(); blinkUntil = now + 140;
      if (Math.random() < 0.18) setTimeout(function () { blinkUntil = performance.now() + 130; }, 260); // double blink
      if (Math.random() < 0.12) happyUntil = now + 1600 + Math.random() * 1200;                         // relaxed happy moment
      scheduleBlink();
    }, 2000 + Math.random() * 3000);
  }
  scheduleBlink();

  function frame(now) {
    var t = (now - t0) / 1000;
    if (now - lastMove > 3500) { // idle look-around
      tx = Math.sin(t * 0.45) * 0.55 + Math.sin(t * 1.1) * 0.15;
      ty = Math.sin(t * 0.33 + 1.3) * 0.35;
    }
    vx = (vx + (tx - x) * 0.045) * 0.86; vy = (vy + (ty - y) * 0.045) * 0.86; x += vx; y += vy; // soft wobbly spring
    var happy = hover || now < happyUntil, blink = now < blinkUntil;
    svg.classList.toggle('is-happy', happy);
    lid += ((blink ? 1 : 0) - lid) * (blink ? 0.55 : 0.35);
    var m = Math.hypot(x, y), px = m > 1 ? x / m : x, py = m > 1 ? y / m : y;
    for (var i = 0; i < pupils.length; i++) {
      pupils[i].setAttribute('transform', 'translate(' + (px * 13).toFixed(2) + ' ' + (py * 13).toFixed(2) + ')');
      lidsR[i].setAttribute('height', (58 * lid).toFixed(2));
    }
    face.setAttribute('transform', 'translate(' + (x * 18).toFixed(2) + ' ' + (y * 13).toFixed(2) + ')');
    back.setAttribute('transform', 'translate(' + (-x * 9).toFixed(2) + ' ' + (-y * 7 + 5).toFixed(2) + ')');
    dark.setAttribute('transform', 'translate(' + (-x * 34).toFixed(2) + ' ' + (-y * 26 + 8).toFixed(2) + ')');
    light.setAttribute('transform', 'translate(' + (x * 46 - 18).toFixed(2) + ' ' + (y * 36 - 30).toFixed(2) + ')');
    var gT = 'translate(' + (x * 2).toFixed(2) + ' ' + (y * 1.5).toFixed(2) + ')';
    glasses.setAttribute('transform', gT); eyesO.setAttribute('transform', gT); eyesC.setAttribute('transform', gT);
    bow.setAttribute('transform', 'translate(' + (200 - x * 3).toFixed(2) + ' ' + (276 - y * 2).toFixed(2) + ') rotate(' + (x * 4).toFixed(2) + ')');
    if (!reduce) {
      var b = Math.sin(t * 1.6) * 7;
      bob.setAttribute('transform', 'translate(0 ' + b.toFixed(2) + ')');
      shadow.setAttribute('transform', 'translate(200 370) scale(' + (1 - b / 90).toFixed(3) + ') translate(-200 -370)');
      var ax = Math.abs(x), sq = 1 + (vy * 0.6);
      svg.style.transform = spinXf(now) + 'translateX(' + (x * 12).toFixed(2) + 'px) rotateY(' + (x * 19).toFixed(2) + 'deg) rotateX(' + (-y * 14).toFixed(2) + 'deg) rotateZ(' + (x * 9).toFixed(2) + 'deg) skewX(' + (-x * 5).toFixed(2) + 'deg) scale(' + (1 - ax * 0.05 + vx * 0.3 * Math.sign(x || 1)).toFixed(3) + ',' + (sq + ax * 0.03).toFixed(3) + ')';
    }
    if (reduce) svg.style.transform = spinXf(now);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
