// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * playback.js - a race day played back (M1): where each car is at any
 * moment of a run, and the day as a timeline of heats, each staged, run,
 * sometimes replayed slowly, and shown on the board.
 *
 * THE SCENE IS A PLAYER, NOT A SIMULATION (PLANNING, Principles). The sim
 * ran every car in every lane before the first heat, recording each run's
 * samples. Here they are only read: a position is interpolated between two
 * samples, so a 60 Hz and a 144 Hz screen show the same race, and slow
 * motion is the clock running slower, never a second simulation.
 *
 * PURE: no three.js, no DOM.
 */

import { DERBY_CONFIG } from './config.min.js';

/**
 * Where a run's car is `t` seconds after the gate: its nose's distance along
 * the track. Before the gate, at the pin. Between samples, linearly. Past the
 * finish line, running out at its finishing speed and slowing evenly to a
 * stop over `runOut` meters (the braking section).
 */
export function positionAt(run, t, C = DERBY_CONFIG) {
    const samples = run.samples;
    if (!samples || !samples.length || t <= 0) return 0;
    const course = C.track.courseLength;
    if (t >= run.time) {
        if (run.dnf) return run.stoppedAt === undefined ? samples[samples.length - 1].s : run.stoppedAt;
        const v = run.speed;
        const runOut = C.timing.runOut;
        if (v <= 0) return course;
        const decel = (v * v) / (2 * runOut);
        const dt = Math.min(t - run.time, v / decel);
        return course + v * dt - 0.5 * decel * dt * dt;
    }
    let lo = 0;
    let hi = samples.length - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (samples[mid].t <= t) lo = mid;
        else hi = mid;
    }
    const a = samples[lo];
    const b = samples[hi];
    const span = b.t - a.t;
    const f = span > 0 ? (t - a.t) / span : 0;
    return a.s + (b.s - a.s) * (f < 0 ? 0 : f > 1 ? 1 : f);
}

/** A heat in finishing order: by the time the timer shows, a tie on it by
 *  the unrounded time (D14's rule, for a heat), and only a dead heat by
 *  entry order. */
export function heatOrder(heat) {
    const exact = (r) => (r.exact === undefined ? r.time : r.exact);
    return heat.slice().sort((a, b) => a.time - b.time || exact(a) - exact(b) || a.car - b.car);
}

/**
 * The closest finish in a heat worth a slow replay: the two closest times,
 * when they are within `closeGap` of each other, and, when the visitor is
 * racing (`focus`), only if one of the two is theirs. Returns
 * { first, second, gap } (car indexes) or null.
 */
export function closeFinish(heat, { focus = null, closeGap = DERBY_CONFIG.timing.closeGap } = {}) {
    const order = heatOrder(heat.filter((r) => !r.dnf));
    let best = null;
    for (let i = 1; i < order.length; i++) {
        const gap = order[i].time - order[i - 1].time;
        const involves = focus === null || order[i].car === focus || order[i - 1].car === focus;
        if (involves && gap < closeGap && (!best || gap < best.gap)) {
            const exactAt = order[i - 1].exact === undefined ? order[i - 1].time : order[i - 1].exact;
            best = { first: order[i - 1].car, second: order[i].car, gap, at: order[i - 1].time, exactAt };
        }
    }
    return best;
}

/**
 * The race day's timeline: for each heat a staging beat (the cars at the
 * pin), the gate, the run (until the last car is across and settled), a slow
 * replay of a close finish (none under reduced motion), a photo finish for
 * a very close one (held on the winner's crossing, mid-replay, and kept
 * under reduced motion as the still it is), and the times on the board. Returns { heats: [{ index, start, segments }], total } where a
 * segment is { kind, from, to } in timeline seconds, and a replay's carries
 * the run time it shows ({ runFrom, runTo, rate }). With `dance`, the last
 * heat ends with the winner's family dancing (a 'dance' segment).
 */
export function planDay(race, { focus = null, reducedMotion = false, dance = false } = {}, C = DERBY_CONFIG) {
    const T = C.timing;
    const heats = [];
    let clock = 0;
    race.heats.forEach((heat, index) => {
        const start = clock;
        const segments = [];
        const add = (kind, seconds, extra = {}) => {
            segments.push({ kind, from: clock, to: clock + seconds, ...extra });
            clock += seconds;
        };
        add('staging', T.staging);
        add('gate', T.gate);
        let last = 0;
        for (const r of heat) last = Math.max(last, race.runs[r.car][r.lane].time);
        add('run', last + T.settle, { runFrom: 0 });
        const close = closeFinish(heat, { focus, closeGap: T.closeGap });
        // A finish this tight is also frozen on the winner's crossing.
        const photo = Boolean(close) && close.gap < T.photoGap;
        if (close && !reducedMotion) {
            const runFrom = Math.max(0, close.at - T.replayLead);
            const runTo = close.at + close.gap + T.replayTail;
            const mid = close.at + close.gap / 2;
            // Slowing into the line, and on out of it; with a photo finish,
            // stopped dead on the winner's crossing between the two.
            // The photo is taken as the winner's nose meets the line: its
            // unrounded time.
            const at = close.exactAt;
            const parts = photo ? [[runFrom, at], [at, runTo]] : [[runFrom, runTo]];
            parts.forEach(([a, b], k) => {
                if (k === 1) add('photo', T.photo, { runAt: at, close });
                const warp = replayWarp(a, b, mid, T);
                add('replay', warp.seconds, { runFrom: a, runTo: b, warp, close });
            });
        } else if (photo) {
            // Reduced motion: no replay, but the photo, a still, is kept.
            add('photo', T.photo, { runAt: close.exactAt, close });
        }
        add('times', T.times);
        // After the last heat, the day's winner's grown-up dances (dancer.js),
        // when asked for. Never under reduced motion.
        if (dance && !reducedMotion && index === race.heats.length - 1) add('dance', T.dance);
        heats.push({ index, start, end: clock, segments, close });
    });
    return { heats, total: clock };
}

/**
 * The countdown at timeline second `t` in `seg`: 3, 2 or 1 over the last
 * three counts of a staging beat, 0 ("Go!") through the gate and the run's
 * first count (the gate alone is too quick to read), otherwise null (the
 * staging's quiet start, and the rest of the heat).
 */
export function countAt(seg, t, C = DERBY_CONFIG) {
    if (!seg) return null;
    const step = C.timing.count;
    if (seg.kind === 'gate') return 0;
    if (seg.kind === 'run') return t - seg.from < step ? 0 : null;
    if (seg.kind !== 'staging') return null;
    const left = seg.to - t;
    if (left > 3 * step || left <= 0) return null;
    return Math.min(3, Math.ceil(left / step));
}

/** How fast the replay plays at run second `s` (run seconds a second):
 *  slowest at `mid` (between the two crossings), easing up away from it. */
export function replaySpeed(s, mid, T = DERBY_CONFIG.timing) {
    const u = Math.min(1, Math.abs(s - mid) / T.replayWidth);
    return T.replaySlow + (T.replayFast - T.replaySlow) * u * u;
}

/**
 * The replay of run seconds `from` to `to`, its speed easing down to the
 * line and up again (replaySpeed): { seconds (how long it plays), times,
 * runs }, the screen second at each sampled run second, for runTimeIn to
 * read back. A changing rate is integrated, never stepped, so it never
 * lurches.
 */
export function replayWarp(from, to, mid, T = DERBY_CONFIG.timing) {
    const step = 0.0005;
    const times = [0];
    const runs = [from];
    let tau = 0;
    let s = from;
    while (s < to - 1e-12) {
        const ds = Math.min(step, to - s);
        tau += ds / replaySpeed(s + ds / 2, mid, T);
        s += ds;
        times.push(tau);
        runs.push(s);
    }
    return { seconds: tau, times, runs };
}

/** The run second a warped replay shows `tau` seconds in. */
function warpAt(warp, tau) {
    const { times, runs } = warp;
    if (tau <= 0) return runs[0];
    if (tau >= times[times.length - 1]) return runs[runs.length - 1];
    let lo = 0;
    let hi = times.length - 1;
    while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (times[m] <= tau) lo = m;
        else hi = m;
    }
    const f = (tau - times[lo]) / (times[hi] - times[lo]);
    return runs[lo] + (runs[hi] - runs[lo]) * f;
}

/**
 * What is happening at timeline second `t`: the heat, the segment, and the
 * run time the cars are at (0 while staging, rising through the run, the
 * slow stretch during a replay, the run's end while the times show).
 * Past the end, the last heat's times. Returns { heat, segment, runTime,
 * done }.
 */
export function momentAt(plan, t) {
    if (!plan.heats.length) return { heat: 0, segment: null, runTime: 0, done: true };
    for (const h of plan.heats) {
        if (t >= h.end) continue;
        for (const seg of h.segments) {
            if (t < seg.to) return { heat: h.index, segment: seg, runTime: runTimeIn(h, seg, t), done: false };
        }
    }
    const h = plan.heats[plan.heats.length - 1];
    const seg = h.segments[h.segments.length - 1];
    return { heat: h.index, segment: seg, runTime: runTimeIn(h, seg, t), done: true };
}

function runTimeIn(heat, seg, t) {
    if (seg.kind === 'staging' || seg.kind === 'gate') return 0;
    if (seg.kind === 'run') return t - seg.from;
    if (seg.kind === 'replay') return warpAt(seg.warp, t - seg.from);
    if (seg.kind === 'photo') return seg.runAt;
    // The times: the run as it ended.
    const run = heat.segments.find((s) => s.kind === 'run');
    return run ? run.to - run.from : 0;
}
