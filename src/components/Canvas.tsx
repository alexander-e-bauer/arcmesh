import { useRef, type PointerEvent } from 'react';
import type { Palette } from '../palette/harmony';
import { oklchToHex } from '../palette/oklch';
import { paletteToCss } from '../render/css';

interface CanvasProps {
  palette: Palette;
  onMove: (index: number, x: number, y: number) => void;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

// The preview is the palette CSS applied through a style element, so the
// copied string and the rendered element never drift apart.
export function Canvas({ palette, onMove }: CanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<number | null>(null);

  function unitPoint(event: PointerEvent<HTMLElement>) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    return {
      x: clamp01((event.clientX - rect.left) / rect.width),
      y: clamp01((event.clientY - rect.top) / rect.height),
    };
  }

  return (
    <div className="canvas" ref={canvasRef} data-testid="canvas">
      <style>{`.canvas {\n${paletteToCss(palette)}\n}`}</style>
      {palette.stops.map((stop, index) => (
        <span
          key={index}
          className="handle"
          data-testid="handle"
          style={{ left: `${stop.x * 100}%`, top: `${stop.y * 100}%`, background: oklchToHex(stop) }}
          onPointerDown={(event) => {
            if (event.pointerType === 'mouse' && event.button !== 0) return;
            dragging.current = index;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (dragging.current !== index) return;
            const point = unitPoint(event);
            if (point) onMove(index, point.x, point.y);
          }}
          onPointerUp={() => {
            dragging.current = null;
          }}
          onPointerCancel={() => {
            dragging.current = null;
          }}
          onLostPointerCapture={() => {
            dragging.current = null;
          }}
        />
      ))}
    </div>
  );
}
