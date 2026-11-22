// Player squid - port of 08_player.gml (scr_player_update, scr_player_eat, scr_player_aim, scr_player_hurt,
// scr_player_hunger), scr_pl_steer (27_octopus.gml) and scr_player_die (26_misc.gml).
// The simulation runs in the original's fixed 1/60 s steps, so per-step numbers and degrees are kept.
// Controls as agreed for the web version:
//  * the stick / A D / arrows only turn the squid and raise / lower its nose (analog on touch);
//    released, the nose levels out again and the aim assist steers towards locked prey, like the original;
//  * it moves only with Swim (W) or Dash (Shift) - Dash alone also moves, so one button is enough on a phone;
//  * Dash drains stamina; empty, the squid is exhausted until 25 % has come back.
// Score ("Hunter", agreed for the online records): points per prey by its size, x1.5 for a predator,
// x1.5 for prey nearly as big as the squid, combo +10 % per prey within 5 s (up to x2), depth up to
// x1.5 at 300 m and below; +50 for a species never eaten before.
import { terrainH, SURF_Z, clamp, depthM } from '../world/terrain.js';
import { createSquidRig } from '../creatures/squidModel.js';
import { createNautilusModel } from './nautilus.js';
import { createOctopus } from './octopus.js';
import { SPECIES } from '../creatures/species.js';
import { t, spName } from '../core/i18n.js';

const D = Math.PI / 180;
const approach = (v, tg, s) => (v < tg ? Math.min(v + s, tg) : Math.max(v - s, tg));
const angdiff = (a, b) => { let d = a - b; while (d > 180) d -= 360; while (d <= -180) d += 360; return d; };
const pdir = (x1, y1, x2, y2) => Math.atan2(-(y2 - y1), x2 - x1) / D;
const rnd = Math.random;

export const stageIndex = (L) => (L < 45 ? 0 : L < 80 ? 1 : L < 140 ? 2 : L < 250 ? 3 : L < 450 ? 4 : 5);
export const stageName = (L) => t('st' + stageIndex(L));

// species ever eaten (bestiary): kept in the browser, synced with the account later
const BKEY = 'growup.bestiary';
function loadKnown() { try { return new Set(JSON.parse(localStorage.getItem(BKEY) || '[]')); } catch (e) { return new Set(); } }
function saveKnown(s) { try { localStorage.setItem(BKEY, JSON.stringify([...s])); } catch (e) { /* not remembered */ } }

// playable creatures (22_chars.gml): 0 squid, 1 nautilus, 2 octopus - speed, turning, health
export const CHARS = [
  { key: 'squid', spd: 1, turn: 1, hp: 100 },
  { key: 'nautilus', spd: 0.72, turn: 0.8, hp: 50 },
  { key: 'octopus', spd: 0.95, turn: 1.06, hp: 100 },
];

// ctx: { creatures, fx, frame(), msg(text, colour), sound(name), onDeath() }; world: for the octopus
export function createPlayer(scene, spawn, ctx, world) {
  const rig = createSquidRig(scene, 0);
  const naut = createNautilusModel(scene);
  const oct = createOctopus(scene, world);
  const known = loadKnown();
  const pl = { char: 0 };

  function showModel() {
    rig.setVisible(pl.alive && pl.char === 0);
    naut.setVisible(pl.alive && pl.char === 1);
    oct.setVisible(pl.alive && pl.char === 2);
  }

  function reset(sp, ch = pl.char) {
    const C = CHARS[ch];
    Object.assign(pl, {
      char: ch, shell: 0, shellCd: 0, shellMsg: false, pulse: 0, ntHide: 0, ntPh: 0, tg: null, tgBack: 0, lastTg: null, mouth: null,
      x: sp.x, y: sp.y, z: terrainH(sp.x, sp.y) + 170,
      yaw: rnd() * 360, pitch: 0, roll: 0,
      L: 30, Lt: 30, maxL: 30, spd: 0, tv: 0, pv: 0, boost: 0, boostT: 0,
      st: 100, stmax: 100, exh: false, stDelay: 0, slow: 0,
      hp: 100, hpmax: 100, food: 100, foodWarn: 0, inv: 0, hurt: 0, calm: 0,
      alive: true, killer: null, deadT: 0, time: 0,
      vx: 0, vy: 0, vz: 0, kx: 0, ky: 0, kz: 0, dist: 0, shake: 0, growFlash: 0,
      lock: null, aimOn: false, aimYaw: 0, aimPitch: 0, grab: null, grabT: 0, open: 0,
      eaten: 0, score: 0, comboN: 0, lastEat: -99, stage: 0,
      vis: 1, hidden: false,
      prev: { x: 0, y: 0, z: 0 },
    });
    pl.hp = pl.hpmax = C.hp;
    pl.prev.x = pl.x; pl.prev.y = pl.y; pl.prev.z = pl.z;
    Object.assign(rig.s, { x: pl.x, y: pl.y, z: pl.z, yaw: pl.yaw * D, pitch: 0, roll: 0, L: pl.L, spread: 0, tent: 0 });
    rig.init();
    oct.reset(pl);
    showModel();
  }

  // steering: the turn rate builds up and dies down over a few steps; with no turning input the aim
  // assist corrects small deviations towards locked prey (scr_pl_steer)
  function steer(tr, inp) {
    let tdy = tr * inp.turn;
    if (pl.aimOn && Math.abs(inp.turn) < 0.1) tdy = clamp(angdiff(pl.aimYaw, pl.yaw) * 0.16, -tr * 1.15, tr * 1.15);
    const k = Math.abs(tdy) < Math.abs(pl.tv) ? tr * 0.14 : tr * 0.085;
    pl.tv = approach(pl.tv, tdy, k);
    pl.yaw = (pl.yaw + pl.tv + 360) % 360;
    pl.roll += (-pl.tv * 8 - pl.spd * pl.tv * 0.5 - pl.roll) * 0.1;
  }
  reset(spawn);

  const edible = (c) => ctx.creatures.edibleBy(c, pl.L);

  // keeps / finds a lock on edible prey close to the course (narrow cone to lock, wide to keep)
  function aim() {
    const range = Math.max(320, pl.L * 8), cp = Math.cos(pl.pitch * D);
    const fx = Math.cos(pl.yaw * D) * cp, fy = -Math.sin(pl.yaw * D) * cp, fz = Math.sin(pl.pitch * D);
    let lk = pl.lock;
    if (lk && (lk.dead || (lk.grabbed && pl.grab !== lk))) lk = null;
    if (lk) {
      const ex = lk.x - pl.x, ey = lk.y - pl.y, ez = lk.z - pl.z, d = Math.max(0.001, Math.hypot(ex, ey, ez));
      const ang = Math.acos(clamp((ex * fx + ey * fy + ez * fz) / d, -1, 1)) / D;
      if (!edible(lk) || d > range * 1.4 || ang > 60) lk = null;
    }
    if (!lk && ctx.frame() % 4 === 0) {
      let bs = 1e9;
      for (const c of ctx.creatures.list) {
        if (c.dead || c.grabbed || !edible(c)) continue;
        const ex = c.x - pl.x, ey = c.y - pl.y, ez = c.z - pl.z, d = Math.max(0.001, Math.hypot(ex, ey, ez));
        if (d >= range) continue;
        const ang = Math.acos(clamp((ex * fx + ey * fy + ez * fz) / d, -1, 1)) / D;
        if (ang < 24) { const sc = ang * 6 + d * 100 / range; if (sc < bs) { bs = sc; lk = c; } }
      }
    }
    pl.lock = lk;
    pl.aimOn = false;
    if (lk) {
      const d = Math.hypot(lk.x - pl.x, lk.y - pl.y), k = clamp(d / Math.max(1, Math.abs(pl.spd) + 2), 0, 30) * 0.6;
      const tx = lk.x + lk.lvx * k, ty = lk.y + lk.lvy * k, tz = lk.z + lk.lvz * k;
      pl.aimYaw = pdir(pl.x, pl.y, tx, ty);
      pl.aimPitch = Math.atan2(tz - pl.z, Math.max(1, Math.hypot(tx - pl.x, ty - pl.y))) / D;
      if (Math.abs(angdiff(pl.aimYaw, pl.yaw)) < 40 && Math.abs(pl.aimPitch - pl.pitch) < 45) pl.aimOn = true;
    }
  }

  // catch prey in front of the arms with the tentacles; big prey is drawn into the mouth slowly
  function eat(time) {
    const L = pl.L, ML = L / 2.1, cp = Math.cos(pl.pitch * D);
    let fx = Math.cos(pl.yaw * D) * cp, fy = -Math.sin(pl.yaw * D) * cp, fz = Math.sin(pl.pitch * D);
    let mx = pl.x + fx * ML * 0.3, my = pl.y + fy * ML * 0.3, mz = pl.z + fz * ML * 0.3;
    if (pl.char === 1) { mx = pl.x + fx * L * 0.3; my = pl.y + fy * L * 0.3; mz = pl.z + fz * L * 0.3 - L * 0.05; }
    if (pl.char === 2) {
      // the octopus mouth sits in the middle of the arm crown, wherever the crown is pointing
      const c = oct.crown();
      mx = pl.x + c.x * ML * 0.3; my = pl.y + c.y * ML * 0.3; mz = pl.z + c.z * ML * 0.3;
    }
    pl.mouth = { x: mx, y: my, z: mz };
    const s = rig.s;
    // nautilus tongue in flight: shoots out, sticks, pulls the prey back into the mouth
    if (pl.tg) { tongueStep(mx, my, mz, time); return; }
    if (pl.grab) {
      const pr = pl.grab;
      pl.grabT++;
      pl.open = 1;
      if (pr.dead) { pl.grab = null; return; }
      pr.px = pr.x; pr.py = pr.y; pr.pz = pr.z;
      const rr = pr.len / L;
      const dur = rr > 0.55 ? Math.round(12 + clamp((rr - 0.55) / 0.25, 0, 1) * 96) : 12;
      const u = pl.grabT / dur;
      if (dur > 12) {
        pl.slow = Math.max(pl.slow, 0.86);
        const k = (1 - u) * (pr.len * 0.45 + 4);
        pr.x += (mx + fx * k - pr.x) * 0.12; pr.y += (my + fy * k - pr.y) * 0.12; pr.z += (mz + fz * k - pr.z) * 0.12;
        pr.swal = u; pr.spd = 0; pr.mouth = 1;
        pr.ph += pr.animRate * 3.5; if (pr.ph >= 12) pr.ph -= 12;
        pr.yaw += Math.sin(time * 17 + pr.id) * 4 * (1 - u); pr.roll = Math.sin(time * 13 + pr.id) * 25 * (1 - u);
        if (pl.grabT % 20 === 0) ctx.fx.cloud(pr.x, pr.y, pr.z, pr.len * 0.5, 0, 2);
        if (pl.grabT === 1) ctx.sound?.('gulp');
      } else { pr.x += (mx - pr.x) * 0.25; pr.y += (my - pr.y) * 0.25; pr.z += (mz - pr.z) * 0.25; pr.spd = 0; }
      s.tx = pr.x; s.ty = pr.y; s.tz = pr.z; s.tent = 1;
      if (pl.grabT >= dur) swallow(pr, rr, dur, time);
      return;
    }
    // the nearest edible creature inside the front cone
    let best = null, bd = 1e9, open = 0;
    const kr = pl.char === 2 ? 0.75 : 0.55;          // the octopus reaches out with long arms
    if (pl.char === 2 && oct.o.atk > 0.3) { const c = oct.crown(); fx = c.x; fy = c.y; fz = c.z; }
    for (const c of ctx.creatures.list) {
      if (c.dead || c.grabbed || !edible(c)) continue;
      const ex = c.x - mx, ey = c.y - my, ez = c.z - mz, d = Math.hypot(ex, ey, ez), reach = L * kr + c.len * 0.5;
      if (d > reach * 3) continue;
      const dot = (ex * fx + ey * fy + ez * fz) / Math.max(0.001, d);
      if (dot >= 0.25 || d <= reach * 0.6) {
        open = Math.max(open, clamp(1.4 - d / (reach * 3), 0, 1));
        if (d < reach && d < bd) { bd = d; best = c; }
      }
    }
    pl.open = approach(pl.open, open, 0.08);
    s.tent = Math.max(0, s.tent - 0.1);
    // the nautilus does not wait until the prey is at its tentacles: from a body length away it shoots
    // out a long thin tongue
    if (pl.char === 1 && !best) {
      bd = 1e9;
      for (const c of ctx.creatures.list) {
        if (c.dead || c.grabbed || !edible(c)) continue;
        const ex = c.x - mx, ey = c.y - my, ez = c.z - mz, d = Math.hypot(ex, ey, ez);
        if (d < L * 1.6 + c.len * 0.5 && d < bd && (ex * fx + ey * fy + ez * fz) / Math.max(0.001, d) > 0.6) { bd = d; best = c; }
      }
      if (best) {
        best.grabbed = true;
        pl.tg = { t: 0, c: best, x: mx, y: my, z: mz, ax: 0, ay: 0, az: 0 };
        ctx.sound?.('flip');
        return;
      }
    }
    if (best) { pl.grab = best; pl.grabT = 0; best.grabbed = true; s.tx = best.x; s.ty = best.y; s.tz = best.z; }
  }

  // 12 steps out to the prey, then 20 pulling it back into the mouth; then it is held like any catch
  function tongueStep(mx, my, mz, time) {
    const g = pl.tg, pr = g.c;
    pl.open = approach(pl.open, 0.7, 0.1);
    if (pr.dead) { pl.tg = null; return; }
    g.t++;
    const ext = 12, ret = 20;
    pr.px = pr.x; pr.py = pr.y; pr.pz = pr.z;
    if (g.t <= ext) {
      const u = g.t / ext;
      g.x = mx + (pr.x - mx) * u; g.y = my + (pr.y - my) * u; g.z = mz + (pr.z - mz) * u;
      if (g.t === ext) { g.ax = pr.x; g.ay = pr.y; g.az = pr.z; pl.shake = Math.max(pl.shake, 1.5); }
    } else {
      const u = (g.t - ext) / ret, k = u * u * (3 - 2 * u);
      pr.x = g.ax + (mx - g.ax) * k; pr.y = g.ay + (my - g.ay) * k; pr.z = g.az + (mz - g.az) * k;
      pr.spd = 0; pr.roll = Math.sin(time * 15 + pr.id) * 30 * (1 - u);
      pr.ph += pr.animRate * 3; if (pr.ph >= 12) pr.ph -= 12;
      g.x = pr.x; g.y = pr.y; g.z = pr.z;
    }
    if (g.t >= ext + ret) { pl.tg = null; pl.grab = pr; pl.grabT = 0; }
  }

  function swallow(pr, rr, dur, time) {
    const sp = SPECIES[pr.t];
    ctx.fx.remains(sp.kind, pr.x, pr.y, pr.z, pr.len, pr.yaw);
    if (sp.kind === 9) ctx.fx.diverGear(pr.x, pr.y, pr.z, pr.len);
    // the bigger the meal, the slower the squid for a while and the fuller the stomach
    pl.slow = Math.max(pl.slow * 0.5, clamp(0.07 + 1.4 * Math.pow(rr, 1.5), 0.05, 0.8));
    pl.food = Math.min(100, pl.food + clamp(4 + 75 * Math.pow(rr, 1.2), 4, 70));
    pl.Lt = Math.sqrt(pl.Lt * pl.Lt + 0.35 * pr.len * pr.len);
    pl.hp = Math.min(pl.hpmax, pl.hp + 4 + pr.len * 0.15);
    pl.eaten++;
    if (dur <= 12) ctx.sound?.('eat');
    // score
    pl.comboN = pl.time - pl.lastEat < 5 ? pl.comboN + 1 : 0;
    pl.lastEat = pl.time;
    let pts = 10 + pr.len * 0.6;
    if (sp.pred) pts *= 1.5;
    if (rr >= 0.6) pts *= 1.5;
    pts *= Math.min(2, 1 + 0.1 * pl.comboN);
    pts *= 1 + 0.5 * clamp(depthM(pl.z) / 300, 0, 1);
    pl.score += Math.round(pts);
    const isNew = !known.has(pr.t);
    if (isNew) { known.add(pr.t); saveKnown(known); pl.score += 50; }
    if (sp.puffer) {
      // tetrodotoxin: the pufferfish hurts from the inside, more when it was blown up
      pl.hp -= 16 + 14 * pr.inflate;
      pl.hurt = 1; pl.calm = 0; pl.shake = Math.max(pl.shake, 4);
      if (isNew) ctx.msg(t('puffer'), [255, 170, 120]);
      if (pl.hp <= 0) pl.hp = 1;
    }
    if (isNew) ctx.msg(t('new_species', { n: spName(sp, true), p: 50 }), [255, 230, 150]);
    ctx.creatures.remove(pr);
    pl.grab = null;
    rig.s.tent = 0;
    pl.shake = Math.max(pl.shake, 2);
  }

  // bitten / stung by creature src (scr_player_hurt)
  function hurt(dmg, src) {
    if (!pl.alive || pl.inv > 0) return;
    // nautilus inside its shell: the bite slides off; a predator that keeps biting loses interest
    if (pl.shell > 0.5) {
      pl.inv = 35;
      ctx.sound?.('shell');
      pl.shake = Math.max(pl.shake, 3);
      if (src) {
        const ax = pl.x - src.x, ay = pl.y - src.y, d = Math.max(0.01, Math.hypot(ax, ay));
        pl.kx = ax / d * 3; pl.ky = ay / d * 3;
        src.shellN = (src.shellN || 0) + 1;
      }
      if (!pl.shellMsg) { pl.shellMsg = true; ctx.msg(t('shell_held'), [230, 220, 190]); }
      return;
    }
    const k = src && src.t !== 9 ? clamp(src.len / (pl.L * 2), 0.6, 1.6) : 1;
    pl.hp -= dmg * k;
    pl.inv = 35; pl.hurt = 1; pl.calm = 0;
    ctx.sound?.('bite');
    pl.shake = Math.max(pl.shake, 7 + dmg * 0.25);
    if (src) {
      const ax = pl.x - src.x, ay = pl.y - src.y, az = pl.z - src.z, d = Math.max(0.01, Math.hypot(ax, ay, az));
      pl.kx = ax / d * 5; pl.ky = ay / d * 5; pl.kz = az / d * 2;
    }
    // the octopus answers with an ink cloud; everybody loses a little blood
    if (pl.char === 2) ctx.fx.cloud(pl.x, pl.y, pl.z, pl.L * 0.8, 1, 7);
    ctx.fx.cloud(pl.x, pl.y, pl.z, pl.L * 0.5, 0, 4);
    if (pl.hp <= 0) die(src ? src.sp : null);
  }

  // killer: species entry, or null for starvation
  function die(killer) {
    if (!pl.alive) return;
    pl.hp = 0; pl.alive = false; pl.killer = killer; pl.deadT = 0;
    if (killer) {
      ctx.fx.kill(pl.x, pl.y, pl.z, pl.L * 1.4, pl.yaw);
      ctx.fx.cloud(pl.x, pl.y, pl.z, pl.L * 1.6, 1, 12);
    } else ctx.fx.cloud(pl.x, pl.y, pl.z, pl.L * 0.8, 1, 5);
    if (pl.grab) { pl.grab.grabbed = false; pl.grab = null; }
    if (pl.tg) { pl.tg.c.grabbed = false; pl.tg = null; }
    showModel();
    ctx.onDeath?.();
  }

  // one 1/60 s step; inp: actions from core/input.js; time: game time (s)
  function step(inp, time) {
    pl.prev.x = pl.x; pl.prev.y = pl.y; pl.prev.z = pl.z;
    pl.shake *= 0.86;
    if (!pl.alive) { pl.deadT++; return; }
    pl.time += 1 / 60;
    const L = pl.L;
    pl.inv--;
    pl.hurt = Math.max(0, pl.hurt - 0.03);
    const C = CHARS[pl.char];
    let maxs = (2.9 + L * 0.011) * C.spd * (1 - pl.slow);
    if (!pl.grab) pl.slow = Math.max(0, pl.slow - 0.003);
    pl.vis = 1;
    if (pl.char === 2) {
      oct.move(pl, inp, { creatures: ctx.creatures, fx: ctx.fx, frame: ctx.frame, sound: ctx.sound, steer, aim, edible });
    } else {
      let fwdKey = inp.swim > 0, back = inp.back, turnIn = inp, pitchIn = inp.pitch;
      // nautilus hidden in its shell: no swimming, it sinks slowly
      if (pl.shell > 0.5) { fwdKey = false; back = false; maxs = 0; }
      let boosting = false;
      if (pl.char === 1) {
        // the nautilus jets in pulses: one strong push per press, each one costs stamina
        if (inp.boostHit && pl.shell < 0.5 && pl.st >= 12 && !pl.exh) {
          pl.st -= 14; pl.stDelay = 45; pl.pulse = 1;
          const k = 3.6 + L * 0.03, cp = Math.cos(pl.pitch * D);
          pl.kx += Math.cos(pl.yaw * D) * k * cp; pl.ky -= Math.sin(pl.yaw * D) * k * cp; pl.kz += k * Math.sin(pl.pitch * D);
          ctx.sound?.('jet');
          for (let n = 0; n < 6; n++) ctx.fx.bubble(pl.x - Math.cos(pl.yaw * D) * L * 0.35 + (rnd() * 6 - 3), pl.y + Math.sin(pl.yaw * D) * L * 0.35 + (rnd() * 6 - 3), pl.z + (rnd() * 6 - 3),
                                                     -Math.cos(pl.yaw * D) * 1.2 + (rnd() * 0.8 - 0.4), Math.sin(pl.yaw * D) * 1.2 + (rnd() * 0.8 - 0.4), 0.3 + rnd() * 0.6, (1.2 + rnd() * 1.6) * (1 + L / 200), 150);
        }
        pl.pulse = Math.max(0, pl.pulse - 0.035);
        if (pl.pulse > 0.5) pl.boostT += 1 / 60;
        if (pl.stDelay > 0) pl.stDelay--; else pl.st = Math.min(pl.stmax, pl.st + 15 / 60);
        pl.boost = pl.pulse;
      } else {
        // squid: dash drains stamina, it comes back after a short delay
        boosting = inp.boost && pl.st > 0 && !pl.exh;
        if (boosting) {
          pl.st = Math.max(0, pl.st - 30 / 60);
          pl.stDelay = 40;
          if (pl.st <= 0) pl.exh = true;
        } else if (pl.stDelay > 0) pl.stDelay--;
        else pl.st = Math.min(pl.stmax, pl.st + 15 / 60);
        pl.boost = approach(pl.boost, boosting ? 1 : 0, 0.06);
        if (boosting) pl.boostT += 1 / 60;
      }
      if (pl.exh && pl.st >= pl.stmax * 0.25) pl.exh = false;
      const fwd = fwdKey || boosting;
      // speed
      let ts = 0;
      if (fwd) ts = maxs * (1 + 1.15 * (boosting ? 1 : 0));
      else if (back) ts = -maxs * 0.35;
      let acc = 0.07 + 0.12 * (boosting ? 1 : 0);
      if (!fwd && !back) acc = 0.035;
      pl.spd = approach(pl.spd, ts, acc);
      aim();
      steer(3.4 / (1 + L / 500) * (1 + 0.4 * pl.boost) * C.turn, pl.shell > 0.5 ? { turn: 0 } : turnIn);
      // climbing / diving: the pitch rate builds up and dies down; released -> level (or towards the prey)
      let tp = 55 * pitchIn;
      if (pl.shell > 0.5) tp = 0;
      if (pl.aimOn && Math.abs(pitchIn) < 0.1) tp = clamp(pl.aimPitch, -60, 60);
      const kp = 2.3 + pl.boost * 0.9;
      pl.pv = approach(pl.pv, clamp((tp - pl.pitch) * 0.15, -kp, kp), kp * 0.1);
      pl.pitch = clamp(pl.pitch + pl.pv, -60, 60);
      if (pl.shell > 0.5) pl.kz -= 0.01;
      // move
      const cosp = Math.cos(pl.pitch * D);
      pl.vx = Math.cos(pl.yaw * D) * pl.spd * cosp + pl.kx;
      pl.vy = -Math.sin(pl.yaw * D) * pl.spd * cosp + pl.ky;
      pl.vz = pl.spd * Math.sin(pl.pitch * D) + pl.kz;
      pl.x += pl.vx; pl.y += pl.vy; pl.z += pl.vz;
      pl.dist += Math.hypot(pl.vx, pl.vy, pl.vz) * 0.02;
      pl.kx *= 0.9; pl.ky *= 0.9; pl.kz *= 0.9;
      const bed = terrainH(pl.x, pl.y);
      if (pl.z < bed + L * 0.35 + 4) { pl.z = bed + L * 0.35 + 4; if (pl.pitch < 0) pl.pitch *= 0.6; }
      if (pl.z > SURF_Z - L * 0.3 - 12) { pl.z = SURF_Z - L * 0.3 - 12; if (pl.pitch > 0) pl.pitch *= 0.6; }
    }
    // special ability (F / the Ability button): the octopus squirts ink, the nautilus hides in its shell
    pl.shellCd--;
    if (pl.char === 2) oct.inkStep(pl, ctx);
    if (inp.abilityHit) {
      if (pl.char === 2) {
        if (oct.o.ink >= 40 && oct.o.inkCd <= 0) oct.inkRelease(pl, ctx);
        else ctx.msg(t('ink_not_ready'), [200, 190, 240]);
      } else if (pl.char === 1 && pl.shellCd <= 0) {
        pl.shellCd = 20;
        if (pl.shell < 0.5) { pl.shell = 1; ctx.sound?.('shell'); pl.open = 0; } else pl.shell = 0;
      }
    }
    // hidden: inside an ink cloud (or the octopus in camouflage, set by its movement)
    pl.hidden = ctx.fx.inInk(pl.x, pl.y, pl.z, 0) || (pl.char === 2 && oct.o.camo > 0.55 && Math.abs(pl.spd) < 1.2);
    if (pl.char === 2 && pl.hidden && !ctx.fx.inInk(pl.x, pl.y, pl.z, 0)) pl.vis = 0.12;
    // jet bubbles from the siphon when dashing
    if (pl.char === 0 && pl.boost > 0.3 && ctx.frame() % 3 === 0) {
      const f = -0.15 * L / 2.1, r = () => (rnd() * 2 - 1);
      ctx.fx.bubble(pl.x + Math.cos(pl.yaw * D) * f + r() * 2, pl.y - Math.sin(pl.yaw * D) * f + r() * 2, pl.z - L * 0.05,
                    -pl.vx * 0.2 + r() * 0.3, -pl.vy * 0.2 + r() * 0.3, 0.3 + rnd() * 0.6, (1.2 + rnd() * 1.4) * (1 + L / 200), 160);
    }
    // growth smoothing and size class messages
    if (pl.L < pl.Lt) {
      pl.L = Math.min(pl.Lt, pl.L + Math.max(0.02, (pl.Lt - pl.L) * 0.04));
      const st = stageIndex(pl.L);
      if (st !== pl.stage) { pl.stage = st; ctx.msg(t('new_size', { s: stageName(pl.L) }), [255, 220, 120]); ctx.sound?.('grow'); pl.growFlash = 1; }
    }
    pl.growFlash = Math.max(0, pl.growFlash - 0.012);
    pl.maxL = Math.max(pl.maxL, pl.L);
    // regeneration after a calm period
    if (++pl.calm > 300) pl.hp = Math.min(pl.hpmax, pl.hp + 1.5 / 60);
    // hunger: the stomach empties over ~2 minutes (faster while dashing); starving to death at zero
    pl.food = Math.max(0, pl.food - 100 / (120 * 60) * (1 + 0.8 * pl.boost));
    if (pl.food < 25 && pl.foodWarn === 0) { pl.foodWarn = 1; ctx.msg(t('hungry'), [255, 200, 110]); ctx.sound?.('starve'); }
    if (pl.food < 10 && pl.foodWarn === 1) { pl.foodWarn = 2; ctx.msg(t('starving'), [255, 150, 90]); ctx.sound?.('starve'); }
    if (pl.food > 40) pl.foodWarn = 0;
    if (pl.food <= 0) { die(null); return; }
    if (pl.shell < 0.5) eat(time);
    else {
      // hiding in the shell lets go of the prey: the tongue snaps back, a held creature swims off
      if (pl.tg) { pl.tg.c.grabbed = false; pl.tg = null; pl.tgBack = 1; }
      if (pl.grab) { const c = pl.grab; c.grabbed = false; c.swal = 0; c.mouth = 0; c.state = 1; c.timer = 0; pl.grab = null; pl.grabT = 0; }
    }
    pl.tgBack = Math.max(0, pl.tgBack - 0.2);
    // the model follows
    if (pl.char === 0) {
      Object.assign(rig.s, { x: pl.x, y: pl.y, z: pl.z, yaw: pl.yaw * D, pitch: pl.pitch * D, roll: pl.roll * D, L: pl.L, spread: pl.open });
      rig.anim(Math.abs(pl.spd), pl.boost, time);
    } else if (pl.char === 1) {
      pl.ntHide = approach(pl.ntHide, pl.shell, 0.12);
      pl.ntPh += 0.05 + Math.abs(pl.spd) * 0.04 + pl.pulse * 0.25;
    } else {
      oct.arms(pl, time, ctx.frame());
      oct.mantleSpring(pl, time);
    }
  }

  // another creature in the same place (the select screen): health and model change, nothing else
  function setChar(ch) {
    pl.char = ch; pl.hp = pl.hpmax = CHARS[ch].hp;
    Object.assign(rig.s, { x: pl.x, y: pl.y, z: pl.z, yaw: pl.yaw * D, L: pl.L });
    rig.init();
    oct.reset(pl);
    showModel();
  }

  // title screens: the creature hovers in place, turning a little to show itself (scr_title_step)
  function titleStep(time, mtime, baseYaw) {
    pl.prev.x = pl.x; pl.prev.y = pl.y; pl.prev.z = pl.z;
    pl.yaw = baseYaw + Math.sin(mtime * 0.35) * 32;
    pl.pitch = Math.sin(mtime * 0.5) * 6; pl.roll = 0;
    pl.spd = 0.4; pl.boost = 0; pl.shell = 0; pl.vx = pl.vy = pl.vz = 0;
    pl.open = 0.15 + 0.15 * Math.sin(time);
    if (pl.char === 0) {
      Object.assign(rig.s, { x: pl.x, y: pl.y, z: pl.z, yaw: pl.yaw * D, pitch: pl.pitch * D, roll: 0, L: pl.L, spread: pl.open });
      rig.anim(0.4, 0, time);
    } else if (pl.char === 1) {
      pl.ntHide = approach(pl.ntHide, 0, 0.12);
      pl.ntPh += 0.05 + 0.4 * 0.04;
    } else {
      const o = oct.o;
      o.byaw = pl.yaw; o.bpitch = pl.pitch - 18; o.gnd = 0; o.jet = 0; o.atk = 0; o.camo = 0;
      oct.arms(pl, time, ctx.frame());
    }
  }

  // a: interpolation factor between the last two steps
  const pos = (a) => ({ x: pl.prev.x + (pl.x - pl.prev.x) * a, y: pl.prev.y + (pl.y - pl.prev.y) * a, z: pl.prev.z + (pl.z - pl.prev.z) * a });
  function render(a, time) {
    if (!pl.alive) return;
    const p = pos(a);
    if (pl.char === 0) {
      const flash = (pl.boost > 0.3 || pl.hurt > 0.5) && Math.sin(time * 16) > 0;
      rig.draw(p.x, p.y, p.z, flash);
    } else if (pl.char === 1) {
      let tongue = null;
      if ((pl.tg || pl.tgBack > 0) && pl.mouth) {
        // the mouth withdraws into the shell together with the body
        const S = pl.L, h = pl.ntHide, cp = Math.cos(pl.pitch * D);
        const fx = Math.cos(pl.yaw * D) * cp, fy = -Math.sin(pl.yaw * D) * cp, fz = Math.sin(pl.pitch * D);
        const mx = p.x + fx * S * 0.3 * (1 - h), my = p.y + fy * S * 0.3 * (1 - h), mz = p.z + fz * S * 0.3 * (1 - h) - S * 0.05;
        const g = pl.tg || pl.lastTg;
        if (g) {
          if (!pl.tg) { g.x = mx + (g.x - mx) * pl.tgBack; g.y = my + (g.y - my) * pl.tgBack; g.z = mz + (g.z - mz) * pl.tgBack; }
          tongue = { mx, my, mz, tx: g.x, ty: g.y, tz: g.z };
          pl.lastTg = g;
        }
      }
      naut.draw({ x: p.x, y: p.y, z: p.z, yaw: pl.yaw, pitch: pl.pitch, roll: pl.roll, L: pl.L, hide: pl.ntHide, ph: pl.ntPh, open: pl.open, pulse: pl.pulse, tongue }, time);
    } else oct.draw(pl, p.x, p.y, p.z, time);
  }

  return { pl, rig, oct, step, titleStep, setChar, render, pos, hurt, die, reset, known, showModel };
}
