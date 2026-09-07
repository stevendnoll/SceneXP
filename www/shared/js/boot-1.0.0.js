// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * boot.js - Proof-of-work load gate (shared engine part)
 *
 * A deliberately tiny client-side proof of work run before the scene builds:
 * the browser hashes `${seed}:${nonce}` with SHA-256 until the hex digest
 * starts with the configured prefix. At a ~1-in-256 target a real visitor
 * clears it in a few milliseconds, while the simplest no-JS / no-crypto
 * crawlers never start the scene at all. With no backend to verify the result
 * this is a soft deterrent, not access control — a JavaScript-capable bot
 * will solve it like any browser.
 *
 * The solved proof ({ seed, nonce, hash, timestamp }) is cached in
 * sessionStorage and reused so reloads within a visit don't re-solve. Because
 * there is no server, a visitor could hand-write a bogus entry; we defend by
 * re-deriving the hash from the stored seed/nonce on read and rejecting
 * anything that doesn't reproduce the stored hash or no longer meets the
 * difficulty target.
 *
 * Usage: getProofOfWork({ prefix: '11', storageKey: 'gallery-pow',
 * maxAgeMs: 86400000 }) — all optional, defaults shown except the storage key
 * (default 'experience-pow'; experiences with cached visitor proofs under a
 * legacy key should keep passing it).
 */

// Effective settings, installed on each getProofOfWork call so the helper
// functions below don't need them threaded through.
let _prefix = '11';
let _storageKey = 'experience-pow';
let _maxAgeMs = 24 * 60 * 60 * 1000;

const _powEncoder = new TextEncoder();

export function bufToHex(buf) {
    const bytes = new Uint8Array(buf);
    let hex = '';
    for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
    return hex;
}

/** SHA-256 of a string, returned as a lowercase hex digest. Assumes the caller
 *  has already confirmed crypto.subtle is available. */
export async function sha256Hex(message) {
    const digest = await crypto.subtle.digest('SHA-256', _powEncoder.encode(message));
    return bufToHex(digest);
}

async function solveProofOfWork() {
    // crypto.subtle needs a secure context (https or localhost). If it is not
    // available, skip the gate rather than block a legitimate visitor.
    if (!(window.crypto && crypto.subtle && typeof crypto.randomUUID === 'function')) {
        return null;
    }
    const seed = `${Date.now()}-${crypto.randomUUID()}`;
    // Safety cap so a visitor is never trapped if the target is mis-set.
    for (let nonce = 0; nonce < 5_000_000; nonce++) {
        const hash = await sha256Hex(`${seed}:${nonce}`);
        if (hash.startsWith(_prefix)) {
            return { seed, nonce, hash, timestamp: Date.now() };
        }
        // Yield occasionally so the loading screen can paint.
        if ((nonce & 255) === 255) await new Promise(resolve => setTimeout(resolve, 0));
    }
    return null;
}

/** Re-derive the hash from a stored proof and confirm it is genuine: well-formed,
 *  fresh, still meets the difficulty target, and reproduces the stored hash
 *  from its own seed/nonce. Guards against a forged sessionStorage entry. */
async function isStoredProofValid(proof) {
    if (!proof || typeof proof.seed !== 'string' || !Number.isInteger(proof.nonce) ||
        typeof proof.hash !== 'string' || typeof proof.timestamp !== 'number') {
        return false;
    }
    const age = Date.now() - proof.timestamp;
    if (age < 0 || age > _maxAgeMs) return false;             // stale or future-dated
    if (!proof.hash.startsWith(_prefix)) return false;        // doesn't meet the target
    if (!(window.crypto && crypto.subtle)) return false;
    return (await sha256Hex(`${proof.seed}:${proof.nonce}`)) === proof.hash;
}

function readStoredProof() {
    try {
        const raw = sessionStorage.getItem(_storageKey);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null; // unparseable / sessionStorage unavailable
    }
}

function persistProof(proof) {
    try {
        sessionStorage.setItem(_storageKey, JSON.stringify(proof));
    } catch (e) {
        // sessionStorage can be unavailable (private mode, quota); the proof
        // still works for this load, it just won't be reused on the next one.
    }
}

/** Return a valid proof of work, reusing a fresh one from sessionStorage when
 *  available, otherwise solving a new one and persisting it for next time. */
export async function getProofOfWork(options = {}) {
    if (typeof options.prefix === 'string' && options.prefix) _prefix = options.prefix;
    if (typeof options.storageKey === 'string' && options.storageKey) _storageKey = options.storageKey;
    if (typeof options.maxAgeMs === 'number' && options.maxAgeMs > 0) _maxAgeMs = options.maxAgeMs;

    const stored = readStoredProof();
    if (await isStoredProofValid(stored)) return stored;
    const proof = await solveProofOfWork();
    if (proof) persistProof(proof);
    return proof;
}

// ---- Card focus trap (shared) ----------------------------------------------
//
// EVERY EXPERIENCE'S CARDS CLAIM `aria-modal="true"`, AND ONLY ONE OF THEM
// MADE IT TRUE. That attribute is a promise to a screen reader that the rest
// of the page is inert while the card is up, and nothing enforced it: Tab
// walked straight out of the card into the floating buttons behind the
// backdrop, and on the walkable scenes into the controls too. The
// visitor is then operating a page they cannot see, with a reader announcing
// a dialog they have already left.
//
// www/automan solved it per-scene during its accessibility sweep and this is
// that solution moved somewhere the other twelve can have it, edited into the
// existing shared part rather than cut as a new version (a duplicate file is
// what costs coverage, an in-place addition does not).
//
// It needs NO per-scene bookkeeping, which is the point: it reads the DOM the
// same way a screen reader does, so a scene wires it once and never has to
// keep it told about which card is open.

/** What can be tabbed to. `[tabindex="-1"]` is deliberately excluded: a card
 *  container may carry one so focus can LAND on the card when it opens
 *  (rather than on its primary action, which puts a stray Enter one keypress
 *  from an outbound link), and it must not become a tab stop of its own. */
const CARD_FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), '
    + 'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Visible in the layout sense, which is the sense that matters for a tab
 *  stop. Both offsets are zero for a `display: none` element and non-zero for
 *  anything laid out, so this catches BOTH ways these cards hide things: the
 *  `.hidden` class on the card itself, and the inline `style.display` some
 *  scenes use on individual actions that are not ready yet. A trap that
 *  counted a hidden action would wrap onto a control nobody can reach. */
function isLaidOut(el) {
    return el.offsetWidth > 0 || el.offsetHeight > 0;
}

/** The card currently up. Last one in document order wins, on the assumption
 *  these scenes only ever have one card open at a time, which is a rule they
 *  all already keep for their own reasons. */
function topmostOpenCard() {
    const cards = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
    let open = null;
    cards.forEach((card) => { if (isLaidOut(card)) open = card; });
    return open;
}

/** Wrap Tab around the open card, so the keyboard cannot leave it.
 *
 *  Call once per scene, ideally with the scene's own AbortSignal so it comes
 *  off with everything else at teardown. Safe to call when the page has no
 *  cards: it does nothing until one is open. */
export function installCardFocusTrap(options = {}) {
    const opts = options.signal ? { capture: true, signal: options.signal }
        : { capture: true };
    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Tab') return;
        const card = topmostOpenCard();
        if (!card) return;

        const items = Array.from(card.querySelectorAll(CARD_FOCUSABLE)).filter(isLaidOut);
        if (!items.length) return;

        const first = items[0];
        const last = items[items.length - 1];
        const here = document.activeElement;
        // OUTSIDE COUNTS AS A WRAP. Focus can already be out of the card when
        // this fires (the card opened while the button that opened it still
        // had focus), and without this the first Tab of every visit escapes.
        const outside = !card.contains(here);

        if (event.shiftKey ? (here === first || outside) : (here === last || outside)) {
            (event.shiftKey ? last : first).focus();
            event.preventDefault();
        }
    }, opts);
}

/** Events that start a scene from its welcome overlay, across every theme.
 *  The walkable scenes listen for `click` (pointer lock) and, on touch, for
 *  `touchend`; the garden also arms on `touchstart`. */
const OVERLAY_START_EVENTS = ['click', 'touchstart', 'touchend'];

/** Let a control inside the welcome overlay do its own job.
 *
 *  THE OVERLAY IS THE BUTTON on most of these scenes: the whole `#blocker`
 *  is one click-to-start surface, and several themes call `preventDefault()`
 *  on the `touchend` that starts them. Both are fatal to a link sitting on
 *  top of it. The click bubbles up and starts the scene on the way out, so a
 *  visitor who wanted the directory gets a locked pointer as well; and on a
 *  phone the overlay's `preventDefault()` suppresses the synthetic click, so
 *  the link never navigates at all and the tap simply starts the scene. That
 *  second one is the nastier of the two, because it looks like the link is
 *  not there.
 *
 *  So stop the start events short of the overlay. Deliberately NOT
 *  `preventDefault()` here, which is the one difference from Earth Defense's
 *  briefing button doing this inline: that is a `<button>` with no default
 *  worth keeping, and this is an anchor that still has to follow its href.
 *
 *  Call it for any control on an overlay that dismisses itself on a stray tap,
 *  which is every welcome screen on the site except High Water's, whose card
 *  has an explicit Begin button and no surface handler at all. If you are not
 *  sure which kind you are looking at, call it: three listeners that stop
 *  events nobody fires cost nothing, and the failure it prevents is silent.
 *
 *  Returns true when it wired something, so a caller can tell a missing
 *  element from a wired one. */
export function shieldOverlayControl(el, options = {}) {
    if (!el || typeof el.addEventListener !== 'function') return false;
    const opts = options.signal ? { signal: options.signal } : undefined;
    const stop = (event) => event.stopPropagation();
    OVERLAY_START_EVENTS.forEach((type) => el.addEventListener(type, stop, opts));
    return true;
}
