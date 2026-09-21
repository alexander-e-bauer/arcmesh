import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { generatePalette } from '../palette/harmony';
import { paletteToCss } from '../render/css';
import { Canvas } from './Canvas';

describe('Canvas', () => {
  it('renders one handle per stop beside a mesh element that carries the palette CSS', () => {
    const palette = generatePalette(4, { count: 5 });
    const { container } = render(<Canvas palette={palette} onMove={vi.fn()} />);
    expect(screen.getAllByTestId('handle')).toHaveLength(5);
    const style = container.querySelector('style');
    expect(style?.textContent).toBe(`.canvas > .mesh {\n${paletteToCss(palette)}\n}`);
    const mesh = screen.getByTestId('mesh');
    const canvas = screen.getByTestId('canvas');
    expect(mesh.parentElement).toBe(canvas);
    expect(mesh.childElementCount).toBe(0);
    // The filter in that CSS would warp anything inside the mesh, so the
    // handles come after it, as siblings.
    for (const handle of screen.getAllByTestId('handle')) {
      expect(handle.parentElement).toBe(canvas);
      expect(mesh.compareDocumentPosition(handle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('reports drags as unit coordinates', () => {
    const palette = generatePalette(4, { count: 4 });
    const onMove = vi.fn();
    render(<Canvas palette={palette} onMove={onMove} />);

    const canvas = screen.getByTestId('canvas');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 200,
      height: 100,
      right: 200,
      bottom: 100,
      toJSON: () => ({}),
    });

    const handle = screen.getAllByTestId('handle')[0];
    fireEvent.pointerDown(handle, { pointerId: 1 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 50, clientY: 75 });
    expect(onMove).toHaveBeenCalledWith(0, 0.25, 0.75);

    fireEvent.pointerUp(handle, { pointerId: 1 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 100, clientY: 50 });
    expect(onMove).toHaveBeenCalledTimes(1);
  });

  it('clamps drags to the canvas', () => {
    const onMove = vi.fn();
    render(<Canvas palette={generatePalette(4)} onMove={onMove} />);
    const canvas = screen.getByTestId('canvas');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 200,
      height: 100,
      right: 200,
      bottom: 100,
      toJSON: () => ({}),
    });
    const handle = screen.getAllByTestId('handle')[0];
    fireEvent.pointerDown(handle, { pointerId: 1 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: -40, clientY: 500 });
    expect(onMove).toHaveBeenCalledWith(0, 0, 1);
  });

  it('ignores a drag started with a secondary mouse button', () => {
    const onMove = vi.fn();
    render(<Canvas palette={generatePalette(4)} onMove={onMove} />);
    const canvas = screen.getByTestId('canvas');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 200,
      height: 100,
      right: 200,
      bottom: 100,
      toJSON: () => ({}),
    });
    const handle = screen.getAllByTestId('handle')[0];
    fireEvent.pointerDown(handle, { pointerId: 1, pointerType: 'mouse', button: 2 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 50, clientY: 50 });
    expect(onMove).not.toHaveBeenCalled();
  });

  it('ends the drag when pointer capture is lost', () => {
    const onMove = vi.fn();
    render(<Canvas palette={generatePalette(4)} onMove={onMove} />);
    const canvas = screen.getByTestId('canvas');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 200,
      height: 100,
      right: 200,
      bottom: 100,
      toJSON: () => ({}),
    });
    const handle = screen.getAllByTestId('handle')[0];
    fireEvent.pointerDown(handle, { pointerId: 1 });
    fireEvent.lostPointerCapture(handle, { pointerId: 1 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 50, clientY: 50 });
    expect(onMove).not.toHaveBeenCalled();
  });
});
