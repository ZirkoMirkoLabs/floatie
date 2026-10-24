'use strict';
const A = window.app;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const MIN = 60000;
const uid = () => Math.random().toString(36).slice(2, 9);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const short = (s, n = 40) => (s.length > n ? s.slice(0, n) + '…' : s);

const I = {
  menu: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>',
  expand: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6"/></svg>',
  collapse: '<svg viewBox="0 0 24 24"><path d="M10 4v6H4M14 20v-6h6M4 4l6 6M20 20l-6-6"/></svg>',
  left: '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
  cal: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>',
  history: '<svg viewBox="0 0 24 24"><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6L3.5 8.5M3.5 4v4.5H8M12 8v4l3 2"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>',
  bell: '<svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0"/></svg>',
  repeat: '<svg viewBox="0 0 24 24"><path d="M17 3l3 3-3 3M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 0 1-3 3H4"/></svg>',
  arrow: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  folder: '<svg viewBox="0 0 24 24"><path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M9 6v12M15 6v12"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l10-6.5z"/></svg>',
};
$$('[data-i]').forEach((el) => (el.innerHTML = I[el.dataset.i]));

// ---------- dates ----------
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = toDate(s); d.setDate(d.getDate() + n); return ymd(d); };
const today = () => ymd(new Date());
const fmtTime = (ts) => new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const fmtDay = (s, o) => toDate(s).toLocaleDateString('en-US', o);
function relDay(s) {
  const t = today();
  if (s === t) return 'Today';
  if (s === addDays(t, 1)) return 'Tomorrow';
  if (s === addDays(t, -1)) return 'Yesterday';
  return fmtDay(s, { weekday: 'long' });
}
function ago(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ---------- state ----------
const ACCENTS = ['#f2a93b', '#5b9cf5', '#4cc38a', '#e5668f', '#a78bfa', '#9ca3af'];
// The main process says whether data loaded, is genuinely new, or exists but couldn't be read yet (e.g. locked at
// login). In that last case the app waits and retries; it never starts blank and never saves until the real data is in.
let D, S, loaded = false, migrated = false;
function adopt(data) {
  D = data;
  D.v = 3;
  D.tasks ||= []; D.timers ||= []; D.notes ||= ''; D.log ||= [];
  D.settings = { accent: ACCENTS[0], sound: true, showWeek: false, ...D.settings };
  S = D.settings;
  loaded = true;
}
const first = A.load();
if (first.value) adopt(first.value);
else if (first.fresh) {
  let old = null;
  try { old = JSON.parse(localStorage.getItem('floatie:v1')); } catch {}
  migrated = !!old?.tasks?.length;
  adopt({ tasks: (old?.tasks || []).map((t, i) => ({ ...t, date: old.day || today(), order: i })), timers: old?.timers || [] });
} else {
  adopt({ tasks: [], timers: [] });   // placeholder only; `loaded` goes back to false so nothing is saved over the real file
  loaded = false;
  const retry = setInterval(() => {
    const r = A.load();
    if (!r.value) return;
    clearInterval(retry);
    adopt(r.value);
    rollover(); render(); applyTheme(); restoreAlarms();
  }, 2000);
}
// saves are acknowledged: a failed write keeps retrying with the latest state and shows a warning until it lands
let saving = false, saveAgain = false, saveRetry = null;
async function save() {
  if (!loaded) return;
  if (saving) { saveAgain = true; return; }
  saving = true; clearTimeout(saveRetry);
  const ok = await A.save(D).catch(() => false);
  saving = false;
  $('#saveWarn').classList.toggle('hidden', ok);
  if (saveAgain) { saveAgain = false; save(); } else if (!ok) saveRetry = setTimeout(save, 3000);
}

let P = { glass: 'acrylic', autoCollapse: true, expandOn: 'hover', theme: 'system', fade: true, idleOpacity: 0.35 };   // window prefs live in the main process
let sel = today(), lastToday = today(), tab = 'tasks', collapsed = false;
let openSetter = null, ringing = [], justDone = null, dragId = null;

// each undo entry reverses exactly one action, so undoing never throws away later work
const undo = [];
const pushUndo = (fn) => { undo.push(fn); if (undo.length > 50) undo.shift(); };
function doUndo() { const fn = undo.pop(); if (!fn) return; fn(); save(); render(); }

function log(type, text, extra = {}) {
  D.log.unshift({ id: uid(), at: Date.now(), type, text, ...extra });
  if (D.log.length > 400) D.log.length = 400;
}

// ---------- rollover ----------
function rollover() {
  const t = today();
  let changed = false;
  for (const task of D.tasks) if (!task.done && task.date < t) { task.date = t; changed = true; }
  const cutoff = addDays(t, -60), n = D.tasks.length;
  D.tasks = D.tasks.filter((x) => !(x.done && x.date < cutoff));
  if (changed || n !== D.tasks.length) save();
  if (lastToday !== t) { if (sel === lastToday) sel = t; lastToday = t; render(); }
}
// `base` is the task's original due date (rollover moves `date` to today, which would make weekly tasks drift)
function nextRepeat(base, rep) {
  const t = today();
  let d = base;
  if (rep === 'weekly') { do d = addDays(d, 7); while (d <= t); return d; }
  if (d < t) d = t;
  do d = addDays(d, 1); while (rep === 'weekdays' && [0, 6].includes(toDate(d).getDay()));
  return d;
}
const withDate = (ts, date) => { const a = new Date(ts), b = toDate(date); b.setHours(a.getHours(), a.getMinutes(), 0, 0); return +b; };

// ---------- timers ----------
const newTimer = (ms) => ({ total: ms, end: Date.now() + ms, left: null });
const remaining = (tm) => (tm.end ? Math.max(0, tm.end - Date.now()) : tm.left);
function fmt(ms) {
  const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}
function togglePause(tm) { if (tm.end) { tm.left = remaining(tm); tm.end = null; } else { tm.end = Date.now() + tm.left; tm.left = null; } }
const durLabel = (min) => (min >= 60 ? `${+(min / 60).toFixed(2)} h` : `${min} min`);

// ---------- natural input ----------
const WD = { sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, weds: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6 };
function parseInput(raw, base) {
  let s = ` ${raw} `;
  const o = { date: base, dateSet: false, ms: null, remindAt: null, repeat: null, star: false };
  const take = (re, fn) => { s = s.replace(re, (...m) => { fn(m); return ' '; }); };
  if (s.includes('!')) { o.star = true; s = s.replace(/!+/g, ' '); }
  take(/\s(every\s?day|daily)(?=\s)/i, () => (o.repeat = 'daily'));
  take(/\s(every\s?weekday|weekdays)(?=\s)/i, () => (o.repeat = 'weekdays'));
  take(/\s(every\s?week|weekly)(?=\s)/i, () => (o.repeat = 'weekly'));
  take(/\s(today|tonight)(?=\s)/i, () => { o.date = today(); o.dateSet = true; });
  take(/\s(tomorrow|tmrw?|tmr)(?=\s)/i, () => { o.date = addDays(today(), 1); o.dateSet = true; });
  take(/\s(?:on\s)?(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:s|nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)(?=\s)/i, (m) => {
    const want = WD[m[1].toLowerCase()];
    let d = today(); while (toDate(d).getDay() !== want) d = addDays(d, 1);
    o.date = d; o.dateSet = true;
  });
  let rem = null;
  take(/\s(?:at|@)\s?(\d{1,2})(?::(\d{2}))?\s?(am|pm|a|p)?(?=\s)/i, (m) => {
    let h = +m[1]; const mm = +(m[2] || 0), ap = (m[3] || '').toLowerCase();
    if (h > 23 || mm > 59) return;
    if (ap.startsWith('p') && h < 12) h += 12;
    if (ap.startsWith('a') && h === 12) h = 0;
    if (!ap && !m[2] && h <= 7) h += 12;
    rem = { h, m: mm };
  });
  take(/\s(\d+(?:\.\d+)?)\s?(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)(?=\s)/i, (m) => {
    const u = m[2][0].toLowerCase();
    o.ms = parseFloat(m[1]) * (u === 'h' ? 60 * MIN : u === 's' ? 1000 : MIN);
  });
  o.text = s.replace(/\s+/g, ' ').trim();
  if (rem) {
    const d = toDate(o.date); d.setHours(rem.h, rem.m, 0, 0);
    const again = new Date(+d + 3600e3);   // clocks going back: the second 1:30 can still be ahead when the first has passed
    if (+d < Date.now() && +again > Date.now() && again.getHours() === rem.h && again.getMinutes() === rem.m) d.setTime(+again);
    else if (+d < Date.now() && !o.dateSet && o.date === today()) { d.setDate(d.getDate() + 1); o.date = ymd(d); }
    o.remindAt = +d;
  }
  if (o.repeat === 'weekdays') {   // the first occurrence skips the weekend too
    const was = o.date;
    while ([0, 6].includes(toDate(o.date).getDay())) o.date = addDays(o.date, 1);
    if (o.date !== was && o.remindAt) o.remindAt = withDate(o.remindAt, o.date);
  }
  return o;
}
function hintFor(o) {
  const h = [];
  if (o.date !== sel) h.push(['Today', 'Tomorrow', 'Yesterday'].includes(relDay(o.date)) ? relDay(o.date) : fmtDay(o.date, { weekday: 'short', month: 'short', day: 'numeric' }));
  if (o.remindAt) h.push(`Remind ${fmtTime(o.remindAt)}`);
  if (o.ms) h.push(`Timer ${fmt(o.ms)}`);
  if (o.repeat) h.push(`Repeats ${o.repeat}`);
  if (o.star) h.push('Starred');
  return h;
}

// ---------- render: tasks ----------
const find = (kind, id) => (kind === 'timer' ? D.timers : D.tasks).find((x) => x.id === id);
const tasksOn = (d) => D.tasks.filter((t) => t.date === d);
const openOn = (d) => tasksOn(d).filter((x) => !x.done).sort((a, b) => a.order - b.order);
const isRinging = (kind, id) => ringing.some((r) => r.id === id && (kind === 'any' || r.kind === kind));
const pill = (tm, key) => (tm ? `<button class="pill ${tm.end ? '' : 'paused'}" data-pill="${key}" title="Click to pause / resume">${fmt(remaining(tm))}</button>` : '');

function render() {
  const t = today();
  $('#dayName').textContent = relDay(sel);
  $('#dayDate').textContent = fmtDay(sel, sel === t ? { weekday: 'short', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' });
  $('#backToday').classList.toggle('hidden', sel === t);
  $('#weekBtn').classList.toggle('on', S.showWeek);
  $('#week').classList.toggle('hidden', !S.showWeek);
  if (S.showWeek) {
    let w = '';
    for (let i = -3; i <= 3; i++) {
      const d = addDays(sel, i), list = tasksOn(d), open = list.filter((x) => !x.done).length;
      w += `<button class="day ${d === t ? 'today' : ''} ${d === sel ? 'sel' : ''}" data-day="${d}" title="${fmtDay(d, { weekday: 'long', month: 'short', day: 'numeric' })}${list.length ? ` · ${open} open` : ''}">
        <small>${fmtDay(d, { weekday: 'narrow' })}</small><span>${toDate(d).getDate()}</span>${list.length ? `<i class="${open ? '' : 'all'}"></i>` : ''}</button>`;
    }
    $('#days').innerHTML = w;
  }

  const list = tasksOn(sel), open = openOn(sel);
  const done = list.filter((x) => x.done).sort((a, b) => (a.doneAt || 0) - (b.doneAt || 0));
  $('#quick').classList.toggle('hidden', sel !== t);
  $('#add').classList.toggle('hidden', sel < t);   // past days are a record; anything added there would roll straight to today
  $('#newTask').placeholder = !loaded ? 'Loading your saved tasks…' : sel === t ? 'Add a task…  try “call mom at 3pm”' : `Add to ${relDay(sel)}…`;
  $('#newTask').disabled = !loaded;

  let h = '';
  if (sel === t && D.timers.length) {
    h += '<ul>' + D.timers.map((x) => `
      <li class="row timer-row ${isRinging('timer', x.id) ? 'ringing' : ''}" data-kind="timer" data-id="${esc(x.id)}">
        <span class="body"><span class="text">${I.clock}${esc(x.label)}</span></span>${pill(x.timer, 'timer:' + x.id)}
        <span class="tools"><button class="ico del" data-act="del" title="Remove">${I.x}</button></span>
      </li>`).join('') + '</ul>';
  }
  if (!list.length) {
    h += sel === t ? '<div class="empty"><b>Clear day</b>Add something above. Press <kbd>?</kbd> for tips.</div>'
      : sel > t ? `<div class="empty"><b>Nothing planned</b>Anything you add here shows up ${relDay(sel) === 'Tomorrow' ? 'tomorrow' : 'on ' + relDay(sel)}.</div>`
        : '<div class="empty"><b>Nothing here</b>No tasks were done this day.</div>';
  }
  h += '<ul id="openList">' + open.map(row).join('') + '</ul>';
  if (done.length) h += `<div class="section">Done · ${done.length}</div><ul>${done.map(row).join('')}</ul>`;
  $('#scroll').innerHTML = h;

  $('#count').textContent = list.length ? (open.length ? `${open.length} left${done.length ? ` · ${done.length} done` : ''}` : `All ${done.length} done`) : '';
  $('#clearDone').textContent = done.length ? 'Clear done' : '';
  if ($('#notes').value !== D.notes) $('#notes').value = D.notes;
  justDone = null;
  renderPeek();
  updateLive();
  if (!ringing.length && $('#alarm').classList.contains('open')) showAlarm();   // e.g. after an undo: nothing left to ring, so close it
  const inp = $('[data-setcustom]'); if (inp) inp.focus();
}

function row(t) {
  const now = Date.now(), meta = [];
  if (t.remindAt && !t.done) meta.push(`<span class="${t.remindAt < now ? 'late' : ''}">${I.bell}${t.date === today() || t.remindAt < now ? '' : fmtDay(ymd(new Date(t.remindAt)), { weekday: 'short' }) + ' '}${fmtTime(t.remindAt)}</span>`);
  if (t.repeat) meta.push(`<span>${I.repeat}${esc(t.repeat)}</span>`);
  return `
  <li class="row ${t.done ? 'done' : ''} ${t.star ? 'starred' : ''} ${justDone === t.id ? 'just-done' : ''} ${isRinging('any', t.id) ? 'ringing' : ''}" data-kind="task" data-id="${esc(t.id)}" ${t.done ? '' : 'draggable="true"'}>
    <button class="check" data-act="toggle" title="${t.done ? 'Mark not done' : 'Mark done'}">${I.check}</button>
    <span class="body"><span class="text" title="Double-click to rename · right-click for more">${esc(t.text)}</span>${meta.length ? `<span class="meta">${meta.join('')}</span>` : ''}</span>
    ${pill(t.timer, 'task:' + t.id)}
    <span class="tools">
      <button class="ico ${t.star ? 'star-on' : ''}" data-act="star" title="${t.star ? 'Unstar' : 'Star'}">${I.star}</button>
      ${t.done ? '' : `<button class="ico" data-act="timer" title="${t.timer ? 'Stop timer' : 'Start timer'}">${t.timer ? I.stop : I.clock}</button>`}
      <button class="ico del" data-act="del" title="Delete">${I.x}</button>
    </span>
  </li>
  ${openSetter === t.id ? `<li class="setter" data-id="${esc(t.id)}">${[5, 10, 15, 25, 45, 60].map((m) => `<button class="chip" data-set="${m}">${m < 60 ? m + 'm' : '1h'}</button>`).join('')}<input class="mini-input" data-setcustom placeholder="min" inputmode="numeric"></li>` : ''}`;
}

// collapsed view: today's open tasks and running timers, nothing else
const PEEK_MAX = 8;
function renderPeek() {
  const t = today(), open = openOn(t);
  $('#peekDay').textContent = `${fmtDay(t, { weekday: 'short' })} ${toDate(t).getDate()}`;
  $('#peekCount').textContent = open.length ? `${open.length} left` : 'all done';
  const items = [
    ...D.timers.map((x) => `<li class="timer ${isRinging('timer', x.id) ? 'ringing' : ''}"><span class="dot" style="border-style:dashed"></span><span class="t">${esc(x.label)}</span><span class="when" data-pill="timer:${x.id}">${fmt(remaining(x.timer))}</span></li>`),
    ...open.map((x) => `<li class="${x.star ? 'starred' : ''} ${isRinging('any', x.id) ? 'ringing' : ''}"><span class="dot"></span><span class="t">${esc(x.text)}</span>${
      x.timer ? `<span class="when" data-pill="task:${x.id}">${fmt(remaining(x.timer))}</span>` : x.remindAt ? `<span class="when">${fmtTime(x.remindAt)}</span>` : ''}</li>`),
  ];
  $('#peekList').innerHTML = items.length
    ? items.slice(0, PEEK_MAX).join('') + (items.length > PEEK_MAX ? `<li class="more">+${items.length - PEEK_MAX} more</li>` : '')
    : '<li class="none">Nothing left today</li>';
  if (collapsed) requestAnimationFrame(() => A.peekHeight(Math.ceil($('#peek').getBoundingClientRect().height)));
}

// live bits: countdowns and tray tooltip
let lastTip = '';
function updateLive() {
  $$('[data-pill]').forEach((p) => {
    const [k, id] = p.dataset.pill.split(':'); const it = find(k, id);
    if (it?.timer) p.textContent = fmt(remaining(it.timer));
  });
  const next = [
    ...D.timers.filter((x) => x.timer.end).map((x) => [x.label, remaining(x.timer)]),
    ...D.tasks.filter((x) => x.timer?.end && !x.done).map((x) => [x.text, remaining(x.timer)]),
  ].sort((a, b) => a[1] - b[1])[0];
  const left = openOn(today()).length;
  const tip = `Floatie — ${next ? `${Math.ceil(next[1] / MIN)} min · ${next[0]}` : left ? `${left} left today` : 'all clear'}`;
  if (tip !== lastTip) { A.tooltip(tip); lastTip = tip; }
}

// ---------- tick ----------
function tick() {
  const now = Date.now();
  for (const x of D.timers) if (x.timer.end && remaining(x.timer) === 0 && !isRinging('timer', x.id)) ring('timer', x);
  for (const x of D.tasks) {
    if (x.done) continue;
    if (x.timer?.end && remaining(x.timer) === 0 && !isRinging('task', x.id)) ring('task', x);
    if (x.remindAt && x.remindAt <= now && !x.reminded && !isRinging('remind', x.id)) ring('remind', x);
  }
  updateLive();
}
setInterval(tick, 250);
setInterval(rollover, 30000);

// ---------- alarm ----------
let soundTimer = null, soundStop = 0, actx = null;
function chime() {
  actx = actx || new AudioContext();
  const t = actx.currentTime;
  [880, 1175, 1568].forEach((f, i) => {
    const o = actx.createOscillator(), g = actx.createGain(), s = t + i * 0.16;
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(0.22, s + 0.02); g.gain.exponentialRampToValueAtTime(0.001, s + 0.7);
    o.connect(g).connect(actx.destination); o.start(s); o.stop(s + 0.75);
  });
}
// `alarm` on the item is saved, so an alarm that fired but wasn't answered comes back after a restart
function ring(kind, item) {
  ringing.push({ kind, id: item.id });
  item.alarm = kind;
  if (kind === 'remind') item.reminded = true; else { item.timer.end = null; item.timer.left = 0; }
  save();
  announce(kind, kind === 'timer' ? item.label : item.text);
}
function announce(kind, title) {
  A.alarm(kind === 'remind' ? 'Reminder' : "Time's up", title);
  if (S.sound && !soundTimer) { chime(); soundTimer = setInterval(() => (Date.now() > soundStop ? stopSound() : chime()), 2400); }
  soundStop = Date.now() + 60000;
  closeSheets(); setTab('tasks'); showAlarm(); render();
}
function restoreAlarms() {
  for (const x of D.timers) if (x.alarm && !isRinging('timer', x.id)) ringing.push({ kind: 'timer', id: x.id });
  for (const x of D.tasks) if (x.alarm && !x.done && !isRinging(x.alarm, x.id)) ringing.push({ kind: x.alarm, id: x.id });
  const r = ringing[0], it = r && find(r.kind === 'timer' ? 'timer' : 'task', r.id);
  if (it) announce(r.kind, r.kind === 'timer' ? it.label : it.text);
}
function stopSound() { clearInterval(soundTimer); soundTimer = null; }
function showAlarm() {
  const r = ringing[0];
  if (!r) { $('#alarm').classList.remove('open'); stopSound(); A.alarmAck(); return; }
  const it = find(r.kind === 'timer' ? 'timer' : 'task', r.id);
  if (!it) { ringing.shift(); return showAlarm(); }
  $('#alarmKind').textContent = r.kind === 'remind' ? 'Reminder' : "Time's up";
  $('#alarmTitle').textContent = r.kind === 'timer' ? it.label : it.text;
  $('#aDone').textContent = r.kind === 'timer' ? 'OK' : 'Mark done';
  $('#alarmMore').textContent = ringing.length > 1 ? `${ringing.length - 1} more waiting` : '';
  $('#alarm').classList.add('open');
  $('#alarm .card').focus({ preventScroll: true });   // not the button: a stray Enter/Space must not mark the task done
}
function resolveAlarm(action) {
  const r = ringing.shift(); if (!r) return;
  const it = find(r.kind === 'timer' ? 'timer' : 'task', r.id);
  if (it) {
    if (!isRinging('any', r.id)) delete it.alarm;
    if (action === 'snooze') {
      // a snooze moves this occurrence only; repeats keep the scheduled time (remindBase)
      if (r.kind === 'remind') { it.remindBase ||= it.remindAt; it.remindAt = Date.now() + 5 * MIN; it.reminded = false; } else it.timer = newTimer(5 * MIN);
    } else if (r.kind === 'timer') D.timers = D.timers.filter((x) => x.id !== r.id);
    else {
      if (r.kind === 'task') it.timer = null;
      if (action === 'done') setDone(it, true);
    }
  }
  save(); render(); showAlarm();
}
$('#aDone').onclick = () => resolveAlarm('done');
$('#aSnooze').onclick = () => resolveAlarm('snooze');
$('#aDismiss').onclick = () => resolveAlarm('dismiss');

// ---------- task actions ----------
const maxOrder = (d) => Math.max(0, ...tasksOn(d).map((x) => x.order || 0));
const minOrder = (d) => Math.min(0, ...tasksOn(d).map((x) => x.order || 0));

function addTask(raw) {
  const o = parseInput(raw, sel);
  if (!o.text) return;
  D.tasks.push({
    id: uid(), text: o.text, date: o.date, done: false, star: o.star, repeat: o.repeat,
    timer: o.ms ? newTimer(o.ms) : null, remindAt: o.remindAt, remindBase: o.remindAt, reminded: false, due: o.repeat ? o.date : null,
    order: o.star ? minOrder(o.date) - 1 : maxOrder(o.date) + 1, created: Date.now(),
  });
  log('add', o.text, o.date !== today() ? { to: o.date } : {});
  save(); render();
}
function setDone(t, on) {
  t.done = on; t.doneAt = on ? Date.now() : null;
  if (on) {
    log('done', t.text);
    t.timer = null; justDone = t.id; delete t.alarm;
    ringing = ringing.filter((r) => r.id !== t.id);
    if (t.repeat && !t.spawned) {
      const date = nextRepeat(t.due || t.date, t.repeat), series = (t.series ||= t.id);
      const same = D.tasks.find((x) => x.series === series && x.date === date && x.id !== t.id);   // never two of one occurrence
      if (same) t.spawned = same.id;
      else {
        const id = uid(), base = t.remindBase || t.remindAt, at = base ? withDate(base, date) : null;
        D.tasks.push({ ...t, id, date, due: date, done: false, doneAt: null, timer: null, spawned: null, reminded: false,
          remindAt: at, remindBase: at, order: maxOrder(date) + 1 });
        t.spawned = id;
      }
    }
  } else if (t.spawned) {
    // an unfinished next occurrence is withdrawn; a finished one stays linked so re-completing doesn't make another
    const child = find('task', t.spawned);
    if (!child) t.spawned = null;
    else if (!child.done) { D.tasks = D.tasks.filter((x) => x.id !== t.spawned); t.spawned = null; }
  }
}
// undo puts back everything completion changed: the timer, the alarm, the next occurrence it created or withdrew
function toggleWithUndo(t) {
  const before = structuredClone(t), had = new Set(D.tasks.map((x) => x.id));
  const child = t.spawned && find('task', t.spawned), childBefore = child && structuredClone(child);
  setDone(t, !t.done);
  const added = D.tasks.filter((x) => !had.has(x.id)).map((x) => x.id);
  pushUndo(() => {
    D.tasks = D.tasks.filter((x) => !(added.includes(x.id) && !x.done));
    const x = find('task', before.id);
    if (x) { for (const k of Object.keys(x)) if (!(k in before)) delete x[k]; Object.assign(x, structuredClone(before)); }
    if (childBefore && !find('task', childBefore.id)) D.tasks.push(childBefore);
    if (before.alarm && !before.done && !isRinging(before.alarm, before.id)) { ringing.push({ kind: before.alarm, id: before.id }); showAlarm(); }
  });
}
function removeTask(id) {
  const t = find('task', id);
  D.tasks = D.tasks.filter((x) => x.id !== id);
  ringing = ringing.filter((r) => r.id !== id);
  log('delete', t.text, { tasks: [t] });
  pushUndo(() => { if (!find('task', t.id)) D.tasks.push(t); });
  save(); render();
}
function moveTask(t, date) {
  const prev = { date: t.date, order: t.order, remindAt: t.remindAt, remindBase: t.remindBase, reminded: t.reminded };
  pushUndo(() => { const x = find('task', t.id); if (x) Object.assign(x, prev); });
  if (t.remindAt) { t.remindAt = t.remindBase = withDate(t.remindBase || t.remindAt, date); t.reminded = false; }
  t.date = date; t.order = maxOrder(date) + 1;
  log('move', t.text, { to: date });
  save(); render();
}
function addTimer(min) {
  if (!(min > 0)) return;
  D.timers.push({ id: uid(), label: `${durLabel(min)} timer`, timer: newTimer(min * MIN) });
  save(); render();
}

const input = $('#newTask');
$('#add').onsubmit = (e) => { e.preventDefault(); addTask(input.value.trim()); input.value = ''; showHint(); };
function showHint() {
  const v = input.value.trim(), hint = $('#hint');
  const h = v ? hintFor(parseInput(v, sel)) : [];
  hint.innerHTML = h.map((x) => `<b>${esc(x)}</b>`).join('');
  hint.classList.toggle('hidden', !h.length);
}
input.addEventListener('input', showHint);
$$('#quick .chip').forEach((b) => (b.onclick = () => addTimer(+b.dataset.m)));
$('#customMin').onkeydown = (e) => { if (e.key === 'Enter') { addTimer(parseFloat(e.target.value)); e.target.value = ''; } };

$('#days').onclick = (e) => { const d = e.target.closest('[data-day]'); if (d) { sel = d.dataset.day; render(); } };
$('#prevWeek').onclick = () => { sel = addDays(sel, -7); render(); };
$('#nextWeek').onclick = () => { sel = addDays(sel, 7); render(); };
$('#backToday').onclick = () => { sel = today(); render(); };
const toggleWeek = () => { S.showWeek = !S.showWeek; save(); render(); };
$('#weekBtn').onclick = toggleWeek;

const scroll = $('#scroll');
scroll.addEventListener('click', (e) => {
  const p = e.target.closest('[data-pill]');
  if (p) { const [k, id] = p.dataset.pill.split(':'); togglePause(find(k, id).timer); save(); render(); return; }
  const set = e.target.closest('[data-set]');
  if (set) { find('task', set.closest('.setter').dataset.id).timer = newTimer(+set.dataset.set * MIN); openSetter = null; save(); render(); return; }
  const btn = e.target.closest('[data-act]'); if (!btn) return;
  const li = btn.closest('li.row'), kind = li.dataset.kind, id = li.dataset.id, it = find(kind, id);
  switch (btn.dataset.act) {
    case 'toggle': toggleWithUndo(it); break;
    case 'star': it.star = !it.star; break;
    case 'timer': if (it.timer) it.timer = null; else openSetter = openSetter === id ? null : id; break;
    case 'del':
      if (kind === 'task') return removeTask(id);
      D.timers = D.timers.filter((x) => x.id !== id); ringing = ringing.filter((r) => r.id !== id); break;
  }
  save(); render();
});
scroll.addEventListener('keydown', (e) => {
  if (e.target.matches('[data-setcustom]')) {
    if (e.key === 'Enter') { const m = parseFloat(e.target.value); if (m > 0) find('task', e.target.closest('.setter').dataset.id).timer = newTimer(m * MIN); openSetter = null; save(); render(); }
    if (e.key === 'Escape') { e.stopPropagation(); openSetter = null; render(); }
  }
  if (e.target.matches('.text[contenteditable="true"]')) {
    if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
    if (e.key === 'Escape') { e.stopPropagation(); e.target.dataset.cancel = '1'; e.target.blur(); }
  }
});
function rename(li) {
  const el = li && $('.text', li); if (!el) return;
  el.contentEditable = 'true'; el.focus();
  document.getSelection().selectAllChildren(el);
  el.addEventListener('blur', () => {
    const t = find('task', li.dataset.id), v = el.textContent.trim();
    if (t && !el.dataset.cancel && v) t.text = v;
    save(); render();
  }, { once: true });
}
scroll.addEventListener('dblclick', (e) => { const li = e.target.closest('li.row[data-kind="task"]'); if (li && e.target.closest('.body')) rename(li); });

// drag to reorder
scroll.addEventListener('dragstart', (e) => {
  const li = e.target.closest('li.row[draggable]'); if (!li) return;
  dragId = li.dataset.id; li.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move';
});
scroll.addEventListener('dragover', (e) => {
  const li = e.target.closest('#openList li.row'); if (!dragId || !li) return;
  e.preventDefault();
  $$('.drop-above,.drop-below').forEach((x) => x.classList.remove('drop-above', 'drop-below'));
  const r = li.getBoundingClientRect();
  li.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-above' : 'drop-below');
});
scroll.addEventListener('drop', (e) => {
  const li = e.target.closest('#openList li.row'); if (!dragId || !li || li.dataset.id === dragId) return;
  e.preventDefault();
  const ids = $$('#openList li.row').map((x) => x.dataset.id).filter((x) => x !== dragId);
  let i = ids.indexOf(li.dataset.id); if (li.classList.contains('drop-below')) i++;
  ids.splice(i, 0, dragId);
  ids.forEach((id, n) => (find('task', id).order = n));
  save();
});
scroll.addEventListener('dragend', () => { dragId = null; render(); });

// ---------- popovers ----------
const ctx = $('#ctx'), menu = $('#menu');
function closePops() {
  menu.classList.add('hidden'); ctx.classList.add('hidden');
  $$('.ctx').forEach((x) => x.classList.remove('ctx'));
}
// an open sheet owns focus: what's underneath can't be tabbed to or typed into, and focus returns there on close
const underSheet = () => $$('.panel > header, .panel > .tabs, .panel > .view, #saveWarn');
let sheetReturn = null;
function openSheet(id) {
  closePops();
  if (!$('.sheet:not(.hidden)')) sheetReturn = document.activeElement;
  $$('.sheet').forEach((s) => s.classList.toggle('hidden', s.id !== id));
  underSheet().forEach((el) => (el.inert = true));
  $(`#${id} [data-close]`).focus();
}
function closeSheets() {
  const wasOpen = !!$('.sheet:not(.hidden)');
  $$('.sheet').forEach((s) => s.classList.add('hidden'));
  underSheet().forEach((el) => (el.inert = false));
  if (wasOpen && sheetReturn && document.contains(sheetReturn)) sheetReturn.focus({ preventScroll: true });
  sheetReturn = null;
}
function placePop(x, y) {
  ctx.classList.remove('hidden');
  const pr = $('.panel').getBoundingClientRect(), cr = ctx.getBoundingClientRect();
  ctx.style.left = Math.max(6, Math.min(x, pr.width - cr.width - 6)) + 'px';
  ctx.style.top = Math.max(6, Math.min(y, pr.height - cr.height - 6)) + 'px';
}
document.addEventListener('mousedown', (e) => { if (!e.target.closest('.pop') && !e.target.closest('#menuBtn')) closePops(); });

scroll.addEventListener('contextmenu', (e) => {
  const li = e.target.closest('li.row[data-kind="task"]'); if (!li) return;
  e.preventDefault();
  taskMenu(find('task', li.dataset.id), e.clientX, e.clientY, li);
});
function taskMenu(t, x, y, li) {
  closePops();
  li.classList.add('ctx');
  const tm = today(), tmw = addDays(tm, 1);
  const remTime = t.remindAt ? `${pad(new Date(t.remindAt).getHours())}:${pad(new Date(t.remindAt).getMinutes())}` : '';
  ctx.innerHTML = `
    <button data-c="star">${I.star}${t.star ? 'Unstar' : 'Star'}</button>
    <button data-c="rename">${I.edit}Rename</button>
    ${t.done ? '' : `<hr>
    <div class="row2">${I.clock}${[5, 15, 25, 45, 60].map((m) => `<button class="chip" data-c="timer" data-m="${m}">${m < 60 ? m : '1h'}</button>`).join('')}</div>
    <div class="row2">${I.bell}<input type="time" id="ctxTime" value="${remTime}">${t.remindAt ? '<button class="chip" data-c="unremind">Clear</button>' : ''}</div>
    <div class="row2">${I.repeat}<div class="seg">${[['', 'Off'], ['daily', 'Day'], ['weekdays', 'Wkdy'], ['weekly', 'Week']].map(([v, l]) => `<button data-c="repeat" data-v="${v}" class="${(t.repeat || '') === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <hr>
    ${t.date !== tm ? `<button data-c="move" data-d="${tm}">${I.arrow}Move to today</button>` : ''}
    ${t.date !== tmw ? `<button data-c="move" data-d="${tmw}">${I.arrow}Move to tomorrow</button>` : ''}
    <button data-c="move" data-d="${addDays(t.date < tm ? tm : t.date, 7)}">${I.arrow}Push a week</button>`}
    <hr>
    <button data-c="del" class="del">${I.trash}Delete</button>`;
  placePop(x, y);
  ctx.onclick = (e) => {
    const b = e.target.closest('[data-c]'); if (!b) return;
    const c = b.dataset.c;
    closePops();
    if (c === 'star') t.star = !t.star;
    else if (c === 'rename') return rename($(`li.row[data-id="${t.id}"]`));
    else if (c === 'timer') t.timer = newTimer(+b.dataset.m * MIN);
    else if (c === 'unremind') { t.remindAt = t.remindBase = null; t.reminded = false; }
    else if (c === 'repeat') { t.repeat = b.dataset.v || null; t.due = t.repeat ? t.date : null; }
    else if (c === 'move') return moveTask(t, b.dataset.d);
    else if (c === 'del') return removeTask(t.id);
    save(); render();
  };
  const time = $('#ctxTime');
  if (time) time.onchange = () => {
    if (!time.value) return;
    const [h, m] = time.value.split(':').map(Number), d = toDate(t.date); d.setHours(h, m, 0, 0);
    t.remindAt = t.remindBase = +d; t.reminded = false; save(); render();
  };
}

// ---------- clipboard ----------
let CL = { folders: [], items: [], paused: false };
let folder = null, clipQuery = '', addingFolder = false, clearArmed = 0;
const folderName = (id) => CL.folders.find((f) => f.id === id)?.name || 'Recent';

function renderClips() {
  const recentN = CL.items.filter((i) => !i.folder).length;
  if (folder && !CL.folders.some((f) => f.id === folder)) folder = null;
  const draft = $('#newFolder')?.value || '';   // a clip arriving mid-typing must not wipe the folder name
  $('#folders').innerHTML =
    `<button class="chip ${!folder ? 'on' : ''}" data-f="">Recent · ${recentN}</button>` +
    CL.folders.map((f) => `<button class="chip ${folder === f.id ? 'on' : ''}" data-f="${f.id}" title="Right-click to rename or delete">${esc(f.name)}</button>`).join('') +
    (addingFolder ? '<input id="newFolder" placeholder="Folder name">' : '<button class="chip" id="addFolder" title="New folder">+</button>');
  const nf = $('#newFolder'); if (nf) { nf.value = draft; nf.focus(); }

  const q = clipQuery.toLowerCase();
  const items = CL.items
    .filter((i) => (q ? i.type === 'text' && i.text.toLowerCase().includes(q) : (i.folder || null) === folder))
    .sort((a, b) => b.at - a.at);
  $('#clipList').innerHTML = items.length ? '<ul>' + items.map((i) => `
    <li class="clip" data-id="${esc(i.id)}" title="Click to copy" tabindex="0" role="button" aria-label="Copy ${i.type === 'text' ? esc(short(i.text, 80)) : 'image'}">
      <div class="c">
        ${i.type === 'text' ? `<div class="preview">${esc(i.text.slice(0, 600))}</div>` : `<img src="${esc(i.thumbUrl)}" alt="">`}
        <div class="meta"><span>${ago(i.at)}</span><span>${i.type === 'text' ? `${i.text.length} chars` : `${i.w}×${i.h}`}</span>${q && i.folder ? `<span>${I.folder}${esc(folderName(i.folder))}</span>` : ''}</div>
      </div>
      <span class="tools"><button class="ico" data-cl="move" title="Move to folder">${I.folder}</button><button class="ico del" data-cl="del" title="Delete">${I.x}</button></span>
    </li>`).join('') + '</ul>'
    : `<div class="empty">${q ? '<b>No matches</b>' : folder ? '<b>Empty folder</b>Move clips here with the folder button on any clip.' : CL.paused ? '<b>Capture is paused</b>Press play above to resume.' : '<b>Nothing copied yet</b>Copy anything and it shows up here.'}</div>`;

  $('#clipPause').innerHTML = CL.paused ? I.play : I.pause;
  $('#clipPause').title = CL.paused ? 'Resume capture' : 'Pause capture';
  $('#clipPause').classList.toggle('on', CL.paused);
  $('#clipCount').textContent = q ? `${items.length} found` : `${items.length} ${folder ? 'in ' + folderName(folder) : 'recent'}`;
  $('#clipClear').textContent = !folder && !q && recentN ? (Date.now() < clearArmed ? 'Click again to clear' : 'Clear recent') : '';
}
A.clips.get().then((v) => { CL = v; renderClips(); });
A.on('clips', (v) => { CL = v; renderClips(); });

$('#clipSearch').addEventListener('input', (e) => { clipQuery = e.target.value.trim(); renderClips(); });
$('#clipPause').onclick = () => A.clips.pause(!CL.paused);
$('#clipClear').onclick = () => {
  if (Date.now() < clearArmed) { clearArmed = 0; A.clips.clear(); return; }
  clearArmed = Date.now() + 3000; renderClips(); setTimeout(renderClips, 3100);
};
$('#folders').addEventListener('click', (e) => {
  if (e.target.id === 'addFolder') { addingFolder = true; return renderClips(); }
  const b = e.target.closest('[data-f]'); if (!b) return;
  folder = b.dataset.f || null; renderClips();
});
$('#folders').addEventListener('keydown', async (e) => {
  if (e.target.id !== 'newFolder') return;
  if (e.key === 'Enter' && e.target.value.trim()) { folder = await A.clips.addFolder(e.target.value.trim()); addingFolder = false; renderClips(); }
  if (e.key === 'Escape') { e.stopPropagation(); addingFolder = false; renderClips(); }
});
$('#folders').addEventListener('focusout', (e) => { if (e.target.id === 'newFolder') setTimeout(() => { if (addingFolder) { addingFolder = false; renderClips(); } }, 150); });
$('#folders').addEventListener('contextmenu', (e) => {
  const b = e.target.closest('[data-f]'); if (!b || !b.dataset.f) return;
  e.preventDefault();
  const f = CL.folders.find((x) => x.id === b.dataset.f);
  closePops();
  ctx.innerHTML = `<div class="row2"><input class="mini-input" id="renameFolder" style="width:130px" value="${esc(f.name)}"></div><hr>
    <button data-c="del" class="del">${I.trash}Delete folder <span class="k">clips go to Recent</span></button>`;
  placePop(e.clientX, e.clientY);
  const r = $('#renameFolder');
  r.focus(); r.select();
  r.onkeydown = (ev) => { if (ev.key === 'Enter' && r.value.trim()) { A.clips.renameFolder(f.id, r.value.trim()); closePops(); } };
  ctx.onclick = (ev) => { if (ev.target.closest('[data-c="del"]')) { A.clips.deleteFolder(f.id); closePops(); } };
});
$('#clipList').addEventListener('click', (e) => {
  const li = e.target.closest('.clip'); if (!li) return;
  const id = li.dataset.id, act = e.target.closest('[data-cl]')?.dataset.cl;
  if (act === 'del') return A.clips.remove(id);
  if (act === 'move') return clipMoveMenu(id, e.clientX, e.clientY, li);
  A.clips.copy(id);
  li.classList.add('copied');
  setTimeout(() => li.classList.remove('copied'), 900);
});
$('#clipList').addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.clip')) { e.preventDefault(); e.target.click(); }
});
$('#clipList').addEventListener('contextmenu', (e) => {
  const li = e.target.closest('.clip'); if (!li) return;
  e.preventDefault(); clipMoveMenu(li.dataset.id, e.clientX, e.clientY, li);
});
function clipMoveMenu(id, x, y, li) {
  closePops();
  li.classList.add('ctx');
  const it = CL.items.find((i) => i.id === id);
  ctx.innerHTML = `<div class="lbl">Move to</div>
    ${[{ id: '', name: 'Recent' }, ...CL.folders].map((f) => `<button data-f="${f.id}" ${(it.folder || '') === f.id ? 'disabled style="opacity:.45"' : ''}>${I.folder}${esc(f.name)}</button>`).join('')}
    <div class="row2"><input class="mini-input" id="moveNew" style="width:130px" placeholder="New folder…"></div><hr>
    <button data-del class="del">${I.trash}Delete</button>`;
  placePop(x, y);
  ctx.onclick = (e) => {
    if (e.target.closest('[data-del]')) { A.clips.remove(id); return closePops(); }
    const b = e.target.closest('[data-f]'); if (!b || b.disabled) return;
    A.clips.move(id, b.dataset.f || null); closePops();
  };
  $('#moveNew').onkeydown = async (e) => {
    if (e.key !== 'Enter' || !e.target.value.trim()) return;
    const fid = await A.clips.addFolder(e.target.value.trim());
    A.clips.move(id, fid); closePops();
  };
}

// ---------- tabs, notes ----------
function setTab(t) {
  tab = t;
  $$('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  $('#tasksView').classList.toggle('hidden', t !== 'tasks');
  $('#clipsView').classList.toggle('hidden', t !== 'clips');
  $('#notesView').classList.toggle('hidden', t !== 'notes');
  if (t === 'clips') renderClips();
}
$$('.tabs button').forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));
let notesT;
$('#notes').addEventListener('input', (e) => { D.notes = e.target.value; clearTimeout(notesT); notesT = setTimeout(save, 400); });

// ---------- history ----------
function renderHistory() {
  const q = (s) => `“${esc(short(s))}”`;
  const say = {
    add: (e) => `Added ${q(e.text)}${e.to ? ` <em>for ${relDay(e.to)}</em>` : ''}`,
    done: (e) => `Completed ${q(e.text)}`,
    delete: (e) => `Deleted ${q(e.text)}`,
    move: (e) => `Moved ${q(e.text)} <em>to ${relDay(e.to)}</em>`,
    clear: (e) => `Cleared ${e.tasks.length} done task${e.tasks.length > 1 ? 's' : ''}`,
    restore: (e) => `Restored ${q(e.text)}`,
    import: (e) => `Imported a backup${e.tasks?.length ? ` <em>(restore brings back the ${e.tasks.length} it replaced)</em>` : ''}`,
  };
  let h = '', day = '';
  for (const e of D.log) {
    const d = ymd(new Date(e.at));
    if (d !== day) { day = d; h += `<div class="hday">${relDay(d)} · ${fmtDay(d, { month: 'short', day: 'numeric' })}</div>`; }
    const canRestore = e.tasks?.length && !e.restored;
    h += `<div class="hrow ${e.restored ? 'restored' : ''}"><span class="what">${(say[e.type] || (() => esc(e.text)))(e)}</span>
      ${canRestore ? `<button class="btn" data-restore="${e.id}">Restore</button>` : ''}<time>${fmtTime(e.at)}</time></div>`;
  }
  $('#historyList').innerHTML = h || '<div class="empty"><b>No history yet</b>Everything you add, finish, move or delete shows up here.</div>';
}
function openHistory() { renderHistory(); openSheet('history'); }
$('#historyBtn').onclick = openHistory;
$('#mHistory').onclick = openHistory;
$('#historyList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-restore]'); if (!b) return;
  const entry = D.log.find((x) => x.id === b.dataset.restore);
  const back = entry.tasks.filter((t) => !find('task', t.id));
  D.tasks.push(...back);
  entry.restored = true;
  log('restore', back.length === 1 ? back[0].text : `${back.length} tasks`);
  save(); render(); renderHistory();
});

// ---------- menu, sheets ----------
$('#menuBtn').onclick = () => { const was = menu.classList.contains('hidden'); closePops(); if (was) menu.classList.remove('hidden'); };
$$('[data-close]').forEach((b) => (b.onclick = closeSheets));
$('#mHelp').onclick = () => openSheet('help');
$('#mSettings').onclick = () => openSettings();
$('#mUpdate').onclick = $('#sUpdate').onclick = () => { save(); A.update(); };
$('#mQuit').onclick = () => { save(); A.quit(); };
$('#close').onclick = () => A.hide();
$('#clearDone').onclick = () => {
  const gone = tasksOn(sel).filter((x) => x.done); if (!gone.length) return;
  D.tasks = D.tasks.filter((x) => !(x.done && x.date === sel));
  log('clear', '', { tasks: gone });
  pushUndo(() => D.tasks.push(...gone.filter((g) => !find('task', g.id))));
  save(); render();
};

// ---------- window mode ----------
$('#peekOpen').onclick = () => A.expand(true);
$('#peekList').onclick = () => { if (P.expandOn === 'click') A.expand(true); };
$('#autoBtn').onclick = async () => { P = await A.setPrefs({ autoCollapse: !P.autoCollapse }); paintPrefs(); };
A.on('mode', (m) => {
  collapsed = m === 'collapsed';
  document.body.classList.toggle('collapsed', collapsed);
  closePops();
  if (collapsed && document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  renderPeek();
});
A.on('focus-input', () => { closeSheets(); if (tab === 'tasks') input.focus(); });
A.on('open-settings', () => openSettings());

// keep the window open while the user is typing in it or has a menu open
let lastBusy = null;
setInterval(() => {
  const ae = document.activeElement;
  const typing = document.hasFocus() && ae && ae.matches('input, textarea, [contenteditable="true"]');
  const b = !!(typing || dragId || !menu.classList.contains('hidden') || !ctx.classList.contains('hidden') ||
    $('.sheet:not(.hidden)') || $('#alarm').classList.contains('open'));
  if (b !== lastBusy) { lastBusy = b; A.busy(b); }
}, 200);

// ---------- settings ----------
let pinned = true;
function applyTheme() {
  document.documentElement.dataset.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.body.classList.toggle('solid', P.glass === 'off');
  const root = document.documentElement.style;
  root.setProperty('--accent', S.accent);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(S.accent.slice(i, i + 2), 16));
  root.setProperty('--on-accent', 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#16120a' : '#fff');
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
$('#sAccent').innerHTML = ACCENTS.map((c) => `<button data-v="${c}" style="background:${c}" title="${c}"></button>`).join('');
const segOn = (id, v) => $$(`#${id} button`).forEach((b) => b.classList.toggle('on', b.dataset.v === String(v)));
function paintPrefs() {
  $('#autoBtn').classList.toggle('on', P.autoCollapse);
  $('#autoBtn').title = P.autoCollapse ? 'Auto-collapse is on (Ctrl+M collapses now)' : 'Auto-collapse is off';
  $('#sCollapse').classList.toggle('on', P.autoCollapse);
  $('#sPin').classList.toggle('on', pinned);
  $('#sSound').classList.toggle('on', S.sound);
  $('#sClip').classList.toggle('on', !CL.paused);
  segOn('sExpand', P.expandOn); segOn('sGlass', P.glass); segOn('sTheme', P.theme);
  $('#sFade').classList.toggle('on', P.fade);
  $('#idleRow').classList.toggle('hidden', !P.fade);
  $('#sIdle').value = Math.round(P.idleOpacity * 100);
  $('#sIdleVal').textContent = `${Math.round(P.idleOpacity * 100)}%`;
  $$('#sAccent button').forEach((b) => b.classList.toggle('on', b.dataset.v === S.accent));
  ariaToggles();
  applyTheme();
}
// switches announce their name and state to screen readers
function ariaToggles() {
  $$('.toggle').forEach((b) => {
    b.setAttribute('role', 'switch');
    b.setAttribute('aria-checked', String(b.classList.contains('on')));
    b.setAttribute('aria-label', b.closest('.set').firstElementChild.firstChild.textContent.trim());
  });
}
async function openSettings() {
  closePops();
  const st = await A.getState();
  P = st.prefs; pinned = st.pinned;
  $('#sAuto').classList.toggle('on', st.auto);
  $('#ver').textContent = `Floatie ${st.version} · everything is stored on this PC, with a backup every day`;
  paintPrefs();
  openSheet('settings');
}
const setPref = async (k, v) => { P = await A.setPrefs({ [k]: v }); paintPrefs(); };
const segClick = (id, fn) => ($(`#${id}`).onclick = (e) => { const b = e.target.closest('[data-v]'); if (b) fn(b.dataset.v); });
$('#sAuto').onclick = async () => { $('#sAuto').classList.toggle('on', await A.autostart(!$('#sAuto').classList.contains('on'))); ariaToggles(); };
$('#sPin').onclick = async () => { pinned = await A.pin(!pinned); paintPrefs(); };
$('#sCollapse').onclick = () => setPref('autoCollapse', !P.autoCollapse);
$('#sFade').onclick = () => setPref('fade', !P.fade);
$('#sIdle').addEventListener('input', (e) => setPref('idleOpacity', +e.target.value / 100));
$('#sClip').onclick = () => { A.clips.pause(!CL.paused); CL.paused = !CL.paused; paintPrefs(); };
$('#sSound').onclick = () => { S.sound = !S.sound; save(); paintPrefs(); };
$('#sTest').onclick = chime;
segClick('sExpand', (v) => setPref('expandOn', v));
segClick('sGlass', (v) => setPref('glass', v));
segClick('sTheme', (v) => setPref('theme', v));
segClick('sAccent', (v) => { S.accent = v; save(); paintPrefs(); });
$('#sOpen').onclick = () => A.openData();
$('#sExport').onclick = () => A.exportData({ tasks: D.tasks, timers: D.timers, notes: D.notes, log: D.log, settings: D.settings });
// Import is all or nothing: every record is checked first, and a file with any bad record changes nothing.
const validTimer = (tm) => tm && typeof tm.total === 'number' && (typeof tm.end === 'number' || typeof tm.left === 'number');
const ID = /^[\w-]{1,64}$/, DAY = /^\d{4}-\d\d-\d\d$/;
const optNum = (v) => v == null || Number.isFinite(v);
const validTask = (t) => t && typeof t === 'object' && typeof t.id === 'string' && ID.test(t.id) && typeof t.text === 'string' && t.text.trim()
  && DAY.test(t.date) && [null, undefined, 'daily', 'weekdays', 'weekly'].includes(t.repeat) && (t.due == null || DAY.test(t.due))
  && optNum(t.remindAt) && optNum(t.remindBase) && optNum(t.order) && (t.timer == null || validTimer(t.timer));
function importProblems(d) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.tasks)) return ['no task list'];
  const p = [];
  d.tasks.forEach((t, i) => { if (!validTask(t)) p.push(`task ${i + 1}`); });
  if (new Set(d.tasks.map((t) => t?.id)).size !== d.tasks.length) p.push('repeated task ids');
  if (d.timers != null && !(Array.isArray(d.timers) && d.timers.every((x) => x && typeof x.id === 'string' && ID.test(x.id) && validTimer(x.timer)))) p.push('timers');
  if (d.notes != null && typeof d.notes !== 'string') p.push('notes');
  return p;
}
const importMsg = (m) => { $('#importMsg').textContent = m; $('#importMsg').classList.toggle('hidden', !m); };
$('#sImport').onclick = async () => {
  importMsg('');
  const d = await A.importData();
  if (!d) return;
  const bad = importProblems(d);
  if (bad.length) return importMsg(`Not imported: this isn't a valid Floatie backup (${bad.slice(0, 3).join(', ')}${bad.length > 3 ? '…' : ''}). Nothing was changed.`);
  const replaced = D.tasks;
  D.tasks = d.tasks.map((t) => ({ ...t, text: t.text.trim(), order: +t.order || 0, repeat: t.repeat || null, timer: t.timer || null }));
  D.timers = (d.timers || []).map((x) => ({ id: x.id, label: String(x.label || 'Timer').slice(0, 200), timer: x.timer }));
  if (typeof d.notes === 'string') D.notes = d.notes;
  if (Array.isArray(d.log)) {   // history entries are only kept with fields we can show and restore safely
    D.log = d.log.filter((e) => e && typeof e === 'object' && Number.isFinite(e.at) && typeof e.type === 'string').slice(0, 399).map((e) => ({
      id: ID.test(e.id) ? e.id : uid(), at: e.at, type: e.type, text: String(e.text ?? ''),
      ...(DAY.test(e.to) ? { to: e.to } : {}), ...(Array.isArray(e.tasks) && e.tasks.every(validTask) ? { tasks: e.tasks, restored: !!e.restored } : {}),
    }));
  }
  // the tasks it replaced stay in History, restorable without touching anything added later; the old undo steps no longer apply
  log('import', '', { tasks: replaced });
  undo.length = 0;
  save(); render(); closeSheets();
};

// ---------- keyboard ----------
document.addEventListener('keydown', (e) => {
  const typing = e.target.closest('input, textarea, [contenteditable="true"]');
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;   // Ctrl on Windows, Cmd on macOS
  if (mod && k === 'z' && !typing) { e.preventDefault(); return doUndo(); }
  if (mod && k === 'k') { e.preventDefault(); closeSheets(); setTab('tasks'); return input.focus(); }
  if (mod && ['1', '2', '3'].includes(k)) { e.preventDefault(); return setTab(['tasks', 'clips', 'notes'][+k - 1]); }
  if (mod && k === 'h') { e.preventDefault(); return openHistory(); }
  if (mod && k === 'm') { e.preventDefault(); return A.collapse(); }
  if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); sel = addDays(sel, e.key === 'ArrowLeft' ? -1 : 1); return render(); }
  if (e.key === 'Escape') {
    if ($('#alarm').classList.contains('open')) return;
    if (!menu.classList.contains('hidden') || !ctx.classList.contains('hidden')) return closePops();
    if ($$('.sheet:not(.hidden)').length) return closeSheets();
    if (typing && e.target.matches('input') && e.target.value) { e.target.value = ''; e.target.dispatchEvent(new Event('input')); return; }
    if (typing) return e.target.blur();
    return A.hide();
  }
  if (typing) return;
  if (e.key === '/') { e.preventDefault(); setTab('tasks'); input.focus(); }
  else if (k === 't') { sel = today(); render(); }
  else if (k === 'w') toggleWeek();
  else if (e.key === '?') openSheet('help');
});

// a file or link dropped on the window must not replace the app
document.addEventListener('dragover', (e) => { if (!dragId) e.preventDefault(); });
document.addEventListener('drop', (e) => { if (!dragId) e.preventDefault(); });
window.addEventListener('beforeunload', () => { clearTimeout(notesT); if (loaded) A.saveSync(D); });

// ---------- boot ----------
A.getState().then((st) => {
  P = st.prefs; pinned = st.pinned; paintPrefs();
  $$('[data-shortcut]').forEach((el) => (el.textContent = st.shortcut));
  if (!st.autoSupported) $('#sAutoRow').classList.add('hidden');   // macOS from source: login items need the built app
});
A.on('resume', () => { rollover(); render(); tick(); });
applyTheme();
rollover();
if (migrated) save();   // first run after the localStorage version: write the migrated tasks to disk
render();
if (loaded) restoreAlarms();
