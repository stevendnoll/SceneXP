// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * The studio and its stations (M2 piece 2): the room is closed everywhere
 * but the glass, nothing stands where a camera does or in its line of
 * sight, every station's eye stays inside the room on every screen shape,
 * glides land where they say, and the street stays outside.
 *
 * Plain numbers throughout (studio.js shellBoxes and footprints, street.js
 * streetPlan, stations.js), so these say where things are, not how they
 * look. Steve's screenshot round is the other half.
 */
import { installThree, keepPropRecords } from './helpers/three-stub.mjs';
import { loadRealThree } from './helpers/real-three.mjs';
import { CONFIG } from '../www/whitestone/js/config.js';
import {
    HOME_STATION, fovFor, poseFor, zoomedFov, smoothstep, blendPose, createGlide
} from '../www/whitestone/js/stations.js';
import {
    shellBoxes, mullionXs, glassOpening, footprints, contactGrid, contactPatches, seeded, buildStudio, WALL
} from '../www/whitestone/js/studio.js';
import { streetBands, streetPlan, buildStreet } from '../www/whitestone/js/street.js';
import { MODEL } from '../www/whitestone/js/layout.js';

const { width, depth, height } = CONFIG.room;
const hw = width / 2;
const hd = depth / 2;
const EPS = 1e-9;

const inside = (b, p) => p.every((v, i) => v >= b.min[i] - EPS && v <= b.max[i] + EPS);

// ---- The shell --------------------------------------------------------------

describe('the shell', () => {
    const boxes = shellBoxes(CONFIG.room);
    const solid = boxes.filter((b) => b.finish !== 'aluminum' && b.finish !== 'reveal');
    const glass = glassOpening(CONFIG.room);
    const grid = (n) => Array.from({ length: n + 1 }, (_, i) => i / n);

    test('every side of the room is plaster, stone or ceiling, but the glass', () => {
        const faces = [
            (u, v) => [-hw + u * width, 0, -hd + v * depth],         // floor
            (u, v) => [-hw + u * width, height, -hd + v * depth],    // ceiling
            (u, v) => [-hw, v * height, -hd + u * depth],             // left
            (u, v) => [hw, v * height, -hd + u * depth],              // right
            (u, v) => [-hw + u * width, v * height, hd],              // entrance
            (u, v) => [-hw + u * width, v * height, -hd]              // the glass wall
        ];
        const open = [];
        for (const face of faces) {
            for (const u of grid(48)) {
                for (const v of grid(17)) {
                    const p = face(u, v);
                    if (!solid.some((b) => inside(b, p))) open.push(p);
                }
            }
        }
        // Every opening found is in the glass, and there is one.
        expect(open.length).toBeGreaterThan(0);
        for (const p of open) {
            expect(p[2]).toBeCloseTo(-hd, 9);
            expect(p[0]).toBeGreaterThan(glass.x0 - EPS);
            expect(p[0]).toBeLessThan(glass.x1 + EPS);
        }
    });

    test('the glass runs floor to ceiling, and each pane between mullions is clear', () => {
        const xs = mullionXs(CONFIG.room.glass);
        expect(xs[0]).toBe(glass.x0);
        expect(xs[xs.length - 1]).toBe(glass.x1);
        expect(glass.y1 - glass.y0).toBe(height);
        for (let i = 0; i < xs.length - 1; i++) {
            const mid = (xs[i] + xs[i + 1]) / 2;
            for (const y of [0.3, height / 2, height - 0.3]) {
                expect(boxes.some((b) => inside(b, [mid, y, -hd]))).toBe(false);
            }
        }
        // The frame is evenly spaced, no wider than asked.
        const gaps = xs.slice(1).map((x, i) => x - xs[i]);
        for (const g of gaps) {
            expect(g).toBeCloseTo(gaps[0], 9);
            expect(g).toBeLessThanOrEqual(CONFIG.room.glass.mullionEvery + EPS);
        }
    });

    test('the mullions fall evenly for any span, ends included', () => {
        expect(mullionXs({ x0: -4, x1: 4, mullionEvery: 2 })).toEqual([-4, -2, 0, 2, 4]);
        expect(mullionXs({ x0: 0, x1: 3, mullionEvery: 2 })).toEqual([0, 1.5, 3]);
        expect(mullionXs({ x0: 0, x1: 0.5, mullionEvery: 2 })).toEqual([0, 0.5]);
    });

    test('nothing of the shell stands inside the room', () => {
        for (const b of boxes.filter((x) => x.finish !== 'reveal')) {
            // Each box touches the room's boundary or the glass line, and
            // reaches no further in than the frame's own depth.
            const intrudes = b.min[0] > -hw + 0.06 && b.max[0] < hw - 0.06
                && b.min[1] > 0.06 && b.max[1] < height - 0.06
                && b.min[2] > -hd + 0.06 && b.max[2] < hd - 0.06;
            expect(`${b.name} intrudes: ${intrudes}`).toBe(`${b.name} intrudes: false`);
        }
        expect(WALL).toBeGreaterThan(0);
    });
});

// ---- The furniture ----------------------------------------------------------

describe('the furniture', () => {
    const things = footprints(CONFIG);

    test('everything stands inside the room, clear of the walls', () => {
        for (const f of things) {
            expect(f.x0).toBeGreaterThan(-hw);
            expect(f.x1).toBeLessThan(hw);
            expect(f.z0).toBeGreaterThan(-hd);
            expect(f.z1).toBeLessThan(hd);
            expect(f.top).toBeLessThan(height);
        }
    });

    test('no two things overlap, and each leaves room to walk between', () => {
        for (let i = 0; i < things.length; i++) {
            for (let j = i + 1; j < things.length; j++) {
                const a = things[i];
                const b = things[j];
                const gap = Math.max(b.x0 - a.x1, a.x0 - b.x1, b.z0 - a.z1, a.z0 - b.z1);
                expect(`${a.name} to ${b.name}: ${gap > 0.5}`).toBe(`${a.name} to ${b.name}: true`);
            }
        }
    });

    test('the plinth is big enough for the widest house model', () => {
        // A home with both garages: the annex on one side of the stories and
        // the detached garage on the other (layout.js MODEL), with a margin.
        const p = CONFIG.studio.plinth;
        const { footprint, annex, detached } = MODEL;
        const widest = footprint.width + annex.gap + annex.width + detached.gap + detached.width;
        expect(p.width).toBeGreaterThan(widest + 0.2);
        expect(p.depth).toBeGreaterThan(Math.max(footprint.depth, annex.depth, detached.depth) + 0.2);
    });

    test('the menu and the board hang on the plaster piers, not on the glass', () => {
        for (const s of [CONFIG.studio.menu, CONFIG.studio.board]) {
            const [x0, x1] = [s.x - s.width / 2, s.x + s.width / 2];
            const onLeftPier = x0 > -hw && x1 < glass().x0;
            const onRightPier = x0 > glass().x1 && x1 < hw;
            expect(onLeftPier || onRightPier).toBe(true);
            expect(s.y - s.height / 2).toBeGreaterThan(0.6);
            expect(s.y + s.height / 2).toBeLessThan(height - 0.4);
        }
        function glass() { return glassOpening(CONFIG.room); }
    });
});

// ---- The sun -----------------------------------------------------------------

describe('the sun', () => {
    test("every corner of the room, walls and all, is inside the sun's shadow box", () => {
        // Outside the box three lights a surface as if nothing shades it, so
        // a corner left out would glow in sun through a solid wall.
        const { position, target, shadow } = CONFIG.light.sun;
        const dir = position.map((v, i) => v - target[i]);
        const len = Math.hypot(...dir);
        const d = dir.map((v) => v / len);
        const T = WALL;
        for (const x of [-hw - T, hw + T]) {
            for (const y of [-T, height + T]) {
                for (const z of [-hd - T, hd + T]) {
                    const v = [x - target[0], y - target[1], z - target[2]];
                    const along = v.reduce((n, c, i) => n + c * d[i], 0);
                    const across = Math.sqrt(Math.max(0, v.reduce((n, c) => n + c * c, 0) - along * along));
                    // The box is square, so a corner inside the circle that
                    // fits in it is inside the box.
                    expect(across).toBeLessThan(shadow.reach);
                    expect(len - along).toBeGreaterThan(shadow.near);
                    expect(len - along).toBeLessThan(shadow.far);
                }
            }
        }
    });

    test('the sun comes in through the glass, from above', () => {
        const { position, target } = CONFIG.light.sun;
        expect(position[2]).toBeLessThan(-hd);
        expect(position[1]).toBeGreaterThan(height);
        // Its light lands on the floor inside the room: follow the ray
        // through the middle of the glass's top down to the floor.
        const dir = target.map((v, i) => v - position[i]);
        const g = glassOpening(CONFIG.room);
        const through = [(g.x0 + g.x1) / 2, g.y1, g.z];
        const t = -through[1] / dir[1];
        const floor = [through[0] + dir[0] * t, 0, through[2] + dir[2] * t];
        expect(floor[2]).toBeGreaterThan(CONFIG.studio.plinth.z - CONFIG.studio.plinth.depth / 2);
        expect(floor[2]).toBeLessThan(hd);
    });
});

// ---- Contact shadows ----------------------------------------------------------

describe('contact shadows', () => {
    test('a patch is darkest under its middle and fades to nothing at its edge', () => {
        const patch = { w: 2, d: 1, soft: 0.2, alpha: 0.5 };
        const { xs, zs, fade } = contactGrid(patch);
        expect(fade(0, 0)).toBeCloseTo(0.5, 9);
        expect(fade(1, 0)).toBeCloseTo(0, 9);
        expect(fade(0, 0.5)).toBeCloseTo(0, 9);
        expect(fade(0.9, 0)).toBeGreaterThan(0);
        expect(fade(0.9, 0)).toBeLessThan(0.5);
        expect(xs[0]).toBe(-1);
        expect(xs[xs.length - 1]).toBe(1);
        expect(zs).toEqual([...zs].sort((a, b) => a - b));
    });

    test('one patch per thing on the floor, each larger than what stands on it', () => {
        const patches = contactPatches(CONFIG);
        const things = footprints(CONFIG);
        expect(patches).toHaveLength(things.length);
        patches.forEach((p, i) => {
            expect(p.w).toBeGreaterThan(things[i].x1 - things[i].x0);
            expect(p.d).toBeGreaterThan(things[i].z1 - things[i].z0);
        });
    });
});

// ---- Stations -------------------------------------------------------------------

describe('stations', () => {
    const keys = Object.keys(CONFIG.stations);
    const aspects = [21 / 9, 16 / 10, 4 / 3, 1, 0.75, 0.56, 0.45, 0.3];

    test('the six stations of PLANNING 6.1, arriving at the overview', () => {
        expect(keys.sort()).toEqual(['board', 'desk', 'menu', 'model', 'overview', 'printer']);
        expect(HOME_STATION).toBe('overview');
        expect(poseFor('nowhere', 1.6, CONFIG)).toEqual(poseFor('overview', 1.6, CONFIG));
    });

    test.each(keys)('%s keeps its eye inside the room on every screen shape', (key) => {
        for (const a of aspects) {
            const { eye, fov } = poseFor(key, a, CONFIG);
            expect(Math.abs(eye[0])).toBeLessThan(hw - 0.1);
            expect(Math.abs(eye[2])).toBeLessThan(hd - 0.1);
            expect(eye[1]).toBeGreaterThan(0.9);
            expect(eye[1]).toBeLessThan(height - 0.4);
            expect(fov).toBeLessThanOrEqual(CONFIG.view.maxFov);
        }
    });

    // What each station looks at, which its line of sight may reach.
    const SUBJECT = { model: 'plinth', desk: 'desk', printer: 'console' };

    test.each(keys)('%s sees its subject over everything else in the room', (key) => {
        const things = footprints(CONFIG).filter((f) => f.name !== SUBJECT[key]);
        for (const a of [16 / 10, 0.45]) {
            const { eye, aim } = poseFor(key, a, CONFIG);
            for (let i = 0; i <= 100; i++) {
                const t = i / 100;
                const p = eye.map((v, k) => v + (aim[k] - v) * t);
                for (const f of things) {
                    const blocked = p[0] > f.x0 && p[0] < f.x1 && p[2] > f.z0 && p[2] < f.z1 && p[1] < f.top;
                    expect(`${key} through ${f.name}: ${blocked}`).toBe(`${key} through ${f.name}: false`);
                }
            }
        }
    });

    test('a narrow screen widens the lens and steps back, a wide one does neither', () => {
        const wide = poseFor('model', 16 / 10, CONFIG);
        const phone = poseFor('model', 0.45, CONFIG);
        const s = CONFIG.stations.model;
        expect(wide.eye).toEqual(s.eye);
        expect(wide.fov).toBe(s.fov);
        expect(poseFor('model', 21 / 9, CONFIG).fov).toBe(s.fov);
        expect(phone.fov).toBeGreaterThan(s.fov);
        // Stepped back by the whole retreat, along the line of sight.
        const back = phone.eye.map((v, i) => v - s.eye[i]);
        expect(Math.hypot(...back)).toBeCloseTo(s.retreat, 9);
        const sight = s.eye.map((v, i) => v - s.aim[i]);
        const cos = back.reduce((n, v, i) => n + v * sight[i], 0) / (Math.hypot(...back) * Math.hypot(...sight));
        expect(cos).toBeCloseTo(1, 9);
        // The aim never moves.
        expect(phone.aim).toEqual(s.aim);
    });

    test('a widened lens keeps the reference width until the cap', () => {
        const ref = 16 / 10;
        const f = fovFor(42, 1, ref, 80);
        const hRef = Math.atan(Math.tan((42 * Math.PI) / 360) * ref);
        const hNow = Math.atan(Math.tan((f * Math.PI) / 360) * 1);
        expect(hNow).toBeCloseTo(hRef, 9);
        expect(fovFor(42, 0.2, ref, 80)).toBe(80);
        expect(fovFor(42, 0, ref, 80)).toBe(42);
        expect(fovFor(42, NaN, ref, 80)).toBe(42);
    });

    test('a zoom of one doubling halves the lens in tan space, and never opens past the cap', () => {
        expect(zoomedFov(50, 0, 80)).toBeCloseTo(50, 9);
        const t = Math.tan((zoomedFov(50, 1, 80) * Math.PI) / 360);
        expect(t).toBeCloseTo(Math.tan((50 * Math.PI) / 360) / 2, 9);
        expect(zoomedFov(70, -1, 80)).toBe(80);
    });
});

describe('glides', () => {
    const a = { eye: [0, 1, 2], aim: [0, 0, 0], fov: 50 };
    const b = { eye: [4, 2, -2], aim: [1, 1, 1], fov: 40 };

    test('eased: still at both ends, half way at the middle', () => {
        expect(smoothstep(0)).toBe(0);
        expect(smoothstep(1)).toBe(1);
        expect(smoothstep(0.5)).toBe(0.5);
        expect(smoothstep(-1)).toBe(0);
        expect(smoothstep(2)).toBe(1);
        expect(smoothstep(0.01)).toBeLessThan(0.01);
        expect(smoothstep(0.99)).toBeGreaterThan(0.99);
    });

    test('a glide lands exactly on its station, and says when', () => {
        const g = createGlide(a, b, 1.8);
        let pose = g.step(0);
        expect(pose).toEqual(blendPose(a, b, 0));
        expect(g.done).toBe(false);
        pose = g.step(0.9);
        expect(pose.fov).toBeCloseTo(45, 9);
        expect(g.done).toBe(false);
        pose = g.step(1.2);
        expect(g.done).toBe(true);
        expect(pose).toEqual(b);
    });

    test('a glide starts and lands gently, not at an even pace', () => {
        const g = createGlide(a, b, 1);
        // A tenth of the time, well under a tenth of the way.
        expect(g.step(0.1).fov).toBeGreaterThan(49.5);
        g.step(0.8);
        // And a tenth from the end, well past nine tenths.
        expect(g.step(0).fov).toBeLessThan(40.5);
    });

    test('under reduced motion a glide is a cut', () => {
        const g = createGlide(a, b, 0);
        expect(g.done).toBe(true);
        expect(g.step(0)).toEqual(b);
    });

    test('a glide moves forward only, whatever the frame time', () => {
        const g = createGlide(a, b, 1);
        g.step(0.5);
        const pose = g.step(-5);
        expect(pose.fov).toBeCloseTo(45, 9);
    });
});

// ---- The street -------------------------------------------------------------------

describe('the street', () => {
    const plan = streetPlan(CONFIG);

    test('the bands run outward from the glass without a gap', () => {
        const bands = streetBands(CONFIG);
        expect(bands[0].z0).toBe(-hd);
        for (let i = 1; i < bands.length; i++) expect(bands[i].z0).toBe(bands[i - 1].z1);
        for (const b of bands) expect(b.z1).toBeLessThan(b.z0);
        // The road is a curb below the sidewalks either side of it.
        const top = (n) => bands.find((b) => b.name === n).top;
        expect(top('road')).toBeLessThan(top('sidewalk') - 0.1);
        expect(top('road')).toBeLessThan(top('farSidewalk') - 0.1);
    });

    test('the same street on every visit', () => {
        expect(streetPlan(CONFIG)).toEqual(plan);
    });

    test('nothing of the street stands inside the studio or in the road', () => {
        const road = plan.bands.find((b) => b.name === 'road');
        for (const t of [...plan.trees, ...plan.backdrop]) {
            expect(t.z + t.radius).toBeLessThan(-hd);
            const trunk = t.radius * 0.1;
            const inRoad = t.z + trunk > road.z1 && t.z - trunk < road.z0;
            expect(inRoad).toBe(false);
        }
        for (const h of plan.homes) {
            expect(h.z).toBeLessThan(road.z1);
            if (h.upper) expect(h.z + h.upper.over).toBeLessThan(road.z1 - 3);
        }
    });

    test('no tree stands in the middle of the view, behind the model', () => {
        const clear = CONFIG.street.clearCenter;
        expect(clear).toBeGreaterThan(CONFIG.studio.plinth.width);
        for (const t of plan.trees) expect(Math.abs(t.x) - t.radius).toBeGreaterThan(clear);
        // And the street still has its trees.
        expect(plan.trees.length).toBeGreaterThan(20);
    });

    test('the homes stand side by side, never in each other', () => {
        const spans = plan.homes.map((h) => {
            const parts = [[h.x - h.width / 2, h.x + h.width / 2]];
            if (h.upper) parts.push([h.x + h.upper.shift - h.upper.width / 2, h.x + h.upper.shift + h.upper.width / 2]);
            return [Math.min(...parts.map((p) => p[0])), Math.max(...parts.map((p) => p[1]))];
        });
        for (let i = 1; i < spans.length; i++) expect(spans[i][0]).toBeGreaterThan(spans[i - 1][1] + 1);
        expect(plan.homes.length).toBeGreaterThan(8);
    });

    test('the seeded numbers are the same from the same seed and differ between seeds', () => {
        const one = seeded(7);
        const two = seeded(7);
        const other = seeded(8);
        const a = [one(), one(), one()];
        expect([two(), two(), two()]).toEqual(a);
        expect([other(), other(), other()]).not.toEqual(a);
        for (const v of a) {
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });
});

// ---- Built (the three stub) ---------------------------------------------------------

describe('built', () => {
    beforeEach(() => {
        installThree();
        keepPropRecords();
    });

    test('the studio builds, with a pick key on each thing a visitor can choose', () => {
        const studio = buildStudio(CONFIG);
        expect(Object.keys(studio.picks).sort()).toEqual(['board', 'desk', 'menu', 'model', 'printer']);
        for (const [key, group] of Object.entries(studio.picks)) expect(group.userData.pick).toBe(key);
        expect(studio.faces.menu).toBeTruthy();
        expect(studio.faces.board).toBeTruthy();
        const p = CONFIG.studio.plinth;
        expect(studio.plinthTop).toEqual([p.x, p.height, p.z]);
    });

    test('the street builds, with its sky', () => {
        const street = buildStreet(CONFIG);
        expect(street.group).toBeTruthy();
        expect(street.sky).toBeTruthy();
        expect(street.plan.homes.length).toBeGreaterThan(0);
    });
});

// ---- Built (real three) -------------------------------------------------------------

describe('built with the real three.js', () => {
    let REAL;
    beforeAll(async () => {
        REAL = await loadRealThree();
    });
    beforeEach(() => {
        globalThis.THREE = REAL;
    });

    const meshesOf = (group) => {
        const out = [];
        group.traverse((o) => { if (o.isMesh) out.push(o); });
        return out;
    };
    const boundsOf = (object) => {
        object.updateMatrixWorld(true);
        return new REAL.Box3().setFromObject(object);
    };

    test('the studio is a handful of draw calls', () => {
        const studio = buildStudio(CONFIG);
        const meshes = meshesOf(studio.group);
        // Measured 32 (2026-10-12): 14 in the still room, the rest the five
        // things a visitor can pick, the glass and the contact shadows.
        expect(meshes.length).toBeLessThanOrEqual(36);
        // One mesh per material in the still part of the room.
        const shell = meshes.filter((m) => m.name === 'shell');
        expect(new Set(shell.map((m) => m.material)).size).toBe(shell.length);
    });

    test('the plinth is a stone top on a narrower base, not a block', () => {
        const studio = buildStudio(CONFIG);
        const p = CONFIG.studio.plinth;
        const parts = meshesOf(studio.picks.model).map((m) => ({ m, b: boundsOf(m) }));
        const top = parts.find(({ m }) => m.material.name === 'stone');
        const base = parts.find(({ m }) => m.material.name === 'white');
        expect(top.b.max.x - top.b.min.x).toBeCloseTo(p.width, 6);
        expect(top.b.max.y - top.b.min.y).toBeCloseTo(p.top, 6);
        expect(base.b.max.x - base.b.min.x).toBeCloseTo(p.width - 2 * p.inset, 6);
        expect(base.b.max.z - base.b.min.z).toBeCloseTo(p.depth - 2 * p.inset, 6);
        expect(base.b.max.y).toBeCloseTo(top.b.min.y, 6);
    });

    test('the plinth top is where the house model will stand, and the plinth is on the floor', () => {
        const studio = buildStudio(CONFIG);
        const b = boundsOf(studio.picks.model);
        const p = CONFIG.studio.plinth;
        expect(b.max.y).toBeCloseTo(p.height, 6);
        expect(b.min.y).toBeCloseTo(0, 6);
        expect(b.max.x - b.min.x).toBeCloseTo(p.width, 6);
        expect((b.min.z + b.max.z) / 2).toBeCloseTo(p.z, 6);
    });

    test('each picked thing stands where its footprint says', () => {
        const studio = buildStudio(CONFIG);
        const plan = Object.fromEntries(footprints(CONFIG).map((f) => [f.name, f]));
        for (const [key, name] of [['desk', 'desk'], ['printer', 'console']]) {
            const b = boundsOf(studio.picks[key]);
            const f = plan[name];
            expect((b.min.x + b.max.x) / 2).toBeCloseTo((f.x0 + f.x1) / 2, 2);
            expect(b.min.y).toBeCloseTo(0, 6);
            // Within the printer's top panel, a few millimeters proud.
            expect(Math.abs(b.max.y - f.top)).toBeLessThan(0.005);
        }
    });

    test('the menu and board faces look into the room, in front of their panels', () => {
        const studio = buildStudio(CONFIG);
        for (const key of ['menu', 'board']) {
            const face = studio.faces[key];
            face.updateMatrixWorld(true);
            const normal = new REAL.Vector3(0, 0, 1).transformDirection(face.matrixWorld);
            expect(normal.z).toBeCloseTo(1, 9);
            const frame = new REAL.Box3();
            // The bezel or the frosted panel. The board's aluminum standoff
            // caps stand proud of its face at the corners, as a sign's do,
            // so boards.js keeps those corners clear.
            for (const m of meshesOf(studio.picks[key]).filter((x) => x !== face && x.material.metalness < 1)) frame.expandByObject(m);
            expect(face.position.z).toBeGreaterThan(frame.max.z);
        }
    });

    test('the glass and the screen cast no shadow, and the metals are given the room to reflect', () => {
        const studio = buildStudio(CONFIG);
        expect(studio.glass.castShadow).toBe(false);
        expect(studio.faces.menu.castShadow).toBe(false);
        expect(studio.shiny.some((m) => m.metalness === 1)).toBe(true);
        expect(studio.shiny.every((m) => m.metalness >= 0.25 || m.clearcoat > 0)).toBe(true);
    });

    test('the street stays outside the glass, casting and taking no shadow', () => {
        const street = buildStreet(CONFIG);
        for (const m of meshesOf(street.group).filter((x) => x !== street.sky)) {
            expect(boundsOf(m).max.z).toBeLessThanOrEqual(-hd + 1e-6);
            expect(m.castShadow).toBe(false);
            expect(m.receiveShadow).toBe(false);
        }
        expect(meshesOf(street.group).length).toBeLessThanOrEqual(20);
        // The sky is inside the camera's reach.
        expect(street.sky.geometry.parameters.radius).toBeLessThan(CONFIG.camera.far);
    });
});
