// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * xo-practice.test.mjs - Practice Mode (Steve, 2026-11-02): the same ten plays
 * with no defense on the field, at `?practice=true`.
 *
 * What these hold is what would go wrong quietly. The score of a game with no
 * defense is close to automatic, so the suite's main job is the real game: its
 * saved progress, its best score and its stadium shows have to come through a
 * practice game untouched, and its own line-up has to keep its defense.
 */
import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { readFile } from 'node:fs/promises';
import { installThree } from './helpers/three-stub.mjs';
import { installDom, flushAsync } from './helpers/dom-stub.mjs';

const GAME_KEY = 'exes-n-ohs-game';
const BEST_KEY = 'exes-n-ohs-best-score';
const PLAY_KEY = 'exes-n-ohs-play-settings';
const PRACTICE = 'http://localhost:8000/xo/?practice=true';

let dom;
let sent;

beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    installThree();
    dom = installDom();
    sent = [];
    globalThis.Image = class { set src(url) { sent.push(new URL(url, 'http://localhost:8000/xo/')); } };
    globalThis.localStorage = {
        store: new Map(),
        getItem(k) { return this.store.has(k) ? this.store.get(k) : null; },
        setItem(k, v) { this.store.set(k, String(v)); },
        removeItem(k) { this.store.delete(k); },
    };
});

afterEach(() => {
    dom.uninstall();
    jest.useRealTimers();
    delete globalThis.localStorage;
    delete globalThis.Image;
});

/** Every descendant of a node. */
function deep(node) {
    if (!node || !node.children) return [node];
    return [node, ...node.children.flatMap(deep)];
}

const labels = (id) => dom.el(id).children.map((b) => b.textContent);
const buttonNamed = (id, name) => dom.el(id).children.find((b) => b.textContent === name);

/** Load the page at `href`. Unless told to watch, the opening of a real game
 *  is skipped, which lands on the welcome card. */
async function boot(href = 'http://localhost:8000/xo/', { skip = true } = {}) {
    dom.windowStub.location.href = href;
    const main = await import('../www/xo/js/main.js');
    await flushAsync();
    await jest.advanceTimersByTimeAsync(1200);
    if (skip) {
        const button = dom.el('hud-actions').children.find((b) => b.id === 'skip-opening-btn');
        if (button) button.click();
        await flushAsync();
    }
    return main;
}

/** Call the first card in the book. */
async function callPlay() {
    const body = dom.el('playbook').querySelector('.playbook-body');
    deep(body).find((n) => n.dataset && n.dataset.slug).click();
    await flushAsync();
}

/** Snap, throw, and run the frames to the result card. */
async function playOneDown(clock) {
    await callPlay();
    const press = (label) => {
        const b = dom.el('hud-actions').children.find((x) => (x.textContent || '').startsWith(label));
        expect(b).toBeTruthy();
        b.click();
    };
    press('Snap the ball');
    await flushAsync();
    // A second of reading the field, as a person would. A throw on the snap's
    // own frame falls incomplete, and these tests want the fifties a practice
    // game really scores, which are what could set off a show or a new best.
    for (let i = 0; i < 60; i += 1) {
        clock.now += 16.7;
        dom.loops[0](clock.now);
    }
    press('Throw');
    await flushAsync();
    for (let i = 0; i < 2400 && dom.el('result').hidden !== false; i += 1) {
        clock.now += 16.7;
        dom.loops[0](clock.now);
    }
    expect(dom.el('result').hidden).toBe(false);
}

const pings = (action) => sent.filter((u) => u.searchParams.get('action') === action);
const practiceTagged = (u) => new URLSearchParams(u.searchParams.get('outcome') || '').get('practice') === 'true';

describe('the address', () => {
    test('only ?practice=true is practice, and the two addresses go both ways', async () => {
        const P = await import('../www/xo/js/practice.js');
        expect(P.isPracticeUrl(PRACTICE)).toBe(true);
        expect(P.isPracticeUrl('http://localhost:8000/xo/')).toBe(false);
        expect(P.isPracticeUrl('http://localhost:8000/xo/?practice=false')).toBe(false);
        expect(P.isPracticeUrl('http://localhost:8000/xo/?practice')).toBe(false);
        expect(P.isPracticeUrl('not an address')).toBe(false);

        expect(P.practiceUrl('http://localhost:8000/xo/')).toBe(PRACTICE);
        // Whatever else the address carries stays.
        expect(P.practiceUrl('http://localhost:8000/xo/?qa=1')).toBe('http://localhost:8000/xo/?qa=1&practice=true');
        expect(P.realGameUrl(PRACTICE)).toBe('http://localhost:8000/xo/');
        expect(P.realGameUrl('http://localhost:8000/xo/?qa=1&practice=true')).toBe('http://localhost:8000/xo/?qa=1');
        expect(P.practiceUrl('not an address')).toBe('not an address');
    });

    test('search engines still see one page', async () => {
        const page = await readFile(new URL('../www/xo/index.html', import.meta.url), 'utf8');
        expect(page).toContain('<link rel="canonical" href="https://www.scenexp.com/xo/">');
    });
});

describe('who the visitor can be', () => {
    test('a defender plays quarterback here, and an offensive player stays who they are', async () => {
        const { practiceSlot } = await import('../www/xo/js/practice.js');
        expect(practiceSlot('db1')).toBe('qb');
        expect(practiceSlot('wr3')).toBe('wr3');
        expect(practiceSlot('qb')).toBe('qb');
        expect(practiceSlot('nonsense')).toBe('qb');
    });
});

describe('the field', () => {
    const lineUpBoth = async () => {
        const P = await import('../www/xo/js/play.js');
        const practice = P.createPlay();
        practice.practice = true;
        const real = P.createPlay();
        return { P, practice, real };
    };

    test('every defender is benched, the offense stands where it always does, and the real game keeps its defense', async () => {
        const { P, practice, real } = await lineUpBoth();
        const team = (play) => play.game.objects.filter((o) => o.settings.team === 0);
        for (const slug of P.OFFENSIVE_PLAYS) {
            P.lineUp(practice, slug, '');
            P.lineUp(real, slug, 'cover2');
            const defense = practice.game.objects.filter((o) => o.settings.team === 1);
            expect(defense.length).toBeGreaterThan(0);
            expect(defense.every((o) => o.settings.benched)).toBe(true);
            expect(real.game.objects.filter((o) => o.settings.team === 1 && !o.settings.benched).length)
                .toBeGreaterThan(0);
            // Who plays is exact. Where they stand is the formation's, to within
            // what the library's own rolled speeds do to a settling line-up.
            expect(team(practice).map((o) => [o.settings.position, o.settings.benched]))
                .toEqual(team(real).map((o) => [o.settings.position, o.settings.benched]));
            team(practice).forEach((o, i) => {
                const other = team(real)[i];
                if (o.settings.benched) return;
                expect(Math.hypot(o.coords.x - other.coords.x, o.coords.y - other.coords.y)).toBeLessThan(12);
            });
            // Nothing to report as a defense faced, and a real play still names it.
            expect(practice.defense).toBe('');
            expect(real.defense).toBe('cover2');
        }
    });

    test('a defense asked for is still not there', async () => {
        const { P, practice } = await lineUpBoth();
        P.lineUp(practice, 'pass2', 'cover3');
        expect(practice.game.objects.filter((o) => o.settings.team === 1).every((o) => o.settings.benched)).toBe(true);
    });

    test('a ball held too long is the clock, and it costs what a sack costs', async () => {
        const { P, practice, real } = await lineUpBoth();
        for (const [play, headline] of [[practice, 'Out of time'], [real, 'Sacked']]) {
            P.lineUp(play, 'pass2', play === real ? 'cover2' : '');
            P.snap(play);
            for (let f = 0; f < 3000 && !P.isDone(play); f += 1) P.tick(play);
            const result = P.outcome(play);
            expect(result.headline).toBe(headline);
            expect(result.result).toBe('sack');
            expect(result.points).toBe(-5);
        }
    });
});

describe('arriving on a practice link', () => {
    test('goes straight to the welcome card, with no opening and no real game offered', async () => {
        localStorage.setItem(GAME_KEY, JSON.stringify({
            v: 1, playNumber: 2, total: 40,
            results: [
                { headline: 'Caught', detail: '', points: 15, result: 'catch' },
                { headline: 'Caught', detail: '', points: 25, result: 'catch' },
            ],
        }));
        // The stub reads no markup, so these start as the page has them.
        dom.el('hud-practice').hidden = true;
        dom.el('welcome-practice').hidden = true;
        const main = await boot(PRACTICE, { skip: false });
        expect(main.__test__.phase()).toBe('welcome');
        expect(dom.el('hud-actions').children.some((b) => b.id === 'skip-opening-btn')).toBe(false);
        expect(pings('opening').length).toBe(0);
        expect(dom.el('welcome').hidden).toBe(false);
        expect(labels('welcome-actions')).toEqual(['Start practice', 'Play the real game']);
        expect(dom.el('welcome-resume').hidden).toBe(true);
        // Said three ways: the card, the HUD and the body class behind the copy.
        expect(dom.el('welcome-practice').hidden).toBe(false);
        expect(dom.el('hud-practice').hidden).toBe(false);
        expect(document.body.classList.contains('is-practice')).toBe(true);
    });

    test('lines up with every defender benched (xo-practice-drawn holds what is drawn)', async () => {
        const main = await boot(PRACTICE, { skip: false });
        const defense = main.__test__.play().game.objects.filter((o) => o.settings.team === 1);
        expect(defense.length).toBeGreaterThan(0);
        for (const o of defense) expect(o.settings.benched).toBe(true);
    });

    test('the book has no Defense to face, and offers the real game in its place', async () => {
        await boot(PRACTICE, { skip: false });
        const body = dom.el('playbook').querySelector('.playbook-body');
        const nodes = deep(body);
        const select = nodes.find((n) => n.id === 'defense-select');
        expect(select.parentNode.hidden).toBe(true);
        const row = nodes.find((n) => n.className === 'playbook-defense playbook-practice');
        expect(row.hidden).toBe(false);
        expect(row.children[0].textContent).toMatch(/no defense on the field/);
        expect(row.children[1].textContent).toBe('Play the real game');
    });

    test('Play the real game leaves for the address without the parameter', async () => {
        await boot(PRACTICE, { skip: false });
        buttonNamed('welcome-actions', 'Play the real game').click();
        expect(dom.replaced).toEqual(['http://localhost:8000/xo/']);
    });
});

describe('the welcome card button on a real visit', () => {
    test('the real card offers it, without disturbing what comes first', async () => {
        const main = await boot();
        expect(labels('welcome-actions')).toEqual(['Take the field', 'Practice Mode']);
        expect(dom.el('welcome-actions').children[0].focused).toBe(true);
        // The stub reads no markup, so the words' resting state is held in `the page`.
        expect(document.body.classList.contains('is-practice')).toBe(false);
        expect(main.__test__.play().practice).toBeFalsy();
        // The defense is on the field until somebody says otherwise.
        expect(main.__test__.play().game.objects.some((o) => o.settings.team === 1 && !o.settings.benched)).toBe(true);
    });

    test('a saved game keeps its own buttons beside it', async () => {
        localStorage.setItem(GAME_KEY, JSON.stringify({
            v: 1, playNumber: 1, total: 15,
            results: [{ headline: 'Caught', detail: '', points: 15, result: 'catch' }],
        }));
        await boot();
        expect(labels('welcome-actions')).toEqual(['Back to the game', 'Start a new game', 'Practice Mode']);
    });

    test('pressing it writes the address, clears the field, and opens the book with no reload', async () => {
        const written = [];
        dom.windowStub.history.replaceState = (_s, _t, url) => { written.push(url); };
        const main = await boot();
        buttonNamed('welcome-actions', 'Practice Mode').click();
        await flushAsync();
        expect(written).toEqual([PRACTICE]);
        expect(dom.replaced).toEqual([]);
        expect(main.__test__.phase()).toBe('playbook');
        expect(main.__test__.play().practice).toBe(true);
        expect(main.__test__.play().game.objects.filter((o) => o.settings.team === 1)
            .every((o) => o.settings.benched)).toBe(true);
        expect(dom.el('hud-practice').hidden).toBe(false);
        expect(document.body.classList.contains('is-practice')).toBe(true);
        expect(pings('practice-mode').length).toBe(1);
    });

    test('a visitor saved as a defender takes the snap here, and their saved choice waits for the real game', async () => {
        const { createAvatarStore } = await import('../www/shared/js/avatar-1.0.0.js');
        createAvatarStore({ win: null }).save({ skin: 'deep', shirt: 'teal', handedness: 'left' });
        localStorage.setItem(PLAY_KEY, JSON.stringify({ lastPlay: 'pass1', playAs: 'db1' }));
        const main = await boot();
        expect(main.getState().playAs).toBe('db1');
        buttonNamed('welcome-actions', 'Practice Mode').click();
        await flushAsync();
        expect(main.getState().playAs).toBe('qb');
        const roster = await import('../www/xo/js/roster.min.js');
        expect(roster.isVisitorFigure(roster.figureFor('qb'))).toBe(true);
        expect(roster.isVisitorFigure(roster.figureFor('db1'))).toBe(false);
        expect(JSON.parse(localStorage.getItem(PLAY_KEY)).playAs).toBe('db1');

        // The list offers nobody on the other side, and the console cannot
        // put them there either.
        const select = deep(dom.el('playbook').querySelector('.playbook-body')).find((n) => n.id === 'play-as-select');
        expect(select.value).toBe('qb');
        expect(select.children.map((g) => g.label)).toEqual(['Offense']);
    });

    test('a practice link reads a saved defender the same way', async () => {
        const { createAvatarStore } = await import('../www/shared/js/avatar-1.0.0.js');
        createAvatarStore({ win: null }).save({ skin: 'deep', shirt: 'teal', handedness: 'left' });
        localStorage.setItem(PLAY_KEY, JSON.stringify({ lastPlay: 'pass1', playAs: 'db1' }));
        const main = await boot(PRACTICE, { skip: false });
        expect(main.getState().playAs).toBe('qb');
        const roster = await import('../www/xo/js/roster.min.js');
        expect(roster.isVisitorFigure(roster.figureFor('qb'))).toBe(true);
    });
});

describe('a practice game leaves the real game alone', () => {
    const SAVED = JSON.stringify({
        v: 1, playNumber: 3, total: 45,
        results: [1, 2, 3].map(() => ({ headline: 'Caught', detail: '', points: 15, result: 'catch' })),
    });

    test('through a whole game of ten: saved game, best score, no shows, its own summary', async () => {
        localStorage.setItem(GAME_KEY, SAVED);
        localStorage.setItem(BEST_KEY, '120');
        const main = await boot(PRACTICE, { skip: false });
        buttonNamed('welcome-actions', 'Start practice').click();
        await flushAsync();

        const clock = { now: 0 };
        for (let n = 1; n <= 10; n += 1) {
            await playOneDown(clock);
            expect(dom.el('result-running').textContent).toMatch(new RegExp(`^Practice score -?\\d+ after ${n} of 10$`));
            expect(localStorage.getItem(GAME_KEY)).toBe(SAVED);
            buttonNamed('result-actions', n === 10 ? 'See how you did' : 'Next play').click();
            await flushAsync();
            // Every total a fifty could reach has gone past with no show.
            expect(main.__test__.phase()).not.toBe('show');
            expect(main.__test__.level()).toBe(0);
        }

        // ...and it really was a game that would have earned every one of them.
        expect(dom.el('summary-total').textContent).toBe('500');
        expect(pings('milestone').length).toBe(0);
        expect(dom.el('summary').hidden).toBe(false);
        expect(dom.el('summary-verdict').textContent).toMatch(/^Practice complete\./);
        expect(dom.el('summary-best').textContent).toBe('Practice scores do not count toward your best.');
        expect(localStorage.getItem(BEST_KEY)).toBe('120');
        expect(localStorage.getItem(GAME_KEY)).toBe(SAVED);
        expect(labels('summary-actions')).toEqual(['Practice again', 'Play the real game']);
        expect(new URLSearchParams(pings('game-summary')[0].searchParams.get('outcome')).get('practice')).toBe('true');
        expect(pings('game-summary')[0].searchParams.get('kind')).toBe('practice');

        // Another ten start where this one did, and still leave it all alone.
        buttonNamed('summary-actions', 'Practice again').click();
        await flushAsync();
        expect(main.__test__.phase()).toBe('playbook');
        expect(main.__test__.play().practice).toBe(true);
        expect(localStorage.getItem(GAME_KEY)).toBe(SAVED);
    }, 120000);

    test('Start over in the book forgets the practice game and not the real one', async () => {
        localStorage.setItem(GAME_KEY, SAVED);
        const main = await boot(PRACTICE, { skip: false });
        buttonNamed('welcome-actions', 'Start practice').click();
        await flushAsync();
        const clock = { now: 0 };
        await playOneDown(clock);
        const again = deep(dom.el('result-actions')).find((b) => b.textContent === 'Next play');
        again.click();
        await flushAsync();
        expect(main.__test__.phase()).toBe('playbook');
        const head = deep(dom.el('playbook').querySelector('.playbook-head'));
        head.find((n) => n.textContent === 'Start over').click();
        head.find((n) => n.textContent === 'Start over?').click();
        await flushAsync();
        // It did start over: the score went back to nothing.
        expect(dom.el('hud-score').textContent).toBe('0');
        expect(localStorage.getItem(GAME_KEY)).toBe(SAVED);
    }, 60000);

    test('a real game on the same page still saves, and still keeps its best', async () => {
        await boot();
        dom.el('welcome-actions').children[0].click();
        await flushAsync();
        await playOneDown({ now: 0 });
        const saved = JSON.parse(localStorage.getItem(GAME_KEY));
        expect(saved.playNumber).toBe(1);
        expect(dom.el('result-running').textContent).toMatch(/^Score /);
    }, 60000);
});

describe('the usage log', () => {
    test('every ping of a practice visit says so, and the defense it faced is none', async () => {
        await boot(PRACTICE, { skip: false });
        buttonNamed('welcome-actions', 'Start practice').click();
        await flushAsync();
        await playOneDown({ now: 0 });
        expect(sent.length).toBeGreaterThan(4);
        for (const u of sent) expect(practiceTagged(u)).toBe(true);
        const call = new URLSearchParams(pings('call-play')[0].searchParams.get('outcome'));
        expect(call.get('defense')).toBe('none');
        const result = new URLSearchParams(pings('play-result')[0].searchParams.get('outcome'));
        expect(result.get('defense')).toBe(null);
    }, 60000);

    test('nothing in a real visit does', async () => {
        await boot();
        dom.el('welcome-actions').children[0].click();
        await flushAsync();
        await playOneDown({ now: 0 });
        for (const u of sent) expect(practiceTagged(u)).toBe(false);
    }, 60000);

    test('the tag joins a ping with no detail of its own, keeps the detail of one that has it, and goes when cleared', async () => {
        const T = await import('../www/xo/js/telemetry.min.js');
        sent.length = 0;
        T.tagReports({ practice: true });
        T.report('tag-a', { kind: 'x' });
        T.report('tag-b', { outcome: { points: 5 } });
        T.tagReports(null);
        T.report('tag-c', { outcome: { points: 5 } });
        await flushAsync();
        const detail = (action) => new URLSearchParams(pings(action)[0].searchParams.get('outcome') || '');
        expect(detail('tag-a').get('practice')).toBe('true');
        expect(detail('tag-b').get('practice')).toBe('true');
        expect(detail('tag-b').get('points')).toBe('5');
        expect(detail('tag-c').get('practice')).toBe(null);
    });

    test('pressing the button on a real visit tags what comes after it', async () => {
        await boot();
        buttonNamed('welcome-actions', 'Practice Mode').click();
        await flushAsync();
        await callPlay();
        expect(practiceTagged(pings('call-play')[0])).toBe(true);
        expect(practiceTagged(pings('session-start')[0])).toBe(false);
    }, 60000);
});

describe('what a run of fifties would otherwise do', () => {
    test('the offense is not slowed for a defense that is not there', async () => {
        const main = await boot(PRACTICE, { skip: false });
        buttonNamed('welcome-actions', 'Start practice').click();
        await flushAsync();
        const clock = { now: 0 };
        for (let n = 0; n < 4; n += 1) {
            await playOneDown(clock);
            buttonNamed('result-actions', 'Next play').click();
            await flushAsync();
        }
        await callPlay();
        expect(Number(dom.el('hud-score').textContent)).toBeGreaterThanOrEqual(150);
        expect(main.__test__.play().formations.settings.difficulty).toBe(0);
    }, 120000);
});

describe('a clip of a play that ran out of time', () => {
    test('leaves with words and a file name about the clock, while the log still counts a sack', async () => {
        // A browser that records, as the share sheet's own suite fakes one.
        class FakeRecorder {
            static isTypeSupported(t) { return t === 'video/webm'; }

            constructor(_stream, options) { this.mimeType = options.mimeType; }

            start() {}

            stop() {
                this.ondataavailable({ data: new Blob(['clip']) });
                this.onstop();
            }
        }
        const Canvas = function () {};
        Canvas.prototype.captureStream = () => ({});
        Object.assign(dom.windowStub, {
            MediaRecorder: FakeRecorder,
            HTMLCanvasElement: Canvas,
            Blob,
            File: class { constructor(_parts, name, opts) { this.name = name; this.type = opts.type; } },
        });
        const make = dom.documentStub.createElement;
        dom.documentStub.createElement = (tag) => {
            const e = make(tag);
            if (tag === 'canvas') {
                e.captureStream = () => ({});
                e.toBlob = (cb, type) => cb({ size: 2048, type });
            }
            if (tag === 'video') e.play = () => Promise.resolve();
            return e;
        };
        const realCreate = globalThis.URL.createObjectURL;
        const realRevoke = globalThis.URL.revokeObjectURL;
        globalThis.URL.createObjectURL = () => 'blob:clip';
        globalThis.URL.revokeObjectURL = () => {};
        const handed = [];
        globalThis.navigator.canShare = () => true;
        globalThis.navigator.share = async (data) => { handed.push(data); };
        try {
            const main = await boot(PRACTICE, { skip: false });
            buttonNamed('welcome-actions', 'Start practice').click();
            await flushAsync();
            await callPlay();
            dom.el('hud-actions').children.find((b) => (b.textContent || '').startsWith('Snap the ball')).click();
            await flushAsync();

            // Nothing pressed until the clock has run out.
            let now = 0;
            for (let i = 0; i < 2400 && dom.el('result').hidden !== false; i += 1) dom.loops[0](now += 16.7);
            expect(dom.el('result').hidden).toBe(false);
            expect(dom.el('result-detail').textContent).toMatch(/clock ran out/);
            expect(pings('play-result')[0].searchParams.get('kind')).toBe('sack');

            dom.el('result-actions').children.find((b) => b.id === 'result-share-btn').click();
            await flushAsync();
            for (let i = 0; i < 4000 && main.__test__.phase() !== 'result'; i += 1) dom.loops[0](now += 16.7);
            expect(main.__test__.phase()).toBe('result');
            await flushAsync();
            await flushAsync();

            const ui = await import('../www/xo/js/clip-ui.min.js');
            await expect(ui.shareClip()).resolves.toBe('shared');
            expect(handed[0].text).toMatch(/^Out of time in X's and O's! /);
            expect(handed[0].files[0].name).toBe('scenexp-xo-out-of-time-1080x1920.webm');
        } finally {
            delete globalThis.navigator.share;
            delete globalThis.navigator.canShare;
            globalThis.URL.createObjectURL = realCreate;
            globalThis.URL.revokeObjectURL = realRevoke;
        }
    }, 60000);
});

describe('the console', () => {
    test('cannot put the visitor on a defense that is not there, or run an opening without one', async () => {
        const { createAvatarStore } = await import('../www/shared/js/avatar-1.0.0.js');
        createAvatarStore({ win: null }).save({ skin: 'deep', shirt: 'teal', handedness: 'left' });
        const main = await boot(PRACTICE, { skip: false });
        expect(main.qaPlayAs('db1')).toBe('qb');
        expect(main.getState().playAs).toBe('qb');
        expect(main.qaOpening()).toMatch(/Not in Practice Mode/);
    });
});

describe('the page', () => {
    test('the copy about a defense can be swapped, and the stylesheet does the swapping', async () => {
        const page = await readFile(new URL('../www/xo/index.html', import.meta.url), 'utf8');
        const css = await readFile(new URL('../www/xo/css/experience.css', import.meta.url), 'utf8');
        const card = page.slice(page.indexOf('id="welcome"'), page.indexOf('id="designer"'));
        const practiceText = card
            .replace(/<!--[\s\S]*?-->/g, '')
            // A nested span closes at its own tag; the ladder row closes at </li>.
            .replace(/<li class="real-game-only">[\s\S]*?<\/li>/g, '')
            .replace(/<span class="real-game-only">[\s\S]*?<\/span>/g, '');
        // With those gone, the card mentions nothing that needs a defender.
        expect(practiceText).not.toMatch(/choose a defense|sacked|intercepted|picked off|a sack/i);
        expect(card).toMatch(/You are in Practice Mode/);
        // At rest the words about practice are out of sight on a real visit.
        expect(page).toMatch(/id="welcome-practice"[^>]*\shidden>/);
        expect(page).toMatch(/id="hud-practice"[^>]*\shidden>/);
        expect(css).toMatch(/\.practice-only\s*\{\s*display:\s*none/);
        expect(css).toMatch(/body\.is-practice \.real-game-only\s*\{\s*display:\s*none/);
        expect(css).toMatch(/body\.is-practice \.practice-only\s*\{\s*display:\s*inline/);
        // The display rule on the row would otherwise beat its hidden attribute.
        expect(css).toMatch(/\.playbook-defense\[hidden\]\s*\{\s*display:\s*none/);
    });

    test('the words on the card are the site\'s own style', async () => {
        const page = await readFile(new URL('../www/xo/index.html', import.meta.url), 'utf8');
        const note = page.slice(page.indexOf('id="welcome-practice"'));
        expect(note.slice(0, note.indexOf('</p>'))).not.toMatch(/[—;]/);
    });

    test('llms.txt and the game\'s description tell a reader it exists', async () => {
        const llms = await readFile(new URL('../www/llms.txt', import.meta.url), 'utf8');
        expect(llms).toContain('https://www.scenexp.com/xo/?practice=true');
        const page = await readFile(new URL('../www/xo/index.html', import.meta.url), 'utf8');
        expect(page).toMatch(/"description": "[^"]*Practice Mode/);
    });
});
