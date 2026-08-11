// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The installations' MOTION (www/earthdefense/js/structures.js).
 *
 * The rest of structures.js is covered from earthdefense-init.test.mjs, which
 * runs under the shared chainable THREE proxy. That proxy is the right tool for
 * "does this build without throwing" and the wrong one here: every number it is
 * asked for comes back as zero, and this file is entirely about numbers being
 * right.
 *
 * WHAT IS ACTUALLY BEING TESTED, and why it earns a file of its own. An
 * installation's world position is the product of a body spin, an orbit, and a
 * surface anchor, and not one of those reports a velocity. Nothing in the game
 * could ask how fast an installation was travelling, so the raiders assumed the
 * answer was zero, and the three on the Moon travel at 838 units a second. An
 * attacker that loiters at 420 next to one of those is not loitering, it is
 * being left behind, and the measured result was a fifteen minute run in which
 * the Moon was never fired on once.
 *
 * So the fleet is handed two samples per installation per frame: how fast it is
 * going, and which way is up from it. Both are differences between numbers read
 * out of the scene graph, which means both are exactly the kind of thing a
 * chainable proxy cannot check and a small real stub can.
 */
import { jest } from '@jest/globals';

// ---- A THREE with real arithmetic in it ------------------------------------

class StubVector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
}

/** The only part of the scene graph any of this reads: something that can be
 *  asked where it is in the world, and something that can be parented to. */
class StubObject3D {
    constructor(name = '') {
        this.name = name;
        this.children = [];
        this.visible = true;
        this.material = null;
        this.world = { x: 0, y: 0, z: 0 };
        this.position = new StubVector3();
        this.rotation = { x: 0, y: 0, z: 0 };
        this.scale = { set() {} };
        this.userData = {};
    }
    add(child) { this.children.push(child); child.parent = this; return this; }
    /** Where this object is, in world units. Set directly by the test rather
     *  than composed out of matrices: the point is to drive `structures.js`
     *  with a known trajectory, not to reimplement Three.js. */
    getWorldPosition(target) {
        target.x = this.world.x;
        target.y = this.world.y;
        target.z = this.world.z;
        return target;
    }
}

function geometry() { return { dispose() {} }; }
function material(options) { return { ...options, dispose() {} }; }

globalThis.THREE = {
    Group: StubObject3D,
    Mesh: class extends StubObject3D {
        constructor(g, m) { super(); this.geometry = g; this.material = m; }
    },
    Vector3: StubVector3,
    CylinderGeometry: geometry,
    ConeGeometry: geometry,
    SphereGeometry: geometry,
    OctahedronGeometry: geometry,
    MeshStandardMaterial: material,
    MeshBasicMaterial: material
};

// ---- The bodies the installations stand on ---------------------------------
//
// A real stub rather than the real module: `anchorToSurface` composes matrices
// this THREE does not have, and what these tests need is control over where the
// beacons and the body centres ARE, frame by frame.

const bodies = {
    earth: new StubObject3D('earth'),
    moon: new StubObject3D('moon')
};

jest.unstable_mockModule('../www/shared/js/bodies-1.0.0.min.js', () => ({
    anchorToSurface: (bodyId) => (bodies[bodyId] ? new StubObject3D(`${bodyId}-anchor`) : null),
    getBody: (id) => bodies[id] || null
}));

const { EARTHDEFENSE_CONFIG: CONFIG } = await import('../www/earthdefense/js/config.js');
const structures = await import('../www/earthdefense/js/structures.js');

// ---- Harness ---------------------------------------------------------------

/** Put every installation somewhere known. `place(id, x, y, z)` moves the piece
 *  the aim point is read from, which is the beacon. */
function place(id, x, y, z) {
    const entry = structures.getStructure(id);
    const source = entry.beacon || entry.group;
    source.world = { x, y, z };
}

function centre(bodyId, x, y, z) { bodies[bodyId].world = { x, y, z }; }

const EARTH_ID = CONFIG.structures.earth[0].id;
const MOON_ID = CONFIG.structures.moon[0].id;

beforeEach(() => {
    structures.disposeStructures();
    bodies.earth.world = { x: 0, y: 0, z: 0 };
    bodies.moon.world = { x: 0, y: 0, z: 0 };
    structures.initStructures(CONFIG);
});

// ---- Velocity --------------------------------------------------------------

describe('how fast an installation is travelling', () => {
    test('an installation starts still, and is never guessed at before it has moved', () => {
        // The first sample has nothing to difference against. Reporting one
        // anyway would have every installation arriving from the origin at
        // several million units a second on frame one.
        place(MOON_ID, 64000, 0, 0);
        structures.sampleStructureMotion(1 / 60);
        expect(structures.getStructure(MOON_ID).candidate.speed).toBe(0);
    });

    test('a moving installation reports the speed it is actually moving at', () => {
        place(MOON_ID, 0, 0, 0);
        structures.sampleStructureMotion(1 / 60);        // the first, discarded

        // 838 units a second is the Moon's own orbital speed: 2 pi times 64,000
        // over a 480 second lap.
        place(MOON_ID, 838 / 60, 0, 0);
        structures.sampleStructureMotion(1 / 60);

        const candidate = structures.getStructure(MOON_ID).candidate;
        expect(candidate.speed).toBeCloseTo(838, 6);
        expect(candidate.velocity.x).toBeCloseTo(838, 6);
        expect(candidate.velocity.y).toBeCloseTo(0, 6);
    });

    test('an installation that is holding still reports nothing', () => {
        place(EARTH_ID, 100, 200, 300);
        structures.sampleStructureMotion(1 / 60);
        structures.sampleStructureMotion(1 / 60);
        expect(structures.getStructure(EARTH_ID).candidate.speed).toBe(0);
    });

    test('a paused frame is skipped rather than divided by', () => {
        place(MOON_ID, 0, 0, 0);
        structures.sampleStructureMotion(1 / 60);
        place(MOON_ID, 500, 0, 0);
        expect(() => structures.sampleStructureMotion(0)).not.toThrow();
        expect(structures.getStructure(MOON_ID).candidate.speed).toBe(0);
        expect(() => structures.sampleStructureMotion()).not.toThrow();
    });

    // The candidate objects are reused between frames, because targeting and
    // the fleet both run over all seven of them on every tick.
    test('the velocity is written in place rather than replaced', () => {
        const before = structures.getStructure(MOON_ID).candidate.velocity;
        structures.sampleStructureMotion(1 / 60);
        place(MOON_ID, 10, 0, 0);
        structures.sampleStructureMotion(1 / 60);
        expect(structures.getStructure(MOON_ID).candidate.velocity).toBe(before);
    });

    test('a restart starts the sample again instead of differencing across it', () => {
        // Without this the first frame of run two differences against wherever
        // run one left the aim point, which on the Moon is most of an orbit.
        place(MOON_ID, 0, 0, 0);
        structures.sampleStructureMotion(1 / 60);
        place(MOON_ID, 60, 0, 0);
        structures.sampleStructureMotion(1 / 60);
        expect(structures.getStructure(MOON_ID).candidate.speed).toBeGreaterThan(0);

        structures.resetStructures(CONFIG);
        expect(structures.getStructure(MOON_ID).candidate.speed).toBe(0);

        place(MOON_ID, 90000, 0, 0);
        structures.sampleStructureMotion(1 / 60);
        expect(structures.getStructure(MOON_ID).candidate.speed).toBe(0);
    });
});

// ---- Which way is up -------------------------------------------------------

describe('which way is up from an installation', () => {
    // A raider picks its station around an installation on this vector. Get it
    // wrong on the Moon and half the formation orbits underground: a beacon
    // stands 1,916 units from the centre of a body with a radius of 1,737.
    test('it points from the centre of the body out through the beacon', () => {
        centre('moon', 64000, 0, 0);
        place(MOON_ID, 64000, 1916, 0);
        structures.sampleStructureMotion(1 / 60);

        const up = structures.getStructure(MOON_ID).candidate.up;
        expect(up.x).toBeCloseTo(0, 6);
        expect(up.y).toBeCloseTo(1, 6);
        expect(up.z).toBeCloseTo(0, 6);
    });

    test('it is a unit vector whichever way the installation faces', () => {
        centre('earth', 0, 0, 0);
        place(EARTH_ID, 3000, 4000, 5000);
        structures.sampleStructureMotion(1 / 60);

        const up = structures.getStructure(EARTH_ID).candidate.up;
        expect(Math.hypot(up.x, up.y, up.z)).toBeCloseTo(1, 9);
        expect(up.x).toBeCloseTo(3000 / Math.hypot(3000, 4000, 5000), 6);
    });

    test('it follows the body rather than being fixed at build time', () => {
        centre('moon', 0, 0, 0);
        place(MOON_ID, 0, 0, 1916);
        structures.sampleStructureMotion(1 / 60);
        expect(structures.getStructure(MOON_ID).candidate.up.z).toBeCloseTo(1, 6);

        // Half a lap later the same installation faces the other way.
        place(MOON_ID, 0, 0, -1916);
        structures.sampleStructureMotion(1 / 60);
        expect(structures.getStructure(MOON_ID).candidate.up.z).toBeCloseTo(-1, 6);
    });

    // A stale normal is a slightly wrong formation. A zero one is a raider
    // flying at the middle of a planet, so the previous answer is kept.
    test('an installation exactly at its body centre keeps its last answer', () => {
        centre('moon', 0, 0, 0);
        place(MOON_ID, 0, 1916, 0);
        structures.sampleStructureMotion(1 / 60);

        place(MOON_ID, 0, 0, 0);
        structures.sampleStructureMotion(1 / 60);
        const up = structures.getStructure(MOON_ID).candidate.up;
        expect(up.y).toBeCloseTo(1, 6);
        expect(Math.hypot(up.x, up.y, up.z)).toBeCloseTo(1, 9);
    });

    test('an installation on a body that has gone keeps its last answer too', () => {
        centre('earth', 0, 0, 0);
        place(EARTH_ID, 0, 6550, 0);
        structures.sampleStructureMotion(1 / 60);

        const saved = bodies.earth;
        delete bodies.earth;
        expect(() => structures.sampleStructureMotion(1 / 60)).not.toThrow();
        expect(structures.getStructure(EARTH_ID).candidate.up.y).toBeCloseTo(1, 6);
        bodies.earth = saved;
    });
});

// ---- The seam the fleet reads through --------------------------------------

describe('what the fleet is handed', () => {
    test('every candidate carries a speed and an up alongside its position', () => {
        structures.sampleStructureMotion(1 / 60);
        const candidates = structures.targetCandidates();
        expect(candidates).toHaveLength(7);
        for (const candidate of candidates) {
            expect(typeof candidate.speed).toBe('number');
            expect(Number.isFinite(candidate.speed)).toBe(true);
            expect(Math.hypot(candidate.up.x, candidate.up.y, candidate.up.z)).toBeCloseTo(1, 9);
        }
    });

    // `targetCandidates` is called two or three times a frame, by the fleet and
    // by the guns. The sample must not be one of the things it does, or the
    // second call of a frame reads a zero difference and reports the Moon as
    // standing still.
    test('reading the candidate list does not disturb the measurement', () => {
        place(MOON_ID, 0, 0, 0);
        structures.sampleStructureMotion(1 / 60);
        place(MOON_ID, 838 / 60, 0, 0);
        structures.sampleStructureMotion(1 / 60);

        const speed = structures.getStructure(MOON_ID).candidate.speed;
        structures.targetCandidates();
        structures.targetCandidates();
        expect(structures.getStructure(MOON_ID).candidate.speed).toBe(speed);
    });

    test('a wreck stops being a candidate but is still sampled without throwing', () => {
        structures.destroyStructure(MOON_ID);
        expect(() => structures.sampleStructureMotion(1 / 60)).not.toThrow();
        expect(structures.targetCandidates()).toHaveLength(6);
    });
});
