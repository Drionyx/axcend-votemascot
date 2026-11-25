// Dos filtros de caja separables suavizan el retrato sin depender de filtros CSS o del navegador.
function blurAxis(source, target, radius, width, height, vertical) {
  const lines=vertical?width:height, length=vertical?height:width;
  const stride=vertical?width*4:4, divisor=radius*2+1;
  for(let line=0;line<lines;line++) {
    const start=vertical?line*4:line*width*4;
    let r=0,g=0,b=0;
    for(let offset=-radius;offset<=radius;offset++) {
      const i=start+Math.min(length-1,Math.max(0,offset))*stride;
      r+=source[i]; g+=source[i+1]; b+=source[i+2];
    }
    for(let pos=0;pos<length;pos++) {
      const i=start+pos*stride;
      target[i]=r/divisor; target[i+1]=g/divisor; target[i+2]=b/divisor; target[i+3]=255;
      const left=start+Math.max(0,pos-radius)*stride;
      const right=start+Math.min(length-1,pos+radius+1)*stride;
      r+=source[right]-source[left]; g+=source[right+1]-source[left+1]; b+=source[right+2]-source[left+2];
    }
  }
}

export function softenPortrait(original,destination,radius) {
  const {width,height}=original;
  const result=destination.createImageData(width,height);
  const scratch=new Uint8ClampedArray(original.data.length);
  blurAxis(original.data,scratch,radius,width,height,false);
  blurAxis(scratch,result.data,radius,width,height,true);
  blurAxis(result.data,scratch,radius,width,height,false);
  blurAxis(scratch,result.data,radius,width,height,true);
  destination.putImageData(result,0,0);
}

