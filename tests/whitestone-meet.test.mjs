// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * Meet Maya and the phone's taps (QA, 2026-10-16):
 *
 *   - meet.js: her whole figure framed from in front of her, whatever shape
 *     the card comes out, drawn only while she moves, never waving under
 *     reduced motion, and a card without her where no second canvas can be
 *     had.
 *   - The page: her portrait is a button that opens the card, and closing
 *     it stops the drawing.
 *   - host.js: a new scene's buttons ignore a tap for 450 ms (on a phone
 *     they are drawn under the finger that pressed Let's start), never a
 *     key.
 *   - experience.css: every hover is for a pointer that hovers, since a
 *     phone keeps :hover on whatever was tapped last.
 */
import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installThree } from './helpers/three-stub.mjs';
import { installDom, fire, flushAsync } from './helpers/dom-stub.mjs';
import { CONFIG } from '../www/whitestone/js/config.js';
import { GESTURES } from '../www/whitestone/js/cast.js';

const WS = join(process.cwd(), 'www', 'whitestone');
const HTML = readFileSync(join(WS, 'index.html'), 'utf8');
const CSS = readFileSync(join(WS, 'css', 'experience.css'), 'utf8');

let dom;

beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    installThree();
    dom = installDom();
});

afterEach(() => {
    dom.uninstall();
    jest.useRealTimers();
    jest.restoreAllMocks();
    delete globalThis.fetch;
});

describe('her figure from in front (meetPose, pure)', () => {
    test('the camera stands in front of her, along the way she faces, a little above the frame\'s middle', async () => {
        const { meetPose } = await import('../www/whitestone/js/meet.js');
        const m = CONFIG.cast.maya;
        const pose = meetPose(m, 0.75, CONFIG.meet);
        const dx = pose.eye[0] - pose.aim[0];
        const dz = pose.eye[2] - pose.aim[2];
        const len = Math.hypot(dx, dz);
        expect(dx / len).toBeCloseTo(Math.sin(m.facing), 9);
        expect(dz / len).toBeCloseTo(Math.cos(m.facing), 9);
        expect([pose.aim[0], pose.aim[2]]).toEqual([m.x, m.z]);
        expect(pose.eye[1] - pose.aim[1]).toBeCloseTo(CONFIG.meet.lift, 9);
    });

    test('her raised hand and her feet fit, and an arm out fits a narrow card too', async () => {
        const { meetPose } = await import('../www/whitestone/js/meet.js');
        const m = CONFIG.cast.maya;
        const P = CONFIG.meet;
        for (const aspect of [0.4, 0.75, 1, 2]) {
            const pose = meetPose(m, aspect, P);
            const distance = Math.hypot(pose.eye[0] - pose.aim[0], pose.eye[2] - pose.aim[2]);
            const halfTall = Math.tan((pose.fov * Math.PI) / 360) * distance;
            // Head to toe, the hand above her head included.
            expect(halfTall * 2).toBeGreaterThanOrEqual(m.height + P.reach);
            // Either side of her middle, an arm out.
            expect(halfTall * aspect).toBeGreaterThanOrEqual(P.half);
            expect(pose.aspect).toBe(aspect);
        }
        // A card measured as nothing yet frames as 3:4, not as infinity.
        expect(meetPose(m, 0, P).aspect).toBe(0.75);
    });
});

describe('the card\'s figure (createMeet)', () => {
    /** A renderer that counts what it draws, and its loop to run by hand. */
    function fakeRenderer() {
        const r = {
            loop: null, draws: 0, sized: [], disposed: false, shadowMap: {},
            setAnimationLoop(fn) { r.loop = fn; },
            render() { r.draws++; },
            setPixelRatio() {},
            setSize(w, h) { r.sized.push([w, h]); },
            dispose() { r.disposed = true; }
        };
        return r;
    }
    /** performance.now, moved on by hand. */
    function clock() {
        const c = { t: 1000 };
        jest.spyOn(performance, 'now').mockImplementation(() => c.t);
        return c;
    }
    const frames = (r, c, n, ms = 50) => {
        for (let i = 0; i < n; i++) {
            c.t += ms;
            r.loop();
        }
    };

    test('drawn once when opened, then only while she waves; she waves soon after it opens', async () => {
        const { createMeet } = await import('../www/whitestone/js/meet.js');
        const r = fakeRenderer();
        const c = clock();
        const meet = createMeet(CONFIG, { canvas: { clientWidth: 300, clientHeight: 400 }, makeRenderer: () => r });
        expect(meet.open()).toBe(true);
        expect(meet.shown).toBe(true);
        r.loop();
        expect(r.draws).toBe(1);
        expect(r.sized).toEqual([[300, 400]]);
        // Before her first wave: nothing moves, nothing is drawn.
        frames(r, c, Math.floor((CONFIG.meet.first * 1000) / 50) - 1);
        expect(r.draws).toBe(1);
        // Her wave: a frame each.
        frames(r, c, 10);
        expect(r.draws).toBeGreaterThanOrEqual(10);
        // Her wave over (10 frames in, about 0.5 s), still for `every` s.
        frames(r, c, Math.ceil((GESTURES.wave - 0.5) / 0.05) + 2);
        const after = r.draws;
        frames(r, c, Math.floor(((CONFIG.meet.every - 0.5) * 1000) / 50));
        expect(r.draws).toBe(after);
        // And again, now and then.
        frames(r, c, 20);
        expect(r.draws).toBeGreaterThan(after);
        meet.close();
        expect(r.loop).toBeNull();
        expect(meet.shown).toBe(false);
    });

    test('under reduced motion she never waves: drawn once, and again only for a new size', async () => {
        const { createMeet } = await import('../www/whitestone/js/meet.js');
        const r = fakeRenderer();
        const c = clock();
        const canvas = { clientWidth: 300, clientHeight: 400 };
        const meet = createMeet(CONFIG, { canvas, reducedMotion: () => true, makeRenderer: () => r });
        meet.open();
        frames(r, c, 400);
        expect(r.draws).toBe(1);
        canvas.clientWidth = 240;
        canvas.clientHeight = 320;
        frames(r, c, 2);
        expect(r.draws).toBe(2);
        expect(r.sized.at(-1)).toEqual([240, 320]);
    });

    test('a card not laid out yet is not drawn at a made-up size', async () => {
        const { createMeet } = await import('../www/whitestone/js/meet.js');
        const r = fakeRenderer();
        const c = clock();
        const canvas = { clientWidth: 0, clientHeight: 0 };
        const meet = createMeet(CONFIG, { canvas, makeRenderer: () => r });
        meet.open();
        frames(r, c, 3);
        expect(r.draws).toBe(0);
        expect(r.sized).toEqual([]);
        canvas.clientWidth = 300;
        canvas.clientHeight = 400;
        frames(r, c, 1);
        expect(r.draws).toBe(1);
    });

    test('no second WebGL canvas: open says so, and asks only once', async () => {
        const { createMeet } = await import('../www/whitestone/js/meet.js');
        const make = jest.fn(() => { throw new Error('no context'); });
        const meet = createMeet(CONFIG, { canvas: { clientWidth: 300, clientHeight: 400 }, makeRenderer: make });
        expect(meet.open()).toBe(false);
        expect(meet.open()).toBe(false);
        expect(make).toHaveBeenCalledTimes(1);
        expect(meet.shown).toBe(false);
    });

    test('dispose lets the canvas go', async () => {
        const { createMeet } = await import('../www/whitestone/js/meet.js');
        const r = fakeRenderer();
        const meet = createMeet(CONFIG, { canvas: { clientWidth: 300, clientHeight: 400 }, makeRenderer: () => r });
        meet.open();
        meet.dispose();
        expect(r.disposed).toBe(true);
        expect(r.loop).toBeNull();
    });
});

/** The page, booted to Maya's hello. */
async function boot() {
    globalThis.fetch = async (url) => ({ ok: true, status: 200, json: async () => JSON.parse(readFileSync(join(WS, String(url)), 'utf8')) });
    const main = await import('../www/whitestone/js/main.js');
    await flushAsync(20);
    await jest.advanceTimersByTimeAsync(CONFIG.loadingReveal + CONFIG.guide.delay * 1000 + 200);
    return main;
}

describe('Meet Maya on the page', () => {
    test('her portrait is a button named for what it does, and the card is in the markup with its own canvas', () => {
        expect(HTML).toMatch(/<button id="host-portrait" class="host-portrait" type="button" aria-label="Meet Maya" title="Meet Maya">/);
        expect(HTML).toMatch(/<div id="meet" class="card-overlay" hidden>/);
        expect(HTML).toMatch(/<canvas id="meet-canvas" class="meet-canvas" aria-hidden="true"><\/canvas>/);
        // Her words are the card's description, without em-dashes or semicolons.
        const line = /<p id="meet-line"[^>]*>([^<]+)</.exec(HTML)[1];
        expect(HTML).toMatch(/aria-describedby="meet-line"/);
        expect(line).not.toMatch(/[—;]/);
    });

    test('a tap on her portrait opens the card and draws her, and Close puts her away', async () => {
        const main = await boot();
        const t = main.__test__;
        expect(dom.el('meet').hidden).not.toBe(false);
        fire(dom.el('host-portrait'), 'click');
        expect(dom.el('meet').hidden).toBe(false);
        expect(t.meet.shown).toBe(true);
        fire(dom.el('meet-close'), 'click');
        expect(dom.el('meet').hidden).toBe(true);
        expect(t.meet.shown).toBe(false);
        // Opened again, the same figure, drawing again.
        const first = t.meet;
        t.openMeet();
        expect(t.meet).toBe(first);
        expect(t.meet.shown).toBe(true);
    });
});

describe('a new scene\'s buttons ignore a tap for a moment (host.js)', () => {
    test('a tap within 450 ms of Maya\'s new words is swallowed; a key never is; later taps go through', async () => {
        const main = await boot();
        const t = main.__test__;
        t.showGuide();
        const root = dom.el('ws-host');
        expect(fire(root, 'click', { detail: 1 }).defaultPrevented).toBe(true);
        expect(fire(root, 'click', { detail: 0 }).defaultPrevented).toBe(false);
        jest.advanceTimersByTime(460);
        expect(fire(root, 'click', { detail: 1 }).defaultPrevented).toBe(false);
        // Words updated within a scene (a floor ticked) do not arm it again.
        t.updateHost();
        expect(fire(root, 'click', { detail: 1 }).defaultPrevented).toBe(false);
    });
});

describe('every hover is for a pointer that hovers (experience.css)', () => {
    test('outside @media (hover: hover), no :hover but the pressed bath type\'s own', () => {
        let rest = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
        // Take out each hover block, braces balanced.
        for (;;) {
            const at = rest.indexOf('@media (hover: hover)');
            if (at < 0) break;
            let i = rest.indexOf('{', at);
            let depth = 0;
            for (; i < rest.length; i++) {
                if (rest[i] === '{') depth++;
                else if (rest[i] === '}' && --depth === 0) break;
            }
            rest = rest.slice(0, at) + rest.slice(i + 1);
        }
        const hovers = rest.match(/[^{}]*:hover[^{}]*\{/g) || [];
        expect(hovers.map((s) => s.trim())).toEqual(['.panel-bath.is-on,\n.panel-bath.is-on:hover {']);
    });
});
