// WebGL renderer, camera and the underwater atmosphere (fog + lights). One renderer for the whole game;
// pixel ratio and view distance follow the quality preset.
import * as THREE from 'three';
import { quality, onQualityChange } from '../core/quality.js';

export const WATER = new THREE.Color(0x0b3a52);      // fog / background colour near the surface

export function createRenderer(canvas) {
  const q = quality();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: q.antialias, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(WATER);

  const scene = new THREE.Scene();
  scene.background = WATER.clone();
  scene.fog = new THREE.Fog(WATER.clone(), 20, q.viewDist * 0.32);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.5, q.viewDist * 0.34);

  // soft light from above and a dim cool bounce from below: enough for the flat-shaded low-poly look
  scene.add(new THREE.HemisphereLight(0x9fe6ff, 0x0a2030, 1.15));
  const sun = new THREE.DirectionalLight(0xdff6ff, 1.4);
  sun.position.set(0.3, 1, 0.2);
  scene.add(sun);

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, quality().pixelRatio));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // in portrait the vertical field of view widens so the sides of the world do not get cut off too much
    camera.fov = w < h ? 72 : 60;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  onQualityChange((p) => {
    scene.fog.far = p.viewDist * 0.32;
    camera.far = p.viewDist * 0.34;
    resize();
  });
  resize();

  return { renderer, scene, camera, resize };
}
