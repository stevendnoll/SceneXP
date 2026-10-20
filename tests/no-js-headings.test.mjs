// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * One h1 a scene page with JavaScript off (M7.1, 2026-10-20).
 *
 * Every scene keeps an h1 for the live page: an sr-only one first in the
 * body, or the shared player's welcome card (High Water, Tornado Alley).
 * Its <noscript> fallback brings a second, for crawlers and for a visitor
 * with JavaScript off. The no-JS sheet (shared/css/no-js-1.0.0.css, loaded
 * only then) sets the live page's aside, so the fallback's is the one heard.
 * This reads which ids the sheet hides from the sheet itself, and walks each
 * page's tags to find which h1 sit inside them.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const WWW = new URL('../www/', import.meta.url);
const SHEET = readFileSync(new URL('shared/css/no-js-1.0.0.css', WWW), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The selectors of every rule that sets display: none. */
const hidden = [...SHEET.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .filter((m) => /display:\s*none/.test(m[2]))
    .flatMap((m) => m[1].split(',').map((s) => s.trim()));
const HIDDEN_IDS = hidden.filter((s) => /^#[\w-]+$/.test(s)).map((s) => s.slice(1));

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

/** Each h1 in `html` outside <noscript>: its class, whether it is a child of
 *  body, and whether an element the sheet hides holds it. */
function headings(html) {
    const body = html.slice(html.indexOf('<body'));
    const text = body.replace(/<!--[\s\S]*?-->/g, '').replace(/<noscript>[\s\S]*?<\/noscript>/g, '');
    const stack = [];
    const out = [];
    for (const m of text.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g)) {
        const [, close, tagRaw, attrs] = m;
        const tag = tagRaw.toLowerCase();
        if (VOID.has(tag) || attrs.endsWith('/')) continue;
        if (close) {
            const at = stack.map((e) => e.tag).lastIndexOf(tag);
            if (at >= 0) stack.length = at;
            continue;
        }
        const id = (attrs.match(/\bid="([^"]+)"/) || [])[1] || null;
        if (tag === 'h1') {
            out.push({
                cls: (attrs.match(/\bclass="([^"]+)"/) || [])[1] || '',
                inBody: stack.length === 1 && stack[0].tag === 'body',
                hiddenBy: stack.find((e) => HIDDEN_IDS.includes(e.id)) || null
            });
        }
        stack.push({ tag, id });
    }
    return out;
}

const scenes = readdirSync(WWW, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(new URL(`${d.name}/index.html`, WWW)))
    .map((d) => d.name)
    .filter((name) => readFileSync(new URL(`${name}/index.html`, WWW), 'utf8').includes('no-js-1.0.0'));

test('the no-JS sheet hides the sr-only h1 and the player card', () => {
    expect(hidden).toContain('body > h1.sr-only');
    expect(HIDDEN_IDS).toContain('player-card');
    expect(scenes.length).toBeGreaterThan(15);
});

test.each(scenes)('%s: with JavaScript off, the fallback\'s h1 is the only one', (name) => {
    const html = readFileSync(new URL(`${name}/index.html`, WWW), 'utf8');
    const fallback = (html.match(/<noscript>\s*<div class="noscript-fallback">[\s\S]*?<\/noscript>/) || [''])[0];
    expect((fallback.match(/<h1[\s>]/g) || [])).toHaveLength(1);
    // The live page's own h1 is found, so the check below is not empty.
    expect(headings(html).length).toBeGreaterThan(0);
    for (const h of headings(html)) {
        const asideSrOnly = h.inBody && h.cls.split(/\s+/).includes('sr-only') && hidden.includes('body > h1.sr-only');
        expect(asideSrOnly || Boolean(h.hiddenBy)).toBe(true);
    }
});
