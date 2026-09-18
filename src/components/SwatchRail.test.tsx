import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { generatePalette } from '../palette/harmony';
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
});
