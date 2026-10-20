// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Derby Day's race on screen (M1), from SOURCE: the pure parts under the
 * hall. playback.js (where every car is, the day's timeline), director.js
 * (which shot, where the camera goes), track.js's path and car pose,
 * phases.js, copy.js's sentences, carmesh.js's outline, and the tie-break.
 *
 * What is held here, and why:
 * - PLAYBACK IS THE RACE THE BOARD SCORES: a car crosses the line at
 *   exactly its recorded time, and slow motion never changes a time.
 * - EVERY SHOT HOLDS THE FOUR LANES on a portrait phone.
 * - A tie on the board goes to the finer reading, never to whoever is
 *   listed first (the visitor always is).
 * - The copy keeps the house style.
 */
import { installThree } from './helpers/three-stub.mjs';

installThree();
const { DERBY_CONFIG: C, IN } = await import('../www/derby/js/config.js');
const Car = await import('../www/derby/js/car.js');
const Sim = await import('../www/derby/js/sim.js');
const P = await import('../www/derby/js/playback.js');
const D = await import('../www/derby/js/director.js');
const T = await import('../www/derby/js/track.js');
const Ph = await import('../www/derby/js/phases.js');
const Copy = await import('../www/derby/js/copy.js');
const Mesh = await import('../www/derby/js/carmesh.js');

// The builds M1's presets were (config.presets until M3 replaced them with
// the garage), kept here as fixtures so these numbers stay comparable.
const PRESETS = {
    box: { design: 'block', ballast: null, tune: { deburr: false, polish: 0, graphite: false, align: false, sand: 0 } },
    tuned: { design: 'wedge', ballast: { mass: 5, balance: 1 }, tune: { deburr: true, polish: 3, graphite: true, align: true, sand: 0.5 } },
    full: { design: 'thinWedge', ballast: { mass: 5, balance: 0.8 }, tune: { deburr: true, polish: 5, graphite: true, align: true, sand: 1 } }
};
const preset = (id) => {
    const p = PRESETS[id];
    return Car.describeCar(Car.buildFromDesign(p.design, { tune: p.tune, ballast: p.ballast }));
};
const fieldCar = (i) => Car.describeCar(Car.buildFromField(C.field[i]));
const raceOf = (cars) => Sim.runRace(cars, C, { record: C.timing.record });

describe('playback', () => {
    const race = raceOf([preset('tuned'), ...C.divisions.medium.map(fieldCar)]);
    const run = race.runs[0][0];

    test('a car is at the pin before the gate, crosses the line at exactly its time, and runs out to a stop', () => {
        expect(P.positionAt(run, -1)).toBe(0);
        expect(P.positionAt(run, 0)).toBe(0);
        expect(P.positionAt(run, run.time)).toBeCloseTo(C.track.courseLength, 9);
        // Always forward.
        let last = 0;
        for (let t = 0; t < run.time + 3; t += 0.01) {
            const s = P.positionAt(run, t);
            expect(s).toBeGreaterThanOrEqual(last - 1e-12);
            last = s;
        }
        // It stops within the run-out, and stays stopped.
        const stopped = C.track.courseLength + C.timing.runOut;
        expect(P.positionAt(run, run.time + 10)).toBeCloseTo(stopped, 9);
        expect(P.positionAt(run, run.time + 20)).toBe(P.positionAt(run, run.time + 10));
    });

    test('between samples it is linear, and a run with no samples is at the pin', () => {
        const fake = { time: 2, speed: 4, samples: [{ t: 0, s: 0 }, { t: 1, s: 2 }, { t: 2, s: C.track.courseLength }] };
        expect(P.positionAt(fake, 0.5)).toBe(1);
        expect(P.positionAt({ time: 1, samples: [] }, 0.5)).toBe(0);
        // A car that stopped short stays where it stopped.
        expect(P.positionAt({ time: 10, dnf: true, stoppedAt: 5, samples: [{ t: 0, s: 0 }] }, 12)).toBe(5);
        expect(P.positionAt({ time: 10, dnf: true, samples: [{ t: 0, s: 0 }, { t: 9, s: 4 }] }, 12)).toBe(4);
        // A car that finished at no speed sits on the line.
        expect(P.positionAt({ time: 1, speed: 0, samples: [{ t: 0, s: 0 }] }, 2)).toBe(C.track.courseLength);
    });

    test('a close finish is two times within 0.02 s, the visitor\'s when they are racing', () => {
        const heat = [{ car: 0, time: 3.2 }, { car: 1, time: 3.215 }, { car: 2, time: 3.3 }, { car: 3, time: 3.301 }];
        expect(P.closeFinish(heat)).toMatchObject({ first: 2, second: 3 });
        expect(P.closeFinish(heat, { focus: 0 })).toMatchObject({ first: 0, second: 1 });
        expect(P.closeFinish(heat, { focus: 0, closeGap: 0.01 })).toBeNull();
        expect(P.closeFinish([{ car: 0, time: 3, dnf: true }, { car: 1, time: 3.1 }])).toBeNull();
    });

    test('the day: four heats, each staged, gated, run, maybe replayed, then timed, back to back', () => {
        const plan = P.planDay(race, { focus: 0 });
        expect(plan.heats).toHaveLength(4);
        let clock = 0;
        for (const h of plan.heats) {
            expect(h.start).toBeCloseTo(clock, 9);
            const kinds = h.segments.map((s) => s.kind);
            expect(kinds[0]).toBe('staging');
            expect(kinds[1]).toBe('gate');
            expect(kinds[2]).toBe('run');
            expect(kinds[kinds.length - 1]).toBe('times');
            for (let i = 1; i < h.segments.length; i++) expect(h.segments[i].from).toBeCloseTo(h.segments[i - 1].to, 9);
            clock = h.end;
        }
        expect(plan.total).toBeCloseTo(clock, 9);
        // About half a minute to three quarters of one.
        expect(plan.total).toBeGreaterThan(25);
        expect(plan.total).toBeLessThan(75);
    });

    test('every heat counts down 3, 2, 1 at the end of its staging, Go! through the gate and the first count of the run', () => {
        const plan = P.planDay(race, { focus: 0 });
        const step = C.timing.count;
        // The copy says "starts in 3 seconds" as the staging begins.
        expect(C.timing.staging).toBe(3);
        expect(C.timing.staging).toBeGreaterThan(3 * step);
        for (const h of plan.heats) {
            const [stage, gate, run] = h.segments;
            const seen = [];
            for (let t = stage.from; t < run.to; t += 0.01) {
                const seg = P.momentAt(plan, t).segment;
                const n = P.countAt(seg, t, C);
                if (seen[seen.length - 1] !== n) seen.push(n);
            }
            expect(seen).toEqual([null, 3, 2, 1, 0, null]);
            // Each number a count long, Go! from the gate on.
            expect(P.countAt(stage, stage.to - 3 * step + 0.01, C)).toBe(3);
            expect(P.countAt(stage, stage.to - 3 * step - 0.01, C)).toBeNull();
            expect(P.countAt(stage, stage.to - 0.01, C)).toBe(1);
            expect(P.countAt(gate, gate.from, C)).toBe(0);
            expect(P.countAt(run, run.from + step - 0.01, C)).toBe(0);
            expect(P.countAt(run, run.from + step + 0.01, C)).toBeNull();
        }
        expect(P.countAt(null, 0, C)).toBeNull();
        expect(P.countAt({ kind: 'times', from: 0, to: 1 }, 0.5, C)).toBeNull();
    });

    test('a replay slows into the line and out of it (Steve\'s QA, 2026-10-20: too fast to see the crossing), and reduced motion has none', () => {
        const close = raceOf([preset('full'), ...C.divisions.hard.map(fieldCar)]);
        const plan = P.planDay(close, { focus: 0 });
        const replays = plan.heats.flatMap((h) => h.segments.filter((s) => s.kind === 'replay'));
        expect(replays.length).toBeGreaterThan(0);
        const T = C.timing;
        for (const r of replays) {
            const mid = r.close.at + r.close.gap / 2;
            // Slowest between the two crossings, quicker away from them.
            expect(P.replaySpeed(mid, mid)).toBeCloseTo(T.replaySlow, 9);
            expect(P.replaySpeed(mid + T.replayWidth, mid)).toBeCloseTo(T.replayFast, 9);
            expect(P.replaySpeed(mid + 0.05, mid)).toBeLessThan(P.replaySpeed(mid + 0.1, mid));
            // It plays from before the first crossing to after the second, in
            // order, never stepping, and longer than the flat quarter speed did.
            // (The part out of a photo finish starts on the winner's crossing.)
            expect(r.runFrom).toBeLessThanOrEqual(r.close.exactAt);
            expect(r.warp.runs[0]).toBe(r.runFrom);
            expect(r.warp.runs[r.warp.runs.length - 1]).toBeCloseTo(r.runTo, 12);
            expect(r.to - r.from).toBeCloseTo(r.warp.seconds, 9);
            let last = -1;
            for (let t = r.from; t < r.to; t += 0.01) {
                const rt = P.momentAt(plan, t).runTime;
                expect(rt).toBeGreaterThanOrEqual(last - 1e-12);
                // No lurch: never more run time in a frame than the fast end allows.
                if (last >= 0) expect(rt - last).toBeLessThanOrEqual(T.replayFast * 0.01 + 1e-9);
                last = rt;
            }
        }
        const whole = replays.filter((r) => r.runTo > r.close.at + r.close.gap);
        for (const r of whole) expect(r.to - r.from).toBeGreaterThan((r.runTo - r.runFrom) / 0.25);
        // Around the crossing it crawls: a hundredth of a second of the run takes
        // a good part of a second to play.
        const r = replays[0];
        const mid = r.close.at + r.close.gap / 2;
        const screenFor = (a, b) => {
            let tau = 0;
            for (let x = a; x < b; x += 0.0001) tau += 0.0001 / P.replaySpeed(x + 0.00005, mid);
            return tau;
        };
        expect(screenFor(mid - 0.005, mid + 0.005)).toBeGreaterThan(0.15);
        const still = P.planDay(close, { focus: 0, reducedMotion: true });
        expect(still.heats.every((h) => h.segments.every((s) => s.kind !== 'replay'))).toBe(true);
    });

    /** A two-car day with the given heat times (car 0, car 1), every heat the same. */
    function fakeRace(a, b) {
        const run = (time) => ({ time, samples: [{ t: 0, s: 0 }, { t: time, s: C.track.courseLength }], speed: 4.5 });
        const runs = [[0, 1, 2, 3].map(() => run(a)), [0, 1, 2, 3].map(() => run(b))];
        const heats = [0, 1, 2, 3].map((h) => [0, 1].map((car) => {
            const t = car ? b : a;
            return { car, lane: (car + h) % 4, time: Math.round(t * 1000) / 1000, exact: t, dnf: false };
        }));
        return { heats, runs, average: [a, b], standings: a <= b ? [0, 1] : [1, 0] };
    }

    test('a photo finish (under 0.006 s): the replay stops dead on the winner\'s crossing, then plays on', () => {
        const T = C.timing;
        const plan = P.planDay(fakeRace(3.2041, 3.2072), { focus: 0 });
        for (const h of plan.heats) {
            const kinds = h.segments.map((s) => s.kind);
            expect(kinds).toEqual(['staging', 'gate', 'run', 'replay', 'photo', 'replay', 'times']);
            const [, , , into, photo, out] = h.segments;
            // Held on the instant the winner's nose meets the line: its unrounded time.
            expect(photo.runAt).toBe(3.2041);
            expect(photo.to - photo.from).toBeCloseTo(T.photo, 9);
            expect(P.momentAt(plan, photo.from + 0.1).runTime).toBe(3.2041);
            expect(P.momentAt(plan, photo.to - 0.01).runTime).toBe(3.2041);
            // The replay into it ends there, the one out of it starts there.
            expect(into.runTo).toBe(3.2041);
            expect(out.runFrom).toBe(3.2041);
            expect(P.momentAt(plan, into.to - 1e-6).runTime).toBeCloseTo(3.2041, 6);
            expect(photo.close.first).toBe(0);
        }
        // A finish just wider than that: the slow replay only.
        const wide = P.planDay(fakeRace(3.2, 3.2065), { focus: 0 });
        expect(wide.heats[0].segments.map((s) => s.kind)).toEqual(['staging', 'gate', 'run', 'replay', 'times']);
        // Reduced motion: no replay, but the photo, a still, is kept.
        const still = P.planDay(fakeRace(3.2041, 3.2072), { focus: 0, reducedMotion: true });
        expect(still.heats[0].segments.map((s) => s.kind)).toEqual(['staging', 'gate', 'run', 'photo', 'times']);
        expect(still.heats[0].segments[3].runAt).toBe(3.2041);
    });

    test('a heat tied on the timer goes to the car really ahead, as the photo shows it, not to whoever was entered first', () => {
        // Both read 3.204 on the timer; car 1 was ahead by 0.0003 s.
        const race = fakeRace(3.2042, 3.2039);
        expect(race.heats[0][0].time).toBe(race.heats[0][1].time);
        expect(P.heatOrder(race.heats[0]).map((r) => r.car)).toEqual([1, 0]);
        const plan = P.planDay(race, { focus: 0 });
        const photo = plan.heats[0].segments.find((s) => s.kind === 'photo');
        expect(photo.close.first).toBe(1);
        expect(photo.runAt).toBe(3.2039);
        expect(photo.close.gap).toBe(0);
        expect(Copy.CALLS.photo('The Phantom', 0)).toBe('Photo finish! The Phantom by less than a thousandth of a second.');
        expect(Copy.CALLS.photo('The Phantom', 0.004)).toBe('Photo finish! The Phantom by 0.004 seconds.');
        // The sim's own heats carry the unrounded time for it.
        const real = raceOf([preset('full'), ...C.divisions.hard.map(fieldCar)]);
        for (const h of real.heats) for (const r of h) expect(r.exact).toBe(real.runs[r.car][r.lane].time);
    });

    test('momentAt: the run time rises through the run, crawls in a replay, holds through the times, and the day ends', () => {
        const close = raceOf([preset('full'), ...C.divisions.hard.map(fieldCar)]);
        const plan = P.planDay(close, { focus: 0 });
        const h = plan.heats.find((x) => x.segments.some((s) => s.kind === 'replay'));
        const seg = (kind) => h.segments.find((s) => s.kind === kind);
        expect(P.momentAt(plan, seg('staging').from + 0.1)).toMatchObject({ heat: h.index, runTime: 0, done: false });
        expect(P.momentAt(plan, seg('gate').from + 0.01).runTime).toBe(0);
        expect(P.momentAt(plan, seg('run').from + 1).runTime).toBeCloseTo(1, 9);
        const rp = seg('replay');
        const mid = P.momentAt(plan, (rp.from + rp.to) / 2);
        expect(mid.segment.kind).toBe('replay');
        expect(mid.runTime).toBeGreaterThan(rp.runFrom);
        expect(mid.runTime).toBeLessThan(rp.runTo);
        const times = P.momentAt(plan, seg('times').from + 0.1);
        expect(times.runTime).toBeCloseTo(seg('run').to - seg('run').from, 9);
        const end = P.momentAt(plan, plan.total + 1);
        expect(end.done).toBe(true);
        expect(end.heat).toBe(3);
        expect(P.momentAt({ heats: [], total: 0 }, 0).done).toBe(true);
    });

    test('a car crosses the line on screen at the time the board shows', () => {
        const plan = P.planDay(race, { focus: 0 });
        const h = plan.heats[1];
        const runSeg = h.segments.find((s) => s.kind === 'run');
        for (const r of race.heats[1]) {
            const recorded = race.runs[r.car][r.lane];
            const at = (dt) => P.positionAt(recorded, P.momentAt(plan, runSeg.from + recorded.time + dt).runTime);
            expect(at(-0.002)).toBeLessThan(C.track.courseLength);
            expect(at(0.002)).toBeGreaterThan(C.track.courseLength);
            expect(Math.abs(Sim.shownTime(recorded.time) - r.time)).toBeLessThan(1e-12);
        }
    });
});

describe('the tie-break', () => {
    test('a tie on the board goes to the finer reading, not to whoever is listed first', () => {
        // Made a tie on purpose: The Phantom against a copy with a hair more
        // axle friction, the slower copy listed first, so entry order alone
        // would hand it the win. (It was a found tie until M4's sanding moved
        // the Phantom by 0.19 ms.)
        const phantom = fieldCar(8);
        const slower = { ...phantom, axleMu: phantom.axleMu * 1.0002 };
        const race = Sim.runRace([slower, phantom]);
        expect(race.average[0]).toBe(race.average[1]);
        const exact = (i) => race.runs[i].reduce((a, r) => a + r.time, 0);
        expect(exact(0)).toBeGreaterThan(exact(1));
        expect(race.standings[0]).toBe(1);
        // Listed the other way round, the same car wins.
        const flipped = Sim.runRace([phantom, slower]);
        expect(flipped.standings[0]).toBe(0);
        // Not a dead heat: one place each, and the tie kept for the results
        // to explain, with how much faster the winner really was.
        expect(race.places).toEqual([2, 1]);
        expect(race.ties).toHaveLength(1);
        expect(race.ties[0]).toMatchObject({ first: 1, second: 0, dead: false });
        expect(race.ties[0].by).toBeCloseTo((exact(0) - exact(1)) / 4, 12);
        expect(race.ties[0].by).toBeGreaterThan(0);
    });

    test('the results say how a board tie was decided, or that a dead heat shares the place', () => {
        expect(Copy.tieLine({ dead: false, by: 0.00023 }, 'The Phantom', 'Blue Wedge', '3.190', 1))
            .toBe('Tied at 3.190 seconds on the board! The timer’s finer reading gave 1st place to The Phantom, by 0.0002 seconds.');
        expect(Copy.tieLine({ dead: false, by: 0.00001 }, 'A', 'B', '3.190', 2))
            .toBe('Tied at 3.190 seconds on the board! The timer’s finer reading gave 2nd place to A, by less than a ten-thousandth of a second.');
        expect(Copy.tieLine({ dead: true, by: 0 }, 'Blue Wedge', 'Ann’s Blue Wedge', '3.212', 1))
            .toBe('A dead heat! Blue Wedge and Ann’s Blue Wedge both averaged 3.212 seconds, to the timer’s finest reading, so they share 1st place.');
        expect(Copy.tiedPlace(1)).toBe('1st (tie)');
        expect(Copy.resultsSpoken('easy', [{ place: 1, tied: true, name: 'A', average: 3.2 }, { place: 1, tied: true, name: 'B', average: 3.2 }]))
            .toBe('Easy division results. 1st, tied, A, averaging 3.200 seconds. 1st, tied, B, averaging 3.200 seconds.');
        for (const s of [Copy.tieLine({ dead: true, by: 0 }, 'A', 'B', '3.2', 1), Copy.tieLine({ dead: false, by: 0.001 }, 'A', 'B', '3.2', 1),
            Copy.CHALLENGE.tie('X', '3.2'), Copy.CHALLENGE.alike, Copy.CHALLENGE.boardWon('X', '3.2', 0.0001), Copy.CHALLENGE.boardLost('X', '3.2', 0.0001)]) {
            expect(s).not.toMatch(/[—;]/);
        }
    });
});

describe('the director', () => {
    const path = T.pathOf();

    test('the shots: the gate while staging, the chase down the slope, the finish near the line, the photo for a replay', () => {
        expect(D.shotFor('staging', 0)).toBe('start');
        expect(D.shotFor('gate', 0)).toBe('start');
        expect(D.shotFor('run', 1)).toBe('chase');
        expect(D.shotFor('run', C.track.courseLength - 1)).toBe('finish');
        expect(D.shotFor('replay', 0)).toBe('photo');
        expect(D.shotFor('photo', 0)).toBe('photo');
        expect(D.shotFor('times', 0)).toBe('finish');
        // Reduced motion: no chase, ever.
        expect(D.shotFor('run', 1, { reducedMotion: true })).toBe('finish');
    });

    test('every shot holds the four lanes on a portrait phone and a wide screen', () => {
        const lanesHalf = T.trackWidth() / 2;
        for (const aspect of [390 / 844, 1, 16 / 9]) {
            for (const shot of ['start', 'chase', 'finish', 'photo']) {
                const f = D.framing(shot, path, 3, aspect);
                const dist = Math.hypot(f.position.x - f.target.x, f.position.y - f.target.y, f.position.z - f.target.z);
                // The half-width the camera holds at its target is at least the lanes'.
                const halfH = Math.atan(Math.tan((C.camera.fov * Math.PI) / 360) * aspect);
                expect(dist * Math.tan(halfH)).toBeGreaterThanOrEqual(lanesHalf - 1e-9);
                expect(f.position.y).toBeGreaterThan(0);
            }
        }
        // A portrait phone backs off further than a wide screen.
        expect(D.fitDistance(0.3, 45, 0.46)).toBeGreaterThan(D.fitDistance(0.3, 45, 1.78));
        // An unknown shot is the finish camera.
        expect(D.framing('nope', path, 0, 1)).toEqual(D.framing('finish', path, 0, 1));
    });

    test('every race shot stands a little further back than it must (Steve\'s QA, 2026-10-20), but not much', () => {
        expect(C.camera.pullBack).toBeGreaterThan(1);
        expect(C.camera.pullBack).toBeLessThanOrEqual(1.35);
        for (const aspect of [390 / 844, 16 / 9]) {
            for (const name of ['start', 'chase', 'finish', 'photo']) {
                const S = D.SHOTS[name];
                const f = D.framing(name, path, 3, aspect);
                const dist = Math.hypot(f.position.x - f.target.x, f.position.y - f.target.y, f.position.z - f.target.z);
                const needed = Math.max(S.minDistance, D.fitDistance(S.halfWidth, C.camera.fov, aspect));
                expect(dist).toBeCloseTo(needed * C.camera.pullBack, 9);
                // Asked for, the shot as it was (the share clip's).
                const g = D.framing(name, path, 3, aspect, C, { pullBack: 1 });
                expect(Math.hypot(g.position.x - g.target.x, g.position.y - g.target.y, g.position.z - g.target.z)).toBeCloseTo(needed, 9);
            }
        }
    });

    test('the chase follows the leader down the track', () => {
        const a = D.framing('chase', path, 1, 1);
        const b = D.framing('chase', path, 5, 1);
        expect(b.target.x).toBeGreaterThan(a.target.x);
        expect(b.position.x).toBeGreaterThan(a.position.x);
    });
});

describe('the track in the hall', () => {
    const path = T.pathOf();

    test('the pin at the origin, about four feet up, sloping down, then flat to the finish and beyond', () => {
        const pin = path.at(0);
        expect(pin.x).toBe(0);
        expect(pin.y).toBeCloseTo(C.track3d.floorGap + Sim.startHeight(), 9);
        expect(Math.sin(-pin.angle)).toBeCloseTo(C.track.slopeSine, 2);
        const finish = path.at(C.track.courseLength);
        expect(finish.y).toBeCloseTo(C.track3d.floorGap, 9);
        expect(finish.angle).toBe(0);
        // Clamped at both ends.
        expect(path.at(-99)).toEqual(path.at(path.start));
        expect(path.at(999)).toEqual(path.at(path.end));
        // The hall's x grows with s, and never faster than s does.
        for (let s = path.start + 0.1; s < path.end; s += 0.25) {
            const d = path.at(s).x - path.at(s - 0.1).x;
            expect(d).toBeGreaterThan(0);
            expect(d).toBeLessThanOrEqual(0.1 + 1e-9);
        }
    });

    test('lanes sit side by side across z, lane 1 at -z, and a car rides with both axles on the track', () => {
        expect(T.laneZ(0)).toBeLessThan(T.laneZ(3));
        expect(T.laneZ(1) - T.laneZ(0)).toBeCloseTo(C.track3d.lanePitch, 12);
        expect(T.laneZ(0) + T.laneZ(3)).toBeCloseTo(0, 12);
        const car = fieldCar(8);
        for (const s of [0, 2, 4, 8, C.track.courseLength]) {
            const pose = T.carPose(path, s, 2, car);
            const rear = path.at(s - car.rearAxle);
            const front = path.at(s - car.frontAxle);
            const axle = (x) => ({ x: pose.x + x * Math.cos(pose.angle), y: pose.y + x * Math.sin(pose.angle) });
            expect(axle(-car.rearAxle).x).toBeCloseTo(rear.x, 9);
            expect(axle(-car.rearAxle).y).toBeCloseTo(rear.y, 9);
            // The front axle lands on the track too (to the chord's sag).
            expect(Math.abs(axle(-car.frontAxle).y - front.y)).toBeLessThan(0.002);
            expect(pose.z).toBe(T.laneZ(2));
        }
    });

    test('a lofted strip has a ring for each step and closes both ends', () => {
        const square = [[-1, 0], [1, 0], [1, 1], [-1, 1]];
        const { positions, indices } = T.loft(path, square, 0, 1, 0.25);
        expect(positions.length).toBe(5 * 4 * 3);
        // Two triangles per side per span, two per end cap.
        expect(indices.length).toBe((4 * 4 * 2 + 2 * 2) * 3);
        expect(Math.max(...indices)).toBeLessThan(positions.length / 3);
    });
});

describe('a car\'s outline', () => {
    test('top from nose to tail, back along the bottom, all above the track by the clearance', () => {
        const build = Car.buildFromDesign('wedge');
        const out = Mesh.outlineOf(build.stations);
        expect(out).toHaveLength(build.stations.length * 2);
        expect(out[0][0]).toBe(-0);
        expect(out[build.stations.length - 1][0]).toBeCloseTo(-7 * IN, 12);
        const base = C.kit.wheel.radius - C.kit.axleHeight;
        for (const [, y] of out) expect(y).toBeGreaterThanOrEqual(base - 1e-12);
    });

    test('four wheels at the axle slots, either side of the body', () => {
        const car = fieldCar(3);
        const spots = Mesh.wheelSpots(car);
        expect(spots.map((s) => s[0])).toEqual([-car.frontAxle, -car.frontAxle, -car.rearAxle, -car.rearAxle]);
        for (const [, y, z] of spots) {
            expect(y).toBe(C.kit.wheel.radius);
            expect(Math.abs(z)).toBeGreaterThan(car.dims.wheelGap / 2);
        }
    });
});

describe('phases', () => {
    test('the bench to check-in to the race to the results, and back', () => {
        // Every arrival lands at the bench (M3).
        expect(Ph.nextPhase('loading', 'loaded')).toBe('bench');
        expect(Ph.nextPhase('bench', 'race')).toBe('checkin');
        expect(Ph.nextPhase('checkin', 'back')).toBe('bench');
        expect(Ph.nextPhase('results', 'tune')).toBe('bench');
        // Go weighs the car in first (M5).
        expect(Ph.nextPhase('checkin', 'go')).toBe('weighin');
        expect(Ph.nextPhase('weighin', 'pass')).toBe('race');
        expect(Ph.nextPhase('weighin', 'skip')).toBe('race');
        expect(Ph.nextPhase('weighin', 'fail')).toBe('bench');
        expect(Ph.nextPhase('weighin', 'back')).toBe('checkin');
        expect(Ph.nextPhase('race', 'finish')).toBe('results');
        expect(Ph.nextPhase('race', 'skip')).toBe('results');
        expect(Ph.nextPhase('race', 'back')).toBe('checkin');
        expect(Ph.nextPhase('results', 'again')).toBe('race');
        expect(Ph.nextPhase('results', 'another')).toBe('checkin');
        // An action that means nothing there stays put.
        expect(Ph.nextPhase('checkin', 'skip')).toBe('checkin');
        expect(Ph.nextPhase('nowhere', 'go')).toBe('nowhere');
        expect(Ph.nextPhase('bench', 'go')).toBe('bench');
        expect(Ph.PHASES).toEqual(['loading', 'bench', 'checkin', 'weighin', 'race', 'results']);
    });
});

describe('the words', () => {
    const style = (s) => {
        expect(s).not.toMatch(/[—;]/);
        expect(s).not.toMatch(/pinewood/i);
    };

    test('places, heats and clocks', () => {
        expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(Copy.placeWord)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st']);
        expect(Copy.heatOf(2, 4)).toBe('Heat 2 of 4');
        expect(Copy.clock(3.1)).toBe('3.100');
        expect(Copy.eventLabel('easy')).toBe('Easy division');
        expect(Copy.eventLabel('trial')).toBe('Time Trial');
        expect(Copy.eventLabel('nope')).toBe('');
    });

    test('the announcer says the lane defect once, before the first heat, and it is true', () => {
        expect(Copy.staging(1, 4)).toMatch(/Lane 4 runs a hair slow/);
        const slowest = C.laneDefects.indexOf(Math.max(...C.laneDefects));
        expect(slowest).toBe(3);
        expect(Copy.staging(2, 4)).not.toMatch(/Lane 4/);
        expect(Copy.staging(4, 4)).toMatch(/last heat/);
        for (const n of [1, 2, 3, 4]) style(Copy.staging(n, 4));
        style(Copy.OFF);
        style(Copy.heatWinner(2, 'Blue Streak', 3.2));
        style(Copy.COUNT.go);
        expect(Copy.COUNT.spoken(2, 4)).toBe('Heat 2 of 4 starts in 3 seconds.');
    });

    test('what a screen reader hears, heat by heat and at the end', () => {
        expect(Copy.heatSpoken(1, [{ name: 'A', time: 3.2, place: 1 }, { name: 'B', time: 3.3, place: 2 }]))
            .toBe('Heat 1: A 1st, 3.200 seconds. B 2nd, 3.300 seconds.');
        expect(Copy.resultsSpoken('hard', [{ name: 'A', average: 3.19, place: 1 }]))
            .toBe('Hard division results. 1st, A, averaging 3.190 seconds.');
    });

    test('the Why lines: the best thing the build did, the two biggest gains, and a word when little is left', () => {
        const kit = Car.describeCar(Car.buildFromDesign('block'));
        const refs = { kitMass: kit.mass, blockCdA: kit.cdA, bestCdA: fieldCar(8).cdA, idealBalance: 0.75 * IN };
        const box = preset('box');
        const lines = Copy.whyLines(Sim.explain(box, refs), box, refs.idealBalance);
        expect(lines.length).toBe(2);
        expect(lines[0]).toMatch(/Polished axles and graphite would save/);
        const full = preset('full');
        const fullLines = Copy.whyLines(Sim.explain(full, refs), full, refs.idealBalance);
        expect(fullLines[0]).toMatch(/axles was worth/);
        expect(fullLines[fullLines.length - 1]).toMatch(/very little left/);
        // A car weighted behind the ideal is told to move it forward.
        const back = { ...full, balance: 0.3 * IN, comX: full.rearAxle - 0.3 * IN };
        const backLines = Copy.whyLines(Sim.explain(back, refs), back, refs.idealBalance);
        expect(backLines.join(' ')).toMatch(/forward/);
        for (const l of [...lines, ...fullLines, ...backLines]) style(l);
    });

    test('the Time Trial compares each car with the one behind it', () => {
        expect(Copy.trialLines([{ name: 'A', average: 3.2 }])).toEqual(['A averaged 3.200 seconds over the four lanes.']);
        expect(Copy.trialLines([{ name: 'A', average: 3.2 }, { name: 'B', average: 3.25 }, { name: 'C', average: 3.25 }]))
            .toEqual(['A beat B by 0.050 seconds.', 'B and C tied.']);
    });

    test('every fixed sentence keeps the house style', () => {
        for (const e of Copy.EVENTS) { style(e.label); style(e.blurb); }
        for (const v of Object.values(Copy.UI)) style(v);
    });
});
