import type { Crease, Palette, Stop } from '../palette/harmony';
import type { Oklch } from '../palette/oklch';
import { createRng } from '../palette/rng';

// Where each blob fades out, as a fraction of its ellipse. Varying it by
// stop keeps the blobs from reading as identical circles.
export const FALLOFF = [65, 55, 75, 60, 70] as const;

// Each blob's ellipse is the farthest-corner ellipse stretched by this much
// on each axis, so four blobs are not four copies of the canvas's shape.
export const BLOB_STRETCH: readonly [number, number] = [0.8, 1.25];

// A crease's hard edge sits just inside the ellipse so the cut is
// antialiased rather than jagged.
export const CREASE_EDGE = 0.992;

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

// FNV-1a over a short string, into 32 bits.
function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// The stretch comes from the stop's color as the codec writes it (hue to
// two decimals, chroma and lightness to three), not from a fresh draw: a
// locked stop keeps its shape, a decoded link renders the same because the
// hash sees the same text, and a drag cannot change it because position is
// not an input.
export function blobStretch(color: Oklch): { sx: number; sy: number } {
  const rng = createRng(hash32(`${color.h.toFixed(2)},${color.c.toFixed(3)},${color.l.toFixed(3)}`));
  return {
    sx: rng.range(BLOB_STRETCH[0], BLOB_STRETCH[1]),
    sy: rng.range(BLOB_STRETCH[0], BLOB_STRETCH[1]),
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
    stops: [
      { offset: 0, color, alpha: 0 },
      { offset: crease.t0, color, alpha: 0 },
      { offset: crease.t1, color, alpha: 1 },
      { offset: CREASE_EDGE, color, alpha: 1 },
      { offset: 1, color, alpha: 0 },
    ],
  };
}

// Top layer first, the order CSS lists them in. Creases paint below the
// blobs: painted above them a crease is an opaque disc with a hard rim, and
// below them the blobs' soft falloffs veil it, so the hard edge shows in the
// gaps between blob cores and dissolves under them, which is how a fold in
// the surface reads.
export function paletteToLayers(palette: Palette): Layer[] {
  return [
    ...palette.stops.map((stop, index) => blobLayer(stop, index)),
    ...palette.creases.map((crease) => creaseLayer(crease, palette.stops[crease.stop])),
  ];
}
