import { describe, expect, it } from 'vitest';
import type { Palette } from '../palette/harmony';
import { blobLayer, creaseLayer, CREASE_EDGE, FALLOFF, paletteToLayers } from './layers';

const palette: Palette = {
  seed: 1,
  background: { l: 0.16, c: 0.02, h: 200 },
  stops: [
    { l: 0.5, c: 0.1, h: 200, x: 0.25, y: 0.25, locked: false },
    { l: 0.7, c: 0.12, h: 220, x: 0.75, y: 0.3, locked: true },
    { l: 0.85, c: 0.08, h: 240, x: 0.2, y: 0.8, locked: false },
    { l: 0.6, c: 0.1, h: 260, x: 0.7, y: 0.75, locked: false },
  ],
  creases: [{ stop: 1, cx: 1.3, cy: 0.2, r: 0.9, t0: 0.4, t1: 0.6 }],
};

describe('blobLayer', () => {
  it('sits at the stop, sized farthest-corner, fading its own color to alpha 0', () => {
    const layer = blobLayer(palette.stops[2], 2);
    expect(layer.cx).toBe(0.2);
    expect(layer.cy).toBe(0.8);
    expect(layer.size).toBe('farthest-corner');
    expect(layer.stops).toEqual([
      { offset: 0, color: { l: 0.85, c: 0.08, h: 240 }, alpha: 1 },
      { offset: FALLOFF[2] / 100, color: { l: 0.85, c: 0.08, h: 240 }, alpha: 0 },
    ]);
  });

  it('wraps the falloff table for a fifth stop', () => {
    expect(blobLayer(palette.stops[0], 5).stops[1].offset).toBe(FALLOFF[0] / 100);
  });
});

describe('creaseLayer', () => {
  it('is an explicit ellipse with a hard edge and an inner fade', () => {
    const layer = creaseLayer(palette.creases[0], palette.stops[1]);
    const color = { l: 0.7, c: 0.12, h: 220 };
    expect(layer.cx).toBe(1.3);
    expect(layer.cy).toBe(0.2);
    expect(layer.size).toEqual({ rx: 0.9, ry: 0.9 });
    expect(layer.stops).toEqual([
      { offset: 0, color, alpha: 0 },
      { offset: 0.4, color, alpha: 0 },
      { offset: 0.6, color, alpha: 1 },
      { offset: CREASE_EDGE, color, alpha: 1 },
      { offset: 1, color, alpha: 0 },
    ]);
  });
});

describe('paletteToLayers', () => {
  it('lists blobs in stop order, then creases underneath', () => {
    const layers = paletteToLayers(palette);
    expect(layers).toHaveLength(5);
    expect(layers.slice(0, 4).map((l) => [l.cx, l.cy])).toEqual([
      [0.25, 0.25],
      [0.75, 0.3],
      [0.2, 0.8],
      [0.7, 0.75],
    ]);
    expect(layers[4].size).toEqual({ rx: 0.9, ry: 0.9 });
  });

  it('has no crease layers when the palette has none', () => {
    expect(paletteToLayers({ ...palette, creases: [] })).toHaveLength(4);
  });
});
