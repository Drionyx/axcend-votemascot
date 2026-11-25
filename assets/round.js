import {ref, get, update, push, remove, onValue, onDisconnect, runTransaction, increment} from './vendor/firebase-database.js';

export const roster = ['Akaoni Atsushi', 'Aldun', 'Baade', 'Baiel', 'Beernox', 'Byun Woogyu', 'Capt Locke', 'Choi Yuhee', 'Choi Yuhyun', 'Code B', 'Code K', 'Croc Nile', 'Dallawan', 'Damian', 'Fogue', 'Gandope', 'Guala', 'Hakui', 'Jeffery', 'Ju Chenhan', 'Kagekuni', 'Kantos', 'Khafka', 'Kumoyama', 'Kyrian', 'Leo von Narcis', 'Meng', 'Mikeroo', 'Model AZ', 'Muwatakha', 'Orem', 'Owlbert', 'Paddy', 'Paul the Bear', 'Racles', 'Shibahiko', 'Spunk', 'Sylas', 'Tayangsuyi', 'Thug Ed', 'Tyrantino', 'Ya Namhyun', 'Yan Jiming', 'Yorick', 'Yugo'];
export const normalized = value => value.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,'_').replace(/[^a-z0-9_-]/g,'');
export const roundId = cfg => cfg.reset_token || 'inicial';
const val = async (db, path) => (await get(ref(db,path))).val();
const inCd = (cd, time) => cd?.activo && cd.hasta > time;
const closed = (cfg,time) => cfg.ganador_final || cfg.ganador_rescate || (cfg.fin_votacion > 0 && cfg.fin_votacion <= time);
const sum = values => Object.values(values).reduce((n,x) => n + Number(x || 0),0);
let offset = 0, connected = false;
export const now = () => Date.now() + offset;
export function watchTime(db) { onValue(ref(db,'.info/connected'), s => { connected = s.val() === true; }); return onValue(ref(db,'.info/serverTimeOffset'), snap => { offset = snap.val() || 0; }); }

// Orden de llegada compartido entre pestañas y dispositivos. Cada conexión sólo
// retira su propio turno si se desconecta, incluso mientras espera al anterior.
// El SDK cancela transacciones locales superpuestas cuando otro update toca la cola.
let localTurn = Promise.resolve();
export function roundWrite(db, prepare) {
  const result = localTurn.then(() => takeTurn(db,prepare));
  localTurn = result.catch(() => {});
  return result;
}
async function takeTurn(db, prepare) {
  if (!navigator.onLine || !connected) throw Error('Sin conexión con la ronda. Volvé a intentar.');
  const queue = ref(db,'turnos_ronda');
  const entry = push(queue);
  const key = entry.key;
  const disconnect = onDisconnect(entry);
  const cleanups = [];
  let committed = false;
  let lost = false;
  try {
    await disconnect.remove();
    const turn = await runTransaction(queue, current => {
      if (!connected) return;
      const order = Object.values(current || {});
      return {...current,[key]:Math.max(0,...order) + 1};
    }, {applyLocally:false});
    if (!turn.committed) throw Error('Se interrumpió la conexión al solicitar turno.');
    await new Promise((resolve,reject) => {
      const timer = setTimeout(() => reject(Error('La ronda está ocupada. Volvé a intentar.')),15000);
      cleanups.push(() => clearTimeout(timer));
      cleanups.push(onValue(ref(db,'.info/connected'), s => {
        if (!s.val()) { lost = true; reject(Error('Se interrumpió la conexión.')); }
      },reject));
      cleanups.push(onValue(queue, s => {
        const positions = s.val() || {};
        if (Object.hasOwn(positions,key) && positions[key] === Math.min(...Object.values(positions))) resolve();
      },reject));
    });
    const changes = await prepare();
    if (!changes) return false;
    if (lost || !navigator.onLine) throw Error('Se interrumpió la conexión. Revisá el estado de la ronda.');
    await update(ref(db), {...changes,['turnos_ronda/'+key]:null});
    committed = true;
    return true;
  } finally {
    cleanups.forEach(stop => stop());
    if (!committed) await remove(entry).catch(() => {});
    await disconnect.cancel().catch(() => {});
  }
}

function audit(db, tipo, subtipo, mensaje, detalles={}) {
  return {['logs/'+push(ref(db,'logs')).key]:{tipo,subtipo,mensaje,detalles,fecha:now()}};
}

export function rollTie(names, random=Math.random) {
  const rondas = [];
  let candidates = [...names];
  while (candidates.length > 1) {
    const tiradas = Object.fromEntries(candidates.map(name => [name,1+Math.floor(random()*6)]));
    rondas.push({ronda:rondas.length+1,candidatos:candidates,tiradas});
    const high = Math.max(...Object.values(tiradas));
    candidates = candidates.filter(name => tiradas[name] === high);
  }
  return {rondas,ganador:candidates[0],empate:names,fecha:now(),totalRondas:rondas.length};
}

async function finish(db,cfg,nombre,metodo,votos,rescates,existing=false) {
  const token = roundId(cfg);
  const date = now();
  const changes = {'config/predicciones_resueltas_token':token};
  if (!existing) {
    changes['config/'+(metodo === 'rescate' ? 'ganador_rescate' : 'ganador_final')] = nombre;
    changes['config/ganador_metodo'] = metodo;
    changes['config/fin_votacion'] = cfg.fin_votacion > 0 && cfg.fin_votacion <= date ? cfg.fin_votacion : date;
    changes['config/rng_trigger_at'] = 0;
    if (cfg.auto_cd_activo) changes['cooldowns/'+nombre] = {activo:true,desde:date,hasta:date+(cfg.cd_dias || 60)*86400000,motivo:'Auto-CD al ganar por '+metodo};
  }
  const hist = 'historial/'+token+'_'+nombre;
  if (!(await val(db,hist))) changes[hist] = {ganador:nombre,metodo,fecha:date,votos:votos[nombre] || 0,votosFinales:votos,rescatesFinales:rescates,totalMiembros:cfg.total_miembros || 41,participantes:sum(votos)+sum(rescates)};
  const predictions = await val(db,'predicciones') || {};
  for (const [user,p] of Object.entries(predictions)) {
    if (p.resetToken !== token || p.resuelta) continue;
    const stats = await val(db,'stats_usuarios/'+user) || {};
    const right = p.personaje === nombre;
    const streak = right ? (stats.streak_actual || 0)+1 : 0;
    changes['predicciones/'+user] = {...p,resuelta:true,acertada:right,rachaAntes:stats.streak_actual || 0,maxAntes:stats.streak_maximo || 0};
    changes['stats_usuarios/'+user+'/streak_actual'] = streak;
    changes['stats_usuarios/'+user+'/streak_maximo'] = Math.max(streak,stats.streak_maximo || 0);
    if (right) changes['stats_usuarios/'+user+'/predicciones_acertadas'] = increment(1);
  }
  return {...changes,...audit(db,metodo === 'rng' ? 'rng':'admin','resultado','Ganador por '+metodo+': '+nombre,{ganador:nombre,metodo,resetToken:token})};
}

export async function participate(db, kind, name, user, display, voterId, token) {
  if (!roster.includes(name) || !user || !['voto','rescate','prediccion'].includes(kind)) throw Error('Elección inválida.');
  await roundWrite(db,async () => {
    const [cfg,account,normal,rescue,cd] = await Promise.all(['config','usuarios/'+user,'votantes/'+user,'rescatadores/'+user,'cooldowns/'+name].map(p=>val(db,p)));
    if (!cfg || roundId(cfg) !== token || closed(cfg,now()) || cfg.mantenimiento) throw Error('La ronda cambió o ya está cerrada.');
    if (!account?.pin_hash) throw Error('Ingresá con tu nombre y PIN.');
    const record = {personaje:name,nombreOriginal:display,fecha:now(),voterId};
    const log = audit(db,kind === 'prediccion' ? 'admin':kind,kind,display+' · '+kind+' · '+name,{username:user,personaje:name});
    if (kind === 'prediccion') {
      const prev = await val(db,'predicciones/'+user);
      if (prev?.resetToken === token) throw Error('Ya registraste una predicción en esta ronda.');
      return {...log,['predicciones/'+user]:{...record,resetToken:token},['stats_usuarios/'+user+'/predicciones_totales']:increment(1)};
    }
    if (normal || rescue) throw Error('Ya usaste tu voto en esta ronda.');
    const saving = kind === 'rescate';
    if (Boolean(inCd(cd,now())) !== saving) throw Error('El estado del campeón cambió. Revisá la sala de rescate.');
    const changes = {...log,[(saving?'rescatadores/':'votantes/')+user]:record,[(saving?'rescates/':'votos/')+name]:increment(1)};
    if (!saving && cfg.primer_votante?.resetToken !== token) {
      changes['config/primer_votante'] = {username:user,usernameOriginal:display,fecha:now(),resetToken:token};
      changes['stats_usuarios/'+user+'/primer_voto_ronda'] = increment(1);
    }
    if (saving) {
      changes['stats_usuarios/'+user+'/rescates_emitidos'] = increment(1);
      const rescates = await val(db,'rescates') || {};
      rescates[name] = (rescates[name] || 0)+1;
      if (rescates[name] >= Math.ceil((cfg.total_miembros || 41)/2)) Object.assign(changes, await finish(db,cfg,name,'rescate',await val(db,'votos') || {},rescates));
    }
    return changes;
  });
}

export function settle(db, mode, expected) {
  return roundWrite(db,async () => {
    const cfg = await val(db,'config') || {};
    const time = now();
    if (roundId(cfg) !== expected || (mode !== 'close' && !closed(cfg,time))) return;
    const winner = cfg.ganador_rescate || cfg.ganador_final;
    if (winner && cfg.predicciones_resueltas_token === expected && await val(db,'historial/'+expected+'_'+winner)) return;
    const [votes,cd,rescues] = await Promise.all(['votos','cooldowns','rescates'].map(async p=>await val(db,p) || {}));
    if (winner) return finish(db,cfg,winner,cfg.ganador_rescate ? 'rescate':cfg.ganador_metodo || 'votos',votes,rescues,true);
    const ranked = roster.filter(n => votes[n] > 0 && !inCd(cd[n],time)).sort((a,b)=>votes[b]-votes[a]);
    const tied = ranked.filter(n=>votes[n] === votes[ranked[0]]);
    if (!tied.length) return mode === 'close' ? {'config/fin_votacion':time,...audit(db,'admin','cerrar_votacion','Ronda cerrada sin votos')} : null;
    if (tied.length === 1) return finish(db,cfg,tied[0],'votos',votes,rescues);
    if (mode !== 'force' && !cfg.rng_trigger_at) return {'config/fin_votacion':cfg.fin_votacion > 0 && cfg.fin_votacion <= time ? cfg.fin_votacion:time,'config/rng_trigger_at':time+60000,...audit(db,'rng','programado','Desempate programado en un minuto')};
    if (mode !== 'force' && cfg.rng_trigger_at > time) return;
    const roll = rollTie(tied);
    roll.votosMax = votes[tied[0]];
    return {...await finish(db,cfg,roll.ganador,'rng',votes,rescues),'config/rng_resultado':roll};
  });
}

export function reopen(db) {
  return roundWrite(db,async () => {
    const cfg = await val(db,'config') || {};
    const token = roundId(cfg);
    const winner = cfg.ganador_rescate || cfg.ganador_final;
    const changes = {'config/fin_votacion':0,'config/ganador_rescate':'','config/ganador_final':'','config/ganador_metodo':'','config/rng_resultado':null,'config/rng_trigger_at':0,'config/predicciones_resueltas_token':null};
    if (winner) {
      changes['historial/'+token+'_'+winner] = null;
      for (const [user,p] of Object.entries(await val(db,'predicciones') || {})) {
        if (p.resetToken !== token || !p.resuelta || !Object.hasOwn(p,'rachaAntes')) continue;
        changes['stats_usuarios/'+user+'/streak_actual'] = p.rachaAntes;
        changes['stats_usuarios/'+user+'/streak_maximo'] = p.maxAntes;
        if (p.acertada) changes['stats_usuarios/'+user+'/predicciones_acertadas'] = increment(-1);
        const {resuelta,acertada,rachaAntes,maxAntes,...pending} = p;
        changes['predicciones/'+user] = pending;
      }
    }
    return {...changes,...audit(db,'admin','reabrir_votacion','Ronda reabierta')};
  });
}

