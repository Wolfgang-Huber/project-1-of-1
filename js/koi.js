/* Koi pond strip: canvas 2D, no libraries. Koi wander, flee the cursor, chase food; ripples on move/tap. */
(function () {
  var wrap = document.querySelector('.koi-pond');
  if (!wrap) return;
  var cv = wrap.querySelector('canvas'), ctx = cv.getContext('2d');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SPEED = reduce ? 0.35 : 1;
  var W = 0, H = 0, dpr = 1, running = false, raf = 0, last = 0, T = 0;
  var koi = [], pads = [], ripples = [], food = [], mouse = { x: -1e4, y: -1e4, on: false }, lastRip = 0, lastRx = 0, lastRy = 0;
  var caustic = null;

  function rnd(a, b) { return a + Math.random() * (b - a); }

  function makeCaustic() {
    var s = 256, c = document.createElement('canvas'); c.width = c.height = s;
    var g = c.getContext('2d'), pts = [];
    for (var i = 0; i < 22; i++) pts.push([Math.random() * s, Math.random() * s]);
    // approximate a caustic web: soft bright lines between near neighbours (tiled)
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineCap = 'round';
    for (var a = 0; a < pts.length; a++) for (var b = a + 1; b < pts.length; b++) {
      for (var ox = -s; ox <= s; ox += s) for (var oy = -s; oy <= s; oy += s) {
        var dx = pts[b][0] + ox - pts[a][0], dy = pts[b][1] + oy - pts[a][1], d = Math.hypot(dx, dy);
        if (d < 70) {
          g.lineWidth = 1.2 + (70 - d) / 40;
          g.beginPath(); g.moveTo(pts[a][0], pts[a][1]);
          g.quadraticCurveTo(pts[a][0] + dx / 2 + dy * 0.18, pts[a][1] + dy / 2 - dx * 0.18, pts[a][0] + dx, pts[a][1] + dy); g.stroke();
          g.beginPath(); g.moveTo(pts[a][0] - ox, pts[a][1] - oy);
          g.quadraticCurveTo(pts[a][0] - ox + dx / 2 + dy * 0.18, pts[a][1] - oy + dy / 2 - dx * 0.18, pts[b][0], pts[b][1]); g.stroke();
        }
      }
    }
    var b2 = document.createElement('canvas'); b2.width = b2.height = s;
    var g2 = b2.getContext('2d'); g2.filter = 'blur(2.5px)'; g2.drawImage(c, 0, 0);
    return b2;
  }

  var PATTERNS = [
    { base: '#fff7ef', spots: ['#f0592a', '#f0592a'], ink: false },
    { base: '#ff8a2a', spots: ['#fff3e0'], ink: false },
    { base: '#fff7ef', spots: ['#e2362a'], ink: true },
    { base: '#f8f1e6', spots: ['#ffb02e', '#1c1a17'], ink: false },
    { base: '#e9472b', spots: ['#fff3e6'], ink: true }
  ];

  function Koi(i) {
    this.len = rnd(54, 78) * (W < 600 ? 0.8 : 1);
    this.x = rnd(this.len, W - this.len); this.y = rnd(H * 0.3, H * 0.7);
    this.a = rnd(0, Math.PI * 2); this.v = rnd(0.55, 0.85); this.turn = 0; this.phase = rnd(0, 6);
    this.p = PATTERNS[i % PATTERNS.length];
    this.spots = []; for (var k = 0; k < 3; k++) this.spots.push([rnd(0.12, 0.7), rnd(-0.35, 0.35), rnd(0.12, 0.22), this.p.spots[k % this.p.spots.length]]);
    this.trail = []; for (var j = 0; j < 60; j++) this.trail.push([this.x - Math.cos(this.a) * j, this.y - Math.sin(this.a) * j]);
  }
  Koi.prototype.update = function (dt) {
    var want = this.a, urgency = 0.02, speed = this.v;
    this.turn += rnd(-0.06, 0.06); this.turn *= 0.96; want += this.turn;
    // stay in the strip
    var m = 40, my = Math.max(36, H * 0.27), cx = W / 2, cy = H / 2;
    if (this.x < m || this.x > W - m || this.y < my || this.y > H - my) { want = Math.atan2(cy - this.y + rnd(-20, 20), cx - this.x); urgency = 0.07; }
    // seek food
    var best = null, bd = 240;
    for (var f = 0; f < food.length; f++) { var d = Math.hypot(food[f].x - this.x, food[f].y - this.y); if (d < bd) { bd = d; best = food[f]; } }
    if (best) { want = Math.atan2(best.y - this.y, best.x - this.x); urgency = 0.09; speed = 1.5; if (bd < 9) { best.eaten = true; ripples.push({ x: best.x, y: best.y, r: 2, a: 0.5 }); } }
    // flee cursor
    var md = Math.hypot(mouse.x - this.x, mouse.y - this.y);
    if (mouse.on && md < 110) { want = Math.atan2(this.y - mouse.y, this.x - mouse.x); urgency = 0.12; speed = 2.2; }
    var da = Math.atan2(Math.sin(want - this.a), Math.cos(want - this.a));
    this.a += da * urgency * dt;
    this.cur = (this.cur || this.v) + (speed - (this.cur || this.v)) * 0.05 * dt;
    var s = this.cur * SPEED * dt;
    this.x += Math.cos(this.a) * s; this.y += Math.sin(this.a) * s;
    this.phase += (0.12 + this.cur * 0.1) * SPEED * dt;
    this.trail.unshift([this.x, this.y]); if (this.trail.length > 90) this.trail.pop();
  };
  Koi.prototype.spine = function () {
    // sample points along the trail by arc length, add tail wiggle
    var N = 12, L = this.len, out = [], acc = 0, j = 0, tr = this.trail;
    for (var i = 0; i <= N; i++) {
      var target = (i / N) * L;
      while (j < tr.length - 1) { var seg = Math.hypot(tr[j + 1][0] - tr[j][0], tr[j + 1][1] - tr[j][1]); if (acc + seg >= target) break; acc += seg; j++; }
      var p0 = tr[j], p1 = tr[Math.min(j + 1, tr.length - 1)], seg2 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1, u = Math.min(1, (target - acc) / seg2);
      var x = p0[0] + (p1[0] - p0[0]) * u, y = p0[1] + (p1[1] - p0[1]) * u;
      var nx = -(p1[1] - p0[1]) / seg2, ny = (p1[0] - p0[0]) / seg2, s = i / N;
      var w = Math.sin(this.phase - s * 4.2) * L * 0.06 * s * s;
      out.push([x + nx * w, y + ny * w, nx, ny]);
    }
    return out;
  };
  function widthAt(s) { return s < 0.28 ? 0.62 + 0.38 * Math.sin(s / 0.28 * Math.PI / 2) : 0.06 + 0.94 * Math.pow(Math.cos((s - 0.28) / 0.72 * Math.PI / 2), 1.1); }
  Koi.prototype.draw = function (shadow) {
    var sp = this.spine(), L = this.len, W2 = L * 0.16, N = sp.length - 1, i;
    ctx.save(); if (shadow) ctx.translate(5, 7);
    var finCol = shadow ? 'rgba(10,40,60,.2)' : 'rgba(255,250,240,.6)';
    ctx.fillStyle = finCol;
    // pectoral fins: small paddles angled back, flapping
    var h = sp[3], fwd = Math.atan2(sp[2][1] - sp[4][1], sp[2][0] - sp[4][0]);
    for (var side = -1; side <= 1; side += 2) {
      var flap = 0.9 + Math.sin(this.phase * 0.9 + side) * 0.25;
      ctx.save(); ctx.translate(h[0] + h[2] * W2 * 0.85 * side, h[1] + h[3] * W2 * 0.85 * side);
      ctx.rotate(fwd + Math.PI + side * flap); ctx.beginPath(); ctx.ellipse(W2 * 0.55, 0, W2 * 0.7, W2 * 0.32, 0, 0, 6.3); ctx.fill(); ctx.restore();
    }
    // tail fan
    var t = sp[N], tp = sp[N - 1], back = Math.atan2(t[1] - tp[1], t[0] - tp[0]), sway = Math.sin(this.phase - 4.2) * 0.35;
    ctx.save(); ctx.translate(t[0], t[1]); ctx.rotate(back + sway);
    ctx.beginPath(); ctx.moveTo(-W2 * 0.2, 0);
    ctx.quadraticCurveTo(W2 * 0.5, -W2 * 0.35, W2 * 1.25, -W2 * 0.85); ctx.quadraticCurveTo(W2 * 0.85, 0, W2 * 1.25, W2 * 0.85);
    ctx.quadraticCurveTo(W2 * 0.5, W2 * 0.35, -W2 * 0.2, 0); ctx.fill(); ctx.restore();
    // body
    ctx.beginPath();
    for (i = 0; i <= N; i++) { var q = sp[i], w = W2 * widthAt(i / N); i ? ctx.lineTo(q[0] + q[2] * w, q[1] + q[3] * w) : ctx.moveTo(q[0] + q[2] * w, q[1] + q[3] * w); }
    for (i = N; i >= 0; i--) { var q2 = sp[i], w2 = W2 * widthAt(i / N); ctx.lineTo(q2[0] - q2[2] * w2, q2[1] - q2[3] * w2); }
    ctx.closePath();
    var hx = sp[0][0], hy = sp[0][1], hr = W2 * 0.62;
    ctx.moveTo(hx + hr, hy); ctx.arc(hx, hy, hr, 0, 6.3);
    if (shadow) { ctx.fillStyle = 'rgba(10,40,60,.2)'; ctx.fill('nonzero'); ctx.restore(); return; }
    ctx.fillStyle = this.p.base; ctx.fill('nonzero');
    ctx.save(); ctx.clip('nonzero');
    for (var n = 0; n < this.spots.length; n++) {
      var sd = this.spots[n], pt = sp[Math.round(sd[0] * N)];
      ctx.fillStyle = sd[3]; ctx.beginPath();
      ctx.ellipse(pt[0] + pt[2] * sd[1] * W2 * 1.6, pt[1] + pt[3] * sd[1] * W2 * 1.6, L * sd[2] * 0.9, L * sd[2] * 0.6, Math.atan2(pt[3], pt[2]) + 1.57, 0, 6.3); ctx.fill();
    }
    if (this.p.ink) { ctx.fillStyle = '#1c1a17'; for (var z = 0; z < 3; z++) { var pz = sp[3 + z * 2]; ctx.beginPath(); ctx.arc(pz[0] + pz[2] * W2 * (z - 1) * 0.5, pz[1] + pz[3] * W2 * (z - 1) * 0.5, L * 0.035, 0, 6.3); ctx.fill(); } }
    ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.beginPath(); ctx.arc(sp[2][0], sp[2][1], W2 * 0.8, 0, 6.3); ctx.fill();
    ctx.restore();
    var e = sp[1]; ctx.fillStyle = '#1c1a17';
    for (var s2 = -1; s2 <= 1; s2 += 2) { ctx.beginPath(); ctx.arc(e[0] + e[2] * W2 * 0.55 * s2, e[1] + e[3] * W2 * 0.55 * s2, Math.max(1.3, L * 0.026), 0, 6.3); ctx.fill(); }
    ctx.restore();
  };

  function makePads() {
    pads = []; var n = Math.max(2, Math.round(W / 420));
    for (var i = 0; i < n; i++) pads.push({ x: (i + 0.5) * W / n + rnd(-60, 60), y: rnd(H * 0.2, H * 0.8), r: rnd(18, 30) * (W < 600 ? 0.8 : 1), a: rnd(0, 6), ph: rnd(0, 6), flower: Math.random() < 0.5 });
  }
  function drawPad(p) {
    var bob = Math.sin(T * 0.02 * SPEED + p.ph) * 1.5, r = p.r;
    ctx.save(); ctx.translate(p.x, p.y + bob); ctx.rotate(p.a + Math.sin(T * 0.004 + p.ph) * 0.08);
    ctx.fillStyle = 'rgba(10,40,60,.18)'; ctx.beginPath(); ctx.arc(4, 6, r, 0.35, Math.PI * 2 - 0.05); ctx.lineTo(4, 6); ctx.fill();
    var g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 2, 0, 0, r); g.addColorStop(0, '#8fd66a'); g.addColorStop(1, '#4e9e3c');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0.35, Math.PI * 2 - 0.05); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(40,90,30,.35)'; ctx.lineWidth = 1;
    for (var k = 0; k < 6; k++) { var an = 0.6 + k * 0.95; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(an) * r * 0.85, Math.sin(an) * r * 0.85); ctx.stroke(); }
    if (p.flower) { ctx.fillStyle = '#ffd1e3'; for (var f = 0; f < 6; f++) { ctx.beginPath(); ctx.ellipse(Math.cos(f) * 5 - r * 0.25, Math.sin(f) * 5 - r * 0.2, 5, 2.6, f, 0, 6.3); ctx.fill(); } ctx.fillStyle = '#ffe066'; ctx.beginPath(); ctx.arc(-r * 0.25, -r * 0.2, 2.6, 0, 6.3); ctx.fill(); }
    ctx.restore();
  }

  function resize() {
    var r = wrap.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1);
    var nw = Math.round(r.width), nh = Math.round(r.height);
    if (nw === W && nh === H) return;
    W = nw; H = nh; cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var n = W < 600 ? 3 : (W < 1100 ? 4 : 5);
    koi = []; for (var i = 0; i < n; i++) koi.push(new Koi(i));
    makePads(); if (!running) draw();
  }

  function draw() {
    var g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2a86a8'); g.addColorStop(0.55, '#47abc6'); g.addColorStop(1, '#2d8cae');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (caustic) {
      ctx.save(); ctx.globalAlpha = 0.22;
      var pat = ctx.createPattern(caustic, 'repeat'), o1 = T * 0.15 * SPEED, o2 = T * 0.1 * SPEED;
      ctx.translate(o1 % 256, (o1 * 0.4) % 256); ctx.fillStyle = pat; ctx.fillRect(-256, -256, W + 512, H + 512);
      ctx.setTransform(dpr * 1.35, 0, 0, dpr * 1.35, 0, 0); ctx.translate(-(o2 % 256), (o2 * 0.6) % 256); ctx.globalAlpha = 0.14; ctx.fillRect(-256, -256, W + 512, H + 512);
      ctx.restore(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    var i;
    for (i = 0; i < koi.length; i++) koi[i].draw(true);
    for (i = 0; i < koi.length; i++) koi[i].draw(false);
    // food
    for (i = 0; i < food.length; i++) { var f = food[i]; ctx.fillStyle = 'rgba(120,70,30,' + (0.9 * f.life) + ')'; ctx.beginPath(); ctx.arc(f.x, f.y, 2.6, 0, 6.3); ctx.fill(); }
    for (i = 0; i < pads.length; i++) drawPad(pads[i]);
    // ripples
    for (i = 0; i < ripples.length; i++) { var rp = ripples[i]; ctx.strokeStyle = 'rgba(255,255,255,' + rp.a + ')'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(rp.x, rp.y, rp.r, 0, 6.3); ctx.stroke(); }
  }

  function step(now) {
    if (!running) return;
    var dt = Math.min(3, (now - (last || now)) / 16.67); last = now; T += dt;
    for (var i = 0; i < koi.length; i++) koi[i].update(dt);
    for (i = ripples.length - 1; i >= 0; i--) { var r = ripples[i]; r.r += 0.9 * dt * (reduce ? 0.6 : 1); r.a -= 0.008 * dt; if (r.a <= 0) ripples.splice(i, 1); }
    for (i = food.length - 1; i >= 0; i--) { var f = food[i]; f.life -= 0.0015 * dt; f.x += Math.sin(T * 0.03 + f.s) * 0.05; if (f.eaten || f.life <= 0) food.splice(i, 1); }
    draw(); raf = requestAnimationFrame(step);
  }
  function start() { if (running) return; running = true; last = 0; raf = requestAnimationFrame(step); }
  function stop() { running = false; cancelAnimationFrame(raf); }

  function local(e) { var r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  wrap.addEventListener('pointermove', function (e) {
    var p = local(e); mouse.x = p[0]; mouse.y = p[1]; mouse.on = true;
    var now = performance.now();
    if (now - lastRip > (reduce ? 260 : 90) && Math.hypot(p[0] - lastRx, p[1] - lastRy) > 14) { ripples.push({ x: p[0], y: p[1], r: 3, a: 0.45 }); lastRip = now; lastRx = p[0]; lastRy = p[1]; }
  }, { passive: true });
  wrap.addEventListener('pointerleave', function () { mouse.on = false; mouse.x = mouse.y = -1e4; });
  wrap.addEventListener('pointerdown', function (e) {
    var p = local(e);
    ripples.push({ x: p[0], y: p[1], r: 4, a: 0.7 }, { x: p[0], y: p[1], r: 1, a: 0.5 });
    for (var k = 0; k < 6; k++) food.push({ x: p[0] + rnd(-16, 16), y: p[1] + rnd(-12, 12), life: 1, s: rnd(0, 6) });
    if (e.pointerType !== 'mouse') { mouse.on = false; mouse.x = mouse.y = -1e4; } // touch: feed, don't scare
  }, { passive: true });

  caustic = makeCaustic();
  resize();
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(wrap); else window.addEventListener('resize', resize);
  if ('IntersectionObserver' in window) new IntersectionObserver(function (en) { en[0].isIntersecting ? start() : stop(); }, { rootMargin: '80px' }).observe(wrap);
  else start();
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); });
})();
