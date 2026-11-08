import fs from 'node:fs';
fs.mkdirSync('dist/server', { recursive: true });
fs.mkdirSync('dist/.openai', { recursive: true });
const files = Object.fromEntries(['index.html','styles.css','app.js','reporting.js'].map(p => ['/' + p, fs.readFileSync(p,'utf8')]));
let api = fs.readFileSync('worker/api.mjs','utf8').replace("import '../state.js';", fs.readFileSync('state.js','utf8')).replace('export async function api', 'async function api');
const handler = `\nconst assets = ${JSON.stringify(files)};\nexport default { async fetch(request, env) { const path = new URL(request.url).pathname; try { if (path === '/api/session') return await api(request, env); const key = path === '/' ? '/index.html' : path; if (!(key in assets)) return new Response('Not found', {status:404}); return new Response(assets[key], {headers:{'content-type':key.endsWith('.html')?'text/html; charset=utf-8':key.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8','cache-control':'no-cache'}}); } catch { return Response.json({error:'Connection unavailable. Please try again.'},{status:503}); } } };`;
fs.writeFileSync('dist/server/index.js', api + handler);
fs.copyFileSync('.openai/hosting.json','dist/.openai/hosting.json');
