import '../reporting.js';
import '../state.js';
const { initialState, applyCommand, rollover } = globalThis.Splitboard;
const json = (data, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
export async function api(request, env) {
  if (!env.DB) return json({ error: 'Shared storage unavailable' }, 503);
  // CREATE is idempotent, including across Worker isolates.
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, version INTEGER NOT NULL, state TEXT NOT NULL)').run();
  await env.DB.prepare('INSERT OR IGNORE INTO sessions (id, version, state) VALUES (?, 0, ?)').bind('personal', JSON.stringify(initialState())).run();
  if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, 405);
  const isWrite = request.method === 'POST';
  if (isWrite && request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'Invalid origin' }, 403);
  let command;
  if (isWrite) try {
    const text = await request.text();
    if (text.length > 10000) return json({ error: 'Command too large' }, 413);
    command = JSON.parse(text);
    if (!command || typeof command !== 'object') throw Error();
    for (const key of ['id', 'timerId', 'lapId']) if (command[key] !== undefined && (typeof command[key] !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(command[key]))) throw Error();
    if ((command.type === 'add' && !command.timerId) || (command.type === 'lap' && !command.lapId)) throw Error();
  } catch { return json({ error: 'Invalid command' }, 400); }
  for (let attempt = 0; attempt < 10; attempt++) {
    const row = await env.DB.prepare('SELECT version, state FROM sessions WHERE id = ?').bind('personal').first();
    const state = JSON.parse(row.state);
    const now = Date.now();
    rollover(state, now);
    const changed = JSON.stringify(state) !== row.state;
    // A stale command must not edit yesterday's note or start today's timer.
    const stale = isWrite && command.day !== undefined && command.day !== state.day;
    if (isWrite && !stale) {
      try { applyCommand(state, command, now); } catch { return json({ error: 'Invalid command' }, 400); }
    }
    if (!changed && !isWrite) return json({ ...state, version: row.version, serverTime: now });
    if (stale && !changed) return json({ error: 'A new day has started. Refresh and try again.' }, 409);
    const result = await env.DB.prepare('UPDATE sessions SET state = ?, version = version + 1 WHERE id = ? AND version = ?').bind(JSON.stringify(state), 'personal', row.version).run();
    if (result.meta.changes) {
      if (stale) return json({ error: 'A new day has started. Refresh and try again.' }, 409);
      return json({ ...state, version: row.version + 1, serverTime: Date.now() });
    }
  }
  return json({ error: 'Session busy. Please try again.' }, 409);
}
