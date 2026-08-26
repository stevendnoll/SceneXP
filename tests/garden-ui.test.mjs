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

// ---- The one irreversible action -------------------------------------------
//
// Clearing the garden used to ask through a native `confirm()`: unstyled, at
// the top of the window, prefixed "localhost:8000 says", and unreachable by the
// Escape and backdrop handling every other dialog here uses. Its copy also read
// "This clears all 1 of your trees", which is what counting without reading
// produces.

test('nothing in the garden asks through browser chrome', () => {
    // window.confirm, alert and prompt are all somebody else's UI.
    expect(JS).not.toMatch(/\bwindow\.(confirm|alert|prompt)\s*\(/);
});

test('the reset dialog is wired to the shared parts by id, like the others', () => {
    // THE TRAP FROM 2026-08-25: the shared stylesheet has no generic rules, so
    // a new modal id inherits no hiding, no positioning, and a near-opaque
    // backdrop that blacks out the scene. Each of these is the symptom that
    // followed last time.
    expect(HTML).toMatch(/id="reset-modal"[^>]*class="hidden"/);
    expect(ALL_CSS).toMatch(/#reset-modal\.hidden\s*(,[^{]*)?\{[^}]*display:\s*none/);
    expect(ALL_CSS).toMatch(/#reset-modal[^{]*\{[^}]*position:\s*fixed/);
    expect(ALL_CSS).toMatch(/#reset-modal \.modal-backdrop/);
});

test('the reset copy counts one tree the way a person would', async () => {
    const { resetPrompt } = await import('../www/garden/js/ui.js');
    expect(resetPrompt(1)).toBe(
        'This clears your only tree and starts a new garden. There is no undo.');
    expect(resetPrompt(7)).toContain('all 7 of your trees');
    // House style, which applies to every string a visitor can read.
    for (const n of [1, 2, 16]) expect(resetPrompt(n)).not.toMatch(/[—;]/);
});

test('a long species name cannot run under the close button', () => {
    // "Coast Redwood" wore the close cross through its second word, because
    // .modal-close is absolutely positioned over the container's top right and
    // the title had nothing telling it to stop short.
    expect(CSS).toMatch(/\.tree-card \.piece-title[^{]*\{[^}]*padding-right/);
});

test('the welcome legend is rows, not a ragged paragraph', () => {
    // As loose inline spans the four label-and-sentence pairs wrapped wherever
    // they landed, stranding PLANT and TEND mid-sentence.
    expect(HTML).toMatch(/<ul class="controls-hint">/);
    expect((HTML.match(/<li><span>/g) || []).length).toBeGreaterThanOrEqual(4);
    expect(CSS).toMatch(/\.controls-hint[^{]*\{[^}]*list-style:\s*none/);
});
