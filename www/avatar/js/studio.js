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
 * THE CAMERA FRAMES WHAT IS BEING CHOSEN. Each tab names a framing (the whole
 * figure, the face, the feet), and the camera eases between them, so eye
 * color is chosen looking at the eyes. The plinth turns the figure to face
 * the front for the face and the feet.
 *
 * QUIET WHEN STILL. A frame is drawn only while something moves (the plinth,
 * the camera, a wave) or something changed (the figure, the canvas's size).
 *
 * The arithmetic is pure and exported (`coveProfile`, `frameFor`,
 * `nearestFront`, `contactAlpha`), so the tests check it without a renderer.
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

/** The front-facing angle nearest `angle` (a whole number of turns), so
 *  the plinth turns the short way round to face the front. */
export function nearestFront(angle) {
    return Math.round(angle / (Math.PI * 2)) * Math.PI * 2;
}

/** `a` to `b` by `k` (0 to 1), for each of three numbers. */
function mix3(a, b, k) {
    return [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * k);
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

// ---- The studio -----------------------------------------------------------------

/**
 * The studio on `canvas`. `makeRenderer(canvas)` is the WebGLRenderer (a
 * test passes its own), `reducedMotion()` is asked every frame, and `now()`
 * gives seconds. Returns the controller main.js drives:
 *
 *   scene, camera, renderer
 *   setAvatar(avatar)   the figure rebuilt in this avatar
 *   setFrame(name)      'body', 'face' or 'feet', eased
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

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(S.color);
    const white = new THREE.MeshStandardMaterial({ color: S.color, roughness: 0.95, metalness: 0 });
    scene.add(buildCove(S.cove, white));
    scene.add(buildContact(S.plinth.radius, S.contact));
    for (const light of buildLights(config.light, mobile)) scene.add(light);

    const turntable = new THREE.Group();
    turntable.name = 'turntable';
    turntable.add(buildPlinth(S.plinth));
    scene.add(turntable);
    const standY = S.plinth.height;

    const camera = new THREE.PerspectiveCamera(C.fov, 1, 0.05, 60);

    let figure = null;
    let frameName = 'body';
    let from = null;            // the camera's pose when the ease began
    let easing = 1;             // 0 to 1 through the camera's ease
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
        // A new shape: straight to the framing, no ease.
        pose = frameFor(C.frames[frameName], w / h, C.fov, standY);
        from = null;
        easing = 1;
        dirty = true;
        return true;
    }

    function place() {
        const goal = frameFor(C.frames[frameName], aspect(), C.fov, standY);
        if (from && easing < 1) {
            const k = smoothstep(easing);
            pose = { eye: mix3(from.eye, goal.eye, k), aim: mix3(from.aim, goal.aim, k) };
        } else {
            pose = goal;
        }
        camera.position.set(pose.eye[0], pose.eye[1], pose.eye[2]);
        camera.lookAt(pose.aim[0], pose.aim[1], pose.aim[2]);
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
        // The camera's ease.
        if (easing < 1) {
            easing = still ? 1 : Math.min(1, easing + dt / C.ease);
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
        } else if (spinning && !dragging && !still && frameName === 'body') {
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

    const onDown = (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        dragging = { id: e.pointerId, x: e.clientX };
        target = null;
        api.touch();
        if (canvas.setPointerCapture && e.pointerId !== undefined) canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e) => {
        if (!dragging || e.pointerId !== dragging.id) return;
        const dx = e.clientX - dragging.x;
        dragging.x = e.clientX;
        turntable.rotation.y += dx * T.drag;
        lastTouch = now();
        dirty = true;
    };
    const onUp = (e) => {
        if (!dragging || e.pointerId !== dragging.id) return;
        dragging = null;
        if (canvas.releasePointerCapture && e.pointerId !== undefined) canvas.releasePointerCapture(e.pointerId);
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);

    const api = {
        scene,
        camera,
        renderer,
        turntable,
        get figure() {
            return figure;
        },
        /** The framing the camera is in, or easing to. */
        get framing() {
            return frameName;
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
        setFrame(name) {
            if (!C.frames[name] || name === frameName) return;
            from = pose ? { eye: pose.eye.slice(), aim: pose.aim.slice() } : null;
            frameName = name;
            easing = from ? 0 : 1;
            if (name !== 'body') api.faceFront();
            api.touch();
            dirty = true;
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
            if (figure) figure.dispose();
            if (renderer.dispose) renderer.dispose();
        }
    };
    place();
    return api;
}

export { GESTURES };
