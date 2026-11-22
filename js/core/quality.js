// Quality presets and the automatic choice. "Auto" starts from the device class (phones on medium,
// desktops on high), then watches the real frame time and steps down when frames take too long,
// or back up after a long calm stretch.
export const PRESETS = [
  { name: 'low',  pixelRatio: 1.0,  viewDist: 620, antialias: false, particles: 60 },
  { name: 'mid',  pixelRatio: 1.5,  viewDist: 760, antialias: false, particles: 110 },
  { name: 'high', pixelRatio: 2.0,  viewDist: 900, antialias: true,  particles: 170 },
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
  if (avg > 1 / 50) { setLevel(level - 1); return; }           // below ~50 fps on average
  if (avg < 1 / 58) calm += dt; else calm = 0;
  if (calm > 20 && level < PRESETS.length - 1) setLevel(level + 1);
}

export const frameTime = () => avg;
