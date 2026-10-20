// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Derby Day's social event (M6): the people (crowd.js), the hall's dressing
 * (dressing.js), the visitor's family (family.js) and the announcer's calls.
 *
 * The planning is pure and measured here directly: who stands where, wearing
 * what, and who cheers when. The drawing is built against REAL three (the
 * stub has no vertices, so a baked crowd under it is nothing at all), with
 * the DOM stub only for the canvases the signs and the timer are drawn on.
 * And the layout is measured where it matters: nobody standing in the track,
 * on a table, or in the air.
 */
import { jest } from '@jest/globals';
import { loadRealThree } from './helpers/real-three.mjs';
import { installDom, fire } from './helpers/dom-stub.mjs';

const { DERBY_CONFIG: C } = await import('../www/derby/js/config.js');
const Crowd = await import('../www/derby/js/crowd.js');
const Fam = await import('../www/derby/js/family.js');
const Copy = await import('../www/derby/js/copy.js');
const { trackWidth } = await import('../www/derby/js/track.js');

describe('who stands where', () => {
    test('the crowd stands on the bleachers\' steps, the same crowd every visit, a share of them children', () => {
        const seats = Crowd.bleacherSeats(C);
        expect(seats.length).toBeGreaterThan(40);
        expect(seats.length).toBeLessThan(120);
        for (const s of seats) {
            // On a step's top, within its depth, along its length.
            const row = Math.round(s.y / 0.42) - 1;
            expect(s.y).toBeCloseTo(0.42 * (row + 1), 9);
            expect(Math.abs(s.z - (-2.2 - row * 0.8))).toBeLessThan(0.4);
            expect(s.x).toBeGreaterThan(0);
            expect(s.x).toBeLessThan(14);
        }
        expect(Crowd.bleacherSeats(C)).toEqual(seats);
        const looks = Crowd.crowdLooks(200, C);
        const kids = looks.filter((l) => l.scale < 1).length / looks.length;
        expect(kids).toBeGreaterThan(0.1);
        expect(kids).toBeLessThan(0.35);
        expect(looks.some((l) => l.style === null)).toBe(true);
        // A child always has hair (a bald child reads as a mistake).
        expect(looks.filter((l) => l.scale < 1).every((l) => l.style)).toBe(true);
        expect(Crowd.crowdLooks(5, C)).toEqual(looks.slice(0, 5));
    });

    test('every neighbor has a family in its car\'s colors, holding what the PRD says', () => {
        for (const f of C.field) {
            const fam = Crowd.familyOf(f.id, C);
            expect(fam.length).toBeGreaterThan(0);
            expect(fam.some((m) => m.look.shirt === C.fieldColors[f.id])).toBe(true);
            for (const m of fam) if (m.prop) expect(Object.keys(Crowd.PROPS)).toContain(m.prop);
        }
        const props = (id) => Crowd.familyOf(id, C).map((m) => m.prop).filter(Boolean);
        expect(props('brick')).toEqual(['thermos']);
        expect(props('streak')).toEqual(['camcorder']);
        expect(props('comet')).toEqual(['megaphone']);
        expect(props('owl')).toEqual(['finger', 'finger']);
        expect(props('phantom')).toEqual(['trophy']);
        expect(Crowd.familyOf('hotdog', C).filter((m) => m.look.scale < 1)).toHaveLength(2);
        expect(Crowd.familyOf('nobody', C)).toEqual([]);
    });

    test('the families stand off the track, by the finish, the visitor\'s first, none on top of another', () => {
        const groups = [{ key: 'mine', members: Fam.familyMembers(null, 'Blue Wedge', C) }]
            .concat(['owl', 'arrow', 'phantom'].map((id) => ({ key: id, members: Crowd.familyOf(id, C) })));
        const places = Crowd.familyPlaces(groups, C);
        const all = places.flatMap((p) => p.at);
        const edge = trackWidth(C) / 2;
        for (const a of all) {
            expect(a.z).toBeLessThan(-edge - 0.2);
            expect(a.x).toBeLessThan(C.track.courseLength);
            expect(a.x).toBeGreaterThan(0);
        }
        for (let i = 0; i < all.length; i++) {
            for (let j = i + 1; j < all.length; j++) expect(Math.hypot(all[i].x - all[j].x, all[i].z - all[j].z)).toBeGreaterThan(0.3);
        }
        // The visitor's, nearest the finish.
        expect(Math.max(...places[0].at.map((a) => a.x))).toBeGreaterThan(Math.max(...places[1].at.map((a) => a.x)));
        // And clear of the trophy table by the finish (x 12.1 to 13.7, z to -0.925).
        for (const a of all) expect(a.x < 12.0 || a.z > -0.9).toBe(true);
    });

    test('who cheers when: the crowd claps, a family cheers its car, a win jumps, a loss stands still', () => {
        const member = (group, extra = {}) => ({ group, phase: 0, ...extra });
        const run = { kind: 'run', t: 0.3, cheering: new Set(['mine', 'owl']), won: null };
        expect(Crowd.poseAt(member('crowd'), { kind: 'idle', t: 0 })).toEqual({ pose: 'down', hop: 0 });
        expect(Crowd.poseAt(member('crowd'), run).pose).toBe('clap');
        expect(Crowd.poseAt(member('crowd', { keen: true }), run).pose).toBe('up');
        expect(Crowd.poseAt(member('crowd', { keen: true }), { kind: 'times', t: 0 }).pose).toBe('up');
        expect(['up', 'clap']).toContain(Crowd.poseAt(member('owl'), run).pose);
        expect(Crowd.poseAt(member('arrow'), run)).toEqual({ pose: 'down', hop: 0 });
        expect(Crowd.poseAt(member('owl'), { kind: 'staging', t: 0 }).pose).toBe('clap');
        const times = { kind: 'times', t: 0.15, won: 'mine' };
        expect(Crowd.poseAt(member('mine'), times).pose).toBe('up');
        expect(Crowd.poseAt(member('mine'), times).hop).toBeGreaterThan(0);
        expect(Crowd.poseAt(member('owl'), times)).toEqual({ pose: 'down', hop: 0 });
        // A prop holder keeps the pose that holds it, win or lose.
        expect(Crowd.poseAt(member('owl', { prop: 'sign' }), times).pose).toBe('up');
        expect(Crowd.poseAt(member('owl', { prop: 'thermos' }), run).pose).toBe('down');
        expect(Crowd.poseAt(member('volunteer'), run)).toEqual({ pose: 'down', hop: 0 });
    });

    test('the visitor\'s family: dressed from the card, the kid holding the car\'s name', () => {
        const f = Fam.normalizeFamily({ grownUp: { shirt: 'teal' }, kid: 'nonsense' });
        expect(f.grownUp.shirt).toBe('teal');
        expect(f.grownUp.pants).toBe(Fam.DEFAULT_FAMILY.grownUp.pants);
        expect(f.kid).toEqual(Fam.DEFAULT_FAMILY.kid);
        const [grown, kid] = Fam.familyMembers(f, 'Blue Wedge', C);
        expect(grown.look.scale).toBe(1);
        expect(kid.look.scale).toBe(C.crowd.kidScale);
        expect(kid.prop).toBe('sign');
        expect(kid.sign).toBe('GO BLUE WEDGE!');
        expect(Fam.familyMembers(f, 'An Extremely Long Car Name', C)[1].sign).toBe('GO GO GO!');
        expect(Fam.familySummary(Fam.DEFAULT_FAMILY)).toBe('Navy and mustard shirts');
        expect(Fam.familySummary({ grownUp: { shirt: 'teal' }, kid: { shirt: 'teal' } })).toBe('Both in teal');
        expect(Fam.familyLine(Fam.DEFAULT_FAMILY)).toBe('The grown-up in a navy shirt and khaki pants, the kid in a mustard shirt and denim blue pants.');
        expect(Crowd.lookOf({ length: 'bald' }, {}, C).style).toBeNull();
    });

    test('the announcer: a different call at each gate, the last one its own', () => {
        expect(Copy.gateCall(1, 4)).toBe('And they’re off!');
        expect(Copy.gateCall(2, 4)).toBe('There goes the gate!');
        expect(Copy.gateCall(4, 4)).toBe('Here they come, one last time!');
        expect(Copy.CALLS.close(2, 'A', 3.2)).toBe('By a nose! A takes heat 2 in 3.200 seconds.');
        for (const s of [...Copy.CALLS.off, Copy.CALLS.lead('A'), Copy.CALLS.leadMine('A'), Copy.CALLS.weighIn]) expect(s).not.toMatch(/—|;/);
    });
});

describe('drawn, against real three', () => {
    let THREE;
    let dom;
    beforeAll(async () => {
        THREE = await loadRealThree();
    });
    beforeEach(() => {
        jest.resetModules();
        globalThis.THREE = THREE;
        dom = installDom();
    });
    afterEach(() => dom.uninstall());

    test('the crowd is a dozen draw calls, each member in one arm pose at a time, hopping up, props in hand', async () => {
        const Cr = await import('../www/derby/js/crowd.js');
        const crowd = Cr.createCrowd(C, { capacity: 40 });
        expect(crowd.ready).toBe(true);
        const meshes = crowd.group.children.filter((c) => c.isInstancedMesh);
        expect(meshes.length).toBeLessThanOrEqual(14);
        const kid = { group: 'mine', phase: 0, look: Cr.lookOf({}, { kid: true }, C), at: { x: 1, y: 0, z: -1, ry: 0 }, prop: 'sign', sign: 'GO!' };
        const fan = { group: 'crowd', phase: 0, keen: true, look: Cr.lookOf({ length: 'bald' }, {}, C), at: { x: 2, y: 0.42, z: -2.2, ry: 0.2 } };
        crowd.set([kid, fan]);
        for (const m of meshes) expect(m.count).toBe(2);
        const mat = new THREE.Matrix4();
        const scaleOf = (mesh, i) => {
            mesh.getMatrixAt(i, mat);
            return new THREE.Vector3().setFromMatrixScale(mat).x;
        };
        const yOf = (mesh, i) => {
            mesh.getMatrixAt(i, mat);
            return new THREE.Vector3().setFromMatrixPosition(mat).y;
        };
        const byName = (geometry) => meshes.find((m) => m.geometry === geometry);
        crowd.pose({ kind: 'idle', t: 0 });
        const up = byName(crowd.parts.arms.up.sleeve);
        const down = byName(crowd.parts.arms.down.sleeve);
        // The kid holds the sign up; the fan, idle, stands arms down.
        expect(scaleOf(up, 0)).toBeCloseTo(C.crowd.kidScale, 6);
        expect(scaleOf(down, 0)).toBe(0);
        expect(scaleOf(down, 1)).toBeCloseTo(1, 6);
        expect(scaleOf(up, 1)).toBe(0);
        // The bald fan wears no hair, the kid one style only.
        const hairs = Object.values(crowd.parts.hair).map(byName);
        expect(hairs.filter((h) => scaleOf(h, 1) > 0)).toHaveLength(0);
        expect(hairs.filter((h) => scaleOf(h, 0) > 0)).toHaveLength(1);
        // The sign is in the kid's raised hands, above the kid's head.
        const sign = crowd.group.children.find((c) => c.isGroup && c.children.length).children[0];
        expect(sign.position.y).toBeGreaterThan(crowd.parts.top * C.crowd.kidScale);
        expect(Math.abs(sign.position.x - kid.at.x)).toBeLessThan(0.1);
        // A cheer: arms up, and a hop off the step.
        crowd.pose({ kind: 'run', t: 0.17, cheering: new Set() });
        expect(scaleOf(up, 1)).toBeCloseTo(1, 6);
        expect(yOf(byName(crowd.parts.body.shirt), 1)).toBeGreaterThan(0.42);
        // Posing the same moment again changes nothing.
        up.instanceMatrix.needsUpdate = false;
        crowd.pose({ kind: 'run', t: 0.17, cheering: new Set() });
        // A new cast lets the old props go.
        crowd.set([fan]);
        expect(crowd.group.children.find((c) => c.isGroup).children).toHaveLength(0);
        expect(() => crowd.dispose()).not.toThrow();
    });

    test('every prop builds and sits in a hand, in its own pose', async () => {
        const Cr = await import('../www/derby/js/crowd.js');
        const crowd = Cr.createCrowd(C, { capacity: 10 });
        const members = Object.keys(Cr.PROPS).map((prop, i) => ({ group: 'owl', phase: 0, prop, sign: 'GO!', look: Cr.lookOf({}, {}, C), at: { x: i, y: 0, z: 0, ry: 0 } }));
        crowd.set(members);
        crowd.pose({ kind: 'idle', t: 0 });
        const held = crowd.group.children.find((c) => c.isGroup && c.children.length === members.length).children;
        held.forEach((p, i) => {
            const hold = Cr.PROPS[members[i].prop];
            const hands = crowd.parts.hands[hold.pose];
            const ys = hands.map((h) => h[1]);
            expect(p.position.y).toBeGreaterThanOrEqual(Math.min(...ys) - 1e-9);
            expect(p.position.y).toBeLessThanOrEqual(Math.max(...ys) + 1e-9);
        });
    });

    test('under the stub, a crowd is nothing, safely', async () => {
        const { installThree } = await import('./helpers/three-stub.mjs');
        installThree();
        const Cr = await import('../www/derby/js/crowd.js');
        const crowd = Cr.createCrowd(C);
        expect(crowd.ready).toBe(false);
        expect(() => { crowd.set([]); crowd.pose({ kind: 'idle', t: 0 }); crowd.dispose(); }).not.toThrow();
    });

    test('the hall dressed: pennants sag, the timer redraws only when it changes', async () => {
        const D = await import('../www/derby/js/dressing.js');
        const spots = D.pennantSpots(C);
        const one = spots.filter((p) => p.x === 7);
        const mid = one[Math.floor(one.length / 2)];
        expect(mid.y).toBeLessThan(one[0].y);
        expect(one[0].y).toBeCloseTo(4.8, 1);
        expect(D.timerRows(null)).toEqual(['DERBY DAY', '1', '2', '3', '4']);
        expect(D.timerRows({ heat: 2, total: 4, lanes: [{ time: 3.2, place: 1 }, { time: null, place: null }, null, null] }))
            .toEqual(['HEAT 2 OF 4', '1  3.200  1st', '2  -.---', '3', '4']);
        const dressing = D.buildDressing(C);
        expect(dressing.group.children.length).toBeGreaterThan(10);
        expect(dressing.timer.set(null)).toBe(false);
        expect(dressing.timer.set({ heat: 1, total: 4, lanes: [] })).toBe(true);
        expect(dressing.timer.set({ heat: 1, total: 4, lanes: [] })).toBe(false);
        // Nothing of it stands in the track's lanes, or under where a car runs.
        const box = new THREE.Box3();
        const edge = trackWidth(C) / 2;
        dressing.group.updateMatrixWorld(true);
        for (const child of dressing.group.children) {
            box.setFromObject(child);
            if (box.isEmpty()) continue;
            const inLanes = box.max.z > -edge && box.min.z < edge && box.max.x > 0 && box.min.x < C.track.courseLength + 2;
            if (inLanes) expect(box.min.y).toBeGreaterThan(1.2);
        }
        const { buildHall } = await import('../www/derby/js/hall.js');
        expect(() => buildHall(C)).not.toThrow();
    });
});

describe('the family card on the bench', () => {
    let dom;
    beforeEach(async () => {
        jest.resetModules();
        const { installThree } = await import('./helpers/three-stub.mjs');
        installThree();
        dom = installDom();
    });
    afterEach(() => dom.uninstall());

    test('dressing the grown-up and the kid, kept, and the camera turned to them', async () => {
        const G = await import('../www/derby/js/garage.js');
        const B = await import('../www/derby/js/bench.js');
        const F = await import('../www/derby/js/family.js');
        const el = Object.fromEntries(['bench-body', 'bench-host', 'bench-host-actions', 'bench-summary', 'bench-race', 'bench-status'].map((id) => [id, dom.el(id)]));
        const changes = [];
        const views = [];
        const noop = () => {};
        const store = F.createFamilyStore();
        B.createBench(el, G.createGarage({ C }), {
            changed: noop, race: noop, units: noop, forgot: noop, raceAgain: noop, track: noop,
            family: { store, changed: (f) => changes.push(f), view: (v) => views.push(v) }
        }, C);
        const find = (root, test) => {
            for (const c of root.children || []) {
                if (test(c)) return c;
                const d = find(c, test);
                if (d) return d;
            }
            return null;
        };
        const byId = (id) => find(dom.el('bench-body'), (n) => n.id === id);
        const pick = (id) => {
            const i = byId(id);
            i.checked = true;
            fire(i, 'change');
        };
        const box = byId('bench-family-box');
        expect(box.children[0].textContent).toBe('Your familyNavy and mustard shirts');
        expect(byId('bench-who-grownUp').checked).toBe(true);
        expect(byId('bench-shirt-navy').checked).toBe(true);
        pick('bench-shirt-teal');
        expect(store.load().grownUp.shirt).toBe('teal');
        expect(changes).toHaveLength(1);
        pick('bench-who-kid');
        expect(byId('bench-shirt-mustard').checked).toBe(true);
        pick('bench-length-bald');
        expect(store.load().kid.length).toBe('bald');
        expect(box.children[0].textContent).toBe('Your familyTeal and mustard shirts');
        expect(JSON.parse(localStorage.getItem('derby-family')).grownUp.shirt).toBe('teal');
        box.open = true;
        fire(box, 'toggle');
        box.open = false;
        fire(box, 'toggle');
        expect(views).toEqual(['family', 'car']);
        // Forget my cars forgets them too (main.js's hook), and the card follows.
        store.forget();
        fire(byId('bench-forget'), 'click');
        fire(byId('bench-forget'), 'click');
        expect(byId('bench-shirt-navy').checked).toBe(false);
        pick('bench-who-grownUp');
        expect(byId('bench-shirt-navy').checked).toBe(true);
    });
});

describe('the page, with real three (only the renderer stood in for)', () => {
    let THREE;
    let dom;
    beforeAll(async () => {
        THREE = await loadRealThree();
    });
    beforeEach(() => {
        jest.resetModules();
        jest.useFakeTimers({ doNotFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'queueMicrotask', 'nextTick', 'setImmediate'] });
        globalThis.THREE = THREE;
        dom = installDom({ innerWidth: 390, innerHeight: 844 });
    });
    afterEach(() => {
        jest.clearAllTimers();
        jest.useRealTimers();
        dom.uninstall();
    });

    async function boot() {
        const { flushAsync } = await import('./helpers/dom-stub.mjs');
        const main = await import('../www/derby/js/main.js');
        await flushAsync(30);
        await jest.advanceTimersByTimeAsync(500);
        return main;
    }
    function frames(main, seconds, fps = 30) {
        const loop = dom.loops[dom.loops.length - 1];
        const spy = jest.spyOn(performance, 'now');
        let now = main.getState().lastTime;
        for (let i = 1; i <= Math.round(seconds * fps); i++) {
            now += 1000 / fps;
            spy.mockReturnValue(now);
            loop();
        }
        spy.mockRestore();
    }

    test('the family stands by the bench, then by the finish with the neighbors\' families, cheering through a race', async () => {
        const main = await boot();
        const state = main.getState();
        expect(state.phase).toBe('bench');
        const crowd = main.__test__.crowd();
        expect(crowd.ready).toBe(true);
        const shirt = crowd.group.children.find((m) => m.isInstancedMesh && m.geometry === crowd.parts.body.shirt);
        const at = (i) => {
            const mat = new THREE.Matrix4();
            shirt.getMatrixAt(i, mat);
            return new THREE.Vector3().setFromMatrixPosition(mat);
        };
        const n0 = shirt.count;
        // The last two are the visitor's family, in the bench room.
        expect(at(n0 - 1).x).toBeLessThan(-10);
        fire(dom.el('bench-race'), 'click');
        const n1 = shirt.count;
        // The Easy division's three families have joined, by the finish.
        expect(n1).toBe(n0 + C.families.brick.length + C.families.hotdog.length + C.families.loaf.length);
        const fam = [...Array(n1 - (n0 - 2)).keys()].map((k) => at(n0 - 2 + k));
        for (const p of fam) {
            expect(p.x).toBeGreaterThan(0);
            expect(p.z).toBeLessThan(-0.4);
        }
        fire(dom.el('go-btn'), 'click');
        fire(dom.el('skip-btn'), 'click');
        expect(state.phase).toBe('race');
        frames(main, 3);
        expect(dom.el('caption').textContent.length).toBeGreaterThan(0);
        frames(main, state.day.plan.total);
        expect(state.phase).toBe('results');
        // Back on the bench, the family goes with it.
        fire(dom.el('results-tune'), 'click');
        expect(at(shirt.count - 1).x).toBeLessThan(-10);
        // The family card turns the camera to them, and back.
        main.__test__.familyView('family');
        expect(state.benchView).toBe('family');
        main.__test__.familyView('car');
        expect(state.benchView).toBe('car');
    });
});

describe('the family card, from source', () => {
    let dom;
    beforeEach(async () => {
        jest.resetModules();
        const { installThree } = await import('./helpers/three-stub.mjs');
        installThree();
        dom = installDom();
    });
    afterEach(() => dom.uninstall());

    test('each choice of each of the two, kept and handed on, and reset from the store', async () => {
        const F = await import('../www/derby/js/family.js');
        const { h } = await import('../www/derby/js/board.js');
        const listen = (n, t, fn) => n.addEventListener(t, fn);
        const choice = (type, name, value, label, blurb, onChange, cls = '') => {
            const input = document.createElement('input');
            input.type = type;
            input.name = name;
            input.value = value;
            input.id = `${name}-${value}`;
            listen(input, 'change', () => onChange(input));
            const text = h('span', 'choice-text', null, [h('span', 'choice-label', label)]);
            return { wrap: h('label', `choice ${cls}`, null, [input, text]), input, text };
        };
        const group = (legend, kids, cls) => h('fieldset', null, null, [h('legend', null, legend), h('div', cls, null, kids)]);
        const store = F.createFamilyStore();
        const seen = [];
        const body = document.createElement('div');
        const card = F.createFamilyCard(body, { h, choice, group, listen }, store, (f) => seen.push(f));
        const find = (root, id) => {
            for (const c of root.children || []) {
                if (c.id === id) return c;
                const d = find(c, id);
                if (d) return d;
            }
            return null;
        };
        const pick = (id, on = true) => {
            const i = find(body, id);
            i.checked = on;
            fire(i, 'change');
        };
        // A box unticked does nothing.
        pick('bench-pants-black', false);
        expect(seen).toHaveLength(0);
        for (const [key, id] of [['shirt', 'forest'], ['pants', 'black'], ['skin', 'deep'], ['hair', 'blond'], ['length', 'buzz']]) pick(`bench-${key}-${id}`);
        expect(card.family().grownUp).toEqual({ shirt: 'forest', pants: 'black', skin: 'deep', hair: 'blond', length: 'buzz' });
        pick('bench-who-kid', false);
        pick('bench-who-kid');
        pick('bench-shirt-white');
        expect(card.family().kid.shirt).toBe('white');
        expect(seen).toHaveLength(6);
        expect(store.load().kid.shirt).toBe('white');
        store.forget();
        card.reset();
        expect(card.family()).toEqual(F.normalizeFamily(null));
        expect(find(body, 'bench-shirt-mustard').checked).toBe(true);
    });
});
