// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Derby Day's challenge links (M8): a car sent to a friend in a link, raced
 * head to head on the friend's own device.
 *
 * What is held here, and why:
 * - THE CAR ARRIVES EXACTLY: the friend's copy is the same build, number for
 *   number, and posts the same times to the microsecond, so "beat my 3.191"
 *   is true on every device.
 * - A LINK IS UNTRUSTED: anything that is not a whole, legal car decodes to
 *   nothing, quickly, and never throws; names lose what could disguise them.
 * - THE WHOLE VISIT WORKS: arriving by a link opens the head to head, the
 *   race is the two cars, the results say who won and what made the
 *   difference, and a challenge goes out by the share sheet or the
 *   clipboard, the first name remembered.
 */
import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { installThree } from './helpers/three-stub.mjs';
import { installDom, fire, flushAsync } from './helpers/dom-stub.mjs';

const { DERBY_CONFIG: C } = await import('../www/derby/js/config.js');
const G = await import('../www/derby/js/garage.js');
const P = await import('../www/derby/js/profile.js');
const Car = await import('../www/derby/js/car.js');
const Sim = await import('../www/derby/js/sim.js');
const Ch = await import('../www/derby/js/challenge.js');
const Copy = await import('../www/derby/js/copy.js');

const style = (s) => {
    expect(s).not.toMatch(/[—;]/);
    expect(s).not.toMatch(/pinewood|scout/i);
};

/** A stock first-visit car, and one worked on in every way the bench allows. */
const stock = () => G.newCar(C, { rand: () => 0.3 });
function worked({ hand = false, rules = 'standard' } = {}) {
    const base = stock();
    let carve = P.carveFrom(base.stations, C);
    carve = P.setPoint(carve, 'top', 0, carve.top[0] - 0.008, C);
    carve = P.setPoint(carve, 'top', 3, carve.top[3] - 0.0037, C);
    let b = G.normalizeBuild({
        ...base, rules, carve, name: 'The Brick Crusher', number: 42,
        tune: { deburr: true, polish: 5, graphite: true, align: true, sand: 0.75 },
        paint: { body: 0x2266cc, stripe: 0xffffff, finish: 'metallic' },
        decals: [{ kind: 'flames', x: 0.1, y: 0.02, size: 'l' }, { kind: 'star', x: 0.05, y: 0.015, size: 's' }]
    }, C);
    b = G.weighAuto(b, C);
    return hand ? { ...b, ballast: 'hand' } : b;
}
const hashOf = (build, from = '') => `#${Ch.encodeChallenge(build, from, C)}`;
const strip = (b) => ({ ...b, id: null });

describe('the link, pure', () => {
    test('a car arrives exactly: the same build, the same times to the microsecond, every kind of car', () => {
        for (const b of [stock(), worked(), worked({ hand: true }), worked({ rules: 'outlaw' })]) {
            const got = Ch.decodeChallenge(hashOf(b, 'Steve'), C);
            expect(got).not.toBeNull();
            expect(got.from).toBe('Steve');
            expect(got.build.id).toBe(Ch.CHALLENGE.rivalId);
            expect(strip(got.build)).toEqual(strip(b));
            const mine = Sim.runRace([Car.describeCar(b, C)], C);
            const theirs = Sim.runRace([Car.describeCar(got.build, C)], C);
            expect(theirs.runs[0].map((r) => r.time)).toEqual(mine.runs[0].map((r) => r.time));
            expect(theirs.average).toEqual(mine.average);
        }
    });

    test('short enough to text: a stock car about 200 characters, a worked one under 1000', () => {
        const url = (b, from) => Ch.challengeUrl('https://scenexp.com/derby/', b, from, C);
        expect(url(stock(), '').length).toBeLessThan(260);
        expect(url(worked(), 'Steve').length).toBeLessThan(1000);
        expect(url(worked({ hand: true }), 'Steve').length).toBeLessThan(1200);
        // A stack of identical weights goes as one entry.
        const packed = Ch.packBuild(worked({ hand: true }), C);
        expect(packed.w.length).toBeLessThan(worked({ hand: true }).weights.length);
        // Weighed by Auto-weigh: no weights sent at all.
        expect(Ch.packBuild(worked(), C).w).toBe(0);
    });

    test('the link is the page\'s own address, without its query or an old challenge, and only a fragment holds the car', () => {
        const u = new URL(Ch.challengeUrl('http://localhost:8000/derby/?utm=x#challenge=1.old', stock(), 'Steve', C));
        expect(u.origin + u.pathname).toBe('http://localhost:8000/derby/');
        expect(u.search).toBe('');
        expect(u.hash.startsWith('#challenge=1.')).toBe(true);
        expect(u.hash).not.toContain('old');
        // Nothing but the fragment differs from the page's address.
        expect(u.href.split('#')[0]).toBe('http://localhost:8000/derby/');
    });

    test('anything that is not a whole, legal car is nothing, and never throws', () => {
        const good = hashOf(stock(), 'Steve');
        const body = good.split('.')[1];
        const enc = (obj) => `#challenge=1.${Buffer.from(JSON.stringify(obj)).toString('base64url')}`;
        const bad = [
            '', '#', '#somewhere', '#challenge=', '#challenge=2.' + body, '#challenge=1.', '#challenge=1.@@@@',
            '#challenge=1.' + body + '!', '#challenge=1.' + 'A'.repeat(Ch.CHALLENGE.maxLength), '#challenge=1.//8=',
            enc([1, 2, 3]), enc('car'), enc({}), enc({ car: null }), enc({ car: [] }),
            // Too heavy for its sheet: a hand-written link stacking weights.
            enc({ car: { ...Ch.packBuild(stock(), C), b: 1, w: [['cylinder', 0.15, 128]] } }),
            // A count no link may ask for, capped before anything is made.
            enc({ car: { ...Ch.packBuild(stock(), C), b: 1, w: [['cylinder', 0.15, 1e9]] } })
        ];
        // A whole, legal car padded past the cap: never decoded at all.
        bad.push(enc({ car: Ch.packBuild(stock(), C), pad: 'x'.repeat(Ch.CHALLENGE.maxLength) }));
        expect(Ch.decodeChallenge(enc({ car: Ch.packBuild(stock(), C), pad: 'x' }), C)).not.toBeNull();
        for (const h of bad) {
            const t = Date.now();
            expect(Ch.decodeChallenge(h, C)).toBeNull();
            expect(Date.now() - t).toBeLessThan(500);
        }
        expect(Ch.decodeChallenge(null, C)).toBeNull();
        expect(Ch.isChallenge('#challenge=1.x')).toBe(true);
        expect(Ch.isChallenge('#other')).toBe(false);
        // Not-UTF-8 bytes are refused, not guessed at.
        expect(Ch.decodeChallenge(`#challenge=1.${Buffer.from([0xff, 0xfe, 0x7b]).toString('base64url')}`, C)).toBeNull();
        // Unknown fields are dropped, every number clamped to the block.
        const odd = Ch.decodeChallenge(enc({ car: { ...Ch.packBuild(stock(), C), d: 'rocket', t: [1, 99, 1, 1, 7], extra: '<script>' }, from: 'Steve' }), C);
        expect(odd).not.toBeNull();
        expect(C.bench.designs).toContain(odd.build.design);
        expect(odd.build.tune.polish).toBe(C.physics.axleFriction.polish.length);
        expect(odd.build.tune.sand).toBe(1);
        expect(odd.build.extra).toBeUndefined();
    });

    test('names lose what could disguise them, and are cut short', () => {
        const got = Ch.decodeChallenge(hashOf({ ...stock(), name: 'Fast‮\u0007 Car' }, '  Ste​ve⁦\n  '), C);
        expect(got.from).toBe('Steve');
        expect(got.build.name).toBe('Fast Car');
        expect([...Ch.cleanFrom('Bartholomew-Alexander the Third')]).toHaveLength(Ch.CHALLENGE.fromMax);
        expect(Ch.cleanFrom(7)).toBe('');
        // Text stays text: markup is only ever set with textContent.
        expect(Ch.cleanFrom('<img src=x>')).toBe('<img src=x>');
        expect(Ch.rivalName('Blue Wedge', 'Steve')).toBe('Steve’s Blue Wedge');
        expect(Ch.rivalName('Blue Wedge', '')).toBe('Blue Wedge');
    });

    test('what made the difference: the winner\'s tune-up worth most on the loser\'s own car', () => {
        const fast = worked();
        const slow = stock();
        const edge = Ch.biggestEdge(fast, slow, C);
        expect(['deburr', 'polish', 'graphite', 'align', 'sand']).toContain(edge.id);
        expect(edge.worth).toBeGreaterThan(0.005);
        // It is the biggest: no single step of the winner's is worth more.
        for (const id of ['deburr', 'polish', 'graphite', 'align', 'sand']) {
            const only = { ...slow, tune: { ...slow.tune, [id]: fast.tune[id] } };
            const gain = Sim.neutralTime(Car.describeCar(slow, C), C) - Sim.neutralTime(Car.describeCar(only, C), C);
            expect(gain).toBeLessThanOrEqual(edge.worth + 1e-12);
        }
        // Tuned alike, or the loser better in every step: nothing to say.
        expect(Ch.biggestEdge(fast, fast, C)).toBeNull();
        expect(Ch.biggestEdge(slow, fast, C)).toBeNull();
    });

    test('the words keep the house style, and never say pinewood or scout', () => {
        const C2 = Copy.CHALLENGE;
        for (const s of [C2.event, C2.blurb('Steve’s Blue Wedge'), C2.invite('Steve', 'Blue Wedge'), C2.invite('', 'Blue Wedge'), C2.inviteMore, C2.bad,
            C2.heading, C2.won('X', '0.010'), C2.lost('X', '0.010'), C2.tie('X'), C2.theirEdge('graphite on the axles', '0.030'),
            C2.yourEdge('aligned wheels', '0.020'), C2.even, C2.send, C2.sendBack, C2.title, C2.text('Blue Wedge'), C2.fromLabel, C2.share,
            C2.copy, C2.done, C2.note, C2.shareText('Steve', 'Blue Wedge', '3.191'), C2.shareText('', 'Blue Wedge', '3.191'),
            C2.shared, C2.copied, C2.manual]) style(s);
        expect(Copy.edgeWords({ id: 'polish', level: 5 })).toBe('axles polished to 2000 grit and polishing compound');
        expect(Copy.edgeWords({ id: 'sand' })).toBe('sanded edges');
        expect(Copy.edgeWords(null)).toBe('');
        expect(Copy.eventLabel('challenge')).toBe('Head to head');
        expect(G.canEnter({ rules: 'outlaw' }, 'challenge')).toBe('ok');
    });
});

describe('the visit', () => {
    let dom;
    beforeEach(() => {
        jest.resetModules();
        jest.useFakeTimers({ doNotFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'queueMicrotask', 'nextTick', 'setImmediate'] });
        installThree();
        dom = installDom({ innerWidth: 390, innerHeight: 844 });
    });
    afterEach(() => {
        jest.clearAllTimers();
        jest.useRealTimers();
        dom.uninstall();
    });

    async function boot(hash = '') {
        dom.windowStub.location.hash = hash;
        dom.windowStub.location.href = `http://localhost:8000/test/${hash}`;
        const main = await import('../www/derby/js/main.js');
        await flushAsync(30);
        await jest.advanceTimersByTimeAsync(500);
        return main;
    }
    function frames(main, seconds, fps = 30) {
        const loop = dom.loops[dom.loops.length - 1];
        const spy = jest.spyOn(performance, 'now');
        let now = main.getState().lastTime;
        for (let i = 1; i <= Math.round(seconds * fps); i++) {
            now += 1000 / fps;
            spy.mockReturnValue(now);
            loop();
        }
        spy.mockRestore();
    }
    const open = (id) => !dom.el(id).classList.contains('hidden');
    const inputsOf = (id) => dom.el(id).children.map((label) => label.children[0]);
    const textOf = (node) => (node.children && node.children.length ? node.children.map(textOf).join(' ') : node.textContent);

    test('arriving by a friend\'s link opens the head to head, races the two cars, and says who won and why', async () => {
        const main = await boot(hashOf(worked(), 'Steve'));
        const state = main.getState();
        expect(state.phase).toBe('checkin');
        expect(open('blocker')).toBe(true);
        const invite = dom.el('checkin-invite');
        expect(invite.hidden).toBe(false);
        expect(textOf(invite)).toMatch(/^Steve has challenged you to a race against The Brick Crusher! Choose your car/);
        const events = inputsOf('event-options');
        expect(events[0].value).toBe('challenge');
        expect(events[0].checked).toBe(true);
        expect(dom.el('event-options').children[0].textContent).toMatch(/^Head to head.*Steve’s The Brick Crusher/);
        // Go: the visitor's car weighed in, then the two of them.
        fire(dom.el('go-btn'), 'click');
        fire(dom.el('skip-btn'), 'click');
        expect(state.phase).toBe('race');
        expect(state.day.entries.map((e) => e.name)).toEqual(['Blue Wedge', 'Steve’s The Brick Crusher']);
        expect(state.day.race.heats).toHaveLength(4);
        expect(state.day.race.heats.every((h) => h.length === 2)).toBe(true);
        // The friend's car runs the very times it ran at home.
        const home = Sim.runRace([Car.describeCar(worked(), C)], C);
        for (const lane of [0, 1, 2, 3]) expect(state.day.race.runs[1][lane].time).toBe(home.runs[0][lane].time);
        // A friend's car brings no family, so no dance when it wins.
        expect(state.day.plan.heats.flatMap((h) => h.segments).some((s) => s.kind === 'dance')).toBe(false);
        frames(main, state.day.plan.total + 1);
        expect(state.phase).toBe('results');
        expect(dom.el('results-event').textContent).toBe('Head to head');
        const why = dom.el('results-why').children.map((li) => li.textContent);
        expect(why[0]).toMatch(/^Steve’s The Brick Crusher wins by \d\.\d{3} seconds\.$/);
        expect(why[1]).toMatch(/^The biggest difference was their .+\. On your car, it would be worth about \d\.\d{3} seconds\.$/);
        expect(dom.el('results-why-heading').textContent).toBe('How the two cars compared');
        expect(dom.el('results-challenge').textContent).toBe('Send a challenge back');
        // Between the two of them: nothing kept as a best or a trophy.
        expect(main.__test__.garage().last()).toBeNull();
        // Tune my car: the host points at what beat it.
        fire(dom.el('results-tune'), 'click');
        expect(dom.el('bench-host').textContent).toMatch(/The biggest difference was their/);
        // The challenge stays on offer at check-in.
        fire(dom.el('bench-race'), 'click');
        expect(inputsOf('event-options')[0].value).toBe('challenge');
    });

    test('beating a friend\'s car: said so, the family dances, and no trophy or best is claimed for it', async () => {
        // The visitor's own garage holds a worked car; the friend sent a stock one.
        localStorage.setItem('derby-garage', JSON.stringify({ v: 1, cars: [worked()], bench: worked().id }));
        const main = await boot(hashOf(stock(), 'Ann'));
        const state = main.getState();
        fire(dom.el('go-btn'), 'click');
        fire(dom.el('skip-btn'), 'click');
        expect(state.day.entries[0].mine).toBe(true);
        expect(state.day.race.standings[0]).toBe(0);
        // The visitor's family is by the track, so the finale dances.
        expect(state.day.plan.heats.flatMap((h) => h.segments).some((s) => s.kind === 'dance')).toBe(true);
        main.__test__.finishRace('skip');
        const why = dom.el('results-why').children.map((li) => li.textContent);
        expect(why[0]).toMatch(/^You beat Ann’s Blue Wedge by \d\.\d{3} seconds!$/);
        expect(why[1]).toMatch(/ made the biggest difference, worth about \d\.\d{3} seconds/);
        expect(dom.el('results-trophy').hidden).toBe(true);
        expect(dom.el('results-harder').hidden).toBe(true);
        expect(main.__test__.garage().last()).toBeNull();
        expect(main.__test__.garage().trophies()).toEqual(G.normalizeTrophies(null));
    });

    test('a link that does not come through whole lands at the workbench, kindly said', async () => {
        const main = await boot('#challenge=1.@@not-a-car');
        expect(main.getState().phase).toBe('bench');
        expect(dom.el('bench-host').textContent).toBe(Copy.CHALLENGE.bad);
        expect(main.getState().challenge).toBeNull();
        expect(inputsOf('event-options').map((i) => i.value)).not.toContain('challenge');
    });

    test('a challenge link opened in a tab already on the page opens the head to head', async () => {
        const main = await boot();
        expect(main.getState().phase).toBe('bench');
        dom.windowStub.location.hash = hashOf(stock(), 'Ann');
        fire(dom.windowStub, 'hashchange');
        expect(main.getState().phase).toBe('checkin');
        expect(textOf(dom.el('checkin-invite'))).toMatch(/^Ann has challenged you/);
    });

    test('Challenge a friend: the main button, the share sheet with the link, the name remembered, and the clip carries the link too', async () => {
        const main = await boot();
        const state = main.getState();
        fire(dom.el('bench-race'), 'click');
        fire(dom.el('go-btn'), 'click');
        fire(dom.el('skip-btn'), 'click');
        main.__test__.finishRace('skip');
        // The one filled button is the challenge (Steve), the clip second.
        const html = readFileSync(new URL('../www/derby/index.html', import.meta.url), 'utf8');
        expect(html).toMatch(/<button id="results-challenge" class="go-btn"/);
        expect(html).toMatch(/<button id="results-share" class="results-another"/);
        expect(html.indexOf('id="results-challenge"')).toBeLessThan(html.indexOf('id="results-share"'));
        expect(dom.el('results-challenge').textContent).toBe('Challenge a friend');
        let sent = null;
        globalThis.navigator.share = jest.fn((data) => {
            sent = data;
            return Promise.resolve();
        });
        fire(dom.el('results-challenge'), 'click');
        expect(open('challenge-modal')).toBe(true);
        expect(globalThis.document.activeElement).toBe(dom.el('challenge-title'));
        expect(dom.el('challenge-text').textContent).toBe('Send Blue Wedge to a friend. They race their own car against it, head to head.');
        dom.el('challenge-from').value = ' Steve ';
        fire(dom.el('challenge-send'), 'click');
        await flushAsync(5);
        expect(sent.text).toMatch(/^Steve challenges you to a derby race! Can your car beat Blue Wedge\? It averaged \d\.\d{3} seconds at Derby Day\.$/);
        const got = Ch.decodeChallenge(new URL(sent.url).hash, C);
        expect(got.from).toBe('Steve');
        expect(strip(got.build)).toEqual(strip(state.day.entries[0].build));
        expect(dom.el('challenge-status').textContent).toBe(Copy.CHALLENGE.shared);
        expect(main.__test__.garage().settings().from).toBe('Steve');
        // Closed, focus back on the button; opened again, the name is there.
        fire(dom.windowStub, 'keydown', { key: 'Escape' });
        fire(dom.documentStub, 'keydown', { key: 'Escape' });
        expect(open('challenge-modal')).toBe(false);
        expect(globalThis.document.activeElement).toBe(dom.el('results-challenge'));
        fire(dom.el('results-challenge'), 'click');
        expect(dom.el('challenge-from').value).toBe('Steve');
        // Typing an M in the name does not toggle the sound (the stub's
        // element told what the page's markup makes it).
        Object.assign(dom.el('challenge-from'), { tagName: 'INPUT', type: 'text' });
        const before = main.__test__.sound.isOn();
        fire(dom.documentStub, 'keydown', { key: 'm', target: dom.el('challenge-from') });
        expect(main.__test__.sound.isOn()).toBe(before);
        // The share sheet closed without sending: nothing said.
        globalThis.navigator.share = jest.fn(() => Promise.reject(Object.assign(new Error('x'), { name: 'AbortError' })));
        fire(dom.el('challenge-send'), 'click');
        await flushAsync(5);
        expect(dom.el('challenge-status').textContent).toBe('');
        // The clip's words carry the challenge too.
        expect(main.__test__.shareLine()).toMatch(/Can you beat it\? http:\/\/localhost:8000\/test\/#challenge=1\./);
    });

    test('no share sheet: the link is copied, and where the clipboard is refused, shown to copy by hand', async () => {
        const main = await boot();
        fire(dom.el('bench-race'), 'click');
        fire(dom.el('go-btn'), 'click');
        fire(dom.el('skip-btn'), 'click');
        main.__test__.finishRace('skip');
        let copied = null;
        globalThis.navigator.clipboard = { writeText: jest.fn((t) => { copied = t; return Promise.resolve(); }) };
        fire(dom.el('results-challenge'), 'click');
        fire(dom.el('challenge-send'), 'click');
        await flushAsync(5);
        expect(copied).toMatch(/#challenge=1\./);
        expect(Ch.decodeChallenge(new URL(copied).hash, C).from).toBe('');
        expect(dom.el('challenge-status').textContent).toBe(Copy.CHALLENGE.copied);
        globalThis.navigator.clipboard = { writeText: () => Promise.reject(new Error('denied')) };
        fire(dom.el('challenge-copy'), 'click');
        await flushAsync(5);
        const box = dom.el('challenge-link');
        expect(box.hidden).toBe(false);
        expect(box.value).toMatch(/#challenge=1\./);
        expect(dom.el('challenge-status').textContent).toBe(Copy.CHALLENGE.manual);
        fire(dom.el('challenge-close'), 'click');
        expect(open('challenge-modal')).toBe(false);
    });
});
