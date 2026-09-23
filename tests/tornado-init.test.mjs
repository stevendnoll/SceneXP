// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Integration smoke for Tornado Alley, plus the page furniture.
 *
 * Three parts. The scene builds and walks its whole minute under the THREE
 * stub, so a missing import or a throw at second forty fails here rather than
 * on the live site. main.js boots under the DOM stub and hands its picture to
 * the shared player. And the page carries what a share, a crawler and the
 * player need, which is the half High Water's init suite showed is worth
 * asserting because nobody looks at it in a browser.
 *
 * UNRELEASED (M1, 2026-09-23): the page must carry noindex until M8. That
 * rule lives in tests/directory.test.mjs, beside the list that exempts it.
 */
import { jest } from '@jest/globals';
import { readFile } from 'node:fs/promises';
import { installThree, installCanvas, installBrowserGlobals, uninstallAll } from './helpers/three-stub.mjs';
import { installDom, flushAsync } from './helpers/dom-stub.mjs';

const PAGE = new URL('../www/tornado/index.html', import.meta.url);
const BASE = 'https://www.scenexp.com/tornado/';

describe('the whole storm builds without a browser', () => {
    beforeEach(() => {
        installThree();
        installCanvas();
        installBrowserGlobals();
    });
    afterEach(() => { uninstallAll(); });

    test('world and funnel initialize and walk the whole minute', async () => {
        jest.resetModules();
        // The BUILT modules, as main.js loads them. This is why `npm run build`
        // runs before `npm test`.
        const { TORNADO_CONFIG } = await import('../www/tornado/js/config.min.js');
        const funnel = await import('../www/tornado/js/funnel.min.js');
        const shells = await import('../www/tornado/js/shells.min.js');
        const world = await import('../www/tornado/js/world.min.js');

        const scene = { children: [], add(o) { this.children.push(o); }, remove() {} };
        const shared = funnel.funnelUniforms(TORNADO_CONFIG);
        world.initWorld(scene, TORNADO_CONFIG);
        shells.initShells(scene, shared, TORNADO_CONFIG);
        expect(scene.children.length).toBeGreaterThanOrEqual(6);

        for (let t = 0; t <= TORNADO_CONFIG.story.seconds; t += 0.5) {
            const s = funnel.funnelStateAt(t, t, TORNADO_CONFIG);
            expect(() => {
                funnel.applyFunnelState(shared, s);
                world.updateWorld(s, true, TORNADO_CONFIG);
                shells.updateShells(s, TORNADO_CONFIG.shells.mobileCount);
            }).not.toThrow();
        }
        shells.setShellCount(2);
    });
});

describe('main.js hands the picture to the shared player', () => {
    let dom;
    // Fake timers, so the player's idle and card timers cannot fire after the
    // DOM stub is gone. Animation frames stay with the stub, which collects
    // them in `dom.loops`.
    beforeEach(() => {
        jest.useFakeTimers({ doNotFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'queueMicrotask', 'nextTick', 'setImmediate'] });
    });
    afterEach(() => {
        jest.clearAllTimers();
        jest.useRealTimers();
        dom.uninstall();
    });

    test('it boots, draws, and the QA hooks move the story on a local server', async () => {
        installThree();
        dom = installDom();
        dom.windowStub.location.hostname = 'localhost';
        jest.resetModules();
        const main = await import('../www/tornado/js/main.js');
        await flushAsync(30);
        expect(typeof main.init).toBe('function');

        // The player found its markup: the scrubber was set to the story.
        expect(dom.el('player-scrub').max).toBe('60');
        // A frame draws without throwing, behind the card and then after it.
        expect(dom.loops.length).toBeGreaterThan(0);
        dom.loops[dom.loops.length - 1](1000);
        dom.el('player-begin').click();
        expect(dom.el('player-controls').hidden).toBe(false);
        dom.loops[dom.loops.length - 1](1100);

        expect(typeof window.tornadoSetArc).toBe('function');
        window.tornadoSetArc(32);
        expect(window.tornadoArc()).toBe(32);
        expect(window.tornadoState().extent).toBe(1);
    });
});

describe('the page carries what a share, a crawler and the player need', () => {
    let html;
    beforeAll(async () => { html = await readFile(PAGE, 'utf8'); });

    const meta = (key) => {
        const m = html.match(new RegExp(`<meta[^>]*(?:property|name)="${key}"[^>]*content="([^"]*)"`, 'i'));
        return m ? m[1] : null;
    };

    test('the identity block points at this folder', () => {
        expect(html).toContain(`<link rel="canonical" href="${BASE}">`);
        expect(meta('og:url')).toBe(BASE);
        expect(meta('og:title')).toBe('Tornado Alley');
        expect(html).toContain('<title>Tornado Alley</title>');
    });

    test('exactly one card image, named the same in both blocks with the same alt', () => {
        expect(html.match(/property="og:image"/g)).toHaveLength(1);
        expect(meta('og:image')).toBe(`${BASE}assets/og-tornado.jpg?v=1`);
        expect(meta('twitter:image')).toBe(meta('og:image'));
        expect(meta('twitter:image:alt')).toBe(meta('og:image:alt'));
        expect(meta('og:image:width')).toBe('1200');
        expect(meta('og:image:height')).toBe('630');
    });

    test('the JSON-LD parses and agrees with the tags around it', () => {
        const block = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
        const data = JSON.parse(block[1]);
        expect(data.url).toBe(BASE);
        expect(data['@id']).toBe(`${BASE}#website`);
        expect(data.name).toBe('Tornado Alley');
    });

    test('a strict same-origin policy and no sound', () => {
        const csp = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]*)"/);
        expect(csp[1]).toContain("default-src 'self'; script-src 'self'; style-src 'self'");
        expect(csp[1]).not.toMatch(/media-src/);
    });

    test('EVERY ELEMENT THE SHARED PLAYER LOOKS FOR IS ON THE PAGE', async () => {
        // The player finds its markup by id and treats every element as
        // optional, so a renamed id fails silently: the control is just gone.
        // This is the pairing that catches it.
        const { PLAYER_IDS } = await import('../www/shared/js/player-1.0.0.js');
        for (const id of Object.values(PLAYER_IDS)) {
            expect([id, html.includes(`id="${id}"`)]).toEqual([id, true]);
        }
    });

    test('the sheets load in cascade order: shared, player, scene', () => {
        const shared = html.indexOf('rel="stylesheet" href="../shared/css/styles-1.0.0.min.css');
        const player = html.indexOf('rel="stylesheet" href="../shared/css/player-1.0.0.min.css"');
        const scene = html.indexOf('rel="stylesheet" href="css/experience.min.css"');
        expect(shared).toBeGreaterThan(0);
        expect(player).toBeGreaterThan(shared);
        expect(scene).toBeGreaterThan(player);
    });

    test('the ending offers Share, Watch it again, and the directory', () => {
        expect(html).toMatch(/<button id="share" type="button" class="player-btn">Share<\/button>/);
        expect(html).toContain('id="share-status" class="sr-only"');
        expect(html).toMatch(/id="player-replay"[^>]*>Watch it again</);
        expect(html).toContain('class="welcome-explore promo-explore" href="/"');
    });

    test('the welcome card says what is coming before anybody presses Begin', () => {
        const warning = html.match(/<p class="warning">([\s\S]*?)<\/p>/);
        expect(warning).not.toBeNull();
        expect(warning[1]).toMatch(/tornado/);
        expect(warning[1]).toMatch(/Nobody is in its path/);
        expect(warning[1]).toMatch(/lightning/);
        expect(warning[1]).toMatch(/without sound/);
    });
});
