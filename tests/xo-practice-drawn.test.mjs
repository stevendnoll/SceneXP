// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * xo-practice-drawn.test.mjs - what Practice Mode leaves on the grass, on the
 * real three, because the suite's stub absorbs every `visible` written to it.
 * The promise is the plain one: no defender drawn, and no ring where one stood.
 */
import { test, expect, beforeAll } from '@jest/globals';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealThree } from './helpers/real-three.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const js = (f) => join(here, '..', 'www', 'xo', 'js', f);

let P;
let roster;
let markers;
let view;
let ball;

beforeAll(async () => {
    const THREE = await loadRealThree({ console });
    globalThis.THREE = THREE;
    const quiet = () => new Proxy(function () {}, {
        get: (_t, p) => (p === Symbol.toPrimitive ? () => 0 : (p === 'then' ? undefined : quiet())),
        set: () => true, apply: () => quiet(), construct: () => quiet(),
    });
    globalThis.document = { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => quiet() }) };
    globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
    // The builds the page draws through.
    P = await import(js('play.min.js'));
    roster = await import(js('roster.min.js'));
    markers = await import(js('markers.min.js'));
    ball = await import(js('ball.min.js'));
    view = await import(js('view.min.js'));
});

/** A field lined up and drawn before the snap, with or without a defense. */
function field(practice) {
    const scene = new THREE.Scene();
    const play = P.createPlay();
    play.practice = practice;
    const objects = P.lineUp(play, 'pass2', practice ? '' : 'cover2');
    roster.initRoster(scene, objects);
    ball.initBall(scene);
    const rings = markers.initMarkers(scene, objects);
    view.syncFigures(objects, 0, { presnap: true });
    return { objects, rings };
}

const drawn = ({ objects, rings }, team) => objects
    .filter((o) => o.settings.team === team)
    .map((o) => ({
        position: o.settings.position,
        figure: roster.figureFor(o.settings.position).visible,
        ring: rings.get(o.settings.position).visible,
    }));

test('no defender is drawn in practice, and no ring is left where one would stand', () => {
    const defense = drawn(field(true), 1);
    expect(defense.length).toBeGreaterThan(0);
    for (const man of defense) {
        expect(man).toEqual({ position: man.position, figure: false, ring: false });
    }
});

test('the offense is drawn as usual', () => {
    const offense = drawn(field(true), 0);
    expect(offense.filter((m) => m.figure && m.ring).map((m) => m.position)).toEqual(
        expect.arrayContaining(['qb', 'wr1', 'wr2', 'wr3', 'wr4'])
    );
});

test('and the real game draws its defense, which is how this can fail', () => {
    expect(drawn(field(false), 1).filter((m) => m.figure && m.ring).length).toBeGreaterThan(3);
});

test('a whole play stays clear of them', () => {
    const scene = new THREE.Scene();
    const play = P.createPlay();
    play.practice = true;
    const objects = P.lineUp(play, 'pass2', '');
    roster.initRoster(scene, objects);
    ball.initBall(scene);
    markers.initMarkers(scene, objects);
    P.snap(play);
    for (let f = 0; f < 240 && !P.isDone(play); f += 1) {
        P.tick(play);
        view.syncFigures(play.game.objects, 1 / 60, { live: true });
        for (const o of play.game.objects) {
            if (o.settings.team === 1 && o.settings.position !== 'ball') {
                expect(roster.figureFor(o.settings.position).visible).toBe(false);
            }
        }
    }
});
