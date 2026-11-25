import {extraLines} from './shadow-extra.js';
import {reducedMotion} from './motion.js';

const glass=document.getElementById('shadowCanvas').parentElement;
const cheer=document.createElement('div');
cheer.className='shadow-cheer'; cheer.hidden=true; cheer.setAttribute('aria-hidden','true');
const ribbon=document.createElement('strong');
ribbon.className='shadow-ribbon';
ribbon.textContent='Logro Obtenido';
cheer.append(ribbon);
const colors=['#ffcc66','#79efde','#fff4d3','#d0ee64'];
for(let i=0;i<16;i++) {
  const piece=document.createElement('i');
  piece.style.setProperty('--lane',(5+(i*37)%90)+'%');
  piece.style.setProperty('--drift',((i%2?1:-1)*(12+(i*13)%38))+'px');
  piece.style.setProperty('--delay',(i%5)*65+'ms');
  piece.style.setProperty('--spin',((i%2?1:-1)*(105+i*17))+'deg');
  piece.style.setProperty('--paper',colors[i%colors.length]);
  cheer.append(piece);
}
glass.append(cheer);
const speech=document.createElement('blockquote');
speech.className='shadow-speech';speech.hidden=true;
const victoryLines = new Map([
  ['Hakui','En verdad que te gusta lamer mis patitas~'],
  ['Invisible Man','Y dime.. a que sabe el CUM invisible?~']
]);
glass.closest('figure').append(speech);
const reward=document.getElementById('shadowBoyfriend');
glass.closest('figure').append(reward);
speech.setAttribute('aria-live','polite');
export function showCharacterSpeech(solved,name,extras) {
  reward.hidden=extras!==extraLines.length;
  speech.hidden=!solved && !extras;
  speech.textContent=extraLines[extras-1] || (solved ? (victoryLines.get(name) || 'Así que te gusta lamer CUM~') : '');
}

let timeout=0;
export function endCheer() { clearTimeout(timeout);cheer.hidden=true; }
export function celebrateShadow() {
  if (document.hidden || !glass.getClientRects().length) return;
  endCheer();cheer.hidden=false;
  timeout=setTimeout(endCheer,reducedMotion.matches?2500:2800);
}
