// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Corner Office's week card (step 1, 2026-10-21): its words, its model and
 * its painter. The card is a picture visitors post as their own, so the
 * promise that matters most is tested first: it carries COUNTS ONLY, never a
 * company or a role.
 *
 * Dates are pinned (the "a test on the real date rots" note). The painter
 * runs against a small recording context whose text is measured at a fixed
 * width per character, which is enough to check that nothing is written off
 * the card.
 */
import { CONFIG } from '../www/office/js/config.js';
import { emptyDoc, addApplication, setSettings } from '../www/office/js/store.js';
import { addDays, formatDate, weekStart } from '../www/office/js/dates.js';
import { weekCardLines, weekCardShareText } from '../www/office/js/copy.js';
import { weekCardModel } from '../www/office/js/whiteboard.js';
import { drawWeekCard, coverCrop, WEEK_CARD_LAYOUT } from '../www/office/js/weekcard.js';

const NOW = new Date(2026, 9, 21, 12, 0, 0);   // a Wednesday
const URL = CONFIG.weekCard.url;

/** A document with `weeks[i]` applications sent in each week, oldest first,
 *  the last one this week, every one with a company and a role. */
function docWith(weeks, goal = 5) {
    let doc = setSettings(emptyDoc(CONFIG, NOW), { weeklyGoal: goal }, CONFIG).doc;
    const monday = weekStart(NOW);
    weeks.forEach((n, i) => {
        const start = addDays(monday, -7 * (weeks.length - 1 - i));
        for (let k = 0; k < n; k++) {
            doc = addApplication(doc, {
                company: `Confidential Corp ${i}${k}`,
                role: 'Principal Secret Engineer',
                appliedOn: formatDate(addDays(start, k % 3))
            }, CONFIG, NOW).doc;
        }
    });
    return doc;
}

// ---- The words ----------------------------------------------------------------

describe('the week card speaks as the visitor, and kindly', () => {
    test('short of the goal, it says how close, not how far behind', () => {
        const l = weekCardLines({ count: 3, goal: 5 }, 'October 19, 2026', URL);
        expect(l.headline).toBe('3 applications sent this week');
        expect(l.goal).toBe('2 to go toward my goal of 5');
        expect(l.met).toBe(false);
    });

    test('on the goal, and past it', () => {
        expect(weekCardLines({ count: 5, goal: 5 }, 'x', URL).goal).toBe('Weekly goal of 5 reached!');
        const over = weekCardLines({ count: 12, goal: 5 }, 'x', URL);
        expect(over.goal).toBe('Weekly goal of 5 reached, plus 7 more!');
        expect(over.met).toBe(true);
    });

    test('the share sheet gets the card\'s own words and a link to follow', () => {
        const l = weekCardLines({ count: 6, goal: 5 }, 'October 19, 2026', URL);
        expect(weekCardShareText(l, 'https://scenexp.com/office/'))
            .toBe('6 applications sent this week. Weekly goal of 5 reached, plus 1 more! Track your own job search at https://scenexp.com/office/');
    });

    test('one application is singular, and the card is dated and signed', () => {
        const l = weekCardLines({ count: 1, goal: 5 }, 'October 19, 2026', URL);
        expect(l.headline).toBe('1 application sent this week');
        expect(l.date).toBe('Week of October 19, 2026');
        expect(l.footer).toBe('Track your own job search at scenexp.com/office');
    });
});

// ---- The model ------------------------------------------------------------------

describe('the week card model', () => {
    test('carries counts only: no company and no role can reach the card', () => {
        const model = weekCardModel(docWith([2, 4, 5, 3, 6, 5, 4, 3]), CONFIG, NOW);
        const text = JSON.stringify(model);
        expect(text).not.toMatch(/Confidential|Secret|Principal/);
        expect(model.week.count).toBe(3);
    });

    test('this week is the last bar, labeled by its Monday, and the card is dated by it', () => {
        const model = weekCardModel(docWith([1, 2, 3, 4, 5, 6, 7, 8]), CONFIG, NOW);
        expect(model.chart.bars).toHaveLength(CONFIG.weekCard.weeks);
        const last = model.chart.bars[model.chart.bars.length - 1];
        expect(last).toMatchObject({ current: true, count: 8, label: 'Oct 19' });
        expect(model.chart.bars.filter((b) => b.current)).toHaveLength(1);
        expect(model.lines.date).toBe('Week of October 19, 2026');
        expect(model.chart.goal).toBe(5);
        expect(model.fileName).toBe('corner-office-week-of-2026-10-19.jpg');
    });

    test('a newcomer\'s chart starts at their first week: one bar, full width, in the middle', () => {
        const newcomer = weekCardModel(docWith([0, 0, 0, 0, 0, 0, 0, 1]), CONFIG, NOW).chart;
        const veteran = weekCardModel(docWith([1, 1, 1, 1, 1, 1, 1, 1]), CONFIG, NOW).chart;
        const box = WEEK_CARD_LAYOUT.weeks;
        expect(newcomer.bars).toHaveLength(1);
        expect(newcomer.bars[0]).toMatchObject({ current: true, count: 1, label: 'Oct 19' });
        expect(newcomer.bars[0].w).toBeCloseTo(veteran.bars[0].w, 9);
        expect((newcomer.x0 + newcomer.x1) / 2).toBeCloseTo((box.x0 + box.x1) / 2, 9);
        expect(newcomer.x1 - newcomer.x0).toBeCloseTo((box.x1 - box.x0) / CONFIG.weekCard.weeks, 9);
    });

    test('a quiet week after the start is a real gap and stays', () => {
        const { chart } = weekCardModel(docWith([0, 0, 0, 0, 0, 2, 0, 1]), CONFIG, NOW);
        expect(chart.bars.map((b) => [b.label, b.count])).toEqual([['Oct 5', 2], ['Oct 12', 0], ['Oct 19', 1]]);
    });

    test('a search that began before the chart shows all of its weeks', () => {
        const { chart } = weekCardModel(docWith([1, 0, 0, 0, 0, 0, 0, 0, 1]), CONFIG, NOW);
        expect(chart.bars).toHaveLength(CONFIG.weekCard.weeks);
        expect(chart.x0).toBeCloseTo(WEEK_CARD_LAYOUT.weeks.x0, 9);
        expect(chart.x1).toBeCloseTo(WEEK_CARD_LAYOUT.weeks.x1, 9);
    });

    test('a job saved but never sent does not start the chart, and an empty office shows this week', () => {
        const fiveWeeksAgo = formatDate(addDays(weekStart(NOW), -35));
        const doc = addApplication(docWith([0, 0, 0, 0, 0, 0, 0, 1]), { company: 'Later', status: 'saved', appliedOn: fiveWeeksAgo }, CONFIG, NOW).doc;
        expect(weekCardModel(doc, CONFIG, NOW).chart.bars).toHaveLength(1);
        const empty = weekCardModel(emptyDoc(CONFIG, NOW), CONFIG, NOW).chart;
        expect(empty.bars).toEqual([expect.objectContaining({ current: true, count: 0 })]);
    });

    test('an empty week is not shareable, and one application is', () => {
        expect(weekCardModel(docWith([3, 3, 0]), CONFIG, NOW).shareable).toBe(false);
        expect(weekCardModel(docWith([0, 0, 1]), CONFIG, NOW).shareable).toBe(true);
    });

    test('the goal line stays inside the chart, in a quiet week and a huge one', () => {
        const box = WEEK_CARD_LAYOUT.weeks;
        for (const weeks of [[0, 0, 0, 1], [40, 60, 90, 120]]) {
            const { chart } = weekCardModel(docWith(weeks), CONFIG, NOW);
            expect(chart.goalY).toBeGreaterThanOrEqual(box.y0);
            expect(chart.goalY).toBeLessThanOrEqual(box.y1);
            for (const bar of chart.bars) expect(bar.y).toBeGreaterThanOrEqual(box.y0 - 1e-9);
        }
    });
});

// ---- The painter ------------------------------------------------------------------

/** A 2D context that records what is written and drawn. Text is measured
 *  at 0.6 of the font size a character, wider than system-ui really is. */
function recorder() {
    const calls = { text: [], images: [] };
    const g = {
        font: '', fillStyle: '', strokeStyle: '', textAlign: 'left', textBaseline: 'alphabetic', lineWidth: 1,
        measureText(t) {
            const px = Number((/(\d+)px/.exec(this.font) || [0, 16])[1]);
            return { width: String(t).length * px * 0.6 };
        },
        fillText(t, x, y) {
            calls.text.push({ t, x, y, font: this.font, align: this.textAlign, width: this.measureText(t).width });
        },
        drawImage(...args) { calls.images.push(args); },
        createLinearGradient() { return { addColorStop() {} }; },
        fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, setLineDash() {}
    };
    return { g, calls };
}

const W = CONFIG.weekCard.width;
const H = CONFIG.weekCard.height;

function paint(weeks, goal, photo = null) {
    const model = weekCardModel(docWith(weeks, goal), CONFIG, NOW);
    const { g, calls } = recorder();
    drawWeekCard(g, W, H, { lines: model.lines, chart: model.chart, photo });
    return { model, calls };
}

describe('the week card painter', () => {
    test('writes every line of its words', () => {
        const { model, calls } = paint([2, 4, 5, 3, 6, 5, 4, 3], 5);
        const written = calls.text.map((c) => c.t);
        for (const key of ['label', 'headline', 'goal', 'date', 'chart', 'footer']) {
            expect(written).toContain(model.lines[key]);
        }
    });

    test('nothing is written off the card, even at the largest numbers', () => {
        for (const [weeks, goal] of [[[80, 95, 100, 100, 90, 100, 100, 100], 100], [[0, 0, 1], 5]]) {
            const { calls } = paint(weeks, goal);
            for (const c of calls.text) {
                const left = c.align === 'center' ? c.x - c.width / 2 : c.align === 'right' ? c.x - c.width : c.x;
                expect(left).toBeGreaterThanOrEqual(0);
                expect(left + c.width).toBeLessThanOrEqual(W);
                expect(c.y).toBeGreaterThan(0);
                expect(c.y).toBeLessThan(H);
            }
        }
    });

    test('a long headline shrinks to fit rather than running off', () => {
        const { model, calls } = paint([100, 100, 100], 100);
        const headline = calls.text.find((c) => c.t === model.lines.headline);
        expect(headline.width).toBeLessThanOrEqual(W * 0.9);
    });

    test('the office is cropped to cover the card, and its absence is no failure', () => {
        const photo = { width: 1600, height: 1200 };
        const withPhoto = paint([1, 2, 3], 5, photo);
        expect(withPhoto.calls.images).toHaveLength(1);
        const [img, sx, sy, sw, sh, dx, dy, dw, dh] = withPhoto.calls.images[0];
        expect(img).toBe(photo);
        expect([dx, dy, dw, dh]).toEqual([0, 0, W, H]);
        expect(sw / sh).toBeCloseTo(W / H, 9);
        expect(sy).toBeCloseTo(0, 9);
        expect(sx).toBeCloseTo((1600 - sw) / 2, 9);

        const without = paint([1, 2, 3], 5, null);
        expect(without.calls.images).toHaveLength(0);
        expect(without.calls.text.length).toBe(withPhoto.calls.text.length);
    });
});

test('coverCrop trims the long side and keeps the middle', () => {
    expect(coverCrop(1000, 1000, 500, 1000)).toEqual({ sx: 250, sy: 0, sw: 500, sh: 1000 });
    expect(coverCrop(1000, 2000, 1000, 1000)).toEqual({ sx: 0, sy: 500, sw: 1000, sh: 1000 });
});
