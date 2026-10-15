// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * Maya's guide (www/whitestone/js/guide.js), pure: where a visit begins,
 * every way through the first build (straight through, by the cards, by
 * the example; no Skip and no look around, QA 2026-10-15), what she says at each step, the price line built
 * from the sheet, and what is saved for a return. Every scene keeps to one
 * or two short sentences and at most two buttons (ONBOARDING section 9).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG } from '../www/whitestone/js/config.js';
import { GUIDE, BRAND, countWord } from '../www/whitestone/js/copy.js';
import {
    GUIDED, PROGRESS, HALO, CHANGED, firstRoomClosed, arrivalId, arrivalGuide, hasOwn, savedForm, step, presetSummary, addedLine, viewFor, outcomeOf, ringFloor
} from '../www/whitestone/js/guide.js';
import { presetFor } from '../www/whitestone/js/sheet.js';
import { priceChoice, formatMoney } from '../www/whitestone/js/pricing.js';

const WS = join(process.cwd(), 'www', 'whitestone');
const index = JSON.parse(readFileSync(join(WS, 'data', 'prices', 'index.json'), 'utf8'));
const SHEET = JSON.parse(readFileSync(join(WS, 'data', 'prices', `${index.cleaning}.json`), 'utf8'));
const STAMP = '2026-10-12T16:00:00.000Z';

const c = (id, extra = {}) => ({ id, sample: false, deletedAt: null, updatedAt: STAMP, ...extra });
const doc = (checklists, settings = {}) => ({ checklists, settings: { coached: 0, activeId: null, ...settings } });
const fresh = () => arrivalGuide(doc([]));
/** A house chosen as the kind of home. */
const HOUSE = { type: 'residence', kind: 'house' };
const walk = (g, ...types) => types.reduce((acc, t) => step(acc, typeof t === 'string' ? { type: t } : t), g);

const ALL = ['hello', ...GUIDED, 'saved', 'example1', 'example2', 'example3', 'welcome', 'hint'];
const EVENTS = ['start', 'example', 'floorTapped', 'next', 'roomAdded', 'dotOpened', 'gotIt', 'review', 'saved', 'buildOwn',
    'lookAround', 'keepGoing', 'homeMade', 'residence', 'again', 'about', 'close', 'restart', 'skip', 'away', 'returned', 'nonsense'];

describe('where a visit begins', () => {
    test('a first visit is greeted', () => {
        expect(fresh()).toMatchObject({ scene: 'hello', resume: null, reviewed: false, rooms: 0 });
        // The example alone is not a home of one's own.
        expect(arrivalGuide(doc([c('x', { sample: true })])).scene).toBe('hello');
        expect(hasOwn(doc([c('x', { sample: true })]))).toBe(false);
        expect(hasOwn(doc([c('gone', { deletedAt: STAMP })]))).toBe(false);
    });

    test('a return is welcomed back, offered the scene they stopped at, and not after the first build', () => {
        expect(arrivalGuide(doc([c('a')]))).toMatchObject({ scene: 'welcome', resume: null });
        expect(arrivalGuide(doc([c('a')], { guide: { scene: 'rooms', reviewed: false } }))).toMatchObject({ scene: 'welcome', resume: 'rooms' });
        expect(arrivalGuide(doc([c('a')], { guide: { scene: 'done', reviewed: true } }))).toMatchObject({ scene: 'welcome', resume: null, reviewed: true });
        // A scene that is not part of the first build is never resumed.
        expect(arrivalGuide(doc([c('a')], { guide: { scene: 'example2', reviewed: false } })).resume).toBeNull();
    });

    test('the checklist that arrives: the one open, else their own latest, else the example', () => {
        expect(arrivalId(doc([c('a'), c('b')], { activeId: 'b' }))).toBe('b');
        expect(arrivalId(doc([c('x', { sample: true, updatedAt: '2026-10-13T00:00:00.000Z' }), c('old', { updatedAt: '2026-10-01T00:00:00.000Z' }), c('new', { updatedAt: '2026-10-11T00:00:00.000Z' })]))).toBe('new');
        expect(arrivalId(doc([c('gone', { deletedAt: STAMP }), c('x', { sample: true })], { activeId: 'gone' }))).toBe('x');
        expect(arrivalId(doc([]))).toBeNull();
    });
});

describe('the way through', () => {
    test('straight through: hello, the kind of home, floors, the kitchen, its line, the dots, the rooms, review, saved, and back to the rooms', () => {
        const seen = [];
        let g = fresh();
        for (const e of ['start', HOUSE, 'floorTapped', 'next', { type: 'roomAdded', roomId: 'k' }, 'next', 'gotIt', 'roomAdded', 'roomAdded', 'review', 'saved', 'editRooms']) {
            g = walk(g, e);
            seen.push(g.scene);
        }
        expect(seen).toEqual(['home', 'floors', 'floors', 'firstRoom', 'added', 'dots', 'rooms', 'rooms', 'rooms', 'review', 'saved', 'rooms']);
        expect(g.reviewed).toBe(true);
        expect(g.rooms).toBe(2);
    });

    test('with two rooms or more First room is closed: Back from Your rooms steps over it, a tap on it does nothing (QA, 2026-10-15)', () => {
        expect([0, 1, 2, 3].map(firstRoomClosed)).toEqual([false, false, true, true]);
        const rooms = walk(fresh(), 'start', HOUSE, 'next', { type: 'roomAdded', roomId: 'k' }, 'next', 'gotIt');
        expect(rooms.scene).toBe('rooms');
        // One room: Back is First room, with that room's line.
        expect(step(rooms, { type: 'back', roomId: 'k', roomCount: 1 })).toMatchObject({ scene: 'added', roomId: 'k' });
        expect(step(rooms, { type: 'goto', step: 2, roomId: 'k', roomCount: 1 }).scene).toBe('added');
        // Two: Back is Floors, and First room answers no tap.
        expect(step(rooms, { type: 'back', roomId: 'k', roomCount: 2 }).scene).toBe('floors');
        expect(step(rooms, { type: 'goto', step: 2, roomId: 'k', roomCount: 2 })).toBe(rooms);
        expect(step(rooms, { type: 'goto', step: 1, roomId: 'k', roomCount: 2 }).scene).toBe('floors');
        // And the strip shows it closed, only then.
        expect(viewFor(rooms, { roomCount: 2 }).closed).toEqual([PROGRESS.firstRoom]);
        expect(viewFor(rooms, { roomCount: 1 }).closed).toEqual([]);
    });

    test('Next from the floors: First room, or past it to Your rooms when the home has its first room already (QA, 2026-10-15)', () => {
        const floors = walk(fresh(), 'start', HOUSE);
        expect(step(floors, { type: 'next' }).scene).toBe('firstRoom');
        expect(step(floors, { type: 'next', hasRooms: false }).scene).toBe('firstRoom');
        // Back from the rooms to change the kind of home, then on again.
        const built = walk(fresh(), 'start', HOUSE, 'next', { type: 'roomAdded', roomId: 'k' }, 'next', 'gotIt');
        expect(built.scene).toBe('rooms');
        const again = walk(built, { type: 'goto', step: 0 }, HOUSE);
        expect(again.scene).toBe('floors');
        const on = step(again, { type: 'next', hasRooms: true });
        expect(on.scene).toBe('rooms');
        expect(PROGRESS[on.scene]).toBe(3);
    });

    test('the kind of home comes first: a house or a condo on to the floors, a townhome asked once more', () => {
        const home = walk(fresh(), 'start');
        expect(home.scene).toBe('home');
        expect(walk(home, { type: 'residence', kind: 'house' }).scene).toBe('floors');
        expect(walk(home, { type: 'residence', kind: 'condo' }).scene).toBe('floors');
        const attached = walk(home, { type: 'residence', kind: 'townhome' });
        expect(attached.scene).toBe('attached');
        expect(walk(attached, { type: 'residence', kind: 'townhome' })).toMatchObject({ scene: 'floors', tapped: false });
        // Nothing else answers the question.
        for (const g of [home, attached]) {
            for (const e of ['next', 'floorTapped', 'roomAdded', 'gotIt']) expect(step(g, { type: e })).toBe(g);
        }
        // Both are part of the first build: saved, resumed, on the strip's first step.
        for (const scene of ['home', 'attached']) {
            expect(GUIDED).toContain(scene);
            expect(PROGRESS[scene]).toBe(0);
            expect(savedForm({ scene })).toEqual({ scene, reviewed: false });
        }
    });

    test('Back from the floors, or a townhome\'s neighbors, asks the kind of home again, the answer so far marked', () => {
        const floors = walk(fresh(), 'start', HOUSE);
        const again = walk(floors, 'back');
        expect(again).toMatchObject({ scene: 'home', answered: true });
        expect(viewFor(again)).toMatchObject({ text: GUIDE.homeAgainAsked, answered: true, progress: 0 });
        expect(viewFor(walk(fresh(), 'start'))).toMatchObject({ text: GUIDE.home, answered: false });
        const attached = walk(fresh(), 'start', { type: 'residence', kind: 'townhome' });
        expect(walk(attached, 'back').scene).toBe('home');
        // A townhome's neighbors once answered are marked when asked again.
        expect(walk(attached, { type: 'residence', kind: 'townhome' }).attachedAnswered).toBe(true);
        // From the question itself, Back is the greeting; a restart forgets
        // the answers and the steps reached.
        expect(step(walk(fresh(), 'start'), { type: 'back' }).scene).toBe('hello');
        expect(walk(again, 'restart')).toMatchObject({ scene: 'hello', answered: false, attachedAnswered: false, reached: -1 });
    });

    test('Back on every step goes to where the step before begins', () => {
        const at = (scene, extra = {}) => ({ ...fresh(), scene, reached: 4, ...extra });
        const back = (g, roomId = null) => step(g, { type: 'back', roomId });
        expect(back(at('floors')).scene).toBe('home');
        expect(back(at('attached')).scene).toBe('home');
        for (const scene of ['firstRoom', 'added', 'dots']) expect(back(at(scene))).toMatchObject({ scene: 'floors', tapped: false });
        // The First room step begins with the first room's line once there
        // is one, else with the question.
        expect(back(at('rooms'), 'k1')).toMatchObject({ scene: 'added', roomId: 'k1' });
        expect(back(at('rooms')).scene).toBe('firstRoom');
        expect(back(at('review')).scene).toBe('rooms');
        // Nothing outside the strip has a Back.
        for (const scene of ['hello', 'saved', 'example1', 'welcome', 'done']) {
            const g = at(scene);
            expect(back(g)).toBe(g);
            expect(viewFor(g, { sheet: SHEET }) ? viewFor(g, { sheet: SHEET }).stepBack : false).toBe(false);
        }
        for (const scene of GUIDED) expect(viewFor(at(scene), { sheet: SHEET, roomCount: 2 }).stepBack).toBe(true);
    });

    test('a tapped step goes there, but only to a step reached so far', () => {
        const g = walk(fresh(), 'start', HOUSE, 'next');
        expect(g).toMatchObject({ scene: 'firstRoom', reached: 2 });
        const go = (from, n, roomId = null) => step(from, { type: 'goto', step: n, roomId });
        expect(go(g, 0).scene).toBe('home');
        expect(go(g, 1).scene).toBe('floors');
        // Not yet reached, or the step it is on already: nothing.
        expect(go(g, 3)).toBe(g);
        expect(go(g, 2)).toBe(g);
        // Gone back, the steps ahead stay a tap away.
        const back = go(g, 0);
        expect(back.reached).toBe(2);
        expect(go(back, 2, 'k1')).toMatchObject({ scene: 'added', roomId: 'k1' });
        expect(viewFor(back, { sheet: SHEET }).reached).toBe(2);
        // Outside the strip, a tap on a step does nothing.
        const done = { ...g, scene: 'done' };
        expect(go(done, 0)).toBe(done);
        expect(go(g, 'two')).toBe(g);
    });

    test('the first floor tapped is remarked on once', () => {
        const once = walk(fresh(), 'start', HOUSE, 'floorTapped');
        expect(once.tapped).toBe(true);
        expect(step(once, { type: 'floorTapped' })).toBe(once);
    });

    test('a tapped dot keeps her on First room, saying so, and Got it moves on (QA, 2026-10-15)', () => {
        for (const g of [
            walk(fresh(), 'start', HOUSE, 'next', 'roomAdded', 'next', 'dotOpened'),
            walk(fresh(), 'start', HOUSE, 'next', 'roomAdded', 'dotOpened')
        ]) {
            expect(g.scene).toBe('dots');
            expect(g.opened).toBe(true);
            expect(PROGRESS[g.scene]).toBe(PROGRESS.firstRoom);
            // A second dot changes nothing.
            expect(step(g, { type: 'dotOpened' })).toBe(g);
            const v = viewFor(g);
            expect(v.text).toBe(GUIDE.dotsSeen);
            expect(v.again).toBe(GUIDE.dotsSeenAgain);
            expect(v.halo).toBeNull();
            expect(v.buttons).toEqual([{ id: 'gotIt', label: GUIDE.gotIt, primary: true }]);
            expect(step(g, { type: 'gotIt' }).scene).toBe('rooms');
        }
        // Before a dot: the first line, its ring on a dot, Got it the main button.
        const before = walk(fresh(), 'start', HOUSE, 'next', 'roomAdded', 'next');
        expect(before.opened).toBe(false);
        expect(viewFor(before).text).toBe(GUIDE.dots);
        expect(viewFor(before).halo).toEqual({ kind: 'dot' });
        expect(viewFor(before).buttons).toEqual([{ id: 'gotIt', label: GUIDE.gotIt, primary: true }]);
        // Back to First room later (its room known) starts the dots afresh.
        const again = walk(before, 'dotOpened', 'gotIt');
        const back = step(again, { type: 'back', roomId: 'r1' });
        expect(back.scene).toBe('added');
        expect(step(back, { type: 'next' })).toMatchObject({ scene: 'dots', opened: false });
    });

    test('a room added by the room card counts as much as the kitchen from the bubble, at any step', () => {
        // From the floors, before Next.
        expect(walk(fresh(), 'start', HOUSE, { type: 'roomAdded', roomId: 'r' })).toMatchObject({ scene: 'added', roomId: 'r' });
        // Another while the first room's line is up, or while the dots are explained.
        expect(walk(fresh(), 'start', HOUSE, 'next', 'roomAdded', 'roomAdded')).toMatchObject({ scene: 'rooms', rooms: 1 });
        expect(walk(fresh(), 'start', HOUSE, 'next', 'roomAdded', 'next', 'roomAdded')).toMatchObject({ scene: 'rooms', rooms: 1 });
    });

    test('a checklist made by the setup card goes straight to the first room, from the greeting or the example', () => {
        for (const from of [fresh(), walk(fresh(), 'example'), walk(fresh(), 'example', 'next', 'next')]) {
            expect(step(from, { type: 'homeMade' }).scene).toBe('firstRoom');
        }
        // In the middle of the build it changes nothing.
        const rooms = walk(fresh(), 'start', HOUSE, 'next', 'roomAdded', 'gotIt');
        expect(step(rooms, { type: 'homeMade' })).toBe(rooms);
    });

    test('no Skip and no look around: the guide is the way (QA, 2026-10-15)', () => {
        for (const scene of ALL) {
            const g = { ...fresh(), scene };
            expect(step(g, { type: 'skip' })).toBe(g);
            expect(step(g, { type: 'lookAround' })).toBe(g);
            const v = viewFor(g, { welcome: 'Here.', standby: 'Here.', roomCount: 1 });
            if (!v) continue;
            expect(v.skip).toBeUndefined();
            expect(v.buttons.map((b) => b.id)).not.toContain('lookAround');
        }
    });

    test('the example: three beats, then build your own', () => {
        const beats = [];
        let g = walk(fresh(), 'example');
        beats.push(g.scene);
        g = walk(g, 'next');
        beats.push(g.scene);
        g = walk(g, 'next');
        beats.push(g.scene);
        expect(beats).toEqual(['example1', 'example2', 'example3']);
        expect(walk(g, 'buildOwn').scene).toBe('home');
        expect(viewFor(g).buttons).toEqual([{ id: 'buildOwn', label: GUIDE.buildOwn, primary: true }]);
    });

    test('a return picks up where it stopped', () => {
        const back = arrivalGuide(doc([c('a')], { guide: { scene: 'dots', reviewed: false } }));
        expect(walk(back, 'keepGoing')).toMatchObject({ scene: 'dots', resume: null });
        const done = arrivalGuide(doc([c('a')]));
        expect(step(done, { type: 'keepGoing' })).toBe(done);
        expect(walk(done, 'editRooms').scene).toBe('rooms');
    });

    test('a tap on her: a hint once the guide is over; no About any more (QA, 2026-10-15)', () => {
        expect(walk({ ...fresh(), scene: 'done' }, 'again')).toMatchObject({ scene: 'hint', back: 'done' });
        expect(walk({ ...fresh(), scene: 'saved' }, 'again', 'close').scene).toBe('saved');
        // In the middle of the build, again is the scene's own hint (main.js says it).
        const floors = walk(fresh(), 'start', HOUSE);
        expect(step(floors, { type: 'again' })).toBe(floors);
        expect(step(floors, { type: 'about' })).toBe(floors);
        expect(viewFor({ ...fresh(), scene: 'about' })).toBeNull();
        expect(walk({ ...fresh(), scene: 'hint', back: null }, 'close').scene).toBe('done');
    });

    test('restart goes back to the greeting from anywhere, the count and the remarks forgotten', () => {
        for (const scene of ALL) {
            const g = step({ ...fresh(), scene, rooms: 4, tapped: true, resume: 'rooms' }, { type: 'restart' });
            expect(g).toMatchObject({ scene: 'hello', rooms: 0, tapped: false, resume: null });
        }
    });

    test('every scene and every event: a known scene or the same guide back, never a throw', () => {
        for (const scene of [...ALL, 'done']) {
            for (const type of EVENTS) {
                const g = { ...fresh(), scene, back: 'rooms', resume: 'dots' };
                const next = step(g, { type });
                expect([...ALL, 'done']).toContain(next.scene);
            }
        }
        const g = fresh();
        expect(step(g, null)).toBe(g);
        expect(step(g, {})).toBe(g);
    });
});

describe('the floor a ring goes on (QA, 2026-10-14)', () => {
    const LEVELS = ['basement', 'main', 'second', 'garage'];
    const ANNEX = ['garage', 'detached-garage'];

    test('never the open floor: one with no rooms yet first, a garage last', () => {
        expect(ringFloor(LEVELS, 'main', ['main'], ANNEX)).toBe('basement');
        expect(ringFloor(LEVELS, 'main', ['main', 'basement'], ANNEX)).toBe('second');
        expect(ringFloor(LEVELS, null, [], ANNEX)).toBe('basement');
    });

    test('every floor with rooms: the one above the open one, else the main floor, else the first', () => {
        const all = ['basement', 'main', 'second'];
        expect(ringFloor(LEVELS, 'main', all, ANNEX)).toBe('second');
        expect(ringFloor(LEVELS, 'second', all, ANNEX)).toBe('main');
        expect(ringFloor(LEVELS, null, all, ANNEX)).toBe('main');
        expect(ringFloor(['basement', 'second'], 'second', ['basement', 'second'], ANNEX)).toBe('basement');
    });

    test('a one-story home with its floor open: nothing, or its garage if that is all there is', () => {
        expect(ringFloor(['main'], 'main', ['main'], ANNEX)).toBeNull();
        expect(ringFloor(['main', 'garage'], 'main', ['main'], ANNEX)).toBe('garage');
        expect(ringFloor(['main'], null, [], ANNEX)).toBe('main');
        expect(ringFloor([], null, [], ANNEX)).toBeNull();
    });
});

describe('short loops away from Maya, and back (QA, 2026-10-14)', () => {
    const draft = { id: 'a', published: false, booked: null, unsent: false };
    const booked = { id: 'a', published: true, booked: '2026-10-16 09:00', unsent: false };

    test('what came of a loop, from how the home stood before and after', () => {
        expect(outcomeOf(draft, booked, 'booking')).toBe('booked');
        expect(outcomeOf(booked, { ...booked, booked: '2026-10-17 09:00' }, 'receipt')).toBe('moved');
        expect(outcomeOf(booked, { ...booked, booked: null }, 'receipt')).toBe('canceled');
        expect(outcomeOf(booked, draft, 'receipt')).toBe('unpublished');
        expect(outcomeOf({ ...booked, unsent: true }, booked, 'send')).toBe('sent');
        // A published checklist with no visit, booked again.
        expect(outcomeOf({ ...booked, booked: null }, booked, 'booking')).toBe('booked');
        // A move with changes not sent takes them along: said as the move.
        expect(outcomeOf({ ...booked, unsent: true }, { ...booked, booked: '2026-10-17 09:00' }, 'send')).toBe('moved');
        // Nothing changed: said by where they went.
        expect(outcomeOf(draft, draft, 'booking')).toBe('noTime');
        expect(outcomeOf({ ...booked, unsent: true }, { ...booked, unsent: true }, 'send')).toBe('notSent');
        expect(outcomeOf(booked, booked, 'receipt')).toBe('same');
        expect(outcomeOf(draft, draft, 'checklist')).toBe('same');
        // Another checklist open now, or nothing known: nothing claimed.
        expect(outcomeOf(draft, { ...booked, id: 'b' }, 'booking')).toBe('same');
        expect(outcomeOf(null, booked, 'booking')).toBe('same');
        expect(CHANGED).toEqual(['booked', 'moved', 'canceled', 'unpublished', 'sent']);
    });

    test('from All set, a welcome or standing by, Maya steps aside remembering where they went', () => {
        for (const scene of ['saved', 'welcome', 'done']) {
            const g = step({ ...fresh(), scene, resume: 'rooms', outcome: 'sent' }, { type: 'away', to: 'booking', was: draft });
            expect(g).toMatchObject({ scene: 'done', minimized: true, resume: null, away: { to: 'booking', was: draft }, outcome: null });
        }
        // Not in the middle of the build, nor from the example.
        for (const scene of [...GUIDED, 'hello', 'example3', 'hint']) {
            const g = { ...fresh(), scene };
            expect(step(g, { type: 'away', to: 'booking', was: draft })).toBe(g);
        }
    });

    test('back, she says what came of it, out of her tuck; with nothing to come back from, nothing moves', () => {
        const away = walk({ ...fresh(), scene: 'saved' }, { type: 'away', to: 'booking', was: draft });
        const back = step(away, { type: 'returned', now: booked });
        expect(back).toMatchObject({ scene: 'done', minimized: false, away: null, outcome: 'booked' });
        expect(step(back, { type: 'returned', now: booked })).toBe(back);
        const plain = { ...fresh(), scene: 'done', minimized: true };
        expect(step(plain, { type: 'returned', now: booked })).toBe(plain);
        // Gone into another scene meanwhile (Help's hint): the loop is over.
        const hint = walk(away, 'again');
        expect(hint).toMatchObject({ scene: 'hint', away: null });
        expect(step(walk(hint, 'close'), { type: 'returned', now: booked }).outcome).toBeNull();
    });

    test('what she said back is let go: Need a hand?, or any other scene', () => {
        const back = { ...fresh(), scene: 'done', minimized: false, outcome: 'booked', away: null };
        expect(walk({ ...back, minimized: true }, 'expand')).toMatchObject({ minimized: false, outcome: null });
        expect(walk(back, 'editRooms')).toMatchObject({ scene: 'rooms', outcome: null });
        expect(walk(back, 'restart')).toMatchObject({ scene: 'hello', outcome: null, away: null });
        // Need a hand? while changes are on their way keeps the loop open.
        const sending = walk({ ...fresh(), scene: 'done' }, { type: 'away', to: 'send', was: { ...booked, unsent: true } }, 'expand');
        expect(sending).toMatchObject({ minimized: false, away: { to: 'send' } });
        expect(step(sending, { type: 'returned', now: booked }).outcome).toBe('sent');
    });

    test('her words back: what main.js says, the ways on, and the visit chip ringed after a booking or a move', () => {
        const back = (outcome) => viewFor({ ...fresh(), scene: 'done', minimized: false, outcome }, { standby: 'Said.' });
        expect(back('booked')).toMatchObject({ text: 'Said.', choices: 'returning', halo: HALO.visit });
        expect(back('moved').halo).toEqual({ kind: 'element', id: 'host-fact-visit' });
        for (const outcome of ['canceled', 'unpublished', 'sent', 'noTime', 'notSent', 'same', null]) expect(back(outcome).halo).toBeNull();
        // Tucked, nothing is ringed.
        expect(viewFor({ ...fresh(), scene: 'done', minimized: true, outcome: 'booked' }, {}).halo).toBeNull();
    });

    test('All set offers a time, or what main.js says fits a published checklist, and back to the rooms', () => {
        const g = { ...fresh(), scene: 'saved' };
        expect(viewFor(g, {}).buttons.map((b) => [b.id, b.primary])).toEqual([['chooseTime', true], ['editRooms', false]]);
        const v = viewFor(g, { saved: { text: GUIDE.savedUnsent, id: 'sendChanges', label: GUIDE.sendChanges } });
        expect(v.text).toBe(GUIDE.savedUnsent);
        expect(v.buttons).toEqual([{ id: 'sendChanges', label: GUIDE.sendChanges, primary: true }, { id: 'editRooms', label: GUIDE.editRooms, primary: false }]);
        // Add or change rooms: the build's own Your rooms step.
        expect(step({ ...g, reached: 4 }, { type: 'editRooms' })).toMatchObject({ scene: 'rooms', reached: 4 });
    });
});

describe('what is saved for a return', () => {
    test('a step of the first build, else done, and whether it reached the review', () => {
        for (const scene of GUIDED) expect(savedForm({ scene, reviewed: false })).toEqual({ scene, reviewed: false });
        for (const scene of ['hello', 'example2', 'saved', 'hint', 'done']) expect(savedForm({ scene, reviewed: true })).toEqual({ scene: 'done', reviewed: true });
        // A welcome not yet answered keeps the step it would resume.
        expect(savedForm({ scene: 'welcome', resume: 'rooms', reviewed: false })).toEqual({ scene: 'rooms', reviewed: false });
        expect(savedForm({ scene: 'welcome', resume: null, reviewed: false })).toEqual({ scene: 'done', reviewed: false });
    });
});

describe('the price line, from the sheet', () => {
    test("the kitchen's preset is counted and priced as the sheet prices it", () => {
        const sum = presetSummary(SHEET, 'kitchen');
        const items = presetFor(SHEET, 'kitchen');
        expect(sum.count).toBe(items.length);
        expect(sum.cents).toBe(items.reduce((n, i) => n + priceChoice(SHEET, i, 'kitchen').cents, 0));
        expect(sum.minutes).toBe(items.reduce((n, i) => n + priceChoice(SHEET, i, 'kitchen').minutes, 0));
        expect(presetSummary(null, 'kitchen')).toBeNull();
        expect(presetSummary(SHEET, 'no-such-room')).toEqual({ count: 0, cents: 0, minutes: 0 });
    });

    test('under the visit minimum, the line says every visit starts there', () => {
        const sum = presetSummary(SHEET, 'kitchen');
        expect(sum.cents).toBeLessThan(SHEET.visitMinimumCents);
        expect(addedLine(SHEET, 'kitchen', 'Kitchen')).toBe(
            `There's your kitchen with its ${countWord(sum.count)} standard tasks, ${formatMoney(sum.cents)} so far. `
            + `Every visit starts at ${formatMoney(SHEET.visitMinimumCents)}, so your next rooms fit inside that.`);
    });

    test('at or over the minimum it says only the room and its price, and without a sheet only the room', () => {
        const sum = presetSummary(SHEET, 'kitchen');
        const rich = { ...SHEET, visitMinimumCents: sum.cents };
        expect(addedLine(rich, 'kitchen', 'Kitchen')).toBe(`There's your kitchen with its ${countWord(sum.count)} standard tasks, ${formatMoney(sum.cents)} so far.`);
        expect(addedLine(null, 'kitchen', 'Kitchen')).toBe("There's your kitchen.");
        // A room with no standard tasks says nothing about a price.
        expect(addedLine(SHEET, 'no-such-room', "Emma's room")).toBe("There's your emma's room.");
    });

    test('counts read as words, and one task is one task', () => {
        expect(countWord(9)).toBe('nine');
        expect(countWord(1)).toBe('one');
        expect(countWord(12)).toBe('twelve');
        expect(countWord(13)).toBe('13');
        expect(GUIDE.added('kitchen', 1, '$10')).toBe("There's your kitchen with its one standard task, $10 so far.");
    });
});

describe('what Maya says', () => {
    const ctx = { sheet: SHEET, roomCount: 1, roomLabel: 'Kitchen', addedText: 'There is your kitchen.' };
    const views = ALL.map((scene) => [scene, viewFor({ ...fresh(), scene, rooms: 0 }, ctx)]);

    test.each(views)('%s: one or two short sentences, at most two buttons, one of them the main one', (_scene, v) => {
        expect(v.text.length).toBeGreaterThan(10);
        const sentences = v.text.split(/(?<=[.?])\s+/).filter(Boolean);
        expect(sentences.length).toBeLessThanOrEqual(3);
        // A question of a few answers has them as its choices instead.
        if (v.choices === 'home' || v.choices === 'returning') expect(v.buttons).toEqual([]);
        else if (v.choices === 'attached') expect(v.buttons).toEqual([]);
        else expect(v.buttons.length).toBeGreaterThanOrEqual(1);
        expect(v.buttons.length).toBeLessThanOrEqual(2);
        expect(v.buttons.filter((b) => b.primary).length).toBeLessThanOrEqual(1);
        for (const line of [v.text, v.again, v.small, ...v.buttons.map((b) => b.label)]) {
            expect(line).not.toMatch(/—|;|!/);
        }
    });

    test('the greeting is ONBOARDING Scene 1, word for word, with the honesty line under it', () => {
        const v = viewFor(fresh());
        expect(v.text).toBe("Hi, I'm Maya with Whitestone Home Care. Let's build a cleaning checklist for your home, room by room. It takes about two minutes.");
        expect(v.buttons.map((b) => [b.id, b.label, b.primary])).toEqual([['start', "Let's start", true], ['example', 'Show me an example', false]]);
        expect(v.small).toBe(BRAND.honesty);
        expect(v.progress).toBeNull();
    });

    test('the kind of home is ONBOARDING Scene 2a, and the floors come next', () => {
        expect(viewFor(walk(fresh(), 'start'))).toMatchObject({ text: 'First, what kind of home is it?', choices: 'home', progress: 0 });
        expect(viewFor(walk(fresh(), 'start', { type: 'residence', kind: 'townhome' }))).toMatchObject({ text: 'Is it an end unit, or between two neighbors?', choices: 'attached' });
        expect(GUIDE.floors).toBe('Next, which floors does your home have?');
        expect(GUIDE.progress).toEqual(['Home type', 'Floors', 'First room', 'Your rooms', 'Review']);
    });

    test('the floors ask for choices and remark on the first tap', () => {
        const floors = viewFor(walk(fresh(), 'start', HOUSE));
        expect(floors.choices).toBe('floors');
        expect(floors.text).toBe(GUIDE.floors);
        expect(viewFor(walk(fresh(), 'start', HOUSE, 'floorTapped')).text).toBe(`${GUIDE.floorsTaking} ${GUIDE.floors}`);
    });

    test('the progress strip follows the first build and only the first build', () => {
        for (const scene of GUIDED) expect(viewFor({ ...fresh(), scene }, ctx).progress).toBe(PROGRESS[scene]);
        for (const scene of ['hello', 'saved', 'example1', 'welcome', 'hint']) expect(viewFor({ ...fresh(), scene }, ctx).progress).toBeNull();
        expect(GUIDE.progress).toHaveLength(Math.max(...Object.values(PROGRESS)) + 1);
        // Never backwards along the way.
        const order = GUIDED.map((s) => PROGRESS[s]);
        for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThanOrEqual(order[i - 1]);
    });

    test('the first room says its line from the sheet, or the room plainly', () => {
        expect(viewFor({ ...fresh(), scene: 'added' }, ctx).text).toBe('There is your kitchen.');
        expect(viewFor({ ...fresh(), scene: 'added' }, { roomLabel: 'Kitchen' }).text).toBe("There's your kitchen.");
    });

    test('Review is offered from the first room, and the rooms line warms after two more', () => {
        const rooms = (n, added) => viewFor({ ...fresh(), scene: 'rooms', rooms: added }, { roomCount: n });
        // The rooms are chips (QA, 2026-10-14); the buttons are Review, from
        // the first room (QA, 2026-10-15: one room may be all a home wants
        // cleaned), and every other kind of room.
        expect(rooms(1, 0).buttons.map((b) => [b.id, b.primary])).toEqual([['review', true], ['otherRoom', false]]);
        expect(rooms(1, 0).choices).toBe('rooms');
        expect(rooms(0, 0).buttons.map((b) => b.id)).toEqual(['otherRoom']);
        expect(rooms(2, 1).buttons.map((b) => [b.id, b.primary])).toEqual([['review', true], ['otherRoom', false]]);
        expect(viewFor({ ...fresh(), scene: 'firstRoom' })).toMatchObject({ choices: 'rooms', halo: { kind: 'element', id: 'host-chip-kitchen' } });
        expect(rooms(2, 1).text).toBe(GUIDE.rooms);
        expect(rooms(4, 2).text).toBe(GUIDE.roomsMore);
    });

    test('a return mid-build is offered Keep going; any other is a home base, its words and choices the page\'s', () => {
        // Keep going, or Start over (QA, 2026-10-15).
        expect(viewFor({ ...fresh(), scene: 'welcome', resume: 'rooms' }).buttons).toEqual([
            { id: 'keepGoing', label: GUIDE.keepGoing, primary: true }, { id: 'startOver', label: GUIDE.startOver, primary: false }
        ]);
        const base = viewFor({ ...fresh(), scene: 'welcome', resume: null }, { welcome: 'Welcome back. All is well. What would you like to do?' });
        expect(base).toMatchObject({ text: 'Welcome back. All is well. What would you like to do?', buttons: [], choices: 'returning' });
        expect(viewFor({ ...fresh(), scene: 'welcome', resume: null }).text).toBe(GUIDE.welcome);
        // Add or change rooms: the build's own Your rooms step, every step behind it reached.
        expect(step({ ...fresh(), scene: 'welcome', resume: null }, { type: 'editRooms' })).toMatchObject({ scene: 'rooms', reached: 4 });
        expect(step({ ...fresh(), scene: 'rooms' }, { type: 'editRooms' }).scene).toBe('rooms');
    });

    test('a halo on the touch point each step speaks of, and none where there is none', () => {
        const halo = (scene) => viewFor({ ...fresh(), scene }, { sheet: SHEET, roomCount: 2 }).halo;
        expect(halo('dots')).toEqual({ kind: 'dot' });
        expect(halo('rooms')).toEqual({ kind: 'floor' });
        expect(halo('review')).toEqual({ kind: 'element', id: 'host-fact-quote' });
        // The hint rings nothing: the Help button it pointed to is gone (QA, 2026-10-15).
        expect(halo('hint')).toBeNull();
        expect(halo('firstRoom')).toEqual({ kind: 'element', id: 'host-chip-kitchen' });
        for (const scene of ['hello', 'home', 'floors', 'added', 'saved', 'example1', 'welcome']) expect(halo(scene)).toBeNull();
        expect(Object.isFrozen(HALO)).toBe(true);
    });

    test('done is never silent: standing by with the ways on, or tucked away (QA, 2026-10-14)', () => {
        const by = viewFor({ ...fresh(), scene: 'done' }, { standby: 'Here. What would you like to do?' });
        expect(by).toMatchObject({ text: 'Here. What would you like to do?', buttons: [], choices: 'returning', minimized: false, progress: null, stepBack: false });
        expect(viewFor({ ...fresh(), scene: 'done' }).text).toBe(GUIDE.standbyPlain);
        // Tucked only while away at a card; Need a hand? opens her again.
        const standing = { ...fresh(), scene: 'done', minimized: false };
        const tucked = step({ ...fresh(), scene: 'saved' }, { type: 'away', to: 'booking', was: null });
        expect(tucked).toMatchObject({ scene: 'done', minimized: true });
        expect(viewFor(tucked).minimized).toBe(true);
        expect(step(tucked, { type: 'expand' })).toMatchObject({ scene: 'done', minimized: false });
        expect(step(standing, { type: 'expand' })).toBe(standing);
        // Its ways on: the rooms, a start, or the example's build my own.
        expect(step(standing, { type: 'editRooms' })).toMatchObject({ scene: 'rooms', reached: 4 });
        expect(step(standing, { type: 'start' }).scene).toBe('home');
        expect(step(standing, { type: 'buildOwn' }).scene).toBe('home');
        expect(step(standing, { type: 'nonsense' })).toBe(standing);
    });

    test('every scene of the first build has a hint to say again, in other words', () => {
        for (const scene of ['hello', 'floors', 'firstRoom', 'dots', 'rooms', 'review']) {
            const v = viewFor({ ...fresh(), scene }, ctx);
            expect(v.again).toBeTruthy();
            expect(v.again).not.toBe(v.text);
        }
    });

    test('the config gives Maya time to be heard before any nudge', () => {
        expect(CONFIG.guide.pulse).toBeGreaterThan(CONFIG.guide.delay);
        expect(CONFIG.guide.again).toBeGreaterThan(CONFIG.guide.pulse);
    });
});
