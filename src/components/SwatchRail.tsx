import type { Stop } from '../palette/harmony';
import { oklchToHex } from '../palette/oklch';

interface SwatchRailProps {
  stops: Stop[];
  onToggleLock: (index: number) => void;
}

export function SwatchRail({ stops, onToggleLock }: SwatchRailProps) {
  return (
    <div className="rail" role="group" aria-label="Palette">
      {stops.map((stop, index) => {
        const hex = oklchToHex(stop);
        return (
          <button
            key={index}
            type="button"
            className="swatch"
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
