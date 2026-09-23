import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generatePalette } from '../palette/harmony';
import { downloadBlob, downloadSvg } from './download';
import { paletteToSvg, svgFileName } from './svg';

// jsdom has no object URLs and no navigation, so the two ends of the
// download are recorded here: what was handed to the browser, and what the
// anchor looked like at the moment it was clicked.
const handed: Blob[] = [];
const revoked: string[] = [];
const clicks: { name: string; href: string; attached: boolean }[] = [];

beforeEach(() => {
  handed.length = 0;
  revoked.length = 0;
  clicks.length = 0;
  vi.useFakeTimers();
  URL.createObjectURL = (blob: Blob) => {
    handed.push(blob);
    return `blob:${handed.length}`;
  };
  URL.revokeObjectURL = (url: string) => {
    revoked.push(url);
  };
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicks.push({ name: this.download, href: this.getAttribute('href') ?? '', attached: this.isConnected });
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('downloadBlob', () => {
  it('clicks an attached anchor named for the file, then cleans up after itself', () => {
    downloadBlob(new Blob(['x']), 'arcmesh-1-16x16.svg');
    expect(clicks).toEqual([{ name: 'arcmesh-1-16x16.svg', href: 'blob:1', attached: true }]);
    expect(document.querySelector('a')).toBeNull();
    expect(revoked).toEqual([]);
    vi.runAllTimers();
    expect(revoked).toEqual(['blob:1']);
  });
});

describe('downloadSvg', () => {
  const palette = generatePalette(5);

  it('hands over the file the emitter writes, typed as SVG and named for the size', async () => {
    downloadSvg(palette, 1600, 1000);
    expect(clicks[0].name).toBe(svgFileName(palette.seed, 1600, 1000));
    expect(handed[0].type).toBe('image/svg+xml');
    expect(await handed[0].text()).toBe(paletteToSvg(palette, 1600, 1000));
  });
});
