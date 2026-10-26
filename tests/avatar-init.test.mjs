// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Your Avatar (www/avatar, specs/avatar M3): the studio, the editor, the way
 * back, and the page's boot.
 *
 * What is held here, and why:
 * - THE STUDIO IS MEASURED ON THE REAL THREE. The figure stands on the
 *   plinth, every framing holds what it is for (the whole figure with a
 *   raised hand, the head, the shoes), and the shadow under the plinth faces
 *   up. A stub would pass all of that with nothing on screen.
 * - IT DRAWS ONLY WHEN SOMETHING MOVES, and the plinth stops turning by
 *   itself after a while, facing the front, so a page left open goes quiet.
 * - THE WAY BACK IS CHECKED: `?return=` names the home page or a scene of
 *   the site's, exactly, or nothing happens.
 * - NOTHING ARRIVES SILENTLY: a link's avatar is shown and asked about, and
 *   kept only on Keep.
 * - EVERY ID THE PAGE LOOKS UP IS IN ITS MARKUP. The DOM stub invents any
 *   id it is asked for, so a typo would boot happily here and do nothing in
 *   a browser.
 */
import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { loadRealThree } from './helpers/real-three.mjs';
import { installThree } from './helpers/three-stub.mjs';
import { installDom, flushAsync, fire } from './helpers/dom-stub.mjs';

const HTML = readFileSync('www/avatar/index.html', 'utf8');
const MAIN = readFileSync('www/avatar/js/main.js', 'utf8');

/** A renderer that draws nothing and counts its frames. */
function fakeRenderer() {
    const r = {
        renders: 0,
        loop: null,
        shadowMap: {},
        setPixelRatio() {},
        setSize() {},
        getPixelRatio: () => 1,
        render() { r.renders++; },
        setAnimationLoop(fn) { r.loop = fn; },
        dispose() { r.disposed = true; }
    };
    return r;
}

function fakeCanvas(w = 800, h = 600) {
    const listeners = {};
    return {
        clientWidth: w,
        clientHeight: h,
        getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h }),
        listeners,
        addEventListener: (t, fn) => { listeners[t] = fn; },
        removeEventListener: (t) => { delete listeners[t]; },
        setPointerCapture() {},
        releasePointerCapture() {}
    };
}

describe('the studio, on the real three', () => {
    let THREE;
    let S;
    let CONFIG;

    beforeAll(async () => {
        THREE = await loadRealThree();
        globalThis.THREE = THREE;
        jest.resetModules();
        S = await import('../www/avatar/js/studio.js');
        ({ AVATAR_PAGE: CONFIG } = await import('../www/avatar/js/config.js'));
    });
    afterAll(() => {
        delete globalThis.THREE;
    });

    function studio(opts = {}) {
        const clock = { t: 100 };
        const renderer = fakeRenderer();
        const canvas = fakeCanvas(opts.w, opts.h);
        const st = S.createStudio(CONFIG, {
            canvas,
            reducedMotion: () => Boolean(opts.still),
            now: () => clock.t,
            makeRenderer: () => renderer
        });
        st.setAvatar(opts.avatar || {});
        st.start();
        // One frame a sixtieth of a second on.
        const tick = (n = 1, dt = 1 / 60) => {
            for (let i = 0; i < n; i++) {
                clock.t += dt;
                renderer.loop();
            }
        };
        return { st, renderer, canvas, clock, tick };
    }

    test('the cove is one seamless surface, floor curving into wall', () => {
        const pts = S.coveProfile(CONFIG.studio.cove);
        expect(pts[0]).toMatchObject({ y: 0, n: [0, 1] });
        expect(pts[pts.length - 1]).toMatchObject({ z: -CONFIG.studio.cove.back, y: CONFIG.studio.cove.height, n: [1, 0] });
        for (let i = 1; i < pts.length; i++) {
            // Each point is a unit normal, and the profile only ever goes back
            // and up: no fold, no step.
            expect(Math.hypot(...pts[i].n)).toBeCloseTo(1, 9);
            expect(pts[i].z).toBeLessThanOrEqual(pts[i - 1].z + 1e-9);
            expect(pts[i].y).toBeGreaterThanOrEqual(pts[i - 1].y - 1e-9);
            // Neighbors' normals turn by no more than one segment's angle.
            const dot = pts[i].n[0] * pts[i - 1].n[0] + pts[i].n[1] * pts[i - 1].n[1];
            expect(dot).toBeGreaterThan(Math.cos(Math.PI / 2 / 20) - 1e-9);
        }
    });

    test('the soft shadow under the plinth faces up, and fades to nothing past it', () => {
        const { st } = studio();
        const shadow = st.scene.getObjectByName('contact-shadow');
        const pos = shadow.geometry.attributes.position;
        const index = shadow.geometry.index.array;
        const a = new THREE.Vector3();
        const b = new THREE.Vector3();
        const c = new THREE.Vector3();
        for (let i = 0; i < index.length; i += 3) {
            a.fromBufferAttribute(pos, index[i]);
            b.fromBufferAttribute(pos, index[i + 1]);
            c.fromBufferAttribute(pos, index[i + 2]);
            const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
            if (n.length() < 1e-12) continue;
            expect(n.y).toBeGreaterThan(0);
        }
        const { plinth, contact } = CONFIG.studio;
        expect(S.contactAlpha(0, plinth.radius, contact)).toBeCloseTo(contact.alpha, 9);
        expect(S.contactAlpha(plinth.radius + contact.soft, plinth.radius, contact)).toBeCloseTo(0, 9);
        // And the cove faces the camera, so it is not culled away.
        const cove = st.scene.getObjectByName('cove');
        const cp = cove.geometry.attributes.position;
        const ci = cove.geometry.index.array;
        a.fromBufferAttribute(cp, ci[0]);
        b.fromBufferAttribute(cp, ci[1]);
        c.fromBufferAttribute(cp, ci[2]);
        expect(new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).y).toBeGreaterThan(0);
    });

    test('the figure stands on the plinth, and every framing holds what it is for', () => {
        for (const [w, h] of [[900, 900], [1200, 700], [390, 380], [700, 1000]]) {
            const { st } = studio({ w, h });
            const figure = st.figure;
            const box = new THREE.Box3().setFromObject(figure.group);
            // The soles on the plinth's top, within a centimeter.
            expect(Math.abs(box.min.y - CONFIG.studio.plinth.height)).toBeLessThan(0.01);
            // The whole figure with its hand raised mid-wave.
            figure.setPose({ right: { z: 2.77, x: -0.12, fore: -0.12 }, left: { z: 0.15, x: 0.1, fore: 0 } });
            const raised = new THREE.Box3().setFromObject(figure.group);
            const inside = (frameName, b, margin = 0.98) => {
                const pose = S.frameFor(CONFIG.camera.frames[frameName], w / h, CONFIG.camera.fov, CONFIG.studio.plinth.height);
                const cam = new THREE.PerspectiveCamera(CONFIG.camera.fov, w / h, 0.05, 60);
                cam.position.fromArray(pose.eye);
                cam.lookAt(...pose.aim);
                cam.updateMatrixWorld(true);
                for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
                    const p = new THREE.Vector3(x, y, z).project(cam);
                    expect(`${frameName} ${w}x${h}: ${Math.abs(p.x) < margin && Math.abs(p.y) < margin}`).toBe(`${frameName} ${w}x${h}: true`);
                }
            };
            inside('body', raised);
            // The head and its hair, in the face framing.
            // The whole head (its hair, brows and mouth with it), in the
            // face framing.
            st.figure.group.updateMatrixWorld(true);
            inside('face', new THREE.Box3().setFromObject(st.figure.person.getObjectByName('head')));
            // Both shoes, in the feet framing.
            const shoes = new THREE.Box3();
            st.figure.person.traverse((o) => {
                if (o.isMesh && o.parent && o.parent.userData.isLeg && o.position.y < -0.7) shoes.union(new THREE.Box3().setFromObject(o));
            });
            expect(shoes.isEmpty()).toBe(false);
            inside('feet', shoes);
        }
    });

    test('the face framing is close: the head fills a good share of the frame', () => {
        const pose = S.frameFor(CONFIG.camera.frames.face, 1, CONFIG.camera.fov, 0.07);
        const cam = new THREE.PerspectiveCamera(CONFIG.camera.fov, 1, 0.05, 60);
        cam.position.fromArray(pose.eye);
        cam.lookAt(...pose.aim);
        cam.updateMatrixWorld(true);
        const top = new THREE.Vector3(0, 1.625 + 0.12, 0).project(cam);
        const chin = new THREE.Vector3(0, 1.625 - 0.12, 0).project(cam);
        expect(top.y - chin.y).toBeGreaterThan(0.7);
    });

    test('it turns by itself while the whole figure shows, then faces the front and goes quiet', () => {
        const { st, renderer, clock, tick } = studio();
        tick(1);
        const a0 = st.turntable.rotation.y;
        tick(60);
        expect(st.turntable.rotation.y).toBeGreaterThan(a0);
        // Nobody touches anything for longer than `idle`.
        clock.t += CONFIG.turntable.idle + 1;
        tick(60);
        expect(st.turntable.rotation.y % (Math.PI * 2)).toBeCloseTo(0, 6);
        const drawn = renderer.renders;
        tick(120);
        expect(renderer.renders).toBe(drawn);
        // Somebody does something: it turns again.
        st.touch();
        tick(30);
        expect(renderer.renders).toBeGreaterThan(drawn);
    });

    test('under reduced motion it never turns by itself, a button turns it at once, and a wave ends before it starts', () => {
        const { st, renderer, tick } = studio({ still: true });
        tick(2);
        const drawn = renderer.renders;
        const a0 = st.turntable.rotation.y;
        tick(60);
        expect(st.turntable.rotation.y).toBe(a0);
        expect(renderer.renders).toBe(drawn);
        st.turnBy(CONFIG.turntable.step);
        expect(st.turntable.rotation.y).toBeCloseTo(a0 + CONFIG.turntable.step, 9);
        st.celebrate();
        tick(60);
        expect(st.figure.gesturing).toBeNull();
    });

    test('a turn button eases a step, and the face framing turns the figure to face the front', () => {
        const { st, tick } = studio();
        st.turnBy(-CONFIG.turntable.step);
        tick(Math.ceil(CONFIG.turntable.stepSeconds * 60) + 2);
        expect(st.turntable.rotation.y).toBeCloseTo(-CONFIG.turntable.step, 3);
        st.setFrame('face');
        expect(st.framing).toBe('face');
        tick(60);
        expect(st.turntable.rotation.y).toBeCloseTo(0, 6);
        // It holds the front in the face framing: no turning by itself.
        tick(120);
        expect(st.turntable.rotation.y).toBeCloseTo(0, 6);
        st.setFrame('nowhere');
        expect(st.framing).toBe('face');
        st.setFrame('body');
        tick(60);
        expect(st.turntable.rotation.y).toBeGreaterThan(0);
    });

    test('a drag turns the plinth with the pointer', () => {
        const { st, canvas, tick } = studio();
        st.setFrame('face');
        tick(60);
        canvas.listeners.pointerdown({ pointerId: 1, clientX: 100, button: 0 });
        canvas.listeners.pointermove({ pointerId: 1, clientX: 150 });
        expect(st.turntable.rotation.y).toBeCloseTo(50 * CONFIG.turntable.drag, 6);
        // Another pointer, and a right button, do nothing.
        canvas.listeners.pointermove({ pointerId: 2, clientX: 400 });
        canvas.listeners.pointerdown({ pointerId: 3, clientX: 0, button: 2 });
        expect(st.turntable.rotation.y).toBeCloseTo(50 * CONFIG.turntable.drag, 6);
        canvas.listeners.pointerup({ pointerId: 1 });
        canvas.listeners.pointermove({ pointerId: 1, clientX: 500 });
        expect(st.turntable.rotation.y).toBeCloseTo(50 * CONFIG.turntable.drag, 6);
    });

    test('after a save it faces the front, then waves', () => {
        const { st, tick } = studio();
        tick(90);
        st.celebrate();
        let waved = false;
        for (let i = 0; i < 120; i++) {
            tick(1);
            if (st.figure.gesturing === 'wave') {
                waved = true;
                expect(st.turntable.rotation.y % (Math.PI * 2)).toBeCloseTo(0, 6);
                break;
            }
        }
        expect(waved).toBe(true);
        // A new look mid-wave keeps waving.
        st.setAvatar({ shirt: 'teal' });
        expect(st.figure.gesturing).toBe('wave');
    });

    test('a portrait is drawn, then the studio straight after, and disposing lets everything go', () => {
        const { st, renderer, canvas } = studio();
        const before = renderer.renders;
        // The fake renderer has no canvas of its own, so there is no portrait,
        // and the studio is still drawn again.
        expect(st.portrait({})).toBeNull();
        expect(renderer.renders).toBe(before + 1);
        st.stop();
        expect(renderer.loop).toBeNull();
        st.start();
        st.dispose();
        expect(renderer.disposed).toBe(true);
        expect(canvas.listeners.pointerdown).toBeUndefined();
    });

    test('the zoom runs from the whole figure to close in, landing exactly on each framing', () => {
        const C = CONFIG.camera;
        const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
        for (const aspect of [0.6, 1, 1.6]) {
            const body = S.frameFor(C.frames.body, aspect, C.fov, 0.07);
            const out = S.viewFor(0, 1.2, aspect, C, 0.07);
            expect(near(out.eye, body.eye) && near(out.aim, body.aim)).toBe(true);
            for (const name of ['face', 'feet']) {
                const f = S.frameFor(C.frames[name], aspect, C.fov, 0.07);
                const v = S.viewFor(1, C.frames[name].center, aspect, C, 0.07);
                expect(`${name} ${aspect}: ${near(v.eye, f.eye) && near(v.aim, f.aim)}`).toBe(`${name} ${aspect}: true`);
            }
            // Every step in is closer than the last, and none overshoots.
            let last = Infinity;
            for (let z = 0; z <= 1.0001; z += 0.1) {
                const d = S.viewFor(z, C.frames.face.center, aspect, C, 0.07).eye[2];
                expect(d).toBeLessThan(last + 1e-12);
                last = d;
            }
            expect(S.viewFor(-1, 1, aspect, C).eye).toEqual(S.viewFor(0, 1, aspect, C).eye);
            expect(S.viewFor(2, 1, aspect, C).eye).toEqual(S.viewFor(1, 1, aspect, C).eye);
        }
        // A close look at the knees is between the feet's and the face's.
        const knees = S.closeFrame(0.6, C);
        expect(knees.height).toBeLessThan(C.frames.feet.height);
        expect(knees.height).toBeGreaterThan(C.frames.face.height);
    });

    test('the wheel zooms in toward the pointer and back out, and a pinch zooms too', () => {
        const { st, canvas, tick } = studio({ w: 800, h: 800 });
        tick(2);
        expect(st.zoom.zoom).toBe(0);
        // Scrolling up over the feet (low on the canvas) zooms in toward them.
        canvas.listeners.wheel({ deltaY: -200, deltaMode: 0, clientY: 740, preventDefault() {} });
        expect(st.zoom.zoom).toBeGreaterThan(0.2);
        expect(st.zoom.focus).toBeLessThan(CONFIG.camera.frames.face.center - 0.3);
        tick(120);
        expect(st.framing).toBe('body');   // not yet halfway in
        canvas.listeners.wheel({ deltaY: -400, deltaMode: 0, clientY: 740, preventDefault() {} });
        expect(st.framing).toBe('feet');
        // And all the way back out, by the wheel alone.
        canvas.listeners.wheel({ deltaY: 4000, deltaMode: 0, clientY: 400, preventDefault() {} });
        expect(st.zoom.zoom).toBe(0);
        // Lines, not pixels (deltaMode 1), and a trackpad's pinch, count more.
        canvas.listeners.wheel({ deltaY: -3, deltaMode: 1, clientY: 100, preventDefault() {} });
        const lines = st.zoom.zoom;
        expect(lines).toBeGreaterThan(0);
        // Two fingers spreading apart zoom in; the plinth does not turn.
        const turned = st.turntable.rotation.y;
        canvas.listeners.pointerdown({ pointerId: 1, clientX: 380, clientY: 200, button: 0 });
        canvas.listeners.pointerdown({ pointerId: 2, clientX: 420, clientY: 200, button: 0 });
        canvas.listeners.pointermove({ pointerId: 2, clientX: 500, clientY: 200 });
        expect(st.zoom.zoom).toBeGreaterThan(lines);
        expect(st.turntable.rotation.y).toBe(turned);
        canvas.listeners.pointerup({ pointerId: 2 });
        canvas.listeners.pointerup({ pointerId: 1 });
    });

    test('the buttons step in and out, out is always there, and the plinth rests while in', () => {
        const { st, tick } = studio();
        tick(30);
        st.zoomIn();
        st.zoomIn();
        st.zoomIn();
        expect(st.zoom.zoom).toBe(1);
        tick(120);
        const held = st.turntable.rotation.y;
        tick(120);
        expect(st.turntable.rotation.y).toBe(held);
        st.zoomOut();
        st.zoomOut();
        st.zoomOut();
        expect(st.zoom.zoom).toBe(0);
        tick(60);
        expect(st.turntable.rotation.y).toBeGreaterThan(held);
        // A choice frames itself, and choosing clothes takes the view out.
        st.setFrame('face');
        expect(st.framing).toBe('face');
        st.setFrame('body');
        expect(st.zoom.zoom).toBe(0);
    });

    test('+ zooms toward the tab\'s part of the figure, its first press already looking there', () => {
        const C = CONFIG.camera;
        expect(S.aimShare(0)).toBe(0);
        expect(S.aimShare(1)).toBe(1);
        expect(S.aimShare(0.3)).toBeGreaterThan(0.6);
        // One step in toward the feet already aims far nearer them than the
        // figure's middle (QA, 2026-10-24: it looked at the torso).
        const body = S.viewFor(0, C.frames.feet.center, 1, C, 0.07).aim[1];
        const one = S.viewFor(C.zoom.step, C.frames.feet.center, 1, C, 0.07).aim[1];
        const feet = C.frames.feet.center + 0.07;
        expect(Math.abs(one - feet)).toBeLessThan(0.4 * Math.abs(body - feet));
        const { st, tick } = studio();
        tick(2);
        // The tab says where + goes, and moves nothing.
        st.setZoomTarget('feet');
        expect(st.zoom.zoom).toBe(0);
        st.zoomIn();
        expect(st.zoom.focus).toBe(C.frames.feet.center);
        st.setZoomTarget('body');
        st.zoomIn();
        expect(st.zoom.focus).toBe(C.zoom.torso);
        st.setZoomTarget('face');
        st.zoomIn();
        expect(st.zoom.focus).toBe(C.frames.face.center);
        st.setZoomTarget('nowhere');
        st.zoomOut();
        st.zoomIn();
        expect(st.zoom.focus).toBe(C.frames.face.center);
    });

    test('zoomed in, an upright drag pans up and down the figure; zoomed out, the page keeps its scroll', () => {
        const { st, canvas, tick } = studio({ w: 600, h: 800 });
        canvas.style = {};
        tick(2);
        // Out: an upright drag turns nothing and pans nothing.
        canvas.listeners.pointerdown({ pointerId: 1, clientX: 300, clientY: 300, button: 0 });
        canvas.listeners.pointermove({ pointerId: 1, clientX: 300, clientY: 400 });
        canvas.listeners.pointerup({ pointerId: 1 });
        expect(st.zoom.focus).toBe(CONFIG.camera.frames.face.center);
        // In: dragging down brings what is above into view (the focus rises).
        st.zoomIn();
        st.zoomIn();
        expect(canvas.style.touchAction).toBe('none');
        tick(120);
        const before = st.zoom.focus;
        canvas.listeners.pointerdown({ pointerId: 2, clientX: 300, clientY: 300, button: 0 });
        canvas.listeners.pointermove({ pointerId: 2, clientX: 300, clientY: 200 });
        expect(st.zoom.focus).toBeLessThan(before);
        canvas.listeners.pointermove({ pointerId: 2, clientX: 300, clientY: 5000 });
        expect(st.zoom.focus).toBe(CONFIG.camera.zoom.highest);
        canvas.listeners.pointerup({ pointerId: 2 });
        // Framing the face again centers it again, undoing the pan.
        st.setFrame('face');
        expect(st.zoom).toEqual({ zoom: 1, focus: CONFIG.camera.frames.face.center });
        st.zoomOut();
        st.zoomOut();
        st.zoomOut();
        expect(canvas.style.touchAction).toBe('pan-y');
    });

    test('under reduced motion a zoom is instant', () => {
        const { st, renderer, tick } = studio({ still: true });
        tick(2);
        st.zoomIn();
        const drawn = renderer.renders;
        tick(1);
        expect(renderer.renders).toBe(drawn + 1);
        tick(30);
        expect(renderer.renders).toBe(drawn + 1);
    });

    test('nearestFront takes the short way round', () => {
        expect(S.nearestFront(0.4)).toBe(0);
        expect(S.nearestFront(5.9)).toBeCloseTo(Math.PI * 2, 9);
        expect(S.nearestFront(-3.5)).toBeCloseTo(-Math.PI * 2, 9);
    });
});

describe('the editor and the way back', () => {
    let E;
    let T;
    let CONFIG;
    let dom;

    beforeAll(async () => {
        installThree();
        dom = installDom();
        jest.resetModules();
        E = await import('../www/avatar/js/editor.js');
        T = await import('../www/avatar/js/transfer.js');
        ({ AVATAR_PAGE: CONFIG } = await import('../www/avatar/js/config.js'));
    });
    afterAll(() => dom.uninstall());

    test('every piece is offered since M5, in six tabs of two rows (Steve\'s QA, 2026-10-26)', async () => {
        const tabs = E.visibleTabs(CONFIG.tabs).map((t) => t.id);
        expect(tabs).toEqual(['face', 'eyes', 'hair', 'build', 'clothes', 'layers']);
        const fields = (id) => E.visibleFields(CONFIG.tabs.find((t) => t.id === id)).map((f) => f.key);
        // The mouth sits between the cheeks and the facial hair; facial hair
        // is on the Face tab, and the glasses' colors follow the glasses
        // (Steve's QA, 2026-10-25: the Hair tab was crowded).
        expect(fields('face')).toEqual(['skin', 'faceShape', 'nose', 'cheeks', 'mouth', 'lips', 'facial', 'facialColor']);
        expect(fields('eyes')).toEqual(['eyeShape', 'eyes', 'brows', 'glasses', 'frameColor', 'lensColor']);
        // The hat is with the hair it is fitted to.
        expect(fields('hair')).toEqual(['length', 'hair', 'hat', 'hatColor']);
        // The underlayer's tab (2026-10-26).
        expect(fields('layers')).toEqual(['legwear', 'legwearColor', 'armwear', 'armwearColor']);
        // Every field of every tab is shown somewhere, once, and every
        // field of the avatar is on a tab.
        const all = CONFIG.tabs.flatMap((t) => t.fields.map((f) => f.key));
        expect(new Set(all).size).toBe(all.length);
        const { FIELDS } = await import('../www/shared/js/avatar-1.0.0.js');
        expect([...all].sort()).toEqual(FIELDS.map(([key]) => key).sort());
        const build = CONFIG.tabs.find((t) => t.id === 'build');
        expect(E.visibleFields(build).map((f) => f.key)).toEqual(['build', 'muscles', 'handSize', 'footSize']);
        // The shoes are clothes, and still look at the feet when chosen.
        const clothes = CONFIG.tabs.find((t) => t.id === 'clothes');
        for (const key of ['shoes', 'shoeColor']) expect(clothes.fields.find((f) => f.key === key).frame).toBe('feet');
        for (const tab of CONFIG.tabs) for (const f of tab.fields) if (f.frame) expect(['shoes', 'shoeColor']).toContain(f.key);
        expect(E.optionsFor('shoes').map((o) => o.id)).toEqual(['classic', 'sneakers', 'maryJane', 'ankleBoots', 'workBoots', 'cowboyBoots', 'tallBoots',
            'sandals', 'flats', 'heels', 'platforms', 'slippers', 'crocs', 'highTops', 'hikingBoots', 'cleats']);
        expect(E.optionsFor('nope')).toEqual([]);
        // A field that needs another shows only while that one does (a hat's
        // color, with no hats to wear, would mean nothing).
        const needs = { fields: [{ key: 'nope', kind: 'text' }, { key: 'skin', kind: 'swatch', requires: 'nope' }, { key: 'eyes', kind: 'swatch', requires: 'skin' }] };
        expect(E.visibleFields(needs)).toEqual([]);
        expect(E.visibleFields({ fields: [{ key: 'skin', kind: 'swatch' }, { key: 'eyes', kind: 'swatch', requires: 'skin' }] })).toHaveLength(2);
        // A field needing one the tab does not have, or a loop, never shows.
        expect(E.visibleFields({ fields: [{ key: 'skin', kind: 'swatch', requires: 'hat' }] })).toEqual([]);
        expect(E.visibleFields({ fields: [{ key: 'skin', kind: 'swatch', requires: 'eyes' }, { key: 'eyes', kind: 'swatch', requires: 'skin' }] })).toEqual([]);
        // Every field of every tab is a real field of the avatar.
        for (const tab of CONFIG.tabs) for (const f of tab.fields) expect(['swatch', 'text', 'number']).toContain(f.kind);
        // The jersey's number and its color follow the shirt's style
        // (2026-10-26), shown only on the jersey.
        expect(fields('clothes')).toEqual(['shirt', 'sleeves', 'jerseyNumber', 'numberColor', 'bottom', 'bottomColor', 'shoes', 'shoeColor']);
        for (const key of ['jerseyNumber', 'numberColor']) expect(clothes.fields.find((f) => f.key === key).showWhen).toEqual({ field: 'sleeves', value: 'jersey' });
        expect(clothes.fields.find((f) => f.key === 'jerseyNumber').kind).toBe('number');
    });

    test('bare legs are offered only while a one-piece is worn, and the layers\' colors step aside with no layer (2026-10-26)', () => {
        const tablist = document.createElement('div');
        const panels = document.createElement('div');
        const ed = E.createEditor({ tablist, panels, tabs: CONFIG.tabs, avatar: { sleeves: 'short', bottom: 'pants', legwear: 'none', armwear: 'none' } });
        const bare = ed.inputs.bottom.find((i) => i.value === 'bare');
        const option = bare.parentNode;
        expect(option.tagName).toBe('LABEL');
        expect(option.hidden).toBe(true);
        for (const other of ed.inputs.bottom) if (other !== bare) expect(other.parentNode.hidden).toBe(false);
        ed.set({ sleeves: 'leotard', bottom: 'pants', legwear: 'none', armwear: 'none' });
        expect(option.hidden).toBe(false);
        ed.set({ sleeves: 'bodysuit', bottom: 'bare', legwear: 'none', armwear: 'none' });
        expect(option.hidden).toBe(false);
        expect(bare.checked).toBe(true);
        // Back to a shirt: the option steps aside, the choice stays (the
        // figure wears shorts meanwhile, avatar-1.0.0's wornBottom).
        ed.set({ sleeves: 'short', bottom: 'bare', legwear: 'none', armwear: 'none' });
        expect(option.hidden).toBe(true);
        expect(bare.checked).toBe(true);
        const groupOf = (key) => ed.customs[key].parentNode.parentNode;
        expect(groupOf('legwearColor').hidden).toBe(true);
        expect(groupOf('armwearColor').hidden).toBe(true);
        ed.set({ sleeves: 'short', bottom: 'shorts', legwear: 'fishnets', armwear: 'none' });
        expect(groupOf('legwearColor').hidden).toBe(false);
        expect(groupOf('armwearColor').hidden).toBe(true);
    });

    test('a jersey number is typed: two digits at most, kept as the list\'s id, shown only on the jersey (2026-10-26)', () => {
        expect(E.numberId('jerseyNumber', '8')).toBe('n8');
        expect(E.numberId('jerseyNumber', '08')).toBe('n8');
        expect(E.numberId('jerseyNumber', '00')).toBe('n00');
        expect(E.numberId('jerseyNumber', '99')).toBe('n99');
        expect(E.numberId('jerseyNumber', '123')).toBe('n12');
        expect(E.numberId('jerseyNumber', ' 4 ')).toBe('n4');
        expect(E.numberId('jerseyNumber', 'ab')).toBe('none');
        expect(E.numberId('jerseyNumber', '')).toBe('none');
        expect(E.numberId('jerseyNumber', null)).toBe('none');
        expect(E.numberId('nope', '8')).toBe('none');
        expect(E.numberText('jerseyNumber', 'n8')).toBe('8');
        expect(E.numberText('jerseyNumber', 'n00')).toBe('00');
        expect(E.numberText('jerseyNumber', 'none')).toBe('');
        expect(E.numberText('jerseyNumber', 'garbage')).toBe('');

        const tablist = document.createElement('div');
        const panels = document.createElement('div');
        const changes = [];
        const ed = E.createEditor({ tablist, panels, tabs: CONFIG.tabs, avatar: { sleeves: 'short', jerseyNumber: 'none' }, onChange: (k, id) => changes.push([k, id]) });
        const box = ed.numbers.jerseyNumber;
        expect(Object.keys(ed.numbers)).toEqual(['jerseyNumber']);
        expect(box.getAttribute('aria-label')).toBe('Jersey number');
        expect(box.inputMode).toBe('numeric');
        expect(box.maxLength).toBe(2);
        expect(box.value).toBe('');
        // Off the jersey, the number and its color step aside.
        const groupOf = (el) => el.parentNode.parentNode;
        expect(groupOf(box).tagName).toBe('FIELDSET');
        expect(groupOf(box).hidden).toBe(true);
        expect(groupOf(ed.customs.numberColor).hidden).toBe(true);
        ed.set({ sleeves: 'jersey', jerseyNumber: 'none' });
        expect(groupOf(box).hidden).toBe(false);
        expect(groupOf(ed.customs.numberColor).hidden).toBe(false);
        // Typed: each keystroke dresses the figure; letters never reach it.
        box.value = '8';
        fire(box, 'input');
        expect(changes).toEqual([['jerseyNumber', 'n8']]);
        box.value = '8x';
        fire(box, 'input');
        expect(box.value).toBe('8');
        expect(changes).toHaveLength(1);
        box.value = '00';
        fire(box, 'change');
        expect(changes[1]).toEqual(['jerseyNumber', 'n00']);
        // Cleared is none, and set() shows the avatar's number.
        box.value = '';
        fire(box, 'input');
        expect(changes[2]).toEqual(['jerseyNumber', 'none']);
        ed.set({ sleeves: 'jersey', jerseyNumber: 'n12' });
        expect(box.value).toBe('12');
        ed.set({ sleeves: 'jersey', jerseyNumber: 'none' });
        expect(box.value).toBe('');
    });

    test('swatches carry their color, and the tab row\'s keys wrap', () => {
        expect(E.swatchHex(0x9c2b25)).toBe('#9c2b25');
        expect(E.swatchHex(0x1a)).toBe('#00001a');
        expect(E.tabKey('ArrowRight', 4, 5)).toBe(0);
        expect(E.tabKey('ArrowLeft', 0, 5)).toBe(4);
        expect(E.tabKey('Home', 3, 5)).toBe(0);
        expect(E.tabKey('End', 0, 5)).toBe(4);
        expect(E.tabKey('Enter', 0, 5)).toBeNull();
    });

    test('the editor builds real radio groups, says what changed, and moves between tabs', () => {
        const tablist = document.createElement('div');
        const panels = document.createElement('div');
        const changes = [];
        const tabsSeen = [];
        const ed = E.createEditor({
            tablist, panels, tabs: CONFIG.tabs, avatar: { skin: 'fair', eyes: 'darkBrown' },
            onChange: (k, id) => changes.push([k, id]), onTab: (t) => tabsSeen.push(t.id)
        });
        expect(tablist.children.map((b) => b.textContent)).toEqual(['Face', 'Eyes', 'Hair', 'Build', 'Clothes', 'Layers']);
        // The first tab is shown quietly: the page opens on the whole figure.
        expect(ed.selected).toBe('face');
        expect(tabsSeen).toEqual([]);
        expect(tablist.children[0].getAttribute('aria-selected')).toBe('true');
        expect(panels.children[1].hidden).toBe(true);
        expect(ed.inputs.skin).toHaveLength(6);
        // Natural lips have no color of their own, so their swatch shows a
        // natural rose instead of black.
        const natural = ed.inputs.lips.find((i) => i.value === 'natural').parentNode.children[1];
        expect(natural.style.getPropertyValue('--swatch')).toBe(E.swatchHex(0xbe7d6f));
        expect(ed.inputs.skin.find((i) => i.checked).value).toBe('fair');
        const deep = ed.inputs.skin.find((i) => i.value === 'deep');
        deep.checked = true;
        fire(deep, 'change');
        expect(changes).toEqual([['skin', 'deep']]);
        // A radio unchecked by its neighbor says nothing.
        const fair = ed.inputs.skin.find((i) => i.value === 'fair');
        fair.checked = false;
        fire(fair, 'change');
        expect(changes).toHaveLength(1);
        // Arrow keys on the row choose, and tell the page.
        const e = fire(tablist, 'keydown', { key: 'ArrowRight' });
        expect(e.defaultPrevented).toBe(true);
        expect(ed.selected).toBe('eyes');
        expect(tabsSeen).toEqual(['eyes']);
        expect(tablist.children[1].tabIndex).toBe(0);
        expect(tablist.children[0].tabIndex).toBe(-1);
        fire(tablist, 'keydown', { key: 'a' });
        expect(ed.selected).toBe('eyes');
        tablist.children[4].click();
        expect(ed.selected).toBe('clothes');
        expect(ed.select('nowhere')).toBe(false);
        expect(ed.select('layers')).toBe(true);
        expect(tabsSeen[tabsSeen.length - 1]).toBe('layers');
        ed.set({ skin: 'tan' });
        expect(ed.inputs.skin.find((i) => i.checked).value).toBe('tan');
        expect(ed.labelOf('skin', 'tan')).toBe('Tan');
        expect(ed.labelOf('skin', 'x')).toBe('');
        expect(ed.labelOf('nope', 'x')).toBe('');
    });

    test('every color choice ends in a custom swatch: any color, sent once a frame while it is dragged', () => {
        const tablist = document.createElement('div');
        const panels = document.createElement('div');
        const changes = [];
        const ed = E.createEditor({ tablist, panels, tabs: CONFIG.tabs, avatar: { hair: 'blond', facial: 'none', hat: 'none' }, onChange: (k, id) => changes.push([k, id]) });
        // One for each color field the page shows, and none for the rest.
        expect(Object.keys(ed.customs).sort()).toEqual(['armwearColor', 'bottomColor', 'eyes', 'facialColor', 'frameColor', 'hair', 'hatColor', 'legwearColor', 'lensColor', 'lips', 'numberColor', 'shirt', 'shoeColor', 'skin']);
        const hair = ed.customs.hair;
        expect(hair.type).toBe('color');
        expect(hair.getAttribute('aria-label')).toBe('Custom color');
        expect(ed.customs.facialColor.getAttribute('aria-label')).toBe('Custom facial hair color');
        // It opens on the color shown: blond.
        expect(hair.value).toBe(E.swatchHex(0xd9b46a));
        expect(hair.classList.contains('is-chosen')).toBe(false);
        // Dragged: three moves in a frame are one change, the last.
        const frames = dom.loops.length;
        for (const v of ['#110000', '#220000', '#11aa33']) {
            hair.value = v;
            fire(hair, 'input');
        }
        expect(changes).toEqual([]);
        dom.loops.slice(frames).forEach((cb) => cb());
        expect(changes).toEqual([['hair', 'x11aa33']]);
        // Let go: the final color, at once.
        hair.value = '#00ff00';
        fire(hair, 'change');
        expect(changes[changes.length - 1]).toEqual(['hair', 'x00ff00']);
        // A custom color is shown as chosen, and no swatch is.
        ed.set({ hair: 'x00ff00', facial: 'none', hat: 'none' });
        expect(hair.classList.contains('is-chosen')).toBe(true);
        expect(hair.value).toBe('#00ff00');
        expect(ed.inputs.hair.some((i) => i.checked)).toBe(false);
        ed.set({ hair: 'pink', facial: 'none', hat: 'none', facialColor: 'match' });
        expect(hair.classList.contains('is-chosen')).toBe(false);
        expect(ed.inputs.hair.find((i) => i.checked).value).toBe('pink');
        // "Same as hair" shows its own swatch, not black.
        expect(ed.customs.facialColor.value).toBe(E.swatchHex(0x8a7a6a));
    });

    test('a beard\'s color and a hat\'s step aside while there is no beard and no hat', () => {
        const tablist = document.createElement('div');
        const panels = document.createElement('div');
        const ed = E.createEditor({ tablist, panels, tabs: CONFIG.tabs, avatar: { facial: 'none', hat: 'none' } });
        const groupOf = (key) => ed.customs[key].parentNode.parentNode;
        expect(groupOf('facialColor').tagName).toBe('FIELDSET');
        expect(groupOf('facialColor').hidden).toBe(true);
        expect(groupOf('hatColor').hidden).toBe(true);
        expect(groupOf('hair').hidden).toBe(false);
        ed.set({ facial: 'beard', hat: 'none' });
        expect(groupOf('facialColor').hidden).toBe(false);
        expect(groupOf('hatColor').hidden).toBe(true);
        ed.set({ facial: 'beard', hat: 'cap' });
        expect(groupOf('hatColor').hidden).toBe(false);
    });

    test('the way back is the home page or a scene of the site\'s, written exactly, and nothing else', () => {
        expect(T.returnTarget('?return=/leaves/')).toEqual({ path: '/leaves/', name: 'Leaf Blower' });
        expect(T.returnTarget('?return=%2Fxo%2F')).toEqual({ path: '/xo/', name: "X's and O's" });
        expect(T.returnTarget('?return=/')).toEqual({ path: '/', name: 'SceneXP' });
        for (const bad of ['', '?x=1', '?return=', '?return=https://evil.example/', '?return=//evil.example/',
            '?return=/leaves', '?return=leaves', '?return=/leaves/../', '?return=/nowhere/', '?return=javascript:alert(1)',
            '?return=/LEAVES/', null, undefined]) {
            expect(T.returnTarget(bad)).toBeNull();
        }
    });

    test('a file is read only when it is small, and only an avatar file is an avatar', async () => {
        const { toFile } = await import('../www/shared/js/avatar-1.0.0.min.js');
        const file = (text, size = text.length) => ({ size, text: async () => text });
        expect(await T.readAvatarFile(null)).toEqual({ error: 'none' });
        expect(await T.readAvatarFile(file('x', 5000))).toEqual({ error: 'large' });
        expect(await T.readAvatarFile({ size: NaN, text: async () => '' })).toEqual({ error: 'large' });
        expect(await T.readAvatarFile({ size: 10, text: async () => { throw new Error('no'); } })).toEqual({ error: 'unreadable' });
        expect(await T.readAvatarFile(file('{"hello": 1}'))).toEqual({ error: 'not-avatar' });
        const ok = await T.readAvatarFile(file(toFile({ skin: 'deep' })));
        expect(ok.avatar.skin).toBe('deep');
        for (const key of Object.keys(T.FILE_ERRORS)) {
            expect(T.FILE_ERRORS[key]).not.toMatch(/[;—]/);
        }
    });
});

describe('the page', () => {
    let dom;

    afterEach(() => {
        jest.useRealTimers();
        if (dom) dom.uninstall();
        dom = null;
    });

    async function boot({ hash = '', search = '', hostname = 'localhost', saved = null } = {}) {
        installThree();
        dom = installDom();
        Object.assign(dom.windowStub.location, { hash, search, hostname });
        if (saved) globalThis.localStorage.setItem('scenexp-avatar', JSON.stringify(saved));
        jest.resetModules();
        const main = await import('../www/avatar/js/main.js');
        await flushAsync(30);
        return main;
    }

    test('the tabs sit in rows of three (six tabs since 2026-10-26), every one in sight, with no hidden scroll', () => {
        const css = readFileSync('www/avatar/css/avatar.css', 'utf8');
        const rule = css.match(/\n\.av-tabs \{([^}]*)\}/)[1];
        expect(rule).toMatch(/display:\s*grid/);
        expect(rule).toMatch(/grid-template-columns:\s*repeat\(3,/);
        const config = readFileSync('www/avatar/js/config.js', 'utf8');
        expect((config.match(/^\s+id: '[a-z]+', label: '[A-Za-z]+', frame:/gm) || []).length % 3).toBe(0);
        expect(rule).not.toMatch(/overflow/);
        expect(css).not.toMatch(/\.av-tabs::-webkit-scrollbar/);
    });

    test('every id the page looks up is in its markup, once', () => {
        const ids = [...MAIN.matchAll(/\$\('([\w-]+)'\)/g)].map((m) => m[1]);
        expect(ids.length).toBeGreaterThan(20);
        for (const id of new Set(ids)) {
            const count = HTML.split(`id="${id}"`).length - 1;
            expect(`${id}: ${count}`).toBe(`${id}: 1`);
        }
        expect(MAIN).toMatch(/document\.getElementById\('avatar-app'\)/);
        expect(HTML).toContain('id="avatar-app"');
    });

    test('it boots: the page shown, the editor built, the studio started, nothing saved', async () => {
        const main = await boot();
        const { state } = main.__test__;
        expect(dom.el('avatar-app').hidden).toBe(false);
        expect(state.editor.tabs.length).toBe(6);
        expect(state.studio).toBeTruthy();
        expect(dom.loops.length).toBeGreaterThan(0);
        expect(dom.el('av-stage-status').hidden).toBe(true);
        // It opens on the whole figure, though the Face tab is selected.
        expect(state.editor.selected).toBe('face');
        expect(state.studio.framing).toBe('body');
        expect(state.studio.zoom.zoom).toBe(0);
        expect(state.saved).toBeNull();
        expect(dom.el('av-forget').hidden).toBe(true);
        expect(dom.el('av-unsaved').textContent).toBe('');
        expect(dom.el('av-canvas').getAttribute('aria-label')).toMatch(/^A figure with fair skin/);
        // No way back without a scene to go back to (the markup's link is
        // left as it ships, hidden), and no lab without ?lab=1.
        expect(dom.el('av-return').textContent).toBe('');
        expect(dom.el('av-lab').hidden).toBe(true);
    });

    test('Save a file offers scenexp-avatar.json holding what is on screen, and lets the address go', async () => {
        const main = await boot();
        jest.useFakeTimers();
        const blobs = [];
        const made = jest.spyOn(URL, 'createObjectURL').mockImplementation((b) => { blobs.push(b); return 'blob:avatar'; });
        const revoked = jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
        const links = [];
        const create = document.createElement;
        document.createElement = (tag) => {
            const el = create(tag);
            if (tag === 'a') links.push(el);
            return el;
        };
        main.__test__.state.current = { ...main.__test__.state.current, skin: 'deep' };
        dom.el('av-file-save').click();
        expect(links[0].download).toBe('scenexp-avatar.json');
        expect(links[0].href).toBe('blob:avatar');
        expect(JSON.parse(await blobs[0].text()).avatar.skin).toBe('deep');
        expect(dom.el('av-status').textContent).toBe(main.WORDS.fileSaved);
        jest.advanceTimersByTime(10000);
        expect(revoked).toHaveBeenCalledWith('blob:avatar');
        made.mockRestore();
        revoked.mockRestore();
        document.createElement = create;
    });

    test('a choice changes the figure only, and Save keeps it, says so, and offers Forget', async () => {
        const main = await boot({ search: '?return=/leaves/' });
        const { state } = main.__test__;
        expect(dom.el('av-return').hidden).toBe(false);
        expect(dom.el('av-return').textContent).toBe('Back to Leaf Blower');
        expect(dom.el('av-return').href).toBe('/leaves/');
        const teal = state.editor.inputs.shirt.find((i) => i.value === 'teal');
        teal.checked = true;
        fire(teal, 'change');
        expect(state.current.shirt).toBe('teal');
        expect(globalThis.localStorage.getItem('scenexp-avatar')).toBeNull();
        expect(dom.el('av-unsaved').textContent).toBe(main.WORDS.unsaved);
        // The camera went to the clothes.
        expect(state.studio.framing).toBe('body');
        // A tab frames its part (Steve's QA, 2026-10-24): the face's tabs
        // the face, the feet's the feet, the clothes' the whole figure.
        // (The real buttons from the tab row: the stub invents any id asked
        // for, and clicking an invented one would prove nothing.)
        const tab = (id) => dom.el('av-tabs').children.find((b) => b.id === `av-tab-${id}`);
        for (const [id, framing] of [['hair', 'face'], ['clothes', 'body'], ['eyes', 'face'], ['layers', 'body'], ['build', 'body'], ['face', 'face']]) {
            expect(tab(id)).toBeTruthy();
            tab(id).click();
            expect(`${id}: ${state.studio.framing}`).toBe(`${id}: ${framing}`);
        }
        // A shoe, chosen from the Clothes tab, still looks at the feet
        // (2026-10-26: the Shoes tab became part of Clothes).
        tab('clothes').click();
        expect(state.studio.framing).toBe('body');
        const boots = state.editor.inputs.shoes.find((i) => i.value === 'workBoots');
        boots.checked = true;
        fire(boots, 'change');
        expect(state.current.shoes).toBe('workBoots');
        expect(state.studio.framing).toBe('feet');
        // The zoom buttons are wired: out by hand from the feet, and + back
        // in toward the tab's part (the torso, from Clothes).
        dom.el('av-zoom-out').click();
        dom.el('av-zoom-out').click();
        dom.el('av-zoom-out').click();
        expect(state.studio.zoom.zoom).toBe(0);
        dom.el('av-zoom-in').click();
        expect(state.studio.zoom.zoom).toBeGreaterThan(0);
        const { AVATAR_PAGE } = await import('../www/avatar/js/config.min.js');
        expect(state.studio.zoom.focus).toBe(AVATAR_PAGE.camera.zoom.torso);
        dom.el('av-save').click();
        expect(JSON.parse(globalThis.localStorage.getItem('scenexp-avatar')).shirt).toBe('teal');
        expect(dom.el('av-status').textContent).toBe(main.WORDS.savedFor('Leaf Blower'));
        expect(dom.el('av-forget').hidden).toBe(false);
        expect(dom.el('av-unsaved').textContent).toBe('');
        expect(dom.el('av-return').classList.contains('av-return-ready')).toBe(true);
        // A change after the save is a change to save.
        const blue = state.editor.inputs.eyes.find((i) => i.value === 'blue');
        blue.checked = true;
        fire(blue, 'change');
        expect(state.studio.framing).toBe('face');
        expect(dom.el('av-unsaved').textContent).toBe(main.WORDS.changed);
        expect(dom.el('av-return').classList.contains('av-return-ready')).toBe(false);
    });

    test('Forget asks once, then clears the avatar and shows the usual figure', async () => {
        const main = await boot({ saved: { skin: 'deep' } });
        const { state } = main.__test__;
        expect(state.current.skin).toBe('deep');
        dom.el('av-forget').click();
        expect(dom.el('av-forget-confirm').hidden).toBe(false);
        expect(dom.el('av-forget-no').focused).toBe(true);
        dom.el('av-forget-no').click();
        expect(dom.el('av-forget-confirm').hidden).toBe(true);
        expect(globalThis.localStorage.getItem('scenexp-avatar')).not.toBeNull();
        dom.el('av-forget').click();
        dom.el('av-forget-yes').click();
        expect(globalThis.localStorage.getItem('scenexp-avatar')).toBeNull();
        expect(state.saved).toBeNull();
        expect(state.current.skin).toBe('fair');
        expect(dom.el('av-status').textContent).toBe(main.WORDS.forgotten);
    });

    test('a link\'s avatar is shown and asked about, taken out of the address, and kept only on Keep', async () => {
        let replaced = null;
        const main = await (async () => {
            installThree();
            dom = installDom();
            Object.assign(dom.windowStub.location, { hash: '#a=1.deep.blue', search: '', pathname: '/avatar/' });
            dom.windowStub.history.replaceState = (s, t, url) => { replaced = url; };
            globalThis.localStorage.setItem('scenexp-avatar', JSON.stringify({ skin: 'tan' }));
            jest.resetModules();
            const m = await import('../www/avatar/js/main.js');
            await flushAsync(30);
            return m;
        })();
        const { state } = main.__test__;
        expect(replaced).toBe('/avatar/');
        expect(state.current).toMatchObject({ skin: 'deep', eyes: 'blue' });
        expect(dom.el('av-incoming').hidden).toBe(false);
        expect(dom.el('av-incoming-text').textContent).toBe(main.WORDS.fromLink);
        expect(dom.el('av-incoming-replaces').hidden).toBe(false);
        expect(dom.el('av-editor').inert).toBe(true);
        expect(dom.el('av-keep').focused).toBe(true);
        // Nothing kept yet.
        expect(JSON.parse(globalThis.localStorage.getItem('scenexp-avatar')).skin).toBe('tan');
        dom.el('av-decline').click();
        expect(state.current.skin).toBe('tan');
        expect(dom.el('av-incoming').hidden).toBe(true);
        expect(dom.el('av-editor').inert).toBe(false);
        expect(dom.el('av-status').textContent).toBe(main.WORDS.declined);
        // Another link, kept this time.
        dom.windowStub.location.hash = '#a=1.brown';
        fire(dom.windowStub, 'hashchange');
        expect(state.current.skin).toBe('brown');
        dom.el('av-keep').click();
        expect(JSON.parse(globalThis.localStorage.getItem('scenexp-avatar')).skin).toBe('brown');
        expect(dom.el('av-status').textContent).toBe(main.WORDS.kept);
        // Answering twice does nothing.
        expect(main.__test__.keep()).toBe(false);
        expect(main.__test__.decline()).toBe(false);
    });

    test('a file is asked about the same way, and a wrong file is turned away politely', async () => {
        const main = await boot();
        const { toFile } = await import('../www/shared/js/avatar-1.0.0.min.js');
        const file = (text) => ({ size: text.length, text: async () => text });
        expect(await main.__test__.openFile(file('nope'))).toBe(false);
        expect(dom.el('av-status').textContent).toMatch(/doesn't hold a SceneXP avatar/);
        expect(await main.__test__.openFile(null)).toBe(false);
        expect(await main.__test__.openFile(file(toFile({ hair: 'gray' })))).toBe(true);
        expect(dom.el('av-incoming-text').textContent).toBe(main.WORDS.fromFile);
        expect(dom.el('av-incoming-replaces').hidden).toBe(true);
        expect(main.__test__.state.current.hair).toBe('gray');
    });

    test('a browser that refuses storage is told why Save did not keep it', async () => {
        const main = await boot();
        globalThis.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
        expect(main.__test__.save()).toBe(false);
        expect(dom.el('av-status').textContent).toBe(main.WORDS.saveFailed);
    });

    test('the lab is only on a local server with ?lab=1', async () => {
        let main = await boot({ search: '?lab=1', hostname: 'www.scenexp.com' });
        expect(dom.el('av-lab').hidden).toBe(true);
        dom.uninstall();
        main = await boot({ search: '?lab=1', hostname: 'localhost' });
        expect(dom.el('av-lab').hidden).toBe(false);
        // The stub's renderer has no canvas to draw a portrait in.
        expect(main.__test__.saveDefaultPortrait()).toBe(false);
    });

    test('without WebGL 2 the choices still work, and the studio says why it is empty', async () => {
        installThree();
        dom = installDom();
        delete dom.windowStub.WebGL2RenderingContext;
        jest.resetModules();
        const main = await import('../www/avatar/js/main.js');
        await flushAsync(30);
        expect(main.__test__.state.studio).toBeNull();
        expect(dom.el('av-stage-status').textContent).toBe(main.WORDS.noStudio);
        expect(dom.el('av-turn').hidden).toBe(true);
        expect(main.__test__.save()).toBe(true);
        expect(main.__test__.refreshPortrait()).toBe(false);
    });

    test('every word the page says keeps the house style', async () => {
        const main = await boot();
        const words = Object.values(main.WORDS).map((w) => (typeof w === 'function' ? w('Leaf Blower') : w));
        for (const w of words) {
            expect(w).not.toMatch(/[;—]/);
            expect(w).not.toMatch(/\b(colour|grey|centre|favourite)/i);
        }
        expect(main.frameOf('eyes')).toBe('face');
        expect(main.frameOf('shoes')).toBe('feet');
        expect(main.frameOf('shoeColor')).toBe('feet');
        expect(main.frameOf('bottom')).toBe('body');
        expect(main.frameOf('hat')).toBe('face');
        expect(main.frameOf('nope')).toBe('body');
    });

    test('Surprise me rolls a random look onto the plinth and into the radios, framed whole, and keeps nothing (2026-10-26)', async () => {
        const main = await boot({ saved: { skin: 'deep', hat: 'cap' } });
        const { state } = main.__test__;
        const { sameAvatar, normalizeAvatar, FIELDS } = await import('../www/shared/js/avatar-1.0.0.js');
        // Its own line above the tabs, outlined, so Save stays the one
        // filled button (the stub invents elements, so the markup is read).
        expect(HTML).toMatch(/<button id="av-random" class="av-secondary av-random" type="button"[^>]*>Surprise me<\/button>\s*<\/div>\s*<div id="av-tabs"/);
        // A seeded roll, so the look is the same each run.
        let t = 7;
        const seeded = () => {
            t = (t * 1103515245 + 12345) % 2147483648;
            return t / 2147483648;
        };
        const real = Math.random;
        Math.random = seeded;
        try {
            dom.el('av-random').click();
        } finally {
            Math.random = real;
        }
        expect(sameAvatar(state.current, { skin: 'deep', hat: 'cap' })).toBe(false);
        expect(normalizeAvatar(state.current)).toEqual(state.current);
        // The radios follow it, the canvas says it, the camera shows all of it.
        for (const [key] of FIELDS) {
            const checked = (state.editor.inputs[key] || []).find((i) => i.checked);
            if (checked) expect(`${key}: ${checked.value}`).toBe(`${key}: ${state.current[key]}`);
        }
        expect(dom.el('av-canvas').getAttribute('aria-label')).toMatch(/^A figure with /);
        expect(state.studio.framing).toBe('body');
        expect(dom.el('av-status').textContent).toBe(main.WORDS.surprised);
        // Nothing kept: the saved avatar is as it was, and the note says so.
        expect(JSON.parse(globalThis.localStorage.getItem('scenexp-avatar'))).toMatchObject({ skin: 'deep', hat: 'cap' });
        expect(state.saved.skin).toBe('deep');
        expect(dom.el('av-unsaved').textContent).toBe(main.WORDS.changed);
        // Another press is another look.
        const first = { ...state.current };
        main.__test__.surprise();
        expect(sameAvatar(first, state.current)).toBe(false);
        // Save keeps the look on screen, as any other.
        dom.el('av-save').click();
        expect(sameAvatar(JSON.parse(globalThis.localStorage.getItem('scenexp-avatar')), state.current)).toBe(true);
    });
});
