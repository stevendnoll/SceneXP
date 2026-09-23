// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * controls.js - The decisions behind High Water's player controls.
 *
 * ADDED 2026-09-23, AND IT REVERSES A DESIGN DECISION ON PURPOSE. The scene was
 * built with nothing to press after Begin, on the thesis that there is nothing
 * to do but watch. Steve's real-world QA said otherwise: people want to stop a
 * frightening minute part way through, and to go back to the moment they
 * missed. So there is now a pause button, Escape, a pause card with Restart,
 * and a scrubber. They fade out when the pointer is still, which is how the
 * original thesis survives: the storm still gets the whole frame.
 *
 * PURE, AND NOTHING HERE TOUCHES THE DOM. main.js owns the elements and the
 * state; this file only answers questions about them, so every rule can be
 * tested without a canvas. Same split as storm.js, which is the only module
 * that knows what time it is.
 */

import { OCEAN_CONFIG } from './config.min.js';

/** What Escape should do right now: 'pause', 'resume', or null for nothing.
 *
 *  A TOGGLE, BECAUSE ESCAPE IS WHAT CLOSES THINGS. Once the pause card is up,
 *  Escape is the natural way to dismiss it, and a visitor who pressed it once to
 *  stop the storm will press it again to go back. Before Begin and after the
 *  ending there is no story running to pause, so it does nothing at all: the
 *  welcome card is not dismissible by design (it carries the content warning),
 *  and the ending card has nothing behind it to go back to. */
export function escapeAction({ begun, finished, paused }) {
    if (!begun || finished) return null;
    return paused ? 'resume' : 'pause';
}

/** Whether a key press belongs to whatever has focus rather than to the page.
 *
 *  THE WINDOW LISTENER HAS TO ASK. Escape means "cancel" to a text field and
 *  "close" to an open select, and a page-level listener that took it from them
 *  would be the same fault as the pan part taking a slider's arrow keys on
 *  2026-09-18. This page has no text field today, so this is the guard for the
 *  day it gets one. A range input is deliberately NOT editable here: Escape
 *  means nothing to it, and pausing from the scrubber is exactly right. */
export function isEditable(target) {
    if (!target) return false;
    if (target.isContentEditable) return true;
    const tag = String(target.tagName || '').toLowerCase();
    if (tag === 'textarea' || tag === 'select') return true;
    if (tag !== 'input') return false;
    const type = String(target.type || 'text').toLowerCase();
    return !['range', 'button', 'checkbox', 'radio', 'submit', 'reset'].includes(type);
}

/** The arc second a seek should land on, from a raw slider value.
 *
 *  NEVER QUITE THE END. `endGuardSeconds` short of it, so dragging to the far
 *  right plays the last instant of the fade instead of cutting to the ending
 *  card while the pointer is still down. */
export function seekTarget(value, config = OCEAN_CONFIG) {
    const end = config.storm.seconds - config.controls.endGuardSeconds;
    const at = Number(value);
    if (!Number.isFinite(at)) return 0;
    return Math.min(end, Math.max(0, at));
}

/** Where a key press on the scrubber should move the story, or null to leave the
 *  key alone.
 *
 *  HANDLED HERE RATHER THAN BY THE BROWSER because the slider runs in tenths of a
 *  second, so that a drag is smooth, and a native arrow press would move it by
 *  that tenth, which a visitor cannot see. Five seconds is the video-player
 *  convention. */
export function keySeekTarget(key, current, config = OCEAN_CONFIG) {
    const c = config.controls;
    const at = Number.isFinite(current) ? current : 0;
    switch (key) {
    case 'ArrowRight':
    case 'ArrowUp':
        return seekTarget(at + c.stepSeconds, config);
    case 'ArrowLeft':
    case 'ArrowDown':
        return seekTarget(at - c.stepSeconds, config);
    case 'PageUp':
        return seekTarget(at + c.pageSeconds, config);
    case 'PageDown':
        return seekTarget(at - c.pageSeconds, config);
    case 'Home':
        return 0;
    case 'End':
        return seekTarget(config.storm.seconds, config);
    default:
        return null;
    }
}

/** A clock reading for the pause card, "0:24". Whole seconds, rounded down, so
 *  it never claims a second the story has not reached. */
export function clockLabel(seconds) {
    const s = Math.max(0, Math.floor(Number(seconds) || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** What a screen reader hears for the scrubber, "24 seconds of 60".
 *
 *  Words rather than a clock reading, because "0:24" is read aloud as "zero
 *  colon twenty four" by more than one screen reader. */
export function valueText(seconds, config = OCEAN_CONFIG) {
    const s = Math.max(0, Math.floor(Number(seconds) || 0));
    const total = Math.round(config.storm.seconds);
    return `${s} ${s === 1 ? 'second' : 'seconds'} of ${total}`;
}

/** How far through the story, as a CSS percentage for the track's fill. */
export function progressPercent(seconds, config = OCEAN_CONFIG) {
    const p = Math.min(1, Math.max(0, (Number(seconds) || 0) / config.storm.seconds));
    return `${(p * 100).toFixed(2)}%`;
}

/** Whether the controls may fade out.
 *
 *  They stay up while the visitor is using them: mid drag, with the pointer
 *  resting on one, or with keyboard focus inside them. That last one is the
 *  accessibility rule rather than a nicety, because fading out the element that
 *  has keyboard focus takes the focus ring with it, and a keyboard visitor is
 *  then pressing keys at something they cannot see. */
export function mayIdle({ scrubbing, hovering, keyboardFocus }) {
    return !scrubbing && !hovering && !keyboardFocus;
}

/** Whether the lightning may run this frame.
 *
 *  Held for the whole of a drag and for `lightningHoldSeconds` after any seek.
 *  See that key in config for why this is a photosensitivity guard and not a
 *  cosmetic one. */
export function lightningAllowed({ scrubbing, holdSeconds }) {
    return !scrubbing && !(holdSeconds > 0);
}
