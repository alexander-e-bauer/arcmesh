import { CREASE_MAX, type Crease, type Palette, type Stop } from './harmony';
import type { Oklch } from './oklch';

// The URL hash carries the whole palette, not just the seed: a locked stop
// that survived a reroll came from an older seed, so the seed alone cannot
// rebuild it. Text form, before base64url:
//   2|<seed>|<bg l>,<bg c>,<bg h>|<h>,<c>,<l>,<x>,<y>,<locked>;...|<stop>,<cx>,<cy>,<r>,<t0>,<t1>;...
// Version 1 had no crease field and still decodes.
const VERSION = '2';
const MIN_STOPS = 4;
const MAX_STOPS = 5;

export function encodePalette(palette: Palette): string {
  const background = [
    palette.background.l.toFixed(3),
    palette.background.c.toFixed(3),
    palette.background.h.toFixed(2),
  ].join(',');
  const stops = palette.stops
    .map((stop) =>
      [
        stop.h.toFixed(2),
        stop.c.toFixed(3),
        stop.l.toFixed(3),
        stop.x.toFixed(3),
        stop.y.toFixed(3),
        stop.locked ? '1' : '0',
      ].join(','),
    )
    .join(';');
  const creases = palette.creases
    .map((c) => [String(c.stop), c.cx.toFixed(3), c.cy.toFixed(3), c.r.toFixed(3), c.t0.toFixed(3), c.t1.toFixed(3)].join(','))
    .join(';');
  return toBase64Url([VERSION, String(palette.seed), background, stops, creases].join('|'));
}

export function decodePalette(encoded: string): Palette | null {
  const text = fromBase64Url(encoded);
  if (text === null) return null;

  const parts = text.split('|');
  const version = parts[0];
  if (!((version === '1' && parts.length === 4) || (version === '2' && parts.length === 5))) return null;

  const seed = Number(parts[1]);
  if (parts[1] === '' || !Number.isInteger(seed) || seed < 0) return null;

  const background = parseOklch(parts[2].split(','));
  if (background === null) return null;

  const stopTexts = parts[3].split(';');
  if (stopTexts.length < MIN_STOPS || stopTexts.length > MAX_STOPS) return null;
  const stops: Stop[] = [];
  for (const stopText of stopTexts) {
    const stop = parseStop(stopText);
    if (stop === null) return null;
    stops.push(stop);
  }

  const creases: Crease[] = [];
  if (version === '2' && parts[4] !== '') {
    const creaseTexts = parts[4].split(';');
    if (creaseTexts.length > CREASE_MAX) return null;
    for (const creaseText of creaseTexts) {
      const crease = parseCrease(creaseText, stops.length);
      if (crease === null) return null;
      creases.push(crease);
    }
  }
  if (new Set(creases.map((c) => c.stop)).size !== creases.length) return null;

  return { seed, background, stops, creases };
}

function parseNumbers(parts: string[], expected: number): number[] | null {
  if (parts.length !== expected) return null;
  if (parts.some((part) => part.trim() === '')) return null;
  const numbers = parts.map(Number);
  return numbers.every(Number.isFinite) ? numbers : null;
}

function within(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

function validColor(l: number, c: number, h: number): boolean {
  return within(l, 0, 1) && within(c, 0, 0.5) && within(h, 0, 360);
}

function parseOklch(parts: string[]): Oklch | null {
  const numbers = parseNumbers(parts, 3);
  if (numbers === null) return null;
  const [l, c, h] = numbers;
  return validColor(l, c, h) ? { l, c, h } : null;
}

function parseStop(text: string): Stop | null {
  const numbers = parseNumbers(text.split(','), 6);
  if (numbers === null) return null;
  const [h, c, l, x, y, locked] = numbers;
  if (!validColor(l, c, h)) return null;
  if (!within(x, 0, 1) || !within(y, 0, 1)) return null;
  if (locked !== 0 && locked !== 1) return null;
  return { h, c, l, x, y, locked: locked === 1 };
}

function parseCrease(text: string, stopCount: number): Crease | null {
  const numbers = parseNumbers(text.split(','), 6);
  if (numbers === null) return null;
  const [stop, cx, cy, r, t0, t1] = numbers;
  if (!Number.isInteger(stop) || stop < 0 || stop >= stopCount) return null;
  // Generation keeps a center within [-2, 3]; a drag across the whole
  // canvas can carry it one further either way.
  if (!within(cx, -3, 4) || !within(cy, -3, 4)) return null;
  if (!within(r, 0.2, 2.5)) return null;
  if (!(t0 >= 0 && t0 < t1 && t1 <= 0.99)) return null;
  return { stop, cx, cy, r, t0, t1 };
}

function toBase64Url(text: string): string {
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): string | null {
  if (text.length === 0) return null;
  const standard = text.replace(/-/g, '+').replace(/_/g, '/');
  const padded = standard + '='.repeat((4 - (standard.length % 4)) % 4);
  try {
    return atob(padded);
  } catch {
    return null;
  }
}
