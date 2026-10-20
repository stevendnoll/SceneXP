// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * bench.js - the workbench's panel (M3, the quick build): the garage of
 * four, the starting designs, paint, the weights in their pockets with
 * Auto-weigh, the axles and wheels, Standard or Outlaw with the rule sheet
 * and the car's figures checked live, and the settings. The host speaks at
 * the top, and Race it waits at the bottom (PRD, Time to first race).
 *
 * BUILT ONCE, UPDATED IN PLACE. Every control is made when the bench opens
 * and only its state changes after, so a tap or a key never loses its
 * place: focus stays on the pocket just filled, the scroll where it was.
 * Only the garage's list is rebuilt, when a car comes or goes, and it hands
 * focus back to the same car.
 *
 * EVERY CHANGE IS ONE STEP: the build is changed, kept in the garage at
 * once (garage.js), and handed to main.js (`hooks.changed`) to redraw the
 * car on the turntable. The physics never runs here: car.js weighs the
 * build and checks its sheet, which is all the bench shows.
 *
 * KEYBOARD AND SCREEN READERS: real radio buttons, checkboxes, a range and
 * buttons, each labeled, the sections native <details>. The host's line is
 * a polite live region, and a weight change says the new weight through a
 * second one, so a pocket filled by keyboard is heard.
 *
 * NO MARKUP FROM STRINGS: a car's name is the visitor's (M4), so every word
 * goes in through textContent (board.h).
 */

import { DERBY_CONFIG, IN, OZ } from './config.min.js';
import { describeCar, checkRules } from './car.min.js';
import { pocketsOf, roomLeft, holdsTungsten, addWeight, removeWeight, fitWeights } from './weights.min.js';
import { weighAuto, newCar } from './garage.min.js';
import * as U from './units.min.js';
import {
    UI, POLISH, SAY, ruleNote, RULE_NAMES, bestLine, trophyList, hostFirst, hostBack, hostStep, hostTune, FIX_SECTION
} from './copy.min.js';
import { h } from './board.min.js';

const TOOLS = Object.freeze(['cylinder', 'cube', 'strip', 'out']);
/** The rule checks, by where the car's own figure is kept. */
const FIGURE = Object.freeze({
    mass: (car) => car.mass,
    length: (car) => car.dims.length,
    width: (car) => car.dims.width,
    wheelGap: (car) => car.dims.wheelGap,
    clearance: (car) => car.dims.clearance
});
const SHEET_UNIT = Object.freeze({ mass: OZ, length: IN, width: IN, wheelGap: IN, clearance: IN });

/**
 * A build's figures for the panel, in the visitor's `units`: each rule
 * check { rule, label, value, limit, ok, note }, the figures no rule limits
 * (height, balance), whether it may race, and the notes for one that may
 * not. Pure.
 */
export function statsOf(build, units, C = DERBY_CONFIG) {
    const car = describeCar(build, C);
    const R = C.rules[car.rules];
    const checks = checkRules(car, car.rules, C).map((c) => {
        const figure = FIGURE[c.rule](car);
        const limitSI = c.rule === 'mass' ? R.maxMass : R[{ length: 'maxLength', width: 'maxWidth', wheelGap: 'minWheelGap', clearance: 'minClearance' }[c.rule]];
        const write = c.rule === 'mass' ? U.mass : U.length;
        const by = Math.abs(c.value - c.limit) * SHEET_UNIT[c.rule];
        return {
            rule: c.rule,
            label: RULE_NAMES[c.rule],
            value: write(figure, units),
            limit: c.rule === 'mass' ? U.sheetMass(limitSI) : U.sheetLength(limitSI),
            ok: c.ok,
            note: c.ok ? '' : ruleNote(c.rule, write(by, units))
        };
    });
    const notes = checks.filter((c) => !c.ok).map((c) => c.note);
    return {
        car,
        checks,
        extra: [
            { id: 'height', label: 'Height', value: U.length(car.dims.height, units) },
            { id: 'balance', label: 'Balance point', value: `${U.length(car.balance, units)} in front of the rear axle` }
        ],
        legal: notes.length === 0,
        notes
    };
}

/** What a pocket button says to a screen reader. Pure. */
export function pocketLabel(spot, units, C = DERBY_CONFIG) {
    const kinds = { cylinder: 0, cube: 0, strip: 0, putty: 0 };
    for (const p of spot.pieces) kinds[p.kind]++;
    const parts = [];
    if (kinds.cylinder) parts.push(`${kinds.cylinder} ${kinds.cylinder === 1 ? 'cylinder' : 'cylinders'}`);
    if (kinds.cube) parts.push(`${kinds.cube} ${kinds.cube === 1 ? 'cube' : 'cubes'}`);
    if (kinds.strip) parts.push(`${kinds.strip} ${kinds.strip === 1 ? 'strip' : 'strips'}`);
    if (kinds.putty) parts.push('putty');
    const where = `Pocket ${U.length(spot.x, units)} from the nose`;
    if (spot.wood <= 0) return `${where}: no wood here`;
    const holds = parts.length ? parts.join(', ') : 'empty';
    const left = roomLeft(spot, C);
    const room = holdsTungsten(spot, C) ? `room for ${left} more ${left === 1 ? 'cylinder' : 'cylinders'}` : 'too thin for tungsten, strips only';
    return `${where}: ${holds}, ${room}`;
}

const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;

/**
 * The bench, in the elements main.js found (`el`: bench-body, bench-host,
 * bench-host-actions, bench-summary, bench-race, bench-status). `hooks`:
 * changed(build), race(build), units(units), forgot(build), raceAgain(event),
 * track(action, params). Returns { build, update, arrive, say, openBox }.
 */
export function createBench(el, garage, hooks, C = DERBY_CONFIG, { signal } = {}) {
    let build = garage.bench();
    let tool = 'cylinder';
    /** A two-step button waiting for its second tap: 'delete' | 'forget'. */
    let armed = null;
    const listen = (node, type, fn) => node.addEventListener(type, fn, signal ? { signal } : undefined);
    const units = () => garage.settings().units;
    const ui = {};

    // ---- Building the panel, once ------------------------------------------

    function box(id, title, open) {
        const sum = h('span', 'bench-sum', '');
        const summary = h('summary', 'bench-box-head', null, [h('span', 'bench-box-title', title), sum]);
        const body = h('div', 'bench-box-body');
        const d = h('details', 'bench-box', null, [summary, body]);
        d.id = `bench-${id}-box`;
        d.open = open;
        return { d, sum, body };
    }

    function choice(type, name, value, label, blurb, onChange, extraClass = '') {
        const input = document.createElement('input');
        input.type = type;
        input.name = name;
        input.value = value;
        input.id = `${name}-${value}`;
        listen(input, 'change', () => onChange(input));
        const text = h('span', 'choice-text', null, [h('span', 'choice-label', label), blurb ? h('span', 'choice-blurb', blurb) : null]);
        const wrap = h('label', `choice ${extraClass}`.trim(), null, [input, text]);
        wrap.setAttribute('for', input.id);
        return { wrap, input, text };
    }

    function group(legend, children, className = 'choices') {
        const fs = h('fieldset', 'bench-group', null, [h('legend', 'bench-legend', legend)]);
        const box = h('div', className, null, children);
        fs.appendChild(box);
        return fs;
    }

    function swatch(name, value, label, color, onPick) {
        const c = choice('radio', name, value, label, null, (input) => {
            if (input.checked) onPick();
        }, 'swatch');
        // The label's text is for screen readers; the eye sees the color.
        c.text.classList.add('sr-only');
        const dot = h('span', 'swatch-dot');
        if (color === null) dot.classList.add('is-none');
        else dot.style.backgroundColor = hex(color);
        dot.setAttribute('aria-hidden', 'true');
        c.wrap.insertBefore(dot, c.text);
        c.wrap.setAttribute('title', label);
        return c;
    }

    function button(id, text, onClick, className = 'bench-btn') {
        const b = h('button', className, text);
        b.type = 'button';
        b.id = id;
        listen(b, 'click', onClick);
        return b;
    }

    function make() {
        const body = el['bench-body'];
        body.textContent = '';

        // The garage.
        ui.garage = h('section', 'bench-garage');
        ui.garage.setAttribute('aria-labelledby', 'bench-garage-title');
        const gh = h('h3', 'bench-legend', UI.garage);
        gh.id = 'bench-garage-title';
        ui.garageList = h('div', 'bench-cars');
        ui.newBtn = button('bench-new', UI.newCar, addNew);
        ui.copyBtn = button('bench-copy', UI.copyCar, copyCar);
        ui.deleteBtn = button('bench-delete', UI.deleteCar, deleteCar);
        ui.best = h('p', 'bench-note', '');
        ui.trophies = h('p', 'bench-note', '');
        for (const n of [gh, ui.garageList, h('div', 'bench-row', null, [ui.newBtn, ui.copyBtn, ui.deleteBtn]), ui.best, ui.trophies]) ui.garage.appendChild(n);
        body.appendChild(ui.garage);

        // Shape.
        const shape = box('shape', UI.shape, true);
        ui.shapeSum = shape.sum;
        ui.designs = C.bench.designs.map((id) => choice('radio', 'bench-design', id, C.designs[id].label, null, (input) => {
            if (input.checked) setDesign(id);
        }, 'chip'));
        shape.body.appendChild(group(UI.shape, ui.designs.map((d) => d.wrap), 'chips'));
        body.appendChild(shape.d);

        // Paint.
        const paint = box('paint', UI.paint, true);
        ui.paintSum = paint.sum;
        ui.bodyColors = C.paint.colors.map((c) => swatch('bench-body', c.id, c.label, c.color, () => setPaint({ body: c.color })));
        ui.custom = document.createElement('input');
        ui.custom.type = 'color';
        ui.custom.id = 'bench-custom';
        listen(ui.custom, 'input', () => setPaint({ body: parseInt(ui.custom.value.slice(1), 16) }, { keep: false }));
        listen(ui.custom, 'change', () => setPaint({ body: parseInt(ui.custom.value.slice(1), 16) }));
        const customLabel = h('label', 'swatch-custom', null, [ui.custom, h('span', 'swatch-custom-text', UI.customColor)]);
        customLabel.setAttribute('for', 'bench-custom');
        paint.body.appendChild(group(UI.bodyColor, ui.bodyColors.map((s) => s.wrap).concat([customLabel]), 'swatches'));
        ui.stripes = [swatch('bench-stripe', 'none', UI.noStripe, null, () => setPaint({ stripe: null }))]
            .concat(C.paint.colors.map((c) => swatch('bench-stripe', c.id, `${c.label} stripe`, c.color, () => setPaint({ stripe: c.color }))));
        paint.body.appendChild(group(UI.stripe, ui.stripes.map((s) => s.wrap), 'swatches'));
        ui.finishes = Object.entries(C.paint.finishes).map(([id, f]) => choice('radio', 'bench-finish', id, f.label, null, (input) => {
            if (input.checked) setPaint({ finish: id });
        }, 'chip'));
        paint.body.appendChild(group(UI.finish, ui.finishes.map((f) => f.wrap), 'chips'));
        body.appendChild(paint.d);

        // Weights.
        const weights = box('weights', UI.weights, false);
        ui.weightsSum = weights.sum;
        // Each weight's own mass under its name, rewritten when the units change.
        ui.tools = TOOLS.map((t) => choice('radio', 'bench-tool', t, t === 'out' ? UI.takeOut : C.weights[t].label.replace(/^Tungsten /, '').replace(/^\w/, (m) => m.toUpperCase()), t === 'out' ? null : U.mass(C.weights[t].mass, units()), (input) => {
            if (input.checked) tool = t;
        }, 'chip'));
        weights.body.appendChild(group('Add or take out', ui.tools.map((t) => t.wrap), 'chips'));
        ui.pockets = [];
        // Front and Rear above the row, so the pockets get its whole width.
        const ends = h('div', 'pocket-ends', null, [h('span', null, UI.front), h('span', null, UI.rear)]);
        ends.setAttribute('aria-hidden', 'true');
        weights.body.appendChild(ends);
        const row = h('div', 'pockets');
        C.bench.pockets.at.forEach((inches, i) => {
            const b = button(`bench-pocket-${i}`, '', () => tapPocket(i), 'pocket');
            ui.pockets.push(b);
            row.appendChild(b);
            // The axle slots between the pockets either side of them.
            const next = C.bench.pockets.at[i + 1];
            for (const axle of [C.kit.frontAxle, C.kit.rearAxle]) {
                if (next !== undefined && inches * IN < axle && next * IN > axle) {
                    const m = h('span', 'pocket-axle', '');
                    m.setAttribute('title', UI.axleMark);
                    m.setAttribute('aria-hidden', 'true');
                    row.appendChild(m);
                }
            }
        });
        weights.body.appendChild(row);
        weights.body.appendChild(h('p', 'bench-help', 'Choose a weight, then tap a pocket to drop it in. Choose Take out to lift the last one back out. The lines between the pockets are the axles.'));
        ui.autoBtn = button('bench-auto', UI.autoWeigh, autoWeigh, 'bench-btn is-strong');
        ui.allOutBtn = button('bench-allout', UI.allOut, allOut);
        weights.body.appendChild(h('div', 'bench-row', null, [ui.autoBtn, ui.allOutBtn]));
        ui.autoHelp = h('p', 'bench-help', '');
        weights.body.appendChild(ui.autoHelp);
        body.appendChild(weights.d);

        // Axles and wheels: plain controls in M3, the animations in M5.
        const axles = box('axles', UI.axles, false);
        ui.axlesSum = axles.sum;
        ui.deburr = choice('checkbox', 'bench-tune', 'deburr', UI.deburr, UI.deburrBlurb, (i) => setTune({ deburr: i.checked }));
        ui.polish = document.createElement('input');
        ui.polish.type = 'range';
        ui.polish.id = 'bench-polish';
        ui.polish.min = '0';
        ui.polish.max = String(C.physics.axleFriction.polish.length);
        ui.polish.step = '1';
        listen(ui.polish, 'input', () => setTune({ polish: Number(ui.polish.value) || 0 }));
        ui.polishText = h('span', 'choice-blurb', '');
        const polishLabel = h('label', 'bench-range', null, [h('span', 'choice-label', UI.polish), ui.polish, ui.polishText]);
        polishLabel.setAttribute('for', 'bench-polish');
        ui.graphite = choice('checkbox', 'bench-tune', 'graphite', UI.graphite, UI.graphiteBlurb, (i) => setTune({ graphite: i.checked }));
        ui.align = choice('checkbox', 'bench-tune', 'align', UI.align, UI.alignBlurb, (i) => setTune({ align: i.checked }));
        axles.body.appendChild(group(UI.axles, [ui.deburr.wrap, polishLabel, ui.graphite.wrap, ui.align.wrap]));
        body.appendChild(axles.d);

        // Rules: the class, the sheet with the car's figures, and the rest.
        const rules = box('rules', UI.rules, false);
        ui.rulesSum = rules.sum;
        ui.classes = ['standard', 'outlaw'].map((r) => choice('radio', 'bench-class', r, UI[r], UI[`${r}Blurb`], (input) => {
            if (input.checked) setRules(r);
        }));
        rules.body.appendChild(group('Class', ui.classes.map((c) => c.wrap)));
        ui.sheet = h('table', 'bench-sheet');
        const head = h('tr', null, null, [h('th', null, 'Rule'), h('th', null, 'Your car'), h('th', null, 'Limit')]);
        for (const th of head.children) th.setAttribute('scope', 'col');
        ui.sheetRows = {};
        const tbody = h('tbody');
        for (const rule of Object.keys(RULE_NAMES)) {
            const value = h('td', 'sheet-value', '');
            const limit = h('td', 'sheet-limit', '');
            const name = h('th', null, RULE_NAMES[rule]);
            name.setAttribute('scope', 'row');
            const tr = h('tr', null, null, [name, value, limit]);
            ui.sheetRows[rule] = { tr, value, limit };
            tbody.appendChild(tr);
        }
        ui.sheet.appendChild(h('thead', null, null, [head]));
        ui.sheet.appendChild(tbody);
        ui.sheetCaption = h('caption', 'sheet-caption', '');
        ui.sheet.insertBefore(ui.sheetCaption, ui.sheet.children[0]);
        rules.body.appendChild(ui.sheet);
        ui.notes = h('ul', 'bench-notes');
        rules.body.appendChild(ui.notes);
        ui.extra = h('dl', 'bench-extra');
        rules.body.appendChild(h('h4', 'bench-legend', UI.alsoMeasured));
        rules.body.appendChild(ui.extra);
        body.appendChild(rules.d);

        // Settings.
        const settings = box('settings', UI.settings, false);
        ui.settingsSum = settings.sum;
        ui.units = U.UNITS.map((u) => choice('radio', 'bench-units', u, U.unitsLabel(u), null, (input) => {
            if (input.checked) setUnits(u);
        }, 'chip'));
        settings.body.appendChild(group(UI.units, ui.units.map((u) => u.wrap), 'chips'));
        ui.forgetBtn = button('bench-forget', UI.forget, forget);
        settings.body.appendChild(h('div', 'bench-row', null, [ui.forgetBtn]));
        settings.body.appendChild(h('p', 'bench-help', 'Your cars, their results and your trophies are kept in this browser only, never sent anywhere.'));
        body.appendChild(settings.d);

        ui.boxes = { shape: shape.d, paint: paint.d, weights: weights.d, axles: axles.d, rules: rules.d, settings: settings.d };

        const more = h('p', 'checkin-more', null, [h('a', 'checkin-explore', UI.explore)]);
        more.children[0].id = 'bench-explore';
        more.children[0].setAttribute('href', C.site.home.path);
        body.appendChild(more);

        listen(el['bench-race'], 'click', raceIt);
    }

    // ---- Keeping it current -------------------------------------------------

    function fillGarage() {
        // Rebuilt only when the cars themselves change (one comes or goes,
        // or is repainted or reshaped), not on every tap of the bench.
        const key = garage.cars().map((c) => `${c.id}:${garage.nameOf(c)}:${c.design}:${c.rules}:${c.paint.body}`).join('|');
        if (key === ui.garageKey) {
            for (const r of ui.carRadios) r.checked = r.value === build.id;
            return;
        }
        ui.garageKey = key;
        ui.carRadios = [];
        const keepFocus = document.activeElement && document.activeElement.name === 'bench-car';
        const list = ui.garageList;
        list.textContent = '';
        let focusMe = null;
        for (const car of garage.cars()) {
            const c = choice('radio', 'bench-car', car.id, garage.nameOf(car), `${C.designs[car.design].label} · ${car.rules === 'outlaw' ? UI.outlaw : UI.standard}`, (input) => {
                if (input.checked) pick(car.id);
            }, 'chip car-chip');
            const dot = h('span', 'swatch-dot');
            dot.style.backgroundColor = hex(car.paint.body);
            dot.setAttribute('aria-hidden', 'true');
            c.wrap.insertBefore(dot, c.text);
            c.input.checked = car.id === build.id;
            ui.carRadios.push(c.input);
            if (c.input.checked) focusMe = c.input;
            list.appendChild(c.wrap);
        }
        if (keepFocus && focusMe && typeof focusMe.focus === 'function') focusMe.focus({ preventScroll: true });
    }

    function update() {
        const u = units();
        const stats = statsOf(build, u, C);
        const car = stats.car;
        const name = garage.nameOf(build);
        const full = garage.isFull();

        fillGarage();
        ui.newBtn.disabled = false;
        ui.copyBtn.disabled = false;
        ui.newBtn.setAttribute('aria-disabled', full ? 'true' : 'false');
        ui.copyBtn.setAttribute('aria-disabled', full ? 'true' : 'false');
        ui.deleteBtn.hidden = garage.cars().length <= 1;
        ui.deleteBtn.textContent = armed === 'delete' ? 'Tap again to delete' : UI.deleteCar;
        ui.best.textContent = bestLine(name, garage.results(build.id));
        ui.trophies.textContent = trophyList(garage.trophies());

        for (const d of ui.designs) d.input.checked = d.input.value === build.design;
        ui.shapeSum.textContent = C.designs[build.design].label;

        const named = C.paint.colors.find((c) => c.color === build.paint.body);
        for (const s of ui.bodyColors) s.input.checked = Boolean(named) && s.input.value === named.id;
        ui.custom.value = hex(build.paint.body);
        const stripe = build.paint.stripe === null ? null : C.paint.colors.find((c) => c.color === build.paint.stripe);
        for (const s of ui.stripes) s.input.checked = s.input.value === (build.paint.stripe === null ? 'none' : stripe ? stripe.id : '');
        for (const f of ui.finishes) f.input.checked = f.input.value === build.paint.finish;
        const finish = C.paint.finishes[build.paint.finish].label.toLowerCase();
        ui.paintSum.textContent = `${named ? named.label : 'Custom'}, ${finish}${build.paint.stripe === null ? '' : ', with a stripe'}`;

        for (const t of ui.tools) t.input.checked = t.input.value === tool;
        for (const t of ui.tools) {
            if (t.input.value !== 'out') t.text.children[1].textContent = U.mass(C.weights[t.input.value].mass, u);
        }
        const { spots } = pocketsOf(build, C);
        spots.forEach((s, i) => {
            const b = ui.pockets[i];
            const n = s.pieces.length;
            b.textContent = n ? String(n) : '';
            b.classList.toggle('is-filled', n > 0);
            b.classList.toggle('is-thin', !holdsTungsten(s, C));
            b.style.setProperty('--fill', String(s.budget > 0 ? Math.min(1, s.used / s.budget) : 0));
            b.setAttribute('aria-label', pocketLabel(s, u, C));
        });
        ui.weightsSum.textContent = `${U.mass(car.mass, u)}, ${build.ballast === 'auto' ? 'auto-weighed' : 'placed by hand'}`;
        ui.autoHelp.textContent = `Auto-weigh fills the car to ${U.mass(C.rules[build.rules].maxMass, u)} with the weight about ${U.length(C.bench.autoBalance * IN, u)} in front of the rear axle, where a car runs fastest.`;

        const t = build.tune;
        ui.deburr.input.checked = t.deburr;
        ui.polish.value = String(t.polish);
        ui.polish.setAttribute('aria-valuetext', POLISH[t.polish]);
        ui.polishText.textContent = POLISH[t.polish];
        ui.graphite.input.checked = t.graphite;
        ui.align.input.checked = t.align;
        const done = [t.deburr ? 'de-burred' : '', t.polish ? POLISH[t.polish].replace(' and polishing compound', ' and compound') : '', t.graphite ? 'graphite' : '', t.align ? 'aligned' : ''].filter(Boolean);
        ui.axlesSum.textContent = done.length ? done.join(', ') : 'As they came';

        for (const c of ui.classes) c.input.checked = c.input.value === build.rules;
        ui.sheet.classList.toggle('is-outlaw', build.rules === 'outlaw');
        ui.sheetCaption.textContent = build.rules === 'outlaw' ? 'The Outlaw class: only what the track allows' : 'The house rule sheet';
        for (const c of stats.checks) {
            const r = ui.sheetRows[c.rule];
            r.value.textContent = `${c.ok ? '✓' : '✗'} ${c.value}`;
            r.limit.textContent = c.limit;
            r.tr.classList.toggle('is-over', !c.ok);
        }
        ui.notes.textContent = '';
        for (const n of stats.notes) ui.notes.appendChild(h('li', null, n));
        ui.extra.textContent = '';
        for (const x of stats.extra) {
            ui.extra.appendChild(h('dt', null, x.label));
            ui.extra.appendChild(h('dd', null, x.value));
        }
        ui.rulesSum.textContent = `${UI[build.rules]}, ${stats.legal ? 'all good' : 'needs a fix'}`;

        for (const x of ui.units) x.input.checked = x.input.value === u;
        ui.settingsSum.textContent = U.unitsLabel(u);
        ui.forgetBtn.textContent = armed === 'forget' ? UI.forgetSure : UI.forget;

        if (el['bench-summary']) el['bench-summary'].textContent = `${name} · ${U.mass(car.mass, u)} · balance ${U.length(car.balance, u)}`;
        return stats;
    }

    // ---- Changes ------------------------------------------------------------

    /** The host's line, and the ways on as buttons. */
    function say(text, actions = []) {
        if (el['bench-host']) el['bench-host'].textContent = text;
        const box = el['bench-host-actions'];
        if (!box) return;
        box.textContent = '';
        for (const a of actions) {
            // Outlined: Race it is the panel's one filled button.
            const b = h('button', a.strong ? 'results-another small is-accent' : 'results-another small', a.label);
            b.type = 'button';
            listen(b, 'click', a.run);
            box.appendChild(b);
        }
    }

    function status(text) {
        if (el['bench-status']) el['bench-status'].textContent = text;
    }

    /** Keep a changed build and show it. `keep: false` previews only (the
     *  custom color while it is being dragged). */
    function commit(next, line = null, { keep = true } = {}) {
        armed = null;
        build = keep ? (garage.save(next) || next) : next;
        update();
        hooks.changed(build);
        if (line) say(line);
    }

    function setDesign(id) {
        if (id === build.design) return;
        let next = { ...build, design: id, stations: C.designs[id].stations.map((s) => [...s]) };
        let line;
        if (next.ballast === 'auto') {
            next = weighAuto(next, C);
            line = SAY.shapeAuto(C.designs[id].label);
        } else {
            const f = fitWeights(next, C);
            next.weights = f.weights;
            line = SAY.shapeHand(C.designs[id].label, f.dropped);
        }
        commit(next, line);
        hooks.track('bench', { kind: 'shape', outcome: id });
    }

    function setPaint(patch, opts) {
        commit({ ...build, paint: { ...build.paint, ...patch } }, null, opts);
    }

    function setTune(patch) {
        commit({ ...build, tune: { ...build.tune, ...patch } });
        status(ui.axlesSum.textContent);
    }

    function setRules(rules) {
        if (rules === build.rules) return;
        let next = { ...build, rules };
        if (next.ballast === 'auto') next = weighAuto(next, C);
        else next.weights = fitWeights(next, C).weights;
        const max = U.sheetMass(C.rules[rules].maxMass);
        commit(next, rules === 'outlaw' ? SAY.outlaw(max) : SAY.standard(max));
        hooks.track('bench', { kind: 'class', outcome: rules });
    }

    function weighed() {
        const car = describeCar(build, C);
        status(`${U.mass(car.mass, units())}, balance ${U.length(car.balance, units())}`);
    }

    function tapPocket(i) {
        armed = null;
        if (tool === 'out') {
            const w = removeWeight(build, i, C);
            if (!w) {
                say(SAY.empty);
                return;
            }
            commit({ ...build, weights: w, ballast: 'hand' });
        } else {
            const r = addWeight(build, i, tool, C);
            if (!r.weights) {
                say(r.why === 'full' ? (tool === 'strip' ? SAY.stripsFull : SAY.full) : SAY.noWood);
                return;
            }
            commit({ ...build, weights: r.weights, ballast: 'hand' });
        }
        weighed();
    }

    function autoWeigh() {
        const next = weighAuto(build, C);
        const car = describeCar(next, C);
        const u = units();
        const short = Math.abs(car.balance - C.bench.autoBalance * IN) > 0.05 * IN;
        commit(next, (short ? SAY.autoShort : SAY.autoWeighed)(U.mass(car.mass, u), U.length(car.balance, u)));
        hooks.track('bench', { kind: 'auto-weigh' });
    }

    function allOut() {
        const next = { ...build, weights: [], ballast: 'hand' };
        commit(next, SAY.allOut(U.mass(describeCar(next, C).mass, units())));
    }

    function pick(id) {
        armed = null;
        if (!garage.setBench(id)) return;
        build = garage.bench();
        update();
        hooks.changed(build);
        say(SAY.picked(garage.nameOf(build)));
    }

    function addNew() {
        armed = null;
        if (garage.isFull()) {
            say(SAY.full4);
            update();
            return;
        }
        build = garage.add(newCar(C, { index: garage.cars().length }));
        update();
        hooks.changed(build);
        say(SAY.newCar(garage.nameOf(build), U.mass(describeCar(build, C).mass, units())));
        hooks.track('bench', { kind: 'new-car', outcome: `cars=${garage.cars().length}` });
    }

    function copyCar() {
        armed = null;
        if (garage.isFull()) {
            say(SAY.full4);
            update();
            return;
        }
        const from = garage.nameOf(build);
        build = garage.add({ ...build, name: '' });
        update();
        hooks.changed(build);
        say(SAY.copied(from, garage.nameOf(build)));
        hooks.track('bench', { kind: 'copy-car', outcome: `cars=${garage.cars().length}` });
    }

    function deleteCar() {
        if (armed !== 'delete') {
            armed = 'delete';
            update();
            say(SAY.deleteSure(garage.nameOf(build)));
            return;
        }
        armed = null;
        const gone = garage.nameOf(build);
        if (garage.remove(build.id)) {
            build = garage.bench();
            update();
            hooks.changed(build);
            say(SAY.deleted(gone, garage.nameOf(build)));
            if (typeof ui.newBtn.focus === 'function') ui.newBtn.focus({ preventScroll: true });
            hooks.track('bench', { kind: 'delete-car', outcome: `cars=${garage.cars().length}` });
        }
    }

    function setUnits(u) {
        armed = null;
        garage.setSetting('units', u);
        update();
        hooks.units(u);
    }

    function forget() {
        if (armed !== 'forget') {
            armed = 'forget';
            update();
            return;
        }
        armed = null;
        build = garage.forget();
        tool = 'cylinder';
        update();
        hooks.forgot(build);
        say(SAY.forgot(garage.nameOf(build)));
        hooks.track('garage-forget', {});
    }

    function raceIt() {
        armed = null;
        const stats = update();
        if (!stats.legal) {
            say(SAY.illegal(garage.nameOf(build), stats.notes.join(' ')));
            openBox('rules');
            return;
        }
        hooks.race(build);
    }

    /** Open a section (a host's pointer to it), the rest left as they are. */
    function openBox(id) {
        const d = ui.boxes[id];
        if (d) d.open = true;
    }

    /**
     * The host's words on arriving at the bench (M3.9): `first` (a first
     * visit), `back` (a return), `step` (back from check-in), or `tune`
     * (from the results, `tip` being { top, sentence } from the Why lines).
     */
    function arrive(kind, { tip = null, last = null } = {}) {
        armed = null;
        build = garage.bench();
        update();
        const name = garage.nameOf(build);
        const massText = U.mass(describeCar(build, C).mass, units());
        if (kind === 'first') {
            say(hostFirst(name, massText));
        } else if (kind === 'step') {
            say(hostStep(name));
        } else if (kind === 'tune') {
            say(hostTune(name, tip && tip.top, tip && tip.sentence));
            if (tip && tip.top && tip.top.more >= 0.002) openBox(FIX_SECTION[tip.top.id]);
        } else {
            const mine = last && last.car === build.id ? last : null;
            say(hostBack(name, mine), mine ? [
                { label: 'Race again', strong: true, run: () => hooks.raceAgain(mine.event) },
                { label: 'Tune it', run: () => openBox('axles') }
            ] : []);
        }
    }

    make();
    update();
    return { build: () => build, update, arrive, say, openBox };
}
