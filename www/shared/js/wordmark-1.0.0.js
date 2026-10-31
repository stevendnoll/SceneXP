// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * wordmark.js - "SceneXP.com" in the corner of a picture a scene made (shared
 * engine part): white with a dark outline, in the meme face, bottom right.
 *
 * A PICTURE CARRIES NO LINK. A post on a feed is the picture and nothing
 * else, so the address in the corner is the only way somebody who sees it can
 * find the place it came from. It is small and in the corner so it is never
 * the picture.
 *
 * Promoted from www/meme/js/compose.js on 2026-10-29 for X's and O's photos
 * (the second scene to stamp one), with the meme's own numbers as the
 * defaults, so Meme Studio draws exactly what it drew before. A scene passes
 * only what it changes, usually just `text`.
 *
 * Pure: it draws on whatever 2D context it is handed, so a test runs it with a
 * recording one.
 */

/** The look, every number a share of the picture's HEIGHT so the mark keeps
 *  its size against the picture at any resolution. `stroke` is the outline's
 *  width as a share of the letters' height. */
export const WORDMARK = Object.freeze({
    text: 'SceneXP.com',
    height: 0.024,
    inset: 0.03,
    font: 'Impact, "Arial Narrow Bold", "Roboto Condensed", sans-serif',
    stroke: 0.09,
    fill: '#ffffff',
    outline: '#000000',
});

/** A canvas font string for `px` pixel letters in `family`. */
export function wordmarkFont(px, family = WORDMARK.font) {
    return `bold ${px}px ${family}`;
}

/**
 * Draw the mark in the bottom right corner of a `w` by `h` picture: the
 * outline first, then the fill over it. Returns where it was drawn, its right
 * end and its baseline, and the letters' height in pixels.
 */
export function drawWordmark(ctx, w, h, options = {}) {
    const W = { ...WORDMARK, ...options };
    const px = Math.max(1, Math.round(h * W.height));
    const inset = h * W.inset;
    ctx.font = wordmarkFont(px, W.font);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.lineWidth = px * W.stroke;
    ctx.strokeStyle = W.outline;
    ctx.fillStyle = W.fill;
    const x = w - inset;
    const y = h - inset;
    ctx.strokeText(W.text, x, y);
    ctx.fillText(W.text, x, y);
    return { x, y, px };
}
