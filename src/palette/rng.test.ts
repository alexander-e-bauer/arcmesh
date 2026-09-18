import { describe, expect, it } from 'vitest';
import { createRng, randomSeed } from './rng';

describe('createRng', () => {
  it('yields the same sequence for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const left = Array.from({ length: 5 }, () => a.next());
    const right = Array.from({ length: 5 }, () => b.next());
    expect(left).toEqual(right);
  });

  it('yields different sequences for different seeds', () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });

  it('works with seed 0', () => {
    const rng = createRng(0);
    expect(rng.next()).not.toBe(rng.next());
  });

  it('stays inside [0, 1)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 10000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('range stays inside its bounds', () => {
    const rng = createRng(8);
    for (let i = 0; i < 1000; i++) {
      const value = rng.range(30, 90);
      expect(value).toBeGreaterThanOrEqual(30);
      expect(value).toBeLessThan(90);
    }
  });

  it('int reaches both ends of an inclusive range', () => {
    const rng = createRng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) seen.add(rng.int(0, 4));
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it('chance lands near its probability', () => {
    const rng = createRng(9);
    let hits = 0;
    for (let i = 0; i < 10000; i++) if (rng.chance(0.35)) hits++;
    expect(hits / 10000).toBeGreaterThan(0.32);
    expect(hits / 10000).toBeLessThan(0.38);
  });

  it('shuffle returns a permutation and leaves the input alone', () => {
    const rng = createRng(5);
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const output = rng.shuffle(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...output].sort((a, b) => a - b)).toEqual(input);
    expect(output).not.toEqual(input);
  });
});

describe('randomSeed', () => {
  it('returns a 32-bit unsigned integer', () => {
    const seed = randomSeed();
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(2 ** 32);
  });
});
