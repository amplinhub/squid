// Image loading that never hangs the game: fetch + createImageBitmap (decoded off the main thread), an
// <img> element as the fallback, and a time limit - a picture that does not arrive is simply left out.
// Every picture is downloaded once, however many parts of the game ask for it.
import * as THREE from 'three';

const cache = new Map();

export function loadImage(src, timeoutMs = 20000) {
  if (!cache.has(src)) {
    const viaBitmap = fetch(src).then((r) => (r.ok ? r.blob() : Promise.reject(r.status))).then((b) => createImageBitmap(b));
    const viaImg = () => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    cache.set(src, viaBitmap.catch(() => viaImg()).catch(() => null));
  }
  const timeout = new Promise((res) => setTimeout(() => res(null), timeoutMs));
  return Promise.race([cache.get(src), timeout]);
}

// the 16 caustic frames, cut out of one 4 x 4 atlas (one download instead of sixteen)
export async function loadCausticFrames(timeoutMs) {
  const atlas = await loadImage('assets/tex/caustics.png', timeoutMs);
  if (!atlas) return null;
  const S = atlas.width / 4;
  return [...Array(16)].map((_, i) => {
    const c = document.createElement('canvas'); c.width = c.height = S;
    c.getContext('2d').drawImage(atlas, (i % 4) * S, Math.floor(i / 4) * S, S, S, 0, 0, S, S);
    return c;
  });
}

// a three.js texture that fills in when its picture has arrived
export function loadTexture(src) {
  const tex = new THREE.Texture();
  loadImage(src).then((im) => { if (im) { tex.image = im; tex.flipY = false; tex.needsUpdate = true; } });
  return tex;
}
