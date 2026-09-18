// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Unit tests for www/shared/js/promo-1.0.0.js — the "next on SceneXP" card that
 * goes under an end screen.
 *
 * THE CATALOG IS A COPY AND IS TESTED AS ONE. www/index.html's markup is the
 * source of truth for what this site hosts, which is a decision
 * tests/directory.test.mjs already enforces across the home page, the sitemap
 * and llms.txt. This module is a fourth copy, so the block below reads the real
 * home markup and fails if a slug, a title, a line or an image path here has
 * drifted from it, or if an experience was added there and forgotten here. That
 * is the whole reason a fourth copy is allowed to exist.
 *
 * THE RECOMMENDATION ITSELF is curated first and derived second, and both
 * halves are worth pinning: a curated pair that names a slug this site does not
 * host is a dead card, and the fallback has to terminate rather than recommend
 * the thing the visitor is already looking at.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { jest } from '@jest/globals';

let mod;

/** A document just real enough to build one card in. */
function fakeDoc() {
    const make = (tag) => ({
        tagName: tag.toUpperCase(),
        className: '',
        textContent: '',
        children: [],
        dataset: {},
        appendChild(child) { this.children.push(child); return child; }
    });
    return { createElement: make };
}

const find = (node, cls) => {
    if (node.className === cls) return node;
    for (const child of node.children || []) {
        const hit = find(child, cls);
        if (hit) return hit;
    }
    return null;
};

beforeEach(async () => {
    jest.resetModules();
    mod = await import('../www/shared/js/promo-1.0.0.js');
});

afterEach(() => {
    delete globalThis.document;
});

// ---- The catalog against the home page --------------------------------------

describe('the catalog agrees with the home page', () => {
    const home = readFileSync(join(process.cwd(), 'www', 'index.html'), 'utf8');

    /** Every card on the directory, read out of the shipped markup. */
    const cards = [...home.matchAll(/<li class="experience-card" data-slug="(\w+)">([\s\S]*?)<\/li>/g)]
        .map(([, slug, body]) => ({
            slug,
            title: (body.match(/<h3>([^<]+)<\/h3>/) || [])[1],
            line: (body.match(/class="experience-eyebrow">([^<]+)</) || [])[1],
            art: (body.match(/<img src="([^"]+)"/) || [])[1]
        }));

    test('the home page has cards to compare against at all', () => {
        // If this ever reads zero the rest of the block passes vacuously, which
        // is the one way a source-text check can quietly stop checking.
        expect(cards.length).toBeGreaterThan(10);
    });

    test('lists exactly the experiences the home page lists, in the same order', () => {
        expect(mod.EXPERIENCES.map((e) => e.slug)).toEqual(cards.map((c) => c.slug));
    });

    test.each(['title', 'line', 'art'])('every %s matches the home page', (field) => {
        for (const card of cards) {
            const here = mod.experience(card.slug);
            expect([card.slug, here[field]]).toEqual([card.slug, card[field]]);
        }
    });

    /** The category is the grouping the home page puts each card under, and it
     *  is what the fallback recommendation walks. */
    test('every category matches the group the card sits in', () => {
        const groups = [...home.matchAll(
            /<section class="experience-group" data-category="(\w+)"[\s\S]*?<\/section>/g)];
        expect(groups.length).toBe(3);
        for (const [block, category] of groups) {
            for (const [, slug] of block.matchAll(/data-slug="(\w+)"/g)) {
                expect([slug, mod.experience(slug).category]).toEqual([slug, category]);
            }
        }
    });

    test('the art is a same-origin path, which the CSP requires', () => {
        // img-src is 'self' and data: on every page, so an absolute URL to
        // anywhere else would be blocked and the card would be a broken frame.
        for (const e of mod.EXPERIENCES) {
            expect(e.art.startsWith('/')).toBe(true);
        }
    });

    test('every line is short enough for one row of a card', () => {
        // .promo-line does not wrap. A long line is an ellipsis, not a layout
        // bug, but it is still a line nobody can read.
        for (const e of mod.EXPERIENCES) {
            expect([e.slug, e.line.length < 55]).toEqual([e.slug, true]);
        }
    });
});

// ---- Which one comes next ---------------------------------------------------

describe('nextSlug', () => {
    test('honours a curated pair over the category order', () => {
        // The home page lists garden after xo, so the fallback would say garden.
        // The pair says Earth Defense, because they are both games you finish in
        // one sitting, and the pair wins.
        expect(mod.nextSlug('xo')).toBe('earthdefense');
        expect(mod.nextSlug('earthdefense')).toBe('xo');
        expect(mod.nextSlug('mandelbrot')).toBe('garden');
        expect(mod.nextSlug('garden')).toBe('mandelbrot');
    });

    test('falls back to the next in the same category', () => {
        // highwater is not curated, and sits between garden and earthdefense in
        // the worlds group.
        expect(mod.nextSlug('highwater')).toBe('earthdefense');
    });

    test('wraps round to the first of the category rather than running out', () => {
        const worlds = mod.EXPERIENCES.filter((e) => e.category === 'worlds');
        const last = worlds[worlds.length - 1].slug;
        expect(mod.nextSlug(last)).toBe(worlds[0].slug);
    });

    test('never recommends the experience the visitor is already in', () => {
        for (const e of mod.EXPERIENCES) {
            expect([e.slug, mod.nextSlug(e.slug)]).not.toEqual([e.slug, e.slug]);
        }
    });

    test('every experience has somewhere to go', () => {
        for (const e of mod.EXPERIENCES) {
            expect([e.slug, mod.nextExperience(e.slug)]).not.toEqual([e.slug, null]);
        }
    });

    /** A pair naming a slug this site does not host is a dead card, and it is
     *  the single most likely way this file goes wrong: the pairs are hand
     *  edited and an experience can be renamed or retired. */
    test('every curated pair names something that exists', () => {
        for (const [from, to] of Object.entries(mod.PAIRS)) {
            expect([from, !!mod.experience(from)]).toEqual([from, true]);
            expect([to, !!mod.experience(to)]).toEqual([to, true]);
        }
    });

    test('an unpublished scene gets nothing rather than a wrong answer', () => {
        // www/job and www/trail are built but not on the directory.
        expect(mod.nextSlug('job')).toBe(null);
        expect(mod.nextSlug('trail')).toBe(null);
        expect(mod.nextExperience('nothing-by-that-name')).toBe(null);
    });

    test('a category of one has no next, rather than itself', () => {
        expect(mod.nextSlug('')).toBe(null);
    });
});

// ---- The card ---------------------------------------------------------------

describe('createPromoCard', () => {
    test('is one link, with the art, the title and the line in it', () => {
        const card = mod.createPromoCard('xo', { doc: fakeDoc() });
        expect(card.tagName).toBe('A');
        expect(card.href).toBe('/earthdefense/');
        expect(card.dataset.slug).toBe('earthdefense');
        expect(find(card, 'promo-title').textContent).toBe('Earth Defense');
        expect(find(card, 'promo-line').textContent)
            .toBe('Built for the joy of flying through space');
        expect(find(card, 'promo-eyebrow').textContent).toBe('Next on SceneXP');
    });

    /** The title sits inside the same link, so art read aloud as well would say
     *  the name of the experience twice. */
    test('the art is decorative, lazy, and carries its intrinsic size', () => {
        const art = find(mod.createPromoCard('xo', { doc: fakeDoc() }), 'promo-art');
        expect(art.alt).toBe('');
        expect(art.loading).toBe('lazy');
        expect(art.decoding).toBe('async');
        // Stated so the card reserves its space instead of reflowing an end
        // screen under somebody who is already reading it.
        expect(art.width).toBe(1200);
        expect(art.height).toBe(630);
        expect(art.src).toBe('/earthdefense/assets/og-earthdefense.webp?v=2');
    });

    test('takes its own eyebrow', () => {
        const card = mod.createPromoCard('xo', { doc: fakeDoc(), eyebrow: 'Try this next' });
        expect(find(card, 'promo-eyebrow').textContent).toBe('Try this next');
    });

    test('is nothing at all when there is nothing to recommend', () => {
        expect(mod.createPromoCard('job', { doc: fakeDoc() })).toBe(null);
    });

    test('is nothing at all with no document to build in', () => {
        expect(mod.createPromoCard('xo', { doc: null })).toBe(null);
        expect(mod.createPromoCard('xo')).toBe(null);
        globalThis.document = fakeDoc();
        expect(mod.createPromoCard('xo')).toBeTruthy();
    });
});

describe('createDirectoryLink', () => {
    test('is the same sentence and the same class the welcome screens use', () => {
        const link = mod.createDirectoryLink({ doc: fakeDoc() });
        expect(link.tagName).toBe('A');
        expect(link.href).toBe('/');
        expect(link.textContent).toBe('More 3D worlds to explore at SceneXP.com');
        // `welcome-explore` is the shared type treatment; `promo-explore` is the
        // spacing for sitting under a card rather than alone at the bottom.
        expect(link.className).toContain('welcome-explore');
        expect(link.className).toContain('promo-explore');
    });

    test('takes its own words', () => {
        expect(mod.createDirectoryLink({ doc: fakeDoc(), text: 'See them all' }).textContent)
            .toBe('See them all');
    });

    test('is nothing at all with no document', () => {
        expect(mod.createDirectoryLink({ doc: null })).toBe(null);
        expect(mod.createDirectoryLink()).toBe(null);
    });
});

// ---- The wording it shares --------------------------------------------------

describe('house style', () => {
    test('no em-dashes and no semicolons in anything a visitor reads', () => {
        for (const e of mod.EXPERIENCES) {
            expect([e.slug, /[—;]/.test(e.title)]).toEqual([e.slug, false]);
            expect([e.slug, /[—;]/.test(e.line)]).toEqual([e.slug, false]);
        }
    });
});
