// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Every scene tells search engines it is part of SceneXP.
 *
 * WHY THIS FILE EXISTS. On 2026-10-01 Steve searched for "SceneXP Auto Man"
 * and the AI answer linked to contribute.html, a page that never mentions Auto
 * Man, instead of the scene or the home page. The scene pages were not saying
 * the one thing the search was about: none of their titles named SceneXP, and
 * fourteen of them described themselves in their structured data as a
 * separate WebSite rather than as a page of this one. So for a search pairing
 * the site's name with a scene's, the pages that matched "SceneXP" were the
 * ones that were not scenes.
 *
 * Every scene page now
 *   - ends its <title> with " | SceneXP" (og:title stays the scene's own name,
 *     since a share card already shows the site);
 *   - is a WebPage, VideoGame or WebApplication that isPartOf the home page's
 *     WebSite (https://www.scenexp.com/#website), never a WebSite of its own;
 *   - carries a BreadcrumbList, SceneXP then the scene, naming its canonical URL.
 */
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const WWW = new URL('../www/', import.meta.url);
const HOME = 'https://www.scenexp.com/';
const SITE_ID = `${HOME}#website`;

const PAGES = [];
for (const entry of await readdir(WWW, { withFileTypes: true })) {
    const page = new URL(`${entry.name}/index.html`, WWW);
    if (!entry.isDirectory() || !existsSync(page)) continue;
    const html = await readFile(page, 'utf8');
    if (!html.includes('src="js/main.min.js"')) continue;
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
        .map((m) => JSON.parse(m[1]));
    const items = blocks.flatMap((b) => b['@graph'] || [b]);
    PAGES.push({ slug: entry.name, html, items, url: `${HOME}${entry.name}/` });
}

test('the scene pages were found', () => {
    expect(PAGES.length).toBeGreaterThanOrEqual(18);
});

test('the home page still declares the site every scene points at', async () => {
    const html = await readFile(new URL('index.html', WWW), 'utf8');
    expect(html).toContain(`"@id": "${SITE_ID}"`);
});

describe.each(PAGES.map((p) => [p.slug, p]))('%s', (_slug, { html, items, url }) => {
    const title = html.match(/<title>([^<]*)<\/title>/)[1];

    test('its title names SceneXP', () => {
        expect(title).toMatch(/^\S.* \| SceneXP$/);
    });

    test('it is a page of SceneXP, not a website of its own', () => {
        expect(items.filter((i) => i['@type'] === 'WebSite')).toEqual([]);
        const self = items.find((i) => i.url === url);
        expect(self).toBeTruthy();
        expect(['WebPage', 'VideoGame', 'WebApplication']).toContain(self['@type']);
        expect(self.isPartOf && self.isPartOf['@id']).toBe(SITE_ID);
    });

    test('its breadcrumbs run SceneXP, then the scene under its own name', () => {
        const crumbs = items.find((i) => i['@type'] === 'BreadcrumbList');
        expect(crumbs).toBeTruthy();
        const [home, scene, extra] = crumbs.itemListElement;
        expect(extra).toBeUndefined();
        expect(home).toMatchObject({ position: 1, name: 'SceneXP', item: HOME });
        expect(scene).toMatchObject({ position: 2, item: url });
        expect(`${scene.name} | SceneXP`).toBe(title);
    });
});
