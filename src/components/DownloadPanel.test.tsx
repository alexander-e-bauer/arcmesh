import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { generatePalette } from '../palette/harmony';
import { DownloadPanel, parseSize, PRESETS } from './DownloadPanel';

describe('parseSize', () => {
  it('rounds and clamps to the allowed range', () => {
    expect(parseSize('1920', 1)).toBe(1920);
    expect(parseSize('5', 1)).toBe(16);
    expect(parseSize('99999', 1)).toBe(8192);
    expect(parseSize('100.6', 1)).toBe(101);
  });

  it('keeps the previous value for blank or non-numeric text', () => {
    expect(parseSize('', 640)).toBe(640);
    expect(parseSize('abc', 640)).toBe(640);
  });
});

describe('DownloadPanel', () => {
  const palette = generatePalette(5);

  it('opens with the default preset', () => {
    render(<DownloadPanel palette={palette} onDownloadPng={vi.fn()} onDownloadSvg={vi.fn()} />);
    const toggle = screen.getByRole('button', { name: 'Download' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('combobox', { name: 'Size' })).toHaveValue('0');
    expect(screen.getByRole('spinbutton', { name: 'Width' })).toHaveValue(PRESETS[0].width);
    expect(screen.getByRole('spinbutton', { name: 'Height' })).toHaveValue(PRESETS[0].height);
  });

  it('writes both numbers when a preset is chosen', () => {
    render(<DownloadPanel palette={palette} onDownloadPng={vi.fn()} onDownloadSvg={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Size' }), { target: { value: '2' } });
    expect(screen.getByRole('spinbutton', { name: 'Width' })).toHaveValue(3840);
    expect(screen.getByRole('spinbutton', { name: 'Height' })).toHaveValue(2160);
  });

  it('flips to Custom when a number is edited and clamps it on blur', () => {
    render(<DownloadPanel palette={palette} onDownloadPng={vi.fn()} onDownloadSvg={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    const width = screen.getByRole('spinbutton', { name: 'Width' });
    fireEvent.change(width, { target: { value: '3000' } });
    expect(screen.getByRole('combobox', { name: 'Size' })).toHaveValue('custom');
    fireEvent.change(width, { target: { value: '5' } });
    fireEvent.blur(width);
    expect(width).toHaveValue(16);
  });

  it('renders the PNG at the chosen size', async () => {
    const onDownloadPng = vi.fn().mockResolvedValue(undefined);
    render(<DownloadPanel palette={palette} onDownloadPng={onDownloadPng} onDownloadSvg={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Width' }), { target: { value: '3000' } });
    fireEvent.click(screen.getByRole('button', { name: 'PNG' }));
    await waitFor(() => expect(onDownloadPng).toHaveBeenCalledWith(palette, 3000, PRESETS[0].height));
  });

  it('writes the SVG from the same two fields', async () => {
    const onDownloadSvg = vi.fn();
    render(<DownloadPanel palette={palette} onDownloadPng={vi.fn()} onDownloadSvg={onDownloadSvg} />);
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Height' }), { target: { value: '900' } });
    fireEvent.click(screen.getByRole('button', { name: 'SVG' }));
    await waitFor(() => expect(onDownloadSvg).toHaveBeenCalledWith(palette, PRESETS[0].width, 900));
  });

  it('says so on the button that failed, and leaves the other one alone', async () => {
    const onDownloadPng = vi.fn().mockRejectedValue(new Error('no canvas'));
    render(<DownloadPanel palette={palette} onDownloadPng={onDownloadPng} onDownloadSvg={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    fireEvent.click(screen.getByRole('button', { name: 'PNG' }));
    expect(await screen.findByRole('button', { name: 'Failed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'SVG' })).toBeInTheDocument();
  });
});
