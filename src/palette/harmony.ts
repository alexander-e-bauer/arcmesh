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

// Lightness is a ramp, never sampled per stop: every mesh gets a bright
// region and a deep one.
export const LIGHTNESS_MIN = 0.45;
export const LIGHTNESS_MAX = 0.85;
export const LIGHTNESS_JITTER = 0.04;

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

export function pickLightness(rng: Rng, count: number): number[] {
  const step = (LIGHTNESS_MAX - LIGHTNESS_MIN) / (count - 1);
  const ramp: number[] = [];
  for (let i = 0; i < count; i++) {
    ramp.push(LIGHTNESS_MIN + i * step + rng.range(-LIGHTNESS_JITTER, LIGHTNESS_JITTER));
  }
  return rng.shuffle(ramp);
}

// Highest at mid lightness, falling to zero at both ends.
export function chromaCeiling(l: number): number {
  return CHROMA_PEAK * Math.sin(Math.PI * Math.min(1, Math.max(0, l)));
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
  const lightness = pickLightness(rng, count);
  const chromaScale = rng.range(0.7, 1.0);
  const positions = pickPositions(rng, count);

  const stops: Stop[] = hues.map((h, i) => {
    const l = lightness[i];
    let c = chromaCeiling(l) * chromaScale;
    if (i === accentIndex) c *= ACCENT_CHROMA_SCALE;
    const color = clampChroma({ l, c, h });
    return { ...color, x: positions[i].x, y: positions[i].y, locked: false };
  });

  const background = clampChroma({
    l: rng.chance(0.5) ? BACKGROUND_DARK : BACKGROUND_LIGHT,
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
