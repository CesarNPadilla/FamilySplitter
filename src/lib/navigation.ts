import { useSyncExternalStore } from 'react';

const navigationEvent = 'family:navigate';
export function navigate(path: string, replace = false) {
  if (
    window.location.pathname === path &&
    !window.location.search &&
    !window.location.hash
  )
    return;
  window.history[replace ? 'replaceState' : 'pushState'](null, '', path);
  window.dispatchEvent(new Event(navigationEvent));
}
function subscribe(callback: () => void) {
  window.addEventListener('popstate', callback);
  window.addEventListener(navigationEvent, callback);
  return () => {
    window.removeEventListener('popstate', callback);
    window.removeEventListener(navigationEvent, callback);
  };
}
export function usePath() {
  return useSyncExternalStore(
    subscribe,
    () => window.location.pathname,
    () => '/dashboard',
  );
}
export type AppRoute =
  | { page: 'dashboard' | 'settle' | 'unknown' }
  | { page: 'tab' | 'add'; tabId: string }
  | { page: 'edit'; tabId: string; expenseId: string };
export function parseRoute(path: string): AppRoute {
  if (path === '/settle') return { page: 'settle' };
  if (path === '/dashboard') return { page: 'dashboard' };
  const id =
    '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
  const match = new RegExp(
    `^/tabs/(${id})(?:/(new)|/expenses/(${id})/edit)?$`,
  ).exec(path);
  if (!match) return { page: 'unknown' };
  if (match[3]) return { page: 'edit', tabId: match[1], expenseId: match[3] };
  return { page: match[2] ? 'add' : 'tab', tabId: match[1] };
}
