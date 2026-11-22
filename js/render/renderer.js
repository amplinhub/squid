// WebGL renderer and camera. Colour management is off on purpose: all colours are raw sRGB values and all
// blending happens in that space, exactly like the Game Maker original (no lights - lighting is baked
// into vertex colours), which is also the cheapest way to draw.
import * as THREE from 'three';
import { quality, onQualityChange } from '../core/quality.js';

THREE.ColorManagement.enabled = false;

export function createRenderer(canvas) {
  const q = quality();
  // alpha: above the water the canvas is transparent and the 2D sky shows through it
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: q.antialias, alpha: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setClearColor(0x03121c, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 3, 3000);

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, quality().pixelRatio));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  onQualityChange(resize);
  resize();
  return { renderer, scene, camera, resize };
}
