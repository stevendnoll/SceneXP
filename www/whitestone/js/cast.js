// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * cast.js - Maya, Whitestone's host, as a figure on the stage (PLANNING 6.4,
 * ONBOARDING section 9).
 *
 * WHO: a Hispanic woman, she and her, in a white Whitestone polo with the
 * slate-blue mark on its chest, charcoal trousers, dark hair to the
 * shoulders. Built from the shared people part, as Auto Man's figures are,
 * at a person's height beside the turntable, turned three quarters to the
 * visitor. She stands on the cove's floor, not on the turntable, so she
 * stays where she is when the house turns. Every color is in
 * CONFIG.cast.maya.
 *
 * WHAT SHE DOES: a wave as she says hello, an arm toward the house as each
 * step of the guide begins, and a small sway while she is speaking. Still
 * otherwise, so a quiet page draws no frames, and still throughout under
 * reduced motion. A tap on her asks her to say it again (main.js).
 *
 * THE RIG'S LIMITS SHAPE THE POSES. The shared arm swings at the shoulder
 * about two axes and bends at the elbow about one, so an arm pointing out
 * to the side stays nearly straight and a wave is the whole raised arm
 * swinging, not a bent elbow. `poseFor` is the arithmetic, pure, and the
 * tests measure where her hands land against the real three.js.
 */

import { createPerson } from '../../shared/js/people-1.0.0.min.js';
import { smoothstep } from './turntable.min.js';

/** The shared rig's resting arm (people-1.0.0): splayed a little, a touch
 *  forward, the elbow straight. */
export const REST = Object.freeze({ z: 0.15, x: 0.1, fore: 0 });

/** How long each gesture lasts, seconds. */
export const GESTURES = Object.freeze({ wave: 2.2, point: 1.9 });

/**
 * Each arm's angles `t` seconds into a gesture: `{ near, far }`, the near
 * arm being the one on the house's side. `z` is the swing out from the
 * side (radians, before the side's sign), `x` the swing forward (negative
 * is forward), `fore` the elbow's bend. The arms rise, hold, and come down
 * eased, so a gesture never snaps.
 *
 *   wave   the near arm raised high and swinging side to side: the one on
 *          the house's side, clear of her bubble (QA, 2026-10-15: the far
 *          arm waved behind it)
 *   point  the near arm out and forward, toward the house, the elbow a
 *          little bent
 */
export function poseFor(gesture, t) {
    const rest = { near: { ...REST }, far: { ...REST } };
    const total = GESTURES[gesture];
    if (!total || !(t >= 0) || t >= total) return rest;
    // Up over the first 0.35 s, down over the last 0.45 s.
    const up = smoothstep(t / 0.35);
    const down = 1 - smoothstep((t - (total - 0.45)) / 0.45);
    const k = Math.min(up, down);
    const mix = (a, b) => a + (b - a) * k;
    if (gesture === 'wave') {
        const swing = 0.22 * Math.sin(t * Math.PI * 2 * 1.6) * k;
        return { near: { z: mix(REST.z, 2.55) + swing, x: mix(REST.x, -0.12), fore: mix(0, -0.12) }, far: rest.far };
    }
    return { near: { z: mix(REST.z, 1.0), x: mix(REST.x, -0.62), fore: mix(0, -0.22) }, far: rest.far };
}

/**
 * How long Maya takes to say a line, seconds: about as long as reading it
 * aloud, within limits. She sways that long and then stands still, so a
 * page left open is not drawn forever.
 */
export function speakSeconds(text) {
    return Math.min(9, Math.max(2, 1.2 + String(text || '').length * 0.055));
}

/** The small sway while she speaks: a turn of a few hundredths of a
 *  radian about her own axis. */
export function swayAt(t) {
    return 0.035 * Math.sin(t * 0.9) + 0.012 * Math.sin(t * 2.3);
}

/**
 * Build Maya. Returns the controller main.js drives:
 *
 *   group              add it to the scene
 *   gesture(name)      'wave' or 'point', from the start
 *   speaking(seconds)  sway for about that long (0 stops at once)
 *   tick(dt, opts)     move on by dt seconds ({ reducedMotion }); returns
 *                      whether anything moved
 *   head()             her head's middle, in world meters
 *   anchor()           a point beside her head, where her bubble begins
 *   portrait(renderer, scene, size)  her face, drawn once into a canvas
 *   setShown(on)       in or out of the frame (out on an upright phone)
 */
export function buildMaya(config) {
    const m = config.cast.maya;
    const color = (hex) => parseInt(hex.slice(1), 16);
    const person = createPerson({
        role: 'customer',
        x: 0,
        z: 0,
        skinTone: color(m.skin),
        hairColor: color(m.hair),
        eyeColor: color(m.eyes),
        shirtColor: color(m.shirt),
        pantsColor: color(m.pants),
        hairStyle: 'long',
        shoulderRound: 0.45,
        // A woman's build (Steve, 2026-10-14: "her hips and legs ... look
        // more like a man's"): the rig's rounded hips and fuller thighs.
        hips: m.hips ?? 0
    });
    // The Whitestone mark on the polo's chest, over her heart.
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.032, 0.008), new THREE.MeshStandardMaterial({ color: m.accent, roughness: 0.6 }));
    mark.position.set(0.085, 1.17, 0.115);
    person.add(mark);
    person.traverse((o) => {
        if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
        }
    });

    const group = new THREE.Group();
    group.name = 'maya';
    group.userData.pick = 'host';
    group.position.set(m.x, 0, m.z);
    group.rotation.y = m.facing;
    group.add(person);

    // Her arms, by the rig's own tags. The near arm is the one on the
    // house's side: her right, at -x before she turns.
    const arms = {};
    person.traverse((o) => {
        if (o.userData && o.userData.isArm) arms[o.userData.armSide < 0 ? 'near' : 'far'] = o;
    });
    const side = { near: -1, far: 1 };

    let gesture = null;
    let elapsed = 0;
    let talking = 0;
    let clock = 0;
    let swaying = 0;

    function apply(pose) {
        for (const key of ['near', 'far']) {
            const arm = arms[key];
            if (!arm) continue;
            arm.rotation.z = side[key] * pose[key].z;
            arm.rotation.x = pose[key].x;
            const fore = arm.userData.forearm;
            if (fore) fore.rotation.x = pose[key].fore;
        }
    }
    apply(poseFor(null, 0));

    const api = {
        group,
        get gesturing() {
            return gesture;
        },
        gesture(name) {
            if (!GESTURES[name]) return false;
            gesture = name;
            elapsed = 0;
            return true;
        },
        speaking(seconds) {
            talking = Math.max(0, Number(seconds) || 0);
        },
        get talking() {
            return talking;
        },
        tick(dt, { reducedMotion = false } = {}) {
            const t = Math.max(0, dt);
            let moved = false;
            if (gesture) {
                if (reducedMotion) {
                    gesture = null;
                    apply(poseFor(null, 0));
                } else {
                    elapsed += t;
                    apply(poseFor(gesture, elapsed));
                    if (elapsed >= GESTURES[gesture]) gesture = null;
                }
                moved = true;
            }
            // The sway eases in while she speaks and out when she stops.
            if (talking > 0) talking = Math.max(0, talking - t);
            const target = talking > 0 && !reducedMotion ? 1 : 0;
            if (swaying !== target) {
                swaying = target > swaying ? Math.min(1, swaying + t * 2) : Math.max(0, swaying - t * 2);
                moved = true;
            }
            if (swaying > 0) {
                clock += t;
                group.rotation.y = m.facing + swayAt(clock) * swaying;
                moved = true;
            } else if (moved) {
                group.rotation.y = m.facing;
            }
            return moved;
        },
        head() {
            return [m.x, m.height - 0.165, m.z];
        },
        anchor() {
            return [m.x + 0.22, m.height - 0.05, m.z];
        },
        setShown(on) {
            group.visible = Boolean(on);
        },
        /**
         * Her face in a small canvas, for the bubble's portrait: the stage
         * drawn once from in front of her head into a render target, read
         * back, and painted upright. Null where the browser will not.
         */
        portrait(renderer, scene, size = 96) {
            try {
                const target = new THREE.WebGLRenderTarget(size, size);
                if (target.texture && THREE.SRGBColorSpace) target.texture.colorSpace = THREE.SRGBColorSpace;
                const cam = new THREE.PerspectiveCamera(24, 1, 0.05, 20);
                const [hx, hy, hz] = api.head();
                cam.position.set(hx + Math.sin(m.facing) * 0.7, hy + 0.02, hz + Math.cos(m.facing) * 0.7);
                cam.lookAt(hx, hy, hz);
                const shown = group.visible;
                group.visible = true;
                renderer.setRenderTarget(target);
                renderer.render(scene, cam);
                const pixels = new Uint8Array(size * size * 4);
                renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
                renderer.setRenderTarget(null);
                group.visible = shown;
                if (target.dispose) target.dispose();
                const canvas = document.createElement('canvas');
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext && canvas.getContext('2d');
                if (!ctx || !ctx.createImageData) return null;
                const image = ctx.createImageData(size, size);
                // Rows come back bottom first.
                for (let y = 0; y < size; y++) {
                    image.data.set(pixels.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
                }
                ctx.putImageData(image, 0, 0);
                return canvas;
            } catch (e) {
                return null;
            }
        }
    };
    return api;
}
