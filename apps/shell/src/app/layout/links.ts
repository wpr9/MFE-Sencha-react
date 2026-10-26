import type { MouseEvent } from 'react';

/**
 * Only a plain primary click routes in-app. Modified clicks (Ctrl/Cmd/Shift/Alt,
 * middle button) are left to the browser: new tab, new window, download.
 */
export const isPlainLeftClick = (event: MouseEvent) =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
