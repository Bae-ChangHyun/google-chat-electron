<div align="center">

# Google Chat Desktop

**An unofficial desktop client for [Google Chat](https://chat.google.com) — a Chromium wrapper with native niceties.**
This fork adds multi-account switching, in-app downloads, notification deep-links, and tray-based presence control.

[![License](https://img.shields.io/badge/License-GPLv3-blue.svg?style=flat-square)](LICENSE.txt)
[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20macOS%20%7C%20Windows-orange?style=flat-square)](#supported-platforms)
[![Built with](https://img.shields.io/badge/Built%20with-Electron%20%2B%20TypeScript-blueviolet?style=flat-square)](https://www.electronjs.org)
[![Fork of](https://img.shields.io/badge/Fork%20of-zviryatko%2Fgoogle--chat--electron-lightgrey?style=flat-square)](https://github.com/zviryatko/google-chat-electron)

</div>

---

> **⚠️ Note**
> This is a **personal, unofficial fork**. It wraps the Google Chat web app in Electron — it is not built or endorsed by Google.
> The features added in this fork (see below) currently ship **from source only**; the prebuilt packages linked under
> *Getting started* are upstream releases and do **not** include them.

---

## About

`google-chat-electron` is a thin desktop shell around the Google Chat web app: it runs a local Chromium instance and
layers OS-level conveniences (system tray, desktop notifications, unread badges) on top of the unchanged web client. It
stores no data of its own.

This repository is a personal fork of [**zviryatko/google-chat-electron**](https://github.com/zviryatko/google-chat-electron)
(itself a fork of [ankurk91/google-chat-electron](https://github.com/ankurk91/google-chat-electron)), kept GPLv3 and
extended with the account, download, and presence features described below.

### 💡 Why this fork

- **Problem**: the upstream wrapper is single-account, bounces file downloads out to the system browser, and offers no
  way to set your Chat status without diving into the web UI.
- **Solution**: this fork handles multiple accounts in one window, downloads attachments in place with progress, and
  exposes presence (Active / Away / Do not disturb) right from the tray.

---

## ✨ Features

Added in this fork:

| Feature | What it does |
| :-- | :-- |
| 👥 **Multiple accounts** | Switch Google accounts (`/u/0`, `/u/1`, …) in the same window. Only accounts you've opened are listed, plus `Add account…`; the last used one is remembered. |
| ⬇️ **In-app download toasts** | Attachments download in-app to your Downloads folder with a live toast (instant feedback, progress, click **열기 / Open**). |
| 📁 **Download folder** | Choose where downloads are saved (Preferences ▸ Set Download Folder). |
| 🔔 **Notification deep-links** | Clicking a notification opens that conversation in the existing window. |
| ✨ **Unread flash** | Taskbar / dock entry flashes on a new message while unfocused. |
| 🟢 **Presence control** | Tray ▸ Status sets Active / Away / Do not disturb and reflects the current status. |
| 🔍 **Zoom memory** | `Ctrl ±` / wheel zoom is remembered across restarts. |
| 🧭 **Toast position** | Pick which corner download toasts appear in. |
| ⬆️ **In-app updates** | Checks GitHub releases and updates with one click (Help ▸ Check for Updates). |

Inherited from upstream: system tray (unread/offline indicator, close-to-tray), desktop notifications, dock unread
counter, auto-start at login, offline auto-retry, external links in your default browser, window-state persistence,
single-instance, and `Ctrl+F` search.

---

## How it works

```
  Google Chat web app   →   Electron (Chromium)   →   Native shell
  (unchanged web client)    preload + main process     tray · notifications · downloads · presence
```

The web app runs untouched inside Chromium. A preload script reads/acts on the page (unread count, favicon, status
menu), and the Electron main process wires those signals to OS features (tray, badges, downloads, window state).

---

## 🚀 Getting started

### Install / update (Linux, `.deb`)

Install — or update an existing install — from the latest [GitHub release](https://github.com/Bae-ChangHyun/google-chat-electron/releases/latest):

```bash
curl -fsSL https://raw.githubusercontent.com/Bae-ChangHyun/google-chat-electron/main/scripts/install.sh | bash
```

The script downloads the latest release's `.deb` and installs it with `apt` (it will prompt for `sudo`).
Re-run the same command any time to update — or use **Help ▸ Check for Updates** inside the app.

<details>
<summary><strong>Already installed the old Snap? Remove it first</strong></summary>

The unofficial Snap (`google-chat-desktop`) is a different package from this `.deb`. Remove it (and its data) so you don't run two copies:

```bash
sudo snap remove --purge google-chat-desktop
```

</details>

### Run from source (this fork)

```bash
git clone https://github.com/Bae-ChangHyun/google-chat-electron.git
cd google-chat-electron
pnpm install          # or: npm install
npm start             # builds (tsc + esbuild) and launches Electron
```

<details>
<summary><strong>Prebuilt packages (upstream releases — without this fork's features)</strong></summary>

These install [zviryatko's upstream builds](https://github.com/zviryatko/google-chat-electron/releases/latest).

**Debian / Ubuntu**
```bash
sudo apt install ~/path/to/google-chat-electron-xxx-amd64.deb
# uninstall:
sudo apt-get remove --purge google-chat-electron
```

**Snap**

[![Get it from the Snap Store](https://snapcraft.io/en/dark/install.svg)](https://snapcraft.io/google-chat-desktop)

**macOS**
```bash
brew install --cask --no-quarantine google-chat-electron
# or download the darwin zip from releases, move to ~/Applications, then:
sudo xattr -rd com.apple.quarantine ~/Applications/google-chat-electron.app
```

**Windows**
```powershell
choco install unofficial-google-chat-electron
# or:
winget install --id=zviryatko.GoogleChatElectron -e
```

**Fedora / RHEL / CentOS** (build a local RPM)
```bash
sudo dnf install rpm-build npm
curl -fsSL https://get.pnpm.io/install.sh | sh -
git clone https://github.com/zviryatko/google-chat-electron.git
cd google-chat-electron
pnpm install
npm run pack:linux
npx electron-installer-redhat@^3 --src dist/google-chat-electron-linux-x64 --dest dist/installers/ --arch x86_64
```

</details>

---

## Supported platforms

The app should work on all x64 and Apple arm64 platforms; the table below lists what upstream actively tests.

| OS / Platform       |    Version    |
|:--------------------|:-------------:|
| Ubuntu GNOME        |    20, 22     |
| Linux Mint Cinnamon |      21       |
| macOS               | 10.15, 11, 12 |
| Windows             |   7, 10, 11   |

> The macOS build is not tested by upstream's maintainer (no Mac available); help testing it is welcome.

---

## ⚠️ Status & scope

- **Personal, unofficial fork**, developed actively and run from source. No published packages for this fork yet.
- It is a **wrapper** — all Google Chat functionality is the web app's; this shell adds no access to your data.
- macOS / Windows builds are **untested** here (developed and used on Linux / GNOME).

---

## 🙏 Acknowledgements

- [@zviryatko](https://github.com/zviryatko/google-chat-electron) — the upstream this fork is based on
- [@robyf](https://github.com/robyf/google-chat-linux) — initial work
- [@squalou](https://github.com/squalou/google-chat-linux) — enhancements
- [@ankurk91](https://github.com/ankurk91/google-chat-electron) — major work
- All past [contributors](https://github.com/zviryatko/google-chat-electron/graphs/contributors)

---

## Disclaimer

This desktop app is just a wrapper that starts a Chromium instance locally and runs the actual web app in it. All rights
to the [Google Chat](https://chat.google.com/) product are reserved by
[Google Inc.](https://en.wikipedia.org/wiki/Google) This desktop client has no way to access any of your data.

## 📄 License

[GNU GPLv3](LICENSE.txt) — same as upstream. As a GPLv3 work, this fork keeps the original license and attribution, and
its source is published here.
