import {
  SHADE_MAX,
  SHADE_SCALE,
  SPOT_LIFT,
  SPOT_RADIUS,
  WASH_REACH,
  type Crease,
  type Light,
  type Palette,
  type Stop,
} from '../palette/harmony';
import { clampChroma, wrapHue, type Oklch } from '../palette/oklch';
import { createRng } from '../palette/rng';
import { codecText, hash32 } from './hash';

// Where each blob fades out, as a fraction of its ellipse. Varying it by
// stop keeps the blobs from reading as identical circles.
export const FALLOFF = [65, 55, 75, 60, 70] as const;

// Each blob's ellipse is the farthest-corner ellipse stretched by this much
// on each axis, so four blobs are not four copies of the canvas's shape.
export const BLOB_STRETCH: readonly [number, number] = [0.8, 1.25];

// Each blob carries a core above it: the same stop with its hue turned a
// little to one side and more chroma, at a third of the blob's ellipse,
// half transparent at the center. In a real mesh the color at a control
// point is not quite the color of the region around it.
export const CORE_SCALE = 0.35;
export const CORE_ALPHA = 0.55;
export const CORE_HUE_SHIFT: readonly [number, number] = [10, 20];
export const CORE_CHROMA_BOOST = 1.2;

// A crease's hard edge sits this far inside the ellipse, in canvas units,
// so the cut is antialiased rather than jagged. Absolute, not a fraction
// of the radius: a fold's ellipse is ten times a crease's.
export const CREASE_FEATHER = 0.006;

// Alpha in [0, 1]. Within a layer the color is constant and only alpha
// varies, so the interpolation space cannot show in either renderer.
export interface GradientStop {
  offset: number;
  color: Oklch;
  alpha: number;
}

// Radii in unit canvas space: rx in widths, ry in heights.
export interface LayerSize {
  rx: number;
  ry: number;
}

// One radial gradient in unit canvas space. Every renderer paints this list
// and nothing else, which is what keeps the CSS and the PNG identical.
export interface Layer {
  cx: number;
  cy: number;
  size: LayerSize;
  stops: GradientStop[];
  // The stop this layer follows when the mesh drifts, or null for the
  // lighting, which stays put.
  anchor: number | null;
}

function colorOf(stop: Stop): Oklch {
  return { l: stop.l, c: stop.c, h: stop.h };
}

// CSS's default radial-gradient size: an ellipse with the farthest-side
// aspect ratio, scaled by root two so its edge passes through the farthest
// corner.
export function farthestCorner(x: number, y: number): LayerSize {
  return {
    rx: Math.SQRT2 * Math.max(x, 1 - x),
    ry: Math.SQRT2 * Math.max(y, 1 - y),
  };
}

export function blobStretch(color: Oklch): { sx: number; sy: number } {
  const rng = createRng(hash32(codecText(color)));
  return {
    sx: rng.range(BLOB_STRETCH[0], BLOB_STRETCH[1]),
    sy: rng.range(BLOB_STRETCH[0], BLOB_STRETCH[1]),
  };
}

// Signed degrees the core's hue turns from the stop's, salted so it is
// independent of the stretch.
export function coreShift(color: Oklch): number {
  const rng = createRng(hash32(`core:${codecText(color)}`));
  const side = rng.chance(0.5) ? -1 : 1;
  return side * rng.range(CORE_HUE_SHIFT[0], CORE_HUE_SHIFT[1]);
}

export function coreLayer(stop: Stop, index: number): Layer {
  const blob = blobLayer(stop, index);
  const color = clampChroma({ l: stop.l, c: stop.c * CORE_CHROMA_BOOST, h: wrapHue(stop.h + coreShift(stop)) });
  return {
    cx: stop.x,
    cy: stop.y,
    size: { rx: blob.size.rx * CORE_SCALE, ry: blob.size.ry * CORE_SCALE },
    anchor: index,
    stops: [
      { offset: 0, color, alpha: CORE_ALPHA },
      { offset: 1, color, alpha: 0 },
    ],
  };
}

// Each gradient fades to its own color at alpha 0, never to transparent
// black, so only alpha varies inside a layer and the interpolation color
// space cannot show.
export function blobLayer(stop: Stop, index: number): Layer {
  const color = colorOf(stop);
  const base = farthestCorner(stop.x, stop.y);
  const { sx, sy } = blobStretch(color);
  return {
    cx: stop.x,
    cy: stop.y,
    size: { rx: base.rx * sx, ry: base.ry * sy },
    anchor: index,
    stops: [
      { offset: 0, color, alpha: 1 },
      { offset: FALLOFF[index % FALLOFF.length] / 100, color, alpha: 0 },
    ],
  };
}

export function creaseLayer(crease: Crease, stop: Stop): Layer {
  const color = colorOf(stop);
  return {
    cx: crease.cx,
    cy: crease.cy,
    size: { rx: crease.r, ry: crease.r },
    anchor: crease.stop,
    stops: [
      { offset: 0, color, alpha: 0 },
      { offset: crease.t0, color, alpha: 0 },
      { offset: crease.t1, color, alpha: 1 },
      { offset: 1 - CREASE_FEATHER / crease.r, color, alpha: 1 },
      { offset: 1, color, alpha: 0 },
    ],
  };
}

// A point of light: a small blob at the stop, lifted a little, opaque at
// the center. Sized in unit space on both axes so it follows the canvas
// aspect like everything else.
export function spotLayer(stop: Stop, index: number): Layer {
  const color = clampChroma({ l: Math.min(1, stop.l + SPOT_LIFT), c: stop.c, h: stop.h });
  return {
    cx: stop.x,
    cy: stop.y,
    size: { rx: SPOT_RADIUS, ry: SPOT_RADIUS },
    anchor: index,
    stops: [
      { offset: 0, color, alpha: 1 },
      { offset: 1, color, alpha: 0 },
    ],
  };
}

const WHITE: Oklch = { l: 1, c: 0, h: 0 };

// The lighting: a white wash from the light's edge point and, from the
// opposite edge point, a shade of the background color, which doubles as
// the vignette. Shade first, so it paints above the wash.
export function washLayers(light: Light, background: Oklch): [Layer, Layer] {
  const glow = (cx: number, cy: number, color: Oklch, alpha: number): Layer => ({
    cx,
    cy,
    size: farthestCorner(cx, cy),
    anchor: null,
    stops: [
      { offset: 0, color, alpha },
      { offset: WASH_REACH, color, alpha: 0 },
    ],
  });
  return [
    glow(1 - light.x, 1 - light.y, background, Math.min(SHADE_MAX, light.strength * SHADE_SCALE)),
    glow(light.x, light.y, WHITE, light.strength),
  ];
}

// Top layer first, the order CSS lists them in: the lighting, the spot,
// cores, blobs, creases. Creases paint below the blobs: painted above them
// a crease is an opaque disc with a hard rim, and below them the blobs'
// soft falloffs veil it, so the hard edge shows in the gaps between blob
// cores and dissolves under them, which is how a fold in the surface reads.
export function paletteToLayers(palette: Palette): Layer[] {
  return [
    ...(palette.light ? washLayers(palette.light, palette.background) : []),
    ...(palette.spot !== null ? [spotLayer(palette.stops[palette.spot], palette.spot)] : []),
    ...palette.stops.map((stop, index) => coreLayer(stop, index)),
    ...palette.stops.map((stop, index) => blobLayer(stop, index)),
    ...palette.creases.map((crease) => creaseLayer(crease, palette.stops[crease.stop])),
  ];
}
