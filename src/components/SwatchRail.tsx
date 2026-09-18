import type { Stop } from '../palette/harmony';
import { oklchToHex } from '../palette/oklch';

interface SwatchRailProps {
  stops: Stop[];
  onToggleLock: (index: number) => void;
}

// The ramp puts at least one stop near lightness 0.85, where white text is
// unreadable, so labels flip to dark text on light stops.
const DARK_TEXT_ABOVE = 0.62;

export function SwatchRail({ stops, onToggleLock }: SwatchRailProps) {
  return (
    <div className="rail" role="group" aria-label="Palette">
      {stops.map((stop, index) => {
        const hex = oklchToHex(stop);
        return (
          <button
            key={index}
            type="button"
            className={stop.l > DARK_TEXT_ABOVE ? 'swatch swatch-light' : 'swatch'}
            aria-pressed={stop.locked}
            aria-label={stop.locked ? `${hex}, locked` : hex}
            style={{ background: hex }}
            onClick={() => onToggleLock(index)}
          >
            <span>{hex}</span>
            {stop.locked && <span>locked</span>}
          </button>
        );
      })}
    </div>
  );
}
