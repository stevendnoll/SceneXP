// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The picture (www/meme/js/compose.js, specs/meme PLANNING 6.1), pure, with
 * a recording context: the grid tiles the canvas exactly for every shape
 * of grid, a caption never overflows its panel or its line cap, the outline
 * is drawn under the fill, and the wordmark sits inside the bottom right
 * corner at every size.
 */
import * as C from '../www/meme/js/compose.js';
import { MEME_PAGE as CONFIG } from '../www/meme/js/config.js';
import { TEMPLATES } from '../www/meme/js/templates.js';

/** A 2D context that records every call, and measures text as `k` pixels
 *  a character at the font size it was last given. */
function recordingContext(k = 0.55) {
    const calls = [];
    let px = 10;
    const ctx = {
        calls,
        set font(value) { px = Number((value.match(/(\d+)px/) || [])[1]) || px; calls.push(['font', value]); },
        get font() { return `bold ${px}px x`; },
        measureText: (s) => ({ width: s.length * px * k }),
        textAlign: '', textBaseline: '', lineJoin: '', lineWidth: 0, strokeStyle: '', fillStyle: ''
    };
    for (const m of ['fillRect', 'drawImage', 'strokeText', 'fillText']) {
        ctx[m] = (...args) => { calls.push([m, ...args, { lineWidth: ctx.lineWidth, strokeStyle: ctx.strokeStyle, fillStyle: ctx.fillStyle, px }]); };
    }
    return ctx;
}

const grid = (rows) => ({ grid: rows.map((r) => r.map((span) => ({ span }))), cells: rows.flat().map(() => ({ captions: [] })) });

describe('the grid', () => {
    test.each([
        ['one cell', [[1]]],
        ['three rows', [[1], [1], [1]]],
        ['two by two', [[1, 1], [1, 1]]],
        ['two columns then a wide row', [[1, 1], [2]]],
        ['a wide row then two columns', [[2], [1, 1]]],
        ['four rows of two', [[1, 1], [1, 1], [1, 1], [1, 1]]]
    ])('%s tiles the picture exactly', (_name, rows) => {
        const t = grid(rows);
        for (const [w, h] of [[1080, 1080], [1080, 1350], [540, 675]]) {
            const gutter = h * 0.012;
            const rects = C.layoutGrid(t, w, h, { gutter, padding: gutter });
            expect(rects).toHaveLength(rows.flat().length);
            // Every rect inside the padding, and the rows and columns summing
            // to the picture less the gutters.
            const rowsOf = new Map();
            for (const r of rects) {
                expect(r.x).toBeGreaterThanOrEqual(gutter - 1e-9);
                expect(r.y).toBeGreaterThanOrEqual(gutter - 1e-9);
                expect(r.x + r.w).toBeLessThanOrEqual(w - gutter + 1e-9);
                expect(r.y + r.h).toBeLessThanOrEqual(h - gutter + 1e-9);
                const row = rowsOf.get(r.y) || { width: 0, count: 0 };
                rowsOf.set(r.y, { width: row.width + r.w, count: row.count + 1 });
            }
            // A row's cells and the gutters between them fill its width: a
            // wide cell swallows the gutters its span would have had.
            for (const { width, count } of rowsOf.values()) expect(width).toBeCloseTo(w - 2 * gutter - gutter * (count - 1), 6);
            const ys = [...rowsOf.keys()].sort((a, b) => a - b);
            expect(ys).toHaveLength(rows.length);
            const rowH = rects[0].h;
            expect(ys[ys.length - 1] + rowH).toBeCloseTo(h - gutter, 6);
            expect(rowH * rows.length + gutter * (rows.length - 1)).toBeCloseTo(h - 2 * gutter, 6);
        }
    });

    test('a spanning cell is as wide as its span plus the gutters it swallows', () => {
        const t = grid([[1, 1], [2]]);
        const [a, b, wide] = C.layoutGrid(t, 1000, 1000, { gutter: 10, padding: 10 });
        expect(wide.w).toBeCloseTo(a.w + b.w + 10, 9);
        expect(wide.x).toBe(a.x);
        expect(b.x).toBeCloseTo(a.x + a.w + 10, 9);
    });

    test('no gutter and no padding tiles edge to edge', () => {
        const [r] = C.layoutGrid(grid([[1]]), 300, 200);
        expect(r).toEqual({ x: 0, y: 0, w: 300, h: 200 });
    });
});

describe('a caption', () => {
    const measure = (k) => (s, px) => s.length * px * k;

    test('wraps word by word, a long word on its own line', () => {
        const m = (s) => s.length;
        expect(C.wrapCaption(m, 'one two three', 7)).toEqual(['one two', 'three']);
        expect(C.wrapCaption(m, 'supercalifragilistic is long', 8)).toEqual(['supercalifragilistic', 'is long']);
        expect(C.wrapCaption(m, '   ', 8)).toEqual([]);
        expect(C.wrapCaption(m, 'a', 8)).toEqual(['a']);
    });

    test('shrinks until it fits two lines, and never below the smallest face', () => {
        const fit = C.fitCaption(measure(0.5), 'WHEN THE BUILD PASSES ON THE FIRST TRY', 400, { fontPx: 100, minPx: 50, maxLines: 2 });
        expect(fit.lines.length).toBeLessThanOrEqual(2);
        expect(fit.fontPx).toBeLessThan(100);
        expect(fit.fontPx).toBeGreaterThanOrEqual(50);
        for (const line of fit.lines) expect(line.length * fit.fontPx * 0.5).toBeLessThanOrEqual(400);
        // Short enough to fit at full size: untouched.
        expect(C.fitCaption(measure(0.5), 'OH NO', 400, { fontPx: 100, minPx: 50, maxLines: 2 })).toEqual({ fontPx: 100, lines: ['OH NO'] });
        // Far too long for two lines at the smallest face: cut to two.
        const cut = C.fitCaption(measure(0.5), 'a '.repeat(200).trim(), 100, { fontPx: 40, minPx: 30, maxLines: 2 });
        expect(cut.fontPx).toBe(30);
        expect(cut.lines).toHaveLength(2);
    });

    test('is drawn in capitals, outline then fill, centered, at the top or the bottom, and not at all when empty', () => {
        const rect = { x: 100, y: 50, w: 800, h: 600 };
        const K = CONFIG.caption;
        for (const slot of ['top', 'bottom']) {
            const ctx = recordingContext();
            const fit = C.drawCaption(ctx, '  it ain\'t much ', rect, slot, K);
            expect(fit.lines).toEqual(["IT AIN'T MUCH"]);
            expect(fit.fontPx).toBe(Math.round(rect.h * K.size));
            const strokes = ctx.calls.filter((c) => c[0] === 'strokeText');
            const fills = ctx.calls.filter((c) => c[0] === 'fillText');
            expect(strokes).toHaveLength(1);
            expect(fills).toHaveLength(1);
            expect(ctx.calls.indexOf(strokes[0])).toBeLessThan(ctx.calls.indexOf(fills[0]));
            expect(strokes[0][2]).toBe(rect.x + rect.w / 2);
            const inset = rect.h * K.inset;
            expect(strokes[0][3]).toBe(slot === 'top' ? rect.y + inset : rect.y + rect.h - inset);
            expect(strokes[0][4].strokeStyle).toBe(K.outline);
            expect(fills[0][4].fillStyle).toBe(K.fill);
            expect(strokes[0][4].lineWidth).toBeCloseTo(fit.fontPx * K.stroke, 9);
            expect(ctx.textAlign).toBe('center');
            expect(ctx.textBaseline).toBe(slot === 'top' ? 'top' : 'alphabetic');
        }
        const ctx = recordingContext();
        expect(C.drawCaption(ctx, '   ', rect, 'top', K)).toBeNull();
        expect(ctx.calls).toEqual([]);
        // As typed when the config says so.
        const plain = recordingContext();
        expect(C.drawCaption(plain, 'as typed', rect, 'top', { ...K, uppercase: false }).lines).toEqual(['as typed']);
    });

    test('a centered caption sits in the middle of its panel, its lines either side of the middle', () => {
        const rect = { x: 0, y: 100, w: 300, h: 300 };
        const K = CONFIG.caption;
        const one = recordingContext(0.6);
        C.drawCaption(one, 'KALM', rect, 'center', K);
        expect(one.calls.filter((c) => c[0] === 'fillText').map((c) => c[3])).toEqual([250]);
        expect(one.textBaseline).toBe('middle');
        const two = recordingContext(0.6);
        const fit = C.drawCaption(two, 'ONE LINE IS NOT ENOUGH FOR THIS', rect, 'center', K);
        const ys = two.calls.filter((c) => c[0] === 'fillText').map((c) => c[3]);
        expect(fit.lines).toHaveLength(2);
        expect((ys[0] + ys[1]) / 2).toBeCloseTo(250, 9);
        expect(ys[1] - ys[0]).toBeCloseTo(fit.fontPx * K.lineHeight, 9);
    });

    test('a label is drawn at its figure\'s point, kept inside the panel, and skipped without a point', () => {
        const rect = { x: 100, y: 100, w: 400, h: 400 };
        const ctx = recordingContext(0.5);
        const at = C.drawLabel(ctx, 'me', { x: 300, y: 300 }, rect, CONFIG.label, CONFIG.caption);
        expect(at.lines).toEqual(['ME']);
        expect(at.fontPx).toBe(Math.round(rect.h * CONFIG.label.size));
        expect(at.x).toBe(300);
        expect(at.y).toBe(300);
        expect(ctx.textBaseline).toBe('middle');
        // A point by the edge: pulled inside.
        const edge = recordingContext(0.5);
        const pulled = C.drawLabel(edge, 'a long label indeed', { x: 490, y: 495 }, rect, CONFIG.label, CONFIG.caption);
        expect(pulled.x).toBeLessThan(490);
        expect(pulled.y).toBeLessThan(495);
        expect(pulled.x).toBeLessThanOrEqual(rect.x + rect.w);
        expect(C.drawLabel(recordingContext(), 'x', null, rect, CONFIG.label, CONFIG.caption)).toBeNull();
        expect(C.drawLabel(recordingContext(), '  ', { x: 1, y: 1 }, rect, CONFIG.label, CONFIG.caption)).toBeNull();
    });

    test('labels go to their anchors through drawCaptions and composeMeme, moved into the panel\'s rect', () => {
        const template = { grid: [[{ span: 1 }]], cells: [{ captions: [{ label: 0 }, { label: 1 }, 'top'] }] };
        const ctx = recordingContext(0.5);
        C.drawCaptions(ctx, template, ['me', 'them', 'cap'], [{ x: 0, y: 0, w: 400, h: 400 }], CONFIG.caption, { anchors: [[{ x: 100, y: 200 }, null]], label: CONFIG.label });
        const texts = ctx.calls.filter((c) => c[0] === 'fillText');
        expect(texts.map((c) => c[1])).toEqual(['ME', 'CAP']);
        expect(texts[0].slice(2, 4)).toEqual([100, 200]);
        // Without a label config, labels are left out; captions still drawn.
        const bare = recordingContext(0.5);
        C.drawCaptions(bare, template, ['me', 'them', 'cap'], [{ x: 0, y: 0, w: 400, h: 400 }], CONFIG.caption);
        expect(bare.calls.filter((c) => c[0] === 'fillText').map((c) => c[1])).toEqual(['CAP']);
        // Through the picture: the panel's own pixels moved by its rect.
        const pic = recordingContext(0.5);
        const rects = C.composeMeme(pic, { template, captions: ['me', '', ''], w: 1000, h: 1000, config: CONFIG, anchorsFor: (i, r) => [{ x: r.w / 2, y: r.h / 2 }, null] });
        const me = pic.calls.find((c) => c[0] === 'fillText' && c[1] === 'ME');
        expect(me[2]).toBeCloseTo(rects[0].x + rects[0].w / 2, 6);
        expect(me[3]).toBeCloseTo(rects[0].y + rects[0].h / 2, 6);
    });

    test('drawCaptions skips a cell with no rect and keeps counting its captions', () => {
        const template = { cells: [{ captions: ['top'] }, { captions: ['center'] }, { captions: ['bottom'] }] };
        const ctx = recordingContext();
        C.drawCaptions(ctx, template, ['a', 'b', 'c'], [{ x: 0, y: 0, w: 100, h: 100 }, null, { x: 0, y: 100, w: 100, h: 100 }], CONFIG.caption);
        expect(ctx.calls.filter((c) => c[0] === 'fillText').map((c) => c[1])).toEqual(['A', 'C']);
    });

    test('two lines stack down from the top and up from the bottom', () => {
        const rect = { x: 0, y: 0, w: 300, h: 300 };
        const K = CONFIG.caption;
        const text = 'ONE LINE IS NOT ENOUGH FOR THIS';
        const top = recordingContext(0.6);
        const fitTop = C.drawCaption(top, text, rect, 'top', K);
        expect(fitTop.lines).toHaveLength(2);
        const ysTop = top.calls.filter((c) => c[0] === 'fillText').map((c) => c[3]);
        expect(ysTop[1] - ysTop[0]).toBeCloseTo(fitTop.fontPx * K.lineHeight, 9);
        const bottom = recordingContext(0.6);
        const fitBottom = C.drawCaption(bottom, text, rect, 'bottom', K);
        const ysBottom = bottom.calls.filter((c) => c[0] === 'fillText').map((c) => c[3]);
        expect(ysBottom[1]).toBe(rect.h - rect.h * K.inset);
        expect(ysBottom[1] - ysBottom[0]).toBeCloseTo(fitBottom.fontPx * K.lineHeight, 9);
    });
});

describe('the wordmark and the whole picture', () => {
    test('the wordmark is drawn inside the bottom right corner at every size, outline then fill', () => {
        for (const [w, h] of [[1080, 1080], [1080, 1350], [1080, 1920], [540, 540]]) {
            const ctx = recordingContext();
            const at = C.drawWordmark(ctx, w, h, CONFIG.wordmark, CONFIG.caption);
            expect(at.x).toBeLessThan(w);
            expect(at.y).toBeLessThan(h);
            expect(at.x).toBeGreaterThan(w * 0.9);
            expect(at.y).toBeGreaterThan(h * 0.9);
            expect(at.px).toBe(Math.round(h * CONFIG.wordmark.height));
            const [stroke, fill] = ctx.calls.filter((c) => c[0] === 'strokeText' || c[0] === 'fillText');
            expect(stroke[0]).toBe('strokeText');
            expect(fill[0]).toBe('fillText');
            expect(stroke[1]).toBe('SceneXP.com');
            expect(ctx.textAlign).toBe('right');
        }
    });

    test('the picture is the ground, every panel\'s image, the captions in reading order, and the wordmark', () => {
        const template = {
            grid: [[{ span: 1 }, { span: 1 }], [{ span: 2 }]],
            cells: [{ captions: ['top'] }, { captions: [] }, { captions: ['bottom'] }]
        };
        const ctx = recordingContext();
        const asked = [];
        const rects = C.composeMeme(ctx, {
            template, captions: ['first', 'third'], w: 1080, h: 1080, config: CONFIG,
            imageFor: (i, r) => { asked.push([i, r]); return i === 1 ? null : { panel: i }; }
        });
        expect(rects).toHaveLength(3);
        expect(asked.map((a) => a[0])).toEqual([0, 1, 2]);
        expect(ctx.calls[0]).toEqual(['fillRect', 0, 0, 1080, 1080, expect.objectContaining({ fillStyle: CONFIG.panel.background })]);
        const drawn = ctx.calls.filter((c) => c[0] === 'drawImage');
        expect(drawn.map((c) => c[1])).toEqual([{ panel: 0 }, { panel: 2 }]);
        expect(drawn[0].slice(2, 6)).toEqual([rects[0].x, rects[0].y, rects[0].w, rects[0].h]);
        const texts = ctx.calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);
        expect(texts).toEqual(['FIRST', 'THIRD', 'SceneXP.com']);
        // Without the wordmark, the captions alone.
        const bare = recordingContext();
        C.composeMeme(bare, { template, captions: ['a'], w: 100, h: 100, config: CONFIG, wordmark: false });
        expect(bare.calls.filter((c) => c[0] === 'fillText').map((c) => c[1])).toEqual(['A']);
        expect(bare.calls.filter((c) => c[0] === 'drawImage')).toEqual([]);
    });

    test('every template in the catalog composes without an image', () => {
        for (const t of TEMPLATES) {
            const ctx = recordingContext();
            const rects = C.composeMeme(ctx, { template: t, captions: [], w: 1080, h: 1350, config: CONFIG });
            expect(rects).toHaveLength(t.cells.length);
        }
    });
});
