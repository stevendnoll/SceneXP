// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * xo-design-ui.test.mjs
 *
 * THE DESIGN A PLAY SCREEN AND THE STORE BEHIND IT (specs/custom-plays-PRD,
 * Phase 2), driven through their own controls under the headless DOM.
 *
 * What is worth pinning: a drag on the field becomes a route anchored to the
 * chosen man and simplified to a handful of points; the arrow keys draw the
 * same route without a pointer; Undo and Clear mean what they say; Save keeps
 * a record the store reads back whole and hands the book the new play; the
 * formation list says what is in the book and what is out of it; and the
 * book keeps at least one play whatever is removed. The store is a string a
 * visitor could edit by hand, so junk in it is dropped rather than shown.
 */
import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { installThree } from './helpers/three-stub.mjs';
import { installDom, fire } from './helpers/dom-stub.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const scene = join(here, '..', 'www', 'xo', 'js');
const KEY = 'exes-n-ohs-plays';

let dom;
let UI;
/** The store the designer uses (the page's min build, one instance), and the
 *  source, read directly by the store's own cases. */
let S;
let SRC;
let D;
let A;
let PLAYS;
let reports;
let spoken;
let saved;

beforeEach(async () => {
    jest.resetModules();
    jest.useFakeTimers();
    installThree();
    dom = installDom();
    globalThis.localStorage = {
        store: new Map(),
        getItem(k) { return this.store.has(k) ? this.store.get(k) : null; },
        setItem(k, v) { this.store.set(k, String(v)); },
        removeItem(k) { this.store.delete(k); },
    };
    SRC = await import(join(scene, 'plays-store.js'));
    S = await import(join(scene, 'plays-store.min.js'));
    D = await import(join(scene, 'design.min.js'));
    A = await import(join(scene, 'playas.min.js'));
    UI = await import(join(scene, 'design-ui.js'));
    ({ PLAYS } = await import(join(scene, 'playbook-ui.min.js')));
    reports = [];
    spoken = [];
    saved = [];
    UI.initDesigner({
        report: (action, detail) => reports.push([action, detail]),
        announce: (text) => spoken.push(text),
        onSaved: (record) => saved.push(record),
    });
});

afterEach(() => {
    dom.uninstall();
    jest.useRealTimers();
    delete globalThis.localStorage;
});

/** Every descendant of a node, the stub having no querySelectorAll. */
function deep(node) {
    if (!node || !node.children) return [node];
    return [node, ...node.children.flatMap(deep)];
}
const el = (id) => dom.el(id);
const body = () => el('designer-body');
const byText = (text) => deep(body()).find((n) => n && n.type === 'button' && (n.textContent || '').trim() === text);
const parts = () => {
    const b = body();
    return {
        name: b.children[0].children[0].children[1],
        formation: b.children[0].children[1].children[1],
        // The men sit above the field (QA, 2026-11-02).
        players: b.children[1].children,
        prompt: b.children[2],
        canvas: b.children[3],
        tools: b.children[4].children,
        hint: b.children[5],
        status: b.children[6],
        confirm: b.children[7],
        actions: b.children[8].children,
    };
};
const player = (pos) => [...parts().players].find((b) => b.dataset.pos === pos);

/** The screen's own field geometry: the stub's canvas is 800 by 600, so the
 *  layout is the landscape one with its margin. */
function toClient(point) {
    const L = D.layoutFor(800, 600, false);
    const c = L.toCanvas(point);
    return { clientX: c[0], clientY: c[1] };
}

/** Drag a finger through the points given, with a few samples per leg. */
function drag(points, pointerId = 7) {
    const canvas = parts().canvas;
    fire(canvas, 'pointerdown', { ...toClient(points[0]), pointerId, button: 0 });
    for (let i = 1; i < points.length; i += 1) {
        const a = points[i - 1];
        const b = points[i];
        for (let k = 1; k <= 30; k += 1) {
            const t = k / 30;
            fire(canvas, 'pointermove', { ...toClient([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]), pointerId });
        }
    }
    fire(canvas, 'pointerup', { ...toClient(points[points.length - 1]), pointerId });
}

const key = (k, extra = {}) => fire(parts().canvas, 'keydown', { key: k, ...extra });

// ---- The store ---------------------------------------------------------------

describe('the plays store', () => {
    test('a play is kept, read back whole, and the key goes when nothing is left', () => {
        expect(SRC.listPlays()).toEqual([]);
        const r = SRC.addPlay({ name: '  Four Verts B post  ', base: 'pass4', routes: { wr2: [[0.2, 0.37], [0.5, 0.37], [0.8, 0.5]], db1: [[0, 0]] } }, 1762100000000);
        expect(r.id).toBe(D.newPlayId(1762100000000));
        expect(r.name).toBe('Four Verts B post');
        expect(Object.keys(r.routes)).toEqual(['wr2']);
        expect(r.created).toBe('2025-11-02T16:13:20.000Z');
        const stored = JSON.parse(localStorage.getItem(KEY));
        expect(stored.v).toBe(1);
        expect(stored.plays[0].id).toBe(r.id);
        // What is handed out is a copy: changing it changes nothing kept.
        SRC.getPlay(r.id).routes.wr2.push([1, 1]);
        expect(SRC.getPlay(r.id).routes.wr2).toHaveLength(3);
        expect(SRC.removePlay(r.id)).toBe(true);
        expect(localStorage.getItem(KEY)).toBeNull();
        expect(SRC.removePlay(r.id)).toBe(false);
    });

    test('names are given, kept unique, and capped', () => {
        expect(SRC.nextName()).toBe('My play 1');
        const a = SRC.addPlay({ name: '', base: 'pass4', routes: { wr1: [[0.2, 0.1], [0.6, 0.1]] } }, 1);
        expect(a.name).toBe('My play 1');
        expect(SRC.nextName()).toBe('My play 2');
        const b = SRC.addPlay({ name: 'My play 1', base: 'pass4', routes: { wr1: [[0.2, 0.1], [0.6, 0.1]] } }, 2);
        expect(b.name).toBe('My play 1 2');
        const long = 'n'.repeat(D.MAX_NAME + 4);
        const c = SRC.addPlay({ name: long, base: 'pass4', routes: { wr1: [[0.2, 0.1], [0.6, 0.1]] } }, 3);
        expect(c.name).toBe('n'.repeat(D.MAX_NAME));
        const d = SRC.addPlay({ name: long, base: 'pass4', routes: { wr1: [[0.2, 0.1], [0.6, 0.1]] } }, 4);
        expect(d.name).toHaveLength(D.MAX_NAME);
        expect(d.name.endsWith(' 2')).toBe(true);
        // Newest first.
        expect(SRC.listPlays().map((p) => p.id)).toEqual([d.id, c.id, b.id, a.id]);
        // Replacing keeps its own name without a suffix.
        const again = SRC.replacePlay(a.id, { name: 'My play 1', routes: { wr2: [[0.2, 0.3], [0.6, 0.3]] } });
        expect(again.name).toBe('My play 1');
        expect(Object.keys(again.routes)).toEqual(['wr2']);
        expect(SRC.replacePlay('custom-nope', { name: 'x' })).toBeNull();
    });

    test('hidden plays, the book’s and the visitor’s own, and the way back', () => {
        const a = SRC.addPlay({ name: 'Mine', base: 'pass4', routes: { wr1: [[0.2, 0.1], [0.6, 0.1]] } }, 1);
        expect(SRC.hidePlay('pass7')).toBe(true);
        expect(SRC.hidePlay('pass7')).toBe(false);
        expect(SRC.hidePlay('nope')).toBe(false);
        expect(SRC.hidePlay(a.id)).toBe(true);
        expect(SRC.isHidden('pass7')).toBe(true);
        expect(SRC.isHidden(a.id)).toBe(true);
        expect(SRC.isHidden('pass2')).toBe(false);
        expect(SRC.hiddenSlugs()).toEqual(['pass7']);
        expect(SRC.hiddenCount()).toBe(2);
        expect(SRC.listPlays()).toEqual([]);
        expect(SRC.listPlays({ hidden: true })).toHaveLength(1);
        expect(SRC.restorePlay('pass7')).toBe(true);
        expect(SRC.restorePlay('pass7')).toBe(false);
        expect(SRC.restorePlay(a.id)).toBe(true);
        expect(SRC.hiddenCount()).toBe(0);
        expect(SRC.listPlays()).toHaveLength(1);
    });

    test('what is read is made safe: junk is dropped, a stale base falls back, and the oldest hidden plays make room', () => {
        localStorage.setItem(KEY, JSON.stringify({
            v: 1,
            plays: [
                { id: 'custom-a', name: 'Good', base: 'pass2', routes: { wr1: [[0.1, 0.1], [0.5, 0.1]] } },
                { id: 'custom-a', name: 'Twice', base: 'pass2' },
                { id: 'pass4', name: 'Not an id', base: 'pass2' },
                { id: 'custom-b', name: '', base: 'pass2' },
                { id: 'custom-c', name: 'Stale base', base: 'gone', routes: { qb: [[0.1, 0.5], [0.05, 0.5]] } },
                'junk', null, 4,
            ],
            hidden: ['pass7', 'pass7', 'nope', 5],
        }));
        SRC.resetPlaysStore();
        const plays = SRC.listPlays();
        expect(plays.map((p) => p.id)).toEqual(['custom-a', 'custom-c']);
        expect(plays[1].base).toBe('pass4');
        expect(SRC.hiddenSlugs()).toEqual(['pass7']);
        // A value that is not JSON at all is an empty store, not a crash.
        localStorage.setItem(KEY, '{not json');
        SRC.resetPlaysStore();
        expect(SRC.listPlays()).toEqual([]);
        // The cap: hidden plays go, oldest first, and then it is a no.
        SRC.resetPlaysStore();
        localStorage.removeItem(KEY);
        const ids = [];
        for (let i = 0; i < D.MAX_PLAYS; i += 1) {
            ids.push(SRC.addPlay({ name: `P${i}`, base: 'pass4', routes: { wr1: [[0.2, 0.1], [0.6, 0.1]] } }, 1000 + i).id);
        }
        expect(SRC.addPlay({ name: 'One more', base: 'pass4', routes: { wr1: [[0.2, 0.1], [0.6, 0.1]] } }, 5000)).toBeNull();
        SRC.hidePlay(ids[0]);
        SRC.hidePlay(ids[5]);
        const more = SRC.addPlay({ name: 'One more', base: 'pass4', routes: { wr1: [[0.2, 0.1], [0.6, 0.1]] } }, 5000);
        expect(more).not.toBeNull();
        // The OLDEST hidden one went (the first added sits last in the list).
        expect(SRC.getPlay(ids[0])).toBeNull();
        expect(SRC.getPlay(ids[5])).not.toBeNull();
        expect(SRC.listPlays({ hidden: true })).toHaveLength(D.MAX_PLAYS);
    });
});

// ---- The screen ----------------------------------------------------------------

describe('opening the designer', () => {
    test('opens on the first starting formation, with the men where it stands them, and the panel focused', () => {
        const back = jest.fn();
        UI.showDesigner(back);
        expect(el('designer').hidden).toBe(false);
        expect(el('designer-panel').focused).toBe(true);
        const p = parts();
        expect(p.name.value).toBe('My play 1');
        expect(p.formation.value).toBe('tpl:spread');
        const state = UI.designerState();
        expect(state.base).toBe('pass4');
        // NOBODY CHOSEN, so a first touch on the field scrolls the page rather
        // than drawing (QA on a phone, 2026-11-02), and the hint says what to do.
        expect(state.selected).toBe('');
        expect(state.routes).toEqual({});
        expect(p.canvas.classList.contains('is-armed')).toBe(false);
        expect(p.hint.textContent).toMatch(/^Choose a player above the field/);
        // ...and the prompt between the row and the field says whom.
        expect(p.prompt.hidden).toBe(false);
        expect(p.prompt.textContent).toBe('Please choose a player (A, B, C, D, or QB).');
        expect(body().children.indexOf(p.prompt)).toBe(body().children.indexOf(p.canvas) - 1);
        // Five men above the field, none chosen, each named for a screen reader.
        expect([...p.players].map((b) => b.dataset.pos)).toEqual(['wr1', 'wr2', 'wr3', 'wr4', 'qb']);
        for (const pos of ['wr1', 'wr2', 'wr3', 'wr4', 'qb']) expect(player(pos).getAttribute('aria-checked')).toBe('false');
        expect(body().children.indexOf(p.players[0].parentElement)).toBeLessThan(body().children.indexOf(p.canvas));
        expect(player('qb').getAttribute('aria-label')).toBe('Quarterback');
        // The field is an image that says what is on it.
        expect(p.canvas.getAttribute('role')).toBe('img');
        expect(p.canvas.getAttribute('aria-label')).toBe('The field. A, B, C and D blocking.');
        expect(reports).toEqual([['design', { kind: 'open' }]]);
        // The three formations, the book, and no removed group yet.
        const groups = p.formation.children.map((g) => g.label);
        expect(groups).toEqual(['Start from a formation', 'Start from a play in the book']);
        expect(p.formation.children[0].children.map((o) => o.value)).toEqual(['tpl:spread', 'tpl:bunch', 'tpl:screen']);
        expect(p.formation.children[1].children.length).toBe(17);
        // Back closes it and hands the book back.
        byText('Back to the playbook').click();
        expect(el('designer').hidden).toBe(true);
        expect(back).toHaveBeenCalledTimes(1);
        expect(UI.designerOpen()).toBe(false);
    });

    test('a formation benches nobody it does not stand: a heavy set hides the receivers it leaves out', () => {
        UI.showDesigner(() => {});
        const p = parts();
        p.formation.value = 'book:jumbo1';
        fire(p.formation, 'change');
        const spots = A.formationSpots('jumbo1');
        for (const pos of ['wr1', 'wr2', 'wr3', 'wr4', 'qb']) expect(player(pos).hidden).toBe(!spots[pos]);
        expect(UI.designerState().base).toBe('jumbo1');
    });
});

describe('drawing', () => {
    test('a drag draws the chosen man a route, anchored to him, simplified, and said out loud', () => {
        UI.showDesigner(() => {});
        player('wr2').click();
        expect(UI.designerState().selected).toBe('wr2');
        const spot = A.formationSpots('pass4').wr2;
        // An out: downfield 1.6 intervals, then to the near sideline.
        const corner = [spot[0] + 0.32, spot[1]];
        const end = [spot[0] + 0.32, 0.06];
        drag([[spot[0] + 0.03, spot[1] + 0.02], corner, end]);
        const line = UI.designerState().routes.wr2;
        expect(line).toBeDefined();
        expect(line[0]).toEqual([spot[0], spot[1]]);
        expect(line.length).toBeGreaterThanOrEqual(3);
        expect(line.length).toBeLessThanOrEqual(D.MAX_POINTS);
        const last = line[line.length - 1];
        expect(Math.abs(last[0] - end[0])).toBeLessThan(0.03);
        expect(Math.abs(last[1] - end[1])).toBeLessThan(0.03);
        // The corner survived the smoothing: some point is near it.
        expect(line.some((q) => Math.abs(q[0] - corner[0]) < 0.03 && Math.abs(q[1] - corner[1]) < 0.05)).toBe(true);
        expect(parts().status.textContent).toBe('Route drawn for Receiver B.');
        expect(player('wr2').getAttribute('aria-label')).toBe('Receiver B, route drawn');
        expect(parts().canvas.getAttribute('aria-label')).toMatch(/B medium left/);
        // The other men are blocking, says the label.
        expect(parts().canvas.getAttribute('aria-label')).toMatch(/A, C and D blocking/);
    });

    test('with nobody chosen the field is the page’s to scroll, a tap says what to do, and choosing again un-chooses', () => {
        UI.showDesigner(() => {});
        const p = parts();
        const spot = A.formationSpots('pass4').wr1;
        // A drag with nobody chosen draws nothing, takes no capture, and says
        // nothing: it is a scroll. Only a finished tap gets the hint.
        const down = fire(p.canvas, 'pointerdown', { ...toClient(spot), pointerId: 9, button: 0 });
        expect(down.defaultPrevented).toBe(false);
        fire(p.canvas, 'pointermove', { ...toClient([spot[0] + 0.3, spot[1]]), pointerId: 9 });
        fire(p.canvas, 'pointerup', { ...toClient([spot[0] + 0.3, spot[1]]), pointerId: 9 });
        expect(UI.designerState().routes).toEqual({});
        expect(p.status.textContent).toBe('');
        fire(p.canvas, 'click');
        expect(p.status.textContent).toBe('Please choose a player (A, B, C, D, or QB).');
        // Chosen: the field is armed, the prompt goes, the hint names him.
        // Chosen again: not.
        player('wr2').click();
        expect(UI.designerState().selected).toBe('wr2');
        expect(p.canvas.classList.contains('is-armed')).toBe(true);
        expect(p.prompt.hidden).toBe(true);
        expect(p.hint.textContent).toMatch(/^Draw Receiver B's route/);
        player('wr2').click();
        expect(UI.designerState().selected).toBe('');
        expect(p.canvas.classList.contains('is-armed')).toBe(false);
        expect(p.prompt.hidden).toBe(false);
        expect(player('wr2').getAttribute('aria-checked')).toBe('false');
        // A formation that does not stand the chosen man un-chooses him.
        player('wr4').click();
        p.formation.value = 'book:jumbo1';
        fire(p.formation, 'change');
        expect(UI.designerState().selected).toBe('');
        p.formation.value = 'tpl:spread';
        fire(p.formation, 'change');
    });

    test('a tap is not a route, a second finger is ignored, and a right button does nothing', () => {
        UI.showDesigner(() => {});
        player('wr1').click();
        const spot = A.formationSpots('pass4').wr1;
        drag([spot, [spot[0] + 0.01, spot[1]]]);
        expect(UI.designerState().routes).toEqual({});
        expect(parts().status.textContent).toMatch(/too short/);
        // Two fingers: the second one's moves do not join the first's line.
        const canvas = parts().canvas;
        fire(canvas, 'pointerdown', { ...toClient(spot), pointerId: 1, button: 0 });
        fire(canvas, 'pointerdown', { ...toClient([0.9, 0.9]), pointerId: 2, button: 0 });
        for (let k = 1; k <= 20; k += 1) fire(canvas, 'pointermove', { ...toClient([0.9, 0.9 - k * 0.02]), pointerId: 2 });
        for (let k = 1; k <= 20; k += 1) fire(canvas, 'pointermove', { ...toClient([spot[0] + k * 0.02, spot[1]]), pointerId: 1 });
        fire(canvas, 'pointerup', { ...toClient([0.9, 0.5]), pointerId: 2 });
        expect(UI.designerState().routes).toEqual({});
        fire(canvas, 'pointerup', { ...toClient([spot[0] + 0.4, spot[1]]), pointerId: 1 });
        const line = UI.designerState().routes.wr1;
        expect(line).toBeDefined();
        for (const q of line) expect(q[0]).toBeLessThan(0.7);
        // A right button does nothing.
        player('wr3').click();
        fire(canvas, 'pointerdown', { ...toClient(A.formationSpots('pass4').wr3), pointerId: 3, button: 2 });
        fire(canvas, 'pointerup', { ...toClient([0.9, 0.5]), pointerId: 3 });
        expect(UI.designerState().routes.wr3).toBeUndefined();
    });

    test('a second line on the same man replaces the first, Undo brings it back, and Clear empties the field', () => {
        UI.showDesigner(() => {});
        player('wr1').click();
        const spot = A.formationSpots('pass4').wr1;
        drag([spot, [spot[0] + 0.4, spot[1]]]);
        const first = UI.designerState().routes.wr1;
        drag([spot, [spot[0] + 0.2, spot[1]], [spot[0] + 0.2, spot[1] + 0.3]]);
        const second = UI.designerState().routes.wr1;
        expect(second).not.toEqual(first);
        byText('Undo').click();
        expect(UI.designerState().routes.wr1).toEqual(first);
        byText('Undo').click();
        expect(UI.designerState().routes).toEqual({});
        expect(byText('Undo').disabled).toBe(true);
        drag([spot, [spot[0] + 0.4, spot[1]]]);
        player('wr4').click();
        const d = A.formationSpots('pass4').wr4;
        drag([d, [d[0] + 0.4, d[1]]]);
        expect(Object.keys(UI.designerState().routes).sort()).toEqual(['wr1', 'wr4']);
        byText('Clear').click();
        expect(UI.designerState().routes).toEqual({});
        expect(parts().status.textContent).toMatch(/Cleared/);
        byText('Undo').click();
        expect(Object.keys(UI.designerState().routes).sort()).toEqual(['wr1', 'wr4']);
    });

    test('the arrow keys draw the same route without a pointer', () => {
        UI.showDesigner(() => {});
        player('wr3').click();
        parts().canvas.focus();
        const spot = A.formationSpots('pass4').wr3;
        // Ten whole intervals right is clamped to the end of the field, so
        // two: Shift and Right twice is 0.4 of the field downfield.
        key('ArrowRight', { shiftKey: true });
        key('ArrowRight', { shiftKey: true });
        expect(parts().status.textContent).toMatch(/14 meters downfield/);
        key(' ');
        expect(parts().status.textContent).toBe('Point 1 placed.');
        // Then across toward the near sideline (up the canvas), a whole interval.
        key('ArrowUp', { shiftKey: true });
        key(' ');
        key('Backspace');
        expect(parts().status.textContent).toBe('Last point removed.');
        key(' ');
        key('Enter');
        const line = UI.designerState().routes.wr3;
        expect(line).toBeDefined();
        expect(line[0]).toEqual([spot[0], spot[1]]);
        expect(line[1][0]).toBeCloseTo(spot[0] + 0.4, 5);
        expect(line[1][1]).toBeCloseTo(spot[1], 5);
        expect(line[2][1]).toBeCloseTo(spot[1] - 0.02 / 0.6 * 10, 5);
        // Escape while placing points cancels the route and nothing else.
        key('ArrowRight');
        const e = key('Escape');
        expect(e.defaultPrevented).toBe(true);
        expect(parts().status.textContent).toBe('Route cancelled.');
        expect(el('designer').hidden).toBe(false);
        // Enter with nothing placed is not a route.
        key('Enter');
        expect(parts().status.textContent).toMatch(/too short/);
    });
});

describe('saving', () => {
    test('Save needs a name and a line, keeps the play, goes back to the book and says what was saved', () => {
        const back = jest.fn();
        UI.showDesigner(back);
        const p = parts();
        byText('Save play').click();
        expect(p.status.textContent).toBe('Draw at least one route to save.');
        expect(S.listPlays()).toEqual([]);
        player('wr2').click();
        const spot = A.formationSpots('pass4').wr2;
        drag([spot, [spot[0] + 0.4, spot[1]]]);
        p.name.value = '   ';
        byText('Save play').click();
        expect(p.status.textContent).toBe('Give the play a name first.');
        p.name.value = 'B go';
        byText('Save play').click();
        expect(el('designer').hidden).toBe(true);
        expect(back).toHaveBeenCalledTimes(1);
        expect(saved).toHaveLength(1);
        expect(saved[0].name).toBe('B go');
        expect(saved[0].base).toBe('pass4');
        expect(Object.keys(saved[0].routes)).toEqual(['wr2']);
        expect(S.getPlay(saved[0].id)).toEqual(saved[0]);
        // The ping says the formation and nothing of the name or the lines.
        const save = reports.find(([, d]) => d.kind === 'save');
        expect(save).toEqual(['design', { kind: 'save', outcome: { base: 'pass4' } }]);
        expect(JSON.stringify(reports)).not.toMatch(/B go/);
    });

    test('one of the visitor’s own plays opens with its lines, and Save changes updates it, renamed or not, with no question', () => {
        const mine = S.addPlay({ name: 'Mine', base: 'pass2', routes: { wr1: [[0.19, 0.08], [0.5, 0.08]] } }, 1);
        UI.showDesigner(() => {}, { play: `mine:${mine.id}` });
        const p = parts();
        expect(p.name.value).toBe('Mine');
        expect(UI.designerState().routes).toEqual(mine.routes);
        expect(byText('Delete my play')).toBeTruthy();
        // The buttons say what they will do to the play that is open.
        expect(byText('Save play')).toBeUndefined();
        expect(byText('Save changes')).toBeTruthy();
        expect(byText('Save as new play').hidden).toBe(false);
        player('wr2').click();
        const spot = A.formationSpots('pass2').wr2;
        drag([spot, [spot[0] + 0.4, spot[1]]]);
        p.name.value = 'Mine, renamed';
        byText('Save changes').click();
        expect(p.confirm.hidden).toBe(true);
        expect(el('designer').hidden).toBe(true);
        expect(S.listPlays()).toHaveLength(1);
        const kept = S.getPlay(mine.id);
        expect(kept.name).toBe('Mine, renamed');
        expect(Object.keys(kept.routes).sort()).toEqual(['wr1', 'wr2']);
        expect(saved[0].id).toBe(mine.id);
        expect(reports.find(([, d]) => d.kind === 'update')[1].outcome).toEqual({ base: 'pass2' });
    });

    test('Save as new play is the explicit way to a copy, and a formation or a book play only ever saves a new one', () => {
        const mine = S.addPlay({ name: 'Mine', base: 'pass2', routes: { wr1: [[0.19, 0.08], [0.5, 0.08]] } }, 1);
        UI.showDesigner(() => {}, { play: `mine:${mine.id}` });
        parts().name.value = 'Mine again';
        byText('Save as new play').click();
        expect(S.listPlays()).toHaveLength(2);
        expect(S.listPlays()[0].name).toBe('Mine again');
        expect(S.getPlay(mine.id).name).toBe('Mine');
        // The same name as an existing play gets a number rather than a replace.
        UI.showDesigner(() => {});
        const p = parts();
        expect(byText('Save as new play').hidden).toBe(true);
        expect(byText('Save play')).toBeTruthy();
        player('wr1').click();
        const spot = A.formationSpots('pass4').wr1;
        drag([spot, [spot[0] + 0.4, spot[1]]]);
        p.name.value = 'Mine';
        byText('Save play').click();
        expect(S.listPlays()).toHaveLength(3);
        expect(S.listPlays()[0].name).toBe('Mine 2');
        expect(S.getPlay(mine.id).routes).toEqual(mine.routes);
    });

    test('the question row can hide itself: the stylesheet gives its flex display a hidden rule', async () => {
        // A display rule beats the hidden attribute, and the headless DOM
        // cannot see it: the "Yes, delete it" question stayed on a phone's
        // screen after the play was gone (QA, 2026-11-02).
        const { readFileSync } = await import('node:fs');
        const css = readFileSync(join(here, '..', 'www', 'xo', 'css', 'experience.css'), 'utf8');
        expect(css).toMatch(/\.designer-question\s*\{[^}]*display:\s*flex/);
        expect(css).toMatch(/\.designer-question\[hidden\]\s*\{[^}]*display:\s*none/);
    });

    test('the close button in the top right is the Back button by another shape', () => {
        const back = jest.fn();
        UI.showDesigner(back);
        const panel = el('designer-panel');
        const close = panel.children[0];
        expect(close.className).toBe('designer-close');
        expect(close.getAttribute('aria-label')).toBe('Back to the playbook');
        player('wr1').click();
        const spot = A.formationSpots('pass4').wr1;
        drag([spot, [spot[0] + 0.4, spot[1]]]);
        close.click();
        // Asked, like Back, because lines are unsaved.
        expect(parts().confirm.hidden).toBe(false);
        expect(el('designer').hidden).toBe(false);
        byText('Yes, leave').click();
        expect(el('designer').hidden).toBe(true);
        expect(back).toHaveBeenCalledTimes(1);
        // With nothing drawn it simply closes.
        UI.showDesigner(back);
        close.click();
        expect(el('designer').hidden).toBe(true);
        expect(back).toHaveBeenCalledTimes(2);
    });

    test('leaving with lines drawn is asked twice, and Escape is the way out too', () => {
        const back = jest.fn();
        UI.showDesigner(back);
        player('wr1').click();
        const spot = A.formationSpots('pass4').wr1;
        drag([spot, [spot[0] + 0.4, spot[1]]]);
        fire(dom.documentStub, 'keydown', { key: 'Escape' });
        expect(parts().confirm.hidden).toBe(false);
        expect(el('designer').hidden).toBe(false);
        // A second Escape answers no.
        fire(dom.documentStub, 'keydown', { key: 'Escape' });
        expect(parts().confirm.hidden).toBe(true);
        expect(el('designer').hidden).toBe(false);
        byText('Back to the playbook').click();
        byText('Yes, leave').click();
        expect(el('designer').hidden).toBe(true);
        expect(back).toHaveBeenCalledTimes(1);
        expect(S.listPlays()).toEqual([]);
    });
});

describe('the formation', () => {
    test('changing it is a new start, with no question: unsaved lines go with the old formation', () => {
        UI.showDesigner(() => {});
        const p = parts();
        player('wr1').click();
        const spot = A.formationSpots('pass4').wr1;
        drag([spot, [spot[0] + 0.4, spot[1]]]);
        expect(UI.designerState().routes.wr1).toBeDefined();
        p.formation.value = 'book:pass7';
        fire(p.formation, 'change');
        expect(p.confirm.hidden).toBe(true);
        expect(UI.designerState().base).toBe('pass7');
        expect(UI.designerState().routes).toEqual({});
        expect(p.formation.value).toBe('book:pass7');
        expect(p.status.textContent).toBe('Stack Right formation. Nothing drawn yet.');
        p.formation.value = 'tpl:screen';
        fire(p.formation, 'change');
        expect(UI.designerState().base).toBe('run3');
        expect(p.status.textContent).toBe('Screen formation. Nothing drawn yet.');
        // The same choice again changes nothing and says nothing new.
        p.status.textContent = '';
        p.formation.value = 'tpl:screen';
        fire(p.formation, 'change');
        expect(p.status.textContent).toBe('');
    });
});

describe('the name', () => {
    test('follows the choice: a fresh name for a formation or a book play, the play’s own for one of yours, and a fresh one again after a delete', () => {
        const mine = S.addPlay({ name: 'Mine', base: 'pass2', routes: { wr1: [[0.19, 0.08], [0.5, 0.08]] } }, 1);
        UI.showDesigner(() => {});
        const p = parts();
        expect(p.name.value).toBe('My play 1');
        p.formation.value = 'book:pass7';
        fire(p.formation, 'change');
        expect(p.name.value).toBe('My play 1');
        p.formation.value = `mine:${mine.id}`;
        fire(p.formation, 'change');
        expect(p.name.value).toBe('Mine');
        // ...and on to a formation again: not left saying "Mine".
        p.formation.value = 'tpl:bunch';
        fire(p.formation, 'change');
        expect(p.name.value).toBe('My play 1');
        // A delete resets it too.
        p.formation.value = `mine:${mine.id}`;
        fire(p.formation, 'change');
        byText('Delete my play').click();
        byText('Yes, delete it').click();
        expect(p.formation.value).toBe(`gone:${mine.id}`);
        expect(p.name.value).toBe('My play 1');
    });

    test('a name the visitor typed stays through formation changes, until one of their own plays is chosen', () => {
        const mine = S.addPlay({ name: 'Mine', base: 'pass2', routes: { wr1: [[0.19, 0.08], [0.5, 0.08]] } }, 1);
        UI.showDesigner(() => {});
        const p = parts();
        p.name.value = 'Flood B post';
        fire(p.name, 'input');
        p.formation.value = 'tpl:bunch';
        fire(p.formation, 'change');
        expect(p.name.value).toBe('Flood B post');
        p.formation.value = 'book:pass7';
        fire(p.formation, 'change');
        expect(p.name.value).toBe('Flood B post');
        p.formation.value = `mine:${mine.id}`;
        fire(p.formation, 'change');
        expect(p.name.value).toBe('Mine');
        // Opening again starts fresh.
        byText('Back to the playbook').click();
        UI.showDesigner(() => {});
        expect(parts().name.value).toBe('My play 1');
    });
});

describe('removing and restoring', () => {
    test('a book play is removed after a question, listed under Removed plays, read-only there, and restored from there', () => {
        UI.showDesigner(() => {});
        const p = parts();
        expect(byText('Remove from playbook').hidden).toBe(true);
        p.formation.value = 'book:pass7';
        fire(p.formation, 'change');
        const remove = byText('Remove from playbook');
        expect(remove.hidden).toBe(false);
        remove.click();
        expect(p.confirm.hidden).toBe(false);
        byText('Yes, remove it').click();
        expect(S.isHidden('pass7')).toBe(true);
        expect(p.formation.value).toBe('gone:pass7');
        expect(p.formation.children.map((g) => g.label)).toContain('Removed plays');
        expect(UI.designerState().readOnly).toBe(true);
        expect(byText('Save play').disabled).toBe(true);
        expect(byText('Restore to playbook').hidden).toBe(false);
        expect(byText('Delete for good').hidden).toBe(true);
        expect(reports.find(([, d]) => d.kind === 'remove')[1].outcome).toEqual({ play: 'pass7' });
        // Drawing on a removed play does nothing.
        player('wr1').click();
        const spot = A.formationSpots('pass7').wr1;
        drag([spot, [spot[0] + 0.4, spot[1]]]);
        expect(UI.designerState().routes).toEqual({});
        byText('Restore to playbook').click();
        expect(S.isHidden('pass7')).toBe(false);
        expect(p.formation.value).toBe('book:pass7');
        expect(UI.designerState().readOnly).toBe(false);
        expect(reports.find(([, d]) => d.kind === 'restore')[1].outcome).toEqual({ play: 'pass7' });
    });

    test('a visitor’s own play is deleted to the Removed list, and only Delete for good takes it away', () => {
        const mine = S.addPlay({ name: 'Mine', base: 'pass2', routes: { wr1: [[0.19, 0.08], [0.5, 0.08]] } }, 1);
        UI.showDesigner(() => {}, { play: `mine:${mine.id}` });
        byText('Delete my play').click();
        byText('Yes, delete it').click();
        expect(S.isHidden(mine.id)).toBe(true);
        expect(S.getPlay(mine.id)).not.toBeNull();
        expect(parts().formation.value).toBe(`gone:${mine.id}`);
        expect(reports.find(([, d]) => d.kind === 'delete')[1].outcome).toEqual({ play: 'custom' });
        const purge = byText('Delete for good');
        expect(purge.hidden).toBe(false);
        purge.click();
        byText('Yes, delete it').click();
        expect(S.getPlay(mine.id)).toBeNull();
        expect(parts().formation.value).toBe('tpl:spread');
        expect(JSON.stringify(reports)).not.toMatch(/Mine/);
    });

    test('the book keeps at least one play', () => {
        for (const play of PLAYS.slice(1)) S.hidePlay(play.slug);
        UI.showDesigner(() => {});
        const p = parts();
        p.formation.value = `book:${PLAYS[0].slug}`;
        fire(p.formation, 'change');
        byText('Remove from playbook').click();
        expect(p.confirm.hidden).toBe(true);
        expect(S.isHidden(PLAYS[0].slug)).toBe(false);
        expect(p.status.textContent).toMatch(/needs at least one play/);
        // One designed play is enough to let the last of the book go.
        S.addPlay({ name: 'Mine', base: 'pass2', routes: { wr1: [[0.19, 0.08], [0.5, 0.08]] } }, 1);
        byText('Remove from playbook').click();
        byText('Yes, remove it').click();
        expect(S.isHidden(PLAYS[0].slug)).toBe(true);
    });
});

