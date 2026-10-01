// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * THE REAL THREE.JS, FOR SUITES THAT MEASURE WHAT IS ACTUALLY BUILT.
 *
 * The test stub's meshes have no vertices, so any Box3, raycast, or shader
 * check taken against it means nothing. Suites that measure shapes load the
 * same bundle the pages load: www/lib/three/<release>/three.min.js, which
 * `npm run build` makes from the vendored three.module.js and three.core.js.
 *
 * That bundle is an ES module that sets globalThis.THREE when it runs. It is
 * evaluated here in its own node:vm context rather than through Jest's
 * module loader, for two reasons: the namespace stays out of Jest's module
 * registry (suites swap it in and out of globalThis by hand), and three's
 * math runs at plain Node speed instead of inside Jest's sandbox, which is
 * some sixty times slower for hot math.
 *
 * Usage, in a beforeAll:
 *     THREE = await loadRealThree();
 *     globalThis.THREE = THREE;
 *
 * The result is a plain, writable copy of the namespace, so a suite can
 * still swap one class (for example PMREMGenerator) for a stand-in.
 *
 * To move the site to a new three.js release, change THREE_RELEASE here and
 * the script tags on every page (tests/three-release.test.mjs checks both).
 */
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The vendored three.js release every page loads. */
export const THREE_RELEASE = 'r186';

/** Absolute path of the bundle the pages load. */
export const THREE_BUNDLE = fileURLToPath(
  new URL(`../../www/lib/three/${THREE_RELEASE}/three.min.js`, import.meta.url));

/** Absolute path of the WebGPU bundle (WebGPURenderer and THREE.TSL), which
 *  only pages drawn with the WebGPU renderer load. */
export const THREE_WEBGPU_BUNDLE = fileURLToPath(
  new URL(`../../www/lib/three/${THREE_RELEASE}/three.webgpu.min.js`, import.meta.url));

const sources = new Map();

async function evaluate(file, globals) {
  if (!sources.has(file)) sources.set(file, readFileSync(file, 'utf8'));
  const sandbox = vm.createContext({ self: {}, window: {}, console: { warn() {} }, ...globals });
  const mod = new vm.SourceTextModule(sources.get(file), { context: sandbox, identifier: file });
  await mod.link(() => {
    throw new Error(`${file} is a single bundle and should import nothing`);
  });
  await mod.evaluate();
  return { ...sandbox.THREE };
}

/**
 * Evaluate the real three.js bundle in a fresh vm context and return a
 * writable copy of its namespace.
 * @param {object} [globals] - extra globals for the context (console is
 *   quiet by default, since nothing here wants three's warnings)
 */
export async function loadRealThree(globals = {}) {
  return evaluate(THREE_BUNDLE, globals);
}

/**
 * The same, for the WebGPU bundle. Nothing here has a GPU, so this is for
 * building node graphs and checking that every TSL function a scene calls
 * exists in this release, not for drawing.
 */
export async function loadRealThreeWebGPU(globals = {}) {
  return evaluate(THREE_WEBGPU_BUNDLE, globals);
}
