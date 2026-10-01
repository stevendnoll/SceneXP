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
 * bundled into its own three.min.js (see the end of this file).
 *
 * Run with `npm run build`. CI runs the same command and fails if the
 * committed .min files do not match the freshly built ones.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
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
const threeDir = path.join(wwwDir, 'lib', 'three');
const releases = (await readdir(threeDir, { withFileTypes: true }))
  .filter((d) => d.isDirectory() && /^r\d+$/.test(d.name))
  .map((d) => path.join(threeDir, d.name));
for (const dir of releases) {
  // Three's own license header leads the bundle (it would otherwise land
  // mid-file), and the duplicate copies inside the sources are dropped.
  const source = await readFile(path.join(dir, 'three.module.js'), 'utf8');
  const header = source.match(/^\/\*\*[\s\S]*?\*\//)[0];
  await build({
    stdin: {
      contents: "import * as THREE from './three.module.js';\n" +
        "globalThis.THREE = THREE;\n" +
        "export * from './three.module.js';\n",
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
    outfile: path.join(dir, 'three.min.js'),
  });
}

console.log(`Minified ${sources['.js'].length} JS and ${sources['.css'].length} CSS files, ` +
  `and bundled ${releases.length} Three.js release${releases.length === 1 ? '' : 's'}.`);
