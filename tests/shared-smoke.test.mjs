// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Smoke and hygiene checks for the www/shared 3D engine parts library.
 *
 * These tests glob the shared source directory, so they grow automatically as
 * parts are extracted there. Three guarantees, each converting a Phase 4 risk
 * into a red test instead of a runtime surprise:
 *
 *  1. Every shared source module imports cleanly under Node with the THREE
 *     stub installed (catches broken ./x.min.js specifiers and import-time
 *     crashes before the browser does).
 *  2. Every shared source has a built .min.js sibling (the runtime loads only
 *     min files and nginx 404s missing ones; also a "you forgot the build
 *     target" tripwire).
 *  3. No shared source imports upward out of www/shared/js (the library must
 *     never reach into an experience folder; layering stays acyclic).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installThree, installCanvas, installBrowserGlobals, uninstallAll } from './helpers/three-stub.mjs';

const SHARED_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'www', 'shared', 'js');

const sources = fs.readdirSync(SHARED_DIR)
  .filter((f) => f.endsWith('.js') && !f.endsWith('.min.js'))
  .sort();

test('the shared library has at least one part', () => {
  expect(sources.length).toBeGreaterThan(0);
});

describe.each(sources)('%s', (file) => {
  const sourcePath = path.join(SHARED_DIR, file);

  test('imports cleanly under Node', async () => {
    installThree();
    installCanvas();
    installBrowserGlobals();
    try {
      const mod = await import(`../www/shared/js/${file}`);
      expect(mod).toBeDefined();
    } finally {
      uninstallAll();
    }
  });

  test('has a built .min.js sibling (run `npm run build` if this fails)', () => {
    const minPath = sourcePath.replace(/\.js$/, '.min.js');
    expect(fs.existsSync(minPath)).toBe(true);
    expect(fs.statSync(minPath).size).toBeGreaterThan(0);
  });

  test('never imports upward out of www/shared/js', () => {
    const text = fs.readFileSync(sourcePath, 'utf8');
    // Match static imports, re-exports, and dynamic import() specifiers.
    const specifiers = [
      ...text.matchAll(/(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]/g),
      ...text.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
    ].map((m) => m[1]);
    const upward = specifiers.filter((s) => s.startsWith('../'));
    expect(upward).toEqual([]);
  });
});

test('every scene with cards resets their scroll when they open', async () => {
  /* REPORTED FROM QA, and it was twelve of the fourteen scenes: a card closed
   * halfway down came back halfway down. The fix is one shared call per
   * scene, which is exactly the kind of line a new experience copied from an
   * old one forgets, and the symptom only shows on a card long enough to
   * scroll, on a viewport short enough to make it. So the pairing is asserted
   * here rather than trusted: a page that declares a dialog has to install
   * the reset. */
  const { readFile, readdir } = await import('node:fs/promises');
  const root = new URL('../www/', import.meta.url);
  const scenes = (await readdir(root, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((n) => !['assets', 'css', 'js', 'lib', 'shared', 'snaps'].includes(n));

  for (const scene of scenes) {
    let html;
    let main;
    try {
      html = await readFile(new URL(`${scene}/index.html`, root), 'utf8');
      main = await readFile(new URL(`${scene}/js/main.js`, root), 'utf8');
    } catch (e) {
      continue;   // not an experience folder
    }
    const cards = (html.match(/role="dialog" aria-modal="true"/g) || []).length;
    const installs = main.includes('installCardScrollReset({ signal })');
    // Named both ways round so a failure says which scene and which half.
    expect(`${scene}: ${cards} card(s), reset installed: ${installs}`)
      .toBe(`${scene}: ${cards} card(s), reset installed: ${cards > 0}`);
  }
});
