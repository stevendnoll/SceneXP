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
 */

const el = (id) => document.getElementById(id);
let handlers = {};

/** A to D, in roster order, which is how the 2D game numbered them. */
const THROW_LABEL = { wr1: 'A', wr2: 'B', wr3: 'C', wr4: 'D' };

function button(label, className, onClick, describedBy) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = className;
    b.textContent = label;
    if (describedBy) b.setAttribute('aria-label', describedBy);
    b.addEventListener('click', onClick);
    return b;
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
        btn.textContent = off ? 'Sound off' : 'Sound on';
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
        const label = THROW_LABEL[pos] || pos;
        box.appendChild(button(
            `Throw ${label}`, 'hud-btn',
            () => handlers.onThrow && handlers.onThrow(pos),
            `Throw to receiver ${label}`
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
 * The welcome card.
 *
 * Shown once, before the first playbook. It is the only place the scoring
 * ladder is written down: the 2D game paints those bands along the touchline
 * so it never had to say them in words, and the 3D field does not carry them
 * yet.
 */
export function showWelcome(onStart) {
    const card = el('welcome');
    if (!card) { if (onStart) onStart(); return; }
    const box = el('welcome-actions');
    box.textContent = '';
    const start = button('Take the field', 'hud-btn hud-btn-primary', () => {
        card.hidden = true;
        if (onStart) onStart();
    });
    box.appendChild(start);
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
