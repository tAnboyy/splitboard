import http from 'node:http';
import pg from 'pg';
import { createApp } from './app.mjs';
import { PostgresStorage } from './storage.mjs';
if(!process.env.DATABASE_URL) throw Error('DATABASE_URL is required');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:5});
await pool.query('CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, version INTEGER NOT NULL, state TEXT NOT NULL)');
if(process.env.INITIAL_SESSION_STATE) {
  const seed=JSON.parse(process.env.INITIAL_SESSION_STATE);
  if(!Array.isArray(seed.timers)) throw Error('Invalid initial session');
  const version=Number.isInteger(seed.version)?seed.version:0;
  delete seed.version; delete seed.serverTime;
  await pool.query('INSERT INTO sessions (id,version,state) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING',['personal',version,JSON.stringify(seed)]);
}
const app=createApp({db:new PostgresStorage(pool),accessCode:process.env.APP_ACCESS_CODE,healthCheck:()=>pool.query('SELECT 1')});
const server=http.createServer(async(req,res)=>{
  try {
    const origin=process.env.RENDER_EXTERNAL_URL || `http://${req.headers.host}`;
    let body;
    if(!['GET','HEAD'].includes(req.method)) {
      const chunks=[];let size=0;
      for await(const chunk of req) { size+=chunk.length; if(size>32768){res.writeHead(413);res.end('Request too large');return;} chunks.push(chunk); }
      body=Buffer.concat(chunks);
    }
    const request=new Request(new URL(req.url,origin),{method:req.method,headers:req.headers,body});
    const response=await app(request,req.socket.remoteAddress);
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  } catch { res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({error:'Connection unavailable. Please try again.'})); }
});
server.listen(Number(process.env.PORT || 3000),'0.0.0.0',()=>console.log('Splitboard server ready'));
process.on('SIGTERM',()=>{server.close(async()=>{await pool.end();process.exit(0);});setTimeout(()=>process.exit(1),25000).unref();});
