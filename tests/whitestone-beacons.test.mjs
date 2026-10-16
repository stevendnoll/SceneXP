// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * Whitestone's usage beacons (beacons.js; Steve, 2026-10-16: "each button
 * click/tap would trigger a telemetry signal"). The vocabulary, every control
 * on both pages named by it, and the listener: one tap, one beacon, under the
 * names the log keeps, and nothing the visitor wrote.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { studioBeacon, cleanerBeacon, SKIP, controlOf, readControl, installBeacons } from '../www/whitestone/js/beacons.js';

/** What the log keeps (specs/nginx-config.txt) and the collector's shapes
 *  (ops/collect_snaps.py). */
const ACTION = /^[a-z][a-z0-9-]{0,39}$/;
const KIND = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/;
const valid = (b) => ACTION.test(b.action) && (b.kind === undefined || KIND.test(b.kind))
    && Object.keys(b).every((k) => ['action', 'kind', 'outcome'].includes(k));

/** Every button, link, checkbox and file picker a page's markup has, the
 *  no-JavaScript fallback and comments aside. */
function controlsIn(file) {
    const html = readFileSync(join(process.cwd(), 'www', 'whitestone', file), 'utf8')
        .replace(/<!--[\s\S]*?-->/g, '').replace(/<noscript>[\s\S]*?<\/noscript>/g, '');
    const out = [];
    for (const m of html.matchAll(/<(button|a|input)\b([^>]*)>/g)) {
        const attr = (k) => (new RegExp(`\\b${k}="([^"]*)"`).exec(m[2]) || [])[1] || '';
        if (m[1] === 'input' && !['checkbox', 'file'].includes(attr('type'))) continue;
        out.push({ tag: m[1], id: attr('id'), className: attr('class'), href: attr('href'), beacon: attr('data-beacon') });
    }
    return out;
}

describe('the vocabulary', () => {
    test.each([
        // Maya: her steps, her picks, her rooms, her floors, her header and foot.
        ['host-start', '', { action: 'start', kind: 'maya' }],
        ['host-example', '', { action: 'example', kind: 'maya' }],
        ['host-skipTour', '', { action: 'skip-tour', kind: 'maya' }],
        ['host-buildOwn', '', { action: 'schedule-my-cleaning', kind: 'maya' }],
        ['host-chooseTime', '', { action: 'choose-time', kind: 'maya' }],
        ['host-reviewQuote', '', { action: 'review-quote', kind: 'maya' }],
        ['host-visit', '', { action: 'see-visit', kind: 'maya' }],
        ['host-kind-townhome', 'ws-btn host-pick', { action: 'home-type', kind: 'townhome' }],
        ['host-attached-middle', '', { action: 'attached', kind: 'middle' }],
        ['host-floor-second', '', { action: 'floor', kind: 'second' }],
        ['host-chip-primary-bathroom', 'panel-chip', { action: 'add-room', kind: 'primary-bathroom', outcome: 'via=maya' }],
        ['host-open-basement', 'panel-row', { action: 'open-floor', kind: 'list' }],
        ['host-fact-quote', '', { action: 'fact', kind: 'quote' }],
        ['host-step-0', '', { action: 'step', kind: 'step-1' }],
        ['host-next', 'host-next', { action: 'continue', kind: 'maya' }],
        ['host-next', 'ws-btn ws-btn-primary', { action: 'next', kind: 'maya' }],
        ['host-back', 'host-back', { action: 'back', kind: 'maya' }],
        ['host-reset', 'host-reset', { action: 'start-over', kind: 'maya' }],
        ['host-expand', '', { action: 'need-a-hand', kind: 'maya' }],
        ['explore-link', 'host-explore', { action: 'explore' }],
        // The panel and its rows, never their record ids.
        ['panel-room-r8f3k2a9x', 'panel-row', { action: 'open-room', kind: 'panel' }],
        ['panel-task-i0abcdefg', 'panel-row', { action: 'open-task', kind: 'panel' }],
        ['panel-chip-office', 'panel-chip', { action: 'add-room', kind: 'office', outcome: 'via=panel' }],
        ['panel-bath-shower', 'panel-bath', { action: 'bath', kind: 'shower' }],
        ['panel-addTask', 'ws-btn', { action: 'add-task', kind: 'panel' }],
        ['panel-back', 'host-next', { action: 'back', kind: 'panel' }],
        // Cards, by their own names.
        ['receipt-copy-link', '', { action: 'copy-link', kind: 'receipt' }],
        ['receipt-unpublish', '', { action: 'unpublish', kind: 'receipt' }],
        ['visit-report-done', '', { action: 'done', kind: 'visit-report' }],
        ['quote-open-checklist', '', { action: 'open-checklist', kind: 'quote' }],
        ['prefs-skip', '', { action: 'skip', kind: 'prefs' }],
        ['move-up-i0abcdefg', '', { action: 'move-task', kind: 'up' }],
        ['addon-approve-a1b2c3d4', '', { action: 'approve', kind: 'list' }],
        ['toast-undo', '', { action: 'undo', kind: 'toast' }]
    ])('studio %s (%s)', (id, className, expected) => {
        expect(studioBeacon({ id, className })).toEqual(expected);
    });

    test('a control with no id says its own name; the confirm card says which question', () => {
        expect(studioBeacon({ beacon: 'confirm-yes:start-over' })).toEqual({ action: 'confirm-yes', kind: 'start-over' });
        expect(studioBeacon({ beacon: 'edit-task:checklist' })).toEqual({ action: 'edit-task', kind: 'checklist' });
        expect(studioBeacon({ beacon: 'remove-task', id: 'host-start' })).toEqual({ action: 'remove-task' });
    });

    test('the chatty and the self-reporting say nothing here (booking reports its own result)', () => {
        for (const id of ['booking-day-2026-10-15', 'booking-prev', 'booking-next', 'booking-confirm', 'panel-star-i0abcdefg']) {
            expect(studioBeacon({ id })).toBe(SKIP);
        }
        expect(cleanerBeacon({ id: 'pin-open' })).toBe(SKIP);
        expect(studioBeacon({ id: 'something-new' })).toBeNull();
        expect(cleanerBeacon({ id: 'something-new' })).toBeNull();
    });

    test.each([
        ['done-i0abcdefg', '', '', { action: 'cleaner-done' }],
        ['skip-i0abcdefg', '', '', { action: 'cleaner-skip' }],
        ['skip-words-i0abcdefg', '', '', { action: 'cleaner-skip-with-words' }],
        ['skip-cancel-i0abcdefg', '', '', { action: 'cleaner-skip-cancel' }],
        ['unskip-i0abcdefg', '', '', { action: 'cleaner-unskip' }],
        ['reason-i0ab-cdefg-customer-asked', '', '', { action: 'cleaner-skip-reason', kind: 'customer-asked' }],
        ['reason-i0abcdefg-no-time', '', '', { action: 'cleaner-skip-reason', kind: 'no-time' }],
        ['addon-done-a1b2c3d4', '', '', { action: 'cleaner-addon-done' }],
        ['addon-send-r1', '', '', { action: 'cleaner-addon-send' }],
        ['propose-r1abcdefg', '', '', { action: 'cleaner-propose' }],
        ['proof-input-i0abcdefg', '', '', { action: 'cleaner-add-photo' }],
        ['proof-remove-p1', '', '', { action: 'cleaner-remove-photo' }],
        ['tasks-finish', '', '', { action: 'cleaner-finish' }],
        ['tasks-print', '', '', { action: 'cleaner-print' }],
        ['report-send', '', '', { action: 'cleaner-report-send' }],
        ['', 'task-photo', '', { action: 'cleaner-view-photo' }],
        ['', 'photo-close', '', { action: 'cleaner-close-photo' }],
        ['', '', '#task-i0abcdefg', { action: 'cleaner-jump-to-task' }],
        ['', '', '/privacy.html', { action: 'cleaner-privacy' }]
    ])('cleaner %s%s%s', (id, className, href, expected) => {
        expect(cleanerBeacon({ id, className, href })).toEqual(expected);
    });

    test('every name is one the log keeps, and no name carries a record\'s key', () => {
        const samples = [
            ...['host-start', 'host-kind-house', 'host-chip-primary-bathroom', 'host-step-4', 'panel-room-r8f3k2a9x', 'receipt-copy-edit',
                'visit-report-close', 'move-down-i0abcdefg', 'addon-decline-a1b2c3d4'].map((id) => studioBeacon({ id })),
            ...['done-i0abcdefg', 'reason-i0abcdefg-already-clean', 'proof-remove-p1zz'].map((id) => cleanerBeacon({ id }))
        ];
        for (const b of samples) {
            expect(`${JSON.stringify(b)} ${valid(b)}`).toBe(`${JSON.stringify(b)} true`);
            expect(JSON.stringify(b)).not.toMatch(/i0abcdefg|r8f3k2a9x|a1b2c3d4|p1zz/);
        }
    });
});

describe('every control on both pages is named (a new one is named or this fails)', () => {
    test('the studio\'s markup', () => {
        const controls = controlsIn('index.html');
        expect(controls.length).toBeGreaterThan(40);
        for (const c of controls) {
            const b = studioBeacon(c);
            expect(`${c.id || c.className}: ${b === null ? 'unnamed' : 'named'}`).toBe(`${c.id || c.className}: named`);
            if (b !== SKIP) expect(`${c.id}: ${valid(b)}`).toBe(`${c.id}: true`);
        }
    });

    test('the cleaner\'s page\'s markup', () => {
        const controls = controlsIn(join('tasks', 'index.html'));
        expect(controls.length).toBeGreaterThan(0);
        for (const c of controls) expect(`${c.id || c.href}: ${cleanerBeacon(c) === null ? 'unnamed' : 'named'}`).toBe(`${c.id || c.href}: named`);
    });

    test('and every control their scripts draw, by the ids and names they build', () => {
        const sources = ['js/host.js', 'js/panel.js', 'js/panels.js', 'js/cards.js', 'js/forms.js', 'js/booking.js', 'js/receipt.js', 'js/main.js']
            .map((f) => readFileSync(join(process.cwd(), 'www', 'whitestone', f), 'utf8')).join('\n');
        const tasks = ['tasks/js/view.js', 'tasks/js/main.js'].map((f) => readFileSync(join(process.cwd(), 'www', 'whitestone', f), 'utf8')).join('\n');
        // Each `h('button', ...)` or `button(...)` has an id or a data-beacon
        // within its call; an id built from a template is named with a
        // sample record key in place of the template.
        // Realistic stand-ins for each template's value: a step's number, a
        // pick's or an action's own id, a floor, a kind of room, a bath, a
        // reason, and otherwise a record's random key.
        const STAND_IN = { i: '1', n: '1', 'o.id': 'chooseTime', 'b.id': 'start', 'a.id': 'addTask', 'f.key': 'main', 'ch.area': 'kitchen', 'c.area': 'office', 'k.key': 'shower', key: 'no-time', 'level.key': 'second', 'r.kind': 'room' };
        const sample = (id) => id.replace(/\$\{([^}]+)\}/g, (_, v) => STAND_IN[v] || 'x1y2z3w4');
        for (const [src, beaconOf] of [[sources, studioBeacon], [tasks, cleanerBeacon]]) {
            // A window on each call, enough for its id and class (a template's
            // own braces end any tidier pattern early).
            const built = [...src.matchAll(/h\('button', \{/g)].map((m) => src.slice(m.index, m.index + 260))
                // The shared button() helper itself (cards.js): its callers are swept below.
                .filter((w) => !w.startsWith("h('button', { type: 'button', className, onClick, attrs }"));
            expect(built.length).toBeGreaterThan(5);
            for (const body of built) {
                const id = (/id: [`'"]([^`'"]+)[`'"]/.exec(body) || [])[1] || '';
                const className = (/className: [`'"]([^`'"]+)[`'"]/.exec(body) || [])[1] || '';
                const named = beaconOf({ id: sample(id), className: className.replace(/\$\{[^}]+\}/g, '') });
                expect(`${id || className}: ${named === null ? 'unnamed' : 'named'}`).toBe(`${id || className}: named`);
            }
        }
        // The shared `button(label, className, onClick, attrs)` calls carry a data-beacon.
        // Each call, from its start to the next call (or 500 characters).
        const calls = [...sources.matchAll(/\bbutton\((UI\.\w+|cancelLabel|confirmLabel)/g)].map((m) => {
            const next = sources.indexOf('button(', m.index + 7);
            return sources.slice(m.index, Math.min(next < 0 ? Infinity : next, m.index + 500));
        });
        expect(calls.length).toBeGreaterThan(4);
        for (const call of calls) expect(`${call.trim().slice(0, 60)} ${call.includes('data-beacon')}`).toBe(`${call.trim().slice(0, 60)} true`);
    });
});

describe('the listener: one tap, one beacon', () => {
    const el = (tag, props = {}, parent = null) => ({
        tagName: tag, parentNode: parent, attrs: props.attrs || {}, ...props,
        getAttribute(k) { return this.attrs[k] ?? null; }
    });
    const doc = () => ({ listeners: [], addEventListener(type, fn) { this.listeners.push(fn); } });

    test('the control a tap landed in, through what it holds; a radio and a label are not one', () => {
        const btn = el('BUTTON', { id: 'host-start' });
        const svg = el('svg', {}, btn);
        const path = el('path', {}, svg);
        expect(controlOf(path)).toBe(btn);
        expect(controlOf(el('INPUT', { type: 'radio' }))).toBeNull();
        expect(controlOf(el('INPUT', { type: 'checkbox', id: 'host-floor-main' }))).not.toBeNull();
        expect(controlOf(el('LABEL', {}))).toBeNull();
        expect(controlOf(el('DIV', {}, el('BODY')))).toBeNull();
        expect(readControl(el('A', { id: 'explore-link', attrs: { href: '/' } }))).toEqual({ id: 'explore-link', className: '', href: '/', beacon: '' });
    });

    test('sent once, under the vocabulary\'s name; a link off the page sent so it survives the leaving', () => {
        const d = doc();
        const sent = [];
        const left = [];
        installBeacons(d, { beaconOf: studioBeacon, send: (a, p) => sent.push([a, p]), leave: (a, p) => left.push([a, p]) });
        const fire = (target) => d.listeners.forEach((fn) => fn({ target }));
        fire(el('SPAN', {}, el('BUTTON', { id: 'host-chip-kitchen' })));
        expect(sent).toEqual([['add-room', { kind: 'kitchen', outcome: 'via=maya' }]]);
        fire(el('A', { id: 'explore-link', attrs: { href: '/' } }));
        expect(left).toEqual([['explore', {}]]);
        // Skipped, disabled, unnamed, or not a control: nothing.
        fire(el('BUTTON', { id: 'booking-confirm' }));
        fire(el('BUTTON', { id: 'host-start', disabled: true }));
        fire(el('BUTTON', { id: 'mystery' }));
        fire(el('DIV', {}));
        fire(null);
        expect(sent).toHaveLength(1);
        expect(left).toHaveLength(1);
    });
});
