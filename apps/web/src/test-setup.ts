import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());

// jsdom lacks these; components call them defensively.
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => undefined;
if (typeof CSS === 'undefined' || !CSS.escape) {
  (globalThis as { CSS?: { escape: (s: string) => string } }).CSS = { escape: (s: string) => s.replace(/["\\]/g, '\\$&') };
}
