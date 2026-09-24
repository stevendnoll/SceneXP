// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * stations.js - Where the camera stands, and how it moves between stations.
 *
 * THE OFFICE IS NEVER WALKED. The camera stands at one station at a time
 * (the desk, the computer, and more as the furniture arrives) and glides
 * between them. A station is an eye, a point it looks at, and a field of
 * view, all in config.stations.
 *
 * A PHONE KEEPS THE DESK'S WIDTH. `fov` is vertical, so a portrait screen at
 * the same fov would see a narrow slice of the desk. `fovFor` widens it until
 * the horizontal field matches the reference aspect, up to `view.maxFov`,
 * which is the same trade every composed view on the site makes.
 *
 * Pure: plain arrays in, plain arrays out. main.js applies a pose to the
 * camera, and tests can check a glide without three.
 */

/** A station's vertical fov for a screen of this aspect. */
export function fovFor(baseFov, aspect, refAspect, maxFov) {
    if (!(aspect > 0) || aspect >= refAspect) return baseFov;
    const half = (baseFov * Math.PI) / 360;
    const widened = (360 / Math.PI) * Math.atan(Math.tan(half) * (refAspect / aspect));
    return Math.min(maxFov, widened);
}

/**
 * The pose for a station on a screen of this aspect: `{ eye, aim, fov }`.
 *
 * A WIDE STATION BACKS OFF ON A PHONE. The fov can only widen so far, so a
 * station whose subject is wide (the whole filing cabinet) carries a
 * `retreat`: on a narrower screen than the reference the eye steps back
 * along its line of sight, by up to that many meters on an upright phone.
 */
export function poseFor(key, aspect, config) {
    const s = config.stations[key] || config.stations.desk;
    const eye = [...s.eye];
    if (s.retreat && aspect > 0 && aspect < config.view.refAspect) {
        const narrow = config.view.narrowAspect || 0.45;
        const t = Math.min(1, (config.view.refAspect - aspect) / (config.view.refAspect - narrow));
        const d = s.eye.map((v, i) => v - s.aim[i]);
        const len = Math.hypot(...d) || 1;
        for (let i = 0; i < 3; i++) eye[i] += (d[i] / len) * s.retreat * t;
    }
    return {
        eye,
        aim: [...s.aim],
        fov: fovFor(s.fov, aspect, config.view.refAspect, config.view.maxFov)
    };
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
 * A glide in progress: from a pose, to a station, over `seconds`. `step`
 * advances it and returns the pose to show, and `done` says when it has
 * landed. A glide of zero seconds (reduced motion) lands on its first step.
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
