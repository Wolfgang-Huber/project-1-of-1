// Fogged shower glass: wipe the condensation to reveal the pool tiles. Canvas 2D, no libraries.
(function () {
  'use strict';
  var wrap = document.querySelector('.fog-glass');
  if (!wrap) return;
  var bgCv = wrap.querySelector('.fog-bg'), cv = wrap.querySelector('.fog-layer');
  var bg = bgCv.getContext('2d'), g = cv.getContext('2d');
  if (!bg || !g) return;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var MS = 0.5;                                    // mask resolution (CSS px -> mask px)
  var W = 0, H = 0, dpr = 1, mobile = false, R = 36;
  var fogTex = document.createElement('canvas'), ft = fogTex.getContext('2d');
  var Cm = document.createElement('canvas'), cm = Cm.getContext('2d');   // clear amount
  var Hm = document.createElement('canvas'), hm = Hm.getContext('2d');   // "still wet" hold
  var noiseCv = document.createElement('canvas'), noisePat = null;
  var tileImg = null, tileSize = 44;
  var drops = [], running = false, visible = true, raf = 0, last = 0, clock = 0, stepAcc = 0;
  var lastActive = -99, dirty = true, cleanMask = true, nextRandom = 3;
  var seed = 7; function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
  function rr(a, b) { return a + Math.random() * (b - a); }

  // ---------- assets ----------
  function loadTiles(cb) {
    var hero = document.querySelector('.hero');
    var v = hero ? getComputedStyle(hero).getPropertyValue('--tiles-img') : '';
    var sz = hero ? parseFloat(getComputedStyle(hero).getPropertyValue('--tiles-size')) : 0;
    var m = /url\(["']?(data:[^"')]+)["']?\)/.exec(v || '');
    if (!m) { cb(); return; }
    var im = new Image(); im.onload = function () { tileImg = im; tileSize = sz || 44 * 12; cb(); }; im.onerror = function () { cb(); }; im.src = m[1];
  }
  function makeNoise() {
    var n = 192; noiseCv.width = noiseCv.height = n;
    var x = noiseCv.getContext('2d'), id = x.createImageData(n, n), d = id.data;
    for (var i = 0; i < d.length; i += 4) { var v = Math.random(); d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = Math.round(110 + 145 * v * v); }
    x.putImageData(id, 0, 0); noisePat = cm.createPattern(noiseCv, 'repeat');
  }

  function paintBg() {
    bg.setTransform(1, 0, 0, 1, 0, 0); bg.clearRect(0, 0, bgCv.width, bgCv.height);
    if (tileImg) {
      var pat = bg.createPattern(tileImg, 'repeat'), s = tileSize * dpr / tileImg.width;
      bg.save(); bg.scale(s, s); bg.fillStyle = pat; bg.fillRect(0, 0, bgCv.width / s, bgCv.height / s); bg.restore();
    } else {
      bg.fillStyle = '#8fbdf0'; bg.fillRect(0, 0, bgCv.width, bgCv.height);
      bg.fillStyle = '#f4f8fd'; var p = 44 * dpr;
      for (var x = 0; x < bgCv.width; x += p) bg.fillRect(x, 0, 3 * dpr, bgCv.height);
      for (var y = 0; y < bgCv.height; y += p) bg.fillRect(0, y, bgCv.width, 3 * dpr);
    }
  }

  // handwritten "wipe me" (unit = x-height; y 0 = x-height top, 1 = baseline)
  var GLYPHS = {
    w: [0.66, function (c) { c.moveTo(0, 0.02); c.quadraticCurveTo(0.06, 0.75, 0.15, 1); c.lineTo(0.31, 0.28); c.lineTo(0.46, 1); c.quadraticCurveTo(0.57, 0.62, 0.62, 0); }],
    i: [0.26, function (c) { c.moveTo(0.1, 0.06); c.lineTo(0.1, 1); c.moveTo(0.1, -0.4); c.lineTo(0.12, -0.34); }],
    p: [0.72, function (c) { c.moveTo(0, 0.04); c.lineTo(0.01, 1.62); c.moveTo(0, 0.32); c.bezierCurveTo(0.06, -0.08, 0.62, -0.06, 0.6, 0.5); c.bezierCurveTo(0.58, 1.02, 0.1, 1.02, 0.01, 0.74); }],
    e: [0.64, function (c) { c.moveTo(0.06, 0.56); c.lineTo(0.55, 0.5); c.bezierCurveTo(0.6, 0.08, 0.14, -0.12, 0.05, 0.42); c.bezierCurveTo(-0.02, 0.92, 0.4, 1.12, 0.6, 0.84); }],
    ' ': [0.34, null],
    m: [0.9, function (c) { c.moveTo(0, 1); c.lineTo(0, 0.05); c.moveTo(0, 0.36); c.bezierCurveTo(0.05, -0.06, 0.38, -0.1, 0.4, 0.42); c.lineTo(0.4, 1); c.moveTo(0.4, 0.36); c.bezierCurveTo(0.45, -0.06, 0.78, -0.1, 0.8, 0.42); c.lineTo(0.8, 1); }]
  };
  function writeHint(c, ox, oy, u) {
    var text = 'wipe me', x = ox, feet = [];
    for (var k = 0; k < text.length; k++) {
      var gl = GLYPHS[text[k]];
      if (gl[1]) {
        var path = new Path2D(), m = new DOMMatrix([u, 0, 0, u, x, oy + Math.sin(k * 1.7) * u * 0.05]);
        var tmp = new Path2D(); var proxy = { moveTo: function (a, b) { tmp.moveTo(a, b); }, lineTo: function (a, b) { tmp.lineTo(a, b); }, quadraticCurveTo: function (a, b, cc, d) { tmp.quadraticCurveTo(a, b, cc, d); }, bezierCurveTo: function (a, b, cc, d, e, f) { tmp.bezierCurveTo(a, b, cc, d, e, f); } };
        gl[1](proxy); path.addPath(tmp, m);
        // soft finger stroke: wide faint halo, then a clearer core
        c.lineCap = c.lineJoin = 'round';
        c.globalAlpha = 0.16; c.lineWidth = u * 0.42; c.stroke(path);
        c.globalAlpha = 0.3; c.lineWidth = u * 0.3; c.stroke(path);
        c.globalAlpha = 0.32; c.lineWidth = u * 0.2; c.stroke(path);
        feet.push(x + u * 0.1);
      }
      x += (gl[0] + 0.2) * u;
    }
    c.globalAlpha = 1;
    return { w: x - ox, feet: feet };
  }

  function buildFog() {
    var w = cv.width, h = cv.height;
    fogTex.width = w; fogTex.height = h;
    // 1. heavily blurred copy of the tiles (multi-step downscale = cheap, Safari-safe blur)
    var a = document.createElement('canvas'), b = document.createElement('canvas');
    a.width = Math.max(2, Math.round(w / 16)); a.height = Math.max(2, Math.round(h / 16));
    b.width = Math.max(2, Math.round(w / 46)); b.height = Math.max(2, Math.round(h / 46));
    var ac = a.getContext('2d'), bc = b.getContext('2d');
    ac.imageSmoothingQuality = bc.imageSmoothingQuality = ft.imageSmoothingQuality = 'high';
    ac.drawImage(bgCv, 0, 0, a.width, a.height); bc.drawImage(a, 0, 0, b.width, b.height);
    ft.globalAlpha = 1; ft.drawImage(b, 0, 0, w, h); ft.globalAlpha = 0.22; ft.drawImage(a, 0, 0, w, h); ft.globalAlpha = 1;
    // 2. desaturate + milky condensation (denser towards the top, like steam)
    ft.globalCompositeOperation = 'saturation'; ft.fillStyle = 'rgba(128,128,128,0.55)'; ft.fillRect(0, 0, w, h);
    ft.globalCompositeOperation = 'source-over';
    var mg = ft.createLinearGradient(0, 0, 0, h);
    mg.addColorStop(0, 'rgba(238,243,247,0.62)'); mg.addColorStop(0.55, 'rgba(230,237,243,0.52)'); mg.addColorStop(1, 'rgba(224,233,241,0.48)');
    ft.fillStyle = mg; ft.fillRect(0, 0, w, h);
    // large soft density variation
    for (var i = 0; i < 14; i++) {
      var cx = rnd() * w, cy = rnd() * h, rad = (80 + rnd() * 220) * dpr, rg = ft.createRadialGradient(cx, cy, 0, cx, cy, rad);
      var lite = rnd() < 0.5; rg.addColorStop(0, lite ? 'rgba(248,251,253,0.18)' : 'rgba(170,190,205,0.10)'); rg.addColorStop(1, 'rgba(240,244,248,0)');
      ft.fillStyle = rg; ft.fillRect(0, 0, w, h);
    }
    // 3. micro-droplet grain: dense sub-pixel speckle + tiny beads with light core and dark rim
    var gc = document.createElement('canvas'), gn = 160 * Math.round(dpr); gc.width = gc.height = gn;
    var gx = gc.getContext('2d'), id = gx.createImageData(gn, gn), d = id.data;
    for (var p = 0; p < d.length; p += 4) { var v = Math.random(); if (v < 0.5) { d[p] = d[p + 1] = d[p + 2] = 255; d[p + 3] = Math.round(v * 70); } else { d[p] = 70; d[p + 1] = 92; d[p + 2] = 110; d[p + 3] = Math.round((v - 0.5) * 46); } }
    gx.putImageData(id, 0, 0);
    ft.fillStyle = ft.createPattern(gc, 'repeat'); ft.fillRect(0, 0, w, h);
    var nb = Math.round(w * h / (dpr * dpr) / (mobile ? 260 : 220));
    for (i = 0; i < nb; i++) {
      var x = rnd() * w, y = rnd() * h, r = (0.4 + Math.pow(rnd(), 3.4) * 1.6) * dpr;
      ft.fillStyle = 'rgba(80,104,124,0.12)'; ft.beginPath(); ft.arc(x + 0.25 * r, y + 0.35 * r, r, 0, 6.283); ft.fill();
      ft.fillStyle = 'rgba(255,255,255,0.34)'; ft.beginPath(); ft.arc(x - 0.2 * r, y - 0.25 * r, r * 0.6, 0, 6.283); ft.fill();
    }
    // 4. old drip tracks: thinner fog lines with beads left behind
    ft.globalCompositeOperation = 'destination-out';
    var tracks = mobile ? 2 : 4;
    for (i = 0; i < tracks; i++) {
      var tx = (0.08 + 0.84 * rnd()) * w, ty = rnd() * h * 0.35, len = h * (0.4 + rnd() * 0.6), tw = (2 + rnd() * 2) * dpr;
      ft.lineCap = 'round'; ft.lineWidth = tw; ft.strokeStyle = 'rgba(0,0,0,0.42)'; ft.beginPath(); ft.moveTo(tx, ty);
      for (var s = 0; s <= 1.0001; s += 0.05) ft.lineTo(tx + Math.sin(s * 9 + i) * 2.2 * dpr, ty + s * len);
      ft.stroke();
      for (s = 0.15; s < 1; s += 0.12 + rnd() * 0.2) drops.push(mkDrop((tx + Math.sin(s * 9 + i) * 2.2 * dpr) / dpr, (ty + s * len) / dpr, 0.7 + rnd() * 0.9, true));
    }
    ft.globalCompositeOperation = 'source-over';
    // 5. the finger-written hint
    var u = mobile ? 22 : 30, approx = 5.5 * u, ox = (W - approx) / 2, oy = H * 0.5 - u * 0.65;
    ft.save(); ft.scale(dpr, dpr); ft.globalCompositeOperation = 'destination-out'; ft.strokeStyle = '#000';
    var hint = writeHint(ft, ox, oy, u);
    // two little drips running from the letters
    ft.lineCap = 'round'; ft.globalAlpha = 0.42; ft.lineWidth = 2.6;
    [hint.feet[1], hint.feet[hint.feet.length - 2]].forEach(function (fx, k) {
      var sy = oy + u * (k ? 1 : 1.62), ly = u * (0.5 + k * 0.4);
      ft.beginPath(); ft.moveTo(fx, sy); ft.lineTo(fx + 0.6, sy + ly); ft.stroke();
      drops.push(mkDrop(fx + 0.6, sy + ly + 1.5, 2.1, true));
    });
    ft.restore();
    ft.globalCompositeOperation = 'source-over';
  }

  // ---------- drops ----------
  function mkDrop(x, y, r, fixed) { return { x: x, y: y, r: r, vy: 0, run: false, stick: 0, ph: Math.random() * 6.28, fixed: !!fixed, age: 0, bead: 0 }; }
  function addWater(x, y, r) {
    for (var i = 0; i < drops.length; i++) { var d = drops[i]; var dx = d.x - x, dy = d.y - y; if (dx * dx + dy * dy < Math.pow((d.r + r) * 0.95, 2)) { d.r = Math.sqrt(d.r * d.r + r * r * 0.9); return d; } }
    if (drops.length > (mobile ? 60 : 110)) { for (i = 0; i < drops.length; i++) if (!drops[i].run && drops[i].r < 1.4) { drops.splice(i, 1); break; } }
    var nd = mkDrop(x, y, r); drops.push(nd); return nd;
  }
  var RUN = 3.7;
  function stepDrops(dt) {
    var moving = false;
    for (var i = drops.length - 1; i >= 0; i--) {
      var d = drops[i]; d.age += dt;
      if (!d.run && d.r > RUN && !reduce) { d.run = true; d.vy = 8; }
      if (!d.run) { if (d.grow && d.age < 3 && !reduce) d.r += d.grow * dt; continue; }
      moving = true;
      if (d.stick > 0) { d.stick -= dt; continue; }
      var tv = 26 + (d.r - 2.4) * 30;                       // bigger drops slide faster
      d.vy += (tv - d.vy) * Math.min(1, dt * 3);
      if (Math.random() < dt * 1.4) d.stick = rr(0.06, 0.35); // stop-go stickiness
      var ox = d.x, oy = d.y, dy = d.vy * dt;
      d.y += dy; d.x += Math.sin(clock * 3.1 + d.ph) * 0.35 * dt * 10 * (0.5 + Math.random());
      // clear the trail
      var lw = d.r * 1.05;
      [cm, hm].forEach(function (c) { c.globalCompositeOperation = 'source-over'; c.strokeStyle = '#fff'; c.lineCap = 'round'; c.lineWidth = lw * MS; c.beginPath(); c.moveTo(ox * MS, oy * MS); c.lineTo(d.x * MS, d.y * MS); c.stroke(); });
      cleanMask = false;
      d.r -= dy * 0.006; d.bead += dy;
      if (d.bead > 9 + Math.random() * 14) { d.bead = 0; drops.push(mkDrop(ox + rr(-0.6, 0.6), oy, rr(0.5, Math.min(1.3, d.r * 0.35)))); }
      // swallow drops in the path
      for (var j = drops.length - 1; j >= 0; j--) { var e = drops[j]; if (e === d || e.run) continue; var ex = e.x - d.x, ey = e.y - d.y; if (ey > -2 && ex * ex + ey * ey < Math.pow(d.r + e.r * 0.8, 2)) { d.r = Math.sqrt(d.r * d.r + e.r * e.r); drops.splice(j, 1); if (j < i) i--; } }
      if (d.r < 2.2) { d.run = false; d.r = Math.max(d.r, 1.6); }
      if (d.y - d.r > H + 4) drops.splice(i, 1);
    }
    return moving;
  }
  function drawDrop(d) {
    var x = d.x, y = d.y, r = d.r;
    if (r < 1.25) { // tiny beads: dark rim + light core
      g.fillStyle = 'rgba(40,70,100,0.30)'; g.beginPath(); g.arc(x + r * 0.15, y + r * 0.25, r, 0, 6.283); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.75)'; g.beginPath(); g.arc(x - r * 0.25, y - r * 0.3, r * 0.45, 0, 6.283); g.fill();
      return;
    }
    var ry = r * (d.run ? 1.18 : 1), cy = y + (d.run ? r * 0.08 : 0);
    // contact shadow / rim
    g.fillStyle = 'rgba(20,45,75,0.22)'; g.beginPath(); g.ellipse(x + r * 0.08, cy + r * 0.14, r * 1.08, ry * 1.08, 0, 0, 6.283); g.fill();
    g.save(); g.beginPath(); g.ellipse(x, cy, r, ry, 0, 0, 6.283); g.clip();
    // lens: the crisp scene behind, inverted and minified
    var span = r * 4.2;
    g.translate(x, cy); g.scale(-1, -1);
    g.drawImage(bgCv, (x - span / 2) * dpr, (cy - span / 2) * dpr, span * dpr, span * dpr, -r, -ry, r * 2, ry * 2);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    var rg = g.createRadialGradient(x - r * 0.15, cy - r * 0.2, r * 0.2, x, cy, r * 1.02);
    rg.addColorStop(0, 'rgba(255,255,255,0.06)'); rg.addColorStop(0.62, 'rgba(30,60,95,0.05)'); rg.addColorStop(0.86, 'rgba(18,42,72,0.32)'); rg.addColorStop(1, 'rgba(10,28,52,0.62)');
    g.fillStyle = rg; g.fillRect(x - r * 1.2, cy - ry * 1.2, r * 2.4, ry * 2.4);
    // caustic crescent (light focused on the lower right)
    var cg = g.createRadialGradient(x + r * 0.25, cy + ry * 0.45, 0, x + r * 0.25, cy + ry * 0.45, r * 0.75);
    cg.addColorStop(0, 'rgba(255,255,255,0.42)'); cg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = cg; g.fillRect(x - r, cy - ry, r * 2, ry * 2);
    g.restore(); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // specular highlight top-left
    g.fillStyle = 'rgba(255,255,255,0.92)'; g.beginPath(); g.ellipse(x - r * 0.38, cy - ry * 0.42, r * 0.3, r * 0.17, -0.7, 0, 6.283); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.arc(x - r * 0.08, cy - ry * 0.62, r * 0.08, 0, 6.283); g.fill();
  }

  // ---------- fog mask ----------
  function brush(c, x, y, rad, a) {
    var gr = c.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, 'rgba(255,255,255,' + a + ')'); gr.addColorStop(0.55, 'rgba(255,255,255,' + a * 0.92 + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  var lp = null, streaks = null;
  function wipe(x, y) {
    if (!lp) { lp = [x, y]; }
    var dx = x - lp[0], dy = y - lp[1], L = Math.hypot(dx, dy), n = Math.max(1, Math.ceil(L / (R * 0.22)));
    var nx = L ? -dy / L : 0, ny = L ? dx / L : 1;
    cm.globalCompositeOperation = hm.globalCompositeOperation = 'source-over';
    for (var k = 1; k <= n; k++) {
      var px = lp[0] + dx * k / n, py = lp[1] + dy * k / n;
      brush(cm, px * MS, py * MS, R * MS, 0.95); brush(hm, px * MS, py * MS, R * MS * 0.92, 1);
    }
    // faint smear lines left by the hand, continuous along the stroke
    if (!streaks) streaks = [rr(-0.75, 0.75), rr(-0.75, 0.75), rr(-0.5, 0.5)];
    [cm, hm].forEach(function (c) { c.globalCompositeOperation = 'destination-out'; c.lineCap = 'round';
      for (var q = 0; q < streaks.length; q++) { var o = streaks[q] * R; c.strokeStyle = 'rgba(0,0,0,' + (0.10 + q * 0.04) + ')'; c.lineWidth = (1.2 + q) * MS * 1.6; c.beginPath(); c.moveTo((lp[0] + nx * o) * MS, (lp[1] + ny * o) * MS); c.lineTo((x + nx * o) * MS, (y + ny * o) * MS); c.stroke(); }
      c.globalCompositeOperation = 'source-over'; });
    // the wiped water: drops inside are swept, water is pushed to the wipe edges
    for (var i = drops.length - 1; i >= 0; i--) { var d = drops[i]; var ddx = d.x - x, ddy = d.y - y; if (ddx * ddx + ddy * ddy < R * R * 0.6) drops.splice(i, 1); }
    var cnt = Math.min(6, L / 11) * (mobile ? 0.7 : 1);
    for (k = 0; k < cnt; k++) {
      if (Math.random() > 0.8) continue;
      var t = Math.random(), side = Math.random() < 0.5 ? -1 : 1, off = R * (0.86 + Math.random() * 0.2);
      var qx = lp[0] + dx * t + nx * side * off, qy = lp[1] + dy * t + ny * side * off;
      if (qy < 0 || qy > H) continue;
      var wd = addWater(qx, qy, 0.8 + Math.pow(Math.random(), 1.8) * 3.0); if (Math.random() < 0.25) { wd.grow = rr(0.1, 0.55); wd.age = 0; }
    }
    if (Math.random() < L / 220) { var bx = lp[0] + dx * Math.random() + rr(-R, R) * 0.5, by = lp[1] + dy * Math.random() + rr(-R, R) * 0.5; drops.push(mkDrop(bx, by, rr(0.5, 1.1))); }
    lp = [x, y]; lastActive = clock; cleanMask = false; dirty = true; wake();
  }
  function refog(dt) {
    var kH = 1 - Math.exp(-dt / 0.75), kC = 1 - Math.exp(-dt / 0.95);
    hm.globalCompositeOperation = 'destination-out'; hm.globalAlpha = kH; hm.fillStyle = '#000'; hm.fillRect(0, 0, Hm.width, Hm.height);
    cm.globalCompositeOperation = 'destination-out'; cm.globalAlpha = Math.min(1, kC * 1.25); cm.fillStyle = noisePat; cm.fillRect(0, 0, Cm.width, Cm.height);
    hm.globalAlpha = cm.globalAlpha = 1;
    cm.globalCompositeOperation = 'source-over'; cm.drawImage(Hm, 0, 0);
    // drops keep a small clear halo of their own
    hm.globalCompositeOperation = 'source-over'; hm.fillStyle = 'rgba(255,255,255,0.5)';
    for (var i = 0; i < drops.length; i++) { var d = drops[i]; if (d.r < 1.6) continue; hm.beginPath(); hm.arc(d.x * MS, d.y * MS, d.r * 1.25 * MS, 0, 6.283); hm.fill(); }
  }

  function render() {
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, cv.width, cv.height);
    g.drawImage(fogTex, 0, 0);
    if (!cleanMask) { g.globalCompositeOperation = 'destination-out'; g.imageSmoothingEnabled = true; g.drawImage(Cm, 0, 0, cv.width, cv.height); g.globalCompositeOperation = 'source-over'; }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (var i = 0; i < drops.length; i++) drawDrop(drops[i]);
  }

  function step(now) {
    if (!running) return;
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016; last = now; clock += dt;
    var moving = stepDrops(dt);
    if (!cleanMask) {
      stepAcc += dt;
      if (stepAcc >= 0.1) { refog(stepAcc); stepAcc = 0; }
      if (clock - lastActive > 7 && !moving) { cm.clearRect(0, 0, Cm.width, Cm.height); hm.clearRect(0, 0, Hm.width, Hm.height); cleanMask = true; }
      dirty = true;
    }
    if (moving) dirty = true;
    if (!reduce && clock > nextRandom) { // a drop sets off on its own now and then
      nextRandom = clock + rr(2.5, 5.5);
      var big = drops.filter(function (d) { return !d.run && d.r > 1.8; });
      if (big.length && Math.random() < 0.6) big[(Math.random() * big.length) | 0].r = RUN + rr(0.3, 1.2);
      else drops.push(mkDrop(rr(0.04, 0.96) * W, rr(0.02, 0.4) * H, RUN + rr(0.2, 1)));
      dirty = true;
    }
    if (dirty) { render(); dirty = false; }
    raf = requestAnimationFrame(step);
  }
  function wake() { if (!running && visible && !document.hidden) { running = true; last = 0; raf = requestAnimationFrame(step); } }
  function sleep() { running = false; cancelAnimationFrame(raf); }

  function resize() {
    var r = wrap.getBoundingClientRect(); if (!r.width || !r.height) return;
    var nw = Math.round(r.width), nh = Math.round(r.height);
    if (nw === W && nh === H && fogTex.width) return;
    W = nw; H = nh; mobile = W < 760; R = mobile ? 28 : 36;
    dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
    bgCv.width = cv.width = Math.round(W * dpr); bgCv.height = cv.height = Math.round(H * dpr);
    Cm.width = Hm.width = Math.ceil(W * MS); Cm.height = Hm.height = Math.ceil(H * MS);
    seed = 7; drops = []; cleanMask = true;
    paintBg(); buildFog(); render();
  }

  function local(e) { var r = wrap.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  wrap.addEventListener('pointermove', function (e) { if (e.pointerType !== 'mouse' && !e.buttons) return; var p = local(e); wipe(p[0], p[1]); });
  wrap.addEventListener('pointerdown', function (e) { lp = null; streaks = null; var p = local(e); wipe(p[0], p[1]); });
  wrap.addEventListener('pointerleave', function () { lp = null; streaks = null; });
  wrap.addEventListener('pointerup', function (e) { if (e.pointerType !== 'mouse') lp = null; });
  wrap.addEventListener('pointercancel', function () { lp = null; });

  document.addEventListener('visibilitychange', function () { if (document.hidden) sleep(); else wake(); });
  if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) wake(); else sleep(); }).observe(wrap);
  loadTiles(function () {
    makeNoise(); resize(); wake();
    if ('ResizeObserver' in window) new ResizeObserver(function () { resize(); dirty = true; }).observe(wrap); else window.addEventListener('resize', resize);
  });
  window.__fog = { wipe: wipe, lift: function () { lp = null; streaks = null; }, drops: function () { return drops; }, stop: sleep, start: wake };
})();
