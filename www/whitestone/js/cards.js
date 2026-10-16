// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * cards.js - Opening, closing, and stacking Whitestone's dialogs, the element
 * factory, the live region and the undo toast.
 *
 * Adapted from Corner Office's cards.js (itself from Prospect City), where
 * every rule below was a bug somewhere on the site first. Only the ids and
 * the button classes differ.
 *
 * EVERY DIALOG IS STATIC MARKUP in index.html: an overlay with the card's id,
 * a panel with `<id>-panel`, and where there is one a close button with
 * `<id>-close`. This file only shows and hides them.
 *
 * THE OPEN CARDS ARE ALWAYS IN DOCUMENT ORDER. The shared focus trap takes
 * the LAST laid-out dialog in the document as the one to trap in, so a card
 * opened over one that comes later in the markup would leave Tab wandering
 * behind it. `openCard` closes any open card that comes after the one being
 * opened. CARD_ORDER is the markup's order and a test holds the two together,
 * and the order is the order cards open OVER each other: the checklist opens
 * a room or a task over itself, so they come after it.
 *
 * A TAP-OPENED CARD IS ARMED FOR 450 MS. A tap on the canvas that opens a
 * card lands a synthetic click on whatever button is under the finger a beat
 * later. Callers opening a card from a pointer event on the scene pass
 * `armed: true`, and the panel swallows pointer clicks for that long. A
 * keyboard press (a click with `detail` 0) is never swallowed.
 *
 * THE PRIMARY BUTTON IS NEVER FOCUSED ON OPEN. The panel itself takes focus
 * unless the caller names a text field, so a screen reader hears the title
 * first and a stray Enter cannot press anything.
 *
 * NO MARKUP FROM STRINGS, ANYWHERE. `h` builds elements and sets text through
 * textContent, because checklists carry what customers and cleaners typed.
 */

/** The dialogs, in the order they appear in the markup, which is the order
 *  they stack. The menu opens a task over itself, and the quote opens the
 *  checklist, so each comes before what it opens. */
export const CARD_ORDER = ['setup', 'preferences', 'quote', 'booking', 'receipt', 'visit-report', 'addons', 'checklist', 'room', 'task', 'confirm'];

const ARM_MS = 450;

let openIds = [];
const returnFocus = new Map();
const armedUntil = new Map();
const onCloseHooks = new Map();
/** Whether a card is being opened (its later cards closing first). */
let opening = false;
/** Called with the id of the last card to close, once none is open. */
let onSettled = null;
let liveTimer = null;
let toastTimer = null;
let toastHeld = false;
/** What the toast's Undo button does right now. Wired once in initCards. */
let toastUndo = null;

function byId(id) {
    return typeof document === 'undefined' ? null : document.getElementById(id);
}

// ---- The element factory ----------------------------------------------------

/**
 * Build an element. `props` may carry `className`, `id`, `type`, `text`,
 * `hidden`, `disabled`, `href`, `dataset` (an object), `attrs` (an object of
 * attributes), and `onClick`. Children are strings (set as text) or elements.
 * Nothing here parses markup.
 */
export function h(tag, props = {}, children = []) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
        if (value == null) continue;
        if (key === 'className') el.className = value;
        else if (key === 'attrs') for (const [k, v] of Object.entries(value)) el.setAttribute(k, v);
        else if (key === 'dataset') for (const [k, v] of Object.entries(value)) el.dataset[k] = v;
        else if (key === 'onClick') el.addEventListener('click', value);
        else if (key === 'text') el.textContent = value;
        else el[key] = value;
    }
    const list = Array.isArray(children) ? children : [children];
    for (const child of list) {
        if (child == null || child === false || child === '') continue;
        if (typeof child === 'string' || typeof child === 'number') {
            el.appendChild(document.createTextNode(String(child)));
        } else {
            el.appendChild(child);
        }
    }
    return el;
}

/** A button, the element built so often it earns a shorthand. */
export function button(label, className, onClick, attrs) {
    return h('button', { type: 'button', className, onClick, attrs }, label);
}

/** Empty a container. */
export function clear(el) {
    if (el) el.textContent = '';
}

// ---- Announcing -------------------------------------------------------------

/**
 * Say something through the polite live region. Cleared first and refilled a
 * beat later, so the same sentence twice is read twice.
 */
export function announce(text) {
    const live = byId('ws-live');
    if (!live) return;
    live.textContent = '';
    if (liveTimer) clearTimeout(liveTimer);
    liveTimer = setTimeout(() => { live.textContent = text; }, 30);
}

/**
 * Show a caption at the foot of the screen, with an Undo button when `undo`
 * is given. The words also go through `announce`, and the toast itself is not
 * a live region, so a screen reader hears them once. It stays up while focus
 * or the pointer is inside it, so nobody loses the Undo button mid-reach.
 */
export function toast(text, { undo = null, seconds = 7 } = {}) {
    const node = byId('ws-toast');
    const words = byId('toast-text');
    const undoBtn = byId('toast-undo');
    if (!node || !words) return;
    words.textContent = text;
    toastUndo = undo;
    if (undoBtn) undoBtn.hidden = !undo;
    node.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    const expire = () => {
        if (toastHeld) { toastTimer = setTimeout(expire, 1000); return; }
        hideToast();
    };
    toastTimer = setTimeout(expire, seconds * 1000);
}

export function hideToast() {
    const node = byId('ws-toast');
    if (node) node.hidden = true;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = null;
    toastHeld = false;
    toastUndo = null;
}

// ---- Open and close ---------------------------------------------------------

export function isOpen(id) {
    return openIds.includes(id);
}

export function anyOpen() {
    return openIds.length > 0;
}

export function topCard() {
    return openIds.length ? openIds[openIds.length - 1] : null;
}

function panelOf(id) {
    return byId(`${id}-panel`);
}

function isInsideAnyCard(el) {
    for (const id of openIds) {
        const overlay = byId(id);
        if (overlay && typeof overlay.contains === 'function' && overlay.contains(el)) return true;
    }
    return false;
}

/**
 * Show a card. Any open card later in the markup is closed first, so the
 * stack stays in document order. `focus` names an element to focus instead
 * of the panel. `onClose` runs once when this card closes. Returns the panel.
 */
export function openCard(id, { armed = false, focus = null, onClose = null } = {}) {
    const overlay = byId(id);
    if (!overlay) return null;
    const index = CARD_ORDER.indexOf(id);
    // The stack is not settled while a card is on its way in.
    opening = true;
    try {
        for (const other of [...openIds]) {
            if (CARD_ORDER.indexOf(other) > index) closeCard(other, { restoreFocus: false });
        }
    } finally {
        opening = false;
    }
    if (openIds.includes(id)) {
        const previous = onCloseHooks.get(id);
        if (previous) previous();
    } else {
        const active = typeof document !== 'undefined' ? document.activeElement : null;
        returnFocus.set(id, active && !isInsideAnyCard(active) ? active : returnFocus.get(topCard()) || active);
        openIds.push(id);
    }
    if (onClose) onCloseHooks.set(id, onClose);
    else onCloseHooks.delete(id);
    overlay.hidden = false;
    if (armed) armedUntil.set(id, Date.now() + ARM_MS);
    else armedUntil.delete(id);
    const target = focus || panelOf(id);
    if (target && typeof target.focus === 'function') target.focus({ preventScroll: true });
    return panelOf(id);
}

/** Hide a card and hand focus back to where it came from. */
// Where focus goes when a card closes and what opened it can no longer take
// it (setFocusFallback).
let focusFallback = null;

/**
 * Where focus lands when a closing card's opener is gone: hidden (a pulsing
 * marker is hidden under every card and retires once used; a Places item
 * closes with its menu; the follow-ups pill goes when nothing is due),
 * disabled, or out of the page. Without it the focus fell to nothing and a
 * keyboard visitor started again from the top of the page.
 */
export function setFocusFallback(fn) {
    focusFallback = typeof fn === 'function' ? fn : null;
}

/** Whether an element can take focus back: in the page, enabled, and
 *  neither it nor anything round it hidden. */
export function canTakeFocus(node) {
    if (!node || typeof node.focus !== 'function' || node.disabled) return false;
    if (node.isConnected === false) return false;
    for (let n = node; n; n = n.parentElement) if (n.hidden) return false;
    return true;
}

export function closeCard(id, { restoreFocus = true } = {}) {
    const overlay = byId(id);
    if (!overlay || !openIds.includes(id)) return;
    overlay.hidden = true;
    openIds = openIds.filter((o) => o !== id);
    armedUntil.delete(id);
    const hook = onCloseHooks.get(id);
    onCloseHooks.delete(id);
    const back = returnFocus.get(id);
    returnFocus.delete(id);
    if (hook) hook();
    if (restoreFocus) {
        const target = canTakeFocus(back) ? back : focusFallback && focusFallback(id);
        if (canTakeFocus(target)) target.focus({ preventScroll: true });
    }
    // The last card gone, focus handed back first.
    if (!openIds.length && !opening && onSettled) onSettled(id);
}

/**
 * What to do once the last open card has closed (setOnSettled): Maya
 * coming back to say what happened, when it was she who sent the visitor
 * to the card. Not called while a card is on its way in.
 */
export function setOnSettled(fn) {
    onSettled = typeof fn === 'function' ? fn : null;
}

/** Close whatever is on top. Returns its id, or null when nothing was open. */
export function closeTop() {
    const id = topCard();
    if (id) closeCard(id);
    return id;
}

/** Close the whole stack, focus going back to where it began. */
export function closeAll({ restoreFocus = true } = {}) {
    while (openIds.length > 1) closeCard(topCard(), { restoreFocus: false });
    if (openIds.length) closeCard(topCard(), { restoreFocus });
}

// ---- Wiring -----------------------------------------------------------------

/**
 * Wire every card's backdrop, close button, arming guard, and the Escape key,
 * and the toast's hold. Called once from main with the cleanup signal.
 */
export function initCards({ signal } = {}) {
    for (const id of CARD_ORDER) {
        const overlay = byId(id);
        if (!overlay) continue;
        overlay.hidden = true;
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) closeCard(id);
        }, { signal });
        const closeBtn = byId(`${id}-close`);
        if (closeBtn) closeBtn.addEventListener('click', () => closeCard(id), { signal });
        const panel = panelOf(id);
        if (panel) {
            panel.addEventListener('click', (event) => {
                const until = armedUntil.get(id);
                if (until && Date.now() < until && event.detail !== 0) {
                    event.stopPropagation();
                    event.preventDefault();
                }
            }, { capture: true, signal });
        }
    }
    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || !anyOpen()) return;
        event.preventDefault();
        closeTop();
    }, { signal });

    const undoBtn = byId('toast-undo');
    if (undoBtn) {
        undoBtn.addEventListener('click', () => {
            const run = toastUndo;
            hideToast();
            if (run) run();
        }, { signal });
    }
    const toastNode = byId('ws-toast');
    if (toastNode) {
        const hold = () => { toastHeld = true; };
        const release = () => { toastHeld = false; };
        toastNode.addEventListener('focusin', hold, { signal });
        toastNode.addEventListener('focusout', release, { signal });
        toastNode.addEventListener('pointerenter', hold, { signal });
        toastNode.addEventListener('pointerleave', release, { signal });
    }
}

// ---- The confirmation card --------------------------------------------------

/**
 * Ask before something that cannot be undone, or is a lot to undo. The detail
 * spells out the consequence. `onConfirm` runs after the card closes.
 */
export function confirmCard({ title, detail, confirmLabel = 'Yes', cancelLabel = 'Cancel', danger = false, onConfirm }) {
    const titleEl = byId('confirm-title');
    const detailEl = byId('confirm-detail');
    const actions = byId('confirm-actions');
    if (titleEl) titleEl.textContent = title;
    if (detailEl) detailEl.textContent = detail || '';
    if (actions) {
        clear(actions);
        actions.appendChild(button(cancelLabel, 'ws-btn', () => closeCard('confirm')));
        actions.appendChild(button(confirmLabel,
            danger ? 'ws-btn ws-btn-danger' : 'ws-btn ws-btn-primary',
            () => {
                closeCard('confirm');
                if (onConfirm) onConfirm();
            }));
    }
    openCard('confirm');
}

/** For tests: forget every open card, as a fresh page would. */
export function resetCards() {
    openIds = [];
    returnFocus.clear();
    armedUntil.clear();
    onCloseHooks.clear();
    opening = false;
    hideToast();
}

export const __test__ = { openIds: () => [...openIds], ARM_MS };
