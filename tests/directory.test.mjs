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
import { readFileSync, readdirSync, existsSync } from 'node:fs';
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
    automan: 'business', interstate: 'business', seedtoseed: 'business', sunnyvalejenn: 'business',
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

// THE LIST COMES OFF THE DISK, NOT OUT OF THE PAGE BEING CHECKED. `slugs` is
// parsed from index.html, so a sweep driven by it can only ever ask "does
// every card have a sitemap line", never "does every sitemap line have a
// card". That direction existed while the list came from the independent
// catalog in www/js/directory.js, and it left with that file: add a <loc> and
// an llms.txt bullet while the card lands in a follow-up PR, and the site
// advertises a URL the home page never links to, suite green.
//
// An experience is a folder under www/ with its own index.html, which is the
// one description of the set that none of the four files can drift away from.
const IGNORED_DIRS = ['js', 'css', 'assets', 'shared', 'lib', 'snaps'];
const builtSlugs = readdirSync(join(process.cwd(), 'www'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && !IGNORED_DIRS.includes(d.name))
    .map((d) => d.name)
    .filter((name) => existsSync(join(process.cwd(), 'www', name, 'index.html')))
    .filter((name) => readFileSync(join(process.cwd(), 'www', name, 'index.html'), 'utf8')
        .includes('<canvas'))     // a scene page, not a directory blocker
    .sort();

describe('every card is wired into the whole site', () => {
    test.each(slugs)('%s has a sitemap URL, an llms.txt line, and JSON-LD', (slug) => {
        expect(home).toContain(`<a href="/${slug}/">`);
        expect(sitemap).toContain(`<loc>https://www.scenexp.com/${slug}/</loc>`);
        expect(llms).toContain(`(https://www.scenexp.com/${slug}/)`);
        expect(home).toContain(`"url": "https://www.scenexp.com/${slug}/"`);
    });

    test('and the four files list exactly the experiences that exist', () => {
        // The other direction, and it has to be read OUT of each file
        // rather than looked up in it. Filtering the built slugs by
        // "is it mentioned here" only ever finds the ones that ARE built,
        // so a <loc> for a world that does not exist sails through. Ask
        // each file what it lists, then compare the two lists.
        //
        // A scene URL is one path segment with a trailing slash; the site's
        // own pages (/privacy.html and friends, and the root) are not.
        const sitemapSlugs = [...sitemap.matchAll(
            /<loc>https:\/\/www\.scenexp\.com\/([^/<]+)\/<\/loc>/g)].map((m) => m[1]).sort();
        const llmsSlugs = [...llms.matchAll(
            /\(https:\/\/www\.scenexp\.com\/([^/)]+)\/\)/g)].map((m) => m[1]).sort();

        expect([...slugs].sort()).toEqual(builtSlugs);
        expect(sitemapSlugs).toEqual(builtSlugs);
        expect(llmsSlugs).toEqual(builtSlugs);
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

// ---- The card image and the social image ------------------------------------
//
// EVERY CARD POINTS AT ITS SCENE'S SOCIAL IMAGE TODAY, SO NEITHER CAN DISAGREE
// WITH THE OTHER. That stops being true the moment a scene wants a different
// picture in the directory than it shows in a share preview, which is exactly
// what The Auto Man needs: its social card is the gold W on navy, which names
// the business instantly in a message thread and reads as a broken image in a
// grid of thirteen scene renders.
//
// Once a scene has two images, they drift. Somebody reshooting the social card
// has no reason to think about the directory, and somebody reshooting the
// directory card has no reason to think about the share preview. So the
// convention is pinned here instead: `og-<slug>` is the social image, and
// `card-<slug>` is the optional directory-only one. A card may use either. A
// page's og:image may only ever be the first.
//
// This is a PATH check, not a file-exists check, and it has to be. The
// Interstate Tire and Seed to Seed captures show their owners' logos in-scene
// and are withheld from the repository, so they are absent from a fresh clone
// and a file-exists check would fail CI while the live site is perfectly fine.

describe('the directory card image and the social image', () => {
    // Each card's <img> tag, whole, so attribute order does not matter.
    // COMMENTS ARE SKIPPED BETWEEN THE ANCHOR AND THE IMAGE, the same way the
    // sitemap sweep above skips them. The first draft of this did not, and it
    // failed the moment the automan card grew a note explaining why its
    // picture is not its social image. That note is the right thing to have
    // written, and a test that punishes a page for explaining itself is a test
    // that gets deleted.
    const cards = [...home.matchAll(
        /data-slug="(\w+)">\s*<a href="\/\w+\/">\s*(?:<!--[\s\S]*?-->\s*)*(<img\b[\s\S]*?>)/g)]
        .map((m) => ({ slug: m[1], tag: m[2] }));

    test('every card in the grid was found, so the sweep below is not empty', () => {
        expect(cards.map((c) => c.slug).sort()).toEqual(slugs.slice().sort());
    });

    test.each(cards)('$slug names one of the two allowed images, in its own folder', ({ slug, tag }) => {
        const src = tag.match(/\bsrc="([^"]+)"/);
        expect(src).not.toBeNull();
        // Its own scene's assets folder, never another's. A card repointed at
        // the wrong scene looks completely fine until somebody recognises the
        // picture.
        const path = src[1].replace(/\?.*$/, '');
        expect(path.startsWith(`/${slug}/assets/`)).toBe(true);
        const base = path.slice(`/${slug}/assets/`.length);
        expect({ [slug]: base })
            .toEqual({ [slug]: expect.stringMatching(new RegExp(`^(og|card)-${slug}\\.webp$`)) });
    });

    test.each(cards)('$slug carries alt text and its dimensions', ({ slug, tag }) => {
        // A card is a link with no text of its own above the title, and the
        // grid reflows while images load, so both of these are load bearing.
        const alt = tag.match(/\balt="([^"]*)"/);
        expect(alt).not.toBeNull();
        expect(`${slug} alt length: ${alt[1].trim().length > 30}`).toBe(`${slug} alt length: true`);
        expect(tag).toMatch(/\bwidth="1200"/);
        expect(tag).toMatch(/\bheight="630"/);
        expect(tag).toMatch(/\bloading="lazy"/);
    });

    test.each(slugs)('%s has exactly one social image, and it is the WebP', (slug) => {
        // EXACTLY ONE og:image, NAMING THE WEBP. Apple's link preview renders
        // every og:image it finds, so a JPEG "fallback" underneath puts two
        // identical cards in a message thread rather than one. The .jpg twins
        // exist on disk for scrapers that ask for them and are never named here.
        const page = read('www', slug, 'index.html').replace(/<!--[\s\S]*?-->/g, '');
        const og = [...page.matchAll(/<meta property="og:image"\s+content="([^"]+)"/g)].map((m) => m[1]);
        const tw = [...page.matchAll(/<meta name="twitter:image"\s+content="([^"]+)"/g)].map((m) => m[1]);
        expect({ [slug]: { og: og.length, twitter: tw.length } })
            .toEqual({ [slug]: { og: 1, twitter: 1 } });
        // And the social image is the og- one even when the card is not, so a
        // directory-only picture can never quietly become the share preview.
        for (const url of [...og, ...tw]) {
            expect({ [slug]: url.replace(/\?.*$/, '') })
                .toEqual({ [slug]: `https://www.scenexp.com/${slug}/assets/og-${slug}.webp` });
        }
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
