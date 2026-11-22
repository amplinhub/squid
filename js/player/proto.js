// Stage 0 placeholder squid: a simple low-poly body with wiggling tentacles and arcade swimming, only to
// test controls, camera and the loop on real devices. The real squid with the original movement model
// arrives in stage 2.
import * as THREE from 'three';
import { floorHeight } from '../world/testScene.js';

const TURN = 2.2;          // rad/s
const PITCH_SPEED = 9;     // m/s vertical
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
  let yaw = Math.PI, prevYaw = yaw, speed = 0, vy = 0, tilt = 0, boostT = 0, phase = 0;

  return {
    pos, get yaw() { return yaw; }, get speed() { return speed; },
    step(dt, inp) {
      prevPos.copy(pos); prevYaw = yaw;
      yaw += inp.turn * TURN * dt;
      if (inp.boostHit && boostT <= 0) boostT = 0.6;
      boostT -= dt;
      const target = boostT > 0 ? BOOST : inp.swim ? SWIM : inp.back ? -BACK : 0;
      speed += (target - speed) * Math.min(1, dt * (boostT > 0 ? 6 : 1.6));
      vy += (inp.pitch * PITCH_SPEED - vy) * Math.min(1, dt * 3);
      tilt += (inp.turn * 0.45 - tilt) * Math.min(1, dt * 4);
      pos.x += Math.sin(yaw) * speed * dt;          // yaw 0 = +Z, model is turned to face it
      pos.z += Math.cos(yaw) * speed * dt;
      pos.y += vy * dt;
      const floor = floorHeight(pos.x, pos.z) + 1.5;
      if (pos.y < floor) { pos.y = floor; vy = Math.max(vy, 0); }
      if (pos.y > -2) { pos.y = -2; vy = Math.min(vy, 0); }
      const lim = 110;                                // stay on the test patch
      pos.x = THREE.MathUtils.clamp(pos.x, -lim, lim);
      pos.z = THREE.MathUtils.clamp(pos.z, -lim, lim);
      phase += dt * (3 + Math.abs(speed) * 0.35);
    },
    // a: interpolation factor between the previous and the current simulation step
    render(a) {
      root.position.lerpVectors(prevPos, pos, a);
      root.rotation.set(-vy * 0.05, prevYaw + (yaw - prevYaw) * a + Math.PI, -tilt, 'YXZ');
      for (const t of tentacles) {
        const w = Math.sin(phase - t.userData.a * 0.5) * 0.25;
        t.rotation.set(Math.sin(t.userData.a) * (0.18 + w), Math.cos(t.userData.a) * (0.18 + w), 0);
      }
    },
    renderPos(a, out) { return out.lerpVectors(prevPos, pos, a); },
    renderYaw(a) { return prevYaw + (yaw - prevYaw) * a; },
  };
}
