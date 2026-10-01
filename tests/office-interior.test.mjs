// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Corner Office's light inside (interior.js, and room.js's part in it),
 * measured against the REAL three.js in node:vm: the sun coming in by the
 * windows and only by them, the room the shiny things reflect, the glass
 * as a mirror by night, the soft dark where things touch down, and the
 * rounded edges (QA, 2026-09-25: "anything we can do to make the scene
 * look even more realistic?").
 */
import { CONFIG } from '../www/office/js/config.js';
import { skyAt } from '../www/office/js/sky.js';
import { lightAt, lighting } from '../www/office/js/daylight.js';
import { weathered } from '../www/office/js/weather.js';
import { loadRealThree } from './helpers/real-three.mjs';

let THREE;
let roomMod;
let interior;
let room;

beforeAll(async () => {
    THREE = await loadRealThree();
    globalThis.THREE = THREE;
    roomMod = await import('../www/office/js/room.js');
    interior = await import('../www/office/js/interior.js');
    room = roomMod.buildRoom(CONFIG);
    room.group.updateMatrixWorld(true);
});

afterAll(() => {
    delete globalThis.THREE;
});

const at = (h, m = 0) => new Date(2026, 8, 25, h, m);
const lookAt = (date, weather = { overcast: 0, rain: 0 }) => weathered(lighting(lightAt(date)), weather);
const boxOf = (o) => new THREE.Box3().setFromObject(o);

/** Of points on the floor (and the desk), those the sun reaches: a ray
 *  from the point toward the sun meets nothing that casts a shadow. */
function sunlit(sunDir, points) {
    const casters = [];
    room.group.traverse((o) => { if (o.isMesh && o.castShadow) casters.push(o); });
    const dir = new THREE.Vector3(...sunDir).normalize();
    return points.filter((p) => new THREE.Raycaster(new THREE.Vector3(...p), dir, 0.002, 50).intersectObjects(casters, false).length === 0);
}

function floorPoints() {
    const { width, depth } = CONFIG.room;
    const out = [];
    for (let x = -width / 2 + 0.1; x < width / 2; x += 0.2) for (let z = -depth / 2 + 0.1; z < depth / 2; z += 0.2) out.push([x, 0.01, z]);
    return out;
}

describe('the sun comes in by the windows, and only by them', () => {
    test('its beam: nothing below the horizon, rising over the first degrees, dimmed by a gray sky', () => {
        const noon = skyAt(at(12));
        const beam = interior.sunbeam(noon, lookAt(at(12)));
        expect(beam.intensity).toBeCloseTo(interior.SUNBEAM.strength, 6);
        expect(beam.dir).toBe(noon.sun);
        expect(interior.sunbeam(skyAt(at(23)), lookAt(at(23))).intensity).toBe(0);
        const low = { ...noon, sunHeight: (interior.SUNBEAM.riseDegrees / 2) * (Math.PI / 180) };
        expect(interior.sunbeam(low, lookAt(at(12))).intensity).toBeCloseTo(interior.SUNBEAM.strength / 2, 6);
        expect(interior.sunbeam(noon, lookAt(at(12), { overcast: 1, rain: 1 })).intensity).toBe(0);
    });

    test('in the afternoon it streams in through the west glass onto the floor', () => {
        const sky = skyAt(at(16));
        expect(sky.sunHeight).toBeGreaterThan(0);
        const lit = sunlit(sky.sun, floorPoints());
        expect(lit.length).toBeGreaterThan(10);
        // Every lit patch is lit THROUGH a window: the ray to the sun
        // leaves the room by the west (back, -z) window's opening.
        const w = roomMod.windowsOf(CONFIG);
        const dir = new THREE.Vector3(...sky.sun).normalize();
        for (const p of lit) {
            const t = (-CONFIG.room.depth / 2 - p[2]) / dir.z;
            expect(t).toBeGreaterThan(0);
            const y = p[1] + dir.y * t;
            const x = p[0] + dir.x * t;
            expect(y).toBeGreaterThan(w.sill - 0.01);
            expect(y).toBeLessThan(w.head + 0.01);
            expect(x).toBeGreaterThan(w.back.x0 - 0.01);
            expect(x).toBeLessThan(w.back.x1 + 0.01);
        }
    });

    test('and never in the morning or at noon, when the sun is behind the building', () => {
        for (const h of [9, 12]) {
            const sky = skyAt(at(h));
            expect(sky.sunHeight).toBeGreaterThan(0);
            expect(sunlit(sky.sun, floorPoints())).toEqual([]);
        }
    });

    test('the desk casts its shadow: where its top’s shadow falls stays dark while the floor beside it is lit', () => {
        // With the glass down to the floor (QA, 2026-09-28) the low sun
        // reaches in under the desk from behind, as it would, so the shadow
        // is where the top blocks it: the top's middle, cast along the sun
        // to the floor.
        const sky = skyAt(at(16));
        const d = CONFIG.room.desk;
        const [sx, sy, sz] = sky.sun;
        const k = d.height / sy;
        const shade = [d.x - sx * k, 0.01, d.z - sz * k];
        expect(shade[2]).toBeLessThan(CONFIG.room.depth / 2);
        expect(sunlit(sky.sun, [shade])).toEqual([]);
        // Round it, within a meter, the sun is on the floor.
        const near = floorPoints().filter(([x, , z]) => Math.hypot(x - shade[0], z - shade[2]) < 1);
        expect(sunlit(sky.sun, near).length).toBeGreaterThan(3);
    });

    test('every solid thing casts a shadow, walls and ceiling too; what is see-through or painted flat casts none', () => {
        const shell = room.group.children.filter((o) => o.name === 'shell');
        expect(shell.length).toBeGreaterThan(2);
        for (const m of shell) expect(m.castShadow).toBe(true);
        for (const key of ['computer', 'lamp', 'printer', 'cabinet']) {
            let casts = 0;
            room.picks[key].traverse((o) => { if (o.isMesh && o.castShadow) casts++; });
            expect(casts).toBeGreaterThan(0);
        }
        const none = ['contact-shadows', 'mirror-back', 'mirror-right', 'rain-glass', 'notes', 'board-cards', 'lamp-hit'];
        room.group.traverse((o) => { if (o.isMesh && none.includes(o.name)) expect(o.castShadow).toBe(false); });
    });
});

describe('the shiny things reflect a room', () => {
    test('the brass, the steel and the desk’s lacquer are listed to be given the room; the walls are not', () => {
        const colors = room.shiny.map((m) => m.color.getHex());
        expect(room.shiny.some((m) => m.clearcoat > 0)).toBe(true);
        expect(room.shiny.some((m) => m.metalness > 0.8)).toBe(true);
        expect(colors).not.toContain(0xe9e0d0);
        for (const m of room.shiny) expect(m.isMeshStandardMaterial).toBe(true);
    });

    test('the room they see: windows bright by day and dark by night, and the lamp only while it is on', () => {
        const env = interior.interiorEnvironment(CONFIG, roomMod.windowsOf(CONFIG), [0.9, 1.05, -2.05]);
        const lum = (c) => c.r + c.g + c.b;
        env.set(lookAt(at(13)), false);
        const daySky = lum(env.parts.sky.color);
        const dayWall = lum(env.parts.faces.wall.color);
        expect(env.parts.lamp.visible).toBe(false);
        env.set(lookAt(at(23)), true);
        expect(lum(env.parts.sky.color)).toBeLessThan(daySky / 4);
        expect(env.parts.lamp.visible).toBe(true);
        // By day the windows outshine the walls, as they light the room.
        expect(daySky).toBeGreaterThan(dayWall * 3);
        // Seen from over the desk: the scene is shifted so that point is the
        // capture's origin.
        expect(env.scene.position.toArray()).toEqual([-0.9, -1.05, 2.05]);
    });
});

describe('the glass is a mirror by night', () => {
    const eyeAt = (station) => {
        const s = CONFIG.stations[station];
        const cam = new THREE.PerspectiveCamera(s.fov, 16 / 10, 0.05, 60);
        cam.position.set(...s.eye);
        cam.lookAt(new THREE.Vector3(...s.aim));
        cam.updateMatrixWorld(true);
        cam.updateProjectionMatrix();
        return cam;
    };

    test('only by night, and only as the city outside goes darker than the room', () => {
        expect(interior.mirrorLevel(lookAt(at(13)))).toBe(0);
        expect(interior.mirrorLevel(lookAt(at(23)))).toBeCloseTo(interior.MIRROR.strength, 6);
        room.reflections.set(0.3);
        // No picture yet (main.js draws one): nothing to show.
        for (const p of room.reflections.panes) expect(p.mesh.visible).toBe(false);
        room.reflections.panes[0].mesh.material.map = new THREE.Texture();
        room.reflections.set(0.3);
        expect(room.reflections.panes[0].mesh.visible).toBe(true);
        expect(room.reflections.panes[0].mesh.material.opacity).toBe(0.3);
        room.reflections.set(0);
        expect(room.reflections.panes[0].mesh.visible).toBe(false);
        room.reflections.panes[0].mesh.material.map = null;
        // Added onto the city behind, and never in a tap's way.
        expect(room.reflections.panes[0].mesh.material.blending).toBe(THREE.AdditiveBlending);
        expect(new THREE.Raycaster(new THREE.Vector3(1, 1.7, 0), new THREE.Vector3(0, 0, -1)).intersectObject(room.reflections.panes[0].mesh)).toEqual([]);
    });

    test.each([['desk', 0], ['desk', 1], ['window', 1]])('from the %s, each point of the room shows in the %s pane just where its reflection is', (station, which) => {
        const cam = eyeAt(station);
        const pane = room.reflections.panes[which];
        const mirrorCam = new THREE.PerspectiveCamera();
        expect(interior.mirrorCamera(cam, pane, mirrorCam)).toBe(true);
        const n = new THREE.Vector3(...pane.normal);
        const p0 = new THREE.Vector3(...pane.point);
        const mirror = (v) => v.clone().sub(n.clone().multiplyScalar(2 * v.clone().sub(p0).dot(n)));
        // The mirror camera stands at the eye's reflection.
        expect(mirrorCam.position.distanceTo(mirror(cam.position))).toBeLessThan(1e-9);
        // For points round the room: where the eye sees one reflected (the
        // line to its mirror image crosses the glass there), the mirror
        // camera sees that very point along the same line.
        for (const P of [[-2.5, 1.5, 2.2], [0.3, 2.4, 2.4], [-2.9, 1.6, -1], [1.7, 0.4, 1.0]]) {
            const point = new THREE.Vector3(...P);
            const image = mirror(point);
            const dir = image.clone().sub(cam.position);
            const t = p0.clone().sub(cam.position).dot(n) / dir.dot(n);
            const onGlass = cam.position.clone().add(dir.multiplyScalar(t));
            const a = onGlass.clone().project(mirrorCam);
            const b = point.clone().project(mirrorCam);
            expect(a.x).toBeCloseTo(b.x, 6);
            expect(a.y).toBeCloseTo(b.y, 6);
        }
        // And the pane's grid takes its places in the picture from there.
        const uv = interior.layMirror(pane.mesh, mirrorCam);
        const v = new THREE.Vector3().fromBufferAttribute(pane.mesh.geometry.attributes.position, 7).applyMatrix4(pane.mesh.matrixWorld).project(mirrorCam);
        expect(uv.getX(7)).toBeCloseTo((v.x + 1) / 2, 6);
        expect(uv.getY(7)).toBeCloseTo((v.y + 1) / 2, 6);
        expect(pane.mesh.geometry.attributes.position.count).toBe((roomMod.MIRROR_GRID[0] + 1) * (roomMod.MIRROR_GRID[1] + 1));
    });

    test('an eye on the far side of the glass has no reflection to see', () => {
        const cam = new THREE.PerspectiveCamera(50, 1.6, 0.05, 60);
        cam.position.set(1, 1.6, -4);
        cam.lookAt(1, 1.6, 0);
        const out = new THREE.PerspectiveCamera();
        expect(interior.mirrorCamera(cam, room.reflections.panes[0], out)).toBe(false);
        expect(out.position.toArray()).toEqual([0, 0, 0]);
    });
});

describe('things touch down', () => {
    const mesh = () => room.group.children.find((o) => o.name === 'contact-shadows');
    /** The contact mesh's darkness at the vertex nearest a point. */
    const darkAt = (x, y, z) => {
        const g = mesh().geometry;
        const pos = g.attributes.position;
        const col = g.attributes.color;
        let best = -1;
        let dist = Infinity;
        for (let i = 0; i < pos.count; i++) {
            const d2 = (pos.getX(i) - x) ** 2 + (pos.getY(i) - y) ** 2 + (pos.getZ(i) - z) ** 2;
            if (d2 < dist) { dist = d2; best = i; }
        }
        return { alpha: col.getW(best), off: Math.sqrt(dist) };
    };

    test('a soft dark under the desk, the cabinet, the printer, the chair, the wastebasket and the plant, and on the desk under its things', () => {
        const d = CONFIG.room.desk;
        const lift = roomMod.CONTACT_LIFT;
        const under = [[d.x, lift, d.z], [CONFIG.room.cabinet.x, lift, CONFIG.room.cabinet.z], [CONFIG.room.printer.x, lift, CONFIG.room.printer.z]];
        const monitor = boxOf(room.picks.computer).getCenter(new THREE.Vector3());
        under.push([monitor.x, d.height + lift, d.z - d.depth / 2 + 0.22]);
        for (const [x, y, z] of under) {
            const { alpha, off } = darkAt(x, y, z);
            expect(off).toBeLessThan(0.2);
            expect(alpha).toBeGreaterThan(0.2);
        }
        // Fading to nothing at every patch's edge: the darkest is the middle.
        const col = mesh().geometry.attributes.color;
        const alphas = Array.from({ length: col.count }, (_, i) => col.getW(i));
        expect(Math.min(...alphas)).toBe(0);
        expect(Math.max(...alphas)).toBeLessThanOrEqual(0.5);
        // Black, faded by alpha, a few millimeters over what it lies on, and
        // never in a tap's way.
        expect(col.itemSize).toBe(4);
        expect(col.getX(0) + col.getY(0) + col.getZ(0)).toBe(0);
        expect(mesh().material.depthWrite).toBe(false);
        expect(new THREE.Raycaster(new THREE.Vector3(d.x + 0.5, 2, d.z + 0.6), new THREE.Vector3(0, -1, 0)).intersectObject(mesh())).toEqual([]);
    });

    test('a patch fades by its own softness, to nothing at its edge', () => {
        const { xs, zs, fade } = roomMod.contactGrid({ w: 1, d: 0.6, soft: 0.2, alpha: 0.4 });
        expect(xs[0]).toBe(-0.5);
        expect(xs.at(-1)).toBe(0.5);
        expect(zs[0]).toBeCloseTo(-0.3, 9);
        expect(fade(0, 0)).toBe(0.4);
        expect(fade(0.5, 0)).toBeCloseTo(0, 9);
        expect(fade(0.4, 0)).toBeCloseTo(0.2, 9);
        // A patch smaller than its softness still has a grid of distinct stops.
        const tiny = roomMod.contactGrid({ w: 0.1, d: 0.1, soft: 0.2, alpha: 0.4 });
        for (let i = 1; i < tiny.xs.length; i++) expect(tiny.xs[i]).toBeGreaterThan(tiny.xs[i - 1]);
    });
});

describe('rounded edges', () => {
    /** Triangles whose drawn side faces into the solid. */
    const inward = (g) => {
        const p = g.attributes.position;
        let n = 0;
        for (let i = 0; i < p.count; i += 3) {
            const [a, b, c] = [i, i + 1, i + 2].map((k) => new THREE.Vector3().fromBufferAttribute(p, k));
            const face = b.clone().sub(a).cross(c.clone().sub(a));
            if (face.lengthSq() < 1e-14) continue;
            if (face.dot(a.add(b).add(c).divideScalar(3)) < 0) n++;
        }
        return n;
    };

    test.each([[1.6, 0.04, 0.8], [0.04, 0.71, 0.72], [0.66, 0.41, 0.035], [0.48, 0.07, 0.46]])('a %s by %s by %s box keeps its size exactly, every face turned out', (w, h, d) => {
        const g = roundedBoxGeometry(w, h, d, 0.015);
        g.computeBoundingBox();
        const size = g.boundingBox.getSize(new THREE.Vector3());
        expect(size.x).toBeCloseTo(w, 6);
        expect(size.y).toBeCloseTo(h, 6);
        expect(size.z).toBeCloseTo(d, 6);
        expect(g.boundingBox.getCenter(new THREE.Vector3()).length()).toBeLessThan(1e-9);
        expect(inward(g)).toBe(0);
        // Rounded: no vertex stands at the box's own corner.
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) {
            const atCorner = Math.abs(Math.abs(p.getX(i)) - w / 2) < 1e-6 && Math.abs(Math.abs(p.getY(i)) - h / 2) < 1e-6 && Math.abs(Math.abs(p.getZ(i)) - d / 2) < 1e-6;
            expect(atCorner).toBe(false);
        }
    });

    test('the check would catch a box turned inside out', () => {
        const g = roundedBoxGeometry(1, 0.1, 1, 0.02);
        g.scale(-1, 1, 1);
        expect(inward(g)).toBeGreaterThan(0);
    });

    test('the desk, the chair and the printer wear them, and the desk top is lacquered', () => {
        const desk = room.group.children.find((o) => o.name === 'desk');
        const top = desk.children[0];
        expect(top.geometry.type).toBe('ExtrudeGeometry');
        expect(top.material.clearcoat).toBeGreaterThan(0);
        const b = boxOf(top);
        const d = CONFIG.room.desk;
        expect(b.max.x - b.min.x).toBeCloseTo(d.width, 6);
        expect(b.max.y).toBeCloseTo(d.height, 6);
        const chair = room.group.getObjectByName('chair');
        expect(chair.children[0].geometry.type).toBe('ExtrudeGeometry');
        const printer = [];
        room.picks.printer.traverse((c) => { if (c.isMesh) printer.push(c.geometry.type); });
        expect(printer.filter((t) => t === 'ExtrudeGeometry').length).toBeGreaterThanOrEqual(3);
    });

    const roundedBoxGeometry = (...args) => roomMod.roundedBoxGeometry(...args);
});
