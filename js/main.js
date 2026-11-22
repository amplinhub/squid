// GROW UP - web version. Stage 1: the streaming seabed world of the original with its atmosphere,
// placeholder squid, chase camera of the original.
import * as THREE from 'three';
import { startLoop } from './core/loop.js';
import { initInput, pollInput, input } from './core/input.js';
import { applyLang, toggleLang, getLang, t } from './core/i18n.js';
import { quality, qualityTick, setQualityMode, qualityMode, frameTime } from './core/quality.js';
import { createRenderer } from './render/renderer.js';
import { createAtmosphere } from './render/atmosphere.js';
import { createWorld } from './world/world.js';
import { setWorldSeed, worldSeed, findSpawn, terrainH, biomeAt, depthM, SURF_Z, clamp } from './world/terrain.js';
import { createProtoSquid } from './player/proto.js';

const $ = (id) => document.getElementById(id);
const setLoad = (k, key) => { $('load-fill').style.width = Math.round(k * 100) + '%'; if (key) $('load-text').textContent = t(key); };
const nextFrame = () => new Promise((r) => requestAnimationFrame(r));

applyLang();
setLoad(0.05, 'loading');

const { renderer, scene, camera } = createRenderer($('game'));
const atmo = createAtmosphere(scene, camera, renderer);
setWorldSeed(Math.floor(Math.random() * 100001));
const world = createWorld(scene, atmo);
const squid = createProtoSquid(scene, findSpawn());

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
const viewDist = () => clamp(810 + squid.L * 4, 850, 2700) * quality().viewMult;
const cam = { x: 0, y: 0, z: 0, yaw: squid.yaw, fov: 64, init: false };
const look = new THREE.Vector3();
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d <= -Math.PI) d += 2 * Math.PI; return d; };

function updateCamera(a, dt) {
  const p = squid.renderPos(a), yaw = squid.renderYaw(a), pitch = squid.renderPitch(a), L = squid.L;
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
  cam.fov += (62 + (squid.speed > 300 ? 11 : 0) - cam.fov) * (1 - Math.pow(1 - 0.08, steps));
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
  setLoad(0.1, 'load_scene');
  const s = squid.renderPos(1);
  world.setView(viewDist());
  world.update(s.x, s.y, 0);
  let total = 0;
  for (;;) {
    world.update(s.x, s.y, 25);
    const n = world.pendingNear(s.x, s.y);
    total = Math.max(total, n);
    setLoad(0.1 + 0.85 * (total ? 1 - n / total : 1));
    if (n === 0) break;
    await nextFrame();
  }
  await Promise.race([atmo.ready, new Promise((r) => setTimeout(r, 3000))]);
  setLoad(1, 'load_done');
}

// ---------- loop ----------
let time = 0, fpsAcc = 0, fpsN = 0, fpsShow = 0, dbgT = 0;
const dbg = $('debug');
const BIOMES = ['sand', 'reef', 'kelp', 'abyss'];

function frame(a, dt) {
  if (!paused) qualityTick(dt);
  const ia = paused ? 1 : a;
  squid.render(ia);
  const vd = updateCamera(ia, paused ? 0 : dt);
  const p = squid.renderPos(ia);
  world.setView(vd);
  world.update(p.x, p.y, quality().buildMs);
  world.visibility(cam.x, cam.y);
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
      `seed ${worldSeed()}  v ${Math.round(squid.speed)}` + (input.touch ? '  touch' : '');
  }
}

// handle for automated checks in the browser console (no effect on the game)
window.__gu = { squid, world, atmo, camera, renderer, cam };

load().then(() => {
  startLoop(
    (dt) => {
      const inp = pollInput();
      if (inp.pauseHit) setPaused(!paused);
      if (paused) return;
      time += dt;
      squid.step(dt, inp);
    },
    frame,
  );
  $('hud').hidden = false;
  $('loading').classList.add('fade');
  setTimeout(() => $('loading').remove(), 600);
  setTimeout(() => { $('hint').style.transition = 'opacity 1.5s'; $('hint').style.opacity = '0'; }, 12000);
});
