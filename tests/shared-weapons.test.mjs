// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Unit tests for www/shared/js/weapons-1.0.0.js — automatic fire, the damage
 * ledger, and the pooled effects.
 *
 * The module splits cleanly in two and so does this file.
 *
 * THE PURE HALF (stepCadence, the damageable registry) is plain arithmetic and
 * is tested with real numbers. The properties worth the most care:
 *
 *   1. A LONG FRAME FIRES THE RIGHT NUMBER OF SHOTS, and a very long one is
 *      CAPPED. Returning a boolean instead of a count drops shots on a slow
 *      frame; carrying an uncapped backlog empties a minute of fire into
 *      whatever happens to be centred when a backgrounded tab comes back.
 *      Both failures are invisible until someone plays on a real phone.
 *   2. onDestroyed FIRES EXACTLY ONCE. A caller told twice that the same
 *      target died will decrement a counter twice, and at M6 that is a game
 *      that declares victory early.
 *
 * THE SHELL HALF runs under a small recording THREE rather than the shared
 * chainable proxy, because the assertions that matter here are about the pool
 * (does it stay bounded, does a tracer get recycled, does dispose release
 * everything) and a proxy that agrees with every question cannot answer those.
 * Geometry is not asserted; occupancy is.
 */
import { jest } from '@jest/globals';

// ---- A recording THREE -----------------------------------------------------

const disposed = { geometries: 0, materials: 0 };

class Obj3D {
    constructor() {
        this.children = [];
        this.visible = true;
        this.name = '';
        this.position = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
        this.scale = { value: 1, setScalar(s) { this.value = s; } };
    }
    add(o) { this.children.push(o); }
}

function installThree() {
    disposed.geometries = 0;
    disposed.materials = 0;

    const geometry = () => ({
        attributes: {},
        setAttribute(name, attr) { this.attributes[name] = attr; },
        dispose() { disposed.geometries++; }
    });
    const material = (opts = {}) => ({ ...opts, dispose() { disposed.materials++; } });

    globalThis.THREE = {
        Group: Obj3D,
        Mesh: class extends Obj3D {
            constructor(g, m) { super(); this.geometry = g; this.material = m; }
        },
        Line: class extends Obj3D {
            constructor(g, m) { super(); this.geometry = g; this.material = m; }
        },
        Points: class extends Obj3D {
            constructor(g, m) { super(); this.geometry = g; this.material = m; }
        },
        BufferGeometry: function () { return geometry(); },
        SphereGeometry: function () { return geometry(); },
        BufferAttribute: function (array, itemSize) { return { array, itemSize, needsUpdate: false }; },
        LineBasicMaterial: function (o) { return material(o); },
        MeshBasicMaterial: function (o) { return material(o); },
        PointsMaterial: function (o) { return material(o); }
    };
}

let mod;

beforeEach(async () => {
    installThree();
    jest.resetModules();
    mod = await import('../www/shared/js/weapons-1.0.0.js');
});

afterEach(() => {
    if (mod) mod.disposeWeapons();
    delete globalThis.THREE;
});

const CONFIG = {
    shotsPerSecond: 4,          // one shot every 0.25s
    damagePerShot: 1,
    maxShotsPerFrame: 4,
    tracerSpeed: 30000,
    tracerLife: 0.35,
    tracerLength: 900,
    burstParticles: 8,
    burstLife: 0.9,
    flashLife: 0.18
};

const MUZZLES = [{ x: 10, y: -5, z: -30 }, { x: -10, y: -5, z: -30 }];

/** A pickTarget-shaped result for something 2,000 units dead ahead. */
const targetFor = (id, radius = 160) => ({
    id,
    angle: 0.01,
    distance: 2000,
    position: { x: 0, y: 0, z: -2000 },
    candidate: { id, radius }
});

// ---- stepCadence -----------------------------------------------------------

describe('stepCadence', () => {
    const INTERVAL = 0.25;

    test('no shot before the interval has passed', () => {
        const r = mod.stepCadence(0, 0.2, INTERVAL);
        expect(r.shots).toBe(0);
        expect(r.accumulator).toBeCloseTo(0.2, 10);
    });

    test('exactly one shot at the interval', () => {
        const r = mod.stepCadence(0, 0.25, INTERVAL);
        expect(r.shots).toBe(1);
        expect(r.accumulator).toBeCloseTo(0, 10);
    });

    test('exactly three across a frame worth three intervals', () => {
        const r = mod.stepCadence(0, 0.75, INTERVAL);
        expect(r.shots).toBe(3);
    });

    test('the remainder is carried into the next frame', () => {
        const first = mod.stepCadence(0, 0.3, INTERVAL);
        expect(first.shots).toBe(1);
        expect(first.accumulator).toBeCloseTo(0.05, 10);
        // 0.05 carried plus 0.2 more is exactly one more shot.
        const second = mod.stepCadence(first.accumulator, 0.2, INTERVAL);
        expect(second.shots).toBe(1);
        expect(second.accumulator).toBeCloseTo(0, 10);
    });

    test('four frames of a quarter interval each earn one shot between them', () => {
        let acc = 0;
        let total = 0;
        for (let i = 0; i < 4; i++) {
            const r = mod.stepCadence(acc, INTERVAL / 4, INTERVAL);
            acc = r.accumulator;
            total += r.shots;
        }
        expect(total).toBe(1);
    });

    test('a very long frame is capped, and the backlog is DISCARDED', () => {
        const r = mod.stepCadence(0, 60, INTERVAL, 4);
        expect(r.shots).toBe(4);
        // The carried value is only the sub-interval remainder. Carrying the
        // other 236 shots would fire the same burst one frame later, which is
        // the bug the cap exists to prevent rather than a fix for it.
        expect(r.accumulator).toBeLessThan(INTERVAL);
    });

    test('the accumulator always lands in [0, interval)', () => {
        for (const dt of [0, 0.01, 0.24999, 0.25, 0.9, 3, 100]) {
            const r = mod.stepCadence(0.1, dt, INTERVAL);
            expect(r.accumulator).toBeGreaterThanOrEqual(0);
            expect(r.accumulator).toBeLessThan(INTERVAL);
        }
    });

    test('zero dt fires nothing and changes nothing', () => {
        const r = mod.stepCadence(0.2, 0, INTERVAL);
        expect(r.shots).toBe(0);
        expect(r.accumulator).toBeCloseTo(0.2, 10);
    });

    test('a nonsensical interval fires nothing rather than dividing by zero', () => {
        expect(mod.stepCadence(5, 5, 0)).toEqual({ shots: 0, accumulator: 0 });
        expect(mod.stepCadence(5, 5, -1)).toEqual({ shots: 0, accumulator: 0 });
    });

    test('missing arguments are treated as zero rather than as NaN', () => {
        const r = mod.stepCadence(undefined, undefined, INTERVAL);
        expect(r.shots).toBe(0);
        expect(Number.isNaN(r.accumulator)).toBe(false);
    });
});

// ---- The damage ledger -----------------------------------------------------

describe('the damageable registry', () => {
    test('three hits destroy a three-point structure and the fourth is a no-op', () => {
        mod.registerDamageable('outpost', 3);
        expect(mod.applyDamage('outpost', 1)).toEqual({ id: 'outpost', hitPoints: 2, destroyed: false });
        expect(mod.applyDamage('outpost', 1)).toEqual({ id: 'outpost', hitPoints: 1, destroyed: false });
        expect(mod.applyDamage('outpost', 1)).toEqual({ id: 'outpost', hitPoints: 0, destroyed: true });
        // A fourth hit must NOT report a second destruction.
        expect(mod.applyDamage('outpost', 1)).toEqual({ id: 'outpost', hitPoints: 0, destroyed: false });
    });

    test('one hit destroys a one-point ship', () => {
        mod.registerDamageable('raider', 1);
        expect(mod.applyDamage('raider', 1).destroyed).toBe(true);
    });

    test('overkill in a single hit does not drive hit points negative', () => {
        mod.registerDamageable('outpost', 3);
        expect(mod.applyDamage('outpost', 99)).toEqual({ id: 'outpost', hitPoints: 0, destroyed: true });
    });

    test('an unknown id returns null rather than throwing', () => {
        expect(mod.applyDamage('nobody', 1)).toBeNull();
        expect(mod.getDamageable('nobody')).toBeNull();
        expect(mod.isAlive('nobody')).toBe(false);
    });

    test('re-registering an id resets it, which is what a restart wants', () => {
        mod.registerDamageable('outpost', 3);
        mod.applyDamage('outpost', 3);
        expect(mod.isAlive('outpost')).toBe(false);
        mod.registerDamageable('outpost', 3);
        expect(mod.isAlive('outpost')).toBe(true);
        expect(mod.getDamageable('outpost').hitPoints).toBe(3);
    });

    test('clearDamageables empties the ledger', () => {
        mod.registerDamageable('a', 1);
        mod.clearDamageables();
        expect(mod.applyDamage('a', 1)).toBeNull();
    });
});

// ---- Firing ----------------------------------------------------------------

describe('firing', () => {
    beforeEach(() => {
        mod.initWeapons(CONFIG, new THREE.Group());
    });

    test('the first frame with a target fires immediately', () => {
        mod.registerDamageable('outpost', 3);
        // Waiting a quarter of a second for the first shot is exactly what
        // makes automatic fire read as passive, so the cadence starts primed.
        expect(mod.updateWeapons(0.016, targetFor('outpost'), MUZZLES)).toBe(1);
    });

    test('a target takes damage the moment it is fired at, not on tracer arrival', () => {
        mod.registerDamageable('outpost', 3);
        mod.updateWeapons(0.016, targetFor('outpost'), MUZZLES);
        // The tracer is still in flight. The hit has already landed.
        expect(mod.getDamageable('outpost').hitPoints).toBe(2);
        expect(mod.activeTracerCount()).toBe(1);
    });

    test('three frames a quarter second apart destroy a three-point structure', () => {
        mod.registerDamageable('outpost', 3);
        const target = targetFor('outpost');
        mod.updateWeapons(0.016, target, MUZZLES);
        mod.updateWeapons(0.25, target, MUZZLES);
        mod.updateWeapons(0.25, target, MUZZLES);
        expect(mod.isAlive('outpost')).toBe(false);
    });

    test('firing stops the frame the target goes null', () => {
        mod.registerDamageable('outpost', 3);
        mod.updateWeapons(0.016, targetFor('outpost'), MUZZLES);
        expect(mod.updateWeapons(1.0, null, MUZZLES)).toBe(0);
        expect(mod.getDamageable('outpost').hitPoints).toBe(2);
    });

    test('firing stops on a target that is already dead', () => {
        mod.registerDamageable('raider', 1);
        mod.applyDamage('raider', 1);
        expect(mod.updateWeapons(1.0, targetFor('raider'), MUZZLES)).toBe(0);
    });

    test('a target nobody registered is not shot at', () => {
        expect(mod.updateWeapons(1.0, targetFor('ghost'), MUZZLES)).toBe(0);
    });

    test('losing the target leaves the cadence primed rather than running up', () => {
        mod.registerDamageable('a', 9);
        mod.registerDamageable('b', 9);
        mod.updateWeapons(0.016, targetFor('a'), MUZZLES);
        // Ten seconds with nothing to shoot must not bank forty shots.
        mod.updateWeapons(10, null, MUZZLES);
        expect(mod.updateWeapons(0.016, targetFor('b'), MUZZLES)).toBe(1);
    });

    test('a long frame does not punch through a target and out the other side', () => {
        mod.registerDamageable('outpost', 3);
        // Four shots' worth of time against three hit points: it fires three
        // and stops, rather than spending the fourth on a corpse.
        expect(mod.updateWeapons(1.0, targetFor('outpost'), MUZZLES)).toBe(3);
        expect(mod.getDamageable('outpost').hitPoints).toBe(0);
    });

    test('onHit fires per shot and onDestroyed exactly once', () => {
        const hits = [];
        const kills = [];
        mod.onHit(r => hits.push(r.hitPoints));
        mod.onDestroyed(r => kills.push(r.id));

        mod.registerDamageable('outpost', 3);
        const target = targetFor('outpost');
        for (let i = 0; i < 8; i++) mod.updateWeapons(0.25, target, MUZZLES);

        expect(hits).toEqual([2, 1, 0]);
        expect(kills).toEqual(['outpost']);
    });

    test('onDestroyed is handed the same result onHit sees', () => {
        let killed = null;
        let lastHit = null;
        mod.onDestroyed(r => { killed = r; });
        mod.onHit(r => { lastHit = r; });
        mod.registerDamageable('raider', 1);
        mod.updateWeapons(0.016, targetFor('raider'), MUZZLES);
        expect(killed).toEqual({ id: 'raider', hitPoints: 0, destroyed: true });
        expect(lastHit).toEqual(killed);
    });

    test('no callbacks registered is not an error', () => {
        mod.registerDamageable('outpost', 1);
        expect(() => mod.updateWeapons(0.016, targetFor('outpost'), MUZZLES)).not.toThrow();
    });

    test('updating before init does nothing rather than throwing', () => {
        mod.disposeWeapons();
        expect(mod.updateWeapons(0.1, targetFor('outpost'), MUZZLES)).toBe(0);
    });
});

// ---- The pools -------------------------------------------------------------

describe('the effect pools', () => {
    beforeEach(() => {
        mod.initWeapons(CONFIG, new THREE.Group());
    });

    test('the tracer pool is sized from the cadence and the lifetime', () => {
        // ceil(4 * 0.35) = 2, plus 4 frames of headroom.
        expect(mod.tracerPoolSize()).toBe(6);
    });

    test('the pool never grows, however much is fired through it', () => {
        mod.registerDamageable('outpost', 10000);
        const target = targetFor('outpost');
        const size = mod.tracerPoolSize();
        for (let i = 0; i < 200; i++) mod.updateWeapons(0.25, target, MUZZLES);
        expect(mod.tracerPoolSize()).toBe(size);
        expect(mod.activeTracerCount()).toBeLessThanOrEqual(size);
    });

    test('a tracer is returned to the pool once its life is up', () => {
        mod.registerDamageable('outpost', 10);
        mod.updateWeapons(0.016, targetFor('outpost'), MUZZLES);
        expect(mod.activeTracerCount()).toBe(1);
        // Advance past tracerLife with nothing to shoot: effects keep running
        // with no target, which is what lets a burst finish playing.
        mod.updateWeapons(0.5, null, MUZZLES);
        expect(mod.activeTracerCount()).toBe(0);
    });

    test('a tracer retires when it reaches the target, before its life is up', () => {
        mod.registerDamageable('outpost', 10);
        // 2,000 units at 30,000 units/s arrives in about 0.067s, well inside
        // the 0.35s lifetime. It must stop there rather than sail on through
        // the planet behind it.
        mod.updateWeapons(0.016, targetFor('outpost'), MUZZLES);
        mod.updateWeapons(0.1, null, MUZZLES);
        expect(mod.activeTracerCount()).toBe(0);
    });

    test('shots alternate between the muzzles', () => {
        mod.registerDamageable('outpost', 10);
        const target = targetFor('outpost');
        // A single long frame earns four shots at once, so all four origins are
        // readable before any of them has had a chance to expire.
        mod.updateWeapons(1.0, target, MUZZLES);

        const origins = mod.__test__.allTracers()
            .filter(t => t.active)
            .map(t => t.origin.x);
        expect(origins).toEqual([10, -10, 10, -10]);
    });

    test('a tracer leaves the muzzle and heads for the target', () => {
        mod.registerDamageable('outpost', 10);
        mod.updateWeapons(0.016, targetFor('outpost'), [MUZZLES[0]]);

        const t = mod.__test__.allTracers().find(x => x.active);
        expect(t.origin).toEqual(MUZZLES[0]);
        // Unit direction, pointing forward and slightly inward from the right
        // hand gun: this is the convergence that sells the ship.
        expect(Math.hypot(t.direction.x, t.direction.y, t.direction.z)).toBeCloseTo(1, 10);
        expect(t.direction.z).toBeLessThan(0);
        expect(t.direction.x).toBeLessThan(0);
        expect(t.travelLimit).toBe(2000);
    });

    test('a freshly fired tracer is not aged by the frame that created it', () => {
        mod.registerDamageable('outpost', 10);
        // A tenth of a second at 30,000 units/s would carry a tracer 3,000
        // units, past a target only 2,000 away. Aging it inside its own frame
        // would retire it before it was ever drawn.
        mod.updateWeapons(0.1, targetFor('outpost'), MUZZLES);
        expect(mod.activeTracerCount()).toBe(1);
        expect(mod.__test__.allTracers().find(t => t.active).age).toBe(0);
    });

    test('firing with no muzzles at all still resolves the hit', () => {
        mod.registerDamageable('outpost', 3);
        expect(mod.updateWeapons(0.016, targetFor('outpost'), [])).toBe(1);
        expect(mod.getDamageable('outpost').hitPoints).toBe(2);
        expect(() => mod.updateWeapons(0.25, targetFor('outpost'), null)).not.toThrow();
    });

    test('an exhausted tracer pool drops the streak rather than allocating', () => {
        const size = mod.tracerPoolSize();
        for (let i = 0; i < size + 5; i++) {
            mod.__test__.spawnTracer({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -100 }, 100);
        }
        expect(mod.tracerPoolSize()).toBe(size);
        expect(mod.activeTracerCount()).toBe(size);
    });

    test('a destruction spends a burst, an ordinary hit spends a flash', () => {
        const group = mod.getWeaponsGroup();
        const bursts = group.children.filter(c => c.name.startsWith('burst-'));
        const flashes = group.children.filter(c => c.name.startsWith('hit-flash-'));
        expect(bursts.length).toBe(3);
        expect(flashes.length).toBe(4);

        mod.registerDamageable('outpost', 2);
        mod.updateWeapons(0.016, targetFor('outpost'), MUZZLES);
        expect(flashes.some(f => f.visible)).toBe(true);
        expect(bursts.some(b => b.visible)).toBe(false);

        mod.updateWeapons(0.25, targetFor('outpost'), MUZZLES);
        expect(bursts.some(b => b.visible)).toBe(true);
    });

    test('effects retire on their own clock once they are done', () => {
        mod.registerDamageable('outpost', 1);
        mod.updateWeapons(0.016, targetFor('outpost'), MUZZLES);
        const group = mod.getWeaponsGroup();
        expect(group.children.some(c => c.name.startsWith('burst-') && c.visible)).toBe(true);
        // Past burstLife.
        mod.updateWeapons(1.0, null, MUZZLES);
        expect(group.children.some(c => c.name.startsWith('burst-') && c.visible)).toBe(false);
    });

    test('the oldest slot is reused when every one is busy', () => {
        const pool = [{ age: 1 }, { age: 9 }, { age: 4 }];
        expect(mod.__test__.oldest(pool)).toBe(pool[1]);
        expect(mod.__test__.oldest([])).toBeNull();
    });

    test('more destructions at once than there are burst slots still works', () => {
        for (const id of ['a', 'b', 'c', 'd', 'e']) mod.registerDamageable(id, 1);
        for (const id of ['a', 'b', 'c', 'd', 'e']) {
            expect(() => mod.updateWeapons(0.25, targetFor(id), MUZZLES)).not.toThrow();
        }
    });

    test('a target carrying no radius falls back to the configured default', () => {
        mod.registerDamageable('outpost', 1);
        const bare = { id: 'outpost', angle: 0, distance: 500, position: { x: 0, y: 0, z: -500 } };
        expect(() => mod.updateWeapons(0.016, bare, MUZZLES)).not.toThrow();
    });
});

// ---- Lifecycle -------------------------------------------------------------

describe('init and dispose', () => {
    test('init adds one group to the scene and fills every pool', () => {
        const scene = new THREE.Group();
        const group = mod.initWeapons(CONFIG, scene);
        expect(scene.children).toEqual([group]);
        expect(group.name).toBe('weapons');
        // 6 tracers, 4 flashes, 3 bursts.
        expect(group.children.length).toBe(13);
    });

    test('init without a scene builds the group anyway', () => {
        expect(() => mod.initWeapons(CONFIG)).not.toThrow();
        expect(mod.getWeaponsGroup()).not.toBeNull();
    });

    test('init with no config at all uses the defaults', () => {
        mod.initWeapons();
        expect(mod.tracerPoolSize()).toBeGreaterThan(1);
    });

    test('re-initialising releases the previous pools rather than leaking them', () => {
        mod.initWeapons(CONFIG, new THREE.Group());
        const before = disposed.geometries + disposed.materials;
        mod.initWeapons(CONFIG, new THREE.Group());
        expect(disposed.geometries + disposed.materials).toBeGreaterThan(before);
    });

    test('dispose releases every geometry and material and clears the ledger', () => {
        mod.initWeapons(CONFIG, new THREE.Group());
        mod.registerDamageable('outpost', 3);
        disposed.geometries = 0;
        disposed.materials = 0;

        mod.disposeWeapons();

        // 6 tracer geometries + 3 burst geometries + 1 shared flash sphere.
        expect(disposed.geometries).toBe(10);
        // 6 tracer + 4 flash + 3 burst.
        expect(disposed.materials).toBe(13);
        expect(mod.getWeaponsGroup()).toBeNull();
        expect(mod.applyDamage('outpost', 1)).toBeNull();
    });

    test('the flash pool shares ONE geometry rather than four', () => {
        mod.initWeapons(CONFIG, new THREE.Group());
        const group = mod.getWeaponsGroup();
        const flashes = group.children.filter(c => c.name.startsWith('hit-flash-'));
        const geometries = new Set(flashes.map(f => f.geometry));
        expect(flashes.length).toBe(4);
        expect(geometries.size).toBe(1);
    });

    test('dispose twice does not throw', () => {
        mod.initWeapons(CONFIG, new THREE.Group());
        mod.disposeWeapons();
        expect(() => mod.disposeWeapons()).not.toThrow();
    });

    test('dispose clears the callbacks, so a stale one cannot fire after a restart', () => {
        const seen = [];
        mod.initWeapons(CONFIG, new THREE.Group());
        mod.onDestroyed(r => seen.push(r.id));
        mod.disposeWeapons();

        mod.initWeapons(CONFIG, new THREE.Group());
        mod.registerDamageable('raider', 1);
        mod.updateWeapons(0.016, targetFor('raider'), MUZZLES);
        expect(seen).toEqual([]);
    });
});
