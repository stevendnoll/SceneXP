# The Shared 3D Engine Parts Library

General-purpose pieces of the custom 3D experiences, extracted in Phase 4 so a
new experience is assembled from parts instead of copied from the previous
one. Each experience keeps its own `main.js` orchestrator; these modules are
imported parts driven by one plain config object (a "parts library", not a
framework).

The library was extracted from the developer's earlier portfolio
experiences. Every experience in this repository builds on it.

## Ground rules

- `THREE` is a global (each experience's index.html loads
  `../lib/three.min.js` as a classic script before its module graph).
- Modules import each other as `./<name>-<x.y.z>.min.js` (their own version;
  see Versioning below). Browser and Jest both resolve the real built files,
  so after ANY edit here run `npm run build` before `npm test` or a page load.
- Minification needs no build wiring: `build.mjs` minifies every JS file
  under `www/` by convention, this folder included. Name any new module
  `<name>-<x.y.z>.js` and it is covered.
  The `tests/shared-smoke.test.mjs` suite fails if a min sibling is missing.
- Never import upward out of `www/shared/js` (the smoke test enforces this).
  Content flows IN via config and registration calls, never by reaching into
  an experience folder.
- Built-in defaults describe the minimized world (small bounds, comet off,
  day/night + night zombies on, two pedestrians). `tests/shared-defaults.test.mjs`
  locks them; change them only on purpose.

## Versioning (Phase 5)

Every module exists only as semver-named files:
`<name>-<x.y.z>.js` / `<name>-<x.y.z>.min.js` (currently `1.0.0`). There is
no unversioned "latest" line. Each experience pins the version it was built
against (the interstate experience imports `../../shared/js/scene-1.0.0.min.js`
and friends), so later library work can never regress a shipped world.

Rules that keep the pin honest:

- A version's internal imports point at its own version (`controls-1.0.0.js`
  imports `./scene-1.0.0.min.js`). A pin that pulls another version's
  dependencies is no pin at all.
- Once an experience ships against a version, that version is frozen. New
  work cuts the next version and the new experience imports that.
- Cutting a new version, e.g. 1.0.1: copy each `<name>-1.0.0.js` to
  `<name>-1.0.1.js`, rewrite internal `-1.0.0.min.js` imports to
  `-1.0.1.min.js` (one sed over the copies), then `npm run build` (the new
  files are minified automatically). Also point the shared unit tests
  (`tests/shared-*.test.mjs` and the experience init suites) at
  whichever version they should exercise.
- Version the whole library as a set. Modules import each other, so mixing
  (scene 1.0.1 with controls 1.0.0) reintroduces the coupling the versions
  exist to prevent.

## The shared stylesheet is versioned differently

The freeze rule above is about the JavaScript parts, and it exists because
they import each other by relative specifier. A browser resolving
`./scene-1.0.0.min.js` gets whatever that filename holds today, so editing a
shipped version in place would silently change every experience pinned to it,
with no way for a world to opt out. That is the exact outcome the pin exists
to prevent, so a JavaScript change to a shipped version always cuts the next
version.

`www/shared/css/styles-1.0.0.css` works the other way around. Nothing imports
it. Each page links it by name, and a change to the shared chrome (the welcome
screen, the loading screen, the crosshair, the joysticks, the floating
buttons, the panels) is normally meant to reach every experience at once. The
UI theme tokens were added this way. Cutting a version for that would mean
editing every experience page regardless, and then serving two near-identical
stylesheets forever. So the shared stylesheet is edited in place, and the
pages retire their cached copy with a query instead:

```html
<link rel="preload" href="../shared/css/styles-1.0.0.min.css?v=1" as="style">
<link rel="stylesheet" href="../shared/css/styles-1.0.0.min.css?v=1">
```

That is the same `?v=<n>` convention the 2D pages already use for
`/css/site.min.css` and `/js/nav.min.js`. Three things to get right:

- Bump the number on BOTH the preload and the stylesheet line. A preload only
  satisfies the real request when the URLs match exactly, so a mismatch costs
  every visitor a second download and logs an unused-preload warning.
- Only bust what actually changed. A query on an untouched file buys nothing
  and costs a needless re-download, so a file carrying one reads as "this has
  been revised". An experience's own `css/experience.css` follows the same
  rule.
- The filename semver still moves for a stylesheet change that should reach
  some experiences and not others. That is a real version cut, exactly like
  the JavaScript: copy the file, point the pages that want it at the new name,
  and leave the rest pinned where they are.

## Init order contract

```js
initScene(canvas, CONFIG);   // renderer + sky (reads dayNight, comet)
initWorld(CONFIG);           // root group + collider/prop registries
// ... build content: experience code calling the builder parts ...
initChecklist(CONFIG.checklist);
initControls(CONFIG);        // spawn, bounds, speeds
```

## Parts catalog

| Module | What it is | Config keys / seams |
|---|---|---|
| `boot.js` | Proof-of-work load gate | `getProofOfWork({ prefix, storageKey, maxAgeMs })` |
| `telemetry.js` | Fire-and-forget usage pings to `../api.html` | `setProofHash`, `setMobile`, `track`, `trackFinal` |
| `analytics.js` | Visitor-activity dashboard (fetch + DOM) | `initAnalytics({...elements, onSummary, onLeaderboard})` |
| `scene.js` | Renderer, camera, sky, sun/moon/stars/clouds, day/night, optional comet | `dayNight: { enabled, cycleDuration }`, `comet: { enabled, base }`; `getCometBase()` for aiming props |
| `controls.js` | First-person + touch + VR + gamepad input | `initControls({ spawn, rotation, worldBounds, moveSpeed, ... })` |
| `world.js` | THE context seam: root group, config, colliders, outdoor props | `initWorld(config)`, `getWorldGroup/Config`, `addCollider(ForMesh)`, `registerOutdoorProp` |
| `collision.js` | Player AABB + wall-slide | `checkCollision(oldPos, newPos, radius, boxes)` for `setCollisionCallback` |
| `checklist.js` | Session discovery list + HUD panel | `initChecklist({ items, storageKey })`, `markChecklistItem`, `onChecklistChange` |
| `textures.js` | Procedural canvas textures (tile, concrete, stucco, wood) | pure, return textures |
| `structures.js` | Walls, wall segments, window/door frames | self-attach + colliders |
| `lighting.js` | Ceiling lights, night-brightening interior rig, dimmer, light switch, EXIT sign | `lighting: { base: { rectArea, hemi, corner, ceiling }, nightBoost }` |
| `furniture.js` | Plants, sofa, lounge chair, vending machine | pure, return groups |
| `people.js` | Procedural human figures | `createPerson(config)`, `shuffled`, `pickBalanced` |
| `npcs.js` | Indoor visitor wander AI, host look-at, dialog pause/resume, floating signs | `setWanderWaypoints(list)`, `initGalleryVisitors(count)`, `registerHost(person, rot)`, `setHelpSign(sign)` |
| `gallery.js` | Framed wall art: procedural canvas pieces, placards, faked picture lights, clickable floor mats, NPC viewing waypoints | `initGallery({ sections, storeConfig })` — each experience's own `gallery.js` holds the GALLERY_SECTIONS content model; `resolveGalleryPiece(hit)`, `setPieceHighlight`, `getViewingWaypoints(standoff)` |
| `pedestrians.js` | Sidewalk walkers + night zombies | `pedestrians: { count, sidewalkZ, minX, maxX }`, `zombiesAtNight`, `setRefugeFootprints(rects)` |
| `street.js` | Trees, street lamps, benches, planters | self-attach + colliders + click props |
| `scenery.js` | Drifting background clouds | `scenery: { clouds }` |
| `doors.js` | Automatic sliding doors + whoosh | `registerDoors(left, right, opts)`; panes carry `userData.closedX` |
| `pan.js` | View controls for view-only experiences (bounded yaw + tilt + FOV zoom of the fixed camera), plus direct pointer input on the scene: drag to pan and tilt with a finger OR a mouse, pinch or scroll to zoom (full WASD on keyboards: A/D pan, W/S tilt, Shift+Up/Down tilt too). `tiltButtons: true` puts the look-up/look-down pair on screen, and `zoomContainerClass` moves the zoom pair into its own `.ui-float` group stacked with zoom-in on top. An optional `zoomDelegate` reroutes every zoom input (buttons, keys, pinch and wheel, all as log2 of the spread) to the experience as signed deltas instead of FOV, with `limits()` polled to dim the buttons (mandelbrot's infinite dive, the garden's dolly) | `initPortraitControls({ getCamera, lookAt, baseFov, pan: { speed, maxAngle, maxTilt }, zoom: { speed, maxIn, maxOut, wheel }, zoomDelegate: { onDelta, limits }, tiltButtons, zoomContainerClass, surface, extraClass, onFirstUse, signal })`, then `updatePortraitControls(dt)` each frame; tap handlers on the same surface check `gestureClaimedTap()` |

Pairing note: if an experience places a telescope prop, enable the comet and
aim with `getCometBase()`. Neither is on by default. The telescope builder
itself is not part of this library, so an experience that wants one brings
its own.

## Recipe: a new experience (Phase 5+)

1. `cp -r` the interstate `index.html` shell (keep the CSP, `../lib/three.min.js`,
   hud/modal markup) and rebrand the copy.
2. `js/package.json` with `{"type": "module"}`.
3. `js/config.js`: one frozen object. The minimized-world defaults already
   cover bounds/comet/pedestrians, so a minimal config is ~15 lines: building
   dims, spawn, checklist items, storage keys.
4. Experience content module(s): interior/exterior geometry built from
   structures/furniture/street/people parts plus your custom builders,
   orchestrated in an `initStore()`-style function that starts with
   `initWorld(CONFIG)`.
5. `js/main.js`: start from a trimmed interstate main.js — boot gate, init
   sequence, content tables (dialogue, greeter copy), interaction routing.
6. `npm run build && npm test` (new files are minified automatically), then
   walk the world.

Everything heavy — renderer, day/night, input, humans, AI, zombies,
lighting, doors, checklist, telemetry — is imported, not copied.
