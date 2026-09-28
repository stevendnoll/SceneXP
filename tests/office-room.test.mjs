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

const TAPPABLE = ['computer', 'wastebasket', 'lamp', 'printer'];
const ASPECTS = { 'wide 21:9': 21 / 9, 'laptop 16:10': 16 / 10, 'phone upright': 390 / 844, 'tall phone': 9 / 19.5 };

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

    test('the wastebasket shows crumpled pages only when something is in it, more as it fills (QA, 2026-09-28)', () => {
        const { setWaste, wastePages, WASTE_PAGES } = roomMod;
        const pages = room.waste.pages;
        expect(pages).toHaveLength(WASTE_PAGES.length);
        // Built empty, and inside the basket, not floating over it.
        expect(pages.every((p) => p.visible === false)).toBe(true);
        for (const p of pages) expect(room.picks.wastebasket.children).toContain(p);
        expect([0, 1, 2, 3, 5, 6, 40].map(wastePages)).toEqual([0, 1, 1, 2, 2, 3, 3]);
        expect(wastePages(undefined)).toBe(0);
        expect(setWaste(room.waste, 4)).toBe(2);
        expect(pages.map((p) => p.visible)).toEqual([true, true, false]);
        expect(setWaste(room.waste, 0)).toBe(0);
        expect(pages.every((p) => p.visible === false)).toBe(true);
        // Each page sits in the basket: its top under the rim plus a little.
        const box = new THREE.Box3();
        for (const p of pages) {
            box.setFromObject(p);
            expect(box.min.y).toBeGreaterThan(0.15);
            expect(box.max.y).toBeLessThan(0.4);
        }
    });

    test('paper and the whiteboard take the room’s light; only the screens glow (QA, 2026-09-29)', () => {
        // Unlit, the cabinet's label cards, the corkboard's header and the
        // whiteboard shone white in the dark office.
        const unlit = [];
        room.group.traverse((o) => {
            if (o.isMesh && o.material && o.material.isMeshBasicMaterial && o.material.visible !== false) unlit.push(o);
        });
        const glowing = unlit.filter((o) => !['contact-shadows', 'rain-glass', 'mirror-back', 'mirror-right'].includes(o.name));
        for (const o of glowing) {
            let key = null;
            for (let p = o; p && !key; p = p.parent) key = (p.userData && p.userData.pick) || null;
            // The monitor's face and the printer's light are lights; nothing
            // else.
            const isScreen = o === room.screen;
            const isLed = key === 'printer' && boxOf(o).max.x - boxOf(o).min.x < 0.03;
            expect({ name: o.name, key, ok: isScreen || isLed }).toEqual({ name: o.name, key, ok: true });
        }
        expect(glowing).toContain(room.screen);
    });

    test('pickOf finds the tappable thing from any part of it, and nothing from a wall', () => {
        const part = room.picks.lamp.children[2];
        expect(pickOf(part)).toBe('lamp');
        expect(pickOf(room.group.children[0])).toBeNull();
        expect(pickOf(null)).toBeNull();
    });

    test('what stands on the desk rests on its top, and the wastebasket on the floor', () => {
        const top = CONFIG.room.desk.height;
        for (const key of ['computer', 'lamp', 'folder']) {
            room.picks.folder.visible = true;
            expect(boxOf(room.picks[key]).min.y).toBeCloseTo(top, 2);
        }
        room.picks.folder.visible = false;
        expect(boxOf(room.picks.wastebasket).min.y).toBeCloseTo(0, 2);
    });

    test('no letter trays on the desk (QA, 2026-09-29)', () => {
        expect(room.picks.intray).toBeUndefined();
        expect(room.picks.outtray).toBeUndefined();
        expect(roomMod.TRAY_RISE).toBeUndefined();
    });

    test('the lamp is a slim aluminum LED lamp: a post, a head reaching over the desk, a warm strip of light under it (QA, 2026-09-29)', () => {
        const lamp = room.picks.lamp;
        const { LAMP } = roomMod;
        const top = CONFIG.room.desk.height;
        // Slim: its post a pencil's width, its whole height a hand over the
        // monitor's foot and no more.
        const post = lamp.children.find((c) => c.geometry && c.geometry.type === 'CylinderGeometry' && c.geometry.parameters.height === LAMP.post);
        expect(post.geometry.parameters.radiusTop).toBeLessThan(0.01);
        const b = boxOf(lamp);
        expect(b.max.y - top).toBeLessThan(0.4);
        // Aluminum, no brass nor green glass left.
        lamp.traverse((o) => {
            if (!o.isMesh || !o.material.visible) return;
            const c = o.material.color;
            expect(c.g > c.r * 1.5).toBe(false);
        });
        // The head reaches forward (toward the visitor, +z) over the desk,
        // the light strip under it facing down, the light itself under it.
        const glow = room.lamp.glow;
        const strip = boxOf(glow);
        expect(strip.max.z - strip.min.z).toBeGreaterThan(0.2);
        expect(boxOf(post).max.y).toBeGreaterThan(strip.max.y - 0.03);
        expect(room.lamp.light.position.y).toBeLessThan(strip.min.y);
        expect(room.lamp.light.position.z).toBeGreaterThan(strip.min.z);
        expect(room.lamp.light.position.z).toBeLessThan(strip.max.z);
        // Switched off, the strip stops glowing, and back on.
        setLamp(room.lamp, false);
        expect(glow.material.emissiveIntensity).toBe(0);
        setLamp(room.lamp, true);
        expect(glow.material.emissiveIntensity).toBe(roomMod.LAMP_GLOW);
    });

    test('the Rolodex is gone from the desk (QA, 2026-09-25)', () => {
        expect(room.picks.rolodex).toBeUndefined();
        expect(room.group.getObjectByName('rolodex')).toBeUndefined();
    });

    test('everything on the desk fits on the desk', () => {
        const d = CONFIG.room.desk;
        for (const key of ['computer', 'lamp']) {
            const b = boxOf(room.picks[key]);
            expect(b.min.x).toBeGreaterThanOrEqual(d.x - d.width / 2 - 1e-6);
            expect(b.max.x).toBeLessThanOrEqual(d.x + d.width / 2 + 1e-6);
            expect(b.min.z).toBeGreaterThanOrEqual(d.z - d.depth / 2 - 1e-6);
            expect(b.max.z).toBeLessThanOrEqual(d.z + d.depth / 2 + 1e-6);
        }
    });

    test('the lamp switches, and the glass inside its shade dims with it', () => {
        setLamp(room.lamp, false);
        expect(room.lamp.light.visible).toBe(false);
        expect(room.lamp.glow.material.emissiveIntensity).toBe(0);
        setLamp(room.lamp, true);
        expect(room.lamp.light.visible).toBe(true);
        expect(room.lamp.glow.material.emissiveIntensity).toBe(roomMod.LAMP_GLOW);
    });

    test('no bulb hangs under the lamp’s shade, and no cup stands on the desk (QA, 2026-09-25)', () => {
        // The only ball on the lamp is the pull chain's bead (and the
        // finial on top): nothing the size of a bulb.
        const balls = [];
        room.picks.lamp.traverse((o) => {
            if (o.geometry && o.geometry.type === 'SphereGeometry') balls.push(o.geometry.parameters.radius);
        });
        expect(Math.max(...balls)).toBeLessThan(0.015);
        expect(room.lamp.bulb).toBeUndefined();
        // Nothing stands loose on the desk top: everything there is one of
        // the tappable things.
        const top = CONFIG.room.desk.height;
        const loose = room.group.children.filter((o) => o.isMesh && !o.userData.pick && o.name !== 'shell'
            && Math.abs(boxOf(o).min.y - top) < 0.01);
        expect(loose).toEqual([]);
    });
});

describe('the desk: white and aluminum (QA, 2026-09-29)', () => {
    let furnished;
    beforeAll(() => {
        const tex = () => new THREE.Texture();
        furnished = buildRoom(CONFIG, { leather: { map: tex(), normalMap: tex(), roughnessMap: tex() } });
        furnished.group.updateMatrixWorld(true);
    });
    const deskOf = (r) => r.group.getObjectByName('desk');
    const d = CONFIG.room.desk;
    const x0 = d.x - d.width / 2;
    const x1 = d.x + d.width / 2;
    const top = d.height;
    const aluminumIn = (o) => {
        const out = [];
        o.traverse((m) => { if (m.isMesh && m.material.metalness === 1 && m.material.color.getHex() === 0xc8cbcf) out.push(m); });
        return out;
    };

    test('a slim white slab on two brushed aluminum sled frames, a floating drawer, no hardware', () => {
        const { DESK } = roomMod;
        const desk = deskOf(room);
        const slab = desk.children[0];
        expect(slab.material.name).toBe('white-top');
        expect(boxOf(slab).max.y - boxOf(slab).min.y).toBeCloseTo(DESK.top, 4);
        expect(boxOf(slab).max.x - boxOf(slab).min.x).toBeCloseTo(d.width, 4);
        // Two frames of four bars each, and the beam between them.
        const aluminum = aluminumIn(desk);
        expect(aluminum).toHaveLength(9);
        expect(aluminum[0].material.anisotropy).toBeGreaterThan(0);
        for (const bar of aluminum) {
            const b = boxOf(bar);
            expect(b.min.y).toBeGreaterThanOrEqual(-1e-6);
            expect(b.max.y).toBeLessThanOrEqual(top - DESK.top + 1e-6);
        }
        // The frames stand in from the ends, on the floor.
        const feet = aluminum.filter((m) => boxOf(m).min.y < 1e-6);
        expect(feet.length).toBeGreaterThanOrEqual(2);
        for (const f of feet) {
            expect(boxOf(f).min.x).toBeGreaterThan(x0 + 0.05);
            expect(boxOf(f).max.x).toBeLessThan(x1 - 0.05);
        }
        // The drawer floats under the top: white, a gap over it, nothing on it.
        const drawer = desk.children.find((m) => m.material && m.material.name === 'white');
        expect(boxOf(drawer).max.y).toBeCloseTo(top - DESK.top - DESK.drawer.gap, 4);
        // Nothing on the desk of wood, brass or walnut.
        desk.traverse((m) => { if (m.isMesh) expect(/walnut/.test(m.material.name)).toBe(false); });
    });

    test('a stitched graphite leather pad under the keyboard, and the folder lies on it', () => {
        const pad = deskOf(furnished).getObjectByName('desk-pad');
        const b = boxOf(pad);
        expect(b.min.y).toBeCloseTo(top, 4);
        expect(b.max.y).toBeCloseTo(top + roomMod.DESK.pad.thick, 4);
        expect(b.min.x).toBeGreaterThan(x0);
        expect(b.max.x).toBeLessThan(x1);
        expect(pad.material.sheen).toBeGreaterThan(0);
        expect(pad.material.map).toBeTruthy();
        const uv = pad.geometry.attributes.uv;
        let lo = Infinity;
        let hi = -Infinity;
        for (let i = 0; i < uv.count; i++) { lo = Math.min(lo, uv.getX(i)); hi = Math.max(hi, uv.getX(i)); }
        expect(lo).toBeCloseTo(0, 3);
        expect(hi).toBeCloseTo(1, 3);
        // The keyboard (silver) stands on it, and so does the open folder.
        const keyboard = furnished.picks.computer.children.find((m) => m.material && m.material.color && m.material.color.getHex() === 0xd6d8db);
        expect(boxOf(keyboard).min.y).toBeCloseTo(b.max.y, 4);
        furnished.picks.folder.visible = true;
        expect(boxOf(furnished.picks.folder).min.y).toBeCloseTo(b.max.y, 4);
        furnished.picks.folder.visible = false;
        // Without the painted maps (a test, no WebGL2), a plain graphite.
        const plain = deskOf(room).getObjectByName('desk-pad');
        expect(plain.material.map).toBeNull();
        expect(plain.material.color.getHex()).toBe(0x2e3034);
    });
});

describe('the credenza, the printer and the trays, in white and aluminum (QA, 2026-09-29)', () => {
    const named = (o, name) => {
        const out = [];
        o.traverse((m) => { if (m.isMesh && m.material.name === name) out.push(m); });
        return out;
    };
    const metals = (o) => {
        const out = [];
        o.traverse((m) => { if (m.isMesh && m.material.metalness >= 0.8) out.push(m); });
        return out;
    };

    test('the credenza: white, flush fronts with no hardware, labels printed on them, on an aluminum kick', () => {
        const c = CONFIG.room.cabinet;
        const { drawers, faces } = room.cabinet;
        const fronts = named(drawers, 'white');
        expect(fronts).toHaveLength(c.drawers);
        // No pulls nor holders: nothing metal on the drawers.
        expect(metals(drawers)).toEqual([]);
        // Gaps between the fronts (they read dark, over the dark lining).
        const xs = fronts.map((m) => boxOf(m)).sort((p, q) => p.min.x - q.min.x);
        for (let i = 1; i < xs.length; i++) expect(xs[i].min.x - xs[i - 1].max.x).toBeGreaterThan(0.01);
        // Each label on its front.
        for (const face of faces) {
            const front = fronts.find((m) => Math.abs(m.position.x - face.position.x) < 1e-6);
            expect(front).toBeTruthy();
            expect(face.position.z).toBeGreaterThan(boxOf(front).max.z - c.z);
        }
        // The kick: aluminum, set back under the white body.
        const kick = metals(room.picks.cabinet).find((m) => boxOf(m).min.y < 1e-6);
        const body = boxOf(named(room.picks.cabinet, 'white').find((m) => boxOf(m).min.y > 0.01 && boxOf(m).max.y <= c.floor + 1e-6));
        expect(boxOf(kick).max.z).toBeLessThan(body.max.z - 0.02);
    });

    test('the printer: white with a dark glass lid, on a flush white cabinet on an aluminum kick, its light still lit', () => {
        const printer = room.picks.printer;
        expect(named(printer, 'white').length).toBe(2);
        const lid = printer.children.find((m) => m.material && m.material.clearcoat === 1);
        expect(lid.material.color.getHex()).toBe(0x1d1f22);
        expect(metals(printer).length).toBeGreaterThanOrEqual(2);
        const led = printer.children.filter((m) => m.material && m.material.isMeshBasicMaterial && m.material.visible !== false);
        expect(led).toHaveLength(1);
    });


});

describe('the ceiling and the walls (QA, 2026-09-29)', () => {
    test('exposed concrete, a panel a tile, a white soffit round the windows, and two slim pendants hung under it', () => {
        const tex = new THREE.Texture();
        const withConcrete = buildRoom(CONFIG, { concrete: tex });
        const { width, depth, height } = CONFIG.room;
        expect(tex.repeat.x).toBeCloseTo(width / roomMod.CONCRETE_PANEL[0], 9);
        expect(tex.repeat.y).toBeCloseTo(depth / roomMod.CONCRETE_PANEL[1], 9);
        expect(tex.wrapS).toBe(THREE.RepeatWrapping);
        let concrete = null;
        withConcrete.group.traverse((o) => { if (o.isMesh && o.material.map === tex) concrete = o; });
        expect(concrete).toBeTruthy();
        // Without a painted map (a test), a plain concrete gray.
        let plain = false;
        room.group.traverse((o) => { if (o.isMesh && o.material.color && o.material.color.getHex() === 0xb9b8b3) plain = true; });
        expect(plain).toBe(true);
        // The pendants: under the concrete, over the window's head, clear of
        // the desk's view (the tappable things stay in the frame, tested
        // below), each on two fine cables.
        const pendants = room.group.getObjectByName('pendants');
        const { CEILING } = roomMod;
        const b = boxOf(pendants);
        expect(b.max.y).toBeLessThanOrEqual(height + 1e-6);
        expect(b.min.y).toBeGreaterThan(windowsOf(CONFIG).head - 0.5);
        expect(b.min.y).toBeGreaterThan(CONFIG.room.desk.height + 1.2);
        const cables = pendants.children.filter((m) => m.geometry.type === 'CylinderGeometry');
        expect(cables).toHaveLength(2 * CEILING.pendants.length);
    });

    test('the corner piers are the frames’ dark bronze, and the walls meet the floor in a shadow gap', () => {
        // Between the windows, dark: the glass reads as one curtain wall.
        const hw = CONFIG.room.width / 2;
        const hd = CONFIG.room.depth / 2;
        const w = windowsOf(CONFIG);
        const hits = new THREE.Raycaster(new THREE.Vector3(hw - 0.3, (w.sill + w.head) / 2, -hd + 0.3), new THREE.Vector3(1, 0, -1).normalize())
            .intersectObject(room.group, true);
        const pier = hits.find((h) => h.object.name === 'shell');
        expect(pier.object.material.color.getHex()).toBe(0x3a3936);
        // At the foot of the left wall, a slim dark reveal.
        const [foot] = new THREE.Raycaster(new THREE.Vector3(-hw + 0.5, 0.012, 1), new THREE.Vector3(-1, 0, 0)).intersectObject(room.group, true);
        expect(foot.object.material.color.getHex()).toBe(0x16171a);
        const [above] = new THREE.Raycaster(new THREE.Vector3(-hw + 0.5, 0.2, 1), new THREE.Vector3(-1, 0, 0)).intersectObject(room.group, true);
        expect(above.object.material.color.getHex()).toBe(0xf3f2ef);
    });

    test('the printer cabinet’s drawers face the room: its reveals run across its front, not up it', () => {
        const printer = room.picks.printer;
        const reveals = printer.children.filter((m) => m.material && m.material.color && m.material.color.getHex() === 0x16171a);
        expect(reveals).toHaveLength(roomMod.PRINTER_DRAWERS.length);
        for (const r of reveals) {
            const b = boxOf(r);
            expect(b.max.x - b.min.x).toBeGreaterThan(0.4);
            expect(b.max.y - b.min.y).toBeLessThan(0.01);
            // On the cabinet's front (0.22 m from its middle), toward the room (+z).
            expect(b.max.z - printer.position.z).toBeGreaterThan(0.21);
        }
    });
});

describe.each(Object.entries(ASPECTS))('from the desk, on a %s screen', (_name, aspect) => {
    test.each(TAPPABLE)('the %s is in the frame and nothing stands in front of it', (key) => {
        const cam = cameraAt('desk', aspect);
        const center = boxOf(room.picks[key]).getCenter(new THREE.Vector3());
        const ndc = center.clone().project(cam);
        expect(Math.abs(ndc.x)).toBeLessThan(0.95);
        expect(Math.abs(ndc.y)).toBeLessThan(0.95);
        expect(ndc.z).toBeLessThan(1);
        expect(firstPick(cam, center)).toBe(key);
    });

    test('the window is an opening: nothing of the room stands in any pane the eye sees', () => {
        const cam = cameraAt('desk', aspect);
        const w = windowsOf(CONFIG);
        // The middle of each pane between the mullions. The city beyond is
        // world.js's own scene, so a ray through the glass meets nothing of
        // the room's at all.
        const edges = [w.back.x0, ...w.back.mullions, w.back.x1];
        let seen = 0;
        for (let i = 0; i < edges.length - 1; i++) {
            const through = new THREE.Vector3((edges[i] + edges[i + 1]) / 2, (w.sill + w.head) / 2, -CONFIG.room.depth / 2);
            const ndc = through.clone().project(cam);
            if (Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1) continue;
            seen++;
            const ray = new THREE.Raycaster();
            ray.set(cam.position, through.clone().sub(cam.position).normalize());
            expect(ray.intersectObject(room.group, true)).toEqual([]);
        }
        expect(seen).toBeGreaterThanOrEqual(2);
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
        // Seen from the desk station, much of the seat shows, not only the
        // back of the chair (an armrest crosses some of it, as it would).
        const cam = cameraAt('desk', 16 / 10);
        const { seat } = roomMod.CHAIR;
        let seen = 0;
        let asked = 0;
        for (let x = -0.18; x <= 0.18; x += 0.06) {
            for (let z = -0.18; z <= 0.18; z += 0.06) {
                asked++;
                const onSeat = chair.localToWorld(new THREE.Vector3(x, seat.top - 0.01, z));
                const hit = new THREE.Raycaster(cam.position, onSeat.clone().sub(cam.position).normalize()).intersectObject(room.group, true)[0];
                let o = hit.object;
                while (o && o !== chair) o = o.parent;
                if (o === chair && hit.point.y > seat.top - 0.07 && hit.point.y < seat.top + 0.01) seen++;
            }
        }
        expect(seen / asked).toBeGreaterThan(0.4);
    });

    test('an executive chair in pale gray leather: stitched channels, a high reclined back, padded arms, polished aluminum (QA, 2026-09-29)', () => {
        const chair = room.group.getObjectByName('chair');
        const { seat, back, arm } = roomMod.CHAIR;
        const leather = [];
        const polished = [];
        chair.traverse((o) => {
            if (!o.isMesh) return;
            if (o.material.color.getHex() === 0xc2beb8) leather.push(o);
            if (o.material.metalness === 1) polished.push(o);
        });
        // The channels (seat and back) and the two arm pads.
        expect(leather).toHaveLength(seat.channels + back.channels + 2);
        expect(leather[0].material.sheen).toBeGreaterThan(0);
        // A high back: its top well over the desk, under the window's head.
        const top = boxOf(chair).max.y;
        expect(top).toBeGreaterThan(CONFIG.room.desk.height + 0.35);
        expect(top).toBeLessThan(1.3);
        // Reclined: the back's top stands behind its foot (the seat faces -z).
        const backrest = chair.children.find((c) => c.isGroup && c.rotation.x === back.recline);
        expect(backrest).toBeTruthy();
        const foot = chair.worldToLocal(backrest.localToWorld(new THREE.Vector3(0, 0, 0)));
        const head = chair.worldToLocal(backrest.localToWorld(new THREE.Vector3(0, back.height, 0)));
        expect(head.z - foot.z).toBeGreaterThan(0.05);
        // The arms at their height, either side of the seat.
        const pads = leather.filter((m) => Math.abs(boxOf(m).max.y - (arm.top + 0.0175)) < 0.01);
        expect(pads).toHaveLength(2);
        // Polished aluminum: the legs, the arms, the column and its hub.
        expect(polished.length).toBeGreaterThanOrEqual(roomMod.CHAIR_LEGS.count + 4);
        expect(polished[0].material.roughness).toBeLessThan(0.25);
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

describe('the back window and the sticky notes', () => {
    const showNotes = (n) => {
        setNotes(room.notes, n, (i) => notesMod.quadCorners(notesMod.NOTE_SLOTS[i]), (i) => notesMod.cellUvs(i));
        room.group.updateMatrixWorld(true);
    };

    afterEach(() => showNotes(0));

    test('the back wall is window from corner to corner, over everything that stands against it (QA, 2026-09-25)', () => {
        const w = windowsOf(CONFIG);
        const hw = CONFIG.room.width / 2;
        // A corner pier each end, as at the right-hand corner.
        expect(w.back.x0).toBeCloseTo(-hw + 0.1, 9);
        expect(w.back.x1).toBeCloseTo(hw - 0.1, 9);
        // Floor to ceiling (QA, 2026-09-28): a ledge a hand high, the head
        // just under the ceiling, and the cabinet and the printer standing
        // in front of the glass, clear of it.
        expect(w.sill).toBeLessThanOrEqual(0.15);
        expect(w.head).toBeGreaterThan(CONFIG.room.height - 0.2);
        expect(w.head).toBeLessThan(CONFIG.room.height);
        for (const key of ['cabinet', 'printer', 'wastebasket']) {
            expect(boxOf(room.picks[key]).min.z).toBeGreaterThan(-CONFIG.room.depth / 2 + 0.02);
        }
        // Mullions at a curtain wall's even module, none behind the monitor.
        const edges = [w.back.x0, ...w.back.mullions, w.back.x1];
        for (let i = 1; i < edges.length; i++) {
            expect(edges[i] - edges[i - 1]).toBeGreaterThan(1.3);
            expect(edges[i] - edges[i - 1]).toBeLessThan(1.6);
        }
        const monitor = boxOf(room.picks.computer);
        for (const x of w.back.mullions) expect(x < monitor.min.x || x > monitor.max.x).toBe(true);
        // And no wall calendar: the calendar is a card from Places.
        expect(room.picks.calendar).toBeUndefined();
        expect(room.calendar).toBeUndefined();
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

    test('stands clear of the chair, the plant and the desk', () => {
        const cab = boxOf(room.picks.cabinet);
        const others = room.group.children.filter((o) => ['chair', 'plant'].includes(o.name)).map(boxOf);
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

describe('the front wall, the whiteboard and the printer', () => {
    const inView = (cam, object) => {
        const b = boxOf(object);
        for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
            const ndc = new THREE.Vector3(x, y, z).project(cam);
            expect(Math.abs(ndc.x)).toBeLessThan(1);
            expect(Math.abs(ndc.y)).toBeLessThan(1);
        }
    };

    test('nothing new stands in anything else', () => {
        const things = ['printer', 'whiteboard', 'board', 'cabinet', 'wastebasket'].map((k) => [k, boxOf(room.picks[k])]);
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
