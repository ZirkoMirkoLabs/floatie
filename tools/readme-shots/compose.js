// Electron script (started by make.js): lays the raw captures on a plain neutral background, one image per scene.
//   electron compose.js --force-device-scale-factor=2 <rawDir> <outDir>
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const [rawDir, outDir] = process.argv.filter((a) => !a.startsWith('--')).slice(-2);
const RAW_SCALE = 3;   // suite.js captures at 3x
const img = (name, scale = 1, cls = '') => {
  const f = path.join(rawDir, `${name}.png`);
  const { width, height } = require('electron').nativeImage.createFromPath(f).getSize();
  return `<div class="win ${cls}" style="width:${(width / RAW_SCALE) * scale}px"><img src="${pathToFileURL(f)}" style="width:100%"></div>`;
};
const copy = (eyebrow, title, body) => `<div class="copy"><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${body}</p></div>`;

const SCENES = {
  hero: [1600, 900, () => `<div class="row">
    <figure>${img('peek', 1.4)}<figcaption>While you work</figcaption></figure>
    <figure>${img('tasks', 1.4)}<figcaption>When you need it</figcaption></figure>
    <figure>${img('clips', 1.4)}<figcaption>Clipboard history</figcaption></figure></div>`],
  tasks: [1600, 820, () => copy('Tasks', 'Type it the way<br>you’d say it.',
    '“Design review at 2pm”, “stretch every day”, “tea 5m”. Floatie picks out the dates, reminders, repeats and timers.') + img('tasks', 1.3)],
  peek: [1600, 820, () => copy('Collapsed view', 'Out of the way<br>until you need it.',
    'Move the mouse away and Floatie fades to a slim list of what’s left today. Hover over it and everything is back.') + img('peek', 1.9)],
  clips: [1600, 820, () => copy('Clipboard', 'Everything you copied,<br>one click away.',
    'Text and images grouped by day, searchable, with folders for clips you want to keep. Password-manager copies are skipped.') + img('clips', 1.3)],
  snippets: [1600, 820, () => copy('Snippets', 'Type it once.<br>Paste it anywhere.',
    'Save your address, email or sign-off under a keyword. Press Alt+Shift+V in any app, type the keyword, hit Enter and paste.') + img('snippets', 1.3)],
  alarm: [1600, 820, () => copy('Reminders', 'Nothing slips by.',
    'Timers and reminders open a calm card: Done, +5 min or Dismiss. Missed ones ring the moment your computer wakes.') + img('alarm', 1.3)],
  history: [1600, 820, () => copy('History', 'Undo anything.',
    'Every change is logged. Bring back a deleted task with one click, today or days later.') + img('history', 1.3)],
  themes: [1600, 820, () => copy('Settings', 'Make it yours.',
    'Dark or light, six accent colours, acrylic or mica glass, idle transparency and start at login.') +
    `<div class="pair">${img('tasks', 1.15)}${img('tasks-light', 1.15, 'light')}</div>`],
};

const CSS = `
* { margin: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; overflow: hidden; }
body { font-family: "Segoe UI Variable Display", "Segoe UI", -apple-system, system-ui, sans-serif; color: #141414;
  background: #ebe8e3; display: flex; align-items: center; justify-content: center; gap: 128px; }
.win { border-radius: 14px; overflow: hidden; flex: none; background: #18181b;
  box-shadow: 0 0 0 1px rgba(0,0,0,.06), 0 2px 4px rgba(20,16,10,.06), 0 16px 32px -8px rgba(20,16,10,.16), 0 48px 96px -24px rgba(20,16,10,.28); }
.win.light { background: #fafafa; }
.win img { display: block; }
.row { display: flex; align-items: center; gap: 72px; }
figure { display: flex; flex-direction: column; align-items: center; gap: 26px; margin: 0; }
figcaption { font-size: 17px; font-weight: 500; color: #6f6a63; }
.copy { width: 600px; }
.eyebrow { font-size: 16px; font-weight: 600; color: #b8700a; margin-bottom: 18px; letter-spacing: .04em; text-transform: uppercase; }
h1 { font-size: 54px; line-height: 1.06; font-weight: 600; letter-spacing: -.025em; margin-bottom: 24px; }
p { font-size: 21px; line-height: 1.5; color: #5d5852; }
.pair { display: flex; align-items: center; }
.pair .win + .win { margin-left: -70px; margin-top: 90px; }
`;

app.on('window-all-closed', () => {});   // one window per scene; don't quit between them
app.whenReady().then(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  for (const [name, [w, h, body]] of Object.entries(SCENES)) {
    const win = new BrowserWindow({ width: w, height: h, x: -9000, y: 0, frame: false, show: false, enableLargerThanScreen: true, skipTaskbar: true });
    const html = path.join(app.getPath('temp'), `floatie-scene-${name}.html`);
    fs.writeFileSync(html, `<!doctype html><meta charset="utf-8"><style>${CSS}</style><body>${body()}</body>`);
    await win.loadFile(html);
    win.showInactive();
    await win.webContents.executeJavaScript('Promise.all([...document.images].map((i) => i.decode())).then(() => document.fonts.ready)');
    await new Promise((r) => setTimeout(r, 400));
    fs.writeFileSync(path.join(outDir, `${name}.jpg`), (await win.webContents.capturePage()).toJPEG(90));
    win.destroy();
    fs.rmSync(html, { force: true });
  }
  app.exit(0);
});
