// GROW UP - web version. The streaming seabed world of the original with its atmosphere, the player
// squid, the chase camera and the creatures of the original (species, models, behaviour, spawning).
import * as THREE from 'three';
import { startLoop } from './core/loop.js';
import { initInput, pollInput, input } from './core/input.js';
import { applyLang, toggleLang, getLang, t } from './core/i18n.js';
import { quality, qualityTick, setQualityMode, qualityMode, frameTime } from './core/quality.js';
import { createRenderer } from './render/renderer.js';
import { createAtmosphere } from './render/atmosphere.js';
import { createWorld } from './world/world.js';
import { setWorldSeed, worldSeed, findSpawn, terrainH, biomeAt, depthM, SURF_Z, clamp } from './world/terrain.js';
import { createPlayer } from './player/player.js';
import { createCreatures, buildModelsStep } from './creatures/creatures.js';

const $ = (id) => document.getElementById(id);
const setLoad = (k, key) => { $('load-fill').style.width = Math.round(k * 100) + '%'; if (key) $('load-text').textContent = t(key); };
const nextFrame = () => new Promise((r) => requestAnimationFrame(r));

applyLang();
setLoad(0.05, 'loading');

const { renderer, scene, camera } = createRenderer($('game'));
const atmo = createAtmosphere(scene, camera, renderer);
setWorldSeed(Math.floor(Math.random() * 100001));
const world = createWorld(scene, atmo);
const player = createPlayer(scene, findSpawn());
const pl = player.pl;
const D = Math.PI / 180;
// what the creatures see of the player (stage 4 adds hiding, death etc.)
const creatures = createCreatures(scene, world, atmo, {
  view: world.view,
  player: () => ({ x: pl.x, y: pl.y, z: pl.z, vx: pl.vx, vy: pl.vy, vz: pl.vz, L: pl.L, tv: pl.tv, alive: true, vis: 1, hidden: false }),
});

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

// ---------- view range and chase camera (scr_view_update, scr_camera_step) ----------
const viewDist = () => clamp(810 + pl.L * 4, 850, 2700) * quality().viewMult;
const cam = { x: 0, y: 0, z: 0, yaw: pl.yaw * D, fov: 64, init: false };
const look = new THREE.Vector3();
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d <= -Math.PI) d += 2 * Math.PI; return d; };

function updateCamera(a, dt) {
  const p = player.pos(a), yaw = pl.yaw * D, pitch = pl.pitch * D, L = pl.L;
  const steps = dt * 60;                              // the original smoothed per 1/60 s step
  cam.yaw += angDiff(yaw, cam.yaw) * (1 - Math.pow(1 - 0.075, steps));
  const dist = 28 + L * 1.85, hgt = 8 + L * 0.5, cp = Math.cos(pitch * 0.5);
  const cx = p.x - Math.cos(cam.yaw) * dist * cp, cy = p.y + Math.sin(cam.yaw) * dist * cp;
  const cz = p.z + hgt - Math.sin(pitch) * dist * 0.55;
  const k = cam.init ? 1 - Math.pow(1 - 0.14, steps) : 1;
  cam.init = true;
  cam.x += (cx - cam.x) * k; cam.y += (cy - cam.y) * k; cam.z += (cz - cam.z) * k;
  cam.z = clamp(cam.z, terrainH(cam.x, cam.y) + 14, SURF_Z - 8);
  const tx = p.x + Math.cos(yaw) * L * 0.7, ty = p.y - Math.sin(yaw) * L * 0.7, tz = p.z + L * 0.25 + Math.sin(pitch) * L * 0.6;
  camera.position.set(cam.x, cam.z, cam.y);
  camera.lookAt(look.set(tx, tz, ty));
  // vertical field of view of the original in landscape; in portrait it widens so the sides are not lost
  cam.fov += (62 + pl.boost * 11 - cam.fov) * (1 - Math.pow(1 - 0.08, steps));
  const aspect = camera.aspect, vd = viewDist();
  const fov = aspect >= 1 ? cam.fov : 2 * Math.atan(Math.tan(cam.fov * Math.PI / 360) / Math.max(aspect, 0.75)) * 180 / Math.PI;
  camera.fov = fov;
  camera.near = clamp(L * 0.12, 3, 40);
  camera.far = vd * 1.08 + 200;
  camera.updateProjectionMatrix();
  return vd;
}

// ---------- loading: the world around the spawn is built before the game shows ----------
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

function frame(a, dt) {
  if (!paused) qualityTick(dt);
  const ia = paused ? 1 : a;
  player.render(ia, time);
  const vd = updateCamera(ia, paused ? 0 : dt);
  const p = player.pos(ia);
  world.setView(vd);
  world.update(p.x, p.y, quality().buildMs);
  world.visibility(cam.x, cam.y);
  creatures.render(ia, cam, time);
  atmo.update(time, cam, vd, quality().gfx);
  renderer.render(scene, camera);

  fpsAcc += dt; fpsN++;
  if (fpsAcc >= 0.5) { fpsShow = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
  dbgT -= dt;
  if (dbgT <= 0) {
    dbgT = 0.25;
    const info = renderer.info.render, st = world.stats, h = terrainH(p.x, p.y);
    dbg.textContent = `FPS ${fpsShow}  ${(frameTime() * 1000).toFixed(1)} ms\n` +
      `Q ${quality().name} (${qualityMode()})  px ${renderer.getPixelRatio().toFixed(2)}  view ${Math.round(vd)}\n` +
      `draw ${info.calls}  tri ${info.triangles}\n` +
      `chunks ${st.loaded}  build ${st.pending}  ${st.buildMs.toFixed(1)} ms\n` +
      `depth ${Math.round(depthM(p.z))} m  bottom ${Math.round(depthM(h))} m  ${BIOMES[biomeAt(p.x, p.y, h)]}\n` +
      `seed ${worldSeed()}  v ${pl.spd.toFixed(2)}  st ${Math.round(pl.st)}${pl.exh ? "!" : ""}  L ${pl.L.toFixed(0)}` + (input.touch ? '  touch' : '');
  }
}

// handle for automated checks in the browser console (no effect on the game)
window.__gu = { player, world, atmo, camera, renderer, cam, creatures };

load().then(() => {
  startLoop(
    (dt) => {
      const inp = pollInput();
      if (inp.pauseHit) setPaused(!paused);
      if (paused) return;
      time += dt;
      player.step(inp, time);
      creatures.update(time);
    },
    frame,
  );
  $('hud').hidden = false;
  $('loading').classList.add('fade');
  setTimeout(() => $('loading').remove(), 600);
  setTimeout(() => { $('hint').style.transition = 'opacity 1.5s'; $('hint').style.opacity = '0'; }, 12000);
});
