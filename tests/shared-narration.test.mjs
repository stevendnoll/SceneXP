// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Tests for www/shared/js/narration-1.0.0.js: a timed story told to a screen
 * reader, one sentence per beat, and quiet whenever the story did not play
 * into a beat.
 */
import * as N from '../www/shared/js/narration-1.0.0.js';

const FRAME = 1 / 60;
const BEATS = [
    { at: 2, text: 'The first thing happens.' },
    { at: 6, text: 'The second thing happens.' },
    { at: 10, text: 'The last thing happens.' }
];

function region() {
    const said = [];
    let text = '';
    return {
        said,
        get textContent() { return text; },
        set textContent(value) { text = value; if (value) said.push(value); }
    };
}

function play(narrator, from, to, info = { begun: true }) {
    for (let t = from; t <= to + 1e-9; t += FRAME) narrator.update(t, info);
}

describe('beatIndexAt', () => {
    test('is the last beat reached, or -1 before the first', () => {
        expect(N.beatIndexAt(0, BEATS)).toBe(-1);
        expect(N.beatIndexAt(2, BEATS)).toBe(0);
        expect(N.beatIndexAt(7, BEATS)).toBe(1);
        expect(N.beatIndexAt(99, BEATS)).toBe(2);
        expect(N.beatIndexAt(5, [])).toBe(-1);
    });

    test('a beat without text says nothing by default', () => {
        expect(N.textOf({ at: 1 })).toBe('');
        expect(N.textOf(BEATS[0])).toBe('The first thing happens.');
    });
});

describe('the narrator', () => {
    test('SAYS EACH BEAT ONCE, IN ORDER, as the story plays', () => {
        const r = region();
        play(N.createNarrator(r, { beats: BEATS }), 0, 12);
        expect(r.said).toEqual(BEATS.map((b) => b.text));
    });

    test('says nothing before Begin or under a drag', () => {
        const r = region();
        const narrator = N.createNarrator(r, { beats: BEATS });
        play(narrator, 0, 12, { begun: false });
        play(narrator, 0, 12, { begun: true, scrubbing: true });
        narrator.update(12);
        expect(r.said).toEqual([]);
    });

    test('A JUMP LANDS QUIET and it picks up at the next beat', () => {
        const r = region();
        const narrator = N.createNarrator(r, { beats: BEATS });
        play(narrator, 0, 3);
        expect(narrator.update(7, { begun: true })).toBeNull();
        play(narrator, 7, 11);
        expect(r.said).toEqual([BEATS[0].text, BEATS[2].text]);
        // Back to the start (a replay), and it tells the story again.
        narrator.update(0, { begun: true });
        play(narrator, 0, 3);
        expect(r.said[r.said.length - 1]).toBe(BEATS[0].text);
        expect(narrator.state()).toEqual({ spoken: 0, lastArc: expect.any(Number) });
    });

    test('a scene can say its own words, and set how far is a jump', () => {
        const r = region();
        const narrator = N.createNarrator(r, {
            beats: BEATS,
            say: (beat, i, who) => `${who} saw beat ${i + 1}.`,
            jumpSeconds: 5
        });
        // Four seconds in one frame is still playing, at this setting.
        narrator.update(0, { begun: true }, 'Ann');
        expect(narrator.update(4, { begun: true }, 'Ann')).toBe('Ann saw beat 1.');
        expect(r.said).toEqual(['Ann saw beat 1.']);
    });

    test('works without a region, and without options', () => {
        const narrator = N.createNarrator(null, { beats: BEATS });
        narrator.update(1.99, { begun: true });
        expect(narrator.update(2, { begun: true })).toBe(BEATS[0].text);
        expect(() => N.createNarrator(null)).not.toThrow();
    });
});
