// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * dances.js - the winning family's grown-up, dancing (Steve, 2026-10-20:
 * "The celebrations are a little too static... common identifiable dance
 * moves"). After the last heat, the day's winner's grown-up breaks out a
 * dance picked at random, never the same one twice running.
 *
 * ARMS, HIPS AND A HEAD, NO KNEES. The shared person (people-1.0.0) bends at
 * the shoulders, the elbows and the hips, and dancer.js gives it a waist and
 * a neck of its own. There is no knee and no spine to ripple, so the dances
 * are the ones a body says with its arms: the Robot, the Chicken Dance, the
 * YMCA, the Macarena, the Floss, the Sprinkler, the Disco Point and the Dab.
 * The Moonwalk and the Running Man wait for a knee (TASKS, D47).
 *
 * A DANCE IS A LOOP OF POSES, one a beat, each held for a share of its beat
 * (`hold`) and eased into over the rest, so a move hits its pose on the beat
 * the way a dancer does. The Robot holds longest, so it snaps. A pose names
 * only the joints it moves; every other joint is at rest.
 *
 * THE JOINTS, as dancer.js applies them (radians; meters for `root`). "L"
 * and "R" are the dancer's own left and right, so a dance reads the same on
 * any figure, and a mirrored pose (`mirror`) is the same move on the other
 * side.
 *
 *   root   x, y, z   a step, a bounce (y), from where the member stood
 *          ry        a turn (positive turns to the dancer's left)
 *          rx, rz    a lean from the feet (rx forward, rz to the right)
 *   waist  x, y, z   a bow forward, a twist to the left, a bend to the right
 *   neck   x, y, z   a nod forward, a turn to the left, a tilt to the right
 *   armL, armR       x: negative raises the arm forward (-1.57 straight
 *                    ahead); z: out to the side (1.57 level, 2.75 up in a
 *                    V, negative across the body); y: a twist along the arm,
 *                    which turns the way the elbow bends; fore: negative
 *                    bends the elbow
 *   legL, legR       x: negative kicks forward; z: out to the side
 *
 * The contact poses (a hand on a shoulder, a hip, the back of the head) were
 * solved against the real rig and are measured in tests/derby-dance.test.mjs.
 *
 * PURE: no three.js, no DOM.
 */

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
const C_ = { armL: { x: 0.45, z: 3.56, y: 1.8, fore: -0.68 }, armR: { x: -0.01, z: 0.99, y: -1.08, fore: -1.73 }, waist: { z: 0.2 }, neck: { z: 0.12 } };
const PEAK = { x: 0.07, z: 3.2, y: 1.48, fore: -0.35 };
const A = { armL: PEAK, armR: PEAK, root: { y: 0.03 } };

// The Macarena, one arm then the other.
const MAC = {
    out: { x: -1.5, z: 0.08, y: 0, fore: 0 },
    // Palm up: the hand is the same either way round, so the twist goes
    // the way the next move (to the shoulder) turns.
    up: { x: -1.5, z: 0.08, y: -1.57, fore: 0 },
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
 * THE DANCES. `name` is how the announcer says it (copy.js has the line),
 * `beat` the seconds a pose, `hold` the share of each beat held still,
 * `bounce` meters of a bounce on every beat, and `keys` the loop of poses.
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

/** A dance picked by `rand` (0 to 1), never `last` again. */
export function pickDance(rand, last = null) {
    const pool = DANCES.filter((d) => d.id !== last);
    return pool[Math.min(pool.length - 1, Math.floor(rand * pool.length))].id;
}

/**
 * Who dances in a family: its grown-up (Steve, 2026-10-20), the first one
 * not holding anything if there is one, so a sign or a camcorder is not
 * left hanging in the air. `members` is the family's list ({ look, prop });
 * a kid is drawn at a child's scale. Returns an index, or -1.
 */
export function dancerOf(members, kidScale) {
    const grownUps = members.map((m, i) => ({ m, i })).filter(({ m }) => m.look.scale > kidScale);
    if (!grownUps.length) return -1;
    const free = grownUps.find(({ m }) => !m.prop);
    return (free || grownUps[0]).i;
}
