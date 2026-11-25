import {readFile, mkdir, writeFile} from 'node:fs/promises';
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
const clientHtml=await readFile(new URL('dist/client/index.html',import.meta.url),'utf8');
const roadPlaces=JSON.parse(await readFile(new URL('src/road-places.json',import.meta.url),'utf8'));
const roadRoutes=JSON.parse(await readFile(new URL('src/topis-routes.json',import.meta.url),'utf8'));
for(const file of ['services.mjs','transit.mjs','roads.mjs','neighborhood.mjs','apartment-notices.mjs']) await compile(file);
const runtime=await readFile(new URL('handler.mjs',import.meta.url),'utf8');
await mkdir(new URL('dist/server/',import.meta.url),{recursive:true});
await writeFile(new URL('dist/server/index.js',import.meta.url),
  'const clientHtml='+JSON.stringify(clientHtml)+';\nconst roadPlaces='+JSON.stringify(roadPlaces)+';\nconst roadRoutes='+JSON.stringify(roadRoutes)+';\nconst modules={};\n'+[...assembled.values()].join('\n')+'\n'+runtime);
