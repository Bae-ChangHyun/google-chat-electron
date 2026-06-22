import {BrowserWindow, dialog, HandlerDetails, shell} from 'electron';
import log from "electron-log";

let guardAgainstExternalLinks = true;
const RE_GUARD_IN_MINUTES = 5;
let interval: NodeJS.Timeout;

const ACTION_DENIED = {
  action: 'deny'
}

const ACTION_ALLOWED = {
  action: 'allow'
}

export default (window: BrowserWindow) => {
  const handleRedirect = (details: HandlerDetails): any => {
    const url = details.url

    if (!isValidHttpURL(url)) {
      return ACTION_DENIED;
    }

    if (!guardAgainstExternalLinks) {
      return ACTION_ALLOWED;
    }

    const host = extractHostname(url);
    const currentHost = extractHostname(window.webContents.getURL());

    // OAuth / login flows genuinely need a real popup window.
    const authHosts = ['accounts.google.com', 'accounts.youtube.com'];
    if (authHosts.includes(host)) {
      return ACTION_ALLOWED;
    }

    // Attachment downloads: pull them in-app (Downloads folder) instead of
    // bouncing the URL to the system browser. Account-agnostic (/u/<n>/).
    const isDownloadUrl = /:\/\/chat\.google\.com\/u\/\d+\/api\/get_attachment_url/.test(url);
    if (isDownloadUrl) {
      window.webContents.downloadURL(url);
      return ACTION_DENIED;
    }

    // In-app Chat links — including notification deep-links opened via the
    // service worker's clients.openWindow() — navigate the existing window
    // instead of spawning a new one, so clicking a notification jumps to the
    // right conversation in the main window.
    const isChatUrl = host === 'chat.google.com' ||
      (host === 'mail.google.com' && url.startsWith('https://mail.google.com/chat')) ||
      host === currentHost;

    if (isChatUrl) {
      window.webContents.loadURL(url);
      if (!window.isVisible()) {
        window.show();
      }
      window.focus();
      return ACTION_DENIED;
    }

    // Everything else (Gmail proper, Meet, Drive, external sites) → system browser.
    setImmediate(() => {
      shell.openExternal(url);
    });

    return ACTION_DENIED;
  };

  window.webContents.setWindowOpenHandler(handleRedirect);
}

function extractHostname(url: string) {
  return (new URL(url)).hostname;
}

// https://stackoverflow.com/questions/5717093
function isValidHttpURL(input: string) {
  let url;

  try {
    url = new URL(input);
  } catch (error: any) {
    return false;
  }

  return url.protocol === "http:" || url.protocol === "https:";
}

const toggleExternalLinksGuard = (window: BrowserWindow) => {
  const actionLabel = guardAgainstExternalLinks ? 'Disable' : 'Enable';

  dialog.showMessageBox(window, {
    type: 'warning',
    title: 'Confirm',
    message: 'Facing issues during authentication?',
    detail: `You can disable the external links security feature temporarily.\nDont forget to enable it back.\nIf you don't, it will be enabled automatically in ${RE_GUARD_IN_MINUTES} minutes.`,
    buttons: [`${actionLabel} Guard`, 'Close'],
    cancelId: 1,
    defaultId: 1,
  })
    .then(({response}) => {
      if (response === 0) {
        guardAgainstExternalLinks = !guardAgainstExternalLinks;

        stopReGuardTimer();

        if (!guardAgainstExternalLinks) {
          startReGuardTimer()
        }

        logGuardStatus();
      }
    })
}

const logGuardStatus = () => {
  log.debug(`External links guard is set to: ${guardAgainstExternalLinks}`)
}

const stopReGuardTimer = () => {
  clearInterval(interval);
}

const startReGuardTimer = () => {
  interval = setInterval(() => {
    guardAgainstExternalLinks = true;
    logGuardStatus();
  }, 1000 * 60 * RE_GUARD_IN_MINUTES)
}

export {toggleExternalLinksGuard}
