// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * camera.js - The director. One camera, three drivers, and only one driving.
 *
 * PURE, AND THAT IS THE POINT (PLANNING section 5). Every driver is a function
 * of time and state returning a position and a target in world metres. Nothing
 * here imports THREE or touches a scene graph, so the interesting question,
 * where should the camera be at t = 1.4s of this replay, is answerable with
 * plain numbers. Camera work gets tweaked for months, so it should be the
 * testable kind.
 *
 * THE PLAY DRIVER NEVER BECOMES CINEMATIC (D5). In 2D the visitor sees the
 * whole field, and that is exactly what makes choosing a play meaningful. A
 * ground-level camera during a live play would hide the information the game
 * is about. If a future change wants drama while the ball is live, it belongs
 * in the replay driver.
 *
 * THE REPLAY DRIVER IS WHERE THE THIRD DIMENSION EARNS ITS PLACE. It is the
 * budget freed by not porting cutscenes.class.tsx, and it is the one thing the
 * 2D game fundamentally cannot do: watch the play that just happened, from
 * somewhere you were not standing while it happened.
 */
import { EXESNOHS_CONFIG as CFG, FIELD } from './config.min.js';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
/** Ease in and out, so a camera never starts or stops with a jerk. */
const smooth = (t) => { const c = clamp01(t); return c * c * (3 - 2 * c); };

/**
 * How far back the camera must sit for the whole field WIDTH to be visible.
 *
 * THE HARD CASE IS A PHONE HELD UPRIGHT, and it is hard because `fov` is
 * VERTICAL. A tall thin frame converts very little of it into the horizontal
 * angle that decides whether both sidelines fit. Measured at the fixed camera:
 * desktop saw 34.2m either side of the middle and portrait saw 10.7m, against
 * the 16m the field needs. Portrait was cutting five metres off each sideline,
 * which on a passing play is where the receivers are.
 *
 * So the framing is solved from the aspect rather than fixed. Portrait widens
 * the field of view and then pulls back until the width fits. Landscape never
 * needs to move, because `back` is a floor: on any wide screen the solve comes
 * out under the configured distance and the configured distance wins.
 *
 * Pure, so the answer is checkable with numbers rather than by squinting at a
 * phone.
 */
export function framingFor(aspect) {
    const p = CFG.camera.play;
    const fov = aspect < 1 ? CFG.camera.portraitFov : CFG.camera.fov;
    const hHalf = Math.atan(Math.tan((fov * Math.PI) / 360) * aspect);
    const need = FIELD.width / 2 + CFG.camera.sideMargin;

    // Slant distance from the camera to the line of scrimmage at which `need`
    // metres are visible either side of the middle.
    const slant = need / Math.tan(hHalf);
    const ground = Math.sqrt(Math.max(0, slant * slant - p.height * p.height));
    return { fov, back: Math.max(p.back, ground) };
}

/**
 * The play camera. High, raked, and completely still.
 *
 * Stillness is a feature: a camera that drifts while somebody is reading a
 * route concept is a camera that is competing with the game.
 */
export function playDriver(aspect = 1.78) {
    const p = CFG.camera.play;
    const snapX = FIELD.lineInterval;
    const { fov, back } = framingFor(aspect);
    return {
        position: { x: snapX - back, y: p.height, z: 0 },
        target: { x: snapX + p.lookAhead, y: 0, z: 0 },
        fov,
    };
}

/**
 * The idle camera, behind the playbook.
 *
 * A slow drift, because a still frame behind a menu looks like a paused game
 * and a moving one looks like a place.
 *
 * IT IS A DOLLY, NOT AN ORBIT, and the difference is the whole reason this
 * comment exists. The first version swung the camera fourteen metres sideways
 * while its aim point moved three and a half, which rotates the view around
 * the field and reads as the ground spinning. Moving the target almost as far
 * as the camera keeps the shot pointing the same way while it slides, which is
 * a drift rather than a turn. The amplitude came down as well: behind a full
 * screen overlay there is very little to see, so there is very little to gain.
 */
export function idleDriver(t, aspect = 1.78) {
    const p = CFG.camera.play;
    const snapX = FIELD.lineInterval;
    const { fov, back } = framingFor(aspect);
    const swing = Math.sin(t * 0.1) * 8;
    return {
        position: { x: snapX - back - 4, y: p.height + 3, z: swing },
        target: { x: snapX + p.lookAhead, y: 0, z: swing * 0.85 },
        fov,
    };
}

/**
 * The replay camera.
 *
 * Three beats, because a replay that just tracks the ball is a security
 * recording rather than a highlight:
 *
 *   1. ESTABLISH. Low and behind the line of scrimmage, so the first thing the
 *      viewer sees is the formation from a height they have not had all game.
 *   2. TRACK. Swing round behind whoever has the ball and follow, staying low.
 *      This is where the 3D is doing work the 2D game could not.
 *   3. SETTLE. Ease in on where it ended, and hold, so the last frame is a
 *      composition rather than wherever the tracking happened to stop.
 *
 * `focus` is the ball or its carrier in world metres, `progress` runs 0 to 1
 * across the recording. A narrower field of view than the play camera, because
 * this one is allowed to be about one thing.
 */
export function replayDriver(progress, focus, opts = {}) {
    const r = CFG.camera.replay;
    const t = clamp01(progress);
    const snapX = FIELD.lineInterval;

    // Where the camera sits relative to what it is watching: behind and a
    // little to one side, so the run reads across the frame rather than
    // straight up it.
    const behind = lerp(r.establishBack, r.trackBack, smooth(t / r.establishFor));
    const height = lerp(r.establishHeight, r.trackHeight, smooth(t / r.establishFor));

    // A slow orbit so the shot is never a flat chase. Half a swing across the
    // whole replay, which reads as movement without ever losing the subject.
    const side = Math.sin(t * Math.PI) * r.swing;

    // The settle: on the last stretch, ease the camera in and slow the orbit.
    const settle = smooth(clamp01((t - r.settleFrom) / (1 - r.settleFrom)));
    const close = lerp(1, r.settleCloseness, settle);

    const anchorX = lerp(snapX, focus.x, smooth(Math.min(1, t / r.establishFor)));
    return {
        position: {
            x: anchorX - behind * close,
            y: height * lerp(1, 0.82, settle),
            z: focus.z * 0.6 + side * close,
        },
        target: {
            x: focus.x + r.lead,
            y: Math.max(focus.y, 0.9),
            z: focus.z,
        },
        fov: lerp(r.fov, r.fov - r.settleZoom, settle),
        // Handed back so a caller can dip the exposure or fade, rather than
        // this module knowing anything about a renderer.
        progress: t,
        opts,
    };
}

// ---- The director -----------------------------------------------------------

const DRIVERS = { play: 'play', replay: 'replay', idle: 'idle' };
let current = DRIVERS.play;
let elapsed = 0;
let aspect = 1.78;

/** Told on every resize. The play and idle cameras solve their framing from
 *  it; the replay camera is close enough to its subject not to care. */
export function setAspect(next) {
    if (next > 0) aspect = next;
}

export function setDriver(name) {
    if (!DRIVERS[name]) return;
    if (current !== name) elapsed = 0;
    current = name;
}

export function getDriver() {
    return current;
}

/**
 * Advance the director and say where the camera should be.
 *
 * `state` carries whatever the active driver needs: `focus` and `progress` for
 * the replay, nothing at all for the others.
 */
export function update(delta, state = {}) {
    elapsed += delta;
    if (current === DRIVERS.replay) {
        return replayDriver(state.progress || 0, state.focus || { x: 0, y: 0, z: 0 });
    }
    if (current === DRIVERS.idle) return idleDriver(elapsed, aspect);
    return playDriver(aspect);
}
