// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * design-ui.js - The Design a play screen (specs/custom-plays-PRD, Section 4).
 *
 * A name, a formation to start from, a field to draw on, five buttons for the
 * men who can be drawn a line, Undo, Clear, Save, and the way to take a play
 * out of the book or put it back. The shell is in index.html so the stylesheet
 * has something to hang on; the controls are built here, from tables, and
 * held by reference rather than found by selector.
 *
 * IT STEPS THE PLAYBOOK ASIDE THE WAY TEAM COLORS DOES: the book hides itself
 * and hands over `back`, so only one aria-modal dialog shows at a time and a
 * change of play waiting to be kept survives the trip.
 *
 * DRAWING IS A POINTER, AND ALSO THE KEYBOARD. With a man chosen, a finger or
 * a mouse drags his route from wherever it lands: the line is anchored to the
 * man, because on a phone the finger covers the disc it is drawing from. The
 * arrow keys do the same from the canvas: they walk a crosshair from the man,
 * Space drops a point, Backspace lifts the last one and Enter finishes. Every
 * line is smoothed and simplified by design.js before it is kept, so the
 * canvas, the saved card and the field all show the same line.
 *
 * WHERE A LINE ENDS IS WHERE THE MAN STOPS. The hint says so, and the painter
 * marks it with a bar.
 *
 * What a play IS lives in design.js, what is kept lives in plays-store.js, and
 * what the game does with it is main.js's business through `onSaved`.
 */
import { XO_CONFIG as CFG } from './config.min.js';
import { PLAYS, designInk } from './playbook-ui.min.js';
import {
    listPlays, getPlay, addPlay, replacePlay, hidePlay, restorePlay, removePlay, isHidden, nextName,
} from './plays-store.min.js';
import {
    FORMATION_TEMPLATES, drawDesign, describePlay, smoothSample, strokeToLine, STROKE,
    PATH_PLAYERS, isCustomId, MAX_NAME,
} from './design.min.js';
import { formationSpots, labelOf } from './playas.min.js';

let hooks = { report() {}, announce() {}, onSaved() {} };

/** What the screen says while nobody is chosen to draw for. */
const CHOOSE_PROMPT = 'Please choose a player (A, B, C, D, or QB).';
let ui = null;
let st = null;

const el = (id) => (typeof document !== 'undefined' ? document.getElementById(id) : null);

/** A node with its properties and children, in one call. */
function h(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'for') node.htmlFor = v;
        else if (k.startsWith('aria-') || k === 'role' || k === 'tabindex' || k === 'maxlength' || k === 'autocomplete') node.setAttribute(k, v);
        else if (k.startsWith('data-')) node.dataset[k.slice(5)] = v;
        else node[k] = v;
    }
    for (const c of children) if (c) node.appendChild(c);
    return node;
}

const button = (text, cls, onClick, props = {}) => {
    const b = h('button', { type: 'button', class: cls, text, ...props });
    b.addEventListener('click', onClick);
    return b;
};

// ---- Building --------------------------------------------------------------

/**
 * Build the screen once. `report(action, detail)` is telemetry, `announce`
 * the HUD's live region, and `onSaved(record)` is told after the book is back
 * so it can put the new card under the visitor's eyes.
 */
export function initDesigner({ report, announce, onSaved } = {}) {
    hooks = {
        report: report || (() => {}),
        announce: announce || (() => {}),
        onSaved: onSaved || (() => {}),
    };
    if (ui) return ui;
    const body = el('designer-body');
    if (!body) return null;
    ui = {};

    // The name and the formation, side by side where there is room.
    ui.name = h('input', { id: 'designer-name', class: 'designer-input', type: 'text', maxlength: String(MAX_NAME), autocomplete: 'off' });
    // A name the visitor typed is theirs and stays; one this screen put there
    // follows the formation (see `suggestName`).
    ui.name.addEventListener('input', () => { if (st) st.nameIsOurs = false; });
    ui.formation = h('select', { id: 'designer-formation', class: 'designer-select' });
    ui.formation.addEventListener('change', () => onFormation(ui.formation.value));
    const top = h('div', { class: 'designer-top' }, [
        h('p', { class: 'designer-field' }, [h('label', { for: 'designer-name', text: 'Play name' }), ui.name]),
        h('p', { class: 'designer-field' }, [h('label', { for: 'designer-formation', text: 'Formation' }), ui.formation]),
    ]);

    // The field. A real image to a screen reader, saying what is drawn.
    ui.canvas = h('canvas', { id: 'designer-canvas', class: 'designer-canvas', width: 600, height: 360, role: 'img', tabindex: '0', 'aria-label': 'The field. Nothing drawn yet.' });
    ui.canvas.addEventListener('pointerdown', onPointerDown);
    ui.canvas.addEventListener('pointermove', onPointerMove);
    ui.canvas.addEventListener('pointerup', onPointerUp);
    ui.canvas.addEventListener('pointercancel', onPointerUp);
    ui.canvas.addEventListener('keydown', onCanvasKey);
    // A finished tap with nobody chosen gets the hint said out loud. A scroll
    // drag never becomes a click, so scrolling past the field stays quiet.
    // A TAP ON A MAN CHOOSES HIM (Steve, 2026-11-02: after reading the prompt
    // he tapped receiver A on the field, which is the obvious thing to do).
    // With nobody chosen the field is the page's to scroll, so the choosing
    // waits for the click a finished tap becomes. A tap on the grass with
    // nobody chosen repeats the prompt.
    ui.canvas.addEventListener('click', (event) => {
        if (!st || st.readOnly || st.selected) return;
        const pos = playerAt(event);
        if (pos) selectPlayer(pos, { fromField: true });
        else status(CHOOSE_PROMPT);
    });
    // The same words, standing between the row and the field whenever nobody
    // is chosen (Steve, 2026-11-02: a message at the bottom of the screen is
    // not where the finger is).
    ui.prompt = h('p', { id: 'designer-prompt', class: 'designer-prompt', text: CHOOSE_PROMPT });

    // The men. A radio group of real buttons, in their own ink.
    ui.players = {};
    const row = h('div', { class: 'designer-players', role: 'radiogroup', 'aria-label': 'Player to draw a route for' });
    const ink = designInk();
    for (const pos of PATH_PLAYERS) {
        const label = pos === 'qb' ? 'QB' : CFG.receivers[pos].letter;
        const b = button(label, 'designer-player', () => selectPlayer(pos), { role: 'radio', 'aria-checked': 'false', 'aria-label': labelOf(pos), 'data-pos': pos });
        b.style.setProperty('--player-ink', ink.players[pos]);
        ui.players[pos] = b;
        row.appendChild(b);
    }

    // The tools.
    ui.undo = button('Undo', 'playbook-restart-btn', onUndo);
    ui.clear = button('Clear', 'playbook-restart-btn', onClear);
    ui.remove = button('Remove from playbook', 'playbook-restart-btn designer-remove', onRemove);
    ui.purge = button('Delete for good', 'playbook-restart-btn is-confirm', onPurge);
    ui.purge.hidden = true;
    const tools = h('div', { class: 'designer-tools' }, [ui.undo, ui.clear, ui.remove, ui.purge]);

    ui.hint = h('p', { id: 'designer-hint', class: 'designer-hint card-meta', text: '' });
    ui.status = h('p', { id: 'designer-status', class: 'designer-status', role: 'status', 'aria-live': 'polite' });

    // The question row, for the things that should be asked twice.
    ui.question = h('span', { class: 'designer-question-text' });
    ui.yes = button('Yes', 'playbook-restart-btn is-confirm', () => answer(true));
    ui.no = button('No, keep it', 'playbook-restart-btn', () => answer(false));
    ui.confirm = h('div', { class: 'designer-question', role: 'group' }, [ui.question, ui.yes, ui.no]);
    ui.confirm.hidden = true;

    ui.back = button('Back to the playbook', 'hud-btn', onBack, { 'aria-keyshortcuts': 'Escape' });
    // WITH ONE OF THE VISITOR'S OWN PLAYS OPEN, SAVING SAVES IT (QA,
    // 2026-11-02): "Save changes" keeps the name and the lines as they now
    // are, renamed or not, and "Save as new play" is the explicit way to a
    // copy. The earlier rule, a new name is a new play, made renaming a
    // play all but impossible by accident.
    ui.saveNew = button('Save as new play', 'hud-btn', () => onSave(true));
    ui.saveNew.hidden = true;
    ui.save = button('Save play', 'hud-btn hud-btn-primary', () => onSave(false));
    const actions = h('div', { class: 'card-actions designer-actions' }, [ui.back, ui.saveNew, ui.save]);

    // THE MEN ABOVE THE FIELD (QA, 2026-11-02): choose, then draw, reads top
    // to bottom, the row is on screen whenever the field is, and nobody has to
    // scroll past a canvas that eats touches to reach the next man.
    for (const node of [top, row, ui.prompt, ui.canvas, tools, ui.hint, ui.status, ui.confirm, actions]) body.appendChild(node);

    // A CLOSE BUTTON IN THE TOP RIGHT, so nobody scrolls to the bottom of a
    // tall screen to find the way out (Steve, 2026-11-02). It is the Back
    // button by another shape: the same question when lines are unsaved.
    const panel = el('designer-panel');
    if (panel) {
        ui.close = button('\u2715', 'designer-close', onBack, { 'aria-label': 'Back to the playbook', title: 'Back to the playbook' });
        panel.insertBefore(ui.close, panel.children[0] || null);
    }
    return ui;
}

// ---- The session --------------------------------------------------------------

/** The formation list: three starting formations, the plays in the book (the
 *  visitor's own first), and the plays taken out of it. */
function fillFormations(selectedValue) {
    const s = ui.formation;
    s.textContent = '';
    const group = (label) => { const g = document.createElement('optgroup'); g.label = label; s.appendChild(g); return g; };
    const opt = (g, value, text) => { const o = document.createElement('option'); o.value = value; o.textContent = text; g.appendChild(o); return o; };
    const templates = group('Start from a formation');
    for (const t of FORMATION_TEMPLATES) opt(templates, `tpl:${t.id}`, `${t.name} (as in ${t.from})`);
    const book = group('Start from a play in the book');
    for (const r of listPlays()) opt(book, `mine:${r.id}`, r.name);
    for (const p of PLAYS) if (!isHidden(p.slug)) opt(book, `book:${p.slug}`, p.name);
    const gone = [...listPlays({ hidden: true }).filter((r) => r.hidden).map((r) => [`gone:${r.id}`, r.name]),
        ...PLAYS.filter((p) => isHidden(p.slug)).map((p) => [`gone:${p.slug}`, p.name])];
    if (gone.length) {
        const g = group('Removed plays');
        for (const [value, text] of gone) opt(g, value, text);
    }
    s.value = selectedValue;
}

/** What a formation value means: where it starts, and whose it is. */
function parseChoice(value) {
    const [kind, key] = String(value || '').split(':');
    if (kind === 'tpl') {
        const t = FORMATION_TEMPLATES.find((x) => x.id === key) || FORMATION_TEMPLATES[0];
        return { kind, key: t.id, base: t.base, name: t.name, record: null };
    }
    if (kind === 'mine' || (kind === 'gone' && isCustomId(key))) {
        const record = getPlay(key);
        if (record) return { kind, key, base: record.base, name: record.name, record };
    }
    if (kind === 'book' || kind === 'gone') {
        const play = PLAYS.find((p) => p.slug === key);
        if (play) return { kind, key, base: play.slug, name: play.name, record: null };
    }
    const t = FORMATION_TEMPLATES[0];
    return { kind: 'tpl', key: t.id, base: t.base, name: t.name, record: null };
}

/** How many plays the book shows right now: the rule that it never shows
 *  none is enforced where the Remove button is. */
function visibleCount() {
    return PLAYS.filter((p) => !isHidden(p.slug)).length + listPlays().length;
}

/** Put the screen in the state of a formation choice. */
function applyChoice(value) {
    const c = parseChoice(value);
    st.choice = c;
    st.routes = c.record ? copyRoutes(c.record.routes) : {};
    st.spots = formationSpots(c.base);
    st.undo = [];
    st.stroke = null;
    st.keys = null;
    suggestName(c);
    st.readOnly = c.kind === 'gone';
    // Nobody to draw for on a removed play, or a man this formation benches.
    if (st.readOnly || (st.selected && !st.spots[st.selected])) st.selected = '';
    fillFormations(value);
    refreshTools();
    paint();
}

/**
 * THE NAME FOLLOWS THE CHOICE (QA, 2026-11-02: it was set once, on the first
 * of the visitor's own plays chosen, and then sat there through every later
 * formation and a delete). One of the visitor's own plays brings its name,
 * so Save changes keeps it; anything else, a starting formation, a book play
 * or a removed one, brings the next free "My play N". A name the visitor
 * typed themselves is kept until they choose one of their own plays.
 */
function suggestName(c) {
    if (c.kind === 'mine' && c.record) {
        ui.name.value = c.record.name;
        st.nameIsOurs = true;
        return;
    }
    if (st.nameIsOurs === false) return;
    ui.name.value = nextName();
    st.nameIsOurs = true;
}

function copyRoutes(routes) {
    const out = {};
    for (const [k, v] of Object.entries(routes || {})) out[k] = v.map((p) => [p[0], p[1]]);
    return out;
}

/** The remove button says what it would do to the chosen play. */
function refreshTools() {
    const c = st.choice;
    ui.remove.hidden = c.kind === 'tpl';
    ui.purge.hidden = !(c.kind === 'gone' && isCustomId(c.key));
    if (c.kind === 'book') ui.remove.textContent = 'Remove from playbook';
    else if (c.kind === 'mine') ui.remove.textContent = 'Delete my play';
    else if (c.kind === 'gone') ui.remove.textContent = 'Restore to playbook';
    ui.undo.disabled = st.undo.length === 0 || st.readOnly;
    ui.clear.disabled = Object.keys(st.routes).length === 0 || st.readOnly;
    ui.save.disabled = st.readOnly;
    ui.save.textContent = c.kind === 'mine' ? 'Save changes' : 'Save play';
    ui.saveNew.hidden = c.kind !== 'mine';
    const drawn = Object.keys(st.routes).length;
    ui.hint.textContent = st.readOnly
        ? 'This play is out of the playbook. Restore it to call it again, or start from another formation.'
        : !st.selected
            ? `Choose a player above the field, then draw their route from where they stand.${drawn === 0 ? ' Draw at least one route to save.' : ''}`
            : `Draw ${labelOf(st.selected)}'s route from where they stand. Where the line ends is where they stop.${st.routes[st.selected] ? ' Drawing again replaces the line.' : ''}`;
    // The field takes touches as lines only while somebody is chosen; the
    // rest of the time a finger on it scrolls the page, and the prompt above
    // it says whom to choose.
    ui.canvas.classList.toggle('is-armed', !!st.selected && !st.readOnly);
    ui.prompt.hidden = !!st.selected || st.readOnly;
    for (const pos of PATH_PLAYERS) {
        const b = ui.players[pos];
        b.setAttribute('aria-checked', pos === st.selected ? 'true' : 'false');
        b.classList.toggle('is-selected', pos === st.selected);
        b.classList.toggle('has-route', !!st.routes[pos]);
        b.hidden = !st.spots[pos];
        const name = labelOf(pos);
        b.setAttribute('aria-label', st.routes[pos] ? `${name}, route drawn` : name);
    }
    const words = describePlay(st.routes, st.spots);
    ui.canvas.setAttribute('aria-label', words ? `The field. ${words}.` : 'The field. Nothing drawn yet.');
}

/**
 * CHOOSE A MAN, OR CHOOSE HIM AGAIN TO CHOOSE NOBODY. Nobody is chosen when
 * the screen opens (QA on a phone, 2026-11-02: with A chosen by default, the
 * first touch meant to scroll the page drew him a route instead). While
 * somebody is chosen the canvas takes every touch as a line; with nobody
 * chosen it scrolls like the rest of the page (`is-armed`), so pressing the
 * chosen man again is also the way to get the page scrolling back.
 */
function selectPlayer(pos, { fromField = false } = {}) {
    if (!st || !st.spots[pos]) return;
    st.selected = fromField ? pos : (st.selected === pos ? '' : pos);
    st.keys = null;
    refreshTools();
    paint();
    if (fromField) {
        // Chosen on the field: the field keeps the finger, and the words say
        // what happened and what comes next.
        status(`${labelOf(pos)} chosen. Draw their route from where they stand.`);
        return;
    }
    ui.players[pos].focus();
}

/** Which man, if any, a pointer event is on: the nearest disc within a
 *  thumb's reach of it, in the field's own pixels. */
function playerAt(event) {
    if (!st || !st.layout) return '';
    const canvas = ui.canvas;
    const rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
    const x = (event.clientX - rect.left) * st.scale[0];
    const y = (event.clientY - rect.top) * st.scale[1];
    const reach = 14 * Math.max(0.6, Math.min(canvas.width, canvas.height) / 150);
    let best = '';
    let nearest = reach;
    for (const pos of PATH_PLAYERS) {
        if (!st.spots[pos]) continue;
        const c = st.layout.toCanvas(st.spots[pos]);
        const d = Math.hypot(c[0] - x, c[1] - y);
        if (d <= nearest) { nearest = d; best = pos; }
    }
    return best;
}

/** Say something on the screen's own status line, and to the live region. */
function status(text) {
    if (ui.status.textContent === text) ui.status.textContent = '';
    ui.status.textContent = text;
}

// ---- Painting ---------------------------------------------------------------------

/** Size the canvas to the pixels it is shown at, and choose the orientation:
 *  a field taller than it is wide runs up the screen. */
function fit() {
    const canvas = ui.canvas;
    const rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { width: canvas.width, height: canvas.height };
    const dpr = (typeof devicePixelRatio === 'number' && devicePixelRatio > 0) ? Math.min(devicePixelRatio, 3) : 1;
    const w = Math.max(1, Math.round((rect.width || canvas.width) * dpr));
    const hgt = Math.max(1, Math.round((rect.height || canvas.height) * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== hgt) canvas.height = hgt;
    st.rotate = hgt > w;
    st.scale = [w / (rect.width || w), hgt / (rect.height || hgt)];
}

function paint() {
    if (!st) return;
    const canvas = ui.canvas;
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return;
    const extra = st.stroke ? [st.spots[st.selected], ...st.stroke.samples]
        : st.keys ? st.keys.pts : null;
    st.layout = drawDesign(ctx, canvas.width, canvas.height, {
        spots: st.spots, routes: st.routes, ink: designInk(), selected: st.selected,
        rotate: st.rotate, extra,
    });
    if (st.keys && st.layout) {
        // The keyboard's crosshair.
        const c = st.layout.toCanvas(st.keys.cursor);
        const u = Math.max(0.6, Math.min(canvas.width, canvas.height) / 150);
        ctx.save();
        ctx.strokeStyle = designInk().players[st.selected];
        ctx.lineWidth = 1.5 * u;
        ctx.beginPath();
        ctx.moveTo(c[0] - 8 * u, c[1]); ctx.lineTo(c[0] + 8 * u, c[1]);
        ctx.moveTo(c[0], c[1] - 8 * u); ctx.lineTo(c[0], c[1] + 8 * u);
        ctx.stroke();
        ctx.restore();
    }
}

// ---- Drawing with a pointer ----------------------------------------------------------

/** Where a pointer event is on the field, in normalized units. */
function fieldPoint(event) {
    const canvas = ui.canvas;
    const rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
    const x = (event.clientX - rect.left) * st.scale[0];
    const y = (event.clientY - rect.top) * st.scale[1];
    return st.layout.fromCanvas(x, y);
}

function onPointerDown(event) {
    if (!st || st.readOnly) return;
    if (event.button !== undefined && event.button !== 0) return;
    // One finger draws. A second one while the first is down is ignored.
    if (st.stroke) return;
    // Nobody chosen: this touch is the page's, to scroll with. The click that
    // a finished tap becomes says what to do.
    if (!st.selected || !st.spots[st.selected]) return;
    if (event.preventDefault) event.preventDefault();
    fit();
    paint();
    st.keys = null;
    // A drag that begins on another man's disc is his: switch to him and
    // draw his route. A mere tap on a disc is a choice and nothing more.
    const onDisc = playerAt(event);
    if (onDisc && onDisc !== st.selected) selectPlayer(onDisc, { fromField: true });
    st.stroke = { id: event.pointerId, samples: [], ema: {}, onDisc: !!onDisc };
    if (ui.canvas.setPointerCapture && event.pointerId !== undefined) {
        try { ui.canvas.setPointerCapture(event.pointerId); } catch (e) { /* a synthetic event */ }
    }
    addSample(fieldPoint(event));
}

function addSample(point) {
    const kept = smoothSample(st.stroke.ema, point, STROKE);
    if (kept) {
        st.stroke.samples.push(kept);
        paint();
    }
}

function onPointerMove(event) {
    if (!st || !st.stroke || (event.pointerId !== undefined && event.pointerId !== st.stroke.id)) return;
    if (event.preventDefault) event.preventDefault();
    addSample(fieldPoint(event));
}

function onPointerUp(event) {
    if (!st || !st.stroke || (event.pointerId !== undefined && event.pointerId !== st.stroke.id)) return;
    const stroke = st.stroke;
    st.stroke = null;
    if (ui.canvas.releasePointerCapture && event.pointerId !== undefined) {
        try { ui.canvas.releasePointerCapture(event.pointerId); } catch (e) { /* not captured */ }
    }
    const line = strokeToLine(stroke.samples, st.spots[st.selected], STROKE);
    if (!line) {
        if (!stroke.onDisc) status('That was too short to be a route. Draw a longer line from the player.');
        paint();
        return;
    }
    setRoute(st.selected, line);
}

/** Keep a line for a man, remembering what it replaced. */
function setRoute(pos, line) {
    st.undo.push(copyRoutes(st.routes));
    st.routes[pos] = line;
    refreshTools();
    paint();
    status(`Route drawn for ${labelOf(pos)}.`);
}

// ---- Drawing with the keyboard ---------------------------------------------------------

/** One step of the crosshair, the same distance along and across: a tenth of
 *  a line interval, a whole one with Shift. */
const STEP_ALONG = 0.02;
const STEP_ACROSS = 0.02 / 0.6;

function onCanvasKey(event) {
    if (!st || st.readOnly) return;
    const key = event.key;
    const arrows = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (!arrows.includes(key) && key !== ' ' && key !== 'Enter' && key !== 'Backspace' && key !== 'Escape') return;
    if (!st.selected || !st.spots[st.selected]) {
        if (arrows.includes(key)) status('Choose a player first.');
        return;
    }
    if (key === 'Escape') {
        if (!st.keys) return;
        event.preventDefault();
        event.stopPropagation();
        st.keys = null;
        paint();
        status('Route cancelled.');
        return;
    }
    event.preventDefault();
    if (!st.keys) {
        const spot = st.spots[st.selected];
        st.keys = { pts: [[spot[0], spot[1]]], cursor: [spot[0], spot[1]] };
    }
    const k = st.keys;
    if (arrows.includes(key)) {
        const mult = event.shiftKey ? 10 : 1;
        // On a field running up the screen, up is downfield. Left to right, right is.
        let dAlong = 0;
        let dAcross = 0;
        if (st.rotate) {
            if (key === 'ArrowUp') dAlong = 1; else if (key === 'ArrowDown') dAlong = -1;
            else if (key === 'ArrowRight') dAcross = 1; else dAcross = -1;
        } else {
            if (key === 'ArrowRight') dAlong = 1; else if (key === 'ArrowLeft') dAlong = -1;
            else if (key === 'ArrowDown') dAcross = 1; else dAcross = -1;
        }
        k.cursor = [
            Math.max(0, Math.min(1, k.cursor[0] + dAlong * STEP_ALONG * mult)),
            Math.max(0, Math.min(1, k.cursor[1] + dAcross * STEP_ACROSS * mult)),
        ];
        paint();
        status(`${Math.round((k.cursor[0] - k.pts[0][0]) / 0.2 * 7)} meters downfield, ${Math.round(Math.abs(k.cursor[1] - k.pts[0][1]) * 21)} meters ${k.cursor[1] < k.pts[0][1] ? 'left' : 'right'}.`);
        return;
    }
    if (key === ' ') {
        k.pts.push([k.cursor[0], k.cursor[1]]);
        paint();
        status(`Point ${k.pts.length - 1} placed.`);
        return;
    }
    if (key === 'Backspace') {
        if (k.pts.length > 1) k.pts.pop();
        paint();
        status(k.pts.length > 1 ? 'Last point removed.' : 'Back at the start.');
        return;
    }
    // Enter.
    const line = strokeToLine(k.pts.slice(1), st.spots[st.selected], STROKE);
    st.keys = null;
    if (!line) {
        status('That was too short to be a route. Place a point farther away first.');
        paint();
        return;
    }
    setRoute(st.selected, line);
}

// ---- Undo, Clear, Remove ---------------------------------------------------------------

function onUndo() {
    if (!st || st.undo.length === 0) return;
    st.routes = st.undo.pop();
    st.keys = null;
    refreshTools();
    paint();
    status('Undone.');
}

function onClear() {
    if (!st || Object.keys(st.routes).length === 0) return;
    st.undo.push(copyRoutes(st.routes));
    st.routes = {};
    st.keys = null;
    refreshTools();
    paint();
    status('Cleared. The formation is back to its starting positions.');
}

function onRemove() {
    if (!st) return;
    const c = st.choice;
    if (c.kind === 'book' || c.kind === 'mine') {
        if (visibleCount() <= 1) {
            status('The playbook needs at least one play. Design another before removing this one.');
            return;
        }
        const verb = c.kind === 'book' ? 'Remove' : 'Delete';
        ask(`${verb} ${c.name} from the playbook?`, `Yes, ${verb.toLowerCase()} it`, ui.remove, () => {
            hidePlay(c.key);
            hooks.report('design', { kind: c.kind === 'book' ? 'remove' : 'delete', outcome: { play: c.kind === 'book' ? c.key : 'custom' } });
            applyChoice(`gone:${c.key}`);
            status(`${c.name} is out of the playbook. It is in the Removed plays list if you want it back.`);
        });
        return;
    }
    if (c.kind === 'gone') {
        restorePlay(c.key);
        hooks.report('design', { kind: 'restore', outcome: { play: isCustomId(c.key) ? 'custom' : c.key } });
        applyChoice(`${isCustomId(c.key) ? 'mine' : 'book'}:${c.key}`);
        status(`${c.name} is back in the playbook.`);
    }
}

function onPurge() {
    if (!st || st.choice.kind !== 'gone' || !isCustomId(st.choice.key)) return;
    const c = st.choice;
    ask(`Delete ${c.name} for good?`, 'Yes, delete it', ui.purge, () => {
        removePlay(c.key);
        hooks.report('design', { kind: 'purge' });
        applyChoice(`tpl:${FORMATION_TEMPLATES[0].id}`);
        status(`${c.name} is gone.`);
    });
}

// ---- Asking twice ---------------------------------------------------------------------------

function ask(question, yesLabel, from, onYes) {
    st.asking = { onYes, from };
    ui.question.textContent = question;
    ui.yes.textContent = yesLabel;
    ui.confirm.hidden = false;
    ui.yes.focus();
}

function answer(yes) {
    if (!st || !st.asking) return;
    const { onYes, from } = st.asking;
    st.asking = null;
    ui.confirm.hidden = true;
    if (yes) onYes();
    else if (from && from.focus) from.focus();
}

// ---- The formation, Save and the way out ---------------------------------------------------

/**
 * A NEW FORMATION IS A NEW START, and it is not asked about (Steve, QA
 * 2026-11-02: the question was "unnecessary and clunky"). Lines not yet
 * saved go with the old formation; the Back button still asks before the
 * screen closes on unsaved lines, which is the one place losing them is a
 * surprise.
 */
function onFormation(value) {
    if (!st) return;
    const current = `${st.choice.kind}:${st.choice.key}`;
    if (value === current) return;
    applyChoice(value);
    status(`${st.choice.name} formation. Nothing drawn yet.`);
}

function onSave(asNew = false) {
    if (!st || st.readOnly) return;
    const name = String(ui.name.value || '').trim();
    if (!name) {
        status('Give the play a name first.');
        ui.name.focus();
        return;
    }
    if (Object.keys(st.routes).length === 0) {
        status('Draw at least one route to save.');
        ui.canvas.focus();
        return;
    }
    const c = st.choice;
    const updating = c.kind === 'mine' && c.record && !asNew;
    const record = updating
        ? replacePlay(c.key, { name, base: c.base, routes: st.routes })
        : addPlay({ name, base: c.base, routes: st.routes });
    if (!record) {
        status('The browser is holding as many plays as it can. Delete one for good to make room.');
        return;
    }
    hooks.report('design', { kind: updating ? 'update' : 'save', outcome: { base: c.base } });
    finish(record);
}

function onBack() {
    if (!st) return;
    const changed = JSON.stringify(st.routes) !== st.startedWith;
    if (changed && !st.readOnly) {
        ask('Leave without saving? Your lines will be lost.', 'Yes, leave', ui.back, () => finish(null));
        return;
    }
    finish(null);
}

/** Close, go back to the book, and then say what was saved. */
function finish(record) {
    const { back } = st;
    closeDesigner();
    if (back) back();
    if (record) hooks.onSaved(record);
}

// ---- Public surface ----------------------------------------------------------------------------

/**
 * OPEN THE SCREEN over the field, with `back` to call when it closes. `play`
 * is a formation value to start on (`book:pass4`, `mine:custom-…`), else the
 * first starting formation.
 */
export function showDesigner(back, { play = '' } = {}) {
    const card = el('designer');
    if (!card || !ui) { if (back) back(); return; }
    st = {
        back, choice: {}, routes: {}, spots: {}, selected: '', undo: [], stroke: null, keys: null,
        readOnly: false, rotate: false, scale: [1, 1], layout: null, asking: null, startedWith: '{}',
        // Nobody chosen until the visitor chooses: see `selectPlayer`.
    };
    st.nameIsOurs = true;
    ui.confirm.hidden = true;
    ui.status.textContent = '';
    card.hidden = false;
    fit();
    applyChoice(play || `tpl:${FORMATION_TEMPLATES[0].id}`);
    st.startedWith = JSON.stringify(st.routes);
    st.onEscape = (event) => {
        if (event.key !== 'Escape' || card.hidden || event.defaultPrevented) return;
        event.preventDefault();
        if (st.asking) { answer(false); return; }
        onBack();
    };
    st.onResize = () => { if (st) { fit(); paint(); } };
    document.addEventListener('keydown', st.onEscape);
    if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('resize', st.onResize);
    hooks.report('design', { kind: 'open' });
    const panel = el('designer-panel');
    if (panel) panel.focus();
}

export function closeDesigner() {
    const card = el('designer');
    if (!st || !card) return;
    const { onEscape, onResize } = st;
    st = null;
    card.hidden = true;
    if (onEscape) document.removeEventListener('keydown', onEscape);
    if (onResize && typeof window !== 'undefined' && window.removeEventListener) window.removeEventListener('resize', onResize);
}

export function designerOpen() {
    return !!st;
}

/** What the screen holds right now, for the suite. */
export function designerState() {
    if (!st) return null;
    return { base: st.choice.base, kind: st.choice.kind, key: st.choice.key, routes: copyRoutes(st.routes), selected: st.selected, readOnly: st.readOnly, rotate: st.rotate };
}
