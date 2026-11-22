// Progress kept in the browser (synced with the account at the leaderboard stage): missions done, missions
// done as the nautilus, the chosen creature. Unlocking as in the original (26_misc.gml): the nautilus after
// 4 missions, the octopus after 6 missions completed as the nautilus.
// A testing link with ?dev=1 opens every creature on that device (remembered; ?dev=0 turns it off).
const KEY = 'growup.progress';
const REQ = [0, 4, 6];

let p = { missions: 0, missionsNaut: 0, char: 0, unlocked: [true, false, false] };
try { Object.assign(p, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* fresh */ }

let dev = false;
try {
  const q = new URLSearchParams(location.search).get('dev');
  if (q === '1') localStorage.setItem('growup.dev', '1');
  if (q === '0') localStorage.removeItem('growup.dev');
  dev = localStorage.getItem('growup.dev') === '1';
} catch (e) { /* no storage */ }

const save = () => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* not remembered */ } };

export const progress = p;
export const isDev = () => dev;
export function isUnlocked(c) {
  if (dev || c === 0) return true;
  return !!p.unlocked[c] || (c === 1 ? p.missions : p.missionsNaut) >= REQ[c];
}
export function setChar(c) { p.char = c; save(); }
export function chosenChar() { return isUnlocked(p.char) ? p.char : 0; }
// a mission was completed with creature c; returns the creature unlocked by it, or -1
export function missionDone(c) {
  p.missions++;
  if (c === 1) p.missionsNaut++;
  let opened = -1;
  for (let k = 1; k < 3; k++) if (!p.unlocked[k] && (k === 1 ? p.missions : p.missionsNaut) >= REQ[k]) { p.unlocked[k] = true; opened = k; }
  save();
  return opened;
}
export const required = (c) => REQ[c];
