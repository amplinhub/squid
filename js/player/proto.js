// Placeholder squid until stage 2: a simple low-poly body with wiggling tentacles, steering as agreed
// (the stick turns the nose, Swim / Dash move it along the nose). Works in game units: x, y horizontal,
// z up; yaw follows the original convention (forward = cos yaw, -sin yaw), pitch > 0 = nose up.
import * as THREE from 'three';
import { terrainH, SURF_Z, clamp } from '../world/terrain.js';

const TURN = 2.2;          // rad/s
const PITCH_RATE = 1.4;    // rad/s nose up / down
const PITCH_MAX = 1.25;    // ~72 degrees, never straight up or down
const SWIM = 190, BOOST = 420, BACK = 60;   // units/s (original top speed ~3.2 units per step at L = 30)
const MODEL_LEN = 4.6;

function buildBody() {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const mat = new THREE.MeshLambertMaterial({ color: 0xe86246, flatShading: true });
  // the model looks along -Z
  const mantle = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.2, 7), mat);
  mantle.rotation.x = -Math.PI / 2; mantle.position.z = -1.2;
  body.add(mantle);
  const fins = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.9, 4), mat);
  fins.rotation.x = -Math.PI / 2; fins.scale.set(1, 1, 0.15); fins.position.z = -2.4;
  body.add(fins);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 0), mat);
  head.position.z = 0.6;
  body.add(head);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xf2ce54 });
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 0), eyeMat);
    eye.position.set(sx * 0.62, 0.15, 0.7);
    body.add(eye);
  }
  const tentacles = [];
  const tMat = new THREE.MeshLambertMaterial({ color: 0xce604a, flatShading: true });
  const tGeo = new THREE.ConeGeometry(0.13, 2.4, 4);
  tGeo.rotateX(Math.PI / 2); tGeo.translate(0, 0, 1.2);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const t = new THREE.Mesh(tGeo, tMat);
    t.position.set(Math.cos(a) * 0.4, Math.sin(a) * 0.4, 1.1);
    t.userData.a = a;
    body.add(t); tentacles.push(t);
  }
  return { root, body, tentacles };
}

export function createProtoSquid(scene, spawn) {
  const { root, body, tentacles } = buildBody();
  scene.add(root);
  // a little light just for the placeholder (the world itself is unlit, its light is baked)
  scene.add(new THREE.HemisphereLight(0xffffff, 0x506070, 3.2));
  const L = 30;                                   // body length in units (the original starts at 30)
  body.scale.setScalar(L / MODEL_LEN);
  const p = { x: spawn.x, y: spawn.y, z: terrainH(spawn.x, spawn.y) + 170 };
  const prev = { ...p };
  let yaw = Math.random() * Math.PI * 2, prevYaw = yaw, pitch = 0, prevPitch = 0, speed = 0, tilt = 0, boostT = 0, phase = 0;

  return {
    p, L, get yaw() { return yaw; }, get pitch() { return pitch; }, get speed() { return speed; },
    step(dt, inp) {
      prev.x = p.x; prev.y = p.y; prev.z = p.z; prevYaw = yaw; prevPitch = pitch;
      yaw += inp.turn * TURN * dt;
      pitch = clamp(pitch + inp.pitch * PITCH_RATE * dt, -PITCH_MAX, PITCH_MAX);
      if (inp.boostHit && boostT <= 0) boostT = 0.6;
      boostT -= dt;
      const target = boostT > 0 ? BOOST : inp.swim ? SWIM : inp.back ? -BACK : 0;
      speed += (target - speed) * Math.min(1, dt * (boostT > 0 ? 6 : 1.6));
      tilt += (inp.turn * 0.45 - tilt) * Math.min(1, dt * 4);
      const cp = Math.cos(pitch);
      p.x += Math.cos(yaw) * cp * speed * dt;
      p.y -= Math.sin(yaw) * cp * speed * dt;
      p.z += Math.sin(pitch) * speed * dt;
      const floor = terrainH(p.x, p.y) + L * 0.4;
      if (p.z < floor) p.z = floor;                  // slides along the bottom instead of sinking in
      if (p.z > SURF_Z - L * 0.3) p.z = SURF_Z - L * 0.3;
      phase += dt * (3 + Math.abs(speed) * 0.02);
    },
    // a: interpolation factor between the previous and the current simulation step
    render(a) {
      root.position.set(prev.x + (p.x - prev.x) * a, prev.z + (p.z - prev.z) * a, prev.y + (p.y - prev.y) * a);
      // game yaw -> three: nose (-Z) turned to (cos yaw, 0, -sin yaw), then raised by pitch
      root.rotation.set(prevPitch + (pitch - prevPitch) * a, prevYaw + (yaw - prevYaw) * a - Math.PI / 2, -tilt, 'YXZ');
      for (const t of tentacles) {
        const w = Math.sin(phase - t.userData.a * 0.5) * 0.25;
        t.rotation.set(Math.sin(t.userData.a) * (0.18 + w), Math.cos(t.userData.a) * (0.18 + w), 0);
      }
    },
    renderPos(a) { return { x: prev.x + (p.x - prev.x) * a, y: prev.y + (p.y - prev.y) * a, z: prev.z + (p.z - prev.z) * a }; },
    renderYaw(a) { return prevYaw + (yaw - prevYaw) * a; },
    renderPitch(a) { return prevPitch + (pitch - prevPitch) * a; },
  };
}
