// Ribbon messages - port of scr_msg (10_fx.gml): at most 4 at a time, the oldest goes first, each lives
// 3.5 s; the same text is not repeated while it is still fresh.
const LIFE = 210;          // steps (3.5 s)
let box = null;
const items = [];

export function initMessages() {
  box = document.getElementById('msgs');
}

// text, colour [r, g, b]
export function msg(text, col = [255, 255, 255]) {
  if (!box) return;
  const last = items[items.length - 1];
  if (last && last.text === text && last.t > 60) return;
  if (items.length >= 4) { const o = items.shift(); o.el.remove(); }
  const el = document.createElement('div');
  el.className = 'msg';
  el.textContent = text;
  el.style.color = `rgb(${col[0]},${col[1]},${col[2]})`;
  box.appendChild(el);
  items.push({ text, t: LIFE, el });
}

export function msgStep() {
  for (const m of items) {
    m.t--;
    if (m.t < 30) m.el.style.opacity = String(Math.max(0, m.t / 30));
  }
  while (items.length && items[0].t <= 0) items.shift().el.remove();
}

export function msgClear() { while (items.length) items.shift().el.remove(); }
