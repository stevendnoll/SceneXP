// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * ui.js - Fractal Garden's chrome: the season chip, the plant modal, and the
 * tree card.
 *
 * The house chrome is reused rather than reinvented. The shared stylesheet
 * already carries the loading screen, the welcome overlay, the floating button
 * family, and the modal family, all themed by data-ui-theme="garden".
 *
 * ACCESSIBILITY IS BUILT IN HERE RATHER THAN RETROFITTED. The species grid is
 * a real radio group, the sliders are real range inputs carrying worded
 * aria-valuetext, health is stated in words as well as shown in colour, and
 * every modal returns focus to whatever opened it. A garden that can only be
 * tended with a mouse is a garden half the visitors cannot tend.
 *
 * THE CHIP IS A STATUS READOUT AND NOTHING ELSE. Pointer events pass straight
 * through it: a chip that swallowed a planting tap because the visitor
 * happened to aim at it would be a small and infuriating bug.
 */

import { GARDEN_CONFIG } from './config.min.js';
import { seasonAt, hourAt } from './clock.min.js';
import { SPECIES, DEFAULT_CUSTOM, isFlowering, speciesById } from './species.min.js';
import { healthBand, HEALTH_WORDS, cropAt } from './garden.min.js';
import { fruitStageAt, fruitWords } from './clock.min.js';

let chipEl = null;
let lastChip = '';

let modalEl = null;
let modalGrid = null;
let tabFlowering = null;
let tabFoliage = null;
let modalPreview = null;
let modalPlant = null;
let modalTitle = null;
let modalNote = null;

let cardEl = null;
let cardTitle = null;
let cardBody = null;
let cardPreview = null;
let cardThirst = null;
let cardThirstFill = null;
let cardWater = null;
let cardRemove = null;

let lakeEl = null;
let lakeCanvas = null;
let lakeNoteEl = null;

let tendEl = null;
let tendPlant = null;
let tendList = null;
let tendEmpty = null;
// The ids currently in the list, joined, so a rebuild happens when the SET of
// trees moves and not when one of them merely got a year older. Rebuilding on
// every tick would drop focus out of the panel once a second, which is the one
// thing a keyboard route must never do.
let tendKey = '';

let resetEl = null;
let resetBody = null;
let resetConfirm = null;
let resetCancel = null;

let returnFocus = null;
let onPlantChosen = null;
let onCustomChanged = null;
let onWaterChosen = null;
let onRemoveChosen = null;
let onResetConfirmed = null;
let onPlantRequested = null;
let onTreeChosen = null;

let selection = { species: SPECIES[0].id, custom: { ...DEFAULT_CUSTOM } };
let cardEntry = null;

const SEASON_LABEL = {
    spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter'
};

// ---- The season chip -------------------------------------------------------

/** The chip's line. Pure, so what the visitor reads can be asserted without a
 *  DOM. Years count from one, because a garden in its first year is in year
 *  one to everybody except a programmer. */
export function chipText(year, hour, weatherWord = '') {
    const season = SEASON_LABEL[seasonAt(hour)] || '';
    const n = Math.floor(year) + 1;
    const base = `${season}, year ${n}`;
    return weatherWord ? `${base} · ${weatherWord}` : base;
}

export function updateHud(year, elapsedSeconds, weatherWord = '') {
    if (!chipEl) return;
    const text = chipText(year, hourAt(elapsedSeconds), weatherWord);
    if (text === lastChip) return;
    lastChip = text;
    chipEl.textContent = text;
}

/**
 * Show or hide the season chip.
 *
 * ---- IT FADES RATHER THAN BEING `hidden`, UNLIKE THE REST OF THE CHROME ----
 *
 * Two reasons, and the second is the one that decides it.
 *
 * The chip is built on opacity: it has been fading in on load since M1-8, and a
 * readout that fades in on arrival and POPS out when the help card opens is two
 * different objects. `display: none` cannot be transitioned, so `hidden` would
 * cost the fade.
 *
 * AND IT IS AN `aria-live` REGION. Removing one from the document and putting it
 * back is a change some screen readers announce, so a visitor who opened the
 * help card would hear the weather read out at them for their trouble. Opacity
 * never touches the accessibility tree, so nothing is announced either way. It
 * does mean the chip is still readable to a screen reader behind the card, which
 * is the right trade: it is a status readout rather than a control, there is
 * nothing to press on it by mistake, and the calendar is held while the card is
 * up so its text cannot change under anyone.
 */
export function setHudVisible(on) {
    if (chipEl) chipEl.classList.toggle('visible', !!on);
}

/**
 * What the Water all button says, and what a screen reader hears.
 *
 * Pure, so the copy can be asserted, in the same tradition as `chipText` and
 * `resetPrompt`.
 *
 * ---- THE COUNT CAME OFF THE LABEL WHEN THE BUTTON STOPPED COUNTING ----
 *
 * It read "Water 4 trees" while the button watered exactly the trees that were
 * asking, and the number was a reading of the garden: four are thirsty. The
 * button waters the whole plot now, so that same number would say how many
 * trees you own, which the plot already tells you and which changes nothing
 * about whether pressing it is worth doing. A number that no longer means what
 * it used to mean is worse than no number.
 *
 * "Water all" is the plain description of what happens, and it is stable, which
 * a control that is now permanently on screen wants to be.
 *
 * THE COUNT SURVIVES IN THE ARIA LABEL, where it is doing different work: a
 * visitor who cannot see the plot has no other way to know how much "all" is.
 * Guarded at one, because "Water all 1 trees" is what counting without reading
 * produces, and it is the same "all 1 of your trees" that `resetPrompt` already
 * had to solve.
 */
export function waterAllText(count) {
    return {
        label: 'Water all',
        aria: count === 1
            ? 'Water the one tree in your garden'
            : `Water all ${count} trees in your garden`
    };
}

// ---- Wiring ----------------------------------------------------------------

export function initUi(handlers = {}) {
    if (typeof document === 'undefined') return null;
    onPlantChosen = handlers.onPlant;
    onCustomChanged = handlers.onCustomChange;
    onWaterChosen = handlers.onWater;
    onRemoveChosen = handlers.onRemove;
    onResetConfirmed = handlers.onReset;
    onPlantRequested = handlers.onPlantRequest;
    onTreeChosen = handlers.onTreeChoose;

    chipEl = document.getElementById('season-chip');

    modalEl = document.getElementById('plant-modal');
    modalGrid = document.getElementById('species-grid');
    tabFlowering = document.getElementById('tab-flowering');
    tabFoliage = document.getElementById('tab-foliage');
    modalPreview = document.getElementById('preview-canvas');
    modalPlant = document.getElementById('plant-confirm');
    modalTitle = document.getElementById('plant-title');
    modalNote = document.getElementById('plant-note');

    cardEl = document.getElementById('tree-card');
    cardTitle = document.getElementById('tree-title');
    cardBody = document.getElementById('tree-body');
    cardPreview = document.getElementById('tree-preview');
    cardThirst = document.getElementById('tree-thirst');
    cardThirstFill = document.getElementById('tree-thirst-fill');
    cardWater = document.getElementById('tree-water');
    cardRemove = document.getElementById('tree-remove');

    lakeEl = document.getElementById('lake-card');
    lakeCanvas = document.getElementById('lake-view');
    lakeNoteEl = document.getElementById('lake-note');

    resetEl = document.getElementById('reset-modal');
    resetBody = document.getElementById('reset-body');
    resetConfirm = document.getElementById('reset-confirm');
    resetCancel = document.getElementById('reset-cancel');

    tendEl = document.getElementById('tend-panel');
    tendPlant = document.getElementById('tend-plant');
    tendList = document.getElementById('tend-list');
    tendEmpty = document.getElementById('tend-empty');
    tendKey = '';

    // ---- A DIALOG STARTS CLOSED, AND THAT IS THIS MODULE'S BUSINESS ------
    // The markup carries `class="hidden"` on all four, and it is still the
    // right place for it: the page must not flash a dialog before the script
    // runs. But a module that OWNS four dialogs should not be relying on an
    // attribute typed in another file for the state it reports. `isLakeOpen`
    // was true from the first frame under the harness for exactly that reason,
    // which suppressed the planting nudge, because the stub fabricates elements
    // without their attributes. The same trap as `.ui-float` needing
    // `.visible`, met for the third time.
    for (const el of [modalEl, cardEl, lakeEl, resetEl]) {
        if (el) el.classList.add('hidden');
    }

    buildSpeciesGrid();
    buildTabs();

    if (modalPlant) {
        modalPlant.addEventListener('click', () => {
            const chosen = { ...selection, custom: { ...selection.custom } };
            closePlantModal();
            if (onPlantChosen) onPlantChosen(chosen);
        });
    }
    if (cardWater) cardWater.addEventListener('click', () => {
        if (onWaterChosen && cardEntry) onWaterChosen(cardEntry);
    });
    if (cardRemove) cardRemove.addEventListener('click', () => {
        const entry = cardEntry;
        closeTreeCard();
        if (onRemoveChosen && entry) onRemoveChosen(entry);
    });

    if (tendPlant) tendPlant.addEventListener('click', () => {
        if (onPlantRequested) onPlantRequested();
    });

    if (resetCancel) resetCancel.addEventListener('click', () => closeResetModal());
    if (resetConfirm) resetConfirm.addEventListener('click', () => {
        closeResetModal();
        if (onResetConfirmed) onResetConfirmed();
    });

    for (const el of [modalEl, cardEl, lakeEl, resetEl]) {
        if (!el) continue;
        el.querySelectorAll('[data-close]').forEach((c) =>
            c.addEventListener('click', () => {
                if (el === modalEl) closePlantModal();
                else if (el === cardEl) closeTreeCard();
                else if (el === lakeEl) closeLakeCard();
                else closeResetModal();
            }));
    }

    document.addEventListener('keydown', (event) => {
        if (event.code !== 'Escape') return;
        // Innermost first: the reset dialog can open over the tree card.
        if (isResetOpen()) closeResetModal();
        else if (isPlantOpen()) closePlantModal();
        else if (isCardOpen()) closeTreeCard();
        else if (isLakeOpen()) closeLakeCard();
    });

    return { modalEl, cardEl, lakeEl, resetEl, chipEl };
}

// ---- The reset dialog ------------------------------------------------------

/**
 * Clearing the garden asks in the page, not in the browser.
 *
 * A NATIVE `confirm()` IS THE ONE PIECE OF SOMEBODY ELSE'S UI IN THE SCENE. It
 * arrives unstyled at the top of the window, says "localhost:8000 says", and
 * cannot be reached by the same Escape and backdrop handling everything else
 * here uses. For the one irreversible action in the garden it is also the least
 * reassuring surface available.
 */
export function resetPrompt(trees) {
    // "all 1 of your trees" is what counting without reading produces.
    const subject = trees === 1 ? 'your only tree' : `all ${trees} of your trees`;
    return `This clears ${subject} and starts a new garden. There is no undo.`;
}

export function openResetModal(trees) {
    if (!resetEl) return false;
    if (resetBody) resetBody.textContent = resetPrompt(trees);
    returnFocus = typeof document !== 'undefined' ? document.activeElement : null;
    resetEl.classList.remove('hidden');
    if (resetCancel && resetCancel.focus) resetCancel.focus();
    return true;
}

export function closeResetModal() {
    if (!resetEl) return;
    resetEl.classList.add('hidden');
    restoreFocus();
}

export function isResetOpen() {
    return !!resetEl && !resetEl.classList.contains('hidden');
}

// ---- The two groups --------------------------------------------------------

/**
 * Show one group, and move the selection into it if it is not there already.
 *
 * THE SELECTION HAS TO FOLLOW, or switching tabs leaves the preview showing a
 * tree the grid no longer offers and the Plant button planting something the
 * visitor cannot see. It lands on the first of the new group, which is also
 * the smallest, because the list is ordered small to large.
 */
function showGroup(name) {
    const flowering = name !== 'foliage';
    for (const [btn, on] of [[tabFlowering, flowering], [tabFoliage, !flowering]]) {
        if (!btn) continue;
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
        // Only the selected tab is in the tab order. Arrow keys move between
        // them, which is what a tablist owes and what a row of plain buttons
        // would not give.
        btn.tabIndex = on ? 0 : -1;
    }
    if (modalGrid) {
        modalGrid.setAttribute('aria-labelledby', flowering ? 'tab-flowering' : 'tab-foliage');
    }
    const chosen = speciesById(selection.species);
    if (!chosen || isFlowering(chosen) !== flowering) {
        const first = SPECIES.find((s) => isFlowering(s) === flowering);
        if (first) selection.species = first.id;
    }
    buildSpeciesGrid();
    refreshSelectionText();
    if (onCustomChanged) onCustomChanged(selection);
}

function buildTabs() {
    const pair = [tabFlowering, tabFoliage].filter(Boolean);
    if (!pair.length) return;
    for (const btn of pair) {
        btn.addEventListener('click', () => {
            showGroup(btn === tabFoliage ? 'foliage' : 'flowering');
        });
        btn.addEventListener('keydown', (event) => {
            if (event.code !== 'ArrowLeft' && event.code !== 'ArrowRight') return;
            event.preventDefault();
            const other = btn === tabFoliage ? tabFlowering : tabFoliage;
            if (!other) return;
            showGroup(other === tabFoliage ? 'foliage' : 'flowering');
            other.focus();
        });
    }
    // ---- IT OPENS ON FLOWERING ----------------------------------------
    // Which is also what the markup ships, so the two now agree. They did not
    // before: this opened on whichever group the current selection was in, and
    // the default selection is SPECIES[0], the Japanese Maple, which is a
    // FOLIAGE tree. So the static markup said Flowering, the JS immediately
    // said Foliage, and nothing had chosen either.
    //
    // Flowering is the right default on its merits too. It holds the trees that
    // do something a visitor can watch for, which is what somebody opening this
    // for the first time is here to find.
    //
    // STICKY AFTER THAT, because this runs once at init rather than on every
    // open: a visitor planting a row of oaks switches tabs once, not once per
    // tree.
    showGroup('flowering');
}

// ---- The species grid ------------------------------------------------------

/**
 * Which group is showing. Not a class on an element: `aria-selected` on the
 * tabs is the state, so what a screen reader is told and what an eye is shown
 * are one fact and cannot come apart.
 */
function currentGroup() {
    return tabFoliage && tabFoliage.getAttribute('aria-selected') === 'true'
        ? 'foliage' : 'flowering';
}

function buildSpeciesGrid() {
    if (!modalGrid) return;
    modalGrid.innerHTML = '';
    const wantFlowering = currentGroup() === 'flowering';
    for (const s of SPECIES.filter((sp) => isFlowering(sp) === wantFlowering)) {
        const label = document.createElement('label');
        label.className = 'species-option';

        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'species';
        input.value = s.id;
        input.checked = s.id === selection.species;
        input.addEventListener('change', () => {
            selection.species = s.id;
            refreshSelectionText();
            if (onCustomChanged) onCustomChanged(selection);
        });

        // A swatch of the bark, because bark colour is a first-class part of
        // the choice rather than a detail. Named in text too, so the grid is
        // usable without seeing the colour.
        const swatch = document.createElement('span');
        swatch.className = 'species-swatch';
        swatch.style.setProperty('--bark', `#${s.bark.toString(16).padStart(6, '0')}`);
        swatch.setAttribute('aria-hidden', 'true');

        const name = document.createElement('span');
        name.className = 'species-name';
        name.textContent = s.name;

        const meta = document.createElement('span');
        meta.className = 'species-meta';
        meta.textContent = `${s.size} · ${s.barkName} bark${s.evergreen ? ' · evergreen' : ''}`;

        label.appendChild(input);
        label.appendChild(swatch);
        label.appendChild(name);
        label.appendChild(meta);
        modalGrid.appendChild(label);
    }
}


function refreshSelectionText() {
    const s = speciesById(selection.species);
    if (!s) return;
    if (modalTitle) modalTitle.textContent = s.name;
    if (modalNote) modalNote.textContent = s.note;
}

// ---- The plant modal -------------------------------------------------------

/**
 * What the modal's confirm button says. Pure, so the copy can be asserted.
 *
 * ---- "HERE" IS A WORD ONLY A TAP HAS EARNED ----
 *
 * The modal used to be reachable one way: point at a patch of grass, and the
 * button confirms the spot under the finger. The keyboard route has no spot,
 * because there was no pointer to put one under, so the plot picks the nearest
 * free cell to its middle. Telling that visitor "Plant it HERE" names a place
 * they never chose and cannot see.
 *
 * @param {boolean} full   no room left, so the button is a statement
 * @param {boolean} placed the visitor chose the spot, so "here" is true
 */
export function plantButtonText(full, placed) {
    if (full) return 'The plot is full';
    return placed ? 'Plant it here' : 'Plant it in the plot';
}

export function openPlantModal(context = {}) {
    if (!modalEl) return;
    returnFocus = document.activeElement;
    refreshSelectionText();
    modalEl.classList.remove('hidden');
    if (modalPlant) {
        modalPlant.disabled = !!context.full;
        // `placed` defaults TRUE, so every existing caller keeps the wording it
        // had and only the route that genuinely has no spot says otherwise.
        modalPlant.textContent = plantButtonText(
            !!context.full, context.placed !== false);
        modalPlant.focus();
    }
    if (onCustomChanged) onCustomChanged(selection);
}

export function closePlantModal() {
    if (!modalEl) return;
    modalEl.classList.add('hidden');
    restoreFocus();
}

export function isPlantOpen() {
    return !!modalEl && !modalEl.classList.contains('hidden');
}

export function getSelection() {
    return { species: selection.species, custom: { ...selection.custom } };
}

/**
 * Whichever canvas the renderer should be drawing into.
 *
 * ONE RENDERER, TWO DESTINATIONS. Both modals show a turning tree and neither
 * can be open while the other is, so the scissor-rectangle path in main.js asks
 * here rather than carrying a second copy of itself. The card is tested first
 * because it is the one that can be opened while a plant modal is still
 * finishing its close animation.
 */
export function getPreviewCanvas() {
    if (isCardOpen()) return cardPreview;
    return modalPreview;
}

/**
 * Paint the card's thirst gauge.
 *
 * THE SAME GAUGE THAT STANDS ON THE BED, and deliberately so: the fill is the
 * water, the track is what is missing and goes amber when it matters, and a
 * dark tick marks where the two meet. Blue against amber is 1.13:1, a hue pair
 * and not a luminance one, so that boundary is drawn rather than left to
 * emerge, exactly as it is in the shader.
 *
 * The percentage stays in the card's text. Colour is never the only carrier of
 * anything in this scene, and a gauge on its own would be.
 */
function paintThirst(moisture, urgent) {
    if (!cardThirst || !cardThirstFill) return;
    const fill = Math.max(0, Math.min(1, moisture));
    cardThirstFill.style.width = `${(fill * 100).toFixed(1)}%`;
    cardThirst.dataset.urgent = urgent ? 'true' : 'false';
    // No boundary to draw on a tank that is all one thing.
    cardThirstFill.dataset.edge = (fill > 0.02 && fill < 0.98) ? 'true' : 'false';
    cardThirst.setAttribute('aria-label',
        `Water level ${Math.round(fill * 100)} percent`);
}

// ---- The tree card ---------------------------------------------------------

/**
 * The card's lines. Pure, so the copy can be asserted.
 *
 * `context` carries what the card cannot work out from the record alone:
 * `hour` for the blossom and fruit stage, and `falling` for the one line that
 * explains why a tree is thirsty in the rain.
 */
export function cardLines(record, resolved, ageYears, context = {}) {
    const band = healthBand(record.health);
    const years = Math.floor(ageYears);
    const age = years < 1 ? 'Planted this year' : years === 1 ? 'One year old' : `${years} years old`;
    const moisture = Math.round(record.moisture * 100);
    const thirst = moisture > 60 ? 'Well watered'
        : moisture > 25 ? 'Getting thirsty'
            : moisture > 0 ? 'Thirsty' : 'Bone dry';

    // What the tree is DOING, in plain words, beside the health band it already
    // names. Colour is never the only carrier of anything in this scene, so a
    // visitor who cannot see an orange pixel is still told there is ripe fruit
    // on the tree.
    const stage = resolved.schedule && context.hour !== undefined
        ? fruitStageAt(context.hour, resolved.schedule)
        : null;
    // THROUGH `cropAt`, which is the same function the shader scales the
    // blossom and the fruit by. Reading the calendar alone told saplings and
    // dead trees they were carrying fruit they do not have. See `fruitWords`.
    const doing = stage
        ? fruitWords(stage, !!resolved.fruit, cropAt(record.growth, record.health))
        : '';

    // WHY A TREE CAN BE THIRSTY IN A DOWNPOUR, and it is true rather than an
    // apology for the rule. A nursery tree stands in a root ball of imported
    // compost that is drier and better drained than the ground around it, so
    // rain runs off it and past it, which is why every nursery tells you to
    // water a new tree by hand through its first summers whatever the weather
    // does. Only shown when both halves are actually on screen.
    const runoff = context.falling && moisture <= 25
        ? 'Rain runs straight off a young tree\u2019s root ball, so it still wants watering by hand.'
        : '';

    const texts = [age, HEALTH_WORDS[band]];
    if (doing) texts.push(doing);
    texts.push(`${thirst}, ${moisture}%`);
    if (runoff) texts.push(runoff);

    return {
        title: resolved.name,
        age,
        health: HEALTH_WORDS[band],
        band,
        moisture,
        // Plain words alongside the bar, because a bar is a colour and colour
        // is never the only carrier.
        thirst,
        // Whether the gauge should be shouting. The SAME LINE the bed's gauge
        // and the droplet use, read off the config rather than a number typed
        // here, so the card cannot disagree with the world about when a tree is
        // in trouble.
        thirsty: record.moisture < GARDEN_CONFIG.garden.moisture.thirstyBelow,
        doing,
        runoff,
        texts
    };
}

export function openTreeCard(entry, ageYears, context = {}) {
    if (!cardEl || !entry) return;
    cardEntry = entry;
    returnFocus = document.activeElement;
    const lines = cardLines(entry.record, entry.resolved, ageYears, context);
    if (cardTitle) cardTitle.textContent = lines.title;
    writeCardBody(lines);
    paintThirst(entry.record.moisture, lines.thirsty);
    cardEl.classList.remove('hidden');
    if (cardWater) cardWater.focus();
}

export function refreshTreeCard(ageYears, context = {}) {
    if (!isCardOpen() || !cardEntry) return;
    const lines = cardLines(cardEntry.record, cardEntry.resolved, ageYears, context);
    writeCardBody(lines);
    // The card is refreshed every frame it is open, so watering a tree fills
    // the gauge while the visitor is looking at it rather than on reopening.
    paintThirst(cardEntry.record.moisture, lines.thirsty);
}

/**
 * THE LINE COUNT VARIES NOW, WHICH THE OLD REFRESH COULD NOT HAVE SURVIVED. It
 * wrote into the paragraphs that already existed and stopped at whichever list
 * ran out first, which was correct only while the card had exactly three lines
 * every time. A blossoming tree has four and a thirsty one in the rain has five,
 * so the body is rebuilt when the count moves and written in place when it has
 * not, which keeps the common path free of DOM churn.
 */
function writeCardBody(lines) {
    if (!cardBody) return;
    const texts = lines.texts;
    if (cardBody.children.length !== texts.length) {
        cardBody.innerHTML = '';
        for (const text of texts) {
            const p = document.createElement('p');
            p.className = 'tree-line';
            p.textContent = text;
            cardBody.appendChild(p);
        }
    } else {
        const paras = cardBody.children;
        for (let i = 0; i < texts.length; i++) paras[i].textContent = texts[i];
    }
    cardBody.dataset.band = lines.band;
}

export function closeTreeCard() {
    if (!cardEl) return;
    cardEl.classList.add('hidden');
    cardEntry = null;
    restoreFocus();
}

// ---- The tend panel, which is the keyboard's way into the plot --------------

/**
 * One tree as a line a screen reader can read out.
 *
 * ---- IT IS THE BUTTON'S TEXT, NOT AN `aria-label` OVER DIFFERENT TEXT ----
 *
 * A visible label and an accessible name that disagree is a WCAG failure and a
 * practical one: voice control types what it sees. So the sentence below is
 * both, and the panel is styled to show it.
 *
 * BUILT FROM `cardLines`, which is the same function the tree card writes its
 * body from. The list and the card cannot describe one tree two ways, and
 * neither can go stale when the other's wording changes.
 *
 * THE ADVICE IS LEFT OUT ON PURPOSE. `lines.texts` also carries the runoff
 * sentence and the fruit stage, which belong on the card a visitor has chosen
 * to open. A list is for CHOOSING, so it carries identity and state and stops:
 * which tree, how old, how it is doing, how thirsty.
 */
export function treeListLabel(lines) {
    return `${lines.title}, ${lines.age.toLowerCase()}, ${lines.health.toLowerCase()}, ${lines.thirst.toLowerCase()} at ${lines.moisture} percent`;
}

/**
 * Keep the off-screen list in step with the plot.
 *
 * ---- REBUILT WHEN THE SET MOVES, WRITTEN IN PLACE WHEN IT HAS NOT ----
 *
 * Called from the same once-a-second tick as `syncWaterAll`, because a tree's
 * line carries its age and its thirst and both drift. Rebuilding the list on
 * every one of those ticks would take focus out of the panel once a second,
 * which would make the route unusable for exactly the visitor it exists for.
 * So the tree ids decide: a plant, a remove or a restore rebuilds, and
 * everything else only rewrites text that actually changed.
 *
 * AND THE FOCUSED ROW IS LEFT ALONE. Some screen readers re-announce a button
 * whose text changes underneath the cursor, so the one row the visitor is
 * standing on keeps its wording until they move off it. It is refreshed the
 * moment they do, and the card they open reads the live record anyway.
 *
 * @param {Array} entries the planted trees, in `getTrees()` order
 * @param {Function} lineFor entry to `cardLines` output, from the caller that
 *        owns the clock and the weather
 */
export function syncTreeList(entries, lineFor) {
    if (!tendList) return;
    const list = entries || [];
    const key = list.map((e) => e.record.id).join(',');
    const active = typeof document !== 'undefined' ? document.activeElement : null;

    if (key !== tendKey) {
        // ---- A REBUILD CAN DROP FOCUS ON THE FLOOR ----------------------
        // Removing a tree destroys the very button that opened its card, and
        // the card's own focus restore then aims at an element no longer in the
        // document, which silently lands focus on <body>: the visitor is thrown
        // back to the top of the page with no idea why. Caught here, where the
        // element is known to be going, and handed to the one control that is
        // always present.
        const losing = !!(active && tendList.contains && tendList.contains(active));
        tendKey = key;
        tendList.innerHTML = '';
        for (const entry of list) {
            const li = document.createElement('li');
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'tend-row';
            btn.dataset.treeId = entry.record.id;
            btn.textContent = treeListLabel(lineFor(entry));
            btn.addEventListener('click', () => {
                if (onTreeChosen) onTreeChosen(entry);
            });
            li.appendChild(btn);
            tendList.appendChild(li);
        }
        if (losing && tendPlant && tendPlant.focus) {
            try { tendPlant.focus({ preventScroll: true }); } catch (e) { /* gone */ }
        }
    } else {
        const rows = tendList.children;
        for (let i = 0; i < list.length && i < rows.length; i++) {
            const btn = rows[i].children ? rows[i].children[0] : null;
            if (!btn || btn === active) continue;
            const text = treeListLabel(lineFor(list[i]));
            if (btn.textContent !== text) btn.textContent = text;
        }
    }

    // THE EMPTY PLOT SAYS SO. A group containing one button and an empty list
    // reads as broken rather than as empty, and "no trees planted yet" is also
    // the answer to the question somebody arriving here is asking.
    if (tendEmpty) tendEmpty.hidden = list.length > 0;
}

/** Whether the panel is offered at all. Hidden with the rest of the chrome
 *  while the welcome card is up: there is nothing to tend behind it, and it
 *  would be in the card's tab order. */
export function setTendPanelHidden(hidden) {
    if (tendEl) tendEl.hidden = !!hidden;
}

export function getTendPanel() {
    return tendEl;
}

export function isCardOpen() {
    return !!cardEl && !cardEl.classList.contains('hidden');
}

export function getCardEntry() {
    return cardEntry;
}

export function anyModalOpen() {
    return isPlantOpen() || isCardOpen() || isResetOpen() || isLakeOpen();
}

// ---- The lake's card -------------------------------------------------------

/**
 * The line under the borrowed camera. Pure, so the copy can be asserted.
 *
 * IT IS ABOUT THE LAKE AND IT REPORTS ON THE DUCKS, which is the right way
 * round now and was not before. The card used to be a portrait of one duck and
 * had to close itself when they left; the lake does not leave, so instead the
 * line changes and the visitor keeps the choice. That also means the card can
 * be opened in the cold half of the year and say something true rather than
 * showing empty water with no explanation.
 *
 * ---- AND IT COUNTS THE DUCKS RATHER THAN REMEMBERING HOW MANY THERE WERE ----
 *
 * The summer line used to open "Three ducks, drifting" as a literal, and a
 * phone builds two of them: `wildlife.js` halves the count on mobile, and it
 * has since the ducks arrived. QA read the card on a phone, counted the lake,
 * and found the sentence claiming a bird that was not on the water.
 *
 * A COUNT IN PROSE GOES STALE SILENTLY, because nothing fails when the value it
 * was copied from moves. `duckCount` is now the one reading of it and this
 * sentence is built from the same number the geometry is, so the card cannot
 * disagree with the lake again whatever the count becomes.
 *
 * @param {number} flight 0 with the ducks on the water, 1 with them gone
 * @param {number} count how many are on the water, from `duckCount`
 */
export function lakeNote(flight, count = 3) {
    if (flight >= 0.999) {
        return 'The ducks have gone south for the winter. The lake keeps without them, and they come back as the spring opens.';
    }
    if (flight > 0.02) {
        return 'They are leaving. Ducks go south before the winter, and these are climbing away over the far shore.';
    }
    const n = Math.max(0, Math.round(Number(count) || 0));
    const many = n !== 1;
    return `${countWord(n)} duck${many ? 's' : ''}, drifting. ${many ? 'They keep' : 'It keeps'} to the lake all spring and summer, and ${many ? 'go' : 'goes'} south before the winter closes it.`;
}

/**
 * A small number as the word for it, because a card is prose and not a readout.
 *
 * Only ever asked for two or three, but written for the range a config could
 * plausibly hold, and falling back to the digits rather than to nothing so an
 * unexpected count reads awkwardly instead of reading as "undefined ducks".
 */
const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];

export function countWord(n) {
    return NUMBER_WORDS[n] || String(n);
}

/** Open the card. It has no subject beyond the lake, so it takes no handle,
 *  only how far through the year the ducks are and how many of them there are. */
export function openLakeCard(flight, count) {
    if (!lakeEl) return false;
    returnFocus = typeof document !== 'undefined' ? document.activeElement : null;
    if (lakeNoteEl) lakeNoteEl.textContent = lakeNote(flight, count);
    lakeEl.classList.remove('hidden');
    const close = lakeEl.querySelector('.modal-close');
    if (close && close.focus) close.focus();
    return true;
}

/** Keep the line honest while the card is open, so somebody watching the
 *  take-off is told what they are watching as it happens. */
export function refreshLakeCard(flight, count) {
    if (!isLakeOpen() || !lakeNoteEl) return;
    const text = lakeNote(flight, count);
    if (lakeNoteEl.textContent !== text) lakeNoteEl.textContent = text;
}

export function closeLakeCard() {
    if (!lakeEl) return;
    lakeEl.classList.add('hidden');
    restoreFocus();
}

export function isLakeOpen() {
    return !!lakeEl && !lakeEl.classList.contains('hidden');
}

export function getLakeCanvas() {
    return lakeCanvas;
}

function restoreFocus() {
    const el = returnFocus;
    returnFocus = null;
    if (el && typeof el.focus === 'function') {
        try { el.focus({ preventScroll: true }); } catch (e) { /* not focusable */ }
    }
}

// ---- Toasts ----------------------------------------------------------------

let toastEl = null;
let toastTimer = 0;

export function toast(message, ms = 2600) {
    if (typeof document === 'undefined') return;
    if (!toastEl) toastEl = document.getElementById('garden-toast');
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add('visible');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('visible'), ms);
}

export function __resetUi() {
    chipEl = null;
    lastChip = '';
    modalEl = null;
    cardEl = null;
    cardEntry = null;
    lakeEl = null;
    lakeCanvas = null;
    lakeNoteEl = null;
    tendEl = null;
    tendPlant = null;
    tendList = null;
    tendEmpty = null;
    tendKey = '';
    resetEl = null;
    resetBody = null;
    resetConfirm = null;
    resetCancel = null;
    toastEl = null;
    selection = { species: SPECIES[0].id, custom: { ...DEFAULT_CUSTOM } };
}
