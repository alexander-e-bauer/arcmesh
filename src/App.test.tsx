import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { decodePalette, encodePalette } from './palette/codec';
import { generatePalette } from './palette/harmony';
import { oklchToHex } from './palette/oklch';
import { paletteToCss } from './render/css';

const SWATCH = { name: /^#[0-9a-f]{6}/ };

function paletteInUrl() {
  return decodePalette(window.location.hash.slice(1));
}

function settle() {
  return new Promise((resolve) => setTimeout(resolve, 250));
}

describe('App', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('starts from the palette in the URL hash', () => {
    const palette = generatePalette(31, { count: 5 });
    window.history.replaceState(null, '', `#${encodePalette(palette)}`);
    const expected = decodePalette(encodePalette(palette))!;

    render(<App />);

    const swatches = screen.getAllByRole('button', SWATCH);
    expect(swatches).toHaveLength(5);
    expect(swatches[0]).toHaveTextContent(oklchToHex(expected.stops[0]));
  });

  it('generates a palette and writes it to the URL when the hash is empty', async () => {
    render(<App />);
    await waitFor(() => expect(paletteInUrl()).not.toBeNull());
    expect([4, 5]).toContain(paletteInUrl()!.stops.length);
  });

  it('rerolls on Randomize', async () => {
    render(<App />);
    await waitFor(() => expect(paletteInUrl()).not.toBeNull());
    const before = paletteInUrl()!;

    fireEvent.click(screen.getByRole('button', { name: 'Randomize' }));

    await waitFor(() => expect(paletteInUrl()!.seed).not.toBe(before.seed));
  });

  it('rerolls on Space and keeps a locked stop', async () => {
    render(<App />);
    fireEvent.click(screen.getAllByRole('button', SWATCH)[1]);
    await waitFor(() => expect(paletteInUrl()!.stops[1].locked).toBe(true));
    const locked = paletteInUrl()!.stops[1];
    const seed = paletteInUrl()!.seed;

    fireEvent.keyDown(window, { code: 'Space' });

    await waitFor(() => expect(paletteInUrl()!.seed).not.toBe(seed));
    expect(paletteInUrl()!.stops[1]).toEqual(locked);
    expect(screen.getAllByRole('button', SWATCH)[1]).toHaveAttribute('aria-pressed', 'true');
  });

  it('rerolls on Space while a swatch has focus', async () => {
    render(<App />);
    const swatch = screen.getAllByRole('button', SWATCH)[1];
    fireEvent.click(swatch);
    swatch.focus();
    await waitFor(() => expect(paletteInUrl()!.stops[1].locked).toBe(true));
    const seed = paletteInUrl()!.seed;

    fireEvent.keyDown(swatch, { code: 'Space' });

    await waitFor(() => expect(paletteInUrl()!.seed).not.toBe(seed));
    expect(paletteInUrl()!.stops[1].locked).toBe(true);
  });

  it('leaves Space alone on the action bar so Randomize does not reroll twice', async () => {
    render(<App />);
    await waitFor(() => expect(paletteInUrl()).not.toBeNull());
    const seed = paletteInUrl()!.seed;
    const randomize = screen.getByRole('button', { name: 'Randomize' });
    randomize.focus();

    fireEvent.keyDown(randomize, { code: 'Space' });
    await settle();

    expect(paletteInUrl()!.seed).toBe(seed);
  });

  it('drags a stop and its crease together into the URL', async () => {
    let seed = 1;
    while (!generatePalette(seed).creases.some((c) => c.stop === 0)) seed++;
    const palette = generatePalette(seed);
    window.history.replaceState(null, '', `#${encodePalette(palette)}`);
    const before = decodePalette(encodePalette(palette))!;
    const crease = before.creases.find((c) => c.stop === 0)!;

    render(<App />);
    const canvas = screen.getByTestId('canvas');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, toJSON: () => ({}),
    });
    const handle = screen.getAllByTestId('handle')[0];
    fireEvent.pointerDown(handle, { pointerId: 1 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 50, clientY: 75 });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    await settle();

    const after = paletteInUrl()!;
    expect(after.stops[0].x).toBeCloseTo(0.25, 3);
    expect(after.stops[0].y).toBeCloseTo(0.75, 3);
    const moved = after.creases.find((c) => c.stop === 0)!;
    expect(moved.cx).toBeCloseTo(crease.cx + (0.25 - before.stops[0].x), 3);
    expect(moved.cy).toBeCloseTo(crease.cy + (0.75 - before.stops[0].y), 3);
    expect(moved.r).toBeCloseTo(crease.r, 3);
  });

  it('writes the hash once after a burst of changes', async () => {
    render(<App />);
    await waitFor(() => expect(paletteInUrl()).not.toBeNull());
    const writes: string[] = [];
    const original = window.history.replaceState.bind(window.history);
    const spy = vi.spyOn(window.history, 'replaceState').mockImplementation((data, unused, url) => {
      writes.push(String(url));
      original(data, unused, url);
    });

    const randomize = screen.getByRole('button', { name: 'Randomize' });
    fireEvent.click(randomize);
    fireEvent.click(randomize);
    fireEvent.click(randomize);
    await settle();

    expect(writes).toHaveLength(1);
    spy.mockRestore();
  });

  it('shows the CSS it renders', () => {
    render(<App />);
    expect(screen.getByText(/background-color: #/)).toBeInTheDocument();
  });

  it('offers a PNG download in the action bar', () => {
    render(<App />);
    const toggle = screen.getByRole('button', { name: 'Download PNG' });
    expect(toggle.closest('.actions')).not.toBeNull();
  });

  it('toggles drift with a pressed button, carries it in the URL, and keeps the shown CSS still', async () => {
    render(<App />);
    await waitFor(() => expect(paletteInUrl()).not.toBeNull());
    const button = screen.getByRole('button', { name: 'Drift' });
    expect(button.closest('.actions')).not.toBeNull();
    expect(button).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(paletteInUrl()!.drift).toBe(true));
    expect(document.querySelector('style')!.textContent).toContain('@property --s0x');
    const shown = document.querySelector('pre.css')!.textContent!;
    expect(shown).not.toContain('@property');
    expect(shown.startsWith('background-color: #')).toBe(true);

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'false');
    await waitFor(() => expect(paletteInUrl()!.drift).toBe(false));
  });

  it('starts drifting when the link says so, and a reroll keeps it', async () => {
    const palette = { ...generatePalette(31), drift: true };
    window.history.replaceState(null, '', `#${encodePalette(palette)}`);
    render(<App />);
    const button = screen.getByRole('button', { name: 'Drift' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('pre.css')!.textContent).toBe(paletteToCss(decodePalette(encodePalette(palette))!));

    fireEvent.click(screen.getByRole('button', { name: 'Randomize' }));
    await waitFor(() => expect(paletteInUrl()!.seed).not.toBe(31));
    expect(paletteInUrl()!.drift).toBe(true);
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });
});
