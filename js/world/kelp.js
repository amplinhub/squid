// Kelp / seaweed - port of scr_build_kelp (04_models.gml). The original drew a 16-frame flipbook per
// plant; here each variant is one mesh and the sway (same formula, kd_x / kd_y) runs in the vertex
// shader, smooth instead of 16 steps, with no CPU work per plant. Plants are InstancedMesh per chunk.
import * as THREE from 'three';
import { MeshBuilder, rgb, merge, mul } from '../mesh/builder.js';
import { makeRng } from './terrain.js';

function buildVariant(v) {
  const b = new MeshBuilder(makeRng(1000 + v), 512);
  b.jit = 0.1;
  if (v === 0) {
    // giant kelp: stem with alternating blades and gas bladders
    const n = 12;
    for (let i = 0; i < n; i++) {
      const z0 = i / n, z1 = (i + 1) / n;
      b.tube(0, 0, z0, 0, 0, z1, 0.010 + (0.004 - 0.010) * z0, 0.010 + (0.004 - 0.010) * z1, 3, merge(rgb(84, 70, 34), rgb(120, 120, 46), z0));
      if (i >= 1) {
        const a = i * 2.4, bl = 0.12 * (1 - z0 * 0.35), bw = 0.032;
        const bx = 0, by = 0, bz = z1;
        const tx = bx + Math.cos(a) * bl, ty = by + Math.sin(a) * bl, tz = bz + bl * 0.75;
        const nx = -Math.sin(a) * bw, ny = Math.cos(a) * bw;
        const col = merge(rgb(70, 96, 30), rgb(166, 176, 58), z1);
        b.mode = 2;
        b.tri(bx, by, bz, (bx + tx) / 2 + nx, (by + ty) / 2 + ny, (bz + tz) / 2, tx, ty, tz, col);
        b.tri(bx, by, bz, (bx + tx) / 2 - nx, (by + ty) / 2 - ny, (bz + tz) / 2, tx, ty, tz, mul(col, 0.85));
        b.octa(bx + Math.cos(a) * 0.012, by + Math.sin(a) * 0.012, bz + 0.006, 0.009, 0.009, 0.011, rgb(150, 140, 50));
      }
    }
  } else if (v === 1) {
    // red ribbon algae: several twisting strands
    for (let s = 0; s < 5; s++) {
      const a = s * 2 * Math.PI / 5 + 0.3, w = 0.05, n = 7;
      let x0 = Math.cos(a) * 0.03, y0 = Math.sin(a) * 0.03, z0 = 0;
      for (let seg = 0; seg < n; seg++) {
        const z1 = (seg + 1) / n * (0.65 + 0.35 * ((s * 0.37) % 1));
        const x1 = Math.cos(a) * (0.03 + z1 * 0.18), y1 = Math.sin(a) * (0.03 + z1 * 0.18);
        const nx = -Math.sin(a + seg * 0.5) * w, ny = Math.cos(a + seg * 0.5) * w;
        b.mode = 2;
        b.quad(x0 - nx * 0.7, y0 - ny * 0.7, z0, x0 + nx * 0.7, y0 + ny * 0.7, z0, x1 + nx, y1 + ny, z1, x1 - nx, y1 - ny, z1, merge(rgb(120, 28, 58), rgb(220, 80, 110), z1));
        x0 = x1; y0 = y1; z0 = z1;
      }
    }
  } else {
    // eelgrass bunch: long thin blades fanning out
    for (let s = 0; s < 10; s++) {
      const a = s * 2.39996, w = 0.014, n = 6;
      let x0 = Math.cos(a) * 0.02, y0 = Math.sin(a) * 0.02, z0 = 0;
      for (let seg = 0; seg < n; seg++) {
        const z1 = (seg + 1) / n * (0.6 + 0.4 * ((s * 0.61) % 1));
        const x1 = Math.cos(a) * z1 * 0.22, y1 = Math.sin(a) * z1 * 0.22;
        const nx = -Math.sin(a) * w, ny = Math.cos(a) * w;
        b.mode = 2;
        b.quad(x0 - nx, y0 - ny, z0, x0 + nx, y0 + ny, z0, x1 + nx * 0.6, y1 + ny * 0.6, z1, x1 - nx * 0.6, y1 - ny * 0.6, z1, merge(rgb(40, 110, 50), rgb(150, 200, 90), z1));
        x0 = x1; y0 = y1; z0 = z1;
      }
    }
  }
  return b.geometry();
}

export function createKelpKit(uTime) {
  const geos = [0, 1, 2].map(buildVariant);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      // per plant speed and phase from its position (the original stored them per plant)
      vec2 ip = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
      float hh = fract(sin(dot(ip, vec2(12.9898, 78.233))) * 43758.5453);
      float ph = uTime * 2.159 * (0.8 + 0.45 * hh) + hh * 6.2832;
      float h = max(position.y, 0.0);
      float hp = pow(h, 1.6);
      transformed.x += 0.07 * hp * sin(ph + h * 2.4);
      transformed.z += 0.03 * hp * cos(ph + h * 1.9 + 1.0);`);
  };
  return { geos, mat };
}

// kelp list of a chunk: flat array (variant, x, y, z, height, width, rot) in game coordinates
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), tr = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
export function makeKelpMeshes(kit, list) {
  const meshes = [];
  for (let v = 0; v < 3; v++) {
    let n = 0;
    for (let i = 0; i < list.length; i += 7) if (list[i] === v) n++;
    if (!n) continue;
    const m = new THREE.InstancedMesh(kit.geos[v], kit.mat, n);
    let k = 0;
    for (let i = 0; i < list.length; i += 7) {
      if (list[i] !== v) continue;
      const ks = list[i + 4], kw = list[i + 5];
      q.setFromAxisAngle(up, -list[i + 6] * Math.PI / 180);
      m.setMatrixAt(k++, m4.compose(tr.set(list[i + 1], list[i + 3], list[i + 2]), q, sc.set(ks * kw, ks, ks * kw)));
    }
    m.computeBoundingSphere();
    meshes.push(m);
  }
  return meshes;
}
