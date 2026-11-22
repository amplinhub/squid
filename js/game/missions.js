// Missions of a dive - port of 23_missions.gml. Three tasks at a time, picked to fit the creature, its size
// and depth; fed by game events (eating, escaping, ink, shell, divers...) and by polling (depth, growth,
// time, dashing, fullness, distance). A finished task flashes gold, dissolves, and a new one slides in.
// Every finished task counts towards unlocking the nautilus (4); the octopus needs 6 done as the nautilus.
// (Sea mines and seabed finds - tasks 8 and 16 - come with stage 8.)
import { getLang } from '../core/i18n.js';
import { stageIndex, stageName } from '../player/player.js';
import { depthM } from '../world/terrain.js';

const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const choose = (...v) => v[Math.floor(Math.random() * v.length)];
const STAGE_HI = [45, 80, 140, 250, 450, 800];

// "eat N ..." names: genitive plural in Russian, plural in English
const GPL = {
  ru: { 0: 'сардин', 1: 'креветок', 2: 'рыб-бабочек', 3: 'скумбрий', 4: 'груперов', 5: 'барракуд', 9: 'медуз', 11: 'рыб-фугу', 12: 'рыб-клоунов', 16: 'светящихся анчоусов', 21: 'дайверов', 22: 'крабов' },
  en: { 0: 'sardines', 1: 'shrimps', 2: 'butterflyfish', 3: 'mackerels', 4: 'groupers', 5: 'barracudas', 9: 'jellyfish', 11: 'pufferfish', 12: 'clownfish', 16: 'lanternfish', 21: 'divers', 22: 'crabs' },
};

const TXT = {
  ru: {
    0: (p, g, m) => `Съешьте ${GPL.ru[m.par]}: ${p} / ${g}`,
    1: (p, g) => `Опуститесь на глубину ${g} м`,
    2: (p, g) => `Дорастите до звания «${stageName(g)}»`,
    3: (p, g) => `Оторвитесь от хищника: ${p} / ${g}`,
    4: (p, g) => { const r = Math.max(0, Math.floor(g - p)); return `Продержитесь ${g / 60} мин · осталось ${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`; },
    5: () => 'Съешьте 3 существа за 15 секунд',
    6: () => 'Откройте новое существо для бестиария',
    7: (p, g) => `Съешьте любых существ: ${p} / ${g}`,
    9: () => 'Проглотите добычу больше половины своего роста',
    10: (p, g) => `Проплывите рывком ${g} с: ${Math.floor(p)} / ${g}`,
    11: () => 'Съешьте рыбу-фугу, пока она не раздулась',
    12: () => 'Наешьтесь досыта: сытость 100%',
    13: (p, g, m, ch) => (ch === 2 ? 'Ослепите хищника чернилами' : ch === 1 ? `Выдержите укусы в раковине: ${p} / ${g}` : `Проплывите ${g} м: ${Math.floor(p)} / ${g}`),
    14: (p, g, m) => (m.par ? 'Съешьте дайвера' : `Напугайте дайверов на рифе: ${p} / ${g}`),
    15: () => 'Поднимитесь к самой поверхности',
    done: 'Выполнено!', head: 'ЗАДАНИЯ', doneN: 'выполнено', to: 'до персонажа',
    octNote: (k) => `Осьминог откроется за ${k} заданий, выполненных за наутилуса`,
  },
  en: {
    0: (p, g, m) => `Eat ${GPL.en[m.par]}: ${p} / ${g}`,
    1: (p, g) => `Dive to ${g} m`,
    2: (p, g) => `Grow to «${stageName(g)}»`,
    3: (p, g) => `Escape from a predator: ${p} / ${g}`,
    4: (p, g) => { const r = Math.max(0, Math.floor(g - p)); return `Survive ${g / 60} min · ${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')} left`; },
    5: () => 'Eat 3 creatures within 15 seconds',
    6: () => 'Discover a new creature for the bestiary',
    7: (p, g) => `Eat any creatures: ${p} / ${g}`,
    9: () => 'Swallow prey bigger than half your size',
    10: (p, g) => `Dash for ${g} s: ${Math.floor(p)} / ${g}`,
    11: () => 'Eat a pufferfish before it puffs up',
    12: () => 'Eat your fill: fullness 100%',
    13: (p, g, m, ch) => (ch === 2 ? 'Blind a predator with ink' : ch === 1 ? `Withstand bites in the shell: ${p} / ${g}` : `Swim ${g} m: ${Math.floor(p)} / ${g}`),
    14: (p, g, m) => (m.par ? 'Eat a diver' : `Scare divers on the reef: ${p} / ${g}`),
    15: () => 'Rise right up to the surface',
    done: 'Done!', head: 'MISSIONS', doneN: 'done', to: 'to',
    octNote: (k) => `The octopus opens after ${k} missions done as the nautilus`,
  },
};

// env: { pl (player state), known (Set of eaten species), onComplete(), }
export function createMissions(env) {
  const slots = [{}, {}, {}];
  let eatTimes = [-999, -999, -999];
  const pl = env.pl;

  function valid(k) {
    if (slots.some((m) => m.k === k)) return false;
    switch (k) {
      case 2: return pl.L < 430;
      case 10: return pl.char !== 1;          // the nautilus has no continuous jet
      case 6: return env.known.size < 23;
      case 11: return pl.L > 32;
      case 12: return pl.food < 80;
      case 15: return depthM(pl.z) > 60;
      case 8: case 16: return false;          // mines and finds: stage 8
    }
    return true;
  }
  function assign(i, except) {
    const L = pl.L, d = depthM(pl.z);
    let k = -1;
    for (let tries = 0; tries < 40; tries++) { const c = ri(0, 16); if (c === except) continue; if (valid(c)) { k = c; break; } }
    if (k < 0) k = 7;
    const m = { k, prog: 0, par: -1, goal: 1, aux: 0, st: 0, t: 0 };
    switch (k) {
      case 0:
        m.par = L < 60 ? choose(0, 0, 1, 2, 12) : L < 140 ? choose(0, 3, 12, 16) : choose(3, 5, 4, 16, 21);
        m.goal = ri(3, 6); if (m.par === 21 || m.par === 4) m.goal = 2;
        break;
      case 1: m.goal = (Math.floor(d / 50) + 2) * 50; break;
      case 2: m.goal = STAGE_HI[stageIndex(L)]; break;
      case 3: m.goal = ri(1, 2); break;
      case 4: m.goal = ri(2, 3) * 60; m.aux = pl.time; break;
      case 5: m.goal = 3; break;
      case 7: m.goal = ri(6, 12); break;
      case 10: m.goal = 15; m.aux = pl.boostT; break;
      case 12: m.goal = 100; break;
      case 13: if (pl.char === 1) m.goal = 2; else if (pl.char === 0) { m.goal = 400; m.aux = pl.dist; } break;
      case 14: m.par = L >= 125 ? 1 : 0; m.goal = m.par ? 1 : 2; break;
    }
    slots[i] = m;
  }
  function reset() { slots.forEach((_, i) => { slots[i] = {}; }); eatTimes = [-999, -999, -999]; for (let i = 0; i < 3; i++) assign(i, -1); }

  function complete(i) {
    const m = slots[i];
    if (m.st !== 0) return;
    m.st = 1; m.t = 0;
    env.onComplete(m);
  }
  function add(i, n) {
    const m = slots[i];
    if (m.st !== 0) return;
    m.prog = Math.min(m.goal, m.prog + n);
    if (m.prog >= m.goal) complete(i);
  }

  // events: 'eat' {t, rr, inflate}, 'lost', 'new', 'block', 'blind', 'scare' (later 'chain', 'find')
  function event(e, a = {}) {
    if (e === 'eat') eatTimes = [eatTimes[1], eatTimes[2], pl.time];
    slots.forEach((m, i) => {
      if (m.st !== 0) return;
      const k = m.k;
      if (e === 'eat') {
        if (k === 0 && a.t === m.par) add(i, 1);
        if (k === 7) add(i, 1);
        if (k === 9 && a.rr >= 0.5) add(i, 1);
        if (k === 11 && a.t === 11 && a.inflate < 0.3) add(i, 1);
        if (k === 14 && m.par && a.t === 21) add(i, 1);
        if (k === 5 && eatTimes[2] - eatTimes[0] <= 15) add(i, 1);
      }
      if (e === 'lost' && k === 3) add(i, 1);
      if (e === 'find' && k === 16) add(i, 1);
      if (e === 'new' && k === 6) add(i, 1);
      if (e === 'chain' && k === 8) add(i, 1);
      if (e === 'block' && k === 13 && pl.char === 1) add(i, 1);
      if (e === 'blind' && k === 13 && pl.char === 2) add(i, 1);
      if (e === 'scare' && k === 14 && !m.par) add(i, 1);
    });
  }

  // polling tasks, completion animations, refilling empty slots (one 1/60 s step)
  function step() {
    slots.forEach((m, i) => {
      m.t++;
      if (m.st === 1 && m.t > 62) { m.st = 2; m.t = 0; }
      if (m.st === 2 && m.t > 30) { assign(i, m.k); return; }
      if (m.st !== 0) return;
      const d = depthM(pl.z);
      switch (m.k) {
        case 1: m.prog = Math.min(m.goal, Math.floor(d)); if (d >= m.goal) complete(i); break;
        case 2: if (pl.L >= m.goal) complete(i); break;
        case 4: m.prog = pl.time - m.aux; if (m.prog >= m.goal) complete(i); break;
        case 10: m.prog = Math.min(m.goal, pl.boostT - m.aux); if (m.prog >= m.goal) complete(i); break;
        case 12: m.prog = Math.floor(pl.food); if (pl.food >= 99.5) complete(i); break;
        case 13: if (pl.char === 0) { m.prog = Math.min(m.goal, pl.dist - m.aux); if (m.prog >= m.goal) complete(i); } break;
        case 15: if (d < 12) complete(i); break;
      }
    });
  }

  const text = (m) => {
    const T = TXT[getLang()];
    return m.st >= 1 ? T.done : T[m.k](m.prog, m.goal, m, pl.char);
  };
  const frac = (m) => (m.goal <= 1 ? 0 : Math.max(0, Math.min(1, m.prog / m.goal)));
  const labels = () => TXT[getLang()];

  return { slots, reset, step, event, text, frac, labels };
}
