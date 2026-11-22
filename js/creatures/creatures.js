// Creatures - port of 07_fish.gml (init + AI), the spawning half of 05_world.gml (scr_spawn_*, scr_pick_type),
// scr_crab_step / scr_diver_step and the creature part of 11_render.gml.
// The simulation runs in the original's 1/60 s steps, so per-step numbers and degrees are kept.
// AI states: 0 wander / school, 1 flee from the player, 2 chase the player, 3 swerve after a bite,
//            4 hunt another creature, 5 lost the player (cool-down)
// Models are the original flipbooks (12 swim frames, closed / open mouth), one Mesh per creature whose
// geometry is swapped as it animates; giant squid and octopus are procedural rigs.
import * as THREE from 'three';
import { SPECIES, NTYPES } from './species.js';
import { buildCreatureFrame, meshPufferBig, LURE } from './fishMesh.js';
import { createSquidRig } from './squidModel.js';
import { MeshBuilder } from '../mesh/builder.js';
import { SURF_Z, CS, terrainH, biomeAt, makeRng, clamp, lerp } from '../world/terrain.js';

export const FLIP = 12;
const D = Math.PI / 180;
const P = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1);
const rnd = Math.random, range = (a, b) => a + rnd() * (b - a), irandom = (n) => Math.floor(rnd() * (n + 1));
const approach = (v, t, s) => (v < t ? Math.min(v + s, t) : Math.max(v - s, t));
const angdiff = (a, b) => { let d = a - b; while (d > 180) d -= 360; while (d <= -180) d += 360; return d; };
const pdir = (x1, y1, x2, y2) => Math.atan2(-(y2 - y1), x2 - x1) / D;           // GM point_direction
const pdist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);

// ---------------------------------------------------------------- models
const OPAQUE = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
const SEE_THROUGH = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide });   // alpha: 4th colour channel
const models = [];            // models[t] = { frames: [mouth 0..1][FLIP] geometry, puffer: [FLIP] }

function buildSpecies(t) {
  const sp = SPECIES[t];
  if (sp.kind === 4 || sp.kind === 8) { models[t] = null; return; }
  const m = { frames: [[], []], puffer: null };
  for (let f = 0; f < FLIP; f++) {
    for (let mo = 0; mo < 2; mo++) {
      if (mo === 1 && !sp.mouth) { m.frames[1][f] = m.frames[0][f]; continue; }
      // same seed for every frame: the facet brightness jitter must not flicker during the animation
      const b = new MeshBuilder(makeRng(t * 100 + 7), 512);
      buildCreatureFrame(b, t, sp.kind, f * 2 * Math.PI / FLIP, mo === 1);
      m.frames[mo][f] = b.geometry();
    }
  }
  if (sp.puffer) {
    m.puffer = [];
    for (let f = 0; f < FLIP; f++) { const b = new MeshBuilder(makeRng(321), 512); meshPufferBig(b, f * 2 * Math.PI / FLIP); m.puffer.push(b.geometry()); }
  }
  models[t] = m;
}
// builds all species, a few per call (yields to the loading screen); returns progress 0..1
let built = 0;
export function buildModelsStep() {
  if (built < NTYPES) buildSpecies(built++);
  return built / NTYPES;
}

// game-space basis -> three matrix (same convention as the squid rig)
const gm = new THREE.Matrix4();
export function setTransform(out, x, y, z, yaw, pitch, roll, sx, sy, sz) {
  const cy = Math.cos(yaw), sy0 = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
  const f = [cp * cy, -cp * sy0, sp], r0 = [sy0, cy, 0], u0 = [-sp * cy, sp * sy0, cp];
  const r = [r0[0] * cr - u0[0] * sr, r0[1] * cr - u0[1] * sr, -u0[2] * sr];
  const u = [u0[0] * cr + r0[0] * sr, u0[1] * cr + r0[1] * sr, u0[2] * cr];
  const Y = [u[1] * f[2] - u[2] * f[1], u[2] * f[0] - u[0] * f[2], u[0] * f[1] - u[1] * f[0]];
  gm.set(f[0] * sx, Y[0] * sy, u[0] * sz, x, f[1] * sx, Y[1] * sy, u[1] * sz, y, f[2] * sx, Y[2] * sy, u[2] * sz, z, 0, 0, 0, 1);
  return out.copy(P).multiply(gm).multiply(P);
}

// ---------------------------------------------------------------- manager
// env: { player: () => ({x, y, z, vx, vy, vz, L, tv, alive, vis, hidden}), view: world.view, frame: () => n }
export function createCreatures(scene, world, atmo, env) {
  const list = [];
  const count = new Array(NTYPES).fill(0), recent = new Array(NTYPES).fill(0);
  const glow = atmo.dynamicGlow(96);
  let nextId = 1, initialSpawn = true;
  const hooks = {};              // bite(c, dmg), threat(c), lost(c), eaten(prey, by), ink(c), bubbles(x, y, z)
  const stats = { n: 0, drawn: 0 };

  const cap = (L) => 44 + Math.min(30, L * 0.06);

  // allowed z of species t over this seabed: its band above the bottom crossed with the wide depth zone
  function band(t, bed) {
    const s = SPECIES[t];
    const lo = Math.max(bed + s.zmin + s.len * 0.3, SURF_Z - s.dhw * 5);
    const hi = Math.min(bed + s.zmax, SURF_Z - 60, SURF_Z - s.dlw * 5);
    return hi >= lo ? { lo, hi } : null;
  }
  // the usual depths
  function bandStrict(t, bed) {
    const s = SPECIES[t];
    const lo = Math.max(bed + s.zmin + s.len * 0.3, SURF_Z - s.dhi * 5);
    const hi = Math.min(bed + s.zmax, SURF_Z - 60, SURF_Z - s.dlo * 5);
    return hi >= lo ? { lo, hi } : null;
  }

  // weighted species choice from the player's size, depth range and habitat (scr_pick_type)
  const pickW = new Array(NTYPES).fill(0);
  function pickType(bed, bio, L) {
    count.fill(0);
    for (const c of list) if (c.leader === c) count[c.t]++;
    let tot = 0;
    for (let t = 0; t < NTYPES; t++) {
      pickW[t] = 0;
      const b = band(t, bed);
      if (!b) continue;
      const s = SPECIES[t], len = s.len;
      const edible = t === 9 ? L >= len * 2.2 : len <= L * 0.8;
      let w;
      if (edible) w = len >= L * 0.12 ? 1.7 : 1.2;
      else if (s.pred && len >= L * 1.25) w = len <= L * 4.5 ? 1.1 : 0.3;
      else w = 1.0;
      w *= s.abund;
      w /= 1 + count[t] * 0.55 + recent[t] * 0.45;
      switch (t) {
        case 1: if (bio === 3) w *= 0.3; break;
        case 2: w *= bio === 1 ? 2.6 : 0.25; break;
        case 4: w *= (bio === 1 || bio === 2) ? 1.5 : 0.6; break;
        case 6: if (L < 45) w *= 0.45; break;
        case 7: if (L < 60) w *= 0.5; break;
        case 8: if (L < 70) w *= 0.2; break;
        case 11: w *= bio === 1 ? 2.2 : bio === 3 ? 0.2 : 1.1; break;
        case 12: w *= bio === 1 ? 2.5 : 0.1; break;
        case 13: w *= (bio === 1 || bio === 2) ? 1.6 : 0.2; break;
        case 17: w *= bio === 1 ? 1.8 : 0.3; break;
        case 19: if (bio === 0 || bio === 2) w *= 1.4; break;
        case 20: if (bio === 1 || bio === 0) w *= 1.3; break;
        case 10: if (bio === 3) w *= 0.2; break;
        case 22: if (bio === 3) w *= 0.7; break;
        case 21: if (bio === 1) w *= 2.6; else if (bio === 3) w = 0; else w *= 1.2; break;   // divers never dive over the abyss
      }
      if (w > 0) {
        const r = b.hi - b.lo, st = bandStrict(t, bed);
        if (st) w *= 0.3 + 0.7 * clamp((Math.min(b.hi, st.hi) - Math.max(b.lo, st.lo)) / Math.max(1, r), 0, 1);
        else w *= 0.25;
        if (count[t] >= 3) w *= 0.15;
        w = Math.pow(w, 0.6);
      }
      pickW[t] = w; tot += w;
    }
    if (tot <= 0) return -1;
    let r = rnd() * tot;
    for (let t = 0; t < NTYPES; t++) recent[t] *= 0.92;
    for (let t = 0; t < NTYPES; t++) { r -= pickW[t]; if (r <= 0) { recent[t]++; return t; } }
    return 0;
  }

  // ---------------- creature
  function create(t, x, y, z, leader) {
    const s = SPECIES[t];
    const c = {
      id: nextId++, t, sp: s, x, y, z, px: x, py: y, pz: z, len: s.len * range(0.82, 1.22),
      yaw: rnd() * 360, pitch: 0, roll: 0, spd: s.cruise, tspd: s.cruise, state: 0, timer: irandom(60),
      ph: rnd() * FLIP, mouth: 0, mtarget: 0, biteCd: 0, stingCd: 0, bed: terrainH(x, y), bedAhead: 0, bedT: irandom(7),
      wyaw: 0, wt: irandom(120), grabbed: false, prey: null, dyaw: 0, huntT: irandom(50),
      lvx: 0, lvy: 0, lvz: 0, blindT: 0, lostc: 0, chaseT: 0, inflate: 0, inked: false, swal: 0,
      bubT: irandom(150), bubN: 0, scared: false, crT: 0, crAv: 1, crAvt: 0, dead: false, mesh: null, rig: null,
      shellN: 0, shellLim: 1 + irandom(1),        // bites on a closed nautilus shell before the predator gives up
    };
    c.leader = leader || c;
    c.wyaw = c.yaw;
    c.bedAhead = c.bed;
    c.offx = range(-1, 1) * c.len * 2.6; c.offy = range(-1, 1) * c.len * 2.6; c.offz = range(-1, 1) * c.len * 1.2;
    c.animRate = clamp(0.95 - s.len / 500, 0.16, 0.8);
    if (s.kind === 2) c.animRate = 0.12;
    if (s.kind === 3) c.animRate = 0.16;
    c.turnRate = clamp(6.5 - s.len / 60, 1.1, 6);
    c.chaseTurn = clamp(3.2 - s.len / 150, 1.2, 2.6);
    c.chasePitch = s.len > 150 ? 32 : 50;
    c.glow = s.kind === 2 || s.glowfish || s.lure;
    c.lure = rnd() < 0.35;
    if (s.kind === 9) { c.animRate = 0.21; c.turnRate = 2.6; }
    if (s.kind === 4 || s.kind === 8) {
      c.rig = createSquidRig(scene, s.kind === 4 ? 2 : 3, s.kind === 8);
      Object.assign(c.rig.s, { x, y, z, yaw: c.yaw * D, pitch: 0, roll: 0, L: c.len, spread: s.kind === 8 ? 0.35 : 0 });
      c.rig.init();
    } else {
      const g = models[t].frames[0][0];
      c.mesh = new THREE.Mesh(g, g.userData.alpha ? SEE_THROUGH : OPAQUE);
      c.mesh.matrixAutoUpdate = false;
      c.mesh.renderOrder = g.userData.alpha ? 1 : 0;
      scene.add(c.mesh);
    }
    list.push(c);
    return c;
  }

  function destroy(c) {
    c.dead = true;
    if (c.mesh) scene.remove(c.mesh);
    if (c.sil) { scene.remove(c.sil); c.sil.material.dispose(); }
    if (c.rig) c.rig.remove();
  }

  // spawn creature groups at valid, uncrowded points of a chunk (scr_spawn_in_chunk)
  function spawnInChunk(ch, groups) {
    const pl = env.player();
    let px = ch.cx * CS + CS / 2, py = ch.cy * CS + CS / 2;
    const dm = (SURF_Z - terrainH(px, py)) * 0.2;
    if (dm < 120) groups++;
    else if (dm > 280) groups = rnd() < 0.45 ? 0 : 1;
    for (let g = 0; g < groups; g++) {
      if (list.length >= cap(pl.L)) return;
      px = ch.cx * CS + rnd() * CS; py = ch.cy * CS + rnd() * CS;
      const bed = terrainH(px, py);
      const t = pickType(bed, biomeAt(px, py, bed), pl.L);
      if (t < 0) continue;
      const b = band(t, bed);
      if (!b) continue;
      let pz = range(b.lo, b.hi);
      if (rnd() < 0.7) {
        const st = bandStrict(t, bed);
        if (st) { const lo = Math.max(b.lo, st.lo); pz = range(lo, Math.max(lo, Math.min(b.hi, st.hi))); }
      }
      // never right in front of the player, never next to existing creatures
      if (Math.hypot(px - pl.x, py - pl.y, pz - pl.z) < Math.max(260, env.view.dist * 0.55)) continue;
      if (list.some((o) => pdist(o.x, o.y, px, py) < 150 + o.len)) continue;
      let n = SPECIES[t].smin + irandom(SPECIES[t].smax - SPECIES[t].smin);
      if (pz < SURF_Z - 1250) n = Math.max(1, Math.round(n * 0.6));
      let lead = null;
      for (let k = 0; k < n; k++) {
        const c = create(t, px + range(-30, 30), py + range(-30, 30), pz + range(-15, 15), lead);
        if (!lead) lead = c;
      }
    }
  }
  world.hooks.onChunkReady = (ch) => { if (!ch.seen || initialSpawn) spawnInChunk(ch, 1 + irandom(2)); };

  // one new group in a random loaded chunk the player has not seen (scr_spawn_topup)
  function topup() {
    const pl = env.player(), chunks = world.chunks();
    if (list.length >= cap(pl.L) * 0.8 || !chunks.length) return;
    for (let tries = 0; tries < 6; tries++) {
      const ch = chunks[Math.floor(rnd() * chunks.length)];
      if (ch.seen || ch.stage === 0) continue;
      if (pdist(pl.x, pl.y, ch.x, ch.y) < env.view.dist + CS * 0.3) continue;
      spawnInChunk(ch, 1);
      return;
    }
  }

  const edibleBy = (c, L) => (c.t === 9 ? L >= c.len * 2.2 : c.len <= L * 0.8);
  const dangerTo = (c, L) => c.sp.pred && c.len >= L * 1.25;

  // ---------------- AI step (scr_fish_step)
  function step(c, pl, frame, time) {
    if (c.grabbed) return;
    c.px = c.x; c.py = c.y; c.pz = c.z;
    const s = c.sp, t = c.t;
    const dx = pl.x - c.x, dy = pl.y - c.y, dz = pl.z - c.z, d = Math.hypot(dx, dy, dz);
    if (d > env.view.unloadR) { destroy(c); return; }
    // LOD: out of sight and not hunting -> full AI only every 6th step, inertial motion in between
    if (d > env.view.dist + c.len && c.state !== 2 && c.state !== 4 && (frame + c.id) % 6 !== 0) {
      c.x += c.lvx; c.y += c.lvy; c.z += c.lvz;
      c.ph += c.animRate; if (c.ph >= FLIP) c.ph -= FLIP;
      return;
    }
    const alive = pl.alive, edible = edibleBy(c, pl.L), danger = dangerTo(c, pl.L);
    if (--c.bedT <= 0) {
      c.bedT = 8;
      c.bed = terrainH(c.x, c.y);
      c.bedAhead = terrainH(c.x + Math.cos(c.yaw * D) * (c.len * 1.3 + 40), c.y - Math.sin(c.yaw * D) * (c.len * 1.3 + 40));
    }
    const zlo = Math.max(c.bed + s.zmin + c.len * 0.3, SURF_Z - s.dhw * 5);
    let zhi = Math.min(c.bed + s.zmax, SURF_Z - 40 - c.len * 0.2, SURF_Z - s.dlw * 5);
    if (zhi < zlo + 10) zhi = zlo + 10;
    if (c.blindT > 0) c.blindT--;
    // ink: a creature that swims into a cloud loses sight of the player for a while
    if (env.inkCount?.() > 0 && (frame + c.id) % 4 === 0 && env.inInk(c.x, c.y, c.z, c.len * 0.3)) {
      if (s.pred && c.blindT <= 0 && (c.state === 2 || c.state === 3)) hooks.blind?.(c);
      c.blindT = 300;
      if (c.state === 2 || c.state === 3) { c.state = 5; c.timer = 0; }
    }
    let tyaw = c.yaw, tpitch = 0;
    c.mtarget = 0;
    let fr = 110 + c.len * 2 + pl.L * 1.3;
    if (t === 10) fr = 320;
    c.timer++;
    switch (c.state) {
      case 0: case 5: {
        if (c.state === 5 && c.timer > 420) { c.state = 0; c.timer = 0; }
        if (alive && danger && c.blindT <= 0 && !pl.hidden && ((c.state === 0 && d < s.detect * pl.vis) || (c.state === 5 && d < s.detect * 0.35 * pl.vis))) {
          c.state = 2; c.timer = 0; c.lostc = 0; c.chaseT = 0; hooks.threat?.(c); break;
        }
        if (alive && edible && t !== 9 && d < fr * pl.vis) { c.state = 1; c.timer = 0; break; }
        if (alive && s.kind === 9 && d < (340 + pl.L * 1.5) * pl.vis) { c.state = 1; c.timer = 0; if (!c.scared) { c.scared = true; hooks.scare?.(c); } break; }
        // predators also hunt the small fry around them
        if (s.pred && --c.huntT <= 0) {
          c.huntT = 60 + irandom(60);
          if (rnd() < 0.3) {
            let best = null, bd = 380 + c.len;
            for (const o of list) if (o !== c && !o.dead && !o.grabbed && o.len < c.len * 0.45) { const k = pdist(o.x, o.y, c.x, c.y); if (k < bd) { bd = k; best = o; } }
            if (best) { c.prey = best; c.state = 4; c.timer = 0; break; }
          }
        }
        if (c.leader !== c && c.leader.dead) c.leader = c;
        if (c.leader !== c && c.leader.state === 0) {
          // school: hold a formation slot relative to the leader
          const L = c.leader, ca = Math.cos(L.yaw * D), sa = Math.sin(L.yaw * D);
          const ox = L.x + c.offx * ca + c.offy * sa, oy = L.y - c.offx * sa + c.offy * ca, ld = pdist(c.x, c.y, ox, oy);
          tyaw = ld < c.len * 0.8 ? L.yaw : pdir(c.x, c.y, ox, oy);
          tpitch = clamp(Math.atan2(L.z + c.offz - c.z, Math.max(1, ld)) / D, -40, 40);
          c.tspd = L.spd * clamp(0.85 + ld / (c.len * 6), 0.8, 1.6);
        } else {
          if (--c.wt <= 0) {
            c.wt = 90 + irandom(170); c.wyaw = c.yaw + range(-75, 75);
            if (s.kind === 9) { c.wt = 300 + irandom(300); c.wyaw = c.yaw + range(-30, 30); }
            // some creatures wander towards the octopus lurking on the bottom (that is how it hunts)
            if (c.lure && pl.char === 2 && pl.alive && d < 1400 && !danger) c.wyaw = pdir(c.x, c.y, pl.x, pl.y) + range(-30, 30);
          }
          tyaw = c.wyaw;
          tpitch = c.z < zlo ? 22 : c.z > zhi ? -22 : Math.sin(time * 0.35 + c.id) * 9;
          c.tspd = s.cruise;
        }
        break;
      }
      case 1:
        // flee: away from the squid, zig-zagging; bursts when close; tires on a long chase
        tyaw = pdir(pl.x, pl.y, c.x, c.y) + Math.sin(c.timer * 0.09 + c.id) * 30;
        tpitch = clamp(-dz * 0.25, -30, 30);
        if (c.z < zlo) tpitch = Math.max(tpitch, 15);
        if (c.z > zhi) tpitch = Math.min(tpitch, -15);
        c.tspd = s.flee * Math.max(0.62, 1 - c.timer / 420);
        if (d < fr * 0.45 && c.timer < 120) c.tspd *= 1.1;
        if (d > fr * 1.8 || !alive) { c.state = 0; c.timer = 0; }
        break;
      case 2: {
        if (!alive || !danger) { c.state = 0; c.timer = 0; break; }
        // losing the target: squid behind the predator, big depth gap, sharp manoeuvres, hidden
        const hd = Math.max(1, Math.hypot(dx, dy)), dot = (dx * Math.cos(c.yaw * D) - dy * Math.sin(c.yaw * D)) / hd;
        if (dot < 0.25) c.lostc++; else c.lostc = Math.max(0, c.lostc - 0.6);
        if (Math.abs(dz) > 110 + c.len * 0.35) c.lostc++;
        if (pl.hidden) c.lostc += 3;
        if (Math.abs(pl.tv) > 2.2 / (1 + pl.L / 500)) c.lostc += 1.6;
        if (Math.abs(pl.vz) > 1.5) c.lostc += 1.1;
        if (Math.abs(dz) > 50 + c.len * 0.2) c.lostc += 0.6;
        if (d > s.detect * 0.6) c.lostc += 0.6;
        c.chaseT++;
        if (d > s.lose || c.lostc > 150) { c.state = 5; c.timer = 0; hooks.lost?.(c); break; }
        // lead the target: aim where the squid will be
        const k = clamp(d / Math.max(1, s.chase) * 0.45, 0, 45);
        const px = pl.x + pl.vx * k, py = pl.y + pl.vy * k, pz = pl.z + pl.vz * k;
        tyaw = pdir(c.x, c.y, px, py);
        tpitch = clamp(Math.atan2(pz - c.z, Math.max(1, pdist(c.x, c.y, px, py))) / D, -55, 55);
        c.tspd = s.chase * (c.chaseT > 300 ? 0.82 : 1);
        tpitch = clamp(tpitch, -c.chasePitch, c.chasePitch);
        const br = c.len * 0.42 + pl.L * 0.4;
        if (d < br * 3.2) c.mtarget = 1;
        if (d < br && c.biteCd <= 0) {
          hooks.bite?.(c, s.dmg); c.biteCd = 70; c.state = 3; c.timer = 0;
          if (c.shellN >= c.shellLim) {
            // the shell cannot be bitten through: the predator loses interest and swims off for a while
            c.shellN = 0; c.state = 5; c.blindT = 330;
            c.wyaw = pdir(pl.x, pl.y, c.x, c.y); c.wt = 240;
            hooks.bored?.(c);
          }
        }
        break;
      }
      case 3:
        // swerve away after a bite, then come back
        tyaw = c.yaw + 3; tpitch = 10; c.tspd = s.cruise * 1.3;
        c.mtarget = clamp(1 - c.timer / 14, 0, 1);
        if (c.timer > 55) { c.state = alive && danger && d < s.lose ? 2 : 0; c.timer = 0; }
        break;
      case 4: {
        const pr = c.prey;
        if (!pr || pr.dead || c.timer > 360) { c.state = 0; c.timer = 0; c.prey = null; break; }
        if (pr.grabbed) { c.state = 0; c.prey = null; break; }
        tyaw = pdir(c.x, c.y, pr.x, pr.y);
        tpitch = clamp(Math.atan2(pr.z - c.z, Math.max(1, pdist(c.x, c.y, pr.x, pr.y))) / D, -50, 50);
        c.tspd = s.chase * 0.85;
        const k = Math.hypot(pr.x - c.x, pr.y - c.y, pr.z - c.z);
        if (k < c.len * 1.5) c.mtarget = 1;
        if (k < c.len * 0.45 + pr.len * 0.5) {
          hooks.eaten?.(pr, c);              // blood cloud and bones (effects stage)
          destroy(pr);
          c.prey = null; c.state = 3; c.timer = 0;
        }
        break;
      }
    }
    // jellyfish: drift, bob, sting when touched
    if (s.kind === 2) {
      c.tspd = s.cruise; tpitch = Math.sin(time * 0.6 + c.id) * 25;
      if (c.z < zlo) tpitch = 20; if (c.z > zhi) tpitch = -20;
      c.stingCd--;
      if (alive && !edible && c.stingCd <= 0 && d < c.len * 0.6 + pl.L * 0.35) { hooks.bite?.(c, s.dmg); c.stingCd = 90; }
    }
    // steering
    let k = c.turnRate * clamp(0.6 + c.spd / Math.max(0.1, s.cruise) * 0.4, 0.6, 1.7);
    if (c.state === 2) k = Math.min(k, c.chaseTurn);
    // a scuba diver glides almost level, turns in wide gentle arcs, swims straight away when scared
    if (s.kind === 9) {
      if (c.state === 1) tyaw = pdir(pl.x, pl.y, c.x, c.y) + Math.sin(c.timer * 0.015 + c.id) * 8;
      tpitch = clamp(tpitch * 0.4, -10, 10);
      if (c.z < zlo) tpitch = 8; else if (c.z > zhi) tpitch = -8;
      k = Math.min(k, 0.8 + 0.5 * (c.state === 1 ? 1 : 0));
    }
    if (c.blindT > 0) { tyaw = c.yaw + Math.sin(c.timer * 0.13 + c.id) * 40; tpitch = Math.sin(c.timer * 0.05 + c.id) * 15; c.tspd = s.cruise * 0.7; c.mtarget = 0; }
    c.dyaw = clamp(angdiff(tyaw, c.yaw), -k, k);
    c.yaw = (c.yaw + c.dyaw + 360) % 360;
    c.roll = lerp(c.roll, -c.dyaw * 7, 0.08);
    if (s.upright) c.roll *= 0.3;
    let cpitch = tpitch;
    // avoid the seabed ahead and the surface
    const cl = Math.max(c.bed, c.bedAhead) + c.len * 0.35 + 10;
    if (c.z < cl) cpitch = Math.max(cpitch, s.kind === 9 ? 16 : 32);
    if (c.z > SURF_Z - 45) cpitch = Math.min(cpitch, -15);
    if (s.kind === 9) { c.roll = lerp(c.roll, -c.dyaw * 3, 0.03); c.pitch = approach(c.pitch, cpitch, 0.25); }
    else if (c.state === 2) c.pitch = approach(c.pitch, clamp(cpitch, -55, 55), k * 0.55);
    else c.pitch = approach(c.pitch, clamp(cpitch, -55, 55), k * 0.8);
    c.spd = approach(c.spd, c.tspd, 0.06 + c.spd * 0.025);
    const cp = Math.cos(c.pitch * D);
    c.x += Math.cos(c.yaw * D) * c.spd * cp;
    c.y -= Math.sin(c.yaw * D) * c.spd * cp;
    c.z += c.spd * Math.sin(c.pitch * D);
    c.z = clamp(c.z, c.bed + c.len * 0.22 + 3, SURF_Z - 18);
    if (s.kind === 10) crabStep(c);
    c.lvx = Math.cos(c.yaw * D) * c.spd * cp; c.lvy = -Math.sin(c.yaw * D) * c.spd * cp; c.lvz = c.spd * Math.sin(c.pitch * D);
    // animation
    c.ph += c.animRate * clamp(0.45 + c.spd / Math.max(0.1, s.cruise) * 0.55, 0.45, 2.2);
    if (c.ph >= FLIP) c.ph -= FLIP;
    c.mouth = approach(c.mouth, c.mtarget, 0.09);
    c.biteCd--;
    if (c.rig && d < env.view.dist + c.len) {
      Object.assign(c.rig.s, { x: c.x, y: c.y, z: c.z, yaw: c.yaw * D, pitch: c.pitch * D, roll: c.roll * D, L: c.len });
      c.rig.s.spread = s.kind === 4 ? c.mouth : 0.3 + 0.25 * Math.sin(time * 1.3 + c.id) + 0.3 * (c.state === 1 ? 1 : 0);
      c.rig.anim(Math.abs(c.spd), 0, time);
    }
    // pufferfish: blows itself up when the squid comes close
    if (s.puffer) {
      const near = alive && d < Math.max(150, pl.L * 3.2 + 40) ? 1 : 0;
      c.inflate = approach(c.inflate, near, 0.09 * near + 0.012);
      if (c.inflate > 0.3) c.spd = Math.min(c.spd, s.cruise * 0.5);
    }
    if (s.kind === 9) {             // exhaled bubbles from the snorkel every few seconds
      if (--c.bubT <= 0) { c.bubT = 150 + irandom(110); c.bubN = 8; if (c.state === 1) c.bubT = 70 + irandom(40); }
      if (c.bubN > 0 && frame % 3 === 0) { c.bubN--; hooks.bubbles?.(c); }
    }
    if (s.kind === 8 && c.state === 1 && !c.inked) { c.inked = true; hooks.ink?.(c); c.spd = s.flee * 1.6; }
  }

  // crabs walk on the seabed round obstacles (scr_crab_step)
  function crabStep(c) {
    c.z = terrainH(c.x, c.y) + c.len * 0.17;
    c.pitch = 0; c.roll = 0;
    if (--c.crT <= 0 && c.crAvt <= 0) {
      c.crT = 8;
      const fx = (a, l) => c.x + Math.cos(a * D) * l, fy = (a, l) => c.y - Math.sin(a * D) * l;
      if (world.blockedAt(fx(c.yaw, c.len * 1.3 + 8), fy(c.yaw, c.len * 1.3 + 8), c.len)) {
        c.crAv = world.blockedAt(fx(c.yaw + 60, c.len * 1.5 + 8), fy(c.yaw + 60, c.len * 1.5 + 8), c.len) ? -1 : 1;
        c.crAvt = 22;
      }
    }
    if (c.crAvt > 0) { c.crAvt--; c.yaw += c.crAv * 4; c.wyaw = c.yaw; c.wt = Math.max(c.wt, 40); }
  }

  // ---------------- per simulation step
  let stepN = 0;
  function update(time) {
    const pl = env.player(), frame = ++stepN;
    for (const c of list) if (!c.dead) step(c, pl, frame, time);
    for (let i = list.length - 1; i >= 0; i--) if (list[i].dead) list.splice(i, 1);
    if (frame % 45 === 0) topup();
    stats.n = list.length;
  }

  // ---------------- drawing (a: interpolation between steps)
  // pl: { x, y, z, L, lock, alive } - for the red silhouettes of edible prey
  function render(a, cam, time, pl) {
    const vd = env.view.dist;
    let drawn = 0;
    glow.begin();
    for (const c of list) {
      const x = c.px + (c.x - c.px) * a, y = c.py + (c.y - c.py) * a, z = c.pz + (c.z - c.pz) * a;
      const near = Math.hypot(x - cam.x, y - cam.y, z - cam.z) < vd + c.len;
      const s = c.sp;
      if (c.rig) {
        c.rig.setVisible(near);
        if (near) { c.rig.draw(x, y, z, false); drawn++; }
        continue;
      }
      c.mesh.visible = near;
      // red silhouette of edible prey: drawn over everything (seen through kelp, rocks and murk), never
      // smaller than ~2 degrees, strong far away, fading out as the prey comes close
      let silA = 0;
      if (near && pl.alive && !c.grabbed && s.kind !== 2 && edibleBy(c, pl.L)) {
        const d = Math.hypot(x - pl.x, y - pl.y, z - pl.z), nearD = pl.L * 2.5, span = pl.L * 5 + 160;
        silA = clamp((d - nearD) / span, 0, 1) * 0.7;
        if (c === pl.lock) silA = Math.max(silA, 0.25) * (0.8 + 0.2 * Math.sin(time * 8));
        if (silA > 0.02) {
          if (!c.sil) { c.sil = new THREE.Mesh(c.mesh.geometry, new THREE.MeshBasicMaterial({ color: 0xff2828, transparent: true, depthTest: false, depthWrite: false, fog: false, side: THREE.DoubleSide })); c.sil.matrixAutoUpdate = false; c.sil.renderOrder = 20; scene.add(c.sil); }
          c.sil.material.opacity = silA;
          const ss = Math.max(c.len * 1.15 * (1 + c.inflate * 0.6), d * 0.035);
          c.sil.geometry = models[c.t].frames[0][Math.floor(c.ph) % FLIP];
          setTransform(c.sil.matrix, x, y, z, c.yaw * D, c.pitch * D, c.roll * D, ss, ss * 1.3, ss * 1.3);
        }
      }
      if (c.sil) c.sil.visible = silA > 0.02;
      if (!near) continue;
      drawn++;
      const m = models[c.t], f = Math.floor(c.ph) % FLIP;
      let g = m.frames[c.mouth > 0.5 ? 1 : 0][f], sc = c.len * (1 - 0.6 * c.swal);
      if (s.puffer) {
        if (c.inflate > 0.5) { g = m.puffer[f]; sc = c.len * (0.7 + c.inflate * 0.75); } else sc = c.len * (1 + c.inflate * 0.7);
      }
      c.mesh.geometry = g;
      const pitch = s.kind === 2 ? 0 : (s.upright ? c.pitch * 0.15 : c.pitch);
      const roll = s.kind === 2 ? 0 : c.roll;
      setTransform(c.mesh.matrix, x, y, z, c.yaw * D, pitch * D, roll * D, sc, sc, sc);
      // glows: jellyfish bells, the anglerfish lure, lanternfish photophores (dim, pulsing)
      if (c.glow) {
        if (s.kind === 2) glow.add(x, y, z - c.len * 0.1, 255, 120, 200, 0.35, c.len * 0.9 * (0.85 + 0.15 * Math.sin(c.ph / FLIP * 6.283)));
        else if (s.lure) {
          const e = c.pitch * D, cy = Math.cos(c.yaw * D), sy = Math.sin(c.yaw * D);
          const fx = Math.cos(e) * LURE.lx * c.len - Math.sin(e) * LURE.lz * c.len;
          glow.add(x + cy * fx, y - sy * fx, z + Math.sin(e) * LURE.lx * c.len + Math.cos(e) * LURE.lz * c.len,
                   120, 255, 210, 0.5 + 0.2 * Math.sin(time * 2.3 + c.id), c.len * (0.28 + 0.06 * Math.sin(time * 3 + c.id)));
        } else glow.add(x, y, z, 90, 190, 255, 0.22, c.len * 0.9);
      }
    }
    glow.end();
    stats.drawn = drawn;
  }

  return {
    list, stats, hooks, update, render,
    // for tests and the bestiary later: put one creature of species t at (x, y, z)
    spawn: (t, x, y, z) => create(t, x, y, z, null),
    remove: (c) => destroy(c),
    edibleBy, dangerTo,
    endInitialSpawn() { initialSpawn = false; },
    // a new life: the loaded chunks get their first population again
    startSpawn() { for (const ch of world.chunks()) if (ch.stage > 0) spawnInChunk(ch, 1 + irandom(2)); },
    clear() { for (const c of list) destroy(c); list.length = 0; },
  };
}
