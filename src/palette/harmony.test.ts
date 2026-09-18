import { describe, expect, it } from 'vitest';
import {
  ACCENT_CHROMA_MIN,
  ARC_MAX,
  ARC_MIN,
  bandWeight,
  chromaCeiling,
  generatePalette,
  paletteBandWeight,
  pickHues,
  pickLightness,
  pickPositions,
  pickStopCount,
  rerollPalette,
} from './harmony';
import { createRng } from './rng';
import { clampChroma } from './oklch';

// Signed circular difference in degrees, in [-180, 180].
function signedHueDelta(from: number, to: number): number {
  let delta = (to - from) % 360;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
}

describe('pickStopCount', () => {
  it('returns four or five, mostly four', () => {
    const rng = createRng(11);
    const counts = { 4: 0, 5: 0 };
    for (let i = 0; i < 1000; i++) counts[pickStopCount(rng)]++;
    expect(counts[4]).toBeGreaterThan(counts[5]);
    expect(counts[5]).toBeGreaterThan(100);
  });
});

describe('pickHues', () => {
  it('honors the stop count', () => {
    expect(pickHues(createRng(1), 4).hues).toHaveLength(4);
    expect(pickHues(createRng(1), 5).hues).toHaveLength(5);
  });

  it('keeps every non-accent stop on an arc of 30 to 90 degrees from the base hue', () => {
    const rng = createRng(2);
    for (let i = 0; i < 1000; i++) {
      const { baseHue, arc, accentIndex, hues } = pickHues(rng, i % 2 === 0 ? 4 : 5);
      expect(arc).toBeGreaterThanOrEqual(ARC_MIN);
      expect(arc).toBeLessThanOrEqual(ARC_MAX);
      hues.forEach((h, index) => {
        if (index === accentIndex) return;
        const offset = signedHueDelta(baseHue, h);
        expect(offset).toBeGreaterThanOrEqual(-1e-9);
        expect(offset).toBeLessThanOrEqual(arc + 1e-9);
      });
    }
  });

  it('places the accent opposite the base hue with up to 30 degrees of play', () => {
    const rng = createRng(3);
    let accents = 0;
    for (let i = 0; i < 1000; i++) {
      const { baseHue, accentIndex, hues } = pickHues(rng, 4);
      if (accentIndex < 0) continue;
      accents++;
      const delta = Math.abs(signedHueDelta(baseHue + 180, hues[accentIndex]));
      expect(delta).toBeLessThanOrEqual(30 + 1e-9);
    }
    expect(accents).toBeGreaterThan(250);
    expect(accents).toBeLessThan(450);
  });

  it('returns hues already wrapped into [0, 360)', () => {
    const rng = createRng(4);
    for (let i = 0; i < 200; i++) {
      for (const h of pickHues(rng, 5).hues) {
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThan(360);
      }
    }
  });
});

describe('pickLightness', () => {
  it('spreads lightness across the ramp rather than clustering', () => {
    const rng = createRng(5);
    for (let i = 0; i < 500; i++) {
      const values = pickLightness(rng, i % 2 === 0 ? 4 : 5);
      expect(Math.max(...values) - Math.min(...values)).toBeGreaterThanOrEqual(0.3);
      for (const l of values) {
        expect(l).toBeGreaterThanOrEqual(0.4);
        expect(l).toBeLessThanOrEqual(0.9);
      }
    }
  });

  it('does not always hand the brightest value to the last stop', () => {
    const rng = createRng(6);
    let lastIsBrightest = 0;
    for (let i = 0; i < 200; i++) {
      const values = pickLightness(rng, 4);
      if (values[3] === Math.max(...values)) lastIsBrightest++;
    }
    expect(lastIsBrightest).toBeLessThan(120);
  });

  it('lifts the ramp for a yellow palette and still spreads it', () => {
    const rng = createRng(12);
    for (let i = 0; i < 300; i++) {
      const values = pickLightness(rng, i % 2 === 0 ? 4 : 5, 1);
      for (const l of values) {
        expect(l).toBeGreaterThanOrEqual(0.59);
        expect(l).toBeLessThanOrEqual(0.97);
      }
      expect(Math.max(...values) - Math.min(...values)).toBeGreaterThanOrEqual(0.22);
    }
  });

  it('leaves the ramp alone when the weight is zero', () => {
    const a = pickLightness(createRng(4), 4);
    const b = pickLightness(createRng(4), 4, 0);
    expect(a).toEqual(b);
  });
});

describe('chromaCeiling', () => {
  it('peaks at mid lightness and falls toward both ends', () => {
    expect(chromaCeiling(0.5)).toBeGreaterThan(chromaCeiling(0.2));
    expect(chromaCeiling(0.5)).toBeGreaterThan(chromaCeiling(0.9));
    expect(chromaCeiling(0)).toBeCloseTo(0, 6);
    expect(chromaCeiling(1)).toBeCloseTo(0, 6);
  });

  it('keeps chroma for bright stops by taking the square root of the sine', () => {
    expect(chromaCeiling(0.45)).toBeCloseTo(0.199, 3);
    expect(chromaCeiling(0.85)).toBeCloseTo(0.135, 3);
    expect(chromaCeiling(0.5)).toBeCloseTo(0.2, 6);
  });
});

describe('bandWeight', () => {
  it('is a raised cosine centered on hue 100 and zero outside 50 to 150', () => {
    expect(bandWeight(100)).toBeCloseTo(1, 9);
    expect(bandWeight(75)).toBeCloseTo(0.5, 9);
    expect(bandWeight(125)).toBeCloseTo(0.5, 9);
    expect(bandWeight(50)).toBe(0);
    expect(bandWeight(150)).toBe(0);
    expect(bandWeight(0)).toBe(0);
    expect(bandWeight(260)).toBe(0);
  });

  it('wraps hues before measuring', () => {
    expect(bandWeight(460)).toBeCloseTo(1, 9);
    expect(bandWeight(-260)).toBeCloseTo(1, 9);
  });

  it('takes the palette weight from the non-accent stops only', () => {
    expect(paletteBandWeight([100, 110, 120, 130], -1)).toBeCloseTo(1, 9);
    expect(paletteBandWeight([250, 260, 270, 100], 3)).toBe(0);
    expect(paletteBandWeight([250, 260, 270, 100], -1)).toBeCloseTo(1, 9);
    expect(paletteBandWeight([30, 45, 60, 75], -1)).toBeCloseTo(0.5, 9);
  });
});

describe('pickPositions', () => {
  it('puts one blob of a four-stop palette in each quadrant', () => {
    const rng = createRng(7);
    for (let i = 0; i < 200; i++) {
      const points = pickPositions(rng, 4);
      const quadrants = new Set(points.map((p) => `${p.x < 0.5 ? 'L' : 'R'}${p.y < 0.5 ? 'T' : 'B'}`));
      expect(quadrants.size).toBe(4);
      for (const p of points) {
        expect(p.x).toBeGreaterThanOrEqual(0.1);
        expect(p.x).toBeLessThanOrEqual(0.9);
        expect(p.y).toBeGreaterThanOrEqual(0.1);
        expect(p.y).toBeLessThanOrEqual(0.9);
      }
    }
  });

  it('adds a fifth blob near the center', () => {
    const points = pickPositions(createRng(8), 5);
    expect(points).toHaveLength(5);
    const nearCenter = points.filter((p) => Math.abs(p.x - 0.5) <= 0.15 && Math.abs(p.y - 0.5) <= 0.15);
    expect(nearCenter.length).toBeGreaterThanOrEqual(1);
  });
});

describe('generatePalette', () => {
  it('is deterministic for a seed', () => {
    expect(generatePalette(123)).toEqual(generatePalette(123));
  });

  it('differs across seeds', () => {
    expect(generatePalette(1)).not.toEqual(generatePalette(2));
  });

  it('records the seed and starts every stop unlocked', () => {
    const palette = generatePalette(9);
    expect(palette.seed).toBe(9);
    expect(palette.stops.every((stop) => !stop.locked)).toBe(true);
  });

  it('uses four or five stops and honors an explicit count', () => {
    expect([4, 5]).toContain(generatePalette(9).stops.length);
    expect(generatePalette(9, { count: 5 }).stops).toHaveLength(5);
    expect(generatePalette(9, { count: 4 }).stops).toHaveLength(4);
  });

  it('produces the same palette whether the count is drawn or passed', () => {
    const drawn = generatePalette(21);
    expect(generatePalette(21, { count: drawn.stops.length })).toEqual(drawn);
  });

  it('gives the background very low chroma at a dark or light lightness', () => {
    for (const seed of [5, 6, 7, 8]) {
      const { background } = generatePalette(seed);
      expect(background.c).toBeLessThanOrEqual(0.02 + 1e-9);
      expect([0.16, 0.94]).toContain(background.l);
    }
  });

  // Rebuilds the hue draw so a test can see which stop is the accent and
  // what band weight the generator used, without exposing internals.
  function huesFor(seed: number) {
    const rng = createRng(seed);
    const count = pickStopCount(rng);
    return pickHues(rng, count);
  }

  it('forces a dark background when the palette sits in the yellow band', () => {
    let checked = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const { hues, accentIndex } = huesFor(seed);
      if (paletteBandWeight(hues, accentIndex) < 0.5) continue;
      expect(generatePalette(seed).background.l).toBe(0.16);
      checked++;
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('never gives the accent less than the chroma floor, short of the gamut', () => {
    let checked = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const { accentIndex } = huesFor(seed);
      if (accentIndex < 0) continue;
      const accent = generatePalette(seed).stops[accentIndex];
      const reachable = clampChroma({ l: accent.l, c: ACCENT_CHROMA_MIN, h: accent.h }).c;
      // The clamp bisects 20 times, so two searches that start from different
      // chromas land within about 4e-7 of the same boundary.
      expect(accent.c).toBeGreaterThanOrEqual(Math.min(ACCENT_CHROMA_MIN, reachable) - 1e-6);
      checked++;
    }
    expect(checked).toBeGreaterThan(50);
  });

  it('gives an in-band accent the brightest slot', () => {
    let checked = 0;
    for (let seed = 1; seed <= 600; seed++) {
      const { hues, accentIndex } = huesFor(seed);
      if (accentIndex < 0 || bandWeight(hues[accentIndex]) < 0.5) continue;
      const palette = generatePalette(seed);
      const brightest = Math.max(...palette.stops.map((stop) => stop.l));
      expect(palette.stops[accentIndex].l).toBe(brightest);
      checked++;
    }
    expect(checked).toBeGreaterThan(5);
  });
});

describe('rerollPalette', () => {
  it('keeps locked stops and replaces the rest', () => {
    const first = generatePalette(1);
    const locked = {
      ...first,
      stops: first.stops.map((stop, i) => (i === 1 ? { ...stop, locked: true } : stop)),
    };
    const next = rerollPalette(locked, 2);
    expect(next.seed).toBe(2);
    expect(next.stops).toHaveLength(first.stops.length);
    expect(next.stops[1]).toEqual(locked.stops[1]);
    expect(next.stops[0]).not.toEqual(first.stops[0]);
  });

  it('keeps the stop count of the previous palette', () => {
    const five = generatePalette(3, { count: 5 });
    expect(rerollPalette(five, 4).stops).toHaveLength(5);
  });
});
