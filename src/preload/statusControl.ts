import {ipcRenderer} from 'electron';

// Google Chat exposes no API to set/read presence, so we drive its own status
// menu and read the trigger's label. Anchors captured from the live DOM:
//   trigger button : aria-label starts with "상태:" / "Status:" (jscontroller ZRyv4d)
//   menu items     : 자동(Automatic)=pms6R, 부재중(Away)=PCKjx, 방해 금지(DND)=wJfO6e
const TRIGGER_SELECTORS = [
  '[role="button"][aria-label^="상태:"]',
  '[role="button"][aria-label^="Status:"]',
  '[jscontroller="ZRyv4d"][role="button"]',
];

const findTrigger = (): HTMLElement | null => {
  for (const selector of TRIGGER_SELECTORS) {
    const el = document.querySelector<HTMLElement>(selector);
    if (el) {
      return el;
    }
  }
  return null;
};

// Poll briefly for the menu item to render after the menu opens, then click it.
const clickItemWhenReady = (jsname: string, attempt = 0): void => {
  const item = document.querySelector<HTMLElement>(`[jsname="${jsname}"]`);
  if (item) {
    item.click();
    return;
  }
  if (attempt < 20) {
    setTimeout(() => clickItemWhenReady(jsname, attempt + 1), 50); // up to ~1s
  }
};

ipcRenderer.on('set-status', (_event, jsname: string) => {
  // Menu already open → click the item directly (clicking the trigger would toggle it shut).
  const open = document.querySelector<HTMLElement>(`[jsname="${jsname}"]`);
  if (open) {
    open.click();
    return;
  }

  const trigger = findTrigger();
  if (!trigger) {
    return;
  }
  trigger.click(); // open the status menu
  clickItemWhenReady(jsname);
});

// --- Report the current presence back to the tray menu -----------------------

type Presence = 'active' | 'away' | 'dnd' | 'unknown';

const readPresence = (): Presence => {
  const label = findTrigger()?.getAttribute('aria-label') || '';
  if (label.includes('방해 금지') || /do not disturb/i.test(label)) {
    return 'dnd';
  }
  if (label.includes('부재중') || /away/i.test(label)) {
    return 'away';
  }
  if (label.includes('활동 중') || /active/i.test(label)) {
    return 'active';
  }
  return 'unknown';
};

let lastReported: Presence | '' = '';
const emitPresence = () => {
  const presence = readPresence();
  if (presence !== 'unknown' && presence !== lastReported) {
    lastReported = presence;
    ipcRenderer.send('status-changed', presence);
  }
};

let pollTimer: ReturnType<typeof setInterval> | undefined;
window.addEventListener('DOMContentLoaded', () => {
  if (pollTimer) {
    clearInterval(pollTimer);
  }
  pollTimer = setInterval(() => {
    if (document.hidden) {
      return; // skip DOM polling while the window isn't visible
    }
    emitPresence();
  }, 2000);
});
