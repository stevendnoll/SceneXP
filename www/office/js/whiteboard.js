// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * whiteboard.js - The numbers of the search, as they are drawn on the
 * whiteboard, and where each thing sits on it.
 *
 * THREE THINGS, EACH IN THE FORM ITS JOB NEEDS. How far applications got is
 * a funnel of bars, one hue, each labeled with its count. How many went out
 * each week is a row of bars against the weekly goal, drawn as a dashed
 * line with its number beside it (a reference, not a second series and not
 * a second axis). How often and how fast companies reply are two big
 * numbers, because a single figure is read, not plotted.
 *
 * THE BOARD IS DRAWN IN FRACTIONS of its width and height, from `layout`,
 * and the same layout says where the goal line is, so a tap on the drawn
 * line (a uv from the raycast) can be recognized without a second copy of
 * the geometry.
 *
 * THE BOARD IS NOT THE ONLY COPY. A canvas cannot be read aloud, so the
 * whiteboard's sheet says the same numbers in sentences and tables
 * (`summaryLines`, and the model's own arrays).
 *
 * Pure.
 */

import { funnel, perWeek, responseStats, weekly, stats } from './derive.min.js';
import { STATUS_LABELS } from './labels.min.js';
import { parseLocal } from './dates.min.js';

const SHORT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

/** Everything the board shows, from the document. */
export function boardModel(doc, config, now, weeks = 8) {
    const s = stats(doc, config, now);
    return {
        funnel: funnel(doc, config).map((f) => ({ label: STATUS_LABELS[f.stage], count: f.count })),
        weeks: perWeek(doc, now, weeks).map((w, i, all) => ({
            label: SHORT.format(parseLocal(w.key)),
            count: w.count,
            current: i === all.length - 1
        })),
        goal: doc.settings.weeklyGoal,
        thisWeek: weekly(doc, now),
        response: responseStats(doc, config),
        quiet: s.ghosted,
        open: s.open
    };
}

/** Where everything sits, in fractions of the board (y runs down). */
export const LAYOUT = {
    title: { x: 0.05, y: 0.09 },
    funnel: { x0: 0.05, y0: 0.22, x1: 0.46, y1: 0.9 },
    weeks: { x0: 0.54, y0: 0.24, x1: 0.95, y1: 0.6 },
    numbers: { x0: 0.54, y0: 0.7, x1: 0.95, y1: 0.92 }
};

/** The funnel's bars: `{ x, y, w, h, label, count }` in fractions, the
 *  widest the first stage, every bar at least a sliver so a zero still reads
 *  as a stage. */
export function funnelBars(model, layout = LAYOUT) {
    const f = layout.funnel;
    const max = Math.max(1, ...model.funnel.map((s) => s.count));
    const slot = (f.y1 - f.y0) / model.funnel.length;
    const labelW = (f.x1 - f.x0) * 0.42;
    return model.funnel.map((s, i) => ({
        x: f.x0 + labelW,
        y: f.y0 + slot * i + slot * 0.2,
        w: Math.max(0.006, ((f.x1 - f.x0 - labelW) * 0.85 * s.count) / max),
        h: slot * 0.6,
        label: s.label,
        count: s.count
    }));
}

/** The week bars and the goal line. The scale always reaches past the goal,
 *  so the line is on the board even in a quiet week. */
export function weekChart(model, layout = LAYOUT) {
    const g = layout.weeks;
    const top = Math.max(model.goal * 1.25, ...model.weeks.map((w) => w.count), 1);
    const slot = (g.x1 - g.x0) / model.weeks.length;
    const yOf = (v) => g.y1 - ((g.y1 - g.y0) * v) / top;
    const bars = model.weeks.map((w, i) => ({
        x: g.x0 + slot * i + slot * 0.18,
        w: slot * 0.64,
        y: yOf(w.count),
        h: g.y1 - yOf(w.count),
        label: w.label,
        count: w.count,
        current: w.current
    }));
    return { bars, goalY: yOf(model.goal), x0: g.x0, x1: g.x1, baseline: g.y1 };
}

/**
 * Whether a uv on the board (from a raycast: u across, v UP) is on the goal
 * line, give or take a fingertip. The line is thin, so it gets a generous
 * band, and only within the chart's width.
 */
export function onGoalLine(uv, model, layout = LAYOUT, tolerance = 0.05) {
    if (!uv) return false;
    const chart = weekChart(model, layout);
    const y = 1 - uv.y;
    return uv.x >= chart.x0 - 0.02 && uv.x <= chart.x1 + 0.08 && Math.abs(y - chart.goalY) <= tolerance;
}

function percent(rate) {
    return `${Math.round(rate * 100)}%`;
}

/** The two big numbers: how often companies reply, and how fast. */
export function bigNumbers(model) {
    const r = model.response;
    return [
        { value: r.rate == null ? 'None yet' : percent(r.rate), label: r.rate == null ? 'replies so far' : 'heard back' },
        { value: r.medianDays == null ? 'None yet' : `${r.medianDays} ${r.medianDays === 1 ? 'day' : 'days'}`, label: 'to a first reply' }
    ];
}

/** The board in sentences, for the sheet and a screen reader. */
export function summaryLines(model) {
    const lines = [];
    const n = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
    lines.push(`This week: ${n(model.thisWeek.count, 'application')} sent, against a goal of ${model.goal}.`);
    const reached = model.funnel.filter((s) => s.count > 0).map((s) => `${s.label} ${s.count}`);
    lines.push(reached.length ? `How far they got: ${reached.join(', ')}.` : 'Nothing has been sent yet.');
    const r = model.response;
    if (r.rate != null) {
        const days = r.medianDays == null ? '' : `, usually within ${n(r.medianDays, 'day')}`;
        lines.push(`Companies replied to ${r.replied} of ${r.sent} (${percent(r.rate)})${days}.`);
    }
    if (model.quiet) lines.push(`${n(model.quiet, 'application has', 'applications have')} gone quiet.`);
    return lines;
}
