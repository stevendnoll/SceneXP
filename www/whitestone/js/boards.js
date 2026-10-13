// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * boards.js - The plan board and the service menu's display, painted onto
 * their faces in the studio (PRD 8.3).
 *
 *   The plan board   the open checklist as a live summary, printed on frosted
 *                    glass: its title, the quote and the time, the starred
 *                    tasks first, and the tasks on each level.
 *   The menu display the price sheet for one kind of room, on a slim dark
 *                    screen: every task with its price and time.
 *
 * WHAT THEY SAY IS WORKED OUT APART FROM HOW IT IS DRAWN. `boardContent`
 * and `menuContent` turn the document and the sheet into plain words, which
 * the tests read, and `drawBoard` and `drawMenu` paint those words onto a
 * canvas's 2D context. main.js repaints a face only when its words change
 * (`contentKey`), so a still studio paints nothing.
 *
 * The cards stay the way to act and the accessible way to read: these faces
 * are the same facts, seen in the room.
 *
 * Pure but for the drawing, which only calls the context it is handed.
 */

import { BOARDS, UI } from './copy.min.js';
import { liveRooms, itemsIn } from './store.min.js';
import { quoteFor, taskName } from './panels.min.js';
import { formatMoney, formatMinutes, priceChoice } from './pricing.min.js';
import { tasksFor } from './sheet.min.js';
import { serviceType, areaOf, roomName } from './taxonomy.min.js';

/** The type on both faces: the system's own sans, as the cards use. */
export const FONT = '"Helvetica Neue", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';

/** The board's layout, in canvas pixels: the quote and the tasks on each
 *  level in the left column, the starred tasks in the right. `corner` is
 *  the square at each corner kept clear of words: the aluminum standoff caps
 *  stand there, proud of the face (studio.js buildBoard). */
export const BOARD = { pad: 64, corner: 52, starred: 5, columns: [64, 560], gutter: 48, top: 250 };

/** The menu display's layout, in canvas pixels. */
export const MENU = { pad: 56, rows: 7, rowTop: 222, rowStep: 56 };

/** The palette the faces are painted in (CONFIG.colors, and the screen's
 *  own grays). */
function palette(config) {
    const c = config.colors;
    return {
        ink: c.graphite,
        muted: '#6E6A64',
        accent: c.accent,
        screenInk: '#F4F5F6',
        screenMuted: '#9AA3AC',
        screenPrice: '#D6E2EE',
        screenRule: '#3A3F45'
    };
}

// ---- What the faces say (pure) --------------------------------------------------

/**
 * The plan board's words for a checklist (or null for none):
 *
 *   { empty: { title, detail } }                    no checklist open
 *   { title, tag, quote, starred, more, levels, note }
 *
 * `quote` is { money, time } or null (no tasks yet, or no sheet yet), with
 * `note` saying why or nudging toward the visit minimum. `starred` lists the
 * starred tasks in the order the home is walked: level by level, room by
 * room, task by task. `levels` counts the tasks on each of the home's levels.
 */
export function boardContent(checklist, sheet) {
    if (!checklist) return { empty: { title: BOARDS.emptyTitle, detail: BOARDS.emptyDetail } };
    const type = serviceType(checklist.serviceType);
    const levelRank = new Map(type.levels.map((l, i) => [l.key, i]));
    const rooms = liveRooms(checklist).slice().sort((a, b) => levelRank.get(a.level) - levelRank.get(b.level));
    const starred = [];
    let count = 0;
    for (const room of rooms) {
        for (const item of itemsIn(checklist, room.id)) {
            count++;
            if (item.important) starred.push({ name: taskName(sheet, item), room: roomName(checklist.serviceType, room) });
        }
    }
    const levels = type.levels
        .filter((l) => checklist.levels.includes(l.key))
        .map((l) => ({
            name: l.name,
            tasks: rooms.filter((r) => r.level === l.key).reduce((n, r) => n + itemsIn(checklist, r.id).length, 0)
        }));
    let quote = null;
    let note = '';
    if (!count) note = BOARDS.noTasks;
    else if (!sheet) note = UI.sheetMissing;
    else {
        const q = quoteFor(checklist, sheet);
        quote = { money: formatMoney(q.totalCents), time: formatMinutes(q.minutes) };
        if (q.topUpCents) note = BOARDS.minimumShort(formatMoney(q.topUpCents));
    }
    return {
        title: checklist.title,
        tag: checklist.sample ? UI.example : UI.draft,
        quote,
        examplePrices: quote ? UI.examplePrices : '',
        note,
        starred: starred.slice(0, BOARD.starred),
        more: starred.length > BOARD.starred ? BOARDS.moreStarred(starred.length - BOARD.starred) : '',
        noStarred: count && !starred.length ? BOARDS.noStarred : '',
        levels
    };
}

/** A task's price as the display shows it: short, so it fits a row. */
export function displayPrice(sheet, task) {
    if (task.unit === 'room') return BOARDS.menuFrom(formatMoney(priceChoice(sheet, { task: task.key, size: 'small' }).cents));
    if (task.unit === 'count') return BOARDS.menuEach(formatMoney(task.cents));
    return formatMoney(task.cents);
}

/**
 * The menu display's words for one kind of room:
 *   { heading, area, rows: [{ name, price, minutes }], more, footer }
 * or { heading, loading } before the sheet has loaded.
 */
export function menuContent(sheet, area) {
    if (!sheet) return { heading: BOARDS.menuHeading, loading: BOARDS.menuLoading };
    const kind = areaOf('cleaning', area);
    const tasks = tasksFor(sheet, area);
    return {
        heading: BOARDS.menuHeading,
        area: kind ? kind.name : area,
        examplePrices: UI.examplePrices,
        rows: tasks.slice(0, MENU.rows).map((t) => ({ name: t.name, price: displayPrice(sheet, t), minutes: BOARDS.menuMinutes(t.minutes) })),
        more: tasks.length > MENU.rows ? BOARDS.menuMore(tasks.length - MENU.rows) : '',
        footer: BOARDS.menuFooter(sheet.version)
    };
}

/** What a face shows, as one string: repaint only when it changes. */
export function contentKey(content) {
    return JSON.stringify(content);
}

/** The kind of room the menu display shows: the one the visitor last
 *  browsed, else the open home's first room, else the kitchen. */
export function menuAreaFor(chosen, checklist) {
    if (chosen) return chosen;
    const first = checklist ? liveRooms(checklist)[0] : null;
    return first ? first.area : 'kitchen';
}

// ---- Drawing ----------------------------------------------------------------------

/** `text` cut to fit `max` pixels, with an ellipsis where it was cut. */
export function fitText(ctx, text, max) {
    const s = String(text);
    if (!(max > 0) || ctx.measureText(s).width <= max) return s;
    let lo = 0;
    let hi = s.length;
    while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (ctx.measureText(`${s.slice(0, mid).trimEnd()}…`).width <= max) lo = mid;
        else hi = mid - 1;
    }
    return `${s.slice(0, lo).trimEnd()}…`;
}

/** `text` broken into lines no wider than `max`, at most `limit` of them
 *  (the last cut with an ellipsis if the words run on). */
export function wrapText(ctx, text, max, limit = 3) {
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (let i = 0; i < words.length; i++) {
        const next = line ? `${line} ${words[i]}` : words[i];
        if (line && ctx.measureText(next).width > max) {
            if (lines.length === limit - 1) {
                lines.push(fitText(ctx, `${line} ${words.slice(i).join(' ')}`, max));
                return lines;
            }
            lines.push(line);
            line = words[i];
        } else {
            line = next;
        }
    }
    if (line) lines.push(fitText(ctx, line, max));
    return lines;
}

/** Whole `parts` packed into lines no wider than `max`, joined by `joiner`,
 *  never breaking inside a part: at most `limit` lines, the last cut with an
 *  ellipsis if the parts run on. */
export function packText(ctx, parts, max, limit, joiner = ', ') {
    const lines = [];
    let line = '';
    for (let i = 0; i < parts.length; i++) {
        const next = line ? `${line}${joiner}${parts[i]}` : parts[i];
        if (line && ctx.measureText(next).width > max) {
            if (lines.length === limit - 1) {
                lines.push(fitText(ctx, `${line}${joiner}${parts.slice(i).join(joiner)}`, max));
                return lines;
            }
            lines.push(`${line}${joiner.trimEnd()}`);
            line = parts[i];
        } else {
            line = next;
        }
    }
    if (line) lines.push(fitText(ctx, line, max));
    return lines;
}

function write(ctx, text, x, y, { size, weight = 400, color, align = 'left', max = 0 }) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(max ? fitText(ctx, text, max) : text, x, y);
}

/** Write `text` whole, at `size` or as much smaller as it takes to fit
 *  `max` (never below `min`): for a price, which is never cut short. */
function writeWhole(ctx, text, x, y, { size, min, weight = 400, color, max }) {
    let s = size;
    for (; s > min; s -= 2) {
        ctx.font = `${weight} ${s}px ${FONT}`;
        if (ctx.measureText(text).width <= max) break;
    }
    write(ctx, text, x, y, { size: s, weight, color, max: s === min ? max : 0 });
}

function writeLines(ctx, text, x, y, step, opts, limit) {
    ctx.font = `${opts.weight || 400} ${opts.size}px ${FONT}`;
    const lines = wrapText(ctx, text, opts.max, limit);
    lines.forEach((line, i) => write(ctx, line, x, y + i * step, { ...opts, max: 0 }));
    return y + lines.length * step;
}

/** Paint the plan board: frosted glass, printed in graphite and the accent. */
export function drawBoard(ctx, W, H, content, config) {
    const p = palette(config);
    const { pad, columns, top } = BOARD;
    ctx.fillStyle = config.boards.board.background;
    ctx.fillRect(0, 0, W, H);
    // The light catching the frosting, brightest at the top left.
    const glow = ctx.createLinearGradient(0, 0, W, H);
    glow.addColorStop(0, 'rgba(255,255,255,0.75)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    write(ctx, config.name.toUpperCase(), pad, pad + 22, { size: 20, weight: 600, color: p.muted });
    if (content.empty) {
        write(ctx, content.empty.title, W / 2, H / 2 - 30, { size: 48, weight: 600, color: p.ink, align: 'center', max: W - 2 * pad });
        writeLines(ctx, content.empty.detail, W / 2, H / 2 + 30, 38, { size: 28, color: p.muted, align: 'center', max: W - 4 * pad }, 3);
        return;
    }
    write(ctx, content.title, pad, pad + 96, { size: 50, weight: 600, color: p.ink, max: W - 2 * pad - 180 });
    write(ctx, content.tag, W - pad, pad + 96, { size: 22, weight: 600, color: p.accent, align: 'right' });
    ctx.fillStyle = p.accent;
    ctx.fillRect(pad, pad + 124, 72, 4);

    // The quote, and under it the tasks on each level.
    const [qx, sx] = columns;
    const colWidth = sx - qx - BOARD.gutter;
    write(ctx, BOARDS.quoteLabel, qx, top, { size: 22, weight: 600, color: p.muted });
    let y = top + 30;
    if (content.quote) {
        writeWhole(ctx, content.quote.money, qx, y + 80, { size: 96, min: 56, weight: 700, color: p.accent, max: colWidth });
        writeWhole(ctx, content.quote.time, qx, y + 126, { size: 28, min: 20, color: p.ink, max: colWidth });
        write(ctx, content.examplePrices, qx, y + 162, { size: 20, color: p.muted, max: colWidth });
        y += 206;
    } else {
        y += 30;
    }
    if (content.note) y = writeLines(ctx, content.note, qx, y, 32, { size: 24, color: p.ink, max: colWidth }, 2) + 16;
    y = Math.max(y, top + 260);
    write(ctx, BOARDS.levelsHeading, qx, y, { size: 22, weight: 600, color: p.muted });
    ctx.font = `400 24px ${FONT}`;
    const room = Math.max(1, Math.floor((H - pad - (y + 36)) / 32) + 1);
    packText(ctx, content.levels.map((l) => `${l.name} ${l.tasks}`), colWidth, room)
        .forEach((line, i) => write(ctx, line, qx, y + 36 + i * 32, { size: 24, color: p.ink }));

    // The starred tasks, in the order the home is walked.
    const starWidth = W - pad - sx;
    write(ctx, BOARDS.starredHeading, sx, top, { size: 22, weight: 600, color: p.muted });
    y = top + 50;
    for (const s of content.starred) {
        ctx.fillStyle = p.accent;
        ctx.fillRect(sx, y - 18, 8, 8);
        write(ctx, s.name, sx + 20, y, { size: 26, weight: 600, color: p.ink, max: starWidth - 20 });
        write(ctx, s.room, sx + 20, y + 26, { size: 20, color: p.muted, max: starWidth - 20 });
        y += 64;
    }
    if (content.more) write(ctx, content.more, sx + 20, y, { size: 20, color: p.muted, max: starWidth - 20 });
    if (content.noStarred) writeLines(ctx, content.noStarred, sx, y, 30, { size: 22, color: p.muted, max: starWidth }, 4);
}

/** Paint the service menu's display: a dark screen, the room's tasks in
 *  rows with their prices. */
export function drawMenu(ctx, W, H, content, config) {
    const p = palette(config);
    const { pad, rowTop, rowStep } = MENU;
    ctx.fillStyle = config.boards.menu.background;
    ctx.fillRect(0, 0, W, H);
    write(ctx, content.heading.toUpperCase(), pad, pad + 20, { size: 22, weight: 600, color: p.screenMuted });
    if (content.loading) {
        write(ctx, content.loading, W / 2, H / 2, { size: 34, color: p.screenInk, align: 'center', max: W - 2 * pad });
        return;
    }
    write(ctx, content.examplePrices, W - pad, pad + 20, { size: 20, color: p.screenMuted, align: 'right' });
    write(ctx, content.area, pad, pad + 84, { size: 52, weight: 600, color: p.screenInk, max: W - 2 * pad });
    ctx.fillStyle = p.screenRule;
    ctx.fillRect(pad, pad + 112, W - 2 * pad, 2);
    let y = rowTop;
    for (const r of content.rows) {
        write(ctx, r.price, W - pad, y, { size: 28, weight: 600, color: p.screenPrice, align: 'right' });
        ctx.font = `600 28px ${FONT}`;
        const priceWidth = ctx.measureText(r.price).width;
        write(ctx, r.name, pad, y, { size: 28, weight: 500, color: p.screenInk, max: W - 2 * pad - priceWidth - 32 });
        write(ctx, r.minutes, pad, y + 22, { size: 17, color: p.screenMuted });
        y += rowStep;
    }
    if (content.more) write(ctx, content.more, pad, y + 6, { size: 20, color: p.screenMuted, max: W - 2 * pad });
    write(ctx, content.footer, W - pad, H - 30, { size: 16, color: p.screenMuted, align: 'right' });
}

export const __test__ = { palette };
