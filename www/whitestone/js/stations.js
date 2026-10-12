// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * stations.js - Where the camera stands, and how it moves between stations
 * (PLANNING 6.1). Corner Office's stations.js, adapted.
 *
 * THE STUDIO IS NEVER WALKED. The camera stands at one station at a time
 * (the overview, the model, the menu, the plan board, the printer, the desk)
 * and glides between them, slowly and eased, so a screen share follows it.
 * A station is an eye, a point it looks at, and a vertical field of view,
 * all in CONFIG.stations.
 *
 * A PHONE KEEPS THE STATION'S WIDTH. `fov` is vertical, so a portrait screen
 * at the same fov would see a narrow slice of the plinth. `fovFor` widens it
 * until the horizontal field matches the reference aspect, up to
 * `view.maxFov`, and a station with `retreat` also steps back along its line
 * of sight, so a wide subject still fits on an upright phone.
 *
 * Pure: plain arrays in, plain arrays out. main.js applies a pose to the
 * camera, and the tests check a glide without three.
 */

/** The station a visitor arrives at, and the one an unknown key falls back to. */
export const HOME_STATION = 'overview';

/**
 * A station's vertical fov for a screen of this aspect. A narrower screen
 * than the reference widens it, so the station keeps its width. A wider one
 * keeps the fov, and sees a little more to the sides.
 */
export function fovFor(baseFov, aspect, refAspect, maxFov) {
    if (!(aspect > 0) || aspect >= refAspect) return baseFov;
    const half = (baseFov * Math.PI) / 360;
    const widened = (360 / Math.PI) * Math.atan(Math.tan(half) * (refAspect / aspect));
    return Math.min(maxFov, widened);
}

/**
 * The pose for a station on a screen of this aspect: `{ eye, aim, fov }`.
 * On a narrower screen than the reference, a station with `retreat` steps
 * its eye back along its line of sight, by up to that many meters at
 * `view.narrowAspect` (an upright phone).
 */
export function poseFor(key, aspect, config) {
    const s = config.stations[key] || config.stations[HOME_STATION];
    const eye = [...s.eye];
    if (s.retreat && aspect > 0 && aspect < config.view.refAspect) {
        const narrow = config.view.narrowAspect || 0.45;
        const t = Math.min(1, (config.view.refAspect - aspect) / (config.view.refAspect - narrow));
        const d = s.eye.map((v, i) => v - s.aim[i]);
        const len = Math.hypot(...d) || 1;
        for (let i = 0; i < 3; i++) eye[i] += (d[i] / len) * s.retreat * t;
    }
    return { eye, aim: [...s.aim], fov: fovFor(s.fov, aspect, config.view.refAspect, config.view.maxFov) };
}

/**
 * A field of view (degrees) zoomed by `zoom` doublings of magnification:
 * narrowed in tan space, so the view grows as a lens's does, and never
 * wider than `widest`.
 */
export function zoomedFov(fov, zoom, widest) {
    const f = (360 / Math.PI) * Math.atan(Math.tan((fov * Math.PI) / 360) / Math.pow(2, zoom));
    return Math.min(widest, f);
}

/** Ease in and out, so a glide starts and lands gently. */
export function smoothstep(t) {
    const x = Math.min(1, Math.max(0, t));
    return x * x * (3 - 2 * x);
}

const lerp = (a, b, t) => a + (b - a) * t;

/** The pose `t` of the way from `a` to `b` (t already eased). */
export function blendPose(a, b, t) {
    return {
        eye: a.eye.map((v, i) => lerp(v, b.eye[i], t)),
        aim: a.aim.map((v, i) => lerp(v, b.aim[i], t)),
        fov: lerp(a.fov, b.fov, t)
    };
}

/**
 * A glide in progress: from a pose, to a station's pose, over `seconds`.
 * `step` advances it and returns the pose to show, and `done` says when it
 * has landed. A glide of zero seconds (reduced motion) is a cut: it lands on
 * its first step.
 */
export function createGlide(from, to, seconds) {
    let elapsed = 0;
    return {
        to,
        step(delta) {
            elapsed += Math.max(0, delta);
            const t = seconds > 0 ? smoothstep(elapsed / seconds) : 1;
            return blendPose(from, to, t);
        },
        get done() {
            return seconds <= 0 || elapsed >= seconds;
        }
    };
}
