import { clampChroma, wrapHue, type Oklch } from './oklch';
import { createRng, type Rng } from './rng';

export interface Stop extends Oklch {
  x: number;
  y: number;
  locked: boolean;
}

export interface Palette {
  stops: Stop[];
  background: Oklch;
  seed: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Hues {
  baseHue: number;
  arc: number;
  accentIndex: number;
  hues: number[];
}

// Hues sit on one arc of the wheel. Far-apart hues blend through a grey
// middle in a mesh, so the arc stays narrow and the one allowed exception,
// the accent, gives up chroma to compensate.
export const ARC_MIN = 30;
export const ARC_MAX = 90;
export const ACCENT_PROBABILITY = 0.35;
export const ACCENT_CHROMA_SCALE = 0.6;

// An accent in the brightest slot was landing near 0.04 chroma, which reads
// grey; the floor keeps it a color. The gamut clamp may still lower it.
export const ACCENT_CHROMA_MIN = 0.05;

// Lightness is a ramp, never sampled per stop: every mesh gets a bright
// region and a deep one.
export const LIGHTNESS_MIN = 0.45;
export const LIGHTNESS_MAX = 0.85;
export const LIGHTNESS_JITTER = 0.04;

// Yellow has almost no chroma at mid lightness, so a palette based in the
// band around hue 100 lifts its ramp. The weight is a raised cosine, 1 at
// the band center, 0 at its edges.
export const BAND_CENTER = 100;
export const BAND_HALF_WIDTH = 50;
export const BAND_LIFT_MIN = 0.18;
export const BAND_LIFT_MAX = 0.08;

export const CHROMA_PEAK = 0.2;

export const BACKGROUND_CHROMA = 0.02;
export const BACKGROUND_DARK = 0.16;
export const BACKGROUND_LIGHT = 0.94;

export const POSITION_JITTER = 0.15;

const QUADRANTS: ReadonlyArray<readonly [number, number]> = [
  [0.25, 0.25],
  [0.75, 0.25],
  [0.25, 0.75],
  [0.75, 0.75],
];
const CENTER: readonly [number, number] = [0.5, 0.5];

export function pickStopCount(rng: Rng): 4 | 5 {
  return rng.chance(0.7) ? 4 : 5;
}

export function pickHues(rng: Rng, count: number): Hues {
  const baseHue = rng.range(0, 360);
  const arc = rng.range(ARC_MIN, ARC_MAX);
  const step = arc / (count - 1);

  const hues: number[] = [];
  for (let i = 0; i < count; i++) {
    const jitter = rng.range(-step * 0.2, step * 0.2);
    const offset = Math.min(arc, Math.max(0, i * step + jitter));
    hues.push(wrapHue(baseHue + offset));
  }

  const accentIndex = rng.chance(ACCENT_PROBABILITY) ? rng.int(0, count - 1) : -1;
  if (accentIndex >= 0) {
    hues[accentIndex] = wrapHue(baseHue + 180 + rng.range(-30, 30));
  }

  return { baseHue, arc, accentIndex, hues };
}

export function bandWeight(h: number): number {
  const delta = Math.abs(wrapHue(h) - BAND_CENTER);
  const dist = Math.min(delta, 360 - delta);
  if (dist >= BAND_HALF_WIDTH) return 0;
  return 0.5 * (1 + Math.cos((Math.PI * dist) / BAND_HALF_WIDTH));
}

// The accent is left out: a blue palette with a yellow accent must not be
// lifted into pastel.
export function paletteBandWeight(hues: number[], accentIndex: number): number {
  return Math.max(0, ...hues.filter((_, i) => i !== accentIndex).map(bandWeight));
}

export function pickLightness(rng: Rng, count: number, w = 0): number[] {
  const min = LIGHTNESS_MIN + BAND_LIFT_MIN * w;
  const max = LIGHTNESS_MAX + BAND_LIFT_MAX * w;
  const step = (max - min) / (count - 1);
  const ramp: number[] = [];
  for (let i = 0; i < count; i++) {
    ramp.push(min + i * step + rng.range(-LIGHTNESS_JITTER, LIGHTNESS_JITTER));
  }
  return rng.shuffle(ramp);
}

// Highest at mid lightness, zero at both ends. The square root keeps bright
// stops colorful: the plain sine fell below the gamut for most hues at 0.85.
export function chromaCeiling(l: number): number {
  const clamped = Math.min(1, Math.max(0, l));
  return CHROMA_PEAK * Math.sqrt(Math.max(0, Math.sin(Math.PI * clamped)));
}

export function pickPositions(rng: Rng, count: number): Point[] {
  const anchors = count > 4 ? [...QUADRANTS, CENTER] : [...QUADRANTS];
  return rng
    .shuffle(anchors)
    .slice(0, count)
    .map(([x, y]) => ({
      x: x + rng.range(-POSITION_JITTER, POSITION_JITTER),
      y: y + rng.range(-POSITION_JITTER, POSITION_JITTER),
    }));
}

export interface GenerateOptions {
  count?: number;
}

export function generatePalette(seed: number, options: GenerateOptions = {}): Palette {
  const rng = createRng(seed);

  // Always draw the count so the sequence is the same whether or not the
  // caller supplied one.
  const drawnCount = pickStopCount(rng);
  const count = options.count ?? drawnCount;

  const { baseHue, accentIndex, hues } = pickHues(rng, count);
  const w = paletteBandWeight(hues, accentIndex);
  const lightness = pickLightness(rng, count, w);
  if (accentIndex >= 0 && bandWeight(hues[accentIndex]) >= 0.5) {
    // A dim yellow accent is olive; give it the brightest slot.
    const brightest = lightness.indexOf(Math.max(...lightness));
    [lightness[accentIndex], lightness[brightest]] = [lightness[brightest], lightness[accentIndex]];
  }
  const chromaScale = rng.range(0.7, 1.0);
  const positions = pickPositions(rng, count);

  const stops: Stop[] = hues.map((h, i) => {
    const l = lightness[i];
    let c = chromaCeiling(l) * chromaScale;
    if (i === accentIndex) c = Math.max(ACCENT_CHROMA_MIN, c * ACCENT_CHROMA_SCALE);
    const color = clampChroma({ l, c, h });
    return { ...color, x: positions[i].x, y: positions[i].y, locked: false };
  });

  // The flip is always drawn so the sequence does not depend on the weight.
  const dark = rng.chance(0.5);
  const background = clampChroma({
    l: dark || w >= 0.5 ? BACKGROUND_DARK : BACKGROUND_LIGHT,
    c: BACKGROUND_CHROMA,
    h: baseHue,
  });

  return { stops, background, seed };
}

export function rerollPalette(previous: Palette, seed: number): Palette {
  const fresh = generatePalette(seed, { count: previous.stops.length });
  return {
    ...fresh,
    stops: fresh.stops.map((stop, i) => (previous.stops[i].locked ? previous.stops[i] : stop)),
  };
}
