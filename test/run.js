// Automated checks against a hidden, off-screen copy of Floatie with its own throwaway data folder.
// Run:  npm test   (test/run-tests.js starts the suites; never touches the real Floatie, its data, the mouse or the screen)
// Suites (FLOATIE_TEST_SUITE): main = everything in one session; seed + verify = two launches on the same data folder,
// checking persistence across a restart and that a reminder which came due while the app was closed fires on launch.
const fs = require('fs');
const path = require('path');

module.exports = async function run(h) {
  const { win, app } = h;
  const suite = process.env.FLOATIE_TEST_SUITE || 'main';
  const shots = process.env.FLOATIE_SHOTS || path.join(app.getPath('userData'), 'shots');
  fs.mkdirSync(shots, { recursive: true });
  const results = [];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => win.webContents.executeJavaScript(code);
  const check = (name, ok, detail = '') => results.push({ name: `[${suite}] ${name}`, ok: !!ok, detail });
  const shot = async (name) => fs.writeFileSync(path.join(shots, name + '.png'), (await win.webContents.capturePage()).toPNG());
  const add = (text) => js(`input.value = ${JSON.stringify(text)}; document.querySelector('#add').requestSubmit(); true`);
  const errors = [];
  win.webContents.on('console-message', (_e, level, msg) => { if (level >= 3) errors.push(msg); });

  try {
    await new Promise((r) => (win.webContents.isLoading() ? win.webContents.once('did-finish-load', r) : r()));
    await wait(600);
    if (suite === 'seed') await seed();
    else if (suite === 'verify') await verify();
    else if (suite === 'locked') await locked();
    else if (suite === 'again') await again();
    else if (suite === 'shape') await shape();
    else if (suite === 'shots') await require('../tools/readme-shots/suite.js')({ h, js, add, wait, shot });
    else await main();
    check('no renderer errors', errors.length === 0, errors.join(' | '));
  } catch (err) {
    check('harness crashed', false, err.stack);
  }

  const passed = results.filter((r) => r.ok).length;
  fs.writeFileSync(path.join(shots, `results-${suite}.json`), JSON.stringify({ passed, total: results.length, results }, null, 2));
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail && !r.ok ? '  - ' + r.detail : ''}`);
  console.log(`${passed}/${results.length} passed`);
  app.isQuitting = true;
  app.exit(passed === results.length ? 0 : 1);

  // first launch: create data, set a reminder due a few seconds from now, then close before it fires
  async function seed() {
    await add('Persist me tomorrow');
    await add('Persist starred !');
    await js(`(() => { const t = D.tasks.find(x => x.text === 'Persist starred'); t.remindAt = Date.now() + 3000; t.reminded = false;
      D.notes = 'notes survive restarts'; save(); return true; })()`);
    h.addClip({ text: 'clip survives restarts' });
    await js('A.setPrefs({ idleOpacity: 0.5 })');
    await wait(300);
    check('seeded data on disk', fs.existsSync(path.join(app.getPath('userData'), 'data.json')));
  }

  // second launch on the same folder: everything is back, and the reminder that came due while closed rings now
  async function verify() {
    const texts = await js('D.tasks.map(t => t.text)');
    check('tasks persist across restart', texts.includes('Persist me') && texts.includes('Persist starred'), texts.join(', '));
    check('future date persists', (await js("D.tasks.find(t => t.text === 'Persist me').date")) === (await js('addDays(today(), 1)')));
    check('notes persist', (await js('D.notes')) === 'notes survive restarts');
    check('clips persist', h.getClips().items.some((i) => i.text === 'clip survives restarts'));
    check('window prefs persist', h.prefs().idleOpacity === 0.5, String(h.prefs().idleOpacity));
    await wait(800);
    check('overdue reminder fires on launch', await js("document.querySelector('#alarm').classList.contains('open') && document.querySelector('#alarmTitle').textContent === 'Persist starred'"));
    await shot('10-overdue-on-launch');
  }

  // third launch: the reminder rang last time but was never answered, so it rings again instead of vanishing
  async function again() {
    await wait(300);
    check('unanswered alarm returns after restart', await js("document.querySelector('#alarm').classList.contains('open') && document.querySelector('#alarmTitle').textContent === 'Persist starred'"));
  }

  // data.json parses but isn't a task list
  async function shape() {
    check('wrong-shape file recovered from good copy', (await js('loaded && D.tasks.map(t => t.text).join()')) === 'From the good copy');
    check('damaged file kept aside', fs.readdirSync(path.join(app.getPath('userData'), 'backups')).some((f) => f.startsWith('data-corrupt-')));
  }

  // launch with data.json unreadable for the first few seconds (simulated lock)
  async function locked() {
    const file = path.join(app.getPath('userData'), 'data.json');
    const before = fs.readFileSync(file, 'utf8');
    check('starts in waiting state, not blank', (await js('loaded')) === false && (await js("document.querySelector('#newTask').disabled")) === true);
    await js("D.tasks.push({ id: 'x', text: 'typed while locked', date: today(), done: false, order: 0 }); save(); true");
    check('nothing saved over the real file while waiting', fs.readFileSync(file, 'utf8') === before);
    await wait(2600);
    const texts = await js('D.tasks.map(t => t.text)');
    check('real tasks appear once readable', (await js('loaded')) && texts.includes('Persist me') && texts.includes('Persist starred'), texts.join(', '));
    check('older backup not used while locked', !texts.includes('Stale copy'), texts.join(', '));
    const disk = JSON.parse(fs.readFileSync(file, 'utf8'));
    check('saved file still has the real tasks', disk.tasks.some((t) => t.text === 'Persist me'));
    check('diagnostics logged', fs.readFileSync(path.join(app.getPath('userData'), 'floatie.log'), 'utf8').includes('load FAILED'));
  }

  async function main() {
    await shot('01-empty');

    // natural-language parsing
    for (const t of ['Reply to emails 25m', 'Plan launch tomorrow', 'Stretch daily', 'Pay rent !', 'Call mom at 11pm', 'Team review weekly'])
      await add(t);
    const tasks = await js('D.tasks.map(t => ({ text: t.text, date: t.date, star: t.star, repeat: t.repeat, timer: !!t.timer, remind: t.remindAt ? new Date(t.remindAt).getHours() : null }))');
    const by = (s) => tasks.find((t) => t.text === s) || {};
    const today = await js('today()'), tomorrow = await js('addDays(today(), 1)');
    check('parse: timer', by('Reply to emails').timer);
    check('parse: tomorrow', by('Plan launch').date === tomorrow, by('Plan launch').date);
    check('parse: daily repeat', by('Stretch').repeat === 'daily');
    check('parse: star', by('Pay rent').star === true);
    check('parse: reminder 11pm', by('Call mom').remind === 23, JSON.stringify(by('Call mom')));
    check('parse: weekly', by('Team review').repeat === 'weekly');
    await shot('02-tasks');

    // week strip: hidden by default, centred on the selected day when shown
    check('week hidden by default', await js("document.querySelector('#week').classList.contains('hidden')"));
    await js('toggleWeek(); true');
    const mid = await js("document.querySelectorAll('#days .day')[3].dataset.day === sel");
    check('week strip centred on selected day', mid);
    await shot('03-week');
    await js('toggleWeek(); true');

    // undo reverses only the last action
    const rentId = await js("D.tasks.find(t => t.text === 'Pay rent').id");
    await js(`removeTask(${JSON.stringify(rentId)}); true`);
    await add('Added after delete');
    await js('doUndo(); true');   // undoes the add? no — add isn't undoable, so this restores the delete
    const afterUndo = await js("D.tasks.map(t => t.text)");
    check('undo restores deleted task', afterUndo.includes('Pay rent'));
    check('undo keeps later work', afterUndo.includes('Added after delete'));

    // history + restore
    const delId = await js("D.tasks.find(t => t.text === 'Added after delete').id");
    await js(`removeTask(${JSON.stringify(delId)}); openHistory(); true`);
    await wait(100);
    await shot('04-history');
    await js("document.querySelector('[data-restore]').click(); true");
    check('history restore', await js("D.tasks.some(t => t.text === 'Added after delete')"));
    check('history restore not duplicated', (await js("D.tasks.filter(t => t.text === 'Added after delete').length")) === 1);
    await js('closeSheets(); true');

    // Esc in Notes must not wipe the notes
    await js("setTab('notes'); const n = document.querySelector('#notes'); n.value = 'keep me'; n.dispatchEvent(new Event('input')); n.focus(); n.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true");
    check('Esc keeps notes', (await js('D.notes')) === 'keep me');
    await js("setTab('tasks'); true");

    // review fixes: imports are all-or-nothing, imported fields can't inject markup, undo restores everything
    check('bad import rejected', (await js("importProblems({ tasks: [{ text: 'bad entry' }] }).length")) > 0);
    check('duplicate ids rejected', (await js("importProblems({ tasks: [{ id: 'a', text: 'x', date: today() }, { id: 'a', text: 'y', date: today() }] }).length")) > 0);
    check('markup in repeat rejected', (await js("importProblems({ tasks: [{ id: 'a', text: 'x', date: today(), repeat: '<style>body{display:none}</style>' }] }).length")) > 0);
    check('valid backup accepted', (await js("importProblems({ tasks: [{ id: 'a', text: 'x', date: today(), repeat: 'daily' }], timers: [], notes: '' }).length")) === 0);
    await js(`D.tasks.push({ id: 'inj', text: 'Injected', date: today(), done: false, order: 50, repeat: '<i id="pwn">x</i>' }); render(); true`);
    check('task fields are escaped', !(await js("!!document.querySelector('#pwn')")));
    await js("D.tasks = D.tasks.filter(t => t.id !== 'inj'); render(); true");
    await add('Tea 5m');
    await js("document.querySelector(`li.row[data-id='${D.tasks.find(t => t.text === 'Tea').id}'] [data-act=toggle]`).click(); doUndo(); true");
    check('undo of done restores the timer', await js("(() => { const t = D.tasks.find(x => x.text === 'Tea'); return !t.done && !!t.timer && t.timer.end > Date.now(); })()"));
    check('first weekday occurrence skips weekends', await js("(() => { const d = parseInput('standup weekdays at 9', today()).date; return ![0, 6].includes(toDate(d).getDay()); })()"));
    check('snooze keeps the repeat time', await js(`(() => { const d = addDays(today(), 1), at = withDate(Date.now(), d);
      const t = { id: 'sn', text: 'Snoozy', date: d, due: d, done: false, order: 60, repeat: 'daily', remindAt: at + 300000, remindBase: at };
      D.tasks.push(t); setDone(t, true); const c = D.tasks.find(x => x.id === t.spawned);
      const ok = new Date(c.remindAt).getMinutes() === new Date(at).getMinutes(); D.tasks = D.tasks.filter(x => x.series !== 'sn' && x.id !== 'sn'); return ok; })()`));
    check('re-completing a repeat makes no duplicate', await js(`(() => { const t = { id: 'rp', text: 'Daily thing', date: today(), due: today(), done: false, order: 61, repeat: 'daily' };
      D.tasks.push(t); setDone(t, true); setDone(find('task', t.spawned), true); setDone(t, false); setDone(t, true);
      const n = D.tasks.filter(x => x.series === 'rp' && !x.done).length; D.tasks = D.tasks.filter(x => x.series !== 'rp' && x.id !== 'rp'); return n === 1; })()`));
    await js('render(); true');

    // weekly repeat keeps its weekday even after rolling over
    const wk = await js(`(() => { const t = D.tasks.find(x => x.text === 'Team review'); t.due = addDays(today(), -2); t.date = addDays(today(), -2); rollover(); setDone(t, true);
      const c = D.tasks.find(x => x.id === t.spawned); return { due: t.due, child: c.date, today: today() }; })()`);
    const dow = (s) => new Date(s + 'T12:00').getDay();
    check('weekly repeat keeps weekday', dow(wk.child) === dow(wk.due) && wk.child > wk.today, JSON.stringify(wk));

    // past days: no add box
    await js('sel = addDays(today(), -1); render(); true');
    check('no add box on past days', await js("document.querySelector('#add').classList.contains('hidden')"));
    await js('sel = today(); render(); true');

    // clipboard view with text, image and a folder
    h.addClip({ text: 'npm run build && npm test' });
    h.addClip({ text: 'Meeting link: https://example.com/room/42' });
    h.addClip({ img: h.nativeImage.createFromPath(path.join(__dirname, '..', 'icon.png')) });
    await wait(150);
    await js("setTab('clips'); true");
    await wait(150);
    check('clips listed', (await js("document.querySelectorAll('#clipList .clip').length")) === 3);
    check('image thumbnail loads', await js("new Promise(r => { const i = document.querySelector('#clipList img'); if (!i) return r(false); if (i.complete) return r(i.naturalWidth > 0); i.onload = () => r(true); i.onerror = () => r(false); })"));
    await shot('05-clips');
    const fid = await js("A.clips.addFolder('Snippets')");
    const cid = await js("CL.items.find(i => i.text === 'npm run build && npm test').id");
    await js(`A.clips.move(${JSON.stringify(cid)}, ${JSON.stringify(fid)}); true`);
    await wait(150);
    await js(`folder = ${JSON.stringify(fid)}; renderClips(); true`);
    check('clip moved to folder', (await js("document.querySelectorAll('#clipList .clip').length")) === 1);
    await shot('06-folder');
    await js(`A.clips.deleteFolder(${JSON.stringify(fid)}); true`);
    await wait(150);
    check('deleting folder keeps its clips', h.getClips().items.length === 3);
    await js("folder = null; setTab('tasks'); true");

    // collapse / expand: peek size, and no creep over repeated cycles
    const fullBefore = h.getBounds();
    const sizes = [];
    for (let i = 0; i < 3; i++) {
      h.collapse(); await wait(350);
      sizes.push({ peek: h.getBounds(), mode: h.getMode() });
      if (i === 0) { await shot('07-collapsed'); sizes.contentH = await js("Math.ceil(document.querySelector('#peek').getBoundingClientRect().height)"); }
      h.expand(false); await wait(250);
      sizes.push({ full: h.getBounds() });
    }
    const peek = sizes[0].peek, lastFull = sizes[5].full;
    check('collapsed mode', sizes[0].mode === 'collapsed');
    check('collapsed is thinner', peek.width < fullBefore.width && peek.height < fullBefore.height, JSON.stringify(peek));
    check('peek height fits content', Math.abs(peek.height - sizes.contentH) <= 2, `window ${peek.height} vs content ${sizes.contentH}`);
    check('no size creep after 3 cycles', lastFull.width === fullBefore.width && lastFull.height === fullBefore.height && lastFull.x === fullBefore.x, `${JSON.stringify(fullBefore)} -> ${JSON.stringify(lastFull)}`);

    // fade: eases down to the idle level over ~1s, snaps back quickly
    const idle = h.prefs().idleOpacity;
    h.fadeTo(idle, 1000);
    await wait(450);
    const midFade = win.getOpacity();
    await wait(700);
    const endFade = win.getOpacity();
    check('fade is gradual', midFade < 0.95 && midFade > idle + 0.03, `mid ${midFade.toFixed(2)}`);
    check('fade reaches idle level in ~1s', Math.abs(endFade - idle) < 0.02, `end ${endFade.toFixed(2)} target ${idle}`);
    h.solid(); await wait(250);
    check('back to solid on hover', win.getOpacity() > 0.98, win.getOpacity().toFixed(2));

    // alarm: overlay opens, focus is NOT on the Mark done button
    await add('Ping 1s');
    await wait(1800);
    check('alarm opens', await js("document.querySelector('#alarm').classList.contains('open')"));
    check('alarm does not focus Mark done', await js("document.activeElement !== document.querySelector('#aDone')"));
    await shot('08-alarm');
    check('fired alarm is saved until answered', JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'data.json'), 'utf8')).tasks.find((t) => t.text === 'Ping').alarm === 'task');
    await js("document.querySelector('#aDone').click(); true");
    check('alarm Mark done completes task', await js("D.tasks.find(t => t.text === 'Ping').done === true"));
    check('answered alarm is cleared', await js("!D.tasks.find(t => t.text === 'Ping').alarm"));
    // undoing that completion while nothing else rings must not leave a stuck card
    await js('doUndo(); true'); await wait(100);
    await js("ringing = []; render(); true");
    check('empty alarm queue closes the card', await js("!document.querySelector('#alarm').classList.contains('open')"));
    await js("const p = D.tasks.find(t => t.text === 'Ping'); setDone(p, true); delete p.alarm; ringing = []; render(); true");
    await js("openHistory(); true");
    check('sheet makes the panel underneath inert', await js("document.querySelector('.panel > .view').inert === true && document.activeElement.matches('#history [data-close]')"));
    await js('closeSheets(); true');

    // settings + data on disk
    await js('openSettings(); true'); await wait(200);
    await shot('09-settings');
    await js('closeSheets(); true');
    await wait(100);
    const disk = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'data.json'), 'utf8'));
    check('saved to disk', disk.tasks.length === (await js('D.tasks.length')));

    // a blank state can never overwrite saved tasks
    await js("A.save({ tasks: [], timers: [], log: [], notes: '' }); true");
    await wait(150);
    const after = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'data.json'), 'utf8'));
    check('blank save refused', after.tasks.length === disk.tasks.length, `${disk.tasks.length} -> ${after.tasks.length}`);

    // sleep/resume across midnight: waking up rolls unfinished tasks to the new day and the view follows
    await js(`(() => { const y = addDays(today(), -1);
      D.tasks.push({ id: 'slept', text: 'Left over from yesterday', date: y, done: false, order: 99, timer: null });
      lastToday = y; sel = y; return true; })()`);
    h.wake();
    await wait(300);
    check('resume rolls tasks to today', (await js("D.tasks.find(t => t.id === 'slept').date")) === (await js('today()')));
    check('resume moves view to today', await js('sel === today()'));
  }
};
