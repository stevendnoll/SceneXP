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
    // What is drawn: a raycaster meets hidden things too.
    const shown = (o) => (o ? o.visible && shown(o.parent) : true);
    const hit = ray.intersectObject(world.scene, true).find((h) => shown(h.object));
    if (!hit) return { what: 'nothing' };
    let o = hit.object;
    while (o.parent && o.parent !== world.scene && !o.name) o = o.parent;
    const name = o.name || (o.parent && o.parent.name) || 'unnamed';
    // The towers are one mesh per facade style and one for the roofs, and
    // the clouds (see-through between them), the sun, its halo, the moon
    // and the stars are all the sky.
    const kinds = { land: 'land', towers: 'towers', clouds: 'sky', sun: 'sky', moon: 'sky', stars: 'sky' };
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
        // The street lamps glow, but low, so the streets read as streets
        // and the cars' lights show on them (QA, 2026-09-24: "neon").
        const glow = lit.scene.getObjectByName('land-downtown').material.emissiveIntensity;
        expect(glow).toBeCloseTo(worldMod.STREET_GLOW, 6);
        expect(glow).toBeGreaterThan(0.2);
        expect(glow).toBeLessThan(0.5);
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

// ---- Day and night ----------------------------------------------------------------

describe('the sun, the moon and the stars', () => {
    let lit;
    let daylight;
    const DAY = new Date(2026, 8, 24);
    const at = (h) => new Date(DAY.getFullYear(), DAY.getMonth(), DAY.getDate(), 0, 0, 0, h * 3600000);
    /** Light the world as it is at hour `h` today, and say what the sky was. */
    const lightAt = (h) => {
        const moment = h instanceof Date ? h : at(h);
        const now = sky.skyAt(moment);
        lit.setLight(daylight.lighting(daylight.lightAt(moment)), now);
        lit.scene.updateMatrixWorld(true);
        return now;
    };
    const along = (mesh) => mesh.position.clone().normalize();

    beforeAll(async () => {
        daylight = await import('../www/office/js/daylight.js');
        const tex = () => new THREE.Texture();
        lit = worldMod.buildWorld(CONFIG, { textures: { clouds: tex(), moon: tex(), glow: tex() } });
    });

    test('the sun’s disc and halo hang where the sun is, far off, facing the office, and the light comes from it', () => {
        const now = lightAt(15);
        const { disc, halo } = lit.heavens;
        expect(along(disc).dot(new THREE.Vector3(...now.sun))).toBeCloseTo(1, 6);
        expect(disc.position.length()).toBeCloseTo(worldMod.SKY_DISTANCE, 0);
        expect(halo.position.equals(disc.position)).toBe(true);
        // Facing the office: its front (+z) points back along the way to it.
        const front = new THREE.Vector3(0, 0, 1).applyQuaternion(disc.quaternion);
        expect(front.dot(along(disc))).toBeCloseTo(-1, 6);
        expect(disc.visible && halo.visible).toBe(true);
        expect(lit.sun.position.clone().normalize().toArray()).toEqual(sky.lightFrom(now).map((v) => expect.closeTo(v, 6)));
        // Past everything but the sky dome, and inside the camera's reach.
        expect(worldMod.SKY_DISTANCE * 1.2).toBeLessThan(140000);
        expect(worldMod.SKY_DISTANCE * 1.2).toBeLessThan(lit.camera.far);
        lightAt(23);
        expect(disc.visible || halo.visible).toBe(false);
    });

    test('from the window, the sun goes down behind the mountains', () => {
        const { sunset } = daylight.sunTimes(DAY);
        const now = lightAt(sunset - 2 / 60);
        const cam = cameraAt('window', 16 / 10);
        const ray = new THREE.Raycaster(cam.position, new THREE.Vector3(...now.sun));
        const [hit] = ray.intersectObjects([lit.scene.getObjectByName('mountains'), lit.scene.getObjectByName('land-hills')], true);
        expect(hit).toBeTruthy();
        // An hour earlier it stands clear above them.
        const earlier = lightAt(sunset - 1);
        const [none] = new THREE.Raycaster(cam.position, new THREE.Vector3(...earlier.sun))
            .intersectObjects([lit.scene.getObjectByName('mountains'), lit.scene.getObjectByName('land-hills')], true);
        expect(none).toBeUndefined();
    });

    test('the sky is brightest round the sun, and a sunset lights the western horizon', () => {
        const pos = lit.sky.geometry.attributes.position;
        const col = lit.sky.geometry.attributes.color;
        const brightness = (dir) => {
            let best = -2;
            let at = 0;
            for (let i = 0; i < pos.count; i++) {
                const d = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize().dot(dir);
                if (d > best) { best = d; at = i; }
            }
            return col.getX(at) + col.getY(at) + col.getZ(at);
        };
        const now = lightAt(15);
        const toSun = new THREE.Vector3(...now.sun);
        expect(brightness(toSun)).toBeGreaterThan(brightness(toSun.clone().negate().setY(toSun.y)));
        const { sunset } = daylight.sunTimes(DAY);
        lightAt(sunset);
        const west = new THREE.Vector3(0, 0.05, -1).normalize();
        const east = new THREE.Vector3(0, 0.05, 1).normalize();
        expect(brightness(west)).toBeGreaterThan(brightness(east));
        // Without a glow, the dome is just its two colors.
        worldMod.paintSky(lit.sky, 0x000000, 0x000000);
        expect(brightness(west)).toBe(0);
    });

    test('the moon faces the office with its lit side toward the sun, bright by night and pale by day', () => {
        // Find, over the coming month, a moment when the moon is well up by
        // night, one by day, and one when it is down.
        const moments = Array.from({ length: 30 * 48 }, (_, i) => new Date(DAY.getTime() + i * 1800000));
        const up = (m) => sky.skyAt(m).moonHeight > 0.2;
        const nightHour = moments.find((m) => up(m) && daylight.lightAt(m).phase === 'night');
        const dayHour = moments.find((m) => up(m) && daylight.lightAt(m).phase === 'day');
        const now = lightAt(nightHour);
        const { moon } = lit.heavens;
        expect(moon.visible).toBe(true);
        expect(along(moon).dot(new THREE.Vector3(...now.moon))).toBeCloseTo(1, 6);
        const front = new THREE.Vector3(0, 0, 1).applyQuaternion(moon.quaternion);
        expect(front.dot(along(moon))).toBeCloseTo(-1, 6);
        // The painted tile's right (+x) is the side toward the sun.
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(moon.quaternion);
        expect(right.dot(new THREE.Vector3(...now.sun))).toBeGreaterThan(0);
        expect(moon.material.opacity).toBe(1);
        lightAt(dayHour);
        expect(moon.material.opacity).toBeLessThan(0.5);
        expect(moon.material.opacity).toBeGreaterThan(0);
        // Below the horizon, hidden.
        const downHour = moments.find((m) => sky.skyAt(m).moonHeight < -0.2);
        lightAt(downHour);
        expect(moon.visible).toBe(false);
    });

    test('the stars come out by night and turn east to west about the pole', () => {
        const { stars } = lit.heavens;
        lightAt(12);
        expect(stars.visible).toBe(false);
        const now = lightAt(1);
        expect(stars.visible).toBe(true);
        expect(stars.material.opacity).toBe(1);
        // A star on the meridian, high in the south: where the turn puts it,
        // and a little later.
        const star = new THREE.Vector3(...sky.direction(0, 0));
        const spin = (turn) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...sky.POLE), -turn);
        const later = star.clone().applyQuaternion(spin(0.1));
        expect(later.z).toBeLessThan(0);
        expect(later.y).toBeLessThan(star.y);
        expect(stars.quaternion.angleTo(spin(now.turn))).toBeCloseTo(0, 6);
        // The pole itself stays put.
        const pole = new THREE.Vector3(...sky.POLE);
        expect(pole.clone().applyQuaternion(stars.quaternion).distanceTo(pole)).toBeCloseTo(0, 6);
    });

    test('a sun that has set shines in no glass: the reflections by night have no sun in them', () => {
        const real = THREE.PMREMGenerator;
        const seen = [];
        THREE.PMREMGenerator = class {
            fromScene() {
                seen.push(lit.glow.visible);
                return { texture: {}, dispose() {} };
            }
        };
        try {
            lightAt(23);
            lit.updateEnvironment({}, daylight.lighting(daylight.lightAt(at(23))));
            lightAt(14);
            lit.updateEnvironment({}, daylight.lighting(daylight.lightAt(at(14))));
            expect(seen).toEqual([false, false, true, true]);
        } finally {
            THREE.PMREMGenerator = real;
        }
    });
});

// ---- What moves ---------------------------------------------------------------------

describe('life on the water and in the streets', () => {
    let lit;
    let life;
    const NOON = new Date(2026, 8, 24, 12, 0);
    const later = (m) => new Date(NOON.getTime() + m * 60000);

    beforeAll(async () => {
        life = await import('../www/office/js/life.js');
        lit = worldMod.buildWorld(CONFIG, { textures: { clouds: new THREE.Texture() } });
    });

    /** Whether the window sees any of a craft: a few points of its box, in
     *  frame, with nothing drawn in front of them. */
    function seen(cam, group) {
        if (!group.visible) return false;
        lit.scene.updateMatrixWorld(true);
        const frustum = new THREE.Frustum().setFromProjectionMatrix(
            new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)
        );
        const box = new THREE.Box3().setFromObject(group);
        const shown = (o) => (o ? o.visible && shown(o.parent) : true);
        // Eighteen points through the craft's box, low and high.
        const points = [];
        for (const fx of [0.2, 0.5, 0.8]) for (const fy of [0.3, 0.7]) for (const fz of [0.2, 0.5, 0.8]) points.push([fx, fy, fz]);
        return points.some(([fx, fy, fz]) => {
            const p = new THREE.Vector3(
                box.min.x + (box.max.x - box.min.x) * fx, box.min.y + (box.max.y - box.min.y) * fy, box.min.z + (box.max.z - box.min.z) * fz
            );
            if (!frustum.containsPoint(p)) return false;
            const dir = p.clone().sub(cam.position);
            const ray = new THREE.Raycaster(cam.position, dir.clone().normalize(), 0.05, dir.length() + 1);
            if (ray.intersectObject(room.group, true).length) return false;
            let o = (ray.intersectObject(lit.scene, true).find((h) => shown(h.object)) || {}).object;
            while (o && o !== group) o = o.parent;
            return o === group;
        });
    }

    test('everything starts hidden and far below the water, never at the office’s own spot', () => {
        const fresh = worldMod.buildWorld(CONFIG);
        const { ferries, ships, sailboats, seaplane, cars } = fresh.fleet;
        for (const c of [...ferries, ...ships, ...sailboats, seaplane]) {
            expect(c.group.visible).toBe(false);
            expect(c.group.position.y).toBeLessThan(-1000);
        }
        expect(cars.visible).toBe(false);
    });

    test('each craft stands where its timetable says, and hides when it is not out', () => {
        lit.setLife(NOON, 0);
        const ferries = life.ferriesAt(NOON, life.ferryRoute());
        lit.fleet.ferries.forEach((c, i) => {
            expect(c.group.position.x).toBeCloseTo(ferries[i].x, 6);
            expect(c.group.position.z).toBeCloseTo(ferries[i].z, 6);
            expect(c.group.rotation.y).toBeCloseTo(ferries[i].yaw, 6);
            expect(c.group.visible).toBe(true);
        });
        const ships = life.shipsAt(NOON);
        for (const s of ships) {
            const c = lit.fleet.ships[((s.k % 3) + 3) % 3];
            expect(c.group.position.x).toBeCloseTo(s.x, 6);
            expect(c.group.visible).toBe(true);
        }
        expect(lit.fleet.ships.filter((c) => c.group.visible)).toHaveLength(ships.length);
        lit.setLife(new Date(2026, 8, 24, 23, 0), 0);
        expect(lit.fleet.sailboats.every((c) => !c.group.visible)).toBe(true);
        lit.setLife(new Date(2026, 8, 24, 12, 40), 0);
        expect(lit.fleet.seaplane.group.visible).toBe(false);
        lit.setLife(new Date(2026, 8, 24, 12, 21), 0);
        expect(lit.fleet.seaplane.group.visible).toBe(true);
        expect(lit.fleet.seaplane.group.rotation.x).toBeGreaterThan(0);
    });

    test('a craft under way leaves a wake, one at rest none, and the wake fades out behind it', () => {
        const trail = lit.fleet.ferries[0].trail;
        const docked = life.ferriesAt(NOON, life.ferryRoute());
        lit.setLife(NOON, 0);
        expect(trail.material.opacity).toBeCloseTo(0.55 * docked[0].speed, 6);
        const moving = life.ferriesAt(later(17), life.ferryRoute());
        lit.setLife(later(17), 0);
        expect(trail.material.opacity).toBeCloseTo(0.55 * moving[0].speed, 6);
        const color = trail.geometry.attributes.color;
        expect(color.itemSize).toBe(4);
        const alphas = Array.from({ length: color.count }, (_, i) => color.getW(i));
        expect(Math.max(...alphas)).toBeGreaterThan(0.5);
        expect(Math.min(...alphas)).toBe(0);
        expect(trail.material.side).toBe(THREE.DoubleSide);
    });

    test('from the window a ferry is in sight all through its cycle, down the office’s street', () => {
        const cam = cameraAt('window', 16 / 10);
        for (let m = 0; m < life.LIFE.ferry.cycle; m += 5) {
            lit.setLife(later(m), 0);
            expect(lit.fleet.ferries.some((c) => seen(cam, c.group))).toBe(true);
        }
    });

    test('from the window the sailboats are in sight by day, and a ship passes now and then', () => {
        const cam = cameraAt('window', 16 / 10);
        lit.setLife(NOON, 0);
        expect(lit.fleet.sailboats.some((c) => seen(cam, c.group))).toBe(true);
        let ship = false;
        for (let m = 0; m < 150 && !ship; m += 2) {
            lit.setLife(later(m), 0);
            ship = lit.fleet.ships.some((c) => seen(cam, c.group));
        }
        expect(ship).toBe(true);
    });

    test('from the window the seaplane is seen taking off', () => {
        const cam = cameraAt('window', 16 / 10);
        let flying = false;
        for (let s = 0; s < 240 && !flying; s += 10) {
            lit.setLife(new Date(2026, 8, 24, 12, 20, s), 0);
            flying = seen(cam, lit.fleet.seaplane.group) && lit.fleet.seaplane.group.position.y > city.WATER_Y;
        }
        expect(flying).toBe(true);
    });

    test('by night the ferries’ windows glow and the streets below fill with headlights and taillights', () => {
        const cam = cameraAt('window', 16 / 10);
        lit.fleet.light(1);
        expect(lit.fleet.cars.visible).toBe(true);
        expect(lit.fleet.ferries[0].lit.material.emissiveIntensity).toBeGreaterThan(1);
        lit.setLife(NOON, 30);
        lit.scene.updateMatrixWorld(true);
        const frustum = new THREE.Frustum().setFromProjectionMatrix(
            new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)
        );
        const shown = (o) => (o ? o.visible && shown(o.parent) : true);
        const pos = lit.fleet.cars.geometry.attributes.position;
        let inView = 0;
        for (let i = 0; i < pos.count; i++) {
            const p = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
            if (!frustum.containsPoint(p)) continue;
            const dir = p.clone().sub(cam.position);
            const ray = new THREE.Raycaster(cam.position, dir.clone().normalize(), 0.05, dir.length() - 2);
            if (ray.intersectObject(room.group, true).length) continue;
            if (ray.intersectObject(lit.scene, true).some((h) => shown(h.object) && h.object.name !== 'cars')) continue;
            inView++;
        }
        expect(inView).toBeGreaterThanOrEqual(10);
        // They move on real seconds.
        const before = pos.getX(0) + pos.getZ(0);
        lit.setLife(NOON, 31);
        expect(pos.getX(0) + pos.getZ(0)).not.toBeCloseTo(before, 3);
        lit.fleet.light(0);
        expect(lit.fleet.cars.visible).toBe(false);
        expect(lit.fleet.ferries[0].lit.material.emissiveIntensity).toBe(0);
    });

    test('the wind drifts the clouds and the ripples', () => {
        lit.setLife(NOON, 0);
        const a = lit.clouds.material.map.offset.clone();
        const r = lit.water.material.normalMap.offset.clone();
        lit.setLife(later(1), 50);
        expect(lit.clouds.material.map.offset.equals(a)).toBe(false);
        expect(lit.water.material.normalMap.offset.equals(r)).toBe(false);
        // Without a painted cloud tile nothing breaks.
        expect(() => world.setLife(NOON, 0)).not.toThrow();
    });

});

// fleet.js is reached through its .min build from world.js, which hides it
// from coverage (the ".min imports hide coverage" note), so its source is
// built directly here.
describe('the fleet, built from its source', () => {
    let fleetMod;
    let life;
    beforeAll(async () => {
        fleetMod = await import('../www/office/js/fleet.js');
        life = await import('../www/office/js/life.js');
    });

    test('a list of boxes is one geometry, each box its own color, where it was put', () => {
        const g = fleetMod.boxesGeometry([[0, 1, 0, 2, 2, 2, 0xff0000], [10, 1, 0, 2, 2, 2, 0x0000ff]]);
        expect(g.attributes.position.count).toBe(72);
        g.computeBoundingBox();
        expect(g.boundingBox.min.toArray()).toEqual([-1, 0, -1]);
        expect(g.boundingBox.max.toArray()).toEqual([11, 2, 1]);
        const color = g.attributes.color;
        expect(color.getX(0)).toBeCloseTo(1, 6);
        expect(color.getZ(71)).toBeCloseTo(1, 6);
        expect(color.getX(71)).toBeCloseTo(0, 6);
    });

    test('a wake spreads back from the stern, white, fading to nothing', () => {
        const g = fleetMod.wakeGeometry(100);
        const pos = g.attributes.position;
        const zs = Array.from({ length: pos.count }, (_, i) => pos.getZ(i));
        expect(Math.min(...zs)).toBeCloseTo(50, 6);
        expect(Math.max(...zs)).toBeCloseTo(350, 6);
        const color = g.attributes.color;
        for (let i = 0; i < pos.count; i++) {
            expect(color.getX(i)).toBe(1);
            // The far end has faded out, the stern has not.
            if (pos.getZ(i) > 300) expect(color.getW(i)).toBe(0);
            if (pos.getZ(i) === 50) expect(color.getW(i)).toBeGreaterThan(0.5);
        }
    });

    test('the fleet is built into a scene hidden, lights up for the evening, and is placed or hidden by the timetable', () => {
        const scene = new THREE.Scene();
        const lanes = life.carLanes();
        const fleet = fleetMod.buildFleet(scene, life.carFleet(lanes));
        expect(fleet.ferries).toHaveLength(2);
        expect(fleet.ships).toHaveLength(3);
        expect(fleet.sailboats).toHaveLength(life.LIFE.sailboat.count);
        expect(scene.getObjectByName('seaplane')).toBe(fleet.seaplane.group);
        expect(scene.getObjectByName('cars')).toBe(fleet.cars);
        expect(fleet.cars.geometry.attributes.color.count).toBe(life.LIFE.cars.count);
        // The small craft are enlarged past life; the ships are true size.
        expect(fleet.sailboats[0].group.scale.x).toBe(life.LIFE.sailboat.scale);
        expect(fleet.ships[0].group.scale.x).toBe(1);
        fleet.light(0.8);
        expect(fleet.ferries[1].lit.material.emissiveIntensity).toBeCloseTo(0.8 * 1.4, 9);
        expect(fleet.cars.visible).toBe(true);
        fleet.light(0.1);
        expect(fleet.cars.visible).toBe(false);
        const boat = fleet.sailboats[0];
        fleetMod.place(boat, { x: 10, y: -195, z: -2000, yaw: 0.5, heel: 0.2, out: true });
        expect(boat.group.visible).toBe(true);
        expect(boat.group.rotation.toArray().slice(0, 3)).toEqual([0, 0.5, 0.2]);
        expect(boat.group.rotation.order).toBe('YXZ');
        fleetMod.place(boat, { x: 10, y: -195, z: -2000, out: false });
        expect(boat.group.visible).toBe(false);
        fleetMod.place(boat, null);
        expect(boat.group.visible).toBe(false);
        expect(boat.group.position.y).toBeLessThan(-1000);
        const ferry = fleet.ferries[0];
        fleetMod.place(ferry, { x: 0, y: -195, z: -3000, yaw: 0, speed: 1 });
        expect(ferry.trail.material.opacity).toBeCloseTo(0.55, 9);
        fleetMod.place(ferry, { x: 0, y: -195, z: -3000, yaw: 0 });
        expect(ferry.trail.material.opacity).toBe(0);
    });
});

// ---- Rain on some days ------------------------------------------------------------

describe('in the rain', () => {
    let wet;
    let weatherMod;
    let daylight;
    const NOON = new Date(2026, 8, 24, 12, 0);
    const lookFor = (w) => weatherMod.weathered(daylight.lighting(daylight.lightAt(NOON)), w);

    beforeAll(async () => {
        weatherMod = await import('../www/office/js/weather.js');
        daylight = await import('../www/office/js/daylight.js');
        wet = worldMod.buildWorld(CONFIG, { textures: { clouds: new THREE.Texture() } });
    });

    test('a low gray deck closes over the sky, the haze closes in, and the water roughens', () => {
        wet.setLight(lookFor({ overcast: 1, rain: 1 }));
        const { deck } = wet.weather;
        expect(deck.visible).toBe(true);
        expect(deck.material.opacity).toBeGreaterThan(0.9);
        expect(deck.position.y).toBe(city.WATER_Y + worldMod.OVERCAST_ALTITUDE);
        // Under the mountains' tops, which go up into it.
        expect(worldMod.OVERCAST_ALTITUDE).toBeLessThan(Math.max(...city.olympics().peaks.map(([, h]) => h)));
        expect(wet.scene.fog.far).toBeLessThan(bay.HAZE.far / 5);
        expect(wet.water.material.roughness).toBeGreaterThan(bay.BAY.roughness + 0.2);
        wet.setLight(lookFor({ overcast: 0, rain: 0 }));
        expect(deck.visible).toBe(false);
        expect(wet.scene.fog.far).toBe(bay.HAZE.far);
        expect(wet.water.material.roughness).toBe(bay.BAY.roughness);
    });

    test('from the window the mountains are lost in heavy rain and back when it clears', () => {
        const cam = cameraAt('window', 16 / 10);
        const mountains = new THREE.Vector3(0, city.WATER_Y + 800, city.olympics().z + city.olympics().depth / 2);
        const distance = mountains.distanceTo(cam.position);
        wet.setLight(lookFor({ overcast: 1, rain: 1 }));
        expect(distance).toBeGreaterThan(wet.scene.fog.far);
        wet.setLight(lookFor({ overcast: 0, rain: 0 }));
        expect(distance).toBeLessThan(wet.scene.fog.far * 0.65);
    });

    test('rain falls past the window, but is held back for a visitor who asked for less motion', () => {
        wet.setLight(lookFor({ overcast: 1, rain: 0.8 }));
        const { rain } = wet.weather;
        wet.setLife(NOON, 10);
        expect(rain.visible).toBe(true);
        expect(rain.material.opacity).toBeCloseTo(0.35 * 0.8, 9);
        const ends = rain.geometry.attributes.position;
        const before = ends.getY(0);
        wet.setLife(NOON, 10.05);
        expect(ends.getY(0)).not.toBeCloseTo(before, 3);
        wet.setLife(NOON, 11, true);
        expect(rain.visible).toBe(false);
        // In the rain the sailboats are in.
        wet.setLife(NOON, 12);
        expect(wet.fleet.sailboats.every((c) => !c.group.visible)).toBe(true);
        wet.setLight(lookFor({ overcast: 0, rain: 0 }));
        wet.setLife(NOON, 12);
        expect(rain.visible).toBe(false);
    });

    test('the rain and its gray deck are sky: a census ray or a tap passes through them', () => {
        wet.setLight(lookFor({ overcast: 1, rain: 1 }));
        wet.setLife(NOON, 5);
        wet.scene.updateMatrixWorld(true);
        const hits = new THREE.Raycaster(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.1, 0.9, -0.4).normalize())
            .intersectObject(wet.scene, true)
            .map((h) => h.object.name);
        expect(hits).not.toContain('overcast');
        expect(hits).not.toContain('rain');
    });

    test('drops bead on the window glass as it rains, and the glass never stops a tap', async () => {
        const { buildRoom } = await import('../www/office/js/room.js');
        const glassy = buildRoom(CONFIG, { rainGlass: new THREE.Texture() });
        const { panes, set } = glassy.rain;
        expect(panes).toHaveLength(2);
        set(0);
        expect(panes.every((p) => !p.visible)).toBe(true);
        set(0.6);
        expect(panes.every((p) => p.visible)).toBe(true);
        expect(panes[0].material.opacity).toBeCloseTo(0.72, 9);
        set(1);
        expect(panes[0].material.opacity).toBe(1);
        // A tile of drops every RAIN_TILE meters of glass, so a drop is
        // millimeters however near the eye (QA, 2026-09-24: blobs).
        const roomMod = await import('../www/office/js/room.js');
        const uv = panes[0].geometry.attributes.uv;
        const pos = panes[0].geometry.attributes.position;
        const du = Math.abs(uv.getX(1) - uv.getX(0));
        const dx = Math.abs(pos.getX(1) - pos.getX(0));
        expect(dx / du).toBeCloseTo(roomMod.RAIN_TILE, 6);
        expect(panes[0].material.map.wrapS).toBe(THREE.RepeatWrapping);
        // In the window openings, facing into the room.
        const w = (await import('../www/office/js/room.js')).windowsOf(CONFIG);
        expect(panes[0].position.y).toBeCloseTo((w.sill + w.head) / 2, 9);
        expect(panes[0].position.z).toBeGreaterThan(-CONFIG.room.depth / 2);
        expect(panes[1].position.x).toBeLessThan(CONFIG.room.width / 2);
        glassy.group.updateMatrixWorld(true);
        const through = new THREE.Raycaster(new THREE.Vector3(panes[0].position.x, panes[0].position.y, 0), new THREE.Vector3(0, 0, -1));
        expect(through.intersectObjects(panes).length).toBe(0);
        // Without a painted tile (a headless boot) the glass stays clear.
        const plain = buildRoom(CONFIG);
        plain.rain.set(1);
        expect(plain.rain.panes.every((p) => !p.visible)).toBe(true);
    });

    test('the room’s shell is a few meshes, one a material, with every box where it was', async () => {
        const { mergeByMaterial } = await import('../www/office/js/room.js');
        const shells = room.group.children.filter((o) => o.name === 'shell');
        expect(shells.length).toBeGreaterThan(3);
        expect(shells.length).toBeLessThan(10);
        expect(new Set(shells.map((m) => m.material)).size).toBe(shells.length);
        const a = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
        a.position.set(5, 0, 0);
        const b = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), a.material);
        b.rotation.x = -Math.PI / 2;
        const [merged, ...rest] = mergeByMaterial([a, b]);
        expect(rest).toHaveLength(0);
        merged.geometry.computeBoundingBox();
        expect(merged.geometry.boundingBox.max.x).toBeCloseTo(5.5, 6);
        expect(merged.geometry.boundingBox.min.x).toBeCloseTo(-1, 6);
        // The laid-down plane's normals turned with it: up.
        const n = merged.geometry.attributes.normal;
        expect(n.getY(n.count - 1)).toBeCloseTo(1, 6);
        expect(merged.geometry.attributes.uv).toBeTruthy();
        const other = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
        expect(mergeByMaterial([a, other])).toHaveLength(2);
        const bare = new THREE.BufferGeometry();
        bare.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
        const [noUv] = mergeByMaterial([new THREE.Mesh(bare, other.material), other]);
        expect(noUv.geometry.attributes.uv).toBeUndefined();
    });
});

// ---- The QA polish of 2026-09-24 ----------------------------------------------------

describe('after the screenshots', () => {
    test('the lit windows repeat only every few dozen meters, not every few panels', () => {
        expect(city.PANEL.width * city.FACADE_TILE.cols).toBeGreaterThanOrEqual(20);
        expect(city.PANEL.floor * city.FACADE_TILE.rows).toBeGreaterThanOrEqual(40);
    });

    test('a low sun full on a rooftop box does not burn it white', () => {
        // Its lit brightness: its color times the most light there is, the
        // sun's, the sky's and the reflections' (about one), kept under 0.75.
        const most = 1.52 * 1.2 + 0.92 * 1.1 + 1;
        for (const kind of ['roof', 'terrace', 'podium', 'penthouse', 'helipad']) {
            const c = new THREE.Color().setHex(worldMod.ROOF_COLORS[kind], THREE.SRGBColorSpace);
            expect(Math.max(c.r, c.g, c.b) * most).toBeLessThan(0.75);
        }
    });

    test('at dawn the warmth is round the sun in the east, and the west and the bay stay cool', async () => {
        const daylight = await import('../www/office/js/daylight.js');
        const day = new Date(2026, 8, 24);
        const moment = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, daylight.sunTimes(day).sunrise * 3600000);
        const look = daylight.lighting(daylight.lightAt(moment));
        const dawn = worldMod.buildWorld(CONFIG);
        dawn.setLight(look, sky.skyAt(moment));
        const pos = dawn.sky.geometry.attributes.position;
        const col = dawn.sky.geometry.attributes.color;
        const warmth = (dir) => {
            let best = -2;
            let at = 0;
            for (let i = 0; i < pos.count; i++) {
                const d = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize().dot(dir);
                if (d > best) { best = d; at = i; }
            }
            return col.getX(at) - col.getZ(at);
        };
        const east = warmth(new THREE.Vector3(0, 0.05, 1).normalize());
        const west = warmth(new THREE.Vector3(0, 0.05, -1).normalize());
        expect(east).toBeGreaterThan(west + 0.15);
        // The haze (the fog is the horizon's color) over the bay is not tan.
        const fog = dawn.scene.fog.color;
        expect(fog.r - fog.b).toBeLessThan(0.08);
    });

    test('the swell bends the reflection softly', () => {
        expect(world.water.material.normalScale.x).toBe(bay.BAY.normalScale);
        expect(bay.BAY.normalScale).toBeLessThan(1);
    });
});
