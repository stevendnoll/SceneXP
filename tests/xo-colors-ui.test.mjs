// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The Team colors card, driven through its own inputs.
 *
 * What is worth pinning here is TIMING, which a click-through cannot see: a
 * color picker fires `input` dozens of times a second while it is dragged, and
 * every one of those must not become a repaint of a 2048-pixel field texture.
 * The card coalesces the kits to one paint a frame and the field to one every
 * tenth of a second, keeps the choice when a picker is let go, and always paints
 * where it was let go.
 */
import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { installThree } from './helpers/three-stub.mjs';
import { installDom, fire } from './helpers/dom-stub.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const scene = join(here, '..', 'www', 'xo', 'js');
const KEY = 'exes-n-ohs-team-colors';

let dom;
let UI;
let C;
let applied;
let reports;
let spoken;

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
    // A frame is a sixtieth of a second on the fake clock, whatever the
    // environment happens to provide under that name.
    globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 16);
    C = await import(join(scene, 'colors.min.js'));
    UI = await import(join(scene, 'colors-ui.js'));
    C.resetColors();
    applied = [];
    reports = [];
    spoken = [];
    UI.initColorsCard({
        apply: (what) => applied.push(what),
        report: (action, detail) => reports.push([action, detail]),
        announce: (text) => spoken.push(text),
    });
});

afterEach(() => {
    dom.uninstall();
    jest.useRealTimers();
    delete globalThis.localStorage;
    delete globalThis.requestAnimationFrame;
});

const el = (id) => dom.el(id);
const pick = (id, value, type = 'input') => {
    el(id).value = value;
    fire(el(id), type);
};

describe('opening and closing', () => {
    test('opens saying what is chosen, with the first picker focused', () => {
        C.setColors({ teams: { 1: { jersey: '#ffb612', helmet: '#000000' } } });
        const back = jest.fn();
        UI.showColorsCard(back);
        expect(el('colors').hidden).toBe(false);
        expect(el('colors-x-jersey').value).toBe('#ff992c');
        expect(el('colors-o-jersey').value).toBe('#ffb612');
        expect(el('colors-o-helmet').value).toBe('#000000');
        expect(el('colors-x-match').hidden).toBe(true);
        expect(el('colors-o-match').hidden).toBe(false);
        expect(el('colors-x-jersey').focused).toBe(true);
        expect(reports).toEqual([['team-colors', {}]]);
        expect(UI.colorsCardOpen()).toBe(true);
    });

    test('Done and Escape both close it, keep the choice and go back, saying whether anything changed', () => {
        const back = jest.fn();
        UI.showColorsCard(back);
        el('colors-done').click();
        expect(el('colors').hidden).toBe(true);
        expect(back).toHaveBeenCalledTimes(1);
        expect(reports.at(-1)).toEqual(['set-colors', { kind: 'unchanged' }]);

        UI.showColorsCard(back);
        pick('colors-x-jersey', '#241773');
        fire(dom.documentStub, 'keydown', { key: 'Escape' });
        expect(el('colors').hidden).toBe(true);
        expect(back).toHaveBeenCalledTimes(2);
        expect(reports.at(-1)).toEqual(['set-colors', { kind: 'changed' }]);
        expect(JSON.parse(localStorage.getItem(KEY)).teams[0].jersey).toBe('#241773');
        // A second Escape with the card shut does nothing.
        fire(dom.documentStub, 'keydown', { key: 'Escape' });
        expect(back).toHaveBeenCalledTimes(2);
    });
});

describe('the pickers', () => {
    beforeEach(() => UI.showColorsCard(() => {}));

    test('a jersey shows at once, and its helmet follows until the helmet is given its own color', () => {
        pick('colors-x-jersey', '#241773');
        expect(C.jerseyOf(0)).toBe('#241773');
        expect(el('colors-x-helmet').value).toBe('#241773');
        pick('colors-x-helmet', '#000000');
        expect(C.helmetOf(0)).toBe('#000000');
        expect(el('colors-x-match').hidden).toBe(false);
        pick('colors-x-jersey', '#4b2e83');
        expect(el('colors-x-helmet').value).toBe('#000000');

        el('colors-x-match').click();
        expect(C.helmetOf(0)).toBe('#4b2e83');
        expect(el('colors-x-helmet').value).toBe('#4b2e83');
        expect(el('colors-x-match').hidden).toBe(true);
        expect(el('colors-x-helmet').focused).toBe(true);
    });

    test('dragging a jersey paints the kits once a frame, not once an event', () => {
        for (const hex of ['#110000', '#220000', '#330000', '#440000', '#550000']) pick('colors-o-jersey', hex);
        expect(applied).toEqual([]);
        jest.advanceTimersByTime(20);
        expect(applied).toEqual([{ teams: true, field: false }]);
        expect(C.jerseyOf(1)).toBe('#550000');
    });

    test('dragging the field repaints it at most every tenth of a second, and where it was let go', () => {
        const fieldPaints = () => applied.filter((a) => a.field).length;
        for (let i = 0; i < 30; i += 1) {
            pick('colors-field', `#00${(0x20 + i).toString(16)}00`);
            jest.advanceTimersByTime(10);
        }
        // Three hundred milliseconds of dragging: a paint straight away and one
        // every tenth of a second after, never thirty.
        expect(fieldPaints()).toBeGreaterThanOrEqual(3);
        expect(fieldPaints()).toBeLessThanOrEqual(4);
        pick('colors-field', '#0033a0', 'change');
        expect(applied.at(-1)).toEqual({ teams: false, field: true });
        expect(C.fieldColor()).toBe('#0033a0');
        expect(JSON.parse(localStorage.getItem(KEY)).field).toBe('#0033a0');
    });

    test('the warning appears, changes and goes, and is only rewritten when what it says changes', () => {
        expect(el('colors-warning').hidden).toBe(true);
        pick('colors-field', '#125740');
        pick('colors-o-jersey', '#125740');
        const first = el('colors-warning').textContent;
        expect(first).toContain('The O\'s jerseys are close to the field color');
        expect(el('colors-warning').hidden).toBe(false);

        let writes = 0;
        const note = el('colors-warning');
        let text = note.textContent;
        Object.defineProperty(note, 'textContent', {
            get: () => text, set: (v) => { writes += 1; text = v; }, configurable: true,
        });
        pick('colors-o-jersey', '#135841');
        pick('colors-o-jersey', '#145942');
        expect(writes).toBe(0);
        pick('colors-o-jersey', '#9bcfff');
        expect(writes).toBe(1);
        expect(note.hidden).toBe(true);
    });

    test('Reset puts the game\'s own colors back, keeps that, paints it and says so', () => {
        pick('colors-x-jersey', '#241773', 'change');
        expect(localStorage.getItem(KEY)).not.toBeNull();
        el('colors-reset').click();
        expect(C.isDefault()).toBe(true);
        expect(localStorage.getItem(KEY)).toBeNull();
        expect(el('colors-x-jersey').value).toBe('#ff992c');
        expect(applied.at(-1)).toEqual({ teams: true, field: true });
        expect(spoken).toEqual(['The original colors are back.']);
    });
});

/**
 * WHAT A VISITOR READS ON THE CARD, from the page itself: American spelling and
 * vocabulary (Steve's standing rule, and the code beside it spells `colour`),
 * no team names, no semicolons or em dashes, and every picker named by a label.
 */
describe('the card\'s copy', () => {
    const html = readFileSync(join(here, '..', 'www', 'xo', 'index.html'), 'utf8');
    const start = html.indexOf('<div id="colors"');
    const block = html.slice(start, html.indexOf('<!-- THE PLAYBOOK (M3)', start));
    const visible = block.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const labels = [...block.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1]);

    test('is American English, names no team, and keeps the house punctuation', () => {
        expect(visible).toContain('Team colors');
        expect(visible).toContain('Reset to original colors');
        for (const text of [visible, ...labels]) {
            expect(text).not.toMatch(/colour|favour|centre|grey|realis|organis|behaviour/i);
            expect(text).not.toMatch(/Mongoose|Crows/);
            expect(text).not.toMatch(/[;—]/);
        }
    });

    test('every picker has a label, and every aria-label starts with the words on screen', () => {
        for (const id of ['colors-x-jersey', 'colors-x-helmet', 'colors-o-jersey', 'colors-o-helmet', 'colors-field']) {
            expect(block).toContain(`<label for="${id}">`);
        }
        for (const label of labels) expect(label.startsWith('Match jersey')).toBe(true);
    });
});
