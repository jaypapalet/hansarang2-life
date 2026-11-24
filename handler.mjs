// "assets" and "modules" are embedded at build time by build.mjs.
function privateResponse(response) {
  const headers = new Headers(response.headers);
  headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
  return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
}

export default {
  async fetch(request, env = {}) {
    const path=new URL(request.url).pathname;
    if(!['GET','HEAD'].includes(request.method))return privateResponse(new Response(null,{status:405,headers:{Allow:'GET, HEAD'}}));
    if(path==='/robots.txt')return privateResponse(new Response('User-agent: *\nDisallow: /\n',{headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'public, max-age=3600'}}));
    if(path.startsWith('/api/boards/'))return privateResponse(await modules['boards.mjs'].boards(request,env));
    const kind=path.slice(5);
    if(path.startsWith('/api/')&&['weather','ev','bus','subway'].includes(kind)){
      try {
        const data=kind==='ev'||kind==='weather'
          ? await modules['services.mjs'].services(kind,env)
          : await modules['transit.mjs'].transit(kind,env);
        return privateResponse(data instanceof Response?data:Response.json(data,{headers:{'Cache-Control':'no-store'}}));
      } catch {
        return privateResponse(Response.json({error:'upstream_unavailable'},{status:503,headers:{'Cache-Control':'no-store'}}));
      }
    }
    const item=assets[path==='/'?'/index.html':path];
    if(!Array.isArray(item))return privateResponse(new Response('Not found',{status:404}));
    const [type,value]=item;
    const body=type==='image/png'?Uint8Array.from(atob(value),c=>c.charCodeAt(0)):value;
    return privateResponse(new Response(request.method==='HEAD'?null:body,{headers:{'Content-Type':type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'}}));
  }
};
