// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * replay.js - A flight recorder for one play.
 *
 * THE REPLAY DOES NOT RE-SIMULATE, IT RECORDS (D6). Running the play again
 * from the same inputs would drift: `generateTeamFormationObject` randomises
 * every player's top speed and acceleration at line-up, and several routes
 * call `getRand`, so a second run of the same play is a different play. A
 * recording cannot drift, which buys three things at once: the replay is
 * exactly what happened, the camera can go anywhere because the motion is
 * already decided, and scrubbing and slow motion are free.
 *
 * PURE. No THREE, no DOM. It stores numbers and hands them back.
 *
 * THE LAYOUT IS A FIXED SLOT TABLE, not the live object list. The ball is
 * pushed into `game.objects` mid-play when somebody throws, so indices into
 * that array mean different things before and after a throw. Slots are keyed by
 * position name once, at the snap, with the ball holding the last slot whether
 * or not it is ever thrown.
 *
 * Roughly 480 bytes a tick for twenty slots, so a twelve second play at 45Hz is
 * about 260KB, held for one play and discarded.
 */

/** x, y, z, xSpeed, ySpeed, and a status. Speeds are recorded rather than a
 *  facing angle so playback can drive view.js through exactly the same code
 *  path the live play uses, instead of a second one that has to agree with it. */
export const STRIDE = 6;

/**
 * THE LAST SLOT IS A STATUS, NOT A BOOLEAN, AND THAT IS THE POINT.
 *
 * It was `present`, 0 or 1, so a recording knew who was on the field and not
 * who was holding the ball. A caught pass leaves the ball object sitting where
 * it was caught with its coordinates intact, so playback went on drawing it
 * lying on the turf while the receiver who caught it ran away empty-handed.
 *
 * Carrying is a third state of the same fact, so it goes in the same float
 * rather than widening a buffer that is already about 260KB a play.
 */
const ABSENT = 0;
const PRESENT = 1;
const CARRYING = 2;
/**
 * AND A FOURTH, BECAUSE `state.run` MATTERS TO THE VIEW TOO.
 *
 * It is the flag the 2D game uses to pick between a quarterback surveying the
 * field and one who has tucked it and taken off (D87), and view.js reads it to
 * choose the pose. The recorder did not store it, so on playback it came back
 * undefined, which is falsy, which means "still looking to throw": every replay
 * of a quarterback keeper showed him running the length of the field with the
 * ball cocked beside his ear.
 *
 * Carrying and running-with-it are two states of the same fact, so this is one
 * more value in the same float rather than a seventh in every slot.
 */
const CARRYING_RUN = 3;

/** Grown in whole plays rather than per tick, so a long play reallocates once
 *  or twice instead of hundreds of times. 45Hz for twelve seconds. */
const CHUNK_TICKS = 540;

let slots = [];          // position name per slot, in a fixed order
let buffer = null;       // Float32Array
let ticks = 0;           // frames recorded
let playhead = 0;        // frames played back

/**
 * Begin recording.
 *
 * `objects` is the roster at the snap. Benched players get slots too: it costs
 * six floats a tick and keeps the table identical for every play, which makes
 * a recording readable without carrying its own key.
 */
export function startRecording(objects) {
    slots = objects.map((o) => o.settings.position);
    if (!slots.includes('ball')) slots.push('ball');
    buffer = new Float32Array(slots.length * STRIDE * CHUNK_TICKS);
    ticks = 0;
    playhead = 0;
    return slots.slice();
}

function ensureRoom() {
    const needed = (ticks + 1) * slots.length * STRIDE;
    if (needed <= buffer.length) return;
    const grown = new Float32Array(buffer.length * 2);
    grown.set(buffer);
    buffer = grown;
}

/** Append the current state of the world. Call once per simulation tick, after
 *  the tick, so frame zero is the world one step after the snap. */
export function record(objects) {
    if (!buffer) return;
    ensureRoom();
    const base = ticks * slots.length * STRIDE;
    // Everything absent by default, so a slot nobody filled this tick reads as
    // absent rather than as wherever it was last seen.
    buffer.fill(0, base, base + slots.length * STRIDE);

    for (const o of objects) {
        const slot = slots.indexOf(o.settings.position);
        if (slot === -1) continue;
        const i = base + slot * STRIDE;
        buffer[i] = o.coords.x;
        buffer[i + 1] = o.coords.y;
        buffer[i + 2] = o.coords.z || 0;
        buffer[i + 3] = (o.state && o.state.xSpeed) || 0;
        buffer[i + 4] = (o.state && o.state.ySpeed) || 0;
        buffer[i + 5] = o.settings.benched ? ABSENT
            : (!(o.state && o.state.hasBall) ? PRESENT
                : (o.state.run ? CARRYING_RUN : CARRYING));
    }
    ticks += 1;
}

export function frameCount() {
    return ticks;
}

export function slotNames() {
    return slots.slice();
}

/**
 * Read one recorded frame back into objects shaped the way view.js expects.
 *
 * The objects are rebuilt rather than mutated in place so a replay can never
 * disturb the live simulation it was recorded from, which is the one way a
 * flight recorder could still manage to lie.
 */
export function frameAt(index, teamOf) {
    if (!buffer || ticks === 0) return [];
    const f = Math.max(0, Math.min(ticks - 1, Math.floor(index)));
    const base = f * slots.length * STRIDE;
    const out = [];
    for (let s = 0; s < slots.length; s += 1) {
        const i = base + s * STRIDE;
        const position = slots[s];
        out.push({
            settings: {
                position,
                team: teamOf ? teamOf(position) : 0,
                benched: buffer[i + 5] === ABSENT,
            },
            coords: { x: buffer[i], y: buffer[i + 1], z: buffer[i + 2] },
            state: {
                xSpeed: buffer[i + 3],
                ySpeed: buffer[i + 4],
                hasBall: buffer[i + 5] === CARRYING || buffer[i + 5] === CARRYING_RUN,
                run: buffer[i + 5] === CARRYING_RUN,
            },
        });
    }
    return out;
}

/** Where the ball, or whoever is carrying it, was on this frame. The camera
 *  follows this. Falls back to the quarterback so a caller never null-checks. */
export function focusAt(index) {
    const frame = frameAt(index);
    // WHOEVER IS HOLDING IT COMES FIRST. The ball object stops where it was
    // caught and keeps its coordinates, so asking it first left the camera
    // aimed at the spot of the catch while the man who made it ran out of shot.
    const carrier = frame.find((o) => o.state.hasBall && !o.settings.benched);
    if (carrier) return carrier.coords;
    const ball = frame.find((o) => o.settings.position === 'ball' && !o.settings.benched);
    if (ball && (ball.coords.x || ball.coords.y)) return ball.coords;
    const qb = frame.find((o) => o.settings.position === 'qb');
    return qb ? qb.coords : { x: 0, y: 0, z: 0 };
}

// ---- Playback --------------------------------------------------------------

export function rewind() {
    playhead = 0;
}

/** Advance the playhead by `delta` seconds at `hz`, and say whether the
 *  recording has run out. `speed` below 1 is slow motion. */
export function advance(delta, hz, speed = 1) {
    playhead += delta * hz * speed;
    return playhead >= ticks;
}

export function playheadFrame() {
    return playhead;
}

export function isEmpty() {
    return ticks === 0;
}

/** Throw the recording away. One play is held at a time and no more. */
export function discard() {
    buffer = null;
    slots = [];
    ticks = 0;
    playhead = 0;
}
