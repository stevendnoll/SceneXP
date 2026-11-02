// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * xo-ride.test.mjs - the ride over a player's shoulder (Steve, 2026-11-01):
 * the fifth replay view, camera.js `rideDriver`, in the live replay's
 * director and in the clip's shot.
 *
 * Held as numbers: where the camera stands and looks for a man facing
 * downfield with the ball in his hands, behind him, and away in front of him;
 * the clamps at the end line and the touchline; the eased heading and the
 * smoothed ball; the view list itself; the hand-off to the director's shot
 * at the whistle; and the director's own shot standing in when there is
 * nobody to ride.
 */
import { describe, test, expect } from '@jest/globals';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { installThree } from './helpers/three-stub.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const scene = join(here, '..', 'www', 'xo', 'js');

installThree();

const { XO_CONFIG: CFG, FIELD } = await import(join(scene, 'config.js'));
const Cam = await import(join(scene, 'camera.js'));
const C = await import(join(scene, 'clip.js'));

const R = CFG.camera.ride;
const S = CFG.figureScale;
/** Three's turn about y for a man facing downfield (+x). */
const DOWNFIELD = Math.PI / 2;
const man = (x = 14, z = 0, yaw = DOWNFIELD, y = 0) => ({ x, y, z, yaw });
const near = (a, b, digits = 9) => {
    expect(a.x).toBeCloseTo(b.x, digits);
    expect(a.y).toBeCloseTo(b.y, digits);
    expect(a.z).toBeCloseTo(b.z, digits);
};

describe('the fifth view', () => {
    test('the four turns and then the ride, named as one more whole number', () => {
        expect(Cam.RIDES).toEqual(['shoulder']);
        expect(Cam.REPLAY_VIEWS).toBe(Cam.QUARTERS.length + 1);
        expect(Cam.viewOffset(4)).toEqual({ yaw: 0, lift: 0, zoom: 1, quarter: 4, ride: 'shoulder' });
        for (let q = 0; q < Cam.QUARTERS.length; q += 1) expect(Cam.viewOffset(q).ride).toBeNull();
        expect(Cam.viewOffset(5)).toEqual(Cam.viewOffset(0));
        expect(Cam.viewOffset(-1)).toEqual(Cam.viewOffset(4));
    });

    test('the press reaches it after the four, counts as a view moved, and the next press is home', () => {
        Cam.resetView();
        expect(Cam.viewRide()).toBeNull();
        expect(Cam.viewMoved()).toBe(false);
        for (let i = 0; i < Cam.QUARTERS.length; i += 1) Cam.switchView();
        expect(Cam.viewQuarter()).toBe(4);
        expect(Cam.viewRide()).toBe('shoulder');
        expect(Cam.viewMoved()).toBe(true);
        // The ride is a camera of its own, not a turn of the orbit.
        expect(Cam.getView().yaw).toBe(0);
        Cam.switchView();
        expect(Cam.viewQuarter()).toBe(0);
        expect(Cam.viewRide()).toBeNull();
        // Walked backwards from home it is the first stop, and a reset forgets it.
        Cam.switchView(-1);
        expect(Cam.viewRide()).toBe('shoulder');
        Cam.resetView();
        expect(Cam.viewRide()).toBeNull();
        expect(Cam.viewMoved()).toBe(false);
    });
});

describe('where the ride stands and looks', () => {
    test('behind a man facing downfield, over his shoulder, looking ahead of him', () => {
        const shot = Cam.rideDriver(man());
        near(shot.position, { x: 14 - R.back * S, y: R.height * S, z: 0 });
        near(shot.target, { x: 14 + R.ahead, y: R.eye * S, z: 0 });
        expect(shot.fov).toBe(R.fov);
        // The lens opens upright, where a phone's frame shows a slice of one lane.
        expect(Cam.rideDriver(man(), null, { aspect: 9 / 16 }).fov).toBe(R.fovUpright);
        expect(R.fovUpright).toBeGreaterThan(R.fov);
    });

    test('it follows his facing: a man turned across the field is shot from his other side', () => {
        const across = Cam.rideDriver(man(14, 0, 0));   // facing +z
        near(across.position, { x: 14, y: R.height * S, z: -R.back * S });
        near(across.target, { x: 14, y: R.eye * S, z: R.ahead });
        // His feet carry the camera: a lifted man lifts it with him.
        expect(Cam.rideDriver(man(14, 0, DOWNFIELD, 1)).position.y).toBeCloseTo(1 + R.height * S, 9);
    });

    test('the ball in his hands, or behind him, draws nothing: he looks where he faces', () => {
        const alone = Cam.rideDriver(man());
        expect(Cam.rideDriver(man(), { x: 14.4, y: 1.2, z: 0.3 })).toEqual(alone);
        expect(Cam.rideDriver(man(), { x: 2, y: 0, z: 0 })).toEqual(alone);
        // Beside him, still inside `near`, is still his.
        expect(Cam.rideDriver(man(), { x: 14, y: 0, z: R.near - 0.1 })).toEqual(alone);
        // Behind and far: a receiver whose quarterback still has it.
        expect(Cam.rideDriver(man(30, 5), { x: 12, y: 0, z: 0 })).toEqual(Cam.rideDriver(man(30, 5)));
    });

    test('the ball away in front of him draws the whole look, and the camera swings behind that line', () => {
        const ball = { x: 30, y: 0, z: 8 };
        const shot = Cam.rideDriver(man(), ball);
        const d = Math.hypot(30 - 14, 8);
        expect(d).toBeGreaterThan(R.far);
        const ux = (30 - 14) / d;
        const uz = 8 / d;
        near(shot.position, { x: 14 - ux * R.back * S, y: R.height * S, z: -uz * R.back * S });
        // Aimed at the ball, no lower than the orbit aims.
        near(shot.target, { x: 30, y: 0.9, z: 8 });
        expect(Cam.rideDriver(man(), { ...ball, y: 3 }).target.y).toBeCloseTo(3, 9);
    });

    test('between near and far the look is a blend of the two', () => {
        const mid = R.near + (R.far - R.near) / 2;
        const shot = Cam.rideDriver(man(), { x: 14 + mid, y: 0, z: 0 });
        // Straight ahead, so the heading is his facing and only the look point moves.
        near(shot.position, Cam.rideDriver(man()).position);
        expect(shot.target.x).toBeCloseTo((14 + R.ahead + 14 + mid) / 2, 9);
        expect(shot.target.y).toBeCloseTo((R.eye * S + 0.9) / 2, 9);
    });

    test('a man with a look of his own is shot along it: a receiver looking back is seen from his far side, the quarterback beyond', () => {
        // Running downfield, head turned back to a quarterback behind him and
        // to one side (Follow me, Steve's QA 2026-11-01).
        const rider = { ...man(20, 2), look: { x: 6, z: -1 } };
        const shot = Cam.rideDriver(rider, { x: 6, y: 0, z: -1 });
        const d = Math.hypot(6 - 20, -1 - 2);
        const ux = (6 - 20) / d;
        const uz = (-1 - 2) / d;
        // Behind the heading is in FRONT of the man: the camera is downfield
        // of him, looking back past his shoulder.
        near(shot.position, { x: 20 - ux * R.back * S, y: R.height * S, z: 2 - uz * R.back * S });
        expect(shot.position.x).toBeGreaterThan(20);
        // Aimed at the point he looks at, at his eye height.
        near(shot.target, { x: 6, y: R.eye * S, z: -1 });
        // A look in front of him is the same shot the ball would give, lifted to his eyes.
        const ahead = Cam.rideDriver({ ...man(), look: { x: 30, z: 8 } });
        near(ahead.position, Cam.rideDriver(man(), { x: 30, y: 0, z: 8 }).position);
        near(ahead.target, { x: 30, y: R.eye * S, z: 8 });
        // No look, or a look that is not a point: the ball rule as before.
        expect(Cam.rideDriver({ ...man(), look: null }, { x: 2, y: 0, z: 0 })).toEqual(Cam.rideDriver(man()));
        expect(Cam.rideDriver({ ...man(), look: { x: NaN, z: 0 } })).toEqual(Cam.rideDriver(man()));
        // Eased like any heading: a short frame after seeding on the run barely moves it.
        const memory = Cam.newRide();
        const cold = Cam.rideDriver(man(20, 2), null, { memory, delta: 0 });
        const soon = Cam.rideDriver(rider, null, { memory, delta: 0.001 });
        expect(Math.abs(soon.position.x - cold.position.x)).toBeLessThan(0.05);
    });

    test('never behind an end line, never in the seats, never below the floor', () => {
        // On his own goal line facing downfield: a step behind him is in the end zone, past the line.
        const deep = Cam.rideDriver(man(-FIELD.endZone, 0));
        expect(deep.position.x).toBeCloseTo(-FIELD.endZone + 0.5, 9);
        // Past the far end line the same way round.
        const len = FIELD.lineInterval * FIELD.segments;
        expect(Cam.rideDriver(man(len + FIELD.endZone, 0, -DOWNFIELD)).position.x).toBeCloseTo(len + FIELD.endZone - 0.5, 9);
        // On the touchline facing in: a step behind him is in the seats.
        const edge = FIELD.width / 2 + FIELD.sideline;
        expect(Cam.rideDriver(man(14, edge, Math.PI)).position.z).toBeCloseTo(edge, 9);
        expect(Cam.rideDriver(man(14, -edge, 0)).position.z).toBeCloseTo(-edge, 9);
        // The floor, however low his feet are read.
        expect(Cam.rideDriver(man(14, 0, DOWNFIELD, -50)).position.y).toBe(R.floor);
        // Nobody to ride is no shot.
        expect(Cam.rideDriver(null)).toBeNull();
        expect(Cam.rideDriver({ x: NaN, y: 0, z: 0, yaw: 0 })).toBeNull();
    });
});

describe('the ride remembers', () => {
    test('a fresh memory seeds on the first frame, then eases the heading over turnSmooth', () => {
        const memory = Cam.newRide();
        const cold = Cam.rideDriver(man());
        expect(Cam.rideDriver(man(), null, { memory, delta: 1 / 60 })).toEqual(cold);
        expect(memory.seeded).toBe(true);
        // The ball appears far off to the side: a short frame barely turns
        // the camera, a long wait turns it all the way.
        const ball = { x: 30, y: 0, z: 8 };
        memory.aim.seeded = false;   // so the ball is taken as given, not smoothed in
        const soon = Cam.rideDriver(man(), ball, { memory, delta: 0.001 });
        expect(Math.abs(soon.position.z - cold.position.z)).toBeLessThan(0.02);
        const late = Cam.rideDriver(man(), ball, { memory, delta: 30 });
        near(late.position, Cam.rideDriver(man(), ball).position, 6);
        near(late.target, Cam.rideDriver(man(), ball).target, 6);
    });

    test('the heading goes the short way round, across the seam', () => {
        // Facing just short of a half turn one way; the ball just short of it
        // the other way, in front of him. The short way is through the seam.
        const memory = Cam.newRide();
        const rider = man(14, 0, 3.0);
        Cam.rideDriver(rider, null, { memory, delta: 0 });
        expect(memory.heading).toBeCloseTo(3.0, 9);
        const ball = { x: 14 + Math.sin(-3.0) * 20, y: 0, z: Math.cos(-3.0) * 20 };
        Cam.rideDriver(rider, ball, { memory, delta: 0.05 });
        expect(memory.heading).toBeGreaterThan(3.0);
        expect(memory.heading).toBeLessThan(Math.PI + 0.3);
    });

    test('the ball is smoothed through an aim of the memory\'s own', () => {
        const memory = Cam.newRide();
        const a = { x: 30, y: 0, z: 0 };
        const b = { x: 30, y: 0, z: 8 };
        Cam.rideDriver(man(), a, { memory, delta: 10 });
        const stepped = Cam.rideDriver(man(), b, { memory, delta: 0.05 });
        // Between the two, not at the new one.
        expect(stepped.target.z).toBeGreaterThan(0.5);
        expect(stepped.target.z).toBeLessThan(7.5);
        expect(memory.aim.z).toBeCloseTo(stepped.target.z, 9);
        // And a reset forgets both.
        Cam.resetRide(memory);
        expect(memory.seeded).toBe(false);
        expect(memory.aim.seeded).toBe(false);
    });
});

describe('in the director and in the clip', () => {
    const focus = { x: 14, y: 0, z: 0 };
    const ball = { x: 14, y: 0, z: 0 };
    const toRide = () => { Cam.resetView(); for (let i = 0; i < Cam.QUARTERS.length; i += 1) Cam.switchView(); };

    test('the director rides the man it is handed, and with nobody to ride shows its own shot', () => {
        Cam.setDriver('replay');
        toRide();
        const shot = Cam.update(0, { progress: 0.5, focus, rider: man(), ball });
        expect(shot.position.y).toBeCloseTo(R.height * S, 9);
        expect(shot.position.x).toBeCloseTo(14 - R.back * S, 9);
        expect(shot.fov).toBe(R.fov);
        // The same frame from the director's own view, fresh both times.
        Cam.resetView();
        const own = Cam.update(0, { progress: 0.5, focus });
        toRide();
        expect(Cam.update(0, { progress: 0.5, focus, rider: null, ball })).toEqual(own);
        // ...and the ride ignores the zoom a visitor may have left on the orbit.
        toRide();
        Cam.nudgeView({ zoom: 2 });
        expect(Cam.update(0, { progress: 0.5, focus, rider: man(), ball })).toEqual(shot);
        Cam.resetView();
    });

    test('at the whistle the ride hands off to the director\'s settled shot for the ending', () => {
        Cam.setDriver('replay');
        const ending = { focus: { x: 24, y: 0, z: 1 }, points: [{ x: 24, y: 0, z: 1 }, { x: 25, y: 3.85, z: 2 }] };
        Cam.resetView();
        const own = Cam.update(0, { progress: 1, focus: ending.focus, ending });
        toRide();
        const ridden = Cam.update(0, { progress: 1, focus: ending.focus, ending, rider: man(24, 1), ball: ending.focus });
        expect(ridden).toEqual(own);
        expect(ridden.position.y).not.toBeCloseTo(R.height * S, 1);
        Cam.resetView();
    });

    test('the clip\'s shot rides from the fifth view with its own memory, and stands in without a rider', () => {
        const fresh = () => ({ shoulder: Cam.newShoulder(), aim: Cam.newAim(), ride: Cam.newRide() });
        const ridden = C.clipShot(0.5, focus, { ...fresh(), quarter: 4, rider: man(), ball, delta: 1 / 60 });
        expect(ridden).toEqual(Cam.rideDriver(man(), ball, { memory: Cam.newRide(), delta: 1 / 60, aspect: CFG.clip.width / CFG.clip.height }));
        // A phone's upright clip gets the wider lens.
        expect(ridden.fov).toBe(R.fovUpright);
        expect(C.clipShot(0.5, focus, { ...fresh(), quarter: 4, rider: man(), ball, aspect: 16 / 9 }).fov).toBe(R.fov);
        // Nobody to ride: the director's own, exactly.
        expect(C.clipShot(0.5, focus, { ...fresh(), quarter: 4, rider: null, ball }))
            .toEqual(C.clipShot(0.5, focus, { ...fresh(), quarter: 0 }));
        // The ending's bodies: the director's settled shot, fitted, in the ride as in the first view.
        const ending = { focus: { x: 24, y: 0, z: 1 }, points: [{ x: 24, y: 0, z: 1 }, { x: 25, y: 3.85, z: 2 }] };
        expect(C.clipShot(1, ending.focus, { ...fresh(), quarter: 4, rider: man(24, 1), ball, points: ending.points }))
            .toEqual(C.clipShot(1, ending.focus, { ...fresh(), quarter: 0, points: ending.points }));
    });
});
