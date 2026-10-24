// Electron script (started by make.js): renders the hover/fade demo as PNG frames, which make.js turns into a GIF.
//   electron demo.js <rawDir> <framesDir>
// Real captures, real timings: expands on hover, collapses on leave, then eases to 35% over ~1s like the app.
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const [rawDir, framesDir] = process.argv.filter((a) => !a.startsWith('--')).slice(-2);
const FPS = 25, SECONDS = 7.2, W = 1200, H = 720;
const src = (n) => pathToFileURL(path.join(rawDir, `${n}.png`)).href;
const size = (n) => nativeImage.createFromPath(path.join(rawDir, `${n}.png`)).getSize();
const peek = size('peek'), full = size('tasks');

const DOC = `
<h2>Launch plan</h2>
<p class="meta">Draft · edited just now</p>
<p>The goal for this release is simple: get the new onboarding in front of real people by the end of the month, and learn from it before we polish anything else.</p>
<h3>This week</h3>
<ul><li>Finish the release notes and send them for review on Thursday.</li><li>Run the design review with the whole team, then lock the copy.</li><li>Record a short walkthrough for the help centre.</li></ul>
<h3>Open questions</h3>
<p>Do we ship the calendar view in this release, or keep it behind a setting until the feedback is in? The safer option is to keep it hidden and turn it on for a small group first.</p>
<p>Pricing stays the same for now. We'll revisit after the first two weeks of usage data.</p>`;

const HTML = `<!doctype html><meta charset="utf-8"><style>
* { margin: 0; box-sizing: border-box; }
html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #ebe8e3;
  font-family: "Segoe UI Variable Text", "Segoe UI", -apple-system, system-ui, sans-serif; }
.doc { position: absolute; left: 56px; top: 56px; width: 1088px; height: 600px; background: #fff; border-radius: 12px;
  box-shadow: 0 0 0 1px rgba(0,0,0,.06), 0 16px 40px -12px rgba(20,16,10,.18); overflow: hidden; }
.bar { height: 44px; border-bottom: 1px solid #eee; display: flex; align-items: center; padding: 0 18px; gap: 8px; color: #8a857e; font-size: 13px; }
.bar i { width: 11px; height: 11px; border-radius: 50%; background: #e2dfda; }
.bar span { margin-left: 12px; }
.page { padding: 34px 56px; color: #2b2925; font-size: 15px; line-height: 1.65; max-width: 1000px; }
.page h2 { font-size: 28px; font-weight: 650; letter-spacing: -.015em; }
.page h3 { font-size: 16px; font-weight: 650; margin: 18px 0 4px; }
.page .meta { color: #9a948c; font-size: 13px; margin: 2px 0 14px; }
.page ul { padding-left: 20px; }
.win { position: absolute; right: 80px; top: 112px; border-radius: 12px; overflow: hidden; background: #18181b; transform-origin: top right;
  box-shadow: 0 0 0 1px rgba(0,0,0,.08), 0 16px 32px -8px rgba(20,16,10,.22), 0 40px 80px -24px rgba(20,16,10,.3); }
.win img { display: block; width: 100%; }
#peek { width: ${peek.width / 3}px; } #full { width: ${full.width / 3}px; }
#cursor { position: absolute; width: 24px; height: 24px; left: 0; top: 0; filter: drop-shadow(0 2px 3px rgba(0,0,0,.25)); }
.cap { position: absolute; left: 56px; bottom: 22px; height: 36px; display: flex; align-items: center; }
.cap div { position: absolute; white-space: nowrap; font-size: 15px; font-weight: 500; color: #4c4842; display: flex; gap: 10px; align-items: center; }
.cap b { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #d9900f; }
</style>
<div class="doc"><div class="bar"><i></i><i></i><i></i><span>Launch plan</span></div><div class="page">${DOC}</div></div>
<div class="win" id="peek"><img src="${src('peek')}"></div>
<div class="win" id="full"><img src="${src('tasks')}"></div>
<svg id="cursor" viewBox="0 0 24 24"><path d="M4 2.5v17.2l4.6-4.4 3 6.6 2.9-1.3-3-6.5h6.3z" fill="#111" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>
<div class="cap"><div id="c1"><b></b>Fades out of the way while you work</div><div id="c2"><b></b>Hover to open it</div><div id="c3"><b></b>Move away and it tucks itself back</div></div>
<script>
const $ = (id) => document.getElementById(id);
const clamp = (x) => Math.min(1, Math.max(0, x));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const io = (x) => (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);   // ease in-out
const out = (x) => 1 - Math.pow(1 - x, 3);                                       // the app's fade curve
const lerp = (a, b, x) => a + (b - a) * x;
const IDLE = .35;
const P = [[520, 540], [1030, 175], [990, 400], [560, 580]];   // cursor stops
window.setT = (t) => {
  // cursor path: rest → onto the widget → down the list → away
  let c = P[0];
  if (t >= 1.2 && t < 2.0) { const x = io(seg(t, 1.2, 2.0)); c = [lerp(P[0][0], P[1][0], x), lerp(P[0][1], P[1][1], x)]; }
  else if (t >= 2.0 && t < 2.9) c = P[1];
  else if (t >= 2.9 && t < 3.8) { const x = io(seg(t, 2.9, 3.8)); c = [lerp(P[1][0], P[2][0], x), lerp(P[1][1], P[2][1], x)]; }
  else if (t >= 3.8 && t < 4.5) c = P[2];
  else if (t >= 4.5 && t < 5.3) { const x = io(seg(t, 4.5, 5.3)); c = [lerp(P[2][0], P[3][0], x), lerp(P[2][1], P[3][1], x)]; }
  else if (t >= 5.3) { const x = io(seg(t, 5.3, 7.2)); c = [lerp(P[3][0], P[0][0], x), lerp(P[3][1], P[0][1], x)]; }
  $('cursor').style.transform = 'translate(' + c[0] + 'px,' + c[1] + 'px)';

  // widget: faded peek → solid on hover → expands → collapses on leave → eases back to idle
  const expand = seg(t, 2.05, 2.3), collapse = seg(t, 5.0, 5.15);
  const shown = expand * (1 - collapse);                  // 1 = full panel
  let op = IDLE;
  if (t >= 1.85 && t < 5.15) op = lerp(IDLE, 1, seg(t, 1.85, 2.05));
  if (t >= 5.15) op = lerp(1, IDLE, out(seg(t, 5.25, 6.25)));
  $('full').style.opacity = shown;
  $('full').style.transform = 'scale(' + lerp(.97, 1, shown) + ')';
  $('peek').style.opacity = op * (1 - shown);
  $('full').style.visibility = shown > 0 ? 'visible' : 'hidden';

  // captions follow the story
  const cap = t < 1.7 || t >= 6.0 ? 1 : t < 4.6 ? 2 : 3;
  ['c1', 'c2', 'c3'].forEach((id, i) => { $(id).style.opacity = cap === i + 1 ? 1 : 0; });
};
</script>`;

app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  fs.mkdirSync(framesDir, { recursive: true });
  const win = new BrowserWindow({ width: W, height: H, x: -9000, y: 0, frame: false, show: false, enableLargerThanScreen: true, skipTaskbar: true });
  const file = path.join(app.getPath('temp'), 'floatie-demo.html');
  fs.writeFileSync(file, HTML);
  await win.loadFile(file);
  win.showInactive();
  await win.webContents.executeJavaScript('Promise.all([...document.images].map((i) => i.decode())).then(() => document.fonts.ready)');
  const n = Math.round(FPS * SECONDS);
  for (let i = 0; i < n; i++) {
    await win.webContents.executeJavaScript(`setT(${i / FPS}); new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
    fs.writeFileSync(path.join(framesDir, `f${String(i).padStart(4, '0')}.png`), (await win.webContents.capturePage()).toPNG());
  }
  fs.rmSync(file, { force: true });
  app.exit(0);
});
