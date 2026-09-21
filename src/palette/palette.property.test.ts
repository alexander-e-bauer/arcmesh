import { describe, expect, it } from 'vitest';
import {
  ARC_MAX,
  bandWeight,
  BAND_LIFT_MIN,
  CREASE_MAX,
  DEEP_DROP,
  generatePalette,
  LIGHTNESS_JITTER,
  LIGHTNESS_MIN,
  pickHues,
  pickStopCount,
  WARP_FREQUENCY,
  WARP_SEED_MAX,
  WARP_STRENGTH,
  type Palette,
} from './harmony';
import { inGamut, oklchToSrgb } from './oklch';
import { createRng } from './rng';
import { decodePalette, encodePalette } from './codec';

// Smallest arc that contains every hue: 360 minus the largest gap between
// neighbors on the circle.
function arcSpan(hues: number[]): number {
  const sorted = [...hues].sort((a, b) => a - b);
  let largestGap = 0;
  for (let i = 0; i < sorted.length; i++) {
    const next = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + 360;
    largestGap = Math.max(largestGap, next - sorted[i]);
  }
  return 360 - largestGap;
}

// The arc rule allows one accent outside the arc, so the hues fit if they
// fit as a whole or after removing any single stop.
function fitsArc(hues: number[], maxArc: number): boolean {
  if (arcSpan(hues) <= maxArc) return true;
  return hues.some((_, skip) => arcSpan(hues.filter((_, i) => i !== skip)) <= maxArc);
}

// The generator's own accent index, rebuilt from the seed the way
// generatePalette draws it: the stop count first, then the hues.
function accentOf(palette: Palette): number {
  const rng = createRng(palette.seed);
  pickStopCount(rng);
  return pickHues(rng, palette.stops.length).accentIndex;
}

describe('a thousand generated palettes', () => {
  const palettes = Array.from({ length: 1000 }, (_, i) => generatePalette((i + 1) * 7919));

  it('never emit an out-of-gamut color', () => {
    for (const palette of palettes) {
      for (const stop of palette.stops) {
        expect(inGamut(oklchToSrgb(stop))).toBe(true);
      }
      expect(inGamut(oklchToSrgb(palette.background))).toBe(true);
    }
  });

  it('never let two stops violate the arc rule', () => {
    for (const palette of palettes) {
      expect(fitsArc(palette.stops.map((stop) => stop.h), ARC_MAX + 1e-6)).toBe(true);
    }
  });

  it('always have a bright region and a deep region, allowing for the yellow lift', () => {
    for (const palette of palettes) {
      const hues = palette.stops.map((stop) => stop.h);
      const accent = accentOf(palette);
      const w = Math.max(0, ...hues.filter((_, i) => i !== accent).map(bandWeight));
      const lightness = palette.stops.map((stop) => stop.l);
      expect(Math.max(...lightness) - Math.min(...lightness)).toBeGreaterThanOrEqual(0.3 - 0.1 * w - 1e-9);
    }
  });

  it('never leave a yellow palette in the brown band', () => {
    for (const palette of palettes) {
      const accent = accentOf(palette);
      const others = palette.stops.filter((_, i) => i !== accent);
      const w = Math.max(0, ...others.map((stop) => bandWeight(stop.h)));
      // The deep drop scales away with the band weight, so it never takes
      // a yellow palette under the lifted floor.
      const floor = LIGHTNESS_MIN + BAND_LIFT_MIN * w - LIGHTNESS_JITTER - DEEP_DROP[1] * (1 - w) - 1e-9;
      for (const stop of others) expect(stop.l).toBeGreaterThanOrEqual(floor);
      if (accent >= 0) {
        expect(palette.stops[accent].l).toBe(Math.max(...palette.stops.map((stop) => stop.l)));
      }
    }
  });

  it('are lit from the canvas edge and carry a valid spot when they carry one', () => {
    for (const palette of palettes) {
      expect(palette.light).not.toBeNull();
      expect([palette.light!.x, palette.light!.y].some((v) => v < 1e-9 || v > 1 - 1e-9)).toBe(true);
      if (palette.spot !== null) {
        expect(Number.isInteger(palette.spot)).toBe(true);
        expect(palette.spot).toBeGreaterThanOrEqual(0);
        expect(palette.spot).toBeLessThan(palette.stops.length);
      }
    }
  });

  it('carry a warp with an integer seed and the frequency and strength in range', () => {
    for (const palette of palettes) {
      expect(palette.warp).not.toBeNull();
      expect(Number.isInteger(palette.warp!.seed)).toBe(true);
      expect(palette.warp!.seed).toBeGreaterThanOrEqual(1);
      expect(palette.warp!.seed).toBeLessThanOrEqual(WARP_SEED_MAX);
      expect(palette.warp!.frequency).toBeGreaterThanOrEqual(WARP_FREQUENCY[0]);
      expect(palette.warp!.frequency).toBeLessThanOrEqual(WARP_FREQUENCY[1]);
      expect(palette.warp!.strength).toBeGreaterThanOrEqual(WARP_STRENGTH[0]);
      expect(palette.warp!.strength).toBeLessThanOrEqual(WARP_STRENGTH[1]);
    }
  });

  it('keep their warp through the link, to the codec\'s precision', () => {
    for (const palette of palettes) {
      const decoded = decodePalette(encodePalette(palette));
      expect(decoded).not.toBeNull();
      expect(decoded!.warp!.seed).toBe(palette.warp!.seed);
      expect(decoded!.warp!.frequency).toBeCloseTo(palette.warp!.frequency, 2);
      expect(decoded!.warp!.strength).toBeCloseTo(palette.warp!.strength, 3);
    }
  });

  it('carry at most two creases, each on a real stop', () => {
    for (const palette of palettes) {
      expect(palette.creases.length).toBeLessThanOrEqual(CREASE_MAX);
      for (const c of palette.creases) {
        expect(c.stop).toBeGreaterThanOrEqual(0);
        expect(c.stop).toBeLessThan(palette.stops.length);
        expect(c.t0).toBeLessThan(c.t1);
        expect(c.t1).toBeLessThanOrEqual(0.999);
      }
    }
  });
});
