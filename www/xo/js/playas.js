// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * playas.js - WHO THE VISITOR IS ON THE FIELD (specs/xo-photos-plan, Step 1).
 *
 * With an avatar saved on /avatar/, the visitor used to be the quarterback and
 * nobody else (specs/avatar M7). The moments worth a photo mostly happen to a
 * receiver, so the avatar can now be any player who ever lines up: this is the
 * table of them, what they are called, and which plays leave each one on the
 * sideline.
 *
 * PURE. No THREE, no DOM. The choice itself is kept with the play settings
 * (playbook-ui.js), and the roster and the view act on it.
 *
 * SEVENTEEN SLOTS, AND THEY ARE MEASURED, NOT ASSUMED. play.js lines up
 * nineteen players and two of them never take the field: db5 and db6 are
 * benched by every one of the nineteen defenses the library runs (2026-10-29).
 * The other seventeen all play somewhere, but not all of them everywhere:
 * linemen 4 to 6 come on only for the heavier sets, and receivers C and D sit
 * some of those out. `benchedIn` answers which, from the play's real line-up,
 * and the suite runs every play against this table.
 */
import { XO_CONFIG as CFG } from './config.min.js';
import { createPlay, lineUp, OFFENSIVE_PLAYS } from './play.min.js';

/** The slot a visitor is when they have chosen nothing, and the one every
 *  stored value that is not a slot falls back to. */
export const DEFAULT_SLOT = 'qb';

const slot = (id, team, label, phrase) => Object.freeze({ id, team, label, phrase });
const numbered = (prefix, count, team, label) => Array.from({ length: count }, (_, i) =>
    slot(`${prefix}${i + 1}`, team, `${label} ${i + 1}`, `${label.toLowerCase()} ${i + 1}`));

/**
 * Every player a visitor can be, offense first, in the order the playbook row
 * will list them. `label` is how a control names them and `phrase` is how a
 * sentence does. The receivers are called by the letters painted under them,
 * read from the same table the discs and the throw buttons use.
 */
export const SLOTS = Object.freeze([
    slot('qb', 0, 'Quarterback', 'quarterback'),
    ...['wr1', 'wr2', 'wr3', 'wr4'].map((id) => {
        const letter = CFG.receivers[id].letter;
        return slot(id, 0, `Receiver ${letter}`, `receiver ${letter}`);
    }),
    ...numbered('x', 6, 0, 'Lineman'),
    ...numbered('db', 4, 1, 'Defensive back'),
    ...numbered('s', 2, 1, 'Safety'),
]);

const BY_ID = new Map(SLOTS.map((s) => [s.id, s]));

export function isSlot(id) {
    return typeof id === 'string' && BY_ID.has(id);
}

/** A stored or requested slot, made safe: anything that is not one of the
 *  seventeen (a typo, an old value, db6) is the quarterback. */
export function normalizeSlot(id) {
    return isSlot(id) ? id : DEFAULT_SLOT;
}

export function slotOf(id) {
    return BY_ID.get(normalizeSlot(id));
}

export function labelOf(id) {
    return slotOf(id).label;
}

/** The welcome card's line for a visitor with an avatar. The quarterback keeps
 *  the sentence it has had since M7. */
export function playingLine(id) {
    const s = slotOf(id);
    return s.id === DEFAULT_SLOT
        ? 'You take the snap at quarterback as your avatar.'
        : `You line up at ${s.phrase} as your avatar.`;
}

/**
 * WHICH OFFENSIVE SLOTS A PLAY LEAVES ON THE SIDELINE, from the play's own
 * line-up rather than from a table, so it cannot drift from the formations.
 *
 * One quiet play is lined up per slug, the first time it is asked, and the
 * answer kept. The defense is named rather than rolled because it changes
 * nothing here: no defense benches anybody on offense. An unknown slug benches
 * nobody.
 */
let probe = null;
const benchings = new Map();

export function benchedIn(slug) {
    if (!OFFENSIVE_PLAYS.includes(slug)) return new Set();
    if (!benchings.has(slug)) {
        if (!probe) probe = createPlay();
        const objects = lineUp(probe, slug, 'cover2');
        benchings.set(slug, new Set(objects
            .filter((o) => o.settings.team === 0 && o.settings.benched)
            .map((o) => o.settings.position)));
    }
    return new Set(benchings.get(slug));
}

/** Does this play leave the visitor in slot `id` on the sideline? */
export function sitsOut(id, slug) {
    return benchedIn(slug).has(normalizeSlot(id));
}
