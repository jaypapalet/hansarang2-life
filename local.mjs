import http from 'node:http';
import {mkdirSync} from 'node:fs';
import {Readable} from 'node:stream';
import {fileURLToPath} from 'node:url';
import worker from './dist/server/index.js';
import {openLocalNoticeBucket,openLocalNoticeDatabase} from './apartment-notices-local.mjs';
import {refreshInterval} from './roads.mjs';

const port=Number(process.env.PORT||4189);
const state=new URL('./.local/',import.meta.url);
mkdirSync(state,{recursive:true,mode:0o700});
const db=openLocalNoticeDatabase(fileURLToPath(new URL('apartment-notices.sqlite',state)));
const env={...process.env,DB:db,NOTICE_PHOTOS:openLocalNoticeBucket(new URL('notice-photos/',state))};
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://'+(req.headers.host||'localhost:'+port));
    const options={method:req.method,headers:req.headers};
    if(req.method!=='GET'&&req.method!=='HEAD'){
      options.body=Readable.toWeb(req);
      options.duplex='half';
    }
    const response=await worker.fetch(new Request(url,options),env);
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
