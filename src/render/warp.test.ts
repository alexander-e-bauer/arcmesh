import { describe, expect, it } from 'vitest';
import type { Warp } from '../palette/harmony';
import { WARP_OCTAVES, WARP_REFERENCE_WIDTH, warpFilterCss, warpSvg } from './warp';

const warp: Warp = { seed: 7, frequency: 3, strength: 0.14 };

describe('warpSvg', () => {
  it('writes the belt, the noise, the mask and the displacement in px for the width', () => {
    // At 960 px: scale 134.40, reach 67.20, belt blur 33.60, mask blur 22.40.
    const svg = warpSvg(warp, 960);
    expect(svg.startsWith("<svg xmlns='http://www.w3.org/2000/svg'><filter id='w' x='-10%' y='-25%' width='120%' height='150%' color-interpolation-filters='sRGB'>")).toBe(true);
    expect(svg.endsWith('</filter></svg>')).toBe(true);
    expect(svg).toContain("<feGaussianBlur in='SourceGraphic' stdDeviation='33.60' result='bl'/>");
    expect(svg).toContain("<feComponentTransfer in='bl' result='ext'><feFuncA type='linear' slope='8' intercept='0'/></feComponentTransfer>");
    expect(svg).toContain("<feComposite in='SourceGraphic' in2='ext' operator='over' result='s'/>");
    expect(svg).toContain(`<feTurbulence type='fractalNoise' baseFrequency='0.0031250' numOctaves='${WARP_OCTAVES}' seed='7' result='n'/>`);
    expect(svg).toContain("<feComponentTransfer in='n' result='n1'><feFuncA type='table' tableValues='1 1'/></feComponentTransfer>");
    expect(svg).toContain("<feFlood flood-color='#fff' x='7.00%' y='14.00%' width='86.00%' height='72.00%' result='r'/>");
    expect(svg).toContain("<feGaussianBlur in='r' stdDeviation='22.40' x='0%' y='0%' width='100%' height='100%' result='m'/>");
    expect(svg).toContain("<feComposite in='n1' in2='m' operator='in' result='nm'/>");
    expect(svg).toContain("<feFlood flood-color='#808080' result='g'/>");
    expect(svg).toContain("<feComposite in='nm' in2='g' operator='over' result='map'/>");
    expect(svg).toContain("<feDisplacementMap in='s' in2='map' scale='134.40' xChannelSelector='R' yChannelSelector='G' x='0%' y='0%' width='100%' height='100%'/>");
    expect(WARP_OCTAVES).toBe(2);
  });

  it('keeps the primitives in the order the engines accept: belt, noise, mask, map, displacement', () => {
    const svg = warpSvg(warp, 960);
    const order = ["result='bl'", "result='ext'", "result='s'", "result='n'", "result='n1'", "result='r'", "result='m'", "result='nm'", "result='g'", "result='map'", '<feDisplacementMap'];
    const positions = order.map((marker) => svg.indexOf(marker));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('scales the px numbers with the width and leaves the box fractions alone', () => {
    const svg = warpSvg(warp, 1920);
    expect(svg).toContain("baseFrequency='0.0015625'");
    expect(svg).toContain("scale='268.80'");
    expect(svg).toContain("stdDeviation='67.20' result='bl'");
    expect(svg).toContain("stdDeviation='44.80' x='0%'");
    expect(svg).toContain("x='7.00%' y='14.00%' width='86.00%' height='72.00%'");
  });

  it('writes the seed as an integer and a weaker warp as a thinner mask', () => {
    const svg = warpSvg({ seed: 4321, frequency: 1.5, strength: 0.06 }, 960);
    expect(svg).toContain("seed='4321'");
    expect(svg).toContain("baseFrequency='0.0015625'");
    expect(svg).toContain("x='3.00%' y='6.00%' width='94.00%' height='88.00%'");
    expect(svg).toContain("scale='57.60'");
  });
});

describe('warpFilterCss', () => {
  it('is an unquoted data URI ending in the filter id, with nothing left that could end the url()', () => {
    const css = warpFilterCss(warp, 960);
    expect(css.startsWith('url(data:image/svg+xml,')).toBe(true);
    expect(css.endsWith('#w)')).toBe(true);
    const body = css.slice('url('.length, -'#w)'.length);
    expect(body).not.toMatch(/[\s"'()<>#]/);
    expect(decodeURIComponent(body.slice('data:image/svg+xml,'.length))).toBe(warpSvg(warp, 960));
  });

  it('exposes the preview width the CSS is written for', () => {
    expect(WARP_REFERENCE_WIDTH).toBe(960);
    expect(warpFilterCss(warp, WARP_REFERENCE_WIDTH)).not.toBe(warpFilterCss(warp, 1920));
  });
});
