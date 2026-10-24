// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The avatar's figure (shared/js/avatar-figure-1.0.0.js), from SOURCE,
 * measured against the REAL three.js. specs/avatar M2.
 *
 * The stub cannot do this: its meshes have no vertices, so a skirt the legs
 * come through and a smile floating off the face measure exactly like ones
 * that fit (measure-a-model-against-real-three).
 *
 * What is held here, and why:
 * - THE RIG'S NEW TAGS find the head, the hair and the skirt, so nothing is
 *   found by matching a radius.
 * - THE DEFAULT AVATAR IS LEAF BLOWER'S OPERATOR, MESH FOR MESH, plus a
 *   smile. M6 moves the scene onto the avatar, and its players must lose
 *   nothing.
 * - NO LEG COMES THROUGH THE SKIRT, on any build. It did on Curvy before the
 *   flare (2 cm, measured 2026-10-23).
 * - THE SMILE SITS ON THE FACE, below the nose, for every skin.
 * - THE PORTRAIT FRAMES THE FACE, and is copied from the corner it was drawn
 *   in, with the renderer's viewport put back after.
 */
import { loadRealThree } from './helpers/real-three.mjs';

let THREE;
let F;
let A;
let createPerson;
let leavesPerson;
let DEFAULT_CHOICE;

beforeAll(async () => {
    THREE = await loadRealThree();
    globalThis.THREE = THREE;
    F = await import('../www/shared/js/avatar-figure-1.0.0.js');
    A = await import('../www/shared/js/avatar-1.0.0.min.js');
    ({ createPerson } = await import('../www/shared/js/people-1.0.0.min.js'));
    ({ personConfig: leavesPerson, DEFAULT_CHOICE } = await import('../www/leaves/js/cast.js'));
});

afterAll(() => {
    delete globalThis.THREE;
});

/** Every mesh of a figure, as plain records in a stable order. */
function meshes(root) {
    root.updateMatrixWorld(true);
    const out = [];
    root.traverse((o) => {
        if (!o.isMesh) return;
        const p = new THREE.Vector3();
        o.getWorldPosition(p);
        const round = (n) => Math.round(n * 1e5) / 1e5;
        out.push({
            name: o.name,
            geometry: o.geometry.type,
            // A shape's uuid is fresh every build, so it is left out.
            params: JSON.stringify(o.geometry.parameters || {}, (k, v) => (k === 'uuid' ? undefined : v)),
            vertices: o.geometry.attributes.position.count,
            at: p.toArray().map(round),
            scale: o.scale.toArray().map(round),
            color: o.material.color ? o.material.color.getHex() : null
        });
    });
    return out;
}

describe('the rig\'s tags', () => {
    test('the head, the hair and the skirt are each found by their tag, once', () => {
        const p = createPerson({ hasSkirt: true, hairStyle: 'long' });
        const tagged = (key) => p.children.filter((o) => o.userData[key]);
        expect(tagged('isHead')).toHaveLength(1);
        expect(tagged('isHead')[0].geometry.parameters.radius).toBe(0.12);
        expect(tagged('isHair')).toHaveLength(1);
        expect(tagged('isHair')[0].isGroup).toBe(true);
        expect(tagged('isSkirt')).toHaveLength(1);
        // Bald: the hair is never added, so a part looking for it finds none.
        expect(createPerson({ bald: true }).children.filter((o) => o.userData.isHair)).toHaveLength(0);
        expect(createPerson({}).children.filter((o) => o.userData.isSkirt)).toHaveLength(0);
    });
});

describe('the figure', () => {
    test('the default avatar is Leaf Blower\'s operator, mesh for mesh, with a smile', () => {
        const today = meshes(createPerson(leavesPerson(DEFAULT_CHOICE)));
        const avatar = F.createAvatar(A.DEFAULT_AVATAR, { role: 'operator' });
        const drawn = meshes(avatar.group);
        expect(drawn.filter((m) => m.name === 'smile')).toHaveLength(1);
        expect(drawn.filter((m) => m.name !== 'smile')).toEqual(today);
        avatar.dispose();
    });

    test('every Leaf Blower choice carried over builds the same figure', () => {
        for (const choice of [
            { shirt: 'white', pants: 'khaki', skin: 'deep', hair: 'gray', length: 'long' },
            { shirt: 'teal', pants: 'black', skin: 'light', hair: 'blond', length: 'bald' },
            { shirt: 'mustard', pants: 'denim', skin: 'tan', hair: 'auburn', length: 'buzz' }
        ]) {
            const today = meshes(createPerson(leavesPerson(choice)));
            const avatar = F.createAvatar(A.fromCastChoice(choice), { role: 'operator' });
            expect(meshes(avatar.group).filter((m) => m.name !== 'smile')).toEqual(today);
        }
    });

    test('no leg comes through the skirt, on any build', () => {
        const v = new THREE.Vector3();
        for (const build of A.BUILDS.map((b) => b.id)) {
            const avatar = F.createAvatar({ build, bottom: 'skirt' });
            const person = avatar.person;
            person.updateMatrixWorld(true);
            const skirt = person.children.find((o) => o.userData.isSkirt);
            const box = new THREE.Box3().setFromObject(skirt);
            // The skirt is a cone: its radius at a height, measured from its
            // own vertices rather than restated from the rig.
            const pos = skirt.geometry.attributes.position;
            let rTop = 0;
            let rBottom = 0;
            for (let i = 0; i < pos.count; i++) {
                v.fromBufferAttribute(pos, i).applyMatrix4(skirt.matrixWorld);
                const r = Math.hypot(v.x, v.z);
                if (Math.abs(v.y - box.max.y) < 1e-6) rTop = Math.max(rTop, r);
                if (Math.abs(v.y - box.min.y) < 1e-6) rBottom = Math.max(rBottom, r);
            }
            const rAt = (y) => rTop + ((box.max.y - y) / (box.max.y - box.min.y)) * (rBottom - rTop);
            let worst = -Infinity;
            person.traverse((o) => {
                if (!o.isMesh || !o.parent || !o.parent.userData.isLeg) return;
                const p = o.geometry.attributes.position;
                for (let i = 0; i < p.count; i++) {
                    v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
                    if (v.y > box.max.y || v.y < box.min.y) continue;
                    worst = Math.max(worst, Math.hypot(v.x, v.z) - rAt(v.y));
                }
            });
            // Inside the skirt, with at least half a centimeter to spare.
            expect(`${build}: ${worst < -0.005}`).toBe(`${build}: true`);
            avatar.dispose();
        }
    });

    test('without the flare, Curvy\'s legs would come through, so the test above can fail', () => {
        const avatar = F.createAvatar({ build: 'curvy', bottom: 'skirt' });
        const skirt = avatar.person.children.find((o) => o.userData.isSkirt);
        expect(skirt.scale.x).toBeCloseTo(1 + F.SKIRT_FLARE, 6);
        expect(F.createAvatar({ build: 'straight', bottom: 'skirt' }).person.children
            .find((o) => o.userData.isSkirt).scale.x).toBe(1);
    });

    test('the smile sits on the front of the face, below the nose, in a rose of the skin', () => {
        for (const skin of A.SKINS) {
            const avatar = F.createAvatar({ skin: skin.id });
            const person = avatar.person;
            person.updateMatrixWorld(true);
            const head = person.children.find((o) => o.userData.isHead);
            const smile = person.children.find((o) => o.name === 'smile');
            const box = new THREE.Box3().setFromObject(smile);
            const c = new THREE.Vector3();
            box.getCenter(c);
            const h = new THREE.Vector3();
            head.getWorldPosition(h);
            // On the surface of the 0.12 m head: within a few millimeters.
            expect(Math.abs(c.distanceTo(h) - 0.12)).toBeLessThan(0.006);
            // Below the nose (0.01 under the head's middle), above the chin.
            expect(c.y).toBeLessThan(h.y - 0.03);
            expect(c.y).toBeGreaterThan(h.y - 0.08);
            expect(c.z).toBeGreaterThan(0.09);
            expect(box.max.x - box.min.x).toBeCloseTo(F.SMILE.width + 2 * F.SMILE.thickness, 2);
            // Darker than the skin in every channel, and redder than it is green.
            const lips = smile.material.color.getHex();
            expect(lips).toBe(F.lipsColor(skin.color));
            const [r, g, b] = [lips >> 16, (lips >> 8) & 255, lips & 255];
            expect(r).toBeLessThan(skin.color >> 16);
            expect(r / Math.max(1, g)).toBeGreaterThan(((skin.color >> 16) / Math.max(1, (skin.color >> 8) & 255)) - 1e-9);
            expect(b).toBeLessThanOrEqual(skin.color & 255);
            avatar.dispose();
        }
        // Maya's own lips, from her own skin.
        expect(F.lipsColor(0xbf8a66)).toBe(0xa3564f);
    });

    test('short sleeves bare the forearm, long ones cover it in the shirt', () => {
        const forearmColor = (sleeves) => {
            const avatar = F.createAvatar({ sleeves, shirt: 'teal', skin: 'deep' });
            const fore = avatar.arms.right.userData.forearm;
            return fore.children[1].material.color.getHex();
        };
        expect(forearmColor('long')).toBe(new THREE.Color(A.optionOf(A.SHIRTS, 'teal').color).getHex());
        expect(forearmColor('short')).toBe(new THREE.Color(A.optionOf(A.SKINS, 'deep').color).getHex());
    });

    test('a scene\'s overrides win, and the head is where the rig puts it', () => {
        const avatar = F.createAvatar({ sleeves: 'short' }, { overrides: { sleeves: 'long' } });
        expect(avatar.avatar.sleeves).toBe('long');
        expect(avatar.head().y).toBeCloseTo(1.555, 6);
        avatar.group.position.set(2, 0, -1);
        expect(avatar.head().toArray().map((n) => Math.round(n * 1000) / 1000)).toEqual([2, 1.555, -1]);
        avatar.dispose();
    });

    test('disposing takes it out of whatever held it', () => {
        const scene = new THREE.Scene();
        const avatar = F.createAvatar({});
        scene.add(avatar.group);
        avatar.dispose();
        expect(scene.children).toHaveLength(0);
    });
});

describe('the wave', () => {
    test('rest before, after and outside a gesture, and an unknown one is rest', () => {
        const rest = { right: F.REST, left: F.REST };
        expect(F.poseFor('wave', -1)).toEqual(rest);
        expect(F.poseFor('wave', F.GESTURES.wave)).toEqual(rest);
        expect(F.poseFor('wave', NaN)).toEqual(rest);
        expect(F.poseFor('shrug', 1)).toEqual(rest);
        expect(F.poseFor('wave', 0)).toEqual(rest);
    });

    test('the right hand rises above the head mid-wave, and comes back down', () => {
        const avatar = F.createAvatar({});
        const hand = () => {
            const fore = avatar.arms.right.userData.forearm;
            const h = fore.children[fore.children.length - 1];
            avatar.group.updateMatrixWorld(true);
            return h.getWorldPosition(new THREE.Vector3());
        };
        const restY = hand().y;
        expect(avatar.gesture('wave')).toBe(true);
        expect(avatar.gesture('shrug')).toBe(false);
        expect(avatar.gesturing).toBe('wave');
        let top = -Infinity;
        for (let t = 0; t < F.GESTURES.wave + 0.1; t += 1 / 30) {
            avatar.tick(1 / 30);
            top = Math.max(top, hand().y);
        }
        expect(top).toBeGreaterThan(avatar.head().y + 0.1);
        expect(avatar.gesturing).toBeNull();
        expect(hand().y).toBeCloseTo(restY, 6);
        // Nothing to do once it is over.
        expect(avatar.tick(1)).toBe(false);
        // The left arm never moved.
        expect(avatar.arms.left.rotation.z).toBeCloseTo(F.REST.z, 6);
        // A scene's own pose may name one arm, or none.
        avatar.setPose({ left: { z: 1, x: 0, fore: -0.5 } });
        expect(avatar.arms.left.rotation.z).toBeCloseTo(1, 6);
        expect(avatar.arms.left.userData.forearm.rotation.x).toBeCloseTo(-0.5, 6);
        expect(avatar.arms.right.rotation.z).toBeCloseTo(-F.REST.z, 6);
        avatar.setPose(null);
        expect(avatar.arms.left.rotation.z).toBeCloseTo(1, 6);
    });

    test('under reduced motion a wave ends at rest at once', () => {
        const avatar = F.createAvatar({});
        avatar.gesture('wave');
        avatar.tick(0.5);
        expect(avatar.tick(0.1, { reducedMotion: true })).toBe(true);
        expect(avatar.gesturing).toBeNull();
        expect(avatar.arms.right.rotation.z).toBeCloseTo(-F.REST.z, 6);
    });
});

describe('the portrait', () => {
    test('it frames the whole head in the round chip, the face a little above the middle', () => {
        const pose = F.portraitPose();
        const camera = new THREE.PerspectiveCamera(pose.fov, 1, 0.05, 10);
        camera.position.fromArray(pose.eye);
        camera.lookAt(...pose.aim);
        camera.updateMatrixWorld(true);
        const at = (y, x = 0, z = 0.12) => new THREE.Vector3(x, y, z).project(camera);
        // The face's middle (the eyes and nose) is near the middle of the frame.
        const face = at(1.555);
        expect(Math.abs(face.x)).toBeLessThan(0.05);
        expect(Math.abs(face.y)).toBeLessThan(0.15);
        // The hair's top, the ears and the chin are all inside the circle
        // the chip cuts (radius 1 in these units), with room to spare.
        for (const p of [at(1.726, 0, 0), at(1.555, 0.124, 0), at(1.555, -0.124, 0), at(1.435)]) {
            expect(Math.hypot(p.x, p.y)).toBeLessThan(0.85);
        }
        // And it is a portrait, not a figure: the head fills about three
        // quarters of the frame's height (2 in these units).
        expect(at(1.726, 0, 0).y - at(1.435).y).toBeGreaterThan(1.4);
        // The tallest hat, over the tallest hair, keeps its crown in the circle.
        const hatted = F.createAvatar({ hat: 'sunHat', length: 'long' });
        const top = new THREE.Box3().setFromObject(hatted.person.children.find((o) => o.name === 'hat')).max.y;
        expect(Math.hypot(0, at(top, 0, 0).y)).toBeLessThan(1);
    });

    function fakes({ width = 800, height = 600, ratio = 2, png = 'data:image/png;base64,AAAA', jpeg = 'data:image/jpeg;base64,BBBB' } = {}) {
        const calls = [];
        const view = new THREE.Vector4(0, 0, width / ratio, height / ratio);
        const scissor = new THREE.Vector4(0, 0, width / ratio, height / ratio);
        let scissorTest = false;
        const renderer = {
            domElement: { width, height },
            getPixelRatio: () => ratio,
            getViewport: (v) => v.copy(view),
            getScissor: (v) => v.copy(scissor),
            getScissorTest: () => scissorTest,
            getRenderTarget: () => null,
            setRenderTarget: (t) => calls.push(['target', t]),
            setViewport: (...a) => { calls.push(['viewport', ...(a[0].isVector4 ? a[0].toArray() : a)]); },
            setScissor: (...a) => { calls.push(['scissor', ...(a[0].isVector4 ? a[0].toArray() : a)]); },
            setScissorTest: (on) => { scissorTest = on; calls.push(['scissorTest', on]); },
            render: (scene, camera) => calls.push(['render', scene.children.length, camera.fov])
        };
        const doc = {
            createElement: () => ({
                getContext: () => ({ drawImage: (...a) => calls.push(['drawImage', ...a.slice(1)]) }),
                toDataURL: (type) => (type === 'image/png' ? png : jpeg)
            })
        };
        return { renderer, doc, calls };
    }

    test('drawn in the bottom left corner of the canvas, copied out, and the viewport put back', () => {
        const { renderer, doc, calls } = fakes();
        const png = `data:image/png;base64,${'A'.repeat(100)}`;
        doc.createElement = () => ({
            getContext: () => ({ drawImage: (...a) => calls.push(['drawImage', ...a.slice(1)]) }),
            toDataURL: () => png
        });
        expect(F.renderPortrait(renderer, { skin: 'deep' }, { doc })).toBe(png);
        const S = F.PORTRAIT.size;
        // Drawn into a square of S device pixels: S / ratio in CSS pixels.
        expect(calls).toContainEqual(['viewport', 0, 0, S / 2, S / 2]);
        expect(calls).toContainEqual(['scissor', 0, 0, S / 2, S / 2]);
        const render = calls.find((c) => c[0] === 'render');
        expect(render[1]).toBe(4);            // three lights and the figure
        expect(render[2]).toBe(F.PORTRAIT.fov);
        // Copied from the bottom of the canvas (GL's origin is bottom left).
        expect(calls).toContainEqual(['drawImage', 0, 600 - S, S, S, 0, 0, S, S]);
        // And everything put back as it was, after the copy.
        const after = calls.slice(calls.findIndex((c) => c[0] === 'drawImage'));
        expect(after).toContainEqual(['viewport', 0, 0, 400, 300]);
        expect(after).toContainEqual(['scissor', 0, 0, 400, 300]);
        expect(after).toContainEqual(['scissorTest', false]);
    });

    test('a large PNG is kept as a JPEG, and anything that is not a picture is null', () => {
        const big = `data:image/png;base64,${'A'.repeat(F.JPEG_ABOVE + 4)}`;
        let f = fakes({ png: big, jpeg: 'data:image/jpeg;base64,QUJD' });
        expect(F.renderPortrait(f.renderer, {}, { doc: f.doc })).toBe('data:image/jpeg;base64,QUJD');
        // The lab's default portrait is a PNG whatever its size.
        f = fakes({ png: big });
        expect(F.renderPortrait(f.renderer, {}, { doc: f.doc, jpegAbove: Infinity })).toBe(big);
        f = fakes({ png: 'data:,' });
        expect(F.renderPortrait(f.renderer, {}, { doc: f.doc })).toBeNull();
    });

    test('a canvas too small, no renderer, no document, or a renderer that throws: null', () => {
        let f = fakes({ width: 100, height: 600 });
        expect(F.renderPortrait(f.renderer, {}, { doc: f.doc })).toBeNull();
        expect(F.renderPortrait(null, {}, { doc: f.doc })).toBeNull();
        f = fakes();
        expect(F.renderPortrait(f.renderer, {}, { doc: null })).toBeNull();
        f.renderer.render = () => { throw new Error('context lost'); };
        expect(F.renderPortrait(f.renderer, {}, { doc: f.doc })).toBeNull();
    });
});

describe('the pieces (M5), measured', () => {
    const HEAD = () => new THREE.Vector3(0, 1.5, 0);   // the rig's head, in the person's coordinates

    /** Every vertex of `object`, in the person's coordinates. */
    function vertices(person, object) {
        person.updateMatrixWorld(true);
        const inv = person.matrixWorld.clone().invert();
        const out = [];
        object.traverse((m) => {
            if (!m.isMesh || !m.visible) return;
            for (let p = m; p && p !== person; p = p.parent) if (!p.visible) return;
            const pos = m.geometry.attributes.position;
            for (let i = 0; i < pos.count; i++) {
                out.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).applyMatrix4(inv));
            }
        });
        return out;
    }

    /** What a ray straight in from the front at (x, y) meets first, in the
     *  person's coordinates (the person at the origin, facing +z). */
    function firstFromFront(person, x, y) {
        person.updateMatrixWorld(true);
        const origin = new THREE.Vector3(x, y, 2).applyMatrix4(person.matrixWorld);
        const ray = new THREE.Raycaster(origin, new THREE.Vector3(0, 0, -1));
        const hits = ray.intersectObject(person, true).filter((h) => {
            for (let p = h.object; p; p = p.parent) if (!p.visible) return false;
            return true;
        });
        return hits[0] ? hits[0].object : null;
    }

    const named = (o, name) => {
        for (let p = o; p; p = p.parent) if (p.name === name) return true;
        return false;
    };

    test('glasses sit in front of the eyes, over the nose, with no arm inside the head', () => {
        for (const kind of ['round', 'square', 'sunglasses']) {
            const avatar = F.createAvatar({ glasses: kind });
            const person = avatar.person;
            const glasses = person.children.find((o) => o.name === 'glasses');
            const c = HEAD();
            const pts = vertices(person, glasses);
            const nearest = Math.min(...pts.map((p) => p.distanceTo(c)));
            expect(`${kind} clears the head: ${nearest > 0.12}`).toBe(`${kind} clears the head: true`);
            // In front of the pupils and the tip of the nose.
            const pupils = person.children.filter((o) => o.userData.isPupil);
            const nose = person.children.find((o) => o.geometry && o.geometry.type === 'ConeGeometry');
            const front = Math.max(...pupils.concat([nose]).flatMap((o) => vertices(person, o)).map((p) => p.z));
            const rings = glasses.children.filter((o) => o.geometry.type === 'TorusGeometry');
            expect(rings).toHaveLength(2);
            for (const r of rings) expect(r.position.z).toBeGreaterThan(front);
            // Each frame is centered on its eye.
            for (const p of pupils) expect(rings.some((r) => Math.abs(r.position.x - p.position.x) < 1e-9 && Math.abs(r.position.y - p.position.y) < 1e-9)).toBe(true);
            // The bridge passes over the nose, not through it.
            const noseTop = Math.max(...vertices(person, nose).map((p) => p.y));
            const bridge = glasses.children[glasses.children.length - 1];
            expect(Math.min(...vertices(person, bridge).map((p) => p.y))).toBeGreaterThan(noseTop);
            avatar.dispose();
        }
        // Sunglasses hide the eyes from the front; clear frames do not.
        const sun = F.createAvatar({ glasses: 'sunglasses' });
        const pupil = sun.person.children.find((o) => o.userData.isPupil);
        expect(firstFromFront(sun.person, pupil.position.x, pupil.position.y).name).toBe('lens');
        const clear = F.createAvatar({ glasses: 'round' });
        expect(firstFromFront(clear.person, pupil.position.x, pupil.position.y).userData.isPupil).toBe(true);
    });

    test('no facial hair covers the smile, and each sits on the face', () => {
        // The points of the lips seen from the front with no facial hair (the
        // smile is sunk a little into the face, so its back is hidden).
        const bare = F.createAvatar({});
        const lips = vertices(bare.person, bare.person.children.find((o) => o.name === 'smile'))
            .filter((p) => firstFromFront(bare.person, p.x, p.y).name === 'smile');
        expect(lips.length).toBeGreaterThan(20);
        for (const kind of ['stubble', 'mustache', 'goatee', 'beard']) {
            for (const length of ['short', 'long']) {
                const avatar = F.createAvatar({ facial: kind, length });
                const person = avatar.person;
                // Every one of them is still the first thing met (stubble is
                // see-through, but it is held to the same rule).
                for (const p of lips) {
                    const hit = firstFromFront(person, p.x, p.y);
                    expect(`${kind}/${length} at ${p.x.toFixed(3)},${p.y.toFixed(3)}: ${hit && hit.name}`).toBe(`${kind}/${length} at ${p.x.toFixed(3)},${p.y.toFixed(3)}: smile`);
                }
                // On the face: none of it inside the head, none far off it.
                const facial = person.children.find((o) => o.name === 'facial');
                const d = vertices(person, facial).map((p) => p.distanceTo(HEAD()));
                expect(Math.min(...d)).toBeGreaterThan(0.108);
                expect(Math.max(...d)).toBeLessThan(0.14);
                avatar.dispose();
            }
        }
        // The mustache shows from the front, just under the nose.
        const m = F.createAvatar({ facial: 'mustache' });
        const hit = firstFromFront(m.person, 0, 1.5 + F.FACIAL_SIZE.mustache.y);
        expect(hit.name).toBe('mustache');
        // And stubble is a shadow, not a solid.
        const st = F.createAvatar({ facial: 'stubble' });
        const shell = st.person.children.find((o) => o.name === 'facial').children[0];
        expect(shell.material.transparent).toBe(true);
        expect(shell.material.opacity).toBeLessThan(0.6);
    });

    test('every hat fits over every hair style: no hair through it, the eyes clear of it', () => {
        for (const hat of ['beanie', 'cap', 'sunHat']) {
            for (const length of ['bald', 'buzz', 'short', 'long']) {
                const avatar = F.createAvatar({ hat, length });
                const person = avatar.person;
                const piece = person.children.find((o) => o.name === 'hat');
                const fit = piece.userData.fit;
                const hair = person.children.find((o) => o.userData.isHair);
                const head = person.children.find((o) => o.userData.isHead);
                const outside = [];
                for (const p of vertices(person, head).concat(hair ? vertices(person, hair) : [])) {
                    if (fit.kind === 'sunHat') {
                        if (p.y <= fit.baseY) continue;
                        // Inside the tapered crown, and under its top.
                        const k = (p.y - fit.baseY) / (fit.top - fit.baseY);
                        const r = fit.r * (1 - k * (1 - F.HAT_SIZE.sunHat.taper));
                        if (Math.hypot(p.x - fit.center.x, p.z - fit.center.z) > r || p.y > fit.top) outside.push(p);
                    } else {
                        // Above the tipped rim, inside the dome.
                        const rel = p.clone().sub(fit.center);
                        const yl = rel.y * Math.cos(fit.tilt) + rel.z * Math.sin(fit.tilt);
                        if (yl > fit.r * Math.cos(fit.edge) && rel.length() > fit.r) outside.push(p);
                    }
                }
                expect(`${hat} over ${length}: ${outside.length} through`).toBe(`${hat} over ${length}: 0 through`);
                // Both eyes are the first thing met from the front.
                for (const pupil of person.children.filter((o) => o.userData.isPupil)) {
                    const hit = firstFromFront(person, pupil.position.x, pupil.position.y);
                    expect(`${hat} over ${length}: ${Boolean(hit && hit.userData.isPupil)}`).toBe(`${hat} over ${length}: true`);
                }
                avatar.dispose();
            }
        }
    });

    test('a hat is snug on a buzz cut and roomier over long hair, and long hair hangs from under it', () => {
        const size = (length) => F.createAvatar({ hat: 'beanie', length }).person.children.find((o) => o.name === 'hat').userData.fit.r;
        expect(size('buzz')).toBeLessThan(size('short'));
        // Fitted to the rounded hair, not the long hair's boxy hanks, so it
        // does not balloon (preview, 2026-10-24: it was 18 cm across).
        expect(size('long')).toBeLessThan(0.16);
        const long = F.createAvatar({ hat: 'beanie', length: 'long' });
        const hanks = [];
        long.person.children.find((o) => o.userData.isHair).traverse((m) => {
            if (m.isMesh && m.geometry.type === 'BoxGeometry') hanks.push(m);
        });
        expect(hanks.length).toBeGreaterThan(0);
        // Trimmed, but still hanging: shorter than they were, and shown.
        expect(hanks.every((m) => m.visible && m.scale.y < 1)).toBe(true);
        // Without a hat the hair is exactly as the rig made it.
        F.createAvatar({ length: 'long' }).person.children.find((o) => o.userData.isHair).traverse((m) => {
            if (m.isMesh) expect(m.scale.y).toBe(1);
        });
    });

    test('a hank under a hat is left, trimmed to the rim, or hidden when it is all above it', () => {
        const hair = new THREE.Group();
        const hank = (y, h) => {
            const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, h, 0.1), new THREE.MeshBasicMaterial());
            m.position.y = y;
            hair.add(m);
            return m;
        };
        const below = hank(1.3, 0.1);      // 1.25 to 1.35
        const across = hank(1.45, 0.3);    // 1.30 to 1.60
        const above = hank(1.6, 0.06);     // 1.57 to 1.63
        const round = new THREE.Mesh(new THREE.SphereGeometry(0.1), new THREE.MeshBasicMaterial());
        round.position.y = 1.6;
        hair.add(round);
        F.trimUnder(hair, () => 1.5, 0);
        expect([below.position.y, below.scale.y, below.visible]).toEqual([1.3, 1, true]);
        expect(across.position.y - 0.15 * across.scale.y).toBeCloseTo(1.3, 9);
        expect(across.position.y + 0.15 * across.scale.y).toBeCloseTo(1.5, 9);
        expect(above.visible).toBe(false);
        // The rounded parts are what the hat is fitted over, never cut.
        expect([round.position.y, round.scale.y, round.visible]).toEqual([1.6, 1, true]);
    });

    test('sneakers: a sole under each shoe, proud of it all round, gray under a white shoe', () => {
        for (const [build, color] of [['straight', 'black'], ['slim', 'white']]) {
            const avatar = F.createAvatar({ shoes: 'sneakers', build, shoeColor: color });
            const person = avatar.person;
            const shoes = [];
            const soles = [];
            person.traverse((o) => {
                if (o.isMesh && o.userData.isShoe) shoes.push(o);
                if (o.name === 'sole') soles.push(o);
            });
            expect(shoes).toHaveLength(2);
            expect(soles).toHaveLength(2);
            for (const shoe of shoes) {
                const sb = new THREE.Box3().setFromObject(shoe);
                const sole = soles.find((s) => s.parent === shoe.parent);
                const b = new THREE.Box3().setFromObject(sole);
                expect(b.min.y).toBeCloseTo(sb.min.y, 6);
                expect(b.min.x).toBeLessThan(sb.min.x);
                expect(b.max.x).toBeGreaterThan(sb.max.x);
                expect(b.max.z).toBeGreaterThan(sb.max.z);
                expect(sole.material.color.getHex()).toBe(new THREE.Color(color === 'white' ? F.SNEAKER_SIZE.soleOnWhite : F.SNEAKER_SIZE.soleColor).getHex());
            }
            avatar.dispose();
        }
        // Classic shoes and mary janes get no sole.
        for (const shoes of ['classic', 'maryJane']) {
            let found = 0;
            F.createAvatar({ shoes }).person.traverse((o) => { if (o.name === 'sole') found++; });
            expect(found).toBe(0);
        }
    });

    test('no piece casts a shadow (a hat\'s would darken the whole face)', () => {
        const avatar = F.createAvatar({ hat: 'sunHat', glasses: 'sunglasses', facial: 'beard' });
        for (const name of ['hat', 'glasses', 'facial']) {
            avatar.person.children.find((o) => o.name === name).traverse((m) => {
                if (m.isMesh) expect(`${name}: ${m.castShadow}`).toBe(`${name}: false`);
            });
        }
    });
});

describe('what this version draws', () => {
    test('every piece is drawn, and a field can still be held back to what is ready', () => {
        expect(F.DRAWN).toEqual({});
        expect(F.drawnOptions('hat', A.HATS)).toEqual(A.HATS);
        expect(F.drawnOptions('skin', A.SKINS)).not.toBe(A.SKINS);
        expect(F.drawnOptions('hat', A.HATS, { hat: ['none', 'cap'] }).map((o) => o.id)).toEqual(['none', 'cap']);
    });

    test('smoothstep is clamped and smooth', () => {
        expect(F.smoothstep(-1)).toBe(0);
        expect(F.smoothstep(2)).toBe(1);
        expect(F.smoothstep(0.5)).toBe(0.5);
    });

    test('the smile\'s arc spans its width and rises its lift', () => {
        const { radius, arc } = F.smileArc(0.04, 0.0072);
        expect(2 * radius * Math.sin(arc / 2)).toBeCloseTo(0.04, 9);
        expect(radius - radius * Math.cos(arc / 2)).toBeCloseTo(0.0072, 9);
    });
});
