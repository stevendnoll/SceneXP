// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * build.mjs - minifies every JS and CSS asset the pages load, via esbuild.
 *
 * Convention over configuration: every *.js and *.css file under www/
 * (except the *.min.* outputs themselves and the vendored www/lib/) gets a
 * minified sibling next to it (main.js -> main.min.js). New files, new
 * experiences, and new shared module versions are all picked up
 * automatically, so there is no build configuration to edit. The one
 * vendored exception is Three.js: each www/lib/three/rNNN/ release folder is
 * bundled into its own three.min.js (see below).
 *
 * The build also writes one block of HTML: the list of modulepreload links in
 * each scene page's <head>, generated from that page's import graph (see the
 * end of this file). It is the only part of a page the build touches.
 *
 * Run with `npm run build`. CI runs the same command and fails if the
 * committed .min files or preload lists do not match the freshly built ones.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

const root = path.dirname(fileURLToPath(import.meta.url));
const wwwDir = path.join(root, 'www');
const vendored = path.join(wwwDir, 'lib') + path.sep;

const sources = { '.js': [], '.css': [] };
for (const rel of await readdir(wwwDir, { recursive: true })) {
  const full = path.join(wwwDir, rel);
  if (full.startsWith(vendored)) continue;
  if (/\.min\.(js|css)$/.test(rel)) continue;
  const ext = path.extname(rel);
  if (ext in sources) sources[ext].push(full);
}

// Shared esbuild settings. No bundling and no format flag, so each file
// keeps its own module kind (the shared modules stay ES modules, the
// fractal worker stays a classic script), and named exports survive.
const common = {
  outdir: wwwDir,
  outbase: wwwDir,
  minify: true,
  charset: 'utf8',
  logLevel: 'warning',
};

await build({ ...common, entryPoints: sources['.js'], outExtension: { '.js': '.min.js' } });
await build({ ...common, entryPoints: sources['.css'], outExtension: { '.css': '.min.css' } });

// Three.js ships only unminified ES modules, so each vendored release folder
// (www/lib/three/r186/ holds three.module.js and three.core.js, byte-for-byte
// from npm) is bundled into a single minified three.min.js. That module also
// sets the global THREE, which every experience and shared part reads, so a
// page loads it as <script type="module"> ahead of its own main.min.js.
//
// A folder that also holds npm's three.webgpu.js gets a second bundle,
// three.webgpu.min.js, built the same way for pages drawn with the WebGPU
// renderer and TSL (it carries the TSL functions as THREE.TSL). A page loads
// one bundle or the other, never both.
const threeDir = path.join(wwwDir, 'lib', 'three');
const releases = (await readdir(threeDir, { withFileTypes: true }))
  .filter((d) => d.isDirectory() && /^r\d+$/.test(d.name))
  .map((d) => path.join(threeDir, d.name));
const BUNDLES = [
  { entry: 'three.module.js', outfile: 'three.min.js' },
  { entry: 'three.webgpu.js', outfile: 'three.webgpu.min.js', optional: true },
];
let bundled = 0;
for (const dir of releases) {
  const present = new Set(await readdir(dir));
  for (const { entry, outfile, optional } of BUNDLES) {
    if (optional && !present.has(entry)) continue;
    // Three's own license header leads the bundle (it would otherwise land
    // mid-file), and the duplicate copies inside the sources are dropped.
    const source = await readFile(path.join(dir, entry), 'utf8');
    const header = source.match(/^\/\*\*[\s\S]*?\*\//)[0];
    await build({
      stdin: {
        contents: `import * as THREE from './${entry}';\n` +
          'globalThis.THREE = THREE;\n' +
          `export * from './${entry}';\n`,
        resolveDir: dir,
        sourcefile: 'three-global.js',
      },
      bundle: true,
      format: 'esm',
      minify: true,
      charset: 'utf8',
      legalComments: 'none',
      banner: { js: header },
      logLevel: 'warning',
      outfile: path.join(dir, outfile),
    });
    bundled++;
  }
}

// Every scene page preloads its whole module graph. A browser only finds a
// module's imports once that module has arrived, so a page whose main.min.js
// imports a store that imports the shared scene part waits a round trip per
// level, and these graphs run three to six levels deep (Corner Office's has 52
// modules). One <link rel="modulepreload"> per module lets the browser fetch
// them all at once. The list sits between two marker comments in each page's
// <head>, right after the three.js preload, and is rewritten here from the
// built files, so it cannot go stale: CI rebuilds and fails on any diff.
// Static imports only. A dynamic import() is deferred on purpose.
const PRELOAD_BEGIN = '<!-- BEGIN generated modulepreload (npm run build): every module this page imports, fetched at once -->';
const PRELOAD_END = '<!-- END generated modulepreload -->';
const importCache = new Map();

/** The static imports of one built module, as absolute paths. */
async function staticImports(file) {
  if (importCache.has(file)) return importCache.get(file);
  // An analysis-only build: bundling on so esbuild records every import, and
  // every import marked external so it records them without following any.
  const result = await build({
    entryPoints: [file],
    bundle: true,
    write: false,
    metafile: true,
    format: 'esm',
    logLevel: 'silent',
    plugins: [{
      name: 'record-imports',
      setup(b) {
        b.onResolve({ filter: /.*/ }, (args) => (args.kind === 'entry-point' ? null : { path: args.path, external: true }));
      },
    }],
  });
  const input = Object.values(result.metafile.inputs)[0];
  const found = (input ? input.imports : [])
    .filter((i) => i.kind === 'import-statement' && /^\.\.?\//.test(i.path))
    .map((i) => path.resolve(path.dirname(file), i.path));
  importCache.set(file, found);
  return found;
}

/** A page's modules, breadth first from its entry, each listed once. */
async function moduleGraph(entry) {
  const order = [entry];
  const seen = new Set(order);
  for (let i = 0; i < order.length; i++) {
    for (const dep of await staticImports(order[i])) {
      if (!seen.has(dep)) {
        seen.add(dep);
        order.push(dep);
      }
    }
  }
  return order;
}

let preloaded = 0;
for (const entry of await readdir(wwwDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const pageDir = path.join(wwwDir, entry.name);
  const page = path.join(pageDir, 'index.html');
  const main = path.join(pageDir, 'js', 'main.min.js');
  let html;
  try {
    html = await readFile(page, 'utf8');
  } catch {
    continue;
  }
  if (!html.includes('src="js/main.min.js"')) continue;

  const graph = await moduleGraph(main);
  const links = graph.map((file) =>
    `    <link rel="modulepreload" href="${path.relative(pageDir, file).split(path.sep).join('/')}">`);
  const block = [`    ${PRELOAD_BEGIN}`, ...links, `    ${PRELOAD_END}`].join('\n');

  let next;
  const begin = html.indexOf(PRELOAD_BEGIN);
  if (begin !== -1) {
    const lineStart = html.lastIndexOf('\n', begin) + 1;
    const end = html.indexOf(PRELOAD_END, begin);
    if (end === -1) throw new Error(`${page}: generated modulepreload block has no end marker`);
    next = html.slice(0, lineStart) + block + html.slice(end + PRELOAD_END.length);
  } else {
    const three = html.match(/^ *<link rel="modulepreload" href="\.\.\/lib\/three\/[^"]+">$/m);
    if (!three) throw new Error(`${page}: no three.js modulepreload to place the module list after`);
    const at = three.index + three[0].length;
    next = `${html.slice(0, at)}\n${block}${html.slice(at)}`;
  }
  if (next !== html) await writeFile(page, next);
  preloaded++;
}

console.log(`Minified ${sources['.js'].length} JS and ${sources['.css'].length} CSS files, ` +
  `bundled ${bundled} Three.js build${bundled === 1 ? '' : 's'}, ` +
  `and listed the modules of ${preloaded} scene page${preloaded === 1 ? '' : 's'} for preload.`);
