// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * opening.js - The scene before the welcome card, and what it is doing at `t`.
 *
 * THE VISITOR NEEDS A REASON TO BEAT SOMEBODY. The O's walk through the X's
 * warm-up, knock their water cooler over and point down the lens, and the X's
 * are left wanting to make them pay. It plays on every page load, it can always
 * be skipped, and it tells its story in pictures because nothing can make a
 * sound before the first press.
 *
 * PURE, FOR THE REASON milestones.js IS. "Where is the camera 6.1 seconds in on
 * a phone held upright" has a numeric answer, and every shot is SOLVED against
 * what it has to contain rather than placed by hand for one screen shape.
 *
 * A FRAME IS A DESCRIPTION, NOT AN INSTRUCTION. `openingFrame` says what should
 * be true at `t`, so a skip, a dropped frame and a stall all land in the right
 * place.
 *
 * IT ARRIVES, IT DOES NOT CUT. The last shot is `playDriver`, which is the shot
 * the welcome card has always sat over, so the card comes up over a view that is
 * already the one it belongs to. Same trick as Earth Defense's opening.
 */
import { XO_CONFIG as CFG, FIELD } from './config.min.js';
import { playDriver } from './camera.min.js';
import { fitShot, blendShot, stadiumShot } from './milestones.min.js';
import { standLayout } from './field.min.js';
import { crowdReach } from './stunt.min.js';

const O = CFG.opening;

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

/** Where the two teams meet. */
export function midfield() {
    return { x: (FIELD.lineInterval * FIELD.segments) / 2, y: 0, z: 0 };
}

/** A box of points around a spot on the grass, for a shot to contain. */
function boxAround(c, halfX, halfZ, top) {
    const out = [];
    for (const x of [c.x - halfX, c.x + halfX]) {
        for (const z of [c.z - halfZ, c.z + halfZ]) {
            for (const y of [0, top]) out.push({ x, y, z });
        }
    }
    return out;
}

const shots = new Map();

/**
 * WHETHER A SHOT SEES `points` OVER BOTH STANDS rather than through the fans'
 * heads or the wall behind them. A low shot across the field is exactly the
 * one a phone held upright backs out through the stand to fit everything in.
 */
export function clearsStands(shot, points) {
    const S = standLayout();
    const reach = crowdReach();
    const f = shot.position;
    for (const side of [-1, 1]) {
        for (let r = 0; r < S.rows; r += 1) {
            const z = side * S.out(r);
            for (const p of points) {
                if ((f.z - z) * (p.z - z) >= 0) continue;
                const k = (z - f.z) / (p.z - f.z);
                if (f.y + (p.y - f.y) * k <= S.top(r) + reach) return false;
            }
        }
    }
    return true;
}

/**
 * One named shot, solved for this screen shape and remembered. The names are
 * the ones `opening.keys` is written in, and every one is described by what it
 * has to contain, in `opening.shots`.
 */
export function openingShot(name, aspect = 1.78) {
    const a = Number(aspect) || 1.78;
    if (name === 'play') return playDriver(a);
    if (name === 'wide') return stadiumShot(a);
    const key = `${name}:${a.toFixed(3)}`;
    if (shots.has(key)) return shots.get(key);
    const spec = O.shots[name];
    if (!spec) return playDriver(a);
    const m = midfield();
    const c = { x: m.x + spec.at.x, y: 0, z: m.z + spec.at.z };
    // A PHONE HELD UPRIGHT HAS A NARROW FRAME, so a shot across the field keeps
    // less of the field's length in it rather than backing out of the stadium.
    const halfX = a < 1 && spec.narrow ? spec.half.x * spec.narrow : spec.half.x;
    const points = boxAround(c, halfX, spec.half.z, spec.top);
    // ...and it climbs a step at a time until it sees over the fans, the way
    // the finale's side shot does. The heads and shoulders are what must clear.
    const upper = points.filter((p) => p.y > 0).flatMap((p) => [p, { ...p, y: p.y / 2 }]);
    let shot = null;
    for (const rise of [spec.from.y, ...O.climb.filter((y) => y > spec.from.y)]) {
        shot = fitShot({
            target: { x: c.x, y: spec.aimY, z: c.z },
            from: { ...spec.from, y: rise },
            fov: spec.fov,
            points,
            aspect: a,
            margin: spec.margin,
            floor: spec.floor,
        });
        if (clearsStands(shot, upper)) break;
    }
    shots.set(key, shot);
    return shot;
}

// ---- The cast and where they go ----------------------------------------------

const smooth = (t) => { const c = clamp01(t); return c * c * (3 - 2 * c); };
const span = (t, [a, b]) => clamp01((t - a) / Math.max(1e-6, b - a));
/** Up over `[a, b]` and back down again, 0 to 1 to 0, with `edge` seconds each way. */
const envelope = (t, [a, b], edge) => clamp01(Math.min((t - a) / edge, (b - t) / edge));
/** The world yaw that turns a figure at `from` to face `to`. The rig faces +z at 0. */
const bearing = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
/** Which way each team faces when it lines up: the X's downfield, the O's back. */
const DOWNFIELD = { 0: Math.PI / 2, 1: -Math.PI / 2 };

/**
 * A RUN, NOT A GLIDE: it speeds up, holds its pace and slows to a stop. `u` is
 * 0 to 1 through the leg and `ramp` the share of it spent speeding up (and the
 * same slowing down). A plain smoothstep never holds a pace, so a long run
 * reads as a man accelerating the whole way and braking the whole way.
 */
function run(u, ramp) {
    const c = clamp01(u);
    const r = Math.min(0.45, Math.max(0.01, ramp));
    const v = 1 / (1 - r);
    if (c < r) return (v * c * c) / (2 * r);
    if (c > 1 - r) return 1 - (v * (1 - c) * (1 - c)) / (2 * r);
    return v * (c - r / 2);
}

/** Where a path of `[t, x, z]` waypoints is at `t`, and whether it is moving. */
function along(path, t) {
    if (t <= path[0][0]) return { x: path[0][1], z: path[0][2], running: false };
    for (let i = 1; i < path.length; i += 1) {
        const [t1, x1, z1] = path[i];
        if (t < t1) {
            const [t0, x0, z0] = path[i - 1];
            const dur = Math.max(1e-6, t1 - t0);
            const k = run((t - t0) / dur, 0.35 / dur);
            const far = Math.hypot(x1 - x0, z1 - z0);
            return { x: x0 + (x1 - x0) * k, z: z0 + (z1 - z0) * k, running: far > 0.3 };
        }
    }
    const last = path[path.length - 1];
    return { x: last[1], z: last[2], running: false };
}

/** The first of `wanted` positions that is on the field, else the first man. */
function pick(men, wanted) {
    for (const position of wanted) {
        const man = men.find((m) => m.position === position);
        if (man) return man;
    }
    return men[0] || null;
}

/**
 * WHO IS IN IT AND WHERE EVERY ONE OF THEM GOES, decided once.
 *
 * `men` is the formation that is already lined up behind the welcome card, as
 * `{ position, team, x, z }` in world metres, and every path ENDS there, so the
 * card comes up over men standing exactly where the game put them. Benched men
 * are not in the list and are not in the scene.
 *
 * THE STORY RUNS ONE WAY AT A TIME, which is what keeps bodies out of each
 * other. The home team runs out downfield to a huddle on its own half. The
 * visitors come in from their own sideline and march straight across the field
 * through that huddle to the home team's cooler on the home sideline. And when
 * it is over the home team walks back first, toward its own end, and the
 * visitors after, so neither crosses the other's way home.
 */
export function planOpening(men = [], { aspect = 1.78, calm = false } = {}) {
    const S = O.stage;
    const B = O.beats;
    const m = midfield();
    const huddle = { x: m.x + S.huddle.x, z: m.z + S.huddle.z };
    const cooler = { x: m.x + S.cooler.x, z: m.z + S.cooler.z };
    const xs = men.filter((man) => man.team === 0);
    const os = men.filter((man) => man.team === 1);
    const captain = pick(os, O.cast.captain);
    const bumper = pick(os.filter((man) => man !== captain), O.cast.bumper);
    // The visitors walk across the field along this x.
    const lane = huddle.x;

    /**
     * THE HUDDLE: a ring, and EVERY MAN'S PLACE IN IT IS CHOSEN BY WHERE HE LINES
     * UP. Slots and formation spots are both taken in order round the huddle's
     * centre, so the walk back from the ring to the formation is a fan of paths
     * that do not cross. The man in the slot nearest the lane is the one who
     * gets the shoulder, whoever that turns out to be.
     */
    const slots = xs.map((_, i) => {
        const a = (i * Math.PI * 2) / Math.max(1, xs.length) + 0.3;
        return { x: huddle.x + Math.cos(a) * S.ring, z: huddle.z + Math.sin(a) * S.ring };
    });
    const round = (p) => Math.atan2(p.z - huddle.z, p.x - huddle.x);
    const bySlot = [...slots].sort((a, b) => round(a) - round(b));
    const byHome = [...xs].sort((a, b) => round(a) - round(b));
    const ringOf = new Map();
    byHome.forEach((man, i) => ringOf.set(man.position, bySlot[i]));
    const bumped = byHome.length ? byHome.reduce((best, man) =>
        (Math.abs(ringOf.get(man.position).x - lane) < Math.abs(ringOf.get(best.position).x - lane)
            ? man : best)) : null;

    // AND WHERE EACH ONE STANDS ONCE THE VISITORS COME THROUGH: anybody inside
    // `part` of the lane steps out to it, on whichever side he was already on.
    const partedOf = new Map();
    for (const man of xs) {
        const slot = ringOf.get(man.position);
        const side = slot.x >= lane ? 1 : -1;
        const gap = man === bumped ? S.partBumped : S.part;
        const x = Math.abs(slot.x - lane) < gap ? lane + side * gap : slot.x;
        partedOf.set(man.position, { x, z: slot.z });
    }
    const bumpSide = bumped ? Math.sign(partedOf.get(bumped.position).x - lane) || 1 : 1;

    // THE COLUMN, two abreast, the bumper in the front row on the bumped man's
    // side so his is the first shoulder to arrive. It stops once its last row is
    // clear of the huddle.
    const column = [bumper, ...os.filter((man) => man !== bumper)].filter(Boolean);
    const rows = Math.ceil(column.length / 2);
    const leadStart = m.z + S.awayFrom.z;
    const leadEnd = huddle.z + S.ring + S.through + (rows - 1) * S.column.rowGap;
    const columnOf = new Map();
    column.forEach((man, i) => {
        const row = Math.floor(i / 2);
        const side = (i % 2 === 0 ? 1 : -1) * bumpSide;
        columnOf.set(man.position, {
            from: { x: lane + side * S.column.side, z: leadStart - row * S.column.rowGap },
            to: { x: lane + side * S.column.side, z: leadEnd - row * S.column.rowGap },
        });
    });

    // THE MOMENT OF THE SHOULDER: when the bumper draws level with the man.
    let contact = (B.visitors[0] + B.visitors[1]) / 2;
    if (bumper && bumped) {
        const c = columnOf.get(bumper.position);
        const level = partedOf.get(bumped.position).z;
        const path = [[B.visitors[0], c.from.x, c.from.z], [B.visitors[1], c.to.x, c.to.z]];
        for (let t = B.visitors[0]; t <= B.visitors[1]; t += 1 / 120) {
            if (along(path, t).z >= level) { contact = t; break; }
        }
    }

    // THE VISITORS' LINE in front of the home stand, and the captain's spot in
    // front of the cooler. His column place is swapped for the one that
    // finishes nearest the cooler, so his is the short straight walk.
    const table = { x: cooler.x, z: cooler.z - S.reach };
    if (captain && bumper !== captain) {
        const nearest = [...os].filter((man) => man !== bumper).sort((a, b) =>
            Math.abs(columnOf.get(a.position).to.x - cooler.x)
            - Math.abs(columnOf.get(b.position).to.x - cooler.x)
            || columnOf.get(b.position).to.z - columnOf.get(a.position).to.z)[0];
        if (nearest && nearest !== captain) {
            const held = columnOf.get(captain.position);
            columnOf.set(captain.position, columnOf.get(nearest.position));
            columnOf.set(nearest.position, held);
        }
    }
    // ...IN THE ORDER THEY LINE UP, for the reason the huddle is: the walk back
    // to the formation is the long one, so it is the one that must fan out
    // rather than cross. The short walk up to the stand is kept apart by `bake`.
    const dancers = os.filter((man) => man !== captain).sort((a, b) => a.x - b.x || a.z - b.z);
    const spots = S.dance.slice(0, dancers.length).sort((a, b) => a - b);
    const danceOf = new Map();
    dancers.forEach((man, i) => danceOf.set(man.position, { x: cooler.x + spots[i], z: m.z + S.danceZ }));


    /**
     * THEY RUN OUT IN THE SHAPE OF THE HUDDLE, spread a little wider, so every
     * path runs parallel to every other and nobody crosses anybody. Two men who
     * start together and run the same distance in the same time keep exactly
     * the gap they started with, which is why the stagger goes by how far out
     * from the middle a man is and not by who he is.
     */
    const paths = new Map();
    xs.forEach((man) => {
        const ring = ringOf.get(man.position);
        const parted = partedOf.get(man.position);
        const start = {
            x: m.x + S.homeFrom.x + (ring.x - huddle.x),
            z: huddle.z + (ring.z - huddle.z) * S.homeFrom.spread,
        };
        const go = B.runStagger * Math.abs(ring.z - huddle.z) / Math.max(1e-6, S.ring);
        paths.set(man.position, [
            [B.runOut[0] + go, start.x, start.z],
            [B.runOut[1] + go, ring.x, ring.z],
            [B.partAt[0], ring.x, ring.z],
            [B.partAt[1], parted.x, parted.z],
        ]);
    });
    os.forEach((man) => {
        const c = columnOf.get(man.position);
        const end = man === captain ? table : danceOf.get(man.position);
        paths.set(man.position, [
            [B.visitors[0], c.from.x, c.from.z],
            [B.visitors[1], c.to.x, c.to.z],
            [B.peel[1] - (man === captain ? 0.2 : 0), end.x, end.z],
        ]);
    });
    // AND BACK TO THE FORMATION: the home team first, the visitors after.
    for (const [team, window] of [[xs, B.homeBack], [os, B.awayBack]]) {
        for (const man of team) {
            const path = paths.get(man.position);
            const [, x, z] = path[path.length - 1];
            path.push([window[0], x, z], [window[1], man.x, man.z]);
        }
    }

    // THE CALM VERSION IS A TABLEAU: everybody where the story has left them,
    // held, and nobody walks anywhere.
    const still = new Map();
    for (const man of xs) still.set(man.position, partedOf.get(man.position));
    for (const man of os) still.set(man.position, man === captain ? table : danceOf.get(man.position));

    // THE SWIPE: the arm crosses the cooler part way through the sweep, and the
    // cooler goes over the way the arm was travelling.
    const W = O.moves.swipe;
    const hit = B.swipeSweep[0] + (B.swipeSweep[1] - B.swipeSweep[0]) * (W.wind / (W.wind + W.follow));
    const facing = bearing(table, cooler);
    const tipDir = { x: Math.cos(facing), z: -Math.sin(facing) };
    // The cooler sits at the table's near edge, so the table's middle is a
    // little further on from the captain than the cooler is.
    const back = O.props.table.depth / 2 - O.props.cooler.radius;
    const tableAt = { x: cooler.x + Math.sin(facing) * back, z: cooler.z + Math.cos(facing) * back };

    return {
        calm, men, paths: calm ? new Map() : paths, still, huddle, cooler, table, lane, hit, tipDir, tableAt,
        bodies: calm ? null : bake(paths, men, { bumper, bumped, contact, bumpSide, tableAt }),
        contact, bumpSide,
        lens: openingShot('captain', aspect).position,
        captain: captain ? captain.position : '',
        bumper: bumper ? bumper.position : '',
        bumped: bumped ? bumped.position : '',
        dancers: dancers.map((man) => man.position),
    };
}

/**
 * WHERE EVERY BODY ACTUALLY IS, which is where the script wants it, kept apart.
 *
 * THE PATHS ARE WRITTEN ONE MAN AT A TIME, and nineteen men written one at a
 * time walk through each other: across the huddle, into the line in front of
 * the stand, and above all on the way back to a formation that is different on
 * every play. Staggering the starts was tried and could not be made to hold for
 * every formation.
 *
 * So this is the game's own answer (`play.separate`), run once when the plan is
 * made. At 60Hz every body follows its scripted spot with a short lag and
 * bodies closer than `clearance` are pushed apart, EXCEPT where two of them are
 * meant to be that close: the shoulder is meant to land, and two formation
 * spots are wherever the formation put them. Not "wherever the script puts
 * them", which was tried first: two paths crossing put two men at the same
 * spot, and the exemption then let them walk straight through each other. The last `settle` seconds blend onto the
 * script exactly, so the scene ends on the formation to the millimetre.
 *
 * Stored as positions per frame, so `castAt` is still a pure read at any `t`.
 */
function bake(paths, men, { bumper = null, bumped = null, contact = -1, bumpSide = 1, tableAt = null } = {}) {
    const T = O.props.table;
    const table = tableAt
        ? { x: tableAt.x, z: tableAt.z, halfX: T.width / 2 + O.bake.body, halfZ: T.depth / 2 + O.bake.body }
        : null;
    const S = O.stage;
    const hz = O.bake.hz;
    const frames = Math.ceil(O.length * hz) + 1;
    const n = men.length;
    const xs = men.map(() => new Float32Array(frames));
    const zs = men.map(() => new Float32Array(frames));
    const px = new Float64Array(n);
    const pz = new Float64Array(n);
    const dx = new Float64Array(n);
    const dz = new Float64Array(n);
    const ox = new Float64Array(n);
    const oz = new Float64Array(n);
    const follow = 1 - Math.exp(-1 / (hz * O.bake.lag));
    // How close each pair ends up in the formation, and which pair is the shoulder.
    const rest = new Float64Array(n * n);
    const pair = new Uint8Array(n * n);
    for (let i = 0; i < n; i += 1) {
        for (let j = i + 1; j < n; j += 1) {
            rest[i * n + j] = Math.hypot(men[j].x - men[i].x, men[j].z - men[i].z);
            const names = [men[i], men[j]];
            pair[i * n + j] = names.includes(bumper) && names.includes(bumped) ? 1 : 0;
        }
    }
    const settleFrom = O.length - O.bake.settle;
    const restFrom = Math.min(O.beats.homeBack[0], O.beats.awayBack[0]);
    for (let f = 0; f < frames; f += 1) {
        const t = f / hz;
        for (let i = 0; i < n; i += 1) {
            const want = along(paths.get(men[i].position), t);
            const knock = men[i] === bumped ? knockAt(t, contact, bumpSide) : { x: 0, z: 0 };
            dx[i] = want.x + knock.x;
            dz[i] = want.z + knock.z;
            if (f === 0) { px[i] = want.x; pz[i] = want.z; }
            px[i] += (dx[i] - px[i]) * follow;
            pz[i] += (dz[i] - pz[i]) * follow;
            ox[i] = f === 0 ? px[i] : xs[i][f - 1];
            oz[i] = f === 0 ? pz[i] : zs[i][f - 1];
        }
        for (let pass = 0; pass < O.bake.passes; pass += 1) {
            for (let i = 0; i < n; i += 1) {
                for (let j = i + 1; j < n; j += 1) {
                    const ex = px[j] - px[i];
                    const ez = pz[j] - pz[i];
                    const d = Math.hypot(ex, ez);
                    // Held to the formation's own gap only once both of them are
                    // nearly on their spots. Two men who end up stacked a metre
                    // apart do not jog the whole way back at a metre.
                    const arrived = t >= restFrom
                        && Math.hypot(px[i] - men[i].x, pz[i] - men[i].z) < S.clearance
                        && Math.hypot(px[j] - men[j].x, pz[j] - men[j].z) < S.clearance;
                    let need = arrived ? Math.min(S.clearance, rest[i * n + j]) : S.clearance;
                    if (pair[i * n + j] && Math.abs(t - contact) < O.bake.contact) {
                        need = Math.min(need, Math.hypot(dx[j] - dx[i], dz[j] - dz[i]));
                    }
                    if (d >= need) continue;
                    const nx = d > 1e-6 ? ex / d : 1;
                    const nz = d > 1e-6 ? ez / d : 0;
                    const push = (need - d) / 2;
                    px[i] -= nx * push; pz[i] -= nz * push;
                    px[j] += nx * push; pz[j] += nz * push;
                }
            }
        }
        // AND THE TABLE IS IN THE WAY OF ANYBODY WALKING PAST IT: a body inside
        // it, widened by half a body, is put back out through the nearest side.
        if (table) {
            for (let i = 0; i < n; i += 1) {
                const ux = px[i] - table.x;
                const uz = pz[i] - table.z;
                const ox2 = table.halfX - Math.abs(ux);
                const oz2 = table.halfZ - Math.abs(uz);
                if (ox2 <= 0 || oz2 <= 0) continue;
                if (ox2 < oz2) px[i] += Math.sign(ux || 1) * ox2;
                else pz[i] += Math.sign(uz || 1) * oz2;
            }
        }
        const w = t >= settleFrom ? smooth((t - settleFrom) / O.bake.settle) : 0;
        for (let i = 0; i < n; i += 1) {
            // NO SHOVE IS FASTER THAN A MAN CAN RUN: a push that would move a
            // body further than `fastest` allows is spread over the frames after.
            const mx = px[i] - ox[i];
            const mz = pz[i] - oz[i];
            const moved = Math.hypot(mx, mz);
            const most = O.bake.fastest / hz;
            if (moved > most) {
                px[i] = ox[i] + (mx / moved) * most;
                pz[i] = oz[i] + (mz / moved) * most;
            }
            if (w > 0) {
                px[i] += (dx[i] - px[i]) * w;
                pz[i] += (dz[i] - pz[i]) * w;
            }
            xs[i][f] = px[i];
            zs[i][f] = pz[i];
        }
    }
    return new Map(men.map((man, i) => [man.position, { x: xs[i], z: zs[i] }]));
}

/**
 * HOW FAR THE SHOULDER HAS CARRIED THE MAN WHO TOOK IT, as metres to add to
 * where the script has him: along the way the column is walking, and out a
 * little. He stays where it put him until the home team turns on the visitors.
 */
function knockAt(t, contact, side) {
    if (!(contact >= 0) || t < contact) return { x: 0, z: 0 };
    const S = O.stage;
    const D = O.moves.knock;
    const hit = smooth((t - contact) / D.time);
    const held = hit * (t < O.beats.toLine[0] ? 1 : 1 - span(t, O.beats.toLine));
    return { x: side * S.knock * D.out * held, z: S.knock * held };
}

/** Where a baked body is at `t`, between two stored frames. */
function bodyAt(body, t) {
    const f = Math.max(0, Math.min(body.x.length - 1, t * O.bake.hz));
    const a = Math.floor(f);
    const b = Math.min(body.x.length - 1, a + 1);
    const k = f - a;
    return { x: body.x[a] + (body.x[b] - body.x[a]) * k, z: body.z[a] + (body.z[b] - body.z[a]) * k };
}

/** A pose entry in the shape `celebration.celebrationAt` hands the view. */
function pose(fields = {}) {
    return {
        x: 0, z: 0, y: 0, face: null, watch: null, spin: 0, lean: 0, roll: 0,
        arms: '', amount: 0, raised: false, running: false, ...fields,
    };
}

/** Whole hops over `[a, b]`, so a man never freezes in the air at the end. */
function hops(t, [a, b], height, hz) {
    const dur = Math.max(1e-6, b - a);
    const n = Math.max(1, Math.round(dur * hz));
    const u = span(t, [a, b]);
    return u <= 0 || u >= 1 ? 0 : height * Math.abs(Math.sin(Math.PI * n * u));
}

/**
 * WHERE EVERY MAN IN THE SCENE IS AT `t`, AND WHAT HE IS DOING.
 *
 * A Map of position to `{ x, z, team, running, pose }`, where `pose` is the
 * celebration entry view.js already knows how to draw: facing, arms, lean,
 * roll and hop.
 */
export function castAt(plan, t) {
    const out = new Map();
    if (!plan) return out;
    const B = O.beats;
    const S = O.stage;
    const D = O.moves;
    const where = new Map();
    for (const man of plan.men) {
        const path = plan.paths.get(man.position);
        const body = plan.bodies ? plan.bodies.get(man.position) : null;
        const at = path
            ? { ...along(path, t), ...(body ? bodyAt(body, t) : {}) }
            : { ...plan.still.get(man.position), running: false };
        where.set(man.position, at);
    }
    const spotOf = (position) => where.get(position) || plan.huddle;

    for (const man of plan.men) {
        const at = where.get(man.position);
        let x = at.x;
        let z = at.z;
        const home = man.team === 0;
        const settle = !plan.calm && t >= B.lineUp[1] - 0.1;
        let fields;

        if (plan.calm) {
            if (home) {
                fields = { face: 0, arms: 'low', amount: 1, lean: D.menace.lean };
            } else if (man.position === plan.captain) {
                fields = t >= O.calm.keys[1][0] && t < O.calm.keys[2][0]
                    ? { face: bearing(at, plan.lens), arms: 'point', amount: 1 }
                    : { face: 0, arms: 'wide', amount: 1 };
            } else {
                fields = { face: 0, arms: 'point', amount: 1 };
            }
        } else if (settle || t >= B.lineUp[0]) {
            // Walking back to where the game wants him, then turned the way the
            // formation faces, arms down.
            fields = settle ? { face: DOWNFIELD[man.team] } : {};
        } else if (home) {
            fields = homeAt(plan, man, t, at, spotOf, D);
            if (man.position === plan.bumped && t >= plan.contact) {
                // KNOCKED ASIDE, AND HE STAYS WHERE THE SHOULDER PUT HIM until
                // the whole line forms up.
                // Where he is carried is in the baked position already (`knockAt`).
                const hit = smooth((t - plan.contact) / D.knock.time);
                const sway = Math.exp(-(t - plan.contact) / D.knock.decay) * hit;
                fields = {
                    ...fields,
                    watch: spotOf(plan.bumper),
                    roll: plan.bumpSide * D.knock.roll * sway,
                    lean: -D.knock.lean * sway,
                };
            }
        } else {
            fields = awayAt(plan, man, t, at, D);
        }
        out.set(man.position, {
            x, z, team: man.team, running: at.running,
            pose: pose({ ...fields, running: at.running }),
        });
    }
    return out;
}

/** The home team, from the run-out to the moment they walk back. */
function homeAt(plan, man, t, at, spotOf, D) {
    const B = O.beats;
    if (at.running) return {};
    if (t < B.breakUp[1] + 0.2) {
        const up = envelope(t, B.breakUp, 0.12);
        return {
            face: bearing(at, plan.huddle),
            arms: up > 0 ? 'up' : '',
            amount: up,
            y: hops(t, B.breakUp, D.hop, 2),
        };
    }
    if (t < B.toLine[0]) {
        // Watching the visitors come, and then the man at the cooler.
        const watch = t < B.visitors[1] ? spotOf(plan.bumper) : spotOf(plan.captain);
        return { watch };
    }
    // THE ANSWER: facing the visitors, leaning in, stamping.
    const angry = span(t, [B.toLine[1] - 0.1, B.menace[0] + 0.15]);
    return {
        face: 0,
        arms: angry > 0 ? 'low' : '',
        amount: angry,
        lean: D.menace.lean * angry,
        y: hops(t, B.menace, D.menace.stamp, D.menace.hz),
    };
}

/**
 * HOW FAR ROUND THE CAPTAIN IS TURNED FOR THE SWIPE, in radians added to his
 * facing. With both arms out, the arm on his left points straight at whatever
 * he faces when he is turned -90 degrees, and the sweep carries it through that
 * from `wind` before to `follow` after, at a steady rate so the moment it
 * crosses is exactly `plan.hit`.
 */
export function swipeSpin(t) {
    const B = O.beats;
    const W = O.moves.swipe;
    const from = -(Math.PI / 2 + W.wind);
    const to = -(Math.PI / 2) + W.follow;
    if (t < B.swipeWind[0] || t >= B.swipeBack[1]) return 0;
    if (t < B.swipeWind[1]) return from * smooth(span(t, B.swipeWind));
    if (t < B.swipeSweep[1]) return from + (to - from) * span(t, B.swipeSweep);
    return to * (1 - smooth(span(t, B.swipeBack)));
}

/** A number from 0 to 1 that is the same every time for the same `i` and `k`. */
function roll(i, k) {
    let h = (i * 374761393 + k * 668265263) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The cooler's middle and how far over it is, `since` seconds after the hit. */
function coolerState(plan, since) {
    const P = O.props;
    const c = plan.cooler;
    const d = plan.tipDir;
    const top = P.table.height;
    const r = P.cooler.radius;
    const h = P.cooler.height;
    if (since < 0) return { x: c.x, y: top + h / 2, z: c.z, tip: 0 };
    if (since < P.tipTime) {
        // Over it goes, faster and faster, sliding for the edge as it tips.
        const u = since / P.tipTime;
        const tip = (Math.PI / 2) * u * u;
        const slide = (P.table.width / 2) * u;
        return {
            x: c.x + d.x * slide,
            y: top + (h / 2) * Math.cos(tip) + r * Math.sin(tip),
            z: c.z + d.z * slide,
            tip,
        };
    }
    // ...and off the edge, landing on its side.
    const v = clamp01((since - P.tipTime) / P.fallTime);
    const out = P.table.width / 2 + P.fallOut * v;
    return {
        x: c.x + d.x * out,
        y: top + r + (r - (top + r)) * v * v,
        z: c.z + d.z * out,
        tip: Math.PI / 2,
    };
}

/** Where the open end of the cooler is, which is where the water comes from. */
function mouthOf(plan, state) {
    const along = O.props.cooler.height / 2;
    return {
        x: state.x + plan.tipDir.x * Math.sin(state.tip) * along,
        y: state.y + Math.cos(state.tip) * along,
        z: state.z + plan.tipDir.z * Math.sin(state.tip) * along,
    };
}

/**
 * THE COOLER, ITS LID, THE WATER AND THE PUDDLE AT `t`.
 *
 * `{ table, cooler, lid, splash, puddle }`, all in world metres: `cooler.tip`
 * is radians over toward `tipDir`, `lid` is null while it is still on,
 * `splash` fills `into` (x, y, z per drop, a drop not in the air parked far
 * below the grass), and `puddle.size` runs 0 to 1. The calm version is the
 * aftermath and nothing moving: over, lid off, puddle spread, no water in the
 * air.
 */
export function propsAt(plan, t, into = null) {
    const P = O.props;
    const since = plan.calm ? Infinity : t - plan.hit;
    const d = plan.tipDir;
    const cooler = coolerState(plan, since);

    // THE LID goes when it is part way over, and lands flat.
    let lid = null;
    if (since >= P.lid.at) {
        const at = coolerState(plan, P.lid.at);
        const from = mouthOf(plan, at);
        const g = P.gravity;
        const rest = P.cooler.lid / 2;
        const air = (P.lid.up + Math.sqrt(P.lid.up * P.lid.up + 2 * g * Math.max(0, from.y - rest))) / g;
        const tau = Math.min(since - P.lid.at, air);
        const k = air > 0 ? tau / air : 1;
        lid = {
            x: from.x + d.x * P.lid.out * tau,
            y: Math.max(rest, from.y + P.lid.up * tau - (g / 2) * tau * tau),
            z: from.z + d.z * P.lid.out * tau,
            tip: at.tip * (1 - k) + Math.PI * 2 * k,
        };
    }

    // THE WATER: every drop born at the mouth over `over` seconds, thrown out
    // the way the cooler fell, fanned sideways, and gone after `life`.
    const S = P.splash;
    const out = into || new Float32Array(S.count * 3);
    const side = { x: -d.z, z: d.x };
    const start = P.tipTime * 0.6;
    for (let i = 0; i < S.count; i += 1) {
        const born = start + S.over * (i / S.count);
        const age = since - born;
        if (!(age >= 0 && age <= S.life)) {
            out[i * 3] = 0; out[i * 3 + 1] = -1e4; out[i * 3 + 2] = 0;
            continue;
        }
        const from = mouthOf(plan, coolerState(plan, born));
        const speed = S.speed[0] + (S.speed[1] - S.speed[0]) * roll(i, 1);
        const fan = (roll(i, 2) - 0.5) * S.spread;
        const up = S.up[0] + (S.up[1] - S.up[0]) * roll(i, 3);
        out[i * 3] = from.x + (d.x + side.x * fan) * speed * age;
        out[i * 3 + 1] = Math.max(0.03, from.y + up * age - (P.gravity / 2) * age * age);
        out[i * 3 + 2] = from.z + (d.z + side.z * fan) * speed * age;
    }

    // THE PUDDLE, spreading out from where the mouth lands.
    const landed = coolerState(plan, P.tipTime + P.fallTime);
    const mouth = mouthOf(plan, landed);
    const grow = clamp01((since - (P.tipTime + P.fallTime * 0.7)) / P.puddle.grow);
    const puddle = {
        x: mouth.x + d.x * P.puddle.radius * 0.6,
        z: mouth.z + d.z * P.puddle.radius * 0.6,
        size: 1 - (1 - grow) * (1 - grow),
        angle: Math.atan2(d.x, d.z),
    };

    return { table: { x: plan.tableAt.x, z: plan.tableAt.z }, cooler, lid, splash: out, puddle };
}

/** The visitors, from the walk-through to the moment they walk back. */
function awayAt(plan, man, t, at, D) {
    const B = O.beats;
    if (at.running) return {};
    if (man.position === plan.captain) {
        if (t < B.point[0]) {
            const sw = envelope(t, [B.swipeWind[0], B.swipeBack[1]], 0.12);
            return {
                face: bearing(at, plan.cooler),
                arms: sw > 0 ? 'wide' : '',
                amount: sw,
                spin: swipeSpin(t),
            };
        }
        // DOWN THE LENS, and two jabs of it.
        const on = span(t, [B.point[0] + 0.1, B.point[0] + 0.3]);
        const u = span(t, B.point);
        return {
            face: bearing(at, plan.lens),
            arms: 'point',
            amount: on,
            lean: D.jab * Math.sin(Math.PI * 4 * u) * on,
        };
    }
    if (t < B.dance[0]) return { face: 0 };
    if (t < B.dance[1]) {
        const i = plan.dancers.indexOf(man.position);
        const on = envelope(t, B.dance, 0.15);
        const u = span(t, B.dance);
        const dur = B.dance[1] - B.dance[0];
        if (i % 2 === 0) {
            return {
                face: 0, arms: 'point', amount: on,
                lean: D.jab * Math.sin(Math.PI * 2 * Math.round(dur * 1.5) * u) * on,
                y: hops(t, B.dance, D.hop * 0.4, 1.5),
            };
        }
        const cycles = Math.max(1, Math.round(dur * D.shimmy.hz));
        return {
            face: 0, arms: 'low', amount: on,
            roll: D.shimmy.roll * Math.sin(Math.PI * 2 * cycles * u) * on,
            y: hops(t, B.dance, D.hop * 0.3, D.shimmy.hz),
        };
    }
    // And then they turn round to see what the home team makes of it.
    return { face: Math.PI };
}

/** How long it runs, in seconds. The calm version is shorter. */
export function openingLength({ calm = false } = {}) {
    return calm ? O.calm.length : O.length;
}

/**
 * THE CAMERA AT `t`: between two keys it eases from one shot to the next, two
 * keys naming the same shot are a hold, and two keys at one moment are a cut.
 *
 * CALM IS CUTS ONLY. A camera flying across a stadium is exactly the motion
 * that preference is about, so the calm keys are held tableaux and the shot
 * switches between them.
 */
export function shotAt(t, { aspect = 1.78, calm = false } = {}) {
    const keys = calm ? O.calm.keys : O.keys;
    if (calm) {
        let name = keys[0][1];
        for (const [at, shot] of keys) if (t >= at) name = shot;
        return openingShot(name, aspect);
    }
    if (t <= keys[0][0]) return openingShot(keys[0][1], aspect);
    for (let i = 1; i < keys.length; i += 1) {
        const [t1, b] = keys[i];
        // `<` rather than `<=`, so two keys at one moment are a cut to the
        // second rather than a blend over no time at all.
        if (t < t1) {
            const [t0, a] = keys[i - 1];
            const f = (t - t0) / Math.max(1e-6, t1 - t0);
            return a === b ? openingShot(a, aspect)
                : blendShot(openingShot(a, aspect), openingShot(b, aspect), f);
        }
    }
    return openingShot(keys[keys.length - 1][1], aspect);
}

/** How much of the title is showing, 0 to 1: faded in, held, faded out. */
export function titleAt(t, { calm = false } = {}) {
    const T = calm ? O.calm.title : O.title;
    const fade = Math.max(1e-6, O.titleFade);
    return clamp01(Math.min((t - T[0]) / fade, (T[1] - t) / fade));
}

/**
 * WHAT IS TRUE `t` SECONDS IN.
 *
 * `speak` is true from the moment the title starts to arrive, once, and is the
 * cue for the one sentence a screen reader gets: the title itself is
 * aria-hidden, and a fading title would otherwise be read twice.
 */
export function openingFrame(t, { aspect = 1.78, calm = false } = {}) {
    const T = calm ? O.calm.title : O.title;
    return {
        shot: shotAt(t, { aspect, calm }),
        title: titleAt(t, { calm }),
        speak: t >= T[0],
        done: t >= openingLength({ calm }),
    };
}
