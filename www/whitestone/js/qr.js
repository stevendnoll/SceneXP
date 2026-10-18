// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * qr.js - A small QR code encoder for the receipt's link (PRD 13.1): byte
 * mode, error correction level M, versions 1 to 10 (up to 213 bytes, and a
 * share link is about 110). ISO/IEC 18004, written out here because the
 * site takes no libraries or CDNs.
 *
 *   qrMatrix(text)  { size, version, mask, modules }, modules[row][col]
 *                   true for dark, quiet zone not included
 *   qrSvgPath(m)    one SVG path of the dark modules, for an <svg> built
 *                   with createElementNS (never markup from a string)
 *
 * Pure. The suite checks it against what the standard fixes (the format
 * and version strings, every block's Reed-Solomon syndromes) and reads it
 * back with a decoder of its own; a phone camera is Steve's QA.
 */

// ---- The tables for level M ----------------------------------------------------

/** Per version: [EC codewords per block, [[blocks, data codewords each], ...]]. */
const BLOCKS_M = [
    null,
    [10, [[1, 16]]], [16, [[1, 28]]], [26, [[1, 44]]], [18, [[2, 32]]], [24, [[2, 43]]],
    [16, [[4, 27]]], [18, [[4, 31]]], [22, [[2, 38], [2, 39]]], [22, [[3, 36], [2, 37]]], [26, [[4, 43], [1, 44]]]
];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
export const MAX_VERSION = 10;

export function dataCodewords(version) {
    return BLOCKS_M[version][1].reduce((n, [count, size]) => n + count * size, 0);
}

/** How many bytes a version holds in byte mode at level M. */
export function capacity(version) {
    const countBits = version < 10 ? 8 : 16;
    return Math.floor((dataCodewords(version) * 8 - 4 - countBits) / 8);
}

// ---- Reed-Solomon over GF(256), polynomial 0x11D -----------------------------------

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
    let x = 1;
    for (let i = 0; i < 255; i++) {
        EXP[i] = x;
        LOG[x] = i;
        x <<= 1;
        if (x & 0x100) x ^= 0x11D;
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
export const gfMul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
export const gfExp = (i) => EXP[((i % 255) + 255) % 255];

/** The generator polynomial of degree n, highest power first. */
function generator(n) {
    let g = [1];
    for (let i = 0; i < n; i++) {
        const next = new Array(g.length + 1).fill(0);
        for (let j = 0; j < g.length; j++) {
            next[j] ^= g[j];
            next[j + 1] ^= gfMul(g[j], EXP[i]);
        }
        g = next;
    }
    return g;
}

/** The n error correction codewords for `data`. */
export function rsRemainder(data, n) {
    const g = generator(n);
    const rem = new Array(n).fill(0);
    for (const byte of data) {
        const factor = byte ^ rem[0];
        rem.shift();
        rem.push(0);
        for (let i = 0; i < n; i++) rem[i] ^= gfMul(g[i + 1], factor);
    }
    return rem;
}

// ---- The bit stream ----------------------------------------------------------------

/** The smallest version that holds `bytes`, or null. */
export function versionFor(length) {
    for (let v = 1; v <= MAX_VERSION; v++) if (length <= capacity(v)) return v;
    return null;
}

/** Mode, count, data, terminator and padding, as the version's data codewords. */
function dataStream(bytes, version) {
    const bits = [];
    const put = (value, n) => { for (let i = n - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
    put(0b0100, 4);
    put(bytes.length, version < 10 ? 8 : 16);
    for (const b of bytes) put(b, 8);
    const total = dataCodewords(version) * 8;
    put(0, Math.min(4, total - bits.length));
    while (bits.length % 8) bits.push(0);
    const out = [];
    for (let i = 0; i < bits.length; i += 8) out.push(bits.slice(i, i + 8).reduce((v, b) => (v << 1) | b, 0));
    for (let pad = 0; out.length < dataCodewords(version); pad++) out.push(pad % 2 ? 0x11 : 0xEC);
    return out;
}

/** The data split into blocks, each with its error correction, interleaved. */
export function codewords(bytes, version) {
    const data = dataStream(bytes, version);
    const [ec, groups] = BLOCKS_M[version];
    const blocks = [];
    let at = 0;
    for (const [count, size] of groups) {
        for (let i = 0; i < count; i++) {
            const d = data.slice(at, at + size);
            at += size;
            blocks.push({ data: d, ec: rsRemainder(d, ec) });
        }
    }
    const out = [];
    const longest = Math.max(...blocks.map((b) => b.data.length));
    for (let i = 0; i < longest; i++) for (const b of blocks) if (i < b.data.length) out.push(b.data[i]);
    for (let i = 0; i < ec; i++) for (const b of blocks) out.push(b.ec[i]);
    return { codewords: out, blocks };
}

// ---- Format and version information ------------------------------------------------

function bch(value, poly, polyBits) {
    let v = value << (polyBits - 1);
    for (let i = 31; i >= polyBits - 1; i--) if ((v >>> i) & 1) v ^= poly << (i - polyBits + 1);
    return v;
}

/** The 15 format bits for level M (bits 00) and a mask. */
export function formatBits(mask) {
    const data = (0b00 << 3) | mask;
    return ((data << 10) | bch(data, 0x537, 11)) ^ 0x5412;
}

/** The 18 version bits (versions 7 and up). */
export function versionBits(version) {
    return (version << 12) | bch(version, 0x1F25, 13);
}

// ---- The matrix --------------------------------------------------------------------

const MASKS = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
];
export const maskAt = (mask, r, c) => MASKS[mask](r, c);

/** The fixed patterns of a version: { size, dark, reserved }, each a grid. */
export function functionPatterns(version) {
    const size = version * 4 + 17;
    const dark = Array.from({ length: size }, () => new Array(size).fill(false));
    const reserved = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (r, c, on) => {
        if (r < 0 || c < 0 || r >= size || c >= size) return;
        dark[r][c] = on;
        reserved[r][c] = true;
    };
    // Finders and their separators.
    for (const [r0, c0] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
        for (let r = -1; r <= 7; r++) {
            for (let c = -1; c <= 7; c++) {
                const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3));
                set(r0 + r, c0 + c, ring !== 2 && ring !== 4 && r >= 0 && r <= 6 && c >= 0 && c <= 6);
            }
        }
    }
    // Timing.
    for (let i = 8; i < size - 8; i++) {
        set(6, i, i % 2 === 0);
        set(i, 6, i % 2 === 0);
    }
    // Alignment: every pair of its positions but the three a finder holds
    // (they cross the timing lines from version 7, as the standard has it).
    const pos = ALIGN[version];
    const last = pos[pos.length - 1];
    for (const r of pos) {
        for (const c of pos) {
            if ((r === 6 && c === 6) || (r === 6 && c === last) || (r === last && c === 6)) continue;
            for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
        }
    }
    // The format areas (written later), and the dark module.
    for (let i = 0; i < 9; i++) {
        if (!reserved[8][i]) reserved[8][i] = true;
        if (!reserved[i][8]) reserved[i][8] = true;
    }
    for (let i = 0; i < 8; i++) {
        reserved[8][size - 1 - i] = true;
        reserved[size - 1 - i][8] = true;
    }
    set(size - 8, 8, true);
    // The version areas.
    if (version >= 7) {
        const bits = versionBits(version);
        for (let i = 0; i < 18; i++) {
            const on = ((bits >>> i) & 1) === 1;
            const a = Math.floor(i / 3);
            const b = (i % 3) + size - 11;
            set(a, b, on);
            set(b, a, on);
        }
    }
    return { size, dark, reserved };
}

/** Where each data bit goes, in order: [row, col] pairs, two columns at a
 *  time from the bottom right, zigzagging, the timing column skipped. */
export function dataPositions(version) {
    const { size, reserved } = functionPatterns(version);
    const out = [];
    let upward = true;
    for (let right = size - 1; right >= 1; right -= 2) {
        if (right === 6) right = 5;
        for (let k = 0; k < size; k++) {
            const r = upward ? size - 1 - k : k;
            for (const c of [right, right - 1]) if (!reserved[r][c]) out.push([r, c]);
        }
        upward = !upward;
    }
    return out;
}

/** The format bits, twice (bit 0 the lowest): down column 8 and along row
 *  8 round the top-left finder, then along row 8 at the top right and up
 *  column 8 at the bottom left, beside the dark module. */
function writeFormat(dark, size, mask) {
    const bits = formatBits(mask);
    const bit = (i) => ((bits >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) dark[i][8] = bit(i);
    dark[7][8] = bit(6);
    dark[8][8] = bit(7);
    dark[8][7] = bit(8);
    for (let i = 9; i < 15; i++) dark[8][14 - i] = bit(i);
    for (let i = 0; i < 8; i++) dark[8][size - 1 - i] = bit(i);
    for (let i = 8; i < 15; i++) dark[size - 15 + i][8] = bit(i);
    dark[size - 8][8] = true;
}

/** The standard's four penalties for a finished matrix. */
export function penalty(m) {
    const size = m.length;
    let score = 0;
    const line = (get) => {
        for (let a = 0; a < size; a++) {
            let run = 1;
            for (let b = 1; b < size; b++) {
                if (get(a, b) === get(a, b - 1)) {
                    run++;
                    if (run === 5) score += 3;
                    else if (run > 5) score += 1;
                } else {
                    run = 1;
                }
            }
            for (let b = 0; b + 10 < size; b++) {
                const seq = Array.from({ length: 11 }, (_, i) => get(a, b + i));
                const p1 = [true, false, true, true, true, false, true, false, false, false, false];
                const p2 = [false, false, false, false, true, false, true, true, true, false, true];
                if (seq.every((v, i) => v === p1[i]) || seq.every((v, i) => v === p2[i])) score += 40;
            }
        }
    };
    line((r, c) => m[r][c]);
    line((c, r) => m[r][c]);
    for (let r = 0; r + 1 < size; r++) {
        for (let c = 0; c + 1 < size; c++) {
            const v = m[r][c];
            if (m[r][c + 1] === v && m[r + 1][c] === v && m[r + 1][c + 1] === v) score += 3;
        }
    }
    const darkCount = m.reduce((n, row) => n + row.filter(Boolean).length, 0);
    score += Math.floor(Math.abs((darkCount * 100) / (size * size) - 50) / 5) * 10;
    return score;
}

/**
 * The QR code of `text` (UTF-8): `{ size, version, mask, modules }`, the
 * mask with the lowest penalty. Throws past version 10's capacity.
 */
export function qrMatrix(text) {
    const bytes = [...new TextEncoder().encode(String(text))];
    const version = versionFor(bytes.length);
    if (!version) throw new Error('too long for a QR code here');
    const { size, dark } = functionPatterns(version);
    const { codewords: words } = codewords(bytes, version);
    const bits = words.flatMap((w) => Array.from({ length: 8 }, (_, i) => ((w >>> (7 - i)) & 1) === 1));
    const positions = dataPositions(version);
    let best = null;
    for (let mask = 0; mask < 8; mask++) {
        const m = dark.map((row) => row.slice());
        positions.forEach(([r, c], i) => { m[r][c] = (i < bits.length ? bits[i] : false) !== maskAt(mask, r, c); });
        writeFormat(m, size, mask);
        const p = penalty(m);
        if (!best || p < best.p) best = { p, mask, modules: m };
    }
    return { size, version, mask: best.mask, modules: best.modules };
}

/** The dark modules as one SVG path (one unit per module, offset by the
 *  quiet zone `quiet`), runs along each row merged. */
export function qrSvgPath(matrix, quiet = 4) {
    const parts = [];
    matrix.modules.forEach((row, r) => {
        for (let c = 0; c < row.length; c++) {
            if (!row[c]) continue;
            let end = c;
            while (end + 1 < row.length && row[end + 1]) end++;
            parts.push(`M${c + quiet} ${r + quiet}h${end - c + 1}v1h-${end - c + 1}z`);
            c = end;
        }
    });
    return parts.join('');
}
