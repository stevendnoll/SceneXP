// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * stunt.js - The crowd for the perfect game, and the card stunt it holds up.
 *
 * PURE. Where every fan sits, which card each one holds, and what colour that
 * card is at time `t`. spectacle.js turns the answers into two instanced meshes.
 *
 * THE STANDS HAVE FOUR RISERS, AND LETTERS NEED SEVEN ROWS. So each fan on the
 * far stand holds a card as tall as the step he stands on, split into an upper
 * and a lower half: four risers become eight rows of card, and a 5 by 7 pixel
 * font fits with a row to spare. At the distance the finale is shot from, eight
 * rows of rectangles stepping up a stand read as a card stunt, which is all a
 * card stunt ever is.
 *
 * ONE CARD PER FAN PER HALF, NEVER MORE. A card belongs to a seat, so a stunt
 * that changes its message is the same cards flipping, which is what the eye
 * expects of one, rather than new cards appearing.
 */
import { EXESNOHS_CONFIG as CFG } from './config.min.js';
import { standLayout } from './field.min.js';
import { hexToRgb } from './fireworks.min.js';

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

/**
 * A 5 BY 7 PIXEL FONT, only the characters the stunt spells. Each row is a
 * string, `#` a lit pixel, top row first.
 */
export const FONT = {
    P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
    E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
    R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
    F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
    C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
    T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
    5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
    0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
};

/** Rows of card on the far stand: two per riser. */
export const CARD_ROWS = 8;

/** Every seat in both stands, near end first. `side` is -1 or +1 (the sign of
 *  z), `riser` counts up from the front row, and `col` along the stand. */
export function crowdSeats() {
    const S = standLayout();
    const pitch = CFG.milestones.finale.fans.pitch;
    const cols = Math.floor(S.totalLength / pitch);
    const seats = [];
    for (const side of [-1, 1]) {
        for (let riser = 0; riser < S.rows; riser += 1) {
            for (let col = 0; col < cols; col += 1) {
                seats.push({
                    side,
                    riser,
                    col,
                    x: S.fromX + (col + 0.5) * pitch,
                    y: S.top(riser),
                    z: side * S.out(riser),
                });
            }
        }
    }
    return { seats, cols };
}

/**
 * Lay a message out on the card grid: a Set of "row:col" for every lit pixel,
 * centred along the stand. Row 0 is the TOP row of cards.
 */
export function pixelMessage(text, cols) {
    const glyphs = String(text).split('').filter((c) => FONT[c]);
    const width = glyphs.length ? glyphs.length * 6 - 1 : 0;
    const left = Math.floor((cols - width) / 2);
    const lit = new Set();
    glyphs.forEach((c, g) => {
        FONT[c].forEach((line, row) => {
            for (let k = 0; k < line.length; k += 1) {
                if (line[k] === '#') lit.add(`${row}:${left + g * 6 + k}`);
            }
        });
    });
    return { lit, width, left };
}

/** Which card row a riser's upper and lower half are: the back riser's upper
 *  half is row 0. */
export function cardRow(riser, upper, rows = 4) {
    return (rows - 1 - riser) * 2 + (upper ? 0 : 1);
}

/**
 * THE CARD STUNT AT TIME `t`: for a card at (row, col), how far it is turned
 * (1 facing the field, 0 edge on, mid-flip) and what colour it shows.
 *
 * A flip is a squash to edge-on and back, and the colour changes at the edge,
 * which is exactly the moment nobody can see which side is showing. Each column
 * flips a little after the one before it, so the message sweeps along the stand.
 * Somebody who asked not to be moved about gets the message switched, not
 * flipped.
 */
export function cardAt(t, row, col, cols, messages, { calm = false } = {}) {
    const F = CFG.milestones.finale;
    const P = F.cards;
    const flipFor = F.flip;
    const sweep = (window, c) => window[0] + (c / Math.max(1, cols - 1)) * (window[1] - window[0] - flipFor);

    const stages = [
        { at: F.perfect, lit: messages.perfect, on: hexToRgb(P.white), off: hexToRgb(P.orange) },
        { at: F.five, lit: messages.five, on: hexToRgb(P.gold), off: hexToRgb(P.navy) },
    ];
    let colour = null;
    let turn = 0;
    for (const stage of stages) {
        const start = calm ? stage.at[0] : sweep(stage.at, col);
        const f = (t - start) / flipFor;
        if (f < 0) break;
        const face = stage.lit.has(`${row}:${col}`) ? stage.on : stage.off;
        if (calm || f >= 1) {
            colour = face;
            turn = 1;
            continue;
        }
        if (!colour) {
            // The first message: a card coming up from edge on.
            colour = face;
            turn = Math.sin((Math.PI / 2) * f);
        } else if (f < 0.5) {
            // Squashing to the edge on the old face...
            turn = Math.cos(Math.PI * f);
        } else {
            // ...and growing back on the new one.
            colour = face;
            turn = -Math.cos(Math.PI * f);
        }
        break;
    }
    return { turn, colour: colour || [0, 0, 0] };
}

/**
 * HOW FAR INTO THE STANDS A FAN HAS ARRIVED, 0 to 1: a ripple down the length of
 * both stands, the front row a little before the back.
 */
export function fanArrival(t, seat, cols, { calm = false } = {}) {
    const [from, to] = CFG.milestones.finale.fill;
    if (calm) return t >= from ? 1 : 0;
    const start = from + (seat.col / Math.max(1, cols - 1)) * (to - from - 0.3) + seat.riser * 0.06;
    return clamp01((t - start) / 0.3);
}
