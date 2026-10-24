// Preloaded into the main process for the "startup" suite (`electron -r test/early-timers.js .`). It simulates a slow start, like a
// cold launch at login: every timer created before Electron is ready also runs once straight away, before 'ready'.
// A timer that touches a not-yet-ready API (the `screen` module, a window) then throws, and the suite sees it in errors.log.
const { app } = require('electron');
for (const name of ['setInterval', 'setTimeout']) {
  const original = global[name];
  global[name] = function (fn, ...rest) {
    const handle = original(fn, ...rest);
    if (typeof fn === 'function' && !app.isReady()) process.nextTick(fn);
    return handle;
  };
}
