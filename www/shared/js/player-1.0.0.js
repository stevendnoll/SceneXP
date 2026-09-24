// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * player-1.0.0.js - the player for a timed story.
 *
 * A TIMED STORY is a scene that runs on one clock from a beginning to an
 * ending: High Water's sixty seconds at the water's edge was the first, and
 * Tornado Alley is the second. What they share is everything around the
 * picture, and this part is that:
 *
 *   - a welcome card that holds the story at zero until the visitor presses
 *     Begin (the scene keeps drawing behind it, so the card sits over a living
 *     frame rather than a still one)
 *   - a pause button, Escape, and a pause card, which is the welcome card
 *     again with Resume and Restart and a "Paused at 0:24" line, so one copy
 *     of any content warning can never drift from another
 *   - a scrubber that seeks, with arrow keys that move five seconds a press
 *   - controls that fade out when the pointer is still, the way a video's do
 *   - a fade to black over the last seconds, then an ending card with a way to
 *     watch again
 *   - the usage events: begin-watching, reached-<stage>, pause, resume, seek,
 *     restart, replay, arc-complete
 *
 * The scene supplies the picture. `frame(delta, arc, info)` is called every
 * animation frame the story is running (and behind the welcome card), and a
 * handful of optional hooks tell it when the clock jumps. The scene never
 * touches the cards, the controls or the clock.
 *
 * EXTRACTED FROM www/highwater ON 2026-09-23, where the same rules were
 * written for one scene and QA'd by Steve the same day. High Water still
 * carries its own copy (js/controls.js and the "player controls" section of
 * its main.js). Moving it onto this part is a separate change with its own QA
 * pass, and until then the two copies must be edited together.
 *
 * THE MARKUP. Every element is found by id and every one is optional, so a
 * page can drop a control and the rest still works. The ids are prefixed
 * `player-` so they cannot collide with the shared stylesheet's own ids, and
 * `shared/css/player-1.0.0.css` styles exactly these. See PLAYER_IDS.
 *
 * THE RULES ARE PURE and exported, the same split High Water used, so every
 * decision can be tested without a DOM. `createPlayer` is only the wiring.
 */

/** The element ids the player looks for. Override any with `options.ids`. */
export const PLAYER_IDS = Object.freeze({
    card: 'player-card',
    begin: 'player-begin',
    pauseActions: 'player-pause-actions',
    resume: 'player-resume',
    restart: 'player-restart',
    pausedAt: 'player-paused-at',
    controls: 'player-controls',
    pause: 'player-pause',
    scrubber: 'player-scrubber',
    scrub: 'player-scrub',
    blackout: 'player-blackout',
    ending: 'player-ending',
    replay: 'player-replay'
});

/** The defaults, each one High Water's QA'd value. */
export const PLAYER_DEFAULTS = Object.freeze({
    // The length of the story in seconds.
    seconds: 60,
    // The fade to black over the last seconds. 0 cuts straight to the ending.
    fadeSeconds: 3,
    // How long the pointer must sit still before the controls fade. Three
    // seconds is the video-player convention.
    idleSeconds: 3,
    // Arrow keys on the scrubber, and Page Up and Page Down.
    stepSeconds: 5,
    pageSeconds: 15,
    // A seek never lands closer to the end than this, so dragging to the far
    // right plays the last instant of the fade instead of cutting to the
    // ending card while the pointer is still down.
    endGuardSeconds: 0.25,
    // THE PHOTOSENSITIVITY GUARD. A drag moves the story clock far faster than
    // real time, so anything that flashes on that clock (lightning) could
    // flash faster than a welcome card promises. `flashAllowed()` is false for
    // the whole drag and for this long after any seek.
    flashHoldSeconds: 1,
    // A seek is reported once it settles, so ten arrow presses or one long
    // drag leave one event.
    seekReportSeconds: 0.8,
    // The most story a single frame may advance, so a stalled frame cannot
    // jump the story.
    maxDeltaSeconds: 0.25,
    // How long the card's fade lasts before it leaves the layout. Matches the
    // transition in player-1.0.0.css.
    cardFadeMs: 700,
    // Set on <body> while the controls are faded, so the stylesheet can hide
    // the cursor over the canvas.
    idleBodyClass: 'player-idle'
});

// ---------------------------------------------------------------------------
// The rules
// ---------------------------------------------------------------------------

/** What Escape should do: 'pause', 'resume', or null for nothing.
 *
 *  A TOGGLE, BECAUSE ESCAPE IS WHAT CLOSES THINGS. Once the pause card is up,
 *  Escape dismisses it. Before Begin and after the ending there is no story
 *  to pause: the welcome card is not dismissible by design, and the ending has
 *  nothing behind it to go back to. */
export function escapeAction({ begun, finished, paused }) {
    if (!begun || finished) return null;
    return paused ? 'resume' : 'pause';
}

/** Whether a key press belongs to whatever has focus rather than to the page.
 *  A range input is deliberately not editable: pausing from the scrubber is
 *  exactly right. */
export function isEditable(target) {
    if (!target) return false;
    if (target.isContentEditable) return true;
    const tag = String(target.tagName || '').toLowerCase();
    if (tag === 'textarea' || tag === 'select') return true;
    if (tag !== 'input') return false;
    const type = String(target.type || 'text').toLowerCase();
    return !['range', 'button', 'checkbox', 'radio', 'submit', 'reset'].includes(type);
}

/** The story second a seek lands on, from a raw slider value. */
export function seekTarget(value, { seconds, endGuardSeconds } = PLAYER_DEFAULTS) {
    const end = seconds - endGuardSeconds;
    const at = Number(value);
    if (!Number.isFinite(at)) return 0;
    return Math.min(end, Math.max(0, at));
}

/** Where a key on the scrubber moves the story, or null to leave the key
 *  alone. Handled here because the slider runs in tenths of a second for a
 *  smooth drag, and a native arrow press would move it by a tenth. */
export function keySeekTarget(key, current, options = PLAYER_DEFAULTS) {
    const at = Number.isFinite(current) ? current : 0;
    switch (key) {
    case 'ArrowRight':
    case 'ArrowUp':
        return seekTarget(at + options.stepSeconds, options);
    case 'ArrowLeft':
    case 'ArrowDown':
        return seekTarget(at - options.stepSeconds, options);
    case 'PageUp':
        return seekTarget(at + options.pageSeconds, options);
    case 'PageDown':
        return seekTarget(at - options.pageSeconds, options);
    case 'Home':
        return 0;
    case 'End':
        return seekTarget(options.seconds, options);
    default:
        return null;
    }
}

/** "0:24". Whole seconds, rounded down, so it never claims a second the story
 *  has not reached. */
export function clockLabel(seconds) {
    const s = Math.max(0, Math.floor(Number(seconds) || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** What a screen reader hears for the scrubber, "24 seconds of 60". Words,
 *  because "0:24" is read aloud as "zero colon twenty four". */
export function valueText(seconds, total) {
    const s = Math.max(0, Math.floor(Number(seconds) || 0));
    return `${s} ${s === 1 ? 'second' : 'seconds'} of ${Math.round(total)}`;
}

/** How far through the story, as a CSS percentage for the track's fill. */
export function progressPercent(seconds, total) {
    const p = Math.min(1, Math.max(0, (Number(seconds) || 0) / total));
    return `${(p * 100).toFixed(2)}%`;
}

/** Whether the controls may fade. Never with keyboard focus inside them:
 *  fading the focused element takes its focus ring with it. */
export function mayIdle({ scrubbing, hovering, keyboardFocus }) {
    return !scrubbing && !hovering && !keyboardFocus;
}

/** Whether anything that flashes may run this frame. */
export function flashAllowed({ scrubbing, holdSeconds }) {
    return !scrubbing && !(holdSeconds > 0);
}

/** The closing fade at story second `arc`, 0 to 1. */
export function fadeAt(arc, { seconds, fadeSeconds } = PLAYER_DEFAULTS) {
    if (!(fadeSeconds > 0)) return arc >= seconds ? 1 : 0;
    return Math.min(1, Math.max(0, (arc - (seconds - fadeSeconds)) / fadeSeconds));
}

/** Which stage `seconds` falls in, as an index into `stages` ([{ at, name }],
 *  in order). */
export function stageIndexAt(seconds, stages) {
    let index = 0;
    for (let i = 0; i < stages.length; i++) if (seconds >= stages[i].at) index = i;
    return index;
}

/** The stage newly reached at `seconds`, or -1 for nothing to report.
 *
 *  THE IDEMPOTENCE IS THE WHOLE THING. This runs every frame, so returning a
 *  stage rather than a CHANGE of stage would send sixty events a second. At
 *  most one index per call, so a jump in the clock leaves one mark. */
export function nextStageIndex(seconds, reached, stages) {
    const index = stageIndexAt(seconds, stages);
    return index > reached ? index : -1;
}

/** Whether a page is being served locally, which is where QA console hooks
 *  belong and the only place a scene should install them. */
export function isLocalHost(location = (typeof window !== 'undefined' ? window.location : null)) {
    if (!location) return false;
    const { hostname } = location;
    return hostname === 'localhost' || hostname === '127.0.0.1'
        || hostname === '[::1]' || hostname === '';
}

// ---------------------------------------------------------------------------
// The wiring
// ---------------------------------------------------------------------------

/**
 * Build a player. Nothing touches the page until `install()`.
 *
 * options (every PLAYER_DEFAULTS key may be overridden, plus):
 *   stages        [{ at, name }] for the reached-<name> events. The first
 *                 stage is never reported: it is the same moment as Begin.
 *   frame(delta, arc, info)
 *                 draw one frame. info is { begun, scrubbing, fade }.
 *   redraw()      draw the current frame once more, for a paused story whose
 *                 canvas was cleared by a resize or a background tab.
 *   onSeek(arc)   the clock has jumped (a landed seek). Resync anything that
 *                 is not a pure function of the story clock.
 *   onRewind()    back to zero for a replay or a restart.
 *   onScrubStart()
 *                 a drag has begun. Put out anything mid-flash.
 *   track(name, params)
 *                 the usage counter. Defaults to nothing.
 *   reducedMotion whether the visitor asked for less motion, reported once
 *                 on begin-watching.
 *   ids           element id overrides, see PLAYER_IDS.
 */
export function createPlayer(options = {}) {
    const opts = { ...PLAYER_DEFAULTS, ...options };
    const ids = { ...PLAYER_IDS, ...(options.ids || {}) };
    const stages = opts.stages || [{ at: 0, name: 'start' }];
    const track = opts.track || (() => {});
    const frameFn = opts.frame || (() => {});

    const st = {
        running: false,
        begun: false,
        paused: false,
        finished: false,
        arc: 0,
        lastTime: 0
    };
    const ui = {
        scrubbing: false,
        hoverPause: false,
        hoverScrub: false,
        ending: false,
        idleTimer: 0,
        cardTimer: 0,
        flashHold: 0,
        dragFrom: 0,
        lastWhole: -1,
        seekFrom: null,
        seekTo: 0,
        seekTimer: 0,
        scrubbed: false
    };
    let rafId = 0;
    let watch = 0;
    let runs = 0;
    let stageReached = 0;
    const el = {};

    // ---- Drawing -------------------------------------------------------------

    function loop(now) {
        if (!st.running) return;
        rafId = requestAnimationFrame(loop);
        const seconds = now / 1000;
        const delta = st.lastTime ? seconds - st.lastTime : 0;
        st.lastTime = seconds;
        ui.flashHold = Math.max(0, ui.flashHold - Math.max(0, delta));
        if (st.begun && !ui.scrubbing) {
            st.arc = Math.min(opts.seconds,
                st.arc + Math.max(0, Math.min(opts.maxDeltaSeconds, delta)));
            paintScrubber();
            reportStage();
        }
        const fade = st.begun ? fadeAt(st.arc, opts) : 0;
        frameFn(delta, st.arc, { begun: st.begun, scrubbing: ui.scrubbing, fade });
        if (el.blackout) el.blackout.style.opacity = fade.toFixed(3);

        // The controls step aside for the fade, and do not come back on a
        // mere pointer move until the next watch.
        const ending = fade > 0;
        if (ending !== ui.ending) {
            ui.ending = ending;
            if (ending) idleControls();
        }
        if (st.begun && st.arc >= opts.seconds && fade >= 1) finish();
    }

    function start() {
        if (st.running || st.finished) return;
        st.running = true;
        rafId = requestAnimationFrame(loop);
    }

    function stop() {
        st.running = false;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = 0;
    }

    /** One frame for a story that is paused, on the next animation frame so
     *  the scene's own resize handling has run first. */
    function redrawSoon() {
        if (!opts.redraw) return;
        requestAnimationFrame(() => { if (st.paused) opts.redraw(); });
    }

    // ---- The story -----------------------------------------------------------

    /** Begin, from a click or (fromKeyboard) Enter or Space on the button.
     *  THE BUTTON HIDES WITH ITS CARD, so a keyboard visitor's focus has to go
     *  somewhere or it is left on nothing: to the pause button, as Resume,
     *  Restart and Replay already send it (accessibility pass, 2026-09-23). */
    function begin(fromKeyboard = false) {
        if (st.begun) return;
        st.begun = true;
        watch = 1;
        track('begin-watching', { reduced: opts.reducedMotion ? 1 : 0 });
        hideCard();
        showControls();
        placeFocus(fromKeyboard);
    }

    function finish() {
        if (st.finished) return;
        st.finished = true;
        runs += 1;
        flushSeek();
        track('arc-complete', { watch, scrubbed: ui.scrubbed ? 1 : 0 });
        stop();
        hideControls();
        if (el.ending) {
            el.ending.hidden = false;
            // The next frame, so the transition has a frame to start from.
            requestAnimationFrame(() => { el.ending.style.opacity = '1'; });
        }
        if (el.replay) el.replay.focus();
    }

    function rewind() {
        stageReached = 0;
        ui.scrubbed = false;
        ui.ending = false;
        ui.flashHold = 0;
        st.arc = 0;
        st.finished = false;
        st.lastTime = 0;
        if (el.ending) {
            el.ending.style.opacity = '0';
            el.ending.hidden = true;
        }
        if (el.blackout) el.blackout.style.opacity = '0';
        if (opts.onRewind) opts.onRewind();
        paintScrubber();
    }

    /** "Watched it again" after the ending: the closest thing to a measure of
     *  delight a counter can see. */
    function replay(fromKeyboard = false) {
        watch += 1;
        track('replay', { watch });
        rewind();
        showControls();
        placeFocus(fromKeyboard);
        start();
    }

    /** "Started again" from the pause card, counted apart from a replay. */
    function restart(fromKeyboard = false) {
        if (!st.paused) return;
        const at = Math.round(st.arc);
        flushSeek();
        watch += 1;
        track('restart', { at, watch });
        st.paused = false;
        hideCard();
        rewind();
        showControls();
        placeFocus(fromKeyboard);
        start();
    }

    function pause(how) {
        if (escapeAction(st) !== 'pause') return;
        // Escape mid-drag lands the drag first, so the card says where the
        // story actually is.
        if (ui.scrubbing) endScrub();
        flushSeek();
        st.paused = true;
        stop();
        track('pause', { at: Math.round(st.arc), how, watch });
        hideControls();
        showCard();
        if (el.resume) el.resume.focus();
    }

    function resume(fromKeyboard = false) {
        if (escapeAction(st) !== 'resume') return;
        st.paused = false;
        track('resume', { at: Math.round(st.arc), watch });
        hideCard();
        showControls();
        placeFocus(fromKeyboard);
        // The pause itself must not arrive as a quarter second of story.
        st.lastTime = 0;
        start();
    }

    function reportStage() {
        const index = nextStageIndex(st.arc, stageReached, stages);
        if (index < 0) return;
        stageReached = index;
        track(`reached-${stages[index].name}`,
            { at: Math.round(st.arc), watch, scrubbed: ui.scrubbed ? 1 : 0 });
    }

    // ---- The card ------------------------------------------------------------

    function showCard() {
        const card = el.card;
        if (!card) return;
        clearTimeout(ui.cardTimer);
        if (el.begin) el.begin.hidden = true;
        if (el.pauseActions) el.pauseActions.hidden = false;
        if (el.pausedAt) {
            el.pausedAt.hidden = false;
            el.pausedAt.textContent = `Paused at ${clockLabel(st.arc)}`;
        }
        card.hidden = false;
        card.style.pointerEvents = '';
        requestAnimationFrame(() => { if (st.paused) card.style.opacity = '1'; });
    }

    function hideCard() {
        const card = el.card;
        if (!card) return;
        clearTimeout(ui.cardTimer);
        card.style.opacity = '0';
        // Stops catching clicks the instant it starts fading. Under reduced
        // motion there is no fade at all.
        card.style.pointerEvents = 'none';
        ui.cardTimer = setTimeout(() => { if (!st.paused) card.hidden = true; }, opts.cardFadeMs);
    }

    /** FOLLOW A KEYBOARD, STAY OUT OF THE WAY OF A POINTER. A keyboard visitor
     *  lands on the pause button; a click leaves no focus ring behind. */
    function placeFocus(fromKeyboard) {
        if (fromKeyboard && el.pause) {
            el.pause.focus();
        } else if (document.activeElement && document.activeElement.blur) {
            document.activeElement.blur();
        }
    }

    // ---- The controls --------------------------------------------------------

    function showControls() {
        if (!el.controls) return;
        el.controls.hidden = false;
        paintScrubber();
        if (ui.ending) idleControls();
        else revealControls();
    }

    function hideControls() {
        if (!el.controls) return;
        clearTimeout(ui.idleTimer);
        el.controls.hidden = true;
        document.body.classList.remove(opts.idleBodyClass);
    }

    function revealControls() {
        const root = el.controls;
        if (!root || root.hidden) return;
        if (ui.ending && !ui.scrubbing) return;
        root.classList.remove('is-idle');
        document.body.classList.remove(opts.idleBodyClass);
        clearTimeout(ui.idleTimer);
        ui.idleTimer = setTimeout(idleControls, opts.idleSeconds * 1000);
    }

    function idleControls() {
        const root = el.controls;
        if (!root || root.hidden) return;
        clearTimeout(ui.idleTimer);
        const busy = !mayIdle({
            scrubbing: ui.scrubbing,
            hovering: ui.hoverPause || ui.hoverScrub,
            keyboardFocus: keyboardFocusInControls()
        });
        if (busy) {
            ui.idleTimer = setTimeout(idleControls, opts.idleSeconds * 1000);
            return;
        }
        root.classList.add('is-idle');
        document.body.classList.add(opts.idleBodyClass);
    }

    function keyboardFocusInControls() {
        const active = document.activeElement;
        if (!active || !el.controls || !el.controls.contains(active)) return false;
        try { return active.matches(':focus-visible'); } catch { return true; }
    }

    function paintScrubber() {
        if (!el.scrub || ui.scrubbing) return;
        el.scrub.value = st.arc.toFixed(1);
        paintTrack(st.arc);
    }

    function paintTrack(seconds) {
        const scrub = el.scrub;
        if (!scrub) return;
        scrub.style.setProperty('--progress', progressPercent(seconds, opts.seconds));
        // Only on a new whole second, so a screen reader is not handed a new
        // value sixty times a second.
        const whole = Math.floor(seconds);
        if (whole !== ui.lastWhole) {
            ui.lastWhole = whole;
            scrub.setAttribute('aria-valuetext', valueText(seconds, opts.seconds));
        }
    }

    function beginScrub() {
        if (ui.scrubbing || escapeAction(st) !== 'pause') return;
        ui.scrubbing = true;
        ui.dragFrom = st.arc;
        if (opts.onScrubStart) opts.onScrubStart();
        revealControls();
    }

    function dragTo(value) {
        if (!ui.scrubbing) return;
        st.arc = seekTarget(value, opts);
        paintTrack(st.arc);
    }

    function endScrub() {
        if (!ui.scrubbing) return;
        ui.scrubbing = false;
        seek(el.scrub ? el.scrub.value : st.arc, ui.dragFrom);
    }

    function seek(value, from = st.arc) {
        if (!st.begun || st.finished) return;
        const at = seekTarget(value, opts);
        st.arc = at;
        ui.flashHold = opts.flashHoldSeconds;
        ui.scrubbed = true;
        st.lastTime = 0;
        noteSeek(from, at);
        if (opts.onSeek) opts.onSeek(at);
        paintScrubber();
        revealControls();
    }

    function noteSeek(from, to) {
        if (ui.seekFrom === null) ui.seekFrom = from;
        ui.seekTo = to;
        clearTimeout(ui.seekTimer);
        ui.seekTimer = setTimeout(flushSeek, opts.seekReportSeconds * 1000);
    }

    function flushSeek() {
        clearTimeout(ui.seekTimer);
        if (ui.seekFrom === null) return;
        track('seek', { from: Math.round(ui.seekFrom), to: Math.round(ui.seekTo), watch });
        ui.seekFrom = null;
    }

    // ---- Page events ---------------------------------------------------------

    function onKeyDown(event) {
        if (event.key === 'Escape' && !event.repeat && !isEditable(event.target)) {
            const action = escapeAction(st);
            if (action === 'pause') {
                event.preventDefault();
                pause('key');
                return;
            }
            if (action === 'resume') {
                event.preventDefault();
                resume(true);
                return;
            }
        }
        revealControls();
    }

    function onScrubKey(event) {
        const at = keySeekTarget(event.key, st.arc, opts);
        if (at === null) return;
        event.preventDefault();
        seek(at);
    }

    /** Leaving the tab mid-story lands on the pause card, so a visitor comes
     *  back to a choice rather than to a story already running. Before Begin
     *  the scene simply stops and starts again. */
    function onVisibility() {
        if (document.hidden) {
            if (escapeAction(st) === 'pause') pause('hidden');
            else stop();
        } else if (!st.running && !st.finished && !st.paused) {
            st.lastTime = 0;
            start();
        } else if (st.paused) {
            redrawSoon();
        }
    }

    /** Find the elements and wire everything. Returns the player. */
    function install({ signal } = {}) {
        for (const [key, id] of Object.entries(ids)) el[key] = document.getElementById(id);
        const on = (target, type, fn, extra = {}) => {
            if (target) target.addEventListener(type, fn, { ...extra, signal });
        };

        on(el.pause, 'click', () => pause('button'));
        on(el.pause, 'pointerenter', () => { ui.hoverPause = true; });
        on(el.pause, 'pointerleave', () => { ui.hoverPause = false; });
        // `detail` is 0 for a click the keyboard made.
        on(el.resume, 'click', (event) => resume(event.detail === 0));
        on(el.restart, 'click', (event) => restart(event.detail === 0));
        on(el.replay, 'click', (event) => replay(event.detail === 0));

        const scrub = el.scrub;
        if (scrub) {
            scrub.max = String(opts.seconds);
            on(scrub, 'pointerdown', beginScrub);
            // An `input` with no pointer behind it is assistive technology
            // moving the value: a drag that starts and ends in one event.
            on(scrub, 'input', () => {
                const solo = !ui.scrubbing;
                beginScrub();
                dragTo(scrub.value);
                if (solo) endScrub();
            });
            on(scrub, 'change', endScrub);
            on(scrub, 'keydown', onScrubKey);
        }
        on(el.scrubber, 'pointerenter', () => { ui.hoverScrub = true; });
        on(el.scrubber, 'pointerleave', () => { ui.hoverScrub = false; });
        on(el.controls, 'focusin', revealControls);

        // A release anywhere ends a drag: a finger routinely leaves the
        // slider before it lifts.
        on(window, 'pointerup', endScrub);
        on(window, 'pointercancel', endScrub);
        on(window, 'pointermove', revealControls, { passive: true });
        on(window, 'pointerdown', revealControls, { passive: true });
        on(window, 'keydown', onKeyDown);
        on(window, 'resize', () => { if (st.paused) redrawSoon(); }, { passive: true });
        on(document, 'visibilitychange', onVisibility);

        if (el.begin) on(el.begin, 'click', (event) => begin(event.detail === 0));
        else begin();
        return api;
    }

    /** Jump the story to `seconds` from wherever it is, for QA hooks. */
    function jumpTo(seconds) {
        begin();
        if (st.finished) replay();
        if (st.paused) resume();
        seek(seconds);
    }

    const api = {
        install,
        start,
        stop,
        begin,
        pause,
        resume,
        restart,
        replay,
        seek,
        jumpTo,
        flashAllowed: () => flashAllowed({ scrubbing: ui.scrubbing, holdSeconds: ui.flashHold }),
        state: () => ({ ...st, scrubbing: ui.scrubbing, scrubbed: ui.scrubbed, watch, runs }),
        summary: () => ({ arc: Math.round(st.arc), finished: st.finished ? 1 : 0, runs })
    };
    return api;
}
