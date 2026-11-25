import http from 'node:http';
import {Readable} from 'node:stream';
import worker from './dist/server/index.js';
import {refreshInterval} from './roads.mjs';

const port=Number(process.env.PORT||4189);
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://'+(req.headers.host||'localhost:'+port));
    const options={method:req.method,headers:req.headers};
    if(req.method!=='GET'&&req.method!=='HEAD'){
      options.body=Readable.toWeb(req);
      options.duplex='half';
    }
    const response=await worker.fetch(new Request(url,options),process.env);
    res.writeHead(response.status,Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(500);res.end()}
});
server.listen(port,'127.0.0.1',()=>{
  const origin='http://127.0.0.1:'+port;
  console.log(origin+'/');
  if(process.env.TOPIS_OPEN_DATA_KEY){
    const refresh=async()=>{
      const response=await worker.fetch(new Request(origin+'/api/roads/fixed'),process.env);
      await response.arrayBuffer();
    };
    const scheduleRefresh=()=>refresh()
      .catch(()=>console.error('TOPIS refresh failed'))
      .finally(()=>setTimeout(scheduleRefresh,refreshInterval).unref());
    void scheduleRefresh();
  }
});
