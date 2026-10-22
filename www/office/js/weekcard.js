// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * weekcard.js - The week card: a picture of the visitor's week to share.
 * Applications sent against the weekly goal across the top, the last eight
 * weeks as bars against the goal line below, and a frame of the visitor's
 * own office behind it all.
 *
 * COUNTS ONLY. The card never carries a company, a role or the date of any
 * one application, so every card is safe to post. It is made on the device
 * and nothing is uploaded.
 *
 * NO IMPORTS, ON PURPOSE. scripts/office-weekcard-preview.mjs inlines this
 * file into a page that opens straight from the disk, so the card can be
 * judged with the browser's own canvas and fonts before anything is wired.
 * The words come in from copy.weekCardLines and the bars from
 * whiteboard.weekChart, measured against WEEK_CARD_LAYOUT, so the drawing
 * and the whiteboard's chart can never disagree about a week.
 *
 * Every position is a fraction of the card's width and height, like the
 * office's other painters, and every size is in pixels of a 1080-wide card,
 * scaled to the card actually drawn.
 */

/** Where everything sits, in fractions of the card (y runs down). `weeks`
 *  is the chart's box, in the shape whiteboard.weekChart measures. */
export const WEEK_CARD_LAYOUT = {
    label: 0.06,
    headline: 0.135,
    goal: 0.205,
    date: 0.258,
    /** The shade behind the words holds full strength to `shadeHold`, past
     *  the goal line, and fades out by `shade`. Faded from the top edge, it
     *  had all but gone by the date line, which was unreadable over a bright
     *  window (QA, 2026-10-21). */
    shadeHold: 0.23,
    shade: 0.4,
    /** The chart's panel starts here, with a short fade above it. */
    panel: 0.6,
    chartTitle: 0.655,
    weeks: { x0: 0.13, y0: 0.71, x1: 0.92, y1: 0.87 },
    footer: 0.952
};

const TITLE = '#ffe9d2';
const SUBTITLE = '#f2c496';
const ACCENT = '#f0a765';
const STRONG = '#ffd9b0';
const MUTED = '#c9b8a6';
/** The date, over the photograph: lighter than the chart's labels, which
 *  sit on the solid panel. */
const DATE = '#ead9c6';
const SHADE = '18, 12, 8';
const SANS = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/**
 * The part of a `sw` by `sh` picture that covers a `w` by `h` card without
 * stretching: the middle, trimmed on whichever side is too long.
 */
export function coverCrop(sw, sh, w, h) {
    const scale = Math.max(w / sw, h / sh);
    const cw = w / scale;
    const ch = h / scale;
    return { sx: (sw - cw) / 2, sy: (sh - ch) / 2, sw: cw, sh: ch };
}

/** The largest size, down from `size`, at which `text` fits in `max`. */
function fit(g, text, size, max, weight) {
    let s = size;
    for (; s > 10; s -= 2) {
        g.font = `${weight} ${Math.round(s)}px ${SANS}`;
        if (!max || g.measureText(text).width <= max) break;
    }
    return s;
}

/** Write a line. `glow` (in pixels) puts a soft dark halo behind it, for
 *  words over the photograph, where the shade alone cannot promise contrast
 *  against every window and every hour. */
function write(g, text, x, y, { size, weight = 700, color = TITLE, align = 'center', max = 0, glow = 0 }) {
    fit(g, text, size, max, weight);
    g.fillStyle = color;
    g.textAlign = align;
    g.textBaseline = 'middle';
    if (glow) {
        g.shadowColor = `rgba(${SHADE}, 0.75)`;
        g.shadowBlur = glow;
        g.shadowOffsetY = glow / 6;
    }
    g.fillText(text, x, y);
    if (glow) {
        g.shadowColor = 'transparent';
        g.shadowBlur = 0;
        g.shadowOffsetY = 0;
    }
}

/** A band of shade from `from` to `to`: `alpha` for the first `hold` of
 *  it, then fading to nothing. */
function shade(g, W, from, to, alpha, hold = 0) {
    const grad = g.createLinearGradient(0, from, 0, to);
    grad.addColorStop(0, `rgba(${SHADE}, ${alpha})`);
    if (hold > 0) grad.addColorStop(hold, `rgba(${SHADE}, ${alpha})`);
    grad.addColorStop(1, `rgba(${SHADE}, 0)`);
    g.fillStyle = grad;
    g.fillRect(0, Math.min(from, to), W, Math.abs(to - from));
}

/** The office behind the card, or an evening sky when there is no picture
 *  (a browser that could not render one still gets a handsome card). */
function backdrop(g, W, H, photo) {
    const pw = photo && (photo.width || photo.naturalWidth);
    const ph = photo && (photo.height || photo.naturalHeight);
    if (pw && ph) {
        const c = coverCrop(pw, ph, W, H);
        g.drawImage(photo, c.sx, c.sy, c.sw, c.sh, 0, 0, W, H);
        return;
    }
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#1d2740');
    sky.addColorStop(0.42, '#6b4a5c');
    sky.addColorStop(0.62, '#d98a5a');
    sky.addColorStop(1, '#2a1a12');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
}

/**
 * Paint the week card.
 *
 * @param {CanvasRenderingContext2D} g
 * @param {number} W
 * @param {number} H
 * @param {object} card
 * @param {object} card.lines  from copy.weekCardLines
 * @param {object} card.chart  from whiteboard.weekChart against WEEK_CARD_LAYOUT
 * @param {CanvasImageSource|null} [card.photo]  the office, any size
 */
export function drawWeekCard(g, W, H, { lines, chart, photo = null }, layout = WEEK_CARD_LAYOUT) {
    const e = W / 1080;
    backdrop(g, W, H, photo);

    // The words, over a shade deep enough to read against a bright window,
    // and each with a soft halo for whatever shows through it.
    shade(g, W, 0, H * layout.shade, 0.85, layout.shadeHold / layout.shade);
    const glow = 16 * e;
    write(g, lines.label, W / 2, H * layout.label, { size: 34 * e, weight: 800, color: ACCENT, glow });
    write(g, lines.headline, W / 2, H * layout.headline, { size: 86 * e, weight: 900, max: W * 0.9, glow });
    write(g, lines.goal, W / 2, H * layout.goal, { size: 46 * e, weight: 700, color: lines.met ? STRONG : SUBTITLE, max: W * 0.9, glow });
    write(g, lines.date, W / 2, H * layout.date, { size: 32 * e, weight: 600, color: DATE, glow });

    // The chart's panel.
    const top = H * layout.panel;
    shade(g, W, top, top - H * 0.05, 0.9);
    g.fillStyle = `rgba(${SHADE}, 0.9)`;
    g.fillRect(0, top, W, H - top);
    // The title keeps the panel's left edge, wherever the weeks begin.
    write(g, lines.chart, W * layout.weeks.x0, H * layout.chartTitle, { size: 36 * e, weight: 700, color: SUBTITLE, align: 'left', max: W * 0.8 });

    // The baseline, then the weeks. This week is the bright one.
    g.fillStyle = MUTED;
    g.fillRect(W * chart.x0, H * chart.baseline, W * (chart.x1 - chart.x0), Math.max(2, 2 * e));
    for (const bar of chart.bars) {
        const mid = W * (bar.x + bar.w / 2);
        if (bar.h > 0) {
            g.fillStyle = bar.current ? STRONG : ACCENT;
            g.fillRect(W * bar.x, H * bar.y, W * bar.w, H * bar.h);
        }
        write(g, bar.label, mid, H * (chart.baseline + 0.026), {
            size: 26 * e, weight: bar.current ? 800 : 500, color: bar.current ? STRONG : MUTED
        });
    }

    // The goal line goes over the bars, so a week that cleared it shows it,
    // and its label sits to the LEFT of the chart, where no bar can reach.
    g.strokeStyle = TITLE;
    g.lineWidth = Math.max(2, 3 * e);
    if (g.setLineDash) g.setLineDash([14 * e, 9 * e]);
    g.beginPath();
    g.moveTo(W * chart.x0, H * chart.goalY);
    g.lineTo(W * chart.x1, H * chart.goalY);
    g.stroke();
    if (g.setLineDash) g.setLineDash([]);
    write(g, 'goal', W * (chart.x0 - 0.015), H * chart.goalY - 15 * e, { size: 24 * e, weight: 600, color: TITLE, align: 'right' });
    write(g, String(chart.goal), W * (chart.x0 - 0.015), H * chart.goalY + 17 * e, { size: 30 * e, weight: 800, color: TITLE, align: 'right' });

    // Each week's count above its bar, drawn last so the line never covers it.
    for (const bar of chart.bars) {
        if (!bar.count) continue;
        write(g, String(bar.count), W * (bar.x + bar.w / 2), H * bar.y - 22 * e, {
            size: 32 * e, weight: 800, color: bar.current ? STRONG : TITLE
        });
    }

    write(g, lines.footer, W / 2, H * layout.footer, { size: 34 * e, weight: 700, color: ACCENT, max: W * 0.9 });
}
