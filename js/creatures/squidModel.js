// Procedural squid - port of scr_build_squid_parts (04_models.gml) and 09_squid.gml.
// Mantle / head / fins are static meshes (fins: 8-frame flap cycle), arms are FK chains: every point is
// stored as an offset from the body, so moving the body never drags the arms, while turning makes them
// trail behind with inertia. All arm segments are one InstancedMesh (one draw call).
// Model space is the original one: +x forward (arm crown), mantle behind along -x, z up; length 1 = ML.
import * as THREE from 'three';
import { MeshBuilder, rgb, merge, mul } from '../mesh/builder.js';
import { makeRng, hash2, smoothstep, lerp } from '../world/terrain.js';

const P = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1);   // game <-> three axis swap

// palettes: 0 player, 1 player flashing (boost / hurt), 2 rival giant squid
export function squidPalette(p) {
  switch (p) {
    case 0: return { body: rgb(232, 98, 70), belly: rgb(252, 204, 178), spot: rgb(150, 40, 42), arm: rgb(206, 96, 74), under: rgb(248, 206, 188), fin: rgb(226, 120, 96), eye: rgb(242, 206, 84) };
    case 1: return { body: rgb(252, 196, 178), belly: rgb(255, 236, 222), spot: rgb(240, 146, 124), arm: rgb(250, 186, 166), under: rgb(255, 236, 226), fin: rgb(255, 206, 186), eye: rgb(242, 206, 84) };
    case 3: return { body: rgb(176, 84, 58), belly: rgb(226, 156, 124), spot: rgb(120, 50, 36), arm: rgb(184, 92, 66), under: rgb(244, 204, 182), fin: rgb(184, 92, 66), eye: rgb(232, 204, 120) };
    default: return { body: rgb(140, 28, 46), belly: rgb(196, 110, 112), spot: rgb(84, 10, 24), arm: rgb(150, 36, 52), under: rgb(222, 150, 150), fin: rgb(166, 44, 62), eye: rgb(205, 236, 140) };
  }
}

// mantle radius at s (0 collar .. 1 tip)
// octopus mantle radius: a big round sac behind the head
const octR = (s) => 0.36 * Math.sqrt(Math.max(0, Math.sin(Math.PI * (0.12 + 0.88 * Math.max(0, Math.min(1, s))))));

function sqR(s) {
  s = Math.max(0, Math.min(1, s));
  if (s < 0.3) return lerp(0.15, 0.19, s / 0.3);
  if (s < 0.6) return lerp(0.19, 0.165, (s - 0.3) / 0.3);
  return 0.165 * Math.sqrt(Math.max(0, 1 - (s - 0.6) / 0.4));
}

function buildParts(p) {
  const c = squidPalette(p);
  const K = 8, NS = 9, out = {};
  // mantle
  let b = new MeshBuilder(makeRng(500 + p), 256);
  for (let i = 0; i < NS; i++) {
    let s0 = i / NS, s1 = (i + 1) / NS, r0 = sqR(s0), r1 = sqR(s1);
    if (p >= 3) { r0 = octR(s0); r1 = octR(s1); s0 *= 0.75; s1 *= 0.75; }      // octopus: round sac
    b.ref(-(s0 + s1) / 2, 0, 0);
    for (let k = 0; k < K; k++) {
      const th0 = k * 2 * Math.PI / K, th1 = (k + 1) * 2 * Math.PI / K, zr = Math.cos((k + 0.5) * 2 * Math.PI / K);
      let col = merge(c.belly, c.body, smoothstep(-0.45, 0.35, zr));
      const h = hash2(i * 11 + k, p * 7 + 3);
      if (h < 0.2 && zr > -0.3) col = c.spot;
      if (p === 3 && h > 0.75) col = merge(col, c.belly, 0.4);
      if (i === 0) col = merge(col, c.belly, 0.35);
      b.quad(-s0, Math.sin(th0) * r0, Math.cos(th0) * r0 * 0.92, -s0, Math.sin(th1) * r0, Math.cos(th1) * r0 * 0.92,
             -s1, Math.sin(th1) * r1, Math.cos(th1) * r1 * 0.92, -s1, Math.sin(th0) * r1, Math.cos(th0) * r1 * 0.92, col);
    }
  }
  out.mantle = b.geometry();
  // head: short neck, big golden eyes, dark beak in the arm crown
  b = new MeshBuilder(makeRng(510 + p), 256);
  for (let i = 0; i < 2; i++) {
    const s0 = i * 0.11, s1 = (i + 1) * 0.11, r0 = i === 0 ? 0.15 : 0.158, r1 = i === 0 ? 0.158 : 0.115;
    b.ref((s0 + s1) / 2, 0, 0);
    for (let k = 0; k < K; k++) {
      const th0 = k * 2 * Math.PI / K, th1 = (k + 1) * 2 * Math.PI / K, zr = Math.cos((k + 0.5) * 2 * Math.PI / K);
      const col = merge(c.belly, c.body, smoothstep(-0.45, 0.35, zr));
      b.quad(s0, Math.sin(th0) * r0, Math.cos(th0) * r0 * 0.9, s0, Math.sin(th1) * r0, Math.cos(th1) * r0 * 0.9,
             s1, Math.sin(th1) * r1, Math.cos(th1) * r1 * 0.9, s1, Math.sin(th0) * r1, Math.cos(th0) * r1 * 0.9, col);
    }
  }
  for (const side of [-1, 1]) {
    b.octa(0.1, side * 0.13, 0.03, 0.068, 0.04, 0.062, c.eye);
    b.octa(0.105, side * 0.158, 0.03, 0.04, 0.02, 0.044, rgb(14, 12, 20));
    b.octa(0.12, side * 0.172, 0.05, 0.012, 0.008, 0.012, rgb(255, 255, 255));
  }
  b.tube(0.2, 0, 0, 0.29, 0, 0, 0.035, 0, 5, rgb(54, 36, 34));
  out.head = b.geometry();
  // fins: flipbook of a flap cycle
  out.fins = [];
  for (let f = 0; f < 8; f++) {
    b = new MeshBuilder(makeRng(600 + p), 32);
    const fl = Math.sin(f * 2 * Math.PI / 8) * 0.55;
    b.mode = 2;
    for (const side of [-1, 1]) {
      const xa = -0.58, xm = -0.8, xb = -0.98, ra = sqR(0.58) * 0.95, rm = sqR(0.8) * 0.95, rb = sqR(0.98);
      const tipy = side * (rm + 0.32 * Math.cos(fl)), tipz = 0.32 * Math.sin(fl);
      b.mode = 2; b.tri(xa, side * ra, 0, xm, side * rm, 0.01, xm - 0.03, tipy, tipz, c.fin);
      b.mode = 2; b.tri(xm, side * rm, 0.01, xb, side * rb, 0, xm - 0.03, tipy, tipz, mul(c.fin, 0.88));
      b.mode = 2; b.tri(xa, side * ra, 0, xm - 0.03, tipy, tipz, xa + 0.05, side * (ra + 0.1 * Math.cos(fl)), 0.1 * Math.sin(fl), mul(c.fin, 1.05));
    }
    out.fins.push(b.geometry());
  }
  // arm segment: pentagonal frustum, length 1, radius 1 -> 0.8, pale suckers underneath
  b = new MeshBuilder(makeRng(700 + p), 32);
  b.ref(0.5, 0, 0);
  for (let k = 0; k < 5; k++) {
    const th0 = k * 2 * Math.PI / 5 + Math.PI / 5, th1 = (k + 1) * 2 * Math.PI / 5 + Math.PI / 5;
    const zr = Math.cos((k + 0.5) * 2 * Math.PI / 5 + Math.PI / 5);
    const col = zr < -0.5 ? c.under : merge(c.arm, c.body, zr > 0.5 ? 0.3 : 0);
    b.quad(0, Math.sin(th0), Math.cos(th0), 0, Math.sin(th1), Math.cos(th1), 1.08, Math.sin(th1) * 0.8, Math.cos(th1) * 0.8, 1.08, Math.sin(th0) * 0.8, Math.cos(th0) * 0.8, col);
  }
  out.seg = b.geometry();
  // tentacle club
  b = new MeshBuilder(makeRng(800 + p), 32);
  b.octa(0.5, 0, 0, 0.6, 0.28, 0.24, c.arm);
  b.octa(0.5, 0, -0.1, 0.45, 0.22, 0.18, c.under);
  out.club = b.geometry();
  return out;
}

const partsCache = {};
const parts = (p) => (partsCache[p] ??= buildParts(p));
const MAT = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });

// ---- small vector helpers on plain arrays (game space)
const gm = new THREE.Matrix4(), m3 = new THREE.Matrix4();
// game-space transform with basis (fx..), (yx..), (zx..) scaled by sx, sy, sz at (x, y, z) -> three matrix
function setBasis(out, x, y, z, f, Y, U, sx, sy, sz) {
  gm.set(f[0] * sx, Y[0] * sy, U[0] * sz, x,
         f[1] * sx, Y[1] * sy, U[1] * sz, y,
         f[2] * sx, Y[2] * sy, U[2] * sz, z,
         0, 0, 0, 1);
  return out.copy(P).multiply(gm).multiply(P);
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// A squid rig. State in game units / radians: x, y, z, yaw (forward = cos yaw, -sin yaw), pitch (> 0 nose
// up), roll; L total length; spread 0..1 (arm crown opening); tent 0..1 with target tx, ty, tz.
// oct: octopus mode (8 long arms, no tentacles, swims mantle-first, no fins)
export function createSquidRig(scene, palette = 0, oct = false) {
  const flashPal = palette === 0 ? 1 : palette;
  const pa = parts(palette), pb = parts(flashPal);
  const group = new THREE.Group();
  group.matrixAutoUpdate = false;
  const mk = (g) => { const m = new THREE.Mesh(g, MAT); m.matrixAutoUpdate = false; m.frustumCulled = false; scene.add(m); return m; };
  const mantle = mk(pa.mantle), head = mk(pa.head), fin = mk(pa.fins[0]);
  const segs = new THREE.InstancedMesh(pa.seg, MAT, 54), clubs = new THREE.InstancedMesh(pa.club, MAT, 2);
  for (const m of [segs, clubs]) { m.frustumCulled = false; scene.add(m); }

  const s = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, L: 30, spread: 0, tent: 0, tx: 0, ty: 0, tz: 0, fin: Math.random() * 8, pulse: Math.random() * 6.28 };
  const n = [], ax = [], ay = [], az = [];
  function init() {
    const ML = s.L / 2.1;
    for (let a = 0; a < 10; a++) {
      n[a] = oct ? (a >= 8 ? 0 : 6) : (a >= 8 ? 7 : 5);
      for (let i = 0; i <= n[a]; i++) {
        ax[a * 10 + i] = Math.cos(s.yaw) * ML * (0.21 + i * 0.18);
        ay[a * 10 + i] = -Math.sin(s.yaw) * ML * (0.21 + i * 0.18);
        az[a * 10 + i] = 0;
      }
    }
  }

  // body axes (rolled), as scr_squid_anim builds them
  const axes = () => {
    const yaw = oct ? s.yaw + Math.PI : s.yaw, pitch = oct ? -s.pitch : s.pitch;        // octopus: mantle first
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(s.roll), sr = Math.sin(s.roll);
    const f = [cp * cy, -cp * sy, sp];
    const r0 = [sy, cy, 0], u0 = [-sp * cy, sp * sy, cp];
    const r = [r0[0] * cr - u0[0] * sr, r0[1] * cr - u0[1] * sr, -u0[2] * sr];
    const u = [u0[0] * cr + r0[0] * sr, u0[1] * cr + r0[1] * sr, u0[2] * cr];
    return { f, r, u };
  };

  // one simulation step of the arms; mv: swimming speed (units / step), boost 0..1; t: game time
  function anim(mv, boost, t) {
    const ML = s.L / 2.1, { f, r, u } = axes(), spread = Math.max(0, Math.min(1, s.spread));
    s.pulse += 0.05 + mv * 0.03 + boost * 0.12;
    s.fin += 0.16 + mv * 0.05; if (s.fin >= 8) s.fin -= 8;
    for (let a = 0; a < 10; a++) {
      const isT = a >= 8;
      const th = !isT ? (a + 0.5) * 2 * Math.PI / 8 : a === 8 ? Math.PI * 0.62 : -Math.PI * 0.62;
      const st = Math.sin(th), ct = Math.cos(th), rr = 0.1 * ML;
      const ox = r[0] * st + u[0] * ct, oy = r[1] * st + u[1] * ct, oz = r[2] * st + u[2] * ct;
      const bx = s.x + f[0] * ML * 0.21 + ox * rr, by = s.y + f[1] * ML * 0.21 + oy * rr, bz = s.z + f[2] * ML * 0.21 + oz * rr;
      ax[a * 10] = bx - s.x; ay[a * 10] = by - s.y; az[a * 10] = bz - s.z;
      let dx, dy, dz, seg, follow;
      if (!isT) {
        const k = 0.1 + spread * 0.95;
        dx = f[0] + ox * k; dy = f[1] + oy * k; dz = f[2] + oz * k;
        seg = oct ? ML * 0.27 : ML * 0.18 * (1 - 0.12 * spread); follow = 0.33;
      } else {
        dx = f[0] + ox * 0.07 - u[0] * 0.05; dy = f[1] + oy * 0.07 - u[1] * 0.05; dz = f[2] + oz * 0.07 - u[2] * 0.05;
        seg = ML * (0.17 + 0.17 * s.tent); follow = 0.45 + s.tent * 0.4;
      }
      let px = bx, py = by, pz = bz;
      for (let i = 1; i <= n[a]; i++) {
        const w1 = Math.sin(t * 2.6 + a * 1.9 - i * 0.75) * 0.17 * (i / n[a]) * (1 - spread * 0.5);
        const w2 = Math.cos(t * 2.1 + a * 1.3 - i * 0.6) * 0.13 * (i / n[a]);
        let ex = dx + r[0] * w1 + u[0] * w2, ey = dy + r[1] * w1 + u[1] * w2, ez = dz + r[2] * w1 + u[2] * w2;
        if (!isT) {
          const k = spread * 0.32 * (i / n[a]);       // an opening crown curls its tips inwards
          ex -= ox * k; ey -= oy * k; ez -= oz * k;
        } else if (s.tent > 0.01) {
          const gx = s.tx - px, gy = s.ty - py, gz = s.tz - pz, l = Math.max(0.001, Math.hypot(gx, gy, gz));
          ex = lerp(ex, gx / l, s.tent); ey = lerp(ey, gy / l, s.tent); ez = lerp(ez, gz / l, s.tent);
        }
        let l = Math.max(0.001, Math.hypot(ex, ey, ez));
        const idx = a * 10 + i;
        let qx = lerp(s.x + ax[idx], px + ex / l * seg, follow), qy = lerp(s.y + ay[idx], py + ey / l * seg, follow), qz = lerp(s.z + az[idx], pz + ez / l * seg, follow);
        const gx = qx - px, gy = qy - py, gz = qz - pz;
        l = Math.max(0.001, Math.hypot(gx, gy, gz));
        qx = px + gx / l * seg; qy = py + gy / l * seg; qz = pz + gz / l * seg;
        ax[idx] = qx - s.x; ay[idx] = qy - s.y; az[idx] = qz - s.z;
        px = qx; py = qy; pz = qz;
      }
    }
  }

  // draw at position (x, y, z) (interpolated); flash: use the bright palette this frame
  function draw(x, y, z, flash) {
    const pp = flash ? pb : pa;
    if (mantle.geometry !== pp.mantle) { mantle.geometry = pp.mantle; head.geometry = pp.head; segs.geometry = pp.seg; clubs.geometry = pp.club; }
    fin.geometry = pp.fins[Math.floor(s.fin) % 8];
    fin.visible = !oct && mantle.visible;
    const ML = s.L / 2.1, pul = Math.sin(s.pulse), { f, r, u } = axes();
    // local y axis completes a right-handed frame with forward and up
    const Y = cross(u, f);
    setBasis(mantle.matrix, x, y, z, f, Y, u, ML * (1 + pul * 0.035), ML * (1 - pul * 0.07), ML * (1 - pul * 0.07));
    fin.matrix.copy(mantle.matrix);
    setBasis(head.matrix, x, y, z, f, Y, u, ML, ML, ML);
    let k = 0;
    for (let a = 0; a < 10; a++) {
      if (!n[a]) continue;
      let rad = oct ? 0.075 * ML : a < 8 ? 0.044 * ML : 0.024 * ML;
      const tap = oct ? 0.78 : a < 8 ? 0.8 : 0.9;
      for (let i = 0; i < n[a]; i++) {
        const i0 = a * 10 + i, i1 = i0 + 1;
        const d = [ax[i1] - ax[i0], ay[i1] - ay[i0], az[i1] - az[i0]], l = Math.hypot(d[0], d[1], d[2]);
        if (l < 0.001) { segs.setMatrixAt(k++, m3.makeScale(0, 0, 0)); continue; }
        const dir = [d[0] / l, d[1] / l, d[2] / l];
        let side = cross([0, 0, 1], dir);
        side = Math.hypot(side[0], side[1]) < 1e-4 ? [0, 1, 0] : norm(side);
        segs.setMatrixAt(k++, setBasis(m3, x + ax[i0], y + ay[i0], z + az[i0], dir, side, cross(dir, side), l, rad, rad));
        rad *= tap;
      }
      if (a >= 8) {
        const i1 = a * 10 + n[a], i0 = i1 - 1;
        const d = [ax[i1] - ax[i0], ay[i1] - ay[i0], az[i1] - az[i0]], l = Math.hypot(d[0], d[1], d[2]) || 1;
        const dir = [d[0] / l, d[1] / l, d[2] / l];
        let side = cross([0, 0, 1], dir);
        side = Math.hypot(side[0], side[1]) < 1e-4 ? [0, 1, 0] : norm(side);
        clubs.setMatrixAt(a - 8, setBasis(m3, x + ax[i1] - d[0] * 0.6, y + ay[i1] - d[1] * 0.6, z + az[i1] - d[2] * 0.6, dir, side, cross(dir, side), ML * 0.2, ML * 0.055, ML * 0.05));
      }
    }
    segs.count = k;
    segs.instanceMatrix.needsUpdate = true;
    clubs.instanceMatrix.needsUpdate = true;
    clubs.visible = !oct && mantle.visible;
  }

  function setVisible(v) { for (const m of [mantle, head, fin, segs, clubs]) m.visible = v; }
  function remove() { for (const m of [mantle, head, fin, segs, clubs]) scene.remove(m); segs.dispose(); clubs.dispose(); }
  return { s, init, anim, draw, setVisible, remove };
}
