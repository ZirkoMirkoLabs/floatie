const { app, BrowserWindow, ipcMain, Tray, Menu, globalShortcut, nativeImage, nativeTheme, screen, dialog, clipboard, shell, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { execFile } = require('child_process');
const platform = require('./platform');

// test mode: a hidden, separate copy with its own data folder (see test/); never touches the real instance.
// Packaged builds don't ship the test suite, so there it only runs a launch smoke test.
const TEST = process.env.FLOATIE_TEST || null;
const TEST_SUITE = TEST && !app.isPackaged && fs.existsSync(path.join(__dirname, 'test', 'run.js'));
platform.pinUserData(TEST);
if (!TEST && !app.requestSingleInstanceLock()) { app.quit(); return; }
app.setAppUserModelId(platform.appUserModelId());

// started from inside a Store-packaged app on Windows? then AppData is redirected — relaunch outside it (see platform.js)
if (!TEST) {
  const pkg = platform.virtualizedBy(app.getPath('userData'));
  if (pkg && !process.argv.includes('--escaped')) {
    app.releaseSingleInstanceLock();
    if (platform.relaunchOutsideContainer(__dirname)) { app.exit(0); return; }
    if (!app.requestSingleInstanceLock()) { app.quit(); return; }   // relaunch failed: keep running here rather than not at all
  }
  if (pkg) globalThis.__floatieVirtualized = pkg;   // escape didn't work; logged at launch
}

const ud = (...f) => path.join(app.getPath('userData'), ...f);
const ICON = path.join(__dirname, 'icon.png');
const DEFAULT = { width: 340, height: 520 };
const FULL_MIN = { width: 260, height: 220 };
const PEEK_MIN_W = 170;

// ---------- durable storage ----------
// write to a temp file, flush it to disk, then atomically swap it in: a power cut leaves either the old or the new file, never half of one
function writeJSON(file, value) {
  const tmp = file + '.tmp';
  const data = JSON.stringify(value);
  for (let attempt = 0; ; attempt++) {
    try {
      const fd = fs.openSync(tmp, 'w');
      try { fs.writeSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      fs.renameSync(tmp, file);
      return true;
    } catch (err) {
      // antivirus or indexers briefly lock files; retry a few times rather than lose the save
      if (attempt >= 4) { console.error('save failed', file, err.message); return false; }
      const until = Date.now() + 50 * (attempt + 1); while (Date.now() < until);
    }
  }
}
const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };

// small diagnostics log in the data folder, so a startup/storage problem leaves evidence
function diag(...msg) {
  try {
    const f = ud('floatie.log');
    if (fs.existsSync(f) && fs.statSync(f).size > 256e3) fs.renameSync(f, ud('floatie.old.log'));
    fs.appendFileSync(f, `${new Date().toISOString()} ${msg.join(' ')}\n`);
  } catch {}
}

// Reading at login can briefly fail while antivirus/indexing has the file open. Retry for a few seconds and
// report *why* it failed, so "can't read yet" is never mistaken for "no data" (which would start the app blank).
const LOCKED = new Set(['EBUSY', 'EPERM', 'EACCES', 'EAGAIN', 'EMFILE']);
let failReads = TEST ? +(process.env.FLOATIE_TEST_FAIL_READS || 0) : 0;   // test hook: simulate a locked file
function readStatus(f) {
  for (let attempt = 0; attempt < 15; attempt++) {   // ~3s
    try {
      if (failReads > 0 && /(^|[\\/])data\.json$/.test(f)) { failReads--; throw Object.assign(new Error('simulated lock'), { code: 'EBUSY' }); }
      if (!fs.existsSync(f)) return { state: 'missing' };
      return { state: 'ok', value: JSON.parse(fs.readFileSync(f, 'utf8')) };
    } catch (err) {
      if (err instanceof SyntaxError) return { state: 'corrupt' };
      if (!LOCKED.has(err.code)) return { state: 'error', code: err.code };
      const until = Date.now() + 200; while (Date.now() < until);
    }
  }
  return { state: 'locked' };
}

// A file that parses but has the wrong shape counts as corrupt, so it can never be loaded, backed up or recovered from.
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const VALID = {
  'data.json': (v) => isObj(v) && Array.isArray(v.tasks) && v.tasks.every((t) => isObj(t) && typeof t.id === 'string' && typeof t.text === 'string' && typeof t.date === 'string')
    && (v.timers === undefined || Array.isArray(v.timers)) && (v.log === undefined || Array.isArray(v.log)) && (v.notes === undefined || typeof v.notes === 'string'),
  'clips.json': (v) => isObj(v) && (v.items === undefined || (Array.isArray(v.items) && v.items.every(isObj))) && (v.folders === undefined || Array.isArray(v.folders)),
};
function readValid(f, name) {
  const r = readStatus(f);
  return r.state === 'ok' && !VALID[name](r.value) ? { state: 'corrupt' } : r;
}

// keeps <name>.bak.json (last good copy) and one dated copy per day for two weeks; never copies a corrupt file over a good one
const DATED = (base) => new RegExp(`^${base}-\\d{4}-\\d\\d-\\d\\d\\.json$`);
function backup(name) {
  const src = ud(name), base = name.replace('.json', '');
  if (readValid(src, name).state !== 'ok') return;
  const dir = ud('backups');
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(src, ud(`${base}.bak.json`));
  const dest = path.join(dir, `${base}-${new Date().toISOString().slice(0, 10)}.json`);
  if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
  const prune = (re, keep) => fs.readdirSync(dir).filter((f) => re.test(f)).sort().slice(0, -keep).forEach((f) => fs.rmSync(path.join(dir, f), { force: true }));
  prune(DATED(base), 14);
  prune(new RegExp(`^${base}-before-(shrink|import)-\\d+\\.json$`), 10);   // safety copies have their own budget
}
// Returns { value } on success, { value: null, fresh: true } only when there is genuinely no data yet,
// and { value: null, error } when data exists but can't be read right now — the caller must not start blank then.
// A locked or unreadable primary is waited for, never replaced by an older copy; copies are only used when it's missing or corrupt.
function load(name) {
  const base = name.replace('.json', '');
  const main = readValid(ud(name), name);
  if (main.state === 'ok') return { value: main.value };
  if (main.state !== 'missing' && main.state !== 'corrupt') { diag('load FAILED', name, 'main', main.state, '(waiting, not recovering)'); return { value: null, error: main.state }; }
  const dir = ud('backups');
  const dated = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => DATED(base).test(f)).sort().reverse().map((f) => path.join(dir, f)) : [];
  for (const f of [ud(`${base}.bak.json`), ...dated]) {
    const r = readValid(f, name);
    if (r.state !== 'ok') continue;
    if (main.state === 'corrupt') {   // keep the damaged original before anything can overwrite it
      fs.mkdirSync(dir, { recursive: true });
      try { fs.copyFileSync(ud(name), path.join(dir, `${base}-corrupt-${Date.now()}.json`)); } catch {}
    }
    diag('load', name, main.state, '-> using', path.basename(f));
    return { value: r.value };
  }
  if (main.state === 'missing' && !fs.existsSync(ud(`${base}.bak.json`)) && !dated.length) return { value: null, fresh: true };
  diag('load FAILED', name, 'main', main.state, 'and no usable copy');
  return { value: null, error: main.state };
}

// Last line of defence: an empty, brand-new state must never replace real saved tasks, and any save that drops
// more than half the tasks keeps a copy of what it replaced. Compared against the last state we know was on disk,
// so a failed re-read can't make the check pass.
const isBlank = (d) => d && !(d.tasks || []).length && !(d.timers || []).length && !(d.log || []).length && !d.notes;
let onDisk = null;   // task count of the last data.json we loaded or wrote; null = nothing there yet
function saveData(data) {
  if (!VALID['data.json'](data)) { diag('save REFUSED: invalid state'); return false; }
  const file = ud('data.json');
  if (onDisk && isBlank(data)) { diag('save REFUSED: blank state over', onDisk, 'tasks'); return false; }
  if (onDisk >= 4 && data.tasks.length < onDisk / 2) {
    fs.mkdirSync(ud('backups'), { recursive: true });
    try { fs.copyFileSync(file, ud('backups', `data-before-shrink-${Date.now()}.json`)); } catch {}
    diag('save shrinks tasks', onDisk, '->', data.tasks.length, '(copy kept)');
  }
  const ok = writeJSON(file, data);
  if (ok) onDisk = data.tasks.length; else diag('save FAILED data.json');
  return ok;
}

// ---------- window state ----------
let ws = readJSON(ud('window.json'), {});
let prefs = { glass: 'acrylic', autoCollapse: true, expandOn: 'hover', theme: 'system', fade: true, idleOpacity: 0.35, ...ws.prefs };
let pinned = ws.pinned !== false;
let full = ws.full || null;          // user-chosen expanded bounds; only changed by the user's own drags/resizes
let peekW = ws.peekW || 250;         // user-chosen collapsed width
let peekH = 120;                     // reported by the page
let anchorRight = true;
let mode = 'expanded';
let win, tray, busy = false, alarming = false, resizingUntil = 0, shortcutLabel = null;

function saveWin() { ws = { ...ws, full, peekW, pinned, prefs }; writeJSON(ud('window.json'), ws); }
const areaFor = (b) => screen.getDisplayMatching(b).workArea;
function clampToScreen(b) {
  if (TEST) return { ...b };
  const a = areaFor(b);
  const width = Math.min(b.width, a.width), height = Math.min(b.height, a.height);
  return {
    width, height,
    x: Math.round(Math.min(Math.max(b.x, a.x), a.x + a.width - width)),
    y: Math.round(Math.min(Math.max(b.y, a.y), a.y + a.height - height)),
  };
}
const onRightHalf = (b) => { const a = areaFor(b); return b.x + b.width / 2 > a.x + a.width / 2; };

function createWindow() {
  const area = screen.getPrimaryDisplay().workArea;
  if (TEST) full = { ...DEFAULT, x: -5000, y: 100 };
  else if (!full || !screen.getAllDisplays().some(({ workArea: a }) => full.x < a.x + a.width - 40 && full.x + full.width > a.x + 40 && full.y >= a.y - 10 && full.y < a.y + a.height - 40)) {
    full = { ...DEFAULT, x: area.x + area.width - DEFAULT.width - 24, y: area.y + 24 };
  }
  anchorRight = TEST ? true : onRightHalf(full);
  nativeTheme.themeSource = prefs.theme;
  win = new BrowserWindow({
    ...full, minWidth: FULL_MIN.width, minHeight: FULL_MIN.height,
    frame: false, ...platform.windowOptions(prefs.glass),
    resizable: true, minimizable: true, maximizable: false, fullscreenable: false,
    skipTaskbar: !!TEST, alwaysOnTop: pinned && !TEST, show: false, icon: ICON,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      autoplayPolicy: 'no-user-gesture-required',
      backgroundThrottling: false,   // timers and reminders must fire on time even while minimized
    },
  });
  if (!TEST) platform.afterCreate(win, { appDir: __dirname, icon: path.join(__dirname, 'icon.ico') });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.loadFile('index.html');
  win.once('ready-to-show', () => (TEST ? win.showInactive() : win.show()));
  win.on('will-resize', () => (resizingUntil = Date.now() + 1500));
  win.on('will-move', () => (resizingUntil = Date.now() + 1500));
  win.on('resized', onUserBounds);
  win.on('moved', onUserBounds);
  win.on('close', (e) => { if (!app.isQuitting) { e.preventDefault(); win.minimize(); } });
  win.on('closed', () => { win = null; clearInterval(fadeTimer); });   // timers check `win`, so none touch a destroyed window while quitting
  win.on('restore', () => { expand(false); keepOnTop(); });
  win.on('blur', keepOnTop);
}

// Windows reports frameless bounds a pixel or two off, so bounds are never read back after our own setBounds —
// otherwise the window would creep on every collapse/expand cycle
let ownUntil = 0;
function setOwnBounds(b) { ownUntil = Date.now() + 400; win.setBounds(b); keepOnTop(); }
function keepOnTop() { if (pinned && !alarming && !TEST) platform.keepOnTop(win); }
function onUserBounds() {
  if (Date.now() < ownUntil || TEST) return;
  const b = win.getBounds();
  anchorRight = onRightHalf(b);
  if (mode === 'expanded') full = b;
  else {
    peekW = b.width;
    full = { ...full, x: anchorRight ? b.x + b.width - full.width : b.x, y: b.y };
  }
  saveWin();
}

// ---------- collapse / expand ----------
function peekBounds() {
  const h = Math.max(40, Math.min(peekH, full.height));
  return clampToScreen({ x: anchorRight ? full.x + full.width - peekW : full.x, y: full.y, width: peekW, height: h });
}
function applyPeek() {
  const b = peekBounds();
  win.setMinimumSize(PEEK_MIN_W, b.height);
  win.setMaximumSize(4000, b.height);
  setOwnBounds(b);
}
let graceUntil = 0, needLeave = false;
function collapse(manual) {
  if (mode === 'collapsed' || !win) return;
  mode = 'collapsed';
  if (manual) needLeave = true;      // Ctrl+M with the cursor on the window: don't re-expand until it has left
  win.webContents.send('mode', mode);
  applyPeek();
}
function expand(focus) {
  if (!win) return;
  if (mode === 'collapsed') {
    mode = 'expanded';
    win.webContents.send('mode', mode);
    win.setMaximumSize(4000, 4000);
    win.setMinimumSize(FULL_MIN.width, FULL_MIN.height);
    setOwnBounds(clampToScreen(full));   // clamp a copy, so a peek parked near the screen edge keeps its spot
  }
  if (focus) {
    graceUntil = Date.now() + 2500;      // opened on purpose (shortcut, tray, click): don't snap shut straight away
    outsideSince = 0;
    solid();
    win.show(); win.focus(); win.webContents.send('focus-input');
  }
}

// ---------- fade ----------
// eases the whole window toward a target opacity; used to go see-through when the mouse leaves
let fadeTimer = null, fadeTarget = 1;
function fadeTo(target, ms) {
  if (!win || target === fadeTarget) return;
  fadeTarget = target;
  clearInterval(fadeTimer);
  const from = win.getOpacity(), start = Date.now();
  fadeTimer = setInterval(() => {
    if (!win || win.isDestroyed()) return clearInterval(fadeTimer);
    const t = Math.min(1, (Date.now() - start) / ms), eased = 1 - Math.pow(1 - t, 3);
    win.setOpacity(from + (target - from) * eased);
    if (t === 1) clearInterval(fadeTimer);
  }, 16);
}
const solid = () => fadeTo(1, 140);

// hover tracking: expand when the cursor rests on the window, collapse once it has been away for a moment
let insideSince = 0, outsideSince = 0;
if (!TEST) setInterval(() => {
  if (!win || win.isDestroyed() || !win.isVisible() || win.isMinimized()) { insideSince = outsideSince = 0; return; }
  const p = screen.getCursorScreenPoint(), b = win.getBounds(), m = 6, now = Date.now();
  const inside = p.x >= b.x - m && p.x < b.x + b.width + m && p.y >= b.y - m && p.y < b.y + b.height + m;
  if (inside) { outsideSince = 0; insideSince ||= now; } else { insideSince = 0; outsideSince ||= now; needLeave = false; }
  if (inside || busy || alarming || !prefs.fade) solid();
  else if (now - outsideSince > 250 && now > graceUntil) fadeTo(prefs.idleOpacity, 1000);
  if (mode === 'collapsed' && inside && !needLeave && prefs.expandOn === 'hover' && now - insideSince > 260) expand(false);
  if (mode === 'expanded' && !inside && prefs.autoCollapse && !busy && !alarming && now > resizingUntil && now > graceUntil && now - outsideSince > 900) collapse();
}, 100);

function show() { if (win.isMinimized()) win.restore(); win.show(); expand(true); }
function toggle() { if (win.isVisible() && !win.isMinimized() && win.isFocused()) win.minimize(); else show(); }

// ---------- start at login ----------
const getAuto = () => (TEST ? false : platform.getStartAtLogin(__dirname));
const setAuto = (on) => (TEST ? false : platform.setStartAtLogin(__dirname, on));

// ---------- update ----------
function update() {
  const relaunch = () => { app.isQuitting = true; app.relaunch(); app.exit(0); };
  // installed builds update by downloading the newest installer (your data folder is kept)
  if (app.isPackaged) return shell.openExternal(`${require('./package.json').homepage}/releases/latest`);
  if (!fs.existsSync(path.join(__dirname, '.git'))) return relaunch();
  execFile('git', ['pull', '--ff-only'], { cwd: __dirname, timeout: 15000 }, relaunch);
}

// ---------- clipboard history ----------
const CLIP_DIR = ud('clips');
const RECENT_MAX = 300;
let C = { folders: [], items: [], paused: false };
let lastSig = null, clipTick = 0;
const hash = (buf) => crypto.createHash('sha1').update(buf).digest('hex');
// image clips only ever name files we created inside CLIP_DIR; anything else in clips.json is ignored
const clipFile = (f) => (typeof f === 'string' && /^[A-Za-z0-9-]+(_t)?\.png$/.test(f) ? path.join(CLIP_DIR, f) : null);
const validClip = (i) => (i.type === 'text' ? typeof i.text === 'string' : i.type === 'image' && clipFile(i.file) && clipFile(i.thumb)) && typeof i.id === 'string';
const clipsView = () => ({
  ...C,
  items: C.items.map((i) => (i.type === 'image' ? { ...i, thumbUrl: pathToFileURL(clipFile(i.thumb)).href } : i)),
});
// clips are only saved once they've actually been loaded, so a locked file at login can't wipe the history
let clipsLoaded = false;
function loadClips() {
  const r = load('clips.json');
  if (r.error) { diag('clips not readable yet, retrying'); setTimeout(loadClips, 3000); return; }
  C = { ...C, ...(r.value || {}) };
  C.items = (C.items || []).filter(validClip);
  C.folders = (C.folders || []).filter((f) => isObj(f) && typeof f.id === 'string');
  clipsLoaded = true;
  if (win) win.webContents.send('clips', clipsView());
}
// image files are deleted only after the index that no longer mentions them is safely on disk
let doomed = [];
function saveClips() {
  if (!clipsLoaded) return false;
  const ok = writeJSON(ud('clips.json'), C);
  if (ok) { for (const f of doomed) fs.rmSync(f, { force: true }); doomed = []; } else diag('save FAILED clips.json');
  if (win) win.webContents.send('clips', clipsView());
  refreshTray();
  return ok;
}
// password managers (KeePassXC, 1Password, Bitwarden...) mark secrets so clipboard tools skip them
const excludedByOwner = () => platform.isConcealed(clipboard);
const imageSig = (img) => { const { width, height } = img.getSize(); return `i:${width}x${height}:${hash(img.resize({ width: 24, height: 24 }).toBitmap())}`; };
function currentSig(withImage) {
  const text = clipboard.readText();
  if (text && text.trim()) return { sig: 't:' + hash(text), text };
  if (!withImage || !clipboard.availableFormats().some((f) => f.startsWith('image/'))) return { sig: null };
  const img = clipboard.readImage();
  return img.isEmpty() ? { sig: null } : { sig: imageSig(img), img };
}
function setPaused(on) { C.paused = on; if (!on) lastSig = currentSig(true).sig; saveClips(); }   // resuming never captures what was copied while paused
function pruneRecent() {
  const recent = C.items.filter((i) => !i.folder).sort((a, b) => b.at - a.at);
  for (const it of recent.slice(RECENT_MAX)) removeClip(it.id, false);
}
function removeClip(id, persist = true) {
  const it = C.items.find((i) => i.id === id);
  if (!it) return;
  if (it.type === 'image') doomed.push(...[it.file, it.thumb].map(clipFile).filter(Boolean));
  C.items = C.items.filter((i) => i.id !== id);
  if (persist) saveClips();
}
// store one clip; shared by the clipboard watcher and the test harness
function addClip(cur) {
  const id = crypto.randomUUID().slice(0, 8), at = Date.now();
  if (cur.text) {
    if (cur.text.length > 200000) return;
    const dup = C.items.find((i) => !i.folder && i.type === 'text' && i.text === cur.text);
    if (dup) dup.at = at; else C.items.push({ id, type: 'text', text: cur.text, at, folder: null });
  } else {
    const { width, height } = cur.img.getSize();
    if (width * height > 40e6) return;
    fs.mkdirSync(CLIP_DIR, { recursive: true });
    fs.writeFileSync(path.join(CLIP_DIR, `${id}.png`), cur.img.toPNG());
    fs.writeFileSync(path.join(CLIP_DIR, `${id}_t.png`), cur.img.resize({ width: Math.min(320, width) }).toPNG());
    C.items.push({ id, type: 'image', file: `${id}.png`, thumb: `${id}_t.png`, w: width, h: height, at, folder: null });
  }
  pruneRecent();
  saveClips();
}
function pollClipboard() {
  if (C.paused || !clipsLoaded) return;
  try {
    clipTick++;
    const cur = currentSig(clipTick % 3 === 0);   // images cost more to read, so they're checked every ~2s
    if (!cur.sig || cur.sig === lastSig) return;
    lastSig = cur.sig;
    if (excludedByOwner()) return;
    addClip(cur);
  } catch (err) { console.error('clipboard poll', err.message); }
}

app.whenReady().then(() => {
  if (!TEST) {
    if (!ws.autoInit && platform.loginSupported()) { setAuto(true); ws.autoInit = true; writeJSON(ud('window.json'), ws); }
    const runBackups = () => { try { backup('data.json'); backup('clips.json'); } catch (err) { console.error('backup', err.message); } };
    runBackups();
    setInterval(runBackups, 3 * 3600e3);   // the app runs for weeks at a time, so back up through the day too
  }
  diag('launch', app.getVersion(), process.platform, app.isPackaged ? 'packaged' : 'source', TEST ? 'TEST' : '',
    process.argv.includes('--escaped') ? 'relaunched-outside-container' : '');
  if (globalThis.__floatieVirtualized) diag('WARNING AppData still redirected by package', globalThis.__floatieVirtualized);
  loadClips();
  if (!TEST) {
    lastSig = currentSig(true).sig;         // don't re-add whatever was already on the clipboard
    setInterval(pollClipboard, 700);
  }

  createWindow();

  // after sleep or a locked screen: catch up on the date and on reminders that came due meanwhile
  const wake = () => win && win.webContents.send('resume');
  powerMonitor.on('resume', wake);
  powerMonitor.on('unlock-screen', wake);

  if (TEST) {
    if (TEST_SUITE) {
      require('./test/run.js')({ win, app, getMode: () => mode, collapse, expand, fadeTo, solid, prefs: () => prefs, addClip, getClips: () => C, nativeImage, getBounds: () => win.getBounds(), peekBounds, full: () => full, wake });
    } else {
      // packaged smoke test: the page boots, loads its (empty) data and can save, then exit
      win.webContents.once('did-finish-load', () => setTimeout(async () => {
        const ok = await win.webContents.executeJavaScript("loaded && (input.value = 'smoke', document.querySelector('#add').requestSubmit(), true)").catch(() => false)
          && await new Promise((r) => setTimeout(() => r(fs.existsSync(ud('data.json'))), 300));
        console.log(ok ? 'SMOKE OK' : 'SMOKE FAIL');
        app.isQuitting = true; app.exit(ok ? 0 : 1);
      }, 1500));
    }
    return;
  }
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
  tray.setToolTip('Floatie');
  tray.on('click', toggle);
  tray.on('right-click', () => tray.popUpContextMenu(trayMenu()));
  shortcutLabel = platform.registerShortcut(globalShortcut, toggle);
  if (shortcutLabel) console.log('global shortcut:', shortcutLabel);
  else console.error('no global shortcut available; all candidates are taken');
  refreshTray();
});

const trayMenu = () => Menu.buildFromTemplate([
  { label: shortcutLabel ? `Show   ${shortcutLabel}` : 'Show', click: show },
  { label: 'Settings', click: () => { show(); win.webContents.send('open-settings'); } },
  { label: 'Pause clipboard capture', type: 'checkbox', checked: C.paused, click: (i) => setPaused(i.checked) },
  { label: 'Update & restart', click: update },
  { type: 'separator' },
  { label: 'Quit', click: () => app.quit() },
]);
// macOS shows a fixed context menu, so rebuild it whenever its state (the pause checkbox) can change
function refreshTray() { if (tray && platform.isMac) tray.setContextMenu(trayMenu()); }

app.on('second-instance', () => show());
app.on('activate', () => win && show());   // macOS: clicking the Dock icon brings it back
app.on('before-quit', () => { app.isQuitting = true; });   // also lets Windows shut down without the close being cancelled
app.on('will-quit', () => globalShortcut.unregisterAll());

// ---------- IPC ----------
ipcMain.on('load', (e) => {
  const r = load('data.json');
  diag('renderer load', r.value ? `${r.value.tasks.length} tasks` : r.fresh ? 'fresh (no data yet)' : `ERROR ${r.error}`);
  if (r.value) onDisk = r.value.tasks.length;
  e.returnValue = r;
});
ipcMain.handle('save', (_, data) => saveData(data));             // the page retries and shows a warning until this returns true
ipcMain.on('save-sync', (e, data) => { e.returnValue = saveData(data); });   // last save while the window closes
ipcMain.on('hide', () => win.minimize());
ipcMain.on('quit', () => app.quit());
ipcMain.on('update', update);
ipcMain.on('busy', (_, b) => (busy = b));
ipcMain.on('peek-height', (_, h) => { peekH = h; if (mode === 'collapsed') applyPeek(); });
ipcMain.on('expand', (_, focus) => expand(focus));
ipcMain.on('collapse', () => collapse(true));
ipcMain.on('tooltip', (_, t) => tray && tray.setToolTip(t));
ipcMain.on('open-data', () => shell.openPath(app.getPath('userData')));
ipcMain.handle('get-state', () => ({
  prefs, pinned, mode, auto: getAuto(), autoSupported: platform.loginSupported(),
  shortcut: shortcutLabel || 'none (all taken)', platform: process.platform, version: app.getVersion(),
}));
ipcMain.handle('set-prefs', (_, p) => {
  prefs = { ...prefs, ...p };
  if ('glass' in p) platform.setGlass(win, prefs.glass);
  if ('theme' in p) nativeTheme.themeSource = prefs.theme;
  if ('idleOpacity' in p) { fadeTarget = null; fadeTo(prefs.idleOpacity, 200); }   // preview the new level while dragging the slider
  saveWin();
  return prefs;
});
ipcMain.handle('pin', (_, on) => { pinned = on; win.setAlwaysOnTop(on); saveWin(); return on; });
ipcMain.handle('autostart', (_, on) => (on === undefined ? getAuto() : setAuto(on)));

ipcMain.handle('export', async (_, data) => {
  busy = true;
  const { filePath } = await dialog.showSaveDialog(win, {
    defaultPath: `floatie-backup-${new Date().toISOString().slice(0, 10)}.json`, filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (filePath) fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  return !!filePath;
});
ipcMain.handle('import', async () => {
  busy = true;
  const { filePaths } = await dialog.showOpenDialog(win, { filters: [{ name: 'JSON', extensions: ['json'] }], properties: ['openFile'] });
  if (!filePaths[0]) return null;
  if (fs.existsSync(ud('data.json'))) {   // whatever the page does with it, the pre-import state stays recoverable
    fs.mkdirSync(ud('backups'), { recursive: true });
    fs.copyFileSync(ud('data.json'), ud('backups', `data-before-import-${Date.now()}.json`));
  }
  return readJSON(filePaths[0], null);
});

ipcMain.handle('clips:get', () => clipsView());
ipcMain.on('clips:copy', (_, id) => {
  const it = C.items.find((i) => i.id === id);
  if (!it || TEST) return;
  try {
    if (it.type === 'text') { clipboard.writeText(it.text); lastSig = 't:' + hash(it.text); }
    else {
      clipboard.writeImage(nativeImage.createFromPath(clipFile(it.file)));
      lastSig = imageSig(clipboard.readImage());
    }
  } catch (err) { console.error('copy', err.message); return; }
  if (!it.folder) { it.at = Date.now(); saveClips(); }
});
ipcMain.on('clips:delete', (_, id) => removeClip(id));
ipcMain.on('clips:move', (_, id, folder) => { const it = C.items.find((i) => i.id === id); if (it) { it.folder = folder || null; saveClips(); } });
ipcMain.handle('clips:folder-add', (_, name) => { const id = crypto.randomUUID().slice(0, 8); C.folders.push({ id, name }); saveClips(); return id; });
ipcMain.on('clips:folder-rename', (_, id, name) => { const f = C.folders.find((x) => x.id === id); if (f) { f.name = name; saveClips(); } });
ipcMain.on('clips:folder-delete', (_, id) => {
  // its clips go back to Recent with their original dates; nothing is pruned here
  C.folders = C.folders.filter((f) => f.id !== id);
  for (const it of C.items) if (it.folder === id) it.folder = null;
  saveClips();
});
ipcMain.on('clips:pause', (_, on) => setPaused(on));
ipcMain.on('clips:clear', () => { for (const it of C.items.filter((i) => !i.folder)) removeClip(it.id, false); saveClips(); });

ipcMain.on('alarm', (_, { title, body }) => {
  alarming = true;
  fadeTarget = null; fadeTo(1, 100);
  if (win.isMinimized()) win.restore();
  win.showInactive();                    // show on top without stealing the keyboard from whatever you're typing in
  expand(false);
  if (TEST) return;
  win.setAlwaysOnTop(true, 'screen-saver');
  win.flashFrame(true);
  platform.notify({ title, body, icon: ICON, onClick: show });
});
ipcMain.on('alarm-ack', () => {
  alarming = false;
  if (TEST) return;
  win.flashFrame(false);
  win.setAlwaysOnTop(pinned);
  keepOnTop();
});
