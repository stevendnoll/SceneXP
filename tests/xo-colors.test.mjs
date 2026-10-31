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

/** A team's kit with nothing chosen: the jersey, and everything else decided for it. */
const OWN_TEAM = (jersey) => ({
    jersey, helmet: null, mark: null, pants: null, shoes: null, helmetStripe: false, pantsStripe: false,
});

describe('the choice', () => {
    test('starts as the game\'s own colors', () => {
        expect(C.teamColors()).toEqual({
            teams: { 0: OWN_TEAM('#ff992c'), 1: OWN_TEAM('#9bcfff') },
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

/**
 * THE REST OF THE UNIFORM (Steve, 2026-10-30): the letter, the pants, the shoes
 * and the two stripes. Null always means "decided for you", as the helmet's
 * null has always meant "the jersey".
 */
describe('the rest of the uniform', () => {
    test('the letter, the pants and the shoes are decided until chosen, and go back on null', () => {
        expect(C.markOf(0)).toBe('#ffffff');
        expect(C.pantsOf(0)).toBe(C.OWN.pants[0]);
        expect(C.pantsOf(1)).toBe(C.OWN.pants[1]);
        expect(C.shoesOf(1)).toBe(C.OWN.shoes);
        // The decided letter follows the jersey it is on.
        C.setColors({ teams: { 0: { jersey: '#ffff00' } } });
        expect(C.markOf(0)).toBe(CFG.colors.darkMark);

        C.setColors({ teams: { 0: { mark: '#00ff00', pants: '#ffffff', shoes: '#ff0000' } } });
        expect(C.markOf(0)).toBe('#00ff00');
        expect(C.pantsOf(0)).toBe('#ffffff');
        expect(C.shoesOf(0)).toBe('#ff0000');
        // The other team is untouched, and garbage changes nothing.
        expect(C.pantsOf(1)).toBe(C.OWN.pants[1]);
        C.setColors({ teams: { 0: { mark: 'green', pants: 7, shoes: [] } } });
        expect(C.kitOf(0)).toMatchObject({ mark: '#00ff00', pants: '#ffffff', shoes: '#ff0000' });

        C.setColors({ teams: { 0: { mark: null, pants: null, shoes: null } } });
        expect(C.markOf(0)).toBe(CFG.colors.darkMark);
        expect(C.pantsOf(0)).toBe(C.OWN.pants[0]);
        expect(C.shoesOf(0)).toBe(C.OWN.shoes);
    });

    test('a stripe is off until turned on, gets a color decided for it, keeps one it is given, and forgets it when turned off', () => {
        expect(C.helmetStripeOf(0)).toBeNull();
        expect(C.pantsStripeOf(0)).toBeNull();
        // On, in the decided color: white over an orange helmet (the helmet IS
        // the jersey, so the jersey cannot be the stripe), the orange jersey
        // down dark brown pants.
        C.setColors({ teams: { 0: { helmetStripe: null, pantsStripe: true } } });
        expect(C.helmetStripeOf(0)).toBe('#ffffff');
        expect(C.pantsStripeOf(0)).toBe('#ff992c');
        expect(C.teamColors().teams[0]).toMatchObject({ helmetStripe: null, pantsStripe: null });
        // ...and that color follows the jersey while nobody has picked one.
        C.setColors({ teams: { 0: { jersey: '#ffb612' } } });
        expect(C.pantsStripeOf(0)).toBe('#ffb612');

        C.setColors({ teams: { 0: { pantsStripe: '#123456' } } });
        expect(C.pantsStripeOf(0)).toBe('#123456');
        C.setColors({ teams: { 0: { jersey: '#241773', pantsStripe: 'purple' } } });
        expect(C.pantsStripeOf(0)).toBe('#123456');

        C.setColors({ teams: { 0: { pantsStripe: false } } });
        expect(C.pantsStripeOf(0)).toBeNull();
        expect(C.teamColors().teams[0].pantsStripe).toBe(false);
        // On again is decided again: a dark purple jersey does not stand
        // apart from dark brown pants, so the stripe is white, not purple.
        C.setColors({ teams: { 0: { pantsStripe: null } } });
        expect(C.pantsStripeOf(0)).toBe('#ffffff');
        // The other team never had one.
        expect(C.helmetStripeOf(1)).toBeNull();
    });

    test('the decided stripe is the jersey where it stands apart from what it is on, else the ink that reads', () => {
        expect(C.accentFor('#3a2410', '#ff992c')).toBe('#ff992c');
        expect(C.accentFor('#ff992c', '#ff992c')).toBe('#ffffff');
        expect(C.accentFor('#ffffff', '#f8f8f8')).toBe(CFG.colors.darkMark);
        // Navy on black: too close to tell apart on the field, so white.
        expect(C.accentFor('#101820', '#0b162a')).toBe('#ffffff');
        expect(C.accentFor('#0b162a', null)).toBe('#ffffff');
        // A purple jersey over a gold helmet: the jersey.
        C.setColors({ teams: { 0: { jersey: '#241773', helmet: '#ffb612', helmetStripe: null } } });
        expect(C.helmetStripeOf(0)).toBe('#241773');
    });

    test('the whole kit comes decided', () => {
        expect(C.kitOf(1)).toEqual({
            jersey: '#9bcfff', helmet: '#9bcfff', mark: '#ffffff', pants: C.OWN.pants[1], shoes: C.OWN.shoes,
            helmetStripe: null, pantsStripe: null,
        });
        C.setColors({ teams: { 1: { helmet: '#000000', helmetStripe: true, pantsStripe: '#ffffff', shoes: '#ffffff' } } });
        expect(C.kitOf(1)).toEqual({
            jersey: '#9bcfff', helmet: '#000000', mark: '#ffffff', pants: C.OWN.pants[1], shoes: '#ffffff',
            helmetStripe: '#9bcfff', pantsStripe: '#ffffff',
        });
    });

    test('every part counts toward whether anything was chosen', () => {
        for (const change of [
            { mark: '#000000' }, { pants: '#ffffff' }, { shoes: '#ffffff' }, { helmetStripe: null }, { pantsStripe: '#ffffff' },
        ]) {
            C.resetColors();
            C.setColors({ teams: { 1: change } });
            expect({ change, isDefault: C.isDefault() }).toEqual({ change, isDefault: false });
        }
        C.setColors({ teams: { 1: { mark: null, pants: null, shoes: null, helmetStripe: false, pantsStripe: false } } });
        expect(C.isDefault()).toBe(true);
    });
});

describe('the saved choice', () => {
    test('is kept, and read back', () => {
        C.setColors({
            teams: {
                0: { jersey: '#4b2e83', helmet: '#000000', mark: '#ffb612', helmetStripe: null },
                1: { jersey: '#ffb612', pants: '#ffffff', shoes: '#4b2e83', pantsStripe: '#000000' },
            },
        });
        expect(C.saveColors()).toBe(true);
        C.resetColors();
        C.loadColors();
        expect(C.jerseyOf(0)).toBe('#4b2e83');
        expect(C.helmetOf(0)).toBe('#000000');
        expect(C.jerseyOf(1)).toBe('#ffb612');
        // The helmet's stripe was turned on with no color: the purple jersey
        // over a black helmet.
        expect(C.kitOf(0)).toMatchObject({ mark: '#ffb612', helmetStripe: '#4b2e83' });
        expect(C.kitOf(1)).toMatchObject({ pants: '#ffffff', shoes: '#4b2e83', pantsStripe: '#000000' });
        expect(C.helmetStripeOf(1)).toBeNull();
    });

    test('a file saved before the uniform had stripes still loads, with those decided', () => {
        localStorage.setItem(KEY, JSON.stringify({
            v: 1, teams: { 0: { jersey: '#4b2e83', helmet: null }, 1: { jersey: '#ffb612', helmet: '#000000' } }, field: '#1f5c2e',
        }));
        C.loadColors();
        expect(C.jerseyOf(0)).toBe('#4b2e83');
        expect(C.helmetOf(1)).toBe('#000000');
        expect(C.teamColors().teams[0]).toMatchObject({ mark: null, pants: null, shoes: null, helmetStripe: false, pantsStripe: false });
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
            JSON.stringify({ v: 1, teams: { 0: { jersey: 'red', helmet: 7 } }, field: null }),
            JSON.stringify({ v: 1, teams: { 1: { mark: 'red', pants: 7, shoes: [], helmetStripe: 'x', pantsStripe: 'auto' } } })]) {
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
