// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Text contrast on Tornado Alley's welcome and pause card.
 *
 * The card's words sit straight on a translucent scrim over the running
 * scene, so their contrast is whatever the scene is doing behind them, and
 * the pause card can come up at any moment: over the white funnel, over the
 * golden horizon. The backdrop below is MEASURED, not chosen: the social
 * card's capture of the mature tornado (specs/twister/og-tornado-capture.png,
 * converted to sRGB), cropped to the card's column and cut into seven bands
 * top to bottom, taking the brightest 1% of pixels in each (so a stray
 * highlight does not decide it, and the funnel does).
 *
 * THE COLORS ARE READ OUT OF THE STYLESHEETS, the player's defaults and then
 * this scene's overrides, so changing a token is what this checks. Restating
 * them here would pass whatever the page did (accessibility pass 2026-09-23,
 * which found three of them under 4.5:1 with High Water's values).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = (rel) => readFileSync(join(process.cwd(), rel), 'utf8');

/** The custom properties set in a sheet's :root blocks. */
function tokens(text) {
    const out = {};
    for (const block of text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/:root\s*\{([^}]*)\}/g)) {
        for (const m of block[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
    }
    return out;
}

const TOKENS = {
    ...tokens(css('www/shared/css/player-1.0.0.css')),
    ...tokens(css('www/tornado/css/experience.css'))
};

/** [r, g, b, a] from #rrggbb or rgba(r, g, b, a). */
function color(value) {
    const hex = value.match(/^#([0-9a-f]{6})$/i);
    if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)).concat(1);
    const rgba = value.match(/^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)$/);
    if (rgba) return [+rgba[1], +rgba[2], +rgba[3], rgba[4] === undefined ? 1 : +rgba[4]];
    throw new Error(`not a color: ${value}`);
}

const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const luminance = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const over = ([r, g, b, a], ground) => [r, g, b].map((c, i) => c * a + ground[i] * (1 - a));
const ratio = (a, b) => {
    const [x, y] = [luminance(a), luminance(b)];
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

// Top to bottom: the brightest 1% behind the card's column, band by band,
// from the capture of the mature tornado. The funnel is the upper bands, the
// golden horizon the lower.
const BACKDROP = [
    [171, 171, 173], [186, 186, 187], [181, 182, 183], [185, 185, 186],
    [176, 176, 179], [209, 194, 158], [222, 193, 157]
];

/** What a band looks like through the scrim, which runs from its top color to
 *  its bottom color down the card. */
function ground(i) {
    const top = color(TOKENS['--player-scrim-top']);
    const bottom = color(TOKENS['--player-scrim-bottom']);
    const k = (i + 0.5) / BACKDROP.length;
    const scrim = top.map((c, j) => c + (bottom[j] - c) * k);
    return over(scrim, BACKDROP[i]);
}

// Every text color on the card, and how the warning's own faint panel lifts
// what is behind it (rgba(255, 255, 255, 0.05) in the player's sheet).
const TEXT = [
    { token: '--player-ink', what: 'the heading and buttons' },
    { token: '--player-soft', what: 'the lede' },
    { token: '--player-muted', what: 'the warning', panel: 0.05 },
    { token: '--player-dim', what: 'the "Paused at" line' },
    { token: '--player-faint', what: 'the closing note' }
];

describe('THE CARD\'S TEXT READS OVER THE BRIGHTEST STORM BEHIND IT', () => {
    test.each(TEXT)('$what ($token) is at least 4.5:1 in every band', ({ token, panel }) => {
        expect(TOKENS[token]).toBeDefined();
        const fg = color(TOKENS[token]);
        let worst = Infinity;
        BACKDROP.forEach((_, i) => {
            let g = ground(i);
            if (panel) g = over([255, 255, 255, panel], g);
            worst = Math.min(worst, ratio(fg, g));
        });
        expect({ [token]: Number(worst.toFixed(2)) >= 4.5 }).toEqual({ [token]: true });
    });

    test('the grays keep their order, so the card still reads top to bottom', () => {
        const L = TEXT.map(({ token }) => luminance(color(TOKENS[token])));
        for (let i = 1; i < L.length; i++) expect(L[i]).toBeLessThan(L[i - 1]);
    });

    test('the warning panel is still the faint one this measures', () => {
        expect(css('www/shared/css/player-1.0.0.css'))
            .toMatch(/#player-card \.warning \{[^}]*background: rgba\(255, 255, 255, 0\.05\)/);
    });
});
