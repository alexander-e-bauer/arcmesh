import { describe, expect, it } from 'vitest';
import { generatePalette, type Palette } from '../palette/harmony';
import { FALLOFF, formatHex, formatOklch, literalPosition, paletteToCss } from './css';
import { paletteToLayers } from './layers';
import { GRAIN_BLEND, grainCssLayer } from './grain';
import { WARP_REFERENCE_WIDTH, warpFilterCss } from './warp';

const palette: Palette = {
  seed: 1,
  background: { l: 0.16, c: 0.02, h: 200 },
  stops: [
    { l: 0.5, c: 0.1, h: 200, x: 0.25, y: 0.25, locked: false },
    { l: 0.7, c: 0.12, h: 220, x: 0.75, y: 0.3, locked: true },
    { l: 0.85, c: 0.08, h: 240, x: 0.2, y: 0.8, locked: false },
    { l: 0.6, c: 0.1, h: 260, x: 0.7, y: 0.75, locked: false },
  ],
  creases: [],
  light: null,
  spot: null,
  warp: null,
  drift: false,
};

describe('color formatting', () => {
  it('emits an oklch() function with fixed precision, with alpha 0 and fractional variants', () => {
    expect(formatOklch({ l: 0.5, c: 0.1, h: 200 })).toBe('oklch(0.500 0.100 200.0)');
    expect(formatOklch({ l: 0.5, c: 0.1, h: 200 }, 1)).toBe('oklch(0.500 0.100 200.0)');
    expect(formatOklch({ l: 0.5, c: 0.1, h: 200 }, 0)).toBe('oklch(0.500 0.100 200.0 / 0)');
    expect(formatOklch({ l: 0.5, c: 0.1, h: 200 }, 0.15)).toBe('oklch(0.500 0.100 200.0 / 0.15)');
    expect(formatOklch({ l: 0.5, c: 0.1, h: 200 }, 0.555)).toBe('oklch(0.500 0.100 200.0 / 0.56)');
  });

  it('emits hex with an alpha byte for alpha 0 and fractions', () => {
    expect(formatHex({ l: 1, c: 0, h: 0 })).toBe('#ffffff');
    expect(formatHex({ l: 1, c: 0, h: 0 }, 1)).toBe('#ffffff');
    expect(formatHex({ l: 1, c: 0, h: 0 }, 0)).toBe('#ffffff00');
    expect(formatHex({ l: 1, c: 0, h: 0 }, 0.15)).toBe('#ffffff26');
    expect(formatHex({ l: 1, c: 0, h: 0 }, 0.02)).toBe('#ffffff05');
  });
});

describe('paletteToCss', () => {
  const css = paletteToCss(palette);

  it('starts with the background color as hex', () => {
    expect(css.startsWith('background-color: #')).toBe(true);
  });

  it('emits a blob and a core per stop, in hex and again in oklch', () => {
    expect(css.match(/radial-gradient\(/g)).toHaveLength(16);
    expect(css.match(/oklch\(/g)).toHaveLength(16);
  });

  it('puts the grain tile on top of both blocks and blends only that layer', () => {
    const grain = grainCssLayer();
    const blocks = css.split('background-image:\n').slice(1);
    expect(blocks).toHaveLength(2);
    for (const block of blocks) {
      expect(block.startsWith(`  ${grain},\n  radial-gradient(`)).toBe(true);
    }
    const lines = css.split('\n');
    expect(lines[lines.length - 1]).toBe(`background-blend-mode: ${GRAIN_BLEND}${', normal'.repeat(8)};`);
  });

  it('ends with the warp filter, written for the preview width, and is otherwise unchanged', () => {
    const warp = { seed: 7, frequency: 3, strength: 0.14 };
    const warped = paletteToCss({ ...palette, warp });
    const lines = warped.split('\n');
    expect(lines[lines.length - 1]).toBe(`filter: ${warpFilterCss(warp, WARP_REFERENCE_WIDTH)};`);
    expect(lines[lines.length - 2]).toBe(`background-blend-mode: ${GRAIN_BLEND}${', normal'.repeat(8)};`);
    expect(warped).toBe(`${css}\nfilter: ${warpFilterCss(warp, WARP_REFERENCE_WIDTH)};`);
  });

  it('emits no filter for a palette without a warp', () => {
    expect(css).not.toContain('filter:');
    expect(css.endsWith(';')).toBe(true);
    expect(css).not.toContain('anchor');
  });

  it('lists one blend mode per layer, creases included', () => {
    const withCrease = paletteToCss({
      ...palette,
      creases: [{ stop: 1, cx: 1.3, cy: 0.2, r: 0.9, t0: 0.4, t1: 0.6 }],
    });
    expect(withCrease.endsWith(`background-blend-mode: ${GRAIN_BLEND}${', normal'.repeat(9)};`)).toBe(true);
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

  it('writes positions through a function, the literal percentages by default', () => {
    expect(literalPosition({ cx: 0.25, cy: 0.3, size: { rx: 1, ry: 1 }, stops: [], anchor: null })).toBe('25.0% 30.0%');
    expect(literalPosition({ cx: 1.3, cy: -0.05, size: { rx: 1, ry: 1 }, stops: [], anchor: null })).toBe('130.0% -5.0%');
    expect(paletteToCss(palette, literalPosition)).toBe(css);
    // Each layer's position appears twice, in the hex block and in the
    // oklch block, so each is replaced twice.
    let expected = css;
    for (const layer of paletteToLayers(palette)) {
      expected = expected.replace(` at ${literalPosition(layer)},`, ` at var(--p${layer.anchor}),`);
      expected = expected.replace(` at ${literalPosition(layer)},`, ` at var(--p${layer.anchor}),`);
    }
    expect(paletteToCss(palette, (layer) => `var(--p${layer.anchor})`)).toBe(expected);
  });

  it('fades every blob to its own color at alpha 0 between 55 and 75 percent', () => {
    for (const f of FALLOFF) {
      expect(f).toBeGreaterThanOrEqual(55);
      expect(f).toBeLessThanOrEqual(75);
    }
    expect(css).not.toContain('transparent');
    // Blobs fade out between 55 and 75 percent; cores fade out at 100.
    const hexFades = [...css.matchAll(/(#[0-9a-f]{6})00 (\d+)%/g)];
    const oklchFades = [...css.matchAll(/oklch\([^)]*\/ 0\) (\d+)%/g)];
    expect(hexFades).toHaveLength(8);
    expect(oklchFades).toHaveLength(8);
    const blobFades = hexFades.filter((m) => Number(m[2]) < 100);
    expect(blobFades).toHaveLength(4);
    for (const m of blobFades) {
      expect(css).toContain(`${m[1]} 0%`);
      expect(Number(m[2])).toBeGreaterThanOrEqual(55);
      expect(Number(m[2])).toBeLessThanOrEqual(75);
    }
    const coreFades = hexFades.filter((m) => Number(m[2]) === 100);
    expect(coreFades).toHaveLength(4);
    for (const m of coreFades) expect(css).toContain(`${m[1]}8c 0%`);
  });

  it('emits a crease as an explicit ellipse with a hard edge, listed after the blobs', () => {
    const withCrease = paletteToCss({
      ...palette,
      creases: [{ stop: 1, cx: 1.3, cy: 0.2, r: 0.9, t0: 0.4, t1: 0.6 }],
    });
    const hex = formatHex(palette.stops[1]);
    const expected = `radial-gradient(90.0% 90.0% at 130.0% 20.0%, ${hex}00 0%, ${hex}00 40%, ${hex} 60%, ${hex} 99.3%, ${hex}00 100%)`;
    expect(withCrease).toContain(expected);
    const firstBlock = withCrease.slice(withCrease.indexOf('background-image:'), withCrease.indexOf('background-image:', withCrease.indexOf('background-image:') + 1));
    expect(firstBlock.indexOf(expected)).toBeGreaterThan(firstBlock.indexOf('at 70.0% 75.0%'));
    expect(withCrease.match(/radial-gradient\(/g)).toHaveLength(18);
    expect(withCrease).toContain(`${formatOklch(palette.stops[1], 0)} 40%, ${formatOklch(palette.stops[1])} 60%`);
  });

  it('separates layers with commas and ends every declaration with a semicolon', () => {
    const lines = css.split('\n');
    lines.forEach((line, i) => {
      if (line.endsWith(':')) return;
      const nextIsLayer = lines[i + 1]?.startsWith(' ') ?? false;
      expect(line.endsWith(nextIsLayer ? ',' : ';')).toBe(true);
    });
  });

  it('handles a generated five-stop palette: wash, spot, cores, blobs, creases', () => {
    const generated = generatePalette(3, { count: 5 });
    const five = paletteToCss(generated);
    const spot = generated.spot === null ? 0 : 1;
    expect(five.match(/radial-gradient\(/g)).toHaveLength(2 * (2 + spot + 5 + 5 + generated.creases.length));
    expect(five).toContain(`${formatHex({ l: 1, c: 0, h: 0 }, generated.light!.strength)} 0%`);
    expect(five.endsWith(`filter: ${warpFilterCss(generated.warp!, WARP_REFERENCE_WIDTH)};`)).toBe(true);
  });
});
