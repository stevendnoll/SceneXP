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
 * A VISIT ESCALATES: each comes sooner (a lower `visitAt` and a shorter
 * `cooldown`), blows longer (`passes`), watches longer, and from visit
 * `bigFrom` (counting from 0) he brings the big blower.
 *
 * HIS LAST WORD. When the round says so (`input.revenge`), he comes out (or
 * carries on) with the big blower, quicker on his feet, and sweeps his whole
 * lawn until most of it is clear (`revengeKeep` of it left) or
 * `revengeSeconds` have passed, and answers 'revenge-done'. Short, so the
 * result is not kept waiting behind him.
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
        revenge: false,
        revengeDone: false,
        segs: [],
        seg: 0,
        revengeFrom: 0
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
function start(nb, N, revenge, leaves = 0) {
    nb.state = 'door-open';
    nb.revengeFrom = leaves;
    nb.t = 0;
    nb.revenge = revenge;
    nb.big = revenge || nb.visits >= N.bigFrom;
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
 * of them to the farthest, at least a couple of meters. A visit repeats the
 * pair `passes` times. His last word sweeps the whole lawn.
 */
function planSweep(nb, input, N) {
    const fence = (z) => ({ x: N.nearLine, z });
    let a;
    let b;
    if (nb.revenge) {
        a = N.zMin;
        b = N.zMax;
    } else {
        a = clamp(Number.isFinite(input.minZ) ? input.minZ : N.zMin, N.zMin, N.zMax);
        b = clamp(Number.isFinite(input.maxZ) ? input.maxZ : N.zMax, N.zMin, N.zMax);
        if (b - a < 2) {
            const mid = (a + b) / 2;
            a = clamp(mid - 1, N.zMin, N.zMax - 2);
            b = a + 2;
        }
    }
    const reach = Number.isFinite(input.maxX) ? input.maxX : N.line;
    const far = clamp(reach + N.behind, N.lineMin, N.lineMax);
    const pair = far > N.nearLine + 0.8
        ? [{ x: far, z: a }, { x: far, z: b }, fence(b), fence(a)]
        : [fence(a), fence(b)];
    const passes = nb.revenge ? 1 : pick(N.passes, nb.visits);
    nb.segs = [];
    for (let p = 0; p < passes; p++) nb.segs.push(...pair);
    nb.seg = 0;
}

/**
 * Advance him by `dt` seconds. `input` is:
 *   leaves    how many of our leaves are on his lawn
 *   minZ/maxZ where along the fence they lie
 *   maxX      how far into his yard the farthest one lies
 *   active    whether the round lets him come out (playing, or free play)
 *   revenge   whether he is to have the last word now
 *   over      whether the round is over (he waves, and stays out to do it)
 * Returns 'out', 'blow', 'watch', 'in', 'revenge-done' or null.
 */
export function stepNeighbor(nb, dt, input, N) {
    const step = dt > 0 ? dt : 0;
    nb.t += step;

    // The last word, whatever he was doing.
    if (input.revenge && !nb.revengeDone && !nb.revenge) {
        if (nb.state === 'inside' || nb.state === 'door-close') {
            start(nb, N, true, input.leaves);
            return 'out';
        }
        nb.revenge = true;
        nb.big = true;
        nb.revengeFrom = input.leaves;
        if (nb.state === 'walk-out' || nb.state === 'blow' || nb.state === 'watch' || nb.state === 'walk-in') {
            planSweep(nb, input, N);
            nb.state = 'walk-out';
            nb.t = 0;
        }
    }

    switch (nb.state) {
        case 'inside':
            nb.cooldown -= step;
            if (input.active && nb.cooldown <= 0 && input.leaves >= pick(N.visitAt, nb.visits)) {
                start(nb, N, false);
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
            if (walkTo(nb, first.x, first.z, nb.revenge ? N.revengeWalk : N.walkSpeed, step)) {
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
            const move = Math.min(d, (nb.revenge ? N.revengeSweep : N.sweepSpeed) * step);
            if (d > 0) {
                nb.x += (dx / d) * move;
                nb.z += (dz / d) * move;
            }
            nb.speed = step > 0 ? move / step : 0;
            nb.stride += move;
            turnTo(nb, FACING_YARD, step);
            if (move >= d - 1e-9) {
                nb.seg += 1;
                // His last word goes round again until it is done.
                if (nb.seg >= nb.segs.length && nb.revenge) nb.seg = 0;
            }
            const doneRevenge = nb.revenge
                && (input.leaves <= Math.max(N.revengeLeft, nb.revengeFrom * N.revengeKeep)
                    || nb.t >= N.revengeSeconds);
            if ((!nb.revenge && nb.seg >= nb.segs.length) || doneRevenge) {
                nb.blowing = false;
                nb.state = 'watch';
                nb.t = 0;
                nb.speed = 0;
                nb.arms = 'folded';
                if (nb.revenge) {
                    nb.revengeDone = true;
                    return 'revenge-done';
                }
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
                nb.cooldown = pick(N.cooldown, nb.visits);
                nb.revenge = false;
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
