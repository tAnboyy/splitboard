import { readFile } from 'node:fs/promises';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { api } from '../worker/api.mjs';
const files = new Map([['/','index.html'],['/index.html','index.html'],['/app.js','app.js'],['/styles.css','styles.css'],['/reporting.js','reporting.js']]);
const loginPage = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in · Splitboard</title><style>body{margin:0;background:#0c0d0f;color:#f2f4f6;font:16px system-ui;min-height:100vh;display:grid;place-items:center}main{width:min(340px,85vw)}input,button{box-sizing:border-box;width:100%;padding:14px;margin:10px 0;border-radius:7px;border:1px solid #30343a;font:inherit}input{background:#15171a;color:white}button{background:#2bd47a;font-weight:700;cursor:pointer}p{color:#858b94;line-height:1.6}#error{color:#ff5f66}</style><main><h1>splitboard</h1><p>Enter your access code to open your shared stopwatches.</p><form><label for="code">Access code</label><input id="code" type="password" autocomplete="current-password" required><button>Open stopwatches</button><p id="error" role="alert"></p></form></main><script>const input=document.querySelector('#code');async function login(code){const response=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});if(response.ok)location.replace('/');else document.querySelector('#error').textContent=response.status===429?'Too many attempts. Try again in 15 minutes.':'Access code was not accepted. Try again.';}document.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();try{await login(input.value)}catch{document.querySelector('#error').textContent='Connection unavailable. Try again.'}});const access=new URLSearchParams(location.hash.slice(1)).get('access');if(access){history.replaceState(null,'','/');login(access).catch(()=>document.querySelector('#error').textContent='Connection unavailable. Enter your access code to retry.');}</script></html>`;
function same(a,b) { const x=Buffer.from(a || ''), y=Buffer.from(b || ''); return x.length===y.length && timingSafeEqual(x,y); }
export function createApp({ db, accessCode, healthCheck = async () => {}, root = new URL('../',import.meta.url) }) {
  if (!accessCode || accessCode.length < 24) throw Error('APP_ACCESS_CODE must contain at least 24 characters');
  const cookieToken=createHmac('sha256',accessCode).update('splitboard-session-v1').digest('hex');
  const attempts=new Map();
  return async (request, ip='unknown') => {
    const url=new URL(request.url);
    const headers={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-frame-options':'DENY'};
    const json=(data,status=200,extra={})=>Response.json(data,{status,headers:{...headers,...extra}});
    if(url.pathname==='/health') { try { await healthCheck(); return json({status:'ok'}); } catch { return json({status:'unavailable'},503); } }
    if(url.pathname==='/api/login' && request.method==='POST') {
      if(request.headers.get('origin')!==url.origin) return json({error:'Invalid origin'},403);
      const now=Date.now(); let entry=attempts.get(ip);
      if(!entry || entry.until<now) { entry={count:0,until:now+900000}; if(attempts.size>10000) attempts.clear(); attempts.set(ip,entry); }
      if(entry.count>=10) return json({error:'Too many attempts'},429);
      entry.count++;
      let code; try { code=(await request.json()).code; } catch { return json({error:'Invalid request'},400); }
      if(typeof code!=='string' || !same(code,accessCode)) return json({error:'Unauthorized'},401);
      attempts.delete(ip);
      return json({ok:true},200,{'set-cookie':`splitboard_session=${cookieToken}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${url.protocol==='https:'?'; Secure':''}`});
    }
    const cookie=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('splitboard_session='))?.slice('splitboard_session='.length);
    if(!same(cookie,cookieToken)) {
      if(url.pathname==='/' || url.pathname==='/index.html') return new Response(loginPage,{headers:{...headers,'content-type':'text/html; charset=utf-8'}});
      return json({error:'Sign in required'},401);
    }
    if(url.pathname==='/api/session') return api(request,{DB:db});
    if(!['GET','HEAD'].includes(request.method)) return json({error:'Method not allowed'},405);
    const file=files.get(url.pathname); if(!file) return json({error:'Not found'},404);
    const type=file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'text/javascript';
    return new Response(request.method==='HEAD'?null:await readFile(new URL(file,root)),{headers:{...headers,'content-type':type+'; charset=utf-8'}});
  };
}
