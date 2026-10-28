// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The shadows stay in their own panels (QA 2026-10-28, specs/meme): a
 * figure's shadow used to fall through its box's floor into the panel
 * below, and the top rows of a tall template got no shadow at all. Now
 * the box's planes cast, the sun comes in low through the openings, and
 * the stage fits the sun's shadow camera to each arrangement. On the real
 * three, since the stub absorbs every assignment.
 */
import { jest } from '@jest/globals';
import { loadRealThree } from './helpers/real-three.mjs';

let THREE;
let CONFIG;
let P;
let S;
let T;

beforeAll(async () => {
    THREE = await loadRealThree();
    globalThis.THREE = THREE;
    jest.resetModules();
    ({ MEME_PAGE: CONFIG } = await import('../www/meme/js/config.js'));
    P = await import('../www/meme/js/panels.js');
    S = await import('../www/meme/js/stage.js');
    T = await import('../www/meme/js/templates.js');
});

afterAll(() => {
    delete globalThis.THREE;
});

test('every plane of a box casts a shadow from either side, and receives one', () => {
    const box = P.buildBox(CONFIG.box, '#ff0000');
    const planes = box.children.filter((o) => o.isMesh);
    expect(planes.map((p) => p.name).sort()).toEqual(['back', 'ceiling', 'floor', 'left', 'right']);
    for (const p of planes) {
        expect(p.castShadow).toBe(true);
        expect(p.receiveShadow).toBe(true);
        expect(p.material.shadowSide).toBe(THREE.DoubleSide);
    }
});

test('the sun stands low in front, so a box is lit only through its opening', () => {
    const dir = S.sunDirection(CONFIG.light);
    expect(dir.length()).toBeCloseTo(1, 9);
    expect(dir.z).toBeGreaterThan(0.9);
    expect(dir.y).toBeGreaterThan(0);
    // No steeper than fifteen degrees: the ceiling's shadow line on the
    // back wall stays near the top of the box.
    expect(Math.asin(dir.y)).toBeLessThan((15 * Math.PI) / 180);
});

test('the ceiling\'s shadow line on the back wall is above everything a close camera sees', () => {
    const B = CONFIG.box;
    const dir = S.sunDirection(CONFIG.light);
    const line = B.height - B.depth * (dir.y / Math.hypot(dir.x, dir.z));
    // A wide shot that takes in the ceiling may show a hand's width of its
    // shadow at the top of the wall: a shadowbox's own. No deeper.
    const band = 0.1;
    let close = 0;
    for (const template of T.TEMPLATES) {
        for (const cell of template.cells) {
            const cam = new THREE.PerspectiveCamera(cell.camera.fov, 1, 0.02, 40);
            cam.position.fromArray(cell.camera.eye);
            cam.lookAt(...cell.camera.aim);
            cam.updateMatrixWorld(true);
            // The top of the view, where it meets the back wall.
            const top = new THREE.Vector3(0, 1, 0.5).unproject(cam).sub(cam.position).normalize();
            const t = (-B.depth / 2 - cam.position.z) / top.z;
            const yAtWall = cam.position.y + top.y * t;
            if (yAtWall < B.height - band) close++;
            expect({ template: template.id, seen: Math.min(yAtWall, B.height - band), line })
                .toEqual({ template: template.id, seen: expect.any(Number), line: expect.any(Number) });
            expect(Math.min(yAtWall, B.height - band)).toBeLessThan(line);
        }
    }
    expect(close).toBeGreaterThan(5);  // the face cells, at least
});

test('the shadow camera is fitted to the arrangement, aimed at its middle, from the sun\'s direction', () => {
    const { lights } = S.buildStudio(CONFIG);
    const sun = lights.sun;
    const B = CONFIG.box;
    const one = S.fitSun(sun, { width: B.width, height: B.height }, CONFIG.light, B);
    expect(one).toBeGreaterThanOrEqual(CONFIG.light.sun.shadow.reach);
    // Galaxy Brain: four rows, two columns. Every box within the reach.
    const size = P.arrangementSize(T.templateOf('galaxyBrain'), B);
    const reach = S.fitSun(sun, size, CONFIG.light, B);
    expect(reach).toBeGreaterThan(one);
    expect(reach).toBeGreaterThanOrEqual(size.height / 2 + B.depth);
    expect(sun.shadow.camera.top).toBe(reach);
    expect(sun.shadow.camera.left).toBe(-reach);
    expect(sun.target.position.toArray()).toEqual([0, size.height / 2, 0]);
    const toSun = sun.position.clone().sub(sun.target.position).normalize();
    expect(toSun.distanceTo(S.sunDirection(CONFIG.light))).toBeLessThan(1e-9);
    // The depth range holds every caster: the far corner of the farthest
    // box is nearer than the far plane, the nearest nearer than... the near.
    const distance = sun.position.distanceTo(sun.target.position);
    expect(sun.shadow.camera.near).toBeLessThan(distance - reach);
    expect(sun.shadow.camera.far).toBeGreaterThan(distance + reach);
});

test('a template shown on the stage re-aims the sun at it', async () => {
    const { DEFAULT_AVATAR } = await import('../www/shared/js/avatar-1.0.0.js');
    const r = { shadowMap: {}, setPixelRatio() {}, setSize() {}, render() {}, setAnimationLoop() {}, dispose() {} };
    const stage = S.createStage(CONFIG, { canvas: { clientWidth: 800, clientHeight: 600 }, makeRenderer: () => r });
    stage.setTemplate(T.templateOf('panic'), () => DEFAULT_AVATAR);
    const size = P.arrangementSize(T.templateOf('panic'), CONFIG.box);
    expect(stage.lights.sun.target.position.y).toBeCloseTo(size.height / 2, 9);
    expect(stage.lights.sun.shadow.camera.top).toBeGreaterThanOrEqual(size.height / 2 + CONFIG.box.depth);
    stage.dispose();
});
