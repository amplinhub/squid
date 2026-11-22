// Effects - port of 10_fx.gml (particles, bones), the wake and vents of 16_plankton.gml, the bone / claw /
// diver gear models (04_models.gml, 24_diver.gml, 28_crab.gml).
// Particles: 0 blood puff, 1 ink puff, 2 bubble. Puffs and bubbles are two Points objects refilled every
// frame (one draw call each), coloured by the water fog like everything else.
// Bones: sink, tumble, settle on the seabed and fade; lost diver gear floats up and bobs at the surface.
import * as THREE from 'three';
import { MeshBuilder, rgb } from '../mesh/builder.js';
import { SURF_Z, CS, terrainH, makeRng, clamp } from '../world/terrain.js';
import { setTransform } from '../creatures/creatures.js';

const rnd = Math.random, range = (a, b) => a + rnd() * (b - a), irandom = (n) => Math.floor(rnd() * (n + 1));
const approach = (v, t, s) => (v < t ? Math.min(v + s, t) : Math.max(v - s, t));
const MAXP = 400;
const WHITE = rgb(255, 255, 255);

// ---------------------------------------------------------------- models
function buildModels() {
  const M = {};
  let b = new MeshBuilder(makeRng(900), 512);
  b.tube(-0.45, 0, 0, 0.33, 0, 0, 0.014, 0.011, 4, WHITE);
  for (let i = 0; i < 7; i++) {
    const x0 = -0.14 + i * 0.065;
    for (const s of [-1, 1]) {
      b.tube(x0, 0, 0, x0 - 0.02, s * 0.06, -0.04, 0.006, 0.005, 3, WHITE);
      b.tube(x0 - 0.02, s * 0.06, -0.04, x0 - 0.045, s * 0.045, -0.12, 0.005, 0.002, 3, WHITE);
    }
    b.tube(x0, 0, 0, x0 - 0.025, 0, 0.07, 0.005, 0.002, 3, WHITE);
  }
  b.blob(0.42, 0, 0.005, 0.1, 0.055, 0.065, 3, 5, 0.12, WHITE, null);
  b.tube(0.36, 0, -0.035, 0.52, 0, -0.07, 0.01, 0.004, 3, WHITE);
  b.tube(-0.45, 0, 0, -0.6, 0, 0.09, 0.006, 0.002, 3, WHITE);
  b.tube(-0.45, 0, 0, -0.6, 0, -0.09, 0.006, 0.002, 3, WHITE);
  b.tube(-0.45, 0, 0, -0.62, 0, 0, 0.006, 0.002, 3, WHITE);
  M.bones = b.geometry();
  b = new MeshBuilder(makeRng(901), 64);
  b.tube(-0.5, 0, 0, 0.5, 0, 0, 0.06, 0.05, 4, WHITE);
  b.octa(0.5, 0, 0, 0.09, 0.09, 0.09, WHITE);
  b.octa(-0.5, 0, 0, 0.09, 0.09, 0.09, WHITE);
  M.bone1 = b.geometry();
  // crab claw
  const c1 = rgb(176, 60, 34), c2 = rgb(216, 98, 52), c4 = rgb(44, 26, 24);
  b = new MeshBuilder(makeRng(2323), 128); b.jit = 0.05;
  b.tube(-0.5, 0, 0, -0.15, 0.02, 0.02, 0.09, 0.11, 6, c1);
  b.blob(-0.12, 0.02, 0.02, 0.06, 0.06, 0.06, 2, 6, 0, rgb(238, 176, 126), null);
  b.blob(0.1, 0, 0.02, 0.22, 0.15, 0.12, 3, 8, 0.03, c1, c2);
  b.tube(0.25, -0.03, -0.02, 0.5, -0.06, -0.03, 0.06, 0.015, 5, c4);
  b.tube(0.25, 0.03, 0.06, 0.48, 0.03, 0.1, 0.05, 0.013, 5, c4);
  M.claw = b.geometry();
  // diver's tank and a fin
  b = new MeshBuilder(makeRng(4321), 256);
  b.tube(0.5, 0, 0, -0.5, 0, 0, 0.17, 0.17, 10, rgb(204, 210, 218));
  b.blob(0.5, 0, 0, 0.08, 0.17, 0.17, 3, 10, 0, rgb(214, 220, 228), null);
  b.blob(-0.5, 0, 0, 0.08, 0.17, 0.17, 3, 10, 0, rgb(190, 196, 204), null);
  b.tube(0.28, 0, 0, 0.2, 0, 0, 0.18, 0.18, 10, rgb(26, 26, 30));
  b.tube(-0.2, 0, 0, -0.28, 0, 0, 0.18, 0.18, 10, rgb(26, 26, 30));
  b.tube(0.56, 0, 0, 0.7, 0, 0, 0.05, 0.05, 6, rgb(40, 40, 44));
  b.blob(0.72, 0, 0, 0.05, 0.09, 0.06, 2, 6, 0, rgb(150, 150, 156), null);
  M.tank = b.geometry();
  b = new MeshBuilder(makeRng(4322), 64);
  b.tube(0.5, 0, 0, 0.25, 0, 0, 0.1, 0.09, 6, rgb(18, 18, 20));
  b.mode = 2; b.quad(0.25, -0.12, 0, 0.25, 0.12, 0, -0.5, 0.26, 0.02, -0.5, -0.26, 0.02, rgb(250, 212, 34));
  b.tube(0.25, -0.12, 0, -0.5, -0.26, 0.02, 0.02, 0.02, 3, rgb(20, 20, 24));
  b.tube(0.25, 0.12, 0, -0.5, 0.26, 0.02, 0.02, 0.02, 3, rgb(20, 20, 24));
  M.dfin = b.geometry();
  return M;
}

// point sprites with a texture, normal blending, water fog (game coordinates in, three out)
function makePoints(scene, tex, max) {
  const p = new Float32Array(max * 3), c = new Float32Array(max * 4), s = new Float32Array(max);
  const g = new THREE.BufferGeometry();
  const at = (a, n) => { const b = new THREE.BufferAttribute(a, n); b.setUsage(THREE.DynamicDrawUsage); return b; };
  g.setAttribute('position', at(p, 3)); g.setAttribute('aColor', at(c, 4)); g.setAttribute('aSize', at(s, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTex: { value: tex }, uPx: { value: 500 } }]),
    vertexShader: `attribute vec4 aColor; attribute float aSize; uniform float uPx; varying vec4 vCol;
      #include <fog_pars_vertex>
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float d = max(1.0, -mvPosition.z);
        gl_PointSize = clamp(2.0 * aSize * uPx / d, 1.0, 600.0);
        gl_Position = projectionMatrix * mvPosition;
        vCol = aColor;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform sampler2D uTex; varying vec4 vCol;
      #include <fog_pars_fragment>
      void main() { vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vCol.rgb * t.rgb, vCol.a * t.a);
        if (gl_FragColor.a < 0.004) discard;
        #include <fog_fragment>
      }`,
    transparent: true, depthWrite: false, fog: true,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  pts.renderOrder = 2;
  scene.add(pts);
  let n = 0;
  return {
    mat: m,
    begin() { n = 0; },
    add(x, y, z, col, a, size) {
      if (n >= max) return;
      p[n * 3] = x; p[n * 3 + 1] = z; p[n * 3 + 2] = y;
      c[n * 4] = col[0] / 255; c[n * 4 + 1] = col[1] / 255; c[n * 4 + 2] = col[2] / 255; c[n * 4 + 3] = a;
      s[n] = size; n++;
    },
    end() { g.setDrawRange(0, n); for (const k of ['position', 'aColor', 'aSize']) g.attributes[k].needsUpdate = true; },
  };
}

// env: { player: () => ({x, y, z, yaw, pitch, spd, boost, L, alive}), cap: () => particle budget,
//        view: world.view, chunks: () => world chunks, gfx: () => 0..2 }
export function createFx(scene, env) {
  const models = buildModels();
  const loader = new THREE.TextureLoader();
  const puffs = makePoints(scene, loader.load('assets/tex/soft.png'), MAXP);
  const bubbles = makePoints(scene, loader.load('assets/tex/bubble.png'), MAXP);
  const parts = [], bones = [], inks = [];
  const wake = { sp: 0, fx: 0, fy: 0, fz: 0, x: 0, y: 0, z: 0, k: 0 };
  let frame = 0;

  // scr_fx_add(kind, x, y, z, vx, vy, vz, size, life, colour, alpha)
  function add(kind, x, y, z, vx, vy, vz, size, life, col, a) {
    if (parts.length >= Math.min(MAXP, env.cap())) return null;
    const p = { kind, x, y, z, px: x, py: y, pz: z, vx, vy, vz, sz: size, sz0: size, life, lmax: life, col, a0: a, grow: 1, ph: rnd() * 6.28 };
    parts.push(p);
    return p;
  }
  // soft cloud of puffs that expands and dissolves; ink: dark
  function cloud(x, y, z, size, ink, count) {
    for (let k = 0; k < count; k++) {
      const s = size * range(0.35, 0.65);
      let c, a;
      if (ink) { const t = rnd(); c = [10 + 30 * t, 8 + 22 * t, 18 + 32 * t]; a = 0.85; }
      else { const t = rnd(); c = [130 + 70 * t, 6 + 20 * t, 18 + 18 * t]; a = range(0.35, 0.6); }
      const p = add(ink ? 1 : 0, x + range(-0.6, 0.6) * size, y + range(-0.6, 0.6) * size, z + range(-0.4, 0.4) * size,
                    range(-0.25, 0.25), range(-0.25, 0.25), range(-0.05, 0.25), s, 150 + irandom(110), c, a);
      if (p) p.grow = range(2.0, 3.2);
    }
  }
  function bubble(x, y, z, vx, vy, vz, size, life) { return add(2, x, y, z, vx, vy, vz, size, life, [255, 255, 255], 0.85); }

  function addBone(geo, x, y, z, sc, yaw, pitch, roll, v, life, opt = {}) {
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide, color: opt.tint ? new THREE.Color(opt.tint) : 0xffffff });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);
    bones.push({ mesh, x, y, z, px: x, py: y, pz: z, sc, yaw, pitch, roll, vx: v[0], vy: v[1], vz: v[2], vyaw: v[3], vroll: v[4], life, lmax: life, settled: false, deb: !!opt.deb, id: rnd() * 100 });
  }
  // red cloud + skeleton + loose bones (scr_fx_kill)
  function kill(x, y, z, len, yaw) {
    cloud(x, y, z, Math.max(len * 1.5, 20), 0, clamp(Math.round(len / 6), 6, 11));
    const tint = 0xe4decc;
    addBone(models.bones, x, y, z, len, yaw, range(-20, 20), range(-40, 40), [0, 0, -0.05, range(-1.2, 1.2), range(-1.5, 1.5)], 900, { tint });
    for (let k = 0; k < 2; k++)
      addBone(models.bone1, x, y, z, len * range(0.12, 0.2), rnd() * 360, rnd() * 90, 0, [range(-0.6, 0.6), range(-0.6, 0.6), range(0.1, 0.4), range(-4, 4), range(-4, 4)], 600, { tint });
    for (let k = 0; k < 6; k++) bubble(x + range(-5, 5), y + range(-5, 5), z, range(-0.2, 0.2), range(-0.2, 0.2), range(0.4, 1.0), range(0.8, 2) * (1 + len / 80), 200);
  }
  // what is left of an eaten creature: a crab leaves its claws, everything else blood and bones
  function remains(kind, x, y, z, len, yaw) {
    if (kind !== 10) { kill(x, y, z, len, yaw); return; }
    cloud(x, y, z, Math.max(len * 1.2, 14), 0, 5);
    for (let k = 0; k < 2; k++)
      addBone(models.claw, x + range(-3, 3), y + range(-3, 3), z, len * 0.45, yaw + k * 180 + range(-30, 30), range(-20, 20), range(-40, 40),
              [range(-0.4, 0.4), range(-0.4, 0.4), range(0, 0.2), range(-2, 2), range(-2, 2)], 900);
    for (let k = 0; k < 4; k++) bubble(x + range(-4, 4), y + range(-4, 4), z, range(-0.2, 0.2), range(-0.2, 0.2), range(0.4, 1.0), range(0.8, 1.6), 200);
  }
  // a diver leaves his tank or a pair of fins, floating up
  function diverGear(x, y, z, len) {
    const deb = (geo, dx, sc) => addBone(geo, x + dx, y, z, sc, rnd() * 360, range(-30, 30), range(-30, 30), [range(-0.2, 0.2), range(-0.2, 0.2), 0.05, range(-0.4, 0.4), range(-0.5, 0.5)], 3000, { deb: true });
    if (rnd() < 0.5) deb(models.tank, 0, len * 0.3); else { deb(models.dfin, 0, len * 0.2); deb(models.dfin, 4, len * 0.2); }
  }

  // wake of the swimming squid: pushes things aside along its body, swirls them behind it (scr_wake)
  function wakeAt(x, y, z) {
    wake.x = wake.y = wake.z = wake.k = 0;
    if (wake.sp <= 0) return;
    const L = env.player().L, pl = env.player();
    const dx = x - pl.x, dy = y - pl.y, dz = z - pl.z;
    const al = dx * wake.fx + dy * wake.fy + dz * wake.fz;
    if (al < -L * 2.4 || al > L * 0.9) return;
    let px = dx - wake.fx * al, py = dy - wake.fy * al, pz = dz - wake.fz * al;
    const Rin = L * 0.85 + 18, r = Math.hypot(px, py, pz) + 0.01;
    if (r > Rin * 2) return;
    const k = 1 - r / (Rin * 2);
    px /= r; py /= r; pz /= r;
    if (al > -L * 0.45) { const sw = k * wake.sp * 0.5; wake.x = px * sw; wake.y = py * sw; wake.z = pz * sw; }
    else {
      const sw = k * wake.sp * 0.6;
      const tx = wake.fy * pz - wake.fz * py, ty = wake.fz * px - wake.fx * pz, tz = wake.fx * py - wake.fy * px;
      wake.x = tx * sw - px * sw * 0.25 + wake.fx * sw * 0.3;
      wake.y = ty * sw - py * sw * 0.25 + wake.fy * sw * 0.3;
      wake.z = tz * sw - pz * sw * 0.25 + wake.fz * sw * 0.3;
    }
    wake.k = k * wake.sp;
  }

  // seabed vents: chains of bubbles from chunks near the camera
  function vents(cam) {
    for (const c of env.chunks()) {
      if (c.stage < 1 || !c.vents.length) continue;
      if (Math.hypot(cam.x - c.x, cam.y - c.y) > 450 + CS * 0.5) continue;
      c.vents.forEach((v, k) => {
        if ((Math.floor(frame / 4) + v.p) % v.per !== 0) return;
        if (env.gfx() === 0 && k % 2 === 1) return;
        const n = 1 + irandom(1);
        for (let i = 0; i < n; i++) bubble(v.x + range(-3, 3), v.y + range(-3, 3), v.z + rnd() * 4, range(-0.1, 0.1), range(-0.1, 0.1), range(0.5, 1.0), range(0.9, 3.2), 260);
      });
    }
  }

  // one 1/60 s step; cam: camera position (game units)
  function step(t, cam) {
    frame++;
    const pl = env.player(), D = Math.PI / 180;
    wake.sp = 0;
    if (pl.alive) {
      const cp = Math.cos(pl.pitch * D);
      wake.fx = Math.cos(pl.yaw * D) * cp; wake.fy = -Math.sin(pl.yaw * D) * cp; wake.fz = Math.sin(pl.pitch * D);
      wake.sp = clamp((Math.abs(pl.spd) - 1.0) / 5, 0, 1.6) + pl.boost * 0.4;
    }
    if (frame % 4 === 0) vents(cam);
    const vd = env.view.dist;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.px = p.x; p.py = p.y; p.pz = p.z;
      if (--p.life <= 0) { parts.splice(i, 1); continue; }
      if (p.kind === 2) {
        // bubble: rises, wobbles, bursts at the surface; the squid's wake pushes it
        if (wake.sp > 0) { wakeAt(p.x, p.y, p.z); p.vx += wake.x; p.vy += wake.y; p.vz += wake.z * 0.6; }
        p.vz = Math.min(p.vz + 0.01, 1.4);
        p.x += p.vx + Math.sin(t * 5 + p.ph) * 0.15; p.y += p.vy + Math.cos(t * 4 + p.ph) * 0.15; p.z += p.vz;
        p.vx *= 0.97; p.vy *= 0.97;
        if (p.z > SURF_Z - 6) parts.splice(i, 1);
        else if (frame % 20 === 0 && Math.abs(p.x - cam.x) + Math.abs(p.y - cam.y) > vd * 1.3) parts.splice(i, 1);
      } else {
        if (p.kind === 1 && wake.sp > 0) { wakeAt(p.x, p.y, p.z); p.vx += wake.x * 0.35; p.vy += wake.y * 0.35; p.vz += wake.z * 0.35; }
        p.x += p.vx; p.y += p.vy; p.z += p.vz;
        p.vx *= 0.985; p.vy *= 0.985; p.vz *= 0.985;
        p.sz = p.sz0 * (1 + (p.grow - 1) * (1 - p.life / p.lmax));
      }
    }
    for (let i = inks.length - 1; i >= 0; i--) {
      const k = inks[i];
      if (--k.life <= 0) { inks.splice(i, 1); continue; }
      if (k.life < 60) k.rad *= 0.97; else k.rad = approach(k.rad, k.rmax, k.rmax / 50);
    }
    for (let i = bones.length - 1; i >= 0; i--) {
      const b = bones[i];
      b.px = b.x; b.py = b.y; b.pz = b.z;
      if (--b.life <= 0) { scene.remove(b.mesh); b.mesh.material.dispose(); bones.splice(i, 1); continue; }
      if (b.deb) {
        b.x += b.vx; b.y += b.vy; b.vx *= 0.99; b.vy *= 0.99;
        if (b.z < SURF_Z - b.sc * 0.25) { b.vz = approach(b.vz, 0.28, 0.002); b.z += b.vz; b.yaw += b.vyaw; b.roll += b.vroll; b.pitch += (0 - b.pitch) * 0.004; }
        else { b.z = SURF_Z - b.sc * 0.25 + Math.sin(t * 1.4 + b.id) * 1.2; b.roll = Math.sin(t * 1.1 + b.id) * 8; }
      } else if (!b.settled) {
        b.x += b.vx; b.y += b.vy; b.z += b.vz;
        b.vx *= 0.97; b.vy *= 0.97;
        b.vz = approach(b.vz, -0.32, 0.004);
        b.yaw += b.vyaw; b.roll += b.vroll; b.vyaw *= 0.995; b.vroll *= 0.99;
        if (b.z < terrainH(b.x, b.y) + b.sc * 0.08 + 1) { b.settled = true; b.roll = (rnd() < 0.5 ? 0 : 180) + range(-12, 12); b.pitch = range(-6, 6); }
      }
    }
  }

  // draw (a: interpolation); px: pixels per unit at distance 1
  function render(a, cam, pxPerUnit) {
    puffs.mat.uniforms.uPx.value = pxPerUnit; bubbles.mat.uniforms.uPx.value = pxPerUnit;
    puffs.begin(); bubbles.begin();
    for (const p of parts) {
      const x = p.px + (p.x - p.px) * a, y = p.py + (p.y - p.py) * a, z = p.pz + (p.z - p.pz) * a;
      let al = p.a0 * Math.min(1, p.life / p.lmax * 2.5);
      if (p.kind !== 2) al *= Math.min(1, (p.lmax - p.life) / 12 + 0.25);
      (p.kind === 2 ? bubbles : puffs).add(x, y, z, p.col, al, p.sz);
    }
    puffs.end(); bubbles.end();
    const D = Math.PI / 180;
    for (const b of bones) {
      b.mesh.material.opacity = clamp(b.life / 200, 0, 1);
      setTransform(b.mesh.matrix, b.px + (b.x - b.px) * a, b.py + (b.y - b.py) * a, b.pz + (b.z - b.pz) * a, b.yaw * D, b.pitch * D, b.roll * D, b.sc, b.sc, b.sc);
    }
  }

  function inInk(x, y, z, margin) { return inks.some((k) => Math.hypot(x - k.x, y - k.y, z - k.z) < k.rad + margin); }
  function addInk(x, y, z, rad, rmax, life) { inks.push({ x, y, z, rad, rmax, life }); }

  function clear() {
    parts.length = 0; inks.length = 0;
    for (const b of bones) { scene.remove(b.mesh); b.mesh.material.dispose(); }
    bones.length = 0;
  }

  return { add, bubble, cloud, kill, remains, diverGear, step, render, inInk, addInk, inkCount: () => inks.length, clear, count: () => parts.length };
}
