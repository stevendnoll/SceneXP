// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * celebrate.js - every last leaf off the lawn, with no clock (Steve's QA,
 * 2026-10-08: "Should we add a celebration if a user clears 100% of the
 * yard? I think yes, and we should show it even if there is no time limit.").
 *
 * In a round the dive is the celebration, and clearing every leaf goes
 * straight to it (round.js). In free play there is no dive, so the moment
 * the last leaf leaves the lawn the person sets the blower down, turns to
 * the street, throws both arms up and hops twice, the view eases in on them
 * and the clean lawn, a chime rings and a line says so. Then the yard is
 * theirs again. A tap or a key ends it early.
 *
 * NEVER THE NEIGHBOR (Steve: when he comes out "he really competes for the
 * camera"). He stays in while it plays, and the view leaves him out.
 *
 * ONCE A FREE SESSION, and only after leaves have lain on the lawn in it:
 * Keep blowing after a round that cleared the yard does not celebrate again
 * for the same clean lawn, and a trick-or-treater kicking a leaf back in and
 * the visitor blowing it out again is not a second party.
 *
 * PURE: main.js steps it and draws what it says.
 */

/** The line on screen when it happens (house style: no em dashes, no
 *  semicolons). */
export const CHEER_LINE = 'Not a leaf in sight. The lawn is spotless.';

export function createCheer() {
    return { phase: 'idle', t: 0, armed: false, done: false };
}

/** A new free session (or a new yard): ready to celebrate once more. */
export function resetCheer(c) {
    c.phase = 'idle';
    c.t = 0;
    c.armed = false;
    c.done = false;
    return c;
}

export function isCheering(c) {
    return c.phase === 'cheer';
}

/**
 * Advance by `dt` seconds. `input` is { free, spotless }: whether this is
 * free play with the yard in view, and whether every leaf is off the lawn.
 * Returns 'start', 'end' or null. `K` is config.cheer.
 */
export function stepCheer(c, dt, input, K) {
    if (c.phase === 'cheer') {
        c.t += dt > 0 ? dt : 0;
        if (c.t >= K.seconds) {
            c.phase = 'idle';
            c.done = true;
            return 'end';
        }
        return null;
    }
    if (!input.free) return null;
    if (!input.spotless) {
        c.armed = true;
        return null;
    }
    if (c.armed && !c.done) {
        c.phase = 'cheer';
        c.t = 0;
        return 'start';
    }
    return null;
}

/** A tap or a key: the celebration ends now. Returns whether one was on. */
export function skipCheer(c) {
    if (c.phase !== 'cheer') return false;
    c.phase = 'idle';
    c.done = true;
    return true;
}

/** How high the person is off the lawn at `t` seconds in: `hops` little
 *  hops, `hop` meters high, `hopTime` seconds each, then still. None under
 *  reduced motion. */
export function cheerLift(t, K, reduced = false) {
    if (reduced || t < 0 || t >= K.hops * K.hopTime) return 0;
    const u = (t % K.hopTime) / K.hopTime;
    return K.hop * 4 * u * (1 - u);
}

/** Where the view looks while it plays: between the person and the middle
 *  of the lawn, so both are in it. */
export function cheerFocus(person, lawn) {
    const cx = (lawn.minX + lawn.maxX) / 2;
    const cz = (lawn.minZ + lawn.maxZ) / 2;
    return { x: (person.x + cx) / 2, z: (person.z + cz) / 2 };
}
