const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../reporting.js');
require('../state.js');
const { summarize, midnight } = SplitboardReporting;
const { initialState, applyCommand } = Splitboard;
const ms = value => Date.parse(value);
test('day totals split a running stopwatch at Eastern midnight', () => {
  const s = { timers: [{id:'a',name:'A',running:true,elapsed:0,startedAt:ms('2026-11-09T04:30:00Z')}] };
  const result = summarize(s, ms('2026-11-09T05:30:00Z'));
  assert.equal(result.total, 30 * 60000);
  assert.equal(result.days[0].key, '2026-11-09');
});
test('week starts Monday and sums overlapping stopwatches independently', () => {
  const s = {timers:[],history:[
    {timerId:'a',name:'A',start:ms('2026-11-08T05:00Z'),end:ms('2026-11-09T06:00Z')},
    {timerId:'b',name:'B',start:ms('2026-11-09T05:00Z'),end:ms('2026-11-09T07:00Z')}
  ]};
  const result = summarize(s,ms('2026-11-10T12:00Z'),'week');
  assert.equal(result.days[0].key,'2026-11-09');
  assert.equal(result.total,3*3600000);
  assert.equal(result.rows.length,2);
});
test('reset and removal preserve logged time without double counting', () => {
  const s = initialState(), id=s.timers[0].id;
  const start=ms('2026-11-09T15:00Z');
  applyCommand(s,{type:'start',id},start);
  applyCommand(s,{type:'reset',id},start+3600000);
  assert.equal(summarize(s,start+5400000).total,5400000);
  applyCommand(s,{type:'remove',id},start+5400000);
  assert.equal(summarize(s,start+7200000).total,5400000);
});
test('repeated stop and reset do not duplicate history', () => {
  const s=initialState(),id=s.timers[0].id,start=ms('2026-11-09T15:00Z');
  for (const [type, offset] of [['start',0],['stop',1000],['stop',2000],['reset',3000]]) applyCommand(s,{type,id},start+offset);
  assert.equal(s.history.length,1);
  assert.equal(summarize(s,start+4000).total,1000);
});
test('legacy elapsed time is preserved as undated; running interval remains dated', () => {
  const now=ms('2026-11-09T15:00Z');
  const s={timers:[{id:'a',name:'A',elapsed:5000,running:true,startedAt:now-1000,laps:[]}],oneAtATime:false};
  assert.equal(summarize(s,now).undated,5000);
  applyCommand(s,{type:'stop',id:'a'},now);
  assert.equal(s.undatedElapsed,5000);
  assert.equal(summarize(s,now).total,1000);
  applyCommand(s,{type:'reset',id:'a'},now);
  assert.equal(summarize(s,now).undated,5000);
});
test('Eastern calendar days handle daylight-saving changes', () => {
  assert.equal(midnight('2026-11-02')-midnight('2026-11-01'),25*3600000);
  assert.equal(midnight('2026-03-09')-midnight('2026-03-08'),23*3600000);
});
test('empty and historical periods show zero without including other days', () => {
  assert.equal(summarize({timers:[]},Date.now()).total,0);
  const s={timers:[],history:[{timerId:'a',name:'A',start:ms('2026-11-09T15:00Z'),end:ms('2026-11-09T16:00Z')}]};
  assert.equal(summarize(s,ms('2026-11-10T15:00Z')).total,0);
  assert.equal(summarize(s,ms('2026-11-10T15:00Z'),'day',ms('2026-11-09T15:00Z')).total,3600000);
});
