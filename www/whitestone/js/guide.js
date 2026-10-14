// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * guide.js - Maya's guided first visit (PLANNING 4.2, ONBOARDING section 5):
 * which scene the visitor is in, what moves them on, and what Maya says.
 *
 * ONE NEXT STEP AT A TIME. Each scene is one or two short sentences, at
 * most two buttons, and for the floors a set of choices, so a first-time
 * visitor always knows the one thing to do next:
 *
 *   hello      the greeting: Let's start, or Show me an example
 *   home       what kind of home: a house, a townhome, a condo
 *   attached   a townhome's neighbors: an end unit, or between two
 *   floors     tick the floors the home has; each rises on the house
 *   firstRoom  add the kitchen in one tap, or choose another room
 *   added      the room and its price, from the price sheet
 *   dots       what the blue dots are
 *   rooms      the rest of the home, then review
 *   review     the quote, and care preferences offered once
 *   saved      all set
 *
 * and beside them the example's three beats (example1 to example3, then
 * look), a returning visitor's welcome, a hint, and About.
 *
 * EVENTS, NOT TIMERS, MOVE IT ON, and they come from wherever the visitor
 * acts: a button in the bubble, a card, the house, the keyboard. A room
 * added through the room card counts as much as the kitchen added from the
 * bubble. Nudges (a pulse, then the same hint in other words, then
 * nothing) are the bubble's to time (host.js).
 *
 * Pure: no DOM, no clock, no store. main.js carries out what a scene needs
 * (making the checklist, opening a floor) and saves where the guide is in
 * the document's settings, so a visitor who leaves mid-build is offered
 * Keep going when they return.
 */

import { GUIDE, BRAND } from './copy.min.js';
import { presetFor } from './sheet.min.js';
import { priceChoice, formatMoney } from './pricing.min.js';

/** The scenes of the first build, in order. Where the visitor is among
 *  these is saved, and offered again on a return. */
export const GUIDED = Object.freeze(['home', 'attached', 'floors', 'firstRoom', 'added', 'dots', 'rooms', 'review']);

/** Which step of the progress strip each guided scene is on: Home type
 *  (with a townhome's neighbors), Floors, First room, Your rooms, Review. */
export const PROGRESS = Object.freeze({ home: 0, attached: 0, floors: 1, firstRoom: 2, added: 2, dots: 2, rooms: 3, review: 4 });

/** Scenes that sit over another for a moment and go back to it. */
const ASIDE = ['hint', 'about'];

/** Scenes a Skip can end: the guided ones. The greeting and the example
 *  have their own ways on. */
const SKIPPABLE = GUIDED;

/**
 * The checklist on the turntable when the visitor arrives: the one open
 * when they left, else their own most recently changed, else the example,
 * else none. Only live checklists count.
 */
export function arrivalId(doc) {
    const live = (doc.checklists || []).filter((c) => !c.deletedAt);
    const current = live.find((c) => c.id === doc.settings.activeId);
    if (current) return current.id;
    const own = live.filter((c) => !c.sample)
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    if (own.length) return own[0].id;
    const example = live.find((c) => c.sample);
    return example ? example.id : null;
}

/** Whether the visitor has a checklist of their own (not the example). */
export function hasOwn(doc) {
    return (doc.checklists || []).some((c) => !c.deletedAt && !c.sample);
}

/**
 * Where a visit begins. Someone without a checklist of their own is
 * greeted. Someone with one is welcomed back, and offered the scene they
 * stopped at if they left in the middle of the first build.
 */
export function arrivalGuide(doc) {
    const saved = doc.settings && doc.settings.guide;
    const reviewed = Boolean(saved && saved.reviewed);
    if (!hasOwn(doc)) return { scene: 'hello', resume: null, reviewed, back: null, tapped: false, rooms: 0 };
    const resume = saved && GUIDED.includes(saved.scene) ? saved.scene : null;
    return { scene: 'welcome', resume, reviewed, back: null, tapped: false, rooms: 0 };
}

/** What is saved in the document's settings: the scene of the first build
 *  the visitor is at (or done), and whether they reached the review. */
export function savedForm(guide) {
    const scene = GUIDED.includes(guide.scene) ? guide.scene
        : guide.scene === 'welcome' && guide.resume ? guide.resume : 'done';
    return { scene, reviewed: Boolean(guide.reviewed) };
}

/**
 * The guide after an event. Unknown events, and events a scene does not
 * answer, leave it as it was (the same object, so a caller can tell).
 *
 *   start, example         from the greeting
 *   residence              a kind of home chosen ({ kind }: a townhome is
 *                          asked once more), or a townhome's neighbors
 *   back                   back to the kind of home, from its follow-up or
 *                          the floors, to change it (QA, 2026-10-14)
 *   floorTapped, next      the floors, and moving on from them
 *   roomAdded              a room was added, by any route
 *   dotOpened, gotIt       the dots
 *   review, saved          the end of the first build
 *   buildOwn, lookAround   from the example
 *   keepGoing              a returning visitor picks up where they stopped
 *   homeMade               a checklist made outside the guide (the setup
 *                          card): straight on to the first room
 *   again, about, close    the Help menu, and closing what it opened
 *   restart, skip          start over, or leave the guide
 */
export function step(guide, event) {
    const g = guide;
    const to = (scene, extra = {}) => ({ ...g, scene, ...extra });
    const type = event && event.type;
    if (type === 'restart') return to('hello', { back: null, tapped: false, rooms: 0, resume: null, answered: false, attachedAnswered: false });
    if (type === 'about') return ASIDE.includes(g.scene) ? g : to('about', { back: g.scene });
    if (type === 'again') {
        if (g.scene === 'done' || g.scene === 'look' || g.scene === 'saved') return to('hint', { back: g.scene });
        return g;
    }
    if (type === 'close' && ASIDE.includes(g.scene)) return to(g.back || 'done', { back: null });
    if (type === 'skip' && SKIPPABLE.includes(g.scene)) return to('done');
    if (type === 'homeMade' && ['hello', 'example1', 'example2', 'example3', 'look'].includes(g.scene)) return to('firstRoom');
    switch (g.scene) {
    case 'hello':
        if (type === 'start') return to('home');
        if (type === 'example') return to('example1');
        return g;
    case 'home':
        if (type === 'residence') return event.kind === 'townhome' ? to('attached', { answered: true }) : to('floors', { tapped: false, answered: true });
        return g;
    case 'attached':
        if (type === 'residence') return to('floors', { tapped: false, attachedAnswered: true });
        if (type === 'back') return to('home');
        return g;
    case 'floors':
        if (type === 'back') return to('home');
        if (type === 'floorTapped') return g.tapped ? g : to('floors', { tapped: true });
        if (type === 'next') return to('firstRoom');
        if (type === 'roomAdded') return to('added', { roomId: event.roomId || null });
        return g;
    case 'firstRoom':
        if (type === 'roomAdded') return to('added', { roomId: event.roomId || null });
        return g;
    case 'added':
        if (type === 'next') return to('dots');
        if (type === 'dotOpened') return to('rooms');
        if (type === 'roomAdded') return to('rooms', { rooms: g.rooms + 1 });
        return g;
    case 'dots':
        if (type === 'gotIt' || type === 'dotOpened') return to('rooms');
        if (type === 'roomAdded') return to('rooms', { rooms: g.rooms + 1 });
        return g;
    case 'rooms':
        if (type === 'roomAdded') return to('rooms', { rooms: g.rooms + 1 });
        if (type === 'review') return to('review');
        return g;
    case 'review':
        if (type === 'saved') return to('saved', { reviewed: true });
        return g;
    case 'saved':
        if (type === 'lookAround') return to('done');
        return g;
    case 'example1':
        return type === 'next' ? to('example2') : g;
    case 'example2':
        return type === 'next' ? to('example3') : g;
    case 'example3':
    case 'look':
        if (type === 'buildOwn') return to('home');
        if (type === 'lookAround' && g.scene === 'example3') return to('look');
        return g;
    case 'welcome':
        if (type === 'keepGoing' && g.resume) return to(g.resume, { resume: null });
        if (type === 'lookAround') return to('done', { resume: null });
        return g;
    default:
        return g;
    }
}

/**
 * A room's preset as the sheet prices it (for a bathroom, its type of
 * bath's): how many tasks, what they cost together, and about how long they
 * take. Null without a sheet.
 */
export function presetSummary(sheet, area, bath) {
    if (!sheet) return null;
    const items = presetFor(sheet, area, bath);
    let cents = 0;
    let minutes = 0;
    let count = 0;
    for (const item of items) {
        const p = priceChoice(sheet, item, area);
        if (p.error) continue;
        cents += p.cents;
        minutes += p.minutes;
        count++;
    }
    return { count, cents, minutes };
}

/**
 * What Maya says when the first room is in, built from the sheet: the
 * room (`label`, of kind `area`), its standard tasks and their price, and,
 * while that is under the visit minimum, that every visit starts at the
 * minimum. Without a sheet, or for a room with no standard tasks, she says
 * less, never something wrong.
 */
export function addedLine(sheet, area, label, bath) {
    const room = String(label || '').toLowerCase();
    const sum = presetSummary(sheet, area, bath);
    if (!sum || !sum.count) return GUIDE.addedPlain(room);
    const line = GUIDE.added(room, sum.count, formatMoney(sum.cents));
    const minimum = sheet.visitMinimumCents || 0;
    return sum.cents < minimum ? `${line} ${GUIDE.addedMinimum(formatMoney(minimum))}` : line;
}

/**
 * What the bubble shows for a scene: `{ text, buttons, choices, progress,
 * skip, small, again }`. `buttons` are `{ id, label, primary }`, at most
 * two; `choices` is 'home' (the kinds of home, each a button in a group),
 * 'floors' or null; `progress` the step of the strip or
 * null; `again` the line said once, in other words, if nothing happens.
 * `ctx` gives what the words depend on: `{ sheet, roomLabel, roomCount,
 * addedText }`. Null for `done`, when the bubble is put away.
 */
export function viewFor(guide, ctx = {}) {
    const b = (id, label, primary = false) => ({ id, label, primary });
    const base = { choices: null, progress: PROGRESS[guide.scene] ?? null, skip: SKIPPABLE.includes(guide.scene), small: '', again: GUIDE[`${guide.scene}Again`] || '' };
    switch (guide.scene) {
    case 'hello':
        return { ...base, text: GUIDE.hello, buttons: [b('start', GUIDE.start, true), b('example', GUIDE.example)], small: BRAND.honesty };
    case 'home':
        // Asked again after Back, the answer given is shown as chosen.
        return { ...base, text: guide.answered ? GUIDE.homeAgainAsked : GUIDE.home, buttons: [], choices: 'home', answered: Boolean(guide.answered) };
    case 'attached':
        return { ...base, text: GUIDE.attached, buttons: [b('back', GUIDE.back)], choices: 'attached' };
    case 'floors':
        return { ...base, text: guide.tapped ? `${GUIDE.floorsTaking} ${GUIDE.floors}` : GUIDE.floors, buttons: [b('next', GUIDE.next, true), b('back', GUIDE.back)], choices: 'floors' };
    case 'firstRoom':
        return { ...base, text: GUIDE.firstRoom, buttons: [b('kitchen', GUIDE.addKitchen, true), b('otherRoom', GUIDE.otherRoom)] };
    case 'added':
        return { ...base, text: ctx.addedText || GUIDE.addedPlain(String(ctx.roomLabel || '').toLowerCase()), buttons: [b('next', GUIDE.next, true)] };
    case 'dots':
        return { ...base, text: GUIDE.dots, buttons: [b('gotIt', GUIDE.gotIt)] };
    case 'rooms': {
        const buttons = [b('addRoom', GUIDE.addRoom, true)];
        // Review is offered once there are two rooms (ONBOARDING Scene 5).
        if ((ctx.roomCount || 0) >= 2) buttons.push(b('review', GUIDE.reviewIt));
        return { ...base, text: guide.rooms >= 2 ? GUIDE.roomsMore : GUIDE.rooms, buttons };
    }
    case 'review':
        return { ...base, text: GUIDE.review, buttons: [b('save', GUIDE.save, true), b('preferences', GUIDE.preferences)] };
    case 'saved':
        return { ...base, text: GUIDE.saved, buttons: [b('lookAround', GUIDE.lookAround, true)] };
    case 'example1':
        return { ...base, text: GUIDE.example1, buttons: [b('next', GUIDE.next, true)] };
    case 'example2':
        return { ...base, text: GUIDE.example2, buttons: [b('next', GUIDE.next, true)] };
    case 'example3':
        return { ...base, text: GUIDE.example3, buttons: [b('buildOwn', GUIDE.buildOwn, true), b('lookAround', GUIDE.lookAround)] };
    case 'look':
        return { ...base, text: GUIDE.look, buttons: [b('buildOwn', GUIDE.buildOwn, true)] };
    case 'welcome':
        return guide.resume
            ? { ...base, text: GUIDE.welcomeResume, buttons: [b('keepGoing', GUIDE.keepGoing, true), b('lookAround', GUIDE.illLook)] }
            : { ...base, text: GUIDE.welcome, buttons: [b('lookAround', GUIDE.lookAround, true)] };
    case 'hint':
        return { ...base, text: GUIDE.hint, buttons: [b('close', GUIDE.gotIt, true)] };
    case 'about':
        return { ...base, text: GUIDE.about, buttons: [b('close', GUIDE.close, true)], small: BRAND.honesty };
    default:
        return null;
    }
}
