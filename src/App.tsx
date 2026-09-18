import { useCallback, useEffect, useState } from 'react';
import { Canvas } from './components/Canvas';
import { CopyButton } from './components/CopyButton';
import { SwatchRail } from './components/SwatchRail';
import { decodePalette, encodePalette } from './palette/codec';
import { generatePalette, rerollPalette, type Palette } from './palette/harmony';
import { randomSeed } from './palette/rng';
import { paletteToCss } from './render/css';

function initialPalette(): Palette {
  return decodePalette(window.location.hash.slice(1)) ?? generatePalette(randomSeed());
}

export default function App() {
  const [palette, setPalette] = useState<Palette>(initialPalette);

  useEffect(() => {
    window.history.replaceState(null, '', `#${encodePalette(palette)}`);
  }, [palette]);

  const reroll = useCallback(() => {
    setPalette((current) => rerollPalette(current, randomSeed()));
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.code !== 'Space' || event.repeat) return;
      // A focused button already turns Space into a click.
      if (event.target instanceof HTMLButtonElement) return;
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

  function moveStop(index: number, x: number, y: number) {
    setPalette((current) => ({
      ...current,
      stops: current.stops.map((stop, i) => (i === index ? { ...stop, x, y } : stop)),
    }));
  }

  const css = paletteToCss(palette);

  return (
    <main className="app">
      <header className="bar">
        <h1>arcmesh</h1>
        <p className="hint">Space rerolls the unlocked stops. Click a swatch to lock it. Drag a blob to move it.</p>
        <div className="actions">
          <button type="button" onClick={reroll}>
            Randomize
          </button>
          <CopyButton text={css} />
        </div>
      </header>
      <Canvas palette={palette} onMove={moveStop} />
      <SwatchRail stops={palette.stops} onToggleLock={toggleLock} />
      <pre className="css">{css}</pre>
    </main>
  );
}
