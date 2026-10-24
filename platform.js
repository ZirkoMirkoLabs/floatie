// Everything that differs between Windows and macOS lives here: storage location, window glass and
// layering, start-at-login, notifications, the global shortcut and clipboard privacy markers.
// main.js only calls these helpers, so platform fixes stay in one file.
const { app, Notification } = require('electron');
const path = require('path');

const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';

// ---------- storage ----------
// Pinned to <appData>/floatie (Windows: %APPDATA%\floatie, macOS: ~/Library/Application Support/floatie)
// so renaming the app or switching between source and packaged builds never moves anyone's data.
function pinUserData(overrideDir) {
  app.setPath('userData', overrideDir || path.join(app.getPath('appData'), 'floatie'));
}

// ---------- window ----------
// Windows 11: native acrylic/mica on an opaque frameless window. macOS: vibrancy needs a transparent window.
function windowOptions(glass) {
  if (isMac) {
    return {
      transparent: true, backgroundColor: '#00000000', hasShadow: true, roundedCorners: true,
      vibrancy: glass === 'off' ? undefined : macVibrancy(glass), visualEffectState: 'active', ...firstMouse(),
    };
  }
  return { transparent: false, backgroundColor: '#00000000', backgroundMaterial: glass === 'off' ? 'none' : glass };
}
const macVibrancy = (glass) => (glass === 'mica' ? 'sidebar' : 'hud');
// a click on Floatie while another app is active should act straight away (tick a task), not just focus it
const firstMouse = () => (isMac ? { acceptFirstMouse: true } : {});
function setGlass(win, glass) {
  if (isMac) win.setVibrancy(glass === 'off' ? null : macVibrancy(glass));
  else win.setBackgroundMaterial(glass === 'off' ? 'none' : glass);
}
function afterCreate(win, { appDir, icon }) {
  if (isWin) {
    // pinning the taskbar button relaunches Floatie itself, not bare Electron
    const relaunchCommand = app.isPackaged ? `"${process.execPath}"` : `"${process.execPath}" "${appDir}"`;
    win.setAppDetails({ appId: appUserModelId(), appIconPath: icon, relaunchCommand, relaunchDisplayName: 'Floatie' });
  }
  if (isMac) win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });   // follow you across Spaces
}
// Windows drops the topmost flag after some resizes and focus changes; toggling re-asserts it.
// macOS keeps the level, so just set it.
function keepOnTop(win) {
  if (isWin) win.setAlwaysOnTop(false);
  win.setAlwaysOnTop(true, 'floating');
}
const appUserModelId = () => (app.isPackaged ? 'com.floatie.app' : 'Floatie');
// The × button and Esc. Windows: minimize to the taskbar. macOS: Floatie is a menu-bar app with no Dock icon
// (floating over full-screen apps needs that), so a minimized window would leave it active with nothing to show.
// Hide the window and hand the keyboard back to the app you were using; the menu-bar icon or shortcut brings it back.
function hideWindow(win) {
  if (isMac) { win.hide(); app.hide(); }
  else win.minimize();
}
const isHidden = (win) => !win.isVisible() || win.isMinimized();
// Give the keyboard back to the previous app but leave Floatie on screen. macOS: deactivate the app; the window stays
// visible because Electron marks it that way for visibleOnFullScreen. Windows: blur activates the next window down,
// normally the one you were in.
function releaseFocus(win) {
  if (isMac) app.hide();
  else win.blur();
}

// ---------- tray ----------
// macOS menu bar wants a monochrome template image (it recolours it for light/dark menu bars); Windows keeps the colour icon.
function trayIcon(nativeImage, dir) {
  if (isMac) {
    const img = nativeImage.createFromPath(path.join(dir, 'trayTemplate.png'));   // picks up trayTemplate@2x.png on Retina
    img.setTemplateImage(true);
    return img;
  }
  return nativeImage.createFromPath(path.join(dir, 'icon.png')).resize({ width: 16, height: 16 });
}

// ---------- app menu ----------
// macOS: Electron's default menu claims ⌘H (Hide) and ⌘M (Minimize), which Floatie uses for History and Collapse, and adds
// reload, zoom and developer-tools items a widget doesn't need. Keep what text fields rely on (the Edit roles), Close and Quit.
// Windows has no app menu bar for a frameless window, so nothing changes there.
function setAppMenu(Menu) {
  if (!isMac) return;
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }] },
    { role: 'editMenu' },
    { label: 'Window', submenu: [{ role: 'close' }] },
  ]));
}

// ---------- start at login ----------
// Windows: a Run-key entry pointing at Electron + this folder (source) or at Floatie.exe (installed).
// macOS: login items only make sense for the built Floatie.app; running from source would launch bare Electron.
function loginSupported() { return isWin || (isMac && app.isPackaged); }
// An installed copy, as opposed to a build folder: only that one may switch start-at-login on by itself.
function installed() { return isMac ? app.isInApplicationsFolder() : true; }
function loginArgs(appDir) {
  return isWin ? { path: process.execPath, args: app.isPackaged ? [] : [appDir] } : {};
}
function getStartAtLogin(appDir) {
  return loginSupported() ? app.getLoginItemSettings(loginArgs(appDir)).openAtLogin : false;
}
function setStartAtLogin(appDir, on) {
  if (!loginSupported()) return false;
  app.setLoginItemSettings({ ...loginArgs(appDir), openAtLogin: on, ...(isMac ? { openAsHidden: false } : {}) });
  return getStartAtLogin(appDir);
}

// ---------- notifications ----------
function notify({ title, body, icon, onClick }) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, silent: true, ...(isMac ? {} : { icon }) });
  if (onClick) n.on('click', onClick);
  n.show();
}

// ---------- shortcut ----------
// Tried in order; the first one no other app owns wins. Ctrl+Option+Space is the macOS input-source switch,
// so the Mac starts with Cmd+Shift+Space.
const SHORTCUTS = isMac
  ? [['Command+Shift+Space', '⌘⇧Space'], ['Control+Option+F', '⌃⌥F'], ['Command+Option+F', '⌘⌥F']]
  : [['Control+Alt+Space', 'Ctrl+Alt+Space'], ['Control+Shift+Space', 'Ctrl+Shift+Space'], ['Control+Alt+F', 'Ctrl+Alt+F'], ['Alt+Shift+F', 'Alt+Shift+F']];
// Quick fill (snippet picker) from anywhere. V for paste; chosen to avoid common app shortcuts (Ctrl+Alt+V is Paste Special in Office).
const FILL_SHORTCUTS = isMac
  ? [['Control+Option+V', '⌃⌥V'], ['Control+Option+;', '⌃⌥;']]
  : [['Alt+Shift+V', 'Alt+Shift+V'], ['Control+Alt+Shift+V', 'Ctrl+Alt+Shift+V']];
function registerShortcut(globalShortcut, fn, list = SHORTCUTS) {
  for (const [accel, label] of list) if (globalShortcut.register(accel, fn)) return label;
  return null;
}

// ---------- screenshot ----------
// The system's own capture UI, which puts the picture on the clipboard (Floatie's clipboard watcher then keeps it).
// macOS: area/window capture (Space toggles window mode, Esc cancels); macOS may ask to allow screen recording.
// Windows 10 1809+/11: the Snipping overlay; it returns straight away, so the watcher looks for the image for a while.
function screenshotCommand() {
  if (isMac) return { file: '/usr/sbin/screencapture', args: ['-i', '-c'], waits: true };
  if (isWin) return { file: 'explorer.exe', args: ['ms-screenclip:'], waits: false };
  return null;
}

// ---------- clipboard privacy ----------
// Clipboard types that password managers attach to secrets so history tools skip them.
const CONCEALED_FORMATS = isMac
  ? ['org.nspasteboard.ConcealedType', 'org.nspasteboard.TransientType', 'org.nspasteboard.AutoGeneratedType']
  : ['ExcludeClipboardContentFromMonitorProcessing', 'Clipboard Viewer Ignore'];
function isConcealed(clipboard) {
  try {
    if (CONCEALED_FORMATS.some((f) => clipboard.has(f))) return true;
    if (isWin) {
      const b = clipboard.readBuffer('CanIncludeInClipboardHistory');
      if (b && b.length >= 4 && b.readUInt32LE(0) === 0) return true;
    }
  } catch { return true; }   // can't tell? then don't record it
  return false;
}

// ---------- Windows app-container escape ----------
// A process started from inside a Store-packaged app (for example the Claude desktop app, or a terminal it opened)
// has its AppData writes silently redirected into that app's private Packages folder. Floatie would then read and
// write a hidden second copy of your data, while launches from Windows (login, Start Menu) use the real folder —
// tasks seem to "disappear" after a restart. Detect it with a probe file and relaunch outside the package.
function virtualizedBy(userData) {
  if (!isWin) return null;
  const fs = require('fs');
  const probe = `.probe-${process.pid}`;
  try {
    fs.mkdirSync(userData, { recursive: true });
    fs.writeFileSync(path.join(userData, probe), '');
    const pk = path.join(process.env.LOCALAPPDATA || '', 'Packages');
    for (const p of fs.existsSync(pk) ? fs.readdirSync(pk) : []) {
      if (fs.existsSync(path.join(pk, p, 'LocalCache', 'Roaming', path.basename(userData), probe))) return p;
    }
  } catch {} finally {
    try { fs.rmSync(path.join(userData, probe), { force: true }); } catch {}
  }
  return null;
}
// WMI starts the new process outside any app container (a normal child would inherit the redirection).
function relaunchOutsideContainer(appDir) {
  const exe = process.execPath.replace(/'/g, "''");
  const args = (app && app.isPackaged ? [] : [appDir]).concat('--escaped').map((a) => `"${a}"`).join(' ').replace(/'/g, "''");
  // success means WMI reported ReturnValue 0 and a process id; anything else keeps this copy running
  const ps = `$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = '"${exe}" ${args}' }; ` +
    'if ($r.ReturnValue -eq 0 -and $r.ProcessId) { exit 0 } else { exit 1 }';
  // wait for it: if this process exited first, the helper could be torn down before the new copy starts
  const r = require('child_process').spawnSync('powershell.exe',
    ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')],
    { stdio: 'ignore', windowsHide: true, timeout: 20000 });
  return r.status === 0;
}

module.exports = {
  virtualizedBy, relaunchOutsideContainer,
  isMac, isWin, pinUserData, windowOptions, setGlass, afterCreate, keepOnTop, appUserModelId, hideWindow, isHidden, releaseFocus, trayIcon, setAppMenu,
  loginSupported, installed, getStartAtLogin, setStartAtLogin, notify, SHORTCUTS, FILL_SHORTCUTS, registerShortcut, isConcealed,
  screenshotCommand,
};
