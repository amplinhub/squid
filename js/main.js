// GROW UP - web version. Studio logo, main menu above the water, the dive and the creature select, then the
// streaming seabed world of the original with the player (squid, nautilus, octopus), the creatures,
// effects and the chase camera.
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
import { isUnlocked, setChar, chosenChar, progress, required } from './core/progress.js';
import { playLogo } from './title/logo.js';
import { createSurface } from './title/surface.js';
import { createTitle } from './title/title.js';

const $ = (id) => document.getElementById(id);
const setLoad = (k, key) => { $('load-fill').style.width = Math.round(k * 100) + '%'; if (key) $('load-text').textContent = t(key); };
// yields to the browser (a timer, not a frame: loading also finishes in a background tab)
const yieldNow = () => new Promise((r) => setTimeout(r, 0));
const D = Math.PI / 180;

applyLang();
initMessages();

const { renderer, scene, camera } = createRenderer($('game'));
const atmo = createAtmosphere(scene, camera, renderer);
const surface = createSurface(scene);
surface.sea.layers.set(1);                      // the ocean top is seen only from above the water
setWorldSeed(Math.floor(Math.random() * 100001));
const world = createWorld(scene, atmo);
let stepN = 0, mode = 'title';
const spawnPoint = findSpawn();
// systems refer to each other through small context objects
const ctx = { frame: () => stepN, msg, creatures: null, fx: null, onDeath: null };
const player = createPlayer(scene, spawnPoint, ctx, world);
const pl = player.pl;
const creatures = createCreatures(scene, world, atmo, {
  view: world.view,
  // in the title screens the creatures ignore the player
  player: () => ({ x: pl.x, y: pl.y, z: pl.z, vx: pl.vx, vy: pl.vy, vz: pl.vz, L: pl.L, tv: pl.tv, alive: pl.alive && mode === 'play', vis: pl.vis, hidden: pl.hidden, char: pl.char }),
  inInk: (x, y, z, m) => fx.inInk(x, y, z, m), inkCount: () => fx.inkCount(),
});
const fx = createFx(scene, {
  view: world.view, chunks: () => world.chunks(), gfx: () => quality().gfx, cap: () => quality().particles,
  player: () => ({ x: pl.x, y: pl.y, z: pl.z, yaw: pl.yaw, pitch: pl.pitch, spd: pl.spd, boost: pl.boost, L: pl.L, alive: pl.alive && mode === 'play' }),
});
ctx.creatures = creatures; ctx.fx = fx;
if (chosenChar() !== 0) player.setChar(chosenChar());

// what creatures do to the player and to each other
const R = Math.random, rr = (a, b) => a + R() * (b - a);
creatures.hooks.bite = (c, dmg) => player.hurt(dmg, c);
creatures.hooks.threat = (c) => { msg(t(c.sp.fem ? 'threat_f' : 'threat_m', { n: spName(c.sp) }), [255, 120, 100]); threatFlash = 1; };
creatures.hooks.lost = (c) => msg(t(c.sp.fem ? 'lost_f' : 'lost_m', { n: spName(c.sp) }), [150, 230, 190]);
creatures.hooks.blind = (c) => msg(t(c.sp.fem ? 'blind_f' : 'blind_m', { n: spName(c.sp) }), [190, 170, 255]);
creatures.hooks.bored = (c) => msg(t(c.sp.fem ? 'bored_f' : 'bored_m', { n: spName(c.sp) }), [230, 220, 190]);
creatures.hooks.eaten = (prey) => fx.remains(prey.sp.kind, prey.x, prey.y, prey.z, prey.len, prey.yaw);
creatures.hooks.ink = (c) => fx.cloud(c.x, c.y, c.z, c.len * 1.2, 1, 6);
creatures.hooks.bubbles = (c) => {
  const lx = 0.4 * c.len, lz = 0.14 * c.len, e = c.pitch * D, f = Math.cos(e) * lx - Math.sin(e) * lz;
  fx.bubble(c.x + Math.cos(c.yaw * D) * f + rr(-1, 1), c.y - Math.sin(c.yaw * D) * f + rr(-1, 1), c.z + Math.sin(e) * lx + Math.cos(e) * lz,
            rr(-0.1, 0.1), rr(-0.1, 0.1), rr(0.5, 0.9), rr(0.8, 2.2), 260);
};
let threatFlash = 0;

// ---------- interface ----------
const isTouch = () => input.touch || matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
initInput(() => { if (mode === 'play') syncPlayUI(); });
// the HUD and the touch controls only while playing
function syncPlayUI() {
  const play = mode === 'play';
  $('hud').hidden = !play;
  $('touch').hidden = !(play && isTouch());
  $('btn-pause').hidden = !play;
  $('hint').dataset.i18n = isTouch() ? 'hint_touch' : 'hint_keys';
  applyLang();
  syncAbility();
}

const langBtn = $('btn-lang');
const syncLangBtn = () => { langBtn.textContent = getLang().toUpperCase(); };
syncLangBtn();
langBtn.addEventListener('click', () => { toggleLang(); syncLangBtn(); syncAbility(); if (title.phase() === 2) title.fillSelect(); });

// pause during the game; the same panel is the settings window of the main menu
let paused = false;
function setPaused(p, settings = false) {
  paused = p && !settings;
  $('pause').hidden = !p;
  $('sel-quality').value = qualityMode();
  $('pause-title').textContent = t(settings ? 'menu_settings' : 'paused');
  $('btn-resume').textContent = t(settings ? 'close' : 'resume');
  $('btn-mainmenu').hidden = settings;
}
$('btn-pause').addEventListener('click', () => setPaused(true));
$('btn-resume').addEventListener('click', () => setPaused(false));
$('btn-mainmenu').addEventListener('click', () => { setPaused(false); toMainMenu(); });
$('sel-quality').addEventListener('change', (e) => setQualityMode(e.target.value));
// the Ability button: the nautilus hides in its shell, the octopus squirts ink, the squid has none
function syncAbility() {
  const b = $('btn-ability');
  b.style.visibility = pl.char === 0 ? 'hidden' : 'visible';
  if (pl.char) b.textContent = t('abil' + pl.char);
}
// leaving the tab or minimising the browser pauses the game
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'play' && pl.alive) setPaused(true); });
// F3 shows / hides the technical line
addEventListener('keydown', (e) => { if (e.code === 'F3') { e.preventDefault(); $('debug').hidden = !$('debug').hidden; } });

// ---------- title screens ----------
const title = createTitle({
  player, progress, required, isUnlocked, isTouch,
  camNow: () => cam,
  onSelect: (c) => player.setChar(c),
  onLocked: (c) => msg(t(c === 2 ? 'locked_msg_oct' : 'locked_msg'), [255, 200, 150]),
  onSettings: () => setPaused(true, true),
  onRebuild: () => newLife(pl.char),
  onStart: (c) => {
    setChar(c); player.setChar(c);
    mode = 'play';
    cam.x = title.cam.x; cam.y = title.cam.y; cam.z = title.cam.z; cam.yaw = pl.yaw * D; cam.init = true;
    syncPlayUI();
    msg(t('start_tip'), [220, 240, 255]);
    $('hint').style.opacity = '0.75';
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => { $('hint').style.transition = 'opacity 1.5s'; $('hint').style.opacity = '0'; }, 12000);
  },
});
let hintTimer = 0;
function toMainMenu() {
  mode = 'title';
  $('dead').hidden = true;
  syncPlayUI();
  title.rise();
}

// ---------- view range and chase camera (scr_view_update, scr_camera_step) ----------
const viewDist = () => clamp(810 + pl.L * 4, 850, 2700) * quality().viewMult;
const cam = { x: 0, y: 0, z: 0, yaw: pl.yaw * D, fov: 64, init: false, lockW: 0, lx: 0, ly: 0, lz: 0 };
const look = new THREE.Vector3();
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d <= -Math.PI) d += 2 * Math.PI; return d; };
// vertical field of view of the original in landscape; in portrait it widens so the sides are not lost
const fovFor = (f) => (camera.aspect >= 1 ? f : 2 * Math.atan(Math.tan(f * Math.PI / 360) / Math.max(camera.aspect, 0.75)) * 180 / Math.PI);

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
  const sh = pl.shake, j = () => (R() * 2 - 1) * sh;
  camera.position.set(cam.x + j(), cam.z + j() * 0.6, cam.y + j());
  camera.lookAt(look.set(tx, tz, ty));
  cam.fov += (62 + pl.boost * 11 - cam.fov) * (1 - Math.pow(1 - 0.08, steps));
  camera.fov = fovFor(cam.fov);
  return lens(L);
}
function lens(L) {
  const vd = viewDist();
  camera.near = clamp(L * 0.12, 3, 40);
  camera.far = vd * 1.08 + 200;
  return vd;
}
// the title camera: wherever title.js puts it
function titleCamera(mtime) {
  const c = title.cam;
  cam.x = c.x; cam.y = c.y; cam.z = c.z;
  camera.position.set(c.x, c.z, c.y);
  camera.lookAt(look.set(c.tx, c.tz, c.ty));
  camera.fov = fovFor(c.fov);
  const above = c.z > SURF_Z;
  camera.near = above ? 4 : clamp(pl.L * 0.12, 3, 40);
  camera.far = above ? 7000 : viewDist() * 1.08 + 200;
  return viewDist();
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
  $('hurt').style.opacity = String(mode === 'play' ? Math.max(pl.hurt * 0.55, threatFlash * 0.25) : 0);
}

// ---------- death and a new life ----------
let deathShown = false;
ctx.onDeath = () => { msgClear(); deathShown = false; };
function showDeath() {
  deathShown = true;
  const s = Math.round(pl.time), mm = Math.floor(s / 60), ss = String(s % 60).padStart(2, '0');
  $('dead-cause').textContent = pl.killer ? t(pl.killer.fem ? 'dead_by_f' : 'dead_by_m', { k: spName(pl.killer, true) }) : t('dead_starved');
  $('dead-stats').innerHTML =
    `<div><span>${t('dead_size')}</span><b>${stageName(pl.maxL)} · ${(pl.maxL / 50).toFixed(2)} ${t('size_m')}</b></div>` +
    `<div><span>${t('dead_eaten')}</span><b>${pl.eaten}</b></div>` +
    `<div><span>${t('dead_time')}</span><b>${mm}:${ss}</b></div>` +
    `<div class="big"><span>${t('dead_score')}</span><b>${pl.score}</b></div>`;
  $('dead').hidden = false;
}
// a new life: same world, fresh creatures, the player back at the spawn
function newLife(ch = pl.char) {
  $('dead').hidden = true;
  creatures.clear(); fx.clear(); msgClear();
  player.reset(spawnPoint, ch);
  syncAbility();
  cam.init = false; cam.yaw = pl.yaw * D;
  creatures.startSpawn();
  for (const c of world.chunks()) if (c.stage > 0) c.seen = false;
}
// after a death the next life starts at the creature select, like the original
$('btn-again').addEventListener('click', () => { newLife(); mode = 'title'; syncPlayUI(); title.begin(true); });

// ---------- loading: models, then the world around the spawn (in small slices while the logo plays) ----------
let loaded = false, logoDone = false;
async function load() {
  setLoad(0.05, 'load_creatures');
  for (let k = 0; k < 1;) { const t0 = performance.now(); while (k < 1 && performance.now() - t0 < 8) k = buildModelsStep(); setLoad(0.05 + 0.35 * k); await yieldNow(); }
  setLoad(0.4, 'load_scene');
  const s = player.pos(1);
  world.setView(viewDist());
  world.update(s.x, s.y, 0);
  let total = 0;
  for (;;) {
    world.update(s.x, s.y, logoDone ? 25 : 8);
    const n = world.pendingNear(s.x, s.y);
    total = Math.max(total, n);
    setLoad(0.4 + 0.55 * (total ? 1 - n / total : 1));
    if (n === 0) break;
    await yieldNow();
  }
  await Promise.race([Promise.all([atmo.ready, surface.ready]), new Promise((r) => setTimeout(r, 4000))]);
  setLoad(1, 'load_done');
  loaded = true;
}

// ---------- loop ----------
let time = 0, mtime = 0, fpsAcc = 0, fpsN = 0, fpsShow = 0, dbgT = 0, initDone = false;
const dbg = $('debug');
const BIOMES = ['sand', 'reef', 'kelp', 'abyss'];
const sky = $('sky'), skyG = sky.getContext('2d'), over = $('overlay'), overG = over.getContext('2d');

function simStep(dt) {
  const inp = pollInput();
  mtime += dt;
  if (mode === 'play') {
    if (inp.pauseHit && pl.alive) setPaused(!paused);
    if (paused) return;
  }
  time += dt; stepN++;
  if (mode === 'title') title.step(time, mtime, inp);
  else player.step(inp, time);
  if (stepN === 2 && !initDone) { creatures.endInitialSpawn(); initDone = true; }
  creatures.update(time);
  fx.step(time, cam);
  msgStep();
  threatFlash = Math.max(0, threatFlash - 0.02);
  if (mode === 'play' && !pl.alive && !deathShown && pl.deadT > 70) showDeath();
}

function frame(a, dt) {
  if (!paused) qualityTick(dt);
  const ia = paused ? 1 : a;
  player.render(ia, time);
  const vd = mode === 'title' ? titleCamera(mtime) : updateCamera(ia, paused ? 0 : dt);
  camera.updateProjectionMatrix();
  const above = cam.z > SURF_Z;
  // above the water: transparent clear, the 2D sky behind, only the ocean top drawn, glitter in front
  const W = innerWidth, H = innerHeight;
  if (sky.width !== W || sky.height !== H) { sky.width = over.width = W; sky.height = over.height = H; }
  overG.clearRect(0, 0, W, H);
  sky.hidden = !above;
  camera.layers.set(above ? 1 : 0);
  renderer.setClearAlpha(above ? 0 : 1);
  const pitchDeg = Math.asin(clamp((title.cam.tz - title.cam.z) / Math.max(1, Math.hypot(title.cam.tx - title.cam.x, title.cam.ty - title.cam.y, title.cam.tz - title.cam.z)), -1, 1)) / D;
  if (above) {
    surface.setVisible(true);
    surface.update(time, cam);
    surface.drawSky(skyG, W, H, mtime, pitchDeg, camera.fov);
  } else surface.setVisible(false);
  const p = player.pos(ia);
  world.setView(vd);
  world.update(p.x, p.y, quality().buildMs);
  world.visibility(cam.x, cam.y);
  creatures.render(ia, cam, time, { x: p.x, y: p.y, z: p.z, L: pl.L, lock: pl.lock, alive: pl.alive && mode === 'play' });
  const pxu = renderer.getDrawingBufferSize(new THREE.Vector2()).y / 2 / Math.tan(camera.fov * Math.PI / 360);
  fx.render(ia, cam, pxu);
  atmo.update(time, cam, vd, quality().gfx);
  renderer.render(scene, camera);
  if (above) surface.drawOverlay(overG, W, H, mtime, pitchDeg, camera.fov, mode === 'title' && title.phase() === 0 ? 1 : 0);
  title.render();
  updateBars();

  fpsAcc += dt; fpsN++;
  if (fpsAcc >= 0.5) { fpsShow = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
  dbgT -= dt;
  if (dbgT <= 0 && !dbg.hidden && mode === 'play') {
    dbgT = 0.25;
    const info = renderer.info.render, st = world.stats, h = terrainH(p.x, p.y);
    dbg.textContent = `FPS ${fpsShow}  ${(frameTime() * 1000).toFixed(1)} ms  Q ${quality().name} (${qualityMode()})  px ${renderer.getPixelRatio().toFixed(2)}\n` +
      `draw ${info.calls}  tri ${info.triangles}  view ${Math.round(vd)}\n` +
      `chunks ${st.loaded}/${st.pending}  fish ${creatures.stats.n}/${creatures.stats.drawn}  fx ${fx.count()}\n` +
      `bottom ${Math.round(depthM(h))} m ${BIOMES[biomeAt(p.x, p.y, h)]}  seed ${worldSeed()}  v ${pl.spd.toFixed(2)}` + (input.touch ? '  touch' : '');
  }
}

// handle for automated checks in the browser console (no effect on the game)
window.__gu = { scene, player, world, atmo, camera, renderer, cam, creatures, fx, title, simStep, frame, mode: () => mode };

// ---------- start: logo while loading, then the main menu ----------
const skip = { hit: false };
addEventListener('pointerdown', () => { skip.hit = true; }, { once: true });
addEventListener('keydown', () => { skip.hit = true; }, { once: true });
const loading = load();
playLogo(renderer, over, skip).then(async () => {
  logoDone = true;
  if (!loaded) $('loading').hidden = false;
  await loading;
  $('loading').classList.add('fade');
  setTimeout(() => $('loading').remove(), 600);
  renderer.setClearColor(0x03121c, 1);
  syncPlayUI();
  title.begin(false);
  startLoop(simStep, frame);
});
