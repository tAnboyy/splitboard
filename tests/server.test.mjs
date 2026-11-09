import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.mjs';
import { PostgresStorage } from '../server/storage.mjs';
const accessCode='test-access-code-at-least-24-characters';
const origin='https://splitboard.example';
const db={prepare(){return {bind(){return this;},async first(){return {version:0,state:JSON.stringify({timers:[],savedSessions:[]})};},async run(){return {meta:{changes:1}};}};}};
async function signIn(app){const response=await app(new Request(origin+'/api/login',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({code:accessCode})}));assert.equal(response.status,200);return response.headers.get('set-cookie').split(';')[0];}
test('server protects shared data and renders an access-code sign-in',async()=>{
 const app=createApp({db,accessCode});
 assert.equal((await app(new Request(origin+'/api/session'))).status,401);
 assert.match(await (await app(new Request(origin+'/'))).text(),/Enter your access code/);
 const cookie=await signIn(app);
 assert.match(cookie,/splitboard_session=/);
 const response=await app(new Request(origin+'/api/session',{headers:{cookie}}));
 assert.equal(response.status,200);assert.deepEqual((await response.json()).timers,[]);
 assert.match(await(await app(new Request(origin+'/',{headers:{cookie}}))).text(),/Saved sessions/);
});
test('rejects invalid login codes and cross-origin login requests',async()=>{
 const app=createApp({db,accessCode});
 assert.equal((await app(new Request(origin+'/api/login',{method:'POST',body:'{}'}))).status,403);
 assert.equal((await app(new Request(origin+'/api/login',{method:'POST',headers:{origin},body:JSON.stringify({code:'wrong'})}))).status,401);
});
test('health check reflects database readiness without exposing private data',async()=>{
 const app=createApp({db,accessCode,healthCheck:async()=>{throw Error('database unavailable');}});
 assert.equal((await app(new Request(origin+'/health'))).status,503);
});
test('Postgres adapter uses bound positional values, conflict handling and update counts',async()=>{
 const calls=[];const pool={async query(sql,values){calls.push({sql,values});return {rows:[{version:2,state:'{}'}],rowCount:1};}};
 const storage=new PostgresStorage(pool);
 await storage.prepare('INSERT OR IGNORE INTO sessions (id, version, state) VALUES (?, 0, ?)').bind('personal','{}').run();
 assert.equal(calls[0].sql,'INSERT INTO sessions (id, version, state) VALUES ($1, 0, $2) ON CONFLICT (id) DO NOTHING');
 const result=await storage.prepare('UPDATE sessions SET state = ?, version = version + 1 WHERE id = ? AND version = ?').bind('{}','personal',2).run();
 assert.equal(result.meta.changes,1);assert.deepEqual(calls[1].values,['{}','personal',2]);
});
test('external database TLS verifies the supplied CA and database identity',async()=>{
 const {databaseOptions}=await import('../server/database.mjs');
 const opts=databaseOptions({DATABASE_URL:'postgresql://user:pass@proxy.example:1234/db?sslmode=require',DATABASE_SSL_CA:'trusted-ca',DATABASE_TLS_SERVERNAME:'postgres.railway.internal'});
 assert.equal(opts.ssl.rejectUnauthorized,true);assert.equal(opts.ssl.ca,'trusted-ca');
 assert.ok(!opts.connectionString.includes('sslmode='));
 assert.equal(opts.ssl.checkServerIdentity('proxy.example',{subjectaltname:'DNS:postgres.railway.internal'}),undefined);
 assert.ok(opts.ssl.checkServerIdentity('proxy.example',{subjectaltname:'DNS:wrong.example'}) instanceof Error);
});
