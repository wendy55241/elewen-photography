// The home page ("Welcome to EleWen Photography") and the way in.
// Where the browser has HTML-in-Canvas (Chrome 157+: <canvas content="drawable">, drawElementImage), the home page's
// real DOM lives inside a canvas and is drawn by it. That lets the canvas draw the page a second time under the
// pointer (a loupe on the orbit variant, a trail of slipping frames on the pages variant) and, on entering, draw it as
// two pieces that come apart along a line through the "11": torn on the orbit variant, cut on the pages variant.
// Elsewhere the same motion runs on two clipped copies of the DOM, without the magnified re-draws.
import {play} from './sound.js';

const $ = s => document.querySelector(s);
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const outCubic = t => 1 - (1 - t) ** 3, inCubic = t => t * t * t, inOut = t => t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
const TEAR_MS = 1100;

function supportsHtmlInCanvas() {
  const c = document.createElement('canvas'); c.setAttribute('content', 'drawable');
  return c.content === 'drawable' && 'drawElementImage' in CanvasRenderingContext2D.prototype && typeof c.requestPaint === 'function';
}

export function initHome({skip, onEnter, onReturn}) {
  const root = document.documentElement, home = $('.home'), cv = $('.home-cv'), dom = $('.home-dom'), ctx = cv.getContext('2d');
  const params = new URLSearchParams(location.search);
  const kind = root.dataset.variant === 'pages' ? 'cut' : 'tear';          // pages: a clean diagonal cut; orbit: a tear
  const HIC = supportsHtmlInCanvas() && params.get('hic') !== '0';
  root.dataset.hic = HIC ? 'on' : 'off';
  if (HIC) { cv.setAttribute('content', 'drawable'); dom.setAttribute('drawable', ''); cv.appendChild(dom); }
  const S = {on: !skip, dpr: 1, W: 0, H: 0, px: .5, py: .5, sx: .5, sy: .5, moved: false, fx: 0, fy: 0, fvx: 0, fvy: 0, trail: [], tear: null, halves: null, last: performance.now(), t: 0};

  function resize() {
    S.dpr = Math.min(devicePixelRatio || 1, 2); S.W = cv.width = Math.round(innerWidth * S.dpr); S.H = cv.height = Math.round(innerHeight * S.dpr);
    if (!S.moved) { S.fx = S.W * .5; S.fy = S.H * .5; }
  }
  addEventListener('resize', () => { if (S.on) resize(); });

  // ---- pointer: everything on the page leans towards it, and one thing follows it ----
  home.addEventListener('pointermove', ev => { S.px = ev.clientX / innerWidth; S.py = ev.clientY / innerHeight; S.moved = true; });
  function update(dt) {
    S.t += dt;
    // Before the pointer has moved (and on touch screens) the follower drifts on its own so the effect is on show.
    const tx = S.moved ? S.px : .5 + .26 * Math.sin(S.t * .55), ty = S.moved ? S.py : .5 + .16 * Math.sin(S.t * .83 + 1);
    const k = 1 - Math.exp(-dt * 5); S.sx += (tx - S.sx) * k; S.sy += (ty - S.sy) * k;
    dom.style.setProperty('--mx', S.sx.toFixed(4)); dom.style.setProperty('--my', S.sy.toFixed(4));
    // The follower: a damped spring to the pointer (it overshoots a little and settles).
    const gx = tx * S.W, gy = ty * S.H, st = 90, dm = 13;
    S.fvx += ((gx - S.fx) * st - S.fvx * dm) * dt; S.fvy += ((gy - S.fy) * st - S.fvy * dm) * dt; S.fx += S.fvx * dt; S.fy += S.fvy * dt;
    // pages: five frames in a chain, each chasing the one before it.
    if (!S.trail.length) for (let i = 0; i < 5; i++) S.trail.push([S.fx, S.fy]);
    S.trail[0][0] = S.fx; S.trail[0][1] = S.fy;
    for (let i = 1; i < 5; i++) { const q = 1 - Math.exp(-dt * (11 - i * 1.6)); S.trail[i][0] += (S.trail[i - 1][0] - S.trail[i][0]) * q; S.trail[i][1] += (S.trail[i - 1][1] - S.trail[i][1]) * q; }
  }
  const drawDom = (...a) => { try { ctx.drawElementImage(dom, ...a); return true; } catch { return false; } };

  // orbit variant: a loupe. Inside the ring the live page is drawn again, magnified about the ring's centre.
  function drawLoupe() {
    const d = S.dpr, r = Math.min(120, innerWidth * .1 + 30) * d, x = S.fx, y = S.fy, Z = 1.55;
    if (HIC) {
      ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.clip();
      ctx.translate(x, y); ctx.scale(Z, Z); ctx.translate(-x, -y); drawDom(0, 0, S.W, S.H, {preserveElementGeometry: true}); ctx.restore();
      const lens = ctx.createRadialGradient(x - r * .3, y - r * .35, r * .1, x, y, r); lens.addColorStop(0, 'rgba(210,232,255,.10)'); lens.addColorStop(.7, 'rgba(10,20,40,0)'); lens.addColorStop(1, 'rgba(3,8,18,.5)');
      ctx.fillStyle = lens; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
    // Rim: turned metal. The bright arc swings round with the direction of travel.
    const a = Math.atan2(S.fvy, S.fvx || 1e-3) + S.t * .15, rim = ctx.createConicGradient(a, x, y);
    for (const [p, c] of [[0, '#eaf4ff'], [.08, '#6aa5f2'], [.25, '#143463'], [.42, '#8fc0ff'], [.5, '#f4f9ff'], [.58, '#4f8ae0'], [.75, '#0f2749'], [.92, '#5b98e6'], [1, '#eaf4ff']]) rim.addColorStop(p, c);
    ctx.lineWidth = 5 * d; ctx.strokeStyle = rim; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke();
    ctx.lineWidth = 1 * d; ctx.strokeStyle = 'rgba(190,220,255,.45)'; ctx.beginPath(); ctx.arc(x, y, r + 7 * d, 0, 7); ctx.stroke();
    ctx.strokeStyle = 'rgba(190,220,255,.7)'; ctx.lineWidth = 1.2 * d;
    for (let i = 0; i < 4; i++) { const t = i * Math.PI / 2; ctx.beginPath(); ctx.moveTo(x + Math.cos(t) * (r - 14 * d), y + Math.sin(t) * (r - 14 * d)); ctx.lineTo(x + Math.cos(t) * (r - 4 * d), y + Math.sin(t) * (r - 4 * d)); ctx.stroke(); }
    ctx.fillStyle = 'rgba(190,220,255,.8)'; ctx.font = `600 ${10 * d}px Manrope, sans-serif`; ctx.textAlign = 'left'; ctx.fillText(HIC ? '× 1.55' : '11', x + r * .74, y + r * .92);
  }
  // pages variant: a chain of viewfinder frames. Each shows the page a little out of step, like pages slipping.
  function drawTrail() {
    const d = S.dpr, base = Math.min(210, innerWidth * .13 + 60) * d;
    for (let i = 4; i >= 0; i--) {
      // At rest the frames sit fanned like a short stack of prints; on the move they string out behind the pointer.
      const x = S.trail[i][0] + i * 15 * d, y = S.trail[i][1] + i * 11 * d, w = base * (1 - i * .07), h = w * 2 / 3, l = x - w / 2, t = y - h / 2;
      if (HIC) {
        const sx = (S.trail[i][0] - S.trail[0][0]) * .5, sy = (S.trail[i][1] - S.trail[0][1]) * .5, Z = 1.08 + i * .06;
        ctx.save(); ctx.beginPath(); ctx.rect(l, t, w, h); ctx.clip();
        ctx.translate(x + sx, y + sy); ctx.scale(Z, Z); ctx.translate(-x, -y); drawDom(0, 0, S.W, S.H, {preserveElementGeometry: true}); ctx.restore();
        ctx.fillStyle = `rgba(30,80,170,${.05 + i * .035})`; ctx.fillRect(l, t, w, h);
      }
      ctx.lineWidth = (i ? 1 : 1.6) * d; ctx.strokeStyle = `rgba(170,208,255,${.95 - i * .16})`; ctx.strokeRect(l, t, w, h);
      ctx.fillStyle = `rgba(190,220,255,${.9 - i * .15})`; ctx.font = `700 ${9 * d}px Manrope, sans-serif`; ctx.textAlign = 'left'; ctx.fillText(`0${i + 1}`, l + 7 * d, t + 15 * d);
    }
    // Focus brackets on the leading frame.
    const [x, y] = S.trail[0], w = base + 22 * d, h = base * 2 / 3 + 22 * d, c = 16 * d; ctx.strokeStyle = '#eaf4ff'; ctx.lineWidth = 2 * d;
    for (const [qx, qy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.beginPath(); ctx.moveTo(x + qx * w / 2, y + qy * (h / 2 - c)); ctx.lineTo(x + qx * w / 2, y + qy * h / 2); ctx.lineTo(x + qx * (w / 2 - c), y + qy * h / 2); ctx.stroke(); }
  }

  // ---- the way in: the page comes apart along a line through the "11" ----
  // The line passes between the two numerals, so each piece carries a 1 away with it.
  function seamX() { const a = dom.querySelector('.h-eleven b'), b = a.nextElementSibling; let x = 0, n = a; while (n && n !== dom) { x += n.offsetLeft; n = n.offsetParent; } return (x + a.offsetWidth + (b.offsetLeft - a.offsetLeft - a.offsetWidth) / 2) * S.dpr; }
  function makePath(cx) {
    const {W, H, dpr} = S;
    if (kind === 'cut') { const k = H * .11; return [[cx + k, -6], [cx - k, H + 6]]; }
    let seed = 11; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296, pts = []; let x = 0;
    // A torn edge wanders slowly and is ragged in the small: a smoothed walk plus fine jitter, unevenly spaced.
    let y = -6, slow = 0; while (y < H + 6) { slow = slow * .86 + (rnd() - .5) * 20 * dpr; x = slow + (rnd() - .5) * 9 * dpr; pts.push([cx + x, y]); y += (5 + rnd() * 13) * dpr; } pts.push([cx + x, H + 6]);
    return pts;
  }
  // Where a piece is at progress p (side -1 = left, +1 = right), as a 2D matrix in canvas pixels.
  function pieceMatrix(side, p) {
    const {W, H, dpr} = S, {cx, dir} = S.tear, m = new DOMMatrix();
    if (kind === 'cut') {
      // The blade passes first; the two pieces slip along the cut, then slide away.
      const slip = 30 * dpr * outCubic(clamp((p - .16) / .3)) * side, d = W * .78 * inCubic(clamp((p - .2) / .8)) * side;
      return m.translate(d + dir[0] * slip, dir[1] * slip);
    }
    // Torn from the top: each piece swings out about a point below the screen, then is pulled away.
    const th = 6.5 * outCubic(clamp(p / .55)) * side, d = (W * .7 * inCubic(clamp((p - .12) / .88)) + 5 * dpr * outCubic(clamp(p / .2))) * side;
    return m.translate(d, 0).translate(cx, H * 1.35).rotate(th).translate(-cx, -H * 1.35);
  }
  function tracePiece(side) {
    const {W, H} = S, M = Math.max(W, H), pts = S.tear.pts;
    ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.lineTo(side < 0 ? -M : W + M, H + M); ctx.lineTo(side < 0 ? -M : W + M, -M); ctx.closePath();
  }
  function traceSeam(upTo = 1) { const pts = S.tear.pts, n = Math.max(1, Math.round((pts.length - 1) * upTo)); ctx.beginPath(); for (let i = 0; i <= n; i++) i ? ctx.lineTo(pts[i][0], pts[i][1]) : ctx.moveTo(pts[0][0], pts[0][1]); if (pts.length === 2) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[0][0] + (pts[1][0] - pts[0][0]) * upTo, pts[0][1] + (pts[1][1] - pts[0][1]) * upTo); } }
  function drawTear(p) {
    const d = S.dpr;
    for (const side of [-1, 1]) {
      const m = pieceMatrix(side, p);
      ctx.save(); ctx.setTransform(m);
      // The piece's shadow falls into the opening, onto the rolls behind.
      // (Only where the canvas also draws the piece itself; over the DOM copies it would cover them.)
      if (HIC) { ctx.shadowColor = 'rgba(0,0,0,.75)'; ctx.shadowBlur = 46 * d; ctx.shadowOffsetX = -side * 10 * d; tracePiece(side); ctx.fillStyle = '#05080e'; ctx.fill(); ctx.shadowColor = 'transparent'; }
      if (HIC) { ctx.save(); tracePiece(side); ctx.clip(); drawDom(0, 0, S.W, S.H, {preserveElementGeometry: true}); ctx.restore(); }
      // The edge: a torn edge shows the pale core of the sheet, a cut edge is a hairline of bright metal.
      if (kind === 'tear') {
        ctx.lineJoin = 'round'; traceSeam(); ctx.lineWidth = 4.5 * d; ctx.strokeStyle = 'rgba(190,214,245,.38)'; ctx.stroke();
        traceSeam(); ctx.lineWidth = 1.2 * d; ctx.strokeStyle = 'rgba(236,245,255,.9)'; ctx.stroke();
      } else { traceSeam(); ctx.lineWidth = 2 * d; ctx.strokeStyle = 'rgba(214,234,255,.95)'; ctx.stroke(); }
      ctx.restore();
    }
    // The light through the seam: it runs down the line first, then fades as the pieces part.
    const run = clamp(p / (kind === 'cut' ? .16 : .22)), fade = 1 - clamp((p - .06) / .26);
    if (fade > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const [w, a] of [[26, .18], [9, .4], [2.4, 1]]) { traceSeam(run); ctx.lineWidth = w * d; ctx.strokeStyle = `rgba(150,200,255,${a * fade})`; ctx.stroke(); }
      if (run < 1) { const pts = S.tear.pts, q = pts.length === 2 ? [pts[0][0] + (pts[1][0] - pts[0][0]) * run, pts[0][1] + (pts[1][1] - pts[0][1]) * run] : pts[Math.round((pts.length - 1) * run)]; const g = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], 70 * d); g.addColorStop(0, 'rgba(235,245,255,.95)'); g.addColorStop(1, 'rgba(120,180,255,0)'); ctx.fillStyle = g; ctx.fillRect(q[0] - 70 * d, q[1] - 70 * d, 140 * d, 140 * d); }
      ctx.restore();
    }
    // Without HTML-in-Canvas the two pieces are clipped copies of the DOM, moved with the same matrices.
    if (S.halves) S.halves.forEach((el, i) => { const m = pieceMatrix(i ? 1 : -1, p), k = 1 / d; el.style.transform = new DOMMatrix([m.a, m.b, m.c, m.d, m.e * k, m.f * k]).toString(); });
  }
  function draw() {
    if (!S.on) return;
    ctx.reset ? ctx.reset() : (ctx.setTransform(1, 0, 0, 1, 0, 0), ctx.clearRect(0, 0, S.W, S.H));
    if (S.tear) return drawTear(S.tear.p);
    if (HIC) drawDom(0, 0, S.W, S.H);
    kind === 'cut' ? drawTrail() : drawLoupe();
  }
  if (HIC) cv.addEventListener('paint', draw);

  let done = null;
  function tick(now) {
    if (!S.on) return;
    const dt = Math.min(.05, (now - S.last) / 1000 || .016); S.last = now;
    if (S.tear && !S.tear.fixed) { S.tear.p = clamp((now - S.tear.t0) / TEAR_MS); if (S.tear.p >= 1) { draw(); return finish(); } } else if (!S.tear) update(dt);
    HIC ? cv.requestPaint() : draw();
    requestAnimationFrame(tick);
  }
  function begin(fixed) {
    const cx = seamX(), pts = makePath(cx), a = pts[0], b = pts[pts.length - 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    S.tear = {p: fixed ?? 0, t0: performance.now(), fixed: fixed !== undefined, cx, pts, dir: [(b[0] - a[0]) / len, (b[1] - a[1]) / len]};
    if (!HIC && !S.halves) {
      const poly = side => `polygon(${[...pts, [side < 0 ? -9999 : S.W + 9999, S.H + 9999], [side < 0 ? -9999 : S.W + 9999, -9999]].map(([x, y]) => `${(x / S.dpr).toFixed(1)}px ${(y / S.dpr).toFixed(1)}px`).join(',')})`;
      const twin = dom.cloneNode(true); twin.setAttribute('aria-hidden', 'true'); dom.after(twin);
      S.halves = [dom, twin]; S.halves.forEach((el, i) => { el.style.clipPath = poly(i ? 1 : -1); el.style.transformOrigin = '0 0'; el.style.willChange = 'transform'; });
    }
    home.classList.add('is-tearing');
  }
  function finish() {
    S.on = false; home.hidden = true; home.classList.remove('is-tearing'); S.tear = null;
    if (S.halves) { S.halves[1].remove(); dom.style.clipPath = dom.style.transform = ''; S.halves = null; }
    done?.(); done = null;
  }
  // Enter: the stage behind starts first, then the page opens over about a second.
  function enter() {
    if (!S.on || S.tear) return Promise.resolve();
    onEnter(); play('paper'); begin();
    return new Promise(res => { done = res; });
  }
  function show() {
    if (S.on) return; onReturn();
    S.on = true; home.hidden = false; S.last = performance.now(); resize();
    home.animate([{opacity: 0}, {opacity: 1}], {duration: 500, easing: 'ease-out'}); requestAnimationFrame(tick);
  }
  // Click, wheel down, swipe up, Enter / Space / ↓ all go in.
  home.addEventListener('click', ev => { if (ev.target.closest('.h-switch')) return; enter(); });
  home.addEventListener('wheel', ev => { ev.preventDefault(); if (ev.deltaY > 4) enter(); }, {passive: false});
  let touchY = null;
  home.addEventListener('touchstart', ev => { touchY = ev.touches[0].clientY; }, {passive: true});
  home.addEventListener('touchmove', ev => { if (touchY !== null && touchY - ev.touches[0].clientY > 34) { touchY = null; enter(); } }, {passive: true});
  addEventListener('keydown', ev => { if (S.on && !S.tear && !ev.target.closest?.('.h-switch') && ['Enter', ' ', 'ArrowDown', 'PageDown'].includes(ev.key)) { ev.preventDefault(); enter(); } });

  if (skip) { home.hidden = true; root.classList.remove('at-home'); queueMicrotask(onEnter); }
  else { resize(); requestAnimationFrame(tick); }
  // freeze(p): hold the opening at progress p (for screenshots); freeze() lets go.
  return {enter, show, HIC, kind, get on() { return S.on; }, freeze(p) { if (p === undefined) { finish(); onEnter(); } else { if (!S.tear) { onEnter(); begin(p); } S.tear.p = p; S.tear.fixed = true; } }};
}
