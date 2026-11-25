// Prepara las páginas para el servidor y sus equivalentes autónomos en Descargable/.
const fs = require('node:fs');
const path = require('node:path');
const {rollup} = require(process.env.WOOFIA_ROLLUP || 'rollup');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.resolve(root,file),'utf8');
const types = {'.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.ico':'image/x-icon'};
function data(file) {
  const bytes = fs.readFileSync(path.resolve(root,file));
  return 'data:'+types[path.extname(file)]+';base64,'+bytes.toString('base64');
}
function script(code) {
  return '<script>'+code.replace(/<\/script/gi,'<\\/script')+'\n</script>';
}
// Los nombres públicos conservan la grafía de las tarjetas, incluso «Capt. Locke».
function loadMysteryPortraits() {
  const key = name => name.toLowerCase().replace(/[^a-z0-9]/g,'');
  const replacements = new Map();
  for (const file of fs.readdirSync(path.join(root,'Chara_Nkd')).filter(file=>/_Nkd\.webp$/i.test(file))) {
    const id = key(file.replace(/_Nkd\.webp$/i,''));
    if (replacements.has(id)) throw Error('Splash de misterio duplicado: '+file);
    replacements.set(id,path.join('Chara_Nkd',file));
  }
  const portraits = [];
  for (const dir of ['Activos','Ocultos']) {
    for (const file of fs.readdirSync(path.join(root,dir)).filter(file=>file.endsWith('.webp')).sort()) {
      const name = path.basename(file,'.webp').replaceAll('_',' ');
      const id = key(name);
      portraits.push([name,replacements.get(id) || path.join(dir,file)]);
      replacements.delete(id);
    }
  }
  if (replacements.size) throw Error('Splash sin personaje: '+[...replacements.values()].join(', '));
  return portraits;
}
const mysteryPortraits = loadMysteryPortraits();
const coverExtras = fs.readdirSync(path.join(root,'Ocultos')).filter(file=>file.endsWith('.webp')).sort()
  .map(file=>[path.basename(file,'.webp').replaceAll('_',' '),path.join('Ocultos',file)]);

function fillCatalog(html,id,rows,portable) {
  const tag = '<script type="application/json" id="'+id+'">';
  const entries = rows.map(([name,file])=>[name,portable ? data(file) : file.split(path.sep).join('/')]);
  return html.replace(tag+'[]</script>',()=>tag+JSON.stringify(entries).replace(/</g,'\\u003c')+'</script>');
}
function page(name,entry,portable) {
  let html = read('plantillas/'+name);
  if (entry==='arena.js') html=fillCatalog(html,'coverExtras',coverExtras,portable);
  return fillCatalog(html,'shadowPortraits',mysteryPortraits,portable);
}
async function compile(name,entry) {
  fs.writeFileSync(path.join(root,name),page(name,entry,false));
  let html = page(name,entry,true);
  html = html.replace(/<link rel="preload" as="image"[^>]+>\s*/g,'');
  html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g,(_,file)=>{
    const css = read(file).replace(/url\(([\w./-]+\.(?:woff2|webp))\)/g,(_,asset)=>'url('+data(path.join(path.dirname(file),asset))+')');
    return '<style>'+css+'</style>';
  });
  html = html.replace(/(<img\b[^>]*?\bsrc=)(["'])([^"']+)\2/gi,(_,start,q,file)=>start+q+data(file)+q);
  html = html.replace(/<link rel="icon"[^>]+>/g,'').replace('</title>','</title>\n<link rel="icon" type="image/png" href="'+data('favicon.png')+'">');
  html = html.replace(/<link rel="(manifest|apple-touch-icon)" href="([^"]+)">/g,(_,rel,href)=>script("if (/^https?:$/.test(location.protocol)) { const link=document.createElement('link'); link.rel='"+rel+"'; link.href='"+href+"'; document.head.append(link); }"));
  const classics = [];
  html = html.replace(/<script defer src="([^"]+)"><\/script>/g,(_,file)=>{classics.push(script(read(file)));return '';});
  html = html.replace(/<script type="module" src="[^"]+"><\/script>/g,'');
  const bundle = await rollup({
    input:path.resolve(root,'assets',entry),
    plugins:[{name:'fuentes-locales',
      resolveId(src,importer){return importer ? path.resolve(path.dirname(importer),src) : path.resolve(src);},
      load(id){return fs.readFileSync(id,'utf8');}
    }]
  });
  const result = await bundle.generate({format:'iife',inlineDynamicImports:true});
  await bundle.close();
  const scripts = [...classics,script(result.output[0].code),script(read('assets/navigation.js'))];
  html = html.replace('</body>',()=>scripts.join('\n')+'\n</body>');
  const portableDir=path.join(root,'Descargable');
  fs.mkdirSync(portableDir,{recursive:true});
  fs.writeFileSync(path.join(portableDir,name),html);
}
(async()=>{await compile('index.html','arena.js');await compile('admin.html','admin.js');})().catch(err=>{console.error(err);process.exitCode=1;});
