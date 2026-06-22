import path from 'path';
import {app, BrowserWindow, Menu, nativeImage, Tray, ipcMain} from 'electron';

type Presence = 'active' | 'away' | 'dnd' | 'unknown';

export default (window: BrowserWindow) => {
  const size = 32;
  const trayIcon = new Tray(nativeImage.createFromPath(path.join(app.getAppPath(), `resources/icons/offline/${size}.png`)));

  const handleIconClick = () => {
    const shouldHide = (window.isVisible() && window.isFocused());

    if (shouldHide) {
      window.hide()
    } else {
      window.show()
    }
  }

  const handleIconDoubleClick = () => {
    window.show();
    window.focus();
  }

  // Drives Google Chat's own status menu via the preload (set-status). jsname
  // anchors: Automatic=pms6R, Away=PCKjx, Do not disturb=wJfO6e.
  const setStatus = (jsname: string) => window.webContents.send('set-status', jsname);

  // Current presence, reported by the preload from Chat's own status label.
  let presence: Presence = 'unknown';
  const presenceLabel: Record<Presence, string> = {
    active: 'Active',
    away: 'Away',
    dnd: 'Do not disturb',
    unknown: '',
  };

  const buildMenu = () => {
    trayIcon.setContextMenu(Menu.buildFromTemplate([
      {
        label: 'Toggle',
        click: handleIconClick
      },
      {
        label: 'Status',
        submenu: [
          {label: 'Active (Automatic)', type: 'radio', checked: presence === 'active', click: () => setStatus('pms6R')},
          {label: 'Away', type: 'radio', checked: presence === 'away', click: () => setStatus('PCKjx')},
          {label: 'Do not disturb', type: 'radio', checked: presence === 'dnd', click: () => setStatus('wJfO6e')},
        ]
      },
      {
        type: 'separator'
      },
      {
        label: 'Quit',
        click: () => {
          // The running webpage can prevent the app from quiting via window.onbeforeunload handler
          // So lets use exit() instead of quit()
          app.exit()
        }
      }
    ]));

    const label = presenceLabel[presence];
    trayIcon.setToolTip(label ? `Google Chat — ${label}` : 'Google Chat');
  };

  ipcMain.on('status-changed', (_event, next: Presence) => {
    if (next !== presence) {
      presence = next;
      buildMenu();
    }
  });

  buildMenu();
  trayIcon.on('click', handleIconClick);
  trayIcon.on('double-click', handleIconDoubleClick);

  return trayIcon;
}
