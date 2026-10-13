// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * The plan board and the service menu's display (www/whitestone/js/boards.js):
 * they say the same facts the cards do (the quote, the starred tasks in the
 * order the home is walked, the tasks on each level, the menu's prices),
 * and they paint them inside their faces, clear of the board's standoff
 * caps, never running a long name into the next column.
 *
 * The drawing is checked on a recording context whose text is measured at
 * a fixed width per character, so "fits" means the same thing every run.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG } from '../www/whitestone/js/config.js';
import {
    boardContent, menuContent, displayPrice, contentKey, menuAreaFor, fitText, wrapText, packText, drawBoard, drawMenu, BOARD, MENU
} from '../www/whitestone/js/boards.js';
import { quoteChip, taskName } from '../www/whitestone/js/panels.js';
import { formatMoney, priceChoice } from '../www/whitestone/js/pricing.js';
import { tasksFor } from '../www/whitestone/js/sheet.js';
import { BOARDS, UI } from '../www/whitestone/js/copy.js';
import { withExample } from '../www/whitestone/js/samples.js';
import { emptyDoc } from '../www/whitestone/js/store.js';
import { TAXONOMY } from '../www/whitestone/js/taxonomy.js';

const NOW = new Date('2026-10-12T16:00:00Z');
const prices = join(process.cwd(), 'www', 'whitestone', 'data', 'prices');
const SHEET = JSON.parse(readFileSync(join(prices, `${JSON.parse(readFileSync(join(prices, 'index.json'), 'utf8')).cleaning}.json`), 'utf8'));
const LEVEL_RANK = new Map(TAXONOMY.cleaning.levels.map((l, i) => [l.key, i]));

function example() {
    return withExample(emptyDoc(CONFIG, NOW), CONFIG, NOW, null).doc.checklists[0];
}

/** A 2D context that records what is written, measuring text at 0.55 of
 *  its font size per character. */
function recorder(width, height) {
    const texts = [];
    const rects = [];
    const ctx = {
        font: '10px sans-serif',
        fillStyle: '#000',
        textAlign: 'left',
        textBaseline: 'alphabetic',
        size() {
            return Number(/(\d+)px/.exec(this.font)[1]);
        },
        measureText(t) {
            return { width: String(t).length * this.size() * 0.55 };
        },
        fillText(t, x, y) {
            const w = this.measureText(t).width;
            const x0 = this.textAlign === 'right' ? x - w : this.textAlign === 'center' ? x - w / 2 : x;
            texts.push({ text: String(t), x0, x1: x0 + w, top: y - this.size() * 0.8, bottom: y + this.size() * 0.25, color: this.fillStyle });
        },
        fillRect(x, y, w, h) {
            rects.push({ x, y, w, h, color: this.fillStyle });
        },
        createLinearGradient: () => ({ addColorStop() {} })
    };
    return { ctx, texts, rects, width, height };
}

// ---- What the board says ---------------------------------------------------------

describe('the plan board', () => {
    test('with nothing open, it invites the visitor to start', () => {
        const c = boardContent(null, SHEET);
        expect(c.empty).toEqual({ title: BOARDS.emptyTitle, detail: BOARDS.emptyDetail });
    });

    test("the example home's quote is the chip's quote", () => {
        const home = example();
        const c = boardContent(home, SHEET);
        expect(c.title).toBe(home.title);
        expect(c.tag).toBe(UI.example);
        expect(UI.quoteChip(c.quote.money, c.quote.time)).toBe(quoteChip(home, SHEET).text);
        expect(c.examplePrices).toBe(UI.examplePrices);
    });

    test('starred tasks lead, in the order the home is walked, level by level', () => {
        const home = example();
        const c = boardContent(home, SHEET);
        const rooms = new Map(home.rooms.map((r) => [r.id, r]));
        const starred = home.items.filter((i) => i.important)
            .sort((a, b) => (LEVEL_RANK.get(rooms.get(a.roomId).level) - LEVEL_RANK.get(rooms.get(b.roomId).level))
                || (home.rooms.indexOf(rooms.get(a.roomId)) - home.rooms.indexOf(rooms.get(b.roomId)))
                || (a.order - b.order));
        expect(starred.length).toBeGreaterThan(1);
        expect(c.starred.map((s) => s.name)).toEqual(starred.map((i) => taskName(SHEET, i)));
        // The basement's task was added last of all, and still leads once starred.
        const down = { ...home, items: home.items.map((i) => (i.id === 'example-task-13-1' ? { ...i, important: true } : i)) };
        expect(boardContent(down, SHEET).starred[0]).toEqual({ name: taskName(SHEET, down.items.find((i) => i.id === 'example-task-13-1')), room: 'Basement family room' });
        expect(c.more).toBe('');
        expect(c.noStarred).toBe('');
    });

    test('the tasks on each level add up to every task, in the order the levels stack', () => {
        const home = example();
        const c = boardContent(home, SHEET);
        expect(c.levels.map((l) => l.name)).toEqual(['Basement', 'Main floor', 'Second floor']);
        const total = c.levels.reduce((n, l) => n + l.tasks, 0);
        expect(total).toBe(home.items.length);
    });

    test('more than five starred tasks are counted, not crowded in', () => {
        const home = example();
        const all = { ...home, items: home.items.map((i) => ({ ...i, important: true })) };
        const c = boardContent(all, SHEET);
        expect(c.starred).toHaveLength(BOARD.starred);
        expect(c.more).toBe(BOARDS.moreStarred(home.items.length - BOARD.starred));
    });

    test('no stars yet, no tasks yet, no sheet yet, and below the minimum each say so', () => {
        const home = example();
        expect(boardContent({ ...home, items: home.items.map((i) => ({ ...i, important: false })) }, SHEET).noStarred).toBe(BOARDS.noStarred);
        const bare = boardContent({ ...home, items: [] }, SHEET);
        expect(bare.quote).toBeNull();
        expect(bare.note).toBe(BOARDS.noTasks);
        expect(bare.noStarred).toBe('');
        const waiting = boardContent(home, null);
        expect(waiting.quote).toBeNull();
        expect(waiting.note).toBe(UI.sheetMissing);
        const one = { ...home, items: [home.items.find((i) => !i.important && i.task === 'microwave')] };
        const small = boardContent(one, SHEET);
        expect(small.quote).not.toBeNull();
        expect(small.note).toMatch(/^Add \$/);
        expect(small.note).toBe(BOARDS.minimumShort(formatMoney(SHEET.visitMinimumCents - priceChoice(SHEET, one.items[0], 'kitchen').cents)));
    });

    test('a draft is called a draft', () => {
        expect(boardContent({ ...example(), sample: false }, SHEET).tag).toBe(UI.draft);
    });
});

// ---- What the menu says ------------------------------------------------------------

describe('the menu display', () => {
    test("a room's tasks with short prices, and a count of the rest", () => {
        const c = menuContent(SHEET, 'kitchen');
        const tasks = tasksFor(SHEET, 'kitchen');
        expect(c.area).toBe('Kitchen');
        expect(c.rows.map((r) => r.name)).toEqual(tasks.slice(0, MENU.rows).map((t) => t.name));
        expect(c.more).toBe(tasks.length > MENU.rows ? BOARDS.menuMore(tasks.length - MENU.rows) : '');
        expect(c.footer).toBe(BOARDS.menuFooter(SHEET.version));
    });

    test('every kind of price reads short', () => {
        const byUnit = (unit) => SHEET.tasks.find((t) => t.unit === unit);
        const room = byUnit('room');
        expect(displayPrice(SHEET, room)).toBe(BOARDS.menuFrom(formatMoney(priceChoice(SHEET, { task: room.key, size: 'small' }).cents)));
        expect(displayPrice(SHEET, byUnit('count'))).toBe(BOARDS.menuEach(formatMoney(byUnit('count').cents)));
        expect(displayPrice(SHEET, byUnit('each'))).toBe(formatMoney(byUnit('each').cents));
    });

    test('before the sheet loads it says so', () => {
        expect(menuContent(null, 'kitchen')).toEqual({ heading: BOARDS.menuHeading, loading: BOARDS.menuLoading });
    });

    test('it shows the room last browsed, else the home\'s first room, else the kitchen', () => {
        const home = example();
        expect(menuAreaFor('office', home)).toBe('office');
        expect(menuAreaFor(null, home)).toBe(home.rooms[0].area);
        expect(menuAreaFor(null, { ...home, rooms: [] })).toBe('kitchen');
        expect(menuAreaFor(null, null)).toBe('kitchen');
    });

    test('the same words make the same key, and new words a new one', () => {
        expect(contentKey(menuContent(SHEET, 'kitchen'))).toBe(contentKey(menuContent(SHEET, 'kitchen')));
        expect(contentKey(menuContent(SHEET, 'kitchen'))).not.toBe(contentKey(menuContent(SHEET, 'office')));
    });
});

// ---- Fitting words ---------------------------------------------------------------------

describe('fitting words', () => {
    const { ctx } = recorder(100, 100);
    ctx.font = '600 20px sans';

    test('text that fits is left alone, text that does not is cut with an ellipsis', () => {
        expect(fitText(ctx, 'Kitchen', 200)).toBe('Kitchen');
        const cut = fitText(ctx, 'A very long room name indeed', 120);
        expect(cut.endsWith('…')).toBe(true);
        expect(ctx.measureText(cut).width).toBeLessThanOrEqual(120);
        expect(ctx.measureText(`${cut.slice(0, -1)}x…`).width).toBeGreaterThan(120 - 11);
    });

    test('packing keeps each part whole, and every line inside', () => {
        const parts = ['Basement 1', 'Main floor 15', 'Second floor 11', 'Third floor 3', 'Attic 2', 'Garage 2', 'Detached garage 1'];
        const lines = packText(ctx, parts, 300, 9);
        for (const l of lines) expect(ctx.measureText(l).width).toBeLessThanOrEqual(300);
        expect(lines.join(' ').replace(/,/g, '')).toBe(parts.join(' '));
        for (const p of parts) expect(lines.some((l) => l.includes(p))).toBe(true);
        const short = packText(ctx, parts, 300, 2);
        expect(short).toHaveLength(2);
        expect(short[1].endsWith('…')).toBe(true);
    });

    test('wrapping keeps every line inside, and the last of too many lines is cut', () => {
        const text = 'Start your own checklist at the desk, and your quote gathers here on this board for you';
        const lines = wrapText(ctx, text, 200, 3);
        expect(lines).toHaveLength(3);
        for (const l of lines) expect(ctx.measureText(l).width).toBeLessThanOrEqual(200);
        expect(lines[2].endsWith('…')).toBe(true);
        expect(wrapText(ctx, 'Short', 200, 3)).toEqual(['Short']);
    });
});

// ---- Painting ------------------------------------------------------------------------------

describe('painting', () => {
    const { board, menu } = CONFIG.boards;

    test("each canvas has its face's own shape, so nothing is stretched", () => {
        const s = CONFIG.studio;
        expect(board.width / board.height).toBeCloseTo((s.board.width - 0.05) / (s.board.height - 0.05), 2);
        expect(menu.width / menu.height).toBeCloseTo((s.menu.width - 0.04) / (s.menu.height - 0.04), 2);
    });

    function paintedBoard(content) {
        const r = recorder(board.width, board.height);
        drawBoard(r.ctx, r.width, r.height, content, CONFIG);
        return r;
    }

    const inCorner = (t, W, H, c) => (t.x0 < c || t.x1 > W - c) && (t.top < c || t.bottom > H - c);

    test.each([
        ['the example', () => boardContent(example(), SHEET)],
        ['the empty plinth', () => boardContent(null, SHEET)],
        ['every task starred, long names', () => {
            const home = example();
            return boardContent({
                ...home,
                title: 'Our wonderful family home on the hill above the river',
                rooms: home.rooms.map((r) => ({ ...r, label: 'A rather long name for this room' })),
                items: home.items.map((i) => ({ ...i, important: true }))
            }, SHEET);
        }],
        ['every level, no stars', () => {
            const home = example();
            return boardContent({ ...home, levels: TAXONOMY.cleaning.levels.map((l) => l.key), items: home.items.map((i) => ({ ...i, important: false })) }, SHEET);
        }]
    ])('%s: every word inside the board, clear of the standoff caps', (_name, make) => {
        const r = paintedBoard(make());
        expect(r.texts.length).toBeGreaterThan(2);
        for (const t of r.texts) {
            expect(t.text).not.toMatch(/undefined|null|\[object/);
            expect(t.x0).toBeGreaterThanOrEqual(0);
            expect(t.x1).toBeLessThanOrEqual(r.width);
            expect(t.top).toBeGreaterThanOrEqual(0);
            expect(t.bottom).toBeLessThanOrEqual(r.height);
            expect(`${t.text} in a corner: ${inCorner(t, r.width, r.height, BOARD.corner)}`).toBe(`${t.text} in a corner: false`);
        }
    });

    test('no column runs into the next', () => {
        const home = example();
        const r = paintedBoard(boardContent({
            ...home,
            rooms: home.rooms.map((x) => ({ ...x, label: 'A rather long name for this room' })),
            items: home.items.map((i) => ({ ...i, important: true }))
        }, SHEET));
        const [, starred] = BOARD.columns;
        for (const t of r.texts.filter((x) => x.top > BOARD.top - 30)) {
            if (t.x0 < starred) expect(t.x1).toBeLessThanOrEqual(starred - BOARD.gutter);
        }
    });

    test('a price is never cut short, however large, and nor is the time', () => {
        const content = { ...boardContent(example(), SHEET), quote: { money: '$12,345.67', time: 'about 12 hours 45 minutes' } };
        const r = paintedBoard(content);
        const money = r.texts.find((t) => t.text.startsWith('$12'));
        expect(money.text).toBe('$12,345.67');
        expect(money.x1).toBeLessThanOrEqual(BOARD.columns[1] - BOARD.gutter);
        expect(r.texts.map((t) => t.text)).toContain('about 12 hours 45 minutes');
    });

    test('the board says what its content says', () => {
        const content = boardContent(example(), SHEET);
        const words = paintedBoard(content).texts.map((t) => t.text);
        expect(words).toEqual(expect.arrayContaining([content.title, content.quote.money, content.quote.time]));
        // Each level whole on its line, never broken inside its name.
        const lines = words.filter((w) => /\b(floor|Basement)\b/.test(w));
        for (const l of content.levels) expect(lines.some((w) => w.includes(`${l.name} ${l.tasks}`))).toBe(true);
        for (const s of content.starred) expect(words).toContain(s.name);
    });

    test('the menu paints every row inside the screen, the name never under the price', () => {
        for (const area of TAXONOMY.cleaning.areas.map((a) => a.key)) {
            const content = menuContent(SHEET, area);
            const r = recorder(menu.width, menu.height);
            drawMenu(r.ctx, r.width, r.height, content, CONFIG);
            for (const t of r.texts) {
                expect(t.x0).toBeGreaterThanOrEqual(0);
                expect(t.x1).toBeLessThanOrEqual(r.width);
                expect(t.bottom).toBeLessThanOrEqual(r.height);
                expect(t.text).not.toMatch(/undefined|null/);
            }
            for (const row of content.rows) {
                const price = r.texts.find((t) => t.text === row.price && t.color === '#D6E2EE');
                const name = r.texts.find((t) => Math.abs(t.bottom - price.bottom) < 1e-9 && t !== price);
                expect(name.x1).toBeLessThan(price.x0);
            }
        }
    });

    test('a long task name is cut before it reaches its price', () => {
        const content = menuContent(SHEET, 'kitchen');
        const long = { ...content, rows: [{ name: 'Inside the refrigerator, every shelf and drawer, wiped and dried', price: 'from $1,234.56', minutes: 'about 90 min' }] };
        const r = recorder(menu.width, menu.height);
        drawMenu(r.ctx, r.width, r.height, long, CONFIG);
        const price = r.texts.find((t) => t.text === 'from $1,234.56');
        const name = r.texts.find((t) => t.text.startsWith('Inside'));
        expect(name.text.endsWith('…')).toBe(true);
        expect(name.x1).toBeLessThan(price.x0);
    });

    test('the loading menu says it is loading', () => {
        const r = recorder(menu.width, menu.height);
        drawMenu(r.ctx, r.width, r.height, menuContent(null, 'kitchen'), CONFIG);
        expect(r.texts.map((t) => t.text)).toContain(BOARDS.menuLoading);
    });
});
