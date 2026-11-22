// Game loop: the simulation runs in fixed 1/60 s steps (so the game behaves the same on 60, 90 and 120 Hz
// screens, exactly like the Game Maker original), rendering happens once per display frame with the
// fraction of the next step for interpolation.
export const STEP = 1 / 60;
const MAX_STEPS = 5;            // after a long stall (tab switch) the game does not try to catch up forever

export function startLoop(update, render) {
  let last = performance.now();
  let acc = 0;
  let running = true;
  function frame(now) {
    if (!running) return;
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < MAX_STEPS) { update(STEP); acc -= STEP; n++; }
    if (n === MAX_STEPS) acc = 0;
    render(acc / STEP, dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return {
    stop() { running = false; },
    resume() { if (!running) { running = true; last = performance.now(); acc = 0; requestAnimationFrame(frame); } },
  };
}
