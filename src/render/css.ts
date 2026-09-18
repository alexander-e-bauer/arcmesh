import type { Palette, Stop } from '../palette/harmony';
import { oklchToHex, type Oklch } from '../palette/oklch';

// Where each layer fades out, in percent of the gradient box. Varying it by
// stop keeps the blobs from reading as identical circles.
export const FALLOFF = [65, 55, 75, 60, 70] as const;

export function formatOklch(color: Oklch): string {
  return `oklch(${color.l.toFixed(3)} ${color.c.toFixed(3)} ${color.h.toFixed(1)})`;
}

function layer(stop: Stop, index: number, color: string): string {
  const x = (stop.x * 100).toFixed(1);
  const y = (stop.y * 100).toFixed(1);
  const falloff = FALLOFF[index % FALLOFF.length];
  return `radial-gradient(at ${x}% ${y}%, ${color} 0%, transparent ${falloff}%)`;
}

// One background-color, then two background-image declarations: hex first,
// oklch second. An engine that cannot parse oklch() drops the second
// declaration and keeps the first, so the hex block is the fallback.
export function paletteToCss(palette: Palette): string {
  const hexLayers = palette.stops.map((stop, i) => layer(stop, i, oklchToHex(stop)));
  const oklchLayers = palette.stops.map((stop, i) => layer(stop, i, formatOklch(stop)));
  return [
    `background-color: ${oklchToHex(palette.background)};`,
    `background-image:\n  ${hexLayers.join(',\n  ')};`,
    `background-image:\n  ${oklchLayers.join(',\n  ')};`,
  ].join('\n');
}
