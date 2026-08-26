// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * A static check that the page, the stylesheet, and the JavaScript agree.
 *
 * WHY THIS FILE EXISTS. Both of this scene's modals were on screen from the
 * first frame, their close buttons appeared dead, and the garden behind them
 * looked like a black screen. One cause: THE SHARED STYLESHEET HAS NO GENERIC
 * `.hidden` RULE. Every one is scoped to a specific id (`#dialog-modal.hidden`
 * and friends), so a new modal with a new id carries the class and nothing
 * hides it. The JavaScript was correct throughout, `isCardOpen()` reported
 * false the whole time, and the two `.modal-backdrop` elements sitting at 92
 * percent opacity over the page were what turned the scene black.
 *
 * The suite could not see any of it. The harness stubs the DOM, and a stub has
 * no stylesheet, so `classList.add('hidden')` "works" under test whether or not
 * a rule exists. So the three files are compared as TEXT instead.
 *
 * This is the same family as `.ui-float` needing `.visible`: the shared sheet
 * hands over the PARTS, and every experience is responsible for wiring its own
 * ids to them.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const HTML = readFileSync(join(ROOT, 'www', 'garden', 'index.html'), 'utf8');
const CSS = readFileSync(join(ROOT, 'www', 'garden', 'css', 'experience.css'), 'utf8');
const SHARED_CSS = readFileSync(join(ROOT, 'www', 'shared', 'css', 'styles-1.0.0.css'), 'utf8');
const JS = ['main', 'ui', 'garden'].map(
    (n) => readFileSync(join(ROOT, 'www', 'garden', 'js', `${n}.js`), 'utf8')).join('\n');

const ALL_CSS = `${SHARED_CSS}\n${CSS}`;

/** Ids in the page markup that start out carrying class="hidden". */
function idsHiddenInMarkup() {
    const ids = [];
    for (const m of HTML.matchAll(/<div\s+id="([^"]+)"[^>]*class="([^"]*)"/g)) {
        if (m[2].split(/\s+/).includes('hidden')) ids.push(m[1]);
    }
    return ids;
}

test('the page really does start its modals hidden', () => {
    const ids = idsHiddenInMarkup();
    expect(ids).toContain('plant-modal');
    expect(ids).toContain('tree-card');
});

test('every element hidden by class has a rule that actually hides it', () => {
    // THE BUG THIS FILE EXISTS FOR. There is no generic `.hidden` in the
    // shared sheet, so carrying the class proves nothing at all.
    expect(/^\s*\.hidden\s*\{/m.test(SHARED_CSS)).toBe(false);

    const missing = [];
    for (const id of idsHiddenInMarkup()) {
        const rule = new RegExp(`#${id}\\.hidden\\b`);
        if (!rule.test(ALL_CSS)) missing.push(`#${id} carries .hidden but no rule matches #${id}.hidden`);
    }
    expect(missing).toEqual([]);
});

test('the modals are positioned, or they land wherever the flow puts them', () => {
    // Without the shared family's layout rules a modal is a plain block: the
    // plant card sat in the top left corner and the tree card below it.
    for (const id of ['plant-modal', 'tree-card']) {
        const block = ALL_CSS.match(new RegExp(`#${id}[^{]*\\{([^}]*)\\}`));
        expect(`${id} has a layout rule: ${Boolean(block)}`).toBe(`${id} has a layout rule: true`);
    }
    expect(/#plant-modal[^{]*\{[^}]*position:\s*fixed/.test(CSS)).toBe(true);
});

test('the backdrop is overridden, so the garden stays visible behind a dialog', () => {
    // The generic .modal-backdrop is rgba(10, 10, 20, 0.92), which is near
    // opaque and near black. Two of them made the scene look broken.
    expect(/#plant-modal \.modal-backdrop|#tree-card \.modal-backdrop/.test(CSS)).toBe(true);
    const ours = CSS.match(/#plant-modal \.modal-backdrop[^{]*\{([^}]*)\}/);
    expect(ours).not.toBeNull();
    const alpha = ours[1].match(/rgba\([^)]*?,\s*([0-9.]+)\s*\)/);
    expect(alpha).not.toBeNull();
    expect(parseFloat(alpha[1])).toBeLessThan(0.75);
});

test('every id the JavaScript reaches for exists in the page', () => {
    const inPage = new Set([...HTML.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
    const wanted = new Set([...JS.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]));
    const missing = [...wanted].filter((id) => !inPage.has(id));
    expect(missing).toEqual([]);
    expect(wanted.size).toBeGreaterThan(5);
});

test('the floating buttons are wired to the .visible sweep', () => {
    // .ui-float is display:none until JavaScript adds .visible. Correct markup
    // on its own renders an invisible Home button, which is the same trap in a
    // different coat.
    const floats = [...HTML.matchAll(/class="ui-float([^"]*)"/g)];
    expect(floats.length).toBeGreaterThanOrEqual(2);
    expect(JS).toMatch(/querySelectorAll\('\.ui-float'\)/);
    expect(/\.ui-float\.visible/.test(SHARED_CSS)).toBe(true);
});

test('the stylesheet cache query moves when the stylesheet does', () => {
    // A stale stylesheet over fresh markup does not look like a caching
    // problem, it looks like a broken layout. Both the preload and the
    // stylesheet line must carry the SAME query or the preload buys nothing
    // and costs a second download.
    const queries = [...HTML.matchAll(/css\/experience\.min\.css\?v=(\d+)/g)].map((m) => m[1]);
    expect(queries).toHaveLength(2);
    expect(queries[0]).toBe(queries[1]);
});
