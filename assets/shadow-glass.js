import {reducedMotion} from './motion.js';
import {softenPortrait} from './shadow-blur.js';
import {endCheer,showCharacterSpeech} from './shadow-cheer.js';
import {passStyles,stages,openingPasses,sweepBands,glassIsClean} from './shadow-stages.js';

const portraits = new Map(JSON.parse(document.getElementById('shadowPortraits').textContent));
const W = 256, H = 568;
const plate = document.getElementById('shadowCanvas');
plate.width = W; plate.height = H;
const ctx = plate.getContext('2d');
const coat = document.createElement('canvas');
coat.width = W; coat.height = H;
const ink = coat.getContext('2d',{willReadFrequently:true});
const surface = document.createElement('canvas');
surface.width=W; surface.height=H;
const g=surface.getContext('2d');

// La base es opaca incluso entre las gotas. Sólo los trazos de las pistas la perforan.
function layer(edge, top, bottom, glow) {
  const path = new Path2D();
  path.moveTo(-10,-10); path.lineTo(410,-10);
  edge(path); path.closePath();
  const fill=g.createLinearGradient(0,0,110,bottom);
  fill.addColorStop(0,top); fill.addColorStop(.72,'#f6f4ee'); fill.addColorStop(1,glow);
  g.save(); g.fillStyle=fill; g.shadowColor='#4d677360';g.shadowBlur=9;g.shadowOffsetY=5;g.fill(path);g.restore();
  g.strokeStyle='#ffffffb3';g.lineWidth=2;g.stroke(path);
}
function makeSurface() {
  const base=g.createLinearGradient(0,0,400,500);
  base.addColorStop(0,'#c3d2d1');base.addColorStop(.45,'#fff9eb');base.addColorStop(1,'#a8bdc1');
  g.fillStyle=base;g.fillRect(0,0,400,500);
  layer(p=>{
    p.lineTo(410,375);p.bezierCurveTo(358,324,328,383,304,414);
    p.bezierCurveTo(281,444,280,482,256,477);p.bezierCurveTo(231,472,260,427,235,420);
    p.bezierCurveTo(194,404,165,456,136,434);p.bezierCurveTo(103,411,72,452,-10,469);
  },'#fdfcf4',480,'#d6dede');
  layer(p=>{
    p.lineTo(410,247);p.bezierCurveTo(353,198,311,252,288,275);
    p.bezierCurveTo(268,298,281,349,256,355);p.bezierCurveTo(227,361,251,296,221,299);
    p.bezierCurveTo(178,303,165,345,126,334);p.bezierCurveTo(74,316,71,373,-10,390);
  },'#fbf8ec',365,'#dfe5e0');
  layer(p=>{
    p.lineTo(410,102);p.bezierCurveTo(345,116,322,82,278,109);
    p.bezierCurveTo(225,138,236,193,205,185);p.bezierCurveTo(184,179,203,150,183,148);
    p.bezierCurveTo(151,142,138,203,103,202);p.bezierCurveTo(61,202,70,251,45,258);
    p.bezierCurveTo(17,266,36,224,-10,245);
  },'#fffdf4',254,'#dce5e2');
  // Un pliegue más corto cerca del borde deja visible la curva de la capa inferior.
  layer(p=>{
    p.lineTo(410,27);p.bezierCurveTo(372,20,357,34,340,39);
    p.bezierCurveTo(315,47,292,28,271,37);p.bezierCurveTo(252,44,252,61,238,62);
    p.bezierCurveTo(225,63,229,43,217,44);p.bezierCurveTo(197,46,184,78,155,76);
    p.bezierCurveTo(122,73,111,61,91,78);p.bezierCurveTo(76,90,76,105,61,108);
    p.bezierCurveTo(45,110,49,87,33,88);p.bezierCurveTo(17,90,8,101,-10,99);
  },'#fffef8',112,'#e0e6e2');
  // Reflejos alargados y gotas pequeñas dan volumen al glaseado.
  for(const [x,y,rx,ry,angle] of [[85,64,65,7,-.24],[263,63,34,4,-.20],[112,254,34,4,-.28],[294,380,21,3,-.38]]){
    g.save();g.translate(x,y);g.rotate(angle);g.scale(rx,ry);
    const shine=g.createRadialGradient(0,0,0,0,0,1);
    shine.addColorStop(0,'#ffffffd9');shine.addColorStop(.5,'#ffffff70');shine.addColorStop(1,'#ffffff00');
    g.fillStyle=shine;g.fillRect(-1,-1,2,2);g.restore();
  }
  for(const [x,y,r] of [[336,147,7],[349,136,3],[73,290,4],[104,398,7],[319,445,4]]){
    g.save();g.translate(x,y);g.rotate(-.4);g.scale(1,.65);
    const bead=g.createRadialGradient(-r*.3,-r*.5,.5,0,0,r);
    bead.addColorStop(0,'#ffffff');bead.addColorStop(.45,'#fbfaf0');bead.addColorStop(1,'#b6c6c6');
    g.fillStyle=bead;g.beginPath();g.arc(0,0,r,0,Math.PI*2);g.fill();g.restore();
  }
  g.lineCap='round';
  for (const [x,y,l] of [[42,218,22],[204,157,11],[255,316,20],[254,447,12],[331,230,13]]) {
    g.beginPath();g.moveTo(x,y);g.quadraticCurveTo(x+4,y+l*.45,x-2,y+l);
    g.strokeStyle='#ffffffd4';g.lineWidth=4;g.stroke();
  }
}
if (g) {
  g.scale(W/400,H/500);
  makeSurface();
}
function hole(x,y,index,amount) {
  if (!amount) return;
  const {length,thickness}=passStyles[index];
  const direction=index%2?-1:1;
  const at=t=>[x-length+t*length*2,y+direction*(14-28*t)-Math.sin(Math.PI*t)*8];
  ink.fillStyle='#000';
  for(let k=0;k<=36;k++) {
    const t=amount*k/36,[a,b]=at(t);
    const radius=thickness*(.28+.23*Math.sin(Math.PI*t)) * Math.min(1,amount*5);
    ink.beginPath();ink.arc(a,b,radius,0,Math.PI*2);ink.fill();
  }
  return at(amount);
}
const coverage=document.getElementById('shadowCoverage');
function reportClean(percent) {
  const label=percent+' % limpio';
  if(coverage.textContent!==label) coverage.textContent=label;
}
function cleanPercent() {
  const pixels=ink.getImageData(0,0,W,H).data;
  let covered=0;
  for(let i=3;i<pixels.length;i+=4) covered+=pixels[i];
  return covered ? Math.min(99,Math.round(100*(1-covered/(255*W*H)))) : 100;
}

// Las franjas se unen de abajo hacia arriba. El último barrido alcanza las cuatro esquinas.
function wipeTo(bands,progress,fromLeft) {
  if(bands<=0 || progress<=0) return;
  const top=H*(1-Math.min(bands,sweepBands)/sweepBands);
  const edge=x=>top + 9*Math.sin(x/W*Math.PI*2+.3) - 5*Math.sin(x/W*Math.PI*3);
  ink.save();
  if(progress<1) {
    const width=W*progress;
    ink.beginPath();ink.rect(fromLeft?0:W-width,0,width,H);ink.clip();
  }
  if(bands>=sweepBands) ink.clearRect(0,0,W,H);
  else {
    ink.beginPath();ink.moveTo(0,H);ink.lineTo(0,edge(0));
    for(let x=8;x<=W;x+=8) ink.lineTo(x,edge(x));
    ink.lineTo(W,H);ink.closePath();ink.fill();
  }
  ink.restore();
}
const softened=document.createElement('canvas');
softened.width=W;softened.height=H;
const buffer=softened.getContext('2d',{willReadFrequently:true});
let original=null,blurRadius=0;
function paintPortrait(target,image,width,height){
  const scale=Math.min(width/image.naturalWidth,height/image.naturalHeight);
  target.drawImage(image,(width-image.naturalWidth*scale)/2,(height-image.naturalHeight*scale)/2,image.naturalWidth*scale,image.naturalHeight*scale);
}
let version=0, raf=0, cachedSource='', portrait=null, ready=false, repaint=()=>{};
// Acerca cada pasada a una zona visible del nuevo splash si hay margen transparente.
function cluePoints(pixels, details) {
  return details.map(([x,y])=>{
    const tx=x*W/100, ty=y*H/100;
    let best=Infinity, point=[x,y];
    for(let row=3;row<H;row+=6) for(let col=3;col<W;col+=6) {
      if(pixels.data[(row*W+col)*4+3]<200) continue;
      const distance=(col-tx)**2+(row-ty)**2;
      if(distance<best) {best=distance;point=[col*100/W,row*100/H];}
    }
    return point;
  });
}
let alpha=null, points=[], pointsEdition=null;
export function drawGlass(name, count, solved, sweep=false, edition=2, extras=0) {
  const src=portraits.get(name) || '';
  const ticket=++version;
  showCharacterSpeech(solved,name,extras);
  coverage.dataset.count=String(count);
  if(!solved || src!==cachedSource) endCheer();
  cancelAnimationFrame(raf);
  const tongue=document.getElementById('glassTongue');
  tongue.hidden=true;
  if (!ctx || !ink || !g || !buffer) return;
  if (src!==cachedSource) {
    cachedSource=src;ready=false;portrait=null;
    original=null;alpha=null;pointsEdition=null;blurRadius=0;
    if (src) {
      const image=new Image(); portrait=image;
      image.onload=()=>{
        if(portrait!==image) return;
        buffer.clearRect(0,0,W,H);
        paintPortrait(buffer,image,W,H);
        alpha=buffer.getImageData(0,0,W,H);
        buffer.save();buffer.globalCompositeOperation='destination-over';
        buffer.fillStyle='#20272d';buffer.fillRect(0,0,W,H);buffer.restore();
        original=buffer.getImageData(0,0,W,H);
        ready=true;repaint();
      };
      image.onerror=()=>{if(portrait===image) cachedSource='';};
      image.src=src;
    }
  }
  function paint(progress=1) {
    if(ticket!==version) return;
    ctx.fillStyle='#20272d';ctx.fillRect(0,0,W,H);
    if (ready && (solved || (glassIsClean(count) && progress===1))) {
      ctx.putImageData(original,0,0);reportClean(100);return;
    }
    if (ready && original && count>0) {
      if(count>openingPasses) ctx.putImageData(original,0,0);
      else {
        const radius=passStyles[count-1].blur;
        if (blurRadius!==radius) {
          softenPortrait(original,buffer,radius);
          blurRadius=radius;
        }
        ctx.drawImage(softened,0,0);
      }
    }
    ink.globalCompositeOperation='source-over';ink.clearRect(0,0,W,H);ink.drawImage(surface,0,0);
    ink.globalCompositeOperation='destination-out';ink.strokeStyle='#000';
    if(alpha && pointsEdition!==edition) {
      points=cluePoints(alpha,stages(name,edition));pointsEdition=edition;
    }
    ink.save();ink.scale(W/400,H/500);
    for(let i=0;ready && i<count && i<points.length;i++) {
      const tip=hole(points[i][0]*4,points[i][1]*5,i,i===count-1?progress:1);
      if (tip && progress<1 && i===count-1) {
        tongue.hidden=false;tongue.style.left=(tip[0]/4)+'%';tongue.style.top=(tip[1]/5)+'%';
      }
    }
    ink.restore();
    if (count>openingPasses) {
      const band=count-openingPasses, fromLeft=band%2===1;
      wipeTo(band-1,1,fromLeft);
      wipeTo(band,progress,fromLeft);
      if (progress<1) {
        tongue.hidden=false;
        tongue.style.left=(100*(fromLeft?progress:1-progress))+'%';
        tongue.style.top=band>sweepBands?'50%':(100*(1-(band-.5)/sweepBands))+'%';
      }
    }
    ctx.drawImage(coat,0,0);
    if(progress===1) reportClean(count ? cleanPercent() : 0);
  }
  repaint=()=>paint(1);
  if (!sweep || reducedMotion.matches || !count || solved || document.hidden) { paint(); return; }
  const start=performance.now();
  const tick=time=>{
    if(ticket!==version) return;
    const t=reducedMotion.matches?1:Math.max(0,Math.min(1,(time-start)/620));
    paint(1-(1-t)**2);
    if(t<1) raf=requestAnimationFrame(tick);else tongue.hidden=true;
  };
  paint(0);raf=requestAnimationFrame(tick);
}
