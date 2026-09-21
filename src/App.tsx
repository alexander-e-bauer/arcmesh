import { useCallback, useEffect, useState } from 'react';
import { Canvas } from './components/Canvas';
import { CopyButton } from './components/CopyButton';
import { DownloadPanel } from './components/DownloadPanel';
import { SwatchRail } from './components/SwatchRail';
import { decodePalette, encodePalette } from './palette/codec';
import { generatePalette, moveStop, rerollPalette, type Palette } from './palette/harmony';
import { randomSeed } from './palette/rng';
import { paletteToCss } from './render/css';

// Dragging a blob changes the palette on every pointer move, and browsers
// rate-limit history writes (Safari throws past 100 in 30 seconds), so the
// hash is written only once the palette has held still for a moment.
const HASH_WRITE_DELAY = 150;

function initialPalette(): Palette {
  return decodePalette(window.location.hash.slice(1)) ?? generatePalette(randomSeed());
}

export default function App() {
  const [palette, setPalette] = useState<Palette>(initialPalette);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        window.history.replaceState(null, '', `#${encodePalette(palette)}`);
      } catch {
        // Rate limited; the next palette change schedules another write.
      }
    }, HASH_WRITE_DELAY);
    return () => window.clearTimeout(timer);
  }, [palette]);

  const reroll = useCallback(() => {
    const seed = randomSeed();
    setPalette((current) => rerollPalette(current, seed));
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.code !== 'Space' || event.repeat) return;
      // The action bar's buttons already turn Space into a click, so a reroll
      // there would fire twice. Anywhere else, including a focused swatch,
      // Space means reroll; preventing the default also stops the swatch
      // from toggling on keyup.
      if (event.target instanceof HTMLElement && event.target.closest('.actions')) return;
      event.preventDefault();
      reroll();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [reroll]);

  function toggleLock(index: number) {
    setPalette((current) => ({
      ...current,
      stops: current.stops.map((stop, i) => (i === index ? { ...stop, locked: !stop.locked } : stop)),
    }));
  }

  function move(index: number, x: number, y: number) {
    setPalette((current) => moveStop(current, index, x, y));
  }

  function toggleDrift() {
    setPalette((current) => ({ ...current, drift: !current.drift }));
  }

  const css = paletteToCss(palette);

  return (
    <main className="app">
      <header className="bar">
        <h1>arcmesh</h1>
        <p className="hint">Space rerolls the unlocked stops. Click a swatch to lock it. Drag a blob to move it. Drift sets the blobs moving. Download PNG saves it at any size.</p>
        <div className="actions">
          <button type="button" onClick={reroll}>
            Randomize
          </button>
          <button type="button" aria-pressed={palette.drift} onClick={toggleDrift}>
            Drift
          </button>
          <CopyButton text={css} />
          <DownloadPanel palette={palette} />
        </div>
      </header>
      <Canvas palette={palette} onMove={move} />
      <SwatchRail stops={palette.stops} onToggleLock={toggleLock} />
      <pre className="css">{css}</pre>
    </main>
  );
}
