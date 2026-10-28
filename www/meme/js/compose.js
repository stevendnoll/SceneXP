// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * compose.js - the picture (specs/meme PLANNING 6.1): the panels tiled in
 * the template's grid, the captions over them in the meme face, and the
 * wordmark in the corner, all drawn on a 2D canvas in code. Pure: nothing
 * here touches THREE or the page, and every measurement is handed in, so a
 * test runs the whole thing with a recording context.
 *
 * THE PICTURE MUST READ AS A MEME TO A THUMB SCROLLING PAST (PRD 5.6), so
 * the conventions are the old ones: panels on a dark ground with a thin
 * gutter, captions in capitals, white with a heavy black outline, top and
 * bottom. The caption shrinks to fit its lines and never overflows.
 */

/** How many columns a template's grid has (its first row's spans). */
function columnsOf(template) {
    return template.grid[0].reduce((n, c) => n + c.span, 0);
}

/**
 * The pixel rect of every cell on a `w` by `h` picture, in cell order,
 * `gutter` pixels between cells and `padding` around them. The rects tile
 * the picture exactly: a spanning cell is as wide as its span plus the
 * gutters it swallows.
 */
export function layoutGrid(template, w, h, { gutter = 0, padding = 0 } = {}) {
    const rows = template.grid.length;
    const columns = columnsOf(template);
    const innerW = w - 2 * padding;
    const innerH = h - 2 * padding;
    const cellH = (innerH - gutter * (rows - 1)) / rows;
    const unitW = (innerW - gutter * (columns - 1)) / columns;
    const out = [];
    template.grid.forEach((row, r) => {
        let col = 0;
        for (const cell of row) {
            out.push({
                x: padding + col * (unitW + gutter),
                y: padding + r * (cellH + gutter),
                w: cell.span * unitW + (cell.span - 1) * gutter,
                h: cellH
            });
            col += cell.span;
        }
    });
    return out;
}

/** The CSS font for the meme face at `px`. */
export function captionFont(px, family) {
    return `bold ${px}px ${family}`;
}

/**
 * `text` broken into lines no wider than `maxWidth` by `measure(string)`,
 * word by word. A single word wider than the line stands on a line of its
 * own rather than being cut.
 */
export function wrapCaption(measure, text, maxWidth) {
    const words = String(text).trim().split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const word of words) {
        const trial = line ? `${line} ${word}` : word;
        if (!line || measure(trial) <= maxWidth) line = trial;
        else {
            lines.push(line);
            line = word;
        }
    }
    if (line) lines.push(line);
    return lines;
}

/**
 * The face size and lines that fit `text` within `maxWidth` and `maxLines`:
 * from `fontPx` down by a tenth at a time to `minPx`, where the lines are
 * cut to `maxLines` rather than overflow. `measure(string, px)` is the width
 * of a string at a size.
 */
export function fitCaption(measure, text, maxWidth, { fontPx, minPx, maxLines }) {
    let px = fontPx;
    for (;;) {
        const lines = wrapCaption((s) => measure(s, px), text, maxWidth);
        const fits = lines.length <= maxLines && lines.every((l) => measure(l, px) <= maxWidth);
        if (fits || px <= minPx) return { fontPx: px, lines: lines.slice(0, maxLines) };
        px = Math.max(minPx, Math.floor(px * 0.9));
    }
}

/**
 * Draw one caption on a panel's `rect` at its `slot` ('top', 'bottom' or
 * 'center'): capitals (when `C.uppercase`), white on a black outline,
 * centered, shrunk to fit. Returns what was drawn (`{ fontPx, lines }`),
 * or null for an empty caption.
 */
export function drawCaption(ctx, text, rect, slot, C) {
    const t = String(text || '').trim();
    if (!t) return null;
    const shown = C.uppercase ? t.toUpperCase() : t;
    const fontPx = Math.max(1, Math.round(rect.h * C.size));
    const minPx = Math.max(1, Math.round(fontPx * C.smallest));
    const measure = (s, px) => {
        ctx.font = captionFont(px, C.font);
        return ctx.measureText(s).width;
    };
    const inset = rect.h * C.inset;
    const fit = fitCaption(measure, shown, rect.w - 2 * inset, { fontPx, minPx, maxLines: C.maxLines });
    ctx.font = captionFont(fit.fontPx, C.font);
    ctx.textAlign = 'center';
    ctx.textBaseline = slot === 'bottom' ? 'alphabetic' : slot === 'center' ? 'middle' : 'top';
    ctx.lineJoin = 'round';
    ctx.lineWidth = fit.fontPx * C.stroke;
    ctx.strokeStyle = C.outline;
    ctx.fillStyle = C.fill;
    const lineH = fit.fontPx * C.lineHeight;
    const x = rect.x + rect.w / 2;
    const n = fit.lines.length;
    fit.lines.forEach((line, i) => {
        let y;
        if (slot === 'bottom') y = rect.y + rect.h - inset - (n - 1 - i) * lineH;
        else if (slot === 'center') y = rect.y + rect.h / 2 + (i - (n - 1) / 2) * lineH;
        else y = rect.y + inset + i * lineH;
        ctx.strokeText(line, x, y);
        ctx.fillText(line, x, y);
    });
    return fit;
}

/** The wordmark, bottom right, in the caption face: `W` is config.wordmark,
 *  `C` config.caption. Returns where it was drawn. */
export function drawWordmark(ctx, w, h, W, C) {
    const px = Math.max(1, Math.round(h * W.height));
    const inset = h * W.inset;
    ctx.font = captionFont(px, C.font);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.lineWidth = px * C.stroke;
    ctx.strokeStyle = C.outline;
    ctx.fillStyle = C.fill;
    const x = w - inset;
    const y = h - inset;
    ctx.strokeText(W.text, x, y);
    ctx.fillText(W.text, x, y);
    return { x, y, px };
}

/**
 * The whole picture on `ctx`, `w` by `h`: the ground, each panel's image
 * (`imageFor(cellIndex, rect)` returns a canvas or image to draw, or null
 * to leave the ground), the captions in reading order from `captions`, and
 * the wordmark unless `wordmark` is false. Returns the panels' rects.
 */
export function composeMeme(ctx, { template, captions = [], w, h, config, imageFor, wordmark = true }) {
    const gutter = h * config.panel.gutter;
    const rects = layoutGrid(template, w, h, { gutter, padding: gutter });
    ctx.fillStyle = config.panel.background;
    ctx.fillRect(0, 0, w, h);
    template.cells.forEach((cell, i) => {
        const r = rects[i];
        const image = imageFor ? imageFor(i, r) : null;
        if (image) ctx.drawImage(image, r.x, r.y, r.w, r.h);
    });
    drawCaptions(ctx, template, captions, rects, config.caption);
    if (wordmark) drawWordmark(ctx, w, h, config.wordmark, config.caption);
    return rects;
}

/**
 * Every caption of a template over its panel's rect, in reading order:
 * `rects[i]` is cell i's rect, or null to skip a cell (one off screen).
 * The live overlay draws through here too, so the stage and the picture
 * agree.
 */
export function drawCaptions(ctx, template, captions, rects, C) {
    let k = 0;
    template.cells.forEach((cell, i) => {
        for (const slot of cell.captions) {
            const text = captions[k++];
            if (rects[i]) drawCaption(ctx, text, rects[i], slot, C);
        }
    });
}
