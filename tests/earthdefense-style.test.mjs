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

describe('the top-right button cluster does not stack on itself', () => {
    // THE BUG THIS EXISTS FOR. `.pause-btn` was given `right: 82px` on the
    // strength of the shared stylesheet's FIRST `.settings-btn` rule, which
    // puts the cog top-left. A later block in the same file moves the cog to
    // `right: 82px`, and that is the one that wins, so two 50px circles sat on
    // the same coordinates with the same z-index. The cog painted second, took
    // every click, and the pause button was neither visible nor reachable. On
    // a touch screen there is no Esc, so that was the only route to the pause
    // panel. Nothing threw. The second round of screenshots simply had two
    // buttons in it where there should have been three.
    const SHARED = readFileSync(new URL('../www/shared/css/styles-1.0.0.css', import.meta.url), 'utf8');
    const SHARED_DECLARATIONS = SHARED.replace(/\/\*[\s\S]*?\*\//g, '');
    const WIDTH = 50;

    /** The LAST `right` a selector is given across both stylesheets, which is
     *  the one the browser will use: same specificity, so later wins. Reading
     *  the first is exactly the mistake this test exists to catch. */
    function rightOffset(selector) {
        const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const rules = [...`${SHARED_DECLARATIONS}\n${DECLARATIONS}`
            .matchAll(new RegExp(`[^{}]*${escaped}(?![\\w-])[^{}]*\\{([^}]*)\\}`, 'g'))];
        let found = null;
        for (const rule of rules) {
            const match = rule[1].match(/(?:^|;)\s*right\s*:\s*(-?[\d.]+)px/);
            if (match) found = parseFloat(match[1]);
        }
        return found;
    }

    // ONE BUTTON NOW, DOWN FROM THREE. The settings cog left first: a floating
    // control cannot be clicked while the pointer is locked, and its panel was
    // buried under the pause card's backdrop the moment Escape made the cursor
    // available, so both of its jobs moved into the card. Then Home left on
    // 2026-09-07 with the rest of the site's Home chrome, and pause moved up
    // into the corner it had held.
    //
    // WITH ONE BUTTON THE OVERLAP LOOP HAS NOTHING TO COMPARE, so the pair
    // below asserts the coordinate directly instead: pause must be AT the
    // corner. That is the same bug in its current form. Two 50px circles on
    // the same coordinate is what the loop caught; a corner nothing sits in
    // is what a botched re-base would leave, and neither is visible in a
    // screenshot until somebody goes looking. The site-wide version of this
    // check lives in tests/home-button-removed.test.mjs.
    const CLUSTER = [
        ['pause', '.pause-btn']
    ];

    test.each(CLUSTER)('the %s button has a right offset at all', (_label, selector) => {
        expect(rightOffset(selector)).not.toBeNull();
    });

    test('no two buttons in the cluster overlap', () => {
        const slots = CLUSTER.map(([label, selector]) => ({
            label, from: rightOffset(selector)
        }));
        for (const a of slots) {
            for (const b of slots) {
                if (a === b) continue;
                const overlaps = a.from < b.from + WIDTH && b.from < a.from + WIDTH;
                expect(`${a.label} vs ${b.label}: ${overlaps ? 'overlapping' : 'clear'}`)
                    .toBe(`${a.label} vs ${b.label}: clear`);
            }
        }
        // And with a single button the loop above is vacuous, so say the thing
        // it can no longer say: the cluster starts AT the corner. A re-base
        // that moved pause the wrong way leaves the corner empty and pause
        // floating in the middle of the top edge.
        expect(`pause at ${slots[0].from}px`).toBe('pause at 20px');
    });

    test('the elapsed clock sits clear of the whole cluster', () => {
        // It was at 148px, which cleared two buttons and would have been under
        // the third the moment pause moved to its real slot.
        const furthest = Math.max(...CLUSTER.map(([, s]) => rightOffset(s)));
        expect(rightOffset('.elapsed-time')).toBeGreaterThanOrEqual(furthest + WIDTH);
    });
});

describe('every control shows a focus ring', () => {
    // A keyboard visitor has to be able to see where they are. The shared
    // stylesheet covers the sliders, the skip link and the card buttons and
    // leaves the rest on the browser default, so these are the rest of the set.
    const FOCUSABLE = [
        'button.click-prompt', 'button.briefing-menu-btn', '.menu-btn',
        '.card-settings > summary', '.modal-close',
        '.settings-check input[type="checkbox"]'
    ];

    test.each(FOCUSABLE)('%s has a :focus-visible outline', (selector) => {
        const escaped = `${selector}:focus-visible`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = DECLARATIONS.match(new RegExp(`${escaped}[^{]*\\{([^}]*)\\}`));
        expect(match).not.toBeNull();
        expect(match[1]).toMatch(/outline\s*:\s*[^;]*(solid|auto)/);
    });

    test('nothing in the file turns an outline off without replacing it', () => {
        const offs = [...DECLARATIONS.matchAll(/outline\s*:\s*(none|0)\s*;/g)];
        expect(offs).toHaveLength(0);
    });
});

describe('the HUD readouts carry their own contrast', () => {
    // Measured at M8 against the two backdrops this scene can actually put
    // behind them: deep space, and a sunlit cloud top on the Earth map. Every
    // one of these was fine against space and collapsed against cloud, which
    // is the case a visitor reaches by flying at the planet, i.e. immediately.
    // A plate is the only thing that fixes it, so each of them has to have one.
    const PLATED = [
        ['the objective panel', '.objective-panel'],
        ['the nav marker labels', '.nav-label'],
        ['the elapsed clock', '.elapsed-time'],
        // The plate moved up to the wrapper when the bar arrived, because the
        // bar needs it too: a coloured meter over a sunlit cloud top is exactly
        // as unreadable as a number over one. Asserting the wrapper covers both.
        ['the speedometer', '.speedometer']
    ];

    test.each(PLATED)('%s sits on an opaque enough plate', (_label, selector) => {
        const body = ruleBody(selector);
        expect(body).not.toBeNull();
        const [, alpha] = body.match(/background\s*:\s*rgba\([^)]*,\s*([\d.]+)\s*\)/) || [];
        expect(parseFloat(alpha)).toBeGreaterThanOrEqual(0.6);
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

describe('the welcome overlay lets the opening frame through', () => {
    // THE BUG THIS EXISTS FOR. `#blocker` used to share the loading screen's
    // OPAQUE deep-space gradient, so the first thing a visitor saw was the
    // dedication on flat black. The opening composition that M1 spent an entire
    // gate solving (Earth's limb across the lower third, Mars near the nose, the
    // Moon off to one side) was not visible until after they had clicked, which
    // is exactly backwards: the scene is the invitation.
    //
    // Nothing threw, every test passed, and the only way to catch it was to look
    // at screenshot 1 and notice the sky was missing.

    test('the loading screen stays opaque, because there is nothing behind it yet', () => {
        const body = ruleBody('#loading-screen');
        expect(body).not.toBeNull();
        expect(body).toMatch(/gradient/);
        // No alpha channel anywhere in it.
        expect(body).not.toMatch(/rgba|hsla|transparent/);
    });

    test('the welcome overlay is a scrim, not a wall', () => {
        const body = ruleBody('#blocker');
        expect(body).not.toBeNull();
        const [, alpha] = body.match(/background\s*:\s*rgba\([^)]*,\s*([\d.]+)\s*\)/) || [];
        expect(alpha).toBeDefined();

        // THE ALPHA IS A CONTRAST BUDGET. Above 0.80 the scene stops reading at
        // all, which is the bug coming back by degrees. Below 0.65 the
        // dedication in --ui-subtitle drops under 4.5:1 against a sunlit cloud
        // top, which is the brightest backdrop this scene can put behind it and
        // the same worst case the M8 contrast pass measured. Both ends matter,
        // so both ends are held.
        expect(parseFloat(alpha)).toBeGreaterThanOrEqual(0.65);
        expect(parseFloat(alpha)).toBeLessThanOrEqual(0.80);
    });

    test('the two no longer share a rule, which is how they came to share an alpha', () => {
        // A grouped selector is what made an opaque loading screen silently
        // decide what the welcome overlay looked like.
        expect(DECLARATIONS).not.toMatch(/#loading-screen\s*,\s*\n?\s*#blocker\s*\{/);
        expect(DECLARATIONS).not.toMatch(/#blocker\s*,\s*\n?\s*#loading-screen\s*\{/);
    });
});

/* The speedometer, as a set of rules rather than as a picture.
 *
 * A stylesheet test cannot tell you a gradient looks good. What it CAN hold are
 * the two decisions inside this widget that are invisible once it renders and
 * expensive to rediscover: that the ramp stops short of red, and that both arms
 * are drawn from ONE ramp so they cannot drift into disagreeing about what a
 * given speed looks like. Both are the kind of thing a later tidy-up undoes
 * without anything appearing to break. */
describe('the speedometer means what it draws', () => {
    const HTML = readFileSync(new URL('../www/earthdefense/index.html', import.meta.url), 'utf8');

    test('every piece the script drives is actually in the page', () => {
        // main.js reaches for each of these by id. A rename on either side is
        // silent: the meter simply stops moving, and no other test would care.
        ['speedometer', 'speedo-fwd', 'speedo-rev', 'speedo-ghost-fwd',
            'speedo-ghost-rev', 'speedo-demand', 'speedo-zero',
            'throttle-readout'].forEach(id => {
            expect(HTML).toContain(`id="${id}"`);
        });
    });

    test('the ramp stops at amber, because red is already spoken for', () => {
        const ramp = ruleBody('.speedometer');
        expect(ramp).not.toBeNull();
        // Red in this experience means hostile or damaged: the raider pips, the
        // incoming beams, the "under attack" banner, the hull wash. Full
        // throttle is a normal thing to be doing and must not borrow that.
        //
        // THE GREEN CHANNEL IS WHAT SEPARATES AMBER FROM ALARM RED, and it is a
        // cleaner test than anything measuring how red the red is. Amber
        // (#ff9a3c) is emphatically red-dominant and still keeps g=154; the
        // colours this ramp must never reach lose it (#ff3b30 keeps 59,
        // #ff5722 keeps 87). Every stop holding half its green is the whole
        // rule, and it happens to be true of the blues and greens as well.
        const stops = ramp.match(/#[0-9a-f]{6}/gi) || [];
        expect(stops.length).toBeGreaterThanOrEqual(4);
        stops.forEach((hex) => {
            expect(parseInt(hex.slice(3, 5), 16)).toBeGreaterThanOrEqual(0x80);
        });
    });

    test('both arms are drawn from the same ramp', () => {
        const forward = ruleBody('.speedo-arm-fwd');
        const reverse = ruleBody('.speedo-arm-rev');
        // Hand-writing the reverse arm its own stops is the tempting shortcut
        // and it is how the two directions start disagreeing about what, say,
        // 800 km/s looks like. One variable, two directions.
        expect(forward).toMatch(/var\(--speedo-ramp\)/);
        expect(reverse).toMatch(/var\(--speedo-ramp\)/);
        // The reverse arm covers its quarter of that ramp by being drawn wider
        // than itself, not by having a shorter ramp of its own.
        expect(reverse).toMatch(/background-size:\s*var\(--speedo-rev-scale\)/);
    });

    test('the geometry is one variable, so nothing drifts off the zero point', () => {
        // The forward arm's start, the reverse arm's width, the detent and the
        // demand marker all have to sit on the same zero. Four hardcoded 20%s
        // would render identically today and come apart the moment the ship's
        // speed limits change.
        ['.speedo-arm-fwd', '.speedo-arm-rev', '.speedo-zero', '.speedo-demand']
            .forEach(selector => {
                expect(ruleBody(selector)).toMatch(/var\(--speedo-zero\)/);
            });
    });

    test('the meter is hidden from a screen reader, which gets the sentence instead', () => {
        // A clipped gradient is not readable as a value. The live region in
        // #flight-status already says the speed in words, so exposing this too
        // would be noise rather than access.
        expect(HTML).toMatch(/id="speedometer"[^>]*aria-hidden="true"/);
        expect(HTML).toContain('id="flight-status"');
    });
});
