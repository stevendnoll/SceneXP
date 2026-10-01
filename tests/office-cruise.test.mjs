// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The cruise ships in the northern water (QA, 2026-09-29: "now that we can
 * pan pretty far to the right (north), would it be possible to add a cruise
 * ship in the distance?"). Their lane, their timetable, and what the desk
 * sees of them when it turns right, measured against the real three.js.
 */
import { CONFIG } from '../www/office/js/config.js';
import * as life from '../www/office/js/life.js';
import * as city from '../www/office/js/city.js';
import { loadRealThree } from './helpers/real-three.mjs';

let THREE;
let world;
let room;
let poseFor;
let fleetMod;

const { LIFE, cruiseLane, cruisePier, cruiseDay, cruiseAt, laneAt } = life;
const DEG = Math.PI / 180;

beforeAll(async () => {
    THREE = await loadRealThree();
    globalThis.THREE = THREE;
    world = (await import('../www/office/js/world.js')).buildWorld(CONFIG);
    world.scene.updateMatrixWorld(true);
    room = (await import('../www/office/js/room.js')).buildRoom(CONFIG);
    room.group.updateMatrixWorld(true);
    ({ poseFor } = await import('../www/office/js/stations.js'));
    fleetMod = await import('../www/office/js/fleet.js');
});

afterAll(() => {
    delete globalThis.THREE;
});

/** The desk's camera turned `yaw` radians to the right (north), as the
 *  shared pan part turns it. */
function deskTurned(yaw, aspect = 16 / 10) {
    const p = poseFor('desk', aspect, CONFIG);
    const cam = new THREE.PerspectiveCamera(p.fov, aspect, 0.05, 160000);
    cam.position.set(...p.eye);
    const dir = new THREE.Vector3(...p.aim).sub(cam.position).applyAxisAngle(new THREE.Vector3(0, 1, 0), -yaw);
    cam.lookAt(cam.position.clone().add(dir));
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    return cam;
}

/** Whether a point outside is in frame and seen through the glass, past the
 *  towers and the land. */
function seen(cam, point) {
    const ndc = point.clone().project(cam);
    if (Math.abs(ndc.x) > 0.97 || Math.abs(ndc.y) > 0.97 || ndc.z > 1) return false;
    const dir = point.clone().sub(cam.position);
    const far = dir.length();
    const ray = new THREE.Raycaster(cam.position, dir.normalize(), 0, far - 5);
    // What is drawn: a fingertip's invisible target is no wall.
    if (ray.intersectObject(room.group, true).some((h) => h.object.material.visible !== false)) return false;
    return ray.intersectObjects([...world.towers.meshes, world.towers.roofs, world.mountains, ...world.hills.children], false).length === 0;
}

/** The ship's hull, 30 m up, at a point of the water. */
const hullAt = (x, z) => new THREE.Vector3(x, city.WATER_Y + 30, z);
const bearing = (x, z) => Math.atan2(x, -z) / DEG;

describe('the pier and the berth', () => {
    const pier = cruisePier();

    test('the pier leaves the shore north of downtown and runs out over open water', () => {
        expect(pier.z0).toBeCloseTo(city.shoreZ(pier.x0), 6);
        for (let t = 0.02; t <= 1; t += 0.02) {
            const x = pier.x0 + (pier.x1 - pier.x0) * t;
            const z = pier.z0 + (pier.z1 - pier.z0) * t;
            expect(city.isWater(x, z)).toBe(true);
        }
        // Clear of the downtown towers.
        for (const t of city.cityTowers()) expect(Math.hypot(t.x - pier.bx, t.z - pier.bz)).toBeGreaterThan(400);
    });

    test('the ship lies alongside it broadside to the office, all of it in the stretch the desk sees turned right', () => {
        const half = (LIFE.cruise.length * LIFE.cruise.scale) / 2;
        const ahead = [-pier.out[0], -pier.out[1]];
        // Beside the pier, not in it: its middle is off the pier's side by
        // more than half the pier and half the ship.
        const offSide = (pier.bx - pier.x0) * pier.side[0] + (pier.bz - pier.z0) * pier.side[1];
        expect(offSide).toBeGreaterThan(pier.width / 2 + 18 * LIFE.cruise.scale);
        // Toward the office, from the pier: the side the office sees.
        expect(-pier.bx * pier.side[0] + -pier.bz * pier.side[1]).toBeGreaterThan(0);
        // Broadside: the ship's length across the line of sight.
        const sight = [pier.bx, pier.bz];
        const cos = Math.abs(ahead[0] * sight[0] + ahead[1] * sight[1]) / Math.hypot(...sight);
        expect(Math.acos(cos) / DEG).toBeGreaterThan(80);
        const cams = [deskTurned(CONFIG.view.look.pan.maxAngle), deskTurned(0.35)];
        for (const end of [-1, 0, 1]) {
            const x = pier.bx + ahead[0] * half * end * 0.95;
            const z = pier.bz + ahead[1] * half * end * 0.95;
            expect(bearing(x, z)).toBeGreaterThan(41);
            expect(bearing(x, z)).toBeLessThan(50);
            expect(seen(cams[0], hullAt(x, z))).toBe(true);
        }
        expect(seen(cams[1], hullAt(pier.bx, pier.bz))).toBe(true);
        // Not from the desk looking straight ahead: it is the reward for turning.
        expect(seen(deskTurned(0), hullAt(pier.bx, pier.bz))).toBe(false);
    });
});

describe('the lane', () => {
    const lane = cruiseLane();
    const pier = cruisePier();

    test('all on open water, evenly laid, ending at the berth, and turning like a ship where it can be seen', () => {
        expect(lane.length).toBeGreaterThan(10000);
        expect(lane.points.at(-1)[0]).toBeCloseTo(pier.bx, 6);
        expect(lane.points.at(-1)[1]).toBeCloseTo(pier.bz, 6);
        const step = lane.length / (lane.points.length - 1);
        const cam = deskTurned(CONFIG.view.look.pan.maxAngle);
        for (let i = 0; i < lane.points.length; i++) {
            const [x, z] = lane.points[i];
            expect(city.isWater(x, z)).toBe(true);
            if (i > 0) {
                const [px, pz] = lane.points[i - 1];
                expect(Math.hypot(x - px, z - pz)).toBeCloseTo(step, -1);
            }
            if (i === 0 || i === lane.points.length - 1) continue;
            // Where it is in sight, no turn tighter than a ship's (a radius
            // of some 700 m, LIFE.cruise.turn, measured on the samples).
            const [ax, az] = lane.points[i - 1];
            const [cx, cz] = lane.points[i + 1];
            let turn = Math.abs(Math.atan2(cx - x, cz - z) - Math.atan2(x - ax, z - az));
            turn = Math.min(turn, 2 * Math.PI - turn);
            if (seen(cam, hullAt(x, z))) expect(step / Math.max(turn, 1e-9)).toBeGreaterThan(600);
        }
    });

    test('from the desk turned right, much of the way in is in sight, and its far end is not', () => {
        const cam = deskTurned(CONFIG.view.look.pan.maxAngle);
        let inSight = 0;
        const n = 60;
        for (let i = 0; i <= n; i++) {
            const [x, z] = laneAt(lane, (lane.length * i) / n);
            if (seen(cam, hullAt(x, z))) inSight++;
        }
        expect(inSight / (n + 1)).toBeGreaterThan(0.45);
        const [fx, fz] = laneAt(lane, 0);
        expect(seen(cam, hullAt(fx, fz))).toBe(false);
    });
});

describe('the ship’s day', () => {
    const lane = cruiseLane();
    const pier = cruisePier();
    const on = (h, day = 28) => {
        const d = new Date(2026, 8, day);
        d.setTime(d.getTime() + h * 3600000);
        return d;
    };

    test('in at dawn, alongside all day, away in the late afternoon, and none by night', () => {
        const day = cruiseDay(lane);
        expect(day.in / 60).toBeCloseTo(LIFE.cruise.arrive, 9);
        expect(day.docked / 60).toBeLessThan(7);
        expect(day.leave / 60).toBeCloseTo(LIFE.cruise.depart, 9);
        expect(day.gone / 60).toBeLessThan(18.5);
        expect(cruiseAt(on(3), lane, pier)).toBeNull();
        expect(cruiseAt(on(22), lane, pier)).toBeNull();
        for (const h of [7, 12, 16]) {
            const c = cruiseAt(on(h), lane, pier);
            expect(c).toMatchObject({ phase: 'docked', x: pier.bx, z: pier.bz, yaw: pier.yaw, speed: 0 });
        }
        expect(cruiseAt(on(6), lane, pier).phase).toBe('in');
        expect(cruiseAt(on(17.1), lane, pier).phase).toBe('out');
    });

    test('never a jump, at a harbor pace, bow first under way; it backs off and turns about only with the tugs', () => {
        let prev = null;
        let turned = 0;
        for (let s = 5 * 3600; s < 19 * 3600; s += 10) {
            const c = cruiseAt(new Date(on(0).getTime() + s * 1000), lane, pier);
            if (c && prev) {
                const moved = Math.hypot(c.x - prev.x, c.z - prev.z);
                expect(moved).toBeLessThanOrEqual(LIFE.cruise.speed * 10 * 1.02);
                let dy = Math.abs(c.yaw - prev.yaw) % (2 * Math.PI);
                dy = Math.min(dy, 2 * Math.PI - dy);
                // A ship's turn; behind the towers, with the tugs, a tighter one.
                expect(dy).toBeLessThan(0.12);
                if (c.phase === 'turning') turned += dy;
                if ((c.phase === 'in' || c.phase === 'out') && moved > 1) {
                    const ahead = [-Math.sin(prev.yaw), -Math.cos(prev.yaw)];
                    expect(((c.x - prev.x) * ahead[0] + (c.z - prev.z) * ahead[1]) / moved).toBeGreaterThan(0.98);
                }
                if (c.phase === 'off' && moved > 0.5) {
                    // Astern: moving the way its stern points.
                    const ahead = [-Math.sin(prev.yaw), -Math.cos(prev.yaw)];
                    expect(((c.x - prev.x) * ahead[0] + (c.z - prev.z) * ahead[1]) / moved).toBeLessThan(-0.95);
                }
            }
            prev = c;
        }
        expect(turned).toBeCloseTo(Math.PI, 1);
        expect(LIFE.cruise.speed * 1.944).toBeGreaterThan(8);
        expect(LIFE.cruise.speed * 1.944).toBeLessThan(14);
    });

    test('a different line each day, counted round', () => {
        const lines = new Set([27, 28, 29].map((d) => cruiseAt(on(12, d), lane, pier).livery));
        expect(lines.size).toBe(LIFE.cruise.liveries);
    });
});

describe('the ships themselves', () => {
    test('white decks over the line’s hull, cabin windows lit by night, orange lifeboats, the funnel in its colors', () => {
        fleetMod.CRUISE_LIVERIES.forEach((livery) => {
            const { body, windows } = fleetMod.cruiseParts(livery);
            body.computeBoundingBox();
            const b = body.boundingBox;
            expect(b.max.z - b.min.z).toBeCloseTo(LIFE.cruise.length, 0);
            expect(b.max.y).toBeGreaterThan(50);
            const colors = new Set();
            const c = body.attributes.color;
            const col = new THREE.Color();
            for (let i = 0; i < c.count; i += 3) colors.add(col.setRGB(c.getX(i), c.getY(i), c.getZ(i)).getHex(THREE.SRGBColorSpace));
            for (const hex of [0xf2f3f1, 0xe8742a, livery.funnel, livery.hull]) expect(colors.has(hex)).toBe(true);
            expect(windows.attributes.position.count).toBeGreaterThan(18 * 36 - 1);
        });
    });

    test('a ship’s front (QA, 2026-09-29: "especially the front of it"): the band runs to the stem, and the decks rise in a raked front, not a staircase', () => {
        const bow = -LIFE.cruise.length / 2;
        /** The foremost vertex of `hex` between two heights. */
        const foremost = (body, hex, y0, y1) => {
            const want = new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
            const p = body.attributes.position;
            const c = body.attributes.color;
            let z = Infinity;
            for (let i = 0; i < p.count; i++) {
                const y = p.getY(i);
                if (y > y0 && y < y1 && Math.abs(c.getX(i) - want.r) + Math.abs(c.getY(i) - want.g) + Math.abs(c.getZ(i) - want.b) < 1e-4) z = Math.min(z, p.getZ(i));
            }
            return z;
        };
        // The waterline band reaches the stem (it stopped 42 m short, at a
        // pale wedge).
        for (const livery of fleetMod.CRUISE_LIVERIES.slice(1)) {
            expect(foremost(fleetMod.cruiseParts(livery).body, livery.band, -1, fleetMod.CRUISE_LINES.band + 0.1) - bow).toBeLessThan(15);
        }
        // The eighth deck's front is within a few meters of the lowest's
        // (it was 44 m back, a deck at a time).
        const { body } = fleetMod.cruiseParts(fleetMod.CRUISE_LIVERIES[0]);
        const { deck, height } = fleetMod.CRUISE_LINES;
        const lowest = foremost(body, 0xf2f3f1, deck + 0.5, deck + height - 0.5);
        const eighth = foremost(body, 0xf2f3f1, deck + 8 * height + 0.5, deck + 9 * height - 0.5);
        expect(lowest - bow).toBeGreaterThan(30);
        expect(eighth - lowest).toBeLessThan(15);
        // The hull's sides turned outward, away from its middle line, so
        // nothing is drawn inside out.
        const p = body.attributes.position;
        const n = body.attributes.normal;
        let sides = 0;
        for (let i = 0; i < p.count; i++) {
            if (p.getY(i) > deck || Math.abs(p.getX(i)) < 3 || Math.abs(n.getY(i)) > 0.5 || Math.abs(n.getZ(i)) > 0.5) continue;
            expect(Math.sign(n.getX(i))).toBe(Math.sign(p.getX(i)));
            sides++;
        }
        expect(sides).toBeGreaterThan(100);
    });

    test('the pier is built right side out: its basis a rotation, its shed on the side away from the ship', () => {
        const pier = cruisePier();
        const x = new THREE.Vector3(pier.side[0], 0, pier.side[1]);
        const z = new THREE.Vector3(pier.out[0], 0, pier.out[1]);
        expect(new THREE.Vector3().crossVectors(x, new THREE.Vector3(0, 1, 0)).dot(z)).toBeCloseTo(1, 9);
        // The shed's roof is off the pier's middle away from the berth.
        world.scene.updateMatrixWorld(true);
        const along = 0.42 * LIFE.cruise.pier.length;
        const mx = pier.x0 + pier.out[0] * along;
        const mz = pier.z0 + pier.out[1] * along;
        const hitAt = (k) => new THREE.Raycaster(new THREE.Vector3(mx + pier.side[0] * k, 400, mz + pier.side[1] * k), new THREE.Vector3(0, -1, 0))
            .intersectObject(world.docks)[0];
        expect(hitAt(-10).point.y).toBeGreaterThan(city.WATER_Y + 15);
        expect(hitAt(10).point.y).toBeLessThan(city.WATER_Y + 5);
    });

    test('in the world: the day’s ship alongside its pier, the others hidden, lit with the fleet by night', () => {
        const date = new Date(2026, 8, 28, 12, 0);
        world.setLife(date, 100, false, 100);
        const out = world.fleet.cruises.filter((c) => c.group.visible);
        expect(out).toHaveLength(1);
        const c = cruiseAt(date);
        expect(out[0]).toBe(world.fleet.cruises[c.livery]);
        expect(out[0].group.position.x).toBeCloseTo(c.x, 3);
        expect(out[0].group.scale.x).toBe(LIFE.cruise.scale);
        // Alongside, not in the pier: a ray down through the ship's middle
        // meets the ship, and one down the pier's middle meets the pier.
        world.scene.updateMatrixWorld(true);
        const pier = cruisePier();
        const down = (x, z) => new THREE.Raycaster(new THREE.Vector3(x, 400, z), new THREE.Vector3(0, -1, 0)).intersectObjects([out[0].group, world.docks], true)[0];
        expect(down(pier.bx, pier.bz).object.parent).toBe(out[0].group);
        const mid = [(pier.x0 + pier.x1) / 2, (pier.z0 + pier.z1) / 2];
        expect(down(...mid).object).toBe(world.docks);
        world.fleet.light(1);
        expect(out[0].lit.material.emissiveIntensity).toBeGreaterThan(1);
        world.fleet.light(0);
        expect(out[0].lit.material.emissiveIntensity).toBe(0);
        // None by night.
        world.setLife(new Date(2026, 8, 28, 23, 0), 100, false, 100);
        expect(world.fleet.cruises.every((s) => s.group.visible === false)).toBe(true);
    });
});
