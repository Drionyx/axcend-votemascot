// Paisajes en un encuadre común. Las posiciones son deterministas para que
// la versión quieta conserve la misma composición que la animada.
const W = 640, H = 210, tau = Math.PI * 2;
const stars = Array.from({length:48}, (_, i) => ({
  x: ((i * 257 + 39) % 641), y: ((i * 89 + 23) % 211),
  phase: i * 2.39, size: 1 + (i % 5) * .48
}));

function gradient(ctx, top, bottom) {
  const g = ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,top); g.addColorStop(1,bottom);
  ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
}
function glow(ctx,x,y,r,inner) {
  const g=ctx.createRadialGradient(x,y,0,x,y,r);
  g.addColorStop(0,inner); g.addColorStop(1,'transparent');
  ctx.fillStyle=g; ctx.fillRect(x-r,y-r,r*2,r*2);
}
function disc(ctx,x,y,r,color) {
  ctx.fillStyle=color; ctx.beginPath(); ctx.arc(x,y,r,0,tau); ctx.fill();
}
function ellipse(ctx,x,y,rx,ry,angle,color,width=1) {
  ctx.strokeStyle=color; ctx.lineWidth=width; ctx.beginPath();
  ctx.ellipse(x,y,rx,ry,angle,0,tau); ctx.stroke();
}
function spark(ctx,x,y,r,color) {
  ctx.fillStyle=color; ctx.beginPath(); ctx.moveTo(x,y-r*1.9);
  ctx.quadraticCurveTo(x,y-1,x+r,y); ctx.quadraticCurveTo(x+1,y,x,y+r*1.9);
  ctx.quadraticCurveTo(x,y+1,x-r,y); ctx.quadraticCurveTo(x-1,y,x,y-r*1.9); ctx.fill();
}
function ridge(ctx,points,fill,rim) {
  ctx.beginPath(); ctx.moveTo(0,points[0][1]);
  for (const [x,y] of points) ctx.lineTo(x,y);
  if (rim) {ctx.lineWidth=1.5; ctx.strokeStyle=rim; ctx.stroke();}
  ctx.lineTo(W,H); ctx.lineTo(0,H); ctx.closePath(); ctx.fillStyle=fill; ctx.fill();
}

// Silueta de mantarraya. El ala varía suavemente con el aleteo.
function manta(ctx,x,y,scale,t) {
  const lift=6*Math.sin(t*.95);
  ctx.save();ctx.translate(x,y);ctx.rotate(-.13);ctx.scale(scale,scale);
  ctx.beginPath();ctx.moveTo(14,-5);
  ctx.bezierCurveTo(3,-10,-10,-15,-41,-30+lift);
  ctx.quadraticCurveTo(-36,-10,-21,-2);
  ctx.quadraticCurveTo(-11,5,-24,13);
  ctx.quadraticCurveTo(-5,12,10,18);
  ctx.quadraticCurveTo(27,26,38,31-lift);
  ctx.quadraticCurveTo(35,13,24,2);
  ctx.quadraticCurveTo(34,-6,28,-9);
  ctx.quadraticCurveTo(24,-8,22,-6);
  ctx.quadraticCurveTo(20,-11,17,-12);ctx.closePath();
  const wing=ctx.createLinearGradient(-15,-22,18,23);
  wing.addColorStop(0,'#75eee8');wing.addColorStop(.45,'#3298b7');wing.addColorStop(1,'#165d91');
  ctx.fillStyle=wing;ctx.fill();ctx.strokeStyle='#a6fff0c2';ctx.lineWidth=1.15;ctx.stroke();
  ctx.beginPath();ctx.moveTo(-16,4);ctx.bezierCurveTo(-38,7,-46,27,-69,21+lift*.4);
  ctx.strokeStyle='#9deee5bf';ctx.stroke();
  ctx.fillStyle='#c5fff0';for(let i=0;i<7;i++)disc(ctx,6-i*3,-5-i*.95,1.2-i*.08,'#b9f9ea');
  ctx.restore();
}
function water(ctx,t) {
  gradient(ctx,'#091d4d','#1979a2');
  glow(ctx,480,62,128,'#56d9ff65');
  // Las curvas agrupadas forman crestas de agua con líneas de espuma.
  for (let band=0; band<4; band++) {
    const level = 60 + band*36;
    const wave=x=>level+16*Math.sin(x/72+t*.36+band*1.45)+8*Math.sin(x/42-t*.21+band);
    const points=[];
    for(let x=0;x<=W;x+=5) points.push([x,wave(x)]);
    ridge(ctx,points,['#165b8a','#156e98','#10567e','#123c65'][band],'#88f3ffba');
    for(let j=1;j<=4;j++){
      ctx.beginPath();
      for(let x=0;x<=W;x+=5) ctx.lineTo(x,wave(x+j*4)+j*(3+j*.55));
      ctx.strokeStyle=j===1?'#9aebff85':'#88d8ff36';ctx.lineWidth=.8;ctx.stroke();
    }
  }
  manta(ctx,393+6*Math.sin(t*.26),62+4*Math.sin(t*.45),.47,t+2);
  manta(ctx,468+10*Math.sin(t*.22),90+6*Math.sin(t*.42),1.03,t);
  for(const [i,p] of stars.slice(0,18).entries()){
    const y=H-((p.y+t*(3+i%4))%(H+14));
    const x=p.x+4*Math.sin(t*.45+p.phase),r=p.size*1.3;
    ellipse(ctx,x,y,r,r,0,'#b7f4ff9e');disc(ctx,x-r*.3,y-r*.45,.8,'#eaffff');
  }
}
function fire(ctx,t) {
  gradient(ctx,'#280c26','#b73b3e');glow(ctx,454,155,195,'#ff8b3bcb');
  ridge(ctx,[[0,137],[75,116],[128,126],[229,90],[280,112],[340,87],[377,97],[441,49],[477,59],[528,107],[582,96],[640,110]],'#69243a','#ed777673');
  // La caldera ilumina dos coladas sobre la ladera.
  glow(ctx,447,53,44,'#ff863c78');
  ctx.beginPath();ctx.moveTo(443,50);ctx.lineTo(453,55);ctx.lineTo(451,62);ctx.lineTo(463,66);
  ctx.lineTo(459,74);ctx.lineTo(476,83);ctx.lineTo(481,97);ctx.lineTo(497,108);
  ctx.strokeStyle='#ffa562';ctx.lineWidth=2;ctx.stroke();
  ctx.beginPath();ctx.moveTo(454,64);ctx.lineTo(445,69);ctx.lineTo(449,77);ctx.lineTo(437,86);
  ctx.strokeStyle='#ec684f';ctx.lineWidth=1.4;ctx.stroke();
  for(let i=0;i<9;i++){
    const k=(i/9+t*.12)%1;
    disc(ctx,444+(i%3-1)*19*k,51-30*Math.sin(k*Math.PI),1.6-k,'#ffe1a0');
  }
  ridge(ctx,[[0,169],[106,147],[188,158],[287,133],[360,152],[470,106],[550,128],[640,102]],'#48162d');
  for(let j=0;j<5;j++){
    ctx.beginPath();
    for(let x=0;x<=W;x+=4){const y=171+j*10+16*Math.sin(x/94+j*.36+t*.19)+6*Math.sin(x/34+j*.95);ctx.lineTo(x,y);}
    ctx.strokeStyle=j===1?'#ffce7b':'#fc764d';ctx.lineWidth=j===1?2.7:.9;ctx.stroke();
  }
  for(const p of stars.slice(0,36)){
    const y=H-((p.y+t*(6+p.size*3))%(H+12));
    ctx.save();ctx.translate(p.x+7*Math.sin(t*.65+p.phase),y);ctx.rotate(.32);
    ctx.globalAlpha=.5+.4*Math.sin(t*.77+p.phase);ctx.fillStyle='#ffbf75';
    ctx.fillRect(0,0,p.size*.8,p.size*2.4);ctx.restore();
  }
}
function frond(ctx,x,y,length,angle,color) {
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(length/100,length/100);
  ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=1.3;
  ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(6,-54,0,-104);ctx.stroke();
  for(let i=1;i<=9;i++){
    const h=-i*10,span=23*Math.sin(i/10*Math.PI)+4;
    for(const sign of [-1,1]){
      ctx.beginPath();ctx.moveTo(2,h+5);ctx.quadraticCurveTo(sign*span,h+3,sign*span*1.25,h-15);
      ctx.quadraticCurveTo(sign*span*.48,h-13,2,h+5);ctx.fill();
    }
  }
  ctx.restore();
}
function wood(ctx,t) {
  gradient(ctx,'#082e35','#28654d');glow(ctx,461,56,125,'#c4f8a58c');
  for(let i=0;i<10;i++){
    ctx.strokeStyle='#204940';ctx.lineWidth=3+i%4;
    ctx.beginPath();ctx.moveTo(i*75-22,0);ctx.lineTo(i*75-45,H);ctx.stroke();
  }
  for(let i=0;i<14;i++) frond(ctx,i*54-12,H+14,58+(i*29)%85,-.68+(i%4)*.35+.022*Math.sin(t+i),'#105447');
  for(let i=0;i<8;i++) frond(ctx,68+i*83,H+24,63+(i*37)%89,-.78+(i%3)*.73+.037*Math.sin(t*.64+i),'#39876a');
  frond(ctx,550,-15,129,2.42+.025*Math.sin(t*.5),'#164c3a');
  frond(ctx,606,H+12,128,-.51+.024*Math.sin(t*.8),'#123d34');
  for(const p of stars.slice(0,24)){
    const x=p.x+10*Math.sin(t*.34+p.phase), y=p.y+7*Math.cos(t*.43+p.phase);
    ctx.globalAlpha=.6+.3*Math.sin(t*.8+p.phase);
    glow(ctx,x,y,4+p.size*1.6,'#e4ffae85');disc(ctx,x,y,1.15,'#edffc7');
  }
  ctx.globalAlpha=1;
}
function light(ctx,t) {
  gradient(ctx,'#895025','#f4bc60');glow(ctx,461,82,120,'#ffdc7da6');
  ctx.save();ctx.translate(461,82);ctx.rotate(t*.009);
  for(let i=0;i<36;i++){
    ctx.rotate(tau/36);ctx.beginPath();ctx.moveTo(51,-1);ctx.lineTo(580,-6);ctx.lineTo(580,i%3===0?20:5);ctx.closePath();
    ctx.fillStyle=i%3===0?'#ffeaa347':'#fff4b836';ctx.fill();
  }
  ctx.restore();
  disc(ctx,461,82,36,'#fff2bb');
  for(const r of [43,48,63]) ellipse(ctx,461,82,r,r,0,'#ffedacb0',r===48?2:1);
  ridge(ctx,[[0,152],[116,124],[183,134],[245,99],[285,118],[366,106],[427,135],[516,116],[573,97],[640,110]],'#ad6a36');
  ridge(ctx,[[0,173],[96,155],[182,162],[272,145],[330,158],[442,132],[500,139],[569,117],[640,128]],'#78472d','#fbd387');
  for(const p of stars.slice(0,14)) spark(ctx,p.x,p.y,1.5+1.3*(1+Math.sin(p.phase+t*.76)),'#fff3c3cf');
}
function dark(ctx,t) {
  gradient(ctx,'#140b32','#3c215c');glow(ctx,461,92,122,'#9655d6ab');
  for(const p of stars) disc(ctx,p.x,p.y,p.size*.43,'#f0dfffba');
  for(const p of stars.slice(0,9)) spark(ctx,p.x,p.y,1.9+Math.sin(t*.7+p.phase),'#f2d9ff');
  const x=461,y=92;
  disc(ctx,x+3,y-2,40,'#ddb2ff');disc(ctx,x-2,y+1,39,'#22113a');
  for(const r of [55,77,105,126]) ellipse(ctx,x,y,r,r*.27,-.32,'#b47ff090',r===77?1.7:.8);
  for(let i=0;i<3;i++){
    const a=t*(.10+i*.035)+i*2.3,r=[55,77,105][i];
    const u=r*Math.cos(a),v=r*.27*Math.sin(a);
    const px=x+u*Math.cos(-.32)-v*Math.sin(-.32), py=y+u*Math.sin(-.32)+v*Math.cos(-.32);
    glow(ctx,px,py,7,'#cf96ffb0');disc(ctx,px,py,2,'#f5dcff');
  }
}
// El emblema del clan se proyecta sobre una arena de líneas de campo.
const clanBadge = document.querySelector('.clan-key img');
function axn(ctx,t) {
  gradient(ctx,'#0c1d26','#24423f');
  glow(ctx,448,101,138,'#60daca48');
  const floor=133;
  ctx.lineWidth=.8;ctx.strokeStyle='#67b5ab4f';
  ctx.beginPath();
  for(let x=-700;x<=1250;x+=72){
    ctx.moveTo(388+(x-388)*.09,floor);ctx.lineTo(x,H);
  }
  for(const y of [138,145,156,172,196]){
    ctx.moveTo(0,y);ctx.lineTo(W,y);
  }
  ctx.stroke();
  for(const side of [-1,1]){
    const x=449+side*119;
    ctx.beginPath();ctx.moveTo(x+side*34,0);ctx.lineTo(x-side*4,0);
    ctx.lineTo(448+side*43,148);ctx.closePath();ctx.fillStyle='#7ee8cb0e';ctx.fill();
  }
  const y=139;
  for(const [radius,color] of [[90,'#82dfcb6e'],[78,'#85eadaaa'],[64,'#f8c85fc9']])
    ellipse(ctx,448,y,radius,radius*.16,0,color,1.2);
  for(let i=0;i<14;i++){
    const a=t*.17+i*tau/14;
    disc(ctx,448+90*Math.cos(a),y+14.4*Math.sin(a),i%3===0?1.8:1,'#e0fbad');
  }
  const float=3*Math.sin(t*.75);
  glow(ctx,448,85+float,57,'#f2ce5826');
  if(clanBadge?.naturalWidth) ctx.drawImage(clanBadge,407,40+float,82,82);
  for(const p of stars.slice(0,20)){
    const py=133-(p.y+t*(2+p.size))%116, px=448+(p.x-320)*.57;
    ctx.fillStyle=p.size>2?'#efc562a6':'#77e2d395';
    ctx.fillRect(px,py,1.4,p.size*1.3);
  }
}

const scenes={axn,water,fire,wood,light,dark};

export function initScenes(hero,preview,dialog) {
  const canvases=[hero,preview];
  const contexts=canvases.map(c=>c.getContext('2d'));
  const visible=new Set();
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let palette='', moving=true, frame=0, last=0, elapsed=0;
  function active(i) {
    return visible.has(canvases[i]) && (i===1 ? dialog.open : !dialog.open);
  }
  function draw(i) {
    const canvas=canvases[i],ctx=contexts[i];
    if(!ctx || !canvas.clientWidth || !canvas.clientHeight) return;
    const dpr=Math.min(devicePixelRatio || 1,1.5);
    const width=Math.round(canvas.clientWidth*dpr), height=Math.round(canvas.clientHeight*dpr);
    if(canvas.width!==width || canvas.height!==height) {canvas.width=width;canvas.height=height;}
    // Ajustar la escena al marco preserva círculos, siluetas y líneas en teléfono.
    const scale=Math.max(width/W,height/H);
    ctx.setTransform(scale,0,0,scale,(width-W*scale)*.72,(height-H*scale)*.48);
    scenes[palette](ctx,elapsed);
  }
  function tick(time) {
    frame=0;
    if(!last || time-last>=40){
      if(last) elapsed+=Math.min(time-last,100)/1000;
      last=time;
      for(let i=0;i<canvases.length;i++) if(active(i)) draw(i);
    }
    frame=requestAnimationFrame(tick);
  }
  function refresh(){
    cancelAnimationFrame(frame);frame=0;last=0;
    if(!scenes[palette] || document.hidden) return;
    if(!canvases.some((c,i)=>contexts[i] && active(i))) return;
    for(let i=0;i<canvases.length;i++) if(active(i)) draw(i);
    if(moving && !reduced.matches) frame=requestAnimationFrame(tick);
  }
  const observer=new IntersectionObserver(entries=>{
    for(const entry of entries) {
      if(entry.isIntersecting)visible.add(entry.target);else visible.delete(entry.target);
    }
    refresh();
  });
  const resize=new ResizeObserver(refresh);
  for(const canvas of canvases) {observer.observe(canvas);resize.observe(canvas);}
  clanBadge?.addEventListener('load',refresh,{once:true});
  document.addEventListener('visibilitychange',refresh);
  reduced.addEventListener('change',refresh);
  return (next,animate)=>{
    if(next!==palette)elapsed=0;
    palette=next;moving=animate;refresh();
  };
}

