# DUM-E Art Techniques — The Bible

> Every pixel DUM-E renders is procedural — the robot cast (`portraitArt.ts`),
> the lab floor (`tools/make-lab-tilesets.cjs`), the brand mark
> (`tools/make-logo.cjs`), the splash (CSS in `index.html`). This document
> codifies the craft rules that keep them at a professional tier. It is
> canonical for all four generators; when a rule here and a generator
> disagree, fix the generator. Referenced from DESIGN.md.

The one-line goal: **painted, not filled.** Flat shapes with single fills
read as programmer art; lit shapes with hue-shifted ramps read as crafted.

---

## 1. Key light

One global light source for the whole app: **top-left, ~45° elevation.**
Every robot, tile, and equipment piece is lit as if the same lamp hangs
above the lab's left corner.

- Highlights cluster on the upper-left of every curve; core shadows on the
  lower-right.
- A highlight on the lower-right of anything is a bug — or a deliberate
  bounce (§7).
- Emissives (§6) are their own light sources and may break this rule locally,
  but their halos obey it: brighter on the side facing the key light.

## 2. Ramp construction (the core technique)

Every material gets a **5-shade ramp**, not 3. The step that separates pro
pixel art from amateur is **hue shifting**: shadows and highlights drift in
hue, not just luminance.

| Step | Name | Construction |
|---|---|---|
| 0 | specular | near-white, hue of the key light (warm ~[255,250,238]) |
| 1 | highlight | base ×1.25, hue pushed toward warm white (−20 blue, +10 red) |
| 2 | base | the material's identity color |
| 3 | shadow | base ×0.62, hue pushed toward blue-violet (+18 blue, −8 red) |
| 4 | core shadow | shadow ×0.55, deeper blue-violet again |

Concrete rule: when darkening, **add blue and pull red**; when lightening,
**add warm and pull blue**. Metal gets an extra specular step (near-white
with a faint hue of the base); matte plastic/fabric stops at highlight.

The `shades()` helper family in every generator implements exactly this —
if a painter needs a color not in its ramp, extend the ramp, never
hand-pick an off-ramp color.

## 3. Selective outlining (sel-out)

Uniform dark outlines flatten and date the art. Instead:

- Outline pixels on the **lit (upper-left) edge** lighten toward the
  material's shadow tone — the outline "opens up" where light hits.
- Outline pixels on the **shadow edge** stay near-black.
- Small sprites can keep a fuller outline for readability at 1×; large
  surfaces (walls, floors, torsos) earn sel-out.
- LYLA (hologram) keeps **no outline** — her identity is light, not ink.

## 4. Dithering

2px checkerboard bands **only at ramp transitions** on large surfaces
(chest plates, floor plates, wall panels) — never on small details, never
on curves (they get AA instead, where the pipeline allows).

- A band is 1–2 rows of `ABAB` checker where shade A meets shade B.
- Purpose: texture + the eye's blending, faking a gradient the palette
  forbids. If a dither band sits on a detail smaller than 4px wide, remove
  it — it reads as noise.

## 5. Bevels (the SNES panel recipe)

Every raised surface gets the 4-layer edge, 1px each, no gradients:

```
top+left edge:    light (highlight step)
bottom+right edge: dark (shadow step)
corner pixels:    base (the light turns the corner)
```

- Inset/recessed surfaces (inlays, screens) invert it: dark top-left,
  light bottom-right.
- This applies to floor panel inlays, wall panels, furniture faces, UI
  panel borders (CSS `box-shadow` inset stacks in PixelPanel do this in
  web space), and the logo tile's border.

## 6. Emissive budget

LEDs, screens, glow strips, and holograms are emissive — they are lights,
not lit things:

- Each emissive pixel may earn a **1px dim halo** of its own hue at ~35%
  luminance on the surface it sits on.
- **Max 2 emissive zones** per tile or per robot (e.g. one screen + one
  LED). More reads as a Christmas tree.
- Emissive halos obey the key light: slightly stronger on the key side.
- Screens show content (code-lines, readouts), not just glow.

## 7. Ambient bounce

The lab floor is blue; it reflects. 1px of blue-tinted shadow (blue +8
over the shadow step) on the **underside** of robots' bases, furniture
bottoms, and any face pointing down at the floor. One row only — this is a
whisper, not a wash.

## 8. Speculars

One bright pixel (specular step) at the top of every glossy curve facing
the key light: shell domes, extinguisher cylinders, monitor bezels.
**Matte drones (doombot, ultronbot, sentinel, edith) get none** — gloss is
characterful; its absence is too.

## 9. Texture noise

Large flat fills read as dead. Seeded per-pixel **±4 luminance jitter**
(2–3 luminance only, no hue) on fills bigger than ~8×8px: floor plates,
wall panels, furniture faces. The jitter must be stable across regenerations
(same seed → same pixels) and subtle enough to vanish at 50% zoom while
killing flatness at 100%.

## 10. The squint test (the gate)

- **Robots**: every cast member distinguishable in silhouette alone — blur
  your eyes; if two robots swap identities, the pass fails.
- **Tiles**: every tile class readable at 50% zoom.
- **UI**: panels read as raised/recessed without reading their CSS.

A render that passes preview tools but fails the squint test is not done.

---

## Current-state audit (updated 2026-09-06, after the perfection pass)

| Rule | State |
|---|---|
| Key light | ✅ — one top-left key light across robots (head crescents, torso light columns, lit pods/pauldrons), tiles (catch-lights, bevel edges), and UI (bevel stacks) |
| 5-shade ramps | ✅ — `ramp5()` (portraitArt) + `ramp()` (tilesets) with hue-shifted shadows/highlights everywhere |
| Sel-out | ✅ — `outlinePass` is selective (lit-edge rim warms, shadow edge stays ink); LYLA keeps no-outline holo |
| Dithering | ✅ — 2px checker bands at the inlay lips (floor), shoulder→chest transitions (glossy robots) |
| Bevels | ✅ — every raised/inset tile surface; `--cth-panel-bevel*` tokens carry it into UI dialogs |
| Emissive budget | ✅ — ≤2 zones per tile/robot, 1px halos on LEDs/rings (active rack bays, charger arc, power dots) |
| Ambient bounce | ✅ — blue-tinted underside rows on every base (feet, treads, hover skirts, furniture, equipment stands) |
| Speculars | ✅ — single curve-top speculars on glossy materials only; matte drones deliberately bare |
| Texture noise | ✅ — seeded ±4 luminance jitter on all large fills (stable across regenerations) |
| Squint test | ✅ — 13 robots distinct in silhouette at ASCII level; tile classes readable at 50% zoom |

Maintenance rule: any new painter, sprite, or panel introduced to the codebase
must follow this document — and this table must not regress. If a rule above
and a generator disagree, fix the generator, then re-run its preview tool and
the verification battery (tests + typechecks + build).
