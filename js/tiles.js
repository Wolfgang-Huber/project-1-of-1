// Glossy pool-tile mosaic painted once to a canvas and used as a crisp repeating CSS background.
(function () {
  var hero = document.querySelector('.hero');
  if (!hero) return;
  var css = window.innerWidth < 760 ? 36 : 44;     // tile pitch in CSS px
  var n = 12;                                       // tiles per pattern edge (pattern = n * css)
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var px = css * dpr, size = n * px;
  var c = document.createElement('canvas'); c.width = c.height = size;
  var g = c.getContext('2d');
  if (!g) return;
  var seed = 42; function r() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
  var A = [127, 178, 236], B = [169, 205, 245];      // #7fb2ec -> #a9cdf5
  g.fillStyle = '#f4f8fd'; g.fillRect(0, 0, size, size); // white grout
  var grout = 3 * dpr, rad = 3 * dpr;
  function rr(x, y, w, h, q) { g.beginPath(); g.moveTo(x + q, y); g.arcTo(x + w, y, x + w, y + h, q); g.arcTo(x + w, y + h, x, y + h, q); g.arcTo(x, y + h, x, y, q); g.arcTo(x, y, x + w, y, q); g.closePath(); }
  for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) {
    var t = Math.pow(r(), 1.3), x = i * px + grout / 2, y = j * px + grout / 2, w = px - grout;
    var col = A.map(function (a, k) { return Math.round(a + (B[k] - a) * t + (r() - 0.5) * 8); });
    g.save(); rr(x, y, w, w, rad); g.clip();
    g.fillStyle = 'rgb(' + col.join(',') + ')'; g.fillRect(x, y, w, w);
    // glassy depth: lighter top-left, slightly deeper bottom-right
    var lg = g.createLinearGradient(x, y, x + w, y + w);
    lg.addColorStop(0, 'rgba(255,255,255,0.22)'); lg.addColorStop(0.5, 'rgba(255,255,255,0)'); lg.addColorStop(1, 'rgba(30,70,140,0.12)');
    g.fillStyle = lg; g.fillRect(x, y, w, w);
    // shimmer flecks (the frosted texture inside glass tiles)
    for (var k = 0; k < 26; k++) {
      g.fillStyle = 'rgba(255,255,255,' + (0.06 + r() * 0.16).toFixed(3) + ')';
      var fx = x + r() * w, fy = y + r() * w;
      g.beginPath(); g.ellipse(fx, fy, (0.6 + r() * 3.2) * dpr, (0.4 + r() * 1.2) * dpr, r() * Math.PI, 0, Math.PI * 2); g.fill();
    }
    // specular sheen on some tiles
    if (r() > 0.55) {
      var sg = g.createRadialGradient(x + w * 0.3, y + w * 0.25, 0, x + w * 0.3, y + w * 0.25, w * 0.6);
      sg.addColorStop(0, 'rgba(255,255,255,0.18)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = sg; g.fillRect(x, y, w, w);
    }
    // bevel
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = dpr; rr(x + 0.5 * dpr, y + 0.5 * dpr, w - dpr, w - dpr, rad); g.stroke();
    g.restore();
  }
  try {
    hero.style.setProperty('--tiles-img', 'url(' + c.toDataURL('image/png') + ')');
    hero.style.setProperty('--tiles-size', (n * css) + 'px');
    hero.classList.add('has-tiles');
    document.documentElement.style.setProperty('--tiles-img', 'url(' + c.toDataURL('image/png') + ')'); document.documentElement.style.setProperty('--tiles-size', (n * css) + 'px');
  } catch (e) { /* CSS fallback grid remains */ }
})();
