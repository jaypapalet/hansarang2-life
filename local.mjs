import http from 'node:http';
import {readFile} from 'node:fs/promises';
import worker from './dist/server/index.js';

const port=Number(process.env.PORT||4189);
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost:'+port);
    let response;
    if(/^\/vms-live\/(latest\.json|vms-\d{10,16}-[123]\.png)$/.test(url.pathname)){
      try{
        const bytes=await readFile(new URL('.'+url.pathname,import.meta.url));
        response=new Response(bytes,{headers:{'Content-Type':url.pathname.endsWith('.png')?'image/png':'application/json','Cache-Control':'no-store'}});
      }catch{response=new Response(null,{status:404})}
    }else{response=await worker.fetch(new Request(url,{method:req.method}),process.env)}
    res.writeHead(response.status,Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(500);res.end()}
});
server.listen(port,'127.0.0.1',()=>console.log('http://127.0.0.1:'+port));
