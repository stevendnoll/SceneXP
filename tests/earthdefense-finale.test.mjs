// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The end-of-run shots (www/earthdefense/js/finale.js).
 *
 * THREE ENDINGS OUT OF ONE MECHANISM, and most of what is asserted here is that
 * the mechanism is genuinely one: an orbit around a subject, plus a schedule of
 * emissions at a list of source points. What separates the celebration from the
 * graveyard is config, so these tests drive all three through the same handful
 * of functions and check that the DIFFERENCES are the ones config asked for.
 *
 * THE FRAMING IS ARITHMETIC, SO IT IS TESTED AS ARITHMETIC. A shot of Earth
 * from 15,000 units either has the globe in frame or it does not, and a spark
 * sized in world units either covers enough pixels to be seen or it does not.
 * Both are a division, and both have been quietly broken by a plausible-looking
 * tune before, so the bounds are written down here rather than left to a
 * screenshot to notice.
 *
 * NOTHING IN THIS FILE ALLOWS FOR RANDOMNESS, because there is none: the
 * cadence, the sites, the offsets and the spark directions all come from an
 * index. A visitor who wins twice sees the same celebration twice.
 */
import { jest } from '@jest/globals';

// Just enough THREE to build a Points object, and recording rather than
// pretending: what matters is which numbers reach the buffers.
class FakeAttribute {
    constructor(array, itemSize) {
        this.array = array; this.itemSize = itemSize; this.needsUpdate = false;
    }
}
class FakeGeometry {
    constructor() { this.attributes = {}; this.range = null; this.disposed = false; }
    setAttribute(name, attr) { this.attributes[name] = attr; return this; }
    setDrawRange(start, count) { this.range = { start, count }; }
    dispose() { this.disposed = true; }
}
class FakeMaterial {
    constructor(opts) { Object.assign(this, opts); this.disposed = false; }
    dispose() { this.disposed = true; }
}
class FakePoints {
    constructor(geometry, material) {
        this.geometry = geometry; this.material = material;
        this.visible = true; this.name = ''; this.frustumCulled = true;
    }
}
class FakeGroup {
    constructor() { this.children = []; this.name = ''; }
    add(child) { this.children.push(child); return this; }
}

function installThree() {
    globalThis.THREE = {
        BufferGeometry: FakeGeometry,
        BufferAttribute: FakeAttribute,
        PointsMaterial: FakeMaterial,
        Points: FakePoints,
        Group: FakeGroup,
        AdditiveBlending: 2
    };
}

let finale;
let CONFIG;
let scene;

beforeEach(async () => {
    installThree();
    jest.resetModules();
    ({ EARTHDEFENSE_CONFIG: CONFIG } = await import('../www/earthdefense/js/config.js'));
    finale = await import('../www/earthdefense/js/finale.js');
    scene = { added: [], add(o) { this.added.push(o); }, remove(o) { this.added = this.added.filter(x => x !== o); } };
    finale.initFinale(scene, CONFIG);
});

afterEach(() => {
    if (finale) finale.disposeFinale(scene);
    delete globalThis.THREE;
});

const EARTH = { x: 0, y: 0, z: 0 };
const EARTH_RADIUS = 6371;
const len = (v) => Math.hypot(v.x, v.y, v.z);
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

/** The four Earth installations, roughly where config puts them: northern,
 *  western, spread across about a third of the globe. Held by reference the way
 *  the real ones are. */
function earthSites() {
    const spec = [[55, -115], [60, -150], [64, -22], [40, -75]];
    return spec.map(([lat, lon]) => {
        const phi = lat * Math.PI / 180;
        const theta = lon * Math.PI / 180;
        const up = {
            x: Math.cos(phi) * Math.cos(theta),
            y: Math.sin(phi),
            z: Math.cos(phi) * Math.sin(theta)
        };
        return {
            up,
            position: { x: up.x * EARTH_RADIUS, y: up.y * EARTH_RADIUS, z: up.z * EARTH_RADIUS }
        };
    });
}

function earthContext() {
    return { subject: { ...EARTH }, sources: earthSites() };
}

/** Run a shot in frames a phone might actually deliver, rather than one step. */
function run(seconds, step = 0.05) {
    for (let t = 0; t < seconds; t += step) finale.updateFinale(step);
}

// ---- The pure core ----------------------------------------------------------

describe('spreading sparks over a sphere', () => {
    test('every direction is a unit vector', () => {
        for (let i = 0; i < 34; i++) {
            expect(len(finale.sphereDirection(i, 34))).toBeCloseTo(1, 6);
        }
    });

    test('the spread has no hole in it: the directions very nearly cancel', () => {
        // A burst with a clump in it reads as a burst with a hole opposite the
        // clump. Summing an even spread lands near zero; summing a clumped one
        // does not. Thirty four random directions would routinely fail this.
        let x = 0, y = 0, z = 0;
        for (let i = 0; i < 34; i++) {
            const d = finale.sphereDirection(i, 34);
            x += d.x; y += d.y; z += d.z;
        }
        expect(Math.hypot(x, y, z)).toBeLessThan(1);
    });

    test('the same index always gives the same direction', () => {
        expect(finale.sphereDirection(7, 20)).toEqual(finale.sphereDirection(7, 20));
    });

    test('a count of one does not divide by zero', () => {
        expect(len(finale.sphereDirection(0, 0))).toBeCloseTo(1, 6);
    });
});

describe('aiming at the hemisphere the installations are on', () => {
    test('the mean normal points into the middle of the four sites', () => {
        const n = finale.meanNormal(earthSites());
        expect(len(n)).toBeCloseTo(1, 6);
        // Every site is on the near side of the plane through Earth's centre
        // at right angles to it, which is what "all four in frame" means.
        for (const site of earthSites()) expect(dot(n, site.up)).toBeGreaterThan(0);
    });

    test('the sites are northern, so the shot looks down at them', () => {
        expect(finale.meanNormal(earthSites()).y).toBeGreaterThan(0.5);
    });

    test('an empty list falls back to the world up rather than to nothing', () => {
        expect(finale.meanNormal([])).toEqual({ x: 0, y: 1, z: 0 });
    });

    test('two sites on opposite poles cancel, and that is caught', () => {
        const list = [{ up: { x: 0, y: 1, z: 0 } }, { up: { x: 0, y: -1, z: 0 } }];
        expect(finale.meanNormal(list)).toEqual({ x: 0, y: 1, z: 0 });
    });

    test('entries without an up vector are skipped rather than crashing', () => {
        const list = [{ up: { x: 1, y: 0, z: 0 } }, {}, { up: null }];
        expect(finale.meanNormal(list)).toEqual({ x: 1, y: 0, z: 0 });
    });
});

describe('the emission schedule', () => {
    const WON = () => CONFIG.finale.won;

    test('a shell climbs before it blooms, and the pair are one event apart', () => {
        const events = finale.buildSchedule(WON(), 4, 5.6);
        const lift = events.find(e => e.kind === 'lift' && e.index === 0);
        const bloom = events.find(e => e.kind === 'bloom' && e.index === 0);
        expect(bloom.at - lift.at).toBeCloseTo(WON().riseSeconds, 6);
    });

    test('it is in order, so draining it by the clock cannot miss one', () => {
        const events = finale.buildSchedule(WON(), 4, 5.6);
        for (let i = 1; i < events.length; i++) {
            expect(events[i].at).toBeGreaterThanOrEqual(events[i - 1].at);
        }
    });

    test('the sites take turns rather than one carrying the whole show', () => {
        const events = finale.buildSchedule(WON(), 4, 5.6).filter(e => e.kind === 'bloom');
        const used = new Set(events.map(e => e.source));
        expect(used.size).toBe(4);
        expect(events[0].source).toBe(0);
        expect(events[1].source).toBe(1);
    });

    test('nothing is scheduled so late that the card cuts a shell in half', () => {
        const spec = WON();
        const events = finale.buildSchedule(spec, 4, spec.seconds);
        const last = Math.max(...events.map(e => e.at));
        expect(last).toBeLessThan(spec.seconds - spec.sparkLife * 0.5);
    });

    test('a preset with no climb schedules blooms only', () => {
        // Both losses are fires rather than fireworks: an ember starts where
        // the fire is, and nothing goes up first.
        const events = finale.buildSchedule(CONFIG.finale.lostLine, 4, 4.4);
        expect(events.length).toBeGreaterThan(0);
        expect(events.every(e => e.kind === 'bloom')).toBe(true);
    });

    test('no sources means no schedule rather than a division by zero', () => {
        expect(finale.buildSchedule(WON(), 0, 5.6)).toEqual([]);
    });
});

describe('one flare, one frame', () => {
    const flare = () => ({
        x: 0, y: 0, z: 0, vx: 100, vy: 0, vz: 0, gx: 0, gy: 0, gz: 0,
        age: 0, life: 1, drag: 0
    });

    test('it moves the way it is pointing', () => {
        const f = flare();
        finale.stepFlare(f, 0.5);
        expect(f.x).toBeCloseTo(50, 6);
    });

    test('drag slows it, and never turns it around', () => {
        const f = flare();
        f.drag = 2;
        finale.stepFlare(f, 0.5);
        expect(f.vx).toBeLessThan(100);
        expect(f.vx).toBeGreaterThan(0);
    });

    test('a huge frame step still cannot push it backwards', () => {
        // The exponential is the whole reason for this: a linear `v -= drag*v*dt`
        // reverses the moment `drag * dt` passes 1, which on a stalled tab is a
        // firework that implodes.
        const f = flare();
        f.drag = 40;
        finale.stepFlare(f, 1);
        expect(f.vx).toBeGreaterThan(0);
    });

    test('gravity pulls it back toward the surface it came from', () => {
        const f = flare();
        f.vx = 0; f.gy = -900;
        finale.stepFlare(f, 0.5);
        expect(f.vy).toBeLessThan(0);
        expect(f.y).toBeLessThan(0);
    });

    test('it reports itself finished exactly once its life is up', () => {
        const f = flare();
        expect(finale.stepFlare(f, 0.5)).toBe(true);
        expect(finale.stepFlare(f, 0.6)).toBe(false);
    });
});

describe('a flare going out', () => {
    test('full at birth and nothing at the end', () => {
        expect(finale.flareFade(0, 2)).toBe(1);
        expect(finale.flareFade(2, 2)).toBe(0);
        expect(finale.flareFade(3, 2)).toBe(0);
    });

    test('it holds most of its light through the first half, then goes', () => {
        // Squared rather than linear. A linear fade on an additive point reads
        // as a dimmer being turned rather than as something burning out.
        expect(finale.flareFade(1, 2)).toBeCloseTo(0.25, 6);
        expect(finale.flareFade(0.5, 2)).toBeCloseTo(0.5625, 6);
    });

    test('a life of zero fades to nothing rather than dividing by it', () => {
        expect(finale.flareFade(0, 0)).toBe(0);
    });
});

describe('how high a shell gets', () => {
    test('it climbs and then it is pulled over', () => {
        const spec = CONFIG.finale.won;
        const apex = finale.liftHeight(spec.liftSpeed, spec.gravity, spec.riseSeconds);
        expect(apex).toBeGreaterThan(0);
        // Legible against a 6,371 unit planet without being half its radius.
        expect(apex).toBeGreaterThan(EARTH_RADIUS * 0.05);
        expect(apex).toBeLessThan(EARTH_RADIUS * 0.2);
    });

    test('a preset that does not launch stays on the ground', () => {
        expect(finale.liftHeight(0, 40, 0)).toBe(0);
    });
});

// ---- The shots --------------------------------------------------------------

describe('starting an ending', () => {
    test('an unknown outcome starts nothing', () => {
        expect(finale.startFinale('mislaid', earthContext())).toBe(0);
        expect(finale.isFinaleRunning()).toBe(false);
    });

    test('no sources starts nothing rather than an empty shot', () => {
        expect(finale.startFinale('won', { subject: EARTH, sources: [] })).toBe(0);
    });

    test('a win runs for as long as config says', () => {
        expect(finale.startFinale('won', earthContext())).toBeCloseTo(CONFIG.finale.won.seconds, 6);
        expect(finale.getFinaleKind()).toBe('won');
    });

    test('each outcome gets its own preset, and they differ', () => {
        expect(finale.startFinale('won', earthContext())).toBeCloseTo(CONFIG.finale.won.seconds, 6);
        finale.endFinale();
        expect(finale.startFinale('lost-line', earthContext()))
            .toBeCloseTo(CONFIG.finale.lostLine.seconds, 6);
        finale.endFinale();
        expect(finale.startFinale('lost-ship', earthContext()))
            .toBeCloseTo(CONFIG.finale.lostShip.seconds, 6);
    });

    test('a shot cannot start before the module has been built', () => {
        finale.disposeFinale(scene);
        expect(finale.startFinale('won', earthContext())).toBe(0);
    });
});

describe('where the camera stands', () => {
    test('it opens at the distance config asked for, looking at Earth', () => {
        finale.startFinale('won', earthContext());
        const eye = finale.finaleEye();
        expect(len(sub(eye, EARTH))).toBeCloseTo(CONFIG.finale.won.startDistance, 3);
        expect(eye.look).toEqual(EARTH);
    });

    test('it pulls back over the shot rather than holding still', () => {
        finale.startFinale('won', earthContext());
        const opened = len(sub(finale.finaleEye(), EARTH));
        run(CONFIG.finale.won.seconds * 0.9);
        expect(len(sub(finale.finaleEye(), EARTH))).toBeGreaterThan(opened + 500);
    });

    test('it stands over the installations, not over the far side of the planet', () => {
        // The one thing that would ruin both planet shots: a camera aimed at
        // Earth's centre from anywhere would be a coin toss on whether the
        // sites were even on the near side.
        finale.startFinale('won', earthContext());
        const eye = finale.finaleEye();
        for (const site of earthSites()) {
            expect(dot(sub(eye, EARTH), site.up)).toBeGreaterThan(0);
        }
    });

    test('it never ends up inside the planet it is watching', () => {
        finale.startFinale('lost-line', earthContext());
        for (let t = 0; t < CONFIG.finale.lostLine.seconds; t += 0.05) {
            expect(len(sub(finale.finaleEye(), EARTH))).toBeGreaterThan(EARTH_RADIUS * 1.5);
            finale.updateFinale(0.05);
        }
    });

    test('an explicit side opens exactly where the camera already is', () => {
        // This is what makes the ship ending continuous with the replay that
        // precedes it: angle zero of the new orbit is where the old one
        // finished, and the preset opens at the distance it closed at.
        const wreck = { x: 1000, y: 2000, z: -3000 };
        const distance = CONFIG.finale.lostShip.startDistance;
        finale.startFinale('lost-ship', {
            subject: wreck,
            side: { x: 0, y: 0, z: 1 },
            sources: [{ position: wreck, up: { x: 0, y: 1, z: 0 } }]
        });
        const eye = finale.finaleEye();
        const out = sub(eye, wreck);
        expect(len(out)).toBeCloseTo(distance, 3);
        // On the +Z side, raised by the preset's rise and nothing else.
        expect(out.z).toBeGreaterThan(0);
        expect(out.y).toBeCloseTo(distance * Math.sin(CONFIG.finale.lostShip.rise), 3);
    });

    test('there is no eye at all once the shot is over', () => {
        finale.startFinale('lost-ship', earthContext());
        expect(finale.finaleEye()).not.toBeNull();
        run(CONFIG.finale.lostShip.seconds + 0.2);
        expect(finale.finaleEye()).toBeNull();
        expect(finale.isFinaleRunning()).toBe(false);
    });
});

// ---- What actually appears --------------------------------------------------

describe('the flares', () => {
    test('a win puts sparks in the sky', () => {
        finale.startFinale('won', earthContext());
        run(2);
        expect(finale.__test__.liveCount()).toBeGreaterThan(30);
    });

    test('they are drawn only while something is burning', () => {
        const points = scene.added[0].children[0];
        expect(points.visible).toBe(false);
        finale.startFinale('won', earthContext());
        run(1);
        expect(points.visible).toBe(true);
        run(CONFIG.finale.won.seconds + CONFIG.finale.won.sparkLife + 0.5);
        expect(points.visible).toBe(false);
    });

    test('an idle frame walks nothing at all', () => {
        // Called on every frame of every run, so the common case has to be a
        // return rather than a pass over five hundred flares and two uploads.
        const attr = scene.added[0].children[0].geometry.attributes.position;
        attr.needsUpdate = false;
        expect(finale.updateFinale(0.016)).toBe(0);
        expect(attr.needsUpdate).toBe(false);
    });

    test('a shell leaves from its own site and climbs away from the planet', () => {
        finale.startFinale('won', earthContext());
        finale.updateFinale(0.016);
        const lit = finale.__test__.pool().filter(f => f.live);
        expect(lit.length).toBe(CONFIG.finale.won.liftTrail);
        for (const f of lit) {
            // Near the first site, and moving outward rather than into the crust.
            const out = { x: f.x, y: f.y, z: f.z };
            expect(len(out)).toBeGreaterThan(EARTH_RADIUS * 0.9);
            expect(dot(out, { x: f.vx, y: f.vy, z: f.vz })).toBeGreaterThan(0);
        }
    });

    test('a bloom happens above the site rather than on top of it', () => {
        const spec = CONFIG.finale.won;
        finale.startFinale('won', earthContext());
        run(spec.riseSeconds + 0.05, 0.02);
        const highest = Math.max(...finale.__test__.pool()
            .filter(f => f.live).map(f => Math.hypot(f.x, f.y, f.z)));
        expect(highest).toBeGreaterThan(EARTH_RADIUS + 300);
    });

    test('the losses burn dimmer and slower than the win', () => {
        // Not a taste assertion: it is the whole difference between the two
        // planet shots, and a config edit that lost it would leave a defeat
        // looking like a party.
        expect(CONFIG.finale.lostLine.sparkSpeed).toBeLessThan(CONFIG.finale.won.sparkSpeed / 3);
        expect(CONFIG.finale.lostLine.sparks).toBeLessThan(CONFIG.finale.won.sparks / 2);
        expect(CONFIG.finale.lostLine.sparkLife).toBeGreaterThan(CONFIG.finale.won.sparkLife);
    });

    test('the ship ending has nothing to fall toward, and does not', () => {
        // It happens in open space. A gravity in this preset would be debris
        // sinking toward a planet that is not there.
        expect(CONFIG.finale.lostShip.gravity).toBe(0);
    });

    test('a bloom tells the scene, so it can make a noise about it', () => {
        const heard = [];
        finale.onFinaleBurst(e => heard.push(e));
        finale.startFinale('won', earthContext());
        run(2.4);
        expect(heard.length).toBeGreaterThan(2);
        expect(heard.every(e => e.kind === 'bloom')).toBe(true);
    });

    test('a dead flare is written black rather than left where it died', () => {
        // The material is additive, so black contributes nothing. That is what
        // buys per-particle fading, which PointsMaterial has no other way to do.
        finale.startFinale('lost-ship', earthContext());
        run(0.1, 0.05);
        const colours = scene.added[0].children[0].geometry.attributes.colour
            || scene.added[0].children[0].geometry.attributes.color;
        const lit = [];
        for (let i = 0; i < colours.array.length; i += 3) {
            if (colours.array[i] + colours.array[i + 1] + colours.array[i + 2] > 0) lit.push(i);
        }
        expect(lit.length).toBe(finale.__test__.liveCount());
    });
});

describe('putting an ending away', () => {
    test('ending it puts every flare out', () => {
        finale.startFinale('won', earthContext());
        run(2);
        expect(finale.__test__.liveCount()).toBeGreaterThan(0);

        finale.endFinale();
        expect(finale.isFinaleRunning()).toBe(false);
        expect(finale.__test__.liveCount()).toBe(0);
        expect(finale.finaleEye()).toBeNull();
        expect(finale.getFinaleKind()).toBe('');
    });

    test('the wash goes up with the shot', () => {
        finale.startFinale('won', earthContext());
        expect(finale.finaleWash()).toBe('finale-won');
    });

    test('the wash outlives the camera move, and then it does not', () => {
        // The card arrives while the last of the debris is still going out, so
        // pulling the colour on the frame the camera stopped would leave those
        // embers sitting on a plain black sky.
        //
        // The ship ending is where this actually bites: its sparks live 3.2
        // seconds against a 3.8 second shot, so more than a second of it is
        // burning after the camera has finished. The win's tail is a fraction
        // of a second, which is the same rule doing far less work.
        const spec = CONFIG.finale.lostShip;
        finale.startFinale('lost-ship', earthContext());

        run(spec.seconds + 0.2);
        expect(finale.isFinaleRunning()).toBe(false);
        expect(finale.__test__.liveCount()).toBeGreaterThan(0);
        expect(finale.finaleWash()).toBe('finale-lost');

        run(spec.sparkLife + 0.5);
        expect(finale.__test__.liveCount()).toBe(0);
        expect(finale.finaleWash()).toBe('');
    });

    test('the two losses share a wash, and the win does not share it', () => {
        expect(CONFIG.finale.lostLine.wash).toBe(CONFIG.finale.lostShip.wash);
        expect(CONFIG.finale.won.wash).not.toBe(CONFIG.finale.lostLine.wash);
    });

    test('disposing gives the geometry and the material back', () => {
        const points = scene.added[0].children[0];
        finale.disposeFinale(scene);
        expect(points.geometry.disposed).toBe(true);
        expect(points.material.disposed).toBe(true);
        expect(scene.added.length).toBe(0);
    });
});

describe('reduced effects', () => {
    test('the pool is thinned rather than switched off', () => {
        expect(finale.setFinaleReduced(true)).toBe(CONFIG.finale.reducedPool);
        expect(finale.setFinaleReduced(false)).toBe(CONFIG.finale.flarePool);
    });

    test('a flare outside the new range is put out rather than left burning', () => {
        // It would be stepped by nothing and drawn by nothing: a live slot that
        // never comes back.
        finale.startFinale('won', earthContext());
        run(3);
        finale.setFinaleReduced(true);
        const pool = finale.__test__.pool();
        for (let i = CONFIG.finale.reducedPool; i < pool.length; i++) {
            expect(pool[i].live).toBe(false);
        }
    });

    test('it does nothing at all before the module is built', () => {
        finale.disposeFinale(scene);
        expect(finale.setFinaleReduced(true)).toBe(0);
    });
});

describe('the shot is composed rather than guessed', () => {
    // A 900 pixel frame through the world camera's 70 degree field of view.
    // Read inside the helper rather than at collection time, since CONFIG is
    // re-imported per test.
    const FRAME = 900;
    const pixelsPerUnit = (distance) => {
        const half = Math.tan((CONFIG.space.worldCamera.fov / 2) * Math.PI / 180);
        return FRAME / (2 * distance * half);
    };

    test('Earth fills most of the frame without running off both edges', () => {
        const d = CONFIG.finale.won.startDistance;
        const across = 2 * EARTH_RADIUS * pixelsPerUnit(d);
        expect(across).toBeGreaterThan(FRAME * 0.45);
        expect(across).toBeLessThan(FRAME * 0.95);
    });

    test('a spark is big enough to see and small enough not to be a blob', () => {
        const spec = CONFIG.finale.won;
        const size = spec.size * pixelsPerUnit(spec.startDistance);
        expect(size).toBeGreaterThan(4);
        expect(size).toBeLessThan(25);
    });

    test('a shell is a firework rather than a smudge or a second explosion', () => {
        // The sparks throw at `sparkSpeed` against `sparkDrag`, so the cloud
        // reaches speed/drag * (1 - e^(-drag * life)) before it stops growing.
        const spec = CONFIG.finale.won;
        const reach = spec.sparkSpeed / spec.sparkDrag *
            (1 - Math.exp(-spec.sparkDrag * spec.sparkLife));
        const across = 2 * reach * pixelsPerUnit(spec.startDistance);
        expect(across).toBeGreaterThan(40);
        expect(across).toBeLessThan(2 * EARTH_RADIUS * pixelsPerUnit(spec.startDistance) / 4);
    });

    test('the ship ending opens where the replay closes, so there is no cut', () => {
        expect(CONFIG.finale.lostShip.startDistance).toBe(CONFIG.replay.shipEndDistance);
        expect(CONFIG.finale.lostShip.rise).toBe(CONFIG.replay.shipRise);
    });

    test('a spark in the ship ending reads at ITS distance, which is far nearer', () => {
        const spec = CONFIG.finale.lostShip;
        const size = spec.size * pixelsPerUnit(spec.endDistance);
        expect(size).toBeGreaterThan(4);
        expect(size).toBeLessThan(40);
    });
});
