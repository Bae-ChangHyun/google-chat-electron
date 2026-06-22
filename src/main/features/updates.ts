import {BrowserWindow, app, dialog, shell} from 'electron';
import {spawn} from 'child_process';
import https from 'https';
import fs from 'fs';
import os from 'os';
import path from 'path';
import log from 'electron-log';
import store from '../config.js';

const REPO = 'Bae-ChangHyun/google-chat-electron';

// Progress feedback for the update, reusing the in-app toast overlay.
const toast = (
  window: BrowserWindow,
  payload: {text: string; percent?: number; state?: 'download' | 'install' | 'done' | 'error'},
) => {
  if (!window.isDestroyed()) {
    window.webContents.send('update:toast', {
      position: String(store.get('app.toastPosition') ?? 'top-right'),
      ...payload,
    });
  }
};

type Release = {tag: string; version: string; notesUrl: string; debUrl: string | null};

// Minimal semver-ish compare on the leading x.y.z (ignores any -suffix).
const toParts = (v: string): number[] =>
  v.replace(/^v/, '').split('-')[0].split('.').map((n) => Number(n) || 0);

const isNewer = (latest: string, current: string): boolean => {
  const a = toParts(latest);
  const b = toParts(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff !== 0) {
      return diff > 0;
    }
  }
  return false;
};

const httpsGet = (url: string): Promise<{status: number; headers: any; body: Buffer}> =>
  new Promise((resolve, reject) => {
    https
      .get(url, {headers: {'User-Agent': 'google-chat-electron-updater'}}, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({status: res.statusCode || 0, headers: res.headers, body: Buffer.concat(chunks)}));
      })
      .on('error', reject);
  });

// Follow redirects (GitHub asset URLs 302 to objects.githubusercontent.com).
const download = (url: string, dest: string, onProgress: (percent: number) => void, hops = 0): Promise<void> =>
  new Promise((resolve, reject) => {
    if (hops > 5) {
      reject(new Error('too many redirects'));
      return;
    }
    https
      .get(url, {headers: {'User-Agent': 'google-chat-electron-updater'}}, (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          download(res.headers.location, dest, onProgress, hops + 1).then(resolve, reject);
          return;
        }
        if (status !== 200) {
          res.resume();
          reject(new Error(`download failed: HTTP ${status}`));
          return;
        }
        const total = Number(res.headers['content-length'] || 0);
        let received = 0;
        const file = fs.createWriteStream(dest);
        res.on('data', (chunk) => {
          received += chunk.length;
          if (total) {
            onProgress(Math.round((received / total) * 100));
          }
        });
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
        file.on('error', reject);
        res.on('error', reject);
      })
      .on('error', reject);
  });

const fetchLatest = async (): Promise<Release | null> => {
  const res = await httpsGet(`https://api.github.com/repos/${REPO}/releases/latest`);
  if (res.status !== 200) {
    log.error(`update check: HTTP ${res.status}`);
    return null;
  }
  const data = JSON.parse(res.body.toString('utf8'));
  const asset = (data.assets || []).find((a: any) => String(a.name).endsWith('.deb'));
  return {
    tag: data.tag_name,
    version: data.tag_name,
    notesUrl: data.html_url,
    debUrl: asset ? asset.browser_download_url : null,
  };
};

const installDeb = async (window: BrowserWindow, release: Release) => {
  if (!release.debUrl) {
    shell.openExternal(release.notesUrl);
    return;
  }
  const dest = path.join(os.tmpdir(), `google-chat-electron-${release.version}.deb`);
  try {
    toast(window, {text: `Downloading ${release.version}…`, percent: 0, state: 'download'});
    await download(release.debUrl, dest, (percent) => toast(window, {text: `Downloading ${release.version}…`, percent, state: 'download'}));
  } catch (err) {
    log.error(`update download failed: ${(err as Error).message}`);
    toast(window, {text: 'Update download failed', state: 'error'});
    dialog.showMessageBox(window, {type: 'error', message: 'Download failed', detail: String(err)});
    shell.openExternal(release.notesUrl);
    return;
  }

  // pkexec shows a graphical password prompt (polkit).
  toast(window, {text: 'Installing… (enter password)', state: 'install'});
  const child = spawn('pkexec', ['apt-get', 'install', '-y', dest], {stdio: 'ignore'});
  child.on('error', () => {
    toast(window, {text: 'Could not start installer', state: 'error'});
    dialog.showMessageBox(window, {
      type: 'info',
      message: 'Could not start the installer',
      detail: `Install it manually:\n\n  sudo apt install ${dest}`,
    });
  });
  child.on('exit', (code) => {
    if (code === 0) {
      toast(window, {text: `Updated to ${release.version}`, state: 'done'});
      dialog
        .showMessageBox(window, {
          type: 'info',
          message: `Updated to ${release.version}`,
          detail: 'Restart now to use the new version.',
          buttons: ['Restart', 'Later'],
          defaultId: 0,
        })
        .then(({response}) => {
          if (response === 0) {
            app.relaunch();
            app.exit();
          }
        });
    } else if (code !== 126 && code !== 127) {
      // 126/127 = user dismissed the polkit prompt; stay quiet then.
      toast(window, {text: 'Update failed', state: 'error'});
      dialog.showMessageBox(window, {type: 'error', message: 'Update failed', detail: `Installer exited with code ${code}.`});
    }
  });
};

export const checkForUpdates = async (window: BrowserWindow, silent: boolean) => {
  let release: Release | null = null;
  try {
    release = await fetchLatest();
  } catch (err) {
    log.error(`update check failed: ${(err as Error).message}`);
  }

  if (!release) {
    if (!silent) {
      dialog.showMessageBox(window, {type: 'warning', message: 'Could not check for updates', detail: 'Please try again later.'});
    }
    return;
  }

  if (!isNewer(release.version, app.getVersion())) {
    if (!silent) {
      dialog.showMessageBox(window, {type: 'info', message: "You're up to date", detail: `Current version: ${app.getVersion()}`});
    }
    return;
  }

  const {response} = await dialog.showMessageBox(window, {
    type: 'info',
    message: `Update available: ${release.version}`,
    detail: `You have ${app.getVersion()}. Update now?`,
    buttons: ['Update now', 'Release notes', 'Later'],
    defaultId: 0,
    cancelId: 2,
  });
  if (response === 0) {
    installDeb(window, release);
  } else if (response === 1) {
    shell.openExternal(release.notesUrl);
  }
};

// Silent check shortly after launch.
export default (window: BrowserWindow) => {
  setTimeout(() => checkForUpdates(window, true), 8000);
};
