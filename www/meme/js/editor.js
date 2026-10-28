// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * editor.js - the sheet's controls (specs/meme PLANNING 6.4): three tabs
 * (Meme, Captions, People), the picker with a glyph of each grid, a real
 * text input a caption slot with a counter, a row of expression chips a
 * panel, and the view buttons that do by keyboard what a tap on the stage
 * does by pointer.
 *
 * EVERYTHING IS REACHABLE WITHOUT A POINTER. The tabs and the chips are
 * roving-tabindex rows (arrows, Home and End move within them), every
 * control is a real button or input, and nothing is announced by color
 * alone.
 *
 * Every DOM API is handed in (`doc`), so tests build the controls with the
 * stub. Nothing here touches THREE or the store.
 */

/** Where an arrow, Home or End moves within a row of `count`, or null. */
export function tabKey(key, index, count) {
    if (key === 'ArrowRight' || key === 'ArrowDown') return (index + 1) % count;
    if (key === 'ArrowLeft' || key === 'ArrowUp') return (index - 1 + count) % count;
    if (key === 'Home') return 0;
    if (key === 'End') return count - 1;
    return null;
}

/** Clear `container` of its children. */
function empty(container) {
    container.textContent = '';
}

/**
 * The tabs: `pairs` are `{ tab, panel }` element ids, in order, already in
 * the markup. `onTab(id)` hears a choice. Returns `{ ids, selected,
 * select(id) }`.
 */
export function buildTabs(pairs, { onTab = () => {}, doc = typeof document === 'undefined' ? null : document } = {}) {
    const tabs = pairs.map((p) => ({ ...p, el: doc.getElementById(p.tab) })).filter((p) => p.el);
    const ids = tabs.map((t) => t.tab);
    const state = { selected: ids[0] || null };
    function select(id, { focus = false } = {}) {
        if (!ids.includes(id)) return false;
        state.selected = id;
        for (const { tab, panel, el } of tabs) {
            const on = tab === id;
            el.setAttribute('aria-selected', on ? 'true' : 'false');
            el.tabIndex = on ? 0 : -1;
            const panelEl = doc.getElementById(panel);
            if (panelEl) panelEl.hidden = !on;
            if (on && focus && el.focus) el.focus();
        }
        onTab(id);
        return true;
    }
    tabs.forEach(({ tab, el }, i) => {
        el.addEventListener('click', () => select(tab));
        el.addEventListener('keydown', (e) => {
            const next = tabKey(e.key, i, tabs.length);
            if (next === null) return;
            if (e.preventDefault) e.preventDefault();
            select(ids[next], { focus: true });
        });
    });
    if (ids.length) select(ids[0]);
    return { ids, get selected() { return state.selected; }, select };
}

/** An SVG glyph of a template's grid, `size` pixels square, for the picker. */
export function gridGlyph(template, { doc = typeof document === 'undefined' ? null : document, size = 28 } = {}) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = doc.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const rows = template.grid.length;
    const columns = template.grid[0].reduce((n, c) => n + c.span, 0);
    const gap = 2;
    const cellH = (size - gap * (rows - 1)) / rows;
    const unitW = (size - gap * (columns - 1)) / columns;
    template.grid.forEach((row, r) => {
        let col = 0;
        for (const cell of row) {
            const rect = doc.createElementNS(NS, 'rect');
            rect.setAttribute('x', String(col * (unitW + gap)));
            rect.setAttribute('y', String(r * (cellH + gap)));
            rect.setAttribute('width', String(cell.span * unitW + (cell.span - 1) * gap));
            rect.setAttribute('height', String(cellH));
            rect.setAttribute('rx', '2');
            rect.setAttribute('fill', 'currentColor');
            svg.appendChild(rect);
            col += cell.span;
        }
    });
    return svg;
}

/**
 * The template picker in `container`: a button a template in the picker's
 * order, each with its grid's glyph, the chosen one pressed. `onPick`
 * hears a choice. Returns `{ buttons, select(id) }`.
 */
export function buildTemplatePicker(container, { templates, selected, onPick = () => {}, doc = typeof document === 'undefined' ? null : document }) {
    empty(container);
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
        const glyph = gridGlyph(t, { doc });
        glyph.setAttribute('class', 'mm-pick-glyph');
        const words = doc.createElement('span');
        words.className = 'mm-pick-words';
        const title = doc.createElement('span');
        title.className = 'mm-pick-title';
        title.textContent = t.title;
        const line = doc.createElement('span');
        line.className = 'mm-pick-line';
        line.textContent = t.line;
        words.appendChild(title);
        words.appendChild(line);
        b.appendChild(glyph);
        b.appendChild(words);
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

/** What a slot's field is called: "Caption" alone, "Top caption" and
 *  "Bottom caption" on a two-slot panel, numbered across panels (by the
 *  panel's place among the ones with captions, so a template whose words
 *  sit beside its pictures still counts 1, 2, 3). */
export function slotLabel(slots, k, roleNames = []) {
    const { cell, slot, figure } = slots[k];
    const cells = [...new Set(slots.map((s) => s.cell))];
    const siblings = slots.filter((s) => s.cell === cell).length;
    const names = { top: 'Top', bottom: 'Bottom', center: 'Middle' };
    let which;
    if (slot === 'label') which = `Label on ${roleNames[figure] || `figure ${figure + 1}`}`;
    else which = siblings > 1 ? `${names[slot] || 'Top'} caption` : 'Caption';
    return cells.length > 1 ? `Panel ${cells.indexOf(cell) + 1}: ${which}` : which;
}

/**
 * The people in `container`: a row a role saying who wears it (`noteFor
 * (role)`), with the friend's row offering a pasted link and an opened
 * file, and a random role's row a reshuffle. `onLink(text)`, `onFile()`
 * and `onReshuffle(roleId)` hear the presses. Returns the rows.
 */
export function buildPeople(container, { roles, noteFor, onLink = () => {}, onFile = () => {}, onReshuffle = () => {}, doc = typeof document === 'undefined' ? null : document }) {
    empty(container);
    const rows = [];
    for (const role of roles) {
        const item = doc.createElement('li');
        item.className = 'mm-person';
        const name = doc.createElement('span');
        name.className = 'mm-person-role';
        name.textContent = role.label;
        const note = doc.createElement('span');
        note.className = 'mm-person-note';
        note.textContent = noteFor(role);
        item.appendChild(name);
        item.appendChild(note);
        const row = { role: role.id, item, note };
        if (role.id === 'friend') {
            const field = doc.createElement('label');
            field.className = 'mm-field';
            field.setAttribute('for', 'mm-friend-link');
            const fieldName = doc.createElement('span');
            fieldName.className = 'mm-field-label';
            fieldName.textContent = "A friend's avatar link";
            const input = doc.createElement('input');
            input.id = 'mm-friend-link';
            input.className = 'mm-input';
            input.type = 'text';
            input.setAttribute('autocomplete', 'off');
            input.setAttribute('placeholder', 'Paste the link from their avatar page');
            field.appendChild(fieldName);
            field.appendChild(input);
            const buttons = doc.createElement('div');
            buttons.className = 'mm-row';
            const use = doc.createElement('button');
            use.type = 'button';
            use.className = 'mm-secondary mm-small';
            use.id = 'mm-friend-use';
            use.textContent = 'Use this link';
            use.addEventListener('click', () => onLink(input.value));
            const open = doc.createElement('button');
            open.type = 'button';
            open.className = 'mm-secondary mm-small';
            open.id = 'mm-friend-open';
            open.textContent = 'Open their avatar file';
            open.addEventListener('click', onFile);
            buttons.appendChild(use);
            buttons.appendChild(open);
            item.appendChild(field);
            item.appendChild(buttons);
            row.input = input;
        }
        if (role.cast === 'random') {
            const again = doc.createElement('button');
            again.type = 'button';
            again.className = 'mm-secondary mm-small';
            again.id = `mm-reshuffle-${role.id}`;
            again.textContent = 'Someone else';
            again.addEventListener('click', () => onReshuffle(role.id));
            item.appendChild(again);
            row.reshuffle = again;
        }
        container.appendChild(item);
        rows.push(row);
    }
    return rows;
}

/**
 * The caption fields in `container`, one per slot, holding `captions`.
 * `onInput(k, value)` hears every change. Returns `{ inputs, set(captions) }`.
 */
export function buildCaptionFields(container, { slots, captions = [], maxChars, roleNamesFor = () => [], onInput = () => {}, doc = typeof document === 'undefined' ? null : document, idPrefix = 'mm-caption' }) {
    empty(container);
    const inputs = [];
    const counters = [];
    slots.forEach((s, k) => {
        const field = doc.createElement('label');
        field.className = 'mm-field';
        field.setAttribute('for', `${idPrefix}-${k}`);
        const name = doc.createElement('span');
        name.className = 'mm-field-label';
        name.textContent = slotLabel(slots, k, roleNamesFor(s.cell));
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

/**
 * A row of chips (a radio group with roving tabindex) in `container`:
 * `options` are `{ id, label }`, `chosen` the pressed id, `label` the
 * group's name. `onChoose(id)` hears a choice. Returns `{ buttons, select }`.
 */
export function buildChipRow(container, { options, chosen, label, onChoose = () => {}, doc = typeof document === 'undefined' ? null : document }) {
    const row = doc.createElement('div');
    row.className = 'mm-chips';
    row.setAttribute('role', 'radiogroup');
    row.setAttribute('aria-label', label);
    const buttons = [];
    const select = (id, { focus = false } = {}) => {
        buttons.forEach((b) => {
            const on = b.dataset.value === id;
            b.setAttribute('aria-checked', on ? 'true' : 'false');
            b.tabIndex = on ? 0 : -1;
            if (on && focus && b.focus) b.focus();
        });
    };
    options.forEach((o, i) => {
        const b = doc.createElement('button');
        b.type = 'button';
        b.className = 'mm-chip';
        b.setAttribute('role', 'radio');
        b.dataset.value = o.id;
        b.textContent = o.label;
        b.addEventListener('click', () => {
            select(o.id);
            onChoose(o.id);
        });
        b.addEventListener('keydown', (e) => {
            const next = tabKey(e.key, i, options.length);
            if (next === null) return;
            if (e.preventDefault) e.preventDefault();
            select(options[next].id, { focus: true });
            onChoose(options[next].id);
        });
        row.appendChild(b);
        buttons.push(b);
    });
    select(options.some((o) => o.id === chosen) ? chosen : options[0].id);
    container.appendChild(row);
    return { row, buttons, select };
}

/**
 * The expression chips, a row for each cell with a figure, in `container`:
 * `template` the meme's, `expressions` the shared list, `chosen[i]` the
 * cell's choice or null for the template's own. `onChoose(cellIndex, id)`
 * hears a choice (`null` when the template's own is chosen again).
 * Returns the rows.
 */
export function buildExpressionRows(container, { template, expressions, chosen = [], onChoose = () => {}, doc = typeof document === 'undefined' ? null : document }) {
    empty(container);
    const rows = [];
    const faces = template.cells.map((cell, i) => ({ cell, i })).filter(({ cell }) => cell.figures.length);
    faces.forEach(({ cell, i }, n) => {
        const own = cell.figures[0].expression;
        const field = doc.createElement('div');
        field.className = 'mm-field';
        const name = doc.createElement('span');
        name.className = 'mm-field-label';
        name.textContent = faces.length > 1 ? `Panel ${n + 1}: Face` : 'Face';
        field.appendChild(name);
        const options = expressions.map((e) => ({ id: e.id, label: e.id === own ? `${e.label} (the meme's own)` : e.label }));
        const row = buildChipRow(field, {
            options,
            chosen: chosen[i] || own,
            label: `${name.textContent}: the expression`,
            onChoose: (id) => onChoose(i, id === own ? null : id),
            doc
        });
        container.appendChild(field);
        rows.push({ cell: i, ...row });
    });
    return rows;
}

/**
 * The view buttons in `container`: "All panels" and one a panel, doing by
 * keyboard what a tap on the stage does. `onView(index | null)` hears a
 * press. Returns `{ buttons, select(index | null) }`.
 */
export function buildViewButtons(container, { count, onView = () => {}, doc = typeof document === 'undefined' ? null : document }) {
    empty(container);
    const buttons = [];
    const select = (index) => {
        buttons.forEach((b, i) => b.setAttribute('aria-pressed', (i === 0 ? index === null : index === i - 1) ? 'true' : 'false'));
    };
    const make = (text, value) => {
        const b = doc.createElement('button');
        b.type = 'button';
        b.className = 'mm-view-btn';
        b.textContent = text;
        b.addEventListener('click', () => {
            select(value);
            onView(value);
        });
        container.appendChild(b);
        buttons.push(b);
    };
    make('All panels', null);
    for (let i = 0; i < count; i++) make(`Panel ${i + 1}`, i);
    select(null);
    return { buttons, select };
}
