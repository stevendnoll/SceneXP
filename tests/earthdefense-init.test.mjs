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
