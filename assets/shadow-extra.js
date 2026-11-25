import {glassIsClean} from './shadow-stages.js';

export const extraLines = [
  'Uff… rico~. Se te nota el entusiasmo, eh.',
  'Unff… sí que te gusta lamer. Y no lo digo por el helado~',
  'Sabés que hay otros lados que también se pueden lamer… para practicar, obvio~',
  '¿Y si mezclamos saliva? Es por ciencia, no por vicio~',
  'Eres insaciable… Te otorgo el logro ‘Boyfriend’ con CUM~ y beca para seguir practicando de rodillas… digo, en el podio.'
];
export const fullyRevealed = play => Boolean(play.acertado) || glassIsClean(play.pistas || 0);
