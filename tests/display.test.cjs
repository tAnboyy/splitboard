const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function display() {
  let now = 1000;
  const callbacks = [];
  const time = { textContent: '' };
  const card = { dataset: { id: 'running' }, querySelector: () => time };
  const element = { addEventListener() {}, innerHTML: '', textContent: '' };
  const context = vm.createContext({
    document: { querySelector: () => element, querySelectorAll: selector => selector === '.timer-card' ? [card] : [], getElementById: () => element, addEventListener() {} },
    window: { addEventListener() {} }, Date: { now: () => now },
    fetch: () => new Promise(() => {}), setInterval: (callback, delay) => callbacks.push({ callback, delay })
  });
  vm.runInContext(fs.readFileSync('app.js','utf8'), context);
  return { run: code => vm.runInContext(code, context), tick: value => { now = value; callbacks.find(c => c.delay === 50).callback(); return time.textContent; } };
}
test('visible running stopwatch advances between sync responses', () => {
  const app = display();
  app.run("timers = [{ id: 'running', running: true, elapsed: 0, startedAt: 1000 }]");
  assert.equal(app.tick(1000), '00:00.00');
  assert.equal(app.tick(2250), '00:01.25');
  assert.equal(app.tick(3601000), '01:00:00.00');
});
test('stopped stopwatch display stays fixed', () => {
  const app = display();
  app.run("timers = [{ id: 'running', running: false, elapsed: 12345, startedAt: null }]");
  assert.equal(app.tick(2000), '00:12.34');
  assert.equal(app.tick(90000), '00:12.34');
});
test('time format rolls minutes into hours without wrapping after 24 hours', () => {
  const app = display();
  for (const [ms, expected] of [[0,'00:00.00'],[3599999,'59:59.99'],[3600000,'01:00:00.00'],[3661230,'01:01:01.23'],[90000000,'25:00:00.00']]) {
    assert.equal(app.run(`formatTime(${ms})`), expected);
  }
});
