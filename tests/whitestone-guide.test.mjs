// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * Maya's guide (www/whitestone/js/guide.js), pure: where a visit begins,
 * every way through the first build (straight through, skipping, by the
 * cards, by the example), what she says at each step, the price line built
 * from the sheet, and what is saved for a return. Every scene keeps to one
 * or two short sentences and at most two buttons (ONBOARDING section 9).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG } from '../www/whitestone/js/config.js';
import { GUIDE, BRAND, countWord } from '../www/whitestone/js/copy.js';
import {
    GUIDED, PROGRESS, arrivalId, arrivalGuide, hasOwn, savedForm, step, presetSummary, addedLine, viewFor
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

const ALL = ['hello', ...GUIDED, 'saved', 'example1', 'example2', 'example3', 'look', 'welcome', 'hint', 'about'];
const EVENTS = ['start', 'example', 'floorTapped', 'next', 'roomAdded', 'dotOpened', 'gotIt', 'review', 'saved', 'buildOwn',
    'lookAround', 'keepGoing', 'homeMade', 'residence', 'again', 'about', 'close', 'restart', 'skip', 'nonsense'];

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
    test('straight through: hello, the kind of home, floors, the kitchen, its line, the dots, the rooms, review, saved, done', () => {
        const seen = [];
        let g = fresh();
        for (const e of ['start', HOUSE, 'floorTapped', 'next', { type: 'roomAdded', roomId: 'k' }, 'next', 'gotIt', 'roomAdded', 'roomAdded', 'review', 'saved', 'lookAround']) {
            g = walk(g, e);
            seen.push(g.scene);
        }
        expect(seen).toEqual(['home', 'floors', 'floors', 'firstRoom', 'added', 'dots', 'rooms', 'rooms', 'rooms', 'review', 'saved', 'done']);
        expect(g.reviewed).toBe(true);
        expect(g.rooms).toBe(2);
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
        // Both are part of the first build: saved, resumed, skippable, on the strip's first step.
        for (const scene of ['home', 'attached']) {
            expect(GUIDED).toContain(scene);
            expect(PROGRESS[scene]).toBe(0);
            expect(savedForm({ scene })).toEqual({ scene, reviewed: false });
        }
    });

    test('the first floor tapped is remarked on once', () => {
        const once = walk(fresh(), 'start', HOUSE, 'floorTapped');
        expect(once.tapped).toBe(true);
        expect(step(once, { type: 'floorTapped' })).toBe(once);
    });

    test('a tapped dot moves on as Got it does, and from the line before it too', () => {
        expect(walk(fresh(), 'start', HOUSE, 'next', 'roomAdded', 'next', 'dotOpened').scene).toBe('rooms');
        expect(walk(fresh(), 'start', HOUSE, 'next', 'roomAdded', 'dotOpened').scene).toBe('rooms');
    });

    test('a room added by the room card counts as much as the kitchen from the bubble, at any step', () => {
        // From the floors, before Next.
        expect(walk(fresh(), 'start', HOUSE, { type: 'roomAdded', roomId: 'r' })).toMatchObject({ scene: 'added', roomId: 'r' });
        // Another while the first room's line is up, or while the dots are explained.
        expect(walk(fresh(), 'start', HOUSE, 'next', 'roomAdded', 'roomAdded')).toMatchObject({ scene: 'rooms', rooms: 1 });
        expect(walk(fresh(), 'start', HOUSE, 'next', 'roomAdded', 'next', 'roomAdded')).toMatchObject({ scene: 'rooms', rooms: 1 });
    });

    test('a checklist made by the setup card goes straight to the first room, from the greeting or the example', () => {
        for (const from of [fresh(), walk(fresh(), 'example'), walk(fresh(), 'example', 'next', 'next'), walk(fresh(), 'example', 'next', 'next', 'lookAround')]) {
            expect(step(from, { type: 'homeMade' }).scene).toBe('firstRoom');
        }
        // In the middle of the build it changes nothing.
        const rooms = walk(fresh(), 'start', HOUSE, 'next', 'roomAdded', 'gotIt');
        expect(step(rooms, { type: 'homeMade' })).toBe(rooms);
    });

    test('Skip leaves any step of the first build, and only those', () => {
        for (const scene of GUIDED) expect(step({ ...fresh(), scene }, { type: 'skip' }).scene).toBe('done');
        for (const scene of ['hello', 'example1', 'welcome', 'saved', 'done']) {
            const g = { ...fresh(), scene };
            expect(step(g, { type: 'skip' })).toBe(g);
        }
    });

    test('the example: three beats, then build your own or look around', () => {
        const beats = [];
        let g = walk(fresh(), 'example');
        beats.push(g.scene);
        g = walk(g, 'next');
        beats.push(g.scene);
        g = walk(g, 'next');
        beats.push(g.scene);
        expect(beats).toEqual(['example1', 'example2', 'example3']);
        expect(walk(g, 'buildOwn').scene).toBe('home');
        const look = walk(g, 'lookAround');
        expect(look.scene).toBe('look');
        expect(walk(look, 'buildOwn').scene).toBe('home');
        expect(step(look, { type: 'lookAround' })).toBe(look);
    });

    test('a return picks up where it stopped, or looks around', () => {
        const back = arrivalGuide(doc([c('a')], { guide: { scene: 'dots', reviewed: false } }));
        expect(walk(back, 'keepGoing')).toMatchObject({ scene: 'dots', resume: null });
        expect(walk(back, 'lookAround').scene).toBe('done');
        const done = arrivalGuide(doc([c('a')]));
        expect(step(done, { type: 'keepGoing' })).toBe(done);
        expect(walk(done, 'lookAround').scene).toBe('done');
    });

    test('Help: again shows a hint once the guide is over, About sits over any scene and goes back to it', () => {
        expect(walk({ ...fresh(), scene: 'done' }, 'again')).toMatchObject({ scene: 'hint', back: 'done' });
        expect(walk({ ...fresh(), scene: 'look' }, 'again', 'close').scene).toBe('look');
        // In the middle of the build, again is the scene's own hint (main.js says it).
        const floors = walk(fresh(), 'start', HOUSE);
        expect(step(floors, { type: 'again' })).toBe(floors);
        const about = walk(floors, 'about');
        expect(about).toMatchObject({ scene: 'about', back: 'floors' });
        expect(step(about, { type: 'about' })).toBe(about);
        expect(walk(about, 'close').scene).toBe('floors');
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

describe('what is saved for a return', () => {
    test('a step of the first build, else done, and whether it reached the review', () => {
        for (const scene of GUIDED) expect(savedForm({ scene, reviewed: false })).toEqual({ scene, reviewed: false });
        for (const scene of ['hello', 'example2', 'look', 'saved', 'hint', 'about', 'done']) expect(savedForm({ scene, reviewed: true })).toEqual({ scene: 'done', reviewed: true });
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
        if (['home', 'attached'].includes(v.choices)) expect(v.buttons).toEqual([]);
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
        expect(v.skip).toBe(false);
        expect(v.progress).toBeNull();
    });

    test('the kind of home is ONBOARDING Scene 2a, and the floors come next', () => {
        expect(viewFor(walk(fresh(), 'start'))).toMatchObject({ text: 'First, what kind of home is it?', choices: 'home', progress: 0 });
        expect(viewFor(walk(fresh(), 'start', { type: 'residence', kind: 'townhome' }))).toMatchObject({ text: 'Is it an end unit, or between two neighbors?', choices: 'attached' });
        expect(GUIDE.floors).toBe('Next, which floors does your home have?');
        expect(GUIDE.progress[0]).toBe('Your home');
    });

    test('the floors ask for choices and remark on the first tap', () => {
        const floors = viewFor(walk(fresh(), 'start', HOUSE));
        expect(floors.choices).toBe('floors');
        expect(floors.text).toBe(GUIDE.floors);
        expect(viewFor(walk(fresh(), 'start', HOUSE, 'floorTapped')).text).toBe(`${GUIDE.floorsTaking} ${GUIDE.floors}`);
    });

    test('the progress strip follows the first build and only the first build', () => {
        for (const scene of GUIDED) expect(viewFor({ ...fresh(), scene }, ctx).progress).toBe(PROGRESS[scene]);
        for (const scene of ['hello', 'saved', 'example1', 'look', 'welcome', 'hint', 'about']) expect(viewFor({ ...fresh(), scene }, ctx).progress).toBeNull();
        expect(GUIDE.progress).toHaveLength(Math.max(...Object.values(PROGRESS)) + 1);
        // Never backwards along the way.
        const order = GUIDED.map((s) => PROGRESS[s]);
        for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThanOrEqual(order[i - 1]);
    });

    test('the first room says its line from the sheet, or the room plainly', () => {
        expect(viewFor({ ...fresh(), scene: 'added' }, ctx).text).toBe('There is your kitchen.');
        expect(viewFor({ ...fresh(), scene: 'added' }, { roomLabel: 'Kitchen' }).text).toBe("There's your kitchen.");
    });

    test('Review is offered once there are two rooms, and the rooms line warms after two more', () => {
        const rooms = (n, added) => viewFor({ ...fresh(), scene: 'rooms', rooms: added }, { roomCount: n });
        expect(rooms(1, 0).buttons.map((b) => b.id)).toEqual(['addRoom']);
        expect(rooms(2, 1).buttons.map((b) => b.id)).toEqual(['addRoom', 'review']);
        expect(rooms(2, 1).text).toBe(GUIDE.rooms);
        expect(rooms(4, 2).text).toBe(GUIDE.roomsMore);
    });

    test('a return mid-build is offered Keep going, and otherwise just welcomed', () => {
        expect(viewFor({ ...fresh(), scene: 'welcome', resume: 'rooms' }).buttons.map((b) => b.id)).toEqual(['keepGoing', 'lookAround']);
        expect(viewFor({ ...fresh(), scene: 'welcome', resume: null }).buttons.map((b) => b.id)).toEqual(['lookAround']);
    });

    test('done puts the bubble away', () => {
        expect(viewFor({ ...fresh(), scene: 'done' })).toBeNull();
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
