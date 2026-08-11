// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * gamestate.js - Whether the game is still going, and how it ended
 * (shared engine part).
 *
 * ENTIRELY PURE AT ITS CORE and free of THREE, the DOM, and any clock but the
 * one it is handed. `evaluate` is a function of counters and rules, so the
 * single most consequential decision in the experience (has this visitor won)
 * is a value in and a value out, testable with plain numbers and readable in
 * one sitting.
 *
 * THE RULES ARE PREDICATES, NOT CODE IN THIS FILE. The caller supplies
 * `winWhen` and `loseWhen` over its own counters, so a game about escorting
 * something or surviving a duration reuses this module unchanged. Nothing here
 * knows what a structure or a ship is; it knows that named counters go down.
 *
 * WINNING TAKES PRECEDENCE. If the last hostile dies on the same frame as the
 * last objective falls, the visitor is told they won. That is not a tiebreak
 * detail, it is a courtesy: they did the thing the game asked for, and a loss
 * screen after clearing the board would read as the game welching.
 *
 * THE TIMER ONLY RUNS WHILE PLAYING, which makes pausing honest and means a
 * best time cannot be gamed by opening the menu and thinking.
 *
 * RUNNING OUT OF LIVES IS NOT A LOST OBJECTIVE. The run ends either way, but
 * `endedByLives()` lets the caller say so accurately, because announcing that
 * the objective failed when it did not is exactly the kind of small dishonesty
 * that makes a game feel cheap.
 */

const VALID = ['briefing', 'playing', 'paused', 'won', 'lost'];
const TERMINAL = ['won', 'lost'];

let rules = null;
let counters = {};
let startingCounters = {};
let counterOf = new Map();   // id -> counter name, built once and never edited
let counted = new Set();     // ids already counted, so a restart can forget them
let state = 'briefing';
let lives = 0;
let startingLives = 0;
let byLives = false;
let elapsedSeconds = 0;
let storageKey = null;
let stateCallback = null;

// ---- Pure core -------------------------------------------------------------

/** What the counters say the state should be: 'won', 'lost', or 'playing'.
 *
 *  Rules are optional. A missing `winWhen` means the game cannot be won yet,
 *  which is a sensible thing for a milestone to be rather than a crash. */
export function evaluate(counts, against = {}) {
    if (!counts) return 'playing';
    // Win first, deliberately. See the header.
    if (typeof against.winWhen === 'function' && against.winWhen(counts)) return 'won';
    if (typeof against.loseWhen === 'function' && against.loseWhen(counts)) return 'lost';
    return 'playing';
}

// ---- Setup ------------------------------------------------------------------

/** Start a run.
 *
 *  spec {
 *    objectives: [{ counter, ids }]   named counters and what belongs to each
 *    winWhen, loseWhen                predicates over the counters
 *    lives                            how many attempts, 0 for none
 *    storageKey                       where a best time is kept, or null
 *  }
 *
 *  `objectives` carries the ids rather than a naming convention, so
 *  `noteDestroyed` never has to guess which counter something belongs to by
 *  reading its id. Guessing works right up until two games disagree about
 *  prefixes.
 */
export function initGameState(spec = {}) {
    rules = { winWhen: spec.winWhen, loseWhen: spec.loseWhen };
    counters = {};
    startingCounters = {};
    counterOf = new Map();
    counted = new Set();

    for (const objective of spec.objectives || []) {
        const ids = objective.ids || [];
        counters[objective.counter] = ids.length;
        startingCounters[objective.counter] = ids.length;
        for (const id of ids) counterOf.set(id, objective.counter);
    }

    startingLives = spec.lives || 0;
    lives = startingLives;
    byLives = false;
    elapsedSeconds = 0;
    storageKey = spec.storageKey || null;
    // Straight to briefing without firing the callback: nobody has subscribed
    // yet, and a transition into the state you started in is not news.
    state = 'briefing';
    return getCounters();
}

/** Put the same run back to its opening position, keeping the rules and the
 *  subscriber. This is what a restart button wants: the caller does not have
 *  to reassemble the spec, and a listener wired once at boot stays wired. */
export function resetRun() {
    for (const name of Object.keys(startingCounters)) {
        counters[name] = startingCounters[name];
    }
    // Everything is destructible again. Forgetting this is how a second run
    // becomes unwinnable: the counters read full, and nothing ever brings them
    // down because every id is still marked as already dealt with.
    counted = new Set();
    lives = startingLives;
    byLives = false;
    elapsedSeconds = 0;
    transition('briefing');
    return getCounters();
}

// ---- The state machine ------------------------------------------------------

/** Move to a new state, firing the subscriber exactly once for a real change.
 *
 *  Returns true when something actually moved. Transitions to the state you are
 *  already in, to a state that does not exist, and out of a finished run into
 *  another ending are all quiet no-ops: winning twice fires nothing the second
 *  time, and a straggling shot resolving after the last raider died cannot turn
 *  a win into a loss. */
export function transition(next) {
    if (VALID.indexOf(next) === -1) return false;
    if (next === state) return false;

    // A finished run only ever moves on to a fresh one, WITH ONE EXCEPTION: a
    // loss can still be overturned by a win. That exception is the whole reason
    // the win-first rule in `evaluate` is reachable at all. The last
    // installation falling and the last hostile dying genuinely do happen in
    // the same frame, as two separate calls, and the one that lands first would
    // otherwise settle it. In practice the window is that single frame, because
    // a finished run stops being simulated.
    if (isOver() && TERMINAL.indexOf(next) !== -1 && !(state === 'lost' && next === 'won')) {
        return false;
    }

    const previous = state;
    state = next;
    if (stateCallback) stateCallback(next, previous);
    return true;
}

export function getState() { return state; }

export function isOver() { return TERMINAL.indexOf(state) !== -1; }

export function isPlaying() { return state === 'playing'; }

export function onStateChange(cb) { stateCallback = cb; }

// ---- Counters ---------------------------------------------------------------

/** Something registered at init has been destroyed.
 *
 *  Returns the counter it belonged to, or null for an id nobody registered,
 *  which is deliberately not an error: a caller that reports every destruction
 *  should not have to know which of them the objective cares about. */
export function noteDestroyed(id) {
    // A won run is decided and nothing more counts. A LOST one still does, for
    // the length of the frame it was lost in: see the precedence rule in
    // `transition`.
    if (state === 'won') return null;

    const name = counterOf.get(id);
    if (!name || counted.has(id)) return null;
    counted.add(id);

    counters[name] = Math.max(0, counters[name] - 1);

    const outcome = evaluate(counters, rules);
    if (outcome !== 'playing') transition(outcome);
    return name;
}

/** The live counter object. Returned rather than copied, because the HUD reads
 *  it every frame; treat it as read-only. */
export function getCounters() { return counters; }

export function counterFor(id) { return counterOf.get(id) || null; }

// ---- Lives ------------------------------------------------------------------

/** Returns the lives left. At zero the run ends, but as a run that ran out of
 *  attempts rather than as a failed objective (PRD 6.4). */
export function loseLife() {
    if (isOver() || startingLives === 0) return lives;
    lives = Math.max(0, lives - 1);
    if (lives === 0) {
        byLives = true;
        transition('lost');
    }
    return lives;
}

export function livesRemaining() { return lives; }

/** True when the run ended because the attempts ran out, not because the
 *  objective was lost. The end screen needs to know, or it will announce a
 *  failure that did not happen. */
export function endedByLives() { return byLives; }

// ---- The clock --------------------------------------------------------------

/** Advance the run timer. Only counts while playing, so pausing is honest and
 *  a best time cannot be gamed by opening the menu and thinking. */
export function tick(deltaTime) {
    if (state !== 'playing') return elapsedSeconds;
    elapsedSeconds += Math.max(0, deltaTime || 0);
    return elapsedSeconds;
}

export function elapsed() { return elapsedSeconds; }

// ---- The best time ----------------------------------------------------------
//
// Behind a guard throughout. A browser with storage disabled, or a private
// window that throws on write, degrades to having no best time rather than
// taking the game down with it.

export function bestTime() {
    if (!storageKey) return null;
    const raw = readStored(storageKey);
    if (raw === null) return null;
    const value = parseFloat(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
}

/** Store a finishing time if it beats what is there. Returns the best time
 *  after the attempt, and whether this run set it. */
export function recordBestTime(seconds) {
    const value = Number(seconds);
    if (!storageKey || !Number.isFinite(value) || value <= 0) {
        return { best: bestTime(), improved: false };
    }
    const previous = bestTime();
    if (previous !== null && previous <= value) return { best: previous, improved: false };
    writeStored(storageKey, value);
    return { best: value, improved: true };
}

function readStored(key) {
    try {
        return localStorage.getItem(key);
    } catch (e) {
        return null;   // storage disabled, or a private window that throws
    }
}

function writeStored(key, value) {
    try {
        localStorage.setItem(key, String(value));
    } catch (e) { /* not worth ending a run over */ }
}

// ---- Lifecycle --------------------------------------------------------------

export function disposeGameState() {
    rules = null;
    counters = {};
    startingCounters = {};
    counterOf = new Map();
    counted = new Set();
    state = 'briefing';
    lives = 0;
    startingLives = 0;
    byLives = false;
    elapsedSeconds = 0;
    storageKey = null;
    stateCallback = null;
}

export const __test__ = { VALID, TERMINAL, readStored, writeStored };
