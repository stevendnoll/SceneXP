// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * photo-ui.js - THE PHOTO SHEET (specs/xo-photos-plan, Step 5): the best
 * moments of the play just over, one at a time, with a way to send each to
 * the device's share sheet or save it.
 *
 * The markup is static in index.html, as the Team colors card's is. This file
 * wires it and keeps it truthful. The pictures are main.js's business, handed
 * in as `make(moment)`, which resolves to `{ picture, blob }`: the canvas the
 * photo was drawn on, and the file it was encoded to.
 *
 * MADE AHEAD, BECAUSE A SHARE SHEET NEEDS THE TAP. A browser opens one only
 * straight after the visitor's press, and drawing a frame and encoding a JPEG
 * can outlast that, so each photo is made as soon as it is on the sheet and
 * Share hands over a file that is already there (Corner Office's week card
 * and Derby Day's still, the same way). Until it is, Share says so and does
 * nothing. It is never `disabled`: disabling the focused control throws
 * keyboard focus out of the dialog.
 *
 * THE PICTURE IS THE CANVAS ITSELF, not an `<img>`: this page's policy lets
 * images come from the site or `data:`, and a canvas needs neither.
 *
 * NOTHING IS UPLOADED. A file goes to the share sheet or the downloads folder
 * (sharefile-1.0.0) and nowhere else.
 */
import { XO_CONFIG as CFG } from './config.min.js';
import { photoTitle, photoCaption, photoShareText, photoNudge } from './moments.min.js';
import { photoName } from './photo.min.js';
import { shareFile, canShareFiles, saveFile } from '../../shared/js/sharefile-1.0.0.min.js';

/** Everything the sheet says that is not about the moment. */
export const WORDS = Object.freeze({
    share: 'Share picture',
    save: 'Save picture',
    developing: 'Developing the photo…',
    shared: 'Shared.',
    saved: 'Your photo is in your downloads.',
    failed: "This browser couldn't make the picture. Please try again.",
    shareTitle: "X's and O's",
});

const el = (id) => (typeof document !== 'undefined' ? document.getElementById(id) : null);
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

let hooks = { make: null, report() {}, url: () => '' };
let wired = false;
/** The sheet while it is open: `{ moments, index, visitor, back, onEscape }`. */
let session = null;
/** Each moment's photo, made once a play: moment -> Promise<{ picture, blob }>.
 *  Weak, so a play's photos go when its moments do. */
const made = new WeakMap();
/** And what each one turned out to be, once it has. */
const ready = new WeakMap();
let sharing = false;
let armedUntil = -Infinity;

/**
 * Wire the sheet once. `make(moment)` draws a photo; `report(action, detail)`
 * is telemetry; `url()` is the address that goes with a shared picture.
 */
export function initPhotoSheet({ make, report, url } = {}) {
    hooks = {
        make: make || null,
        report: report || (() => {}),
        url: url || (() => ''),
    };
    if (wired) return;
    wired = true;
    if (typeof document !== 'undefined') document.addEventListener('click', swallowEarlyTap, true);
    const on = (id, fn) => { const b = el(id); if (b) b.addEventListener('click', fn); };
    on('photo-prev', () => step(-1));
    on('photo-next', () => step(1));
    on('photo-close', () => closePhotoSheet());
    on('photo-share', () => { sharePhoto(); });
}

/** Whether `node` is `root` or inside it. */
function within(root, node) {
    for (let n = node; n; n = n.parentElement || n.parentNode) {
        if (n === root) return true;
    }
    return false;
}

/** THE SHEET OPENS UNDER THE FINGER that pressed "See the photo", where Share
 *  is about to be, so a pointer press inside it is swallowed for a moment
 *  (Team colors does the same). The keyboard is exempt: Enter and Space
 *  arrive as a click with `detail` 0. */
function swallowEarlyTap(event) {
    if (!session || now() >= armedUntil || !event.detail) return;
    const card = el('photo');
    if (!card || !within(card, event.target)) return;
    event.preventDefault();
    event.stopPropagation();
}

/**
 * OPEN THE SHEET on `moments`, best first, at the first. `visitor` is the
 * slot the visitor's avatar plays, or null without one, which is also what
 * shows the nudge toward the avatar page. `back` is called when it closes.
 */
export function showPhotoSheet(moments, { visitor = null, back = null } = {}) {
    const card = el('photo');
    if (!card || !moments || !moments.length) { if (back) back(); return false; }
    session = { moments: moments.slice(), index: 0, visitor, back, onEscape: null };
    session.onEscape = (event) => {
        if (event.key !== 'Escape' || card.hidden) return;
        event.preventDefault();
        closePhotoSheet();
    };
    document.addEventListener('keydown', session.onEscape);
    const share = el('photo-share');
    if (share) share.textContent = canShareFiles(CFG.photo.type) ? WORDS.share : WORDS.save;
    const pager = el('photo-pager');
    if (pager) pager.hidden = session.moments.length < 2;
    const nudge = el('photo-nudge');
    if (nudge) nudge.hidden = Boolean(visitor);
    card.hidden = false;
    armedUntil = now() + CFG.photo.armFor * 1000;
    show(0);
    hooks.report('photo', { kind: 'opened', outcome: { moment: session.moments[0].kind, count: session.moments.length } });
    // The dialog takes focus, and is announced by its title and its caption.
    const panel = el('photo-panel');
    if (panel) panel.focus();
    return true;
}

/** Put moment `index` on the sheet, and start its photo if it is not made. */
function show(index) {
    if (!session) return;
    const n = session.moments.length;
    session.index = ((index % n) + n) % n;
    const m = session.moments[session.index];
    const caption = photoCaption(m, session.visitor);
    const set = (id, text) => { const node = el(id); if (node) node.textContent = text; };
    set('photo-title', photoTitle(m.kind));
    set('photo-caption', caption);
    set('photo-count', `${session.index + 1} of ${n}`);
    set('photo-nudge-text', photoNudge(m.kind));
    set('photo-status', '');
    hang(null);
    if (!made.has(m)) {
        made.set(m, Promise.resolve(hooks.make ? hooks.make(m) : null).then((done) => {
            ready.set(m, done || { picture: null, blob: null });
            return ready.get(m);
        }));
    }
    made.get(m).then((done) => {
        // Still the one on the sheet? A visitor can page on before it lands.
        if (!session || session.moments[session.index] !== m) return;
        hang(done && done.picture, caption);
    });
}

/**
 * THE PICTURE IN THE FRAME, or the words saying it is coming. The picture is
 * named by its caption, for anybody who cannot see it. Share says it is ready
 * by not being busy any more.
 */
function hang(picture, caption = '') {
    const frame = el('photo-frame');
    const wait = el('photo-wait');
    const share = el('photo-share');
    if (frame) {
        for (const child of [...(frame.children || [])]) {
            if (child !== wait && child && typeof child.remove === 'function') child.remove();
        }
    }
    if (picture && frame) {
        picture.className = 'photo-canvas';
        if (picture.setAttribute) {
            picture.setAttribute('role', 'img');
            picture.setAttribute('aria-label', caption);
        }
        frame.appendChild(picture);
    }
    if (wait) {
        wait.hidden = Boolean(picture);
        wait.textContent = WORDS.developing;
    }
    if (share) share.setAttribute('aria-disabled', picture ? 'false' : 'true');
}

function step(by) {
    if (!session || session.moments.length < 2) return;
    show(session.index + by);
}

/**
 * SEND IT ON: the share sheet, or the downloads folder where this browser
 * cannot share a file. A dismissed sheet is the visitor's decision and saves
 * nothing. A press while the photo is still developing, or while the last
 * press is still at work, is ignored. Resolves to how it went: 'shared',
 * 'cancelled', 'saved', 'failed', or '' when nothing was tried.
 */
export async function sharePhoto() {
    if (!session || sharing) return '';
    const m = session.moments[session.index];
    const done = ready.get(m);
    if (!done) {
        say(WORDS.developing);
        return '';
    }
    sharing = true;
    try {
        let how = 'failed';
        if (done.blob) {
            const name = photoName(m.kind);
            how = await shareFile(done.blob, name, {
                title: WORDS.shareTitle,
                text: photoShareText(m.kind, hooks.url()),
            });
            if (how === 'unavailable') {
                const url = typeof URL !== 'undefined' && URL.createObjectURL
                    ? URL.createObjectURL(done.blob) : '';
                how = url && saveFile(url, name) ? 'saved' : 'failed';
                // Long enough for the download to have taken it.
                if (url) setTimeout(() => URL.revokeObjectURL(url), 60000);
            }
        }
        if (how === 'shared') say(WORDS.shared);
        else if (how === 'saved') say(WORDS.saved);
        else if (how === 'failed') say(WORDS.failed);
        hooks.report('photo', { kind: how, outcome: { moment: m.kind } });
        return how;
    } finally {
        sharing = false;
    }
}

/** The sheet's own status line, inside the dialog, where a screen reader
 *  will read it. */
function say(text) {
    const status = el('photo-status');
    if (status) status.textContent = text;
}

/** Close it, and go back to the card it was opened from. */
export function closePhotoSheet() {
    const card = el('photo');
    if (!session || !card) return;
    const { back, onEscape } = session;
    session = null;
    card.hidden = true;
    if (onEscape) document.removeEventListener('keydown', onEscape);
    hang(null);
    if (back) back();
}

/** Whether the sheet is open, for main.js and the suite. */
export function photoSheetOpen() {
    return !!session;
}
