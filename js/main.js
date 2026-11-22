// GROW UP — web version. Stage 0: boot, loop, input, languages, quality, test scene, placeholder squid.
import * as THREE from 'three';
import { startLoop } from './core/loop.js';
import { initInput, pollInput, input } from './core/input.js';
import { applyLang, toggleLang, getLang, t } from './core/i18n.js';
import { quality, qualityTick, setQualityMode, qualityMode, frameTime } from './core/quality.js';
import { createRenderer, WATER } from './render/renderer.js';
import { buildTestScene } from './world/testScene.js';
import { createProtoSquid } from './player/proto.js';

const $ = (id) => document.getElementById(id);
const setLoad = (k, key) => { $('load-fill').style.width = Math.round(k * 100) + '%'; $('load-text').textContent = t(key); };

applyLang();
setLoad(0.1, 'loading');

const { renderer, scene, camera } = createRenderer($('game'));
setLoad(0.4, 'load_scene');
const world = buildTestScene(scene);
const squid = createProtoSquid(scene);
setLoad(1, 'load_done');

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

// the hint fades after a while
setTimeout(() => { $('hint').style.transition = 'opacity 1.5s'; $('hint').style.opacity = '0'; }, 12000);

// ---------- camera ----------
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tmp = new THREE.Vector3(), sq = new THREE.Vector3();
let camYaw = squid.yaw, camInit = false;
const deep = new THREE.Color(0x020a12);

function updateCamera(a, dt) {
  squid.renderPos(a, sq);
  const yaw = squid.renderYaw(a);
  camYaw += (yaw - camYaw) * Math.min(1, dt * 4);
  const back = 13, up = 4.5;
  tmp.set(sq.x - Math.sin(camYaw) * back, sq.y + up, sq.z - Math.cos(camYaw) * back);
  if (!camInit) { camPos.copy(tmp); camInit = true; } else camPos.lerp(tmp, Math.min(1, dt * 6));
  camera.position.copy(camPos);
  camLook.set(sq.x + Math.sin(camYaw) * 6, sq.y + 1, sq.z + Math.cos(camYaw) * 6);
  camera.lookAt(camLook);
  // water darkens with depth, like in the original
  const k = THREE.MathUtils.clamp(-sq.y / 70, 0, 1);
  scene.fog.color.copy(WATER).lerp(deep, k * 0.75);
  scene.background.copy(scene.fog.color);
}

// ---------- loop ----------
let time = 0, fpsAcc = 0, fpsN = 0, fpsShow = 0, dbgT = 0;
const dbg = $('debug');

startLoop(
  (dt) => {
    const inp = pollInput();
    if (inp.pauseHit) setPaused(!paused);
    if (paused) return;
    time += dt;
    squid.step(dt, inp);
  },
  (a, dt) => {
    if (!paused) qualityTick(dt);
    squid.render(paused ? 1 : a);
    updateCamera(paused ? 1 : a, paused ? 0 : dt);
    world.update(time, camera.position);
    renderer.render(scene, camera);

    fpsAcc += dt; fpsN++;
    if (fpsAcc >= 0.5) { fpsShow = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
    dbgT -= dt;
    if (dbgT <= 0) {
      dbgT = 0.25;
      const info = renderer.info.render;
      dbg.textContent = `FPS ${fpsShow}  ${(frameTime() * 1000).toFixed(1)} ms\n` +
        `Q ${quality().name} (${qualityMode()})  px ${renderer.getPixelRatio().toFixed(2)}\n` +
        `draw ${info.calls}  tri ${info.triangles}\n` +
        `depth ${Math.round(-squid.pos.y)} m  v ${squid.speed.toFixed(1)}` + (input.touch ? '  touch' : '');
    }
  },
);

// reveal
$('hud').hidden = false;
$('loading').classList.add('fade');
setTimeout(() => $('loading').remove(), 600);
