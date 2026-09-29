// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * celebrate.js - What the office celebrates (QA, 2026-09-29: Steve, "the
 * mere act of applying should be cause for a celebration").
 *
 * APPLYING IS THE WIN. A job search is mostly silence, and the only part
 * of it anyone controls is the applying, so every application sent gets its
 * moment: a firework over the bay and a word of it. The moments are tiered,
 * so the big ones still feel big: reaching the week's goal sets off a
 * volley, and an offer the whole show, with champagne on the desk for the
 * day (main.js, world.js, room.js).
 *
 * ONLY WHAT THE VISITOR DID. main.js asks after its own deliberate changes
 * (the forms, the pinboard, the status menu, an offer logged), never after
 * an undo, a restore or the samples being stocked, and the samples
 * themselves are never celebrated.
 *
 * Pure: two documents in, a celebration (or null) out.
 */

import { weekly } from './derive.min.js';

/** The statuses that mean an application is out in the world, sent and
 *  still in play (entering one from saved, or arriving in one, is applying),
 *  and the ones that mean an offer. */
export const SENT = ['applied', 'screening', 'interviewing'];
export const OFFERS = ['offer', 'accepted'];

/** The office's own name for an application, for the words. */
const nameOf = (a) => a.company || a.role || 'them';

/**
 * What a change from `before` to `after` deserves, or null: `{ kind, apps,
 * week, line }`, `kind` one of 'offer', 'goal' and 'applied', the biggest
 * that applies. `line` is the words, said and shown with the change.
 */
export function celebrationFor(before, after, config, now) {
    const was = new Map(before.applications.map((a) => [a.id, a]));
    const applied = [];
    const offers = [];
    for (const a of after.applications) {
        if (a.deletedAt || a.sample) continue;
        const prev = was.get(a.id);
        // Back out of the wastebasket is not news.
        if (prev && prev.deletedAt) continue;
        const from = prev ? prev.status : null;
        if (OFFERS.includes(a.status) && !OFFERS.includes(from)) offers.push(a);
        else if (SENT.includes(a.status) && (!prev || from === 'saved')) applied.push(a);
    }
    const week = weekly(after, now);
    if (offers.length) {
        const a = offers[0];
        const line = a.status === 'accepted'
            ? `You accepted the offer from ${nameOf(a)}. Congratulations!`
            : `An offer from ${nameOf(a)}. Congratulations!`;
        return { kind: 'offer', apps: offers, week, line };
    }
    if (!applied.length) return null;
    const before7 = weekly(before, now);
    if (before7.count < week.goal && week.count >= week.goal) {
        return { kind: 'goal', apps: applied, week, line: `That makes ${week.count} this week, your weekly goal. Wonderful work!` };
    }
    let line;
    if (applied.length > 1) line = `${applied.length} applications sent. That's ${week.count} this week.`;
    else if (week.count <= 1) line = `Application sent. That's your first this week.`;
    else if (week.remaining > 0) line = `Application sent. That's ${week.count} this week, ${week.remaining} to go.`;
    else line = `Application sent. That's ${week.count} this week.`;
    return { kind: 'applied', apps: applied, week, line };
}

/** The same local day. */
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/**
 * Whether there is champagne on the desk: an application reached an offer
 * (or was accepted) today, by the time its status last changed (or it was
 * made, for one entered already at an offer).
 */
export function champagneToday(doc, now) {
    return doc.applications.some((a) => {
        if (a.deletedAt || !OFFERS.includes(a.status)) return false;
        const at = a.statusAt || a.createdAt;
        return Boolean(at) && sameDay(new Date(at), now);
    });
}
