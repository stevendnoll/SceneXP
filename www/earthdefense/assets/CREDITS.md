# Texture credits

> Planet and moon textures by Solar System Scope
> (https://www.solarsystemscope.com/textures), used under CC BY 4.0
> (https://creativecommons.org/licenses/by/4.0/). Resized and recompressed
> for this experience.

This is the wording asked for by the license, and it is carried verbatim here,
in the repository `README.md`, and in the experience's own pause panel, so a
visitor who never opens the source still finds it.

## What these files are

All six files in this folder are derived from three Solar System Scope 2k
textures. Copyright 2010-2017 Solar System Scope, licensed
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Commercial use is
expressly permitted. Attribution is required and changes must be indicated.
There are no further restrictions.

| Shipped file | Source file | SHA-256 of the source |
|---|---|---|
| `earth_daymap_1k.webp` / `.jpg` | Solar System Scope `2k_earth_daymap.jpg` | `767ee1dc6eb3802699bfccf6f264880f8acd0b80de3191cd24984fe279b07b7c` |
| `moon_1k.webp` / `.jpg` | Solar System Scope `2k_moon.jpg` | `2764ba6535ea0481a062846ee033cc7a909dae05b31a8fd13f3e98f3a7fd92bd` |
| `mars_1k.webp` / `.jpg` | Solar System Scope `2k_mars.jpg` | `2d187f3e77a98eaa8cea5f4cc722f633c122ef170b9e94ace6b5fb6cbc3f8e01` |

The sources were verified byte-for-byte identical to the Solar System Scope
downloads by hash. They are not in this repository. If you need to rebuild
these files, fetch the 2k set from
[solarsystemscope.com/textures](https://www.solarsystemscope.com/textures) and
check the hashes above before starting.

## Exactly what changed

CC BY asks that changes be indicated, so here they are in full. Nothing else
was done to any of them.

1. **Resized** from 2048 x 1024 to 1024 x 512. Lanczos, and each image was
   tiled three across before the resize with the middle third taken back out
   afterwards, so the pixels at the 0/360 degree meridian were filtered against
   their real neighbours rather than against the edge of the canvas. That is
   what keeps a visible seam off the back of each planet.
2. **Recompressed** to WebP at quality 82 (`cwebp -q 82 -m 6 -sharp_yuv`) and
   to progressive JPEG at quality 82 as a fallback for browsers that cannot
   decode WebP.

No colour grading, no retouching, no crop, no rotation. The three maps together
come to 235 KB of WebP or 287 KB of JPEG, against 2.2 MB for the originals.

## One thing not to say about the Mars map

Its author describes it as based on NASA elevation and imagery, with the
saturation raised and the gaps filled in with invented terrain. That is a
lovely thing to fly past and not a scientific map, and nothing on the page
describes it as one. Please keep it that way.
