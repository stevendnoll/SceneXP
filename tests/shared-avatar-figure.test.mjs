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
let S;
let createPerson;
let leavesPerson;
let DEFAULT_CHOICE;

beforeAll(async () => {
    THREE = await loadRealThree();
    globalThis.THREE = THREE;
    F = await import('../www/shared/js/avatar-figure-1.0.0.js');
    A = await import('../www/shared/js/avatar-1.0.0.min.js');
    S = await import('../www/shared/js/avatar-shapes-1.0.0.min.js');
    ({ createPerson } = await import('../www/shared/js/people-1.0.0.min.js'));
    ({ personConfig: leavesPerson, DEFAULT_CHOICE } = await import('../www/leaves/js/cast.js'));
});

afterAll(() => {
    delete globalThis.THREE;
});

/** The first object under `root` that `pred` picks, at any depth. */
function findIn(root, pred) {
    let found = null;
    root.traverse((o) => {
        if (!found && pred(o)) found = o;
    });
    return found;
}

/** Every object under `root` that `pred` picks, at any depth. */
function allIn(root, pred) {
    const out = [];
    root.traverse((o) => {
        if (pred(o)) out.push(o);
    });
    return out;
}

/** Where `o` is, in the person's coordinates (the face is in its own
 *  group since 2026-10-24, so a part's own position is the head's). */
function at(person, o) {
    person.updateMatrixWorld(true);
    return o.getWorldPosition(new THREE.Vector3()).applyMatrix4(person.matrixWorld.clone().invert());
}

/** Is `o` part of the hair (the rig's or avatar-hair's)? Compared on its
 *  own: the short cut is avatar-hair's since 2026-10-24. */
function inHair(o) {
    for (let p = o; p; p = p.parent) if (p.userData && p.userData.isHair) return true;
    return false;
}

/** Is `o` inside a group named `name`? */
function inside(o, name) {
    for (let p = o; p; p = p.parent) if (p.name === name) return true;
    return false;
}

/** Every mesh of a figure but its mouth and its brows (the face the rig
 *  never had), as plain records, sorted, so a figure regrouped (the head
 *  in its own group since 2026-10-24) compares by what is drawn, not by
 *  the order it was built in. */
function meshes(root) {
    root.updateMatrixWorld(true);
    const out = [];
    root.traverse((o) => {
        if (!o.isMesh || inside(o, 'mouth') || inside(o, 'brows') || inHair(o)) return;
        const p = new THREE.Vector3();
        o.getWorldPosition(p);
        const round = (n) => Math.round(n * 1e5) / 1e5;
        // The avatar's head is the rig's head drawn smoother (2026-10-24):
        // compared by its radius here, its sides asserted on their own. Its
        // pupils are the rig's flattened onto the whites (2026-10-25):
        // compared across and up, their depth asserted on its own.
        const head = o.userData.isHead;
        const pupil = o.userData.isPupil;
        out.push({
            name: o.name,
            geometry: o.geometry.type,
            // A shape's uuid is fresh every build, so it is left out.
            params: head ? `radius ${o.geometry.parameters.radius}` : JSON.stringify(o.geometry.parameters || {}, (k, v) => (k === 'uuid' ? undefined : v)),
            vertices: head ? 'head' : o.geometry.attributes.position.count,
            at: (pupil ? [p.x, p.y, 'lens'] : p.toArray()).map((n) => (typeof n === 'number' ? round(n) : n)),
            scale: (pupil ? [o.scale.x, o.scale.y, 'lens'] : o.scale.toArray()).map((n) => (typeof n === 'number' ? round(n) : n)),
            color: o.material.color ? o.material.color.getHex() : null
        });
    });
    return out.sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));
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
    /** Leaf Blower's operator with the avatar's standard hands: the one
     *  deliberate difference in the body since 2026-10-26 (Steve's QA: the
     *  rig's hands are about half a real hand's size, so the avatar's
     *  standard is bigger than the rig's default). */
    const operator = (choice) => createPerson({ ...leavesPerson(choice), handScale: A.optionOf(A.HAND_SIZES, 'standard').scale });

    test('the default avatar is Leaf Blower\'s operator, mesh for mesh, with a smile', () => {
        const today = meshes(operator(DEFAULT_CHOICE));
        const avatar = F.createAvatar(A.DEFAULT_AVATAR, { role: 'operator' });
        expect(meshes(avatar.group)).toEqual(today);
        // The deliberate differences: the short cut is avatar-hair's, lying
        // on the head (the rig's is a bowl: Steve's QA, 2026-10-24), and the
        // head is smoother, the same size.
        const hair = avatar.person.getObjectByName('hair');
        expect(hair.userData.style).toBe('short');
        expect(hair.children.map((m) => m.name)).toEqual(['scalp']);
        const head = findIn(avatar.person, (o) => o.userData.isHead).geometry.parameters;
        expect([head.radius, head.widthSegments, head.heightSegments]).toEqual([0.12, ...F.HEAD_SEGMENTS]);
        const mouth = avatar.person.getObjectByName('mouth');
        expect(mouth.children.map((m) => m.name)).toEqual(['lips']);
        avatar.dispose();
    });

    test('every Leaf Blower choice carried over builds the same figure', () => {
        for (const choice of [
            { shirt: 'white', pants: 'khaki', skin: 'deep', hair: 'gray', length: 'long' },
            { shirt: 'teal', pants: 'black', skin: 'light', hair: 'blond', length: 'bald' },
            { shirt: 'mustard', pants: 'denim', skin: 'tan', hair: 'auburn', length: 'buzz' }
        ]) {
            const rig = operator(choice);
            const today = meshes(rig);
            const avatar = F.createAvatar(A.fromCastChoice(choice), { role: 'operator' });
            expect(meshes(avatar.group)).toEqual(today);
            // The rig's own styles (long, buzzed) are the rig's own hair, mesh
            // for mesh; the short cut is avatar-hair's.
            const hairOf = (root) => {
                root.updateMatrixWorld(true);
                const out = [];
                root.traverse((o) => {
                    if (o.isMesh && inHair(o)) out.push([o.geometry.type, o.getWorldPosition(new THREE.Vector3()).toArray().map((n) => n.toFixed(5)).join()]);
                });
                return out.sort();
            };
            if (choice.length === 'long' || choice.length === 'buzz') expect(hairOf(avatar.group)).toEqual(hairOf(rig));
        }
    });

    test('no leg comes through the skirt, on any build, at any strength', () => {
        const v = new THREE.Vector3();
        for (const look of A.BUILDS.flatMap((b) => A.MUSCLES.map((m) => ({ build: b.id, muscles: m.id })))) {
            const build = `${look.build}/${look.muscles}`;
            const avatar = F.createAvatar({ ...look, bottom: 'skirt' });
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
            // Inside the skirt, with the clearance to spare.
            expect(`${build}: ${worst < -F.SKIRT_CLEARANCE + 1e-6}`).toBe(`${build}: true`);
            avatar.dispose();
        }
    });

    test('the skirt widens only for fuller legs (Curvy, Buff), so the test above can fail', () => {
        const flare = (look) => F.createAvatar({ ...look, bottom: 'skirt' }).person.children.find((o) => o.userData.isSkirt).scale.x;
        expect(flare({ build: 'straight' })).toBe(1);
        expect(flare({ build: 'curvy' })).toBeGreaterThan(1.1);
        expect(flare({ build: 'straight', muscles: 'buff' })).toBeGreaterThan(1.1);
        expect(flare({ build: 'curvy', muscles: 'buff' })).toBeGreaterThan(flare({ build: 'curvy' }));
    });

    test('the smile sits on the front of the face, below the nose, in a rose of the skin', () => {
        for (const skin of A.SKINS) {
            const avatar = F.createAvatar({ skin: skin.id });
            const person = avatar.person;
            person.updateMatrixWorld(true);
            const head = findIn(person, (o) => o.userData.isHead);
            const smile = person.getObjectByName('mouth').children.find((m) => m.name === 'lips');
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
            expect(box.max.x - box.min.x).toBeCloseTo(F.MOUTH_SIZE.smile.width, 2);
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
        hatted.group.updateMatrixWorld(true);
        const top = new THREE.Box3().setFromObject(hatted.person.getObjectByName('hat')).max.y;
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
        for (const kind of ['round', 'square', 'sunglasses', 'roundSun']) {
            const avatar = F.createAvatar({ glasses: kind });
            const person = avatar.person;
            const glasses = person.getObjectByName('glasses');
            const c = HEAD();
            const pts = vertices(person, glasses);
            const nearest = Math.min(...pts.map((p) => p.distanceTo(c)));
            expect(`${kind} clears the head: ${nearest > 0.12}`).toBe(`${kind} clears the head: true`);
            // In front of the pupils and the tip of the nose.
            const pupils = allIn(person, (o) => o.userData.isPupil);
            const nose = findIn(person, (o) => o.userData.isNose);
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
        const pupil = at(sun.person, findIn(sun.person, (o) => o.userData.isPupil));
        expect(firstFromFront(sun.person, pupil.x, pupil.y).name).toBe('lens');
        const roundSun = F.createAvatar({ glasses: 'roundSun' });
        expect(firstFromFront(roundSun.person, pupil.x, pupil.y).name).toBe('lens');
        // Round sunglasses are round: a ring of many sides, not four.
        const ring = roundSun.person.getObjectByName('glasses').children.find((o) => o.geometry.type === 'TorusGeometry');
        expect(ring.geometry.parameters.tubularSegments).toBeGreaterThan(8);
        const clear = F.createAvatar({ glasses: 'round' });
        expect(firstFromFront(clear.person, pupil.x, pupil.y).userData.isPupil).toBe(true);
    });

    test('every billed or brimmed hat clears the glasses under it, and sits where it did without them (2026-10-26)', async () => {
        // Steve's QA: the sunglasses went "straight through the hat/bill".
        // A bill over glasses is pitched flatter, and the hat lifted by what
        // is still needed, measured on the built pieces; no glasses, no
        // change.
        const HT = await import('../www/shared/js/avatar-hats-1.0.0.js');
        const hats = A.HATS.map((h) => h.id).filter((h) => h !== 'none');
        const glassesKinds = ['round', 'sunglasses', 'aviators', 'sport', 'oversized'];
        for (const hat of hats) {
            const bare = F.createAvatar({ hat }).person.getObjectByName('hat');
            expect(`${hat} lift without glasses: ${bare.userData.fit.lift}`).toBe(`${hat} lift without glasses: 0`);
            for (const glasses of glassesKinds) {
                const avatar = F.createAvatar({ hat, glasses });
                const face = avatar.person.getObjectByName('head');
                const clear = F.glassesClearance(face);
                expect(clear.top).toBeGreaterThan(0.03);
                const worn = face.getObjectByName('hat');
                const low = HT.lowestOver(worn, clear);
                // Clear by the gap, or not over the frames at all.
                if (low !== Infinity) expect(`${hat} over ${glasses}: ${low >= clear.top + HT.OVER_GLASSES.gap - 1e-6}`).toBe(`${hat} over ${glasses}: true`);
                // Lifted a little at most: a cap pushed up, not a hat afloat.
                expect(worn.userData.fit.lift).toBeGreaterThanOrEqual(0);
                expect(`${hat} over ${glasses} lift: ${worn.userData.fit.lift < 0.03}`).toBe(`${hat} over ${glasses} lift: true`);
            }
        }
        // The cap does meet the frames without the measure: its bill is
        // pitched down through the sunglasses' top, so the measure moves it.
        const cap = F.createAvatar({ hat: 'cap', glasses: 'sunglasses' }).person.getObjectByName('hat');
        expect(cap.userData.fit.lift).toBeGreaterThan(0);
        expect(F.glassesClearance(F.createAvatar({}).person.getObjectByName('head'))).toBeNull();
    });

    test('the new sunglasses (2026-10-25) clear the head, cover the eyes, and keep their bridge over the nose', () => {
        const c = HEAD();
        for (const kind of ['aviators', 'catEye', 'sport', 'oversized']) {
            const avatar = F.createAvatar({ glasses: kind });
            const person = avatar.person;
            const glasses = person.getObjectByName('glasses');
            const pts = vertices(person, glasses);
            const nearest = Math.min(...pts.map((p) => p.distanceTo(c)));
            expect(`${kind} clears the head: ${nearest > 0.12}`).toBe(`${kind} clears the head: true`);
            // Every lens hides its pupil from the front.
            for (const pupil of allIn(person, (o) => o.userData.isPupil)) {
                const p = at(person, pupil);
                expect(`${kind} over the pupil: ${firstFromFront(person, p.x, p.y).name}`).toBe(`${kind} over the pupil: lens`);
            }
            const nose = findIn(person, (o) => o.userData.isNose);
            const noseTop = Math.max(...vertices(person, nose).map((p) => p.y));
            if (kind !== 'sport') {
                // Two frames, each drawn round an outline (a tube) or a
                // ring, and the bridge last, over the nose.
                const frames = glasses.children.filter((o) => o.geometry.type === 'TubeGeometry' || o.geometry.type === 'TorusGeometry');
                expect(`${kind} frames: ${frames.length}`).toBe(`${kind} frames: 2`);
                const bridge = glasses.children[glasses.children.length - 1];
                expect(Math.min(...vertices(person, bridge).map((p) => p.y))).toBeGreaterThan(noseTop);
            } else {
                // One lens for both eyes, wider than the face, with a bar
                // along its top.
                const lenses = glasses.children.filter((o) => o.name === 'lens');
                expect(lenses).toHaveLength(1);
                const xs = vertices(person, lenses[0]).map((p) => p.x);
                expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.2);
                expect(glasses.children.some((o) => o.geometry.type === 'TubeGeometry')).toBe(true);
            }
            avatar.dispose();
        }
        // Aviators are teardrops, widest across the top: the frame's
        // widest row is above its middle. A cat eye flicks up at its outer
        // top corner: the frame's highest point is outward of its middle.
        const frameOf = (kind, side) => {
            const person = F.createAvatar({ glasses: kind }).person;
            const frames = person.getObjectByName('glasses').children.filter((o) => o.geometry.type === 'TubeGeometry');
            const frame = frames.find((f) => Math.sign(f.position.x) === side);
            return { pts: vertices(person, frame), mid: at(person, frame) };
        };
        const aviator = frameOf('aviators', 1);
        const rows = new Map();
        for (const p of aviator.pts) {
            const row = Math.round((p.y - aviator.mid.y) * 500) / 500;
            rows.set(row, Math.max(rows.get(row) || 0, Math.abs(p.x - aviator.mid.x)));
        }
        const widest = [...rows.entries()].sort((a, b) => b[1] - a[1])[0][0];
        expect(widest).toBeGreaterThan(0);
        const cat = frameOf('catEye', 1);
        const highest = cat.pts.reduce((best, p) => (p.y > best.y ? p : best), cat.pts[0]);
        expect(highest.x - cat.mid.x).toBeGreaterThan(0.012);
        // The aviators' second bar is above the bridge every style has.
        const aviators = F.createAvatar({ glasses: 'aviators' }).person.getObjectByName('glasses');
        const bars = aviators.children.slice(-2).map((b) => at(aviators.parent, b).y);
        expect(bars[0]).toBeGreaterThan(bars[1]);
    });

    test('a chosen frame color and lens color replace a style\'s own, metal frames shine, and clear lenses empty the frames (2026-10-25)', () => {
        const glasses = (look) => F.createAvatar(look).person.getObjectByName('glasses');
        const frameMat = (g) => g.children.find((o) => o.geometry.type === 'TorusGeometry' || o.geometry.type === 'TubeGeometry').material;
        const lensMat = (g) => g.children.find((o) => o.name === 'lens').material;
        // The style's own colors by default.
        expect(frameMat(glasses({ glasses: 'round' })).color.getHex()).toBe(F.GLASSES_SIZE.round.frame);
        expect(lensMat(glasses({ glasses: 'sunglasses' })).color.getHex()).toBe(F.GLASSES_SIZE.sunglasses.lens);
        expect(frameMat(glasses({ glasses: 'aviators' })).metalness).toBeGreaterThan(0.5);
        expect(frameMat(glasses({ glasses: 'round' })).metalness).toBeLessThan(0.5);
        // Chosen ones, on any style, custom colors too.
        expect(frameMat(glasses({ glasses: 'sunglasses', frameColor: 'red' })).color.getHex()).toBe(A.colorOf('frameColor', 'red'));
        expect(frameMat(glasses({ glasses: 'sport', frameColor: 'x3d6fd6' })).color.getHex()).toBe(0x3d6fd6);
        expect(lensMat(glasses({ glasses: 'catEye', lensColor: 'rose' })).color.getHex()).toBe(A.colorOf('lensColor', 'rose'));
        expect(lensMat(glasses({ glasses: 'sport', lensColor: 'x80d0ff' })).color.getHex()).toBe(0x80d0ff);
        // A metal shines, and a painted color on metal frames does not.
        expect(frameMat(glasses({ glasses: 'round', frameColor: 'gold' })).metalness).toBeGreaterThan(0.5);
        expect(frameMat(glasses({ glasses: 'aviators', frameColor: 'black' })).metalness).toBeLessThan(0.5);
        // A tint fills clear frames with lenses; "clear" empties sunglasses.
        expect(glasses({ glasses: 'round' }).children.filter((o) => o.name === 'lens')).toHaveLength(0);
        expect(glasses({ glasses: 'round', lensColor: 'amber' }).children.filter((o) => o.name === 'lens')).toHaveLength(2);
        expect(glasses({ glasses: 'sunglasses', lensColor: 'clear' }).children.filter((o) => o.name === 'lens')).toHaveLength(0);
        expect(glasses({ glasses: 'sport', lensColor: 'clear' }).children.filter((o) => o.name === 'lens')).toHaveLength(0);
    });

    test('hand and foot sizes scale the rig\'s hands and shoes, the feet over the muscles\' (2026-10-25)', () => {
        // The hand is one mesh of a palm, fingers and a thumb (2026-10-26):
        // its width, from its geometry.
        const hand = (look) => {
            const mesh = F.createAvatar(look).arms.right.userData.forearm.children[2];
            expect(mesh.userData.isHand).toBe(true);
            mesh.geometry.computeBoundingBox();
            return mesh.geometry.boundingBox.max.x - mesh.geometry.boundingBox.min.x;
        };
        const shoe = (look) => {
            const leg = F.createAvatar(look).person.children.find((o) => o.userData.isLeg);
            return leg.children.find((m) => m.userData.isShoe).geometry.parameters;
        };
        const scaleOf = (id) => A.optionOf(A.HAND_SIZES, id).scale;
        expect(hand({ handSize: 'large' }) / hand({})).toBeCloseTo(scaleOf('large') / scaleOf('standard'), 6);
        expect(hand({ handSize: 'xxl' }) / hand({})).toBeCloseTo(scaleOf('xxl') / scaleOf('standard'), 6);
        expect(hand({ handSize: 'small' })).toBeLessThan(hand({}));
        // A huge hand never brings a club of a wrist: the wrist stops at
        // most of the arm's own radius (2026-10-26).
        const wristOf = (look) => {
            const fore = F.createAvatar(look).arms.right.userData.forearm;
            const cyl = fore.children.find((m) => m.isMesh && m.geometry.type === 'CylinderGeometry');
            return cyl.geometry.parameters;
        };
        const huge = wristOf({ handSize: 'xxl' });
        expect(huge.radiusBottom).toBeLessThan(huge.radiusTop * 0.9);
        expect(huge.radiusBottom).toBeGreaterThan(wristOf({ handSize: 'small' }).radiusBottom);
        // The hands keep their size when the arms are strengthened.
        expect(hand({ handSize: 'large', muscles: 'athletic' })).toBe(hand({ handSize: 'large' }));
        // Athletic thickens the forearm at the elbow and leaves the wrist to
        // the hand (Steve's QA, 2026-10-26: the forearms flared at the
        // wrist); the forearm narrows toward the hand on every build.
        const forearm = (look) => {
            const fore = F.createAvatar(look).arms.right.userData.forearm;
            const cyl = fore.children.find((m) => m.isMesh && m.geometry.type === 'CylinderGeometry');
            return { elbow: cyl.geometry.parameters.radiusTop * cyl.scale.x, wrist: cyl.geometry.parameters.radiusBottom * cyl.scale.x };
        };
        const plainArm = forearm({});
        const athleticArm = forearm({ muscles: 'athletic' });
        const buffArm = forearm({ muscles: 'buff' });
        expect(athleticArm.elbow / plainArm.elbow).toBeCloseTo(F.ATHLETIC_ARMS, 6);
        expect(athleticArm.wrist).toBe(plainArm.wrist);
        for (const f of [plainArm, athleticArm, buffArm]) expect(f.wrist).toBeLessThan(f.elbow * 0.7);
        expect(buffArm.wrist * 2).toBeLessThan(hand({ muscles: 'buff' }) * 1.1);
        const large = shoe({ footSize: 'large' });
        const standard = shoe({});
        expect(large.width / standard.width).toBeCloseTo(A.optionOf(A.FOOT_SIZES, 'large').scale, 6);
        expect(large.depth).toBeGreaterThan(standard.depth);
        expect(shoe({ footSize: 'small' }).depth).toBeLessThan(standard.depth);
        expect(shoe({ footSize: 'large', muscles: 'buff' }).width).toBeGreaterThan(shoe({ muscles: 'buff' }).width);
        // Dressed shoes follow the block: a large foot's sneaker sole is wider.
        const sole = (look) => {
            const leg = F.createAvatar({ shoes: 'highTops', ...look }).person.children.find((o) => o.userData.isLeg);
            return leg.children.find((m) => m.name === 'sole').geometry.parameters.width;
        };
        expect(sole({ footSize: 'large' })).toBeGreaterThan(sole({}));
    });

    test('no facial hair covers any mouth, and each sits on the face', () => {
        for (const mouth of A.MOUTHS.map((m) => m.id)) {
            // The points of the mouth seen from the front with no facial hair
            // (the gentle smile is sunk a little into the face, so its back
            // is hidden).
            const bare = F.createAvatar({ mouth });
            const seen = vertices(bare.person, bare.person.getObjectByName('mouth'))
                .filter((p) => inside(firstFromFront(bare.person, p.x, p.y), 'mouth'));
            expect(seen.length).toBeGreaterThan(20);
            for (const kind of ['stubble', 'mustache', 'goatee', 'beard']) {
                for (const length of ['short', 'long']) {
                    const avatar = F.createAvatar({ mouth, facial: kind, length });
                    const person = avatar.person;
                    // Every one of them is still the first thing met (stubble
                    // is see-through, but it is held to the same rule).
                    for (const p of seen) {
                        const hit = firstFromFront(person, p.x, p.y);
                        expect(`${mouth} with ${kind}/${length} at ${p.x.toFixed(3)},${p.y.toFixed(3)}: ${inside(hit, 'mouth')}`)
                            .toBe(`${mouth} with ${kind}/${length} at ${p.x.toFixed(3)},${p.y.toFixed(3)}: true`);
                    }
                    // On the face: none of it inside the head, none far off it.
                    const facial = person.getObjectByName('facial');
                    const d = vertices(person, facial).map((p) => p.distanceTo(HEAD()));
                    expect(Math.min(...d)).toBeGreaterThan(0.108);
                    expect(Math.max(...d)).toBeLessThan(0.14);
                    avatar.dispose();
                }
            }
        }
        // The mustache shows from the front, just under the nose.
        const m = F.createAvatar({ facial: 'mustache' });
        const hit = firstFromFront(m.person, 0, 1.5 + F.FACIAL_SIZE.mustache.y);
        expect(hit.name).toBe('mustache');
        // And stubble is a shadow, not a solid.
        const st = F.createAvatar({ facial: 'stubble' });
        const shell = st.person.getObjectByName('facial').children[0];
        expect(shell.material.transparent).toBe(true);
        expect(shell.material.opacity).toBeLessThan(0.6);
    });

    test('every hat fits over every hair style: no hair through it, the eyes clear of it', () => {
        for (const hat of ['beanie', 'cap', 'sunHat']) {
            for (const length of ['bald', 'buzz', 'short', 'long']) {
                const avatar = F.createAvatar({ hat, length });
                const person = avatar.person;
                const piece = person.getObjectByName('hat');
                const fit = piece.userData.fit;
                const hair = person.getObjectByName('hair');
                const head = findIn(person, (o) => o.userData.isHead);
                const outside = [];
                // In the head group's own coordinates, where the hat records
                // its fit (the face is that group since 2026-10-24).
                const frame = piece.parent;
                frame.updateMatrixWorld(true);
                const into = frame.matrixWorld.clone().invert().multiply(person.matrixWorld);
                const local = (pts) => pts.map((v) => v.clone().applyMatrix4(into));
                for (const p of local(vertices(person, head).concat(hair ? vertices(person, hair) : []))) {
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
                for (const pupil of allIn(person, (o) => o.userData.isPupil)) {
                    const p = at(person, pupil);
                    const hit = firstFromFront(person, p.x, p.y);
                    expect(`${hat} over ${length}: ${Boolean(hit && hit.userData.isPupil)}`).toBe(`${hat} over ${length}: true`);
                }
                avatar.dispose();
            }
        }
    });

    test('a hat is snug on a buzz cut and roomier over long hair, and long hair hangs from under it', () => {
        const size = (length) => F.createAvatar({ hat: 'beanie', length }).person.getObjectByName('hat').userData.fit.r;
        // The short cut lies so close to the head (2026-10-24) that the head
        // itself sizes the hat, as bald and buzzed do; fuller hair is roomier.
        expect(size('buzz')).toBeLessThanOrEqual(size('short'));
        expect(size('bald')).toBeLessThanOrEqual(size('buzz'));
        expect(size('long')).toBeGreaterThan(size('short'));
        expect(size('afro')).toBeGreaterThan(size('long'));
        // Fitted to the rounded hair, not the long hair's boxy hanks, so it
        // does not balloon (preview, 2026-10-24: it was 18 cm across).
        expect(size('long')).toBeLessThan(0.16);
        const long = F.createAvatar({ hat: 'beanie', length: 'long' });
        const hanks = [];
        long.person.getObjectByName('hair').traverse((m) => {
            if (m.isMesh && m.geometry.type === 'BoxGeometry') hanks.push(m);
        });
        expect(hanks.length).toBeGreaterThan(0);
        // Trimmed, but still hanging: shorter than they were, and shown.
        expect(hanks.every((m) => m.visible && m.scale.y < 1)).toBe(true);
        // Without a hat the hair is exactly as the rig made it.
        F.createAvatar({ length: 'long' }).person.getObjectByName('hair').traverse((m) => {
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
            // A white toe cap and heel too, so they never read as the
            // classic shoe (Steve's QA, 2026-10-24).
            for (const part of ['toe-cap', 'heel', 'laces']) {
                let n = 0;
                person.traverse((o) => { if (o.name === part) n++; });
                expect(`${part}: ${n}`).toBe(`${part}: 2`);
            }
            for (const shoe of shoes) {
                const sb = new THREE.Box3().setFromObject(shoe);
                const sole = soles.find((s) => s.parent === shoe.parent);
                const b = new THREE.Box3().setFromObject(sole);
                expect(b.min.y).toBeCloseTo(sb.min.y, 6);
                expect(b.min.x).toBeLessThan(sb.min.x);
                expect(b.max.x).toBeGreaterThan(sb.max.x);
                expect(b.max.z).toBeGreaterThan(sb.max.z);
                expect(sole.material.color.getHex()).toBe(new THREE.Color(color === 'white' ? F.SNEAKER_SIZE.trimOnWhite : F.SNEAKER_SIZE.trim).getHex());
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

    test('sandals, flats, heels, platforms and slippers (Steve, 2026-10-24)', () => {
        const parts = (person, name) => {
            const out = [];
            person.traverse((o) => { if (o.name === name) out.push(o); });
            return out;
        };
        const shoesOf = (person) => {
            const out = [];
            person.traverse((o) => { if (o.isMesh && o.userData.isShoe) out.push(o); });
            return out;
        };
        const skinOf = (avatar) => avatar.person.getObjectByName('head').children.find((o) => o.userData.isHead).material.color.getHex();
        const classic = F.createAvatar({ shoes: 'classic' });
        classic.person.updateMatrixWorld(true);
        const floorY = Math.min(...shoesOf(classic.person).map((s) => new THREE.Box3().setFromObject(s).min.y));
        // Sandals and flats show the foot: the block in the skin's color,
        // with straps or a low upper in the shoe's color.
        for (const [kind, piece, n] of [['sandals', 'strap', 7], ['flats', 'upper', 1]]) {
            const avatar = F.createAvatar({ shoes: kind, shoeColor: 'brown' });
            for (const shoe of shoesOf(avatar.person)) expect(shoe.material.color.getHex()).toBe(skinOf(avatar));
            expect(parts(avatar.person, piece)).toHaveLength(n * 2);
            expect(parts(avatar.person, piece)[0].material.color.getHex()).toBe(0x5a3a24);
        }
        expect(parts(F.createAvatar({ shoes: 'sandals' }).person, 'sole')).toHaveLength(2);
        expect(parts(F.createAvatar({ shoes: 'flats' }).person, 'bow')).toHaveLength(2);
        // Heels: the shoe tilted up at the back, its toe still on the
        // floor, a heel column from the floor up under its back.
        const heels = F.createAvatar({ shoes: 'heels' });
        heels.person.updateMatrixWorld(true);
        for (const shoe of shoesOf(heels.person)) {
            expect(shoe.rotation.x).toBeGreaterThan(0.2);
            const box = new THREE.Box3().setFromObject(shoe);
            expect(box.min.y).toBeCloseTo(floorY, 3);
            expect(box.max.y - box.min.y).toBeGreaterThan(F.SHOE_SIZE.heels.heel + 0.03);
        }
        // A round heel (Steve's QA, 2026-10-25: "round instead of square")
        // from the floor up, and a pointed toe on the floor in front of the
        // block, a closed solid, narrowing to its tip.
        for (const column of parts(heels.person, 'heel')) {
            const box = new THREE.Box3().setFromObject(column);
            expect(box.min.y).toBeCloseTo(floorY, 6);
            expect(column.geometry.type).toBe('CylinderGeometry');
        }
        expect(parts(heels.person, 'heel')).toHaveLength(2);
        const toes = parts(heels.person, 'toe');
        expect(toes).toHaveLength(2);
        const shoeBoxes = shoesOf(heels.person).map((s) => new THREE.Box3().setFromObject(s));
        for (const toe of toes) {
            const box = new THREE.Box3().setFromObject(toe);
            expect(box.min.y).toBeCloseTo(floorY, 6);
            // Past the block's front, which leans forward over its toe edge
            // as it rises.
            expect(box.max.z).toBeGreaterThan(Math.max(...shoeBoxes.map((b) => b.max.z)) + F.SHOE_SIZE.heels.toe * 0.5);
            // Its tip is narrow: the width across its front few millimeters.
            const pos = toe.geometry.attributes.position;
            let tipWidth = 0;
            for (let i = 0; i < pos.count; i++) if (pos.getZ(i) > box.max.z - toe.getWorldPosition(new THREE.Vector3()).z - 0.004) tipWidth = Math.max(tipWidth, Math.abs(pos.getX(i)) * 2);
            expect(tipWidth).toBeLessThan(0.02);
            expect(S.openEdges(toe.geometry)).toBe(0);
        }
        // Platforms: a thick sole under the shoe, and the figure stood up on
        // it, so the sole's bottom is where a classic shoe's is.
        const platforms = F.createAvatar({ shoes: 'platforms' });
        platforms.person.updateMatrixWorld(true);
        expect(platforms.person.position.y).toBeCloseTo(classic.person.position.y + F.SHOE_SIZE.platforms.sole, 6);
        for (const sole of parts(platforms.person, 'sole')) {
            const box = new THREE.Box3().setFromObject(sole);
            expect(box.min.y).toBeCloseTo(floorY, 6);
            expect(box.max.y - box.min.y).toBeCloseTo(F.SHOE_SIZE.platforms.sole, 6);
        }
        for (const shoe of shoesOf(platforms.person)) expect(new THREE.Box3().setFromObject(shoe).min.y).toBeCloseTo(floorY + F.SHOE_SIZE.platforms.sole, 6);
        // Every other shoe leaves the figure where the rig stands it.
        expect(heels.person.position.y).toBe(classic.person.position.y);
        // Slippers: a fleece cuff and a rounded toe on each.
        const slippers = F.createAvatar({ shoes: 'slippers' });
        expect(parts(slippers.person, 'cuff')).toHaveLength(2);
        expect(parts(slippers.person, 'toe')).toHaveLength(2);
        expect(parts(slippers.person, 'cuff')[0].material.color.getHex()).toBe(F.SHOE_SIZE.slippers.fleece);
        for (const avatar of [classic, heels, platforms, slippers]) avatar.dispose();
    });

    test('no piece casts a shadow (a hat\'s would darken the whole face)', () => {
        const avatar = F.createAvatar({ hat: 'sunHat', glasses: 'sunglasses', facial: 'beard', cheeks: 'blush', eyeShape: 'sleepy' });
        for (const name of ['hat', 'glasses', 'facial', 'brows', 'cheeks', 'mouth', 'lid']) {
            avatar.person.getObjectByName(name).traverse((m) => {
                if (m.isMesh) expect(`${name}: ${m.castShadow}`).toBe(`${name}: false`);
            });
        }
    });
});

describe('the second round of choices (Steve\'s QA, 2026-10-24), measured', () => {
    const HEAD = () => new THREE.Vector3(0, 1.5, 0);
    const meshesOf = (o) => {
        const out = [];
        o.traverse((m) => { if (m.isMesh) out.push(m); });
        return out;
    };
    /** Every vertex of `object`, in the person's coordinates. */
    function points(person, object) {
        person.updateMatrixWorld(true);
        const inv = person.matrixWorld.clone().invert();
        const out = [];
        for (const m of meshesOf(object)) {
            const pos = m.geometry.attributes.position;
            for (let i = 0; i < pos.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).applyMatrix4(inv));
        }
        return out;
    }

    test('every mouth sits on the face, below the nose, and the open ones lie on the head, not off it', () => {
        for (const mouth of A.MOUTHS.map((m) => m.id)) {
            const avatar = F.createAvatar({ mouth });
            const group = avatar.person.getObjectByName('mouth');
            const pts = points(avatar.person, group);
            const d = pts.map((p) => p.distanceTo(HEAD()));
            // Within a few millimeters of the 0.12 m head's surface.
            expect(`${mouth}: ${Math.min(...d) > 0.105 && Math.max(...d) < 0.13}`).toBe(`${mouth}: true`);
            // Below the nose (its base 0.025 under the head's middle), above the chin.
            expect(Math.max(...pts.map((p) => p.y))).toBeLessThan(1.5 - 0.035);
            expect(Math.min(...pts.map((p) => p.y))).toBeGreaterThan(1.5 - 0.085);
            expect(Math.max(...pts.map((p) => Math.abs(p.x)))).toBeLessThan(0.036);
        }
        // Every mouth but the "o" lies on the sphere: its layers within a
        // fraction of a millimeter of their own radius, corners and all.
        for (const mouth of ['smile', 'smirk', 'bigSmile', 'grin']) {
            const avatar = F.createAvatar({ mouth });
            for (const m of meshesOf(avatar.person.getObjectByName('mouth'))) {
                const d = points(avatar.person, m).map((p) => p.distanceTo(HEAD()));
                expect(`${mouth} ${m.name}: ${Math.max(...d) - Math.min(...d) < 0.0005}`).toBe(`${mouth} ${m.name}: true`);
            }
        }
    });

    test('no part of any mouth sinks into the head, so the skin never shows through it', () => {
        // THE MIDDLE OF EVERY TRIANGLE, not just its corners: a mouth built
        // from a few long triangles had its corners on the sphere and its
        // middles 2.6 mm inside it, and the skin showed through the open
        // mouth like a tongue (Steve's QA, 2026-10-24).
        for (const mouth of A.MOUTHS.map((m) => m.id)) {
            const avatar = F.createAvatar({ mouth });
            const group = avatar.person.getObjectByName('mouth');
            for (const m of meshesOf(group)) {
                if (m.geometry.type !== 'BufferGeometry') continue;
                const pts = points(avatar.person, m);
                const index = m.geometry.index.array;
                let deepest = Infinity;
                for (let i = 0; i < index.length; i += 3) {
                    const mid = pts[index[i]].clone().add(pts[index[i + 1]]).add(pts[index[i + 2]]).divideScalar(3);
                    deepest = Math.min(deepest, mid.distanceTo(HEAD()));
                }
                expect(`${mouth} ${m.name}: ${deepest > 0.1202}`).toBe(`${mouth} ${m.name}: true`);
            }
        }
    });

    test('the open mouths show their teeth, framed by the lips, with the dark inside behind', () => {
        for (const [mouth, rows] of [['bigSmile', 1], ['grin', 2]]) {
            const group = F.createAvatar({ mouth }).person.getObjectByName('mouth');
            expect(group.children.filter((m) => m.name === 'teeth')).toHaveLength(rows);
            expect(group.children.filter((m) => m.name === 'inside')).toHaveLength(1);
            expect(group.children.filter((m) => m.name === 'lips')).toHaveLength(1);
            const radius = (name) => group.children.find((m) => m.name === name).geometry.attributes.position;
            const dist = (name) => {
                const pos = radius(name);
                return new THREE.Vector3().fromBufferAttribute(pos, 0).distanceTo(HEAD());
            };
            // Layered outward: the inside, then the teeth, then the lips.
            expect(dist('inside')).toBeLessThan(dist('teeth'));
            expect(dist('teeth')).toBeLessThan(dist('lips'));
        }
        // The gentle smile, the smirk and the "o" show no teeth.
        for (const mouth of ['smile', 'smirk', 'surprised']) {
            const group = F.createAvatar({ mouth }).person.getObjectByName('mouth');
            expect(group.children.filter((m) => m.name === 'teeth')).toHaveLength(0);
        }
        // The smirk is a smile with one side up: its left corner (the
        // figure's, at +x) higher than its right; the smile's are level.
        const corners = (mouth) => {
            const avatar = F.createAvatar({ mouth });
            const pts = points(avatar.person, avatar.person.getObjectByName('mouth'));
            const end = (sign) => pts.reduce((best, p) => (sign * p.x > sign * best.x ? p : best));
            return { left: end(1).y, right: end(-1).y };
        };
        const smile = corners('smile');
        const smirk = corners('smirk');
        expect(smile.left).toBeCloseTo(smile.right, 6);
        expect(smirk.left - smirk.right).toBeGreaterThan(0.004);
        // A closed mouth is the crescent alone: no teeth, no inside, and
        // (QA, 2026-10-24) no balls on its ends.
        for (const mouth of ['smile', 'smirk']) {
            const group = F.createAvatar({ mouth }).person.getObjectByName('mouth');
            expect(meshesOf(group).map((m) => m.name)).toEqual(['lips']);
        }
    });

    test('lips are the skin\'s own rose, or the color chosen, on every mouth', () => {
        for (const mouth of A.MOUTHS.map((m) => m.id)) {
            for (const lips of A.LIP_COLORS) {
                const avatar = F.createAvatar({ mouth, lips: lips.id, skin: 'tan' });
                const ring = avatar.person.getObjectByName('mouth').children.find((m) => m.name === 'lips');
                const want = lips.color === null ? F.lipsColor(A.optionOf(A.SKINS, 'tan').color) : lips.color;
                expect(`${mouth}/${lips.id}: ${ring.material.color.getHex()}`).toBe(`${mouth}/${lips.id}: ${new THREE.Color(want).getHex()}`);
            }
        }
    });

    /** A leg's thigh, knee and shin, as the figure built them. */
    function leg(avatar) {
        const l = avatar.person.children.find((o) => o.userData.isLeg);
        const cyl = l.children.filter((m) => m.isMesh && m.geometry.type === 'CylinderGeometry' && m.name !== 'hem').sort((a, b) => b.position.y - a.position.y);
        return { group: l, thigh: cyl[0], shin: cyl[1], knee: l.children.find((m) => m.isMesh && m.geometry.type === 'SphereGeometry') };
    }
    const skinOf = (avatar) => findIn(avatar.person, (o) => o.userData.isHead).material;

    test('bare legs under a skirt, bare from the knee in shorts, and trousers in pants', () => {
        const skirt = F.createAvatar({ bottom: 'skirt' });
        const s = leg(skirt);
        for (const part of ['thigh', 'knee', 'shin']) expect(`skirt ${part}: ${s[part].material === skinOf(skirt)}`).toBe(`skirt ${part}: true`);
        const shorts = F.createAvatar({ bottom: 'shorts', bottomColor: 'khaki' });
        const h = leg(shorts);
        expect(h.knee.material).toBe(skinOf(shorts));
        expect(h.shin.material).toBe(skinOf(shorts));
        expect(h.thigh.material.color.getHex()).toBe(new THREE.Color(A.optionOf(A.PANTS, 'khaki').color).getHex());
        // The hem: at the bottom of the thigh, a little wider than it.
        const hem = h.group.children.find((m) => m.name === 'hem');
        expect(hem.material).toBe(h.thigh.material);
        expect(hem.geometry.parameters.radiusTop).toBeGreaterThan(h.thigh.geometry.parameters.radiusBottom);
        expect(Math.abs(hem.position.y - (h.thigh.position.y - h.thigh.geometry.parameters.height / 2))).toBeLessThan(0.02);
        const pants = F.createAvatar({});
        for (const part of ['thigh', 'knee', 'shin']) expect(leg(pants)[part].material).not.toBe(skinOf(pants));
        expect(leg(pants).group.children.find((m) => m.name === 'hem')).toBeUndefined();
    });

    test('a tank top bares the shoulders and the upper arms, and has no collar', () => {
        const tank = F.createAvatar({ sleeves: 'tank', shirt: 'teal' });
        for (const m of tank.arms.right.children.filter((o) => o.isMesh)) expect(m.material).toBe(skinOf(tank));
        const fore = tank.arms.right.userData.forearm.children[1];
        expect(fore.material.color.getHex()).toBe(skinOf(tank).color.getHex());
        const collar = tank.person.children.find((o) => o.isMesh && o.geometry.type === 'TorusGeometry');
        expect(collar.visible).toBe(false);
        const tee = F.createAvatar({ sleeves: 'short' });
        expect(tee.arms.right.children.filter((o) => o.isMesh).every((m) => m.material !== skinOf(tee))).toBe(true);
        expect(tee.person.children.find((o) => o.isMesh && o.geometry.type === 'TorusGeometry').visible).toBe(true);
    });

    test('athletic arms are thicker and grow outward, not into the body; buff is the rig\'s muscular build', () => {
        const width = (avatar) => {
            const upper = avatar.arms.right.children.find((m) => m.isMesh && m.geometry.type === 'CylinderGeometry');
            return upper.geometry.parameters.radiusTop * upper.scale.x;
        };
        const inner = (avatar) => {
            // The arm's nearest point to the body's middle, at rest.
            const pts = points(avatar.person, avatar.arms.right).filter((p) => p.y > 1.0);
            return Math.min(...pts.map((p) => Math.abs(p.x)));
        };
        const standard = F.createAvatar({});
        const athletic = F.createAvatar({ muscles: 'athletic' });
        expect(width(athletic) / width(standard)).toBeCloseTo(F.ATHLETIC_ARMS, 6);
        expect(Math.abs(inner(athletic) - inner(standard))).toBeLessThan(0.006);
        // The hands stay the hands the rig made.
        const hand = (a) => a.arms.right.userData.forearm.children[2].scale.x;
        expect(hand(athletic)).toBe(hand(standard));
        // The feet keep up with the legs: the shoe's width over the ankle's
        // stays about the same at every strength (Steve's QA, 2026-10-24).
        const ratio = (muscles) => {
            const { shin } = (() => {
                const l = F.createAvatar({ muscles }).person.children.find((o) => o.userData.isLeg);
                const cyl = l.children.filter((m) => m.isMesh && !m.name && m.geometry.type === 'CylinderGeometry').sort((a, b) => b.position.y - a.position.y);
                return { shin: cyl[1], leg: l };
            })();
            const shoe = F.createAvatar({ muscles }).person.children.find((o) => o.userData.isLeg).children.find((m) => m.userData.isShoe);
            return shoe.geometry.parameters.width / shin.geometry.parameters.radiusBottom;
        };
        expect(ratio('buff') / ratio('standard')).toBeGreaterThan(0.85);
        expect(ratio('athletic')).toBeGreaterThan(ratio('standard'));
        const buff = F.createAvatar({ muscles: 'buff' });
        const torso = (a) => new THREE.Box3().setFromObject(a.person.children.find((o) => o.isMesh && o.geometry.type === 'ExtrudeGeometry'));
        expect(torso(buff).max.x).toBeGreaterThan(torso(standard).max.x * 1.2);
        expect(width(buff)).toBeGreaterThan(width(athletic));
    });

    test('every boot is drawn over the leg at every height, stands on the floor, and the tall ones stop under the knee', () => {
        for (const shoes of ['ankleBoots', 'workBoots', 'cowboyBoots', 'tallBoots']) {
            for (const look of [{ build: 'straight' }, { build: 'curvy', bottom: 'skirt' }, { muscles: 'buff', bottom: 'shorts' }]) {
                const avatar = F.createAvatar({ shoes, ...look });
                const { group, shin, knee } = leg(avatar);
                const shafts = group.children.filter((m) => m.name === 'shaft');
                expect(`${shoes}: ${shafts.length}`).toBe(`${shoes}: 1`);
                const s = shafts[0];
                // At each height the shaft spans, it is wider than the shin
                // there (read from both cylinders' own geometry).
                const cyl = (m, y) => {
                    const { radiusTop, radiusBottom, height } = m.geometry.parameters;
                    return radiusBottom + ((y - (m.position.y - height / 2)) / height) * (radiusTop - radiusBottom);
                };
                const lo = s.position.y - s.geometry.parameters.height / 2;
                const hi = s.position.y + s.geometry.parameters.height / 2;
                for (let y = lo; y <= hi; y += 0.01) {
                    const shinLo = shin.position.y - shin.geometry.parameters.height / 2;
                    if (y < shinLo) continue;
                    expect(`${shoes} at ${y.toFixed(2)}: ${cyl(s, y) > cyl(shin, y) + 0.003}`).toBe(`${shoes} at ${y.toFixed(2)}: true`);
                }
                // On the floor: nothing of the boot below the shoe's sole.
                const shoe = group.children.find((m) => m.userData.isShoe);
                const floor = new THREE.Box3().setFromObject(shoe).min.y;
                for (const m of group.children.filter((o) => o.isMesh && !o.userData.isShoe && o !== shin && o !== knee && o.position.y < -0.6)) {
                    expect(new THREE.Box3().setFromObject(m).min.y).toBeGreaterThan(floor - 1e-6);
                }
                if (shoes === 'tallBoots') {
                    const kneeBottom = knee.position.y - knee.geometry.parameters.radius;
                    expect(hi).toBeLessThan(knee.position.y);
                    expect(hi).toBeGreaterThan(kneeBottom - 0.05);
                }
                avatar.dispose();
            }
        }
        // EVERY BOOT IS THE SAME BOOT whatever is worn over it (Steve's QA,
        // 2026-10-24: in shorts the shaft took the hem's width), part for
        // part, and no wider than the shin plus its own `over` and `flare`.
        const parts = (look) => {
            const out = [];
            leg(F.createAvatar(look)).group.children.filter((m) => m.isMesh && m.name && m.name !== 'hem')
                .forEach((m) => out.push([m.name, JSON.stringify(m.geometry.parameters), m.position.toArray().map((n) => n.toFixed(5)).join()]));
            return out;
        };
        for (const shoes of ['ankleBoots', 'workBoots', 'cowboyBoots', 'tallBoots']) {
            const inPants = parts({ shoes });
            expect(inPants.length).toBeGreaterThan(1);
            expect(parts({ shoes, bottom: 'shorts' })).toEqual(inPants);
            expect(parts({ shoes, bottom: 'skirt' })).toEqual(inPants);
            for (const bottom of ['pants', 'shorts', 'skirt']) {
                const { group, shin } = leg(F.createAvatar({ shoes, bottom }));
                const s = group.children.find((m) => m.name === 'shaft');
                const spec = F.BOOT_SIZE[shoes];
                // The shin's radius at a height, along its own taper.
                const { radiusTop, radiusBottom, height } = shin.geometry.parameters;
                const shinAt = (y) => radiusBottom + ((y - (shin.position.y - height / 2)) / height) * (radiusTop - radiusBottom);
                const half = s.geometry.parameters.height / 2;
                const fits = s.geometry.parameters.radiusTop <= shinAt(s.position.y + half) + spec.over + (spec.flare || 0) + 1e-9
                    && s.geometry.parameters.radiusBottom <= shinAt(s.position.y - half) + spec.over + 1e-9;
                expect(`${shoes} in ${bottom}: ${fits}`).toBe(`${shoes} in ${bottom}: true`);
            }
        }
        // The cowboy boot's toe comes to a point past the shoe's front.
        const cowboy = F.createAvatar({ shoes: 'cowboyBoots' });
        const { group } = leg(cowboy);
        const shoe = group.children.find((m) => m.userData.isShoe);
        const toe = group.children.find((m) => m.name === 'toe');
        expect(new THREE.Box3().setFromObject(toe).max.z).toBeGreaterThan(new THREE.Box3().setFromObject(shoe).max.z + 0.03);
        // Mary janes get no shaft: boots are drawn over the block shoe only.
        let shafts = 0;
        F.createAvatar({ shoes: 'maryJane' }).person.traverse((o) => { if (o.name === 'shaft') shafts++; });
        expect(shafts).toBe(0);
    });
});

describe('the face (Steve\'s QA, 2026-10-24), measured', () => {
    const headOf = (avatar) => avatar.person.getObjectByName('head');
    const world = (o) => {
        o.updateWorldMatrix(true, true);
        return o;
    };
    /** Every vertex of `object` in the head's own coordinates. */
    function inHead(avatar, object) {
        const head = world(headOf(avatar));
        const inv = head.matrixWorld.clone().invert();
        const out = [];
        object.traverse((m) => {
            if (!m.isMesh) return;
            const pos = m.geometry.attributes.position;
            for (let i = 0; i < pos.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).applyMatrix4(inv));
        });
        return out;
    }

    test('the head and everything on it are one group, and a round face is exactly the rig\'s', () => {
        const avatar = F.createAvatar({ glasses: 'round', facial: 'beard', hat: 'cap' });
        const head = headOf(avatar);
        expect(head.scale.toArray()).toEqual([1, 1, 1]);
        for (const name of ['mouth', 'brows', 'glasses', 'facial', 'hat', 'hair']) {
            expect(`${name}: ${avatar.person.getObjectByName(name).parent === head}`).toBe(`${name}: true`);
        }
        for (const key of ['isHead', 'isEye', 'isPupil', 'isNose', 'isEar']) {
            expect(`${key}: ${head.children.some((o) => o.userData[key])}`).toBe(`${key}: true`);
            expect(`${key} left behind: ${avatar.person.children.some((o) => o.userData[key])}`).toBe(`${key} left behind: false`);
        }
    });

    test('an oval face stretches the head and all of it together, and every hat still fits', () => {
        const oval = F.createAvatar({ faceShape: 'oval', length: 'short' });
        expect(headOf(oval).scale.toArray()).toEqual([...F.FACE_SCALE.oval]);
        const box = (a) => new THREE.Box3().setFromObject(world(findIn(a.person, (o) => o.userData.isHead)));
        const round = F.createAvatar({});
        const r = box(round);
        const o = box(oval);
        expect(o.max.y - o.min.y).toBeGreaterThan((r.max.y - r.min.y) * 1.05);
        expect(o.max.x - o.min.x).toBeLessThan(r.max.x - r.min.x);
        // The mouth moves with the face: in the head's own coordinates it is
        // exactly where the round face has it.
        const mouthAt = (a) => inHead(a, a.person.getObjectByName('mouth'))[0].toArray().map((n) => n.toFixed(6));
        expect(mouthAt(oval)).toEqual(mouthAt(round));
        // Every hat over every hair style on an oval face: no hair through.
        for (const hat of ['beanie', 'cap', 'sunHat']) {
            for (const length of ['bald', 'short', 'long']) {
                const a = F.createAvatar({ faceShape: 'oval', hat, length });
                const fit = a.person.getObjectByName('hat').userData.fit;
                const hair = a.person.getObjectByName('hair');
                const pts = inHead(a, findIn(a.person, (x) => x.userData.isHead)).concat(hair ? inHead(a, hair) : []);
                const through = pts.filter((p) => {
                    if (fit.kind === 'sunHat') {
                        if (p.y <= fit.baseY) return false;
                        const k = (p.y - fit.baseY) / (fit.top - fit.baseY);
                        return Math.hypot(p.x - fit.center.x, p.z - fit.center.z) > fit.r * (1 - k * (1 - F.HAT_SIZE.sunHat.taper)) || p.y > fit.top;
                    }
                    const rel = p.clone().sub(fit.center);
                    return rel.y * Math.cos(fit.tilt) + rel.z * Math.sin(fit.tilt) > fit.r * Math.cos(fit.edge) && rel.length() > fit.r;
                });
                expect(`oval ${hat}/${length}: ${through.length}`).toBe(`oval ${hat}/${length}: 0`);
            }
        }
    });

    test('the pupil is a lens on the white, barely proud of it, where the rig\'s is a ball standing off it', () => {
        // Steve's QA, 2026-10-25: the pupils "stick out from the whites of
        // the eyes", and poked through a sunglass lens from the side.
        const front = (o) => o.position.z + o.geometry.parameters.radius * o.scale.z;
        const thick = (o) => 2 * o.geometry.parameters.radius * o.scale.z;
        for (const eyeShape of ['round', 'almond', 'wide', 'sleepy', 'lashes']) {
            const face = F.createAvatar({ eyeShape }).person.getObjectByName('head');
            const eyes = face.children.filter((o) => o.userData.isEye);
            for (const pupil of face.children.filter((o) => o.userData.isPupil)) {
                const eye = eyes.find((e) => Math.abs(e.position.x - pupil.position.x) < 1e-9);
                const proud = front(pupil) - front(eye);
                expect(`${eyeShape}: ${proud > 0.001 && proud < 0.005}`).toBe(`${eyeShape}: true`);
                expect(thick(pupil)).toBeLessThan(0.008);
                // Still in front of the white at its rim, so the whole disc shows.
                const rimZ = pupil.position.z;
                const rr = pupil.geometry.parameters.radius * pupil.scale.x;
                const whiteAtRim = eye.position.z + eye.scale.z * Math.sqrt(Math.max(0, eye.geometry.parameters.radius ** 2 - (rr / eye.scale.x) ** 2));
                expect(`${eyeShape}: ${rimZ > whiteAtRim - 0.001}`).toBe(`${eyeShape}: true`);
            }
        }
        // Well behind a sunglass lens.
        const sun = F.createAvatar({ glasses: 'sunglasses' }).person.getObjectByName('head');
        const pupil = sun.children.find((o) => o.userData.isPupil);
        expect(F.GLASSES_SIZE.z - 0.001 - front(pupil)).toBeGreaterThan(0.015);
        // The rig's own pupil stands over a centimeter proud: this test can fail.
        const rig = createPerson({});
        const rigPupil = rig.children.find((o) => o.userData.isPupil);
        const rigEye = rig.children.find((o) => o.userData.isEye);
        expect(front(rigPupil) - front(rigEye)).toBeGreaterThan(0.01);
    });

    test('the eye shapes: almond and wide reshape the rig\'s eye, sleepy lids the top half, lashes line it', () => {
        const eye = (a) => findIn(a.person, (o) => o.userData.isEye);
        expect(eye(F.createAvatar({ eyeShape: 'almond' })).scale.x).toBeGreaterThan(eye(F.createAvatar({})).scale.x);
        expect(eye(F.createAvatar({ eyeShape: 'almond' })).scale.y).toBeLessThan(eye(F.createAvatar({})).scale.y);
        expect(eye(F.createAvatar({ eyeShape: 'wide' })).scale.y).toBeGreaterThan(1);
        // Sleepy: from the front, the top of the pupil is behind the lid and
        // its bottom still shows (preview, 2026-10-24: the first lid closed
        // the eye).
        const sleepy = F.createAvatar({ eyeShape: 'sleepy' });
        const pupil = at(sleepy.person, findIn(sleepy.person, (o) => o.userData.isPupil));
        const ray = (dy) => {
            sleepy.person.updateMatrixWorld(true);
            const hits = new THREE.Raycaster(new THREE.Vector3(pupil.x, pupil.y + dy, 2).applyMatrix4(sleepy.person.matrixWorld), new THREE.Vector3(0, 0, -1))
                .intersectObject(sleepy.person, true);
            return hits[0].object;
        };
        expect(ray(0.007).name).toBe('lid');
        expect(ray(-0.006).userData.isPupil).toBe(true);
        const lashes = F.createAvatar({ eyeShape: 'lashes' });
        expect(allIn(lashes.person, (o) => o.name === 'lashes')).toHaveLength(4);
        expect(allIn(F.createAvatar({}).person, (o) => o.name === 'lid' || o.name === 'lashes')).toHaveLength(0);
    });

    test('every face has brows above its eyes, on the head and not sunk into it, a shade darker than its hair', () => {
        for (const brows of A.BROWS.map((b) => b.id)) {
            const avatar = F.createAvatar({ brows, hair: 'blond' });
            const group = avatar.person.getObjectByName('brows');
            expect(group.children).toHaveLength(2);
            const pts = inHead(avatar, group);
            // Above the eyes (0.02 above the head's middle, 0.018 tall) and
            // below a short cut's hairline.
            expect(Math.min(...pts.map((p) => p.y))).toBeGreaterThan(0.02 + 0.018);
            expect(Math.max(...pts.map((p) => p.y))).toBeLessThan(0.06);
            // The middle of every triangle outside the head (as the mouths).
            for (const m of group.children) {
                const local = inHead(avatar, m);
                const index = m.geometry.index.array;
                for (let i = 0; i < index.length; i += 3) {
                    const mid = local[index[i]].clone().add(local[index[i + 1]]).add(local[index[i + 2]]).divideScalar(3);
                    expect(mid.length()).toBeGreaterThan(0.1202);
                }
            }
            const c = group.children[0].material.color.getHex();
            expect(c).toBe(new THREE.Color(A.optionOf(A.HAIR_COLORS, 'blond').color).multiplyScalar(F.BROW_SIZE.darker).getHex());
        }
        // Bold is thicker than thin, arched higher in the middle than straight.
        const span = (brows) => {
            const a = F.createAvatar({ brows });
            const pts = inHead(a, a.person.getObjectByName('brows'));
            return Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y));
        };
        expect(span('bold')).toBeGreaterThan(span('thin'));
        expect(span('arched')).toBeGreaterThan(span('straight'));
        // Surprised raises them.
        const top = (look) => {
            const a = F.createAvatar(look);
            return Math.max(...inHead(a, a.person.getObjectByName('brows')).map((p) => p.y));
        };
        expect(top({ mouth: 'surprised' }) - top({})).toBeCloseTo(F.BROW_SIZE.surprised, 3);
    });

    test('each nose takes the rig\'s place, in front of the face and under the glasses\' bridge', () => {
        for (const nose of ['button', 'round', 'wide']) {
            const avatar = F.createAvatar({ nose, glasses: 'round' });
            expect(findIn(avatar.person, (o) => o.userData.isNose).visible).toBe(false);
            const mesh = avatar.person.getObjectByName('nose');
            const pts = inHead(avatar, mesh);
            expect(Math.max(...pts.map((p) => p.z))).toBeGreaterThan(0.12);
            const glasses = avatar.person.getObjectByName('glasses');
            const bridge = glasses.children[glasses.children.length - 1];
            expect(Math.min(...inHead(avatar, bridge).map((p) => p.y))).toBeGreaterThan(Math.max(...pts.map((p) => p.y)));
        }
        expect(findIn(F.createAvatar({}).person, (o) => o.userData.isNose).visible).toBe(true);
    });

    test('a beard and a goatee are closed solids lying on the face, round or oval, with no gap under their edges', () => {
        for (const facial of ['beard', 'goatee']) {
            for (const faceShape of ['round', 'oval']) {
                const avatar = F.createAvatar({ facial, faceShape });
                const solid = avatar.person.getObjectByName('facial').children.find((m) => m.name !== 'mustache');
                // In the head's own coordinates (an oval is the head group
                // stretched, the beard with it): its inner surface on the
                // skin, within a millimeter of the head's surface, and none
                // of it inside the head.
                const pts = inHead(avatar, solid);
                const d = pts.map((p) => p.length());
                expect(`${facial}/${faceShape} clear of the head: ${Math.min(...d) > 0.1199}`).toBe(`${facial}/${faceShape} clear of the head: true`);
                const spec = facial === 'beard' ? F.FACIAL_SIZE.beard : F.FACIAL_SIZE.chin;
                expect(spec.inner - 0.12).toBeLessThan(0.001);
                expect(Math.max(...d)).toBeLessThan(spec.r + 1e-6);
                // CLOSED: every edge of it is shared by two triangles, so
                // there is no open rim to see air through (Steve's QA,
                // 2026-10-24: a shell 7 mm off the face showed a gap).
                const pos = solid.geometry.attributes.position;
                const key = (i) => [pos.getX(i), pos.getY(i), pos.getZ(i)].map((n) => n.toFixed(6)).join();
                const edges = new Map();
                const index = solid.geometry.index.array;
                for (let i = 0; i < index.length; i += 3) {
                    for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
                        const e = [key(index[i + a]), key(index[i + b])].sort().join('|');
                        edges.set(e, (edges.get(e) || 0) + 1);
                    }
                }
                const open = [...edges.values()].filter((n) => n !== 2).length;
                expect(`${facial}/${faceShape} open edges: ${open}`).toBe(`${facial}/${faceShape} open edges: 0`);
            }
        }
        // The head the beard lies on is round to within a millimeter: its
        // flat sides sag no deeper than that inside the sphere.
        const [w, h] = F.HEAD_SEGMENTS;
        // (`w` sides round a full turn, `h` from top to bottom: half a turn.)
        expect(0.12 * (1 - Math.cos(Math.PI / w) * Math.cos(Math.PI / (2 * h)))).toBeLessThan(0.001);
        // Stubble lies on the skin too.
        expect(F.FACIAL_SIZE.stubble.r - 0.12).toBeLessThan(0.001);
    });

    test('blush is a soft see-through rose; freckles are dots a shade of the skin', () => {
        const blush = F.createAvatar({ cheeks: 'blush' }).person.getObjectByName('cheeks');
        expect(blush.children).toHaveLength(2);
        expect(blush.children.every((m) => m.material.transparent && m.material.opacity < 0.5)).toBe(true);
        const freckles = F.createAvatar({ cheeks: 'freckles', skin: 'light' }).person.getObjectByName('cheeks');
        expect(freckles.children).toHaveLength(2 * F.CHEEK_SIZE.freckles.dots.length);
        expect(freckles.children[0].material.color.getHex())
            .toBe(new THREE.Color(A.optionOf(A.SKINS, 'light').color).multiplyScalar(F.CHEEK_SIZE.freckles.darker).getHex());
        expect(F.createAvatar({}).person.getObjectByName('cheeks')).toBeUndefined();
    });

    test('custom colors reach the hair, the beard, the hat and the lips, and facial hair can differ from the hair', () => {
        const hex = (o) => o.material.color.getHex();
        const as = (n) => new THREE.Color(n).getHex();
        const a = F.createAvatar({ hair: 'x11aa33', facial: 'beard', facialColor: 'xcc2200', hat: 'beanie', hatColor: 'x0055ff', lips: 'xaa0066' });
        const hairMesh = findIn(a.person.getObjectByName('hair'), (o) => o.isMesh);
        expect(hex(hairMesh)).toBe(as(0x11aa33));
        expect(hex(findIn(a.person.getObjectByName('facial'), (o) => o.isMesh))).toBe(as(0xcc2200));
        expect(hex(findIn(a.person.getObjectByName('hat'), (o) => o.name === 'crown'))).toBe(as(0x0055ff));
        expect(hex(a.person.getObjectByName('mouth').children.find((m) => m.name === 'lips'))).toBe(as(0xaa0066));
        // "Same as hair": the beard follows the hair, custom or not.
        const same = F.createAvatar({ hair: 'x11aa33', facial: 'goatee' });
        expect(hex(findIn(same.person.getObjectByName('facial'), (o) => o.isMesh))).toBe(as(0x11aa33));
        // A white custom shoe gets the gray trim, like the white swatch.
        const white = F.createAvatar({ shoes: 'sneakers', shoeColor: 'xfafafa' });
        expect(hex(findIn(white.person, (o) => o.name === 'sole'))).toBe(as(F.SNEAKER_SIZE.trimOnWhite));
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

});
