// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The window washers' gondolas (washers.js): two crews on two towers across
 * the street, working the face toward the office a drop at a time, a floor
 * at a stop, and parked up by night and in the rain.
 */
import * as washers from '../www/office/js/washers.js';
import { WATER_Y } from '../www/office/js/city.js';

const { WASHERS, washerFaces, washerAt, drops, dropAt } = washers;

const at = (h, day = 28, month = 8) => {
    const d = new Date(2026, month, day);
    d.setTime(d.getTime() + h * 3600 * 1000);
    return d;
};

describe('the towers and the faces they work', () => {
    const faces = washerFaces();

    test('two towers across the street, tall, each working its face toward the office', () => {
        expect(faces).toHaveLength(2);
        for (const f of faces) {
            // West of the office, the face on the office's side of the tower.
            expect(f.tower.z).toBeLessThan(-200);
            expect(f.z).toBeGreaterThan(f.tower.z);
            expect(f.tower.h).toBeGreaterThan(100);
            expect(f.yaw).toBe(0);
            // The roof is the top section's, and a drop goes most of its way down.
            expect(f.roof).toBeCloseTo(WATER_Y + f.tower.base + f.tower.h, 6);
            expect(f.travel).toBeGreaterThan(20);
            expect(f.travel).toBeLessThanOrEqual(WASHERS.reach);
            expect(drops(f)).toBeGreaterThanOrEqual(2);
            // Every drop's gondola on the face.
            for (let k = 0; k < drops(f); k++) {
                expect(Math.abs(dropAt(f, k)) + WASHERS.width / 2).toBeLessThanOrEqual(f.length / 2);
            }
        }
        expect(faces[0].tower).not.toBe(faces[1].tower);
    });

    test('parked before eight and after the day, and in the rain', () => {
        for (const [i, f] of faces.entries()) {
            expect(washerAt(f, at(6), i)).toMatchObject({ down: 0, working: false });
            expect(washerAt(f, at(21), i)).toMatchObject({ down: 0, working: false });
            expect(washerAt(f, at(11.2), i, 1)).toMatchObject({ down: 0, working: false });
            expect(washerAt(f, at(11.2), i).working).toBe(true);
        }
    });

    test('down a floor at a stop, most of the time at the glass, all the way down, then back up at the roof', () => {
        const f = faces[1];
        const minute = (m) => washerAt(f, at(8 + (WASHERS.late[1] + m) / 60), 1);
        const { down, up } = WASHERS.minutes;
        let still = 0;
        let last = 0;
        for (let s = 0; s < down * 60; s += 10) {
            const p = minute(s / 60);
            expect(p.down).toBeGreaterThanOrEqual(last - 1e-9);
            if (Math.abs(p.down - last) < 1e-6) still++;
            last = p.down;
        }
        expect(still / (down * 6)).toBeGreaterThan(0.6);
        expect(minute(down - 0.01).down).toBeGreaterThan(f.travel * 0.95);
        expect(minute(down + up).down).toBeCloseTo(0, 6);
        // Every stop a floor apart.
        const floors = Math.floor(f.travel / WASHERS.floor);
        expect(minute((down / floors) * 0.5).down).toBeCloseTo(0, 6);
        expect(minute((down / floors) * 1.5).down).toBeCloseTo(f.travel / floors, 6);
    });

    test('never a jump: minute by minute through the day, and from one evening to the next morning', () => {
        for (const [i, f] of faces.entries()) {
            let prev = washerAt(f, at(7), i);
            for (let m = 7 * 60; m < 18 * 60; m += 0.25) {
                const p = washerAt(f, at(m / 60), i);
                expect(Math.abs(p.along - prev.along)).toBeLessThan(0.5);
                // A hoist's pace, some ten meters a minute at most.
                expect(Math.abs(p.down - prev.down)).toBeLessThan(3);
                // Along the roof only when it is up at the roof.
                if (Math.abs(p.along - prev.along) > 1e-9) expect(p.down).toBe(0);
                prev = p;
            }
            // Parked in the evening where it starts the next morning.
            expect(washerAt(f, at(22, 28), i).along).toBeCloseTo(washerAt(f, at(7, 29), i).along, 9);
        }
    });

    test('the crews go on round the tower from day to day, and are never in step', () => {
        const f = faces[0];
        const starts = [28, 29, 30].map((d) => washerAt(f, at(8.1, d), 0).along);
        expect(new Set(starts).size).toBeGreaterThan(1);
        const a = washerAt(faces[0], at(10.3), 0);
        const b = washerAt(faces[1], at(10.3), 1);
        expect(Math.abs(a.down / faces[0].travel - b.down / faces[1].travel)).toBeGreaterThan(0.05);
    });
});
