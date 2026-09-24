// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * paint.js - The pictures the office paints on canvases: the monitor's face,
 * the city beyond the glass, the wall calendar, and the sticky notes.
 *
 * Every measurement is a fraction of the canvas's width and height, so the
 * same painter fills a small texture or a large one without drifting.
 *
 * THE MONITOR SAYS WHAT THE GRID SAYS. Its lines are built by `screenLines`
 * from the same numbers the grid's summary uses, and the canvas is not the
 * only place they are said: the page's live region and the grid carry them
 * as text, because a canvas cannot be read aloud.
 */

import { count } from './copy.min.js';
import { css } from './daylight.min.js';

/** The monitor's lines, from derive.stats. */
export function screenLines(s) {
    const lines = [];
    if (!s.applications) {
        lines.push('An empty office.', 'Open the computer to begin.');
        return lines;
    }
    lines.push(count(s.applications, 'application'));
    const waiting = s.dueToday + s.overdue;
    lines.push(waiting ? `${count(waiting, 'follow-up')} waiting today` : 'Nothing due today');
    lines.push(`${s.weekly.count} of ${s.weekly.goal} sent this week`);
    if (s.upcoming) lines.push(`${count(s.upcoming, 'event')} this week`);
    return lines;
}

/** Paint the monitor's face. */
export function drawScreen(ctx, W, H, lines) {
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#1b2a3f');
    bg.addColorStop(1, '#0f1826');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // A title bar, like any window.
    ctx.fillStyle = '#26384f';
    ctx.fillRect(0, 0, W, H * 0.14);
    ctx.fillStyle = '#e4c07a';
    ctx.font = `600 ${Math.round(H * 0.075)}px system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillText('Corner Office', W * 0.05, H * 0.07);

    ctx.fillStyle = '#e8eef6';
    lines.forEach((line, i) => {
        ctx.font = `${i === 0 ? 700 : 500} ${Math.round(H * (i === 0 ? 0.11 : 0.075))}px system-ui, sans-serif`;
        ctx.fillText(line, W * 0.07, H * (0.3 + i * 0.15), W * 0.86);
    });
}

/**
 * Paint the view: a sky over a hazy skyline, colored for the time of day
 * (daylight.js `lighting`), with windows lit across the city as the light
 * goes. Seeded, so the city is the same city on every visit and the same
 * windows light up every evening.
 */
export function drawSkyline(ctx, W, H, look = {}) {
    const top = look.skyTop != null ? css(look.skyTop) : '#7fb2dd';
    const bottom = look.skyBottom != null ? css(look.skyBottom) : '#e3ecef';
    const lit = look.cityLights || 0;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, top);
    sky.addColorStop(1, bottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    let seed = 17;
    const random = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
    };
    const layers = [
        [look.cityFar != null ? css(look.cityFar) : '#a7b8c9', 0.72, 0.28],
        [look.cityNear != null ? css(look.cityNear) : '#8497ab', 0.8, 0.22]
    ];
    for (const [shade, base, tall] of layers) {
        let x = 0;
        while (x < W) {
            const w = W * (0.02 + random() * 0.05);
            const h = H * (0.05 + random() * tall);
            const y = H * base - h;
            ctx.fillStyle = shade;
            ctx.fillRect(x, y, w + 1, H - y);
            // Windows: a grid of small squares, a seeded few of them lit.
            const step = Math.max(3, W * 0.006);
            for (let wy = y + step; wy < H * base - step; wy += step * 1.8) {
                for (let wx = x + step * 0.6; wx < x + w - step; wx += step * 1.6) {
                    if (random() < lit * 0.55) {
                        ctx.fillStyle = 'rgba(255, 214, 140, 0.9)';
                        ctx.fillRect(wx, wy, step * 0.7, step * 0.8);
                    }
                }
            }
            x += w;
        }
    }
}

/** Paint the wall calendar's month, with a dot for every event and a ring for
 *  every follow-up, and today circled. `marks` is calendar.js `agenda`. */
export function drawCalendar(ctx, W, H, { grid, marks, todayKey }) {
    ctx.fillStyle = '#f8f5ee';
    ctx.fillRect(0, 0, W, H);
    // The picture half: a band of color, as wall calendars have.
    ctx.fillStyle = '#2f5d73';
    ctx.fillRect(0, 0, W, H * 0.2);
    ctx.fillStyle = '#f6ecd8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(H * 0.07)}px system-ui, sans-serif`;
    ctx.fillText(grid.title, W / 2, H * 0.1);

    const top = H * 0.25;
    const cellW = W / 7;
    const cellH = (H - top - H * 0.03) / (grid.weeks.length + 0.6);
    ctx.fillStyle = '#6b6356';
    ctx.font = `600 ${Math.round(cellH * 0.3)}px system-ui, sans-serif`;
    ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach((d, i) => ctx.fillText(d, cellW * (i + 0.5), top + cellH * 0.3));
    grid.weeks.forEach((week, r) => {
        week.forEach((day, c) => {
            const cx = cellW * (c + 0.5);
            const cy = top + cellH * (r + 1.1);
            const items = marks.get(day.key);
            if (day.key === todayKey) {
                ctx.fillStyle = '#e4c07a';
                ctx.beginPath();
                ctx.arc(cx, cy, cellH * 0.36, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.fillStyle = day.inMonth ? '#2a2420' : '#b9b0a3';
            ctx.font = `${day.key === todayKey ? 700 : 500} ${Math.round(cellH * 0.34)}px system-ui, sans-serif`;
            ctx.fillText(String(day.day), cx, cy);
            if (items && items.events.length) {
                ctx.fillStyle = '#c8553d';
                ctx.beginPath();
                ctx.arc(cx - cellW * 0.12, cy + cellH * 0.32, cellH * 0.07, 0, Math.PI * 2);
                ctx.fill();
            }
            if (items && items.tasks.length) {
                ctx.strokeStyle = '#2f5d73';
                ctx.lineWidth = Math.max(1, cellH * 0.03);
                ctx.beginPath();
                ctx.arc(cx + cellW * 0.12, cy + cellH * 0.32, cellH * 0.07, 0, Math.PI * 2);
                ctx.stroke();
            }
        });
    });
    ctx.textAlign = 'left';
}

/** Words wrapped to a width, at most `max` lines, the last one ending in an
 *  ellipsis if the words ran out of room. */
export function wrap(ctx, text, width, max) {
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    const fits = (s) => (ctx.measureText ? ctx.measureText(s).width : s.length * 8) <= width;
    for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (fits(next) || !line) line = next;
        else {
            lines.push(line);
            line = word;
        }
    }
    if (line) lines.push(line);
    if (lines.length > max) {
        const kept = lines.slice(0, max);
        kept[max - 1] = `${kept[max - 1].replace(/\s*\S*$/, '')}…`;
        return kept;
    }
    return lines;
}

/** Paint the sticky notes' atlas: one square cell per note (notes.js). */
export function drawNoteAtlas(ctx, W, H, notes, { cols, rows }, wordsOf, colorOf) {
    ctx.clearRect(0, 0, W, H);
    const cw = W / cols;
    const ch = H / rows;
    notes.forEach((note, i) => {
        const x = (i % cols) * cw;
        const y = Math.floor(i / cols) * ch;
        ctx.fillStyle = colorOf(note);
        ctx.fillRect(x, y, cw, ch);
        // A darker strip where the glue is.
        ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
        ctx.fillRect(x, y, cw, ch * 0.12);
        const words = wordsOf(note);
        ctx.fillStyle = '#2a2420';
        ctx.textBaseline = 'top';
        ctx.font = `600 ${Math.round(ch * 0.12)}px system-ui, sans-serif`;
        wrap(ctx, words.text, cw * 0.84, 4).forEach((line, k) => {
            ctx.fillText(line, x + cw * 0.08, y + ch * (0.18 + k * 0.15));
        });
        ctx.font = `700 ${Math.round(ch * 0.1)}px system-ui, sans-serif`;
        ctx.fillStyle = 'rgba(42, 36, 32, 0.7)';
        ctx.fillText(words.small, x + cw * 0.08, y + ch * 0.8);
    });
}

/** Paint a drawer's label card: its range, in a typewriter's hand. */
export function drawLabelCard(ctx, W, H, text) {
    ctx.fillStyle = '#f4efe4';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(42, 36, 32, 0.35)';
    ctx.lineWidth = Math.max(1, H * 0.04);
    ctx.strokeRect(H * 0.06, H * 0.06, W - H * 0.12, H - H * 0.12);
    ctx.fillStyle = '#2a2420';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = Math.round(H * 0.5);
    ctx.font = `600 ${size}px ui-monospace, Menlo, Consolas, monospace`;
    while (size > 8 && ctx.measureText && ctx.measureText(text).width > W * 0.9) {
        size -= 2;
        ctx.font = `600 ${size}px ui-monospace, Menlo, Consolas, monospace`;
    }
    ctx.fillText(text, W / 2, H / 2);
    ctx.textAlign = 'left';
}

/** Paint the corkboard's header: the column names across a paper strip, the
 *  first column on the left. */
export function drawBoardHeader(ctx, W, H, labels) {
    ctx.fillStyle = '#f4efe4';
    ctx.fillRect(0, 0, W, H);
    const w = W / labels.length;
    ctx.fillStyle = '#2a2420';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    labels.forEach((label, i) => {
        let size = Math.round(H * 0.42);
        ctx.font = `700 ${size}px system-ui, sans-serif`;
        while (size > 8 && ctx.measureText && ctx.measureText(label).width > w * 0.9) {
            size -= 2;
            ctx.font = `700 ${size}px system-ui, sans-serif`;
        }
        ctx.fillText(label, w * (i + 0.5), H / 2);
        if (i) {
            ctx.fillStyle = 'rgba(42, 36, 32, 0.25)';
            ctx.fillRect(w * i - 1, H * 0.2, 2, H * 0.6);
            ctx.fillStyle = '#2a2420';
        }
    });
    ctx.textAlign = 'left';
}

/**
 * Paint one index card into its cell of the board's atlas: a ruled card with
 * a colored band for its status, a pin, the company, the role, and a line
 * saying if it has gone quiet or is a sample.
 */
export function drawCardFace(ctx, x, y, w, h, card) {
    ctx.fillStyle = '#fbf8f1';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = card.band || '#6fa8dc';
    ctx.fillRect(x, y, w, h * 0.12);
    ctx.fillStyle = 'rgba(111, 168, 220, 0.25)';
    for (let ly = y + h * 0.42; ly < y + h * 0.95; ly += h * 0.14) ctx.fillRect(x + w * 0.04, ly, w * 0.92, 1);
    // The pin.
    ctx.fillStyle = '#c8553d';
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h * 0.07, h * 0.06, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a2420';
    ctx.textBaseline = 'top';
    ctx.font = `700 ${Math.round(h * 0.17)}px system-ui, sans-serif`;
    wrap(ctx, card.title, w * 0.88, 2).forEach((line, i) => ctx.fillText(line, x + w * 0.06, y + h * (0.17 + i * 0.18)));
    ctx.font = `500 ${Math.round(h * 0.12)}px system-ui, sans-serif`;
    ctx.fillStyle = '#4a4238';
    wrap(ctx, card.subtitle || '', w * 0.88, 1).forEach((line) => ctx.fillText(line, x + w * 0.06, y + h * 0.56));
    if (card.note) {
        ctx.font = `700 ${Math.round(h * 0.11)}px system-ui, sans-serif`;
        ctx.fillStyle = '#8a4a3a';
        ctx.fillText(card.note, x + w * 0.06, y + h * 0.78);
    }
}
