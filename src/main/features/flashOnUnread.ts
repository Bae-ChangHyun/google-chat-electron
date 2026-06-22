import {BrowserWindow, ipcMain} from 'electron';

// Flash the taskbar / dock entry (sets the window's "demands attention" hint on
// Linux) when the unread count goes up while the window isn't focused, so a new
// message grabs attention without stealing focus. Cleared once focused or read.
export default (window: BrowserWindow) => {
  let previous = 0;

  ipcMain.on('unreadCount', (_event, count: number) => {
    const current = Number(count) || 0;

    if (current > previous && !window.isFocused()) {
      window.flashFrame(true);
    }
    if (current === 0) {
      window.flashFrame(false);
    }

    previous = current;
  });

  window.on('focus', () => window.flashFrame(false));
};
