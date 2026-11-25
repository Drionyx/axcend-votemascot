// Una distribución fija evita saltos de posición al abrir Tema o cambiar de modo.
export function fillMargins() {
  const gutters = document.querySelectorAll('.arena-gutter');
  for (const [side,gutter] of gutters.entries()) {
    const motes = document.createDocumentFragment();
    for (let i=0;i<16;i++) {
      const seed=i+side*17;
      const mote=document.createElement('i');
      mote.style.setProperty('--x',(9+(seed*37)%78)+'%');
      mote.style.setProperty('--y',((i*6.25+(side?2:1))%100)+'%');
      mote.style.setProperty('--size',(5+(seed*7)%20)+'px');
      mote.style.setProperty('--sway',((seed*19)%53-26)+'px');
      mote.style.setProperty('--tilt',((seed*23)%100-50)+'deg');
      mote.style.setProperty('--duration',(10+(seed*3)%13)+'s');
      mote.style.setProperty('--offset',(-1-(seed*1.743)%16)+'s');
      motes.append(mote);
    }
    gutter.append(motes);
  }
}
