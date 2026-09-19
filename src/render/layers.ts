import type { Crease, Palette, Stop } from '../palette/harmony';
import type { Oklch } from '../palette/oklch';

// Where each blob fades out, as a fraction of the gradient box. Varying it by
// stop keeps the blobs from reading as identical circles.
export const FALLOFF = [65, 55, 75, 60, 70] as const;

// A crease's hard edge sits just inside the ellipse so the cut is
// antialiased rather than jagged.
export const CREASE_EDGE = 0.992;

export interface GradientStop {
  offset: number;
  color: Oklch;
  alpha: 0 | 1;
}

export type LayerSize = 'farthest-corner' | { rx: number; ry: number };

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

// Each gradient fades to its own color at alpha 0, never to transparent
// black, so only alpha varies inside a layer and the interpolation color
// space cannot show.
export function blobLayer(stop: Stop, index: number): Layer {
  const color = colorOf(stop);
  return {
    cx: stop.x,
    cy: stop.y,
    size: 'farthest-corner',
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
