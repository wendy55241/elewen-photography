// A 135 strip as a ribbon mesh: rebate, perforations, leader tongue, edge print and chapter title slots painted once
// per roll; the photographs come from a second texture that holds the frames exactly as they sit on the film, cut
// into rows (a full roll is about 700 mm, far wider than one texture). An empty roll has no second texture: its
// frames are painted as blank windows.
// Frames have their own widths: an upright half-frame (16 x 24 mm) for portraits, a full frame (36 x 24 mm) for
// landscapes, so a vertical photograph stands upright on a horizontal strip, as it does on a half-frame camera.
// Units: millimetres on the film, scene units outside.
import * as THREE from './lib/three.webgpu.js';

const T = THREE.TSL;
export const FILM = {width: 35, leader: 60, tail: 24, imgY0: 5.5, imgY1: 29.5};
export const MM = 2.0 / FILM.width;                                 // scene units per mm (film is 2.0 units wide)

// The frame whose slot (image plus half the gap on either side) holds film position f, or -1.
export function frameAt(roll, f) {
  if (f < FILM.leader) return -1;
  const fr = roll.frames; for (let k = 0; k < fr.length; k++) if (f >= fr[k].a - 1 && f < fr[k].b + 1) return k; return -1;
}

// Film coordinate f: mm from the leader tip (f = 0) back towards the spool. Canvas x runs the other way so the
// strip reads left -> right with the leader on the right, the way it leaves the cartridge.
function overlay(roll) {
  const {width: W, leader: L0} = FILM, F = roll.len, PX = Math.min(16, Math.floor(8100 / F));   // overlay texels per mm
  const c = document.createElement('canvas'); c.width = Math.round(F * PX); c.height = W * PX;
  const g = c.getContext('2d'), X = f => (F - f) * PX, Y = y => (W - y) * PX;
  // Film outline: full width, except the leader tongue (bottom 21 mm for the first 40 mm, rounded tip, slanted step).
  g.fillStyle = roll.base;
  g.beginPath();
  g.moveTo(X(F), Y(0)); g.lineTo(X(6), Y(0));
  g.quadraticCurveTo(X(0), Y(0), X(0), Y(6)); g.lineTo(X(0), Y(15));
  g.quadraticCurveTo(X(0), Y(21), X(6), Y(21)); g.lineTo(X(38), Y(21));
  g.bezierCurveTo(X(44), Y(21), X(46), Y(35), X(53), Y(35)); g.lineTo(X(F), Y(35)); g.closePath(); g.fill();
  // Density: the leader is fogged darker, the rebate carries a faint sheen.
  const fog = g.createLinearGradient(X(0), 0, X(L0 + 8), 0); fog.addColorStop(0, 'rgba(0,0,0,.45)'); fog.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalCompositeOperation = 'source-atop'; g.fillStyle = fog; g.fillRect(0, 0, c.width, c.height);
  const sheen = g.createLinearGradient(0, 0, 0, c.height); sheen.addColorStop(0, 'rgba(190,215,255,.08)'); sheen.addColorStop(.5, 'rgba(255,255,255,0)'); sheen.addColorStop(1, 'rgba(190,215,255,.05)');
  g.fillStyle = sheen; g.fillRect(0, 0, c.width, c.height); g.globalCompositeOperation = 'source-over';
  // Frame windows. With photographs the shader replaces them; on an empty roll they stay as clear, unexposed frames.
  for (const fr of roll.frames) {
    const x = X(fr.b), y = Y(FILM.imgY1), w = (fr.b - fr.a) * PX, h = (FILM.imgY1 - FILM.imgY0) * PX;
    g.fillStyle = '#000'; g.fillRect(x, y, w, h);
    if (!fr.blank) continue;
    const clear = g.createLinearGradient(x, y, x + w, y + h); clear.addColorStop(0, '#16263f'); clear.addColorStop(.5, '#0f1c31'); clear.addColorStop(1, '#182a47');
    g.fillStyle = clear; g.fillRect(x, y, w, h);
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.strokeStyle = 'rgba(158,197,255,.1)'; g.lineWidth = Math.max(1, .12 * PX);
    for (let d = -h; d < w; d += 2.2 * PX) { g.beginPath(); g.moveTo(x + d, y + h); g.lineTo(x + d + h, y); g.stroke(); }
    g.restore();
  }
  // Chapter title slots: a blank stretch of film before each chapter, numbered in the chapter's colour.
  roll.chapters.forEach((ch, i) => {
    const mid = ch.t + roll.title / 2;
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.fillStyle = ch.accent; g.font = `400 ${11 * PX}px "Bodoni Moda", serif`; g.fillText(String(i + 1).padStart(2, '0'), X(mid), Y(13.2));
    g.fillStyle = roll.edge; g.font = `700 ${1.5 * PX}px "Manrope", sans-serif`; g.fillText(ch.series.toUpperCase().split('').join(String.fromCharCode(8202)), X(mid), Y(9.6));
    g.fillRect(X(mid + 4), Y(24.6), 8 * PX, Math.max(1, .18 * PX));
  });
  // Edge print: stock name along the top rebate, frame numbers and file numbers along the bottom.
  g.fillStyle = roll.edge; g.textBaseline = 'middle';
  g.font = `600 ${1.25 * PX}px "Manrope", sans-serif`; g.textAlign = 'left';
  for (let f = L0 + 6; f < F - 34; f += 76) g.fillText(`${roll.stock}  ${roll.placeholder ? 'UNEXPOSED' : 'SAFETY FILM'}  ▸`, X(f + 34), Y(34.05));
  roll.frames.forEach((fr, k) => {
    const mid = (fr.a + fr.b) / 2;
    g.font = `700 ${1.3 * PX}px "Manrope", sans-serif`; g.textAlign = 'center'; g.fillText(String(k + 1), X(mid), Y(.95));
    if (fr.o === 'l') { g.font = `600 ${1.05 * PX}px "Manrope", sans-serif`; g.fillText(`${fr.id} ▸`, X(fr.a + 6), Y(.95)); }
  });
  // Perforations: KS 2.79 x 1.98 mm, pitch 4.75 mm, punched through (alpha 0).
  g.globalCompositeOperation = 'destination-out';
  const hole = (f, y) => { g.beginPath(); g.roundRect(X(f + 1.98), Y(y + 2.79), 1.98 * PX, 2.79 * PX, .45 * PX); g.fill(); };
  for (let f = 2; f < F - 2; f += 4.75) { hole(f, 1.9); if (f > 54) hole(f, 30.31); }
  g.globalCompositeOperation = 'source-over';
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.generateMipmaps = true;
  return tex;
}

export function filmMaterial(roll, strip) {
  const H = FILM.imgY1 - FILM.imgY0, F = roll.len;
  const ov = overlay(roll);
  const u = {
    pull: T.uniform(0),                                                    // mm of film outside the lip
    focus: T.uniformArray(new Array(roll.frames.length).fill(0), 'float'), // hover per frame, 0..1
    cold: T.uniform(new THREE.Color('#8fb1ff')),
    base: T.uniform(new THREE.Color(roll.base)),
  };
  const q = T.uv(), f = q.x.oneMinus().mul(F), y = q.y.mul(FILM.width);
  const o = T.texture(ov, q), shade = T.attribute('shade', 'float');
  const mat = new THREE.MeshBasicNodeMaterial({side: THREE.DoubleSide});
  mat.opacityNode = o.a; mat.alphaTest = .5; mat.toneMapped = false;
  if (!strip) { mat.colorNode = o.rgb.mul(shade); return {material: mat, uniforms: u, overlay: ov}; }
  // Which frame slot is this texel in? The slots do not overlap, so sums over them select one frame's values.
  let inK = T.float(0), hov = T.float(0), fa = T.float(0), fb = T.float(0);
  roll.frames.forEach((fr, k) => {
    const m = T.step(fr.a - 1, f).mul(T.step(fr.b + 1, f).oneMinus());
    inK = inK.add(m); fa = fa.add(m.mul(fr.a)); fb = fb.add(m.mul(fr.b)); hov = hov.add(m.mul(u.focus.element(T.int(k))));
  });
  const ex = T.min(f.sub(fa), fb.sub(f)), ey = T.min(y.sub(FILM.imgY0), T.float(FILM.imgY1).sub(y));
  const inF = T.step(0, ex).mul(T.step(0, ey)).mul(inK);
  // The strip texture holds the frame section of the film in rows (row 0 at the top), each row unmirrored with its
  // leader end on the right. Rows are cut between frames, so the jump in u falls in a gap and never inside a picture.
  const rows = roll.atlas.rows; let su = T.float(0), sr = T.float(0);
  rows.forEach((row, r) => { const m = T.step(row.f0, f).mul(T.step(row.f1, f).oneMinus()); su = su.add(m.mul(T.float(row.f1).sub(f).div(roll.atlas.lmax))); sr = sr.add(m.mul(rows.length - 1 - r)); });
  const img = T.texture(strip, T.vec2(su.clamp(.0002, .9998), sr.add(y.sub(FILM.imgY0).div(H).clamp(.004, .996)).div(rows.length))).rgb;
  // Develop: a frame is latent inside the cartridge and comes up as it travels into the light.
  const travel = u.pull.sub(fb).sub(1);                 // mm this frame's trailing edge has travelled past the lip
  const dev = T.smoothstep(-30, 8, travel);
  const lum = img.dot(T.vec3(.2126, .7152, .0722));
  const graded = T.mix(T.vec3(lum), img, dev.mul(.9).add(hov.mul(.1))).mul(dev.mul(.9).add(.06).add(hov.mul(.1)));
  const latent = u.base.mul(1.4).add(T.vec3(lum.mul(.05)));
  const frame = T.mix(latent, graded, dev.min(1));
  // Focus corners in the rebate around a hovered frame (Overture's cold viewfinder brackets).
  const ring = T.step(ex, -.25).mul(T.step(-1.05, ex)).add(T.step(ey, -.25).mul(T.step(-1.05, ey))).min(1).mul(T.step(-1.05, ex)).mul(T.step(-1.05, ey));
  const nearCorner = T.step(ex, 3.6).mul(T.step(ey, 3.6));
  const brackets = ring.mul(nearCorner).mul(hov).mul(inK);
  mat.colorNode = T.mix(o.rgb, frame, inF).mul(shade).add(u.cold.mul(brackets).mul(1.2));
  return {material: mat, uniforms: u, overlay: ov};
}

// The path the film follows in cartridge space, as a lookup by arc length s (scene units) from the lip.
export function filmPath(M, dir0) {
  const ds = .04, n = 1700, pts = new Float32Array(n * 4);
  let x = M.x, y = M.y, z = M.z, psi = Math.atan2(dir0.z, dir0.x);
  for (let i = 0; i < n; i++) {
    const s = i * ds;
    pts.set([x, y, z, psi], i * 4);
    const target = .06 + .26 * smoothstepJS(6, 15, s);              // runs right, then sweeps gently towards the viewer
    psi += (target - psi) * Math.min(1, ds * (s < 2 ? 1.6 : .5));
    x += Math.cos(psi) * ds; z += Math.sin(psi) * ds; y -= ds * .028;  // a slight fall to the right
  }
  return (s, out) => {
    const t = Math.max(0, Math.min(n - 1.001, s / ds)), i = Math.floor(t), a = t - i, j = i * 4, k = j + 4;
    out.x = pts[j] + (pts[k] - pts[j]) * a; out.y = pts[j + 1] + (pts[k + 1] - pts[j + 1]) * a; out.z = pts[j + 2] + (pts[k + 2] - pts[j + 2]) * a; out.psi = pts[j + 3] + (pts[k + 3] - pts[j + 3]) * a;
    if (s < 0) { out.x += Math.cos(out.psi) * s; out.z += Math.sin(out.psi) * s; }
    return out;
  };
}
function smoothstepJS(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

// Ribbon geometry: one column of two vertices per 1.5 mm of film; positions are rewritten every frame.
export function filmGeometry(length) {
  const cols = Math.ceil(length / 1.5) + 1, pos = new Float32Array(cols * 2 * 3), uv = new Float32Array(cols * 2 * 2), shade = new Float32Array(cols * 2).fill(1), idx = [];
  for (let i = 0; i < cols; i++) {
    const u = i / (cols - 1);
    uv.set([u, 0, u, 1], i * 4);
    if (i < cols - 1) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, c, b, b, c, d); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('shade', new THREE.BufferAttribute(shade, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setIndex(idx);
  geo.userData.cols = cols;
  return geo;
}
