// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * main.js - Meme Studio (/meme/, specs/meme PRD): the visitor's own avatar
 * stars in a meme laid out as a grid of small lit 3D boxes, captioned by the
 * visitor and shared as a picture, a short video, or a link a friend can
 * remix with their own avatar.
 *
 * THE FIRST THIRTY SECONDS ARE WORDS AND ONE NEXT STEP. The sheet says what
 * this is and what to do before the stage has finished loading.
 *
 * M3 (2026-10-27): the editor on a phone. Three tabs (Meme, Captions,
 * People); the picker with a glyph of each grid; a caption field a slot; a
 * row of expression chips a panel; the view buttons that step into a panel
 * by keyboard; the last meme kept in this browser and restored on return.
 * The people, the rest of the templates, the remix link and the clip
 * arrive milestone by milestone (specs/meme/TASKS.md).
 *
 * NOTHING IS UPLOADED. The avatar store is read, never written, by this
 * page; the meme store (state.js) is this page's own. The usage pings count
 * kinds of things done (which template, what happened to a picture), never
 * what was typed.
 *
 * `__test__` reaches the page's state for tests/meme-init.test.mjs.
 */

import { MEME_PAGE as CONFIG } from './config.min.js';
import { createAvatarStore, randomAvatar } from '../../shared/js/avatar-1.0.0.min.js';
import { EXPRESSIONS } from '../../shared/js/avatar-expressions-1.0.0.min.js';
import { warmShaders } from '../../shared/js/warmup-1.0.0.min.js';
import { track, trackFinal, setProofHash, setMobile } from '../../shared/js/telemetry-1.0.0.min.js';
import { getProofOfWork } from '../../shared/js/boot-1.0.0.min.js';
import { createStage } from './stage.min.js';
import { TEMPLATES, byOrder, slotsOf, templateOf } from './templates.min.js';
import { buildTabs, buildCaptionFields, buildTemplatePicker, buildExpressionRows, buildViewButtons } from './editor.min.js';
import { normalizeMeme, createMemeStore } from './state.min.js';
import { decodeRemix, remixUrl } from './remix.min.js';
import { installShare } from '../../shared/js/share-1.0.0.min.js';
import { drawCaptions } from './compose.min.js';
import { createExporter, WORDS as EXPORT_WORDS } from './exporter.min.js';

/** Everything the page says, in one place (house style: polite, no
 *  semicolons or em-dashes). */
export const WORDS = Object.freeze({
    loading: 'Setting up the studio…',
    noStage: "This browser can't draw the 3D stage. Please try another browser, or a newer one.",
    noAvatar: 'You have no avatar yet, so a visitor is standing in for you. Make yours at any time.',
    withAvatar: 'Your avatar is here. Pick a meme and type a caption to make it yours.',
    welcomeBack: 'Welcome back. Your last meme is just as you left it.',
    notKept: "This browser isn't keeping anything for this site right now, so your meme won't be here next time. A private window is often the reason.",
    cleared: 'Started over. The first meme is ready for you.',
    pictureSaved: EXPORT_WORDS.pictureSaved,
    pictureShared: EXPORT_WORDS.pictureShared,
    pictureFailed: EXPORT_WORDS.pictureFailed,
    personYou: 'You, as your avatar.',
    personStandIn: 'You, as a visitor standing in until you make your avatar.',
    personMaker: 'The friend who sent this meme, as their avatar.',
    personRandom: 'A visitor from the crowd.',
    fromFriend: 'A friend made this meme for you. Make it yours with your own avatar, or keep it as it is.',
    mine: "It's yours now. Your avatar is in the lead role.",
    mineNoAvatar: 'Make your avatar first, then come back here. This meme will be waiting.',
    keptTheirs: "Kept as your friend made it. Change anything you like, it's your copy.",
    linkTitle: 'A meme from SceneXP',
    linkText: 'Here is a meme I made with my avatar. Open it to put yourself in it.',
    linkCopied: 'Link copied'
});

const $ = (id) => document.getElementById(id);

/** The sheet's tabs and their panels, as the markup has them. */
export const TABS = Object.freeze([
    { tab: 'mm-tab-meme', panel: 'mm-panel-meme' },
    { tab: 'mm-tab-captions', panel: 'mm-panel-captions' },
    { tab: 'mm-tab-people', panel: 'mm-panel-people' }
]);

const RULES = () => ({ templates: TEMPLATES, byOrder, slotsOf, expressions: EXPRESSIONS.map((e) => e.id), maxChars: CONFIG.caption.maxChars });

const state = {
    store: null,          // the avatar store
    memes: null,          // the meme store (state.js)
    avatar: null,         // the saved avatar, or null
    standIn: null,        // a random avatar for a visitor with none saved
    maker: null,          // the avatar a link's meme was made with, while it leads
    friend: null,         // the avatar in the friend's role (D5, M5)
    incoming: false,      // a link's meme is on the stage, waiting for an answer
    template: null,
    captions: [],
    expressions: [],      // a cell's chosen face, or null for the template's
    sizeId: CONFIG.export.pictures[0].id,
    stage: null,
    exporter: null,
    fields: null,
    picker: null,
    tabs: null,
    views: null,
    rects: [],            // where each panel is on the stage, CSS pixels
    restored: false,
    ready: false,
    pinged: { typed: new Set(), stepped: false, faced: false },
    session: { start: Date.now(), ended: false }
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

/** The status line on the sheet. */
function say(text) {
    $('mm-status').textContent = text;
}

/** The meme as it stands, valid, for the store and (M4) the link. */
export function currentMeme() {
    return normalizeMeme({ template: state.template.id, captions: state.captions, expressions: state.expressions }, RULES());
}

/** Keep the meme in this browser. Quiet when the browser refuses. */
function keep() {
    if (!state.memes || !state.ready) return false;
    return state.memes.save(currentMeme());
}

/** The avatar a role wears: the maker's while a link's meme waits, else
 *  the visitor's (or the stand-in) for the lead; the friend's for the
 *  friend's role when one is kept (D5); a random cast member otherwise. */
export function avatarForRole(roleId) {
    const role = state.template.roles.find((r) => r.id === roleId);
    if (!role || role.cast === 'avatar') return state.maker || state.avatar || state.standIn;
    if (role.id === 'friend' && state.friend) return state.friend;
    return randomAvatar();
}

/** The avatar the lead wears right now, for the link. */
function leadAvatar() {
    return state.maker || state.avatar || state.standIn;
}

/** The chosen picture size, from the radios. */
export function readSize() {
    for (const p of CONFIG.export.pictures) {
        const input = $(`mm-size-${p.id}`);
        if (input && input.checked) return p.id;
    }
    return CONFIG.export.pictures[0].id;
}

/**
 * The captions over the live stage (the overlay canvas, drawn the way the
 * picture is, through compose.js), where the stage last said each panel
 * is. Drawn in CSS pixels on a canvas the stage's size.
 */
export function drawOverlay(rects = state.rects) {
    const overlay = $('mm-overlay');
    const stageCanvas = $('mm-canvas');
    if (!overlay || !state.template) return false;
    const w = stageCanvas.clientWidth || 0;
    const h = stageCanvas.clientHeight || 0;
    if (!w || !h) return false;
    const ratio = Math.min(window.devicePixelRatio || 1, CONFIG.quality.maxPixelRatio);
    const pw = Math.round(w * ratio);
    const ph = Math.round(h * ratio);
    if (overlay.width !== pw) overlay.width = pw;
    if (overlay.height !== ph) overlay.height = ph;
    const ctx = overlay.getContext('2d');
    if (!ctx) return false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pw, ph);
    ctx.scale(ratio, ratio);
    drawCaptions(ctx, state.template, state.captions, rects, CONFIG.caption);
    return true;
}

/** The preview of the picture, drawn once a frame at most. */
let previewPending = false;
export function refreshPreview() {
    if (!state.exporter || !state.stage) return false;
    if (previewPending) return true;
    previewPending = true;
    const draw = () => {
        previewPending = false;
        state.exporter.drawPreview($('mm-preview'), state.template, state.captions, state.sizeId);
    };
    if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(draw);
    else draw();
    return true;
}

function onCaption(k, value) {
    state.captions[k] = value;
    drawOverlay();
    refreshPreview();
    keep();
    if (state.ready && value && !state.pinged.typed.has(k)) {
        state.pinged.typed.add(k);
        track('caption-typed', { kind: state.template.id });
    }
}

function onExpression(cellIndex, id) {
    state.expressions[cellIndex] = id;
    if (state.stage) {
        state.stage.setExpression(cellIndex, id);
        state.stage.touch();
    }
    refreshPreview();
    keep();
    if (state.ready && !state.pinged.faced) {
        state.pinged.faced = true;
        track('expression-set', { kind: state.template.id });
    }
}

/** The People tab: who is in the meme and where each comes from (M5
 *  adds a friend's avatar and the reshuffle). */
function showPeople(template) {
    const list = $('mm-people');
    list.textContent = '';
    for (const role of template.roles) {
        const item = document.createElement('li');
        item.className = 'mm-person';
        const name = document.createElement('span');
        name.className = 'mm-person-role';
        name.textContent = role.label;
        const note = document.createElement('span');
        note.className = 'mm-person-note';
        if (role.cast === 'avatar') note.textContent = state.maker ? WORDS.personMaker : state.avatar ? WORDS.personYou : WORDS.personStandIn;
        else note.textContent = WORDS.personRandom;
        item.appendChild(name);
        item.appendChild(note);
        list.appendChild(item);
    }
    $('mm-make-avatar').hidden = Boolean(state.avatar);
}

/** Show a template with `meme`'s captions and faces: the panels built,
 *  the fields and the chips laid out, the preview drawn. */
export function showTemplate(template, meme = null) {
    state.template = template;
    const slots = slotsOf(template);
    state.captions = slots.map((_, k) => (meme ? meme.captions[k] : state.captions[k]) || '');
    state.expressions = template.cells.map((_, i) => (meme ? meme.expressions[i] : null) || null);
    if (state.stage) {
        state.stage.setTemplate(template, avatarForRole);
        state.expressions.forEach((id, i) => { if (id) state.stage.setExpression(i, id); });
    }
    state.fields = buildCaptionFields($('mm-captions'), {
        slots,
        captions: state.captions,
        maxChars: CONFIG.caption.maxChars,
        onInput: onCaption
    });
    buildExpressionRows($('mm-faces'), { template, expressions: EXPRESSIONS, chosen: state.expressions, onChoose: onExpression });
    state.views = buildViewButtons($('mm-view'), { count: template.cells.length, onView: (index) => { if (state.stage) state.stage.view(index); } });
    showPeople(template);
    if (state.picker) state.picker.select(template.id);
    state.rects = state.stage ? state.stage.screenRects() : [];
    drawOverlay();
    if (state.stage) state.stage.touch();
    refreshPreview();
}

export function pickTemplate(id) {
    const template = templateOf(id);
    if (state.template && template.id === state.template.id) return template;
    showTemplate(template);
    keep();
    if (state.ready) track('template-picked', { kind: template.id });
    return template;
}

// ---- A meme that arrived by link ----------------------------------------------

/** The link's fragment taken out of the address bar (replaceState, never
 *  a new history entry), so a reload does not ask again and Back still
 *  leaves the page in one press. */
function dropFragment() {
    try {
        if (window.history && typeof window.history.replaceState === 'function') {
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
    } catch (e) { /* a browser that will not: the fragment stays */ }
}

/** Show or hide the arrival card. */
function showIncoming(on) {
    state.incoming = on;
    $('mm-incoming').hidden = !on;
    $('mm-incoming-note').hidden = true;
}

/**
 * A meme in the address: shown as made, the maker's avatar in the lead,
 * and asked about. Returns true when one was there.
 */
export function readLink() {
    const found = decodeRemix(window.location.hash || '', RULES(), { max: CONFIG.remix.maxLength, normalize: normalizeMeme });
    if (!found) return false;
    state.maker = found.avatar;
    state.friend = null;
    showTemplate(templateOf(found.meme.template), found.meme);
    showIncoming(true);
    say(WORDS.fromFriend);
    if (state.tabs) state.tabs.select('mm-tab-meme');
    dropFragment();
    if (state.ready) track('arrived-by-link', { kind: state.template.id, outcome: found.avatar ? 'avatar' : 'no-avatar' });
    return true;
}

/**
 * Make it mine: the visitor's avatar takes the lead, and the maker's moves
 * to the friend's role when the template has one (D5). Without an avatar,
 * the way to make one, the meme kept for the return.
 */
export function makeItMine() {
    if (!state.incoming) return false;
    if (!state.avatar) {
        $('mm-incoming-note').hidden = false;
        say(WORDS.mineNoAvatar);
        keep();
        if (state.ready) track('make-it-mine', { kind: state.template.id, outcome: 'no-avatar' });
        return false;
    }
    const maker = state.maker;
    state.maker = null;
    state.friend = maker && state.template.roles.some((r) => r.id === 'friend') ? maker : null;
    showTemplate(state.template, currentMeme());
    showIncoming(false);
    say(WORDS.mine);
    keep();
    if (state.ready) track('make-it-mine', { kind: state.template.id, outcome: state.friend ? 'both' : 'avatar' });
    return true;
}

/** Keep it as it is: the friend's meme, their avatar and all, the
 *  visitor's copy to change. */
export function keepTheirs() {
    if (!state.incoming) return false;
    showIncoming(false);
    say(WORDS.keptTheirs);
    keep();
    if (state.ready) track('make-it-mine', { kind: state.template.id, outcome: 'theirs' });
    return true;
}

/** Start over: the first meme, nothing typed, the store cleared, the
 *  visitor's own avatar back in the lead. */
export function startOver() {
    state.captions = [];
    state.expressions = [];
    state.maker = null;
    state.friend = null;
    showIncoming(false);
    if (state.memes) state.memes.clear();
    showTemplate(byOrder()[0]);
    say(WORDS.cleared);
    if (state.tabs) state.tabs.select('mm-tab-meme');
    if (state.ready) track('start-over', { kind: state.template.id });
}

async function savePicture() {
    if (!state.exporter) return 'failed';
    state.sizeId = readSize();
    const result = await state.exporter.savePicture(state.template, state.captions, state.sizeId);
    if (result === 'shared') say(WORDS.pictureShared);
    else if (result === 'saved') say(WORDS.pictureSaved);
    else if (result === 'failed') say(WORDS.pictureFailed);
    return result;
}

/** The visit's last ping, once: when the page is hidden or left. */
function endVisit() {
    if (state.session.ended) return;
    state.session.ended = true;
    trackFinal('session-end', { seconds: Math.round((Date.now() - state.session.start) / 1000) });
}

/** A key the stage answers, unless something else on the page has the
 *  focus (a caption field keeps its Escape). */
function onKey(e) {
    if (e.key !== 'Escape' || !state.stage || state.stage.viewing === null) return;
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
    state.stage.view(null);
}

function wire() {
    $('mm-picture-save').addEventListener('click', savePicture);
    $('mm-start-over').addEventListener('click', startOver);
    $('mm-make-mine').addEventListener('click', makeItMine);
    $('mm-keep-theirs').addEventListener('click', keepTheirs);
    // The link: the meme and the lead's avatar, through the shared ladder
    // (the share sheet, the clipboard, a mail), the copy said on the sheet.
    installShare($('mm-link'), () => ({
        title: WORDS.linkTitle,
        text: WORDS.linkText,
        url: remixUrl(currentMeme(), leadAvatar(), window.location.href, { max: CONFIG.remix.maxLength })
    }), {
        status: $('mm-status'),
        message: WORDS.linkCopied,
        onShare: (how) => track('remix-link', { kind: state.template.id, outcome: how })
    });
    window.addEventListener('hashchange', readLink);
    for (const p of CONFIG.export.pictures) {
        const input = $(`mm-size-${p.id}`);
        if (input) input.addEventListener('change', () => { state.sizeId = readSize(); refreshPreview(); });
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('pagehide', endVisit);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) endVisit();
        if (!state.stage) return;
        if (document.hidden) state.stage.stop();
        else state.stage.start();
    });
}

export async function init() {
    $('meme-app').hidden = false;
    state.store = createAvatarStore();
    state.avatar = state.store.hasSaved() ? state.store.load() : null;
    state.standIn = randomAvatar();
    state.memes = createMemeStore({ key: CONFIG.storageKey });
    const kept = state.memes.load();
    const restored = kept ? normalizeMeme(kept, RULES()) : null;
    state.restored = Boolean(restored && (restored.captions.some(Boolean) || restored.expressions.some(Boolean) || restored.template !== byOrder()[0].id));

    const stageStatus = $('mm-stage-status');
    stageStatus.textContent = WORDS.loading;
    if (webgl2()) {
        try {
            state.stage = createStage(CONFIG, {
                canvas: $('mm-canvas'),
                mobile: isMobile(),
                reducedMotion,
                onFrame(rects, viewing) {
                    state.rects = rects;
                    drawOverlay(rects);
                    if (viewing !== null && !state.pinged.stepped && state.ready) {
                        state.pinged.stepped = true;
                        track('panel-stepped', { kind: state.template.id });
                    }
                },
                onView(index) {
                    if (state.views) state.views.select(index);
                }
            });
            state.exporter = createExporter(CONFIG, {
                stage: state.stage,
                onExport: (kind, outcome) => track(`export-${kind}`, { kind: state.template.id, outcome })
            });
        } catch (e) {
            state.stage = null;
            state.exporter = null;
        }
    }
    state.tabs = buildTabs(TABS, { onTab: (id) => { if (state.ready) track('tab', { kind: id.replace('mm-tab-', '') }); } });
    state.picker = buildTemplatePicker($('mm-picker'), { templates: byOrder(), selected: byOrder()[0].id, onPick: (t) => pickTemplate(t.id) });
    showTemplate(restored ? templateOf(restored.template) : byOrder()[0], restored);
    if (state.restored) say(WORDS.welcomeBack);
    else if (!state.memes.available) say(WORDS.notKept);
    else say(state.avatar ? WORDS.withAvatar : WORDS.noAvatar);
    // A link's meme outranks the kept one: a friend's gift is why they came.
    const arrived = readLink();
    const saveBtn = $('mm-picture-save');
    saveBtn.textContent = state.exporter ? state.exporter.buttonLabel() : EXPORT_WORDS.saveButton;
    saveBtn.hidden = !state.exporter;
    $('mm-hint').hidden = !state.stage;
    $('mm-view').hidden = !state.stage;
    wire();
    state.ready = true;

    // The visit's pings: the proof of work first, so every ping carries the
    // hash that groups a visit (the same token the scenes use), then the
    // start, with whether an avatar was waiting and whether a meme was.
    setMobile(isMobile());
    const proof = await getProofOfWork(CONFIG.proofOfWork);
    setProofHash(proof && proof.hash);
    track('session-start', { kind: arrived ? 'by-link' : state.restored ? 'returning' : 'new', outcome: state.avatar ? 'avatar' : 'no-avatar' });
    if (arrived) track('arrived-by-link', { kind: state.template.id, outcome: state.maker ? 'avatar' : 'no-avatar' });

    if (!state.stage) {
        stageStatus.textContent = WORDS.noStage;
        return;
    }
    await warmShaders(state.stage.renderer, [{ scene: state.stage.scene, camera: state.stage.camera }]);
    state.stage.start();
    stageStatus.hidden = true;
}

export const __test__ = {
    state,
    endVisit,
    savePicture,
    onCaption,
    onExpression,
    onKey,
    leadAvatar
};

if (typeof document !== 'undefined' && typeof window !== 'undefined' && document.getElementById('meme-app')) {
    init().catch(() => {
        const status = document.getElementById('mm-stage-status');
        if (status) status.textContent = WORDS.noStage;
    });
}
