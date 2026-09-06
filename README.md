# SceneXP

[![CI](https://github.com/stevendnoll/SceneXP/actions/workflows/ci.yml/badge.svg)](https://github.com/stevendnoll/SceneXP/actions/workflows/ci.yml)

3D worlds, games, and experiments, right in your browser. Built with [Three.js](https://threejs.org/) and nothing else but browser-native HTML, CSS, and JavaScript.

[![SceneXP.com, custom 3D experiences, right in your browser](www/assets/og-image.jpg)](https://www.scenexp.com/)

[SceneXP.com](https://www.scenexp.com/) is a live website and a home for browser-native 3D experiences: worlds, games, experiments, stories, and simulations. Some were built to honor a person, place, or business. Others exist to show visitors what a browser can do. New experiences land regularly.

Everything runs client side. No app, no download, no account, no cookies, and no third-party scripts, trackers, or CDNs.

The site itself is about three things:

1. Making the hosted 3D experiences easy to discover. Each experience lives in its own `www` subfolder and joins the browseable directory on the home page, the `sitemap.xml`, and the `llms.txt`.
2. Making it easy for developers to contribute their own experiences through GitHub pull requests.
3. Inviting visitors to [reach out](https://www.scenexp.com/contact.html) if they would like an experience built for a person or a business of their own.

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
- The Earth Defense planet and moon textures in `www/earthdefense/assets/` are by Solar System Scope, © 2010-2017, and are used under a Creative Commons license rather than ours:

  > Planet and moon textures by Solar System Scope (https://www.solarsystemscope.com/textures), used under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Resized and recompressed for this experience.

  CC BY 4.0 permits commercial use and asks for credit, a link to the license, and a note that changes were made. The wording above is carried verbatim in the experience's pause panel and in [`www/earthdefense/assets/CREDITS.md`](www/earthdefense/assets/CREDITS.md), which also records what the originals were and exactly what we changed. The Mars map's own author describes it as based on NASA elevation and imagery with the saturation raised and the gaps filled with invented terrain, so please do not present it anywhere as a scientific map. Ours is a game and invented terrain is welcome there.
- The Seed to Seed name, logo, and related graphics are trademarks of their owner and appear on the live site as part of a tribute experience, with the owner's kind permission. They may not be reused, redistributed, or modified outside this project.
- The Interstate Tire name, logo, and related graphics are likewise trademarks of their owner, appearing on the live site as part of a tribute experience with the owner's kind permission, and carry the same restrictions.
- The Sunnyvale Jenn Consulting name and logo, the watercolor lotus mark and its wordmark, belong to Jenn and appear on the live site as part of a tribute experience with her kind permission. They carry the same restrictions.
- The Auto Man name, John Walker's three-blade W mark, his printed flyer, and the photographs of him are his property, and appear on the live site as part of a tribute experience with his blessing. They carry the same restrictions, with two things particular to this one. **His W is the one trademark here that ships inside this repository**, as [`www/automan/favicon.svg`](www/automan/favicon.svg), as the social card beside it, and as inline SVG in the page itself, for the reason set out below. And the photographs and the flyer are his likeness rather than a trademark, so please treat them with the same care you would want for your own.

Most of that artwork is not included in this repository. The Interstate Tire and Seed to Seed logo files, the Interstate favicon, the social preview captures that show those logos in-scene, the photographs of the people these experiences honor, and The Auto Man scene's flyer are all listed in `.gitignore` and never ship. On a fresh clone those experiences show blank spots where the artwork belongs. Like the empty `snaps/` folders noted above, that is expected. If you fork this repository for your own site, please supply your own artwork in their place.

**The Auto Man scene's three-blade W is the exception, and it does ship.** Withholding it was never possible: it is inline SVG path data in `www/automan/index.html`, written out twice, because the mark is the intro panel's bullet and the info button's glyph rather than a picture the page loads. Once the shape is in the page source, ignoring the files that also carry it buys nothing and costs something, so `www/automan/favicon.svg` and `www/automan/assets/og-automan.*` are committed too. The social card is the clearest case: `og-card.html` and `css/og-card.css` are the recipe that generates it, they ship, and their only image is that same favicon, so withholding the output while publishing the method would have been a gesture rather than a protection. **The mark is still his. Our MIT license covers the code that draws it and not the mark it draws**, and that holds wherever you meet it: in `favicon.svg`, in the two inline paths, on the social card, and in `css/experience.css` where it is sized. Please do not lift it into anything of your own.

What is withheld for that experience is his **likeness**, his photographs and his printed flyer, because a likeness is the one thing here that nothing in the repository can regenerate.

Sunnyvale Jenn Consulting is worth a look if you are building a tribute of your own, because less had to be held back from it. Its logo appears only in the page around the scene, on the loading screen, on the welcome card, and on the small round button that opens Jenn's own website, so `assets/svj-1.*` is the only artwork withheld. The 3D room deliberately never reproduces the mark and borrows only its teals, for the framed canvases and the whiteboard doodle, so the social preview is an ordinary scene capture and ships like any other. That means its card on the home page still has a preview image on a fresh clone, which the Interstate Tire and Seed to Seed cards do not. Keeping a logo out of the geometry and in the surrounding page is the cheaper arrangement for everyone.

The Auto Man is the other end of that range, and it is worth understanding before you copy either pattern. Drawing a mark as geometry rather than loading it as a file is a decision to ship it, whatever the ignore list says afterward, because the outline ends up in the page source where no rule can reach it. That was the right call here, since the W is a few dozen path commands and John gave his blessing for it. Just make that choice deliberately, and get the same blessing in writing before you draw somebody's logo into your own scene.

This project also stands on excellent open source tooling that never ships to the browser but makes the work possible. [esbuild](https://esbuild.github.io/) minifies the assets, and [Jest](https://jestjs.io/) runs the test suite. Both are MIT licensed and arrive via npm with their licenses intact. Our warm thanks to their maintainers, and to the [Three.js](https://threejs.org/) authors most of all.
