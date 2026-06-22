import {BrowserWindow} from 'electron';
import store from '../config.js';

const STEP = 0.5;
const MIN = -3;
const MAX = 3;

const clamp = (level: number): number => Math.min(MAX, Math.max(MIN, level));

const save = (level: number) => store.set('app.zoomLevel', level);
const saved = (): number => Number(store.get('app.zoomLevel') ?? 0);

// Persist the zoom level across restarts. Restores on every page load, and
// captures both Ctrl+wheel and the menu zoom items (via the exported helpers).
export default (window: BrowserWindow) => {
  const wc = window.webContents;

  wc.on('dom-ready', () => wc.setZoomLevel(saved()));

  wc.on('zoom-changed', (_event, direction) => {
    const level = clamp(wc.getZoomLevel() + (direction === 'in' ? STEP : -STEP));
    wc.setZoomLevel(level);
    save(level);
  });
};

export const zoomIn = (window: BrowserWindow) => {
  const level = clamp(window.webContents.getZoomLevel() + STEP);
  window.webContents.setZoomLevel(level);
  save(level);
};

export const zoomOut = (window: BrowserWindow) => {
  const level = clamp(window.webContents.getZoomLevel() - STEP);
  window.webContents.setZoomLevel(level);
  save(level);
};

export const zoomReset = (window: BrowserWindow) => {
  window.webContents.setZoomLevel(0);
  save(0);
};
