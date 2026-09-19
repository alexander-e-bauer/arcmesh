import type { Palette } from '../palette/harmony';
import { oklchToHex, type Oklch } from '../palette/oklch';
import { GRAIN_BLEND, grainCssLayer } from './grain';
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
  const size = `${(layer.size.rx * 100).toFixed(1)}% ${(layer.size.ry * 100).toFixed(1)}%`;
  const stops = layer.stops.map((stop) => `${paint(stop.color, stop.alpha)} ${percent(stop.offset)}`).join(', ');
  return `radial-gradient(${size} at ${x}% ${y}%, ${stops})`;
}

// One background-color, then two background-image declarations: hex first,
// oklch second. An engine that cannot parse oklch() drops the second
// declaration and keeps the first, so the hex block is the fallback. The
// grain tile heads both blocks, and the blend-mode list names it alone,
// one entry per layer, because a shorter list would repeat.
export function paletteToCss(palette: Palette): string {
  const layers = paletteToLayers(palette);
  const grain = grainCssLayer();
  const hexLayers = [grain, ...layers.map((layer) => layerCss(layer, formatHex))];
  const oklchLayers = [grain, ...layers.map((layer) => layerCss(layer, formatOklch))];
  const blends = [GRAIN_BLEND, ...layers.map(() => 'normal')];
  return [
    `background-color: ${oklchToHex(palette.background)};`,
    `background-image:\n  ${hexLayers.join(',\n  ')};`,
    `background-image:\n  ${oklchLayers.join(',\n  ')};`,
    `background-blend-mode: ${blends.join(', ')};`,
  ].join('\n');
}
