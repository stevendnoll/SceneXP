// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * rolodex.js - The people: recruiters, hiring managers, interviewers,
 * referrals. What the Rolodex on the desk shows, and how it turns.
 *
 * THE WHEEL IS AN INDEX, NOT A LIST. It holds one lettered card for every
 * letter, A to Z and # for anything else, and turns to the letter of the
 * person being looked for. The people themselves are read in the sheet below
 * it, as text, because a wheel of tiny cards cannot be read aloud.
 *
 * A PERSON IS LINKED THROUGH APPLICATIONS AND EVENTS. `linksOf` gathers both,
 * so a recruiter linked to one application and met at an interview on
 * another shows under both.
 *
 * Pure. room.js builds the wheel from `ringQuad` and main.js turns it.
 */

import { fold } from './query.min.js';
import { buildIndex, live } from './derive.min.js';

export const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#'];

/** The atlas the lettered cards are painted into: 9 cells across, 3 down. */
export const LETTER_ATLAS = { cols: 9, rows: 3 };

/** The letter a name files under: its first letter, accents folded, or #. */
export function letterOf(name) {
    const ch = fold(name).trim().charAt(0).toUpperCase();
    return /[A-Z]/.test(ch) ? ch : '#';
}

export function letterIndex(letter) {
    const i = LETTERS.indexOf(letter);
    return i < 0 ? LETTERS.length - 1 : i;
}

/** Where card `i` stands around the axle, in radians. */
export function cardAngle(i, n = LETTERS.length) {
    return (i * 2 * Math.PI) / n;
}

/** The wheel's turn that brings card `i` round to face `facing`. */
export function spinTo(i, facing, n = LETTERS.length) {
    return facing - cardAngle(i, n);
}

/** `target` plus whole turns, whichever is nearest `current`, so the wheel
 *  always takes the short way round. */
export function nearestTurn(current, target) {
    const full = 2 * Math.PI;
    return target + full * Math.round((current - target) / full);
}

/**
 * Card `i`'s four corners in the wheel's own frame, where the axle runs
 * along x: `[x, y, z]`, bottom left, bottom right, top right, top left as
 * seen looking at the card's face. A card stands radially, its inner edge at
 * `inner` and its outer (lettered) edge at `outer`.
 */
export function ringQuad(i, { width, inner, outer }, n = LETTERS.length) {
    const a = cardAngle(i, n);
    const dy = Math.cos(a);
    const dz = Math.sin(a);
    const hw = width / 2;
    const at = (x, r) => [x, r * dy, r * dz];
    return [at(-hw, inner), at(hw, inner), at(hw, outer), at(-hw, outer)];
}

/** Card `i`'s cell of the letter atlas, in quad order. */
export function ringUvs(i, atlas = LETTER_ATLAS) {
    const col = i % atlas.cols;
    const row = Math.floor(i / atlas.cols);
    const u0 = col / atlas.cols;
    const u1 = (col + 1) / atlas.cols;
    const v1 = 1 - row / atlas.rows;
    const v0 = 1 - (row + 1) / atlas.rows;
    return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
}

/** "Senior Recruiter at Brightkettle", or whichever half there is. */
export function contactLine(c) {
    if (!c) return '';
    if (c.title && c.company) return `${c.title} at ${c.company}`;
    return c.title || c.company || '';
}

/** The People cell of the grid: "Priya Anand", "Priya Anand and Lena
 *  Fischer", or "Priya Anand, Lena Fischer and 2 more". */
export function peopleText(names) {
    if (!names.length) return '';
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

/** The live contacts an application is linked to, in link order. */
export function peopleOf(doc, app, index = buildIndex(doc)) {
    return app.contactIds.map((id) => index.contactsById.get(id)).filter(Boolean);
}

/**
 * Everything a person is part of: the live applications they are linked to
 * directly or through an event, and the events they were at, soonest last.
 */
export function linksOf(doc, contactId, index = buildIndex(doc)) {
    const apps = new Map();
    const events = [];
    for (const app of doc.applications) {
        if (!live(app)) continue;
        if (app.contactIds.includes(contactId)) apps.set(app.id, app);
        for (const ev of index.events(app.id)) {
            if (ev.withContactIds.includes(contactId)) {
                events.push(ev);
                apps.set(app.id, app);
            }
        }
    }
    events.sort((a, b) => (a.at || '').localeCompare(b.at || ''));
    return { applications: [...apps.values()], events };
}

/** Whether an application involves a person, directly or through an event. */
export function involves(app, contactId, index) {
    if (app.contactIds.includes(contactId)) return true;
    return index.events(app.id).some((ev) => ev.withContactIds.includes(contactId));
}
