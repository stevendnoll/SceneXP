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
    const raw = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    const blocks = raw.map((text) => JSON.parse(text));
    const items = blocks.flatMap((b) => b['@graph'] || [b]);
    PAGES.push({ slug: entry.name, html, items, raw, url: `${HOME}${entry.name}/` });
}

/**
 * The keys an object in this JSON names twice. JSON.parse keeps the last of
 * them without a word, which is how three scenes (xo, office, earthdefense)
 * said isPartOf twice, the second time calling the site a WebPage, through
 * every check below (found releasing www/leaves, 2026-10-09).
 */
export function repeatedKeys(text) {
    const repeated = [];
    const stack = [];
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '"') {
            let j = i + 1;
            while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
            const key = text.slice(i + 1, j);
            let k = j + 1;
            while (/\s/.test(text[k] || '')) k++;
            const top = stack[stack.length - 1];
            if (text[k] === ':' && top) {
                if (top.has(key)) repeated.push(key);
                top.add(key);
            }
            i = j;
        } else if (c === '{') stack.push(new Set());
        else if (c === '[') stack.push(null);
        else if (c === '}' || c === ']') stack.pop();
    }
    return repeated;
}

test('a key named twice in one object is caught', () => {
    expect(repeatedKeys('{"a": 1, "b": {"a": 2}, "c": [{"a": 3}]}')).toEqual([]);
    expect(repeatedKeys('{"a": 1, "b": 2, "a": {"x": "a"}}')).toEqual(['a']);
});

test('the scene pages were found', () => {
    expect(PAGES.length).toBeGreaterThanOrEqual(18);
});

test('the home page still declares the site every scene points at', async () => {
    const html = await readFile(new URL('index.html', WWW), 'utf8');
    expect(html).toContain(`"@id": "${SITE_ID}"`);
});

describe.each(PAGES.map((p) => [p.slug, p]))('%s', (_slug, { html, items, raw, url }) => {
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
        expect(self.isPartOf['@type']).toBe('WebSite');
    });

    test('its structured data names each key once in each object', () => {
        expect(raw.flatMap((text) => repeatedKeys(text))).toEqual([]);
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
