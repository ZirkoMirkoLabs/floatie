// Cross-platform test runner: `npm test` (Windows or macOS).
// Starts hidden, off-screen copies of Floatie with throwaway data folders — the real app and its data are never touched.
//   main            one session: parsing, undo/history, clipboard, collapse/fade, alarms, sleep/resume
//   seed -> verify  two launches on one folder: persistence across restart + a reminder that came due while closed
//   seed -> locked  data file unreadable at startup: waits and retries, never starts blank or overwrites
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const electron = require('electron');   // from Node this resolves to the Electron binary path

const root = path.join(__dirname, '..');
const shots = process.env.FLOATIE_SHOTS || fs.mkdtempSync(path.join(os.tmpdir(), 'floatie-shots-'));
fs.mkdirSync(shots, { recursive: true });

function launch(suite, dataDir, extraEnv = {}) {
  const r = spawnSync(electron, [root], {
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

// data file locked at startup (as antivirus can do at login): the app must wait, not start blank or overwrite it
const lockedDir = fresh();
ok.push(launch('seed', lockedDir));
ok.push(launch('locked', lockedDir, { FLOATIE_TEST_FAIL_READS: '35' }));

console.log(`\n${ok.every(Boolean) ? 'ALL SUITES PASSED' : 'SOME SUITES FAILED'} · screenshots in ${shots}`);
process.exit(ok.every(Boolean) ? 0 : 1);
