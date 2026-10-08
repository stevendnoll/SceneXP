// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The visitor's best time to clear the lawn (www/leaves/js/best.js). Steve's
 * QA, 2026-10-08: "If they want to speed run they can always try to beat
 * their best score... Are we recording the user's fastest time in
 * localStorage? I think we should." With a Forget button, and "a new
 * personal best" in the share. The page's side of it is in
 * tests/leaves-init, and what privacy.html says in tests/privacy.
 */
const Bt = await import('../www/leaves/js/best.js');

/** A browser's local storage, or one that refuses everything. */
function storage(refuse = false) {
    const map = new Map();
    return {
        map,
        getItem: (k) => { if (refuse) throw new Error('denied'); return map.has(k) ? map.get(k) : null; },
        setItem: (k, v) => { if (refuse) throw new Error('denied'); map.set(k, String(v)); },
        removeItem: (k) => { if (refuse) throw new Error('denied'); map.delete(k); }
    };
}

let saved;
beforeEach(() => { saved = globalThis.localStorage; globalThis.localStorage = storage(); });
afterEach(() => { globalThis.localStorage = saved; });

describe('what is kept', () => {
    test('nothing until a clear, then its seconds, for that yard\'s leaf count only', () => {
        expect(Bt.loadBest(24000)).toBe(null);
        const first = Bt.recordBest(24000, 201.4);
        expect(first).toEqual({ best: 201, previous: null, isNew: true });
        expect(Bt.loadBest(24000)).toBe(201);
        // A different yard (the lab's small one) has its own.
        expect(Bt.loadBest(600)).toBe(null);
        // Only seconds, keyed by count: nothing else about the visitor.
        expect(JSON.parse(globalThis.localStorage.getItem(Bt.BEST_KEY))).toEqual({ 24000: 201 });
    });

    test('a faster clear replaces it, a slower one does not', () => {
        Bt.recordBest(12000, 240);
        expect(Bt.recordBest(12000, 250)).toEqual({ best: 240, previous: 240, isNew: false });
        expect(Bt.loadBest(12000)).toBe(240);
        expect(Bt.recordBest(12000, 199)).toEqual({ best: 199, previous: 240, isNew: true });
        expect(Bt.loadBest(12000)).toBe(199);
    });

    test('Forget my best time clears every count', () => {
        Bt.recordBest(24000, 180);
        Bt.recordBest(600, 12);
        expect(Bt.forgetBest()).toBe(true);
        expect(Bt.loadBest(24000)).toBe(null);
        expect(Bt.loadBest(600)).toBe(null);
        expect(globalThis.localStorage.map.size).toBe(0);
    });

    test('storage that refuses, or holds rubbish, never breaks the round', () => {
        globalThis.localStorage = storage(true);
        expect(Bt.loadBest(24000)).toBe(null);
        expect(Bt.recordBest(24000, 150)).toEqual({ best: 150, previous: null, isNew: true });
        expect(Bt.forgetBest()).toBe(false);
        globalThis.localStorage = storage();
        globalThis.localStorage.setItem(Bt.BEST_KEY, '{not json');
        expect(Bt.loadBest(24000)).toBe(null);
        expect(Bt.normalizeBests({ 24000: 150, x: 3, 600: -1, 12000: 'fast', 800: 0.2 })).toEqual({ 24000: 150 });
        expect(Bt.normalizeBests([1, 2])).toEqual({});
        expect(Bt.normalizeBests(null)).toEqual({});
    });
});

describe('what it says', () => {
    test('the welcome card, only once there is a best', () => {
        expect(Bt.bestWelcomeLine(null)).toBe('');
        expect(Bt.bestWelcomeLine(167)).toBe('Your best time to clear the lawn is 2:47. Can you beat it?');
    });

    test('the end card: a first clear, a new best, short of it, or the time to aim for', () => {
        expect(Bt.bestEndLine({ best: 201, previous: null, isNew: true }, 201)).toBe('Your first clear, in 3:21. Now you have a time to beat.');
        expect(Bt.bestEndLine({ best: 167, previous: 201, isNew: true }, 167)).toBe('A new best time, 2:47, down from 3:21.');
        expect(Bt.bestEndLine({ best: 167, previous: 167, isNew: false }, 167)).toBe('Your best time is still 2:47.');
        expect(Bt.bestEndLine(null, 167)).toBe('Your best time to clear the lawn is 2:47.');
        expect(Bt.bestEndLine(null, null)).toBe('');
    });

    test('the share brags only when an old best was beaten', () => {
        expect(Bt.bestShareNote({ best: 167, previous: 201, isNew: true })).toBe('a new personal best');
        expect(Bt.bestShareNote({ best: 201, previous: null, isNew: true })).toBe('');
        expect(Bt.bestShareNote({ best: 167, previous: 167, isNew: false })).toBe('');
        expect(Bt.bestShareNote(null)).toBe('');
    });

    test('every line keeps the house style', () => {
        const lines = [
            Bt.bestWelcomeLine(167), Bt.bestEndLine({ best: 201, previous: null, isNew: true }, 201),
            Bt.bestEndLine({ best: 167, previous: 201, isNew: true }, 167), Bt.bestEndLine({ best: 167, previous: 167, isNew: false }, 167),
            Bt.bestEndLine(null, 167), Bt.bestShareNote({ best: 1, previous: 2, isNew: true })
        ];
        for (const line of lines) expect(line).not.toMatch(/[—;]/);
    });
});
