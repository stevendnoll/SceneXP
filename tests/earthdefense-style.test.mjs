// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Two accessibility rules the Earth Defense stylesheet is not allowed to break.
 *
 * These are LEXICAL AUDITS over the real CSS file, and it is worth being honest
 * about what that can and cannot prove. It cannot tell you the reticle reads
 * well, or that the lock is obvious at arm's length on a sunlit phone. Those
 * are the gate's job and nothing else can do them.
 *
 * What it CAN do is hold the two rules that are easy to break by accident and
 * invisible in a diff:
 *
 *   1. NO INFORMATION BY COLOUR ALONE (PRD 8.5). Every state a visitor has to
 *      read has to change SHAPE, size, or content as well as hue. It is the
 *      first thing lost when somebody simplifies a rule down to a colour swap,
 *      and nobody notices because it still looks fine to them.
 *   2. NOTHING FLASHES (PRD 8.5). No repeating animation anywhere, at any rate.
 *      That is stricter than the photosensitivity thresholds and deliberately
 *      so: a rule with no judgement in it cannot be got wrong, and this
 *      experience has no need of a blinking anything.
 *
 * Both read the SOURCE stylesheet rather than the minified build, because the
 * source is what a contributor edits and what a reviewer reads.
 */
import { readFileSync } from 'node:fs';

const CSS = readFileSync(new URL('../www/earthdefense/css/experience.css', import.meta.url), 'utf8');

/** Strip comments, so a property named in prose is not mistaken for a rule. */
const DECLARATIONS = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

/** The body of the first rule whose selector contains `needle`.
 *
 *  The needle has to end on a token boundary or `.hostile-pip` happily matches
 *  `.hostile-pips`, which is the inert layer rather than the mark inside it,
 *  and the audit passes by reading the wrong rule entirely. */
function ruleBody(needle) {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = DECLARATIONS.match(new RegExp(`[^{}]*${escaped}(?![\\w-])[^{}]*\\{([^}]*)\\}`));
    return match ? match[1] : null;
}

/** Properties that change a colour and nothing else. A rule made only of these
 *  is a rule that says nothing to a visitor who cannot separate the hues. */
const COLOUR_ONLY = /^(color|background|background-color|border-color|stroke|fill|box-shadow|text-shadow|filter|accent-color|backdrop-filter)$/;

/** The property names a rule body sets. */
function propertiesIn(body) {
    return (body || '')
        .split(';')
        .map(line => line.split(':')[0].trim().toLowerCase())
        .filter(Boolean);
}

describe('no information is carried by colour alone', () => {
    // Each entry is a state a visitor has to be able to READ, and the rule that
    // expresses it. Every one has to carry something that is not a hue.
    const STATES = [
        ['the locked reticle hides the idle ring', '#reticle.locked .reticle-ring'],
        ['the locked reticle shows the closed diamond', '#reticle.locked .reticle-diamond'],
        ['a spent life pip', '.life-pip.spent']
    ];

    test.each(STATES)('%s changes more than its colour', (_label, selector) => {
        const body = ruleBody(selector);
        expect(body).not.toBeNull();
        const properties = propertiesIn(body);
        expect(properties.length).toBeGreaterThan(0);
        expect(properties.some(p => !COLOUR_ONLY.test(p))).toBe(true);
    });

    test('the two objective marks differ in SHAPE, not only in colour', () => {
        // A ring for what you are keeping, a diamond for what you are removing,
        // matching the markers out in the world so the panel and the sky agree.
        const friendly = propertiesIn(ruleBody('.mark-friendly'));
        const hostile = propertiesIn(ruleBody('.mark-hostile'));
        expect(friendly).toContain('border-radius');   // a circle
        expect(hostile).toContain('transform');        // a rotated square
    });

    test('the hostile pip and the nav ring are told apart by shape', () => {
        // One is a place to go and the other is a thing to shoot, and at a
        // glance on a phone that difference cannot rest on blue against orange.
        expect(propertiesIn(ruleBody('.hostile-pip'))).toContain('transform');
        expect(propertiesIn(ruleBody('.nav-ring'))).toContain('border-radius');
    });

    test('the reticle carries an outline, so it survives a sunlit Earth', () => {
        // Not a colour-alone rule, but the same family of failure: a reticle
        // that is only a colour disappears the moment the background is bright.
        expect(ruleBody('#reticle svg')).toMatch(/drop-shadow/);
    });
});

describe('nothing in the experience flashes', () => {
    test('no animation repeats, at any rate', () => {
        // Stricter than the photosensitivity thresholds on purpose. A rule with
        // no judgement in it cannot be applied wrongly, and nothing here needs
        // to blink.
        expect(DECLARATIONS).not.toMatch(/\binfinite\b/);
        expect(DECLARATIONS).not.toMatch(/animation-iteration-count\s*:\s*(?!1\b)/);
    });

    test('every animation runs once and stops', () => {
        const animations = [...DECLARATIONS.matchAll(/animation\s*:\s*([^;]+);/g)].map(m => m[1]);
        expect(animations.length).toBeGreaterThan(0);
        for (const value of animations) {
            if (value.trim() === 'none') continue;
            expect(value).toMatch(/forwards/);
        }
    });

    test('the hull-hit wash is a slow fade rather than a blink', () => {
        // The one animation in the file, and the only thing that ever covers
        // the frame. Well under a second and it happens once per hit.
        const [, seconds] = DECLARATIONS.match(/animation\s*:\s*hull-hit-fade\s+([\d.]+)s/) || [];
        expect(parseFloat(seconds)).toBeGreaterThan(0.3);
        expect(parseFloat(seconds)).toBeLessThan(1);
    });

    test('reduced motion is honoured, and the game stays readable under it', () => {
        // The wash still APPEARS under reduced motion: it is information, not
        // decoration. It simply holds steady instead of fading.
        const block = DECLARATIONS.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/);
        expect(block).not.toBeNull();
        expect(block[1]).toMatch(/transition:\s*none/);
        expect(block[1]).toMatch(/hull-hit/);
    });
});

describe('everything the page ships hidden is actually hidden', () => {
    // THE BUG THIS EXISTS FOR. The shared stylesheet lays modals out by an
    // explicit list of ids rather than by a class, so this experience's pause
    // panel and end screen matched nothing: no layout, and no `.hidden` rule.
    // Both sat unhidden in normal document flow, invisible only because the
    // canvas comes later in the DOM and painted over them, while the pause
    // card's close button carried a z-index and floated over the scene on its
    // own. The pause panel and the end screen could never have appeared, and
    // every unit test passed the whole time.
    const HTML = readFileSync(new URL('../www/earthdefense/index.html', import.meta.url), 'utf8');
    const SHARED = readFileSync(new URL('../www/shared/css/styles-1.0.0.css', import.meta.url), 'utf8');
    const ALL_CSS = `${SHARED}\n${DECLARATIONS}`;

    /** Every element the markup ships with the `hidden` CLASS on it.
     *
     *  `visually-hidden` is deliberately excluded and is not the same thing at
     *  all: those are the polite live regions, which must stay in the
     *  accessibility tree and would be silenced by `display: none`. */
    const shipped = [...HTML.matchAll(/<[a-z]+[^>]*>/g)]
        .map(tag => tag[0])
        .map(tag => ({
            tag,
            id: (tag.match(/id="([\w-]+)"/) || [])[1],
            classes: ((tag.match(/class="([^"]*)"/) || [])[1] || '').split(/\s+/).filter(Boolean)
        }))
        .filter(el => el.classes.includes('hidden'))
        .map(el => ({ ...el, classes: el.classes.filter(c => c !== 'hidden') }));

    /** Is there a rule anywhere that genuinely takes this element out of play?
     *
     *  `display: none` is the usual answer, but the shared settings panel fades
     *  instead so it can animate, and a faded panel with no pointer events is
     *  just as gone. Insisting on one mechanism would have failed a rule that
     *  is perfectly correct. */
    function hasHidingRule({ id, classes }) {
        const selectors = [id && `#${id}.hidden`, ...classes.map(c => `.${c}.hidden`)]
            .filter(Boolean);
        return selectors.some((selector) => {
            const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // The selector may sit in a comma-separated list, so the rule body
            // is whatever follows the next brace.
            const match = ALL_CSS.match(new RegExp(`${escaped}(?![\\w-])[^{]*\\{([^}]*)\\}`));
            if (!match) return false;
            const body = match[1];
            return /display\s*:\s*none/.test(body) ||
                /visibility\s*:\s*hidden/.test(body) ||
                (/opacity\s*:\s*0\b/.test(body) && /pointer-events\s*:\s*none/.test(body));
        });
    }

    test('the markup ships several things hidden, so this is checking something', () => {
        expect(shipped.length).toBeGreaterThan(4);
        expect(shipped.some(e => e.id === 'pause-modal')).toBe(true);
        expect(shipped.some(e => e.id === 'end-modal')).toBe(true);
    });

    test.each(shipped.map(el => [el.id || el.classes[0], el]))(
        '%s has a rule that takes it off screen', (_label, element) => {
            expect(hasHidingRule(element)).toBe(true);
        });

    test('the live regions are NOT hidden this way, and must not be', () => {
        // `visually-hidden` clips them out of the picture while leaving them in
        // the accessibility tree. `display: none` would take them out of both,
        // which is how a polite live region silently stops announcing anything.
        const body = ruleBody('.visually-hidden');
        expect(body).not.toBeNull();
        expect(body).not.toMatch(/display\s*:\s*none/);
        expect(body).toMatch(/clip-path|clip\s*:/);
    });

    test('both modals are laid out over the scene rather than left in the flow', () => {
        // Being hidden is half of it. Without `position: fixed` and a centring
        // flex box they would appear at the top of the document behind the
        // canvas, which is a different way of never being seen.
        for (const id of ['#pause-modal', '#end-modal']) {
            const body = ruleBody(id);
            expect(body).not.toBeNull();
            expect(body).toMatch(/position\s*:\s*fixed/);
            expect(body).toMatch(/display\s*:\s*flex/);
        }
    });
});

describe('the responsive pass covers the shapes the shared stylesheet does', () => {
    const breakpoints = [...DECLARATIONS.matchAll(/@media ([^{]+)\{/g)].map(m => m[1].trim());

    test.each([
        ['a phone in portrait', 'max-width: 600px'],
        ['a phone on its side', 'max-height: 500px'],
        ['a very wide screen', 'min-width: 1500px'],
        ['a visitor who asked for less motion', 'prefers-reduced-motion']
    ])('has a pass for %s', (_label, needle) => {
        expect(breakpoints.some(b => b.includes(needle))).toBe(true);
    });
});
