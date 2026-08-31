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
import { cardLines } from '../www/garden/js/ui.js';
import { createRecord } from '../www/garden/js/garden.js';
import { resolveSpecies, speciesById } from '../www/garden/js/species.js';

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

// ---- The bottom row and the zoom stack (QA 2026-08-31) ---------------------
//
// The pan row is centred in the VIEWPORT and the zoom stack is anchored to the
// right EDGE, so the two are laid out against different origins and whether
// they collide is a function of the window width. Nobody had done that
// arithmetic, and on a 391 px phone QA found the minus button sitting on top of
// the right arrow. The numbers live in two stylesheets and three media queries,
// which is exactly the shape of thing that is cheap to assert and expensive to
// eyeball.

/** One number out of a CSS rule, so the test moves when the sheet does. */
function cssPx(pattern, source) {
    const m = source.match(pattern);
    expect(m).not.toBeNull();
    return Number(m[1]);
}

/** Where the two bottom-corner control groups actually land, in CSS pixels. */
function bottomControlsAt(viewportWidth) {
    // The shared part's own sizes, and this scene's narrow-screen shrink.
    const shrink = CSS.slice(CSS.indexOf('@media (max-width: 380px)'));
    const small = viewportWidth <= 380;
    // Anchored on the selector's own brace, or `max-width: 380px` in the media
    // query's condition is the first "width" the regex finds.
    const button = cssPx(/\.pan-btn\s*\{[^}]*width:\s*(\d+)px/, small ? shrink : SHARED_CSS);
    const gap = small
        ? cssPx(/\.pan-controls\s*\{[^}]*gap:\s*(\d+)px/, shrink)
        : cssPx(/\.pan-controls\s*\{[^}]*gap:\s*(\d+)px/, SHARED_CSS);

    // The zoom stack's corner, and the shift the row takes to clear it.
    const zoom = CSS.slice(CSS.indexOf('.garden-zoom {'));
    const inset = cssPx(/right:\s*calc\((\d+)px/, zoom);
    const shiftRule = CSS.slice(CSS.indexOf('@media (max-width: 28rem)'));
    const shift = viewportWidth <= 28 * 16
        ? cssPx(/left:\s*calc\(50% - (\d+)px\)/, shiftRule) : 0;

    // Four buttons and three gaps, centred and then stepped left.
    const width = button * 4 + gap * 3;
    const centre = viewportWidth / 2 - shift;
    return {
        rowLeft: centre - width / 2,
        rowRight: centre + width / 2,
        zoomLeft: viewportWidth - inset - button
    };
}

test('THE ZOOM STACK AND THE RIGHT ARROW DO NOT SHARE A PIXEL', () => {
    // 320 is the narrowest phone still in use, 391 is the frame QA shot the
    // mobile pass on, and 433 and 449 sit either side of the rule's own
    // boundary, which is where a fix like this fails if it is going to.
    for (const width of [320, 360, 375, 380, 381, 391, 414, 430, 433, 449, 480, 600]) {
        const { rowLeft, rowRight, zoomLeft } = bottomControlsAt(width);
        // Air between the two groups, not merely an absence of overlap: two
        // circles a pixel apart read as a mistake as surely as two overlapping
        // ones do.
        expect(`${width}px: ${Math.round(zoomLeft - rowRight)}px clear`)
            .toBe(`${width}px: ${Math.max(12, Math.round(zoomLeft - rowRight))}px clear`);
        // And it has not simply been pushed off the other edge of the screen.
        expect(`${width}px: ${rowLeft >= 8}`).toBe(`${width}px: true`);
    }
});

test('the welcome card can be scrolled to its own bottom', () => {
    // `align-items: center` on the shared `#blocker` overflows EQUALLY at both
    // ends, so a card taller than the screen puts its own title above the top
    // of the viewport where no scroll can reach it: a scroll container cannot
    // scroll to negative. Auto margins centre it while it fits and collapse
    // rather than going negative when it does not.
    const blocker = CSS.slice(CSS.indexOf('#blocker {'));
    const rule = blocker.slice(0, blocker.indexOf('}'));
    expect(rule).toMatch(/overflow-y:\s*auto/);
    expect(rule).toMatch(/align-items:\s*flex-start/);
    const instructions = CSS.slice(CSS.indexOf('#instructions {'));
    expect(instructions.slice(0, instructions.indexOf('}'))).toMatch(/margin:\s*auto/);

    // And the scroll has to survive the dismissal handler: a flick to read the
    // rest of the card ends in a `touchend` exactly like a tap does, so the
    // card would otherwise close itself the first time anybody tried to read
    // the bottom of it.
    expect(JS).toMatch(/BLOCKER_TAP_SLOP/);
});

test('the welcome legend is rows, not a ragged paragraph', () => {
    // As loose inline spans the four label-and-sentence pairs wrapped wherever
    // they landed, stranding PLANT and TEND mid-sentence.
    expect(HTML).toMatch(/<ul class="controls-hint">/);
    expect((HTML.match(/<li><span>/g) || []).length).toBeGreaterThanOrEqual(4);
    expect(CSS).toMatch(/\.controls-hint[^{]*\{[^}]*list-style:\s*none/);
});

// ---- Two dialogs, one voice ------------------------------------------------

test('the reset dialog is not set in another experience gallery style', () => {
    // The shared `.piece-title` is a display style: 1.8rem at weight 700 with
    // 0.25rem beneath it. Defensible for a species name, wrong for a sentence.
    // On "Start a new garden?" it wrapped to two crowded lines in a 22rem card
    // and sat almost on top of its own body text, while the plant modal two
    // clicks away is set at 1.15rem. Two dialogs in one scene should not be in
    // two different voices.
    const block = CSS.slice(CSS.indexOf('.reset-card .piece-title {\n    margin'));
    const rule = block.slice(0, block.indexOf('}'));
    expect(rule).toMatch(/font-size:\s*1\.15rem/);
    expect(rule).toMatch(/font-family:\s*var\(--font-system\)/);
    // Room between the question and the sentence answering it.
    expect(rule).toMatch(/margin:\s*0 0 0\.7rem/);
});

test('the two modal headings are set at the same size', () => {
    const size = (selector) => {
        const at = CSS.indexOf(selector);
        const rule = CSS.slice(at, CSS.indexOf('}', at));
        const m = rule.match(/font-size:\s*([\d.]+)rem/);
        return m ? Number(m[1]) : null;
    };
    expect(size('.plant-heading {')).toBe(size('.reset-card .piece-title {\n    margin'));
});


// ---- The tree card says what the tree is doing (M11-4, M11-10) -------------

function lines(id, patch = {}, hour = 12, context = {}) {
    const record = { ...createRecord(id, 0, 0, { x: 0, z: 0 }), ...patch };
    return cardLines(record, resolveSpecies(id, undefined), 3, { hour, ...context });
}

test('a fruit tree is told what stage it is at, in words', () => {
    // Colour is never the only carrier of anything in this scene, the same rule
    // HEALTH_WORDS and sliderWords already follow, so a visitor who cannot see
    // an orange pixel is still told there is ripe fruit on the tree.
    const bloomHour = speciesById('cherry').schedule.bloomFull;
    expect(lines('cherry', { growth: 1 }, bloomHour).doing).toBe('In blossom');
    expect(lines('apple', { growth: 1 }, 17.5).doing).toBe('Fruit ripe');
    // And the line is IN the body, not merely computed beside it.
    expect(lines('apple', { growth: 1 }, 17.5).texts).toContain('Fruit ripe');
});

test('a tree with nothing to say says nothing', () => {
    // Out of season, and for the twelve species that carry no schedule at all.
    expect(lines('apple', { growth: 1 }, 23).doing).toBe('');
    expect(lines('bur-oak', { growth: 1 }, 12).doing).toBe('');
    expect(lines('bur-oak', { growth: 1 }, 12).texts.length).toBe(3);
});

test('the card explains why a tree is thirsty in the rain', () => {
    // M11-4 took the free water out, so a visitor will eventually tap a tree
    // during a downpour and find it thirsty. The line is true rather than an
    // apology: a nursery root ball is drier and better drained than the ground
    // around it, so rain runs off it and past it.
    const wet = lines('apple', { moisture: 0.05 }, 12, { falling: true });
    expect(wet.runoff).toContain('root ball');
    expect(wet.texts).toContain(wet.runoff);

    // BOTH HALVES HAVE TO BE TRUE. A well watered tree in the rain is not
    // confused about anything, and a thirsty tree in clear weather has nothing
    // to explain.
    expect(lines('apple', { moisture: 1 }, 12, { falling: true }).runoff).toBe('');
    expect(lines('apple', { moisture: 0.05 }, 12, { falling: false }).runoff).toBe('');
});

test('the card body survives a line count that moves', () => {
    // The old refresh wrote into the paragraphs that already existed and
    // stopped at whichever list ran out first, which was correct only while the
    // card had exactly three lines every time. It now has three, four or five.
    const plain = lines('bur-oak', { growth: 1 }, 12).texts.length;
    const blossom = lines('cherry', { growth: 1 }, speciesById('cherry').schedule.bloomFull).texts.length;
    const both = lines('cherry', { growth: 1, moisture: 0 },
        speciesById('cherry').schedule.bloomFull, { falling: true }).texts.length;
    expect(plain).toBe(3);
    expect(blossom).toBe(4);
    expect(both).toBe(5);
});

// ---- The plant modal, regrouped (M16) --------------------------------------

const { isFlowering: floweringOf, SPECIES: ALL } = await import('../www/garden/js/species.js');
const { GARDEN_CONFIG } = await import('../www/garden/js/config.js');

test('THE PLANT BUTTON CANNOT FALL OUT OF THE CARD', () => {
    // The bug, and it was a specificity one INSIDE THIS STYLESHEET rather than
    // a shared-sheet override. `.plant-card` set `max-height: 88vh` with
    // `overflow-y: auto`, while `#plant-modal .modal-container` sets
    // `overflow: visible` so the close button can hang off the corner. An id
    // plus a class beats a bare class, so the height capped while the overflow
    // stayed visible: on a short window the content ran out past the card's own
    // rounded border and the Plant button floated below it. Both rules are
    // reasonable alone, which is why this is pinned rather than tidied.
    const css = readFileSync(
        join(process.cwd(), 'www', 'garden', 'css', 'experience.css'), 'utf8');
    expect(css).toMatch(/#plant-modal \.modal-container,[\s\S]{0,120}\{[^}]*overflow:\s*visible/);

    // Fixed by making the card a COLUMN with one scrolling row, which also
    // keeps the action on screen without scrolling to it. The selector has to
    // out-specify the one above, so it carries the id too.
    expect(css).toMatch(/#plant-modal \.modal-container\.plant-card\s*\{[^}]*flex-direction:\s*column/);
    expect(css).toMatch(/#plant-modal \.modal-container\.plant-card\s*\{[^}]*overflow:\s*hidden/);
    // The middle scrolls and the button does not.
    expect(css).toMatch(/\.plant-layout\s*\{[^}]*overflow-y:\s*auto/);
    expect(css).toMatch(/\.plant-layout\s*\{[^}]*min-height:\s*0/);
    expect(css).toMatch(/#plant-confirm\s*\{[^}]*flex:\s*none/);
});

test('the customise disclosure is gone, and its DATA PATH is not', () => {
    const html = readFileSync(join(process.cwd(), 'www', 'garden', 'index.html'), 'utf8');
    const ui = readFileSync(join(process.cwd(), 'www', 'garden', 'js', 'ui.js'), 'utf8');
    const css = readFileSync(
        join(process.cwd(), 'www', 'garden', 'css', 'experience.css'), 'utf8');
    for (const src of [html, ui, css]) {
        expect(src).not.toMatch(/slider-list|slider-row|customise/);
    }

    // BUT A GARDEN PLANTED BEFORE THIS CHANGE MUST COME BACK AS ITSELF. The
    // records carry a `custom` object and `resolveSpecies` still takes one, so
    // removing the controls removed a decision and not a saved tree's shape.
    const species = readFileSync(
        join(process.cwd(), 'www', 'garden', 'js', 'species.js'), 'utf8');
    expect(species).toMatch(/export function resolveSpecies\(\s*id,\s*custom/);
    expect(ui).toMatch(/custom: \{ \.\.\.selection\.custom \}/);
});

test('SEVENTEEN SPECIES SPLIT INTO TWO GROUPS a visitor would look in', () => {
    // Seventeen is a list rather than a choice. They split on the thing people
    // actually pick on, and a tree that fruits flowered first, so fruit trees
    // live under Flowering.
    const flowering = ALL.filter(floweringOf);
    const foliage = ALL.filter((s) => !floweringOf(s));
    expect(flowering.length + foliage.length).toBe(ALL.length);
    expect(flowering.length).toBeGreaterThan(2);
    expect(foliage.length).toBeGreaterThan(2);

    // Every fruit tree is in the flowering group, which is the rule QA asked
    // for stated as an assertion rather than left to hold by coincidence.
    for (const s of ALL.filter((sp) => sp.fruit)) {
        expect(floweringOf(s)).toBe(true);
    }
    // And nothing in the foliage group flowers.
    for (const s of foliage) {
        expect(s.blossom).toBeUndefined();
        expect(s.schedule).toBeUndefined();
    }

    // BOTH GROUPS KEEP THE SMALL-TO-LARGE ORDER, since filtering a sorted list
    // cannot unsort it and the grid's whole job is showing the range.
    for (const group of [flowering, foliage]) {
        for (let i = 1; i < group.length; i++) {
            expect(group[i].matureHeight).toBeGreaterThanOrEqual(group[i - 1].matureHeight);
        }
    }
});

test('the tabs are a real tablist, and the selection follows the tab', () => {
    const html = readFileSync(join(process.cwd(), 'www', 'garden', 'index.html'), 'utf8');
    expect(html).toMatch(/role="tablist"/);
    expect(html).toMatch(/id="tab-flowering"[^>]*role="tab"/);
    expect(html).toMatch(/id="tab-foliage"[^>]*role="tab"/);
    // Only the selected tab is in the tab order, which is what the pattern owes
    // and what a row of plain buttons would not give.
    expect(html).toMatch(/id="tab-foliage"[^>]*tabindex="-1"/);
    expect(html).toMatch(/id="species-grid"[^>]*role="tabpanel"/);

    const ui = readFileSync(join(process.cwd(), 'www', 'garden', 'js', 'ui.js'), 'utf8');
    // THE SELECTION HAS TO MOVE WITH THE TAB, or switching leaves the preview
    // showing a tree the grid no longer offers and the button planting
    // something the visitor cannot see.
    const fn = ui.slice(ui.indexOf('function showGroup'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toMatch(/isFlowering\(chosen\) !== flowering/);
    expect(body).toMatch(/SPECIES\.find/);
    // Arrow keys move between tabs.
    expect(ui).toMatch(/ArrowLeft.*ArrowRight|ArrowRight.*ArrowLeft/s);
    // The state is aria-selected and not a class, so what a screen reader is
    // told and what an eye is shown are one fact.
    expect(body).toMatch(/setAttribute\('aria-selected'/);
});

test('IT OPENS ON FLOWERING, and the markup and the JS agree about that', () => {
    const html = readFileSync(join(process.cwd(), 'www', 'garden', 'index.html'), 'utf8');
    const ui = readFileSync(join(process.cwd(), 'www', 'garden', 'js', 'ui.js'), 'utf8');

    // They did NOT agree before. The markup shipped Flowering selected while
    // the init opened whichever group the current selection was in, and the
    // default selection is SPECIES[0], which is a foliage tree. So the JS
    // silently overrode the markup on the first paint.
    expect(html).toMatch(/id="tab-flowering"[^>]*aria-selected="true"/);
    expect(html).toMatch(/id="tab-foliage"[^>]*aria-selected="false"/);
    const build = ui.slice(ui.indexOf('function buildTabs'));
    const body = build.slice(0, build.indexOf('\n}\n'));
    expect(body).toMatch(/showGroup\('flowering'\)/);
    expect(body).not.toMatch(/isFlowering\(chosen\)/);

    // And SPECIES[0] really is a foliage tree, which is the fact that made the
    // two disagree. If the list is ever reordered so the first entry flowers,
    // this stops being the reason and somebody should find out what is.
    expect(floweringOf(ALL[0])).toBe(false);

    // STICKY AFTER THAT: the group is chosen once at init rather than on every
    // open, so planting a row of oaks costs one tab switch and not one per
    // tree.
    const open = ui.slice(ui.indexOf('export function openPlantModal'));
    expect(open.slice(0, open.indexOf('\n}\n'))).not.toMatch(/showGroup/);
});

// ---- The tree card is not a list of four lines any more (M16-5) -------------

test('THE CARD SHOWS THE TREE, AND IT IS THE VISITOR\'S OWN TREE', () => {
    const html = readFileSync(join(process.cwd(), 'www', 'garden', 'index.html'), 'utf8');
    const main = readFileSync(join(process.cwd(), 'www', 'garden', 'js', 'main.js'), 'utf8');
    const ui = readFileSync(join(process.cwd(), 'www', 'garden', 'js', 'ui.js'), 'utf8');
    expect(html).toMatch(/id="tree-preview"/);

    // ONE RENDERER, TWO DESTINATIONS, rather than a second scissor path.
    expect(ui).toMatch(/if \(isCardOpen\(\)\) return cardPreview/);
    expect(main).toMatch(/if \(isPlantOpen\(\) \|\| isCardOpen\(\)\) renderPreview/);

    // AND THE 2D CONTEXT FOLLOWS THE CANVAS. Caching one across both modals
    // would draw the card's portrait into the plant modal's canvas, which is
    // the kind of bug that only appears on the second thing a visitor does.
    expect(main).toMatch(/previewCtxFor !== target/);

    // The card's tree is built from the record's own SEED, so it is that tree
    // rather than a stock example of its species. The plant modal passes none
    // and keeps the fixed showcase seed, because moving between species should
    // show the species.
    expect(main).toMatch(/seed: tree\.record\.seed/);
    expect(main).toMatch(/seed === undefined \? 0x5EED : seed/);

    // Driven at its LIVE state, with the same options the garden drives it
    // with. Dropping `evergreen` or `schedule` would quietly give the portrait
    // a deciduous year and no fruit.
    const drive = main.slice(main.indexOf('function previewDrive'));
    const body = drive.slice(0, drive.indexOf('\n}\n'));
    expect(body).toMatch(/evergreen: entry\.resolved\.evergreen/);
    expect(body).toMatch(/schedule: entry\.resolved\.schedule/);

    // AND FRAMED ON WHAT IS ACTUALLY THERE. A sapling framed for the giant it
    // will become is a few pixels in the middle of an empty square.
    expect(main).toMatch(/currentHeight\(entry\.record, previewResolved\)/);
});

test('the card gauge is the gauge on the bed, in its colours', () => {
    const css = readFileSync(
        join(process.cwd(), 'www', 'garden', 'css', 'experience.css'), 'utf8');
    const B = GARDEN_CONFIG.garden.bed;
    const hex = (n) => '#' + n.toString(16).padStart(6, '0');
    // The fill is the water, the track is what is missing and goes amber, and a
    // dark tick marks where the two meet. Read off the same four colours the
    // shader uses, so the card cannot drift from the world.
    const thirst = css.slice(css.indexOf('.tree-thirst {'));
    const block = thirst.slice(0, thirst.indexOf('@media'));
    expect(block).toContain(hex(B.levelFullColor));
    expect(block).toContain(hex(B.levelEmptyColor));
    expect(block).toContain(hex(B.levelTrackColor));
    expect(block).toContain(hex(B.levelBorderColor));

    const ui = readFileSync(join(process.cwd(), 'www', 'garden', 'js', 'ui.js'), 'utf8');
    // Urgent at the SAME threshold the droplet and the bed use, read from the
    // config rather than typed here.
    expect(ui).toMatch(/record\.moisture < GARDEN_CONFIG\.garden\.moisture\.thirstyBelow/);
    // No boundary to draw on a tank that is all one thing.
    expect(ui).toMatch(/fill > 0\.02 && fill < 0\.98/);
    // COLOUR IS NEVER THE ONLY CARRIER: the percentage stays in the words, and
    // the gauge names itself to a screen reader.
    expect(ui).toMatch(/Water level \$\{Math\.round\(fill \* 100\)\} percent/);
    expect(ui).toMatch(/texts\.push\(`\$\{thirst\}, \$\{moisture\}%`\)/);
});

// ---- Three things QA found in the two modals (M17) --------------------------

test('THE PREVIEW IS DRAWN BEFORE THE SCENE, or it is left in the corner', () => {
    // The preview renders into a SCISSOR RECTANGLE at the top left of the main
    // drawing buffer and copies those pixels out to a 2D canvas. Drawn after
    // the scene, the copy was taken correctly and then the frame was PRESENTED
    // with the rectangle still stamped in the corner: a second, ghostly tree
    // over the top left of the garden whenever either modal was open.
    //
    // Going first costs nothing and needs no restore pass, because
    // `renderer.render` clears the whole buffer before it draws.
    const main = readFileSync(join(process.cwd(), 'www', 'garden', 'js', 'main.js'), 'utf8');
    const preview = main.indexOf('if (isPlantOpen() || isCardOpen()) renderPreview(');
    const scene = main.indexOf('if (renderer && scene && camera) renderer.render(scene, camera)');
    expect(preview).toBeGreaterThan(0);
    expect(scene).toBeGreaterThan(0);
    expect(preview).toBeLessThan(scene);

    // THE LAKE'S CARD DRAWS THE SCENE ITSELF, from a second camera, so it has
    // the same rule for a stronger reason: drawn after the main pass it would
    // leave a window onto the lake stamped over the corner of the garden.
    const lake = main.indexOf('if (isLakeOpen()) renderLakeView()');
    expect(lake).toBeGreaterThan(0);
    expect(lake).toBeLessThan(scene);

    // And the copy still happens in the same task as the render, which is what
    // keeps it valid without preserveDrawingBuffer. It lives in the shared
    // `drawIntoCorner` now, which is the one place either card copies from.
    const fn = main.slice(main.indexOf('function drawIntoCorner'));
    expect(fn.slice(0, fn.indexOf('\n}\n'))).toMatch(/previewCtx\.drawImage\(renderer\.domElement/);
});

test('the tree card fits a short window, buttons included', () => {
    const css = readFileSync(
        join(process.cwd(), 'www', 'garden', 'css', 'experience.css'), 'utf8');
    // The card had NO height cap at all, and `#tree-card .modal-container` sets
    // `overflow: visible`, so on a 511 px window it ran off the screen with the
    // text cut off and both buttons out of reach.
    expect(css).toMatch(/#tree-card \.modal-container,[\s\S]{0,120}\{[^}]*overflow:\s*visible/);
    expect(css).toMatch(/#tree-card \.modal-container\.tree-card\s*\{[^}]*max-height:\s*88vh/);
    expect(css).toMatch(/#tree-card \.modal-container\.tree-card\s*\{[^}]*flex-direction:\s*column/);
    expect(css).toMatch(/\.tree-scroll\s*\{[^}]*overflow-y:\s*auto/);
    expect(css).toMatch(/\.tree-scroll\s*\{[^}]*min-height:\s*0/);
    // The actions stay put while the middle scrolls.
    expect(css).toMatch(/\.tree-actions\s*\{[^}]*flex:\s*none/);

    // AND THE PORTRAIT IS CAPPED BY THE VIEWPORT, not only by the card's width.
    // A square sized from the width alone is 19 rem tall in a 22 rem card,
    // which is most of a short window before a line of text is drawn.
    expect(css).toMatch(/\.tree-preview\s*\{[^}]*width:\s*min\(100%,\s*\d+vh\)/);

    const html = readFileSync(join(process.cwd(), 'www', 'garden', 'index.html'), 'utf8');
    // The scrolling wrapper has to hold all three, or one of them escapes it.
    const scroll = html.slice(html.indexOf('class="tree-scroll"'));
    const inner = scroll.slice(0, scroll.indexOf('tree-actions'));
    for (const id of ['tree-preview', 'tree-body', 'tree-thirst']) {
        expect(inner).toContain(`id="${id}"`);
    }
});

test('THE BACKDROP IS NOT A FOLIAGE COLOUR ANY MORE', () => {
    const main = readFileSync(join(process.cwd(), 'www', 'garden', 'js', 'main.js'), 'utf8');
    // It was 0x1d2a18, a dark FOLIAGE green, so every canopy in the list was
    // shown against its own hue at its own value. Brightness was the lesser
    // half of that report; hue was the rest. The value survives in a comment
    // explaining the history, which is why this asks about the CALL and not
    // about the file.
    expect(main).not.toMatch(/setClearColor\(0x1d2a18/);

    // NO FLAT COLOUR CAN DO IT, which is why this is a gradient. Foliage runs
    // mid to dark and wants a light ground; the Quaking Aspen and the Paper
    // Birch have chalk-white bark, which against a light ground measures
    // 1.07:1 and 1.15:1. A gradient wins both because a tree is not evenly
    // distributed: canopy is high in the frame and trunk is low.
    expect(main).toMatch(/function previewBackdrop/);
    expect(main).toMatch(/createLinearGradient/);
    expect(main).toMatch(/side: THREE\.BackSide/);
    // Unlit and untoned, because the colours chosen are the ones that should
    // arrive on screen.
    const fn = main.slice(main.indexOf('function previewBackdrop'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toMatch(/toneMapped: false/);
    expect(body).toMatch(/fog: false/);
    // A SPHERE AND NOT A PLANE: the preview camera is placed per tree from that
    // tree's height, so a plane sized for a Japanese Maple would not cover a
    // Coast Redwood.
    expect(body).toMatch(/SphereGeometry/);

    // The CSS shows the same thing before the first frame lands, so opening a
    // modal is never a flash of some other colour.
    const css = readFileSync(
        join(process.cwd(), 'www', 'garden', 'css', 'experience.css'), 'utf8');
    expect(css.match(/linear-gradient\(#cfe0ea/g)).toHaveLength(2);

    // The top of the gradient beats the darkest foliage, and the bottom beats
    // the palest bark, which is the pair no single value could serve.
    const lum = (hex) => {
        const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
        return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    };
    const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    const darkestLeaf = ALL.reduce((a, s) => lum(s.foliage.summer) < lum(a.foliage.summer) ? s : a);
    const palestBark = ALL.reduce((a, s) => lum(s.bark) > lum(a.bark) ? s : a);
    expect(ratio(0xcfe0ea, darkestLeaf.foliage.summer)).toBeGreaterThan(2);
    expect(ratio(0x9a9182, palestBark.bark)).toBeGreaterThan(1.5);
    // And the old flat green failed the second of those, which is the guard.
    expect(ratio(0x1d2a18, palestBark.bark)).toBeGreaterThan(3);
    expect(ratio(0x1d2a18, darkestLeaf.foliage.summer)).toBeLessThan(2);
});
