// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Geometry guard for the Earth Defense canopy (www/earthdefense/js/cockpit.js).
 *
 * The canopy is a judgement call made against screenshots, and it is expected
 * to take several passes before M7. What a test can do meanwhile is hold the
 * two constraints that judgement is NOT allowed to trade away, so a later pass
 * can move anything it likes and still be told the moment it breaks one:
 *
 *   1. THE CENTRE OF THE SCREEN IS THE WEAPON. There is no fire button, so the
 *      middle of the frame is where the shooting happens. No part of the
 *      canopy may come within 12 degrees of the nose, which is twice the six
 *      degree targeting cone and leaves the reticle sitting in clear space.
 *   2. THE CANOPY MUST NOT EAT EARTH'S LIMB in the opening frame (PRD 4.1).
 *      That frame is the pitch for the whole game and the cockpit's job there
 *      is to frame it, not to cover it.
 *
 * Both are asserted in DEGREES OFF THE NOSE rather than in overlay units,
 * because degrees are the unit the constraints are actually written in and
 * they survive any change to how far out the canopy plane sits.
 *
 * PORTRAIT IS CHECKED FIRST and is the tightest case (PRD G5, 4.1.1): the
 * frame is much taller than it is wide, so the struts sit closest to the nose
 * there. A canopy that clears the centre on a desktop can still crowd it on a
 * phone, which is exactly the regression this catches.
 */
import { jest } from '@jest/globals';

// ---- A recording THREE -----------------------------------------------------
//
// Real numbers rather than the shared chainable proxy, because every assertion
// here is a measurement and the proxy would cheerfully agree that all of them
// are zero.

class Vec3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
}

class Obj3D {
    constructor() {
        this.children = [];
        this.name = '';
        this.position = new Vec3();
        this.scale = new Vec3(1, 1, 1);
        this.rotation = { x: 0, y: 0, z: 0 };
    }
    add(o) { this.children.push(o); }
}

const disposed = { count: 0 };

function installThree() {
    disposed.count = 0;
    const disposable = () => ({ dispose() { disposed.count++; } });
    globalThis.THREE = {
        Scene: Obj3D,
        Group: Obj3D,
        Vector3: Vec3,
        Mesh: class extends Obj3D {
            constructor(g, m) { super(); this.geometry = g; this.material = m; }
        },
        BoxGeometry: function () { return disposable(); },
        MeshBasicMaterial: function (o) { return { ...o, ...disposable() }; }
    };
    globalThis.window = { innerWidth: 1280, innerHeight: 720 };
}

let mod;
let CONFIG;

beforeEach(async () => {
    installThree();
    jest.resetModules();
    ({ EARTHDEFENSE_CONFIG: CONFIG } = await import('../www/earthdefense/js/config.js'));
    mod = await import('../www/earthdefense/js/cockpit.js');
});

afterEach(() => {
    if (mod) mod.disposeCockpit();
    delete globalThis.THREE;
    delete globalThis.window;
});

const DEG = 180 / Math.PI;

// The three shapes that matter, tightest first.
const ASPECTS = {
    'a portrait phone': 9 / 19.5,
    'a landscape phone': 19.5 / 9,
    'a wide desktop': 16 / 9
};

const byName = (name) => mod.getCanopy().children.find(c => c.name === name);
const visiblePieces = () => mod.getCanopy().children.filter(c => c.visible !== false);

/** How far off the nose a piece's NEAREST POINT sits, in degrees.
 *
 *  Measured as a true angular distance from the centre of the frame rather than
 *  along one axis, because that is the quantity the rule is actually about: the
 *  reticle sits at the centre and nothing may come within twelve degrees of it
 *  in ANY direction. The M4 version projected onto one axis per piece, which
 *  happened to be close enough for a dash and two struts and would have quietly
 *  stopped meaning anything the moment a piece was tilted.
 *
 *  The piece is a rectangle, so the nearest point is found by moving the nose
 *  into the rectangle's own frame, clamping it to the rectangle, and measuring
 *  from there. That handles rotation for free, which the flares need. */
function clearanceDegrees(mesh) {
    const rot = (mesh.rotation && mesh.rotation.z) || 0;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    // The nose, in the piece's local frame.
    const dx = -mesh.position.x, dy = -mesh.position.y;
    const localX = dx * cos + dy * sin;
    const localY = -dx * sin + dy * cos;

    const halfW = mesh.scale.x / 2, halfH = mesh.scale.y / 2;
    const clampedX = Math.max(-halfW, Math.min(halfW, localX));
    const clampedY = Math.max(-halfH, Math.min(halfH, localY));

    const distance = Math.hypot(localX - clampedX, localY - clampedY);
    return Math.atan(distance / Math.abs(mod.__test__.CANOPY_Z)) * DEG;
}

describe('the canopy keeps the centre of the screen clear', () => {
    // Comfortably more than twice the six degree targeting cone, so a target
    // sitting at the very edge of what the guns will take still has
    // canopy-free sky around it.
    const CLEAR_CONE = 12.5;

    for (const [name, aspect] of Object.entries(ASPECTS)) {
        test(`on ${name}`, () => {
            mod.initCockpit(CONFIG);
            mod.resizeCockpit(aspect);

            // EVERY piece, found by walking the canopy rather than by naming
            // them, so a pass that adds a piece is covered the moment it adds
            // it instead of the next time somebody remembers to list it here.
            const pieces = visiblePieces();
            expect(pieces.length).toBeGreaterThan(4);
            for (const piece of pieces) {
                // Named in the assertion, so a failure says WHICH piece
                // crowded the centre rather than only that something did.
                expect({ piece: piece.name, clearsTheReticle: clearanceDegrees(piece) > CLEAR_CONE })
                    .toEqual({ piece: piece.name, clearsTheReticle: true });
            }
        });
    }

    test('portrait is the tightest case, which is why it is designed for first', () => {
        mod.initCockpit(CONFIG);
        mod.resizeCockpit(ASPECTS['a portrait phone']);
        const portrait = clearanceDegrees(byName('strut-0'));
        mod.resizeCockpit(ASPECTS['a wide desktop']);
        const desktop = clearanceDegrees(byName('strut-0'));
        expect(portrait).toBeLessThan(desktop);
    });

    test('the clear cone is derived from the gun cone, not picked', () => {
        // If the targeting cone is ever opened up (the first lever if M4's gate
        // says automatic fire feels passive), this fails and says so rather
        // than letting the canopy quietly start crowding what can be shot.
        expect(CLEAR_CONE).toBeGreaterThan(CONFIG.targeting.coneRadians * DEG * 2);
    });
});

describe('the canopy does not obscure the opening frame', () => {
    test("Earth's limb sits well above the dash at spawn", () => {
        // From `spawn.distance` the planet's angular radius is asin(r/d), so
        // its near limb falls (axisAngle - that) below the nose. Derived from
        // config rather than hard-coded, so retuning the spawn at the M1 gate
        // re-checks this rather than quietly invalidating it.
        const earth = CONFIG.bodies.find(b => b.id === 'earth');
        const angularRadius = Math.asin(earth.radius / CONFIG.spawn.distance) * DEG;
        const limbBelowNose = CONFIG.spawn.axisAngle * DEG - angularRadius;

        mod.initCockpit(CONFIG);
        mod.resizeCockpit(ASPECTS['a portrait phone']);

        // Five degrees of daylight between the limb and the top of the dash.
        // Touching would be a pass on the letter of PRD 4.1 and a failure on
        // what it is for. The flares rise above the dash at the sides, so they
        // are held to the same line.
        expect(clearanceDegrees(byName('dash'))).toBeGreaterThan(limbBelowNose + 5);
        expect(clearanceDegrees(byName('dash-flare-0'))).toBeGreaterThan(limbBelowNose + 5);
        expect(clearanceDegrees(byName('dash-flare-1'))).toBeGreaterThan(limbBelowNose + 5);
    });

    test('the brow leaves the sky above Mars and the Moon open', () => {
        // Mars sits about two degrees off the nose and the Moon seven above it,
        // so the brow has to stay well clear of the upper middle of the frame
        // or the opening composition loses the two things it was built around.
        mod.initCockpit(CONFIG);
        mod.resizeCockpit(ASPECTS['a portrait phone']);
        expect(clearanceDegrees(byName('brow'))).toBeGreaterThan(20);
    });

    test('every proportion is a config number, so a design pass edits data', () => {
        // The canopy is judged against screenshots and expected to take several
        // passes. Each of these switches a piece off, which is the cheapest
        // thing a pass needs to be able to try.
        const bare = {
            ...CONFIG,
            cockpit: { ...CONFIG.cockpit, browFraction: 0, dashFlareAngle: 0, strutWidth: 0 }
        };
        mod.initCockpit(bare);
        mod.resizeCockpit(ASPECTS['a wide desktop']);

        expect(byName('brow').visible).toBe(false);
        expect(byName('dash-flare-0').visible).toBe(false);
        expect(byName('strut-0').visible).toBe(false);
        // And the dash, which has no off switch, is still there.
        expect(byName('dash').visible).not.toBe(false);
    });

    test('a config with the proportions missing falls back rather than making NaN', () => {
        mod.initCockpit({ space: CONFIG.space, cockpit: {} });
        mod.resizeCockpit(1.778);
        for (const piece of visiblePieces()) {
            expect(Number.isFinite(piece.scale.x)).toBe(true);
            expect(Number.isFinite(piece.position.y)).toBe(true);
        }
    });

    test('the struts lean in by a fixed fraction of the width, not a fixed angle', () => {
        // A fixed ANGLE looks right on a desktop and then swings a portrait
        // phone's struts a third of the way to the centre, because the frame is
        // so much taller than it is wide.
        mod.initCockpit(CONFIG);
        mod.resizeCockpit(ASPECTS['a portrait phone']);
        const portraitLean = byName('strut-0').rotation.z;
        mod.resizeCockpit(ASPECTS['a wide desktop']);
        const desktopLean = byName('strut-0').rotation.z;

        expect(portraitLean).toBeGreaterThan(0);
        expect(portraitLean).toBeLessThan(desktopLean);
        // Mirrored, so the pair is symmetrical.
        expect(byName('strut-1').rotation.z).toBeCloseTo(-desktopLean, 12);
    });

    test('the dash occupies the configured fraction of the frame and no more', () => {
        mod.initCockpit(CONFIG);
        mod.resizeCockpit(1.778);
        const fov = (CONFIG.space.overlayCamera.fov * Math.PI) / 180;
        const halfHeight = Math.abs(mod.__test__.CANOPY_Z) * Math.tan(fov / 2);
        expect(byName('dash').scale.y)
            .toBeCloseTo(halfHeight * 2 * CONFIG.cockpit.dashFraction, 10);
    });
});

describe('the muzzles', () => {
    /** A camera parked at the origin looking down -Z, so localToWorld is the
     *  identity and the local offsets come straight back out. */
    const identityCamera = { localToWorld: (v) => v };

    test('sit where config puts them, and are handed back as world points', () => {
        mod.initCockpit(CONFIG);
        const m = CONFIG.cockpit.muzzle;
        expect(mod.muzzleWorldPositions(identityCamera)).toEqual([
            { x: m.lateral, y: -m.drop, z: -m.forward },
            { x: -m.lateral, y: -m.drop, z: -m.forward }
        ]);
    });

    test('are in front of the world camera near plane, or no tracer is ever seen', () => {
        // The whole reason the offsets are so large. A muzzle closer than the
        // world camera's 100 unit near plane produces a tracer that is clipped
        // away until it is a hundred units out, so it appears from nowhere in
        // the middle of the frame instead of leaving the gun.
        expect(CONFIG.cockpit.muzzle.forward).toBeGreaterThan(CONFIG.space.worldCamera.near);
    });

    test('appear inside the frame even on the narrowest portrait phone', () => {
        // Three.js field of view is vertical, so the horizontal half-field is
        // the binding constraint on a tall screen. A 9:21 phone sees about
        // 16.7 degrees either side of the nose; a muzzle further out than that
        // fires from off-screen.
        const m = CONFIG.cockpit.muzzle;
        const fov = (CONFIG.space.worldCamera.fov * Math.PI) / 180;
        const halfHorizontal = Math.atan(Math.tan(fov / 2) * (9 / 21)) * DEG;

        expect(Math.atan(m.lateral / m.forward) * DEG).toBeLessThan(halfHorizontal);
        // And below the eye line, so tracers rise into the shot rather than
        // dropping out of the ceiling.
        expect(Math.atan(m.drop / m.forward) * DEG).toBeLessThan(CONFIG.space.worldCamera.fov / 2);
    });

    test('tracers converge, which is what sells a ship without modelling one', () => {
        // PRD 7. The two guns are toed IN, so their fire crosses somewhere
        // ahead rather than running parallel forever. Parallel tracers read as
        // two unrelated streaks; converging ones read as a ship with a nose
        // between them.
        mod.initCockpit(CONFIG);
        const [right, left] = mod.muzzleWorldPositions(identityCamera).map(m => ({ ...m }));
        // A target dead ahead at a typical engagement range.
        const target = { x: 0, y: 0, z: -3000 };

        const separationAtMuzzle = Math.abs(right.x - left.x);
        // A quarter of the way to the target, the two lines are already closer
        // together than they were at the guns.
        const at = (m, t) => ({ x: m.x + (target.x - m.x) * t, y: m.y + (target.y - m.y) * t });
        const quarter = Math.abs(at(right, 0.25).x - at(left, 0.25).x);

        expect(quarter).toBeLessThan(separationAtMuzzle);
        // And they meet AT the target rather than crossing well short of it,
        // which would put the crossing point in the visitor's face.
        expect(Math.abs(at(right, 1).x - at(left, 1).x)).toBeCloseTo(0, 6);
    });

    test('the guns sit in the LOWER corners of the view, at every shape', () => {
        // Tracers have to enter the frame from below and outboard, or they read
        // as dropping out of the ceiling. Checked in degrees, and against the
        // narrowest phone, because the horizontal half-field is what shrinks.
        const m = CONFIG.cockpit.muzzle;
        const fov = (CONFIG.space.worldCamera.fov * Math.PI) / 180;

        expect(m.drop).toBeGreaterThan(0);        // below the eye line
        expect(m.lateral).toBeGreaterThan(0);     // and outboard of it

        for (const aspect of Object.values(ASPECTS)) {
            const halfHorizontal = Math.atan(Math.tan(fov / 2) * aspect) * DEG;
            expect(Math.atan(m.lateral / m.forward) * DEG).toBeLessThan(halfHorizontal);
        }
        // Below the dash's top edge would hide the muzzle flash behind it, so
        // the drop stays inside the open part of the frame.
        mod.initCockpit(CONFIG);
        mod.resizeCockpit(ASPECTS['a portrait phone']);
        expect(Math.atan(m.drop / m.forward) * DEG)
            .toBeLessThan(clearanceDegrees(byName('dash')));
    });

    test('the returned array is reused rather than rebuilt every frame', () => {
        mod.initCockpit(CONFIG);
        const first = mod.muzzleWorldPositions(identityCamera);
        expect(mod.muzzleWorldPositions(identityCamera)).toBe(first);
    });

    test('a missing camera returns the array rather than throwing', () => {
        mod.initCockpit(CONFIG);
        expect(mod.muzzleWorldPositions(null)).toHaveLength(2);
    });

    test('asking before init returns the array rather than throwing', () => {
        expect(mod.muzzleWorldPositions(identityCamera)).toHaveLength(2);
    });
});

describe('lifecycle', () => {
    test('init returns an overlay scene holding one canopy group', () => {
        const scene = mod.initCockpit(CONFIG);
        expect(scene).toBe(mod.getCockpitScene());
        expect(scene.children).toEqual([mod.getCanopy()]);
        expect(mod.getCanopy().name).toBe('canopy');
        // Dash, its lit lip, two flares, the brow, two struts, and the glow.
        expect(mod.getCanopy().children).toHaveLength(8);
        expect(mod.getLocalMuzzles()).toHaveLength(2);
    });

    test('every piece shares one box geometry, so the canopy costs almost nothing', () => {
        mod.initCockpit(CONFIG);
        const geometries = new Set(mod.getCanopy().children.map(c => c.geometry));
        expect(geometries.size).toBe(1);
    });

    test('falls back to sensible values when config carries no cockpit block', () => {
        const bare = { space: CONFIG.space, cockpit: undefined };
        expect(() => mod.initCockpit(bare)).not.toThrow();
        expect(mod.getLocalMuzzles()).toHaveLength(2);
    });

    test('resizing before init is a no-op rather than a crash', () => {
        expect(() => mod.resizeCockpit(1.5)).not.toThrow();
    });

    test('resize with no aspect falls back to the window, then to 16:9', () => {
        mod.initCockpit(CONFIG);
        expect(() => mod.resizeCockpit()).not.toThrow();
        expect(mod.__test__.currentAspect()).toBeCloseTo(1280 / 720, 10);
        delete globalThis.window;
        expect(mod.__test__.currentAspect()).toBeCloseTo(16 / 9, 10);
    });

    test('the firing glow brightens and settles, and never on a missing canopy', () => {
        mod.initCockpit(CONFIG);
        const glow = byName('indicator-glow');
        mod.setCockpitFiring(true);
        const lit = glow.material.opacity;
        mod.setCockpitFiring(false);
        expect(lit).toBeGreaterThan(glow.material.opacity);

        mod.disposeCockpit();
        expect(() => mod.setCockpitFiring(true)).not.toThrow();
    });

    test('dispose releases every geometry and material, and is safe twice', () => {
        mod.initCockpit(CONFIG);
        disposed.count = 0;
        mod.disposeCockpit();
        // One shared box plus four materials: shell, strut, warm, and the edge.
        expect(disposed.count).toBe(5);
        expect(mod.getCockpitScene()).toBeNull();
        expect(() => mod.disposeCockpit()).not.toThrow();
    });

    test('re-initialising releases the previous canopy rather than leaking it', () => {
        mod.initCockpit(CONFIG);
        disposed.count = 0;
        mod.initCockpit(CONFIG);
        expect(disposed.count).toBe(5);
        expect(mod.getCanopy().children).toHaveLength(8);
    });
});
