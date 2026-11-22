// Seabed decor - port of 06_decor.gml. Everything is written into the chunk's decor mesh in world
// coordinates; all randomness comes from the item seed, so a chunk looks the same every time it is built.
import { rgb, merge, mul, WHITE } from '../mesh/builder.js';
import { terrainH } from './terrain.js';

const D = Math.PI / 180;
export const CORALS = [rgb(244, 112, 140), rgb(250, 146, 60), rgb(150, 92, 210), rgb(242, 212, 84), rgb(226, 64, 70), rgb(90, 200, 190)];

// decor types: 0 rock, 1 rock cluster, 2 branch coral, 3 dome coral, 4 sea fan, 5 anemone, 6 grass, 7 starfish,
// 8 urchin, 9 sponges, 10 shell, 11 amphora, 12 whale skeleton, 13 tube worms, 14 glow coral, 15 pebbles;
// 100 + v = kelp variant v (drawn separately, swaying)
export function pickDecor(bio, r) {
  switch (bio) {
    case 0:
      if (r < 0.05) return 0; if (r < 0.07) return 1; if (r < 0.24) return 6; if (r < 0.29) return 7;
      if (r < 0.35) return 10; if (r < 0.38) return 8; if (r < 0.46) return 15; if (r < 0.47) return 11;
      if (r < 0.51) return 102; if (r < 0.52) return 100; return -1;
    case 1:
      if (r < 0.08) return 0; if (r < 0.12) return 1; if (r < 0.29) return 2; if (r < 0.35) return 3;
      if (r < 0.41) return 4; if (r < 0.47) return 5; if (r < 0.52) return 9; if (r < 0.56) return 8;
      if (r < 0.59) return 7; if (r < 0.63) return 101; if (r < 0.66) return 15; if (r < 0.69) return 6; return -1;
    case 2:
      if (r < 0.05) return 0; if (r < 0.17) return 6; if (r < 0.41) return 100; if (r < 0.46) return 102;
      if (r < 0.49) return 8; if (r < 0.52) return 7; if (r < 0.54) return 1; if (r < 0.56) return 5; return -1;
    default:
      if (r < 0.08) return 0; if (r < 0.12) return 1; if (r < 0.17) return 13; if (r < 0.25) return 14;
      if (r < 0.31) return 15; if (r < 0.33) return 8; return -1;
  }
}

function rock(b, x, y, z, s, bio) {
  const R = b.rng;
  let col, top = null;
  switch (bio) {
    case 0: col = rgb(150, 142, 124); top = rgb(184, 168, 124); break;
    case 1: col = rgb(122, 116, 120); top = rgb(110, 132, 84); break;
    case 2: col = rgb(98, 102, 96); top = rgb(78, 112, 60); break;
    default: col = rgb(60, 60, 70);
  }
  col = mul(col, R.range(0.85, 1.12));
  b.place(x, y, z - s * 0.28, R.random(360), s, s * R.range(0.65, 1.15), s * R.range(0.45, 0.8));
  b.blob(0, 0, 0, 1, 1, 1, 3, 6, 0.28, col, top);
  b.tf = false;
  if (bio === 1 && R.next() < 0.5) b.octa(x + R.range(-0.4, 0.4) * s, y + R.range(-0.4, 0.4) * s, z + s * 0.25, s * 0.08, s * 0.08, s * 0.05, rgb(230, 220, 200));
}

function branch(b, x0, y0, z0, yw, pt, l, r, d, col) {
  const R = b.rng;
  const x1 = x0 + Math.cos(yw * D) * Math.cos(pt * D) * l, y1 = y0 + Math.sin(yw * D) * Math.cos(pt * D) * l, z1 = z0 + Math.sin(pt * D) * l;
  b.tube(x0, y0, z0, x1, y1, z1, r, r * 0.72, 4, col);
  if (d <= 0) { b.octa(x1, y1, z1, r * 1.2, r * 1.2, r * 1.4, merge(col, WHITE, 0.45)); return; }
  const n = 2 + R.irandom(1);
  for (let k = 0; k < n; k++)
    branch(b, x1, y1, z1, yw + R.range(-70, 70) + k * 120, Math.max(25, Math.min(88, pt + R.range(-30, 25))), l * R.range(0.6, 0.85), r * 0.72, d - 1, col);
}

function coral(b, x, y, z, s) {
  const R = b.rng, col = CORALS[R.irandom(CORALS.length - 1)], n = 2 + R.irandom(2);
  for (let k = 0; k < n; k++) branch(b, x + R.range(-4, 4) * s, y + R.range(-4, 4) * s, z - 2, R.random(360), R.range(60, 88), R.range(9, 16) * s, R.range(1.6, 2.6) * s, 2, col);
}

function dome(b, x, y, z, s0) {
  const R = b.rng, s = s0 * R.range(10, 22);
  const col = R.choose(rgb(210, 172, 112), rgb(150, 196, 120), rgb(220, 140, 150), rgb(170, 150, 210));
  b.place(x, y, z - s * 0.15, R.random(360), s, s * R.range(0.8, 1.1), s * R.range(0.5, 0.75));
  b.blob(0, 0, 0, 1, 1, 1, 3, 7, 0.1, mul(col, 0.85), merge(col, WHITE, 0.15));
  b.tf = false;
}

function fan(b, x, y, z, s) {
  const R = b.rng, yw = R.random(360) * D, c0 = Math.cos(yw), s0 = Math.sin(yw);
  const col = R.choose(rgb(170, 70, 190), rgb(220, 70, 80), rgb(240, 150, 60));
  const bx = x, by = y, bz = z - 1, n = 7;
  const tip = (k) => { const a = (-62 + k * 124 / (n - 1)) * D, l = s * (24 + 14 * Math.sin(k / (n - 1) * Math.PI)); return [bx + c0 * Math.sin(a) * l, by + s0 * Math.sin(a) * l, bz + Math.cos(a) * l]; };
  for (let k = 0; k < n; k++) {
    const t0 = tip(k);
    b.tube(bx, by, bz, t0[0], t0[1], t0[2], 0.9 * s, 0.4 * s, 3, mul(col, 0.8));
    if (k < n - 1) { const t1 = tip(k + 1); b.mode = 2; b.tri(bx, by, bz + 3 * s, t0[0], t0[1], t0[2], t1[0], t1[1], t1[2], col); }
  }
}

function anemone(b, x, y, z, s) {
  const R = b.rng;
  const col = R.choose(rgb(240, 110, 170), rgb(110, 220, 200), rgb(250, 170, 60), rgb(190, 120, 240));
  const tip = merge(col, WHITE, 0.55), r = 4 * s, h = 5 * s;
  b.tube(x, y, z - 1, x, y, z + h, r, r * 1.15, 6, mul(col, 0.7));
  for (let k = 0; k < 12; k++) {
    const a = k * 2 * Math.PI / 12 + R.random(0.3), ca = Math.cos(a), sa = Math.sin(a);
    const x0 = x + ca * r * 0.9, y0 = y + sa * r * 0.9, z0 = z + h;
    const x1 = x0 + ca * 3 * s, y1 = y0 + sa * 3 * s, z1 = z0 + 5 * s;
    const x2 = x1 + ca * 3.5 * s, y2 = y1 + sa * 3.5 * s, z2 = z1 + R.range(1, 4) * s;
    b.tube(x0, y0, z0, x1, y1, z1, 0.8 * s, 0.6 * s, 3, col);
    b.tube(x1, y1, z1, x2, y2, z2, 0.6 * s, 0, 3, tip);
  }
}

function grass(b, x, y, z, s, bio) {
  const R = b.rng, n = 5 + R.irandom(4);
  for (let k = 0; k < n; k++) {
    const a = R.random(2 * Math.PI), l = R.range(9, 26) * s;
    const bx = x + R.range(-5, 5) * s, by = y + R.range(-5, 5) * s;
    const tx = bx + Math.cos(a) * l * 0.35, ty = by + Math.sin(a) * l * 0.35, tz = z + l, w = 1.4 * s;
    const col = bio === 0 ? merge(rgb(110, 150, 60), rgb(170, 170, 80), R.next()) : merge(rgb(50, 120, 50), rgb(120, 180, 70), R.next());
    b.mode = 2;
    b.tri(bx - w * Math.sin(a), by + w * Math.cos(a), z - 1, bx + w * Math.sin(a), by - w * Math.cos(a), z - 1, tx, ty, tz, col);
  }
}

function star(b, x, y, z0, s0) {
  const R = b.rng, s = s0 * R.range(5, 9);
  const col = R.choose(rgb(240, 110, 50), rgb(220, 50, 60), rgb(150, 80, 200), rgb(250, 190, 60));
  const z = z0 + 0.8, r = R.random(2 * Math.PI);
  b.mode = 1;
  for (let k = 0; k < 5; k++) {
    const a = r + k * 2 * Math.PI / 5;
    b.tri(x, y, z + s * 0.25, x + Math.cos(a - 0.6) * s * 0.32, y + Math.sin(a - 0.6) * s * 0.32, z, x + Math.cos(a) * s, y + Math.sin(a) * s, z, col);
    b.tri(x, y, z + s * 0.25, x + Math.cos(a + 0.6) * s * 0.32, y + Math.sin(a + 0.6) * s * 0.32, z, x + Math.cos(a) * s, y + Math.sin(a) * s, z, mul(col, 0.85));
  }
}

function urchin(b, x, y, z, s0, bio) {
  const R = b.rng, s = s0 * R.range(3.5, 6);
  const col = bio === 3 ? rgb(70, 40, 70) : rgb(60, 30, 80);
  b.place(x, y, z + s * 0.6, 0, s, s, s * 0.8);
  b.blob(0, 0, 0, 1, 1, 1, 2, 5, 0.1, col, null);
  b.tf = false;
  for (let k = 0; k < 12; k++) {
    const a = R.random(2 * Math.PI), e = R.range(-0.2, 1.3), r = s * R.range(1.8, 2.6);
    b.tube(x, y, z + s * 0.6, x + Math.cos(a) * Math.cos(e) * r, y + Math.sin(a) * Math.cos(e) * r, z + s * 0.6 + Math.sin(e) * r, s * 0.14, 0, 3, rgb(40, 20, 50));
  }
}

function sponge(b, x, y, z, s) {
  const R = b.rng;
  const col = R.choose(rgb(240, 200, 60), rgb(240, 120, 40), rgb(160, 90, 200), rgb(200, 80, 90));
  const n = 2 + R.irandom(2);
  for (let k = 0; k < n; k++) {
    const px = x + R.range(-7, 7) * s, py = y + R.range(-7, 7) * s, h = R.range(10, 26) * s, r = R.range(2.6, 4.6) * s;
    b.tube(px, py, z - 2, px + R.range(-3, 3), py + R.range(-3, 3), z + h, r * 0.85, r, 6, mul(col, R.range(0.85, 1.1)));
    b.tube(px, py, z + h - 0.5, px, py, z + h - 4 * s, r * 0.8, r * 0.5, 6, rgb(40, 24, 30));
  }
}

function shell(b, x, y, z0, s0) {
  const R = b.rng, s = s0 * R.range(3, 5);
  const col = R.choose(rgb(240, 220, 200), rgb(240, 180, 170), rgb(230, 200, 150));
  const z = z0 + 0.5, a0 = R.random(2 * Math.PI);
  b.mode = 1;
  for (let k = 0; k < 5; k++) {
    const a = a0 - 1.1 + k * 0.55;
    b.tri(x, y, z, x + Math.cos(a) * s, y + Math.sin(a) * s, z + s * 0.35, x + Math.cos(a + 0.55) * s, y + Math.sin(a + 0.55) * s, z + s * 0.35, mul(col, 0.9 + (k % 2) * 0.15));
  }
}

const AMPH = [1.5, 4.2, 5.4, 4.8, 3, 1.4, 1.9];
function amphora(b, x, y, z, s0) {
  const R = b.rng, s = s0 * R.range(0.9, 1.3), a = R.random(360) * D, dx = Math.cos(a), dy = Math.sin(a), dz = 0.25;
  const col = rgb(178, 98, 58), pz = z + 3.5 * s;
  for (let i = 0; i < 6; i++) {
    const t0 = i * 4 * s, t1 = (i + 1) * 4 * s;
    b.tube(x + dx * t0, y + dy * t0, pz + dz * t0, x + dx * t1, y + dy * t1, pz + dz * t1, AMPH[i] * s, AMPH[i + 1] * s, 6, mul(col, 0.9 + 0.1 * (i % 2)));
  }
  b.tube(x + dx * 19 * s, y + dy * 19 * s, pz + dz * 19 * s + 1.5 * s, x + dx * 13 * s, y + dy * 13 * s, pz + dz * 13 * s + 4.5 * s, 0.7 * s, 0.7 * s, 3, mul(col, 0.8));
}

function skeleton(b, x, y, z, s, yawDeg) {
  const a = yawDeg * D, dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx, col = rgb(216, 210, 190);
  for (let i = 0; i < 18; i++) {
    const px = x + dx * (i - 9) * 18 * s, py = y + dy * (i - 9) * 18 * s, h = terrainH(px, py);
    let pz = h + (22 - Math.abs(i - 6) * 1.2) * s * (i < 14 ? 1 : 0);
    if (i >= 14) pz = h + 6 * s;
    b.octa(px, py, pz, 7 * s, 5 * s, 5 * s, col);
    if (i >= 3 && i <= 12)
      for (let side = -1; side <= 1; side += 2) {
        let rx = px, ry = py, rz = pz;
        for (let k = 1; k <= 3; k++) {
          const f = (14 + k * 10) * s * (1 - (k === 3 ? 0.15 : 0));
          const qx = px + nx * side * f, qy = py + ny * side * f;
          const qz = k === 3 ? terrainH(qx, qy) + 2 : pz - k * k * 4.2 * s + 8 * s;
          b.tube(rx, ry, rz, qx, qy, qz, 2.4 * s, 1.8 * s, 4, mul(col, 0.95));
          rx = qx; ry = qy; rz = qz;
        }
      }
  }
  const px = x - dx * 11 * 18 * s, py = y - dy * 11 * 18 * s, h = terrainH(px, py);
  b.place(px, py, h + 8 * s, yawDeg, 34 * s, 18 * s, 14 * s);
  b.blob(0, 0, 0, 1, 1, 1, 3, 6, 0.12, col, null);
  b.tf = false;
  for (const sd of [1, -1])
    b.tube(px - dx * 10 * s + sd * nx * 8 * s, py - dy * 10 * s + sd * ny * 8 * s, h + 3, px - dx * 80 * s + sd * nx * 4 * s, py - dy * 80 * s + sd * ny * 4 * s, h + 2, 3 * s, 2 * s, 4, mul(col, 0.9));
}

function worms(b, x, y, z, s, glows) {
  const R = b.rng, n = 5 + R.irandom(5);
  for (let k = 0; k < n; k++) {
    const px = x + R.range(-9, 9) * s, py = y + R.range(-9, 9) * s, h = R.range(12, 34) * s;
    b.tube(px, py, z - 2, px + R.range(-2, 2), py + R.range(-2, 2), z + h, 1.5 * s, 1.2 * s, 4, rgb(225, 220, 205));
    b.octa(px, py, z + h + 1.5 * s, 2.4 * s, 2.4 * s, 3 * s, rgb(250, 60, 60));
  }
  glows.push(x, y, z + 20 * s, 255, 80, 60, 26 * s, R.random(6.28));
}

function glowCoral(b, x, y, z, s, glows) {
  const R = b.rng, n = 3 + R.irandom(3);
  const col = R.choose(rgb(60, 230, 255), rgb(120, 140, 255), rgb(80, 255, 180));
  for (let k = 0; k < n; k++) {
    const a = R.random(2 * Math.PI), h = R.range(14, 30) * s;
    const px = x + R.range(-4, 4) * s, py = y + R.range(-4, 4) * s;
    const tx = px + Math.cos(a) * h * 0.3, ty = py + Math.sin(a) * h * 0.3, tz = z + h;
    b.tube(px, py, z - 1, tx, ty, tz, 1.2 * s, 0.6 * s, 3, rgb(70, 80, 100));
    b.world = false; b.jit = 0;              // tips are not darkened by depth: they glow
    b.octa(tx, ty, tz, 2 * s, 2 * s, 2.4 * s, col);
    b.world = true; b.jit = 0.08;
    glows.push(tx, ty, tz, col[0], col[1], col[2], 16 * s, R.random(6.28));
  }
}

function pebbles(b, x, y, z, s, bio) {
  const R = b.rng, n = 4 + R.irandom(4);
  for (let k = 0; k < n; k++) {
    const r = R.range(2.5, 6) * s;
    const col = bio === 3 ? rgb(70, 70, 80) : merge(rgb(170, 160, 140), rgb(120, 115, 110), R.next());
    b.place(x + R.range(-14, 14) * s, y + R.range(-14, 14) * s, z, R.random(360), r, r * R.range(0.7, 1), r * 0.55);
    b.blob(0, 0, 0, 1, 1, 1, 2, 5, 0.15, col, null);
  }
  b.tf = false;
}

// writes one decor item; glows: flat array (x, y, z, r, g, b, size, phase) collected for the chunk
export function buildItem(b, it, glows) {
  const { t, x, y, z, s, bio } = it;
  const R = b.rng;
  b.jit = 0.08; b.world = true; b.mode = 0;
  switch (t) {
    case 0: rock(b, x, y, z, R.range(12, 46) * s, bio); if (R.next() < 0.12) rock(b, x, y, z, R.range(60, 95), bio); break;
    case 1: rock(b, x, y, z, R.range(18, 36) * s, bio);
      rock(b, x + R.range(-30, 30), y + R.range(-30, 30), z, R.range(8, 22) * s, bio);
      rock(b, x + R.range(-30, 30), y + R.range(-30, 30), z, R.range(6, 16) * s, bio); break;
    case 2: coral(b, x, y, z, s); break;
    case 3: dome(b, x, y, z, s); break;
    case 4: fan(b, x, y, z, s); break;
    case 5: anemone(b, x, y, z, s); break;
    case 6: grass(b, x, y, z, s, bio); break;
    case 7: star(b, x, y, z, s); break;
    case 8: urchin(b, x, y, z, s, bio); break;
    case 9: sponge(b, x, y, z, s); break;
    case 10: shell(b, x, y, z, s); break;
    case 11: amphora(b, x, y, z, s); break;
    case 12: skeleton(b, x, y, z, s, it.r); break;
    case 13: worms(b, x, y, z, s, glows); break;
    case 14: glowCoral(b, x, y, z, s, glows); break;
    case 15: pebbles(b, x, y, z, s, bio); break;
  }
  b.tf = false;
}
