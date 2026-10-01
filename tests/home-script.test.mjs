// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * www/js/home.js: the spotlight slideshow and the "New" badges on the home
 * page.
 *
 * The rules that matter are the ones a visitor cannot ask for twice: a
 * slideshow that moves must stop when asked (WCAG 2.2.2), must not slide out
 * from under a reader or a keyboard, must never start by itself for somebody
 * who asked for reduced motion, and must keep the slides nobody can see out of
 * the tab order and the screen reader. A small fake DOM stands in for the page,
 * with the slideshow's timer handed in so time is stepped by hand.
 */
import { jest } from '@jest/globals';
import { NEW_FOR_DAYS, SLIDE_SECONDS, isNew, markNewCards, initSpotlight } from '../www/js/home.js';

// ---- A small DOM ------------------------------------------------------------

function el(tag, { className = '', text = '', attrs = {} } = {}) {
    const node = {
        tagName: tag.toUpperCase(),
        className,
        textContent: text,
        innerHTML: '',
        children: [],
        parent: null,
        attrs: { ...attrs },
        listeners: {},
        inert: false,
        get classList() {
            const node_ = this;
            const list = () => node_.className.split(/\s+/).filter(Boolean);
            return {
                contains: (c) => list().includes(c),
                add: (c) => { if (!list().includes(c)) node_.className = [...list(), c].join(' '); },
                remove: (c) => { node_.className = list().filter((x) => x !== c).join(' '); },
                toggle(c, on) {
                    const want = on === undefined ? !this.contains(c) : on;
                    if (want) this.add(c); else this.remove(c);
                    return want;
                }
            };
        },
        get firstChild() { return this.children[0] || null; },
        appendChild(child) { child.parent = this; this.children.push(child); return child; },
        insertBefore(child, ref) {
            child.parent = this;
            const i = ref ? this.children.indexOf(ref) : -1;
            if (i < 0) this.children.push(child); else this.children.splice(i, 0, child);
            return child;
        },
        setAttribute(k, v) { this.attrs[k] = String(v); },
        getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
        removeAttribute(k) { delete this.attrs[k]; },
        addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
        fire(type, event = {}) { (this.listeners[type] || []).forEach((fn) => fn({ type, ...event })); },
        click() { this.fire('click'); },
        contains(other) {
            for (let n = other; n; n = n.parent) if (n === this) return true;
            return false;
        },
        querySelectorAll(sel) {
            const out = [];
            const match = (n) => (sel.startsWith('.') ? n.classList.contains(sel.slice(1)) : n.tagName === sel.toUpperCase());
            const walk = (n) => n.children.forEach((c) => { if (match(c)) out.push(c); walk(c); });
            walk(this);
            return out;
        },
        querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    };
    return node;
}

function makeDoc() {
    const root = el('html');
    return {
        root,
        visibilityState: 'visible',
        listeners: {},
        createElement: (tag) => el(tag),
        querySelectorAll: (sel) => root.querySelectorAll(sel),
        addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
        fire(type) { (this.listeners[type] || []).forEach((fn) => fn({ type })); }
    };
}

/** A spotlight of three slides, the way index.html writes it. */
function makeSpotlight(doc) {
    const section = doc.root.appendChild(el('section', { className: 'spotlight' }));
    const list = section.appendChild(el('ul', { className: 'spotlight-slides' }));
    const slides = ['Corner Office', 'Tornado Alley', "X's and O's"].map((title, i) => {
        const li = list.appendChild(el('li', { className: `spotlight-slide${i === 0 ? ' is-active' : ''}` }));
        const a = li.appendChild(el('a'));
        a.appendChild(el('div', { className: 'spotlight-media' }));
        const body = a.appendChild(el('div', { className: 'spotlight-body' }));
        body.appendChild(el('time', { attrs: { datetime: ['2026-09-28', '2026-09-23', '2026-09-14'][i] } }));
        body.appendChild(el('h3', { text: title }));
        return li;
    });
    return { section, slides };
}

/** A timer the test steps by hand. */
function makeTimers() {
    let pending = null;
    return {
        set(fn, ms) { pending = { fn, ms }; return pending; },
        clear(t) { if (t === pending) pending = null; },
        get pending() { return pending; },
        fire() { const p = pending; pending = null; if (p) p.fn(); }
    };
}

const active = (slides) => slides.findIndex((s) => s.classList.contains('is-active'));

// ---- New ------------------------------------------------------------------

describe('what counts as new', () => {
    const on = (iso) => new Date(`${iso}T12:00:00`);

    test(`a world is new for ${NEW_FOR_DAYS} days from its release, counted in calendar days`, () => {
        expect(isNew('2026-09-28', on('2026-09-28'))).toBe(true);
        expect(isNew('2026-09-02', on('2026-10-01'))).toBe(true);    // day 29
        expect(isNew('2026-09-01', on('2026-10-01'))).toBe(false);   // day 30
        // Late at night or early in the morning, the answer is the same.
        expect(isNew('2026-09-02', new Date('2026-10-01T23:59:00'))).toBe(true);
        expect(isNew('2026-09-02', new Date('2026-10-01T00:01:00'))).toBe(true);
    });

    test('a date in the future, or no date at all, is not new', () => {
        expect(isNew('2026-10-05', on('2026-10-01'))).toBe(false);
        expect(isNew('', on('2026-10-01'))).toBe(false);
        expect(isNew(null, on('2026-10-01'))).toBe(false);
    });

    test('badges go on the recent cards and slides, once each', () => {
        const doc = makeDoc();
        const grid = doc.root.appendChild(el('ul'));
        const card = (iso) => {
            const li = grid.appendChild(el('li', { className: 'experience-card' }));
            const a = li.appendChild(el('a'));
            a.appendChild(el('time', { attrs: { datetime: iso } }));
            return li;
        };
        const fresh = card('2026-09-28');
        const old = card('2026-07-06');
        const { slides } = makeSpotlight(doc);
        const now = new Date('2026-10-01T12:00:00');
        expect(markNewCards(doc, now)).toBe(4);   // one card, three slides
        expect(markNewCards(doc, now)).toBe(0);   // and never twice
        expect(fresh.querySelector('.badge-new').textContent).toBe('New');
        expect(old.querySelector('.badge-new')).toBeNull();
        // On a slide the badge sits on the picture.
        expect(slides[0].querySelector('.spotlight-media').firstChild.className).toBe('badge-new');
    });
});

// ---- The slideshow ----------------------------------------------------------

describe('the spotlight', () => {
    test('it moves on by itself, wrapping round, one slide every few seconds', () => {
        const doc = makeDoc();
        const timers = makeTimers();
        const { section, slides } = makeSpotlight(doc);
        initSpotlight(section, { doc, timers });
        expect(section.classList.contains('is-playing')).toBe(true);
        expect(timers.pending.ms).toBe(SLIDE_SECONDS * 1000);
        expect(active(slides)).toBe(0);
        timers.fire();
        expect(active(slides)).toBe(1);
        timers.fire();
        timers.fire();
        expect(active(slides)).toBe(0);
    });

    test('only the slide in view can be reached by Tab or a screen reader', () => {
        const doc = makeDoc();
        const timers = makeTimers();
        const { section, slides } = makeSpotlight(doc);
        initSpotlight(section, { doc, timers });
        timers.fire();
        expect(slides.map((s) => s.inert)).toEqual([true, false, true]);
        expect(slides.map((s) => s.getAttribute('aria-hidden'))).toEqual(['true', null, 'true']);
    });

    test('the controls are a pause button first, then a dot per world, named for it', () => {
        const doc = makeDoc();
        const { section } = makeSpotlight(doc);
        initSpotlight(section, { doc, timers: makeTimers() });
        const controls = section.querySelector('.spotlight-controls');
        const [toggle, ...dots] = controls.children;
        expect(toggle.className).toBe('spotlight-toggle');
        expect(toggle.getAttribute('aria-label')).toBe('Pause the slideshow');
        expect(dots.map((d) => d.getAttribute('aria-label')))
            .toEqual(['Show Corner Office', 'Show Tornado Alley', "Show X's and O's"]);
        expect(dots.map((d) => d.getAttribute('aria-current'))).toEqual(['true', null, null]);
        expect(section.classList.contains('is-enhanced')).toBe(true);
    });

    test('pause stops it where it is, and play starts it again', () => {
        const doc = makeDoc();
        const timers = makeTimers();
        const { section, slides } = makeSpotlight(doc);
        initSpotlight(section, { doc, timers });
        const toggle = section.querySelector('.spotlight-toggle');
        toggle.click();
        expect(timers.pending).toBeNull();
        expect(section.classList.contains('is-playing')).toBe(false);
        expect(toggle.getAttribute('aria-label')).toBe('Play the slideshow');
        expect(active(slides)).toBe(0);
        toggle.click();
        expect(timers.pending).not.toBeNull();
    });

    test('a dot shows its world and the clock starts over', () => {
        const doc = makeDoc();
        const timers = makeTimers();
        const { section, slides } = makeSpotlight(doc);
        initSpotlight(section, { doc, timers });
        const dots = section.querySelectorAll('.spotlight-dot');
        const before = timers.pending;
        dots[2].click();
        expect(active(slides)).toBe(2);
        expect(timers.pending).not.toBe(before);
    });

    test('it holds while the pointer is over it or focus is inside it', () => {
        const doc = makeDoc();
        const timers = makeTimers();
        const { section, slides } = makeSpotlight(doc);
        initSpotlight(section, { doc, timers });
        section.fire('pointerenter');
        expect(timers.pending).toBeNull();
        section.fire('pointerleave');
        expect(timers.pending).not.toBeNull();

        section.fire('focusin');
        expect(timers.pending).toBeNull();
        // Focus moving between its own controls is still inside it.
        section.fire('focusout', { relatedTarget: section.querySelector('.spotlight-dot') });
        expect(timers.pending).toBeNull();
        section.fire('focusout', { relatedTarget: null });
        expect(timers.pending).not.toBeNull();
        expect(active(slides)).toBe(0);
    });

    test('it rests while the tab is hidden', () => {
        const doc = makeDoc();
        const timers = makeTimers();
        const { section } = makeSpotlight(doc);
        initSpotlight(section, { doc, timers });
        doc.visibilityState = 'hidden';
        doc.fire('visibilitychange');
        expect(timers.pending).toBeNull();
        doc.visibilityState = 'visible';
        doc.fire('visibilitychange');
        expect(timers.pending).not.toBeNull();
    });

    test('for reduced motion it never starts by itself, and the dots still work', () => {
        const doc = makeDoc();
        const timers = makeTimers();
        const { section, slides } = makeSpotlight(doc);
        initSpotlight(section, { doc, timers, reducedMotion: true });
        expect(timers.pending).toBeNull();
        expect(section.classList.contains('is-playing')).toBe(false);
        expect(section.querySelector('.spotlight-toggle').getAttribute('aria-label')).toBe('Play the slideshow');
        section.querySelectorAll('.spotlight-dot')[1].click();
        expect(active(slides)).toBe(1);
        expect(timers.pending).toBeNull();
    });

    test('its controller steps and jumps the same way the dots do', () => {
        const doc = makeDoc();
        const timers = makeTimers();
        const { section, slides } = makeSpotlight(doc);
        const spot = initSpotlight(section, { doc, timers });
        spot.next();
        expect(active(slides)).toBe(1);
        spot.show(-1);
        expect(active(slides)).toBe(2);
        expect(spot.state.index).toBe(2);
    });

    test('a single slide is left alone', () => {
        const doc = makeDoc();
        const section = doc.root.appendChild(el('section'));
        section.appendChild(el('li', { className: 'spotlight-slide is-active' }));
        expect(initSpotlight(section, { doc, timers: makeTimers() })).toBeNull();
        expect(section.children).toHaveLength(1);
    });
});

// ---- On the page ------------------------------------------------------------

describe('on the page', () => {
    afterEach(() => {
        delete globalThis.document;
        delete globalThis.window;
        jest.useRealTimers();
    });

    async function bootWith({ readyState = 'complete', reduce = false } = {}) {
        jest.useFakeTimers();
        // AS STRICT AS A BROWSER. A browser's setTimeout and clearTimeout throw
        // "Illegal invocation" for any `this` but the global object, and Node's
        // do not, so the page's own timers once called them as methods of a
        // plain object and threw in every visitor's console while this suite
        // passed (2026-10-01).
        for (const name of ['setTimeout', 'clearTimeout']) {
            const real = globalThis[name];
            globalThis[name] = function strict(...args) {
                if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
                return real(...args);
            };
        }
        const doc = makeDoc();
        const { section, slides } = makeSpotlight(doc);
        doc.readyState = readyState;
        doc.getElementById = (id) => (id === 'spotlight' ? section : null);
        globalThis.document = doc;
        globalThis.window = { matchMedia: () => ({ matches: reduce }) };
        await jest.isolateModulesAsync(async () => {
            await import('../www/js/home.js');
        });
        return { doc, section, slides };
    }

    test('it boots itself: badges on, slideshow running', async () => {
        const { section, slides } = await bootWith();
        expect(section.classList.contains('is-playing')).toBe(true);
        expect(slides[0].querySelector('.spotlight-media').firstChild).toBeTruthy();
        jest.advanceTimersByTime(SLIDE_SECONDS * 1000);
        expect(active(slides)).toBe(1);
    });

    test('a page still loading boots on DOMContentLoaded, and reduced motion holds it still', async () => {
        const { doc, section } = await bootWith({ readyState: 'loading', reduce: true });
        expect(section.classList.contains('is-enhanced')).toBe(false);
        doc.fire('DOMContentLoaded');
        expect(section.classList.contains('is-enhanced')).toBe(true);
        expect(section.classList.contains('is-playing')).toBe(false);
    });
});
