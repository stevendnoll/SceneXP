// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * video-filesize-reducer.mjs - shrinks the MP4 files in a folder for sharing.
 *
 * Re-encodes each video at the same resolution and frame rate, removes personal
 * metadata along the way, and saves the result under the same name in a
 * shareable/ subfolder. Nothing here is part of the site build, so it never
 * ships to www/.
 *
 *   node scripts/video-filesize-reducer.mjs specs
 *
 * Screen recordings from an iPhone or a Mac carry a creation time and often an
 * author tag, so a shrunken copy bound for social media should not carry them
 * along. The encoder also writes its own settings into the stream, which is
 * why there is a second pass: it copies the video untouched and drops them.
 *
 * Unlike file-renamer.mjs this works without --apply, because nothing it does
 * can lose work: the originals are only read, and a finished copy is left alone
 * unless --force is passed. As with file-renamer.mjs there is deliberately no
 * npm script, because npm mangles flags it does not recognize.
 */
import path from 'node:path';
import { rmSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, mkdir, readdir, rename, rm, stat } from 'node:fs/promises';

const run = promisify(execFile);

const DEFAULT_CRF = 24;
const DEFAULT_OUT = 'shareable';
const BITEXACT = ['-fflags', '+bitexact', '-flags:v', '+bitexact', '-flags:a', '+bitexact'];

const USAGE = `
Reduces the file size of the MP4 videos in a folder, keeping their resolution.

  node scripts/video-filesize-reducer.mjs <folder> [options]

Each video is re-encoded and saved under the same name in a "${DEFAULT_OUT}" subfolder,
with personal metadata such as the creation time and author removed. The
originals are never changed, and finished copies are skipped unless you pass
--force. A result that comes out larger than its original is not kept.

Arguments
  folder            Path to the folder holding the videos, relative or absolute.

Options
      --crf <n>     Compression level from 0 to 51, where higher is smaller and
                    softer. Defaults to ${DEFAULT_CRF}. Screen recordings with full 3D
                    motion shrink by roughly 55% at 24, 65% at 27 and 73% at 30.
      --out <path>  Where to save the results, relative to where you run this.
                    Defaults to a "${DEFAULT_OUT}" folder inside the video folder.
      --no-audio    Leave out the audio. By default it is kept, at AAC 128 kbps.
      --force       Replace a finished copy that already exists.
  -n, --dry-run     Print the plan and stop, writing nothing.
  -h, --help        Show this message.

Example
  node scripts/video-filesize-reducer.mjs specs
  node scripts/video-filesize-reducer.mjs specs --crf 27 --force
`.trimStart();

function parseArgs(argv) {
  const opts = { positional: [], crf: DEFAULT_CRF, out: null, audio: true, force: false, dryRun: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') opts.help = true;
    else if (arg === '-n' || arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--force') opts.force = true;
    else if (arg === '--no-audio') opts.audio = false;
    else if (arg === '--crf') opts.crf = Number(argv[++i]);
    else if (arg === '--out') opts.out = argv[++i] ?? '';
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
    throw new Error('Please pass a folder, for example:\n  node scripts/video-filesize-reducer.mjs specs');
  }
  if (opts.positional.length > 1) {
    throw new Error(`Expected 1 folder but got ${opts.positional.length}. A path with spaces needs quoting.`);
  }
  if (!Number.isInteger(opts.crf) || opts.crf < 0 || opts.crf > 51) {
    throw new Error('--crf takes a whole number from 0 to 51.');
  }
  if (opts.out === '' || opts.out?.startsWith('-')) {
    throw new Error('--out takes a path to a folder.');
  }
  const source = path.resolve(folder);
  const out = opts.out ? path.resolve(opts.out) : path.join(source, DEFAULT_OUT);
  // The results keep their names, so this would replace the originals.
  if (out === source) {
    throw new Error('--out cannot be the video folder itself, because the results keep their names and would replace the originals.');
  }
  return { source, out };
}

async function checkTools() {
  try {
    await Promise.all([run('ffmpeg', ['-version']), run('ffprobe', ['-version'])]);
  } catch {
    throw new Error('ffmpeg and ffprobe were not both found. They can be installed with:\n  brew install ffmpeg');
  }
}

async function readVideos(folder) {
  let entries;
  try {
    entries = await readdir(folder, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') throw new Error(`No folder found at "${folder}".`);
    if (err.code === 'ENOTDIR') throw new Error(`"${folder}" is a file, not a folder.`);
    throw err;
  }
  return entries
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.') && path.extname(entry.name).toLowerCase() === '.mp4')
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

async function probe(file) {
  const { stdout } = await run('ffprobe', [
    '-v', 'error',
    '-show_entries', 'stream=codec_type,width,height,color_transfer',
    '-of', 'json',
    file,
  ]);
  const streams = JSON.parse(stdout).streams ?? [];
  const video = streams.find((s) => s.codec_type === 'video');
  if (!video) throw new Error('it has no video stream');
  return {
    width: video.width,
    height: video.height,
    hasAudio: streams.some((s) => s.codec_type === 'audio'),
    // HLG and PQ. Encoding these as ordinary 8-bit video washes them out.
    isHdr: ['arib-std-b67', 'smpte2084'].includes(video.color_transfer),
    isOdd: video.width % 2 === 1 || video.height % 2 === 1,
  };
}

// Tracked so that Ctrl-C partway through a long encode leaves nothing behind.
const liveTemps = new Set();
process.on('SIGINT', () => {
  for (const temp of liveTemps) rmSync(temp, { force: true });
  process.exit(130);
});

async function encode(source, target, info, opts) {
  const dir = path.dirname(target);
  const firstPass = path.join(dir, `.video-filesize-reducer-${process.pid}-1.mp4`);
  const secondPass = path.join(dir, `.video-filesize-reducer-${process.pid}-2.mp4`);
  liveTemps.add(firstPass);
  liveTemps.add(secondPass);
  const keepAudio = opts.audio && info.hasAudio;
  try {
    await run('ffmpeg', [
      '-nostdin', '-v', 'error', '-y',
      '-i', source,
      '-map', '0:v:0',
      ...(keepAudio ? ['-map', '0:a:0', '-c:a', 'aac', '-b:a', '128k'] : []),
      '-map_metadata', '-1', '-map_metadata:s:v', '-1', '-map_chapters', '-1',
      // 4:2:0 cannot hold an odd width or height, and the encoder refuses one.
      ...(info.isOdd ? ['-vf', 'crop=trunc(iw/2)*2:trunc(ih/2)*2'] : []),
      '-c:v', 'libx264', '-preset', 'slow', '-crf', String(opts.crf), '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart', ...BITEXACT,
      firstPass,
    ]);
    // A copy, not an encode. It only drops the x264 settings SEI from the stream.
    await run('ffmpeg', [
      '-nostdin', '-v', 'error', '-y',
      '-i', firstPass,
      '-map', '0', '-c', 'copy', '-bsf:v', 'filter_units=remove_types=6',
      '-map_metadata', '-1', '-movflags', '+faststart', ...BITEXACT,
      secondPass,
    ]);
    const bytes = (await stat(secondPass)).size;
    const before = (await stat(source)).size;
    if (bytes < before) await rename(secondPass, target);
    return { before, after: bytes, kept: bytes < before };
  } finally {
    await rm(firstPass, { force: true });
    await rm(secondPass, { force: true });
    liveTemps.delete(firstPass);
    liveTemps.delete(secondPass);
  }
}

function describe(info, opts) {
  const notes = [`${info.width}x${info.height}`];
  if (info.hasAudio) notes.push(opts.audio ? 'audio kept' : 'audio removed');
  if (info.isOdd) notes.push('trimmed 1 pixel to reach an even size');
  if (info.isHdr) notes.push('HDR source, so its colors may look washed out');
  return notes.join(', ');
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
  const { source, out } = validate(opts);
  const names = await readVideos(source);
  if (!names.length) {
    console.log(`No MP4 files found in "${source}", so there is nothing to reduce.`);
    return;
  }
  await checkTools();
  if (!opts.dryRun) await mkdir(out, { recursive: true });

  // Short when the results land under here, and absolute when a relative path
  // would only be a long climb of ../ segments.
  const relative = path.relative(process.cwd(), out);
  const where = relative && !relative.startsWith('..') ? relative : out;

  const totals = { done: 0, skipped: 0, notSmaller: 0, failed: 0, before: 0, after: 0 };
  for (const name of names) {
    const input = path.join(source, name);
    const target = path.join(out, name);
    // One unreadable video should not cost the rest of the batch.
    try {
      const info = await probe(input);
      console.log(`  ${name}  (${describe(info, opts)})`);
      const taken = await exists(target);
      if (taken && !opts.force) {
        console.log('    already reduced, skipped');
        totals.skipped += 1;
      } else if (opts.dryRun) {
        const size = formatBytes((await stat(input)).size);
        console.log(`    ${size} would be ${taken ? 'replaced in' : 'written to'} ${where}`);
        totals.done += 1;
      } else {
        const result = await encode(input, target, info, opts);
        if (result.kept) {
          const saved = Math.round((1 - result.after / result.before) * 100);
          console.log(`    ${formatBytes(result.before)} to ${formatBytes(result.after)}, ${saved}% smaller`);
          totals.done += 1;
          totals.before += result.before;
          totals.after += result.after;
        } else {
          console.log(`    came out larger at CRF ${opts.crf} (${formatBytes(result.before)} to ${formatBytes(result.after)}), so it was not kept. A higher --crf may help.`);
          totals.notSmaller += 1;
        }
      }
    } catch (err) {
      console.error(`  ${name}  could not be reduced: ${firstLine(err)}`);
      totals.failed += 1;
    }
  }

  const count = (n) => `${n} video${n === 1 ? '' : 's'}`;
  if (opts.dryRun) {
    console.log(`\nPreview only, nothing written. Would reduce ${count(totals.done)} at CRF ${opts.crf} into ${where}.`);
  } else {
    const summary = totals.done ? `, from ${formatBytes(totals.before)} to ${formatBytes(totals.after)} in total` : '';
    console.log(`\nReduced ${count(totals.done)} at CRF ${opts.crf} into ${where}${summary}.`);
  }
  if (totals.skipped) console.log(`Skipped ${count(totals.skipped)} already reduced. Add --force to redo them.`);
  if (totals.notSmaller) console.log(`Left out ${count(totals.notSmaller)} that did not get smaller.`);
  if (totals.failed) {
    console.error(`${count(totals.failed)} could not be reduced.`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`\n${err.message}\n`);
  process.exitCode = 1;
});
