// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Integration smoke plus composition guard for the Earth Defense world.
 *
 * M1's exit criterion is a judgement about the opening frame, which no test can
 * make. What a test CAN do is hold the geometry that judgement depends on, so
 * the frame is only ever wrong on purpose. These assertions are written as
 * PROPERTIES, not as literals: "Earth's limb falls in the lower third of the
 * view" rather than "the spawn is at y = 7361". Retuning the numbers at the
 * gate is expected, and the properties should survive it. If one of these
 * fails after a retune, the composition really did break.
 *
 * The composition half is pure trigonometry against config, because the
 * chainable THREE proxy models no geometry and would happily agree that every
 * angle is zero. The build-and-tick half runs under the proxy, where the point
 * is only that every function a real page load would call actually runs.
 */
import { jest } from '@jest/globals';
import { installThree, uninstallAll } from './helpers/three-stub.mjs';

const { EARTHDEFENSE_CONFIG: CONFIG, spawnPosition } =
    await import('../www/earthdefense/js/config.js');
const { orbitPositionAt } = await import('../www/shared/js/bodies-1.0.0.js');

const DEG = 180 / Math.PI;

const bodyById = (id) => CONFIG.bodies.find(b => b.id === id);

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const len = (v) => Math.hypot(v.x, v.y, v.z);
const norm = (v) => { const l = len(v) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; };
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

// The nose points down -Z at spawn (config.spawn.yaw is 0), and world up is +Y.
const NOSE = { x: 0, y: 0, z: -1 };
const UP = { x: 0, y: 1, z: 0 };

/** Angle in degrees between the nose and a world point, as seen from spawn. */
function angleFromNose(target) {
    return Math.acos(Math.min(1, dot(norm(sub(target, spawnPosition())), NOSE))) * DEG;
}

/** Signed elevation in degrees: positive above the nose, negative below. */
function elevation(target) {
    return Math.asin(dot(norm(sub(target, spawnPosition())), UP)) * DEG;
}

const halfFovDeg = () => CONFIG.space.worldCamera.fov / 2;

describe('the spawn viewpoint', () => {
    test('sits where the spawn block says, derived rather than hard-coded', () => {
        const p = spawnPosition();
        expect(len(p)).toBeCloseTo(CONFIG.spawn.distance, 6);
        expect(p.x).toBe(0);
        expect(p.y).toBeGreaterThan(0);   // above the Earth-to-Mars axis
        expect(p.z).toBeGreaterThan(0);   // and behind Earth, away from Mars
    });

    test('is high enough to clear the surface by a wide margin', () => {
        const earth = bodyById('earth');
        expect(CONFIG.spawn.distance).toBeGreaterThan(earth.radius * 1.2);
    });
});

describe('Earth fills the lower part of the opening frame', () => {
    const earthCentre = { x: 0, y: 0, z: 0 };

    test('subtends a genuinely enormous angle', () => {
        // The whole point of G3. Below about 80 degrees across, Earth stops
        // reading as a world you are above and starts reading as a ball.
        const angularRadius = Math.asin(bodyById('earth').radius / CONFIG.spawn.distance) * DEG;
        expect(angularRadius * 2).toBeGreaterThan(80);
    });

    test('sits below the nose, not in front of it', () => {
        expect(elevation(earthCentre)).toBeLessThan(0);
    });

    test('its limb lands in the lower third of the view', () => {
        const angularRadius = Math.asin(bodyById('earth').radius / CONFIG.spawn.distance) * DEG;
        const limbBelowNose = angleFromNose(earthCentre) - angularRadius;

        // In frame at all: past the bottom edge and there is no horizon.
        expect(limbBelowNose).toBeLessThan(halfFovDeg());
        // But not so high that Earth swallows the centre, which is where the
        // reticle lives and where Mars has to sit.
        expect(limbBelowNose).toBeGreaterThan(5);

        // Lower third: the limb crosses between a fifth and a half of the way
        // from the centre of the frame to its bottom edge.
        const fraction = limbBelowNose / halfFovDeg();
        expect(fraction).toBeGreaterThan(0.2);
        expect(fraction).toBeLessThan(0.5);
    });
});

describe('Mars sits ahead, near the centre', () => {
    const mars = () => ({ x: bodyById('mars').position[0], y: bodyById('mars').position[1], z: bodyById('mars').position[2] });

    test('is close enough to the nose to read as the thing you are facing', () => {
        expect(angleFromNose(mars())).toBeLessThan(5);
    });

    test('is a visible disc, but unmistakably far away', () => {
        const d = len(sub(mars(), spawnPosition()));
        const angularDiameter = 2 * Math.atan(bodyById('mars').radius / d) * DEG;
        // Bigger than the real Moon in our sky (0.5 degrees), so it reads as a
        // place rather than a star, and well under the 70 degree frame.
        expect(angularDiameter).toBeGreaterThan(1);
        expect(angularDiameter).toBeLessThan(4);
    });

    test('is not hidden behind Earth', () => {
        const earthAngularRadius = Math.asin(bodyById('earth').radius / CONFIG.spawn.distance) * DEG;
        expect(angleFromNose({ x: 0, y: 0, z: 0 }) - earthAngularRadius)
            .toBeGreaterThan(angleFromNose(mars()));
    });
});

describe('the Moon is off to one side at spawn', () => {
    const moonAt = (t) => {
        const spec = bodyById('moon').orbit;
        const p = orbitPositionAt(t, spec);
        return p;   // Earth is at the origin, so orbital position is world position
    };

    test('starts to the right of the nose and above the horizon line', () => {
        const m = moonAt(0);
        const dir = norm(sub(m, spawnPosition()));
        expect(dir.x).toBeGreaterThan(0);        // to the right
        expect(elevation(m)).toBeGreaterThan(0); // above the nose, in clear sky
    });

    test('is clear of Earth\'s disc rather than skimming its limb', () => {
        const m = moonAt(0);
        const earthAngularRadius = Math.asin(bodyById('earth').radius / CONFIG.spawn.distance) * DEG;
        const toEarth = norm(sub({ x: 0, y: 0, z: 0 }, spawnPosition()));
        const toMoon = norm(sub(m, spawnPosition()));
        const separation = Math.acos(Math.min(1, dot(toEarth, toMoon))) * DEG;
        expect(separation - earthAngularRadius).toBeGreaterThan(10);
    });

    test.each([
        ['9:16   phone', 9 / 16],
        ['9:19.5 phone', 9 / 19.5],
        ['9:21   phone', 9 / 21],
    ])('is fully inside the frame on a %s held in portrait', (_label, aspect) => {
        // Portrait is the binding case and the one most visitors will see, so
        // this is asserted at three aspect ratios rather than the comfortable
        // landscape one. Three.js field of view is vertical, so the horizontal
        // half-field shrinks with the aspect while Earth and Mars stay put.
        const horizontalHalf = Math.atan(Math.tan((halfFovDeg() * Math.PI) / 180) * aspect) * DEG;

        const m = moonAt(0);
        const distance = len(sub(m, spawnPosition()));
        const moonRadiusDeg = Math.atan(bodyById('moon').radius / distance) * DEG;
        const azimuth = Math.asin(norm(sub(m, spawnPosition())).x) * DEG;

        // The far EDGE of the disc, not its centre: a Moon sliced by the
        // screen edge reads as a bug rather than as a moon.
        expect(azimuth + moonRadiusDeg).toBeLessThan(horizontalHalf);
    });

    test('keeps clear of Mars so neither crowds the other', () => {
        const mars = { x: bodyById('mars').position[0], y: bodyById('mars').position[1], z: bodyById('mars').position[2] };
        const toMars = norm(sub(mars, spawnPosition()));
        const toMoon = norm(sub(moonAt(0), spawnPosition()));
        const separation = Math.acos(Math.min(1, dot(toMars, toMoon))) * DEG;
        expect(separation).toBeGreaterThan(8);
    });

    test('does not lap the player during a single run', () => {
        // Eight minutes a lap, against a five to ten minute game: the sky should
        // visibly change without anyone watching the Moon come back around.
        expect(bodyById('moon').orbit.period).toBeGreaterThan(5 * 60);
    });

    test('moves slowly enough to be caught', () => {
        const orbit = bodyById('moon').orbit;
        const speed = (2 * Math.PI * orbit.radius) / orbit.period;
        expect(speed).toBeLessThan(4000);   // the player's planned top speed
    });
});

describe('the fleet is in the opening frame, not waiting off it', () => {
    // PRD 6.3: the whole fleet exists at spawn. That is a composition promise
    // as much as a gameplay one, because what it buys is the image the game
    // opens on: a line of hostile lights trailing back toward Mars. These are
    // the geometry assertions behind it; the state machine is in
    // tests/earthdefense-fleet.test.mjs.
    const F = () => CONFIG.fleet;

    /** The approach line, as a unit vector. */
    const approach = () => {
        const a = F().approach;
        return norm({ x: Math.sin(a.azimuth), y: Math.sin(a.elevation), z: -1 });
    };

    const groupCentre = (index) => {
        const d = approach();
        const distance = F().groups[index].startDistance;
        return { x: d.x * distance, y: d.y * distance, z: d.z * distance };
    };

    const mars = () => ({
        x: bodyById('mars').position[0],
        y: bodyById('mars').position[1],
        z: bodyById('mars').position[2]
    });

    test('there are twelve of them, in three groups of four', () => {
        expect(F().groups.reduce((n, g) => n + g.count, 0)).toBe(F().total);
        expect(F().total).toBe(12);
    });

    test('the lead group is on screen from the first frame, even in portrait', () => {
        // If the first thing a visitor has to do is go looking for the enemy,
        // the opening frame has not done its job.
        const lead = groupCentre(0);
        const dir = norm(sub(lead, spawnPosition()));
        const azimuth = Math.abs(Math.asin(dir.x) * DEG);
        const horizontalHalf = Math.atan(Math.tan((halfFovDeg() * Math.PI) / 180) * (9 / 21)) * DEG;

        expect(azimuth).toBeLessThan(horizontalHalf);
        expect(Math.abs(elevation(lead))).toBeLessThan(halfFovDeg());
    });

    test('the line trails back toward Mars without ever being inside it', () => {
        // The tilt exists for exactly one reason: Mars sits at the trailing
        // group's start distance along the Earth-to-Mars axis, so an untilted
        // approach would bury four raiders in the planet.
        const marsRadiusDeg = Math.asin(bodyById('mars').radius /
            len(sub(mars(), spawnPosition()))) * DEG;

        for (let i = 0; i < F().groups.length; i++) {
            const toGroup = norm(sub(groupCentre(i), spawnPosition()));
            const toMars = norm(sub(mars(), spawnPosition()));
            const separation = Math.acos(Math.min(1, dot(toGroup, toMars))) * DEG;
            // Clear of the disc, so no raider is lost against it...
            expect(separation).toBeGreaterThan(marsRadiusDeg);
            // ...but close enough that the eye reads the line as coming from it.
            expect(separation).toBeLessThan(15);
        }
    });

    test('the groups arrive spread across a run, not all at once', () => {
        const arrival = F().groups.map(g => g.startDistance / F().cruiseSpeed);
        expect(arrival[0]).toBeLessThan(30);              // PRD 4.2, about twenty seconds
        for (let i = 1; i < arrival.length; i++) {
            // Far enough apart to read as separate arrivals rather than as one
            // long stream, which is the only property that matters here. A
            // ratio would have been the wrong test: the PRD's own 20 / 90 / 165
            // is not a geometric series and was never meant to be.
            expect(arrival[i] - arrival[i - 1]).toBeGreaterThan(45);
        }
        // The last of them inside a five to ten minute run, with time to fight.
        expect(arrival[arrival.length - 1]).toBeLessThan(4 * 60);
    });

    test('raiders are slower than the player, so a chase can be won', () => {
        expect(F().cruiseSpeed).toBeLessThan(CONFIG.flight.maxForward);
    });

    test('you can no longer shoot your own installations', () => {
        // M4 shipped `allegiance: ['friendly']` as a firing range, because the
        // fleet did not exist and the gate needed something to shoot at. M5
        // retires it. This is the assertion that stops the stand-in surviving a
        // milestone longer than it was meant to.
        expect(CONFIG.targeting.allegiance).toEqual(['hostile']);
    });

    test('a raider dies to one shot, so acquiring it IS killing it', () => {
        // Which is why the raiders break off on the wider threat cone rather
        // than on the lock the PRD describes: by the time there is a lock there
        // is nothing left to dodge with. See fleet.js.
        expect(F().hitPoints).toBe(1);
        expect(CONFIG.weapons.damagePerShot).toBeGreaterThanOrEqual(F().hitPoints);
        expect(F().evade.threatCone).toBeGreaterThan(CONFIG.targeting.coneRadians);
    });

    test('the Moon is put under threat early and stays under it', () => {
        // PRD 4.4: the Earth-versus-Moon choice is the entire strategy layer,
        // and it only exists if the Moon is contested from the start.
        const lunar = F().groups.map(g => g.weight.moon);
        expect(lunar[0]).toBeGreaterThan(0);
        expect(lunar.every(n => n > 0)).toBe(true);
        // And more than a token: at least a third of the fleet overall.
        const total = F().groups.reduce((n, g) => n + g.weight.moon, 0);
        expect(total).toBeGreaterThanOrEqual(F().total / 3);
    });

    test('an installation survives long enough to be defended', () => {
        // The trip to the Moon is about sixteen seconds each way at full
        // throttle. A pair of raiders must not be able to flatten something in
        // less than that, or the alert would be an obituary (PRD 4.5).
        const secondsForTwo = (CONFIG.structures.hitPoints * F().fireInterval) / 2;
        const moonTrip = bodyById('moon').orbit.radius / CONFIG.flight.maxForward;
        expect(secondsForTwo).toBeGreaterThan(moonTrip);
    });
});

describe('the installations', () => {
    const S = () => CONFIG.structures;
    const earthRadius = () => bodyById('earth').radius;

    // Angular separation on a sphere, in degrees.
    function sep(a, b) {
        const [la1, lo1, la2, lo2] = [a.lat, a.lon, b.lat, b.lon].map(d => (d * Math.PI) / 180);
        return Math.acos(Math.min(1,
            Math.sin(la1) * Math.sin(la2) + Math.cos(la1) * Math.cos(la2) * Math.cos(lo2 - lo1))) * DEG;
    }

    // The point on Earth directly beneath the player at spawn.
    const subPlayer = { lat: 60, lon: -90 };
    // From altitude, a sphere only shows a cap of this angular radius.
    const visibleCap = () => Math.acos(earthRadius() / CONFIG.spawn.distance) * DEG;

    test('there are seven, four on Earth and three on the Moon', () => {
        expect(S().earth).toHaveLength(4);
        expect(S().moon).toHaveLength(3);
    });

    test('each takes three hits', () => {
        expect(S().hitPoints).toBe(3);
    });

    test('every Earth installation is actually VISIBLE from the spawn point', () => {
        // The correction that mattered at M3. An earlier draft put these on the
        // Mars-facing hemisphere, which is 150 degrees from the sub-player
        // point and therefore permanently behind the planet at spawn.
        for (const site of S().earth) {
            expect(sep(subPlayer, site)).toBeLessThan(visibleCap());
        }
    });

    test('the Mars-facing face really is the wrong side to defend', () => {
        // Pins the reasoning, so nobody re-adopts the earlier plan by accident.
        const marsFacing = { lat: 0, lon: 90 };
        expect(sep(subPlayer, marsFacing)).toBeGreaterThan(visibleCap());
    });

    test('no two Earth installations sit on top of each other', () => {
        const sites = S().earth;
        for (let i = 0; i < sites.length; i++) {
            for (let j = i + 1; j < sites.length; j++) {
                expect(sep(sites[i], sites[j])).toBeGreaterThan(15);
            }
        }
    });

    test('the Moon\'s three sit on its Earth-facing side', () => {
        // Tidal locking keeps this face pointed at home for the whole game, so
        // these three never rotate out of sight. In this convention the
        // Earth-facing point is latitude 0, longitude 90.
        const earthFacing = { lat: 0, lon: 90 };
        for (const site of S().moon) {
            expect(sep(earthFacing, site)).toBeLessThan(60);
        }
    });

    test('Earth turns slowly enough to keep every installation reachable', () => {
        // The M3 verification, as arithmetic rather than as a twelve-minute
        // stare. A structure must not be carried past the horizon during a
        // run, or it becomes impossible to defend.
        const runSeconds = 12 * 60;
        const degreesTurned = (runSeconds / bodyById('earth').rotationPeriod) * 360;
        expect(degreesTurned).toBeLessThan(90);

        // Even the furthest site stays within the visible cap plus that drift.
        const furthest = Math.max(...S().earth.map(s => sep(subPlayer, s)));
        expect(furthest + degreesTurned).toBeLessThan(180);
    });
});

describe('the world builds and ticks', () => {
    beforeEach(() => {
        installThree();
    });
    afterEach(() => {
        uninstallAll();
    });

    test('builds three bodies and survives a run of frames', async () => {
        jest.resetModules();
        // Import the BUILT shared modules: world.js resolves its imports to the
        // .min.js files, and module state must be shared with what we drive
        // here. This is why `npm run build` runs before `npm test`.
        const bodies = await import('../www/shared/js/bodies-1.0.0.min.js');
        const world = await import('../www/earthdefense/js/world.js');

        const scene = { children: [], add(o) { this.children.push(o); } };
        const group = world.initWorld(scene, null);

        expect(group).toBeTruthy();
        expect(scene.children).toContain(group);
        expect(bodies.getBody('earth')).toBeTruthy();
        expect(bodies.getBody('moon')).toBeTruthy();
        expect(bodies.getBody('mars')).toBeTruthy();

        for (let i = 0; i < 30; i++) world.updateWorld(1 / 60);
        expect(bodies.getElapsed()).toBeCloseTo(0.5, 3);

        expect(world.getWorldGroup()).toBe(group);
        expect(world.getOccluders()).toHaveLength(3);

        // Seven installations, built and parented to their bodies.
        expect(world.getStructures()).toHaveLength(7);
        expect(world.structuresRemaining('friendly')).toBe(7);
    });

    /** Build the installations on the SOURCE module rather than through
     *  world.js, which resolves to the built copy. Same module graph, but this
     *  is the instance whose state the assertions can reach (and the one the
     *  coverage report is about). */
    async function loadStructures() {
        jest.resetModules();
        const bodies = await import('../www/shared/js/bodies-1.0.0.min.js');
        const structures = await import('../www/earthdefense/js/structures.js');
        bodies.initBodies();
        for (const spec of CONFIG.bodies) bodies.createBody(spec);
        for (const spec of CONFIG.bodies) {
            if (spec.orbit) bodies.orbitBody(spec.id, spec.orbit.parent, spec.orbit);
        }
        structures.initStructures(CONFIG);
        return structures;
    }

    /* From M4, weapons-1.0.0 owns the hit point arithmetic and the scene is
       TOLD the survivors rather than doing its own subtraction. Two modules
       counting the same thing would eventually disagree, and the visible half
       of that disagreement is a structure showing pips it no longer has. */
    test('installations take three hits and report their losses', async () => {
        const structures = await loadStructures();
        expect(structures.getStructures()).toHaveLength(7);

        const id = CONFIG.structures.earth[0].id;
        expect(structures.damageStructure(id, 2)).toBe(2);
        expect(structures.damageStructure(id, 1)).toBe(1);
        expect(structures.structuresRemaining('friendly')).toBe(7);   // still standing

        expect(structures.damageStructure(id, 0)).toBe(0);
        expect(structures.structuresRemaining('friendly')).toBe(6);
        // Being told zero again is a no-op rather than a second destruction.
        expect(structures.damageStructure(id, 0)).toBe(0);
        expect(structures.damageStructure('nobody', 0)).toBeNull();
        expect(structures.getStructure('nobody')).toBeNull();
    });

    test('a destroyed installation goes dark and leaves the target list', async () => {
        const structures = await loadStructures();
        const id = CONFIG.structures.moon[0].id;

        expect(structures.targetCandidates()).toHaveLength(7);
        // Every candidate carries what targeting needs and nothing else.
        const candidate = structures.targetCandidates().find(c => c.id === id);
        expect(candidate.allegiance).toBe('friendly');
        expect(candidate.radius).toBe(CONFIG.structures.height);
        // The body and the label are carried so the FLEET can read this same
        // list and weight its targets without deriving "which body is this on"
        // from the id prefix. `targeting` ignores both.
        expect(candidate.body).toBe('moon');
        expect(candidate.label).toBe(CONFIG.structures.moon[0].label);

        structures.destroyStructure(id);
        const entry = structures.getStructure(id);
        expect(entry.destroyed).toBe(true);
        expect(entry.hitPoints).toBe(0);
        // The visual half (beacon out, hull darkened, mast off true) is not
        // asserted here: it is all writes onto the chainable proxy, which
        // accepts them and reports nothing back. It is judged by eye at the
        // gate instead. What IS assertable is that the wreck leaves the game.
        expect(structures.structuresRemaining('friendly')).toBe(6);
        expect(structures.targetCandidates()).toHaveLength(6);
        expect(structures.targetCandidates().some(c => c.id === id)).toBe(false);
        // Destroying it twice is a no-op.
        expect(structures.destroyStructure(id)).toBeNull();
        expect(structures.destroyStructure('nobody')).toBeNull();
    });

    test('the candidate list is reused between frames rather than rebuilt', async () => {
        // Targeting runs over every candidate on every tick, so a fresh object
        // per structure per frame would hand the collector seven allocations a
        // frame for nothing.
        const structures = await loadStructures();
        const first = structures.targetCandidates();
        const firstEntry = first[0];
        const second = structures.targetCandidates();
        expect(second).toBe(first);
        expect(second[0]).toBe(firstEntry);
        expect(second[0].position).toBe(firstEntry.position);
    });

    test('a lost pip changes SHAPE, not only colour', async () => {
        // Nothing in this experience may be readable by colour alone, so the
        // readout is asserted against real numbers rather than through the
        // chainable proxy, where every measurement would agree it is zero.
        const structures = await loadStructures();
        const pip = () => ({
            material: null,
            scale: { x: 1, y: 1, z: 1, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }
        });
        const entry = { hitPoints: 2, pips: [pip(), pip(), pip()] };

        structures.__test__.refreshPips(entry);

        expect(entry.pips[0].scale.y).toBe(1);            // two still standing
        expect(entry.pips[1].scale.y).toBe(1);
        expect(entry.pips[2].scale.y).toBeLessThan(0.5);  // the lost one collapses
        expect(entry.pips[2].material).not.toBe(entry.pips[0].material);
    });

    test('every installation reports a position, before and after a tick', async () => {
        // Under the chainable proxy the COORDINATES are meaningless (every
        // measurement reads as zero), so this checks the contract rather than
        // the arithmetic: seven entries, keyed by id, produced without
        // throwing on either side of a world update. That the lunar three
        // actually move is a property of the orbit, asserted with real numbers
        // in tests/shared-bodies.test.mjs.
        const structures = await loadStructures();
        const bodies = await import('../www/shared/js/bodies-1.0.0.min.js');

        expect(Object.keys(structures.structurePositions())).toHaveLength(7);
        bodies.updateBodies(60);
        const after = structures.structurePositions();
        expect(Object.keys(after)).toHaveLength(7);
        expect(after['moon-north']).toBeDefined();
        expect(after['earth-north']).toBeDefined();
    });

    test('parks the camera at the spawn transform, looking down -Z', async () => {
        jest.resetModules();
        await import('../www/shared/js/bodies-1.0.0.min.js');
        const world = await import('../www/earthdefense/js/world.js');

        // A recording camera rather than the proxy, so the numbers mean something.
        const camera = {
            position: { set(x, y, z) { Object.assign(this, { x, y, z }); } },
            up: { set(x, y, z) { Object.assign(this, { x, y, z }); } },
            lookAt(x, y, z) { this.target = { x, y, z }; }
        };
        world.placeCameraAtSpawn(camera);

        const p = spawnPosition();
        expect(camera.position.y).toBeCloseTo(p.y, 3);
        expect(camera.position.z).toBeCloseTo(p.z, 3);
        expect(camera.up).toMatchObject({ x: 0, y: 1, z: 0 });
        // Looking straight out along -Z, not tipped toward Mars itself.
        expect(camera.target.x).toBeCloseTo(p.x, 3);
        expect(camera.target.y).toBeCloseTo(p.y, 3);
        expect(camera.target.z).toBeLessThan(p.z);
    });

    test('placing the camera is a no-op without one', async () => {
        jest.resetModules();
        const world = await import('../www/earthdefense/js/world.js');
        expect(() => world.placeCameraAtSpawn(null)).not.toThrow();
    });
});
