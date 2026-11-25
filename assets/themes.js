import {fillMargins} from './arena-gutters.js';
import {initScenes} from './element-scenes.js';
import {preferences} from './client.js';
import {db} from './common.js';
import {onValue, ref, runTransaction} from './vendor/firebase-database.js';

const legacyPalettes = new Map([
  ['marea','water'], ['tierra','wood'], ['carmesi','fire'], ['amatista','dark'], ['ambar','light']
]);
const dialog = document.getElementById('themePicker');
const form = dialog.querySelector('form');
const save = document.getElementById('themeSave');
const message = document.getElementById('themeMessage');
const pickerButton = document.querySelector('.theme-btn');
const paletteIcons = new Map(Array.from(form.querySelectorAll('[data-swatch]'), option =>
  [option.dataset.swatch, option.querySelector('img').src]));
const emblem = pickerButton.querySelector('.theme-emblem');
fillMargins();
const showScene = initScenes(document.querySelector('.hero-landscape'),document.getElementById('scenePreview'),dialog);
const motionButton = document.getElementById('sceneMotion');
const sceneName = dialog.querySelector('.scene-name span');
const sceneIcon = dialog.querySelector('.scene-name img');
let moving = preferences.getItem('woofia_scene_paused') !== '1';
function updateScene() {
  const id = document.body.dataset.palette;
  const label = moving ? 'Pausar ambiente' : 'Reproducir ambiente';
  motionButton.setAttribute('aria-label',label);
  motionButton.title = label;
  motionButton.textContent = moving ? 'Ⅱ' : '▶';
  document.body.toggleAttribute('data-ambient-still',!moving || document.hidden || dialog.open);
  showScene(id,moving);
}
document.addEventListener('visibilitychange',updateScene);
motionButton.addEventListener('click', () => {
  moving = !moving;
  preferences.setItem('woofia_scene_paused', moving ? '0' : '1');
  updateScene();
});
let account = null;
let unsubscribe;
let connected = false;
let readable = false;
let readError = false;
let pending = false;
let saved;
let ambientMode = 'dark';

function normalize(value) {
  const id = legacyPalettes.get(value?.paleta) || value?.paleta;
  return {
    paleta: paletteIcons.has(id) ? id : 'axn',
    modo: value?.modo === 'light' ? 'light' : 'dark'
  };
}
function cacheKey(user) { return user ? 'woofia_theme_user:' + user : 'woofia_theme_guest'; }
function cached(user) {
  try { return JSON.parse(preferences.getItem(cacheKey(user))); } catch { return null; }
}
function legacy() { return {paleta: 'axn', modo: preferences.getItem('axcend_theme') || ambientMode}; }
function paint(theme) {
  document.body.dataset.palette = theme.paleta;
  emblem.hidden = theme.paleta === 'axn';
  pickerButton.querySelector('i').hidden = !emblem.hidden;
  sceneIcon.src = paletteIcons.get(theme.paleta);
  sceneName.textContent = form.querySelector('[data-swatch="'+theme.paleta+'"] strong').textContent;
  if (!emblem.hidden) emblem.src = sceneIcon.src;
  updateScene();
  document.body.classList.toggle('light', theme.modo === 'light');
  document.querySelector('meta[name="theme-color"]').content = getComputedStyle(document.body).getPropertyValue('--bg').trim();
}
function confirmed(theme) {
  saved = normalize(theme);
  if (!dialog.open) paint(saved);
}
function offline() { return !connected || navigator.onLine === false; }
function syncHint() {
  if (!dialog.open || pending) return;
  message.textContent = !account ? 'Se guarda en este navegador.' :
    offline() ? 'Sin conexión para guardar en tu perfil.' :
    readError ? 'No se pudo leer el tema de tu perfil.' :
    !readable ? 'Consultando tu perfil…' : 'Se guarda en tu perfil del clan.';
  save.disabled = Boolean(account && (offline() || !readable));
}

window.addEventListener('offline', syncHint);
window.addEventListener('online', syncHint);
onValue(ref(db,'.info/connected'), snap => { connected = snap.val() === true; syncHint(); });

export function setThemeAccount(user) {
  if (user === account) return;
  unsubscribe?.();
  if (dialog.open) dialog.close();
  account = user;
  readError = false;
  readable = false;
  pending = false;
  const local = cached(user);
  confirmed(local || cached(null) || legacy());
  if (!user) return;
  const target = ref(db, 'usuarios/' + user + '/tema');
  let adopted = false;
  unsubscribe = onValue(target, snap => {
    if (account !== user) return;
    readError = false;
    readable = true;
    const remote = snap.val();
    const guest = cached(null);
    if (remote) {
      confirmed(remote);
      preferences.setItem(cacheKey(user), JSON.stringify(saved));
    } else {
      confirmed(guest || legacy());
      preferences.removeItem(cacheKey(user));
      if (guest && !adopted) {
        adopted = true;
        runTransaction(target, current => current == null ? normalize(guest) : undefined,
          {applyLocally:false}).catch(() => { /* El usuario puede volver a guardar desde el selector. */ });
      }
    }
    syncHint();
  }, () => {
    if (account !== user) return;
    readError = true;
    readable = false;
    syncHint();
  });
}
function selected() {
  return normalize({paleta:form.elements.palette.value, modo:form.elements.appearance.value});
}
confirmed(cached(null) || legacy());
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
  ambientMode = event.matches ? 'dark' : 'light';
  if (!cached(account) && !cached(null) && !preferences.getItem('axcend_theme')) confirmed(legacy());
});
pickerButton.addEventListener('click', () => {
  form.elements.appearance.value = saved.modo;
  form.elements.palette.value = saved.paleta;
  dialog.showModal();
  updateScene();
  syncHint();
});
form.addEventListener('change', () => { paint(selected()); syncHint(); });
document.getElementById('themeClose').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => { paint(saved); });
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (pending || save.disabled) return;
  const value = selected();
  const user = account;
  if (user) {
    pending = true;
    save.disabled = true;
    message.textContent = 'Guardando en tu perfil…';
    try {
      await runTransaction(ref(db, 'usuarios/' + user + '/tema'), () => value, {applyLocally:false});
    } catch {
      if (user === account) message.textContent = 'No se pudo guardar. Volvé a intentarlo.';
      return;
    } finally {
      if (user === account) { pending = false; save.disabled = offline() || !readable; }
    }
    if (user !== account) return;
  }
  preferences.setItem(cacheKey(user), JSON.stringify(value));
  confirmed(value);
  dialog.close();
});
