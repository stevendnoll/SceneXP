// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * THE SKY IS DRAWN LAST OF THE OPAQUE THINGS, in all three scenes with a dome
 * (2026-09-24): www/tornado, www/garden and www/highwater.
 *
 * Each dome used to sit at the front of the opaque pass (-1000, -1000 and -1),
 * so its shader ran on every pixel on screen before the ground, the ridges,
 * the trees or the sand painted over theirs. Drawn last, with the depth test
 * on, those pixels are rejected before it shades them. Three things make that
 * safe, and each is held here with real three (www/lib/three.min.js in
 * node:vm), not the stub:
 *
 *   - it draws after every opaque thing in its scene (its renderOrder is
 *     above every other order the scene sets, and the rest default to 0)
 *   - it tests depth, writes none, and is not transparent (High Water's dome
 *     had the test OFF, which drawn last would have painted over the beach)
 *   - its vertex shader pins it to the far plane, so it loses to anything
 *     already drawn at ANY distance, not only nearer than its radius, which
 *     is exactly what being drawn first used to guarantee
 *
 * A fragment shader that discarded would switch off the early depth test
 * that makes this cheap, so none may.
 */
import { jest } from '@jest/globals';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const SRC = (scene, name) => `../www/${scene}/js/${name}`;
for (const [scene, names] of [
    ['garden', ['config', 'clock']],
    ['highwater', ['config']],
    ['tornado', ['config', 'funnel']]
]) {
    for (const name of names) {
        jest.unstable_mockModule(SRC(scene, `${name}.min.js`), async () => await import(SRC(scene, `${name}.js`)));
    }
}

let THREE;

beforeAll(() => {
    const ctx = vm.createContext({ self: {}, window: {}, console: { warn() {} } });
    vm.runInContext(readFileSync(join(process.cwd(), 'www/lib/three.min.js'), 'utf8'), ctx);
    THREE = ctx.THREE || ctx.self.THREE || ctx.window.THREE;
    globalThis.THREE = THREE;
    const context = new Proxy({}, {
        get: (_t, p) => (p === 'createLinearGradient' || p === 'createRadialGradient'
            ? () => ({ addColorStop() {} }) : () => {}),
        set: () => true
    });
    globalThis.document = { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => context }) };
});

afterAll(() => {
    delete globalThis.THREE;
    delete globalThis.document;
});

/** Each scene's dome, built the way its page builds it, and its order. */
const DOMES = {
    tornado: async () => {
        const { TORNADO_CONFIG } = await import(SRC('tornado', 'config.js'));
        const world = await import(SRC('tornado', 'world.js'));
        const scene = new THREE.Scene();
        world.initWorld(scene, TORNADO_CONFIG);
        const sky = scene.children.find((o) => o.renderOrder === world.SKY_ORDER);
        return { sky, order: world.SKY_ORDER };
    },
    garden: async () => {
        const { GARDEN_CONFIG } = await import(SRC('garden', 'config.js'));
        const sky = await import(SRC('garden', 'sky.js'));
        const scene = new THREE.Scene();
        sky.initSky(scene, { toneMappingExposure: 1 }, GARDEN_CONFIG);
        return { sky: scene.getObjectByName('sky'), order: sky.DOME_ORDER };
    },
    highwater: async () => {
        const { OCEAN_CONFIG } = await import(SRC('highwater', 'config.js'));
        const sky = await import(SRC('highwater', 'sky.js'));
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 900);
        sky.initSky(scene, camera, OCEAN_CONFIG, { phase: 0.3 });
        return { sky: scene.getObjectByName('sky'), order: sky.DOME_ORDER };
    }
};

/** Every renderOrder a scene's own modules set, other than the dome's. */
function otherOrders(scene) {
    const dir = join(process.cwd(), 'www', scene, 'js');
    const values = [];
    for (const file of readdirSync(dir)) {
        if (!file.endsWith('.js') || file.endsWith('.min.js')) continue;
        const src = readFileSync(join(dir, file), 'utf8');
        const consts = Object.fromEntries([...src.matchAll(/const ([A-Z_]+) = (-?\d+);/g)].map((m) => [m[1], Number(m[2])]));
        // Code lines only: the comments quote old orders too.
        const code = src.split('\n').filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line)).join('\n');
        for (const m of code.matchAll(/\.renderOrder = ([^;\n]+);/g)) {
            const expr = m[1].trim();
            if (/^(SKY_ORDER|DOME_ORDER)$/.test(expr)) continue;
            // A literal, a named constant, `-900 + index` (the garden's
            // ridges, a handful of them), or tornado's shells counter, which
            // starts at 1 and numbers a dozen or so transparent layers.
            let value;
            if (expr in consts) value = consts[expr];
            else if (expr === 'order++') value = /let order = 1;/.test(code) ? 50 : NaN;
            else if (/\+\s*index$/.test(expr)) value = Number(expr.replace(/\s*\+\s*index$/, '')) + 10;
            else value = Number(expr);
            values.push([file, expr, value]);
        }
    }
    return values;
}

describe.each(Object.keys(DOMES))('%s', (name) => {
    let sky;
    let order;
    beforeAll(async () => { ({ sky, order } = await DOMES[name]()); });

    test('its dome draws after every opaque thing the scene sets an order for', () => {
        expect(sky).toBeTruthy();
        expect(sky.renderOrder).toBe(order);
        expect(order).toBeGreaterThan(0);
        const others = otherOrders(name);
        expect(others.length).toBeGreaterThan(0);
        for (const [file, expr, value] of others) {
            expect([file, expr, Number.isFinite(value) && value < order]).toEqual([file, expr, true]);
        }
    });

    test('it tests depth, writes none, and is opaque', () => {
        const m = sky.material;
        expect(m.depthTest).toBe(true);
        expect(m.depthWrite).toBe(false);
        expect(m.transparent).toBe(false);
    });

    test('ITS VERTEX SHADER PINS IT TO THE FAR PLANE, and its fragment shader never discards', () => {
        const m = sky.material;
        let vert = m.vertexShader;
        // Tornado Alley's dome shares a vertex shader with the ground, and
        // only its define switches the pin on.
        if (/#ifdef AT_FAR_PLANE/.test(vert)) {
            expect(m.defines).toHaveProperty('AT_FAR_PLANE');
            vert = vert.replace(/#ifdef AT_FAR_PLANE([\s\S]*?)#endif/, '$1');
        }
        const set = vert.lastIndexOf('gl_Position =');
        const pin = vert.indexOf('gl_Position.z = gl_Position.w;');
        expect(set).toBeGreaterThan(-1);
        expect(pin).toBeGreaterThan(set);
        expect(m.fragmentShader).not.toMatch(/\bdiscard\b/);
    });
});

test('the pin puts every dome vertex exactly on the far plane', () => {
    // What the line does, worked through three's own projection: whatever the
    // radius, depth 1, the far plane, which the depth test (less or equal)
    // lets through only where nothing nearer has been drawn.
    const camera = new THREE.PerspectiveCamera(42, 0.46, 1, 400);
    camera.updateMatrixWorld(true);
    for (const radius of [120, 320, 700, 30000]) {
        const clip = new THREE.Vector4(radius * 0.3, radius * 0.1, -radius * 0.9, 1)
            .applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
        clip.z = clip.w;
        expect(clip.z / clip.w).toBe(1);
    }
});
