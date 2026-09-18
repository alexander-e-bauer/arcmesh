import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from './App';
import { decodePalette, encodePalette } from './palette/codec';
import { generatePalette } from './palette/harmony';
import { oklchToHex } from './palette/oklch';

const SWATCH = { name: /^#[0-9a-f]{6}/ };

function paletteInUrl() {
  return decodePalette(window.location.hash.slice(1));
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

  it('generates a palette and writes it to the URL when the hash is empty', () => {
    render(<App />);
    const palette = paletteInUrl();
    expect(palette).not.toBeNull();
    expect([4, 5]).toContain(palette!.stops.length);
  });

  it('rerolls on Randomize', () => {
    render(<App />);
    const before = paletteInUrl()!;
    fireEvent.click(screen.getByRole('button', { name: 'Randomize' }));
    expect(paletteInUrl()!.seed).not.toBe(before.seed);
  });

  it('rerolls on Space and keeps a locked stop', () => {
    render(<App />);
    fireEvent.click(screen.getAllByRole('button', SWATCH)[1]);
    const locked = paletteInUrl()!.stops[1];
    expect(locked.locked).toBe(true);

    fireEvent.keyDown(window, { code: 'Space' });

    const after = paletteInUrl()!;
    expect(after.stops[1]).toEqual(locked);
    expect(screen.getAllByRole('button', SWATCH)[1]).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the CSS it renders', () => {
    render(<App />);
    expect(screen.getByText(/background-color: #/)).toBeInTheDocument();
  });
});
