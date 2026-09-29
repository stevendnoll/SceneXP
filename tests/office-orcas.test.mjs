// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The orcas (orcas.js): a pod that visits the bay now and then, the first
 * visit soon after the page opens, breathing as orcas do: bouts of rolling
 * breaths with a blow at the start of each, a long dive after, now and then
 * a breach, all down the office's own street.
 */
import * as orcas from '../www/office/js/orcas.js';

const { ORCAS, pod, visitAt, podCenter, breathing, orcaPose } = orcas;

describe('the visits', () => {
    test('the first soon after the page opens, then now and then, each a few minutes long', () => {
        expect(visitAt(ORCAS.visit.first - 1)).toBeNull();
        expect(visitAt(ORCAS.visit.first + 1)).toMatchObject({ k: 0 });
        expect(ORCAS.visit.first).toBeLessThan(60);
        expect(visitAt(ORCAS.visit.first + ORCAS.visit.length + 1)).toBeNull();
        expect(visitAt(ORCAS.visit.first + ORCAS.visit.every + 5)).toMatchObject({ k: 1 });
        expect(ORCAS.visit.length).toBeGreaterThanOrEqual(240);
    });

    test('down the office\'s street, inside the stretch both the desk and the window see', () => {
        const { x: [x0, x1], z: [z0, z1] } = ORCAS.area;
        for (let t = ORCAS.visit.first; t < ORCAS.visit.first + ORCAS.visit.length; t += 3) {
            for (const o of pod()) {
                const p = orcaPose(o, t);
                expect(p.x).toBeGreaterThan(x0 - 5);
                expect(p.x).toBeLessThan(x1 + 5);
                expect(p.z).toBeGreaterThan(z0 - 5);
                expect(p.z).toBeLessThan(z1 + 5);
            }
        }
    });

    test('at an orca\'s pace, the pod together', () => {
        const speeds = [];
        for (let into = 5; into < ORCAS.visit.length - 5; into += 7) {
            const a = podCenter(0, into);
            const b = podCenter(0, into + 1);
            speeds.push(Math.hypot(b[0] - a[0], b[1] - a[1]));
        }
        expect(Math.max(...speeds)).toBeLessThan(ORCAS.speed * 2.2);
        expect(speeds.reduce((s, v) => s + v, 0) / speeds.length).toBeGreaterThan(ORCAS.speed * 0.4);
    });
});

describe('the breathing', () => {
    const [bull, cow] = pod();

    test('bouts of breaths some seconds apart, a long dive between bouts', () => {
        const starts = [];
        let was = false;
        for (let into = 0; into < ORCAS.visit.length; into += 0.1) {
            const b = breathing(cow, 0, into);
            if (b.breath && !was) starts.push(into);
            was = b.breath;
        }
        expect(starts.length).toBeGreaterThan(6);
        const gaps = starts.slice(1).map((s, i) => s - starts[i]);
        expect(Math.min(...gaps)).toBeGreaterThanOrEqual(ORCAS.bout.between[0] - 0.2);
        expect(Math.max(...gaps)).toBeGreaterThan(ORCAS.bout.dive[0]);
    });

    test('a roll: the blow first, then the back and fin clear of the water at the top, and under again', () => {
        let into = 0;
        while (!(breathing(bull, 0, into).breath && !breathing(bull, 0, into).breach && breathing(bull, 0, into).p < 0.02)) into += 0.02;
        const t0 = ORCAS.visit.first + into;
        const start = orcaPose(bull, t0 + 0.05);
        expect(start.spout).not.toBeNull();
        expect(start.pitch).toBeGreaterThan(0.2);
        const top = orcaPose(bull, t0 + ORCAS.roll / 2);
        // Its middle near the surface, so its back (about a meter up) and
        // its fin stand clear.
        expect(top.y).toBeGreaterThan(-0.2);
        expect(Math.abs(top.pitch)).toBeLessThan(0.05);
        const end = orcaPose(bull, t0 + ORCAS.roll * 0.95);
        expect(end.pitch).toBeLessThan(-0.2);
        const under = orcaPose(bull, t0 + ORCAS.roll + 0.5);
        expect(under.y).toBeLessThan(-3);
        expect(under.spout).toBeNull();
    });

    test('now and then a breach: out of the water in a leap, and a splash', () => {
        let found = null;
        for (let k = 0; k < 6 && !found; k++) {
            for (const o of pod()) {
                for (let into = 0; into < ORCAS.visit.length; into += 0.2) {
                    const b = breathing(o, k, into);
                    if (b.breach) { found = { o, k, into }; break; }
                }
                if (found) break;
            }
        }
        expect(found).not.toBeNull();
        const t = ORCAS.visit.first + found.k * ORCAS.visit.every;
        let into = found.into;
        while (breathing(found.o, found.k, into - 0.05).breach) into -= 0.05;
        const mid = orcaPose(found.o, t + into + ORCAS.breach.seconds / 2);
        expect(mid.y).toBeGreaterThan(ORCAS.length * 0.3);
        const land = orcaPose(found.o, t + into + ORCAS.breach.seconds * 0.9);
        expect(land.splash).not.toBeNull();
    });

    test('the bull is the one with the tall fin', () => {
        expect(pod()[0].bull).toBe(true);
        expect(pod().filter((o) => o.bull)).toHaveLength(1);
    });
});
