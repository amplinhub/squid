// World constants, noise, seabed height and biomes - a 1:1 port of the Game Maker original (00_core.gml).
// Game units and axes are the original ones: x, y horizontal, z up, 5 units = 1 m, water surface at z = 1000.
// Rendering maps them to three.js as (x, z, y), see gm2three.
export const SURF_Z = 1000;   // water surface height
export const CS = 512;        // chunk size
export const CN = 8;          // terrain cells per chunk side
export const UNITS_PER_M = 5;

let seed = 0;
export function setWorldSeed(s) { seed = s; }
export const worldSeed = () => seed;

const frac = (v) => v - Math.floor(v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export function smoothstep(e0, e1, x) { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }

// hash2(ix, iy) - deterministic pseudo random 0..1 (the world seed changes the whole world)
export function hash2(a, b) { return frac(Math.sin(a * 127.1 + b * 311.7 + seed * 0.0137) * 43758.5453); }

// vnoise(x, y) - smooth value noise 0..1
export function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
}

// seabed height: continental shelf (reefs ~ +450) down to the abyss (~ -1300)
export function terrainH(x, y) {
  const c = vnoise(x / 5200, y / 5200) * 0.65 + vnoise(x / 2300 + 17.3, y / 2300 + 5.1) * 0.35;
  const base = lerp(-1300, 470, smoothstep(0.36, 0.60, c));
  return base + (vnoise(x / 700 + 3.7, y / 700 + 9.2) - 0.5) * 240 + (vnoise(x / 230 + 31.1, y / 230 + 7.7) - 0.5) * 80;
}

// 0 sand flats, 1 reef / rocks, 2 kelp forest, 3 abyss
export function biomeAt(x, y, h) {
  if (h < -420) return 3;
  const b = vnoise(x / 1700 + 50.5, y / 1700 + 80.5);
  if (b < 0.40) return 0;
  if (b < 0.62) return 1;
  return 2;
}

// 0 at the surface .. 1 in the abyss
export const depthT = (z) => clamp((SURF_Z - z) / 2300, 0, 1);
export const depthM = (z) => (SURF_Z - z) / UNITS_PER_M;

// seeded generator (replaces GM random_set_seed + random)
export function makeRng(s) {
  let a = (Math.floor(s) >>> 0) || 1;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    random: (n) => next() * n,
    range: (lo, hi) => lo + next() * (hi - lo),
    irandom: (n) => Math.floor(next() * (n + 1)),
    choose: (...v) => v[Math.floor(next() * v.length)],
  };
}

// shallow, lit place (reef or kelp) near the origin, like scr_find_spawn
export function findSpawn() {
  let best = -1, bx = 0, by = 0, hx = -99999, hxx = 0, hxy = 0;
  for (let k = 0; k < 1500; k++) {
    const a = k * 2.39996, r = Math.sqrt(k) * 400;
    const px = Math.cos(a) * r, py = Math.sin(a) * r;
    const h = terrainH(px, py);
    if (h > hx) { hx = h; hxx = px; hxy = py; }
    if (h < 150 || h > 600) continue;
    const b = biomeAt(px, py, h);
    if (b === 1 || b === 2) { bx = px; by = py; best = k; break; }
    if (best < 0) { bx = px; by = py; best = k; }
  }
  if (best < 0) { bx = hxx; by = hxy; }
  return { x: bx, y: by };
}
