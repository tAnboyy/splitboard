const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../reporting.js'); require('../state.js');
const { initialState, applyCommand, rollover } = Splitboard;
const { summarize, midnight } = SplitboardReporting;
const ms = Date.parse;
function runningDay() {
  const start = ms('2026-11-09T04:30:00Z'); // Nov 8, 11:30pm Eastern
  const state = initialState(start), id = state.timers[0].id;
  applyCommand(state,{type:'start',id},start);
  applyCommand(state,{type:'lap',id,lapId:'lap-1'},start+600000);
  applyCommand(state,{type:'note',id,lapId:'lap-1',value:'Last interval\nKeep this note'},start+600001);
  return {state,id,start};
}
test('midnight archives exact cutoff, lap notes and running state; new day is zero and stopped', () => {
  const {state} = runningDay(); rollover(state,ms('2026-11-09T05:10:00Z'));
  assert.equal(state.day,'2026-11-09');
  assert.ok(state.timers.every(t=>!t.running && t.elapsed===0 && t.startedAt===null && t.laps.length===0));
  const saved=state.dailyArchives[0];
  assert.equal(saved.day,'2026-11-08'); assert.equal(saved.closedAt,ms('2026-11-09T05:00:00Z'));
  assert.equal(saved.timers[0].elapsed,1800000); assert.equal(saved.timers[0].running,true);
  assert.equal(saved.timers[0].laps[0].note,'Last interval\nKeep this note');
  assert.equal(summarize(state,ms('2026-11-09T05:10:00Z')).total,0);
  assert.equal(summarize(state,ms('2026-11-09T05:10:00Z'),'day',ms('2026-11-08T17:00:00Z')).total,1800000);
});
test('closed browser for several days does not accrue time beyond first midnight', () => {
  const {state}=runningDay(); rollover(state,ms('2026-11-14T16:00:00Z'));
  assert.equal(state.dailyArchives.length,1); assert.equal(state.day,'2026-11-14');
  assert.equal(state.history[0].end,ms('2026-11-09T05:00:00Z'));
  assert.equal(state.dailyArchives[0].timers[0].elapsed,1800000);
});
test('repeated reads and restarted timer do not alter yesterday archive or double-log it', () => {
  const {state,id}=runningDay(); const now=ms('2026-11-09T05:00:00Z');
  rollover(state,now); rollover(state,now+1000);
  applyCommand(state,{type:'start',id},now+2000);
  applyCommand(state,{type:'lap',id,lapId:'new-lap'},now+3000);
  assert.equal(state.dailyArchives.length,1); assert.equal(state.history.length,1);
  assert.equal(state.dailyArchives[0].timers[0].laps.length,1);
  assert.equal(state.dailyArchives[0].timers[0].laps[0].id,'lap-1');
});
test('stopped state and exclusive setting are preserved in archive', () => {
  const {state,id,start}=runningDay(); applyCommand(state,{type:'stop',id},start+900000);
  state.oneAtATime=true; rollover(state,ms('2026-11-09T05:00:00Z'));
  assert.equal(state.dailyArchives[0].timers[0].elapsed,900000);
  assert.equal(state.dailyArchives[0].timers[0].running,false);
  assert.equal(state.dailyArchives[0].oneAtATime,true); assert.equal(state.oneAtATime,true);
});
test('legacy session initialization preserves current timers and notes until next midnight', () => {
  const {state}=runningDay(); delete state.day; delete state.dailyArchives;
  const before=JSON.stringify(state.timers); rollover(state,ms('2026-11-09T17:00:00Z'));
  assert.equal(JSON.stringify(state.timers),before); assert.equal(state.day,'2026-11-09');
  assert.equal(state.dailyArchives.length,0);
});
test('DST boundary uses local midnight for 23 and 25 hour days', () => {
  for (const [day,next,hours] of [['2026-03-08','2026-03-09',23],['2026-11-01','2026-11-02',25]]) {
    const state=initialState(midnight(day)),id=state.timers[0].id;
    applyCommand(state,{type:'start',id},midnight(day)); rollover(state,midnight(next));
    assert.equal(state.dailyArchives[0].timers[0].elapsed,hours*3600000);
  }
});
