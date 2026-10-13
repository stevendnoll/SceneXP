// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * marks.js - The studio's touch points, the pulsing halos over them, and
 * the keyboard's list of them (PLANNING 4.2 and 4.4).
 *
 * FIVE THINGS IN THE ROOM ANSWER A TAP: the concierge's desk, the house
 * model, the service menu, the plan board and the printer. Each is reached
 * three ways that do exactly the same thing (main.js actOn): a tap on it, a
 * tap on its halo, and its row in the stations list or its key.
 *
 * THE HALOS ARE AN ARRIVAL DEVICE, as in Corner Office: one thing stands
 * out at a time. On a first visit only the concierge pulses. Once the
 * visitor has a checklist of their own, the model, the menu and the plan
 * board join it, and once that checklist has a task, the printer. Each halo
 * retires once its own thing has been used, by any route, and all of them
 * once `retireAfter` different things have been. What has been used is kept
 * in the document's settings (`coached`, a bit for each), so a returning
 * visitor is not coached again.
 *
 * Pure: numbers in, numbers out. main.js places the buttons.
 */

/** The touch points, in the order the stations list and the keys give
 *  them: where the camera goes for each, and its key. `overview` is a view,
 *  not a touch point, so it has no halo and no bit. */
export const TOUCH = Object.freeze([
    Object.freeze({ key: 'overview', station: 'overview', hotkey: '1' }),
    Object.freeze({ key: 'desk', station: 'desk', hotkey: '2' }),
    Object.freeze({ key: 'model', station: 'model', hotkey: '3' }),
    Object.freeze({ key: 'menu', station: 'menu', hotkey: '4' }),
    Object.freeze({ key: 'board', station: 'board', hotkey: '5' }),
    Object.freeze({ key: 'printer', station: 'printer', hotkey: '6' })
]);

/** How many different things used retire every halo, and how long before
 *  the pulse slows (a ring strobing over a room somebody is happily looking
 *  at is a nuisance: Auto Man's lesson). */
export const COACHING = Object.freeze({ retireAfter: 3, calmSeconds: 30 });

/** A bit for each touch point, for settings.coached. */
export const USED = Object.freeze({ desk: 1, model: 2, menu: 4, board: 8, printer: 16 });

/** How many different things the bits say have been used. */
export function usedCount(bits) {
    let n = 0;
    for (let b = bits >>> 0; b; b &= b - 1) n++;
    return n;
}

/** The bits with `key` used too (unchanged for a key with no bit). */
export function noteUsed(bits, key) {
    return Object.prototype.hasOwnProperty.call(USED, key) ? (bits | USED[key]) >>> 0 : bits >>> 0;
}

/**
 * The halos still coaching, in TOUCH order. `progress` says how far the
 * visitor has come: `own` (a checklist of their own is open) and `tasks`
 * (it has a task). None once `retireAfter` things have been used.
 */
export function marksShown(bits, progress, coaching = COACHING) {
    if (usedCount(bits) >= coaching.retireAfter) return [];
    const ready = {
        desk: true,
        model: Boolean(progress && progress.own),
        menu: Boolean(progress && progress.own),
        board: Boolean(progress && progress.own),
        printer: Boolean(progress && progress.own && progress.tasks)
    };
    return TOUCH.filter((t) => ready[t.key] && !(bits & USED[t.key])).map((t) => t.key);
}

/** The touch point a key press goes to, or null. Letters are not used, so
 *  typing never moves the camera by surprise. */
export function touchForKey(key) {
    const t = TOUCH.find((x) => x.hotkey === key);
    return t ? t.key : null;
}

/**
 * The level a tap on the model's halo, its row or its key lifts: the next
 * one up from the lifted level, and after the top one, none (the model is
 * put back together). `levels` are the home's, bottom to top.
 */
export function nextLevel(levels, lifted) {
    if (!levels.length) return null;
    const at = levels.indexOf(lifted);
    if (at < 0) return levels[0];
    return at + 1 < levels.length ? levels[at + 1] : null;
}

/** Whether a point projected to the screen (normalized device coordinates)
 *  is in front of the camera and inside the frame, `margin` from its edge. */
export function onScreen(ndc, margin = 0.06) {
    return Number.isFinite(ndc.x) && Number.isFinite(ndc.y) && ndc.z > -1 && ndc.z < 1
        && Math.abs(ndc.x) < 1 - margin && Math.abs(ndc.y) < 1 - margin;
}
