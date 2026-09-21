import { describe, expect, it } from 'vitest';
import { codecText, hash32 } from './hash';

describe('hash32', () => {
  it('is FNV-1a over the string, into 32 bits', () => {
    expect(hash32('')).toBe(0x811c9dc5);
    expect(hash32('a')).toBe(0xe40c292c);
    expect(hash32('drift:200.00,0.100,0.500')).not.toBe(hash32('core:200.00,0.100,0.500'));
  });
});

describe('codecText', () => {
  it('writes the color as the codec does: hue to two decimals, chroma and lightness to three', () => {
    expect(codecText({ l: 0.5, c: 0.1, h: 200 })).toBe('200.00,0.100,0.500');
    expect(codecText({ l: 0.8504, c: 0.0796, h: 240.004 })).toBe('240.00,0.080,0.850');
  });
});
