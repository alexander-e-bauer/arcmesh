import { describe, expect, it } from 'vitest';
import { decodePalette, encodePalette } from './codec';
import { generatePalette } from './harmony';

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
    ['wrong version', btoa('2|1|0.16,0.02,10|10,0.1,0.5,0.5,0.5,0;20,0.1,0.5,0.5,0.5,0;30,0.1,0.5,0.5,0.5,0;40,0.1,0.5,0.5,0.5,0')],
    ['bad seed', btoa('1|abc|0.16,0.02,10|10,0.1,0.5,0.5,0.5,0;20,0.1,0.5,0.5,0.5,0;30,0.1,0.5,0.5,0.5,0;40,0.1,0.5,0.5,0.5,0')],
    ['three stops', btoa('1|1|0.16,0.02,10|10,0.1,0.5,0.5,0.5,0;20,0.1,0.5,0.5,0.5,0;30,0.1,0.5,0.5,0.5,0')],
    ['short stop', btoa('1|1|0.16,0.02,10|10,0.1,0.5,0.5;20,0.1,0.5,0.5,0.5,0;30,0.1,0.5,0.5,0.5,0;40,0.1,0.5,0.5,0.5,0')],
    ['lock flag not 0 or 1', btoa('1|1|0.16,0.02,10|10,0.1,0.5,0.5,0.5,2;20,0.1,0.5,0.5,0.5,0;30,0.1,0.5,0.5,0.5,0;40,0.1,0.5,0.5,0.5,0')],
    ['position out of range', btoa('1|1|0.16,0.02,10|10,0.1,0.5,1.5,0.5,0;20,0.1,0.5,0.5,0.5,0;30,0.1,0.5,0.5,0.5,0;40,0.1,0.5,0.5,0.5,0')],
  ])('rejects %s', (_name, encoded) => {
    expect(decodePalette(encoded)).toBeNull();
  });

  it('accepts a well-formed hand-written palette', () => {
    const text = '1|42|0.160,0.020,10.00|10.00,0.100,0.500,0.250,0.250,0;20.00,0.100,0.600,0.750,0.250,1;30.00,0.100,0.700,0.250,0.750,0;40.00,0.100,0.800,0.750,0.750,0';
    const decoded = decodePalette(btoa(text));
    expect(decoded).not.toBeNull();
    expect(decoded!.seed).toBe(42);
    expect(decoded!.stops[1].locked).toBe(true);
    expect(decoded!.stops[3].l).toBe(0.8);
  });
});
