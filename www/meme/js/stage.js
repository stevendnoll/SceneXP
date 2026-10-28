// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * stage.js - the studio the meme's panels stand in (specs/meme PLANNING
 * section 5.1): a warm white room, a floor, soft daylight whose shadow falls
 * into the boxes, and the panels (panels.js) laid out in the template's
 * grid. The camera frames the whole arrangement; a tap on a panel glides
 * into it through its cell's own camera (the view the picture is drawn
 * with), a tap again glides back out, and a drag tilts the view a little.
 * Under reduced motion a glide is a cut and nothing drifts.
 *
 * THE TILT IS THE STAGE'S OWN, a small drag like the avatar studio's
 * turntable, rather than the shared pan part: that part builds full-screen
 * chrome (floating buttons, W and S keys, a surface that takes every
 * touch), and this page is a sheet that scrolls beside a stage.
 *
 * IT DRAWS ONLY WHEN SOMETHING CHANGED. Each frame checks the canvas's size
 * (it may have been hidden or resized) and draws when that, a glide, a drag
 * or anything else (`touch()`) marked the stage dirty, so a page left open
 * goes quiet. After each draw `onFrame` hears where every panel is on the
 * canvas, so the captions can be laid over it.
 *
 * Every browser API is handed in (`makeRenderer`, `reducedMotion`, `now`),
 * so tests run the whole path with fakes, and `buildStudio` is pure three,
 * so it is measured on the real library.
 */

import { buildPanel, layoutPanels, cellCamera, arrangementSize } from './panels.min.js';

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

/** The camera that frames a whole arrangement `size` (its width and
 *  height, meters, standing on y = 0) on a picture of `aspect`, through
 *  `fov` degrees, with the view's `margin` to spare and the box's `depth`
 *  in front: `{ eye, aim, fov }`. Pure. */
export function framingFor(size, aspect, fov, view, depth) {
    const tanH = Math.tan((fov * Math.PI) / 360);
    const center = [0, size.height / 2, 0];
    const d = Math.max(size.height / 2 / tanH, size.width / 2 / (tanH * Math.max(0.1, aspect))) * view.margin + depth / 2;
    return { eye: [0, center[1] + d * view.lift, d], aim: center, fov };
}

const smoothstep = (t) => {
    const x = Math.min(1, Math.max(0, t));
    return x * x * (3 - 2 * x);
};

/**
 * The stage on `canvas`. Returns the controller main.js drives:
 *
 *   scene, camera, renderer
 *   setTemplate(template, avatarFor)  the panels rebuilt for a template,
 *                       `avatarFor(roleId)` giving each role's avatar
 *   setExpression(cellIndex, id)  a cell's figure built again with a face
 *   panels              the built panels, in cell order
 *   cameraFor(index)    a cell's camera in world meters, { eye, aim, fov }
 *   view(index | null)  glide into a panel, or back out to all of them
 *   viewing             the panel looked into, or null
 *   screenRects()       where each panel is on the canvas, CSS pixels
 *   touch()             something changed: draw on the next frame
 *   start(), stop(), dispose()
 */
export function createStage(config, {
    canvas,
    mobile = false,
    reducedMotion = () => false,
    now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000,
    onFrame = () => {},
    /** Hears `view(index | null)` whenever what is looked at changes. */
    onView = () => {},
    makeRenderer = (c) => new THREE.WebGLRenderer({ canvas: c, antialias: true, powerPreference: 'low-power' })
} = {}) {
    const C = config.camera;
    const V = config.view;
    const renderer = makeRenderer(canvas);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = config.light.exposure;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const { scene, floor, lights } = buildStudio(config, { mobile });
    const camera = new THREE.PerspectiveCamera(C.fov, 1, 0.05, 80);
    let pose = { eye: C.eye.slice(), aim: C.aim.slice(), fov: C.fov };
    let glide = null;            // { from, to, t0 } while moving
    const tilt = { yaw: 0, pitch: 0 };

    let template = null;
    let panels = [];
    let viewing = null;
    let size = '';
    let dirty = true;
    let running = false;
    let frames = 0;
    let drag = null;

    function aspect() {
        const w = canvas.clientWidth || 0;
        const h = canvas.clientHeight || 0;
        return w && h ? w / h : 1;
    }

    /** The eye tilted about the aim by the drag's offsets. */
    function tilted(p) {
        if (!tilt.yaw && !tilt.pitch) return p;
        const aim = new THREE.Vector3(...p.aim);
        const dir = new THREE.Vector3(...p.eye).sub(aim);
        dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), tilt.yaw);
        const right = new THREE.Vector3(dir.z, 0, -dir.x).normalize();
        if (right.lengthSq() > 0) dir.applyAxisAngle(right, tilt.pitch);
        return { eye: aim.clone().add(dir).toArray(), aim: p.aim, fov: p.fov };
    }

    function place(p = pose) {
        const t = tilted(p);
        camera.fov = t.fov;
        camera.updateProjectionMatrix();
        camera.position.set(t.eye[0], t.eye[1], t.eye[2]);
        camera.lookAt(t.aim[0], t.aim[1], t.aim[2]);
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
        // The arrangement is framed for the canvas's shape.
        if (template && viewing === null && !glide) pose = allPose();
        place();
        return true;
    }

    function allPose() {
        return framingFor(arrangementSize(template, config.box), aspect(), C.fov, V, config.box.depth);
    }

    function cameraFor(index) {
        const panel = panels[index];
        if (!panel) return { eye: C.eye.slice(), aim: C.aim.slice(), fov: C.fov };
        return cellCamera(template.cells[index], panel.box);
    }

    /** Where the camera should be for what is viewed. */
    function targetPose() {
        return viewing === null ? allPose() : cameraFor(viewing);
    }

    /** A cell's first figure built again wearing `expression` (null for
     *  the template's own). */
    function setExpression(cellIndex, expression) {
        const panel = panels[cellIndex];
        if (!panel || !panel.figures.length) return null;
        const own = template.cells[cellIndex].figures[0].expression;
        const figure = panel.replaceFigure(0, { expression: expression || own }, avatars(template.cells[cellIndex].figures[0].role));
        dirty = true;
        return figure;
    }

    function view(index) {
        const was = viewing;
        viewing = Number.isInteger(index) && panels[index] ? index : null;
        if (viewing !== was) onView(viewing);
        const to = targetPose();
        if (reducedMotion() || !running) {
            glide = null;
            pose = to;
            place();
            return;
        }
        glide = { from: pose, to, t0: now() };
        dirty = true;
    }

    function stepGlide() {
        if (!glide) return;
        const k = smoothstep((now() - glide.t0) / V.glide);
        const mix = (a, b) => a.map((v, i) => v + (b[i] - v) * k);
        pose = { eye: mix(glide.from.eye, glide.to.eye), aim: mix(glide.from.aim, glide.to.aim), fov: glide.from.fov + (glide.to.fov - glide.from.fov) * k };
        if (k >= 1) {
            pose = glide.to;
            glide = null;
        }
        place();
    }

    /** Where each panel is on the canvas, CSS pixels: looking into one,
     *  that panel fills the canvas; otherwise each box's opening projected,
     *  or null for one behind the camera. */
    function screenRects() {
        const w = canvas.clientWidth || 0;
        const h = canvas.clientHeight || 0;
        if (!template) return [];
        if (viewing !== null && !glide) return panels.map((_, i) => (i === viewing ? { x: 0, y: 0, w, h } : null));
        const B = config.box;
        camera.updateMatrixWorld(true);
        return panels.map((panel) => {
            panel.box.updateMatrixWorld(true);
            let min = [Infinity, Infinity];
            let max = [-Infinity, -Infinity];
            for (const [x, y] of [[-B.width / 2, 0], [B.width / 2, 0], [-B.width / 2, B.height], [B.width / 2, B.height]]) {
                const p = panel.box.localToWorld(new THREE.Vector3(x, y, B.depth / 2)).project(camera);
                if (p.z > 1) return null;
                const sx = ((p.x + 1) / 2) * w;
                const sy = ((1 - p.y) / 2) * h;
                min = [Math.min(min[0], sx), Math.min(min[1], sy)];
                max = [Math.max(max[0], sx), Math.max(max[1], sy)];
            }
            return { x: min[0], y: min[1], w: max[0] - min[0], h: max[1] - min[1] };
        });
    }

    function frame() {
        if (!fit()) return;
        stepGlide();
        if (!dirty) return;
        dirty = false;
        frames++;
        renderer.render(scene, camera);
        onFrame(screenRects(), viewing, Boolean(glide));
    }

    function clearPanels() {
        for (const p of panels) p.dispose();
        panels = [];
    }

    let avatars = () => null;

    function setTemplate(next, avatarFor) {
        clearPanels();
        template = next;
        avatars = avatarFor;
        const spots = layoutPanels(next, config.box);
        panels = next.cells.map((cell, i) => {
            const panel = buildPanel(cell, config, avatarFor);
            panel.group.position.set(spots[i].x, spots[i].y, spots[i].z);
            scene.add(panel.group);
            return panel;
        });
        scene.updateMatrixWorld(true);
        if (viewing !== null) onView(null);
        viewing = null;
        glide = null;
        tilt.yaw = 0;
        tilt.pitch = 0;
        pose = allPose();
        place();
        return panels;
    }

    // ---- The drag and the tap ----------------------------------------------------

    function pointAt(e) {
        const rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function onDown(e) {
        if (e.button !== undefined && e.button !== 0) return;
        drag = { start: pointAt(e), last: pointAt(e), moved: false, yaw: tilt.yaw, pitch: tilt.pitch };
        if (canvas.setPointerCapture && e.pointerId !== undefined) {
            try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* not a pointer */ }
        }
    }

    function onMove(e) {
        if (!drag) return;
        const p = pointAt(e);
        const dx = p.x - drag.start.x;
        const dy = p.y - drag.start.y;
        if (Math.hypot(dx, dy) >= V.tapPixels) drag.moved = true;
        if (!drag.moved || reducedMotion()) return;
        tilt.yaw = Math.max(-V.tilt.yaw, Math.min(V.tilt.yaw, drag.yaw - dx * V.tilt.perPixel));
        tilt.pitch = Math.max(-V.tilt.pitch, Math.min(V.tilt.pitch, drag.pitch + dy * V.tilt.perPixel));
        drag.last = p;
        place();
    }

    function onUp(e) {
        if (!drag) return;
        const d = drag;
        drag = null;
        if (d.moved) return;
        // A tap: into the panel under it, or back out.
        if (viewing !== null) {
            view(null);
            return;
        }
        const p = pointAt(e);
        const rects = screenRects();
        const hit = rects.findIndex((r) => r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);
        if (hit >= 0) view(hit);
    }

    if (canvas.addEventListener) {
        canvas.addEventListener('pointerdown', onDown);
        canvas.addEventListener('pointermove', onMove);
        canvas.addEventListener('pointerup', onUp);
        canvas.addEventListener('pointercancel', () => { drag = null; });
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
        get viewing() { return viewing; },
        get gliding() { return Boolean(glide); },
        get tilt() { return { ...tilt }; },
        reducedMotion,
        setTemplate,
        setExpression,
        cameraFor,
        view,
        screenRects,
        touch() { dirty = true; },
        fit,
        frame,
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
