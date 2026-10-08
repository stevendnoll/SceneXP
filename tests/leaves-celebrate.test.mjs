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
