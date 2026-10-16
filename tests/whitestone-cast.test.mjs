// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * Maya on the stage (www/whitestone/js/cast.js): her gestures rise, hold
 * and come down eased; she stands on the floor beside the turntable, clear
 * of it in every pose; her wave goes up and her point goes toward the
 * house; she sways only while saying a line; she is in a wide frame with
 * room for her bubble beside her; a tap finds her; the skylight's shadow
 * covers her. Measured against the real three.js, since the stub keeps no
 * positions.
 */
import { loadRealThree } from './helpers/real-three.mjs';
import { CONFIG } from '../www/whitestone/js/config.js';
import { REST, GESTURES, poseFor, swayAt, speakSeconds, buildMaya, smileArc, portraitPose, PORTRAIT } from '../www/whitestone/js/cast.js';
import { framePose, subjectPoints } from '../www/whitestone/js/turntable.js';
import { firstPick, buildLights } from '../www/whitestone/js/stage.js';

const M = CONFIG.cast.maya;
const T = CONFIG.stage.turntable;

describe('the gestures (pure)', () => {
    test('outside a gesture both arms rest as the shared rig rests them', () => {
        for (const [g, t] of [[null, 0], ['wave', -1], ['wave', GESTURES.wave], ['point', 99], ['bow', 0.5]]) {
            expect(poseFor(g, t)).toEqual({ near: REST, far: REST });
        }
    });

    test('each rises from rest and comes back to it, eased, never snapping', () => {
        for (const g of Object.keys(GESTURES)) {
            const total = GESTURES[g];
            let last = poseFor(g, 0);
            expect(last).toEqual({ near: REST, far: REST });
            for (let t = 0.02; t < total; t += 0.02) {
                const p = poseFor(g, t);
                for (const arm of ['near', 'far']) {
                    for (const k of ['z', 'x', 'fore']) expect(Math.abs(p[arm][k] - last[arm][k])).toBeLessThan(0.25);
                }
                last = p;
            }
            const end = poseFor(g, total - 0.001);
            for (const arm of ['near', 'far']) expect(Math.abs(end[arm].z - REST.z)).toBeLessThan(0.01);
        }
    });

    test('a wave raises the far arm and leaves the near one, a point the other way round (QA, 2026-10-15: the far arm looked better)', () => {
        const wave = poseFor('wave', 1);
        expect(wave.near).toEqual(REST);
        expect(wave.far.z).toBeGreaterThan(2);
        const point = poseFor('point', 1);
        expect(point.far).toEqual(REST);
        expect(point.near.z).toBeGreaterThan(0.9);
        expect(point.near.x).toBeLessThan(-0.4);
    });

    test('the sway is a few hundredths of a radian, and a line takes about as long as it is to say', () => {
        for (let t = 0; t < 30; t += 0.1) expect(Math.abs(swayAt(t))).toBeLessThan(0.05);
        expect(speakSeconds('')).toBe(2);
        expect(speakSeconds('x'.repeat(1000))).toBe(9);
        expect(speakSeconds('Hi, I am Maya.')).toBeLessThan(speakSeconds("Hi, I'm Maya with Whitestone Home Care. Let's build a cleaning checklist for your home."));
    });
});

describe('the bubble portrait (pure)', () => {
    // QA, 2026-10-16: an oval with her head and shoulders was tried; back to
    // the circle and its first framing, her face, square.
    test('her face, square for the circle, from in front of her and a little above', () => {
        const head = [2, 1.5, 0.4];
        const pose = portraitPose(head, 0);
        expect(pose.aspect).toBe(1);
        expect(PORTRAIT.width).toBe(PORTRAIT.height);
        expect(pose.aim).toEqual(head);
        expect(pose.eye[1] - head[1]).toBeCloseTo(PORTRAIT.lift, 9);
        expect(pose.eye[2] - head[2]).toBeCloseTo(PORTRAIT.distance, 9);
        expect(pose.fov).toBe(PORTRAIT.fov);
        // Turned with her: from in front of her, whichever way she faces.
        const turned = portraitPose(head, Math.PI / 2);
        expect(turned.eye[0] - head[0]).toBeCloseTo(PORTRAIT.distance, 9);
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

    const boxOf = (o) => {
        o.updateMatrixWorld(true);
        return new REAL.Box3().setFromObject(o);
    };
    /** Each hand's middle, in world meters, by the rig's own tags. */
    const hands = (maya) => {
        maya.group.updateMatrixWorld(true);
        const out = {};
        maya.group.traverse((o) => {
            if (o.userData && o.userData.isForearm) {
                const hand = o.children[o.children.length - 1];
                out[o.userData.armSide < 0 ? 'near' : 'far'] = new REAL.Vector3().setFromMatrixPosition(hand.matrixWorld);
            }
        });
        return out;
    };
    const posed = (gesture, t) => {
        const maya = buildMaya(CONFIG);
        if (gesture) {
            maya.gesture(gesture);
            maya.tick(t);
        }
        return maya;
    };

    test('she smiles (QA, 2026-10-15): rose lips below her nose, centered, on her face, the corners lifted', () => {
        const maya = buildMaya(CONFIG);
        maya.group.updateMatrixWorld(true);
        let smile = null;
        let nose = null;
        const pupils = [];
        maya.group.traverse((o) => {
            if (o.name === 'smile') smile = o;
            if (o.isMesh && o.geometry.type === 'ConeGeometry' && !nose) nose = o;
            if (o.userData && o.userData.isPupil) pupils.push(o);
        });
        expect(smile).not.toBeNull();
        expect(`#${smile.material.color.getHexString().toUpperCase()}`).toBe(M.lips.toUpperCase());
        // In the person's own frame: centered between the eyes, under the
        // nose, at the head's front surface.
        const own = (o) => o.position;
        const s = smile.position;
        const [l, r] = pupils.map(own);
        expect(Math.abs(s.x - (l.x + r.x) / 2)).toBeLessThan(1e-9);
        const lowest = s.y - smile.geometry.parameters.radius;
        expect(lowest).toBeLessThan(own(nose).y - 0.03);
        expect(lowest).toBeGreaterThan(own(nose).y - 0.08);
        expect(s.z).toBeGreaterThan(0.09);
        expect(s.z).toBeLessThan(0.12);
        // Rose, deeper than her skin, never darker than her eyes.
        const lum = (hex) => new REAL.Color(hex).getHSL({}).l;
        expect(lum(M.lips)).toBeLessThan(lum(M.skin));
        expect(lum(M.lips)).toBeGreaterThan(lum(M.eyes));
        // A gentle arc: as wide as asked, its corners lifted as asked.
        const { radius, arc } = smileArc(M.smile.width, M.smile.lift);
        expect(2 * radius * Math.sin(arc / 2)).toBeCloseTo(M.smile.width, 12);
        expect(radius * (1 - Math.cos(arc / 2))).toBeCloseTo(M.smile.lift, 12);
        expect(arc).toBeLessThan(Math.PI * 0.75);
        // A smile, not a frown: its drawn corners above its drawn middle.
        smile.updateMatrix();
        const pos = smile.geometry.attributes.position;
        const pts = [];
        for (let i = 0; i < pos.count; i++) pts.push(new REAL.Vector3().fromBufferAttribute(pos, i).applyMatrix4(smile.matrix));
        const wide = Math.max(...pts.map((p) => Math.abs(p.x - s.x)));
        const mean = (list) => list.reduce((a, p) => a + p.y, 0) / list.length;
        const corners = mean(pts.filter((p) => Math.abs(p.x - s.x) > wide * 0.85));
        const middle = mean(pts.filter((p) => Math.abs(p.x - s.x) < wide * 0.15));
        expect(corners - middle).toBeGreaterThan(M.smile.lift * 0.4);
        expect(Math.abs(middle - lowest)).toBeLessThan(M.smile.thickness * 1.5);
    });

    test('she stands on the floor, about her height, a tap finds her, and her polo carries the mark', () => {
        const maya = buildMaya(CONFIG);
        const box = boxOf(maya.group);
        expect(box.min.y).toBeGreaterThan(-0.01);
        expect(box.min.y).toBeLessThan(0.02);
        expect(box.max.y).toBeCloseTo(M.height, 1);
        expect(maya.group.userData.pick).toBe('host');
        const ray = new REAL.Raycaster(new REAL.Vector3(M.x, 1.2, 5), new REAL.Vector3(0, 0, -1));
        expect(firstPick(ray.intersectObjects([maya.group], true)).key).toBe('host');
        // The shirt is the config's white, and the mark the accent.
        const colors = new Set();
        maya.group.traverse((o) => { if (o.isMesh) colors.add(`#${o.material.color.getHexString().toUpperCase()}`); });
        expect(colors).toContain(M.shirt.toUpperCase());
        expect(colors).toContain(M.accent.toUpperCase());
    });

    test.each([['at rest', null, 0], ['waving', 'wave', 1.1]])('%s she stands clear of the turntable', (_name, g, t) => {
        expect(boxOf(posed(g, t).group).min.x).toBeGreaterThan(T.radius + 0.02);
    });

    test('pointing, her hand reaches over the lawn but never to where a house can stand, and above the trees', () => {
        const box = boxOf(posed('point', 1.0).group);
        // No corner of any house comes nearer the edge than the scale's
        // margin (model.js fitScale), however the house is turned.
        const houseReach = T.radius - T.rim - CONFIG.model.scale.margin;
        expect(box.min.x).toBeGreaterThan(houseReach + 0.05);
        expect(hands(posed('point', 1.0)).near.y).toBeGreaterThan(T.height + 0.6);
    });

    test('her wave goes up, above her head, on her far side', () => {
        const rest = hands(posed(null, 0));
        const wave = hands(posed('wave', 1.1));
        const head = M.height - 0.165;
        expect(wave.far.y).toBeGreaterThan(head);
        expect(wave.near.distanceTo(rest.near)).toBeLessThan(1e-9);
        expect(wave.far.x).toBeGreaterThan(M.x);
    });

    test('her point goes toward the house, at about chest height, the arm nearly straight', () => {
        const rest = hands(posed(null, 0));
        const point = hands(posed('point', 1.0));
        expect(point.far.distanceTo(rest.far)).toBeLessThan(1e-9);
        // Toward the turntable's middle, and out from her body.
        expect(point.near.x).toBeLessThan(rest.near.x - 0.25);
        expect(point.near.y).toBeGreaterThan(1.0);
        expect(point.near.y).toBeLessThan(M.height - 0.2);
        const toHouse = new REAL.Vector3(-M.x, 0, -M.z).normalize();
        const out = new REAL.Vector3(point.near.x - M.x, 0, point.near.z - M.z).normalize();
        expect(out.dot(toHouse)).toBeGreaterThan(0.7);
    });

    test('she has a woman\'s build: the rig\'s hips, as her config asks (Steve, 2026-10-14)', () => {
        expect(CONFIG.cast.maya.hips).toBe(1);
        /** Her widest thigh's top radius. */
        const thighOf = (cfg) => {
            let r = 0;
            buildMaya(cfg).group.traverse((o) => {
                if (o.userData && o.userData.isLeg) for (const c of o.children) if (c.geometry && c.geometry.type === 'CylinderGeometry') r = Math.max(r, c.geometry.parameters.radiusTop);
            });
            return r;
        };
        const plain = { ...CONFIG, cast: { ...CONFIG.cast, maya: { ...CONFIG.cast.maya, hips: 0 } } };
        expect(thighOf(CONFIG)).toBeGreaterThan(thighOf(plain) * 1.5);
    });

    test('a gesture runs its course and rests; reduced motion rests at once; the sway lasts as long as the line', () => {
        const maya = buildMaya(CONFIG);
        expect(maya.tick(1 / 60)).toBe(false);
        maya.gesture('wave');
        let moving = 0;
        for (let t = 0; t < GESTURES.wave + 0.5; t += 0.1) if (maya.tick(0.1)) moving++;
        expect(moving).toBeGreaterThan(0);
        expect(maya.gesturing).toBeNull();
        expect(maya.tick(0.1)).toBe(false);
        expect(maya.gesture('cartwheel')).toBe(false);

        maya.gesture('point');
        maya.tick(0.5, { reducedMotion: true });
        expect(maya.gesturing).toBeNull();
        expect(hands(maya).near.distanceTo(hands(buildMaya(CONFIG)).near)).toBeLessThan(1e-9);

        maya.speaking(3);
        expect(maya.tick(0.1)).toBe(true);
        expect(maya.group.rotation.y).not.toBe(M.facing);
        for (let t = 0; t < 4; t += 0.1) maya.tick(0.1);
        expect(maya.group.rotation.y).toBe(M.facing);
        expect(maya.tick(0.1)).toBe(false);
        // No sway under reduced motion.
        maya.speaking(3);
        for (let t = 0; t < 1; t += 0.1) maya.tick(0.1, { reducedMotion: true });
        expect(maya.group.rotation.y).toBe(M.facing);
    });

    test('in a wide frame she is on screen, right of the turntable, with room beside her head for her bubble', () => {
        for (const [W, H] of [[1280, 800], [1440, 900], [1024, 768], [1920, 1080]]) {
            const aspect = W / H;
            const pose = framePose(aspect, 0.6, { tilt: CONFIG.view.tilt.start }, CONFIG);
            expect(pose.host).toBe(true);
            const cam = new REAL.PerspectiveCamera(pose.fov, aspect, 0.05, 120);
            cam.position.set(...pose.eye);
            cam.setViewOffset(W, H, pose.offset[0] * W, pose.offset[1] * H, W, H);
            cam.updateProjectionMatrix();
            cam.lookAt(...pose.aim);
            cam.updateMatrixWorld();
            const px = (p) => {
                const v = new REAL.Vector3(...p).project(cam);
                return [((v.x + 1) / 2) * W, ((1 - v.y) / 2) * H];
            };
            const maya = buildMaya(CONFIG);
            const box = boxOf(maya.group);
            for (const x of [box.min.x, box.max.x]) {
                for (const y of [box.min.y, box.max.y]) {
                    const [sx, sy] = px([x, y, M.z]);
                    expect(sx).toBeGreaterThan(0);
                    expect(sx).toBeLessThan(W);
                    expect(sy).toBeGreaterThan(0);
                    expect(sy).toBeLessThan(H);
                }
            }
            const rim = Math.max(...subjectPoints(T, 0).map((p) => px(p)[0]));
            expect(px([box.min.x, 1, M.z])[0]).toBeGreaterThan(rim - 8);
            // The bubble's narrowest (CSS clamp, 280px) fits beside her head.
            const [ax] = px(maya.anchor());
            expect(ax + 18 + 280).toBeLessThanOrEqual(W - 16);
        }
    });

    test("the skylight's shadow covers her, head to foot", () => {
        const { sun } = buildLights(CONFIG, false);
        const s = CONFIG.light.sun;
        sun.shadow.camera.position.copy(sun.position);
        sun.shadow.camera.lookAt(sun.target.position);
        sun.shadow.camera.updateMatrixWorld(true);
        const box = boxOf(buildMaya(CONFIG).group);
        for (const x of [box.min.x, box.max.x]) {
            for (const y of [box.min.y, box.max.y]) {
                for (const z of [box.min.z, box.max.z]) {
                    const v = new REAL.Vector3(x, y, z).applyMatrix4(sun.shadow.camera.matrixWorldInverse);
                    expect(Math.abs(v.x)).toBeLessThan(s.shadow.reach);
                    expect(Math.abs(v.y)).toBeLessThan(s.shadow.reach);
                }
            }
        }
    });
});
