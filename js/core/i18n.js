// Two languages; the browser language picks the first one, the choice is remembered.
// Elements with data-i18n="key" get their text replaced; t(key) is used from code.
const DICT = {
  ru: {
    loading: 'Загрузка…', load_scene: 'Морское дно', load_creatures: 'Обитатели моря', load_done: 'Готово',
    hint_keys: 'W — плыть · A/D — поворот · ↑/↓ — всплыть/нырнуть · Shift — рывок · F — способность · Esc — пауза',
    hint_touch: 'Стик — поворот и глубина · «Плыть», «Рывок», «Способность» — справа',
    btn_swim: 'Плыть', btn_boost: 'Рывок', btn_ability: 'Способ­ность',
    paused: 'Пауза', resume: 'Продолжить', quality: 'Качество',
    q_auto: 'Авто', q_low: 'Низкое', q_mid: 'Среднее', q_high: 'Высокое',
    threat_m: '{n} заметил вас!', threat_f: '{n} заметила вас!', lost_m: '{n} потерял вас из виду', lost_f: '{n} потеряла вас из виду',
    new_size: 'Новый размер: {s}!', hungry: 'Вы голодны — пора поохотиться', starving: 'Вы умираете от голода!',
    puffer: 'Рыба-фугу ядовита! Здоровье падает', new_species: 'Новое существо: {n} — +{p} очков',
    st0: 'Малёк', st1: 'Юный кальмар', st2: 'Охотник рифа', st3: 'Гроза глубин', st4: 'Гигантский кальмар', st5: 'Кракен',
    hp: 'Здоровье', stamina: 'Выносливость', food: 'Сытость', score: 'Очки', size_m: 'м',
    dead_title: 'Кальмар погиб', dead_by: 'Его съел(а): {k}', dead_starved: 'Причина: голод', dead_size: 'Размер', dead_eaten: 'Съедено',
    dead_score: 'Очки', dead_time: 'Время', again: 'Ещё раз', combo: 'Комбо ×{k}',
  },
  en: {
    loading: 'Loading…', load_scene: 'Seabed', load_creatures: 'Sea creatures', load_done: 'Ready',
    hint_keys: 'W — swim · A/D — turn · ↑/↓ — rise/dive · Shift — dash · F — ability · Esc — pause',
    hint_touch: 'Stick — turn and depth · Swim, Dash, Ability — on the right',
    btn_swim: 'Swim', btn_boost: 'Dash', btn_ability: 'Ability',
    paused: 'Paused', resume: 'Resume', quality: 'Quality',
    q_auto: 'Auto', q_low: 'Low', q_mid: 'Medium', q_high: 'High',
    threat_m: '{n} has spotted you!', threat_f: '{n} has spotted you!', lost_m: '{n} lost sight of you', lost_f: '{n} lost sight of you',
    new_size: 'New size: {s}!', hungry: 'You are hungry — time to hunt', starving: 'You are starving!',
    puffer: 'Pufferfish is poisonous! Health drops', new_species: 'New creature: {n} — +{p} points',
    st0: 'Fry', st1: 'Young squid', st2: 'Reef hunter', st3: 'Terror of the deep', st4: 'Giant squid', st5: 'Kraken',
    hp: 'Health', stamina: 'Stamina', food: 'Fullness', score: 'Score', size_m: 'm',
    dead_title: 'Your squid died', dead_by: 'Eaten by: {k}', dead_starved: 'Cause: starvation', dead_size: 'Size', dead_eaten: 'Eaten',
    dead_score: 'Score', dead_time: 'Time', again: 'Play again', combo: 'Combo ×{k}',
  },
};

let lang = 'ru';
try { lang = localStorage.getItem('growup.lang') || ''; } catch (e) { lang = ''; }
if (!DICT[lang]) lang = (navigator.language || 'ru').toLowerCase().startsWith('ru') ? 'ru' : 'en';

export const getLang = () => lang;
// t(key) or t(key, { n: ... }): {n} in the text is replaced by the value
export const t = (key, v) => {
  let s = DICT[lang][key] ?? DICT.ru[key] ?? key;
  if (v) for (const k in v) s = s.replace("{" + k + "}", v[k]);
  return s;
};
// species name in the current language (sp: an entry of creatures/species.js); low: lower case (Russian)
export const spName = (sp, low) => { const n = sp.name[lang] ?? sp.name.ru; return low && lang === "ru" ? n.toLowerCase() : n; };

export function applyLang(root = document) {
  document.documentElement.lang = lang;
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
}

export function setLang(l) {
  if (!DICT[l]) return;
  lang = l;
  try { localStorage.setItem('growup.lang', l); } catch (e) { /* private mode: not remembered */ }
  applyLang();
}

export const toggleLang = () => setLang(lang === 'ru' ? 'en' : 'ru');
