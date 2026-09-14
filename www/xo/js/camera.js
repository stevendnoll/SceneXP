// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * camera.js - The director. One camera, three drivers, and only one driving.
 *
 * PURE, AND THAT IS THE POINT (PLANNING section 5). Every driver is a function
 * of time and state returning a position, a target and a field of view in world
 * metres. Nothing here imports THREE or touches a scene graph, so the
 * interesting question, where should the camera be at t = 1.4s of this replay,
 * is answerable with plain numbers. Camera work gets tweaked for months, so it
 * should be the testable kind.
 *
 * THE PLAY DRIVER NEVER BECOMES CINEMATIC (D5). In 2D the visitor sees the
 * whole field, and that is exactly what makes choosing a play meaningful. A
 * ground-level camera during a live play would hide the information the game is
 * about. If a future change wants drama while the ball is live, it belongs in
 * the replay driver.
 *
 * WHICH DRIVER IS ACTIVE IS DERIVED FROM THE GAME'S PHASE, in main.js, not set
 * at each transition (D41). It used to be four scattered setDriver calls, and
 * the idle camera was left running through an entire live play, which reads as
 * the field spinning.
 */
import { XO_CONFIG as CFG, FIELD } from './config.min.js';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
/** Ease in and out, so a camera never starts or stops with a jerk. */
const smooth = (t) => { const c = clamp01(t); return c * c * (3 - 2 * c); };
const rad = (deg) => (deg * Math.PI) / 180;

// ---- Framing ----------------------------------------------------------------

/**
 * Frame the whole field, on any screen shape.
 *
 * THE HARD CASE IS A PHONE HELD UPRIGHT, and it is hard because fov is
 * VERTICAL: a tall narrow frame turns very little of it into the horizontal
 * angle that decides whether both sidelines fit.
 *
 * For a chosen field of view and pitch the geometry is closed form. Aiming at
 * mid-field and asking the frame's near edge to land just behind the near end
 * line fixes the height, and the height fixes the position:
 *
 *     h = (near - mid) / (1/tan(pitch + vHalf) - 1/tan(pitch))
 *
 * That leaves two free numbers, so the search walks them both and keeps the
 * best. Cached per aspect, because it only changes on a resize.
 */
const solved = new Map();

export function framingFor(aspect) {
    const key = aspect.toFixed(3);
    if (solved.has(key)) return solved.get(key);

    const s = CFG.camera.solve;
    const len = FIELD.lineInterval * FIELD.segments;
    const mid = len / 2;
    const nearBase = -FIELD.endZone - s.nearBehind;
    const farWant = len + FIELD.endZone + s.farBeyond;
    const needHalf = FIELD.width / 2 + CFG.camera.sideMargin;

    const fits = [];
    const relaxed = [];

    // `nearWant` is where the bottom of the frame meets the ground. It starts
    // just behind the near end line and, only when nothing at all fits, steps
    // back a metre at a time: a strip of empty grass along the bottom is a far
    // smaller price than a touchline running off the side of the screen.
    for (let giveBack = 0; giveBack <= 30 && !fits.length && !relaxed.length; giveBack += 1) {
        const nearWant = nearBase - giveBack;

        for (let fov = s.minFov; fov <= s.maxFov; fov += 1) {
            const vHalf = rad(fov) / 2;
            for (let pitchDeg = s.minPitch; pitchDeg <= s.maxPitch; pitchDeg += 0.5) {
                const pitch = rad(pitchDeg);
                const denom = 1 / Math.tan(pitch + vHalf) - 1 / Math.tan(pitch);
                if (denom >= -1e-6) continue;

                const height = (nearWant - mid) / denom;
                if (!(height > 4) || height > 200) continue;

                const camX = mid - height / Math.tan(pitch);
                const top = pitch - vHalf;
                const far = top > 0.02 ? camX + height / Math.tan(top) : Infinity;

                // WIDTH IS MEASURED AT THE NEAR END LINE, NOT AT THE LINE OF
                // SCRIMMAGE (D51). The camera stands behind the near end, so
                // the closest ground is where the frame is narrowest.
                // Measuring at the line of scrimmage reported a comfortable fit
                // while the near corners of the turf were already off screen,
                // and on a phone both touchlines ran clean off the sides.
                const hHalf = Math.atan(Math.tan(vHalf) * aspect);
                const nearest = Math.hypot(-FIELD.endZone - camX, height);
                if (nearest * Math.tan(hHalf) < needHalf) continue;

                const apparent = 1.75 / Math.hypot(mid - camX, height) / Math.tan(vHalf);
                const shot = {
                    fov, height, back: FIELD.lineInterval - camX,
                    aimX: mid, apparent, pitchDeg,
                };
                if (far >= farWant) fits.push(shot); else relaxed.push(shot);
            }
        }
    }

    /**
     * Pick the most natural shot among the good ones.
     *
     * Scoring on apparent size ALONE runs straight to the extreme: on a phone
     * it chose a 28 degree lens 118 metres up, which fits everything and reads
     * as a tactics diagram rather than a place. So take the best size, then
     * among everything within a few percent of it prefer the FLATTEST pitch,
     * which is the one that still looks like somewhere a person could stand.
     */
    const choose = (list) => {
        if (!list.length) return null;
        const top = list.reduce((a, b) => (b.apparent > a.apparent ? b : a));
        const nearly = list.filter((c) => c.apparent >= top.apparent * 0.92);
        return nearly.reduce((a, b) => (b.pitchDeg < a.pitchDeg ? b : a));
    };

    // Width first, always. A clipped sideline is the one thing worse than a
    // little wasted grass, so the fallback gives up the far end line before it
    // gives up either touchline.
    const best = choose(fits) || choose(relaxed) || {
        fov: CFG.camera.fov,
        height: CFG.camera.play.height,
        back: CFG.camera.play.back,
        aimX: FIELD.lineInterval + CFG.camera.play.lookAhead,
        apparent: 0,
    };

    const shot = liftAim(best);
    solved.set(key, shot);
    return shot;
}

/**
 * NUDGE THE WHOLE PICTURE UP THE SCREEN, WHICH ONLY A PHONE NEEDS.
 *
 * `fov` is VERTICAL, and on an upright phone the field's WIDTH is what decides
 * it: fitting 21m of touchline into a frame a third as wide as it is tall needs
 * a 60 degree lens, and that lens then sees 66 metres of ground down a field
 * that is 42 metres long. The spare has to go somewhere, and the solve above
 * puts all of it at the top, because the only thing it pins is the BOTTOM edge.
 *
 * Measured on a 390x846 phone: the far end line landed 21.3% down the frame and
 * the scoreboard's top edge 13.3%, so an eighth of the screen was empty night
 * above the highest thing in the scene, against 6.7% of spare below the near end
 * line. QA asked for the field to come up, and that is the same observation.
 *
 * THE RE-AIM IS THE WHOLE CHANGE, and that is why it is done here rather than
 * inside the search. The camera does not move and the lens does not change, so
 * every guarantee the solve made still holds: the half-width visible at a given
 * distance depends on the field of view and the aspect and NOT on where the
 * camera is pointed, so no amount of tilting can clip a touchline. Only the
 * vertical share moves.
 *
 * IT IS SIZED BY THE SCOREBOARD BECAUSE THE SCOREBOARD IS THE CEILING. It is
 * the tallest thing the play camera looks at, `headroom` is how much frame it
 * may keep above it, and a shape that is already inside that (every landscape
 * one is, at 2.8%) is left exactly alone. The shot is never pushed DOWN.
 */
function liftAim(shot) {
    const s = CFG.camera.solve;
    const B = CFG.scoreboard;
    if (!(s.headroom > 0) || !B) return shot;

    const camX = FIELD.lineInterval - shot.back;
    const vHalf = rad(shot.fov) / 2;
    const pitch = Math.atan2(shot.height, shot.aimX - camX);
    if (!(pitch > 0)) return shot;

    // A point sits `f` of the way down the frame when the angle from the aim
    // axis to it satisfies tan(a - pitch) = (2f - 1) tan(vHalf). Solving that
    // for the pitch that puts the board's top corner at `headroom` gives the
    // aim we want.
    const boardX = FIELD.lineInterval * FIELD.segments + FIELD.endZone + B.beyond;
    const toBoard = Math.atan2(shot.height - (B.standHeight + B.height), boardX - camX);
    let want = toBoard - Math.atan((2 * s.headroom - 1) * Math.tan(vHalf));

    /**
     * ...AND THE EDGE OF THE GROUND IS THE LIMIT, WHICH IS NOT THE END LINE.
     *
     * Tilting down cannot lose the near end line: it is the closest thing in
     * shot and every degree of tilt moves it further UP the frame. What it
     * loses is the bottom edge of the world. This camera already looks past
     * vertical (a 63 degree pitch with a 30 degree half-angle puts the bottom
     * ray at 93), so the ground it lands on is BEHIND the camera, and tilting
     * walks that point backwards. Past the apron there is nothing to draw.
     *
     * A point at ground x sits on the bottom edge when pitch + vHalf is the
     * angle down to it, so the cap is that angle for the apron's near edge.
     */
    const apron = (CFG.turf && CFG.turf.apron && CFG.turf.apron.beyond) || 0;
    const cap = Math.atan2(shot.height, -FIELD.endZone - apron - camX) - vHalf;
    if (want > cap) want = cap;
    if (!(want > pitch)) return shot;

    return { ...shot, aimX: camX + shot.height / Math.tan(want) };
}

// ---- Drivers ----------------------------------------------------------------

/**
 * The play camera. High, raked, and completely still.
 *
 * Stillness is a feature: a camera that drifts while somebody is reading a
 * route concept is a camera competing with the game.
 */
export function playDriver(aspect = 1.78) {
    const { fov, back, height, aimX } = framingFor(aspect);
    return {
        position: { x: FIELD.lineInterval - back, y: height, z: 0 },
        target: { x: aimX, y: 0, z: 0 },
        fov,
    };
}

/**
 * The idle camera, behind the playbook.
 *
 * A slow drift, because a still frame behind a menu looks like a paused game
 * and a moving one looks like a place.
 *
 * IT IS A DOLLY, NOT AN ORBIT (D42). The first version swung the camera
 * fourteen metres sideways while its aim point moved three and a half, which
 * rotates the view around the field and reads as the ground spinning. Moving
 * the target almost as far as the camera keeps the shot pointing the same way
 * while it slides. The swing is measured in INTERVALS so it shrank with the
 * field rather than staying an 8m stride across a 21m pitch.
 */
export function idleDriver(t, aspect = 1.78) {
    const { fov, back, height, aimX } = framingFor(aspect);
    const swing = Math.sin(t * 0.1) * FIELD.lineInterval * 0.8;
    return {
        position: { x: FIELD.lineInterval - back - 4, y: height + 3, z: swing },
        target: { x: aimX, y: 0, z: swing * 0.85 },
        fov,
    };
}

/**
 * The replay camera.
 *
 * THIS IS WHERE THE THIRD DIMENSION EARNS ITS PLACE. It is the budget freed by
 * not porting cutscenes.class.tsx, and it is the one thing the 2D game
 * fundamentally cannot do: watch the play that just happened from somewhere
 * nobody was standing while it happened.
 *
 * IT ORBITS THE CARRIER RATHER THAN CHASING HIM (D56). A camera directly behind
 * needs field behind the ball, and on a 35m field there is barely any: with the
 * carrier near the line of scrimmage a chase wanted to stand behind the goal
 * post, so it spent the entire replay pinned against its clamp, static, at the
 * one distance it was allowed. Swinging round a circle keeps the distance
 * CONSTANT, so the framing never changes size, and it trades the space behind
 * the ball for space beside it, which a field has plenty of.
 *
 * IT SWINGS TOWARDS MID-FIELD, NOT ALWAYS THE SAME WAY. A fixed direction puts
 * the camera in the bleachers whenever the carrier finishes near that touchline.
 * Mirroring on the carrier's own side keeps the arc over grass, and the two
 * shots are the same shot: which shoulder the camera passes is not something a
 * viewer can be wrong about.
 *
 * EVERY DISTANCE IS IN INTERVALS, NOT METRES. They were metres, and when the
 * field shrank from 50m to 35m they did not shrink with it, which is how a
 * replay ended up shot through the uprights with a player filling three
 * quarters of the frame.
 */
export function replayDriver(progress, focus, shoulder) {
    const r = CFG.camera.replay;
    const t = clamp01(progress);
    const iv = FIELD.lineInterval;
    const snapX = FIELD.lineInterval;

    const arrive = smooth(Math.min(1, t / r.establishFor));
    const height = lerp(r.establishHeight, r.trackHeight, arrive) * iv;

    // Round the near shoulder when the carrier is on the far touchline, and
    // vice versa, so the arc always crosses the middle of the field.
    //
    // PASSED IN RATHER THAN READ HERE, because the honest answer needs a clock
    // and this function has none: see `shoulderFor`. The default is the old
    // per-frame reading, which keeps this pure and testable on its own, and it
    // is also exactly the behaviour that flickered, so nothing calls it.
    const side = shoulder === undefined ? (focus.z > 0 ? -1 : 1) : shoulder;

    // The settle: over the last stretch, ease in a little and drop slightly.
    const settle = smooth(clamp01((t - r.settleFrom) / (1 - r.settleFrom)));
    const close = lerp(1, r.settleCloseness, settle);

    // Anchored on the line of scrimmage at first, so the replay opens on the
    // formation rather than on whoever happens to be holding the ball.
    const anchorX = lerp(snapX, focus.x, arrive);
    const anchorZ = focus.z * arrive;

    let angle = rad(lerp(r.angleFrom, r.angleTo, t));
    let dist = r.radius * iv * close;

    /**
     * NEVER BEHIND THE GOAL POST. It stands on the near end line, and a camera
     * that drifts past it shoots the whole replay through the uprights.
     *
     * THE ANGLE GIVES WAY, NOT THE POSITION, and that is the whole difference
     * between this and the chase it replaced. Clamping x froze the camera dead
     * for two fifths of every replay, because once it hit the limit it simply
     * stayed there. Clamping the ANGLE swings the camera round the same circle
     * to wherever there IS room, so it keeps moving and the subject stays the
     * same size. Near the try line that lands it broadside, which is the shot
     * a low end zone cannot give anyway.
     */
    const limitX = -FIELD.endZone + 0.5;
    const reach = (limitX - anchorX) / dist;
    if (reach > -1) angle = Math.min(angle, Math.acos(Math.min(reach, 1)));

    /**
     * AND NEVER IN THE SEATS. Here the radius is what gives way: sliding
     * further round would swap the shot for a completely different one, while
     * stepping in a metre only makes the carrier slightly larger. Coming
     * closer also moves x away from the post, so this can never undo the
     * clamp above.
     */
    const limitZ = FIELD.width / 2 + FIELD.sideline;
    const room = limitZ - side * anchorZ;
    const lateral = Math.sin(angle) * dist;
    if (lateral > room) dist = Math.max(room / Math.sin(angle), r.minRadius * iv);

    return {
        position: {
            x: anchorX + Math.cos(angle) * dist,
            y: height * lerp(1, 0.88, settle),
            z: anchorZ + side * Math.sin(angle) * dist,
        },
        target: {
            x: focus.x + r.lead * iv,
            y: Math.max(focus.y, 0.9),
            z: focus.z,
        },
        fov: lerp(r.fov, r.fov - r.settleZoom, settle),
        progress: t,
    };
}

/**
 * WHICH SHOULDER THE REPLAY ORBITS FROM, WITH A MEMORY.
 *
 * The shot wants to round the shoulder AWAY from the carrier so its arc crosses
 * the middle of the field, and that used to be `focus.z > 0 ? -1 : 1` read
 * fresh every frame. A carrier anywhere near the middle makes the sign of his
 * own z chatter, and the camera cut 180 degrees every time: measured over 102
 * recorded plays, 137 of 160 swaps arrived less than a second after the one
 * before. QA called it flickering.
 *
 * THREE THINGS, AND ALL THREE ARE NEEDED. A dead band, so the question is only
 * asked once he is properly on the other half. A hold, so the answer cannot
 * change more often than every `shoulderHold` seconds. And an ease, so the
 * change is the camera swinging across rather than cutting.
 *
 * IT IS SIGNED AND CONTINUOUS, not a choice of two. Halfway through a swing
 * `side` is near zero, which puts the camera straight behind the carrier with
 * no lateral offset: a real shot, and the one it passes through on its way.
 */
const shoulder = { side: 1, want: 1, held: 0, seeded: false };

/** Back to whichever side this carrier's position asks for, with no swing.
 *  Called when a replay starts, so it opens on the right shoulder rather than
 *  swinging in from wherever the last one finished. */
export function resetShoulder() {
    shoulder.seeded = false;
    shoulder.held = 0;
}

export function shoulderFor(z, delta = 0) {
    const R = CFG.camera.replay;
    const asked = z > 0 ? -1 : 1;
    if (!shoulder.seeded) {
        shoulder.seeded = true;
        shoulder.side = asked;
        shoulder.want = asked;
        shoulder.held = 0;
        return shoulder.side;
    }

    shoulder.held += delta;
    // Only ask once he is properly on the other half of the field.
    const clear = z > R.shoulderSwap ? -1 : (z < -R.shoulderSwap ? 1 : shoulder.want);
    if (clear !== shoulder.want && shoulder.held >= R.shoulderHold) {
        shoulder.want = clear;
        shoulder.held = 0;
    }
    const rate = R.shoulderEase > 0 ? 1 - Math.exp(-delta / R.shoulderEase) : 1;
    shoulder.side += (shoulder.want - shoulder.side) * rate;
    return shoulder.side;
}

/**
 * THE VISITOR'S OWN ADJUSTMENT, WHICH RIDES ON TOP OF THE SHOT.
 *
 * QA asked to be able to look at a replay from another angle. The wrong way to
 * do that is to hand over the camera, because the replay is a directed shot
 * that establishes, tracks and settles, and a visitor who takes it over gets a
 * static view of a play they have already seen. So this is an OFFSET: the
 * director keeps working and the adjustment is applied to whatever it produced,
 * which is the same shape as the shared pan part's yaw (and the same trap, so
 * it is stated plainly here: this is added every frame to a moving shot, not
 * stored as an absolute camera).
 *
 * Spherical about the shot's own TARGET, so orbiting keeps the carrier in the
 * middle of the frame and zooming moves toward him rather than toward wherever
 * the camera happens to be pointing.
 *
 * THE YAW IS NOW A CHOICE OF FOUR RATHER THAN A DRAG. QA round twenty-two: the
 * free drag was "too hard to control", which it was, and the reason is that it
 * asks a visitor to fly a camera around a moving subject with one finger while
 * watching something else. Four fixed vantage points ask for one press and
 * cannot be got wrong. See `switchView`.
 */
const view = { yaw: 0, lift: 0, zoom: 1, quarter: 0 };

/**
 * THE FOUR VANTAGE POINTS, AS QUARTER TURNS ABOUT THE SHOT'S OWN TARGET.
 *
 * Expressed as an offset on the director's shot rather than as four fixed
 * camera positions, and that is what makes them cheap AND correct: `applyView`
 * turns the shot about its target, keeping the radius and the elevation, so all
 * four are at the same height and look down at the same angle by construction.
 * There is no second set of numbers to keep in step with the first, and the
 * camera goes on establishing, tracking and settling in every one of them.
 *
 * THE ORDER IS NOT 0, 90, 180, 270, and that is deliberate. The first press
 * should be the biggest change, because a visitor pressing "switch view" wants
 * a different picture rather than a nudge: the opposite end of the field comes
 * first, then the two touchlines.
 */
const QUARTERS = [0, Math.PI, Math.PI / 2, -Math.PI / 2];

/** How many there are, for anything that wants to say so. */
export const REPLAY_VIEWS = QUARTERS.length;

/**
 * Move to the next vantage point and say which one it is.
 *
 * IT CUTS RATHER THAN SWINGS. A quarter turn eased across would take a second
 * of a replay that runs for four, and switching cameras mid-replay is a cut
 * everywhere else in the sport.
 */
export function switchView(step = 1) {
    const n = QUARTERS.length;
    view.quarter = (((view.quarter + step) % n) + n) % n;
    view.yaw = QUARTERS[view.quarter];
    return view.quarter;
}

/** Which of the four is showing, 0 for the director's own. */
export function viewQuarter() {
    return view.quarter;
}

/** How far a visitor may take it. The floor on elevation is what keeps the
 *  camera out of the turf, and the ceiling stops a plan view, which is the shot
 *  the play camera already gives them. */
const VIEW = {
    lift: { min: -0.5, max: 0.9 },       // radians added to the shot's elevation
    zoom: { min: 0.45, max: 2.4 },
    floor: 1.2,                          // metres: never below this off the grass
};

const clamp = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));

/**
 * Turn, raise or zoom, relative to wherever the visitor already had it.
 *
 * `yaw` and `lift` are radians and `zoom` is a MULTIPLIER, so a wheel notch and
 * a pinch compose the same way and neither has to know the current value.
 *
 * ONLY THE ZOOM IS WIRED TO ANYTHING NOW. The yaw belongs to `switchView` and
 * the lift to nobody: four vantage points at one height is the whole point of
 * them, and a visitor who could also tilt would be back to flying a camera.
 * Both stay here because this is the primitive the offset is made of and the
 * arithmetic is worth keeping in one piece.
 */
export function nudgeView({ yaw = 0, lift = 0, zoom = 1 } = {}) {
    view.yaw += yaw;
    view.lift = clamp(view.lift + lift, VIEW.lift.min, VIEW.lift.max);
    view.zoom = clamp(view.zoom * zoom, VIEW.zoom.min, VIEW.zoom.max);
    return { ...view };
}

/** Back to the director's own shot. Called when a replay starts, so every
 *  replay opens on the composition it was designed with. */
export function resetView() {
    view.yaw = 0;
    view.lift = 0;
    view.zoom = 1;
    view.quarter = 0;
    // A new replay also opens on the shoulder its own carrier asks for, rather
    // than swinging in from wherever the last one finished.
    resetShoulder();
    return { ...view };
}

export function getView() {
    return { ...view };
}

/** Has the visitor moved it at all? The hint on screen goes away once they
 *  have, because it has done its job. */
export function viewMoved() {
    return view.yaw !== 0 || view.lift !== 0 || view.zoom !== 1;
}

/**
 * Apply the offset to a finished shot.
 *
 * PURE, and separated from `update` precisely so it can be asserted: an orbit
 * that quietly changes the distance, or a zoom that walks the camera into the
 * ground, are both things a test can catch and a screenshot cannot.
 */
export function applyView(shot, offset = view) {
    if (!offset || (offset.yaw === 0 && offset.lift === 0 && offset.zoom === 1)) {
        return shot;
    }
    const t = shot.target;
    const dx = shot.position.x - t.x;
    const dy = shot.position.y - t.y;
    const dz = shot.position.z - t.z;
    const radius = Math.hypot(dx, dy, dz) || 1e-6;

    const azimuth = Math.atan2(dz, dx) + offset.yaw;
    // Elevation is measured off the horizontal, and held inside a right angle
    // either way so the camera can never pass through its own subject.
    const elevation = clamp(
        Math.asin(clamp(dy / radius, -1, 1)) + offset.lift, -1.45, 1.45
    );
    const reach = radius * offset.zoom;
    const flat = Math.cos(elevation) * reach;

    return {
        ...shot,
        position: {
            x: t.x + Math.cos(azimuth) * flat,
            // NEVER UNDER THE PITCH. A visitor who drags all the way down would
            // otherwise be looking up through the grass at the underside of the
            // world, which has no back face and is simply the void.
            y: Math.max(t.y + Math.sin(elevation) * reach, VIEW.floor),
            z: t.z + Math.sin(azimuth) * flat,
        },
    };
}

// ---- The director -----------------------------------------------------------

/** ...and `show`, the milestone shows, whose every shot is solved in
 *  milestones.js and handed over whole. */
const DRIVERS = { play: 'play', replay: 'replay', idle: 'idle', show: 'show' };
let current = DRIVERS.play;
let elapsed = 0;
let aspect = 1.78;

/** Told on every resize. The play and idle cameras solve their framing from
 *  it. The replay camera sits close enough to its subject not to care. */
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
 * the replay, nothing at all for the other two.
 */
export function update(delta, state = {}) {
    elapsed += delta;
    if (current === DRIVERS.replay) {
        // The director's shot first, then whatever the visitor has done to it.
        const focus = state.focus || { x: 0, y: 0, z: 0 };
        return applyView(
            replayDriver(state.progress || 0, focus, shoulderFor(focus.z, delta))
        );
    }
    if (current === DRIVERS.idle) return idleDriver(elapsed, aspect);
    // A show brings its own shot. Without one it holds the play camera, which
    // is where every show starts and ends.
    if (current === DRIVERS.show && state.shot) return state.shot;
    return playDriver(aspect);
}
