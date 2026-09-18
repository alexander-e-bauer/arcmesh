import { describe, expect, it } from 'vitest';
import { ARC_MAX, generatePalette } from './harmony';
import { inGamut, oklchToSrgb } from './oklch';

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

  it('always have a bright region and a deep region', () => {
    for (const palette of palettes) {
      const lightness = palette.stops.map((stop) => stop.l);
      expect(Math.max(...lightness) - Math.min(...lightness)).toBeGreaterThanOrEqual(0.3);
    }
  });
});
