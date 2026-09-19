import { createRng } from '../palette/rng';

// A faint grey noise over the whole mesh, blended soft-light: noise
// centered on mid-grey pushes each pixel a little lighter or darker and
// leaves the average color alone, which hides banding in the long fades
// and makes the mesh read as printed rather than computed.
export const GRAIN_TILE = 256;
export const GRAIN_ALPHA = 0.08;
export const GRAIN_FREQUENCY = 0.9;
export const GRAIN_OCTAVES = 2;
export const GRAIN_BLEND = 'soft-light';
// Fixed so the PNG for a palette is the same file every time.
export const GRAIN_SEED = 0x67726e;

// The CSS side: fractal noise, desaturated, at a constant alpha. The filter
// runs in sRGB on purpose; in the default linearRGB the mid-grey of the
// noise lands near 0.73 in sRGB and soft-light then lightens everything.
export function grainSvg(): string {
  return (
    `<svg xmlns='http://www.w3.org/2000/svg' width='${GRAIN_TILE}' height='${GRAIN_TILE}'>` +
    `<filter id='g' color-interpolation-filters='sRGB'>` +
    `<feTurbulence type='fractalNoise' baseFrequency='${GRAIN_FREQUENCY}' numOctaves='${GRAIN_OCTAVES}' stitchTiles='stitch'/>` +
    `<feColorMatrix type='saturate' values='0'/>` +
    `<feComponentTransfer><feFuncA type='linear' slope='0' intercept='${GRAIN_ALPHA}'/></feComponentTransfer>` +
    `</filter>` +
    `<rect width='100%' height='100%' filter='url(#g)'/>` +
    `</svg>`
  );
}

// Unquoted, with everything that could end a url() percent-encoded, so the
// copied CSS survives a stylesheet and a style attribute of either quote.
export function grainCssLayer(): string {
  const encoded = encodeURIComponent(grainSvg()).replace(/[()']/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `url(data:image/svg+xml,${encoded})`;
}

// The canvas side: the same statistics as the SVG noise, not the same
// pixels. Each grey is the mean of three uniform draws, which lands near
// the spread of two-octave fractal noise; alpha is constant.
export function grainPixels(size = GRAIN_TILE, seed = GRAIN_SEED): Uint8ClampedArray {
  const rng = createRng(seed);
  const pixels = new Uint8ClampedArray(size * size * 4);
  const alpha = Math.round(GRAIN_ALPHA * 255);
  for (let i = 0; i < pixels.length; i += 4) {
    const grey = Math.round(((rng.next() + rng.next() + rng.next()) / 3) * 255);
    pixels[i] = grey;
    pixels[i + 1] = grey;
    pixels[i + 2] = grey;
    pixels[i + 3] = alpha;
  }
  return pixels;
}

// Builds the tile as a canvas the renderer can use as a pattern. Needs a
// real 2D context, so it is not exercised under jsdom.
export function grainTile(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = GRAIN_TILE;
  canvas.height = GRAIN_TILE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  ctx.putImageData(new ImageData(grainPixels(), GRAIN_TILE, GRAIN_TILE), 0, 0);
  return canvas;
}
