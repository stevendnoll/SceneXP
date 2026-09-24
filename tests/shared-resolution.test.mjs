// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Tests for www/shared/js/resolution-1.0.0.js, adaptive resolution.
 *
 * Promoted from High Water on 2026-09-24 for Tornado Alley. The policy's own
 * properties (backs off when slow, measured against the display, settles
 * rather than hunts) are held by tests/highwater-quality.test.mjs, which runs
 * through this part now. This suite holds the wiring: what reaches the
 * renderer, and when.
 */
const R = await import('../www/shared/js/resolution-1.0.0.js');
const { OCEAN_CONFIG } = await import('../www/highwater/js/config.js');

const Q = R.RESOLUTION_DEFAULTS;

function fakeRenderer() {
    const calls = [];
    return {
        calls,
        setPixelRatio: (r) => calls.push(['ratio', r]),
        setSize: (w, h, style) => calls.push(['size', w, h, style])
    };
}

function build(extra = {}) {
    const renderer = fakeRenderer();
    let ceiling = 2;
    const res = R.createResolution({
        renderer,
        ceiling: () => ceiling,
        size: () => [390, 844],
        ...extra
    });
    return { renderer, res, setCeiling: (c) => { ceiling = c; } };
}

/** Feed `n` frames of `seconds` each. */
const feed = (res, seconds, n) => { for (let i = 0; i < n; i++) res.sample(seconds); };
const ratios = (renderer) => renderer.calls.filter((c) => c[0] === 'ratio').map((c) => c[1]);

test('THE DEFAULTS ARE HIGH WATER\'S, the numbers it was QA\'d with', () => {
    expect({ ...Q }).toEqual(OCEAN_CONFIG.quality);
    expect(Object.isFrozen(Q)).toBe(true);
});

test('apply sizes the canvas at the device ceiling, in CSS pixels, without touching its style', () => {
    const { renderer, res } = build();
    res.apply();
    expect(renderer.calls).toEqual([['ratio', 2], ['size', 390, 844, false]]);
    expect(res.readout()).toMatchObject({ ratio: 2, ceiling: 2, scale: 1 });
});

test('a device that keeps up is never touched', () => {
    const { renderer, res } = build();
    res.apply();
    feed(res, 1 / 60, 2000);
    expect(ratios(renderer)).toEqual([2]);
});

test('A SLOW STRETCH BACKS OFF, a step at a time, down to the floor', () => {
    const { renderer, res } = build();
    res.apply();
    feed(res, 1 / 60, Q.settleFrames + 30);
    feed(res, 1 / 20, 400);
    const seen = ratios(renderer);
    expect(seen.length).toBeGreaterThan(3);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeLessThan(seen[i - 1]);
    expect(res.readout().scale).toBe(Q.minScale);
    expect(seen[seen.length - 1]).toBeCloseTo(2 * Q.minScale, 10);
});

test('and it climbs back once the hard part is over', () => {
    const { res } = build();
    res.apply();
    feed(res, 1 / 60, Q.settleFrames + 30);
    feed(res, 1 / 20, 400);
    feed(res, 1 / 60, 60 * 60);
    expect(res.readout().scale).toBe(1);
});

test('frames that say nothing about the device are left out', () => {
    const { renderer, res } = build();
    res.apply();
    // A tab coming back, a zero delta, a negative one.
    feed(res, Q.ignoreAboveSeconds + 0.01, 500);
    feed(res, 0, 500);
    feed(res, -1, 500);
    expect(res.state().frames).toBe(0);
    expect(ratios(renderer)).toEqual([2]);
});

test('PINNED FOR A CAPTURE: full resolution at once, and held through slow frames', () => {
    const { renderer, res } = build();
    res.apply();
    feed(res, 1 / 60, Q.settleFrames + 30);
    feed(res, 1 / 20, 400);
    expect(res.readout().scale).toBe(Q.minScale);
    expect(res.pin(true)).toEqual({ pinned: true, ratio: 2 });
    expect(ratios(renderer).pop()).toBe(2);
    const before = renderer.calls.length;
    feed(res, 1 / 20, 400);
    expect(renderer.calls.length).toBe(before);
    // Unpinned, it goes back to measuring.
    expect(res.pin(false)).toEqual({ pinned: false, ratio: 2 });
    feed(res, 1 / 20, 400);
    expect(res.readout().scale).toBeLessThan(1);
});

test('a resize takes the new ceiling and keeps the scale it had settled on', () => {
    const { renderer, res, setCeiling } = build();
    res.apply();
    feed(res, 1 / 60, Q.settleFrames + 30);
    feed(res, 1 / 20, 70);
    const scale = res.readout().scale;
    expect(scale).toBeLessThan(1);
    setCeiling(1);
    res.apply();
    expect(ratios(renderer).pop()).toBeCloseTo(scale, 3);
    expect(res.readout().ceiling).toBe(1);
});

test('overrides reach the policy, and with no renderer it does nothing', () => {
    const { res } = build({ quality: { minScale: 0.9 } });
    res.apply();
    feed(res, 1 / 60, Q.settleFrames + 30);
    feed(res, 1 / 20, 400);
    expect(res.readout().scale).toBe(0.9);
    const none = R.createResolution({ ceiling: () => 1, size: () => [1, 1] });
    none.apply();
    none.sample(1 / 60);
    expect(none.state().frames).toBe(0);
});

test('the policy on its own: unchanged before it has settled', () => {
    const sample = { frame: 1, best: 0.001, scale: 0.7, since: 99, frames: Q.settleFrames - 1 };
    expect(R.nextPixelScale(sample)).toBe(0.7);
});
