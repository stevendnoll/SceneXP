// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * file-renamer.mjs - renames every image in a folder to "<prefix>-<n>".
 *
 * Written for the screenshot-driven QA workflow: drop a batch of captures
 * into specs/<experience>/screenshots, run this, and they become
 * garden-1.png, garden-2.png, ... garden-21.png in the order they were
 * taken. Nothing here is part of the site build, so it never ships to www/.
 *
 *   node scripts/file-renamer.mjs specs/garden/screenshots garden
 *
 * It previews by default and only moves files when passed --apply, so a
 * dropped or mistyped flag costs nothing. There is deliberately no npm
 * script wrapping this: npm keeps any flag that is not preceded by a bare
 * --, and worse, bends an unknown one onto the nearest name it knows, so
 * --apply arrived as npm's own "all" setting. Calling node avoids all of it.
 */
import path from 'node:path';
import { readdir, stat, rename, access } from 'node:fs/promises';

// Only these get renamed, so a stray notes.md or .DS_Store sitting in the
// folder is left alone. Pass --all to take every visible file instead.
const IMAGE_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.heic', '.avif', '.tif', '.tiff',
]);

const USAGE = `
Renames the images in a folder to a shared prefix plus a counter.

  node scripts/file-renamer.mjs <folder> <prefix> [options]

It prints the plan and stops. Add --apply to carry it out.

Arguments
  folder        Path to the folder holding the images, relative or absolute.
  prefix        Base name for the renamed files, for example "garden".

Options
      --apply     Actually rename the files. Without it, nothing moves.
      --sort <k>  Order the counter follows. "created" (the default) uses the
                  file modified time, which for a fresh screenshot is the
                  moment it was captured. "name" uses a natural sort of the
                  current names, where numbers compare as numbers.
      --start <n> First number to use. Defaults to 1.
      --pad       Zero-pad the counter to a fixed width, so a run of 21 files
                  produces garden-01 through garden-21.
      --all       Rename every visible file, not just the known image types.
  -h, --help      Show this message.

Example
  node scripts/file-renamer.mjs specs/garden/screenshots garden
  node scripts/file-renamer.mjs specs/garden/screenshots garden --apply
`.trimStart();

// Numbers compare as numbers, so "shot-2" lands before "shot-10".
const naturally = new Intl.Collator('en', { numeric: true, sensitivity: 'base' }).compare;

function parseArgs(argv) {
  const opts = { positional: [], apply: false, sort: 'created', start: 1, pad: false, all: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') opts.help = true;
    else if (arg === '--apply') opts.apply = true;
    // Previewing is the default now, so these are kept only so that muscle
    // memory and older notes do not earn an error.
    else if (arg === '-n' || arg === '--dry-run') opts.apply = false;
    else if (arg === '--pad') opts.pad = true;
    else if (arg === '--all') opts.all = true;
    else if (arg === '--sort') opts.sort = argv[++i];
    else if (arg === '--start') opts.start = Number(argv[++i]);
    else if (arg.startsWith('-')) throw new Error(`Unknown option "${arg}". Run with --help for the list.`);
    else opts.positional.push(arg);
  }
  return opts;
}

function validate(opts) {
  const [folder, prefix] = opts.positional;
  if (!folder || !prefix) {
    throw new Error('Please pass both a folder and a prefix, for example:\n  node scripts/file-renamer.mjs specs/garden/screenshots garden');
  }
  if (opts.positional.length > 2) {
    throw new Error(`Expected 2 arguments but got ${opts.positional.length}. A prefix with spaces needs quoting.`);
  }
  if (!['created', 'name'].includes(opts.sort)) {
    throw new Error(`--sort takes "created" or "name", not "${opts.sort}".`);
  }
  if (!Number.isInteger(opts.start) || opts.start < 0) {
    throw new Error('--start takes a whole number of 0 or more.');
  }
  // A prefix is a file name, never a path, so keep separators out of it.
  if (/[/\\\0]/.test(prefix)) {
    throw new Error(`The prefix "${prefix}" cannot contain a slash or a backslash.`);
  }
  return { folder, prefix };
}

async function readFolder(folder, all) {
  let entries;
  try {
    entries = await readdir(folder, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') throw new Error(`No folder found at "${folder}".`);
    if (err.code === 'ENOTDIR') throw new Error(`"${folder}" is a file, not a folder.`);
    throw err;
  }
  const files = [];
  for (const entry of entries) {
    // Skip subfolders, and skip dotfiles so .DS_Store stays put.
    if (!entry.isFile() || entry.name.startsWith('.')) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!all && !IMAGE_EXTS.has(ext)) continue;
    const full = path.join(folder, entry.name);
    files.push({ name: entry.name, full, ext, mtimeMs: (await stat(full)).mtimeMs });
  }
  return files;
}

function planRenames(files, { prefix, sort, start, pad }) {
  const ordered = [...files].sort((a, b) => (
    sort === 'name'
      ? naturally(a.name, b.name)
      // Equal timestamps fall back to the name, so the order is never a coin toss.
      : (a.mtimeMs - b.mtimeMs) || naturally(a.name, b.name)
  ));
  const width = pad ? String(start + ordered.length - 1).length : 0;
  return ordered.map((file, i) => {
    const counter = String(start + i).padStart(width, '0');
    const target = `${prefix}-${counter}${file.ext}`;
    return { ...file, target, targetFull: path.join(path.dirname(file.full), target) };
  });
}

/**
 * Every target name is claimed by the batch, so a file already sitting on one
 * of those names would be silently destroyed. Catch that before moving
 * anything, and treat the batch's own files as fair game since they move too.
 */
async function checkForClobbering(plan) {
  const sources = new Set(plan.map((p) => p.full));
  const collisions = [];
  for (const step of plan) {
    if (sources.has(step.targetFull)) continue;
    try {
      await access(step.targetFull);
      collisions.push(step.target);
    } catch {
      // Nothing there, which is the happy path.
    }
  }
  if (collisions.length) {
    throw new Error(
      `Refusing to run, because these names are already taken by files outside this batch:\n  ${collisions.join('\n  ')}\n`
      + 'Please move or delete them first, or pick a different prefix.',
    );
  }
}

/**
 * Renames happen in two passes, through temporary names, because the new
 * names come from the same pool as the old ones. A direct pass could
 * overwrite a file it had not reached yet, or trip over a swap such as
 * garden-2 becoming garden-1 while garden-1 becomes garden-2.
 */
async function applyRenames(plan) {
  const moving = plan.filter((step) => step.name !== step.target);
  const staged = [];
  try {
    for (const [i, step] of moving.entries()) {
      const temp = path.join(path.dirname(step.full), `.file-renamer-${process.pid}-${i}${step.ext}`);
      await rename(step.full, temp);
      staged.push({ temp, targetFull: step.targetFull });
    }
    while (staged.length) {
      const step = staged.shift();
      await rename(step.temp, step.targetFull);
    }
  } catch (err) {
    if (staged.length) {
      const stuck = staged.map((s) => path.basename(s.temp)).join('\n  ');
      throw new Error(`${err.message}\n\nSome files are parked under temporary names and need a hand:\n  ${stuck}`);
    }
    throw err;
  }
  return moving.length;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(USAGE);
    return;
  }
  const { folder, prefix } = validate(opts);
  const files = await readFolder(folder, opts.all);
  if (!files.length) {
    console.log(`No ${opts.all ? 'files' : 'images'} found in "${folder}", so there is nothing to rename.`);
    return;
  }

  const plan = planRenames(files, { ...opts, prefix });
  await checkForClobbering(plan);

  const width = Math.max(...plan.map((step) => step.name.length));
  for (const step of plan) {
    const mark = step.name === step.target ? '=' : '->';
    console.log(`  ${step.name.padEnd(width)} ${mark} ${step.target}`);
  }

  if (!opts.apply) {
    const pending = plan.filter((step) => step.name !== step.target).length;
    console.log(
      `\nPreview only, nothing moved. ${pending} of ${plan.length} file${plan.length === 1 ? '' : 's'} would be renamed to "${prefix}-*", sorted by ${opts.sort}.`
      + '\nAdd --apply to carry this out.',
    );
    return;
  }
  const moved = await applyRenames(plan);
  const skipped = plan.length - moved;
  console.log(`\nRenamed ${moved} file${moved === 1 ? '' : 's'} to "${prefix}-*"${skipped ? `, and left ${skipped} already correctly named` : ''}.`);
}

main().catch((err) => {
  console.error(`\n${err.message}\n`);
  process.exitCode = 1;
});
