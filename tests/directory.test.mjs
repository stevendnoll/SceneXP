// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Checks for the home page's experience directory.
 *
 * THERE IS NO DIRECTORY JAVASCRIPT ANY MORE. The page carried a live search box
 * from the start and category filter chips for one day (2026-09-04), and both
 * were removed: with a dozen scenes under three headings the grouping answers
 * the question they answered, and on a phone they pushed the first card three
 * hundred pixels below the fold. So these are all source-text checks over the
 * shipped files, and that is the point of them. An experience listed in one of
 * the site's four files and forgotten in the others, or a category renamed in
 * four of the five places it is written out, is invisible in a browser and in a
 * screenshot of any single part of the page.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...p) => readFileSync(join(process.cwd(), ...p), 'utf8');
const home = read('www', 'index.html');
const sitemap = read('www', 'sitemap.xml');
const llms = read('www', 'llms.txt');
const css = read('www', 'css', 'site.css');

// The category ids, in the order the groups appear on the page.
const CATEGORY_IDS = ['worlds', 'business', 'personal'];

// Slug to category. Checked against the real markup below, so this cannot
// drift into testing a grouping the site does not actually have.
const CATEGORY_OF = {
    dad: 'personal', family: 'personal', roqui: 'personal', gavin: 'personal', jamar: 'personal',
    interstate: 'business', seedtoseed: 'business',
    steve: 'worlds', mandelbrot: 'worlds', earthdefense: 'worlds', highwater: 'worlds', garden: 'worlds',
};

// THE MARKUP IS THE SOURCE OF TRUTH now that the catalog array is gone. Each
// group section, its heading label, and the slugs of the cards inside it. A
// group has no nested <section>, so the first closing tag is its own.
const groups = [...home.matchAll(
    /<section class="experience-group" data-category="(\w+)"[\s\S]*?<h2 id="([^"]+)">([^<]+)<\/h2>([\s\S]*?)<\/section>/g)]
    .map((m) => ({
        id: m[1],
        anchor: m[2],
        label: m[3],
        slugs: [...m[4].matchAll(/experience-card" data-slug="([^"]+)"/g)].map((c) => c[1]),
    }));
const slugs = groups.flatMap((g) => g.slugs);

describe('the fixtures above are the real directory', () => {
    test('the groups are the three categories, in order', () => {
        // Everything below leans on this. If it drifts, the rest quietly
        // measures a page that does not exist.
        expect(groups.map((g) => g.id)).toEqual(CATEGORY_IDS);
    });

    test('every card is in the group the fixture puts it in', () => {
        expect(Object.fromEntries(
            groups.flatMap((g) => g.slugs.map((s) => [s, g.id]))))
            .toEqual(CATEGORY_OF);
    });

    test('no group is empty and no card sits outside one', () => {
        // An empty group ships a heading that only ever appears over blank
        // space; a card outside every group is one nothing else here checks.
        for (const g of groups) {
            expect({ [g.label]: g.slugs.length > 0 }).toEqual({ [g.label]: true });
        }
        const all = [...home.matchAll(/experience-card" data-slug="([^"]+)"/g)].map((m) => m[1]);
        expect(slugs.slice().sort()).toEqual(all.slice().sort());
    });
});

// ---- One experience, four files ---------------------------------------------
//
// AN EXPERIENCE IS LISTED IN FOUR PLACES AND NOTHING USED TO CHECK THAT THEY
// AGREE. A static card in index.html, a sitemap URL, an llms.txt line, and the
// JSON-LD in the head. A missing sitemap or llms.txt line is invisible until
// somebody wonders why a page never got indexed. All four are hand-edited, none
// of them near each other, and this is the check that would have caught the
// omission.

describe('every card is wired into the whole site', () => {
    test.each(slugs)('%s has a sitemap URL, an llms.txt line, and JSON-LD', (slug) => {
        expect(home).toContain(`<a href="/${slug}/">`);
        expect(sitemap).toContain(`<loc>https://www.scenexp.com/${slug}/</loc>`);
        expect(llms).toContain(`(https://www.scenexp.com/${slug}/)`);
        expect(home).toContain(`"url": "https://www.scenexp.com/${slug}/"`);
    });

    test('the home page is never staler than the newest experience', () => {
        // THE HOME PAGE IS A DIRECTORY. Its content changes every time an
        // experience is added, because a new card lands on it, so a `lastmod`
        // left at whenever the page was last restyled tells a crawler there is
        // nothing new to come back for. This cannot check "somebody added a
        // scene", but it can check the consequence: the directory's date can
        // never be older than the newest thing listed in it.
        const dates = Object.fromEntries(
            [...sitemap.matchAll(
                /<loc>https:\/\/www\.scenexp\.com\/([^<]*)<\/loc>\s*(?:<!--[\s\S]*?-->\s*)?<lastmod>([^<]+)<\/lastmod>/g)]
                .map((m) => [m[1], m[2]]));
        // The regex has to actually find things, or this test passes on an
        // empty object and guards nothing.
        expect(Object.keys(dates).length).toBeGreaterThan(slugs.length);
        const newest = slugs
            .map((slug) => dates[`${slug}/`])
            .reduce((a, b) => (a > b ? a : b));
        // ISO dates compare correctly as plain strings. Reported as an object
        // so a failure names both dates rather than just saying false.
        expect({ home: dates[''], newest, homeIsCurrent: dates[''] >= newest })
            .toEqual({ home: dates[''], newest, homeIsCurrent: true });
    });

    test.each(slugs)('%s is not quietly hidden from search', (slug) => {
        // THE SAME SCAFFOLD THAT ALMOST SHIPPED ON THE GARDEN. A `noindex` put
        // in during development is invisible in every browser, survives every
        // test, and costs the page its entire search presence. It is listed in
        // the sitemap, so the only sign anything is wrong is that the page
        // never appears, which nobody notices for weeks.
        // COMMENTS ARE STRIPPED FIRST, and the first draft of this test did not
        // do that and failed on highwater, whose head carries a comment saying
        // its own noindex is gone and that no robots tag belongs here. That
        // note is the right thing to have written. A test that punishes a page
        // for explaining itself is a test that gets deleted.
        const page = read('www', slug, 'index.html').replace(/<!--[\s\S]*?-->/g, '');
        expect(`${slug}: ${/<meta\s+name="robots"/i.test(page)}`).toBe(`${slug}: false`);
        expect(`${slug}: ${/noindex/i.test(page)}`).toBe(`${slug}: false`);
    });
});

// ---- One taxonomy, five copies ----------------------------------------------
//
// THE CATEGORY NAME IS WRITTEN OUT FIVE TIMES and nothing shares it in code:
// the group heading, the matching "What you will find here" card, the JSON-LD
// name, the JSON-LD @id, and the llms.txt heading. There is no catalog array
// left to hold it once, because every one of those has to be readable without
// JavaScript. A rename that lands in four of the five is invisible in a
// screenshot of any single part of the page.

describe('the categories agree everywhere they are written down', () => {
    test.each(groups)('$label has a heading, an anchor, a card, JSON-LD, and an llms.txt section',
        ({ anchor, label }) => {
            // The anchor is the label lowercased with spaces hyphenated, which
            // is what makes every cross-reference below predictable.
            expect(anchor).toBe(label.toLowerCase().replace(/ /g, '-'));
            expect(home).toContain(`aria-labelledby="${anchor}"`);
            // The "What you will find here" card, which is the same three names
            // a second time and jumps to the group.
            expect(home).toContain(`<h3><a href="#${anchor}">${label}</a></h3>`);
            // The JSON-LD list for this category.
            expect(home).toContain(`"@id": "https://www.scenexp.com/#${anchor}"`);
            expect(home).toContain(`"name": "${label}"`);
            // And llms.txt, which is the copy a model reads.
            expect(llms).toContain(`### ${label}`);
            expect(llms).toContain(`https://www.scenexp.com/#${anchor}`);
        });

    test('every listed experience appears under its category in llms.txt', () => {
        // llms.txt is a flat file with no ids, so the check is positional: a
        // scene has to fall between its own heading and the next one.
        const sections = llms.split(/^### /m).slice(1);
        expect(sections).toHaveLength(groups.length);
        for (const [i, { label, slugs: mine }] of groups.entries()) {
            expect(sections[i].startsWith(label)).toBe(true);
            const listed = [...sections[i].matchAll(
                /\(https:\/\/www\.scenexp\.com\/(\w+)\/\)/g)].map((m) => m[1]);
            expect({ [label]: listed.slice().sort() })
                .toEqual({ [label]: mine.slice().sort() });
        }
    });

    test('every ItemList numbers its own entries 1..n, newest first', () => {
        // Each category's list restarts at 1, and its order is the order of the
        // cards in that group. Adding a scene means renumbering one list, which
        // is exactly the hand edit that lands a second "position": 2.
        const block = home.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
        expect(block).not.toBeNull();
        const lists = JSON.parse(block[1])['@graph']
            .filter((node) => node['@type'] === 'ItemList');
        expect(lists.map((l) => l.name)).toEqual(groups.map((g) => g.label));
        for (const [i, list] of lists.entries()) {
            const positions = list.itemListElement.map((item) => item.position);
            expect({ [list.name]: positions })
                .toEqual({ [list.name]: positions.map((_, n) => n + 1) });
            // AND THE LIST IS THE GROUP, IN THE SAME ORDER. Positions that run
            // 1..n prove nothing on their own if the list names a different set
            // of scenes, or the same ones in a different order.
            const listed = list.itemListElement.map(
                (item) => item.url.replace('https://www.scenexp.com/', '').replace('/', ''));
            expect({ [list.name]: listed }).toEqual({ [list.name]: groups[i].slugs });
        }
    });
});

// ---- The page is static again -----------------------------------------------

describe('the search box and the filter chips are gone for good', () => {
    // A HALF-REMOVAL IS THE FAILURE MODE HERE. Markup left behind after its
    // script is deleted renders as an unstyled label and an inert text box that
    // filters nothing, and CSS left behind is simply invisible. Neither shows
    // up in a test that only reads what the page still does.
    test.each([
        'experience-search', 'search-status', 'search-empty', 'directory-controls',
        'category-filter', 'category-chip', 'category-count', 'experience-group-note',
    ])('%s appears in neither the markup nor the stylesheet', (name) => {
        expect({ [name]: { html: home.includes(name), css: css.includes(name) } })
            .toEqual({ [name]: { html: false, css: false } });
    });

    test('the home page loads no directory script', () => {
        expect(home).not.toContain('directory.min.js');
        // Only the two site-wide scripts remain, and both are still wired up.
        expect(home).toContain('/js/theme.min.js');
        expect(home).toContain('/js/nav.min.js');
    });

    test('nothing above the first card is progressive enhancement any more', () => {
        // The section head runs straight into the first group. Anything `hidden`
        // between them would be a control waiting for a script that no longer
        // ships, which is a permanently invisible element.
        const between = home.slice(
            home.indexOf('</div>', home.indexOf('class="section-head"')),
            home.indexOf('<section class="experience-group"'));
        expect(between).not.toMatch(/\shidden(\s|>)/);
    });
});

// ---- Heading levels ---------------------------------------------------------

test('the outline runs h1, category h2, card h3 with no level skipped', () => {
    // NO LEVEL MAY BE SKIPPED between the section's single h1, the category
    // headings, and a card title. The cards were h2 before the grouping, and a
    // card left behind at h2 reads as a sibling of the category it lives in.
    expect([...home.matchAll(/<h1[ >]/g)]).toHaveLength(1);
    expect(home).not.toMatch(/<div class="experience-card-body">[\s\S]{0,200}?<h2>/);
    const titles = [...home.matchAll(/<h3>([^<]+)<\/h3>/g)].map((m) => m[1]);
    expect(titles).toHaveLength(slugs.length);
});
