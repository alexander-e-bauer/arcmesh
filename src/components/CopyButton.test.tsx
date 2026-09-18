import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CopyButton } from './CopyButton';

describe('CopyButton', () => {
  it('copies the text and confirms', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    render(<CopyButton text="background-color: #000;" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy CSS' }));

    expect(writeText).toHaveBeenCalledWith('background-color: #000;');
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('says so when the clipboard refuses', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    render(<CopyButton text="background-color: #000;" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy CSS' }));

    expect(await screen.findByRole('button', { name: 'Copy failed' })).toBeInTheDocument();
  });
});
