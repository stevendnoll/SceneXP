# Contributing to SceneXP

Thank you for considering a contribution. New 3D experiences are warmly
welcomed, and so are fixes and improvements to the site itself.

SceneXP is a home for browser-native 3D experiences: worlds, games,
experiments, stories, and simulations. Some were built to honor a person,
place, or business. Others exist to show visitors what a browser can do. We
would be delighted to host whichever kind you bring.

By participating you agree to our [code of conduct](CODE_OF_CONDUCT.md), and
security concerns are best raised through the steps in
[SECURITY.md](SECURITY.md).

## How the project is put together

There is no framework and no build step beyond minification. Each experience
is a static folder of browser-native HTML, CSS, and JavaScript, powered by
Three.js.

- **One folder per experience.** Every experience lives in its own folder
  under `www/`, like `www/dad`, and `www/family`, with its own
  `index.html`, config, and orchestrator. Styling comes from the shared
  versioned stylesheet in `www/shared/css`, and an experience that needs
  rules of its own can add an optional `css/experience.css`.
- **A shared parts library.** `www/shared/js` holds versioned, general-purpose
  modules (scene, lighting, controls, people, scenery, and more). An
  experience keeps its own `main.js` orchestrator and assembles imported
  parts driven by one plain config object. See `www/shared/js/README.md` for
  the ground rules and versioning scheme.
- **Three.js as a global.** Each experience's `index.html` loads
  `lib/three.min.js` as a classic script before its module graph.
- **esbuild for minification.** The pages load the `.min.js` and `.min.css`
  builds, so rebuild after any edit.

## Pick an interaction model

Every experience so far follows one of four interaction models, and choosing
one up front is the biggest design decision you will make. All four are
assembled from the same shared parts, so the existing experiences double as
working references. A new model is welcome too, if none of these fits what you
have in mind.

- **Explorable worlds.** First-person scenes that visitors walk through, with
  keyboard and mouse on desktop, dual joysticks on phones, and collision so
  nobody wanders through a wall. Some also offer a guided autopilot tour.
  `www/dad`, `www/family`, `www/interstate`, and `www/seedtoseed` are all built this way.
- **Composed views.** A fixed camera frames one lovingly detailed subject,
  and the scene moves instead of the visitor. A row of floating buttons
  offers gentle pan and zoom, with matching swipe and pinch gestures on
  touch screens, and tapping props opens short lines of story. This is the
  simplest model to build and a great fit for small subjects. It provides a fixed
  viewpoint with pan, tilt, and a dolly zoom, but tapping the ground plants
  a tree rather than opening a line of dialog, which is worth reading if your
  scene wants the visitor to change it.
- **Hands-off rides.** The scene drives itself and the visitor mostly
  watches, with play and pause, speed, and direction controls for light
  steering. The Mandelbrot dive (`www/mandelbrot`) is the reference: its
  auto zoom flies the camera while the visitor picks destinations and
  adjusts the ride. `www/highwater` is the strictest version of this, with
  no controls at all beyond starting and replaying.
- **Piloted flight.** The visitor drives a vehicle through open space rather
  than walking or watching, so the world moves around a camera that never
  stops. `www/earthdefense` is the reference: keyboard and mouse on desktop,
  a throttle on the left thumb and a look joystick on the right on phones,
  with a HUD carrying live ranges and target lock. Reach for this when the
  subject is the movement itself rather than the place.

## Layer on the delight

Whichever model you choose, a few optional layers have proven to be the
difference between a scene visitors look at and a scene they share:

- **Discovery checklists.** A short list of things to find in the scene,
  ticked off with a small celebration as visitors discover them.
- **Tap-to-talk props.** Objects and characters that respond to a click or
  tap with a short line of story. In a world built for someone, this is where
  their personality lives.
- **Guided tours.** An autopilot that drives the camera past the highlights
  until the visitor takes over.
- **Featuring a business.** An experience built for a business can carry its
  logo on the loading and welcome screens, a floating button to its website,
  and a warm invitation card that appears as visitors explore. Always with
  the owner's permission, and always in the spirit of a tribute rather than
  an advertisement.

The shared modules behind each of these live in `www/shared/js`, documented
part by part in its `README.md`.

## Dress the shared controls

Every experience shares one welcome screen, loading screen, crosshair,
joystick pair, floating button set, and panel family. By default that chrome
is a quiet near-white that sits under any scene without competing with it. If
your world has a mood of its own, name a theme on your `<html>` element and
the whole set follows along:

```html
<html lang="en" data-ui-theme="garden">
```

The themes live at the top of `www/shared/css/styles-1.0.0.css`, next to the
`--ui-*` tokens they set. Today's set is `garden` (leaf green), `surf` (sea
glass aqua), `neon` (stage-light rose), and `ember` (deep-space amber).
Leaving the attribute off keeps the default.

Adding a theme is six tokens copied from an existing block. Two things to
keep in mind. Reach for a light tint of your hue rather than the brand color
itself, since the welcome overlay is dark and most brand colors disappear
against it. And keep `--ui-accent-rgb` in step with `--ui-accent`: they are
the same color written twice, because the translucent washes need the
channels separately. `tests/ui-theme.test.mjs` checks both, along with the
contrast of every theme, so a mistake here shows up as a red test rather than
an unreadable welcome screen.

One more token to know about. The mobile joysticks follow your accent unless
you set `--ui-joystick-rgb`, and they are a pair of filled circles sat low on
the screen, one on each side. In pink and flesh tones that arrangement reads
as anatomy rather than as controls, so a theme in that part of the spectrum
points the joysticks somewhere cooler and leaves the rest of its palette
alone. The `neon` theme does exactly this, and the test suite holds the line
for any theme that forgets.

For anything beyond color, an experience can still add its own
`css/experience.css`, loaded after the shared stylesheet. It can read the
same tokens, so custom pieces stay in step with the theme (see the
`.depth-chip` readout in `www/mandelbrot`).

## Run it locally

ES modules need to be served over HTTP, so run any static server from the
`www` folder:

```bash
cd www
python3 -m http.server 8000
# then open http://localhost:8000
```

## Build

```bash
npm install
npm run build   # minifies JS and CSS
npm test        # runs the Jest suite
```

Node 20 or newer is expected (see `.nvmrc`), and CI runs these same steps on
every pull request, including a check that the minified assets were rebuilt.

### Caching

The web server sets the actual `Cache-Control` headers and lives outside this
repository, so what a page can do about caching is choose names and query
strings that make a long `max-age` safe. Two conventions do that work:

- **Stylesheets carry a `?v=N` query** (`experience.min.css?v=1`). Bump it in
  the same commit that changes the file, or a returning visitor keeps the old
  one for as long as the header allows. This is the one that bites, because a
  stale stylesheet over fresh markup does not look like a caching problem, it
  looks like a broken layout.
- **Binary assets are versioned in the FILENAME** rather than by query. The
  Earth Defense textures are `earth_daymap_1k.webp` and friends, so a resize or
  a recompress ships under a new name and no cache anywhere has to be
  persuaded to let go of the old one. Aim for the same when replacing an image:
  new pixels, new filename.

The `main` branch does not accept direct pushes. Every change, including our
own, arrives through a pull request once the CI checks pass.

### Social cards, and the Mac screenshot trap

Each experience ships a 1200 by 630 card as `assets/og-<world>.webp` with a
`.jpg` beside it.

**The WebP is what every page points at, including Twitter.** `og:image`,
`twitter:image` and the directory card on the home page all name the WebP, on
every experience in the collection. An earlier version of this note said the JPEG was what
Twitter used, which was never true of any page in the repository.

The JPEG is not referenced by any page. It ships for two reasons:

- **The README embeds the JPEGs.** A README is rendered on hosts we do not
  control, so the widest-support format is the right one there.
- **It is the file to swap to** if a platform ever declines to render a WebP
  preview. Facebook has historically been the one to watch. Swapping means
  editing the two meta URLs on that page, which is why both files ship even
  though only one is ever served to a browser.

**A screenshot taken on a Mac carries the display's colour profile, not sRGB.**
Convert it without saying so and the tool keeps the raw numbers and drops the
tag, so a browser reads P3 values as sRGB and the result comes out visibly
duller and darker than the PNG you were looking at. On the Earth Defense card,
Earth's lit limb measured `rgb(47,53,71)` that way against `rgb(54,61,81)`
correctly converted, about thirteen percent down, and the amber pills lost
their warmth. It is easy to miss, because the PNG on your own screen keeps
looking right.

The fix is one flag, and the order matters. `-profile` must come **before**
`-strip`: it converts the pixels out of the display profile, and only then is
the tag safe to drop.

```bash
SRGB="/System/Library/ColorSync/Profiles/sRGB Profile.icc"
magick og-world.png -profile "$SRGB" -strip \
  -define webp:lossless=true -define webp:method=6 og-world.webp
magick og-world.png -profile "$SRGB" -strip \
  -quality 92 -sampling-factor 4:4:4 -interlace Plane og-world.jpg
```

`-strip` also removes the screenshot's EXIF and XMP, which is worth doing on
its own account. Two encoder choices are deliberate and worth understanding
rather than copying blindly:

- **`-quality 92` unless you measure a reason not to.** Lossy WebP is always
  4:2:0 internally, which can ring around large type on a dark background. An
  earlier Earth Defense card was a capture of its welcome screen, and its amber
  title measured RMSE 0.0135 over the text region against 0 for lossless, which
  earned the swap. The card that shipped is a gameplay frame whose only type is
  two small nav labels, and those come through at 0.0072, so quality 92 was the
  right answer there and lossless would have cost 186K against 41K to fix
  nothing. Measure your own card rather than inheriting either verdict.
- **`-sampling-factor 4:4:4` for the JPEG.** The default 4:2:0 washes out
  saturated colour against near-black, which on our cards is exactly where the
  accent colour lives.
- **`cwebp -sharp_yuv` when the card holds a small saturated object.** Lossy
  WebP is always 4:2:0 internally and there is no flag to change it, so a
  brightly coloured thing only a few pixels across loses half its chroma
  resolution, and **raising the quality will not buy it back**. On the High Water
  card the buoy is a 20 pixel orange float, and its error sat on a floor: RMSE
  0.0127 at quality 88 against 0.0112 at 97. A number that barely moves with
  quality is chroma subsampling rather than ringing, and it is the tell worth
  learning, because the instinct is to reach for a higher quality or for
  lossless and neither helps. `-sharp_yuv` took it to 0.0103 at 24.0 KB against
  24.2, so it cost nothing at all, where lossless would have been 136.6 KB.
  ImageMagick has no equivalent, so a card like that is encoded with `cwebp`
  from a PNG that ImageMagick has already converted out of the display profile:

  ```bash
  magick og-world.png -profile "$SRGB" -strip -alpha off /tmp/card.png
  cwebp -q 92 -sharp_yuv -metadata none /tmp/card.png -o og-world.webp
  magick /tmp/card.png -quality 92 -sampling-factor 4:4:4 -interlace Plane -strip og-world.jpg
  ```

  Measure your own card. A view with nothing small and saturated in it does not
  need this, and the plain ImageMagick recipe above is fine.
- **Watch what your picture is actually made of.** For the shipped card the
  real risk was never the text but the starfield, since lossy codecs like to
  eat isolated bright pixels on black. Counting them is a one-line check, and
  all 284 in a sample of open sky survived quality 92.

You can check your own conversion rather than trust it:

```bash
magick og-world.png -profile "$SRGB" reference.png
magick compare -metric RMSE reference.png og-world.jpg null:
```

## Tests

Pull requests should include unit tests for the code they add or change. The
suite lives in `tests/`, runs on plain Node with no browser required, and CI
enforces coverage floors: a strict one on the site and shared modules
(`www/js` and `www/shared/js`) and a gentler one on experience code, so a
change without tests is likely to fail the build. You can check the numbers
locally with:

```bash
npm run test:coverage
```

A new experience should ship with a small init test, following the
`tests/<experience>-init.test.mjs` pattern the existing experiences use: a
build-and-tick smoke test plus a few assertions about your world's layout or
behavior. The floor for experience code is sized for exactly that kind of
simple, honest test, and `tests/garden-init.test.mjs` is a good model to copy
from.

Every JS and CSS file under `www/` is minified automatically by convention
(`build.mjs` gives each one a `.min` sibling), so new files need no build
wiring at all.

## Optional pre-push hook

The repository ships a `pre-push` hook in `.githooks/` that runs the
coverage suite and rebuilds the minified assets before anything leaves your
machine, so anything CI would flag is caught early. It is opt-in, once per
clone:

```bash
git config core.hooksPath .githooks
```

To skip it for a single push, use `git push --no-verify`. CI remains the
source of truth either way.

## Adding a new experience

1. **Fork the repository** at
   [github.com/stevendnoll/SceneXP](https://github.com/stevendnoll/SceneXP)
   and clone your fork.
2. **Create your folder**, for example `www/your-world/`. The existing
   experiences are the best reference: start from their structure with an
   `index.html`, a `js/config.js` describing your world, and a `js/main.js`
   orchestrator that assembles parts from `www/shared/js`.
3. **Follow the metadata pattern.** Every experience page carries a strict
   same-origin Content Security Policy, full Open Graph and Twitter tags,
   JSON-LD structured data, and a polite no-JavaScript fallback. Copy the
   pattern from an existing experience's `index.html`.
4. **Make a social card.** A 1200 by 630 capture of your world, as
   `assets/og-<world>.webp` with a `.jpg` beside it. See the note below on
   converting one, because a screenshot straight off a Mac will not survive
   the trip unless you ask it to.
5. **Build and test.** Run `npm run build` (your new files are minified
   automatically) and `npm test`. Please include an init test for your
   world, following the `tests/<experience>-init.test.mjs` pattern (see the
   Tests section above).
6. **Add your world to the directory.** The directory is grouped into
   categories, so start by choosing the one your world belongs to:
   `worlds` (Worlds and games) for anything built for its own sake,
   `business` (Small business tributes), or `personal` (Personal tributes).
   Then add one card in `www/index.html`, at the top of that category's
   group, and add your world at the top of that same category's JSON-LD
   `ItemList` in the head of the same file, renumbering that list only.
   The other two groups do not move. Finally, add one URL in
   `www/sitemap.xml` and a short description under your category's heading
   in `www/llms.txt`.

   `tests/directory.test.mjs` checks all of that agrees, so if you put your
   world in one place and forget another, the suite will tell you which.

   There is no search box and no filter, so there is no catalog array to
   update: the cards in `www/index.html` are the list. Both controls
   existed and were removed on 2026-09-04, because a dozen scenes under
   three headings are quicker to scan than to search, and on a phone the
   controls pushed the first card below the fold.
7. **If your world remembers anything, say so in the privacy policy.**
   `sessionStorage` needs nothing: it goes when the tab closes, and the
   policy already covers it. But anything you put in `localStorage` outlives
   the visit, so it has to be named in `www/privacy.html` along with how a
   visitor clears it. `tests/privacy.test.mjs` holds the list of files
   allowed to write persistent storage and will fail the moment yours joins
   them, which is the reminder rather than the rule.
8. **Open a pull request** telling us the story behind your world. We read
   every one with genuine delight.

## House rules

- **Give visitors something worth their time.** That is the only test an
  experience has to pass here. Some of ours celebrate a real person, place, or
  business, and those are always welcome. So is a game, a simulation, or an
  experiment that honors nobody at all, which is how Earth Defense, High
  Water, and Fractal Garden were built. Kind worlds only, please, whichever
  kind you bring.
- **Security first.** Same-origin CSP, no third-party scripts, no trackers,
  no CDNs. Everything ships from this domain.
- **Accessible and considerate.** Keyboard support, reduced-motion respect,
  and a no-JavaScript fallback are part of the pattern, not extras. Worth
  checking early rather than late: if the only way into your world's main
  action is a pointer event on the canvas, it has no keyboard story yet, and
  no test will tell you.
- **Nothing leaves the visitor's device.** Storage here is for the visitor's
  benefit and nobody else's, so it stays in their browser and is never sent
  anywhere. If you keep something past the visit, disclose it (step 7 above)
  and give them a way to clear it.
- **Fast on phones.** Many visitors arrive on mobile, so keep assets lean
  and performance in mind.
- **A gracious tone.** User-facing copy should read like a world-class host:
  polite, warm, and professional. As a small house style, please avoid
  em-dashes and semicolons in user-facing text.
- **MIT licensed.** Contributions are published under the project's MIT
  license (see `LICENSE`). The bundled `three.min.js` keeps its own license
  from the Three.js Authors.

## Questions

If anything is unclear, please open an issue or reach out through the
[contact page](https://www.scenexp.com/contact.html). We will figure it out
together.
