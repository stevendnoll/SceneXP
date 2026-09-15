// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Team colors: the saved choice and the arithmetic that keeps it readable.
 *
 * colors.js is pure, so everything a visitor can pick is checked here with plain
 * strings: that a broken save cannot break the game, that a helmet follows its
 * jersey until it is given its own color, and that whatever the jerseys are, the
 * letters on them, the card stunt and the fireworks can still be seen.
 */
import { describe, test, expect, beforeEach } from '@jest/globals';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { installThree } from './helpers/three-stub.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const scene = join(here, '..', 'www', 'xo', 'js');

installThree();

const { XO_CONFIG: CFG } = await import(join(scene, 'config.min.js'));
// The source, for coverage. The card stunt reads the built copy, which is a
// separate module with its own state, so that test sets the built one.
const C = await import(join(scene, 'colors.js'));
const Built = await import(join(scene, 'colors.min.js'));
const { cardAt } = await import(join(scene, 'stunt.min.js'));
const { hexToRgb } = await import(join(scene, 'fireworks.min.js'));

const KEY = CFG.storage.colors;
const store = () => {
    const map = new Map();
    return {
        map,
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => map.set(k, String(v)),
        removeItem: (k) => map.delete(k),
    };
};

/** A sweep of jerseys a visitor might plausibly pick, dark to light, every hue. */
const SWEEP = [];
for (let r = 0; r < 256; r += 51) {
    for (let g = 0; g < 256; g += 51) {
        for (let b = 0; b < 256; b += 51) {
            SWEEP.push(`#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`);
        }
    }
}

beforeEach(() => {
    globalThis.localStorage = store();
    C.resetColors();
});

describe('the choice', () => {
    test('starts as the game\'s own colors', () => {
        expect(C.teamColors()).toEqual({
            teams: { 0: { jersey: '#ff992c', helmet: null }, 1: { jersey: '#9bcfff', helmet: null } },
            field: '#1f5c2e',
        });
        expect(C.isDefault()).toBe(true);
    });

    test('a helmet follows its jersey until it is given a color, and goes back on null', () => {
        C.setColors({ teams: { 0: { jersey: '#4b2e83' } } });
        expect(C.helmetOf(0)).toBe('#4b2e83');
        C.setColors({ teams: { 0: { helmet: '#ffb612' } } });
        expect(C.helmetOf(0)).toBe('#ffb612');
        C.setColors({ teams: { 0: { jersey: '#000000' } } });
        expect(C.helmetOf(0)).toBe('#ffb612');
        C.setColors({ teams: { 0: { helmet: null } } });
        expect(C.helmetOf(0)).toBe('#000000');
    });

    test('anything that is not a color is refused and changes nothing', () => {
        C.setColors({ teams: { 1: { jersey: 'purple' } }, field: 12 });
        expect(C.jerseyOf(1)).toBe('#9bcfff');
        expect(C.fieldColor()).toBe('#1f5c2e');
        expect(C.normalHex('#ABC')).toBe('#aabbcc');
        expect(C.normalHex(' #FFB612 ')).toBe('#ffb612');
        expect(C.normalHex('#ffb61')).toBeNull();
    });

    test('what is handed out is a copy', () => {
        const copy = C.teamColors();
        copy.teams[0].jersey = '#000000';
        expect(C.jerseyOf(0)).toBe('#ff992c');
    });
});

describe('the saved choice', () => {
    test('is kept, and read back', () => {
        C.setColors({ teams: { 0: { jersey: '#4b2e83', helmet: '#000000' }, 1: { jersey: '#ffb612' } } });
        expect(C.saveColors()).toBe(true);
        C.resetColors();
        C.loadColors();
        expect(C.jerseyOf(0)).toBe('#4b2e83');
        expect(C.helmetOf(0)).toBe('#000000');
        expect(C.jerseyOf(1)).toBe('#ffb612');
    });

    test('is removed rather than written when it is the game\'s own again', () => {
        C.setColors({ teams: { 0: { jersey: '#4b2e83' } } });
        C.saveColors();
        expect(localStorage.map.has(KEY)).toBe(true);
        C.resetColors();
        C.saveColors();
        expect(localStorage.map.has(KEY)).toBe(false);
    });

    test('a broken, foreign or future file is the game\'s own colors', () => {
        for (const raw of ['{not json', JSON.stringify({ v: 2, teams: { 0: { jersey: '#000000' } } }),
            JSON.stringify({ v: 1, teams: { 0: { jersey: 'red', helmet: 7 } }, field: null })]) {
            localStorage.setItem(KEY, raw);
            C.loadColors();
            expect(C.isDefault()).toBe(true);
        }
    });

    test('storage that refuses does not stop the game', () => {
        globalThis.localStorage = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); } };
        expect(() => C.loadColors()).not.toThrow();
        C.setColors({ teams: { 0: { jersey: '#4b2e83' } } });
        expect(C.saveColors()).toBe(false);
        expect(C.jerseyOf(0)).toBe('#4b2e83');
    });
});

describe('the arithmetic', () => {
    test('the game\'s own teams keep the fan shades and white letters they were tuned with', () => {
        expect(C.shadesOf('#ff992c')).toEqual(CFG.crowd.shirts[0]);
        expect(C.shadesOf('#9bcfff')).toEqual(CFG.crowd.shirts[1]);
        expect(C.markInk('#ff992c')).toBe('#ffffff');
        expect(C.markInk('#9bcfff')).toBe('#ffffff');
    });

    test('every jersey\'s fans wear three shades that can be told apart, even black and white', () => {
        for (const hex of [...SWEEP, '#000000', '#ffffff']) {
            const [a, b, c] = C.shadesOf(hex);
            expect(a).toBe(hex);
            expect(C.difference(a, b)).toBeGreaterThan(0.03);
            expect(C.difference(a, c)).toBeGreaterThan(0.03);
        }
    });

    test('a light jersey gets a dark letter, and every letter reads on its jersey', () => {
        expect(C.markInk('#ffffff')).toBe(CFG.colors.darkMark);
        expect(C.markInk('#ffff00')).toBe(CFG.colors.darkMark);
        for (const hex of SWEEP) {
            expect({ hex, reads: C.contrast(hex, C.markInk(hex)) >= CFG.colors.markSwitch })
                .toEqual({ hex, reads: true });
        }
    });

    test('the card stunt\'s letters read on cards of any jersey color', () => {
        expect(C.cardInks('#ff992c').on).toBe(CFG.milestones.finale.cards.navy);
        for (const hex of SWEEP) {
            const { card, on } = C.cardInks(hex);
            expect({ hex, reads: C.contrast(card, on) >= 4.5 }).toEqual({ hex, reads: true });
        }
    });

    test('a team color as a firework is always bright enough to show, and keeps a bright one as it is', () => {
        // Pure blue cannot be that bright at full strength on a screen, which is
        // what made this fail first: it now gives up some strength to get there.
        for (const hex of [...SWEEP, '#0000ff', '#000000']) {
            expect(C.oklab(C.sparkInk(hex))[0]).toBeGreaterThanOrEqual(CFG.colors.sparkLightness - 0.02);
        }
        expect(C.sparkInk('#ff992c')).toBe('#ff992c');
    });

    test('a palette gets the chosen jerseys in place of the game\'s own, and nothing else changes', () => {
        C.setColors({ teams: { 0: { jersey: '#241773' }, 1: { jersey: '#ffb612' } } });
        const palette = CFG.milestones.fireworks.palette;
        const plain = C.withTeamColors(palette);
        expect(plain).toEqual(palette.map((h) => (h === '#ff992c' ? '#241773' : (h === '#9bcfff' ? '#ffb612' : h))));
        const spark = C.withTeamColors(palette, { spark: true });
        expect(spark[palette.indexOf('#ff992c')]).toBe(C.sparkInk('#241773'));
    });
});

describe('the card stunt wears the home team\'s color', () => {
    test('its cards are the X\'s jersey and its letters the ink that reads on it', () => {
        Built.setColors({ teams: { 0: { jersey: '#241773' } } });
        const F = CFG.milestones.finale;
        const messages = { perfect: new Set(['0:0']), five: new Set() };
        const t = F.perfect[1] + 1;
        const lit = cardAt(t, 0, 0, 10, messages, { calm: true });
        const dark = cardAt(t, 0, 1, 10, messages, { calm: true });
        const want = Built.cardInks('#241773');
        expect(dark.colour).toEqual(hexToRgb(want.card));
        expect(lit.colour).toEqual(hexToRgb(want.on));
        expect(want.on).not.toBe(CFG.milestones.finale.cards.navy);
        Built.resetColors();
    });
});

/**
 * THE PAIRS THE WARNING THRESHOLDS WERE SET AGAINST, straight from the table in
 * config (`colors.warnTeams`). A retune that stops warning about two navies,
 * or starts warning about the game's own orange and light blue, fails here.
 */
const LOOK_ALIKE = [
    ['#4f2683', '#461d7c'], ['#041e42', '#002244'], ['#e31837', '#d50a0a'], ['#241773', '#4f2683'],
    ['#241773', '#101820'], ['#fb4f14', '#ff992c'], ['#000000', '#0b162a'], ['#ffb612', '#ffb612'],
];
const APART = [
    ['#ff992c', '#9bcfff'], ['#241773', '#ffb612'], ['#ff992c', '#e31837'], ['#008e97', '#9bcfff'],
    ['#ffffff', '#a5acaf'], ['#e31837', '#0b162a'],
];
const GREEN_ON_GREEN = ['#203731', '#004c54', '#125740'];
const SHOWS_ON_GREEN = ['#ff992c', '#9bcfff', '#241773', '#101820', '#69be28', '#0b162a', '#e31837', '#ffffff'];

const choice = (x, o, field = '#1f5c2e') => ({ teams: { 0: { jersey: x }, 1: { jersey: o } }, field });

describe('the warnings', () => {
    test('the game\'s own colors say nothing', () => {
        expect(C.warningsFor(C.teamColors())).toEqual([]);
    });

    test('jerseys that look alike on the field are mentioned, and ones that do not are not', () => {
        for (const [x, o] of LOOK_ALIKE) {
            expect({ x, o, kinds: C.warningsFor(choice(x, o, '#ffffff')).map((w) => w.kind) })
                .toEqual({ x, o, kinds: ['teams'] });
        }
        for (const [x, o] of APART) {
            expect({ x, o, kinds: C.warningsFor(choice(x, o, '#777777')).filter((w) => w.kind === 'teams') })
                .toEqual({ x, o, kinds: [] });
        }
    });

    test('a jersey the color of the field is mentioned, by team, or both at once', () => {
        for (const green of GREEN_ON_GREEN) {
            const one = C.warningsFor(choice(green, '#ff992c'));
            expect(one.map((w) => w.kind)).toEqual(['field']);
            expect(one[0].text).toContain('The X\'s jerseys');
        }
        for (const jersey of SHOWS_ON_GREEN) {
            expect({ jersey, field: C.warningsFor(choice(jersey, '#9bcfff')).filter((w) => w.kind === 'field') })
                .toEqual({ jersey, field: [] });
        }
        const both = C.warningsFor(choice('#0033a0', '#002d8f', '#0033a0'));
        expect(both.map((w) => w.kind)).toEqual(['teams', 'field']);
        expect(both[1].text).toMatch(/^Both jerseys/);
        expect(C.warningsFor(choice('#ff992c', '#125740'))[0].text).toContain('The O\'s jerseys');
    });

    /**
     * WHAT A VISITOR READS: American spelling and vocabulary (Steve's standing
     * rule, and the source around it spells `colour`), no team names, and no
     * semicolons or em dashes in the house style.
     */
    test('are written the way the rest of the site is', () => {
        const texts = [
            ...C.warningsFor(choice('#4f2683', '#461d7c', '#4f2683')),
            ...C.warningsFor(choice('#125740', '#ff992c')),
            ...C.warningsFor(choice('#ff992c', '#125740')),
        ].map((w) => w.text);
        expect(texts.length).toBeGreaterThanOrEqual(4);
        for (const text of texts) {
            expect(text).not.toMatch(/colour|favour|centre|grey|realis|organis|behaviour/i);
            expect(text).not.toMatch(/[;\u2014]/);
            expect(text).not.toMatch(/Mongoose|Crows/);
            expect(text).toMatch(/\.$/);
        }
    });
});

/** Field colors across the wheel and from black to white. */
const FIELDS = [];
for (let r = 0; r < 256; r += 85) {
    for (let g = 0; g < 256; g += 85) {
        for (let b = 0; b < 256; b += 85) {
            FIELDS.push(`#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`);
        }
    }
}

describe('the field from one color', () => {
    test('today\'s green is today\'s field, value for value', () => {
        const T = CFG.turf;
        expect(C.turfFrom('#1f5c2e')).toEqual({
            grass: T.grass, stripe: T.stripe, paint: T.paint, ladderInk: T.ladderInk,
            scrimmage: T.scrimmage, endZone: T.endZone, apron: '#113a1b',
        });
    });

    test('whatever the field, its lines, numbers, scrimmage line and end zones can be seen on it', () => {
        const K = CFG.colors;
        for (const field of [...FIELDS, '#0033a0', '#c8102e', '#4b2e83', '#ffcc00', '#f2f2f2']) {
            const t = C.turfFrom(field);
            expect({ field, paint: C.contrast(field, t.paint) >= K.paintContrast }).toEqual({ field, paint: true });
            expect({ field, scrimmage: C.contrast(field, t.scrimmage) >= K.scrimmageContrast })
                .toEqual({ field, scrimmage: true });
            expect({ field, endZone: C.difference(field, t.endZone) >= K.endZoneDifference && !C.sameHue(field, t.endZone) })
                .toEqual({ field, endZone: true });
            expect({ field, stripe: C.contrast(field, t.stripe) > 1.02 }).toEqual({ field, stripe: true });
            expect(C.luminance(t.apron)).toBeLessThanOrEqual(C.luminance(field) + 1e-9);
            expect(t.ladderInk).toMatch(/^rgba\(\d+, \d+, \d+, 0\.5\)$/);
        }
    });

    test('a red field does not get dark red end zones, and a light field gets dark paint', () => {
        expect(C.turfFrom('#c8102e').endZone).not.toBe(CFG.turf.endZone);
        expect(C.turfFrom('#0033a0').endZone).toBe(CFG.turf.endZone);
        expect(C.turfFrom('#ffffff').paint).toBe(CFG.colors.darkPaint);
        expect(C.turfFrom('#0033a0').paint).toBe(CFG.turf.paint);
    });

    test('the same hue is a matter of the color wheel, not of lightness, and grays have none', () => {
        expect(C.sameHue('#c8102e', '#7a1220')).toBe(true);
        expect(C.sameHue('#1f5c2e', '#7a1220')).toBe(false);
        expect(C.sameHue('#777777', '#7a1220')).toBe(false);
    });
});
