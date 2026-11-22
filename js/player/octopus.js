// Player octopus - port of scr_oct_move, scr_oct_arms, scr_oct_camo, scr_oct_ground, scr_oct_support
// (27_octopus.gml), the soft mantle of scr_char_anim and the octopus part of scr_squid_draw.
// It crawls on the bottom: the middle of an arm grips the seabed and pulls the body along while the free
// outer half curls and waves; only arms that are not neighbours step together. Off the bottom it jets in
// strokes (one per Dash press, mantle first) or rows with W / S, and its heavy body sinks. Sitting still it
// takes the colours of the ground and of plants nearby, in patches like a real octopus.
// Per-step numbers and degrees as in the original (fixed 1/60 s steps).
import * as THREE from 'three';
import { parts } from '../creatures/squidModel.js';
import { terrainH, biomeAt, vnoise, hash2, clamp, lerp } from '../world/terrain.js';
import { merge, mul, rgb } from '../mesh/builder.js';
import { axes, gameMatrix, toThree, segMatrix } from '../mesh/xform.js';

const D = Math.PI / 180;
const approach = (v, t, s) => (v < t ? Math.min(v + s, t) : Math.max(v - s, t));
const pdir = (x1, y1, x2, y2) => Math.atan2(-(y2 - y1), x2 - x1) / D;
const angdiff = (a, b) => { let d = a - b; while (d > 180) d -= 360; while (d <= -180) d += 360; return d; };
const rnd = Math.random, range = (a, b) => a + rnd() * (b - a);
const sqr = (v) => v * v;

// material tinted towards a colour by an amount (the camouflage), before the water fog
function tintMaterial(instanced) {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  m.userData.tint = { value: new THREE.Vector4(0, 0, 0, 0) };
  m.onBeforeCompile = (sh) => {
    if (instanced) {
      sh.vertexShader = 'attribute vec4 aTint;\nvarying vec4 vTint;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvTint = aTint;');
      sh.fragmentShader = 'varying vec4 vTint;\n' + sh.fragmentShader.replace('#include <fog_fragment>', 'gl_FragColor.rgb = mix(gl_FragColor.rgb, vTint.rgb, vTint.a);\n#include <fog_fragment>');
    } else {
      sh.uniforms.uTint = m.userData.tint;
      sh.fragmentShader = 'uniform vec4 uTint;\n' + sh.fragmentShader.replace('#include <fog_fragment>', 'gl_FragColor.rgb = mix(gl_FragColor.rgb, uTint.rgb, uTint.a);\n#include <fog_fragment>');
    }
  };
  m.customProgramCacheKey = () => (instanced ? 'tintI' : 'tintU');
  return m;
}

export function createOctopus(scene, world) {
  const pa = parts(4);
  const mk = (g) => { const m = new THREE.Mesh(g, tintMaterial(false)); m.matrixAutoUpdate = false; m.frustumCulled = false; scene.add(m); return m; };
  const mantle = mk(pa.mantle), patch = mk(pa.patch), head = mk(pa.head);
  patch.material.transparent = true; patch.material.depthWrite = false; patch.renderOrder = 1;
  const NA = 8, NJ = 8;
  const segs = new THREE.InstancedMesh(pa.seg, tintMaterial(true), NA * NJ);
  const tintAttr = new THREE.InstancedBufferAttribute(new Float32Array(NA * NJ * 4), 4);
  tintAttr.setUsage(THREE.DynamicDrawUsage);
  segs.geometry = pa.seg.clone();
  segs.geometry.setAttribute('aTint', tintAttr);
  segs.frustumCulled = false;
  scene.add(segs);
  const meshes = [mantle, patch, head, segs];
  const g1 = new THREE.Matrix4(), g2 = new THREE.Matrix4(), m3 = new THREE.Matrix4();
  const cc = rgb(204, 186, 134), pc = rgb(104, 128, 52);

  const o = {};
  const ax = [], ay = [], az = [];
  function reset(pl) {
    Object.assign(o, {
      look: 0, gnd: 0, jet: 0, atk: 0, atkId: null, camo: 0, plant: 0, row: 0, rph: 0, push: 0, stroke: 0,
      vx: 0, vy: 0, vz: 0, byaw: pl.yaw, bpitch: -30, dx: Math.cos(pl.yaw * D) * Math.cos(-30 * D), dy: -Math.sin(pl.yaw * D) * Math.cos(-30 * D), dz: Math.sin(-30 * D),
      h0: -99999, sgx: 0, sgy: 0, px0: pl.x, py0: pl.y,
      ly: 0, vly: 0, lp: 0, vlp: 0, st: 1, vst: 0, pyaw: pl.yaw, ppitch: -30, pspd: 0, sag: 0, side: rnd() < 0.5 ? -1 : 1,
      cc: cc.slice(), pc: pc.slice(), tc: cc.slice(), tp: pc.slice(), tpl: 0, ink: 100, inkCd: 0, inkTrail: 0, pulse: 0,
      ok: [], su: [], gx: [], gy: [], gz: [], fx: [], fy: [], fz: [], tx: [], ty: [], tz: [], af: [], ap: [], aa: [], thr: [],
    });
    for (let k = 0; k < NA; k++) {
      o.ok[k] = false; o.su[k] = -1; o.gx[k] = pl.x; o.gy[k] = pl.y; o.gz[k] = pl.z;
      // every arm has its own tempo, phase, reach and the distance the body may pass before it steps
      o.af[k] = range(0.75, 1.3); o.ap[k] = rnd() * 2 * Math.PI; o.aa[k] = range(0.75, 1.25); o.thr[k] = range(0.2, 0.3);
      for (let i = 0; i <= NJ; i++) { ax[k * 10 + i] = 0; ay[k * 10 + i] = 0; az[k * 10 + i] = 0; }
    }
  }

  // seabed height including the rocks lying on it (low domes over their footprint)
  function ground(px, py) {
    let h = terrainH(px, py);
    const c = world.chunkAt(px, py);
    if (!c) return h;
    for (const it of c.items) if (it.t === 0 || it.t === 1) {
      const r = 26 * it.s, d = Math.hypot(px - it.x, py - it.y);
      if (d < r) h = Math.max(h, it.z + r * 0.5 * Math.sqrt(1 - sqr(d / r)));
    }
    return h;
  }
  // ground plane under the octopus: the highest of five points, plus the local slope
  function support(pl, ML) {
    const r = ML * 0.6 + 4, h0 = ground(pl.x, pl.y), h1 = ground(pl.x + r, pl.y), h2 = ground(pl.x - r, pl.y), h3 = ground(pl.x, pl.y + r), h4 = ground(pl.x, pl.y - r);
    o.px0 = pl.x; o.py0 = pl.y;
    o.sgx = (h1 - h2) / (2 * r); o.sgy = (h3 - h4) / (2 * r);
    o.h0 = Math.max(h0, (h1 + h2) / 2, (h3 + h4) / 2);
  }
  const plane = (x, y) => o.h0 + o.sgx * (x - o.px0) + o.sgy * (y - o.py0);

  // what lies under the octopus -> target colours: ground (sand / rock) and plant
  function camoSample(pl) {
    const px = pl.x, py = pl.y, bed = terrainH(px, py), bio = biomeAt(px, py, bed);
    let n1 = vnoise(px / 110 + 13.3, py / 110 + 4.4), gc, rc;
    switch (bio) {
      case 0: gc = merge(rgb(204, 186, 134), rgb(166, 148, 104), n1); rc = rgb(150, 142, 124); break;
      case 1: gc = merge(rgb(196, 172, 140), rgb(150, 126, 120), n1); rc = rgb(122, 116, 120); break;
      case 2: gc = merge(rgb(132, 126, 84), rgb(98, 104, 70), n1); rc = rgb(98, 102, 96); break;
      default: gc = merge(rgb(66, 64, 78), rgb(48, 50, 62), n1); rc = rgb(60, 60, 70);
    }
    n1 = vnoise(px / 260 + 71.7, py / 260 + 23.1);
    if (bio <= 2 && n1 > 0.66) gc = merge(gc, rgb(104, 140, 76), (n1 - 0.66) * 1.6);
    if (bio === 1 && n1 < 0.32) gc = merge(gc, rgb(214, 150, 150), (0.32 - n1) * 1.4);
    let rk = false, plnt = 0, plc = o.tp;
    const c = world.chunkAt(px, py);
    if (c) {
      for (const it of c.items) {
        const d = Math.hypot(px - it.x, py - it.y);
        switch (it.t) {
          case 0: case 1: case 15: if (d < 34 * it.s + 8) rk = true; break;
          case 2: if (d < 50 * it.s) { plnt = 1; plc = rgb(226, 126, 96); } break;
          case 3: if (d < 50 * it.s) { plnt = 1; plc = rgb(210, 172, 112); } break;
          case 4: if (d < 50 * it.s) { plnt = 1; plc = rgb(190, 80, 170); } break;
          case 5: if (d < 45 * it.s) { plnt = 1; plc = rgb(240, 120, 170); } break;
          case 6: if (d < 55 * it.s) { plnt = 1; plc = rgb(100, 150, 60); } break;
          case 9: if (d < 45 * it.s) { plnt = 1; plc = rgb(240, 180, 60); } break;
        }
      }
      const k = c.kelpList || [];
      for (let i = 0; i < k.length; i += 7) if (Math.hypot(px - k[i + 1], py - k[i + 2]) < 60) { plnt = 1; plc = rgb(104, 128, 52); }
    }
    o.tc = rk ? rc : gc; o.tp = plc; o.tpl = plnt;
  }

  // scr_oct_move. ctx: { creatures, fx, frame, steer(left, right, rate, inp), aim(), edible(c) }
  function move(pl, inp, ctx) {
    const L = pl.L, ML = L / 2.1;
    const maxs = (2.0 + L * 0.008) * 0.95 * (1 - pl.slow);
    const cl = L * 0.2 + 3;              // body height above the bottom while crawling
    const fwd = inp.swim > 0, back = inp.back;
    // gaze: the stick / arrows tilt the view; released, it slowly levels out
    const lr = 1.6, tp = 65 * inp.pitch;
    if (Math.abs(inp.pitch) > 0.05) pl.pv = approach(pl.pv, clamp((tp - o.look) * 0.15, -lr, lr), lr * 0.1);
    else pl.pv = approach(pl.pv, clamp(-o.look * 0.03, -0.5, 0.5), 0.05);
    o.look = clamp(o.look + pl.pv, -70, 70);
    pl.pitch = o.look;
    ctx.aim();
    ctx.steer(2.8 / (1 + L / 500) * 1.06, inp);
    const hx = Math.cos(pl.yaw * D), hy = -Math.sin(pl.yaw * D), cp = Math.cos(pl.pitch * D);
    let fx = hx * cp, fy = hy * cp, fz = Math.sin(pl.pitch * D);
    // prey ahead (in the direction of the gaze): the octopus gets ready to grab it
    let best = null;
    if (ctx.frame() % 2 === 0) {
      let bd = L * 2.4 + 30;
      for (const c of ctx.creatures.list) {
        if (c.dead || c.grabbed || !ctx.edible(c)) continue;
        const ex = c.x - pl.x, ey = c.y - pl.y, ez = c.z - pl.z, d = Math.hypot(ex, ey, ez);
        if (d < bd + c.len * 0.5 && ((ex * fx + ey * fy + ez * fz) / Math.max(0.001, d) > 0.45 || d < L * 0.8)) { bd = d; best = c; }
      }
    } else {
      best = o.atkId;
      if (best && (best.dead || (best.grabbed && best !== pl.grab))) best = null;
    }
    if (pl.grab) best = pl.grab;
    o.atkId = best;
    o.atk = approach(o.atk, best ? 1 : 0, 0.08);
    // jet in strokes: every Dash press is one stroke of all eight arms, mantle first; each costs stamina
    const can = pl.st >= 10 && !pl.exh;
    let tgt = null;
    if (o.atk > 0.5 && best) tgt = best; else if (pl.lock && !pl.lock.dead) tgt = pl.lock;
    if (tgt) { const ex = tgt.x - pl.x, ey = tgt.y - pl.y, ez = tgt.z - pl.z, d = Math.max(0.001, Math.hypot(ex, ey, ez)); fx = ex / d; fy = ey / d; fz = ez / d; }
    if (inp.boostHit && can) {
      o.vx += fx * maxs * 2.1; o.vy += fy * maxs * 2.1; o.vz += fz * maxs * 2.1;
      const d = Math.hypot(o.vx, o.vy, o.vz);
      if (d > maxs * 3.4) { o.vx *= maxs * 3.4 / d; o.vy *= maxs * 3.4 / d; o.vz *= maxs * 3.4 / d; }
      pl.st -= 13; pl.stDelay = 45;
      o.stroke = 1; o.jet = 1; o.push = 1;
      ctx.sound?.('jet');
      for (let k = 0; k < 6; k++) ctx.fx.bubble(pl.x + range(-4, 4), pl.y + range(-4, 4), pl.z + range(-3, 3), -fx + range(-0.4, 0.4), -fy + range(-0.4, 0.4), range(0.3, 0.9), range(1.2, 2.6) * (1 + L / 200), 150);
    }
    if (pl.stDelay > 0) pl.stDelay--; else pl.st = Math.min(pl.stmax, pl.st + 15 / 60);
    if (pl.exh && pl.st >= pl.stmax * 0.25) pl.exh = false;
    o.push = Math.max(0, o.push - 0.04);
    pl.boost = o.push;
    o.jet = approach(o.jet, 0, 0.025);
    // W / S off the bottom: leaning head first, pushing with all arms in a slow rhythm
    o.row = approach(o.row, o.gnd < 0.5 && o.jet < 0.5 && (fwd || back) ? 1 : 0, 0.04);
    if (o.row > 0.01) o.rph += 0.075;
    if (ctx.frame() % 3 === 0 || o.h0 < -9999) support(pl, ML);
    let bed = plane(pl.x, pl.y);
    if (pl.z - bed < L * 0.9 + 14 && o.jet < 0.5) {
      // crawling: the arms carry the body along the bottom and over its bumps
      const ts = fwd ? maxs : back ? -maxs * 0.55 : 0;
      o.vx = lerp(o.vx, hx * ts, 0.08); o.vy = lerp(o.vy, hy * ts, 0.08);
      o.vz = lerp(o.vz, clamp((bed + cl - pl.z) * 0.08, -1.2, 1.5), 0.15);
    } else {
      // open water: strokes, otherwise the body glides on; the heavy body keeps sinking
      let ts = fwd ? maxs * 0.6 : back ? -maxs * 0.4 : 0;
      ts *= 0.35 + 1.3 * Math.max(0, -Math.cos(o.rph)) * o.row;
      o.vx *= 0.993; o.vy *= 0.993;
      if ((fwd || back) && (o.vx * hx + o.vy * hy) * Math.sign(ts) < Math.abs(ts)) { o.vx = lerp(o.vx, hx * ts, 0.05); o.vy = lerp(o.vy, hy * ts, 0.05); }
      o.vz = lerp(o.vz, -(0.8 + L * 0.004), 0.02);
    }
    pl.vx = o.vx + pl.kx; pl.vy = o.vy + pl.ky; pl.vz = o.vz + pl.kz;
    pl.x += pl.vx; pl.y += pl.vy; pl.z += pl.vz;
    pl.dist += Math.hypot(pl.vx, pl.vy, pl.vz) * 0.02;
    pl.kx *= 0.9; pl.ky *= 0.9; pl.kz *= 0.9;
    bed = plane(pl.x, pl.y);
    if (pl.z < bed + cl * 0.7) { pl.z = bed + cl * 0.7; if (o.vz < 0) o.vz = 0; }
    if (pl.z > 1000 - L * 0.3 - 12) { pl.z = 1000 - L * 0.3 - 12; if (o.vz > 0) o.vz = 0; }
    pl.spd = o.vx * hx + o.vy * hy;
    o.gnd = approach(o.gnd, pl.z - bed < L * 0.9 + 14 && o.jet < 0.4 ? 1 : 0, 0.06);
    // where the arm crown points: at the prey, backwards while jetting, forward-down while crawling,
    // straight down while sinking; it turns gradually and a reversal goes through "down"
    let tx, ty, tz;
    if (o.atk > 0.5 && best) { tx = best.x - pl.x; ty = best.y - pl.y; tz = best.z - pl.z; }
    else if (o.jet > 0.3) {
      const sp = Math.hypot(o.vx, o.vy, o.vz);
      if (sp > 0.5) { tx = -o.vx; ty = -o.vy; tz = -o.vz; } else { tx = -fx; ty = -fy; tz = -fz; }
    } else if (o.gnd > 0.5) { tx = hx; ty = hy; tz = -0.65; }
    else {
      tx = hx * 0.35; ty = hy * 0.35; tz = -1;
      let l = Math.max(0.001, Math.hypot(tx, ty, tz)); tx /= l; ty /= l; tz /= l;
      if (o.row > 0.01) {
        const sp = back && !fwd ? -1 : 1;
        tx = lerp(tx, -hx * sp * 0.9, o.row); ty = lerp(ty, -hy * sp * 0.9, o.row); tz = lerp(tz, -0.45, o.row);
      }
      const sp = Math.hypot(o.vx, o.vy), k = clamp((sp - 0.3) / 1.1, 0, 1) * (1 - o.row);
      if (k > 0) { l = Math.max(0.001, Math.hypot(o.vx, o.vy, o.vz * 0.5)); tx = lerp(tx, -o.vx / l, k); ty = lerp(ty, -o.vy / l, k); tz = lerp(tz, -o.vz * 0.5 / l, k); }
    }
    let l = Math.max(0.001, Math.hypot(tx, ty, tz)); tx /= l; ty /= l; tz /= l;
    let cx = o.dx, cy = o.dy, cz = o.dz;
    if (cx * tx + cy * ty + cz * tz < 0.2) cz -= 0.12;
    const spd = o.jet < 0.3 && o.gnd < 0.5 && o.atk < 0.5 ? 0.05 : 0.12;
    cx = lerp(cx, tx, spd); cy = lerp(cy, ty, spd); cz = lerp(cz, tz, spd);
    l = Math.max(0.001, Math.hypot(cx, cy, cz)); cx /= l; cy /= l; cz /= l;
    o.dx = cx; o.dy = cy; o.dz = cz;
    if (Math.hypot(cx, cy) > 0.02) o.byaw = pdir(0, 0, cx, cy);
    o.bpitch = Math.atan2(cz, Math.hypot(cx, cy)) / D;
    // skin colour: changes only while the octopus sits still on the bottom
    if (ctx.frame() % 4 === 0) camoSample(pl);
    o.cc = merge(o.cc, o.tc, 0.18); o.pc = merge(o.pc, o.tp, 0.18);
    o.plant = approach(o.plant, o.tpl, 0.06);
    if (o.gnd > 0.6 && o.jet < 0.2 && o.atk < 0.5 && !fwd && !back && Math.hypot(o.vx, o.vy) < 0.4) o.camo = approach(o.camo, 0.8, 0.045);
    else o.camo = approach(o.camo, 0, 0.04);
    // visibility for the creatures: walking on the bottom it is noticed at half the distance; sitting still
    // in camouflage predators do not see it at all
    pl.vis = 1;
    if (o.gnd > 0.6 && o.jet < 0.3) pl.vis = 0.5;
    if (o.camo > 0.55 && Math.abs(pl.spd) < 1.2 && !pl.hidden) { pl.hidden = true; pl.vis = 0.12; }
  }

  // the crown direction (mouth side of the body) - the octopus eats wherever its arms point
  const crown = () => ({ x: Math.cos(o.byaw * D) * Math.cos(o.bpitch * D), y: -Math.sin(o.byaw * D) * Math.cos(o.bpitch * D), z: Math.sin(o.bpitch * D) });

  // ink: a dense cloud left behind, the octopus jets forward out of it (scr_ink_release)
  function inkRelease(pl, ctx) {
    const L = pl.L;
    o.ink -= 40; o.inkCd = 30;
    ctx.sound?.('ink');
    const bx = pl.x - Math.cos(pl.yaw * D) * L * 0.35, by = pl.y + Math.sin(pl.yaw * D) * L * 0.35, bz = pl.z;
    ctx.fx.addInk(bx, by, bz, L * 0.8 + 25, L * 2.4 + 90, 420);
    for (let k = 0; k < 30; k++) {
      const s = (L * 0.55 + 26) * range(0.7, 1.3), t = rnd();
      const p = ctx.fx.add(1, bx + range(-1, 1) * L * 0.7, by + range(-1, 1) * L * 0.7, bz + range(-0.6, 0.6) * L,
                           range(-0.35, 0.35) - pl.vx * 0.15, range(-0.35, 0.35) - pl.vy * 0.15, range(-0.1, 0.15), s, 380 + Math.floor(rnd() * 120), [6 + 28 * t, 4 + 18 * t, 14 + 34 * t], 1);
      if (p) p.grow = range(1.6, 2.3);
    }
    pl.kx += Math.cos(pl.yaw * D) * (5 + L * 0.03); pl.ky -= Math.sin(pl.yaw * D) * (5 + L * 0.03);
    pl.shake = Math.max(pl.shake, 3);
    o.inkTrail = 36;
  }
  // ink keeps streaming from the siphon for a moment: a visible trail leading to the cloud
  function inkStep(pl, ctx) {
    o.ink = Math.min(100, o.ink + 100 / (12 * 60));
    o.inkCd--;
    if (o.inkTrail > 0) {
      o.inkTrail--;
      if (o.inkTrail % 2 === 0) {
        const L = pl.L, t = rnd();
        const p = ctx.fx.add(1, pl.x - Math.cos(pl.yaw * D) * L * 0.5 + range(-3, 3), pl.y + Math.sin(pl.yaw * D) * L * 0.5 + range(-3, 3), pl.z + range(-3, 3),
                             range(-0.2, 0.2), range(-0.2, 0.2), range(-0.05, 0.1), (L * 0.3 + 10) * range(0.8, 1.2), 300 + Math.floor(rnd() * 100), [6 + 24 * t, 4 + 16 * t, 14 + 30 * t], 0.85);
        if (p) p.grow = range(2.5, 3.5);
      }
    }
  }

  // soft mantle on a spring: lags behind turns and climbs, stretches when the octopus accelerates
  function mantleSpring(pl, time) {
    const dy = angdiff(o.byaw, o.pyaw), dp = o.bpitch - o.ppitch, dv = pl.spd - o.pspd;
    o.pyaw = o.byaw; o.ppitch = o.bpitch; o.pspd = pl.spd;
    o.sag = approach(o.sag, (o.gnd > 0.6 ? 1 : 0) * (1 - 0.75 * Math.min(1, Math.abs(pl.spd) / 1.6)), 0.006);
    let tg = clamp(-dy * 7, -35, 35) + o.sag * 40 * o.side + Math.sin(time * 0.7) * 3 * o.gnd;
    o.vly += (tg - o.ly) * 0.05; o.vly *= 0.86; o.ly += o.vly;
    tg = clamp(-dp * 6, -30, 30) + o.sag * 22;
    o.vlp += (tg - o.lp) * 0.05; o.vlp *= 0.86; o.lp += o.vlp;
    tg = 1 + clamp(dv * 2.2 + pl.boost * 0.22 + Math.abs(pl.spd) * 0.015, -0.12, 0.38);
    o.vst += (tg - o.st) * 0.12; o.vst *= 0.78; o.st += o.vst;
  }

  // the 8 arms: soft chains of 8 joints following pose targets with a lag growing to the tip (scr_oct_arms)
  function arms(pl, time, frame) {
    const ML = pl.L / 2.1, seg = ML * 0.215, Larm = seg * NJ;
    const { f, Y: rr, u } = axes(o.byaw * D, o.bpitch * D, pl.roll * D);
    // the original's "right" vector is -Y in this right-handed frame; the crown is symmetric
    const r = rr;
    const gnd = o.gnd, atk = o.atk, tm = time;
    o.stroke = Math.max(0, o.stroke - 0.035);
    let open = 0.55 * Math.pow(o.stroke, 1.5), openq = 0.55 * Math.pow(Math.max(0, o.stroke - 0.12) / 0.88, 1.5);
    if (o.row > 0.01) { open = Math.max(open, o.row * 0.5 * (0.5 + 0.5 * Math.sin(o.rph))); openq = Math.max(openq, o.row * 0.5 * (0.5 + 0.5 * Math.sin(o.rph - 0.7))); }
    const jet = Math.max(o.jet, o.row);
    const pr = pl.grab && !pl.grab.dead ? pl.grab : null;
    if (gnd < 0.2) for (let a = 0; a < NA; a++) o.ok[a] = false;
    const sp2 = Math.hypot(pl.vx, pl.vy);
    // half rate: four arms per step (alternating) with a doubled follow - the body moves every step
    for (let a = frame % 2; a < NA; a += 2) {
      const th = (a + 0.5) * 2 * Math.PI / 8, st = Math.sin(th), ct = Math.cos(th);
      const rdx = r[0] * st + u[0] * ct, rdy = r[1] * st + u[1] * ct, rdz = r[2] * st + u[2] * ct;
      const tgx = r[0] * ct - u[0] * st, tgy = r[1] * ct - u[1] * st, tgz = r[2] * ct - u[2] * st;
      const bx = pl.x + f[0] * ML * 0.21 + rdx * 0.1 * ML, by = pl.y + f[1] * ML * 0.21 + rdy * 0.1 * ML, bz = pl.z + f[2] * ML * 0.21 + rdz * 0.1 * ML;
      const af = o.af[a], aph = o.ap[a], aa = o.aa[a];
      const nz = (Math.sin(tm * 0.9 * af + aph) + 0.5 * Math.sin(tm * 2.3 * af + aph * 1.7)) / 1.5;
      let w = Math.sin(tm * 1.7 * af + aph) * 0.12 * aa + nz * 0.06;
      const P3 = (p0, p1, p2, s) => sqr(1 - s) * p0 + 2 * (1 - s) * s * p1 + s * s * p2;
      // open water: a loose parachute of slowly curling arms
      const tf = [bx + f[0] * Larm * 0.5 + rdx * Larm * (0.62 + w), by + f[1] * Larm * 0.5 + rdy * Larm * (0.62 + w), bz + f[2] * Larm * 0.5 + rdz * Larm * (0.62 + w)];
      const qf = [bx + f[0] * Larm * 0.15 + rdx * Larm * 0.42, by + f[1] * Larm * 0.15 + rdy * Larm * 0.42, bz + f[2] * Larm * 0.15 + rdz * Larm * 0.42];
      // swimming head first: the arms stream behind; open spreads them like an umbrella
      const k0 = open * (0.85 + 0.3 * aa);
      const tj = [bx + f[0] * Larm * (0.95 - 0.4 * k0) + rdx * Larm * (0.05 + k0), by + f[1] * Larm * (0.95 - 0.4 * k0) + rdy * Larm * (0.05 + k0), bz + f[2] * Larm * (0.95 - 0.4 * k0) + rdz * Larm * (0.05 + k0)];
      const qj = [bx + f[0] * Larm * 0.5 + rdx * Larm * (0.04 + openq * 0.8), by + f[1] * Larm * 0.5 + rdy * Larm * (0.04 + openq * 0.8), bz + f[2] * Larm * 0.5 + rdz * Larm * (0.04 + openq * 0.8)];
      // prey ahead: arms spread wide; holding it, they wrap round
      let ta, qa;
      if (pr) {
        ta = [pr.x + rdx * pr.len * 0.35, pr.y + rdy * pr.len * 0.35, pr.z + rdz * pr.len * 0.35];
        qa = [(bx + ta[0]) / 2 + rdx * Larm * 0.2, (by + ta[1]) / 2 + rdy * Larm * 0.2, (bz + ta[2]) / 2 + rdz * Larm * 0.2];
      } else {
        ta = [bx + f[0] * Larm * 0.7 + rdx * Larm * 0.55, by + f[1] * Larm * 0.7 + rdy * Larm * 0.55, bz + f[2] * Larm * 0.7 + rdz * Larm * 0.55];
        qa = [bx + f[0] * Larm * 0.35 + rdx * Larm * 0.42, by + f[1] * Larm * 0.35 + rdy * Larm * 0.42, bz + f[2] * Larm * 0.35 + rdz * Larm * 0.42];
      }
      let G, C1, C2, T2, ox = 0, oy = 0;
      if (gnd > 0.01) {
        // walking: the grip point is planted on the seabed and moves on when the body has passed it
        const ang = pl.yaw + 22.5 + a * 45;
        ox = Math.cos(ang * D); oy = -Math.sin(ang * D);
        const ix = pl.x + ox * Larm * 0.44 + pl.vx * 16, iy = pl.y + oy * Larm * 0.44 + pl.vy * 16;
        if (!o.ok[a]) { o.gx[a] = ix; o.gy[a] = iy; o.gz[a] = ground(ix, iy) + 1; o.ok[a] = true; o.su[a] = -1; }
        let lift = 0;
        if (o.su[a] < 0) {
          const d = Math.hypot(o.gx[a] - ix, o.gy[a] - iy);
          if ((d > Larm * o.thr[a] && o.su[(a + 1) % 8] < 0 && o.su[(a + 7) % 8] < 0) || Math.hypot(o.gx[a] - pl.x, o.gy[a] - pl.y) > Larm * 0.75) {
            o.fx[a] = o.gx[a]; o.fy[a] = o.gy[a]; o.fz[a] = o.gz[a];
            o.tx[a] = ix; o.ty[a] = iy; o.tz[a] = ground(ix, iy) + 1;
            o.su[a] = 0;
          }
        } else {
          o.su[a] += (0.04 + sp2 * 0.02) * af * 2;
          let uu = Math.min(1, o.su[a]); uu = uu * uu * (3 - 2 * uu);
          o.gx[a] = lerp(o.fx[a], o.tx[a], uu); o.gy[a] = lerp(o.fy[a], o.ty[a], uu); o.gz[a] = lerp(o.fz[a], o.tz[a], uu);
          lift = Math.sin(uu * Math.PI) * Larm * 0.1 * aa;
          if (o.su[a] >= 1) o.su[a] = -1;
        }
        G = [o.gx[a], o.gy[a], o.gz[a] + lift + Larm * 0.02];
        // the free outer half curls outwards and up, slowly waving
        T2 = [G[0] + ox * Larm * 0.28 * aa - oy * Larm * 0.12 * Math.sin(tm * 1.1 * af + aph), G[1] + oy * Larm * 0.28 * aa + ox * Larm * 0.12 * Math.sin(tm * 1.1 * af + aph), G[2] + Larm * (0.13 + 0.09 * nz)];
        C1 = [(bx + G[0]) / 2, (by + G[1]) / 2, (bz + G[2]) / 2 + Larm * 0.16];
        C2 = [G[0] + ox * Larm * 0.2, G[1] + oy * Larm * 0.2, G[2] + Larm * 0.01];
      }
      ax[a * 10] = bx - pl.x; ay[a * 10] = by - pl.y; az[a * 10] = bz - pl.z;
      for (let i = 1; i <= NJ; i++) {
        const s = i / NJ;
        let px = P3(bx, qf[0], tf[0], s), py = P3(by, qf[1], tf[1], s), pz = P3(bz, qf[2], tf[2], s);
        if (gnd > 0.01) {
          let qx, qy, qz;
          if (s <= 0.55) { const s2 = s / 0.55; qx = P3(bx, C1[0], G[0], s2); qy = P3(by, C1[1], G[1], s2); qz = P3(bz, C1[2], G[2], s2); }
          else { const s2 = (s - 0.55) / 0.45; qx = P3(G[0], C2[0], T2[0], s2); qy = P3(G[1], C2[1], T2[1], s2); qz = P3(G[2], C2[2], T2[2], s2); }
          px = lerp(px, qx, gnd); py = lerp(py, qy, gnd); pz = lerp(pz, qz, gnd);
        }
        if (jet > 0.01) { px = lerp(px, P3(bx, qj[0], tj[0], s), jet); py = lerp(py, P3(by, qj[1], tj[1], s), jet); pz = lerp(pz, P3(bz, qj[2], tj[2], s), jet); }
        if (atk > 0.01) { px = lerp(px, P3(bx, qa[0], ta[0], s), atk); py = lerp(py, P3(by, qa[1], ta[1], s), atk); pz = lerp(pz, P3(bz, qa[2], ta[2], s), atk); }
        // travelling waves; the very tip curls inwards while walking
        let k = Math.min(1, gnd + o.row);
        w = Math.sin(tm * 2.2 * af + aph - i * 0.75) * Larm * 0.03 * s * aa * (1 - jet * 0.6) + k * Math.sin(tm * 1.8 * af + aph - i * 0.9) * Larm * 0.06 * aa * Math.max(0, s - 0.35);
        const w2 = k * Math.cos(tm * 1.5 * af + aph * 1.3 - i * 0.8) * Larm * 0.045 * aa * Math.max(0, s - 0.3) - gnd * Larm * 0.05 * s * s * s * (1 + nz * 0.5);
        px += tgx * w + rdx * w2; py += tgy * w + rdy * w2; pz += tgz * w + rdz * w2;
        let kf = 0.55 * (1 - 0.62 * s) * (1 - 0.3 * k * s); kf = 1 - sqr(1 - kf);
        const idx = a * 10 + i;
        ax[idx] = lerp(ax[idx], px - pl.x, kf); ay[idx] = lerp(ay[idx], py - pl.y, kf); az[idx] = lerp(az[idx], pz - pl.z, kf);
        // no joint below the ground plane (slope and rocks included)
        k = plane(pl.x + ax[idx], pl.y + ay[idx]) + 1.2;
        if (pl.z + az[idx] < k) az[idx] = k - pl.z;
      }
    }
  }

  // draw at (x, y, z); fog colour patches: camouflage tints ground / plant colours in blotches
  function draw(pl, x, y, z, time) {
    const ML = pl.L / 2.1, pul = Math.sin(pl.pulseT || 0);
    const { f, Y, u } = axes(o.byaw * D, o.bpitch * D, pl.roll * D);
    gameMatrix(g1, x, y, z, f, Y, u);
    // mantle: soft sac on a spring - stretched, swinging
    // (the original scales, then turns about z, then about y, then applies the body rotation)
    g2.copy(g1).multiply(m3.makeRotationY(-o.lp * D)).multiply(m3.makeRotationZ(-o.ly * D))
      .multiply(m3.makeScale(ML * o.st * (1 + pul * 0.05), ML / Math.sqrt(o.st) * (1 - pul * 0.08), ML / Math.sqrt(o.st) * (1 - pul * 0.08)));
    toThree(mantle.matrix, g2);
    patch.matrix.copy(mantle.matrix);
    toThree(head.matrix, g2.copy(g1).multiply(m3.makeScale(ML, ML, ML)));
    const cam = o.camo, base = [o.cc[0] / 255, o.cc[1] / 255, o.cc[2] / 255];
    mantle.material.userData.tint.value.set(base[0], base[1], base[2], cam * 0.32);
    head.material.userData.tint.value.set(base[0], base[1], base[2], cam * 0.32);
    patch.visible = cam > 0.003 && mantle.visible;
    // the patches fade in already in the ground colour (never as white blotches)
    patch.material.userData.tint.value.set(base[0], base[1], base[2], 1);
    patch.material.opacity = Math.min(1, cam * 1.15);
    // arms: patches along them, slowly shifting; plants nearby lend some of them their colour
    let k = 0, rad;
    const tA = tintAttr.array;
    for (let a = 0; a < NA; a++) {
      rad = 0.07 * ML;
      for (let i = 0; i < NJ; i++) {
        const i0 = a * 10 + i, i1 = i0 + 1;
        segs.setMatrixAt(k, segMatrix(m3, x + ax[i0], y + ay[i0], z + az[i0], x + ax[i1], y + ay[i1], z + az[i1], rad));
        let col = o.cc, amt = 0;
        if (cam > 0.003) {
          const h = Math.abs(hash2(a * 7 + i * 3, 11));
          amt = Math.sin(i * 1.3 + a * 2.1 + time * (0.3 + a * 0.04)) > -0.1 ? cam * (0.85 + 0.15 * Math.abs(hash2(a * 5 + i, 23))) : cam * 0.3;
          if (o.plant > 0.05 && h < 0.34) col = merge(o.cc, o.pc, o.plant);
          else if (h > 0.86) col = merge(o.cc, rgb(176, 96, 80), 0.35);
          else if (h > 0.7) col = mul(o.cc, 0.88);
        }
        tA[k * 4] = col[0] / 255; tA[k * 4 + 1] = col[1] / 255; tA[k * 4 + 2] = col[2] / 255; tA[k * 4 + 3] = amt;
        k++;
        rad *= 0.84;
      }
    }
    segs.instanceMatrix.needsUpdate = true;
    tintAttr.needsUpdate = true;
  }

  return {
    o, reset, move, arms, draw, crown, inkRelease, inkStep, mantleSpring,
    setVisible(v) { for (const m of meshes) m.visible = v; if (v) patch.visible = o.camo > 0.003; },
  };
}
