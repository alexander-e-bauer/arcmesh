import { describe, expect, it } from 'vitest';
import { decodePalette, encodePalette } from './codec';
import { generatePalette, type Palette } from './harmony';

function decodeText(encoded: string): string {
  const standard = encoded.replace(/-/g, '+').replace(/_/g, '/');
  return atob(standard + '='.repeat((4 - (standard.length % 4)) % 4));
}

describe('palette codec', () => {
  it('round-trips a palette within rounding', () => {
    const original = generatePalette(77);
    original.stops[2].locked = true;
    original.stops[0].x = 0.1234;

    const decoded = decodePalette(encodePalette(original));
    expect(decoded).not.toBeNull();
    expect(decoded!.seed).toBe(77);
    expect(decoded!.stops).toHaveLength(original.stops.length);
    decoded!.stops.forEach((stop, i) => {
      const source = original.stops[i];
      expect(stop.locked).toBe(source.locked);
      expect(stop.h).toBeCloseTo(source.h, 1);
      expect(stop.c).toBeCloseTo(source.c, 2);
      expect(stop.l).toBeCloseTo(source.l, 2);
      expect(stop.x).toBeCloseTo(source.x, 2);
      expect(stop.y).toBeCloseTo(source.y, 2);
    });
    expect(decoded!.background.l).toBeCloseTo(original.background.l, 2);
    expect(decoded!.background.c).toBeCloseTo(original.background.c, 2);
    expect(decoded!.background.h).toBeCloseTo(original.background.h, 1);
  });

  it('is stable once rounded', () => {
    const once = encodePalette(generatePalette(5));
    expect(encodePalette(decodePalette(once)!)).toBe(once);
  });

  it('uses only URL-safe characters', () => {
    expect(encodePalette(generatePalette(8))).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each([
    ['empty', ''],
    ['not base64', 'not base64!!'],
    ['unknown version', btoa('3|1|0.16,0.02,10|10,0.1,0.5,0.5,0.5,0;20,0.1,0.5,0.5,0.5,0;30,0.1,0.5,0.5,0.5,0;40,0.1,0.5,0.5,0.5,0|')],
    ['version 1 with a crease field', btoa('1|1|0.16,0.02,10|10,0.1,0.5,0.5,0.5,0;20,0.1,0.5,0.5,0.5,0;30,0.1,0.5,0.5,0.5,0;40,0.1,0.5,0.5,0.5,0|')],
    ['version 2 without a crease field', btoa('2|1|0.16,0.02,10|10,0.1,0.5,0.5,0.5,0;20,0.1,0.5,0.5,0.5,0;30,0.1,0.5,0.5,0.5,0;40,0.1,0.5,0.5,0.5,0')],
    ['crease with five fields', btoa('2|1|0.16,0.02,10|10,0.1,0.5,0.5,0.5,0;20,0.1,0.5,0.5,0.5,0;30,0.1,0.5,0.5,0.5,0;40,0.1,0.5,0.5,0.5,0|0,1.3,0.2,0.9,0.4')],
    ['crease on a missing stop', btoa('2|1|0.16,0.02,10|10,0.1,0.5,0.5,0.5,0;20,0.1,0.5,0.5,0.5,0;30,0.1,0.5,0.5,0.5,0;40,0.1,0.5,0.5,0.5,0|4,1.3,0.2,0.9,0.4,0.6')],
    ['crease with a fractional stop', btoa('2|1|0.16,0.02,10|10,0.1,0.5,0.5,0.5,0;20,0.1,0.5,0.5,0.5,0;30,0.1,0.5,0.5,0.5,0;40,0.1,0.5,0.5,0.5,0|0.5,1.3,0.2,0.9,0.4,0.6')],
    ['crease radius out of range', btoa('2|1|0.16,0.02,10|10,0.1,0.5,0.5,0.5,0;20,0.1,0.5,0.5,0.5,0;30,0.1,0.5,0.5,0.5,0;40,0.1,0.5,0.5,0.5,0|0,1.3,0.2,10.5,0.4,0.6')],
    ['crease center out of range', btoa('2|1|0.16,0.02,10|10,0.1,0.5,0.5,0.5,0;20,0.1,0.5,0.5,0.5,0;30,0.1,0.5,0.5,0.5,0;40,0.1,0.5,0.5,0.5,0|0,13.5,0.2,0.9,0.4,0.6')],
    ['crease center below range', btoa('2|1|0.16,0.02,10|10,0.1,0.5,0.5,0.5,0;20,0.1,0.5,0.5,0.5,0;30,0.1,0.5,0.5,0.5,0;40,0.1,0.5,0.5,0.5,0|0,1.3,-12.5,0.9,0.4,0.6')],
    ['crease fade reversed', btoa('2|1|0.16,0.02,10|10,0.1,0.5,0.5,0.5,0;20,0.1,0.5,0.5,0.5,0;30,0.1,0.5,0.5,0.5,0;40,0.1,0.5,0.5,0.5,0|0,1.3,0.2,0.9,0.6,0.4')],
    ['three creases', btoa('2|1|0.16,0.02,10|10,0.1,0.5,0.5,0.5,0;20,0.1,0.5,0.5,0.5,0;30,0.1,0.5,0.5,0.5,0;40,0.1,0.5,0.5,0.5,0|0,1.3,0.2,0.9,0.4,0.6;1,1.3,0.2,0.9,0.4,0.6;2,1.3,0.2,0.9,0.4,0.6')],
    ['two creases on one stop', btoa('2|1|0.16,0.02,10|10,0.1,0.5,0.5,0.5,0;20,0.1,0.5,0.5,0.5,0;30,0.1,0.5,0.5,0.5,0;40,0.1,0.5,0.5,0.5,0|0,1.3,0.2,0.9,0.4,0.6;0,1.2,0.3,0.8,0.4,0.6')],
    ['bad seed', btoa('1|abc|0.16,0.02,10|10,0.1,0.5,0.5,0.5,0;20,0.1,0.5,0.5,0.5,0;30,0.1,0.5,0.5,0.5,0;40,0.1,0.5,0.5,0.5,0')],
    ['three stops', btoa('1|1|0.16,0.02,10|10,0.1,0.5,0.5,0.5,0;20,0.1,0.5,0.5,0.5,0;30,0.1,0.5,0.5,0.5,0')],
    ['short stop', btoa('1|1|0.16,0.02,10|10,0.1,0.5,0.5;20,0.1,0.5,0.5,0.5,0;30,0.1,0.5,0.5,0.5,0;40,0.1,0.5,0.5,0.5,0')],
    ['lock flag not 0 or 1', btoa('1|1|0.16,0.02,10|10,0.1,0.5,0.5,0.5,2;20,0.1,0.5,0.5,0.5,0;30,0.1,0.5,0.5,0.5,0;40,0.1,0.5,0.5,0.5,0')],
    ['position out of range', btoa('1|1|0.16,0.02,10|10,0.1,0.5,1.5,0.5,0;20,0.1,0.5,0.5,0.5,0;30,0.1,0.5,0.5,0.5,0;40,0.1,0.5,0.5,0.5,0')],
  ])('rejects %s', (_name, encoded) => {
    expect(decodePalette(encoded)).toBeNull();
  });

  it('accepts a well-formed hand-written version 1 palette with no creases', () => {
    const text = '1|42|0.160,0.020,10.00|10.00,0.100,0.500,0.250,0.250,0;20.00,0.100,0.600,0.750,0.250,1;30.00,0.100,0.700,0.250,0.750,0;40.00,0.100,0.800,0.750,0.750,0';
    const decoded = decodePalette(btoa(text));
    expect(decoded).not.toBeNull();
    expect(decoded!.seed).toBe(42);
    expect(decoded!.stops[1].locked).toBe(true);
    expect(decoded!.stops[3].l).toBe(0.8);
    expect(decoded!.creases).toEqual([]);
  });

  it('decodes a hash written before creases existed', () => {
    // encodePalette(generatePalette(77)) with stop 2 locked, frozen on 2026-09-18 from round one.
    const frozen =
      'MXw3N3wwLjE2MCwwLjAyMCwxNS4yMHwxNS4yMCwwLjA2MiwwLjg1NywwLjc1MiwwLjM5MywwOzM1LjQ0LDAuMTM4LDAuNDE0LDAuMTE3LDAuNjg2LDA7NjYuMTYsMC4xMDEsMC43NDksMC42NzUsMC42NDEsMTs4Ni45NiwwLjExNCwwLjU1OCwwLjE2MiwwLjE2NSww';
    const decoded = decodePalette(frozen);
    expect(decoded).not.toBeNull();
    expect(decoded!.seed).toBe(77);
    expect(decoded!.stops).toHaveLength(4);
    expect(decoded!.stops[2].locked).toBe(true);
    expect(decoded!.stops[2].l).toBe(0.749);
    expect(decoded!.creases).toEqual([]);
  });

  it('round-trips creases and writes version 2', () => {
    const palette: Palette = {
      seed: 9,
      background: { l: 0.16, c: 0.02, h: 200 },
      stops: [
        { l: 0.5, c: 0.1, h: 200, x: 0.25, y: 0.25, locked: false },
        { l: 0.7, c: 0.12, h: 220, x: 0.75, y: 0.3, locked: true },
        { l: 0.85, c: 0.08, h: 240, x: 0.2, y: 0.8, locked: false },
        { l: 0.6, c: 0.1, h: 260, x: 0.7, y: 0.75, locked: false },
      ],
      creases: [
        { stop: 1, cx: 1.3, cy: 0.2, r: 0.9, t0: 0.4, t1: 0.6 },
        { stop: 3, cx: -0.45, cy: 1.1, r: 0.62, t0: 0.55, t1: 0.8 },
      ],
    };
    const encoded = encodePalette(palette);
    expect(decodeText(encoded).startsWith('2|9|')).toBe(true);
    const decoded = decodePalette(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded!.creases).toEqual(palette.creases);
    expect(encodePalette(decoded!)).toBe(encoded);
  });

  it('accepts a fold dragged a full canvas past where generation puts it', () => {
    const dragged = btoa('2|1|0.16,0.02,10|10,0.1,0.5,0.5,0.5,0;20,0.1,0.5,0.5,0.5,0;30,0.1,0.5,0.5,0.5,0;40,0.1,0.5,0.5,0.5,0|0,10.9,-9.9,9.6,0.9,0.95');
    expect(decodePalette(dragged)?.creases).toEqual([{ stop: 0, cx: 10.9, cy: -9.9, r: 9.6, t0: 0.9, t1: 0.95 }]);
  });

  it('accepts a version 2 palette with an empty crease field', () => {
    const text = '2|42|0.160,0.020,10.00|10.00,0.100,0.500,0.250,0.250,0;20.00,0.100,0.600,0.750,0.250,1;30.00,0.100,0.700,0.250,0.750,0;40.00,0.100,0.800,0.750,0.750,0|';
    const decoded = decodePalette(btoa(text));
    expect(decoded).not.toBeNull();
    expect(decoded!.creases).toEqual([]);
  });
});
