// Cross-platform test runner: `npm test` (Windows or macOS).
// Starts hidden, off-screen copies of Floatie with throwaway data folders — the real app and its data are never touched.
//   main            one session: parsing, undo/history, clipboard, collapse/fade, hover, alarms, sleep/resume, import
//   seed -> verify -> again   three launches on one folder: persistence across restart, a reminder that came due
//                   while closed, and that an unanswered alarm comes back (once) after a restart
//   seed -> locked  data file unreadable at startup: waits and retries, never starts blank or overwrites
//   shape           data.json parses but isn't a task list: recovered from the good copy, damaged file kept
//   migrate         a version-2 data file behind a corrupt data.json: fallback to the backup copy, then migration
//   startup         a simulated slow start (timers fire before 'ready', as at login) with the real background timers running
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const electron = require('electron');   // from Node this resolves to the Electron binary path

const root = path.join(__dirname, '..');
const shots = process.env.FLOATIE_SHOTS || fs.mkdtempSync(path.join(os.tmpdir(), 'floatie-shots-'));
fs.mkdirSync(shots, { recursive: true });

// `preload` is required into the main process before main.js (test/early-timers.js simulates a slow start)
function launch(suite, dataDir, extraEnv = {}, preload) {
  const r = spawnSync(electron, [...(preload ? ['-r', preload] : []), root], {
    env: { ...process.env, FLOATIE_TEST: dataDir, FLOATIE_TEST_SUITE: suite, FLOATIE_SHOTS: shots, ...extraEnv },
    encoding: 'utf8', timeout: 120000,
  });
  process.stdout.write(r.stdout || '');
  if (r.status !== 0 && r.stderr) process.stderr.write(r.stderr.split('\n').filter((l) => !/DevTools|GPU|gpu_|Autofill/.test(l)).join('\n'));
  return r.status === 0;
}

const fresh = () => fs.mkdtempSync(path.join(os.tmpdir(), 'floatie-test-'));
const ok = [launch('main', fresh())];
const persistDir = fresh();
ok.push(launch('seed', persistDir));
spawnSync(process.execPath, ['-e', 'setTimeout(() => {}, 4500)']);   // app stays closed while the seeded reminder comes due
ok.push(launch('verify', persistDir));
ok.push(launch('again', persistDir));   // the alarm that rang in `verify` was never answered: it must come back

// data file locked at startup (as antivirus can do at login): the app must wait, not start blank, overwrite it,
// or fall back to an older readable copy
const lockedDir = fresh();
ok.push(launch('seed', lockedDir));
fs.writeFileSync(path.join(lockedDir, 'data.bak.json'),
  JSON.stringify({ tasks: [{ id: 'stale', text: 'Stale copy', date: '2026-01-01', done: false, order: 0 }], timers: [], log: [], notes: '' }));
ok.push(launch('locked', lockedDir, { FLOATIE_TEST_FAIL_READS: '20' }));

// valid JSON with the wrong shape is treated as corrupt: recover from the good copy and keep the damaged file aside
const shapeDir = fresh();
fs.writeFileSync(path.join(shapeDir, 'data.json'), '{"tasks":{}}');
fs.writeFileSync(path.join(shapeDir, 'data.bak.json'),
  JSON.stringify({ tasks: [{ id: 'good', text: 'From the good copy', date: '2026-01-01', done: false, order: 0 }], timers: [], log: [], notes: '' }));
ok.push(launch('shape', shapeDir));

// version-2 data (Floatie v2, before the history log) as the last good copy, with a half-written data.json in front of it
const migrateDir = fresh();
const day = (n) => {   // local calendar date, like the app uses
  const d = new Date(); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
fs.writeFileSync(path.join(migrateDir, 'data.json'), '{"v":3,"tasks":[{"id":');
fs.writeFileSync(path.join(migrateDir, 'data.bak.json'), JSON.stringify({
  v: 2,
  tasks: [
    { id: 'v2a', text: 'Carried over from v2', date: day(-3), done: false, order: 0, timer: null, star: true, legacy: 'kept' },
    { id: 'v2b', text: 'Finished yesterday', date: day(-1), done: true, order: 1, timer: null },
  ],
  timers: [], notes: 'v2 notes', settings: { theme: 'dark', accent: '#5b9cf5', sound: false, dim: true, weekStart: 1 },
}));
ok.push(launch('migrate', migrateDir));
ok.push(launch('startup', fresh(), {}, path.join(__dirname, 'early-timers.js')));

console.log(`\n${ok.every(Boolean) ? 'ALL SUITES PASSED' : 'SOME SUITES FAILED'} · screenshots in ${shots}`);
process.exit(ok.every(Boolean) ? 0 : 1);
