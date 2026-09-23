// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * A scene that plays a media element from a blob: URL must let its own
 * Content Security Policy load one.
 *
 * WHY THIS FILE EXISTS. dad, family, and roqui each start a silent looping
 * <audio> from a blob: URL (createSilentWavUrl in store.js), which promotes the
 * iOS audio session from "ambient" to "playback" so the ring/silent switch
 * does not mute the scene. Until 2026-09-22 none of the three pages declared
 * media-src, so it fell back to default-src 'self', which does not match
 * blob:. The element was blocked, play() rejected, and the .catch(() => {})
 * swallowed it. The workaround never worked on any of them, and the only
 * symptom was a visitor with the switch off hearing nothing.
 *
 * Nothing else notices: the DOM stub has no CSP, a desktop browser ignores the
 * silent switch, and nginx sends no CSP header of its own (the meta tag is the
 * whole policy), so this reads the two halves off disk and checks they agree.
 */
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const WWW = new URL('../www/', import.meta.url);

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

/** The scene's own JavaScript source, minified builds left out. */
async function sourceOf(scene) {
  const dir = new URL(`${scene}/js/`, WWW);
  const files = (await readdir(dir)).filter((f) => f.endsWith('.js') && !f.endsWith('.min.js'));
  const texts = await Promise.all(files.map((f) => readFile(new URL(f, dir), 'utf8')));
  return texts.join('\n');
}

/** A media element whose src comes from URL.createObjectURL. */
function playsBlobMedia(js) {
  const makesElement = /createElement\(\s*['"](?:audio|video)['"]\s*\)|new Audio\(/.test(js);
  return makesElement && js.includes('URL.createObjectURL(');
}

/** The sources one directive allows, or null when the page does not name it. */
function directive(html, name) {
  const meta = /http-equiv="Content-Security-Policy"\s+content="([^"]*)"/.exec(html);
  if (!meta) return null;
  const hit = meta[1].split(';').map((d) => d.trim().split(/\s+/))
    .find(([key]) => key === name);
  return hit ? hit.slice(1) : null;
}

test('the three keep-alive scenes are found by the scan', async () => {
  // Guards the guard: if the detector stops matching, the real test below
  // passes over an empty list and proves nothing.
  const found = [];
  for (const scene of await scenes()) {
    if (playsBlobMedia(await sourceOf(scene))) found.push(scene);
  }
  expect(found).toEqual(expect.arrayContaining(['dad', 'family', 'roqui']));
});

test('every scene that plays blob: media allows blob: in media-src', async () => {
  for (const scene of await scenes()) {
    if (!playsBlobMedia(await sourceOf(scene))) continue;
    const html = await readFile(new URL(`${scene}/index.html`, WWW), 'utf8');
    const allowed = directive(html, 'media-src') || [];
    // Named so a failure says which page lost it.
    expect(`${scene} media-src: ${allowed.join(' ') || '(none, falls back to default-src)'}`)
      .toBe(`${scene} media-src: 'self' blob:`);
  }
});
