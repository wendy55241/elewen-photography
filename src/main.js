// EleWen Photography: five 35 mm cartridges on a hidden ring. One holds the photographs, four are empty for now.
// Two presentations share this file (html[data-variant]):
//   orbit — all five on one page; scrolling turns the ring, the cartridge at the centre can have its film dragged out.
//   pages — one cartridge per page; a pager turns the ring to the next one, scrolling pulls the film of the page's roll.
// Cartridge, lighting, springs and sound come from Projects/film-orbit-hero (Overture FilmCanister).
import * as THREE from './lib/three.webgpu.js';
import {ROLLS} from './rolls.js';
import {paintLabel, LABEL_FONTS} from './labels.js';
import {FILM, MM, filmMaterial, filmPath, filmGeometry, frameAt} from './film.js';
import {Spring, clamp, smooth, damp, cssEasing} from './motion.js';
import {play, setSound} from './sound.js';
import {initHome} from './home.js';

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
// The single-file build maps asset paths to embedded blob URLs.
const asset = p => window.__FILM_ASSETS?.[p] ?? p;
const params = new URLSearchParams(location.search);
const deg = THREE.MathUtils.degToRad, pad = n => String(n).padStart(2, '0');
const PAGES = document.documentElement.dataset.variant === 'pages', ORBIT = !PAGES;
// Phone layout (decided in the page head before first paint): a full-screen stage that does not scroll; an up/down
// swipe turns the ring, a sideways drag pulls the film.
const MOBILE = window.__FILM_LAYOUT === 'mobile', LOOP = MOBILE && ORBIT;
const N = ROLLS.length, STEP = Math.PI * 2 / N, BG = '#060a11';
const frameSrc = (ri, k) => asset(`assets/frames/${ROLLS[ri].key}-${pad(k + 1)}.jpg`), thumbSrc = (ri, k) => asset(`assets/thumbs/${ROLLS[ri].key}-${pad(k + 1)}.jpg`);
// The hidden ring. Its centre is the origin, which the camera looks at straight down the view axis, and its plane
// leans back from the screen so the orbit reads as an ellipse. The cartridges stand on its rim: each one rises
// R·cos(tilt) above its rim point, so at the front of the ring its body sits exactly on the screen centre.
const TILT = deg(clamp(+(params.get('tilt') ?? 75), 1, 90));
const RING_A = new THREE.Vector3(1, 0, 0), RING_UP = new THREE.Vector3(0, 1, 0), RING_B = new THREE.Vector3(0, -Math.cos(TILT), Math.sin(TILT));
const wrap = x => x - N * Math.round(x / N);                 // signed roll distance on the ring, in [-N/2, N/2]
const idx = x => ((Math.round(x) % N) + N) % N;
const L0 = FILM.leader, REST = 24, FULL = 38;                // mm outside the lip at rest; FULL = one full-frame pitch
const maxOf = r => r.roll.len - 16;                          // every frame of this roll out
const PXMM = +(params.get('pxmm') ?? 9);                     // pages: page pixels scrolled per mm of film
const VIS = 62;                                              // mm of film between the lip and the right of the screen
// A chapter's resting place: its title slot near the right edge, its first frames across the screen.
const anchor = (r, i) => clamp(r.roll.chapters[i].t + r.roll.title + VIS, REST, maxOf(r));
const firstStop = r => r.roll.chapters.length ? anchor(r, 0) : Math.min(maxOf(r), r.roll.frames[Math.min(2, r.n - 1)].b + 6);
// How far the camera pushes in while film is out. Frames are 24 mm high whatever their width, so this sets their size.
const PUSH = +(params.get('push') ?? .46);
const LIP = new THREE.Vector3(1.05, 0, .29), LIP_DIR = new THREE.Vector3(Math.cos(.35), 0, Math.sin(.35));
const path = filmPath(LIP, LIP_DIR);

const state = {home: true, step: 0, p: 0, arrived: -1, pulse: 0, orb: 0, orbTarget: 0, orbVel: 0, active: -1, shownU: null, pullTarget: REST, chapKey: '',
  reduced: params.get('motion') === 'reduce', pointer: [.5, .5], cam: [.5, .5], hover: null, drag: null, fling: null, lightbox: null, ready: false, R: 6, dist: 19.4, sheet: false};
const canvas = $('#gl'), stage = $('.stage'), hero = $('#hero'), root = document.documentElement;

// ---------- renderer, scene, lights (Overture canister lighting, cooled towards blue) ----------
const renderer = new THREE.WebGPURenderer({canvas, antialias: true, alpha: true, forceWebGL: params.get('backend') === 'webgl'});
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.04;
renderer.setClearColor(0x000000, 0);                       // the stage colour and the page title come from the page behind the canvas
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(BG, 17, 33);
const camera = new THREE.PerspectiveCamera(30, 1, .1, 120);
const cold = new THREE.Color('#8fb1ff');
scene.add(new THREE.HemisphereLight(0xe6efff, 0x10182a, .55));
const key = new THREE.DirectionalLight(0xeef4ff, 2.6); key.position.set(-4, 3, 5); scene.add(key);
const rim = new THREE.DirectionalLight(cold, 3.4); rim.position.set(4.5, 1.5, -3.5); scene.add(rim);
const fill = new THREE.PointLight(cold, 6, 12); scene.add(fill);
// Follow-spot on the roll at the centre; it blooms when the ring indexes onto a roll or the film enters a chapter.
const spot = new THREE.SpotLight(0xeaf2ff, 0, 0, deg(15), .75, 2); scene.add(spot, spot.target);
scene.environment = studioEnvironment(); scene.environmentIntensity = .5;

// A soft studio sphere so the anodised aluminium has something to reflect (two softboxes, dark floor).
function studioEnvironment() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, 256); sky.addColorStop(0, '#1e2a40'); sky.addColorStop(.5, '#0c121e'); sky.addColorStop(1, '#03050a'); g.fillStyle = sky; g.fillRect(0, 0, 512, 256);
  const box = (x, y, w, h, col) => { const r = g.createRadialGradient(x, y, 2, x, y, Math.max(w, h)); r.addColorStop(0, col); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(x - w * 1.5, y - h * 1.5, w * 3, h * 3); };
  box(150, 80, 70, 40, 'rgba(235,244,255,.95)'); box(390, 100, 50, 60, 'rgba(120,170,255,.8)'); box(270, 40, 120, 20, 'rgba(220,235,255,.45)');
  const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------- one cartridge + its strip per roll (Overture canister geometry) ----------
function buildRoll(roll, i, strip) {
  const R = 1, HH = 2.55, rig = new THREE.Group(), lean = new THREE.Group(), can = new THREE.Group();
  const label = new THREE.CanvasTexture(paintLabel(roll)); label.colorSpace = THREE.SRGBColorSpace; label.anisotropy = 8;
  const metal = new THREE.MeshStandardNodeMaterial({color: roll.metal, metalness: roll.metalness, roughness: roll.roughness});
  const dark = new THREE.MeshStandardNodeMaterial({color: 0x0f1522, metalness: .1, roughness: .75});
  const paper = new THREE.MeshStandardNodeMaterial({map: label, roughness: roll.placeholder ? .3 : .42, metalness: roll.placeholder ? .55 : .05});
  const body = new THREE.Group(); body.add(new THREE.Mesh(new THREE.CylinderGeometry(R, R, HH, 128, 1, true), paper));
  for (const y of [1, -1]) {
    const lip = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.045, R * 1.045, .17, 128), metal); lip.position.y = y * (HH / 2 + .085); body.add(lip);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 1.03, .03, 12, 128), metal); ring.rotation.x = Math.PI / 2; ring.position.y = y * (HH / 2 + .17); body.add(ring);
  }
  const nub = new THREE.Group(), nubBody = new THREE.Mesh(new THREE.CylinderGeometry(.34, .36, .42, 48), metal), slot = new THREE.Mesh(new THREE.BoxGeometry(.5, .07, .1), dark);
  nubBody.position.y = HH / 2 + .38; slot.position.y = HH / 2 + .6; nub.add(nubBody, slot);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, .16, 48), metal); foot.position.y = -HH / 2 - .25;
  const felt = new THREE.Mesh(new THREE.BoxGeometry(.14, HH * .8, .32), dark); felt.position.set(R * .985, 0, .27); felt.rotation.y = -.35;
  can.add(body, nub, foot, felt); can.position.copy(LIP).negate(); lean.position.copy(LIP); lean.add(can);
  const fm = filmMaterial(roll, strip), film = new THREE.Mesh(filmGeometry(roll.len), fm.material);
  film.frustumCulled = false; film.userData = {roll: i, film: true};
  rig.add(lean, film);
  rig.traverse(o => { if (o.isMesh && !o.userData.film) o.userData.roll = i; });
  scene.add(rig);
  return {roll, i, n: roll.frames.length, rig, lean, body, nub, film, u: fm.uniforms, mats: [[paper, new THREE.Color(1, 1, 1)], [metal, new THREE.Color(roll.metal)]],
    pull: new Spring(REST, 'settle'), focus: new Float32Array(roll.frames.length), spin: {angle: 0, lean: 0}, flutter: 0, lastOut: 0, dim: 0, hide: 0};
}

// ---------- film vertices: the strip slides along a fixed path as it is pulled ----------
const pt = {x: 0, y: 0, z: 0, psi: 0};
function updateFilm(r, t) {
  const geo = r.film.geometry, pos = geo.attributes.position.array, sh = geo.attributes.shade.array, cols = geo.userData.cols, pull = r.pull.value, FL = r.roll.len;
  const A = state.reduced ? 0 : r.flutter, lifted = r.focus.some(v => v > .001), k0 = 1 - r.hide;
  for (let c = 0; c < cols; c++) {
    const f = (1 - c / (cols - 1)) * FL, s = Math.max(-.45, (pull - f) * MM);
    path(s, pt);
    const nx = -Math.sin(pt.psi), nz = Math.cos(pt.psi);
    let off = A * Math.sin(1.25 * s - 4.2 * t) * smooth(.3, 2.6, s) + .012 * Math.sin(.9 * s + t * .8) * smooth(1, 4, s);
    if (lifted && s > 0) { const k = frameAt(r.roll, f); if (k >= 0 && r.focus[k] > .001) { const fr = r.roll.frames[k]; off += .16 * r.focus[k] * Math.sin(Math.PI * clamp((f - fr.a + 1) / (fr.b - fr.a + 2))); } }
    const x = pt.x + nx * off, z = pt.z + nz * off, j = c * 6;
    pos[j] = x; pos[j + 1] = pt.y - 1; pos[j + 2] = z; pos[j + 3] = x; pos[j + 4] = pt.y + 1; pos[j + 5] = z;
    const lit = (.74 + .26 * nz - .5 * A * Math.cos(1.25 * s - 4.2 * t) * smooth(.3, 2.6, s)) * k0;
    sh[c * 2] = lit * .97; sh[c * 2 + 1] = lit;
  }
  geo.attributes.position.needsUpdate = true; geo.attributes.shade.needsUpdate = true; geo.computeBoundingSphere();
  r.u.pull.value = pull;
  for (let k = 0; k < r.n; k++) r.u.focus.array[k] = r.focus[k];
}

// ---------- page scroll ----------
// orbit: the hero is a sticky stage over one scroll step per roll. pages: over a track as long as the page's film.
let rolls = [];
const stepPx = () => innerHeight * .85, DWELL = .2;
const offOf = r => wrap(r.i - state.orb);
const pullable = r => Math.abs(offOf(r)) < .12;
const centre = () => rolls.find(pullable);
const pageMax = () => ROLLS[idx(state.orbTarget)].len - 16;        // pages: the page's roll fully out (same as maxOf)
const trackPx = () => ORBIT ? stepPx() * (N - 1) : (pageMax() - REST) * PXMM;
function setTrack() { hero.style.setProperty('--track', ORBIT ? `${(N - 1) * 85}svh` : `${Math.round(trackPx())}px`); }
const rawP = () => clamp((scrollY - hero.offsetTop) / (stepPx() * (N - 1)), 0, 1) * (N - 1);
// Each roll is a paragraph: the first and last fifth of every scroll step hold the orbit still, the middle turns it.
function stair(p) { const i = Math.min(N - 2, Math.floor(p)), t = clamp((p - i - DWELL) / (1 - 2 * DWELL)); return i + t * t * (3 - 2 * t); }
const scrollPull = () => REST + clamp((scrollY - hero.offsetTop) / trackPx()) * (pageMax() - REST);
const scrollFor = mm => hero.offsetTop + (mm - REST) * PXMM;
const behaviour = smoothly => smoothly && !state.reduced ? 'smooth' : 'instant';
// Bring roll i to the centre.
function goRoll(i, smoothly = true) {
  if (ORBIT && !MOBILE) { state.step = i; scrollTo({top: hero.offsetTop + i * stepPx(), behavior: behaviour(smoothly)}); return; }
  const base = Math.round(state.orbTarget); turnTo(base + wrap(i - base));
}
// Turn the ring to the unwrapped position u. pages: the old roll winds back and the page scroll returns to the top.
function turnTo(u) {
  if (u === Math.round(state.orbTarget) && !orbit.free) return;
  stopFling(); state.orbTarget = u;
  if (PAGES) { state.pullTarget = REST; if (!MOBILE) { setTrack(); scrollTo({top: hero.offsetTop, behavior: 'instant'}); } }
}
const stepRoll = d => turnTo(Math.round(state.orbTarget) + d);
// Pull the centre roll's film out to mm.
function setPull(mm, smoothly = true) {
  const r = centre(); if (!r) return; mm = clamp(mm, REST, maxOf(r)); stopFling();
  if (PAGES && !MOBILE) scrollTo({top: scrollFor(mm), behavior: behaviour(smoothly)});
  else if (PAGES) state.pullTarget = mm; else r.pull.to(mm, {preset: 'settle'});
}
addEventListener('scroll', () => {
  if (MOBILE || state.home) return;
  if (ORBIT) { state.orbTarget = stair(rawP()); state.p = rawP(); }
  else if (!state.drag?.mode && !state.fling) state.pullTarget = scrollPull();
  root.classList.toggle('past-hero', scrollY > hero.offsetTop + trackPx() + innerHeight * .5);
}, {passive: true});
// orbit: inside the hero one wheel gesture moves exactly one roll. A gesture ends when the wheel has been quiet for
// 180 ms, so trackpad inertia cannot skip rolls. Phone layout: the wheel turns the ring (orbit) or moves the film (pages).
let wheelAcc = 0, wheelBusy = 0;
addEventListener('wheel', ev => {
  if (state.home || ev.defaultPrevented || state.lightbox || state.sheet || ev.ctrlKey || ev.shiftKey) return;
  if (PAGES) {
    if (!MOBILE) return;
    ev.preventDefault(); stopFling(); const r = centre(); if (r) state.pullTarget = clamp(state.pullTarget + (Math.abs(ev.deltaX) > Math.abs(ev.deltaY) ? ev.deltaX : ev.deltaY) * .22, REST, maxOf(r)); return;
  }
  if (Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) return;
  const top = hero.offsetTop, now = performance.now(), busy = now < wheelBusy;
  let next = 0;
  if (!LOOP) {
    if (scrollY < top - 2 || scrollY > top + stepPx() * (N - 1) + 2) return;
    next = (busy ? state.step : Math.round(rawP())) + Math.sign(ev.deltaY);
    if (!busy && (next < 0 || next > N - 1)) return;          // past either end the page scrolls on
  }
  ev.preventDefault();
  if (busy) { wheelBusy = Math.max(wheelBusy, now + 180); return; }
  wheelAcc += ev.deltaY * (ev.deltaMode === 1 ? 33 : 1);
  if (Math.abs(wheelAcc) < 24) return;
  wheelAcc = 0; wheelBusy = now + 560; LOOP ? stepRoll(Math.sign(ev.deltaY)) : goRoll(next);
}, {passive: false});

// ---------- interaction ----------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function pick(ev) {
  const b = canvas.getBoundingClientRect(); ndc.set((ev.clientX - b.left) / b.width * 2 - 1, -((ev.clientY - b.top) / b.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(rolls.filter(r => r.rig.visible).map(r => r.rig), true).find(h => h.object.userData.roll !== undefined && (!h.object.userData.film || h.uv));
  if (!hit) return null;
  const r = rolls[hit.object.userData.roll];
  if (!hit.object.userData.film) return {r, part: 'can'};
  const k = frameAt(r.roll, (1 - hit.uv.x) * r.roll.len), fr = r.roll.frames[k];
  return {r, part: 'film', frame: fr && !fr.blank && r.pull.value - fr.b - 1 > -(fr.b - fr.a) * .4 ? k : -1};
}
const outCount = r => r.roll.frames.reduce((n, fr) => n + (r.pull.value >= fr.b ? 1 : 0), 0);
function mmPerPx(r) { const w = r.rig.getWorldPosition(new THREE.Vector3()); return 2 * camera.position.distanceTo(w) * Math.tan(deg(camera.fov / 2)) / canvas.clientHeight / MM; }
// Film may only be out while its cartridge sits at the centre; it winds back as the ring carries it away.
const maxFor = r => REST + (maxOf(r) - REST) * (1 - smooth(.04, .32, Math.abs(offOf(r))));
// The hand (or a fling) holds the film: move it, and on a pages layout keep the page scroll in step.
function holdPull(r, mm) {
  r.pull.value = r.pull.target = clamp(mm, REST, maxFor(r));
  if (PAGES) { state.pullTarget = r.pull.value; if (!MOBILE) scrollTo({top: scrollFor(r.pull.value), behavior: 'instant'}); }
}

canvas.addEventListener('pointerdown', ev => {
  if (ev.button !== 0 || !state.ready || state.home) return;
  stopFling();
  state.drag = {id: ev.pointerId, x: ev.clientX, y: ev.clientY, lx: ev.clientX, t: performance.now(), v: 0, h: pick(ev), r: centre(), mode: null};
});
addEventListener('pointermove', ev => {
  state.pointer = [ev.clientX / innerWidth, ev.clientY / innerHeight];
  const d = state.drag;
  if (d && d.id === ev.pointerId) {
    const dx = ev.clientX - d.x, dy = ev.clientY - d.y;
    if (!d.mode && Math.hypot(dx, dy) > 6) {
      // A sideways drag anywhere on the stage pulls the centre roll's film. On the phone an up/down drag turns the ring.
      const horiz = Math.abs(dx) > Math.abs(dy) * .8;
      d.mode = horiz && d.r ? 'film' : MOBILE && !horiz ? 'orbit' : 'none';
      if (d.mode !== 'none') canvas.setPointerCapture(ev.pointerId);
      if (d.mode === 'film') { d.r.pull.free = true; d.acc = d.r.pull.value; d.lx = ev.clientX; stage.classList.add('is-pulling'); }
      if (d.mode === 'orbit') { orbit.free = true; d.orb0 = orbit.value; d.ly = d.y; d.vo = 0; }
    }
    if (d.mode === 'orbit') {
      // The finger turns the ring directly: a third of the screen height is one roll.
      const now = performance.now(), dt = Math.max(1, now - d.t), step = -(ev.clientY - d.ly) / (canvas.clientHeight * .32);
      orbit.value += step; d.vo = d.vo * .6 + (step / dt * 1000) * .4; d.t = now; d.ly = ev.clientY;
    }
    if (d.mode === 'film') {
      // Incremental, at the current zoom: the camera pushes in while film comes out, the strip stays under the hand.
      const now = performance.now(), dt = Math.max(1, now - d.t), step = ev.clientX - d.lx;
      d.k = mmPerPx(d.r); d.acc = clamp(d.acc + step * d.k, REST - 8, maxOf(d.r) + 8); d.v = d.v * .6 + (step / dt * 1000) * .4; d.t = now; d.lx = ev.clientX;
      holdPull(d.r, d.acc);
    }
    return;
  }
  if (ev.target === canvas && state.ready && !state.home) hoverAt(ev);
});
addEventListener('pointerup', ev => {
  const d = state.drag; if (!d || d.id !== ev.pointerId) return; state.drag = null; stage.classList.remove('is-pulling');
  if (d.mode === 'orbit') { releaseOrbit(d); return; }
  if (d.mode === 'film') {
    const v = (performance.now() - d.t > 90 ? 0 : d.v) * d.k;
    if (!state.reduced && Math.abs(v) > 120 * d.k) state.fling = {r: d.r, v}; else d.r.pull.free = false;
    return;
  }
  if (d.mode === null && d.h) {
    if (!pullable(d.h.r)) goRoll(d.h.r.i);
    else if (d.h.part === 'film' && d.h.frame >= 0) openLightbox(d.h.r.i, d.h.frame);
    else if (d.h.part === 'can' && d.h.r.pull.value < REST + 8) setPull(firstStop(d.h.r));
  }
});
addEventListener('pointercancel', () => { const d = state.drag; if (d?.mode === 'film') d.r.pull.free = false; if (d?.mode === 'orbit') releaseOrbit(d, true); state.drag = null; stage.classList.remove('is-pulling'); });
// A swipe lands on the neighbouring roll at most (one paragraph per gesture); a flick is enough to get there.
function releaseOrbit(d, cancel) {
  const v = cancel || performance.now() - d.t > 90 ? 0 : d.vo, from = Math.round(d.orb0);
  const target = clamp(Math.round(orbit.value + v * .16), from - 1, from + 1);
  orbit.free = false; if (PAGES && target !== from) state.pullTarget = REST;
  state.orbTarget = target; orbit.to(target, {velocity: clamp(v, -6, 6)});
}
canvas.addEventListener('pointerleave', () => { state.hover = null; canvas.style.cursor = ''; });
function hoverAt(ev) {
  const h = pick(ev);
  state.hover = h && pullable(h.r) && h.part === 'film' && h.frame >= 0 ? {r: h.r, k: h.frame} : null;
  canvas.style.cursor = !h ? '' : !pullable(h.r) ? 'pointer' : state.hover ? 'zoom-in' : 'grab';
}
function stopFling() { if (state.fling) { state.fling.r.pull.free = false; state.fling = null; } }

// A sideways wheel or a two-finger swipe over the stage moves the film as well.
canvas.addEventListener('wheel', ev => {
  const r = centre(); if (!r || state.home || (PAGES && MOBILE) || Math.abs(ev.deltaX) <= Math.abs(ev.deltaY)) return;
  ev.preventDefault(); stopFling(); setPull((PAGES ? state.pullTarget : r.pull.target) - ev.deltaX * mmPerPx(r) * .8, false);
}, {passive: false});
addEventListener('keydown', ev => {
  if (state.home) return;
  if (state.lightbox) { if (ev.key === 'Escape') closeLightbox(); else if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') stepLightbox(ev.key === 'ArrowRight' ? 1 : -1); return; }
  if (state.sheet) { if (ev.key === 'Escape') toggleSheet(false); return; }
  if (root.classList.contains('past-hero')) return;
  if (/^[1-9]$/.test(ev.key) && +ev.key <= N) { goRoll(+ev.key - 1); return; }
  const s = MOBILE && {ArrowDown: 1, PageDown: 1, ' ': 1, ArrowUp: -1, PageUp: -1}[ev.key];
  if (s) { ev.preventDefault(); stepRoll(s); return; }
  const r = centre(); if (!r) return;
  // ← → bring the next frame out, or put the last one back.
  const stops = [REST, ...r.roll.frames.map(fr => Math.min(maxOf(r), fr.b + 6))], t = PAGES ? state.pullTarget : r.pull.target;
  if (ev.key === 'ArrowRight') { ev.preventDefault(); setPull(stops.find(x => x > t + 1) ?? maxOf(r)); }
  else if (ev.key === 'ArrowLeft') { ev.preventDefault(); setPull(stops.findLast(x => x < t - 1) ?? REST); }
  else if (ev.key === 'Home' || ev.key === 'Escape') setPull(REST);
});

// ---------- lightbox: the frame grows out of the strip (or the page) and develops (Overture print develop) ----------
const lb = $('.lb'), lbImg = $('.lb img'), settle = cssEasing('settle');
function frameRect(r, k) {
  const out = new THREE.Vector3(), pts = [], b = canvas.getBoundingClientRect(), fr = r.roll.frames[k];
  for (const f of [fr.a, fr.b]) for (const y of [-.686, .686]) {
    path((r.pull.value - f) * MM, pt); out.set(pt.x, pt.y + y, pt.z); r.rig.localToWorld(out).project(camera);
    pts.push([(out.x + 1) / 2 * b.width + b.left, (1 - out.y) / 2 * b.height + b.top]);
  }
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return {x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys)};
}
const metaOf = fr => [fr.when, fr.exif].filter(Boolean).join(' · ');
function fillLightbox(ri, k) {
  const roll = ROLLS[ri], fr = roll.frames[k], ch = roll.chapters[fr.c];
  lbImg.src = frameSrc(ri, k); lbImg.alt = `${fr.t} · ${fr.zh}`; lbImg.width = fr.w; lbImg.height = fr.h; lbImg.style.aspectRatio = `${fr.w} / ${fr.h}`;
  $('.lb .no').textContent = `${pad(k + 1)} / ${pad(roll.frames.length)}`; $('.lb .t').textContent = fr.t; $('.lb .z').textContent = fr.zh;
  $('.lb .s').textContent = [`${roll.name.join(' ')} · ${ch.series}`, metaOf(fr), fr.id].filter(Boolean).join('  ·  ');
}
async function openLightbox(ri, k, from) {
  if (state.lightbox) return;
  state.lightbox = {ri, k}; fillLightbox(ri, k); lb.hidden = false; play('shutter');
  await lbImg.decode().catch(() => {});
  const r = rolls[ri], to = lbImg.getBoundingClientRect(), src = from || (r && pullable(r) && r.pull.value > r.roll.frames[k].a ? frameRect(r, k) : null);
  lb.animate([{opacity: 0}, {opacity: 1}], {duration: 260, easing: 'ease-out'});
  if (src && !state.reduced) {
    lbImg.animate([{transform: `translate(${src.x - to.x}px,${src.y - to.y}px) scale(${src.w / to.width},${src.h / to.height})`, transformOrigin: '0 0'}, {transform: 'none', transformOrigin: '0 0'}], {duration: settle.duration + 120, easing: settle.easing});
  }
  lbImg.animate([{filter: 'grayscale(1) brightness(1.9) contrast(.5)', opacity: .35}, {filter: 'grayscale(.7) brightness(1.2) contrast(.8)', offset: .45}, {filter: 'none', opacity: 1}], {duration: state.reduced ? 400 : 1300, easing: 'cubic-bezier(.16,1,.3,1)'});
}
function stepLightbox(d) {
  const {ri, k} = state.lightbox, nf = ROLLS[ri].frames.length, n = (k + d + nf) % nf; state.lightbox.k = n; play('tick', {pitch: .9});
  lbImg.animate([{opacity: 1}, {opacity: 0}], {duration: 120}).finished.then(() => { fillLightbox(ri, n); lbImg.animate([{filter: 'grayscale(1) brightness(1.6)', opacity: .3}, {filter: 'none', opacity: 1}], {duration: 700, easing: 'cubic-bezier(.16,1,.3,1)'}); });
}
function closeLightbox() {
  if (!state.lightbox) return; state.lightbox = null; play('paper');
  lb.animate([{opacity: 1}, {opacity: 0}], {duration: 220, easing: 'ease-in'}).finished.then(() => { if (!state.lightbox) lb.hidden = true; });
}
lb.addEventListener('click', ev => { if (ev.target.closest('.lb-nav')) stepLightbox(+ev.target.closest('.lb-nav').dataset.d); else closeLightbox(); });

// ---------- overlay UI ----------
const MON = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
function daysOf(ch) { const d = ch.days.map(s => s.split('-').map(Number)); if (!d.length) return ''; const a = d[0], b = d[d.length - 1]; return a[2] === b[2] ? `${a[2]} ${MON[a[1] - 1]}` : `${a[2]}–${b[2]} ${MON[b[1] - 1]}`; }
// The rail: the five rolls on the orbit layout, the chapters of the page's roll on the pages layout.
const rail = $('.rail'); let bars = [];
function buildRail(roll) {
  const items = ORBIT ? ROLLS.map(r => `${r.name.join(' ')} · ${r.zh}`) : roll.chapters.map(c => `${c.series} · ${c.zh}`);
  rail.innerHTML = items.map((t, i) => `<button type="button" data-i="${i}" aria-label="${t}"><i class="bar"><i></i></i><span>${pad(i + 1)}</span><em>${t}</em></button>`).join('');
  bars = [...rail.querySelectorAll('.bar i')];
}
rail.addEventListener('click', ev => { const b = ev.target.closest('button'); if (!b) return; if (ORBIT) goRoll(+b.dataset.i); else { const r = centre(); if (r) setPull(anchor(r, +b.dataset.i)); } });
// pages: the pager, one number per roll.
const pager = $('.pager');
pager.innerHTML = `<button type="button" data-d="-1" aria-label="上一卷">‹</button>${ROLLS.map((r, i) => `<button type="button" data-i="${i}" aria-label="${r.name.join(' ')}">${pad(i + 1)}</button>`).join('')}<button type="button" data-d="1" aria-label="下一卷">›</button>`;
pager.addEventListener('click', ev => { const b = ev.target.closest('button'); if (!b) return; if (b.dataset.d) stepRoll(+b.dataset.d); else goRoll(+b.dataset.i); });
// The stage takes a little colour from the photographs: a tiny blurred plate of the chapter's first frame behind the canvas.
const amb = $$('.ambient i'); let ambOn = 0, ambKey = '';
function setAmbient(key) {
  if (key === ambKey) return; ambKey = key; ambOn ^= 1;
  if (key) amb[ambOn].style.backgroundImage = `url("${asset(`assets/thumbs/${key}.jpg`)}")`;
  amb[ambOn].classList.toggle('on', !!key); amb[ambOn ^ 1].classList.remove('on');
}
const settleEase = settle, snapEase = cssEasing('snap');
// Swap the text of a block: the old lines leave the way things moved, the numeral flips (Overture count), the new lines rise in.
const toks = new WeakMap();
function swap(el, dir, write, instant) {
  const tok = (toks.get(el) || 0) + 1, lines = [...el.children], num = el.querySelector('.num'); toks.set(el, tok);
  el.getAnimations({subtree: true}).forEach(a => a.cancel());
  if (state.reduced || instant) { write(); return; }
  const out = lines.map((ln, k) => ln.animate([{opacity: 1, transform: 'none'}, {opacity: 0, transform: `translateY(${-dir * 14}px)`}], {duration: 170, delay: k * 22, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards'}));
  Promise.all(out.map(a => a.finished)).then(() => {
    if (toks.get(el) !== tok) return;
    write();
    lines.forEach((ln, k) => ln.animate([{opacity: 0, transform: `translateY(${dir * 20}px)`}, {opacity: 1, transform: 'none'}], {duration: settleEase.duration, delay: 40 + k * 70, easing: settleEase.easing, fill: 'backwards'}));
    out.forEach(a => a.cancel());
    num?.animate([{transform: `perspective(240px) rotateX(${dir < 0 ? 72 : -72}deg)`, opacity: .2}, {transform: 'perspective(240px) rotateX(0deg)', opacity: 1}], {duration: snapEase.duration + 140, delay: 40, easing: snapEase.easing, fill: 'backwards'});
  }).catch(() => {});
}
// A roll arrives at the centre: its card, the page title behind the cartridge, the rail and the pager follow.
const card = $('.card'), chap = $('.chap'), title = $('.title');
function showRoll(i, dir, first) {
  const r = ROLLS[i], lines = [[r.name[0], r.name[1]], r.placeholder ? ['Coming', 'Soon'] : [String(r.frames.length), 'Frames']];
  if (PAGES) buildRail(r);
  [...rail.children].forEach((b, j) => b.classList.toggle('on', ORBIT && j === i));
  [...pager.querySelectorAll('[data-i]')].forEach((b, j) => b.toggleAttribute('aria-current', j === i));
  root.classList.toggle('empty-roll', PAGES && !!r.placeholder);
  if (!r.chapters.length) setAmbient('');
  swap(card, dir, () => {
    $('.card .num').textContent = pad(i + 1); $('.card .of').textContent = `/ ${pad(N)}`;
    $('.card .stock').textContent = r.name.join(' '); $('.card .series').textContent = `${r.zh} · ${r.stock}`;
    $('.card .meta').textContent = r.placeholder ? '待装片 · Coming soon' : `${r.frames.length} 帧 · ${r.chapters.length} 段`; $('.card .blurb').textContent = r.blurb;
  }, first);
  swap(title, dir, () => { [...title.querySelectorAll('i')].forEach((el, k) => { el.textContent = lines[k >> 1][k & 1]; }); }, first);
}
// The film enters a chapter (or the roll has none): the head above the strip and the note below it.
function showChapter(r, ci, dir, first) {
  const roll = r.roll, c = roll.chapters[ci];
  if (c) setAmbient(`${roll.key}-amb-${c.key}`);
  swap(chap, dir, () => {
    $('.chap .num').textContent = pad(c ? ci + 1 : roll.no); $('.chap .of').textContent = `/ ${pad(c ? roll.chapters.length : N)}`;
    $('.chap .stock').textContent = c ? c.series : 'Unexposed'; $('.chap .series').textContent = c ? `${c.zh} · ${c.title}` : `${roll.zh} · 待装片`;
    $('.chap .meta').textContent = c ? [`第 ${c.first + 1}–${c.first + c.count} 帧`, daysOf(c)].filter(Boolean).join(' · ') : `${r.n} 个空白帧`; $('.note').textContent = c ? c.blurb : roll.blurb;
  }, first);
}
const tag = $('.tag'), cap = $('.frame-cap');
$('.sound').addEventListener('click', ev => { const on = ev.currentTarget.getAttribute('aria-pressed') !== 'true'; ev.currentTarget.setAttribute('aria-pressed', on); ev.currentTarget.querySelector('b').textContent = on ? '开' : '关'; setSound(on); if (on) play('lever'); });
const motionBtn = $('.motion');
function setMotion(reduced) { state.reduced = reduced; root.dataset.motion = reduced ? 'reduce' : 'full'; motionBtn.setAttribute('aria-pressed', !reduced); motionBtn.querySelector('b').textContent = reduced ? '简' : '全'; }
motionBtn.addEventListener('click', () => setMotion(!state.reduced)); setMotion(state.reduced);

// ---------- frame loop ----------
const tmp = new THREE.Vector3(), camPan = new Spring(0, 'stage'), camDolly = new Spring(0, 'stage'), orbit = new Spring(0, 'detent'), enter = new Spring(0, 'stage');
let last = performance.now(), clock = 0, capKey = '';
function frame(now) {
  requestAnimationFrame(frame);
  if (!state.ready || document.hidden || state.home) { last = now; return; }
  const dt = Math.min(.05, (now - last) / 1000 || .016); last = now; clock += dt;
  const instant = state.reduced;
  // The ring follows its target on a detent spring: it indexes onto each roll with a small overshoot.
  const prevOrb = state.orb;
  if (!orbit.free) orbit.to(state.orbTarget); state.orb = orbit.step(dt, instant);
  state.orbVel += ((state.orb - prevOrb) / dt - state.orbVel) * damp(dt, 10);
  const nearestU = Math.round(state.orb), nearest = idx(state.orb), act = Math.abs(state.orb - nearestU) < .12 ? nearest : -1;
  if (act !== state.active) { state.active = act; stage.classList.toggle('is-active', act >= 0); }
  // The roll card turns over at the half-way point of a swing; the arrival is marked by a click and a spot bloom.
  if (nearestU !== state.shownU) { showRoll(nearest, nearestU > state.shownU ? 1 : -1, state.shownU === null); state.shownU = nearestU; }
  const settled = !orbit.free && Math.abs(state.orb - nearestU) < .02 && Math.abs(state.orbVel) < .5;
  if (settled && state.arrived !== nearestU) { if (state.arrived !== -1) { state.pulse = 1; play('lever', {pitch: .9 + nearest * .04}); } state.arrived = nearestU; }
  else if (Math.abs(state.orb - nearestU) > .1 && state.arrived !== -1) state.arrived = null;
  state.pulse *= Math.exp(-dt * (instant ? 6 : 1.9));
  // Fling: Overture's exponential decay; on a pages layout the page scroll rides along.
  if (state.fling) {
    const f = state.fling; f.v *= Math.exp(-dt * 5.5); holdPull(f.r, f.r.pull.value + f.v * dt);
    if (Math.abs(f.v) < 1.5 || f.r.pull.value <= REST || f.r.pull.value >= maxFor(f.r)) stopFling();
  }
  if (state.hover && !pullable(state.hover.r)) state.hover = null;
  let focus = 0;
  const pageIdx = idx(state.orbTarget);
  for (const r of rolls) {
    const off = offOf(r), hi = maxFor(r), a = Math.abs(off);
    // Who is on stage. orbit desktop: all five. orbit phone: the centre roll full size, its neighbours at 58 %.
    // pages: only the roll of the page; the others show up while the ring turns and fade out as it settles.
    if (PAGES) { r.hide = smooth(.3, .9, a); r.rig.visible = a < .92; }
    else if (MOBILE) { r.rig.scale.setScalar(a <= 1 ? 1 - .42 * smooth(0, 1, a) : .58 - .26 * smooth(1, 1.6, a)); r.hide = smooth(1.05, 1.58, a); r.rig.visible = a < 1.6; }
    // The film follows the page scroll (pages) or stays where the hand left it (orbit), never past what the ring allows.
    if (!r.pull.free) r.pull.to(Math.min(PAGES ? (r.i === pageIdx ? state.pullTarget : REST) : r.pull.target, hi));
    const before = r.pull.value; r.pull.step(dt, instant);
    const v = Math.abs(r.pull.value - before) / dt;
    if (v > 30 && state.hover?.r === r) state.hover = null;   // the frame under a resting cursor has moved on
    r.flutter += (Math.min(.16, .03 + v * .0012) - r.flutter) * damp(dt, 4);
    const out = outCount(r);
    if (out !== r.lastOut) { if (r.rig.visible) play('tick', {pitch: out > r.lastOut ? .9 : .8, pan: .2}); r.lastOut = out; }
    for (let k = 0; k < r.n; k++) { const want = state.hover && state.hover.r === r && state.hover.k === k ? 1 : 0; r.focus[k] += (want - r.focus[k]) * (instant ? 1 : damp(dt, 12)); }
    focus = Math.max(focus, smooth(0, 1, (r.pull.value - REST - 6) / (FULL * 1.6)) * (1 - smooth(.04, .32, a)));
    // Place on the hidden ring. φ = 90° is the point nearest the camera, on the view axis.
    const phi = Math.PI / 2 - off * STEP, R = state.R;
    r.rig.position.copy(RING_A).multiplyScalar(Math.cos(phi) * R).addScaledVector(RING_B, Math.sin(phi) * R).addScaledVector(RING_UP, R * Math.cos(TILT));
    if (!instant) r.rig.position.y += Math.sin(clock * .8 + r.i * 1.7) * .045;
    r.rig.rotation.set(.15, Math.cos(phi) * .5, instant ? 0 : clamp(state.orbVel * .05, -.12, .12));
    // Spool and label turn with the pulled length (Overture spin: nub 2.4 turns over a 36-exposure roll, body .42 of it).
    const target = (r.pull.value - REST) / 500 * Math.PI * 2 * 2.4, sp = r.spin, prev = sp.angle;
    sp.angle += (target - sp.angle) * (instant ? 1 : damp(dt, 11));
    const vel = (sp.angle - prev) / Math.max(dt, 1e-3);
    sp.lean += ((instant ? 0 : clamp(vel * .025, -.14, .14)) - sp.lean) * (instant ? 1 : damp(dt, 8));
    r.body.rotation.y = -Math.PI / 2 - sp.angle * .42 + (instant ? 0 : Math.sin(clock * .35 + r.i) * .06);
    r.nub.rotation.y = -sp.angle; r.lean.rotation.z = -.02 - sp.lean;
    if (r.rig.visible) updateFilm(r, clock);
  }
  stage.style.setProperty('--focus', focus.toFixed(3));
  stage.classList.toggle('is-out', focus > .5);
  // The roll at the centre holds the light; the others step back, further while a strip is out.
  for (const r of rolls) {
    const want = Math.max(.42 * smooth(.08, .7, Math.abs(offOf(r))), r.i === state.active ? 0 : focus); r.dim += (want - r.dim) * (instant ? 1 : damp(dt, 6));
    for (const [m, c] of r.mats) m.color.copy(c).multiplyScalar((1 - .68 * r.dim) * (1 - r.hide));
  }
  // Chapter of the centre roll: the one whose stretch of film is passing the middle of the screen.
  const cr = act >= 0 ? rolls[act] : null;
  let fc = 0, ci = -1;
  if (cr) {
    fc = cr.pull.value - VIS * .55; for (let i = 0; i < cr.roll.chapters.length; i++) if (i === 0 || fc >= cr.roll.chapters[i].t) ci = i;
    const keyNow = `${cr.i}:${ci}`;
    if (keyNow !== state.chapKey) {
      const [pr, pc] = state.chapKey.split(':').map(Number), same = pr === cr.i;
      showChapter(cr, ci, !same || ci > pc ? 1 : -1, !same);
      if (same) { state.pulse = 1; play('lever', {pitch: .9 + ci * .04}); }
      state.chapKey = keyNow;
    }
  }
  // Camera: dead centre at rest; trucks right and pushes in as film comes out, so the strip has the screen and the
  // cartridge parks half off the left edge. On entering from the home page it flies in from further back.
  const portrait = camera.aspect < 1, DOLLY = (state.dist - state.R) * (portrait ? (MOBILE ? .2 : .24) : PUSH);
  const half = Math.tan(deg(camera.fov / 2)) * camera.aspect * (state.dist - state.R - DOLLY);
  camPan.to(focus * half * (portrait ? (MOBILE ? 1.02 : .5) : .84)); camDolly.to(focus * DOLLY); camPan.step(dt, instant); camDolly.step(dt, instant);
  const pf = instant ? 1 : damp(dt, 6); state.cam[0] += (state.pointer[0] - state.cam[0]) * pf; state.cam[1] += (state.pointer[1] - state.cam[1]) * pf;
  const px = instant ? 0 : (state.cam[0] - .5) * .5, py = instant ? 0 : (state.cam[1] - .5) * -.3, back = (1 - enter.step(dt, instant)) * 9;
  camera.position.set(camPan.value + px, py + back * .12, state.dist - camDolly.value + back); camera.lookAt(camPan.value, 0, 0);
  const front = rolls[idx(state.orb)];
  fill.position.copy(front.rig.position).add(tmp.set(2.6, -1.2, 3));
  spot.position.copy(front.rig.position).add(tmp.set(-1.6, 7.5, 6)); spot.target.position.copy(front.rig.position);
  spot.intensity = (70 + 230 * state.pulse) * (1 - .5 * focus);
  stage.style.setProperty('--pulse', state.pulse.toFixed(3));
  // Rail bars. orbit: filled roll by roll down the page (phone: the current roll only). pages: each chapter as its film passes.
  if (ORBIT) for (let k = 0; k < bars.length; k++) bars[k].style.transform = `scaleX(${(LOOP ? clamp(1 - Math.abs(wrap(k - state.orb))) : clamp(state.p - k + 1)).toFixed(3)})`;
  else if (cr) cr.roll.chapters.forEach((c, k) => { if (bars[k]) bars[k].style.transform = `scaleX(${clamp((fc - c.t) / (c.b - c.t)).toFixed(3)})`; });
  renderer.render(scene, camera);
  // Leader tag follows the tongue of the centre roll until its film is out; the caption counts frames or names the hovered one.
  if (cr) {
    path(cr.pull.value * MM, pt); tmp.set(pt.x + .18, pt.y - .4, pt.z); cr.rig.localToWorld(tmp).project(camera);
    tag.style.transform = `translate(${(tmp.x + 1) / 2 * canvas.clientWidth}px,${(1 - tmp.y) / 2 * canvas.clientHeight}px)`;
    tag.classList.toggle('on', cr.pull.value < REST + 10 && !state.drag && enter.value > .9);
    const out = outCount(cr), hk = state.hover?.r === cr ? state.hover.k : undefined, keyNow = `${cr.i}:${hk ?? 'n'}:${out}`;
    cap.classList.toggle('on', cr.pull.value > L0 || hk !== undefined);
    if (keyNow !== capKey) {
      capKey = keyNow; const fr = hk !== undefined ? cr.roll.frames[hk] : null;
      cap.innerHTML = fr ? `<b>${pad(hk + 1)}</b> ${fr.t} · ${fr.zh}<i>${metaOf(fr) || fr.id}</i>` : `<b>${pad(out)}</b> / ${pad(cr.n)} ${cr.roll.placeholder ? '个空白帧' : '帧已拉出'}`;
    }
  } else { tag.classList.remove('on'); cap.classList.remove('on'); }
}

// ---------- layout ----------
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight; renderer.setSize(w, h, false);
  camera.aspect = w / h;
  if (MOBILE && camera.aspect < 1) { camera.fov = 42; state.R = 2; state.dist = 14.5; }   // centre roll ~half the width
  else if (MOBILE) { camera.fov = 30; state.R = 4.4; state.dist = 17.5; }
  else { camera.fov = camera.aspect < 1 ? 44 : 30; state.R = 5.6 * clamp(camera.aspect / 1.55, .5, 1); state.dist = 19.4; }
  camera.updateProjectionMatrix();
  if (!MOBILE && !state.home) { if (ORBIT) state.orbTarget = stair(rawP()); else state.pullTarget = scrollPull(); }
}
addEventListener('resize', resize);

// ---------- the site below the hero: contact sheet, selects, about ----------
// Contact sheet: each loaded roll cut into strips, a chapter each; frames keep their numbers and their true widths.
$('.sheets').innerHTML = ROLLS.map((roll, ri) => roll.chapters.map((c, i) => `<article class="sheet reveal" style="--base:${roll.base};--edge:${roll.edge}">
  <header><span>${pad(i + 1)}</span><h3>${c.series}</h3><p>${c.zh} · ${c.title}</p><p class="dim">${[`第 ${c.first + 1}–${c.first + c.count} 帧`, daysOf(c)].filter(Boolean).join(' · ')}</p></header>
  <div class="strip-wrap"><div class="strip" data-edge="${roll.stock}  SAFETY FILM ▸">${roll.frames.slice(c.first, c.first + c.count).map((fr, j) => { const k = c.first + j; return `<button type="button" class="fr${fr.pick ? ' pick' : ''}" data-r="${ri}" data-k="${k}" title="${fr.t} · ${fr.zh}"><img src="${thumbSrc(ri, k)}" alt="${fr.t}" loading="lazy" style="aspect-ratio:${fr.w}/${fr.h}" width="${Math.round(360 * fr.w / fr.h)}" height="360"><span>${k + 1}</span></button>`; }).join('')}</div></div>
</article>`).join('')).join('');
// Selects: the markup names frames as "chapter:n"; pictures and captions are filled from the roll data.
for (const b of $$('[data-ref]')) {
  const [ckey, n] = b.dataset.ref.split(':'), ri = ROLLS.findIndex(r => r.chapters.some(c => c.key === ckey)), c = ROLLS[ri].chapters.find(c => c.key === ckey), k = c.first + +n - 1, fr = ROLLS[ri].frames[k];
  b.dataset.r = ri; b.dataset.k = k; b.style.setProperty('--ar', `${fr.w} / ${fr.h}`);
  b.innerHTML = `<img src="${frameSrc(ri, k)}" alt="${fr.t} · ${fr.zh}" loading="lazy" width="${fr.w}" height="${fr.h}"><span class="cap"><b>${pad(k + 1)} · ${fr.t}</b><i>${fr.when || c.series}</i></span>`;
}
$('.after').addEventListener('click', ev => { const b = ev.target.closest('button[data-k]'); if (!b) return; const rr = (b.querySelector('img') || b).getBoundingClientRect(); openLightbox(+b.dataset.r, +b.dataset.k, {x: rr.left, y: rr.top, w: rr.width, h: rr.height}); });
// Figures from the data, so the copy cannot drift from the rolls.
const loaded = ROLLS.filter(r => !r.placeholder), allFrames = loaded.flatMap(r => r.frames);
for (const el of $$('[data-count]')) el.textContent = {rolls: N, loaded: loaded.length, empty: N - loaded.length, chapters: loaded.reduce((n, r) => n + r.chapters.length, 0), frames: allFrames.length, picks: allFrames.filter(f => f.pick).length}[el.dataset.count];
// Sections rise in once as they enter (the phone sheet scrolls inside .after, so it is the observer root there).
const io = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }, {root: MOBILE ? $('.after') : null, rootMargin: '0px 0px -8% 0px', threshold: .08});
$$('.reveal').forEach(el => io.observe(el));
// Phone: the site is a sheet over the stage (the stage does not scroll).
function toggleSheet(open, to) { state.sheet = open; $('.after').classList.toggle('open', open); $('.index-btn').setAttribute('aria-expanded', open); if (open) $('.after').scrollTop = to ? to.offsetTop - 60 : 0; }
$('.index-btn').addEventListener('click', () => toggleSheet(!state.sheet));
$('.sheet-close').addEventListener('click', () => toggleSheet(false));
if (MOBILE) $('.hint').innerHTML = '<span><kbd>上下滑</kbd>换卷</span><span><kbd>左右拖</kbd>拉片</span><span><kbd>点帧</kbd>放大</span>';
else if (PAGES) $('.hint').innerHTML = '<span><kbd>滚动</kbd>拉出胶片</span><span><kbd>横拖</kbd>也可以</span><span><kbd>页码</kbd>换卷</span>';
for (const a of $$('.nav a, .mark-link')) a.addEventListener('click', ev => {
  const t = $(a.getAttribute('href')); if (!t) return; ev.preventDefault();
  if (t === hero) { if (MOBILE) toggleSheet(false); else scrollTo({top: hero.offsetTop, behavior: behaviour(true)}); }
  else if (MOBILE) toggleSheet(true, t); else t.scrollIntoView({behavior: behaviour(true)});
});

// ---------- the home page in front, and entering from it ----------
// While the home page is up the stage does not render or scroll. Entering starts the stage a moment before the home
// page is torn open, so the cartridges are already there behind the tear, flying in.
const home = initHome({
  skip: params.get('home') === '0',
  onEnter() { state.home = false; root.classList.remove('at-home'); stage.classList.add('is-entered'); last = performance.now(); enter.to(1); resize(); },
  onReturn() { state.home = true; root.classList.add('at-home'); stage.classList.remove('is-entered'); enter.set(0); scrollTo({top: 0, behavior: 'instant'}); toggleSheet(false); },
});
$('.mark').addEventListener('click', ev => { ev.preventDefault(); home.show(); });

// ---------- boot ----------
(async () => {
  try {
    setTrack(); buildRail(ROLLS[0]);
    await Promise.race([Promise.all(LABEL_FONTS.map(f => document.fonts.load(f))), new Promise(r => setTimeout(r, 3000))]);
    await renderer.init();
    root.dataset.backend = renderer.backend.isWebGPUBackend ? 'webgpu' : 'webgl2';
    const loader = new THREE.TextureLoader();
    const strips = await Promise.all(ROLLS.map(r => r.placeholder ? null : loader.loadAsync(asset(`assets/frames/${r.key}-strip.jpg`)).then(t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; })));
    rolls = ROLLS.map((r, i) => buildRoll(r, i, strips[i]));
    resize();
    state.orb = state.orbTarget; orbit.set(state.orb);
    for (const r of rolls) updateFilm(r, 0);
    await renderer.compileAsync(scene, camera);
    state.ready = true; stage.classList.add('is-ready');
    requestAnimationFrame(frame);
  } catch (err) {
    console.error(err); stage.classList.add('is-error'); $('.loading').textContent = '图形初始化失败：' + (err.message || err);
  }
})();
window.__site = {state, get rolls() { return rolls; }, camera, renderer, openLightbox, frameRect, setPull, goRoll, stepRoll, anchor, centre, home, MOBILE, PAGES, REST, maxOf};
