import { describe, expect, it } from 'vitest';
import type { Palette } from '../palette/harmony';
import { oklchToHex } from '../palette/oklch';
import { GRAIN_BLEND, grainFilter } from './grain';
import { paletteToLayers } from './layers';
import { paletteToSvg, svgFileName } from './svg';
import { warpFilter } from './warp';

const palette: Palette = {
  seed: 7,
  background: { l: 0.16, c: 0.02, h: 200 },
  stops: [
    { l: 0.5, c: 0.1, h: 200, x: 0.25, y: 0.25, locked: false },
    { l: 0.7, c: 0.12, h: 220, x: 0.75, y: 0.3, locked: true },
    { l: 0.85, c: 0.08, h: 240, x: 0.2, y: 0.8, locked: false },
    { l: 0.6, c: 0.1, h: 260, x: 0.7, y: 0.75, locked: false },
  ],
  creases: [{ stop: 1, cx: 1.3, cy: 0.2, r: 0.9, t0: 0.4, t1: 0.6 }],
  light: null,
  spot: null,
  warp: null,
  drift: false,
};

const warped: Palette = { ...palette, warp: { seed: 7, frequency: 3, strength: 0.14 } };

function parse(text: string): SVGSVGElement {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  expect(doc.querySelector('parsererror')).toBeNull();
  return doc.documentElement as unknown as SVGSVGElement;
}

describe('paletteToSvg', () => {
  it('is a well formed document at the size the download asked for', () => {
    const root = parse(paletteToSvg(palette, 1600, 1000));
    expect(root.tagName).toBe('svg');
    expect(root.getAttribute('xmlns')).toBe('http://www.w3.org/2000/svg');
    expect(root.getAttribute('width')).toBe('1600');
    expect(root.getAttribute('height')).toBe('1000');
    expect(root.getAttribute('viewBox')).toBe('0 0 1600 1000');
  });

  it('paints the background under everything', () => {
    const root = parse(paletteToSvg(palette, 1600, 1000));
    const first = root.querySelector('g > rect');
    expect(first?.getAttribute('fill')).toBe(oklchToHex(palette.background));
    expect(first?.getAttribute('width')).toBe('1600');
    expect(first?.getAttribute('height')).toBe('1000');
  });

  it('emits one gradient per layer and paints them bottom up, the order the canvas draws', () => {
    const layers = paletteToLayers(palette);
    const root = parse(paletteToSvg(palette, 1600, 1000));
    expect(root.querySelectorAll('radialGradient')).toHaveLength(layers.length);
    const fills = [...root.querySelectorAll('g > rect')]
      .map((rect) => rect.getAttribute('fill'))
      .filter((fill): fill is string => fill !== null && fill.startsWith('url('));
    const bottomUp = layers.map((_, index) => `url(#l${index})`).reverse();
    expect(fills).toEqual(bottomUp);
  });

  it('writes a gradient as the unit circle under the layer ellipse, the way the canvas draws it', () => {
    const root = parse(paletteToSvg(palette, 1600, 1000));
    // The crease is the last layer, so it is the bottom one: its ellipse is
    // the crease radius on both axes, centered off canvas to the right.
    const crease = root.querySelector('radialGradient:last-of-type');
    expect(crease?.getAttribute('id')).toBe(`l${paletteToLayers(palette).length - 1}`);
    expect(crease?.getAttribute('gradientUnits')).toBe('userSpaceOnUse');
    expect(crease?.getAttribute('cx')).toBe('0');
    expect(crease?.getAttribute('cy')).toBe('0');
    expect(crease?.getAttribute('r')).toBe('1');
    expect(crease?.getAttribute('gradientTransform')).toBe('translate(2080 200) scale(1440 900)');
  });

  it('writes stop colors as plain hex with the alpha in stop-opacity', () => {
    const svg = paletteToSvg(palette, 1600, 1000);
    expect(svg).not.toContain('oklch(');
    expect(svg).not.toMatch(/#[0-9a-f]{8}\b/i);
    const root = parse(svg);
    const crease = root.querySelector('radialGradient:last-of-type');
    const stops = [...(crease?.querySelectorAll('stop') ?? [])].map((stop) => [
      stop.getAttribute('offset'),
      stop.getAttribute('stop-color'),
      stop.getAttribute('stop-opacity'),
    ]);
    const color = oklchToHex(palette.stops[1]);
    expect(stops).toEqual([
      ['0', color, '0'],
      ['0.4', color, '0'],
      ['0.6', color, '1'],
      ['0.9933', color, '1'],
      ['1', color, '0'],
    ]);
  });

  it('lays the grain over the mesh under the blend the CSS names', () => {
    const svg = paletteToSvg(palette, 1600, 1000);
    expect(svg).toContain(grainFilter());
    const rects = parse(svg).querySelectorAll('g > rect');
    const grain = rects[rects.length - 1];
    expect(grain.getAttribute('filter')).toBe('url(#g)');
    expect(grain.getAttribute('style')).toBe(`mix-blend-mode:${GRAIN_BLEND}`);
  });

  it('gives the grain nothing to paint without its filter, so a tool that drops filters loses only the grain', () => {
    const rects = parse(paletteToSvg(palette, 1600, 1000)).querySelectorAll('g > rect');
    expect(rects[rects.length - 1].getAttribute('fill')).toBe('none');
  });

  it('warps the finished mesh through the filter the canvas uses, written for this width', () => {
    const svg = paletteToSvg(warped, 1600, 1000);
    expect(svg).toContain(warpFilter(warped.warp!, 1600));
    expect(svg).not.toContain(warpFilter(warped.warp!, 960));
    const group = parse(svg).querySelector('svg > g');
    expect(group?.getAttribute('filter')).toBe('url(#w)');
  });

  it('emits no warp for a link written before the warp, and still isolates the grain', () => {
    const svg = paletteToSvg(palette, 1600, 1000);
    expect(svg).not.toContain('<filter id=\'w\'');
    const group = parse(svg).querySelector('svg > g');
    expect(group?.getAttribute('filter')).toBeNull();
    expect(group?.getAttribute('style')).toBe('isolation:isolate');
  });

  it('follows the canvas aspect: the same palette at another size moves every center', () => {
    const wide = parse(paletteToSvg(palette, 1600, 1000)).querySelector('radialGradient:last-of-type');
    const tall = parse(paletteToSvg(palette, 1000, 1600)).querySelector('radialGradient:last-of-type');
    expect(tall?.getAttribute('gradientTransform')).toBe('translate(1300 320) scale(900 1440)');
    expect(wide?.getAttribute('gradientTransform')).not.toBe(tall?.getAttribute('gradientTransform'));
  });
});

describe('svgFileName', () => {
  it('names the file after the seed and the size', () => {
    expect(svgFileName(7, 1920, 1080)).toBe('arcmesh-7-1920x1080.svg');
  });
});
