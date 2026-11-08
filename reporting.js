(function(root) {
  const zone = 'America/New_York';
  const dateFormat = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' });
  function dateKey(ms) {
    const parts = Object.fromEntries(dateFormat.formatToParts(new Date(ms)).map(p => [p.type, p.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  function shift(key, days) { const d = new Date(key + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
  function midnight(key) {
    const target = Date.parse(key + 'T00:00:00Z');
    const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23' });
    let guess = target;
    for (let i = 0; i < 4; i++) {
      const p = Object.fromEntries(formatter.formatToParts(new Date(guess)).map(p => [p.type,p.value]));
      const local = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
      guess += target - local;
    }
    return guess;
  }
  function summarize(state, now, view = 'day', anchor = now) {
    const selected = dateKey(anchor);
    const weekday = new Date(selected + 'T12:00:00Z').getUTCDay();
    const first = view === 'week' ? shift(selected, -((weekday + 6) % 7)) : selected;
    const days = Array.from({length: view === 'week' ? 7 : 1}, (_, i) => {
      const key = shift(first, i); return { key, start: midnight(key), end: midnight(shift(key,1)), time: 0 };
    });
    const groups = new Map();
    const add = (id, name, start, end) => {
      if (!(end > start)) return;
      for (const day of days) {
        const time = Math.max(0, Math.min(end,day.end) - Math.max(start,day.start));
        if (!time) continue;
        day.time += time;
        const row = groups.get(id) || {id, name, time:0}; row.time += time; groups.set(id,row);
      }
    };
    for (const entry of state.history || []) add(entry.timerId, entry.name, entry.start, entry.end);
    for (const timer of state.timers) if (timer.running) add(timer.id,timer.name,timer.startedAt,now);
    return { days, total: days.reduce((sum,d) => sum+d.time,0), rows: [...groups.values()].sort((a,b) => b.time-a.time), active: state.timers.filter(t => t.running).length, undated: state.undatedElapsed ?? state.timers.reduce((sum,t) => sum+t.elapsed,0) };
  }
  root.SplitboardReporting = { zone, dateKey, shift, midnight, summarize };
})(globalThis);
