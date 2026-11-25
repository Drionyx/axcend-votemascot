import {animate, reducedMotion} from './motion.js';
import {session} from './client.js';

const art = document.querySelector('.hero-art');
const frames = [...art.querySelectorAll('img')];
const mobile = matchMedia('(max-width:680px)');
const reduced = reducedMotion;
const controls = document.querySelector('.cover-controls');
const pause = document.getElementById('coverPause');
export const catalog = [
  ...Array.from(document.querySelectorAll('#grid .card img'), img => [img.alt, img.src]),
  ...JSON.parse(document.getElementById('coverExtras').textContent)
];
let lastNames = (session.getItem('woofia_cover') || '').split('|');
let bag = [];
let paused = reduced.matches;
let timer;

function draw(excluded) {
  if (!bag.length) {
    bag = catalog.slice();
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }
  const index = bag.findIndex(([name]) => !excluded.includes(name));
  return bag.splice(Math.max(0, index), 1)[0];
}
let firstCover = true;
function replaceFrame(frame, src) {
  const slice = frame.parentElement;
  const previous = slice.querySelector('.cover-previous');
  const veil = previous || frame.cloneNode(false);
  previous?.getAnimations().forEach(animation => animation.cancel());
  if (firstCover || reduced.matches || document.hidden) {
    previous?.remove();
    frame.src = src;
    return;
  }
  // El retrato anterior cubre el nuevo hasta que el navegador pueda dibujarlo.
  if (!previous) {
    veil.className = 'cover-previous';
    veil.alt = '';
    veil.setAttribute('aria-hidden','true');
    slice.append(veil);
  } else if (frame.complete && frame.naturalWidth) veil.src = frame.src;
  frame.src = src;
  const expected = frame.src;
  const finish = () => {
    if (frame.src !== expected || !veil.isConnected) return;
    const fade = animate(veil,[{opacity:1},{opacity:0}],520);
    if (!fade) { veil.remove(); return; }
    fade.finished.then(() => veil.remove(), () => {
      if (reduced.matches) veil.remove();
    });
  };
  frame.decode().then(finish, () => { if (frame.src === expected) veil.remove(); });
}
function changeCover() {
  const names = [];
  for (const frame of frames.slice(0, mobile.matches ? 1 : 3)) {
    const [name, src] = draw([...lastNames, ...names]);
    replaceFrame(frame,src);
    names.push(name);
  }
  firstCover = false;
  art.setAttribute('aria-label', names.join(' · '));
  lastNames = names;
  session.setItem('woofia_cover', names.join('|'));
}
function schedule() {
  clearInterval(timer);
  if (!paused && !document.hidden) timer = setInterval(changeCover, 9000);
  pause.setAttribute('aria-label', paused ? 'Reproducir portada' : 'Pausar portada');
  pause.title = pause.getAttribute('aria-label');
  pause.firstElementChild.textContent = paused ? '▶' : 'Ⅱ';
}
pause.addEventListener('click', () => { paused = !paused; schedule(); });
document.getElementById('coverNext').addEventListener('click', () => { changeCover(); schedule(); });
document.addEventListener('visibilitychange', schedule);
mobile.addEventListener('change', changeCover);
reduced.addEventListener('change', () => { paused = reduced.matches; schedule(); });
art.removeAttribute('aria-hidden');
art.setAttribute('role', 'img');
changeCover();
controls.hidden = false;
schedule();
