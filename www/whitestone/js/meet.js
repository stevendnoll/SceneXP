// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * meet.js - Meet Maya (QA, 2026-10-16): a tap on her portrait in the bubble
 * opens a card with her whole figure, facing the visitor, who waves now and
 * then. On a phone the studio keeps the house in frame and she is never
 * seen, so this is where a phone visitor meets her. Desktop gets it too, a
 * small surprise for whoever taps her face.
 *
 * HER OWN STAGE. The card draws with its own small renderer on its own
 * canvas: the studio's white cove and daylight (stage.js), and a second
 * Maya built the same way as the first (cast.js), so the two cannot drift
 * apart. The camera stands in front of her, so she looks straight out of
 * the card without being turned.
 *
 * QUIET WHEN STILL. Frames are drawn only while she waves or the card
 * changes size. Under reduced motion she never waves and is drawn once. A
 * browser that will not give the card a second WebGL canvas gets the card
 * without her figure (`open` returns false).
 *
 * `meetPose` is the arithmetic, pure.
 */

import { buildMaya, GESTURES } from './cast.min.js';
import { buildCove, buildLights } from './stage.min.js';

/**
 * The camera for her whole figure: `{ eye, aim, fov, aspect }`, from in
 * front of her (`m` is CONFIG.cast.maya, `P` CONFIG.meet), `fov` vertical in
 * degrees. Tall enough for her raised hand and her feet, wide enough for an
 * arm out, whichever needs more.
 */
export function meetPose(m, aspect, P) {
    const a = aspect > 0 ? aspect : 0.75;
    const top = m.height + P.reach;
    const tall = Math.max(top, (2 * P.half) / a) * P.margin;
    const distance = tall / 2 / Math.tan((P.fov * Math.PI) / 360);
    const mid = top / 2;
    const aim = [m.x, mid, m.z];
    const eye = [m.x + Math.sin(m.facing) * distance, mid + P.lift, m.z + Math.cos(m.facing) * distance];
    return { eye, aim, fov: P.fov, aspect: a };
}

/**
 * Drive the card's figure on `canvas`. `makeRenderer(canvas)` is the
 * WebGLRenderer to draw with (a test passes its own). Returns
 * { open, close, shown, dispose }.
 */
export function createMeet(config, {
    canvas,
    mobile = false,
    reducedMotion = () => false,
    makeRenderer = (c) => new THREE.WebGLRenderer({ canvas: c, antialias: true, powerPreference: 'low-power' })
} = {}) {
    const m = config.cast.maya;
    const P = config.meet;
    let renderer = null;
    let scene = null;
    let camera = null;
    let maya = null;
    let failed = false;
    let shown = false;
    let dirty = false;
    let last = 0;
    let untilWave = 0;
    let size = '';

    function build() {
        if (renderer || failed) return Boolean(renderer);
        try {
            renderer = makeRenderer(canvas);
        } catch (e) {
            failed = true;
            return false;
        }
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = config.light.exposure;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFShadowMap;
        scene = new THREE.Scene();
        scene.background = new THREE.Color(config.stage.cove.color);
        scene.add(buildCove(config.stage.cove, new THREE.MeshStandardMaterial({ color: config.stage.cove.color, roughness: 0.95, metalness: 0 })));
        for (const light of buildLights(config, mobile).lights) scene.add(light);
        maya = buildMaya(config);
        scene.add(maya.group);
        camera = new THREE.PerspectiveCamera(P.fov, 0.75, 0.1, 40);
        return true;
    }

    /** The drawing buffer the size the card shows the canvas at, and the
     *  camera fitted to it. Measured every frame, since the card may have
     *  been hidden when it was first asked (a canvas sized while hidden
     *  reads 0 and is stretched blurry). */
    function fit() {
        const w = canvas.clientWidth || 0;
        const h = canvas.clientHeight || 0;
        if (!w || !h) return false;
        const ratio = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, mobile ? config.quality.maxPixelRatioMobile : config.quality.maxPixelRatio);
        const key = `${w}x${h}@${ratio}`;
        if (key === size) return true;
        size = key;
        renderer.setPixelRatio(ratio);
        renderer.setSize(w, h, false);
        const pose = meetPose(m, w / h, P);
        camera.fov = pose.fov;
        camera.aspect = pose.aspect;
        camera.position.set(pose.eye[0], pose.eye[1], pose.eye[2]);
        camera.lookAt(pose.aim[0], pose.aim[1], pose.aim[2]);
        camera.updateProjectionMatrix();
        dirty = true;
        return true;
    }

    function frame() {
        if (!shown) return;
        const t = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const dt = last ? Math.min((t - last) / 1000, config.quality.maxFrameSeconds) : 0;
        last = t;
        if (!fit()) return;
        const still = reducedMotion();
        if (!still) {
            untilWave -= dt;
            if (untilWave <= 0) {
                maya.gesture('wave');
                untilWave = GESTURES.wave + P.every;
            }
        }
        if (maya.tick(dt, { reducedMotion: still })) dirty = true;
        if (!dirty) return;
        dirty = false;
        renderer.render(scene, camera);
    }

    return {
        /** The card's figure, drawing from now on. False when there is none
         *  to draw (no second WebGL canvas). */
        open() {
            if (!canvas || !build()) return false;
            shown = true;
            last = 0;
            untilWave = P.first;
            dirty = true;
            renderer.setAnimationLoop(frame);
            return true;
        },
        /** Put away: no more frames, her arm at rest for next time. */
        close() {
            shown = false;
            if (renderer) renderer.setAnimationLoop(null);
            if (maya) maya.tick(GESTURES.wave, { reducedMotion: true });
        },
        get shown() {
            return shown;
        },
        /** For the page's own teardown: the canvas's WebGL let go. */
        dispose() {
            shown = false;
            if (!renderer) return;
            renderer.setAnimationLoop(null);
            if (renderer.dispose) renderer.dispose();
            renderer = null;
        }
    };
}
