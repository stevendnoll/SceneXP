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

import { listOf, optionOf } from '../../shared/js/avatar-1.0.0.min.js';
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
        return label;
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
            for (const option of optionsFor(field.key)) row.appendChild(buildOption(field, option));
            group.appendChild(row);
            pane.appendChild(group);
        }
        panels.appendChild(pane);
        panes.push(pane);
        if (i === 0) selected = tab.id;
    });

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
        /** Check the radios that match `avatar`. */
        set(next) {
            for (const [key, list] of Object.entries(inputs)) {
                for (const input of list) input.checked = next[key] === input.value;
            }
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
