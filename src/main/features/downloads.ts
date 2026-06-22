import {BrowserWindow, app, ipcMain, shell} from 'electron';
import fs from 'fs';
import path from 'path';
import log from 'electron-log';

// Save attachment downloads into the Downloads folder and surface progress as an
// in-app toast (rendered by the downloadToast preload) — independent of the OS
// notification daemon. Triggered by downloadURL() in externalLinks.ts and by any
// download the page initiates directly.
export default (window: BrowserWindow) => {
  // Renderer asks to reveal a finished file in the file manager.
  ipcMain.on('open-download', (_event, savePath: string) => {
    if (savePath) {
      shell.showItemInFolder(savePath);
    }
  });

  const send = (channel: string, payload: unknown) => {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, payload);
    }
  };

  window.webContents.session.on('will-download', (event, item) => {
    const savePath = uniquePath(path.join(app.getPath('downloads'), item.getFilename()));
    item.setSavePath(savePath);

    const filename = item.getFilename();
    send('download:start', {filename});

    item.on('updated', (_event, state) => {
      if (state !== 'progressing' || item.isPaused()) {
        return;
      }
      const total = item.getTotalBytes();
      const received = item.getReceivedBytes();
      const fraction = total > 0 ? received / total : -1;
      window.setProgressBar(fraction); // taskbar / dock progress
      send('download:progress', {filename, percent: total > 0 ? Math.round(fraction * 100) : -1});
    });

    item.once('done', (_event, state) => {
      window.setProgressBar(-1); // clear the progress bar
      if (state === 'completed') {
        send('download:done', {filename, savePath});
      } else {
        log.error(`Download failed (${state}): ${filename}`);
        send('download:failed', {filename});
      }
    });
  });
};

// Avoid clobbering an existing file: "name.ext" -> "name (1).ext".
const uniquePath = (target: string): string => {
  const dir = path.dirname(target);
  const ext = path.extname(target);
  const base = path.basename(target, ext);

  let candidate = target;
  let counter = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base} (${counter})${ext}`);
    counter++;
  }
  return candidate;
};
