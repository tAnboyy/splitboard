import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../worker/api.mjs';
class Database {
  row = null;
  prepare(sql) {
    const db = this;
    return { args: [], bind(...args) { this.args = args; return this; }, async first() { return structuredClone(db.row); }, async run() {
      if (sql.startsWith('INSERT') && !db.row) db.row = { state: this.args[1], version: 0 };
      if (sql.startsWith('UPDATE')) {
        if (db.row.version !== this.args[2]) return { meta: { changes: 0 } };
        db.row = { state: this.args[0], version: db.row.version + 1 }; return { meta: { changes: 1 } };
      }
      return { meta: { changes: 0 } };
    } };
  }
}
const get = () => new Request('https://example.com/api/session');
const post = command => new Request('https://example.com/api/session', { method: 'POST', headers: { origin: 'https://example.com' }, body: JSON.stringify(command) });
test('two devices see starts, stops, names and persisted running timestamps', async () => {
  const env = { DB: new Database() };
  const initial = await (await api(get(), env)).json(); const id = initial.timers[0].id;
  const started = await (await api(post({ type: 'start', id }), env)).json();
  const phone = await (await api(get(), env)).json();
  assert.equal(phone.timers[0].startedAt, started.timers[0].startedAt);
  await api(post({ type: 'name', id, value: 'Shared timer' }), env);
  const laptop = await (await api(get(), env)).json(); assert.equal(laptop.timers[0].name, 'Shared timer');
  await api(post({ type: 'stop', id }), env);
  assert.equal((await (await api(get(), env)).json()).timers[0].running, false);
});
test('concurrent commands use version checks without lost updates', async () => {
  const env = { DB: new Database() }; const state = await (await api(get(), env)).json();
  const results = await Promise.all(state.timers.map(t => api(post({ type: 'start', id: t.id }), env)));
  assert.ok(results.every(r => r.status === 200));
  const synced = await (await api(get(), env)).json();
  assert.equal(synced.timers.filter(t => t.running).length, 3); assert.equal(synced.version, 3);
});
test('rejects cross-origin writes, unknown commands and missing database', async () => {
  const env = { DB: new Database() };
  assert.equal((await api(new Request('https://example.com/api/session', { method: 'POST', body: '{}' }), env)).status, 403);
  assert.equal((await api(post({ type: 'bad' }), env)).status, 400);
  assert.equal((await api(get(), {})).status, 503);
});
test('Reset all persists lap notes and frozen times for other devices after reload', async () => {
  const env={DB:new Database()};
  const initial=await (await api(get(),env)).json(); const id=initial.timers[0].id;
  await api(post({type:'start',id}),env);
  await api(post({type:'lap',id,lapId:'shared-lap'}),env);
  await api(post({type:'note',id,lapId:'shared-lap',value:'Saved across devices'}),env);
  await api(post({type:'reset-all',snapshotId:'shared-snapshot'}),env);
  const phone=await (await api(get(),env)).json();
  assert.equal(phone.savedSessions.length,1);
  assert.equal(phone.savedSessions[0].timers[0].laps[0].note,'Saved across devices');
  assert.ok(phone.timers.every(t=>!t.running && t.elapsed===0 && !t.laps.length));
  await api(post({type:'reset-all',snapshotId:'shared-snapshot'}),env);
  assert.equal((await (await api(get(),env)).json()).savedSessions.length,1);
});
