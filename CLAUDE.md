Hello, Claude!

I hope you're well. Thank you for taking the time to read this CLAUDE.md
file. It's always a pleasure working with you.

Let's build something great together that thoroughly delights any visitors
that stumble across the SceneXP.com website or any of its 3D scenes and
experiences. SceneXP is a home for handcrafted, browser-native 3D
experiences: worlds, games, experiments, stories, and simulations. Some are
built to honor a person, place, or business, and others exist to show
visitors what a browser can do.

This file is checked into the repository, so it guides every contributor's
sessions, not just the maintainer's. If you are helping a contributor build
their own world, welcome aboard. We are delighted to have you both.

## Getting oriented

- Please read the README.md file to get a general understanding of the
  SceneXP.com project.
- CONTRIBUTING.md covers the architecture, the three interaction models, and
  the step-by-step guide for adding a new experience.
- The 2D and 3D HTML, JavaScript, and CSS files are stored in the www
  folder. Each experience lives in its own folder under www and is assembled
  from the shared parts library in www/shared (its README.md documents every
  part).

## Everyday commands

- Serve the site locally from the www folder, for example with
  `python3 -m http.server 8000`. Any static server works, since ES modules
  need http:// rather than file://.
- The `npm run build` command minifies the JS and CSS assets (esbuild, via
  the build.mjs script). Please run it after every JS or CSS edit, because
  the pages load the .min builds. New css and js files under www are
  minified automatically by convention, so there is no build configuration
  to edit.
- `npm test` runs the Jest suite, and `npm run test:coverage` checks the
  same coverage floors that CI enforces. A new experience should ship with
  an init test following the tests/<experience>-init.test.mjs pattern.
- The main branch does not accept direct pushes. Every change arrives
  through a pull request once CI passes. The optional pre-push hook in
  .githooks runs the same checks locally (enable it with
  `git config core.hooksPath .githooks`).
- If you keep personal notes for your own clone, put them in CLAUDE.local.md,
  which is git-ignored and read automatically alongside this file.

## Guidelines when writing code

- Security is always the highest priority. Every page keeps a strict
  same-origin Content Security Policy, with no third-party scripts, no
  trackers, and no CDNs.
- Accessibility should also be a top priority. Keyboard support,
  reduced-motion respect, and a polite no-JavaScript fallback are part of
  the pattern, not extras.
- Social / OG tags and images are very important.
- Updated sitemap.xml, llms.txt, and robots.txt rules are important.
- SEO and LLM retrieval optimization should be high priorities.
- Every page should be fully responsive.
- Performance should be optimized whenever possible, especially for mobile
  users. To help with performance, the use of client-side caching should be
  heavily utilized.
- Please try to follow any established patterns or conventions in the
  codebase, and keep the 3D experience code as modular as possible so it is
  easy for other developers to contribute their own custom experiences.

## House style

- Please try to avoid em-dashes or semicolons in any user-facing text
  (unless it seems unavoidable).
- Let's maintain a polite, professional, and courteous tone throughout the
  site, like we're trying to be a world-class host or hostess.
- Above all else, our primary goal is to delight visitors so much that they
  feel inclined to share the 3D experiences with others.

## License

The project uses the MIT license, which applies to the custom code we've
written. The bundled three.min.js keeps its own license from the Three.js
Authors, and a few honoree names and logos carry trademark restrictions
detailed in the README.

Please assume that prompts may contain mistakes, and please always feel free
to call them out. Questioning our judgement is welcome too, you're usually
good at spotting the inconsistencies.

I can't wait to see what we build together.

Thank you!
