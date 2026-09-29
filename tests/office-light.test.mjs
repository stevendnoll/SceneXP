// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The sun's light over Corner Office (QA, 2026-09-29: "I feel like we're not
 * doing enough with the sun and lighting effects"): the sun going down
 * behind the mountains, the golden hour, the glitter path on the bay, the
 * glare of a low sun, the clouds lit from behind, and the towers' shadows.
 * Measured against the real three.js (node:vm).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { CONFIG } from '../www/office/js/config.js';
import * as sky from '../www/office/js/sky.js';
import * as city from '../www/office/js/city.js';
import { lighting, lightAt, sunTimes, goldenHour, GOLDEN_HOUR } from '../www/office/js/daylight.js';
import { weathered } from '../www/office/js/weather.js';

let THREE;
let worldMod;
let interior;
let lit;
let room;
let poseFor;
let realPmrem;
// The world keeps its first PMREMGenerator, so one stands in for every
// capture here, and each test says what to do as one is taken.
let onCapture = () => {};

const DEG = Math.PI / 180;
const DATE = new Date(2026, 8, 28);

/** The sky and the look at a clock hour on DATE, in a given weather. */
function momentAt(hour, weather = { overcast: 0, rain: 0 }) {
    const at = new Date(DATE.getFullYear(), DATE.getMonth(), DATE.getDate(), 0, 0);
    at.setTime(at.getTime() + hour * 3600 * 1000);
    const s = sky.skyAt(at);
    return { at, sky: s, look: weathered(lighting(lightAt(at), s), weather) };
}

/** The clock hour, on DATE, at which the sun stands `deg` degrees up in the
 *  evening. */
function eveningHour(deg) {
    let lo = 12;
    let hi = sunTimes(DATE).sunset + 0.5;
    for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (momentAt(mid).sky.sunHeight > deg * DEG) lo = mid;
        else hi = mid;
    }
    return (lo + hi) / 2;
}

beforeAll(async () => {
    const ctx = vm.createContext({ self: {}, window: {}, console: { warn() {} } });
    vm.runInContext(readFileSync(join(process.cwd(), 'www/lib/three.min.js'), 'utf8'), ctx);
    THREE = ctx.THREE || ctx.self.THREE || ctx.window.THREE;
    globalThis.THREE = THREE;
    worldMod = await import('../www/office/js/world.js');
    interior = await import('../www/office/js/interior.js');
    const tex = () => new THREE.Texture();
    realPmrem = THREE.PMREMGenerator;
    THREE.PMREMGenerator = class {
        fromScene() {
            onCapture();
            return { texture: {}, dispose() {} };
        }
    };
    lit = worldMod.buildWorld(CONFIG, { textures: { clouds: tex(), moon: tex(), glow: tex() } });
    lit.scene.updateMatrixWorld(true);
    room = (await import('../www/office/js/room.js')).buildRoom(CONFIG);
    room.group.updateMatrixWorld(true);
    ({ poseFor } = await import('../www/office/js/stations.js'));
});

/** The camera at a station, at a laptop's shape. */
function cameraAt(station, aspect = 16 / 10) {
    const p = poseFor(station, aspect, CONFIG);
    const cam = new THREE.PerspectiveCamera(p.fov, aspect, 0.05, 160000);
    cam.position.set(...p.eye);
    cam.lookAt(new THREE.Vector3(...p.aim));
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    return cam;
}

/** Whether a point outside is in the camera's frame and seen through the
 *  glass, no wall and no tower in the way. */
function seen(cam, point) {
    const ndc = point.clone().project(cam);
    if (Math.abs(ndc.x) > 0.95 || Math.abs(ndc.y) > 0.95 || ndc.z > 1) return false;
    const dir = point.clone().sub(cam.position);
    const far = dir.length();
    const ray = new THREE.Raycaster(cam.position, dir.normalize(), 0, far - 2);
    if (ray.intersectObject(room.group, true).length) return false;
    return ray.intersectObjects([...lit.towers.meshes, lit.towers.roofs], false).length === 0;
}

afterAll(() => {
    THREE.PMREMGenerator = realPmrem;
    delete globalThis.THREE;
});

describe('the sun goes down behind the mountains', () => {
    test('the ranges stand some five degrees up where the framed sun sets, lower toward the ends', () => {
        const line = city.ridgeLine();
        expect(line.length).toBe((city.RIDGE.to - city.RIDGE.from) / city.RIDGE.step + 1);
        // The sunset's gap (sky.js SUNSET_FRAME): the front range's crest.
        for (let b = -2; b <= 11; b++) {
            expect(city.ridgeAt(b)).toBeGreaterThan(3);
            expect(city.ridgeAt(b)).toBeLessThan(8);
        }
        // Made once.
        expect(city.ridgeLine()).toBe(line);
        // Between the measured bearings a straight line; past them, none.
        expect(city.ridgeAt(0.5)).toBeCloseTo((line[45] + line[46]) / 2, 5);
        expect(city.ridgeAt(90)).toBe(-90);
        expect(city.ridgeAt(Number.NaN)).toBe(-90);
    });

    test('a bearing is measured north of west', () => {
        expect(sky.bearingOf([0, 0, -1])).toBeCloseTo(0, 9);
        expect(sky.bearingOf([1, 0, 0])).toBeCloseTo(90, 9);
        expect(sky.bearingOf([-1, 0, 0])).toBeCloseTo(-90, 9);
        expect(sky.bearingOf(sky.turnNorth([0, 0, -1], 10))).toBeCloseTo(10, 9);
    });

    test('the sun is clear high up, half hidden on the crest, and gone below it', () => {
        const flat = () => 5;
        const at = (deg) => ({ sun: [0, Math.sin(deg * DEG), -Math.cos(deg * DEG)], sunHeight: deg * DEG });
        expect(sky.sunClear(at(20), flat)).toBe(1);
        expect(sky.sunClear(at(5), flat)).toBeCloseTo(0.5, 9);
        expect(sky.sunClear(at(4), flat)).toBe(0);
        // Where no range stands, the horizon hides it.
        expect(sky.sunClear(at(0), () => -90)).toBeCloseTo(0.5, 9);
        expect(sky.sunClear(at(-2), () => -90)).toBe(0);
    });

    test('every month the sun leaves the city before the clock’s sunset, and is clear an hour before', () => {
        for (let m = 0; m < 12; m++) {
            const day = new Date(2026, m, 21);
            const { sunset } = sunTimes(day);
            const at = (h) => {
                const d = new Date(2026, m, 21);
                d.setTime(d.getTime() + h * 3600 * 1000);
                return sky.skyAt(d);
            };
            expect(sky.sunClear(at(sunset - 1))).toBe(1);
            expect(sky.sunClear(at(sunset - 0.1))).toBe(0);
        }
    });

    test('the room’s sunbeam goes with it, though the sun is still over the sea’s horizon', () => {
        const behind = momentAt(eveningHour(2));
        expect(behind.sky.sunHeight).toBeGreaterThan(1.5 * DEG);
        expect(interior.sunbeam(behind.sky, behind.look).intensity).toBe(0);
        const clear = momentAt(eveningHour(12));
        expect(interior.sunbeam(clear.sky, clear.look).intensity).toBeGreaterThan(1);
    });
});

describe('the golden hour', () => {
    test('the sun’s light warms from GOLDEN_HOUR.high degrees down to low', () => {
        expect(goldenHour((GOLDEN_HOUR.high + 1) * DEG)).toBe(0);
        expect(goldenHour(GOLDEN_HOUR.low * DEG)).toBe(1);
        expect(goldenHour(((GOLDEN_HOUR.high + GOLDEN_HOUR.low) / 2) * DEG)).toBeCloseTo(0.5, 9);
    });

    test('with the sky given, the sun is gold while it is still clear of the mountains, and the sky keeps the clock’s colors', () => {
        const m = momentAt(eveningHour(7));
        expect(sky.sunClear(m.sky)).toBe(1);
        const byClock = lighting(lightAt(m.at));
        const bySun = lighting(lightAt(m.at), m.sky);
        const g = (hex) => (hex >> 8) & 255;
        const b = (hex) => hex & 255;
        expect(bySun.warm).toBeGreaterThan(0.9);
        expect(byClock.warm).toBeLessThan(0.1);
        // Less green and blue in the light: gold, not white.
        expect(g(bySun.sunColor)).toBeLessThan(g(byClock.sunColor) - 20);
        expect(b(bySun.sunColor)).toBeLessThan(b(byClock.sunColor) - 40);
        expect(bySun.halo).toBeGreaterThan(byClock.halo + 0.5);
        expect(bySun.skyTop).toBe(byClock.skyTop);
        expect(bySun.skyBottom).toBe(byClock.skyBottom);
    });

    test('never gold at noon or at night, and an overcast takes it away', () => {
        expect(momentAt(12.5).look.warm).toBe(0);
        expect(momentAt(2).look.warm).toBe(0);
        const m = momentAt(eveningHour(7), { overcast: 1, rain: 0 });
        expect(m.look.warm).toBe(0);
    });
});

describe('the glitter path, the glare and the clouds', () => {
    const glitter = () => lit.water.userData.glitter.light.value;
    const cloudLight = () => lit.clouds.userData.glow.light.value;
    const show = (m) => lit.setLight(m.look, m.sky);

    test('a low clear sun lays its glitter on the bay, in its own color and direction', () => {
        const m = momentAt(eveningHour(9));
        show(m);
        expect(glitter().r).toBeGreaterThan(2);
        // Gold: more red than blue.
        expect(glitter().r).toBeGreaterThan(glitter().b * 1.5);
        expect(lit.water.userData.glitter.sun.value.toArray()).toEqual(m.sky.sun.map((v) => expect.closeTo(v, 9)));
    });

    test('no glitter from a sun behind the mountains, a sun down, or through rain', () => {
        show(momentAt(eveningHour(2)));
        expect(glitter().getHex()).toBe(0);
        show(momentAt(22));
        expect(glitter().getHex()).toBe(0);
        show(momentAt(eveningHour(9), { overcast: 0.3, rain: 1 }));
        expect(glitter().getHex()).toBe(0);
    });

    test('the glare shows round a low clear sun only, never at noon', () => {
        show(momentAt(eveningHour(8)));
        expect(lit.heavens.glare.visible).toBe(true);
        expect(lit.heavens.glare.material.blending).toBe(THREE.AdditiveBlending);
        // Over everything, the mountains included, since it is in the eye.
        expect(lit.heavens.glare.material.depthTest).toBe(false);
        const toward = lit.heavens.glare.position.clone().normalize();
        expect(toward.dot(new THREE.Vector3(...momentAt(eveningHour(8)).sky.sun))).toBeCloseTo(1, 6);
        show(momentAt(12.5));
        expect(lit.heavens.glare.visible).toBe(false);
        show(momentAt(eveningHour(2)));
        expect(lit.heavens.glare.visible).toBe(false);
    });

    test('the clouds glow round the sun at dusk, still after the city has lost it, and not by night', () => {
        show(momentAt(12.5));
        const noon = cloudLight().r;
        show(momentAt(eveningHour(6)));
        const dusk = cloudLight().r;
        expect(dusk).toBeGreaterThan(noon * 3);
        show(momentAt(eveningHour(-1)));
        expect(cloudLight().r).toBeGreaterThan(noon);
        show(momentAt(22));
        expect(cloudLight().getHex()).toBe(0);
    });

    test('the city’s sun dims to the sky’s light once it is behind the mountains', () => {
        const clear = momentAt(eveningHour(8));
        show(clear);
        const before = lit.sun.intensity / clear.look.sun;
        const behind = momentAt(eveningHour(2));
        show(behind);
        expect(lit.sun.intensity / behind.look.sun).toBeLessThan(before * 0.3);
    });

    test('the splices land in three’s own shaders, each with its own program', () => {
        const standard = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
        lit.water.material.onBeforeCompile(standard);
        expect(standard.fragmentShader).toContain('uniform vec3 glitterSun;');
        expect(standard.fragmentShader).toContain('outgoingLight += glitterLight');
        // After the light, and three's own output still after it.
        const f = standard.fragmentShader;
        expect(f.indexOf('outgoingLight += glitterLight')).toBeGreaterThan(f.indexOf('#include <lights_fragment_end>'));
        expect(f.indexOf('#include <opaque_fragment>')).toBeGreaterThan(f.indexOf('outgoingLight += glitterLight'));
        expect(f.indexOf('#include <fog_fragment>')).toBeGreaterThan(f.indexOf('#include <opaque_fragment>'));
        expect(standard.uniforms.glitterLight).toBe(lit.water.userData.glitter.light);
        expect(lit.water.material.customProgramCacheKey()).toBe('office-water');
        const basic = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };
        lit.clouds.material.onBeforeCompile(basic);
        expect(basic.vertexShader).toContain('vCloudWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
        expect(basic.vertexShader.indexOf('vCloudWorld =')).toBeGreaterThan(basic.vertexShader.indexOf('#include <project_vertex>'));
        expect(basic.fragmentShader).toContain('uniform vec3 cloudLight;');
        expect(basic.fragmentShader.indexOf('float cloudLit')).toBeGreaterThan(basic.fragmentShader.indexOf('#include <map_fragment>'));
        expect(basic.uniforms.cloudSun).toBe(lit.clouds.userData.glow.sun);
        expect(lit.clouds.material.customProgramCacheKey()).toBe('office-clouds');
    });

    test('their GLSL is clean, as far as text can tell (the "GLSL is a string under test" note)', () => {
        const reserved = /\b(patch|sample|input|output|filter|common|smooth|flat|active|buffer|shared)\b/;
        for (const [src, prefix] of [[worldMod.waterGlitter().replace('#include <opaque_fragment>', ''), 'glitter'], [worldMod.cloudGlow().replace('#include <map_fragment>', ''), 'cloud']]) {
            expect(src).not.toContain('`');
            expect(src).not.toMatch(/NaN|undefined|Infinity/);
            for (const n of src.match(/(?<![\w.])-?\d+(\.\d+)?(?![\w.])/g) || []) expect(n).toContain('.');
            const declared = [...src.matchAll(new RegExp(`(?:float|vec3) (${prefix}\\w+) =`, 'g'))].map((m) => m[1]);
            expect(declared.length).toBeGreaterThan(2);
            expect(new Set(declared).size).toBe(declared.length);
            for (const name of declared) {
                expect(name).not.toMatch(reserved);
                expect(src.search(new RegExp(`(?:float|vec3) ${name} =`))).toBeLessThanOrEqual(src.indexOf(name));
            }
            const uniforms = prefix === 'glitter' ? ['glitterSun', 'glitterLight'] : ['cloudSun', 'cloudLight'];
            for (const used of src.match(new RegExp(`\\b${prefix}[A-Z]\\w*`, 'g'))) expect([...declared, ...uniforms]).toContain(used);
            expect((src.match(/\(/g) || []).length).toBe((src.match(/\)/g) || []).length);
            expect((src.match(/\{/g) || []).length).toBe((src.match(/\}/g) || []).length);
        }
    });

    test('the reflections never see the glitter, and it is back after', () => {
        show(momentAt(eveningHour(9)));
        const before = glitter().clone();
        const seen = [];
        onCapture = () => seen.push(glitter().getHex());
        lit.updateEnvironment({ shadowMap: { needsUpdate: false } }, momentAt(eveningHour(9)).look);
        expect(seen).toEqual([0, 0]);
        expect(glitter().equals(before)).toBe(true);
    });
});

describe('the towers’ shadows', () => {
    test('the towers, their roofs and the piers cast them onto the streets and each other; the water and the land do not', () => {
        expect(lit.sun.castShadow).toBe(true);
        for (const mesh of [...lit.towers.meshes, lit.towers.roofs, lit.docks]) {
            expect(mesh.castShadow).toBe(true);
            expect(mesh.receiveShadow).toBe(true);
        }
        expect(lit.scene.getObjectByName('land-downtown').receiveShadow).toBe(true);
        expect(lit.water.receiveShadow).toBe(false);
        expect(lit.mountains.castShadow).toBe(false);
        expect(lit.sun.shadow.mapSize.x).toBe(worldMod.TOWER_SHADOWS.mapSize);
        const phone = worldMod.buildWorld(CONFIG, { shadowSize: worldMod.TOWER_SHADOWS.mapSizeMobile });
        expect(phone.sun.shadow.mapSize.x).toBe(1024);
    });

    test('the shadow camera holds all of downtown, and the light still comes from the sun', () => {
        for (const hour of [9, 13, 16.5]) {
            const m = momentAt(hour);
            lit.setLight(m.look, m.sky);
            lit.sun.updateMatrixWorld(true);
            lit.sun.target.updateMatrixWorld(true);
            // three sets the shadow camera up from the light as it draws.
            lit.sun.shadow.updateMatrices(lit.sun);
            const cam = lit.sun.shadow.camera;
            const frustum = new THREE.Frustum().setFromProjectionMatrix(
                new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)
            );
            const { box } = worldMod.TOWER_SHADOWS;
            const inset = (lo, hi) => [lo + 0.01 * (hi - lo), hi - 0.01 * (hi - lo)];
            for (const x of inset(...box.x)) for (const y of inset(...box.y)) for (const z of inset(...box.z)) {
                expect(frustum.containsPoint(new THREE.Vector3(x, y, z))).toBe(true);
            }
            // Every tower downtown inside it.
            for (const t of city.cityTowers()) {
                expect(t.x).toBeGreaterThan(box.x[0]);
                expect(t.x).toBeLessThan(box.x[1]);
                expect(t.z).toBeGreaterThan(box.z[0]);
                expect(t.z).toBeLessThan(box.z[1]);
                expect(city.WATER_Y + t.base + t.h).toBeLessThan(box.y[1]);
            }
            const from = lit.sun.position.clone().sub(lit.sun.target.position).normalize();
            expect(from.dot(new THREE.Vector3(...sky.lightFrom(m.sky)))).toBeGreaterThan(Math.cos(worldMod.TOWER_SHADOWS.moveDegrees * DEG));
        }
    });

    test('drawn again only when the sun has moved some way, or a capture drew them elsewhere', () => {
        const at = (minutes) => {
            const d = new Date(2026, 8, 28, 15, 0);
            d.setTime(d.getTime() + minutes * 60 * 1000);
            const s = sky.skyAt(d);
            lit.setLight(weathered(lighting(lightAt(d), s), { overcast: 0, rain: 0 }), s);
        };
        at(0);
        lit.takeShadows();
        expect(lit.takeShadows()).toBe(false);
        // A few seconds of the sun's travel: not worth drawing.
        at(0.05);
        expect(lit.takeShadows()).toBe(false);
        // Ten minutes: some two degrees.
        at(10);
        expect(lit.takeShadows()).toBe(true);
        expect(lit.takeShadows()).toBe(false);
        // A capture leaves the room's shadows as they were due, and the
        // towers' due again.
        const due = [];
        const renderer = { shadowMap: { needsUpdate: false } };
        onCapture = () => {
            due.push(renderer.shadowMap.needsUpdate);
            renderer.shadowMap.needsUpdate = false;
        };
        lit.updateEnvironment(renderer, momentAt(15).look);
        expect(due).toEqual([true, true]);
        expect(renderer.shadowMap.needsUpdate).toBe(false);
        expect(lit.takeShadows()).toBe(true);
    });
});

describe('the gulls over the waterfront', () => {
    const show = (hour, weather) => {
        const m = momentAt(hour, weather);
        lit.setLight(m.look, m.sky);
        return m;
    };

    test('out by day, home by night and in the rain, and never held still in the air', () => {
        const m = show(11);
        lit.setLife(m.at, 100, false, 100);
        expect(lit.gulls.mesh.visible).toBe(true);
        lit.setLife(m.at, 100, true, 100);
        expect(lit.gulls.mesh.visible).toBe(false);
        const night = show(23);
        lit.setLife(night.at, 100, false, 100);
        expect(lit.gulls.mesh.visible).toBe(false);
        const wet = show(11, { overcast: 0.8, rain: 1 });
        lit.setLife(wet.at, 100, false, 100);
        expect(lit.gulls.mesh.visible).toBe(false);
    });

    test('from the desk and from the window, some are nearly always in sight', async () => {
        const gulls = await import('../www/office/js/gulls.js');
        for (const station of ['desk', 'window']) {
            const cam = cameraAt(station);
            let moments = 0;
            let inSight = 0;
            for (let t = 0; t < 600; t += 20) {
                moments++;
                const n = gulls.flock().filter((g) => {
                    const [x, y, z] = gulls.gullAt(g, t);
                    return seen(cam, new THREE.Vector3(x, city.WATER_Y + y, z));
                }).length;
                if (n > 0) inSight++;
            }
            expect(inSight / moments).toBeGreaterThan(0.8);
        }
    });

    test('drawn where their poses say, in the flock’s one mesh', async () => {
        const gulls = await import('../www/office/js/gulls.js');
        const m = show(11);
        lit.setLife(m.at, 100, false, 77);
        const pos = lit.gulls.mesh.geometry.attributes.position;
        const perGull = gulls.gullShape().length * 3;
        expect(pos.count).toBe(gulls.flock().length * perGull);
        gulls.flock().forEach((g, i) => {
            const [x, y, z] = gulls.gullAt(g, 77);
            // The first point of each is its nose, within a few meters.
            expect(Math.hypot(pos.getX(i * perGull) - x, pos.getY(i * perGull) - (city.WATER_Y + y), pos.getZ(i * perGull) - z)).toBeLessThan(2);
        });
    });
});

describe('the window washers', () => {
    test('each gondola hangs off its glass on two cables from its jib, and is parked up by night', async () => {
        const w = await import('../www/office/js/washers.js');
        const m = momentAt(10.4);
        lit.setLight(m.look, m.sky);
        lit.setLife(m.at, 100, false, 100);
        lit.scene.updateMatrixWorld(true);
        const cables = lit.washers.cables.geometry.attributes.position;
        lit.washers.crews.forEach(({ face, gondola }, i) => {
            const box = new THREE.Box3().setFromObject(gondola);
            // Off the glass, and against it.
            expect(box.min.z).toBeGreaterThan(face.z + 0.5);
            expect(box.min.z).toBeLessThan(face.z + 2);
            // Down the face, as the schedule says.
            const at = w.washerAt(face, m.at, i);
            expect(at.working).toBe(true);
            expect(box.min.y).toBeCloseTo(face.roof - w.WASHERS.parked - at.down - 0.1, 3);
            // Its cables straight up from it to the jib over the roof.
            for (const end of [0, 1]) {
                const top = i * 4 + end * 2;
                expect(cables.getX(top)).toBeCloseTo(cables.getX(top + 1), 6);
                expect(cables.getZ(top)).toBeCloseTo(cables.getZ(top + 1), 6);
                expect(cables.getY(top)).toBeGreaterThan(face.roof + 3);
                expect(cables.getY(top + 1)).toBeCloseTo(box.min.y + 0.1 + 0.75, 3);
                expect(cables.getX(top)).toBeGreaterThan(box.min.x);
                expect(cables.getX(top)).toBeLessThan(box.max.x);
            }
        });
        const night = momentAt(22);
        lit.setLife(night.at, 100, false, 100);
        lit.washers.crews.forEach(({ face, gondola }) => {
            const box = new THREE.Box3().setFromObject(gondola);
            expect(box.min.y).toBeCloseTo(face.roof - w.WASHERS.parked - 0.1, 3);
        });
    });

    test('both crews are seen at work from the desk or the window over the day', async () => {
        const w = await import('../www/office/js/washers.js');
        const cams = [cameraAt('desk'), cameraAt('window')];
        lit.washers.crews.forEach(({ face }, i) => {
            let seenAt = 0;
            let tried = 0;
            for (let h = 8.2; h < 17; h += 0.25) {
                const p = w.washerAt(face, momentAt(h).at, i);
                if (!p.working) continue;
                tried++;
                const point = new THREE.Vector3(face.x + p.along, face.roof - w.WASHERS.parked - p.down + 0.6, face.z + w.WASHERS.stand + 0.5);
                if (cams.some((cam) => seen(cam, point))) seenAt++;
            }
            expect(seenAt / tried).toBeGreaterThan(0.3);
        });
    });
});

describe('the gondolas and the flock, built from their source', () => {
    test('a gondola and its rig are boxes in the washers’ colors; the cables follow a hang; the flock hides on null', async () => {
        const fleet = await import('../www/office/js/fleet.js');
        const gulls = await import('../www/office/js/gulls.js');
        const w = await import('../www/office/js/washers.js');
        expect(fleet.gondolaBoxes(7).every((b) => Object.values(fleet.WASHER_COLORS).includes(b[6]))).toBe(true);
        // The head beam spans the gondola, out over the glass.
        const head = fleet.rigBoxes(7, 1.4, 4.6).at(-1);
        expect(head[3]).toBeGreaterThan(7);
        expect(head[2]).toBe(1.4);
        const scene = new THREE.Scene();
        const faces = w.washerFaces();
        const built = fleet.buildWashers(scene, faces);
        built.hang(faces.map(() => ({ along: 3, down: 10 })));
        const p = built.cables.geometry.attributes.position;
        expect(p.getY(0) - p.getY(1)).toBeCloseTo(4.35 + 2.4 + 10 - 0.75, 6);
        expect(p.getX(0)).toBeCloseTo(faces[0].x + 3 - 3.1, 6);
        const flock = fleet.buildGulls(scene, 2, gulls.gullShape(), gulls.flockTriangles);
        flock.fly([gulls.gullPose(gulls.flock()[0], 5), gulls.gullPose(gulls.flock()[1], 5)], -195);
        expect(flock.mesh.visible).toBe(true);
        flock.fly(null);
        expect(flock.mesh.visible).toBe(false);
        expect(flock.mesh.material.side).toBe(THREE.DoubleSide);
    });
});

describe('the gulls’ frame rate (QA, 2026-09-29: gliding gulls looked "laggy")', () => {
    test('in sight from the desk by day, so the scenery draws at gullFps; none at night', () => {
        expect(CONFIG.view.gullFps).toBeGreaterThan(CONFIG.view.ambientFps);
        expect(CONFIG.view.gullFps).toBeLessThanOrEqual(CONFIG.view.jetFps);
        lit.follow(cameraAt('desk'));
        const day = momentAt(11);
        lit.setLight(day.look, day.sky);
        lit.setLife(day.at, 100, false, 100);
        expect(lit.gullsInSight()).toBe(true);
        // Looking straight down at the floor, none.
        const down = cameraAt('desk');
        down.lookAt(down.position.clone().add(new THREE.Vector3(0, -1, 0.001)));
        down.updateMatrixWorld(true);
        lit.follow(down);
        expect(lit.gullsInSight()).toBe(false);
        lit.follow(cameraAt('desk'));
        const night = momentAt(23);
        lit.setLight(night.look, night.sky);
        lit.setLife(night.at, 100, false, 100);
        expect(lit.gullsInSight()).toBe(false);
    });

    test('a glide is never still: the wings trim and the gull rocks between its beats, gently', async () => {
        const gulls = await import('../www/office/js/gulls.js');
        const g = gulls.flock()[0];
        let t = 0;
        while (gulls.flapping(g, t) || gulls.flapping(g, t + 2)) t += 0.5;
        const a = gulls.gullPose(g, t);
        const b = gulls.gullPose(g, t + 0.5);
        expect(Math.abs(a.arm - b.arm) + Math.abs(a.hand - b.hand)).toBeGreaterThan(0.01);
        for (let s = t; s < t + 2; s += 0.1) {
            const p = gulls.gullPose(g, s);
            expect(Math.abs(p.arm - gulls.GLIDE.arm)).toBeLessThanOrEqual(gulls.TRIM.arm + 1e-9);
            expect(Math.abs(p.hand - gulls.GLIDE.hand)).toBeLessThanOrEqual(gulls.TRIM.hand + 1e-9);
        }
    });
});
