import {db} from './common.js';
import {get, onValue, ref} from './vendor/firebase-database.js';
import {roundId, roundWrite, now, normalized} from './round.js';
import {extraLines,fullyRevealed} from './shadow-extra.js';
import {shadowVoice} from './shadow-voice.js';
import {bonusLicks, dailyReserve, reserveLimit, sameReserve} from './shadow-wallet.js';
import {certificateTotal, certificateName, certificateSize} from './shadow-achievement.js';
import {act, catalogFor, clanDay, personalCase, subject, suspects, shadowClosed, editionOf, finalistAt} from './shadow-round.js';
import {glassIsClean,passLabel} from './shadow-stages.js';
import {celebrateShadow,endCheer} from './shadow-cheer.js';
import {drawGlass} from './shadow-glass.js';

const byId=id=>document.getElementById(id);
const dialog=byId('shadowDialog'), guess=byId('shadowGuess');
let user='', token='', answer='', data=null, connected=false, loaded=false, readError=false;
let config=null, closed=false, localSweep=0, listKey='';
let binding=0, unsubscribe, busy=false, returnToGame=false, note='', day='', lastGlass='', previousCount=0;

export const hasBoyFriend=()=>data?.boyfriend===true;
export const shadowMarks=()=>certificateTotal(data);
function say(text){ const el=byId('shadowStatus'); if(el.textContent!==text) el.textContent=text; }
function refresh() {
  day=clanDay(now());closed=shadowClosed(config,now());
  const play=personalCase(data,token);
  const won=Boolean(play.acertado), n=play.pistas || 0;
  const limit=reserveLimit(config), reserve=dailyReserve(data,day,limit);
  const bonus=bonusLicks(data);
  const balance=reserve.dia===day ? (reserve.saldo || bonus) : 0;
  const extras=play.extras || 0, finished=extras>=extraLines.length;
  const missed=data?.ultimoFallo>=day;
  const online=connected && navigator.onLine!==false;
  const canAct=user && token && loaded && online && !closed && !busy;
  byId('shadowTeaserState').textContent=closed?(won?'Resuelto · Ronda cerrada':'Ronda cerrada'):won?'Misterio resuelto':missed?'Volvé mañana':n?'Seguir investigando':'Jugar al misterio';
  recordVisit(reserve);
  if(!dialog.open) return;
  byId('shadowLogin').hidden=Boolean(user);
  byId('shadowRetry').hidden=!readError;
  byId('shadowPlay').hidden=!user;
  byId('shadowForm').hidden=!user || won;
  byId('shadowSolved').hidden=!won;
  byId('shadowAnswer').textContent=won?answer:'';
  const total=shadowMarks(), certificate=byId('shadowCertificate');
  const earned=won && total>0 && total%certificateSize===0;
  certificate.hidden=!earned;
  certificate.textContent=earned ? 'Medalla obtenida · '+certificateName+' ×'+(total/certificateSize) : '';
  const edition=editionOf(config), threshold=finalistAt(play,edition), shortlist=n>=threshold;
  byId('shadowVoice').textContent=shadowVoice(token,n,balance,won,missed);
  byId('shadowGuessLabel').textContent=shortlist?'¿Cuál de los tres finalistas es?':'¿A quién reconocés?';
  const optionsKey=JSON.stringify([token,answer,edition,shortlist]);
  if(listKey!==optionsKey){
    const previousChoice=guess.value;
    listKey=optionsKey;
    guess.replaceChildren(new Option('Elegí un personaje…',''));
    if(token) {
      const choices=suspects(token,answer,edition,n,threshold,catalogFor(config));
      for(const name of choices) guess.add(new Option(name,name));
      if(choices.includes(previousChoice)) guess.value=previousChoice;
    }
  }
  byId('shadowBalance').textContent=user && loaded && online ? 'Tu reserva · '+reserve.saldo+' / '+limit+(bonus?' · +'+bonus+' de Admin':'') : '';
  byId('shadowLick').disabled=!canAct || !balance || finished;
  byId('shadowLickText').textContent=finished?'Pasadas completadas':!balance?'Reserva agotada':fullyRevealed(play)?'Dar otra pasada':'Dar un lengüetazo';
  for (const option of guess.options) {
    if(!option.value) continue;
    const ruledOut=Boolean(play.descartados?.[normalized(option.value)]);
    if(option.disabled!==ruledOut) {
      option.disabled=ruledOut;
      option.textContent=option.value+(ruledOut?' · descartado':'');
    }
    if(ruledOut && option.selected) guess.value='';
  }
  guess.disabled=!canAct || won || missed;
  byId('shadowSend').disabled=guess.disabled || !guess.value;
  byId('shadowMeter').textContent=won?'Identidad revelada':passLabel(n);
  byId('shadowFigure').classList.toggle('revealed',won);
  const previous=config?.sombra?.anterior;
  byId('shadowPrevious').hidden=!previous;
  byId('shadowPrevious').textContent=previous?'Misterio anterior · '+previous:'';
  const canvas=byId('shadowCanvas');
  canvas.setAttribute('aria-label',won?'Retrato de '+answer:'Vidrio cubierto de glaseado blanco. '+n+' pasadas.');
  const glassKey=JSON.stringify([user,token,answer,n,won,edition,extras]);
  if(glassKey!==lastGlass){
    const sweep=localSweep===n && n>0 && lastGlass!=='' && n===previousCount+1;
    if(sweep) localSweep=0;
    if(sweep && matchMedia('(max-width:560px)').matches) dialog.scrollTop=0;
    lastGlass=glassKey;previousCount=n;
    drawGlass(answer,n,won,sweep,edition,extras);
  }
  const info = !token?'Esperando los datos de la ronda.': !user?'Ingresá con tu cuenta del clan para jugar.':
    readError?'No se pudo leer tu progreso.': !online?'Sin conexión. Volvé a conectarte para jugar.':
    !loaded?'Consultando tu progreso…':busy?'Guardando…':closed && !won?'La ronda está cerrada. Tu progreso queda guardado.':note || (finished?'Completaste las cinco pasadas extra de esta ronda.':won?'Identidad descubierta. Podés seguir usando tu reserva con este personaje.':
    missed?'Hoy no acertaste. Podés volver a responder mañana.':
    glassIsClean(n)?(balance?'El vidrio está limpio. Otra pasada usa un lengüetazo de tu reserva. Podés responder ahora.':'El vidrio está limpio. Podés responder ahora.'):!balance?'Mañana se renueva tu lengüetazo. Hoy todavía podés responder.':'Podés responder aunque todavía no hayas usado la reserva.');
  say(info);
}
let claiming=false, retryVisit=0;
function recordVisit(projected) {
  if (claiming || !config || !user || !loaded || !connected || !navigator.onLine || document.hidden ||
      sameReserve(data?.reserva,projected) || Date.now()<retryVisit) return;
  const who=user, generation=binding;
  claiming=true;
  roundWrite(db,async()=>{
    if (generation!==binding || document.hidden) return;
    const [account,settings]=await Promise.all([get(ref(db,'usuarios/'+who)),get(ref(db,'config'))]);
    if (generation!==binding || !settings.exists() || !account.child('pin_hash').exists()) return;
    const state=account.child('sombra').val();
    const updated=dailyReserve(state,clanDay(now()),reserveLimit(settings.val()));
    if (sameReserve(state?.reserva,updated)) return;
    return {['usuarios/'+who+'/sombra/reserva']:updated};
  }).catch(()=>{retryVisit=Date.now()+30000;}).finally(()=>{
    claiming=false;
    if (generation!==binding) refresh();
  });
}
export function setShadowRound(cfg) {
  config=cfg;
  const next=cfg?String(roundId(cfg)):'', name=cfg?subject(cfg):'';
  if(cfg?.mantenimiento && dialog.open) dialog.close();
  if(next!==token || name!==answer) {
    token=next;answer=name;note='';localSweep=0;lastGlass='';
    listKey='';guess.value='';
  }
  refresh();
}
function bindUser() {
  unsubscribe?.();const generation=++binding;
  loaded=false;readError=false;data=null;note='';busy=false;localSweep=0;lastGlass='';retryVisit=0;
  if(user) unsubscribe=onValue(ref(db,'usuarios/'+user+'/sombra'),snap=>{
    if(generation!==binding) return;
    const old=shadowMarks(), hadBadge=hasBoyFriend(); data=snap.val();loaded=true;readError=false;
    refresh();
    if(shadowMarks()!==old || hasBoyFriend()!==hadBadge) document.dispatchEvent(new Event('shadowmedal'));
  },()=>{
    if(generation!==binding) return;
    readError=true;loaded=false;refresh();
  });
  refresh();
}
export function setShadowAccount(name) {
  name=name || ''; if(name===user) return;
  user=name;
  bindUser();
  if(!user && dialog.open) dialog.close();
  if(user && returnToGame) { returnToGame=false;open(); }
}
function open() {
  if(!dialog.open) dialog.showModal();
  dialog.scrollTop=0;lastGlass='';localSweep=0;note='';refresh();
}
async function submit(action) {
  if(!dialog.open || busy || !user || !token || !loaded) return;
  const who=user, round=token, portrait=answer, choice=guess.value, generation=binding;
  const localDay=clanDay(now());
  const before=personalCase(data,round);
  const requestedPass=action==='lick' ? (before.pistas || 0)+(before.extras || 0)+1 : 0;
  busy=true;localSweep=requestedPass;note='';refresh();
  try {
    const committed=await roundWrite(db,async()=>{
      const [cfgSnap,account]=await Promise.all([get(ref(db,'config')),get(ref(db,'usuarios/'+who))]);
      const cfg=cfgSnap.val();
      if(user!==who || !account.child('pin_hash').exists()) throw Error('Ingresá de nuevo para jugar.');
      if(!cfg || String(roundId(cfg))!==round || subject(cfg)!==portrait) throw Error('Cambió la ronda. Abrí el nuevo misterio.');
      if(shadowClosed(cfg,now())) throw Error('La ronda ya se cerró.');
      if(cfg.mantenimiento) throw Error('La arena está en mantenimiento.');
      if(clanDay(now())!==localDay) throw Error('Empezó otro día. Volvé a confirmar.');
      const existing=account.child('sombra').val();
      const current=personalCase(existing,round);
      if(requestedPass && ((current.pistas || 0)+(current.extras || 0)!==requestedPass-1 || Boolean(current.acertado)!==Boolean(before.acertado))) throw Error('El progreso cambió. Revisá tu reserva antes de dar otra pasada.');
      const state=act(existing,round,portrait,localDay,action,choice,editionOf(cfg),reserveLimit(cfg),catalogFor(cfg));
      return {['usuarios/'+who+'/sombra']:state};
    });
    if(committed && generation===binding && token===round && action==='guess') {
      guess.value='';
      if (choice===portrait && dialog.open) celebrateShadow();
    }
  } catch(error) {
    if(generation===binding && token===round) {localSweep=0;note=error.message;}
  } finally {
    if(generation===binding){busy=false;refresh();}
  }
}
byId('shadowLaunch').hidden=false;
byId('shadowLaunch').addEventListener('click',open);
byId('shadowClose').addEventListener('click',()=>dialog.close());
byId('shadowLogin').addEventListener('click',()=>{
  returnToGame=true;dialog.close();byId('btnAbrirLogin').click();
});
new MutationObserver(()=>{
  if(returnToGame && byId('loginOverlay').classList.contains('hidden')) returnToGame=false;
}).observe(byId('loginOverlay'),{attributes:true,attributeFilter:['class']});
byId('shadowRetry').addEventListener('click',bindUser);
const lickButton=byId('shadowLick');
lickButton.addEventListener('keydown',event=>{
  if(event.repeat && (event.key==='Enter' || event.key===' ')) event.preventDefault();
});
lickButton.addEventListener('click',()=>{
  if(!lickButton.disabled && dialog.open) submit('lick');
});
byId('shadowForm').addEventListener('submit', e=>{e.preventDefault();if(!byId('shadowSend').disabled)submit('guess');});
guess.addEventListener('change',refresh);
dialog.addEventListener('close',()=>{endCheer();lastGlass='';localSweep=0;guess.value='';});
onValue(ref(db,'.info/connected'),s=>{connected=s.val()===true;refresh();});
window.addEventListener('offline',refresh);
window.addEventListener('online',refresh);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
setInterval(()=>{if(retryVisit && Date.now()>=retryVisit){retryVisit=0;refresh();} if(day!==clanDay(now()) || closed!==shadowClosed(config,now())){note='';refresh();}},1000);

