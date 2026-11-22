// Quality presets and the automatic choice. "Auto" starts from the device class (phones on medium,
// desktops on high), then watches the real frame time and steps down when frames take too long,
// or back up after a long calm stretch.
// viewMult and gfx are the original's graphics settings (17_menu.gml): view range x0.8 / x1 / x1.15,
// gfx 0 has no caustics, marine snow or light shafts; buildMs is the world generation budget per frame
export const PRESETS = [
  { name: 'low',  pixelRatio: 1.0, viewMult: 0.8,  gfx: 0, antialias: false, particles: 70,  buildMs: 3 },
  { name: 'mid',  pixelRatio: 1.5, viewMult: 1.0,  gfx: 1, antialias: false, particles: 90,  buildMs: 4 },
  { name: 'high', pixelRatio: 2.0, viewMult: 1.15, gfx: 2, antialias: true,  particles: 170, buildMs: 5 },
];

const isPhone = matchMedia('(pointer: coarse)').matches;
let mode = 'auto';
let level = isPhone ? 1 : 2;
try {
  const s = localStorage.getItem('growup.quality');
  if (s !== null) { mode = s; if (s !== 'auto') level = +s; }
} catch (e) { /* no storage */ }

let avg = 1 / 60;           // smoothed frame time
let calm = 0;               // seconds in a row with comfortable frame times
let cooldown = 3;           // no decisions right after start or a change
let ceiling = PRESETS.length - 1;
const listeners = [];

export const quality = () => PRESETS[level];
export const qualityLevel = () => level;
export const qualityMode = () => mode;
export const onQualityChange = (fn) => listeners.push(fn);

function setLevel(l) {
  l = Math.max(0, Math.min(PRESETS.length - 1, l));
  if (l === level) return;
  level = l; cooldown = 3; calm = 0;
  listeners.forEach((fn) => fn(PRESETS[level]));
}

export function setQualityMode(m) {
  mode = m;
  try { localStorage.setItem('growup.quality', m); } catch (e) { /* not remembered */ }
  if (m !== 'auto') setLevel(+m);
}

// dt: real seconds of the last display frame
export function qualityTick(dt) {
  avg += (dt - avg) * 0.05;
  if (mode !== 'auto') return;
  cooldown -= dt;
  if (cooldown > 0) return;
  // below ~45 fps on average (a 50 Hz display running smoothly must not count as slow)
  // a level that proved too slow becomes the ceiling, so auto never bounces between two levels
  if (avg > 1 / 45) { ceiling = level - 1; setLevel(level - 1); return; }
  if (avg < 1 / 48) calm += dt; else calm = 0;
  if (calm > 20 && level < ceiling) setLevel(level + 1);
}

export const frameTime = () => avg;
