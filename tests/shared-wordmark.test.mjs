// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * shared-wordmark.test.mjs - the "SceneXP.com" mark in the corner of a
 * picture (www/shared/js/wordmark-1.0.0.js), promoted from Meme Studio on
 * 2026-10-29 for X's and O's photos.
 *
 * THE MEME'S MARK MUST NOT HAVE MOVED. The call log below was recorded from
 * www/meme/js/compose.js BEFORE the promotion, at two sizes, and the meme is
 * now drawn by the shared part: every property set and every call must match
 * it exactly, in order.
 */
import { describe, test, expect, beforeAll } from '@jest/globals';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

/** A 2D context that writes down everything done to it. */
function recording() {
    const log = [];
    const ctx = new Proxy({}, {
        set(t, k, v) { log.push(['set', k, v]); t[k] = v; return true; },
        get(t, k) { return k in t ? t[k] : (...args) => log.push([k, ...args]); },
    });
    return { ctx, log };
}

const FACE = 'Impact, "Arial Narrow Bold", "Roboto Condensed", sans-serif';
const before = (px, width, x, y) => [
    ['set', 'font', `bold ${px}px ${FACE}`],
    ['set', 'textAlign', 'right'],
    ['set', 'textBaseline', 'alphabetic'],
    ['set', 'lineJoin', 'round'],
    ['set', 'lineWidth', width],
    ['set', 'strokeStyle', '#000000'],
    ['set', 'fillStyle', '#ffffff'],
    ['strokeText', 'SceneXP.com', x, y],
    ['fillText', 'SceneXP.com', x, y],
];

let S;
let compose;
let MEME;

beforeAll(async () => {
    S = await import(join(root, 'www/shared/js/wordmark-1.0.0.js'));
    compose = await import(join(root, 'www/meme/js/compose.js'));
    ({ MEME_PAGE: MEME } = await import(join(root, 'www/meme/js/config.js')));
});

describe('Meme Studio draws the mark it drew before the promotion', () => {
    test('1080 by 1350 and 540 square, call for call', () => {
        const big = recording();
        expect(compose.drawWordmark(big.ctx, 1080, 1350, MEME.wordmark, MEME.caption))
            .toEqual({ x: 1039.5, y: 1309.5, px: 32 });
        expect(big.log).toEqual(before(32, 2.88, 1039.5, 1309.5));

        const small = recording();
        expect(compose.drawWordmark(small.ctx, 540, 540, MEME.wordmark, MEME.caption))
            .toEqual({ x: 523.8, y: 523.8, px: 13 });
        // 13 x 0.09, as the old code computed it, float and all.
        expect(small.log).toEqual(before(13, 13 * 0.09, 523.8, 523.8));
    });

    test('the meme\'s mark is still in the meme\'s caption face, whatever that face becomes', () => {
        // The defaults happen to be the meme's numbers, so only a different
        // face can show whether the meme's own is still the one handed over.
        const { ctx, log } = recording();
        compose.drawWordmark(ctx, 1080, 1350, { ...MEME.wordmark, text: 'X' },
            { ...MEME.caption, font: 'Georgia, serif', stroke: 0.2, fill: '#ff0000', outline: '#00ff00' });
        expect(log.slice(0, 7)).toEqual([
            ['set', 'font', 'bold 32px Georgia, serif'],
            ['set', 'textAlign', 'right'],
            ['set', 'textBaseline', 'alphabetic'],
            ['set', 'lineJoin', 'round'],
            ['set', 'lineWidth', 32 * 0.2],
            ['set', 'strokeStyle', '#00ff00'],
            ['set', 'fillStyle', '#ff0000'],
        ]);
        expect(log[7]).toEqual(['strokeText', 'X', 1039.5, 1309.5]);
    });

    test('the shared defaults are the meme\'s own numbers, so a scene passing only its text matches', () => {
        expect(S.WORDMARK.height).toBe(MEME.wordmark.height);
        expect(S.WORDMARK.inset).toBe(MEME.wordmark.inset);
        expect(S.WORDMARK.font).toBe(MEME.caption.font);
        expect(S.WORDMARK.stroke).toBe(MEME.caption.stroke);
        expect(S.WORDMARK.fill).toBe(MEME.caption.fill);
        expect(S.WORDMARK.outline).toBe(MEME.caption.outline);
        const { ctx, log } = recording();
        S.drawWordmark(ctx, 1080, 1350);
        expect(log).toEqual(before(32, 2.88, 1039.5, 1309.5));
    });
});

describe('the mark itself', () => {
    test('its own text, inside the bottom right corner, at a size that follows the picture', () => {
        for (const [w, h] of [[1080, 1350], [1080, 1080], [1200, 630], [200, 100]]) {
            const { ctx, log } = recording();
            const at = S.drawWordmark(ctx, w, h, { text: 'SceneXP.com/xo' });
            expect(at.px).toBe(Math.max(1, Math.round(h * S.WORDMARK.height)));
            expect(at.x).toBeCloseTo(w - h * S.WORDMARK.inset, 9);
            expect(at.y).toBeCloseTo(h - h * S.WORDMARK.inset, 9);
            // Outline under fill, both the scene's words.
            const drawn = log.filter((c) => c[0] === 'strokeText' || c[0] === 'fillText');
            expect(drawn.map((c) => `${c[0]} ${c[1]}`)).toEqual(['strokeText SceneXP.com/xo', 'fillText SceneXP.com/xo']);
        }
        // Never a zero-pixel font, however small the picture.
        expect(S.drawWordmark(recording().ctx, 10, 10).px).toBe(1);
        expect(S.wordmarkFont(20)).toBe(`bold 20px ${FACE}`);
        expect(Object.isFrozen(S.WORDMARK)).toBe(true);
    });
});
