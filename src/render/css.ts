import type { Palette } from '../palette/harmony';
import { oklchToHex, type Oklch } from '../palette/oklch';
import { paletteToLayers, type Layer } from './layers';

export { FALLOFF } from './layers';

type Paint = (color: Oklch, alpha: 0 | 1) => string;

export function formatOklch(color: Oklch, alpha: 0 | 1 = 1): string {
  const base = `${color.l.toFixed(3)} ${color.c.toFixed(3)} ${color.h.toFixed(1)}`;
  return alpha === 1 ? `oklch(${base})` : `oklch(${base} / 0)`;
}

export function formatHex(color: Oklch, alpha: 0 | 1 = 1): string {
  const hex = oklchToHex(color);
  return alpha === 1 ? hex : `${hex}00`;
}

// Whole percents stay whole ('65%'); anything else keeps one decimal ('99.2%').
function percent(fraction: number): string {
  const rounded = Math.round(fraction * 1000) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}

function layerCss(layer: Layer, paint: Paint): string {
  const x = (layer.cx * 100).toFixed(1);
  const y = (layer.cy * 100).toFixed(1);
  const size =
    layer.size === 'farthest-corner'
      ? ''
      : `${(layer.size.rx * 100).toFixed(1)}% ${(layer.size.ry * 100).toFixed(1)}% `;
  const stops = layer.stops.map((stop) => `${paint(stop.color, stop.alpha)} ${percent(stop.offset)}`).join(', ');
  return `radial-gradient(${size}at ${x}% ${y}%, ${stops})`;
}

// One background-color, then two background-image declarations: hex first,
// oklch second. An engine that cannot parse oklch() drops the second
// declaration and keeps the first, so the hex block is the fallback.
export function paletteToCss(palette: Palette): string {
  const layers = paletteToLayers(palette);
  const hexLayers = layers.map((layer) => layerCss(layer, formatHex));
  const oklchLayers = layers.map((layer) => layerCss(layer, formatOklch));
  return [
    `background-color: ${oklchToHex(palette.background)};`,
    `background-image:\n  ${hexLayers.join(',\n  ')};`,
    `background-image:\n  ${oklchLayers.join(',\n  ')};`,
  ].join('\n');
}
