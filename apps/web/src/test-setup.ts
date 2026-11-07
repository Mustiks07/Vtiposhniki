import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());

// jsdom lacks these; components call them defensively.
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => undefined;
if (!HTMLDialogElement.prototype.showModal) HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
if (!HTMLDialogElement.prototype.close) HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
if (typeof CSS === 'undefined' || !CSS.escape) {
  (globalThis as { CSS?: { escape: (s: string) => string } }).CSS = { escape: (s: string) => s.replace(/["\\]/g, '\\$&') };
}
