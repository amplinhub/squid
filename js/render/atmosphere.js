// Underwater atmosphere - port of 11_render.gml (water colours, backdrop, fog, caustics, glows, marine snow,
// light shafts) and the underside of the surface (scr_build_water). The original faked most of this
// with extra passes and flipbooks; here it is shaders, so the CPU does almost nothing per frame:
//  * fog colour = water colour at the camera depth, linear fog from 16 % to 100 % of the view distance;
//  * additive things (caustics, glows, snow, shafts) fade to BLACK with distance instead of to the fog
//    colour, exactly like the original;
//  * caustics are computed in the seabed shader (16-frame texture array) - no second pass of the seabed.
import * as THREE from 'three';
import { SURF_Z, depthT, hash2, clamp } from '../world/terrain.js';
import { loadImage, loadTexture } from '../core/images.js';

const srgb = (r, g, b) => new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
const mixC = (a, b, t) => a.clone().lerp(b, t);

const FOG_SHALLOW = srgb(30, 122, 144), FOG_DEEP = srgb(3, 13, 30), TOP_LIGHT = srgb(150, 232, 240);

export function createAtmosphere(scene, camera, renderer) {
  const uTime = { value: 0 };
  const shared = {
    uFogNear: { value: 100 }, uFogFar: { value: 900 },        // linear fog range (game units)
    uCaustFar: { value: 760 }, uCaust: { value: null }, uFrame: { value: 0 }, uCaustOn: { value: 0 },
    uPx: { value: 500 },                                        // pixels per unit at distance 1
  };
  scene.fog = new THREE.Fog(FOG_SHALLOW.clone(), 100, 900);
  const fogc = new THREE.Color(), topc = new THREE.Color(), botc = new THREE.Color();

  // ---------------- backdrop: gradient around the camera, drawn first, no depth
  const bgMat = new THREE.ShaderMaterial({
    uniforms: { uTop: { value: topc }, uFog: { value: fogc }, uBot: { value: botc } },
    vertexShader: `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uTop, uFog, uBot; varying vec3 vDir;
      void main() { float t = clamp(vDir.y / 0.55, -1.0, 1.0);
        vec3 c = t > 0.0 ? mix(uFog, uTop, t) : mix(uFog, uBot, -t);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthTest: false, depthWrite: false, fog: false,
  });
  const bg = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), bgMat);
  bg.frustumCulled = false; bg.renderOrder = -1000;
  scene.add(bg);

  // ---------------- caustic frames -> texture array (loaded in the background; until then no caustics)
  const ready = (async () => {
    const N = 16, S = 256, data = new Uint8Array(S * S * 4 * N);
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    const imgs = await Promise.all([...Array(N)].map((_, i) => loadImage(`assets/tex/caustic_${String(i).padStart(2, '0')}.png`)));
    if (imgs.some((im) => !im)) throw new Error('caustic frames missing');
    imgs.forEach((im, i) => { cx.clearRect(0, 0, S, S); cx.drawImage(im, 0, 0, S, S); data.set(cx.getImageData(0, 0, S, S).data, i * S * S * 4); });
    const tex = new THREE.DataArrayTexture(data, S, S, N);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    tex.colorSpace = THREE.NoColorSpace;
    tex.needsUpdate = true;
    shared.uCaust.value = tex;
  })().catch((e) => console.warn('caustics not loaded', e));

  const softTex = loadTexture('assets/tex/soft.png');

  // seabed material: baked vertex colours + caustics (only faces looking up, fading with depth / distance)
  function groundMaterial() {
    const m = new THREE.MeshBasicMaterial({ vertexColors: true });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, { uCaust: shared.uCaust, uFrame: shared.uFrame, uCaustOn: shared.uCaustOn, uCaustFar: shared.uCaustFar });
      sh.vertexShader = 'attribute float aUp;\nvarying float vUp;\nvarying vec3 vWorld;\n' +
        sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvUp = aUp; vWorld = position;');
      sh.fragmentShader = 'uniform highp sampler2DArray uCaust;\nuniform float uFrame, uCaustOn, uCaustFar;\nvarying float vUp;\nvarying vec3 vWorld;\n' +
        sh.fragmentShader.replace('#include <fog_fragment>', `#include <fog_fragment>
        float ck = vUp * clamp(1.15 - clamp((${SURF_Z.toFixed(1)} - vWorld.y) / 2300.0, 0.0, 1.0) * 1.7, 0.0, 1.0) * uCaustOn;
        ck *= 1.0 - clamp((vFogDepth - fogNear) / max(1.0, uCaustFar - fogNear), 0.0, 1.0);
        ck *= 1.0 - smoothstep(560.0, 700.0, distance(vWorld.xz, cameraPosition.xz));
        if (ck > 0.002) gl_FragColor.rgb += texture(uCaust, vec3(vWorld.xz / 290.0, uFrame)).rgb * ck;`);
    };
    return m;
  }

  // ---------------- glows of bioluminescent decor: additive soft points, pulsing
  function glowMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: { uTime, uTex: { value: softTex }, uPx: shared.uPx, uFogNear: shared.uFogNear, uFogFar: shared.uFogFar },
      vertexShader: `attribute vec3 aColor; attribute float aSize; attribute float aPhase;
        uniform float uTime, uPx, uFogNear, uFogFar; varying vec3 vCol; varying float vA;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float d = max(1.0, -mv.z);
          float s = aSize * (0.85 + 0.15 * sin(uTime * 2.0 + aPhase));
          gl_PointSize = clamp(2.0 * s * uPx / d, 1.0, 512.0);
          gl_Position = projectionMatrix * mv;
          vCol = aColor; vA = 0.55 * (1.0 - clamp((d - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0));
        }`,
      fragmentShader: `uniform sampler2D uTex; varying vec3 vCol; varying float vA;
        void main() { vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vCol * t.rgb * t.a * vA, 1.0); }`,
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false,
    });
  }
  // list: flat (x, y, z, r, g, b, size, phase) in game units / sRGB 0..255
  function makeGlowPoints(list, mat) {
    const n = list.length / 8, p = new Float32Array(n * 3), c = new Float32Array(n * 3), s = new Float32Array(n), ph = new Float32Array(n);
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const o = i * 8;
      p[i * 3] = list[o]; p[i * 3 + 1] = list[o + 2]; p[i * 3 + 2] = list[o + 1];
      col.setRGB(list[o + 3] / 255, list[o + 4] / 255, list[o + 5] / 255, THREE.SRGBColorSpace);
      c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b;
      s[i] = list[o + 6]; ph[i] = list[o + 7];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(c, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(s, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    g.computeBoundingSphere();
    g.boundingSphere.radius += 40;
    const pts = new THREE.Points(g, mat);
    pts.matrixAutoUpdate = false;
    return pts;
  }

  // ---------------- marine snow: points in a box that wraps around the camera (drift in the shader)
  const SNOW_B = 1400, SNOW_N = 2400;
  const snow = (() => {
    let seed = 4242;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const p = new Float32Array(SNOW_N * 3), c = new Float32Array(SNOW_N * 3), s = new Float32Array(SNOW_N);
    const a = srgb(150, 210, 210), b = srgb(235, 250, 240), t = new THREE.Color();
    for (let i = 0; i < SNOW_N; i++) {
      p[i * 3] = rnd() * SNOW_B; p[i * 3 + 1] = rnd() * SNOW_B; p[i * 3 + 2] = rnd() * SNOW_B;
      t.copy(a).lerp(b, rnd()).multiplyScalar(0.12 + rnd() * 0.33);         // colour x alpha (additive)
      c[i * 3] = t.r; c[i * 3 + 1] = t.g; c[i * 3 + 2] = t.b;
      s[i] = 0.3 + rnd() * 0.55;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(c, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(s, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime, uPx: shared.uPx, uFar: { value: 760 }, uCam: { value: new THREE.Vector3() } },
      vertexShader: `attribute vec3 aColor; attribute float aSize; uniform float uTime, uPx, uFar; uniform vec3 uCam; varying vec3 vCol;
        void main() {
          vec3 p = position + vec3(uTime * 2.2, -uTime * 3.4, uTime * 1.1);
          p = mod(p - uCam + ${(SNOW_B / 2).toFixed(1)}, ${SNOW_B.toFixed(1)}) + uCam - ${(SNOW_B / 2).toFixed(1)};
          vec4 mv = viewMatrix * vec4(p, 1.0);
          float d = max(1.0, -mv.z);
          gl_PointSize = max(1.0, 2.0 * aSize * uPx / d);
          gl_Position = projectionMatrix * mv;
          vCol = aColor * (1.0 - clamp((d - 120.0) / max(1.0, uFar - 120.0), 0.0, 1.0));
        }`,
      fragmentShader: `varying vec3 vCol; void main() { vec2 q = gl_PointCoord - 0.5; if (dot(q, q) > 0.25) discard; gl_FragColor = vec4(vCol, 1.0); }`,
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false,
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    scene.add(pts);
    return pts;
  })();

  // ---------------- light shafts from the surface: world-anchored grid, swaying (additive, black fog)
  const SH_G = 560, SH_R = Math.ceil(1500 / SH_G), SH_MAX = (2 * SH_R + 1) ** 2;
  const shafts = (() => {
    const K = 8, pos = [], al = [];
    // frustum in game space: radius 1 at the surface (z 0) .. 1.8 at z -1; converted to three (x, z, y)
    for (let k = 0; k < K; k++) {
      const a0 = k * 2 * Math.PI / K, a1 = (k + 1) * 2 * Math.PI / K;
      const v = (a, r, z, al0) => { pos.push(Math.cos(a) * r, z, Math.sin(a) * r); al.push(al0); };
      v(a0, 1, 0, 0.2); v(a1, 1, 0, 0.2); v(a1, 1.8, -1, 0);
      v(a0, 1, 0, 0.2); v(a1, 1.8, -1, 0); v(a0, 1.8, -1, 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aAlpha', new THREE.Float32BufferAttribute(al, 1));
    const col = srgb(170, 225, 255);
    const m = new THREE.ShaderMaterial({
      uniforms: { uCol: { value: col }, uNear: { value: 150 }, uFar: { value: 900 } },
      vertexShader: `attribute float aAlpha; uniform float uNear, uFar; varying float vA;
        void main() { vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          vA = aAlpha * (1.0 - clamp((-mv.z - uNear) / (uFar - uNear), 0.0, 1.0)); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uCol; varying float vA; void main() { gl_FragColor = vec4(uCol * vA, 1.0); }`,
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    const mesh = new THREE.InstancedMesh(g, m, SH_MAX);
    mesh.frustumCulled = false; mesh.count = 0;
    scene.add(mesh);
    return mesh;
  })();
  const gm = new THREE.Matrix4(), tmpM = new THREE.Matrix4(), P = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1);
  function updateShafts(t, cam, vd) {
    let n = 0;
    const gi = Math.floor(cam.x / SH_G), gj = Math.floor(cam.y / SH_G);
    for (let a = gi - SH_R; a <= gi + SH_R; a++)
      for (let b = gj - SH_R; b <= gj + SH_R; b++) {
        const h = hash2(a * 1.7 + 0.3, b * 2.3 + 0.7);
        if (h < 0.45) continue;
        const px = (a + 0.5 + (hash2(b, a) - 0.5) * 0.7) * SH_G, py = (b + 0.5 + (hash2(a + 9, b) - 0.5) * 0.7) * SH_G;
        const w = 30 + 110 * hash2(b * 3.1, a * 0.7), l = 800 + 700 * h;
        if (Math.hypot(px - cam.x, py - cam.y) > vd + l) continue;
        // game-space transform: scale (w, w, l), tilt about x, then y, move to the surface
        gm.makeScale(w, w, l)
          .premultiply(tmpM.makeRotationX(Math.sin(t * 0.23 + h * 9) * 3.5 * Math.PI / 180))
          .premultiply(tmpM.makeRotationY((9 + Math.sin(t * 0.31 + h * 13) * 3) * Math.PI / 180))
          .premultiply(tmpM.makeTranslation(px, py, SURF_Z + 5));
        // to three space: P * M * P (the geometry itself is stored already converted)
        tmpM.copy(P).multiply(gm).multiply(P);
        shafts.setMatrixAt(n++, tmpM);
      }
    shafts.count = n;
    shafts.instanceMatrix.needsUpdate = true;
  }

  // ---------------- underside of the surface: low-poly waves, periodic tile, heights in the shader
  const WN = 8, WT = 1024;
  const surface = (() => {
    const pos = [], la = [], lb = [], lc = [], dg = [], sh = [];
    const cell = WT / WN;
    const push = (A, B, Cc, D, shade) => {
      for (const v of [A, B, Cc]) { pos.push(v[0] * cell, 0, v[1] * cell); la.push(A[0], A[1]); lb.push(B[0], B[1]); lc.push(Cc[0], Cc[1]); dg.push(D[0], D[1], D[2], D[3]); sh.push(shade); }
    };
    for (let i = 0; i < WN; i++)
      for (let j = 0; j < WN; j++) {
        push([i, j], [i + 1, j], [i + 1, j + 1], [i, j, i + 1, j + 1], 1);
        push([i, j], [i + 1, j + 1], [i, j + 1], [i + 1, j, i, j + 1], 0.94);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aA', new THREE.Float32BufferAttribute(la, 2));
    g.setAttribute('aB', new THREE.Float32BufferAttribute(lb, 2));
    g.setAttribute('aC', new THREE.Float32BufferAttribute(lc, 2));
    g.setAttribute('aD', new THREE.Float32BufferAttribute(dg, 4));
    g.setAttribute('aS', new THREE.Float32BufferAttribute(sh, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uPh: { value: 0 } }]),
      vertexShader: `attribute vec2 aA, aB, aC; attribute vec4 aD; attribute float aS; uniform float uPh; varying vec3 vCol;
        #include <fog_pars_vertex>
        const float PI2 = 6.2831853; const float N = ${WN.toFixed(1)};
        float wz(vec2 l) { return 7.0 * sin(PI2 * (2.0 * l.x + l.y) / N + uPh) + 5.0 * sin(PI2 * (-l.x + 3.0 * l.y) / N + 2.0 * uPh) + 3.0 * sin(PI2 * (3.0 * l.x - 2.0 * l.y) / N - uPh); }
        void main() {
          vec3 p = position; p.y = wz(p.xz / ${(WT / WN).toFixed(1)});
          // face colour: brighter where the wave is steep (from the triangle's diagonal), lit from above
          float b = clamp(abs(wz(aD.xy) - wz(aD.zw)) / 14.0, 0.0, 1.0);
          vec3 c = mix(vec3(70.0, 170.0, 190.0), vec3(215.0, 250.0, 250.0), b * 0.8) / 255.0 * aS;
          float cs = ${(WT / WN).toFixed(1)};
          vec3 A = vec3(aA.x * cs, aA.y * cs, wz(aA)), B = vec3(aB.x * cs, aB.y * cs, wz(aB)), C = vec3(aC.x * cs, aC.y * cs, wz(aC));
          vec3 n = normalize(cross(B - A, C - A)); if (n.z < 0.0) n = -n;
          float lit = 0.46 + 0.64 * max(0.0, dot(n, vec3(0.22, 0.28, 0.93)));
          vCol = min(c * lit, 1.0);
          vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `varying vec3 vCol;
        #include <fog_pars_fragment>
        void main() { gl_FragColor = vec4(vCol, 1.0);
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      side: THREE.DoubleSide, fog: true,
    });
    const R = 4, mesh = new THREE.InstancedMesh(g, m, (2 * R + 1) ** 2);
    mesh.frustumCulled = false; mesh.count = 0;
    scene.add(mesh);
    return mesh;
  })();
  function updateSurface(t, cam, vd) {
    if (cam.z < SURF_Z - vd) { surface.count = 0; return; }
    surface.material.uniforms.uPh.value = t * 7 / 16 * 2 * Math.PI;
    const ix = Math.floor(cam.x / WT), iy = Math.floor(cam.y / WT), r = Math.min(4, Math.ceil(vd / WT));
    let n = 0;
    for (let i = -r; i <= r; i++)
      for (let j = -r; j <= r; j++) {
        tmpM.makeTranslation((ix + i) * WT, SURF_Z, (iy + j) * WT);
        surface.setMatrixAt(n++, tmpM);
      }
    surface.count = n;
    surface.instanceMatrix.needsUpdate = true;
  }

  // ---------------- glows of moving things (jellyfish bells, photophores, lures): one buffer refilled per frame
  function dynamicGlow(max) {
    const p = new Float32Array(max * 3), c = new Float32Array(max * 3), s = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    const attr = (a, n) => { const b = new THREE.BufferAttribute(a, n); b.setUsage(THREE.DynamicDrawUsage); return b; };
    g.setAttribute('position', attr(p, 3)); g.setAttribute('aColor', attr(c, 3)); g.setAttribute('aSize', attr(s, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: softTex }, uPx: shared.uPx, uFogNear: shared.uFogNear, uFogFar: shared.uFogFar },
      vertexShader: `attribute vec3 aColor; attribute float aSize; uniform float uPx, uFogNear, uFogFar; varying vec3 vCol;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float d = max(1.0, -mv.z);
          gl_PointSize = clamp(2.0 * aSize * uPx / d, 1.0, 512.0);
          gl_Position = projectionMatrix * mv;
          vCol = aColor * (1.0 - clamp((d - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0));
        }`,
      fragmentShader: `uniform sampler2D uTex; varying vec3 vCol;
        void main() { vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vCol * t.rgb * t.a, 1.0); }`,
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false,
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    scene.add(pts);
    let n = 0;
    return {
      begin() { n = 0; },
      // game coordinates; colour 0..255 already multiplied by its alpha
      add(x, y, z, r, gg, b, a, size) {
        if (n >= max) return;
        p[n * 3] = x; p[n * 3 + 1] = z; p[n * 3 + 2] = y;
        c[n * 3] = r / 255 * a; c[n * 3 + 1] = gg / 255 * a; c[n * 3 + 2] = b / 255 * a;
        s[n] = size; n++;
      },
      end() {
        g.setDrawRange(0, n);
        for (const k of ['position', 'aColor', 'aSize']) g.attributes[k].needsUpdate = true;
      },
    };
  }

  // ---------------- per frame
  // cam: camera position in game units {x, y, z}; vd: view distance; gfx: 0 low (no caustics / snow /
  // shafts), 1, 2; t: game time in seconds
  function update(t, cam, vd, gfx) {
    uTime.value = t;
    // above the water (title menu): only the ocean top is drawn, fogged into the horizon colour
    const above = cam.z > SURF_Z;
    bg.visible = !above;
    if (above) {
      scene.fog.color.setRGB(255 / 255, 196 / 255, 150 / 255); scene.fog.near = 300; scene.fog.far = 4300;
      snow.visible = false; shafts.visible = false; surface.count = 0;
      return;
    }
    const dt = depthT(cam.z);
    fogc.copy(mixC(FOG_SHALLOW, FOG_DEEP, Math.pow(dt, 0.7)));
    topc.copy(mixC(fogc, TOP_LIGHT, 0.6 * Math.pow(1 - dt, 1.3)));
    botc.copy(fogc).multiplyScalar(0.82);
    scene.fog.color.copy(fogc);
    scene.fog.near = vd * 0.16; scene.fog.far = vd;
    shared.uFogNear.value = vd * 0.16; shared.uFogFar.value = vd;
    shared.uCaustFar.value = vd * 0.85;
    shared.uFrame.value = Math.floor(t * 11) % 16;
    shared.uCaustOn.value = (gfx > 0 && dt <= 0.85 && shared.uCaust.value) ? 1 : 0;
    const h = renderer.getDrawingBufferSize(new THREE.Vector2()).y;
    shared.uPx.value = h / 2 / Math.tan(camera.fov * Math.PI / 360);
    bg.position.copy(camera.position);
    bg.scale.setScalar(camera.near * 4);

    snow.visible = gfx > 0;
    snow.material.uniforms.uCam.value.copy(camera.position);
    snow.material.uniforms.uFar.value = Math.min(vd, 760);

    shafts.visible = gfx > 0 && dt < 0.72;
    if (shafts.visible) { shafts.material.uniforms.uFar.value = vd * 1.05; updateShafts(t, cam, vd); }
    updateSurface(t, cam, vd);
  }

  return { uTime, ready, update, groundMaterial, glowMaterial, makeGlowPoints, dynamicGlow, waterColour: () => fogc };
}

export { clamp };
