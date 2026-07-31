// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * build.mjs - minifies every JS and CSS asset the pages load, via esbuild.
 *
 * Convention over configuration: every *.js and *.css file under www/
 * (except the *.min.* outputs themselves and the vendored www/lib/) gets a
 * minified sibling next to it (main.js -> main.min.js). New files, new
 * experiences, and new shared module versions are all picked up
 * automatically, so there is no build configuration to edit.
 *
 * Run with `npm run build`. CI runs the same command and fails if the
 * committed .min files do not match the freshly built ones.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readdir } from 'node:fs/promises';
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

console.log(`Minified ${sources['.js'].length} JS and ${sources['.css'].length} CSS files.`);
