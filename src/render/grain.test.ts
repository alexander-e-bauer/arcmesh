import { describe, expect, it } from 'vitest';
import { GRAIN_ALPHA, GRAIN_BLEND, GRAIN_SEED, GRAIN_TILE, grainCssLayer, grainFilter, grainPixels, grainSvg } from './grain';

describe('grainSvg', () => {
  it('is a tile of desaturated fractal noise at constant alpha, filtered in sRGB', () => {
    const svg = grainSvg();
    expect(svg).toContain(`width='${GRAIN_TILE}' height='${GRAIN_TILE}'`);
    expect(svg).toContain("color-interpolation-filters='sRGB'");
    expect(svg).toContain("type='fractalNoise'");
    expect(svg).toContain("stitchTiles='stitch'");
    expect(svg).toContain("type='saturate' values='0'");
    expect(svg).toContain(`<feFuncA type='linear' slope='0' intercept='${GRAIN_ALPHA}'/>`);
    expect(svg).toContain("filter='url(#g)'");
  });
});

describe('grainCssLayer', () => {
  it('is an unquoted data URI with nothing left that could end the url()', () => {
    const layer = grainCssLayer();
    expect(layer.startsWith('url(data:image/svg+xml,')).toBe(true);
    expect(layer.endsWith(')')).toBe(true);
    const body = layer.slice('url('.length, -1);
    expect(body).not.toMatch(/[\s"'()<>#]/);
    expect(decodeURIComponent(body.slice('data:image/svg+xml,'.length))).toBe(grainSvg());
  });

  it('names a blend mode that leaves mid-grey noise neutral on average', () => {
    expect(GRAIN_BLEND).toBe('soft-light');
  });
});

describe('grainPixels', () => {
  it('fills a square RGBA tile with grey pixels at the grain alpha', () => {
    const pixels = grainPixels();
    expect(pixels).toHaveLength(GRAIN_TILE * GRAIN_TILE * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      expect(pixels[i + 1]).toBe(pixels[i]);
      expect(pixels[i + 2]).toBe(pixels[i]);
      expect(pixels[i + 3]).toBe(Math.round(GRAIN_ALPHA * 255));
    }
  });

  it('centers on mid-grey with a spread like the SVG noise, and is the same every time', () => {
    const pixels = grainPixels();
    let sum = 0;
    let squares = 0;
    const n = pixels.length / 4;
    for (let i = 0; i < pixels.length; i += 4) {
      sum += pixels[i];
      squares += pixels[i] * pixels[i];
    }
    const mean = sum / n;
    const std = Math.sqrt(squares / n - mean * mean);
    expect(mean).toBeGreaterThan(120);
    expect(mean).toBeLessThan(135);
    expect(std).toBeGreaterThan(30);
    expect(std).toBeLessThan(55);
    expect(grainPixels()).toEqual(pixels);
    expect(grainPixels(GRAIN_TILE, GRAIN_SEED + 1)).not.toEqual(pixels);
  });

  it('honors a smaller size', () => {
    expect(grainPixels(8)).toHaveLength(8 * 8 * 4);
  });
});

describe('grainFilter', () => {
  it('is the filter element on its own, so a standalone SVG can carry the same noise', () => {
    expect(grainFilter().startsWith("<filter id='g'")).toBe(true);
    expect(grainFilter().endsWith('</filter>')).toBe(true);
    expect(grainSvg()).toContain(grainFilter());
  });
});
