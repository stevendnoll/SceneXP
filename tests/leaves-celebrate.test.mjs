// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Every last leaf off the lawn with no clock (www/leaves/js/celebrate.js).
 * Steve's QA, 2026-10-08: "Should we add a celebration if a user clears 100%
 * of the yard? I think yes, and we should show it even if there is no time
 * limit." And of the neighbor: "we should avoid that during the celebration
 * and instead focus on the user's character/avatar and the clean yard."
 * The page's side of it is in tests/leaves-init.
 */
const Ch = await import('../www/leaves/js/celebrate.js');
const { LEAVES_CONFIG: C } = await import('../www/leaves/js/config.js');

const K = C.cheer;
const step = (c, input, seconds = 0.1) => Ch.stepCheer(c, seconds, input, K);

describe('when it happens', () => {
    test('in free play, the moment the lawn is clear, once leaves have been on it', () => {
        const c = Ch.createCheer();
        // Not yet armed: the lawn has not had leaves on it this session.
        expect(step(c, { free: true, spotless: true })).toBe(null);
        expect(step(c, { free: true, spotless: false })).toBe(null);
        expect(c.armed).toBe(true);
        expect(step(c, { free: true, spotless: true })).toBe('start');
        expect(Ch.isCheering(c)).toBe(true);
    });

    test('never in a round (the dive is that celebration)', () => {
        const c = Ch.createCheer();
        expect(step(c, { free: false, spotless: false })).toBe(null);
        expect(step(c, { free: false, spotless: true })).toBe(null);
        expect(c.armed).toBe(false);
    });

    test('plays for its seconds and ends, and only once a session, however often the lawn is cleared again', () => {
        const c = Ch.createCheer();
        step(c, { free: true, spotless: false });
        step(c, { free: true, spotless: true });
        let t = 0;
        let ev = null;
        while (!ev && t < 10) { ev = step(c, { free: true, spotless: true }); t += 0.1; }
        expect(ev).toBe('end');
        expect(t).toBeCloseTo(K.seconds, 0);
        // A trick-or-treater kicks a leaf back on, and it is blown off again.
        expect(step(c, { free: true, spotless: false })).toBe(null);
        expect(step(c, { free: true, spotless: true })).toBe(null);
        // A new session celebrates again.
        Ch.resetCheer(c);
        step(c, { free: true, spotless: false });
        expect(step(c, { free: true, spotless: true })).toBe('start');
    });

    test('a tap or a key ends it early, and that counts as its once', () => {
        const c = Ch.createCheer();
        expect(Ch.skipCheer(c)).toBe(false);
        step(c, { free: true, spotless: false });
        step(c, { free: true, spotless: true });
        expect(Ch.skipCheer(c)).toBe(true);
        expect(Ch.isCheering(c)).toBe(false);
        expect(step(c, { free: true, spotless: true })).toBe(null);
    });
});

describe('what it shows', () => {
    test('two hops off the lawn, then still, and none under reduced motion', () => {
        expect(Ch.cheerLift(0, K)).toBe(0);
        expect(Ch.cheerLift(K.hopTime / 2, K)).toBeCloseTo(K.hop, 6);
        expect(Ch.cheerLift(K.hopTime * 1.5, K)).toBeCloseTo(K.hop, 6);
        expect(Ch.cheerLift(K.hops * K.hopTime + 0.01, K)).toBe(0);
        expect(Ch.cheerLift(K.hopTime / 2, K, true)).toBe(0);
        for (let t = 0; t < K.seconds; t += 0.05) expect(Ch.cheerLift(t, K)).toBeGreaterThanOrEqual(0);
    });

    test('the view looks between the person and the middle of the lawn, so both are in it', () => {
        const lawn = C.yard.lawn;
        const f = Ch.cheerFocus({ x: 8, z: 6 }, lawn);
        expect(f.x).toBeCloseTo(4, 6);
        expect(f.z).toBeCloseTo((6 + (lawn.minZ + lawn.maxZ) / 2) / 2, 6);
        // In close, but the whole lawn's width or near it.
        expect(K.span).toBeGreaterThan(12);
        expect(K.span).toBeLessThan(C.camera.wideSpan);
    });

    test('its line keeps the house style', () => {
        expect(Ch.CHEER_LINE).not.toMatch(/[—;]/);
        expect(Ch.CHEER_LINE).toMatch(/spotless/);
    });
});

// Steve's QA, 2026-10-08: "Could we increase the celebration/animation if the
// user clears 100% of the lawn?" and "a separate and more elaborate
// celebration if they clear 100% within the given time".
describe('bigger', () => {
    test('a whole spin, after the hops, eased, and none under reduced motion', () => {
        expect(Ch.cheerSpin(0, K)).toBe(0);
        expect(Ch.cheerSpin(K.spin.from, K)).toBe(0);
        expect(Ch.cheerSpin(K.spin.from + K.spin.time / 2, K)).toBeCloseTo(Math.PI, 6);
        expect(Ch.cheerSpin(K.spin.from + K.spin.time, K)).toBeCloseTo(Math.PI * 2, 6);
        expect(Ch.cheerSpin(K.seconds, K)).toBeCloseTo(Math.PI * 2, 6);
        expect(Ch.cheerSpin(K.spin.from + 0.3, K, true)).toBe(0);
        // After the hops, not in the air.
        expect(K.spin.from).toBeGreaterThanOrEqual(K.hops * K.hopTime - 1e-9);
        expect(K.spin.from + K.spin.time).toBeLessThan(K.seconds);
    });

    test('the view swings out and back, handing back where it took over', () => {
        expect(Ch.cheerOrbit(0, K)).toBe(0);
        expect(Ch.cheerOrbit(K.seconds / 2, K)).toBeCloseTo(K.orbit, 6);
        expect(Ch.cheerOrbit(K.seconds, K)).toBeCloseTo(0, 6);
        expect(Ch.cheerOrbit(K.seconds / 2, K, true)).toBe(0);
    });

    test('the banner: spotless with no clock, the time inside it, a first clear or a new best', () => {
        expect(Ch.bannerFor('free')).toEqual({ big: 'Spotless!', small: Ch.CHEER_LINE, extra: '' });
        expect(Ch.bannerFor('timed', 167.4, null)).toEqual({ big: 'Lawn clear!', small: 'in 2:47', extra: 'Your first clear!' });
        expect(Ch.bannerFor('timed', 150, 167).extra).toBe('A new best time!');
        expect(Ch.bannerFor('timed', 170, 167).extra).toBe('');
        for (const b of [Ch.bannerFor('free'), Ch.bannerFor('timed', 99, 120)]) {
            for (const line of Object.values(b)) expect(line).not.toMatch(/[—;]/);
        }
    });

    test('a clear lawn inside the time gets more of everything than one with no clock', () => {
        expect(K.timed.confetti).toBeGreaterThan(K.confetti.count);
        expect(K.timed.gold).toBeGreaterThan(0);
        expect(K.timed.confetti).toBeLessThanOrEqual(K.confetti.max);
        // But it stands between the clock and the dive, so it is short.
        expect(K.timed.beat).toBeLessThan(3);
        expect(K.timed.reducedBeat).toBeLessThan(K.timed.beat);
    });
});

describe('the leaves thrown up (confetti.js)', () => {
    let Cf;
    beforeAll(async () => {
        const { loadRealThree } = await import('./helpers/real-three.mjs');
        globalThis.THREE = await loadRealThree();
        Cf = await import('../www/leaves/js/confetti.js');
    });
    afterAll(() => { delete globalThis.THREE; });
    const F = C.cheer.confetti;

    test('up and out all round from over the head, and all down within the celebration', () => {
        const list = Cf.burstOf(300, { x: 2, y: 1.9, z: 3 }, F, 7);
        expect(list).toHaveLength(300);
        let top = 0;
        let t = 0;
        const angles = new Set();
        for (const p of list) angles.add(Math.floor((Math.atan2(p.vz, p.vx) + Math.PI) / (Math.PI / 4)));
        expect(angles.size).toBe(8);
        while (t < 10 && Cf.stepConfetti(list, 1 / 60, F, t) > 0) {
            for (const p of list) if (!p.gone) top = Math.max(top, p.y);
            t += 1 / 60;
        }
        // Well over the person's head, and down in under the celebration.
        expect(top).toBeGreaterThan(3);
        expect(t).toBeGreaterThan(1.8);
        expect(t).toBeLessThan(C.cheer.seconds);
        expect(list.every((p) => p.gone)).toBe(true);
    });

    test('never on the lawn: each shrinks to nothing over its last half meter, and is gone at the grass', () => {
        expect(Cf.confettiScale({ y: 2, vy: -1, gone: false }, F)).toBe(1);
        expect(Cf.confettiScale({ y: 0.3, vy: 2, gone: false }, F)).toBe(1);
        const low = Cf.confettiScale({ y: F.fadeAbove / 2, vy: -1, gone: false }, F);
        expect(low).toBeGreaterThan(0);
        expect(low).toBeLessThan(1);
        expect(Cf.confettiScale({ y: 0.001, vy: -1, gone: false }, F)).toBeLessThan(0.01);
        expect(Cf.confettiScale({ y: 1, vy: -1, gone: true }, F)).toBe(0);
        const list = Cf.burstOf(50, { x: 0, y: 1.9, z: 0 }, F, 3);
        for (let t = 0; t < 6; t += 1 / 60) {
            Cf.stepConfetti(list, 1 / 60, F, t);
            for (const p of list) if (!p.gone) expect(p.y).toBeGreaterThan(0.01);
        }
    });

    test('the mesh: drawn while they fly, some gold for a clear lawn inside the time, hidden once all are down', () => {
        const c = Cf.createConfetti(C, 0.12, F.max);
        expect(c.mesh.visible).toBe(false);
        c.burst({ x: 0, y: 1.9, z: 0 }, C.cheer.timed.confetti, C.cheer.timed.gold, 5);
        expect(c.mesh.visible).toBe(true);
        expect(c.flying()).toBe(C.cheer.timed.confetti);
        const look = c.mesh.geometry.getAttribute('iLook');
        let gold = 0;
        for (let i = 0; i < C.cheer.timed.confetti; i++) {
            if (look.getX(i) === F.goldColor[0] && look.getY(i) === Math.fround(F.goldColor[1])) gold++;
        }
        expect(gold).toBe(Math.round(C.cheer.timed.confetti * C.cheer.timed.gold));
        for (let t = 0; t < 6 && c.flying(); t += 1 / 30) c.step(1 / 30, t);
        expect(c.flying()).toBe(0);
        expect(c.mesh.visible).toBe(false);
    });
});
