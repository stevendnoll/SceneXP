// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The Earth Defense HUD (www/earthdefense/js/hud.js).
 *
 * THE ASSERTION THIS FILE EXISTS FOR is the sign of the view-space z. Turning a
 * world point into a screen pixel has one classic bug in it and it is nasty:
 * `camera.project()` happily returns coordinates for a point BEHIND the eye,
 * mirrored through the origin, so a marker for something behind you appears on
 * the opposite edge of the screen pointing confidently the wrong way. It is the
 * kind of bug that looks like a physics problem for a week. `writeProjection`
 * is pure precisely so that it can be pinned here with plain numbers rather
 * than discovered by flying around.
 *
 * The rest is the promises the PRD makes about the HUD: a pip for every raider
 * AT ANY DISTANCE (8.1), a live bearing to the Moon rather than a cached one
 * (5.2), and every counter and alert present as a sentence in a polite live
 * region rather than only as pixels (8.5).
 *
 * The DOM below is a few dozen lines of stand-in rather than jsdom, which the
 * project does not depend on and does not need: the HUD only ever reads
 * getElementById, writes textContent and style.transform, and toggles classes.
 */
import { jest } from '@jest/globals';

// ---- A small DOM ------------------------------------------------------------

class FakeElement {
    constructor(tag = 'div') {
        this.tagName = tag;
        this.children = [];
        this.style = {};
        this._text = '';
        this._classes = new Set();
        this.classList = {
            add: (c) => this._classes.add(c),
            remove: (c) => this._classes.delete(c),
            contains: (c) => this._classes.has(c),
            toggle: (c, on) => (on ? this._classes.add(c) : this._classes.delete(c))
        };
    }
    set className(value) {
        this._classes = new Set(String(value).split(/\s+/).filter(Boolean));
    }
    get className() { return [...this._classes].join(' '); }
    set textContent(value) {
        this._text = String(value);
        // Matching the real thing: setting textContent empties the subtree,
        // which is how hud.js clears the pip and marker layers.
        if (this._text === '') this.children = [];
    }
    get textContent() { return this._text; }
    appendChild(child) { this.children.push(child); return child; }
    get hidden() { return this._classes.has('hidden'); }
}

const HUD_IDS = [
    'structures-count', 'ships-count', 'elapsed-time', 'alert-banner',
    'hostile-pips', 'nav-markers', 'chevron-alert', 'chevron-hostile',
    'objective-status'
];

let nodes;

function installDom(ids = HUD_IDS) {
    nodes = new Map(ids.map(id => [id, new FakeElement()]));
    globalThis.document = {
        getElementById: (id) => nodes.get(id) || null,
        createElement: (tag) => new FakeElement(tag)
    };
    globalThis.window = { innerWidth: 1000, innerHeight: 600 };
}

// ---- A camera whose maths is real, and trivially checkable ------------------
//
// Rather than a 4x4 matrix stack, the two "matrix" applications are functions:
// the first moves a world point into view space (the eye at the origin looking
// down -Z), the second is a plain perspective divide. Both are honest about the
// one property under test, which is the sign of z.

function fakeCamera(eye = { x: 0, y: 0, z: 0 }) {
    return {
        updated: 0,
        updateMatrixWorld() { this.updated++; },
        matrixWorldInverse: (v) => { v.x -= eye.x; v.y -= eye.y; v.z -= eye.z; },
        projectionMatrix: (v) => {
            const w = Math.abs(v.z) || 1e-6;
            v.x = v.x / w;
            v.y = v.y / w;
        }
    };
}

function installThree() {
    globalThis.THREE = {
        Vector3: class {
            constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
            set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
            applyMatrix4(fn) { fn(this); return this; }
        }
    };
}

let hud;
let CONFIG;

beforeEach(async () => {
    installDom();
    installThree();
    jest.resetModules();
    ({ EARTHDEFENSE_CONFIG: CONFIG } = await import('../www/earthdefense/js/config.js'));
    hud = await import('../www/earthdefense/js/hud.js');
});

afterEach(() => {
    if (hud) hud.disposeHud();
    delete globalThis.document;
    delete globalThis.window;
    delete globalThis.THREE;
});

const VIEWPORT = { width: 1000, height: 600 };

/** A snapshot of the game, with sensible defaults, for updateHud. */
function view(extra = {}) {
    return {
        camera: fakeCamera(),
        elapsed: 0,
        structuresRemaining: 7,
        shipsRemaining: 12,
        ships: [],
        bodies: {},
        alert: null,
        playerPosition: { x: 0, y: 0, z: 0 },
        ...extra
    };
}

/** Twelve raiders, all alive, at a given depth in front of the eye. */
function raiders(z = -5000) {
    return Array.from({ length: CONFIG.fleet.total }, (_, i) => ({
        id: `raider-${i}`,
        alive: true,
        position: { x: i * 10, y: 0, z }
    }));
}

// ---- The bug this file exists for -------------------------------------------

describe('projecting a world point, and the mirror behind the camera', () => {
    test('a point in front of the eye lands where it should', () => {
        const out = {};
        // Dead centre in normalised device coordinates is the middle of the
        // screen, and +y in NDC is UP while +y in CSS pixels is DOWN.
        hud.writeProjection(out, 0, 0, false, VIEWPORT);
        expect(out).toMatchObject({ x: 500, y: 300, onScreen: true, behind: false });

        hud.writeProjection(out, 1, 1, false, VIEWPORT);
        expect(out.x).toBe(1000);
        expect(out.y).toBe(0);
    });

    test('a point BEHIND the eye is unmirrored and reported off-screen', () => {
        // The whole point. Behind the camera, the projection comes back flipped
        // through the origin, so something over your left shoulder projects to
        // the right of the screen. Flipping it back is what points a chevron
        // the correct way; calling it off-screen is what stops a pip being
        // drawn on top of empty sky.
        const out = {};
        hud.writeProjection(out, 0.5, 0.5, true, VIEWPORT);

        expect(out.behind).toBe(true);
        expect(out.onScreen).toBe(false);
        // Unmirrored: an NDC of +0.5, +0.5 behind the eye is really down-left.
        expect(out.x).toBeLessThan(VIEWPORT.width / 2);
        expect(out.y).toBeGreaterThan(VIEWPORT.height / 2);
    });

    test('a point beyond the frame edges is in front but not on screen', () => {
        const out = {};
        hud.writeProjection(out, 1.4, 0, false, VIEWPORT);
        expect(out.behind).toBe(false);
        expect(out.onScreen).toBe(false);
        hud.writeProjection(out, 0, -1.4, false, VIEWPORT);
        expect(out.onScreen).toBe(false);
    });

    test('the frame edge itself counts as on screen', () => {
        const out = {};
        hud.writeProjection(out, -1, 1, false, VIEWPORT);
        expect(out.onScreen).toBe(true);
    });

    test('projectToScreen checks the view-space z before it projects at all', () => {
        const camera = fakeCamera({ x: 0, y: 0, z: 0 });
        // In front: view-space z is negative, the eye looks down -Z.
        expect(hud.projectToScreen({ x: 0, y: 0, z: -100 }, camera, VIEWPORT).behind).toBe(false);
        // Behind, and at exactly the eye plane, which is also behind.
        expect(hud.projectToScreen({ x: 0, y: 0, z: 100 }, camera, VIEWPORT).behind).toBe(true);
        expect(hud.projectToScreen({ x: 0, y: 0, z: 0 }, camera, VIEWPORT).behind).toBe(true);
        // The world matrix is refreshed each time, or a moving camera would
        // project against where it was last frame.
        expect(camera.updated).toBe(3);
    });

    test('the projection record is reused rather than reallocated per marker', () => {
        const camera = fakeCamera();
        const first = hud.projectToScreen({ x: 0, y: 0, z: -10 }, camera, VIEWPORT);
        expect(hud.projectToScreen({ x: 1, y: 0, z: -10 }, camera, VIEWPORT)).toBe(first);
        expect(hud.getProjection()).toBe(first);
    });

    test('with no window it falls back to a sane viewport instead of throwing', () => {
        delete globalThis.window;
        const camera = fakeCamera();
        expect(() => hud.projectToScreen({ x: 0, y: 0, z: -10 }, camera)).not.toThrow();
    });
});

describe('clampToEdge', () => {
    const inset = 50;

    test('slides a point out to the inset border, on the same bearing', () => {
        // Straight up from the centre: it should land on the top border and
        // point up, which is -PI/2 with zero pointing right.
        const out = hud.clampToEdge(500, -4000, VIEWPORT, inset);
        expect(out.y).toBeCloseTo(inset, 6);
        expect(out.x).toBeCloseTo(500, 6);
        expect(out.angle).toBeCloseTo(-Math.PI / 2, 6);
    });

    test('lands on the side border when the bearing is mostly horizontal', () => {
        const out = hud.clampToEdge(9000, 300, VIEWPORT, inset);
        expect(out.x).toBeCloseTo(VIEWPORT.width - inset, 6);
        expect(out.angle).toBeCloseTo(0, 6);
    });

    test('pushes a point that is already inside out to the border too', () => {
        // Chevrons always sit ON the edge. Deciding WHEN one is warranted is
        // the caller's job, so the maths never has to guess.
        const out = hud.clampToEdge(520, 300, VIEWPORT, inset);
        expect(out.x).toBeCloseTo(VIEWPORT.width - inset, 6);
    });

    test('dead centre has no bearing at all, so it points up rather than NaN', () => {
        const out = hud.clampToEdge(500, 300, VIEWPORT, inset);
        expect(Number.isNaN(out.angle)).toBe(false);
        expect(out.angle).toBeCloseTo(-Math.PI / 2, 6);
    });

    test('a viewport smaller than the inset still produces a point on screen', () => {
        const tiny = { width: 60, height: 40 };
        const out = hud.clampToEdge(0, 0, tiny, 100);
        expect(Number.isFinite(out.x)).toBe(true);
        expect(Number.isFinite(out.y)).toBe(true);
    });
});

// ---- The readouts -----------------------------------------------------------

describe('the counters', () => {
    test('both counts are written on the first frame', () => {
        hud.initHud(CONFIG);
        hud.updateHud(view());
        expect(nodes.get('structures-count').textContent).toBe('7');
        expect(nodes.get('ships-count').textContent).toBe('12');
    });

    test('nothing is rewritten while nothing has changed', () => {
        // Layout is the expensive part of a DOM overlay and this runs sixty
        // times a second, so a counter that has not moved must not be touched.
        hud.initHud(CONFIG);
        hud.updateHud(view());

        let writes = 0;
        const node = nodes.get('ships-count');
        Object.defineProperty(node, 'textContent', {
            set() { writes++; }, get() { return '12'; }, configurable: true
        });

        for (let i = 0; i < 30; i++) hud.updateHud(view());
        expect(writes).toBe(0);

        hud.updateHud(view({ shipsRemaining: 11 }));
        expect(writes).toBe(1);
    });

    test('the clock only ticks over on a whole second', () => {
        hud.initHud(CONFIG);
        hud.updateHud(view({ elapsed: 0 }));
        expect(nodes.get('elapsed-time').textContent).toBe('0:00');
        hud.updateHud(view({ elapsed: 65.4 }));
        expect(nodes.get('elapsed-time').textContent).toBe('1:05');
    });

    test('formatClock reads as a stopwatch rather than as a clock', () => {
        expect(hud.formatClock(0)).toBe('0:00');
        expect(hud.formatClock(9.9)).toBe('0:09');
        expect(hud.formatClock(600)).toBe('10:00');
        // Never negative, whatever the caller hands it.
        expect(hud.formatClock(-5)).toBe('0:00');
        expect(hud.formatClock(undefined)).toBe('0:00');
    });

    test('formatDistance rounds hard, because nothing is navigated to the metre', () => {
        // A readout whose last digits churn every frame is noise sitting next
        // to the reticle.
        expect(hud.formatDistance(0)).toBe('0 km');
        expect(hud.formatDistance(1234.6)).toBe('1,235 km');
        expect(hud.formatDistance(64000)).toBe('64k km');
        expect(hud.formatDistance(-10)).toBe('0 km');
    });
});

describe('the alert banner', () => {
    const alert = { id: 'moon-a', label: 'Quiet Sea', body: 'moon', position: { x: 0, y: 0, z: -100 } };

    test('names the installation, and goes away again', () => {
        hud.initHud(CONFIG);
        hud.updateHud(view({ alert }));
        expect(nodes.get('alert-banner').textContent).toBe('Quiet Sea is under attack');
        expect(nodes.get('alert-banner').hidden).toBe(false);

        hud.updateHud(view({ alert: null }));
        expect(nodes.get('alert-banner').hidden).toBe(true);
    });

    test('every counter and the alert are also a sentence, for a screen reader', () => {
        // PRD 8.5, built in now rather than retrofitted at M8.
        hud.initHud(CONFIG);
        hud.updateHud(view());
        expect(nodes.get('objective-status').textContent)
            .toBe('7 installations standing, 12 raiders left.');

        hud.updateHud(view({ alert, structuresRemaining: 6 }));
        expect(nodes.get('objective-status').textContent)
            .toBe('6 installations standing, 12 raiders left. Quiet Sea is under attack.');
    });

    test('news leads the sentence, because it is what is worth interrupting for', () => {
        // Events live in the OBJECTIVE region rather than beside the lock
        // state, which is rewritten on every change of target and would
        // overwrite a one-off line within a frame or two.
        hud.initHud(CONFIG);
        hud.updateHud(view({ event: 'Northwatch destroyed.', structuresRemaining: 6 }));
        expect(nodes.get('objective-status').textContent)
            .toBe('Northwatch destroyed. 6 installations standing, 12 raiders left.');
    });

    test('the live region is not rewritten while nothing has changed', () => {
        // A polite region that repeats itself sixty times a second is a region
        // nobody can use.
        hud.initHud(CONFIG);
        hud.updateHud(view());
        let writes = 0;
        const node = nodes.get('objective-status');
        Object.defineProperty(node, 'textContent', {
            set() { writes++; }, get() { return ''; }, configurable: true
        });
        for (let i = 0; i < 20; i++) hud.updateHud(view({ elapsed: i }));
        expect(writes).toBe(0);
    });
});

// ---- The markers ------------------------------------------------------------

describe('hostile pips', () => {
    test('there is one per raider, and the fleet size comes from config', () => {
        hud.initHud(CONFIG);
        expect(hud.__test__.getPips()).toHaveLength(CONFIG.fleet.total);
        expect(nodes.get('hostile-pips').children).toHaveLength(CONFIG.fleet.total);
    });

    test('a pip shows at ANY distance, which is the whole point of it', () => {
        // A raider 200,000 units out is a few pixels of running light and would
        // otherwise be indistinguishable from a star (PRD 8.1).
        hud.initHud(CONFIG);
        const far = raiders(-200000);
        hud.updateHud(view({ ships: far }));
        expect(hud.__test__.getPips()[0].hidden).toBe(false);
    });

    test('a pip for a raider behind the visitor is hidden, not mirrored', () => {
        hud.initHud(CONFIG);
        const behind = raiders(5000);
        hud.updateHud(view({ ships: behind }));
        for (const pip of hud.__test__.getPips()) expect(pip.hidden).toBe(true);
    });

    test('a destroyed raider takes its pip with it', () => {
        hud.initHud(CONFIG);
        const fleet = raiders();
        hud.updateHud(view({ ships: fleet }));
        expect(hud.__test__.getPips()[3].hidden).toBe(false);

        fleet[3].alive = false;
        hud.updateHud(view({ ships: fleet }));
        expect(hud.__test__.getPips()[3].hidden).toBe(true);
    });

    test('a pip is positioned by transform, so it composites rather than reflows', () => {
        hud.initHud(CONFIG);
        hud.updateHud(view({ ships: raiders() }));
        expect(hud.__test__.getPips()[0].style.transform).toMatch(/^translate\(-50%, -50%\) translate\(/);
    });
});

describe('the nav markers', () => {
    test('one per configured place worth going, labelled', () => {
        hud.initHud(CONFIG);
        const markers = hud.__test__.getNavMarkers();
        expect(markers.map(m => m.id)).toEqual(CONFIG.hud.navPoints.map(p => p.id));
    });

    test('the distance is read LIVE, because the Moon is moving', () => {
        // A cached bearing or distance is what makes an interception feel
        // broken (PRD 5.2), so this is asserted rather than commented.
        hud.initHud(CONFIG);
        const bodies = { earth: { x: 0, y: 0, z: -1000 }, moon: { x: 0, y: 0, z: -5000 } };
        hud.updateHud(view({ bodies }));
        const moon = hud.__test__.getNavMarkers().find(m => m.id === 'moon');
        expect(moon.distance.textContent).toBe('5,000 km');

        bodies.moon.z = -12000;
        hud.updateHud(view({ bodies }));
        expect(moon.distance.textContent).toBe('12k km');
    });

    test('a body with no live position is simply not marked', () => {
        hud.initHud(CONFIG);
        hud.updateHud(view({ bodies: {} }));
        for (const m of hud.__test__.getNavMarkers()) expect(m.marker.hidden).toBe(true);
    });
});

describe('the edge chevrons', () => {
    const offScreen = { x: 0, y: 0, z: -100 };

    test('point at the installation under attack when it is off screen', () => {
        hud.initHud(CONFIG);
        // Far off to the left and in front, so it projects outside the frame.
        const alert = { id: 'moon-a', label: 'Quiet Sea', position: { x: -9000, y: 0, z: -100 } };
        hud.updateHud(view({ alert }));

        const chevron = nodes.get('chevron-alert');
        expect(chevron.hidden).toBe(false);
        expect(chevron.style.transform).toMatch(/rotate\(/);
    });

    test('go away once the thing they point at is on screen', () => {
        // The pip or the nav ring is already doing the job, and a chevron as
        // well would be pointing at something the visitor is looking at.
        hud.initHud(CONFIG);
        const alert = { id: 'moon-a', label: 'Quiet Sea', position: offScreen };
        hud.updateHud(view({ alert }));
        expect(nodes.get('chevron-alert').hidden).toBe(true);
    });

    test('the hostile chevron follows the NEAREST raider, not the first one', () => {
        hud.initHud(CONFIG);
        const ships = [
            { id: 'a', alive: true, position: { x: -90000, y: 0, z: -100 } },
            { id: 'b', alive: true, position: { x: -9000, y: 0, z: -100 } }
        ];
        hud.updateHud(view({ ships, playerPosition: { x: 0, y: 0, z: 0 } }));
        const near = nodes.get('chevron-hostile');
        expect(near.hidden).toBe(false);

        // Both are off to the left, so the transform tells them apart by how
        // far from the centre the projection was before it was clamped, which
        // it is not; what IS assertable is that the nearer one drives it.
        ships[1].alive = false;
        hud.updateHud(view({ ships, playerPosition: { x: 0, y: 0, z: 0 } }));
        expect(near.hidden).toBe(false);
    });

    test('no raiders and no alert means no chevrons', () => {
        hud.initHud(CONFIG);
        hud.updateHud(view());
        expect(nodes.get('chevron-alert').hidden).toBe(true);
        expect(nodes.get('chevron-hostile').hidden).toBe(true);
    });

    test('with no player position there is no nearest anything', () => {
        hud.initHud(CONFIG);
        hud.updateHud(view({ ships: raiders(), playerPosition: null }));
        expect(nodes.get('chevron-hostile').hidden).toBe(true);
    });
});

// ---- Lifecycle --------------------------------------------------------------

describe('lifecycle', () => {
    test('a page missing every HUD element renders the scene and says nothing', () => {
        // The HUD is an overlay on a 3D experience, not the experience. A
        // cut-down page should lose the counters, not the game.
        installDom([]);
        hud.initHud(CONFIG);
        expect(() => hud.updateHud(view({ ships: raiders() }))).not.toThrow();
        expect(hud.__test__.getPips()).toHaveLength(0);
    });

    test('updating before init, or with nothing to show, is a quiet no-op', () => {
        expect(() => hud.updateHud(view())).not.toThrow();
        hud.initHud(CONFIG);
        expect(() => hud.updateHud(null)).not.toThrow();
    });

    test('a frame with no camera still writes the counters', () => {
        // The counters are DOM text and cost nothing. Only the projected
        // markers need a camera, so losing one should not blank the panel.
        hud.initHud(CONFIG);
        hud.updateHud(view({ camera: null, structuresRemaining: 5 }));
        expect(nodes.get('structures-count').textContent).toBe('5');
    });

    test('dispose empties the built markers and forgets what was on screen', () => {
        hud.initHud(CONFIG);
        hud.updateHud(view());
        hud.disposeHud();

        expect(hud.__test__.getPips()).toHaveLength(0);
        expect(hud.__test__.getNavMarkers()).toHaveLength(0);
        expect(nodes.get('hostile-pips').children).toHaveLength(0);
        expect(hud.__test__.shown.spoken).toBeNull();
        expect(() => hud.disposeHud()).not.toThrow();
    });

    test('re-initialising rebuilds the pips rather than doubling them', () => {
        hud.initHud(CONFIG);
        hud.initHud(CONFIG);
        expect(hud.__test__.getPips()).toHaveLength(CONFIG.fleet.total);
        expect(nodes.get('hostile-pips').children).toHaveLength(CONFIG.fleet.total);
    });

    test('a config with no fleet or nav points builds an empty HUD', () => {
        hud.initHud({ fleet: undefined, hud: {} });
        expect(hud.__test__.getPips()).toHaveLength(0);
        expect(hud.__test__.getNavMarkers()).toHaveLength(0);
    });
});
