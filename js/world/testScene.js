// Stage 0 test scene: a patch of low-poly seabed with rocks, swaying kelp and drifting "marine snow".
// Everything here is temporary and will be replaced by the real chunked world (stage 1), but it already
// uses the techniques the real world will use: flat shading with vertex colours, InstancedMesh, and the
// sway done in the vertex shader so the CPU does nothing per plant.
import * as THREE from 'three';

const SIZE = 240;           // seabed patch side, m
export const FLOOR_Y = -60; // average seabed level

// small deterministic random so the scene is the same on every load
function rng(seed) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}

function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function floorHeight(x, z) {
  return FLOOR_Y + (noise(x * 0.03, z * 0.03) - 0.5) * 14 + (noise(x * 0.11, z * 0.11) - 0.5) * 3;
}

export function buildTestScene(scene) {
  const rand = rng(7);
  const group = new THREE.Group();

  // ---- seabed: a grid with height noise, then non-indexed so every triangle gets its own flat colour
  const seg = 60;
  let g = new THREE.PlaneGeometry(SIZE, SIZE, seg, seg);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + (hash2(i, 1) - 0.5) * 1.5, z = p.getZ(i) + (hash2(i, 2) - 0.5) * 1.5;
    p.setXYZ(i, x, floorHeight(x, z), z);
  }
  g = g.toNonIndexed();
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const sand = new THREE.Color(0xc9b27a), dark = new THREE.Color(0x6f7f62), c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const k = THREE.MathUtils.clamp((y - FLOOR_Y + 7) / 14, 0, 1);
    c.copy(dark).lerp(sand, k * 0.8 + hash2(i, 9) * 0.2);
    for (let j = 0; j < 3; j++) c.toArray(col, (i + j) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  group.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));

  // ---- rocks: one instanced icosahedron, each instance squashed and rotated differently
  const rockGeo = new THREE.IcosahedronGeometry(1, 0);
  const rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshLambertMaterial({ color: 0x7d8790, flatShading: true }), 70);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), e = new THREE.Euler();
  for (let i = 0; i < rocks.count; i++) {
    const x = (rand() - 0.5) * SIZE * 0.9, z = (rand() - 0.5) * SIZE * 0.9;
    const r = 1 + rand() * rand() * 6;
    v.set(x, floorHeight(x, z) + r * 0.25, z);
    q.setFromEuler(e.set(rand() * 3, rand() * 6.3, rand() * 3));
    s.set(r * (0.8 + rand() * 0.6), r * (0.5 + rand() * 0.4), r * (0.8 + rand() * 0.6));
    rocks.setMatrixAt(i, m.compose(v, q, s));
    rocks.setColorAt(i, c.setHSL(0.55 + rand() * 0.08, 0.08 + rand() * 0.1, 0.38 + rand() * 0.18));
  }
  group.add(rocks);

  // ---- kelp: tall tapered strips; the vertex shader bends them with height, phase from the instance position
  const kelpGeo = new THREE.CylinderGeometry(0.12, 0.35, 1, 4, 6, true);
  kelpGeo.translate(0, 0.5, 0);
  const kelpMat = new THREE.MeshLambertMaterial({ color: 0x3f8f4a, flatShading: true, side: THREE.DoubleSide });
  const uTime = { value: 0 };
  kelpMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      float ph = ip.x * 0.21 + ip.z * 0.17;
      float h = position.y * position.y;
      transformed.x += sin(uTime * 1.1 + ph) * 0.35 * h;
      transformed.z += cos(uTime * 0.8 + ph * 1.3) * 0.25 * h;`);
  };
  const kelp = new THREE.InstancedMesh(kelpGeo, kelpMat, 160);
  let n = 0;
  for (let cl = 0; cl < 18 && n < kelp.count; cl++) {           // kelp grows in clumps
    const cx = (rand() - 0.5) * SIZE * 0.85, cz = (rand() - 0.5) * SIZE * 0.85;
    const cnt = 5 + Math.floor(rand() * 8);
    for (let k = 0; k < cnt && n < kelp.count; k++, n++) {
      const x = cx + (rand() - 0.5) * 10, z = cz + (rand() - 0.5) * 10;
      const h = 6 + rand() * 16;
      v.set(x, floorHeight(x, z) - 0.3, z);
      q.setFromEuler(e.set(0, rand() * 6.3, 0));
      s.set(1 + rand(), h, 1 + rand());
      kelp.setMatrixAt(n, m.compose(v, q, s));
      kelp.setColorAt(n, c.setHSL(0.27 + rand() * 0.08, 0.45, 0.32 + rand() * 0.12));
    }
  }
  kelp.count = n;
  group.add(kelp);

  // ---- marine snow: points in a box that follows the camera, wrapped in the shader (no CPU work)
  const SNOW = 900, BOX = 60;
  const sp = new Float32Array(SNOW * 3);
  for (let i = 0; i < sp.length; i++) sp[i] = rand() * BOX;
  const snowGeo = new THREE.BufferGeometry();
  snowGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  snowGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);   // never culled
  const uCam = { value: new THREE.Vector3() };
  const snowMat = new THREE.PointsMaterial({ color: 0xcfeeff, size: 0.18, transparent: true, opacity: 0.55, depthWrite: false });
  snowMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime; sh.uniforms.uCam = uCam;
    sh.vertexShader = 'uniform float uTime;\nuniform vec3 uCam;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
      vec3 transformed = position + vec3(sin(uTime * 0.3 + position.y) * 0.6, -uTime * 0.25, 0.0);
      transformed = mod(transformed - uCam + ${(BOX / 2).toFixed(1)}, ${BOX.toFixed(1)}) + uCam - ${(BOX / 2).toFixed(1)};`);
  };
  group.add(new THREE.Points(snowGeo, snowMat));

  scene.add(group);
  return {
    update(t, camPos) { uTime.value = t; uCam.value.copy(camPos); },
  };
}
