// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * editor.js - the sheet's controls (specs/meme PLANNING 6.4). M1 is the
 * caption fields: a real text input per slot, capped at the caption cap,
 * with a counter, so a screen reader and a keyboard get the real thing. M3
 * adds the tabs, the picker, the people and the expression chips.
 *
 * Every DOM API is handed in (`doc`), so tests build the fields with the
 * stub.
 */

/** What a slot's field is called: "Caption" alone, "Top caption" and
 *  "Bottom caption" on a two-slot panel, numbered across panels (by the
 *  panel's place among the ones with captions, so a template whose words
 *  sit beside its pictures still counts 1, 2, 3). */
export function slotLabel(slots, k) {
    const { cell, slot } = slots[k];
    const cells = [...new Set(slots.map((s) => s.cell))];
    const siblings = slots.filter((s) => s.cell === cell).length;
    const names = { top: 'Top', bottom: 'Bottom', center: 'Middle' };
    const which = siblings > 1 ? `${names[slot] || 'Top'} caption` : 'Caption';
    return cells.length > 1 ? `Panel ${cells.indexOf(cell) + 1}: ${which}` : which;
}

/**
 * The template picker in `container`: a button a template in the picker's
 * order, the chosen one pressed. `onPick(template)` hears a choice.
 * Returns `{ buttons, select(id) }`.
 */
export function buildTemplatePicker(container, { templates, selected, onPick = () => {}, doc = typeof document === 'undefined' ? null : document }) {
    container.textContent = '';
    const buttons = [];
    const select = (id) => {
        for (const b of buttons) b.setAttribute('aria-pressed', b.dataset.template === id ? 'true' : 'false');
    };
    for (const t of templates) {
        const b = doc.createElement('button');
        b.type = 'button';
        b.className = 'mm-pick';
        b.dataset.template = t.id;
        b.setAttribute('aria-pressed', 'false');
        const title = doc.createElement('span');
        title.className = 'mm-pick-title';
        title.textContent = t.title;
        const line = doc.createElement('span');
        line.className = 'mm-pick-line';
        line.textContent = t.line;
        b.appendChild(title);
        b.appendChild(line);
        b.addEventListener('click', () => {
            select(t.id);
            onPick(t);
        });
        container.appendChild(b);
        buttons.push(b);
    }
    select(selected);
    return { buttons, select };
}

/**
 * The caption fields in `container`, one per slot, holding `captions`.
 * `onInput(k, value)` hears every change. Returns `{ inputs, set(captions) }`.
 */
export function buildCaptionFields(container, { slots, captions = [], maxChars, onInput = () => {}, doc = typeof document === 'undefined' ? null : document, idPrefix = 'mm-caption' }) {
    container.textContent = '';
    const inputs = [];
    const counters = [];
    slots.forEach((_, k) => {
        const field = doc.createElement('label');
        field.className = 'mm-field';
        field.setAttribute('for', `${idPrefix}-${k}`);
        const name = doc.createElement('span');
        name.className = 'mm-field-label';
        name.textContent = slotLabel(slots, k);
        const input = doc.createElement('input');
        input.id = `${idPrefix}-${k}`;
        input.className = 'mm-input';
        input.type = 'text';
        input.maxLength = maxChars;
        input.setAttribute('maxlength', String(maxChars));
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('enterkeyhint', 'done');
        input.setAttribute('aria-describedby', `${idPrefix}-${k}-count`);
        input.value = captions[k] || '';
        const count = doc.createElement('span');
        count.id = `${idPrefix}-${k}-count`;
        count.className = 'mm-count';
        const say = () => { count.textContent = `${input.value.length} / ${maxChars}`; };
        say();
        counters.push(say);
        input.addEventListener('input', () => {
            if (input.value.length > maxChars) input.value = input.value.slice(0, maxChars);
            say();
            onInput(k, input.value);
        });
        field.appendChild(name);
        field.appendChild(input);
        field.appendChild(count);
        container.appendChild(field);
        inputs.push(input);
    });
    return {
        inputs,
        /** Put `next` into the fields (a restored meme), telling `onInput`. */
        set(next) {
            inputs.forEach((input, k) => {
                input.value = String(next[k] || '').slice(0, maxChars);
                counters[k]();
                onInput(k, input.value);
            });
        }
    };
}
