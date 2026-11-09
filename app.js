let timers = [];
let oneAtATime = false;
let history = [];
let savedSessions = [];
let selectedSessionId = null;
let undatedElapsed = 0;
let dashboardView = 'day';
let dashboardAnchor = null;
let version = -1;
let clockOffset = 0;
let pending = 0;
let connected = false;
let queue = Promise.resolve();
const grid = document.querySelector('#timer-grid');
const status = document.querySelector('#sync-status');
function currentElapsed(timer) {
  return timer.elapsed + (timer.running ? Math.max(0, Date.now() + clockOffset - timer.startedAt) : 0);
}
function connection(ok, message) {
  connected = ok;
  renderDashboard(true);
  status.textContent = message || (ok ? 'Synced across devices' : 'Reconnecting… Controls unavailable');
  document.querySelectorAll('.control-bar button:not(#export-data), #one-at-a-time, .timer-card button, .timer-card input').forEach(el => {
    el.disabled = !ok || (el.classList.contains('lap') && !timers.find(t => t.id === el.closest('.timer-card').dataset.id)?.running);
  });
}
function accept(data, started) {
  clockOffset = data.serverTime - (started + Date.now()) / 2;
  if (data.version > version) {
    timers = data.timers; oneAtATime = data.oneAtATime; version = data.version;
    history = data.history || [];
    if ((data.savedSessions || []).length > savedSessions.length) selectedSessionId = data.savedSessions[data.savedSessions.length - 1].id;
    savedSessions = data.savedSessions || [];
    undatedElapsed = data.undatedElapsed ?? timers.reduce((sum, timer) => sum + timer.elapsed, 0);
    render();
  }
  connection(true);
}
async function refresh() {
  if (pending) return;
  const started = Date.now();
  try {
    const response = await fetch('/api/session', { cache: 'no-store' });
    if (!response.ok) throw Error();
    const data = await response.json();
    if (!pending) accept(data, started);
  } catch { if (!pending) connection(false); }
}
function dispatch(command) {
  if (!connected) return;
  pending++;
  queue = queue.then(async () => {
    const started = Date.now();
    try {
      const response = await fetch('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command) });
      if (!response.ok) throw Error();
      accept(await response.json(), started);
    } catch { connection(false, 'Change could not be confirmed. Reconnecting… Check before retrying.'); }
    finally { pending--; }
  });
}
function dashboardTime(ms) {
  const seconds = Math.floor(ms / 1000);
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(value => String(value).padStart(2, '0')).join(':');
}
let dashboardSignature = '';
let dashboardSecond = -1;
function renderDashboard(force = false) {
  const now = Date.now() + clockOffset;
  const second = Math.floor(now / 1000);
  if (!force && second === dashboardSecond) return;
  dashboardSecond = second;
  const summary = SplitboardReporting.summarize({timers, history, undatedElapsed}, now, dashboardView, dashboardAnchor ?? now);
  // Update dashboard once per displayed second, without rebuilding its contents every frame.
  const signature = JSON.stringify([dashboardView, summary.days.map(day => [day.key, Math.floor(day.time / 1000)]), summary.rows.map(row => [row.id,timers.find(timer => timer.id === row.id)?.name || row.name,Math.floor(row.time/1000)]), summary.active, undatedElapsed, connected]);
  if (signature === dashboardSignature) return;
  dashboardSignature = signature;
  document.querySelector('#dashboard-total').textContent = dashboardTime(summary.total);
  document.querySelector('#dashboard-active').textContent = `${summary.active} stopwatch${summary.active === 1 ? '' : 's'} running`;
  for (const view of ['day','week']) document.querySelector('#view-' + view).setAttribute('aria-pressed', String(view === dashboardView));
  const dateLabel = key => new Intl.DateTimeFormat('en-US', { timeZone: SplitboardReporting.zone, month:'short', day:'numeric', year:'numeric' }).format(new Date(SplitboardReporting.midnight(key)));
  document.querySelector('#period-label').textContent = dashboardView === 'day' ? dateLabel(summary.days[0].key) : `${dateLabel(summary.days[0].key)} – ${dateLabel(summary.days[6].key)}`;
  document.querySelector('#current-period').textContent = dashboardView === 'day' ? 'Today' : 'This week';
  const chart = document.querySelector('#week-chart');
  chart.hidden = dashboardView !== 'week';
  const max = Math.max(1, ...summary.days.map(day => day.time));
  chart.innerHTML = dashboardView === 'week' ? summary.days.map(day => {
    const label = new Intl.DateTimeFormat('en-US',{timeZone: SplitboardReporting.zone,weekday:'short'}).format(new Date(day.start));
    return `<div class="day-column"><span class="day-value">${dashboardTime(day.time)}</span><div class="day-track"><span style="height:${day.time / max * 100}%"></span></div><span>${label}</span></div>`;
  }).join('') : '';
  const maximum = Math.max(1, ...summary.rows.map(row => row.time));
  document.querySelector('#dashboard-breakdown').innerHTML = summary.rows.length ? summary.rows.map(row => `<div class="breakdown-row"><div><span>${escapeHtml(timers.find(timer => timer.id === row.id)?.name || row.name || 'Untitled stopwatch')}</span><strong>${dashboardTime(row.time)}</strong></div><div class="breakdown-track"><span style="width:${row.time / maximum * 100}%"></span></div></div>`).join('') : '<p class="dashboard-empty">No time logged in this period. Start a stopwatch below to begin.</p>';
  const undated = document.querySelector('#undated-time');
  undated.hidden = !summary.undated;
  undated.textContent = `${dashboardTime(summary.undated)} from earlier stopwatch use has no date history and is excluded from day and week totals.`;
}

function formatTime(ms) {
  const centiseconds = Math.floor(ms / 10) % 100;
  const seconds = Math.floor(ms / 1000) % 60;
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const time = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
  return hours ? `${String(hours).padStart(2, "0")}:${time}` : time;
}

function render() {
  const focused = document.activeElement;
  const cardId = focused?.closest?.('.timer-card')?.dataset.id;
  const lapId = focused?.closest?.('.lap-row')?.dataset.lap;
  const fieldClass = focused?.matches?.('.name-input') ? '.name-input' : focused?.matches?.('.note-input') ? '.note-input' : null;
  const selection = fieldClass ? [focused.selectionStart, focused.selectionEnd] : null;
  const draft = fieldClass ? focused.value : null;
  renderDashboard(true);
  renderSavedSessions();
  document.querySelector("#timer-count").textContent = timers.length;
  grid.innerHTML = "";
  if (!timers.length) {
    grid.innerHTML = `<div class="empty-state">No stopwatches yet. Add one to start tracking.</div>`;
    return;
  }
  timers.forEach((timer) => {
    const card = document.createElement("article");
    card.className = `timer-card${timer.running ? " is-running" : ""}`;
    card.dataset.id = timer.id;
    card.innerHTML = `
      <div class="timer-head">
        <input class="name-input" value="${escapeHtml(timer.name)}" aria-label="Stopwatch name" />
        <button class="remove-button" title="Remove stopwatch" aria-label="Remove stopwatch">×</button>
      </div>
      <div class="time">${formatTime(currentElapsed(timer))}</div>
      <div class="timer-buttons">
        <button class="small-button start">${timer.running ? "Stop" : "Start"}</button>
        <button class="small-button lap" ${timer.running ? "" : "disabled"}>Lap</button>
        <button class="small-button reset">Reset</button>
      </div>
      ${timer.laps.length ? `<div class="laps"><div class="laps-title">Lap notes</div>${timer.laps.map((lap, index) => `
        <div class="lap-row" data-lap="${escapeHtml(lap.id)}">
          <span class="lap-index">Lap ${index + 1}</span>
          <span class="lap-time">${formatTime(lap.time)}</span>
          <input class="note-input" value="${escapeHtml(lap.note || "")}" placeholder="Add a note..." aria-label="Note for lap ${index + 1}" />
          <button class="delete-lap" title="Delete lap" aria-label="Delete lap">×</button>
        </div>`).join("")}</div>` : ""}`;
    grid.appendChild(card);
  });
  document.querySelector('#one-at-a-time').checked = oneAtATime;
  if (cardId && fieldClass) {
    const card = Array.from(grid.children).find(el => el.dataset.id === cardId);
    const parent = lapId ? Array.from(card?.querySelectorAll('.lap-row') || []).find(el => el.dataset.lap === lapId) : card;
    const input = parent?.querySelector(fieldClass);
    if (input) { input.value = draft; input.focus({ preventScroll: true }); input.setSelectionRange(...selection); }
  }
}

function renderSavedSessions() {
  const select = document.querySelector('#saved-session');
  const list = document.querySelector('#saved-session-list');
  const sessions = [...savedSessions].reverse();
  if (!sessions.some(session => session.id === selectedSessionId)) selectedSessionId = sessions[0]?.id || null;
  const dateLabel = timestamp => new Intl.DateTimeFormat('en-US', { timeZone: SplitboardReporting.zone, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date(timestamp));
  select.innerHTML = sessions.length ? sessions.map(session => `<option value="${escapeHtml(session.id)}">${dateLabel(session.savedAt)} ET</option>`).join('') : '<option>No saved sessions yet</option>';
  select.disabled = !sessions.length;
  if (selectedSessionId) select.value = selectedSessionId;
  const session = sessions.find(item => item.id === selectedSessionId);
  if (!session) { list.innerHTML = '<p class="dashboard-empty">Click Reset all to save your stopwatch times, laps, and notes here before starting fresh.</p>'; return; }
  const maximum = Math.max(1, ...session.timers.map(timer => timer.elapsed));
  const open = new Set(Array.from(list.querySelectorAll?.('details[open]') || []).map(el => el.dataset.id));
  list.innerHTML = session.timers.map(timer => `<details class="saved-timer" data-id="${escapeHtml(timer.id)}" ${open.has(timer.id) ? 'open' : ''}>
    <summary><div class="breakdown-row"><div><span>${escapeHtml(timer.name || 'Untitled stopwatch')}</span><strong>${dashboardTime(timer.elapsed)}</strong></div><div class="breakdown-track"><span style="width:${timer.elapsed / maximum * 100}%"></span></div></div><span class="saved-lap-hint">${timer.laps.length} lap${timer.laps.length === 1 ? '' : 's'} · View notes</span></summary>
    <p class="saved-state">${timer.running ? 'Was running when saved' : 'Was stopped when saved'}</p>
    ${timer.laps.length ? `<ol class="saved-laps">${timer.laps.map(lap => `<li><span>${formatTime(lap.time)}</span><p>${escapeHtml(lap.note || 'No note')}</p></li>`).join('')}</ol>` : '<p class="saved-state">No laps recorded.</p>'}
    </details>`).join('');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

grid.addEventListener('click', event => {
  const card = event.target.closest('.timer-card');
  const button = event.target.closest('button');
  if (!card || !button || button.disabled) return;
  const id = card.dataset.id;
  const timer = timers.find(t => t.id === id);
  if (!timer) return;
  if (button.matches('.start')) dispatch({ type: timer.running ? 'stop' : 'start', id });
  if (button.matches('.reset')) dispatch({ type: 'reset', id });
  if (button.matches('.remove-button')) dispatch({ type: 'remove', id });
  if (button.matches('.lap')) dispatch({ type: 'lap', id, lapId: crypto.randomUUID() });
  if (button.matches('.delete-lap')) dispatch({ type: 'delete-lap', id, lapId: button.closest('.lap-row').dataset.lap });
});
grid.addEventListener('input', event => {
  const card = event.target.closest('.timer-card');
  if (!card) return;
  if (event.target.matches('.name-input')) dispatch({ type: 'name', id: card.dataset.id, value: event.target.value });
  if (event.target.matches('.note-input')) dispatch({ type: 'note', id: card.dataset.id, lapId: event.target.closest('.lap-row').dataset.lap, value: event.target.value });
});
for (const type of ['start-all', 'stop-all']) document.getElementById(type).addEventListener('click', () => dispatch({ type }));
document.querySelector('#reset-all').addEventListener('click', () => dispatch({ type: 'reset-all', snapshotId: crypto.randomUUID() }));
document.querySelector('#saved-session').addEventListener('change', event => { selectedSessionId = event.target.value; renderSavedSessions(); });
document.querySelector('#add-timer').addEventListener('click', () => dispatch({ type: 'add', timerId: crypto.randomUUID() }));
document.querySelector('#one-at-a-time').addEventListener('change', event => dispatch({ type: 'exclusive', value: event.target.checked }));
document.querySelector("#export-data").addEventListener("click", () => {
  const data = timers.map((timer) => ({ name: timer.name, time: formatTime(currentElapsed(timer)), laps: timer.laps.map((lap, i) => ({ lap: i + 1, time: formatTime(lap.time), note: lap.note })) }));
  const blob = new Blob([JSON.stringify({ timers: data, history, savedSessions, timezone: SplitboardReporting.zone }, null, 2)], { type: "application/json" });
  const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "splitboard-session.json"; link.click(); URL.revokeObjectURL(link.href);
});
document.querySelector("#theme-toggle").addEventListener("click", () => document.body.classList.toggle("light-mode"));

setInterval(() => {
  renderDashboard();
  document.querySelectorAll(".timer-card").forEach((card) => {
    const timer = timers.find(timer => timer.id === card.dataset.id);
    const time = card.querySelector(".time");
    if (timer && time) time.textContent = formatTime(currentElapsed(timer));
  });
}, 50);

for (const view of ['day', 'week']) document.querySelector('#view-' + view).addEventListener('click', () => {
  dashboardView = view; renderDashboard(true);
});
for (const [id, direction] of [['previous-period', -1], ['next-period', 1]]) document.querySelector('#' + id).addEventListener('click', () => {
  const key = SplitboardReporting.dateKey(dashboardAnchor ?? Date.now() + clockOffset);
  dashboardAnchor = SplitboardReporting.midnight(SplitboardReporting.shift(key, direction * (dashboardView === 'week' ? 7 : 1))) + 12 * 3600000;
  renderDashboard(true);
});
document.querySelector('#current-period').addEventListener('click', () => { dashboardAnchor = null; renderDashboard(true); });
render();
connection(false, "Connecting to shared session…");
refresh();
setInterval(refresh, 1000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
window.addEventListener("online", refresh);
