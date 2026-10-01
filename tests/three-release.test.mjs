// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Every page runs the one vendored three.js release, and the release is what
 * it says it is.
 *
 * WHY THIS FILE EXISTS. On 2026-10-01 the site moved from r160 (the classic
 * www/lib/three.min.js, a UMD build three stopped shipping after r160) to
 * r186 in www/lib/three/r186/. npm now publishes three only as unminified ES
 * modules, so `npm run build` bundles three.module.js and three.core.js into
 * one minified three.min.js that also sets the global THREE. Pages load it as
 * a module ahead of their own main.min.js, and module scripts run in document
 * order, so THREE exists before any scene code reads it.
 *
 * Nothing else would notice a page left on the old build, or a page that
 * loads the library after its scene: the DOM stub never fetches a script, and
 * the suites that measure real three load the bundle themselves
 * (tests/helpers/real-three.mjs). So this reads the pages off disk.
 *
 * It also holds the two r186 changes that would otherwise be silent: three is
 * WebGL 2 only from r163 on (a scene that only checks for 'webgl' sends a
 * WebGL 1 browser into a broken page instead of the polite 2D fallback), and
 * PCFSoftShadowMap is gone (r186 swaps it for PCFShadowMap with a console
 * warning on every load).
 */
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { THREE_RELEASE, loadRealThree, loadRealThreeWebGPU } from './helpers/real-three.mjs';

const WWW = new URL('../www/', import.meta.url);
const BUNDLE = `../lib/three/${THREE_RELEASE}/three.min.js`;
const WEBGPU_BUNDLE = `../lib/three/${THREE_RELEASE}/three.webgpu.min.js`;

/** Scenes drawn with the WebGPU renderer and TSL, which load the WebGPU
 *  bundle instead. Named here so neither kind of page can be switched to the
 *  other bundle by accident: a WebGL page on the WebGPU bundle would find
 *  every GLSL ShaderMaterial unsupported, and the reverse has no TSL. */
const WEBGPU_SCENES = ['starfall'];

/** Every experience folder: anything under www with its own index.html and js/. */
async function scenes() {
  const out = [];
  for (const entry of await readdir(WWW, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'shared') continue;
    const dir = new URL(`${entry.name}/`, WWW);
    if (existsSync(new URL('index.html', dir)) && existsSync(new URL('js/', dir))) {
      out.push(entry.name);
    }
  }
  return out.sort();
}

/** Every .js source under a folder (minified builds and vendored code left out). */
async function sources(dir) {
  const out = [];
  for (const rel of await readdir(dir, { recursive: true })) {
    if (rel.endsWith('.js') && !rel.endsWith('.min.js')) {
      out.push({ rel, text: await readFile(new URL(rel, dir), 'utf8') });
    }
  }
  return out;
}

const SCENES = await scenes();
const PAGES = await Promise.all(SCENES.map(async (scene) => ({
  scene,
  html: await readFile(new URL(`${scene}/index.html`, WWW), 'utf8'),
})));
const CODE = (await sources(WWW)).filter(({ rel }) => !rel.startsWith('lib/'));

test('the scene pages were found', () => {
  expect(SCENES.length).toBeGreaterThanOrEqual(17);
});

describe.each(PAGES.map((p) => [p.scene, p]))('%s', (scene, { html }) => {
  const bundle = WEBGPU_SCENES.includes(scene) ? WEBGPU_BUNDLE : BUNDLE;

  test('loads its bundle as a module, before its own scene', () => {
    const library = html.indexOf(`<script type="module" src="${bundle}"></script>`);
    const main = html.indexOf('<script type="module" src="js/main.min.js"></script>');
    expect(library).toBeGreaterThan(-1);
    expect(main).toBeGreaterThan(library);
  });

  test('preloads the same bundle as a module', () => {
    expect(html).toContain(`<link rel="modulepreload" href="${bundle}">`);
  });

  test('loads no other three.js build', () => {
    const builds = [...html.matchAll(/(?:src|href)="([^"]*three[^"]*\.js)"/g)].map((m) => m[1]);
    expect([...new Set(builds)]).toEqual([bundle]);
  });
});

test('every scene named as a WebGPU scene exists', () => {
  for (const scene of WEBGPU_SCENES) expect(SCENES).toContain(scene);
});

test('the retired r160 build is gone', () => {
  expect(existsSync(new URL('lib/three.min.js', WWW))).toBe(false);
});

test(`the ${THREE_RELEASE} folder holds the npm sources, their license, and the two bundles`, async () => {
  const files = (await readdir(new URL(`lib/three/${THREE_RELEASE}/`, WWW))).sort();
  expect(files).toEqual([
    'LICENSE', 'three.core.js', 'three.min.js', 'three.module.js',
    'three.webgpu.js', 'three.webgpu.min.js',
  ]);
});

test(`the bundle is ${THREE_RELEASE} and sets the global THREE`, async () => {
  const THREE = await loadRealThree();
  expect(`r${THREE.REVISION}`).toBe(THREE_RELEASE);
  expect(typeof THREE.WebGLRenderer).toBe('function');
  expect(typeof THREE.ShaderChunk.common).toBe('string');
});

test(`the WebGPU bundle is ${THREE_RELEASE}, with the renderer and TSL`, async () => {
  const THREE = await loadRealThreeWebGPU();
  expect(`r${THREE.REVISION}`).toBe(THREE_RELEASE);
  expect(typeof THREE.WebGPURenderer).toBe('function');
  expect(typeof THREE.TSL.Fn).toBe('function');
  expect(typeof THREE.TSL.instancedArray).toBe('function');
});

test('every WebGL check asks for WebGL 2, which three requires', () => {
  const checks = CODE.filter(({ text }) => /function hasWebGL\(/.test(text));
  expect(checks.length).toBeGreaterThanOrEqual(17);
  for (const { rel, text } of checks) {
    expect(`${rel}: ${/getContext\('webgl2'\)/.test(text)}`).toBe(`${rel}: true`);
    expect(`${rel}: ${/getContext\('(?:experimental-)?webgl'\)/.test(text)}`).toBe(`${rel}: false`);
  }
});

test('no renderer asks for the retired PCFSoftShadowMap', () => {
  const offenders = CODE.filter(({ text }) => text.includes('THREE.PCFSoftShadowMap')).map(({ rel }) => rel);
  expect(offenders).toEqual([]);
});
