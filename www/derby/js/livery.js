// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * livery.js - the bench's Decals and name section (M4.5): the car's name on
 * its sides, its number on the nose, and up to six decals stuck where the
 * visitor puts them.
 *
 * A DECAL IS PLACED WITH TWO SLIDERS (along the car, and up and down) and
 * a size, so the keyboard places one as easily as a finger. The preview of
 * the car's side, drawn by the same code that paints the car (decals.js),
 * also takes a drag: the chosen decal follows the pointer. The art itself
 * is ours, drawn on canvas.
 *
 * THE NAME IS THE VISITOR'S OWN, 24 characters at most, and goes only into
 * an input's value, textContent and a canvas (garage.cleanName cleans it
 * on the way in). It names the car everywhere: the garage, the board, the
 * clip. The usage pings never carry it.
 */

import { DERBY_CONFIG } from './config.min.js';
import * as U from './units.min.js';
import { profileAt } from './car.min.js';
import { NAME_MAX, cleanName } from './garage.min.js';
import { DECALS, SIZES, SIZE_LABELS, decalSize, placeDecal, drawSide } from './decals.min.js';
import { UI, SAY } from './copy.min.js';

/**
 * The section, in `body`. `kit` is bench.js's helpers and hooks: { h,
 * choice, group, button, listen, build(), units(), garage, commit(next,
 * line, opts), say(text), track(action, params) }. Returns { update() }.
 */
export function createLivery(body, kit, C = DERBY_CONFIG) {
    const { h, choice, group, button, listen } = kit;
    let kind = 'flame';
    let picked = 0;

    // The name and the number.
    const name = document.createElement('input');
    name.type = 'text';
    name.id = 'bench-name';
    name.maxLength = NAME_MAX;
    name.setAttribute('maxlength', String(NAME_MAX));
    name.setAttribute('autocomplete', 'off');
    name.setAttribute('spellcheck', 'false');
    const nameLabel = h('label', 'bench-field', null, [h('span', 'choice-label', UI.carName), name]);
    nameLabel.setAttribute('for', 'bench-name');
    listen(name, 'input', () => kit.commit({ ...kit.build(), name: cleanName(name.value) }, null, { keep: false }));
    listen(name, 'change', () => {
        kit.commit({ ...kit.build(), name: cleanName(name.value) });
        kit.track('bench', { kind: 'name', outcome: kit.build().name ? 'set' : 'cleared' });
    });
    const number = document.createElement('input');
    number.type = 'text';
    number.id = 'bench-number';
    number.setAttribute('inputmode', 'numeric');
    number.setAttribute('maxlength', '2');
    number.setAttribute('autocomplete', 'off');
    const numberLabel = h('label', 'bench-field is-short', null, [h('span', 'choice-label', UI.carNumber), number]);
    numberLabel.setAttribute('for', 'bench-number');
    const readNumber = () => {
        const digits = number.value.replace(/\D/g, '').slice(0, 2);
        return digits === '' ? null : Number(digits);
    };
    listen(number, 'input', () => kit.commit({ ...kit.build(), number: readNumber() }, null, { keep: false }));
    listen(number, 'change', () => kit.commit({ ...kit.build(), number: readNumber() }));
    body.appendChild(h('div', 'bench-fields', null, [nameLabel, numberLabel]));

    // The decals: which to stick on, then the ones on the car.
    const kinds = Object.entries(DECALS).map(([id, d]) => choice('radio', 'bench-decal-kind', id, d.label, null, (input) => {
        if (input.checked) kind = id;
    }, 'chip'));
    body.appendChild(group(UI.decals, kinds.map((k) => k.wrap), 'chips'));
    const add = button('bench-decal-add', UI.addDecal, () => {
        const b = kit.build();
        if (b.decals.length >= C.workshop.maxDecals) {
            kit.say(SAY.decalsFull);
            return;
        }
        picked = b.decals.length;
        kit.commit({ ...b, decals: b.decals.concat([placeDecal(kind, b.stations, C)]) }, SAY.decalOn(DECALS[kind].label));
        kit.track('bench', { kind: 'decal', outcome: kind });
    });
    body.appendChild(h('div', 'bench-row', null, [add]));

    const placed = h('div', 'bench-placed');
    const list = h('div', 'chips');
    placed.appendChild(h('h4', 'bench-legend', UI.onTheCar));
    placed.appendChild(list);
    const preview = document.createElement('canvas');
    preview.className = 'livery-preview';
    preview.width = 700;
    preview.height = 125;
    preview.setAttribute('aria-hidden', 'true');
    placed.appendChild(preview);

    const slider = (id, label) => {
        const input = document.createElement('input');
        input.type = 'range';
        input.id = id;
        input.min = '0';
        input.max = '100';
        input.step = '1';
        const text = h('span', 'choice-blurb', '');
        const wrap = h('label', 'bench-range', null, [h('span', 'choice-label', label), input, text]);
        wrap.setAttribute('for', id);
        return { input, text, wrap };
    };
    const along = slider('bench-decal-x', UI.along);
    const up = slider('bench-decal-y', UI.upDown);
    placed.appendChild(along.wrap);
    placed.appendChild(up.wrap);
    const sizes = Object.keys(SIZES).map((s) => choice('radio', 'bench-decal-size', s, SIZE_LABELS[s], null, (input) => {
        if (input.checked) change({ size: s });
    }, 'chip'));
    placed.appendChild(group(UI.size, sizes.map((s) => s.wrap), 'chips'));
    const remove = button('bench-decal-remove', UI.peel, () => {
        const b = kit.build();
        const d = b.decals[picked];
        if (!d) return;
        const decals = b.decals.filter((_, i) => i !== picked);
        picked = Math.max(0, Math.min(picked, decals.length - 1));
        kit.commit({ ...b, decals }, SAY.decalOff(DECALS[d.kind].label));
    });
    placed.appendChild(h('div', 'bench-row', null, [remove]));
    body.appendChild(placed);

    /** Change the chosen decal. `keep: false` while a slider is dragged. */
    function change(patch, opts) {
        const b = kit.build();
        if (!b.decals[picked]) return;
        const decals = b.decals.map((d, i) => (i === picked ? { ...d, ...patch } : d));
        kit.commit({ ...b, decals }, null, opts);
    }
    const fromAlong = () => (Number(along.input.value) / 100) * C.kit.length;
    const fromUp = () => (Number(up.input.value) / 100) * C.kit.height;
    listen(along.input, 'input', () => change({ x: fromAlong() }, { keep: false }));
    listen(along.input, 'change', () => change({ x: fromAlong() }));
    listen(up.input, 'input', () => change({ y: fromUp() }, { keep: false }));
    listen(up.input, 'change', () => change({ y: fromUp() }));

    // A drag on the preview moves the chosen decal there.
    let dragging = false;
    const dragTo = (e, keep) => {
        const r = preview.getBoundingClientRect();
        if (!r || !r.width) return;
        const fx = (e.clientX - r.left) / r.width;
        const fy = (e.clientY - r.top) / r.height;
        const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
        change({ x: clamp(fx) * C.kit.length, y: (1 - clamp(fy)) * C.kit.height }, { keep });
    };
    listen(preview, 'pointerdown', (e) => {
        dragging = true;
        if (preview.setPointerCapture && e.pointerId !== undefined) preview.setPointerCapture(e.pointerId);
        dragTo(e, false);
    });
    listen(preview, 'pointermove', (e) => {
        if (dragging) dragTo(e, false);
    });
    for (const t of ['pointerup', 'pointercancel']) {
        listen(preview, t, (e) => {
            if (!dragging) return;
            dragging = false;
            dragTo(e, true);
        });
    }

    /** The preview: the side as it is painted (nose on the left), the shape
     *  cut out of it, and the chosen decal outlined. */
    function draw(b) {
        const g = preview.getContext('2d');
        const w = preview.width;
        const hgt = preview.height;
        g.clearRect(0, 0, w, hgt);
        g.save();
        g.beginPath();
        const n = 56;
        for (let k = 0; k <= n; k++) {
            const d = (C.kit.length * k) / n;
            const t = profileAt(b.stations, d)[1];
            g[k ? 'lineTo' : 'moveTo']((d / C.kit.length) * w, hgt - (t / C.kit.height) * hgt);
        }
        for (let k = n; k >= 0; k--) {
            const d = (C.kit.length * k) / n;
            const bot = profileAt(b.stations, d)[0];
            g.lineTo((d / C.kit.length) * w, hgt - (bot / C.kit.height) * hgt);
        }
        g.closePath();
        g.clip();
        drawSide(g, w, hgt, b, 'b', C);
        g.restore();
        const d = b.decals[picked];
        if (d) {
            const s = decalSize(d);
            g.save();
            g.setLineDash([6, 4]);
            g.strokeStyle = '#ffffff';
            g.lineWidth = 2;
            g.strokeRect(((d.x - s.w / 2) / C.kit.length) * w, hgt - ((d.y + s.h / 2) / C.kit.height) * hgt, (s.w / C.kit.length) * w, (s.h / C.kit.height) * hgt);
            g.restore();
        }
    }

    function update() {
        const b = kit.build();
        if (document.activeElement !== name) name.value = b.name;
        if (document.activeElement !== number) number.value = b.number === null ? '' : String(b.number);
        name.setAttribute('placeholder', kit.garage.nameOf({ ...b, name: '' }));
        for (const k of kinds) k.input.checked = k.input.value === kind;
        add.setAttribute('aria-disabled', b.decals.length >= C.workshop.maxDecals ? 'true' : 'false');
        if (picked >= b.decals.length) picked = Math.max(0, b.decals.length - 1);
        placed.hidden = b.decals.length === 0;
        // Rebuilt only when the decals on the car come or go.
        const key = b.decals.map((d) => d.kind).join('|');
        if (key !== list.dataset.key) {
            list.dataset.key = key;
            list.textContent = '';
            const count = {};
            b.decals.forEach((d, i) => {
                count[d.kind] = (count[d.kind] || 0) + 1;
                const label = `${DECALS[d.kind].label}${b.decals.filter((x) => x.kind === d.kind).length > 1 ? ` ${count[d.kind]}` : ''}`;
                const c = choice('radio', 'bench-decal-pick', String(i), label, null, (input) => {
                    if (!input.checked) return;
                    picked = i;
                    update();
                }, 'chip');
                list.appendChild(c.wrap);
            });
        }
        Array.from(list.children).forEach((wrap, i) => { wrap.children[0].checked = i === picked; });
        const d = b.decals[picked];
        if (d) {
            along.input.value = String(Math.round((d.x / C.kit.length) * 100));
            up.input.value = String(Math.round((d.y / C.kit.height) * 100));
            along.text.textContent = `${U.length(d.x, kit.units())} from the nose`;
            up.text.textContent = `${U.length(d.y, kit.units())} above the bottom`;
            along.input.setAttribute('aria-valuetext', along.text.textContent);
            up.input.setAttribute('aria-valuetext', up.text.textContent);
            for (const s of sizes) s.input.checked = s.input.value === d.size;
        }
        draw(b);
    }

    return { update, picked: () => picked };
}
