// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Unit tests for www/shared/js/targeting-1.0.0.js — what the guns are aimed at.
 *
 * There is no THREE stub anywhere in this file, because the module has no
 * THREE in it. That is the payoff of writing target selection as a pure
 * function over plain vectors: every assertion below is arithmetic a person can
 * check by hand, and a failure points at a rule rather than at a proxy.
 *
 * The properties that carry the module, in the order they would hurt:
 *
 *   1. SELECTION IS BY ANGLE. A far target dead centre must beat a near one at
 *      the edge of the cone. Sorting by distance instead produces a lock that
 *      jumps to whatever drifted close, which reads as the game arguing with
 *      the player about where they are pointing.
 *   2. TIES ARE STABLE. Two candidates at the same angle is a formation flying
 *      abreast, not a hypothetical, and an unstable tiebreak makes the lock
 *      indicator flicker between them every frame.
 *   3. OCCLUSION USES A SEGMENT, NOT A RAY. A target standing IN FRONT of a
 *      planet must not read as hidden behind it. This is the case a naive
 *      ray-sphere test gets wrong and the reason the primitive is named.
 *
 * Boundary cases are asserted EXACTLY rather than approximately. Where a test
 * needs a candidate sitting precisely on the cone edge, it measures the angle
 * with angleBetween and hands that same number back as the rule, so "inclusive
 * at the boundary" is tested as the real decision it is rather than as a
 * floating-point near-miss.
 */

const { angleBetween, isOccluded, pickTarget, __test__ } =
    await import('../www/shared/js/targeting-1.0.0.js');

const FORWARD = { x: 0, y: 0, z: -1 };
const EYE = { x: 0, y: 0, z: 0 };
const view = (eye = EYE, forward = FORWARD) => ({ eye, forward });

/** A candidate `angle` radians off the nose (rotated in the XZ plane, so the
 *  offset is horizontal) at `distance` from the eye. */
function candidateAt(id, angle, distance, allegiance = 'hostile') {
    return {
        id,
        allegiance,
        position: {
            x: distance * Math.sin(angle),
            y: 0,
            z: -distance * Math.cos(angle)
        }
    };
}

const rules = (over = {}) => ({
    coneRadians: 0.10472,   // 6 degrees
    range: 8000,
    allegiance: ['hostile'],
    ...over
});

// ---- angleBetween ----------------------------------------------------------

describe('angleBetween', () => {
    test('is zero straight ahead and PI straight behind', () => {
        expect(angleBetween(FORWARD, { x: 0, y: 0, z: -500 })).toBeCloseTo(0, 12);
        expect(angleBetween(FORWARD, { x: 0, y: 0, z: 500 })).toBeCloseTo(Math.PI, 12);
    });

    test('is a right angle straight up, straight down, and out to the side', () => {
        const half = Math.PI / 2;
        expect(angleBetween(FORWARD, { x: 0, y: 100, z: 0 })).toBeCloseTo(half, 12);
        expect(angleBetween(FORWARD, { x: 0, y: -100, z: 0 })).toBeCloseTo(half, 12);
        expect(angleBetween(FORWARD, { x: 100, y: 0, z: 0 })).toBeCloseTo(half, 12);
    });

    test('does not care how far away the target is, only which way it lies', () => {
        const near = angleBetween(FORWARD, { x: 10, y: 0, z: -100 });
        const far = angleBetween(FORWARD, { x: 1000, y: 0, z: -10000 });
        expect(near).toBeCloseTo(far, 12);
    });

    test('a target exactly at the eye reads as centred rather than as NaN', () => {
        expect(angleBetween(FORWARD, { x: 0, y: 0, z: 0 })).toBe(0);
    });

    test('a dead-on target never trips acos with a dot product past one', () => {
        // Floating point can push the normalised dot to 1.0000000000000002,
        // which is NaN out of acos and a lock that silently never happens.
        for (const d of [1, 3, 7, 1e5, 1e7]) {
            const a = angleBetween(FORWARD, { x: 0, y: 0, z: -d });
            expect(Number.isNaN(a)).toBe(false);
        }
    });
});

// ---- The cone --------------------------------------------------------------

describe('the targeting cone', () => {
    test('accepts a target exactly on the boundary', () => {
        const c = candidateAt('edge', 0.10472, 1000);
        // Measured, not assumed: this is the angle the module will compute.
        const exact = angleBetween(FORWARD, c.position);
        const picked = pickTarget(view(), [c], rules({ coneRadians: exact }));
        expect(picked).not.toBeNull();
        expect(picked.id).toBe('edge');
    });

    test('accepts a target just inside it', () => {
        const c = candidateAt('inside', 0.10472 * 0.99, 1000);
        expect(pickTarget(view(), [c], rules()).id).toBe('inside');
    });

    test('rejects a target just outside it', () => {
        const c = candidateAt('outside', 0.10472 * 1.01, 1000);
        expect(pickTarget(view(), [c], rules())).toBeNull();
    });

    test('rejects a target off to the side, however close', () => {
        const c = candidateAt('beside', Math.PI / 2, 10);
        expect(pickTarget(view(), [c], rules())).toBeNull();
    });

    test('rejects a candidate behind the camera', () => {
        const behind = { id: 'behind', allegiance: 'hostile', position: { x: 0, y: 0, z: 900 } };
        expect(pickTarget(view(), [behind], rules())).toBeNull();
    });

    test('the cone is measured off the forward vector, not off -Z', () => {
        // Same candidate, two headings: centred for one, far off for the other.
        const c = candidateAt('c', 0, 1000);
        expect(pickTarget(view(EYE, FORWARD), [c], rules()).id).toBe('c');
        expect(pickTarget(view(EYE, { x: 1, y: 0, z: 0 }), [c], rules())).toBeNull();
    });
});

// ---- Range -----------------------------------------------------------------

describe('range', () => {
    test('accepts a target exactly at range', () => {
        const c = candidateAt('at', 0, 8000);
        expect(pickTarget(view(), [c], rules({ range: 8000 })).id).toBe('at');
    });

    test('accepts one just inside and rejects one just outside', () => {
        expect(pickTarget(view(), [candidateAt('in', 0, 7999)], rules()).id).toBe('in');
        expect(pickTarget(view(), [candidateAt('out', 0, 8001)], rules())).toBeNull();
    });

    test('range is measured from the eye, not from the origin', () => {
        const eye = { x: 0, y: 0, z: 7000 };
        const c = { id: 'near-eye', allegiance: 'hostile', position: { x: 0, y: 0, z: 6000 } };
        // 1,000 from the eye, 6,000 from the origin. A short range must accept it.
        expect(pickTarget(view(eye), [c], rules({ range: 2000 })).id).toBe('near-eye');
    });
});

// ---- Allegiance ------------------------------------------------------------

describe('allegiance', () => {
    test('a wrong-allegiance candidate is never selected, even dead centre', () => {
        const friendly = candidateAt('friend', 0, 100, 'friendly');
        expect(pickTarget(view(), [friendly], rules())).toBeNull();
    });

    test('the wrong allegiance does not shadow a valid target behind it', () => {
        const friendly = candidateAt('friend', 0, 100, 'friendly');
        const hostile = candidateAt('raider', 0.03, 4000);
        expect(pickTarget(view(), [friendly, hostile], rules()).id).toBe('raider');
    });

    test('several allegiances can qualify at once', () => {
        const list = [candidateAt('a', 0.02, 500, 'hostile'), candidateAt('b', 0.01, 500, 'derelict')];
        const picked = pickTarget(view(), list, rules({ allegiance: ['hostile', 'derelict'] }));
        expect(picked.id).toBe('b');
    });

    test('no allegiance rule at all means everything qualifies', () => {
        const friendly = candidateAt('friend', 0, 100, 'friendly');
        const picked = pickTarget(view(), [friendly], rules({ allegiance: null }));
        expect(picked.id).toBe('friend');
    });
});

// ---- Selection and ties ----------------------------------------------------

describe('choosing between candidates', () => {
    test('centred-and-far beats offset-and-near', () => {
        const near = candidateAt('near', 0.09, 300);
        const far = candidateAt('far', 0.01, 7500);
        expect(pickTarget(view(), [near, far], rules()).id).toBe('far');
        // And the answer does not depend on the order they arrived in.
        expect(pickTarget(view(), [far, near], rules()).id).toBe('far');
    });

    test('an equal angle is broken by the shorter distance', () => {
        const a = candidateAt('a', 0.05, 5000);
        const b = candidateAt('b', 0.05, 1000);
        expect(pickTarget(view(), [a, b], rules()).id).toBe('b');
        expect(pickTarget(view(), [b, a], rules()).id).toBe('b');
    });

    test('two identical candidates resolve to the same one every time', () => {
        // The flicker case: same angle, same distance, differing only by id.
        const alpha = { ...candidateAt('x', 0.04, 2000), id: 'alpha' };
        const beta = { ...candidateAt('x', 0.04, 2000), id: 'beta' };
        expect(pickTarget(view(), [alpha, beta], rules()).id).toBe('alpha');
        expect(pickTarget(view(), [beta, alpha], rules()).id).toBe('alpha');
    });

    test('the lock does not change when an irrelevant candidate is added', () => {
        const chosen = candidateAt('chosen', 0.01, 2000);
        const list = [chosen];
        const before = pickTarget(view(), list, rules()).id;
        list.push(candidateAt('other', 0.09, 200), candidateAt('far', 0.02, 7000));
        expect(pickTarget(view(), list, rules()).id).toBe(before);
    });

    test('returns the angle, the distance, and the candidate it chose', () => {
        const c = candidateAt('c', 0.02, 3000);
        const picked = pickTarget(view(), [c], rules());
        expect(picked.angle).toBeCloseTo(0.02, 10);
        expect(picked.distance).toBeCloseTo(3000, 6);
        expect(picked.position).toBe(c.position);
        expect(picked.candidate).toBe(c);
    });
});

// ---- Occlusion -------------------------------------------------------------

describe('occlusion', () => {
    const planet = { id: 'earth', centre: { x: 0, y: 0, z: -5000 }, radius: 1000 };

    test('a planet between the eye and the target hides it', () => {
        expect(isOccluded(EYE, { x: 0, y: 0, z: -9000 }, [planet])).toBe(true);
    });

    test('a target IN FRONT of a planet is not occluded', () => {
        // The case a ray test gets wrong: the infinite line hits the sphere,
        // but the segment stops well short of it.
        expect(isOccluded(EYE, { x: 0, y: 0, z: -2000 }, [planet])).toBe(false);
    });

    test('a target beside a planet is not occluded', () => {
        expect(isOccluded(EYE, { x: 4000, y: 0, z: -9000 }, [planet])).toBe(false);
    });

    test('a planet behind the eye does not occlude anything ahead', () => {
        const behind = { centre: { x: 0, y: 0, z: 4000 }, radius: 1000 };
        expect(isOccluded(EYE, { x: 0, y: 0, z: -9000 }, [behind])).toBe(false);
    });

    test('no occluder list at all means nothing is occluded', () => {
        expect(isOccluded(EYE, { x: 0, y: 0, z: -9000 }, null)).toBe(false);
        expect(isOccluded(EYE, { x: 0, y: 0, z: -9000 }, [])).toBe(false);
        expect(isOccluded(EYE, { x: 0, y: 0, z: -9000 }, [null])).toBe(false);
    });

    test('any one occluder in a list is enough', () => {
        const miss = { centre: { x: 90000, y: 0, z: 0 }, radius: 10 };
        expect(isOccluded(EYE, { x: 0, y: 0, z: -9000 }, [miss, planet])).toBe(true);
    });

    test('an occluded target is skipped and the next valid one chosen', () => {
        const hidden = candidateAt('hidden', 0.005, 7500);   // straight through the planet
        const clear = candidateAt('clear', 0.08, 2000);      // off to one side, in front
        const picked = pickTarget(view(), [hidden, clear], rules({ occluders: [planet] }));
        expect(picked.id).toBe('clear');
    });

    test('a better-angled but occluded candidate never displaces a clear one', () => {
        const hidden = candidateAt('hidden', 0.001, 7500);
        const clear = candidateAt('clear', 0.08, 2000);
        // Both orders, because the promotion check runs before the occlusion
        // check and the order is exactly what would expose a mistake there.
        expect(pickTarget(view(), [hidden, clear], rules({ occluders: [planet] })).id).toBe('clear');
        expect(pickTarget(view(), [clear, hidden], rules({ occluders: [planet] })).id).toBe('clear');
    });

    test('every candidate occluded means no target at all', () => {
        const a = candidateAt('a', 0.005, 7500);
        const b = candidateAt('b', 0.02, 7000);
        expect(pickTarget(view(), [a, b], rules({ occluders: [planet] }))).toBeNull();
    });

    describe('the segment-sphere primitive itself', () => {
        const { occludedBySphere } = __test__;
        const centre = { x: 0, y: 0, z: 0 };

        test('a segment that misses entirely', () => {
            expect(occludedBySphere({ x: -50, y: 20, z: 0 }, { x: 50, y: 20, z: 0 }, centre, 10))
                .toBe(false);
        });

        test('a segment that passes clean through', () => {
            expect(occludedBySphere({ x: -50, y: 0, z: 0 }, { x: 50, y: 0, z: 0 }, centre, 10))
                .toBe(true);
        });

        test('a segment that ends inside', () => {
            expect(occludedBySphere({ x: -50, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }, centre, 10))
                .toBe(true);
        });

        test('a segment that starts inside', () => {
            expect(occludedBySphere({ x: 3, y: 0, z: 0 }, { x: 50, y: 0, z: 0 }, centre, 10))
                .toBe(true);
        });

        test('a tangent segment grazes rather than occludes', () => {
            expect(occludedBySphere({ x: -50, y: 10, z: 0 }, { x: 50, y: 10, z: 0 }, centre, 10))
                .toBe(false);
        });

        test('a segment that stops short does NOT read as occluded', () => {
            // Same line as the pass-through case, cut off before the sphere.
            expect(occludedBySphere({ x: -50, y: 0, z: 0 }, { x: -20, y: 0, z: 0 }, centre, 10))
                .toBe(false);
        });

        test('a degenerate segment falls back to a point test', () => {
            const p = { x: 3, y: 0, z: 0 };
            expect(occludedBySphere(p, p, centre, 10)).toBe(true);
            const out = { x: 30, y: 0, z: 0 };
            expect(occludedBySphere(out, out, centre, 10)).toBe(false);
        });
    });
});

// ---- Degenerate input ------------------------------------------------------

describe('nothing to shoot', () => {
    test('an empty candidate list returns null', () => {
        expect(pickTarget(view(), [], rules())).toBeNull();
    });

    test('a missing candidate list returns null', () => {
        expect(pickTarget(view(), null, rules())).toBeNull();
    });

    test('a missing view returns null', () => {
        expect(pickTarget(null, [candidateAt('c', 0, 100)], rules())).toBeNull();
    });

    test('holes and positionless entries are skipped rather than thrown on', () => {
        const list = [null, { id: 'no-position', allegiance: 'hostile' }, candidateAt('real', 0, 500)];
        expect(pickTarget(view(), list, rules()).id).toBe('real');
    });

    test('omitted rules fall back to the module defaults', () => {
        const inside = candidateAt('inside', 0.05, 5000);
        expect(pickTarget(view(), [inside]).id).toBe('inside');
        // Outside the default 8,000 range and the default 6 degree cone.
        expect(pickTarget(view(), [candidateAt('far', 0.05, 9000)])).toBeNull();
        expect(pickTarget(view(), [candidateAt('wide', 0.2, 5000)])).toBeNull();
    });
});
