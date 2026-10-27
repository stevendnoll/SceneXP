// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * main.js - Your Avatar (/avatar/, specs/avatar PRD section 6): a visitor
 * makes a figure of themselves once, here, and every scene that shows the
 * visitor as a person dresses them that way.
 *
 * THE FIRST THIRTY SECONDS ARE WORDS AND ONE BUTTON. The panel says what this
 * is and what to do before the studio has finished loading, and Save is the
 * one filled button on it. The figure on the plinth is today's figure (the
 * saved one, or Leaf Blower's), so nothing has to be chosen to begin.
 *
 * NOTHING IS KEPT UNTIL SAVE. Every choice changes the figure on screen only.
 * Save keeps the avatar in this browser (avatar-1.0.0's store), draws its
 * portrait for the home page's chip, and the figure turns to face the
 * visitor and waves.
 *
 * NOTHING ARRIVES SILENTLY. A link (`#a=1....`) or an opened file shows its
 * figure on the plinth and asks "Keep this avatar?". The editor waits (inert)
 * until it is answered. The link is then taken out of the address bar
 * (replaceState, never a new history entry), so a reload does not ask again
 * and Back still leaves the page in one press.
 *
 * THE USAGE PINGS COUNT KINDS, NEVER CHOICES (PRD section 9, Steve's call of
 * 2026-10-26): see `pingChange` and the notes above it.
 *
 * `__test__` reaches the page's state for tests/avatar-init.test.mjs.
 */

import { AVATAR_PAGE as CONFIG } from './config.min.js';
import {
    createAvatarStore, normalizeAvatar, sameAvatar, randomAvatar, linkUrl, decodeLink, toFile, describeAvatar,
    DEFAULT_AVATAR, FILE_NAME
} from '../../shared/js/avatar-1.0.0.min.js';
import { RENDER_VERSION } from '../../shared/js/avatar-figure-1.0.0.min.js';
import { installShare } from '../../shared/js/share-1.0.0.min.js';
import { saveFile } from '../../shared/js/sharefile-1.0.0.min.js';
import { warmShaders } from '../../shared/js/warmup-1.0.0.min.js';
import { track, trackFinal, setProofHash, setMobile } from '../../shared/js/telemetry-1.0.0.min.js';
import { getProofOfWork } from '../../shared/js/boot-1.0.0.min.js';
import { createStudio } from './studio.min.js';
import { createEditor } from './editor.min.js';
import { createExporter } from './export.min.js';
import { returnTarget, readAvatarFile, FILE_ERRORS } from './transfer.min.js';

/** Everything the page says, in one place (house style: polite, no
 *  semicolons or em-dashes). */
export const WORDS = Object.freeze({
    saved: 'Your avatar is saved on this device. Scenes that show you will dress you this way.',
    savedFor: (name) => `Your avatar is saved on this device and ready for ${name}.`,
    saveFailed: "This browser isn't keeping anything for this site right now, so your avatar couldn't be saved. A private window is often the reason.",
    forgotten: 'Your avatar is forgotten on this browser. Scenes will show the usual figure again.',
    kept: 'Kept. This is your avatar on this device now.',
    declined: 'No changes. Your avatar is just as it was.',
    fileSaved: `${FILE_NAME} is in your downloads. On your other device, open this page and choose Open a file.`,
    unsaved: 'Not saved yet.',
    changed: 'You have changes that are not saved yet.',
    surprised: 'Here is a random look. Change anything you like, and press Save my avatar to keep it.',
    fromLink: 'This link brought an avatar with it. Keep this avatar?',
    fromFile: 'This file holds an avatar. Keep this avatar?',
    replaces: 'Keeping it replaces the one saved on this browser.',
    loading: 'Setting up the studio…',
    noStudio: "This browser can't draw the 3D studio, but your choices still work and you can save them.",
    labSaved: `The default portrait was saved as ${CONFIG.defaultPortrait.file}. It goes in www${CONFIG.defaultPortrait.path.replace(/\/[^/]*$/, '/')}.`,
    linkTitle: 'My SceneXP avatar',
    linkText: 'My avatar for SceneXP. Open this link to keep it on this device too.'
});

const $ = (id) => document.getElementById(id);

const state = {
    store: null,
    saved: null,          // the saved avatar, or null
    current: null,        // the figure on screen
    incoming: null,       // { avatar, from: 'link' | 'file' } while asking
    before: null,         // what was on screen before the question
    target: null,         // { path, name } for "Back to ..."
    studio: null,
    editor: null,
    exporter: null,       // Export my avatar (js/export.js)
    lab: false,
    // The usage pings: the page wired (a tab chosen while it is built is
    // not a visitor's), the visit's clock, the last field changed (one ping
    // per drag), and the first turn and zoom (counted once a visit).
    ready: false,
    session: { start: Date.now(), ended: false },
    recent: { key: '', at: 0 },
    pinged: { turn: false, zoom: false }
};

function reducedMotion() {
    try {
        return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) {
        return false;
    }
}

function isMobile() {
    try {
        return Boolean(window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || window.innerWidth < 768;
    } catch (e) {
        return false;
    }
}

function webgl2() {
    try {
        const c = document.createElement('canvas');
        return Boolean(window.WebGL2RenderingContext && c.getContext('webgl2'));
    } catch (e) {
        return false;
    }
}

function isLocalHost() {
    const h = window.location.hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '';
}

/** The status line under Save. A save is `good`: a green note with a check
 *  mark, since the plain line was easy to miss beside the wave (Steve's QA,
 *  2026-10-26). Any other word takes the note back to plain. */
function say(text, { good = false } = {}) {
    const status = $('av-status');
    status.textContent = text;
    status.classList.toggle('av-status-good', good);
}

/**
 * THE USAGE PINGS (Steve, 2026-10-26), through the shared telemetry part
 * like every scene's: counts of what KIND of thing was done, never what was
 * chosen (privacy.html: the avatar "is never in our usage pings"). So a
 * change says its field and not its value, an export its kind and not its
 * size, a save whether it was the first. Every parameter is one the server's
 * log keeps (action, kind, outcome, seconds), and one thing done is one ping:
 * a color picker dragged across a dozen values is one change
 * (`CHANGE_QUIET`), and Keep on an arriving avatar is one answer, not an
 * answer and a save. tests/avatar-init holds every ping to those rules.
 */
const CHANGE_QUIET = 1500;

/** One ping per field changed, until `CHANGE_QUIET` ms of quiet or another
 *  field. Returns whether it pinged. */
function pingChange(key) {
    const t = Date.now();
    if (state.recent.key === key && t - state.recent.at < CHANGE_QUIET) {
        state.recent.at = t;
        return false;
    }
    state.recent = { key, at: t };
    track('change', { kind: key });
    return true;
}

/** Where the visitor came from, for the log: a scene's folder name, 'home',
 *  or 'direct' for an address typed or followed from elsewhere. */
function origin() {
    if (!state.target) return 'direct';
    if (state.target.path === '/') return 'home';
    return state.target.path.replace(/\//g, '') || 'direct';
}

/** The visit's last ping, once: when the page is hidden or left. */
function endVisit() {
    if (state.session.ended) return;
    state.session.ended = true;
    trackFinal('session-end', { seconds: Math.round((Date.now() - state.session.start) / 1000) });
}

/** The camera's framing for a field: its own, or its tab's (the shoes
 *  look at the feet from the Clothes tab, 2026-10-26). */
export function frameOf(key) {
    const tab = CONFIG.tabs.find((t) => t.fields.some((f) => f.key === key));
    if (!tab) return 'body';
    const field = tab.fields.find((f) => f.key === key);
    return field.frame || tab.frame;
}

/** The figure on screen becomes `avatar`: the studio, the radios, and the
 *  canvas's description. */
function show(avatar) {
    state.current = normalizeAvatar(avatar);
    if (state.studio) state.studio.setAvatar(state.current);
    if (state.editor) state.editor.set(state.current);
    $('av-canvas').setAttribute('aria-label', describeAvatar(state.current));
}

/** The note under Save, the Forget button, and the way back. */
function refresh() {
    const { saved, current } = state;
    let note = '';
    if (saved && !sameAvatar(saved, current)) note = WORDS.changed;
    else if (!saved && !sameAvatar(DEFAULT_AVATAR, current)) note = WORDS.unsaved;
    $('av-unsaved').textContent = note;
    $('av-forget').hidden = !saved;
    const back = $('av-return');
    if (state.target) back.classList.toggle('av-return-ready', Boolean(saved) && !note);
}

/** Draw the portrait and keep it beside the avatar. Quietly nothing where
 *  there is no studio to draw it in. */
function keepPortrait(avatar) {
    if (!state.studio) return false;
    const src = state.studio.portrait(avatar);
    return src ? state.store.savePortrait(src, RENDER_VERSION) : false;
}

/** Save what is on screen. `silent` leaves the ping to the caller (Keep on
 *  an arriving avatar is one action). As a click handler it gets an event,
 *  which carries no such flag. */
function save({ silent = false } = {}) {
    const avatar = state.current;
    const first = !state.saved;
    if (!state.store.save(avatar)) {
        say(WORDS.saveFailed);
        if (!silent) track('save', { outcome: 'failed' });
        return false;
    }
    if (!silent) track('save', { outcome: first ? 'first' : 'again' });
    state.saved = state.store.load();
    keepPortrait(avatar);
    if (state.studio) state.studio.celebrate();
    say(state.target ? WORDS.savedFor(state.target.name) : WORDS.saved, { good: true });
    refresh();
    return true;
}

/**
 * Surprise me (Steve, 2026-10-26): a random look from every list, on the
 * plinth and in the radios, framed whole and facing the front (Steve's QA,
 * 2026-10-26: the plinth turns by itself, so after a few presses the new
 * look was showing its back). It changes the figure on screen only, like
 * any choice: Save keeps it, and a saved avatar is untouched until then.
 */
function surprise() {
    track('surprise');
    show(randomAvatar());
    if (state.studio) {
        state.studio.setFrame('body');
        state.studio.faceFront();
        state.studio.touch();
    }
    say(WORDS.surprised);
    refresh();
}

function askForget(open) {
    $('av-forget-confirm').hidden = !open;
    $('av-forget').hidden = open || !state.saved;
    if (open) $('av-forget-no').focus();
}

function forget() {
    track('forget');
    state.store.forget();
    state.saved = null;
    askForget(false);
    show(DEFAULT_AVATAR);
    say(WORDS.forgotten);
    refresh();
    $('av-save').focus();
}

/** Show an avatar that arrived by link or file, and ask. */
function ask(avatar, from) {
    track('incoming', { kind: from });
    if (!state.incoming) state.before = state.current;
    state.incoming = { avatar, from };
    show(avatar);
    $('av-incoming-text').textContent = from === 'file' ? WORDS.fromFile : WORDS.fromLink;
    $('av-incoming-replaces').hidden = !state.saved;
    $('av-incoming').hidden = false;
    $('av-editor').inert = true;
    $('av-actions').inert = true;
    if (state.studio) state.studio.faceFront();
    $('av-keep').focus();
}

function answered() {
    state.incoming = null;
    state.before = null;
    $('av-incoming').hidden = true;
    $('av-editor').inert = false;
    $('av-actions').inert = false;
}

function keep() {
    if (!state.incoming) return false;
    const { from } = state.incoming;
    answered();
    const kept = save({ silent: true });
    track('incoming', { kind: from, outcome: kept ? 'kept' : 'failed' });
    if (kept) say(WORDS.kept, { good: true });
    $('av-save').focus();
    return true;
}

function decline() {
    if (!state.incoming) return false;
    const { from } = state.incoming;
    track('incoming', { kind: from, outcome: 'declined' });
    const back = state.before;
    answered();
    show(back);
    say(WORDS.declined);
    refresh();
    $('av-save').focus();
    return true;
}

/** A link's avatar, from the address, asked about once; the link is then
 *  taken out of the address bar without a new history entry. */
function readLink() {
    const avatar = decodeLink(window.location.hash || '');
    if (!avatar) return false;
    try {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
    } catch (e) { /* the address keeps it, which only means a reload asks again */ }
    ask(avatar, 'link');
    return true;
}

async function openFile(file) {
    const result = await readAvatarFile(file);
    if (result.error) {
        if (FILE_ERRORS[result.error]) say(FILE_ERRORS[result.error]);
        // A file that opened is counted as it arrives (`ask`); one that
        // did not is counted here, by what went wrong.
        track('file', { kind: 'open', outcome: result.error });
        return false;
    }
    ask(result.avatar, 'file');
    return true;
}

function saveAvatarFile() {
    track('file', { kind: 'save' });
    const blob = new Blob([toFile(state.current)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    saveFile(url, FILE_NAME);
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    say(WORDS.fileSaved);
}

function saveDefaultPortrait() {
    if (!state.studio) return false;
    const src = state.studio.portrait(DEFAULT_AVATAR, { jpegAbove: Infinity });
    if (!src) return false;
    saveFile(src, CONFIG.defaultPortrait.file);
    say(WORDS.labSaved);
    return true;
}

/** A portrait drawn by an older figure (or missing) is drawn again. */
function refreshPortrait() {
    if (!state.saved || !state.studio) return false;
    const stored = state.store.loadPortrait();
    if (stored && stored.r === RENDER_VERSION) return false;
    return keepPortrait(state.saved);
}

function wire() {
    $('av-save').addEventListener('click', save);
    $('av-random').addEventListener('click', surprise);
    // Export my avatar (2026-10-26): the figure on screen, saved or not.
    // The dialog makes its own stage when it opens and lets it go when it
    // closes, so the page's studio is untouched.
    $('av-export-open').addEventListener('click', () => {
        track('export', { kind: 'open' });
        if (!state.exporter) {
            state.exporter = createExporter(CONFIG, {
                mobile: isMobile(),
                reducedMotion,
                onExport: (kind, outcome) => track('export', { kind, outcome })
            });
        }
        state.exporter.open(state.current);
    });
    $('av-forget').addEventListener('click', () => askForget(true));
    $('av-forget-yes').addEventListener('click', forget);
    $('av-forget-no').addEventListener('click', () => {
        askForget(false);
        $('av-forget').focus();
    });
    $('av-keep').addEventListener('click', keep);
    $('av-decline').addEventListener('click', decline);
    installShare($('av-link'), () => ({
        title: WORDS.linkTitle,
        text: WORDS.linkText,
        url: linkUrl(state.current, window.location.origin)
    }), { status: $('av-status'), message: 'Link copied', onShare: (how) => track('share', { kind: how }) });
    $('av-file-save').addEventListener('click', saveAvatarFile);
    const picker = $('av-file-input');
    $('av-file-open').addEventListener('click', () => picker.click());
    picker.addEventListener('change', () => {
        const file = picker.files && picker.files[0];
        openFile(file).finally(() => { picker.value = ''; });
    });
    // The view's buttons, counted once a visit each (the turn and the
    // zoom), since what matters is whether they are found at all.
    const viewed = (what) => {
        if (state.pinged[what]) return;
        state.pinged[what] = true;
        track('view', { kind: what });
    };
    $('av-turn-left').addEventListener('click', () => { viewed('turn'); if (state.studio) state.studio.turnBy(-CONFIG.turntable.step); });
    $('av-turn-right').addEventListener('click', () => { viewed('turn'); if (state.studio) state.studio.turnBy(CONFIG.turntable.step); });
    $('av-zoom-in').addEventListener('click', () => { viewed('zoom'); if (state.studio) state.studio.zoomIn(); });
    $('av-zoom-out').addEventListener('click', () => { viewed('zoom'); if (state.studio) state.studio.zoomOut(); });
    // The way back, as the visit's own last word (sendBeacon survives the
    // page leaving), and the visit's end when the page is hidden or left.
    $('av-return').addEventListener('click', () => trackFinal('leave', { kind: origin() }));
    window.addEventListener('pagehide', endVisit);
    window.addEventListener('hashchange', readLink);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) endVisit();
        if (!state.studio) return;
        if (document.hidden) state.studio.stop();
        else state.studio.start();
    });
    if (state.lab) $('av-lab-portrait').addEventListener('click', saveDefaultPortrait);
}

export async function init() {
    $('avatar-app').hidden = false;
    state.store = createAvatarStore();
    state.saved = state.store.hasSaved() ? state.store.load() : null;
    state.target = returnTarget(window.location.search);
    state.lab = isLocalHost() && /(^|[?&])lab=1(&|$)/.test(window.location.search.slice(1));

    // The way back reads "Back to SceneXP" as it ships; a scene that sent
    // the visitor here names itself instead.
    if (state.target) {
        $('av-return').href = state.target.path;
        $('av-return-text').textContent = `Back to ${state.target.name}`;
    }
    $('av-lab').hidden = !state.lab;

    const stageStatus = $('av-stage-status');
    stageStatus.textContent = WORDS.loading;
    if (webgl2()) {
        try {
            state.studio = createStudio(CONFIG, { canvas: $('av-canvas'), mobile: isMobile(), reducedMotion });
        } catch (e) {
            state.studio = null;
        }
    }
    show(state.saved || DEFAULT_AVATAR);
    state.editor = createEditor({
        tablist: $('av-tabs'),
        panels: $('av-panels'),
        tabs: CONFIG.tabs,
        avatar: state.current,
        onChange(key, id) {
            pingChange(key);
            show({ ...state.current, [key]: id });
            if (state.studio) {
                // The camera goes to what was just chosen (the eyes, the shoes).
                state.studio.setFrame(frameOf(key));
                state.studio.touch();
            }
            refresh();
        },
        // A tab frames its part of the figure (the face, the feet, or the
        // whole figure for the clothes), and is where + zooms from then on.
        // Steve's QA, 2026-10-24: tabs that zoomed were clunky only while
        // there was no way back out; with the zoom by hand, they should.
        // The first tab, shown as the page opens, frames nothing.
        onTab(tab) {
            if (state.ready) track('tab', { kind: tab.id });
            if (!state.studio) return;
            state.studio.setZoomTarget(tab.frame);
            state.studio.setFrame(tab.frame);
        }
    });
    wire();
    state.ready = true;
    // The visit's pings: the proof of work first, so every ping carries the
    // hash that groups a visit (the same token the scenes use, so a visitor
    // who came from one is still one visitor in the log), then the start,
    // with where they came from and whether an avatar was waiting.
    setMobile(isMobile());
    const proof = await getProofOfWork(CONFIG.proofOfWork);
    setProofHash(proof && proof.hash);
    track('session-start', { kind: origin(), outcome: state.saved ? 'saved' : 'new' });
    readLink();
    refresh();

    if (!state.studio) {
        stageStatus.textContent = WORDS.noStudio;
        $('av-turn').hidden = true;
        return;
    }
    await warmShaders(state.studio.renderer, [{ scene: state.studio.scene, camera: state.studio.camera }]);
    state.studio.start();
    stageStatus.hidden = true;
    // Once a frame has sized the canvas, a stale portrait is drawn again.
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => refreshPortrait()));
}

export const __test__ = {
    state,
    save,
    surprise,
    forget,
    keep,
    decline,
    openFile,
    readLink,
    refreshPortrait,
    saveDefaultPortrait,
    askForget
};

if (typeof document !== 'undefined' && typeof window !== 'undefined' && document.getElementById('avatar-app')) {
    init().catch(() => {
        const status = document.getElementById('av-stage-status');
        if (status) status.textContent = WORDS.noStudio;
    });
}
