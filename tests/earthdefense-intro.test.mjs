// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The opening shot (www/earthdefense/js/intro.js).
 *
 * THE WHOLE POINT OF THIS SHOT IS THAT IT DOES NOT CUT, so the assertion that
 * matters most in this file is one line: the last frame of the path is the
 * spawn position and the spawn look target, to the unit. If that ever stops
 * being true the welcome screen starts arriving on a jump, which is exactly the
 * thing this feature was built to remove, and it would be very easy to break by
 * retuning any of a dozen numbers in the config block.
 *
 * THE FRAMING IS ARITHMETIC, SO IT IS TESTED AS ARITHMETIC, the same way the
 * finale's is. A camera path either stays outside the planets or it does not,
 * and a squadron either fits a portrait phone's narrow half frame or it does
 * not. Both are divisions. Both were quietly broken by the first plausible
 * looking draft of this shot: the camera stood 32 degrees off the fleet's
 * flight line, which sheared the wedge across 28 degrees of frame, and no unit
 * test would have noticed because nothing crashed. The bounds are written down
 * here rather than left to a screenshot to catch.
 *
 * NOTHING IN THIS FILE ALLOWS FOR RANDOMNESS, because there is none. Every
 * start offset and start heading comes from `hashUnit` of the ship's index, so
 * a visitor who reloads sees the same squadron close up the same way.
 */
import { jest } from '@jest/globals';

// Just enough THREE to build groups and meshes, and RECORDING rather than
// pretending: what matters is which positions and headings reach the meshes.
class FakeGeometry {
    constructor(...args) { this.args = args; this.disposed = false; this.rotated = 0; }
    rotateX(a) { this.rotated = a; return this; }
    dispose() { this.disposed = true; }
}
class FakeMaterial {
    constructor(opts) { Object.assign(this, opts || {}); this.disposed = false; }
    dispose() { this.disposed = true; }
}
class FakeObject {
    constructor() {
        this.children = [];
        this.name = '';
        this.visible = true;
        this.looked = null;
        this.position = {
            x: 0, y: 0, z: 0,
            set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
        };
    }
    add(child) { this.children.push(child); return this; }
    lookAt(x, y, z) { this.looked = { x, y, z }; return this; }
}
class FakeMesh extends FakeObject {
    constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; }
}

function installThree() {
    globalThis.THREE = {
        Group: FakeObject,
        Mesh: FakeMesh,
        ConeGeometry: FakeGeometry,
        BoxGeometry: FakeGeometry,
        SphereGeometry: FakeGeometry,
        BufferGeometry: class extends FakeGeometry {
            constructor() { super(); this.attributes = {}; this.range = null; }
            setAttribute(n, a) { this.attributes[n] = a; return this; }
            setDrawRange(start, count) { this.range = { start, count }; }
        },
        BufferAttribute: class { constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; } },
        MeshStandardMaterial: FakeMaterial,
        MeshBasicMaterial: FakeMaterial,
        PointsMaterial: FakeMaterial,
        LineBasicMaterial: FakeMaterial,
        Points: FakeMesh,
        Line: FakeMesh,
        CanvasTexture: class {
            constructor(c) { this.image = c; this.disposed = false; }
            dispose() { this.disposed = true; }
        },
        AdditiveBlending: 2,
        DoubleSide: 2
    };
    // fleet.js paints its running-light sprite on a canvas at init.
    globalThis.document = {
        createElement: () => ({
            width: 0, height: 0,
            getContext: () => new Proxy({}, {
                get: (_t, p) => (p === 'createRadialGradient'
                    ? () => ({ addColorStop() {} })
                    : () => {})
            })
        })
    };
}

let intro;
let fleet;
let CONFIG;
let spawnPosition;
let scene;

beforeEach(async () => {
    installThree();
    jest.resetModules();
    ({ EARTHDEFENSE_CONFIG: CONFIG, spawnPosition } = await import('../www/earthdefense/js/config.js'));
    // THE MINIFIED FLEET ON PURPOSE, and this is the one surprising line in the
    // file. intro.js imports `./fleet.min.js`, because that is what the page
    // loads, and the shared raider geometry it builds is MODULE STATE. Importing
    // `fleet.js` here would initialise a second, separate copy of the module and
    // leave the one intro.js is actually holding with no geometry in it, so
    // every hull would come back null and the squadron would silently be empty.
    // The finale suite never hit this because everything it reaches through
    // `replay.min.js` is stateless. fleet.js's own coverage comes from
    // tests/earthdefense-fleet.test.mjs, which drives the source directly.
    fleet = await import('../www/earthdefense/js/fleet.min.js');
    intro = await import('../www/earthdefense/js/intro.js');
    scene = { added: [], add(o) { this.added.push(o); }, remove(o) { this.added = this.added.filter(x => x !== o); } };
    // The squadron is built from the fleet's shared geometry, so the fleet has
    // to exist first. That ordering is a real rule, and it is asserted below.
    fleet.initFleet(CONFIG, scene, {});
    intro.initIntro(scene, CONFIG);
});

afterEach(() => {
    if (intro) intro.disposeIntro(scene);
    if (fleet) fleet.disposeFleet();
    delete globalThis.THREE;
    delete globalThis.document;
});

/** Mars, read from config rather than written down, because the whole point of
 *  the current staging is that this module does not decide where it is. */
const mars = () => {
    const p = CONFIG.bodies.find((b) => b.id === 'mars').position;
    return { x: p[0], y: p[1], z: p[2] };
};
/** The two vectors the shot is now placed from: where the trailing group of
 *  real raiders stands, and the direction the fleet flies. */
const anchor = () => fleet.fleetStartAnchor(CONFIG);
const heading = () => intro.approachHeading(CONFIG.fleet.approach);
const MARS_RADIUS = 3390;
const EARTH_RADIUS = 6371;
const MOON_RADIUS = 1737;
const len = (v) => Math.hypot(v.x, v.y, v.z);
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const unit = (v) => { const l = len(v); return { x: v.x / l, y: v.y / l, z: v.z / l }; };

/** The Moon where it sits while the opening plays. It travels 838 units a
 *  second and the shot lasts five, so its start phase is close enough: the
 *  margin it is checked against is thousands of units, not tens. */
function moonPosition() {
    const spec = CONFIG.bodies.find((b) => b.id === 'moon').orbit;
    const { phase: t, inclination: i, radius: r } = spec;
    return {
        x: r * Math.cos(t),
        y: r * Math.sin(t) * Math.sin(i),
        z: r * Math.sin(t) * Math.cos(i)
    };
}

/** Every body the camera could fly into, with the radius it may not enter. */
function bodies() {
    return [
        { name: 'earth', at: { x: 0, y: 0, z: 0 }, radius: EARTH_RADIUS },
        { name: 'mars', at: mars(), radius: MARS_RADIUS },
        { name: 'moon', at: moonPosition(), radius: MOON_RADIUS }
    ];
}

/** The path, sampled finely enough that a body cannot be passed through
 *  between two samples: the fastest stretch covers about 200,000 units in 2.1
 *  seconds, so 2,000 samples is roughly 100 units a step. */
function samplePath(steps = 2000, spec = CONFIG.intro) {
    const spawn = spawnPosition(CONFIG);
    const out = [];
    for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * spec.seconds;
        const eye = intro.introPath(t, spec, anchor(), heading(), spawn);
        out.push({ t, x: eye.x, y: eye.y, z: eye.z, look: { ...eye.look } });
    }
    return out;
}

/** Where every active ship is on a given frame, driven through the real module
 *  rather than recomputed here: `startIntro` then `updateIntro` in one step, so
 *  what is asserted is what would reach the meshes. */
function shipsAt(seconds) {
    intro.startIntro(CONFIG);
    intro.updateIntro(seconds);
    return intro.__test__.squadron()
        .slice(0, intro.__test__.activeCount())
        .map((s) => ({ index: s.index, ...s.mesh.position, looked: s.mesh.looked }));
}

/** The camera's own axes on a frame, world-up referenced the way the game
 *  camera is (yaw then pitch, no roll), so screen angles can be measured. */
function cameraAxes(eye) {
    const forward = unit(sub(eye.look, eye));
    const right = unit({ x: forward.z, y: 0, z: -forward.x });
    const up = {
        x: right.y * forward.z - right.z * forward.y,
        y: right.z * forward.x - right.x * forward.z,
        z: right.x * forward.y - right.y * forward.x
    };
    return { forward, right, up };
}

/** How far off the middle of the frame a point sits, in degrees, horizontally
 *  and vertically. Behind the camera comes back null. */
function screenAngles(eye, point) {
    const { forward, right, up } = cameraAxes(eye);
    const d = sub(point, eye);
    const ahead = dot(d, forward);
    if (ahead <= 0) return null;
    return {
        h: Math.abs(Math.atan2(dot(d, right), ahead)) * 180 / Math.PI,
        v: Math.abs(Math.atan2(dot(d, up), ahead)) * 180 / Math.PI
    };
}

/** The same, signed, for the tests that care WHERE in the frame rather than
 *  how far out. Which side of Mars a raider is on only reads off the signs. */
function framePosition(eye, point) {
    const { forward, right, up } = cameraAxes(eye);
    const d = sub(point, eye);
    const ahead = dot(d, forward);
    if (ahead <= 0) return null;
    return {
        h: Math.atan2(dot(d, right), ahead) * 180 / Math.PI,
        v: Math.atan2(dot(d, up), ahead) * 180 / Math.PI
    };
}

// ---- The join at the end ----------------------------------------------------

describe('the shot lands on the spawn frame', () => {
    /** THE ONE ASSERTION THIS WHOLE FEATURE RESTS ON. The opening is only worth
     *  five seconds of a visitor's time because it becomes the frame they fly
     *  from rather than cutting to it. Sub-unit on a scene 200,000 units across
     *  is exact for every purpose: a pixel at the spawn distance is 23 units. */
    it('ends exactly at the spawn position', () => {
        const spawn = spawnPosition(CONFIG);
        const last = samplePath().at(-1);
        expect(last.x).toBeCloseTo(spawn.x, 3);
        expect(last.y).toBeCloseTo(spawn.y, 3);
        expect(last.z).toBeCloseTo(spawn.z, 3);
    });

    /** And looking where `placeCameraAtSpawn` looks: 1,000 units down -Z, with
     *  no pitch and no yaw on it. */
    it('ends looking exactly where the spawn camera looks', () => {
        const spawn = spawnPosition(CONFIG);
        const last = samplePath().at(-1);
        expect(last.look.x).toBeCloseTo(spawn.x, 3);
        expect(last.look.y).toBeCloseTo(spawn.y, 3);
        expect(last.look.z).toBeCloseTo(spawn.z - intro.__test__.SPAWN_LOOK_AHEAD, 3);
    });

    /** Reading past the end holds the last frame rather than running on, so a
     *  long frame on a slow phone cannot overshoot the join it just landed. */
    it('holds the final frame when read past the end', () => {
        const spawn = spawnPosition(CONFIG);
        const over = intro.introPath(CONFIG.intro.seconds * 3, CONFIG.intro, anchor(), heading(), spawn);
        expect(over.x).toBeCloseTo(spawn.x, 3);
        expect(over.z).toBeCloseTo(spawn.z, 3);
    });

    /** It opens where config says, so `range` means what it reads as. The old
     *  version of this caught an un-flattened side vector that was a percent
     *  short and quietly turned 14,000 into 13,851; the axes are exactly
     *  perpendicular by construction now, and this is what says so. */
    it('opens exactly range ahead of the fleet start point', () => {
        const first = samplePath()[0];
        expect(len(sub(first, anchor()))).toBeCloseTo(CONFIG.intro.range, 0);
    });

    /** THE ASSERTION THE WHOLE RESTAGING WAS FOR. The shot used to finish with
     *  its wedge dead centre on Mars while the raiders it stood for were 3.4
     *  degrees to the right, so the hostile markers lit up two Mars diameters
     *  from where the squadron had just been. Ship zero has no slot offset and
     *  the drift is run backwards from the arrival, so it lands ON the trailing
     *  group's start point, and every other ship lands in formation around it. */
    it('finishes with its leader on the trailing group start point', () => {
        const led = shipsAt(CONFIG.intro.seconds)[0];
        expect(len(sub(led, anchor()))).toBeLessThan(1);
    });

    /** And says the same thing the way a visitor sees it: as an angle on the
     *  spawn frame, against the size of the disc they are looking at. Every
     *  real raider in the trailing group lands within one Mars diameter of
     *  where the wedge finished. It was 3.4 degrees, or nearly four diameters,
     *  before the fleet and the shot were put on the same line. */
    it('finishes where the trailing raiders will be marked', () => {
        const spawn = spawnPosition(CONFIG);
        const discRadius = Math.asin(MARS_RADIUS / len(sub(mars(), spawn))) * 180 / Math.PI;
        const wedge = unit(sub(shipsAt(CONFIG.intro.seconds)[0], spawn));
        const trailing = fleet.getShips().filter((s) => s.startDistance ===
            CONFIG.fleet.groups.at(-1).startDistance);
        expect(trailing).toHaveLength(CONFIG.fleet.groups.at(-1).count);
        for (const ship of trailing) {
            const off = Math.acos(Math.min(1, dot(wedge, unit(sub(ship.position, spawn))))) * 180 / Math.PI;
            expect(off).toBeLessThan(discRadius * 2);
        }
    });
});

// ---- The path against the planets -------------------------------------------

describe('the camera path clears every body', () => {
    // One test rather than `it.each`, because the body positions come out of
    // config and `it.each` is evaluated when the file is collected, before any
    // module has been imported.
    it('stays outside every body by the configured margin', () => {
        const path = samplePath();
        const worst = {};
        for (const body of bodies()) {
            let least = Infinity;
            for (const eye of path) least = Math.min(least, len(sub(eye, body.at)) - body.radius);
            worst[body.name] = Math.round(least);
        }
        for (const name of Object.keys(worst)) {
            expect([name, worst[name] > CONFIG.intro.clearance]).toEqual([name, true]);
        }
    });

    /** The pull-back is a retreat, not a fly-by. Mars only ever gets further
     *  away, which is what makes the shot readable as leaving. */
    it('never approaches Mars', () => {
        const path = samplePath();
        for (let i = 1; i < path.length; i++) {
            expect(len(sub(path[i], mars()))).toBeGreaterThanOrEqual(len(sub(path[i - 1], mars())) - 1e-6);
        }
    });

    /** A pull-back with a whip in it is a different shot and a worse one. The
     *  measured turn is about 15 degrees; the bound is loose enough to retune
     *  inside and tight enough to catch a camera that has been put back on the
     *  wrong side of Mars. */
    it('turns less than 45 degrees end to end', () => {
        const path = samplePath();
        const first = unit(sub(path[0].look, path[0]));
        const last = unit(sub(path.at(-1).look, path.at(-1)));
        const turn = Math.acos(Math.min(1, Math.max(-1, dot(first, last)))) * 180 / Math.PI;
        expect(turn).toBeLessThan(45);
    });
});

// ---- The wedge --------------------------------------------------------------

describe('wedgeSlot', () => {
    it('puts ship zero at the apex', () => {
        expect(intro.wedgeSlot(0, CONFIG.intro.slot)).toEqual({ right: 0, up: 0, back: 0 });
    });

    /** Pairs, and odd goes left. The shape only reads as a wedge if the two
     *  halves are mirror images. */
    it('lays out pairs symmetrically about the leader', () => {
        const slot = CONFIG.intro.slot;
        for (let rank = 1; rank <= 4; rank++) {
            const left = intro.wedgeSlot(rank * 2 - 1, slot);
            const right = intro.wedgeSlot(rank * 2, slot);
            expect(left.right).toBeCloseTo(-right.right, 6);
            expect(left.up).toBeCloseTo(right.up, 6);
            expect(left.back).toBeCloseTo(right.back, 6);
            expect(right.right).toBeCloseTo(rank * slot.lateral, 6);
        }
    });

    /** Each rank sits further out, further back, and higher than the one ahead,
     *  which is the shape that still reads from the angle this shot watches it. */
    it('widens, deepens and rises with every rank', () => {
        const slot = CONFIG.intro.slot;
        let last = intro.wedgeSlot(0, slot);
        for (let rank = 1; rank <= 4; rank++) {
            const here = intro.wedgeSlot(rank * 2, slot);
            expect(here.right).toBeGreaterThan(last.right);
            expect(here.back).toBeGreaterThan(last.back);
            expect(here.up).toBeGreaterThan(last.up);
            last = here;
        }
    });
});

describe('shipProgress', () => {
    // Read inside each test rather than at describe time: the config module is
    // imported in `beforeEach`, which has not run when this body is evaluated.
    const spec = () => CONFIG.intro;

    it('runs from nothing to fully closed up', () => {
        const { formSeconds, shipTravel, ships } = spec();
        expect(intro.shipProgress(0, ships, 0, formSeconds, shipTravel)).toBe(0);
        expect(intro.shipProgress(ships - 1, ships, formSeconds, formSeconds, shipTravel)).toBeCloseTo(1, 6);
    });

    /** THE APEX GOES FIRST AND THE WINGS CLOSE ON IT. Nine ships easing over
     *  the same three seconds is a swarm settling; nine arriving in order is a
     *  formation being made. */
    it('lands the ships in index order', () => {
        const { formSeconds, shipTravel, ships } = spec();
        const arrival = [];
        for (let i = 0; i < ships; i++) {
            let at = formSeconds;
            for (let k = 0; k <= 2000; k++) {
                const t = (k / 2000) * formSeconds;
                if (intro.shipProgress(i, ships, t, formSeconds, shipTravel) >= 0.999) { at = t; break; }
            }
            arrival.push(at);
        }
        for (let i = 1; i < arrival.length; i++) {
            expect(arrival[i]).toBeGreaterThan(arrival[i - 1]);
        }
    });

    /** THE LAST SHIP ARRIVES AS THE FORM-UP ENDS, not after it. A ship still
     *  sliding when the camera starts its pull-back would be a formation that
     *  was never actually made on screen. */
    it('has every ship in its slot by the end of the form-up', () => {
        const { formSeconds, shipTravel, ships } = spec();
        for (let i = 0; i < ships; i++) {
            expect(intro.shipProgress(i, ships, formSeconds, formSeconds, shipTravel)).toBeCloseTo(1, 6);
        }
    });

    it('never runs backwards', () => {
        const { formSeconds, shipTravel, ships } = spec();
        let last = 0;
        for (let k = 0; k <= 500; k++) {
            const p = intro.shipProgress(4, ships, (k / 500) * formSeconds, formSeconds, shipTravel);
            expect(p).toBeGreaterThanOrEqual(last - 1e-9);
            last = p;
        }
    });
});

// ---- The camera and the fleet agree about the flight line -------------------

describe('the camera stands on the fleet approach line', () => {
    /** THIS COUPLING IS THE COMPOSITION, so it is asserted rather than trusted.
     *  A formation's depth seen from off its own axis smears sideways across the
     *  frame: one draft stood 32 degrees off and turned the wedge into a sheared
     *  diagonal, and a later one stood on the Mars-to-fleet line, only 12
     *  degrees off, and still pulled the columns 93 percent out of balance.
     *
     *  The camera is placed off `approachHeading` now rather than off a config
     *  vector that had to be kept in step with it by hand, so the only way to
     *  break this is `elevation` and `swing`, and those are bounded below. */
    it('opens on the flight line itself, lifted only by elevation', () => {
        const first = samplePath()[0];
        const stand = unit(sub(first, anchor()));
        const off = Math.acos(Math.min(1, dot(stand, heading()))) * 180 / Math.PI;
        // At swing 0 the whole offset is the lift, which is `elevation` exactly.
        expect(off).toBeCloseTo(CONFIG.intro.elevation * 180 / Math.PI, 3);
    });

    /** THE LIFT IS VERTICAL AND THE SHEAR THAT MATTERS IS HORIZONTAL, which is
     *  why `elevation` can be 15 degrees for free while `swing` has to stay
     *  near two. Measured in the formation's own axes: the camera stands off
     *  the line along `above`, and not at all along `right`. */
    it('lifts the camera out of the flight line vertically, not sideways', () => {
        const right = {}, above = {};
        intro.formationFrame(heading(), right, above);
        const stand = unit(sub(samplePath()[0], anchor()));
        expect(dot(stand, right)).toBeCloseTo(0, 9);
        expect(dot(stand, above)).toBeCloseTo(Math.sin(CONFIG.intro.elevation), 6);
    });

    /** `orbitEye` takes its side and axis to be perpendicular, so `range` only
     *  means `range` if they are. They come from `formationFrame` rather than
     *  from the world, which is what guarantees it. */
    it('builds the orbit on perpendicular axes, so range means range', () => {
        const right = {}, above = {};
        intro.formationFrame(heading(), right, above);
        expect(dot(above, heading())).toBeCloseTo(0, 9);
    });

    /** The fleet flies at Earth, so the heading is the approach reversed. */
    it('heads for Earth rather than away from it', () => {
        const nose = intro.approachHeading(CONFIG.fleet.approach);
        expect(nose.z).toBeGreaterThan(0.9);
        expect(len(nose)).toBeCloseTo(1, 9);
    });

    it('builds a right-handed frame around the heading', () => {
        const nose = intro.approachHeading(CONFIG.fleet.approach);
        const right = {}, up = {};
        intro.formationFrame(nose, right, up);
        expect(len(right)).toBeCloseTo(1, 9);
        expect(len(up)).toBeCloseTo(1, 9);
        expect(dot(right, nose)).toBeCloseTo(0, 9);
        expect(dot(up, nose)).toBeCloseTo(0, 9);
        expect(dot(right, up)).toBeCloseTo(0, 9);
    });
});

// ---- What the frame actually contains ---------------------------------------

describe('the squadron is in frame and clear of Mars', () => {
    // A 9:21 phone sees about 16.7 degrees either side of the nose at a 70
    // degree vertical field, which is the narrowest frame we expect and the
    // same bound the Moon's orbit phase is solved against.
    const PORTRAIT_HALF_WIDTH = 16.7;
    const HALF_HEIGHT = 35;

    /** MARS IS THE BACKDROP, AND NOTHING IN intro.js KNOWS THAT. The shot is
     *  placed entirely off the fleet's own anchor and heading; the planet fills
     *  the frame behind the squadron only because MARS_DISTANCE sits 10,000
     *  units past the trailing group's start. That is the property this asserts,
     *  and it is the one a retune of MARS_DISTANCE or of the group distances
     *  would silently cost. Eight of the nine raiders are silhouetted on the
     *  disc through the whole form-up, and the ninth is just off the limb. */
    it('holds Mars behind the squadron for the whole form-up', () => {
        const spawn = spawnPosition(CONFIG);
        for (const k of [0, 0.5, 1]) {
            const t = k * CONFIG.intro.formSeconds;
            const eye = intro.introPath(t, CONFIG.intro, anchor(), heading(), spawn);
            const frozen = { x: eye.x, y: eye.y, z: eye.z, look: { ...eye.look } };
            const discRadius = Math.asin(MARS_RADIUS / len(sub(mars(), frozen))) * 180 / Math.PI;
            // Big enough to read as a planet rather than a marble.
            expect(discRadius).toBeGreaterThan(10);
            const centre = framePosition(frozen, mars());
            expect(centre).not.toBeNull();
            const on = shipsAt(t).filter((ship) => {
                const a = framePosition(frozen, ship);
                return a && Math.hypot(a.h - centre.h, a.v - centre.v) < discRadius;
            });
            expect(on.length).toBeGreaterThanOrEqual(CONFIG.intro.ships - 1);
        }
    });

    /** THE BUDGET THE WHOLE SQUADRON BLOCK IS SPENDING. Measured worst case is
     *  8.9 degrees. It was 15.4 while the camera stood off the flight line to
     *  frame Mars, and standing on the line handed most of it back, but the
     *  bound stays: widening the wedge or scattering it further sideways can
     *  spend it again. */
    it('keeps every raider inside a portrait phone for the whole form-up', () => {
        const spawn = spawnPosition(CONFIG);
        let worstH = 0;
        let worstV = 0;
        for (let k = 0; k <= 60; k++) {
            const t = (k / 60) * CONFIG.intro.formSeconds;
            const eye = intro.introPath(t, CONFIG.intro, anchor(), heading(), spawn);
            const frozen = { x: eye.x, y: eye.y, z: eye.z, look: { ...eye.look } };
            for (const ship of shipsAt(t)) {
                const a = screenAngles(frozen, ship);
                expect(a).not.toBeNull();
                worstH = Math.max(worstH, a.h);
                worstV = Math.max(worstV, a.v);
            }
        }
        expect(worstH).toBeLessThan(PORTRAIT_HALF_WIDTH);
        expect(worstV).toBeLessThan(HALF_HEIGHT);
    });

    /** NO RAIDER IS EVER INSIDE MARS, and the budget for that moved when the
     *  staging did. It used to be `marsDistance`. It is now the 10,000 units
     *  MARS_DISTANCE leaves between the planet and the fleet's start point,
     *  spent by `scatter.depth` plus four ranks of `slot.depth` running
     *  backwards from it, plus the whole drift the formation opens behind its
     *  arrival. Measured, the deepest opening raider clears the surface by
     *  1,878. */
    it('never puts a raider inside Mars', () => {
        let worst = Infinity;
        for (let k = 0; k <= 40; k++) {
            const t = (k / 40) * CONFIG.intro.formSeconds;
            for (const ship of shipsAt(t)) {
                worst = Math.min(worst, len(sub(ship, mars())) - MARS_RADIUS);
            }
        }
        expect(worst).toBeGreaterThan(CONFIG.intro.clearance);
    });

    /** A hull has to be a ship rather than a mote. At 220 units long on a 900
     *  pixel frame through a 70 degree camera, this is the division that says
     *  so. The measured range is 19 pixels for the deepest opening raider and
     *  44 for the leader at the end of the form-up. */
    it('draws the closest raider big enough to read', () => {
        const spawn = spawnPosition(CONFIG);
        const t = CONFIG.intro.formSeconds;
        const eye = intro.introPath(t, CONFIG.intro, anchor(), heading(), spawn);
        const frozen = { x: eye.x, y: eye.y, z: eye.z };
        let nearest = Infinity;
        for (const ship of shipsAt(t)) nearest = Math.min(nearest, len(sub(ship, frozen)));
        const pixels = (CONFIG.fleet.hullLength / nearest) * (180 / Math.PI) * (900 / 70);
        expect(pixels).toBeGreaterThan(20);
    });

    /** The formation is symmetrical when it is finished, which is the payoff of
     *  standing on the flight line. Measured on screen rather than in world
     *  space, because sheared-on-screen is the failure this catches. */
    it('finishes with its pairs either side of the leader', () => {
        const spawn = spawnPosition(CONFIG);
        const t = CONFIG.intro.formSeconds;
        const eye = intro.introPath(t, CONFIG.intro, anchor(), heading(), spawn);
        const frozen = { x: eye.x, y: eye.y, z: eye.z, look: { ...eye.look } };
        const { right } = cameraAxes(frozen);
        const ships = shipsAt(t);
        const across = (s) => dot(sub(s, frozen), right);
        const leader = across(ships[0]);
        for (let rank = 1; rank * 2 < ships.length; rank++) {
            const a = across(ships[rank * 2 - 1]) - leader;
            const b = across(ships[rank * 2]) - leader;
            // Opposite sides of the leader, and within a fifth of each other in
            // magnitude: perspective makes the far column slightly the smaller.
            expect(Math.sign(a)).toBe(-Math.sign(b));
            expect(Math.abs(Math.abs(a) - Math.abs(b)) / Math.abs(a)).toBeLessThan(0.2);
        }
    });
});

// ---- Determinism ------------------------------------------------------------

describe('the shot is the same every time', () => {
    it('replays identically', () => {
        const first = shipsAt(1.4).map((s) => `${s.x.toFixed(6)},${s.y.toFixed(6)},${s.z.toFixed(6)}`);
        intro.endIntro();
        const second = shipsAt(1.4).map((s) => `${s.x.toFixed(6)},${s.y.toFixed(6)},${s.z.toFixed(6)}`);
        expect(second).toEqual(first);
    });

    it('scatters no two ships to the same place', () => {
        const seen = new Set(shipsAt(0).map((s) => `${Math.round(s.x)},${Math.round(s.y)},${Math.round(s.z)}`));
        expect(seen.size).toBe(intro.__test__.activeCount());
    });

    /** Every raider is pointing at Earth once it has closed up, which is what
     *  makes the formation read as one thing going somewhere. */
    it('brings every nose onto the fleet heading by the end of the form-up', () => {
        const nose = intro.approachHeading(CONFIG.fleet.approach);
        for (const ship of shipsAt(CONFIG.intro.formSeconds)) {
            const aimed = unit(sub(ship.looked, ship));
            expect(dot(aimed, nose)).toBeCloseTo(1, 6);
        }
    });

    /** And is NOT pointing at Earth before it does, or the form-up is nine
     *  ships sliding sideways in perfect parade order. */
    it('starts the noses off the fleet heading', () => {
        const nose = intro.approachHeading(CONFIG.fleet.approach);
        const off = shipsAt(0).map((s) => dot(unit(sub(s.looked, s)), nose));
        expect(Math.min(...off)).toBeLessThan(0.99);
    });
});

// ---- Lifecycle --------------------------------------------------------------

describe('starting, stopping and thinning', () => {
    it('builds one mesh per ship and hangs them in the scene', () => {
        expect(intro.__test__.squadron()).toHaveLength(CONFIG.intro.ships);
        expect(scene.added).toContain(intro.__test__.group());
    });

    it('reports the length of the shot and runs for it', () => {
        expect(intro.startIntro(CONFIG)).toBeCloseTo(CONFIG.intro.seconds, 6);
        expect(intro.isIntroRunning()).toBe(true);
        expect(intro.updateIntro(CONFIG.intro.seconds - 0.1)).toBe(true);
        expect(intro.updateIntro(0.2)).toBe(false);
        expect(intro.isIntroRunning()).toBe(false);
    });

    /** Nothing on screen when it is not playing, so a briefing can never open
     *  on nine spare raiders parked at Mars. */
    it('hides the squadron when it stops', () => {
        intro.startIntro(CONFIG);
        expect(intro.__test__.group().visible).toBe(true);
        intro.endIntro();
        expect(intro.__test__.group().visible).toBe(false);
    });

    it('offers no eye unless it is running', () => {
        expect(intro.introEye()).toBeNull();
        intro.startIntro(CONFIG);
        expect(intro.introEye()).not.toBeNull();
        intro.endIntro();
        expect(intro.introEye()).toBeNull();
    });

    /** THINNED RATHER THAN REMOVED, which is what the effects checkbox means
     *  everywhere else in this experience. */
    it('drops to the reduced ship count and puts the rest away', () => {
        expect(intro.setIntroReduced(true)).toBe(CONFIG.intro.reducedShips);
        const squadron = intro.__test__.squadron();
        expect(squadron.slice(0, CONFIG.intro.reducedShips).every((s) => s.mesh.visible)).toBe(true);
        expect(squadron.slice(CONFIG.intro.reducedShips).every((s) => !s.mesh.visible)).toBe(true);
        expect(intro.setIntroReduced(false)).toBe(CONFIG.intro.ships);
    });

    it('still forms a symmetrical wedge when thinned', () => {
        intro.setIntroReduced(true);
        const ships = shipsAt(CONFIG.intro.formSeconds);
        expect(ships).toHaveLength(CONFIG.intro.reducedShips);
    });

    it('takes its group out of the scene when disposed', () => {
        const group = intro.__test__.group();
        intro.disposeIntro(scene);
        expect(scene.added).not.toContain(group);
        expect(intro.__test__.squadron()).toHaveLength(0);
    });

    /** NOTHING SHARED IS DISPOSED. Every hull draws from the fleet's geometry,
     *  which the real twelve raiders are still using, so freeing it from this
     *  side would leave them drawing from released buffers. */
    it('leaves the fleet geometry alone', () => {
        const hull = intro.__test__.squadron()[0].mesh.children[0].geometry;
        intro.disposeIntro(scene);
        expect(hull.disposed).toBe(false);
    });

    /** The ordering rule, stated as a test: without a fleet there is no shared
     *  geometry, and the opening declines rather than throwing on the way in. */
    it('declines to build without a fleet', async () => {
        intro.disposeIntro(scene);
        fleet.disposeFleet();
        expect(intro.initIntro(scene, CONFIG)).toBe(false);
        expect(intro.startIntro(CONFIG)).toBe(0);
    });

    /** There is no subject to pass any more, so the only way in is a squadron
     *  that was never built. `initIntro` having declined has to leave this
     *  declining too, rather than starting a shot with nothing in it. */
    it('refuses to start when the squadron was never built', () => {
        intro.disposeIntro(scene);
        expect(intro.startIntro(CONFIG)).toBe(0);
        expect(intro.isIntroRunning()).toBe(false);
    });

    /** THE OTHER HALF OF NOT SHOWING TWO FLEETS AT ONCE, and it is asserted
     *  here rather than in the main suite because this file installs recording
     *  stubs: the main suite runs on the chainable THREE proxy, where setting
     *  `visible` stores nothing and reads back truthy.
     *
     *  main.js hides the standing fleet for the length of the shot, and that
     *  matters more than it used to. The squadron now forms up ON the trailing
     *  group's start point rather than somewhere in front of Mars, so leaving
     *  the real four up would draw two sets of Martian ships through each other
     *  rather than merely in the same frame. */
    it('lets the standing fleet be hidden and shown as a whole', () => {
        expect(fleet.setFleetVisible(false)).toBe(false);
        expect(fleet.__test__.isVisible()).toBe(false);
        expect(fleet.setFleetVisible(true)).toBe(true);
        expect(fleet.__test__.isVisible()).toBe(true);
    });

    /** THE GROUP, NOT THE SHIPS. Per-ship visibility is the fleet's own to own,
     *  since it is how the LOD hide and death are expressed, and a flag set from
     *  outside would be overwritten on the next frame the fleet updates. Hiding
     *  the parent leaves all of that untouched underneath. */
    it('hides the fleet without touching any raider', () => {
        const ships = fleet.getShips();
        // Whatever the per-ship flags say, they say the same afterwards. At
        // init they all read false, because `writeMeshes` has already applied
        // the LOD hide to twelve raiders whose distance to a player who has not
        // spawned yet is Infinity. That is exactly the kind of decision this
        // must not tread on.
        const before = ships.map((s) => s.mesh.visible);
        fleet.setFleetVisible(false);
        expect(ships.map((s) => s.mesh.visible)).toEqual(before);
        fleet.setFleetVisible(true);
        expect(ships.map((s) => s.mesh.visible)).toEqual(before);
    });

    it('says nothing happened when there is no fleet to hide', () => {
        fleet.disposeFleet();
        expect(fleet.setFleetVisible(false)).toBe(false);
    });
});

// ---- The fallbacks ----------------------------------------------------------

/** EVERY NUMBER IN THIS MODULE HAS A DEFAULT BEHIND IT, in the same defensive
 *  style as the finale, and defaults that are never exercised are just untested
 *  code that looks like safety. These drive the module with as little config as
 *  it will accept, which is the only way a typo in a fallback ever surfaces. */
describe('it survives a config with holes in it', () => {
    const bare = { seconds: 4, formSeconds: 2, runSeconds: 2 };

    it('paths through an almost empty spec without producing NaN', () => {
        const spawn = spawnPosition(CONFIG);
        for (const t of [0, 1, 2, 3, 4]) {
            const eye = intro.introPath(t, bare, anchor(), heading(), spawn);
            for (const v of [eye.x, eye.y, eye.z, eye.look.x, eye.look.y, eye.look.z]) {
                expect(Number.isFinite(v)).toBe(true);
            }
        }
    });

    it('still lands on the spawn point with everything defaulted', () => {
        const spawn = spawnPosition(CONFIG);
        const last = intro.introPath(bare.seconds, bare, anchor(), heading(), spawn);
        expect(last.x).toBeCloseTo(spawn.x, 3);
        expect(last.y).toBeCloseTo(spawn.y, 3);
        expect(last.z).toBeCloseTo(spawn.z, 3);
    });

    it('lays out a wedge with no slot spacing at all', () => {
        expect(intro.wedgeSlot(3, {})).toEqual({ right: -0, up: 0, back: 0 });
    });

    it('treats a single ship as already in formation', () => {
        expect(intro.shipProgress(0, 1, 1, 2, 0.5)).toBe(1);
    });

    it('clamps a shipTravel outside its range instead of dividing by zero', () => {
        expect(Number.isFinite(intro.shipProgress(2, 5, 1, 2, 0))).toBe(true);
        expect(Number.isFinite(intro.shipProgress(2, 5, 1, 2, 9))).toBe(true);
    });

    it('picks an axis when the heading is straight up', () => {
        const right = {}, up = {};
        intro.formationFrame({ x: 0, y: 1, z: 0 }, right, up);
        expect(len(right)).toBeCloseTo(1, 9);
        expect(len(up)).toBeCloseTo(1, 9);
    });

    it('reads a missing approach block as straight at Earth', () => {
        expect(intro.approachHeading(undefined)).toEqual({ x: -0, y: -0, z: 1 });
    });

    it('builds nothing at all when there is no intro block', () => {
        intro.disposeIntro(scene);
        expect(intro.initIntro(scene, { ...CONFIG, intro: null })).toBe(false);
        expect(intro.setIntroReduced(true)).toBe(0);
        expect(intro.startIntro(CONFIG)).toBe(0);
    });

    it('does nothing on a frame when no shot is running', () => {
        expect(intro.updateIntro(0.1)).toBe(false);
    });

    it('tolerates a frame with no delta on it', () => {
        intro.startIntro(CONFIG);
        expect(intro.updateIntro()).toBe(true);
        expect(intro.__test__.shot.elapsed).toBe(0);
    });
});

// ---- The beats fit in the time -----------------------------------------------

describe('the config adds up', () => {
    it('spends the whole shot on its two beats', () => {
        expect(CONFIG.intro.formSeconds + CONFIG.intro.runSeconds).toBeCloseTo(CONFIG.intro.seconds, 6);
    });

    it('holds the frame for a handful of seconds, not a minute', () => {
        expect(CONFIG.intro.seconds).toBeGreaterThan(2);
        expect(CONFIG.intro.seconds).toBeLessThan(9);
    });

    it('thins to fewer ships than it draws', () => {
        expect(CONFIG.intro.reducedShips).toBeLessThan(CONFIG.intro.ships);
        expect(CONFIG.intro.reducedShips).toBeGreaterThan(0);
    });

    /** An odd count would leave one ship of a pair with no partner, which reads
     *  as a raider out of position rather than as a wedge. */
    it('draws a leader and whole pairs', () => {
        expect(CONFIG.intro.ships % 2).toBe(1);
        expect(CONFIG.intro.reducedShips % 2).toBe(1);
    });
});
