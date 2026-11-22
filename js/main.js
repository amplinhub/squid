// GROW UP - web version. The streaming seabed world of the original with its atmosphere, the player squid
// (eating, growing, health, hunger, death), the creatures of the original, effects, chase camera.
import * as THREE from 'three';
import { startLoop } from './core/loop.js';
import { initInput, pollInput, input } from './core/input.js';
import { applyLang, toggleLang, getLang, t, spName } from './core/i18n.js';
import { quality, qualityTick, setQualityMode, qualityMode, frameTime } from './core/quality.js';
import { createRenderer } from './render/renderer.js';
import { createAtmosphere } from './render/atmosphere.js';
import { createWorld } from './world/world.js';
import { setWorldSeed, worldSeed, findSpawn, terrainH, biomeAt, depthM, SURF_Z, clamp } from './world/terrain.js';
import { createPlayer, stageName } from './player/player.js';
import { createCreatures, buildModelsStep } from './creatures/creatures.js';
import { createFx } from './fx/fx.js';
import { initMessages, msg, msgStep, msgClear } from './ui/messages.js';

const $ = (id) => document.getElementById(id);
const setLoad = (k, key) => { $('load-fill').style.width = Math.round(k * 100) + '%'; if (key) $('load-text').textContent = t(key); };
const nextFrame = () => new Promise((r) => requestAnimationFrame(r));
const D = Math.PI / 180;

applyLang();
initMessages();
setLoad(0.05, 'loading');

const { renderer, scene, camera } = createRenderer($('game'));
const atmo = createAtmosphere(scene, camera, renderer);
setWorldSeed(Math.floor(Math.random() * 100001));
const world = createWorld(scene, atmo);
let stepN = 0;
const spawnPoint = findSpawn();
// systems refer to each other through small context objects
const ctx = { frame: () => stepN, msg, creatures: null, fx: null, onDeath: null };
const player = createPlayer(scene, spawnPoint, ctx);
const pl = player.pl;
const creatures = createCreatures(scene, world, atmo, {
  view: world.view,
  player: () => ({ x: pl.x, y: pl.y, z: pl.z, vx: pl.vx, vy: pl.vy, vz: pl.vz, L: pl.L, tv: pl.tv, alive: pl.alive, vis: pl.vis, hidden: pl.hidden }),
});
const fx = createFx(scene, {
  view: world.view, chunks: () => world.chunks(), gfx: () => quality().gfx, cap: () => quality().particles,
  player: () => ({ x: pl.x, y: pl.y, z: pl.z, yaw: pl.yaw, pitch: pl.pitch, spd: pl.spd, boost: pl.boost, L: pl.L, alive: pl.alive }),
});
ctx.creatures = creatures; ctx.fx = fx;

// what creatures do to the player and to each other
const R = Math.random, rr = (a, b) => a + R() * (b - a);
creatures.hooks.bite = (c, dmg) => player.hurt(dmg, c);
creatures.hooks.threat = (c) => { msg(t(c.sp.fem ? 'threat_f' : 'threat_m', { n: spName(c.sp) }), [255, 120, 100]); threatFlash = 1; };
creatures.hooks.lost = (c) => msg(t(c.sp.fem ? 'lost_f' : 'lost_m', { n: spName(c.sp) }), [150, 230, 190]);
creatures.hooks.eaten = (prey) => fx.remains(prey.sp.kind, prey.x, prey.y, prey.z, prey.len, prey.yaw);
creatures.hooks.ink = (c) => fx.cloud(c.x, c.y, c.z, c.len * 1.2, 1, 6);
creatures.hooks.bubbles = (c) => {
  const lx = 0.4 * c.len, lz = 0.14 * c.len, e = c.pitch * D, f = Math.cos(e) * lx - Math.sin(e) * lz;
  fx.bubble(c.x + Math.cos(c.yaw * D) * f + rr(-1, 1), c.y - Math.sin(c.yaw * D) * f + rr(-1, 1), c.z + Math.sin(e) * lx + Math.cos(e) * lz,
            rr(-0.1, 0.1), rr(-0.1, 0.1), rr(0.5, 0.9), rr(0.8, 2.2), 260);
};
let threatFlash = 0;

// ---------- interface ----------
const isTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
function showTouch() {
  $('touch').hidden = false;
  $('hint').dataset.i18n = 'hint_touch';
  applyLang();
}
initInput(showTouch);
if (isTouch) showTouch();

const langBtn = $('btn-lang');
const syncLangBtn = () => { langBtn.textContent = getLang().toUpperCase(); };
syncLangBtn();
langBtn.addEventListener('click', () => { toggleLang(); syncLangBtn(); });

let paused = false;
function setPaused(p) {
  paused = p;
  $('pause').hidden = !p;
  $('sel-quality').value = qualityMode();
}
$('btn-pause').addEventListener('click', () => setPaused(true));
$('btn-resume').addEventListener('click', () => setPaused(false));
$('sel-quality').addEventListener('change', (e) => setQualityMode(e.target.value));
// leaving the tab or minimising the browser pauses the game
document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });
// F3 shows / hides the technical line
addEventListener('keydown', (e) => { if (e.code === 'F3') { e.preventDefault(); $('debug').hidden = !$('debug').hidden; } });

// ---------- view range and chase camera (scr_view_update, scr_camera_step) ----------
const viewDist = () => clamp(810 + pl.L * 4, 850, 2700) * quality().viewMult;
const cam = { x: 0, y: 0, z: 0, yaw: pl.yaw * D, fov: 64, init: false, lockW: 0, lx: 0, ly: 0, lz: 0 };
const look = new THREE.Vector3();
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d <= -Math.PI) d += 2 * Math.PI; return d; };

function updateCamera(a, dt) {
  const p = player.pos(a), yaw = pl.yaw * D, pitch = pl.pitch * D, L = pl.L;
  const steps = dt * 60;                              // the original smoothed per 1/60 s step
  let cx, cy, cz, tx, ty, tz;
  if (pl.alive) {
    cam.yaw += angDiff(yaw, cam.yaw) * (1 - Math.pow(1 - 0.075, steps));
    const dist = 28 + L * 1.85, hgt = 8 + L * 0.5, cp = Math.cos(pitch * 0.5);
    cx = p.x - Math.cos(cam.yaw) * dist * cp; cy = p.y + Math.sin(cam.yaw) * dist * cp;
    cz = p.z + hgt - Math.sin(pitch) * dist * 0.55;
    tx = p.x + Math.cos(yaw) * L * 0.7; ty = p.y - Math.sin(yaw) * L * 0.7; tz = p.z + L * 0.25 + Math.sin(pitch) * L * 0.6;
    // the gaze follows the locked prey (blended in / out)
    const lk = pl.lock && !pl.lock.dead ? pl.lock : null;
    cam.lockW += ((lk ? 1 : 0) - cam.lockW) * Math.min(1, 0.04 * steps * 1.5);
    if (lk) { cam.lx = lk.x; cam.ly = lk.y; cam.lz = lk.z; }
    if (cam.lockW > 0.001) { const w = 0.4 * cam.lockW; tx += (cam.lx - tx) * w; ty += (cam.ly - ty) * w; tz += (cam.lz - tz) * w; }
  } else {
    // death: the camera drifts upwards over the cloud
    cx = cam.x; cy = cam.y; cz = cam.z + 0.25 * steps;
    tx = pl.x; ty = pl.y; tz = pl.z;
  }
  const k = cam.init ? 1 - Math.pow(1 - 0.14, steps) : 1;
  cam.init = true;
  cam.x += (cx - cam.x) * k; cam.y += (cy - cam.y) * k; cam.z += (cz - cam.z) * k;
  cam.z = clamp(cam.z, terrainH(cam.x, cam.y) + 14, SURF_Z - 8);
  // shake on hits and bites
  const sh = pl.shake, j = () => (R() * 2 - 1) * sh;
  camera.position.set(cam.x + j(), cam.z + j() * 0.6, cam.y + j());
  camera.lookAt(look.set(tx, tz, ty));
  // vertical field of view of the original in landscape; in portrait it widens so the sides are not lost
  cam.fov += (62 + pl.boost * 11 - cam.fov) * (1 - Math.pow(1 - 0.08, steps));
  const aspect = camera.aspect, vd = viewDist();
  camera.fov = aspect >= 1 ? cam.fov : 2 * Math.atan(Math.tan(cam.fov * Math.PI / 360) / Math.max(aspect, 0.75)) * 180 / Math.PI;
  camera.near = clamp(L * 0.12, 3, 40);
  camera.far = vd * 1.08 + 200;
  camera.updateProjectionMatrix();
  return vd;
}

// ---------- temporary status bars (the real HUD comes with stage 7) ----------
const bars = { hp: $('bar-hp'), st: $('bar-st'), food: $('bar-food') };
function updateBars() {
  bars.hp.style.width = clamp(pl.hp / pl.hpmax, 0, 1) * 100 + '%';
  bars.st.style.width = clamp(pl.st / pl.stmax, 0, 1) * 100 + '%';
  bars.st.classList.toggle('exh', pl.exh);
  bars.food.style.width = clamp(pl.food, 0, 100) + '%';
  $('stat-size').textContent = `${stageName(pl.L)} · ${(pl.L / 50).toFixed(2)} ${t('size_m')}`;
  $('stat-score').textContent = `${t('score')}: ${pl.score}`;
  $('stat-depth').textContent = `${Math.round(depthM(pl.z))} ${t('size_m')}`;
  $('hurt').style.opacity = String(Math.max(pl.hurt * 0.55, threatFlash * 0.25));
}

// ---------- death and a new life ----------
let deathShown = false;
ctx.onDeath = () => { msgClear(); deathShown = false; };
function showDeath() {
  deathShown = true;
  const s = Math.round(pl.time), mm = Math.floor(s / 60), ss = String(s % 60).padStart(2, '0');
  $('dead-cause').textContent = pl.killer ? t('dead_by', { k: spName(pl.killer, true) }) : t('dead_starved');
  $('dead-stats').innerHTML =
    `<div><span>${t('dead_size')}</span><b>${stageName(pl.maxL)} · ${(pl.maxL / 50).toFixed(2)} ${t('size_m')}</b></div>` +
    `<div><span>${t('dead_eaten')}</span><b>${pl.eaten}</b></div>` +
    `<div><span>${t('dead_time')}</span><b>${mm}:${ss}</b></div>` +
    `<div class="big"><span>${t('dead_score')}</span><b>${pl.score}</b></div>`;
  $('dead').hidden = false;
}
function newLife() {
  $('dead').hidden = true;
  creatures.clear(); fx.clear(); msgClear();
  player.reset(spawnPoint);
  cam.init = false; cam.yaw = pl.yaw * D;
  creatures.startSpawn();
  for (const c of world.chunks()) if (c.stage > 0) { c.seen = false; }
}
$('btn-again').addEventListener('click', newLife);

// ---------- loading: models, then the world around the spawn ----------
async function load() {
  setLoad(0.05, 'load_creatures');
  for (let k = 0; k < 1;) { const t0 = performance.now(); while (k < 1 && performance.now() - t0 < 30) k = buildModelsStep(); setLoad(0.05 + 0.35 * k); await nextFrame(); }
  setLoad(0.4, 'load_scene');
  const s = player.pos(1);
  world.setView(viewDist());
  world.update(s.x, s.y, 0);
  let total = 0;
  for (;;) {
    world.update(s.x, s.y, 25);
    const n = world.pendingNear(s.x, s.y);
    total = Math.max(total, n);
    setLoad(0.4 + 0.55 * (total ? 1 - n / total : 1));
    if (n === 0) break;
    await nextFrame();
  }
  await Promise.race([atmo.ready, new Promise((r) => setTimeout(r, 3000))]);
  creatures.endInitialSpawn();
  setLoad(1, 'load_done');
}

// ---------- loop ----------
let time = 0, fpsAcc = 0, fpsN = 0, fpsShow = 0, dbgT = 0;
const dbg = $('debug');
const BIOMES = ['sand', 'reef', 'kelp', 'abyss'];

function simStep(dt) {
  const inp = pollInput();
  if (inp.pauseHit) setPaused(!paused);
  if (paused) return;
  time += dt; stepN++;
  player.step(inp, time);
  creatures.update(time);
  fx.step(time, cam);
  msgStep();
  threatFlash = Math.max(0, threatFlash - 0.02);
  if (!pl.alive && !deathShown && pl.deadT > 70) showDeath();
}

function frame(a, dt) {
  if (!paused) qualityTick(dt);
  const ia = paused ? 1 : a;
  player.render(ia, time);
  const vd = updateCamera(ia, paused ? 0 : dt);
  const p = player.pos(ia);
  world.setView(vd);
  world.update(p.x, p.y, quality().buildMs);
  world.visibility(cam.x, cam.y);
  creatures.render(ia, cam, time, { x: p.x, y: p.y, z: p.z, L: pl.L, lock: pl.lock, alive: pl.alive });
  const pxu = renderer.getDrawingBufferSize(new THREE.Vector2()).y / 2 / Math.tan(camera.fov * Math.PI / 360);
  fx.render(ia, cam, pxu);
  atmo.update(time, cam, vd, quality().gfx);
  renderer.render(scene, camera);
  updateBars();

  fpsAcc += dt; fpsN++;
  if (fpsAcc >= 0.5) { fpsShow = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
  dbgT -= dt;
  if (dbgT <= 0 && !dbg.hidden) {
    dbgT = 0.25;
    const info = renderer.info.render, st = world.stats, h = terrainH(p.x, p.y);
    dbg.textContent = `FPS ${fpsShow}  ${(frameTime() * 1000).toFixed(1)} ms  Q ${quality().name} (${qualityMode()})  px ${renderer.getPixelRatio().toFixed(2)}\n` +
      `draw ${info.calls}  tri ${info.triangles}  view ${Math.round(vd)}\n` +
      `chunks ${st.loaded}/${st.pending}  fish ${creatures.stats.n}/${creatures.stats.drawn}  fx ${fx.count()}\n` +
      `bottom ${Math.round(depthM(h))} m ${BIOMES[biomeAt(p.x, p.y, h)]}  seed ${worldSeed()}  v ${pl.spd.toFixed(2)}` + (input.touch ? '  touch' : '');
  }
}

// handle for automated checks in the browser console (no effect on the game)
window.__gu = { player, world, atmo, camera, renderer, cam, creatures, fx };

load().then(() => {
  startLoop(simStep, frame);
  $('hud').hidden = false;
  $('loading').classList.add('fade');
  setTimeout(() => $('loading').remove(), 600);
  setTimeout(() => { $('hint').style.transition = 'opacity 1.5s'; $('hint').style.opacity = '0'; }, 12000);
});
