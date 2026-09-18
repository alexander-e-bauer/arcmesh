import '@testing-library/jest-dom/vitest';

// jsdom does not implement pointer capture. The Canvas drag handles call it,
// so give the prototype no-op versions when they are missing.
if (typeof HTMLElement.prototype.setPointerCapture !== 'function') {
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
}
