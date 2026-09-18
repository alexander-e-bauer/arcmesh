import { clampChroma, wrapHue, type Oklch } from './oklch';
import { createRng, type Rng } from './rng';

export interface Stop extends Oklch {
  x: number;
  y: number;
  locked: boolean;
}

// A crease is the fold a real mesh gradient produces: a hard curved edge on
// one side of a color region. It is an ellipse of the stop's color whose
// center sits off-canvas, so one arc of its edge crosses the canvas. All in
// unit canvas coordinates (x in widths, y in heights).
export interface Crease {
  stop: number;
  cx: number;
  cy: number;
  r: number;
  t0: number;
  t1: number;
}

export interface Palette {
  stops: Stop[];
  creases: Crease[];
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

export const CREASE_MAX = 2;
// A crease is anchored to its stop. Its center sits along a random direction
// from the stop, at least this far past the canvas edge, so only one arc of
// the ellipse crosses the canvas.
export const CREASE_BEYOND: readonly [number, number] = [0.15, 0.5];
export const CREASE_MIN_DISTANCE = 0.5;
// How far the hard edge bulges past the stop, away from the center.
export const CREASE_INSET: readonly [number, number] = [0.05, 0.2];
// The opaque band runs from the edge back past the stop by this much, then
// fades out over this length, both in unit canvas units.
export const CREASE_BAND: readonly [number, number] = [0.05, 0.2];
export const CREASE_FADE: readonly [number, number] = [0.25, 0.45];

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

export function pickCreaseCount(rng: Rng): number {
  const u = rng.next();
  if (u < 0.35) return 0;
  if (u < 0.8) return 1;
  return 2;
}

// Distance from a point inside the unit square to its edge along a direction.
export function exitDistance(x: number, y: number, dx: number, dy: number): number {
  const tx = dx > 0 ? (1 - x) / dx : dx < 0 ? -x / dx : Infinity;
  const ty = dy > 0 ? (1 - y) / dy : dy < 0 ? -y / dy : Infinity;
  return Math.max(0, Math.min(tx, ty));
}

export function pickCreases(rng: Rng, stops: readonly Point[]): Crease[] {
  const n = pickCreaseCount(rng);
  const chosen = rng.shuffle(Array.from({ length: stops.length }, (_, i) => i)).slice(0, n);
  return chosen.map((stop) => {
    const { x, y } = stops[stop];
    const theta = rng.range(0, 2 * Math.PI);
    const dx = Math.cos(theta);
    const dy = Math.sin(theta);
    const beyond = rng.range(CREASE_BEYOND[0], CREASE_BEYOND[1]);
    const s = rng.range(CREASE_INSET[0], CREASE_INSET[1]);
    const band = rng.range(CREASE_BAND[0], CREASE_BAND[1]);
    const fade = rng.range(CREASE_FADE[0], CREASE_FADE[1]);
    // The center sits past the canvas edge; the hard edge bulges past the
    // stop on the far side; the opaque band reaches back past the stop and
    // then fades toward the center, on-canvas.
    const d = Math.max(CREASE_MIN_DISTANCE, exitDistance(x, y, dx, dy)) + beyond;
    const r = d + s;
    const t1 = Math.max(0.05, (d - band) / r);
    const t0 = Math.max(0, t1 - fade / r);
    return { stop, cx: x + d * dx, cy: y + d * dy, r, t0, t1 };
  });
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
  const creases = pickCreases(rng, positions);

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

  return { stops, creases, background, seed };
}

export function rerollPalette(previous: Palette, seed: number): Palette {
  const fresh = generatePalette(seed, { count: previous.stops.length });
  const locked = new Set(previous.stops.flatMap((stop, i) => (stop.locked ? [i] : [])));
  // A locked stop keeps its creases; fresh creases never land on it, and the
  // total stays capped by dropping fresh ones first.
  const kept = previous.creases.filter((c) => locked.has(c.stop));
  const added = fresh.creases.filter((c) => !locked.has(c.stop)).slice(0, Math.max(0, CREASE_MAX - kept.length));
  return {
    ...fresh,
    stops: fresh.stops.map((stop, i) => (previous.stops[i].locked ? previous.stops[i] : stop)),
    creases: [...kept, ...added],
  };
}
