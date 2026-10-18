// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * The receipt's QR code (www/whitestone/js/qr.js): byte mode, level M,
 * versions 1 to 10. Held to what the standard fixes rather than to the
 * encoder's own arithmetic: the published format strings for level M and
 * the version 7 string, every block's Reed-Solomon syndromes (evaluated at
 * the generator's roots, independently of how the remainder was made), the
 * finder, timing and dark modules, and a decoder written here from the
 * standard, which reads each code back to the text it was made from. A
 * phone camera on the receipt is Steve's QA.
 */
import {
    qrMatrix, qrSvgPath, capacity, versionFor, formatBits, versionBits, codewords, gfMul, gfExp, rsRemainder, penalty, MAX_VERSION
} from '../www/whitestone/js/qr.js';

/** Level M's format strings, masks 0 to 7, as the standard tables them. */
const FORMAT_M = ['101010000010010', '101000100100101', '101111001111100', '101101101001011',
    '100010111111001', '100000011001110', '100111110010111', '100101010100000'];

// ---- A decoder of the test's own ---------------------------------------------------

const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
const BLOCKS = [null, [10, [[1, 16]]], [16, [[1, 28]]], [26, [[1, 44]]], [18, [[2, 32]]], [24, [[2, 43]]],
    [16, [[4, 27]]], [18, [[4, 31]]], [22, [[2, 38], [2, 39]]], [22, [[3, 36], [2, 37]]], [26, [[4, 43], [1, 44]]]];
const MASK = [(i, j) => (i + j) % 2 === 0, (i) => i % 2 === 0, (i, j) => j % 3 === 0, (i, j) => (i + j) % 3 === 0,
    (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0, (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
    (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0, (i, j) => (((i + j) % 2) + ((i * j) % 3)) % 2 === 0];

/** Which modules are not data, from the standard's description. */
function isFunction(version, i, j) {
    const n = version * 4 + 17;
    const inFinder = (r0, c0) => i >= r0 - 1 && i <= r0 + 7 && j >= c0 - 1 && j <= c0 + 7;
    if (inFinder(0, 0) || inFinder(0, n - 7) || inFinder(n - 7, 0)) return true;
    if (i === 6 || j === 6) return true;
    if ((i === 8 && (j <= 8 || j >= n - 8)) || (j === 8 && (i <= 8 || i >= n - 8))) return true;
    if (version >= 7 && ((i < 6 && j >= n - 11 && j <= n - 9) || (j < 6 && i >= n - 11 && i <= n - 9))) return true;
    const pos = ALIGN[version];
    for (const r of pos) {
        for (const c of pos) {
            const corner = (r === 6 && c === 6) || (r === 6 && c === pos[pos.length - 1]) || (r === pos[pos.length - 1] && c === 6);
            if (!corner && Math.abs(i - r) <= 2 && Math.abs(j - c) <= 2) return true;
        }
    }
    return false;
}

/** The text in a matrix, with the checks a reader makes on the way. */
function decode(m) {
    const n = m.length;
    const version = (n - 17) / 4;
    // The first format copy, bit 14 first: row 8 left to right, then up column 8.
    const seq = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
    const fmt = seq.map(([i, j]) => (m[i][j] ? '1' : '0')).join('');
    // The second copy, also bit 14 first: up column 8 from the bottom, then along row 8 at the right.
    const seq2 = [...Array.from({ length: 7 }, (_, k) => [n - 1 - k, 8]), ...Array.from({ length: 8 }, (_, k) => [8, n - 8 + k])];
    const fmt2 = seq2.map(([i, j]) => (m[i][j] ? '1' : '0')).join('');
    const mask = FORMAT_M.indexOf(fmt);
    // Read the zigzag.
    const bits = [];
    let up = true;
    for (let right = n - 1; right >= 1; right -= 2) {
        if (right === 6) right = 5;
        for (let k = 0; k < n; k++) {
            const i = up ? n - 1 - k : k;
            for (const j of [right, right - 1]) {
                if (!isFunction(version, i, j)) bits.push(m[i][j] !== MASK[mask](i, j));
            }
        }
        up = !up;
    }
    const total = BLOCKS[version][1].reduce((t, [c, s]) => t + c * s, 0) + BLOCKS[version][0] * BLOCKS[version][1].reduce((t, [c]) => t + c, 0);
    const words = Array.from({ length: total }, (_, k) => bits.slice(k * 8, k * 8 + 8).reduce((v, b) => (v << 1) | (b ? 1 : 0), 0));
    // De-interleave.
    const [ec, groups] = BLOCKS[version];
    const sizes = groups.flatMap(([c, s]) => Array(c).fill(s));
    const blocks = sizes.map(() => []);
    let at = 0;
    for (let k = 0; k < Math.max(...sizes); k++) sizes.forEach((s, b) => { if (k < s) blocks[b].push(words[at++]); });
    for (let k = 0; k < ec; k++) blocks.forEach((b) => b.push(words[at++]));
    const syndromesZero = blocks.every((b) => syndromes(b, ec).every((x) => x === 0));
    const data = blocks.flatMap((b, k) => b.slice(0, sizes[k]));
    // Byte mode, a count, the bytes.
    const stream = data.flatMap((w) => Array.from({ length: 8 }, (_, k) => (w >>> (7 - k)) & 1));
    const read = (from, len) => stream.slice(from, from + len).reduce((v, b) => (v << 1) | b, 0);
    const mode = read(0, 4);
    const countBits = version < 10 ? 8 : 16;
    const count = read(4, countBits);
    const bytes = Array.from({ length: count }, (_, k) => read(4 + countBits + k * 8, 8));
    return { version, mask, fmt, fmt2, mode, syndromesZero, text: new TextDecoder().decode(new Uint8Array(bytes)) };
}

/** A codeword's value at each of the generator's roots: all zero when the
 *  error correction is right. */
function syndromes(block, ec) {
    return Array.from({ length: ec }, (_, i) => block.reduce((acc, w) => gfMul(acc, gfExp(i)) ^ w, 0));
}

const LINK = 'http://localhost:8000/whitestone/tasks/?c=AbCdEfGhIjKlMnOpQrStUv#k=0123456789abcdefghijklmnopqrstuvwxyzABCDEFG';

describe('what the standard fixes', () => {
    test('the format strings for level M, every mask', () => {
        for (let mask = 0; mask < 8; mask++) expect(formatBits(mask).toString(2).padStart(15, '0')).toBe(FORMAT_M[mask]);
    });

    test('the version information for version 7 to 10', () => {
        expect(versionBits(7).toString(2).padStart(18, '0')).toBe('000111110010010100');
        expect(versionBits(8).toString(2).padStart(18, '0')).toBe('001000010110111100');
        expect(versionBits(9).toString(2).padStart(18, '0')).toBe('001001101010011001');
        expect(versionBits(10).toString(2).padStart(18, '0')).toBe('001010010011010011');
    });

    test('byte capacities at level M, versions 1 to 10', () => {
        expect(Array.from({ length: MAX_VERSION }, (_, i) => capacity(i + 1))).toEqual([14, 26, 42, 62, 84, 106, 122, 152, 180, 213]);
        expect(versionFor(14)).toBe(1);
        expect(versionFor(15)).toBe(2);
        expect(versionFor(213)).toBe(10);
        expect(versionFor(214)).toBeNull();
        expect(() => qrMatrix('x'.repeat(214))).toThrow();
    });

    test('Reed-Solomon: every block of every version has zero syndromes', () => {
        for (let v = 1; v <= MAX_VERSION; v++) {
            const bytes = [...new TextEncoder().encode('Whitestone '.repeat(30).slice(0, capacity(v)))];
            const { blocks } = codewords(bytes, v);
            for (const b of blocks) expect(syndromes([...b.data, ...b.ec], b.ec.length).every((x) => x === 0)).toBe(true);
        }
        // The data is padded as the standard pads it: 0xEC and 0x11 in turn
        // after the message and its terminator.
        const { blocks } = codewords([...new TextEncoder().encode('Hi')], 1);
        expect(blocks[0].data.slice(4)).toEqual([236, 17, 236, 17, 236, 17, 236, 17, 236, 17, 236, 17]);
        // A changed byte is caught.
        const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
        const ec = rsRemainder(data, 10);
        const bad = [...data, ...ec];
        bad[3] ^= 1;
        expect(syndromes(bad, 10).some((x) => x !== 0)).toBe(true);
    });
});

describe('codes that read back', () => {
    test.each([['a word', 'Hi'], ['the share link', LINK], ['the longest v10 holds', 'w'.repeat(213)], ['UTF-8', 'Café ✓']])('%s', (_name, text) => {
        const q = qrMatrix(text);
        expect(q.size).toBe(q.version * 4 + 17);
        expect(q.modules).toHaveLength(q.size);
        const d = decode(q.modules);
        expect(d.fmt).toBe(FORMAT_M[q.mask]);
        expect(d.fmt2).toBe(FORMAT_M[q.mask]);
        expect(d.mode).toBe(0b0100);
        expect(d.syndromesZero).toBe(true);
        expect(d.text).toBe(text);
        // The fixed patterns: the finders' corners, timing, and the dark module.
        const m = q.modules;
        const n = q.size;
        for (const [r, c] of [[0, 0], [0, n - 1], [n - 1, 0], [6, 6], [3, 3]]) expect(m[r][c]).toBe(true);
        for (const [r, c] of [[1, 1], [7, 7], [n - 8, 7]]) expect(m[r][c]).toBe(false);
        for (let k = 8; k < n - 8; k++) expect([m[6][k], m[k][6]]).toEqual([k % 2 === 0, k % 2 === 0]);
        expect(m[n - 8][8]).toBe(true);
    });

    test('the share link is a version 7, with its version blocks in both corners', () => {
        const q = qrMatrix(LINK);
        expect(q.version).toBe(7);
        const bits = versionBits(7);
        for (let k = 0; k < 18; k++) {
            const on = ((bits >>> k) & 1) === 1;
            expect(q.modules[Math.floor(k / 3)][q.size - 11 + (k % 3)]).toBe(on);
            expect(q.modules[q.size - 11 + (k % 3)][Math.floor(k / 3)]).toBe(on);
        }
    });

    test('the mask chosen has the lowest penalty of the eight', () => {
        const q = qrMatrix(LINK);
        expect(penalty(q.modules)).toBeGreaterThan(0);
        expect(q.mask).toBeGreaterThanOrEqual(0);
        expect(q.mask).toBeLessThan(8);
    });
});

describe('drawn as one SVG path', () => {
    test('every dark module, and nothing else, inside the quiet zone', () => {
        const q = qrMatrix('Hi');
        const d = qrSvgPath(q, 4);
        const rects = [...d.matchAll(/M(\d+) (\d+)h(\d+)v1h-(\d+)z/g)].map((x) => x.slice(1).map(Number));
        const dark = new Set();
        for (const [x, y, w, back] of rects) {
            expect(back).toBe(w);
            for (let k = 0; k < w; k++) dark.add(`${y - 4},${x - 4 + k}`);
        }
        const want = new Set();
        q.modules.forEach((row, r) => row.forEach((on, c) => { if (on) want.add(`${r},${c}`); }));
        expect(dark).toEqual(want);
        expect(d).not.toMatch(/[<>"']/);
    });
});
