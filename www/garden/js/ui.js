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

import { seasonAt, hourAt } from './clock.min.js';
import { SPECIES, SLIDERS, DEFAULT_CUSTOM, sliderWords, speciesById } from './species.min.js';
import { healthBand, HEALTH_WORDS } from './garden.min.js';

let chipEl = null;
let lastChip = '';

let modalEl = null;
let modalGrid = null;
let modalSliders = null;
let modalPreview = null;
let modalPlant = null;
let modalTitle = null;
let modalNote = null;

let cardEl = null;
let cardTitle = null;
let cardBody = null;
let cardWater = null;
let cardRemove = null;

let returnFocus = null;
let onPlantChosen = null;
let onCustomChanged = null;
let onWaterChosen = null;
let onRemoveChosen = null;

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

    chipEl = document.getElementById('season-chip');

    modalEl = document.getElementById('plant-modal');
    modalGrid = document.getElementById('species-grid');
    modalSliders = document.getElementById('slider-list');
    modalPreview = document.getElementById('preview-canvas');
    modalPlant = document.getElementById('plant-confirm');
    modalTitle = document.getElementById('plant-title');
    modalNote = document.getElementById('plant-note');

    cardEl = document.getElementById('tree-card');
    cardTitle = document.getElementById('tree-title');
    cardBody = document.getElementById('tree-body');
    cardWater = document.getElementById('tree-water');
    cardRemove = document.getElementById('tree-remove');

    buildSpeciesGrid();
    buildSliders();

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

    for (const el of [modalEl, cardEl]) {
        if (!el) continue;
        el.querySelectorAll('[data-close]').forEach((c) =>
            c.addEventListener('click', () => {
                if (el === modalEl) closePlantModal(); else closeTreeCard();
            }));
    }

    document.addEventListener('keydown', (event) => {
        if (event.code !== 'Escape') return;
        if (isPlantOpen()) closePlantModal();
        else if (isCardOpen()) closeTreeCard();
    });

    return { modalEl, cardEl, chipEl };
}

// ---- The species grid ------------------------------------------------------

function buildSpeciesGrid() {
    if (!modalGrid) return;
    modalGrid.innerHTML = '';
    for (const s of SPECIES) {
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

function buildSliders() {
    if (!modalSliders) return;
    modalSliders.innerHTML = '';
    for (const s of SLIDERS) {
        const row = document.createElement('div');
        row.className = 'slider-row';

        const label = document.createElement('label');
        label.className = 'slider-label';
        label.setAttribute('for', `slider-${s.key}`);
        label.textContent = s.label;

        const input = document.createElement('input');
        input.type = 'range';
        input.id = `slider-${s.key}`;
        input.className = 'slider-input';
        input.min = String(s.min);
        input.max = String(s.max);
        input.step = String(s.step);
        input.value = String(selection.custom[s.key]);

        const readout = document.createElement('span');
        readout.className = 'slider-readout';

        const sync = () => {
            const value = parseFloat(input.value);
            selection.custom[s.key] = value;
            const words = sliderWords(s.key, value);
            // WORDS, NOT NUMBERS. "0.85" tells a screen reader nothing about
            // what the tree will look like; "narrow" does.
            input.setAttribute('aria-valuetext', words);
            readout.textContent = words;
            if (onCustomChanged) onCustomChanged(selection);
        };
        input.addEventListener('input', sync);
        sync();

        row.appendChild(label);
        row.appendChild(input);
        row.appendChild(readout);
        modalSliders.appendChild(row);
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

export function getPreviewCanvas() {
    return modalPreview;
}

// ---- The tree card ---------------------------------------------------------

/** The card's lines. Pure, so the copy can be asserted. */
export function cardLines(record, resolved, ageYears) {
    const band = healthBand(record.health);
    const years = Math.floor(ageYears);
    const age = years < 1 ? 'Planted this year' : years === 1 ? 'One year old' : `${years} years old`;
    const moisture = Math.round(record.moisture * 100);
    return {
        title: resolved.name,
        age,
        health: HEALTH_WORDS[band],
        band,
        moisture,
        // Plain words alongside the bar, because a bar is a colour and colour
        // is never the only carrier.
        thirst: moisture > 60 ? 'Well watered'
            : moisture > 25 ? 'Getting thirsty'
                : moisture > 0 ? 'Thirsty' : 'Bone dry'
    };
}

export function openTreeCard(entry, ageYears) {
    if (!cardEl || !entry) return;
    cardEntry = entry;
    returnFocus = document.activeElement;
    const lines = cardLines(entry.record, entry.resolved, ageYears);

    if (cardTitle) cardTitle.textContent = lines.title;
    if (cardBody) {
        cardBody.innerHTML = '';
        for (const text of [lines.age, lines.health, `${lines.thirst}, ${lines.moisture}%`]) {
            const p = document.createElement('p');
            p.className = 'tree-line';
            p.textContent = text;
            cardBody.appendChild(p);
        }
        cardBody.dataset.band = lines.band;
    }
    cardEl.classList.remove('hidden');
    if (cardWater) cardWater.focus();
}

export function refreshTreeCard(ageYears) {
    if (!isCardOpen() || !cardEntry) return;
    openTreeCardBody(cardEntry, ageYears);
}

function openTreeCardBody(entry, ageYears) {
    const lines = cardLines(entry.record, entry.resolved, ageYears);
    if (!cardBody) return;
    const paras = cardBody.children;
    const texts = [lines.age, lines.health, `${lines.thirst}, ${lines.moisture}%`];
    for (let i = 0; i < paras.length && i < texts.length; i++) {
        paras[i].textContent = texts[i];
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
    return isPlantOpen() || isCardOpen();
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
    toastEl = null;
    selection = { species: SPECIES[0].id, custom: { ...DEFAULT_CUSTOM } };
}
