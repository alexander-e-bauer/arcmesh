import type { Palette } from '../palette/harmony';
import { oklchToHex } from '../palette/oklch';
import { GRAIN_BLEND, grainFilter } from './grain';
import { paletteToLayers, type Layer } from './layers';
import { warpFilter } from './warp';

// The third renderer of the one layer list: the CSS describes it, the
// canvas paints it, and this writes it as a file that carries its own
// gradients. Resolution independent, and a design tool that drops the two
// filters still reads every gradient.

// User units, three decimals; an offset gets four, because a crease's
// feather lands in the fourth. Trailing zeros go, so round numbers read
// round.
function num(value: number, places = 3): string {
  return String(Number(value.toFixed(places)));
}

// A unit circle under the layer ellipse's scale, which is how the canvas
// draws it too. Colors are plain six-digit hex with the alpha beside them:
// inside a layer only alpha varies, so no interpolation space can show, and
// an eight-digit hex or an oklch() would shut out everything but a browser.
function gradient(layer: Layer, index: number, width: number, height: number): string {
  const center = `translate(${num(layer.cx * width)} ${num(layer.cy * height)})`;
  const scale = `scale(${num(layer.size.rx * width)} ${num(layer.size.ry * height)})`;
  const stops = layer.stops
    .map((stop) => `<stop offset='${num(stop.offset, 4)}' stop-color='${oklchToHex(stop.color)}' stop-opacity='${num(stop.alpha)}'/>`)
    .join('');
  return `<radialGradient id='l${index}' gradientUnits='userSpaceOnUse' cx='0' cy='0' r='1' gradientTransform='${center} ${scale}'>${stops}</radialGradient>`;
}

export function svgFileName(seed: number, width: number, height: number): string {
  return `arcmesh-${seed}-${width}x${height}.svg`;
}

// Every painted element is the whole box, so the group's bounding box is
// the viewport and the filters' percentages land where they do in the CSS
// and on the canvas. The group is isolated: the grain blends with the mesh
// under it, never with whatever the file is laid on. The warp is written
// for this file's width, as the canvas writes it for its own.
export function paletteToSvg(palette: Palette, width: number, height: number): string {
  const layers = paletteToLayers(palette);
  const box = `width='${width}' height='${height}'`;
  const defs = [
    ...(palette.warp ? [warpFilter(palette.warp, width)] : []),
    grainFilter(),
    ...layers.map((layer, index) => gradient(layer, index, width, height)),
  ];
  const mesh = layers.map((_, index) => `<rect ${box} fill='url(#l${index})'/>`).reverse();
  const group = palette.warp ? `<g filter='url(#w)' style='isolation:isolate'>` : `<g style='isolation:isolate'>`;
  return [
    `<svg xmlns='http://www.w3.org/2000/svg' ${box} viewBox='0 0 ${width} ${height}'>`,
    '<defs>',
    ...defs.map((def) => `  ${def}`),
    '</defs>',
    group,
    `  <rect ${box} fill='${oklchToHex(palette.background)}'/>`,
    ...mesh.map((rect) => `  ${rect}`),
    // The grain rect paints nothing of its own: the filter generates the
    // noise and never reads the rect, and a fill would be a black rectangle
    // under soft-light in any tool that drops the filter. Chrome and Firefox
    // both still run the filter over it.
    `  <rect ${box} fill='none' filter='url(#g)' style='mix-blend-mode:${GRAIN_BLEND}'/>`,
    '</g>',
    '</svg>',
    '',
  ].join('\n');
}
