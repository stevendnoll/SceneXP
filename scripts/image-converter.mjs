// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * image-converter.mjs - turns macOS screen captures into web-ready JPG and WebP.
 *
 * Written for the Social/OG/card workflow: capture a 1200x630 PNG, drop it in a
 * folder, run this, and og-world.jpg and og-world.webp appear beside it. Nothing
 * here is part of the site build, so it never ships to www/.
 *
 *   node scripts/image-converter.mjs specs/og
 *
 * A Mac capture's pixels are encoded for the display it was taken on, and the
 * PNG carries that display's ICC profile. Stripping the profile without first
 * converting out of it leaves the numbers behind and every color quietly moves,
 * so -profile always comes before -strip. CONTRIBUTING.md has the measurements.
 *
 * Unlike file-renamer.mjs this works without --apply, because nothing it does
 * can lose work: the PNGs are only read, and a JPG or WebP that already exists
 * is left alone unless --force is passed. As with file-renamer.mjs there is
 * deliberately no npm script, because npm mangles flags it does not recognize.
 */
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, readdir, rename, rm, stat } from 'node:fs/promises';

const run = promisify(execFile);

const SRGB_PROFILE = '/System/Library/ColorSync/Profiles/sRGB Profile.icc';
const CARD_SIZE = '1200x630';
const DEFAULT_QUALITY = 92;

const USAGE = `
Converts the macOS screen captures in a folder to web-optimized JPG and WebP.

  node scripts/image-converter.mjs <folder> [options]

Each PNG gets a JPG and a WebP beside it with the same base name, converted out
of the display's color profile into sRGB. The PNGs are never changed, and files
that already exist are skipped unless you pass --force.

Arguments
  folder            Path to the folder holding the PNGs, relative or absolute.

Options
      --quality <n> Quality for both formats, from 1 to 100. Defaults to ${DEFAULT_QUALITY}.
      --force       Replace a JPG or WebP that already exists.
  -n, --dry-run     Print the plan and stop, writing nothing.
  -h, --help        Show this message.

Example
  node scripts/image-converter.mjs specs/og
  node scripts/image-converter.mjs specs/og --quality 86 --force
`.trimStart();

function parseArgs(argv) {
  const opts = { positional: [], quality: DEFAULT_QUALITY, force: false, dryRun: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') opts.help = true;
    else if (arg === '-n' || arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--force') opts.force = true;
    else if (arg === '--quality') opts.quality = Number(argv[++i]);
    // file-renamer.mjs needs this flag, so habit should not earn an error here.
    else if (arg === '--apply') continue;
    else if (arg.startsWith('-')) throw new Error(`Unknown option "${arg}". Run with --help for the list.`);
    else opts.positional.push(arg);
  }
  return opts;
}

function validate(opts) {
  const [folder] = opts.positional;
  if (!folder) {
    throw new Error('Please pass a folder, for example:\n  node scripts/image-converter.mjs specs/og');
  }
  if (opts.positional.length > 1) {
    throw new Error(`Expected 1 folder but got ${opts.positional.length}. A path with spaces needs quoting.`);
  }
  if (!Number.isInteger(opts.quality) || opts.quality < 1 || opts.quality > 100) {
    throw new Error('--quality takes a whole number from 1 to 100.');
  }
  return folder;
}

/**
 * ImageMagick without lcms accepts -profile and then does not convert, which
 * would produce exactly the shifted colors this script exists to prevent and
 * would do so without a word. So the tools are checked before any pixel moves.
 */
async function checkTools() {
  let version;
  try {
    ({ stdout: version } = await run('magick', ['-version']));
  } catch {
    throw new Error('ImageMagick was not found. It can be installed with:\n  brew install imagemagick');
  }
  const missing = ['lcms', 'jpeg', 'webp'].filter((name) => !new RegExp(`\\b${name}\\b`).test(version));
  if (missing.length) {
    throw new Error(`This ImageMagick was built without ${missing.join(', ')}, which the conversion needs.`);
  }
  try {
    await access(SRGB_PROFILE);
  } catch {
    throw new Error(`The sRGB profile was not found at "${SRGB_PROFILE}". This script expects a Mac.`);
  }
}

async function readCaptures(folder) {
  let entries;
  try {
    entries = await readdir(folder, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') throw new Error(`No folder found at "${folder}".`);
    if (err.code === 'ENOTDIR') throw new Error(`"${folder}" is a file, not a folder.`);
    throw err;
  }
  return entries
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.') && path.extname(entry.name).toLowerCase() === '.png')
    .map((entry) => entry.name)
    .sort(new Intl.Collator('en', { numeric: true, sensitivity: 'base' }).compare);
}

// Decimal units, so these numbers agree with what Finder shows.
function formatBytes(bytes) {
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(2)} MB`;
  return `${Math.round(bytes / 1e3)} KB`;
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * Every call to magick runs inside the folder and names files relatively, with
 * a leading ./ so a name beginning with a dash is not read as an option.
 * ImageMagick treats % and [ in a path as formatting and frame selection, and
 * this keeps those characters in a parent folder's name out of its sight.
 */
async function describeCapture(folder, name) {
  const { stdout } = await run('magick', ['identify', '-format', '%wx%h|%[icc:description]\n', `./${name}`], { cwd: folder });
  const [size, profile] = stdout.split('\n')[0].split('|');
  return { size, profile: profile.trim() };
}

/**
 * Each file is written under a temporary dot-name and moved into place only
 * once it is complete, so a failure can never leave half a card behind or
 * damage the one --force was about to replace.
 */
async function encode(folder, name, target, formatArgs) {
  const temp = `.image-converter-${process.pid}${path.extname(target)}`;
  try {
    await run('magick', [
      `./${name}`,
      // The order is the whole point: convert out of the profile, then drop it.
      '-profile', SRGB_PROFILE,
      // Captures can carry an alpha channel that is fully opaque.
      '-alpha', 'remove', '-alpha', 'off',
      '-strip',
      ...formatArgs,
      `./${temp}`,
    ], { cwd: folder });
    await rename(path.join(folder, temp), path.join(folder, target));
  } finally {
    await rm(path.join(folder, temp), { force: true });
  }
  return (await stat(path.join(folder, target))).size;
}

// 4:4:4 keeps saturated color crisp against near-black, where our accents live.
const jpegArgs = (quality) => ['-quality', String(quality), '-sampling-factor', '4:4:4', '-interlace', 'Plane'];
// Lossy WebP is always 4:2:0, and sharp YUV recovers small saturated details.
const webpArgs = (quality) => ['-quality', String(quality), '-define', 'webp:use-sharp-yuv=1'];

async function convertCapture(folder, name, opts) {
  const base = path.basename(name, path.extname(name));
  const { size, profile } = await describeCapture(folder, name);
  const color = profile ? `${profile} to sRGB` : 'no profile, so read as sRGB';
  const offSize = size === CARD_SIZE ? '' : `, not the usual ${CARD_SIZE}`;
  console.log(`  ${name}  (${size}${offSize}, ${color})`);

  const counts = { written: 0, skipped: 0 };
  const outputs = [[`${base}.jpg`, jpegArgs], [`${base}.webp`, webpArgs]];
  for (const [target, formatArgs] of outputs) {
    const taken = await exists(path.join(folder, target));
    if (taken && !opts.force) {
      console.log(`    ${target}  already there, skipped`);
      counts.skipped += 1;
    } else if (opts.dryRun) {
      console.log(`    ${target}  would be ${taken ? 'replaced' : 'written'}`);
      counts.written += 1;
    } else {
      const bytes = await encode(folder, name, target, formatArgs(opts.quality));
      console.log(`    ${target}  ${formatBytes(bytes)}`);
      counts.written += 1;
    }
  }
  return counts;
}

function firstLine(err) {
  return String(err.stderr || err.message).trim().split('\n')[0];
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(USAGE);
    return;
  }
  const folder = path.resolve(validate(opts));
  const names = await readCaptures(folder);
  if (!names.length) {
    console.log(`No PNG files found in "${folder}", so there is nothing to convert.`);
    return;
  }
  await checkTools();

  const totals = { written: 0, skipped: 0, failed: 0 };
  for (const name of names) {
    // One unreadable capture should not cost the rest of the batch.
    try {
      const counts = await convertCapture(folder, name, opts);
      totals.written += counts.written;
      totals.skipped += counts.skipped;
    } catch (err) {
      console.error(`  ${name}  could not be converted: ${firstLine(err)}`);
      totals.failed += 1;
    }
  }

  const verb = opts.dryRun ? 'Preview only, nothing written. Would write' : 'Wrote';
  const parts = [`\n${verb} ${totals.written} file${totals.written === 1 ? '' : 's'} at quality ${opts.quality}`];
  if (totals.skipped) parts.push(`, and skipped ${totals.skipped} already there (add --force to replace them)`);
  console.log(`${parts.join('')}.`);
  if (totals.failed) {
    console.error(`${totals.failed} capture${totals.failed === 1 ? '' : 's'} could not be converted.`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`\n${err.message}\n`);
  process.exitCode = 1;
});
