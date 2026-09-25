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

/**
 * A station's vertical fov for a screen of this aspect. A narrower screen
 * than the reference widens it, so the station keeps its width. With
 * `holdWidth`, a WIDER screen narrows it too, so an ultra-wide screen sees
 * the same width rather than far out to the sides (the window: at 21:9 its
 * sides were the room's walls, 41% of the frame, measured 2026-09-24).
 */
export function fovFor(baseFov, aspect, refAspect, maxFov, holdWidth = false) {
    if (!(aspect > 0) || (aspect >= refAspect && !holdWidth) || aspect === refAspect) return baseFov;
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
    // A station may cap its own widening: the window is a view, and on a
    // phone a narrower view of the bay beats a wide view of the room.
    const fov = fovFor(s.fov, aspect, config.view.refAspect, s.maxFov || config.view.maxFov, Boolean(s.holdWidth));
    return { eye, aim: s.holdTop && fov < s.fov ? liftAim(eye, s.aim, (s.fov - fov) / 2) : [...s.aim], fov };
}

/**
 * The aim `degrees` higher, seen from `eye`: the same bearing and the same
 * distance, tilted up. A station that keeps its width on a wide screen
 * (holdWidth) narrows its fov there, which drops its top edge: `holdTop`
 * tilts it up by half what it narrowed, so the top edge stays where it is
 * at the reference aspect and the wide screen gives up a little of the
 * bottom instead (QA, 2026-09-25: from the window on 21:9, the taller
 * mountains had left no sky at all).
 */
export function liftAim(eye, aim, degrees) {
    const d = aim.map((v, i) => v - eye[i]);
    const flat = Math.hypot(d[0], d[2]);
    const length = Math.hypot(flat, d[1]);
    const pitch = Math.atan2(d[1], flat) + (degrees * Math.PI) / 180;
    const across = length * Math.cos(pitch);
    return [eye[0] + (d[0] / flat) * across, eye[1] + length * Math.sin(pitch), eye[2] + (d[2] / flat) * across];
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
