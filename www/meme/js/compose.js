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
import { drawWordmark as drawSharedWordmark } from '../../shared/js/wordmark-1.0.0.min.js';

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

/** Whether two boxes `{ x, y, w, h }` overlap. */
function overlaps(a, b) {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * A label pinned to a figure at `point` (pixels, the figure's chest) in a
 * panel's `rect`: smaller than a caption, centered on the point, kept
 * inside the panel, and moved down (or up, at the bottom) past any box in
 * `avoid` it would overlap (the labels already on the panel: three people
 * abreast put theirs at one height, Steve 2026-10-28). `L` is
 * config.label, `C` config.caption. Returns what was drawn, with its
 * `box`, or null for an empty label or no point.
 */
export function drawLabel(ctx, text, point, rect, L, C, avoid = []) {
    const t = String(text || '').trim();
    if (!t || !point) return null;
    const shown = C.uppercase ? t.toUpperCase() : t;
    const fontPx = Math.max(1, Math.round(rect.h * L.size));
    const minPx = Math.max(1, Math.round(fontPx * C.smallest));
    const measure = (s, px) => {
        ctx.font = captionFont(px, C.font);
        return ctx.measureText(s).width;
    };
    const maxWidth = rect.w * L.maxWidth;
    const fit = fitCaption(measure, shown, maxWidth, { fontPx, minPx, maxLines: C.maxLines });
    ctx.font = captionFont(fit.fontPx, C.font);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = fit.fontPx * C.stroke;
    ctx.strokeStyle = C.outline;
    ctx.fillStyle = C.fill;
    const lineH = fit.fontPx * C.lineHeight;
    const widest = Math.max(...fit.lines.map((l) => measure(l, fit.fontPx)));
    const x = Math.min(rect.x + rect.w - widest / 2, Math.max(rect.x + widest / 2, point.x));
    const n = fit.lines.length;
    const lowest = rect.y + rect.h - n * lineH;
    const highest = rect.y + lineH / 2;
    const clamp = (y) => Math.min(lowest, Math.max(highest, y));
    let top = clamp(point.y - ((n - 1) / 2) * lineH);
    const gap = rect.h * (L.gap || 0);
    const boxAt = (y) => ({ x: x - widest / 2, y: y - lineH / 2, w: widest, h: n * lineH });
    // Down past each box in the way, or up past it when the panel's
    // bottom is reached.
    for (let tries = 0; tries < 8; tries++) {
        const hit = avoid.find((b) => overlaps(boxAt(top), b));
        if (!hit) break;
        const below = hit.y + hit.h + gap + lineH / 2;
        top = below <= lowest ? below : clamp(hit.y - gap - (n - 0.5) * lineH);
    }
    fit.lines.forEach((line, i) => {
        ctx.strokeText(line, x, top + i * lineH);
        ctx.fillText(line, x, top + i * lineH);
    });
    return { ...fit, x, y: top, box: boxAt(top) };
}

/** The wordmark, bottom right, in the caption face: `W` is config.wordmark,
 *  `C` config.caption. Returns where it was drawn. Drawn by the shared part
 *  since 2026-10-29 (X's and O's stamps its photos with it too), handed this
 *  page's own numbers so nothing about the meme's mark changed. */
export function drawWordmark(ctx, w, h, W, C) {
    return drawSharedWordmark(ctx, w, h, {
        text: W.text, height: W.height, inset: W.inset,
        font: C.font, stroke: C.stroke, fill: C.fill, outline: C.outline,
    });
}

/**
 * The whole picture on `ctx`, `w` by `h`: the ground, each panel's image
 * (`imageFor(cellIndex, rect)` returns a canvas or image to draw, or null
 * to leave the ground), the captions in reading order from `captions`
 * (labels at `anchorsFor(cellIndex, rect)`'s points, captions on props in
 * `propsFor(cellIndex, rect)`'s rects, both in the panel's own pixels), and
 * the wordmark unless `wordmark` is false. Returns the panels' rects.
 */
export function composeMeme(ctx, { template, captions = [], w, h, config, imageFor, anchorsFor = null, propsFor = null, wordmark = true }) {
    const gutter = h * config.panel.gutter;
    const rects = layoutGrid(template, w, h, { gutter, padding: gutter });
    ctx.fillStyle = config.panel.background;
    ctx.fillRect(0, 0, w, h);
    const anchors = [];
    const props = [];
    template.cells.forEach((cell, i) => {
        const r = rects[i];
        const image = imageFor ? imageFor(i, r) : null;
        if (image) ctx.drawImage(image, r.x, r.y, r.w, r.h);
        // The figures' anchors and the props' surfaces come with the
        // panel's image (the same camera), in the panel's own pixels,
        // moved onto the picture.
        const local = anchorsFor ? anchorsFor(i, r) : null;
        anchors.push(local ? local.map((p) => (p ? { x: r.x + p.x, y: r.y + p.y } : null)) : null);
        const surfaces = propsFor ? propsFor(i, r) : null;
        props.push(surfaces ? Object.fromEntries(Object.entries(surfaces).map(([k, s]) => [k, s ? { x: r.x + s.x, y: r.y + s.y, w: s.w, h: s.h } : null])) : null);
    });
    drawCaptions(ctx, template, captions, rects, config.caption, { anchors, label: config.label, props });
    if (wordmark) drawWordmark(ctx, w, h, config.wordmark, config.caption);
    return rects;
}

/**
 * Every caption of a template over its panel's rect, in reading order:
 * `rects[i]` is cell i's rect, or null to skip a cell (one off screen).
 * A label pinned to a figure is drawn at `anchors[i][figure]` (a point in
 * the same pixels as the rects), when there is one. A caption on a prop's
 * surface (`{ prop: 'board' }`) is drawn across the top of `props[i][name]`
 * (a rect in the same pixels), when there is one, so it sits on the board
 * in the picture, up where the presenting hand is not (Steve, 2026-10-28).
 * The live overlay draws through here too, so the stage and the picture
 * agree.
 */
export function drawCaptions(ctx, template, captions, rects, C, { anchors = [], label = null, props = [] } = {}) {
    let k = 0;
    const onBoard = C.board ? { ...C, size: C.size * C.board.scale, maxLines: C.board.maxLines } : C;
    template.cells.forEach((cell, i) => {
        // The labels drawn on this panel so far, so the next keeps clear.
        const placed = [];
        for (const slot of cell.captions) {
            const text = captions[k++];
            if (!rects[i]) continue;
            if (slot && typeof slot === 'object' && slot.prop) {
                const surface = props[i] ? props[i][slot.prop] : null;
                if (surface) drawCaption(ctx, text, surface, 'top', onBoard);
            } else if (slot && typeof slot === 'object') {
                const point = anchors[i] ? anchors[i][slot.label] : null;
                if (label) {
                    const drawn = drawLabel(ctx, text, point, rects[i], label, C, placed);
                    if (drawn) placed.push(drawn.box);
                }
            } else {
                drawCaption(ctx, text, rects[i], slot, C);
            }
        }
    });
}
