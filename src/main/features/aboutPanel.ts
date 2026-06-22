import {app, dialog, nativeImage, clipboard, BrowserWindow} from 'electron';
import path from 'path';
import os from 'os';
import {checkForUpdates} from './updates.js';

// The default Electron AboutWindow does not load app icon from asar
// So let's create a custom dialog instead
export default (window: BrowserWindow) => {
  const detail = getDetails();

  detail.unshift(`Developed by - zviryatko (original project by ankurk91)\n`)
  detail.push(`\nLicensed under - GNU GPLv3`)

  return dialog.showMessageBox(window, {
    type: 'info',
    title: 'About',
    message: `Google Chat — v${app.getVersion()}`,
    detail: "Unofficial desktop app for Google Chat.\n\n" + detail.join('\n'),
    buttons: ['Check for Updates', 'Copy', 'Ok'],
    cancelId: 2,
    defaultId: 2,
    icon: nativeImage.createFromPath(path.join(app.getAppPath(), 'resources/icons/normal/64.png'))
  })
    .then(({response}) => {
      if (response === 0) {
        checkForUpdates(window, false)
      } else if (response === 1) {
        clipboard.writeText(getDetails().join('\n'))
      }
    })
}

const getDetails = () => {
  return [
    'App Version: ' + app.getVersion(),
    'Electron version: ' + process.versions.electron,
    'Chrome version: ' + process.versions.chrome,
    'Platform: ' + [os.type(), os.release(), os.arch()].join(', '),
    'OS: ' + os.version(),
    'Locale: ' + app.getLocale()
  ]
}
