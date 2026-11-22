// Settings window: graphics quality, volumes (used by the sound of stage 9), fullscreen, vertical
// inversion, language. Remembered in the browser.
import { t, getLang, setLang } from '../core/i18n.js';
import { setInvertY } from '../core/input.js';
import { setQualityMode, qualityMode } from '../core/quality.js';

const KEY = 'growup.settings';
const $ = (id) => document.getElementById(id);

export const settings = { sfx: 0.8, amb: 0.6, music: 0.5, inv: false };
try { Object.assign(settings, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* defaults */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* not remembered */ } };
setInvertY(settings.inv);

const canFull = () => !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
const isFull = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
function setFull(on) {
  const d = document, e = d.documentElement;
  try {
    if (on && !isFull()) (e.requestFullscreen || e.webkitRequestFullscreen).call(e, { navigationUI: 'hide' })?.catch?.(() => {});
    if (!on && isFull()) (d.exitFullscreen || d.webkitExitFullscreen).call(d)?.catch?.(() => {});
  } catch (err) { /* refused */ }
}

// onLang(): the language changed; onClose(): the window was closed
export function initSettings(onLang, onClose) {
  const q = $('sel-quality'), full = $('set-full'), inv = $('set-inv'), lang = $('sel-lang');
  const notes = () => {
    $('gfx-note').textContent = t(qualityMode() === 'auto' ? 'gfx_note_auto' : 'gfx_note');
    $('inv-note').textContent = t(settings.inv ? 'inv_note_on' : 'inv_note_off');
  };
  for (const k of ['sfx', 'amb', 'music']) {
    const el = $('vol-' + k);
    el.value = settings[k];
    el.addEventListener('input', () => { settings[k] = +el.value; save(); });
  }
  q.addEventListener('change', () => { setQualityMode(q.value); notes(); });
  inv.addEventListener('change', () => { settings.inv = inv.checked; setInvertY(settings.inv); save(); notes(); });
  full.addEventListener('change', () => setFull(full.checked));
  document.addEventListener('fullscreenchange', () => { full.checked = isFull(); });
  lang.addEventListener('change', () => { setLang(lang.value); notes(); onLang(); });
  $('btn-set-back').addEventListener('click', () => { hide(); onClose(); });

  function show() {
    q.value = qualityMode();
    inv.checked = settings.inv;
    full.checked = isFull();
    full.closest('.set-row').hidden = !canFull();
    lang.value = getLang();
    notes();
    $('settings').hidden = false;
  }
  function hide() { $('settings').hidden = true; }
  return { show, hide, active: () => !$('settings').hidden };
}
