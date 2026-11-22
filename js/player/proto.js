// Stage 0 placeholder squid: a simple low-poly body with wiggling tentacles and arcade swimming, only to
// test controls, camera and the loop on real devices. The real squid with the original movement model
// arrives in stage 2.
import * as THREE from 'three';
import { floorHeight } from '../world/testScene.js';

const TURN = 2.2;          // rad/s
const PITCH_RATE = 1.4;    // rad/s nose up / down
const PITCH_MAX = 1.25;    // ~72 degrees, never straight up or down
const SWIM = 14, BOOST = 30, BACK = 5;

function buildBody() {
  const root = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xe07a5a, flatShading: true });
  // the model looks along -Z (three.js forward)
  const mantle = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.2, 7), mat);
  mantle.rotation.x = -Math.PI / 2; mantle.position.z = -1.2;
  root.add(mantle);
  const fins = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.9, 4), mat);
  fins.rotation.x = -Math.PI / 2; fins.scale.set(1, 1, 0.15); fins.position.z = -2.4;
  root.add(fins);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 0), mat);
  head.position.z = 0.6;
  root.add(head);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x101820 });
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), eyeMat);
    eye.position.set(sx * 0.62, 0.15, 0.7);
    root.add(eye);
  }
  const tentacles = [];
  const tMat = new THREE.MeshLambertMaterial({ color: 0xd06a4c, flatShading: true });
  const tGeo = new THREE.ConeGeometry(0.13, 2.4, 4);
  tGeo.rotateX(Math.PI / 2); tGeo.translate(0, 0, 1.2);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const t = new THREE.Mesh(tGeo, tMat);
    t.position.set(Math.cos(a) * 0.4, Math.sin(a) * 0.4, 1.1);
    t.userData.a = a;
    root.add(t); tentacles.push(t);
  }
  return { root, tentacles };
}

export function createProtoSquid(scene) {
  const { root, tentacles } = buildBody();
  scene.add(root);
  const pos = new THREE.Vector3(0, -40, 30), prevPos = pos.clone();
  // direction = yaw (around the vertical) + pitch (nose up / down). The stick only turns the squid;
  // it moves, wherever the nose points, only while Swim or Dash is pressed.
  let yaw = Math.PI, prevYaw = yaw, pitch = 0, prevPitch = 0, speed = 0, tilt = 0, boostT = 0, phase = 0;
  const dir = new THREE.Vector3();

  return {
    pos, get yaw() { return yaw; }, get pitch() { return pitch; }, get speed() { return speed; },
    step(dt, inp) {
      prevPos.copy(pos); prevYaw = yaw; prevPitch = pitch;
      yaw += inp.turn * TURN * dt;
      pitch = THREE.MathUtils.clamp(pitch + inp.pitch * PITCH_RATE * dt, -PITCH_MAX, PITCH_MAX);
      if (inp.boostHit && boostT <= 0) boostT = 0.6;
      boostT -= dt;
      const target = boostT > 0 ? BOOST : inp.swim ? SWIM : inp.back ? -BACK : 0;
      speed += (target - speed) * Math.min(1, dt * (boostT > 0 ? 6 : 1.6));
      tilt += (inp.turn * 0.45 - tilt) * Math.min(1, dt * 4);
      dir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      pos.addScaledVector(dir, speed * dt);
      const floor = floorHeight(pos.x, pos.z) + 1.5;
      if (pos.y < floor) pos.y = floor;              // slides along the bottom instead of sinking in
      if (pos.y > -2) pos.y = -2;
      const lim = 110;                                // stay on the test patch
      pos.x = THREE.MathUtils.clamp(pos.x, -lim, lim);
      pos.z = THREE.MathUtils.clamp(pos.z, -lim, lim);
      phase += dt * (3 + Math.abs(speed) * 0.35);
    },
    // a: interpolation factor between the previous and the current simulation step
    render(a) {
      root.position.lerpVectors(prevPos, pos, a);
      // the nose (mantle tip) looks along -Z: turn the model round, then raise / lower the nose
      root.rotation.set(prevPitch + (pitch - prevPitch) * a, prevYaw + (yaw - prevYaw) * a + Math.PI, -tilt, 'YXZ');
      for (const t of tentacles) {
        const w = Math.sin(phase - t.userData.a * 0.5) * 0.25;
        t.rotation.set(Math.sin(t.userData.a) * (0.18 + w), Math.cos(t.userData.a) * (0.18 + w), 0);
      }
    },
    renderPos(a, out) { return out.lerpVectors(prevPos, pos, a); },
    renderYaw(a) { return prevYaw + (yaw - prevYaw) * a; },
    renderPitch(a) { return prevPitch + (pitch - prevPitch) * a; },
  };
}
