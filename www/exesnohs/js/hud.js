// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * hud.js - The score, the play count, and everything the visitor can do.
 *
 * EVERY ACTION IN THIS GAME IS A REAL BUTTON. Snap, throw to each receiver,
 * keep and run, and carry on to the next play. Nothing is a pointer event on
 * the canvas, so the whole game is playable from a keyboard without anything
 * special being built for it, and a screen reader gets named controls rather
 * than a picture.
 *
 * THE RESULT IS ANNOUNCED, NOT JUST DRAWN. A game whose outcome is only
 * conveyed by pixels is unplayable without sight of it, so every whistle also
 * goes through a polite live region.
 *
 * The throw buttons are labelled A to D after the 2D game's THROW_TO_A through
 * THROW_TO_D, and are built from the receivers who are ACTUALLY eligible on
 * this play: several formations bench a receiver, and offering a target that
 * cannot be thrown to is worse than offering three.
 *
 * EACH ONE WEARS ITS RECEIVER'S COLOUR, from the one table in config that
 * markers.js paints onto the grass. A letter on a button only means something
 * if the same letter can be found on the field, and for a while it could not.
 */

import { EXESNOHS_CONFIG as CFG } from './config.min.js';

const el = (id) => document.getElementById(id);
const SVG_NS = 'http://www.w3.org/2000/svg';
let handlers = {};

function button(label, className, onClick, describedBy) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = className;
    b.textContent = label;
    if (describedBy) b.setAttribute('aria-label', describedBy);
    b.addEventListener('click', onClick);
    return b;
}

/**
 * A throw button, wearing its receiver's colour.
 *
 * THE BUTTON AND THE PLAYER HAVE TO AGREE. "Throw C" is only an instruction if
 * a visitor can find C, and the receivers are told apart on the grass by the
 * colour of the disc they stand in front of. Four identical dark pills asked
 * somebody to remember which letter went with which colour, which is a memory
 * game nobody signed up for. The table lives in config so the disc, the route
 * on the playbook diagram and this swatch are one colour rather than three that
 * happen to match.
 *
 * THE SWATCH CARRIES THE COLOUR AND THE LABEL STAYS WHITE, deliberately. Ink at
 * these hues on this dark pill runs from about 4:1 down to 3:1 depending on the
 * receiver, and a control's own text should not be the thing that has to pass.
 * A filled dot has no contrast requirement to meet, and the letter is still
 * written out in words for anyone who cannot see it at all.
 */
function throwButton(position, letter, ink, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hud-btn hud-btn-throw';
    b.style.setProperty('--throw-ink', ink);
    b.setAttribute('aria-label', `Throw to receiver ${letter}`);
    b.dataset.receiver = position;
    // The letter IS the key, which is why the throw buttons need no hint: the
    // disc on the grass, the route on the diagram and the keystroke are one
    // letter rather than three things to remember.
    b.dataset.letter = letter;
    b.setAttribute('aria-keyshortcuts', letter);

    const dot = document.createElement('span');
    dot.className = 'throw-dot';
    dot.setAttribute('aria-hidden', 'true');
    b.appendChild(dot);
    b.appendChild(document.createTextNode(`Throw ${letter}`));

    b.addEventListener('click', onClick);
    return b;
}

/**
 * A speaker, with or without a slash.
 *
 * THE PILL DID NOT READ AS A CONTROL. It said "Sound off" in the stat bar
 * between "Play 1 of 10" and "Score 0", which is a row of statements, so it
 * read as a third statement rather than as the one thing on that row a visitor
 * can press. An icon is what says "control" before any of the words are read.
 *
 * Drawn rather than fetched: `img-src` allows `data:` but a sprite is a file to
 * keep in step with a stylesheet, and this is two paths.
 */
function speakerIcon(off) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'hud-mute-icon');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');

    const cone = document.createElementNS(SVG_NS, 'path');
    cone.setAttribute('d', 'M4 9.5h3.6L12 5.6v12.8L7.6 14.5H4z');
    cone.setAttribute('fill', 'currentColor');
    svg.appendChild(cone);

    const stroke = document.createElementNS(SVG_NS, 'path');
    stroke.setAttribute('d', off
        ? 'M15.5 9.5l5 5m0-5l-5 5'                       // a cross, not a wave
        : 'M15.4 9a4.2 4.2 0 0 1 0 6M18 6.6a7.6 7.6 0 0 1 0 10.8');
    stroke.setAttribute('fill', 'none');
    stroke.setAttribute('stroke', 'currentColor');
    stroke.setAttribute('stroke-width', '1.9');
    stroke.setAttribute('stroke-linecap', 'round');
    svg.appendChild(stroke);
    return svg;
}

export function initHud(callbacks) {
    handlers = callbacks || {};
    const btn = el('mute-btn');
    if (btn) wireMute(btn);
}

/**
 * EVERY SOUND BUTTON IN THE GAME, so they can never disagree.
 *
 * There are two now (the HUD bar and the playbook, see `muteButton`), they
 * control one setting, and a visitor who turns the sound off in the playbook
 * and then sees "Sound on" in the HUD has been told the setting did not take.
 * Repainting them all on any toggle costs two DOM writes on a press.
 */
const muteControls = new Set();

/**
 * The mute button.
 *
 * It lives in the HUD bar rather than the action row, because the action row is
 * rebuilt on every phase change and a sound control that vanishes while you are
 * looking at it is worse than no control. `aria-pressed` carries the state, so
 * a screen reader is told whether sound is on rather than having to infer it
 * from an icon it cannot see.
 */
function wireMute(btn) {
    if (!btn || !handlers.isMuted) return null;
    muteControls.add(btn);
    btn.addEventListener('click', () => {
        if (handlers.onToggleMute) handlers.onToggleMute();
        paintMute();
    });
    paintMute();
    return btn;
}

/** Put every sound button in step with the setting. */
export function paintMute() {
    if (!handlers.isMuted) return;
    const off = handlers.isMuted();
    for (const btn of muteControls) {
        btn.setAttribute('aria-pressed', off ? 'true' : 'false');
        btn.textContent = '';
        btn.appendChild(speakerIcon(off));
        const label = document.createElement('span');
        label.textContent = off ? 'Sound off' : 'Sound on';
        btn.appendChild(label);
    }
}

/**
 * ...AND ONE FOR THE PLAYBOOK, WHICH IS QA ROUND TWENTY-SEVEN, ITEM 3.
 *
 * The HUD bar is the only sound control in the game and the playbook covers it,
 * so the one screen a visitor sits on between plays, and the first screen they
 * see after the welcome card, is the one screen where the sound cannot be
 * turned off. Asking somebody to close the playbook, mute, and reopen it is
 * asking them to remember that the control exists at all.
 *
 * Built here rather than in playbook-ui.js so the icon, the wording and the
 * pressed state come from one place. The caller owns where it goes.
 */
export function muteButton(className = 'playbook-restart-btn playbook-mute') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className;
    return wireMute(btn);
}

export function setPlayNumber(n, of) {
    const node = el('hud-play');
    if (node) node.textContent = `${n}`;
    const total = el('hud-of');
    if (total) total.textContent = `${of}`;
}

export function setScore(points) {
    const node = el('hud-score');
    if (node) node.textContent = `${points}`;
}

/**
 * THE PLAY CLOCK, in seconds remaining, or null to put it away.
 *
 * NULL IS NOT ZERO AND THE DIFFERENCE IS THE WHOLE POINT. Zero means out of
 * time, which is a sack and wants the urgent treatment; null means the visitor
 * has thrown it or tucked it and the clock has nothing left to time. Passing one
 * for the other leaves a red nought sitting over every completed pass.
 *
 * ROUNDED UP, so it shows 10 for the first instant and only reads 0 when the
 * time is genuinely gone. Counting down through a 0 that still has nine tenths
 * of a second left in it is how a clock comes to be mistrusted.
 */
export function setClock(seconds) {
    const wrap = el('hud-clock');
    const node = el('hud-clock-value');
    if (!wrap || !node) return;
    if (seconds === null || seconds === undefined) {
        wrap.hidden = true;
        wrap.classList.remove('is-urgent');
        return;
    }
    const left = Math.max(0, Math.ceil(seconds));
    wrap.hidden = false;
    node.textContent = `${left}`;
    wrap.classList.toggle('is-urgent', seconds <= CFG.clock.warn);
}

/** Say something to a screen reader. Politely, so it never interrupts. */
export function announce(text) {
    const live = el('hud-live');
    if (!live) return;
    // Re-setting identical text does not re-announce, so clear first.
    live.textContent = '';
    window.setTimeout(() => { live.textContent = text; }, 30);
}

export function showHud(visible) {
    // `game-hud`, not `hud`: the shared sheet owns `#hud` and renders it at
    // opacity 0. See the note in index.html.
    const hud = el('game-hud');
    if (hud) hud.hidden = !visible;
}

function actions() {
    const node = el('hud-actions');
    if (node) node.textContent = '';
    return node;
}

/** Pre-snap: one button, and it takes focus so a keyboard visitor can just
 *  press Enter to start the play they chose. */
export function showSnap() {
    const box = actions();
    if (!box) return;

    /**
     * SECOND THOUGHTS ARE ALLOWED, WHICH IS THE POINT OF A PRE-SNAP HOLD.
     *
     * The snap is the visitor's rather than a timer's precisely so they can
     * read the formation for as long as they like, and reading a formation is
     * how somebody works out they have called the wrong play. Offering only one
     * way forward from there makes the reading pointless.
     *
     * IT COMES FIRST IN THE ROW AND SECOND IN THE EYE. Snapping is what most
     * visitors do most of the time, so it keeps the filled button and the
     * focus; changing is the quieter outline one beside it.
     */
    const change = bindKeys(button('Change play', 'hud-btn',
        () => handlers.onChangePlay && handlers.onChangePlay(),
        'Change the play before snapping'), [CHANGE_KEY]);
    change.id = 'change-play-btn';
    box.appendChild(change);

    const snap = button('Snap the ball', 'hud-btn hud-btn-primary',
        () => handlers.onSnap && handlers.onSnap());
    snap.id = 'snap-btn';
    bindKeys(snap, SNAP_KEYS);
    box.appendChild(snap);
    snap.focus();
}

/**
 * THE KEYBOARD, WHICH DRIVES THE BUTTONS RATHER THAN THE GAME.
 *
 * Every binding here finds the control that is actually on screen and clicks
 * it. That is the whole design and it is worth stating: a key that called
 * `handlers.onThrow` directly would go on working after the throw row had been
 * cleared, would fire for a receiver who is not in this formation, and would
 * need its own copy of every rule about when a thing is pressable. Clicking the
 * button inherits all of that for free and can never disagree with what the
 * visitor can see.
 *
 * `Q` is the quarterback's own letter, which is painted on the grass in front
 * of him and is what a visitor taps to snap it. `S` and the space bar are the
 * two anybody would try. A, B, C and D are the receivers' letters, from the
 * same table the discs and the buttons read.
 */
const SNAP_KEYS = [' ', 'S', 'Q'];
const KEEP_KEY = 'K';
/** C, and it only ever means anything before the snap. During a play the same
 *  key throws to receiver C, and the two can never both be on screen: the
 *  lookup below asks what is actually there rather than what the key "is". */
const CHANGE_KEY = 'C';
/** V, and it only ever means anything while a replay is running: the row it
 *  presses does not exist at any other time. */
const VIEW_KEY = 'V';
/** Escape, which gets out of anything that plays on its own: a replay, a
 *  celebration, a milestone show. It presses whichever Skip is on screen. */
const SKIP_KEY = 'Escape';
// A NOTE ON THE MATCH BELOW, which is a SUBSTRING match on `data-keys`. It is
// safe only because attribute matching is case sensitive and every other key is
// a single capital: "Escape" contains no S, Q, K, C, V or A to D in capitals. A
// new named key has to keep that true.

/** Tag a button with the keys that press it, for the handler and for anything
 *  reading the page out loud. */
function bindKeys(node, keys) {
    node.dataset.keys = keys.join('');
    // The space bar has a name rather than a character in this attribute.
    node.setAttribute('aria-keyshortcuts',
        keys.map((k) => (k === ' ' ? 'Space' : k)).join(' '));
    return node;
}

/**
 * Which on-screen control this key presses, or nothing.
 *
 * EXPORTED AND PURE, because the interesting part is the decision and the
 * decision is the part that can be wrong. It takes the event's own fields
 * rather than an event, so a test can ask about a modifier or a text field
 * without building a DOM.
 */
export function keyAction(key, { inField = false, modified = false } = {}) {
    if (inField || modified || !key) return '';
    const up = key.length === 1 ? key.toUpperCase() : key;
    if (SNAP_KEYS.includes(up)) return 'snap';
    if (up === KEEP_KEY) return 'keep';
    if (up === VIEW_KEY) return 'view';
    if (up === SKIP_KEY) return 'skip';
    if (/^[A-D]$/.test(up)) return up;
    return '';
}

/**
 * Wire the document up.
 *
 * A SIGNAL, ALWAYS, so the listener dies with the scene. Every other
 * document-level handler on this page takes one and a bare one outlives
 * whatever installed it.
 */
export function initKeys(signal) {
    if (typeof document === 'undefined' || !document.addEventListener) return;
    document.addEventListener('keydown', (event) => {
        const target = event.target || {};
        const tag = (target.tagName || '').toLowerCase();
        const want = keyAction(event.key, {
            inField: tag === 'input' || tag === 'textarea' || tag === 'select'
                || target.isContentEditable === true,
            modified: event.metaKey || event.ctrlKey || event.altKey,
        });
        if (!want) return;

        const box = el('hud-actions');
        if (!box) return;
        // ONLY WHAT IS ON SCREEN. The row is emptied between phases, so this
        // finds nothing before the snap is offered and nothing after the ball
        // is in the air, which is exactly right.
        // A LETTER MEANS WHATEVER IS ON SCREEN WEARING IT. C throws to receiver
        // C during a play and changes the play before one, and those two rows
        // never coexist, so the right answer is to look rather than to decide.
        const named = { snap: 'S', keep: KEEP_KEY, view: VIEW_KEY, skip: SKIP_KEY }[want];
        const wanted = named
            ? box.querySelector(`[data-keys*="${named}"]`)
            : (box.querySelector(`[data-letter="${want}"]`)
                || box.querySelector(`[data-keys*="${want}"]`));
        if (!wanted) return;

        // The space bar scrolls a page and Enter is the browser's own way of
        // pressing a focused button, so this one is ours to take.
        event.preventDefault();
        wanted.click();
    }, signal ? { signal } : undefined);
}

/** Live: throw to any eligible receiver, or keep it. */
export function showInPlay(receivers) {
    const box = actions();
    if (!box) return;
    for (const pos of receivers) {
        const who = CFG.receivers[pos];
        box.appendChild(throwButton(
            pos, who ? who.letter : pos, who ? who.ink : CFG.teamInk[0],
            () => handlers.onThrow && handlers.onThrow(pos)
        ));
    }
    box.appendChild(bindKeys(button('Keep it', 'hud-btn hud-btn-primary',
        () => handlers.onRun && handlers.onRun(),
        'Keep the ball and run'), [KEEP_KEY]));
    const first = box.querySelector('.hud-btn');
    if (first) first.focus();
}

/** In flight, or after the whistle: nothing to press. */
export function clearActions() {
    actions();
}

/**
 * WHILE A REPLAY IS RUNNING, ONE WAY OUT.
 *
 * The game shows the highlights unasked and offers the rest (D36), which means
 * a visitor sometimes gets a replay they did not ask for and, until now, no way
 * to stop it: the HUD was hidden for the duration and the only choice was to
 * wait. That is a fine default and a bad dead end, and the two are separable.
 *
 * It takes focus, so a keyboard visitor can press Enter to get out of something
 * that started on its own, which is the case that matters most.
 */
export function showSkipReplay() {
    const box = actions();
    if (!box) return;

    /**
     * AND ONE WAY TO SEE IT FROM SOMEWHERE ELSE.
     *
     * QA round twenty-two. Looking round a replay used to be a drag, and a drag
     * asks a visitor to fly a camera around a moving subject with one finger
     * while watching something else: "too hard to control", which it was. This
     * is one press and cannot be got wrong.
     *
     * IT COMES FIRST because it is the one somebody actually wants during a
     * replay, and the skip is the way out rather than the point. The skip still
     * takes focus for the same reason it always did.
     */
    const swap = bindKeys(button('Switch view', 'hud-btn',
        () => handlers.onSwitchView && handlers.onSwitchView(),
        'Watch the replay from another side of the field'), [VIEW_KEY]);
    swap.id = 'switch-view-btn';
    box.appendChild(swap);

    const skip = bindKeys(button('Skip replay', 'hud-btn',
        () => handlers.onSkipReplay && handlers.onSkipReplay(),
        'Skip the replay and see the result'), [SKIP_KEY]);
    skip.id = 'skip-replay-btn';
    box.appendChild(skip);
    skip.focus();
}

/**
 * ...AND ONE WAY OUT OF THE CELEBRATION, FOR THE SAME REASON.
 *
 * An interception or a fifty holds the field for up to four seconds while the
 * team it went well for enjoys itself (see celebration.js). That is the point
 * of it, and it is also the one thing in this game that happens between the
 * whistle and the visitor being told what the whistle was FOR. A visitor who
 * has just given the ball away and wants to know what it cost should not have
 * to watch the party out.
 *
 * DELIBERATELY THE SAME SHAPE AS THE REPLAY SKIP, down to taking focus so
 * Enter presses it: they are the same promise made twice, and a visitor who
 * has learned one has learned the other. It needs no key of its own for that
 * reason, and because it is the only control on screen while it is there.
 */
export function showSkipCelebration() {
    const box = actions();
    if (!box) return;

    const skip = bindKeys(button('Skip', 'hud-btn',
        () => handlers.onSkipCelebration && handlers.onSkipCelebration(),
        'Skip the celebration and see the result'), [SKIP_KEY]);
    skip.id = 'skip-celebration-btn';
    box.appendChild(skip);
    skip.focus();
}

/**
 * ...AND OUT OF A MILESTONE SHOW, THE SAME PROMISE A THIRD TIME.
 *
 * A show is a reward, and a reward somebody cannot decline is a toll. Same
 * shape as the other two, same focus, and Escape presses it.
 */
export function showSkipShow() {
    const box = actions();
    if (!box) return;

    const skip = bindKeys(button('Skip', 'hud-btn',
        () => handlers.onSkipShow && handlers.onSkipShow(),
        'Skip the show and carry on'), [SKIP_KEY]);
    skip.id = 'skip-show-btn';
    box.appendChild(skip);
    skip.focus();
}

/**
 * THE TITLE OVER A SHOW: the number, and a line under it.
 *
 * Driven every frame by an amount from 0 to 1 rather than by a class and a
 * keyframe, because the show's own clock decides when it arrives and leaves, and
 * a skipped show has to take it away on the same frame. It is `aria-hidden`: the
 * number is announced once through the live region at the moment it lands, and a
 * title fading in and out would otherwise be read twice.
 */
export function setMilestoneTitle(level, amount, { calm = false } = {}) {
    const wrap = el('milestone');
    if (!wrap) return;
    const a = Math.max(0, Math.min(1, amount || 0));
    if (a <= 0) {
        wrap.hidden = true;
        return;
    }
    const number = el('milestone-number');
    if (number && number.textContent !== `${level}`) number.textContent = `${level}`;
    const line = el('milestone-line');
    const copy = CFG.milestones.copy[level] || '';
    if (line && line.textContent !== copy) line.textContent = copy;
    wrap.hidden = false;
    wrap.style.opacity = `${a}`;
    // A small rise into place, which is movement for its own sake and so is
    // left out for anybody who asked not to be moved about.
    wrap.style.transform = calm ? 'none' : `translateY(${((1 - a) * 0.6).toFixed(3)}rem)`;
}

export function hideMilestoneTitle() {
    const wrap = el('milestone');
    if (wrap) wrap.hidden = true;
}

/**
 * THERE IS NO LONGER A LINE UNDER THESE EXPLAINING THEM, and it is worth saying
 * why rather than leaving the gap.
 *
 * It read "Switch view for another angle, scroll or pinch to zoom", and it was
 * written when the camera was a DRAG: a gesture nobody is told about is a
 * feature nobody has. A labelled button is not a gesture. It says what it does
 * on its face, so the line under it was repeating the button and taking a strip
 * of the picture to do it (QA round twenty-three).
 *
 * The zoom lost its only mention along with it, which is the deliberate trade:
 * pinching and scrolling are what everything else on a phone does to a picture,
 * and the button is the one that needed announcing.
 */

/**
 * The welcome card.
 *
 * Shown once, before the first playbook. It states the scoring ladder in words,
 * which the field now also paints on the grass (see field.js). That is not a
 * duplication to tidy up: the card is read before a visitor has ever seen the
 * field, and the numerals are read while a play is running. The one that could
 * be dropped is the card's, and it is the one worth keeping, because somebody
 * arriving needs to know what game this is before they are shown a pitch.
 */
export function showWelcome(onStart, saved = null, onFresh = null) {
    const card = el('welcome');
    if (!card) { if (onStart) onStart(); return; }
    const box = el('welcome-actions');
    box.textContent = '';

    // A GAME LEFT HALF PLAYED IS OFFERED BACK, NOT RESUMED SILENTLY. Somebody
    // coming back to a tab they left open needs to be told where they are
    // before the playbook opens on play five, and being able to say no is part
    // of the offer: a visitor who wants a clean run should not have to finish
    // somebody else's game to get one.
    const note = el('welcome-resume');
    if (note) {
        note.hidden = !saved;
        if (saved) {
            note.textContent = `You are ${saved.playNumber} plays into a game, `
                + `with ${saved.total} on the board.`;
        }
    }

    const start = button(saved ? 'Back to the game' : 'Take the field',
        'hud-btn hud-btn-primary', () => {
            card.hidden = true;
            if (onStart) onStart();
        });
    box.appendChild(start);

    if (saved && onFresh) {
        box.appendChild(button('Start a new game', 'hud-btn', () => {
            card.hidden = true;
            onFresh();
        }, 'Discard that game and start a new one'));
    }

    card.hidden = false;
    start.focus();
}

/**
 * The result card.
 *
 * Opens after every whistle with what happened and what it was worth, and one
 * button onward. It takes focus so the game can be played entirely by keyboard
 * without ever hunting for where the focus went.
 */
export function showResult(outcome, playNumber, playsPerGame, runningTotal, canReplay = false) {
    const card = el('result');
    if (!card) return;
    const isLast = playNumber >= playsPerGame;

    el('result-headline').textContent = outcome.headline;
    el('result-detail').textContent = outcome.detail;

    const points = el('result-points');
    points.textContent = `${outcome.points > 0 ? '+' : ''}${outcome.points}`;
    points.className = `result-points ${outcome.points > 0 ? 'is-good'
        : outcome.points < 0 ? 'is-bad' : 'is-neutral'}`;

    el('result-running').textContent = `Score ${runningTotal} after ${playNumber} of ${playsPerGame}`;

    const box = el('result-actions');
    box.textContent = '';

    // THE REPLAY IS OFFERED ON EVERY PLAY, not only the good ones. The game
    // shows the highlights unasked (see main.js), but a visitor who wants to
    // see the one where it went wrong should not have to have been lucky.
    if (handlers.onReplay && canReplay) {
        box.appendChild(button('Watch the replay', 'hud-btn',
            () => handlers.onReplay(), 'Watch a replay of this play'));
    }

    const next = button(isLast ? 'See how you did' : 'Next play',
        'hud-btn hud-btn-primary', () => handlers.onNext && handlers.onNext());
    box.appendChild(next);

    card.hidden = false;
    next.focus();

    announce(`${outcome.headline}. ${outcome.detail} `
        + `${outcome.points > 0 ? 'Plus' : ''}${outcome.points} points. `
        + `Score ${runningTotal} after play ${playNumber} of ${playsPerGame}.`);
}

export function hideResult() {
    const card = el('result');
    if (card) card.hidden = true;
}
