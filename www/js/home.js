// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * home.js - The directory page's two touches of motion: the spotlight's
 * slideshow, and a "New" badge on worlds released in the last month.
 *
 * THE SPOTLIGHT (#spotlight in index.html) shows the three newest worlds one
 * at a time. The markup already shows the first one, and the stylesheet hides
 * the other two, so without this script the page is simply complete with its
 * newest world in front. With it, the slides cross-fade every few seconds
 * with a slow pan and zoom, and this script adds the controls:
 *   - a pause button first (WCAG 2.2.2: anything that moves on its own for
 *     more than five seconds needs a way to stop it), then one dot per slide;
 *   - the slideshow holds while the pointer is over it or focus is inside it,
 *     so nothing slides out from under a reader or a keyboard;
 *   - it never starts by itself for a visitor who asks for reduced motion,
 *     and the dots still work;
 *   - it rests while the tab is hidden.
 * Slides out of view are `inert` and aria-hidden, so neither Tab nor a screen
 * reader lands on a slide nobody can see.
 *
 * THE BADGES come from each card's own <time datetime>, the same date the
 * card prints, so there is no second list of what is new to keep in step.
 *
 * A module, so the suite can import the pieces (tests/home-script.test.mjs).
 * It boots itself only where there is a document.
 */

export const NEW_FOR_DAYS = 30;
export const SLIDE_SECONDS = 7;

/** Whether a world released on `iso` (YYYY-MM-DD) is still new on `now`,
 *  counted in whole calendar days so it does not flicker with the time of day. */
export function isNew(iso, now = new Date(), days = NEW_FOR_DAYS) {
    const [y, m, d] = String(iso).split('-').map(Number);
    if (!y || !m || !d) return false;
    const released = Date.UTC(y, m - 1, d);
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const age = Math.round((today - released) / 86400000);
    return age >= 0 && age < days;
}

/** Put a "New" badge on every card and slide whose release date is recent.
 *  Safe to run twice. Returns how many it marked. */
export function markNewCards(doc, now = new Date()) {
    let marked = 0;
    const places = [
        ...doc.querySelectorAll('.experience-card'),
        ...doc.querySelectorAll('.spotlight-slide')
    ];
    for (const card of places) {
        const time = card.querySelector('time');
        if (!time || !isNew(time.getAttribute('datetime'), now)) continue;
        const host = card.querySelector('.spotlight-media') || card.querySelector('a');
        if (!host || host.querySelector('.badge-new')) continue;
        const badge = doc.createElement('span');
        badge.className = 'badge-new';
        badge.textContent = 'New';
        host.insertBefore(badge, host.firstChild);
        marked++;
    }
    return marked;
}

const PAUSE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5" width="3.6" height="14" rx="1"/><rect x="13.9" y="5" width="3.6" height="14" rx="1"/></svg>';
const PLAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z"/></svg>';

/**
 * Turn the spotlight into a slideshow. Returns its controller, or null when
 * there is nothing to rotate. `timers` and `doc` are seams for the suite.
 */
export function initSpotlight(section, {
    reducedMotion = false,
    seconds = SLIDE_SECONDS,
    doc = document,
    // WRAPPED, NOT PASSED BARE. `timers.clear(t)` calls its function with
    // `this` set to this object, and a browser's clearTimeout and setTimeout
    // refuse any `this` but the window ("Illegal invocation"). Node does not
    // care, so the suite passed while every visitor's console threw
    // (2026-10-01).
    timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (t) => clearTimeout(t) }
} = {}) {
    const slides = [...section.querySelectorAll('.spotlight-slide')];
    if (slides.length < 2) return null;

    const state = { index: 0, playing: !reducedMotion, held: false, away: false };
    let timer = null;

    const controls = doc.createElement('div');
    controls.className = 'spotlight-controls';
    const toggle = doc.createElement('button');
    toggle.type = 'button';
    toggle.className = 'spotlight-toggle';
    controls.appendChild(toggle);
    const dots = slides.map((slide, i) => {
        const dot = doc.createElement('button');
        dot.type = 'button';
        dot.className = 'spotlight-dot';
        const title = slide.querySelector('h3');
        dot.setAttribute('aria-label', `Show ${title ? title.textContent : `world ${i + 1}`}`);
        dot.addEventListener('click', () => {
            show(i);
            schedule();
        });
        controls.appendChild(dot);
        return dot;
    });
    section.appendChild(controls);
    section.classList.add('is-enhanced');

    function show(i) {
        state.index = ((i % slides.length) + slides.length) % slides.length;
        slides.forEach((slide, n) => {
            const on = n === state.index;
            slide.classList.toggle('is-active', on);
            if (on) {
                slide.removeAttribute('aria-hidden');
                slide.inert = false;
            } else {
                slide.setAttribute('aria-hidden', 'true');
                slide.inert = true;
            }
            if (on) dots[n].setAttribute('aria-current', 'true');
            else dots[n].removeAttribute('aria-current');
        });
    }

    function sync() {
        const moving = state.playing && !state.held && !state.away;
        section.classList.toggle('is-playing', moving);
        toggle.innerHTML = state.playing ? PAUSE_ICON : PLAY_ICON;
        toggle.setAttribute('aria-label', state.playing ? 'Pause the slideshow' : 'Play the slideshow');
    }

    function schedule() {
        timers.clear(timer);
        timer = null;
        sync();
        if (state.playing && !state.held && !state.away) {
            timer = timers.set(() => {
                show(state.index + 1);
                schedule();
            }, seconds * 1000);
        }
    }

    toggle.addEventListener('click', () => {
        state.playing = !state.playing;
        schedule();
    });
    section.addEventListener('pointerenter', () => { state.held = true; schedule(); });
    section.addEventListener('pointerleave', () => { state.held = false; schedule(); });
    section.addEventListener('focusin', () => { state.held = true; schedule(); });
    section.addEventListener('focusout', (event) => {
        if (event.relatedTarget && section.contains(event.relatedTarget)) return;
        state.held = false;
        schedule();
    });
    doc.addEventListener('visibilitychange', () => {
        state.away = doc.visibilityState === 'hidden';
        schedule();
    });

    show(0);
    schedule();
    return {
        state,
        next: () => { show(state.index + 1); schedule(); },
        show: (i) => { show(i); schedule(); }
    };
}

function boot() {
    markNewCards(document);
    const section = document.getElementById('spotlight');
    if (!section) return;
    const reducedMotion = Boolean(window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    initSpotlight(section, { reducedMotion });
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
}
