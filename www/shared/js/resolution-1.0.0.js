// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * resolution-1.0.0.js - adaptive resolution: render below the device's own
 * pixel ratio for as long as the frames say the scene is too heavy for it, and
 * climb back when they say it is not.
 *
 * FOR A SCENE WHOSE COST IS FILL RATE. The camera does not move and the CPU
 * side is flat, but what fills the frame changes over the story (High Water's
 * tsunami covers all of it from t=78; Tornado Alley's funnel stacks its layers
 * in a fifth of a portrait phone), so the only lever that scales with the
 * problem is how many pixels are drawn. A phone that keeps up is never touched.
 *
 * PROMOTED FROM www/highwater ON 2026-09-24, for Tornado Alley's performance
 * pass (its PRD section 8 asked for High Water's). The defaults are High
 * Water's numbers, and High Water runs on this part, proved step for step
 * identical to the copy it had.
 *
 * THE POLICY IS PURE (`nextPixelScale`), so it can be tested without a GPU:
 * the thing it protects against is the one part of such a scene that cannot
 * be measured outside a browser. `createResolution` is the wiring: it keeps
 * the running estimate and calls the renderer only when a decision changes.
 */

/** High Water's QA'd numbers. Override any with `options.quality`. */
export const RESOLUTION_DEFAULTS = Object.freeze({
    // The floor, as a share of the device's ratio.
    minScale: 0.60,
    // Slow if a frame takes this much longer than the best one seen.
    slowRatio: 1.30,
    // Fast enough to try for more only when there is real headroom. Close to
    // 1 because a vsynced display reports its interval no matter how much
    // room is left, so the only way to find the ceiling is to reach for it
    // and come back down if it does not hold.
    fastRatio: 1.08,
    // The backstop, in seconds, for a device that was never fast even once.
    slowSeconds: 1 / 25,
    stepDown: 0.85,
    // Smaller than the step down, deliberately. Getting it wrong downward costs
    // a little sharpness and getting it wrong upward costs the frame rate at
    // the climax, so the two are not symmetrical.
    stepUp: 1.06,
    // CHANGING THE RATIO REALLOCATES THE DRAWING BUFFER, which is itself a
    // dropped frame, so this cannot be a per-frame decision. Longer before
    // reaching back up than before backing off.
    holdDownSeconds: 1.0,
    holdUpSeconds: 3.0,
    // Ignore the opening frames: shader compilation and first uploads land
    // there and neither says anything about the device.
    settleFrames: 60,
    // A frame longer than this is a tab coming back or the machine sleeping,
    // not a slow frame, and must not drag the measurement down with it.
    ignoreAboveSeconds: 0.10,
    // How quickly the running estimate follows. Slow enough that one heavy
    // frame every so often cannot move it on its own.
    smoothing: 0.05
});

/**
 * How far below the device's own pixel ratio to render, given how the last few
 * seconds went. Returns the scale unchanged when nothing should happen, so the
 * caller can compare and only pay for a resize when there is a real decision.
 *
 * MEASURED AGAINST THE DISPLAY, NOT AGAINST 60. A fixed millisecond budget
 * calls a 30 Hz panel permanently slow and never notices a 120 Hz one
 * struggling, so the yardstick is the best frame this device has managed.
 * `slowSeconds` sits underneath as a backstop for a device that was never fast
 * even once, which is the case the relative test cannot see by construction.
 *
 * sample: { frame, best, scale, since, frames } (seconds, except scale and
 * frames).
 */
export function nextPixelScale(sample, quality = RESOLUTION_DEFAULTS) {
    const q = quality;
    const { frame, best, scale, since, frames } = sample;
    if (frames < q.settleFrames) return scale;

    const slow = frame > best * q.slowRatio || frame > q.slowSeconds;
    if (slow) {
        if (since < q.holdDownSeconds) return scale;
        return Math.max(q.minScale, scale * q.stepDown);
    }
    // Only reach upward from below, and only with real headroom under us.
    if (scale < 1 && frame < best * q.fastRatio && since >= q.holdUpSeconds) {
        return Math.min(1, scale * q.stepUp);
    }
    return scale;
}

/**
 * The wiring. Nothing touches the renderer until `apply()`.
 *
 * options:
 *   renderer   the WebGLRenderer
 *   ceiling()  the device's own ratio as this scene caps it (for example
 *              min(devicePixelRatio, 2)), asked again on every resize, since
 *              it changes when a laptop moves to another monitor
 *   size()     [width, height] in CSS pixels; the window by default
 *   quality    overrides for RESOLUTION_DEFAULTS
 */
export function createResolution({ renderer, ceiling, size, quality } = {}) {
    const q = { ...RESOLUTION_DEFAULTS, ...(quality || {}) };
    const sizeOf = size || (() => [window.innerWidth, window.innerHeight]);
    const ceilingOf = ceiling || (() => (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    const s = {
        ceiling: 1,
        scale: 1,
        frame: 0,           // smoothed seconds per frame
        best: Infinity,     // the fastest seen, which estimates the display
        since: 0,           // seconds since the ratio last changed
        frames: 0,
        // Held at full resolution for a screenshot, and left alone by
        // `sample` while it is set. Off for every real visitor.
        pinned: false
    };

    function draw(ratio) {
        if (!renderer) return;
        const [w, h] = sizeOf();
        renderer.setPixelRatio(ratio);
        renderer.setSize(w, h, false);
    }

    /** Size the renderer at the current ceiling and scale: at boot, and on
     *  every resize. The scale settled on is kept across a resize: it
     *  describes how hard the scene is, not how many pixels the screen has. */
    function apply() {
        s.ceiling = ceilingOf();
        draw(s.ceiling * s.scale);
    }

    /** Fold one frame's delta (seconds) into the estimate, and act on it if it
     *  says so. Call once per drawn frame. */
    function sample(delta) {
        if (!renderer || delta <= 0 || delta > q.ignoreAboveSeconds) return;
        if (s.pinned) return;
        s.frame = s.frame === 0 ? delta : s.frame + (delta - s.frame) * q.smoothing;
        s.since += delta;
        s.frames += 1;
        // The best frame is read from the SMOOTHED value rather than from a
        // single frame, or one lucky frame early on would set an unreachable
        // target and the scene would spend the visit trying to live up to it.
        if (s.frames >= q.settleFrames && s.frame < s.best) s.best = s.frame;

        const next = nextPixelScale(s, q);
        if (Math.abs(next - s.scale) < 0.005) return;
        s.scale = next;
        s.since = 0;
        draw(s.ceiling * s.scale);
    }

    /** CAPTURE MODE, for a social card: full resolution now, and held there.
     *  Recovering from the floor takes half a minute of good frames, and the
     *  frame worth photographing is usually the heaviest one. */
    function pin(on = true) {
        s.pinned = !!on;
        if (s.pinned) {
            s.scale = 1;
            s.since = 0;
            draw(s.ceiling);
        }
        return { pinned: s.pinned, ratio: s.ceiling * s.scale };
    }

    /** What it has settled on, for a QA console. */
    function readout() {
        return {
            ratio: s.ceiling * s.scale,
            ceiling: s.ceiling,
            scale: Number(s.scale.toFixed(3)),
            frameMs: Number((s.frame * 1000).toFixed(2)),
            bestMs: Number((s.best * 1000).toFixed(2))
        };
    }

    return { apply, sample, pin, readout, state: () => ({ ...s }) };
}
