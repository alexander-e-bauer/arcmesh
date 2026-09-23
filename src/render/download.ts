import type { Palette } from '../palette/harmony';
import { paletteToSvg, svgFileName } from './svg';

// Where a finished file meets the browser. Everything that makes the file
// is pure; this is the one place that touches the document to save it.
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  // Attached because some engines ignore clicks on detached anchors, and the
  // URL is revoked later because some read the blob after the click returns.
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// No rendering to wait for: the emitter writes the text and the browser
// saves it, so this one is not async.
export function downloadSvg(palette: Palette, width: number, height: number): void {
  const blob = new Blob([paletteToSvg(palette, width, height)], { type: 'image/svg+xml' });
  downloadBlob(blob, svgFileName(palette.seed, width, height));
}
