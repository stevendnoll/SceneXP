// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * pinboard.js - The corkboard's cards, moving: carried between columns when a
 * status changes, and dragged by the visitor's hand.
 *
 * board.js decides where every card is pinned. This keeps where each one IS,
 * carries it there, repaints a card's face only when what it says changes,
 * and rewrites the one mesh room.js built (setBoardQuads).
 *
 * THE BEAT. A card whose status changes, from anywhere (its folder, a logged
 * interview, a drag), comes off the cork, crosses to its new column and pins
 * itself again. That crossing is the office's one moment of ceremony, so it
 * is the same everywhere.
 *
 * EVERY POSITION IS KEPT ON A PLAIN RECORD, so a test can ask where a card
 * is without a renderer.
 */

import { cardSlots, cardPose, cardCorners, cardUvs, cardTilt, carryPose, atlasRows, CARD_ATLAS } from './board.min.js';
import { setBoardQuads } from './room.min.js';

const DRAG_DEPTH = 0.07;

function stepOf(delta, rate) {
    return rate === Infinity ? 1 : Math.max(0, delta) * rate;
}

/**
 * A controller for the board (room.js `buildBoard`'s result). `makeAtlas`
 * returns `{ canvas, texture }` for an atlas of `rows` rows, and
 * `paintCard(ctx, x, y, w, h, face)` paints one face into it.
 */
export function createPinboard(board, config, { reducedMotion = false, makeAtlas = null, paintCard = null } = {}) {
    const b = config.room.board;
    const columns = config.statuses.length;
    /** id to { at, from, to, t, face, faceKey, painted } */
    const cards = new Map();
    let order = [];
    let rows = 0;
    let atlas = null;
    let dragging = null;
    const rate = reducedMotion ? Infinity : 1 / config.view.carrySeconds;

    function ensureAtlas(n) {
        const need = atlasRows(n);
        if (need === rows && atlas) return false;
        rows = need;
        atlas = makeAtlas ? makeAtlas(rows) : null;
        if (atlas && atlas.texture && board.cards.material) {
            const old = board.cards.material.map;
            board.cards.material.map = atlas.texture;
            board.cards.material.needsUpdate = true;
            if (old && old !== atlas.texture && old.dispose) old.dispose();
        }
        for (const card of cards.values()) card.painted = null;
        return true;
    }

    function paint(card, cell) {
        const key = `${cell}|${card.faceKey}`;
        if (card.painted === key || !atlas || !atlas.canvas || !paintCard) return false;
        const ctx = atlas.canvas.getContext('2d');
        const x = (cell % CARD_ATLAS.cols) * CARD_ATLAS.cellW;
        const y = Math.floor(cell / CARD_ATLAS.cols) * CARD_ATLAS.cellH;
        paintCard(ctx, x, y, CARD_ATLAS.cellW, CARD_ATLAS.cellH, card.face);
        card.painted = key;
        return true;
    }

    function lay() {
        const quads = order.map((id, i) => {
            const card = cards.get(id);
            return { corners: cardCorners(card.at, b.card, card.tilt), depth: card.at.depth, uvs: cardUvs(i, rows) };
        });
        setBoardQuads(board.cards, quads, config);
    }

    /**
     * Pin every card by `plan` (board.boardPlan). `faces` maps id to what
     * its face says (`{ title, subtitle, note, band }`). Returns whether
     * anything will move.
     */
    function sync(plan, faces) {
        const slots = cardSlots(plan);
        const kept = order.filter((id) => slots.has(id));
        const added = [...slots.keys()].filter((id) => !cards.has(id));
        for (const id of order) if (!slots.has(id)) cards.delete(id);
        order = [...kept, ...added];
        const grew = ensureAtlas(order.length);
        let moving = false;
        let repainted = false;
        order.forEach((id, i) => {
            const to = cardPose(slots.get(id), b, columns);
            const face = faces.get(id) || { title: '' };
            const faceKey = JSON.stringify(face);
            let card = cards.get(id);
            if (!card) {
                card = { at: { ...to }, from: { ...to }, to, t: 1, tilt: cardTilt(id) };
                cards.set(id, card);
            } else if (card.to.y !== to.y || card.to.z !== to.z || card.to.depth !== to.depth) {
                if (dragging !== id) {
                    card.from = { ...card.at };
                    card.t = 0;
                    moving = true;
                }
                card.to = to;
            }
            card.face = face;
            card.faceKey = faceKey;
            if (paint(card, i)) repainted = true;
        });
        if ((repainted || grew) && atlas && atlas.texture) atlas.texture.needsUpdate = true;
        if (rate === Infinity) {
            for (const card of cards.values()) {
                if (dragging === null || card !== cards.get(dragging)) {
                    card.t = 1;
                    card.at = { ...card.to };
                }
            }
            moving = false;
        }
        lay();
        return moving;
    }

    /** Advance every carry by `delta` seconds. True while anything moves. */
    function update(delta) {
        let moving = false;
        for (const [id, card] of cards) {
            if (id === dragging || card.t >= 1) continue;
            card.t = Math.min(1, card.t + stepOf(delta, rate));
            card.at = carryPose(card.from, card.to, card.t);
            if (card.t < 1) moving = true;
        }
        lay();
        return moving;
    }

    /** Pick a card up. Returns false for a card that is not on the board. */
    function beginDrag(id) {
        const card = cards.get(id);
        if (!card) return false;
        dragging = id;
        card.at = { ...card.at, depth: DRAG_DEPTH };
        lay();
        return true;
    }

    /** Hold the picked-up card at a point on the board, kept on the cork. */
    function dragTo(y, z) {
        const card = dragging && cards.get(dragging);
        if (!card) return;
        const hz = b.width / 2 - b.card[0] / 2;
        const hy = b.height / 2 - b.card[1] / 2;
        card.at = {
            y: Math.min(b.y + hy, Math.max(b.y - hy, y)),
            z: Math.min(b.z + hz, Math.max(b.z - hz, z)),
            depth: DRAG_DEPTH
        };
        lay();
    }

    /** Let go. The card is carried from where it was dropped to wherever it
     *  now belongs, so a drop onto its own column settles it back. */
    function endDrag() {
        const id = dragging;
        dragging = null;
        const card = id && cards.get(id);
        if (!card) return null;
        card.from = { ...card.at };
        card.t = rate === Infinity ? 1 : 0;
        card.at = rate === Infinity ? { ...card.to } : card.at;
        lay();
        return { id, at: card.from };
    }

    return {
        sync,
        update,
        beginDrag,
        dragTo,
        endDrag,
        /** The card a ray met, from its triangle's index, or null. */
        idAtFace: (faceIndex) => {
            const i = Math.floor(faceIndex / 2);
            return i >= 0 && i < order.length ? order[i] : null;
        },
        card: (id) => cards.get(id) || null,
        get dragging() { return dragging; },
        get count() { return order.length; },
        get rows() { return rows; }
    };
}
