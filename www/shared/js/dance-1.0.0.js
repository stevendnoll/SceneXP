// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * dance.js - the shared person, dancing: eight dances a body says with its
 * arms, hips and head, and the joints the shared rig needs to dance them.
 *
 * PROMOTED FROM www/derby on 2026-10-20 (Steve: "we're going to incorporate
 * dancing in other scenes"), where the winning family's grown-up dances
 * after the last heat. Derby Day keeps only what is its own (dressing a
 * crowd member as the dancer, who in a family dances, standing in for the
 * baked crowd): www/derby/js/dancer.js.
 *
 * TWO HALVES, EACH USABLE ALONE.
 *
 *   The choreography (pure): `DANCES`, `danceAt(dance, t)` (a full pose at
 *   any moment), `pickDance` and `pickDances`, `danceOf`, `loopOf`, `pose`
 *   and `mirror` for writing new dances, and `blendPoses` for easing from
 *   any pose into a dance.
 *
 *   The jointing (three): `jointPerson(person)` takes a figure straight from
 *   people-1.0.0's `createPerson` and gives it a waist at the hips and a
 *   neck, each child kept exactly where it was; `applyPose(rig, pose, at)`
 *   puts it in a pose standing at a spot; `bakeJoints(rig)` merges it to
 *   one mesh a joint (about nine draw calls, not forty), for a scene with
 *   several dancers. `createDancers` keeps a scene's dancers (built ahead,
 *   in step, eased in), `dressedPerson` dresses one from a crowd member's
 *   look, and `screenPoint`, `boxOnScreen`, `figureBox` and `pickInView`
 *   choose who in a crowd can dance where a camera sees them. Nothing in
 *   people-1.0.0 changes:
 *   what is found is found by the rig's own tags (isArm, isLeg, forearm) and
 *   by where each child is drawn, never by its order.
 *
 * ARMS, HIPS AND A HEAD, NO KNEES. The shared person bends at the
 * shoulders, the elbows and the hips; the waist and the neck are this
 * module's. There is no knee and no spine to ripple, so the Moonwalk, the
 * Running Man and the Worm are not here. A knee in people-1.0.0 would need a
 * sweep of every scene that finds leg parts by height first.
 *
 * A DANCE IS A LOOP OF POSES, one a beat, each held for a share of its beat
 * (`hold`) and eased into over the rest, so a move hits its pose on the
 * beat the way a dancer does. The Robot holds longest, so it snaps. A pose
 * names only the joints it moves; every other joint is at rest. A "via" key
 * (`via: true`) is passed through without stopping, to take an arm round
 * the body rather than through it.
 *
 * THE JOINTS (radians; meters for `root`). "L" and "R" are the dancer's
 * own left and right (the rig faces +z, its left is +x), so a dance reads
 * the same on any figure, and a mirrored pose (`mirror`) is the same move
 * on the other side.
 *
 *   root   x, y, z   a step, a bounce (y), from where the figure stands
 *          ry        a turn (positive turns to the dancer's left)
 *          rx, rz    a lean from the feet (rx forward, rz to the right)
 *   waist  x, y, z   a bow forward, a twist to the left, a bend to the right
 *   neck   x, y, z   a nod forward, a turn to the left, a tilt to the right
 *   armL, armR       x: negative raises the arm forward (-1.57 straight
 *                    ahead); z: out to the side (1.57 level, pi straight
 *                    up, past pi leaning in over the head, negative across
 *                    the body); y: a twist along the arm, which turns the
 *                    way the elbow bends; fore: negative bends the elbow
 *   legL, legR       x: negative kicks forward; z: out to the side
 *
 * THE ARMS TURN TWIST FIRST: an arm's rotation order is XZY, so `y` happens
 * before the swing out and the swing forward. With no twist it is the very
 * rotation crowd-1.0.0's baked poses use.
 *
 * The contact poses (a hand on a shoulder, a hip, the head) were solved
 * against the real rig from hand and elbow targets and are measured in
 * tests/shared-dance.test.mjs, with every dance drawn pose by pose and in
 * motion by scripts/dance-preview.mjs.
 *
 * Writing a dance: start from targets (where each hand and elbow should
 * be), solve the angles against the real rig rather than guessing (a guessed
 * twist bends the elbow the wrong way), then draw it with the preview
 * script, in motion as well as pose by pose.
 */

import { mergePieces, lighter } from './crowd-1.0.0.min.js';
import { createPerson } from './people-1.0.0.min.js';

/** Every joint at rest: the arms as the shared rig hangs them. */
export const REST = Object.freeze({
    root: Object.freeze({ x: 0, y: 0, z: 0, ry: 0, rx: 0, rz: 0 }),
    waist: Object.freeze({ x: 0, y: 0, z: 0 }),
    neck: Object.freeze({ x: 0, y: 0, z: 0 }),
    armL: Object.freeze({ x: 0.1, z: 0.15, y: 0, fore: 0 }),
    armR: Object.freeze({ x: 0.1, z: 0.15, y: 0, fore: 0 }),
    legL: Object.freeze({ x: 0, z: 0 }),
    legR: Object.freeze({ x: 0, z: 0 })
});

const PARTS = Object.keys(REST);

/** A pose: `spec`'s joints over rest. */
export function pose(spec = {}) {
    const out = {};
    for (const part of PARTS) out[part] = { ...REST[part], ...(spec[part] || {}) };
    return out;
}

/** The same move on the other side: left and right swapped, and every
 *  turn, bend and step sideways the other way. */
export function mirror(spec) {
    const flip = (j, keys) => {
        if (!j) return undefined;
        const out = { ...j };
        for (const k of keys) if (out[k] !== undefined) out[k] = -out[k];
        return out;
    };
    const out = {};
    if (spec.root) out.root = flip(spec.root, ['x', 'ry', 'rz']);
    if (spec.waist) out.waist = flip(spec.waist, ['y', 'z']);
    if (spec.neck) out.neck = flip(spec.neck, ['y', 'z']);
    if (spec.armR) out.armL = { ...spec.armR };
    if (spec.armL) out.armR = { ...spec.armL };
    if (spec.legR) out.legL = { ...spec.legR };
    if (spec.legL) out.legR = { ...spec.legL };
    return out;
}

// ---- The moves ---------------------------------------------------------------

/** Arms bent at the sides, a groove between the big moves. */
const GROOVE = { armL: { x: -0.35, z: 0.3, fore: -1.5 }, armR: { x: -0.35, z: 0.3, fore: -1.5 } };

/** A hand flat on the hip, the elbow out (solved against the rig). */
const HAND_ON_HIP = { x: 0.2, z: 0.82, y: -1.18, fore: -1.57 };

// The Robot: forearms level, each move a snap, the head turning with it.
const ROBOT_BOX = { armL: { x: 0, z: 0.12, fore: -1.57 }, armR: { x: 0, z: 0.12, fore: -1.57 } };
const ROBOT_POST = { armR: { x: 0, z: 1.57, y: 1.57, fore: -1.57 }, armL: { x: 0, z: 0.12, fore: -1.57 }, neck: { y: -0.6 }, waist: { y: -0.15 } };

// The Chicken Dance's four parts: the beaks, the wings, the tail, the claps.
const BEAK = { x: -1.25, z: 0.15, y: -0.98, fore: -0.8 };
const BEAK_OPEN = { armL: BEAK, armR: BEAK, neck: { x: -0.15 } };
const BEAK_SHUT = { armL: { ...BEAK, z: 0.05, fore: -1.1 }, armR: { ...BEAK, z: 0.05, fore: -1.1 }, neck: { x: 0.2 } };
const WING = { x: 0.26, z: 0.41, y: -0.28, fore: -2.51 };
const WING_IN = { armL: WING, armR: WING, neck: { x: 0.15 } };
const WING_UP = { x: -0.02, z: 1.05, y: -0.56, fore: -2.53 };
const WING_OUT = { armL: WING_UP, armR: WING_UP, neck: { x: -0.1 }, root: { y: 0.03 } };
const TAIL = { waist: { x: 0.45, z: 0.12 }, root: { rz: 0.06 }, armL: { x: 0.5, z: 0.35 }, armR: { x: 0.5, z: 0.35 }, neck: { x: -0.35 } };
const CLAP = { armL: { x: -0.95, z: -0.55, fore: -1.25 }, armR: { x: -0.95, z: -0.55, fore: -1.25 } };
const APART = { armL: { x: -0.95, z: -0.1, fore: -1.25 }, armR: { x: -0.95, z: -0.1, fore: -1.25 } };

// The YMCA, each letter held: Y up in a V, M the hands on the head, C to the
// right, A the hands meeting overhead.
const Y = { armL: { x: -0.2, z: 2.55 }, armR: { x: -0.2, z: 2.55 }, root: { y: 0.03 } };
const ON_HEAD = { x: -0.02, z: 2.7, y: 1.48, fore: -1.49 };
const M = { armL: ON_HEAD, armR: ON_HEAD, neck: { x: 0.1 } };
// The C (Steve's QA, 2026-10-20: it read as a hand to the forehead): a lean
// to the right, the left arm arched up over the head and the right curved
// out below, the body the C's back, open to the audience's right.
const C_ = { armL: { x: 0.64, z: 3.21, y: 2.47, fore: -1.11 }, armR: { x: 0.1, z: 1.52, y: -1.07, fore: -2.06 }, waist: { z: 0.3 }, neck: { z: 0.1 } };
// The A: both arms all but straight, leaning in past upright (z beyond pi)
// to hands meeting over the head (the same QA: it was a narrow V).
const PEAK = { x: 0, z: 3.39, y: 0.46, fore: -0.31 };
const A = { armL: PEAK, armR: PEAK, root: { y: 0.03 } };

// The Macarena, one arm then the other.
const MAC = {
    // Out in front, a little apart, so the arms read from the front rather
    // than pointing straight at the camera (Steve's QA, 2026-10-20).
    out: { x: -1.5, z: 0.3, y: 0, fore: 0 },
    // Palm up: the hand is the same either way round, so the twist goes
    // the way the next move (to the shoulder) turns.
    up: { x: -1.5, z: 0.3, y: -1.57, fore: 0 },
    // The first hand to the other shoulder, then the second over it.
    shoulder: { x: -1.16, z: -0.32, y: -1.42, fore: -1.66 },
    over: { x: -1.25, z: -0.3, y: -1.35, fore: -1.55 },
    // Up in front and over, so the arm hardly turns on the way.
    head: { x: -3.25, z: 0.47, y: -1.19, fore: -1.79 },
    hipFront: { x: -0.52, z: 0.04, y: -1.79, fore: -1.1 },
    hipBack: { x: 0.5, z: 0.24, y: -1.11, fore: -0.83 },
    // On the way down from the head: out at the side, the elbow bent.
    down: { x: -1.9, z: 0.3, y: -1.5, fore: -1.45 },
    // On the way from the front of the hip to the back: out at the side.
    side: { x: 0.05, z: 0.55, y: -1.4, fore: -0.9 }
};
const macStep = (armR, armL, extra = {}) => ({ ...extra, armR, ...(armL ? { armL } : {}) });

// The Floss: each arm swings across the front, then behind on its own side,
// the hips the other way.
const FLOSS_L = { armR: { x: -0.75, z: -0.62 }, armL: { x: 0.6, z: 0.55 }, root: { x: -0.09, rz: -0.05 }, waist: { z: 0.16 } };
const FLOSS_MID = { armR: { x: 0, z: 0.3 }, armL: { x: 0, z: 0.3 } };

// The Sprinkler: a hand behind the head, the other arm ticking round.
/** The change of hands, each arm half way: the one behind the head coming
 *  down to the front, the one in front going up. */
const SWAP = { armL: { x: -2.37, z: 0.13, y: -0.6, fore: -0.97 }, armR: { x: -2.37, z: 0.43, y: -0.6, fore: -0.97 }, via: true, beats: 0.75 };
const SPRINKLE = (z, turn) => ({ armL: MAC.head, armR: { x: -1.5, z, fore: -0.15 }, root: { ry: turn }, neck: { y: -turn * 0.5 } });

// The Disco Point: up to the right, down across to the left, a hand on the hip.
const DISCO_UP = { armR: { x: -0.25, z: 2.45 }, armL: HAND_ON_HIP, neck: { y: -0.4, x: -0.2 }, root: { x: -0.04, rz: -0.05 }, waist: { z: -0.08 } };
const DISCO_DOWN = { armR: { x: -0.8, z: -0.72 }, armL: HAND_ON_HIP, neck: { y: 0.35, x: 0.2 }, root: { x: 0.04, rz: 0.05 }, waist: { z: 0.08 } };

// The Dab: the face into one elbow, the other arm out straight and up.
const DAB = { armL: { x: -2.33, z: -0.47, y: -1.06, fore: -0.62 }, armR: { x: -0.25, z: 2.05 }, neck: { x: 0.45, y: 0.35, z: -0.2 }, waist: { z: -0.12, x: 0.1 } };

/**
 * THE DANCES. `name` is how a scene says it ("the Robot", the real song
 * names for the YMCA and the Macarena, Steve 2026-10-20), `beat` the seconds
 * a pose, `hold` the share of each beat held still, `bounce` meters of a
 * bounce between poses, and `keys` the loop of poses.
 */
export const DANCES = Object.freeze([
    {
        id: 'robot', name: 'the Robot', beat: 0.48, hold: 0.62, bounce: 0,
        keys: [ROBOT_BOX, ROBOT_POST, ROBOT_BOX, mirror(ROBOT_POST),
            { armL: { x: 0, z: 1.57, y: 1.57, fore: -1.57 }, armR: { x: 0, z: 1.57, y: 1.57, fore: -1.57 } },
            { armL: { x: 0, z: 1.57, y: 1.57, fore: 0 }, armR: { x: 0, z: 1.57, y: 1.57, fore: 0 }, neck: { x: 0.2 } },
            { ...ROBOT_BOX, root: { ry: 0.5 }, neck: { y: -0.5 } },
            { ...ROBOT_BOX, root: { ry: -0.5 }, neck: { y: 0.5 } }]
    },
    {
        id: 'chicken', name: 'the Chicken Dance', beat: 0.3, hold: 0.2, bounce: 0.02,
        keys: [BEAK_OPEN, BEAK_SHUT, BEAK_OPEN, BEAK_SHUT, WING_IN, WING_OUT, WING_IN, WING_OUT,
            TAIL, mirror(TAIL), TAIL, mirror(TAIL), APART, CLAP, APART, CLAP]
    },
    {
        id: 'ymca', name: 'the YMCA', beat: 0.6, hold: 0.5, bounce: 0,
        keys: [Y, M, C_, A, A, { ...Y, via: true }, GROOVE, { ...APART, root: { y: 0.04 } }, CLAP]
    },
    {
        id: 'macarena', name: 'the Macarena', beat: 0.34, hold: 0.35, bounce: 0.01,
        keys: [
            macStep(MAC.out), macStep(MAC.out, MAC.out), macStep(MAC.up, MAC.out), macStep(MAC.up, MAC.up),
            macStep(MAC.shoulder, MAC.up), macStep(MAC.shoulder, MAC.over), macStep(MAC.head, MAC.over), macStep(MAC.head, MAC.head),
            // Down from the head by the side, the arm turning as it comes.
            macStep(MAC.down, MAC.head, { via: true }), macStep(MAC.hipFront, MAC.head),
            macStep(MAC.hipFront, MAC.down, { via: true }), macStep(MAC.hipFront, MAC.hipFront),
            // Each hand round the side to the back pocket, not through the hip.
            macStep(MAC.side, MAC.hipFront, { via: true }), macStep(MAC.hipBack, MAC.hipFront),
            macStep(MAC.hipBack, MAC.side, { via: true }), macStep(MAC.hipBack, MAC.hipBack),
            macStep(MAC.hipBack, MAC.hipBack, { root: { x: 0.05, rz: 0.06 }, waist: { z: -0.1 } }),
            macStep(MAC.hipBack, MAC.hipBack, { root: { x: -0.05, rz: -0.06 }, waist: { z: 0.1 } }),
            { ...GROOVE, root: { y: 0.14, ry: 2.094 } },
            { ...GROOVE, root: { y: 0.06, ry: 4.189 } }
        ]
    },
    {
        id: 'floss', name: 'the Floss', beat: 0.2, hold: 0, bounce: 0,
        keys: [FLOSS_L, FLOSS_MID, mirror(FLOSS_L), FLOSS_MID]
    },
    {
        id: 'sprinkler', name: 'the Sprinkler', beat: 0.3, hold: 0.45, bounce: 0.015,
        keys: [SPRINKLE(-0.2, 0.1), SPRINKLE(0.2, 0), SPRINKLE(0.6, -0.12), SPRINKLE(1.0, -0.25), SPRINKLE(1.35, -0.38), SPRINKLE(0.4, -0.1),
            SWAP,
            mirror(SPRINKLE(-0.2, 0.1)), mirror(SPRINKLE(0.2, 0)), mirror(SPRINKLE(0.6, -0.12)), mirror(SPRINKLE(1.0, -0.25)), mirror(SPRINKLE(1.35, -0.38)), mirror(SPRINKLE(0.4, -0.1)),
            { ...mirror(SWAP), via: true, beats: 0.75 }]
    },
    {
        id: 'disco', name: 'the Disco Point', beat: 0.45, hold: 0.4, bounce: 0.015,
        keys: [DISCO_UP, DISCO_DOWN, DISCO_UP, DISCO_DOWN, mirror(DISCO_UP), mirror(DISCO_DOWN), mirror(DISCO_UP), mirror(DISCO_DOWN)]
    },
    {
        id: 'dab', name: 'the Dab', beat: 0.4, hold: 0.5, bounce: 0.03,
        keys: [GROOVE, { ...GROOVE, root: { y: 0.03 } }, DAB, DAB, GROOVE, { ...GROOVE, root: { y: 0.03 } }, mirror(DAB), mirror(DAB)]
    }
].map((d) => {
    // A via key is half a beat long unless it says (`beats`), and never
    // held (see danceAt).
    const vias = d.keys.map((k) => Boolean(k.via));
    const lens = d.keys.map((k, i) => k.beats || (vias[i] ? 0.5 : 1));
    const starts = lens.map((_, i) => lens.slice(0, i).reduce((a, b) => a + b, 0));
    return Object.freeze({
        ...d,
        keys: Object.freeze(d.keys.map(pose)),
        vias: Object.freeze(vias),
        starts: Object.freeze(starts),
        beats: starts[starts.length - 1] + lens[lens.length - 1]
    });
}));

/** A dance by its id. */
export function danceOf(id) {
    return DANCES.find((d) => d.id === id) || null;
}

/** Seconds a dance takes to come round to its first pose. */
export function loopOf(dance) {
    return dance.beat * dance.beats;
}

const smooth = (f) => f * f * (3 - 2 * f);
// Into a via key gathering speed, out of one losing it, through it neither.
const easeIn = (f) => f * f;
const easeOut = (f) => 1 - (1 - f) * (1 - f);

/** A turn eased the short way round (the Macarena's jump turns a full
 *  circle in three thirds, and the loop comes back to its start without
 *  unwinding). */
function turnBetween(a, b, f) {
    let d = b - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return a + d * f;
}

/**
 * The dancer's pose `t` seconds into `dance`: the pose of this beat eased
 * into the next's over the share of the beat that is not held, a bounce
 * between each pose and the next. Returns a full pose (every joint).
 *
 * A VIA KEY is a pose passed through, not stopped at (`via: true` in a
 * dance's keys): half a beat long, never held, the move into it gathering
 * speed and the move out losing it. It takes an arm round the body rather
 * than through it (the Macarena's hand from the front of the hip to the back
 * pocket goes round the side), or slows a move too quick for an arm (the
 * Sprinkler's change of hands).
 */
export function danceAt(dance, t) {
    const n = dance.keys.length;
    const k = Math.max(0, t) / dance.beat;
    const loop = k % dance.beats;
    let i = n - 1;
    while (i > 0 && dance.starts[i] > loop) i--;
    const j = (i + 1) % n;
    const len = (j === 0 ? dance.beats : dance.starts[j]) - dance.starts[i];
    const within = (loop - dance.starts[i]) / len;
    const hold = dance.vias[i] ? 0 : dance.hold;
    // Held, then moving: the next pose is reached at the end of this beat.
    const g = within < hold ? 0 : Math.min(1, (within - hold) / (1 - hold));
    const ease = dance.vias[i] && dance.vias[j] ? (x) => x : dance.vias[i] ? easeOut : dance.vias[j] ? easeIn : smooth;
    const f = ease(g);
    const a = dance.keys[i];
    const b = dance.keys[(i + 1) % n];
    const out = {};
    for (const part of PARTS) {
        const ja = a[part];
        const jb = b[part];
        const j = {};
        for (const key of Object.keys(ja)) {
            j[key] = part === 'root' && key === 'ry' ? turnBetween(ja[key], jb[key], f) : ja[key] + (jb[key] - ja[key]) * f;
        }
        out[part] = j;
    }
    // The bounce: up and down once a pose, landing on the next.
    out.root.y += dance.bounce * Math.sin(Math.PI * within);
    return out;
}

/** Several dances, all different and none of `exclude`, picked by `rand`
 *  (a function giving 0 to 1). Fewer when there are not enough. */
export function pickDances(count, rand, exclude = []) {
    const pool = DANCES.map((d) => d.id).filter((id) => !exclude.includes(id));
    const out = [];
    while (out.length < count && pool.length) out.push(pool.splice(Math.min(pool.length - 1, Math.floor(rand() * pool.length)), 1)[0]);
    return out;
}

/** Two full poses blended: `f` 0 is `a`, 1 is `b`. A turn goes the short
 *  way round. */
export function blendPoses(a, b, f) {
    const out = {};
    for (const part of PARTS) {
        const j = {};
        for (const key of Object.keys(a[part])) {
            j[key] = part === 'root' && key === 'ry' ? turnBetween(a[part][key], b[part][key], f) : a[part][key] + (b[part][key] - a[part][key]) * f;
        }
        out[part] = j;
    }
    return out;
}

/** A dance picked by `rand` (0 to 1), never `last` again. */
export function pickDance(rand, last = null) {
    const pool = DANCES.filter((d) => d.id !== last);
    return pool[Math.min(pool.length - 1, Math.floor(rand * pool.length))].id;
}

// ---- The joints ------------------------------------------------------------

/** The shared rig's measurements: the hips, and the neck's base (the top
 *  of the torso), and anything drawn above this is the head's. */
export const RIG = Object.freeze({ hip: 0.75, neck: 1.33, headFrom: 1.36 });

/** The middle of what a child draws, in the figure's own space, or null. */
function middleY(obj) {
    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) return null;
    return (box.min.y + box.max.y) / 2;
}

/**
 * The shared person `person` (createPerson's, untouched), jointed for
 * dancing. Returns { root, person, waist, neck, arms: { L, R }, legs:
 * { L, R } }: `root` is a group holding the figure, the soles on its y = 0
 * (where there is geometry to measure), for applyPose to stand, turn and
 * lean. The rig's side +1 is the figure's left (it faces +z).
 */
export function jointPerson(person) {
    person.position.set(0, 0, 0);
    person.rotation.set(0, 0, 0);
    const arms = {};
    const legs = {};
    for (const c of person.children) {
        const u = c.userData || {};
        if (u.isArm) arms[u.armSide > 0 ? 'L' : 'R'] = c;
        if (u.isLeg) legs[u.legSide > 0 ? 'L' : 'R'] = c;
    }

    const waist = new THREE.Group();
    waist.name = 'waist';
    waist.position.y = RIG.hip;
    const neck = new THREE.Group();
    neck.name = 'neck';
    neck.position.y = RIG.neck - RIG.hip;
    // What the head is, read before anything moves: every child that is not
    // a limb and is drawn above the neck's base.
    person.updateMatrixWorld(true);
    const head = person.children.filter((c) => !c.userData.isArm && !c.userData.isLeg && (middleY(c) ?? 0) > RIG.headFrom);
    for (const c of person.children.slice()) {
        if (c.userData.isLeg) continue;
        person.remove(c);
        if (head.includes(c)) {
            c.position.y -= RIG.neck;
            neck.add(c);
        } else {
            c.position.y -= RIG.hip;
            waist.add(c);
        }
    }
    waist.add(neck);
    person.add(waist);
    for (const limb of [...Object.values(arms), ...Object.values(legs)]) limb.rotation.order = 'XZY';

    const root = new THREE.Group();
    root.name = 'dancer';
    root.rotation.order = 'YXZ';
    root.add(person);
    // The soles on the floor, as crowd-1.0.0 stands its baked person (it
    // lifts its pieces by their lowest point the same way), so a dancer can
    // stand in for a crowd member exactly.
    person.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(person);
    person.position.y = box.isEmpty() ? 0.055 : -box.min.y;
    return { root, person, waist, neck, arms, legs };
}

/** Put a jointed figure (jointPerson's) in `p` (a full pose: danceAt's, or
 *  `pose(spec)`), standing at `at` ({ x, y, z, ry }). A figure scaled by its
 *  `root.scale` (a child) steps and bounces to that scale. */
export function applyPose(rig, p, at = { x: 0, y: 0, z: 0, ry: 0 }) {
    const s = rig.root.scale.x;
    const ry = at.ry || 0;
    const c = Math.cos(ry);
    const n = Math.sin(ry);
    // A step is the dancer's own: turned with the way it faces.
    rig.root.position.set(at.x + (p.root.x * c + p.root.z * n) * s, at.y + p.root.y * s, at.z + (p.root.z * c - p.root.x * n) * s);
    rig.root.rotation.set(p.root.rx, ry + p.root.ry, p.root.rz);
    rig.waist.rotation.set(p.waist.x, p.waist.y, p.waist.z);
    rig.neck.rotation.set(p.neck.x, p.neck.y, p.neck.z);
    for (const [k, side] of [['L', 1], ['R', -1]]) {
        const arm = rig.arms[k];
        const a = p[`arm${k}`];
        if (arm) {
            arm.rotation.set(a.x, side * a.y, side * a.z);
            if (arm.userData.forearm) arm.userData.forearm.rotation.x = a.fore;
        }
        const leg = rig.legs[k];
        const l = p[`leg${k}`];
        if (leg) leg.rotation.set(l.x, 0, side * l.z);
    }
}

// ---- Cheap enough for a crowd -------------------------------------------------------

/**
 * A jointed figure (jointPerson's) baked down to ONE MESH A JOINT: every
 * mesh that moves with a joint (the head's eyes, ears and hair with the
 * neck, the sleeve and the hand with the forearm, ...) merged into one
 * geometry in the joint's own frame, each keeping its color as a vertex
 * color. About forty draw calls become nine (the hips, the waist, the
 * neck, two upper arms, two forearms, two legs), so a scene can have a few
 * dancers on a phone (www/derby's winning finale has five). The figure
 * dances exactly as before: nothing moved, only fewer pieces.
 *
 * `material` is shared between figures when given (white, vertex
 * colored); `light` caps every sphere's and cylinder's segments as
 * crowd-1.0.0 does, for a figure seen at a distance. Returns the rig.
 */
export function bakeJoints(rig, { material = null, light = false } = {}) {
    const forearm = (arm) => (arm && arm.userData ? arm.userData.forearm : null);
    const joints = [rig.person, rig.waist, rig.neck, rig.arms.L, rig.arms.R, forearm(rig.arms.L), forearm(rig.arms.R), rig.legs.L, rig.legs.R].filter(Boolean);
    const isJoint = new Set(joints);
    const mat = material || new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, vertexColors: true });
    const old = new Set();
    rig.root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4();
    const rel = new THREE.Matrix4();
    for (const joint of joints) {
        const meshes = [];
        const groups = [];
        const walk = (o) => {
            for (const c of o.children) {
                if (isJoint.has(c)) continue;
                if (c.isMesh) meshes.push(c);
                else groups.push(c);
                walk(c);
            }
        };
        walk(joint);
        if (!meshes.length) continue;
        inv.copy(joint.matrixWorld).invert();
        const pieces = meshes.map((m) => {
            const src = light ? lighter(m.geometry) : m.geometry;
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', src.attributes.position.clone());
            g.setAttribute('normal', src.attributes.normal.clone());
            if (src.index) g.setIndex(src.index.clone());
            g.applyMatrix4(rel.multiplyMatrices(inv, m.matrixWorld));
            if (src !== m.geometry) src.dispose();
            if (m.material) old.add(m.material);
            return { geometry: g, colour: m.material && m.material.color ? m.material.color.clone() : null };
        });
        for (const m of meshes) {
            m.parent.remove(m);
            m.geometry.dispose();
        }
        // The plain groups that only held meshes (the hair's) go too.
        for (const g of groups) if (g.parent && !g.children.length) g.parent.remove(g);
        const baked = new THREE.Mesh(mergePieces(pieces, { vertexColours: true }), mat);
        baked.name = 'baked';
        joint.add(baked);
    }
    for (const m of old) if (m !== mat && m.dispose) m.dispose();
    return rig;
}

// ---- Dancers in a scene ------------------------------------------------------

/**
 * A figure dressed from a LOOK, the shape crowd-1.0.0's members wear:
 * { shirt, pants, skin, hair, style ('short', 'long', 'buzz', or null for
 * none), sleeve (long sleeves' color, the shirt's when left out) }, colors
 * as hex. `figure` is any more createPerson options (a scene's build, eyes).
 */
export function dressedPerson(look, figure = {}) {
    return createPerson({
        ...figure,
        shirtColor: look.shirt,
        sleeveColor: look.sleeve === undefined ? look.shirt : look.sleeve,
        pantsColor: look.pants,
        skinTone: look.skin,
        hairColor: look.hair,
        hairStyle: look.style || 'short',
        bald: !look.style
    });
}

/** One material for every baked dancer (white, vertex colored). */
let SHARED_MATERIAL = null;
const sharedMaterial = () => (SHARED_MATERIAL ||= new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, vertexColors: true }));

/** A dancer for `look` (and `look.scale`, a child's size): dressed by
 *  `dress` (dressedPerson by default), jointed, and baked unless `bake` is
 *  false. Returns the rig. */
export function buildDancer(look, { dress = dressedPerson, bake = true } = {}) {
    const rig = jointPerson(dress(look));
    if (bake) bakeJoints(rig, { material: sharedMaterial() });
    rig.root.scale.setScalar(look.scale || 1);
    return rig;
}

/**
 * DANCERS IN A SCENE (from www/derby's finale, 2026-10-20): hidden until
 * they start, one a slot. `start(look, at, danceId, { slot, intro })`
 * dresses a slot's dancer, stands it at `at` ({ x, y, z, ry }) and readies
 * the dance; `pose(t)` dances every slot on one clock, so dancers started
 * together are in step; `stop()` hides them all. `intro` is { pose, seconds }:
 * a pose to ease out of into the dance (blendPoses). `prepare(slot, look)`
 * builds a slot's figure ahead (and returns its rig), so a scene can do it
 * while nothing is moving and warm its shaders; a slot keeps its figure
 * while its look is the same. Standing in for a crowd member: step the
 * member aside (crowd-1.0.0 createCrowdView) and start a dancer in its look
 * where it stood. Returns { group, prepare, start, pose, stop, dancing,
 * count, rig(slot), danceIn(slot), dispose }.
 */
export function createDancers({ dress = dressedPerson, bake = true } = {}) {
    const group = new THREE.Group();
    group.name = 'dancers';
    const slots = new Map();

    function release(slot) {
        const s = slots.get(slot);
        if (!s) return;
        group.remove(s.rig.root);
        s.rig.root.traverse((o) => {
            if (o.geometry) o.geometry.dispose();
            if (o.material && o.material !== SHARED_MATERIAL && o.material.dispose) o.material.dispose();
        });
        slots.delete(slot);
    }

    function prepare(slot, look) {
        const key = JSON.stringify(look);
        const s = slots.get(slot);
        if (s && s.key === key) return s;
        release(slot);
        const rig = buildDancer(look, { dress, bake });
        rig.root.visible = false;
        group.add(rig.root);
        const made = { rig, key, at: null, dance: null, intro: null };
        slots.set(slot, made);
        return made;
    }

    function poseOf(s, t) {
        const p = danceAt(s.dance, t);
        if (!s.intro || t >= s.intro.seconds) return p;
        const f = Math.max(0, t) / s.intro.seconds;
        return blendPoses(s.intro.pose, danceAt(s.dance, s.intro.seconds), f * f * (3 - 2 * f));
    }

    const live = () => [...slots.values()].filter((s) => s.dance && s.rig.root.visible);
    return {
        group,
        prepare: (slot, look) => prepare(slot, look).rig,
        start(look, at, danceId, { slot = 0, intro = null } = {}) {
            const s = prepare(slot, look);
            s.at = at;
            s.dance = danceOf(danceId);
            s.intro = intro;
            s.rig.root.visible = Boolean(s.dance);
            applyPose(s.rig, s.dance ? poseOf(s, 0) : REST, at);
        },
        pose(t) {
            for (const s of live()) applyPose(s.rig, poseOf(s, t), s.at);
        },
        stop() {
            for (const s of slots.values()) {
                s.rig.root.visible = false;
                s.dance = null;
            }
        },
        dancing: () => live().length > 0,
        count: () => live().length,
        rig: (slot = 0) => (slots.get(slot) ? slots.get(slot).rig : null),
        danceIn: (slot = 0) => (slots.get(slot) && slots.get(slot).dance ? slots.get(slot).dance.id : null),
        dispose() {
            for (const slot of [...slots.keys()]) release(slot);
        }
    };
}

// ---- Who a camera sees -------------------------------------------------------

const unit = (x, y, z) => {
    const l = Math.hypot(x, y, z) || 1;
    return { x: x / l, y: y / l, z: z / l };
};

/**
 * Where point `p` lands on a screen of `aspect` seen by `shot` ({ position,
 * target }, the camera upright, vertical field of view `fov` degrees):
 * { x, y } from -1 to 1 across and up, or null behind the camera. The
 * projection three's camera makes, done by hand, so who dances where it
 * can be seen is chosen without a camera (tests check it against three's).
 */
export function screenPoint(shot, aspect, p, fov = 45) {
    const P = shot.position;
    const f = unit(shot.target.x - P.x, shot.target.y - P.y, shot.target.z - P.z);
    // Right is forward crossed with up; the camera's up is right crossed with forward.
    const r = unit(-f.z, 0, f.x);
    const u = { x: r.y * f.z - r.z * f.y, y: r.z * f.x - r.x * f.z, z: r.x * f.y - r.y * f.x };
    const d = { x: p.x - P.x, y: p.y - P.y, z: p.z - P.z };
    const depth = d.x * f.x + d.y * f.y + d.z * f.z;
    if (depth <= 0) return null;
    const tv = Math.tan((fov * Math.PI) / 360);
    return {
        x: (d.x * r.x + d.y * r.y + d.z * r.z) / (depth * tv * aspect),
        y: (d.x * u.x + d.y * u.y + d.z * u.z) / (depth * tv)
    };
}

/** Where a box ({ min, max } corners) is on the screen: the box { x0, x1,
 *  y0, y1 } around its eight corners, or null if any is behind the camera. */
export function boxOnScreen(shot, aspect, { min, max }, fov = 45) {
    const pts = [];
    for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) pts.push(screenPoint(shot, aspect, { x, y, z }, fov));
    if (pts.some((p) => !p)) return null;
    return { x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), y1: Math.max(...pts.map((p) => p.y)) };
}

/** A standing figure on the screen, as a box: from its feet at `at` to
 *  `tall` above them, `half` meters either side. */
export function figureBox(shot, aspect, at, { tall = 1.8, half = 0.28 } = {}, fov = 45) {
    return boxOnScreen(shot, aspect, { min: { x: at.x - half, y: at.y, z: at.z - half }, max: { x: at.x + half, y: at.y + tall, z: at.z + half } }, fov);
}

const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/**
 * Who in a crowd can dance where `shot` sees them (www/derby's bleachers,
 * 2026-10-20): up to `count` of `members` ({ at, look }), grown-ups only,
 * seen from the waist up (`upper` meters above the feet) inside `margin` of
 * the screen's edges, none of that behind anything in front (`avoid`:
 * screen boxes, figureBox's or boxOnScreen's), at least `spread` of the
 * screen apart, the lower (front) rows first. Returns the members chosen.
 */
export function pickInView(members, shot, aspect, { count = 3, avoid = [], margin = 0.9, spread = 0.28, upper = 0.85, fov = 45 } = {}) {
    const seen = [];
    for (const m of members) {
        if ((m.look.scale || 1) < 1) continue;
        const box = boxOnScreen(shot, aspect, { min: { x: m.at.x - 0.28, y: m.at.y + upper, z: m.at.z - 0.28 }, max: { x: m.at.x + 0.28, y: m.at.y + 1.85, z: m.at.z + 0.28 } }, fov);
        if (!box || box.x0 < -margin || box.x1 > margin || box.y0 < -margin || box.y1 > margin) continue;
        if (avoid.some((a) => overlaps(box, a))) continue;
        seen.push({ m, x: (box.x0 + box.x1) / 2, row: m.at.y });
    }
    // Spread: the one nearest each of `count` evenly spaced places across
    // the screen, the front rows preferred, never two close together.
    const picked = [];
    for (let k = 0; k < count; k++) {
        const want = count === 1 ? 0 : -margin + (2 * margin * k) / (count - 1);
        let best = null;
        let bestScore = Infinity;
        for (const s of seen) {
            if (picked.includes(s) || picked.some((q) => Math.abs(q.x - s.x) < spread)) continue;
            const score = Math.abs(s.x - want) + s.row * 0.4;
            if (score < bestScore) {
                best = s;
                bestScore = score;
            }
        }
        if (best) picked.push(best);
    }
    return picked.map((s) => s.m);
}
