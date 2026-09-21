import type { Palette } from '../palette/harmony';
import { oklchToHex, type Oklch } from '../palette/oklch';
import { GRAIN_BLEND, grainCssLayer } from './grain';
import { paletteToLayers, type Layer } from './layers';
import { WARP_REFERENCE_WIDTH, warpFilterCss } from './warp';

export { FALLOFF } from './layers';

type Paint = (color: Oklch, alpha: number) => string;

// The text after `at`: where a layer's center is written. The still CSS
// writes the percentages; the drift stylesheet writes custom properties.
export type Position = (layer: Layer) => string;

export function literalPosition(layer: Layer): string {
  return `${(layer.cx * 100).toFixed(1)}% ${(layer.cy * 100).toFixed(1)}%`;
}

// Alpha 1 and 0 keep their short forms so every layer that existed before
// fractional alpha still reads the same; a fraction gets two decimals.
export function formatOklch(color: Oklch, alpha = 1): string {
  const base = `${color.l.toFixed(3)} ${color.c.toFixed(3)} ${color.h.toFixed(1)}`;
  if (alpha === 1) return `oklch(${base})`;
  if (alpha === 0) return `oklch(${base} / 0)`;
  return `oklch(${base} / ${alpha.toFixed(2)})`;
}

export function formatHex(color: Oklch, alpha = 1): string {
  const hex = oklchToHex(color);
  if (alpha === 1) return hex;
  return `${hex}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;
}

// Whole percents stay whole ('65%'); anything else keeps one decimal ('99.2%').
function percent(fraction: number): string {
  const rounded = Math.round(fraction * 1000) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}

function layerCss(layer: Layer, paint: Paint, position: Position): string {
  const size = `${(layer.size.rx * 100).toFixed(1)}% ${(layer.size.ry * 100).toFixed(1)}%`;
  const stops = layer.stops.map((stop) => `${paint(stop.color, stop.alpha)} ${percent(stop.offset)}`).join(', ');
  return `radial-gradient(${size} at ${position(layer)}, ${stops})`;
}

// One background-color, then two background-image declarations: hex first,
// oklch second. An engine that cannot parse oklch() drops the second
// declaration and keeps the first, so the hex block is the fallback. The
// grain tile heads both blocks, and the blend-mode list names it alone,
// one entry per layer, because a shorter list would repeat. A palette with
// a warp ends with a filter declaration. The optional position function lets
// the drift stylesheet reuse everything here with custom properties in place
// of the percentages.
export function paletteToCss(palette: Palette, position: Position = literalPosition): string {
  const layers = paletteToLayers(palette);
  const grain = grainCssLayer();
  const hexLayers = [grain, ...layers.map((layer) => layerCss(layer, formatHex, position))];
  const oklchLayers = [grain, ...layers.map((layer) => layerCss(layer, formatOklch, position))];
  const blends = [GRAIN_BLEND, ...layers.map(() => 'normal')];
  const declarations = [
    `background-color: ${oklchToHex(palette.background)};`,
    `background-image:\n  ${hexLayers.join(',\n  ')};`,
    `background-image:\n  ${oklchLayers.join(',\n  ')};`,
    `background-blend-mode: ${blends.join(', ')};`,
  ];
  // The warp is a filter over the whole element, written for the width
  // of the app's preview; a link from before the warp emits none.
  if (palette.warp) declarations.push(`filter: ${warpFilterCss(palette.warp, WARP_REFERENCE_WIDTH)};`);
  return declarations.join('\n');
}
