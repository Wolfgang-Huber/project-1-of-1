/* Koi pond — WebGL water (refraction, caustics, propagating ripples, specular) over a 2D koi layer.
   No libraries. Falls back to js/koi-lite.js when WebGL is unavailable. */
(function () {
  var wrap = document.querySelector('.koi-pond');
  if (!wrap) return;
  var glc = wrap.querySelector('.koi-canvas');
  var gl = null;
  try { gl = glc.getContext('webgl', { premultipliedAlpha: true, antialias: false, alpha: false }); } catch (e) { gl = null; }
  if (!gl) { var s = document.createElement('script'); s.src = 'js/koi-lite.js?v=69'; document.body.appendChild(s); return; }

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var mobile = window.matchMedia('(max-width: 760px)').matches || ('ontouchstart' in window && Math.min(screen.width, screen.height) < 820);
  var SPEED = reduce ? 0.35 : 1;
  var MAXR = mobile ? 14 : 24;
  var W = 0, H = 0, dpr = 1, running = false, raf = 0, last = 0, T = 0, clock = 0;

  // ---------- layers ----------
  var fishCv = document.createElement('canvas'), fx = fishCv.getContext('2d');
  var shCv = document.createElement('canvas'), sx = shCv.getContext('2d');
  var top = document.createElement('canvas'); top.className = 'koi-top'; wrap.appendChild(top);
  var tx = top.getContext('2d');
  var FS = 1, SHS = 0.25; // fish layer scale, shadow layer scale (low-res = natural blur)

  // ---------- GL ----------
  var VS = 'attribute vec2 p;varying vec2 vUv;void main(){vUv=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}';
  var FSH = [
    'precision highp float;',
    'varying vec2 vUv;uniform sampler2D uFish,uShadow;uniform vec2 uRes;uniform float uT;uniform vec4 uRip[' + MAXR + '];',
    'float h1(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
    'vec2 h2(vec2 p){return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453);}',
    'float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h1(i),h1(i+vec2(1,0)),f.x),mix(h1(i+vec2(0,1)),h1(i+vec2(1,1)),f.x),f.y);}',
    'float height(vec2 p){',
    '  float h=.55*sin(p.x*.031+uT*.9+1.7*sin(p.y*.045+uT*.55))+.35*sin(p.y*.07-uT*1.3+p.x*.012)+.25*(vn(p*.03+uT*.25)-.5)*2.;',
    '  for(int i=0;i<' + MAXR + ';i++){vec4 r=uRip[i];if(r.w<=0.)continue;float a=uT-r.z;if(a<0.||a>5.)continue;',
    '    float d=length(p-r.xy);float x=d-a*95.;float w=180.+a*520.;',
    '    h+=r.w*exp(-x*x/w)*cos(x*.14)*exp(-a*1.1)*(.85/(1.+d*.012));}',
    '  return h;}',
    'vec3 vor(vec2 x){vec2 n=floor(x),f=fract(x);float m1=8.,m2=8.;vec2 id=vec2(0.);vec2 mr=vec2(0.);',
    '  for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){vec2 g=vec2(float(i),float(j));vec2 o=.15+.7*h2(n+g);vec2 r=g+o-f;float d=dot(r,r);',
    '    if(d<m1){m2=m1;m1=d;id=n+g;mr=r;}else if(d<m2)m2=d;}',
    '  return vec3(sqrt(m1),sqrt(m2)-sqrt(m1),h1(id));}',
    'float caustic(vec2 uv,float t){vec2 p=mod(uv*6.28318,6.28318)-250.;vec2 i=p;float c=1.;float k=.005;',
    '  for(int n=0;n<4;n++){float tt=t*(1.-(3.5/float(n+1)));i=p+vec2(cos(tt-i.x)+sin(tt+i.y),sin(tt-i.y)+cos(tt+i.x));',
    '    c+=1./length(vec2(p.x/(sin(i.x+tt)/k),p.y/(cos(i.y+tt)/k)));}',
    '  c/=4.;c=1.17-pow(c,1.4);return pow(abs(c),8.);}',
    'vec3 floorCol(vec2 p){',
    '  vec3 v=vor(p/58.);vec3 v2=vor(p/19.+7.3);',
    '  vec3 a=vec3(.17,.22,.19),b=vec3(.28,.30,.25),c=vec3(.20,.24,.27),d=vec3(.33,.31,.26);',
    '  vec3 s=mix(mix(a,b,step(.33,v.z)),mix(c,d,step(.8,v.z)),step(.6,v.z));',
    '  float dome=1.-smoothstep(0.,.75,v.x);s*=.78+.32*dome;',
    '  s=mix(s,vec3(.22,.24,.2)*(.7+.5*(1.-smoothstep(0.,.8,v2.x))),.35);',
    '  float crev=smoothstep(.0,.16,v.y);s*=.62+.38*crev;',
    '  float moss=smoothstep(.45,.85,vn(p*.018)+.25*vn(p*.09));s=mix(s,vec3(.16,.26,.12)*(.8+.4*vn(p*.2)),moss*.7);',
    '  return s;}',
    'void main(){',
    '  vec2 p=vUv*uRes;float e=1.6;',
    '  float hx=height(p+vec2(e,0.))-height(p-vec2(e,0.));float hy=height(p+vec2(0.,e))-height(p-vec2(0.,e));',
    '  vec3 n=normalize(vec3(-hx*.55,-hy*.55,1.));',
    '  vec2 rf=n.xy*22.;',
    '  vec2 fp=p+rf;vec3 col=floorCol(fp);',
    '  float ca=caustic(fp/260.+vec2(uT*.006,uT*.004),uT*.55);float ca2=caustic(fp/180.-vec2(uT*.004,0.),uT*.4+3.);',
    '  col+=vec3(1.,.97,.85)*(ca*.55+ca2*.3)*.55;',
    '  float sh=texture2D(uShadow,(p+rf*.8)/uRes).a;col*=1.-sh*.55;',
    '  vec3 deep=vec3(.03,.24,.28);col=mix(col,deep,.36+.22*(1.-smoothstep(.15,.85,vn(p*.004+3.))));',
    '  vec2 fuv=(p+n.xy*9.)/uRes;vec4 f=texture2D(uFish,fuv);',
    '  vec3 fc=f.rgb;fc+=vec3(1.,.98,.9)*ca*.12*f.a;col=col*(1.-f.a)+fc;',
    '  col=mix(col,vec3(.05,.33,.38),.18);',
    '  float edge=smoothstep(0.,.32,vUv.y)*smoothstep(1.,.68,vUv.y);col*=.62+.38*edge;',
    '  vec3 L=normalize(vec3(-.35,-.55,1.));float spec=pow(max(dot(n,L),0.),260.);',
    '  vec3 sky=mix(vec3(.75,.9,1.),vec3(.45,.72,.92),vUv.y);',
    '  float fres=clamp(1.-n.z,0.,1.);col=mix(col,sky,clamp(fres*7.,0.,.35)+.05);',
    '  col+=vec3(1.)*spec*.9;',
    '  col+=vec3(.9,1.,1.)*smoothstep(.0,.9,-hy*.35)*.08;',
    '  gl_FragColor=vec4(col,1.);}'
  ].join('\n');
  function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
  var prog;
  try {
    prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FSH)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (err) { var s2 = document.createElement('script'); s2.src = 'js/koi-lite.js?v=69'; document.body.appendChild(s2); top.remove(); return; }
  gl.useProgram(prog);
  var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  var U = { res: gl.getUniformLocation(prog, 'uRes'), t: gl.getUniformLocation(prog, 'uT'), rip: gl.getUniformLocation(prog, 'uRip'), fish: gl.getUniformLocation(prog, 'uFish'), sh: gl.getUniformLocation(prog, 'uShadow') };
  function tex(unit) { var t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; }
  var fishTex = tex(0), shTex = tex(1);
  gl.uniform1i(U.fish, 0); gl.uniform1i(U.sh, 1);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  var ripData = new Float32Array(MAXR * 4), ripIdx = 0, ripples = [];
  function addRipple(x, y, amp) { ripples[ripIdx] = { x: x, y: y, t: clock, a: amp }; ripIdx = (ripIdx + 1) % MAXR; }
  function heightAt(x, y) { // CPU copy (ripples only) for pads/petals
    var h = 0;
    for (var i = 0; i < ripples.length; i++) { var r = ripples[i]; if (!r) continue; var a = clock - r.t; if (a < 0 || a > 5) continue;
      var d = Math.hypot(x - r.x, y - r.y), q = d - a * 95; h += r.a * Math.exp(-q * q / (180 + a * 520)) * Math.cos(q * 0.14) * Math.exp(-a * 1.1) * (0.85 / (1 + d * 0.012)); }
    return h;
  }

  // ---------- koi ----------
  function rnd(a, b) { return a + Math.random() * (b - a); }
  var VARIETIES = [
    { name: 'kohaku', base: '#f7f2ea', belly: '#fffaf3', patches: [['#d7301e', 3]], dots: null },
    { name: 'sanke', base: '#f6f0e6', belly: '#fffaf2', patches: [['#d33a22', 3]], dots: '#141316' },
    { name: 'showa', base: '#18171b', belly: '#2a2830', patches: [['#d23a24', 3], ['#f2ece2', 2]], dots: null },
    { name: 'ogon', base: '#e7b245', belly: '#f6d68a', patches: [], dots: null, metal: true },
    { name: 'asagi', base: '#6e8ea5', belly: '#ec7a3a', patches: [], dots: null, net: true },
    { name: 'kohaku2', base: '#f8f3ec', belly: '#fffbf5', patches: [['#e2502a', 2]], dots: null },
    { name: 'orange', base: '#ec7a2c', belly: '#f6a35a', patches: [['#fbe6c8', 1]], dots: null, metal: true }
  ];
  var NSEG = 16, NTAIL = 6;
  function Koi(i) {
    this.v = VARIETIES[i % VARIETIES.length];
    this.L = rnd(96, 128) * (mobile ? 0.66 : 1);
    this.z = rnd(0, 1); this.zt = this.z;
    this.x = rnd(W * 0.15, W * 0.85); this.y = rnd(H * 0.3, H * 0.7);
    this.a = rnd(0, 6.28); this.sp = rnd(0.5, 0.8); this.cur = this.sp; this.ph = rnd(0, 6); this.wander = rnd(0, 6);
    this.pts = []; var seg = this.L / NSEG;
    for (var k = 0; k <= NSEG + NTAIL; k++) this.pts.push([this.x - Math.cos(this.a) * seg * k, this.y - Math.sin(this.a) * seg * k]);
    this.patch = [];
    for (var pi = 0; pi < this.v.patches.length; pi++) for (var c = 0; c < this.v.patches[pi][1]; c++)
      this.patch.push({ s: rnd(0.08, 0.72), o: rnd(-0.5, 0.5), r: rnd(0.16, 0.28), col: this.v.patches[pi][0] });
    this.dots = []; if (this.v.dots) for (var dd = 0; dd < 5; dd++) this.dots.push({ s: rnd(0.15, 0.8), o: rnd(-0.6, 0.6), r: rnd(0.03, 0.06) });
  }
  var koi = [], food = [], bubbles = [], pads = [], petals = [];
  var mouse = { x: -1e4, y: -1e4, on: false, still: 0, vx: 0, vy: 0, lx: 0, ly: 0 };

  Koi.prototype.update = function (dt) {
    var tgt = this.a, urg = 0.018, spd = this.sp, i;
    this.wander += rnd(-0.08, 0.08) * dt; tgt += Math.sin(this.wander) * 0.6;
    // walls (soft)
    var mx = 70, my = Math.max(44, H * 0.24);
    if (this.x < mx || this.x > W - mx || this.y < my || this.y > H - my) { tgt = Math.atan2(H / 2 - this.y + rnd(-30, 30), W / 2 - this.x); urg = 0.05; }
    // boids: separation + mild alignment/cohesion
    var sxv = 0, syv = 0, ax = 0, ay = 0, cxv = 0, cyv = 0, nb = 0;
    for (i = 0; i < koi.length; i++) { var o = koi[i]; if (o === this) continue; var dx = o.x - this.x, dy = o.y - this.y, d = Math.hypot(dx, dy);
      if (d < 150) { nb++; ax += Math.cos(o.a); ay += Math.sin(o.a); cxv += dx; cyv += dy; if (d < 60 && Math.abs(o.z - this.z) < 0.5) { sxv -= dx / (d + 1); syv -= dy / (d + 1); } } }
    var vx = Math.cos(tgt), vy = Math.sin(tgt);
    if (nb) { vx += ax / nb * 0.25 + cxv / nb * 0.002 + sxv * 1.6; vy += ay / nb * 0.25 + cyv / nb * 0.002 + syv * 1.6; }
    tgt = Math.atan2(vy, vx);
    // food
    var best = null, bd = 300;
    for (i = 0; i < food.length; i++) { var f = food[i]; var fd = Math.hypot(f.x - this.x, f.y - this.y); if (fd < bd) { bd = fd; best = f; } }
    if (best) { tgt = Math.atan2(best.y - this.y, best.x - this.x); urg = 0.075; spd = 1.9; this.zt = 0;
      if (bd < this.L * 0.12 + 4) { best.eaten = true; addRipple(best.x, best.y, 0.9); } }
    // cursor: shy when it moves fast nearby, curious when it rests
    if (mouse.on) { var md = Math.hypot(mouse.x - this.x, mouse.y - this.y), ms = Math.hypot(mouse.vx, mouse.vy);
      if (md < 140 && ms > 1.2) { tgt = Math.atan2(this.y - mouse.y, this.x - mouse.x); urg = 0.11; spd = 2.6; this.zt = 1; }
      else if (mouse.still > 70 && md < 280 && md > 70 && !best) { tgt = Math.atan2(mouse.y - this.y, mouse.x - this.x); urg = 0.03; spd = 0.55; } }
    if (Math.random() < 0.004 * dt) this.zt = Math.random();
    this.z += (this.zt - this.z) * 0.01 * dt;
    var da = Math.atan2(Math.sin(tgt - this.a), Math.cos(tgt - this.a));
    this.a += da * urg * dt;
    this.cur += (spd - this.cur) * 0.04 * dt;
    var s = this.cur * SPEED * dt;
    this.ph += (0.09 + this.cur * 0.07) * SPEED * dt;
    var head = this.a + Math.sin(this.ph) * (0.16 + this.cur * 0.05);
    this.x += Math.cos(head) * s; this.y += Math.sin(head) * s;
    // chain-of-segments follow
    var P = this.pts, seg = this.L / NSEG; P[0][0] = this.x; P[0][1] = this.y;
    for (var k = 1; k < P.length; k++) { var ddx = P[k][0] - P[k - 1][0], ddy = P[k][1] - P[k - 1][1], dl = Math.hypot(ddx, ddy) || 1, sl = k > NSEG ? seg * 0.9 : seg;
      P[k][0] = P[k - 1][0] + ddx / dl * sl; P[k][1] = P[k - 1][1] + ddy / dl * sl; }
  };
  function prof(s) { return s < 0.22 ? 0.58 + 0.42 * Math.sin(s / 0.22 * Math.PI / 2) : 0.08 + 0.92 * Math.pow(Math.cos((s - 0.22) / 0.78 * Math.PI / 2), 1.25); }
  function frame(P, k) { var a = P[Math.max(0, k - 1)], b = P[Math.min(P.length - 1, k + 1)], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1; return [-dy / d, dx / d, dx / d, dy / d]; } // normal, tangent(backwards)
  Koi.prototype.body = function (c, sc, ox, oy) {
    var P = this.pts, Wd = this.L * 0.15 * sc, k;
    c.beginPath();
    for (k = 0; k <= NSEG; k++) { var n = frame(P, k), w = Wd * prof(k / NSEG); var X = ox + P[k][0] * 1, Y = oy + P[k][1]; k ? c.lineTo(X + n[0] * w, Y + n[1] * w) : c.moveTo(X + n[0] * w, Y + n[1] * w); }
    for (k = NSEG; k >= 0; k--) { var n2 = frame(P, k), w2 = Wd * prof(k / NSEG); c.lineTo(ox + P[k][0] - n2[0] * w2, oy + P[k][1] - n2[1] * w2); }
    c.closePath();
    var h = frame(P, 0); c.moveTo(ox + P[0][0] + Wd * 0.58, oy + P[0][1]); c.ellipse(ox + P[0][0] - h[2] * Wd * 0.05, oy + P[0][1] - h[3] * Wd * 0.05, Wd * 0.6, Wd * 0.6, 0, 0, 6.2832);
  };
  Koi.prototype.fins = function (c, sc, col, alpha) {
    var P = this.pts, Wd = this.L * 0.15 * sc, k;
    c.globalAlpha = alpha;
    // pectoral fins
    for (var sd = -1; sd <= 1; sd += 2) {
      var n = frame(P, 3), flap = 0.55 + Math.sin(this.ph * 1.1 + sd * 0.8) * 0.28 + this.cur * 0.08;
      var bx = P[3][0] + n[0] * Wd * 0.75 * sd, by = P[3][1] + n[1] * Wd * 0.75 * sd;
      var ang = Math.atan2(n[3], n[2]) + sd * flap;
      c.save(); c.translate(bx, by); c.rotate(ang);
      var g = c.createLinearGradient(0, 0, Wd * 1.6, 0); g.addColorStop(0, col); g.addColorStop(1, 'rgba(255,255,255,0.15)');
      c.fillStyle = g; c.beginPath(); c.moveTo(0, -Wd * 0.18 * sd);
      c.bezierCurveTo(Wd * 0.6, -Wd * 1.0 * sd, Wd * 1.7, -Wd * 0.9 * sd, Wd * 1.75, -Wd * 0.2 * sd);
      c.bezierCurveTo(Wd * 1.4, Wd * 0.1 * sd, Wd * 0.5, Wd * 0.15 * sd, 0, Wd * 0.2 * sd); c.fill(); c.restore();
    }
    // flowing tail (two lobes along tail chain)
    var last = P.length - 1, root = NSEG - 1, L1 = [], L2 = [];
    for (k = root; k <= last; k++) { var nn = frame(P, k), t = (k - root) / (last - root), fl = Wd * (0.25 + 1.25 * Math.sin(t * Math.PI * 0.62)) ;
      L1.push([P[k][0] + nn[0] * fl, P[k][1] + nn[1] * fl]); L2.push([P[k][0] - nn[0] * fl, P[k][1] - nn[1] * fl]); }
    var tip = P[last], tn = frame(P, last), tback = [tip[0] + tn[2] * Wd * 0.5, tip[1] + tn[3] * Wd * 0.5];
    var g2 = c.createRadialGradient(P[root][0], P[root][1], 1, P[root][0], P[root][1], this.L * 0.45);
    g2.addColorStop(0, col); g2.addColorStop(1, 'rgba(255,255,255,0.05)');
    c.fillStyle = g2; c.beginPath(); c.moveTo(L1[0][0], L1[0][1]);
    for (k = 1; k < L1.length; k++) c.lineTo(L1[k][0], L1[k][1]);
    c.quadraticCurveTo(tback[0], tback[1], L2[L2.length - 1][0], L2[L2.length - 1][1]);
    for (k = L2.length - 2; k >= 0; k--) c.lineTo(L2[k][0], L2[k][1]);
    c.closePath(); c.fill();
    // fin rays
    c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 0.6;
    for (k = 1; k < L1.length; k += 1) { c.beginPath(); c.moveTo(P[root][0], P[root][1]); c.lineTo(L1[k][0], L1[k][1]); c.moveTo(P[root][0], P[root][1]); c.lineTo(L2[k][0], L2[k][1]); c.stroke(); }
    // dorsal fin hint
    c.strokeStyle = col; c.lineWidth = Wd * 0.18; c.lineCap = 'round'; c.globalAlpha = alpha * 0.7;
    c.beginPath(); for (k = 4; k <= 10; k++) { k === 4 ? c.moveTo(P[k][0], P[k][1]) : c.lineTo(P[k][0], P[k][1]); } c.stroke();
    c.globalAlpha = 1;
  };
  Koi.prototype.draw = function (c) {
    var v = this.v, P = this.pts, sc = 1 - this.z * 0.22, Wd = this.L * 0.15 * sc, k;
    var finCol = v.name === 'showa' ? 'rgba(40,38,44,.55)' : v.name === 'asagi' ? 'rgba(236,130,70,.55)' : v.name === 'ogon' || v.name === 'orange' ? 'rgba(246,190,90,.55)' : 'rgba(255,250,244,.55)';
    this.fins(c, sc, finCol, 0.85 - this.z * 0.3);
    this.body(c, sc, 0, 0);
    c.fillStyle = v.base; c.fill();
    c.save(); c.clip();
    // belly / side colouring (asagi)
    if (v.net) { c.strokeStyle = v.belly; c.lineWidth = Wd * 0.9; c.globalAlpha = 0.9; this.outline(c, sc); c.stroke(); c.globalAlpha = 1; }
    // patches (soft radial)
    for (var i = 0; i < this.patch.length; i++) { var pt = this.patch[i], kk = Math.round(pt.s * NSEG), n = frame(P, kk);
      var X = P[kk][0] + n[0] * pt.o * Wd, Y = P[kk][1] + n[1] * pt.o * Wd, R = this.L * pt.r * sc;
      var g = c.createRadialGradient(X, Y, R * 0.55, X, Y, R); g.addColorStop(0, pt.col); g.addColorStop(1, pt.col + '00');
      c.fillStyle = g; c.beginPath(); c.arc(X, Y, R, 0, 6.2832); c.fill(); }
    for (i = 0; i < this.dots.length; i++) { var dt2 = this.dots[i], k2 = Math.round(dt2.s * NSEG), n2 = frame(P, k2);
      c.fillStyle = v.dots; c.beginPath(); c.arc(P[k2][0] + n2[0] * dt2.o * Wd, P[k2][1] + n2[1] * dt2.o * Wd, this.L * dt2.r * sc, 0, 6.2832); c.fill(); }
    // scales: fine net (asagi strong, others faint shimmer)
    c.strokeStyle = v.net ? 'rgba(20,40,60,.35)' : 'rgba(255,255,255,.10)'; c.lineWidth = 0.7;
    for (k = 3; k < NSEG - 2; k++) { var nk = frame(P, k), wk = Wd * prof(k / NSEG);
      for (var r = -2; r <= 2; r++) { var cx = P[k][0] + nk[0] * wk * r * 0.38, cy = P[k][1] + nk[1] * wk * r * 0.38, ang = Math.atan2(nk[3], nk[2]);
        c.beginPath(); c.arc(cx, cy, Wd * 0.17, ang - 1.2, ang + 1.2); c.stroke(); } }
    // metallic / iridescent sheen band that slides with the swim phase
    var hh = frame(P, 6), sh = 0.5 + 0.5 * Math.sin(this.ph * 0.5);
    var gx = c.createLinearGradient(P[6][0] - hh[0] * Wd, P[6][1] - hh[1] * Wd, P[6][0] + hh[0] * Wd, P[6][1] + hh[1] * Wd);
    gx.addColorStop(0, 'rgba(0,0,0,.28)'); gx.addColorStop(0.3 + sh * 0.1, 'rgba(255,255,255,0)');
    gx.addColorStop(0.5, v.metal ? 'rgba(255,250,220,.45)' : 'rgba(255,255,255,.18)'); gx.addColorStop(0.62, 'rgba(180,230,255,' + (v.metal ? .12 : .06) + ')');
    gx.addColorStop(0.75, 'rgba(255,255,255,0)'); gx.addColorStop(1, 'rgba(0,0,0,.28)');
    c.fillStyle = gx; c.fillRect(-1e4, -1e4, 2e4, 2e4);
    // soft inner rim
    c.strokeStyle = 'rgba(0,0,0,.18)'; c.lineWidth = Wd * 0.35; this.body(c, sc, 0, 0); c.stroke();
    c.restore();
    // head details: eyes, barbels
    var h = frame(P, 0), hx = P[0][0] - h[2] * Wd * 0.25, hy = P[0][1] - h[3] * Wd * 0.25;
    c.fillStyle = '#0d0c0e';
    for (var s = -1; s <= 1; s += 2) { c.beginPath(); c.arc(hx + h[0] * Wd * 0.42 * s, hy + h[1] * Wd * 0.42 * s, Math.max(1.2, Wd * 0.11), 0, 6.2832); c.fill(); }
    c.strokeStyle = v.name === 'showa' ? 'rgba(60,55,60,.8)' : 'rgba(240,215,190,.8)'; c.lineWidth = 0.9;
    var mx2 = P[0][0] - h[2] * Wd * 0.62, my2 = P[0][1] - h[3] * Wd * 0.62;
    for (s = -1; s <= 1; s += 2) { c.beginPath(); c.moveTo(mx2 + h[0] * Wd * 0.2 * s, my2 + h[1] * Wd * 0.2 * s);
      c.quadraticCurveTo(mx2 - h[2] * Wd * 0.25 + h[0] * Wd * 0.5 * s, my2 - h[3] * Wd * 0.25 + h[1] * Wd * 0.5 * s, mx2 - h[2] * Wd * 0.05 + h[0] * Wd * 0.62 * s + Math.sin(this.ph) * 0.8, my2 - h[3] * Wd * 0.05 + h[1] * Wd * 0.62 * s); c.stroke(); }
  };
  Koi.prototype.outline = function (c, sc) { var P = this.pts, Wd = this.L * 0.15 * sc, k; c.beginPath();
    for (k = 0; k <= NSEG; k++) { var n = frame(P, k), w = Wd * prof(k / NSEG); k ? c.lineTo(P[k][0] + n[0] * w, P[k][1] + n[1] * w) : c.moveTo(P[k][0] + n[0] * w, P[k][1] + n[1] * w); }
    for (k = NSEG; k >= 0; k--) { var n2 = frame(P, k), w2 = Wd * prof(k / NSEG); c.lineTo(P[k][0] - n2[0] * w2, P[k][1] - n2[1] * w2); } c.closePath(); };

  // ---------- surface things ----------
  function makeScene() {
    var n = mobile ? 4 : (W < 1100 ? 6 : 7);
    koi = []; for (var i = 0; i < n; i++) koi.push(new Koi(i));
    pads = []; var np = Math.max(2, Math.round(W / 380));
    for (i = 0; i < np; i++) { var cluster = 1 + (Math.random() < 0.6 ? 1 : 0) + (Math.random() < 0.3 ? 1 : 0), bx = (i + 0.5) * W / np + rnd(-70, 70), by = rnd(H * 0.18, H * 0.82);
      for (var c = 0; c < cluster; c++) pads.push({ x: bx + rnd(-34, 34) * c, y: by + rnd(-26, 26) * c, r: rnd(20, 34) * (mobile ? 0.8 : 1) * (c ? 0.75 : 1), a: rnd(0, 6.28), ph: rnd(0, 6), vx: 0, vy: 0, flower: c === 0 && Math.random() < 0.55, hx: 0 }); }
    petals = []; for (i = 0; i < (mobile ? 3 : 6); i++) petals.push({ x: rnd(0, W), y: rnd(H * 0.15, H * 0.85), a: rnd(0, 6.28), s: rnd(0.08, 0.2), r: rnd(0.002, 0.006), leaf: Math.random() < 0.35 });
  }
  function drawPad(c, p, t) {
    var r = p.r, hb = heightAt(p.x, p.y);
    c.save(); c.translate(p.x, p.y + hb * 0.6); c.rotate(p.a + Math.sin(t * 0.006 + p.ph) * 0.06 + hb * 0.02);
    c.scale(1 + hb * 0.02, 1 - hb * 0.02);
    c.fillStyle = 'rgba(2,30,36,.28)'; c.beginPath(); c.arc(5, 7, r, 0.32, 6.25); c.lineTo(5, 7); c.fill();
    var g = c.createRadialGradient(-r * 0.35, -r * 0.4, 1, 0, 0, r * 1.05); g.addColorStop(0, '#9bd56f'); g.addColorStop(0.55, '#5ea84a'); g.addColorStop(1, '#3a7a35');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0.32, 6.25); c.lineTo(0, 0); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(220,255,190,.28)'; c.lineWidth = 1; c.beginPath(); c.arc(0, 0, r - 1, 0.35, 6.2); c.stroke();
    c.strokeStyle = 'rgba(30,70,30,.35)'; c.lineWidth = 0.8;
    for (var k = 0; k < 9; k++) { var an = 0.55 + k * 0.64; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(Math.cos(an + 0.15) * r * 0.5, Math.sin(an + 0.15) * r * 0.5, Math.cos(an) * r * 0.92, Math.sin(an) * r * 0.92); c.stroke(); }
    c.fillStyle = 'rgba(255,255,255,.2)'; c.beginPath(); c.ellipse(-r * 0.35, -r * 0.4, r * 0.25, r * 0.12, -0.6, 0, 6.28); c.fill();
    if (p.flower) {
      c.translate(-r * 0.15, -r * 0.1); var pr = r * 0.42;
      for (var layer = 0; layer < 2; layer++) for (var f = 0; f < 8; f++) { var fa = f * 0.785 + layer * 0.39;
        var gg = c.createLinearGradient(0, 0, Math.cos(fa) * pr, Math.sin(fa) * pr); gg.addColorStop(0, layer ? '#fff4f8' : '#f7c2d6'); gg.addColorStop(1, layer ? '#ffd3e4' : '#ee8fb3');
        c.fillStyle = gg; c.beginPath(); c.ellipse(Math.cos(fa) * pr * (layer ? 0.38 : 0.5), Math.sin(fa) * pr * (layer ? 0.38 : 0.5), pr * (layer ? 0.42 : 0.55), pr * 0.22, fa, 0, 6.28); c.fill(); }
      c.fillStyle = '#ffd34d'; c.beginPath(); c.arc(0, 0, pr * 0.2, 0, 6.28); c.fill();
    }
    c.restore();
  }

  // ---------- sizing ----------
  function resize() {
    var r = wrap.getBoundingClientRect(), nw = Math.round(r.width), nh = Math.round(r.height);
    dpr = Math.min(mobile ? 1.5 : 2, window.devicePixelRatio || 1);
    if (nw === W && nh === H) return;
    var first = !W; W = nw; H = nh;
    glc.width = Math.round(W * dpr); glc.height = Math.round(H * dpr); gl.viewport(0, 0, glc.width, glc.height);
    FS = mobile ? 1 : Math.min(1.5, dpr);
    fishCv.width = Math.round(W * FS); fishCv.height = Math.round(H * FS);
    shCv.width = Math.round(W * SHS); shCv.height = Math.round(H * SHS);
    top.width = Math.round(W * dpr); top.height = Math.round(H * dpr);
    if (first || koi.length === 0) makeScene(); else makeScene();
    render();
  }

  // ---------- frame ----------
  function render() {
    // shadows (low-res => soft)
    sx.setTransform(1, 0, 0, 1, 0, 0); sx.clearRect(0, 0, shCv.width, shCv.height);
    sx.setTransform(SHS, 0, 0, SHS, 0, 0); sx.fillStyle = '#000';
    for (var i = 0; i < koi.length; i++) { var k = koi[i], off = 10 + (1 - k.z) * 14; sx.save(); sx.translate(off * 0.6, off); sx.globalAlpha = 0.55 + (1 - k.z) * 0.2; k.body(sx, 1 - k.z * 0.22, 0, 0); sx.fill(); sx.restore(); }
    for (i = 0; i < pads.length; i++) { var p = pads[i]; sx.globalAlpha = 0.5; sx.beginPath(); sx.arc(p.x + 16, p.y + 22, p.r, 0, 6.28); sx.fill(); }
    sx.globalAlpha = 1;
    // fish layer
    fx.setTransform(1, 0, 0, 1, 0, 0); fx.clearRect(0, 0, fishCv.width, fishCv.height); fx.setTransform(FS, 0, 0, FS, 0, 0);
    var order = koi.slice().sort(function (a, b) { return b.z - a.z; });
    for (i = 0; i < order.length; i++) { var kk = order[i];
      fx.save(); if (kk.z > 0.55 && !mobile) fx.filter = 'blur(' + ((kk.z - 0.55) * 4).toFixed(1) + 'px)';
      kk.draw(fx); fx.restore();
      if (kk.z > 0.05) { fx.save(); fx.globalCompositeOperation = 'source-atop'; fx.globalAlpha = kk.z * 0.55; fx.fillStyle = '#0b3a44'; kk.body(fx, 1 - kk.z * 0.22, 0, 0); fx.fill(); fx.restore(); }
    }
    for (i = 0; i < food.length; i++) { var f = food[i], sz = 2.6 - f.depth * 1.2; fx.fillStyle = 'rgba(150,90,40,' + (0.95 - f.depth * 0.5) + ')'; fx.beginPath(); fx.arc(f.x, f.y, sz, 0, 6.28); fx.fill(); fx.fillStyle = 'rgba(255,220,170,.5)'; fx.beginPath(); fx.arc(f.x - 0.7, f.y - 0.7, sz * 0.4, 0, 6.28); fx.fill(); }
    for (i = 0; i < bubbles.length; i++) { var b = bubbles[i]; fx.strokeStyle = 'rgba(220,250,255,.55)'; fx.lineWidth = 0.8; fx.beginPath(); fx.arc(b.x, b.y, b.r, 0, 6.28); fx.stroke(); fx.fillStyle = 'rgba(255,255,255,.6)'; fx.beginPath(); fx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.3, 0, 6.28); fx.fill(); }
    // upload + draw water
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, fishTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, fishCv);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, shTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, shCv);
    for (i = 0; i < MAXR; i++) { var r = ripples[i]; ripData[i * 4] = r ? r.x : 0; ripData[i * 4 + 1] = r ? r.y : 0; ripData[i * 4 + 2] = r ? r.t : 0; ripData[i * 4 + 3] = r ? r.a : 0; }
    gl.uniform4fv(U.rip, ripData); gl.uniform2f(U.res, W, H); gl.uniform1f(U.t, clock);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    // surface layer
    tx.setTransform(1, 0, 0, 1, 0, 0); tx.clearRect(0, 0, top.width, top.height); tx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (i = 0; i < petals.length; i++) { var pe = petals[i], hb = heightAt(pe.x, pe.y);
      tx.save(); tx.translate(pe.x, pe.y + hb * 0.5); tx.rotate(pe.a);
      tx.fillStyle = 'rgba(2,30,36,.25)'; tx.beginPath(); tx.ellipse(3, 4, pe.leaf ? 9 : 6, pe.leaf ? 4 : 3.4, 0, 0, 6.28); tx.fill();
      tx.fillStyle = pe.leaf ? '#c98a3a' : '#f6c3d5'; tx.beginPath(); tx.ellipse(0, 0, pe.leaf ? 9 : 6, pe.leaf ? 4 : 3.4, 0, 0, 6.28); tx.fill();
      if (pe.leaf) { tx.strokeStyle = 'rgba(120,70,20,.6)'; tx.lineWidth = 0.7; tx.beginPath(); tx.moveTo(-8, 0); tx.lineTo(8, 0); tx.stroke(); }
      tx.restore(); }
    for (i = 0; i < pads.length; i++) drawPad(tx, pads[i], T);
  }

  function step(now) {
    if (!running) return;
    var dt = Math.min(2.5, (now - (last || now)) / 16.67); last = now; T += dt; clock += dt / 60 * (reduce ? 0.5 : 1);
    var i;
    mouse.still += dt; mouse.vx *= 0.85; mouse.vy *= 0.85;
    for (i = 0; i < koi.length; i++) koi[i].update(dt);
    for (i = food.length - 1; i >= 0; i--) { var f = food[i]; f.depth = Math.min(1, f.depth + 0.0025 * dt); f.x += Math.sin(clock * 2 + f.s) * 0.04; if (f.eaten || f.depth >= 1) food.splice(i, 1); }
    if (!reduce && Math.random() < 0.01 * dt && bubbles.length < 6) { var src = koi[(Math.random() * koi.length) | 0]; if (src) bubbles.push({ x: src.x, y: src.y, r: rnd(1.5, 3), life: 1 }); }
    for (i = bubbles.length - 1; i >= 0; i--) { var b = bubbles[i]; b.life -= 0.01 * dt; b.x += Math.sin(clock * 6 + i) * 0.15; b.r += 0.01 * dt; if (b.life <= 0) { addRipple(b.x, b.y, 0.35); bubbles.splice(i, 1); } }
    for (i = 0; i < pads.length; i++) { var p = pads[i]; p.x += Math.sin(clock * 0.2 + p.ph) * 0.03 * SPEED + p.vx; p.y += p.vy; p.vx *= 0.97; p.vy *= 0.97;
      for (var j = 0; j < ripples.length; j++) { var r = ripples[j]; if (!r) continue; var a = clock - r.t; if (a > 0 && a < 1.5) { var dx = p.x - r.x, dy = p.y - r.y, d = Math.hypot(dx, dy) || 1; if (Math.abs(d - a * 95) < 20) { p.vx += dx / d * 0.02 * r.a; p.vy += dy / d * 0.02 * r.a; } } }
      p.x = Math.max(p.r, Math.min(W - p.r, p.x)); p.y = Math.max(H * 0.15, Math.min(H * 0.85, p.y)); }
    for (i = 0; i < petals.length; i++) { var pe = petals[i]; pe.x += pe.s * SPEED * dt; pe.y += Math.sin(clock * 0.5 + i) * 0.05; pe.a += pe.r * dt; if (pe.x > W + 20) { pe.x = -20; pe.y = rnd(H * 0.15, H * 0.85); } }
    render();
    raf = requestAnimationFrame(step);
  }
  function start() { if (running || document.hidden) return; running = true; last = 0; raf = requestAnimationFrame(step); }
  function stop() { running = false; cancelAnimationFrame(raf); }

  // ---------- input ----------
  var lastRip = 0;
  function local(e) { var r = wrap.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  wrap.addEventListener('pointermove', function (e) {
    var p = local(e); mouse.vx = p[0] - mouse.lx; mouse.vy = p[1] - mouse.ly; mouse.lx = mouse.x = p[0]; mouse.ly = mouse.y = p[1]; mouse.on = true; mouse.still = 0;
    var now = performance.now(), sp = Math.hypot(mouse.vx, mouse.vy);
    if (!reduce && now - lastRip > 110 && sp > 2) { addRipple(p[0], p[1], Math.min(1.1, 0.25 + sp * 0.05)); lastRip = now; }
  }, { passive: true });
  wrap.addEventListener('pointerleave', function () { mouse.on = false; mouse.x = mouse.y = -1e4; });
  wrap.addEventListener('pointerdown', function (e) {
    var p = local(e); addRipple(p[0], p[1], 2.2);
    for (var k = 0; k < 7; k++) food.push({ x: p[0] + rnd(-14, 14), y: p[1] + rnd(-10, 10), depth: 0, s: rnd(0, 6) });
    if (e.pointerType !== 'mouse') { mouse.on = false; }
  }, { passive: true });

  resize();
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(wrap); else window.addEventListener('resize', resize);
  if ('IntersectionObserver' in window) new IntersectionObserver(function (en) { en[0].isIntersecting ? start() : stop(); }, { rootMargin: '100px' }).observe(wrap); else start();
  document.addEventListener('visibilitychange', function () { document.hidden ? stop() : (wrap.getBoundingClientRect().top < innerHeight && start()); });
  glc.addEventListener('webglcontextlost', function (e) { e.preventDefault(); stop(); });
  window.__koi = { addRipple: addRipple, food: food, stop: stop, start: start, koi: function () { return koi; } };
})();
