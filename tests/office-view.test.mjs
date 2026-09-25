// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The view out of Corner Office's windows, measured through the real camera
 * against the real three.js (node:vm), the room and the world both built.
 *
 * COMPOSE AGAINST THE EYE, NOT THE MAP. A ray from the eye meets the room
 * first (its walls hide the city everywhere but the windows), and only a ray
 * that leaves through a window goes on into the world. What it meets there
 * is what a visitor sees at that pixel, and a census of the frame says how
 * much of the view each thing is.
 *
 * THE BRIEF THESE HOLD (Steve, 2026-09-24): the view is west, toward the bay
 * and the mountains; "the sheer size and scale of the city, and the user
 * being on the 40th floor, is what should add the gravitas"; the water only
 * in slivers between the towers; less is more.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { CONFIG } from '../www/office/js/config.js';
import * as bay from '../www/office/js/bay.js';
import * as sky from '../www/office/js/sky.js';

let THREE;
let room;
let world;
let poseFor;
let city;
let worldMod;

beforeAll(async () => {
    const ctx = vm.createContext({ self: {}, window: {}, console: { warn() {} } });
    vm.runInContext(readFileSync(join(process.cwd(), 'www/lib/three.min.js'), 'utf8'), ctx);
    THREE = ctx.THREE || ctx.self.THREE || ctx.window.THREE;
    globalThis.THREE = THREE;
    const { buildRoom } = await import('../www/office/js/room.js');
    worldMod = await import('../www/office/js/world.js');
    ({ poseFor } = await import('../www/office/js/stations.js'));
    city = await import('../www/office/js/city.js');
    room = buildRoom(CONFIG);
    room.group.updateMatrixWorld(true);
    world = worldMod.buildWorld(CONFIG);
    world.scene.updateMatrixWorld(true);
});

afterAll(() => {
    delete globalThis.THREE;
});

const ASPECTS = { 'wide 21:9': 21 / 9, 'laptop 16:10': 16 / 10, 'phone upright': 390 / 844, 'tall phone': 9 / 19.5 };

function cameraAt(station, aspect) {
    const pose = poseFor(station, aspect, CONFIG);
    const cam = new THREE.PerspectiveCamera(pose.fov, aspect, 0.05, 160000);
    cam.position.set(...pose.eye);
    cam.lookAt(new THREE.Vector3(...pose.aim));
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    return cam;
}

/** What the eye sees along a direction: 'room' when the room is in the way,
 *  else the kind of the first thing outside, and where it was met. */
function seeAlong(origin, direction) {
    const ray = new THREE.Raycaster(origin, direction.clone().normalize());
    if (ray.intersectObject(room.group, true).length) return { what: 'room' };
    const [hit] = ray.intersectObject(world.scene, true);
    if (!hit) return { what: 'nothing' };
    let o = hit.object;
    while (o.parent && o.parent !== world.scene && !o.name) o = o.parent;
    const name = o.name || (o.parent && o.parent.name) || 'unnamed';
    // The towers are one mesh per facade style and one for the roofs, and
    // the clouds are in the sky (the deck is see-through between them).
    const kinds = { land: 'land', towers: 'towers', clouds: 'sky' };
    const kind = Object.keys(kinds).find((k) => name.startsWith(k));
    return { what: kind ? kinds[kind] : name, point: hit.point, name, uv: hit.uv };
}

function seeAt(cam, x, y) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(x, y), cam);
    return seeAlong(ray.ray.origin, ray.ray.direction);
}

/** A census of the frame: how much of it is each thing. */
function census(cam, n = 24) {
    const counts = {};
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            const { what } = seeAt(cam, -1 + (2 * (i + 0.5)) / n, -1 + (2 * (j + 0.5)) / n);
            counts[what] = (counts[what] || 0) + 1 / (n * n);
        }
    }
    return counts;
}

describe('from the desk, the back window looks west', () => {
    test.each(['wide 21:9', 'laptop 16:10'])('on a %s screen: towers framing the view, the mountains over slivers of the bay, and sky', (name) => {
        const c = census(cameraAt('desk', ASPECTS[name]));
        expect(c.towers || 0).toBeGreaterThan(0.06);
        expect(c.sky || 0).toBeGreaterThan(0.04);
        expect(c.mountains || 0).toBeGreaterThan(0.005);
        // The water is a sliver, never the subject.
        expect(c.water || 0).toBeGreaterThan(0.005);
        expect(c.water || 0).toBeLessThan(0.08);
    });
});

describe('from the window', () => {
    test.each(Object.entries(ASPECTS))('on a %s screen: the city fills the view, the bay in slivers, the mountains beyond, the street far below', (_name, aspect) => {
        const c = census(cameraAt('window', aspect));
        expect(c.towers || 0).toBeGreaterThan(0.35);
        expect(c.water || 0).toBeGreaterThan(0.01);
        expect(c.water || 0).toBeLessThan(0.12);
        expect(c.mountains || 0).toBeGreaterThan(0.005);
        expect(c.land || 0).toBeGreaterThan(0.02);
        expect(c.room || 0).toBeLessThan(0.35);
    });

    test('the street seen below is a long way down: the office is on the 40th floor', () => {
        const cam = cameraAt('window', 16 / 10);
        let below = 0;
        for (let i = 0; i < 40; i++) {
            for (let j = 0; j < 40; j++) {
                const hit = seeAt(cam, -1 + (2 * (i + 0.5)) / 40, -1 + (2 * (j + 0.5)) / 40);
                if (hit.what !== 'land') continue;
                expect(cam.position.y - hit.point.y).toBeGreaterThan(100);
                below++;
            }
        }
        expect(below).toBeGreaterThan(20);
    });

    test('towers rise above the window as well as fall below it', () => {
        const cam = cameraAt('window', 16 / 10);
        let above = 0;
        let beneath = 0;
        for (let i = 0; i < 30; i++) {
            for (let j = 0; j < 30; j++) {
                const hit = seeAt(cam, -1 + (2 * (i + 0.5)) / 30, -1 + (2 * (j + 0.5)) / 30);
                if (hit.what !== 'towers') continue;
                if (hit.point.y > cam.position.y) above++;
                else beneath++;
            }
        }
        expect(above).toBeGreaterThan(20);
        expect(beneath).toBeGreaterThan(20);
    });

    test('straight down the office’s street, between the towers, lies the ferry dock', () => {
        // From the desk the sill hides the waterfront; up at the glass it
        // is there at the foot of the street.
        const cam = cameraAt('window', 16 / 10);
        const [dock] = city.piers().filter((p) => p.ferry);
        const target = new THREE.Vector3(dock.x, city.WATER_Y + 10, dock.z - dock.length / 2);
        const ndc = target.clone().project(cam);
        expect(Math.abs(ndc.x)).toBeLessThan(1);
        expect(Math.abs(ndc.y)).toBeLessThan(1);
        expect(['piers', 'water']).toContain(seeAlong(cam.position, target.clone().sub(cam.position)).what);
    });

    test('the window station looks west and down', () => {
        const pose = poseFor('window', 16 / 10, CONFIG);
        const d = pose.aim.map((v, i) => v - pose.eye[i]);
        expect(d[1]).toBeLessThan(0);
        expect(-d[2]).toBeGreaterThan(Math.abs(d[0]));
    });
});

describe('the world itself', () => {
    test('there is nothing to the south: no port, no stadiums, no volcano', () => {
        for (const name of ['port', 'stadiums', 'volcano']) expect(world.scene.getObjectByName(name)).toBeUndefined();
    });

    test('the sky is drawn last and never fogged, and the outside keeps its own far plane', () => {
        expect(world.sky.renderOrder).toBeGreaterThan(0);
        expect(world.sky.material.fog).toBe(false);
        expect(world.sky.material.depthWrite).toBe(false);
        expect(world.camera.far).toBeGreaterThan(Math.abs(city.olympics().z) * 2);
        expect(world.camera.near).toBeGreaterThanOrEqual(1);
    });

    test('its camera follows the room camera exactly', () => {
        const cam = cameraAt('window', 16 / 10);
        world.follow(cam);
        expect(world.camera.position.equals(cam.position)).toBe(true);
        expect(world.camera.quaternion.equals(cam.quaternion)).toBe(true);
        expect(world.camera.fov).toBe(cam.fov);
    });

    test('the downtown ground falls to the water and faces up', () => {
        const g = worldMod.terrainGeometry({ x0: 0, x1: 60, z0: -700, z1: 0, cell: 30 });
        const pos = g.attributes.position;
        const nor = g.attributes.normal;
        for (let i = 0; i < pos.count; i++) {
            expect(pos.getY(i)).toBeCloseTo(city.groundY(pos.getX(i), pos.getZ(i)), 3);
            expect(nor.getY(i)).toBeGreaterThan(0);
        }
    });
});

// ---- The bay and the air --------------------------------------------------------

/** What the window sees along the horizon, where the far things are: a fine
 *  sweep of the band from the island's shore up past the mountain tops,
 *  every hit's name and distance. */
function horizonSweep(cam, columns = 90, rows = 40) {
    const ndcY = (x, y, z) => new THREE.Vector3(x, y, z).project(cam).y;
    const x = cam.position.x;
    const low = ndcY(x, city.WATER_Y, -12000);
    const high = ndcY(x, city.WATER_Y + 2600, -30000);
    const hits = [];
    for (let i = 0; i < columns; i++) {
        for (let j = 0; j < rows; j++) {
            const ray = new THREE.Raycaster();
            ray.setFromCamera(new THREE.Vector2(-1 + (2 * (i + 0.5)) / columns, low + ((high - low) * (j + 0.5)) / rows), cam);
            if (ray.intersectObject(room.group, true).length) continue;
            const [hit] = ray.intersectObject(world.scene, true);
            if (hit) hits.push({ name: hit.object.name, distance: hit.distance });
        }
    }
    return hits;
}

describe('the bay and the air', () => {
    test('the water is a dark body under a glancing mirror, broken up by ripples', () => {
        const m = world.water.material;
        expect(m.type).toBe('MeshStandardMaterial');
        expect(m.metalness).toBe(0);
        expect(m.roughness).toBe(bay.BAY.roughness);
        expect(m.roughness).toBeLessThan(0.3);
        const lum = (hex) => ((hex >> 16) & 255) * 0.2126 + ((hex >> 8) & 255) * 0.7152 + (hex & 255) * 0.0722;
        expect(lum(bay.BAY.color)).toBeLessThan(70);
        expect(m.normalMap).toBeTruthy();
    });

    test('the ripples are a seamless normal map, one tile every BAY.tile meters, raw numbers, mipmapped', () => {
        const t = world.water.material.normalMap;
        expect(t.isDataTexture).toBe(true);
        expect(t.image.width).toBe(bay.BAY.size);
        expect(t.colorSpace).toBe(THREE.NoColorSpace);
        expect(t.wrapS).toBe(THREE.RepeatWrapping);
        expect(t.wrapT).toBe(THREE.RepeatWrapping);
        expect(t.generateMipmaps).toBe(true);
        expect(t.minFilter).toBe(THREE.LinearMipmapLinearFilter);
        expect(world.water.geometry.parameters.width / t.repeat.x).toBeCloseTo(bay.BAY.tile, 6);
        expect(world.water.geometry.parameters.height / t.repeat.y).toBeCloseTo(bay.BAY.tile, 6);
        expect(worldMod.rippleTexture().anisotropy).toBe(1);
        expect(worldMod.buildWorld(CONFIG, { anisotropy: 8 }).water.material.normalMap.anisotropy).toBe(8);
    });

    test.each(['wide 21:9', 'laptop 16:10'])('on a %s screen the far water the window sees mirrors the mountains, the near water the sky', (name) => {
        // What each patch of water shows is its mirror ray, looked up in the
        // world as captured from over the bay.
        const cam = cameraAt('window', ASPECTS[name]);
        const from = new THREE.Vector3(...world.points.bay);
        const mirrored = {};
        const n = 48;
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                const { what, point } = seeAt(cam, -1 + (2 * (i + 0.5)) / n, -1 + (2 * (j + 0.5)) / n);
                if (what !== 'water') continue;
                const dir = point.clone().sub(cam.position).normalize();
                dir.y = -dir.y;
                const [hit] = new THREE.Raycaster(from, dir).intersectObject(world.scene, true);
                const shown = !hit || hit.object.name === 'sky' ? 'sky' : hit.object.name.startsWith('land-hills') ? 'hills' : hit.object.name;
                mirrored[shown] = (mirrored[shown] || 0) + 1;
            }
        }
        expect(mirrored.mountains || 0).toBeGreaterThan(0);
        // The sky it mirrors has its cloud deck in it.
        expect(mirrored.clouds || 0).toBeGreaterThan(0);
        expect((mirrored.sky || 0) + (mirrored.clouds || 0)).toBeGreaterThan(mirrored.mountains);
    });

    test.each(['wide 21:9', 'laptop 16:10', 'phone upright'])('on a %s screen there are clouds over the mountains, and they are the sky’s, not a ceiling', (name) => {
        // Where a ray meets the deck, is there cloud painted there? The tile
        // repeats span/tile times, and a canvas texture is flipped in v.
        const puffs = sky.wrappedPuffs(sky.cloudPuffs());
        const repeat = sky.CLOUDS.span / sky.CLOUDS.tile;
        const frac = (x) => x - Math.floor(x);
        const painted = (uv) => {
            const u = frac(uv.x * repeat);
            const v = 1 - frac(uv.y * repeat);
            return puffs.some(([x, y, r]) => Math.hypot(u - x, v - y) < r);
        };
        const cam = cameraAt('window', ASPECTS[name]);
        let deck = 0;
        let cloud = 0;
        let beyondShore = 0;
        const n = 48;
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                const hit = seeAt(cam, -1 + (2 * (i + 0.5)) / n, -1 + (2 * (j + 0.5)) / n);
                if (hit.name !== 'clouds') continue;
                deck++;
                if (!painted(hit.uv)) continue;
                cloud++;
                if (hit.point.z < city.shoreZ(hit.point.x)) beyondShore++;
            }
        }
        // Clouds, with blue sky between them: less is more.
        expect(cloud).toBeGreaterThan(0);
        expect(cloud / deck).toBeGreaterThan(0.1);
        expect(cloud / deck).toBeLessThan(0.7);
        // Out over the bay and the mountains, not hanging over the street.
        expect(beyondShore / cloud).toBeGreaterThan(0.9);
    });

    test('the water is calm: a slow swell, not a chop', () => {
        expect(bay.meanSquareSlope()).toBeLessThan(0.006);
        expect(bay.maxTilt()).toBeLessThan((12 * Math.PI) / 180);
        expect(world.water.material.envMapIntensity).toBe(bay.BAY.reflect);
        expect(bay.BAY.reflect).toBeGreaterThanOrEqual(1);
    });

    test('the haze runs from the window to the horizon, in the horizon’s own color', () => {
        expect(world.scene.fog.near).toBe(bay.HAZE.near);
        expect(world.scene.fog.far).toBe(bay.HAZE.far);
        // Past the haze's end everything is the horizon, which the camera still reaches.
        expect(world.camera.far).toBeGreaterThan(bay.HAZE.far);
        expect(world.water.geometry.parameters.width / 2).toBeGreaterThan(bay.HAZE.far);
    });

    test.each(['wide 21:9', 'laptop 16:10', 'phone upright'])('on a %s screen the window sees the far things in layers, each paler than the last', (name) => {
        const hits = horizonSweep(cameraAt('window', ASPECTS[name]));
        const at = (prefix) => {
            const mine = hits.filter((h) => h.name.startsWith(prefix));
            return mine.length ? mine.reduce((sum, h) => sum + h.distance, 0) / mine.length : null;
        };
        const island = at('land-hills-island');
        const farShore = at('land-hills-farShore');
        const mountains = at('mountains');
        expect(island).not.toBeNull();
        expect(farShore).not.toBeNull();
        expect(mountains).not.toBeNull();
        expect(island).toBeLessThan(farShore);
        expect(farShore).toBeLessThan(mountains);
        expect(bay.hazeAt(farShore) - bay.hazeAt(island)).toBeGreaterThan(0.05);
        expect(bay.hazeAt(mountains) - bay.hazeAt(farShore)).toBeGreaterThan(0.05);
        // The mountains are hazed, not gone.
        expect(bay.hazeAt(mountains)).toBeLessThan(0.65);
    });

    test('the hills are wooded and snowless, one mesh each, counted as land', () => {
        const group = world.scene.getObjectByName('land-hills');
        expect(group.children.map((m) => m.name)).toEqual(['land-hills-island', 'land-hills-farShore']);
        const col = group.children[0].geometry.attributes.color;
        const woods = new THREE.Color().setHex(worldMod.RIDGE_COLORS.woods, THREE.SRGBColorSpace);
        for (let i = 0; i < col.count; i++) expect(col.getX(i)).toBeCloseTo(woods.r, 6);
        expect(world.hills).toBe(group);
    });
});

// ---- Glass, streets and night ---------------------------------------------------

describe('the glass city', () => {
    let lit;
    beforeAll(() => {
        const tex = () => new THREE.Texture();
        const facades = Object.fromEntries(worldMod.STYLES.map((s) => [s, { color: tex(), rm: tex(), lit: tex() }]));
        lit = worldMod.buildWorld(CONFIG, { textures: { facades, streets: tex(), streetsLit: tex(), clouds: tex() } });
    });

    const tower = (over) => ({ x: 0, z: 0, w: 20, d: 30, h: 60, base: 40, form: 'box', tiers: [], podium: null, tone: 0, low: false, ...over });

    test('a panel is the same size on every tower: the facade is mapped in meters', () => {
        for (const t of [tower({}), tower({ w: 45, d: 25, h: 200 }), tower({ form: 'chamfer', w: 50, d: 50, h: 150 })]) {
            const g = worldMod.towerGeometry([t]);
            const uv = g.attributes.uv;
            const pos = g.attributes.position;
            // Along each bottom edge: u per meter is the panel's.
            for (let v = 0; v < pos.count; v += 6) {
                const along = Math.hypot(pos.getX(v + 2) - pos.getX(v), pos.getZ(v + 2) - pos.getZ(v));
                const du = Math.abs(uv.getX(v + 2) - uv.getX(v));
                if (along > 1) expect(du / along).toBeCloseTo(1 / (city.PANEL.width * city.FACADE_TILE.cols), 5);
            }
            const ys = Array.from({ length: pos.count }, (_, i) => pos.getY(i));
            expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(t.h, 3);
            expect(Math.min(...ys)).toBeCloseTo(city.WATER_Y + t.base, 3);
        }
    });

    test('every wall faces out, whatever the form', () => {
        for (const form of ['box', 'chamfer', 'round']) {
            const t = tower({ form, w: 40, d: 40, h: 100, tiers: [{ from: 60, inset: 5 }] });
            const g = worldMod.towerGeometry([t]);
            const pos = g.attributes.position;
            for (let v = 0; v < pos.count; v += 3) {
                const a = new THREE.Vector3().fromBufferAttribute(pos, v);
                const b = new THREE.Vector3().fromBufferAttribute(pos, v + 1);
                const c = new THREE.Vector3().fromBufferAttribute(pos, v + 2);
                const n = b.clone().sub(a).cross(c.clone().sub(a));
                const out = a.clone().add(b).add(c).divideScalar(3).sub(new THREE.Vector3(t.x, a.y, t.z));
                out.y = 0;
                expect(n.dot(out)).toBeGreaterThan(0);
            }
        }
    });

    test('a setback and a podium are there in the geometry', () => {
        const plain = worldMod.towerGeometry([tower({ h: 100 })]).attributes.position.count;
        const stepped = worldMod.towerGeometry([tower({ h: 100, tiers: [{ from: 60, inset: 5 }] })]).attributes.position.count;
        const podium = worldMod.towerGeometry([tower({ h: 100, podium: { h: 20, w: 70, d: 70 } })]).attributes.position.count;
        expect(stepped).toBe(plain * 2);
        expect(podium).toBe(plain * 2);
    });

    test('the towers are three facade meshes and a roof mesh', () => {
        expect(lit.towers.meshes.map((m) => m.name).sort()).toEqual(['towers-bands', 'towers-fins', 'towers-grid']);
        expect(lit.towers.roofs.geometry.attributes.position.count).toBeGreaterThan(city.cityTowers().length * 6);
        for (const m of lit.towers.meshes) {
            expect(m.material.metalnessMap).toBe(m.material.roughnessMap);
            expect(m.material.emissiveMap).toBeTruthy();
        }
    });

    test('a street tile is one block, centered under each block of towers', () => {
        const g = worldMod.terrainGeometry();
        const pos = g.attributes.position;
        const uv = g.attributes.uv;
        const home = city.blockAt(0, 0);
        const pitch = city.CITY.block + city.CITY.street;
        for (let i = 0; i < pos.count; i += 97) {
            expect(uv.getX(i)).toBeCloseTo((pos.getX(i) - home.cx) / pitch + 0.5, 3);
        }
        const u = (city.blockAt(3, -2).cx - home.cx) / pitch + 0.5;
        expect(u - Math.floor(u)).toBeCloseTo(0.5, 9);
    });

    test('by night the offices and streets light up and the beacons come on, and by day they go dark', async () => {
        const { lighting, lightAt } = await import('../www/office/js/daylight.js');
        lit.setLight(lighting(lightAt(new Date(2026, 8, 24), 22)));
        expect(lit.beacons.visible).toBe(true);
        expect(lit.towers.meshes[0].material.emissiveIntensity).toBeGreaterThan(1);
        expect(lit.scene.getObjectByName('land-downtown').material.emissiveIntensity).toBeGreaterThan(0.5);
        lit.setLight(lighting(lightAt(new Date(2026, 8, 24), 12)));
        expect(lit.beacons.visible).toBe(false);
        expect(lit.towers.meshes[0].material.emissiveIntensity).toBe(0);
        expect(lit.beacons.geometry.attributes.position.count).toBe(city.aviationLights(city.cityTowers()).length);
    });

    test('without a renderer there is nothing to reflect yet, and nothing breaks', () => {
        expect(lit.updateEnvironment(null, {})).toBeNull();
    });

    test('with a renderer, the world is captured twice: the glass reflects the city, the water the bay, the old ones let go', async () => {
        // A real PMREMGenerator needs WebGL: this one records where the scene
        // stood and what was showing when it was asked to capture.
        const { lighting, lightAt } = await import('../www/office/js/daylight.js');
        const real = THREE.PMREMGenerator;
        const made = [];
        THREE.PMREMGenerator = class {
            fromScene(scene, sigma, near, far) {
                const sunAt = new THREE.Vector3().setFromMatrixPosition(lit.sun.matrixWorld);
                const aimAt = new THREE.Vector3().setFromMatrixPosition(lit.sun.target.matrixWorld);
                const target = {
                    shift: scene.position.clone(), glow: lit.glow.visible, near, far,
                    towersShow: lit.towers.meshes[0].material.envMap,
                    sunDirection: sunAt.sub(aimAt).normalize(),
                    texture: { id: made.length }, disposed: false, dispose() { this.disposed = true; }
                };
                made.push(target);
                return target;
            }
        };
        try {
            const noon = lighting(lightAt(new Date(2026, 8, 24), 12));
            const first = lit.updateEnvironment({}, noon);
            // Each capture from its own point: the scene stepped back by it.
            expect(first.city.shift.toArray()).toEqual(lit.points.city.map((v) => -v));
            expect(first.bay.shift.toArray()).toEqual(lit.points.bay.map((v) => -v));
            // The bay first, and handed to the towers before the city's capture,
            // so the neighbors in it show the sky, not black glass.
            expect(made.indexOf(first.bay)).toBeLessThan(made.indexOf(first.city));
            expect(first.city.towersShow).toBe(first.bay.texture);
            // The sun in them, bright, and in its own direction however the scene stood.
            expect(first.city.glow && first.bay.glow).toBe(true);
            const direction = lit.sun.position.clone().normalize();
            expect(first.city.sunDirection.dot(direction)).toBeCloseTo(1, 6);
            expect(first.bay.sunDirection.dot(direction)).toBeCloseTo(1, 6);
            expect(lit.glow.position.clone().normalize().dot(direction)).toBeCloseTo(1, 6);
            expect(first.city.far).toBeGreaterThan(Math.hypot(...lit.glow.position.toArray()));
            // And afterward: back in place, the sun disc hidden from the view.
            expect(lit.scene.position.toArray()).toEqual([0, 0, 0]);
            expect(lit.glow.visible).toBe(false);
            for (const mesh of lit.towers.meshes) expect(mesh.material.envMap).toBe(first.city.texture);
            expect(lit.water.material.envMap).toBe(first.bay.texture);
            expect(lit.scene.environment).toBe(first.bay.texture);
            const dusk = lighting(lightAt(new Date(2026, 8, 24), 19));
            const second = lit.updateEnvironment({}, dusk);
            expect(first.city.disposed && first.bay.disposed).toBe(true);
            expect(second.city.disposed || second.bay.disposed).toBe(false);
            expect(lit.water.material.envMap).toBe(second.bay.texture);
        } finally {
            THREE.PMREMGenerator = real;
        }
    });

    test('the glass reflects strongly, with a little body color for the daylight to show', () => {
        for (const mesh of lit.towers.meshes) {
            expect(mesh.material.envMapIntensity).toBe(worldMod.GLASS.reflect);
            expect(mesh.material.metalness).toBe(worldMod.GLASS.metalness);
        }
        expect(worldMod.GLASS.reflect).toBeGreaterThan(1);
        expect(worldMod.GLASS.metalness).toBeGreaterThan(0.6);
        expect(worldMod.GLASS.metalness).toBeLessThan(1);
    });

    test('the finish can be tried in the console, and says what it is', () => {
        const before = lit.tune();
        expect(before).toEqual({ glass: worldMod.GLASS.reflect, metal: worldMod.GLASS.metalness, water: bay.BAY.reflect });
        expect(lit.tune({ glass: 2, metal: 0.7, water: 1.1 })).toEqual({ glass: 2, metal: 0.7, water: 1.1 });
        for (const mesh of lit.towers.meshes) expect(mesh.material.envMapIntensity).toBe(2);
        // Anything not a number leaves that part alone.
        expect(lit.tune({ glass: 'bright' })).toEqual({ glass: 2, metal: 0.7, water: 1.1 });
        lit.tune({ glass: before.glass, metal: before.metal, water: before.water });
    });

    test('the clouds are a see-through deck high over everything, painted, repeated, hazed and lit for the hour', async () => {
        const deck = lit.clouds;
        expect(deck.name).toBe('clouds');
        expect(deck.material.transparent).toBe(true);
        expect(deck.material.depthWrite).toBe(false);
        expect(deck.material.fog).toBe(true);
        expect(deck.position.y).toBe(city.WATER_Y + sky.CLOUDS.altitude);
        // Facing down, to be seen from below.
        const down = new THREE.Vector3(0, 0, 1).applyEuler(deck.rotation);
        expect(down.y).toBeCloseTo(-1, 9);
        expect(deck.material.map.repeat.x).toBeCloseTo(sky.CLOUDS.span / sky.CLOUDS.tile, 9);
        expect(deck.material.map.wrapS).toBe(THREE.RepeatWrapping);
        const { lighting, lightAt } = await import('../www/office/js/daylight.js');
        lit.setLight(lighting(lightAt(new Date(2026, 8, 24), 2)));
        const night = deck.material.color.getHex(THREE.SRGBColorSpace);
        lit.setLight(lighting(lightAt(new Date(2026, 8, 24), 12)));
        expect(deck.material.color.getHex(THREE.SRGBColorSpace)).toBe(0xffffff);
        expect(night).not.toBe(0xffffff);
        // Without a painted tile (a headless boot) it is a faint plain deck.
        expect(world.clouds.material.map).toBeNull();
        expect(world.clouds.material.opacity).toBeLessThan(1);
    });

    test('the glass is a mirror by day: every tint reflects at least a third of the light', () => {
        for (const hex of worldMod.GLASS_TONES) {
            const c = new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
            expect(0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b).toBeGreaterThan(0.33);
        }
    });
});
