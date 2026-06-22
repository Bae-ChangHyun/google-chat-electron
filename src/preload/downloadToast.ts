import {ipcRenderer} from 'electron';

// In-app download toasts (bottom-right overlay), driven by the downloads feature
// in the main process. Built with pure CSSOM (no inline-style HTML) so the page's
// Content-Security-Policy can't strip the styling. Independent of the OS daemon.
const CONTAINER_ID = 'gce-download-toasts';

type Toast = {el: HTMLElement; ic: HTMLElement; name: HTMLElement; pct: HTMLElement; bar: HTMLElement};
const toasts = new Map<string, Toast>();

let currentPosition = 'top-right';

const style = (el: HTMLElement, props: Record<string, string>) => {
  for (const [k, v] of Object.entries(props)) {
    el.style.setProperty(k, v);
  }
};

const applyPosition = (container: HTMLElement) => {
  const [vertical, horizontal] = currentPosition.split('-');
  for (const side of ['top', 'bottom', 'left', 'right']) {
    container.style.removeProperty(side);
  }
  container.style.setProperty(vertical, '16px');
  container.style.setProperty(horizontal, '16px');
  // Stack new toasts away from the anchored edge.
  container.style.setProperty('flex-direction', vertical === 'bottom' ? 'column-reverse' : 'column');
};

const ensureContainer = (): HTMLElement => {
  let container = document.getElementById(CONTAINER_ID);
  if (!container) {
    container = document.createElement('div');
    container.id = CONTAINER_ID;
    style(container, {
      position: 'fixed', 'z-index': '2147483647',
      display: 'flex', gap: '8px', 'pointer-events': 'none',
      'font-family': 'Roboto, Arial, sans-serif',
    });
    (document.body || document.documentElement).appendChild(container);
  }
  applyPosition(container);
  return container;
};

const makeToast = (filename: string): Toast => {
  const el = document.createElement('div');
  style(el, {
    'pointer-events': 'auto', 'min-width': '320px', 'max-width': '460px',
    background: '#35373b', color: '#f1f3f4', 'border-radius': '10px',
    'border-left': '5px solid #8ab4f8', border: '1px solid rgba(255,255,255,.12)',
    'box-shadow': '0 8px 24px rgba(0,0,0,.55)', padding: '14px 16px',
    'font-size': '15px', transition: 'opacity .3s', opacity: '1',
  });
  el.style.setProperty('border-left', '5px solid #8ab4f8'); // keep accent after the border shorthand

  const row = document.createElement('div');
  style(row, {display: 'flex', 'align-items': 'center', gap: '10px'});
  const ic = document.createElement('span');
  ic.textContent = '⬇️';
  style(ic, {'font-size': '22px', 'line-height': '1'});
  const name = document.createElement('span');
  name.textContent = filename;
  style(name, {flex: '1', overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap', 'font-weight': '500'});
  const pct = document.createElement('span');
  style(pct, {opacity: '.75', 'font-variant-numeric': 'tabular-nums'});
  row.append(ic, name, pct);

  const barBg = document.createElement('div');
  style(barBg, {height: '5px', background: '#5f6368', 'border-radius': '3px', 'margin-top': '10px', overflow: 'hidden'});
  const bar = document.createElement('div');
  style(bar, {height: '100%', width: '0', background: '#8ab4f8', transition: 'width .15s'});
  barBg.appendChild(bar);

  el.append(row, barBg);
  ensureContainer().appendChild(el);
  return {el, ic, name, pct, bar};
};

const getToast = (filename: string): Toast => {
  let t = toasts.get(filename);
  if (!t) {
    t = makeToast(filename);
    toasts.set(filename, t);
  }
  return t;
};

const dismiss = (filename: string, delay: number) => {
  const t = toasts.get(filename);
  if (!t) {
    return;
  }
  setTimeout(() => {
    t.el.style.opacity = '0';
    setTimeout(() => t.el.remove(), 300);
    toasts.delete(filename);
  }, delay);
};

const guard = (fn: () => void) => {
  try {
    fn();
  } catch (err) {
    console.error('[downloadToast]', err);
  }
};

const PENDING = '__pending__';

// Fired the instant the download button is clicked (before the server responds).
ipcRenderer.on('download:pending', (_event, {position}) => {
  guard(() => {
    if (position) {
      currentPosition = position;
    }
    const t = getToast(PENDING);
    t.ic.textContent = '⬇️';
    t.name.textContent = '다운로드 준비 중…';
    t.pct.textContent = '…';
    t.bar.style.width = '15%';
  });
});

ipcRenderer.on('download:start', (_event, {filename, position}) => {
  guard(() => {
    if (position) {
      currentPosition = position;
    }
    // Reuse the pending toast (instant feedback) as the real one if present.
    const pending = toasts.get(PENDING);
    if (pending) {
      toasts.delete(PENDING);
      toasts.set(filename, pending);
      pending.name.textContent = filename;
      pending.pct.textContent = '';
      pending.bar.style.width = '0';
    } else {
      getToast(filename);
    }
  });
});

// Live preview when the toast position is changed in Preferences.
ipcRenderer.on('toast:preview', (_event, {position}) => {
  guard(() => {
    if (position) {
      currentPosition = position;
    }
    const name = '__preview__';
    const t = getToast(name);
    t.ic.textContent = '📍';
    t.name.textContent = 'Download toasts appear here';
    t.pct.textContent = '';
    t.bar.style.width = '100%';
    dismiss(name, 1800);
  });
});

ipcRenderer.on('download:progress', (_event, {filename, percent}) => {
  guard(() => {
    const t = toasts.get(filename);
    if (!t) {
      return;
    }
    if (percent >= 0) {
      t.bar.style.width = `${percent}%`;
      t.pct.textContent = `${percent}%`;
    } else {
      t.bar.style.width = '100%';
      t.pct.textContent = '…';
    }
  });
});

ipcRenderer.on('download:done', (_event, {filename, savePath}) => {
  guard(() => {
    const t = getToast(filename);
    t.ic.textContent = '✅';
    t.pct.textContent = '열기';
    t.pct.style.setProperty('color', '#8ab4f8');
    t.pct.style.setProperty('font-weight', '600');
    t.pct.style.setProperty('opacity', '1');
    t.bar.style.width = '100%';
    t.el.style.cursor = 'pointer';
    t.el.title = '파일 열기';
    t.el.onclick = () => ipcRenderer.send('open-download', savePath);
    dismiss(filename, 6000);
  });
});

ipcRenderer.on('download:failed', (_event, {filename}) => {
  guard(() => {
    const t = getToast(filename);
    t.ic.textContent = '⚠️';
    t.pct.textContent = 'Failed';
    t.bar.style.background = '#f28b82';
    dismiss(filename, 6000);
  });
});
