import { describe, expect, it } from 'vitest';
import { decodePalette, encodePalette } from '../palette/codec';
import { generatePalette, type Palette } from '../palette/harmony';
import { paletteToCss } from './css';
import { DRIFT_AMPLITUDE, DRIFT_PERIOD, driftOf, driftPosition, paletteToDriftCss } from './drift';

const palette: Palette = {
  seed: 1,
  background: { l: 0.16, c: 0.02, h: 200 },
  stops: [
    { l: 0.5, c: 0.1, h: 200, x: 0.25, y: 0.25, locked: false },
    { l: 0.7, c: 0.12, h: 220, x: 0.75, y: 0.3, locked: true },
    { l: 0.85, c: 0.08, h: 240, x: 0.2, y: 0.8, locked: false },
    { l: 0.6, c: 0.1, h: 260, x: 0.7, y: 0.75, locked: false },
  ],
  creases: [{ stop: 1, cx: 1.3, cy: 0.2, r: 0.9, t0: 0.4, t1: 0.6 }],
  light: null,
  spot: null,
  warp: null,
  drift: true,
};

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const sec = (v: number) => `${v.toFixed(1)}s`;

describe('driftOf', () => {
  it('draws amplitudes and periods in range, with a direction per axis, hashed from the stop', () => {
    let minus = 0;
    let plus = 0;
    for (let seed = 1; seed <= 200; seed++) {
      for (const stop of generatePalette(seed).stops) {
        const d = driftOf(stop);
        for (const a of [d.ax, d.ay]) {
          expect(a).toBeGreaterThanOrEqual(DRIFT_AMPLITUDE[0]);
          expect(a).toBeLessThanOrEqual(DRIFT_AMPLITUDE[1]);
        }
        for (const t of [d.tx, d.ty]) {
          expect(t).toBeGreaterThanOrEqual(DRIFT_PERIOD[0]);
          expect(t).toBeLessThanOrEqual(DRIFT_PERIOD[1]);
        }
        expect([-1, 1]).toContain(d.dx);
        expect([-1, 1]).toContain(d.dy);
        if (d.dx === -1) minus++;
        else plus++;
      }
    }
    expect(minus).toBeGreaterThan(200);
    expect(plus).toBeGreaterThan(200);
    expect(driftOf(palette.stops[0])).toEqual(driftOf({ l: 0.5004, c: 0.1004, h: 200.004 }));
    expect(driftOf(palette.stops[0])).not.toEqual(driftOf(palette.stops[1]));
  });

  it('survives the codec round trip for every stop of a thousand palettes', () => {
    for (let i = 1; i <= 1000; i++) {
      const generated = generatePalette(i * 7919);
      const decoded = decodePalette(encodePalette(generated))!;
      expect(decoded.stops.map(driftOf)).toEqual(generated.stops.map(driftOf));
    }
  });
});

describe('driftPosition', () => {
  it('writes an anchored layer at its stop as the stop\'s custom properties, an offset as a calc, and the lighting literally', () => {
    const position = driftPosition(palette);
    expect(position({ cx: 0.25, cy: 0.25, size: { rx: 1, ry: 1 }, stops: [], anchor: 0 })).toBe('var(--s0x) var(--s0y)');
    expect(position({ cx: 1.3, cy: 0.2, size: { rx: 1, ry: 1 }, stops: [], anchor: 1 })).toBe('calc(var(--s1x) + 55.0%) calc(var(--s1y) - 10.0%)');
    expect(position({ cx: 0.75, cy: 0.9, size: { rx: 1, ry: 1 }, stops: [], anchor: 1 })).toBe('var(--s1x) calc(var(--s1y) + 60.0%)');
    expect(position({ cx: 0, cy: 0.3, size: { rx: 1, ry: 1 }, stops: [], anchor: null })).toBe('0.0% 30.0%');
  });
});

describe('paletteToDriftCss', () => {
  const sheet = paletteToDriftCss(palette, '.m');
  const lines = sheet.split('\n');

  it('registers two custom properties per stop at the base positions, then two keyframes per stop swinging by the signed amplitude', () => {
    expect(lines.slice(0, 8)).toEqual(
      palette.stops.flatMap((stop, i) => [
        `@property --s${i}x { syntax: '<percentage>'; inherits: false; initial-value: ${pct(stop.x)}; }`,
        `@property --s${i}y { syntax: '<percentage>'; inherits: false; initial-value: ${pct(stop.y)}; }`,
      ]),
    );
    expect(lines.slice(8, 16)).toEqual(
      palette.stops.flatMap((stop, i) => {
        const d = driftOf(stop);
        return [
          `@keyframes drift-${i}x { from { --s${i}x: ${pct(stop.x - d.dx * d.ax)}; } to { --s${i}x: ${pct(stop.x + d.dx * d.ax)}; } }`,
          `@keyframes drift-${i}y { from { --s${i}y: ${pct(stop.y - d.dy * d.ay)}; } to { --s${i}y: ${pct(stop.y + d.dy * d.ay)}; } }`,
        ];
      }),
    );
  });

  it('writes the rule with the still declarations, positions swapped for the custom properties, then the animations', () => {
    expect(lines[16]).toBe('.m {');
    const still = paletteToCss(palette);
    const start = sheet.indexOf('.m {\n') + '.m {\n'.length;
    const end = sheet.indexOf('\nanimation: ');
    const declarations = sheet.slice(start, end);
    expect(declarations).toBe(paletteToCss(palette, driftPosition(palette)));
    // Everything but the positions is the still CSS.
    const blank = (text: string) => text.replace(/ at [^,]+,/g, ' at _,');
    expect(blank(declarations)).toBe(blank(still));
    expect(declarations).toContain(' at var(--s0x) var(--s0y),');
    expect(declarations).toContain(' at calc(var(--s1x) + 55.0%) calc(var(--s1y) - 10.0%),');
    expect(declarations).not.toContain('filter:');
    const animation = sheet.slice(end + 1, sheet.indexOf(';\n}', end) + 1);
    expect(animation).toBe(
      `animation: ${palette.stops
        .flatMap((stop, i) => {
          const d = driftOf(stop);
          return [
            `drift-${i}x ${sec(d.tx)} ease-in-out -${sec(d.tx / 2)} infinite alternate`,
            `drift-${i}y ${sec(d.ty)} ease-in-out -${sec(d.ty / 2)} infinite alternate`,
          ];
        })
        .join(', ')};`,
    );
  });

  it('ends with the reduced-motion rule, and keeps the lighting and the filter when the palette has them', () => {
    expect(sheet.endsWith('\n}\n@media (prefers-reduced-motion: reduce) {\n.m { animation: none; }\n}')).toBe(true);
    const generated = { ...generatePalette(3, { count: 5 }), drift: true };
    const full = paletteToDriftCss(generated, '.canvas > .mesh');
    expect(full).toContain(`\nfilter: `);
    expect(full).toContain('.canvas > .mesh {\n');
    expect((full.match(/@property /g) ?? []).length).toBe(10);
    expect((full.match(/@keyframes /g) ?? []).length).toBe(10);
    expect(full).toContain(` at ${(generated.light!.x * 100).toFixed(1)}% ${(generated.light!.y * 100).toFixed(1)}%,`);
  });
});
