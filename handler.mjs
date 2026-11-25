// build.mjs embeds the compiled React page, route data, and server modules.
function privateResponse(response) {
  const headers = new Headers(response.headers);
  headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
  return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
}

export default {
  async fetch(request, env = {}) {
    const url=new URL(request.url);
    const path=url.pathname;
    if(path==='/api/roads/search'||path==='/api/roads/directions'){
      if(request.method!=='POST')return privateResponse(new Response(null,{status:405,headers:{Allow:'POST'}}));
      return privateResponse(await modules['roads.mjs'].kakaoRoads(path.split('/').at(-1),request,env,roadPlaces.origin));
    }
    if(!['GET','HEAD'].includes(request.method))return privateResponse(new Response(null,{status:405,headers:{Allow:'GET, HEAD'}}));
    if(path==='/api/roads/fixed')return privateResponse(await modules['roads.mjs'].fixedRoads(request,env,roadRoutes));
    if(path==='/robots.txt')return privateResponse(new Response('User-agent: *\nDisallow: /\n',{headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'public, max-age=3600'}}));
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
    if(!['/','/index.html','/resident','/resident/'].includes(path)){
      return privateResponse(new Response('Not found',{status:404}));
    }
    return privateResponse(new Response(request.method==='HEAD'?null:clientHtml,{
      headers:{
        'Content-Type':'text/html; charset=utf-8',
        'Cache-Control':'no-cache',
        'X-Content-Type-Options':'nosniff',
      },
    }));
  }
};
