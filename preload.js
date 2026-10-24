const { contextBridge, ipcRenderer } = require('electron');

const send = (ch) => (...a) => ipcRenderer.send(ch, ...a);
const invoke = (ch) => (...a) => ipcRenderer.invoke(ch, ...a);

contextBridge.exposeInMainWorld('app', {
  load: () => ipcRenderer.sendSync('load'),
  save: send('save'),
  hide: send('hide'),
  quit: send('quit'),
  update: send('update'),
  busy: send('busy'),
  peekHeight: send('peek-height'),
  expand: send('expand'),
  collapse: send('collapse'),
  tooltip: send('tooltip'),
  openData: send('open-data'),
  getState: invoke('get-state'),
  setPrefs: invoke('set-prefs'),
  pin: invoke('pin'),
  autostart: invoke('autostart'),
  exportData: invoke('export'),
  importData: invoke('import'),
  alarm: (title, body) => ipcRenderer.send('alarm', { title, body }),
  alarmAck: send('alarm-ack'),
  clips: {
    get: invoke('clips:get'),
    copy: send('clips:copy'),
    remove: send('clips:delete'),
    move: send('clips:move'),
    addFolder: invoke('clips:folder-add'),
    renameFolder: send('clips:folder-rename'),
    deleteFolder: send('clips:folder-delete'),
    pause: send('clips:pause'),
    clear: send('clips:clear'),
  },
  on: (ch, fn) => ipcRenderer.on(ch, (_, v) => fn(v)),
});
