// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * clip-ui.js - THE SHARE SHEET (specs/xo-photos-plan, Step 7): "Share the
 * play". The clip of the play just over, made as soon as the sheet opens and
 * played back in it when it is done, from whichever of the four vantage
 * points the visitor picks, and a way to send it to the device's share sheet
 * or save it. The sideline photo of the play's best moment stays underneath as
 * "Save a picture", and is all a browser that cannot record is offered.
 *
 * The markup is static in index.html (#clip), as the Team colors card's is.
 * This file wires it and keeps it truthful. The take itself is main.js's,
 * handed in: `take(stage, quarter, onFrame)` draws the frames into the stage
 * canvas and resolves when the last is drawn, `cancel()` lets a running one
 * go, `picture(moment)` makes the photo, `recording()` says whether and how
 * this browser records (null when it cannot), `calm()` is reduced motion.
 *
 * THE TAKE STARTS WHEN THE SHEET OPENS (D20), as Derby Day's clip does: the
 * visitor watches the replay being made, which IS the clip, and Share video
 * lights when it is done. Switch view (and V) starts a new take from the next
 * quarter (D16). The picture is made ahead, as before, so Share has a file
 * under the tap: a share sheet opens only straight after the visitor's press.
 * Share is never `disabled`: disabling the focused control throws keyboard
 * focus out of the dialog, so it is `aria-disabled` and says so when pressed.
 *
 * REDUCED MOTION (D24): the take is recorded unseen (the canvas laid out, as a
 * recording wants, but not shown) and the finished video waits for its play
 * button.
 *
 * NOTHING IS UPLOADED. The clip is made on the device, and a file goes to the
 * share sheet or the downloads folder (sharefile-1.0.0) and nowhere else.
 */
import { XO_CONFIG as CFG } from './config.min.js';
import { photoShareText, photoNudge } from './moments.min.js';
import { photoName } from './photo.min.js';
import { clipName, clipShareText, recordTake } from './clip.min.js';
import { REPLAY_VIEWS } from './camera.min.js';
import { extensionOf } from '../../shared/js/recorder-1.0.0.min.js';
import { shareFile, canShareFiles, saveFile } from '../../shared/js/sharefile-1.0.0.min.js';

/** Everything the sheet says. House style: no semicolons, no em-dashes. */
export const WORDS = Object.freeze({
    shareVideo: 'Share video',
    saveVideo: 'Save video',
    sharePicture: 'Share a picture',
    savePicture: 'Save a picture',
    making: 'Making your clip…',
    makingLeft: (s) => `Making your clip… ${s} ${s === 1 ? 'second' : 'seconds'} to go`,
    finishing: 'Finishing…',
    ready: (s) => `Your clip is ready, ${s} ${s === 1 ? 'second' : 'seconds'} long.`,
    readySaid: 'Your clip is ready to share.',
    stillMaking: 'Your clip is still being made.',
    noVideo: (verb) => `This browser can't make a video, but you can ${verb} a picture of the play.`,
    noVideoNoPicture: "This browser can't make a video of this play.",
    failed: (verb) => `Something went wrong making the video, but you can ${verb} a picture of the play.`,
    failedNoPicture: 'Something went wrong making the video. Please try another view.',
    developing: 'Developing the picture…',
    shared: 'Shared.',
    savedVideo: 'Your clip is in your downloads.',
    savedPicture: 'Your picture is in your downloads.',
    shareFailed: "This browser couldn't hand the file on. Please try again.",
    view: (n, of) => `View ${n} of ${of}`,
    viewSaid: (n, of) => `View ${n} of ${of}. Making the clip again from here.`,
    nudge: 'Want to be the one on the field?',
    shareTitle: "X's and O's",
    videoLabel: 'Your clip of the play',
});

const el = (id) => (typeof document !== 'undefined' ? document.getElementById(id) : null);
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const set = (id, text) => { const node = el(id); if (node) node.textContent = text; };

let hooks = {
    take: null, cancel() {}, picture: null, report() {}, url: () => '', recording: () => null, calm: () => false,
};
let wired = false;
/**
 * The sheet while it is open: `{ outcome, moment, visitor, back, quarter,
 * rec, running, clip, onKey, shown }`. `rec` is how this browser records, or
 * null. `running` is the take under way, `{ quarter, stage }`, or null.
 * `clip` is the finished one, `{ blob, mime, url, seconds, name, view }`, or
 * null. `shown` is the last whole second the countdown said.
 */
let session = null;
/** Each moment's picture, made once a play: moment -> Promise<{ picture, blob }>.
 *  Weak, so a play's pictures go when its moments do. */
const made = new WeakMap();
/** And what each one turned out to be, once it has. */
const ready = new WeakMap();
let sharing = false;
let armedUntil = -Infinity;

/**
 * Wire the sheet once. See the top of the file for what each hook does.
 */
export function initClipSheet({ take, cancel, picture, report, url, recording, calm } = {}) {
    hooks = {
        take: take || null,
        cancel: cancel || (() => {}),
        picture: picture || null,
        report: report || (() => {}),
        url: url || (() => ''),
        recording: recording || (() => null),
        calm: calm || (() => false),
    };
    if (wired) return;
    wired = true;
    if (typeof document !== 'undefined') document.addEventListener('click', swallowEarlyTap, true);
    const on = (id, fn) => { const b = el(id); if (b) b.addEventListener('click', fn); };
    on('clip-view', () => { switchClipView(); });
    on('clip-picture', () => { sharePicture(); });
    on('clip-close', () => closeClipSheet());
    on('clip-share', () => { shareClip(); });
}

/** Whether `node` is `root` or inside it. */
function within(root, node) {
    for (let n = node; n; n = n.parentElement || n.parentNode) {
        if (n === root) return true;
    }
    return false;
}

/** THE SHEET OPENS UNDER THE FINGER that pressed "Share the play", where a
 *  button is about to be, so a pointer press inside it is swallowed for a
 *  moment (Team colors does the same). The keyboard is exempt: Enter and
 *  Space arrive as a click with `detail` 0. */
function swallowEarlyTap(event) {
    if (!session || now() >= armedUntil || !event.detail) return;
    const card = el('clip');
    if (!card || !within(card, event.target)) return;
    event.preventDefault();
    event.stopPropagation();
}

/** Is the key press in a text field, where the letter belongs to the field? */
function onTextField(target) {
    const tag = target && target.tagName ? String(target.tagName).toLowerCase() : '';
    return tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean(target && target.isContentEditable);
}

const wrap = (q) => (((Math.round(Number(q) || 0) % REPLAY_VIEWS) + REPLAY_VIEWS) % REPLAY_VIEWS);

/** Share or save, for the words about the picture, decided before it is pressed. */
function pictureVerb() {
    return canShareFiles(CFG.photo.type) ? 'share' : 'save';
}

/**
 * OPEN THE SHEET on the play just over. `outcome` is the result card's,
 * `moment` the play's best moment for the picture (or null for none),
 * `visitor` the slot the visitor's avatar plays, or null without one, which
 * is also what shows the nudge toward the avatar page. `quarter` is the
 * vantage point the clip opens from (D21). `back` is called when it closes.
 */
export function showClipSheet({ outcome = null, moment = null, visitor = null, quarter = 0, back = null } = {}) {
    const card = el('clip');
    if (!card) { if (back) back(); return false; }
    if (session) closeClipSheet();
    const rec = hooks.recording() || null;
    session = {
        outcome, moment, visitor, back, quarter: wrap(quarter), rec,
        running: null, clip: null, onKey: null, shown: -1,
    };
    session.onKey = (event) => {
        if (!session || card.hidden) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            closeClipSheet();
            return;
        }
        // V, the replay's own key for the same thing, from anywhere in the
        // sheet but a text field, and not with a modifier held.
        if ((event.key === 'v' || event.key === 'V') && !event.metaKey && !event.ctrlKey && !event.altKey
            && !onTextField(event.target)) {
            event.preventDefault();
            switchClipView();
        }
    };
    document.addEventListener('keydown', session.onKey);

    const nudge = el('clip-nudge');
    if (nudge) nudge.hidden = Boolean(visitor);
    set('clip-nudge-text', moment ? photoNudge(moment.kind) : WORDS.nudge);

    // The picture, with a moment to make it of. Made ahead.
    const pictureBtn = el('clip-picture');
    if (pictureBtn) {
        pictureBtn.hidden = !moment;
        pictureBtn.textContent = pictureVerb() === 'share' ? WORDS.sharePicture : WORDS.savePicture;
        pictureBtn.setAttribute('aria-disabled', 'true');
    }
    if (moment) developPicture(moment);

    set('clip-status', '');
    card.hidden = false;
    armedUntil = now() + CFG.clip.armFor * 1000;
    const share = el('clip-share');
    const viewBtn = el('clip-view');
    const tools = el('clip-tools');
    const result = outcome && outcome.result ? outcome.result : '';
    if (!rec) {
        // No video from this browser: the picture is the offer, said kindly.
        if (share) share.hidden = true;
        if (viewBtn) viewBtn.hidden = true;
        if (tools) tools.hidden = true;
        clearStage();
        progress(moment ? WORDS.noVideo(pictureVerb()) : WORDS.noVideoNoPicture);
        hooks.report('clip', { kind: 'unsupported', outcome: { result } });
    } else {
        if (share) {
            share.hidden = false;
            share.textContent = canShareFiles(rec.mime.split(';')[0]) ? WORDS.shareVideo : WORDS.saveVideo;
        }
        if (viewBtn) viewBtn.hidden = false;
        if (tools) tools.hidden = false;
        startTake();
        hooks.report('clip', { kind: 'opened', outcome: { result, view: session.quarter + 1 } });
    }
    // The dialog takes focus, and is announced by its title and its progress.
    const panel = el('clip-panel');
    if (panel) panel.focus();
    return true;
}

/** The stage emptied: the canvas being recorded or the video playing. */
function clearStage() {
    const stage = el('clip-stage');
    if (!stage) return;
    for (const child of [...(stage.children || [])]) {
        if (child && typeof child.remove === 'function') child.remove();
        else if (stage.removeChild) stage.removeChild(child);
    }
}

function progress(text) {
    set('clip-progress', text);
}

/** The sheet's own status line, inside the dialog, where a screen reader
 *  will read it. */
function say(text) {
    set('clip-status', text);
}

function setShareBusy(busy) {
    const share = el('clip-share');
    if (share) share.setAttribute('aria-disabled', busy ? 'true' : 'false');
}

/** Let go of a finished clip's file and address. */
function releaseClip() {
    if (!session || !session.clip) return;
    const { url } = session.clip;
    session.clip = null;
    if (url && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        try { URL.revokeObjectURL(url); } catch (e) { /* already gone */ }
    }
}

/**
 * START A TAKE from the session's quarter: a fresh canvas in the stage, the
 * recorder on it, main.js drawing the frames. A take already running is let
 * go, and so is a finished clip, because the visitor asked for another view.
 */
function startTake() {
    const s = session;
    if (!s || !s.rec || !hooks.take) return false;
    hooks.cancel();
    releaseClip();
    const stage = document.createElement('canvas');
    stage.className = 'clip-canvas';
    stage.setAttribute('aria-hidden', 'true');
    // Reduced motion: recorded, not watched. The canvas keeps its layout.
    if (hooks.calm() && stage.classList) stage.classList.add('is-unseen');
    clearStage();
    const holder = el('clip-stage');
    if (holder) holder.appendChild(stage);
    const run = { quarter: s.quarter, stage };
    s.running = run;
    s.shown = -1;
    progress(WORDS.making);
    setShareBusy(true);
    set('clip-view-count', WORDS.view(s.quarter + 1, REPLAY_VIEWS));
    const onFrame = (left) => {
        if (session !== s || s.running !== run) return;
        const n = Math.max(0, Math.ceil(left));
        if (n === s.shown) return;
        s.shown = n;
        progress(n > 0 ? WORDS.makingLeft(n) : WORDS.finishing);
    };
    const current = () => session === s && s.running === run;
    recordTake(stage, () => hooks.take(stage, run.quarter, onFrame), {
        w: s.rec.w, h: s.rec.h, mime: s.rec.mime, fps: s.rec.fps, bitrate: s.rec.bitrate,
    }).then((clip) => {
        if (!current()) return;
        s.running = null;
        if (!clip) {
            // Refused, with the sheet still waiting on it: nothing to show.
            failedTake();
            return;
        }
        finishedTake(clip);
    }).catch(() => {
        if (!current()) return;
        s.running = null;
        failedTake();
    });
    return true;
}

function failedTake() {
    const s = session;
    if (!s) return;
    progress(s.moment ? WORDS.failed(pictureVerb()) : WORDS.failedNoPicture);
    say(s.moment ? WORDS.failed(pictureVerb()) : WORDS.failedNoPicture);
    hooks.report('clip', { kind: 'failed', outcome: { view: s.quarter + 1 } });
}

/** The clip is made: it plays in the stage, and Share video lights. */
function finishedTake(clip) {
    const s = session;
    if (!s) return;
    const ext = extensionOf(clip.mime);
    const url = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
        ? URL.createObjectURL(clip.blob) : '';
    s.clip = {
        blob: clip.blob, mime: clip.mime, url, seconds: clip.seconds,
        name: clipName(s.outcome && s.outcome.result, s.rec.w, s.rec.h, ext),
        view: s.quarter + 1,
    };
    const calm = hooks.calm();
    const video = document.createElement('video');
    video.className = 'clip-video';
    if (url) video.src = url;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.controls = true;
    // Reduced motion: the clip waits for its play button.
    video.autoplay = !calm;
    video.setAttribute('aria-label', WORDS.videoLabel);
    clearStage();
    const holder = el('clip-stage');
    if (holder) holder.appendChild(video);
    if (!calm && typeof video.play === 'function') {
        const p = video.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
    }
    const seconds = Math.round(clip.seconds);
    progress(WORDS.ready(seconds));
    say(WORDS.readySaid);
    const share = el('clip-share');
    if (share) share.textContent = canShareFiles(clip.blob.type || clip.mime) ? WORDS.shareVideo : WORDS.saveVideo;
    setShareBusy(false);
    // `seconds` rides on its own, where the log keeps it.
    hooks.report('clip', { kind: 'made', outcome: { format: ext, view: s.quarter + 1 }, seconds });
}

/**
 * THE NEXT VANTAGE POINT, and the clip made again from it. The replay's
 * own order: the opposite end first, then the two touchlines, then round.
 * Says which, for anybody who cannot see the count.
 */
export function switchClipView() {
    if (!session || !session.rec) return false;
    session.quarter = wrap(session.quarter + 1);
    say(WORDS.viewSaid(session.quarter + 1, REPLAY_VIEWS));
    hooks.report('clip', { kind: 'view', outcome: { view: session.quarter + 1 } });
    startTake();
    return true;
}

/** Start the picture of `moment` if it is not made, and light its button
 *  when it is, if it is still the one on the sheet. */
function developPicture(moment) {
    if (!made.has(moment)) {
        made.set(moment, Promise.resolve(hooks.picture ? hooks.picture(moment) : null).then((done) => {
            ready.set(moment, done || { picture: null, blob: null });
            return ready.get(moment);
        }));
    }
    made.get(moment).then(() => {
        if (!session || session.moment !== moment) return;
        const pictureBtn = el('clip-picture');
        if (pictureBtn) pictureBtn.setAttribute('aria-disabled', 'false');
    });
}

/**
 * SEND THE CLIP ON: the share sheet, or the downloads folder where this
 * browser cannot share a file. A dismissed sheet is the visitor's decision
 * and saves nothing. A press while the clip is still being made, or while
 * the last press is still at work, is ignored. Resolves to how it went:
 * 'shared', 'cancelled', 'saved', 'failed', or '' when nothing was tried.
 */
export async function shareClip() {
    if (!session || sharing) return '';
    const c = session.clip;
    if (!c) {
        say(WORDS.stillMaking);
        return '';
    }
    sharing = true;
    try {
        let how = await shareFile(c.blob, c.name, {
            title: WORDS.shareTitle,
            text: clipShareText(session.outcome, hooks.url()),
        });
        if (how === 'unavailable') how = c.url && saveFile(c.url, c.name) ? 'saved' : 'failed';
        if (how === 'shared') say(WORDS.shared);
        else if (how === 'saved') say(WORDS.savedVideo);
        else if (how === 'failed') say(WORDS.shareFailed);
        hooks.report('clip', { kind: how, outcome: { format: extensionOf(c.mime), view: c.view }, seconds: Math.round(c.seconds) });
        return how;
    } finally {
        sharing = false;
    }
}

/**
 * SEND THE PICTURE ON, the same way (the photo sheet's own ladder, Step 5).
 * Resolves as `shareClip` does.
 */
export async function sharePicture() {
    if (!session || sharing || !session.moment) return '';
    const m = session.moment;
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
        else if (how === 'saved') say(WORDS.savedPicture);
        else if (how === 'failed') say(WORDS.shareFailed);
        hooks.report('photo', { kind: how, outcome: { moment: m.kind } });
        return how;
    } finally {
        sharing = false;
    }
}

/** Close it: a take still running is let go, the clip's address with it, and
 *  back to the card it was opened from. */
export function closeClipSheet() {
    const card = el('clip');
    if (!session || !card) return;
    const { back, onKey } = session;
    hooks.cancel();
    releaseClip();
    session = null;
    card.hidden = true;
    if (onKey) document.removeEventListener('keydown', onKey);
    clearStage();
    if (back) back();
}

/** Whether the sheet is open, for main.js and the suite. */
export function clipSheetOpen() {
    return !!session;
}

/** The vantage point the sheet is on, 0 to 3, or -1 when it is closed. */
export function clipSheetView() {
    return session ? session.quarter : -1;
}
