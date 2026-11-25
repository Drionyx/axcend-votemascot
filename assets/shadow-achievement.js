export const certificateSize = 5;
export const certificateName = 'Certified CUMLicker';

// El prefijo también permite nombres de ronda como "constructor". Firebase prohíbe el punto en las claves.
const roundKey = token => 'r_' + encodeURIComponent(String(token)).replaceAll('.', '%2E');

function book(state) {
  if (state?.certificacion) return state.certificacion;
  let previas = Object.values(state?.huellas || {}).filter(v=>v===true).length;
  const rondas = {};
  if (state?.acertado && state.ronda) {
    rondas[roundKey(state.ronda)] = true;
    // Una victoria temprana de V2.4 ya figura entre las huellas.
    if (!state.fallos && state.pistas <= 1 && previas) previas--;
  }
  return {previas,rondas};
}

export function creditRound(state, token) {
  const previous = book(state);
  const key = roundKey(token);
  if (previous.rondas?.[key]) return previous;
  return {...previous,rondas:{...previous.rondas,[key]:true}};
}

// Materializa también el último acierto si lo escribió un cliente de la edición anterior.
export function certificateBook(state) {
  return state?.acertado && state.ronda ? creditRound(state,state.ronda) : book(state);
}
export function certificateTotal(state) {
  const record=certificateBook(state);
  return record.previas + Object.keys(record.rondas || {}).length;
}

