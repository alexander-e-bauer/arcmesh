import type { Palette } from '../palette/harmony';
import type { Oklch } from '../palette/oklch';
import { createRng } from '../palette/rng';
import { literalPosition, paletteToCss, type Position } from './css';
import { codecText, hash32 } from './hash';
import type { Layer } from './layers';

// How far a stop wanders from its base, in unit canvas space (x in widths,
// y in heights), and how long one swing takes, per axis. Hashed from the
// stop, so nothing is stored and a locked stop keeps its motion.
export const DRIFT_AMPLITUDE: readonly [number, number] = [0.06, 0.12];
export const DRIFT_PERIOD: readonly [number, number] = [16, 30];

export interface Drift {
  ax: number;
  ay: number;
  tx: number;
  ty: number;
  dx: -1 | 1;
  dy: -1 | 1;
}

export function driftOf(color: Oklch): Drift {
  const rng = createRng(hash32(`drift:${codecText(color)}`));
  const ax = rng.range(DRIFT_AMPLITUDE[0], DRIFT_AMPLITUDE[1]);
  const ay = rng.range(DRIFT_AMPLITUDE[0], DRIFT_AMPLITUDE[1]);
  const tx = rng.range(DRIFT_PERIOD[0], DRIFT_PERIOD[1]);
  const ty = rng.range(DRIFT_PERIOD[0], DRIFT_PERIOD[1]);
  const dx = rng.chance(0.5) ? -1 : 1;
  const dy = rng.chance(0.5) ? -1 : 1;
  return { ax, ay, tx, ty, dx, dy };
}

function pct(value: number): string {
  return `${(Math.round(value * 1000) / 10).toFixed(1)}%`;
}

function seconds(value: number): string {
  return `${value.toFixed(1)}s`;
}

// A stop's custom property with its base position as the fallback, plus
// the layer's offset from the stop when it has one: `var(--s1x, 75.0%)`,
// or `calc(var(--s1x, 75.0%) + 55.0%)`. The fallback is what an engine
// without @property shows under reduced motion; with @property the
// registration's initial value makes it moot.
function term(name: string, base: number, target: number): string {
  const reference = `var(${name}, ${pct(base)})`;
  // The offset in tenths of a percent, taken between the rounded ends so
  // the sum equals the still CSS's literal exactly.
  const tenths = Math.round(target * 1000) - Math.round(base * 1000);
  if (tenths === 0) return reference;
  return `calc(${reference} ${tenths < 0 ? '-' : '+'} ${(Math.abs(tenths) / 10).toFixed(1)}%)`;
}

// The position function for the drift stylesheet: an anchored layer's
// center is its stop's custom properties plus its offset from the stop;
// the lighting and the creases keep their literal positions.
export function driftPosition(palette: Palette): Position {
  return (layer: Layer) => {
    if (layer.anchor === null) return literalPosition(layer);
    const stop = palette.stops[layer.anchor];
    return `${term(`--s${layer.anchor}x`, stop.x, layer.cx)} ${term(`--s${layer.anchor}y`, stop.y, layer.cy)}`;
  };
}

// The preview's stylesheet while it drifts: a registered custom property
// per stop and axis, a keyframes pair per stop and axis swinging by the
// signed amplitude, the still declarations with the positions swapped for
// the properties, and the animations. A negative delay of half a period
// starts every swing at the base, so switching drift on does not jump;
// alternate with ease-in-out pauses at the extremes, which reads as
// breathing; different periods keep the whole from ever repeating. The
// reduced-motion rule stills it for anyone who asked.
export function paletteToDriftCss(palette: Palette, selector: string): string {
  const registrations: string[] = [];
  const keyframes: string[] = [];
  const animations: string[] = [];
  palette.stops.forEach((stop, i) => {
    const d = driftOf(stop);
    const axes = [
      ['x', stop.x, d.ax, d.tx, d.dx],
      ['y', stop.y, d.ay, d.ty, d.dy],
    ] as const;
    for (const [axis, base, amplitude, period, direction] of axes) {
      const name = `--s${i}${axis}`;
      registrations.push(`@property ${name} { syntax: '<percentage>'; inherits: false; initial-value: ${pct(base)}; }`);
      keyframes.push(
        `@keyframes drift-${i}${axis} { from { ${name}: ${pct(base - direction * amplitude)}; } to { ${name}: ${pct(base + direction * amplitude)}; } }`,
      );
      animations.push(`drift-${i}${axis} ${seconds(period)} ease-in-out -${seconds(period / 2)} infinite alternate`);
    }
  });
  return [
    ...registrations,
    ...keyframes,
    `${selector} {\n${paletteToCss(palette, driftPosition(palette))}\nanimation: ${animations.join(', ')};\n}`,
    `@media (prefers-reduced-motion: reduce) {\n${selector} { animation: none; }\n}`,
  ].join('\n');
}
