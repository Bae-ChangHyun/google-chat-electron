import {BrowserWindow, app, dialog, shell} from 'electron';
import {spawn} from 'child_process';
import https from 'https';
import fs from 'fs';
import os from 'os';
import path from 'path';
import log from 'electron-log';
import store from '../config.js';

const REPO = 'Bae-ChangHyun/google-chat-electron';

// Install a local .deb via PackageKit (pkcon). PackageKit performs the
// privileged work in its system daemon and shows the native polkit password
// prompt, so this works even when the app runs with no_new_privs set — which
// blocks SUID helpers like sudo and pkexec (the case for relaunched apps).
const pkconInstall = (deb: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn('pkcon', ['install-local', '-y', '--allow-reinstall', deb]);
    let output = '';
    child.stdout.on('data', (d) => {
      output += d.toString();
    });
    child.stderr.on('data', (d) => {
      output += d.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      // pkcon returns 0 even when authentication is dismissed/fails, so the
      // output has to be inspected too.
      if (code === 0 && !/failed to obtain authentication|fatal error|not authorized/i.test(output)) {
        resolve();
      } else if (/failed to obtain authentication|not authorized/i.test(output)) {
        reject(new Error('authentication cancelled or failed'));
      } else {
        reject(new Error(output.trim() || `pkcon exited with code ${code}`));
      }
    });
  });

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
    const req = https.get(url, {headers: {'User-Agent': 'google-chat-electron-updater'}}, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({status: res.statusCode || 0, headers: res.headers, body: Buffer.concat(chunks)}));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('request timed out')));
  });

// Follow redirects (GitHub asset URLs 302 to objects.githubusercontent.com).
const download = (url: string, dest: string, onProgress: (percent: number) => void, hops = 0): Promise<void> =>
  new Promise((resolve, reject) => {
    if (hops > 5) {
      reject(new Error('too many redirects'));
      return;
    }
    const req = https.get(url, {headers: {'User-Agent': 'google-chat-electron-updater'}}, (res) => {
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
    });
    req.on('error', reject);
    req.setTimeout(60000, () => req.destroy(new Error('download timed out')));
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

  // Offer a manual path when the one-click install can't complete (no polkit
  // prompt, dismissed auth, etc.) so the user is never left stuck.
  const manualFallback = (reason: string) => {
    log.error(`update install fallback: ${reason}`);
    toast(window, {text: 'Manual install needed', state: 'error'});
    dialog
      .showMessageBox(window, {
        type: 'warning',
        message: 'Finish the update manually',
        detail:
          `The update was downloaded but couldn't be installed automatically.\n\n` +
          `Open the package to install it, or run:\n  sudo apt install ${dest}`,
        buttons: ['Open package', 'Show in folder', 'Close'],
        defaultId: 0,
        cancelId: 2,
      })
      .then(({response}) => {
        if (response === 0) {
          shell.openPath(dest);
        } else if (response === 1) {
          shell.showItemInFolder(dest);
        }
      });
  };

  // Install via PackageKit — shows the native password prompt and isn't blocked
  // by no_new_privs. (sudo/pkexec fail on relaunched apps; see pkconInstall.)
  toast(window, {text: `Installing ${release.version}…`, state: 'install'});
  try {
    await pkconInstall(dest);
  } catch (err) {
    manualFallback(`install failed: ${(err as Error).message}`);
    return;
  }

  toast(window, {text: `Updated to ${release.version}`, state: 'done'});
  const {response} = await dialog.showMessageBox(window, {
    type: 'info',
    message: `Updated to ${release.version}`,
    detail: 'Restart now to use the new version.',
    buttons: ['Restart', 'Later'],
    defaultId: 0,
  });
  if (response === 0) {
    app.relaunch();
    app.exit();
  }
};

// Guards against overlapping update flows (e.g. the startup check firing while a
// download is already running, which would stack a second "Update available").
let busy = false;

export const checkForUpdates = async (window: BrowserWindow, silent: boolean) => {
  if (busy) {
    if (!silent) {
      dialog.showMessageBox(window, {type: 'info', message: 'An update is already in progress'});
    }
    return;
  }
  busy = true;
  try {
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
      await installDeb(window, release);
    } else if (response === 1) {
      shell.openExternal(release.notesUrl);
    }
  } finally {
    busy = false;
  }
};

// Silent check shortly after launch.
export default (window: BrowserWindow) => {
  setTimeout(() => checkForUpdates(window, true), 8000);
};
