// Creature meshes - port of 03_species.gml (lofted fish, shrimp, jellyfish, manta), 15_species2.gml
// (species details, inflated pufferfish, seahorse, turtle), 24_diver.gml and 28_crab.gml.
// Model space as in the original: +x forward (nose), +y side, +z up, length 1, centred at the origin.
// One call writes one animation frame at phase ph (0..2pi) into a MeshBuilder.
import { rgb, merge, mul, WHITE } from '../mesh/builder.js';
import { hash2, lerp, smoothstep } from '../world/terrain.js';

const PI = Math.PI;
const GRAY = rgb(128, 128, 128), SILVER = rgb(192, 192, 192);

// ---------------------------------------------------------------- fish body plans (scr_fishdef)
function fishdef(t) {
  const d = {
    fs: [], axis: 0, amp: 0.09, wave: 4.4, K: 6, tail: 0, fl: 0.16, fh: 0.11, lf: 0.85,
    dors: 1, d0: 0.42, d1: 0.62, dh: 0.06, dors2: 0, pec: 0.74, pl: 0.08, pw: 0.03,
    eye: 0.88, er: 0.018, eyec: rgb(18, 18, 24), ring: rgb(200, 200, 205),
    jaw0: 0.86, jaw: 0.05, teeth: 0, tip: 1.0, tipz: 0,
    back: GRAY, belly: WHITE, mid: SILVER, fin: GRAY, pat: 0, jit: 0.07, eel: 0, type: t,
  };
  const S = (...rows) => { d.fs = rows.map((r) => ({ x: r[0], w: r[1], ht: r[2], hb: r[3], zc: r[4] })); };
  switch (t) {
    case 0: // sardine
      S([0, 0.010, 0.018, 0.018, 0], [0.12, 0.022, 0.040, 0.034, 0], [0.36, 0.048, 0.085, 0.074, 0], [0.62, 0.054, 0.094, 0.080, 0], [0.82, 0.047, 0.078, 0.066, 0], [0.94, 0.026, 0.044, 0.038, -0.005]);
      Object.assign(d, { back: rgb(40, 86, 150), belly: rgb(226, 234, 242), mid: rgb(150, 190, 210), fin: rgb(150, 175, 195), dh: 0.05, ring: rgb(215, 220, 225) });
      break;
    case 2: // butterfly fish: tall disc
      S([0, 0.010, 0.030, 0.030, 0], [0.14, 0.020, 0.090, 0.085, 0], [0.34, 0.040, 0.260, 0.220, 0], [0.60, 0.045, 0.290, 0.250, 0], [0.80, 0.036, 0.190, 0.160, -0.01], [0.93, 0.020, 0.060, 0.050, -0.03]);
      Object.assign(d, { amp: 0.05, tip: 1.02, tipz: -0.035, K: 6, back: rgb(250, 205, 40), belly: rgb(250, 236, 150), mid: rgb(255, 220, 80), fin: rgb(245, 180, 30), pat: 2, d0: 0.15, d1: 0.7, dh: 0.13, fl: 0.13, fh: 0.14, tail: 1, eye: 0.84, er: 0.028 });
      break;
    case 3: // mackerel
      S([0, 0.010, 0.016, 0.016, 0], [0.12, 0.020, 0.032, 0.030, 0], [0.36, 0.058, 0.082, 0.074, 0], [0.62, 0.066, 0.090, 0.082, 0], [0.82, 0.058, 0.076, 0.070, 0], [0.95, 0.030, 0.038, 0.036, -0.004]);
      Object.assign(d, { back: rgb(40, 120, 110), belly: rgb(230, 236, 236), mid: rgb(140, 190, 180), fin: rgb(70, 110, 100), pat: 1, fl: 0.18, fh: 0.12, dors2: 1 });
      break;
    case 4: // grouper
      S([0, 0.020, 0.050, 0.050, 0], [0.15, 0.050, 0.090, 0.090, 0], [0.40, 0.130, 0.170, 0.160, 0], [0.66, 0.140, 0.180, 0.170, 0], [0.86, 0.120, 0.150, 0.150, -0.01], [0.97, 0.070, 0.080, 0.100, -0.02]);
      Object.assign(d, { amp: 0.07, tip: 1.0, tipz: -0.03, K: 7, back: rgb(112, 86, 58), belly: rgb(196, 168, 128), mid: rgb(150, 120, 86), fin: rgb(92, 70, 48), pat: 3, tail: 1, fl: 0.14, fh: 0.12,
        d0: 0.3, d1: 0.72, dh: 0.09, pl: 0.12, pw: 0.05, jaw0: 0.78, jaw: 0.13, eye: 0.86, er: 0.025, jit: 0.1 });
      break;
    case 5: // barracuda
      S([0, 0.010, 0.020, 0.020, 0], [0.15, 0.024, 0.038, 0.034, 0], [0.40, 0.044, 0.058, 0.054, 0], [0.70, 0.044, 0.058, 0.054, 0], [0.88, 0.032, 0.040, 0.038, 0], [0.97, 0.012, 0.016, 0.016, -0.004]);
      Object.assign(d, { amp: 0.07, wave: 3.8, tip: 1.0, back: rgb(70, 92, 104), belly: rgb(214, 222, 228), mid: rgb(160, 176, 186), fin: rgb(80, 96, 104), pat: 4, dors2: 1, d0: 0.42, d1: 0.52, dh: 0.05,
        fl: 0.15, fh: 0.1, jaw0: 0.8, jaw: 0.07, teeth: 1, er: 0.012 });
      break;
    case 6: // shark
      S([0, 0.012, 0.030, 0.026, 0.010], [0.14, 0.030, 0.050, 0.040, 0.004], [0.35, 0.076, 0.100, 0.086, 0], [0.58, 0.090, 0.110, 0.096, 0], [0.78, 0.076, 0.090, 0.076, 0], [0.92, 0.046, 0.054, 0.046, 0.008]);
      Object.assign(d, { amp: 0.075, wave: 3.6, tip: 1.0, tipz: 0.012, K: 7, back: rgb(98, 112, 126), belly: rgb(226, 230, 232), mid: rgb(140, 152, 164), fin: rgb(88, 100, 114), pat: 5, tail: 2, fl: 0.22, fh: 0.2,
        d0: 0.5, d1: 0.64, dh: 0.16, dors2: 1, pec: 0.7, pl: 0.2, pw: 0.12, jaw0: 0.8, jaw: 0.09, teeth: 1, eye: 0.9, er: 0.011, ring: rgb(40, 40, 45) });
      break;
    case 8: // sperm whale: vertical swim
      S([0, 0.020, 0.020, 0.020, 0], [0.12, 0.040, 0.050, 0.040, 0], [0.30, 0.080, 0.090, 0.080, 0], [0.50, 0.110, 0.120, 0.110, 0], [0.66, 0.120, 0.130, 0.120, 0.005], [0.82, 0.120, 0.135, 0.125, 0.01], [0.96, 0.112, 0.130, 0.118, 0.012], [1.00, 0.095, 0.115, 0.100, 0.014]);
      Object.assign(d, { axis: 1, amp: 0.05, wave: 3.2, tip: 1.015, tipz: 0.02, K: 6, back: rgb(70, 72, 82), belly: rgb(104, 104, 112), mid: rgb(84, 86, 96), fin: rgb(62, 64, 72), pat: 6, tail: 3, fl: 0.12, fh: 0.17,
        dors: 1, d0: 0.3, d1: 0.4, dh: 0.035, pec: 0.62, pl: 0.07, pw: 0.06, jaw0: 0.6, jaw: 0.0, teeth: 1, eye: 0.66, er: 0.01, jit: 0.12, ring: rgb(50, 50, 56) });
      break;
    case 11: // pufferfish (deflated)
      S([0, 0.020, 0.040, 0.040, 0], [0.12, 0.050, 0.090, 0.080, 0], [0.35, 0.170, 0.200, 0.190, 0], [0.60, 0.200, 0.220, 0.210, 0], [0.82, 0.160, 0.170, 0.160, 0], [0.95, 0.080, 0.080, 0.080, -0.01]);
      Object.assign(d, { amp: 0.05, K: 7, tip: 1.0, back: rgb(150, 132, 72), belly: rgb(236, 232, 214), mid: rgb(196, 176, 112), fin: rgb(200, 170, 90), pat: 8, tail: 1, fl: 0.12, fh: 0.1,
        d0: 0.22, d1: 0.3, dh: 0.07, eye: 0.84, er: 0.034, ring: rgb(235, 205, 60), pl: 0.07, pw: 0.05 });
      break;
    case 12: // clownfish
      S([0, 0.010, 0.050, 0.050, 0], [0.15, 0.030, 0.110, 0.100, 0], [0.38, 0.070, 0.200, 0.180, 0], [0.62, 0.075, 0.210, 0.190, 0], [0.84, 0.060, 0.150, 0.130, -0.01], [0.95, 0.030, 0.060, 0.060, -0.02]);
      Object.assign(d, { amp: 0.06, K: 6, back: rgb(250, 116, 18), belly: rgb(252, 150, 50), mid: rgb(252, 130, 30), fin: rgb(245, 110, 20), pat: 7, tail: 1, fl: 0.13, fh: 0.13, d0: 0.25, d1: 0.72, dh: 0.11, eye: 0.86, er: 0.026 });
      break;
    case 14: // anglerfish
      S([0, 0.020, 0.030, 0.030, 0], [0.15, 0.050, 0.070, 0.060, 0], [0.35, 0.130, 0.150, 0.140, 0], [0.60, 0.200, 0.220, 0.220, 0], [0.80, 0.220, 0.220, 0.240, 0], [0.95, 0.200, 0.200, 0.220, 0.01]);
      Object.assign(d, { amp: 0.06, K: 7, tip: 1.02, tipz: 0.03, back: rgb(54, 42, 44), belly: rgb(78, 62, 62), mid: rgb(64, 50, 52), fin: rgb(46, 36, 38), pat: 10, tail: 1, fl: 0.12, fh: 0.1,
        d0: 0.3, d1: 0.4, dh: 0.05, jaw0: 0.6, jaw: 0.12, teeth: 1, eye: 0.86, er: 0.013, ring: rgb(40, 40, 40), jit: 0.12 });
      break;
    case 15: // viperfish
      S([0, 0.008, 0.020, 0.020, 0], [0.15, 0.020, 0.040, 0.035, 0], [0.40, 0.035, 0.060, 0.055, 0], [0.70, 0.035, 0.065, 0.060, 0], [0.88, 0.030, 0.060, 0.060, 0], [0.97, 0.020, 0.035, 0.040, -0.005]);
      Object.assign(d, { amp: 0.08, K: 6, back: rgb(24, 30, 46), belly: rgb(44, 48, 70), mid: rgb(34, 40, 60), fin: rgb(30, 34, 50), pat: 11, fl: 0.12, fh: 0.08,
        d0: 0.76, d1: 0.8, dh: 0.07, jaw0: 0.84, jaw: 0.08, teeth: 1, eye: 0.92, er: 0.017, ring: rgb(140, 150, 170) });
      break;
    case 16: // lanternfish
      S([0, 0.010, 0.020, 0.020, 0], [0.12, 0.024, 0.045, 0.040, 0], [0.36, 0.050, 0.090, 0.080, 0], [0.62, 0.056, 0.100, 0.090, 0], [0.82, 0.052, 0.090, 0.085, 0], [0.95, 0.032, 0.055, 0.050, -0.005]);
      Object.assign(d, { back: rgb(36, 56, 92), belly: rgb(150, 160, 182), mid: rgb(90, 110, 140), fin: rgb(60, 80, 110), pat: 12, eye: 0.86, er: 0.03, ring: rgb(190, 200, 220) });
      break;
    case 17: // moray eel
      S([0, 0.010, 0.025, 0.020, 0], [0.12, 0.022, 0.040, 0.035, 0], [0.25, 0.030, 0.045, 0.042, 0], [0.40, 0.034, 0.048, 0.045, 0], [0.55, 0.036, 0.050, 0.047, 0], [0.70, 0.037, 0.051, 0.048, 0], [0.82, 0.036, 0.050, 0.048, 0], [0.92, 0.030, 0.042, 0.042, 0.002], [0.98, 0.018, 0.022, 0.024, 0.002]);
      Object.assign(d, { eel: 1, amp: 0.05, wave: 11, K: 6, tail: 5, back: rgb(96, 112, 46), belly: rgb(150, 160, 86), mid: rgb(120, 136, 62), fin: rgb(90, 104, 42), pat: 9, dors: 0,
        jaw0: 0.86, jaw: 0.05, teeth: 1, eye: 0.94, er: 0.012, ring: rgb(230, 210, 60), pec: 0.85, pl: 0.02, pw: 0.01 });
      break;
    case 18: // ocean sunfish
      S([0, 0.030, 0.220, 0.220, 0], [0.10, 0.050, 0.300, 0.300, 0], [0.40, 0.080, 0.340, 0.340, 0], [0.70, 0.075, 0.300, 0.300, 0], [0.90, 0.050, 0.180, 0.180, 0], [0.98, 0.030, 0.060, 0.070, -0.01]);
      Object.assign(d, { amp: 0.015, K: 7, back: rgb(118, 128, 140), belly: rgb(204, 208, 214), mid: rgb(160, 168, 178), fin: rgb(110, 118, 130), pat: 13, tail: 1, fl: 0.07, fh: 0.26, dors: 0, eye: 0.86, er: 0.02, pl: 0.05, pw: 0.03 });
      break;
  }
  return d;
}

function fsEval(d, xn) {
  xn = Math.max(0, Math.min(1, xn));
  const f = d.fs, n = f.length;
  let i = 0;
  for (; i < n - 1; i++) if (xn <= f[i + 1].x) break;
  i = Math.min(i, n - 2);
  const t = Math.max(0, Math.min(1, (xn - f[i].x) / Math.max(0.0001, f[i + 1].x - f[i].x)));
  return { w: lerp(f[i].w, f[i + 1].w, t), ht: lerp(f[i].ht, f[i + 1].ht, t), hb: lerp(f[i].hb, f[i + 1].hb, t), zc: lerp(f[i].zc, f[i + 1].zc, t) };
}
function fsOff(d, xn) {
  const s = 1 - xn;
  if (d.eel) return d.amp * (0.35 + 0.65 * s) * Math.sin(d.ph - s * d.wave);
  return d.amp * (0.06 + s * s) * Math.sin(d.ph - s * d.wave);
}

function fishColor(d, xn, zr, i, k) {
  let c = merge(d.belly, d.back, smoothstep(-0.25, 0.45, zr));
  if (Math.abs(zr) < 0.18) c = merge(c, d.mid, 0.5);
  const h = hash2(i * 7 + 3, k * 13 + d.type);
  const fr = (v) => v - Math.floor(v);
  switch (d.pat) {
    case 1: if (zr > 0.05 && fr(xn * 9 + zr * 2.5) < 0.38) c = mul(c, 0.45); break;
    case 2:
      if (xn > 0.79 && xn < 0.88) c = rgb(25, 22, 30);
      else if (xn < 0.2) c = rgb(240, 150, 30);
      else if (xn > 0.42 && xn < 0.5) c = rgb(250, 250, 240);
      break;
    case 3: if (h < 0.3) c = mul(c, 0.6); else if (h > 0.9) c = mul(c, 1.25); break;
    case 4: if (zr > -0.1 && fr(xn * 8) < 0.22 && xn < 0.85) c = mul(c, 0.55); break;
    case 5: if (zr < -0.12) c = d.belly; break;
    case 7:
      if (Math.abs(xn - 0.81) < 0.035 || Math.abs(xn - 0.5) < 0.045 || Math.abs(xn - 0.13) < 0.03) c = rgb(250, 250, 246);
      else if (Math.abs(xn - 0.81) < 0.055 || Math.abs(xn - 0.5) < 0.065 || Math.abs(xn - 0.13) < 0.048) c = rgb(20, 16, 18);
      break;
    case 8: if (zr > 0.1 && h < 0.35) c = rgb(70, 60, 40); break;
    case 9: if (h < 0.42) c = merge(c, rgb(30, 40, 14), 0.75); else if (h > 0.9) c = mul(c, 1.2); break;
    case 10: if (h < 0.3) c = mul(c, 0.7); else if (h > 0.85) c = mul(c, 1.3); break;
    case 11: if (h < 0.2) c = rgb(44, 60, 96); break;
    case 12: if (Math.abs(zr) < 0.3) c = merge(c, rgb(200, 210, 230), 0.4); break;
    case 13: if (h < 0.3) c = mul(c, 1.15); else if (h > 0.85) c = mul(c, 0.85); break;
    case 6: if (h < 0.12) c = rgb(150, 148, 150); if (xn > 0.95 || (zr < -0.3 && xn > 0.6)) c = rgb(150, 150, 156); break;
  }
  return c;
}

function finDorsal(b, d, a0, a1, h) {
  const m = a0 + (a1 - a0) * 0.35;
  let e = fsEval(d, a0); const za = e.zc + e.ht, oa = fsOff(d, a0);
  e = fsEval(d, a1); const zb = e.zc + e.ht, ob = fsOff(d, a1);
  e = fsEval(d, m); const zm = e.zc + e.ht + h, om = fsOff(d, m - 0.08);
  b.mode = 2;
  if (d.axis === 0) b.tri(a0 - 0.5, oa, za - 0.004, a1 - 0.5, ob, zb - 0.004, m - 0.5 - 0.06, om, zm, d.fin);
  else b.tri(a0 - 0.5, 0, za + oa - 0.004, a1 - 0.5, 0, zb + ob - 0.004, m - 0.5 - 0.06, 0, zm + om, d.fin);
}
function finVentral(b, d, a0, a1, h) {
  const m = a0 + (a1 - a0) * 0.3;
  let e = fsEval(d, a0); const za = e.zc - e.hb, oa = fsOff(d, a0);
  e = fsEval(d, a1); const zb = e.zc - e.hb, ob = fsOff(d, a1);
  e = fsEval(d, m); const zm = e.zc - e.hb - h, om = fsOff(d, m);
  b.mode = 2;
  if (d.axis === 0) b.tri(a0 - 0.5, oa, za + 0.004, a1 - 0.5, ob, zb + 0.004, m - 0.5 - 0.04, om, zm, mul(d.fin, 0.9));
}
function whaleJaw(b, open) {
  const x0 = 0.58 - 0.5, x1 = 0.99 - 0.5;
  const e = fsEval(whaleJaw.d, 0.8);
  const z0 = e.zc - e.hb + 0.012, w = 0.028, drop = open ? 0.11 : 0;
  b.ref((x0 + x1) / 2, 0, z0 + 0.02);
  for (let i = 0; i < 4; i++) {
    const xa = x0 + (x1 - x0) * i / 4, xb = x0 + (x1 - x0) * (i + 1) / 4, za = z0 - drop * (i / 4), zb = z0 - drop * ((i + 1) / 4);
    b.quad(xa, -w, za, xb, -w * 0.8, zb, xb, w * 0.8, zb, xa, w, za, rgb(200, 196, 190));
    b.quad(xa, -w, za, xb, -w * 0.8, zb, xb, -w * 0.6, zb - 0.02, xa, -w * 0.7, za - 0.024, rgb(90, 90, 98));
    b.quad(xa, w, za, xb, w * 0.8, zb, xb, w * 0.6, zb - 0.02, xa, w * 0.7, za - 0.024, rgb(90, 90, 98));
    if (open) for (const side of [-1, 1]) b.tri(xb, side * w * 0.6, zb + 0.002, xb - 0.012, side * w * 0.6, zb + 0.002, xb - 0.006, side * w * 0.6, zb + 0.022, WHITE);
  }
  if (open) {
    b.mode = 2; b.tri(x0, 0, z0 + 0.01, x1, -w, z0 + 0.012, x1, -w, z0 - drop, rgb(190, 110, 120));
    b.mode = 2; b.tri(x0, 0, z0 + 0.01, x1, w, z0 + 0.012, x1, w, z0 - drop, rgb(190, 110, 120));
  }
}

// lure position of the anglerfish in model space (for its glow)
export const LURE = { lx: 0.615, lz: 0 };

function fishExtra(b, d, open) {
  const jaw = open ? d.jaw : 0;
  switch (d.type) {
    case 11:
      for (let i = 0; i < 6; i++) {
        const xn = 0.3 + i * 0.09, e = fsEval(d, xn), off = fsOff(d, xn);
        for (let k = 0; k < 4; k++) {
          const th = (45 + k * 90) * PI / 180, yy = Math.sin(th) * e.w;
          const zz = Math.cos(th) > 0 ? e.zc + Math.cos(th) * e.ht : e.zc + Math.cos(th) * e.hb;
          const bx = xn - 0.5, by = off + yy, bz = zz;
          b.tube(bx, by, bz, bx - 0.05, by + Math.sin(th) * 0.03, bz + Math.cos(th) * 0.03, 0.011, 0, 3, rgb(226, 214, 170));
        }
      }
      break;
    case 14: {
      const e = fsEval(d, 0.84), top = e.zc + e.ht, off = fsOff(d, 0.84);
      b.tube(0.34, off, top - 0.01, 0.46, off, top + 0.13, 0.012, 0.008, 3, rgb(74, 58, 58));
      b.tube(0.46, off, top + 0.13, 0.6, off, top + 0.1, 0.008, 0.005, 3, rgb(74, 58, 58));
      b.jit = 0;
      b.octa(0.615, off, top + 0.08, 0.03, 0.03, 0.036, rgb(170, 255, 225));
      b.jit = d.jit;
      LURE.lz = top + 0.08;
      break;
    }
    case 15:
      for (const side of [-1, 1]) {
        b.tube(0.465, side * 0.013, -0.03 - jaw, 0.495, side * 0.017, 0.055, 0.006, 0, 3, rgb(240, 240, 232));
        b.tube(0.44, side * 0.015, 0.012, 0.455, side * 0.018, -0.07 - jaw * 0.5, 0.005, 0, 3, rgb(240, 240, 232));
      }
      b.jit = 0;
      for (let i = 0; i < 8; i++) {
        const xn = 0.18 + i * 0.09, e = fsEval(d, xn), off = fsOff(d, xn);
        for (const side of [-1, 1]) b.octa(xn - 0.5, off + side * e.w * 0.72, e.zc - e.hb * 0.7, 0.009, 0.006, 0.009, rgb(110, 210, 255));
      }
      b.jit = d.jit;
      break;
    case 16:
      b.jit = 0;
      for (let i = 0; i < 6; i++) {
        const xn = 0.2 + i * 0.11, e = fsEval(d, xn), off = fsOff(d, xn);
        for (const side of [-1, 1]) {
          b.octa(xn - 0.5, off + side * e.w * 0.85, e.zc - e.hb * 0.45, 0.012, 0.008, 0.012, rgb(140, 240, 255));
          if (i % 2 === 0) b.octa(xn - 0.5 + 0.03, off + side * e.w * 0.6, e.zc - e.hb * 0.85, 0.01, 0.007, 0.01, rgb(140, 240, 255));
        }
      }
      b.jit = d.jit;
      break;
    case 18: {
      let e = fsEval(d, 0.32);
      const fl = Math.sin(d.ph) * 0.15;
      let top = e.zc + e.ht;
      b.mode = 2; b.tri(0.24 - 0.5, 0, top - 0.03, 0.4 - 0.5, 0, top - 0.03, 0.27 - 0.5, fl, top + 0.42, d.fin);
      b.mode = 2; b.tri(0.24 - 0.5, 0, top - 0.03, 0.27 - 0.5, fl, top + 0.42, 0.2 - 0.5, fl * 0.6, top + 0.3, mul(d.fin, 0.9));
      top = e.zc - e.hb;
      b.mode = 2; b.tri(0.24 - 0.5, 0, top + 0.03, 0.4 - 0.5, 0, top + 0.03, 0.27 - 0.5, -fl, top - 0.42, mul(d.fin, 1.1));
      b.mode = 2; b.tri(0.24 - 0.5, 0, top + 0.03, 0.27 - 0.5, -fl, top - 0.42, 0.2 - 0.5, -fl * 0.6, top - 0.3, d.fin);
      break;
    }
  }
}

// lofted low-poly fish along +x, length 1 (scr_mesh_fish)
function meshFish(b, t, ph, mouth) {
  const d = fishdef(t);
  d.ph = ph;
  b.jit = d.jit;
  let mo = mouth;
  if (t === 14) { mo = true; d.jaw = mouth ? 0.22 : 0.1; }        // the anglerfish never quite closes its mouth
  const K = d.K, n = d.fs.length, rc = [], rv = [];
  for (let i = 0; i < n; i++) {
    const f = d.fs[i], off = fsOff(d, f.x);
    rc[i] = d.axis === 0 ? [f.x - 0.5, off, f.zc] : [f.x - 0.5, 0, f.zc + off];
    rv[i] = [];
    for (let k = 0; k < K; k++) {
      const th = k * 2 * PI / K, yy = Math.sin(th) * f.w;
      let zz = Math.cos(th) >= 0 ? Math.cos(th) * f.ht : Math.cos(th) * f.hb;
      if (mo && f.x > d.jaw0 && Math.cos(th) < -0.2) zz -= d.jaw * (f.x - d.jaw0) / (1 - d.jaw0);
      rv[i][k] = [f.x - 0.5, rc[i][1] + yy, rc[i][2] + zz];
    }
  }
  // body
  for (let i = 0; i < n - 1; i++) {
    b.ref((rc[i][0] + rc[i + 1][0]) / 2, (rc[i][1] + rc[i + 1][1]) / 2, (rc[i][2] + rc[i + 1][2]) / 2);
    for (let k = 0; k < K; k++) {
      const k2 = (k + 1) % K, zr = Math.cos((k + 0.5) * 2 * PI / K);
      const col = fishColor(d, (d.fs[i].x + d.fs[i + 1].x) / 2, zr, i, k);
      const a = rv[i][k], bb = rv[i][k2], c = rv[i + 1][k2], e = rv[i + 1][k];
      b.quad(a[0], a[1], a[2], bb[0], bb[1], bb[2], c[0], c[1], c[2], e[0], e[1], e[2], col);
    }
  }
  // nose cap (split into jaws when open)
  const tipx = d.tip - 0.5, last = n - 1, offn = fsOff(d, 1);
  const ty = d.axis === 0 ? offn : 0, tipz = d.axis === 0 ? d.tipz : d.tipz + offn;
  b.ref(rc[last][0] - 0.02, rc[last][1], rc[last][2]);
  const jaw = mo ? d.jaw : 0;
  for (let k = 0; k < K; k++) {
    const k2 = (k + 1) % K, zr = Math.cos((k + 0.5) * 2 * PI / K), col = fishColor(d, 0.98, zr, last, k);
    let zz = zr < -0.2 ? tipz - jaw : tipz;
    if (d.pat === 6 && zr < -0.2) zz = tipz - 0.06;
    const a = rv[last][k], bb = rv[last][k2];
    b.tri(a[0], a[1], a[2], bb[0], bb[1], bb[2], tipx, ty, zz, col);
  }
  if (mo && d.jaw > 0) {
    b.ref(tipx - 0.2, ty, tipz - jaw * 0.5);
    const w = d.fs[last].w;
    for (const side of [-1, 1]) b.tri(tipx, ty, tipz, tipx, ty, tipz - jaw, d.jaw0 - 0.5 + 0.02, ty + side * w * 0.6, tipz - jaw * 0.45, rgb(120, 24, 32));
    b.tri(tipx, ty, tipz, tipx, ty, tipz - jaw, d.jaw0 - 0.5, ty, tipz - jaw * 0.4, rgb(70, 10, 18));
    if (d.teeth) for (let j = 0; j < 4; j++) {
      const fx = tipx - 0.01 - j * (tipx - (d.jaw0 - 0.5)) / 4.5;
      for (const side of [-1, 1]) {
        const yy = ty + side * w * (0.3 + j * 0.12);
        b.tri(fx, yy, tipz - 0.004, fx - 0.012, yy, tipz - 0.004, fx - 0.006, yy, tipz - jaw * 0.35, rgb(250, 250, 240));
        b.tri(fx - 0.005, yy, tipz - jaw + 0.004, fx - 0.017, yy, tipz - jaw + 0.004, fx - 0.011, yy, tipz - jaw * 0.62, rgb(250, 250, 240));
      }
    }
  }
  // tail cap
  b.ref(rc[0][0] + 0.02, rc[0][1], rc[0][2]);
  for (let k = 0; k < K; k++) { const k2 = (k + 1) % K, a = rv[0][k], bb = rv[0][k2]; b.tri(a[0], a[1], a[2], bb[0], bb[1], bb[2], -0.52, rc[0][1], rc[0][2], d.fin); }
  // caudal fin, trailing the body wave
  const bx = -0.5, by = rc[0][1], bz = rc[0][2], offt = d.amp * 0.55 * Math.sin(d.ph - d.wave - 0.9);
  b.mode = 2;
  if (d.tail === 3) {
    const zt = bz + offt;
    for (const side of [-1, 1]) {
      b.mode = 2; b.tri(bx + 0.02, side * 0.012, bz, bx - d.fl, side * d.fh, zt + 0.01, bx - d.fl * 0.45, 0, zt, d.fin);
      b.mode = 2; b.tri(bx + 0.02, side * 0.012, bz, bx - d.fl * 0.45, 0, zt, bx - d.fl * 0.2, side * d.fh * 0.4, zt, mul(d.fin, 0.9));
    }
  } else if (d.tail === 1) {
    const kk = 4;
    for (let j = 0; j < kk; j++) {
      const th = (-0.75 + j * 2 / kk) * 0.9;
      b.mode = 2;
      b.tri(bx + 0.02, by, bz, bx - Math.cos(th) * d.fl, by + offt, bz + Math.sin(th) * d.fh,
            bx - Math.cos(th + 1.8 / kk) * d.fl, by + offt, bz + Math.sin(th + 1.8 / kk) * d.fh, mul(d.fin, 0.88 + (j % 2) * 0.12 + j * 0.01));
    }
  } else if (d.tail !== 5) {
    let ux = d.fl, uz = d.fh, dx = d.fl * d.lf, dz = d.fh * d.lf;
    if (d.tail === 2) { ux = d.fl * 1.15; uz = d.fh * 1.15; dx = d.fl * 0.45; dz = d.fh * 0.5; }
    b.mode = 2; b.tri(bx + 0.03, by, bz + d.fs[0].ht + 0.01, bx - ux, by + offt, bz + uz, bx - d.fl * 0.35, by + offt * 0.7, bz, d.fin);
    b.mode = 2; b.tri(bx + 0.03, by, bz - d.fs[0].hb - 0.01, bx - d.fl * 0.35, by + offt * 0.7, bz, bx - dx, by + offt, bz - dz, mul(d.fin, 0.85));
  }
  if (d.dors) finDorsal(b, d, d.d0, d.d1, d.dh);
  if (d.dors2) finDorsal(b, d, 0.2, 0.27, d.dh * 0.45);
  finVentral(b, d, 0.2, 0.3, d.dh * 0.5);
  // pectoral fins with a small paddle motion
  let e = fsEval(d, d.pec), off = fsOff(d, d.pec);
  for (const side of [-1, 1]) {
    const cy = d.axis === 0 ? off : 0, cz = d.axis === 0 ? e.zc : e.zc + off, s = Math.sin(d.ph * 2 + side) * 0.02;
    b.mode = 2;
    b.tri(d.pec - 0.5, cy + side * e.w * 0.9, cz - e.hb * 0.35, d.pec - 0.5 - 0.05, cy + side * e.w * 0.85, cz - e.hb * 0.45,
          d.pec - 0.5 - d.pl, cy + side * (e.w + d.pw), cz - e.hb * 0.7 + s, mul(d.fin, 1.08));
  }
  // eyes: dark gem with a light ring and glint
  e = fsEval(d, d.eye); off = fsOff(d, d.eye);
  for (const side of [-1, 1]) {
    const ex = d.eye - 0.5;
    let ey, ez;
    if (d.axis === 0) { ey = off + side * e.w * 0.82; ez = e.zc + e.ht * 0.28; } else { ey = side * e.w * 0.98; ez = e.zc + off - e.hb * 0.25; }
    b.octa(ex, ey, ez, d.er * 1.25, d.er * 0.7, d.er * 1.25, d.ring);
    b.octa(ex, ey + side * d.er * 0.35, ez, d.er * 0.85, d.er * 0.6, d.er * 0.85, d.eyec);
    b.octa(ex + d.er * 0.3, ey + side * d.er * 0.8, ez + d.er * 0.35, d.er * 0.22, d.er * 0.2, d.er * 0.22, WHITE);
  }
  if (d.pat === 5) {           // shark gills
    for (let j = 0; j < 4; j++) {
      const fx = 0.76 + j * 0.022, g = fsEval(d, fx), o = fsOff(d, fx);
      for (const side of [-1, 1]) {
        b.mode = 2;
        b.tri(fx - 0.5, o + side * g.w * 1.01, g.zc + g.ht * 0.3, fx - 0.5 - 0.008, o + side * g.w * 1.01, g.zc - g.hb * 0.3, fx - 0.5 + 0.004, o + side * g.w * 1.01, g.zc - g.hb * 0.25, rgb(60, 66, 76));
      }
    }
  }
  if (d.tail === 3) { whaleJaw.d = d; whaleJaw(b, mo); }
  fishExtra(b, d, mo);
}

function meshShrimp(b, ph) {
  const n = 7, K = 5, rc = [], rv = [];
  for (let i = 0; i < n; i++) {
    const s = i / (n - 1), a = -1.2 + s * 1.5 + Math.sin(ph) * 0.15 * (1 - s);
    rc[i] = [Math.cos(a) * 0.45 - 0.05, Math.sin(a) * 0.45 + 0.2];
    const r = 0.05 + 0.06 * Math.sin(s * PI * 0.85);
    rv[i] = [];
    for (let k = 0; k < K; k++) { const th = k * 2 * PI / K; rv[i][k] = [rc[i][0], Math.sin(th) * r, rc[i][1] + Math.cos(th) * r]; }
  }
  for (let i = 0; i < n - 1; i++) {
    b.ref((rc[i][0] + rc[i + 1][0]) / 2, 0, (rc[i][1] + rc[i + 1][1]) / 2);
    const col = Math.floor(i * 7 / n) % 2 === 0 ? rgb(240, 130, 110) : rgb(250, 175, 150);
    for (let k = 0; k < K; k++) {
      const k2 = (k + 1) % K, a = rv[i][k], bb = rv[i][k2], c = rv[i + 1][k2], e = rv[i + 1][k];
      b.quad(a[0], a[1], a[2], bb[0], bb[1], bb[2], c[0], c[1], c[2], e[0], e[1], e[2], col);
    }
  }
  const x0 = rc[0][0], z0 = rc[0][1];
  b.mode = 2; b.tri(x0, 0, z0, x0 - 0.18, -0.12, z0 - 0.1, x0 - 0.2, 0.12, z0 - 0.1, rgb(250, 160, 140));
  b.mode = 2; b.tri(x0, 0, z0, x0 - 0.22, 0, z0 - 0.02, x0 - 0.2, 0.12, z0 - 0.1, rgb(240, 140, 120));
  const L = rc[n - 1];
  b.mode = 2; b.tri(L[0], -0.02, L[1] + 0.04, L[0], 0.02, L[1] + 0.04, L[0] + 0.25, 0, L[1] + 0.1, rgb(250, 150, 130));
  for (const j of [-1, 1]) { b.mode = 2; b.tri(L[0], j * 0.03, L[1], L[0], j * 0.036, L[1] + 0.01, L[0] + 0.85, j * 0.45, L[1] + 0.35 + Math.sin(ph + j) * 0.04, rgb(255, 200, 180)); }
  for (let f = 1; f < 5; f++)
    for (const j of [-1, 1]) {
      const p = rc[Math.floor(f * (n - 1) / 6)];
      b.mode = 2; b.tri(p[0] - 0.02, j * 0.03, p[1] - 0.05, p[0] + 0.02, j * 0.03, p[1] - 0.05, p[0] + Math.sin(ph * 2 + f) * 0.05, j * 0.07, p[1] - 0.18, rgb(250, 170, 150));
    }
  b.octa(L[0] - 0.02, 0.07, L[1] + 0.05, 0.025, 0.025, 0.025, rgb(20, 20, 20));
  b.octa(L[0] - 0.02, -0.07, L[1] + 0.05, 0.025, 0.025, 0.025, rgb(20, 20, 20));
}

function meshJelly(b, ph) {
  const pul = Math.sin(ph), K = 9, NR = 3, r = 0.5 * (1 - pul * 0.1), h = 0.38 * (1 + pul * 0.12);
  b.alpha = 0.62; b.jit = 0.12;
  b.ref(0, 0, 0);
  for (let i = 0; i < NR; i++) {
    const a0 = i / NR * PI / 2, a1 = (i + 1) / NR * PI / 2;
    for (let k = 0; k < K; k++) {
      const th0 = k * 2 * PI / K, th1 = (k + 1) * 2 * PI / K;
      let col = merge(rgb(255, 150, 210), rgb(200, 120, 255), i / NR);
      if (Math.floor(k * 9 / K) % 3 === 0) col = merge(col, WHITE, 0.35);
      b.quad(Math.cos(th0) * Math.cos(a0) * r, Math.sin(th0) * Math.cos(a0) * r, Math.sin(a0) * h, Math.cos(th1) * Math.cos(a0) * r, Math.sin(th1) * Math.cos(a0) * r, Math.sin(a0) * h,
             Math.cos(th1) * Math.cos(a1) * r, Math.sin(th1) * Math.cos(a1) * r, Math.sin(a1) * h, Math.cos(th0) * Math.cos(a1) * r, Math.sin(th0) * Math.cos(a1) * r, Math.sin(a1) * h, col);
    }
  }
  b.alpha = 0.55;
  for (let k = 0; k < K; k++) {
    const th0 = (k + 0.5) * 2 * PI / K;
    let x0 = Math.cos(th0) * r * 0.96, y0 = Math.sin(th0) * r * 0.96, z0 = 0;
    for (let seg = 0; seg < 5; seg++) {
      const wv = Math.sin(ph - seg * 0.9 + k) * 0.05, x1 = x0 * 0.97 + wv, y1 = y0 * 0.97, z1 = z0 - 0.3;
      b.mode = 2; b.quad(x0 - 0.008, y0, z0, x0 + 0.008, y0, z0, x1 + 0.006, y1, z1, x1 - 0.006, y1, z1, rgb(255, 190, 230));
      x0 = x1; y0 = y1; z0 = z1;
    }
  }
  b.alpha = 0.7;
  for (let k = 0; k < 4; k++) {
    const th0 = k * PI / 2 + 0.4;
    let x0 = Math.cos(th0) * 0.05, y0 = Math.sin(th0) * 0.05, z0 = 0.02;
    for (let seg = 0; seg < 4; seg++) {
      const wv = Math.sin(ph - seg * 0.7 + k * 2) * 0.06;
      const x1 = x0 + Math.cos(th0) * 0.03 + wv, y1 = y0 + Math.sin(th0) * 0.03, z1 = z0 - 0.22, w = 0.06 * (1 - seg * 0.18);
      b.mode = 2; b.quad(x0 - Math.sin(th0) * w, y0 + Math.cos(th0) * w, z0, x0 + Math.sin(th0) * w, y0 - Math.cos(th0) * w, z0,
                          x1 + Math.sin(th0) * w, y1 - Math.cos(th0) * w, z1, x1 - Math.sin(th0) * w, y1 + Math.cos(th0) * w, z1, rgb(255, 220, 240));
      x0 = x1; y0 = y1; z0 = z1;
    }
  }
  b.alpha = 1; b.jit = 0.07;
}

function meshManta(b, ph) {
  const NX = 4, NY = 5, g = [];
  for (let i = 0; i <= NX; i++) {
    g[i] = [];
    for (let j = 0; j <= NY; j++) {
      const xs = -0.22 + 0.5 * i / NX, ws = 0.5 * Math.sin(PI * (i / NX) * 0.92 + 0.12), t = j / NY;
      const flap = Math.sin(ph) * 0.16 * Math.pow(t, 1.6) + Math.sin(ph - 1.2) * 0.03 * t;
      g[i][j] = { x: xs - t * t * 0.08, y: ws * j / NY, z: flap, t: 0.035 * (1 - t) * (1 - Math.abs(i / NX - 0.55)) };
    }
  }
  b.jit = 0.08;
  for (const j of [-1, 1])
    for (let i = 0; i < NX; i++)
      for (let top = 0; top < NY; top++) {
        const a = g[i][top], bb = g[i + 1][top], c = g[i + 1][top + 1], e = g[i][top + 1];
        b.ref(a.x, j * a.y, a.z - 0.1);
        let col = rgb(34, 40, 58);
        if (top >= NY * 0.2 && top < NY * 0.6 && i >= NX * 0.75 - 0.01 && i < NX * 0.75 + NX * 0.25) col = rgb(200, 205, 215);
        b.quad(a.x, j * a.y, a.z + a.t, bb.x, j * bb.y, bb.z + bb.t, c.x, j * c.y, c.z + c.t, e.x, j * e.y, e.z + e.t, col);
        b.ref(a.x, j * a.y, a.z + 0.1);
        b.quad(a.x, j * a.y, a.z - a.t, bb.x, j * bb.y, bb.z - bb.t, c.x, j * c.y, c.z - c.t, e.x, j * e.y, e.z - e.t, rgb(226, 230, 236));
      }
  for (const j of [-1, 1]) {
    b.mode = 2; b.tri(0.27, j * 0.05, 0.01, 0.27, j * 0.08, 0.0, 0.36, j * 0.07, -0.02 + Math.sin(ph * 2) * 0.01, rgb(40, 46, 64));
    b.octa(0.24, j * 0.075, 0.025, 0.012, 0.01, 0.012, rgb(10, 10, 14));
  }
  b.mode = 2; b.tri(-0.22, -0.012, 0, -0.22, 0.012, 0, -0.75, Math.sin(ph - 2) * 0.03, Math.sin(ph - 2.5) * 0.04, rgb(30, 34, 46));
  b.jit = 0.07;
}

export function meshPufferBig(b, ph) {
  b.jit = 0.1;
  b.blob(0, 0, 0, 0.5, 0.47, 0.47, 4, 8, 0.05, rgb(238, 234, 216), rgb(178, 152, 86));
  const NS = 36;
  for (let k = 0; k < NS; k++) {
    const dz = 1 - 2 * (k + 0.5) / NS, l = Math.sqrt(1 - dz * dz), th = k * 2.39996, dx = Math.cos(th) * l, dy = Math.sin(th) * l;
    b.tube(dx * 0.44, dy * 0.41, dz * 0.41, dx * 0.62, dy * 0.58, dz * 0.58, 0.03, 0, 3, rgb(242, 232, 190));
  }
  for (const side of [-1, 1]) {
    b.octa(0.36, side * 0.24, 0.14, 0.07, 0.04, 0.07, rgb(235, 205, 60));
    b.octa(0.39, side * 0.27, 0.14, 0.045, 0.02, 0.045, rgb(14, 14, 18));
    const fl = Math.sin(ph * 2 + side) * 0.08;
    b.mode = 2; b.tri(0.12, side * 0.44, -0.02, 0.02, side * 0.46, 0.04, 0.0, side * (0.56 + fl), -0.05, rgb(210, 180, 100));
  }
  b.octa(0.5, 0, -0.04, 0.03, 0.05, 0.035, rgb(110, 70, 56));
  const fl = Math.sin(ph) * 0.1;
  b.mode = 2; b.tri(-0.46, 0, 0, -0.66, fl, 0.12, -0.66, fl, -0.12, rgb(210, 180, 100));
  b.jit = 0.07;
}

function meshSeahorse(b, ph) {
  const K = 5, sh = [[0.06, 0.40, 0.065], [0.00, 0.30, 0.05], [0.05, 0.17, 0.085], [0.05, 0.03, 0.085], [0.00, -0.11, 0.06], [-0.02, -0.21, 0.045]];
  const cx = 0.07, cz = -0.3, R = 0.09;
  for (let j = 0; j < 7; j++) {
    const ang = (150 + j * 42) * PI / 180;
    sh.push([cx + Math.cos(ang) * R * (1 - j * 0.1), cz + Math.sin(ang) * R * (1 - j * 0.1) - Math.sin(ph) * 0.004 * j, 0.035 * (1 - j * 0.11)]);
  }
  const n = sh.length, rv = [];
  for (let i = 0; i < n; i++) {
    let tx, tz;
    if (i === 0) { tx = sh[1][0] - sh[0][0]; tz = sh[1][1] - sh[0][1]; } else { tx = sh[i][0] - sh[i - 1][0]; tz = sh[i][1] - sh[i - 1][1]; }
    const l = Math.max(0.0001, Math.hypot(tx, tz)); tx /= l; tz /= l;
    const nx = -tz, nz = tx;
    rv[i] = [];
    for (let k = 0; k < K; k++) { const a0 = k * 2 * PI / K; rv[i][k] = [sh[i][0] + nx * Math.cos(a0) * sh[i][2], Math.sin(a0) * sh[i][2], sh[i][1] + nz * Math.cos(a0) * sh[i][2]]; }
  }
  for (let i = 0; i < n - 1; i++) {
    b.ref((sh[i][0] + sh[i + 1][0]) / 2, 0, (sh[i][1] + sh[i + 1][1]) / 2);
    for (let k = 0; k < K; k++) {
      let col = i % 2 === 0 ? rgb(242, 182, 62) : rgb(214, 142, 40);
      if (k === 0) col = merge(col, rgb(255, 230, 150), 0.4);
      const k2 = (k + 1) % K, a = rv[i][k], bb = rv[i][k2], c = rv[i + 1][k2], e = rv[i + 1][k];
      b.quad(a[0], a[1], a[2], bb[0], bb[1], bb[2], c[0], c[1], c[2], e[0], e[1], e[2], col);
    }
  }
  b.octa(sh[0][0] + 0.01, 0, sh[0][1] + 0.04, 0.06, 0.055, 0.05, rgb(242, 182, 62));
  b.tube(0.1, 0, 0.41, 0.25, 0, 0.375, 0.028, 0.02, 5, rgb(230, 168, 56));
  for (let j = 0; j < 3; j++) b.tube(0.03 + j * 0.03, 0, 0.45, 0.02 + j * 0.035, 0, 0.5 + (j === 1 ? 0.02 : 0), 0.012, 0, 3, rgb(250, 200, 90));
  for (const s of [-1, 1]) {
    b.octa(0.09, s * 0.055, 0.43, 0.022, 0.014, 0.022, rgb(250, 230, 120));
    b.octa(0.095, s * 0.064, 0.43, 0.013, 0.008, 0.013, rgb(14, 12, 18));
  }
  b.alpha = 0.85;
  for (let j = 0; j < 4; j++) {
    const fl = Math.sin(ph * 3 + j * 0.9) * 0.035;
    b.mode = 2; b.tri(-0.03, 0, 0.0 + j * 0.04, -0.03, 0, 0.04 + j * 0.04, -0.12, fl, 0.02 + j * 0.04, rgb(255, 222, 140));
  }
  b.alpha = 1;
}

function meshTurtle(b, ph) {
  const NR = 3, NS = 10, rx = 0.38, ry = 0.30, rz = 0.17;
  b.jit = 0.1;
  b.ref(0, 0, -0.1);
  for (let i = 0; i < NR; i++)
    for (let k = 0; k < NS; k++) {
      const la0 = i / NR * PI / 2, la1 = (i + 1) / NR * PI / 2, lo0 = k * 2 * PI / NS, lo1 = (k + 1) * 2 * PI / NS;
      let col = (Math.floor(i * 3 / NR) + Math.floor(k * 10 / NS)) % 2 === 0 ? rgb(116, 104, 56) : rgb(150, 132, 74);
      if (Math.floor(i * 3 / NR) === 0) col = mul(col, 0.8);
      if (i === NR - 1) col = rgb(136, 120, 64);
      b.quad(Math.cos(la0) * Math.cos(lo0) * rx, Math.cos(la0) * Math.sin(lo0) * ry, Math.sin(la0) * rz, Math.cos(la0) * Math.cos(lo1) * rx, Math.cos(la0) * Math.sin(lo1) * ry, Math.sin(la0) * rz,
             Math.cos(la1) * Math.cos(lo1) * rx, Math.cos(la1) * Math.sin(lo1) * ry, Math.sin(la1) * rz, Math.cos(la1) * Math.cos(lo0) * rx, Math.cos(la1) * Math.sin(lo0) * ry, Math.sin(la1) * rz, col);
      b.ref(0, 0, 0.1);
      b.tri(0, 0, -0.05, Math.cos(lo0) * rx * 0.95, Math.sin(lo0) * ry * 0.95, -0.01, Math.cos(lo1) * rx * 0.95, Math.sin(lo1) * ry * 0.95, -0.01, rgb(214, 204, 150));
      b.ref(0, 0, -0.1);
    }
  b.tube(0.3, 0, 0.0, 0.42, 0, 0.02, 0.06, 0.055, 5, rgb(126, 136, 92));
  b.blob(0.47, 0, 0.025, 0.08, 0.06, 0.055, 3, 6, 0.08, rgb(200, 196, 140), rgb(120, 132, 88));
  b.octa(0.545, 0, 0.01, 0.025, 0.03, 0.02, rgb(70, 60, 40));
  for (const s of [-1, 1]) b.octa(0.5, s * 0.047, 0.045, 0.016, 0.01, 0.016, rgb(14, 12, 10));
  const f = Math.sin(ph);
  for (const s of [-1, 1]) {
    b.mode = 2; b.tri(0.2, s * 0.24, -0.01, -0.03 + Math.cos(ph) * 0.07, s * 0.68, f * 0.24, 0.03, s * 0.34, -0.015, rgb(116, 128, 84));
    b.mode = 2; b.tri(0.2, s * 0.24, -0.01, 0.25, s * 0.31, 0.005, -0.03 + Math.cos(ph) * 0.07, s * 0.68, f * 0.24, rgb(140, 150, 100));
    b.mode = 2; b.tri(-0.27, s * 0.19, -0.01, -0.43, s * 0.32, -0.02 - f * 0.05, -0.34, s * 0.13, -0.02, rgb(116, 128, 84));
  }
  b.mode = 2; b.tri(-0.35, -0.03, -0.01, -0.35, 0.03, -0.01, -0.46, 0, -0.025, rgb(116, 128, 84));
  b.jit = 0.07;
}

function meshDiver(b, ph, fl) {
  const K = 8, D = PI / 180;
  const dir = (a) => [-Math.cos(a * D), -Math.sin(a * D)];
  let bob = Math.sin(ph * 2) * 0.006;
  if (fl) bob = Math.sin(ph * 2) * 0.02;
  b.jit = 0.04;
  const dt = [[0.35, 0.07, 0.045], [0.29, 0.105, 0.058], [0.2, 0.1, 0.055], [0.11, 0.085, 0.05], [0.03, 0.09, 0.052], [-0.01, 0.075, 0.045]];
  const n = dt.length;
  for (let i = 0; i < n - 1; i++) {
    const za = bob * (1 - i / n), zb = bob * (1 - (i + 1) / n);
    b.ref((dt[i][0] + dt[i + 1][0]) / 2, 0, (za + zb) / 2);
    for (let k = 0; k < K; k++) {
      const th = k * 2 * PI / K, th1 = (k + 1) * 2 * PI / K, tm = th + PI / K;
      let col = rgb(30, 32, 38);
      if (Math.abs(Math.sin(tm)) > 0.8 && Math.cos(tm) < 0.4) col = rgb(36, 96, 176);
      if (Math.cos(tm) > 0.55 && i <= 2) col = rgb(70, 74, 84);
      if (i === 3 && Math.cos(tm) < 0.5) col = rgb(54, 56, 60);
      b.quad(dt[i][0], Math.sin(th) * dt[i][1], za + Math.cos(th) * dt[i][2], dt[i][0], Math.sin(th1) * dt[i][1], za + Math.cos(th1) * dt[i][2],
             dt[i + 1][0], Math.sin(th1) * dt[i + 1][1], zb + Math.cos(th1) * dt[i + 1][2], dt[i + 1][0], Math.sin(th) * dt[i + 1][1], zb + Math.cos(th) * dt[i + 1][2], col);
    }
  }
  b.blob(0.065, 0, bob * 0.4 - 0.045, 0.014, 0.022, 0.01, 2, 5, 0, rgb(200, 204, 210), null);
  b.tube(0.3, 0, 0.088 + bob, 0.05, 0, 0.085 + bob * 0.3, 0.041, 0.041, 8, rgb(204, 210, 218));
  b.blob(0.3, 0, 0.088 + bob, 0.02, 0.041, 0.041, 3, 8, 0, rgb(214, 220, 228), null);
  b.blob(0.05, 0, 0.085 + bob * 0.3, 0.02, 0.041, 0.041, 3, 8, 0, rgb(190, 196, 204), null);
  b.tube(0.245, 0, 0.088 + bob, 0.225, 0, 0.088 + bob, 0.044, 0.044, 8, rgb(26, 26, 30));
  b.tube(0.125, 0, 0.087 + bob, 0.105, 0, 0.087 + bob, 0.044, 0.044, 8, rgb(26, 26, 30));
  b.tube(0.315, 0, 0.088 + bob, 0.345, 0, 0.09 + bob, 0.012, 0.012, 5, rgb(40, 40, 44));
  b.blob(0.35, 0, 0.09 + bob, 0.012, 0.022, 0.014, 2, 5, 0, rgb(150, 150, 156), null);
  const hx = 0.43; let hy = 0, hz = 0.012 + bob * 0.5;
  if (fl) { hy = Math.sin(ph * 3) * 0.02; hz += Math.sin(ph * 2.5) * 0.02; }
  b.tube(0.34, 0, bob * 0.8, hx - 0.035, hy * 0.6, hz - 0.005, 0.03, 0.028, 6, rgb(30, 32, 38));
  b.blob(hx, hy, hz, 0.055, 0.047, 0.05, 4, 8, 0.02, rgb(34, 36, 42), null);
  b.blob(hx + 0.035, hy, hz - 0.03, 0.022, 0.03, 0.02, 2, 6, 0, rgb(226, 178, 150), null);
  b.blob(hx + 0.045, hy, hz - 0.002, 0.02, 0.046, 0.028, 3, 8, 0, rgb(18, 18, 22), null);
  b.jit = 0;
  b.blob(hx + 0.058, hy, hz - 0.002, 0.008, 0.038, 0.021, 2, 8, 0, rgb(80, 170, 196), null);
  b.blob(hx + 0.062, hy - 0.016, hz + 0.008, 0.003, 0.008, 0.005, 2, 4, 0, rgb(230, 250, 255), null);
  b.jit = 0.04;
  b.tube(hx - 0.04, hy - 0.048, hz + 0.005, hx + 0.02, hy - 0.05, hz + 0.01, 0.006, 0.006, 4, rgb(20, 20, 24));
  b.tube(hx - 0.04, hy + 0.048, hz + 0.005, hx + 0.02, hy + 0.05, hz + 0.01, 0.006, 0.006, 4, rgb(20, 20, 24));
  b.blob(hx + 0.05, hy + 0.012, hz - 0.042, 0.013, 0.016, 0.012, 2, 6, 0, rgb(24, 24, 28), null);
  b.tube(hx + 0.04, hy + 0.025, hz - 0.045, hx - 0.03, hy + 0.07, hz - 0.01, 0.007, 0.007, 4, rgb(24, 24, 28));
  b.tube(hx - 0.03, hy + 0.07, hz - 0.01, 0.35, 0.03, 0.09 + bob, 0.007, 0.007, 4, rgb(24, 24, 28));
  b.tube(hx + 0.05, hy - 0.02, hz - 0.04, hx + 0.03, hy - 0.058, hz - 0.03, 0.008, 0.008, 4, rgb(24, 24, 28));
  b.tube(hx + 0.03, hy - 0.058, hz - 0.03, hx + 0.005, hy - 0.064, hz + 0.05, 0.009, 0.009, 5, rgb(250, 206, 30));
  b.tube(hx + 0.005, hy - 0.064, hz + 0.05, hx - 0.03, hy - 0.058, hz + 0.125, 0.009, 0.009, 5, rgb(250, 206, 30));
  b.blob(hx - 0.032, hy - 0.058, hz + 0.128, 0.011, 0.011, 0.008, 2, 5, 0, rgb(30, 30, 34), null);
  for (const side of [-1, 1]) {
    const sx = 0.31, sy = side * 0.088, sz = -0.005 + bob;
    let ux, uy, uz, wx, wy, wz, q;
    if (!fl) {
      q = Math.sin(ph + side) * 0.03;
      ux = -0.62; uy = side * 0.12; uz = -0.77 + q;
    } else {
      q = ph * 2 + side * 1.3;
      ux = 0.3 + 0.75 * Math.sin(q); uy = side * (0.55 + 0.35 * Math.cos(ph * 2)); uz = 0.15 + 0.85 * Math.sin(q + 1.1);
    }
    const l = Math.hypot(ux, uy, uz); ux /= l; uy /= l; uz /= l;
    const ex = sx + ux * 0.14, ey = sy + uy * 0.14, ez = sz + uz * 0.14;
    if (!fl) { wx = ex + 0.1; wy = ey - side * 0.07; wz = ez - 0.01 + q; }
    else { wx = ex + (ux + 0.4 * Math.cos(q + side)) * 0.12; wy = ey + uy * 0.12; wz = ez + (uz + 0.6 * Math.sin(q - side)) * 0.12; }
    b.blob(sx, sy, sz, 0.028, 0.028, 0.028, 2, 6, 0, rgb(32, 34, 40), null);
    b.tube(sx, sy, sz, ex, ey, ez, 0.026, 0.021, 6, rgb(32, 34, 40));
    b.blob(ex, ey, ez, 0.021, 0.021, 0.021, 2, 5, 0, rgb(32, 34, 40), null);
    b.tube(ex, ey, ez, wx, wy, wz, 0.021, 0.016, 6, rgb(38, 96, 176));
    b.blob(wx + (wx - ex) * 0.15, wy + (wy - ey) * 0.15, wz + (wz - ez) * 0.15, 0.024, 0.016, 0.012, 2, 6, 0, rgb(20, 20, 24), null);
  }
  for (const side of [-1, 1]) {
    const q = ph + (side > 0 ? PI : 0);
    let ah, kf;
    if (!fl) { ah = 6 + 16 * Math.sin(q); kf = 20 + 18 * (0.5 + 0.5 * Math.sin(q - 1.2)); }
    else { ah = 4 + 32 * Math.sin(q * 2); kf = 25 + 40 * (0.5 + 0.5 * Math.sin(q * 2 - 1.2)); }
    const as = ah - kf, af = as + 10 + 22 * Math.sin(q - 2.0);
    let bend = 16 * Math.sin(q - 2.6); if (fl) bend *= 1.6;
    const hx2 = 0.02, hy2 = side * 0.045, hz2 = -0.004 + bob * 0.2;
    let v = dir(ah);
    const kx = hx2 + v[0] * 0.19, ky = side * 0.05, kz = hz2 + v[1] * 0.19;
    v = dir(as);
    const ax = kx + v[0] * 0.18, ay = side * 0.056, az = kz + v[1] * 0.18;
    v = dir(af);
    let fx = ax + v[0] * 0.055, fz = az + v[1] * 0.055;
    const fy = ay;
    b.tube(hx2, hy2, hz2, kx, ky, kz, 0.037, 0.029, 6, rgb(30, 32, 38));
    b.blob(kx, ky, kz, 0.029, 0.029, 0.029, 2, 5, 0, rgb(30, 32, 38), null);
    b.tube(kx, ky, kz, ax, ay, az, 0.028, 0.02, 6, rgb(30, 32, 38));
    b.tube(ax, ay, az, fx, fy, fz, 0.024, 0.02, 6, rgb(18, 18, 20));
    for (let i = 0; i < 3; i++) {
      v = dir(af + bend * i / 3);
      const mx = fx + v[0] * 0.06, mz = fz + v[1] * 0.06, wa = 0.03 + 0.016 * i, wb = 0.03 + 0.016 * (i + 1);
      const col = i === 2 ? rgb(255, 226, 70) : rgb(250, 212, 34);
      b.mode = 2; b.quad(fx, fy - wa, fz, fx, fy + wa, fz, mx, fy + wb, mz, mx, fy - wb, mz, col);
      b.tube(fx, fy - wa, fz, mx, fy - wb, mz, 0.006, 0.006, 3, rgb(20, 20, 24));
      b.tube(fx, fy + wa, fz, mx, fy + wb, mz, 0.006, 0.006, 3, rgb(20, 20, 24));
      fx = mx; fz = mz;
    }
  }
  b.jit = 0.07;
}

function meshCrab(b, ph, fl) {
  const R = 4, S = 10, c1 = rgb(176, 60, 34), c2 = rgb(216, 98, 52), c3 = rgb(238, 176, 126), c4 = rgb(44, 26, 24);
  b.jit = 0.05;
  b.blob(0, 0.02, 0.05, 0.42, 0.31, 0.12, R, S, 0.06, c1, c2);
  b.blob(0, 0.04, -0.02, 0.33, 0.24, 0.05, 2, S, 0, c3, null);
  for (const side of [-1, 1])
    for (let k = 0; k < 4; k++) {
      const a = (270 + side * (25 + 55 * k / 3)) * PI / 180;
      b.octa(Math.cos(a) * 0.43, 0.02 + Math.sin(a) * 0.32, 0.07, 0.03, 0.02, 0.022, c2);
    }
  for (const side of [-1, 1]) {
    b.tube(side * 0.08, -0.26, 0.12, side * 0.1, -0.33, 0.2, 0.018, 0.014, 5, c1);
    b.octa(side * 0.1, -0.335, 0.215, 0.028, 0.028, 0.03, rgb(20, 18, 22));
  }
  const op = fl ? 0.3 + 0.3 * Math.sin(ph * 3) : 0.15 + 0.1 * Math.sin(ph);
  for (const side of [-1, 1]) {
    const q = fl ? 0.08 * Math.sin(ph * 2 + side) : 0;
    const hx = side * 0.3, hy = -0.22, hz = 0.02, ex = side * 0.44, ey = -0.42, ez = 0.06 + q, cwx = side * 0.3, cwy = -0.58, cwz = 0.07 + q;
    b.tube(hx, hy, hz, ex, ey, ez, 0.05, 0.045, 6, c1);
    b.blob(ex, ey, ez, 0.05, 0.05, 0.05, 2, 6, 0, c3, null);
    b.tube(ex, ey, ez, cwx, cwy, cwz, 0.05, 0.06, 6, c1);
    b.blob(side * 0.24, -0.64, 0.07 + q, 0.11, 0.08, 0.07, R - 1, S - 2, 0.03, c1, c2);
    b.tube(side * 0.17, -0.7, 0.04 + q, side * 0.04, -0.77, 0.03 + q, 0.035, 0.01, 5, c4);
    b.tube(side * 0.17, -0.7, 0.1 + q, side * 0.05, -0.77, 0.06 + q + op * 0.12, 0.03, 0.009, 5, c4);
  }
  for (const side of [-1, 1])
    for (let i = 0; i < 4; i++) {
      const ay = -0.12 + i * 0.12, q = ph + ((i + (side > 0 ? 1 : 0)) % 2) * PI;
      let lift = Math.max(0, Math.sin(q)) * 0.07, sw = Math.cos(q) * 0.07;
      if (fl) { lift = (0.5 + 0.5 * Math.sin(q * 2 + i)) * 0.12; sw = Math.sin(q * 3 + i) * 0.1; }
      const sy = (i - 1.5) * 0.09;
      const hx = side * 0.36, hy = ay, hz = 0, kx = side * 0.62 + sw * 0.5, ky = ay + sy * 0.6, kz = 0.11 + lift * 0.6;
      const ax = side * 0.78 + sw * 0.8, az = -0.04 + lift, tx = side * 0.84 + sw, ty = ay + sy * 1.4, tz = -0.17 + lift;
      b.tube(hx, hy, hz, kx, ky, kz, 0.036, 0.03, 5, c1);
      b.blob(kx, ky, kz, 0.03, 0.03, 0.03, 2, 5, 0, c3, null);
      b.tube(kx, ky, kz, ax, ay + sy * 1.2, az, 0.03, 0.022, 5, c2);
      b.tube(ax, ay + sy * 1.2, az, tx, ty, tz, 0.02, 0.005, 4, c3);
    }
  b.jit = 0.07;
}

// one frame of species t (kind k) at phase ph; mouth: open-mouth / struggle frame
export function buildCreatureFrame(b, t, kind, ph, mouth) {
  switch (kind) {
    case 1: meshShrimp(b, ph); break;
    case 2: meshJelly(b, ph); break;
    case 3: meshManta(b, ph); break;
    case 6: meshTurtle(b, ph); break;
    case 7: meshSeahorse(b, ph); break;
    case 9: meshDiver(b, ph, mouth); break;
    case 10: meshCrab(b, ph, mouth); break;
    default: meshFish(b, t, ph, mouth);
  }
}
