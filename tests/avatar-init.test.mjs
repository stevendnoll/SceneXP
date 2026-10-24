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
            const head = st.figure.person.children.find((o) => o.userData.isHead);
            const hair = st.figure.person.children.find((o) => o.userData.isHair);
            inside('face', new THREE.Box3().setFromObject(head).union(new THREE.Box3().setFromObject(hair)));
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

    test('every piece is offered since M5, and the tab order is the PRD\'s', () => {
        const tabs = E.visibleTabs(CONFIG.tabs).map((t) => t.id);
        expect(tabs).toEqual(['face', 'hair', 'build', 'clothes', 'feet', 'hat']);
        const face = CONFIG.tabs.find((t) => t.id === 'face');
        expect(E.visibleFields(face).map((f) => f.key)).toEqual(['skin', 'eyes', 'facial', 'glasses']);
        const hat = CONFIG.tabs.find((t) => t.id === 'hat');
        expect(E.visibleFields(hat).map((f) => f.key)).toEqual(['hat', 'hatColor']);
        expect(E.optionsFor('shoes').map((o) => o.id)).toEqual(['classic', 'sneakers', 'maryJane']);
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
        for (const tab of CONFIG.tabs) for (const f of tab.fields) expect(['swatch', 'text']).toContain(f.kind);
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
        expect(tablist.children.map((b) => b.textContent)).toEqual(['Face', 'Hair', 'Build', 'Clothes', 'Feet', 'Hat']);
        // The first tab is shown quietly: the page opens on the whole figure.
        expect(ed.selected).toBe('face');
        expect(tabsSeen).toEqual([]);
        expect(tablist.children[0].getAttribute('aria-selected')).toBe('true');
        expect(panels.children[1].hidden).toBe(true);
        expect(ed.inputs.skin).toHaveLength(6);
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
        expect(ed.selected).toBe('hair');
        expect(tabsSeen).toEqual(['hair']);
        expect(tablist.children[1].tabIndex).toBe(0);
        expect(tablist.children[0].tabIndex).toBe(-1);
        fire(tablist, 'keydown', { key: 'a' });
        expect(ed.selected).toBe('hair');
        tablist.children[4].click();
        expect(ed.selected).toBe('feet');
        expect(ed.select('nowhere')).toBe(false);
        expect(ed.select('hat')).toBe(true);
        expect(tabsSeen[tabsSeen.length - 1]).toBe('hat');
        ed.set({ skin: 'tan' });
        expect(ed.inputs.skin.find((i) => i.checked).value).toBe('tan');
        expect(ed.labelOf('skin', 'tan')).toBe('Tan');
        expect(ed.labelOf('skin', 'x')).toBe('');
        expect(ed.labelOf('nope', 'x')).toBe('');
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
        expect(main.frameOf('nope')).toBe('body');
    });
});
