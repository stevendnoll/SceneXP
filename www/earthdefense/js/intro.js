// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * intro.js - The shot the game opens on, before the welcome screen.
 *
 * FOUR BEATS AND ONE UNBROKEN MOVE, which is the shape as of 2026-09-17 and
 * the thing to understand before reading anything else here. The squadron forms
 * up at Mars, the camera pushes in on the Martian commander flying the apex
 * ship, holds while they say their line, and then retreats all the way to the
 * spawn point. The commander is martian.js, mounted on ship zero by
 * `mountCommander` and driven off this module's own clock, so the camera stays
 * one file's job and the face is another's.
 *
 * THE MONOLOGUE USED TO COME FIRST, IN FRONT OF THE FORM-UP, and Steve's
 * screenshots killed that arrangement. The commander had a command ship of
 * their own standing off to one side of the approach line, which made them a
 * speck at the edge of frame that was plainly not part of the squadron, and
 * holding the form-up at its first frame for the length of the monologue meant
 * the visitor spent five seconds watching a scattered swarm that only became a
 * V afterwards. Putting the beat AFTER the form-up and the commander IN the
 * apex ship fixes all of it at once: the V is made at its proper speed, the
 * camera pushes in on something the visitor has been looking at, and the
 * subject of the close-up is a ship that is visibly one of the twelve coming.
 *
 * THE OPENING FRAME USED TO ARRIVE WITHOUT ITS FIRST HALF. A visitor landed on
 * the welcome overlay already sitting 8,500 units over Earth, with a line of
 * hostile lights trailing away toward a small red disc, and nothing on the page
 * had told them what that line was or where it had come from. The subtitle said
 * "Martian fleet" and the frame was expected to do the rest. This is the half
 * second of story that was missing: the same fleet, at Mars, closing up into
 * formation, and then the camera running the approach line back to Earth ahead
 * of them.
 *
 * IT ARRIVES, IT DOES NOT CUT, which is the whole reason it earns its ten
 * seconds. The last frame of this shot IS the spawn frame. The path ends at
 * `spawnPosition(config)` looking down -Z, which is exactly where and how
 * `placeCameraAtSpawn` puts the camera, so the welcome overlay comes up over a
 * view that is already the one the visitor is about to fly from. Nothing snaps
 * and nothing is cut to. That is the same trick the wreck ending plays at the
 * other end of a run, where the finale opens at the distance the replay closes
 * at, and it works here for the same reason.
 *
 * THE SHOT IS STAGED ON THE REAL FLEET'S START LINE, and it was not always, and
 * that correction is what most of this file now is. The staging used to be
 * chosen for the picture: put the camera 14,000 units off Mars, hang a wedge
 * between it and the disc, and it framed beautifully. What it framed was a
 * fleet that did not exist. The twelve real raiders stood 3.4 degrees to the
 * right of Mars, so a visitor watched a squadron close up dead centre on the
 * planet, the camera pulled back, and the hostile markers lit up two Mars
 * diameters away from where the squadron had just been. Both halves were
 * correct and they were not the same fleet.
 *
 * So the staging is now derived rather than composed. `fleetStartAnchor` gives
 * the point the trailing group starts from; the squadron forms up there, ship
 * zero lands exactly on it, and the camera stands `range` ahead of it on the
 * fleet's own heading. The last frame therefore puts the wedge within a third
 * of a degree of the four raiders about to be marked, which is well inside
 * Mars's own disc as seen from the spawn point.
 *
 * MARS IS NOT AN INPUT TO ANY OF IT, which is the part worth not undoing. This
 * file no longer knows where Mars is. It is behind the squadron because
 * `MARS_DISTANCE` is 10,000 units further out than the trailing group's start,
 * and that is a property of config.js that the intro suite asserts against this
 * path rather than a number this module is holding.
 *
 * THE CAMERA NEVER TURNS AROUND, and the geometry is arranged so it does not
 * have to. The spawn camera looks down the approach line, and so does this one
 * from the first frame: it starts just ahead of the fleet facing back at it,
 * and then retreats down the same line. One long pull-back with 15 degrees of
 * settle in it rather than a whip. Mars shrinks from a 27 degree disc to the
 * 1.8 degree one the spawn frame has, the formation shrinks with it into the
 * line of lights the spawn frame has always shown, and Earth's limb rises into
 * the bottom of the frame on the last beat.
 *
 * THE CAMERA STANDS ON THE FLEET'S OWN APPROACH LINE, which is the one thing
 * here that took three attempts. A formation has depth, and depth seen from off
 * its own axis projects sideways across the frame: the first staging put the
 * camera 32 degrees off the line and the finished wedge was a sheared diagonal
 * with its two columns bunched at opposite edges, nothing like the shape
 * `wedgeSlot` lays out. The second stood on the Mars-to-fleet line, only 12
 * degrees off, and still pulled the two columns 93 percent out of balance. The
 * camera now stands on `approachHeading` itself, so the squadron is watched
 * along the line it is flying and the pairs land symmetrically either side of
 * their leader. `elevation` lifts the camera off that line vertically, which is
 * free: a lift moves the wedge's depth into screen-Y, and the shear that
 * matters is horizontal.
 *
 * THESE ARE STILL NOT THE REAL RAIDERS, even though they now stand exactly
 * where four of them do, and that is the one decision in this file worth
 * defending. The twelve are built and standing on their start line from the
 * moment the world is, and those start positions are load bearing: arrival
 * times are read straight off them and the init suite asserts the opening frame
 * against them. Flying them to Mars and putting them back with `resetFleet`
 * would mean a snap on the exact frame the camera is watching them. So this
 * module owns nine throwaway hulls, built through `createRaiderMesh` from
 * fleet.js's own shared geometry so a raider keeps one definition, and the real
 * fleet is hidden for the whole opening. Hiding it matters more than it used to:
 * they are no longer parked somewhere else in the sky, they are in the same
 * cubic kilometre. At arrival the throwaways are 200,000 units behind the
 * camera and smaller than a pixel, so disposing them is invisible.
 *
 * NOTHING HERE IS RANDOM, exactly like the fleet's formation scatter and the
 * finale's spark directions. Every start offset and every start heading comes
 * from `hashUnit` of the ship's index. A visitor who reloads sees the same
 * squadron close up the same way, and the whole shot is a value a test can
 * assent to.
 *
 * IT IS SKIPPABLE THROUGH ONE FOCUSED BUTTON, AND NOT ON ANY KEY OR ANY TAP.
 * That distinction is the entire history of this paragraph and is worth not
 * losing.
 *
 * The shot was leavable on any key or any tap, briefly, which sounds like
 * courtesy and on a touch screen is not a control a visitor chooses so much as
 * one they trip over while waiting: playtesting had people tapping straight
 * through the shot at the END of a run without ever deciding to, and losing the
 * one moment their whole run had been built toward. So the skip was removed
 * outright in August, from both ends of the game.
 *
 * What was wrong with it was the surface, not the courtesy. www/xo hit the same
 * problem afterwards, cited this scene while deciding, and built the shape that
 * answers both halves: ONE BUTTON that holds the focus, so Enter, Space and
 * Escape all get a visitor out in one press while a stray thumb anywhere on the
 * scene gets nothing. That is what this shot has now, and it matters more here
 * than it did when the shot was 5.2 seconds long, because the push-in and the
 * commander's line have since taken it to nearly ten.
 *
 * THE ENDINGS ARE STILL UNSKIPPABLE and that is a separate decision. The
 * argument that removed the skip was strongest there: an ending is the payoff
 * of the run, a visitor who taps through it cannot get it back, and nobody
 * arrives at one ten times in a row. An opening plays on every page load.
 *
 * REDUCED MOTION STILL SKIPS IT OUTRIGHT, and that preference rather than the
 * button is the real accessibility guarantee. A visitor who has asked for it
 * never sees this at all and loses nothing they needed, since the welcome
 * overlay carries the objective either way, and now carries the Martian's line
 * as a quote as well. Reduced EFFECTS thins the squadron to five ships instead
 * of nine, which is how that control behaves everywhere else in this
 * experience.
 *
 * IT IS SILENT. This plays before the visitor has clicked anything, so there is
 * no gesture, no audio context, and nothing we could ethically do about it.
 */

import { EARTHDEFENSE_CONFIG, spawnPosition } from './config.min.js';
import { orbitEye, smoothstep } from './replay.min.js';
import {
    createRaiderMesh, hashUnit, fleetStartAnchor, approachDirection
} from './fleet.min.js';
import {
    createMartianPod, updateMartian, resetMartian, disposeMartian
} from './martian.min.js';

const WORLD_UP = { x: 0, y: 1, z: 0 };

// How far ahead of the spawn point its look target sits. Matched to
// `placeCameraAtSpawn` in world.js, which looks 1,000 units down -Z, so the
// last frame of this shot and the first frame of the briefing agree exactly.
const SPAWN_LOOK_AHEAD = 1000;

let cfg = null;
let group = null;
let host = null;
let squadron = [];
let activeCount = 0;

const shot = { running: false, elapsed: 0, seconds: 0 };

// The frame the whole shot is built in, solved once when it starts.
const spawnAt = { x: 0, y: 0, z: 0 };
// The point the real fleet's trailing group starts from. The formation arrives
// here on the last frame and the camera stands `range` ahead of it, so this one
// vector places both.
const anchor = { x: 0, y: 0, z: 0 };
// The formation's own axes: where it is heading, and right and up beside that.
const nose = { x: 0, y: 0, z: 1 };
const right = { x: 1, y: 0, z: 0 };
const above = { x: 0, y: 1, z: 0 };
// Where the formation sits before it starts drifting.
const base = { x: 0, y: 0, z: 0 };

const eye = { x: 0, y: 0, z: 0, look: { x: 0, y: 0, z: 0 } };
const heading = { x: 0, y: 0, z: 1 };
// `introPath` is called a few thousand times by the suite and once a frame by
// the game, so its two axes are solved into these rather than allocated.
const pathSide = { x: 0, y: 0, z: 0 };
const pathUp = { x: 0, y: 0, z: 0 };
const pathRight = { x: 0, y: 0, z: 0 };
// Where the leader is this frame, and the eye that frames them. Solved into
// these for the same reason as the axes above: `introPath` is sampled a few
// thousand times by the suite.
const pathLeader = { x: 0, y: 0, z: 0 };
const pathFace = { x: 0, y: 0, z: 0 };
const pathClose = { x: 0, y: 0, z: 0 };

// ---- Pure core --------------------------------------------------------------

/** Where the `index`th ship sits in the finished wedge, in the formation's own
 *  axes: `right` across, `up` above the leader, `back` behind them.
 *
 *  Ship zero is the apex and every ship after it is one of a pair, so rank one
 *  is ships 1 and 2, rank two is 3 and 4, and so on. Odd indices go left.
 *
 *  THE WEDGE RISES AS IT WIDENS, which is the only reason `up` is here. A flat
 *  V is a straight line from any viewpoint level with it, and this shot watches
 *  the formation from close to head-on: without the rise the outer pairs would
 *  spend the whole form-up sliding along behind the inner ones. A little height
 *  per rank makes it read as a shape from every angle the drift passes through. */
export function wedgeSlot(index, slot, out = { right: 0, up: 0, back: 0 }) {
    const i = Math.max(0, index | 0);
    const rank = Math.ceil(i / 2);
    const sign = i === 0 ? 0 : (i % 2 === 1 ? -1 : 1);
    out.right = sign * rank * (slot.lateral || 0);
    out.up = rank * (slot.vertical || 0);
    out.back = rank * (slot.depth || 0);
    return out;
}

/** How far the `index`th ship has closed up, 0 at its start and 1 in its slot.
 *
 *  A SHIP DOES NOT SPEND THE WHOLE FORM-UP MOVING. It spends `shipTravel` of it
 *  moving and the rest waiting its turn, and the turns are spread so the last
 *  ship arrives exactly as the form-up ends. Nine ships all easing over the same
 *  three seconds is nine things happening at once, which reads as a swarm
 *  settling; nine ships arriving in sequence reads as a formation being made.
 *
 *  The apex goes first and the outer pairs close on it, because a wedge is
 *  built from its leader outward and because it gives the shot somewhere
 *  settled to look while the rest of it is still happening. */
export function shipProgress(index, total, elapsed, formSeconds, shipTravel) {
    const form = Math.max(0.05, formSeconds || 0);
    const travel = form * Math.min(1, Math.max(0.05, shipTravel || 1));
    const count = Math.max(1, total | 0);
    const delay = count > 1
        ? (Math.min(index, count - 1) / (count - 1)) * (form - travel)
        : 0;
    return smoothstep((elapsed - delay) / travel);
}

/** Where ship zero is at any moment of the shot: the apex of the V, and the
 *  raider the Martian commander is flying.
 *
 *  THE PUSH-IN TRACKS THIS RATHER THAN THE ANCHOR, which is the whole reason it
 *  is a function. The formation drifts forward for the entire shot, so the
 *  leader is only AT the anchor on the very last frame; through the close-up it
 *  is still hundreds of units short of it and still moving. A camera parked off
 *  the anchor would watch the commander swim toward it.
 *
 *  Ship zero has no slot offset and is first to close up (`shipProgress` gives
 *  the apex no delay), so past `formSeconds * shipTravel` its scatter is spent
 *  and this is exact rather than approximate. The close-up never starts before
 *  then, which `tests/earthdefense-intro` pins. */
export function leaderAt(elapsed, spec, subject, forward, out = { x: 0, y: 0, z: 0 }) {
    const seconds = Math.max(0.1, spec.seconds || 5);
    const t = Math.min(Math.max(elapsed, 0), seconds);
    // Run backwards from the arrival, exactly as `startIntro` places the
    // formation: the leader ends on the anchor, so at `t` it is the remaining
    // drift short of it.
    const left = (spec.driftSpeed || 0) * (seconds - t);
    out.x = subject.x - forward.x * left;
    out.y = subject.y - forward.y * left;
    out.z = subject.z - forward.z * left;
    return out;
}

/** The camera, for any moment of the shot.
 *
 *  FOUR BEATS AND ONE MOVE. The squadron forms up, the camera pushes in on the
 *  commander flying the apex ship, holds while they speak, and then retreats
 *  all the way to the spawn point. No cut anywhere, and the last frame IS the
 *  frame the visitor flies away from.
 *
 *  IT IS TWO SOLVED EYES AND TWO BLENDS, not four branches, which is what makes
 *  the joins invisible. The WIDE eye orbits the anchor at `range` for the whole
 *  shot; the CLOSE eye orbits the leader at `closeRange` for the whole shot;
 *  `closeU` crosses from one to the other and `moveU` crosses from wherever
 *  that has reached to the spawn point. The hold is not a beat in the code at
 *  all, it is simply the gap between the two blends finishing and starting, so
 *  retiming it cannot introduce a seam.
 *
 *  IT ORBITS THE FORMATION, NOT THE PLANET, which is the change that let
 *  `swing` stop being an apology. Orbiting Mars walked the squadron out of the
 *  frame, because the nearer thing leaves first, so the drift had to be kept
 *  tiny for a reason that had nothing to do with how much life the shot wanted.
 *  Around the formation the subject holds still and the background slides.
 *
 *  THE CLOSE EYE STANDS OFF THE NOSE, NOT ON IT. `closeSwing` and
 *  `closeElevation` put it a little to one side and a little above, so the shot
 *  is a three-quarter view of somebody in a cockpit rather than a mugshot, and
 *  so the raider's own nose is not between the camera and the face.
 *
 *  THE LOOK TARGET IS PART ABSOLUTE AND PART RELATIVE, on purpose. It crosses
 *  the anchor, then the leader, then a point `SPAWN_LOOK_AHEAD` down -Z FROM
 *  WHEREVER THE CAMERA IS, which is a moving one. That last part is what makes
 *  the final frame exact rather than nearly right: at the end of the blend the
 *  camera is at the spawn point looking 1,000 units down -Z, which is
 *  `placeCameraAtSpawn` word for word, whatever the numbers above it have been
 *  retuned to.
 *
 *  Takes its subjects as plain vectors so the whole path can be sampled against
 *  the planets in a test without a renderer, which is the only way the clearance
 *  margin is worth anything. Note that Mars is NOT among them: the shot is
 *  placed entirely off the fleet's own anchor and heading, and Mars filling the
 *  frame behind it is a property of where config.js puts Mars. */
export function introPath(elapsed, spec, subject, forward, spawn, out = { x: 0, y: 0, z: 0, look: { x: 0, y: 0, z: 0 } }) {
    const seconds = Math.max(0.1, spec.seconds || 5);
    const form = Math.max(0, spec.formSeconds || 0);
    const close = Math.max(0.1, spec.closeSeconds || 1);
    const hold = Math.max(0, spec.holdSeconds || 0);
    const run = Math.max(0.1, spec.runSeconds || 1);
    const t = Math.min(Math.max(elapsed, 0), seconds);

    // The camera stands AHEAD of the squadron, which is `range` along the
    // heading, and looks back down it. It orbits about the formation's own up
    // axis: taking that axis from `formationFrame` rather than from the world
    // keeps `orbitEye`'s side and axis exactly perpendicular, so `range` means
    // `range`. The old code flattened its side vector into the equatorial plane
    // to get the same guarantee and quietly lost a percent of its distance.
    normalise(pathSide, forward.x, forward.y, forward.z);
    formationFrame(forward, pathRight, pathUp);
    orbitEye(subject, pathUp, pathSide, spec.range || 4000,
        (spec.swing || 0) * smoothstep(t / seconds), spec.elevation || 0, out);

    // WHERE THE FACE IS, WHICH IS NOT WHERE THE SHIP IS, and this offset is the
    // whole of a bug worth not reintroducing. `leaderAt` gives the hull's
    // origin; the commander's dome is mounted `closeSubjectAhead` further along
    // the nose, which is TOWARD the camera. Orbiting the origin at 240 units
    // therefore put the eye 142 units from the dome and its nearest glass 82
    // units away, inside the 100 unit near plane, so the canopy was sliced open
    // with the commander visible through the hole. `closeRange` now measures
    // from the thing being framed, which is also the only reading of it that
    // makes the framing arithmetic in config.js true.
    leaderAt(t, spec, subject, forward, pathLeader);
    const ahead = spec.closeSubjectAhead || 0;
    pathFace.x = pathLeader.x + forward.x * ahead;
    pathFace.y = pathLeader.y + forward.y * ahead;
    pathFace.z = pathLeader.z + forward.z * ahead;
    orbitEye(pathFace, pathUp, pathSide, spec.closeRange || 240,
        spec.closeSwing || 0, spec.closeElevation || 0, pathClose);

    // THE DEPARTURE IS MEASURED BACK FROM THE END, not forward from the hold,
    // and that is the one line in here protecting the property the whole shot
    // exists for. Timed forward as `form + close + hold`, the camera reaches
    // the spawn point only if those three plus `run` happen to equal `seconds`:
    // a config whose beats do not partition the shot would stop the pull-back
    // half way and the welcome screen would come up over a frame the visitor is
    // not about to fly from, silently. Anchored to `seconds - run` the last
    // frame is the spawn frame whatever the other numbers say. The shipped
    // config does add up, and `the config adds up` still asserts it, but that
    // is now a statement of intent rather than the thing holding the seam
    // together.
    const leave = Math.max(0, seconds - run);
    const closeU = smoothstep((t - form) / close);
    const moveU = smoothstep((t - leave) / run);
    // Both look blends lead their move slightly, so the camera finishes turning
    // toward where it is going before it finishes getting there rather than
    // being dragged round after it has arrived.
    const closeLookU = smoothstep((t - form + (spec.lookLead || 0)) / close);
    const lookU = smoothstep((t - leave + (spec.lookLead || 0)) / run);

    // The push-in. At closeU 0 this is pure wide orbit and at 1 it is exactly
    // the close eye, so neither end of the blend has a seam in it.
    out.x += (pathClose.x - out.x) * closeU;
    out.y += (pathClose.y - out.y) * closeU;
    out.z += (pathClose.z - out.z) * closeU;

    // ...and the departure, from wherever the push-in left the camera.
    out.x += (spawn.x - out.x) * moveU;
    out.y += (spawn.y - out.y) * moveU;
    out.z += (spawn.z - out.z) * moveU;

    // The look target, across the same three subjects in the same order.
    const lx = subject.x + (pathFace.x - subject.x) * closeLookU;
    const ly = subject.y + (pathFace.y - subject.y) * closeLookU;
    const lz = subject.z + (pathFace.z - subject.z) * closeLookU;
    out.look.x = lx + (out.x - lx) * lookU;
    out.look.y = ly + (out.y - ly) * lookU;
    out.look.z = lz + ((out.z - SPAWN_LOOK_AHEAD) - lz) * lookU;
    return out;
}

/** Right and up beside a heading, so a formation has axes to be laid out in.
 *
 *  Falls back to the world's X when the heading is straight up or down, which
 *  nothing in this shot does but which would otherwise be a silent zero vector
 *  and a formation collapsed onto a point. */
export function formationFrame(forward, outRight = { x: 0, y: 0, z: 0 }, outUp = { x: 0, y: 0, z: 0 }) {
    let rx = WORLD_UP.y * forward.z - WORLD_UP.z * forward.y;
    let ry = WORLD_UP.z * forward.x - WORLD_UP.x * forward.z;
    let rz = WORLD_UP.x * forward.y - WORLD_UP.y * forward.x;
    if (Math.hypot(rx, ry, rz) < 1e-6) { rx = 1; ry = 0; rz = 0; }
    normalise(outRight, rx, ry, rz);
    normalise(outUp,
        forward.y * outRight.z - forward.z * outRight.y,
        forward.z * outRight.x - forward.x * outRight.z,
        forward.x * outRight.y - forward.y * outRight.x);
    return outRight;
}

/** The direction the fleet is travelling: out of Mars and toward Earth, along
 *  the same tilted approach line the real raiders fly in on.
 *
 *  `approachDirection`'s vector reversed, rather than the trigonometry written
 *  down a second time. `approach` describes where the fleet STARTS, measured
 *  outward from Earth; this is the way it then flies. Delegating matters more
 *  than it looks: the camera is placed off this heading and the raiders are
 *  placed off that direction, so the two drifting apart would put the shot back
 *  where it started, framed on a fleet standing somewhere else. */
export function approachHeading(approach, out = { x: 0, y: 0, z: 1 }) {
    approachDirection(approach, out);
    return normalise(out, -out.x, -out.y, -out.z);
}

// ---- Setup ------------------------------------------------------------------

/** Build the squadron and hang it in the scene, hidden.
 *
 *  MUST BE CALLED AFTER `initFleet`, because every hull here comes out of the
 *  fleet's shared geometry. That is an ordering rule rather than a check, and
 *  main.js honours it by initialising this last in `startCombat`. If the fleet
 *  is not there yet `createRaiderMesh` returns null and this returns false,
 *  which costs the opening shot and nothing else. */
export function initIntro(scene, config = EARTHDEFENSE_CONFIG) {
    disposeIntro(scene);
    cfg = (config && config.intro) || null;
    if (!cfg) return false;
    if (typeof THREE === 'undefined' || !THREE.Group) return false;

    approachHeading(config.fleet && config.fleet.approach, nose);
    formationFrame(nose, right, above);

    group = new THREE.Group();
    group.name = 'intro';
    group.visible = false;

    const total = Math.max(1, cfg.ships || 9);
    const s = cfg.scatter || {};
    for (let i = 0; i < total; i++) {
        const mesh = createRaiderMesh(`intro-raider-${i}`);
        if (!mesh) { group = null; return false; }
        group.add(mesh);
        squadron.push({
            index: i,
            mesh,
            slot: wedgeSlot(i, cfg.slot || {}),
            // Deterministic, from the ship's index, exactly like the real
            // fleet's own scatter. BIASED INTO DEPTH: `back` is always positive,
            // so a ship starts somewhere behind the formation and closes
            // forward into it, which is what reads as forming up. A ship that
            // started in front would have to reverse into its slot.
            scatter: {
                right: hashUnit(i * 5 + 1) * (s.lateral || 0),
                up: hashUnit(i * 5 + 2) * (s.vertical || 0),
                back: Math.abs(hashUnit(i * 5 + 3)) * (s.depth || 0)
            },
            // Which way it is pointing before it settles onto the fleet's
            // heading. Derived from the same index so the noses come round the
            // same way every time.
            tilt: {
                x: hashUnit(i * 11 + 7),
                y: hashUnit(i * 11 + 8),
                z: hashUnit(i * 11 + 9)
            }
        });
    }
    activeCount = squadron.length;
    mountCommander(config);

    if (scene && typeof scene.add === 'function') { host = scene; scene.add(group); }
    return true;
}

/** Put the Martian commander in the apex ship's nose.
 *
 *  PARENTED TO SHIP ZERO, which is the whole trick and is why this is four
 *  lines rather than a module with its own update. A child of the leader's mesh
 *  inherits its position, its heading and its LOD visibility for free, so the
 *  commander forms up with the squadron, drifts with it and is framed by
 *  `closeRange` off `leaderAt` without anybody having to place them.
 *
 *  AT THE NOSE, AND NOT ON TOP. The hull is a four-sided cone with its apex at
 *  +Z, so a dome anywhere behind the tip has the tip in front of it, and the
 *  camera would be looking at a face through a spike. Centred ON the apex the
 *  dome swallows the front of the cone instead, and nothing in the ship is
 *  between the eye and the commander. The dome's own interior shell handles the
 *  wing, which is behind them.
 *
 *  A FAILURE HERE COSTS THE MONOLOGUE AND NOTHING ELSE. The shot still plays,
 *  the caption still runs, and the apex is simply a plain raider. */
function mountCommander(config) {
    const leader = squadron.length ? squadron[0].mesh : null;
    if (!leader) return false;
    const pod = createMartianPod(config);
    if (!pod) return false;
    const hullLength = (config.fleet && config.fleet.hullLength) || 220;
    pod.position.z = hullLength * 0.5;
    leader.add(pod);
    return true;
}

export function disposeIntro(scene) {
    const target = scene || host;
    if (group && target && typeof target.remove === 'function') target.remove(group);
    // NOTHING IS DISPOSED HERE, and that is not an omission. Every hull in the
    // squadron shares fleet.js's geometry and material, which `disposeFleet`
    // owns and which the real twelve raiders are still using. Disposing them
    // from this side would leave the fleet drawing from freed buffers.
    // BEFORE THE GROUP GOES. The pod is a child of ship zero's mesh, and
    // everything in it is ours to free (unlike the hulls, which borrow the
    // fleet's buffers and must not be disposed from this side).
    disposeMartian();
    group = null;
    host = null;
    squadron = [];
    activeCount = 0;
    cfg = null;
    shot.running = false;
    shot.elapsed = 0;
    shot.seconds = 0;
}

/** Fewer ships, in the same "built full, partly used" spirit as the starfield
 *  and the flare pool. It THINS rather than removes, because that is what the
 *  effects checkbox means everywhere else in this experience. */
export function setIntroReduced(on) {
    if (!cfg || !squadron.length) return activeCount;
    activeCount = on
        ? Math.min(squadron.length, Math.max(1, cfg.reducedShips || 5))
        : squadron.length;
    for (let i = 0; i < squadron.length; i++) {
        squadron[i].mesh.visible = i < activeCount;
    }
    return activeCount;
}

// ---- Starting the shot ------------------------------------------------------

/** Begin the opening shot.
 *
 *  Takes nothing but the config, because there is nothing else to take any
 *  more. The anchor and the heading both come from `config.fleet`, and the
 *  camera is placed off those, so this can be driven end to end in a test with
 *  no world, no bodies and no renderer.
 *
 *  Returns the length of the shot in seconds, or 0 if it cannot run. */
export function startIntro(config = EARTHDEFENSE_CONFIG) {
    if (!cfg || !group) return 0;

    const p = spawnPosition(config);
    spawnAt.x = p.x; spawnAt.y = p.y; spawnAt.z = p.z;

    // Where the trailing group of real raiders stands. The camera is placed off
    // this and the formation arrives on it, which is the whole of the fix that
    // put the wedge and the hostile markers in the same place.
    fleetStartAnchor(config, anchor);

    // THE FORMATION IS RUN BACKWARDS FROM ITS ARRIVAL. It drifts forward for
    // the whole shot, so it opens the entire drift behind the anchor in order
    // to finish exactly on it: the frame that has to be right is the last one,
    // where the wedge hands over to the markers. Ship zero has no slot offset,
    // so ship zero lands on the anchor to the unit.
    const drift = (cfg.driftSpeed || 0) * Math.max(0.1, cfg.seconds || 5);
    base.x = anchor.x - nose.x * drift;
    base.y = anchor.y - nose.y * drift;
    base.z = anchor.z - nose.z * drift;

    shot.running = true;
    shot.elapsed = 0;
    shot.seconds = Math.max(0.1, cfg.seconds || 5);
    if (group) group.visible = true;
    // Mouth shut and the line unsaid, so a second boot does not open on a
    // half-open jaw or skip the announcement.
    resetMartian();
    writeShips();
    writeEye();
    return shot.seconds;
}

/** Stop the shot and leave nothing on screen. Called by `updateIntro` when the
 *  path runs out, and by a failed start unwinding, so the briefing can never
 *  open with nine spare raiders parked at Mars. */
export function endIntro() {
    shot.running = false;
    shot.elapsed = shot.seconds;
    if (group) group.visible = false;
    return true;
}

// ---- One frame --------------------------------------------------------------

/** Advance the shot: close the formation up, drift it, place the camera.
 *
 *  On the frame clock like everything else timed here, so a visitor who opens
 *  the page in a background tab does not come back to a welcome screen that
 *  never arrived. Returns whether it is still running. */
export function updateIntro(deltaTime) {
    if (!shot.running) return false;
    shot.elapsed += deltaTime || 0;
    if (shot.elapsed >= shot.seconds) {
        // Clamped to the end and written once more before stopping, so the last
        // thing this module computes is the end of the path rather than
        // wherever a long frame happened to land past it.
        //
        // THE HANDOVER IS SEAMLESS BECAUSE THE TWO CAMERAS AGREE, not because
        // this frame is held. The moment the shot stops, `introEye` returns null
        // and main.js falls back to the flight model, which has been sitting
        // paused at `spawnPosition` with no yaw and no pitch since the world was
        // built. That is the same position and the same orientation the path
        // ends on, to the decimal, which is the whole point of the shot and what
        // `tests/earthdefense-intro.test.mjs` checks first.
        shot.elapsed = shot.seconds;
        writeShips();
        writeEye();
        endIntro();
        return false;
    }
    writeShips();
    writeEye();
    return true;
}

/** Every ship, this frame. Slot plus a scatter that decays to nothing.
 *
 *  The scatter is subtracted rather than the position being interpolated
 *  between two points, which is the same arithmetic and one fewer thing to hold:
 *  a ship IS at its slot, displaced by however much of its start offset it has
 *  not yet worked off. When `p` reaches 1 the displacement is exactly zero, so
 *  the formation is exact rather than very nearly exact. */
function writeShips() {
    if (!group) return;
    // The whole formation is under way for the length of the shot, so the
    // opening never settles into a photograph even after the last ship arrives.
    const travelled = (cfg.driftSpeed || 0) * shot.elapsed;
    const ox = base.x + nose.x * travelled;
    const oy = base.y + nose.y * travelled;
    const oz = base.z + nose.z * travelled;

    for (let i = 0; i < activeCount; i++) {
        const ship = squadron[i];
        const p = shipProgress(i, activeCount, shot.elapsed, cfg.formSeconds, cfg.shipTravel);
        const left = 1 - p;
        const r = ship.slot.right + ship.scatter.right * left;
        const u = ship.slot.up + ship.scatter.up * left;
        const b = ship.slot.back + ship.scatter.back * left;

        const x = ox + right.x * r + above.x * u - nose.x * b;
        const y = oy + right.y * r + above.y * u - nose.y * b;
        const z = oz + right.z * r + above.z * u - nose.z * b;
        ship.mesh.position.set(x, y, z);

        // The nose comes round as the ship closes up, so a formation that has
        // not formed yet also does not point the same way yet. Normalised
        // rather than slerped: these are all within a radian of each other, and
        // the difference is not visible at 40 pixels a hull.
        const scale = (cfg.headingScatter || 0) * left;
        normalise(heading,
            nose.x + ship.tilt.x * scale,
            nose.y + ship.tilt.y * scale,
            nose.z + ship.tilt.z * scale);
        ship.mesh.lookAt(x + heading.x, y + heading.y, z + heading.z);
    }
}

function writeEye() {
    introPath(shot.elapsed, cfg, anchor, nose, spawnAt, eye);
    // THE COMMANDER IS ON THE SHOT'S CLOCK, NOT ITS OWN. One elapsed time
    // drives the camera, the formation and the mouth, so a long frame, a stall
    // and a skip can never leave the words and the lips in different places.
    updateMartian(shot.elapsed);
}

// ---- What the caller reads --------------------------------------------------

/** The eye this shot wants, or null when it is not running. Reused between
 *  frames, so read it rather than hold it. */
export function introEye() { return shot.running ? eye : null; }

export function isIntroRunning() { return shot.running; }

// ---- Small helpers ----------------------------------------------------------

function normalise(out, x, y, z) {
    const length = Math.hypot(x, y, z);
    if (length < 1e-9) { out.x = 0; out.y = 0; out.z = 1; return out; }
    out.x = x / length; out.y = y / length; out.z = z / length;
    return out;
}

export const __test__ = {
    shot, eye, base, nose, right, above, anchor, spawnAt,
    squadron: () => squadron,
    activeCount: () => activeCount,
    group: () => group,
    SPAWN_LOOK_AHEAD
};
