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
    wireMute();
}

/**
 * The mute button.
 *
 * It lives in the HUD bar rather than the action row, because the action row is
 * rebuilt on every phase change and a sound control that vanishes while you are
 * looking at it is worse than no control. `aria-pressed` carries the state, so
 * a screen reader is told whether sound is on rather than having to infer it
 * from an icon it cannot see.
 */
function wireMute() {
    const btn = el('mute-btn');
    if (!btn || !handlers.isMuted) return;
    const paint = () => {
        const off = handlers.isMuted();
        btn.setAttribute('aria-pressed', off ? 'true' : 'false');
        btn.textContent = '';
        btn.appendChild(speakerIcon(off));
        const label = document.createElement('span');
        label.textContent = off ? 'Sound off' : 'Sound on';
        btn.appendChild(label);
    };
    btn.addEventListener('click', () => {
        if (handlers.onToggleMute) handlers.onToggleMute();
        paint();
    });
    paint();
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
    const snap = button('Snap the ball', 'hud-btn hud-btn-primary',
        () => handlers.onSnap && handlers.onSnap());
    snap.id = 'snap-btn';
    box.appendChild(snap);
    snap.focus();
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
    box.appendChild(button('Keep it', 'hud-btn hud-btn-primary',
        () => handlers.onRun && handlers.onRun(),
        'Keep the ball and run'));
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
    const skip = button('Skip replay', 'hud-btn',
        () => handlers.onSkipReplay && handlers.onSkipReplay(),
        'Skip the replay and see the result');
    skip.id = 'skip-replay-btn';
    box.appendChild(skip);
    skip.focus();
}

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
