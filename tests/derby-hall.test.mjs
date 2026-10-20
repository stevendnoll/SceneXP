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
        expect(Crowd.poseAt(member('crowd'), { kind: 'idle', t: 0 })).toEqual({ pose: 'down', hop: 0, lean: 0 });
        expect(['clap', 'apart']).toContain(Crowd.poseAt(member('crowd'), run).pose);
        expect(['up', 'clap']).toContain(Crowd.poseAt(member('crowd', { keen: true }), run).pose);
        expect(['up', 'clap']).toContain(Crowd.poseAt(member('crowd', { keen: true }), { kind: 'times', t: 0 }).pose);
        expect(['up', 'clap']).toContain(Crowd.poseAt(member('owl'), run).pose);
        // Steve's QA, 2026-10-20: the families by the track no longer jump
        // while the cars run (it drew the eye from the cars).
        for (let t = 0; t < 3; t += 0.02) {
            for (const kind of ['run', 'replay']) expect(Crowd.poseAt(member('owl', { phase: 0.7 }), { ...run, kind, t }).hop).toBe(0);
        }
        expect(Crowd.poseAt(member('arrow'), run)).toEqual({ pose: 'down', hop: 0 });
        expect(Crowd.poseAt(member('owl'), { kind: 'staging', t: 0 }).pose).toBe('clap');
        const times = { kind: 'times', t: 0.15, won: 'mine' };
        expect(Crowd.poseAt(member('mine'), times).pose).toBe('up');
        expect(Crowd.poseAt(member('mine'), times).hop).toBeGreaterThan(0);
        expect(Crowd.poseAt(member('owl'), times)).toEqual({ pose: 'down', hop: 0 });
        // A prop holder keeps the pose that holds it, win or lose.
        expect(Crowd.poseAt(member('owl', { prop: 'sign' }), times).pose).toBe('hold');
        expect(Crowd.poseAt(member('owl', { prop: 'thermos' }), run).pose).toBe('down');
        expect(Crowd.poseAt(member('volunteer'), run)).toEqual({ pose: 'down', hop: 0 });
    });

    // The M7.1 sweep: the winning family hopped on a loop behind the results
    // card, and the bleachers through every run, with reduced motion on.
    test('reduced motion: every pose held, nobody hopping, the same at any moment', () => {
        const member = (group, extra = {}) => ({ group, phase: 0, ...extra });
        const cases = [
            [member('crowd', { keen: true }), { kind: 'run', cheering: new Set() }],
            [member('crowd'), { kind: 'run', cheering: new Set() }],
            [member('crowd'), { kind: 'staging' }],
            [member('mine'), { kind: 'run', cheering: new Set(['mine']) }],
            [member('mine'), { kind: 'times', won: 'mine' }]
        ];
        for (const [m, moment] of cases) {
            const seen = new Set();
            for (let t = 0; t < 2; t += 0.05) {
                const p = Crowd.poseAt(m, { ...moment, t, still: true });
                expect(p.hop).toBe(0);
                expect(p.lean || 0).toBe(0);
                seen.add(p.pose);
            }
            expect(seen.size).toBe(1);
            // Moving, the same member does move: a hop, a sway or its arms.
            const moves = new Set();
            for (let t = 0; t < 2; t += 0.05) {
                const p = Crowd.poseAt(m, { ...moment, t });
                moves.add(`${p.pose}:${p.hop.toFixed(2)}:${(p.lean || 0).toFixed(3)}`);
            }
            expect(moves.size).toBeGreaterThan(1);
        }
    });

    test('the bleachers cheer (Steve\'s QA, 2026-10-20: they stood still): the keen jump and pump, the rest clap and sway', () => {
        const fans = Array.from({ length: 12 }, (_, i) => ({ group: 'crowd', keen: i % 3 === 0, phase: i * 0.53 }));
        for (const kind of ['run', 'replay', 'times', 'dance']) {
            const seen = { keen: new Set(), rest: new Set() };
            let jump = 0;
            let sway = 0;
            for (let t = 0; t < 2; t += 1 / 30) {
                for (const f of fans) {
                    const p = Crowd.poseAt(f, { kind, t, cheering: new Set(), won: 'owl' });
                    seen[f.keen ? 'keen' : 'rest'].add(p.pose);
                    if (f.keen) jump = Math.max(jump, p.hop);
                    else {
                        expect(p.hop).toBe(0);
                        sway = Math.max(sway, Math.abs(p.lean));
                    }
                }
            }
            // The keen pump their arms up and down and jump higher than a
            // family's cheer.
            expect([...seen.keen].sort()).toEqual(['clap', 'up']);
            expect(jump).toBeGreaterThan(1);
            // The rest clap: hands together, apart, together.
            expect([...seen.rest].sort()).toEqual(['apart', 'clap']);
            expect(sway).toBeGreaterThan(0.04);
            expect(sway).toBeLessThanOrEqual(C.crowd.stands.sway);
        }
        // Waiting at the gate: the keen clap, the rest sway a little.
        const gate = (f, t) => Crowd.poseAt(f, { kind: 'gate', t });
        expect(new Set([0, 0.1, 0.2, 0.3].map((t) => gate(fans[0], t).pose))).toEqual(new Set(['clap', 'apart']));
        expect(gate(fans[1], 0.3).pose).toBe('down');
        expect(Math.abs(gate(fans[1], 0.3).lean)).toBeGreaterThan(0);
        // Not in step: neighbors clap at their own moments.
        const at = (t) => fans.filter((f) => !f.keen).map((f) => Crowd.poseAt(f, { kind: 'run', t, cheering: new Set() }).pose);
        expect(new Set(at(0.5)).size).toBe(2);
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
        // Four body pieces, three hair styles, two pieces for each arm pose.
        expect(meshes.length).toBe(4 + 3 + 2 * Cr.POSES.length);
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
        const hold = byName(crowd.parts.arms.hold.sleeve);
        // The kid holds the sign up; the fan, idle, stands arms down.
        expect(scaleOf(hold, 0)).toBeCloseTo(C.crowd.kidScale, 6);
        expect(scaleOf(up, 0)).toBe(0);
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
        // A clapping fan sways from the feet, the way it faces kept.
        const clapper = { ...fan, keen: false, phase: 0.2 };
        const moment = { kind: 'run', t: 0.1, cheering: new Set() };
        crowd.set([clapper], moment);
        const lean = Cr.poseAt(clapper, moment, C).lean;
        expect(Math.abs(lean)).toBeGreaterThan(0.01);
        byName(crowd.parts.body.shirt).getMatrixAt(0, mat);
        const turn = new THREE.Quaternion();
        mat.decompose(new THREE.Vector3(), turn, new THREE.Vector3());
        const e = new THREE.Euler().setFromQuaternion(turn, 'YXZ');
        expect(e.y).toBeCloseTo(clapper.at.ry, 4);
        expect(e.z).toBeCloseTo(lean, 4);
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

    test('hands on the props (Steve\'s QA: the sign floated over the kid\'s head)', async () => {
        const Cr = await import('../www/derby/js/crowd.js');
        const crowd = Cr.createCrowd(C, { capacity: 4 });
        const at = { x: 0, y: 0, z: 0, ry: 0 };
        for (const scale of [1, C.crowd.kidScale]) {
            const look = { ...Cr.lookOf({}, {}, C), scale };
            crowd.set([
                { group: 'owl', phase: 0, prop: 'sign', sign: 'GO!', look, at },
                { group: 'owl', phase: 0, prop: 'trophy', look, at: { ...at, x: 2 } },
                { group: 'owl', phase: 0, prop: 'finger', look, at: { ...at, x: 4 } }
            ]);
            crowd.group.updateMatrixWorld(true);
            const held = crowd.group.children.find((c) => c.isGroup && c.children.length === 3).children;
            const hands = (prop, x) => crowd.parts.hands[Cr.PROPS[prop].pose].map(([hx, hy, hz]) => new THREE.Vector3(x + hx * scale, hy * scale, hz * scale));
            const handR = 0.04 * 1.3 * scale;
            // The sign: each hand on the board's lower part, inside its width,
            // just in front of it, and the board clear of the head.
            const board = new THREE.Box3().setFromObject(held[0]);
            for (const h of hands('sign', 0)) {
                expect(h.x).toBeGreaterThan(board.min.x);
                expect(h.x).toBeLessThan(board.max.x);
                expect(h.y).toBeGreaterThan(board.min.y);
                expect(h.y).toBeLessThan(board.min.y + 0.12 * scale);
                expect(h.z).toBeGreaterThan(board.max.z - 0.001);
                expect(h.z - handR).toBeLessThan(board.max.z);
                // Inside the board's corners, not beyond them.
                expect(Math.min(h.x - board.min.x, board.max.x - h.x)).toBeLessThan(0.1 * scale);
            }
            expect(board.min.y).toBeGreaterThan(crowd.parts.top * scale);
            // The trophy: in the raised right hand, round its stem.
            const cup = new THREE.Box3().setFromObject(held[1]);
            const right = hands('trophy', 2).sort((p, q) => p.x - q.x)[0];
            expect(right.x).toBeGreaterThan(cup.min.x);
            expect(right.x).toBeLessThan(cup.max.x);
            expect(right.y).toBeGreaterThan(cup.min.y);
            expect(right.y).toBeLessThan(cup.min.y + 0.12 * scale);
            // The foam finger: worn over the hand.
            const finger = new THREE.Box3().setFromObject(held[2]);
            expect(finger.containsPoint(hands('finger', 4).sort((p, q) => p.x - q.x)[0])).toBe(true);
        }
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
        // After the last heat, the winner's grown-up steps out of the crowd
        // and dances in its place (dancer.js).
        const heats = state.day.plan.heats;
        const dance = heats[heats.length - 1].segments.find((s) => s.kind === 'dance');
        frames(main, dance.from + 1 - state.clock);
        const dancer = main.__test__.dancer();
        expect(dancer.dancing()).toBe(true);
        expect(dom.el('caption').textContent).toMatch(/ wins the day, and (here comes|your family breaks out) the /);
        const scaleOf = (i) => {
            const mat = new THREE.Matrix4();
            shirt.getMatrixAt(i, mat);
            return new THREE.Vector3().setFromMatrixScale(mat).x;
        };
        const { index, at: spot } = state.dance;
        expect(scaleOf(index)).toBe(0);
        expect(dancer.rig().root.position.x).toBeCloseTo(spot.x, 1);
        expect(dancer.rig().root.position.z).toBeCloseTo(spot.z, 1);
        frames(main, state.day.plan.total);
        expect(state.phase).toBe('results');
        // Back in the crowd behind the results, the dancer gone.
        expect(dancer.dancing()).toBe(false);
        expect(scaleOf(index)).toBeCloseTo(1, 6);
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

describe('the faces are on screen (Steve\'s QA: "I never see the faces")', () => {
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

    /** Where a point lands on a screen of `aspect` seen by a shot: NDC, or
     *  null behind the camera. */
    function onScreen(shot, aspect, p) {
        const cam = new THREE.PerspectiveCamera(C.camera.fov, aspect, C.camera.near, C.camera.far);
        cam.position.set(shot.position.x, shot.position.y, shot.position.z);
        cam.lookAt(shot.target.x, shot.target.y, shot.target.z);
        cam.updateMatrixWorld(true);
        const v = new THREE.Vector3(p.x, p.y, p.z).project(cam);
        return v.z < 1 ? v : null;
    }
    const inside = (v) => v && v.x > -0.95 && v.x < 0.95 && v.y > -0.95 && v.y < 0.95;
    const ASPECTS = [16 / 9, 390 / 844];

    test('the crowd shot: every face of the family it centers on, and the bleachers\' faces behind', async () => {
        const D = await import('../www/derby/js/director.js');
        const parts = (await import('../www/shared/js/crowd-1.0.0.js')).buildCrowdParts({ poses: ['down'] });
        const groups = [{ key: 'mine', members: Fam.familyMembers(null, 'Blue Wedge', C) }]
            .concat(['owl', 'arrow', 'phantom'].map((id) => ({ key: id, members: Crowd.familyOf(id, C) })));
        const places = Crowd.familyPlaces(groups, C);
        for (const aspect of ASPECTS) {
            for (const [k, place] of places.entries()) {
                const mid = { x: place.at.reduce((a, p) => a + p.x, 0) / place.at.length, z: place.at.reduce((a, p) => a + p.z, 0) / place.at.length };
                const shot = D.crowdFraming(mid, aspect, C);
                place.at.forEach((p, i) => {
                    const s = groups[k].members[i].look.scale;
                    expect(inside(onScreen(shot, aspect, { x: p.x, y: parts.eyeHeight * s, z: p.z }))).toBe(true);
                    // The feet too: the whole person.
                    expect(inside(onScreen(shot, aspect, { x: p.x, y: 0.05, z: p.z }))).toBe(true);
                });
                // The camera stands inside the hall, at a person's height.
                expect(shot.position.z).toBeLessThan(7);
                expect(shot.position.y).toBeGreaterThan(1.2);
                expect(shot.position.y).toBeLessThan(2.2);
            }
            // Faces on the bleachers behind the visitor's family.
            const mid = places[0].at[0];
            const shot = D.crowdFraming({ x: mid.x, z: mid.z }, aspect, C);
            const seen = Crowd.bleacherSeats(C).filter((s) => inside(onScreen(shot, aspect, { x: s.x, y: s.y + parts.eyeHeight, z: s.z })));
            expect(seen.length).toBeGreaterThan(aspect > 1 ? 15 : 4);
        }
    });

    test('the weigh-in opens wide on the volunteer\'s face, and closes in on the scale', async () => {
        const Ck = await import('../www/derby/js/checkin.js');
        const parts = (await import('../www/shared/js/crowd-1.0.0.js')).buildCrowdParts({ poses: ['down'] });
        const table = Ck.buildCheckinTable(C);
        const W = C.weighIn;
        // Where main.js stands the volunteer.
        const face = { x: W.at.x - 0.25, y: parts.eyeHeight, z: W.at.z - 0.55 };
        const scale = table.carAt('hold', 0);
        for (const aspect of ASPECTS) {
            const wide = table.shot(aspect, 1);
            expect(inside(onScreen(wide, aspect, face))).toBe(true);
            expect(inside(onScreen(wide, aspect, scale))).toBe(true);
            const close = table.shot(aspect, 0);
            expect(inside(onScreen(close, aspect, scale))).toBe(true);
            // Close, the scale fills more of the screen than wide.
            const span = (shot) => {
                const a = onScreen(shot, aspect, { x: scale.x - 0.1, y: scale.y, z: scale.z });
                const b = onScreen(shot, aspect, { x: scale.x + 0.1, y: scale.y, z: scale.z });
                return Math.abs(a.x - b.x);
            };
            expect(span(close)).toBeGreaterThan(span(wide));
        }
    });

    test('the scale\'s reading is in plain view (Steve\'s QA, 2026-10-20: a silver bar across its top)', async () => {
        const Ck = await import('../www/derby/js/checkin.js');
        const table = Ck.buildCheckinTable(C);
        table.group.updateMatrixWorld(true);
        const screen = table.group.getObjectByName('scale-readout');
        const ray = new THREE.Raycaster();
        const solid = table.group.children.filter((o) => o.isMesh);
        const { width, height } = screen.geometry.parameters;
        for (const aspect of ASPECTS) {
            for (const wide of [0, 0.5, 1]) {
                const shot = table.shot(aspect, wide);
                const eye = new THREE.Vector3(shot.position.x, shot.position.y, shot.position.z);
                // A grid over the whole face: the old screen was hidden in a
                // band across its upper middle, where it ran into the pan.
                const grid = [];
                for (let u = -0.45; u <= 0.451; u += 0.15) for (let v = -0.45; v <= 0.451; v += 0.05) grid.push([u, v]);
                for (const [u, v] of grid) {
                    const p = screen.localToWorld(new THREE.Vector3(u * width, v * height, 0));
                    ray.set(eye, p.clone().sub(eye).normalize());
                    const hit = ray.intersectObjects(solid, false)[0];
                    expect(hit && hit.object.name).toBe('scale-readout');
                }
            }
        }
    });

    test('a dozen donuts in an open box (Steve\'s QA, 2026-10-20: more detail), each its own, none in another', async () => {
        const Dr = await import('../www/derby/js/dressing.js');
        const box = Dr.donutBox();
        expect(box).toHaveLength(12);
        expect(new Set(box.map((d) => d.kind)).size).toBeGreaterThanOrEqual(6);
        expect(Dr.donutBox()).toEqual(box);
        const D = Dr.DONUT;
        const outer = D.ring + D.tube;
        for (let i = 0; i < box.length; i++) {
            for (let j = i + 1; j < box.length; j++) {
                expect(Math.hypot(box[i].x - box[j].x, box[i].z - box[j].z)).toBeGreaterThan(2 * outer);
            }
            // Sprinkles on the iced ones only, each on top of its donut.
            const kind = Dr.DONUT_KINDS[box[i].kind];
            expect(box[i].sprinkles.length > 0).toBe(kind.sprinkles);
            for (const sp of box[i].sprinkles) {
                const p = Dr.sprinkleAt(sp);
                expect(p.y).toBeGreaterThan(D.tube * D.flat * 0.8);
                const r = Math.hypot(p.x, p.z);
                expect(Math.abs(r - D.ring)).toBeLessThan(D.tube * 1.1);
            }
        }
        // Drawn: three instanced pieces, every donut inside the box's walls.
        const dressing = Dr.buildDressing(C);
        const group = dressing.group.getObjectByName('donuts');
        const inst = group.children.filter((o) => o.isInstancedMesh);
        expect(inst).toHaveLength(3);
        const [dough, tops, bits] = inst;
        expect(dough.count).toBe(12);
        expect(tops.count).toBe(box.filter((d) => Dr.DONUT_KINDS[d.kind].icing !== null).length);
        expect(bits.count).toBe(box.reduce((n, d) => n + d.sprinkles.length, 0));
        group.updateMatrixWorld(true);
        const walls = new THREE.Box3().setFromObject(group.children[0]);
        const mat = new THREE.Matrix4();
        for (let i = 0; i < dough.count; i++) {
            dough.getMatrixAt(i, mat);
            const p = new THREE.Vector3().setFromMatrixPosition(mat).applyMatrix4(group.matrixWorld);
            expect(p.x - outer).toBeGreaterThan(walls.min.x);
            expect(p.x + outer).toBeLessThan(walls.max.x);
            expect(p.z - outer).toBeGreaterThan(walls.min.z);
            expect(p.z + outer).toBeLessThan(walls.max.z);
            // Resting on the table, not in it.
            expect(p.y - D.tube * D.flat).toBeGreaterThan(0.74);
        }
    });

    test('the hoops wear nets', async () => {
        const Dr = await import('../www/derby/js/dressing.js');
        const d = Dr.buildDressing(C);
        let nets = 0;
        d.group.traverse((o) => {
            if (o.isMesh && o.geometry.type === 'CylinderGeometry' && o.geometry.parameters.openEnded && o.material.side === THREE.DoubleSide) nets++;
        });
        expect(nets).toBe(2);
    });
});
