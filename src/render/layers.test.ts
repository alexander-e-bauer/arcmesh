import { describe, expect, it } from 'vitest';
import { decodePalette, encodePalette } from '../palette/codec';
import { generatePalette, type Palette } from '../palette/harmony';
import { BLOB_STRETCH, blobLayer, blobStretch, creaseLayer, CREASE_EDGE, FALLOFF, farthestCorner, paletteToLayers } from './layers';

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

describe('farthestCorner', () => {
  it('is the CSS farthest-corner ellipse in unit canvas space', () => {
    expect(farthestCorner(0, 0)).toEqual({ rx: Math.SQRT2, ry: Math.SQRT2 });
    expect(farthestCorner(0.5, 0.5)).toEqual({ rx: 0.5 * Math.SQRT2, ry: 0.5 * Math.SQRT2 });
    expect(farthestCorner(0.75, 0.2)).toEqual({ rx: 0.75 * Math.SQRT2, ry: 0.8 * Math.SQRT2 });
  });
});

describe('blobStretch', () => {
  it('stays inside the stretch range on either axis', () => {
    for (let i = 0; i < 500; i++) {
      const { sx, sy } = blobStretch({ l: 0.4 + (i % 50) / 100, c: (i % 20) / 100, h: (i * 7.3) % 360 });
      for (const s of [sx, sy]) {
        expect(s).toBeGreaterThanOrEqual(BLOB_STRETCH[0]);
        expect(s).toBeLessThanOrEqual(BLOB_STRETCH[1]);
      }
    }
  });

  it('is the same for two colors the codec would write the same, and varies otherwise', () => {
    const a = blobStretch({ l: 0.85, c: 0.08, h: 240 });
    expect(blobStretch({ l: 0.8501, c: 0.0801, h: 240.001 })).toEqual(a);
    expect(blobStretch({ l: 0.85, c: 0.08, h: 241 })).not.toEqual(a);
    expect(blobStretch({ l: 0.75, c: 0.08, h: 240 })).not.toEqual(a);
  });

  it('survives the codec round trip for every stop of a thousand palettes', () => {
    // Positions round to three decimals in the link, so the ellipse can
    // move by that much; the stretch must not move at all.
    for (let i = 1; i <= 1000; i++) {
      const palette = generatePalette(i * 7919);
      const decoded = decodePalette(encodePalette(palette));
      expect(decoded).not.toBeNull();
      expect(decoded!.stops.map(blobStretch)).toEqual(palette.stops.map(blobStretch));
    }
  });

  it('is exactly the hash of the stop as the codec writes it', () => {
    const color = { l: 0.85, c: 0.08, h: 240 };
    expect(blobStretch(color)).toEqual(blobStretch({ l: 0.8504, c: 0.0796, h: 240.004 }));
    expect(blobStretch(color)).not.toEqual(blobStretch({ l: 0.8505, c: 0.08, h: 240 }));
  });

  it('is not the same on both axes as a rule', () => {
    let differ = 0;
    for (let i = 0; i < 100; i++) {
      const { sx, sy } = blobStretch({ l: 0.5 + i / 400, c: 0.1, h: i * 3 });
      if (Math.abs(sx - sy) > 0.05) differ++;
    }
    expect(differ).toBeGreaterThan(50);
  });
});

describe('blobLayer', () => {
  it('sits at the stop, sized from the farthest corner stretched by the color, fading its own color to alpha 0', () => {
    const stop = palette.stops[2];
    const layer = blobLayer(stop, 2);
    const { sx, sy } = blobStretch(stop);
    expect(layer.cx).toBe(0.2);
    expect(layer.cy).toBe(0.8);
    expect(layer.size).toEqual({ rx: 0.8 * Math.SQRT2 * sx, ry: 0.8 * Math.SQRT2 * sy });
    expect(layer.stops).toEqual([
      { offset: 0, color: { l: 0.85, c: 0.08, h: 240 }, alpha: 1 },
      { offset: FALLOFF[2] / 100, color: { l: 0.85, c: 0.08, h: 240 }, alpha: 0 },
    ]);
  });

  it('does not change shape when the stop moves', () => {
    const stop = palette.stops[0];
    const here = blobLayer(stop, 0).size;
    const there = blobLayer({ ...stop, x: 0.6, y: 0.1 }, 0).size;
    const { sx, sy } = blobStretch(stop);
    expect(here).toEqual({ rx: 0.75 * Math.SQRT2 * sx, ry: 0.75 * Math.SQRT2 * sy });
    expect(there).toEqual({ rx: 0.6 * Math.SQRT2 * sx, ry: 0.9 * Math.SQRT2 * sy });
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
