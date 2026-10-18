// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * turntable.js - The camera on the house (PLANNING 6.2): where it stands,
 * and how the visitor turns the house.
 *
 * THE HOUSE TURNS, NOT THE CAMERA. A sideways drag turns the turntable the
 * house stands on (`yaw`, main.js sets the stage's spin group to it), so
 * "turn the house" is exactly what it feels like, and the white cove behind
 * it never has to be seen from the side. Turning is the visitor's only say
 * over the view (QA, 2026-10-15: Whitestone is a business's site, not a
 * world to explore). The camera's height (`tilt`) and distance are the
 * page's: one composed view of the house closed, and a closer, lower one
 * of a floor while it is open (`setFocus`).
 *
 * THE FRAME FITS THE SUBJECT TO THE SCREEN. `framePose` stands the camera
 * just far enough back that every point of the subject (the turntable's
 * rim, top and bottom, and the house's height above it) lands inside the
 * part of the screen it may use: on a wide screen most of it, a little left
 * of center for Maya and the panel, on a phone the top part above the
 * bottom sheet. The shift is a view offset (main.js `setViewOffset`), so the
 * house is moved on the screen, not seen at an angle.
 *
 * ARRIVAL, DRIFT AND INERTIA. The view arrives from farther out and eases
 * in, a released drag carries on a little and slows, and while the page
 * asks for it (main.js: Maya greeting, before the visitor takes hold of
 * the house or starts, QA 2026-10-15) the turntable drifts slowly round.
 * Under reduced motion there is none of the three.
 *
 * Pure: plain numbers in, plain numbers out, no three.js and no clock. The
 * controller is stepped by main.js with the frame's seconds.
 */

/** Ease in and out, so a move starts and lands gently. */
export function smoothstep(t) {
    const x = Math.min(1, Math.max(0, t));
    return x * x * (3 - 2 * x);
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * A point on the turntable (x, y, z in its own frame) turned by `yaw`
 * radians about the vertical axis, as three's `rotation.y` turns it: where
 * a label over a room is in the world once the house has been turned.
 */
export function turnPoint(p, yaw) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
}

/** Which way the screen is shaped: `tall` below `view.tallBelow`, else
 *  `wide`. Each has its own lens, its share of the screen, and its shift. */
export function frameFor(aspect, view) {
    return aspect > 0 && aspect < view.tallBelow ? view.tall : view.wide;
}

/**
 * The points the frame must hold, in world meters, for a house `height`
 * meters tall on the turntable: the turntable's rim at its foot and at its
 * top, and a ring of the turntable's radius at the house's highest point
 * (the house turns, so any of its corners can be anywhere on that ring).
 */
export function subjectPoints(turntable, height, steps = 24) {
    const pts = [];
    const r = turntable.radius;
    const top = turntable.height;
    for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        pts.push([x, 0, z], [x, top, z], [x, top + Math.max(0, height), z]);
    }
    return pts;
}

/** Where the camera looks: the middle of the subject, from the floor to
 *  the house's highest point. */
export function aimFor(turntable, height) {
    return [0, (turntable.height + Math.max(0, height)) / 2, 0];
}

/**
 * The points the closer view must hold for an open floor, `focus` = {
 * bottom, top, radius } in meters (its floor and its walls' top over the
 * turntable's top, and how far its farthest corner reaches from the
 * turntable's middle): a ring of that reach at its floor and at its top.
 * A ring, because the visitor may turn the house while the floor is open.
 */
export function focusPoints(turntable, focus, steps = 24) {
    const pts = [];
    const r = Math.max(0.05, focus.radius);
    const lo = turntable.height + focus.bottom;
    const hi = turntable.height + Math.max(focus.bottom, focus.top);
    for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        pts.push([x, lo, z], [x, hi, z]);
    }
    return pts;
}

/**
 * How far back along `back` (a unit vector from the aim toward the camera)
 * the camera must stand to hold every point, with `tanH` and `tanV` the
 * tangents of half the usable width and height of the view. Exact for a
 * pinhole: each point needs its sideways and upward reach, over the tangent,
 * plus however far toward the camera it already stands.
 */
export function fitDistance(points, aim, back, tanH, tanV) {
    const up0 = [0, 1, 0];
    // right = up0 x back, up = back x right: the camera's own axes.
    const right = [up0[1] * back[2] - up0[2] * back[1], up0[2] * back[0] - up0[0] * back[2], up0[0] * back[1] - up0[1] * back[0]];
    const rl = Math.hypot(...right) || 1;
    for (let i = 0; i < 3; i++) right[i] /= rl;
    const up = [back[1] * right[2] - back[2] * right[1], back[2] * right[0] - back[0] * right[2], back[0] * right[1] - back[1] * right[0]];
    let d = 0;
    for (const p of points) {
        const q = [p[0] - aim[0], p[1] - aim[1], p[2] - aim[2]];
        const along = q[0] * back[0] + q[1] * back[1] + q[2] * back[2];
        const x = Math.abs(q[0] * right[0] + q[1] * right[1] + q[2] * right[2]);
        const y = Math.abs(q[0] * up[0] + q[1] * up[1] + q[2] * up[2]);
        d = Math.max(d, along + x / tanH, along + y / tanV);
    }
    return d;
}

/**
 * The subject's upward reach on the screen from a camera `d` back along
 * `back` from `aim`: the lowest and highest point, as tangents of the angle
 * from the line of sight (`up` is the camera's up).
 */
export function verticalSpan(points, aim, back, up, d) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of points) {
        const q = [p[0] - aim[0], p[1] - aim[1], p[2] - aim[2]];
        const ahead = d - (q[0] * back[0] + q[1] * back[1] + q[2] * back[2]);
        const y = (q[0] * up[0] + q[1] * up[1] + q[2] * up[2]) / ahead;
        lo = Math.min(lo, y);
        hi = Math.max(hi, y);
    }
    return [lo, hi];
}

/**
 * How tall the frame holds the subject: the house, and on a frame that
 * holds Maya (`frame.host`) never less than her, so her head is never cut
 * off beside a low house. In meters over the turntable's top.
 */
export function frameHeight(height, frame, config) {
    const h = Math.max(0, height);
    if (!frame.host || !config.cast) return h;
    return Math.max(h, config.cast.maya.height - config.stage.turntable.height);
}

/**
 * Fit `points` to the usable view: `{ aim, distance }`. The near rim looms
 * larger than the far one, so a subject fitted about its middle sits low in
 * its share. Move the aim along the camera's up until the subject is
 * centered, refitting each time (it settles in a few steps), so it fills
 * its share rather than touching one edge.
 */
function fitPoints(points, start, back, up, tanH, tanV) {
    let aim = start;
    let fitted = fitDistance(points, aim, back, tanH, tanV);
    for (let i = 0; i < 6; i++) {
        const [lo, hi] = verticalSpan(points, aim, back, up, fitted);
        const mid = (lo + hi) / 2;
        if (Math.abs(mid) < 1e-7) break;
        aim = aim.map((v, k) => v + up[k] * mid * fitted);
        fitted = fitDistance(points, aim, back, tanH, tanV);
    }
    return { aim, distance: fitted };
}

/**
 * The camera's pose for a screen of `aspect`: `{ eye, aim, fov, offset }`,
 * with `offset` the view's shift as fractions of the screen's width and
 * height (positive moves the subject left and up). `look` is `{ tilt }`,
 * and while a floor is open `{ focus, near }` too: the open floor (see
 * focusPoints) and how far over to its closer view (0 to 1). The closer
 * view is never nearer than `view.focus.closest` of the whole house's
 * distance, nor farther. `height` is the house's height over the
 * turntable, and `far` the arrival's extra distance (1 once arrived).
 */
export function framePose(aspect, height, look, config, far = 1) {
    const { view, stage } = config;
    const frame = frameFor(aspect, view);
    const fov = frame.fov;
    height = frameHeight(height, frame, config);
    const tanHalf = Math.tan((fov * Math.PI) / 360);
    const tanV = tanHalf * frame.use[1];
    const tanH = tanHalf * Math.max(0.1, aspect) * frame.use[0];
    const tilt = look.tilt;
    const back = [0, Math.sin(tilt), Math.cos(tilt)];
    const up = [0, Math.cos(tilt), -Math.sin(tilt)];
    const whole = fitPoints(subjectPoints(stage.turntable, height), aimFor(stage.turntable, height), back, up, tanH, tanV);
    let aim = whole.aim;
    let fitted = whole.distance;
    const near = clamp(Number(look.near) || 0, 0, 1);
    if (look.focus && near > 0) {
        const f = look.focus;
        const start = [0, stage.turntable.height + (f.bottom + Math.max(f.bottom, f.top)) / 2, 0];
        const close = fitPoints(focusPoints(stage.turntable, f), start, back, up, tanH, tanV);
        const d = clamp(close.distance, whole.distance * view.focus.closest, whole.distance);
        aim = aim.map((v, k) => v + (close.aim[k] - v) * near);
        fitted += (d - fitted) * near;
    }
    const d = fitted * far;
    return {
        eye: [aim[0] + back[0] * d, aim[1] + back[1] * d, aim[2] + back[2] * d],
        aim,
        fov,
        offset: [frame.shift[0], frame.shift[1]],
        distance: d,
        host: Boolean(frame.host)
    };
}

/** Partway from one open floor's measure to another's. */
function mixFocus(a, b, k) {
    if (!a || !b) return b || a;
    return {
        bottom: a.bottom + (b.bottom - a.bottom) * k,
        top: a.top + (b.top - a.top) * k,
        radius: a.radius + (b.radius - a.radius) * k
    };
}

/**
 * The visitor's view of the turntable, stepped by main.js. Returns:
 *
 *   yaw, tilt            the turn of the house, the camera's tilt
 *   near                 how far over to an open floor's closer view (0-1)
 *   height               the house height the frame is fitted to now
 *   drag(dx, size, dt)   a sideways drag of dx pixels, `dt` seconds after
 *                        the last, on a screen `size` pixels tall: turns
 *                        the house, and stops any drift
 *   release(still)       the drag has ended, the finger still for `still`
 *                        seconds: the turn carries on at the drag's last
 *                        pace and slows, unless it rested first
 *   turnBy(radians)      a turn from the keys or the console
 *   faceFront(seconds)   turn the house's front (its open side when a
 *                        floor is open) to the camera by the shorter way,
 *                        eased over `seconds` (0 for at once)
 *   turnHome(seconds)    the same, back to the arrival's three-quarter view
 *                        (`yaw.start`): the visitor has begun
 *   setFocus(f, seconds) a floor opened: ease to its closer view, `f` =
 *                        { bottom, top, radius } (focusPoints), lowered to
 *                        `tilt.open` so the floors above do not hide its
 *                        rooms; null eases back out to the whole house at
 *                        `tilt.start` (0 seconds for at once)
 *   touch()              the visitor did something: the drift and the
 *                        arrival end at once
 *   arrive(seconds)      start the arrival from farther out
 *   setHeight(m, now)    the house's new height, eased to unless `now`
 *   step(dt, opts)       advance by dt seconds; opts { reducedMotion,
 *                        locked, drift }; returns whether anything moved
 *                        (the drift only while `drift` is true, and never
 *                        during the arrival, a turn under way or a drag)
 *   pose(aspect)         the camera's pose now (framePose)
 *   arriving             whether the arrival is still under way
 */
export function createTurntable(config) {
    const view = config.view;
    const look = {
        yaw: view.yaw.start,
        tilt: view.tilt.start,
        velocity: 0,
        holding: false,
        drifting: false
    };
    let height = 0;
    let heightFrom = 0;
    let heightTo = 0;
    let heightT = 1;
    let arrival = null;
    /** A turn to the front under way: { from, to, elapsed, seconds }. */
    let seek = null;
    /** The open floor framed now, how far over to its closer view, and an
     *  ease between views under way: { from, to, elapsed, seconds }, each
     *  end { focus, near, tilt }. */
    let focus = null;
    let near = 0;
    let toward = null;

    function setView(v) {
        focus = v.focus;
        near = v.near;
        look.tilt = v.tilt;
    }

    const api = {
        get yaw() { return look.yaw; },
        get tilt() { return look.tilt; },
        get near() { return near; },
        get height() { return height; },
        get arriving() { return Boolean(arrival); },
        get drifting() { return look.drifting; },
        drag(dx, size = 800, dt = 1 / 60) {
            api.touch();
            // The same drag turns the house as far on any screen: a pixel
            // is worth more on a small one.
            const scale = 800 / Math.max(200, size);
            const turn = dx * view.turn.perPixel * scale;
            look.yaw += turn;
            look.velocity = clamp(turn / Math.max(dt, 1 / 120), -view.turn.maxSpeed, view.turn.maxSpeed);
            look.holding = true;
        },
        release(still = 0) {
            look.holding = false;
            // A finger that rested before lifting meant to stop there.
            if (still > view.turn.hold) look.velocity = 0;
        },
        turnBy(radians) {
            api.touch();
            look.yaw += radians;
            look.velocity = 0;
            look.holding = false;
        },
        faceFront(seconds = view.turn.face, home = 0) {
            look.velocity = 0;
            look.holding = false;
            look.drifting = false;
            const full = Math.PI * 2;
            // The nearest whole turn from `home`: the front again, the
            // shorter way round.
            const to = home + Math.round((look.yaw - home) / full) * full;
            if (!(seconds > 0)) {
                look.yaw = to;
                seek = null;
                return;
            }
            seek = { from: look.yaw, to, elapsed: 0, seconds };
        },
        setFocus(next, seconds = view.focus.seconds) {
            // Already there (a refit of an unchanged house): nothing to ease.
            const settled = next
                ? near === 1 && focus && ['bottom', 'top', 'radius'].every((k) => Math.abs(focus[k] - next[k]) < 1e-9)
                : near === 0 && look.tilt === view.tilt.start;
            if (!toward && settled) return;
            const to = next
                ? { focus: next, near: 1, tilt: view.tilt.open }
                : { focus, near: 0, tilt: view.tilt.start };
            const from = { focus: focus || next, near, tilt: look.tilt };
            if (!(seconds > 0)) {
                toward = null;
                setView(next ? to : { ...to, focus: null });
                return;
            }
            toward = { from, to, elapsed: 0, seconds };
        },
        turnHome(seconds = view.turn.face) {
            api.faceFront(seconds, view.yaw.start);
        },
        /** One slow, eased full turn, ending where it began: the house
         *  shown off when the first checklist is saved. */
        spinOnce(seconds = view.turn.celebrate) {
            look.velocity = 0;
            look.holding = false;
            look.drifting = false;
            if (!(seconds > 0)) return;
            seek = { from: look.yaw, to: look.yaw + Math.PI * 2, elapsed: 0, seconds };
        },
        touch() {
            look.drifting = false;
            arrival = null;
            seek = null;
        },
        arrive(seconds = view.arrival.seconds) {
            arrival = seconds > 0 ? { elapsed: 0, seconds } : null;
        },
        setHeight(next, now = false) {
            const h = Math.max(0, next);
            if (now) {
                height = h;
                heightFrom = h;
                heightTo = h;
                heightT = 1;
                return;
            }
            if (Math.abs(h - heightTo) < 1e-9) return;
            heightFrom = height;
            heightTo = h;
            heightT = 0;
        },
        step(dt, { reducedMotion = false, locked = false, drift = false } = {}) {
            const t = Math.max(0, dt);
            let moved = false;
            if (seek) {
                seek.elapsed += t;
                const k = reducedMotion ? 1 : smoothstep(seek.elapsed / seek.seconds);
                look.yaw = seek.from + (seek.to - seek.from) * k;
                if (k >= 1) seek = null;
                moved = true;
            }
            if (toward) {
                toward.elapsed += t;
                const k = reducedMotion ? 1 : smoothstep(toward.elapsed / toward.seconds);
                const { from, to } = toward;
                setView({
                    focus: mixFocus(from.focus, to.focus, k),
                    near: from.near + (to.near - from.near) * k,
                    tilt: from.tilt + (to.tilt - from.tilt) * k
                });
                if (k >= 1) {
                    // Back out to the whole house: no floor framed any more.
                    if (!(to.near > 0)) focus = null;
                    toward = null;
                }
                moved = true;
            }
            if (arrival) {
                arrival.elapsed += t;
                if (reducedMotion || arrival.elapsed >= arrival.seconds) arrival = null;
                moved = true;
            }
            if (heightT < 1) {
                heightT = reducedMotion ? 1 : Math.min(1, heightT + t / view.subject.ease);
                height = heightFrom + (heightTo - heightFrom) * smoothstep(heightT);
                moved = true;
            }
            if (look.velocity !== 0 && !look.holding) {
                if (reducedMotion || locked) {
                    look.velocity = 0;
                } else {
                    look.yaw += look.velocity * t;
                    look.velocity *= Math.exp(-view.turn.damping * t);
                    if (Math.abs(look.velocity) < view.turn.stop) look.velocity = 0;
                    moved = true;
                }
            }
            look.drifting = Boolean(drift) && !locked && !reducedMotion && !seek && !arrival && !look.holding && look.velocity === 0;
            if (look.drifting) {
                look.yaw += view.drift.speed * t;
                moved = true;
            }
            return moved;
        },
        pose(aspect) {
            const far = arrival ? 1 + (view.arrival.from - 1) * (1 - smoothstep(arrival.elapsed / arrival.seconds)) : 1;
            return framePose(aspect, height, { tilt: look.tilt, focus, near }, config, far);
        }
    };
    return api;
}
