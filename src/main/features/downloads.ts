import {BrowserWindow, Notification, app, nativeImage, shell} from 'electron';
import fs from 'fs';
import path from 'path';
import log from 'electron-log';

const appIcon = () =>
  nativeImage.createFromPath(path.join(app.getAppPath(), 'resources/icons/normal/256.png'));

// Save attachment downloads straight into the OS Downloads folder instead of
// bouncing the URL out to the system browser. Triggered by downloadURL() in
// externalLinks.ts (and by any direct download the page initiates).
export default (window: BrowserWindow) => {
  window.webContents.session.on('will-download', (event, item) => {
    const downloadsDir = app.getPath('downloads');
    const savePath = uniquePath(path.join(downloadsDir, item.getFilename()));
    item.setSavePath(savePath);

    const filename = item.getFilename();
    notifyStart(filename);

    // Reflect progress on the taskbar / dock icon (Unity LauncherEntry on GNOME).
    item.on('updated', (_event, state) => {
      if (state !== 'progressing' || item.isPaused()) {
        return;
      }
      const total = item.getTotalBytes();
      const received = item.getReceivedBytes();
      // -1 renders an indeterminate bar when the size is unknown.
      window.setProgressBar(total > 0 ? received / total : -1);
    });

    item.once('done', (_event, state) => {
      window.setProgressBar(-1); // remove the progress bar
      if (state === 'completed') {
        notifyComplete(filename, savePath);
      } else {
        log.error(`Download failed (${state}): ${filename}`);
        notifyFailed(filename);
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

const notifyStart = (filename: string) => {
  new Notification({
    title: 'Download started',
    body: filename,
    silent: true,
    icon: appIcon(),
  }).show();
};

const notifyComplete = (filename: string, savePath: string) => {
  const notification = new Notification({
    title: 'Download complete',
    body: filename,
    silent: false,
    icon: appIcon(),
  });
  notification.on('click', () => shell.showItemInFolder(savePath));
  notification.show();
};

const notifyFailed = (filename: string) => {
  new Notification({
    title: 'Download failed',
    body: filename,
    silent: false,
    icon: appIcon(),
  }).show();
};
