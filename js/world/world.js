// Streaming world - port of 05_world.gml.
// The seabed is split into CS x CS chunks. A chunk is created when it enters loadR (beyond the visible
// range), generated deterministically from its coordinates (same rocks / plants when you come back) and
// freed beyond unloadR. Generation is spread over frames with a time budget, nearest chunk first:
// stage 0 - heights, seabed mesh, list of decor / kelp; stage 1 - decor items a few at a time; stage 2 - done.
import * as THREE from 'three';
import { CS, CN, SURF_Z, hash2, vnoise, terrainH, biomeAt, depthT, makeRng } from './terrain.js';
import { MeshBuilder, rgb, merge, mul } from '../mesh/builder.js';
import { pickDecor, buildItem } from './decor.js';
import { createKelpKit, makeKelpMeshes } from './kelp.js';

const MAX_CHUNKS = 140;

// ---- seabed face colour (scr_ground_tri)
const C = {
  s0a: rgb(204, 186, 134), s0b: rgb(166, 148, 104), s1a: rgb(196, 172, 140), s1b: rgb(150, 126, 120),
  s2a: rgb(132, 126, 84), s2b: rgb(98, 104, 70), s3a: rgb(66, 64, 78), s3b: rgb(48, 50, 62),
  algae: rgb(104, 140, 76), pink: rgb(214, 150, 150), slope: rgb(104, 108, 118),
};
function groundColour(cx, cy, cz, nz) {
  const bio = biomeAt(cx, cy, cz);
  let n1 = vnoise(cx / 110 + 13.3, cy / 110 + 4.4), col;
  switch (bio) {
    case 0: col = merge(C.s0a, C.s0b, n1); break;
    case 1: col = merge(C.s1a, C.s1b, n1); break;
    case 2: col = merge(C.s2a, C.s2b, n1); break;
    default: col = merge(C.s3a, C.s3b, n1);
  }
  n1 = vnoise(cx / 260 + 71.7, cy / 260 + 23.1);
  if (bio <= 2 && n1 > 0.66) col = merge(col, C.algae, (n1 - 0.66) * 1.6);
  if (bio === 1 && n1 < 0.32) col = merge(col, C.pink, (0.32 - n1) * 1.4);
  if (nz < 0.8) col = merge(col, C.slope, Math.min(1, Math.max(0, (0.8 - nz) * 4)));
  const f = cx / 37 + Math.sin(cy / 60) * 0.6;
  if (bio === 0 && f - Math.floor(f) < 0.5) col = mul(col, 1.06);
  return col;
}

export function createWorld(scene, atmo) {
  const chunks = new Map();
  const list = [];
  const kelpKit = createKelpKit(atmo.uTime);
  const groundMat = atmo.groundMaterial();
  const decorMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const glowMat = atmo.glowMaterial();
  let pcx = -99999, pcy = -99999, frame = 0;
  const stats = { loaded: 0, pending: 0, buildMs: 0 };
  const view = { dist: 850, loadR: 0, unloadR: 0 };

  function setView(viewDist) {
    view.dist = viewDist;
    view.loadR = viewDist + CS * 0.9;
    view.unloadR = view.loadR + CS * 1.3;
  }

  // ---------------- stage 0: heights, seabed, decor list
  function chunkTerrain(c) {
    const N = CN, cs = CS / N, x0 = c.cx * CS, y0 = c.cy * CS;
    const gx = [], gy = [], gz = [];
    let zmin = 1e9, zmax = -1e9;
    for (let i = 0; i <= N; i++) {
      gx[i] = []; gy[i] = []; gz[i] = [];
      for (let j = 0; j <= N; j++) {
        const lx = c.cx * N + i, ly = c.cy * N + j;
        // jitter from global lattice indices -> neighbouring chunks share edge vertices exactly
        let vx = x0 + i * cs + (hash2(lx * 3.17, ly * 1.71) - 0.5) * cs * 0.55;
        let vy = y0 + j * cs + (hash2(lx * 1.33, ly * 2.91) - 0.5) * cs * 0.55;
        if (i === 0 || i === N) vx = x0 + i * cs;
        if (j === 0 || j === N) vy = y0 + j * cs;
        gx[i][j] = vx; gy[i][j] = vy; gz[i][j] = terrainH(vx, vy);
        zmin = Math.min(zmin, gz[i][j]); zmax = Math.max(zmax, gz[i][j]);
      }
    }
    c.zmin = zmin; c.zmax = zmax;

    // seabed mesh, one flat colour per face
    const b = new MeshBuilder(makeRng(Math.floor(hash2(c.cx * 7.13 + 0.5, c.cy * 3.71 + 0.5) * 1e6)), N * N * 2).withUp();
    b.world = true; b.mode = 1; b.jit = 0.06;
    const tri = (i1, j1, i2, j2, i3, j3) => {
      const ax = gx[i1][j1], ay = gy[i1][j1], az = gz[i1][j1], bx = gx[i2][j2], by = gy[i2][j2], bz = gz[i2][j2];
      const ex = gx[i3][j3], ey = gy[i3][j3], ez = gz[i3][j3];
      const ux = bx - ax, uy = by - ay, uz = bz - az, vx = ex - ax, vy = ey - ay, vz = ez - az;
      const nz0 = ux * vy - uy * vx;
      const l = Math.sqrt((uy * vz - uz * vy) ** 2 + (uz * vx - ux * vz) ** 2 + nz0 * nz0);
      b.mode = 1;
      b.tri(ax, ay, az, bx, by, bz, ex, ey, ez, groundColour((ax + bx + ex) / 3, (ay + by + ey) / 3, (az + bz + ez) / 3, Math.abs(nz0) / Math.max(1e-4, l)));
    };
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) {
        if (hash2(c.cx * N + i + 0.5, c.cy * N + j + 0.25) < 0.5) { tri(i, j, i + 1, j, i + 1, j + 1); tri(i, j, i + 1, j + 1, i, j + 1); }
        else { tri(i, j, i + 1, j, i, j + 1); tri(i + 1, j, i + 1, j + 1, i, j + 1); }
      }
    c.ground = new THREE.Mesh(b.geometry(), groundMat);
    c.ground.matrixAutoUpdate = false;
    scene.add(c.ground);

    // decor candidates: type from the local biome at each point
    const R = makeRng(Math.floor(hash2(c.cx * 5.31 + 0.25, c.cy * 9.17 + 0.75) * 1e6));
    const kelp = [];
    for (let cnt = 0; cnt < 46; cnt++) {
      const px = x0 + R.random(CS), py = y0 + R.random(CS), h = terrainH(px, py), bio = biomeAt(px, py, h);
      const t = pickDecor(bio, R.next());
      if (t < 0) continue;
      if (t >= 100) {
        const v = t - 100;
        const ks = v === 0 ? R.range(160, 430) : v === 1 ? R.range(55, 120) : R.range(40, 95);
        const kw = R.range(0.8, 1.3), kr = R.random(360);
        R.random(16); R.range(0.8, 1.25);         // flipbook phase / speed of the original: now from the position
        kelp.push(v, px, py, h - 3, ks, kw, kr);
        continue;
      }
      c.items.push({ t, x: px, y: py, z: h, bio, s: R.range(0.7, 1.35), r: R.random(360), seed: Math.floor(R.random(999999)) });
    }
    // rare landmark: whale skeleton on sand or in the abyss
    const mx = (c.cx + 0.5) * CS, my = (c.cy + 0.5) * CS;
    let bio = biomeAt(mx, my, terrainH(mx, my));
    if ((bio === 0 && R.next() < 0.035) || (bio === 3 && R.next() < 0.07)) {
      const px = mx + R.range(-100, 100), py = my + R.range(-100, 100);
      c.items.push({ t: 12, x: px, y: py, z: terrainH(px, py), bio, s: R.range(0.8, 1.2), r: R.random(360), seed: Math.floor(R.random(999999)) });
    }
    // bubble vents (a few pebbles mark the spot); bubbles come with the effects stage
    let k = R.irandom(1); if (bio === 1 || bio === 3) k += R.irandom(1);
    for (let n = 0; n < k; n++) {
      const px = x0 + R.random(CS), py = y0 + R.random(CS), pz = terrainH(px, py);
      c.vents.push({ x: px, y: py, z: pz, per: 6 + R.irandom(10), p: R.irandom(20) });
      c.items.push({ t: 15, x: px, y: py, z: pz, bio, s: 0.8, r: 0, seed: Math.floor(R.random(999999)) });
    }
    c.kelp = makeKelpMeshes(kelpKit, kelp);
    for (const m of c.kelp) scene.add(m);
    c.stage = c.items.length ? 1 : 2;
    if (c.stage === 2) finishDecor(c);
  }

  function finishDecor(c) {
    if (c.builder) {
      const g = c.builder.geometry();
      if (g) { c.decor = new THREE.Mesh(g, decorMat); c.decor.matrixAutoUpdate = false; scene.add(c.decor); }
      c.builder = null;
    }
    if (c.glows.length) { c.glow = atmo.makeGlowPoints(c.glows, glowMat); scene.add(c.glow); }
    c.stage = 2;
  }

  // ---------------- stage 1: decor items within the time budget
  function chunkDecor(c, until) {
    if (!c.builder) c.builder = new MeshBuilder(makeRng(1), 2048);
    const b = c.builder;
    while (c.next < c.items.length && performance.now() < until) {
      const it = c.items[c.next++];
      b.rng = makeRng(it.seed);
      b.reset();
      buildItem(b, it, c.glows);
    }
    if (c.next >= c.items.length) finishDecor(c);
  }

  function freeChunk(c) {
    for (const m of [c.ground, c.decor, c.glow, ...c.kelp]) {
      if (!m) continue;
      scene.remove(m);
      if (!(m instanceof THREE.InstancedMesh)) m.geometry.dispose();
      else m.dispose();
    }
    chunks.delete(c.key);
  }

  function scan(px, py) {
    const r = Math.ceil(view.loadR / CS) + 1;
    for (let i = pcx - r; i <= pcx + r; i++)
      for (let j = pcy - r; j <= pcy + r; j++) {
        const cx = (i + 0.5) * CS, cy = (j + 0.5) * CS;
        if (Math.hypot(px - cx, py - cy) > view.loadR) continue;
        const key = i + ',' + j;
        if (chunks.has(key)) continue;
        const c = { cx: i, cy: j, key, x: cx, y: cy, stage: 0, items: [], next: 0, kelp: [], glows: [], vents: [],
                    ground: null, decor: null, glow: null, builder: null, zmin: 0, zmax: 0, seen: false };
        chunks.set(key, c); list.push(c);
      }
    for (let n = list.length - 1; n >= 0; n--) {
      const c = list[n], d = Math.hypot(px - c.x, py - c.y);
      if (d > view.unloadR) { freeChunk(c); list.splice(n, 1); continue; }
      if (d < view.dist + CS * 0.5) c.seen = true;
    }
    // hard memory guard: drop the farthest
    while (list.length > MAX_CHUNKS) {
      let far = 0, fd = -1;
      list.forEach((c, n) => { const d = Math.hypot(px - c.x, py - c.y); if (d > fd) { fd = d; far = n; } });
      freeChunk(list[far]); list.splice(far, 1);
    }
  }

  // generation within a time budget (ms), nearest unfinished chunk first
  function build(px, py, budgetMs) {
    const t0 = performance.now(), until = t0 + budgetMs;
    let pending = 0;
    while (performance.now() < until) {
      let best = null, bd = 1e18;
      for (const c of list) {
        if (c.stage >= 2) continue;
        const d = (px - c.x) ** 2 + (py - c.y) ** 2;
        if (d < bd) { bd = d; best = c; }
      }
      if (!best) break;
      if (best.stage === 0) chunkTerrain(best); else chunkDecor(best, until);
    }
    for (const c of list) if (c.stage < 2) pending++;
    stats.pending = pending; stats.loaded = list.length;
    stats.buildMs = stats.buildMs * 0.9 + (performance.now() - t0) * 0.1;
    return pending;
  }

  // per-frame visibility: decor, kelp and glows are left out in the far ring the fog has nearly swallowed
  function visibility(camX, camY) {
    const dDecor = view.dist * 0.92 + CS * 0.7, dGlow = view.dist * 0.75 + CS * 0.5;
    for (const c of list) {
      const d = Math.hypot(c.x - camX, c.y - camY);
      const near = d < dDecor;
      if (c.decor) c.decor.visible = near;
      for (const m of c.kelp) m.visible = near;
      if (c.glow) c.glow.visible = d < dGlow;
    }
  }

  return {
    stats, view, setView,
    chunkCount: () => list.length,
    // x, y: player position (game units); budgetMs: generation time this frame
    update(x, y, budgetMs) {
      frame++;
      const ncx = Math.floor(x / CS), ncy = Math.floor(y / CS);
      if (ncx !== pcx || ncy !== pcy || frame % 60 === 0) { pcx = ncx; pcy = ncy; scan(x, y); }
      return build(x, y, budgetMs);
    },
    visibility,
    // chunks still being built close to the visible range (used by the loading screen)
    pendingNear(x, y) {
      let k = 0;
      for (const c of list) if (c.stage < 2 && Math.hypot(x - c.x, y - c.y) < view.dist + CS * 0.8) k++;
      return k;
    },
    clear() { for (const c of list) freeChunk(c); list.length = 0; pcx = pcy = -99999; },
  };
}

export { SURF_Z, depthT };
