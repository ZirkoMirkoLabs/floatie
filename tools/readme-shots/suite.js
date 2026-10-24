// Captures the raw app states for the README with realistic demo data (run via make.js, never by hand).
// Each PNG keeps the window's transparency; compose.js puts the panel colour behind it.
const HOUR = 3600e3;

module.exports = async function shots({ h, js, add, wait, shot }) {
  const theme = (t, accent) => js(`S.accent = ${JSON.stringify(accent)}; applyTheme(); document.documentElement.dataset.theme = '${t}'; render(); true`);
  await theme('dark', '#f2a93b');

  // today: a believable morning, two things already done, one timer running
  for (const t of ['Morning run', 'Standup notes weekdays', 'Write release notes', 'Design review', 'Reply to Sam about the offsite',
    'Stretch daily', 'Pay electricity bill !', 'Book dentist tomorrow']) await add(t);
  await js(`(() => {
    const f = (s) => D.tasks.find((x) => x.text === s);
    setDone(f('Morning run'), true); setDone(f('Standup notes'), true);
    f('Write release notes').timer = { total: 25 * 60e3, end: Date.now() + (18 * 60 + 42) * 1e3, left: null };
    const r = new Date(Date.now() + ${3 * HOUR}); r.setMinutes(r.getMinutes() < 30 ? 30 : 0, 0, 0); if (!r.getMinutes()) r.setHours(r.getHours() + 1);
    f('Design review').remindAt = +r;
    save(); render(); return true; })()`);
  await wait(300);
  await shot('tasks');

  await js('toggleWeek(); true'); await wait(200);
  await shot('week');
  await js('toggleWeek(); true');

  // clipboard: a palette image, a link, a command, a colour
  const palette = await js(`(() => { const c = document.createElement('canvas'); c.width = 640; c.height = 400; const g = c.getContext('2d');
    ['#1d1f27', '#3b3f54', '#f2a93b', '#f6d28f', '#e9e4da'].forEach((col, i) => { g.fillStyle = col; g.fillRect(i * 128, 0, 128, 400); });
    return c.toDataURL(); })()`);
  h.addClip({ img: h.nativeImage.createFromDataURL(palette) });
  for (const text of ['#F2A93B', 'git commit -m "Polish onboarding copy"', 'https://example.com/brief/q4-launch'])
    { h.addClip({ text }); await wait(30); }
  await js("setTab('clips'); true"); await wait(300);
  await shot('clips');

  // snippets: a few everyday ones, the address used most
  await js(`(() => {
    for (const [k, t] of [['addr', '12 Garden Road\\nSpringfield'], ['email', 'hello@example.com'], ['sig', 'Thanks so much,\\nSam'], ['zoom', 'https://example.com/meet/sam']]) {
      editSnip(null, k); document.querySelector('#snipText').value = t; saveSnip();
    }
    D.snippets.find((s) => s.key === 'addr').used = 5; D.snippets.find((s) => s.key === 'email').used = 3;
    closeSheets(); setTab('snips'); renderSnips(); return true; })()`);
  await wait(300);
  await shot('snippets');
  await js("setTab('tasks'); true");

  // collapsed peek
  h.collapse(); await wait(400);
  await shot('peek');
  h.expand(false); await wait(300);

  // history after tidying up
  await js(`removeTask(D.tasks.find((x) => x.text === 'Reply to Sam about the offsite').id); openHistory(); true`); await wait(200);
  await shot('history');
  await js("document.querySelector('[data-restore]').click(); closeSheets(); true"); await wait(200);

  // settings
  await js('openSettings(); true'); await wait(250);
  await shot('settings');
  await js('closeSheets(); true');

  // time's up
  await add('Stand up and stretch 1s');
  await wait(1700);
  await shot('alarm');
  await js("document.querySelector('#aDismiss').click(); removeTask(D.tasks.find((x) => x.text === 'Stand up and stretch').id); true"); await wait(200);

  // light theme with another accent, for "make it yours"
  await theme('light', '#5b9cf5'); await wait(250);
  await shot('tasks-light');
};
