// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The pulsing markers (marks.js): two, over the computer and the
 * binoculars, each gone once its own thing is opened, and all of them once
 * three different things have been.
 */
import * as marks from '../www/office/js/marks.js';

const { MARKS, COACHING, OPENED, openedCount, noteOpened, marksShown } = marks;

describe('the markers', () => {
    test('two of them, over the computer and the binoculars, each with words for a screen reader', () => {
        expect(MARKS.map((m) => m.key)).toEqual(['computer', 'binoculars']);
        for (const m of MARKS) {
            expect(m.label).toMatch(/^(Open|Look)/);
            expect(OPENED[m.key]).toBeGreaterThan(0);
        }
    });

    test('a bit for each thing that opens, none shared', () => {
        const bits = Object.values(OPENED);
        expect(new Set(bits).size).toBe(bits.length);
        for (const b of bits) expect(openedCount(b)).toBe(1);
    });

    test('each retires once its own thing is opened, and all of them after three different things', () => {
        let bits = 0;
        expect(marksShown(bits)).toEqual(['computer', 'binoculars']);
        bits = noteOpened(bits, 'computer');
        expect(marksShown(bits)).toEqual(['binoculars']);
        // Opening the same thing again counts once.
        expect(noteOpened(bits, 'computer')).toBe(bits);
        bits = noteOpened(bits, 'printer');
        expect(marksShown(bits)).toEqual(['binoculars']);
        bits = noteOpened(bits, 'lamp');
        expect(openedCount(bits)).toBe(COACHING.retireAfter);
        expect(marksShown(bits)).toEqual([]);
        // Something with no bit changes nothing.
        expect(noteOpened(bits, 'nothing')).toBe(bits);
    });
});
