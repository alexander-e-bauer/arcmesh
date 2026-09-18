import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { generatePalette, type Stop } from '../palette/harmony';
import { oklchToHex } from '../palette/oklch';
import { SwatchRail } from './SwatchRail';

describe('SwatchRail', () => {
  it('renders a button per stop showing its hex', () => {
    const { stops } = generatePalette(2, { count: 4 });
    render(<SwatchRail stops={stops} onToggleLock={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(4);
    expect(buttons[0]).toHaveTextContent(oklchToHex(stops[0]));
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'false');
  });

  it('marks locked stops pressed and toggles on click', () => {
    const { stops } = generatePalette(2, { count: 4 });
    stops[1].locked = true;
    const onToggleLock = vi.fn();
    render(<SwatchRail stops={stops} onToggleLock={onToggleLock} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'true');
    expect(buttons[1]).toHaveAccessibleName(`${oklchToHex(stops[1])}, locked`);
    fireEvent.click(buttons[2]);
    expect(onToggleLock).toHaveBeenCalledWith(2);
  });

  it('flips to dark text on light stops', () => {
    const stops: Stop[] = [
      { l: 0.5, c: 0.1, h: 200, x: 0.25, y: 0.25, locked: false },
      { l: 0.85, c: 0.08, h: 240, x: 0.75, y: 0.75, locked: false },
    ];
    render(<SwatchRail stops={stops} onToggleLock={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).not.toHaveClass('swatch-light');
    expect(buttons[1]).toHaveClass('swatch-light');
  });
});
