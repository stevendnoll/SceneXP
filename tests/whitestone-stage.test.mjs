// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * The stage (www/whitestone/js/stage.js): the cove is one seamless surface
 * with no corner and its edges far outside any frame, the turntable floats
 * on its toe with the house's lawn inside its rim, the soft shadow fades to
 * nothing, the skylight's shadow covers the turntable, and only the house
 * answers a tap. Plain numbers first, then the real three.js.
 */
import { loadRealThree } from './helpers/real-three.mjs';
import { CONFIG } from '../www/whitestone/js/config.js';
import { coveProfile, contactAlpha, contactRings, firstPick, pickOf, onTurntable, buildStage, buildLights } from '../www/whitestone/js/stage.js';
import { framePose, subjectPoints } from '../www/whitestone/js/turntable.js';
import { buildModel } from '../www/whitestone/js/model.js';
import { withExample } from '../www/whitestone/js/samples.js';
import { emptyDoc } from '../www/whitestone/js/store.js';

const { cove, turntable: T, contact } = CONFIG.stage;
const NOW = new Date('2026-10-12T16:00:00Z');

describe('the cove (pure)', () => {
    const pts = coveProfile(cove);

    test('a floor, a quarter circle, and a wall, in order, with no step between them', () => {
        expect(pts[0]).toEqual({ z: cove.front, y: 0, n: [0, 1] });
        expect(pts[pts.length - 1]).toEqual({ z: -cove.back, y: cove.height, n: [1, 0] });
        for (let i = 1; i < pts.length; i++) {
            // Always going back or up, never forward or down.
            expect(pts[i].z).toBeLessThanOrEqual(pts[i - 1].z + 1e-12);
            expect(pts[i].y).toBeGreaterThanOrEqual(pts[i - 1].y - 1e-12);
        }
        // The curve's points are all on its circle.
        const c = [-cove.back + cove.radius, cove.radius];
        for (const p of pts.filter((q) => q.y > 1e-9 && q.y < cove.radius - 1e-9)) {
            expect(Math.hypot(p.z - c[0], p.y - c[1])).toBeCloseTo(cove.radius, 9);
        }
    });

    test('its normals face the room and turn smoothly, so there is no corner to be seen', () => {
        for (const p of pts) expect(Math.hypot(p.n[0], p.n[1])).toBeCloseTo(1, 12);
        for (let i = 1; i < pts.length; i++) {
            const a = Math.atan2(pts[i].n[1], pts[i].n[0]);
            const b = Math.atan2(pts[i - 1].n[1], pts[i - 1].n[0]);
            expect(Math.abs(a - b)).toBeLessThan(Math.PI / 12);
        }
        // Each normal is square to the surface where it is.
        for (let i = 1; i < pts.length - 1; i++) {
            const t = [pts[i + 1].z - pts[i - 1].z, pts[i + 1].y - pts[i - 1].y];
            const dot = t[0] * pts[i].n[0] + t[1] * pts[i].n[1];
            expect(Math.abs(dot) / Math.hypot(...t)).toBeLessThan(0.07);
        }
    });

    test('its edges are never in frame, on any screen, in any view the page takes', () => {
        const half = cove.width / 2;
        // The closest view there is: a floor so small the closer view stops
        // at its limit.
        const tiny = { bottom: 0, top: 0.02, radius: 0.05 };
        for (const aspect of [21 / 9, 16 / 10, 1, 0.45]) {
            for (const tilt of [CONFIG.view.tilt.start, CONFIG.view.tilt.open]) {
                // The whole house, the closest view, and the arrival's start.
                for (const [near, far] of [[0, 1], [1, 1], [0, CONFIG.view.arrival.from]]) {
                    const p = framePose(aspect, 1.6, { tilt, focus: tiny, near }, CONFIG, far);
                    // The camera stands on the floor's span, well inside its sides.
                    expect(p.eye[2]).toBeLessThan(cove.front - 2);
                    // What the widest corner of the frame can see at the wall
                    // stays inside the cove's width and height.
                    const tanH = Math.tan((p.fov * Math.PI) / 360) * aspect * (1 + 2 * Math.abs(p.offset[0]));
                    const toWall = p.eye[2] + cove.back;
                    expect(Math.abs(p.eye[0]) + toWall * tanH * 1.2).toBeLessThan(half);
                    // The frame's top edge, the view offset taken in: it rises
                    // above level only by what the lens adds past the tilt.
                    const rise = Math.atan(Math.tan((p.fov * Math.PI) / 360) * (1 - 2 * p.offset[1])) - tilt;
                    expect(p.eye[1] + toWall * Math.tan(Math.max(0, rise)) * 1.2).toBeLessThan(cove.height);
                }
            }
        }
    });

    test('the turntable stands clear of the curve, on the flat floor', () => {
        expect(T.radius + contact.soft).toBeLessThan(cove.back - cove.radius);
    });
});

describe('the contact shadow (pure)', () => {
    test('darkest under the turntable, gone a little past its rim, never lighter going in', () => {
        expect(contactAlpha(0, T.radius, contact)).toBeCloseTo(contact.alpha, 12);
        expect(contactAlpha(T.radius - contact.inside, T.radius, contact)).toBeCloseTo(contact.alpha, 12);
        expect(contactAlpha(T.radius + contact.soft, T.radius, contact)).toBeCloseTo(0, 12);
        expect(contactAlpha(T.radius + contact.soft + 1, T.radius, contact)).toBe(0);
        // A soft fade, not a hard edge: half dark half way across it, and
        // gentle at both ends.
        const from = T.radius - contact.inside;
        const span = contact.soft + contact.inside;
        expect(contactAlpha(from + span / 2, T.radius, contact)).toBeCloseTo(contact.alpha / 2, 9);
        expect(contactAlpha(from + span * 0.1, T.radius, contact)).toBeGreaterThan(contact.alpha * 0.95);
        expect(contactAlpha(from + span * 0.9, T.radius, contact)).toBeLessThan(contact.alpha * 0.05);
        let last = Infinity;
        for (let r = 0; r <= T.radius + contact.soft; r += 0.01) {
            const a = contactAlpha(r, T.radius, contact);
            expect(a).toBeLessThanOrEqual(last + 1e-12);
            last = a;
        }
    });

    test('its rings start at the middle and end where it has faded', () => {
        const rings = contactRings(T.radius, contact);
        expect(rings[0]).toBe(0);
        expect(rings[rings.length - 1]).toBeCloseTo(T.radius + contact.soft, 12);
        for (let i = 1; i < rings.length; i++) expect(rings[i]).toBeGreaterThan(rings[i - 1]);
    });
});

describe('picking (pure)', () => {
    const node = (pick, parent = null, visible = true) => ({ userData: pick ? { pick } : {}, parent, visible });

    test('the nearest shown thing decides, and an untagged one is empty space', () => {
        const house = node('model');
        const wall = node(null, house);
        expect(firstPick([{ object: wall }])).toEqual({ key: 'model', hit: { object: wall } });
        expect(pickOf(wall)).toBe('model');
        // The turntable's stone carries no key: a tap on it is empty space.
        expect(firstPick([{ object: node(null) }, { object: wall }])).toBeNull();
        // Something hidden is passed over.
        const hidden = node('model', null, false);
        expect(firstPick([{ object: node(null, hidden) }, { object: wall }])).toEqual({ key: 'model', hit: { object: wall } });
        expect(firstPick([])).toBeNull();
        expect(firstPick(undefined)).toBeNull();
    });
});

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

    test('a handful of draw calls, and nothing on the stage answers a tap', () => {
        const stage = buildStage(CONFIG);
        const meshes = meshesOf(stage.group);
        expect(meshes.length).toBeLessThanOrEqual(5);
        for (const m of meshes) expect(pickOf(m)).toBeNull();
        expect(stage.top).toBe(T.height);
        expect(stage.background).toBe(cove.color);
    });

    test('the turntable is a drum on a narrower toe, its top where the house stands', () => {
        const stage = buildStage(CONFIG);
        stage.group.updateMatrixWorld(true);
        const box = new REAL.Box3().setFromObject(stage.spin);
        expect(box.min.y).toBeCloseTo(0, 6);
        expect(box.max.y).toBeCloseTo(T.height, 6);
        expect(box.max.x).toBeCloseTo(T.radius, 3);
        const toe = meshesOf(stage.spin).find((m) => m.geometry.parameters.height === T.toe);
        expect(toe.geometry.parameters.radiusTop).toBeCloseTo(T.radius - T.inset, 9);
        // The toe is dark, so the drum seems to float.
        const hsl = {};
        toe.material.color.getHSL(hsl);
        expect(hsl.l).toBeLessThan(0.1);
    });

    test('the cove is one smooth surface facing the room, taking the shadow and casting none', () => {
        const stage = buildStage(CONFIG);
        const coveMesh = stage.group.children.find((o) => o.name === 'cove');
        expect(coveMesh.receiveShadow).toBe(true);
        expect(coveMesh.castShadow).toBe(false);
        const g = coveMesh.geometry;
        const pos = g.attributes.position;
        const index = g.index.array;
        // Every triangle faces where its normals say: into the room.
        for (let i = 0; i < index.length; i += 3) {
            const [a, b, c] = [index[i], index[i + 1], index[i + 2]].map((k) => new REAL.Vector3().fromBufferAttribute(pos, k));
            const n = new REAL.Vector3().subVectors(b, a).cross(new REAL.Vector3().subVectors(c, a)).normalize();
            const given = new REAL.Vector3().fromBufferAttribute(g.attributes.normal, index[i]);
            expect(n.dot(given)).toBeGreaterThan(0.9);
        }
    });

    test('the turn of the house is the turntable\'s: the model stands in the spin group and turns with it', () => {
        const stage = buildStage(CONFIG);
        const model = buildModel(CONFIG, [0, stage.top, 0]);
        stage.spin.add(model.group);
        model.show(withExample(emptyDoc(CONFIG, NOW), CONFIG, NOW, null).doc.checklists[0]);
        stage.spin.rotation.y = 1;
        stage.group.updateMatrixWorld(true);
        const lawn = model.meshes.lawn;
        const m = new REAL.Matrix4();
        lawn.getMatrixAt(0, m);
        const at = new REAL.Vector3().setFromMatrixPosition(m).applyMatrix4(lawn.matrixWorld);
        expect(at.x).toBeCloseTo(0, 6);
        expect(at.z).toBeCloseTo(0, 6);
        expect(at.y).toBeGreaterThan(T.height);
        // A ray from the camera to the house finds the model, through the
        // turned group.
        const pose = framePose(16 / 10, model.height, { tilt: CONFIG.view.tilt.start }, CONFIG);
        const ray = new REAL.Raycaster(new REAL.Vector3(...pose.eye), new REAL.Vector3(0, T.height + model.height / 2, 0).sub(new REAL.Vector3(...pose.eye)).normalize());
        const hit = firstPick(ray.intersectObjects([model.group], true));
        expect(hit && hit.key).toBe('model');
    });

    test('a press takes hold of the turntable on the house, its lawn or its stone, and not on Maya or the studio (QA, 2026-10-15)', async () => {
        const stage = buildStage(CONFIG);
        const model = buildModel(CONFIG, [0, stage.top, 0]);
        stage.spin.add(model.group);
        model.show(withExample(emptyDoc(CONFIG, NOW), CONFIG, NOW, null).doc.checklists[0]);
        const { buildMaya } = await import('../www/whitestone/js/cast.js');
        const maya = buildMaya(CONFIG);
        stage.group.add(maya.group);
        stage.group.updateMatrixWorld(true);
        const pose = framePose(16 / 10, model.height, { tilt: CONFIG.view.tilt.start }, CONFIG);
        const eye = new REAL.Vector3(...pose.eye);
        const pressAt = (point) => {
            const ray = new REAL.Raycaster(eye, new REAL.Vector3(...point).sub(eye).normalize());
            return onTurntable(ray.intersectObjects([stage.spin, maya.group], true), stage.spin);
        };
        const M = CONFIG.cast.maya;
        // The house's middle, the stone's front face, the lawn by the rim.
        expect(pressAt([0, T.height + model.height / 2, 0])).toBe(true);
        expect(pressAt([0, T.height / 2, T.radius])).toBe(true);
        expect(pressAt([-T.radius * 0.85, T.height, T.radius * 0.3])).toBe(true);
        // Maya, standing beside it; the studio floor past the rim; the
        // cove's wall above the house.
        expect(pressAt([M.x, M.height * 0.7, M.z])).toBe(false);
        expect(pressAt([T.radius + 1, 0, 0])).toBe(false);
        expect(pressAt([0, T.height + model.height + 2, -3])).toBe(false);
        // Turned, it is the same turntable.
        stage.spin.rotation.y = 2;
        stage.group.updateMatrixWorld(true);
        expect(pressAt([0, T.height / 2, T.radius])).toBe(true);
    });

    test('a press takes hold only of what is shown (pure)', () => {
        const spin = { visible: true, parent: null };
        const on = { visible: true, parent: spin };
        const hidden = { visible: false, parent: spin };
        const off = { visible: true, parent: null };
        expect(onTurntable([{ object: on }], spin)).toBe(true);
        expect(onTurntable([{ object: off }, { object: on }], spin)).toBe(false);
        expect(onTurntable([{ object: { visible: true, parent: hidden } }, { object: on }], spin)).toBe(true);
        expect(onTurntable([], spin)).toBe(false);
        expect(onTurntable(undefined, spin)).toBe(false);
    });

    test("the skylight's shadow covers the turntable and the house, from high in front", () => {
        const { lights, sun } = buildLights(CONFIG, false);
        expect(lights).toContain(sun);
        expect(sun.castShadow).toBe(true);
        expect(sun.shadow.mapSize.x).toBe(CONFIG.light.sun.shadow.size);
        expect(buildLights(CONFIG, true).sun.shadow.mapSize.x).toBe(CONFIG.light.sun.shadow.sizeMobile);
        const s = CONFIG.light.sun;
        expect(s.position[1]).toBeGreaterThan(5);
        expect(s.position[2]).toBeGreaterThan(0);
        // Every point of the subject (the tallest house) lands inside the
        // shadow camera's box.
        sun.updateMatrixWorld(true);
        sun.target.updateMatrixWorld(true);
        sun.shadow.camera.position.copy(sun.position);
        sun.shadow.camera.lookAt(sun.target.position);
        sun.shadow.camera.updateMatrixWorld(true);
        const inv = sun.shadow.camera.matrixWorldInverse;
        for (const p of subjectPoints(T, 1.8)) {
            const v = new REAL.Vector3(...p).applyMatrix4(inv);
            expect(Math.abs(v.x)).toBeLessThan(s.shadow.reach);
            expect(Math.abs(v.y)).toBeLessThan(s.shadow.reach);
            expect(-v.z).toBeGreaterThan(s.shadow.near);
            expect(-v.z).toBeLessThan(s.shadow.far);
        }
    });
});
