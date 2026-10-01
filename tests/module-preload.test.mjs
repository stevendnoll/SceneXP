// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Every scene page preloads exactly the modules it imports.
 *
 * WHY THIS FILE EXISTS. A browser finds a module's imports only once that
 * module has arrived, so a scene whose main.min.js imports a store that
 * imports a shared part waits one round trip per level. These graphs run
 * three to six levels deep (Corner Office's has 52 modules), which on a phone
 * is most of a second of waiting before any scene code runs. Since 2026-10-01
 * `npm run build` writes one <link rel="modulepreload"> per module into each
 * page's <head>, so the browser asks for all of them at once.
 *
 * CI already fails if a rebuild changes a committed page. This suite catches
 * the same thing locally, before a push, and it reads the import graph its own
 * way (from the built files' import statements) rather than trusting the
 * build's: a list that missed a module would leave that level of the
 * waterfall in place and nothing else would ever notice.
 */
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const WWW = join(process.cwd(), 'www');
const BEGIN = '<!-- BEGIN generated modulepreload';
const END = '<!-- END generated modulepreload -->';

/** Static imports in a minified module: `import ... from"./x.min.js"`,
 *  `export ... from"./x.min.js"` and a bare `import"./x.min.js"`. */
function importsOf(code) {
    const out = [];
    const pattern = /(?:\bimport|\bexport)\s*(?:[\w$*{}\s,]*?\bfrom\s*)?["'](\.{1,2}\/[^"']+\.js)["']/g;
    for (const m of code.matchAll(pattern)) out.push(m[1]);
    return out;
}

async function graphOf(entry) {
    const seen = new Set([entry]);
    const queue = [entry];
    while (queue.length) {
        const file = queue.shift();
        const code = await readFile(file, 'utf8');
        for (const spec of importsOf(code)) {
            const dep = resolve(dirname(file), spec);
            if (!seen.has(dep)) {
                seen.add(dep);
                queue.push(dep);
            }
        }
    }
    return seen;
}

const PAGES = [];
for (const entry of await readdir(WWW, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const page = join(WWW, entry.name, 'index.html');
    if (!existsSync(page)) continue;
    const html = await readFile(page, 'utf8');
    if (html.includes('src="js/main.min.js"')) PAGES.push({ scene: entry.name, page, html });
}

test('the scene pages were found', () => {
    expect(PAGES.length).toBeGreaterThanOrEqual(18);
});

describe.each(PAGES.map((p) => [p.scene, p]))('%s', (_scene, { page, html }) => {
    test('preloads exactly the modules it imports, starting with its own main', async () => {
        const begin = html.indexOf(BEGIN);
        const end = html.indexOf(END);
        expect(begin).toBeGreaterThan(-1);
        expect(end).toBeGreaterThan(begin);
        const listed = [...html.slice(begin, end).matchAll(/<link rel="modulepreload" href="([^"]+)">/g)]
            .map((m) => m[1]);
        expect(listed[0]).toBe('js/main.min.js');
        expect(new Set(listed).size).toBe(listed.length);

        const dir = dirname(page);
        const graph = await graphOf(join(dir, 'js', 'main.min.js'));
        const expected = [...graph].map((f) => relative(dir, f).split('\\').join('/')).sort();
        expect([...listed].sort()).toEqual(expected);
        for (const href of listed) expect(`${href} exists: ${existsSync(join(dir, href))}`).toBe(`${href} exists: true`);
    });

    test('the list sits in the head, after the three.js preload', () => {
        const three = html.search(/<link rel="modulepreload" href="\.\.\/lib\/three\//);
        expect(three).toBeGreaterThan(-1);
        expect(html.indexOf(BEGIN)).toBeGreaterThan(three);
        expect(html.indexOf(END)).toBeLessThan(html.indexOf('</head>'));
    });
});
