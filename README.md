# SceneXP

[![CI](https://github.com/stevendnoll/SceneXP/actions/workflows/ci.yml/badge.svg)](https://github.com/stevendnoll/SceneXP/actions/workflows/ci.yml)

Custom 3D experiences, right in your browser. Built with [Three.js](https://threejs.org/) and nothing else but browser-native HTML, CSS, and JavaScript.

[![A glowing spiral of warm color deep inside the Mandelbrot set, captured mid-dive in the Mandelbrot experience](www/mandelbrot/assets/og-mandelbrot.jpg)](https://www.scenexp.com/mandelbrot/)

[SceneXP.com](https://www.scenexp.com/) is a live website hosting a growing collection of custom 3D experiences, each one built to honor a person, place, or business. The repository currently contains nine experiences (`www/dad`, `www/family`, `www/roqui`, `www/seedtoseed`, `www/interstate`, `www/steve`, `www/gavin`, `www/jamar`, and `www/mandelbrot`) along with the shared 3D experience engine in `www/shared` that powers them all.

The site itself is about three things:

1. Making the hosted 3D experiences easy to discover. Each experience lives in its own `www` subfolder and joins the browseable directory on the home page, the `sitemap.xml`, and the `llms.txt`.
2. Inviting visitors to [reach out](https://www.scenexp.com/contact.html) if they would like a custom 3D experience of their own.
3. Making it easy for developers to contribute their own 3D worlds through GitHub pull requests.

SEO is a high priority, as are security, performance, and accessibility.

## Run it locally

No build step. Serve the folder over HTTP (ES modules require `http://`, not `file://`):

```bash
cd SceneXP/www
python3 -m http.server 8000
# then open http://localhost:8000
```
Any static server works (`npx serve`, `php -S`, etc.).

## Minified assets

The pages load the `.min.js` and `.min.css` builds, so rebuild them after editing any JS or CSS:

```bash
npm install
npm run build
```

The build is convention over configuration: `build.mjs` gives every JS and CSS file under `www/` (except the vendored `www/lib/`) a minified sibling, so new files and new experiences are picked up automatically with nothing to wire up.

## Contributing

New experiences and improvements are warmly welcomed. See [CONTRIBUTING.md](CONTRIBUTING.md) for the build steps, the metadata pattern, and how to add your world to the directory, or read the friendlier overview on the site's [contribute page](https://www.scenexp.com/contribute.html). The `main` branch only changes through pull requests, and CI checks every one.

## Visitor data (the snaps folders)

The 3D experiences send anonymized, fire-and-forget usage pings to a static endpoint (`www/api.html`), where they land in the web server's access logs. In production, a separate collector script parses those logs and writes anonymized daily JSON snapshots into each experience's `snaps/` folder, which the in-world visitor dashboards read. The collector and the snapshots are not part of this repository (`snaps/` is git-ignored), so on a fresh clone the dashboards simply have no data to show. That is expected.

## License, credits, and trademarks

© 2026 Continuum Commerce LLC. Released under the MIT license, see [LICENSE](LICENSE). The license covers the custom code written for this project. A few things are **not** covered by it:

- The bundled `www/lib/three.min.js` is by the Three.js Authors and keeps its own MIT license header.
- The Seed to Seed name, logo, and related graphics are trademarks of their owner and appear on the live site as part of a tribute experience, with the owner's kind permission. They may not be reused, redistributed, or modified outside this project.
- The Interstate Tire name, logo, and related graphics are likewise trademarks of their owner, appearing on the live site as part of a tribute experience with the owner's kind permission, and carry the same restrictions.

The logo artwork itself is not included in this repository. The logo files, the Interstate favicon (which is drawn from the logo), and the social preview captures for those three experiences (which show the logos in-scene) are listed in `.gitignore` and never ship. On a fresh clone, those experiences show blank spots where the logos belong and their three cards on the home page have no preview images. Like the empty `snaps/` folders noted above, that is expected. If you fork this repository for your own site, please supply your own artwork in their place.

This project also stands on excellent open source tooling that never ships to the browser but makes the work possible. [esbuild](https://esbuild.github.io/) minifies the assets, and [Jest](https://jestjs.io/) runs the test suite. Both are MIT licensed and arrive via npm with their licenses intact. Our warm thanks to their maintainers, and to the [Three.js](https://threejs.org/) authors most of all.

The dad, family, roqui, gavin, and jamar experiences are personal tributes. The people they honor are portrayed with love and their real names are used with their (or their family's) blessing. The steve experience is a self-portrait: the developer's own home office, where every experience in this repository gets built, modeled with his blessing by definition (the cat was not consulted). The gavin experience honors the developer's son and his springtime tradition of releasing ladybugs and praying mantises into the patio plants (the mantises were not consulted either, and remain hidden). The jamar experience is a birthday present for the developer's best friend, who has the corner stage, the microphone, and a jukebox queue that knows exactly who is singing next. The mandelbrot experience honors Benoit Mandelbrot, the mathematician who first plotted the set in 1980, with an infinite auto zoom into the boundary that carries his name.
