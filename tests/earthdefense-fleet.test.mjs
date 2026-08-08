// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The Martian fleet (www/earthdefense/js/fleet.js).
 *
 * Two kinds of assertion live here and they are worth telling apart.
 *
 * The first is the PROMISES. "The whole fleet exists at spawn" is a design
 * commitment from PRD 6.3, not an implementation detail, and the honest way to
 * hold it is a test that counts twelve ships on frame one and checks each is
 * standing at its group's distance. Same for the group weighting, which is what
 * makes the Earth-versus-Moon triage in PRD 4.4 exist at all: if every raider
 * quietly drifted toward Earth the game would still run and the strategy would
 * be gone.
 *
 * The second is the STEERING MATHS, tested with plain numbers because that is
 * what it is made of. `steerToward`, `assignBodies`, `nearestStructure`, and
 * `hashUnit` take values and return values, so none of them needs a scene.
 *
 * THE FORMATION IS NOT RANDOM, and that is deliberate rather than incidental.
 * Math.random would have made the arrival times untestable and the opening
 * frame different on every visit, in exchange for a variation no visitor would
 * ever notice. A hash of the ship index buys back both.
 */
import { jest } from '@jest/globals';

// ---- A recording THREE -----------------------------------------------------
//
// Real numbers, not the shared chainable proxy: nearly every assertion below is
// a measurement, and the proxy would happily agree that all of them are zero.

const disposed = { geometries: 0, materials: 0 };

class Obj3D {
    constructor() {
        this.children = [];
        this.name = '';
        this.visible = true;
        this.position = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
        this.rotation = { x: 0, y: 0, z: 0 };
    }
    add(o) { this.children.push(o); }
    lookAt(x, y, z) { this.facing = { x, y, z }; }
}

class Geometry {
    constructor() { this.attributes = {}; this.drawRange = { start: 0, count: Infinity }; }
    setAttribute(name, attribute) { this.attributes[name] = attribute; }
    setDrawRange(start, count) { this.drawRange = { start, count }; }
    rotateX() { return this; }
    dispose() { disposed.geometries++; }
}

function material(options) {
    return { ...options, dispose() { disposed.materials++; } };
}

function installThree() {
    disposed.geometries = 0;
    disposed.materials = 0;
    globalThis.THREE = {
        Group: Obj3D,
        Points: class extends Obj3D {
            constructor(g, m) { super(); this.geometry = g; this.material = m; }
        },
        Line: class extends Obj3D {
            constructor(g, m) { super(); this.geometry = g; this.material = m; }
        },
        Mesh: class extends Obj3D {
            constructor(g, m) { super(); this.geometry = g; this.material = m; }
        },
        ConeGeometry: Geometry,
        BoxGeometry: Geometry,
        BufferGeometry: Geometry,
        BufferAttribute: function (array, itemSize) {
            return { array, itemSize, needsUpdate: false };
        },
        MeshStandardMaterial: material,
        PointsMaterial: material,
        LineBasicMaterial: material
    };
}

let fleet;
let CONFIG;

beforeEach(async () => {
    installThree();
    jest.resetModules();
    ({ EARTHDEFENSE_CONFIG: CONFIG } = await import('../www/earthdefense/js/config.js'));
    fleet = await import('../www/earthdefense/js/fleet.js');
});

afterEach(() => {
    if (fleet) fleet.disposeFleet();
    delete globalThis.THREE;
});

// ---- Fixtures ---------------------------------------------------------------

/** Seven installations in known places, standing in for the real ones. Earth's
 *  four sit near the origin, the Moon's three out at +X, so "which body" and
 *  "which is nearest" are separable questions. */
function makeStructures() {
    const list = [
        { id: 'earth-a', body: 'earth', label: 'Earth A', position: { x: 0, y: 0, z: 0 } },
        { id: 'earth-b', body: 'earth', label: 'Earth B', position: { x: 200, y: 0, z: 0 } },
        { id: 'earth-c', body: 'earth', label: 'Earth C', position: { x: 0, y: 200, z: 0 } },
        { id: 'earth-d', body: 'earth', label: 'Earth D', position: { x: 0, y: 0, z: 200 } },
        { id: 'moon-a', body: 'moon', label: 'Moon A', position: { x: 64000, y: 0, z: 0 } },
        { id: 'moon-b', body: 'moon', label: 'Moon B', position: { x: 64200, y: 0, z: 0 } },
        { id: 'moon-c', body: 'moon', label: 'Moon C', position: { x: 64000, y: 200, z: 0 } }
    ];
    const state = { list, damage: [], playerHits: 0 };
    state.hooks = {
        structures: () => state.list,
        damageStructure: (id, amount) => {
            state.damage.push({ id, amount });
            return { id, hitPoints: 2, destroyed: false };
        },
        onPlayerHit: () => { state.playerHits++; }
    };
    return state;
}

const len = (v) => Math.hypot(v.x, v.y, v.z);
const unit = (x, y, z) => { const l = Math.hypot(x, y, z); return { x: x / l, y: y / l, z: z / l }; };
const angle = (a, b) => Math.acos(Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z));

/** Run the fleet for `seconds` in tenth-of-a-second steps. Coarser than a real
 *  frame on purpose: if the steering only behaves at 60 Hz it is fragile, and a
 *  phone that drops frames would find that out before we did. */
function run(seconds, player = null, step = 0.1) {
    for (let t = 0; t < seconds; t += step) fleet.updateFleet(step, player);
}

// ---- The promises -----------------------------------------------------------

describe('the whole fleet exists at spawn', () => {
    test('twelve raiders are in the world on frame one, with no spawner', () => {
        // PRD 6.3, said as a test. Waves appearing from nowhere are the cheapest
        // trick in the genre and this is the assertion that keeps one from
        // creeping in later.
        const world = makeStructures();
        fleet.initFleet(CONFIG, null, world.hooks);

        expect(fleet.getShips()).toHaveLength(CONFIG.fleet.total);
        expect(fleet.shipsRemaining()).toBe(12);
        expect(fleet.fleetCandidates()).toHaveLength(12);
    });

    test('each group stands at the start distance its config asked for', () => {
        const world = makeStructures();
        fleet.initFleet(CONFIG, null, world.hooks);

        const spread = CONFIG.fleet.spread;
        // The scatter is bounded, so the assertion is a window rather than an
        // equality: a ship is within one full diagonal of its group's mark.
        const budget = Math.hypot(spread.lateral, spread.vertical, spread.depth);

        for (const ship of fleet.getShips()) {
            const expected = CONFIG.fleet.groups[ship.group].startDistance;
            expect(ship.startDistance).toBe(expected);
            expect(Math.abs(len(ship.position) - expected)).toBeLessThan(budget);
        }
    });

    test('the three groups arrive in the order and roughly the times the PRD promises', () => {
        // Arrival is start distance over cruise speed and nothing else, so it
        // can be read straight off config. This pins the pacing of the whole
        // game to two numbers rather than to anything emergent.
        const [lead, middle, trailing] = CONFIG.fleet.groups;
        const at = (g) => g.startDistance / CONFIG.fleet.cruiseSpeed;

        expect(at(lead)).toBeGreaterThan(15);
        expect(at(lead)).toBeLessThan(30);      // "about twenty seconds", PRD 4.2
        expect(at(middle)).toBeGreaterThan(at(lead));
        expect(at(trailing)).toBeGreaterThan(at(middle));
        expect(at(trailing)).toBeLessThan(200);
    });

    test('no raider starts inside Mars, which is why the approach line is tilted', () => {
        // Mars sits exactly at the trailing group's start distance along the
        // Earth-to-Mars axis. An untilted approach would bury four ships in it.
        const world = makeStructures();
        fleet.initFleet(CONFIG, null, world.hooks);
        const mars = CONFIG.bodies.find(b => b.id === 'mars');
        const centre = { x: mars.position[0], y: mars.position[1], z: mars.position[2] };

        for (const ship of fleet.getShips()) {
            const distance = Math.hypot(
                ship.position.x - centre.x,
                ship.position.y - centre.y,
                ship.position.z - centre.z);
            expect(distance).toBeGreaterThan(mars.radius * 1.5);
        }
    });

    test('the line still reads as coming FROM Mars rather than from somewhere else', () => {
        // Tilted, but only just: a few degrees off the Mars bearing keeps the
        // opening frame's image (PRD 6.3) intact.
        const a = CONFIG.fleet.approach;
        const offAxis = Math.hypot(a.azimuth, a.elevation) * (180 / Math.PI);
        expect(offAxis).toBeGreaterThan(1);
        expect(offAxis).toBeLessThan(8);
    });

    test('every raider starts pointed inward, already on its way', () => {
        const world = makeStructures();
        fleet.initFleet(CONFIG, null, world.hooks);
        for (const ship of fleet.getShips()) {
            // Heading roughly opposite the outward position vector.
            const outward = unit(ship.position.x, ship.position.y, ship.position.z);
            const dot = ship.heading.x * outward.x + ship.heading.y * outward.y + ship.heading.z * outward.z;
            expect(dot).toBeLessThan(-0.9);
        }
    });
});

describe('group targeting, which is where the strategy lives', () => {
    test('each group splits between Earth and the Moon the way its weights say', () => {
        // PRD 4.4: the choice between Earth and the Moon only costs something
        // if the Moon is under threat early and stays under threat. That is
        // entirely carried by these weights, so it gets an assertion rather
        // than a comment.
        const world = makeStructures();
        fleet.initFleet(CONFIG, null, world.hooks);

        const byId = new Map(world.list.map(s => [s.id, s]));
        CONFIG.fleet.groups.forEach((spec, index) => {
            const inGroup = fleet.getShips().filter(s => s.group === index);
            const counted = { earth: 0, moon: 0 };
            for (const ship of inGroup) counted[byId.get(ship.targetStructureId).body]++;
            expect(counted.earth).toBe(spec.weight.earth);
            expect(counted.moon).toBe(spec.weight.moon);
        });
    });

    test('two raiders from one group open on two installations, not the same one', () => {
        // Doubling up halves the time a structure survives, which is the
        // difference between the Moon being defensible and not.
        const world = makeStructures();
        fleet.initFleet(CONFIG, null, world.hooks);
        const lead = fleet.getShips().filter(s => s.group === 0);
        const targets = new Set(lead.map(s => s.targetStructureId));
        expect(targets.size).toBe(lead.length);
    });

    test('a group whose body has no installations left still gets a target', () => {
        const world = makeStructures();
        world.list = world.list.filter(s => s.body === 'earth');
        fleet.initFleet(CONFIG, null, world.hooks);
        for (const ship of fleet.getShips()) {
            expect(ship.targetStructureId).toBeTruthy();
        }
    });

    test('with nothing left standing, the fleet flies on rather than throwing', () => {
        const world = makeStructures();
        world.list = [];
        fleet.initFleet(CONFIG, null, world.hooks);
        expect(() => run(3)).not.toThrow();
        for (const ship of fleet.getShips()) {
            expect(ship.state).toBe(fleet.__test__.STATE.RETARGET);
        }
    });
});

// ---- The state machine ------------------------------------------------------

describe('transit, attack, and retarget', () => {
    /** One raider, placed by hand near a single installation, so a state
     *  transition is about the state machine rather than about a fleet. */
    function soloAt(distance, extra = {}) {
        const world = makeStructures();
        world.list = [world.list[0]];
        const config = {
            ...CONFIG,
            fleet: { ...CONFIG.fleet, groups: [{ count: 1, startDistance: 5000, weight: { earth: 1 } }], ...extra }
        };
        fleet.initFleet(config, null, world.hooks);
        const ship = fleet.getShips()[0];
        ship.position.x = 0; ship.position.y = 0; ship.position.z = distance;
        ship.heading.x = 0; ship.heading.y = 0; ship.heading.z = -1;
        return { world, ship };
    }

    test('a raider closes on its installation and settles into an attack', () => {
        const { ship } = soloAt(6000);
        run(1, null);
        expect(ship.state).toBe(fleet.__test__.STATE.TRANSIT);
        const closed = len(ship.position);
        expect(closed).toBeLessThan(6000);

        run(20, null);
        expect(ship.state).toBe(fleet.__test__.STATE.ATTACK);
    });

    test('it holds off at the standoff distance rather than flying into the ground', () => {
        const { ship } = soloAt(6000);
        run(40, null);
        const distance = len(ship.position);
        expect(distance).toBeGreaterThan(CONFIG.fleet.standoff * 0.5);
        expect(distance).toBeLessThan(CONFIG.fleet.standoff * 2.5);
    });

    test('it fires on the installation only once it is in position, and on the configured clock', () => {
        const { world, ship } = soloAt(1000);
        // In position from the first tick, so the whole run is attack time.
        run(CONFIG.fleet.fireInterval * 2.5, null);
        expect(ship.state).toBe(fleet.__test__.STATE.ATTACK);
        expect(world.damage).toHaveLength(2);
        expect(world.damage[0]).toEqual({ id: 'earth-a', amount: CONFIG.fleet.fireDamage });
    });

    test('a long approach does not bank a free opening shot', () => {
        // The fire clock only runs in ATTACK. Otherwise a raider that spent
        // ninety seconds crossing would arrive and immediately empty a full
        // interval's worth of shots into the installation.
        const { world } = soloAt(90000);
        run(20, null);
        expect(world.damage).toHaveLength(0);
    });

    test('an attack raises the alert, naming the installation', () => {
        const { ship } = soloAt(1000);
        expect(fleet.getAlert()).toBeNull();
        run(CONFIG.fleet.fireInterval + 0.5, null);

        const alert = fleet.getAlert();
        expect(alert.id).toBe(ship.targetStructureId);
        expect(alert.label).toBe('Earth A');
        expect(alert.body).toBe('earth');
    });

    test('the alert lapses on its own once the shooting stops', () => {
        soloAt(1000);
        run(CONFIG.fleet.fireInterval + 0.5, null);
        expect(fleet.getAlert()).toBeTruthy();

        // Nothing more can land inside the alert's lifetime, so it expires.
        fleet.getShips()[0].alive = false;
        run(CONFIG.fleet.alertLife + 1, null);
        expect(fleet.getAlert()).toBeNull();

        fleet.clearAlert();
        expect(fleet.getAlert()).toBeNull();
    });

    test('losing an installation sends its attacker to the next one', () => {
        const world = makeStructures();
        fleet.initFleet(CONFIG, null, world.hooks);
        const ship = fleet.getShips()[0];
        const lost = ship.targetStructureId;

        world.list = world.list.filter(s => s.id !== lost);
        run(0.2, null);

        expect(ship.targetStructureId).not.toBe(lost);
        expect(ship.state).toBe(fleet.__test__.STATE.TRANSIT);
    });

    test('a retarget prefers the raider\'s own body over anything nearer', () => {
        // Otherwise every raider collapses onto Earth after the first loss and
        // the Moon stops being contested, which is the whole strategy layer.
        const world = makeStructures();
        fleet.initFleet(CONFIG, null, world.hooks);
        const lunar = fleet.getShips().find(s => s.preferredBody === 'moon');
        // Parked next to Earth, so the nearest structure of any kind is Earth's.
        lunar.position.x = 0; lunar.position.y = 0; lunar.position.z = 0;
        world.list = world.list.filter(s => s.id !== lunar.targetStructureId);

        run(0.2, null);
        expect(lunar.targetStructureId.startsWith('moon')).toBe(true);
    });
});

describe('breaking off', () => {
    /** The visitor, close to a raider and pointed at it. */
    function playerFacing(ship, distance) {
        const back = unit(1, 0.2, 0.4);
        const position = {
            x: ship.position.x + back.x * distance,
            y: ship.position.y + back.y * distance,
            z: ship.position.z + back.z * distance
        };
        return { position, forward: unit(-back.x, -back.y, -back.z) };
    }

    test('a raider weaves when the visitor is close and nearly lined up', () => {
        // The PRD's trigger is "close and holding a lock", which cannot happen:
        // a raider has one hit point, so the frame that produces a lock also
        // produces a corpse. The trigger that preserves the intent is being
        // close and nearly lined up, while the shot is still being set up.
        const world = makeStructures();
        fleet.initFleet(CONFIG, null, world.hooks);
        const ship = fleet.getShips()[0];

        fleet.updateFleet(0.1, playerFacing(ship, CONFIG.fleet.evade.triggerDistance * 0.5));
        expect(ship.state).toBe(fleet.__test__.STATE.EVADE);
    });

    test('it does not weave for a visitor who is close but looking elsewhere', () => {
        const world = makeStructures();
        fleet.initFleet(CONFIG, null, world.hooks);
        const ship = fleet.getShips()[0];
        const player = playerFacing(ship, 1000);
        player.forward = unit(-player.forward.x, -player.forward.y, -player.forward.z);

        fleet.updateFleet(0.1, player);
        expect(ship.state).not.toBe(fleet.__test__.STATE.EVADE);
    });

    test('it does not weave for a visitor who is lined up but far away', () => {
        const world = makeStructures();
        fleet.initFleet(CONFIG, null, world.hooks);
        const ship = fleet.getShips()[0];

        fleet.updateFleet(0.1, playerFacing(ship, CONFIG.fleet.evade.triggerDistance * 3));
        expect(ship.state).not.toBe(fleet.__test__.STATE.EVADE);
    });

    test('the weave is rate limited, or a chased raider would never be killable', () => {
        const world = makeStructures();
        fleet.initFleet(CONFIG, null, world.hooks);
        const ship = fleet.getShips()[0];
        const chase = () => fleet.updateFleet(0.1, playerFacing(ship, 1200));

        chase();
        expect(ship.state).toBe(fleet.__test__.STATE.EVADE);

        // Ride it out. The cooldown starts when the weave ends, so the raider
        // has to fly straight for a while even under continuous pressure.
        for (let i = 0; i < Math.ceil(CONFIG.fleet.evade.duration / 0.1) + 2; i++) chase();
        expect(ship.state).not.toBe(fleet.__test__.STATE.EVADE);
        expect(ship.evadeCooldown).toBeGreaterThan(0);

        chase();
        expect(ship.state).not.toBe(fleet.__test__.STATE.EVADE);
    });

    test('the weave is shallow enough that the visitor can follow it', () => {
        // PRD 6.3 asks for "the satisfaction of a chase without making the
        // player miss", so the question is how much the WEAVE moves a raider,
        // not how much it moves overall. At a couple of thousand units, a ship
        // crossing at cruise speed swings a long way through the visitor's view
        // whether it is dodging or not, and measuring the total would be
        // measuring the wrong thing entirely.
        //
        // So the same break-off is flown twice, once with the weave and once
        // with the offset zeroed, and what is asserted is the difference: the
        // dodge itself has to stay inside the width of the threat cone.
        const withWeave = flyBreakOff(CONFIG.fleet.evade.weaveOffset);
        const straight = flyBreakOff(0);
        expect(angle(withWeave.bearing, straight.bearing))
            .toBeLessThan(CONFIG.fleet.evade.threatCone);
        // And it is a real dodge rather than a rounding error.
        expect(angle(withWeave.bearing, straight.bearing)).toBeGreaterThan(0.01);
    });

    /** Fly one raider through a full break-off and report where it ended up
     *  relative to the visitor watching it. */
    function flyBreakOff(weaveOffset) {
        const world = makeStructures();
        const config = {
            ...CONFIG,
            fleet: { ...CONFIG.fleet, evade: { ...CONFIG.fleet.evade, weaveOffset } }
        };
        fleet.initFleet(config, null, world.hooks);
        const ship = fleet.getShips()[0];
        const player = playerFacing(ship, CONFIG.fleet.evade.triggerDistance * 0.6);

        for (let i = 0; i < Math.ceil(CONFIG.fleet.evade.duration / 0.05); i++) {
            fleet.updateFleet(0.05, player);
        }
        expect(ship.state).toBe(fleet.__test__.STATE.EVADE);
        return {
            bearing: unit(
                ship.position.x - player.position.x,
                ship.position.y - player.position.y,
                ship.position.z - player.position.z)
        };
    }

    test('no visitor at all means no break-off and no incoming fire', () => {
        const world = makeStructures();
        fleet.initFleet(CONFIG, null, world.hooks);
        run(5, null);
        expect(world.playerHits).toBe(0);
        for (const ship of fleet.getShips()) {
            expect(ship.state).not.toBe(fleet.__test__.STATE.EVADE);
        }
    });
});

describe('fire on the visitor, lightly', () => {
    test('a raider answers a visitor who stays on it', () => {
        // The fire clock only runs while the visitor is actually in range, so
        // this is a CHASE rather than a drive-by: the player holds station off
        // the raider's flank while it flies. Someone who dives in, kills, and
        // leaves is never shot at, which is the right side of "lightly" and of
        // PRD 4.5's easy-by-design stance.
        const world = makeStructures();
        fleet.initFleet(CONFIG, null, world.hooks);
        const ship = fleet.getShips()[0];
        const player = { position: { x: 0, y: 0, z: 0 }, forward: { x: 0, y: 0, z: -1 } };

        for (let t = 0; t < CONFIG.fleet.playerFireInterval + 2; t += 0.1) {
            player.position.x = ship.position.x + 500;
            player.position.y = ship.position.y;
            player.position.z = ship.position.z;
            fleet.updateFleet(0.1, player);
        }
        expect(world.playerHits).toBeGreaterThan(0);
    });

    test('a visitor who dives past is not shot at', () => {
        const world = makeStructures();
        fleet.initFleet(CONFIG, null, world.hooks);
        const ship = fleet.getShips()[0];
        const player = { position: { ...ship.position }, forward: { x: 0, y: 0, z: -1 } };
        player.position.x += 500;

        // Standing still while the raider flies on: it is in range for barely
        // more than a second, which does not buy a shot.
        run(CONFIG.fleet.playerFireInterval + 1, player);
        expect(world.playerHits).toBe(0);
    });

    test('twelve raiders in one place are harassment, not a wall of fire', () => {
        // The fleet-wide gap on top of the per-ship cadence. Without it, a
        // visitor who flew into the middle of a group would be hit twelve times
        // in one frame.
        const world = makeStructures();
        fleet.initFleet(CONFIG, null, world.hooks);
        const player = { position: { x: 0, y: 0, z: 0 }, forward: { x: 0, y: 0, z: -1 } };
        for (const ship of fleet.getShips()) {
            ship.position.x = 100; ship.position.y = 0; ship.position.z = 0;
        }

        const seconds = 10;
        run(seconds, player);
        expect(world.playerHits).toBeLessThanOrEqual(Math.ceil(seconds / CONFIG.fleet.playerFireGap));
    });

    test('a raider out of range holds its fire and does not bank a shot', () => {
        const world = makeStructures();
        fleet.initFleet(CONFIG, null, world.hooks);
        const far = CONFIG.fleet.playerFireRange * 10;
        const player = { position: { x: far, y: far, z: far }, forward: { x: 0, y: 0, z: -1 } };

        run(CONFIG.fleet.playerFireInterval * 3, player);
        expect(world.playerHits).toBe(0);
    });
});

// ---- Presentation -----------------------------------------------------------

describe('what is actually drawn', () => {
    test('every hull shares one geometry, so twelve raiders cost about one', () => {
        const world = makeStructures();
        fleet.initFleet(CONFIG, null, world.hooks);
        const hulls = new Set();
        for (const ship of fleet.getShips()) {
            for (const part of ship.mesh.children) hulls.add(part.geometry);
        }
        // One cone and one wing box, shared across all twelve.
        expect(hulls.size).toBe(2);
    });

    test('the hull switches off past the resolve distance, and the light does not', () => {
        // At 200,000 units a 220 unit hull is about a hundredth of a degree.
        // What carries a distant raider is its running light and its HUD pip.
        const world = makeStructures();
        fleet.initFleet(CONFIG, null, world.hooks);
        const player = { position: { x: 0, y: 0, z: 0 }, forward: { x: 0, y: 0, z: -1 } };
        fleet.updateFleet(0.016, player);

        const near = fleet.getShips().filter(s => s.distanceToPlayer <= CONFIG.fleet.lodResolveDistance);
        const far = fleet.getShips().filter(s => s.distanceToPlayer > CONFIG.fleet.lodResolveDistance);
        expect(far.length).toBeGreaterThan(0);
        for (const ship of near) expect(ship.mesh.visible).toBe(true);
        for (const ship of far) expect(ship.mesh.visible).toBe(false);

        // One Points object for the lot, and it is never hidden.
        expect(fleet.__test__.getLights().points.visible).toBe(true);
    });

    test('the running lights are one draw call that never attenuates', () => {
        const world = makeStructures();
        fleet.initFleet(CONFIG, null, world.hooks);
        const lights = fleet.__test__.getLights();
        expect(lights.material.sizeAttenuation).toBe(false);
        expect(lights.positions).toHaveLength(CONFIG.fleet.total * 3);
        // The buffer is rewritten every frame, so culling it against a stale
        // bounding sphere would take the whole fleet off screen.
        expect(lights.points.frustumCulled).toBe(false);
    });

    test('a destroyed raider leaves by shortening the draw range', () => {
        const world = makeStructures();
        fleet.initFleet(CONFIG, null, world.hooks);
        fleet.updateFleet(0.016, null);
        expect(fleet.__test__.getLights().geometry.drawRange.count).toBe(12);

        fleet.destroyShip('raider-0');
        fleet.updateFleet(0.016, null);
        expect(fleet.__test__.getLights().geometry.drawRange.count).toBe(11);
    });

    test('incoming fire draws a beam that fades out and returns to the pool', () => {
        const world = makeStructures();
        world.list = [world.list[0]];
        fleet.initFleet(
            { ...CONFIG, fleet: { ...CONFIG.fleet, groups: [{ count: 1, startDistance: 5000, weight: { earth: 1 } }] } },
            null, world.hooks);
        // Placed in position by hand, so the run is all attack time rather than
        // mostly approach.
        const ship = fleet.getShips()[0];
        ship.position.x = 0; ship.position.y = 0; ship.position.z = 1000;
        ship.heading.x = 0; ship.heading.y = 0; ship.heading.z = -1;

        run(CONFIG.fleet.fireInterval + 0.2, null, 0.05);
        expect(fleet.__test__.allBeams().some(b => b.active)).toBe(true);

        run(CONFIG.fleet.beamLife + 0.2, null, 0.05);
        expect(fleet.__test__.allBeams().every(b => !b.active)).toBe(true);
    });
});

describe('lifecycle', () => {
    test('a destroyed raider leaves the target list and the count', () => {
        const world = makeStructures();
        fleet.initFleet(CONFIG, null, world.hooks);

        expect(fleet.destroyShip('raider-3')).toBeTruthy();
        expect(fleet.shipsRemaining()).toBe(11);
        expect(fleet.fleetCandidates()).toHaveLength(11);
        expect(fleet.fleetCandidates().some(c => c.id === 'raider-3')).toBe(false);
        // The mesh stays in the scene, hidden, so a restart needs no new geometry.
        expect(fleet.getShip('raider-3').mesh.visible).toBe(false);

        // Twice is a no-op, and an unknown id is not an error.
        expect(fleet.destroyShip('raider-3')).toBeNull();
        expect(fleet.destroyShip('nobody')).toBeNull();
        expect(fleet.getShip('nobody')).toBeNull();
    });

    test('every raider is hostile, and carries a radius for its own explosion', () => {
        const world = makeStructures();
        fleet.initFleet(CONFIG, null, world.hooks);
        for (const candidate of fleet.fleetCandidates()) {
            expect(candidate.allegiance).toBe('hostile');
            expect(candidate.radius).toBe(CONFIG.fleet.effectRadius);
        }
    });

    test('the candidate list is reused between frames rather than rebuilt', () => {
        const world = makeStructures();
        fleet.initFleet(CONFIG, null, world.hooks);
        const first = fleet.fleetCandidates();
        expect(fleet.fleetCandidates()).toBe(first);
        // And a candidate's position IS the ship's position, not a copy of it.
        expect(first[0].position).toBe(fleet.getShips()[0].position);
    });

    test('the fleet joins the scene it is given, under one name', () => {
        const world = makeStructures();
        const scene = { children: [], add(o) { this.children.push(o); } };
        const group = fleet.initFleet(CONFIG, scene, world.hooks);
        expect(scene.children).toContain(group);
        expect(group.name).toBe('fleet');
        expect(fleet.getFleetGroup()).toBe(group);
    });

    test('updating before init is a no-op rather than a crash', () => {
        expect(fleet.updateFleet(0.016, null)).toBe(0);
        expect(fleet.getAlert()).toBeNull();
    });

    test('dispose releases every geometry and material, and is safe twice', () => {
        const world = makeStructures();
        fleet.initFleet(CONFIG, null, world.hooks);
        disposed.geometries = 0;
        disposed.materials = 0;
        fleet.disposeFleet();

        // Hull, wing, the running-light buffer, and six beams.
        expect(disposed.geometries).toBe(9);
        // Hull material, the light material, and six beam materials.
        expect(disposed.materials).toBe(8);
        expect(fleet.getShips()).toHaveLength(0);
        expect(() => fleet.disposeFleet()).not.toThrow();
    });

    test('re-initialising releases the previous fleet rather than leaking it', () => {
        const world = makeStructures();
        fleet.initFleet(CONFIG, null, world.hooks);
        disposed.geometries = 0;
        fleet.initFleet(CONFIG, null, world.hooks);
        expect(disposed.geometries).toBe(9);
        expect(fleet.getShips()).toHaveLength(12);
    });

    test('a fleet with no hooks at all still flies', () => {
        // The hooks are how the fleet reaches the rest of the game. Without
        // them there is nothing to attack and nobody to shoot, and that has to
        // be a quiet nothing rather than a stack trace.
        fleet.initFleet(CONFIG, null, {});
        expect(() => run(2)).not.toThrow();
        expect(fleet.shipsRemaining()).toBe(12);
    });
});

// ---- The pure core ----------------------------------------------------------

describe('steerToward', () => {
    const X = { x: 1, y: 0, z: 0 };
    const Y = { x: 0, y: 1, z: 0 };

    test('turns by exactly the amount it was allowed', () => {
        // Exact rather than a normalised lerp, which turns by less than it
        // promises and by a different amount depending on how far off it
        // started. A knowable turn rate is what makes the turn radius a design
        // number instead of an emergent one.
        const out = fleet.steerToward(X, Y, 0.3);
        expect(angle(X, out)).toBeCloseTo(0.3, 10);
        expect(len(out)).toBeCloseTo(1, 10);
    });

    test('snaps onto the target when the target is already within reach', () => {
        const out = fleet.steerToward(X, Y, Math.PI);
        expect(out).toEqual(Y);
    });

    test('stays put when it is already there', () => {
        expect(fleet.steerToward(X, X, 0.3)).toEqual(X);
    });

    test('with no turn authority it holds its heading', () => {
        expect(fleet.steerToward(X, Y, 0)).toEqual(X);
        expect(fleet.steerToward(X, Y, -1)).toEqual(X);
    });

    test('turns the right way from a dead reversal, rather than dividing by zero', () => {
        // At exactly 180 degrees there is no perpendicular to pick, so any one
        // will do: the ship has to commit to a side and one is as good as the
        // other. What it must not do is return NaN.
        const back = { x: -1, y: 0, z: 0 };
        const out = fleet.steerToward(X, back, 0.4);
        expect(Number.isNaN(out.x)).toBe(false);
        expect(len(out)).toBeCloseTo(1, 10);
        expect(angle(X, out)).toBeCloseTo(0.4, 10);
    });

    test('writes into the object it is handed, so a frame allocates nothing', () => {
        const out = { x: 0, y: 0, z: 0 };
        expect(fleet.steerToward(X, Y, 0.2, out)).toBe(out);
    });
});

describe('assignBodies', () => {
    test('splits a group the way its weights say', () => {
        expect(fleet.assignBodies({ earth: 2, moon: 2 }, 4))
            .toEqual(['earth', 'moon', 'earth', 'moon']);
    });

    test('interleaves rather than blocking, so a short group still splits', () => {
        // Blocks would send every early ship of a { earth: 1, moon: 3 } group
        // to Earth, which is the opposite of what the weights asked for.
        const three = fleet.assignBodies({ earth: 1, moon: 3 }, 4);
        expect(three.filter(b => b === 'moon')).toHaveLength(3);
        expect(three[0]).toBe('earth');
        expect(three[1]).toBe('moon');
    });

    test('repeats the proportions when there are more ships than shares', () => {
        const many = fleet.assignBodies({ earth: 1, moon: 1 }, 6);
        expect(many).toHaveLength(6);
        expect(many.filter(b => b === 'earth')).toHaveLength(3);
    });

    test('an empty or zeroed weight leaves every ship unassigned', () => {
        expect(fleet.assignBodies({}, 2)).toEqual([null, null]);
        expect(fleet.assignBodies({ earth: 0 }, 2)).toEqual([null, null]);
        expect(fleet.assignBodies(null, 0)).toEqual([]);
    });
});

describe('leastPressuredStructure', () => {
    const here = { x: 0, y: 0, z: 0 };
    const list = [
        { id: 'near-earth', body: 'earth', position: { x: 100, y: 0, z: 0 } },
        { id: 'far-earth', body: 'earth', position: { x: 9000, y: 0, z: 0 } },
        { id: 'far-moon', body: 'moon', position: { x: 64000, y: 0, z: 0 } }
    ];

    // With no census this has to behave exactly like the plain nearest-wins
    // pick it replaced, or every caller that does not care about crowding
    // quietly changed behaviour.
    test('picks the closest when no body is preferred', () => {
        expect(fleet.leastPressuredStructure(here, list).id).toBe('near-earth');
    });

    test('a preferred body beats a nearer installation on another one', () => {
        expect(fleet.leastPressuredStructure(here, list, {}, 'moon').id).toBe('far-moon');
    });

    test('falls back to the nearest when nothing on the preferred body survives', () => {
        expect(fleet.leastPressuredStructure(here, list, {}, 'mars').id).toBe('near-earth');
    });

    test('an empty or malformed list gives null rather than a wrong answer', () => {
        expect(fleet.leastPressuredStructure(here, [])).toBeNull();
        expect(fleet.leastPressuredStructure(here, [null, { id: 'x' }])).toBeNull();
    });

    // The reason this function exists. Twelve raiders losing Earth on one frame
    // used to pile onto whichever lunar site was nearest.
    test('a crowded installation loses to a quieter one further away', () => {
        const attackers = { 'near-earth': 3, 'far-earth': 0 };
        expect(fleet.leastPressuredStructure(here, list, attackers).id).toBe('far-earth');
    });

    test('distance still breaks a tie between equally crowded installations', () => {
        const attackers = { 'near-earth': 2, 'far-earth': 2, 'far-moon': 2 };
        expect(fleet.leastPressuredStructure(here, list, attackers).id).toBe('near-earth');
    });

    // Crowding is a tie-breaker WITHIN a body, never a reason to abandon one.
    // Otherwise the group weights stop meaning anything after the first loss.
    test('the preferred body outranks the census', () => {
        const attackers = { 'far-moon': 9, 'near-earth': 0 };
        expect(fleet.leastPressuredStructure(here, list, attackers, 'moon').id).toBe('far-moon');
    });
});

describe('formationElevation', () => {
    // Below the horizon is inside the planet the installation stands on. On the
    // Moon a beacon is 1,916 units from a centre with a radius of 1,737, so a
    // station much under the local horizon is underground.
    test('every circle sits above the installation, never inside its planet', () => {
        for (let i = 0; i < 12; i++) {
            const elevation = fleet.formationElevation(i, 12);
            expect(elevation).toBeGreaterThan(0);
            expect(elevation).toBeLessThan(Math.PI / 2);
        }
    });

    test('twelve ships get twelve separated heights', () => {
        const heights = [];
        for (let i = 0; i < 12; i++) heights.push(fleet.formationElevation(i, 12));
        heights.sort((a, b) => a - b);
        for (let i = 1; i < heights.length; i++) {
            // At 1,200 units of standoff, 0.04 radians is about 48 units of
            // separation, and the per-ship shell adds to that. Enough that two
            // raiders passing the same bearing are still two marks.
            expect(heights[i] - heights[i - 1]).toBeGreaterThan(0.04);
        }
    });

    test('the limit is respected and a limit of zero gives one flat ring', () => {
        expect(fleet.formationElevation(11, 12, 0.5)).toBeLessThanOrEqual(Math.PI / 4);
        expect(fleet.formationElevation(5, 12, 0)).toBe(0);
    });

    test('a degenerate total is answered rather than divided by', () => {
        expect(Number.isFinite(fleet.formationElevation(0, 0))).toBe(true);
    });
});

// ---- What the whole thing was for -------------------------------------------
//
// The four tests below are the bug this file's station keeping exists to fix,
// written as the measurements that caught it. Before it, a fifteen minute run
// landed ZERO shots on any of the three lunar installations, twelve raiders
// drew as three marks, and two ships eventually left the world entirely.

describe('holding station beside a MOVING installation', () => {
    /** One installation that travels the way the Moon's do: 838 units a second
     *  along its orbit, publishing the velocity and the outward normal that
     *  structures.js samples once a frame. */
    function movingWorld(speed = 838) {
        const site = {
            id: 'moon-a', body: 'moon', label: 'Moon A',
            position: { x: 0, y: 0, z: 0 },
            velocity: { x: speed, y: 0, z: 0 },
            speed,
            up: { x: 0, y: 1, z: 0 }
        };
        const state = { list: [site], site, damage: [], elapsed: 0 };
        state.hooks = {
            structures: () => state.list,
            damageStructure: (id, amount) => {
                state.damage.push({ id, amount, at: state.elapsed });
                return { id, hitPoints: 2, destroyed: false };
            },
            onPlayerHit: () => {}
        };
        return state;
    }

    /** Advance the installation and then the fleet, in that order, which is the
     *  order main.js uses and the reason a raider steers at where its target IS. */
    function fly(world, seconds, step = 0.1) {
        for (let t = 0; t < seconds; t += step) {
            world.site.position.x += world.site.velocity.x * step;
            world.site.position.y += world.site.velocity.y * step;
            world.site.position.z += world.site.velocity.z * step;
            world.elapsed += step;
            fleet.updateFleet(step, null);
        }
    }

    function soloOn(world, offset = { x: 0, y: 0, z: 1000 }) {
        const config = {
            ...CONFIG,
            fleet: { ...CONFIG.fleet, groups: [{ count: 1, startDistance: 5000, weight: { moon: 1 } }] }
        };
        fleet.initFleet(config, null, world.hooks);
        const ship = fleet.getShips()[0];
        ship.position.x = offset.x; ship.position.y = offset.y; ship.position.z = offset.z;
        ship.heading.x = 0; ship.heading.y = 0; ship.heading.z = -1;
        return ship;
    }

    // THE BUG, IN TWO ROUNDS, because the first fix for it was only half right.
    //
    // Round one: `attackSpeedFactor` was read as an absolute loiter speed, which
    // at 0.35 of 1,200 is 420 against a Moon doing 838, so an attacker fell off
    // its station the instant it arrived, its fire clock reset every frame, and
    // a fifteen minute run landed exactly zero shots on the Moon.
    //
    // Round two: the answer to that was to add the target's velocity PROJECTED
    // ONTO THE NOSE, which fixes the near half of every lap and abandons the far
    // half, where the projection is negative and the speed floor pinned the
    // raider at 180 against a Moon doing 838. A probe over four minutes had the
    // gap swinging between 734 and 23,538 units, the raider inside its own
    // firing radius 49.5% of the time, and the cadence at one shot per twenty
    // seconds with the first landing at t=90s. That was written up here as the
    // Moon being "genuinely harder to attack", which was a rationalisation: the
    // same probe against a stationary Earth site held station to within 60 units
    // and fired on the interval exactly, so the Moon was not harder, it was
    // close to unattackable, and PRD 4.4's triage had nothing to weigh.
    //
    // A raider now borrows its target's velocity WHOLE and spends its engine
    // only on the circle, so the two cases are the same manoeuvre in different
    // frames. The cadence is therefore asserted at the interval, tightly, for
    // Earth and the Moon alike: any drift back toward projecting the carry shows
    // up here immediately.
    test('a raider repeatedly fires on an installation that is running away', () => {
        const world = movingWorld();
        soloOn(world);
        fly(world, 90);
        expect(world.damage.length).toBeGreaterThanOrEqual(4);
        for (let i = 1; i < world.damage.length; i++) {
            const gap = world.damage[i].at - world.damage[i - 1].at;
            expect(gap).toBeGreaterThanOrEqual(CONFIG.fleet.fireInterval - 0.5);
            expect(gap).toBeLessThanOrEqual(CONFIG.fleet.fireInterval + 0.5);
        }
    });

    test('and is never left behind by it', () => {
        const world = movingWorld();
        const ship = soloOn(world);
        let furthest = 0;
        for (let t = 0; t < 90; t += 0.1) {
            world.site.position.x += world.site.velocity.x * 0.1;
            world.elapsed += 0.1;
            fleet.updateFleet(0.1, null);
            // The opening seconds are an approach, not station keeping, so the
            // measurement starts once the ship has had time to arrive.
            if (t < 30) continue;
            furthest = Math.max(furthest, Math.hypot(
                ship.position.x - world.site.position.x,
                ship.position.y - world.site.position.y,
                ship.position.z - world.site.position.z));
        }
        // Inside the radius its own fire clock runs in, which is the property
        // that actually matters: a raider outside this resets its twelve seconds
        // and never gets a shot away. The old bound was four times standoff,
        // which is to say more than twice the firing radius, and a raider can
        // sit at that distance indefinitely doing nothing at all.
        expect(furthest).toBeLessThan(CONFIG.fleet.standoff * CONFIG.fleet.holdRadius);
    });

    // THE MOON AND EARTH ARE THE SAME MANOEUVRE, which is the whole point of
    // borrowing the velocity whole rather than projecting it. A lunar attacker
    // holds the same circle as an Earth one; only the frame it holds it in
    // moves. Asserted as a comparison rather than as two absolute numbers,
    // because the number is `standoff` and this is about the two agreeing.
    test('station keeping is the same shape whether the target moves or not', () => {
        function settledRadius(speed) {
            const world = movingWorld(speed);
            const ship = soloOn(world);
            fly(world, 60);
            let low = Infinity, high = 0;
            for (let t = 0; t < 30; t += 0.1) {
                world.site.position.x += world.site.velocity.x * 0.1;
                world.elapsed += 0.1;
                fleet.updateFleet(0.1, null);
                const d = Math.hypot(
                    ship.position.x - world.site.position.x,
                    ship.position.y - world.site.position.y,
                    ship.position.z - world.site.position.z);
                low = Math.min(low, d);
                high = Math.max(high, d);
            }
            fleet.disposeFleet();
            return { low, high };
        }
        const still = settledRadius(0);
        const moving = settledRadius(838);
        // Both hold a tight circle rather than a wandering one.
        expect(still.high - still.low).toBeLessThan(CONFIG.fleet.standoff * 0.25);
        expect(moving.high - moving.low).toBeLessThan(CONFIG.fleet.standoff * 0.25);
        // And it is the same circle: the Moon costs an attacker nothing it did
        // not already cost it around Earth.
        expect(moving.high).toBeLessThan(still.high + CONFIG.fleet.standoff * 0.25);
    });

    // A target nothing could keep up with is left behind honestly, rather than
    // quietly making a raider faster than the visitor's own ship.
    test('no raider ever outruns its own speed cap', () => {
        const world = movingWorld(4000);
        const ship = soloOn(world);
        let fastest = 0;
        for (let t = 0; t < 60; t += 0.1) {
            const before = { ...ship.position };
            world.site.position.x += world.site.velocity.x * 0.1;
            world.elapsed += 0.1;
            fleet.updateFleet(0.1, null);
            fastest = Math.max(fastest, Math.hypot(
                ship.position.x - before.x,
                ship.position.y - before.y,
                ship.position.z - before.z) / 0.1);
        }
        expect(fastest).toBeLessThanOrEqual(CONFIG.fleet.cruiseSpeed * CONFIG.fleet.attackSpeedCap + 1);
    });

    // The heading is a unit vector by contract, and steerToward's rotation only
    // preserves that in exact arithmetic. Station keeping takes the rotation
    // branch on every frame, so nothing else ever puts the error back.
    test('a long run leaves the heading on the unit sphere', () => {
        const world = movingWorld();
        const ship = soloOn(world);
        fly(world, 600, 1 / 60);
        expect(Math.hypot(ship.heading.x, ship.heading.y, ship.heading.z)).toBeCloseTo(1, 9);
    });
});

describe('twelve raiders read as twelve', () => {
    test('attackers on one installation do not converge to a single point', () => {
        const world = makeStructures();
        // Everything alive is on one installation, which is the state the game
        // reaches the moment six raiders lose Earth on the same frame.
        world.list = [world.list[0]];
        fleet.initFleet(CONFIG, null, world.hooks);
        for (const ship of fleet.getShips()) ship.targetStructureId = 'earth-a';
        run(120, null);

        const ships = fleet.getShips();
        let closest = Infinity;
        for (let i = 0; i < ships.length; i++) {
            for (let j = i + 1; j < ships.length; j++) {
                closest = Math.min(closest, Math.hypot(
                    ships[i].position.x - ships[j].position.x,
                    ships[i].position.y - ships[j].position.y,
                    ships[i].position.z - ships[j].position.z));
            }
        }
        // Before the formation slots this measured eight units, which at any
        // viewing distance is one mark on screen with a count of twelve beside
        // it. A hundred is about five pixels apart from 15,000 units away.
        expect(closest).toBeGreaterThan(100);
    });

    test('losing a whole body spreads the survivors over what is left', () => {
        const world = makeStructures();
        fleet.initFleet(CONFIG, null, world.hooks);
        // Earth falls, all four at once.
        world.list = world.list.filter(s => s.body === 'moon');
        run(2, null);

        const perTarget = {};
        for (const ship of fleet.getShips()) {
            perTarget[ship.targetStructureId] = (perTarget[ship.targetStructureId] || 0) + 1;
        }
        expect(Object.keys(perTarget).sort()).toEqual(['moon-a', 'moon-b', 'moon-c']);
        // Twelve over three, give or take the ones that were already there.
        for (const id of Object.keys(perTarget)) {
            expect(perTarget[id]).toBeLessThanOrEqual(6);
        }
    });
});

describe('hashUnit', () => {
    test('is deterministic, so the opening frame is the same on every visit', () => {
        expect(fleet.hashUnit(7)).toBe(fleet.hashUnit(7));
        expect(fleet.hashUnit(7)).not.toBe(fleet.hashUnit(8));
    });

    test('stays inside -1 to 1, and does not lean to one side', () => {
        let sum = 0;
        for (let i = 0; i < 400; i++) {
            const v = fleet.hashUnit(i);
            expect(v).toBeGreaterThanOrEqual(-1);
            expect(v).toBeLessThan(1);
            sum += v;
        }
        expect(Math.abs(sum / 400)).toBeLessThan(0.15);
    });
});
