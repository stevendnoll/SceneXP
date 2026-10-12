// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * pricing.js - The quote, the bill, and how money and time are written
 * (PRD 9, PLANNING 5.1 to 5.3).
 *
 * INTEGER CENTS, INTEGER MINUTES, INTEGER PERCENTS. Every amount here is a
 * whole number, and the one division (by a size factor) rounds half up to the
 * whole cent or minute, so there is no floating-point drift and the customer's
 * browser and the cleaner's page always agree to the cent.
 *
 *   unitCents   = task.cents   + the chosen options' cents for that task
 *   unitMinutes = task.minutes + the chosen options' minutes
 *   factor      = the sheet's size percent, for tasks priced by room size
 *   itemCents   = round(unitCents   * factor / 100) * quantity
 *   itemMinutes = round(unitMinutes * factor / 100) * quantity
 *
 * THE GUARANTEE IS ARITHMETIC (PRD 9.6). The bill counts only tasks marked
 * done and approved add-ons marked done, each at most once, plus the quote's
 * agreed minimum top-up only when something was done. So it can never exceed
 * the locked quote plus approved add-ons, skipping a task can never raise it,
 * and a visit where nothing was done costs nothing. The property tests hold
 * all three across thousands of random homes.
 *
 * ITEMS STORE CHOICES, NEVER PRICES. Everything here is computed from the
 * sheet, which is the one source of truth.
 *
 * Pure.
 */

import { taskOf, checkChoice } from './sheet.min.js';

/** n / d rounded half up, for whole numbers n >= 0 and d > 0. */
export function roundHalfUp(n, d) {
    return Math.floor((2 * n + d) / (2 * d));
}

/** Whether an item is still on the checklist (not soft-deleted). */
export function isLive(item) {
    return Boolean(item) && !item.deletedAt;
}

/**
 * The price and minutes of one task as chosen, in an area: { cents, minutes }
 * or { error } with a code from sheet.js `checkChoice`.
 */
export function priceChoice(sheet, choice, area) {
    const error = checkChoice(sheet, choice, area);
    if (error) return { error };
    const task = taskOf(sheet, choice.task);
    let unitCents = task.cents;
    let unitMinutes = task.minutes;
    for (const key of choice.options || []) {
        const option = task.options.find((o) => o.key === key);
        unitCents += option.cents;
        unitMinutes += option.minutes;
    }
    const factor = task.unit === 'room' ? sheet.sizes[choice.size || 'medium'] : 100;
    const quantity = task.unit === 'count' ? (choice.quantity || 1) : 1;
    return {
        cents: roundHalfUp(unitCents * factor, 100) * quantity,
        minutes: roundHalfUp(unitMinutes * factor, 100) * quantity
    };
}

/** One checklist item, priced in its room's area. */
export function priceItem(sheet, item, rooms) {
    const room = (rooms || []).find((r) => r.id === item.roomId);
    if (!room) return { error: 'unknown-room' };
    return priceChoice(sheet, item, room.area);
}

/** Minutes rounded to the nearest 5 for display, and never to zero when
 *  there is any work at all. */
export function roundMinutes(minutes) {
    if (minutes <= 0) return 0;
    return Math.max(5, roundHalfUp(minutes, 5) * 5);
}

/**
 * The quote for a checklist: every live item priced, and the totals.
 *
 *   { sheetVersion, lines: [{ itemId, cents, minutes }], errors: [{ itemId, error }],
 *     subtotalCents, topUpCents, totalCents, minutes, displayMinutes }
 *
 * An item that cannot be priced (an option the task does not accept, a size
 * on a task priced by the each, an unknown task) is never priced silently:
 * it is left out of the totals and listed in `errors`, so the studio can
 * point at it.
 */
export function quoteChecklist(sheet, doc) {
    const lines = [];
    const errors = [];
    let subtotal = 0;
    let minutes = 0;
    for (const item of (doc && doc.items) || []) {
        if (!isLive(item)) continue;
        const price = priceItem(sheet, item, doc.rooms);
        if (price.error) {
            errors.push({ itemId: item.id, error: price.error });
            continue;
        }
        lines.push({ itemId: item.id, cents: price.cents, minutes: price.minutes });
        subtotal += price.cents;
        minutes += price.minutes;
    }
    const topUp = lines.length ? Math.max(0, sheet.visitMinimumCents - subtotal) : 0;
    return {
        sheetVersion: sheet.version,
        lines,
        errors,
        subtotalCents: subtotal,
        topUpCents: topUp,
        totalCents: subtotal + topUp,
        minutes,
        displayMinutes: roundMinutes(minutes)
    };
}

/** The quote as it is locked at publishing (PRD 11.1): totals only. */
export function lockQuote(quote, at) {
    return {
        sheetVersion: quote.sheetVersion,
        subtotalCents: quote.subtotalCents,
        topUpCents: quote.topUpCents,
        totalCents: quote.totalCents,
        minutes: quote.minutes,
        lockedAt: at
    };
}

/**
 * The bill for one visit (PRD 9.6), priced against the LOCKED quote's sheet
 * version, which `sheet` must be.
 *
 *   published  { rooms, items } as the cleaner received them
 *   visit      { results: [{ itemId, status }], addOns: [...] }
 *
 * An add-on is either a new task in a room ({ roomId, task, options, size,
 * quantity }) or an option upgrade of an item already on the list ({ itemId,
 * options }), and counts only when `status` is approved and `done` is true.
 *
 *   { doneCents, addOnCents, topUpCents, billedCents, errors }
 */
export function billVisit(sheet, quote, published, visit) {
    if (!quote || quote.sheetVersion !== sheet.version) {
        return { doneCents: 0, addOnCents: 0, topUpCents: 0, billedCents: 0, errors: [{ error: 'wrong-sheet' }] };
    }
    const rooms = (published && published.rooms) || [];
    const items = new Map(((published && published.items) || []).filter(isLive).map((i) => [i.id, i]));
    const errors = [];

    let doneCents = 0;
    const counted = new Set();
    for (const r of (visit && visit.results) || []) {
        if (!r || r.status !== 'done' || counted.has(r.itemId)) continue;
        const item = items.get(r.itemId);
        if (!item) { errors.push({ itemId: r.itemId, error: 'unknown-item' }); continue; }
        const price = priceItem(sheet, item, rooms);
        if (price.error) { errors.push({ itemId: r.itemId, error: price.error }); continue; }
        counted.add(r.itemId);
        doneCents += price.cents;
    }

    let addOnCents = 0;
    let addOnsDone = 0;
    const seenAddOns = new Set();
    for (const a of (visit && visit.addOns) || []) {
        if (!a || a.status !== 'approved' || a.done !== true || seenAddOns.has(a.id)) continue;
        seenAddOns.add(a.id);
        const price = priceAddOn(sheet, a, rooms, items);
        if (price.error) { errors.push({ addOnId: a.id, error: price.error }); continue; }
        addOnCents += price.cents;
        addOnsDone++;
    }

    const topUp = counted.size || addOnsDone ? quote.topUpCents : 0;
    return {
        doneCents,
        addOnCents,
        topUpCents: topUp,
        billedCents: doneCents + addOnCents + topUp,
        errors
    };
}

/** What one add-on adds: { cents, minutes } or { error }. */
export function priceAddOn(sheet, addOn, rooms, items) {
    if (addOn.itemId !== undefined && addOn.itemId !== null) {
        // An upgrade: the item with the new options, less the item as it was.
        const item = items instanceof Map ? items.get(addOn.itemId) : null;
        if (!item) return { error: 'unknown-item' };
        const extra = Array.isArray(addOn.options) ? addOn.options : [];
        if (!extra.length) return { error: 'empty-upgrade' };
        const before = priceItem(sheet, item, rooms);
        if (before.error) return before;
        const after = priceItem(sheet, { ...item, options: [...(item.options || []), ...extra] }, rooms);
        if (after.error) return after;
        return { cents: after.cents - before.cents, minutes: after.minutes - before.minutes };
    }
    const room = (rooms || []).find((r) => r.id === addOn.roomId);
    if (!room) return { error: 'unknown-room' };
    return priceChoice(sheet, addOn, room.area);
}

// ---- On screen --------------------------------------------------------------

function grouped(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** "$12.50", and "$186" when there are no cents. */
export function formatMoney(cents) {
    const sign = cents < 0 ? '-' : '';
    const abs = Math.abs(Math.round(cents));
    const dollars = Math.floor(abs / 100);
    const rest = abs % 100;
    return `${sign}$${grouped(dollars)}${rest ? `.${String(rest).padStart(2, '0')}` : ''}`;
}

/** Money as a screen reader should say it: "186 dollars", "12 dollars and
 *  50 cents", "1 dollar", "50 cents". */
export function spokenMoney(cents) {
    const abs = Math.abs(Math.round(cents));
    const dollars = Math.floor(abs / 100);
    const rest = abs % 100;
    const d = `${grouped(dollars)} dollar${dollars === 1 ? '' : 's'}`;
    const c = `${rest} cent${rest === 1 ? '' : 's'}`;
    const said = !rest ? d : !dollars ? c : `${d} and ${c}`;
    return cents < 0 ? `minus ${said}` : said;
}

/** "about 2 hours 35 minutes", rounded to the nearest 5 minutes. */
export function formatMinutes(minutes) {
    const r = roundMinutes(minutes);
    if (!r) return '0 minutes';
    const h = Math.floor(r / 60);
    const m = r % 60;
    const parts = [];
    if (h) parts.push(`${h} hour${h === 1 ? '' : 's'}`);
    if (m) parts.push(`${m} minutes`);
    return `about ${parts.join(' ')}`;
}
