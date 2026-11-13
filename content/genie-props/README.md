# Genie starter props

Original face-following props for the virtual props feature (see `docs/BACKLOG.md` → Virtual props).
They seed BoothGen's site-wide **Standard** prop library; operators add their own on top ("My props").

- 189 props in 6 categories and 55 sub-categories (General, Occasions, Holidays, Seasons, Era, Themed).
  A prop can appear in several sub-categories (`category` / `subcategory` is its home, `alsoIn` the rest).
- All artwork is drawn in code by `generate-props.js`: no characters, superheroes, logos, brands or
  traced images. Sign text avoids trademarked names and song/film quotes.
- `svg/` holds the masters; `png/` holds transparent PNGs, 1024 px on the long side.
- `catalog.json` lists categories, sub-categories and every prop with its placement data.

## Regenerate

```bash
node assets/props/generate-props.js
```

Needs Node 18+ and `rsvg-convert` (`brew install librsvg`) for the PNGs. Output is deterministic; edit the
script, not the generated files.

## Placement (anchor model)

Every prop is drawn so the guest's **eye distance** (center to center) is `eyeDistance` = 300 units.

| Field | Meaning |
|---|---|
| `anchor` | Face point the prop attaches to: `eyes` (midpoint between the eyes), `nose` (nose tip), `mouth` (mouth center), `chin` |
| `anchorPoint` | Where that face point sits in the prop's units (`size`). Can be outside the image, e.g. below a hat |
| `size` / `pngSize` | Prop units vs PNG pixels |

On a face: `scale = measuredEyeDistancePx / 300`; rotate by the eye line's angle (head roll); place the
prop so `anchorPoint` lands on the face point. Each face in the frame gets its own copy. The same data
works for Apple Vision (iPad) and ML Kit / MediaPipe (Android).

Hats and headbands assume the head top is about 1.6 eye distances above the eyes; operators may want a
per-prop size/offset nudge in BoothGen once real tracking is tested.
