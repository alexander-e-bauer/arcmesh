import { describe, expect, it } from 'vitest';
import { generatePalette, type Palette } from '../palette/harmony';
import { FALLOFF, formatOklch, paletteToCss } from './css';

const palette: Palette = {
  seed: 1,
  background: { l: 0.16, c: 0.02, h: 200 },
  stops: [
    { l: 0.5, c: 0.1, h: 200, x: 0.25, y: 0.25, locked: false },
    { l: 0.7, c: 0.12, h: 220, x: 0.75, y: 0.3, locked: true },
    { l: 0.85, c: 0.08, h: 240, x: 0.2, y: 0.8, locked: false },
    { l: 0.6, c: 0.1, h: 260, x: 0.7, y: 0.75, locked: false },
  ],
};

describe('formatOklch', () => {
  it('emits an oklch() function with fixed precision', () => {
    expect(formatOklch({ l: 0.5, c: 0.1, h: 200 })).toBe('oklch(0.500 0.100 200.0)');
  });
});

describe('paletteToCss', () => {
  const css = paletteToCss(palette);

  it('starts with the background color as hex', () => {
    expect(css.startsWith('background-color: #')).toBe(true);
  });

  it('emits one hex layer and one oklch layer per stop', () => {
    expect(css.match(/radial-gradient\(/g)).toHaveLength(8);
    expect(css.match(/oklch\(/g)).toHaveLength(4);
  });

  it('puts the hex fallback block before the oklch block', () => {
    const first = css.indexOf('background-image:');
    const second = css.indexOf('background-image:', first + 1);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(second).toBeGreaterThan(first);
    expect(css.slice(first, second)).not.toContain('oklch(');
    expect(css.slice(second)).toContain('oklch(');
  });

  it('places each layer at the stop position in percent', () => {
    expect(css).toContain('at 25.0% 25.0%');
    expect(css).toContain('at 75.0% 30.0%');
  });

  it('fades every layer to transparent between 55 and 75 percent', () => {
    for (const f of FALLOFF) {
      expect(f).toBeGreaterThanOrEqual(55);
      expect(f).toBeLessThanOrEqual(75);
    }
    const fades = [...css.matchAll(/transparent (\d+)%/g)].map((m) => Number(m[1]));
    expect(fades).toHaveLength(8);
    for (const f of fades) {
      expect(f).toBeGreaterThanOrEqual(55);
      expect(f).toBeLessThanOrEqual(75);
    }
  });

  it('ends every declaration with a semicolon', () => {
    for (const line of css.split('\n').filter((l) => !l.startsWith(' '))) {
      expect(line.endsWith(';') || line.endsWith(':')).toBe(true);
    }
  });

  it('handles a generated five-stop palette', () => {
    const five = paletteToCss(generatePalette(3, { count: 5 }));
    expect(five.match(/radial-gradient\(/g)).toHaveLength(10);
  });
});
