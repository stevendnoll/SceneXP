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
}

function installThree() {
    globalThis.THREE = {
        Group: class { constructor() { this.children = []; this.name = ''; } add(o) { this.children.push(o); } },
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
            }
            add(o) { this.children.push(o); }
        },
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
