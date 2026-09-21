import { describe, expect, it } from 'vitest';
import type { Palette } from '../palette/harmony';
import { oklchToHex } from '../palette/oklch';
import { drawPalette, pngFileName, rgbaString, warpPalette, type Context2D } from './canvas';
import { GRAIN_BLEND } from './grain';
import { blobLayer, CREASE_FEATHER, FALLOFF } from './layers';
import { warpFilterCss } from './warp';

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
};

interface Op {
  kind: string;
  args: unknown[];
}

// Records every call so a test can read the paint order without a real
// canvas, which jsdom does not provide. An engine that cannot apply a
// url() filter leaves the property as it was; `acceptsFilter` fakes that.
function fakeContext(acceptsFilter = true) {
  const ops: Op[] = [];
  const gradients: { stops: [number, string][] }[] = [];
  let filter = 'none';
  const ctx = {
    fillStyle: '' as string | CanvasGradient | CanvasPattern,
    globalCompositeOperation: 'source-over' as GlobalCompositeOperation,
    get filter() {
      return filter;
    },
    set filter(value: string) {
      if (acceptsFilter || value === 'none') filter = value;
    },
    fillRect: (...args: number[]) =>
      ops.push({ kind: 'fillRect', args: [...args, ctx.fillStyle, ctx.globalCompositeOperation] }),
    drawImage: (image: CanvasImageSource, dx: number, dy: number) => ops.push({ kind: 'drawImage', args: [image, dx, dy, filter] }),
    save: () => ops.push({ kind: 'save', args: [] }),
    restore: () => {
      ctx.globalCompositeOperation = 'source-over';
      filter = 'none';
      ops.push({ kind: 'restore', args: [] });
    },
    createPattern: (image: CanvasImageSource, repetition: string | null) => {
      ops.push({ kind: 'pattern', args: [image, repetition] });
      return { pattern: image } as unknown as CanvasPattern;
    },
    translate: (x: number, y: number) => ops.push({ kind: 'translate', args: [x, y] }),
    scale: (x: number, y: number) => ops.push({ kind: 'scale', args: [x, y] }),
    createRadialGradient: (...args: number[]) => {
      const gradient = { stops: [] as [number, string][], addColorStop(offset: number, color: string) { this.stops.push([offset, color]); } };
      gradients.push(gradient);
      ops.push({ kind: 'gradient', args });
      return gradient as unknown as CanvasGradient;
    },
  };
  return { ctx: ctx as Context2D, ops, gradients };
}

const tile = { tile: true } as unknown as CanvasImageSource;

describe('rgbaString', () => {
  it('formats eight-bit channels with the given alpha', () => {
    expect(rgbaString({ l: 1, c: 0, h: 0 }, 1)).toBe('rgba(255, 255, 255, 1)');
    expect(rgbaString({ l: 0, c: 0, h: 0 }, 0)).toBe('rgba(0, 0, 0, 0)');
  });
});

describe('pngFileName', () => {
  it('names the file by seed and size', () => {
    expect(pngFileName(7, 1920, 1080)).toBe('arcmesh-7-1920x1080.png');
  });
});

describe('drawPalette', () => {
  it('fills the background, then paints layers bottom-up, creases first', () => {
    const { ctx, ops, gradients } = fakeContext();
    drawPalette(ctx, palette, 200, 100, tile);

    expect(ops[0]).toEqual({ kind: 'fillRect', args: [0, 0, 200, 100, oklchToHex(palette.background), 'source-over'] });
    expect(gradients).toHaveLength(9);

    const first = gradients[0].stops;
    expect(first.map(([offset]) => offset)).toEqual([0, 0.4, 0.6, 1 - CREASE_FEATHER / 0.9, 1]);
    expect(first.map(([, color]) => color.endsWith(', 1)'))).toEqual([false, false, true, true, false]);

    const second = gradients[1].stops;
    expect(second).toHaveLength(2);
    expect(second[0][0]).toBe(0);
    expect(second[0][1]).toMatch(/^rgba\(\d+, \d+, \d+, 1\)$/);
    expect(second[1][0]).toBe(FALLOFF[3] / 100);
    expect(second[1][1]).toMatch(/, 0\)$/);

    expect(gradients[4].stops[1][0]).toBe(FALLOFF[0] / 100);

    // Cores come last, stop 3 down to stop 0, half transparent at the center.
    expect(gradients[5].stops[0][1]).toMatch(/, 0\.55\)$/);
    expect(gradients[8].stops.map(([offset]) => offset)).toEqual([0, 1]);
  });

  it('positions and scales each gradient in pixels', () => {
    const { ctx, ops } = fakeContext();
    drawPalette(ctx, palette, 200, 100, tile);
    const translates = ops.filter((op) => op.kind === 'translate').map((op) => op.args);
    const scales = ops.filter((op) => op.kind === 'scale').map((op) => op.args);
    // Bottom-up: the crease, then stops 3, 2, 1, 0.
    expect(translates[0]).toEqual([260, 20]);
    expect(scales[0]).toEqual([180, 90]);
    expect(translates[1]).toEqual([140, 75]);
    const blob = blobLayer(palette.stops[3], 3).size;
    expect(scales[1]).toEqual([blob.rx * 200, blob.ry * 100]);
    const rects = ops.filter((op) => op.kind === 'fillRect').slice(1).map((op) => op.args.slice(0, 4));
    expect(rects[0]).toEqual([-260 / 180, -20 / 90, 200 / 180, 100 / 90]);
    expect(ops.filter((op) => op.kind === 'save')).toHaveLength(10);
    expect(ops.filter((op) => op.kind === 'restore')).toHaveLength(10);
  });

  it('paints the grain tile last, repeated, under the grain blend, then restores the blend', () => {
    const { ctx, ops } = fakeContext();
    drawPalette(ctx, palette, 200, 100, tile);
    const fills = ops.filter((op) => op.kind === 'fillRect');
    const last = fills[fills.length - 1];
    expect(last.args.slice(0, 4)).toEqual([0, 0, 200, 100]);
    expect(last.args[4]).toEqual({ pattern: tile });
    expect(last.args[5]).toBe(GRAIN_BLEND);
    expect(ops.filter((op) => op.kind === 'pattern')).toEqual([{ kind: 'pattern', args: [tile, 'repeat'] }]);
    expect(fills.slice(0, -1).every((op) => op.args[5] === 'source-over')).toBe(true);
    expect(ctx.globalCompositeOperation).toBe('source-over');
  });
});

describe('warpPalette', () => {
  const warp = { seed: 7, frequency: 3, strength: 0.14 };
  const flat = { flat: true } as unknown as CanvasImageSource;

  it('draws the flat mesh once through the filter written for the width, inside a save and restore', () => {
    const { ctx, ops } = fakeContext();
    expect(warpPalette(ctx, flat, warp, 1920)).toBe(true);
    expect(ops.map((op) => op.kind)).toEqual(['save', 'drawImage', 'restore']);
    expect(ops[1].args).toEqual([flat, 0, 0, warpFilterCss(warp, 1920)]);
    expect(ctx.filter).toBe('none');
  });

  it('draws nothing and says so when the engine keeps its filter', () => {
    const { ctx, ops } = fakeContext(false);
    expect(warpPalette(ctx, flat, warp, 1920)).toBe(false);
    expect(ops.map((op) => op.kind)).toEqual(['save', 'restore']);
    expect(ctx.filter).toBe('none');
  });

  it('is not part of the flat paint', () => {
    const { ctx, ops } = fakeContext();
    drawPalette(ctx, { ...palette, warp }, 200, 100, tile);
    expect(ops.some((op) => op.kind === 'drawImage')).toBe(false);
    expect(ctx.filter).toBe('none');
  });

  it('refuses to touch an engine with no filter property at all', () => {
    const { ctx, ops } = fakeContext();
    delete (ctx as { filter?: string }).filter;
    expect(warpPalette(ctx, flat, warp, 1920)).toBe(false);
    expect(ops).toEqual([]);
  });
});
