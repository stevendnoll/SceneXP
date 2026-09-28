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
    world = buildWorld(CONFIG);
    world.scene.updateMatrixWorld(true);
});

afterAll(() => {
    delete globalThis.THREE;
});

const ASPECTS = { 'wide 21:9': 21 / 9, 'laptop 16:10': 16 / 10, 'phone upright': 390 / 844, 'tall phone': 9 / 19.5 };

/**
 * The land across the bay is ~180k triangles (it was ~50k before the finer
 * grid), and three's raycaster tries every one for every ray, which doubled
 * this file's run (107 s to 214 s, 2026-09-25). The page never casts a ray
 * outside (taps test the room), so the census alone gets a faster cast: each
 * land mesh split into tiles, `across` by x and `back` by z, each with its
 * own bounds, so a ray tries only the tiles it crosses. The hits are the
 * mesh's own, as three would report them.
 */
function stripCast(mesh, across = 64, back = 12) {
    const g = mesh.geometry;
    const pos = g.attributes.position;
    const index = g.index.array;
    const span = (get) => {
        let lo = Infinity;
        let hi = -Infinity;
        for (let i = 0; i < pos.count; i++) { lo = Math.min(lo, get(i)); hi = Math.max(hi, get(i)); }
        return { lo, width: (hi - lo) / 1 + 1e-6 };
    };
    const xs = span((i) => pos.getX(i));
    const zs = span((i) => pos.getZ(i));
    const parts = Array.from({ length: across * back }, () => []);
    for (let t = 0; t < index.length; t += 3) {
        const col = Math.floor(((pos.getX(index[t]) - xs.lo) / xs.width) * across);
        const row = Math.floor(((pos.getZ(index[t]) - zs.lo) / zs.width) * back);
        parts[row * across + col].push(index[t], index[t + 1], index[t + 2]);
    }
    const probes = parts.filter((p) => p.length).map((p) => {
        const part = new THREE.BufferGeometry();
        part.setAttribute('position', pos);
        part.setIndex(p);
        const box = new THREE.Box3();
        const v = new THREE.Vector3();
        for (const k of p) box.expandByPoint(v.fromBufferAttribute(pos, k));
        part.boundingBox = box;
        part.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
        return new THREE.Mesh(part, mesh.material);
    });
    // Only the tiles the ray crosses are asked at all: asking all of them,
    // each working out its own bounds, cost more than the triangles did.
    const inverse = new THREE.Matrix4();
    const local = new THREE.Ray();
    mesh.raycast = (raycaster, hits) => {
        local.copy(raycaster.ray).applyMatrix4(inverse.copy(mesh.matrixWorld).invert());
        for (const probe of probes) {
            if (!local.intersectsBox(probe.geometry.boundingBox)) continue;
            probe.matrixWorld.copy(mesh.matrixWorld);
            const before = hits.length;
            THREE.Mesh.prototype.raycast.call(probe, raycaster, hits);
            for (let i = before; i < hits.length; i++) hits[i].object = mesh;
        }
    };
}

/** A world built for these tests: the land given its strip cast. */
function buildWorld(config, options) {
    const w = worldMod.buildWorld(config, options);
    for (const mesh of [w.mountains, ...w.hills.children]) stripCast(mesh);
    return w;
}



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
    // The hills across the water (land-hills-*) are hills, not the ground
    // of the city: the far shore's stand higher than the office's eye.
    const kinds = { 'land-hills': 'hills', land: 'land', towers: 'towers', clouds: 'sky', sun: 'sky', moon: 'sky', stars: 'sky' };
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
        // Past the back of the ranges, and then some.
        expect(world.camera.far).toBeGreaterThan(Math.abs(city.farCoastZ(0) - city.MOUNTAINS.bands.mountains.to) * 2);
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
        expect(buildWorld(CONFIG, { anisotropy: 8 }).water.material.normalMap.anisotropy).toBe(8);
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

    test('the mountains have relief: their slopes face every way, and the sun lights some and leaves others (QA, 2026-09-25)', () => {
        const n = world.mountains.geometry.attributes.normal;
        // The old range's near faces all faced one way; these face about.
        let east = 0;
        let west = 0;
        let steep = 0;
        for (let i = 0; i < n.count; i += 5) {
            if (n.getX(i) > 0.2) east++;
            if (n.getX(i) < -0.2) west++;
            // Steeper than 25 degrees.
            if (n.getY(i) < 0.9) steep++;
        }
        expect(east).toBeGreaterThan(n.count / 5 / 10);
        expect(west).toBeGreaterThan(n.count / 5 / 10);
        expect(steep).toBeGreaterThan(n.count / 5 / 10);
        // Dark rock and forest, many colors, not a band. (The snow is laid
        // by the shader, a pixel at a time: the next test.)
        const col = world.mountains.geometry.attributes.color;
        const shades = new Set();
        for (let i = 0; i < col.count; i += 3) shades.add(Math.round((col.getX(i) + col.getY(i) + col.getZ(i)) * 400));
        expect(shades.size).toBeGreaterThan(20);
        // Each square split along a ridge or a gully, so both ways, not all
        // alike (which drew a grain across the whole range).
        const index = world.mountains.geometry.index.array;
        const cols = city.landGrids().mountains.cols;
        let ae = 0;
        for (let t = 0; t < index.length; t += 6) if (index[t + 2] === index[t] + cols + 1) ae++;
        expect(ae / (index.length / 6)).toBeGreaterThan(0.2);
        expect(ae / (index.length / 6)).toBeLessThan(0.8);
    });

    test('the snow is laid on the mountains a pixel at a time, and never on the hills (QA, 2026-09-25)', () => {
        const count = (mesh) => mesh.geometry.attributes.position.count;
        // Every land mesh carries its snow line: the GPU would read a missing
        // one as nought, and snow the hills to the water.
        for (const mesh of [world.mountains, ...world.hills.children]) {
            const line = mesh.geometry.attributes.snowLine;
            expect(line.count).toBe(count(mesh));
            const pos = mesh.geometry.attributes.position;
            let above = 0;
            for (let i = 0; i < line.count; i++) {
                expect(line.getX(i)).toBeGreaterThan(1000);
                if (pos.getY(i) - city.WATER_Y > line.getX(i)) above++;
            }
            if (mesh !== world.mountains) expect(above).toBe(0);
            else expect(above / line.count).toBeGreaterThan(0.02);
        }
        // Spliced into three's own standard shader, every splice landing (a
        // string that no longer matched would silently leave the snow out).
        const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
        world.mountains.material.onBeforeCompile(shader);
        expect(shader.vertexShader).toContain('attribute float snowLine;');
        expect(shader.vertexShader).toContain('vLandPos = position;');
        expect(shader.vertexShader).toContain('vLandNormal = normal;');
        // After the vertex colors, before the light.
        const f = shader.fragmentShader;
        expect(f.indexOf('#include <color_fragment>')).toBeGreaterThan(0);
        expect(f.indexOf('float landCover')).toBeGreaterThan(f.indexOf('#include <color_fragment>'));
        expect(f.indexOf('float landCover')).toBeLessThan(f.indexOf('#include <lights_fragment_begin>'));
        expect(f.indexOf('varying vec3 vLandPos;')).toBeLessThan(f.indexOf('float landCover'));
    });

    test('the land’s shader source is clean GLSL, as far as text can tell', () => {
        // Only a string here: the "GLSL is a string under test" note.
        const snow = worldMod.landSnow();
        expect(snow).not.toContain('`');
        expect(snow).not.toMatch(/NaN|undefined|Infinity/);
        // Every number a float literal, so no int meets a float.
        for (const n of snow.match(/(?<![\w.])-?\d+(\.\d+)?(?![\w.])/g)) expect(n).toContain('.');
        // Every local declared once, before it is used, and no reserved word.
        const reserved = /\b(patch|sample|input|output|filter|common|smooth|flat|active|buffer|shared)\b/;
        const declared = [...snow.matchAll(/float (land\w+) =/g)].map((m) => m[1]);
        expect(new Set(declared).size).toBe(declared.length);
        for (const name of declared) {
            expect(name).not.toMatch(reserved);
            expect(snow.indexOf(`float ${name} =`)).toBeLessThanOrEqual(snow.indexOf(name));
        }
        for (const used of snow.match(/\bland[A-Z]\w*/g)) expect(declared).toContain(used);
        // Brackets balance.
        expect((snow.match(/\(/g) || []).length).toBe((snow.match(/\)/g) || []).length);
        expect((snow.match(/\{/g) || []).length).toBe((snow.match(/\}/g) || []).length);
        // The fray is the JS one's waves, and its sine's argument kept small.
        for (const [kx, kz] of city.SNOW_FRAY) expect(snow).toContain(`vec2( ${kx}, ${kz} )`);
        expect(snow).toContain('6.2831853');
    });

    test('the census’s faster cast on the land finds just what three’s own finds', () => {
        const cam = cameraAt('desk', 16 / 10);
        let hits = 0;
        for (let i = 0; i < 60; i++) {
            const ray = new THREE.Raycaster();
            // Across the frame at the mountains' height (about 1 to 6 degrees up).
            ray.setFromCamera(new THREE.Vector2(-1 + (2 * (i + 0.5)) / 60, 0.5 + (i % 5) * 0.04), cam);
            for (const mesh of [world.mountains, ...world.hills.children]) {
                const fast = [];
                mesh.raycast(ray, fast);
                const full = [];
                THREE.Mesh.prototype.raycast.call(mesh, ray, full);
                const nearest = (list) => (list.length ? Math.min(...list.map((h) => h.distance)) : null);
                expect(nearest(fast)).toBe(nearest(full));
                if (fast.length) {
                    hits++;
                    expect(fast[0].object).toBe(mesh);
                }
            }
        }
        expect(hits).toBeGreaterThan(20);
    });

    test('the land across the bay takes less of the haze than the city, a bluer one, and all of it, gray, in the rain', () => {
        // three's own fog, word for word, with only its amount and color the land's.
        expect(worldMod.LAND_FOG.replace(' * landHaze', '').replace('landAir', 'fogColor')).toBe(THREE.ShaderChunk.fog_fragment);
        // Both swaps land in the real standard shader (a string that no
        // longer matched would silently leave the full haze).
        const shader = {
            uniforms: {},
            vertexShader: THREE.ShaderLib.standard.vertexShader,
            fragmentShader: THREE.ShaderLib.standard.fragmentShader
        };
        world.mountains.material.onBeforeCompile(shader);
        expect(shader.fragmentShader).toContain('uniform float landHaze;');
        expect(shader.fragmentShader).toContain('uniform vec3 landAir;');
        expect(shader.fragmentShader).toContain('mix( gl_FragColor.rgb, landAir, fogFactor * landHaze )');
        expect(shader.fragmentShader).not.toContain('#include <fog_fragment>');
        expect(shader.uniforms.landHaze).toBe(world.landHaze);
        expect(shader.uniforms.landAir).toBe(world.landAir);
        expect(world.mountains.material.customProgramCacheKey()).toBe('office-land');
        // The hills share it.
        for (const hill of world.hills.children) expect(hill.material).toBe(world.mountains.material);
        const daylight = { hemi: 1, sun: 1, fill: 1, skyTop: 0x7fb2dd, skyBottom: 0xe3ecef, sunColor: 0xffffff, clouds: 0xffffff, cityLights: 0, stars: 0, moonShine: 0, halo: 0.3 };
        // The air's color is sRGB as it goes to the GPU (fogColor is, since
        // the fog comes after the color space), so read it back raw.
        const raw = () => world.landAir.value.getHex(THREE.LinearSRGBColorSpace);
        world.setLight({ ...daylight, rain: 1, overcast: 1 });
        expect(world.landHaze.value).toBe(1);
        expect(raw()).toBe(daylight.skyBottom);
        world.setLight({ ...daylight, rain: 0, overcast: 0 });
        expect(world.landHaze.value).toBe(worldMod.LAND_HAZE.clear);
        expect(worldMod.LAND_HAZE.clear).toBeLessThan(1);
        // On a clear day, part of the way from the horizon to the sky
        // overhead: bluer (less red) than the horizon, paler than the zenith.
        const [r, g, b] = [raw() >> 16, (raw() >> 8) & 255, raw() & 255];
        expect(raw()).toBe(0xbbd5e8);
        expect(r).toBeLessThan(daylight.skyBottom >> 16);
        expect(r).toBeGreaterThan(daylight.skyTop >> 16);
        expect(b).toBeGreaterThan(g);
    });

    test('the clouds float over the mountains’ tops, never across them', () => {
        const g = city.landGrids().mountains;
        let peak = 0;
        for (let k = 1; k < g.positions.length; k += 3) peak = Math.max(peak, g.positions[k] - city.WATER_Y);
        expect(sky.CLOUDS.altitude).toBeGreaterThan(peak + 500);
        // Grown with its height, so each puff is where it was in the sky.
        expect(sky.CLOUDS.tile / sky.CLOUDS.altitude).toBeCloseTo(14000 / 2800, 1);
    });

    test('the hills are wooded and snowless, one mesh each, counted as land', () => {
        const group = world.scene.getObjectByName('land-hills');
        expect(group.children.map((m) => m.name)).toEqual(['land-hills-island', 'land-hills-farShore']);
        // Green, and nowhere near the white of snow.
        const snow = new THREE.Color().setHex(city.LAND_COLORS.snow, THREE.SRGBColorSpace);
        for (const mesh of group.children) {
            const col = mesh.geometry.attributes.color;
            let greener = 0;
            for (let i = 0; i < col.count; i++) {
                if (col.getY(i) > col.getX(i)) greener++;
                expect(col.getX(i) + col.getY(i) + col.getZ(i)).toBeLessThan((snow.r + snow.g + snow.b) * 0.6);
            }
            expect(greener / col.count).toBeGreaterThan(0.9);
        }
        expect(world.hills).toBe(group);
    });
});

// ---- Glass, streets and night ---------------------------------------------------

describe('the glass city', () => {
    let lit;
    beforeAll(() => {
        const tex = () => new THREE.Texture();
        const facades = Object.fromEntries(worldMod.STYLES.map((s) => [s, { color: tex(), rm: tex(), lit: tex() }]));
        lit = buildWorld(CONFIG, { textures: { facades, streets: tex(), streetsLit: tex(), clouds: tex() } });
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
        // The lit offices glow, softly (QA, 2026-09-24: "too bright").
        expect(lit.towers.meshes[0].material.emissiveIntensity).toBeCloseTo(worldMod.OFFICE_GLOW, 6);
        expect(worldMod.OFFICE_GLOW).toBeLessThan(1);
        // The street lamps glow, but low, so the streets read as streets
        // and the cars' lights show on them (QA, 2026-09-24: "neon").
        const glow = lit.scene.getObjectByName('land-downtown').material.emissiveIntensity;
        expect(glow).toBeCloseTo(worldMod.STREET_GLOW, 6);
        expect(glow).toBeGreaterThan(0.2);
        expect(glow).toBeLessThanOrEqual(0.5);
        lit.setLight(lighting(lightAt(new Date(2026, 8, 24), 12)));
        expect(lit.beacons.visible).toBe(false);
        expect(lit.towers.meshes[0].material.emissiveIntensity).toBe(0);
        // The beacons are downtown's and, across the bay, the landmarks'
        // only (QA, 2026-09-29: one on every tall island tower ran into a
        // red bar from 12 km).
        expect(lit.plan.length).toBe(city.cityTowers().length + city.islandTowers().length);
        expect(lit.beacons.geometry.attributes.position.count).toBe(city.aviationLights(city.beaconTowers(lit.plan)).length);
        const island = city.aviationLights(city.beaconTowers(city.islandTowers())).length;
        expect(island).toBeGreaterThanOrEqual(1);
        expect(island).toBeLessThanOrEqual(city.ISLAND_CITY.landmarks.length);
        expect(city.aviationLights(city.beaconTowers(city.cityTowers()))).toEqual(city.aviationLights(city.cityTowers()));
    });

    test('by night the island city’s streets glitter with lamps, and by day they are out; never in a ray’s way', async () => {
        const { lighting, lightAt } = await import('../www/office/js/daylight.js');
        const lamps = lit.scene.getObjectByName('island-lamps');
        expect(lamps).toBe(lit.lamps);
        expect(lamps.geometry.attributes.position.count).toBe(city.islandLamps().length);
        lit.setLight(lighting(lightAt(new Date(2026, 8, 24), 22)));
        expect(lamps.visible).toBe(true);
        expect(lamps.material.opacity).toBeGreaterThan(0.5);
        // A point a pixel and a half across whatever the distance.
        expect(lamps.material.sizeAttenuation).toBe(false);
        lit.setLight(lighting(lightAt(new Date(2026, 8, 24), 12)));
        expect(lamps.visible).toBe(false);
        const hits = [];
        lamps.raycast(new THREE.Raycaster(), hits);
        expect(hits).toEqual([]);
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
                    shift: scene.position.clone(), glow: lit.glow.visible, beacons: lit.beacons.visible, near, far,
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
            // By night the beacons are on, but never in a capture (a point
            // in a cube face, blurred for the water, spread into a red blot:
            // QA, 2026-09-29), and on again after.
            lit.setLight(lighting(lightAt(new Date(2026, 8, 24), 22)));
            expect(lit.beacons.visible).toBe(true);
            const night = lit.updateEnvironment({}, lighting(lightAt(new Date(2026, 8, 24), 22)));
            expect(night.bay.beacons || night.city.beacons).toBe(false);
            expect(lit.beacons.visible).toBe(true);
            const second = lit.updateEnvironment({}, dusk);
            expect(night.city.disposed && night.bay.disposed).toBe(true);
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
        lit = buildWorld(CONFIG, { textures: { clouds: tex(), moon: tex(), glow: tex() } });
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
        lit = buildWorld(CONFIG, { textures: { clouds: new THREE.Texture() } });
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
        const fresh = buildWorld(CONFIG);
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

    test('whenever the visitor arrives, a container ship is in sight from the desk and the window, and stays a while (QA, 2026-09-25)', () => {
        const views = [['desk', 16 / 10], ['desk', 390 / 844], ['window', 16 / 10], ['window', 390 / 844]];
        // Points along the hull and the stacks, in the ship's own frame (its
        // box is mostly its wake, so seen()'s points through the box are
        // mostly empty air): seen when the eye finds a few of them.
        const hullSeen = (cam, group) => {
            if (!group.visible) return false;
            lit.scene.updateMatrixWorld(true);
            const frustum = new THREE.Frustum().setFromProjectionMatrix(
                new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)
            );
            const shown = (o) => (o ? o.visible && shown(o.parent) : true);
            let found = 0;
            for (const along of [-0.4, -0.2, 0, 0.2, 0.4]) {
                for (const up of [8, 16]) {
                    const p = new THREE.Vector3(0, up, along * life.LIFE.ship.length).applyMatrix4(group.matrixWorld);
                    if (!frustum.containsPoint(p)) continue;
                    const dir = p.clone().sub(cam.position);
                    const ray = new THREE.Raycaster(cam.position, dir.clone().normalize(), 0.05, dir.length() + 50);
                    if (ray.intersectObject(room.group, true).length) continue;
                    let o = (ray.intersectObject(lit.scene, true).find((h) => shown(h.object)) || {}).object;
                    while (o && o !== group) o = o.parent;
                    if (o === group) found++;
                }
            }
            return found >= 3;
        };
        const anyShip = (cam) => lit.fleet.ships.some((c) => hullSeen(cam, c.group));
        try {
            // Arrivals through a whole cycle of both lanes, day and night.
            for (let m = 0; m < 2 * life.LIFE.ship.every; m += 13) {
                const arrival = later(m);
                lit.arrive(arrival);
                lit.setLife(arrival, 0);
                for (const [station, aspect] of views) expect(`${m} ${station} ${aspect.toFixed(2)}: ${anyShip(cameraAt(station, aspect))}`).toBe(`${m} ${station} ${aspect.toFixed(2)}: true`);
                // Two minutes later, still in sight from every one.
                lit.setLife(later(m + 2), 0);
                for (const [station, aspect] of views) expect(`${m}+2 ${station} ${aspect.toFixed(2)}: ${anyShip(cameraAt(station, aspect))}`).toBe(`${m}+2 ${station} ${aspect.toFixed(2)}: true`);
            }
        } finally {
            // The other tests keep the timetable as it runs by itself.
            expect(lit.arrive(null)).toBe(0);
        }
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
        const cars = life.carFleet(lanes);
        const fleet = fleetMod.buildFleet(scene, cars);
        expect(fleet.ferries).toHaveLength(2);
        expect(fleet.ships).toHaveLength(3);
        expect(fleet.sailboats).toHaveLength(life.LIFE.sailboat.count);
        expect(scene.getObjectByName('seaplane')).toBe(fleet.seaplane.group);
        // A jet for each flight that can be out at once, and one to call.
        expect(fleet.jets).toHaveLength(life.JET.fleet + 1);
        expect(scene.getObjectByName('jet')).toBe(fleet.jets[0].group);
        for (const jet of fleet.jets) {
            expect(jet.group.visible).toBe(false);
            expect(jet.group.scale.x).toBe(life.JET.scale);
        }
        expect(scene.getObjectByName('cars')).toBe(fleet.cars);
        expect(fleet.cars.geometry.attributes.color.count).toBe(cars.length);
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
        // The vehicles stand on the street (their middles ride 1.2 m up),
        // facing their lanes, tilted by a pitch when given one.
        const { vehicles } = fleet;
        expect(vehicles.car.paint.count + vehicles.bus.paint.count).toBe(cars.length);
        const centers = new Float32Array(cars.length * 3).fill(0);
        centers[1] = 11.2;
        const yaws = new Array(cars.length).fill(Math.PI / 2);
        fleet.moveCars(centers, yaws);
        const m = new THREE.Matrix4();
        const first = vehicles[cars[0].kind];
        first.paint.getMatrixAt(vehicles.slot[0], m);
        const p = new THREE.Vector3();
        const q = new THREE.Quaternion();
        m.decompose(p, q, new THREE.Vector3());
        expect(p.y).toBeCloseTo(10, 6);
        expect(new THREE.Vector3(0, 0, -1).applyQuaternion(q).x).toBeCloseTo(-1, 6);
        fleet.moveCars(centers, yaws, new Float32Array(cars.length).fill(0.1));
        first.trim.getMatrixAt(vehicles.slot[0], m);
        m.decompose(p, q, new THREE.Vector3());
        expect(new THREE.Vector3(0, 0, -1).applyQuaternion(q).y).toBeCloseTo(Math.sin(0.1), 6);
        // Every vehicle has its own instance in its kind's meshes.
        for (const kind of ['car', 'bus']) {
            const mine = cars.map((c, i) => (c.kind === kind ? vehicles.slot[i] : -1)).filter((k) => k >= 0);
            expect(new Set(mine).size).toBe(mine.length);
            expect(Math.max(...mine)).toBe(mine.length - 1);
        }
        expect(fleetMod.CAR_COLORS.length).toBeGreaterThan(5);
        expect(fleetMod.BUS_COLORS.length).toBeGreaterThan(1);
        // By night the jet's lights come on, the strobes only when flashing.
        fleet.light(1);
        const aloft = { x: 0, y: 500, z: -5200, yaw: 0, pitch: 0 };
        fleet.flyJets([aloft, null], false);
        expect(fleet.jets[0].navLights.visible).toBe(true);
        expect(fleet.jets[0].strobes.visible).toBe(false);
        fleet.flyJets([aloft, null], true);
        expect(fleet.jets[0].strobes.visible).toBe(true);
        expect(fleet.jets[1].group.visible).toBe(false);
        expect(fleet.jets[1].strobes.visible).toBe(false);
        fleet.flyJets([], true);
        for (const jet of fleet.jets) {
            expect(jet.group.visible).toBe(false);
            expect(jet.strobes.visible).toBe(false);
        }
        // A jet taking a flight takes its airline's colors, and keeps them
        // while it flies (QA, 2026-09-29).
        const colorsOf = (i) => Array.from(fleetMod.jetParts(life.LIVERIES[i]).body.attributes.color.array);
        const hull = () => Array.from(fleet.jets[0].hull.geometry.attributes.color.array);
        expect(hull()).toEqual(colorsOf(0));
        fleet.flyJets([{ ...aloft, livery: 4 }], false);
        expect(fleet.jets[0].livery).toBe(4);
        expect(hull()).toEqual(colorsOf(4));
        expect(colorsOf(4)).not.toEqual(colorsOf(0));
        fleet.flyJets([{ ...aloft, livery: 2 }, { ...aloft, livery: 5 }], false);
        expect(hull()).toEqual(colorsOf(2));
        expect(Array.from(fleet.jets[1].hull.geometry.attributes.color.array)).toEqual(colorsOf(5));
    });

    test('a fleet with no buses in it still builds', () => {
        const scene = new THREE.Scene();
        const lanes = life.carLanes();
        const cars = life.carFleet(lanes).filter((c) => c.kind === 'car');
        const fleet = fleetMod.buildFleet(scene, cars);
        expect(fleet.vehicles.bus.paint.count).toBe(0);
        expect(() => fleet.moveCars(new Float32Array(cars.length * 3), new Array(cars.length).fill(0))).not.toThrow();
    });

    test('the jet is an airliner’s shape: a long fuselage, wings nearly as wide, a tall fin, two engines under the wings', () => {
        const { body, windows } = fleetMod.jetParts();
        body.computeBoundingBox();
        const b = body.boundingBox;
        const length = b.max.z - b.min.z;
        const span = b.max.x - b.min.x;
        expect(length).toBeGreaterThan(38);
        expect(length).toBeLessThan(41);
        expect(span / length).toBeGreaterThan(0.85);
        expect(span / length).toBeLessThan(1.0);
        // The fin stands several meters over the fuselage, at the tail.
        expect(b.max.y).toBeGreaterThan(7);
        const pos = body.attributes.position;
        let finTop = null;
        for (let i = 0; i < pos.count; i++) if (pos.getY(i) === b.max.y) finTop = pos.getZ(i);
        expect(finTop).toBeGreaterThan(10);
        // Every part is solid and turned the right way out: each face, as
        // it is wound (which is the side drawn), faces away from the part's
        // own middle. A panel on the left wing is the one that could be
        // built inside out (its span runs toward -x).
        const inward = (g) => {
            const p = g.attributes.position;
            const middle = new THREE.Vector3();
            for (let i = 0; i < p.count; i++) middle.add(new THREE.Vector3().fromBufferAttribute(p, i));
            middle.divideScalar(p.count);
            let n = 0;
            for (let i = 0; i < p.count; i += 3) {
                const [a, bb, c] = [i, i + 1, i + 2].map((k) => new THREE.Vector3().fromBufferAttribute(p, k));
                const face = bb.clone().sub(a).cross(c.clone().sub(a));
                if (face.lengthSq() < 1e-10) continue;
                const out = a.add(bb).add(c).divideScalar(3).sub(middle);
                if (face.dot(out) < 0) n++;
            }
            return n;
        };
        const { parts } = fleetMod.jetParts();
        expect(parts.length).toBeGreaterThan(8);
        parts.forEach((part) => expect(inward(part)).toBe(0));
        // And the check catches a box built inside out.
        const turned = fleetMod.sweptBox((u, v, w) => [1 - u, v, w], 0xffffff);
        expect(inward(turned)).toBeGreaterThan(0);
        // The engines hang under the wings, one either side.
        const low = [];
        for (let i = 0; i < pos.count; i++) if (pos.getY(i) < -2.6) low.push(pos.getX(i));
        expect(low.some((x) => x > 4) && low.some((x) => x < -4)).toBe(true);
        expect(windows.attributes.position.count).toBeGreaterThan(0);
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
        wet = buildWorld(CONFIG, { textures: { clouds: new THREE.Texture() } });
    });

    test('a low gray deck closes over the sky, the haze closes in, and the water roughens', () => {
        wet.setLight(lookFor({ overcast: 1, rain: 1 }));
        const { deck } = wet.weather;
        expect(deck.visible).toBe(true);
        expect(deck.material.opacity).toBeGreaterThan(0.9);
        expect(deck.position.y).toBe(city.WATER_Y + worldMod.OVERCAST_ALTITUDE);
        // Under the mountains' tops, which go up into it.
        const g = city.landGrids().mountains;
        let peak = 0;
        for (let k = 1; k < g.positions.length; k += 3) peak = Math.max(peak, g.positions[k] - city.WATER_Y);
        expect(worldMod.OVERCAST_ALTITUDE).toBeLessThan(peak);
        expect(wet.scene.fog.far).toBeLessThan(bay.HAZE.far / 5);
        expect(wet.water.material.roughness).toBeGreaterThan(bay.BAY.roughness + 0.2);
        wet.setLight(lookFor({ overcast: 0, rain: 0 }));
        expect(deck.visible).toBe(false);
        expect(wet.scene.fog.far).toBe(bay.HAZE.far);
        expect(wet.water.material.roughness).toBe(bay.BAY.roughness);
    });

    test('from the window the mountains are lost in heavy rain and back when it clears', () => {
        const cam = cameraAt('window', 16 / 10);
        // The front range's nearest slopes.
        const mountains = new THREE.Vector3(0, city.WATER_Y + 800, city.farCoastZ(0) - city.MOUNTAINS.bands.mountains.from);
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
        const dawn = buildWorld(CONFIG);
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

describe('the second round of screenshots (2026-09-24)', () => {
    let lit;
    let life;
    const NOON = new Date(2026, 8, 24, 12, 0);

    beforeAll(async () => {
        life = await import('../www/office/js/life.js');
        const tex = () => new THREE.Texture();
        const facades = Object.fromEntries(worldMod.STYLES.map((s) => [s, { color: tex(), rm: tex(), lit: tex() }]));
        lit = buildWorld(CONFIG, { textures: { facades, streets: tex(), streetsLit: tex() } });
    });

    test('every tower wears the leaning panes, scaled back to their true lean, and reflects strongly', () => {
        for (const mesh of lit.towers.meshes) {
            const m = mesh.material;
            expect(m.normalMap.isDataTexture).toBe(true);
            expect(m.normalMap.magFilter).toBe(THREE.NearestFilter);
            expect(m.normalMap.generateMipmaps).toBe(true);
            expect(m.normalScale.x).toBeCloseTo(1 / city.PANE_STORE, 9);
            expect(m.envMapIntensity).toBeGreaterThanOrEqual(2);
        }
        // All the towers share one pane texture.
        expect(new Set(lit.towers.meshes.map((m) => m.material.normalMap)).size).toBe(1);
    });

    test('the traffic is there by day: paint and trim for cars and buses, each on its street, facing its lane, tilted with the hill, in its own color', () => {
        const { vehicles } = lit.fleet;
        const lanes = life.carLanes();
        const cars = life.carFleet(lanes);
        expect(vehicles.meshes).toHaveLength(4);
        for (const mesh of vehicles.meshes) expect(mesh.isInstancedMesh).toBe(true);
        expect(vehicles.car.paint.count + vehicles.bus.paint.count).toBe(cars.length);
        expect(vehicles.bus.trim.count).toBe(cars.filter((c) => c.kind === 'bus').length);
        // Far below the water until placed.
        const m = new THREE.Matrix4();
        const p = new THREE.Vector3();
        const q = new THREE.Quaternion();
        const s = new THREE.Vector3();
        const fresh = buildWorld(CONFIG).fleet.vehicles;
        fresh.car.paint.getMatrixAt(0, m);
        expect(new THREE.Vector3().setFromMatrixPosition(m).y).toBeLessThan(-1000);
        lit.setLife(NOON, 12);
        const pitches = new Float32Array(cars.length);
        const middles = life.carPositions(cars, lanes, 12, undefined, pitches);
        const yaws = life.carYaws(cars, lanes);
        const onHill = cars.findIndex((c, i) => life.onStreet(middles[i * 3 + 1]) && Math.abs(pitches[i]) > 0.02);
        const bus = cars.findIndex((c, i) => c.kind === 'bus' && life.onStreet(middles[i * 3 + 1]));
        const suv = cars.findIndex((c, i) => c.scale === life.SUV && life.onStreet(middles[i * 3 + 1]));
        expect(Math.min(onHill, bus, suv)).toBeGreaterThanOrEqual(0);
        for (const i of [0, 17, 99, onHill, bus, suv, cars.length - 1]) {
            const { paint, trim } = vehicles[cars[i].kind];
            const k = vehicles.slot[i];
            trim.getMatrixAt(k, m);
            const trimAt = m.clone();
            paint.getMatrixAt(k, m);
            expect(trimAt.equals(m)).toBe(true);
            m.decompose(p, q, s);
            expect(p.x).toBeCloseTo(middles[i * 3], 3);
            expect(p.z).toBeCloseTo(middles[i * 3 + 2], 3);
            expect(s.toArray().map((v) => +v.toFixed(6))).toEqual(cars[i].scale);
            if (!life.onStreet(middles[i * 3 + 1])) {
                expect(p.y).toBeLessThan(-1000);
                continue;
            }
            expect(p.y).toBeCloseTo(city.groundY(p.x, p.z), 0);
            const bow = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
            expect(Math.atan2(-bow.x, -bow.z)).toBeCloseTo(yaws[i], 6);
            expect(Math.asin(bow.y)).toBeCloseTo(pitches[i], 5);
        }
        const colors = new Set();
        const c = new THREE.Color();
        for (let i = 0; i < vehicles.car.paint.count; i++) {
            vehicles.car.paint.getColorAt(i, c);
            colors.add(c.getHexString());
        }
        expect(colors.size).toBeGreaterThan(5);
        // By day and by night alike; the lights only by night.
        lit.fleet.light(0);
        for (const mesh of vehicles.meshes) expect(mesh.visible).toBe(true);
        expect(lit.fleet.cars.visible).toBe(false);
    });

    test('from the window by day, a good many cars and a bus or two are seen in the streets below', () => {
        const cam = cameraAt('window', 16 / 10);
        lit.setLife(NOON, 30);
        lit.scene.updateMatrixWorld(true);
        const frustum = new THREE.Frustum().setFromProjectionMatrix(
            new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)
        );
        const { vehicles } = lit.fleet;
        const occluders = lit.scene.children.filter((o) => !vehicles.meshes.includes(o));
        const m = new THREE.Matrix4();
        const seen = { car: 0, bus: 0 };
        for (const kind of ['car', 'bus']) {
            const bodies = vehicles[kind].paint;
            for (let i = 0; i < bodies.count; i++) {
                bodies.getMatrixAt(i, m);
                const p = new THREE.Vector3().setFromMatrixPosition(m).add(new THREE.Vector3(0, 1, 0));
                if (!frustum.containsPoint(p)) continue;
                const dir = p.clone().sub(cam.position);
                const ray = new THREE.Raycaster(cam.position, dir.clone().normalize(), 0.05, dir.length() - 3);
                if (ray.intersectObject(room.group, true).length) continue;
                const shown = (o) => (o ? o.visible && shown(o.parent) : true);
                if (ray.intersectObjects(occluders, true).some((h) => shown(h.object))) continue;
                seen[kind]++;
            }
        }
        expect(seen.car).toBeGreaterThanOrEqual(10);
        // Buses lead about one platoon in six, so over a minute a few pass.
        let buses = seen.bus;
        for (let t = 35; t < 95 && !buses; t += 5) {
            lit.setLife(NOON, t);
            lit.scene.updateMatrixWorld(true);
            for (let i = 0; i < vehicles.bus.paint.count; i++) {
                vehicles.bus.paint.getMatrixAt(i, m);
                if (frustum.containsPoint(new THREE.Vector3().setFromMatrixPosition(m))) buses++;
            }
        }
        expect(buses).toBeGreaterThan(0);
    });
});

// ---- The third round of screenshots (2026-09-25) ---------------------------------

describe('the third round of screenshots (2026-09-25)', () => {
    let lit;
    let life;
    let fleetMod;
    const NOON = new Date(2026, 8, 24, 12, 0);
    const shown = (o) => (o ? o.visible && shown(o.parent) : true);

    beforeAll(async () => {
        life = await import('../www/office/js/life.js');
        fleetMod = await import('../www/office/js/fleet.js');
        lit = buildWorld(CONFIG, { textures: { clouds: new THREE.Texture() } });
    });

    test('from the desk, more of the view is window than it was (QA: "too much of the view is blocked by the wall")', () => {
        // A row across the frame at the window's middle height: how much of
        // it looks out. With the window's left edge at x 0.1 and the
        // calendar beside it, this was 0.58; reaching to x -0.5, 0.725;
        // with the calendar gone and the window from corner to corner, 0.917
        // (all measured 2026-09-25). The monitor, the lamp and the mullions
        // are what keep it short of 1.
        const cam = cameraAt('desk', 16 / 10);
        const y = new THREE.Vector3(0, 1.7, -CONFIG.room.depth / 2).project(cam).y;
        let out = 0;
        const n = 120;
        for (let i = 0; i < n; i++) {
            const { what } = seeAt(cam, -1 + (2 * (i + 0.5)) / n, y);
            if (what !== 'room') out++;
        }
        expect(out / n).toBeGreaterThan(0.88);
    });

    test('a car has dark glass round a colored roof, and reads so from straight above', () => {
        const { paint, trim } = fleetMod.carParts();
        const scene = new THREE.Scene();
        const body = new THREE.Mesh(paint, new THREE.MeshBasicMaterial());
        body.name = 'paint';
        const rest = new THREE.Mesh(trim, new THREE.MeshBasicMaterial());
        rest.name = 'trim';
        scene.add(body, rest);
        scene.updateMatrixWorld(true);
        const from = (z) => {
            const [hit] = new THREE.Raycaster(new THREE.Vector3(0, 10, z), new THREE.Vector3(0, -1, 0)).intersectObjects([body, rest]);
            return hit.object.name;
        };
        // Hood, windshield, roof, rear window, trunk, from the bow back.
        expect([-1.8, -0.8, 0.3, 1.35, 1.9].map(from)).toEqual(['paint', 'trim', 'paint', 'trim', 'paint']);
        paint.computeBoundingBox();
        trim.computeBoundingBox();
        expect(trim.boundingBox.min.y).toBeCloseTo(0, 6);
        const length = Math.max(paint.boundingBox.max.z, trim.boundingBox.max.z) - Math.min(paint.boundingBox.min.z, trim.boundingBox.min.z);
        expect(length).toBeCloseTo(life.VEHICLES.car.length, 0);
        // And a bus is as long as a bus.
        const busTrim = fleetMod.busParts().trim;
        busTrim.computeBoundingBox();
        expect(busTrim.boundingBox.max.z - busTrim.boundingBox.min.z).toBeCloseTo(life.VEHICLES.bus.length, 0);
    });

    test('a jet comes in to land, seen from the desk and from the window, big enough to read as an airliner, always right to left', () => {
        // Flight 0 flies jet 0.
        const jet = lit.fleet.jets[0].group;
        const times = life.jetTimes();
        const size = { desk: 0, window: 0 };
        const seconds = { desk: 0, window: 0 };
        // Where on the screen it was last seen, to hold it to right to left.
        const lastX = { desk: Infinity, window: Infinity };
        const landed = { desk: 0, window: 0 };
        for (let s = 0; s < life.jetFlight(0).start + times.approach + times.rollout; s += 2) {
            lit.setLife(NOON, s);
            lit.scene.updateMatrixWorld(true);
            for (const station of ['desk', 'window']) {
                const cam = cameraAt(station, 16 / 10);
                const box = new THREE.Box3().setFromObject(jet);
                // On the fuselage's axis (the box's middle is thin air over
                // it, between the wings and the fin).
                const middle = jet.getWorldPosition(new THREE.Vector3());
                const ndc = middle.clone().project(cam);
                if (Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1) continue;
                // Seen: the ray to its middle leaves by a window and meets it first.
                const dir = middle.clone().sub(cam.position);
                const ray = new THREE.Raycaster(cam.position, dir.clone().normalize());
                if (ray.intersectObject(room.group, true).length) continue;
                const [hit] = ray.intersectObject(lit.scene, true).filter((h) => shown(h.object));
                let o = hit && hit.object;
                while (o && o !== jet) o = o.parent;
                if (o !== jet) continue;
                seconds[station] += 2;
                expect(ndc.x).toBeLessThan(lastX[station]);
                lastX[station] = ndc.x;
                if (life.jetsAt(s)[0].phase === 'rollout') landed[station] += 2;
                // Its length across a 1440 px wide screen.
                const ends = [new THREE.Vector3(box.min.x, middle.y, middle.z), new THREE.Vector3(box.max.x, middle.y, middle.z)]
                    .map((v) => v.project(cam).x);
                size[station] = Math.max(size[station], (Math.abs(ends[1] - ends[0]) / 2) * 1440);
            }
        }
        expect(seconds.desk).toBeGreaterThanOrEqual(30);
        expect(seconds.window).toBeGreaterThanOrEqual(30);
        // And both see it on the runway, rolling out after touching down.
        expect(landed.desk).toBeGreaterThanOrEqual(10);
        expect(landed.window).toBeGreaterThanOrEqual(10);
        // Small, but a shape, not a speck.
        expect(size.desk).toBeGreaterThan(20);
        expect(size.desk).toBeLessThan(80);
        expect(size.window).toBeGreaterThan(16);
    });

    test('taxiing in, both see it down the taxiway until it passes behind the jets at the gates, and the hangar hides it at the end', () => {
        const times = life.jetTimes();
        const start = life.jetFlight(0).start + times.approach + times.rollout;
        const jet = lit.fleet.jets[0].group;
        const firstHit = (cam, target) => {
            const [hit] = new THREE.Raycaster(cam.position, target.clone().sub(cam.position).normalize())
                .intersectObject(lit.scene, true).filter((h) => shown(h.object));
            let o = hit && hit.object;
            while (o && o !== jet && o.parent) o = o.parent;
            return { jet: o === jet, name: hit && hit.object.name };
        };
        for (const station of ['desk', 'window']) {
            const cam = cameraAt(station, 16 / 10);
            let seen = 0;
            let asked = 0;
            for (let s = start; s <= start + times.taxi; s += 4) {
                const at = life.jetsAt(s)[0];
                // Short of the gate row's far end: nothing in the way.
                if (city.airportLocal(at.x, at.z).a > 2200) continue;
                lit.setLife(NOON, s);
                lit.scene.updateMatrixWorld(true);
                asked++;
                if (firstHit(cam, jet.getWorldPosition(new THREE.Vector3())).jet) seen++;
            }
            expect(asked).toBeGreaterThan(10);
            expect(seen / asked).toBeGreaterThan(0.9);
            // At the end of its taxi it is inside the hangar, which hides it,
            // so it goes from the scene unseen.
            lit.setLife(NOON, start + times.taxi - 0.5);
            lit.scene.updateMatrixWorld(true);
            const end = firstHit(cam, jet.getWorldPosition(new THREE.Vector3()));
            expect(end.jet).toBe(false);
            expect(end.name).toBe('airport');
            lit.setLife(NOON, start + times.taxi + 0.5);
            expect(jet.visible).toBe(false);
        }
    });

    test('the world knows when a jet is in view, so it can be drawn every frame just then', () => {
        const follow = (station) => {
            const cam = cameraAt(station, 16 / 10);
            lit.follow(cam);
            return cam;
        };
        // Its own count: a jet in the air or on its rollout, inside the frame.
        const expected = (cam, s) => {
            const frustum = new THREE.Frustum().setFromProjectionMatrix(
                new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
            return life.jetsAt(s).some((at) => at && at.fast
                && Math.hypot(at.x - cam.position.x, at.y - cam.position.y, at.z - cam.position.z) < life.JET.smooth
                && frustum.intersectsSphere(new THREE.Sphere(new THREE.Vector3(at.x, at.y, at.z), 22 * life.JET.scale)));
        };
        const desk = follow('desk');
        let inSight = 0;
        let slow = 0;
        for (let s = 0; s < 900; s += 3) {
            lit.setLife(NOON, s);
            const want = expected(desk, s);
            expect(lit.jetInSight()).toBe(want);
            if (want) inSight += 3;
            // Jets out, but only taxiing: not worth every frame.
            if (!want && life.jetsAt(s).some((at) => at && !at.fast)) slow++;
        }
        // In sight, near enough to step visibly at the scenery's own 15
        // frames a second, some of the time: a flight every 90 seconds
        // (QA, 2026-09-29) had a jet somewhere in the frame 83% of it, and
        // the page would have drawn at 60 nearly always. Within JET.smooth
        // it is about 37% (a flight every 7 minutes was about 10%).
        expect(inSight).toBeGreaterThan(90);
        expect(inSight).toBeLessThan(900 * 0.42);
        expect(slow).toBeGreaterThan(10);
        // Facing the front wall, never.
        let near = 0;
        while (!expected(desk, near)) near += 1;
        lit.setLife(NOON, near);
        expect(lit.jetInSight()).toBe(true);
        follow('departures');
        expect(lit.jetInSight()).toBe(false);
    });

    test('the jet flies on the scenery’s clock, its strobes on real time (QA, 2026-09-29)', () => {
        const [jet] = lit.fleet.jets;
        lit.fleet.light(1);
        // Seconds 30 on the scenery's clock (a day going by has run it on),
        // 0.6 on the real one: where the jet is is the first's, whether its
        // strobes flash the second's.
        lit.setLife(NOON, 30, false, 0.6);
        const at = life.jetsAt(30)[0];
        expect(jet.group.position.x).toBeCloseTo(at.x, 6);
        expect(life.jetFlashing(30)).not.toBe(life.jetFlashing(0.6));
        expect(jet.strobes.visible).toBe(life.jetFlashing(0.6));
        lit.setLife(NOON, 30, false, 0);
        expect(jet.strobes.visible).toBe(life.jetFlashing(0));
        lit.fleet.light(0);
    });

    test('never a jet held still in the sky for a visitor who asked for less motion: only those at the gates', () => {
        lit.setLife(NOON, 30);
        expect(lit.fleet.jets[0].group.visible).toBe(true);
        lit.setLife(NOON, 30, true);
        for (const jet of lit.fleet.jets) expect(jet.group.visible).toBe(false);
        expect(lit.jetInSight()).toBe(false);
        // The gates stay full.
        expect(lit.airport.jets.geometry.attributes.position.count).toBeGreaterThan(0);
    });

    test('by night its wingtip lights burn and its strobes flash; one can be called for a screenshot', () => {
        const [jet] = lit.fleet.jets;
        lit.fleet.light(1);
        lit.setLife(NOON, 0);
        expect(life.jetFlashing(0)).toBe(true);
        expect(jet.navLights.visible).toBe(true);
        expect(jet.strobes.visible).toBe(true);
        expect(jet.lit.material.emissiveIntensity).toBeGreaterThan(1);
        lit.setLife(NOON, 0.6);
        expect(jet.strobes.visible).toBe(false);
        const colors = jet.navLights.geometry.attributes.color;
        const pos = jet.navLights.geometry.attributes.position;
        // Red on the left wingtip (-x for a bow toward -z), green on the right.
        const left = pos.getX(0) < 0 ? 0 : 1;
        expect(colors.getX(left)).toBeGreaterThan(colors.getY(left));
        expect(colors.getY(1 - left)).toBeGreaterThan(colors.getX(1 - left));
        // Its landing lights burn coming in, and not taxiing.
        expect(jet.landing.visible).toBe(true);
        const times = life.jetTimes();
        lit.setLife(NOON, life.jetFlight(0).start + times.approach + times.rollout + 10);
        expect(jet.group.visible).toBe(true);
        expect(jet.landing.visible).toBe(false);
        lit.fleet.light(0);
        expect(jet.navLights.visible).toBe(false);
        expect(jet.strobes.visible).toBe(false);
        expect(jet.landing.visible).toBe(false);
        // Its flight over, it is gone into the hangar; and a jet asked for
        // comes straight into the desk's view, on a jet of its own.
        const idle = life.jetFlight(0).start + times.total + 1;
        lit.setLife(NOON, idle);
        expect(life.jetsAt(idle)[0]).toBeNull();
        expect(jet.group.visible).toBe(false);
        lit.callJet(idle);
        lit.setLife(NOON, idle + 1);
        const called = lit.fleet.jets[life.JET.fleet];
        expect(called.group.visible).toBe(true);
        const cam = cameraAt('desk', 16 / 10);
        lit.scene.updateMatrixWorld(true);
        const ndc = called.group.getWorldPosition(new THREE.Vector3()).project(cam);
        expect(Math.abs(ndc.x)).toBeLessThan(1);
        expect(Math.abs(ndc.y)).toBeLessThan(1);
    });
});

describe('the fourth round of screenshots (2026-09-26)', () => {
    let life;
    beforeAll(async () => {
        life = await import('../www/office/js/life.js');
    });

    test('the snow fades into the rock over a veil, drawn from the same numbers as city.js', () => {
        const snow = worldMod.landSnow();
        expect(snow).toContain('float landCover = max( landField, landVeil );');
        expect(snow).toContain(`${city.SNOW.dust.share} * smoothstep( landEdge, landEdge + ${city.SNOW.dust.over}.0, landHeight )`);
        expect(snow).toContain(`smoothstep( landEdge - ${city.SNOW.soft}.0, landEdge + ${city.SNOW.soft}.0, landHeight )`);
    });

    /**
     * Whether the island city is seen: rays from the eye toward the upper
     * part of each tower along the island's waterfront, and how many of those
     * inside the frame meet an island tower first (not the room, not a
     * downtown tower in the way).
     */
    function islandSeen(station, aspect) {
        const cam = cameraAt(station, aspect);
        const shore = (t) => city.islandShoreZ(t.x) - t.z;
        let seen = 0;
        for (const t of city.islandTowers()) {
            if (shore(t) > 300 || t.h < 40) continue;
            const target = new THREE.Vector3(t.x, city.WATER_Y + t.base + t.h * 0.7, t.z);
            const ndc = target.clone().project(cam);
            if (Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1) continue;
            const hit = seeAlong(cam.position, target.clone().sub(cam.position));
            if (hit.what === 'towers' && hit.point.z < city.islandShoreZ(hit.point.x) + 5) seen++;
        }
        return seen;
    }

    test.each([
        ['desk', 'laptop 16:10'], ['desk', 'wide 21:9'], ['window', 'laptop 16:10'], ['window', 'wide 21:9'], ['window', 'phone upright']
    ])('from the %s on a %s screen, the city across the bay shows over the water', (station, name) => {
        expect(islandSeen(station, ASPECTS[name])).toBeGreaterThan(20);
    });

    test('the island city is in the glass meshes, its hillside grayer where it is built', () => {
        const island = world.scene.getObjectByName('land-hills-island');
        const pos = island.geometry.attributes.position;
        const col = island.geometry.attributes.color;
        let built = null;
        let wild = null;
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const z = pos.getZ(i);
            if (pos.getY(i) <= city.WATER_Y) continue;
            const b = city.islandBuilt(x, z);
            if (b === 1 && built === null) built = i;
            if (b === 0 && wild === null && city.islandShoreZ(x) - z > 2000) wild = i;
        }
        // Grayer: its channels closer together than the forest's.
        const spread = (i) => Math.max(col.getX(i), col.getY(i), col.getZ(i)) - Math.min(col.getX(i), col.getY(i), col.getZ(i));
        const bright = (i) => col.getX(i) + col.getY(i) + col.getZ(i);
        expect(spread(built) / bright(built)).toBeLessThan(spread(wild) / bright(wild));
        expect(world.plan.filter((t) => t.island).length).toBe(city.islandTowers().length);
    });

    test('the ferry berths at a landing on the island, straight across from the dock', () => {
        const route = life.ferryRoute();
        const shore = route.to - life.LIFE.ferry.length / 2 - 60;
        world.docks.geometry.computeBoundingBox();
        const box = world.docks.geometry.boundingBox;
        // The landing reaches from the island's shore out to the ferry's bow.
        expect(box.min.z).toBeLessThan(shore - 40);
        expect(city.isLand(route.x, shore)).toBe(true);
        expect(city.isLand(route.x, shore + 10)).toBe(false);
    });
});

describe('the fifth round of screenshots (2026-09-28)', () => {
    let lit;
    let life;
    const NOON = new Date(2026, 8, 24, 12, 0);
    beforeAll(async () => {
        life = await import('../www/office/js/life.js');
        lit = buildWorld(CONFIG, { textures: { clouds: new THREE.Texture() } });
    });

    test('the glass runs floor to ceiling: from the window, below where the sill was, the street far down', async () => {
        const cam = cameraAt('window', 16 / 10);
        const w = (await import('../www/office/js/room.js')).windowsOf(CONFIG);
        expect(w.sill).toBeLessThan(0.95);
        const glass = new THREE.Vector3(2.0, 0.5, -CONFIG.room.depth / 2);
        const hit = seeAlong(cam.position, glass.clone().sub(cam.position));
        expect(hit.what).not.toBe('room');
        expect(cam.position.y - hit.point.y).toBeGreaterThan(100);
    });

    test('from the desk and the window, the airport’s control tower and terminal stand across the bay', () => {
        const parts = city.airportParts();
        const cab = parts.find((p) => p.kind === 'tower' && p.y > 0);
        const hall = parts.find((p) => p.kind === 'terminal');
        for (const [station, aspect] of [['desk', 16 / 10], ['desk', 1305 / 894], ['window', 16 / 10]]) {
            const cam = cameraAt(station, aspect);
            for (const p of [cab, hall]) {
                // Its face toward the office (the airport's b runs that way).
                const [x, z] = city.airportPoint(p.a, p.b + p.wid / 2 - 1);
                const target = new THREE.Vector3(x, city.airportY(p.y + p.h * 0.6), z);
                const ndc = target.clone().project(cam);
                expect(Math.abs(ndc.x)).toBeLessThan(1);
                expect(Math.abs(ndc.y)).toBeLessThan(1);
                expect(seeAlong(cam.position, target.clone().sub(cam.position)).name).toBe('airport');
            }
        }
    });

    test('the jet flies faster only where no station and no screen can see it (QA, 2026-09-29)', () => {
        const views = [['desk', 16 / 10], ['desk', 1305 / 894], ['desk', 21 / 9], ['window', 16 / 10], ['window', 1305 / 894],
            ['window', 21 / 9], ['window', 390 / 844], ['desk', 390 / 844]].map(([station, aspect]) => cameraAt(station, aspect));
        const start = life.jetFlight(0).start;
        const times = life.jetTimes();
        let dashing = 0;
        for (let t = 0; t <= times.approach; t += 1) {
            const at = life.jetsAt(start + t)[0];
            const left = -city.airportLocal(at.x, at.z).a;
            if (life.approachSpeed(left) <= life.JET.speed + 1) continue;
            dashing++;
            world.setLife(NOON, start + t);
            world.scene.updateMatrixWorld(true);
            const middle = new THREE.Vector3(at.x, at.y, at.z);
            for (const cam of views) {
                const ndc = middle.clone().project(cam);
                if (Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1) continue;
                expect(seeAlong(cam.position, middle.clone().sub(cam.position)).name).not.toBe('jet');
            }
        }
        expect(dashing).toBeGreaterThan(8);
    });

    test('jets wait at every gate, on their wheels, of several airlines', async () => {
        const jets = world.scene.getObjectByName('airport-jets');
        const fleetParts = (await import('../www/office/js/fleet.js')).jetParts;
        const one = fleetParts().body.attributes.position.count;
        expect(jets.geometry.attributes.position.count).toBe(one * city.AIRPORT.gates.a.length);
        // Each gate's jet in its own colors: no two alike, side by side.
        const color = jets.geometry.attributes.color.array;
        const each = color.length / city.AIRPORT.gates.a.length;
        const liveries = Array.from({ length: city.AIRPORT.gates.a.length }, (_, i) => color.slice(i * each, (i + 1) * each).join(','));
        expect(new Set(liveries).size).toBe(liveries.length);
        jets.geometry.computeBoundingBox();
        const low = jets.geometry.boundingBox.min.y;
        // The engines hang 2.9 m under the axis, the wheels 3.4 (both times
        // the jet's scale): the lowest point just clear of the apron.
        expect(low - city.airportY(0)).toBeGreaterThan(0);
        expect(low - city.airportY(0)).toBeLessThan(life.JET.scale * 1);
    });

    test('by night the airport lights up and its flashers run in; by day they are out; for less motion they hold off', async () => {
        const { lighting, lightAt } = await import('../www/office/js/daylight.js');
        const { lights, rabbit } = lit.airport;
        lit.setLight(lighting(lightAt(new Date(2026, 8, 24), 22)));
        lit.setLife(NOON, 0.3);
        expect(lights.visible).toBe(true);
        expect(rabbit.visible).toBe(true);
        const n = rabbit.geometry.attributes.position.count;
        const seen = [];
        for (let t = 0; t < worldMod.RABBIT_SECONDS; t += worldMod.RABBIT_SECONDS / (n * 2)) {
            lit.setLife(NOON, t);
            expect(rabbit.geometry.drawRange.count).toBe(1);
            seen.push(rabbit.geometry.drawRange.start);
        }
        // Every flasher in turn, in order, then round again.
        expect(new Set(seen).size).toBe(n);
        for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
        expect(worldMod.rabbitAt(worldMod.RABBIT_SECONDS, n)).toBe(0);
        lit.setLife(NOON, 0.3, true);
        expect(rabbit.visible).toBe(false);
        lit.setLight(lighting(lightAt(new Date(2026, 8, 24), 12)));
        lit.setLife(NOON, 0.3);
        expect(lights.visible).toBe(false);
        expect(rabbit.visible).toBe(false);
        const hits = [];
        lights.raycast(new THREE.Raycaster(), hits);
        rabbit.raycast(new THREE.Raycaster(), hits);
        expect(hits).toEqual([]);
    });
});
