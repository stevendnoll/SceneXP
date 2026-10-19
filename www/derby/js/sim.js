// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * sim.js - the race: one car down one lane, timed to the ten-thousandth,
 * then four heats with every car in every lane, averaged, and why each car
 * was as fast as it was.
 *
 * THE MODEL (PRD, The physics). A car rolls along the track's length, its
 * nose at `s` and its center of mass `comX` behind it. Each step:
 *
 *   (m + rotating mass) a = m g sin(slope at the CoM)
 *                           - (axle + rolling) x load
 *                           - side rub - drag
 *
 * where the load is m (g cos(slope) + v squared x curvature), heavier in the
 * transition, as a real car presses into the curve. Nothing is added for
 * rear weight or for mass: a rear-weighted car is faster because its center
 * of mass starts higher up the slope and stays on it longer, and a heavy car
 * is faster because drag, side rub and the spinning wheels do not grow with
 * its mass. Both fall out of the geometry, as Mann, Gibbs and Sah found
 * (Mechanical Sciences 3, 2012).
 *
 * DETERMINISM (PRD). A fixed timestep, never the frame rate, and only
 * + - * / and sqrt (exact in every engine). The same car posts the same time
 * on every device, which is what lets the share clip be a replay and a
 * challenge link be fair. tests/derby-sim.test.mjs holds golden times and
 * reads this file for any other Math call.
 *
 * PURE: no three.js, no DOM. Run under Node by scripts/derby-field.mjs.
 */

import { DERBY_CONFIG } from './config.min.js';

/**
 * The track at `s` (meters from the start pin, negative up the slope behind
 * it): the sine and cosine of its slope, its curvature (positive where it
 * curves up, in the transition) and its height above the flat.
 */
export function trackAt(s, C = DERBY_CONFIG) {
    const T = C.track;
    const S0 = T.slopeSine;
    const L1 = T.slopeLength;
    const Lt = T.transitionLength;
    const H = S0 * (L1 + Lt / 2);
    if (s <= L1) {
        return { sin: S0, cos: Math.sqrt(1 - S0 * S0), curvature: 0, height: H - S0 * s };
    }
    if (s < L1 + Lt) {
        const u = s - L1;
        const sin = S0 * (1 - u / Lt);
        const cos = Math.sqrt(1 - sin * sin);
        return { sin, cos, curvature: S0 / Lt / cos, height: H - S0 * L1 - S0 * (u - (u * u) / (2 * Lt)) };
    }
    return { sin: 0, cos: 1, curvature: 0, height: 0 };
}

/** The height the start pin stands above the flat. */
export function startHeight(C = DERBY_CONFIG) {
    return trackAt(0, C).height;
}

/**
 * The side rub a car has at its balance point: its own, plus the wobble of
 * a center of mass too close to the rear axle (PRD, Too far back), and the
 * front lifting clear when it is behind the axle.
 */
export function sideRubOf(car, C = DERBY_CONFIG) {
    const W = C.physics.wobble;
    if (car.balance < 0) return car.sideRub + W.extra + W.wheelie;
    if (car.balance >= W.safe) return car.sideRub;
    const inside = (W.safe - car.balance) / W.safe;
    return car.sideRub + W.extra * inside * inside;
}

/**
 * One car down one lane, from rest at the start pin to the finish line.
 * `lane` is 0 to 3, or null for a lane with no defect (the Why lines, the
 * tuning script). Returns { time, speed, dnf }, and with `record` a sample
 * every `record` seconds, { t, s, v }, for the scene to play back.
 */
export function runCar(car, lane = null, { record = 0 } = {}, C = DERBY_CONFIG) {
    const P = C.physics;
    const g = P.g;
    const dt = P.dt;
    const course = C.track.courseLength;
    const m = car.mass;
    const mEff = m + car.rotatingMass;
    const defect = lane === null ? 0 : C.laneDefects[lane] || 0;
    const muAxle = car.axleMu * car.axleRatio;
    const rub = sideRubOf(car, C);
    const halfRhoCdA = 0.5 * P.airDensity * car.cdA;
    const L1 = C.track.slopeLength;

    // The side rub is a force, the wobble in it only once the car is through
    // the slope and into the curve.
    const coeff = muAxle + P.rollingResistance + defect;
    const accel = (s, v) => {
        const at = s - car.comX;
        const tr = trackAt(at, C);
        const load = m * (g * tr.cos + v * v * tr.curvature);
        const side = at > L1 ? rub : car.sideRub;
        return (m * g * tr.sin - coeff * load - side - halfRhoCdA * v * v) / mEff;
    };

    const samples = record > 0 ? [{ t: 0, s: 0, v: 0 }] : null;
    const every = record > 0 ? Math.round(record / dt) : 0;
    let s = 0;
    let v = 0;
    let t = 0;
    let step = 0;
    const steps = Math.round(P.maxSeconds / dt);
    while (step < steps) {
        // Midpoint (second order): honest to well under a thousandth.
        const a1 = accel(s, v);
        const vMid = v + a1 * dt / 2;
        const a2 = accel(s + v * dt / 2, vMid);
        const sNext = s + vMid * dt;
        const vNext = v + a2 * dt;
        step++;
        if (sNext >= course) {
            const f = (course - s) / (sNext - s);
            const time = t + dt * f;
            const speed = v + (vNext - v) * f;
            if (samples) samples.push({ t: time, s: course, v: speed });
            return { time, speed, dnf: false, samples };
        }
        if (vNext <= 0 && step > 1) {
            return { time: P.maxSeconds, speed: 0, dnf: true, samples, stoppedAt: s };
        }
        s = sNext;
        v = vNext;
        t = step * dt;
        if (samples && step % every === 0) samples.push({ t, s, v });
    }
    return { time: P.maxSeconds, speed: v, dnf: true, samples, stoppedAt: s };
}

/** A time as the timer shows it: to the thousandth. */
export function shownTime(seconds) {
    return Math.round(seconds * 1000) / 1000;
}

/**
 * A race (PRD, The heats): one to four cars, four heats, each car moving one
 * lane over every heat, so every car runs every lane once. Averages are the
 * four heats', as the timer shows them. Standings are by average, a tie on
 * the board broken by the unrounded times, and only a dead heat kept in
 * entry order. Also each lane's average over the heats it ran, for
 * the results' lane row. With `record`, every run's samples come back too
 * (`runs[car][lane]`), so the hall plays exactly the race the board scores.
 */
export function runRace(cars, C = DERBY_CONFIG, { record = 0 } = {}) {
    const lanes = C.track.lanes;
    const times = cars.map((car) => {
        const row = [];
        for (let lane = 0; lane < lanes; lane++) row.push(runCar(car, lane, { record }, C));
        return row;
    });
    const heats = [];
    for (let h = 0; h < lanes; h++) {
        heats.push(cars.map((_, i) => {
            const lane = (i + h) % lanes;
            const run = times[i][lane];
            return { car: i, lane, time: shownTime(run.time), dnf: run.dnf };
        }));
    }
    const average = cars.map((_, i) => {
        let sum = 0;
        for (const heat of heats) sum += heat[i].time;
        return shownTime(sum / heats.length);
    });
    // A tie on the board goes to the faster time the timer measured before
    // rounding, as a real timer reading finer than it shows would decide it.
    const exact = cars.map((_, i) => {
        let sum = 0;
        for (let lane = 0; lane < lanes; lane++) sum += times[i][lane].time;
        return sum;
    });
    const best = cars.map((_, i) => {
        let pick = heats[0][i];
        for (const heat of heats) if (heat[i].time < pick.time) pick = heat[i];
        return pick;
    });
    const standings = cars.map((_, i) => i).sort((a, b) => average[a] - average[b] || exact[a] - exact[b] || a - b);
    const laneAverage = [];
    for (let lane = 0; lane < lanes; lane++) {
        let sum = 0;
        let n = 0;
        for (const heat of heats) for (const r of heat) if (r.lane === lane) { sum += r.time; n++; }
        laneAverage.push(n ? shownTime(sum / n) : null);
    }
    return { heats, average, best, standings, laneAverage, runs: times };
}

/** A car's time in a lane with no defect, for comparing one change. */
export function neutralTime(car, C = DERBY_CONFIG) {
    return runCar(car, null, {}, C).time;
}

/**
 * Why a car ran as it did (PRD, The results): for each thing a builder
 * controls, what it was worth against the kit as it comes (`saved`) and what
 * is still on the table (`more`), in seconds, each found by running the car
 * again with that one thing changed. Outlaw cars are measured against the
 * Outlaw limits.
 *
 * The references: the kit block's own weight (`kitMass`) and the rule
 * sheet's full weight, `idealBalance` (meters in front of the rear axle),
 * every axle tune-up, and for the shape the kit block's drag area
 * (`blockCdA`) and the best shape's (`bestCdA`), passed in since they come
 * from car.js. Weight is measured against the kit's weight, not against
 * the car with its weights taken out: a carved wedge with no weights is a
 * car nobody races.
 */
export function explain(car, { kitMass, blockCdA, bestCdA, idealBalance }, C = DERBY_CONFIG) {
    const base = neutralTime(car, C);
    const R = C.rules[car.rules] || C.rules.standard;
    const stock = C.physics.axleFriction.stock;
    const fullAxle = stock * C.physics.axleFriction.deburred
        * C.physics.axleFriction.polish.reduce((a, f) => a * f, 1) * C.physics.axleFriction.graphite;
    const variant = (patch) => neutralTime({ ...car, ...patch }, C);
    const withBalance = (balance) => ({ balance, comX: car.rearAxle - balance });
    const lines = [
        // Weight: against the kit's own weight, and against the sheet's limit.
        { id: 'weight', saved: variant({ mass: kitMass }) - base, more: base - variant({ mass: R.maxMass }) },
        // Balance: against a centered car (halfway between the axles), and
        // against the ideal.
        {
            id: 'balance',
            saved: variant(withBalance((car.rearAxle - car.frontAxle) / 2)) - base,
            more: base - variant(withBalance(idealBalance))
        },
        { id: 'axles', saved: variant({ axleMu: stock }) - base, more: base - variant({ axleMu: fullAxle }) },
        {
            id: 'alignment',
            saved: variant({ sideRub: C.physics.sideRub.misaligned }) - base,
            more: base - variant({ sideRub: C.physics.sideRub.aligned })
        },
        { id: 'shape', saved: variant({ cdA: blockCdA }) - base, more: base - variant({ cdA: bestCdA }) }
    ];
    return { time: base, lines };
}
