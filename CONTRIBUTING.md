# Contributing to SceneXP

Thank you for considering a contribution. New 3D experiences are warmly
welcomed, and so are fixes and improvements to the site itself. Every
experience on SceneXP honors a person, place, or business, and we would be
delighted to host yours.

By participating you agree to our [code of conduct](CODE_OF_CONDUCT.md), and
security concerns are best raised through the steps in
[SECURITY.md](SECURITY.md).

## How the project is put together

There is no framework and no build step beyond minification. Each experience
is a static folder of browser-native HTML, CSS, and JavaScript, powered by
Three.js.

- **One folder per experience.** Every experience lives in its own folder
  under `www/`, like `www/dad`, `www/family`, and `www/roqui`, with its own
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

Every experience so far follows one of three interaction models, and choosing
one up front is the biggest design decision you will make. All three are
assembled from the same shared parts, so the existing experiences double as
working references.

- **Explorable worlds.** First-person scenes that visitors walk through, with
  keyboard and mouse on desktop, dual joysticks on phones, and collision so
  nobody wanders through a wall. Some also offer a guided autopilot tour.
  `www/dad`, `www/family`, `www/roqui`, and `www/steve` are all built this way.
- **Composed views.** A fixed camera frames one lovingly detailed subject,
  and the scene moves instead of the visitor. A row of floating buttons
  offers gentle pan and zoom, with matching swipe and pinch gestures on
  touch screens, and tapping props opens short lines of story. This is the
  simplest model to build and a great fit for small subjects. See
  `www/gavin`.
- **Hands-off rides.** The scene drives itself and the visitor mostly
  watches, with play and pause, speed, and direction controls for light
  steering. The Mandelbrot dive (`www/mandelbrot`) is the reference: its
  auto zoom flies the camera while the visitor picks destinations and
  adjusts the ride.

## Layer on the delight

Whichever model you choose, a few optional layers have proven to be the
difference between a scene visitors look at and a scene they share:

- **Discovery checklists.** A short list of things to find in the scene,
  ticked off with a small celebration as visitors discover them.
- **Tap-to-talk props.** Objects and characters that respond to a click or
  tap with a short line of story. This is where the honoree's personality
  lives.
- **Guided tours.** An autopilot that drives the camera past the highlights
  until the visitor takes over.
- **Featuring a business.** Experiences that honor a business can carry its
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

The `main` branch does not accept direct pushes. Every change, including our
own, arrives through a pull request once the CI checks pass.

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
simple, honest test, and `tests/gavin-init.test.mjs` is a good model to copy
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
4. **Build and test.** Run `npm run build` (your new files are minified
   automatically) and `npm test`. Please include an init test for your
   world, following the `tests/<experience>-init.test.mjs` pattern (see the
   Tests section above).
5. **Add your world to the directory.** One card in `www/index.html`, one
   entry in the catalog array in `www/js/directory.js`, and one URL in
   `www/sitemap.xml`. Also please add a short description of your world
   in the `www/llms.txt` file.
6. **Open a pull request** telling us the story behind your world. We read
   every one with genuine delight.

## House rules

- **Honor someone.** Every experience celebrates a person, place, or
  business. Kind worlds only, please.
- **Security first.** Same-origin CSP, no third-party scripts, no trackers,
  no CDNs. Everything ships from this domain.
- **Accessible and considerate.** Keyboard support, reduced-motion respect,
  and a no-JavaScript fallback are part of the pattern, not extras.
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
