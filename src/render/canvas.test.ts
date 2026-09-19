import { describe, expect, it } from 'vitest';
import type { Palette } from '../palette/harmony';
import { oklchToHex } from '../palette/oklch';
import { drawPalette, pngFileName, rgbaString, type Context2D } from './canvas';
import { GRAIN_BLEND } from './grain';
import { blobLayer, FALLOFF } from './layers';

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
};

interface Op {
  kind: string;
  args: unknown[];
}

// Records every call so a test can read the paint order without a real
// canvas, which jsdom does not provide.
function fakeContext() {
  const ops: Op[] = [];
  const gradients: { stops: [number, string][] }[] = [];
  const ctx = {
    fillStyle: '' as string | CanvasGradient | CanvasPattern,
    globalCompositeOperation: 'source-over' as GlobalCompositeOperation,
    fillRect: (...args: number[]) =>
      ops.push({ kind: 'fillRect', args: [...args, ctx.fillStyle, ctx.globalCompositeOperation] }),
    save: () => ops.push({ kind: 'save', args: [] }),
    restore: () => {
      ctx.globalCompositeOperation = 'source-over';
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
    expect(gradients).toHaveLength(5);

    const first = gradients[0].stops;
    expect(first.map(([offset]) => offset)).toEqual([0, 0.4, 0.6, 0.992, 1]);
    expect(first.map(([, color]) => color.endsWith(', 1)'))).toEqual([false, false, true, true, false]);

    const second = gradients[1].stops;
    expect(second).toHaveLength(2);
    expect(second[0][0]).toBe(0);
    expect(second[0][1]).toMatch(/^rgba\(\d+, \d+, \d+, 1\)$/);
    expect(second[1][0]).toBe(FALLOFF[3] / 100);
    expect(second[1][1]).toMatch(/, 0\)$/);

    expect(gradients[4].stops[1][0]).toBe(FALLOFF[0] / 100);
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
    expect(ops.filter((op) => op.kind === 'save')).toHaveLength(6);
    expect(ops.filter((op) => op.kind === 'restore')).toHaveLength(6);
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
