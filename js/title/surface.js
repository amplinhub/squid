// Above the water - port of scr_build_sea and scr_render_surface (21_surface.gml): evening sky (deep blue
// above, rose and amber at the horizon), the sun with slowly turning rays, cirrus and two cumulus layers
// drifting along the horizon, a barge far away on the right with its exhaust and a blinking mast lamp,
// the 3D top of the ocean fogged into the horizon colour, sun glitter, the sun's path and a lens flare.
// The sky is a 2D canvas behind the (transparent) WebGL canvas, the glitter a 2D canvas in front of it.
// Positions are those of the original 1280 x 720 screen, scaled to the window.
import * as THREE from 'three';
import { SURF_Z } from '../world/terrain.js';

const img = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
function tinted(im, col) {
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const g = c.getContext('2d');
  g.drawImage(im, 0, 0);
  g.globalCompositeOperation = 'multiply'; g.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`; g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'destination-in'; g.drawImage(im, 0, 0);
  return c;
}
const h2 = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };

export const HORIZON = new THREE.Color().setRGB(255 / 255, 196 / 255, 150 / 255);

export function createSurface(scene) {
  // ---------------- 3D ocean top: periodic tile of low-poly waves, heights in the shader
  const WN = 16, WT = 1024, cell = WT / WN;
  const pos = [], la = [], lb = [], lc = [], sh = [];
  const push = (A, B, C, shade) => { for (const v of [A, B, C]) { pos.push(v[0] * cell, 0, v[1] * cell); la.push(A[0], A[1]); lb.push(B[0], B[1]); lc.push(C[0], C[1]); sh.push(shade); } };
  for (let i = 0; i < WN; i++) for (let j = 0; j < WN; j++) { push([i, j], [i + 1, j], [i + 1, j + 1], 1); push([i, j], [i + 1, j + 1], [i, j + 1], 0.93); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aA', new THREE.Float32BufferAttribute(la, 2));
  g.setAttribute('aB', new THREE.Float32BufferAttribute(lb, 2));
  g.setAttribute('aC', new THREE.Float32BufferAttribute(lc, 2));
  g.setAttribute('aS', new THREE.Float32BufferAttribute(sh, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uPh: { value: 0 } }]),
    vertexShader: `attribute vec2 aA, aB, aC; attribute float aS; uniform float uPh; varying vec3 vCol;
      #include <fog_pars_vertex>
      const float PI2 = 6.2831853; const float N = ${WN.toFixed(1)};
      float wz(vec2 l) { return 0.8 * (7.0 * sin(PI2 * (2.0 * l.x + l.y) / N + uPh) + 5.0 * sin(PI2 * (-l.x + 3.0 * l.y) / N + 2.0 * uPh) + 3.0 * sin(PI2 * (3.0 * l.x - 2.0 * l.y) / N - uPh)); }
      void main() {
        vec3 p = position; p.y = wz(p.xz / ${cell.toFixed(1)});
        float cs = ${cell.toFixed(1)};
        vec3 A = vec3(aA * cs, wz(aA)), B = vec3(aB * cs, wz(aB)), C = vec3(aC * cs, wz(aC));
        // deep blue facets, lighter crests
        float b = clamp((max(max(A.z, B.z), C.z) + 10.0) / 24.0, 0.0, 1.0);
        vec3 c = mix(vec3(16.0, 56.0, 92.0), vec3(64.0, 132.0, 160.0), b) / 255.0 * aS;
        vec3 n = normalize(cross(B - A, C - A)); if (n.z < 0.0) n = -n;
        vCol = min(c * (0.46 + 0.64 * max(0.0, dot(n, vec3(0.22, 0.28, 0.93)))), 1.0);
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `varying vec3 vCol;
      #include <fog_pars_fragment>
      void main() { gl_FragColor = vec4(vCol, 1.0);
        #include <fog_fragment>
      }`,
    side: THREE.DoubleSide, fog: true,
  });
  const R = 5, sea = new THREE.InstancedMesh(g, mat, (2 * R + 1) ** 2);
  sea.frustumCulled = false; sea.visible = false;
  scene.add(sea);
  const m4 = new THREE.Matrix4();

  // ---------------- images
  const A = {};
  const ready = Promise.all([img('assets/ui/clouds.png'), img('assets/ui/cirrus.png'), img('assets/ui/ship.png'), img('assets/tex/soft.png'), img('assets/ui/vignette.png')])
    .then(([clouds, cirrus, ship, soft, vign]) => {
      Object.assign(A, { clouds, cirrus, ship: ship && tinted(ship, [40, 40, 64]), vign: vign && tinted(vign, [0, 0, 0]) });
      if (soft) {
        const tc = (c) => tinted(soft, c);
        Object.assign(A, { s1: tc([120, 66, 30]), s2: tc([200, 120, 60]), s3: tc([255, 244, 214]), s4: soft, s5: tc([150, 90, 40]), s6: tc([255, 236, 200]),
          smoke: tc([96, 88, 104]), lamp: tc([255, 120, 90]), path: tc([150, 96, 50]), streak: tc([255, 170, 110]),
          ghost: [[120, 200, 170], [255, 200, 120], [90, 120, 200], [255, 150, 120], [110, 170, 140], [200, 140, 220]].map(tc) });
      }
    });

  // soft sprite centred at (x, y) with scale (sx, sy) of the 64 px original, alpha a
  const spr = (c2, im, x, y, sx, sy, a, s) => { if (!im) return; c2.globalAlpha = a; c2.drawImage(im, x - 32 * sx * s, y - 32 * sy * s, 64 * sx * s, 64 * sy * s); };

  // horizon line on screen for the camera pitch (degrees) and vertical fov
  const horizon = (H, pitchDeg, fov) => H / 2 + Math.tan(pitchDeg * Math.PI / 180) * (H / 2) / Math.tan(fov * Math.PI / 360);

  function drawSky(c2, W, H, t, pitchDeg, fov) {
    const s = H / 720, hy = horizon(H, pitchDeg, fov);
    const c0 = 'rgb(22,44,96)', c1 = 'rgb(112,122,178)', c2c = 'rgb(255,196,150)';
    c2.globalAlpha = 1; c2.globalCompositeOperation = 'source-over';
    let gr = c2.createLinearGradient(0, 0, 0, hy * 0.55); gr.addColorStop(0, c0); gr.addColorStop(1, c1);
    c2.fillStyle = gr; c2.fillRect(0, 0, W, hy * 0.55);
    gr = c2.createLinearGradient(0, hy * 0.55, 0, hy + 2); gr.addColorStop(0, c1); gr.addColorStop(1, c2c);
    c2.fillStyle = gr; c2.fillRect(0, hy * 0.55, W, hy * 0.45 + 2);
    c2.fillStyle = c2c; c2.fillRect(0, hy, W, H - hy);
    const sx = W * 0.62, sy = hy - 34 * s;
    c2.globalCompositeOperation = 'lighter';
    spr(c2, A.s1, sx, sy, 16, 8, 0.9, s); spr(c2, A.s2, sx, sy, 6, 5, 0.7, s); spr(c2, A.s3, sx, sy, 1.6, 1.6, 1, s); spr(c2, A.s4, sx, sy, 0.9, 0.9, 1, s);
    // crepuscular rays fanning out of the sun, slowly turning and breathing
    for (let k = 0; k < 22; k++) {
      const a = (180 + 8 + k * 7.8 + Math.sin(t * 0.13 + k * 1.7) * 3) * Math.PI / 180, r = (420 + 260 * h2(k, 31)) * s;
      const gg = 0.07 * (0.55 + 0.45 * Math.sin(t * (0.35 + h2(k, 5) * 0.4) + k * 2.1));
      const rg = c2.createRadialGradient(sx, sy, 0, sx, sy, r);
      rg.addColorStop(0, `rgba(255,214,160,${gg})`); rg.addColorStop(1, 'rgba(255,190,130,0)');
      c2.fillStyle = rg; c2.globalAlpha = 1;
      c2.beginPath(); c2.moveTo(sx, sy);
      c2.lineTo(sx + Math.cos(a - 0.028) * r, sy - Math.sin(a - 0.028) * r * 0.75);
      c2.lineTo(sx + Math.cos(a + 0.028) * r, sy - Math.sin(a + 0.028) * r * 0.75);
      c2.fill();
    }
    c2.globalCompositeOperation = 'source-over';
    // high cirrus streaks, then the cumulus band reaching down to the horizon
    if (A.cirrus) {
      const sc = 1.5 * s; let x0 = -((t * 2 * s) % (1024 * sc));
      c2.globalAlpha = 0.7;
      while (x0 < W) { c2.drawImage(A.cirrus, x0, hy * 0.08, 1024 * sc, 128 * 1.2 * s); x0 += 1024 * sc; }
    }
    if (A.clouds) for (let k = 0; k < 2; k++) {
      const sc = (k === 0 ? 0.9 : 1.45) * s, a = k === 0 ? 0.6 : 0.95, yy = k === 0 ? 0.55 : 1.05;
      let x0 = -(((k === 0 ? t * 3 + 500 : t * 7) * s) % (1024 * sc));
      c2.globalAlpha = a;
      // the cloud sprite hangs above the horizon (its origin is at the bottom)
      while (x0 < W) { c2.drawImage(A.clouds, x0, hy + 3 - 256 * yy * s, 1024 * sc, 256 * yy * s); x0 += 1024 * sc; }
    }
    // the sun shines through the thin cloud edges
    c2.globalCompositeOperation = 'lighter';
    spr(c2, A.s5, sx, sy, 4.5, 3, 0.8, s); spr(c2, A.s6, sx, sy, 1.1, 1.1, 0.9, s);
    c2.globalCompositeOperation = 'source-over';
    // a barge far away on the right, rocking; exhaust drifting with the wind; a lamp blinks on the mast
    if (A.ship) {
      const px = W * 0.8, py = hy + 2 * s + Math.sin(t * 0.9) * 0.7 * s, sc = 0.55 * s;
      c2.save(); c2.translate(px, py); c2.rotate(-Math.sin(t * 0.6) * 0.6 * Math.PI / 180);
      c2.globalAlpha = 0.96; c2.drawImage(A.ship, -160 * sc, -72 * sc, 320 * sc, 96 * sc); c2.restore();
      for (let k = 0; k < 7; k++) {
        const f = (t * 0.06 + k / 7) % 1;
        spr(c2, A.smoke, px + (76 - f * 110) * s, py - (28 + f * 22) * s + Math.sin(t + k) * 2 * s, 0.25 + f * 0.8, 0.18 + f * 0.45, 0.28 * (1 - f), s);
      }
      if (Math.sin(t * 3.1) > 0.3) { c2.globalCompositeOperation = 'lighter'; spr(c2, A.lamp, px + 64 * s, py - 36 * s, 0.14, 0.14, 1, s); c2.globalCompositeOperation = 'source-over'; }
    }
    c2.globalAlpha = 1;
  }

  // sun glitter on the water, the sun's path, lens flare; vignette for the menu
  function drawOverlay(c2, W, H, t, pitchDeg, fov, vignette) {
    const s = H / 720, hy = horizon(H, pitchDeg, fov), sx = W * 0.62, sy = hy - 34 * s;
    c2.globalCompositeOperation = 'lighter';
    c2.fillStyle = 'rgb(255,214,160)';
    for (let k = 0; k < 90; k++) {
      const yy = hy + 3 * s + Math.pow(h2(k, 3), 1.6) * (H - hy), gg = (yy - hy) / Math.max(1, H - hy);
      const px = sx + (h2(k, 9) - 0.5) * (30 + gg * 520) * s;
      c2.globalAlpha = (0.5 + 0.5 * Math.sin(t * (6 + h2(k, 5) * 7) + k * 3)) * (1 - gg * 0.6) * 0.8;
      c2.fillRect(px - (2 + gg * 7) * s, yy, (4 + gg * 14) * s, (1 + gg * 1.5) * s);
    }
    for (let k = 0; k < 6; k++) {
      const yy = hy + 6 * s + k * (H - hy) / 6;
      if (A.path) { c2.globalAlpha = 0.35 + 0.1 * Math.sin(t * 2.2 + k * 1.7); const w = 64 * (0.9 + k * 1.1) * s, h = (H - hy) / 4; c2.drawImage(A.path, sx + Math.sin(t * 1.3 + k) * 4 * s - w / 2, yy - h / 2, w, h); }
    }
    spr(c2, A.streak, sx, sy, 30, 0.14, 0.55, s); spr(c2, A.s4, sx, sy, 12, 0.07, 0.5, s);
    const dx = W / 2 - sx, dy = H / 2 - sy;
    const GH = [[0.45, 0.5, 0.22], [0.8, 0.25, 0.3], [1.15, 1.1, 0.16], [1.45, 0.4, 0.25], [1.8, 1.6, 0.12], [2.2, 0.7, 0.18]];
    if (A.ghost) GH.forEach(([f, r, a], k) => spr(c2, A.ghost[k], sx + dx * f, sy + dy * f, r, r, a * (0.85 + 0.15 * Math.sin(t * 0.7 + k)), s));
    c2.globalCompositeOperation = 'source-over';
    if (vignette > 0 && A.vign) { c2.globalAlpha = 0.4 * vignette; c2.drawImage(A.vign, 0, 0, W, H); }
    c2.globalAlpha = 1;
  }

  // per frame while the camera is above the water: wave phase and the tiles round the camera (game units)
  function update(t, cam) {
    mat.uniforms.uPh.value = t * 6 / 16 * 2 * Math.PI;
    const ix = Math.floor(cam.x / WT), iy = Math.floor(cam.y / WT);
    let n = 0;
    for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) sea.setMatrixAt(n++, m4.makeTranslation((ix + i) * WT, SURF_Z, (iy + j) * WT));
    sea.count = n;
    sea.instanceMatrix.needsUpdate = true;
  }

  return { ready, sea, drawSky, drawOverlay, update, horizon, setVisible(v) { sea.visible = v; } };
}
