// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Unit tests for www/shared/js/space-1.0.0.js — the renderer, the two-camera
 * split, the lights, and the starfield for airless scenes.
 *
 * The THREE stand-in here records rather than renders: it keeps an ordered log
 * of the renderer calls and real numbers on the cameras, so the two things
 * worth asserting can actually be asserted. Those are the render ORDER (world,
 * depth clear, overlay, in that sequence, with autoClear off) and that a resize
 * reaches BOTH cameras. The second is the classic bug in a two-camera setup:
 * the world reframes, the cockpit skews, and it reads as a modelling error
 * rather than a resize one.
 *
 * starPositions is pure, so it is tested against plain numbers with a seeded
 * rng, including the distribution property the inverse-cosine method exists to
 * provide (no crowding at the poles).
 */
import { jest } from '@jest/globals';

// ---- A recording THREE ------------------------------------------------------

let log;

class Vec3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    normalize() {
        const l = Math.hypot(this.x, this.y, this.z) || 1;
        this.x /= l; this.y /= l; this.z /= l;
        return this;
    }
    multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
}

class PerspectiveCamera {
    constructor(fov, aspect, near, far) {
        this.fov = fov; this.aspect = aspect; this.near = near; this.far = far;
        this.position = new Vec3();
        this.projectionUpdates = 0;
    }
    updateProjectionMatrix() { this.projectionUpdates++; }
}

class WebGLRenderer {
    constructor(params) {
        this.params = params;
        this.autoClear = true;
        this.pixelRatio = 1;
        this.size = null;
        this.disposed = 0;
        this.animationLoop = undefined;
    }
    setPixelRatio(r) { this.pixelRatio = r; }
    setSize(w, h) { this.size = { w, h }; }
    clear() { log.push('clear'); }
    clearDepth() { log.push('clearDepth'); }
    setScissorTest(on) { this.scissorTest = on; log.push(`scissorTest:${on}`); }
    setViewport(x, y, w, h) { this.viewport = { x, y, w, h }; log.push(`viewport:${x},${y},${w},${h}`); }
    setScissor(x, y, w, h) { this.scissor = { x, y, w, h }; log.push(`scissor:${x},${y},${w},${h}`); }
    render(scene, camera) {
        const which = camera === installed.cameras[0] ? 'world'
            : (camera === installed.cameras[1] ? 'overlay' : 'inset');
        log.push(`render:${scene.tag}:${which}`);
    }
    setAnimationLoop(fn) { this.animationLoop = fn; }
    dispose() { this.disposed++; }
}

const installed = { renderer: null, cameras: [] };

function installThree() {
    log = [];
    installed.renderer = null;
    installed.cameras = [];

    const Scene = class { constructor() { this.children = []; this.tag = 'world'; } add(o) { this.children.push(o); } };

    globalThis.THREE = {
        WebGLRenderer: function (p) {
            installed.renderer = new WebGLRenderer(p);
            return installed.renderer;
        },
        PerspectiveCamera: function (f, a, n, fa) {
            const c = new PerspectiveCamera(f, a, n, fa);
            installed.cameras.push(c);
            return c;
        },
        Scene,
        Color: class { constructor(hex) { this.hex = hex; } },
        AmbientLight: class { constructor(c, i) { this.color = c; this.intensity = i; } },
        DirectionalLight: class {
            constructor(c, i) { this.color = c; this.intensity = i; this.position = new Vec3(); }
        },
        BufferGeometry: class {
            constructor() { this.attributes = {}; this.disposed = 0; }
            setAttribute(name, attr) { this.attributes[name] = attr; }
            dispose() { this.disposed++; }
        },
        BufferAttribute: class { constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; } },
        PointsMaterial: class { constructor(o) { Object.assign(this, o); this.disposed = 0; } dispose() { this.disposed++; } },
        Points: class {
            constructor(g, m) { this.geometry = g; this.material = m; this.position = new Vec3(); }
        },
        SRGBColorSpace: 'srgb',
        ACESFilmicToneMapping: 'aces'
    };
}

function installWindow(overrides = {}) {
    globalThis.window = { innerWidth: 1600, innerHeight: 900, devicePixelRatio: 3, ...overrides };
}

let mod;
beforeEach(async () => {
    installThree();
    installWindow();
    jest.resetModules();
    mod = await import('../www/shared/js/space-1.0.0.js');
});

afterEach(() => {
    delete globalThis.THREE;
    delete globalThis.window;
    delete globalThis.navigator;
});

// ---- The pure core ----------------------------------------------------------

describe('starPositions', () => {
    test('returns three values per star, every one on the sphere', () => {
        const out = mod.starPositions(500, 1000, mod.makeRng(7));
        expect(out).toHaveLength(1500);
        for (let i = 0; i < 500; i++) {
            const r = Math.hypot(out[i * 3], out[i * 3 + 1], out[i * 3 + 2]);
            expect(r).toBeCloseTo(1000, 3);
        }
    });

    test('is deterministic for a seeded rng and different across seeds', () => {
        const a = mod.starPositions(20, 10, mod.makeRng(1));
        const b = mod.starPositions(20, 10, mod.makeRng(1));
        const c = mod.starPositions(20, 10, mod.makeRng(2));
        expect(Array.from(a)).toEqual(Array.from(b));
        expect(Array.from(a)).not.toEqual(Array.from(c));
    });

    test('spreads evenly instead of crowding the poles', () => {
        // Uniform area density on a sphere means z is uniform on [-r, r], so
        // the mean of |z| lands near r/2. Picking each angle uniformly instead
        // (the naive version) pushes this well above r/2 and shows up as two
        // bright patches in the sky.
        const n = 4000;
        const out = mod.starPositions(n, 1, mod.makeRng(99));
        let sum = 0;
        for (let i = 0; i < n; i++) sum += Math.abs(out[i * 3 + 2]);
        expect(sum / n).toBeGreaterThan(0.45);
        expect(sum / n).toBeLessThan(0.55);
    });

    test('defaults to Math.random when no rng is supplied', () => {
        const out = mod.starPositions(3, 5);
        expect(out).toHaveLength(9);
        expect(Math.hypot(out[0], out[1], out[2])).toBeCloseTo(5, 6);
    });
});

// ---- initSpace --------------------------------------------------------------

describe('initSpace', () => {
    test('builds both cameras from config with a shared aspect', () => {
        mod.initSpace({}, {
            space: {
                worldCamera: { fov: 70, near: 100, far: 500000 },
                overlayCamera: { fov: 70, near: 0.1, far: 100 }
            }
        });
        const world = mod.getWorldCamera();
        const overlay = mod.getOverlayCamera();
        expect(world.near).toBe(100);
        expect(world.far).toBe(500000);
        expect(overlay.near).toBe(0.1);
        expect(overlay.far).toBe(100);
        expect(world.aspect).toBeCloseTo(1600 / 900);
        expect(overlay.aspect).toBeCloseTo(1600 / 900);
    });

    test('turns autoClear off, because renderSpace owns clearing', () => {
        mod.initSpace({}, {});
        expect(installed.renderer.autoClear).toBe(false);
    });

    test('caps the pixel ratio', () => {
        mod.initSpace({}, { space: { maxPixelRatio: 2 } });
        expect(installed.renderer.pixelRatio).toBe(2);   // device reports 3
    });

    test('falls back to built-in defaults when no space config is given', () => {
        mod.initSpace({});
        expect(mod.getWorldCamera().far).toBe(500000);
        expect(mod.getStarfield().geometry.attributes.position.array).toHaveLength(6000 * 3);
    });

    test('pushes the key light far out along its configured direction', () => {
        mod.initSpace({}, { space: { keyLight: { direction: [0, 0, 1] }, worldCamera: { far: 1000 } } });
        const light = mod.getKeyLight();
        expect(light.position.z).toBeCloseTo(1000);
        expect(Math.hypot(light.position.x, light.position.y, light.position.z)).toBeCloseTo(1000);
    });

    test('adds the ambient fill and names both lights for later lookup', () => {
        mod.initSpace({}, {});
        expect(mod.getAmbientLight()).toBeTruthy();
        expect(mod.getRenderer()).toBe(installed.renderer);
    });

    test('accepts an injected rng so a sky can be reproducible', () => {
        mod.initSpace({}, { space: { starCount: 10, starRadius: 4, starRng: mod.makeRng(3) } });
        const first = Array.from(mod.getStarfield().geometry.attributes.position.array);
        mod.initSpace({}, { space: { starCount: 10, starRadius: 4, starRng: mod.makeRng(3) } });
        expect(Array.from(mod.getStarfield().geometry.attributes.position.array)).toEqual(first);
    });

    test('the starfield is never frustum culled', () => {
        // It is re-centred on the camera every frame, so a stale bounding
        // sphere would otherwise pop the whole sky out of view.
        mod.initSpace({}, {});
        expect(mod.getStarfield().frustumCulled).toBe(false);
    });
});

// ---- renderSpace ------------------------------------------------------------

describe('renderSpace', () => {
    test('draws the world, clears depth, then draws the overlay', () => {
        const scene = mod.initSpace({}, {});
        const overlay = new THREE.Scene();
        overlay.tag = 'overlay';
        mod.renderSpace(scene, overlay);
        expect(log).toEqual(['clear', 'render:world:world', 'clearDepth', 'render:overlay:overlay']);
    });

    test('skips the depth clear and second pass when there is no overlay', () => {
        const scene = mod.initSpace({}, {});
        mod.renderSpace(scene);
        expect(log).toEqual(['clear', 'render:world:world']);
    });

    test('re-centres the starfield on the camera each frame', () => {
        const scene = mod.initSpace({}, {});
        mod.getWorldCamera().position.set(10, -20, 30);
        mod.renderSpace(scene);
        expect(mod.getStarfield().position).toMatchObject({ x: 10, y: -20, z: 30 });
    });

    test('is a no-op without a scene or before init', () => {
        const scene = mod.initSpace({}, {});
        mod.renderSpace(null);
        expect(log).toEqual([]);
        mod.disposeSpace();
        mod.renderSpace(scene);
        expect(log).toEqual([]);
    });
});

// ---- renderInset ------------------------------------------------------------
//
// A second pass into a corner of the same canvas, so an experience can show
// something happening somewhere else without taking the camera off the visitor.
// Almost everything here is about putting the renderer back the way it was
// found: this pass runs for two seconds and the main view has to survive it.

describe('renderInset', () => {
    const RECT = { x: 1300, y: 350, width: 260, height: 160 };
    const insetCamera = () => new THREE.PerspectiveCamera(55, 1, 10, 500000);

    test('scissors, draws, and puts the renderer back', () => {
        const scene = mod.initSpace({}, {});
        log.length = 0;
        mod.renderInset(scene, insetCamera(), RECT);

        expect(log).toEqual([
            'scissorTest:true',
            // 1600x900 window, so a rect 350 down from the top with a height of
            // 160 starts 390 up from the bottom.
            'viewport:1300,390,260,160',
            'scissor:1300,390,260,160',
            'clear',
            'render:world:inset',
            'scissorTest:false',
            'viewport:0,0,1600,900'
        ]);
    });

    test('THE Y AXIS IS FLIPPED, because CSS and WebGL disagree about down', () => {
        // Said on its own because it is the one bug this seam exists to stop.
        // The rect comes from the DOM frame drawn over the window, which counts
        // from the top; WebGL counts from the bottom. Get it wrong and the
        // picture appears in the opposite corner from its own border.
        const scene = mod.initSpace({}, {});
        log.length = 0;
        mod.renderInset(scene, insetCamera(), { x: 0, y: 0, width: 100, height: 100 });
        // Read from the log rather than from the renderer, because the restore
        // at the end of the pass has already put the viewport back by then.
        expect(log).toContain('viewport:0,800,100,100');
    });

    test('the aspect comes from the window, so an inset is never stretched', () => {
        const scene = mod.initSpace({}, {});
        const camera = insetCamera();
        mod.renderInset(scene, camera, RECT);

        expect(camera.aspect).toBeCloseTo(260 / 160, 9);
        expect(camera.projectionUpdates).toBe(1);
        // And not recomputed every frame for a window that has not changed.
        mod.renderInset(scene, camera, RECT);
        expect(camera.projectionUpdates).toBe(1);
    });

    test('the STARFIELD sits the pass out, and comes back after', () => {
        // The heaviest thing in the scene by vertex count and the least useful
        // thing in a close-up. It also cannot be centred on two cameras at once.
        const scene = mod.initSpace({}, {});
        const stars = mod.getStarfield();
        stars.visible = true;

        let duringPass = null;
        installed.renderer.render = () => { duringPass = stars.visible; };
        mod.renderInset(scene, insetCamera(), RECT);

        expect(duringPass).toBe(false);
        expect(stars.visible).toBe(true);
    });

    test('a window too small to see is not drawn at all', () => {
        const scene = mod.initSpace({}, {});
        log.length = 0;
        expect(mod.renderInset(scene, insetCamera(), { x: 0, y: 0, width: 1, height: 40 })).toBe(false);
        expect(log).toEqual([]);
    });

    test('is a no-op with anything missing, or before init', () => {
        const scene = mod.initSpace({}, {});
        log.length = 0;
        expect(mod.renderInset(null, insetCamera(), RECT)).toBe(false);
        expect(mod.renderInset(scene, null, RECT)).toBe(false);
        expect(mod.renderInset(scene, insetCamera(), null)).toBe(false);
        expect(log).toEqual([]);

        mod.disposeSpace();
        expect(mod.renderInset(scene, insetCamera(), RECT)).toBe(false);
    });
});

// ---- resizeSpace ------------------------------------------------------------

describe('resizeSpace', () => {
    test('updates the aspect and projection of BOTH cameras', () => {
        mod.initSpace({}, {});
        const world = mod.getWorldCamera();
        const overlay = mod.getOverlayCamera();
        const before = overlay.projectionUpdates;

        mod.resizeSpace(800, 400);

        expect(world.aspect).toBeCloseTo(2);
        expect(overlay.aspect).toBeCloseTo(2);
        expect(overlay.projectionUpdates).toBe(before + 1);
        expect(installed.renderer.size).toEqual({ w: 800, h: 400 });
    });

    test('falls back to the window size when called with no arguments', () => {
        mod.initSpace({}, {});
        globalThis.window.innerWidth = 500;
        globalThis.window.innerHeight = 250;
        mod.resizeSpace();
        expect(mod.getWorldCamera().aspect).toBeCloseTo(2);
    });

    test('is a no-op before init', () => {
        mod.disposeSpace();
        expect(() => mod.resizeSpace(100, 100)).not.toThrow();
    });
});

// ---- settings and teardown --------------------------------------------------

describe('setMaxPixelRatio', () => {
    test('lowers the ceiling live, for the reduced-effects setting', () => {
        mod.initSpace({}, {});
        mod.setMaxPixelRatio(1.5);
        expect(installed.renderer.pixelRatio).toBe(1.5);
    });

    test('is a no-op before init', () => {
        mod.disposeSpace();
        expect(() => mod.setMaxPixelRatio(1)).not.toThrow();
    });
});

describe('disposeSpace', () => {
    test('releases the starfield and the renderer, and is safe twice', () => {
        mod.initSpace({}, {});
        const stars = mod.getStarfield();
        const renderer = installed.renderer;

        mod.disposeSpace();
        expect(stars.geometry.disposed).toBe(1);
        expect(stars.material.disposed).toBe(1);
        expect(renderer.disposed).toBe(1);
        expect(renderer.animationLoop).toBeNull();
        expect(mod.getWorldCamera()).toBeNull();
        expect(mod.getOverlayCamera()).toBeNull();
        expect(mod.getStarfield()).toBeNull();

        expect(() => mod.disposeSpace()).not.toThrow();
        expect(renderer.disposed).toBe(1);
    });
});

// ---- environment guards -----------------------------------------------------

describe('isTouchDevice', () => {
    test('false with no window at all', () => {
        delete globalThis.window;
        expect(mod.isTouchDevice()).toBe(false);
    });

    test('true when the window exposes touch events', () => {
        installWindow({ ontouchstart: null });
        expect(mod.isTouchDevice()).toBe(true);
    });

    test('true when the navigator reports touch points', () => {
        globalThis.navigator = { maxTouchPoints: 5 };
        expect(mod.isTouchDevice()).toBe(true);
    });

    test('false on a plain desktop window', () => {
        globalThis.navigator = { maxTouchPoints: 0 };
        expect(mod.isTouchDevice()).toBe(false);
    });
});

test('init works headlessly, with no window to measure', () => {
    delete globalThis.window;
    mod.initSpace({}, {});
    // Falls back to a 1280x720 frame and a pixel ratio of 1 rather than throwing.
    expect(mod.getWorldCamera().aspect).toBeCloseTo(1280 / 720);
    expect(installed.renderer.pixelRatio).toBe(1);
});
