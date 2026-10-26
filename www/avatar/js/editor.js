// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * editor.js - the choices (PRD section 6): tabs, and in each a few groups of
 * real radio buttons built from the avatar's own lists, so the browser gives
 * every group its arrow keys and a screen reader hears "Skin tone, Fair, 2 of
 * 6".
 *
 * ONLY WHAT IS DRAWN IS OFFERED. A field shows when this version of the figure
 * draws more than one of its options (avatar-figure's `drawnOptions`), so the
 * hats, glasses and facial hair appear by themselves when they are drawn
 * (M5), with nothing to change here.
 *
 * THE TABS ARE THE ARIA TAB PATTERN: one tab stop for the row, the arrow keys
 * (and Home and End) move along it and choose as they go. The keys are heard
 * on the tab row alone, never the window, so they never steal a radio
 * group's arrows.
 *
 * Colors are set as a custom property through the CSSOM, which the page's
 * security policy allows, where a style attribute would not be.
 */

import { listOf, optionOf, colorOf, customColor, CUSTOM_COLOR, COLOR_FIELDS } from '../../shared/js/avatar-1.0.0.min.js';
import { drawnOptions } from '../../shared/js/avatar-figure-1.0.0.min.js';

/** The options a field offers today. */
export function optionsFor(key) {
    return drawnOptions(key, listOf(key) || []);
}

/** The fields of `tab` that show: more than one option drawn, and the field
 *  each `requires` showing too, by the same rule (a chain of them, or a
 *  loop, is followed to its end). */
export function visibleFields(tab) {
    const visible = (field, seen = new Set()) => {
        if (seen.has(field.key) || optionsFor(field.key).length < 2) return false;
        if (!field.requires) return true;
        const needed = tab.fields.find((g) => g.key === field.requires);
        return Boolean(needed) && visible(needed, new Set([...seen, field.key]));
    };
    return tab.fields.filter((f) => visible(f));
}

/** The tabs that have a field to show. */
export function visibleTabs(tabs) {
    return tabs.filter((tab) => visibleFields(tab).length > 0);
}

/** A list color as a CSS hex: 0x9c2b25 is "#9c2b25". */
export function swatchHex(color) {
    return `#${(color >>> 0).toString(16).padStart(6, '0')}`;
}

/**
 * The id of a typed jersey number (Steve's QA, 2026-10-26): the digits in
 * `text`, two at most, as the list's id ("8" and "08" are `n8`, "00" is
 * `n00`, nothing is `none`); anything the list does not hold is `none`.
 */
export function numberId(key, text) {
    const digits = String(text ?? '').replace(/\D/g, '').slice(0, 2);
    if (!digits) return 'none';
    const id = digits === '00' ? 'n00' : `n${Number(digits)}`;
    return optionOf(listOf(key) || [], id) ? id : 'none';
}

/** What a number field shows for `id`: its digits, or nothing for none. */
export function numberText(key, id) {
    const option = optionOf(listOf(key) || [], id);
    return option && option.digits ? option.digits : '';
}

/** The tab a key press on the row moves to, from `index` of `count`, or
 *  null for a key the row does not take. */
export function tabKey(key, index, count) {
    if (key === 'ArrowRight') return (index + 1) % count;
    if (key === 'ArrowLeft') return (index - 1 + count) % count;
    if (key === 'Home') return 0;
    if (key === 'End') return count - 1;
    return null;
}

/**
 * Build the editor into `tablist` (the row of tabs) and `panels` (where the
 * tab panels go), showing `avatar`. `onChange(key, id)` hears every choice,
 * `onTab(tab)` every tab chosen (its `frame` moves the camera).
 *
 * Returns `{ tabs, set(avatar), select(id), selected, inputs }`.
 */
export function createEditor({ doc = document, tablist, panels, tabs, avatar, onChange = () => {}, onTab = () => {} }) {
    const shown = visibleTabs(tabs);
    const buttons = [];
    const panes = [];
    const inputs = {};
    const customs = {};      // each color field's own color picker
    const numbers = {};      // each number field's own text box
    const shows = {};        // and the way to show it an id
    const groups = [];       // [field, fieldset], for the groups a choice hides
    const onlyWith = [];     // [option, label], for the options another choice offers
    let current = { ...avatar };
    let selected = null;

    function make(tag, className, text) {
        const el = doc.createElement(tag);
        if (className) el.className = className;
        if (text !== undefined) el.textContent = text;
        return el;
    }

    function buildOption(field, option) {
        const label = make('label', `av-option av-option-${field.kind}`);
        const input = make('input', 'av-radio');
        input.type = 'radio';
        input.name = `av-${field.key}`;
        input.value = option.id;
        input.checked = avatar[field.key] === option.id;
        input.addEventListener('change', () => {
            if (input.checked) onChange(field.key, option.id);
        });
        label.appendChild(input);
        if (field.kind === 'swatch') {
            const swatch = make('span', 'av-swatch');
            swatch.setAttribute('aria-hidden', 'true');
            swatch.style.setProperty('--swatch', swatchHex(option.color === null ? option.swatch : option.color));
            label.appendChild(swatch);
            label.appendChild(make('span', 'sr-only', option.label));
            label.title = option.label;
        } else {
            label.appendChild(make('span', 'av-word', option.label));
        }
        (inputs[field.key] = inputs[field.key] || []).push(input);
        // An option offered only with another choice (bare legs under a
        // one-piece, 2026-10-26) is hidden the rest of the time; chosen and
        // then orphaned, the figure wears the list's fallback for it.
        if (option.onlyWith) onlyWith.push([option, label]);
        return label;
    }

    /**
     * Any color (Steve, 2026-10-24): the browser's own color input, drawn as
     * one more swatch at the end of the row, so it opens the device's own
     * picker and has its keys. While a picker is dragged its color is shown
     * on the figure once a frame, not once an event.
     */
    function buildCustom(field) {
        const input = make('input', 'av-custom');
        input.type = 'color';
        input.setAttribute('aria-label', `Custom ${field.legend.toLowerCase()}`);
        input.title = 'Any color';
        let pending = null;
        const send = () => {
            if (pending === null) return;
            const id = customColor(parseInt(pending.slice(1), 16));
            pending = null;
            onChange(field.key, id);
        };
        input.addEventListener('input', () => {
            const first = pending === null;
            pending = input.value;
            if (!first) return;
            if (typeof requestAnimationFrame === 'function') requestAnimationFrame(send);
            else send();
        });
        input.addEventListener('change', () => {
            pending = input.value;
            send();
        });
        customs[field.key] = input;
        return input;
    }

    /** Show the custom swatch as chosen (and the radios as not) when the
     *  field holds a custom color; either way it opens on the color shown. */
    function showCustom(key, value) {
        const input = customs[key];
        if (!input) return;
        const custom = CUSTOM_COLOR.test(value);
        input.classList.toggle('is-chosen', custom);
        const option = optionOf(listOf(key) || [], value);
        const hex = custom ? colorOf(key, value) : option && (option.color === null ? option.swatch : option.color);
        if (typeof hex === 'number') input.value = swatchHex(hex);
    }

    /**
     * A typed number (a jersey's): one text box taking two digits, read as
     * it is typed, so the figure wears each keystroke. Empty is none. What
     * is kept is always one of the list's ids (`numberId`), never the text.
     */
    function buildNumber(field) {
        const input = make('input', 'av-number');
        input.type = 'text';
        input.inputMode = 'numeric';
        input.autocomplete = 'off';
        input.maxLength = 2;
        input.placeholder = 'None';
        input.setAttribute('aria-label', field.legend);
        let shown = numberId(field.key, numberText(field.key, avatar[field.key]));
        input.value = numberText(field.key, shown);
        const send = () => {
            const id = numberId(field.key, input.value);
            const text = numberText(field.key, id);
            if (input.value !== text) input.value = text;
            if (id === shown) return;
            shown = id;
            onChange(field.key, id);
        };
        input.addEventListener('input', send);
        input.addEventListener('change', send);
        numbers[field.key] = input;
        shows[field.key] = (id) => {
            shown = numberId(field.key, numberText(field.key, id));
            const text = numberText(field.key, shown);
            if (input.value !== text) input.value = text;
        };
        return input;
    }

    /** Hide each group whose `hideWhen` the avatar now meets (a beard's
     *  color with no beard, a hat's with no hat), and each whose `showWhen`
     *  it does not (a jersey's number, off the jersey). */
    function showGroups() {
        for (const [field, group] of groups) {
            if (field.hideWhen) group.hidden = current[field.hideWhen.field] === field.hideWhen.value;
            if (field.showWhen) group.hidden = current[field.showWhen.field] !== field.showWhen.value;
        }
        for (const [option, label] of onlyWith) label.hidden = !option.onlyWith.values.includes(current[option.onlyWith.field]);
    }

    shown.forEach((tab, i) => {
        const button = make('button', 'av-tab', tab.label);
        button.type = 'button';
        button.id = `av-tab-${tab.id}`;
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-controls', `av-panel-${tab.id}`);
        button.addEventListener('click', () => api.select(tab.id));
        tablist.appendChild(button);
        buttons.push(button);

        const pane = make('div', 'av-panel');
        pane.id = `av-panel-${tab.id}`;
        pane.setAttribute('role', 'tabpanel');
        pane.setAttribute('aria-labelledby', button.id);
        for (const field of visibleFields(tab)) {
            const group = make('fieldset', 'av-group');
            group.appendChild(make('legend', 'av-legend', field.legend));
            const row = make('div', `av-options av-options-${field.kind}`);
            if (field.kind === 'number') row.appendChild(buildNumber(field));
            else for (const option of optionsFor(field.key)) row.appendChild(buildOption(field, option));
            if (field.kind === 'swatch' && COLOR_FIELDS.includes(field.key)) {
                row.appendChild(buildCustom(field));
                showCustom(field.key, avatar[field.key]);
            }
            group.appendChild(row);
            pane.appendChild(group);
            groups.push([field, group]);
        }
        panels.appendChild(pane);
        panes.push(pane);
        if (i === 0) selected = tab.id;
    });

    showGroups();

    tablist.addEventListener('keydown', (e) => {
        const index = shown.findIndex((t) => t.id === selected);
        const next = tabKey(e.key, index, shown.length);
        if (next === null) return;
        e.preventDefault();
        api.select(shown[next].id);
        buttons[next].focus();
    });

    const api = {
        tabs: shown,
        inputs,
        customs,
        numbers,
        get selected() {
            return selected;
        },
        /** Show `id`'s panel, and tell the page (the camera reframes)
         *  unless `quiet` (the first tab, shown as the page opens on the
         *  whole figure). */
        select(id, { quiet = false } = {}) {
            const index = shown.findIndex((t) => t.id === id);
            if (index < 0) return false;
            selected = id;
            buttons.forEach((b, i) => {
                b.setAttribute('aria-selected', i === index ? 'true' : 'false');
                b.tabIndex = i === index ? 0 : -1;
            });
            panes.forEach((p, i) => {
                p.hidden = i !== index;
            });
            if (!quiet) onTab(shown[index]);
            return true;
        },
        /** Check the radios that match `avatar` (none, where a field holds
         *  a custom color), show the custom swatches, and hide the groups
         *  the avatar's choices make moot. */
        set(next) {
            current = { ...next };
            for (const [key, list] of Object.entries(inputs)) {
                for (const input of list) input.checked = next[key] === input.value;
            }
            for (const key of Object.keys(customs)) showCustom(key, next[key]);
            for (const key of Object.keys(shows)) shows[key](next[key]);
            showGroups();
        },
        /** An option's label, for a status line. */
        labelOf(key, id) {
            const option = optionOf(listOf(key) || [], id);
            return option ? option.label : '';
        }
    };
    if (selected) api.select(selected, { quiet: true });
    return api;
}
