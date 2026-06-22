import {BrowserWindow, app, dialog, ipcMain, shell} from 'electron';
import {spawn} from 'child_process';
import https from 'https';
import fs from 'fs';
import os from 'os';
import path from 'path';
import log from 'electron-log';
import store from '../config.js';

const REPO = 'Bae-ChangHyun/google-chat-electron';

// Self-contained admin password prompt — shown by the app itself so it never
// depends on a polkit agent being reachable (which breaks for relaunched apps).
const askPassword = (parent: BrowserWindow, errorText = ''): Promise<string | null> =>
  new Promise((resolve) => {
    const win = new BrowserWindow({
      parent,
      modal: true,
      width: 400,
      height: 210,
      resizable: false,
      minimizable: false,
      maximizable: false,
      title: 'Authentication required',
      webPreferences: {nodeIntegration: true, contextIsolation: false},
    });
    win.setMenuBarVisibility(false);

    const html = `<!doctype html><html><body style="margin:0;font-family:sans-serif;background:#2b2b2b;color:#eee;padding:20px">
      <div style="font-size:14px;margin-bottom:6px">Enter your password to install the update</div>
      <div style="font-size:12px;opacity:.6;margin-bottom:14px">(sudo)</div>
      <input id="pw" type="password" autofocus style="width:100%;box-sizing:border-box;padding:8px;font-size:14px;border-radius:6px;border:1px solid #555;background:#1e1e1e;color:#fff">
      <div id="err" style="color:#f28b82;font-size:12px;height:16px;margin-top:6px">${errorText}</div>
      <div style="text-align:right;margin-top:10px">
        <button id="cancel" style="padding:7px 14px;margin-right:6px">Cancel</button>
        <button id="ok" style="padding:7px 14px;background:#8ab4f8;border:none;border-radius:6px">OK</button>
      </div>
      <script>
        const {ipcRenderer}=require('electron');
        const pw=document.getElementById('pw');
        const ok=()=>ipcRenderer.send('askpw:done',pw.value);
        document.getElementById('ok').onclick=ok;
        document.getElementById('cancel').onclick=()=>ipcRenderer.send('askpw:done',null);
        pw.addEventListener('keydown',e=>{if(e.key==='Enter')ok();if(e.key==='Escape')ipcRenderer.send('askpw:done',null)});
        ipcRenderer.on('askpw:error',(_e,m)=>{document.getElementById('err').textContent=m;pw.value='';pw.focus()});
      </script></body></html>`;
    const htmlPath = path.join(os.tmpdir(), 'gce-askpass.html');
    fs.writeFileSync(htmlPath, html);
    win.loadFile(htmlPath);

    let done = false;
    const finish = (value: string | null) => {
      if (done) {
        return;
      }
      done = true;
      ipcMain.removeListener('askpw:done', onDone);
      if (!win.isDestroyed()) {
        win.close();
      }
      resolve(value);
    };
    const onDone = (event: Electron.IpcMainEvent, value: string | null) => {
      if (event.sender === win.webContents) {
        finish(value);
      }
    };
    ipcMain.on('askpw:done', onDone);
    win.on('closed', () => finish(null));
  });

// Install the .deb with sudo, feeding the password via stdin. Resolves true on
// success, false on wrong password, throws on other failures.
const sudoInstall = (deb: string, password: string): Promise<boolean> =>
  new Promise((resolve, reject) => {
    const child = spawn('sudo', ['-S', '-k', '-p', '', 'apt-get', 'install', '-y', deb]);
    let stderr = '';
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(true);
      } else if (/incorrect password|try again|sorry/i.test(stderr)) {
        resolve(false); // wrong password
      } else {
        reject(new Error(stderr.trim() || `apt-get exited with code ${code}`));
      }
    });
    child.stdin.write(password + '\n');
    child.stdin.end();
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

  // Show our own password prompt and install with sudo (up to 3 attempts), so
  // it never depends on a polkit agent being reachable.
  let errorText = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const password = await askPassword(window, errorText);
    if (password === null) {
      toast(window, {text: 'Update cancelled', state: 'error'});
      return;
    }

    toast(window, {text: `Installing ${release.version}…`, state: 'install'});
    let ok: boolean;
    try {
      ok = await sudoInstall(dest, password);
    } catch (err) {
      manualFallback(`sudo install failed: ${(err as Error).message}`);
      return;
    }

    if (ok) {
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
      return;
    }

    errorText = 'Incorrect password, try again';
  }

  manualFallback('incorrect password (3 attempts)');
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
