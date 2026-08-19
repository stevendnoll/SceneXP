// © 2026 Continuum Commerce LLC. MIT licensed.
//
// Tests for www/ocean/js/water.js.
//
// THE POINT OF THESE IS THE PHYSICS, not the plumbing. A wave simulation fails
// in a way unit tests are unusually good at catching and eyes are unusually bad
// at: it looks broadly like water either way, and the difference between the
// beach directing the surf and the surf being placed by hand is invisible in a
// screenshot. So the assertions below are mostly statements about the sea.
// Waves must grow as they shallow, they must never stand taller than the depth
// allows, they must swing round to arrive parallel to the beach, foam must
// exist shoreward of where it was made and not seaward of it, and the phase
// must never run backwards. Every one of those is a thing that could quietly
// stop being true during a retune, and none of them would announce it.
//
// The THREE stub at the bottom is real enough to hold typed arrays, because the
// one plumbing bug worth guarding against is an attribute the shader reads
// under a name the geometry does not supply. That failure mode is silent: the
// attribute reads as zero, the sea goes flat, and nothing anywhere reports it.

import { jest } from '@jest/globals';

const CONFIG_URL = '../www/ocean/js/config.js';
const WATER_URL = '../www/ocean/js/water.js';

// water.js imports './config.min.js'. The minified build is real and current,
// but pointing the test at the source keeps a stale build from passing.
jest.unstable_mockModule('../www/ocean/js/config.min.js', async () => (
    await import(CONFIG_URL)
));

const { OCEAN_CONFIG } = await import(CONFIG_URL);

// ---------------------------------------------------------------------------
// A THREE stub with real arrays in it
// ---------------------------------------------------------------------------

class StubBufferAttribute {
    constructor(array, itemSize) {
        this.array = array;
        this.itemSize = itemSize;
        this.count = array.length / itemSize;
        this.usage = 'static';
        this.needsUpdate = false;
    }
    setUsage(usage) { this.usage = usage; return this; }
}

class StubBufferGeometry {
    constructor() { this.attributes = {}; this.index = null; this.disposed = false; }
    setAttribute(name, attribute) { this.attributes[name] = attribute; return this; }
    getAttribute(name) { return this.attributes[name]; }
    setIndex(attribute) { this.index = attribute; return this; }
    computeVertexNormals() { this.normalsComputed = true; }
    dispose() { this.disposed = true; }
}

class StubMaterial {
    constructor(params = {}) { Object.assign(this, params); this.disposed = false; }
    dispose() { this.disposed = true; }
}

class StubMesh {
    constructor(geometry, material) {
        this.geometry = geometry;
        this.material = material;
        this.parent = null;
        this.matrixAutoUpdate = true;
    }
    updateMatrix() { this.matrixUpdated = true; }
}

class StubVector4 {
    constructor() { this.x = 0; this.y = 0; this.z = 0; this.w = 0; }
}

function installThree() {
    globalThis.THREE = {
        BufferGeometry: StubBufferGeometry,
        BufferAttribute: StubBufferAttribute,
        MeshStandardMaterial: StubMaterial,
        Mesh: StubMesh,
        Vector4: StubVector4,
        Color: class { constructor(hex) { this.hex = hex; } },
        DynamicDrawUsage: 'dynamic',
        FrontSide: 'front'
    };
}

function makeScene() {
    return {
        children: [],
        add(object) { this.children.push(object); object.parent = this; },
        remove(object) {
            const i = this.children.indexOf(object);
            if (i >= 0) this.children.splice(i, 1);
            object.parent = null;
        }
    };
}

installThree();
const water = await import(WATER_URL);
const {
    bedHeightAt, tideOffset, depthAt, waveNumberAt, shoalingAt, sharpenAt, breakAmount,
    envelopeAt, rowPositions, halfWidthAt, waveConstants, buildProfile, breakRow,
    initWater, updateWater, consumeBreaks, breakDistance, disposeWater,
    setProfileHz, profileRate,
    getWaterMesh, getProfile, getElapsed, __test__
} = water;

const { beach, water: WATER, camera } = OCEAN_CONFIG;

afterEach(() => { disposeWater(); });

// ---------------------------------------------------------------------------

describe('the beach has a shape', () => {
    test('the bed drops away on the configured slope out to sea', () => {
        const near = bedHeightAt(beach.shoreZ - 10);
        const far = bedHeightAt(beach.shoreZ - 20);
        expect(near).toBeCloseTo(-10 * beach.slope, 6);
        expect(far).toBeCloseTo(-20 * beach.slope, 6);
    });

    test('it flattens out at maxDepth rather than running to the centre of the earth', () => {
        // farZ is 420 metres out, which on this slope would be 30 metres of
        // depth. The profile is supposed to stop at maxDepth.
        expect(bedHeightAt(beach.farZ)).toBeCloseTo(-beach.maxDepth, 6);
    });

    test('it keeps climbing shoreward of the water line, which is the dry beach', () => {
        expect(bedHeightAt(beach.shoreZ + 5)).toBeCloseTo(5 * beach.slope, 6);
    });
});

describe('the tide', () => {
    test('starts at mean level and stays inside its range', () => {
        expect(tideOffset(0)).toBeCloseTo(0, 6);
        for (let t = 0; t < WATER.tidePeriodSeconds * 2; t += 7) {
            expect(Math.abs(tideOffset(t))).toBeLessThanOrEqual(WATER.tideRange / 2 + 1e-9);
        }
    });

    test('reaches its high point a quarter of the way through the cycle', () => {
        // Half a period is the one sample that reads identically to the start,
        // since sin(pi) and sin(0) are both zero. A quarter is the peak.
        expect(tideOffset(WATER.tidePeriodSeconds / 4)).toBeCloseTo(WATER.tideRange / 2, 6);
    });

    test('moves the water line up the beach', () => {
        // Half way up the strip the tide can reach: dry at mean tide, wet at
        // high tide. Written as a fraction of the tide's reach rather than as a
        // distance in metres, because the distance depends on the slope and the
        // slope moves. Hard coding two metres passed on a 1:8 beach and failed
        // the day it became 1:4.5, when two metres of sand stood higher than
        // the tide could climb.
        const dry = beach.shoreZ + (WATER.tideRange / 2) / beach.slope / 2;
        expect(depthAt(dry, 0)).toBe(0);
        expect(depthAt(dry, WATER.tideRange / 2)).toBeGreaterThan(0);
    });
});

describe('depth', () => {
    test('is exactly zero above the water line, which is how a dry row is known', () => {
        expect(depthAt(beach.shoreZ + 10, 0)).toBe(0);
    });

    test('never returns a value between zero and minDepth', () => {
        for (let z = beach.shoreZ - 1; z < beach.shoreZ + 1; z += 0.01) {
            const d = depthAt(z, 0);
            expect(d === 0 || d >= WATER.minDepth).toBe(true);
        }
    });

    test('deepens monotonically out to sea', () => {
        let previous = 0;
        for (let z = beach.shoreZ; z > beach.farZ; z -= 5) {
            const d = depthAt(z, 0);
            expect(d).toBeGreaterThanOrEqual(previous - 1e-9);
            previous = d;
        }
        expect(previous).toBeCloseTo(beach.maxDepth, 6);
    });
});

describe('waves feel the bottom', () => {
    const k0 = (Math.PI * 2) / 62;   // the longest component

    test('deep water leaves the wave number alone', () => {
        // Deep water for this component is anything past half its wavelength.
        expect(waveNumberAt(k0, 200)).toBeCloseTo(k0, 6);
    });

    test('shallow water shortens the wavelength', () => {
        const shallow = waveNumberAt(k0, 1.0);
        expect(shallow).toBeGreaterThan(k0);
        // Shorter still as it gets shallower: this is the bunching up that
        // makes a set of waves visibly crowd together as they arrive.
        expect(waveNumberAt(k0, 0.4)).toBeGreaterThan(shallow);
    });

    test('shoaling is one in deep water and grows as the bottom comes up', () => {
        const c0 = Math.sqrt(9.81 / k0);
        expect(shoalingAt(waveNumberAt(k0, 300), 300, c0)).toBeCloseTo(1, 2);
        const mid = shoalingAt(waveNumberAt(k0, 2), 2, c0);
        const shallow = shoalingAt(waveNumberAt(k0, 0.8), 0.8, c0);
        expect(shallow).toBeGreaterThan(mid);
        expect(shallow).toBeGreaterThan(1.2);
    });

    test('shoaling dips slightly before it grows, which is real', () => {
        // A shoaling wave gets very slightly SHORTER before it stands up,
        // because the group speed briefly rises. If this ever reads as a bug and
        // gets "fixed", the sea loses a small piece of its honesty.
        const c0 = Math.sqrt(9.81 / k0);
        const samples = [];
        for (let d = 30; d > 0.5; d -= 0.5) samples.push(shoalingAt(waveNumberAt(k0, d), d, c0));
        expect(Math.min(...samples)).toBeLessThan(1);
        expect(samples[samples.length - 1]).toBeGreaterThan(1.2);
    });

    test('a wave in deep water is very nearly a sine, and one in the shallows is not', () => {
        // The crest sharpening is second order Stokes, and second order theory
        // is a correction: out where the bottom is irrelevant the correction has
        // to be small or the sea is being drawn wrong far from shore, where
        // nothing is happening and any shape at all reads as an artefact.
        const amp = 0.19;
        expect(sharpenAt(amp, waveNumberAt(k0, 200), 200, 0.25)).toBeLessThan(0.02);
        // And it has to matter where waves break, or it buys nothing.
        expect(sharpenAt(amp, waveNumberAt(k0, 1.3), 1.3, 0.25)).toBeGreaterThan(0.1);
    });

    test('THE CREST SHARPENING NEVER SPLITS THE TROUGH IN TWO', () => {
        // A fundamental plus a second harmonic has one trough per wave only
        // while the harmonic stays under a quarter of the fundamental. Past
        // that, the derivative picks up a second pair of zeros and the trough
        // grows a bump in the middle of it, which does not read as water. The
        // Stokes ratio itself diverges as the depth goes to nothing, so this
        // clamp is doing real work rather than guarding an edge case: without
        // it the last few metres of the sheet would be corrugated.
        for (let d = 8; d > 0.02; d -= 0.02) {
            for (const amp of [0.05, 0.19, 0.5, 2.0]) {
                expect(sharpenAt(amp, waveNumberAt(k0, d), d, 0.25)).toBeLessThanOrEqual(0.25);
            }
        }
        // Nothing to sharpen is nothing to sharpen, in every degenerate form.
        expect(sharpenAt(0, 0.1, 2, 0.25)).toBe(0);
        expect(sharpenAt(0.2, 0, 2, 0.25)).toBe(0);
        expect(sharpenAt(0.2, 0.1, 0, 0.25)).toBe(0);
    });

    test('a taller wave has a sharper crest than a short one in the same water', () => {
        // Stokes second order goes as amplitude squared, so the correction is a
        // larger FRACTION of a bigger wave. It is why a set wave looks more
        // pointed than the one before it and not merely larger.
        const k = waveNumberAt(k0, 2.5);
        const small = sharpenAt(0.08, k, 2.5, 0.25);
        const large = sharpenAt(0.20, k, 2.5, 0.25);
        expect(large).toBeGreaterThan(small);
    });
});

describe('waves break where the depth says they do', () => {
    test('nothing breaks in water far deeper than the wave is tall', () => {
        expect(breakAmount(0.5, 6)).toBe(0);
    });

    test('everything breaks in water far shallower', () => {
        expect(breakAmount(2.0, 0.4)).toBe(1);
    });

    test('the ramp is centred on the McCowan ratio', () => {
        const depth = 2;
        const atRatio = breakAmount(WATER.breakRatio * depth, depth);
        expect(atRatio).toBeCloseTo(0.5, 2);
    });

    test('it is monotone, so a wave never un-breaks as it gets taller', () => {
        let previous = -1;
        for (let h = 0; h < 4; h += 0.05) {
            const b = breakAmount(h, 2);
            expect(b).toBeGreaterThanOrEqual(previous);
            previous = b;
        }
    });
});

describe('the set envelope', () => {
    test('averages out to one over a long run', () => {
        let sum = 0;
        let n = 0;
        for (let t = 0; t < 4000; t += 0.5) { sum += envelopeAt(t, 0); n++; }
        expect(sum / n).toBeCloseTo(1, 1);
    });

    test('stays inside the configured depth', () => {
        for (let t = 0; t < 2000; t += 0.7) {
            const e = envelopeAt(t, 1);
            expect(e).toBeGreaterThanOrEqual(1 - WATER.setDepth - 1e-9);
            expect(e).toBeLessThanOrEqual(1 + WATER.setDepth + 1e-9);
        }
    });

    test('the components do not peak together', () => {
        // If every component swelled at the same moment the sea would breathe
        // as one object rather than producing sets.
        const a = [];
        const b = [];
        for (let t = 0; t < 600; t += 1) { a.push(envelopeAt(t, 0)); b.push(envelopeAt(t, 2)); }
        const peakA = a.indexOf(Math.max(...a));
        const peakB = b.indexOf(Math.max(...b));
        expect(Math.abs(peakA - peakB)).toBeGreaterThan(3);
    });
});

describe('the mesh is laid out for a camera that never moves', () => {
    test('rows run from the near edge out to the horizon, in order', () => {
        const zs = rowPositions(64);
        expect(zs[0]).toBeCloseTo(beach.nearZ, 6);
        expect(zs[zs.length - 1]).toBeCloseTo(beach.farZ, 6);
        for (let i = 1; i < zs.length; i++) expect(zs[i]).toBeLessThan(zs[i - 1]);
    });

    test('rows are packed toward the camera rather than spread evenly', () => {
        const zs = rowPositions(101);
        const middle = zs[50];
        const even = beach.nearZ + (beach.farZ - beach.nearZ) * 0.5;
        // The halfway row sits much nearer than halfway out, which is the whole
        // point of the bias: the near water is what fills the screen.
        expect(middle).toBeGreaterThan(even);
    });

    test('ALMOST EVERY ROW IS IN FRONT OF THE CAMERA', () => {
        // The bug this replaces: the row curve was anchored at the sheet's own
        // near edge, which is behind the eye, so it packed its rows behind the
        // eye too. A fifth of the grid was spent on water nobody could ever be
        // shown, and the near field was left too coarse to hold a wave shape.
        // Nothing about the picture said "the rows are in the wrong place", it
        // only said "soft", which is why this is arithmetic and not a screenshot.
        const zs = rowPositions(OCEAN_CONFIG.water.rows);
        const behind = Array.from(zs).filter((z) => z >= camera.z).length;
        expect(behind).toBeLessThanOrEqual(beach.nearRows);
        expect(behind / zs.length).toBeLessThan(0.05);
    });

    test('rows are spaced by how much screen they cover, not by metres', () => {
        // Screen height per metre falls off as one over distance, so rows
        // spaced for the eye should be roughly even in one over distance. The
        // real assertion is the one that matters in practice: no row in the
        // visible sea is more than a few times the screen height of its
        // neighbours, because that ratio IS the softness.
        const zs = rowPositions(OCEAN_CONFIG.water.rows);
        const screenY = (z) => 1 / (camera.z - z);   // proportional to pixels
        // DERIVED FROM THE LENS, not written down. The bottom edge of the
        // picture meets still water at the camera height over the tangent of
        // half the vertical field of view, and everything nearer than that is
        // off the bottom of the screen. An earlier version hard coded two
        // metres, which was right for a 62 degree lens and wrong the moment the
        // lens changed, and it then failed on the seam between the near strip
        // and the row curve, which is a part of the sheet nobody can see.
        const frameBottom = camera.height / Math.tan((camera.fov * Math.PI) / 360);
        let worst = 0;
        for (let i = 1; i < zs.length; i++) {
            const near = camera.z - zs[i];
            if (near < frameBottom || near > 380) continue;
            worst = Math.max(worst, Math.abs(screenY(zs[i]) - screenY(zs[i - 1])));
        }
        // One over metres. Half the camera height is about a tenth of the frame.
        expect(worst).toBeLessThan(0.05);
    });

    test('the sheet is the camera frustum, so columns are even in pixels', () => {
        // Half width has to grow linearly with DISTANCE. Any column then sits on
        // a fixed radial line from the eye, which is the only arrangement where
        // a near column and a far column are the same width on screen.
        const wide = halfWidthAt(camera.z - 100);
        const close = halfWidthAt(camera.z - 10);
        expect(wide - close).toBeCloseTo(90 * beach.widthPerMetre, 6);
        // Never zero, or the rows level with the eye collapse to a line.
        expect(halfWidthAt(camera.z + 5)).toBeCloseTo(beach.baseHalfWidth, 6);

        // And it has to actually cover the frame, on the widest screen anyone
        // is plausibly using. 21:9 is as wide as monitors get; the field of view
        // is set vertically, so the wider the screen the more sheet it needs.
        const halfFov = Math.tan((camera.fov * Math.PI) / 360) * 2.4;
        for (const distance of [5, 20, 80, 300]) {
            expect(halfWidthAt(camera.z - distance)).toBeGreaterThan(distance * halfFov);
        }
    });
});

describe('wave constants', () => {
    test('every component gets a wave number, a speed, and a Snell invariant', () => {
        const constants = waveConstants(WATER.waves);
        expect(constants).toHaveLength(WATER.waves.length);
        constants.forEach((c, i) => {
            expect(c.k0).toBeCloseTo((Math.PI * 2) / WATER.waves[i].length, 9);
            expect(c.c0).toBeGreaterThan(0);
            expect(c.omega).toBeGreaterThan(0);
            expect(c.kSin).toBeCloseTo(c.k0 * WATER.waves[i].dirX, 9);
        });
    });

    test('longer waves travel faster, which is why they arrive first', () => {
        const constants = waveConstants(WATER.waves);
        for (let i = 1; i < constants.length; i++) {
            expect(constants[i].c0).toBeLessThan(constants[i - 1].c0);
        }
    });

    test('a wave aimed almost along the beach is clamped rather than allowed to break the maths', () => {
        const [c] = waveConstants([{ length: 40, amplitude: 1, steepness: 0.5, speed: 1, dirX: 4 }]);
        expect(Math.abs(c.kSin / c.k0)).toBeLessThanOrEqual(0.95);
    });
});

describe('the profile is the sea in one array', () => {
    const rows = 120;
    const zs = rowPositions(rows);
    const n = WATER.waves.length;

    test('every array is the size it claims to be', () => {
        const p = buildProfile(zs, 0);
        expect(p.depth).toHaveLength(rows);
        expect(p.breaking).toHaveLength(rows);
        expect(p.foamBed).toHaveLength(rows);
        expect(p.edge).toHaveLength(rows);
        expect(p.phase).toHaveLength(rows * n);
        expect(p.amp).toHaveLength(rows * n);
        expect(p.k).toHaveLength(rows * n);
    });

    test('THE SEA NEVER STANDS TALLER THAN THE DEPTH ALLOWS', () => {
        // The single most important assertion in the file. If this fails the
        // surf is no longer being placed by the beach, and something is drawing
        // two metre waves in half a metre of water.
        //
        // THE SUM, NOT EACH COMPONENT. The version of this test that shipped
        // first checked the four components one at a time, which is the same
        // mistake the code was making, so it agreed with the bug and passed for
        // as long as the bug lasted. There is one water surface and McCowan is
        // a statement about it: four waves each allowed 0.78 of the depth sum
        // to three times the depth. A test that restates the implementation
        // cannot catch the implementation being wrong, and the only defence is
        // to assert the physical property instead.
        for (let t = 0; t < 400; t += 13) {
            const p = buildProfile(zs, t);
            for (let r = 0; r < rows; r++) {
                if (p.depth[r] <= 0) continue;
                let total = 0;
                for (let i = 0; i < n; i++) total += p.amp[r * n + i];
                expect(total * 2).toBeLessThanOrEqual(WATER.breakRatio * p.depth[r] + 1e-6);
            }
        }
    });

    test('A WAVE IS NOT A SINE, AND IN THE SHALLOWS IT IS NOT CLOSE', () => {
        // The fault behind "the crests do not look quite right". Four sines
        // added together are still a sine in the only way that matters here:
        // the crest is exactly as round as the trough is, and the still water
        // line sits exactly halfway up. Real water does not do that. A shoaling
        // wave draws its crest up into a peak and spreads its trough out flat
        // beneath it, and the still water line ends up nearer two thirds of the
        // way down. That asymmetry IS the shape the eye reads as a wave, and
        // without it a metre of swell reads as a lit floor no matter how tall it
        // is made.
        //
        // Asserted on where the water sits rather than on the harmonic, because
        // the harmonic is the implementation and this is the property.
        const p = buildProfile(zs, 11);
        let deepest = null;
        let surf = null;
        for (let r = 0; r < rows; r++) {
            if (p.depth[r] <= 0.4) continue;
            let crest = 0;
            let trough = 0;
            for (let i = 0; i < n; i++) {
                crest += p.amp[r * n + i] + p.sharp[r * n + i];
                trough += p.amp[r * n + i] - p.sharp[r * n + i];
            }
            if (crest + trough <= 1e-9) continue;
            const above = crest / (crest + trough);
            if (p.breaking[r] > 0.5 && !surf) surf = above;
            deepest = above;
        }
        // Out where the bottom is irrelevant, water really is nearly a sine and
        // the crest really does sit halfway. Anything else out there is a bug.
        expect(deepest).toBeGreaterThan(0.5);
        expect(deepest).toBeLessThan(0.53);
        // In the surf it has to have moved, and moved a long way. A sine gives
        // exactly 0.5 here, which is what this scene was drawing.
        expect(surf).toBeGreaterThan(0.56);
        // But not past what one trough per wave allows: a quarter of harmonic
        // on a full fundamental puts the line at 0.625 and no further.
        expect(surf).toBeLessThanOrEqual(0.625);
    });

    test('THE SHARPENING DOES NOT SMUGGLE HEIGHT PAST THE DEPTH LIMIT', () => {
        // The second harmonic lifts the crest, which is the point, and it lifts
        // the trough by exactly as much, which is the part that keeps the test
        // above it honest. Trough to crest is untouched, so McCowan's ratio
        // still governs and the cap did not need revisiting. If a future change
        // sharpens the crest WITHOUT filling the trough, the sea quietly grows
        // and this is the tripwire.
        for (let t = 0; t < 300; t += 17) {
            const p = buildProfile(zs, t);
            for (let r = 0; r < rows; r++) {
                if (p.depth[r] <= 0) continue;
                let above = 0;
                let below = 0;
                for (let i = 0; i < n; i++) {
                    above += p.amp[r * n + i] + p.sharp[r * n + i];
                    below += p.amp[r * n + i] - p.sharp[r * n + i];
                }
                // The trough is still a trough. A harmonic bigger than the wave
                // it rides on would push it above the still water line, and the
                // sea would be all crest and no hollow.
                expect(below).toBeGreaterThanOrEqual(0);
                expect(above + below).toBeLessThanOrEqual(WATER.breakRatio * p.depth[r] + 1e-6);
            }
        }
    });

    test('THE FOAM PULSE AND THE WAVE UNDER IT ARE THE SAME WAVE', () => {
        // What broke when the height was split between a swell and a chop, and
        // the reason it is worth a test rather than a comment: the failure was
        // silent. The pulse rode component zero, the visible crests were
        // component one, and the white simply sat on a different rhythm from the
        // water. Nothing in the suite noticed and nothing could, because every
        // part was individually correct.
        //
        // Stated as the property: the phasor the shader builds has to point at
        // the crest. Rotate it to zero lag and its projection should peak when
        // the sea is actually highest, not a third of a wave later.
        const consts = waveConstants(WATER.waves);
        const p = buildProfile(zs, 23);
        let row = -1;
        for (let r = 0; r < rows; r++) {
            if (p.depth[r] > 0 && p.breaking[r] > 0.5) { row = r; break; }
        }
        expect(row).toBeGreaterThan(0);

        // Walk one full period of the longest component and record both.
        const period = (Math.PI * 2) / consts[0].omega;
        let bestSurface = { y: -Infinity };
        let bestPulse = { x: -Infinity };
        for (let s = 0; s < 720; s++) {
            const t = 23 + (s / 720) * period;
            let y = 0;
            let py = 0;
            let ampFund = 0;
            for (let i = 0; i < n; i++) {
                const amp = p.amp[row * n + i];
                if (amp <= 0) continue;
                const phase = p.phase[row * n + i] - consts[i].omega * t;
                y += amp * Math.sin(phase) - p.sharp[row * n + i] * Math.cos(2 * phase);
                // Only the y component of the phasor is needed. Reading it back
                // is the projection at a quarter wave of lag, which is the pulse
                // that peaks on the crest.
                py += amp * Math.sin(phase);
                ampFund += amp;
            }
            if (y > bestSurface.y) bestSurface = { y, s };
            const projection = py / ampFund;   // the pulse at the lag that peaks on the crest
            if (projection > bestPulse.x) bestPulse = { x: projection, s };
        }
        // Within a twentieth of a wave of each other. They are not identical
        // signals, because the second harmonic shapes the surface and not the
        // phasor, so this is a tolerance rather than an equality.
        const apart = Math.abs(bestSurface.s - bestPulse.s);
        const wrapped = Math.min(apart, 720 - apart);
        expect(wrapped).toBeLessThan(36);
    });

    test('THE TROUGH NEVER GOES UNDER THE SEABED', () => {
        // What the reader actually sees when the cap above is wrong, and the
        // reason it is worth a second test rather than being left implied. With
        // every component at its trough at once the water surface sank below
        // the sand, and the beach came up through the sea as a hard edged slab
        // hanging in mid air. It is in specs/ocean-4.png.
        //
        // A wave capped at 0.78 of the depth has its trough at 0.39 of the
        // depth, so a correct cap leaves well over half the depth in hand and
        // this can never be close. The tolerance is for the last centimetre at
        // the very water's edge, where `minDepth` holds the depth off zero on
        // purpose and the sheet is nearly transparent anyway.
        for (let t = 0; t < 560; t += 37) {
            const p = buildProfile(zs, t);
            const tide = tideOffset(t);
            for (let r = 0; r < rows; r++) {
                if (p.depth[r] <= 0) continue;
                let trough = 0;
                for (let i = 0; i < n; i++) trough -= p.amp[r * n + i];
                const clearance = (trough + tide) - bedHeightAt(zs[r]);
                expect(clearance).toBeGreaterThan(-0.02);
            }
        }
    });

    test('WAVES STAND UP ON THEIR WAY IN', () => {
        // The visible payoff of the whole shoaling calculation. If the peak
        // ever sinks back to the offshore height, waves are arriving the size
        // they left at and the sea has lost the thing it is watched for.
        const p = buildProfile(zs, 0);
        const offshore = p.amp[(rows - 5) * n];
        let peak = 0;
        let peakRow = -1;
        for (let r = 0; r < rows; r++) {
            if (p.amp[r * n] > peak) { peak = p.amp[r * n]; peakRow = r; }
        }
        expect(peak).toBeGreaterThan(offshore * 1.1);
        // And it peaks in the shallows on its way to breaking, not out at sea.
        expect(p.depth[peakRow]).toBeLessThan(3);
        expect(p.depth[peakRow]).toBeGreaterThan(0.5);
    });

    test('THE WHOLE SEA STANDS UP, NOT JUST THE LONGEST WAVE IN IT', () => {
        // The test above passed for a full round while the sea was flat, and it
        // is worth being precise about how. It reads `p.amp[r * n]`, which is
        // component ZERO. The long swell always shoaled beautifully. What the
        // eye sees is the SUM, and the sum was doing nothing at all, because
        // Green's law dips BELOW one in intermediate depth: a wave shrinks a
        // little before it grows. Component by component, from 8 metres of
        // water to the break, the 58 metre swell went x0.90 to x1.08 while the
        // 17.5 metre chop went x0.99 to x0.91. With most of the height on the
        // chop they cancelled, the total came out at x1.02, and the sea arrived
        // exactly the size it left at.
        //
        // Nothing failed. Every component was individually correct and the one
        // test aimed at this was individually correct too. It just was not
        // looking at the sea.
        const p = buildProfile(zs, 0);
        const total = (r) => {
            let sum = 0;
            for (let i = 0; i < n; i++) sum += p.amp[r * n + i];
            return sum;
        };
        // Deep enough to be the "before", shallow enough to still be offshore
        // of anything that is breaking. Found from the depth rather than from a
        // row index, so it survives the grid being resized.
        let deep = -1;
        let atBreak = -1;
        for (let r = rows - 1; r >= 0; r--) {
            if (deep < 0 && p.depth[r] > 0 && p.depth[r] < 8) deep = r;
            if (p.breaking[r] >= WATER.foamBreakThreshold) { atBreak = r; break; }
        }
        expect(deep).toBeGreaterThan(0);
        expect(atBreak).toBeGreaterThan(0);
        // A tenth is not much, and it is deliberately not much: this is a floor
        // under "the sea is visibly doing something on the way in", not a
        // restatement of whatever shoalGain happens to be today.
        expect(total(atBreak)).toBeGreaterThan(total(deep) * 1.1);
    });


    test('the phase never runs backwards, so crests cannot tear', () => {
        const p = buildProfile(zs, 0);
        for (let i = 0; i < n; i++) {
            for (let r = rows - 2; r >= 0; r--) {
                // Row indices count down toward the camera, which is the
                // direction of travel, so phase must accumulate as r falls.
                expect(p.phase[r * n + i]).toBeGreaterThanOrEqual(p.phase[(r + 1) * n + i] - 1e-9);
            }
        }
    });

    test('waves swing round to arrive parallel to the beach', () => {
        // Snell: k sin(theta) is conserved, and k grows shoreward, so sin(theta)
        // must shrink. This is what stops an angled swell breaking crooked.
        const p = buildProfile(zs, 0);
        const constants = waveConstants(WATER.waves);
        const angleAt = (row, i) => Math.abs(constants[i].kSin / p.k[row * n + i]);
        const surfRow = breakRow(p);
        for (let i = 0; i < n; i++) {
            if (WATER.waves[i].dirX === 0) continue;
            expect(angleAt(surfRow, i)).toBeLessThan(angleAt(rows - 5, i));
        }
    });

    test('breaking rises toward the shore and is nothing out in deep water', () => {
        const p = buildProfile(zs, 0);
        expect(p.breaking[rows - 3]).toBeCloseTo(0, 3);
        expect(Math.max(...p.breaking)).toBeGreaterThan(0.8);
    });

    test('FOAM EXISTS SHOREWARD OF THE BREAK AND NOT SEAWARD OF IT', () => {
        // PROBED BY DISTANCE, NOT BY ROW INDEX, and the first version of this
        // was probed by index: twelve rows either side of the break. That is a
        // different distance on every grid, and a trial move of `camera.z` from
        // 8 to 11.6 showed it, because the row curve is anchored to the eye.
        // Twelve rows shoreward landed on DRY SAND above the waterline, where
        // there is correctly no foam, so the test failed while reporting nothing
        // about foam at all. Half way from the break to the water's edge is a
        // place, and it stays one wherever the camera goes.
        const p = buildProfile(zs, 0);
        const breakZ = zs[breakRow(p)];
        const half = (beach.shoreZ - breakZ) / 2;
        const rowNearest = (target) => {
            let best = 0;
            for (let r = 1; r < rows; r++) {
                if (Math.abs(zs[r] - target) < Math.abs(zs[best] - target)) best = r;
            }
            return best;
        };
        // The same distance out past the break: swell, not whitewater yet.
        expect(p.foamBed[rowNearest(breakZ - half)]).toBeLessThan(0.2);
        // And half way in to the beach: the last wave left it covered.
        expect(p.foamBed[rowNearest(breakZ + half)]).toBeGreaterThan(0.3);
    });

    test('foam decays rather than covering the whole beach forever', () => {
        // Measured at the WATER'S EDGE, which is the shallowest row that still
        // has water in it. The old version compared against row zero, and row
        // zero is the sheet's near edge up on dry sand, so it read a hard zero
        // and passed against anything at all.
        const p = buildProfile(zs, 0);
        let edge = 0;
        while (edge < rows && p.depth[edge] <= 0) edge++;
        const peak = Math.max(...p.foamBed);
        expect(peak).toBeGreaterThan(0.5);
        // Whitewater is thickest where it is made and thins on the way in. Half
        // is a generous margin on a run that measures about a third.
        expect(p.foamBed[edge]).toBeLessThan(peak * 0.5);
    });

    test('rows above the water line carry no wave at all', () => {
        // Push the tide down so the near rows are dry sand.
        const p = buildProfile(zs, WATER.tidePeriodSeconds * 0.75);
        let dryRows = 0;
        for (let r = 0; r < rows; r++) {
            if (p.depth[r] > 0) continue;
            dryRows++;
            expect(p.edge[r]).toBe(0);
            expect(p.foamBed[r]).toBe(0);
            for (let i = 0; i < n; i++) expect(p.amp[r * n + i]).toBe(0);
        }
        expect(dryRows).toBeGreaterThan(0);
    });

    test('the edge fades in rather than starting on a hard line', () => {
        const p = buildProfile(zs, 0);
        for (let r = 0; r < rows; r++) {
            expect(p.edge[r]).toBeGreaterThanOrEqual(0);
            expect(p.edge[r]).toBeLessThanOrEqual(1);
        }
        expect(p.edge[rows - 1]).toBeCloseTo(1, 6);
    });

    test('rebuilding into an existing profile allocates nothing new', () => {
        const p = buildProfile(zs, 0);
        const same = buildProfile(zs, 30, OCEAN_CONFIG, p);
        expect(same).toBe(p);
        expect(same.depth).toBe(p.depth);
    });

    test('the set envelope actually moves the break line', () => {
        // If it does not, the surf is a fixed line and the scene is wallpaper.
        const distances = new Set();
        for (let t = 0; t < 200; t += 5) {
            const p = buildProfile(zs, t);
            distances.add(breakRow(p));
        }
        expect(distances.size).toBeGreaterThan(1);
    });

    test('breakRow reports nothing when nothing is breaking', () => {
        const flat = buildProfile(zs, 0);
        flat.breaking.fill(0);
        expect(breakRow(flat)).toBe(-1);
    });
});

// ---------------------------------------------------------------------------

describe('the mesh', () => {
    test('is built, named, and added to the scene', () => {
        const scene = makeScene();
        const mesh = initWater(scene, OCEAN_CONFIG);
        expect(mesh).toBe(getWaterMesh());
        expect(mesh.name).toBe('ocean');
        expect(scene.children).toContain(mesh);
        // Every vertex moves every frame, so a bounding volume from the rest
        // pose would cull the sea out of its own frame.
        expect(mesh.frustumCulled).toBe(false);
    });

    test('has one vertex per grid point and two triangles per cell', () => {
        initWater(makeScene(), OCEAN_CONFIG);
        const geometry = getWaterMesh().geometry;
        const { rows, cols } = __test__.state().grid;
        expect(geometry.getAttribute('position').count).toBe(rows * cols);
        expect(geometry.index.array).toHaveLength((rows - 1) * (cols - 1) * 6);
    });

    test('EVERY TRIANGLE FACES THE SKY', () => {
        // The bug this replaces: the grid was wound so the cross product
        // pointed at the seabed. Every face was culled from above, the beach
        // disappeared entirely, and the only water left on screen was the
        // underside of distant crests standing higher than the camera. It
        // rendered, it had specular highlights on it, and it was completely
        // wrong. Nothing but arithmetic catches that before a screenshot does.
        initWater(makeScene(), OCEAN_CONFIG);
        const geometry = getWaterMesh().geometry;
        const position = geometry.getAttribute('position').array;
        const index = geometry.index.array;
        const at = (i) => [position[i * 3], position[i * 3 + 1], position[i * 3 + 2]];
        const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

        // Sample across the sheet rather than trusting the first triangle: the
        // grid is a trapezoid, so the columns are not parallel and a winding
        // that happens to work at the near edge could fail at the far one.
        const triangles = index.length / 3;
        for (const t of [0, 1, Math.floor(triangles / 2), triangles - 1]) {
            const p0 = at(index[t * 3]);
            const p1 = at(index[t * 3 + 1]);
            const p2 = at(index[t * 3 + 2]);
            const a = sub(p1, p0);
            const b = sub(p2, p0);
            const upward = a[2] * b[0] - a[0] * b[2];   // the y of a cross b
            expect(upward).toBeGreaterThan(0);
        }
    });

    test('EVERY ATTRIBUTE THE SHADER READS IS ONE THE GEOMETRY SUPPLIES', () => {
        // The silent failure this file exists to prevent: a renamed attribute
        // reads as zero in GLSL, the sea goes flat, and nothing reports it.
        initWater(makeScene(), OCEAN_CONFIG);
        const geometry = getWaterMesh().geometry;
        const declared = [...__test__.VERTEX_HEAD.matchAll(/attribute\s+\w+\s+(\w+);/g)].map((m) => m[1]);
        expect(declared.length).toBeGreaterThan(0);
        for (const name of declared) expect(geometry.getAttribute(name)).toBeDefined();
    });

    test('WHATEVER MOVES THE SURFACE UP AND DOWN ALSO MOVES THE NORMAL', () => {
        // Water is almost entirely specular, so its shape reaches the eye
        // through the normal and hardly at all through the geometry. Add a term
        // to the height and forget the derivative and the sea is displaced
        // correctly and lit as though it were a flat plane, which is a very
        // convincing way to produce exactly the mirror this scene started as.
        // Nothing between this file and a browser type checks the shader, so
        // the invariant is asserted on the source: every quantity that appears
        // in the vertical displacement has to appear in its derivative.
        const body = __test__.VERTEX_BODY;
        const height = body.match(/waveOffset\.y\s*\+=([^;]+);/);
        const slope = body.match(/float\s+dY\s*=([^;]+);/);
        expect(height).not.toBeNull();
        expect(slope).not.toBeNull();
        //
        // The trig factors are exempt, and they are the only exemption: a
        // derivative is allowed to turn a sine into a cosine, and that is the
        // one thing it is supposed to do. What it is not allowed to do is drop
        // an amplitude. They are found rather than listed, so a fifth term
        // added later is covered without anybody remembering to come back here.
        const trig = new Set([...body.matchAll(/float\s+(\w+)\s*=\s*(?:sin|cos)\s*\(/g)]
            .map((m) => m[1]));
        const terms = new Set([...height[1].matchAll(/\b([a-z]\w*)\b/gi)]
            .map((m) => m[1])
            .filter((word) => !trig.has(word)));
        expect(terms.size).toBeGreaterThan(1);
        for (const term of terms) expect(slope[1]).toContain(term);
        // And the derivative has to be the one both directions actually use.
        expect(body).toMatch(/dYdx\s*\+=\s*dY\s*\*\s*kx;/);
        expect(body).toMatch(/dYdz\s*\+=\s*dY\s*\*\s*kz;/);
    });

    test('EVERY UNIFORM THE SHADER READS IS ONE THE MATERIAL SUPPLIES', () => {
        initWater(makeScene(), OCEAN_CONFIG);
        const { uniforms } = __test__.state();
        const sources = [__test__.VERTEX_HEAD, __test__.FRAGMENT_HEAD].join('\n');
        const declared = [...sources.matchAll(/uniform\s+\w+\s+(\w+);/g)].map((m) => m[1]);
        for (const name of declared) expect(uniforms[name]).toBeDefined();
    });

    test('NO LOCAL IS NAMED AFTER A GLSL RESERVED WORD', () => {
        // The shader is a string in a JavaScript file, so nothing between here
        // and a browser ever compiles it. Naming a local `active` cost a round
        // trip: it is an ordinary English word, it is not reserved in GLSL ES
        // 1.00, and it IS reserved in 3.00, which is what Three asks for on a
        // WebGL2 context. The compiler says "illegal use of reserved word" and
        // points at the line, which is the one thing about it that was never in
        // doubt. This list is the 3.00 reserved set that is plausible as a
        // variable name; the exotic ones are left out on purpose.
        const RESERVED = [
            'active', 'asm', 'cast', 'centroid', 'class', 'common', 'default', 'double',
            'enum', 'extern', 'external', 'filter', 'fixed', 'flat', 'goto', 'half',
            'inline', 'input', 'interface', 'long', 'namespace', 'noinline', 'output',
            'packed', 'partition', 'patch', 'public', 'resource', 'row_major', 'sample',
            'short', 'sizeof', 'static', 'subroutine', 'superp', 'switch', 'template',
            'this', 'typedef', 'union', 'unsigned', 'using', 'volatile'
        ];
        const source = [
            __test__.VERTEX_HEAD, __test__.VERTEX_BODY, __test__.VERTEX_POSITION,
            __test__.FRAGMENT_HEAD, __test__.FRAGMENT_BODY, __test__.FRAGMENT_ROUGHNESS
        ].join('\n').replace(/\/\/.*$/gm, '');   // comments may say the words

        const declared = [...source.matchAll(/\b(?:float|int|bool|vec[234]|mat[234]|ivec[234]|bvec[234])\s+(\w+)/g)]
            .map((m) => m[1]);
        expect(declared.length).toBeGreaterThan(15);
        for (const name of declared) expect(RESERVED).not.toContain(name);
    });

    test('EVERY VARYING THE FRAGMENT READS IS ONE THE VERTEX SHADER WROTE', () => {
        // A varying declared on one side and not the other is a link error, so
        // the page renders nothing at all and the console says so in GLSL. This
        // is cheaper to meet here. It is a live risk because the two halves are
        // in different string constants a hundred lines apart, and adding a
        // signal to the foam means touching four of them.
        const vertex = [__test__.VERTEX_HEAD, __test__.VERTEX_BODY, __test__.VERTEX_POSITION].join('\n');
        const fragment = [__test__.FRAGMENT_HEAD, __test__.FRAGMENT_BODY, __test__.FRAGMENT_ROUGHNESS].join('\n');
        const declaredIn = (src) => [...src.matchAll(/varying\s+\w+\s+(\w+);/g)].map((m) => m[1]);
        const vertexVaryings = declaredIn(vertex);
        expect(declaredIn(fragment).sort()).toEqual(vertexVaryings.sort());
        // Declared is not the same as assigned. Every one has to be given a
        // value on the vertex side or it reaches the fragment as whatever was
        // in the register, which on some drivers is convincingly plausible.
        for (const name of vertexVaryings) {
            expect(vertex).toMatch(new RegExp(`${name}\\s*=`));
        }
    });

    test('THE MIRROR IS OFF WHERE THERE IS NO WATER TO MIRROR IN', () => {
        // WHAT SHIPPED AND WAS CAUGHT BY MOVING THE CAMERA. The sheet runs on
        // shoreward past the water's edge so the waterline always has geometry
        // under it, and those rows are hidden by an alpha of zero carried in the
        // vertex colour. The reflection block runs after that and used to end
        // with an unconditional `gl_FragColor.a = mix(a, 1.0, waterFresnel)`,
        // which lifted a hidden row straight back into view as a pane of sky
        // over the dry beach. Nothing in frame at camera.z 8 is dry, so it was
        // invisible rather than absent.
        //
        // A PORT, NOT A RESTATEMENT. The four lines below are the shader's own
        // arithmetic evaluated in JS, so the assertion is about the number the
        // beach ends up with rather than about the text of the source.
        const reflect = (cosTheta, foam, coverage, alphaIn) => {
            let f = 0.020 + 0.980 * Math.pow(1 - cosTheta, 5);
            f *= 1 - foam;
            f *= coverage;                       // the line under test
            return { fresnel: f, alpha: alphaIn + (1 - alphaIn) * f };
        };
        // A dry row at the water's edge, seen at the angle the eye actually
        // meets it: 1.15 m up, 5.6 m out, so about 11.6 degrees off the surface.
        const grazing = Math.sin((11.6 * Math.PI) / 180);
        expect(reflect(grazing, 0, 0, 0).alpha).toBe(0);
        // And the size of what it was. Without the coverage term the same dry
        // row came out a third of the way to opaque, which is why this is worth
        // a test rather than a comment.
        expect(reflect(grazing, 0, 1, 0).alpha).toBeGreaterThan(0.3);
        // Wet water still reflects, and still more of it the flatter you look.
        const steep = Math.sin((45 * Math.PI) / 180);
        expect(reflect(grazing, 0, 1, 0.5).alpha)
            .toBeGreaterThan(reflect(steep, 0, 1, 0.5).alpha);
        // Foam is air and scatters, so it takes the mirror down with it.
        expect(reflect(grazing, 1, 1, 0).fresnel).toBe(0);

        // The coverage term has to come BEFORE both readers of `waterFresnel`,
        // or it scales nothing that matters.
        const src = __test__.FRAGMENT_REFLECT.replace(/\/\/.*$/gm, '');
        const scaled = src.indexOf('vColor.a');
        expect(scaled).toBeGreaterThan(-1);
        expect(scaled).toBeLessThan(src.indexOf('gl_FragColor.rgb'));
        expect(scaled).toBeLessThan(src.indexOf('gl_FragColor.a'));
        // Guarded, because Three only declares vColor once the four wide colour
        // attribute exists, and `applyEdgeFade` builds that on the first update
        // rather than at build time.
        expect(src).toMatch(/#ifdef\s+USE_COLOR_ALPHA[\s\S]*vColor\.a[\s\S]*#endif/);
    });

    test('THE SEA BETWEEN WAVES HAS TO BE WATER, NOT MILK', () => {
        // What four screenshots caught and no test did. The near field never
        // went clean: measured across it over three minutes, mean foam swung
        // between 0.11 and 0.51, so the whole inner sea was permanently
        // somewhere between milk and cream and nothing ever read as arriving.
        //
        // The chain is worth stating because no single link looks wrong. The
        // foam bed used to be `max(breaking, carried * decay)`, and `breaking`
        // is 1 at every row inside the break line, so the decay was topped
        // straight back up at the next row and never happened. That pinned the
        // bed at exactly 1 across the whole surf zone. The ONLY thing between
        // that constant and a painted white carpet was the sheet pulse it gets
        // multiplied by. So the duty cycle of that pulse is not a matter of
        // taste, it is the floor under the foam.
        const zs = rowPositions(WATER.rows);
        const p = buildProfile(zs, 0);
        const surf = breakRow(p);
        expect(surf).toBeGreaterThan(0);

        // The pulse. `oceanPulse` raises a raised cosine to `foamSheetTrail`,
        // and an exponent BELOW one broadens it rather than tightening it, which
        // is how this was got wrong: 0.8 was chosen on purpose for a long soft
        // tail, and a long soft tail on a constant is a wash.
        let sum = 0;
        const steps = 2048;
        for (let i = 0; i < steps; i++) {
            const theta = (i / steps) * Math.PI * 2;
            sum += Math.pow(Math.max(0, 0.5 + 0.5 * Math.cos(theta)), WATER.foamSheetTrail);
        }
        const duty = sum / steps;
        // Below four tenths means the residue is absent more of the time than it
        // is present, which is what leaves clear water for the next wave to
        // arrive into. At 0.8 this was 0.55 and the sea was never clean.
        expect(duty).toBeLessThan(0.4);
    });

    test('THE SURF FADES TOWARD THE SAND, because a bore is not a breaker', () => {
        // The other half of the same fault, and the half that survived the
        // first fix. `breaking` says how hard the sea is collapsing and it is
        // pinned at 1 across the whole inner zone, correctly, because
        // everything shoreward of the break line is collapsing and gets more so
        // as the water thins. Used as the AMOUNT of whitewater it claims a
        // fifteen centimetre bore sliding over wet sand throws as much foam as
        // a metre and a half of water falling on itself at the break.
        //
        // It does not. Whitewater goes with the size of the thing breaking, so
        // the bed is scaled by the wave height here against the biggest the sea
        // managed on the way in. Steve's ocean-12 and ocean-14 caught the surge
        // at its peak and the near field was one flat white edge to edge, at
        // the same colour from twelve metres all the way to the sand.
        const zs = rowPositions(WATER.rows);
        const p = buildProfile(zs, 20);
        const surf = breakRow(p);
        expect(surf).toBeGreaterThan(0);

        // Compare the brightest whitewater anywhere against what reaches the
        // last of the water before the sand. Found from the profile rather than
        // written down in metres, so it follows the beach.
        let peak = 0;
        let nearest = -1;
        for (let r = 0; r <= surf; r++) {
            if (p.depth[r] <= WATER.minDepth * 1.5) continue;
            peak = Math.max(peak, p.foamBed[r]);
            if (nearest < 0) nearest = p.foamBed[r];   // row 0 is nearest the camera
        }
        expect(peak).toBeGreaterThan(0.5);
        expect(nearest).toBeGreaterThan(0);
        // Half again is the floor under "the surf reads as a band rather than as
        // a sheet". It was x1.2 when the near field was a wash, which is nothing.
        expect(peak / nearest).toBeGreaterThan(1.5);
    });

    test('OPEN WATER IS MOSTLY NOT WHITE, however many waves are in the sum', () => {
        // `crest` is the surface height over the SUM of the amplitudes, so it
        // can only approach one when the components happen to agree. Four
        // comparable components agree far less often than one dominant one, so
        // this threshold silently means something different every time the
        // spectrum is rebalanced. Moving the height onto the swell doubled the
        // whitecapping from 5% of open water to 10%, out to the horizon, with
        // nobody touching the number that controls it.
        const zs = rowPositions(WATER.rows);
        const constants = waveConstants(WATER.waves);
        const parts = constants.length;
        const TAU = Math.PI * 2;
        let lit = 0;
        let seen = 0;
        for (let t = 0; t < 40; t += 2) {
            const p = buildProfile(zs, t);
            for (let r = 0; r < WATER.rows; r++) {
                // Only water that is NOT breaking: foam there is the surf doing
                // its job, and this test is about the open sea beyond it.
                if (p.depth[r] <= 0.02 || p.breaking[r] > 0.05) continue;
                for (let c = 0; c < 8; c++) {
                    const x = -14 + c * 4;
                    let y = 0;
                    let ampTotal = 0;
                    for (let i = 0; i < parts; i++) {
                        const amp = p.amp[r * parts + i];
                        if (amp <= 0) continue;
                        const raw = p.phase[r * parts + i];
                        const phase = (raw - Math.floor(raw / TAU) * TAU)
                            + constants[i].kSin * x - constants[i].omega * t;
                        y += amp * Math.sin(phase) - p.sharp[r * parts + i] * Math.cos(2 * phase);
                        ampTotal += amp + p.sharp[r * parts + i];
                    }
                    seen++;
                    if (ampTotal > 1e-4 && y / ampTotal > WATER.foamCrestThreshold) lit++;
                }
            }
        }
        expect(seen).toBeGreaterThan(10000);
        // A tenth of the open ocean in whitecaps is a gale. This is a beach on
        // a calm day, so the figure belongs nearer a twentieth.
        expect(lit / seen).toBeLessThan(0.075);
    });

    test('DEPTH ALONE CANNOT BE THE FOAM, so the pulse is not decoration', () => {
        // The trap: `breaking` is very nearly flat right across the surf zone,
        // because everything shoreward of the break line is also breaking and
        // gets more so as the water thins. That is correct physics and it is a
        // terrible picture. Foam driven by this number alone is a white carpet
        // nailed to the seabed twenty metres wide: it never travels, never
        // arrives, and reads as a painted stripe rather than as surf.
        //
        // So both depth-driven foam terms in the fragment shader are gated by a
        // pulse that rides the crest. This test states the fact that makes that
        // necessary, so that the next person to simplify the foam meets the
        // reason here rather than in a screenshot.
        // The window is the surf zone itself, found from the break line rather
        // than written down in metres, so it follows the beach when the slope
        // moves. Hard coding it meant this test measured open sea the first
        // time the beach got steeper and the break came in to meet the camera.
        const zs = rowPositions(WATER.rows);
        const p = buildProfile(zs, 0);
        const surf = breakRow(p);
        // Row 0 is nearest the camera and the rows count outward, so everything
        // shoreward of the break is rows 0 up to the break row.
        const inner = [];
        for (let r = 0; r <= surf; r++) {
            if (p.depth[r] > WATER.minDepth * 1.5) inner.push(p.breaking[r]);
        }
        expect(inner.length).toBeGreaterThan(20);
        // Pinned at the top across most of the zone and never anywhere near
        // zero: there is no gap in it for one wave to end and the next to
        // begin, which is the whole point. It tapers only at the seaward edge,
        // where the break line is by definition the row that just reaches the
        // threshold.
        const pinned = inner.filter((v) => v > 0.95).length;
        expect(pinned / inner.length).toBeGreaterThan(0.7);
        expect(Math.min(...inner)).toBeGreaterThan(0.4);

        const fragment = __test__.FRAGMENT_BODY;
        expect(fragment).toMatch(/breakFoam\s*=\s*arriving/); // gated, not raw
        expect(fragment).toMatch(/bedFoam\s*=\s*vFoam\.z\s*\*\s*sheet/);
        // Both gates have to be pulses off the same wave, not constants.
        expect(fragment).toMatch(/trail\s*=\s*oceanPulse\(vPulse/);
        expect(fragment).toMatch(/sheet\s*=\s*oceanPulse\(vPulse/);
    });

    test('NOTHING IN THE FOAM IS ALLOWED TO SWITCH ON BY ITSELF', () => {
        // The fold term used to. It is a derivative of a derivative, it spends
        // three quarters of its life at exactly zero, and left as its own term
        // in the max() it went from nothing to nearly white in a quarter of a
        // second on its own schedule. Narrowing its window made it worse, since
        // a narrower window is a steeper ramp. Nothing about the threshold can
        // slow a rate that the wave sets.
        //
        // The rule that fixes it is that every foam term has to be enveloped by
        // something that changes on the wave's timescale rather than on a
        // derivative's, so a term can brighten only where the wave already is.
        // A new term added without an envelope is exactly the regression this
        // catches, and it would look like a light switching on in the surf.
        const fragment = __test__.FRAGMENT_BODY;
        const envelopes = ['trail', 'sheet', 'arriving', 'crest'];
        // `foam` itself is the combination of the terms, not one of them.
        const terms = [...fragment.matchAll(/float\s+(\w+[Ff]oam)\s*=\s*([^;]+);/g)];
        expect(terms.length).toBeGreaterThanOrEqual(4);
        for (const [, name, expression] of terms) {
            const enveloped = envelopes.some((e) => new RegExp(`\\b${e}\\b`).test(expression));
            expect(`${name}: ${enveloped}`).toBe(`${name}: true`);
        }
    });

    test('NO ONE COMPONENT SPEAKS FOR THE SEA', () => {
        // The foam pulse used to be built from aPhase[0], on the reasoning that
        // the longest wave is the one that reads as arriving. That was true
        // while the swell carried nearly all the height, and it silently stopped
        // being true when the height was split with a shorter chop: the white
        // went on riding the swell while the crests on screen were the chop.
        // Nothing failed, nothing warned, the foam was just on the wrong wave.
        //
        // The rule that prevents it coming back is that outside the loop over
        // components, no component may be singled out. Inside the loop every
        // read is indexed by the loop variable, so a literal index anywhere else
        // is a component being promoted above the others.
        const body = __test__.VERTEX_BODY;
        // Comments are prose and are allowed to name a component. This one does,
        // a few lines down, to explain why it must not be read there.
        const outside = body
            .replace(/for\s*\(int i[\s\S]*?\n    \}/, '')
            .replace(/\/\/[^\n]*/g, '');
        expect(outside.length).toBeGreaterThan(200);   // the strip really worked
        for (const name of ['aPhase', 'aAmp', 'aWaveK', 'aSharp', 'uOmega', 'uKSin', 'uSteepness']) {
            expect(outside).not.toContain(name);
        }
        // And what replaced it has to be a sum over all of them.
        expect(body).toMatch(/phasor\s*\+=/);
        expect(__test__.VERTEX_HEAD).toContain('varying vec2 vPulse');
    });

    test('the wave constants reach the shader as vec4 uniforms', () => {
        initWater(makeScene(), OCEAN_CONFIG);
        const { uniforms } = __test__.state();
        const constants = waveConstants(WATER.waves);
        expect(uniforms.uOmega.value.x).toBeCloseTo(constants[0].omega, 9);
        expect(uniforms.uKSin.value.w).toBeCloseTo(constants[3].kSin, 9);
        expect(uniforms.uSteepness.value.y).toBeCloseTo(WATER.waves[1].steepness, 9);
    });

    test('the per-row profile is broadcast across each row of vertices', () => {
        initWater(makeScene(), OCEAN_CONFIG);
        const { grid } = __test__.state();
        const shore = getWaterMesh().geometry.getAttribute('aShore').array;
        const row = 40;
        const first = shore[row * grid.cols * 4];
        for (let c = 1; c < grid.cols; c++) {
            expect(shore[(row * grid.cols + c) * 4]).toBe(first);
        }
    });

    test('phase is wrapped into a single turn so float32 keeps its precision', () => {
        initWater(makeScene(), OCEAN_CONFIG);
        const phase = getWaterMesh().geometry.getAttribute('aPhase').array;
        for (let i = 0; i < phase.length; i++) {
            expect(phase[i]).toBeGreaterThanOrEqual(0);
            expect(phase[i]).toBeLessThan(Math.PI * 2 + 1e-4);
        }
        // And the unwrapped profile really does run well past one turn, so the
        // wrap is doing something rather than being decoration.
        const p = getProfile();
        expect(Math.max(...p.phase)).toBeGreaterThan(Math.PI * 20);
    });

    test('a phone gets a smaller grid', () => {
        initWater(makeScene(), OCEAN_CONFIG);
        const full = __test__.state().grid;
        disposeWater();
        initWater(makeScene(), OCEAN_CONFIG, { mobile: true });
        const small = __test__.state().grid;
        expect(small.rows).toBeLessThan(full.rows);
        expect(small.cols).toBeLessThan(full.cols);
    });

    test('the vertex colour attribute carries the water line fade', () => {
        initWater(makeScene(), OCEAN_CONFIG);
        const colors = getWaterMesh().geometry.getAttribute('color');
        expect(colors.itemSize).toBe(4);
        expect(getWaterMesh().material.vertexColors).toBe(true);
    });
});

describe('the frame loop', () => {
    test('advances the clock the shader runs on', () => {
        initWater(makeScene(), OCEAN_CONFIG);
        updateWater(0.016);
        updateWater(0.016);
        expect(getElapsed()).toBeCloseTo(0.032, 6);
        expect(__test__.state().uniforms.uTime.value).toBeCloseTo(0.032, 6);
    });

    test('a backgrounded tab does not teleport the sea forward', () => {
        initWater(makeScene(), OCEAN_CONFIG);
        updateWater(45);
        expect(getElapsed()).toBeLessThanOrEqual(0.25);
    });

    test('negative time is ignored rather than run backwards', () => {
        initWater(makeScene(), OCEAN_CONFIG);
        updateWater(-5);
        expect(getElapsed()).toBe(0);
    });

    test('THE PROFILE REBUILDS FAR LESS OFTEN THAN THE FRAME DRAWS', () => {
        // The whole performance argument of the module. If this ever becomes a
        // per-frame pass over every vertex, a phone stops holding sixty frames.
        initWater(makeScene(), OCEAN_CONFIG);
        const attribute = getWaterMesh().geometry.getAttribute('aAmp');
        let uploads = 0;
        for (let i = 0; i < 60; i++) {
            attribute.needsUpdate = false;
            updateWater(1 / 60);
            if (attribute.needsUpdate) uploads++;
        }
        expect(uploads).toBeLessThanOrEqual(WATER.profileHz + 1);
        expect(uploads).toBeGreaterThan(0);
    });

    test('does nothing at all before the sea exists', () => {
        expect(() => updateWater(0.016)).not.toThrow();
        expect(breakDistance()).toBe(0);
    });
});

describe('the seam with the surf audio', () => {
    test('waves reach the break line and are reported', () => {
        initWater(makeScene(), OCEAN_CONFIG);
        consumeBreaks();
        for (let i = 0; i < 60 * 30; i++) updateWater(1 / 60);
        const events = consumeBreaks();
        expect(events.length).toBeGreaterThan(0);
    });

    test('each one is shaped for playBreak(strength, pan)', () => {
        initWater(makeScene(), OCEAN_CONFIG);
        for (let i = 0; i < 60 * 30; i++) updateWater(1 / 60);
        for (const event of consumeBreaks()) {
            expect(event.strength).toBeGreaterThanOrEqual(0);
            expect(event.strength).toBeLessThanOrEqual(1);
            expect(Math.abs(event.pan)).toBeLessThanOrEqual(1);
            expect(event.distance).toBeGreaterThan(0);
        }
    });

    test('they arrive at something like the rate waves arrive at', () => {
        // Thirty seconds of a real shorebreak is a handful of arrivals, not
        // one and not two hundred. A rattle here means the short chop
        // components have been given a voice they should not have.
        initWater(makeScene(), OCEAN_CONFIG);
        consumeBreaks();
        for (let i = 0; i < 60 * 30; i++) updateWater(1 / 60);
        const count = consumeBreaks().length;
        expect(count).toBeGreaterThan(3);
        expect(count).toBeLessThan(30);
    });

    test('only the two longest components get a voice', () => {
        expect(__test__.SOUNDING_WAVES).toBe(2);
    });

    test('the queue is drained rather than handed out live', () => {
        initWater(makeScene(), OCEAN_CONFIG);
        for (let i = 0; i < 600; i++) updateWater(1 / 60);
        const first = consumeBreaks();
        const second = consumeBreaks();
        expect(second).not.toBe(first);
        expect(second).toHaveLength(0);
    });

    test('the queue cannot grow without bound if nobody drains it', () => {
        initWater(makeScene(), OCEAN_CONFIG);
        for (let i = 0; i < 60 * 60; i++) updateWater(1 / 60);
        // A minute of surf. Even undrained this is tens of entries, not
        // thousands, which is the shape that matters.
        expect(consumeBreaks().length).toBeLessThan(200);
    });

    test('the break distance is reported in metres from the water line', () => {
        initWater(makeScene(), OCEAN_CONFIG);
        updateWater(0.016);
        const distance = breakDistance();
        expect(distance).toBeGreaterThan(2);
        expect(distance).toBeLessThan(120);
    });
});

describe('teardown', () => {
    test('gives the GPU resources back and takes the mesh out of the scene', () => {
        const scene = makeScene();
        const mesh = initWater(scene, OCEAN_CONFIG);
        const { geometry, material } = mesh;
        disposeWater();
        expect(geometry.disposed).toBe(true);
        expect(material.disposed).toBe(true);
        expect(scene.children).not.toContain(mesh);
        expect(getWaterMesh()).toBeNull();
    });

    test('is safe to call twice, and safe to call having never started', () => {
        expect(() => { disposeWater(); disposeWater(); }).not.toThrow();
    });

    test('a second sea can be built after the first is torn down', () => {
        initWater(makeScene(), OCEAN_CONFIG);
        disposeWater();
        const scene = makeScene();
        expect(() => initWater(scene, OCEAN_CONFIG)).not.toThrow();
        expect(scene.children).toHaveLength(1);
        expect(getElapsed()).toBe(0);
    });
});

describe('the small helpers', () => {
    test('clamp holds the ends', () => {
        expect(__test__.clamp(-3, 0, 1)).toBe(0);
        expect(__test__.clamp(3, 0, 1)).toBe(1);
        expect(__test__.clamp(0.5, 0, 1)).toBe(0.5);
    });

    test('smoothstep is flat at both ends and half in the middle', () => {
        expect(__test__.smoothstep(0, 1, -1)).toBe(0);
        expect(__test__.smoothstep(0, 1, 2)).toBe(1);
        expect(__test__.smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 9);
    });

    test('smoothstep survives a degenerate range rather than dividing by zero', () => {
        expect(__test__.smoothstep(1, 1, 0)).toBe(0);
        expect(__test__.smoothstep(1, 1, 2)).toBe(1);
    });
});

describe('how often the storm is redrawn', () => {
    // THE ASSUMPTION THAT BROKE. `profileHz` was 6 because the profile was said
    // to change only as the tide and the set envelope move, "both of which are
    // measured in minutes". True of the ambient sea it was written for, and the
    // storm arc broke it: the surge, the tsunami front, and the swell all move
    // in seconds and all three arrive through the profile. Steve reported it as
    // the surge lagging and the water receding from the beach lagging, which
    // were one stutter seen twice.
    test('the profile keeps up with things that move in seconds', () => {
        // Measured in pixels of jump per update: the waterline moved 21 px at
        // 6 Hz and the wall 217 px. This is the floor that keeps those honest
        // without pinning the exact value, which is a property of the machine.
        expect(OCEAN_CONFIG.water.profileHz).toBeGreaterThanOrEqual(15);
    });

    test('the rate can be changed while watching, and put back', () => {
        // The ceiling is the attribute upload, which cannot be measured outside
        // a browser, so the value has to be found by trying it on the hardware.
        initWater(makeScene(), OCEAN_CONFIG);
        expect(profileRate()).toBe(OCEAN_CONFIG.water.profileHz);
        expect(setProfileHz(45)).toBe(45);
        expect(profileRate()).toBe(45);
        expect(setProfileHz(null)).toBe(OCEAN_CONFIG.water.profileHz);
    });

    test('a nonsense rate is refused rather than freezing the sea', () => {
        initWater(makeScene(), OCEAN_CONFIG);
        const original = profileRate();
        [0, -5, NaN, 'fast'].forEach((bad) => {
            expect(setProfileHz(bad)).toBe(original);
        });
        // And absurd but positive values are clamped rather than honoured.
        expect(setProfileHz(100000)).toBeLessThanOrEqual(120);
        setProfileHz(null);
    });

    test('raising it actually rebuilds more often', () => {
        initWater(makeScene(), OCEAN_CONFIG);
        const countRebuilds = (hz) => {
            setProfileHz(hz);
            const before = getProfile().depth.slice();
            let changes = 0;
            let last = before;
            for (let i = 0; i < 60; i++) {
                updateWater(1 / 60, { swell: 1 + i * 0.02, lean: 3, surge: i * 0.01 });
                const now = getProfile().depth;
                if (now.some((v, k) => v !== last[k])) changes++;
                last = now.slice();
            }
            return changes;
        };
        const slow = countRebuilds(6);
        const fast = countRebuilds(30);
        expect(fast).toBeGreaterThan(slow * 2);
        setProfileHz(null);
    });
});
