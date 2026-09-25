// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Corner Office's room, measured against the REAL three.js, through the real
 * camera at each station.
 *
 * The test stub absorbs every assignment, so a room built under it has no
 * children and no positions. three.min.js runs in a node:vm context instead,
 * the way tests/person-rig-seams.test.mjs measures the rig.
 *
 * COMPOSE AGAINST THE EYE, NOT THE FLOOR PLAN. A tappable thing is only
 * tappable if the eye can see it, so every one is checked the way a tap
 * would find it: in the frame, and the first thing a ray toward it meets,
 * at a wide screen, a laptop, and two phones held upright.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { CONFIG } from '../www/office/js/config.js';

let THREE;
let buildRoom;
let pickOf;
let windowsOf;
let setLamp;
let poseFor;
let setNotes;
let notesMod;
let roomMod;
let room;

beforeAll(async () => {
    const ctx = vm.createContext({ self: {}, window: {}, console: { warn() {} } });
    vm.runInContext(readFileSync(join(process.cwd(), 'www/lib/three.min.js'), 'utf8'), ctx);
    THREE = ctx.THREE || ctx.self.THREE || ctx.window.THREE;
    globalThis.THREE = THREE;
    roomMod = await import('../www/office/js/room.js');
    ({ buildRoom, pickOf, windowsOf, setLamp, setNotes } = roomMod);
    notesMod = await import('../www/office/js/notes.js');
    ({ poseFor } = await import('../www/office/js/stations.js'));
    room = buildRoom(CONFIG);
    room.group.updateMatrixWorld(true);
});

afterAll(() => {
    delete globalThis.THREE;
});

const TAPPABLE = ['computer', 'intray', 'outtray', 'wastebasket', 'lamp', 'calendar', 'printer'];
const ASPECTS = { 'wide 21:9': 21 / 9, 'laptop 16:10': 16 / 10, 'phone upright': 390 / 844, 'tall phone': 9 / 19.5 };
/** What the desk's frame may leave out on an upright phone: the calendar
 *  moved left so the window could widen (QA, 2026-09-25), and a phone
 *  reaches it from Places. */
const PHONE_LEAVES_OUT = ['calendar'];
const tappableFrom = (aspect) => TAPPABLE.filter((key) => aspect > 1 || !PHONE_LEAVES_OUT.includes(key));

function cameraAt(station, aspect) {
    const pose = poseFor(station, aspect, CONFIG);
    const cam = new THREE.PerspectiveCamera(pose.fov, aspect, CONFIG.camera.near, CONFIG.camera.far);
    cam.position.set(...pose.eye);
    cam.lookAt(new THREE.Vector3(...pose.aim));
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    return cam;
}

const boxOf = (object) => new THREE.Box3().setFromObject(object);

/** What a tap aimed at `point` would find: the pick key of the first shown
 *  thing the ray meets. */
function firstPick(cam, point) {
    const ray = new THREE.Raycaster();
    ray.set(cam.position, point.clone().sub(cam.position).normalize());
    for (const hit of ray.intersectObject(room.group, true)) {
        let shown = true;
        for (let o = hit.object; o; o = o.parent) if (!o.visible) shown = false;
        if (shown) return pickOf(hit.object);
    }
    return null;
}

describe('what is in the room', () => {
    test('every tappable thing is there, and the folder waits hidden', () => {
        for (const key of [...TAPPABLE, 'folder', 'notes']) expect(room.picks[key]).toBeTruthy();
        expect(room.notes.visible).toBe(false);
        expect(room.folder.visible).toBe(false);
    });

    test('the thin things carry a hit box that is not drawn', () => {
        for (const key of ['lamp', 'wastebasket']) {
            const proxy = room.picks[key].children.find((c) => c.name === `${key}-hit`);
            expect(proxy).toBeTruthy();
            expect(proxy.material.visible).toBe(false);
            expect(proxy.visible).toBe(true);
        }
    });

    test('pickOf finds the tappable thing from any part of it, and nothing from a wall', () => {
        const part = room.picks.lamp.children[2];
        expect(pickOf(part)).toBe('lamp');
        expect(pickOf(room.group.children[0])).toBeNull();
        expect(pickOf(null)).toBeNull();
    });

    test('what stands on the desk rests on its top, and the wastebasket on the floor', () => {
        const top = CONFIG.room.desk.height;
        for (const key of ['computer', 'outtray', 'lamp', 'folder']) {
            room.picks.folder.visible = true;
            expect(boxOf(room.picks[key]).min.y).toBeCloseTo(top, 2);
        }
        room.picks.folder.visible = false;
        expect(boxOf(room.picks.wastebasket).min.y).toBeCloseTo(0, 2);
    });

    test('the in-tray is stacked on the out-tray, on posts standing on its walls (QA, 2026-09-25)', () => {
        const inBox = boxOf(room.picks.intray);
        const outBox = boxOf(room.picks.outtray);
        // The same footprint, the one over the other.
        expect(inBox.min.x).toBeCloseTo(outBox.min.x, 3);
        expect(inBox.max.z).toBeCloseTo(outBox.max.z, 3);
        expect(inBox.min.y).toBeCloseTo(outBox.max.y, 3);
        // The in-tray's own floor is TRAY_RISE up, clear of the out-tray.
        const floors = room.picks.intray.children.filter((m) => m.geometry.parameters.height === 0.012);
        expect(floors).toHaveLength(1);
        expect(boxOf(floors[0]).min.y).toBeCloseTo(CONFIG.room.desk.height + roomMod.TRAY_RISE, 4);
        expect(boxOf(floors[0]).min.y).toBeGreaterThan(outBox.max.y + 0.04);
    });

    test('the lamp is a banker’s lamp: a green shade lying along the desk over a brass stem, lit inside', () => {
        const lamp = room.picks.lamp;
        const shade = lamp.children.find((c) => c.isGroup);
        const b = boxOf(shade);
        // Lying on its side: longer across the desk than it is tall or deep
        // (a real one is about 24 cm long and 15 cm through).
        expect(b.max.x - b.min.x).toBeGreaterThan(1.4 * (b.max.y - b.min.y));
        expect(b.max.x - b.min.x).toBeGreaterThan(1.4 * (b.max.z - b.min.z));
        const glass = shade.children.find((c) => c.geometry.type === 'CylinderGeometry' && c.material.side === THREE.FrontSide);
        const green = glass.material.color;
        expect(green.g).toBeGreaterThan(green.r * 2);
        expect(green.g).toBeGreaterThan(green.b);
        // The bulb and its light are under the shade's top, over the base.
        expect(room.lamp.light.position.y).toBeLessThan(b.max.y);
        expect(room.lamp.light.position.y).toBeGreaterThan(b.min.y - 0.05);
        const base = boxOf(lamp.children[0]);
        expect(room.lamp.light.position.x).toBeGreaterThan(base.min.x);
        expect(room.lamp.light.position.x).toBeLessThan(base.max.x);
        // Switched off, the white glass inside stops glowing, and back on.
        setLamp(room.lamp, false);
        expect(room.lamp.glow.material.emissiveIntensity).toBe(0);
        setLamp(room.lamp, true);
        expect(room.lamp.glow.material.emissiveIntensity).toBe(roomMod.LAMP_GLOW);
    });

    test('the Rolodex is gone from the desk (QA, 2026-09-25)', () => {
        expect(room.picks.rolodex).toBeUndefined();
        expect(room.group.getObjectByName('rolodex')).toBeUndefined();
    });

    test('everything on the desk fits on the desk', () => {
        const d = CONFIG.room.desk;
        for (const key of ['computer', 'intray', 'outtray', 'lamp']) {
            const b = boxOf(room.picks[key]);
            expect(b.min.x).toBeGreaterThanOrEqual(d.x - d.width / 2 - 1e-6);
            expect(b.max.x).toBeLessThanOrEqual(d.x + d.width / 2 + 1e-6);
            expect(b.min.z).toBeGreaterThanOrEqual(d.z - d.depth / 2 - 1e-6);
            expect(b.max.z).toBeLessThanOrEqual(d.z + d.depth / 2 + 1e-6);
        }
    });

    test('the lamp switches, and its bulb dims with it', () => {
        setLamp(room.lamp, false);
        expect(room.lamp.light.visible).toBe(false);
        expect(room.lamp.bulb.material.color.getHex()).toBe(0x6b6356);
        setLamp(room.lamp, true);
        expect(room.lamp.light.visible).toBe(true);
    });
});

describe.each(Object.entries(ASPECTS))('from the desk, on a %s screen', (_name, aspect) => {
    test.each(tappableFrom(aspect))('the %s is in the frame and nothing stands in front of it', (key) => {
        const cam = cameraAt('desk', aspect);
        const center = boxOf(room.picks[key]).getCenter(new THREE.Vector3());
        const ndc = center.clone().project(cam);
        expect(Math.abs(ndc.x)).toBeLessThan(0.95);
        expect(Math.abs(ndc.y)).toBeLessThan(0.95);
        expect(ndc.z).toBeLessThan(1);
        expect(firstPick(cam, center)).toBe(key);
    });

    test('the window is an opening: nothing of the room stands in it', () => {
        const cam = cameraAt('desk', aspect);
        const w = windowsOf(CONFIG);
        // The middle of the LEFT pane: dead center is the mullion. The city
        // beyond is world.js's own scene, so a ray through the glass meets
        // nothing of the room's at all.
        const through = new THREE.Vector3(w.back.x0 + (w.back.x1 - w.back.x0) / 4, (w.sill + w.head) / 2, -CONFIG.room.depth / 2);
        const ray = new THREE.Raycaster();
        ray.set(cam.position, through.clone().sub(cam.position).normalize());
        expect(ray.intersectObject(room.group, true)).toEqual([]);
    });
});

describe('the chair', () => {
    test('is turned toward the desk, its seat facing it and its back to the window (QA, 2026-09-24)', () => {
        const chair = room.group.getObjectByName('chair');
        // The seat faces the chair's own -z.
        const seatFaces = new THREE.Vector3(0, 0, -1).applyQuaternion(chair.quaternion);
        const d = CONFIG.room.desk;
        const toDesk = new THREE.Vector3(d.x + d.width / 2 - chair.position.x, 0, d.z - chair.position.z).normalize();
        expect(seatFaces.dot(toDesk)).toBeGreaterThan(0.8);
        // Seen from the desk station, some of the seat shows, not only the
        // flat back of the chair.
        const cam = cameraAt('desk', 16 / 10);
        const seatCentre = chair.localToWorld(new THREE.Vector3(0, 0.505, -0.1));
        const hit = new THREE.Raycaster(cam.position, seatCentre.clone().sub(cam.position).normalize()).intersectObject(room.group, true)[0];
        let o = hit.object;
        while (o && o !== chair) o = o.parent;
        expect(o).toBe(chair);
        expect(hit.point.y).toBeGreaterThan(0.45);
        expect(hit.point.y).toBeLessThan(0.53);
    });

    test('rolls on five casters, each at the end of a leg and on the floor (QA, 2026-09-25)', () => {
        const chair = room.group.getObjectByName('chair');
        const { count, reach, wheel } = roomMod.CHAIR_LEGS;
        const casters = [];
        chair.traverse((o) => {
            if (o.geometry && o.geometry.type === 'CylinderGeometry' && o.geometry.parameters.radiusTop === wheel) casters.push(o);
        });
        expect(casters).toHaveLength(count);
        const column = chair.localToWorld(new THREE.Vector3(0, 0, 0));
        const angles = casters.map((c) => {
            const b = boxOf(c);
            // On the floor, to within the wheel's facets.
            expect(b.min.y).toBeGreaterThanOrEqual(-1e-6);
            expect(b.min.y).toBeLessThan(0.002);
            const at = b.getCenter(new THREE.Vector3());
            expect(Math.hypot(at.x - column.x, at.z - column.z)).toBeCloseTo(reach - 0.01, 2);
            return Math.atan2(at.z - column.z, at.x - column.x);
        }).sort((p, q) => p - q);
        // Spread evenly round the column.
        for (let i = 1; i < angles.length; i++) expect(angles[i] - angles[i - 1]).toBeCloseTo((2 * Math.PI) / count, 3);
    });
});

describe('at the computer', () => {
    test('the monitor fills the middle of the view', () => {
        const cam = cameraAt('computer', 16 / 10);
        const b = boxOf(room.screen);
        const a = b.min.clone().project(cam);
        const c = b.max.clone().project(cam);
        expect(Math.abs(c.x - a.x)).toBeGreaterThan(0.8);
        expect(firstPick(cam, b.getCenter(new THREE.Vector3()))).toBe('computer');
    });
});

describe('the wall calendar and the sticky notes', () => {
    const showNotes = (n) => {
        setNotes(room.notes, n, (i) => notesMod.quadCorners(notesMod.NOTE_SLOTS[i]), (i) => notesMod.cellUvs(i));
        room.group.updateMatrixWorld(true);
    };

    afterEach(() => showNotes(0));

    test('the calendar hangs on the back wall, clear of the window', () => {
        const b = boxOf(room.picks.calendar);
        const w = windowsOf(CONFIG);
        expect(b.max.x).toBeLessThan(w.back.x0);
        expect(b.min.z).toBeGreaterThanOrEqual(-CONFIG.room.depth / 2 - 1e-6);
        expect(b.min.y).toBeGreaterThan(0.9);
        expect(b.max.y).toBeLessThan(CONFIG.room.height);
    });

    test('at the calendar station, the calendar fills the view', () => {
        const cam = cameraAt('calendar', 16 / 10);
        const b = boxOf(room.calendar);
        const a = b.min.clone().project(cam);
        const c = b.max.clone().project(cam);
        expect(Math.abs(c.y - a.y)).toBeGreaterThan(1.2);
        expect(Math.abs(c.y - a.y)).toBeLessThan(2);
        expect(firstPick(cam, b.getCenter(new THREE.Vector3()))).toBe('calendar');
    });

    test('six notes are one mesh of six quads, and none shows when nothing is due', () => {
        showNotes(6);
        expect(room.notes.visible).toBe(true);
        expect(room.notes.geometry.index.count).toBe(36);
        expect(room.notes.geometry.attributes.uv.count).toBe(24);
        showNotes(0);
        expect(room.notes.visible).toBe(false);
    });

    test.each(Object.entries(ASPECTS))('from the desk on a %s screen, every note can be tapped', (_name, aspect) => {
        showNotes(6);
        const cam = cameraAt('desk', aspect);
        for (let i = 0; i < 6; i++) {
            const q = notesMod.quadCorners(notesMod.NOTE_SLOTS[i]);
            const center = new THREE.Vector3(q.reduce((s, p) => s + p[0], 0) / 4, q.reduce((s, p) => s + p[1], 0) / 4, i * 0.0004);
            room.notes.localToWorld(center);
            const ndc = center.clone().project(cam);
            expect(Math.abs(ndc.x)).toBeLessThan(0.98);
            expect(firstPick(cam, center)).toBe('notes');
        }
    });
});

describe('the filing cabinet', () => {
    let createFiling;
    let filing;
    const CAB = CONFIG.room.cabinet;
    const ids = Array.from({ length: 12 }, (_, i) => `f${i}`);
    const plan = [ids.slice(0, 3), ids.slice(3, 6), ids.slice(6, 9), ids.slice(9)].map((d) => ({ ids: d }));

    beforeAll(async () => {
        ({ createFiling } = await import('../www/office/js/filing.js'));
        filing = createFiling(room.cabinet, CONFIG, { reducedMotion: true });
        filing.setOpen(true);
        filing.sync(plan, new Map(ids.map((id) => [id, 'applied'])), new Set(['f4']), true);
        room.group.updateMatrixWorld(true);
    });

    test('stands clear of the calendar, the chair, the plant and the desk', () => {
        const cab = boxOf(room.picks.cabinet);
        const others = room.group.children.filter((o) => ['chair', 'plant'].includes(o.name)).map(boxOf);
        others.push(boxOf(room.picks.calendar));
        others.push(boxOf(room.group.children.find((o) => o.name === 'desk')));
        for (const other of others) expect(cab.intersectsBox(other)).toBe(false);
    });

    test.each(Object.entries(ASPECTS))('at its station on a %s screen, every drawer and its label are in view', (_name, aspect) => {
        const cam = cameraAt('cabinet', aspect);
        for (const face of room.cabinet.faces) {
            const b = boxOf(face);
            for (const corner of [b.min, b.max]) {
                const ndc = corner.clone().project(cam);
                expect(Math.abs(ndc.x)).toBeLessThan(1);
                expect(Math.abs(ndc.y)).toBeLessThan(1);
            }
        }
    });

    test.each(Object.entries(ASPECTS))('on a %s screen, a tap on a lifted folder finds that folder', (_name, aspect) => {
        const cam = cameraAt('cabinet', aspect);
        const f = filing.folder('f4');
        const target = new THREE.Vector3(f.at.x, f.at.y + CAB.folderHeight * 0.3, f.at.z);
        room.cabinet.drawers.localToWorld(target);
        const ray = new THREE.Raycaster();
        ray.set(cam.position, target.clone().sub(cam.position).normalize());
        const [hit] = ray.intersectObject(room.group, true);
        expect(pickOf(hit.object)).toBe('cabinet-folder');
        expect(filing.idAt(hit.instanceId)).toBe('f4');
    });

    test('a folder standing in its drawer can be tapped too, by its tab', () => {
        const cam = cameraAt('cabinet', 16 / 10);
        const f = filing.folder('f0');
        const target = new THREE.Vector3(f.at.x, f.at.y + CAB.folderHeight / 2 - 0.01, f.at.z);
        room.cabinet.drawers.localToWorld(target);
        const ray = new THREE.Raycaster();
        ray.set(cam.position, target.clone().sub(cam.position).normalize());
        const [hit] = ray.intersectObject(room.group, true);
        expect(pickOf(hit.object)).toBe('cabinet-folder');
        expect(filing.idAt(hit.instanceId)).toBe('f0');
    });

    test('from the desk, the cabinet can be seen and tapped', () => {
        const cam = cameraAt('desk', 16 / 10);
        const b = boxOf(room.picks.cabinet);
        // The cabinet's right-hand end, which is the part the desk can see.
        const point = new THREE.Vector3(b.max.x - 0.15, CAB.height - 0.1, b.max.z + CAB.pull - 0.01);
        expect(Math.abs(point.clone().project(cam).x)).toBeLessThan(1);
        expect(['cabinet', 'cabinet-folder']).toContain(firstPick(cam, point));
    });

    test('the cabinet grows to hold more folders than it was built for', async () => {
        const { ensureCapacity } = await import('../www/office/js/room.js');
        const before = room.cabinet.capacity;
        expect(ensureCapacity(room.cabinet, before, CONFIG)).toBe(false);
        expect(ensureCapacity(room.cabinet, before + 1, CONFIG)).toBe(true);
        expect(room.cabinet.capacity).toBe(before * 2);
        expect(room.cabinet.bodies.parent).toBe(room.cabinet.drawers);
    });
});

describe('the corkboard', () => {
    let pinboard;
    let boardMod;
    const B = CONFIG.room.board;

    beforeAll(async () => {
        boardMod = await import('../www/office/js/board.js');
        const { createPinboard } = await import('../www/office/js/pinboard.js');
        pinboard = createPinboard(room.board, CONFIG, { reducedMotion: true });
        const ids = { applied: ['c0', 'c1', 'c2'], interviewing: ['c3'], withdrawn: ['c4'] };
        const plan = boardMod.boardColumns(CONFIG).map((c) => ({ ...c, ids: ids[c.status] || [] }));
        pinboard.sync(plan, new Map());
        room.group.updateMatrixWorld(true);
    });

    const hitAt = (cam, y, z) => {
        const target = new THREE.Vector3(B.x + 0.001, y, z);
        const ray = new THREE.Raycaster();
        ray.set(cam.position, target.clone().sub(cam.position).normalize());
        const [hit] = ray.intersectObject(room.group, true);
        return hit;
    };

    test('hangs on the left wall, clear of the plant, the cabinet and the chair', () => {
        const b = boxOf(room.picks.board);
        expect(b.min.x).toBeGreaterThanOrEqual(-CONFIG.room.width / 2 - 1e-6);
        const others = room.group.children.filter((o) => ['chair', 'plant'].includes(o.name)).map(boxOf);
        others.push(boxOf(room.picks.cabinet));
        for (const other of others) expect(b.intersectsBox(other)).toBe(false);
    });

    test.each(Object.entries(ASPECTS))('at its station on a %s screen, every column’s header is in view', (_name, aspect) => {
        const cam = cameraAt('board', aspect);
        const bh = boxOf(room.board.header);
        for (const corner of [bh.min, bh.max]) {
            const ndc = corner.clone().project(cam);
            expect(Math.abs(ndc.x)).toBeLessThan(1);
            expect(Math.abs(ndc.y)).toBeLessThan(1);
        }
        // And the bottom of the board, where a long column ends.
        const bottom = new THREE.Vector3(B.x, B.y - B.height / 2, B.z).project(cam);
        expect(Math.abs(bottom.y)).toBeLessThan(1);
    });

    test.each(Object.entries(ASPECTS))('on a %s screen, a ray at a card finds that card', (_name, aspect) => {
        const cam = cameraAt('board', aspect);
        for (const id of ['c0', 'c2', 'c3', 'c4']) {
            const at = pinboard.card(id).at;
            const hit = hitAt(cam, at.y, at.z);
            expect(pickOf(hit.object)).toBe('board-card');
            expect(pinboard.idAtFace(hit.faceIndex)).toBe(id);
        }
    });

    test('the first column is on the left of the screen, and the last on the right', () => {
        const cam = cameraAt('board', 16 / 10);
        const left = new THREE.Vector3(B.x, B.y, boardMod.columnZ(0, B, 8)).project(cam);
        const right = new THREE.Vector3(B.x, B.y, boardMod.columnZ(7, B, 8)).project(cam);
        expect(left.x).toBeLessThan(right.x);
    });

    test('a card held up in front of the others is the one a tap finds', () => {
        const cam = cameraAt('board', 16 / 10);
        const under = pinboard.card('c1').at;
        pinboard.beginDrag('c4');
        pinboard.dragTo(under.y, under.z);
        room.group.updateMatrixWorld(true);
        const hit = hitAt(cam, under.y, under.z);
        expect(pinboard.idAtFace(hit.faceIndex)).toBe('c4');
        pinboard.endDrag();
    });

    test('the card mesh reuses its geometry while the count holds, and hides with no cards', async () => {
        const { setBoardQuads } = await import('../www/office/js/room.js');
        const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
        const quad = { corners: [[1, 0], [1, -0.2], [1.1, -0.2], [1.1, 0]], depth: 0.01, uvs: [[0, 0], [1, 0], [1, 1], [0, 1]] };
        const g1 = setBoardQuads(mesh, [quad, quad], CONFIG);
        expect(g1.index.count).toBe(12);
        expect(g1.attributes.position.getX(0)).toBeCloseTo(B.x + 0.01, 6);
        expect(g1.attributes.normal.getX(0)).toBe(1);
        const g2 = setBoardQuads(mesh, [quad, { ...quad, depth: 0.05 }], CONFIG);
        expect(g2).toBe(g1);
        expect(g2.attributes.position.getX(4)).toBeCloseTo(B.x + 0.05, 6);
        setBoardQuads(mesh, [], CONFIG);
        expect(mesh.visible).toBe(false);
    });

    test('a pointer ray on the cork’s plane lands in the column under it', () => {
        const cam = cameraAt('board', 16 / 10);
        const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), -B.x);
        for (let c = 0; c < 8; c++) {
            const target = new THREE.Vector3(B.x, B.y, boardMod.columnZ(c, B, 8));
            const ray = new THREE.Ray(cam.position.clone(), target.clone().sub(cam.position).normalize());
            const p = ray.intersectPlane(plane, new THREE.Vector3());
            expect(boardMod.columnAt(p.z, B, 8)).toBe(c);
        }
    });
});

describe('the mug', () => {
    test('stands clear of everything else on the desk', () => {
        const mug = room.group.children.find((o) => o.geometry && o.geometry.type === 'CylinderGeometry' && o.position.y < 1 && o.position.y > 0.75);
        expect(mug).toBeTruthy();
        const m = boxOf(mug);
        for (const key of ['computer', 'intray', 'outtray', 'lamp']) expect(m.intersectsBox(boxOf(room.picks[key]))).toBe(false);
    });
});

describe('the front wall, the departures board, the whiteboard and the printer', () => {
    const inView = (cam, object) => {
        const b = boxOf(object);
        for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
            const ndc = new THREE.Vector3(x, y, z).project(cam);
            expect(Math.abs(ndc.x)).toBeLessThan(1);
            expect(Math.abs(ndc.y)).toBeLessThan(1);
        }
    };

    test('nothing new stands in anything else', () => {
        const things = ['printer', 'whiteboard', 'board', 'cabinet', 'departures', 'wastebasket'].map((k) => [k, boxOf(room.picks[k])]);
        const plant = room.group.children.find((o) => o.name === 'plant');
        things.push(['plant', boxOf(plant)]);
        things.push(['desk', boxOf(room.group.children.find((o) => o.name === 'desk'))]);
        for (let i = 0; i < things.length; i++) {
            for (let j = i + 1; j < things.length; j++) {
                expect(`${things[i][0]} and ${things[j][0]}: ${things[i][1].intersectsBox(things[j][1])}`)
                    .toBe(`${things[i][0]} and ${things[j][0]}: false`);
            }
        }
    });

    test('the door is a real doorway in the front wall, with a door in it', () => {
        const d = CONFIG.room.door;
        const ray = new THREE.Raycaster();
        ray.set(new THREE.Vector3(d.x, 1, 0), new THREE.Vector3(0, 0, 1));
        const [hit] = ray.intersectObject(room.group, true);
        // The door itself, a little proud of the wall line, not the wall.
        expect(hit.point.z).toBeGreaterThan(CONFIG.room.depth / 2 + 0.01);
        expect(hit.point.z).toBeLessThan(CONFIG.room.depth / 2 + 0.03);
    });

    test.each(Object.entries(ASPECTS))('at its station on a %s screen, the whole departures board is in view and readable side up', (_name, aspect) => {
        const cam = cameraAt('departures', aspect);
        inView(cam, room.departures);
        // Its first column is on the screen's left.
        const b = CONFIG.room.departures;
        const left = new THREE.Vector3(b.x - b.width / 2, b.y, CONFIG.room.depth / 2 - 0.06).project(cam);
        const leftOfFace = new THREE.Vector3(0, 0, 0);
        room.departures.localToWorld(leftOfFace.set(-b.width / 2, 0, 0));
        expect(leftOfFace.clone().project(cam).x).toBeLessThan(0);
        expect(left).toBeTruthy();
    });

    test.each(Object.entries(ASPECTS))('at its station on a %s screen, the whole whiteboard is in view', (_name, aspect) => {
        inView(cameraAt('whiteboard', aspect), room.whiteboard);
    });

    test('a tap on the drawn goal line is recognized from the ray’s uv', async () => {
        const wb = await import('../www/office/js/whiteboard.js');
        const { emptyDoc } = await import('../www/office/js/store.js');
        const model = wb.boardModel(emptyDoc(CONFIG, new Date(2026, 8, 24)), CONFIG, new Date(2026, 8, 24));
        const chart = wb.weekChart(model);
        const w = CONFIG.room.whiteboard;
        const cam = cameraAt('whiteboard', 16 / 10);
        const tap = (fx, fy) => {
            const p = new THREE.Vector3((fx - 0.5) * w.width, (0.5 - fy) * w.height, 0);
            room.whiteboard.localToWorld(p);
            const ray = new THREE.Raycaster();
            ray.set(cam.position, p.clone().sub(cam.position).normalize());
            const [hit] = ray.intersectObject(room.group, true);
            expect(pickOf(hit.object)).toBe('whiteboard');
            return wb.onGoalLine(hit.uv, model);
        };
        expect(tap((chart.x0 + chart.x1) / 2, chart.goalY)).toBe(true);
        expect(tap((chart.x0 + chart.x1) / 2, chart.goalY + 0.15)).toBe(false);
        expect(tap(0.2, 0.5)).toBe(false);
        // The board's right runs to the screen's right: u grows with it.
        const u = (fx) => {
            const p = new THREE.Vector3((fx - 0.5) * w.width, 0, 0);
            room.whiteboard.localToWorld(p);
            return p.clone().project(cam).x;
        };
        expect(u(0.9)).toBeGreaterThan(u(0.1));
    });
});
