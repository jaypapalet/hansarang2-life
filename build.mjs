import {readFile, readdir, mkdir, writeFile} from 'node:fs/promises';
import {basename} from 'node:path';

// Inline the small, local ESM dependency tree for a single-file Workers deployment.
const assembled = new Map();
async function compile(name) {
  if (assembled.has(name)) return;
  let source = await readFile(new URL(name, import.meta.url), 'utf8');
  const imports = [...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"](\.\/[\w.-]+\.mjs)['"];?/g)];
  for (const entry of imports) {
    const dependency = basename(entry[2]);
    await compile(dependency);
    const bindings = entry[1].trim().replace(/\s+as\s+/g, ':');
    source = source.replace(entry[0], 'const {'+bindings+'} = modules['+JSON.stringify(dependency)+'];');
  }
  const names = [...source.matchAll(/export\s+(?:async\s+)?(?:function|const|class)\s+(\w+)/g)].map(result=>result[1]);
  source = source.replace(/\bexport\s+(?=(?:async\s+)?(?:function|const|class)\b)/g,'');
  assembled.set(name,'modules['+JSON.stringify(name)+'] = (()=>{\n'+source+'\nreturn {'+names.join(',')+'};\n})();');
}
const types={html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'text/javascript; charset=utf-8',png:'image/png'};
const assets={};
for(const file of await readdir(new URL('./',import.meta.url))){
  const ext=file.split('.').pop();
  if(!types[ext])continue;
  const buffer=await readFile(new URL(file,import.meta.url));
  assets['/'+file]=[types[ext],ext==='png'?buffer.toString('base64'):buffer.toString('utf8')];
}
for(const file of ['services.mjs','transit.mjs','boards.mjs']) await compile(file);
const runtime=await readFile(new URL('handler.mjs',import.meta.url),'utf8');
await mkdir(new URL('dist/server/',import.meta.url),{recursive:true});
await writeFile(new URL('dist/server/index.js',import.meta.url),
  'const assets='+JSON.stringify(assets)+';\nconst modules={};\n'+[...assembled.values()].join('\n')+'\n'+runtime);
