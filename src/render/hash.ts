import type { Oklch } from '../palette/oklch';

// FNV-1a over a short string, into 32 bits.
export function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// The stop's color as the codec writes it (hue to two decimals, chroma and
// lightness to three). Anything derived from it rather than from a fresh
// draw stays with a locked stop, renders the same from a decoded link
// because the hash sees the same text, and cannot change under a drag
// because position is not an input. The blob stretch, the core and the
// drift all key on it, each with its own salt.
export function codecText(color: Oklch): string {
  return `${color.h.toFixed(2)},${color.c.toFixed(3)},${color.l.toFixed(3)}`;
}
