const { test } = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
globalThis.crypto ||= webcrypto;
require('../state.js');
const { initialState, applyCommand, elapsed } = Splitboard;
const apply = (s, type, now, args = {}) => applyCommand(s, { type, ...args }, now);
test('start all preserves already running stopwatch start time', () => {
  const s = initialState(); apply(s, 'start-all', 1000); apply(s, 'start-all', 2000);
  assert.equal(elapsed(s.timers[0], 3000), 2000);
});
test('elapsed time survives closing and reopening a device', () => {
  const s = initialState(); apply(s, 'start-all', 1000);
  const restored = JSON.parse(JSON.stringify(s));
  assert.equal(elapsed(restored.timers[0], 61000), 60000);
});
test('exclusive mode stops extra timers and transfers active stopwatch', () => {
  const s = initialState(); apply(s, 'start-all', 1000); apply(s, 'exclusive', 2000, { value: true });
  assert.equal(s.timers.filter(t => t.running).length, 1);
  apply(s, 'start', 3000, { id: s.timers[1].id });
  assert.equal(s.timers.filter(t => t.running).length, 1);
  assert.equal(s.timers[0].elapsed, 2000);
  apply(s, 'start-all', 4000);
  assert.equal(s.timers[1].startedAt, 3000);
});
test('reset running timer clears laps and starts new elapsed interval', () => {
  const s = initialState(), id = s.timers[0].id;
  apply(s, 'start', 1000, { id }); apply(s, 'lap', 1500, { id, lapId: 'lap-1' });
  assert.equal(s.timers[0].laps[0].time, 500);
  apply(s, 'reset', 2000, { id });
  assert.equal(elapsed(s.timers[0], 2500), 500); assert.equal(s.timers[0].laps.length, 0);
});
test('independent device commands preserve unrelated timers and notes', () => {
  const s = initialState(); const [a,b] = s.timers;
  apply(s, 'start', 1000, { id: a.id }); apply(s, 'start', 1100, { id: b.id });
  apply(s, 'lap', 2000, { id: a.id, lapId: 'lap-1' });
  apply(s, 'note', 2100, { id: a.id, lapId: 'lap-1', value: 'First interval' });
  apply(s, 'stop', 2200, { id: b.id });
  assert.equal(a.running, true); assert.equal(b.elapsed, 1100); assert.equal(a.laps[0].note, 'First interval');
});
test('removing every stopwatch preserves an empty session', () => {
  const s = initialState(); [...s.timers].forEach(t => apply(s, 'remove', 1, { id: t.id }));
  assert.equal(JSON.parse(JSON.stringify(s)).timers.length, 0);
});
test('deleted timer commands cannot resurrect it', () => {
  const s = initialState(), id = s.timers[0].id;
  apply(s, 'remove', 1, { id }); apply(s, 'start', 2, { id });
  assert.equal(s.timers.length, 2);
});
