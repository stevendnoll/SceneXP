// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * carve.js - drawing your own shape (M4.1, M4.2, PRD Shaping the body): the
 * pencil line on the block's side and on its top, the Cut, and the sanding.
 *
 * A FEW POINTS, UP AND DOWN ONLY. The line passes through a point an inch
 * (profile.js), each moved up or down, never along: the gentlest editor a
 * finger can drive on a phone, and one an arrow key drives just as well. No
 * free sculpting (PRD Risks, 1).
 *
 * EVERY POINT IS A REAL SLIDER (role="slider", in the tab order): Up and
 * Right raise it a sixteenth of an inch, Down and Left lower it, Page Up and
 * Page Down a quarter, Home and End to its limits, and a screen reader hears
 * where it is and how high in the visitor's units. A pointer drags it.
 * There are no pointer-only flows here (the "one caller is the accessibility
 * audit" lesson): a car is carved by keyboard alone in M4's Done-when.
 *
 * THE DRAWING IS TWICE AS TALL AS THE BLOCK (config workshop.stretch), so
 * the points have room between them on a phone. The turntable shows the
 * shape true, and the editor says so.
 *
 * THE LINE IS A DRAFT UNTIL CUT. Moving points changes nothing on the car
 * but the pencil line drawn on it (`onDraft`). Cut along the line hands the
 * line to bench.js (`onCut`), which keeps the cut car and plays the Cut.
 */

import { DERBY_CONFIG, IN } from './config.min.js';
import { carveFrom, curvesOf, limitsOf, setPoint, sameCarve, nudge, gridX } from './profile.min.js';
import { profileAt } from './car.min.js';
import * as U from './units.min.js';
import { UI, SAND } from './copy.min.js';

const NS = 'http://www.w3.org/2000/svg';
const PER_IN = 100;

function svgEl(tag, attrs = {}) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    return el;
}

/** The drawing's size: 100 units an inch along, `stretch` times that up. */
export function viewOf(view, C = DERBY_CONFIG) {
    const K = C.kit;
    const up = PER_IN * C.workshop.stretch;
    return view === 'top'
        ? { w: (K.length / IN) * PER_IN, h: (K.width / IN) * up, up }
        : { w: (K.length / IN) * PER_IN, h: (K.height / IN) * up, up };
}

/** A point of the drawing for a place on the block: `d` meters from the
 *  nose, and a height (side) or a half width from the middle (top). */
export function toView(view, d, v, C = DERBY_CONFIG) {
    const V = viewOf(view, C);
    const x = (d / IN) * PER_IN;
    return view === 'top' ? [x, V.h / 2 - (v / IN) * V.up] : [x, V.h - (v / IN) * V.up];
}

/** The other way: a height (side) or a full width (top), in meters, for a
 *  fraction `f` of the way down the drawing. Pure. */
export function fromView(view, f, C = DERBY_CONFIG) {
    const K = C.kit;
    return view === 'top' ? (0.5 - f) * 2 * K.width : (1 - f) * K.height;
}

/** Which points a view edits: [edge, i], locked points left out where
 *  their slot holds them fixed. Pure. */
export function handlesOf(view, C = DERBY_CONFIG) {
    const out = [];
    gridX(C).forEach((_, i) => {
        const L = limitsOf(i, C);
        if (view === 'top') {
            if (!L.locked) out.push(['width', i]);
        } else {
            out.push(['top', i]);
            if (!L.locked) out.push(['bottom', i]);
        }
    });
    return out;
}

const NAMES = { top: 'Top', bottom: 'Bottom', width: 'Width' };

/**
 * The editor in `body` (bench.js's Shape section). `kit` is bench.js's
 * helpers and hooks: { h, choice, group, button, listen, units(),
 * build(), onDraft(carve | null), onCut(carve), onSand(sand, final) }.
 * Returns { reset(build), update() }.
 */
export function createCarver(body, kit, C = DERBY_CONFIG) {
    const { h, choice, group, button, listen } = kit;
    let view = 'side';
    let base = null;
    let draft = null;
    let drag = null;
    const handles = new Map();

    body.appendChild(h('h4', 'bench-legend', UI.drawOwn));
    const views = ['side', 'top'].map((v) => choice('radio', 'bench-view', v, v === 'side' ? UI.fromSide : UI.fromAbove, null, (input) => {
        if (input.checked) {
            view = v;
            build();
        }
    }, 'chip'));
    body.appendChild(group(UI.view, views.map((v) => v.wrap), 'chips'));
    const frame = h('div', 'carve');
    const svg = svgEl('svg', { class: 'carve-svg', 'aria-hidden': 'true', focusable: 'false', preserveAspectRatio: 'none' });
    const area = h('div', 'carve-area');
    frame.appendChild(svg);
    frame.appendChild(area);
    body.appendChild(frame);
    const help = h('p', 'bench-help', UI.carveHelp);
    body.appendChild(help);
    const cutBtn = button('bench-cut', UI.cut, () => {
        if (!draft || sameCarve(draft, base)) return;
        kit.onCut(draft);
    }, 'bench-btn is-strong');
    const rubBtn = button('bench-rubout', UI.rubOut, () => {
        // It hides itself with nothing left to rub out, so a keyboard's focus
        // goes to the line's first point, where a fresh line starts.
        const had = document.activeElement === rubBtn;
        draft = base;
        refresh();
        kit.onDraft(null);
        const first = handles.values().next().value;
        if (had && first && typeof first.knob.focus === 'function') first.knob.focus({ preventScroll: true });
    });
    body.appendChild(h('div', 'bench-row', null, [cutBtn, rubBtn]));

    // Sanding: one slider for how round the edges are (M4.4).
    const sand = document.createElement('input');
    sand.type = 'range';
    sand.id = 'bench-sand';
    sand.min = '0';
    sand.max = '4';
    sand.step = '1';
    const sandText = h('span', 'choice-blurb', '');
    const sandValue = () => (Number(sand.value) || 0) / 4;
    listen(sand, 'input', () => kit.onSand(sandValue(), false));
    // A drag lets go once, with `change`. Arrow keys fire `change` on every
    // step, so a keyboard's steps are kept quietly and the host's line, the
    // block and its sound wait for the slider to be let go of (blur): one
    // line, not one a keypress over the slider's own value (M7.1).
    let keyed = false;
    let owed = false;
    listen(sand, 'keydown', () => { keyed = true; });
    listen(sand, 'pointerdown', () => { keyed = false; });
    listen(sand, 'change', () => {
        if (!keyed) {
            kit.onSand(sandValue(), true);
            return;
        }
        owed = true;
        kit.onSand(sandValue(), 'quiet');
    });
    listen(sand, 'blur', () => {
        keyed = false;
        if (!owed) return;
        owed = false;
        kit.onSand(sandValue(), true);
    });
    const sandLabel = h('label', 'bench-range', null, [h('span', 'choice-label', UI.sand), sand, sandText]);
    sandLabel.setAttribute('for', 'bench-sand');
    body.appendChild(sandLabel);

    function valueText(edge, i, v) {
        const at = U.length(gridX(C)[i], kit.units());
        const what = edge === 'width' ? `${U.length(v, kit.units())} wide` : `${U.length(v, kit.units())} above the bottom`;
        const held = limitsOf(i, C).locked ? ', beside an axle slot' : '';
        return `${at} from the nose${held}: ${what}`;
    }

    function setValue(edge, i, v) {
        const next = setPoint(draft, edge, i, v, C);
        if (sameCarve(next, draft)) return;
        draft = next;
        refresh();
        kit.onDraft(sameCarve(draft, base) ? null : draft);
    }

    function onKey(edge, i, e) {
        const L = limitsOf(i, C)[edge];
        const v = draft[edge][i];
        const keys = {
            ArrowUp: () => nudge(v, 1, false, C), ArrowRight: () => nudge(v, 1, false, C),
            ArrowDown: () => nudge(v, -1, false, C), ArrowLeft: () => nudge(v, -1, false, C),
            PageUp: () => nudge(v, 1, true, C), PageDown: () => nudge(v, -1, true, C),
            Home: () => L[0], End: () => L[1]
        };
        const f = keys[e.key];
        if (!f) return;
        e.preventDefault();
        setValue(edge, i, f());
    }

    function onDrag(e) {
        if (!drag) return;
        const r = area.getBoundingClientRect();
        if (!r || !r.height) return;
        const f = (e.clientY - r.top) / r.height;
        setValue(drag.edge, drag.i, fromView(view, f < 0 ? 0 : f > 1 ? 1 : f, C));
    }

    /** The handles and the drawing for the view, made afresh. */
    function build() {
        area.textContent = '';
        handles.clear();
        const V = viewOf(view, C);
        svg.setAttribute('viewBox', `0 0 ${V.w} ${V.h}`);
        frame.classList.toggle('is-top', view === 'top');
        for (const [edge, i] of handlesOf(view, C)) {
            const knob = h('span', `carve-handle is-${edge}`);
            knob.id = `bench-${edge}-${i}`;
            knob.setAttribute('role', 'slider');
            knob.setAttribute('tabindex', '0');
            knob.setAttribute('aria-orientation', 'vertical');
            knob.setAttribute('aria-label', `${NAMES[edge]} of the line, ${U.length(gridX(C)[i], kit.units())} from the nose`);
            if (limitsOf(i, C).locked) knob.classList.add('is-held');
            listen(knob, 'keydown', (e) => onKey(edge, i, e));
            listen(knob, 'pointerdown', (e) => {
                if (e.preventDefault) e.preventDefault();
                drag = { edge, i };
                if (knob.setPointerCapture && e.pointerId !== undefined) knob.setPointerCapture(e.pointerId);
                if (typeof knob.focus === 'function') knob.focus({ preventScroll: true });
            });
            listen(knob, 'pointermove', onDrag);
            for (const t of ['pointerup', 'pointercancel']) listen(knob, t, () => { drag = null; });
            area.appendChild(knob);
            handles.set(`${edge}-${i}`, { knob, edge, i });
        }
        refresh();
    }

    /** The outline a set of stations or curves draws, as an SVG path. */
    function pathOf(read) {
        const V = viewOf(view, C);
        const n = 56;
        const up = [];
        const down = [];
        for (let k = 0; k <= n; k++) {
            const d = (C.kit.length * k) / n;
            const [b, t, w] = read(d);
            if (view === 'top') {
                up.push(toView('top', d, w / 2, C));
                down.push(toView('top', d, -w / 2, C));
            } else {
                up.push(toView('side', d, t, C));
                down.push(toView('side', d, b, C));
            }
        }
        const pts = up.concat(down.reverse());
        return `M${pts.map(([x, y]) => `${x.toFixed(1)} ${Math.min(V.h, Math.max(0, y)).toFixed(1)}`).join(' L')} Z`;
    }

    function refresh() {
        if (!draft) return;
        const V = viewOf(view, C);
        const stations = kit.build().stations;
        const c = curvesOf(draft, C);
        svg.textContent = '';
        svg.appendChild(svgEl('rect', { x: 0, y: 0, width: V.w, height: V.h, class: 'carve-block' }));
        svg.appendChild(svgEl('path', { d: pathOf((d) => profileAt(stations, d)), class: 'carve-car' }));
        if (view === 'side') {
            for (const axle of [C.kit.frontAxle, C.kit.rearAxle]) {
                const [x, y] = toView('side', axle, C.kit.axleHeight, C);
                svg.appendChild(svgEl('circle', { cx: x, cy: y, r: 9, class: 'carve-axle' }));
            }
        } else {
            for (const axle of [C.kit.frontAxle, C.kit.rearAxle]) {
                const [x] = toView('top', axle, 0, C);
                svg.appendChild(svgEl('line', { x1: x, y1: 0, x2: x, y2: V.h, class: 'carve-axle-line' }));
            }
        }
        svg.appendChild(svgEl('path', { d: pathOf((d) => [c.bottom(d), c.top(d), c.width(d)]), class: 'carve-line' }));
        const xs = gridX(C);
        for (const { knob, edge, i } of handles.values()) {
            const v = draft[edge][i];
            const [x, y] = toView(view, xs[i], edge === 'width' ? v / 2 : v, C);
            knob.style.left = `${(x / V.w) * 100}%`;
            knob.style.top = `${(y / V.h) * 100}%`;
            const L = limitsOf(i, C)[edge];
            knob.setAttribute('aria-valuemin', String(Math.round((L[0] / IN) * 1000) / 1000));
            knob.setAttribute('aria-valuemax', String(Math.round((L[1] / IN) * 1000) / 1000));
            knob.setAttribute('aria-valuenow', String(Math.round((v / IN) * 1000) / 1000));
            knob.setAttribute('aria-valuetext', valueText(edge, i, v));
        }
        const changed = !sameCarve(draft, base);
        cutBtn.setAttribute('aria-disabled', changed ? 'false' : 'true');
        rubBtn.hidden = !changed;
    }

    function update() {
        const b = kit.build();
        const s = Math.round((b.tune.sand || 0) * 4);
        sand.value = String(s);
        sand.setAttribute('aria-valuetext', SAND[s]);
        sandText.textContent = SAND[s];
        for (const v of views) v.input.checked = v.input.value === view;
        refresh();
    }

    return {
        /** A new car, or a new cut: the pencil starts on its outline. */
        reset(b) {
            base = b.carve || carveFrom(b.stations, C);
            draft = base;
            if (!handles.size) build();
            update();
        },
        update,
        draft: () => draft,
        changed: () => Boolean(draft) && !sameCarve(draft, base)
    };
}
