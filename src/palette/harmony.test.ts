import { describe, expect, it } from 'vitest';
import {
  ACCENT_CHROMA_MIN,
  ACCENT_OFFSET,
  ARC_MAX,
  ARC_MIN,
  BAND_LIFT_MIN,
  bandWeight,
  chromaCeiling,
  coversOtherStop,
  CREASE_BEYOND,
  CREASE_INSET,
  CREASE_MAX,
  CREASE_MIN_DISTANCE,
  DEEP_DROP,
  DEEP_PROBABILITY,
  exitDistance,
  FOLD_BEYOND,
  FOLD_PROBABILITY,
  generatePalette,
  LIGHTNESS_JITTER,
  LIGHTNESS_MIN,
  moveStop,
  neighborAlpha,
  paletteBandWeight,
  pickCreaseCount,
  pickCreases,
  pickHues,
  pickLightness,
  pickPositions,
  pickStopCount,
  rerollPalette,
  SPOT_PROBABILITY,
  WARP_FREQUENCY,
  WARP_SEED_MAX,
  WARP_STRENGTH,
  WASH_STRENGTH,
} from './harmony';
import { createRng } from './rng';
import { clampChroma } from './oklch';
import { decodePalette, encodePalette } from './codec';

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

  it('places the accent split-complementary to the arc center, on either side', () => {
    const rng = createRng(3);
    let accents = 0;
    let clockwise = 0;
    for (let i = 0; i < 1000; i++) {
      const { baseHue, arc, accentIndex, hues } = pickHues(rng, 4);
      if (accentIndex < 0) continue;
      accents++;
      const delta = signedHueDelta(baseHue + arc / 2, hues[accentIndex]);
      expect(Math.abs(delta)).toBeGreaterThanOrEqual(ACCENT_OFFSET[0] - 1e-9);
      expect(Math.abs(delta)).toBeLessThanOrEqual(ACCENT_OFFSET[1] + 1e-9);
      if (delta > 0) clockwise++;
    }
    expect(accents).toBeGreaterThan(250);
    expect(accents).toBeLessThan(450);
    expect(clockwise / accents).toBeGreaterThan(0.4);
    expect(clockwise / accents).toBeLessThan(0.6);
  });

  it('never puts the accent within 60 degrees of any arc stop', () => {
    const rng = createRng(5);
    for (let i = 0; i < 1000; i++) {
      const { accentIndex, hues } = pickHues(rng, 5);
      if (accentIndex < 0) continue;
      hues.forEach((h, index) => {
        if (index === accentIndex) return;
        expect(Math.abs(signedHueDelta(h, hues[accentIndex]))).toBeGreaterThanOrEqual(60 - 1e-9);
      });
    }
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

  it('gives every accent the brightest slot, in the band or out of it', () => {
    let inBand = 0;
    let outOfBand = 0;
    for (let seed = 1; seed <= 600; seed++) {
      const { hues, accentIndex } = huesFor(seed);
      if (accentIndex < 0) continue;
      const palette = generatePalette(seed);
      const brightest = Math.max(...palette.stops.map((stop) => stop.l));
      expect(palette.stops[accentIndex].l).toBe(brightest);
      if (bandWeight(hues[accentIndex]) >= 0.5) inBand++;
      else outOfBand++;
    }
    expect(inBand).toBeGreaterThan(5);
    expect(outOfBand).toBeGreaterThan(50);
  });

  it('hands the darkest slot of a yellow-band palette to its greenest arc stop', () => {
    let checked = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const { baseHue, hues, accentIndex } = huesFor(seed);
      if (paletteBandWeight(hues, accentIndex) < 0.5) continue;
      const palette = generatePalette(seed);
      const arcStops = palette.stops.map((stop, i) => ({ stop, i })).filter(({ i }) => i !== accentIndex);
      const greenest = arcStops.reduce((best, cur) =>
        signedHueDelta(baseHue, cur.stop.h) > signedHueDelta(baseHue, best.stop.h) ? cur : best,
      );
      const darkest = Math.min(...arcStops.map(({ stop }) => stop.l));
      expect(greenest.stop.l).toBe(darkest);
      checked++;
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('lights every palette from a point on the canvas edge, at a strength in range', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const { light } = generatePalette(seed);
      expect(light).not.toBeNull();
      const onEdge = [light!.x, light!.y].some((v) => Math.abs(v) < 1e-9 || Math.abs(v - 1) < 1e-9);
      expect(onEdge).toBe(true);
      expect(light!.x).toBeGreaterThanOrEqual(-1e-9);
      expect(light!.x).toBeLessThanOrEqual(1 + 1e-9);
      expect(light!.y).toBeGreaterThanOrEqual(-1e-9);
      expect(light!.y).toBeLessThanOrEqual(1 + 1e-9);
      expect(light!.strength).toBeGreaterThanOrEqual(WASH_STRENGTH[0]);
      expect(light!.strength).toBeLessThanOrEqual(WASH_STRENGTH[1]);
    }
  });

  it('puts a spot on about three in ten palettes, always on the brightest stop', () => {
    let spots = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const palette = generatePalette(seed);
      if (palette.spot === null) continue;
      spots++;
      const brightest = Math.max(...palette.stops.map((stop) => stop.l));
      expect(palette.stops[palette.spot].l).toBe(brightest);
    }
    expect(spots / 1000).toBeGreaterThan(SPOT_PROBABILITY - 0.05);
    expect(spots / 1000).toBeLessThan(SPOT_PROBABILITY + 0.05);
  });

  it('draws the light and the spot after the deep drop, so the drop is unchanged by them', () => {
    // Rebuild every draw up to the drop in the documented order and check
    // the drop's own effect matches: a seed's darkest slot is the same as
    // it was before the light and the spot were drawn.
    let deep = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const rng = createRng(seed);
      const count = pickStopCount(rng);
      const { hues, accentIndex } = pickHues(rng, count);
      const w = paletteBandWeight(hues, accentIndex);
      pickLightness(rng, count, w);
      rng.range(0.7, 1.0);
      const positions = pickPositions(rng, count);
      pickCreases(rng, positions);
      rng.chance(0.5);
      const drop = rng.range(DEEP_DROP[0], DEEP_DROP[1]);
      const dropped = rng.chance(DEEP_PROBABILITY);
      const palette = generatePalette(seed);
      const darkest = Math.min(...palette.stops.map((stop) => stop.l));
      if (dropped && w === 0) {
        deep++;
        expect(darkest).toBeLessThan(LIGHTNESS_MIN - LIGHTNESS_JITTER + 1e-9);
        expect(darkest).toBeGreaterThanOrEqual(LIGHTNESS_MIN - LIGHTNESS_JITTER - drop - 1e-9);
      }
    }
    expect(deep).toBeGreaterThan(30);
  });

  it('drops the darkest slot below the ramp on some palettes outside the yellow band, never inside it', () => {
    // The ramp alone never goes below this; only the deep drop can.
    const rampFloor = LIGHTNESS_MIN - LIGHTNESS_JITTER - 1e-9;
    let outside = 0;
    let deep = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const { hues, accentIndex } = huesFor(seed);
      const w = paletteBandWeight(hues, accentIndex);
      const darkest = Math.min(...generatePalette(seed).stops.map((stop) => stop.l));
      if (w >= 1 - 1e-9) {
        expect(darkest).toBeGreaterThanOrEqual(LIGHTNESS_MIN + BAND_LIFT_MIN - LIGHTNESS_JITTER - 1e-9);
        continue;
      }
      if (w > 0) continue;
      outside++;
      if (darkest < rampFloor) {
        deep++;
        expect(darkest).toBeGreaterThanOrEqual(rampFloor - DEEP_DROP[1]);
        expect(darkest).toBeLessThanOrEqual(LIGHTNESS_MIN + LIGHTNESS_JITTER - DEEP_DROP[0] + 1e-9);
      }
    }
    expect(outside).toBeGreaterThan(200);
    expect(deep / outside).toBeGreaterThan(DEEP_PROBABILITY - 0.1);
    expect(deep / outside).toBeLessThan(DEEP_PROBABILITY + 0.1);
  });

  it('draws the deep drop after the positions, so they stay put for existing seeds', () => {
    // Rebuild the draws up to the positions in the documented order; the
    // palette's positions must come from those same draws.
    for (let seed = 1; seed <= 200; seed++) {
      const rng = createRng(seed);
      const count = pickStopCount(rng);
      const { hues, accentIndex } = pickHues(rng, count);
      pickLightness(rng, count, paletteBandWeight(hues, accentIndex));
      rng.range(0.7, 1.0);
      const positions = pickPositions(rng, count);
      expect(generatePalette(seed).stops.map(({ x, y }) => ({ x, y }))).toEqual(positions);
    }
  });

  it('warps every palette, with an integer seed and the frequency and strength in range', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { warp } = generatePalette(seed);
      expect(warp).not.toBeNull();
      expect(Number.isInteger(warp!.seed)).toBe(true);
      expect(warp!.seed).toBeGreaterThanOrEqual(1);
      expect(warp!.seed).toBeLessThanOrEqual(WARP_SEED_MAX);
      expect(warp!.frequency).toBeGreaterThanOrEqual(WARP_FREQUENCY[0]);
      expect(warp!.frequency).toBeLessThanOrEqual(WARP_FREQUENCY[1]);
      expect(warp!.strength).toBeGreaterThanOrEqual(WARP_STRENGTH[0]);
      expect(warp!.strength).toBeLessThanOrEqual(WARP_STRENGTH[1]);
    }
  });

  it('draws the warp after the spot, so the light and the spot are unchanged by it', () => {
    // Rebuild every draw up to the spot in the documented order; the
    // light must come from those draws and the warp seed from the next.
    for (let seed = 1; seed <= 300; seed++) {
      const rng = createRng(seed);
      const count = pickStopCount(rng);
      const { hues, accentIndex } = pickHues(rng, count);
      const w = paletteBandWeight(hues, accentIndex);
      pickLightness(rng, count, w);
      rng.range(0.7, 1.0);
      const positions = pickPositions(rng, count);
      pickCreases(rng, positions);
      rng.chance(0.5);
      rng.range(DEEP_DROP[0], DEEP_DROP[1]);
      rng.chance(DEEP_PROBABILITY);
      const phi = rng.range(0, 2 * Math.PI);
      const strength = rng.range(WASH_STRENGTH[0], WASH_STRENGTH[1]);
      rng.chance(SPOT_PROBABILITY);
      const warpSeed = rng.int(1, WARP_SEED_MAX);
      const warpFrequency = rng.range(WARP_FREQUENCY[0], WARP_FREQUENCY[1]);
      const warpStrength = rng.range(WARP_STRENGTH[0], WARP_STRENGTH[1]);
      const palette = generatePalette(seed);
      expect(palette.light!.strength).toBe(strength);
      const reach = exitDistance(0.5, 0.5, Math.cos(phi), Math.sin(phi));
      expect(palette.light!.x).toBeCloseTo(0.5 + reach * Math.cos(phi), 12);
      expect(palette.warp!.seed).toBe(warpSeed);
      expect(palette.warp!.frequency).toBe(warpFrequency);
      expect(palette.warp!.strength).toBe(warpStrength);
    }
  });

  it('starts still: drift is off for every generated palette', () => {
    for (let seed = 1; seed <= 50; seed++) expect(generatePalette(seed).drift).toBe(false);
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

  it('keeps a spot on a locked stop, otherwise takes the fresh one unless it lands on a locked stop', () => {
    let kept = 0;
    let fresh = 0;
    let dropped = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const first = generatePalette(seed);
      if (first.spot === null) continue;
      const locked = { ...first, stops: first.stops.map((stop, i) => (i === first.spot ? { ...stop, locked: true } : stop)) };
      const next = rerollPalette(locked, seed + 1000);
      expect(next.spot).toBe(first.spot);
      kept++;
      // Lock a different stop instead: the previous spot is not kept.
      const other = (first.spot + 1) % first.stops.length;
      const lockedOther = { ...first, stops: first.stops.map((stop, i) => (i === other ? { ...stop, locked: true } : stop)) };
      const generated = generatePalette(seed + 1000, { count: first.stops.length });
      const rerolled = rerollPalette(lockedOther, seed + 1000);
      if (generated.spot === null || generated.spot === other) {
        expect(rerolled.spot).toBeNull();
        dropped++;
      } else {
        expect(rerolled.spot).toBe(generated.spot);
        fresh++;
      }
    }
    expect(kept).toBeGreaterThan(50);
    expect(fresh).toBeGreaterThan(10);
    expect(dropped).toBeGreaterThan(10);
  });

  it('takes the light from the fresh palette on reroll', () => {
    const first = generatePalette(8);
    const next = rerollPalette(first, 9);
    expect(next.light).toEqual(generatePalette(9, { count: first.stops.length }).light);
  });

  it('takes the warp from the fresh palette on reroll', () => {
    const first = generatePalette(8);
    const next = rerollPalette(first, 9);
    expect(next.warp).toEqual(generatePalette(9, { count: first.stops.length }).warp);
    expect(next.warp).not.toEqual(first.warp);
  });

  it('leaves the warp alone when a stop is dragged', () => {
    const palette = generatePalette(8);
    expect(moveStop(palette, 0, 0.4, 0.6).warp).toBe(palette.warp);
  });

  it('keeps the play state through a reroll, on or off', () => {
    const still = generatePalette(8);
    expect(rerollPalette(still, 9).drift).toBe(false);
    const moving = { ...still, drift: true };
    const next = rerollPalette(moving, 9);
    expect(next.drift).toBe(true);
    expect(next.seed).toBe(9);
  });

  it('keeps the play state when a stop is dragged', () => {
    const moving = { ...generatePalette(8), drift: true };
    expect(moveStop(moving, 0, 0.4, 0.6).drift).toBe(true);
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
        expect(c.cx).toBeGreaterThanOrEqual(-12);
        expect(c.cx).toBeLessThanOrEqual(13);
        expect(c.cy).toBeGreaterThanOrEqual(-12);
        expect(c.cy).toBeLessThanOrEqual(13);
        expect(c.r).toBeGreaterThanOrEqual(0.2);
        expect(c.r).toBeLessThanOrEqual(10);
        expect(c.t0).toBeGreaterThanOrEqual(0);
        expect(c.t0).toBeLessThan(c.t1);
        expect(c.t1).toBeLessThanOrEqual(0.999);
        // The opaque band starts past the stop, on the center side.
        expect(c.t1 * c.r).toBeLessThanOrEqual(d + 1e-9);
      }
    }
    expect(seen).toBeGreaterThan(200);
  });

  it('make about four in ten creases straight folds, far enough out to bow under 0.035 over a unit chord', () => {
    const rng = createRng(34);
    let folds = 0;
    let total = 0;
    for (let i = 0; i < 1000; i++) {
      const positions = pickPositions(rng, i % 2 === 0 ? 4 : 5);
      for (const c of pickCreases(rng, positions)) {
        total++;
        const { x, y } = positions[c.stop];
        const d = Math.hypot(c.cx - x, c.cy - y);
        const exit = exitDistance(x, y, (c.cx - x) / d, (c.cy - y) / d);
        const beyond = d - Math.max(CREASE_MIN_DISTANCE, exit);
        if (beyond >= FOLD_BEYOND[0] - 1e-9) {
          folds++;
          expect(beyond).toBeLessThanOrEqual(FOLD_BEYOND[1] + 1e-9);
          expect(c.r - Math.sqrt(c.r * c.r - 0.25)).toBeLessThan(0.035);
        } else {
          expect(beyond).toBeGreaterThanOrEqual(CREASE_BEYOND[0] - 1e-9);
          expect(beyond).toBeLessThanOrEqual(CREASE_BEYOND[1] + 1e-9);
        }
      }
    }
    expect(total).toBeGreaterThan(500);
    expect(folds / total).toBeGreaterThan(FOLD_PROBABILITY - 0.06);
    expect(folds / total).toBeLessThan(FOLD_PROBABILITY + 0.06);
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

  // A palette whose stop 0 carries a crease, with stop 0 locked.
  function lockedWithCrease() {
    let seed = 1;
    while (!generatePalette(seed).creases.some((c) => c.stop === 0)) seed++;
    const first = generatePalette(seed);
    return {
      ...first,
      stops: first.stops.map((stop, i) => (i === 0 ? { ...stop, locked: true } : stop)),
    };
  }

  // The geometry every placed crease satisfies, kept or re-placed.
  function expectAnchored(c: ReturnType<typeof generatePalette>['creases'][number], at: { x: number; y: number }) {
    const d = Math.hypot(c.cx - at.x, c.cy - at.y);
    expect(d).toBeGreaterThanOrEqual(CREASE_MIN_DISTANCE + CREASE_BEYOND[0] - 1e-9);
    expect(c.cx < 0 || c.cx > 1 || c.cy < 0 || c.cy > 1).toBe(true);
    expect(c.r - d).toBeGreaterThanOrEqual(CREASE_INSET[0] - 1e-9);
    expect(c.r - d).toBeLessThanOrEqual(CREASE_INSET[1] + 1e-9);
    expect(c.t1 * c.r).toBeLessThanOrEqual(d + 1e-9);
  }

  it('keep a locked stop creased through a reroll and never land fresh on a locked stop', () => {
    const locked = lockedWithCrease();
    const kept = locked.creases.find((c) => c.stop === 0)!;
    let verbatim = 0;
    let replaced = 0;
    for (let next = 100; next < 220; next++) {
      const rerolled = rerollPalette(locked, next);
      const positions = rerolled.stops.map(({ x, y }) => ({ x, y }));
      expect(rerolled.creases.length).toBeLessThanOrEqual(CREASE_MAX);
      const own = rerolled.creases.filter((c) => c.stop === 0);
      expect(own).toHaveLength(1);
      expectAnchored(own[0], positions[0]);
      // Kept as it was when it can be; re-placed only when it would have
      // sat on a fresh stop.
      if (own[0].cx === kept.cx && own[0].cy === kept.cy && own[0].r === kept.r) {
        verbatim++;
        expect(coversOtherStop(kept, positions)).toBe(false);
      } else {
        replaced++;
        expect(coversOtherStop(kept, positions)).toBe(true);
      }
      const fresh = generatePalette(next, { count: locked.stops.length }).creases.filter((c) => c.stop !== 0);
      for (const c of rerolled.creases.filter((c) => c.stop !== 0)) {
        expectAnchored(c, positions[c.stop]);
        const original = fresh.find((f) => f.stop === c.stop)!;
        expect(original).toBeDefined();
        // A fresh crease is taken as drawn unless it sat on the locked
        // stop's real position.
        if (!coversOtherStop(original, positions)) expect(c).toEqual(original);
      }
    }
    expect(verbatim).toBeGreaterThan(5);
    expect(replaced).toBeGreaterThan(20);
  });

  it('re-place a crease from its own stop, deterministically, and rarely leave it on a stop', () => {
    const locked = lockedWithCrease();
    let covered = 0;
    let total = 0;
    for (let next = 300; next < 600; next++) {
      const a = rerollPalette(locked, next);
      expect(rerollPalette(locked, next)).toEqual(a);
      const positions = a.stops.map(({ x, y }) => ({ x, y }));
      for (const c of a.creases) {
        total++;
        if (coversOtherStop(c, positions)) covered++;
      }
    }
    expect(total).toBeGreaterThan(300);
    expect(covered / total).toBeLessThan(0.15);
  });

  it('move with their stop when it is dragged, by the same delta', () => {
    const locked = lockedWithCrease();
    const before = locked.creases.find((c) => c.stop === 0)!;
    const others = locked.creases.filter((c) => c.stop !== 0);
    const { x, y } = locked.stops[0];
    const moved = moveStop(locked, 0, x + 0.3, y - 0.2);
    expect(moved.stops[0]).toEqual({ ...locked.stops[0], x: x + 0.3, y: y - 0.2 });
    expect(moved.stops.slice(1)).toEqual(locked.stops.slice(1));
    const after = moved.creases.find((c) => c.stop === 0)!;
    expect(after.cx).toBeCloseTo(before.cx + 0.3, 12);
    expect(after.cy).toBeCloseTo(before.cy - 0.2, 12);
    expect([after.r, after.t0, after.t1]).toEqual([before.r, before.t0, before.t1]);
    expect(moved.creases.filter((c) => c.stop !== 0)).toEqual(others);
    expect(moved.background).toBe(locked.background);
    expect(moved.seed).toBe(locked.seed);
  });

  it('stay inside the codec window through any drag across the canvas', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const palette = generatePalette(seed);
      for (const c of palette.creases) {
        for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          const moved = moveStop(palette, c.stop, x, y);
          const roundTrip = decodePalette(encodePalette(moved));
          expect(roundTrip).not.toBeNull();
        }
      }
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
