// Input as actions, whatever the device:
//   turn   -1..1  (left / right)
//   pitch  -1..1  (dive / rise)
//   swim   0..1   (forward; on the keyboard W = 1, S = back)
//   back   bool
//   boost, ability, pause: pressed this step (edge) and held
// Keyboard: W/S, A/D or arrows left/right, arrows up/down (Space / Ctrl), Shift, F/X, Esc/P.
// Touch: a floating stick in the left half (x = turn, y = rise / dive), buttons Swim / Boost / Ability.
const keys = new Set();
const held = { boost: false, ability: false, pause: false, swimBtn: false, boostBtn: false, abilityBtn: false };
const prev = { boost: false, ability: false, pause: false };
const state = { turn: 0, pitch: 0, swim: 0, back: false, boost: false, ability: false, pause: false,
                boostHit: false, abilityHit: false, pauseHit: false, touch: false };
const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
let invertY = false;

export function setInvertY(v) { invertY = !!v; }

export function initInput(onTouchDetected) {
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  // the first touch anywhere switches the touch interface on (also on a laptop with a touch screen)
  addEventListener('touchstart', () => { if (!state.touch) { state.touch = true; onTouchDetected?.(); } }, { passive: true });

  const zone = document.getElementById('stick-zone');
  const base = document.getElementById('stick-base');
  const knob = document.getElementById('stick-knob');
  const radius = () => base.offsetWidth * 0.5;
  zone.addEventListener('pointerdown', (e) => {
    if (stick.id !== null) return;
    stick.id = e.pointerId; zone.setPointerCapture(e.pointerId);
    // the stick appears under the thumb
    base.style.left = e.clientX + 'px'; base.style.top = e.clientY + 'px';
    base.classList.add('active');
    stick.ox = e.clientX; stick.oy = e.clientY; stick.x = 0; stick.y = 0;
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== stick.id) return;
    const r = radius();
    let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy;
    const d = Math.hypot(dx, dy);
    if (d > r) { dx *= r / d; dy *= r / d; }
    stick.x = dx / r; stick.y = dy / r;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  });
  const release = (e) => {
    if (e.pointerId !== stick.id) return;
    stick.id = null; stick.x = 0; stick.y = 0;
    knob.style.transform = ''; base.classList.remove('active');
    base.style.left = ''; base.style.top = '';
  };
  zone.addEventListener('pointerup', release);
  zone.addEventListener('pointercancel', release);

  const holdButton = (id, field) => {
    const el = document.getElementById(id);
    const on = (e) => { e.preventDefault(); held[field] = true; el.classList.add('on'); el.setPointerCapture?.(e.pointerId); };
    const off = () => { held[field] = false; el.classList.remove('on'); };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('lostpointercapture', off);
  };
  holdButton('btn-swim', 'swimBtn');
  holdButton('btn-boost', 'boostBtn');
  holdButton('btn-ability', 'abilityBtn');
}

const dead = (v, d = 0.12) => (Math.abs(v) < d ? 0 : (v - Math.sign(v) * d) / (1 - d));

// called once per simulation step
export function pollInput() {
  const k = (c) => keys.has(c);
  let turn = (k('KeyA') || k('ArrowLeft') ? 1 : 0) - (k('KeyD') || k('ArrowRight') ? 1 : 0);
  let pitch = (k('ArrowUp') || k('Space') ? 1 : 0) - (k('ArrowDown') || k('ControlLeft') || k('ControlRight') ? 1 : 0);
  let swim = k('KeyW') ? 1 : 0;
  const back = k('KeyS');
  if (stick.id !== null) {
    turn = -dead(stick.x);
    pitch = -dead(stick.y);
  }
  if (held.swimBtn) swim = 1;
  if (invertY) pitch = -pitch;
  const boost = k('ShiftLeft') || k('ShiftRight') || held.boostBtn;
  const ability = k('KeyF') || k('KeyX') || held.abilityBtn;
  const pause = k('Escape') || k('KeyP');
  state.turn = Math.max(-1, Math.min(1, turn));
  state.pitch = Math.max(-1, Math.min(1, pitch));
  state.swim = swim; state.back = back;
  state.boostHit = boost && !prev.boost; state.abilityHit = ability && !prev.ability; state.pauseHit = pause && !prev.pause;
  state.boost = boost; state.ability = ability; state.pause = pause;
  prev.boost = boost; prev.ability = ability; prev.pause = pause;
  return state;
}

export const input = state;
