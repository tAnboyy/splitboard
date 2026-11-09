import '../state.js';
const { initialState, applyCommand } = globalThis.Splitboard;
const json = (data, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
let initialized;
export async function api(request, env) {
  if (!env.DB) return json({ error: 'Shared storage unavailable' }, 503);
  // CREATE is idempotent, including across Worker isolates.
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, version INTEGER NOT NULL, state TEXT NOT NULL)').run();
  await env.DB.prepare('INSERT OR IGNORE INTO sessions (id, version, state) VALUES (?, 0, ?)').bind('personal', JSON.stringify(initialState())).run();
  if (request.method === 'GET') {
    const row = await env.DB.prepare('SELECT version, state FROM sessions WHERE id = ?').bind('personal').first();
    return json({ ...JSON.parse(row.state), version: row.version, serverTime: Date.now() });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'Invalid origin' }, 403);
  let command;
  try {
    const text = await request.text();
    if (text.length > 10000) return json({ error: 'Command too large' }, 413);
    command = JSON.parse(text);
    if (!command || typeof command !== 'object') throw Error();
    for (const key of ['id', 'timerId', 'lapId', 'snapshotId']) if (command[key] !== undefined && (typeof command[key] !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(command[key]))) throw Error();
    if ((command.type === 'add' && !command.timerId) || (command.type === 'lap' && !command.lapId)) throw Error();
  } catch { return json({ error: 'Invalid command' }, 400); }
  for (let attempt = 0; attempt < 10; attempt++) {
    const row = await env.DB.prepare('SELECT version, state FROM sessions WHERE id = ?').bind('personal').first();
    const state = JSON.parse(row.state);
    try { applyCommand(state, command, Date.now()); } catch { return json({ error: 'Invalid command' }, 400); }
    const result = await env.DB.prepare('UPDATE sessions SET state = ?, version = version + 1 WHERE id = ? AND version = ?').bind(JSON.stringify(state), 'personal', row.version).run();
    if (result.meta.changes) return json({ ...state, version: row.version + 1, serverTime: Date.now() });
  }
  return json({ error: 'Session busy. Please try again.' }, 409);
}
