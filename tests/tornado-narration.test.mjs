// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Tests for www/tornado/js/narration.js: the story told to a screen reader.
 *
 * Played the way the page plays it, sixty frames a second with the player's
 * frame info, into a region that records every change: each beat is said
 * once, in order, in time to be heard; nothing is said behind the welcome
 * card, under a drag or across a seek; and the landing names what this run
 * carried.
 */
import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

jest.unstable_mockModule('../www/tornado/js/config.min.js', async () => (
    await import('../www/tornado/js/config.js')
));
jest.unstable_mockModule('../www/shared/js/narration-1.0.0.min.js', async () => (
    await import('../www/shared/js/narration-1.0.0.js')
));

let C;
let N;

beforeAll(async () => {
    ({ TORNADO_CONFIG: C } = await import('../www/tornado/js/config.js'));
    N = await import('../www/tornado/js/narration.js');
});

const FRAME = 1 / 60;

/** A live region that keeps every sentence written into it. */
function region() {
    const said = [];
    let text = '';
    return {
        said,
        get textContent() { return text; },
        set textContent(value) { text = value; if (value) said.push(value); }
    };
}

/** Play from `from` to `to` with the frame info given. */
function play(narrator, from, to, info = { begun: true, scrubbing: false }, payload = 'cow') {
    for (let arc = from; arc <= to + 1e-9; arc += FRAME) narrator.update(arc, info, payload);
}

describe('THE BEATS', () => {
    test('are in order, inside the story, and far enough apart to be heard', () => {
        const beats = C.narration.beats;
        expect(beats.length).toBeGreaterThanOrEqual(5);
        for (let i = 1; i < beats.length; i++) expect(beats[i].at - beats[i - 1].at).toBeGreaterThanOrEqual(3.5);
        expect(beats[0].at).toBeGreaterThan(0);
        // All of it before the picture fades.
        expect(beats[beats.length - 1].at).toBeLessThan(C.story.seconds - C.story.fadeSeconds);
    });

    test('line up with what the picture is doing', () => {
        const at = (words) => C.narration.beats.find((b) => b.text && b.text.includes(words)).at;
        const stage = (name) => C.story.stages.find((s) => s.name === name).at;
        expect(at('touches down')).toBeGreaterThanOrEqual(stage('touchdown'));
        expect(at('lifted into the storm')).toBeGreaterThan(C.cow.pickupAt);
        expect(at('long rope')).toBeGreaterThanOrEqual(C.lifecycle.rope[0][0]);
        const landing = C.narration.beats.find((b) => b.landed).at;
        expect(landing).toBeGreaterThanOrEqual(C.cow.landAt);
        expect(landing).toBeGreaterThanOrEqual(C.rainbow.amount[0][0]);
    });

    test('THE LANDING NAMES WHAT CAME DOWN, and nothing earlier gives it away', () => {
        const landing = C.narration.beats.findIndex((b) => b.landed);
        expect(N.beatText(landing, 'cow', C)).toContain('A cow');
        for (const name of Object.keys(C.payloads).filter((k) => C.payloads[k].landed)) {
            expect(N.beatText(landing, name, C)).toContain(name);
            expect(N.beatText(landing, name, C)).toContain(C.narration.rainbow);
        }
        for (const beat of C.narration.beats.filter((b) => !b.landed)) {
            expect(beat.text).not.toMatch(/cow|flamingo|outhouse|trampoline|mailbox/i);
        }
        expect(N.beatText(99, 'cow', C)).toBe('');
        expect(N.beatIndexAt(0, C)).toBe(-1);
        expect(N.beatIndexAt(C.story.seconds, C)).toBe(C.narration.beats.length - 1);
    });

    test('keep the house style: no semicolons, no em-dashes, and each is a sentence', () => {
        const all = [
            ...C.narration.beats.filter((b) => b.text).map((b) => b.text),
            C.narration.rainbow,
            C.cow.landed,
            ...Object.values(C.payloads).filter((p) => p.landed).map((p) => p.landed)
        ];
        for (const text of all) {
            expect(text).not.toMatch(/[;—]/);
            expect(text).toMatch(/^[A-Z].*\.$/);
        }
    });
});

describe('THE NARRATOR', () => {
    test('SAYS EACH BEAT ONCE, in order, as the story plays through', () => {
        const r = region();
        const narrator = N.createNarrator(r, C);
        play(narrator, 0, C.story.seconds);
        expect(r.said).toEqual(C.narration.beats.map((_, i) => N.beatText(i, 'cow', C)));
    });

    test('is silent behind the welcome card and under a drag', () => {
        const r = region();
        const narrator = N.createNarrator(r, C);
        play(narrator, 0, 0, { begun: false });
        play(narrator, 0, C.story.seconds, { begun: true, scrubbing: true });
        expect(r.said).toEqual([]);
    });

    test('A SEEK LANDS QUIET, and the story goes on from there', () => {
        const r = region();
        const narrator = N.createNarrator(r, C);
        play(narrator, 0, 2);
        expect(r.said).toHaveLength(1);
        // Jump to the middle of the storm: nothing for the beats skipped.
        narrator.update(16, { begun: true }, 'cow');
        expect(r.said).toHaveLength(1);
        play(narrator, 16, 22);
        expect(r.said[r.said.length - 1]).toBe(C.narration.beats.find((b) => b.at === 20.5).text);
        expect(r.said).toHaveLength(2);
        // Back before a beat already heard, and it is heard again.
        narrator.update(3, { begun: true }, 'cow');
        play(narrator, 3, 5);
        expect(r.said[r.said.length - 1]).toBe(N.beatText(1, 'cow', C));
    });

    test('A REPLAY TELLS THE NEW LANDING', () => {
        const r = region();
        const narrator = N.createNarrator(r, C);
        play(narrator, 0, C.story.seconds, undefined, 'cow');
        // The player rewinds to zero for a replay, and the page draws a
        // surprise.
        narrator.update(0, { begun: true }, 'mailbox');
        play(narrator, 0, C.story.seconds, undefined, 'mailbox');
        expect(r.said[r.said.length - 1]).toContain(C.payloads.mailbox.landed);
        expect(r.said).toHaveLength(2 * C.narration.beats.length);
    });

    test('works without a region, and reports what it would say', () => {
        const narrator = N.createNarrator(null, C);
        expect(narrator.update(0.6, { begun: true })).toBeNull();
        expect(narrator.update(1.01, { begun: true })).toBe(C.narration.beats[0].text);
        // Half a second or more in one frame is a seek, and a seek is quiet.
        expect(narrator.update(8.6, { begun: true })).toBeNull();
        // It keeps its place there, so the beat it jumped onto is not said late.
        expect(narrator.state().spoken).toBe(2);
    });
});

describe('the page', () => {
    test('has the live region, and main.js feeds it every frame with the payload', () => {
        const page = readFileSync(join(process.cwd(), 'www/tornado/index.html'), 'utf8');
        expect(page).toContain('<p id="story-status" class="sr-only" role="status" aria-live="polite"></p>');
        const main = readFileSync(join(process.cwd(), 'www/tornado/js/main.js'), 'utf8');
        expect(main).toMatch(/createNarrator\(document\.getElementById\('story-status'\), CONFIG\)/);
        expect(main).toMatch(/export function drawFrame\(delta, arc, info = \{\}\)/);
        expect(main).toMatch(/narrator\.update\(arc, info, payload\)/);
    });
});
