import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { decodePalette, encodePalette } from './palette/codec';
import { generatePalette } from './palette/harmony';
import { oklchToHex } from './palette/oklch';

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
});
