# Genie starter backdrops

Original backdrops for the virtual backdrop feature (P8, background removal: the iPad cuts guests out of the
real background and puts them on a backdrop). They seed BoothGen's site-wide **Standard** backdrop library;
operators add their own on top ("My backdrops").

- 8 backdrops: Gold Bokeh, Blush Gradient, Studio Grey, Neon Night, Starry Night, Confetti Party, Sunset
  Beach, Glamour Sparkle.
- All artwork is drawn in code by `generate-backdrops.js`: no photos, characters, logos or traced images.
- `svg/` holds the masters; `jpg/` the backdrops, **1800×1200 JPEG** (a 4x6 at 300 dpi, the largest a
  backdrop ever needs to be, since it only fills a photo frame inside the print); `thumb/` 360×240 previews.
- `catalog.json` lists ids, names and files.

## Regenerate

```bash
node assets/backdrops/generate-backdrops.js
```

Needs Node 18+, `rsvg-convert` (`brew install librsvg`) and macOS `sips`. Output is deterministic; edit the
script, not the generated files.

## How the iPad uses a backdrop

The backdrop is scaled to fill each photo (centred crop), the guests are cut out with Apple Vision person
segmentation and laid on top, then props, filter and template follow as usual. Uploads bigger than
1800 px on the long side are scaled down by BoothGen.
