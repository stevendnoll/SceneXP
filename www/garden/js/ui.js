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
import { healthBand, HEALTH_WORDS } from './garden.min.js';
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

export function showHud() {
    if (chipEl) chipEl.classList.add('visible');
}

// ---- Wiring ----------------------------------------------------------------

export function initUi(handlers = {}) {
    if (typeof document === 'undefined') return null;
    onPlantChosen = handlers.onPlant;
    onCustomChanged = handlers.onCustomChange;
    onWaterChosen = handlers.onWater;
    onRemoveChosen = handlers.onRemove;
    onResetConfirmed = handlers.onReset;

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

    resetEl = document.getElementById('reset-modal');
    resetBody = document.getElementById('reset-body');
    resetConfirm = document.getElementById('reset-confirm');
    resetCancel = document.getElementById('reset-cancel');

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

    if (resetCancel) resetCancel.addEventListener('click', () => closeResetModal());
    if (resetConfirm) resetConfirm.addEventListener('click', () => {
        closeResetModal();
        if (onResetConfirmed) onResetConfirmed();
    });

    for (const el of [modalEl, cardEl, resetEl]) {
        if (!el) continue;
        el.querySelectorAll('[data-close]').forEach((c) =>
            c.addEventListener('click', () => {
                if (el === modalEl) closePlantModal();
                else if (el === cardEl) closeTreeCard();
                else closeResetModal();
            }));
    }

    document.addEventListener('keydown', (event) => {
        if (event.code !== 'Escape') return;
        // Innermost first: the reset dialog can open over the tree card.
        if (isResetOpen()) closeResetModal();
        else if (isPlantOpen()) closePlantModal();
        else if (isCardOpen()) closeTreeCard();
    });

    return { modalEl, cardEl, resetEl, chipEl };
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

export function openPlantModal(context = {}) {
    if (!modalEl) return;
    returnFocus = document.activeElement;
    refreshSelectionText();
    modalEl.classList.remove('hidden');
    if (modalPlant) {
        modalPlant.disabled = !!context.full;
        modalPlant.textContent = context.full ? 'The plot is full' : 'Plant it here';
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
    const doing = stage ? fruitWords(stage, !!resolved.fruit) : '';

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

export function isCardOpen() {
    return !!cardEl && !cardEl.classList.contains('hidden');
}

export function getCardEntry() {
    return cardEntry;
}

export function anyModalOpen() {
    return isPlantOpen() || isCardOpen() || isResetOpen();
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
    resetEl = null;
    resetBody = null;
    resetConfirm = null;
    resetCancel = null;
    toastEl = null;
    selection = { species: SPECIES[0].id, custom: { ...DEFAULT_CUSTOM } };
}
