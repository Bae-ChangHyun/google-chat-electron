import store from './config.js';

// Google multiplexes accounts under /u/<index> (0 = first signed-in account).
const BASE = 'https://mail.google.com/chat/u';

export const getAccountIndex = (): number => {
  const index = Number(store.get('app.accountIndex') ?? 0);
  return Number.isInteger(index) && index >= 0 ? index : 0;
};

export const setAccountIndex = (index: number): void => {
  store.set('app.accountIndex', index);
};

// Accounts the user has actually opened — drives the Accounts menu so we never
// show empty /u/N slots that would land on a "couldn't find account" page.
export const getKnownAccounts = (): number[] => {
  const raw = store.get('app.knownAccounts');
  const list = Array.isArray(raw) ? raw.filter((n) => Number.isInteger(n) && n >= 0) : [];
  if (!list.includes(0)) {
    list.push(0);
  }
  return Array.from(new Set(list)).sort((a, b) => a - b);
};

// Returns true when a previously-unknown account index was added.
export const addKnownAccount = (index: number): boolean => {
  const known = getKnownAccounts();
  if (known.includes(index)) {
    return false;
  }
  known.push(index);
  store.set('app.knownAccounts', Array.from(new Set(known)).sort((a, b) => a - b));
  return true;
};

export const chatUrl = (index: number = getAccountIndex()): string => `${BASE}/${index}`;

export const logoutUrl = (index: number = getAccountIndex()): string =>
  'https://www.google.com/accounts/Logout?continue=' + chatUrl(index);

// Google's "add another account" flow; it redirects back to Chat under a fresh
// /u/N once the new account is signed in.
export const addAccountUrl = (): string =>
  'https://accounts.google.com/AddSession?continue=' +
  encodeURIComponent('https://mail.google.com/chat');

// Extract the /u/<index> account number from a Chat/Mail URL, or null.
export const parseAccountIndex = (url: string): number | null => {
  const match = url.match(/\/(?:chat|mail)?\/?u\/(\d+)/) || url.match(/\/u\/(\d+)(?:\/|$)/);
  return match ? Number(match[1]) : null;
};
