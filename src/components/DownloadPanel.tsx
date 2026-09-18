import { useState } from 'react';
import type { Palette } from '../palette/harmony';
import { downloadPng } from '../render/canvas';

export const PRESETS = [
  { label: '1920 x 1080 (HD)', width: 1920, height: 1080 },
  { label: '2560 x 1440 (QHD)', width: 2560, height: 1440 },
  { label: '3840 x 2160 (4K)', width: 3840, height: 2160 },
  { label: '2048 x 2048 (Square)', width: 2048, height: 2048 },
  { label: '1170 x 2532 (Phone)', width: 1170, height: 2532 },
  { label: '1600 x 1000 (Preview shape)', width: 1600, height: 1000 },
] as const;

export const SIZE_MIN = 16;
export const SIZE_MAX = 8192;

// A blank or unreadable field keeps its last value rather than snapping to
// the minimum while the user is still typing.
export function parseSize(text: string, fallback: number): number {
  const value = Number(text);
  if (text.trim() === '' || !Number.isFinite(value)) return fallback;
  return Math.min(SIZE_MAX, Math.max(SIZE_MIN, Math.round(value)));
}

type Status = 'idle' | 'busy' | 'failed';

const LABELS: Record<Status, string> = {
  idle: 'Download',
  busy: 'Rendering',
  failed: 'Download failed',
};

interface DownloadPanelProps {
  palette: Palette;
  onDownload?: (palette: Palette, width: number, height: number) => Promise<void> | void;
}

export function DownloadPanel({ palette, onDownload = downloadPng }: DownloadPanelProps) {
  const [open, setOpen] = useState(false);
  const [widthText, setWidthText] = useState(String(PRESETS[0].width));
  const [heightText, setHeightText] = useState(String(PRESETS[0].height));
  const [lastWidth, setLastWidth] = useState<number>(PRESETS[0].width);
  const [lastHeight, setLastHeight] = useState<number>(PRESETS[0].height);
  const [status, setStatus] = useState<Status>('idle');

  const width = parseSize(widthText, lastWidth);
  const height = parseSize(heightText, lastHeight);
  const presetIndex = PRESETS.findIndex((preset) => preset.width === width && preset.height === height);
  const selectValue = presetIndex === -1 ? 'custom' : String(presetIndex);

  function choosePreset(value: string) {
    if (value === 'custom') return;
    const preset = PRESETS[Number(value)];
    setWidthText(String(preset.width));
    setHeightText(String(preset.height));
    setLastWidth(preset.width);
    setLastHeight(preset.height);
  }

  function settleWidth() {
    setWidthText(String(width));
    setLastWidth(width);
  }

  function settleHeight() {
    setHeightText(String(height));
    setLastHeight(height);
  }

  async function download() {
    setStatus('busy');
    try {
      await onDownload(palette, width, height);
      setStatus('idle');
    } catch {
      setStatus('failed');
    }
  }

  return (
    <div className="download">
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        Download PNG
      </button>
      {open && (
        <div className="download-panel" role="group" aria-label="PNG size">
          <label>
            Size
            <select aria-label="Size" value={selectValue} onChange={(event) => choosePreset(event.target.value)}>
              {PRESETS.map((preset, index) => (
                <option key={preset.label} value={String(index)}>
                  {preset.label}
                </option>
              ))}
              <option value="custom">Custom</option>
            </select>
          </label>
          <label>
            Width
            <input
              type="number"
              aria-label="Width"
              min={SIZE_MIN}
              max={SIZE_MAX}
              value={widthText}
              onChange={(event) => setWidthText(event.target.value)}
              onBlur={settleWidth}
            />
          </label>
          <label>
            Height
            <input
              type="number"
              aria-label="Height"
              min={SIZE_MIN}
              max={SIZE_MAX}
              value={heightText}
              onChange={(event) => setHeightText(event.target.value)}
              onBlur={settleHeight}
            />
          </label>
          <button type="button" onClick={download} disabled={status === 'busy'}>
            {LABELS[status]}
          </button>
        </div>
      )}
    </div>
  );
}
