// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The game state machine (www/shared/js/gamestate-1.0.0.js).
 *
 * This module decides the single most consequential thing in the experience:
 * whether a visitor has won. It is pure at its core precisely so that decision
 * can be pinned with plain numbers rather than discovered by playing, and the
 * assertions below are written as the PROMISES the game makes rather than as a
 * transcript of the implementation.
 *
 * The one worth reading twice is that a win beats a loss on the same frame. A
 * visitor who clears the last raider as the last installation falls did the
 * thing the game asked for, and telling them they lost would read as the game
 * welching on the deal. It costs one line and it is exactly the sort of line
 * that gets "simplified" away later, so it is asserted from both directions.
 *
 * NO THREE, NO DOM, NO CLOCK BUT THE ONE IT IS HANDED. The only environment
 * this file installs is a stand-in `localStorage`, and half the storage tests
 * are about what happens when there is not one.
 */
import { jest } from '@jest/globals';

// ---- A storage that can be told to misbehave -------------------------------

function installStorage(mode = 'working') {
    const store = new Map();
    globalThis.localStorage = {
        getItem(key) {
            if (mode === 'throws') throw new Error('storage disabled');
            return store.has(key) ? store.get(key) : null;
        },
        setItem(key, value) {
            if (mode === 'throws' || mode === 'readonly') throw new Error('quota exceeded');
            store.set(key, String(value));
        }
    };
    return store;
}

let gs;

beforeEach(async () => {
    installStorage();
    jest.resetModules();
    gs = await import('../www/shared/js/gamestate-1.0.0.js');
});

afterEach(() => {
    if (gs) gs.disposeGameState();
    delete globalThis.localStorage;
});

const STORAGE_KEY = 'test.best';

/** The Earth Defense shape, which is also the only shape the module has ever
 *  been asked for: two counters and two predicates over them. */
function startRun(overrides = {}) {
    return gs.initGameState({
        objectives: [
            { counter: 'friendlyStructures', ids: ['s1', 's2', 's3'] },
            { counter: 'hostileShips', ids: ['h1', 'h2'] }
        ],
        winWhen: (c) => c.hostileShips === 0,
        loseWhen: (c) => c.friendlyStructures === 0,
        lives: 3,
        storageKey: STORAGE_KEY,
        ...overrides
    });
}

const destroyAll = (ids) => ids.forEach(id => gs.noteDestroyed(id));

// ---- The pure core ----------------------------------------------------------

describe('evaluate', () => {
    const rules = {
        winWhen: (c) => c.hostiles === 0,
        loseWhen: (c) => c.friendlies === 0
    };

    test('says playing while both rules are unsatisfied', () => {
        expect(gs.evaluate({ hostiles: 3, friendlies: 4 }, rules)).toBe('playing');
    });

    test('says won when the win rule fires', () => {
        expect(gs.evaluate({ hostiles: 0, friendlies: 4 }, rules)).toBe('won');
    });

    test('says lost when the lose rule fires', () => {
        expect(gs.evaluate({ hostiles: 3, friendlies: 0 }, rules)).toBe('lost');
    });

    test('WINNING TAKES PRECEDENCE when both fire on the same frame', () => {
        // A visitor who cleared the fleet as the last installation fell did the
        // thing the game asked for. A loss screen after that reads as the game
        // welching, so this is a courtesy rather than a tiebreak detail.
        expect(gs.evaluate({ hostiles: 0, friendlies: 0 }, rules)).toBe('won');
    });

    test('is a pure function of what it is handed, with no module state in it', () => {
        // Called before any init, with rules that have nothing to do with the
        // ones this module happens to be holding.
        expect(gs.evaluate({ anything: 1 }, { winWhen: (c) => c.anything === 1 })).toBe('won');
    });

    test('missing rules mean the game simply cannot end that way yet', () => {
        // A milestone that has a lose condition and no win condition is a
        // sensible thing to be, rather than a crash.
        expect(gs.evaluate({ hostiles: 0 }, {})).toBe('playing');
        expect(gs.evaluate({ hostiles: 0 })).toBe('playing');
        expect(gs.evaluate(null, rules)).toBe('playing');
        expect(gs.evaluate({ hostiles: 0 }, { winWhen: 'not a function' })).toBe('playing');
    });
});

// ---- Counters ---------------------------------------------------------------

describe('the counters', () => {
    test('start at however many ids each objective was given', () => {
        const counters = startRun();
        expect(counters).toEqual({ friendlyStructures: 3, hostileShips: 2 });
    });

    test('noteDestroyed decrements the counter the id belongs to', () => {
        startRun();
        expect(gs.noteDestroyed('s1')).toBe('friendlyStructures');
        expect(gs.getCounters().friendlyStructures).toBe(2);
        expect(gs.getCounters().hostileShips).toBe(2);
    });

    test('an id nobody registered is ignored rather than being an error', () => {
        // A caller that reports every destruction should not have to know which
        // of them the objective cares about.
        startRun();
        expect(gs.noteDestroyed('a-rock')).toBeNull();
        expect(gs.getCounters()).toEqual({ friendlyStructures: 3, hostileShips: 2 });
    });

    test('the same id twice cannot decrement twice', () => {
        startRun();
        gs.noteDestroyed('h1');
        expect(gs.noteDestroyed('h1')).toBeNull();
        expect(gs.getCounters().hostileShips).toBe(1);
    });

    test('counterFor answers which side an id is on', () => {
        startRun();
        expect(gs.counterFor('h2')).toBe('hostileShips');
        expect(gs.counterFor('nobody')).toBeNull();
    });

    test('an objective with no ids is a counter at zero, not a crash', () => {
        const counters = gs.initGameState({ objectives: [{ counter: 'empty' }] });
        expect(counters).toEqual({ empty: 0 });
    });

    test('a spec with nothing in it starts a run with nothing to count', () => {
        expect(gs.initGameState()).toEqual({});
        expect(gs.getState()).toBe('briefing');
    });
});

// ---- Winning and losing -----------------------------------------------------

describe('ending a run', () => {
    test('clearing the hostiles wins it', () => {
        startRun();
        gs.transition('playing');
        destroyAll(['h1', 'h2']);
        expect(gs.getState()).toBe('won');
        expect(gs.isOver()).toBe(true);
    });

    test('losing every objective loses it', () => {
        startRun();
        gs.transition('playing');
        destroyAll(['s1', 's2', 's3']);
        expect(gs.getState()).toBe('lost');
    });

    test('a straggling shot after a win cannot turn it into a loss', () => {
        // Hits resolve the moment they are fired, so a raider's shot already in
        // flight can land after the last one died. It must not take the win
        // away, and it must not move the counters afterwards either.
        startRun();
        gs.transition('playing');
        destroyAll(['h1', 'h2']);
        expect(gs.getState()).toBe('won');

        destroyAll(['s1', 's2', 's3']);
        expect(gs.getState()).toBe('won');
        expect(gs.getCounters().friendlyStructures).toBe(3);
    });

    test('a loss and a win in the same frame settles as a win', () => {
        // THIS IS THE CASE THE WIN-FIRST RULE EXISTS FOR, and it is genuinely
        // reachable: raiders resolve their fire before the visitor's guns do,
        // so the last installation can fall and the last raider die on the same
        // tick, as two separate calls. Whichever landed first would otherwise
        // settle it, and the visitor would be told they lost a game they had
        // just finished winning.
        startRun({
            objectives: [
                { counter: 'friendlyStructures', ids: ['s1'] },
                { counter: 'hostileShips', ids: ['h1'] }
            ]
        });
        gs.transition('playing');

        gs.noteDestroyed('s1');
        expect(gs.getState()).toBe('lost');
        gs.noteDestroyed('h1');
        expect(gs.getState()).toBe('won');
    });

    test('but a win is never overturned by a straggler going the other way', () => {
        startRun({
            objectives: [
                { counter: 'friendlyStructures', ids: ['s1'] },
                { counter: 'hostileShips', ids: ['h1'] }
            ]
        });
        gs.transition('playing');
        gs.noteDestroyed('h1');
        expect(gs.getState()).toBe('won');
        gs.noteDestroyed('s1');
        expect(gs.getState()).toBe('won');
    });
});

describe('lives', () => {
    test('run down one at a time and report what is left', () => {
        startRun();
        gs.transition('playing');
        expect(gs.livesRemaining()).toBe(3);
        expect(gs.loseLife()).toBe(2);
        expect(gs.loseLife()).toBe(1);
        expect(gs.getState()).toBe('playing');
    });

    test('reaching zero ends the run WITHOUT reporting a lost objective', () => {
        // PRD 6.4. The run is over either way, but announcing that the
        // installations fell when they did not is exactly the small dishonesty
        // that makes a game feel cheap.
        startRun();
        gs.transition('playing');
        gs.loseLife(); gs.loseLife(); gs.loseLife();

        expect(gs.getState()).toBe('lost');
        expect(gs.endedByLives()).toBe(true);
        expect(gs.getCounters().friendlyStructures).toBe(3);
    });

    test('losing the objective is not blamed on the lives', () => {
        startRun();
        gs.transition('playing');
        destroyAll(['s1', 's2', 's3']);
        expect(gs.endedByLives()).toBe(false);
        expect(gs.livesRemaining()).toBe(3);
    });

    test('a finished run cannot lose another life', () => {
        startRun();
        gs.transition('playing');
        destroyAll(['h1', 'h2']);
        expect(gs.loseLife()).toBe(3);
        expect(gs.getState()).toBe('won');
    });

    test('a game with no lives at all simply has none to lose', () => {
        startRun({ lives: 0 });
        gs.transition('playing');
        expect(gs.loseLife()).toBe(0);
        expect(gs.getState()).toBe('playing');
    });
});

// ---- The state machine ------------------------------------------------------

describe('transitions', () => {
    test('a run starts in briefing without announcing it', () => {
        // Nobody has subscribed at init, and arriving in the state you started
        // in is not news.
        const seen = [];
        gs.onStateChange((next) => seen.push(next));
        startRun();
        expect(gs.getState()).toBe('briefing');
        expect(seen).toEqual([]);
    });

    test('the subscriber fires once per REAL change, with where it came from', () => {
        startRun();
        const seen = [];
        gs.onStateChange((next, previous) => seen.push([previous, next]));

        expect(gs.transition('playing')).toBe(true);
        expect(gs.transition('playing')).toBe(false);   // already there
        expect(gs.transition('paused')).toBe(true);
        expect(gs.transition('playing')).toBe(true);

        expect(seen).toEqual([
            ['briefing', 'playing'],
            ['playing', 'paused'],
            ['paused', 'playing']
        ]);
    });

    test('winning twice fires the subscriber once', () => {
        startRun();
        gs.transition('playing');
        let wins = 0;
        gs.onStateChange((next) => { if (next === 'won') wins++; });

        destroyAll(['h1', 'h2']);
        gs.transition('won');
        expect(wins).toBe(1);
    });

    test('a state that does not exist is refused rather than entered', () => {
        startRun();
        expect(gs.transition('victory')).toBe(false);
        expect(gs.transition(undefined)).toBe(false);
        expect(gs.getState()).toBe('briefing');
    });

    test('a finished run only ever moves on to a fresh one', () => {
        startRun();
        gs.transition('playing');
        destroyAll(['h1', 'h2']);
        expect(gs.getState()).toBe('won');
        expect(gs.transition('lost')).toBe(false);
        // But it can be restarted, which is the whole point of the end screen.
        expect(gs.transition('playing')).toBe(true);
    });

    test('isPlaying is true for exactly one state', () => {
        startRun();
        for (const phase of gs.__test__.VALID) {
            gs.disposeGameState();
            startRun();
            gs.transition(phase);
            expect(gs.isPlaying()).toBe(phase === 'playing');
        }
    });

    test('a run with no subscriber transitions quietly', () => {
        startRun();
        expect(() => gs.transition('playing')).not.toThrow();
    });
});

// ---- The clock --------------------------------------------------------------

describe('the timer', () => {
    test('only advances while playing, so pausing is honest', () => {
        // A best time that can be improved by opening the menu and thinking is
        // not a best time.
        startRun();
        gs.tick(5);
        expect(gs.elapsed()).toBe(0);          // briefing

        gs.transition('playing');
        gs.tick(2);
        gs.tick(3);
        expect(gs.elapsed()).toBe(5);

        gs.transition('paused');
        gs.tick(60);
        expect(gs.elapsed()).toBe(5);

        gs.transition('playing');
        gs.tick(1);
        expect(gs.elapsed()).toBe(6);
    });

    test('stops the moment the run is over', () => {
        startRun();
        gs.transition('playing');
        gs.tick(10);
        destroyAll(['h1', 'h2']);
        gs.tick(30);
        expect(gs.elapsed()).toBe(10);
    });

    test('a missing or negative delta cannot run the clock backwards', () => {
        startRun();
        gs.transition('playing');
        gs.tick(4);
        gs.tick(-10);
        gs.tick();
        expect(gs.elapsed()).toBe(4);
    });
});

// ---- The best time ----------------------------------------------------------

describe('the best time', () => {
    test('starts absent and then persists', () => {
        startRun();
        expect(gs.bestTime()).toBeNull();
        expect(gs.recordBestTime(240)).toEqual({ best: 240, improved: true });
        expect(gs.bestTime()).toBe(240);
    });

    test('only ever improves', () => {
        startRun();
        gs.recordBestTime(240);
        expect(gs.recordBestTime(300)).toEqual({ best: 240, improved: false });
        expect(gs.recordBestTime(240)).toEqual({ best: 240, improved: false });
        expect(gs.recordBestTime(180)).toEqual({ best: 180, improved: true });
        expect(gs.bestTime()).toBe(180);
    });

    test('survives storage being disabled entirely', () => {
        // A private window that throws on every access must cost the visitor a
        // best time, not the game.
        installStorage('throws');
        startRun();
        expect(gs.bestTime()).toBeNull();
        expect(() => gs.recordBestTime(120)).not.toThrow();
        expect(gs.bestTime()).toBeNull();
    });

    test('survives storage that reads but will not write', () => {
        installStorage('readonly');
        startRun();
        expect(() => gs.recordBestTime(120)).not.toThrow();
        expect(gs.bestTime()).toBeNull();
    });

    test('survives there being no storage object at all', () => {
        delete globalThis.localStorage;
        startRun();
        expect(gs.bestTime()).toBeNull();
        expect(() => gs.recordBestTime(120)).not.toThrow();
    });

    test('rubbish in storage reads as no best time rather than as NaN', () => {
        const store = installStorage();
        startRun();
        store.set(STORAGE_KEY, 'yesterday');
        expect(gs.bestTime()).toBeNull();
        store.set(STORAGE_KEY, '-5');
        expect(gs.bestTime()).toBeNull();
    });

    test('a nonsense time is not recorded', () => {
        startRun();
        expect(gs.recordBestTime(0)).toEqual({ best: null, improved: false });
        expect(gs.recordBestTime(-3)).toEqual({ best: null, improved: false });
        expect(gs.recordBestTime('quickly')).toEqual({ best: null, improved: false });
        expect(gs.bestTime()).toBeNull();
    });

    test('a game with no storage key keeps no best time', () => {
        startRun({ storageKey: null });
        expect(gs.recordBestTime(100)).toEqual({ best: null, improved: false });
        expect(gs.bestTime()).toBeNull();
    });
});

// ---- Restart ----------------------------------------------------------------

describe('resetRun', () => {
    test('puts the counters, the lives, and the clock back', () => {
        startRun();
        gs.transition('playing');
        gs.tick(90);
        gs.noteDestroyed('h1');
        gs.loseLife();

        gs.resetRun();

        expect(gs.getCounters()).toEqual({ friendlyStructures: 3, hostileShips: 2 });
        expect(gs.livesRemaining()).toBe(3);
        expect(gs.elapsed()).toBe(0);
        expect(gs.endedByLives()).toBe(false);
        expect(gs.getState()).toBe('briefing');
    });

    test('a destroyed id can be destroyed again in the next run', () => {
        // The id leaves the lookup on its first destruction, so a reset that
        // forgot to rebuild it would leave that installation immortal.
        startRun();
        gs.transition('playing');
        gs.noteDestroyed('h1');
        gs.resetRun();
        expect(gs.noteDestroyed('h1')).toBe('hostileShips');
    });

    test('keeps the rules and the subscriber, so a restart button is one call', () => {
        startRun();
        const seen = [];
        gs.onStateChange((next) => seen.push(next));
        gs.transition('playing');
        destroyAll(['h1', 'h2']);
        expect(gs.getState()).toBe('won');

        gs.resetRun();
        gs.transition('playing');
        destroyAll(['h1', 'h2']);
        expect(gs.getState()).toBe('won');
        expect(seen).toEqual(['playing', 'won', 'briefing', 'playing', 'won']);
    });

    test('a finished run resets out of its ending', () => {
        startRun();
        gs.transition('playing');
        gs.loseLife(); gs.loseLife(); gs.loseLife();
        expect(gs.isOver()).toBe(true);
        gs.resetRun();
        expect(gs.isOver()).toBe(false);
    });
});

describe('dispose', () => {
    test('forgets everything and is safe twice', () => {
        startRun();
        gs.transition('playing');
        gs.tick(30);
        gs.disposeGameState();

        expect(gs.getState()).toBe('briefing');
        expect(gs.getCounters()).toEqual({});
        expect(gs.livesRemaining()).toBe(0);
        expect(gs.elapsed()).toBe(0);
        expect(gs.bestTime()).toBeNull();
        expect(() => gs.disposeGameState()).not.toThrow();
    });

    test('a disposed module still answers rather than throwing', () => {
        gs.disposeGameState();
        expect(gs.noteDestroyed('anything')).toBeNull();
        expect(gs.counterFor('anything')).toBeNull();
        expect(gs.tick(1)).toBe(0);
        expect(gs.resetRun()).toEqual({});
    });
});
