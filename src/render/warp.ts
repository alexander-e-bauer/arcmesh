import type { Warp } from '../palette/harmony';

// The warp: fractal noise displaces the finished mesh through one SVG
// filter, the same string in the CSS and in the canvas. Everything is in
// px because neither engine scales baseFrequency by the element's box
// (and they scale the displacement differently), so the CSS is written for
// the preview's width and the canvas for its own, which makes the PNG the
// preview scaled.
// One octave: a second added small wiggles that turned the crease edges
// squiggly, and made them bend differently as they drifted.
export const WARP_OCTAVES = 1;
export const WARP_REFERENCE_WIDTH = 960;

function px(value: number): string {
  return value.toFixed(2);
}

function pct(value: number): string {
  return `${value.toFixed(2)}%`;
}

export function warpSvg(warp: Warp, width: number): string {
  const scale = warp.strength * width;
  // The farthest any pixel is pulled.
  const reach = scale / 2;
  // The mask rectangle sits the reach in from the sides, and the reach on
  // a 2:1 box (more on anything taller) from the top and bottom; the CSS
  // cannot know the aspect, and the belt covers a wider element.
  const insetX = warp.strength * 50;
  const insetY = warp.strength * 100;
  return (
    `<svg xmlns='http://www.w3.org/2000/svg'>` +
    `<filter id='w' x='-10%' y='-25%' width='120%' height='150%' color-interpolation-filters='sRGB'>` +
    // The belt: the source blurred outward at full alpha, under the source,
    // so a pull from past the box finds the local average color rather than
    // transparency.
    `<feGaussianBlur in='SourceGraphic' stdDeviation='${px(reach / 2)}' result='bl'/>` +
    `<feComponentTransfer in='bl' result='ext'><feFuncA type='linear' slope='8' intercept='0'/></feComponentTransfer>` +
    `<feComposite in='SourceGraphic' in2='ext' operator='over' result='s'/>` +
    // The map: noise at full alpha, kept inside a blurred rectangle inset by
    // the reach, laid over mid-grey (0.5 in sRGB, which is why the filter
    // runs in sRGB), so the displacement is full inside and zero at the
    // edges. Firefox rejects a mask taken from SourceAlpha and an arithmetic
    // composite; it accepts exactly this.
    `<feTurbulence type='fractalNoise' baseFrequency='${(warp.frequency / width).toFixed(7)}' numOctaves='${WARP_OCTAVES}' seed='${warp.seed}' result='n'/>` +
    `<feComponentTransfer in='n' result='n1'><feFuncA type='table' tableValues='1 1'/></feComponentTransfer>` +
    `<feFlood flood-color='#fff' x='${pct(insetX)}' y='${pct(insetY)}' width='${pct(100 - 2 * insetX)}' height='${pct(100 - 2 * insetY)}' result='r'/>` +
    `<feGaussianBlur in='r' stdDeviation='${px(reach / 3)}' x='0%' y='0%' width='100%' height='100%' result='m'/>` +
    `<feComposite in='n1' in2='m' operator='in' result='nm'/>` +
    `<feFlood flood-color='#808080' result='g'/>` +
    `<feComposite in='nm' in2='g' operator='over' result='map'/>` +
    // Clipped to the box, so nothing paints outside the element.
    `<feDisplacementMap in='s' in2='map' scale='${px(scale)}' xChannelSelector='R' yChannelSelector='G' x='0%' y='0%' width='100%' height='100%'/>` +
    `</filter></svg>`
  );
}

// Unquoted, with everything that could end a url() percent-encoded, as the
// grain does it; the fragment naming the filter goes on raw.
export function warpFilterCss(warp: Warp, width: number): string {
  const encoded = encodeURIComponent(warpSvg(warp, width)).replace(/[()']/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `url(data:image/svg+xml,${encoded}#w)`;
}
