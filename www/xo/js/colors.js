// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * colors.js - The team and field colors a visitor chose, and the arithmetic
 * that keeps every one of them readable.
 *
 * A VISITOR CAN DRESS THE X'S AND THE O'S AS THEIR FAVORITE TEAM AND ITS RIVAL.
 * The jersey is a team's color everywhere a team's color shows: the kit, the
 * letter rings, its fans, the opening's cooler, the card stunt and the
 * fireworks. The helmet follows the jersey until it is given a color of its
 * own.
 *
 * THE CHOICE LIVES HERE AND NOWHERE ELSE, because config.js is frozen at load
 * and a color that can change mid-game cannot be a config value. Everything
 * that paints a team asks this module at the moment it paints.
 *
 * PURE apart from the one saved setting: no THREE, no DOM. Every read and write
 * of storage is guarded, and the game plays in its own colors without it.
 */
import { XO_CONFIG as CFG } from './config.min.js';

/** The game's own colors, which is what a visitor who never opens the card sees. */
export const DEFAULTS = Object.freeze({
    teams: Object.freeze({
        0: Object.freeze({ jersey: '#ff992c', helmet: null }),
        1: Object.freeze({ jersey: '#9bcfff', helmet: null }),
    }),
    field: '#1f5c2e',
});

const clone = (c) => ({
    teams: {
        0: { jersey: c.teams[0].jersey, helmet: c.teams[0].helmet },
        1: { jersey: c.teams[1].jersey, helmet: c.teams[1].helmet },
    },
    field: c.field,
});

let current = clone(DEFAULTS);

/** `#rrggbb` in lower case, from anything a color input or a saved file might
 *  hold, or null when it is not a color. */
export function normalHex(value) {
    if (typeof value !== 'string') return null;
    const v = value.trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(v)) return v;
    if (/^#[0-9a-f]{3}$/.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
    return null;
}

/** A choice with every part checked: anything unreadable is the default. */
function sanitize(raw) {
    const out = clone(DEFAULTS);
    if (!raw || typeof raw !== 'object') return out;
    for (const team of [0, 1]) {
        const t = raw.teams && raw.teams[team];
        if (!t) continue;
        out.teams[team].jersey = normalHex(t.jersey) || out.teams[team].jersey;
        out.teams[team].helmet = normalHex(t.helmet);
    }
    out.field = normalHex(raw.field) || out.field;
    return out;
}

/** What is chosen now, as a copy nobody can change by accident. */
export function teamColors() {
    return clone(current);
}

export function jerseyOf(team) {
    return current.teams[team] ? current.teams[team].jersey : DEFAULTS.teams[0].jersey;
}

/** The helmet, which is the jersey until somebody gives it a color of its own. */
export function helmetOf(team) {
    const t = current.teams[team];
    return t ? (t.helmet || t.jersey) : jerseyOf(team);
}

export function fieldColor() {
    return current.field;
}

/**
 * CHANGE SOME OF IT. `{ teams: { 0: { jersey } }, field }` in any part; a
 * helmet given as null goes back to following its jersey. Returns the whole
 * choice, checked.
 */
export function setColors(change = {}) {
    const next = clone(current);
    for (const team of [0, 1]) {
        const t = change.teams && change.teams[team];
        if (!t) continue;
        if ('jersey' in t) next.teams[team].jersey = normalHex(t.jersey) || next.teams[team].jersey;
        if ('helmet' in t) next.teams[team].helmet = t.helmet === null ? null : (normalHex(t.helmet) || next.teams[team].helmet);
    }
    if ('field' in change) next.field = normalHex(change.field) || next.field;
    current = sanitize(next);
    return teamColors();
}

export function resetColors() {
    current = clone(DEFAULTS);
    return teamColors();
}

/** Whether anything differs from the game's own colors. */
export function isDefault(choice = current) {
    const c = sanitize(choice);
    return c.field === DEFAULTS.field
        && [0, 1].every((t) => c.teams[t].jersey === DEFAULTS.teams[t].jersey && !c.teams[t].helmet);
}

/**
 * Read the saved choice into place. A missing, broken or future file is the
 * defaults. `localStorage` is named outright rather than passed in, so the
 * privacy suite's scan for storage writers can see this file is one.
 */
export function loadColors() {
    try {
        const raw = localStorage.getItem(CFG.storage.colors);
        if (!raw) { current = clone(DEFAULTS); return teamColors(); }
        const parsed = JSON.parse(raw);
        current = parsed && parsed.v === 1 ? sanitize(parsed) : clone(DEFAULTS);
    } catch (e) {
        current = clone(DEFAULTS);
    }
    return teamColors();
}

/** Keep the choice for next time. Saying nothing when storage refuses is right:
 *  the colors still apply for this visit. */
export function saveColors() {
    try {
        if (isDefault()) localStorage.removeItem(CFG.storage.colors);
        else localStorage.setItem(CFG.storage.colors, JSON.stringify({ v: 1, ...teamColors() }));
        return true;
    } catch (e) {
        return false;
    }
}

// ---- The arithmetic -------------------------------------------------------------

/** 0..1 channels from `#rrggbb`. */
export function rgbOf(hex) {
    const h = normalHex(hex) || '#000000';
    return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}

const toHex = (rgb) => `#${rgb.map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255)
    .toString(16).padStart(2, '0')).join('')}`;
const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const encode = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

/** WCAG relative luminance. */
export function luminance(hex) {
    const [r, g, b] = rgbOf(hex).map(linear);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 to 21. */
export function contrast(a, b) {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** OKLab, the color space where equal steps look equal. */
export function oklab(hex) {
    const [r, g, b] = rgbOf(hex).map(linear);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
        0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
    ];
}

export function fromOklab([L, A, B]) {
    const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
    const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
    const s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3;
    return toHex([
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    ].map(encode));
}

/** How different two colors look, in OKLab distance (about 0.02 is barely there). */
export function difference(a, b) {
    const p = oklab(a);
    const q = oklab(b);
    return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/** The same color lighter or darker by `dL` in OKLab lightness. */
export function shade(hex, dL) {
    const [L, A, B] = oklab(hex);
    return fromOklab([Math.min(1, Math.max(0, L + dL)), A, B]);
}

/**
 * WHAT IS WORTH MENTIONING ABOUT A CHOICE, as `{ kind, text }` in the order they
 * should be read. Only ever advice: nothing here stops a visitor choosing it.
 */
export function warningsFor(choice = current) {
    const c = sanitize(choice);
    const K = CFG.colors;
    const out = [];
    const x = c.teams[0].jersey;
    const o = c.teams[1].jersey;
    if (difference(x, o) < K.warnTeams) {
        out.push({
            kind: 'teams',
            text: 'The two jerseys are close in color, so the X\'s and the O\'s may be hard to tell apart on the field.',
        });
    }
    const hidden = [0, 1].filter((t) => difference(c.teams[t].jersey, c.field) < K.warnField);
    if (hidden.length === 2) {
        out.push({ kind: 'field', text: 'Both jerseys are close to the field color, so the players may be hard to see.' });
    } else if (hidden.length === 1) {
        const who = hidden[0] === 0 ? 'X\'s' : 'O\'s';
        out.push({ kind: 'field', text: `The ${who} jerseys are close to the field color, so those players may be hard to see.` });
    }
    return out;
}

/**
 * THE WHOLE FIELD FROM ONE COLOR: `{ grass, stripe, paint, ladderInk, scrimmage,
 * endZone, apron }`, every one of them readable on the others.
 *
 * TODAY'S GREEN IS TODAY'S FIELD, value for value, because every one of those
 * was tuned by eye. Any other color is dressed by the rules today's were tuned
 * to: the stripe is the same step lighter the mown band is, the apron is the
 * same share of the turf's light, the paint stays white until it would not show,
 * and the gold line and the dark red end zones stay until they would not either.
 */
export function turfFrom(hex) {
    const T = CFG.turf;
    const K = CFG.colors;
    const grass = normalHex(hex) || DEFAULTS.field;
    const apronHex = `#${T.apron.colour.toString(16).padStart(6, '0')}`;
    if (grass === normalHex(T.grass)) {
        return {
            grass: T.grass, stripe: T.stripe, paint: T.paint, ladderInk: T.ladderInk,
            scrimmage: T.scrimmage, endZone: T.endZone, apron: apronHex,
        };
    }
    // The mown band: the same lightness step as today's, and the other way if
    // there is no room to go lighter.
    // Judged by light rather than by OKLab, which calls #010101 plainly different
    // from black: the band has to stand out from the grass about as much as
    // today's does, so near black the step grows, either way, until it does.
    const lift = oklab(T.stripe)[0] - oklab(T.grass)[0];
    const wanted = 1 + (contrast(T.grass, T.stripe) - 1) * 0.8;
    let stripe = shade(grass, lift);
    for (const times of [-1, 2, -2, 3, -3, 4, -4, 6, -6, 8]) {
        if (contrast(grass, stripe) >= wanted) break;
        stripe = shade(grass, lift * times);
    }

    const paint = contrast(grass, T.paint) >= K.paintContrast ? T.paint : K.darkPaint;
    // The numerals are the paint at the same see-through as today's.
    const alpha = (/rgba\([^)]*,\s*([0-9.]+)\s*\)/.exec(T.ladderInk) || [0, '0.5'])[1];
    const [pr, pg, pb] = rgbOf(paint).map((v) => Math.round(v * 255));
    const ladderInk = `rgba(${pr}, ${pg}, ${pb}, ${alpha})`;

    const lines = [T.scrimmage, T.paint, K.darkPaint];
    const scrimmage = lines.find((ink) => contrast(grass, ink) >= K.scrimmageContrast
        && difference(grass, ink) >= K.warnField)
        || lines.reduce((best, ink) => (contrast(grass, ink) > contrast(grass, best) ? ink : best));

    // A darker shade of the field's own color reads as shading, not as an end
    // zone, however different its lightness: a red field with dark red end
    // zones is one red field. So the same hue counts as too close.
    const other = K.endZones.filter((ink) => !sameHue(grass, ink));
    const endZone = other.find((ink) => difference(grass, ink) >= K.endZoneDifference)
        || other.reduce((best, ink) => (difference(grass, ink) > difference(grass, best) ? ink : best));

    return { grass, stripe, paint, ladderInk, scrimmage, endZone, apron: apronFor(grass) };
}

/**
 * WHETHER TWO COLORS ARE THE SAME HUE: both plainly colored rather than gray,
 * and within `CFG.colors.hueNear` degrees of each other round the color wheel.
 */
export function sameHue(a, b) {
    const K = CFG.colors;
    const p = oklab(a);
    const q = oklab(b);
    if (Math.hypot(p[1], p[2]) < K.hueChroma || Math.hypot(q[1], q[2]) < K.hueChroma) return false;
    const turn = Math.abs(Math.atan2(p[2], p[1]) - Math.atan2(q[2], q[1])) * (180 / Math.PI);
    return Math.min(turn, 360 - turn) < K.hueNear;
}

/**
 * THE GROUND BEYOND THE FIELD: the turf's color with the same share of its light
 * that today's apron has of today's turf (about 40%, see `CFG.turf.apron`),
 * worked out in linear light so the hue does not shift.
 */
export function apronFor(grass) {
    const T = CFG.turf;
    const apronHex = `#${T.apron.colour.toString(16).padStart(6, '0')}`;
    const share = luminance(apronHex) / Math.max(1e-6, luminance(T.grass));
    return toHex(rgbOf(grass).map(linear).map((c) => encode(c * share)));
}

/**
 * THREE SHADES OF A JERSEY FOR ITS FANS, so a section is a crowd rather than a
 * painted slab: the color, a darker one and a lighter one. The game's own two
 * teams keep the shades that were chosen for them by eye.
 */
export function shadesOf(hex) {
    const h = normalHex(hex) || DEFAULTS.teams[0].jersey;
    for (const team of [0, 1]) {
        if (h === DEFAULTS.teams[team].jersey) return [...CFG.crowd.shirts[team]];
    }
    // A step that runs out of room (black cannot get darker, and a vivid color
    // leaves the screen's range before it gets much lighter) comes out barely
    // different, so that shade steps twice the other way instead.
    const step = CFG.colors.fanShade;
    const far = (a) => difference(h, a) >= step * 0.6;
    const darker = shade(h, -step);
    const lighter = shade(h, step);
    return [
        h,
        far(darker) ? darker : shade(h, far(lighter) ? 2 * step : 3 * step),
        far(lighter) ? lighter : shade(h, far(darker) ? -2 * step : -3 * step),
    ];
}

/**
 * THE X OR O ON A JERSEY: white, unless the jersey is so light that white would
 * not show, and then near-black. The game's own orange and light blue stay
 * white, which is what they were tuned with.
 */
export function markInk(hex) {
    return contrast(hex, '#ffffff') < CFG.colors.markSwitch ? CFG.colors.darkMark : '#ffffff';
}

/**
 * THE CARD STUNT'S LETTERS ON CARDS IN THE X'S COLOR. It was navy on orange,
 * which was chosen for contrast, and navy on a navy jersey would be no message
 * at all. So the letters are whichever of the stunt's own inks reads best on
 * the jersey.
 */
export function cardInks(hex) {
    const P = CFG.milestones.finale.cards;
    const card = normalHex(hex) || P.orange;
    // The first of the stunt's inks that clears `cardContrast`, in the order they
    // were designed in, so the game's own orange keeps its navy. Failing that,
    // whichever reads best: black is last and wins only on a mid-bright card,
    // and every color is at least 4.5:1 against black or white.
    const inks = [P.navy, P.gold, '#ffffff', '#000000'];
    const good = inks.find((ink) => contrast(card, ink) >= CFG.colors.cardContrast);
    const on = good || inks.reduce((best, ink) => (contrast(card, ink) > contrast(card, best) ? ink : best), inks[0]);
    return { card, on };
}

/**
 * A TEAM COLOR AS A FIREWORK. Sparks are added light, so a navy or black
 * jersey would burst as nothing at all: dark colors are lifted until they
 * glow, keeping their hue.
 */
export function sparkInk(hex) {
    const [L, A, B] = oklab(hex);
    const target = CFG.colors.sparkLightness;
    if (L >= target) return normalHex(hex);
    // A deep, vivid color cannot be that bright at full strength on a screen,
    // so it gives up a little of its strength until it gets there.
    let chroma = 1;
    let out = fromOklab([target, A, B]);
    for (let i = 0; i < 12 && oklab(out)[0] < target - 0.02; i += 1) {
        chroma *= 0.85;
        out = fromOklab([target, A * chroma, B * chroma]);
    }
    return out;
}

/**
 * A PALETTE WRITTEN IN THE GAME'S OWN TEAM COLORS, WITH THE CHOSEN ONES IN THEIR
 * PLACE. Every entry that is a default jersey becomes that team's jersey now,
 * lifted to glow when `spark` is set; every other entry is left alone.
 */
export function withTeamColors(palette = [], { spark = false } = {}) {
    return palette.map((entry) => {
        const h = normalHex(entry);
        for (const team of [0, 1]) {
            if (h === DEFAULTS.teams[team].jersey) {
                return spark ? sparkInk(jerseyOf(team)) : jerseyOf(team);
            }
        }
        return entry;
    });
}
