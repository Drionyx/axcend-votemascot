import {extraLines,fullyRevealed} from './shadow-extra.js';
import {celebrateShadow} from './shadow-cheer.js';
import {openingPasses,passLabel} from './shadow-stages.js';
import {names, suspects} from './shadow-round.js';
import {shadowVoice} from './shadow-voice.js';
import {drawGlass} from './shadow-glass.js';

// La práctica vive en esta pestaña y usa el mismo vidrio y las mismas pasadas que la arena.
export function startPractice() {
  const byId=id=>document.getElementById(id);
  const select=byId('practiceCharacter'), guess=byId('practiceGuess');
  for(const name of names) select.add(new Option(name,name));
  select.value='Tyrantino';
  let edition=2, passes=0, extras=0, solved=false, attempt='', suspectsKey='';
  function draw(sweep=false) {
    const name=select.value, token='práctica';
    const key=name+'|'+edition+'|'+(passes>=openingPasses);
    if (key!==suspectsKey) {
      const previous=guess.value;
      const choices=suspects(token,name,edition,passes);
      guess.replaceChildren(new Option('Elegí un sospechoso…',''));
      for(const choice of choices) guess.add(new Option(choice,choice));
      guess.value=choices.includes(previous)?previous:'';
      suspectsKey=key;
    }
    byId('practiceMeter').textContent=solved?'Identidad revelada':passLabel(passes);
    byId('practiceVoice').textContent=shadowVoice(token,passes,passes===0?1:0,solved);
    byId('practiceLick').disabled=extras>=extraLines.length;
    guess.disabled=solved;
    byId('practiceSend').disabled=solved || !guess.value;
    byId('practiceResult').textContent=attempt;
    byId('shadowCanvas').setAttribute('aria-label',solved?'Retrato de '+name:'Vidrio de práctica con '+passes+' pasadas');
    drawGlass(name,passes,solved,sweep,edition,extras);
  }
  function restart() {
    passes=0;extras=0;solved=false;attempt='';guess.value='';draw();
  }
  select.addEventListener('change',restart);
  byId('practiceReset').addEventListener('click',restart);
  byId('practiceLick').addEventListener('click',()=>{
    if (extras>=extraLines.length) return;
    if (fullyRevealed({acertado:solved,pistas:passes})) extras++;
    else passes++;
    attempt='';draw(true);
  });
  guess.addEventListener('change',()=>{byId('practiceSend').disabled=solved || !guess.value;});
  byId('practiceForm').addEventListener('submit',e=>{
    e.preventDefault();
    if (!guess.value || solved) return;
    solved=guess.value===select.value;
    attempt=solved?'Acertaste. Era '+select.value+'.':'Ese nombre no era. Podés probar otro ahora.';
    draw();
    if (solved) celebrateShadow();
  });
  restart();
  return next=>{if (edition!==next) {edition=next;restart();}};
}

