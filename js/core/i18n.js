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
  },
  en: {
    loading: 'Loading…', load_scene: 'Seabed', load_creatures: 'Sea creatures', load_done: 'Ready',
    hint_keys: 'W — swim · A/D — turn · ↑/↓ — rise/dive · Shift — dash · F — ability · Esc — pause',
    hint_touch: 'Stick — turn and depth · Swim, Dash, Ability — on the right',
    btn_swim: 'Swim', btn_boost: 'Dash', btn_ability: 'Ability',
    paused: 'Paused', resume: 'Resume', quality: 'Quality',
    q_auto: 'Auto', q_low: 'Low', q_mid: 'Medium', q_high: 'High',
  },
};

let lang = 'ru';
try { lang = localStorage.getItem('growup.lang') || ''; } catch (e) { lang = ''; }
if (!DICT[lang]) lang = (navigator.language || 'ru').toLowerCase().startsWith('ru') ? 'ru' : 'en';

export const getLang = () => lang;
export const t = (key) => DICT[lang][key] ?? DICT.ru[key] ?? key;

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
