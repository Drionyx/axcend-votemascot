import {extraLines,fullyRevealed} from './shadow-extra.js';
import {bonusLicks,dailyReserve} from './shadow-wallet.js';
import {openingPasses,pigmentOf} from './shadow-stages.js';
import {certificateBook, creditRound} from './shadow-achievement.js';
import {clues} from './shadow-clues.js';
import {roundId, normalized} from './round.js';

export const names = Object.keys(clues).sort();
// Las rondas anteriores conservan su respuesta y sus sospechosos originales.
const additions = new Set(['Code XY','Crimson Moon Code B','Delacroy','Warmaster Hakui']);
const previousNames = names.filter(name => !additions.has(name));
export const catalogFor = cfg => cfg?.sombra?.catalogo === 81 ? names : previousNames;
const dayFormat = new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'});
export const clanDay = time => dayFormat.format(time);

function hash(text) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0),16777619);
  return h >>> 0;
}
export function subject(cfg) {
  const token = String(roundId(cfg));
  const saved = cfg.sombra;
  if (saved?.ronda === token && names.includes(saved.nombre)) return saved.nombre;
  const candidates = previousNames.filter(name => name !== saved?.nombre);
  return candidates[hash(token) % candidates.length];
}
export function nextMystery(cfg, token) {
  const previous = subject(cfg);
  const pool = names.filter(n => n !== previous);
  return {edicion:2,catalogo:81,ronda:String(token), nombre:pool[Math.floor(Math.random()*pool.length)],anterior:previous};
}

// Parte de los señuelos comparte detalles descritos en los retratos.
const stopWords = new Set('sobre entre debajo junto borde bordes tono tonos clara claro oscuro oscura con una bajo para hacia alrededor color'.split(' '));
const traits = new Map(names.map(n=>[n,new Set(clues[n].flatMap(clue =>
  clue[2].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').split(/[^a-z]+/).filter(w=>w.length>3 && !stopWords.has(w))))]));
export function editionOf(cfg) {
  return cfg?.sombra?.edicion === 2 && cfg.sombra.ronda === String(roundId(cfg)) ? 2 : 1;
}
// Una cuenta que ya recibió tres finalistas en V2.6 conserva esa selección.
export function finalistAt(play,edition) {
  return edition===2 && (play.finalistasDesde===3 || (!play.finalistasDesde && play.pistas>=3)) ? 3 : openingPasses;
}
export function suspects(token, answer, edition=2, revealed=0, threshold=openingPasses, catalog=names) {
  const all = catalog.filter(n=>n!==answer).map(name=>({
    name, order:hash(token+'|'+name),
    matches:[...traits.get(name)].filter(t=>traits.get(answer).has(t)).length
  })).sort((a,b)=>a.order-b.order);
  if (edition === 2) {
    const ranked = all.slice().sort((a,b)=>b.matches-a.matches || a.order-b.order);
    const similar = ranked.filter(candidate=>pigmentOf(candidate.name)===pigmentOf(answer));
    const finalists = similar.slice(0,2);
    const decoys = revealed >= threshold ? finalists : [
      ...similar.slice(0,5),
      ...ranked.filter(candidate=>pigmentOf(candidate.name)!==pigmentOf(answer)).slice(0,6)
    ];
    return [answer,...decoys.map(c=>c.name)].sort((a,b)=>a.localeCompare(b,'es'));
  }
  const near = all.slice().sort((a,b)=>b.matches-a.matches).slice(0,6).map(i=>i.name);
  if (revealed>=threshold) return [answer,...near.slice(0,2)].sort((a,b)=>a.localeCompare(b,'es'));
  return [answer,...near,...all.filter(i=>!near.includes(i.name)).slice(0,5).map(i=>i.name)].sort((a,b)=>a.localeCompare(b,'es'));
}
export function shadowClosed(cfg, time) {
  return Boolean(cfg && (cfg.ganador_final || cfg.ganador_rescate || (cfg.fin_votacion > 0 && time >= cfg.fin_votacion)));
}
export function personalCase(state, token) {
  return state?.ronda === token ? state : {ronda:token,pistas:0,fallos:0,acertado:false,descartados:{},extras:0};
}
export function act(state, token, answer, day, action, selection, edition=2, limit=1, catalog=names) {
  const play = personalCase(state,token);
  if (play.acertado && action!=='lick') throw Error('Ya resolviste este misterio.');
  const reserve=dailyReserve(state,day,limit);
  const threshold=finalistAt(play,edition);
  const next = {...state,...play,finalistasDesde:threshold,reserva:reserve,certificacion:certificateBook(state)};
  if (action === 'lick') {
    const bonus=bonusLicks(state);
    if (reserve.dia>day || (!reserve.saldo && !bonus)) throw Error('Ya usaste tu reserva. Volvé mañana.');
    const spent = {...next,ultimoLenguetazo:day,reserva:{dia:day,saldo:Math.max(0,reserve.saldo-1),gasto:day}};
    if (!reserve.saldo) spent.lamidas_admin=bonus-1;
    if (!fullyRevealed(play)) return {...spent,pistas:play.pistas+1};
    const extras=(play.extras || 0)+1;
    if (extras>extraLines.length) throw Error('Ya completaste las pasadas extra de esta ronda.');
    spent.extras=extras;
    if (extras===extraLines.length) spent.boyfriend=true;
    return spent;
  }
  if (action !== 'guess' || !suspects(token,answer,edition,play.pistas,threshold,catalog).includes(selection)) throw Error('Elegí un personaje de la lista.');
  if (state?.ultimoFallo >= day) throw Error('Mañana podés volver a responder.');
  const identity=normalized(selection);
  if (play.descartados?.[identity]) throw Error('Ya descartaste a ese personaje en esta ronda.');
  if (selection === answer) {
    if (!play.fallos && play.pistas <= 1) next.huellas = {...state?.huellas,[normalized(answer)]:true};
    return {...next,acertado:true,certificacion:creditRound(next,token)};
  }
  return {...next,fallos:play.fallos+1,ultimoFallo:day,descartados:{...play.descartados,[identity]:true}};
}
