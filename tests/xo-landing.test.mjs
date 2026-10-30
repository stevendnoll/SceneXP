// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * xo-landing.test.mjs - the ring where a pass will come down (Steve's QA,
 * 2026-10-30).
 *
 * Once the quarterback led his receivers properly (lead.js), a deep pass across
 * the field left his hand toward a spot a median 6 m along the receiver's
 * diagonal, and on 23 of 54 such throws that spot was nearer to a different
 * receiver than to the man it was meant for. From behind the quarterback it
 * read as a pass to the wrong man. The ring on the grass says where the ball is
 * going and whose it is, in his own ink, from the release until it is caught or
 * down. These cases hold the ring itself (markers.js, on the real three so the
 * position and the colour are real), the view's hand on it (`syncBall`), and
 * the one line of the rules that tells a visitor what it is.
 */
import { describe, test, expect, beforeAll, beforeEach } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealThree } from './helpers/real-three.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const js = (f) => join(here, '..', 'www', 'xo', 'js', f);
const read = (...p) => readFileSync(join(here, '..', ...p), 'utf8');

let THREE;
let CFG;
let simToWorld;
let markers;      // the source, which these cases exercise directly
let drawn;        // the build view.js draws through
let view;
let objects;

const DT = 1 / 60;
const hex = (mesh) => `#${mesh.material.color.getHexString()}`;

beforeAll(async () => {
    THREE = await loadRealThree({ console });
    globalThis.THREE = THREE;
    const quiet = () => new Proxy(function () {}, {
        get: (_t, p) => (p === Symbol.toPrimitive ? () => 0 : (p === 'then' ? undefined : quiet())),
        set: () => true, apply: () => quiet(), construct: () => quiet(),
    });
    globalThis.document = { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => quiet() }) };
    globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

    ({ XO_CONFIG: CFG, simToWorld } = await import(js('config.min.js')));
    const P = await import(js('play.min.js'));
    const roster = await import(js('roster.min.js'));
    const ball = await import(js('ball.min.js'));
    markers = await import(js('markers.js'));
    drawn = await import(js('markers.min.js'));
    view = await import(js('view.js'));

    const scene = new THREE.Scene();
    const play = P.createPlay();
    objects = P.lineUp(play, 'pass2', 'cover2');
    roster.initRoster(scene, objects);
    ball.initBall(scene);
    markers.initMarkers(scene, objects);
    drawn.initMarkers(scene, objects);
});

describe('the ring itself', () => {
    test('is built with the markers, in their group, and hidden until there is a throw', () => {
        const ring = markers.getLanding();
        expect(ring).toBeTruthy();
        // In the group, so a picture or a clip that puts the discs out of sight
        // takes the ring with them: it is the game's HUD exactly as they are.
        expect(ring.parent).toBe(markers.getMarkerGroup());
        expect(ring.visible).toBe(false);
        expect(ring.geometry.parameters.innerRadius).toBeCloseTo(CFG.markers.landing.inner, 9);
        expect(ring.geometry.parameters.outerRadius).toBeCloseTo(CFG.markers.landing.outer, 9);
        expect(ring.material.opacity).toBeCloseTo(CFG.markers.landing.opacity, 9);
        // A receiver's painted disc fits inside it, so the disc fills the ring
        // when he gets there rather than fighting it.
        expect(CFG.markers.landing.inner).toBeGreaterThanOrEqual(markers.markerGeometry().ringRadius);
        expect(CFG.markers.landing.outer).toBeGreaterThan(CFG.markers.landing.inner);
        // Flat on the grass, a little above the discs, and never a team ring
        // for `applyMarkerColors` to repaint.
        expect(ring.rotation.x).toBeCloseTo(-Math.PI / 2, 9);
        expect(ring.position.y).toBeCloseTo(CFG.markers.lift * 2, 9);
        expect(ring.userData.team).toBeUndefined();
    });

    test('shows where it is told, in the ink of the man it was thrown to, and goes away', () => {
        const ring = markers.showLanding(3, 4, 'wr3');
        expect(ring).toBe(markers.getLanding());
        expect(ring.visible).toBe(true);
        expect(ring.position.x).toBeCloseTo(3, 9);
        expect(ring.position.z).toBeCloseTo(4, 9);
        expect(ring.position.y).toBeCloseTo(CFG.markers.lift * 2, 9);
        expect(hex(ring)).toBe(CFG.receivers.wr3.ink);
        // Another man, another ink, and the same ring moved.
        markers.showLanding(5, 6, 'wr1');
        expect(hex(ring)).toBe(CFG.receivers.wr1.ink);
        expect(ring.position.x).toBeCloseTo(5, 9);
        // Anybody without a letter gets the field band's own.
        markers.showLanding(5, 6, 'x1');
        expect(ring.material.color.getHex()).toBe(CFG.band.ink);
        markers.hideLanding();
        expect(ring.visible).toBe(false);
    });

    test('the ink table is the receivers\' own, the one their discs and buttons share', () => {
        for (const [position, r] of Object.entries(CFG.receivers)) {
            expect(markers.landingInk(position)).toBe(r.ink);
        }
        expect(markers.landingInk('qb')).toBe(CFG.band.ink);
        expect(markers.landingInk('')).toBe(CFG.band.ink);
        expect(markers.landingInk(undefined)).toBe(CFG.band.ink);
    });

    test('is disposed with the markers and comes back with them', () => {
        markers.disposeMarkers();
        expect(markers.getLanding()).toBeNull();
        // Nothing to show it on, and nothing to hide: neither throws.
        expect(markers.showLanding(1, 1, 'wr1')).toBeNull();
        expect(() => markers.hideLanding()).not.toThrow();
        markers.initMarkers(new THREE.Scene(), objects);
        expect(markers.getLanding()).toBeTruthy();
        expect(markers.getLanding().visible).toBe(false);
    });
});

describe('the view puts it under the throw', () => {
    const TARGET = { x: 500, y: 120 };
    /** A ball object in flight from the quarterback's hand to `TARGET`, `k`
     *  points of a hundred along, as play.js hands it to the view. */
    function flying(k) {
        const list = Array.from({ length: 100 }, (_, i) => {
            const t = (i + 1) / 100;
            return [t * TARGET.x, 40 + t * (TARGET.y - 40)];
        });
        return {
            settings: { position: 'ball', team: 0 },
            coords: { startX: 0, startY: 40, targetX: TARGET.x, targetY: TARGET.y, x: list[k][0], y: list[k][1], z: 3, list: list.slice(k + 1) },
            state: { xSpeed: 0, ySpeed: 0 },
        };
    }
    const ring = () => drawn.getLanding();

    beforeEach(() => view.resetBallFlight());

    test('from the first frame of the flight, where the ball is going, in the ink of the man main.js said it was thrown to', () => {
        view.noteThrow('wr2');
        view.syncBall(flying(0), null, DT);
        expect(ring().visible).toBe(true);
        const aim = simToWorld(TARGET.x, TARGET.y, 0);
        expect(ring().position.x).toBeCloseTo(aim.x, 6);
        expect(ring().position.z).toBeCloseTo(aim.z, 6);
        expect(hex(ring())).toBe(CFG.receivers.wr2.ink);
        // It stays through the flight, where it was...
        view.syncBall(flying(50), null, DT);
        expect(ring().visible).toBe(true);
        expect(ring().position.x).toBeCloseTo(aim.x, 6);
        // ...and goes the frame the ball is in somebody's hands.
        const catcher = objects.find((o) => o.settings.position === 'wr2');
        view.syncBall(null, catcher, DT);
        expect(ring().visible).toBe(false);
    });

    test('with no word from main.js it waits for the view\'s own latched guess rather than guessing a colour', () => {
        // A replay: the recorder stores nobody's intentions. The first frame
        // of the flight gives the view its span and nothing else.
        view.syncBall(flying(0), null, DT);
        expect(ring().visible).toBe(false);
        // The next frame's figures latch who it was for (the nearest receiver
        // to the spot), and the ring takes his ink.
        const who = view.intendedReceiver(objects);
        expect(who).toMatch(/^wr\d$/);
        view.syncBall(flying(1), null, DT);
        expect(ring().visible).toBe(true);
        expect(hex(ring())).toBe(CFG.receivers[who].ink);
    });

    test('a ball on the grass has nowhere left to go: the ring leaves as it lands', () => {
        view.noteThrow('wr1');
        const down = flying(99);
        view.syncBall(down, null, DT);
        expect(ring().visible).toBe(true);
        // Still for longer than the landing's cue, as an incomplete pass is
        // once the whistle stops the simulation.
        const frames = Math.ceil(CFG.ball.landing.stillFor / DT) + 2;
        for (let i = 0; i < frames; i += 1) view.syncBall(down, null, DT);
        expect(ring().visible).toBe(false);
    });

    test('a new line-up starts with no ring and no owner', () => {
        view.noteThrow('wr4');
        view.syncBall(flying(10), null, DT);
        expect(ring().visible).toBe(true);
        view.resetBallFlight();
        expect(ring().visible).toBe(false);
        // The owner went with the play: the next throw's first frame says nothing.
        view.syncBall(flying(0), null, DT);
        expect(ring().visible).toBe(false);
    });
});

describe('the rules', () => {
    test('tell the visitor what the ring is, in the jump step, without an em-dash or a semicolon', () => {
        const html = read('www', 'xo', 'index.html');
        const steps = html.slice(html.indexOf('welcome-steps'), html.indexOf('</ol>'));
        const jumpStep = steps.slice(steps.indexOf('Jump for it'));
        expect(jumpStep).toMatch(/a ring on the grass marks where it will come\s+down/);
        expect(jumpStep.replace(/<!--[\s\S]*?-->/g, '')).not.toMatch(/[—;]/);
    });
});
