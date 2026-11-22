// Title flow - port of 21_surface.gml (scr_title_step, scr_ttl_*, scr_hud_title):
//   phase 0 - main menu above the water: GROW UP and the buttons on the left, the ocean and the evening sky;
//   phase 1 - "Dive": the camera plunges through the surface (white splash) and sinks down to the creature;
//   phase 2 - creature select: arrows, name, description card with the controls, locked creatures with a lock;
//   phase 3 - back to the main menu from the game: the camera rises fast and breaks through the surface.
// The camera is computed here in game units; main.js applies it.
import { t, getLang } from '../core/i18n.js';
import { SURF_Z, clamp, lerp, smoothstep } from '../world/terrain.js';
import { CHAR_TEXT } from './chars.js';

const D = Math.PI / 180;
const $ = (id) => document.getElementById(id);

// env: { player, isUnlocked(c), required(c), progress, onStart(c), onSettings(), onRebuild(), onSelect(c), isTouch() }
export function createTitle(env) {
  const P = env.player, pl = P.pl;
  const st = { active: false, ph: 0, t: 0, yaw: 0, sel: 0, menu: 0, splash: 0, sv: { x: 0, y: 0, z: 0 }, cam: { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0, fov: 58 }, swFlash: 0 };

  // ---------------- DOM
  const menuEl = $('title-menu'), selEl = $('select'), splashEl = $('splash');
  const btns = [...document.querySelectorAll('.tbtn-menu')];
  btns.forEach((b, i) => {
    b.addEventListener('pointerenter', () => { st.menu = i; syncMenu(); });
    b.addEventListener('click', () => action(i));
  });
  $('sel-left').addEventListener('click', () => switchSel(-1));
  $('sel-right').addEventListener('click', () => switchSel(1));
  $('sel-go').addEventListener('click', () => start());
  $('sel-back').addEventListener('click', () => backToSurface());

  function syncMenu() { btns.forEach((b, i) => b.classList.toggle('on', i === st.menu)); }
  function showUI() {
    menuEl.hidden = !(st.active && st.ph === 0);
    selEl.hidden = !(st.active && st.ph === 2);
  }
  function keycaps(spec) {
    return spec.split('|').map((k) => {
      const arrow = { '^': '▲', v: '▼', '<': '◀', '>': '▶' }[k];
      return `<span class="key${k.length > 1 && !arrow ? ' wide' : ''}">${arrow || k}</span>`;
    }).join('');
  }
  function fillSelect() {
    const n = st.sel, txt = CHAR_TEXT[getLang()][n], open = env.isUnlocked(n);
    $('sel-name').textContent = t('ch' + n).toUpperCase();
    $('sel-sub').textContent = `${t('choose')}  ·  ${n + 1} / 3`;
    $('sel-desc').textContent = txt.desc;
    $('sel-abil').textContent = txt.abil.toUpperCase();
    const rows = env.isTouch() ? txt.touch.map(([k, d]) => `<div class="crow"><span class="key wide">${k}</span><span>${d}</span></div>`)
      : txt.keys.map(([k, d]) => `<div class="crow">${keycaps(k)}<span>${d}</span></div>`);
    $('sel-ctrl').innerHTML = rows.join('');
    $('sel-lock').hidden = open;
    if (!open) {
      const p = env.progress, need = env.required(n);
      $('sel-locktxt').textContent = n === 2 ? t('locked_oct', { k: need - p.missionsNaut, d: p.missionsNaut, n: need }) : t('locked_any', { k: need - p.missions, d: p.missions, n: need });
    }
    $('sel-go').textContent = open ? t('go') : t('locked_btn');
    $('sel-go').classList.toggle('off', !open);
  }

  // ---------------- cameras
  function surfaceCam(mtime) {
    const fx = Math.cos(st.yaw * D), fy = -Math.sin(st.yaw * D), b = Math.sin(mtime * 0.8) * 2.5;
    const cx = pl.x - fx * 420, cy = pl.y - fy * 420, cz = SURF_Z + 40 + b;
    Object.assign(st.cam, { x: cx, y: cy, z: cz, tx: cx + fx * 1000, ty: cy + fy * 1000, tz: cz - 22 + Math.sin(mtime * 0.6) * 4, fov: 58 });
    st.sv = { x: cx, y: cy, z: cz };
  }
  // side view of the creature, slightly from above; the target a bit low so it sits above the card
  function selectCam() {
    const d = 34 + pl.L * 1.75, a = (st.yaw + 90) * D;
    return { x: pl.x + Math.cos(a) * d, y: pl.y - Math.sin(a) * d, z: pl.z + d * 0.22, tx: pl.x, ty: pl.y, tz: pl.z - d * 0.2 };
  }

  // ---------------- actions
  function begin(toSelect) {
    st.active = true; st.t = 0; st.yaw = pl.yaw;
    st.sel = env.isUnlocked(pl.char) ? pl.char : 0;
    st.splash = 0;
    if (toSelect) {
      st.ph = 2;
      Object.assign(st.cam, selectCam(), { fov: 62 });
      fillSelect();
    } else { st.ph = 0; st.menu = 0; syncMenu(); surfaceCam(0); }
    showUI();
  }
  function action(i) {
    if (!st.active || st.ph !== 0) return;
    if (i === 0) { st.ph = 1; st.t = 0; showUI(); }
    else if (i === 1) env.onSettings();
  }
  function switchSel(dir) {
    st.sel = (st.sel + dir + 3) % 3;
    env.onSelect(st.sel);
    st.swFlash = 1;
    fillSelect();
  }
  function start() {
    if (!env.isUnlocked(st.sel)) {
      env.onLocked?.(st.sel);
      return;
    }
    st.active = false;
    showUI();
    env.onStart(st.sel);
  }
  function backToSurface() { st.ph = 0; st.t = 0; surfaceCam(0); syncMenu(); showUI(); }
  // from the game back to the main menu: rise to the surface, then a new life is made behind the menu
  function rise() {
    st.active = true; st.ph = 3; st.t = 0;
    st.sv = { x: env.camNow().x, y: env.camNow().y, z: env.camNow().z };
    st.riseDir = { x: Math.cos(pl.yaw * D), y: -Math.sin(pl.yaw * D) };
    showUI();
  }

  // ---------------- one 1/60 s step; inp: actions (keyboard / touch)
  function step(time, mtime, inp) {
    st.t++;
    st.splash = Math.max(0, st.splash - 0.03);
    st.swFlash = Math.max(0, st.swFlash - 0.06);
    if (st.ph !== 3) P.titleStep(time, mtime, st.yaw);
    switch (st.ph) {
      case 0:
        surfaceCam(mtime);
        if (inp.upHit) { st.menu = (st.menu + 1) % 2; syncMenu(); }
        if (inp.downHit) { st.menu = (st.menu + 1) % 2; syncMenu(); }
        if (inp.enterHit) action(st.menu);
        break;
      case 1: {
        // the plunge: forward and down through the surface, then sinking to the creature
        const u = st.t / 160, fx = Math.cos(st.yaw * D), fy = -Math.sin(st.yaw * D), cs = selectCam();
        let c;
        if (u < 0.3) {
          const k = Math.pow(u / 0.3, 1.6), cx = st.sv.x + fx * 140 * k, cy = st.sv.y + fy * 140 * k, cz = lerp(st.sv.z, SURF_Z - 90, k), tz = lerp(-0.03, -0.75, k);
          c = { x: cx, y: cy, z: cz, tx: cx + fx * 300, ty: cy + fy * 300, tz: cz + tz * 300 };
        } else {
          const k = smoothstep(0, 1, (u - 0.3) / 0.7);
          const cx = lerp(st.sv.x + fx * 140, cs.x, k), cy = lerp(st.sv.y + fy * 140, cs.y, k), cz = lerp(SURF_Z - 90, cs.z, k);
          c = { x: cx, y: cy, z: cz, tx: lerp(cx + fx * 300, cs.tx, k), ty: lerp(cy + fy * 300, cs.ty, k), tz: lerp(cz - 225, cs.tz, k) };
        }
        const pz = st.cam.z;
        Object.assign(st.cam, c, { fov: lerp(58, 62, clamp(u * 2, 0, 1)) });
        if (pz > SURF_Z && c.z <= SURF_Z) { st.splash = 1; env.onSplash?.(); }
        if (u >= 1) { st.ph = 2; st.t = 0; fillSelect(); showUI(); }
        break;
      }
      case 2: {
        const cs = selectCam();
        const c = st.cam;
        c.x = lerp(c.x, cs.x, 0.1); c.y = lerp(c.y, cs.y, 0.1); c.z = lerp(c.z, cs.z, 0.1);
        c.tx = cs.tx; c.ty = cs.ty; c.tz = cs.tz; c.fov = 62;
        if (inp.leftHit) switchSel(-1);
        if (inp.rightHit) switchSel(1);
        if (inp.enterHit) start();
        if (inp.pauseHit) backToSurface();
        break;
      }
      case 3: {
        // the camera rises fast, accelerating, tilting up to the light, breaks through the surface
        const u = Math.min(1, st.t / 85), k = u * u * (3 - 2 * u), pz = st.cam.z;
        const cz = lerp(st.sv.z, SURF_Z + 40, Math.pow(u, 1.6)), d = st.riseDir;
        Object.assign(st.cam, { x: st.sv.x, y: st.sv.y, z: cz, tx: st.sv.x + d.x * 300, ty: st.sv.y + d.y * 300, tz: cz + lerp(120, -22, k), fov: lerp(62, 58, k) });
        if (pz <= SURF_Z && cz > SURF_Z) { st.splash = 1; env.onSplash?.(); env.onRebuild(); }
        if (st.t >= 95) begin(false);
        break;
      }
    }
  }

  function render() {
    splashEl.style.opacity = String(st.splash * 0.85);
    // the title bobs on the swell
    const logo = $('title-logo');
    if (logo && !menuEl.hidden) logo.style.transform = `translateY(${Math.sin(performance.now() / 1000 * 1.3) * 3}px) rotate(${Math.sin(performance.now() / 1000 * 0.9) * 1.2}deg)`;
  }

  return { st, begin, step, render, rise, fillSelect, cam: st.cam, active: () => st.active, phase: () => st.ph };
}
