// Game HUD - port of 12_hud.gml and the HUD part of 23_missions.gml:
//  * framed panel: size class and length, health with a moving sheen, a row of 14 stamina bubbles,
//    hunger, and the ink sac (octopus) or the shell (nautilus);
//  * depth gauge (brass dial, trembling needle);
//  * sonar in a brass porthole: heading-up, sweep with afterglow, coloured blips (edible green, dangerous
//    red, others yellow) that shrink with the height difference;
//  * three missions in sea-glass slips that slide in, flash gold when done and dissolve;
//  * golden reticle over the locked prey, red brackets / edge arrows over hunting predators, a warning banner;
//  * notes when hidden in camouflage or ink.
// DOM for the panels, a small canvas for the sonar, the overlay canvas for the in-world markers.
import * as THREE from 'three';
import { t, spName } from '../core/i18n.js';
import { stageName } from '../player/player.js';
import { depthM, SURF_Z, clamp } from '../world/terrain.js';
import { progress, isUnlocked, required } from '../core/progress.js';

const $ = (id) => document.getElementById(id);
const D = Math.PI / 180;

export function createHud(env) {
  // env: { player, creatures, missions, camera, isTouch }
  const pl = env.player.pl;
  const bubbles = [];
  const bubBox = $('h-st');
  for (let i = 0; i < 14; i++) { const b = document.createElement('i'); b.className = 'stb'; bubBox.appendChild(b); bubbles.push(b); }
  const sonar = $('sonar-c'), sg = sonar.getContext('2d');
  const msList = $('ms-list');
  const msEls = [0, 1, 2].map(() => {
    const el = document.createElement('div'); el.className = 'ms';
    el.innerHTML = '<i class="ms-dot"></i><div class="ms-body"><div class="ms-txt"></div><div class="ms-bar"><i></i></div></div>';
    msList.appendChild(el); return el;
  });
  const v3 = new THREE.Vector3();

  // game point -> screen pixels (or null when behind the camera)
  function project(x, y, z, W, H) {
    v3.set(x, z, y).project(env.camera);
    if (v3.z > 1 || v3.z < -1) return null;
    return { x: (v3.x + 1) / 2 * W, y: (1 - v3.y) / 2 * H, behind: false };
  }

  function panel(time) {
    $('h-stage').textContent = stageName(pl.L).toUpperCase();
    $('h-len').textContent = `${(pl.L * 0.02).toFixed(2)} ${t('size_m')}`;
    const hp = clamp(pl.hp / pl.hpmax, 0, 1);
    $('h-hp').style.width = hp * 100 + '%';
    $('h-hp').style.setProperty('--sheen', ((time * 0.4) % 1) * 100 + '%');
    $('h-hpn').textContent = Math.ceil(Math.max(0, pl.hp));
    const fill = pl.st / pl.stmax * 14;
    bubbles.forEach((b, i) => {
      const a = clamp(fill - i, 0, 1);
      b.style.setProperty('--a', a.toFixed(2));
      b.classList.toggle('exh', pl.exh);
    });
    const food = clamp(pl.food / 100, 0, 1), lo = pl.food < 25;
    $('h-food').style.width = food * 100 + '%';
    $('h-foodbar').classList.toggle('low', lo);
    // ability row: ink sac of the octopus, shell of the nautilus
    const row = $('h-abil');
    row.hidden = pl.char === 0;
    if (pl.char === 1) {
      row.className = 'h-row shell';
      $('h-abiltxt').textContent = pl.shell > 0.5 ? t('shell_closed') : t('shell_open');
      $('h-ink').style.width = '0%';
    } else if (pl.char === 2) {
      const o = env.player.oct.o;
      row.className = 'h-row ink' + (o.ink >= 40 ? ' ready' : '');
      $('h-abiltxt').textContent = t('ink_lbl');
      $('h-ink').style.width = clamp(o.ink / 100, 0, 1) * 100 + '%';
    }
  }

  function depth(time) {
    const dm = Math.max(0, depthM(pl.z));
    $('needle').style.transform = `rotate(${135 + clamp(dm / 500, 0, 1) * 270 + Math.sin(time * 3) * 0.6}deg)`;
    $('depth-lbl').textContent = `${t('depth')} ${Math.round(dm)} ${t('size_m')}`;
  }

  // sonar: heading-up, the sweep turns clockwise with a fading wedge, blips glow when it passes
  function drawSonar(time, view) {
    const S = sonar.clientWidth * Math.min(2, devicePixelRatio || 1);
    if (sonar.width !== S) { sonar.width = sonar.height = S; }
    const c = sg, r = S * 0.45, cx = S / 2, cy = S / 2, R = view * 1.2;
    c.clearRect(0, 0, S, S);
    const g = c.createRadialGradient(cx, cy, 0, cx, cy, r + 4);
    g.addColorStop(0, 'rgb(14,70,60)'); g.addColorStop(1, 'rgb(2,20,20)');
    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, r + 4, 0, 7); c.fill();
    c.strokeStyle = 'rgba(120,255,200,0.25)'; c.lineWidth = 1;
    c.beginPath(); c.arc(cx, cy, r * 0.33, 0, 7); c.stroke(); c.beginPath(); c.arc(cx, cy, r * 0.66, 0, 7); c.stroke();
    c.beginPath(); c.moveTo(cx - r, cy); c.lineTo(cx + r, cy); c.moveTo(cx, cy - r); c.lineTo(cx, cy + r); c.stroke();
    const sw = time * 140;
    c.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 14; k++) {
      const a = (sw - k * 3) * D;
      c.fillStyle = `rgba(60,255,170,${0.22 * (1 - k / 14)})`;
      c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, r, a - 90 * D, a - 90 * D + 3.2 * D); c.closePath(); c.fill();
    }
    const fx = Math.cos(pl.yaw * D), fy = -Math.sin(pl.yaw * D), rx = -fy, ry = fx;
    for (const f of env.creatures.list) {
      if (f.dead) continue;
      const dx = f.x - pl.x, dy = f.y - pl.y, d = Math.hypot(dx, dy);
      if (d >= R) continue;
      const fw = dx * fx + dy * fy, rt = dx * rx + dy * ry;
      const bx = cx + rt / R * r, by = cy - fw / R * r;
      const ang = (Math.atan2(bx - cx, -(by - cy)) / D + 360) % 360;
      let ago = ((sw % 360) - ang + 360) % 360;
      let inten = 1 - ago / 360 * 0.75, col;
      if (env.creatures.dangerTo(f, pl.L)) { col = [255, 70, 60]; if (f.state === 2) inten = Math.max(inten, 0.6 + 0.4 * Math.sin(time * 12)); }
      else if (env.creatures.edibleBy(f, pl.L)) col = [120, 255, 140];
      else col = [255, 220, 110];
      let s = clamp(1.5 + f.len / pl.L * 1.6, 1.5, 7) * S / 200;
      const k = clamp(1 - (Math.abs(f.z - pl.z) - (f.len + pl.L) * 0.5) / 520, 0, 1);
      s = Math.max(1.2 * S / 200, s * (0.42 + 0.93 * k) + 1.5 * k * S / 200);
      const rgb = `${col[0]},${col[1]},${col[2]}`;
      if (k > 0.35) { c.fillStyle = `rgba(${rgb},${inten * 0.35 * k})`; c.beginPath(); c.arc(bx, by, s + 4 * k * S / 200, 0, 7); c.fill(); }
      if (k > 0.5) { c.globalCompositeOperation = 'source-over'; c.fillStyle = `rgba(2,16,14,${inten})`; c.beginPath(); c.arc(bx, by, s + 1.5 * S / 200, 0, 7); c.fill(); c.globalCompositeOperation = 'lighter'; }
      c.fillStyle = `rgba(${rgb},${inten * (0.6 + 0.4 * k)})`; c.beginPath(); c.arc(bx, by, s, 0, 7); c.fill();
    }
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = '#fff';
    const u = S / 200;
    c.beginPath(); c.moveTo(cx, cy - 7 * u); c.lineTo(cx - 5 * u, cy + 5 * u); c.lineTo(cx + 5 * u, cy + 5 * u); c.fill();
    $('sonar-lbl').textContent = `${t('sonar')} · ${Math.round(R * 0.02)} ${t('size_m')}`;
  }

  function missions() {
    const M = env.missions, L = M.labels();
    let nx = -1;
    for (let k = 2; k >= 1; k--) if (!isUnlocked(k)) nx = k;
    let head = `${L.head} · ${L.doneN} ${progress.missions}`;
    if (nx === 1) head += ` · ${L.to} «${t('ch1')}»: ${required(1) - progress.missions}`;
    if (nx === 2 && pl.char === 1) head += ` · ${L.to} «${t('ch2')}»: ${required(2) - progress.missionsNaut}`;
    $('ms-head').textContent = head;
    $('ms-note').textContent = nx === 2 && pl.char !== 1 ? L.octNote(required(2) - progress.missionsNaut) : '';
    M.slots.forEach((m, i) => {
      const el = msEls[i];
      if (m.k === undefined || m.st === 2) { el.style.opacity = '0'; return; }
      let a = 1, e = 1, sc = 0, dy = 0;
      if (m.st === 0) { e = 1 - Math.pow(1 - clamp(m.t / 24, 0, 1), 3); a = e; }
      else { if (m.t > 22) a = clamp(1 - (m.t - 22) / 40, 0, 1); sc = clamp(1 - Math.abs(m.t - 8) / 14, 0, 1); dy = -Math.max(0, m.t - 22) * 0.35; }
      el.style.opacity = a.toFixed(2);
      el.style.transform = `translate(${(1 - e) * 110}%, ${dy}px)`;
      el.classList.toggle('done', m.st === 1);
      el.style.setProperty('--flash', (0.35 + 0.5 * sc).toFixed(2));
      el.querySelector('.ms-txt').textContent = M.text(m);
      const bar = el.querySelector('.ms-bar');
      bar.hidden = !(m.goal > 1 && m.st === 0);
      bar.firstChild.style.width = M.frac(m) * 100 + '%';
    });
  }

  // in-world markers on the overlay canvas: the reticle over locked prey, brackets over hunters
  function markers(g, W, H, time) {
    const lk = pl.lock && !pl.lock.dead ? pl.lock : null;
    const f = H / 2 / Math.tan(env.camera.fov * D / 2);
    if (lk) {
      const p = project(lk.x, lk.y, lk.z, W, H);
      if (p) {
        const dist = Math.max(1, env.camera.position.distanceTo(v3.set(lk.x, lk.z, lk.y)));
        const r = clamp(lk.len * 0.75 / dist * f, 12, 90) + 6;
        const col = pl.aimOn ? 'rgb(255,214,90)' : 'rgb(255,240,200)', al = pl.aimOn ? 0.95 : 0.5;
        g.globalAlpha = al; g.strokeStyle = col; g.lineCap = 'round';
        const a0 = time * 120;
        for (let k = 0; k < 4; k++) {
          const a = (a0 + k * 90) * D;
          g.lineWidth = 2.5; g.beginPath(); g.arc(p.x, p.y, r, a - 25 * D, a + 25 * D); g.stroke();
          g.lineWidth = 2; g.beginPath(); g.moveTo(p.x + Math.cos(a) * (r + 7), p.y + Math.sin(a) * (r + 7)); g.lineTo(p.x + Math.cos(a) * (r - 3), p.y + Math.sin(a) * (r - 3)); g.stroke();
        }
        g.font = `600 ${Math.round(clamp(H / 50, 11, 16))}px system-ui, sans-serif`; g.textAlign = 'center';
        const txt = `${spName(lk.sp)} · ${Math.round(Math.hypot(lk.x - pl.x, lk.y - pl.y) * 0.02)} ${t('size_m')}`;
        g.fillStyle = 'rgba(2,10,16,0.7)'; g.fillText(txt, p.x + 1, p.y + r + 22);
        g.fillStyle = col; g.fillText(txt, p.x, p.y + r + 21);
        g.globalAlpha = 1;
      }
    }
    // red brackets over hunting predators, arrows at the edge for those off screen
    const pul = 0.6 + 0.4 * Math.sin(time * 9);
    let n = 0, best = null, bd = 1e9;
    for (const c of env.creatures.list) {
      if (c.dead || c.state !== 2) continue;
      n++;
      const d = Math.hypot(c.x - pl.x, c.y - pl.y);
      if (d < bd) { bd = d; best = c; }
      const p = project(c.x, c.y, c.z, W, H);
      g.globalAlpha = pul; g.strokeStyle = g.fillStyle = 'rgb(255,60,50)'; g.lineWidth = 3;
      if (p && p.x > 30 && p.x < W - 30 && p.y > 30 && p.y < H - 30) {
        const dist = Math.max(1, env.camera.position.distanceTo(v3.set(c.x, c.z, c.y)));
        const s = clamp(c.len * 0.5 / dist * f, 14, 160);
        for (let k = 0; k < 4; k++) {
          const sx = k % 2 ? -1 : 1, sy = k > 1 ? -1 : 1, ex = p.x + s * sx, ey = p.y + s * sy;
          g.beginPath(); g.moveTo(ex - s * 0.35 * sx, ey); g.lineTo(ex, ey); g.lineTo(ex, ey - s * 0.35 * sy); g.stroke();
        }
      } else {
        // direction on screen to the predator (behind the camera: mirrored)
        v3.set(c.x, c.z, c.y).project(env.camera);
        let sx = v3.x, sy = -v3.y;
        if (v3.z > 1) { sx = -sx; sy = -sy; }
        const a = Math.atan2(sy, sx), ex = W / 2 + Math.cos(a) * (W / 2 - 46), ey = H / 2 + Math.sin(a) * (H / 2 - 46);
        g.beginPath(); g.moveTo(ex + Math.cos(a) * 22, ey + Math.sin(a) * 22);
        g.lineTo(ex + Math.cos(a + 2.5) * 14, ey + Math.sin(a + 2.5) * 14); g.lineTo(ex + Math.cos(a - 2.5) * 14, ey + Math.sin(a - 2.5) * 14); g.fill();
      }
      g.globalAlpha = 1;
    }
    const dz = $('danger');
    dz.hidden = !(n > 0 && pl.alive);
    if (n > 0 && best) {
      $('danger-1').style.color = `rgb(255,${Math.round(90 + 60 * pul)},70)`;
      $('danger-2').textContent = t(best.sp.fem ? 'chasing_f' : 'chasing_m', { n: spName(best.sp), d: Math.round(bd * 0.02) });
      $('danger-3').textContent = env.isTouch() ? t('chase_tip_touch') : t('chase_tip');
    }
  }

  return {
    // per frame while playing
    update(g, W, H, time, view) {
      panel(time); depth(time); drawSonar(time, view); missions(); markers(g, W, H, time);
      const camo = pl.char === 2 && env.player.oct.o.camo > 0.55 && Math.abs(pl.spd) < 1.2;
      $('hide-note').textContent = camo ? t('note_camo') : pl.hidden ? t('note_ink') : '';
    },
  };
}
