let timers = [];
let oneAtATime = false;
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
  status.textContent = message || (ok ? 'Synced across devices' : 'Reconnecting… Controls unavailable');
  document.querySelectorAll('.control-bar button:not(#export-data), #one-at-a-time, .timer-card button, .timer-card input').forEach(el => {
    el.disabled = !ok || (el.classList.contains('lap') && !timers.find(t => t.id === el.closest('.timer-card').dataset.id)?.running);
  });
}
function accept(data, started) {
  clockOffset = data.serverTime - (started + Date.now()) / 2;
  if (data.version > version) {
    timers = data.timers; oneAtATime = data.oneAtATime; version = data.version;
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
for (const type of ['start-all', 'stop-all', 'reset-all']) document.getElementById(type).addEventListener('click', () => dispatch({ type }));
document.querySelector('#add-timer').addEventListener('click', () => dispatch({ type: 'add', timerId: crypto.randomUUID() }));
document.querySelector('#one-at-a-time').addEventListener('change', event => dispatch({ type: 'exclusive', value: event.target.checked }));
document.querySelector("#export-data").addEventListener("click", () => {
  const data = timers.map((timer) => ({ name: timer.name, time: formatTime(currentElapsed(timer)), laps: timer.laps.map((lap, i) => ({ lap: i + 1, time: formatTime(lap.time), note: lap.note })) }));
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "splitboard-session.json"; link.click(); URL.revokeObjectURL(link.href);
});
document.querySelector("#theme-toggle").addEventListener("click", () => document.body.classList.toggle("light-mode"));

setInterval(() => {
  document.querySelectorAll(".timer-card").forEach((card) => {
    const timer = timers.find(timer => timer.id === card.dataset.id);
    const time = card.querySelector(".time");
    if (timer && time) time.textContent = formatTime(currentElapsed(timer));
  });
}, 50);

render();
connection(false, "Connecting to shared session…");
refresh();
setInterval(refresh, 1000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
window.addEventListener("online", refresh);
