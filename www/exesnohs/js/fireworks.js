// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * fireworks.js - Rockets, bursts, and a finale that spells a number.
 *
 * PURE, the same way celebration.js and takedown.js are: a plan is rolled once,
 * and `sparksAt` answers where every spark is at time `t` by writing into two
 * flat arrays. No THREE, no clock of its own, no state carried from one frame to
 * the next. That buys three things at once:
 *
 *   - a test can ask where the numerals are at the hold and measure them
 *   - a skipped show, or a frame that took half a second, lands exactly where
 *     it should rather than wherever an integrator had got to
 *   - the renderer (spectacle.js) is one buffer upload and nothing else
 *
 * EVERY SPARK IS CLOSED FORM. A burst spark leaves at a velocity and is slowed
 * by air, which is an exponential, and pulled down by gravity, which under that
 * drag has a closed form too:
 *
 *     x(τ) = x0 + v · (1 - e^(-kτ)) / k
 *     y(τ) = y0 + v_y · (1 - e^(-kτ)) / k  -  g · (τ/k - (1 - e^(-kτ)) / k²)
 *
 * so a spark at τ = 1.2s costs the same arithmetic as one at τ = 0.
 *
 * AN UNUSED SLOT IS BLACK. The sparks are drawn with additive blending, where
 * black adds nothing, so there is no visibility flag to keep in step with
 * anything: a spark that has not launched or has burned out simply writes zero.
 */
import { EXESNOHS_CONFIG as CFG } from './config.min.js';

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const easeOut = (t) => 1 - (1 - clamp01(t)) ** 3;

/** A repeatable stream, so a plan rolled for a replay of the same show, or for
 *  a test, is the same show. */
export function seeded(seed) {
    let s = (Math.floor(seed) >>> 0) || 1;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

/** '#ffcf5a' to [1, 0.81, 0.35]. */
export function hexToRgb(hex) {
    const n = parseInt(String(hex).replace('#', ''), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * THE NUMERALS, AS STROKES IN A BOX ONE UNIT TALL AND ONE UNIT WIDE.
 *
 * Drawn rather than sampled off a canvas, and that is not thrift. A canvas would
 * put the shape of the finale at the mercy of whichever font the device has, and
 * would give a test nothing to measure: headless there is no canvas at all. A
 * few polylines are the same on every screen and in the suite.
 *
 * Chamfered corners rather than curves, because sparks along a curve and sparks
 * along a chamfer are indistinguishable at the size a firework is seen, and the
 * straight version is the one that can be sampled evenly.
 */
const GLYPHS = {
    0: [[[0.2, 0], [0.8, 0], [1, 0.15], [1, 0.85], [0.8, 1], [0.2, 1], [0, 0.85], [0, 0.15], [0.2, 0]]],
    1: [[[0.2, 0.8], [0.55, 1], [0.55, 0]], [[0.2, 0], [0.9, 0]]],
    2: [[[0, 0.8], [0.2, 1], [0.8, 1], [1, 0.8], [1, 0.6], [0, 0], [1, 0]]],
    3: [[[0, 0.85], [0.2, 1], [0.8, 1], [1, 0.85], [1, 0.62], [0.8, 0.5], [0.4, 0.5]],
        [[0.8, 0.5], [1, 0.38], [1, 0.15], [0.8, 0], [0.2, 0], [0, 0.15]]],
    4: [[[0.75, 0], [0.75, 1], [0, 0.3], [1, 0.3]]],
    5: [[[1, 1], [0.1, 1], [0, 0.55], [0.75, 0.55], [1, 0.4], [1, 0.15], [0.8, 0], [0.15, 0], [0, 0.12]]],
    6: [[[0.9, 1], [0.35, 1], [0, 0.6], [0, 0.15], [0.2, 0], [0.8, 0], [1, 0.15], [1, 0.4], [0.8, 0.55], [0.1, 0.55]]],
    7: [[[0, 1], [1, 1], [0.35, 0]]],
    8: [[[0.2, 0.5], [0, 0.65], [0, 0.85], [0.2, 1], [0.8, 1], [1, 0.85], [1, 0.65], [0.8, 0.5],
        [0.2, 0.5], [0, 0.35], [0, 0.15], [0.2, 0], [0.8, 0], [1, 0.15], [1, 0.35], [0.8, 0.5]]],
    9: [[[0.9, 0.45], [0.2, 0.45], [0, 0.6], [0, 0.85], [0.2, 1], [0.8, 1], [1, 0.85], [1, 0.4], [0.65, 0], [0.1, 0]]],
};

/** A glyph is this much as wide as it is tall, and this much air sits between
 *  two of them. */
const GLYPH_WIDTH = 0.62;
const GLYPH_GAP = 0.3;

/**
 * POINTS ALONG THE STROKES OF `text`, centred on the origin, in metres.
 *
 * `u` runs to the right as the camera sees it and `v` runs up. Spaced evenly by
 * ARC LENGTH, so a long stroke is not drawn thinner than a short one, and every
 * corner gets a spark of its own so the chamfers read.
 */
export function digitPoints(text, { height = 9, spacing = 0.42 } = {}) {
    const glyphs = String(text).split('').filter((c) => GLYPHS[c]);
    const width = height * GLYPH_WIDTH;
    const advance = width + height * GLYPH_GAP;
    const total = glyphs.length ? glyphs.length * width + (glyphs.length - 1) * height * GLYPH_GAP : 0;
    const out = [];
    glyphs.forEach((c, i) => {
        const left = -total / 2 + i * advance;
        for (const line of GLYPHS[c]) {
            const pts = line.map(([x, y]) => ({ u: left + x * width, v: (y - 0.5) * height }));
            for (let s = 0; s < pts.length - 1; s += 1) {
                const a = pts[s];
                const b = pts[s + 1];
                const len = Math.hypot(b.u - a.u, b.v - a.v);
                const steps = Math.max(1, Math.round(len / spacing));
                // The last point of a segment is the first of the next, so it
                // is left to the next one, except at the very end of the line.
                const last = s === pts.length - 2 ? steps : steps - 1;
                for (let k = 0; k <= last; k += 1) {
                    const f = k / steps;
                    out.push({ u: a.u + (b.u - a.u) * f, v: a.v + (b.v - a.v) * f });
                }
            }
        }
    });
    /**
     * CENTRED ON THE INK, NOT ON THE BOXES. A 1 only uses the middle of its box,
     * so "100" centred by its boxes stood half a metre left of where the camera
     * was aimed, and the sky shot is solved around that aim.
     */
    if (out.length) {
        let lo = Infinity;
        let hi = -Infinity;
        for (const p of out) { lo = Math.min(lo, p.u); hi = Math.max(hi, p.u); }
        const shift = (lo + hi) / 2;
        for (const p of out) p.u -= shift;
    }
    return out;
}

/** A direction on the unit sphere, evenly rather than bunched at the poles. */
function sphere(roll) {
    const y = roll() * 2 - 1;
    const a = roll() * Math.PI * 2;
    const r = Math.sqrt(1 - y * y);
    return { x: r * Math.cos(a), y, z: r * Math.sin(a) };
}

/**
 * ROLL A SHOW'S WORTH OF FIREWORKS, ONCE.
 *
 *   text      the number the finale spells, as a string
 *   origins   world points shells may launch from
 *   centre    where the finale bursts; the numerals are laid out around it,
 *             facing the camera, which looks down +x (so `u` is +z)
 *   seed      the roll, so a test and a replay get the same show
 *   F         the fireworks config, injected so a test can shrink it
 *
 * Slots are assigned here, in order, and never change: every shell has a rocket
 * (a head and a short trail) and its sparks, and the finale has its rocket, one
 * spark per point of the numerals, and a ring of ordinary sparks around them.
 */
export function planFireworks({ text = '', origins = [], centre = { x: 0, y: 0, z: 0 }, seed = 1, F = CFG.milestones.fireworks } = {}) {
    const roll = seeded(seed);
    const palette = F.palette.map(hexToRgb);
    const gap = CFG.milestones.flashGap;
    const shells = [];
    let slot = 0;
    const take = (n) => { const at = slot; slot += n; return at; };

    // The volley. Evenly spaced so no two bursts land inside `flashGap` of each
    // other, which is the photosensitivity ceiling and not a style choice.
    const every = Math.max(gap, (F.finaleLaunch - F.firstLaunch) / Math.max(1, F.shells));
    for (let i = 0; i < F.shells; i += 1) {
        const launch = F.firstLaunch + i * every;
        const from = origins.length ? origins[i % origins.length] : centre;
        const at = {
            x: centre.x + (roll() - 0.5) * 8,
            y: centre.y + (roll() - 0.3) * 8,
            z: centre.z + (roll() * 2 - 1) * 12,
        };
        const sparks = [];
        for (let s = 0; s < F.sparks; s += 1) {
            const d = sphere(roll);
            const v = F.speed * (0.55 + roll() * 0.45);
            sparks.push({ vx: d.x * v, vy: d.y * v, vz: d.z * v });
        }
        shells.push({
            kind: 'shell',
            launch,
            burst: launch + F.rise,
            from,
            at,
            colour: palette[i % palette.length],
            rocket: take(4),
            first: take(sparks.length),
            sparks,
        });
    }

    // The finale, which becomes the number.
    const finaleBurst = F.finaleLaunch + F.rise;
    const targets = digitPoints(text, { height: F.digitHeight, spacing: F.spacing })
        .map((p) => ({ x: centre.x, y: centre.y + p.v, z: centre.z + p.u, phase: roll() * Math.PI * 2 }));
    const ring = [];
    for (let s = 0; s < 60; s += 1) {
        const d = sphere(roll);
        const v = F.speed * 1.2 * (0.7 + roll() * 0.3);
        ring.push({ vx: d.x * v, vy: d.y * v, vz: d.z * v });
    }
    const finale = {
        kind: 'finale',
        launch: F.finaleLaunch,
        burst: finaleBurst,
        from: origins.length ? origins[Math.floor(origins.length / 2)] : centre,
        at: { ...centre },
        colour: palette[0],
        ringColour: palette[1],
        rocket: take(4),
        first: take(targets.length),
        targets,
        ringFirst: take(ring.length),
        ring,
    };

    // Nothing may outgrow the buffer spectacle.js allocated. `fits` says whether
    // it did, and the suite holds every built show to it.
    return {
        shells,
        finale,
        count: slot,
        fits: slot <= F.pool,
        reveal: finaleBurst + F.gather,
        end: finaleBurst + F.gather + F.hold + F.fall,
        F,
    };
}

function write(pos, col, i, x, y, z, rgb, b) {
    const o = i * 3;
    pos[o] = x;
    pos[o + 1] = y;
    pos[o + 2] = z;
    col[o] = rgb[0] * b;
    col[o + 1] = rgb[1] * b;
    col[o + 2] = rgb[2] * b;
}

/** A rocket climbing to its burst, a head and a three-point tail. */
function rocketAt(t, shell, F, pos, col) {
    const trail = [1, 0.55, 0.3, 0.15];
    for (let j = 0; j < 4; j += 1) {
        const tau = t - shell.launch - j * 0.045;
        const on = tau >= 0 && t < shell.burst;
        const f = easeOut(tau / F.rise);
        write(pos, col, shell.rocket + j,
            shell.from.x + (shell.at.x - shell.from.x) * f,
            shell.from.y + (shell.at.y - shell.from.y) * f,
            shell.from.z + (shell.at.z - shell.from.z) * f,
            [1, 0.85, 0.6], on ? trail[j] * 0.9 : 0);
    }
}

/** One ballistic spark with drag and gravity, `tau` seconds after its burst. */
function flight(at, v, tau, F) {
    const k = F.drag;
    const e = 1 - Math.exp(-k * tau);
    return {
        x: at.x + (v.vx * e) / k,
        y: at.y + (v.vy * e) / k - F.gravity * (tau / k - e / (k * k)),
        z: at.z + (v.vz * e) / k,
    };
}

/** Bright at the burst and burning down, and a quick pop rather than a switch. */
function burnDown(tau, life) {
    if (tau < 0 || tau > life) return 0;
    return Math.min(1, tau / 0.05) * (1 - tau / life) ** 1.5;
}

/**
 * EVERY SPARK AT TIME `t`, written into `positions` and `colours` (both
 * Float32Array, three per slot). Slots past `plan.count` are left alone.
 *
 * `calm` is somebody who asked not to be moved about. No rockets, no bursts and
 * no shimmer: the numerals fade in where they will stand, hold still, and fade
 * out. The number is the reward, and it survives all of that being taken away.
 */
export function sparksAt(t, plan, positions, colours, { calm = false } = {}) {
    if (!plan) return;
    const F = plan.F;

    for (const shell of plan.shells) {
        rocketAt(calm ? -1 : t, shell, F, positions, colours);
        const tau = t - shell.burst;
        for (let s = 0; s < shell.sparks.length; s += 1) {
            const p = flight(shell.at, shell.sparks[s], Math.max(0, tau), F);
            write(positions, colours, shell.first + s, p.x, p.y, p.z, shell.colour,
                calm ? 0 : burnDown(tau, F.life * (0.7 + (s % 7) * 0.05)));
        }
    }

    const fin = plan.finale;
    rocketAt(calm ? -1 : t, fin, F, positions, colours);
    const tau = t - fin.burst;
    const holdFrom = F.gather;
    const fallFrom = F.gather + F.hold;
    for (let s = 0; s < fin.targets.length; s += 1) {
        const target = fin.targets[s];
        let x = target.x;
        let y = target.y;
        let z = target.z;
        let b = 0;
        if (calm) {
            // In place from the start, fading rather than flying.
            b = clamp01(tau / F.gather) * (1 - clamp01((tau - fallFrom) / F.fall));
        } else if (tau >= 0 && tau < holdFrom) {
            // OUT OF THE BURST AND STRAIGHT INTO THE SHAPE. Every spark is aimed
            // at its own place in the numerals, so the burst IS the gathering:
            // it opens outward and slows into the number.
            const f = easeOut(tau / F.gather);
            x = fin.at.x + (target.x - fin.at.x) * f;
            y = fin.at.y + (target.y - fin.at.y) * f;
            z = fin.at.z + (target.z - fin.at.z) * f;
            b = 1;
        } else if (tau >= holdFrom && tau < fallFrom) {
            // A SHIMMER, NOT A FLASH. Each spark has its own phase, so the
            // number glitters while its overall brightness barely moves.
            b = 0.74 + 0.26 * Math.sin(target.phase + Math.PI * 2 * 1.7 * tau);
        } else if (tau >= fallFrom && tau <= fallFrom + F.fall) {
            // And it falls out of the sky as it burns out.
            const f = tau - fallFrom;
            y = target.y - 0.5 * F.gravity * 0.7 * f * f;
            b = 0.74 * (1 - f / F.fall) ** 1.3;
        }
        write(positions, colours, fin.first + s, x, y, z, fin.colour, b);
    }
    for (let s = 0; s < fin.ring.length; s += 1) {
        const p = flight(fin.at, fin.ring[s], Math.max(0, tau), F);
        write(positions, colours, fin.ringFirst + s, p.x, p.y, p.z, fin.ringColour,
            calm ? 0 : burnDown(tau, F.life) * 0.8);
    }
}
