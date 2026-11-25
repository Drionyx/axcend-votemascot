import {clues} from './shadow-clues.js';
import {samples} from './shadow-samples.js';

// El orden habitual reserva la primera señal de la edición original para el final.
// En estos retratos, otro de los tres detalles resulta más distintivo.
const finalDetail = {
  'Akaoni Atsushi':2,'Baade':1,'Choi Yuhee':2,'Code K':1,'Croc Nile':2,'Guala':2,
  'Kantos':0,'Model AZ':2,'Owlbert':2,'Spunk':1,'Tayangsuyi':2,'Yorick':2,
  'Beernox':1,'Boss Ren':2,'Covetous Wolf':1,'Damian':1,'Duncan Charles':2,
  'Haniya':1,'Invisible Man':1,'Jeffery':2,'Ju Chenhan':1,'Khafka':2,
  'Mengkui':2,'Oyamada Mataya':0,'Paddy':2,'Paper Bag Man':2,'Ricano':1,
  'Watanabe Hitoha':2,'Water loving Paul':2,'Xuying':1,'Ya Namhyun':2,'Zetto':2
};
export const pigmentOf = name => samples[name][2];
// Radios en píxeles del vidrio 400 × 500. La segunda y la tercera pasada comparten enfoque.
export const passStyles = [
  {blur:26,length:46,thickness:26},
  {blur:13,length:72,thickness:42},
  {blur:13,length:86,thickness:54},
  {blur:7,length:105,thickness:65},
  {blur:3,length:125,thickness:78}
];
export const openingPasses=passStyles.length;
export const sweepBands=5;
export const glassIsClean=count=>count>=openingPasses+sweepBands;
export const passLabel=count=>count+(count===1?' pasada':' pasadas');

// Las pasadas son horizontales. Priorizamos bandas que aún estén tapadas.
function uncovered(choices,opened) {
  const distance=([x,y])=>Math.min(...opened.map(([a,b])=>((x-a)*.6)**2+((y-b)*1.4)**2));
  return choices.reduce((best,c)=>distance(c)>distance(best)?c:best);
}
export function stages(name, edition=2) {
  const original=clues[name];
  if (!original) return [];
  const [x,y]=samples[name];
  const last=finalDetail[name] ?? 0;
  const middle=last===1?2:1;
  const opening=edition===1 ? original.slice() : [[x,y],original[middle],original[last]];
  const spare=original[3-middle-last];
  const fourth=uncovered([spare,[35,56],[66,56],[42,72],[63,75]],opening);
  const fifth=uncovered([[50,36],[38,30],[62,41],[48,48],[55,54]],opening.concat([fourth]));
  return [...opening,fourth,fifth];
}
