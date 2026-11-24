// Ported from Overture 1.3 (src/dynamics.js, src/film.js): the same spring presets, closed-form solver and rubber band.
export const PRESETS = {
  snap: {stiffness: 600, damping: 36, mass: 1},    // controls, needles · ~300 ms
  settle: {stiffness: 120, damping: 20, mass: 1},  // prints, film, overlays · ~530 ms
  stage: {stiffness: 52, damping: 13.2, mass: 1},  // camera moves · ~790 ms
  detent: {stiffness: 64, damping: 11.2, mass: 1},  // the orbit indexing onto the next roll · ~4.6 % overshoot, ~0.9 s
};

// Closed-form damped oscillator: displacement from the target and velocity after t seconds.
export function solve(p, x0, v0, t) {
  const m = p.mass || 1, w0 = Math.sqrt(p.stiffness / m), z = p.damping / (2 * Math.sqrt(p.stiffness * m));
  if (z < 1 - 1e-6) { const wd = w0 * Math.sqrt(1 - z * z), a = z * w0, e = Math.exp(-a * t), B = (v0 + a * x0) / wd, cs = Math.cos(wd * t), sn = Math.sin(wd * t); return [e * (x0 * cs + B * sn), e * ((B * wd - a * x0) * cs - (a * B + x0 * wd) * sn)]; }
  if (z <= 1 + 1e-6) { const e = Math.exp(-w0 * t), B = v0 + w0 * x0; return [e * (x0 + B * t), e * (B - w0 * (x0 + B * t))]; }
  const s = Math.sqrt(z * z - 1), r1 = -w0 * (z - s), r2 = -w0 * (z + s), c2 = (v0 - r1 * x0) / (r2 - r1), c1 = x0 - c2, e1 = Math.exp(r1 * t), e2 = Math.exp(r2 * t);
  return [c1 * e1 + c2 * e2, c1 * r1 * e1 + c2 * r2 * e2];
}

// A scalar spring stepped exactly by the solver each frame. `free` = held by the hand (no spring force).
export class Spring {
  constructor(value = 0, preset = 'settle') { this.value = value; this.target = value; this.velocity = 0; this.p = PRESETS[preset]; this.free = false; }
  to(target, {velocity, preset} = {}) { this.target = target; if (velocity !== undefined) this.velocity = velocity; if (preset) this.p = PRESETS[preset]; this.free = false; return this; }
  set(v) { this.value = this.target = v; this.velocity = 0; return this; }
  step(dt, instant = false) {
    if (this.free) return this.value;
    if (instant) { this.value = this.target; this.velocity = 0; return this.value; }
    const [x, v] = solve(this.p, this.value - this.target, this.velocity, dt);
    this.value = this.target + x; this.velocity = v;
    if (Math.abs(x) < 1e-4 && Math.abs(v) < 1e-3) { this.value = this.target; this.velocity = 0; }
    return this.value;
  }
  get moving() { return this.value !== this.target || this.velocity !== 0; }
}

// Rubber band past either end (reach in the same units as x), and its inverse for resuming a drag.
export const rubber = (x, min, max, reach, k = .55) => { const over = d => (1 - 1 / (d * k / reach + 1)) * reach; return x < min ? min - over(min - x) : x > max ? max + over(x - max) : x; };
export const unrubber = (x, min, max, reach, k = .55) => { const back = o => (1 / (1 - Math.min(.999, o / reach)) - 1) * reach / k; return x < min ? min - back(min - x) : x > max ? max + back(x - max) : x; };
export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const damp = (dt, rate) => 1 - Math.exp(-dt * rate);

// CSS linear() easing that follows a preset (Overture's cssEasing), and its settle time in ms.
export function settleTime(p, eps = .005) { let last = 0; for (let t = 0; t < 8; t += .002) { const [x, v] = solve(p, -1, 0, t); if (Math.abs(x) > eps || Math.abs(v) > eps * 10) last = t; } return Math.ceil(last * 100 - 1e-9) / 100; }
export function cssEasing(name, points = 28) { const p = PRESETS[name], T = settleTime(p), out = []; for (let i = 0; i <= points; i++) out.push(i === points ? 1 : +(1 + solve(p, -1, 0, T * i / points)[0]).toFixed(3)); return {easing: `linear(${out.join(', ')})`, duration: Math.round(T * 1000)}; }
