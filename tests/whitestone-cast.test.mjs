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

    test('an hourglass: her polo curves in to a waist, her shoulders and hips as wide as before; tan khakis (Steve, 2026-10-16)', () => {
        /** Her torso (the rounded build's extrusion), measured: its box, and
         *  its half-width at the height of a natural waist. */
        const torsoOf = (cfg) => {
            let torso = null;
            // The torso, not a mary jane (an extrusion too, inside its shoe group).
            buildMaya(cfg).group.traverse((o) => { if (o.isMesh && o.geometry.type === 'ExtrudeGeometry' && !(o.parent && o.parent.userData.isShoe)) torso = o; });
            const g = torso.geometry;
            g.computeBoundingBox();
            const box = g.boundingBox;
            const h = box.max.y - box.min.y;
            const waistY = box.min.y + h * 0.42;
            const pos = g.attributes.position;
            let half = 0;
            for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getY(i) - waistY) < h * 0.04) half = Math.max(half, Math.abs(pos.getX(i)));
            return { box, half };
        };
        expect(CONFIG.cast.maya.waist).toBeGreaterThan(0);
        const mine = torsoOf(CONFIG);
        const plain = torsoOf({ ...CONFIG, cast: { ...CONFIG.cast, maya: { ...CONFIG.cast.maya, waist: 0 } } });
        // The waist in, by about what her config asks. (Straight sides have
        // no vertex at the waist: theirs is the full half-width.)
        const full = (plain.box.max.x - plain.box.min.x) / 2;
        expect(mine.half).toBeLessThan(full * (1 - CONFIG.cast.maya.waist * 0.75));
        expect(mine.half).toBeGreaterThan(full * (1 - CONFIG.cast.maya.waist * 1.25));
        // Her shoulders, her hips and her depth as they were, to a tenth of
        // a millimeter (the bevel follows the curve near the hip).
        for (const k of ['x', 'y', 'z']) {
            expect(Math.abs((mine.box.max[k] - mine.box.min[k]) - (plain.box.max[k] - plain.box.min[k]))).toBeLessThan(1e-4);
        }
        // Tan khakis: a warm, light tan, not the dark jeans they were.
        const pants = new REAL.Color(CONFIG.cast.maya.pants);
        const hsl = {};
        pants.getHSL(hsl, REAL.SRGBColorSpace);
        expect(hsl.h * 360).toBeGreaterThan(25);
        expect(hsl.h * 360).toBeLessThan(50);
        expect(hsl.l).toBeGreaterThan(0.45);
    });

    /** Her upper arm's radius, and her shoe: its width, color, and parts
     *  (a mary jane is a group, the rig's block one box). */
    const limbsOf = (cfg) => {
        let arm = 0;
        let shoe = null;
        let leg = null;
        buildMaya(cfg).group.traverse((o) => {
            if (o.userData && o.userData.isArm) for (const c of o.children) if (c.geometry && c.geometry.type === 'CylinderGeometry') arm = Math.max(arm, c.geometry.parameters.radiusTop);
            if (o.userData && o.userData.isLeg && !leg) {
                leg = o;
                shoe = o.children.find((c) => c.userData.isShoe) || o.children.find((c) => c.geometry && c.geometry.type === 'BoxGeometry');
            }
        });
        const body = shoe.isGroup ? shoe.children.find((c) => c.name === 'shoe') : shoe;
        body.geometry.computeBoundingBox();
        const b = body.geometry.boundingBox;
        return { arm, leg, shoe, size: [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z], shoeColor: body.material.color.getHexString(REAL.SRGBColorSpace) };
    };
    const plainMaya = () => {
        const { slender, shoes, shoeStyle, ...rest } = CONFIG.cast.maya;
        return { ...CONFIG, cast: { ...CONFIG.cast, maya: rest } };
    };

    test('a slender build: slimmer arms and a narrower, shorter shoe (Steve, 2026-10-16)', () => {
        expect(CONFIG.cast.maya.slender).toBe(1);
        const mine = limbsOf(CONFIG);
        const plain = limbsOf(plainMaya());
        expect(mine.arm).toBeCloseTo(plain.arm * 0.85, 9);
        expect(mine.size[0]).toBeLessThan(plain.size[0] * 0.85);
        expect(mine.size[2]).toBeLessThan(plain.size[2]);
        expect(plain.shoeColor).toBe('1a1a1a');
    });

    test('black mary janes, not the rig\'s blocks: low and rounded, a toe box, the instep showing with a strap over it, the ankle up inside the hem (Steve, 2026-10-16)', () => {
        expect(CONFIG.cast.maya.shoeStyle).toBe('maryJane');
        const { shoe, size, shoeColor, leg } = limbsOf(CONFIG);
        const plain = limbsOf(plainMaya());
        expect(shoe.isGroup).toBe(true);
        expect(`#${shoeColor}`).toBe(CONFIG.cast.maya.shoes.toLowerCase());
        const hsl = {};
        new REAL.Color(CONFIG.cast.maya.shoes).getHSL(hsl, REAL.SRGBColorSpace);
        expect(hsl.l).toBeLessThan(0.15);
        // Rounded (an extrusion, not a box), lower than the block, as wide
        // and as long as the slender build's shoe.
        const body = shoe.children.find((c) => c.name === 'shoe');
        expect(body.geometry.type).toBe('ExtrudeGeometry');
        expect(size[1]).toBeLessThan(plain.size[1] * 0.5);
        expect(size[0]).toBeCloseTo(plain.size[0] * 0.82, 3);
        expect(size[2]).toBeCloseTo(plain.size[2] * 0.92, 3);
        // Its sole on the floor, where the block's was.
        expect(shoe.position.y + body.geometry.boundingBox.min.y).toBeCloseTo(plain.shoe.position.y - plain.size[1] / 2, 6);
        for (const part of ['toe', 'instep', 'ankle', 'strap']) expect(shoe.children.some((c) => c.name === part)).toBe(true);
        // Her feet a little bigger (the rig's footScale): longer and wider
        // than at 1, as long and wide as the rig's own figures' or more.
        expect(CONFIG.cast.maya.feet).toBeGreaterThan(1);
        const { feet, ...unscaled } = CONFIG.cast.maya;
        const smaller = limbsOf({ ...CONFIG, cast: { ...CONFIG.cast, maya: unscaled } });
        expect(size[2]).toBeCloseTo(smaller.size[2] * CONFIG.cast.maya.feet, 4);
        expect(size[0]).toBeCloseTo(smaller.size[0] * CONFIG.cast.maya.feet, 4);
        expect(size[2]).toBeGreaterThan(0.18);
        // The strap and the toe box in the shoe's color, the instep and
        // ankle skin.
        const named = (n) => shoe.children.find((c) => c.name === n);
        expect(named('strap').material).toBe(body.material);
        expect(named('toe').material).toBe(body.material);
        expect(named('instep').material.color.getHexString(REAL.SRGBColorSpace)).toBe(CONFIG.cast.maya.skin.slice(1).toLowerCase());
        // No gap at the hem: the ankle reaches up inside the trouser leg.
        const shin = leg.children.filter((c) => c.geometry && c.geometry.type === 'CylinderGeometry').sort((a, b) => a.position.y - b.position.y)[0];
        const shinBottom = shin.position.y - shin.geometry.parameters.height / 2;
        const ankle = named('ankle');
        const ankleTop = shoe.position.y + ankle.position.y + ankle.geometry.parameters.height / 2;
        expect(ankleTop).toBeGreaterThan(shinBottom + 0.005);
        expect(ankle.geometry.parameters.radiusTop).toBeLessThan(shin.geometry.parameters.radiusBottom);
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
