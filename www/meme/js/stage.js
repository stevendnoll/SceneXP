// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * stage.js - the studio the meme's panels stand in (specs/meme PLANNING
 * section 5.1): a warm white room, a floor, soft daylight whose shadow falls
 * into the boxes, and the panels (panels.js) laid out in the template's
 * grid. M1 looks into the one panel through its cell's own camera, so the
 * live view is the meme's panel; M2 adds the arrangement, the tilt and the
 * glide into a panel.
 *
 * IT DRAWS ONLY WHEN SOMETHING CHANGED. Each frame checks the canvas's size
 * (it may have been hidden or resized) and draws when that or anything else
 * (`touch()`) marked the stage dirty, so a page left open goes quiet.
 *
 * Every browser API is handed in (`makeRenderer`, `reducedMotion`), so
 * tests run the whole path with fakes, and `buildStudio` is pure three, so
 * it is measured on the real library.
 */

import { buildPanel, layoutPanels, cellCamera } from './panels.min.js';

/** The room: the background, the floor and the lights, in one scene. */
export function buildStudio(config, { mobile = false } = {}) {
    const S = config.studio;
    const L = config.light;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(S.color);

    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(S.floor.size, S.floor.size),
        new THREE.MeshStandardMaterial({ color: S.floor.color, roughness: 0.95, metalness: 0 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.name = 'floor';
    floor.receiveShadow = true;
    scene.add(floor);

    const sky = new THREE.HemisphereLight(L.sky.color, L.sky.ground, L.sky.intensity);
    sky.name = 'sky';
    scene.add(sky);

    const sun = new THREE.DirectionalLight(L.sun.color, L.sun.intensity);
    sun.name = 'sun';
    sun.position.set(...L.sun.position);
    sun.target.position.set(...L.sun.target);
    const sh = L.sun.shadow;
    if (sh) {
        sun.castShadow = true;
        const size = mobile ? sh.size / 2 : sh.size;
        sun.shadow.mapSize.set(size, size);
        const cam = sun.shadow.camera;
        cam.left = -sh.reach;
        cam.right = sh.reach;
        cam.top = sh.reach;
        cam.bottom = -sh.reach;
        cam.near = sh.near;
        cam.far = sh.far;
        sun.shadow.bias = sh.bias;
        sun.shadow.normalBias = sh.normalBias;
        sun.shadow.radius = sh.radius;
    }
    scene.add(sun);
    scene.add(sun.target);

    const fill = new THREE.DirectionalLight(L.fill.color, L.fill.intensity);
    fill.name = 'fill';
    fill.position.set(...L.fill.position);
    scene.add(fill);

    return { scene, floor, lights: { sky, sun, fill } };
}

/**
 * The stage on `canvas`. Returns the controller main.js drives:
 *
 *   scene, camera, renderer
 *   setTemplate(template, avatarFor)  the panels rebuilt for a template,
 *                       `avatarFor(roleId)` giving each role's avatar
 *   panels              the built panels, in cell order
 *   cameraFor(index)    a cell's camera in world meters, { eye, aim, fov }
 *   view(index)         look into a panel through its camera
 *   touch()             something changed: draw on the next frame
 *   start(), stop(), dispose()
 */
export function createStage(config, {
    canvas,
    mobile = false,
    reducedMotion = () => false,
    makeRenderer = (c) => new THREE.WebGLRenderer({ canvas: c, antialias: true, powerPreference: 'low-power' })
} = {}) {
    const C = config.camera;
    const renderer = makeRenderer(canvas);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = config.light.exposure;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const { scene, floor, lights } = buildStudio(config, { mobile });
    const camera = new THREE.PerspectiveCamera(C.fov, 1, 0.05, 80);
    let pose = { eye: C.eye, aim: C.aim, fov: C.fov };

    let template = null;
    let panels = [];
    let size = '';
    let dirty = true;
    let running = false;
    let frames = 0;

    function place() {
        camera.fov = pose.fov;
        camera.updateProjectionMatrix();
        camera.position.set(pose.eye[0], pose.eye[1], pose.eye[2]);
        camera.lookAt(pose.aim[0], pose.aim[1], pose.aim[2]);
        camera.updateMatrixWorld();
        dirty = true;
    }
    place();

    /** The drawing buffer the size the canvas is shown at. Checked every
     *  frame: the canvas may have been hidden or resized since. */
    function fit() {
        const w = canvas.clientWidth || 0;
        const h = canvas.clientHeight || 0;
        if (!w || !h) return false;
        const max = mobile ? config.quality.maxPixelRatioMobile : config.quality.maxPixelRatio;
        const ratio = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, max);
        const key = `${w}x${h}@${ratio}`;
        if (key === size) return true;
        size = key;
        renderer.setPixelRatio(ratio);
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        dirty = true;
        return true;
    }

    function frame() {
        if (!fit()) return;
        if (!dirty) return;
        dirty = false;
        frames++;
        renderer.render(scene, camera);
    }

    function clearPanels() {
        for (const p of panels) p.dispose();
        panels = [];
    }

    function setTemplate(next, avatarFor) {
        clearPanels();
        template = next;
        const spots = layoutPanels(next, config.box);
        panels = next.cells.map((cell, i) => {
            const panel = buildPanel(cell, config, avatarFor);
            panel.group.position.set(spots[i].x, spots[i].y, spots[i].z);
            scene.add(panel.group);
            return panel;
        });
        scene.updateMatrixWorld(true);
        view(0);
        return panels;
    }

    function cameraFor(index) {
        const panel = panels[index];
        if (!panel) return { eye: C.eye.slice(), aim: C.aim.slice(), fov: C.fov };
        return cellCamera(template.cells[index], panel.box);
    }

    function view(index) {
        pose = cameraFor(index);
        place();
    }

    return {
        scene,
        camera,
        renderer,
        floor,
        lights,
        get template() { return template; },
        get panels() { return panels; },
        get frames() { return frames; },
        get running() { return running; },
        get pose() { return pose; },
        reducedMotion,
        setTemplate,
        cameraFor,
        view,
        touch() { dirty = true; },
        fit,
        start() {
            if (running) return;
            running = true;
            renderer.setAnimationLoop(frame);
        },
        stop() {
            if (!running) return;
            running = false;
            renderer.setAnimationLoop(null);
        },
        dispose() {
            this.stop();
            clearPanels();
            scene.traverse((o) => {
                if (o.geometry) o.geometry.dispose();
                if (o.material) o.material.dispose();
            });
            renderer.dispose();
        }
    };
}
