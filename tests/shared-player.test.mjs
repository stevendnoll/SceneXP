// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Tests for www/shared/js/player-1.0.0.js, the player for a timed story.
 *
 * The rules came from High Water, where Steve QA'd them on 2026-09-23, so the
 * point of this suite is that they survived the move intact and that they now
 * hold for every scene built on them. The properties that matter most:
 *
 *   1. THE STORY WAITS FOR THE VISITOR. Nothing advances before Begin, and the
 *      scene still draws behind the card.
 *   2. A PAUSE FREEZES THE STORY and shows the card again with where it was
 *      held. Leaving the tab mid-story is a pause, not a stop.
 *   3. NOTHING FLASHES DURING A DRAG OR JUST AFTER A SEEK. The photosensitivity
 *      guard: a drag runs the story clock many times faster than real time.
 *   4. EVERY USAGE EVENT FIRES ONCE. A stage report that fired every frame
 *      would send sixty requests a second.
 *   5. THE CONTROLS NEVER FADE UNDER A VISITOR who is using them, and never
 *      with keyboard focus inside them.
 *
 * Driven through the shared DOM stub. requestAnimationFrame callbacks are
 * collected by the stub and run by `step`, and timers are Jest's fake ones.
 */
import { jest } from '@jest/globals';
import { installThree } from './helpers/three-stub.mjs';
import { installDom, fire } from './helpers/dom-stub.mjs';

const P = await import('../www/shared/js/player-1.0.0.js');

const OPTS = { ...P.PLAYER_DEFAULTS };

// ---------------------------------------------------------------------------
// The rules
// ---------------------------------------------------------------------------

describe('the rules', () => {
    test('Escape pauses a running story, resumes a paused one, and is inert otherwise', () => {
        expect(P.escapeAction({ begun: false, finished: false, paused: false })).toBeNull();
        expect(P.escapeAction({ begun: true, finished: true, paused: false })).toBeNull();
        expect(P.escapeAction({ begun: true, finished: false, paused: false })).toBe('pause');
        expect(P.escapeAction({ begun: true, finished: false, paused: true })).toBe('resume');
    });

    test('a key belongs to a text field, not to a slider or a button', () => {
        expect(P.isEditable(null)).toBe(false);
        expect(P.isEditable({ isContentEditable: true })).toBe(true);
        expect(P.isEditable({ tagName: 'TEXTAREA' })).toBe(true);
        expect(P.isEditable({ tagName: 'SELECT' })).toBe(true);
        expect(P.isEditable({ tagName: 'INPUT' })).toBe(true);
        expect(P.isEditable({ tagName: 'INPUT', type: 'search' })).toBe(true);
        expect(P.isEditable({ tagName: 'INPUT', type: 'range' })).toBe(false);
        expect(P.isEditable({ tagName: 'BUTTON' })).toBe(false);
        expect(P.isEditable({})).toBe(false);
    });

    test('a seek lands inside the story and never quite at the end', () => {
        expect(P.seekTarget('nope', OPTS)).toBe(0);
        expect(P.seekTarget(-4, OPTS)).toBe(0);
        expect(P.seekTarget(24.5, OPTS)).toBe(24.5);
        expect(P.seekTarget(999, OPTS)).toBe(OPTS.seconds - OPTS.endGuardSeconds);
        expect(P.seekTarget(10)).toBe(10);
    });

    test('the scrubber keys move five seconds, fifteen, or to either end', () => {
        expect(P.keySeekTarget('ArrowRight', 10, OPTS)).toBe(15);
        expect(P.keySeekTarget('ArrowUp', 10, OPTS)).toBe(15);
        expect(P.keySeekTarget('ArrowLeft', 10, OPTS)).toBe(5);
        expect(P.keySeekTarget('ArrowDown', 2, OPTS)).toBe(0);
        expect(P.keySeekTarget('PageUp', 10, OPTS)).toBe(25);
        expect(P.keySeekTarget('PageDown', 10, OPTS)).toBe(0);
        expect(P.keySeekTarget('Home', 30, OPTS)).toBe(0);
        expect(P.keySeekTarget('End', 30, OPTS)).toBe(OPTS.seconds - OPTS.endGuardSeconds);
        expect(P.keySeekTarget('a', 30, OPTS)).toBeNull();
        expect(P.keySeekTarget('ArrowRight', NaN)).toBe(5);
    });

    test('the clock, the spoken value and the fill', () => {
        expect(P.clockLabel(24.9)).toBe('0:24');
        expect(P.clockLabel(75)).toBe('1:15');
        expect(P.clockLabel('x')).toBe('0:00');
        expect(P.valueText(1, 60)).toBe('1 second of 60');
        expect(P.valueText(24.7, 60)).toBe('24 seconds of 60');
        expect(P.valueText(-3, 60)).toBe('0 seconds of 60');
        expect(P.progressPercent(15, 60)).toBe('25.00%');
        expect(P.progressPercent(90, 60)).toBe('100.00%');
        expect(P.progressPercent(undefined, 60)).toBe('0.00%');
    });

    test('the controls may fade only when nobody is using them', () => {
        expect(P.mayIdle({ scrubbing: false, hovering: false, keyboardFocus: false })).toBe(true);
        expect(P.mayIdle({ scrubbing: true, hovering: false, keyboardFocus: false })).toBe(false);
        expect(P.mayIdle({ scrubbing: false, hovering: true, keyboardFocus: false })).toBe(false);
        expect(P.mayIdle({ scrubbing: false, hovering: false, keyboardFocus: true })).toBe(false);
    });

    test('nothing flashes during a drag or while a seek is settling', () => {
        expect(P.flashAllowed({ scrubbing: false, holdSeconds: 0 })).toBe(true);
        expect(P.flashAllowed({ scrubbing: true, holdSeconds: 0 })).toBe(false);
        expect(P.flashAllowed({ scrubbing: false, holdSeconds: 0.2 })).toBe(false);
    });

    test('the fade covers the last seconds, or cuts at the end with none', () => {
        expect(P.fadeAt(50, OPTS)).toBe(0);
        expect(P.fadeAt(58.5, OPTS)).toBeCloseTo(0.5, 10);
        expect(P.fadeAt(60, OPTS)).toBe(1);
        expect(P.fadeAt(59)).toBeGreaterThan(0);
        expect(P.fadeAt(59.9, { seconds: 60, fadeSeconds: 0 })).toBe(0);
        expect(P.fadeAt(60, { seconds: 60, fadeSeconds: 0 })).toBe(1);
    });

    test('a stage is reported once, and a jump reports only where it lands', () => {
        const stages = [{ at: 0, name: 'a' }, { at: 10, name: 'b' }, { at: 20, name: 'c' }];
        expect(P.stageIndexAt(15, stages)).toBe(1);
        expect(P.nextStageIndex(5, 0, stages)).toBe(-1);
        expect(P.nextStageIndex(12, 0, stages)).toBe(1);
        expect(P.nextStageIndex(12, 1, stages)).toBe(-1);
        expect(P.nextStageIndex(25, 0, stages)).toBe(2);
        expect(P.nextStageIndex(5, 2, stages)).toBe(-1);
    });

    test('QA hooks belong on a local server and nowhere else', () => {
        expect(P.isLocalHost({ hostname: 'localhost' })).toBe(true);
        expect(P.isLocalHost({ hostname: '127.0.0.1' })).toBe(true);
        expect(P.isLocalHost({ hostname: '[::1]' })).toBe(true);
        expect(P.isLocalHost({ hostname: '' })).toBe(true);
        expect(P.isLocalHost({ hostname: 'www.scenexp.com' })).toBe(false);
        expect(P.isLocalHost(null)).toBe(false);
        // No window at all under Node.
        expect(P.isLocalHost()).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// The wiring
// ---------------------------------------------------------------------------

describe('the player', () => {
    let dom;
    let now;
    let ran;
    let events;
    let frames;
    let hooks;
    let cancelled;

    /** Run every animation-frame callback queued since the last step, except
     *  the cancelled ones. The stub's request id is the callback's position,
     *  counting from one. */
    function step(ms = 100, times = 1) {
        for (let n = 0; n < times; n++) {
            now += ms;
            const end = dom.loops.length;
            for (let i = ran; i < end; i++) if (!cancelled.has(i + 1)) dom.loops[i](now);
            ran = end;
        }
    }

    function named(name) { return events.filter((e) => e.name === name); }

    function build(extra = {}) {
        const player = P.createPlayer({
            stages: [{ at: 0, name: 'ordinary' }, { at: 10, name: 'storm' }, { at: 40, name: 'end' }],
            track: (name, params) => events.push({ name, params }),
            frame: (delta, arc, info) => frames.push({ delta, arc, ...info }),
            redraw: () => { hooks.redraw += 1; },
            onSeek: (at) => { hooks.seek.push(at); },
            onRewind: () => { hooks.rewind += 1; },
            onScrubStart: () => { hooks.scrubStart += 1; },
            ...extra
        }).install();
        player.start();
        return player;
    }

    function begun(extra) {
        const player = build(extra);
        dom.el('player-begin').click();
        step(16);          // the first frame sets the clock
        return player;
    }

    beforeEach(() => {
        installThree();
        dom = installDom();
        now = 1000;
        ran = 0;
        events = [];
        frames = [];
        hooks = { redraw: 0, seek: [], rewind: 0, scrubStart: 0 };
        // The stub's cancel does nothing, which would leave a paused loop's
        // last frame queued. A browser drops it, so this does too.
        cancelled = new Set();
        globalThis.cancelAnimationFrame = (id) => { cancelled.add(id); };
        jest.useFakeTimers({ doNotFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    });

    afterEach(() => {
        jest.useRealTimers();
        dom.uninstall();
    });

    test('THE STORY WAITS FOR BEGIN, and the scene draws behind the card', () => {
        const player = build();
        step(100, 5);
        expect(frames.length).toBe(5);
        expect(frames.every((f) => f.arc === 0 && f.begun === false)).toBe(true);
        expect(player.state().begun).toBe(false);
        // Escape does nothing before there is a story.
        fire(window, 'keydown', { key: 'Escape', target: document.body });
        expect(player.state().paused).toBe(false);
        expect(events).toEqual([]);
    });

    test('Begin starts the clock, takes the card away and brings the controls', () => {
        const player = build({ reducedMotion: true });
        dom.el('player-begin').click();
        expect(named('begin-watching')).toEqual([{ name: 'begin-watching', params: { reduced: 1 } }]);
        expect(dom.el('player-card').style.pointerEvents).toBe('none');
        expect(dom.el('player-controls').hidden).toBe(false);
        jest.advanceTimersByTime(700);
        expect(dom.el('player-card').hidden).toBe(true);
        step(16);
        step(100, 10);
        expect(player.state().arc).toBeCloseTo(1, 5);
        // A second press is ignored.
        player.begin();
        expect(named('begin-watching').length).toBe(1);
    });

    test('a stalled frame cannot jump the story', () => {
        const player = begun();
        step(5000);
        expect(player.state().arc).toBeCloseTo(OPTS.maxDeltaSeconds, 5);
    });

    test('EACH STAGE IS REPORTED ONCE, and the first never', () => {
        const player = begun();
        player.seek(12);
        step(100, 20);
        player.seek(41);
        step(100, 5);
        const reached = events.filter((e) => e.name.startsWith('reached-')).map((e) => e.name);
        expect(reached).toEqual(['reached-storm', 'reached-end']);
        expect(named('reached-storm')[0].params.scrubbed).toBe(1);
    });

    test('PAUSE FREEZES THE STORY and shows the card with where it was held', () => {
        const player = begun();
        step(100, 31);
        fire(dom.el('player-pause'), 'click');
        const held = player.state().arc;
        expect(player.state().paused).toBe(true);
        expect(named('pause')[0].params).toEqual({ at: 3, how: 'button', watch: 1 });
        expect(dom.el('player-paused-at').textContent).toBe('Paused at 0:03');
        expect(dom.el('player-begin').hidden).toBe(true);
        expect(dom.el('player-pause-actions').hidden).toBe(false);
        expect(dom.el('player-controls').hidden).toBe(true);
        expect(document.activeElement).toBe(dom.el('player-resume'));
        step(100, 10);
        expect(player.state().arc).toBe(held);
        expect(dom.el('player-card').style.opacity).toBe('1');
        // A second pause is ignored.
        player.pause('button');
        expect(named('pause').length).toBe(1);
    });

    test('Escape pauses, Escape resumes, and a keyboard resume lands on the pause button', () => {
        const player = begun();
        fire(window, 'keydown', { key: 'Escape', target: document.body });
        expect(player.state().paused).toBe(true);
        fire(window, 'keydown', { key: 'Escape', target: document.body });
        expect(player.state().paused).toBe(false);
        expect(named('resume').length).toBe(1);
        expect(document.activeElement).toBe(dom.el('player-pause'));
        step(100, 4);
        expect(player.state().arc).toBeGreaterThan(0.2);
    });

    test('Escape is left alone when it repeats or belongs to a text field', () => {
        const player = begun();
        fire(window, 'keydown', { key: 'Escape', repeat: true, target: document.body });
        fire(window, 'keydown', { key: 'Escape', target: { tagName: 'TEXTAREA' } });
        expect(player.state().paused).toBe(false);
        // Any other key just brings the controls up.
        dom.el('player-controls').classList.add('is-idle');
        fire(window, 'keydown', { key: 'a', target: document.body });
        expect(dom.el('player-controls').classList.contains('is-idle')).toBe(false);
    });

    test('a pointer resume drops focus rather than leaving a ring', () => {
        const player = begun();
        player.pause('button');
        fire(dom.el('player-resume'), 'click', { detail: 1 });
        expect(player.state().paused).toBe(false);
        expect(dom.el('player-resume').focused).toBe(false);
        player.resume();
        expect(named('resume').length).toBe(1);
    });

    test('Restart from the pause card starts a new watch at zero', () => {
        const player = begun();
        player.seek(20);
        jest.advanceTimersByTime(1000);
        player.pause('button');
        fire(dom.el('player-restart'), 'click', { detail: 0 });
        expect(named('restart')[0].params).toEqual({ at: 20, watch: 2 });
        expect(player.state().arc).toBe(0);
        expect(player.state().paused).toBe(false);
        expect(hooks.rewind).toBe(1);
        expect(document.activeElement).toBe(dom.el('player-pause'));
        // Only from the pause card.
        player.restart();
        expect(named('restart').length).toBe(1);
    });

    test('NOTHING FLASHES DURING A DRAG or for a second after it lands', () => {
        const player = begun();
        expect(player.flashAllowed()).toBe(true);
        const scrub = dom.el('player-scrub');
        fire(scrub, 'pointerdown');
        expect(hooks.scrubStart).toBe(1);
        expect(player.flashAllowed()).toBe(false);
        scrub.value = '30';
        fire(scrub, 'input');
        expect(player.state().arc).toBe(30);
        // The clock does not run under a held thumb.
        step(100, 5);
        expect(player.state().arc).toBe(30);
        fire(window, 'pointerup');
        expect(hooks.seek).toEqual([30]);
        expect(player.flashAllowed()).toBe(false);
        step(100, 13);
        expect(player.flashAllowed()).toBe(true);
    });

    test('a run of seeks is reported once, when it settles', () => {
        const player = begun();
        const scrub = dom.el('player-scrub');
        fire(scrub, 'keydown', { key: 'ArrowRight' });
        fire(scrub, 'keydown', { key: 'ArrowRight' });
        fire(scrub, 'keydown', { key: 'q' });
        expect(player.state().arc).toBeCloseTo(10, 1);
        expect(named('seek')).toEqual([]);
        jest.advanceTimersByTime(800);
        expect(named('seek')).toEqual([{ name: 'seek', params: { from: 0, to: 10, watch: 1 } }]);
        expect(scrub.attributes['aria-valuetext']).toBe('10 seconds of 60');
        expect(scrub.style.getPropertyValue('--progress')).toBe('16.67%');
    });

    test('assistive technology moving the value is a seek in one event', () => {
        const player = begun();
        const scrub = dom.el('player-scrub');
        scrub.value = '42';
        fire(scrub, 'input');
        expect(player.state().scrubbing).toBe(false);
        expect(hooks.seek).toEqual([42]);
        // A change with no drag in progress is nothing.
        fire(scrub, 'change');
        expect(hooks.seek).toEqual([42]);
    });

    test('Escape in the middle of a drag lands the drag first', () => {
        const player = begun();
        const scrub = dom.el('player-scrub');
        fire(scrub, 'pointerdown');
        scrub.value = '25';
        fire(scrub, 'input');
        fire(window, 'keydown', { key: 'Escape', target: scrub });
        expect(player.state().paused).toBe(true);
        expect(player.state().scrubbing).toBe(false);
        expect(hooks.seek).toEqual([25]);
        expect(named('seek').length).toBe(1);
    });

    test('THE CONTROLS FADE WHEN STILL, and never under a visitor using them', () => {
        begun();
        const controls = dom.el('player-controls');
        jest.advanceTimersByTime(3000);
        expect(controls.classList.contains('is-idle')).toBe(true);
        expect(document.body.classList.contains('player-idle')).toBe(true);
        fire(window, 'pointermove');
        expect(controls.classList.contains('is-idle')).toBe(false);

        // Resting on the pause button holds them up.
        fire(dom.el('player-pause'), 'pointerenter');
        jest.advanceTimersByTime(3000);
        expect(controls.classList.contains('is-idle')).toBe(false);
        fire(dom.el('player-pause'), 'pointerleave');
        fire(dom.el('player-scrubber'), 'pointerenter');
        jest.advanceTimersByTime(3000);
        expect(controls.classList.contains('is-idle')).toBe(false);
        fire(dom.el('player-scrubber'), 'pointerleave');
        jest.advanceTimersByTime(3000);
        expect(controls.classList.contains('is-idle')).toBe(true);

        // So does keyboard focus inside them.
        const pause = dom.el('player-pause');
        controls.appendChild(pause);
        pause.focus();
        fire(controls, 'focusin');
        pause.matches = () => true;
        jest.advanceTimersByTime(3000);
        expect(controls.classList.contains('is-idle')).toBe(false);
        // A browser without :focus-visible is treated as keyboard focus.
        pause.matches = () => { throw new Error('unsupported'); };
        jest.advanceTimersByTime(3000);
        expect(controls.classList.contains('is-idle')).toBe(false);
        pause.matches = () => false;
        jest.advanceTimersByTime(3000);
        expect(controls.classList.contains('is-idle')).toBe(true);
    });

    test('the fade takes the controls away, then the ending comes up', () => {
        const player = begun();
        player.seek(57.2);
        step(100, 2);
        expect(dom.el('player-controls').classList.contains('is-idle')).toBe(true);
        expect(Number(dom.el('player-blackout').style.opacity)).toBeGreaterThan(0);
        // A pointer move does not bring them back over the fade.
        fire(window, 'pointermove');
        expect(dom.el('player-controls').classList.contains('is-idle')).toBe(true);
        step(100, 40);
        expect(player.state().finished).toBe(true);
        expect(named('arc-complete')).toEqual([{ name: 'arc-complete', params: { watch: 1, scrubbed: 1 } }]);
        expect(dom.el('player-ending').hidden).toBe(false);
        expect(dom.el('player-ending').style.opacity).toBe('1');
        expect(dom.el('player-controls').hidden).toBe(true);
        expect(document.activeElement).toBe(dom.el('player-replay'));
        expect(player.summary()).toEqual({ arc: 60, finished: 1, runs: 1 });
        // Nothing seeks, pauses or restarts after the end.
        player.seek(10);
        player.pause('key');
        expect(player.state().arc).toBe(60);
        expect(player.state().paused).toBe(false);
        // And the loop is stopped.
        const count = frames.length;
        step(100, 3);
        expect(frames.length).toBe(count);
    });

    test('Watch it again is a second watch from zero', () => {
        const player = begun();
        player.seek(59.7);
        step(100, 10);
        expect(player.state().finished).toBe(true);
        fire(dom.el('player-replay'), 'click', { detail: 1 });
        expect(named('replay')).toEqual([{ name: 'replay', params: { watch: 2 } }]);
        expect(player.state().finished).toBe(false);
        expect(player.state().arc).toBe(0);
        expect(dom.el('player-ending').hidden).toBe(true);
        expect(dom.el('player-blackout').style.opacity).toBe('0');
        step(100, 3);
        expect(player.state().arc).toBeGreaterThan(0);
    });

    test('with no fade, the story cuts to the ending at the last second', () => {
        const player = begun({ fadeSeconds: 0 });
        player.seek(59.7);
        step(100, 2);
        expect(player.state().finished).toBe(false);
        step(100, 5);
        expect(player.state().finished).toBe(true);
    });

    test('LEAVING THE TAB MID-STORY IS A PAUSE, and the frozen frame comes back', () => {
        const player = begun();
        document.hidden = true;
        fire(document, 'visibilitychange');
        expect(player.state().paused).toBe(true);
        expect(named('pause')[0].params.how).toBe('hidden');
        document.hidden = false;
        fire(document, 'visibilitychange');
        expect(player.state().paused).toBe(true);
        step(16);
        expect(hooks.redraw).toBe(1);
        // A resize while paused redraws too.
        fire(window, 'resize');
        step(16);
        expect(hooks.redraw).toBe(2);
    });

    test('before Begin, a hidden tab simply stops drawing and starts again', () => {
        const player = build();
        step(100, 2);
        document.hidden = true;
        fire(document, 'visibilitychange');
        expect(player.state().running).toBe(false);
        document.hidden = false;
        fire(document, 'visibilitychange');
        expect(player.state().running).toBe(true);
        // A resize with nothing paused draws nothing extra.
        fire(window, 'resize');
        step(16);
        expect(hooks.redraw).toBe(0);
    });

    test('the QA jump works from before Begin, from the pause card, and from the end', () => {
        const player = build();
        player.jumpTo(30);
        expect(player.state().begun).toBe(true);
        expect(player.state().arc).toBe(30);
        player.pause('button');
        player.jumpTo(40);
        expect(player.state().paused).toBe(false);
        expect(player.state().arc).toBe(40);
        player.jumpTo(59.7);
        step(100, 10);
        expect(player.state().finished).toBe(true);
        player.jumpTo(5);
        expect(player.state().finished).toBe(false);
        expect(player.state().arc).toBe(5);
    });

    test('A PAGE WITH NO PLAYER MARKUP still runs its story', () => {
        document.getElementById = () => null;
        const player = P.createPlayer({ frame: (d, arc) => frames.push({ arc }) }).install();
        player.start();
        expect(player.state().begun).toBe(true);
        step(16);
        step(100, 10);
        expect(player.state().arc).toBeGreaterThan(0.9);
        player.pause('key');
        expect(player.state().paused).toBe(true);
        player.resume(true);
        player.seek(58);
        step(100, 30);
        expect(player.state().finished).toBe(true);
        player.replay();
        expect(player.state().arc).toBe(0);
        // With no redraw hook a paused resize is harmless.
        player.pause('button');
        fire(window, 'resize');
        step(16);
    });

    test('ids can be renamed and the defaults need no options at all', () => {
        const player = P.createPlayer({ ids: { begin: 'go' } }).install();
        player.start();
        dom.el('go').click();
        expect(player.state().begun).toBe(true);
        step(16);
        step(100);
        expect(player.state().arc).toBeGreaterThan(0);
        expect(player.state().watch).toBe(1);
    });
});
