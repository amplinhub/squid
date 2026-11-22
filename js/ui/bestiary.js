// Bestiary - port of 18_bestiary.gml. Cards of every species: unknown ones show a "?" back; species eaten
// since the last visit turn over one after another when it opens. Discovered cards hold a live, turning
// low-poly model; a click opens the detailed card with facts and a big model that can be turned (drag)
// and zoomed (wheel / pinch), arrows go to the neighbours.
// The page is DOM under the transparent WebGL canvas; the models are drawn into each card's window with
// the game's renderer (viewport + scissor per card).
import * as THREE from 'three';
import { t, getLang, spName } from '../core/i18n.js';
import { SPECIES, NTYPES } from '../creatures/species.js';
import { creatureFrame, creatureMaterial, setTransform, FLIP } from '../creatures/creatures.js';
import { createSquidRig } from '../creatures/squidModel.js';
import { BEST } from './bestiaryText.js';

const $ = (id) => document.getElementById(id);
const D = Math.PI / 180;
const SKEY = 'growup.bestiarySeen';

export function createBestiary(renderer, known, onClose) {
  const root = $('bestiary'), grid = $('bst-grid'), detail = $('bst-detail');
  let seen = new Set();
  try { seen = new Set(JSON.parse(localStorage.getItem(SKEY) || '[]')); } catch (e) { /* fresh */ }
  const saveSeen = () => { try { localStorage.setItem(SKEY, JSON.stringify([...seen])); } catch (e) { /* not kept */ } };

  // 3D: one mesh per species (geometry swapped as it animates), two procedural rigs; built on the first
  // opening (the creature models are ready by then)
  const scene = new THREE.Scene();
  const meshes = [];
  function build() {
    if (meshes.length) return;
    for (let k = 0; k < NTYPES; k++) {
      const kind = SPECIES[k].kind;
      if (kind === 4 || kind === 8) { meshes[k] = createSquidRig(scene, kind === 4 ? 2 : 3, kind === 8); meshes[k].s.L = 1; meshes[k].init(); meshes[k].setVisible(false); continue; }
      const g = creatureFrame(k, 0, false, false);
      const m = new THREE.Mesh(g, creatureMaterial(g));
      m.matrixAutoUpdate = false; m.visible = false; m.frustumCulled = false;
      scene.add(m); meshes[k] = m;
    }
  }
  const cam = new THREE.PerspectiveCamera(30, 1, 10, 4000);
  cam.position.set(0, 0, 1000); cam.lookAt(0, 0, 0);
  const TAN = Math.tan(15 * D);

  // DOM cards
  const cards = [];
  for (let k = 0; k < NTYPES; k++) {
    const c = document.createElement('button');
    c.className = 'card';
    c.innerHTML = '<div class="card-in"><div class="win"></div><div class="nm"></div><div class="back"><span>?</span></div></div>';
    c.addEventListener('click', () => open(k));
    c.addEventListener('pointerenter', () => { cur = k; });
    grid.appendChild(c);
    cards.push(c);
  }
  let flip = new Array(NTYPES).fill(1), sel = -1, cur = 0, active = false, newN = 0;
  // detail view: drag to turn, wheel / pinch to zoom
  const view = { yaw: 35, pitch: 12, vy: 0, vp: 0, zoom: 1, drag: false, mx: 0, my: 0, idle: 0 };
  const win = $('bst-win');
  win.addEventListener('pointerdown', (e) => { view.drag = true; view.mx = e.clientX; view.my = e.clientY; win.setPointerCapture(e.pointerId); });
  win.addEventListener('pointermove', (e) => {
    if (!view.drag) return;
    view.vy = (e.clientX - view.mx) * 0.55; view.vp = (e.clientY - view.my) * 0.4; view.mx = e.clientX; view.my = e.clientY; view.idle = 0;
  });
  const up = () => { view.drag = false; };
  win.addEventListener('pointerup', up); win.addEventListener('pointercancel', up);
  win.addEventListener('wheel', (e) => { e.preventDefault(); view.zoom = Math.max(0.6, Math.min(1.35, view.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1))); }, { passive: false });
  $('bst-prev').addEventListener('click', () => cycle(-1));
  $('bst-next').addEventListener('click', () => cycle(1));
  $('bst-back').addEventListener('click', () => back());
  $('bst-close').addEventListener('click', () => back());

  function fillTexts() {
    const L = getLang() === 'en' ? 2 : 1;
    let n = 0;
    cards.forEach((c, k) => {
      c.querySelector('.nm').textContent = spName(SPECIES[k]);
      if (known.has(k)) n++;
    });
    $('bst-title').textContent = t('bestiary').toUpperCase();
    $('bst-sub').textContent = t('bst_open', { n, m: NTYPES }) + (newN > 0 ? `  ·  ${t('bst_new', { n: newN })}` : '');
    if (sel >= 0) {
      const B = BEST[sel], T = B[L];
      $('bd-name').textContent = spName(SPECIES[sel]);
      $('bd-lat').textContent = B[0];
      const line = (lbl, v) => `<div class="bd-line"><b>${t(lbl)}</b> ${v}</div>`;
      $('bd-facts').innerHTML = line('bd_size', T[0]) + line('bd_where', T[1]) + line('bd_depth', T[2]) + line('bd_food', T[3]) +
        `<p class="bd-fact">${T[4]}</p>` + (T[5] ? `<p class="bd-game">${t('bd_game')} ${T[5]}</p>` : '');
    }
  }

  function show() {
    build();
    active = true; root.hidden = false; sel = -1; detail.hidden = true;
    // species found since the last visit turn over one after another
    newN = 0;
    for (let k = 0; k < NTYPES; k++) {
      flip[k] = 1;
      if (known.has(k) && !seen.has(k)) { flip[k] = -(0.6 + newN * 0.45); newN++; }
    }
    cur = 0;
    for (let k = NTYPES - 1; k >= 0; k--) if (known.has(k)) cur = k;
    fillTexts();
  }
  function hide() { active = false; root.hidden = true; for (const m of meshes) (m.setVisible ? m.setVisible(false) : (m.visible = false)); }
  function open(k) {
    if (!(known.has(k) && flip[k] >= 1)) return;
    sel = k; cur = k; detail.hidden = false;
    Object.assign(view, { yaw: 35, pitch: 12, vy: 0, vp: 0, zoom: 1, idle: 0 });
    fillTexts();
  }
  function cycle(dir) {
    let k = sel;
    for (let i = 0; i < NTYPES; i++) { k = (k + dir + NTYPES) % NTYPES; if (known.has(k) && flip[k] >= 1) break; }
    if (k !== sel) { sel = k; cur = k; view.vy = 0; view.vp = 0; view.zoom = 1; fillTexts(); }
  }
  function back() { if (sel >= 0) { sel = -1; detail.hidden = true; } else { hide(); onClose(); } }

  // keyboard (inp: actions of this step)
  function step(inp) {
    if (!active) return;
    for (let k = 0; k < NTYPES; k++) if (flip[k] < 1) {
      flip[k] += 1 / 30;
      if (flip[k] >= 1) { flip[k] = 1; seen.add(k); saveSeen(); }
    }
    if (sel < 0) {
      const cols = Math.max(1, Math.round(grid.clientWidth / (cards[0].offsetWidth + 8)));
      if (inp.leftHit) cur = Math.max(0, cur - 1);
      if (inp.rightHit) cur = Math.min(NTYPES - 1, cur + 1);
      if (inp.upHit) cur = Math.max(0, cur - cols);
      if (inp.downHit) cur = Math.min(NTYPES - 1, cur + cols);
      if (inp.enterHit) open(cur);
      if (inp.pauseHit) back();
    } else {
      if (inp.leftHit) cycle(-1);
      if (inp.rightHit) cycle(1);
      if (inp.up) { view.vp = -1.6; view.idle = 0; }
      if (inp.down) { view.vp = 1.6; view.idle = 0; }
      if (inp.pauseHit || inp.enterHit) back();
      if (!view.drag) {
        // inertia, then a slow showcase spin and the tilt easing back
        view.vy *= 0.93; view.vp *= 0.88;
        if (++view.idle > 120) { view.vy += (0.45 - view.vy) * 0.02; view.pitch += (12 - view.pitch) * 0.01; }
      }
      view.yaw += view.vy;
      view.pitch = Math.max(-75, Math.min(75, view.pitch + view.vp));
      if (view.drag) { view.vy = 0; view.vp = 0; }
    }
  }

  // one species model filling a box of px pixels at the camera distance; (yaw, pitch) in degrees
  function pose(k, px, boxH, yaw, nod, time) {
    const sp = SPECIES[k], tm = time + k * 1.7;
    const worldH = 2 * 1000 * TAN, perPx = worldH / boxH;
    let s = px * perPx;
    if (sp.kind === 3 || sp.kind === 7) s *= 0.8; else if (sp.kind === 6) s *= 0.85;
    if (k === 18) s *= 0.75; if (sp.kind === 10) s *= 0.62; if (k === 8) s *= 1.1;
    let z = Math.sin(tm * 1.6) * s * 0.035;
    const m = meshes[k];
    if (m.setVisible) {
      Object.assign(m.s, { x: Math.cos(yaw * D) * s * 1.7 * 0.12, y: 0, z, yaw: yaw * D, pitch: nod * D, roll: 0, L: s * 1.7, spread: 0.25 + 0.2 * Math.max(0, Math.sin(tm * 0.7)) });
      m.anim(0, 0, time);
      m.draw(m.s.x, 0, z, false);
      m.setVisible(true);
      return;
    }
    const f = Math.floor(tm * 11) % FLIP;
    if (sp.kind === 2) { s *= 0.52; z += s * 0.6 + Math.sin(f * 2 * Math.PI / FLIP) * s * 0.05; }
    const mouth = sp.mouth && (tm % 4.5) < 0.9;
    let puffed = false;
    if (sp.puffer) { const ph = tm % 7; if (ph > 3.5 && ph < 6) { puffed = true; s *= 0.8 + 0.2 * Math.min(1, (ph - 3.5) / 0.3); } }
    m.geometry = creatureFrame(k, f, mouth, puffed);
    // the camera looks along -z (three): game y is the depth axis, so turn the model to face sideways
    setTransform(m.matrix, 0, 0, z, (yaw - 90) * D, nod * D, (-12 + Math.sin(tm * 0.9) * 4) * D, s, s, s);
    m.visible = true;
  }

  // draw the models into the visible card windows (or the big detail window)
  function render(time) {
    if (!active) return;
    const W = innerWidth, H = innerHeight, dpr = renderer.getPixelRatio();
    renderer.setScissorTest(true);
    renderer.setClearColor(0x000000, 0);
    renderer.setViewport(0, 0, W, H); renderer.setScissor(0, 0, W, H); renderer.clear();
    const hideAll = () => { for (const m of meshes) (m.setVisible ? m.setVisible(false) : (m.visible = false)); };
    const draw = (k, r, px, yaw, nod) => {
      if (r.width < 4 || r.height < 4) return;
      hideAll();
      pose(k, px, r.height, yaw, nod, time);
      const y = H - r.bottom;
      renderer.setViewport(r.left, y, r.width, r.height); renderer.setScissor(r.left, y, r.width, r.height);
      cam.aspect = r.width / r.height; cam.updateProjectionMatrix();
      renderer.render(scene, cam);
    };
    if (sel >= 0) {
      const r = win.getBoundingClientRect();
      // the big model, seen from the orbit the player turned it to
      cam.position.set(0, Math.sin(view.pitch * D) * 1000, Math.cos(view.pitch * D) * 1000); cam.lookAt(0, 0, 0);
      draw(sel, r, Math.min(r.width * 0.62, r.height * 0.9) * view.zoom, view.yaw, Math.sin(time * 1.2) * 5);
      cam.position.set(0, 0, 1000); cam.lookAt(0, 0, 0);
    } else {
      const gr = grid.getBoundingClientRect();
      cards.forEach((c, k) => {
        const fl = flip[k], front = known.has(k) && fl > 0.5;
        const sx = fl < 0 ? 1 : Math.abs(Math.cos(fl * Math.PI));
        c.style.setProperty('--sx', Math.max(0.02, sx).toFixed(3));
        c.classList.toggle('front', front);
        c.classList.toggle('cur', k === cur);
        if (!front || sx < 0.05) return;
        const w = c.querySelector('.win').getBoundingClientRect();
        if (w.bottom < gr.top || w.top > gr.bottom) return;
        // clip to the scrolling grid
        const top = Math.max(w.top, gr.top), bottom = Math.min(w.bottom, gr.bottom);
        // (the rectangle is already squeezed by the card's turn; the projection keeps the unsqueezed shape,
        // so the model is squeezed with the card)
        const fw = w.width / Math.max(0.02, sx);
        hideAll();
        pose(k, Math.min(fw, w.height) * 0.82, w.height, time * 40 + k * 37, Math.sin((time + k * 1.7) * 1.2) * 5);
        renderer.setViewport(w.left, H - w.bottom, w.width, w.height);
        renderer.setScissor(w.left, H - bottom, w.width, bottom - top);
        cam.aspect = fw / w.height; cam.updateProjectionMatrix();
        renderer.render(scene, cam);
      });
    }
    hideAll();
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, W, H);
    void dpr;
  }

  return { show, hide, step, render, active: () => active, refresh: fillTexts };
}
