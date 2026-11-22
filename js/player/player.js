// Player squid - port of scr_player_update (08_player.gml) and scr_pl_steer (27_octopus.gml).
// The simulation runs in the original's fixed 1/60 s steps, so the per-step numbers are kept as they were
// (speeds in units per step, angles in degrees). Controls as agreed for the web version:
//  * the stick / A D / arrows only turn the squid and raise / lower its nose (analog on touch);
//    released, the nose levels out again like in the original;
//  * it moves only with Swim (W) or Dash (Shift) - Dash alone also moves, so one button is enough on a phone;
//  * Dash drains stamina; empty, the squid is exhausted until 25 % has come back.
import { terrainH, SURF_Z, clamp } from '../world/terrain.js';
import { createSquidRig } from '../creatures/squidModel.js';

const D = Math.PI / 180;
const approach = (v, t, s) => (v < t ? Math.min(v + s, t) : Math.max(v - s, t));

export function createPlayer(scene, spawn) {
  const rig = createSquidRig(scene, 0);
  const pl = {
    x: spawn.x, y: spawn.y, z: terrainH(spawn.x, spawn.y) + 170,
    yaw: Math.random() * 360, pitch: 0, roll: 0,                 // degrees, original convention
    L: 30, Lt: 30, spd: 0, tv: 0, pv: 0, boost: 0, boostT: 0,
    st: 100, stmax: 100, exh: false, stDelay: 0, slow: 0,
    vx: 0, vy: 0, vz: 0, kx: 0, ky: 0, kz: 0, hurt: 0, dist: 0,
    prev: { x: 0, y: 0, z: 0 },
  };
  pl.prev.x = pl.x; pl.prev.y = pl.y; pl.prev.z = pl.z;
  Object.assign(rig.s, { x: pl.x, y: pl.y, z: pl.z, yaw: pl.yaw * D, pitch: 0, roll: 0, L: pl.L });
  rig.init();

  // one 1/60 s step; inp: actions from core/input.js; t: game time (s)
  function step(inp, t) {
    pl.prev.x = pl.x; pl.prev.y = pl.y; pl.prev.z = pl.z;
    const L = pl.L;
    pl.hurt = Math.max(0, pl.hurt - 0.03);
    const maxs = (2.9 + L * 0.011) * (1 - pl.slow);
    pl.slow = Math.max(0, pl.slow - 0.003);
    // stamina: dash drains it, it comes back after a short delay
    const can = pl.st > 0 && !pl.exh;
    const fwdKey = inp.swim > 0;
    const boosting = inp.boost && can && (fwdKey || inp.boost || pl.spd > maxs * 0.5);
    const fwd = fwdKey || boosting;
    if (boosting) {
      pl.st = Math.max(0, pl.st - 30 / 60);
      pl.stDelay = 40;
      if (pl.st <= 0) pl.exh = true;
    } else if (pl.stDelay > 0) pl.stDelay--;
    else pl.st = Math.min(pl.stmax, pl.st + 15 / 60);
    pl.boost = approach(pl.boost, boosting ? 1 : 0, 0.06);
    if (boosting) pl.boostT += 1 / 60;
    if (pl.exh && pl.st >= pl.stmax * 0.25) pl.exh = false;
    // speed
    let ts = 0;
    if (fwd) ts = maxs * (1 + 1.15 * (boosting ? 1 : 0));
    else if (inp.back) ts = -maxs * 0.35;
    let acc = 0.07 + 0.12 * (boosting ? 1 : 0);
    if (!fwd && !inp.back) acc = 0.035;
    pl.spd = approach(pl.spd, ts, acc);
    // steering: the turn rate builds up and dies down over a few steps; a jetting squid turns sharper
    const tr = 3.4 / (1 + L / 500) * (1 + 0.4 * pl.boost);
    const tdy = tr * inp.turn;
    const k = Math.abs(tdy) < Math.abs(pl.tv) ? tr * 0.14 : tr * 0.085;
    pl.tv = approach(pl.tv, tdy, k);
    pl.yaw = (pl.yaw + pl.tv + 360) % 360;
    pl.roll += (-pl.tv * 8 - pl.spd * pl.tv * 0.5 - pl.roll) * 0.1;
    // climbing / diving: the pitch rate builds up and dies down gradually as well; released -> level
    const tp = 55 * inp.pitch;
    const kp = 2.3 + pl.boost * 0.9;
    pl.pv = approach(pl.pv, clamp((tp - pl.pitch) * 0.15, -kp, kp), kp * 0.1);
    pl.pitch = clamp(pl.pitch + pl.pv, -60, 60);
    // move
    const cosp = Math.cos(pl.pitch * D);
    pl.vx = Math.cos(pl.yaw * D) * pl.spd * cosp + pl.kx;
    pl.vy = -Math.sin(pl.yaw * D) * pl.spd * cosp + pl.ky;
    pl.vz = pl.spd * Math.sin(pl.pitch * D) + pl.kz;
    pl.x += pl.vx; pl.y += pl.vy; pl.z += pl.vz;
    pl.dist += Math.hypot(pl.vx, pl.vy, pl.vz) * 0.02;
    pl.kx *= 0.9; pl.ky *= 0.9; pl.kz *= 0.9;
    // seabed and surface
    const bed = terrainH(pl.x, pl.y);
    if (pl.z < bed + L * 0.35 + 4) { pl.z = bed + L * 0.35 + 4; if (pl.pitch < 0) pl.pitch *= 0.6; }
    if (pl.z > SURF_Z - L * 0.3 - 12) { pl.z = SURF_Z - L * 0.3 - 12; if (pl.pitch > 0) pl.pitch *= 0.6; }
    // growth smoothing
    if (pl.L < pl.Lt) pl.L = Math.min(pl.Lt, pl.L + Math.max(0.02, (pl.Lt - pl.L) * 0.04));
    // the rig follows
    Object.assign(rig.s, { x: pl.x, y: pl.y, z: pl.z, yaw: pl.yaw * D, pitch: pl.pitch * D, roll: pl.roll * D, L: pl.L });
    rig.anim(Math.abs(pl.spd), pl.boost, t);
  }

  // a: interpolation factor between the last two steps
  const pos = (a) => ({ x: pl.prev.x + (pl.x - pl.prev.x) * a, y: pl.prev.y + (pl.y - pl.prev.y) * a, z: pl.prev.z + (pl.z - pl.prev.z) * a });
  function render(a, t) {
    const p = pos(a);
    const flash = (pl.boost > 0.3 || pl.hurt > 0.5) && Math.sin(t * 16) > 0;
    rig.draw(p.x, p.y, p.z, flash);
  }

  return { pl, rig, step, render, pos };
}
