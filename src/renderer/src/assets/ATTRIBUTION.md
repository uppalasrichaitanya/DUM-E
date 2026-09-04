# Asset attribution

DUM-E ships **no third-party art**. Everything visual is either generated
inside this repo or authored here:

## Procedural robot cast
`src/renderer/src/scene/office/portraitArt.ts` draws every character (static
portrait + in-scene sprite) from explicit per-character recipes on a pixel
grid: metal shell, face screen, antenna, torso, chest display, locomotion
base. No sprite sheets, no image assets. The cast names are Marvel references
kept for an internal tool — swap for original robot names before any public
distribution of DUM-E.

## Lab floor tilesets
`src/renderer/src/assets/tilesets/lab-*.png` are painted by
`tools/make-lab-tilesets.cjs` from a palette and per-tile painters, on the
same 16×16 grid layout the Tiled maps expect. Regenerate with
`node tools/make-lab-tilesets.cjs`.

## Maps
`src/renderer/src/assets/maps/*.tmj` are Tiled JSON map layouts, originally
vendored from [`shahar061/the-office`](https://github.com/shahar061/the-office)
(project code: ISC) and since edited in this repo. Layouts only — they draw
against the generated lab tilesets.

## Brand + icons
`tools/make-logo.cjs` renders the DUM-E brand mark (robot bust on the
arc-reactor blue tile) and the app icon set from the same hand-authored pixel
grid. Regenerate with `node tools/make-logo.cjs` (macOS `.icns` needs
`iconutil -c icns build/icon.iconset` on a Mac).

## Fonts
`src/renderer/src/assets/fonts/` bundles the app UI faces — check each font's
own license file there before redistributing.

## History note
The upstream project (Munder Difflin) shipped LimeZu "Modern Interiors"
tilesets; later versions purchased the Complete Version licence (credits
required), and this fork's first asset commit replaced them anyway with
generated lab tilesets of identical grid layout. No LimeZu files are present
in this fork. If a copy of those files resurfaces, do not commit them.
