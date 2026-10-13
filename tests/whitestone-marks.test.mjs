// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * The studio's touch points (www/whitestone/js/marks.js), their halos and
 * how a tap finds them:
 *
 *   - the halos come one stage at a time, and retire once used;
 *   - the keys and the places list name every touch point once;
 *   - against the real three.js, a tap on each thing, from its own station
 *     and from the overview, reaches that thing and no other, and each
 *     halo on arrival is in view and not hidden behind anything.
 */
import { loadRealThree } from './helpers/real-three.mjs';
import { CONFIG } from '../www/whitestone/js/config.js';
import {
    TOUCH, USED, COACHING, usedCount, noteUsed, marksShown, touchForKey, nextLevel, onScreen
} from '../www/whitestone/js/marks.js';
import { buildStudio, anchorsFor, firstPick, hiddenFrom, pickOf } from '../www/whitestone/js/studio.js';
import { buildModel } from '../www/whitestone/js/model.js';
import { poseFor } from '../www/whitestone/js/stations.js';
import { STUDIO } from '../www/whitestone/js/copy.js';
import { withExample } from '../www/whitestone/js/samples.js';
import { emptyDoc } from '../www/whitestone/js/store.js';

const NOW = new Date('2026-10-12T16:00:00Z');
const HALOS = Object.keys(USED);

// ---- The halos' stages (pure) ----------------------------------------------------

describe('which halos show', () => {
    const fresh = { own: false, tasks: false };
    const started = { own: true, tasks: false };
    const busy = { own: true, tasks: true };

    test('a first visit: only the concierge', () => {
        expect(marksShown(0, fresh)).toEqual(['desk']);
        expect(marksShown(0, null)).toEqual(['desk']);
    });

    test('a checklist of their own brings the model, the menu and the board, and a task the printer', () => {
        expect(marksShown(0, started)).toEqual(['desk', 'model', 'menu', 'board']);
        expect(marksShown(0, busy)).toEqual(['desk', 'model', 'menu', 'board', 'printer']);
        // A task without a checklist of their own (the example's) is no stage.
        expect(marksShown(0, { own: false, tasks: true })).toEqual(['desk']);
    });

    test('each retires once used, and all of them once three things have been', () => {
        let bits = noteUsed(0, 'desk');
        expect(marksShown(bits, busy)).toEqual(['model', 'menu', 'board', 'printer']);
        bits = noteUsed(bits, 'menu');
        expect(marksShown(bits, busy)).toEqual(['model', 'board', 'printer']);
        bits = noteUsed(bits, 'menu');
        expect(usedCount(bits)).toBe(2);
        bits = noteUsed(bits, 'printer');
        expect(usedCount(bits)).toBe(COACHING.retireAfter);
        expect(marksShown(bits, busy)).toEqual([]);
    });

    test('a key with no halo changes nothing', () => {
        expect(noteUsed(5, 'overview')).toBe(5);
        expect(noteUsed(5, 'constructor')).toBe(5);
        expect(noteUsed(5, 'toString')).toBe(5);
    });

    test('the bits fit the store\'s coached field and do not overlap', () => {
        const values = Object.values(USED);
        expect(values.reduce((a, b) => a | b, 0)).toBeLessThanOrEqual(65535);
        expect(new Set(values).size).toBe(values.length);
        for (const v of values) expect(usedCount(v)).toBe(1);
        expect(usedCount(0xffffffff)).toBe(32);
    });
});

describe('keys, rows and levels', () => {
    test('every touch point has its own key, its row and, but for the overview, a halo with a spoken name', () => {
        expect(TOUCH.map((t) => t.key)).toEqual(['overview', 'desk', 'model', 'menu', 'board', 'printer']);
        expect(new Set(TOUCH.map((t) => t.hotkey)).size).toBe(TOUCH.length);
        for (const t of TOUCH) {
            expect(touchForKey(t.hotkey)).toBe(t.key);
            expect(STUDIO.places[t.key]).toBeTruthy();
            expect(CONFIG.stations[t.station]).toBeTruthy();
        }
        expect(Object.keys(STUDIO.halos).sort()).toEqual([...HALOS].sort());
        expect(touchForKey('a')).toBeNull();
        expect(touchForKey('7')).toBeNull();
    });

    test('the list note names the keys there are', () => {
        const keys = TOUCH.map((t) => Number(t.hotkey));
        expect(STUDIO.listNote).toContain(`Keys ${Math.min(...keys)} to ${Math.max(...keys)}`);
    });

    test('the model\'s halo lifts the levels in turn, then puts it back together', () => {
        const levels = ['basement', 'main', 'second'];
        expect(nextLevel(levels, null)).toBe('basement');
        expect(nextLevel(levels, 'basement')).toBe('main');
        expect(nextLevel(levels, 'second')).toBeNull();
        expect(nextLevel(levels, 'attic')).toBe('basement');
        expect(nextLevel([], null)).toBeNull();
    });

    test('on screen means in front of the camera and inside the frame', () => {
        expect(onScreen({ x: 0, y: 0, z: 0.5 })).toBe(true);
        expect(onScreen({ x: 0.97, y: 0, z: 0.5 })).toBe(false);
        expect(onScreen({ x: 0, y: -0.97, z: 0.5 })).toBe(false);
        expect(onScreen({ x: 0, y: 0, z: 1.2 })).toBe(false);
        expect(onScreen({ x: NaN, y: 0, z: 0.5 })).toBe(false);
    });

    test('a pick key is found on the thing or any ancestor', () => {
        const parent = { userData: { pick: 'menu' }, parent: null };
        expect(pickOf({ userData: {}, parent })).toBe('menu');
        expect(pickOf({ userData: {}, parent: { userData: {}, parent: null } })).toBeNull();
        expect(firstPick([])).toBeNull();
        expect(firstPick(null)).toBeNull();
        const hidden = { object: { visible: false, userData: { pick: 'desk' }, parent: null } };
        const wall = { object: { userData: {}, parent: null } };
        const menu = { object: { userData: {}, parent } };
        expect(firstPick([hidden, menu]).key).toBe('menu');
        expect(firstPick([wall, menu])).toBeNull();
    });

    test('every halo anchor is inside the room, the faces\' on their faces', () => {
        const a = anchorsFor(CONFIG);
        const { width, depth, height } = CONFIG.room;
        for (const [key, p] of Object.entries(a)) {
            expect(Math.abs(p[0])).toBeLessThan(width / 2);
            expect(Math.abs(p[2])).toBeLessThan(depth / 2 + 1e-9);
            expect(p[1]).toBeGreaterThan(0);
            expect(p[1]).toBeLessThan(height);
            expect(HALOS).toContain(key);
        }
        // Over the desk and the printer, where a head and a page would be,
        // never inside them.
        const st = CONFIG.studio;
        expect(a.desk[1]).toBeGreaterThan(st.desk.height + 0.2);
        expect(a.printer[1]).toBeGreaterThan(st.console.height + st.printer.height);
        expect(a.menu[0]).toBe(CONFIG.studio.menu.x);
        expect(a.board[0]).toBe(CONFIG.studio.board.x);
    });
});

// ---- Against the real three.js ----------------------------------------------------------

describe('in the built studio', () => {
    let REAL;
    let studio;
    let model;
    beforeAll(async () => {
        REAL = await loadRealThree();
        globalThis.THREE = REAL;
        studio = buildStudio(CONFIG);
        model = buildModel(CONFIG, studio.plinthTop);
        model.show(withExample(emptyDoc(CONFIG, NOW), CONFIG, NOW, null).doc.checklists[0]);
        studio.group.updateMatrixWorld(true);
        model.group.updateMatrixWorld(true);
    });
    beforeEach(() => {
        globalThis.THREE = REAL;
    });

    function cameraAt(station, aspect) {
        const pose = poseFor(station, aspect, CONFIG);
        const cam = new REAL.PerspectiveCamera(pose.fov, aspect, CONFIG.camera.near, CONFIG.camera.far);
        cam.position.set(...pose.eye);
        cam.lookAt(...pose.aim);
        cam.updateMatrixWorld();
        return cam;
    }

    /** A point on each thing a visitor would tap. */
    function things() {
        const s = CONFIG.studio;
        const wall = -CONFIG.room.depth / 2;
        const anchorModel = model.placed.tiles[0];
        return {
            desk: [s.desk.x, s.desk.height - 0.2, s.desk.z + s.desk.depth / 2],
            printer: [s.console.x, s.console.height + s.printer.height / 2, s.console.z - 0.02 + s.printer.depth / 2],
            menu: [s.menu.x + 0.2, s.menu.y - 0.1, wall + 0.04],
            board: [s.board.x - 0.2, s.board.y + 0.1, wall + 0.07],
            model: [studio.plinthTop[0] + anchorModel.position[0], studio.plinthTop[1] + anchorModel.position[1], studio.plinthTop[2] + anchorModel.position[2]]
        };
    }

    function tap(cam, point) {
        const ndc = new REAL.Vector3(...point).project(cam);
        if (!onScreen(ndc)) return 'off screen';
        const ray = new REAL.Raycaster();
        ray.setFromCamera(new REAL.Vector2(ndc.x, ndc.y), cam);
        const pick = firstPick(ray.intersectObjects([studio.group, model.group], true));
        return pick ? pick.key : 'nothing';
    }

    test.each(HALOS)('a tap on the %s from its own station reaches it, on a wide screen and a phone', (key) => {
        const point = things()[key];
        for (const aspect of [16 / 10, 0.45]) {
            expect(`${key} at ${aspect.toFixed(2)}: ${tap(cameraAt(key, aspect), point)}`).toBe(`${key} at ${aspect.toFixed(2)}: ${key}`);
        }
    });

    test('from the overview, every thing in view is reached by a tap on it', () => {
        const cam = cameraAt('overview', 16 / 10);
        const seen = Object.entries(things()).map(([key, p]) => [key, tap(cam, p)]);
        for (const [key, got] of seen) expect(`${key}: ${got}`).toBe(`${key}: ${key}`);
    });

    test('a tap on a lifted level\'s tile reaches the model, and says which level', () => {
        model.lift('second', true);
        const tile = model.placed.tiles.find((t) => t.level === 'second');
        const p = [studio.plinthTop[0] + tile.position[0], studio.plinthTop[1] + tile.position[1] + tile.scale[1] / 2, studio.plinthTop[2] + tile.position[2]];
        const cam = cameraAt('model', 16 / 10);
        const ndc = new REAL.Vector3(...p).project(cam);
        const ray = new REAL.Raycaster();
        ray.setFromCamera(new REAL.Vector2(ndc.x, ndc.y), cam);
        const pick = firstPick(ray.intersectObjects([studio.group, model.group], true));
        expect(pick.key).toBe('model');
        expect(model.levelOfHit(pick.hit)).toBe('second');
        model.lift(null, true);
    });

    test.each([[16 / 10], [0.45]])('on arrival (aspect %f) every halo is on screen and nothing stands in front of it', (aspect) => {
        const cam = cameraAt('overview', aspect);
        const anchors = { ...anchorsFor(CONFIG), model: model.anchor() };
        const ray = new REAL.Raycaster();
        for (const key of HALOS) {
            const point = new REAL.Vector3(...anchors[key]);
            const ndc = point.clone().project(cam);
            if (aspect < 1 && (key === 'menu' || key === 'board')) continue;   // the walls' ends are off a phone's frame
            expect(`${key} on screen: ${onScreen(ndc)}`).toBe(`${key} on screen: true`);
            expect(`${key} hidden: ${hiddenFrom(ray, cam.position, point, [studio.group, model.group], key)}`).toBe(`${key} hidden: false`);
        }
    });

    test("a halo is never hidden by its own thing, only by another", () => {
        // A point on the wall behind the menu: the ray (stopping 3 cm short)
        // meets the menu's face and bezel and nothing else, which hides the
        // board's halo there but not the menu's own.
        const ray = new REAL.Raycaster();
        const cam = cameraAt('menu', 16 / 10);
        const s = CONFIG.studio.menu;
        const inside = new REAL.Vector3(s.x, s.y, -CONFIG.room.depth / 2);
        expect(hiddenFrom(ray, cam.position, inside, [studio.group, model.group], 'menu')).toBe(false);
        expect(hiddenFrom(ray, cam.position, inside, [studio.group, model.group], 'board')).toBe(true);
    });

    test('a halo behind something is hidden', () => {
        // From behind the board's wall, looking through it at the board's
        // halo, the plaster is in the way.
        const ray = new REAL.Raycaster();
        const point = new REAL.Vector3(...anchorsFor(CONFIG).desk);
        const behindWall = new REAL.Vector3(-CONFIG.room.width / 2 - 1, 1.5, CONFIG.studio.desk.z);
        expect(hiddenFrom(ray, behindWall, point, [studio.group, model.group], 'desk')).toBe(true);
    });
});
