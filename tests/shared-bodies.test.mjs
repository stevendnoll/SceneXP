// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Unit tests for www/shared/js/bodies-1.0.0.js — celestial bodies, circular
 * orbits, and tidal locking.
 *
 * The orbit maths is pure, so the valuable half of this suite is plain numbers
 * with no THREE involved at all. Two properties carry the module:
 *
 *   1. |position| is exactly the orbital radius for every angle and every
 *      inclination. An orbit that drifts would slowly walk the Moon into or
 *      away from Earth over a long session.
 *   2. Tidal lock holds the parent at a constant local bearing for the whole
 *      orbit. This is the one worth the most care: a sign error here is
 *      invisible for the first minute and then quietly shows the far side,
 *      taking the surface structures out of sight with it.
 *
 * The shell half runs under a small recording THREE for coverage and for the
 * parenting assertions.
 */
import { jest } from '@jest/globals';

// ---- A recording THREE ------------------------------------------------------

class Vec3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    normalize() {
        const l = Math.hypot(this.x, this.y, this.z) || 1;
        this.x /= l; this.y /= l; this.z /= l;
        return this;
    }
}

function installThree() {
    globalThis.THREE = {
        Group: class {
            constructor() {
                this.children = [];
                this.name = '';
                this.parent = null;
                this.position = new Vec3();
                // Records what it was asked to align, so the "stands upright"
                // assertion can check the real vectors.
                this.quaternion = {
                    setFromUnitVectors: (from, to) => { this.aligned = { from, to }; }
                };
            }
            add(o) { o.parent = this; this.children.push(o); }
        },
        SphereGeometry: class {
            constructor(r, w, h) { this.radius = r; this.widthSegments = w; this.heightSegments = h; this.disposed = 0; }
            dispose() { this.disposed++; }
        },
        MeshStandardMaterial: class {
            constructor(o) { Object.assign(this, o); this.disposed = 0; }
            dispose() { this.disposed++; }
        },
        ShaderMaterial: class {
            constructor(o) { Object.assign(this, o); this.disposed = 0; }
            dispose() { this.disposed++; }
        },
        Mesh: class {
            constructor(g, m) {
                this.geometry = g; this.material = m; this.name = '';
                this.position = new Vec3();
                this.rotation = { x: 0, y: 0, z: 0 };
                this.children = [];
                this.parent = null;
            }
            add(o) { o.parent = this; this.children.push(o); }
        },
        Vector3: Vec3,
        Color: class { constructor(hex) { this.hex = hex; } },
        TextureLoader: class {
            constructor(manager) { this.manager = manager; }
            load(url) { return { url, colorSpace: null, disposed: 0, dispose() { this.disposed++; } }; }
        },
        AdditiveBlending: 'additive',
        SRGBColorSpace: 'srgb'
    };
}

let mod;
beforeEach(async () => {
    installThree();
    jest.resetModules();
    mod = await import('../www/shared/js/bodies-1.0.0.js');
});

afterEach(() => {
    delete globalThis.THREE;
});

// A representative orbit: the Moon's, from the earthdefense config.
const MOON = { radius: 64000, period: 480, phase: -0.930, inclination: -0.199 };

// ---- orbitPositionAt --------------------------------------------------------

describe('orbitPositionAt', () => {
    test('starts at the phase angle', () => {
        const p = mod.orbitPositionAt(0, { radius: 100, period: 10, phase: 0, inclination: 0 });
        expect(p.x).toBeCloseTo(100);
        expect(p.y).toBeCloseTo(0);
        expect(p.z).toBeCloseTo(0);
    });

    test('is antipodal at half a period', () => {
        const spec = { radius: 100, period: 10, phase: 0.4, inclination: 0.3 };
        const a = mod.orbitPositionAt(0, spec);
        const b = mod.orbitPositionAt(5, spec);
        expect(b.x).toBeCloseTo(-a.x);
        expect(b.y).toBeCloseTo(-a.y);
        expect(b.z).toBeCloseTo(-a.z);
    });

    test('returns to the start after a full period', () => {
        const a = mod.orbitPositionAt(0, MOON);
        const b = mod.orbitPositionAt(MOON.period, MOON);
        expect(b.x).toBeCloseTo(a.x, 6);
        expect(b.y).toBeCloseTo(a.y, 6);
        expect(b.z).toBeCloseTo(a.z, 6);
    });

    test('holds the radius exactly, at every angle and inclination', () => {
        for (const inclination of [-0.6, -0.199, 0, 0.35, 1.2]) {
            for (let k = 0; k < 16; k++) {
                const p = mod.orbitPositionAt((MOON.period * k) / 16, { ...MOON, inclination });
                expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(MOON.radius, 6);
            }
        }
    });

    test('a zero inclination keeps the orbit flat in the XZ plane', () => {
        for (let k = 0; k < 8; k++) {
            const p = mod.orbitPositionAt(k * 13, { ...MOON, inclination: 0 });
            expect(p.y).toBeCloseTo(0, 9);
        }
    });

    test('inclination tilts the orbit, and its sign picks the side', () => {
        const up = mod.orbitPositionAt(0, { ...MOON, inclination: 0.199 });
        const down = mod.orbitPositionAt(0, { ...MOON, inclination: -0.199 });
        expect(Math.sign(up.y)).toBe(-Math.sign(down.y));
        expect(up.y).toBeCloseTo(-down.y);
    });

    test('the configured Moon phase lands it up and to the right of the nose', () => {
        // The opening frame depends on this: about 35 degrees right of -Z and
        // just above the horizon line, well clear of Earth's limb. If the phase
        // or inclination is retuned at the M1 gate, this assertion moves with
        // them on purpose.
        const p = mod.orbitPositionAt(0, MOON);
        expect(p.x).toBeGreaterThan(0);          // to the right
        expect(p.y).toBeGreaterThan(0);          // above the orbital plane
        expect(p.z).toBeLessThan(0);             // out toward Mars, not behind
    });

    test('tolerates a spec with no phase, inclination, or radius', () => {
        // toBeCloseTo rather than toEqual: a zero radius legitimately produces
        // signed zeros, and -0 is not a defect worth failing over.
        const p0 = mod.orbitPositionAt(3, {});
        expect(p0.x).toBeCloseTo(0);
        expect(p0.y).toBeCloseTo(0);
        expect(p0.z).toBeCloseTo(0);
        const p = mod.orbitPositionAt(0, { radius: 5, period: 1 });
        expect(p.x).toBeCloseTo(5);
    });
});

// ---- tidalYawAt -------------------------------------------------------------

/** Rotate a world-space vector into the local frame of a mesh yawed about Y.
 *  This is the transpose of three.js's Y rotation, which is what a mesh's
 *  world-to-local transform reduces to for a pure yaw. */
function worldToLocalY(v, yaw) {
    return {
        x: Math.cos(yaw) * v.x - Math.sin(yaw) * v.z,
        z: Math.sin(yaw) * v.x + Math.cos(yaw) * v.z
    };
}

describe('tidalYawAt', () => {
    test('holds the parent at a constant local bearing for the whole orbit', () => {
        // The property that matters, checked at eight points around the lap:
        // the parent must never drift sideways in the body's own frame.
        for (let k = 0; k < 8; k++) {
            const t = (MOON.period * k) / 8;
            const p = mod.orbitPositionAt(t, MOON);
            const yaw = mod.tidalYawAt(t, MOON);
            // The vector from the body to its parent, which sits at the origin.
            const local = worldToLocalY({ x: -p.x, z: -p.z }, yaw);
            expect(local.x).toBeCloseTo(0, 6);   // never swings off to a side
            expect(local.z).toBeLessThan(0);     // and always the same face
        }
    });

    test('the locked face is local -Z', () => {
        const p = mod.orbitPositionAt(120, MOON);
        const local = worldToLocalY({ x: -p.x, z: -p.z }, mod.tidalYawAt(120, MOON));
        expect(local.z).toBeCloseTo(-Math.hypot(p.x, p.z), 6);
    });

    test('tidalOffset spins which longitude faces the parent', () => {
        const base = mod.tidalYawAt(60, MOON);
        const offset = mod.tidalYawAt(60, { ...MOON, tidalOffset: 0.5 });
        expect(offset - base).toBeCloseTo(0.5);
    });

    test('advances through a full turn over one orbit', () => {
        const a = mod.tidalYawAt(0, MOON);
        const b = mod.tidalYawAt(MOON.period, MOON);
        expect(b).toBeCloseTo(a, 6);
    });
});

// ---- spinAt -----------------------------------------------------------------

describe('spinAt', () => {
    test('completes one turn per rotation period', () => {
        expect(mod.spinAt(0, 3600)).toBeCloseTo(0);
        expect(mod.spinAt(900, 3600)).toBeCloseTo(Math.PI / 2);
        expect(mod.spinAt(3600, 3600)).toBeCloseTo(Math.PI * 2);
    });

    test('a body with no rotation period does not spin', () => {
        expect(mod.spinAt(500, 0)).toBe(0);
        expect(mod.spinAt(500, undefined)).toBe(0);
    });

    test("Earth's configured hour keeps a surface point reachable across a long run", () => {
        // The M3 requirement, asserted here where the maths lives: twelve
        // minutes of play must not carry a structure more than a quarter turn
        // past the horizon, or it becomes impossible to defend.
        const degrees = (mod.spinAt(12 * 60, 3600) * 180) / Math.PI;
        expect(degrees).toBeLessThan(90);
    });
});

// ---- latLonToLocal ----------------------------------------------------------

describe('latLonToLocal', () => {
    const R = 100;
    const on = (p) => Math.hypot(p.x, p.y, p.z);

    test('the poles land on the axis', () => {
        expect(mod.latLonToLocal(90, 0, R).y).toBeCloseTo(R);
        expect(mod.latLonToLocal(-90, 0, R).y).toBeCloseTo(-R);
    });

    test('the equator sits in the XZ plane', () => {
        for (const lon of [-180, -90, 0, 90, 180]) {
            expect(mod.latLonToLocal(0, lon, R).y).toBeCloseTo(0, 9);
        }
    });

    test('every point is exactly on the surface', () => {
        for (const lat of [-90, -45, 0, 23.5, 60, 90]) {
            for (const lon of [-180, -90, 0, 45, 179]) {
                expect(on(mod.latLonToLocal(lat, lon, R))).toBeCloseTo(R, 6);
            }
        }
    });

    test('matches the SphereGeometry UV convention, so textures line up', () => {
        // Longitude 90 W, latitude 0 is +Z; 90 E is -Z. Get this backwards and
        // every installation stands in the wrong place on the map.
        const west = mod.latLonToLocal(0, -90, R);
        expect(west.z).toBeCloseTo(R);
        const east = mod.latLonToLocal(0, 90, R);
        expect(east.z).toBeCloseTo(-R);
    });

    test('the spawn sub-player point really is 60 N, 90 W', () => {
        // The whole structure layout is chosen around this point, so it is
        // worth pinning rather than trusting.
        const p = mod.latLonToLocal(60, -90, 1);
        expect(p.x).toBeCloseTo(0, 9);
        expect(p.y).toBeCloseTo(Math.sin(Math.PI / 3), 6);
        expect(p.z).toBeCloseTo(Math.cos(Math.PI / 3), 6);
    });

    test('height lifts a point off the surface along its own normal', () => {
        const surface = mod.latLonToLocal(30, 40, 100);
        const raised = mod.latLonToLocal(30, 40, 110);
        expect(on(raised)).toBeCloseTo(110);
        // Same direction, just further out.
        expect(raised.x / on(raised)).toBeCloseTo(surface.x / on(surface), 9);
    });
});

// ---- sphereOverlap and segmentHitsSphere ------------------------------------

describe('sphereOverlap', () => {
    const centre = { x: 0, y: 0, z: 0 };

    test('is zero outside and on the surface', () => {
        expect(mod.sphereOverlap({ x: 200, y: 0, z: 0 }, centre, 100)).toBe(0);
        expect(mod.sphereOverlap({ x: 100, y: 0, z: 0 }, centre, 100)).toBe(0);
    });

    test('reports how deep a point is, not merely that it is in', () => {
        expect(mod.sphereOverlap({ x: 60, y: 0, z: 0 }, centre, 100)).toBeCloseTo(40);
        expect(mod.sphereOverlap({ x: 0, y: 0, z: 0 }, centre, 100)).toBeCloseTo(100);
    });
});

describe('segmentHitsSphere', () => {
    const centre = { x: 0, y: 0, z: 0 };
    const R = 100;

    test('a segment passing clean through is a hit', () => {
        expect(mod.segmentHitsSphere({ x: -500, y: 0, z: 0 }, { x: 500, y: 0, z: 0 }, centre, R)).toBe(true);
    });

    test('a segment that misses to the side is not', () => {
        expect(mod.segmentHitsSphere({ x: -500, y: 200, z: 0 }, { x: 500, y: 200, z: 0 }, centre, R)).toBe(false);
    });

    test('a segment that STOPS SHORT of the sphere is not a hit', () => {
        // The case a ray test gets wrong, and the one that matters most: a
        // target standing in front of a planet must not read as hidden behind
        // it. The infinite line through these two points does hit the sphere.
        expect(mod.segmentHitsSphere({ x: -500, y: 0, z: 0 }, { x: -200, y: 0, z: 0 }, centre, R)).toBe(false);
    });

    test('a segment beginning beyond the sphere is not a hit either', () => {
        expect(mod.segmentHitsSphere({ x: 200, y: 0, z: 0 }, { x: 500, y: 0, z: 0 }, centre, R)).toBe(false);
    });

    test('an endpoint inside counts', () => {
        expect(mod.segmentHitsSphere({ x: -500, y: 0, z: 0 }, { x: 50, y: 0, z: 0 }, centre, R)).toBe(true);
        expect(mod.segmentHitsSphere({ x: 50, y: 0, z: 0 }, { x: 500, y: 0, z: 0 }, centre, R)).toBe(true);
    });

    test('a grazing tangent is not a hit', () => {
        expect(mod.segmentHitsSphere({ x: -500, y: R, z: 0 }, { x: 500, y: R, z: 0 }, centre, R)).toBe(false);
    });

    test('a zero-length segment falls back to a point test', () => {
        const p = { x: 10, y: 0, z: 0 };
        expect(mod.segmentHitsSphere(p, p, centre, R)).toBe(true);
        const out = { x: 500, y: 0, z: 0 };
        expect(mod.segmentHitsSphere(out, out, centre, R)).toBe(false);
    });
});

// ---- the shell --------------------------------------------------------------

describe('createBody', () => {
    test('builds a named textured sphere and adds it to the group', () => {
        const group = mod.initBodies({ groupName: 'orbit' });
        const mesh = mod.createBody({ id: 'earth', radius: 6371, segments: 128, texture: 'e.jpg' });
        expect(group.name).toBe('orbit');
        expect(group.children).toContain(mesh);
        expect(mesh.name).toBe('earth');
        expect(mesh.geometry.radius).toBe(6371);
        expect(mesh.geometry.widthSegments).toBe(128);
        expect(mesh.material.map.url).toBe('e.jpg');
    });

    test('tags colour maps as sRGB, or the planet renders washed out', () => {
        mod.initBodies();
        const mesh = mod.createBody({ id: 'mars', radius: 3390, texture: 'm.jpg' });
        expect(mesh.material.map.colorSpace).toBe('srgb');
    });

    test('places a body at its configured position, or the origin', () => {
        mod.initBodies();
        const mars = mod.createBody({ id: 'mars', radius: 3390, position: [0, 0, -200000] });
        const earth = mod.createBody({ id: 'earth', radius: 6371 });
        expect(mars.position).toMatchObject({ x: 0, y: 0, z: -200000 });
        expect(earth.position).toMatchObject({ x: 0, y: 0, z: 0 });
    });

    test('adds an atmosphere shell only when one is specified', () => {
        mod.initBodies();
        const bare = mod.createBody({ id: 'moon', radius: 1737 });
        const wrapped = mod.createBody({
            id: 'earth', radius: 6371,
            atmosphere: { scale: 1.025, color: 0x6aa9ff, intensity: 1.15, power: 2.6 }
        });
        expect(bare.children).toHaveLength(0);
        expect(wrapped.children).toHaveLength(1);
        expect(wrapped.children[0].name).toBe('atmosphere');
        // The shell must sit outside the surface or there is nothing to see.
        expect(wrapped.children[0].geometry.radius).toBeCloseTo(6371 * 1.025);
    });

    test('the atmosphere falls back to sensible defaults', () => {
        mod.initBodies();
        const mesh = mod.createBody({ id: 'earth', radius: 100, atmosphere: {} });
        const shell = mesh.children[0];
        expect(shell.geometry.radius).toBeCloseTo(102.5);
        expect(shell.material.uniforms.uPower.value).toBe(2.5);
        expect(shell.material.uniforms.uIntensity.value).toBe(1);
        expect(shell.material.depthWrite).toBe(false);
    });

    test('auto-initialises when createBody is called first', () => {
        const mesh = mod.createBody({ id: 'lone', radius: 1 });
        expect(mod.getBodiesGroup().children).toContain(mesh);
    });

    test('builds without a texture, and honours a tint', () => {
        mod.initBodies();
        const mesh = mod.createBody({ id: 'grey', radius: 10, tint: 0x884422 });
        expect(mesh.material.map).toBeUndefined();
        expect(mesh.material.color).toBe(0x884422);
    });

    test('passes the loading manager to the texture loader', () => {
        const manager = { tag: 'manager' };
        mod.initBodies({ manager });
        const mesh = mod.createBody({ id: 'earth', radius: 1, texture: 'e.jpg' });
        expect(mesh.material.map).toBeTruthy();
    });
});

describe('orbitBody and updateBodies', () => {
    function buildSystem() {
        mod.initBodies();
        mod.createBody({ id: 'earth', radius: 6371, rotationPeriod: 3600 });
        mod.createBody({ id: 'moon', radius: 1737 });
        mod.createBody({ id: 'mars', radius: 3390, position: [0, 0, -200000], rotationPeriod: 900 });
        mod.orbitBody('moon', 'earth', { ...MOON, tidalLock: true });
    }

    test('places an orbiting body immediately, without waiting for a tick', () => {
        buildSystem();
        const expected = mod.orbitPositionAt(0, MOON);
        expect(mod.getBody('moon').position.x).toBeCloseTo(expected.x);
        expect(mod.getBody('moon').position.z).toBeCloseTo(expected.z);
    });

    test('moves the orbiting body relative to its parent, not the origin', () => {
        mod.initBodies();
        mod.createBody({ id: 'host', radius: 1, position: [1000, 2000, 3000] });
        mod.createBody({ id: 'sat', radius: 1 });
        mod.orbitBody('sat', 'host', { radius: 50, period: 10, phase: 0, inclination: 0 });
        expect(mod.getBody('sat').position).toMatchObject({ x: 1050, y: 2000, z: 3000 });
    });

    test('advances the orbit over time and never lets it drift', () => {
        buildSystem();
        mod.updateBodies(120);
        const p = mod.getBody('moon').position;
        expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(MOON.radius, 3);
        expect(mod.getElapsed()).toBeCloseTo(120);
    });

    test('a tidally locked body takes its lock yaw and does NOT also spin', () => {
        buildSystem();
        mod.updateBodies(90);
        expect(mod.getBody('moon').rotation.y).toBeCloseTo(mod.tidalYawAt(90, MOON));
    });

    test('an unlocked body spins on its axis', () => {
        buildSystem();
        mod.updateBodies(900);
        expect(mod.getBody('mars').rotation.y).toBeCloseTo(mod.spinAt(900, 900));
        expect(mod.getBody('earth').rotation.y).toBeCloseTo(mod.spinAt(900, 3600));
    });

    test('an orbiting body without a lock still spins on its own period', () => {
        mod.initBodies();
        mod.createBody({ id: 'host', radius: 1 });
        mod.createBody({ id: 'sat', radius: 1, rotationPeriod: 20 });
        mod.orbitBody('sat', 'host', { radius: 10, period: 40, phase: 0, inclination: 0 });
        mod.updateBodies(10);
        expect(mod.getBody('sat').rotation.y).toBeCloseTo(mod.spinAt(10, 20));
    });

    test('a body with no rotation period is left alone', () => {
        mod.initBodies();
        mod.createBody({ id: 'still', radius: 1 });
        mod.updateBodies(1000);
        expect(mod.getBody('still').rotation.y).toBe(0);
    });

    /** THE CLOCK CAN BE PUT BACK WITHOUT THROWING THE SCENE AWAY.
     *
     *  `initBodies` and `disposeBodies` were the only two things that reset it,
     *  and both rebuild every mesh and reload every texture to do it, which is
     *  far too much for a scene that only wants its sky back at the start of a
     *  new run. Earth Defense solves its moon's phase backwards from the frame
     *  a visitor is first shown, and nothing put that back on a restart. */
    test('resetBodyClock winds the clock back to zero', () => {
        buildSystem();
        mod.updateBodies(120);
        expect(mod.getElapsed()).toBeCloseTo(120);

        expect(mod.resetBodyClock()).toBe(0);
        expect(mod.getElapsed()).toBe(0);
    });

    /** AND MOVES NOTHING BY ITSELF, which is the half a caller has to know
     *  about. What time it is and where everything goes are kept as two facts,
     *  so a caller that wants the change on the frame it asked for follows this
     *  with a zero-length step rather than waiting for the next real one. */
    test('resetBodyClock leaves the meshes until something steps them', () => {
        buildSystem();
        mod.updateBodies(120);
        const moved = { ...mod.getBody('moon').position };
        const spun = mod.getBody('mars').rotation.y;

        mod.resetBodyClock();
        expect(mod.getBody('moon').position.x).toBeCloseTo(moved.x);
        expect(mod.getBody('mars').rotation.y).toBeCloseTo(spun);

        // A zero step re-seats everything on this frame rather than the next.
        mod.updateBodies(0);
        const start = mod.orbitPositionAt(0, MOON);
        expect(mod.getBody('moon').position.x).toBeCloseTo(start.x);
        expect(mod.getBody('moon').position.z).toBeCloseTo(start.z);
        expect(mod.getBody('mars').rotation.y).toBeCloseTo(0);
        expect(mod.getElapsed()).toBe(0);
    });

    test('resetBodyClock is safe with no bodies built at all', () => {
        mod.disposeBodies();
        expect(mod.resetBodyClock()).toBe(0);
        expect(() => mod.updateBodies(0)).not.toThrow();
    });

    test('orbiting an unknown body is a no-op rather than a throw', () => {
        mod.initBodies();
        expect(mod.orbitBody('nobody', 'earth', MOON)).toBeNull();
    });

    test('an orbit whose parent is missing falls back to the origin', () => {
        mod.initBodies();
        mod.createBody({ id: 'sat', radius: 1 });
        mod.orbitBody('sat', 'ghost', { radius: 10, period: 40, phase: 0, inclination: 0 });
        expect(mod.getBody('sat').position).toMatchObject({ x: 10, y: 0, z: 0 });
    });
});

describe('anchorToSurface', () => {
    beforeEach(() => {
        mod.initBodies();
        mod.createBody({ id: 'earth', radius: 6371 });
        mod.createBody({ id: 'moon', radius: 1737 });
        mod.orbitBody('moon', 'earth', { ...MOON, tidalLock: true });
    });

    test('parents the anchor to the body, so it rides the spin and the orbit', () => {
        // This is why installations on a moving Moon need no per-frame work.
        const anchor = mod.anchorToSurface('moon', 0, 90, 0);
        expect(anchor.parent).toBe(mod.getBody('moon'));
    });

    test('sits exactly on the surface at the given lat and lon', () => {
        const anchor = mod.anchorToSurface('earth', 60, -90, 0);
        const p = anchor.position;
        expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(6371, 3);
        expect(p.y).toBeCloseTo(6371 * Math.sin(Math.PI / 3), 3);
    });

    test('a height raises it above the surface', () => {
        const anchor = mod.anchorToSurface('earth', 0, 0, 500);
        const p = anchor.position;
        expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(6871, 3);
    });

    test('stands upright: local +Y is rotated onto the outward normal', () => {
        const anchor = mod.anchorToSurface('earth', 35, 20, 0);
        expect(anchor.aligned.from).toMatchObject({ x: 0, y: 1, z: 0 });
        const n = anchor.aligned.to;
        expect(Math.hypot(n.x, n.y, n.z)).toBeCloseTo(1, 6);
        // The normal points the same way as the surface point itself.
        const p = anchor.position;
        const len = Math.hypot(p.x, p.y, p.z);
        expect(n.x).toBeCloseTo(p.x / len, 6);
        expect(n.y).toBeCloseTo(p.y / len, 6);
    });

    test('an unknown body yields nothing rather than throwing', () => {
        expect(mod.anchorToSurface('pluto', 0, 0, 0)).toBeNull();
    });
});

describe('collision', () => {
    beforeEach(() => {
        mod.initBodies();
        mod.createBody({ id: 'earth', radius: 6371 });
        mod.createBody({ id: 'mars', radius: 3390, position: [0, 0, -200000] });
    });

    test('reports nothing in open space', () => {
        expect(mod.checkBodyCollision({ x: 0, y: 8500, z: 0 })).toBeNull();
    });

    test('names the body, the depth, and the way out', () => {
        const hit = mod.checkBodyCollision({ x: 0, y: 6000, z: 0 });
        expect(hit.id).toBe('earth');
        expect(hit.penetration).toBeCloseTo(371);
        expect(hit.normal).toMatchObject({ x: 0, y: 1, z: 0 });
    });

    test("counts the mover's own radius, so a ship stops at its hull", () => {
        expect(mod.checkBodyCollision({ x: 0, y: 6400, z: 0 })).toBeNull();
        expect(mod.checkBodyCollision({ x: 0, y: 6400, z: 0 }, 100)).not.toBeNull();
    });

    test('finds a body that is not at the origin', () => {
        const hit = mod.checkBodyCollision({ x: 0, y: 0, z: -199000 });
        expect(hit.id).toBe('mars');
    });
});

describe('altitudeFloorAdjust', () => {
    beforeEach(() => {
        mod.initBodies();
        mod.createBody({ id: 'earth', radius: 6371 });
    });

    test('leaves a clear position untouched', () => {
        const p = { x: 0, y: 8500, z: 0 };
        expect(mod.altitudeFloorAdjust(p, 400)).toBe(p);
    });

    test('pushes an intruding position out to the standoff altitude', () => {
        const out = mod.altitudeFloorAdjust({ x: 0, y: 1000, z: 0 }, 400);
        expect(Math.hypot(out.x, out.y, out.z)).toBeCloseTo(6771);
        expect(out.y).toBeGreaterThan(0);   // pushed out the way it came in
    });

    test('keeps the direction of approach rather than teleporting', () => {
        const out = mod.altitudeFloorAdjust({ x: 3000, y: 3000, z: 0 }, 400);
        expect(out.x).toBeCloseTo(out.y, 6);
    });

    test('follows a body that has moved', () => {
        // The reason main.js uses this rather than its own copy: it reads live
        // positions, so it still works now that the Moon is in motion.
        mod.createBody({ id: 'moon', radius: 1737 });
        mod.orbitBody('moon', 'earth', { radius: 64000, period: 480, phase: 0, inclination: 0 });
        // Just inside the Moon's surface, not at its exact centre: a point
        // sitting precisely on a body's centre has no direction to be pushed
        // in, and the module deliberately leaves it alone.
        const insideMoon = { x: 65000, y: 0, z: 0 };
        const out = mod.altitudeFloorAdjust(insideMoon, 400);
        expect(out).not.toBe(insideMoon);
        expect(Math.hypot(out.x - 64000, out.y, out.z)).toBeCloseTo(1737 + 400, 3);
    });
});

describe('readouts', () => {
    test('bodyPositions reports live centres as plain numbers', () => {
        mod.initBodies();
        mod.createBody({ id: 'earth', radius: 6371 });
        mod.createBody({ id: 'moon', radius: 1737 });
        mod.orbitBody('moon', 'earth', MOON);
        mod.updateBodies(200);

        const before = mod.bodyPositions();
        mod.updateBodies(60);
        const after = mod.bodyPositions();

        expect(typeof after.moon.x).toBe('number');
        // Live, not cached: the HUD reads this every frame, and a stale moon
        // position is what makes an interception feel broken.
        expect(after.moon.x).not.toBeCloseTo(before.moon.x, 3);
        expect(after.earth).toEqual({ x: 0, y: 0, z: 0 });
    });

    test('getOccluders gives targeting a centre and radius per body', () => {
        mod.initBodies();
        mod.createBody({ id: 'earth', radius: 6371 });
        mod.createBody({ id: 'mars', radius: 3390, position: [0, 0, -200000] });
        const occ = mod.getOccluders();
        expect(occ).toHaveLength(2);
        expect(occ.find(o => o.id === 'mars')).toMatchObject({ radius: 3390, centre: { z: -200000 } });
    });

    test('getBody and getBodySpec return null for an unknown id', () => {
        mod.initBodies();
        expect(mod.getBody('nope')).toBeNull();
        expect(mod.getBodySpec('nope')).toBeNull();
    });

    test('getBodySpec hands back the spec it was built from', () => {
        mod.initBodies();
        mod.createBody({ id: 'earth', radius: 6371, segments: 128 });
        expect(mod.getBodySpec('earth').segments).toBe(128);
    });
});

describe('disposeBodies', () => {
    test('releases geometry, materials, and textures, and is safe twice', () => {
        mod.initBodies();
        const mesh = mod.createBody({
            id: 'earth', radius: 6371, texture: 'e.jpg', atmosphere: { scale: 1.02 }
        });
        const shell = mesh.children[0];
        const map = mesh.material.map;

        mod.disposeBodies();

        expect(mesh.geometry.disposed).toBe(1);
        expect(mesh.material.disposed).toBe(1);
        expect(map.disposed).toBe(1);
        expect(shell.geometry.disposed).toBe(1);
        expect(mod.getBodiesGroup()).toBeNull();
        expect(mod.getElapsed()).toBe(0);

        expect(() => mod.disposeBodies()).not.toThrow();
    });

    test('handles a body with no texture', () => {
        mod.initBodies();
        mod.createBody({ id: 'plain', radius: 1 });
        expect(() => mod.disposeBodies()).not.toThrow();
    });

    test('initBodies clears any previous system', () => {
        mod.initBodies();
        mod.createBody({ id: 'earth', radius: 1 });
        mod.initBodies();
        expect(mod.getBody('earth')).toBeNull();
        expect(mod.getBodiesGroup().children).toHaveLength(0);
    });
});
