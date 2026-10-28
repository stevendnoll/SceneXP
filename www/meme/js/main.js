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
 * M1 (2026-10-27): one panel that reads as a meme. The first template stands
 * in the stage with the visitor's avatar (or a stand-in) wearing its
 * expression, one caption field feeds the live caption over the stage and
 * the preview of the picture, and the picture goes to the share sheet or
 * the downloads folder. The picker, the people, the rest of the templates
 * and the clip arrive milestone by milestone (specs/meme/TASKS.md).
 *
 * NOTHING IS UPLOADED. The avatar store is read, never written, by this
 * page. The usage pings count kinds of things done (which template, what
 * happened to a picture), never what was typed.
 *
 * `__test__` reaches the page's state for tests/meme-init.test.mjs.
 */

import { MEME_PAGE as CONFIG } from './config.min.js';
import { createAvatarStore, randomAvatar } from '../../shared/js/avatar-1.0.0.min.js';
import { warmShaders } from '../../shared/js/warmup-1.0.0.min.js';
import { track, trackFinal, setProofHash, setMobile } from '../../shared/js/telemetry-1.0.0.min.js';
import { getProofOfWork } from '../../shared/js/boot-1.0.0.min.js';
import { createStage } from './stage.min.js';
import { byOrder, slotsOf } from './templates.min.js';
import { buildCaptionFields } from './editor.min.js';
import { createExporter, WORDS as EXPORT_WORDS } from './exporter.min.js';

/** Everything the page says, in one place (house style: polite, no
 *  semicolons or em-dashes). */
export const WORDS = Object.freeze({
    loading: 'Setting up the studio…',
    noStage: "This browser can't draw the 3D stage. Please try another browser, or a newer one.",
    noAvatar: 'You have no avatar yet, so a visitor is standing in for you. Make yours at any time.',
    withAvatar: 'Your avatar is here. Type a caption to make the meme yours.',
    pictureSaved: EXPORT_WORDS.pictureSaved,
    pictureShared: EXPORT_WORDS.pictureShared,
    pictureFailed: EXPORT_WORDS.pictureFailed
});

const $ = (id) => document.getElementById(id);

const state = {
    store: null,
    avatar: null,         // the saved avatar, or null
    standIn: null,        // a random avatar for a visitor with none saved
    template: null,
    captions: [],
    stage: null,
    exporter: null,
    fields: null,
    ready: false,
    pinged: { typed: new Set() },
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

/** The avatar a role wears: the visitor's (or the stand-in) for the lead,
 *  a random cast member otherwise. */
export function avatarForRole(roleId) {
    const role = state.template.roles.find((r) => r.id === roleId);
    if (!role || role.cast === 'avatar') return state.avatar || state.standIn;
    return randomAvatar();
}

/** The live caption over the stage: the first top caption, as typed (the
 *  stylesheet sets it in capitals). */
function showLiveCaption() {
    const slots = slotsOf(state.template);
    const k = slots.findIndex((s) => s.cell === 0 && s.slot === 'top');
    const el = $('mm-caption-live');
    el.textContent = k >= 0 ? state.captions[k] || '' : '';
    el.hidden = !el.textContent;
}

/** The preview of the picture, drawn once a frame at most. */
let previewPending = false;
export function refreshPreview() {
    if (!state.exporter || !state.stage) return false;
    if (previewPending) return true;
    previewPending = true;
    const draw = () => {
        previewPending = false;
        state.exporter.drawPreview($('mm-preview'), state.template, state.captions, CONFIG.export.pictures[0].id);
    };
    if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(draw);
    else draw();
    return true;
}

function onCaption(k, value) {
    state.captions[k] = value;
    showLiveCaption();
    refreshPreview();
    if (state.ready && value && !state.pinged.typed.has(k)) {
        state.pinged.typed.add(k);
        track('caption-typed', { kind: state.template.id });
    }
}

/** Show a template: the panels built, the caption fields laid out, the
 *  preview drawn. */
export function showTemplate(template) {
    state.template = template;
    state.captions = slotsOf(template).map((_, k) => state.captions[k] || '');
    if (state.stage) state.stage.setTemplate(template, avatarForRole);
    state.fields = buildCaptionFields($('mm-captions'), {
        slots: slotsOf(template),
        captions: state.captions,
        maxChars: CONFIG.caption.maxChars,
        onInput: onCaption
    });
    showLiveCaption();
    if (state.stage) state.stage.touch();
    refreshPreview();
}

async function savePicture() {
    if (!state.exporter) return 'failed';
    const result = await state.exporter.savePicture(state.template, state.captions, CONFIG.export.pictures[0].id);
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

function wire() {
    $('mm-picture-save').addEventListener('click', savePicture);
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

    const stageStatus = $('mm-stage-status');
    stageStatus.textContent = WORDS.loading;
    if (webgl2()) {
        try {
            state.stage = createStage(CONFIG, { canvas: $('mm-canvas'), mobile: isMobile(), reducedMotion });
            state.exporter = createExporter(CONFIG, {
                stage: state.stage,
                onExport: (kind, outcome) => track(`export-${kind}`, { kind: state.template.id, outcome })
            });
        } catch (e) {
            state.stage = null;
            state.exporter = null;
        }
    }
    showTemplate(byOrder()[0]);
    say(state.avatar ? WORDS.withAvatar : WORDS.noAvatar);
    const saveBtn = $('mm-picture-save');
    saveBtn.textContent = state.exporter ? state.exporter.buttonLabel() : EXPORT_WORDS.saveButton;
    saveBtn.hidden = !state.exporter;
    wire();
    state.ready = true;

    // The visit's pings: the proof of work first, so every ping carries the
    // hash that groups a visit (the same token the scenes use), then the
    // start, with whether an avatar was waiting.
    setMobile(isMobile());
    const proof = await getProofOfWork(CONFIG.proofOfWork);
    setProofHash(proof && proof.hash);
    track('session-start', { outcome: state.avatar ? 'avatar' : 'no-avatar' });

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
    onCaption
};

if (typeof document !== 'undefined' && typeof window !== 'undefined' && document.getElementById('meme-app')) {
    init().catch(() => {
        const status = document.getElementById('mm-stage-status');
        if (status) status.textContent = WORDS.noStage;
    });
}
