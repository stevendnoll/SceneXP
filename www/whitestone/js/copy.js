// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * copy.js - Every sentence a visitor reads in Whitestone Home Care, in one
 * place (PLANNING 3.1), so a single test can hold all of it to house style:
 * no em dashes, no semicolons, American spelling, and the voice of a calm,
 * precise host who states facts rather than adjectives (PRD 4).
 *
 * The modules return CODES (sheet.js `checkChoice`, schedule.js
 * `checkBooking`, guards.js), and this file turns each code into words. A
 * code with no sentence is a test failure, not a blank on screen.
 *
 * Lines that need a number are functions. `allCopy` calls each one with a
 * sample so the sweep reads the finished sentence.
 *
 * Pure.
 */

export const BRAND = Object.freeze({
    name: 'Whitestone Home Care',
    tagline: 'Bright homes, kept with care.',
    promise: 'You will never pay more than your quote without approving it first. Anything we skip comes off your bill.',
    /** Until Whitestone takes real customers (PRD 4). */
    honesty: 'Whitestone Home Care is a SceneXP concept studio. Prices and bookings are examples.',
    exampleBooking: 'This is an example booking. No one will arrive.'
});

/** sheet.js `checkChoice` and pricing.js codes. */
export const ITEM_ERRORS = Object.freeze({
    'unknown-task': 'That task is not on the current service menu.',
    'not-offered': 'That task is not offered in this kind of room.',
    'bad-options': 'Those options could not be read. Please choose them again.',
    'unknown-option': 'That option is not available for this task.',
    'repeated-option': 'That option is already chosen.',
    'size-not-allowed': 'This task is not priced by room size.',
    'bad-size': 'Please choose small, medium or large.',
    'quantity-not-allowed': 'This task is priced once, not per item.',
    'bad-quantity': 'Please choose a quantity from 1 to 50.',
    'unknown-room': 'That room is no longer on the checklist.',
    'unknown-item': 'That task is no longer on the checklist.',
    'empty-upgrade': 'Please choose an option to add.',
    'wrong-sheet': 'This report was priced on a different service menu.'
});

/** schedule.js `checkBooking` codes. */
export const BOOKING_ERRORS = Object.freeze({
    'bad-request': 'Please choose a day and a start time.',
    closed: 'Whitestone is closed that day.',
    holiday: 'Whitestone is closed that day for a holiday.',
    'too-far': 'That day is further ahead than visits can be booked.',
    'before-open': 'That time is before opening.',
    'off-step': 'Please choose one of the listed start times.',
    'no-such-time': 'That time does not happen that day, because the clocks change.',
    'too-soon': 'That time is too soon to book. Please choose a later one.',
    'after-close': 'The visit would run past closing. Please choose an earlier time.',
    taken: 'That time was just taken. Here are the next openings.'
});

/** schedule.js `monthView` statuses, as the calendar labels a day. */
export const DAY_STATUS = Object.freeze({
    open: 'Open',
    full: 'Fully booked',
    closed: 'Closed',
    holiday: 'Closed for a holiday',
    'too-soon': 'Too soon to book',
    'too-far': 'Not yet bookable'
});

/** store.js refusals. */
export const STORE = Object.freeze({
    noChecklist: 'That checklist is no longer here.',
    checklistRemoved: 'That checklist was removed. Please restore it first.',
    tooManyChecklists: (n) => `You can keep up to ${n} checklists on this device.`,
    noRoom: 'That room is no longer on the checklist.',
    roomRemoved: 'That room was removed. Please restore it first.',
    tooManyRooms: (n) => `A checklist can have up to ${n} rooms.`,
    badLevel: 'Please choose a level for this room.',
    badArea: 'Please choose what kind of room this is.',
    levelInUse: 'That level still has rooms. Please move or remove them first.',
    noLevels: 'A home needs at least one level.',
    noItem: 'That task is no longer on the checklist.',
    itemRemoved: 'That task was removed. Please restore it first.',
    tooManyItems: (n) => `A checklist can have up to ${n} tasks.`,
    tooManyPhotos: (n) => `A task can have up to ${n} photos.`,
    tooManyChecklistPhotos: (n) => `A checklist can have up to ${n} photos.`,
    roomOfRemovedRoom: 'Its room was removed too. Please restore the room first.'
});

/** What the page says about saving, under the studio's storage note. */
export const STORAGE_NOTES = Object.freeze({
    unavailable: 'This browser is not saving, perhaps because it is a private window. Your checklist will be gone when you leave.',
    newer: 'Your saved checklists were made by a newer version of this page, so they are left untouched. Please reload for the latest version.',
    unreadable: 'Your saved checklists could not be read, so they are left untouched.',
    nearlyFull: 'This browser is nearly out of room for saved checklists. Removing an old one makes space.'
});

/** guards.js hints: gentle, and never blocking. */
export const GUARDS = Object.freeze({
    code: 'For your safety, please share door, alarm and gate codes with your cleaner directly rather than here.',
    'hidden-key': 'For your safety, please tell your cleaner where a spare key is directly rather than here.',
    health: 'There is no need to share health details. A preference such as fragrance-free products is enough, and anything written here is shared with your cleaner.'
});

/** The cleaner's page. */
export const TASKS_PAGE = Object.freeze({
    incomplete: 'Please enter all 6 digits of the PIN.',
    preview: 'Thank you. Shared checklists open here once Whitestone Home Care is live. This page is a preview.'
});

/** The calendar file for a booked visit (ics.js). */
export const CALENDAR = Object.freeze({
    summary: 'Whitestone Home Care visit',
    description: 'Your cleaning visit from Whitestone Home Care.'
});

/** Every string above, with each function called on a sample, for the
 *  house-style sweep. */
export function allCopy() {
    const out = [];
    const walk = (value, where) => {
        if (typeof value === 'string') out.push({ where, text: value });
        else if (typeof value === 'function') out.push({ where, text: value(12) });
        else if (value && typeof value === 'object') Object.entries(value).forEach(([k, v]) => walk(v, `${where}.${k}`));
    };
    walk({ BRAND, ITEM_ERRORS, BOOKING_ERRORS, DAY_STATUS, STORE, STORAGE_NOTES, GUARDS, TASKS_PAGE, CALENDAR }, 'copy');
    return out;
}
