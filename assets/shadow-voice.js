import {glassIsClean,openingPasses} from './shadow-stages.js';

// Las frases dependen de la ronda y del momento del juego, nunca del personaje.
const lines = {
  start:['¿Te animás a romper el hielo con la lengua?', 'Ese vidrio pide un lengüetazo. ¿Quién se atreve?', 'Acercate un poquito. El primer movimiento es tuyo.'],
  waiting:['¿Te quedaste con ganas de seguir lamiendo a este macho? Mañana te espera acá.', 'Guardate esas ganas para mañana. Él sabe esperarte.', 'Por hoy lo dejaste con la intriga. Mañana tienen otra cita.'],
  ready:['Todavía te queda lengua para otra pasada. ¿Seguís o te la jugás?', 'Ese vidrio aguanta otra pasada. ¿Y vos?', 'Te guardaste un lengüetazo. Qué lindo momento para usarlo.'],
  finalists:['Quedan tres. Si te quedaste con ganas, mañana podés limpiar más.', 'Podés decir su nombre hoy o seguir lamiendo mañana.', 'Llegaste a los tres finalistas. Mañana ese vidrio vuelve a ser tuyo.'],
  final:['Ya quedó impecable. Ahora decime su nombre.', 'A esta altura ya hay confianza. ¿Cómo se llama?', 'Lo tenés frente a vos. ¿Te animás a decir su nombre?'],
  missed:['Ese nombre no era. Mañana tenés revancha, si te animás.', 'Te hiciste desear. Volvé mañana a probar con otro nombre.', 'Hoy te dejó con la duda. Mañana podés volver a jugártela.'],
  solved:['Lo tenías en la punta de la lengua.', 'Con que ya se conocían… Bien jugado.', 'Te acordaste de su nombre. Eso suma puntos.']
};
export function shadowVoice(token, passes, balance, solved=false, missed=false) {
  const mood=solved?'solved':missed?'missed':glassIsClean(passes)?'final':passes===openingPasses && !balance?'finalists':passes===0 && balance?'start':balance?'ready':'waiting';
  let seed=passes;
  for(const ch of String(token)) seed=(Math.imul(seed,31)+ch.charCodeAt(0))>>>0;
  return lines[mood][seed%lines[mood].length];
}

