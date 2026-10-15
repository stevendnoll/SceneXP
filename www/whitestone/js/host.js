// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * host.js - Maya's speech bubble (ONBOARDING sections 3 and 9): her
 * portrait and name, the progress strip, what she says, the floors to tick
 * when she asks, at most two buttons, the small print, a quiet Back and
 * Start over, and a → by her name that takes her main step (`view.next`,
 * QA 2026-10-15: on a phone her buttons can sit below the fold).
 *
 * WHERE IT SITS: beside the house on a wide screen (the frame leaves the
 * right of the screen for it, turntable.js), a sheet along the bottom on a
 * phone (the frame keeps the house above it). It never covers the house,
 * and it steps out of sight while a card is open, so Maya never speaks over
 * one.
 *
 * WHAT IT SAYS IS SAID ONCE. Each new scene's line goes through the live
 * region, and the buttons are real buttons in the tab order. If nothing
 * happens for a while the main button pulses once, and later Maya says the
 * hint once more in other words. After that, nothing: a nag is worse than
 * silence. Any sign of the visitor (`poke`) starts the wait again.
 *
 * It draws what guide.js `viewFor` describes and calls back into main.js
 * for what a button or a floor does. No markup from strings: every word is
 * set as text.
 */

import { h, clear, announce } from './cards.min.js';
import { GUIDE } from './copy.min.js';

/**
 * Drive the bubble in index.html. `on.button(id)` is called for a button,
 * `on.floor(key, checked)` for a floor ticked or unticked. `timing` gives
 * the seconds before the pulse and before the hint is said again. Returns
 * { show, update, hide, setCovered, poke, title, shown, view }.
 */
export function createHost({ on = {}, timing = { pulse: 8, again: 20 }, signal } = {}) {
    const byId = (id) => document.getElementById(id);
    const root = byId('ws-host');
    const line = byId('host-line');
    const progress = byId('host-progress');
    const choices = byId('host-choices');
    const actions = byId('host-actions');
    const small = byId('host-small');
    const backBtn = byId('host-back');
    const resetBtn = byId('host-reset');
    const nextBtn = byId('host-next');
    const expand = byId('host-expand');
    const facts = byId('host-facts');
    let view = null;
    let covered = false;
    let said = false;
    /** The checklist's name field, while Maya asks for it. */
    let titleField = null;
    /** Where the bubble was last put beside Maya, as a key. */
    let anchored = '';
    const timers = [];

    const stopTimers = () => {
        while (timers.length) clearTimeout(timers.pop());
    };
    if (signal) signal.addEventListener('abort', stopTimers);
    if (backBtn) backBtn.addEventListener('click', () => { if (typeof on.button === 'function') on.button('back'); }, { signal });
    if (resetBtn) resetBtn.addEventListener('click', () => { if (typeof on.button === 'function') on.button('startOver'); }, { signal });
    if (nextBtn) nextBtn.addEventListener('click', () => { if (view && view.next && typeof on.button === 'function') on.button(view.next.id); }, { signal });
    if (expand) expand.addEventListener('click', () => { if (typeof on.button === 'function') on.button('expand'); }, { signal });

    function place() {
        if (root) root.hidden = covered || !view;
    }

    /** The pulse, then the hint in other words, each once. */
    function schedule() {
        stopTimers();
        if (!view) return;
        timers.push(setTimeout(() => {
            const primary = actions ? Array.from(actions.children || []).find((b) => b.classList && b.classList.contains('ws-btn-primary')) : null;
            if (primary && primary.classList) {
                primary.classList.add('is-nudge');
                timers.push(setTimeout(() => primary.classList.remove('is-nudge'), 1600));
            }
        }, timing.pulse * 1000));
        if (view.again && !said) {
            timers.push(setTimeout(() => {
                said = true;
                if (line) line.textContent = view.again;
                if (!covered) announce(view.again);
            }, timing.again * 1000));
        }
    }

    function drawProgress() {
        if (!progress) return;
        clear(progress);
        const at = view.progress;
        progress.hidden = at === null || at === undefined;
        if (progress.hidden) return;
        // A step reached so far, other than this one, is a button that goes
        // to it (QA, 2026-10-14); one not reached yet is only its name.
        const reached = view.reached ?? at;
        GUIDE.progress.forEach((name, i) => {
            const li = h('li', { className: `host-step${i < at ? ' is-done' : ''}${i === at ? ' is-now' : ''}${i > at && i <= reached ? ' is-reached' : ''}` });
            const closed = (view.closed || []).includes(i);
            if (closed) li.classList.add('is-closed');
            if (i !== at && i <= reached && !closed) {
                const go = h('button', { type: 'button', className: 'host-step-btn', id: `host-step-${i}`, text: name, attrs: { 'aria-label': GUIDE.goToStep(name), title: GUIDE.goToStep(name) } });
                go.addEventListener('click', () => { if (typeof on.step === 'function') on.step(i); }, { signal });
                li.appendChild(go);
            } else {
                li.textContent = name;
            }
            if (i === at) li.setAttribute('aria-current', 'step');
            progress.appendChild(li);
        });
        progress.setAttribute('aria-label', GUIDE.progressStep(at + 1, GUIDE.progress.length, GUIDE.progress[at]));
    }

    /** One of a few, when Maya asks (`{ kind: 'pick', legend, options }`,
     *  each option `{ id, label }`): a button each, in a labeled group, the
     *  answer moving the guide on. */
    function drawPick(c) {
        const buttons = c.options.map((o) => {
            // The answer already given, when Maya asks again, shown as chosen.
            const btn = h('button', {
                type: 'button', id: `host-${o.id}`, className: `ws-btn host-pick${o.on ? ' is-on' : ''}`, text: o.label,
                attrs: { 'aria-pressed': o.on ? 'true' : 'false' }
            });
            btn.addEventListener('click', () => {
                if (typeof on.button === 'function') on.button(o.id);
            }, { signal });
            return btn;
        });
        choices.appendChild(h('div', { className: 'host-picks', attrs: { role: 'group', 'aria-label': c.legend } }, buttons));
    }

    /** Rooms to add, as the panel's dashed chips (`{ kind: 'chips', legend,
     *  chips }`, each `{ area, level, label, aria }`): one tap adds it. */
    function drawChips(c) {
        const chips = c.chips.map((ch) => {
            const btn = h('button', { type: 'button', id: `host-chip-${ch.area}`, className: 'panel-chip', text: `+ ${ch.label}`, attrs: { 'aria-label': ch.aria, title: ch.aria } });
            btn.addEventListener('click', () => {
                if (typeof on.chip === 'function') on.chip(ch.area, ch.level);
            }, { signal });
            return btn;
        });
        choices.appendChild(h('div', { className: 'panel-chips host-room-chips', attrs: { role: 'group', 'aria-label': c.legend } }, [
            h('p', { className: 'panel-chips-heading', text: c.legend }), ...chips
        ]));
    }

    /** The floors to tick, and the checklist's name, or one of a few, when
     *  Maya asks. */
    function drawChoices() {
        if (!choices) return;
        clear(choices);
        titleField = null;
        const c = view.choices;
        choices.hidden = !c;
        if (c && c.kind === 'pick') {
            drawPick(c);
            return;
        }
        if (c && c.kind === 'chips') {
            if (c.chips.length) drawChips(c);
            else choices.hidden = true;
            return;
        }
        if (!c || c.kind !== 'floors') return;
        const boxes = c.levels.map((level) => {
            const input = h('input', { type: 'checkbox', value: level.key, checked: Boolean(level.on), id: `host-floor-${level.key}` });
            // The main floor: every home has one, so it is ticked for good.
            if (level.locked) {
                input.disabled = true;
                input.setAttribute('aria-describedby', 'host-floors-note');
            }
            input.addEventListener('change', () => {
                if (typeof on.floor === 'function') on.floor(level.key, Boolean(input.checked));
            }, { signal });
            return h('label', { className: 'host-chip', attrs: { for: `host-floor-${level.key}` } }, [input, h('span', { text: level.name })]);
        });
        const note = c.levels.some((l) => l.locked) ? h('p', { className: 'host-floors-note', id: 'host-floors-note', text: GUIDE.mainAlways }) : null;
        choices.appendChild(h('fieldset', { className: 'host-floors' }, [h('legend', { text: GUIDE.floorsLegend }), ...boxes, note]));
        titleField = h('input', { type: 'text', id: 'host-title', className: 'host-title', value: c.title || '', attrs: { maxlength: String(c.maxTitle || 80), autocomplete: 'off' } });
        choices.appendChild(h('label', { className: 'host-title-label', attrs: { for: 'host-title' } }, [h('span', { text: GUIDE.titleLabel }), titleField]));
    }

    /** The home at a glance (`view.facts`, each `{ key, label, value,
     *  note, spoken }`): its quote and its visit, small, under her name,
     *  each a button (`on.fact(key)`: the breakdown, the receipt). */
    function drawFacts() {
        if (!facts) return;
        clear(facts);
        const list = view.facts || [];
        facts.hidden = !list.length;
        for (const f of list) {
            const parts = [h('span', { className: 'host-fact-label', text: f.label }), h('span', { className: 'host-fact-value', text: f.value })];
            if (f.note) parts.push(h('span', { className: 'host-fact-note', text: f.note }));
            const btn = h('button', {
                type: 'button', id: `host-fact-${f.key}`, className: `host-fact host-fact-${f.key}`,
                attrs: f.spoken ? { 'aria-label': f.spoken, title: f.spoken } : {}
            }, parts);
            btn.addEventListener('click', () => {
                if (typeof on.fact === 'function') on.fact(f.key);
            }, { signal });
            facts.appendChild(btn);
        }
    }

    function drawActions() {
        if (!actions) return;
        clear(actions);
        for (const b of view.buttons || []) {
            const btn = h('button', {
                type: 'button',
                id: `host-${b.id}`,
                className: b.primary ? 'ws-btn ws-btn-primary' : 'ws-btn',
                text: b.label
            });
            btn.addEventListener('click', () => {
                if (typeof on.button === 'function') on.button(b.id);
            }, { signal });
            actions.appendChild(btn);
        }
    }

    function draw() {
        // Tucked away (standing by): only her portrait and Need a hand?
        const tucked = Boolean(view.minimized);
        if (root && root.classList) root.classList.toggle('is-minimized', tucked);
        if (expand) expand.hidden = !tucked;
        if (line) line.textContent = view.text;
        drawFacts();
        drawProgress();
        drawChoices();
        drawActions();
        if (small) {
            small.textContent = view.small || '';
            small.hidden = !view.small;
        }
        if (backBtn) {
            backBtn.hidden = !view.stepBack;
            // Where it goes, on hover (QA, 2026-10-15).
            if (view.backTo) backBtn.setAttribute('title', view.backTo);
        }
        if (resetBtn) resetBtn.hidden = !view.startOver;
        if (nextBtn) {
            const next = view.minimized ? null : view.next;
            nextBtn.hidden = !next;
            if (next) {
                // Named for the step it takes, aloud and on hover (QA, 2026-10-15).
                nextBtn.setAttribute('aria-label', GUIDE.continueTo(next.label));
                nextBtn.setAttribute('title', GUIDE.continueTo(next.label));
            }
        }
    }

    const api = {
        /** A new scene: drawn, said once, and the wait for a nudge begun.
         *  Null puts the bubble away. */
        show(next) {
            view = next;
            said = false;
            stopTimers();
            if (view) {
                draw();
                // Tucked away, she is not saying anything, so nothing is said
                // aloud (nor is there a main button to pulse or a line to
                // say again).
                if (!covered && !view.minimized) announce(view.text);
                schedule();
            }
            place();
        },
        /** The same scene with something changed (a floor ticked): drawn
         *  again, said again only if its words changed. */
        update(next) {
            if (!next) return api.show(null);
            const changed = (!view || next.text !== view.text) && !next.minimized;
            const title = api.title();
            view = next;
            draw();
            // A name being typed is kept as typed.
            if (titleField && title !== null) titleField.value = title;
            if (changed && !covered) announce(view.text);
            place();
            return undefined;
        },
        hide() {
            api.show(null);
        },
        /** Out of sight while a card is open, back when it closes. */
        setCovered(on) {
            if (covered === Boolean(on)) return;
            covered = Boolean(on);
            place();
        },
        /** A button she drew (a fact, a choice, a chip, an action) by its id, for
         *  its halo; null when there is none. */
        nodeOf(id) {
            for (const box of [facts, choices, actions]) {
                const stack = box ? [box] : [];
                while (stack.length) {
                    const n = stack.pop();
                    if (n !== box && n.id === id) return n;
                    for (const child of Array.from(n.children || [])) stack.push(child);
                }
            }
            return null;
        },
        /** Focus on the main button of what she says (Let's start, Next),
         *  else her first, else her first choice (back from a card): where a
         *  keyboard picks up after Start over. */
        focusPrimary() {
            const all = actions ? Array.from(actions.children || []) : [];
            const picks = choices && !choices.hidden && choices.children && choices.children[0] ? Array.from(choices.children[0].children || []) : [];
            const btn = all.find((b) => b.classList && b.classList.contains('ws-btn-primary')) || all[0] || picks.find((b) => b.classList && b.classList.contains('host-pick'));
            if (btn && typeof btn.focus === 'function') btn.focus();
            return btn || null;
        },
        /** Her next step pulses now, once (a tap on the house before it
         *  answers taps): the main button, else her first button, else her
         *  first choice, as focusPrimary finds them, without moving focus.
         *  Returns the button, or null. */
        nudge() {
            if (!view || covered) return null;
            const all = actions ? Array.from(actions.children || []) : [];
            const picks = choices && !choices.hidden && choices.children && choices.children[0] ? Array.from(choices.children[0].children || []) : [];
            const btn = all.find((b) => b.classList && b.classList.contains('ws-btn-primary')) || all[0] || picks.find((b) => b.classList && b.classList.contains('host-pick'));
            if (!btn || !btn.classList) return null;
            btn.classList.remove('is-nudge');
            // Read a layout value so the animation starts again on a repeat tap.
            void btn.offsetWidth;
            btn.classList.add('is-nudge');
            timers.push(setTimeout(() => btn.classList.remove('is-nudge'), 1600));
            return btn;
        },
        /** The visitor did something: the wait for a nudge starts again. */
        poke() {
            if (view) schedule();
        },
        /** The name typed for the checklist, or null when it is not asked. */
        title() {
            return titleField && view && view.choices ? String(titleField.value || '') : null;
        },
        /**
         * Beside Maya's head (`x`, `y` in pixels on a `w` by `h` screen),
         * where there is room for the bubble to the right of her; null, or
         * no room, puts it back in its own place.
         */
        anchor(x, y, w, h) {
            if (!root || !root.style) return false;
            const width = root.offsetWidth || 340;
            const height = root.offsetHeight || 260;
            const ok = x != null && Number.isFinite(x) && Number.isFinite(y) && x + 18 + width <= w - 16;
            const left = ok ? Math.round(x + 18) : 0;
            const top = ok ? Math.round(Math.min(Math.max(y - 28, 76), h - height - 16)) : 0;
            const key = ok ? `${left},${top}` : '';
            if (key === anchored) return ok;
            anchored = key;
            if (root.classList) root.classList.toggle('is-anchored', ok);
            root.style.left = ok ? `${left}px` : '';
            root.style.top = ok ? `${top}px` : '';
            return ok;
        },
        /** Maya's face, drawn by cast.js, in place of her initial. */
        setPortrait(canvas) {
            const spot = root && root.querySelector ? root.querySelector('.host-portrait') : null;
            if (!spot || !canvas) return false;
            clear(spot);
            if (canvas.classList) canvas.classList.add('host-face');
            spot.appendChild(canvas);
            return true;
        },
        get anchored() {
            return anchored;
        },
        /** The checklist's name field, while Maya asks for it. */
        get titleField() {
            return titleField;
        },
        get shown() {
            return Boolean(view) && !covered;
        },
        get view() {
            return view;
        }
    };
    return api;
}
