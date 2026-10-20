// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * decals.js - the car's livery (M4.5, PRD Paint and decals): the decals,
 * the name on its sides and the number on its nose, painted onto the body
 * itself.
 *
 * OUR OWN ART, DRAWN HERE: flames, a star, a lightning bolt, a checkered
 * flag and a racing stripe, each drawn on a canvas from a few shapes, so
 * nothing is downloaded.
 *
 * THE LIVERY IS A TEXTURE ON THE BODY'S OWN FACES (carmesh.js maps it): one
 * picture for each side and one for the top, each covering the whole block
 * (7 in by 1.25 in, or 7 in by 1.75 in). So a decal sticks to the surface,
 * follows a tapered side, and is trimmed by the shape wherever the body was
 * cut away, with no geometry of its own.
 *
 * BOTH SIDES READ THE RIGHT WAY ROUND. The decals sit the same distance from
 * the nose on both sides, but the art and the words are never mirrored, so
 * each side has its own picture: side 'a' (+z, the camera's side) shows the
 * nose on the right, side 'b' on the left. Flames always trail back.
 *
 * A DECAL is { kind, x, y, size }: x meters from the nose to its middle, y
 * meters above the block's bottom face to its middle, size 's', 'm' or 'l'.
 * The name and number are the build's own (textContent everywhere else,
 * and here they are only drawn, never parsed).
 */

import { DERBY_CONFIG, IN } from './config.min.js';
import { profileAt } from './car.min.js';

/** The decals, with their size at 'm' in inches (width, height). */
export const DECALS = Object.freeze({
    flame: Object.freeze({ label: 'Flames', w: 2.4, h: 0.7 }),
    star: Object.freeze({ label: 'Star', w: 0.6, h: 0.6 }),
    bolt: Object.freeze({ label: 'Lightning bolt', w: 1.1, h: 0.55 }),
    checker: Object.freeze({ label: 'Checkered flag', w: 0.9, h: 0.6 }),
    stripe: Object.freeze({ label: 'Racing stripe', w: 5.6, h: 0.22 })
});
export const SIZES = Object.freeze({ s: 0.7, m: 1, l: 1.35 });
export const SIZE_LABELS = Object.freeze({ s: 'Small', m: 'Medium', l: 'Large' });

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** A decal's width and height in meters. */
export function decalSize(d) {
    const k = DECALS[d.kind];
    const s = SIZES[d.size] || 1;
    return { w: k.w * s * IN, h: k.h * s * IN };
}

/** Stored decals made valid: known kinds, inside the block, a few at most. */
export function normalizeDecals(raw, C = DERBY_CONFIG) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const d of raw) {
        if (out.length >= C.workshop.maxDecals) break;
        if (!d || typeof d !== 'object' || !Object.prototype.hasOwnProperty.call(DECALS, d.kind)) continue;
        out.push({
            kind: d.kind,
            x: isNum(d.x) ? clamp(d.x, 0, C.kit.length) : C.kit.length / 2,
            y: isNum(d.y) ? clamp(d.y, 0, C.kit.height) : C.kit.height / 2,
            size: Object.prototype.hasOwnProperty.call(SIZES, d.size) ? d.size : 'm'
        });
    }
    return out;
}

/** A new decal where it shows best: halfway along the body, halfway up it
 *  there (a stripe low along the side). */
export function placeDecal(kind, stations, C = DERBY_CONFIG) {
    const x = kind === 'stripe' ? C.kit.length / 2 : C.kit.length * 0.55;
    const [b, t] = profileAt(stations, x);
    return { kind, x, y: kind === 'stripe' ? b + (t - b) * 0.3 : (b + t) / 2, size: 'm' };
}

/**
 * Where the name goes on the side: the stretch of the body that stays
 * tallest over the name's length, halfway up it, the letters as tall as
 * that stretch allows. Returns { x, y, height } in meters, or null when no
 * stretch is tall enough to read. Pure.
 */
export function nameSpot(stations, chars, C = DERBY_CONFIG) {
    const L = C.kit.length;
    let best = null;
    for (let k = 0; k <= 20; k++) {
        const span = Math.min(L * 0.8, Math.max(L * 0.3, chars * 0.2 * IN));
        const x0 = (L - span) * (k / 20);
        let low = Infinity;
        let mid = 0;
        for (let j = 0; j <= 8; j++) {
            const [b, t] = profileAt(stations, x0 + (span * j) / 8);
            if (t - b < low) {
                low = t - b;
                mid = (b + t) / 2;
            }
        }
        if (!best || low > best.low) best = { x: x0 + span / 2, low, y: mid };
    }
    if (best.low < 0.3 * IN) return null;
    return { x: best.x, y: best.y, height: Math.min(best.low * 0.55, 0.45 * IN) };
}

// ---- The art --------------------------------------------------------------

function flame(g, w, h) {
    // Tongues of fire trailing right from a rounded front, red to yellow.
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, '#ffd23a');
    grad.addColorStop(0.55, '#ff8a1e');
    grad.addColorStop(1, '#d6261f');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(0, h * 0.5);
    g.quadraticCurveTo(0, h * 0.05, w * 0.22, h * 0.12);
    const tongues = [[0.55, 0.0, 0.42, 0.3], [0.85, 0.2, 0.62, 0.42], [1.0, 0.5, 0.7, 0.55], [0.82, 0.78, 0.6, 0.66], [0.52, 1.0, 0.4, 0.78]];
    for (const [tx, ty, bx, by] of tongues) {
        g.quadraticCurveTo(w * (tx - 0.1), h * ty, w * tx, h * ty);
        g.quadraticCurveTo(w * (bx + 0.05), h * by, w * bx, h * by);
    }
    g.quadraticCurveTo(0, h * 0.95, 0, h * 0.5);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(80, 10, 0, 0.6)';
    g.lineWidth = Math.max(1, h * 0.04);
    g.stroke();
}

function star(g, w, h) {
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) / 2;
    g.beginPath();
    for (let i = 0; i < 10; i++) {
        const r = i % 2 ? R * 0.42 : R;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        g[i ? 'lineTo' : 'moveTo'](cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
    g.closePath();
    g.fillStyle = '#ffd23a';
    g.fill();
    g.strokeStyle = '#2b2420';
    g.lineWidth = Math.max(1, R * 0.08);
    g.stroke();
}

function bolt(g, w, h) {
    const pts = [[0, 0.35], [0.55, 0.0], [0.47, 0.38], [1, 0.3], [0.38, 1], [0.5, 0.58], [0.02, 0.65]];
    g.beginPath();
    pts.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x * w, y * h));
    g.closePath();
    g.fillStyle = '#ffe03a';
    g.fill();
    g.strokeStyle = '#2b2420';
    g.lineWidth = Math.max(1, h * 0.05);
    g.stroke();
}

function checker(g, w, h) {
    const cols = 6;
    const rows = 4;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            g.fillStyle = (r + c) % 2 ? '#111111' : '#f6f6f6';
            g.fillRect((c * w) / cols, (r * h) / rows, w / cols + 0.5, h / rows + 0.5);
        }
    }
    g.strokeStyle = '#111111';
    g.lineWidth = Math.max(1, h * 0.04);
    g.strokeRect(0, 0, w, h);
}

function stripe(g, w, h) {
    g.fillStyle = '#f6f2e8';
    g.fillRect(0, 0, w, h * 0.42);
    g.fillRect(0, h * 0.58, w, h * 0.42);
}

const ART = { flame, star, bolt, checker, stripe };

/** Draw a decal's art into `g` at (x, y) top left, `w` by `h` pixels.
 *  `trailLeft` turns flames to trail left, for side 'a'. */
export function drawArt(g, kind, x, y, w, h, trailLeft = false) {
    const draw = ART[kind];
    if (!draw) return;
    g.save();
    g.translate(x, y);
    if (trailLeft && kind === 'flame') {
        g.translate(w, 0);
        g.scale(-1, 1);
    }
    draw(g, w, h);
    g.restore();
}

const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;

/** Black or white, whichever reads on a paint color. */
export function inkFor(color) {
    const r = (color >> 16) & 255;
    const gr = (color >> 8) & 255;
    const b = color & 255;
    return 0.299 * r + 0.587 * gr + 0.114 * b > 150 ? '#1a1a1a' : '#ffffff';
}

/**
 * One side's picture: the paint, the decals, and the name, on a canvas `w`
 * by `h` pixels covering the block's whole side. `side` 'a' shows the nose
 * on the right, 'b' on the left.
 */
export function drawSide(g, w, h, build, side, C = DERBY_CONFIG) {
    const L = C.kit.length;
    const H = C.kit.height;
    const px = w / L;
    const py = h / H;
    // Meters from the nose, and above the bottom, to pixels on this side.
    const X = (d) => (side === 'a' ? (L - d) * px : d * px);
    const Y = (y) => h - y * py;
    g.fillStyle = hex(build.paint.body);
    g.fillRect(0, 0, w, h);
    for (const d of build.decals || []) {
        const { w: dw, h: dh } = decalSize(d);
        drawArt(g, d.kind, X(d.x) - (dw * px) / 2, Y(d.y) - (dh * py) / 2, dw * px, dh * py, side === 'a');
    }
    if (build.name) {
        const spot = nameSpot(build.stations, build.name.length, C);
        if (spot) {
            g.fillStyle = inkFor(build.paint.body);
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            let size = spot.height * py;
            g.font = `800 ${size}px system-ui, sans-serif`;
            const room = L * 0.8 * px;
            const width = g.measureText(build.name).width;
            if (width > room) {
                size *= room / width;
                g.font = `800 ${size}px system-ui, sans-serif`;
            }
            g.fillText(build.name, X(spot.x), Y(spot.y));
        }
    }
}

/**
 * The top's picture: the paint, the two-tone stripe down the middle, and
 * the number in a white circle near the nose, `w` by `h` pixels covering
 * the block's top (its length by its full width), the nose at the left.
 */
export function drawTop(g, w, h, build, C = DERBY_CONFIG) {
    const L = C.kit.length;
    g.fillStyle = hex(build.paint.body);
    g.fillRect(0, 0, w, h);
    if (build.paint.stripe !== null && build.paint.stripe !== undefined) {
        g.fillStyle = hex(build.paint.stripe);
        const sw = h * C.paint.stripeWidth;
        g.fillRect(0, (h - sw) / 2, w, sw);
    }
    if (build.number !== null && build.number !== undefined) {
        const cx = (1.6 * IN * w) / L;
        const r = h * 0.3;
        g.beginPath();
        g.arc(cx, h / 2, r, 0, Math.PI * 2);
        g.fillStyle = '#f8f6f0';
        g.fill();
        g.lineWidth = r * 0.12;
        g.strokeStyle = '#1a1a1a';
        g.stroke();
        g.save();
        // Read from the camera's side (+z), standing at the car's right.
        g.translate(cx, h / 2);
        g.rotate(-Math.PI / 2);
        g.fillStyle = '#1a1a1a';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = `900 ${r * 1.15}px system-ui, sans-serif`;
        g.fillText(String(build.number), 0, r * 0.06);
        g.restore();
    }
}

/** Whether a build wears anything a plain paint job does not show. */
export function hasLivery(build) {
    return Boolean(build.name) || (build.decals && build.decals.length > 0) || (build.number !== null && build.number !== undefined)
        || (build.paint && build.paint.stripe !== null && build.paint.stripe !== undefined);
}
