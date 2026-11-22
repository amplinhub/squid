// Mesh builder with baked lighting - port of 02_mesh.gml.
// Every face is lit once on the CPU: colour = base * (ambient + diffuse * N.L) * small random jitter, so the
// GPU only draws vertex colours (MeshBasicMaterial) - the cheapest possible shading and exactly the look
// of the original. Input coordinates are game ones (x, y, z up); output is three.js (x, z, y).
// Normal orientation does not rely on winding:
//   mode 0 - outward from a reference point (set by ref()),  mode 1 - facing up,  mode 2 - as given.
import * as THREE from 'three';
import { depthT } from '../world/terrain.js';

// ---- colours: [r, g, b] 0..255 in sRGB, like GM make_color_rgb
export const rgb = (r, g, b) => [r, g, b];
export const merge = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mul = (c, k) => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];
export const WHITE = [255, 255, 255];
// colours stay in raw sRGB like in Game Maker (colour management is off, see renderer.js)
const toLin = (v) => (v < 0 ? 0 : v > 255 ? 1 : v / 255);

// baked light (model space) and the world sun for terrain / decor
const L = { x: 0.22, y: 0.28, z: 0.93, amb: 0.46, dif: 0.64 };
const S = { x: 0.35, y: -0.30, z: 0.89 };

export class MeshBuilder {
  constructor(rng, capacity = 4096) {
    this.rng = rng;
    this.pos = new Float32Array(capacity * 9);
    this.col = new Float32Array(capacity * 9);
    this.up = null;            // optional per-vertex "faces up" factor (caustics on the seabed)
    this.n = 0;                // triangles
    this.reset();
  }
  reset() {
    this.alpha = 1; this.jit = 0.07; this.mode = 0;
    this.rx = 0; this.ry = 0; this.rz = 0;
    this.tf = false; this.rl = false;
    this.world = false;        // world sun + depth darkening (terrain, decor)
    this.hd = false;
  }
  withUp() { this.up = new Float32Array(this.pos.length / 3); return this; }
  grow() {
    const g = (a) => { const b = new Float32Array(a.length * 2); b.set(a); return b; };
    this.pos = g(this.pos); this.col = g(this.col); if (this.up) this.up = g(this.up);
  }

  // placement for the following triangles (local -> world): offset, yaw in degrees, scale
  place(ox, oy, oz, yawDeg, sx, sy, sz) {
    this.tf = true; this.ox = ox; this.oy = oy; this.oz = oz;
    const a = yawDeg * Math.PI / 180; this.c = Math.cos(a); this.s = Math.sin(a);
    this.sx = sx; this.sy = sy; this.sz = sz;
  }
  // whole-model heel (about x) and trim (about y) for everything written next
  tilt(heelDeg, trimDeg) {
    this.rl = true;
    const h = heelDeg * Math.PI / 180, t = trimDeg * Math.PI / 180;
    this.rc = Math.cos(h); this.rs = Math.sin(h); this.pc = Math.cos(t); this.ps = Math.sin(t);
  }
  ref(x, y, z) {
    if (this.tf) {
      const lx = x * this.sx, ly = y * this.sy;
      this.rx = this.ox + lx * this.c - ly * this.s; this.ry = this.oy + lx * this.s + ly * this.c; this.rz = this.oz + z * this.sz;
    } else { this.rx = x; this.ry = y; this.rz = z; }
    if (this.rl) {
      let t = this.ry; this.ry = t * this.rc - this.rz * this.rs; this.rz = t * this.rs + this.rz * this.rc;
      t = this.rx; this.rx = t * this.pc - this.rz * this.ps; this.rz = t * this.ps + this.rz * this.pc;
    }
    this.mode = 0;
  }

  tri(x1, y1, z1, x2, y2, z2, x3, y3, z3, col) {
    if (this.tf) {
      x1 *= this.sx; y1 *= this.sy; z1 *= this.sz; x2 *= this.sx; y2 *= this.sy; z2 *= this.sz; x3 *= this.sx; y3 *= this.sy; z3 *= this.sz;
      let t = x1; x1 = this.ox + t * this.c - y1 * this.s; y1 = this.oy + t * this.s + y1 * this.c; z1 += this.oz;
      t = x2; x2 = this.ox + t * this.c - y2 * this.s; y2 = this.oy + t * this.s + y2 * this.c; z2 += this.oz;
      t = x3; x3 = this.ox + t * this.c - y3 * this.s; y3 = this.oy + t * this.s + y3 * this.c; z3 += this.oz;
    }
    if (this.rl) {
      let t = y1; y1 = t * this.rc - z1 * this.rs; z1 = t * this.rs + z1 * this.rc;
      t = y2; y2 = t * this.rc - z2 * this.rs; z2 = t * this.rs + z2 * this.rc;
      t = y3; y3 = t * this.rc - z3 * this.rs; z3 = t * this.rs + z3 * this.rc;
      t = x1; x1 = t * this.pc - z1 * this.ps; z1 = t * this.ps + z1 * this.pc;
      t = x2; x2 = t * this.pc - z2 * this.ps; z2 = t * this.ps + z2 * this.pc;
      t = x3; x3 = t * this.pc - z3 * this.ps; z3 = t * this.ps + z3 * this.pc;
    }
    const ux = x2 - x1, uy = y2 - y1, uz = z2 - z1, vx = x3 - x1, vy = y3 - y1, vz = z3 - z1;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (l < 1e-7) return;
    nx /= l; ny /= l; nz /= l;
    const cz = (z1 + z2 + z3) / 3;
    let flipped = false;
    if (this.mode === 0) {
      const cx = (x1 + x2 + x3) / 3, cy = (y1 + y2 + y3) / 3;
      if ((cx - this.rx) * nx + (cy - this.ry) * ny + (cz - this.rz) * nz < 0) { nx = -nx; ny = -ny; nz = -nz; flipped = true; }
    } else if (this.mode === 1 && nz < 0) { nx = -nx; ny = -ny; nz = -nz; flipped = true; }
    // the axis swap to three.js mirrors the winding: order the vertices so the front face looks along the
    // oriented normal (so one-sided materials can cull back faces)
    if (!flipped) { let t = x2; x2 = x3; x3 = t; t = y2; y2 = y3; y3 = t; t = z2; z2 = z3; z3 = t; }
    let lit;
    if (this.world) {
      lit = 0.50 + 0.62 * Math.max(0, nx * S.x + ny * S.y + nz * S.z) + 0.10 * Math.max(0, -nz);
      lit *= 1.05 + (0.42 - 1.05) * depthT(cz);
    } else {
      lit = L.amb + L.dif * Math.max(0, nx * L.x + ny * L.y + nz * L.z) + 0.12 * Math.max(0, -nz);
    }
    lit *= 1 + (this.rng.next() * 2 - 1) * this.jit;
    if (this.n * 9 + 9 > this.pos.length) this.grow();
    const r = toLin(Math.min(255, col[0] * lit)), g = toLin(Math.min(255, col[1] * lit)), b = toLin(Math.min(255, col[2] * lit));
    const p = this.pos, c = this.col, o = this.n * 9;
    // game (x, y, z) -> three (x, z, y)
    p[o] = x1; p[o + 1] = z1; p[o + 2] = y1;
    p[o + 3] = x2; p[o + 4] = z2; p[o + 5] = y2;
    p[o + 6] = x3; p[o + 7] = z3; p[o + 8] = y3;
    for (let k = 0; k < 9; k += 3) { c[o + k] = r; c[o + k + 1] = g; c[o + k + 2] = b; }
    if (this.up) { const u = Math.max(0, nz) ** 2, q = this.n * 3; this.up[q] = u; this.up[q + 1] = u; this.up[q + 2] = u; }
    this.n++;
  }

  quad(x1, y1, z1, x2, y2, z2, x3, y3, z3, x4, y4, z4, col) {
    this.tri(x1, y1, z1, x2, y2, z2, x3, y3, z3, col);
    this.tri(x1, y1, z1, x3, y3, z3, x4, y4, z4, col);
  }

  // low-poly gem (eyes, pearls, polyps)
  octa(x0, y0, z0, a, b, c, col) {
    if (this.hd) { this.blob(x0, y0, z0, a, b, c, 4, 8, 0, col, null); return; }
    this.ref(x0, y0, z0);
    for (const sz of [c, -c]) {
      this.tri(x0 + a, y0, z0, x0, y0 + b, z0, x0, y0, z0 + sz, col);
      this.tri(x0, y0 + b, z0, x0 - a, y0, z0, x0, y0, z0 + sz, col);
      this.tri(x0 - a, y0, z0, x0, y0 - b, z0, x0, y0, z0 + sz, col);
      this.tri(x0, y0 - b, z0, x0 + a, y0, z0, x0, y0, z0 + sz, col);
    }
  }

  // tapered prism between two points (stems, branches, spines); r2 = 0 makes a cone
  tube(x1, y1, z1, x2, y2, z2, r1, r2, n, col) {
    let ax = x2 - x1, ay = y2 - y1, az = z2 - z1;
    let l = Math.sqrt(ax * ax + ay * ay + az * az);
    if (l < 1e-4) return;
    ax /= l; ay /= l; az /= l;
    let px, py, pz;
    if (Math.abs(az) < 0.9) { px = -ay; py = ax; pz = 0; } else { px = 0; py = -az; pz = ay; }
    l = Math.sqrt(px * px + py * py + pz * pz); px /= l; py /= l; pz /= l;
    const qx = ay * pz - az * py, qy = az * px - ax * pz, qz = ax * py - ay * px;
    if (this.hd) n = Math.min(n * 2, 10);
    this.ref((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    for (let i = 0; i < n; i++) {
      const a0 = i * 2 * Math.PI / n, a1 = (i + 1) * 2 * Math.PI / n;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const e0x = px * c0 + qx * s0, e0y = py * c0 + qy * s0, e0z = pz * c0 + qz * s0;
      const e1x = px * c1 + qx * s1, e1y = py * c1 + qy * s1, e1z = pz * c1 + qz * s1;
      if (r2 > 0.001) {
        this.quad(x1 + e0x * r1, y1 + e0y * r1, z1 + e0z * r1, x1 + e1x * r1, y1 + e1y * r1, z1 + e1z * r1,
                  x2 + e1x * r2, y2 + e1y * r2, z2 + e1z * r2, x2 + e0x * r2, y2 + e0y * r2, z2 + e0z * r2, col);
      } else {
        this.tri(x1 + e0x * r1, y1 + e0y * r1, z1 + e0z * r1, x1 + e1x * r1, y1 + e1y * r1, z1 + e1z * r1, x2, y2, z2, col);
      }
    }
  }

  // lumpy low-poly ellipsoid (rocks, sponges, coral heads); col2: colour of the upper half (moss / sand)
  blob(x0, y0, z0, rx, ry, rz, nr, ns, jit, col, col2) {
    const bj = [];
    for (let i = 0; i <= nr; i++) {
      bj[i] = [];
      for (let k = 0; k < ns; k++) bj[i][k] = (i === 0 || i === nr) ? 1 : 1 + (this.rng.next() * 2 - 1) * jit;
      bj[i][ns] = bj[i][0];
    }
    this.ref(x0, y0, z0);
    for (let i = 0; i < nr; i++) {
      const th0 = Math.PI * i / nr - Math.PI / 2, th1 = Math.PI * (i + 1) / nr - Math.PI / 2;
      const ct0 = Math.cos(th0), st0 = Math.sin(th0), ct1 = Math.cos(th1), st1 = Math.sin(th1);
      for (let k = 0; k < ns; k++) {
        const ph0 = 2 * Math.PI * k / ns, ph1 = 2 * Math.PI * (k + 1) / ns;
        const cp0 = Math.cos(ph0), sp0 = Math.sin(ph0), cp1 = Math.cos(ph1), sp1 = Math.sin(ph1);
        let rr = bj[i][k];
        const p00x = x0 + ct0 * cp0 * rx * rr, p00y = y0 + ct0 * sp0 * ry * rr, p00z = z0 + st0 * rz * rr;
        rr = bj[i][k + 1];
        const p01x = x0 + ct0 * cp1 * rx * rr, p01y = y0 + ct0 * sp1 * ry * rr, p01z = z0 + st0 * rz * rr;
        rr = bj[i + 1][k];
        const p10x = x0 + ct1 * cp0 * rx * rr, p10y = y0 + ct1 * sp0 * ry * rr, p10z = z0 + st1 * rz * rr;
        rr = bj[i + 1][k + 1];
        const p11x = x0 + ct1 * cp1 * rx * rr, p11y = y0 + ct1 * sp1 * ry * rr, p11z = z0 + st1 * rz * rr;
        const c = (col2 && i >= nr / 2) ? col2 : col;
        if (i > 0) this.tri(p00x, p00y, p00z, p01x, p01y, p01z, p11x, p11y, p11z, c);
        this.tri(p00x, p00y, p00z, p11x, p11y, p11z, p10x, p10y, p10z, c);
      }
    }
  }

  // finished geometry (null when empty)
  geometry() {
    if (this.n === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(0, this.n * 9), 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col.slice(0, this.n * 9), 3));
    if (this.up) g.setAttribute('aUp', new THREE.BufferAttribute(this.up.slice(0, this.n * 3), 1));
    g.computeBoundingSphere();
    return g;
  }
}
