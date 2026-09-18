# arcmesh

A mesh gradient generator whose Randomize button picks a palette, not a seed.

![arcmesh showing four blobs, violet, cream, plum, and pink, blending into one field over a dark background](docs/arcmesh.jpg)

## Why

Mesh gradient tools usually make you pick the colors, which is the hard part. Their randomize buttons reshuffle positions and leave the colors alone, or sample hues independently and produce grey smears where far-apart hues blend.

arcmesh picks hues on one arc of the color wheel, 30 to 90 degrees wide, assigns lightness along a ramp so every mesh has a bright region and a deep region, and lets an occasional accent sit opposite the arc at reduced chroma so it blends without going muddy. Everything happens in OKLCH, where equal numeric steps read as equal visual steps, and every color is clamped into the sRGB gamut by binary search on chroma rather than by clipping channels.

The preview is a stack of CSS radial-gradients applied through a style element, and the copied CSS is that same string. What you see is what you paste.

## Use

Space or the Randomize button rerolls every unlocked stop. Click a swatch to lock it. Drag a blob to move it. Copy CSS copies the declarations. The URL hash holds the whole palette, so a link reproduces it.

## Run

```sh
npm install
npm run dev
npm test
npm run build
```

Requires Node 22 or newer. On npm 11, `npm install` warns that it skipped esbuild's postinstall script; the build works without it.

No backend, no environment variables, no accounts. It deploys as a static site.

## Layout

`src/palette` is the engine: a seeded generator, the OKLCH math, the harmony rules, and the URL codec. It imports nothing from React or the DOM and is tested directly, including a property test that generates a thousand palettes and guards that every color is in gamut and every palette honors the arc rule.

`src/render/css.ts` turns a palette into CSS. `src/components` and `src/App.tsx` are the React shell.

The OKLCH to sRGB conversion is written out rather than imported. It is about sixty lines, uses the standard Ottosson coefficients, and is tested against published values for the sRGB primaries.

## License

MIT
