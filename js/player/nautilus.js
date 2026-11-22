// Nautilus - port of scr_build_nautilus / scr_naut_draw (22_chars.gml) and scr_naut_tongue_draw
// (27_octopus.gml). The shell is a logarithmic spiral (whorl x3 per turn, like the real Nautilus pompilius)
// with tiger stripes on the older part; hood, pinhole eyes, siphon, 22 waving tentacles, a pink tongue.
// Model space: +x forward (tentacles), z up, size 1 = the creature's length L.
import * as THREE from 'three';
import { MeshBuilder, rgb, merge, mul } from '../mesh/builder.js';
import { makeRng } from '../world/terrain.js';
import { axes, gameMatrix, toThree, segMatrix } from '../mesh/xform.js';

function build() {
  const M = {};
  const R = makeRng(777);
  const bb = Math.log(3) / (2 * Math.PI), Re = 0.3, te = 2 * Math.PI - 80 * Math.PI / 180, span = 2 * Math.PI * 1.25;
  const Cx = -0.08 - Re * Math.cos(te), Cz = -0.02 - Re * Math.sin(te);
  const NS = 46, K = 14, cx = [], cz = [], th = [], v = [];
  for (let i = 0; i <= NS; i++) {
    const t = te - span * (1 - i / NS), Rr = Re * Math.exp(bb * (t - te)), rho = 0.56 * Rr;
    const px = Cx + Rr * Math.cos(t), pz = Cz + Rr * Math.sin(t);
    cx[i] = px; cz[i] = pz; th[i] = t; v[i] = [];
    for (let k = 0; k < K; k++) { const ph = k * 2 * Math.PI / K; v[i][k] = [px + Math.cos(ph) * rho * Math.cos(t), Math.sin(ph) * rho * 0.8, pz + Math.cos(ph) * rho * Math.sin(t)]; }
  }
  let b = new MeshBuilder(R, 2048);
  b.jit = 0.05;
  for (let i = 0; i < NS; i++) {
    b.ref((cx[i] + cx[i + 1]) / 2, 0, (cz[i] + cz[i + 1]) / 2);
    const u = i / NS;
    for (let k = 0; k < K; k++) {
      const ph = (k + 0.5) * 2 * Math.PI / K, c = Math.cos(ph);
      let col = merge(rgb(246, 238, 222), rgb(226, 214, 196), 0.5 - 0.5 * c);
      const s0 = th[i] / 0.5 + 0.18 * Math.sin(ph * 2) + 0.07 * c, s = s0 - Math.floor(s0);
      if (u < 0.8 && c > -0.35 && s < 0.42) col = merge(rgb(170, 78, 44), rgb(120, 50, 32), u);
      if (c < -0.75) col = mul(col, 0.8);
      if (i === NS - 1) col = rgb(96, 60, 44);
      const k2 = (k + 1) % K, A = v[i][k], B = v[i][k2], C = v[i + 1][k2], E = v[i + 1][k];
      b.quad(A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2], E[0], E[1], E[2], col);
    }
  }
  b.ref(cx[NS] + 0.2, 0, cz[NS]);
  for (let k = 0; k < K; k++) { const A = v[NS][k], B = v[NS][(k + 1) % K]; b.tri(A[0], A[1], A[2], B[0], B[1], B[2], cx[NS] - 0.03, 0, cz[NS], rgb(50, 28, 26)); }
  M.shell = b.geometry();
  // hood: leathery cap with pale warts
  b = new MeshBuilder(R, 512);
  b.blob(0.0, 0, 0.06, 0.13, 0.125, 0.07, 4, 10, 0.12, rgb(150, 82, 52), rgb(168, 96, 60));
  for (let j = 0; j < 14; j++) {
    const a = R.random(2 * Math.PI), s = R.range(0.2, 0.85);
    b.blob(Math.cos(a) * s * 0.12, Math.sin(a) * s * 0.11, 0.06 + 0.06 * Math.sqrt(1 - s * s), 0.012, 0.012, 0.008, 2, 4, 0, rgb(234, 222, 196), null);
  }
  M.hood = b.geometry();
  // soft body in the opening: pinhole eyes, siphon
  b = new MeshBuilder(R, 512);
  b.blob(0.03, 0, -0.03, 0.11, 0.105, 0.085, 4, 10, 0.08, rgb(214, 168, 150), rgb(196, 140, 120));
  for (const j of [-1, 1]) {
    b.blob(0.07, j * 0.1, 0.0, 0.034, 0.022, 0.034, 3, 8, 0, rgb(150, 140, 132), null);
    b.blob(0.075, j * 0.118, 0.0, 0.022, 0.008, 0.022, 2, 8, 0, rgb(22, 22, 28), null);
    b.blob(0.082, j * 0.123, 0.01, 0.005, 0.003, 0.005, 2, 4, 0, rgb(255, 255, 255), null);
  }
  b.tube(0.0, 0, -0.1, 0.1, 0, -0.125, 0.03, 0.022, 8, rgb(220, 160, 140));
  M.body = b.geometry();
  // tentacle and tongue segments
  const seg = (c1, c2, taper) => {
    const s = new MeshBuilder(R, 32);
    s.ref(0.5, 0, 0);
    for (let k = 0; k < 5; k++) {
      const a0 = k * 2 * Math.PI / 5, a1 = (k + 1) * 2 * Math.PI / 5;
      s.quad(0, Math.sin(a0), Math.cos(a0), 0, Math.sin(a1), Math.cos(a1), 1.05, Math.sin(a1) * taper, Math.cos(a1) * taper, 1.05, Math.sin(a0) * taper, Math.cos(a0) * taper, merge(c1, c2, 0.5 + 0.5 * Math.cos(a0)));
    }
    return s.geometry();
  };
  M.seg = seg(rgb(236, 214, 190), rgb(206, 170, 140), 0.85);
  M.tongue = seg(rgb(250, 150, 160), rgb(200, 80, 100), 0.9);
  return M;
}

const MAT = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
const NT = 22;

export function createNautilusModel(scene) {
  const M = build();
  const mk = (g) => { const m = new THREE.Mesh(g, MAT); m.matrixAutoUpdate = false; m.frustumCulled = false; scene.add(m); return m; };
  const shell = mk(M.shell), body = mk(M.body), hood = mk(M.hood);
  const tent = new THREE.InstancedMesh(M.seg, MAT, NT * 5), tongue = new THREE.InstancedMesh(M.tongue, MAT, 9);
  for (const m of [tent, tongue]) { m.frustumCulled = false; scene.add(m); }
  const all = [shell, body, hood, tent, tongue];
  const g1 = new THREE.Matrix4(), g2 = new THREE.Matrix4(), m3 = new THREE.Matrix4();

  // s: { x, y, z, yaw, pitch, roll (degrees), L, hide, ph, open, pulse, tongue: null | { mx, my, mz, tx, ty, tz } }
  function draw(s, time) {
    const D = Math.PI / 180, S = s.L, h = s.hide, { f, Y, u } = axes(s.yaw * D, s.pitch * D, s.roll * D);
    gameMatrix(g1, s.x, s.y, s.z, f, Y, u, S, S, S);
    toThree(shell.matrix, g1);
    toThree(body.matrix, g2.copy(g1).multiply(m3.makeTranslation(-0.05 * h, 0, 0)));
    toThree(hood.matrix, g2.copy(g1).multiply(m3.makeTranslation(0.06 * h, 0, -0.05 * h)).multiply(m3.makeScale(1 + 0.25 * h, 1 + 0.15 * h, 1 + 0.2 * h)));
    // tentacles: a ring round the mouth, pulled in when hiding; a push folds them together
    let k = 0;
    tent.visible = h <= 0.95;
    if (tent.visible) {
      const sp2 = 0.32 + 0.45 * s.open - 0.26 * s.pulse;
      for (let j = 0; j < NT; j++) {
        const a = j * 2 * Math.PI / NT + 0.15, fr = Math.sin(j * 12.7) * 43.1;
        const len0 = (0.34 + 0.12 * (fr - Math.floor(fr))) * (1 - 0.93 * h), seg = len0 / 5 * S;
        const bx = 0.11 - 0.06 * h, by = Math.cos(a) * 0.055, bz = -0.035 + Math.sin(a) * 0.042;
        let px = s.x + (bx * f[0] + by * Y[0] + bz * u[0]) * S, py = s.y + (bx * f[1] + by * Y[1] + bz * u[1]) * S, pz = s.z + (bx * f[2] + by * Y[2] + bz * u[2]) * S;
        let rad = S * 0.013;
        for (let i = 0; i < 5; i++) {
          const w1 = Math.sin(s.ph * 2.6 + j * 0.9 - i * 0.7) * 0.22 * (i + 1) / 5, w2 = Math.cos(s.ph * 2.1 + j * 1.7 - i * 0.6) * 0.18 * (i + 1) / 5;
          let dx = 1, dy = Math.cos(a) * sp2 + w1, dz = Math.sin(a) * sp2 * 0.8 - 0.12 + w2;
          const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
          const qx = px + (dx * f[0] + dy * Y[0] + dz * u[0]) * seg, qy = py + (dx * f[1] + dy * Y[1] + dz * u[1]) * seg, qz = pz + (dx * f[2] + dy * Y[2] + dz * u[2]) * seg;
          tent.setMatrixAt(k++, segMatrix(m3, px, py, pz, qx, qy, qz, rad));
          rad *= 0.82; px = qx; py = qy; pz = qz;
        }
      }
      tent.instanceMatrix.needsUpdate = true;
    }
    // tongue: thin pink, sagging a little and wobbling
    tongue.visible = !!s.tongue;
    if (s.tongue) {
      const T = s.tongue, dl = Math.hypot(T.tx - T.mx, T.ty - T.my, T.tz - T.mz);
      let px = T.mx, py = T.my, pz = T.mz, rad = S * 0.022;
      for (let i = 1; i <= 9; i++) {
        const q = i / 9, sg = Math.sin(q * Math.PI) * dl * 0.08;
        const qx = T.mx + (T.tx - T.mx) * q + Math.sin(time * 21 + i) * S * 0.006, qy = T.my + (T.ty - T.my) * q, qz = T.mz + (T.tz - T.mz) * q - sg;
        tongue.setMatrixAt(i - 1, segMatrix(m3, px, py, pz, qx, qy, qz, rad));
        rad *= 0.9; px = qx; py = qy; pz = qz;
      }
      tongue.instanceMatrix.needsUpdate = true;
    }
  }
  return { draw, setVisible(v) { for (const m of all) m.visible = v; }, remove() { for (const m of all) scene.remove(m); } };
}
