(function (root) {
  function initialState() {
    return { timers: Array.from({ length: 3 }, (_, i) => ({ id: crypto.randomUUID(), name: `Participant ${i + 1}`, elapsed: 0, running: false, startedAt: null, laps: [] })), oneAtATime: false, history: [], undatedElapsed: 0 };
  }
  function elapsed(timer, now) { return timer.elapsed + (timer.running ? Math.max(0, now - timer.startedAt) : 0); }
  function applyCommand(state, command, now) {
    // Legacy stopwatch totals cannot be assigned to a calendar date.
    state.history ??= [];
    state.undatedElapsed ??= state.timers.reduce((sum, t) => sum + t.elapsed, 0);
    const { type, id } = command;
    const timer = state.timers.find(t => t.id === id);
    const log = t => {
      if (t.running && now > t.startedAt) state.history.push({ timerId: t.id, name: t.name, start: t.startedAt, end: now });
    };
    const stop = t => { log(t); t.elapsed = elapsed(t, now); t.running = false; t.startedAt = null; };
    const start = t => {
      if (t.running) return;
      if (state.oneAtATime) state.timers.forEach(other => { if (other !== t) stop(other); });
      t.running = true; t.startedAt = now;
    };
    const reset = t => { log(t); t.elapsed = 0; t.startedAt = t.running ? now : null; t.laps = []; };
    switch (type) {
      case 'start': if (timer) start(timer); break;
      case 'stop': if (timer) stop(timer); break;
      case 'reset': if (timer) reset(timer); break;
      case 'remove': if (timer) log(timer); state.timers = state.timers.filter(t => t.id !== id); break;
      case 'lap': if (timer?.running) timer.laps.push({ id: command.lapId, time: elapsed(timer, now), note: '' }); break;
      case 'delete-lap': if (timer) timer.laps = timer.laps.filter(l => l.id !== command.lapId); break;
      case 'name': if (timer) timer.name = String(command.value).slice(0, 200); break;
      case 'note': { const lap = timer?.laps.find(l => l.id === command.lapId); if (lap) lap.note = String(command.value).slice(0, 2000); break; }
      case 'start-all': if (state.oneAtATime) { const t = state.timers.find(t => t.running) || state.timers[0]; if (t) start(t); } else state.timers.forEach(start); break;
      case 'stop-all': state.timers.forEach(stop); break;
      case 'reset-all': state.timers.forEach(reset); break;
      case 'add': if (state.timers.length < 100) state.timers.push({ id: command.timerId, name: `Participant ${state.timers.length + 1}`, elapsed: 0, running: false, startedAt: null, laps: [] }); break;
      case 'exclusive': state.oneAtATime = command.value === true; if (state.oneAtATime) { const active = state.timers.find(t => t.running); state.timers.forEach(t => { if (t !== active) stop(t); }); } break;
      default: throw Error('Unknown command');
    }
    return state;
  }
  root.Splitboard = { initialState, elapsed, applyCommand };
})(globalThis);
