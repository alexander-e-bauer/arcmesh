import { describe, expect, it } from 'vitest';
import {
  ACCENT_CHROMA_MIN,
  ARC_MAX,
  ARC_MIN,
  bandWeight,
  chromaCeiling,
  coversOtherStop,
  CREASE_BEYOND,
  CREASE_INSET,
  CREASE_MAX,
  CREASE_MIN_DISTANCE,
  exitDistance,
  generatePalette,
  neighborAlpha,
  paletteBandWeight,
  pickCreaseCount,
  pickCreases,
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

describe('creases', () => {
  it('draws zero, one, or two with the stated odds', () => {
    const rng = createRng(31);
    const counts = [0, 0, 0];
    for (let i = 0; i < 1000; i++) counts[pickCreaseCount(rng)]++;
    expect(counts[0] / 1000).toBeGreaterThan(0.29);
    expect(counts[0] / 1000).toBeLessThan(0.41);
    expect(counts[1] / 1000).toBeGreaterThan(0.39);
    expect(counts[1] / 1000).toBeLessThan(0.51);
    expect(counts[2] / 1000).toBeGreaterThan(0.14);
    expect(counts[2] / 1000).toBeLessThan(0.26);
  });

  it('anchors each crease to its stop with the center off the canvas', () => {
    const rng = createRng(32);
    let seen = 0;
    for (let i = 0; i < 400; i++) {
      const count = i % 2 === 0 ? 4 : 5;
      const positions = pickPositions(rng, count);
      const creases = pickCreases(rng, positions);
      expect(creases.length).toBeLessThanOrEqual(CREASE_MAX);
      expect(new Set(creases.map((c) => c.stop)).size).toBe(creases.length);
      for (const c of creases) {
        seen++;
        expect(Number.isInteger(c.stop)).toBe(true);
        expect(c.stop).toBeGreaterThanOrEqual(0);
        expect(c.stop).toBeLessThan(count);
        const { x, y } = positions[c.stop];
        const d = Math.hypot(c.cx - x, c.cy - y);
        expect(d).toBeGreaterThanOrEqual(CREASE_MIN_DISTANCE + CREASE_BEYOND[0] - 1e-9);
        expect(c.cx < 0 || c.cx > 1 || c.cy < 0 || c.cy > 1).toBe(true);
        expect(c.r - d).toBeGreaterThanOrEqual(CREASE_INSET[0] - 1e-9);
        expect(c.r - d).toBeLessThanOrEqual(CREASE_INSET[1] + 1e-9);
        expect(c.cx).toBeGreaterThanOrEqual(-2);
        expect(c.cx).toBeLessThanOrEqual(3);
        expect(c.cy).toBeGreaterThanOrEqual(-2);
        expect(c.cy).toBeLessThanOrEqual(3);
        expect(c.r).toBeGreaterThanOrEqual(0.2);
        expect(c.r).toBeLessThanOrEqual(2.5);
        expect(c.t0).toBeGreaterThanOrEqual(0);
        expect(c.t0).toBeLessThan(c.t1);
        expect(c.t1).toBeLessThanOrEqual(0.99);
        // The opaque band starts past the stop, on the center side.
        expect(c.t1 * c.r).toBeLessThanOrEqual(d + 1e-9);
      }
    }
    expect(seen).toBeGreaterThan(200);
  });

  it('measures the distance to the canvas edge along a direction', () => {
    expect(exitDistance(0.5, 0.5, 1, 0)).toBeCloseTo(0.5, 9);
    expect(exitDistance(0.5, 0.5, -1, 0)).toBeCloseTo(0.5, 9);
    expect(exitDistance(0.2, 0.5, 0, 1)).toBeCloseTo(0.5, 9);
    expect(exitDistance(0.2, 0.5, 0, -1)).toBeCloseTo(0.5, 9);
    expect(exitDistance(0.1, 0.1, Math.SQRT1_2, Math.SQRT1_2)).toBeCloseTo(0.9 * Math.SQRT2, 9);
    expect(exitDistance(0.9, 0.2, Math.SQRT1_2, -Math.SQRT1_2)).toBeCloseTo(0.1 * Math.SQRT2, 9);
  });

  it('are generated with the palette and start attached to real stops', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const palette = generatePalette(seed);
      for (const c of palette.creases) expect(c.stop).toBeLessThan(palette.stops.length);
    }
    expect(generatePalette(3)).toEqual(generatePalette(3));
  });

  it('survive a reroll on a locked stop and never land fresh on a locked stop', () => {
    let seed = 1;
    while (!generatePalette(seed).creases.some((c) => c.stop === 0)) seed++;
    const first = generatePalette(seed);
    const locked = {
      ...first,
      stops: first.stops.map((stop, i) => (i === 0 ? { ...stop, locked: true } : stop)),
    };
    const kept = first.creases.filter((c) => c.stop === 0);
    for (let next = 100; next < 160; next++) {
      const rerolled = rerollPalette(locked, next);
      expect(rerolled.creases.length).toBeLessThanOrEqual(CREASE_MAX);
      expect(rerolled.creases.filter((c) => c.stop === 0)).toEqual(kept);
      const fresh = generatePalette(next, { count: first.stops.length }).creases.filter((c) => c.stop !== 0);
      for (const c of rerolled.creases.filter((c) => c.stop !== 0)) expect(fresh).toContainEqual(c);
    }
  });

  it('drop creases of unlocked stops on reroll', () => {
    const first = generatePalette(5);
    const next = rerollPalette(first, 6);
    expect(next.creases).toEqual(generatePalette(6, { count: first.stops.length }).creases);
  });

  it('reports when the crease sits at half alpha or more over another stop', () => {
    const stops = [
      { x: 0.2, y: 0.5 },
      { x: 0.6, y: 0.5 },
      { x: 0.9, y: 0.9 },
    ];
    // Center at (-0.8, 0.5), radius 1.4: the band from radius 0.98 to 1.4
    // covers x from 0.18 to 0.6 along y = 0.5, so stop 1 sits inside it.
    const covering = { stop: 0, cx: -0.8, cy: 0.5, r: 1.4, t0: 0.5, t1: 0.7 };
    expect(coversOtherStop(covering, stops)).toBe(true);
    // Its own stop never counts.
    expect(coversOtherStop({ ...covering, stop: 1 }, stops)).toBe(true);
    expect(coversOtherStop({ ...covering, stop: 1 }, [stops[0], stops[1]])).toBe(true);
    // Alone with its own stop, nothing counts.
    expect(coversOtherStop(covering, [stops[0]])).toBe(false);
    // A narrow band past stop 1 misses everyone else.
    const narrow = { stop: 1, cx: -0.8, cy: 0.5, r: 1.45, t0: 0.9, t1: 0.98 };
    expect(coversOtherStop(narrow, stops)).toBe(false);
  });

  it('avoids sitting at half alpha over another stop when it can', () => {
    const rng = createRng(33);
    let covered = 0;
    let total = 0;
    for (let i = 0; i < 400; i++) {
      const positions = pickPositions(rng, i % 2 === 0 ? 4 : 5);
      for (const c of pickCreases(rng, positions)) {
        total++;
        if (coversOtherStop(c, positions)) covered++;
      }
    }
    expect(total).toBeGreaterThan(200);
    expect(covered / total).toBeLessThan(0.15);
  });

  it('scores the alpha a crease puts on a point', () => {
    const crease = { stop: 0, cx: -1, cy: 0.5, r: 2, t0: 0.5, t1: 0.75 };
    // Along y = 0.5, t is the distance from the center divided by 2.
    expect(neighborAlpha(crease, { x: -0.5, y: 0.5 })).toBe(0);
    expect(neighborAlpha(crease, { x: 0, y: 0.5 })).toBe(0);
    expect(neighborAlpha(crease, { x: 0.25, y: 0.5 })).toBeCloseTo(0.5, 9);
    expect(neighborAlpha(crease, { x: 0.5, y: 0.5 })).toBe(1);
    expect(neighborAlpha(crease, { x: 1, y: 0.5 })).toBe(1);
    expect(neighborAlpha(crease, { x: 1.2, y: 0.5 })).toBe(0);
  });
});
