// Transform helpers: build matrices in game space (x, y horizontal, z up; yaw / pitch / roll as the original
// applies rotation_x(roll), rotation_y(pitch), rotation_z(yaw)) and convert them to three.js space.
import * as THREE from 'three';

export const P = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1);   // game <-> three axis swap
const gm = new THREE.Matrix4();

// body axes for yaw / pitch / roll in radians: forward f, side Y, up u (right-handed)
export function axes(yaw, pitch, roll) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
  const f = [cp * cy, -cp * sy, sp], r0 = [sy, cy, 0], u0 = [-sp * cy, sp * sy, cp];
  const u = [u0[0] * cr + r0[0] * sr, u0[1] * cr + r0[1] * sr, u0[2] * cr];
  const Y = [u[1] * f[2] - u[2] * f[1], u[2] * f[0] - u[0] * f[2], u[0] * f[1] - u[1] * f[0]];
  return { f, Y, u };
}

// game-space matrix with basis f, Y, u scaled by sx, sy, sz at (x, y, z)
export function gameMatrix(out, x, y, z, f, Y, u, sx = 1, sy = 1, sz = 1) {
  return out.set(f[0] * sx, Y[0] * sy, u[0] * sz, x, f[1] * sx, Y[1] * sy, u[1] * sz, y, f[2] * sx, Y[2] * sy, u[2] * sz, z, 0, 0, 0, 1);
}
// game-space matrix -> three.js object matrix
export const toThree = (out, m) => out.copy(P).multiply(m).multiply(P);

// a unit frustum model (local x 0..1, radius 1) stretched between two points (scr_seg_draw)
export function segMatrix(out, x1, y1, z1, x2, y2, z2, rad) {
  const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1, l = Math.hypot(dx, dy, dz);
  if (l < 0.001) return out.makeScale(0, 0, 0);
  const f = [dx / l, dy / l, dz / l];
  let s = [-f[1], f[0], 0];
  const sl = Math.hypot(s[0], s[1]);
  s = sl < 1e-4 ? [0, 1, 0] : [s[0] / sl, s[1] / sl, 0];
  const u = [f[1] * s[2] - f[2] * s[1], f[2] * s[0] - f[0] * s[2], f[0] * s[1] - f[1] * s[0]];
  return toThree(out, gameMatrix(gm, x1, y1, z1, f, s, u, l, rad, rad));
}
