// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * xo-playas.test.mjs - who the visitor is on the field (specs/xo-photos-plan,
 * Step 1): the seventeen slots, which plays leave each one on the sideline,
 * where the sideline is, and the choice remembered with the play settings.
 *
 * THE TABLE IS CHECKED AGAINST THE FIELD, NOT AGAINST ITSELF. Every play is
 * lined up against every defense the library runs, and the slots must be
 * exactly the players who ever take the field. The bench answers are checked
 * against a second, independent line-up of each play. And the sideline spot
 * is put through the real play camera on the screens people hold.
 */
import { describe, test, expect, beforeAll, beforeEach, afterEach, jest } from '@jest/globals';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { installThree } from './helpers/three-stub.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const scene = join(here, '..', 'www', 'xo', 'js');

installThree();

let P;
let sim;
let CFG;
let FIELD;
let simToWorld;

beforeAll(async () => {
    P = await import(join(scene, 'playas.js'));
    sim = await import(join(scene, 'play.js'));
    ({ XO_CONFIG: CFG, FIELD, simToWorld } = await import(join(scene, 'config.js')));
});

describe('the slots are the players who take the field', () => {
    /** Every position that is on the field for some play against some
     *  defense, and every one that never is. */
    async function whoPlays() {
        const { DEFENSES } = await import(join(scene, 'playbook-ui.js'));
        const play = sim.createPlay();
        const on = new Set();
        const all = new Set();
        for (const slug of sim.OFFENSIVE_PLAYS) {
            for (const defense of DEFENSES) {
                for (const o of sim.lineUp(play, slug, defense)) {
                    if (o.settings.position === 'ball') continue;
                    all.add(o.settings.position);
                    if (!o.settings.benched) on.add(o.settings.position);
                }
            }
        }
        return { on, never: [...all].filter((p) => !on.has(p)) };
    }

    test('seventeen, exactly the ones who ever play, and db5 and db6 are not among them', async () => {
        const { on, never } = await whoPlays();
        expect(P.SLOTS.map((s) => s.id).sort()).toEqual([...on].sort());
        expect(P.SLOTS).toHaveLength(17);
        expect(never.sort()).toEqual(['db5', 'db6']);
    });

    test('each slot is on the team the simulation puts it on', () => {
        const play = sim.createPlay();
        const team = new Map(sim.lineUp(play, 'pass1', 'cover2').map((o) => [o.settings.position, o.settings.team]));
        for (const s of P.SLOTS) expect(`${s.id} ${s.team}`).toBe(`${s.id} ${team.get(s.id)}`);
        // Offense first, the quarterback leading, as the row will list them.
        expect(P.SLOTS[0].id).toBe('qb');
        const firstDefender = P.SLOTS.findIndex((s) => s.team === 1);
        expect(P.SLOTS.slice(firstDefender).every((s) => s.team === 1)).toBe(true);
    });

    test('receivers are named by the letters painted under them, and no two slots share a name', () => {
        for (const [id, { letter }] of Object.entries(CFG.receivers)) {
            expect(P.labelOf(id)).toBe(`Receiver ${letter}`);
        }
        expect(new Set(P.SLOTS.map((s) => s.label)).size).toBe(P.SLOTS.length);
        // A sentence says the same name, starting lower case.
        for (const s of P.SLOTS) expect(s.phrase).toBe(s.label[0].toLowerCase() + s.label.slice(1));
    });
});

describe('a stored or requested slot is made safe', () => {
    test('anything that is not one of the seventeen is the quarterback', () => {
        const hostile = [undefined, null, '', 'db6', 'db5', 'QB', 'WR1', ' wr1', 'wr1 ', '__proto__',
            'constructor', 'toString', 42, {}, [], ['wr1'], 'ball', 'wr5', 'x7', 's3'];
        for (const value of hostile) {
            expect(`${String(value)} -> ${P.normalizeSlot(value)}`).toBe(`${String(value)} -> qb`);
            expect(P.isSlot(value)).toBe(false);
        }
        for (const s of P.SLOTS) expect(P.normalizeSlot(s.id)).toBe(s.id);
        expect(P.DEFAULT_SLOT).toBe('qb');
    });
});

describe('which plays leave a slot on the sideline', () => {
    test('benchedIn agrees with a separate line-up of every play, on offense only', () => {
        const play = sim.createPlay();
        for (const slug of sim.OFFENSIVE_PLAYS) {
            const truth = sim.lineUp(play, slug, 'zone7')
                .filter((o) => o.settings.team === 0 && o.settings.benched)
                .map((o) => o.settings.position).sort();
            expect(`${slug}: ${[...P.benchedIn(slug)].sort().join(' ')}`).toBe(`${slug}: ${truth.join(' ')}`);
        }
    });

    test('the ones the playbook will warn about', () => {
        expect(P.sitsOut('wr3', 'jumbo1')).toBe(true);
        expect(P.sitsOut('wr4', 'screen2')).toBe(true);
        expect(P.sitsOut('wr3', 'screen2')).toBe(false);
        expect(P.sitsOut('x6', 'pass2')).toBe(true);
        expect(P.sitsOut('x6', 'jumbo1')).toBe(false);
        // The quarterback, receivers A and B, the first three linemen and the
        // whole defense play every down.
        for (const id of ['qb', 'wr1', 'wr2', 'x1', 'x2', 'x3', 'db1', 'db2', 'db3', 'db4', 's1', 's2']) {
            for (const slug of sim.OFFENSIVE_PLAYS) expect(`${id} ${slug} ${P.sitsOut(id, slug)}`).toBe(`${id} ${slug} false`);
        }
    });

    test('an unknown play benches nobody, and the answer is a copy', () => {
        expect(P.benchedIn('pass99').size).toBe(0);
        expect(P.benchedIn('').size).toBe(0);
        const once = P.benchedIn('jumbo1');
        once.add('qb');
        once.delete('wr3');
        expect(P.sitsOut('qb', 'jumbo1')).toBe(false);
        expect(P.sitsOut('wr3', 'jumbo1')).toBe(true);
    });
});

describe('the welcome line', () => {
    test('the quarterback keeps his sentence and everybody else lines up', () => {
        expect(P.playingLine('qb')).toBe('You take the snap at quarterback as your avatar.');
        expect(P.playingLine('wr2')).toBe('You line up at receiver B as your avatar.');
        expect(P.playingLine('x4')).toBe('You line up at lineman 4 as your avatar.');
        expect(P.playingLine('s1')).toBe('You line up at safety 1 as your avatar.');
        expect(P.playingLine('nonsense')).toBe(P.playingLine('qb'));
        // House style: no semicolons and no em-dashes in anything a visitor reads.
        for (const s of P.SLOTS) {
            expect(P.playingLine(s.id)).not.toMatch(/[;—]/);
            expect(s.label).not.toMatch(/[;—]/);
        }
    });
});

/**
 * WHERE THE SIDELINE IS, PUT THROUGH THE PLAY CAMERA.
 *
 * The camera solve is pure (camera.js), so the projection here is plain
 * arithmetic: a look-at camera with +y up, `fov` vertical, as THREE builds it.
 * A body is `CFG.separation` across and stands `1.75 * figureScale` tall.
 */
describe('the visitor waits on the sideline, in sight', () => {
    let view;
    let cam;
    beforeAll(async () => {
        view = await import(join(scene, 'view.js'));
        cam = await import(join(scene, 'camera.js'));
    });

    /** Screen position in the half-frame: |x| and |y| under 1 are in shot. */
    function project(shot, aspect, p) {
        const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
        const norm = (v) => { const n = Math.hypot(v.x, v.y, v.z); return { x: v.x / n, y: v.y / n, z: v.z / n }; };
        const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
        const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
        const f = norm(sub(shot.target, shot.position));
        const r = norm(cross(f, { x: 0, y: 1, z: 0 }));
        const u = cross(r, f);
        const d = sub(p, shot.position);
        const t = Math.tan((shot.fov * Math.PI) / 360);
        return { x: dot(d, r) / (dot(d, f) * t * aspect), y: dot(d, u) / (dot(d, f) * t) };
    }

    const SCREENS = [[320, 568], [360, 800], [375, 667], [390, 844], [430, 932], [768, 1024],
        [1024, 768], [1280, 720], [1440, 900], [1920, 1080], [2560, 1080]];

    /** The worst of a body's four corners standing at `spot`. */
    function worst(spot, w, h) {
        const aspect = w / h;
        const shot = cam.playDriver(aspect);
        const half = CFG.separation / 2;
        const tall = 1.75 * CFG.figureScale;
        let x = 0;
        let y = 0;
        for (const dz of [-half, half]) {
            for (const up of [0, tall]) {
                const at = project(shot, aspect, { x: spot.x, y: up, z: spot.z + dz });
                x = Math.max(x, Math.abs(at.x));
                y = Math.max(y, Math.abs(at.y));
            }
        }
        return { x, y };
    }

    test('on the X\'s own sideline, clear of the paint', () => {
        const spot = view.benchSpot(0);
        expect(Math.sign(spot.z)).toBe(CFG.crowd.xSide);
        expect(Math.abs(spot.z) - CFG.separation / 2).toBeGreaterThan(FIELD.width / 2);
        // Off the end zones too: between the lines, beside the field.
        expect(spot.x).toBeGreaterThan(0);
        expect(spot.x).toBeLessThan(FIELD.lineInterval * FIELD.segments);
        // And the other team's is across the field, should one ever sit out.
        expect(view.benchSpot(1).z).toBeCloseTo(-spot.z, 9);
    });

    test('the whole body is in shot on every screen, upright phones included', () => {
        const spot = view.benchSpot(0);
        for (const [w, h] of SCREENS) {
            const at = worst(spot, w, h);
            expect(`${w}x${h} ${at.x < 0.99} ${at.y < 0.99}`).toBe(`${w}x${h} true true`);
        }
    });

    test('beside the line of scrimmage, where a bench would be, an upright phone cannot see him', () => {
        // Why `bench.along` is not the line of scrimmage, kept so a change back
        // has to argue with the measurement.
        const play = sim.createPlay();
        const qb = sim.lineUp(play, 'pass2', 'cover2').find((o) => o.settings.position === 'qb');
        const scrimmage = { x: simToWorld(qb.coords.x, qb.coords.y).x, z: view.benchSpot(0).z };
        for (const [w, h] of [[360, 800], [390, 844], [430, 932]]) {
            expect(`${w}x${h} ${worst(scrimmage, w, h).x > 1}`).toBe(`${w}x${h} true`);
        }
    });
});

describe('the choice is remembered with the play settings', () => {
    const KEY = 'exes-n-ohs-play-settings';
    let store;

    beforeEach(() => {
        jest.resetModules();
        store = new Map();
        globalThis.localStorage = {
            getItem: (k) => (store.has(k) ? store.get(k) : null),
            setItem: (k, v) => { store.set(k, String(v)); },
            removeItem: (k) => { store.delete(k); },
        };
    });
    afterEach(() => { delete globalThis.localStorage; });

    const book = () => import(join(scene, 'playbook-ui.js'));

    test('read before the playbook is ever built, which is when the roster and the line-up ask', async () => {
        store.set(KEY, JSON.stringify({ lastPlay: 'jumbo1', defense: 'zone4', playAs: 'wr3' }));
        const ui = await book();
        expect(ui.getSettings()).toEqual({ lastPlay: 'jumbo1', defense: 'zone4', playAs: 'wr3' });
    });

    test('a stored value that is not a slot reads as the quarterback', async () => {
        store.set(KEY, JSON.stringify({ lastPlay: 'pass1', playAs: 'db6' }));
        expect((await book()).getSettings().playAs).toBe('qb');
    });

    test('a visitor who never chose stores exactly what they stored before Play as existed', async () => {
        const ui = await book();
        expect(ui.getSettings().playAs).toBe('qb');
        expect(ui.setPlayAs('wr2')).toBe('wr2');
        expect(JSON.parse(store.get(KEY)).playAs).toBe('wr2');
        // Back to the quarterback, and the field is gone again.
        expect(ui.setPlayAs('qb')).toBe('qb');
        expect(JSON.parse(store.get(KEY))).toEqual({ lastPlay: '', defense: '' });
        // Nonsense is the quarterback too, and stores nothing new.
        expect(ui.setPlayAs('captain')).toBe('qb');
        expect('playAs' in JSON.parse(store.get(KEY))).toBe(false);
    });

    test('private mode: nothing can be stored, and the choice still holds for the visit', async () => {
        globalThis.localStorage = {
            getItem: () => { throw new Error('denied'); },
            setItem: () => { throw new Error('denied'); },
            removeItem: () => { throw new Error('denied'); },
        };
        const ui = await book();
        expect(ui.setPlayAs('s2')).toBe('s2');
        expect(ui.getSettings().playAs).toBe('s2');
    });
});
