import type { Palette, Warp } from '../palette/harmony';
import { oklchToHex, oklchToSrgb, type Oklch } from '../palette/oklch';
import { GRAIN_BLEND, grainTile } from './grain';
import { paletteToLayers, type Layer } from './layers';
import { warpFilterCss } from './warp';

// The slice of a 2D context the renderer touches, so tests can hand in a
// recording fake and the browser hands in the real thing.
export type Context2D = Pick<
  CanvasRenderingContext2D,
  | 'fillStyle'
  | 'globalCompositeOperation'
  | 'filter'
  | 'fillRect'
  | 'drawImage'
  | 'save'
  | 'restore'
  | 'translate'
  | 'scale'
  | 'createRadialGradient'
  | 'createPattern'
>;

export function rgbaString(color: Oklch, alpha: number): string {
  const { r, g, b } = oklchToSrgb(color);
  const channel = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 255);
  return `rgba(${channel(r)}, ${channel(g)}, ${channel(b)}, ${alpha})`;
}

function drawLayer(ctx: Context2D, layer: Layer, width: number, height: number): void {
  const cx = layer.cx * width;
  const cy = layer.cy * height;
  const rx = layer.size.rx * width;
  const ry = layer.size.ry * height;

  // Draw a unit circle gradient under a scale, which is how an ellipse is
  // made in a 2D context; the fill rectangle is the canvas in that space.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(rx, ry);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  for (const stop of layer.stops) gradient.addColorStop(stop.offset, rgbaString(stop.color, stop.alpha));
  ctx.fillStyle = gradient;
  ctx.fillRect(-cx / rx, -cy / ry, width / rx, height / ry);
  ctx.restore();
}

// The grain tile repeats over the whole canvas under the same blend the CSS
// names, so the PNG carries the same texture as the preview.
function drawGrain(ctx: Context2D, tile: CanvasImageSource, width: number, height: number): void {
  const pattern = ctx.createPattern(tile, 'repeat');
  if (!pattern) throw new Error('canvas pattern unavailable');
  ctx.save();
  ctx.globalCompositeOperation = GRAIN_BLEND;
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

// Paints exactly what paletteToCss describes before its filter: the
// background, then the layer list from the bottom up, then the grain.
export function drawPalette(ctx: Context2D, palette: Palette, width: number, height: number, grain: CanvasImageSource): void {
  ctx.fillStyle = oklchToHex(palette.background);
  ctx.fillRect(0, 0, width, height);
  const layers = paletteToLayers(palette);
  for (let i = layers.length - 1; i >= 0; i--) drawLayer(ctx, layers[i], width, height);
  drawGrain(ctx, grain, width, height);
}

// Warps the flat mesh onto ctx in one pass through the filter the CSS
// names, written for this width. Never per layer: the filter's edge
// treatment belongs to the finished mesh. An engine that cannot apply a
// url() filter leaves the property as it was, so the readback is the
// detect; then nothing is drawn and the caller paints the flat mesh.
export function warpPalette(ctx: Context2D, flat: CanvasImageSource, warp: Warp, width: number): boolean {
  const filter = warpFilterCss(warp, width);
  ctx.save();
  ctx.filter = filter;
  const applied = ctx.filter === filter;
  if (applied) ctx.drawImage(flat, 0, 0);
  ctx.restore();
  return applied;
}

function blankCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  return [canvas, ctx];
}

export function pngFileName(seed: number, width: number, height: number): string {
  return `arcmesh-${seed}-${width}x${height}.png`;
}

export async function renderPng(palette: Palette, width: number, height: number): Promise<Blob> {
  const [canvas, ctx] = blankCanvas(width, height);
  const grain = grainTile();
  if (palette.warp) {
    // The flat mesh on its own canvas, then one warped draw of it.
    const [flat, flatCtx] = blankCanvas(width, height);
    drawPalette(flatCtx, palette, width, height, grain);
    if (!warpPalette(ctx, flat, palette.warp, width)) ctx.drawImage(flat, 0, 0);
  } else {
    drawPalette(ctx, palette, width, height, grain);
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('png encoding failed'))), 'image/png');
  });
}

export async function downloadPng(palette: Palette, width: number, height: number): Promise<void> {
  const blob = await renderPng(palette, width, height);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = pngFileName(palette.seed, width, height);
  // Attached because some engines ignore clicks on detached anchors, and the
  // URL is revoked later because some read the blob after the click returns.
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
