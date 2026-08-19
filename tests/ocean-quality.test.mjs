// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Adaptive resolution for the Ocean (www/ocean/js/main.js).
 *
 * WHY THIS EXISTS AS A PURE FUNCTION AT ALL. The thing it protects against is
 * the only part of this scene that cannot be measured outside a browser: the
 * water's fragment shader running on the whole frame instead of half of it once
 * the tsunami fills the picture. Measured, the water covers 50 per cent of the
 * frame for most of the arc and 100 per cent from t=78, while the CPU stays flat
 * at 0.10 to 0.14 ms a frame throughout. So the policy is written as arithmetic
 * that can be tested here, and only the two lines that call `setPixelRatio` are
 * left needing a GPU and somebody's eyes.
 *
 * WHAT IS ASSERTED IS THE POLICY, NOT THE NUMBERS. "Backs off when slow" and
 * "does not oscillate" survive a retune of every constant in the config block.
 */
import { jest } from '@jest/globals';

let nextPixelScale;
let CONFIG;

beforeAll(async () => {
    // main.js only runs anything when there is a document, so importing it in
    // Node gets the module and none of the scene.
    ({ OCEAN_CONFIG: CONFIG } = await import('../www/ocean/js/config.js'));
    ({ nextPixelScale } = await import('../www/ocean/js/main.js'));
});

afterEach(() => { jest.restoreAllMocks(); });

/** A device that has been running at `bestMs` and is currently taking `frameMs`. */
function sample(frameMs, bestMs, overrides = {}) {
    return {
        frame: frameMs / 1000,
        best: bestMs / 1000,
        scale: 1,
        since: 999,
        frames: CONFIG.quality.settleFrames + 1,
        ...overrides
    };
}

describe('it does nothing until it knows anything', () => {
    test('the opening frames are ignored, whatever they look like', () => {
        // Shader compilation and the first attribute upload both land in the
        // first second and neither says anything about the device.
        const early = sample(400, 16, { frames: 1 });
        expect(nextPixelScale(early, CONFIG)).toBe(1);
    });

    test('a scene that is keeping up is left alone', () => {
        expect(nextPixelScale(sample(16.7, 16.7), CONFIG)).toBe(1);
    });
});

describe('backing off', () => {
    test('a frame well over the display interval drops the resolution', () => {
        const next = nextPixelScale(sample(33, 16.7), CONFIG);
        expect(next).toBeLessThan(1);
    });

    test('it keeps backing off while it is still slow, down to a floor', () => {
        let scale = 1;
        for (let i = 0; i < 50; i++) {
            scale = nextPixelScale(sample(33, 16.7, { scale }), CONFIG);
        }
        // A FLOOR AND NOT ZERO. Past a point the picture is the problem rather
        // than the solution, and a scene rendered at a quarter resolution is not
        // one anybody would share.
        expect(scale).toBe(CONFIG.quality.minScale);
        expect(scale).toBeGreaterThan(0.4);
    });

    test('it will not back off twice in a row without waiting', () => {
        // Changing the ratio reallocates the drawing buffer, which is itself a
        // dropped frame. Reacting every frame would be a stutter machine.
        const busy = sample(33, 16.7, { since: 0 });
        expect(nextPixelScale(busy, CONFIG)).toBe(1);
    });
});

describe('the yardstick is the display, not sixty', () => {
    test('a 30 Hz display running perfectly is not called slow', () => {
        // THE BUG A FIXED MILLISECOND BUDGET WOULD HAVE. At 30 Hz every frame
        // takes 33 ms, which is twice the number a 60 Hz budget would allow, and
        // there is nothing whatever wrong.
        expect(nextPixelScale(sample(33.3, 33.3), CONFIG)).toBe(1);
    });

    test('a 120 Hz display that has halved its rate IS called slow', () => {
        // And the bug in the other direction: 16.7 ms is comfortable on a 60 Hz
        // panel and is a dropped frame every other frame on a 120 Hz one.
        expect(nextPixelScale(sample(16.7, 8.3), CONFIG)).toBeLessThan(1);
    });

    test('a device that was never fast even once still gets help', () => {
        // The relative test cannot see this case by construction: if the best
        // frame is also a bad frame then nothing is ever slow relative to it.
        const grim = sample(80, 80);
        expect(nextPixelScale(grim, CONFIG)).toBeLessThan(1);
    });
});

describe('reaching back up', () => {
    test('it recovers when the hard part is over', () => {
        const easy = sample(16.7, 16.4, { scale: 0.7 });
        expect(nextPixelScale(easy, CONFIG)).toBeGreaterThan(0.7);
    });

    test('it never climbs past the device its own ratio', () => {
        let scale = 0.95;
        for (let i = 0; i < 50; i++) {
            scale = nextPixelScale(sample(16.7, 16.7, { scale }), CONFIG);
        }
        expect(scale).toBe(1);
    });

    test('it waits longer to climb than it does to back off', () => {
        // Not symmetrical on purpose: guessing wrong downward costs a little
        // sharpness, guessing wrong upward costs the frame rate at the climax.
        const q = CONFIG.quality;
        expect(q.holdUpSeconds).toBeGreaterThan(q.holdDownSeconds);

        const waited = q.holdDownSeconds + 0.01;
        const rising = sample(16.7, 16.4, { scale: 0.7, since: waited });
        expect(nextPixelScale(rising, CONFIG)).toBe(0.7);
    });

    test('it does not climb while it is still slow', () => {
        const stillSlow = sample(33, 16.7, { scale: 0.7 });
        expect(nextPixelScale(stillSlow, CONFIG)).toBeLessThan(0.7);
    });
});

describe('it settles instead of hunting', () => {
    test('a device that is exactly at its limit finds a level and stays there', () => {
        // THE FAILURE THIS GUARDS IS A LOOP, not a wrong answer: back off, look
        // fast, climb, look slow, back off. On screen that is the picture
        // visibly breathing, which is worse than either resolution on its own.
        //
        // Modelled as a device whose frame time scales with the pixel count, so
        // dropping the ratio genuinely helps and raising it genuinely hurts.
        const q = CONFIG.quality;
        const display = 16.7;
        const load = 26;                  // what it costs at full resolution
        let scale = 1;
        let since = 999;
        const history = [];

        for (let i = 0; i < 400; i++) {
            // Cost falls with the pixel count, which goes as the square.
            const frameMs = Math.max(display, load * scale * scale);
            const next = nextPixelScale(
                { frame: frameMs / 1000, best: display / 1000, scale, since, frames: q.settleFrames + 1 },
                CONFIG
            );
            since = Math.abs(next - scale) < 0.005 ? since + 1 : 0;
            scale = next;
            if (i > 200) history.push(scale);
        }

        // Whatever it settles on, the last half of the run must be quiet.
        const spread = Math.max(...history) - Math.min(...history);
        expect(spread).toBeLessThan(0.15);
        expect(scale).toBeGreaterThanOrEqual(q.minScale);
        expect(scale).toBeLessThanOrEqual(1);
    });
});
