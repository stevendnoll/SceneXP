// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * studio.js - where the avatar stands (PRD section 6): a bright white studio,
 * a low stone plinth that turns, and soft daylight. Its own small renderer on
 * the page's one canvas.
 *
 * THE PLINTH IS THE TURNTABLE. The figure stands on it, and it turns slowly by
 * itself while the whole figure is in frame, stopping to face the front after
 * a while with nobody touching anything, so a page left open stops drawing.
 * A drag turns it, and so do the two turn buttons. Under reduced motion it
 * never turns by itself, and a button turns it at once.
 *
 * THE VISITOR ZOOMS, AND A TAB OR A CHOICE FRAMES ITS PART (Steve's QA,
 * 2026-10-24). The wheel, a trackpad, a pinch and the zoom buttons move the
 * view between the whole figure and close in, toward wherever they point,
 * and a drag pans up and down once in. The face's tabs and the feet's bring
 * the view in on them, facing the front; the clothes' tabs take it back out.
 * Tabs zooming felt clunky only while there was no way back out by hand.
 *
 * QUIET WHEN STILL. A frame is drawn only while something moves (the plinth,
 * the camera, a wave) or something changed (the figure, the canvas's size).
 *
 * The arithmetic is pure and exported (`coveProfile`, `frameFor`,
 * `closeFrame`, `viewFor`, `nearestFront`, `contactAlpha`), so the tests
 * check it without a renderer.
 */

import { createAvatar, renderPortrait, smoothstep, GESTURES } from '../../shared/js/avatar-figure-1.0.0.min.js';

// ---- The pure parts -------------------------------------------------------------

/**
 * The cove's profile, front to back and up, as `{ z, y, n: [nz, ny] }`: the
 * floor from `front` back to where the curve begins, a quarter circle of
 * `radius` rising to the wall, and the wall up to `height`. Each point
 * carries its normal, facing the room, so the light runs smoothly across the
 * curve and no seam shows.
 */
export function coveProfile(cove, segments = 20) {
    const r = cove.radius;
    const back = -cove.back;
    const pts = [{ z: cove.front, y: 0, n: [0, 1] }];
    for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * (Math.PI / 2);
        // From the floor (normal up) round to the wall (normal toward +z).
        pts.push({ z: back + r - Math.sin(a) * r, y: r - Math.cos(a) * r, n: [Math.sin(a), Math.cos(a)] });
    }
    pts.push({ z: back, y: cove.height, n: [1, 0] });
    return pts;
}

/** How dark the soft shadow under the plinth is `r` meters from its middle. */
export function contactAlpha(r, radius, contact) {
    const t = (r - (radius - contact.inside)) / (contact.soft + contact.inside);
    return contact.alpha * (1 - smoothstep(t));
}

/**
 * The camera for a framing (`config.camera.frames[name]`) on a canvas of
 * `aspect`, the figure standing `standY` above the floor: `{ eye, aim }`.
 * Far enough back that `height` fits top to bottom and `half` either side,
 * whichever needs more, with `margin` to spare.
 */
export function frameFor(frame, aspect, fov, standY = 0) {
    const a = aspect > 0 ? aspect : 1;
    const tan = Math.tan((fov * Math.PI) / 360);
    const distance = Math.max(frame.height / 2 / tan, frame.half / (tan * a)) * frame.margin;
    const y = standY + frame.center;
    return { eye: [0, y + frame.lift, distance], aim: [0, y, 0] };
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));

/**
 * The close framing for a focus `focus` meters above the plinth's top: the
 * feet's framing at the feet's height, the face's at the face's, and in
 * between in proportion (so a focus on the knees looks down a little less
 * than one on the shoes).
 */
export function closeFrame(focus, C) {
    const feet = C.frames.feet;
    const face = C.frames.face;
    const k = clamp01((focus - feet.center) / (face.center - feet.center));
    const mix = (a, b) => a + (b - a) * k;
    return { center: focus, height: mix(feet.height, face.height), half: mix(feet.half, face.half), lift: mix(feet.lift, face.lift), margin: mix(feet.margin, face.margin) };
}

/**
 * The camera at `zoom` (0 the whole figure, 1 close in) about a `focus`
 * height (Steve's QA, 2026-10-24: zoom by hand, not only by tab). The
 * distance moves evenly in proportion (each step in looks the same size),
 * and the aim slides from the figure's middle to the focus as it comes in.
 * At 0 it is exactly the body's framing, at 1 exactly the close one.
 */
export function viewFor(zoom, focus, aspect, C, standY = 0) {
    const body = frameFor(C.frames.body, aspect, C.fov, standY);
    const close = frameFor(closeFrame(focus, C), aspect, C.fov, standY);
    const z = clamp01(zoom);
    const db = body.eye[2];
    const dc = close.eye[2];
    const d = db * (dc / db) ** z;
    const w = aimShare(Math.abs(db - dc) < 1e-9 ? z : (db - d) / (db - dc));
    const mix = (a, b) => a + (b - a) * w;
    const aim = mix(body.aim[1], close.aim[1]);
    return { eye: [0, aim + mix(body.eye[1] - body.aim[1], close.eye[1] - close.aim[1]), d], aim: [0, aim, 0] };
}

/**
 * How far the aim has slid from the figure's middle to the focus, for a view
 * `share` of the way in (by distance): quickly at first, so the first step
 * of the zoom is already looking at what it zooms toward (Steve's QA,
 * 2026-10-24: one press of + looked at the torso, whatever the focus). 0 at
 * 0 and 1 at 1, so the end framings are untouched.
 */
export function aimShare(share) {
    return 1 - (1 - clamp01(share)) ** 3;
}

/** The front-facing angle nearest `angle` (a whole number of turns), so
 *  the plinth turns the short way round to face the front. */
export function nearestFront(angle) {
    return Math.round(angle / (Math.PI * 2)) * Math.PI * 2;
}

// ---- Building it (three) ------------------------------------------------------

function buildCove(cove, material) {
    const pts = coveProfile(cove);
    const half = cove.width / 2;
    const positions = [];
    const normals = [];
    const index = [];
    pts.forEach((p, i) => {
        positions.push(-half, p.y, p.z, half, p.y, p.z);
        normals.push(0, p.n[1], p.n[0], 0, p.n[1], p.n[0]);
        if (i > 0) {
            const a = (i - 1) * 2;
            index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setIndex(index);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'cove';
    mesh.receiveShadow = true;
    return mesh;
}

/** The soft shadow under the plinth: rings of vertices, dark in the middle
 *  and clear at the edge, laid just over the floor. */
function buildContact(radius, contact) {
    const rings = [0, (radius - contact.inside) * 0.5];
    for (let i = 0; i <= 10; i++) rings.push(radius - contact.inside + ((contact.soft + contact.inside) * i) / 10);
    const seg = 48;
    const positions = [];
    const colors = [];
    const index = [];
    rings.forEach((r, j) => {
        const alpha = contactAlpha(r, radius, contact);
        for (let i = 0; i < seg; i++) {
            const t = (i / seg) * Math.PI * 2;
            positions.push(Math.cos(t) * r, contact.lift, Math.sin(t) * r);
            colors.push(0, 0, 0, alpha);
        }
        if (j > 0) {
            const b0 = (j - 1) * seg;
            const b1 = j * seg;
            for (let i = 0; i < seg; i++) {
                const n = (i + 1) % seg;
                // Wound to face up (tests/avatar-init measures it).
                index.push(b0 + i, b0 + n, b1 + i, b0 + n, b1 + n, b1 + i);
            }
        }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
    geometry.setIndex(index);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
        color: 0xffffff, vertexColors: true, transparent: true, depthWrite: false
    }));
    mesh.name = 'contact-shadow';
    mesh.renderOrder = 1;
    return mesh;
}

/** The plinth: a stone disc with a slim chamfer round its top, on a dark
 *  toe set in. Its top is at `height`. */
function buildPlinth(p) {
    const stone = new THREE.MeshStandardMaterial({ color: p.stone, roughness: 0.5 });
    const toe = new THREE.MeshStandardMaterial({ color: p.toeColor, roughness: 0.9 });
    const body = p.height - p.toe - p.chamfer;
    const group = new THREE.Group();
    group.name = 'plinth';
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(p.radius, p.radius, body, 96), stone);
    drum.position.y = p.toe + body / 2;
    const chamfer = new THREE.Mesh(new THREE.CylinderGeometry(p.radius - p.chamfer, p.radius, p.chamfer, 96), stone);
    chamfer.position.y = p.height - p.chamfer / 2;
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(p.radius - p.inset, p.radius - p.inset, p.toe, 64), toe);
    foot.position.y = p.toe / 2;
    for (const m of [drum, chamfer, foot]) {
        m.castShadow = true;
        m.receiveShadow = true;
        group.add(m);
    }
    return group;
}

function buildLights(light, mobile) {
    const { sky, sun: s, fill } = light;
    const lights = [new THREE.HemisphereLight(sky.color, sky.ground, sky.intensity)];
    const sun = new THREE.DirectionalLight(s.color, s.intensity);
    sun.position.set(...s.position);
    sun.target.position.set(...s.target);
    sun.castShadow = true;
    const size = mobile ? s.shadow.size / 2 : s.shadow.size;
    sun.shadow.mapSize.set(size, size);
    const cam = sun.shadow.camera;
    cam.left = -s.shadow.reach;
    cam.right = s.shadow.reach;
    cam.top = s.shadow.reach * 2;
    cam.bottom = -s.shadow.reach;
    cam.near = s.shadow.near;
    cam.far = s.shadow.far;
    sun.shadow.bias = s.shadow.bias;
    sun.shadow.normalBias = s.shadow.normalBias;
    sun.shadow.radius = s.shadow.radius;
    lights.push(sun, sun.target);
    const f = new THREE.DirectionalLight(fill.color, fill.intensity);
    f.position.set(...fill.position);
    lights.push(f);
    return lights;
}

/**
 * The stage itself, without a renderer or a camera: the white cove, the
 * soft shadow, the lights, and the plinth on its turntable, with the height
 * a figure stands at. The studio draws it live; the export (js/export.js,
 * 2026-10-26) draws the same stage into a picture or a clip, so an export
 * looks exactly like the page. Returns `{ scene, turntable, standY, set }`,
 * `set` naming the cove, the contact shadow and the plinth, so an export
 * with a clear background can hide them.
 */
export function buildStage(config, { mobile = false } = {}) {
    const S = config.studio;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(S.color);
    const white = new THREE.MeshStandardMaterial({ color: S.color, roughness: 0.95, metalness: 0 });
    const cove = buildCove(S.cove, white);
    const contact = buildContact(S.plinth.radius, S.contact);
    scene.add(cove);
    scene.add(contact);
    for (const light of buildLights(config.light, mobile)) scene.add(light);
    const turntable = new THREE.Group();
    turntable.name = 'turntable';
    const plinth = buildPlinth(S.plinth);
    turntable.add(plinth);
    scene.add(turntable);
    return { scene, turntable, standY: S.plinth.height, set: { cove, contact, plinth } };
}

// ---- The studio -----------------------------------------------------------------

/**
 * The studio on `canvas`. `makeRenderer(canvas)` is the WebGLRenderer (a
 * test passes its own), `reducedMotion()` is asked every frame, and `now()`
 * gives seconds. Returns the controller main.js drives:
 *
 *   scene, camera, renderer
 *   setAvatar(avatar)   the figure rebuilt in this avatar
 *   setFrame(name)      'body', 'face' or 'feet', eased (after a choice)
 *   zoomIn(), zoomOut() the zoom buttons; the wheel, a trackpad and a pinch
 *                       zoom by themselves, toward where they point
 *   turnBy(radians)     a turn button's step, eased
 *   faceFront()         turn to face the front, the short way
 *   celebrate()         face the front, then wave (after a save)
 *   touch()             somebody did something: the plinth may turn again
 *   portrait(avatar, options)  the avatar's portrait (renderPortrait), the
 *                       studio drawn again straight after
 *   start(), stop(), dispose()
 */
export function createStudio(config, {
    canvas,
    mobile = false,
    reducedMotion = () => false,
    now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000,
    makeRenderer = (c) => new THREE.WebGLRenderer({ canvas: c, antialias: true, powerPreference: 'low-power' })
} = {}) {
    const S = config.studio;
    const T = config.turntable;
    const C = config.camera;
    const renderer = makeRenderer(canvas);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = config.light.exposure;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    const { scene, turntable, standY } = buildStage(config, { mobile });

    const camera = new THREE.PerspectiveCamera(C.fov, 1, 0.05, 60);

    let figure = null;
    // The view: where it is now, and where it is heading. A wheel, a pinch,
    // the zoom buttons and a choice (`setFrame`) all move the goal; each
    // frame the view closes on it.
    const view = { zoom: 0, focus: C.frames.face.center };
    const goal = { zoom: 0, focus: C.frames.face.center };
    let pose = null;            // where the camera is now
    let size = '';
    let dirty = true;
    let last = 0;
    let lastTouch = now();
    let spinning = true;
    let target = null;          // the angle the plinth is easing to, or null
    let turnFrom = 0;
    let turnT = 1;
    let waveIn = -1;            // seconds until a wave, or -1 for none
    let dragging = null;
    let running = false;

    function aspect() {
        const w = canvas.clientWidth || 0;
        const h = canvas.clientHeight || 0;
        return w && h ? w / h : 1;
    }

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

    function place() {
        pose = viewFor(view.zoom, view.focus, aspect(), C, standY);
        camera.position.set(pose.eye[0], pose.eye[1], pose.eye[2]);
        camera.lookAt(pose.aim[0], pose.aim[1], pose.aim[2]);
        camera.updateMatrixWorld();
    }

    /** Move the view's goal: `zoom` kept within 0 and 1, `focus` within the
     *  figure. The plinth stops turning by itself once the view is in. */
    function aimFor(zoom, focus = goal.focus) {
        goal.zoom = clamp01(zoom);
        goal.focus = Math.min(C.zoom.highest, Math.max(C.zoom.lowest, focus));
        if (goal.zoom > 0) spinning = false;
        if (reducedMotion()) Object.assign(view, goal);
        // Zoomed in, an upright drag pans the view, so on a phone the canvas
        // takes it rather than the page; zoomed out, the page scrolls.
        if (canvas.style) canvas.style.touchAction = goal.zoom > 0 ? 'none' : 'pan-y';
        dirty = true;
    }

    /** Where the + button zooms: the face, the torso or the feet, as the
     *  visitor's tab says (Steve's QA, 2026-10-24). */
    let zoomTarget = C.frames.face.center;

    /** The height on the figure under a point on the canvas (its middle
     *  plane), above the plinth's top. */
    function heightAt(clientY) {
        const rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
        if (!rect || !rect.height) return goal.focus;
        const ndc = 1 - (2 * (clientY - rect.top)) / rect.height;
        const p = new THREE.Vector3(0, ndc, 0.5).unproject(camera).sub(camera.position);
        if (Math.abs(p.z) < 1e-9) return goal.focus;
        const t = -camera.position.z / p.z;
        return camera.position.y + p.y * t - standY;
    }

    /** Zoom by `amount` (a share of the whole range), the focus drifting
     *  toward a point the visitor is pointing at, if any. */
    function zoomBy(amount, clientY = null) {
        let focus = goal.focus;
        if (clientY !== null && amount > 0) focus += (heightAt(clientY) - focus) * C.zoom.drift;
        aimFor(goal.zoom + amount, focus);
        lastTouch = now();
    }

    function startTurn(to) {
        turnFrom = turntable.rotation.y;
        target = to;
        turnT = 0;
        if (reducedMotion()) {
            turntable.rotation.y = to;
            target = null;
            turnT = 1;
        }
        dirty = true;
    }

    function step(dt) {
        const still = reducedMotion();
        let moved = false;
        // The view closes on its goal, quickly at first and gently at the end.
        if (Math.abs(view.zoom - goal.zoom) > 1e-4 || Math.abs(view.focus - goal.focus) > 1e-4) {
            const k = still ? 1 : 1 - Math.exp(-dt * C.zoom.follow);
            view.zoom += (goal.zoom - view.zoom) * k;
            view.focus += (goal.focus - view.focus) * k;
            if (Math.abs(view.zoom - goal.zoom) <= 1e-4 && Math.abs(view.focus - goal.focus) <= 1e-4) Object.assign(view, goal);
            moved = true;
        }
        // A turn to a set angle (a button, facing the front).
        if (target !== null) {
            turnT = Math.min(1, turnT + dt / T.stepSeconds);
            turntable.rotation.y = turnFrom + (target - turnFrom) * smoothstep(turnT);
            if (turnT >= 1) {
                turntable.rotation.y = target;
                target = null;
            }
            moved = true;
        } else if (spinning && !dragging && !still && goal.zoom === 0) {
            // Turning by itself, until nobody has touched anything for a while.
            if (now() - lastTouch > T.idle) {
                spinning = false;
                startTurn(nearestFront(turntable.rotation.y));
            } else {
                turntable.rotation.y += T.speed * dt;
            }
            moved = true;
        }
        // A wave waiting for the plinth to face the front.
        if (waveIn >= 0 && target === null) {
            waveIn -= dt;
            if (waveIn < 0 && figure) figure.gesture('wave');
            moved = true;
        }
        if (figure && figure.tick(dt, { reducedMotion: still })) moved = true;
        return moved;
    }

    function draw() {
        place();
        renderer.render(scene, camera);
    }

    function frame() {
        const t = now();
        const dt = last ? Math.min(t - last, config.quality.maxFrameSeconds) : 0;
        last = t;
        if (!fit()) return;
        if (step(dt)) dirty = true;
        if (!dirty) return;
        dirty = false;
        draw();
    }

    // ---- Dragging the plinth round ----------------------------------------------

    // One finger (or the mouse) turns the plinth; two fingers pinch to zoom,
    // about the point between them.
    const pointers = new Map();
    let pinch = 0;
    const spread = () => {
        const [a, b] = [...pointers.values()];
        return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const onDown = (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (canvas.setPointerCapture && e.pointerId !== undefined) canvas.setPointerCapture(e.pointerId);
        if (pointers.size === 2) {
            dragging = null;
            pinch = spread();
            return;
        }
        dragging = { id: e.pointerId, x: e.clientX, y: e.clientY };
        target = null;
        api.touch();
    };
    const onMove = (e) => {
        const p = pointers.get(e.pointerId);
        if (!p) return;
        p.x = e.clientX;
        p.y = e.clientY;
        if (pointers.size === 2) {
            const now2 = spread();
            if (pinch > 0 && now2 > 0) {
                const [a, b] = [...pointers.values()];
                zoomBy(Math.log(now2 / pinch) * C.zoom.pinch, (a.y + b.y) / 2);
            }
            pinch = now2;
            return;
        }
        if (!dragging || e.pointerId !== dragging.id) return;
        const dx = e.clientX - dragging.x;
        const dy = e.clientY - dragging.y;
        dragging.x = e.clientX;
        dragging.y = e.clientY;
        turntable.rotation.y += dx * T.drag;
        // Zoomed in, an upright drag pans up or down the figure (Steve's QA,
        // 2026-10-24: there was no way to look up or down once in), the
        // figure following the finger.
        if (goal.zoom > 0 && dy && pose) {
            const height = canvas.clientHeight || 1;
            const perPixel = (2 * pose.eye[2] * Math.tan((C.fov * Math.PI) / 360)) / height;
            const share = Math.max(0.25, aimShare(view.zoom));
            const focus = Math.min(C.zoom.highest, Math.max(C.zoom.lowest, goal.focus + (dy * perPixel) / share));
            goal.focus = focus;
            view.focus = focus;
        }
        lastTouch = now();
        dirty = true;
    };
    const onUp = (e) => {
        pointers.delete(e.pointerId);
        if (pointers.size < 2) pinch = 0;
        if (canvas.releasePointerCapture && e.pointerId !== undefined) canvas.releasePointerCapture(e.pointerId);
        if (dragging && e.pointerId === dragging.id) dragging = null;
    };
    // The wheel, and a trackpad's pinch (a wheel with ctrlKey), zoom toward
    // the point under the pointer. It is the canvas's own: the page never
    // scrolls under it.
    const onWheel = (e) => {
        if (e.preventDefault) e.preventDefault();
        const lines = e.deltaMode === 1 ? 16 : 1;
        zoomBy(-e.deltaY * lines * C.zoom.wheel * (e.ctrlKey ? C.zoom.trackpad : 1), e.clientY);
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    const api = {
        scene,
        camera,
        renderer,
        turntable,
        get figure() {
            return figure;
        },
        /** Where the view is heading, in words: 'body' when it is out,
         *  'face' or 'feet' when it is in, by its focus. */
        get framing() {
            if (goal.zoom < 0.5) return 'body';
            return goal.focus > (C.frames.face.center + C.frames.feet.center) / 2 ? 'face' : 'feet';
        },
        /** The view's goal: `{ zoom, focus }`. */
        get zoom() {
            return { ...goal };
        },
        get dirty() {
            return dirty;
        },
        setAvatar(avatar) {
            const waving = figure ? figure.gesturing : null;
            if (figure) figure.dispose();
            figure = createAvatar(avatar);
            figure.group.position.y = standY;
            turntable.add(figure.group);
            if (waving) figure.gesture(waving);
            dirty = true;
            return figure;
        },
        /**
         * Frame a part: 'face' or 'feet' brings the view in on it, facing the
         * front; 'body' takes it out to the whole figure. A tab and a choice
         * both frame (the visitor can always zoom back out by hand). Asked
         * again, it centers again, undoing a pan.
         */
        setFrame(name) {
            if (!C.frames[name]) return;
            const focus = name === 'body' ? goal.focus : C.frames[name].center;
            if (name === api.framing && goal.focus === focus && (name === 'body' || goal.zoom === 1)) return;
            api.touch();
            if (name === 'body') {
                aimFor(0);
                spinning = true;
                return;
            }
            aimFor(1, C.frames[name].center);
            api.faceFront();
        },
        /** Where + zooms from now on: 'face', 'body' (the torso) or
         *  'feet'. The view does not move (a tab never moves it). */
        setZoomTarget(name) {
            if (name === 'body') zoomTarget = C.zoom.torso;
            else if (C.frames[name]) zoomTarget = C.frames[name].center;
        },
        /** The zoom buttons: in, toward the tab's target; out, about the
         *  present focus. */
        zoomIn() {
            aimFor(goal.zoom + C.zoom.step, zoomTarget);
            lastTouch = now();
        },
        zoomOut() {
            zoomBy(-C.zoom.step);
            if (goal.zoom === 0) spinning = true;
        },
        turnBy(radians) {
            const base = target !== null ? target : turntable.rotation.y;
            startTurn(base + radians);
            api.touch();
        },
        faceFront() {
            startTurn(nearestFront(target !== null ? target : turntable.rotation.y));
        },
        celebrate() {
            api.faceFront();
            spinning = false;
            waveIn = reducedMotion() ? -1 : config.waveAfterSave;
            lastTouch = now();
            dirty = true;
        },
        /** Somebody did something: the plinth may turn by itself again. */
        touch() {
            lastTouch = now();
            spinning = true;
            dirty = true;
        },
        portrait(avatar, options = {}) {
            const src = renderPortrait(renderer, avatar, options);
            // Drawn again at once, in the same task, so the portrait's square
            // in the corner is never shown.
            draw();
            return src;
        },
        /** One step and one frame, for the warmup and the tests. */
        frame,
        start() {
            if (running) return;
            running = true;
            last = 0;
            dirty = true;
            renderer.setAnimationLoop(frame);
        },
        stop() {
            running = false;
            renderer.setAnimationLoop(null);
        },
        dispose() {
            api.stop();
            canvas.removeEventListener('pointerdown', onDown);
            canvas.removeEventListener('pointermove', onMove);
            canvas.removeEventListener('pointerup', onUp);
            canvas.removeEventListener('pointercancel', onUp);
            canvas.removeEventListener('wheel', onWheel);
            if (figure) figure.dispose();
            if (renderer.dispose) renderer.dispose();
        }
    };
    place();
    return api;
}

export { GESTURES };
