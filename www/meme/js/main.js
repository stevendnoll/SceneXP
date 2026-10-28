// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * main.js - Meme Studio (/meme/, specs/meme PRD): the visitor's own avatar
 * stars in a meme laid out as a grid of small lit 3D boxes, captioned by the
 * visitor and shared as a picture, or as a link a friend can remix with
 * their own avatar. (The short video, M6, was held back from the launch:
 * exporter.js says where it is kept.)
 *
 * THE FIRST THIRTY SECONDS ARE WORDS AND ONE NEXT STEP. The sheet says what
 * this is and what to do before the stage has finished loading.
 *
 * M3 (2026-10-27): the editor on a phone. Three tabs (Meme, Captions,
 * People); the picker with a glyph of each grid; a caption field a slot; a
 * row of expression chips a panel; the view buttons that step into a panel
 * by keyboard; the last meme kept in this browser and restored on return.
 * The people, the rest of the templates and the remix link arrived
 * milestone by milestone (specs/meme/TASKS.md).
 *
 * NOTHING IS UPLOADED. The avatar store is read, never written, by this
 * page; the meme store (state.js) is this page's own. The usage pings count
 * kinds of things done (which template, what happened to a picture), never
 * what was typed.
 *
 * `__test__` reaches the page's state for tests/meme-init.test.mjs.
 */

import { MEME_PAGE as CONFIG } from './config.min.js';
import { createAvatarStore, randomAvatar, decodeLink, fromFile, sameAvatar, normalizeAvatar, MAX_FILE } from '../../shared/js/avatar-1.0.0.min.js';
import { EXPRESSIONS, expressionOverrides } from '../../shared/js/avatar-expressions-1.0.0.min.js';
import { EDITOR_TABS, createEditor } from '../../shared/js/avatar-editor-1.0.0.min.js';
import { warmShaders } from '../../shared/js/warmup-1.0.0.min.js';
import { track, trackFinal, setProofHash, setMobile } from '../../shared/js/telemetry-1.0.0.min.js';
import { getProofOfWork } from '../../shared/js/boot-1.0.0.min.js';
import { createStage } from './stage.min.js';
import { TEMPLATES, byOrder, slotsOf, templateOf } from './templates.min.js';
import { buildTabs, buildCaptionFields, buildTemplatePicker, buildExpressionRows, buildViewButtons, buildPeople, buildTintRow } from './editor.min.js';
import { normalizeMeme, createMemeStore } from './state.min.js';
import { decodeRemix, remixUrl } from './remix.min.js';
import { installShare } from '../../shared/js/share-1.0.0.min.js';
import { createPromoCard, createDirectoryLink } from '../../shared/js/promo-1.0.0.min.js';
import { drawCaptions } from './compose.min.js';
import { createExporter, WORDS as EXPORT_WORDS } from './exporter.min.js';

/** Everything the page says, in one place (house style: polite, no
 *  semicolons or em-dashes). */
export const WORDS = Object.freeze({
    loading: 'Setting up the studio…',
    noStage: "This browser can't draw the 3D stage. Please try another browser, or a newer one.",
    noAvatar: 'You have no avatar yet, so a visitor is standing in for you. Make yours at any time.',
    // The lede in the markup, and the same without its first sentence for a
    // visitor with no avatar, for whom it is not true (Steve's QA, 2026-10-28).
    lede: 'Your avatar is already standing in the first one. Pick a meme, type your captions, and share it as a picture or a link.',
    ledeNoAvatar: 'Pick a meme, type your captions, and share it as a picture or a link.',
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
    personFriend: 'Your friend, as their avatar.',
    personRandom: 'A visitor from the crowd.',
    personDressed: 'Dressed by you.',
    personSent: 'Chosen by the friend who sent this meme.',
    customizeNote: "This meme sets some of this person's look itself, so those choices are left out here.",
    customizeDone: 'Done',
    friendAdded: "Your friend is in. Their avatar stays on this device and nothing about it is sent to us.",
    friendBadLink: "That doesn't look like an avatar link. It starts with #a= and comes from the avatar page's Share a link.",
    friendFileLarge: 'That file is too large to be an avatar file. Please choose scenexp-avatar.json.',
    friendFileUnreadable: 'This browser could not read that file. Please try it again.',
    friendNotAvatar: "That file doesn't hold a SceneXP avatar. Please choose scenexp-avatar.json.",
    reshuffled: 'Someone else stepped in.',
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
    friend: null,         // the avatar in the friend's role: pasted, opened, or the maker's (D5)
    friendIsMaker: false,
    cast: {},             // a random avatar a role, kept for the visit so a reshuffle is a change
    dressed: new Set(),   // the crowd roles dressed by hand here (M8's Customize)
    sent: new Set(),      // the crowd roles whose person came in a link
    customizing: null,    // the role whose editor is open, or null
    customizeTab: null,   // that editor's tab, kept when the People tab is drawn again
    editor: null,         // that editor (the shared avatar editor)
    peopleRows: [],       // the People tab's rows (editor.js buildPeople)
    incoming: false,      // a link's meme is on the stage, waiting for an answer
    anchors: [],          // where each panel's figures' labels pin on the stage, CSS pixels
    props: [],            // where each panel's prop surfaces (the chart's sheet) are on the stage
    template: null,
    captions: [],
    expressions: [],      // a cell's chosen face, or null for the template's
    tint: null,           // the background color picked (M8), or null for the template's own
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
    pinged: { typed: new Set(), stepped: false, faced: false, tinted: false, dressed: false },
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

/** The meme as it stands, valid, for the store and the link. */
export function currentMeme() {
    return normalizeMeme({ template: state.template.id, captions: state.captions, expressions: state.expressions, tint: state.tint, friend: state.friend, cast: chosenCast() }, RULES());
}

/** The crowd roles' people who are not from the crowd (dressed here, or
 *  sent in a link), by role id: kept with the meme and carried in the link.
 *  The friend's is the meme's `friend`. */
function chosenCast() {
    const out = {};
    for (const id of new Set([...state.dressed, ...state.sent])) {
        if (id !== 'friend' && state.cast[id]) out[id] = state.cast[id];
    }
    return out;
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
    if (!state.cast[roleId]) state.cast[roleId] = randomAvatar();
    return state.cast[roleId];
}

/** The role labels of a cell's figures, for the fields. */
function roleNamesFor(cellIndex) {
    return state.template.cells[cellIndex].figures.map((f) => (state.template.roles.find((r) => r.id === f.role) || {}).label || f.role);
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
    drawCaptions(ctx, state.template, state.captions, rects, CONFIG.caption, { anchors: state.anchors, label: CONFIG.label, props: state.props });
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

/** A background color picked (M8), or null for the meme's own. */
function onTint(hex) {
    state.tint = hex || null;
    if (state.stage) {
        state.stage.setTint(state.tint);
        state.stage.touch();
    }
    refreshPreview();
    keep();
    if (state.ready && !state.pinged.tinted) {
        state.pinged.tinted = true;
        track('tint-set', { kind: state.template.id });
    }
}

/** The color a tinted template wears as its own: its deepest wall's. */
function ownTint(template) {
    const cells = template.cells.filter((c) => c.tint !== undefined).sort((a, b) => b.tint - a.tint);
    return cells.length ? cells[0].backdrop : CONFIG.box.wall;
}

/** What the People tab says of a role. */
function noteFor(role) {
    if (role.cast === 'avatar') return state.maker ? WORDS.personMaker : state.avatar ? WORDS.personYou : WORDS.personStandIn;
    if (role.id === 'friend' && state.friend && state.friendIsMaker) return WORDS.personMaker;
    if (state.dressed.has(role.id)) return WORDS.personDressed;
    if (state.sent.has(role.id)) return WORDS.personSent;
    if (role.id === 'friend' && state.friend) return WORDS.personFriend;
    return WORDS.personRandom;
}

/**
 * The fields `template` sets itself for the people of `roleId` (their
 * costume's overrides and the mouth of the face they wear), and the
 * handedness, which no meme reads (a meme names its sides): left out of
 * that role's editor (M8).
 */
export function setByMeme(template, roleId) {
    const keys = new Set(['handedness']);
    for (const cell of template.cells) {
        for (const f of cell.figures) {
            if (f.role !== roleId) continue;
            for (const key of Object.keys(f.overrides || {})) keys.add(key);
            for (const key of Object.keys(expressionOverrides(f.expression))) keys.add(key);
        }
    }
    return [...keys];
}

/**
 * Dress the person in `roleId` by hand (M8's Customize): `avatar`, made
 * valid, worn in every panel at once. The friend's role keeps it as the
 * friend; any other crowd role keeps it in place of its stranger.
 */
export function dress(roleId, avatar) {
    const role = state.template.roles.find((r) => r.id === roleId && r.cast === 'random');
    if (!role) return false;
    const a = normalizeAvatar(avatar);
    if (roleId === 'friend') {
        state.friend = a;
        state.friendIsMaker = false;
    } else {
        state.cast[roleId] = a;
    }
    state.dressed.add(roleId);
    state.sent.delete(roleId);
    if (state.stage) {
        state.stage.recast(roleId);
        state.stage.touch();
    }
    // The groups a choice makes moot (no hat, no hat's color) follow it.
    if (state.editor && state.customizing === roleId) state.editor.set(a);
    const row = state.peopleRows.find((r) => r.role === roleId);
    if (row) row.note.textContent = noteFor(role);
    refreshPreview();
    keep();
    if (state.ready && !state.pinged.dressed) {
        state.pinged.dressed = true;
        track('person-dressed', { kind: state.template.id, outcome: roleId });
    }
    return true;
}

/** The editor for the role in `row`, built into its row's space: a line
 *  when the meme sets some fields itself, the tabs and their choices
 *  seeded with whoever stands there, and Done. */
function buildCustomizer(row, template) {
    const host = row.custom;
    host.textContent = '';
    const role = template.roles.find((r) => r.id === row.role);
    const omit = setByMeme(template, row.role);
    if (omit.some((key) => key !== 'handedness')) {
        const note = document.createElement('p');
        note.className = 'mm-note';
        note.textContent = WORDS.customizeNote;
        host.appendChild(note);
    }
    const tablist = document.createElement('div');
    tablist.className = 'av-tabs';
    tablist.setAttribute('role', 'tablist');
    tablist.setAttribute('aria-label', `Choices for ${role.label}`);
    const panels = document.createElement('div');
    panels.className = 'mm-cz-panels';
    host.appendChild(tablist);
    host.appendChild(panels);
    state.editor = createEditor({
        doc: document,
        tablist,
        panels,
        tabs: EDITOR_TABS,
        avatar: avatarForRole(row.role),
        omit,
        prefix: 'mm-cz',
        onChange: (key, id) => dress(row.role, { ...avatarForRole(row.role), [key]: id }),
        onTab: (tab) => { state.customizeTab = tab.id; }
    });
    if (state.customizeTab) state.editor.select(state.customizeTab, { quiet: true });
    const done = document.createElement('button');
    done.type = 'button';
    done.className = 'mm-secondary mm-small';
    done.textContent = WORDS.customizeDone;
    done.addEventListener('click', closeCustomize);
    host.appendChild(done);
}

/** Open the editor for `roleId` under its row (closing any other), the
 *  stage looking into the first panel that person stands in; or close it
 *  when it is the one open. Returns whether it is open now. */
export function toggleCustomize(roleId) {
    if (state.customizing === roleId) {
        closeCustomize();
        return false;
    }
    if (!state.template.roles.some((r) => r.id === roleId && r.cast === 'random')) return false;
    state.customizing = roleId;
    state.customizeTab = null;
    showPeople(state.template);
    const cell = state.template.cells.findIndex((c) => c.figures.some((f) => f.role === roleId));
    if (state.stage && cell >= 0) state.stage.view(cell);
    return true;
}

/** Close the open editor, the stage back out to every panel, and the
 *  focus back on the button that opened it. */
export function closeCustomize() {
    const was = state.customizing;
    if (!was) return false;
    state.customizing = null;
    state.customizeTab = null;
    state.editor = null;
    showPeople(state.template);
    if (state.stage && state.stage.viewing !== null) state.stage.view(null);
    const row = state.peopleRows.find((r) => r.role === was);
    if (row && row.customize && row.customize.focus) row.customize.focus();
    return true;
}

/** A word on the People tab's own status line. */
function sayPeople(text) {
    $('mm-people-status').textContent = text;
}

/** The People tab: who is in the meme, where each comes from, a friend by
 *  their link or file, a reshuffle for anyone from the crowd, and the
 *  editor under the row being dressed by hand. Drawn again whole, so the
 *  focus goes back to the control that had it. */
function showPeople(template) {
    const active = typeof document !== 'undefined' && document.activeElement ? document.activeElement.id : '';
    if (state.customizing && !template.roles.some((r) => r.id === state.customizing && r.cast === 'random')) {
        state.customizing = null;
        state.customizeTab = null;
    }
    state.editor = null;
    state.peopleRows = buildPeople($('mm-people'), {
        roles: template.roles,
        noteFor,
        customizing: state.customizing,
        onLink: useFriendLink,
        onFile: () => { const input = $('mm-friend-file'); if (input && input.click) input.click(); },
        onReshuffle: reshuffle,
        onCustomize: toggleCustomize
    });
    const open = state.peopleRows.find((r) => r.role === state.customizing);
    if (open) buildCustomizer(open, template);
    $('mm-make-avatar').hidden = Boolean(state.avatar);
    if (active) {
        const again = state.peopleRows.flatMap((r) => [r.reshuffle, r.customize, r.input]).find((el) => el && el.id === active);
        if (again && again.focus) again.focus();
    }
}

/** A friend's avatar from their link (the whole address or its fragment).
 *  True when one was there. */
export function useFriendLink(text) {
    const s = String(text || '').trim();
    const hash = s.includes('#') ? s.slice(s.indexOf('#')) : s;
    const avatar = decodeLink(hash);
    if (!avatar) {
        sayPeople(WORDS.friendBadLink);
        return false;
    }
    setFriend(avatar);
    if (state.ready) track('friend-added', { kind: 'link' });
    return true;
}

/** A friend's avatar from their file, read only when it is small. */
export async function useFriendFile(file) {
    if (!file) return false;
    if (!(file.size <= MAX_FILE)) {
        sayPeople(WORDS.friendFileLarge);
        return false;
    }
    let text;
    try {
        text = await file.text();
    } catch (e) {
        sayPeople(WORDS.friendFileUnreadable);
        return false;
    }
    const avatar = fromFile(text);
    if (!avatar) {
        sayPeople(WORDS.friendNotAvatar);
        return false;
    }
    setFriend(avatar);
    if (state.ready) track('friend-added', { kind: 'file' });
    return true;
}

function setFriend(avatar) {
    state.friend = avatar;
    state.friendIsMaker = false;
    state.dressed.delete('friend');
    state.sent.delete('friend');
    if (state.stage) {
        state.stage.recast('friend');
        state.stage.touch();
    }
    showPeople(state.template);
    sayPeople(WORDS.friendAdded);
    refreshPreview();
    keep();
}

/** Someone else from the crowd in a random role. */
export function reshuffle(roleId) {
    state.cast[roleId] = randomAvatar();
    state.dressed.delete(roleId);
    state.sent.delete(roleId);
    if (roleId === 'friend') {
        state.friend = null;
        state.friendIsMaker = false;
    }
    if (state.stage) {
        state.stage.recast(roleId);
        state.stage.touch();
    }
    showPeople(state.template);
    sayPeople(WORDS.reshuffled);
    refreshPreview();
    keep();
    if (state.ready) track('reshuffle', { kind: state.template.id });
}

/** Show a template with `meme`'s captions and faces: the panels built,
 *  the fields and the chips laid out, the preview drawn. */
export function showTemplate(template, meme = null) {
    state.template = template;
    const slots = slotsOf(template);
    state.captions = slots.map((_, k) => (meme ? meme.captions[k] : state.captions[k]) || '');
    state.expressions = template.cells.map((_, i) => (meme ? meme.expressions[i] : null) || null);
    // A meme's color (restored, or from a link); otherwise the one picked
    // stays for the visit, worn by any template that offers one.
    if (meme) state.tint = meme.tint || null;
    // A meme's friend (restored, or the maker moved over) takes the role;
    // the same friend again keeps whoever they were.
    if (meme && meme.friend && !(state.friend && sameAvatar(state.friend, meme.friend))) {
        state.friend = meme.friend;
        state.friendIsMaker = false;
    }
    // A meme's people (restored: dressed here before), each taking their
    // role; the same person again keeps how they came to be there.
    for (const [id, person] of Object.entries((meme && meme.cast) || {})) {
        if (state.cast[id] && sameAvatar(state.cast[id], person)) continue;
        state.cast[id] = person;
        state.dressed.add(id);
        state.sent.delete(id);
    }
    if (state.stage) {
        state.stage.setTemplate(template, avatarForRole, { tint: state.tint });
        state.expressions.forEach((id, i) => { if (id) state.stage.setExpression(i, id); });
    }
    state.fields = buildCaptionFields($('mm-captions'), {
        slots,
        captions: state.captions,
        maxChars: CONFIG.caption.maxChars,
        roleNamesFor,
        onInput: onCaption
    });
    buildExpressionRows($('mm-faces'), { template, expressions: EXPRESSIONS, chosen: state.expressions, onChoose: onExpression });
    buildTintRow($('mm-tint'), { offered: Boolean(template.tint), own: ownTint(template), swatches: CONFIG.tint.swatches, chosen: state.tint, onChoose: onTint });
    state.views = buildViewButtons($('mm-view'), { count: template.cells.length, onView: (index) => { if (state.stage) state.stage.view(index); } });
    showPeople(template);
    if (state.picker) state.picker.select(template.id);
    state.rects = state.stage ? state.stage.screenRects() : [];
    state.anchors = state.stage ? state.stage.screenAnchors() : [];
    state.props = state.stage ? state.stage.screenProps() : [];
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
    showStart();
}

/** The way to an avatar of one's own at the top of the sheet: shown while
 *  none is saved, except while a friend's meme waits on its card (which
 *  has its own way there); and the lede, which says the visitor's avatar
 *  is standing in the first meme only when it is. */
function showStart() {
    const none = !state.avatar;
    $('mm-start').hidden = !none || state.incoming;
    $('mm-lede').textContent = none ? WORDS.ledeNoAvatar : WORDS.lede;
}

/**
 * An avatar saved since the page opened: made on the avatar page and come
 * back by the browser's Back (the page restored as it was left), or in
 * another tab. It takes the lead, unless a friend's meme is leading with
 * the maker's, and the way to make one steps aside. True when one did.
 */
export function adoptSavedAvatar() {
    if (!state.store || !state.store.hasSaved()) return false;
    const saved = state.store.load();
    if (state.avatar && sameAvatar(state.avatar, saved)) return false;
    state.avatar = saved;
    if (state.stage && state.template) {
        for (const role of state.template.roles) if (role.cast === 'avatar') state.stage.recast(role.id);
        state.stage.touch();
    }
    showPeople(state.template);
    showStart();
    if (!state.incoming) say(WORDS.withAvatar);
    refreshPreview();
    return true;
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
    state.dressed.clear();
    state.sent.clear();
    state.customizing = null;
    showTemplate(templateOf(found.meme.template), found.meme);
    // The people the maker chose came with the link.
    for (const id of Object.keys(found.meme.cast)) {
        state.dressed.delete(id);
        state.sent.add(id);
    }
    if (found.meme.friend) state.sent.add('friend');
    showPeople(state.template);
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
    state.friendIsMaker = Boolean(state.friend);
    state.sent.delete('friend');
    state.dressed.delete('friend');
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
    state.tint = null;
    state.maker = null;
    state.friend = null;
    state.friendIsMaker = false;
    // Everyone dressed by hand or sent goes back to the crowd.
    for (const id of new Set([...state.dressed, ...state.sent])) delete state.cast[id];
    state.dressed.clear();
    state.sent.clear();
    state.customizing = null;
    state.customizeTab = null;
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

/** How a picture or the link went that counts as finished: the picture
 *  shared or saved, the link handed to the sheet, copied or mailed.
 *  A dismissed sheet or a failure is not. */
const FINISHED = Object.freeze(['shared', 'saved', 'native', 'copy', 'mail']);

/** What comes next (M7), built once, the first time something is
 *  finished: the catalog's pick for a visitor with an avatar, the avatar
 *  page for one with none, and the directory under it. Returns whether it
 *  was built. */
function showNext(outcome) {
    if (!FINISHED.includes(outcome)) return false;
    const host = $('mm-next');
    if (!host || host.children.length) return false;
    const card = createPromoCard('meme', state.avatar ? {} : { entry: CONFIG.next.avatar });
    if (card) host.appendChild(card);
    const link = createDirectoryLink();
    if (link) host.appendChild(link);
    host.hidden = false;
    return true;
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
    $('mm-friend-file').addEventListener('change', (e) => {
        const input = (e && e.target) || $('mm-friend-file');
        const file = input && input.files ? input.files[0] : null;
        useFriendFile(file);
        if (input) input.value = '';
    });
    // The link: the meme and the lead's avatar, through the shared ladder
    // (the share sheet, the clipboard, a mail), the copy said on the sheet.
    installShare($('mm-link'), () => ({
        title: WORDS.linkTitle,
        text: WORDS.linkText,
        url: remixUrl(currentMeme(), leadAvatar(), window.location.href, { max: CONFIG.remix.maxLength, templates: TEMPLATES })
    }), {
        status: $('mm-status'),
        message: WORDS.linkCopied,
        onShare: (how) => {
            track('remix-link', { kind: state.template.id, outcome: how });
            showNext(how);
        }
    });
    window.addEventListener('hashchange', readLink);
    // Back from the avatar page with a new avatar: a page restored from the
    // browser's cache runs nothing again, so it asks the store itself.
    window.addEventListener('pageshow', (e) => { if (e && e.persisted) adoptSavedAvatar(); });
    state.store.onChange(adoptSavedAvatar);
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
    state.restored = Boolean(restored && (restored.captions.some(Boolean) || restored.expressions.some(Boolean) || restored.tint || Object.keys(restored.cast).length || restored.template !== byOrder()[0].id));

    const stageStatus = $('mm-stage-status');
    stageStatus.textContent = WORDS.loading;
    if (webgl2()) {
        try {
            state.stage = createStage(CONFIG, {
                canvas: $('mm-canvas'),
                mobile: isMobile(),
                reducedMotion,
                onFrame(rects, viewing, gliding, anchors, props) {
                    state.rects = rects;
                    state.anchors = anchors || [];
                    state.props = props || [];
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
                onExport: (kind, outcome) => {
                    track(`export-${kind}`, { kind: state.template.id, outcome });
                    showNext(outcome);
                }
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
    showStart();
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
    onTint,
    onKey,
    noteFor,
    leadAvatar,
    showNext
};

if (typeof document !== 'undefined' && typeof window !== 'undefined' && document.getElementById('meme-app')) {
    init().catch(() => {
        const status = document.getElementById('mm-stage-status');
        if (status) status.textContent = WORDS.noStage;
    });
}
