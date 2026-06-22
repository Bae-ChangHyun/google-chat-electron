import {ipcRenderer} from 'electron';

// In-app download toasts (bottom-right overlay), driven by the downloads feature
// in the main process. Independent of the OS notification daemon.
const CONTAINER_ID = 'gce-download-toasts';
const toasts = new Map<string, HTMLElement>();

const ensureContainer = (): HTMLElement => {
  let container = document.getElementById(CONTAINER_ID);
  if (!container) {
    container = document.createElement('div');
    container.id = CONTAINER_ID;
    Object.assign(container.style, {
      position: 'fixed',
      right: '16px',
      bottom: '16px',
      zIndex: '2147483647',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      pointerEvents: 'none',
      fontFamily: 'Roboto, Arial, sans-serif',
    });
    document.body.appendChild(container);
  }
  return container;
};

const makeToast = (filename: string): HTMLElement => {
  const el = document.createElement('div');
  Object.assign(el.style, {
    pointerEvents: 'auto',
    minWidth: '240px',
    maxWidth: '340px',
    background: '#202124',
    color: '#e8eaed',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,.4)',
    padding: '10px 12px',
    fontSize: '13px',
    transition: 'opacity .3s',
    opacity: '1',
  });
  el.innerHTML =
    '<div style="display:flex;align-items:center;gap:8px;">' +
    '<span class="gce-ic" style="font-size:15px;">⬇️</span>' +
    '<span class="gce-name" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>' +
    '<span class="gce-pct" style="opacity:.7;font-variant-numeric:tabular-nums;"></span>' +
    '</div>' +
    '<div style="height:3px;background:#5f6368;border-radius:2px;margin-top:8px;overflow:hidden;">' +
    '<div class="gce-bar" style="height:100%;width:0;background:#8ab4f8;transition:width .15s;"></div>' +
    '</div>';
  (el.querySelector('.gce-name') as HTMLElement).textContent = filename;
  ensureContainer().appendChild(el);
  return el;
};

const getToast = (filename: string): HTMLElement => {
  let el = toasts.get(filename);
  if (!el) {
    el = makeToast(filename);
    toasts.set(filename, el);
  }
  return el;
};

const dismiss = (filename: string, delay: number) => {
  const el = toasts.get(filename);
  if (!el) {
    return;
  }
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
    toasts.delete(filename);
  }, delay);
};

ipcRenderer.on('download:start', (_event, {filename}) => {
  getToast(filename);
});

ipcRenderer.on('download:progress', (_event, {filename, percent}) => {
  const el = toasts.get(filename);
  if (!el) {
    return;
  }
  const bar = el.querySelector('.gce-bar') as HTMLElement;
  const pct = el.querySelector('.gce-pct') as HTMLElement;
  if (percent >= 0) {
    bar.style.width = `${percent}%`;
    pct.textContent = `${percent}%`;
  } else {
    bar.style.width = '100%';
    pct.textContent = '…';
  }
});

ipcRenderer.on('download:done', (_event, {filename, savePath}) => {
  const el = getToast(filename);
  (el.querySelector('.gce-ic') as HTMLElement).textContent = '✅';
  (el.querySelector('.gce-pct') as HTMLElement).textContent = 'Done';
  (el.querySelector('.gce-bar') as HTMLElement).style.width = '100%';
  el.style.cursor = 'pointer';
  el.title = 'Open containing folder';
  el.onclick = () => ipcRenderer.send('open-download', savePath);
  dismiss(filename, 6000);
});

ipcRenderer.on('download:failed', (_event, {filename}) => {
  const el = getToast(filename);
  (el.querySelector('.gce-ic') as HTMLElement).textContent = '⚠️';
  (el.querySelector('.gce-pct') as HTMLElement).textContent = 'Failed';
  (el.querySelector('.gce-bar') as HTMLElement).style.background = '#f28b82';
  dismiss(filename, 6000);
});
