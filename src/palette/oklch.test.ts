import { describe, expect, it } from 'vitest';
import { clampChroma, inGamut, oklchToHex, oklchToSrgb, rgbToHex, srgbToOklch, wrapHue } from './oklch';

describe('wrapHue', () => {
  it('maps any angle into [0, 360)', () => {
    expect(wrapHue(0)).toBe(0);
    expect(wrapHue(360)).toBe(0);
    expect(wrapHue(-30)).toBe(330);
    expect(wrapHue(725)).toBe(5);
    expect(wrapHue(123.456)).toBe(123.456);
  });
});

describe('srgbToOklch', () => {
  // Published values for the sRGB primaries, as reported by oklch.com and culori.
  it.each([
    ['red', { r: 1, g: 0, b: 0 }, 0.628, 0.2577, 29.23],
    ['green', { r: 0, g: 1, b: 0 }, 0.8664, 0.2948, 142.5],
    ['blue', { r: 0, g: 0, b: 1 }, 0.452, 0.3132, 264.05],
  ])('matches the published value for %s', (_name, rgb, l, c, h) => {
    const got = srgbToOklch(rgb);
    expect(got.l).toBeCloseTo(l, 2);
    expect(got.c).toBeCloseTo(c, 2);
    expect(Math.abs(got.h - h)).toBeLessThan(0.5);
  });

  it('maps white to lightness 1 with no chroma', () => {
    const got = srgbToOklch({ r: 1, g: 1, b: 1 });
    expect(got.l).toBeCloseTo(1, 4);
    expect(got.c).toBeCloseTo(0, 4);
  });

  it('maps black to lightness 0 with no chroma', () => {
    const got = srgbToOklch({ r: 0, g: 0, b: 0 });
    expect(got.l).toBeCloseTo(0, 4);
    expect(got.c).toBeCloseTo(0, 4);
  });
});

describe('oklchToSrgb', () => {
  it('maps lightness 1 with no chroma to white', () => {
    const got = oklchToSrgb({ l: 1, c: 0, h: 0 });
    expect(got.r).toBeCloseTo(1, 4);
    expect(got.g).toBeCloseTo(1, 4);
    expect(got.b).toBeCloseTo(1, 4);
  });

  it('maps lightness 0 to black', () => {
    const got = oklchToSrgb({ l: 0, c: 0, h: 0 });
    expect(got.r).toBeCloseTo(0, 4);
    expect(got.g).toBeCloseTo(0, 4);
    expect(got.b).toBeCloseTo(0, 4);
  });

  it('maps mid grey through the sRGB transfer curve', () => {
    // Linear 0.125 (0.5 cubed) through the transfer function is 0.3886.
    const got = oklchToSrgb({ l: 0.5, c: 0, h: 0 });
    expect(got.r).toBeCloseTo(0.3886, 3);
    expect(got.g).toBeCloseTo(0.3886, 3);
    expect(got.b).toBeCloseTo(0.3886, 3);
  });

  it('maps the published red back to the red primary', () => {
    const got = oklchToSrgb({ l: 0.628, c: 0.2577, h: 29.23 });
    expect(Math.abs(got.r - 1)).toBeLessThan(0.02);
    expect(Math.abs(got.g)).toBeLessThan(0.02);
    expect(Math.abs(got.b)).toBeLessThan(0.02);
  });

  it('round-trips a grid of sRGB colors', () => {
    const steps = [0, 0.25, 0.5, 0.75, 1];
    for (const r of steps) {
      for (const g of steps) {
        for (const b of steps) {
          const back = oklchToSrgb(srgbToOklch({ r, g, b }));
          expect(back.r).toBeCloseTo(r, 5);
          expect(back.g).toBeCloseTo(g, 5);
          expect(back.b).toBeCloseTo(b, 5);
        }
      }
    }
  });
});

describe('hex output', () => {
  it('formats channels as two lowercase hex digits', () => {
    expect(rgbToHex({ r: 1, g: 0, b: 0 })).toBe('#ff0000');
    expect(rgbToHex({ r: 0, g: 0, b: 0 })).toBe('#000000');
    expect(rgbToHex({ r: 0.5, g: 0.5, b: 0.5 })).toBe('#808080');
  });

  it('clamps out-of-range channels before formatting', () => {
    expect(rgbToHex({ r: 1.2, g: -0.1, b: 0.5 })).toBe('#ff0080');
  });

  it('converts OKLCH straight to hex', () => {
    expect(oklchToHex({ l: 1, c: 0, h: 0 })).toBe('#ffffff');
    expect(oklchToHex({ l: 0, c: 0, h: 0 })).toBe('#000000');
  });
});

describe('inGamut', () => {
  it('accepts channels inside [0, 1] and tolerates float noise at the edges', () => {
    expect(inGamut({ r: 0, g: 0.5, b: 1 })).toBe(true);
    expect(inGamut({ r: 1.0000000001, g: 0, b: -0.0000000001 })).toBe(true);
  });

  it('rejects channels clearly outside [0, 1]', () => {
    expect(inGamut({ r: 1.01, g: 0, b: 0 })).toBe(false);
    expect(inGamut({ r: 0, g: -0.01, b: 0 })).toBe(false);
  });
});

describe('clampChroma', () => {
  it('returns the color unchanged when it is already in gamut', () => {
    const color = { l: 0.5, c: 0.05, h: 120 };
    expect(clampChroma(color)).toEqual(color);
  });

  it('reduces chroma until the color fits, holding lightness and hue', () => {
    for (const h of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const out = clampChroma({ l: 0.5, c: 0.4, h });
      expect(inGamut(oklchToSrgb(out))).toBe(true);
      expect(out.c).toBeLessThan(0.4);
      expect(out.c).toBeGreaterThan(0.03);
      expect(out.l).toBe(0.5);
      expect(out.h).toBe(h);
    }
  });

  it('lands close to the gamut boundary', () => {
    const out = clampChroma({ l: 0.5, c: 0.4, h: 30 });
    expect(inGamut(oklchToSrgb({ ...out, c: out.c + 0.002 }))).toBe(false);
  });

  it('drops chroma entirely at the ends of the lightness range', () => {
    expect(clampChroma({ l: 0, c: 0.2, h: 30 })).toEqual({ l: 0, c: 0, h: 30 });
    expect(clampChroma({ l: 1, c: 0.2, h: 30 })).toEqual({ l: 1, c: 0, h: 30 });
  });
});
