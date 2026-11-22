// Studio logo - port of 20_logo.gml. A shallow sea floor seen from above (rippled sand, low-poly stones,
// two detailed starfish), animated caustics over everything; out of the black a curtain of bubbles rises
// and uncovers the AMPLIN logo, which wobbles as if seen through moving water. After ~3.6 s (or a tap /
// key) it fades to black. The game keeps loading underneath.
import * as THREE from 'three';
import { MeshBuilder, rgb, merge, mul } from '../mesh/builder.js';
import { makeRng } from '../world/terrain.js';
import { P } from '../mesh/xform.js';

import { loadImage as img, loadCausticFrames } from '../core/images.js';
// an image multiplied by a colour (canvas 2D has no tinting)
function tinted(im, col) {
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const g = c.getContext('2d');
  g.drawImage(im, 0, 0);
  g.globalCompositeOperation = 'multiply'; g.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`; g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'destination-in'; g.drawImage(im, 0, 0);
  return c;
}

function starfish(b) {
  const n = 9;
  for (let arm = 0; arm < 5; arm++) {
    const a = (arm * 72 + 90) * Math.PI / 180, bend = (arm % 2) * 0.12 - 0.06;
    for (let i = 0; i < n; i++) {
      const s0 = i / n, s1 = (i + 1) / n;
      const w0 = 0.2 * (1 - s0 * 0.82), w1 = 0.2 * (1 - s1 * 0.82), h0 = 0.1 * (1 - s0 * 0.75), h1 = 0.1 * (1 - s1 * 0.75);
      const b0 = a + bend * s0 * s0, b1 = a + bend * s1 * s1;
      const cx0 = Math.cos(b0) * (0.12 + s0 * 0.88), cy0 = Math.sin(b0) * (0.12 + s0 * 0.88), cx1 = Math.cos(b1) * (0.12 + s1 * 0.88), cy1 = Math.sin(b1) * (0.12 + s1 * 0.88);
      const ca = -Math.sin(b0), sa = Math.cos(b0);
      const col = merge(rgb(236, 96, 46), rgb(250, 150, 70), s0 * 0.6);
      b.ref((cx0 + cx1) / 2, (cy0 + cy1) / 2, -0.1);
      b.quad(cx0, cy0, h0, cx1, cy1, h1, cx1 + ca * w1 * 0.55, cy1 + sa * w1 * 0.55, h1 * 0.75, cx0 + ca * w0 * 0.55, cy0 + sa * w0 * 0.55, h0 * 0.75, col);
      b.quad(cx0 + ca * w0 * 0.55, cy0 + sa * w0 * 0.55, h0 * 0.75, cx1 + ca * w1 * 0.55, cy1 + sa * w1 * 0.55, h1 * 0.75, cx1 + ca * w1, cy1 + sa * w1, 0.01, cx0 + ca * w0, cy0 + sa * w0, 0.01, mul(col, 0.92));
      b.quad(cx0, cy0, h0, cx1, cy1, h1, cx1 - ca * w1 * 0.55, cy1 - sa * w1 * 0.55, h1 * 0.75, cx0 - ca * w0 * 0.55, cy0 - sa * w0 * 0.55, h0 * 0.75, mul(col, 1.04));
      b.quad(cx0 - ca * w0 * 0.55, cy0 - sa * w0 * 0.55, h0 * 0.75, cx1 - ca * w1 * 0.55, cy1 - sa * w1 * 0.55, h1 * 0.75, cx1 - ca * w1, cy1 - sa * w1, 0.01, cx0 - ca * w0, cy0 - sa * w0, 0.01, mul(col, 0.9));
      b.blob(cx0, cy0, h0 + 0.01, w0 * 0.22, w0 * 0.22, w0 * 0.2, 2, 5, 0, rgb(180, 40, 30), null);
      if (i % 2 === 0) {
        b.blob(cx0 + ca * w0 * 0.6, cy0 + sa * w0 * 0.6, h0 * 0.7, w0 * 0.14, w0 * 0.14, w0 * 0.12, 2, 5, 0, rgb(255, 210, 150), null);
        b.blob(cx0 - ca * w0 * 0.6, cy0 - sa * w0 * 0.6, h0 * 0.7, w0 * 0.14, w0 * 0.14, w0 * 0.12, 2, 5, 0, rgb(255, 210, 150), null);
      }
    }
  }
  b.blob(0, 0, 0.04, 0.22, 0.22, 0.1, 3, 10, 0.05, rgb(240, 110, 56), null);
  b.blob(0.06, 0.05, 0.13, 0.04, 0.04, 0.02, 2, 6, 0, rgb(200, 150, 70), null);
}

function buildFloor() {
  const R = makeRng(2024), b = new MeshBuilder(R, 4096);
  b.mode = 1; b.jit = 0.05;
  const N = 26, M = 18, hx = [], hy = [], hz = [];
  const fr = (v) => v - Math.floor(v), h2 = (a, c) => fr(Math.sin(a * 127.1 + c * 311.7) * 43758.5453);
  for (let i = 0; i <= N; i++) { hx[i] = []; hy[i] = []; hz[i] = []; for (let j = 0; j <= M; j++) {
    const px = -900 + i * 1800 / N, py = -620 + j * 1240 / M;
    hx[i][j] = px + R.range(-20, 20); hy[i][j] = py + R.range(-20, 20);
    hz[i][j] = Math.sin(px * 0.035 + py * 0.012) * 3.5 + Math.sin(px * 0.011 - py * 0.03) * 5 + R.range(-1.5, 1.5);
  } }
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
    let c = merge(rgb(196, 186, 146), rgb(160, 150, 112), h2(i * 3 + 1, j * 5 + 2));
    if (fr((hx[i][j] * 0.035 + hy[i][j] * 0.012) / 6.283) < 0.5) c = mul(c, 1.05);
    b.mode = 1; b.tri(hx[i][j], hy[i][j], hz[i][j], hx[i + 1][j], hy[i + 1][j], hz[i + 1][j], hx[i + 1][j + 1], hy[i + 1][j + 1], hz[i + 1][j + 1], c);
    b.mode = 1; b.tri(hx[i][j], hy[i][j], hz[i][j], hx[i + 1][j + 1], hy[i + 1][j + 1], hz[i + 1][j + 1], hx[i][j + 1], hy[i][j + 1], hz[i][j + 1], mul(c, 0.96));
  }
  // stones round the edges (the centre stays free for the logo), pebbles and broken shells
  for (let k = 0; k < 16; k++) {
    const a = R.random(360) * Math.PI / 180, r0 = R.range(330, 640);
    const px = Math.cos(a) * r0 * 1.35, py = -Math.sin(a) * r0 * 0.85, r = R.range(14, 40);
    const cg = merge(rgb(130, 126, 118), rgb(92, 96, 100), R.next()), cm = merge(cg, rgb(96, 130, 74), R.range(0.2, 0.6));
    b.blob(px, py, r * 0.25, r * R.range(0.9, 1.3), r, r * R.range(0.5, 0.75), 4, 7, 0.2, cg, cm);
    if (R.next() < 0.5) b.blob(px + R.range(-r, r) * 1.5, py + R.range(-r, r) * 1.5, 2, r * 0.45, r * 0.4, r * 0.3, 3, 6, 0.2, mul(cg, 1.1), null);
  }
  for (let k = 0; k < 40; k++) {
    const px = R.range(-860, 860), py = R.range(-560, 560);
    if (Math.abs(px) < 330 && Math.abs(py) < 170) continue;
    const r = R.range(3, 8);
    b.blob(px, py, 1, r, r * 0.8, r * 0.5, 2, 5, 0.25, merge(rgb(200, 190, 170), rgb(110, 100, 96), R.next()), null);
  }
  const sb = new MeshBuilder(makeRng(2025), 2048);
  starfish(sb);
  return { floor: b.geometry(), star: sb.geometry() };
}

// renderer: the game's WebGL renderer; overlay: a 2D canvas above it. Resolves when the logo has faded out.
export async function playLogo(renderer, overlay, skipSignal) {
  // the pictures fill in as they arrive: the floor and the starfish need none, so the logo starts at once
  let logo = null, bub = null, vignT = null, caustA = [], caustB = [];
  img('assets/ui/spr_amplin.png', 6000).then((i) => { logo = i; });
  img('assets/ui/uibubble.png', 6000).then((i) => { bub = i; });
  img('assets/ui/vignette.png', 6000).then((i) => { if (i) vignT = tinted(i, [0, 20, 30]); });
  loadCausticFrames(6000).then((cf) => { if (cf) { caustA = cf.map((c) => tinted(c, [150, 210, 200])); caustB = cf.map((c) => tinted(c, [110, 170, 170])); } });
  const { floor, star } = buildFloor();
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(new THREE.Color().setRGB(30 / 255, 110 / 255, 130 / 255), 520, 1500);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  scene.add(new THREE.Mesh(floor, mat));
  const stars = [new THREE.Mesh(star, mat), new THREE.Mesh(star, mat)];
  stars.forEach((s) => { s.matrixAutoUpdate = false; scene.add(s); });
  const cam = new THREE.PerspectiveCamera(52, 1, 10, 3000);
  cam.position.set(0, 560, -180); cam.up.set(0, 0, 1); cam.lookAt(0, 0, 10);
  const gm = new THREE.Matrix4(), m = new THREE.Matrix4();
  const placeStar = (mesh, sc, rotDeg, x, y) => {
    gm.makeTranslation(x, y, 2).multiply(m.makeRotationZ(-rotDeg * Math.PI / 180)).multiply(m.makeScale(sc, sc, sc));
    mesh.matrix.copy(P).multiply(gm).multiply(P);
  };
  const g = overlay.getContext('2d');
  const bubbles = [];
  let t0 = performance.now(), out = -1, done = false, last = t0;
  const W0 = 1280, H0 = 720;            // the original's screen: positions are scaled from it

  return new Promise((resolve) => {
    function frame(now) {
      const t = (now - t0) / 1000, k60 = Math.min(3, (now - last) / 16.667);   // steps of the original 60 Hz
      last = now;
      const W = overlay.width = innerWidth, H = overlay.height = innerHeight;
      cam.aspect = W / H; cam.updateProjectionMatrix();
      placeStar(stars[0], 70, 18 + Math.sin(t * 0.7) * 1.5, -330, 150);
      placeStar(stars[1], 46, -40, 420, -170);
      renderer.setClearColor(0x000000, 1);
      renderer.render(scene, cam);
      // 2D: water tint, caustics, logo, light, vignette, bubbles, fades
      const sc0 = Math.min(W / W0, H / H0), front = H + 80 * sc0 - (t - 0.3) * 950 * sc0;
      g.globalAlpha = 0.34;
      const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgb(40,150,160)'); gr.addColorStop(1, 'rgb(10,70,100)');
      g.fillStyle = gr; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
      const caust = (tt, k) => {
        let f = Math.floor(tt * 11) % 16;
        for (const [set, scale, sx, sy, kk] of [[caustA, 1.9, 14, 6, 1], [caustB, 1.3, -9, 11, 0.6]]) {
          if (!set.length) continue;
          const c = set[f]; if (!c) continue;
          const pat = g.createPattern(c, 'repeat');
          pat.setTransform(new DOMMatrix().translate(tt * sx * sc0, tt * sy * sc0).scale(scale * sc0));
          g.globalCompositeOperation = 'lighter'; g.globalAlpha = k * kk; g.fillStyle = pat; g.fillRect(0, 0, W, H);
          f = (f + 7) % 16;
        }
        g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      };
      caust(t, 0.42);
      // the logo, revealed below the bubble front, wobbling as if under moving water (drawn in strips)
      if (logo) {
        const w = logo.width, h = logo.height, sc = Math.min(760 / w, 360 / h) * sc0;
        const X = W / 2 - w * sc / 2, Y = H / 2 - h * sc / 2 - 10 * sc0;
        for (let k = 0; k < 2; k++) for (let sy = 0; sy < h; sy += 3) {
          const dx = (Math.sin(sy * 0.045 + t * 2.3) * 3.2 + Math.sin(sy * 0.13 - t * 3.4) * 1.3) * sc0;
          const al = Math.max(0, Math.min(1, (Y + sy * sc - front - 30 * sc0) / (80 * sc0)));
          if (al <= 0) continue;
          if (k === 0) { g.globalAlpha = 0.3 * al; g.filter = 'brightness(0)'; g.drawImage(logo, 0, sy, w, 4, X + dx + 12 * sc0, Y + sy * sc + 14 * sc0, w * sc, 4 * sc); g.filter = 'none'; }
          else { g.globalAlpha = al; g.drawImage(logo, 0, sy, w, 4, X + dx, Y + sy * sc + Math.sin(t * 1.7 + sy * 0.02) * 1.5 * sc0, w * sc, 4 * sc); }
        }
        g.globalAlpha = 1;
      } else {
        // no logo picture (yet): the word drawn as text, same reveal and wobble
        const al = Math.max(0, Math.min(1, (H / 2 - front - 30 * sc0) / (80 * sc0)));
        if (al > 0) {
          g.save(); g.translate(W / 2 + Math.sin(t * 2.3) * 3 * sc0, H / 2); g.rotate(-Math.sin(t * 1.3) * 0.6 * Math.PI / 180);
          g.font = `900 ${Math.round(140 * sc0)}px "Arial Black", Roboto, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.globalAlpha = 0.3 * al; g.fillStyle = '#000'; g.fillText('AMPLIN', 10 * sc0, 12 * sc0);
          const tg = g.createLinearGradient(0, -70 * sc0, 0, 70 * sc0); tg.addColorStop(0, 'rgb(255,250,230)'); tg.addColorStop(1, 'rgb(170,230,240)');
          g.globalAlpha = al; g.fillStyle = tg; g.fillText('AMPLIN', 0, 0);
          g.restore(); g.globalAlpha = 1;
        }
      }
      caust(t + 0.37, 0.16);
      // light from the top, darker corners
      g.globalCompositeOperation = 'lighter';
      const lg = g.createLinearGradient(0, 0, 0, H * 0.6); lg.addColorStop(0, 'rgb(40,80,90)'); lg.addColorStop(1, 'rgb(0,0,0)');
      g.fillStyle = lg; g.fillRect(0, 0, W, H * 0.6);
      g.globalCompositeOperation = 'source-over';
      if (vignT) { g.globalAlpha = 0.8; g.drawImage(vignT, 0, 0, W, H); g.globalAlpha = 1; }
      // rising curtain of bubbles, then a few stragglers
      if (t > 0.3 && front > -120 * sc0) {
        for (let k = 0; k < Math.round(7 * k60); k++) bubbles.push({ x: Math.random() * W, y: front + Math.random() * 220 * sc0, r: (3 + Math.random() * 6) * [1, 1, 1, 1.6, 2.6][Math.floor(Math.random() * 5)] * sc0, v: -(8 + Math.random() * 5) * sc0, p: Math.random() * 6.28 });
      } else if (t > 0.3 && Math.random() < 0.45) bubbles.push({ x: Math.random() * W, y: H + 30, r: (2 + Math.random() * 5) * sc0, v: -(1.5 + Math.random() * 1.5) * sc0, p: Math.random() * 6.28 });
      for (let k = bubbles.length - 1; k >= 0; k--) {
        const b = bubbles[k];
        b.y += b.v * k60; b.v += (-(1.2 + b.r / sc0 * 0.2) * sc0 - b.v) * 0.02 * k60; b.p += 0.09 * k60;
        b.x += Math.sin(b.p) * Math.max(0, Math.min(0.9, (b.r / sc0 - 4) * 0.08)) * sc0 * k60;
        if (b.y < -40) { bubbles.splice(k, 1); continue; }
        if (bub) { const s = Math.max(0, Math.min(0.12, (b.r / sc0 - 7) * 0.012)) * Math.sin(b.p * 2.3); g.globalAlpha = 0.9; g.drawImage(bub, b.x - b.r * (1 + s) / 2 * 2, b.y - b.r * (1 - s), b.r * 2 * (1 + s), b.r * 2 * (1 - s)); }
      }
      if (bubbles.length > 260) bubbles.splice(0, bubbles.length - 260);
      g.globalAlpha = 1;
      // fade in from black, fade out
      if (out < 0 && (t > 3.6 || (t > 0.4 && skipSignal.hit))) out = t;
      let a = Math.max(0, 1 - t / 0.7);
      if (out >= 0) a = Math.max(a, (t - out) / 0.57);
      if (a > 0) { g.globalAlpha = Math.min(1, a); g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
      if (out >= 0 && t - out >= 0.6) {
        done = true;
        g.clearRect(0, 0, W, H);
        floor.dispose(); star.dispose();
        resolve();
        return;
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
}
