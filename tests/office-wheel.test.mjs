// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The observation wheel on the waterfront (wheel.js; QA, 2026-09-29: "match
 * the relative size and design of the real Seattle Great Wheel ... light up
 * at night ... stop running around 10pm, and restart around 10am ... spins
 * for a while and then stops to let people on and off"). Pure: its size,
 * its hours, its cadence, its gondolas and its lights. What the desk sees
 * of it is measured with the real three.js in office-view.
 */
import * as wheel from '../www/office/js/wheel.js';
import * as life from '../www/office/js/life.js';
import * as city from '../www/office/js/city.js';

const { WHEEL, drawnHeight, wheelSite, wheelOpen, wheelCycle, wheelTurn, wheelMoving, wheelStart, wheelStep, seatAt, wheelColors, wheelLit, SHOWS } = wheel;
const at = (h, m = 0, s = 0) => new Date(2026, 8, 29, h, m, s);

describe('the wheel itself', () => {
    test('built to the real one’s size, 53 m (175 ft) from its pier to its top, drawn two and a half times that, with fewer gondolas and spokes (QA: "still a little bigger", "reduce the number of passenger cars and spokes")', () => {
        const top = WHEEL.hub + WHEEL.radius + WHEEL.tube;
        expect(top - WHEEL.deck).toBeGreaterThan(52);
        expect(top - WHEEL.deck).toBeLessThan(54.5);
        // Drawn from its deck up at two and a half times life: some 133 m.
        expect(WHEEL.scale).toBe(2.5);
        expect(drawnHeight(WHEEL.deck)).toBe(WHEEL.deck);
        expect(drawnHeight(top) - WHEEL.deck).toBeCloseTo((top - WHEEL.deck) * 2.5, 9);
        // Fewer than the real one's forty-two of each, which crowd at this size.
        expect(WHEEL.gondolas).toBe(24);
        expect(WHEEL.spokes).toBe(12);
        // The lowest gondola comes down to the boarding platform.
        const lowest = WHEEL.hub - WHEEL.radius - WHEEL.gondola.height;
        expect(Math.abs(lowest - WHEEL.platform)).toBeLessThan(0.3);
        expect(WHEEL.platform).toBeGreaterThan(WHEEL.deck);
    });

    test('the gondolas hang level between the rims, and never swing into them or the hub', () => {
        // Between the rims, clear of each rim's tube.
        expect(WHEEL.gondola.depth / 2).toBeLessThan(WHEEL.apart / 2 - WHEEL.tube);
        for (let angle = 0; angle < 360; angle += 7.5) {
            for (let i = 0; i < WHEEL.gondolas; i++) {
                const { pivot, middle } = seatAt(i, angle);
                expect(Math.hypot(...pivot)).toBeCloseTo(WHEEL.radius, 9);
                // Hanging straight down from the pivot, whatever the turn.
                expect(middle[0]).toBe(pivot[0]);
                expect(pivot[1] - middle[1]).toBeCloseTo(WHEEL.gondola.height / 2, 9);
                // Even at the top, where it hangs inside the rim, it is well
                // clear of the hub.
                expect(Math.hypot(...middle)).toBeGreaterThan(WHEEL.radius - WHEEL.gondola.height);
            }
        }
    });

    test('it stands at the end of a waterfront pier, in against the buildings, turned to face the office a little off square (QA: "closer to the buildings")', () => {
        const s = wheelSite();
        expect(s.shore).toBe(city.shoreZ(WHEEL.x));
        expect(s.shore - s.z).toBe(WHEEL.out);
        expect(s.end).toBeLessThan(s.z);
        expect(s.start).toBeGreaterThan(s.z);
        // On one of the waterfront's own piers, at its end: its deck joins
        // the pier's, which runs in to the shore.
        const pier = city.piers().find((p) => Math.abs(p.x - s.x) < 1);
        expect(pier).toBeTruthy();
        expect(pier.ferry).toBe(false);
        expect(s.start).toBeGreaterThan(pier.z - pier.length);
        expect(Math.abs(s.z - (pier.z - pier.length))).toBeLessThan(WHEEL.pier.past);
        // Its axle points near the office: within the turn of straight at it.
        const toOffice = Math.atan2(0.35 - s.x, 0.9 - s.z);
        expect(((s.yaw - toOffice) * 180) / Math.PI).toBeCloseTo(WHEEL.turn, 9);
        // Clear of the waterfront's other piers, and wide enough for its legs
        // as drawn.
        for (const p of city.piers().filter((q) => q.x !== pier.x)) expect(Math.abs(p.x - s.x)).toBeGreaterThan(WHEEL.pier.width / 2 + p.width / 2);
        expect(WHEEL.legs.spread * WHEEL.scale).toBeLessThan(WHEEL.pier.width / 2);
        expect(WHEEL.legs.splay * WHEEL.scale).toBeLessThan(WHEEL.pier.past);
    });

    test('nothing on the water sails through it or its pier, all week', () => {
        const s = wheelSite();
        const clear = WHEEL.radius * WHEEL.scale + 40;
        let closest = Infinity;
        const near = (p) => {
            if (!p) return;
            const onPier = p.z < s.shore && p.z > s.end ? Math.abs(p.x - s.x) : Infinity;
            closest = Math.min(closest, Math.hypot(p.x - s.x, p.z - s.z), onPier);
        };
        for (let day = 21; day < 28; day++) {
            for (let m = 0; m < 1440; m += 2) {
                const date = new Date(2026, 8, day, 0, m);
                life.ferriesAt(date).forEach(near);
                life.sailboatsAt(date).forEach(near);
                near(life.seaplaneAt(date));
                life.shipsAt(date).forEach(near);
                near(life.cruiseAt(date));
            }
        }
        expect(closest).toBeGreaterThan(clear);
    });
});

describe('its hours (QA: "restart around 10am", and "stop when the lights go out ... keep it going until 11pm")', () => {
    test('open from ten in the morning until eleven at night, by the sky’s hour', () => {
        expect(wheelOpen(at(9, 59, 59))).toBe(false);
        expect(wheelOpen(at(10))).toBe(true);
        expect(wheelOpen(at(15, 30))).toBe(true);
        expect(wheelOpen(at(22, 59, 59))).toBe(true);
        expect(wheelOpen(at(23))).toBe(false);
        expect(wheelOpen(at(3))).toBe(false);
    });

    test('lit from dusk while it is open: dark at noon, lit at half past ten, dark from eleven, when it stops', () => {
        expect(wheelLit(at(12), 0)).toBe(false);
        expect(wheelLit(at(22, 30), 1)).toBe(true);
        expect(wheelLit(at(22, 30), WHEEL.dusk)).toBe(false);
        expect(wheelLit(at(23), 1)).toBe(false);
        expect(wheelLit(at(6), 1)).toBe(false);
    });
});

describe('its cadence (QA: "spins for a while and then stops to let people on and off")', () => {
    const c = wheelCycle();

    test('boarding moves one gondola at a time with a stop between, then the ride turns without stopping', () => {
        const { steps, move, hold } = WHEEL.board;
        for (let k = 0; k < steps; k++) {
            const start = k * (move + hold);
            // Each move is one gondola's arc, and ends at rest.
            expect(wheelTurn(start + move) - wheelTurn(start)).toBeCloseTo(c.bay, 9);
            expect(wheelMoving(start + move / 2)).toBe(true);
            expect(wheelMoving(start + move + hold / 2)).toBe(false);
            expect(wheelTurn(start + move + hold - 0.01)).toBeCloseTo(wheelTurn(start + move), 9);
        }
        // The ride: whole turns, and moving all through it.
        expect(wheelTurn(c.seconds) - wheelTurn(c.boarding)).toBeCloseTo(360 * WHEEL.ride.turns, 9);
        for (let t = c.boarding + 0.5; t < c.seconds; t += 3) expect(wheelMoving(t)).toBe(true);
        // A few minutes turning for each minute and a half of stop and go.
        expect(WHEEL.ride.seconds).toBeGreaterThan(c.boarding * 2);
    });

    test('never jumps and never turns back, cycle after cycle, easing into the ride and out of it', () => {
        let last = wheelTurn(0);
        let fastest = 0;
        for (let t = 0.05; t < c.seconds * 3; t += 0.05) {
            const now = wheelTurn(t);
            expect(now).toBeGreaterThanOrEqual(last - 1e-9);
            fastest = Math.max(fastest, (now - last) / 0.05);
            last = now;
        }
        expect(wheelTurn(c.seconds * 3)).toBeCloseTo(c.degrees * 3, 6);
        // At its fastest a turn takes about two minutes: a slow wheel, as
        // the real one is (its rim under 1.5 m a second).
        const rim = ((fastest * Math.PI) / 180) * WHEEL.radius;
        expect(rim).toBeLessThan(1.5);
        expect(rim).toBeGreaterThan(0.5);
        // Easing: just into the ride it is slower than at full speed.
        const early = (wheelTurn(c.boarding + 2) - wheelTurn(c.boarding + 1.9)) / 0.1;
        expect(early).toBeLessThan(fastest / 3);
    });

    test('on arrival, open, it is already out on a ride; closed, it stands', () => {
        const t0 = 12345.6;
        const s = wheelStart(true, t0);
        expect(s.angle).toBe(0);
        // Turning within the first second, not boarding for a minute and a half.
        const next = wheelStep(s, true, t0 + 0.5);
        expect(next.angle).toBeGreaterThan(0);
        expect(wheelMoving(t0 + 0.5 - next.since)).toBe(true);
        expect(t0 + 0.5 - next.since).toBeGreaterThan(c.boarding);
        const closed = wheelStart(false, t0);
        expect(wheelStep(closed, false, t0 + 60)).toBe(closed);
    });

    test('closing, it eases to rest within its stop wherever it is, never jumping; opening, it starts at once, boarding first', () => {
        const t0 = 5000;
        let s = wheelStart(true, t0);
        let t = t0;
        let biggest = 0;
        const step = (open) => {
            const before = s.angle;
            t += 0.1;
            s = wheelStep(s, open, t);
            biggest = Math.max(biggest, Math.abs(s.angle - before));
            return s.angle - before;
        };
        for (let k = 0; k < 300; k++) step(true);
        expect(s.angle).toBeGreaterThan(0);
        // Closed mid-ride: it slows, never speeding up or turning back, and
        // is at rest within its stop.
        const closedAt = t;
        let last = step(false);
        expect(last).toBeGreaterThan(0);
        while (s.running) {
            const moved = step(false);
            expect(moved).toBeGreaterThanOrEqual(0);
            expect(moved).toBeLessThanOrEqual(last + 1e-9);
            last = moved;
        }
        expect(t - closedAt).toBeLessThanOrEqual(WHEEL.stop + 0.2);
        const parked = s.angle;
        for (let k = 0; k < 3000; k++) step(false);
        expect(s.angle).toBe(parked);
        // Opened at any moment: it moves off at once, boarding (one
        // gondola, then a stop), from where it stood.
        step(true);
        expect(s.running).toBe(true);
        expect(s.angle).toBeCloseTo(parked, 9);
        const { move, hold } = WHEEL.board;
        for (let k = 0; k < move * 10; k++) step(true);
        expect(s.angle - parked).toBeCloseTo(c.bay, 6);
        for (let k = 0; k < hold * 5; k++) step(true);
        expect(s.angle - parked).toBeCloseTo(c.bay, 6);
        // Never a jump, at ten frames a second.
        expect(biggest).toBeLessThan(1.5);
    });

    test('after "Watch a day go by" it is turning again at once, whenever in its cycle the day began (QA, 2026-09-29: "the ferris wheel seems to stop spinning")', async () => {
        // The day as main.js runs it: a whole day of sky in daySeconds, the
        // scenery lapseScenery times fast, then the sky back at the hour it
        // started from and the scenery at its own pace. From two dozen
        // points in the wheel's cycle: the stall depended on where the
        // cycle stood when it opened again.
        const { CONFIG } = await import('../www/office/js/config.js');
        const { daySeconds, lapseScenery } = CONFIG.view;
        const from = at(14).getTime();
        const dt = 1 / 30;
        for (let k = 0; k < 24; k++) {
            // Watched at its own pace for a while first, a different while
            // each time, so the day begins at a different point in the
            // wheel's own cycle.
            let scenery = 1000;
            let s = wheelStart(true, scenery);
            for (let f = 0; f < (k / 24) * c.seconds * 10; f++) s = wheelStep(s, true, (scenery += 0.1));
            let closedInTheNight = false;
            let openedByMorning = null;
            let restedBy = null;
            for (let real = 0; real < daySeconds; real += dt) {
                const sky = new Date(from + (real / daySeconds) * 86400000);
                scenery += dt * lapseScenery;
                s = wheelStep(s, wheelOpen(sky), scenery);
                if (restedBy === null && sky.getHours() >= 23 && !s.running) restedBy = sky;
                if (sky.getHours() === 3 && !s.running) closedInTheNight = true;
                if (closedInTheNight && openedByMorning === null && s.running) openedByMorning = sky;
            }
            expect(closedInTheNight).toBe(true);
            // At rest soon after eleven on the sky's clock, even with the
            // day racing by (QA: "now the ferris wheel keeps spinning all
            // night"): it no longer runs on to the platform first.
            expect({ k, hour: restedBy.getHours(), soon: restedBy.getMinutes() < 30 }).toEqual({ k, hour: 23, soon: true });
            // Back on in the morning within minutes of ten on the sky's clock.
            expect({ k, hour: openedByMorning && openedByMorning.getHours() }).toEqual({ k, hour: 10 });
            expect(openedByMorning.getMinutes()).toBeLessThan(10);
            // And after the day, at two in the afternoon again: turning within
            // a stop's length, never standing for minutes.
            const before = s.angle;
            let standing = 0;
            let longest = 0;
            for (let f = 0; f < 60 * 30; f++) {
                scenery += dt;
                const last = s.angle;
                s = wheelStep(s, true, scenery);
                standing = s.angle === last ? standing + dt : 0;
                longest = Math.max(longest, standing);
            }
            expect({ k, longest: longest < WHEEL.board.hold + 0.5 }).toEqual({ k, longest: true });
            expect(s.angle).toBeGreaterThan(before);
        }
    });

    test('for less motion it stands where it is', () => {
        const s = { running: true, since: 3, base: 0, angle: 40, stopping: null };
        expect(wheelStep(s, true, 1000, true)).toBe(s);
    });
});

describe('its lights (QA: "ideally it would light up at night")', () => {
    test('every show gives each lamp a color, and the shows change over', () => {
        expect(SHOWS.length).toBeGreaterThanOrEqual(3);
        const seen = new Set();
        for (let t = 0; t < WHEEL.show * SHOWS.length; t += WHEEL.show / 2) {
            const col = wheelColors(t);
            expect(col).toHaveLength(WHEEL.lamps * 3);
            for (const v of col) {
                expect(v).toBeGreaterThanOrEqual(0);
                expect(v).toBeLessThanOrEqual(1);
            }
            seen.add(Array.from(col.slice(0, 3), (v) => v.toFixed(2)).join());
        }
        expect(seen.size).toBeGreaterThan(3);
    });

    test('never a flash: no lamp’s light changes by more than a sliver in a frame, through every show and change over', () => {
        const lum = (col, k) => 0.2126 * col[k * 3] + 0.7152 * col[k * 3 + 1] + 0.0722 * col[k * 3 + 2];
        let prev = wheelColors(0);
        let worst = 0;
        for (let t = 1 / 30; t < WHEEL.show * SHOWS.length + 1; t += 1 / 30) {
            const col = wheelColors(t);
            for (let k = 0; k < WHEEL.lamps; k++) worst = Math.max(worst, Math.abs(lum(col, k) - lum(prev, k)));
            prev = col;
        }
        expect(worst).toBeLessThan(0.05);
    });
});
