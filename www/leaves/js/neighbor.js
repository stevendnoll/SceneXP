// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * neighbor.js - the neighbor: when he comes out, what he does, and when he
 * has had enough.
 *
 *   inside       behind his front door, until enough of our leaves land on
 *                his lawn (config.neighbor.visitAt, fewer each visit)
 *   door-open    the door swings open
 *   walk-out     to the near end of his leaves, along a line on his lawn
 *   blow         sweeping along that line, blowing them back over the fence
 *   watch        arms folded, facing our yard, for a moment
 *   walk-in      back to his door
 *   door-close   and in
 *
 * A VISIT LASTS UNTIL HIS LAWN IS CLEAR (`clearLeft`, or `visitMax` seconds).
 *
 * ONLY NEW LEAVES BRING HIM OUT (Steve's M6 QA: "The neighbor seems to keep
 * coming out even when there are no visible leaves in his lawn"). Leaves his
 * air pins against his side of the pickets stay there, hidden from the
 * street by the fence, and a visit ends when a pass cannot shift them. They
 * were still counted, so he was straight back out every twenty seconds for
 * leaves nobody could see. Now he counts from what he left behind when he
 * went in (`leftBehind`), and only our next leaves bring him back.
 *
 * A VISIT ESCALATES: each comes sooner (a lower `visitAt` and a shorter
 * `cooldown`), watches longer, and from visit
 * `bigFrom` (counting from 0) he brings the big blower.
 *
 * A GOOD-NATURED RIVAL: he never sets foot in our yard, never touches the
 * visitor, and waves when the round is over.
 *
 * PURE. main.js steps it with how many of our leaves are on his lawn and
 * where, draws him from what it says, and builds his jet from `blowing`,
 * `big`, his position and his heading.
 */

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const pick = (list, n) => list[Math.min(n, list.length - 1)];
const wrap = (a) => a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2));

/** Facing our yard: -x. */
export const FACING_YARD = -Math.PI / 2;

export function createNeighbor(N) {
    return {
        state: 'inside',
        t: 0,
        visits: 0,
        cooldown: 0,
        x: N.door.x,
        z: N.door.z + 0.6,
        heading: 0,
        speed: 0,
        stride: 0,
        door: 0,
        blowing: false,
        big: false,
        arms: 'carry',
        segs: [],
        seg: 0,
        // How many of our leaves were on his lawn when he last went in: the
        // ones he could not shift. Only leaves beyond these bring him out.
        leftBehind: 0,
        // How many were on his lawn when he last planned his sweep, to tell
        // whether a pass made any difference.
        lastCount: 0
    };
}

/** Back inside with the door shut, every visit forgotten: a new round. */
export function resetNeighbor(nb, N) {
    return Object.assign(nb, createNeighbor(N));
}

/** Whether he is out where he can be seen (the door open counts). */
export function isOut(nb) {
    return nb.state !== 'inside';
}

/** Walk toward (tx, tz), turning as he goes. Returns true on arrival. */
function walkTo(nb, tx, tz, speed, dt) {
    const dx = tx - nb.x;
    const dz = tz - nb.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) {
        nb.speed = 0;
        return true;
    }
    const step = Math.min(d, speed * dt);
    nb.x += (dx / d) * step;
    nb.z += (dz / d) * step;
    nb.speed = dt > 0 ? step / dt : 0;
    nb.stride += step;
    turnTo(nb, Math.atan2(dx, dz), dt);
    return step >= d - 1e-9;
}

function turnTo(nb, heading, dt) {
    const turn = wrap(heading - nb.heading);
    const max = 6 * dt;
    nb.heading = wrap(nb.heading + clamp(turn, -max, max));
}

/** Out he comes. */
function start(nb, N) {
    nb.state = 'door-open';
    nb.t = 0;
    nb.big = nb.visits >= N.bigFrom;
    nb.x = N.door.x;
    nb.z = N.door.z + 0.6;
    nb.heading = 0;
    nb.arms = 'carry';
}

/**
 * The path he blows along, as a list of points he walks to in turn, facing
 * our yard. TWO LINES, like a person clearing a lawn: first just beyond the
 * farthest of our leaves on his lawn (a blower only moves what is in front
 * of it, and leaves blown over the fence land meters in), which drives them
 * to the fence, then close to the fence, where the air landing just short of
 * it lifts them over (measured: from the far line alone they piled against
 * the pickets and stayed). Along the fence each line runs from the nearest
 * of them to the farthest, at least a couple of meters.
 */
function planSweep(nb, input, N) {
    const fence = (z) => ({ x: N.nearLine, z });
    let a = clamp(Number.isFinite(input.minZ) ? input.minZ : N.zMin, N.zMin, N.zMax);
    let b = clamp(Number.isFinite(input.maxZ) ? input.maxZ : N.zMax, N.zMin, N.zMax);
    if (b - a < 2) {
        const mid = (a + b) / 2;
        a = clamp(mid - 1, N.zMin, N.zMax - 2);
        b = a + 2;
    }
    const reach = Number.isFinite(input.maxX) ? input.maxX : N.line;
    const far = clamp(reach + N.behind, N.lineMin, N.lineMax);
    const pair = far > N.nearLine + 0.8
        ? [{ x: far, z: a }, { x: far, z: b }, fence(b), fence(a)]
        : [fence(a), fence(b)];
    nb.segs = pair;
    nb.seg = 0;
    nb.lastCount = input.leaves;
}

/**
 * Advance him by `dt` seconds. `input` is:
 *   leaves    how many of our leaves are on his lawn
 *   minZ/maxZ where along the fence they lie
 *   maxX      how far into his yard the farthest one lies
 *   active    whether the round lets him come out (playing, or free play)
 *   over      whether the round is over (he waves, and stays out to do it)
 * Returns 'out', 'blow', 'watch', 'in' or null.
 */
export function stepNeighbor(nb, dt, input, N) {
    const step = dt > 0 ? dt : 0;
    nb.t += step;

    // THE ROUND IS OVER: a visit in progress stops where it is and he waves,
    // so the end of the round is not kept waiting on him (Steve's M3 QA:
    // after the clock ran out it "shows the neighbor for several seconds").
    if (input.over && (nb.state === 'door-open' || nb.state === 'walk-out' || nb.state === 'blow')) {
        nb.state = 'watch';
        nb.t = 0;
        nb.blowing = false;
        nb.speed = 0;
        nb.door = 1;
    }

    switch (nb.state) {
        case 'inside':
            nb.cooldown -= step;
            // Fewer than he left (we blew some back, or they blew off): the
            // ones still there are what he left.
            if (input.leaves < nb.leftBehind) nb.leftBehind = input.leaves;
            if (input.active && nb.cooldown <= 0 && input.leaves - nb.leftBehind >= pick(N.visitAt, nb.visits)) {
                start(nb, N);
                return 'out';
            }
            return null;
        case 'door-open':
            nb.door = Math.min(1, nb.door + step / N.doorSeconds);
            if (nb.door >= 1) {
                planSweep(nb, input, N);
                nb.state = 'walk-out';
                nb.t = 0;
            }
            return null;
        case 'walk-out': {
            nb.blowing = false;
            const first = nb.segs[0];
            if (walkTo(nb, first.x, first.z, N.walkSpeed, step)) {
                nb.state = 'blow';
                nb.t = 0;
                nb.seg = 1;
                return 'blow';
            }
            return null;
        }
        case 'blow': {
            nb.blowing = true;
            // He walks his path at a sweeping pace, the blower toward us.
            const target = nb.segs[nb.seg];
            const dx = target.x - nb.x;
            const dz = target.z - nb.z;
            const d = Math.hypot(dx, dz);
            const move = Math.min(d, N.sweepSpeed * step);
            if (d > 0) {
                nb.x += (dx / d) * move;
                nb.z += (dz / d) * move;
            }
            nb.speed = step > 0 ? move / step : 0;
            nb.stride += move;
            turnTo(nb, FACING_YARD, step);
            // HE KEEPS AT IT UNTIL HIS LAWN IS CLEAR (Steve's M3 QA: he went
            // back in with "a lot of leaves in his yard", then came out again
            // a few seconds later). Each time round his path he plans it
            // again from where the leaves are now, and stops when no more
            // than `clearLeft` are left, or when a whole pass got him nowhere
            // (a few leaves he cannot reach), but never while we are still
            // sending them over. `visitMax` is only a backstop.
            let cleared = false;
            if (move >= d - 1e-9) {
                nb.seg += 1;
                if (nb.seg >= nb.segs.length) {
                    const stuck = input.leaves <= nb.lastCount && input.leaves > nb.lastCount * (1 - N.progress);
                    if (input.leaves <= N.clearLeft || stuck || nb.t >= N.visitMax) cleared = true;
                    else planSweep(nb, input, N);
                }
            }
            if (cleared) {
                nb.blowing = false;
                nb.state = 'watch';
                nb.t = 0;
                nb.speed = 0;
                nb.arms = 'folded';
                return 'watch';
            }
            return null;
        }
        case 'watch':
            turnTo(nb, FACING_YARD, step);
            nb.speed = 0;
            if (input.over) {
                nb.arms = 'wave';
                return null;
            }
            nb.arms = 'folded';
            if (nb.t >= pick(N.watchSeconds, nb.visits)) {
                nb.state = 'walk-in';
                nb.t = 0;
                nb.arms = 'carry';
            }
            return null;
        case 'walk-in':
            if (walkTo(nb, N.door.x, N.door.z + 0.6, N.walkSpeed, step)) {
                nb.state = 'door-close';
                nb.t = 0;
            }
            return null;
        case 'door-close':
            nb.door = Math.max(0, nb.door - step / N.doorSeconds);
            if (nb.door <= 0) {
                nb.state = 'inside';
                nb.visits += 1;
                nb.leftBehind = input.leaves;
                nb.cooldown = pick(N.cooldown, nb.visits);
                return 'in';
            }
            return null;
        default:
            return null;
    }
}

/** His blower's settings: ours, with his changes, and the big one's. */
export function neighborBlower(B, N, big) {
    return { ...B, ...N.blower, ...(big ? N.bigBlower : {}) };
}
