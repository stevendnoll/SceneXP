// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Release dates on the directory, and the spotlight that leads it.
 *
 * Since 2026-10-01 every card on the home page says when its world was
 * released, and the same date is what the scene's own page gives search
 * engines as its datePublished. Two copies of a fact drift, so this holds them
 * together, and because the date is now written down it can also hold the
 * rules that used to be left to whoever added a card:
 *   - each category runs newest first;
 *   - the spotlight above the grid shows the three newest worlds, newest
 *     first, and says the same thing about each as its card does.
 *
 * The July dates are approximate (see the note in www/index.html), but they
 * are still the dates, and they are held like any other.
 */
import { readFile } from 'node:fs/promises';

const WWW = new URL('../www/', import.meta.url);
const home = await readFile(new URL('index.html', WWW), 'utf8');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];

const longDate = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return `${MONTHS[m - 1]} ${d}, ${y}`;
};

/** Every grid card: slug, category, title, date, and the printed date. */
const cards = [];
for (const group of home.matchAll(/<section class="experience-group" data-category="(\w+)"[\s\S]*?<\/ul>/g)) {
    for (const card of group[0].matchAll(/<li class="experience-card" data-slug="(\w+)">([\s\S]*?)<\/li>/g)) {
        const time = card[2].match(/<p class="experience-date">Released <time datetime="([^"]+)">([^<]+)<\/time><\/p>/);
        cards.push({
            slug: card[1],
            category: group[1],
            title: card[2].match(/<h3>([^<]+)<\/h3>/)[1],
            date: time && time[1],
            printed: time && time[2]
        });
    }
}

const spotlight = home.slice(home.indexOf('<section class="spotlight"'),
    home.indexOf('</section>', home.indexOf('<section class="spotlight"')));
const slides = [...spotlight.matchAll(/<li class="spotlight-slide[^"]*" data-slug="(\w+)"[\s\S]*?<\/li>/g)]
    .map((m) => ({
        slug: m[1],
        href: m[0].match(/<a href="([^"]+)">/)[1],
        title: m[0].match(/<h3>([^<]+)<\/h3>/)[1],
        date: m[0].match(/<time datetime="([^"]+)">/)[1],
        printed: m[0].match(/<time datetime="[^"]+">([^<]+)<\/time>/)[1]
    }));

test('every card was found, in all three categories', () => {
    expect(cards.length).toBeGreaterThanOrEqual(17);
    expect(new Set(cards.map((c) => c.category))).toEqual(new Set(['worlds', 'business', 'personal']));
});

test.each(cards.map((c) => [c.slug, c]))('%s prints a release date, and prints it right', (_slug, c) => {
    expect(c.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(c.printed).toBe(longDate(c.date));
});

test.each(cards.map((c) => [c.slug, c]))('%s gives its scene page the same date', async (slug, c) => {
    const page = await readFile(new URL(`${slug}/index.html`, WWW), 'utf8');
    const items = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
        .map((m) => JSON.parse(m[1]))
        .flatMap((d) => d['@graph'] || [d]);
    const self = items.find((i) => i.url === `https://www.scenexp.com/${slug}/`);
    expect(self && self.datePublished).toBe(c.date);
});

test('each category runs newest first', () => {
    for (const category of ['worlds', 'business', 'personal']) {
        const dates = cards.filter((c) => c.category === category).map((c) => c.date);
        expect({ [category]: dates }).toEqual({ [category]: [...dates].sort().reverse() });
    }
});

test('the spotlight shows the three newest worlds, newest first', () => {
    const newest = [...cards].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 3).map((c) => c.slug);
    expect(slides.map((s) => s.slug)).toEqual(newest);
});

test('each spotlight slide says what its card says', () => {
    for (const slide of slides) {
        const card = cards.find((c) => c.slug === slide.slug);
        expect(slide).toEqual({
            slug: card.slug,
            href: `/${card.slug}/`,
            title: card.title,
            date: card.date,
            printed: card.printed
        });
    }
});
