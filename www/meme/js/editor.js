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
 *  "Bottom caption" on a two-slot panel, numbered across panels. */
export function slotLabel(slots, k) {
    const { cell, slot } = slots[k];
    const cells = new Set(slots.map((s) => s.cell)).size;
    const siblings = slots.filter((s) => s.cell === cell).length;
    const which = siblings > 1 ? `${slot === 'top' ? 'Top' : 'Bottom'} caption` : 'Caption';
    return cells > 1 ? `Panel ${cell + 1}: ${which}` : which;
}

/**
 * The caption fields in `container`, one per slot, holding `captions`.
 * `onInput(k, value)` hears every change. Returns `{ inputs, set(captions) }`.
 */
export function buildCaptionFields(container, { slots, captions = [], maxChars, onInput = () => {}, doc = typeof document === 'undefined' ? null : document, idPrefix = 'mm-caption' }) {
    while (container.firstChild) container.removeChild(container.firstChild);
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
