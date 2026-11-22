// Image loading that never hangs the game: fetch + createImageBitmap (decoded off the main thread), an
// <img> element as the fallback, and a time limit - a picture that does not arrive is simply left out.
import * as THREE from 'three';

export function loadImage(src, timeoutMs = 8000) {
  const viaBitmap = fetch(src).then((r) => (r.ok ? r.blob() : Promise.reject(r.status))).then((b) => createImageBitmap(b));
  const viaImg = () => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const timeout = new Promise((res) => setTimeout(() => res(null), timeoutMs));
  return Promise.race([viaBitmap.catch(() => viaImg()).catch(() => null), timeout]);
}

// a three.js texture that fills in when its picture has arrived
export function loadTexture(src) {
  const tex = new THREE.Texture();
  loadImage(src).then((im) => { if (im) { tex.image = im; tex.flipY = false; tex.needsUpdate = true; } });
  return tex;
}
