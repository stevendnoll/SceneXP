// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * moments.js - THE PICTURES IN A PLAY (specs/xo-photos-plan, Step 3).
 *
 * Which moments of a play are worth a photo, who each one is of, and which
 * few are the best. PURE: no THREE, no DOM. main.js reads the facts off the
 * play, schedules each moment `moments.after` seconds past its event, and on
 * that frame snapshot.js keeps exactly what was drawn.
 *
 * THE KINDS, AND WHO EACH IS OF:
 *   catch    a receiver takes a thrown ball (the catcher)
 *   pick     a defender does (the interceptor)
 *   fifty    the carrier crosses into the fifty band, which is the whistle
 *   tackle   the takedown's contact (the carrier, and the tackler with him)
 *   sack     a tackle on a quarterback who never threw it or ran (both)
 *   release  the throw (the quarterback), kept only in the cases `rankMoments`
 *            says, because a picture of a throw is rarely the best one
 */
import { XO_CONFIG as CFG } from './config.min.js';
import { slotOf } from './playas.min.js';

/** Best first. After "is the visitor in it", this is the ranking. */
export const KINDS = Object.freeze(['fifty', 'pick', 'catch', 'sack', 'tackle', 'release']);

/**
 * A BALL IN THE AIR LANDING IN SOMEBODY'S HANDS, between two frames.
 *
 * `was` and `now` are `{ holder, team, thrown }` read off the play each frame:
 * the position holding the ball (empty while it flies), their team, and
 * whether a throw has been made. Before a throw the quarterback holds it, and
 * a keeper never empties the hands, so neither is an event.
 *
 * THE FLIGHT NEED NOT HAVE BEEN SEEN. This is asked once a RENDERED frame, and
 * a slow phone steps the simulation up to a tenth of a second at a time, so a
 * short pass can leave the quarterback's hands and land in a receiver's
 * between two frames. Hands that changed after a throw, from nobody or from
 * the man who had it before the throw, are a catch however few frames the
 * ball was seen in the air.
 */
export function ballEvent(was, now) {
    if (!was || !now || !now.thrown || !now.holder || now.holder === was.holder) return null;
    if (was.holder && was.thrown) return null;
    return { kind: now.team === 0 ? 'catch' : 'pick', hero: now.holder, partner: null };
}

/** The tackle at the whistle is a sack when the quarterback is the one down
 *  and he neither threw it nor ran with it: `classifyPlay`'s own rule. */
export function tackleKind({ carrier, threw, ran }) {
    return carrier === 'qb' && !threw && !ran ? 'sack' : 'tackle';
}

/** Seconds past its event a moment of `kind` is taken. */
export function delayFor(kind) {
    const after = CFG.moments.after[kind];
    return Number.isFinite(after) && after > 0 ? after : 0;
}

/** Is the visitor's player in this one, as its hero or with it? */
export function involves(moment, visitor) {
    return Boolean(visitor) && (moment.hero === visitor || moment.partner === visitor);
}

/**
 * THE BEST FEW, IN ORDER.
 *
 * Moments the visitor's own player is in come first, then the rest, each by
 * kind and then by time. `visitor` is the slot their avatar plays, or null
 * without an avatar, when nobody on the field is them.
 *
 * THE THROW IS THE EXCEPTION. It is kept for a visitor who threw it, or when
 * it is all the play had, and it comes after everything else even then: a
 * quarterback whose pass went for fifty would rather have the fifty.
 */
export function rankMoments(list, visitor = null, keep = CFG.moments.keep) {
    const others = list.some((m) => m.kind !== 'release');
    const kept = list.filter((m) => m.kind !== 'release' || !others || involves(m, visitor));
    const group = (m) => (m.kind === 'release' ? 2 : involves(m, visitor) ? 0 : 1);
    return kept
        .map((m, i) => ({ m, i }))
        .sort((a, b) => group(a.m) - group(b.m)
            || KINDS.indexOf(a.m.kind) - KINDS.indexOf(b.m.kind)
            || (a.m.at || 0) - (b.m.at || 0)
            || a.i - b.i)
        .slice(0, Math.max(0, keep))
        .map(({ m }) => m);
}

/** What a moment is called, for the console and later the photo sheet. */
export const KIND_NAMES = Object.freeze({
    fifty: 'Fifty', pick: 'Interception', catch: 'Catch',
    sack: 'Sack', tackle: 'Tackle', release: 'Throw',
});

// ---- What a photo says (specs/xo-photos-plan, Step 5) -----------------------
//
// The sheet's title, the line under the picture, the words that go with it to
// a share sheet, and the nudge toward the avatar page for a visitor without
// one. The visitor is "you" wherever their own player is in the picture.
// House style: polite, no semicolons and no em-dashes.

/** "The catch". */
export function photoTitle(kind) {
    return KIND_NAMES[kind] ? `The ${KIND_NAMES[kind].toLowerCase()}` : 'The photo';
}

/**
 * THE LINE UNDER THE PICTURE, which is also what a screen reader is told the
 * picture is. `visitor` is the slot the visitor's avatar plays, or null.
 */
export function photoCaption(m, visitor = null) {
    const you = (slot) => Boolean(visitor) && slot === visitor;
    // A name at the start of a sentence, and one anywhere else. There is one
    // quarterback, so he is "the" quarterback; receiver B is one of four.
    const name = (slot) => (you(slot) ? 'you'
        : slot === 'qb' ? 'the quarterback' : slotOf(slot).phrase);
    const lead = (slot) => {
        const n = name(slot);
        return n[0].toUpperCase() + n.slice(1);
    };
    const solo = (yours, theirs) => (you(m.hero) ? yours : `${lead(m.hero)} ${theirs}`);
    switch (m.kind) {
        case 'catch': return solo('You make the catch.', 'makes the catch.');
        case 'pick': return solo('You pick it off.', 'picks it off.');
        case 'fifty': return solo('You go in for fifty.', 'goes in for fifty.');
        case 'release': {
            const to = m.partner ? ` to ${name(m.partner)}` : '';
            return solo(`You let it fly${to}.`, `lets it fly${to}.`);
        }
        case 'tackle':
            if (!m.partner) return `${lead(m.hero)} ${you(m.hero) ? 'are' : 'is'} brought down.`;
            if (you(m.partner)) return `You bring down ${name(m.hero)}.`;
            if (you(m.hero)) return `${lead(m.partner)} brings you down.`;
            return `${lead(m.partner)} brings down ${name(m.hero)}.`;
        case 'sack':
            if (!m.partner) return `${lead(m.hero)} ${you(m.hero) ? 'are' : 'is'} sacked.`;
            return you(m.partner)
                ? 'You sack the quarterback.'
                : `${lead(m.partner)} sacks ${you(m.hero) ? 'you' : 'the quarterback'}.`;
        default: return `${lead(m.hero)} in X's and O's.`;
    }
}

const SHARE_LINES = Object.freeze({
    catch: "What a catch in X's and O's!",
    pick: "Picked off in X's and O's!",
    fifty: "Fifty points in X's and O's!",
    tackle: "What a hit in X's and O's!",
    sack: "Sacked in X's and O's!",
    release: "Let it fly in X's and O's!",
});

/** The words that go with the picture to a share sheet, with the address. */
export function photoShareText(kind, url = '') {
    const line = SHARE_LINES[kind] || "A moment from X's and O's.";
    return url ? `${line} ${url}` : line;
}

const NUDGES = Object.freeze({
    catch: 'Want to be the one making the catch?',
    pick: 'Want to be the one picking it off?',
    fifty: 'Want to be the one going in for fifty?',
    tackle: 'Want to be the one making the hit?',
    sack: 'Want to be the one making the sack?',
    release: 'Want to be the one throwing it?',
});

/** For a visitor with no avatar, the moment that lands best: under a picture
 *  of somebody else doing the thing. */
export function photoNudge(kind) {
    return NUDGES[kind] || 'Want to be in the picture?';
}
