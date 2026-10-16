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
 * and beside them the example's five beats (the house, a floor open, the
 * dots, its last visit's report lighting the house, and its total), a returning visitor's
 * welcome, a hint, and `addOn`: the cleaner asking for more, which Maya
 * puts to the customer, Approve or Decline (M5, PRD 9.5); and `report`: a
 * visit's report come in, the bill and what was skipped, with the house lit
 * (M5, PRD 12.4).
 *
 * EXAMPLE MODE IS A TOUR TO WATCH (QA, 2026-10-15). Maya shows the example
 * and the visitor only moves her on or back: the house answers no tap
 * meanwhile (main.js `houseAnswers`), so no panel opens over her with a
 * way back of its own. Those who ask for an example are the least sure of
 * themselves, and the tour gives them nothing to get lost in.
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

/** The example's beats, in order: Back goes one beat back, and from the
 *  first to the greeting. */
export const EXAMPLE = Object.freeze(['example1', 'example2', 'example3', 'exampleReport', 'example4']);

/** Which step of the progress strip each guided scene is on: Home type
 *  (with a townhome's neighbors), Floors, First room, Your rooms, Review. */
export const PROGRESS = Object.freeze({ home: 0, attached: 0, floors: 1, firstRoom: 2, added: 2, dots: 2, rooms: 3, review: 4 });

/** Whether the strip's First room is closed: two rooms or more, so it is
 *  done, and going back to it would only look odd (QA, 2026-10-15). */
export function firstRoomClosed(roomCount) {
    return (Number(roomCount) || 0) >= 2;
}

/**
 * Where Back goes from a step of the first build: the index of the strip's
 * step it goes to, or 'hello' (the greeting) from the kind of home. A
 * townhome's neighbors go back to the kind of home; Your rooms, with First
 * room closed, to Floors.
 */
export function backTarget(scene, roomCount) {
    if (scene === 'home') return 'hello';
    if (scene === 'attached') return PROGRESS.home;
    const target = PROGRESS[scene] - 1;
    return target === PROGRESS.firstRoom && firstRoomClosed(roomCount) ? PROGRESS.floors : target;
}

/** Back's hover title: where it goes (QA, 2026-10-15). */
function backLabel(scene, roomCount) {
    const target = backTarget(scene, roomCount);
    return target === 'hello' ? GUIDE.backToStart : GUIDE.backTo(GUIDE.progress[target]);
}

/**
 * Where each step of the strip begins, for a jump to it (a tap on the step)
 * or Back from the step after: the kind of home, the floors, the first room
 * (its line again once there is one, `roomId`, else the question), the
 * rooms, the review. Null for a step that is not on the strip.
 */
export function entryOf(stepIndex, { roomId = null } = {}) {
    switch (stepIndex) {
    case 0: return { scene: 'home' };
    case 1: return { scene: 'floors', tapped: false };
    case 2: return roomId ? { scene: 'added', roomId } : { scene: 'firstRoom' };
    case 3: return { scene: 'rooms' };
    case 4: return { scene: 'review' };
    default: return null;
    }
}

/**
 * The touch point a scene's words are about, ringed on screen (QA,
 * 2026-10-14): one at a time, and only while it is what Maya is speaking
 * of. `dot` the first task of the room just added, `floor` a floor of the
 * house, `element` a control by its id. main.js finds where it is and
 * takes the ring away the moment it is used.
 */
export const HALO = Object.freeze({
    firstRoom: Object.freeze({ kind: 'element', id: 'host-chip-kitchen' }),
    dots: Object.freeze({ kind: 'dot' }),
    /** The example's dots: one ringed to look at, not to tap. */
    example3: Object.freeze({ kind: 'exampleDot' }),
    rooms: Object.freeze({ kind: 'floor' }),
    review: Object.freeze({ kind: 'element', id: 'host-fact-quote' }),
    /** Not a scene's: standing by, just back from booking (viewFor). */
    visit: Object.freeze({ kind: 'element', id: 'host-fact-visit' })
});

/**
 * The floor a `floor` halo rings (QA, 2026-10-14: none was ever seen, as
 * the ring waited for every floor to be closed, and in Your rooms one always
 * is open): never the open one, since a tap on another is what opens it.
 * One with no rooms yet first (Maya is asking for the other rooms), then the
 * floor above the open one, then the first. Null when every floor is open
 * (a one-story home with its floor open: her room chips are the way on).
 * `levels` bottom to top, `withRooms` the levels that have rooms, `annex`
 * the levels beside the house rather than in it (a garage, rung last: it is
 * seldom where the other rooms are).
 */
export function ringFloor(levels, lifted, withRooms = [], annex = []) {
    const all = (levels || []).filter((l) => l !== lifted);
    const closed = all.filter((l) => !annex.includes(l));
    if (!closed.length) return all[0] || null;
    const empty = closed.find((l) => !withRooms.includes(l));
    if (empty) return empty;
    const above = lifted ? levels.slice(levels.indexOf(lifted) + 1).find((l) => closed.includes(l)) : null;
    return above || (closed.includes('main') ? 'main' : closed[0]);
}

/** Scenes that sit over another for a moment and go back to it. */
const ASIDE = ['hint'];

/**
 * Where Maya may put a cleaner's add-on to the customer of her own accord
 * (M5): standing by, a welcome, All set, a hint, or another add-on. Never in
 * the middle of the first build or the example, where the visitor is busy;
 * the add-on waits there at a glance (main.js hostFacts), and a tap on it
 * asks from anywhere (`asked`).
 */
const ASKS_FROM = ['done', 'welcome', 'saved', 'hint', 'addOn', 'report'];

/** Scenes whose choices send the visitor off to a card (Choose a time, See
 *  my visit, Send my changes, Review my checklist), Maya coming back once
 *  it is done: All set, a welcome, and standing by. */
const SENDS_AWAY = ['saved', 'welcome', 'done', 'report'];

/**
 * What came of a short loop away from Maya (QA, 2026-10-14: every step of
 * the way held by the hand), from how the home stood as she sent the
 * visitor off (`was`) and how it stands now, each `{ id, published,
 * booked, unsent }` (`booked` the visit's date and time, or null), and
 * where they went (`to`: booking, receipt, send, checklist):
 *
 *   booked       a visit booked where there was none
 *   moved        the visit at another time
 *   canceled     the visit canceled, the checklist still published
 *   unpublished  the checklist no longer published
 *   sent         the changes sent
 *   noTime       nothing changed after Choose a time
 *   notSent      nothing changed after Send my changes
 *   same         nothing changed, or another checklist is open now
 */
export function outcomeOf(was, now, to) {
    if (!was || !now || was.id !== now.id) return 'same';
    if (was.published && !now.published) return 'unpublished';
    if (now.booked && !was.booked) return 'booked';
    if (now.booked && now.booked !== was.booked) return 'moved';
    if (was.booked && !now.booked) return 'canceled';
    if (was.unsent && !now.unsent) return 'sent';
    if (to === 'booking') return 'noTime';
    if (to === 'send') return 'notSent';
    return 'same';
}

/** Outcomes that changed something, said in their own words without the
 *  home's standing again: a loop's, and an add-on answered. */
export const CHANGED = Object.freeze(['booked', 'moved', 'canceled', 'unpublished', 'sent', 'approved', 'declined']);

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
    if (!hasOwn(doc)) return { scene: 'hello', resume: null, reviewed, back: null, tapped: false, rooms: 0, reached: -1 };
    const resume = saved && GUIDED.includes(saved.scene) ? saved.scene : null;
    return { scene: 'welcome', resume, reviewed, back: null, tapped: false, rooms: 0, reached: -1 };
}

/** What is saved in the document's settings: the scene of the first build
 *  the visitor is at (or done), and whether they reached the review. */
export function savedForm(guide) {
    // An add-on or a report is saved as the scene beneath it.
    const at = guide.scene === 'addOn' || guide.scene === 'report' ? guide.back : guide.scene;
    const scene = GUIDED.includes(at) ? at
        : at === 'welcome' && guide.resume ? guide.resume : 'done';
    return { scene, reviewed: Boolean(guide.reviewed) };
}

/**
 * The guide after an event. Unknown events, and events a scene does not
 * answer, leave it as it was (the same object, so a caller can tell).
 *
 *   start, example         from the greeting
 *   residence              a kind of home chosen ({ kind }: a townhome is
 *                          asked once more), or a townhome's neighbors
 *   back                   one step back along the strip, to where the step
 *                          before begins ({ roomId }: the first room, for
 *                          its line); from the kind of home, the greeting
 *   goto                   a step of the strip tapped ({ step, roomId }),
 *                          any step reached so far (QA, 2026-10-14)
 *   floorTapped, next      the floors, and moving on from them
 *   roomAdded              a room was added, by any route
 *   dotOpened, gotIt       the dots
 *   review, saved          the end of the first build
 *   next, back, buildOwn   along the example, back out of it, and from it
 *   keepGoing              a returning visitor picks up where they stopped
 *   away, returned         a short loop: one of Maya's choices opens a card
 *                          ({ to, was }: where, and how the home stood),
 *                          she steps aside, and once the card is done she
 *                          comes back ({ now }) saying what came of it
 *   homeMade               a checklist made outside the guide (the setup
 *                          card): straight on to the first room
 *   nextCleaning           after a visit, the next one planned from the
 *                          same home: Your rooms, as it was left
 *   visitReport, reportDone  a visit's report shown ({ visitId, asked },
 *                          as a proposal), and put away: back where she
 *                          was, as after an add-on
 *   proposal, decided      a cleaner's add-on put to the customer
 *                          ({ addonId, asked }: asked, a tap on it, from
 *                          any scene but the example's), and answered
 *                          ({ status }): back where she was, or standing
 *                          by with what came of it
 *   again, close           a tap on Maya, and closing the hint it gave
 *   restart                start over
 */
export function step(guide, event) {
    const g = guide;
    // Every step of the strip the visitor has reached, so far, can be gone
    // back to with a tap (`reached`, the furthest).
    const to = (scene, extra = {}) => {
        // A loop away, and what came of it, belong to standing by: any
        // other scene ends them.
        const loop = scene === 'done' ? {} : { away: null, outcome: null };
        const next = { ...g, scene, ...loop, ...extra };
        const at = PROGRESS[scene];
        return at === undefined ? next : { ...next, reached: Math.max(next.reached ?? -1, at) };
    };
    const type = event && event.type;
    if (type === 'restart') return { ...to('hello', { back: null, tapped: false, rooms: 0, resume: null, answered: false, attachedAnswered: false, nextVisit: false }), reached: -1 };
    // The next cleaning, from a home with a visit behind it (QA, 2026-10-15):
    // its rooms, every step of the build behind them reached.
    if (type === 'nextCleaning' && ['welcome', 'done', 'saved'].includes(g.scene)) {
        return to('rooms', { resume: null, minimized: false, rooms: 0, nextVisit: true, reached: Math.max(g.reached ?? -1, PROGRESS.review) });
    }
    if (type === 'away' && SENDS_AWAY.includes(g.scene)) {
        return to('done', { minimized: true, resume: null, away: { to: event.to || null, was: event.was || null }, outcome: null });
    }
    if (type === 'returned') {
        if (g.scene !== 'done' || !g.away) return g;
        return to('done', { minimized: false, away: null, outcome: outcomeOf(g.away.was, event.now, g.away.to) });
    }
    if (type === 'back' && EXAMPLE.includes(g.scene)) {
        const at = EXAMPLE.indexOf(g.scene);
        return to(at ? EXAMPLE[at - 1] : 'hello');
    }
    if (GUIDED.includes(g.scene) && (type === 'back' || type === 'goto')) {
        const here = PROGRESS[g.scene];
        if (type === 'back' && g.scene === 'home') return to('hello');
        // With two rooms or more, First room is closed (QA, 2026-10-15: back
        // to it from Your rooms looked odd): Back steps over it to Floors
        // (backTarget), and a tap on it does nothing.
        const target = type === 'back' ? backTarget(g.scene, event.roomCount) : event.step;
        if (type === 'goto' && target === PROGRESS.firstRoom && firstRoomClosed(event.roomCount)) return g;
        const entry = Number.isInteger(target) && target <= (g.reached ?? -1) ? entryOf(target, event) : null;
        if (!entry || (entry.scene === g.scene && target === here && g.scene !== 'attached')) return g;
        const { scene, ...extra } = entry;
        return to(scene, extra);
    }
    if (type === 'again') {
        if (g.scene === 'done' || g.scene === 'saved') return to('hint', { back: g.scene });
        return g;
    }
    if (type === 'close' && ASIDE.includes(g.scene)) return to(g.back || 'done', { back: null });
    // An add-on or a report sits over where she was, and goes back to it:
    // a hint's own scene, and past another of them to the scene before.
    const asideFrom = (asked) => (asked ? !EXAMPLE.includes(g.scene) && g.scene !== 'hello' : ASKS_FROM.includes(g.scene) && !g.away);
    const backOf = () => (['addOn', 'report', 'hint'].includes(g.scene) ? g.back || 'done' : g.scene);
    // Back into the build, or a welcome that picks it up, as it was
    // (main.js says what came of it); else standing by, saying so.
    const goBack = (outcome) => {
        const keep = GUIDED.includes(g.back) || (g.back === 'welcome' && g.resume);
        if (keep) return to(g.back, { addonId: null, visitId: null, back: null });
        return to('done', { addonId: null, visitId: null, back: null, minimized: false, away: null, outcome });
    };
    if (type === 'proposal') {
        if (!asideFrom(event.asked) || !event.addonId || (g.scene === 'addOn' && g.addonId === event.addonId)) return g;
        return to('addOn', { addonId: event.addonId, visitId: null, back: backOf(), minimized: false });
    }
    if (type === 'decided' && g.scene === 'addOn') {
        return goBack(event.status === 'approved' || event.status === 'declined' ? event.status : null);
    }
    if (type === 'visitReport') {
        if (!asideFrom(event.asked) || !event.visitId || (g.scene === 'report' && g.visitId === event.visitId)) return g;
        return to('report', { visitId: event.visitId, addonId: null, back: backOf(), minimized: false });
    }
    if (type === 'reportDone' && g.scene === 'report') return goBack(null);
    // No Skip (QA, 2026-10-15: "the guide is the UX"): Back and the strip
    // move about in it, and Start over begins it again.
    if (type === 'homeMade' && (g.scene === 'hello' || EXAMPLE.includes(g.scene))) return to('firstRoom');
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
        return g;
    case 'floors':
        if (type === 'floorTapped') return g.tapped ? g : to('floors', { tapped: true });
        // A home that has its first room already (back here to change the
        // kind of home or the floors) goes on past First room to Your rooms
        // (QA, 2026-10-15: First room looked as if none had been chosen).
        if (type === 'next') return event.hasRooms ? to('rooms') : to('firstRoom');
        if (type === 'roomAdded') return to('added', { roomId: event.roomId || null });
        return g;
    case 'firstRoom':
        if (type === 'roomAdded') return to('added', { roomId: event.roomId || null });
        return g;
    // A dot opened on the First room step keeps her there (QA, 2026-10-15:
    // it skipped to Your rooms, three Backs away): the panel's Back comes
    // straight back to her, and Got it moves on.
    case 'added':
        if (type === 'next') return to('dots', { opened: false });
        if (type === 'dotOpened') return to('dots', { opened: true });
        if (type === 'roomAdded') return to('rooms', { rooms: g.rooms + 1 });
        return g;
    case 'dots':
        if (type === 'dotOpened') return g.opened ? g : to('dots', { opened: true });
        if (type === 'gotIt') return to('rooms');
        if (type === 'roomAdded') return to('rooms', { rooms: g.rooms + 1 });
        return g;
    case 'rooms':
        if (type === 'roomAdded') return to('rooms', { rooms: g.rooms + 1 });
        if (type === 'review') return to('review');
        return g;
    case 'review':
        if (type === 'saved') return to('saved', { reviewed: true });
        return g;
    // No "I'll look around" (QA, 2026-10-15: visitors are here to book a
    // cleaning): saved, the other way on is back to the rooms.
    case 'saved':
        if (type === 'editRooms') return to('rooms', { reached: Math.max(g.reached ?? -1, PROGRESS.review) });
        return g;
    case 'example1':
        return type === 'next' ? to('example2') : g;
    case 'example2':
        return type === 'next' ? to('example3') : g;
    case 'example3':
        return type === 'next' ? to('exampleReport') : g;
    case 'exampleReport':
        return type === 'next' ? to('example4') : g;
    case 'example4':
        if (type === 'buildOwn') return to('home');
        return g;
    case 'welcome':
        if (type === 'keepGoing' && g.resume) return to(g.resume, { resume: null });
        // Back to the rooms (QA, 2026-10-14): the build's own step, every
        // step behind it reached already.
        if (type === 'editRooms') return to('rooms', { resume: null, reached: Math.max(g.reached ?? -1, PROGRESS.review) });
        return g;
    case 'done':
        // Standing by: tucked away only while she has sent the visitor to a
        // card (`away`), back at a tap (Need a hand?), and the same ways on
        // as a return.
        if (type === 'expand') return g.minimized ? to('done', { minimized: false, outcome: null }) : g;
        if (type === 'editRooms') return to('rooms', { minimized: false, reached: Math.max(g.reached ?? -1, PROGRESS.review) });
        if (type === 'start' || type === 'buildOwn') return to('home', { minimized: false });
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
 * reached, stepBack, small, again }`. `buttons` are `{ id, label, primary }`, at most
 * two; `choices` is 'home' (the kinds of home, each a button in a group),
 * 'floors' or null; `progress` the step of the strip or
 * null; `again` the line said once, in other words, if nothing happens.
 * `ctx` gives what the words depend on: `{ sheet, roomLabel, roomCount,
 * addedText, exampleTask, exampleTotal }`. Null for `done`, when the bubble
 * is put away.
 */
export function viewFor(guide, ctx = {}) {
    const b = (id, label, primary = false) => ({ id, label, primary });
    // Back on every step of the strip (QA, 2026-10-14), and the
    // steps reached so far, each a tap away.
    // The example's beats have Back too, one beat at a time, and out.
    const exampleAt = EXAMPLE.indexOf(guide.scene);
    const base = {
        choices: null, progress: PROGRESS[guide.scene] ?? null, reached: guide.reached ?? -1,
        stepBack: GUIDED.includes(guide.scene) || exampleAt >= 0, small: '', again: GUIDE[`${guide.scene}Again`] || '',
        backTo: GUIDED.includes(guide.scene) ? backLabel(guide.scene, ctx.roomCount)
            : exampleAt === 0 ? GUIDE.backToStart : exampleAt > 0 ? GUIDE.backOneStep : '',
        closed: firstRoomClosed(ctx.roomCount) ? [PROGRESS.firstRoom] : [],
        halo: HALO[guide.scene] || null
    };
    switch (guide.scene) {
    case 'hello':
        return { ...base, text: GUIDE.hello, buttons: [b('start', GUIDE.start, true), b('example', GUIDE.example)], small: BRAND.honesty };
    case 'home':
        // Asked again after Back, the answer given is shown as chosen.
        return { ...base, text: guide.answered ? GUIDE.homeAgainAsked : GUIDE.home, buttons: [], choices: 'home', answered: Boolean(guide.answered) };
    case 'attached':
        return { ...base, text: GUIDE.attached, buttons: [], choices: 'attached' };
    case 'floors':
        return { ...base, text: guide.tapped ? `${GUIDE.floorsTaking} ${GUIDE.floors}` : GUIDE.floors, buttons: [b('next', GUIDE.next, true)], choices: 'floors' };
    case 'firstRoom':
        // The rooms most homes have as chips, the kitchen first and ringed
        // (QA, 2026-10-14), every other kind one tap away.
        return { ...base, text: GUIDE.firstRoom, buttons: [b('otherRoom', GUIDE.otherRoom)], choices: 'rooms' };
    case 'added':
        return { ...base, text: ctx.addedText || GUIDE.addedPlain(String(ctx.roomLabel || '').toLowerCase()), buttons: [b('next', GUIDE.next, true)] };
    case 'dots':
        // Once a dot has been opened, she says so, and Got it leads on.
        return guide.opened
            ? { ...base, text: GUIDE.dotsSeen, again: GUIDE.dotsSeenAgain, halo: null, buttons: [b('gotIt', GUIDE.gotIt, true)] }
            : { ...base, text: GUIDE.dots, buttons: [b('gotIt', GUIDE.gotIt, true)] };
    case 'rooms': {
        // Rooms as chips (QA, 2026-10-14). Review is offered from the first
        // room on: a home may want only one room cleaned (QA, 2026-10-15).
        const buttons = (ctx.roomCount || 0) >= 1 ? [b('review', GUIDE.reviewIt, true), b('otherRoom', GUIDE.otherRoom)] : [b('otherRoom', GUIDE.otherRoom)];
        // The next cleaning's first look at its rooms says so.
        const text = guide.nextVisit && !guide.rooms ? GUIDE.roomsNextVisit : guide.rooms >= 2 ? GUIDE.roomsMore : GUIDE.rooms;
        return { ...base, text, buttons, choices: 'rooms' };
    }
    case 'review':
        return { ...base, text: GUIDE.review, buttons: [b('save', GUIDE.save, true), b('preferences', GUIDE.preferences)] };
    case 'saved':
        // Saved, the visit is a tap away (M3): Choose a time, or back to the
        // rooms.
        // A published checklist changed through the guide offers what fits
        // it instead (`ctx.saved` { text, id, label }: Send my changes).
        if (ctx.saved) return { ...base, text: ctx.saved.text, buttons: [b(ctx.saved.id, ctx.saved.label, true), b('editRooms', GUIDE.editRooms)] };
        return { ...base, text: GUIDE.saved, buttons: [b('chooseTime', GUIDE.chooseTime, true), b('editRooms', GUIDE.editRooms)] };
    case 'example1':
        return { ...base, text: GUIDE.example1, buttons: [b('next', GUIDE.next, true)] };
    case 'example2':
        return { ...base, text: GUIDE.example2, buttons: [b('next', GUIDE.next, true)] };
    case 'example3':
        return { ...base, text: ctx.exampleTask ? GUIDE.example3(ctx.exampleTask) : GUIDE.example3Plain, buttons: [b('next', GUIDE.next, true)] };
    case 'exampleReport':
        // Its last visit's report on the house (M5), and what it billed.
        return { ...base, text: ctx.exampleBill ? GUIDE.exampleReport(ctx.exampleBill.billed, ctx.exampleBill.quote) : GUIDE.exampleReportPlain, buttons: [b('next', GUIDE.next, true)] };
    case 'example4':
        // The whole home's total, when the sheet has priced it.
        return ctx.exampleTotal
            ? { ...base, text: `${GUIDE.exampleTotal(ctx.exampleTotal.money, ctx.exampleTotal.time)} ${GUIDE.example4}`, small: GUIDE.examplePrices, buttons: [b('buildOwn', GUIDE.buildOwn, true)] }
            : { ...base, text: GUIDE.example4, buttons: [b('buildOwn', GUIDE.buildOwn, true)] };
    case 'welcome':
        // A return mid-build picks up where it stopped. Any other return is
        // a home base (QA, 2026-10-14): where the home stands, in words
        // (`ctx.welcome`, main.js), and what can be done next as choices.
        return guide.resume
            ? { ...base, text: GUIDE.welcomeResume, buttons: [b('keepGoing', GUIDE.keepGoing, true), b('startOver', GUIDE.startOver)] }
            : { ...base, text: ctx.welcome || GUIDE.welcome, buttons: [], choices: 'returning' };
    case 'hint':
        return { ...base, text: GUIDE.hint, buttons: [b('close', GUIDE.gotIt, true)] };
    case 'report':
        // A visit's report (`ctx.report` { text }, main.js): the bill, what
        // was skipped, and what next, the colors on the house in small print.
        return { ...base, text: (ctx.report && ctx.report.text) || GUIDE.reportPlain, small: GUIDE.reportColors, buttons: [], choices: 'report', halo: null };
    case 'addOn':
        // The cleaner's add-on, what it adds and their words (`ctx.addOn`
        // { text, waiting }, main.js), and the guarantee in small print.
        // With more than one waiting, the whole list a tap away.
        return {
            ...base, text: (ctx.addOn && ctx.addOn.text) || GUIDE.addOnPlain, small: GUIDE.addOnPromise, again: GUIDE.addOnAgain,
            buttons: [
                b('approve', GUIDE.approve, true), b('decline', GUIDE.decline),
                ...(ctx.addOn && ctx.addOn.waiting > 1 ? [b('allAddOns', GUIDE.seeAllAddOns(ctx.addOn.waiting))] : [])
            ]
        };
    case 'done':
        // Never silent (QA, 2026-10-14): where the home stands and the ways
        // on (`ctx.standby`, main.js), or tucked away as Need a hand?
        // Back from booking or moving the visit, the visit at a glance is
        // ringed: where it can be seen again.
        return {
            ...base, text: ctx.standby || GUIDE.standbyPlain, buttons: [], choices: 'returning', minimized: Boolean(guide.minimized),
            halo: !guide.minimized && (guide.outcome === 'booked' || guide.outcome === 'moved') ? HALO.visit : null
        };
    default:
        return null;
    }
}
