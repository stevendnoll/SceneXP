// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * stunt.js - The crowd in the stands, and the card stunt it holds up at 500.
 *
 * PURE. Where every fan sits, who they came to cheer for, how high they jump
 * when their team does something, which card each one holds, and what colour
 * that card is at time `t`. spectacle.js turns the answers into instanced
 * meshes.
 *
 * ONE SEAT GRID, TWO CROWDS IN IT. The regulars are in the stands from the
 * first frame of every game, and the perfect game fills every seat they left
 * empty. Both come out of `crowdSeats`, so a fan who arrives at 500 can never
 * be sat on top of a regular: a seat is either one or the other, decided once
 * per seat and never re-rolled.
 *
 * THE STANDS HAVE FOUR RISERS, AND LETTERS NEED SEVEN ROWS. So each fan on the
 * far stand holds cards as tall as the step they stand on, split into an upper
 * and a lower half: four risers become eight rows of card, and a 5 by 7 pixel
 * font fits with a row to spare. At the distance the finale is shot from, eight
 * rows of rectangles stepping up a stand read as a card stunt, which is all a
 * card stunt ever is.
 *
 * `crowd.fanEvery` CARDS PER FAN PER HALF, NEVER MORE. A card belongs to a seat, so a stunt
 * that changes its message is the same cards flipping, which is what the eye
 * expects of one, rather than new cards appearing.
 */
import { XO_CONFIG as CFG } from './config.min.js';
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

/** The team with no colour: a fan in a plain jacket who came for the game. */
export const NEUTRAL = -1;

/**
 * A STABLE ROLL IN [0, 1) FOR ONE SEAT, so the same fan is in the same seat in
 * the same shirt on every visit and every replay. `salt` separates the
 * questions asked of one seat (is anybody here, which team, which shirt).
 * A small integer hash rather than `Math.random`: a crowd that reshuffled on
 * every new game would read as a glitch, not as a different crowd.
 */
export function seatRoll(side, riser, col, salt = 0) {
    let h = Math.imul((side > 0 ? 1 : 2) * 73856093 ^ riser * 19349663 ^ col * 83492791 ^ salt * 2654435761, 1);
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d);
    h ^= h >>> 12;
    h = Math.imul(h, 0x297a2d39);
    h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
}

/**
 * HOW FULL THE STANDS ARE BEFORE 500, at one column: fullest at midfield and
 * thinning toward the ends, which is where people actually sit.
 */
export function regularShare(col, cols) {
    const { middle, ends } = CFG.crowd.fill;
    const u = Math.min(1, Math.abs(((col + 0.5) / cols) - 0.5) * 2);
    return middle + (ends - middle) * u * u;
}

/** Which team a stand belongs to: +1 is the far stand, see `crowd.xSide`. */
export function homeTeam(side) {
    return side === CFG.crowd.xSide ? 0 : 1;
}

/**
 * WHETHER A SECTION WENT TO THE OTHER TEAM'S FANS: every `awayEvery`th one,
 * started at a different place on each side so the two stands do not mirror.
 * Spaced rather than rolled, because a roll put four away sections together
 * in the middle of one stand and only one, at the very end, in the other.
 *
 * NEVER THE NEAREST SECTIONS. A phone held upright sees little of the stands
 * but their near ends, and there each stand has to read as its home team.
 */
export function awaySection(side, section) {
    const every = CFG.crowd.awayEvery;
    const first = side > 0 ? 4 : 2;
    return section >= first && (section - first) % every === 0;
}

/**
 * Every seat in both stands, near end first. `side` is -1 or +1 (the sign of
 * z), `riser` counts up from the front row, and `col` is the first column of
 * cards the fan holds (`cols` counts card columns, `crowd.fanEvery` per fan).
 *
 * AND WHO IS IN IT, decided here once:
 *   regular  true if the seat is taken before 500
 *   team     0 for the Mongooses, 1 for the Crows, NEUTRAL for neither
 *   shirt    index into that team's shirts, skin into `crowd.skins`
 *   phase    0 to 1, so a stand of fans does not move as one block
 *   hair     a style from `crowd.hairStyles`, with `hairColour` and `pants`
 *            indices into their lists
 *   turn     radians off square to the field
 *
 * TEAMS SIT TOGETHER, which is what makes a stand read as rooting for somebody
 * from a camera 30m up. Each stand is its home team's colour, sold in sections,
 * and a few sections went to the visiting team's fans. A 50/50 scatter of both
 * colours reads as confetti at this distance.
 */
export function crowdSeats() {
    const S = standLayout();
    const K = CFG.crowd;
    const cols = Math.floor(S.totalLength / K.pitch);
    const seats = [];
    for (const side of [-1, 1]) {
        const home = homeTeam(side);
        for (let riser = 0; riser < S.rows; riser += 1) {
            for (let col = 0; col < cols; col += K.fanEvery) {
                const section = Math.floor(col / K.section);
                const sectionTeam = awaySection(side, section) ? 1 - home : home;
                const who = seatRoll(side, riser, col, 2);
                let team = sectionTeam;
                if (who < K.neutral) team = NEUTRAL;
                else if (who > K.neutral + (1 - K.neutral) * K.loyal) team = 1 - sectionTeam;
                const shirts = team === NEUTRAL ? K.shirts.neutral : K.shirts[team];
                seats.push({
                    side,
                    riser,
                    col,
                    // Centred on the columns of cards this fan holds.
                    x: S.fromX + (col + Math.min(K.fanEvery, cols - col) / 2) * K.pitch,
                    y: S.top(riser),
                    z: side * S.out(riser),
                    regular: seatRoll(side, riser, col, 0) < regularShare(col, cols),
                    team,
                    shirt: Math.floor(seatRoll(side, riser, col, 3) * shirts.length),
                    skin: Math.floor(seatRoll(side, riser, col, 4) * K.skins.length),
                    phase: seatRoll(side, riser, col, 5),
                    hair: K.hairStyles[Math.floor(seatRoll(side, riser, col, 6) * K.hairStyles.length)],
                    hairColour: Math.floor(seatRoll(side, riser, col, 7) * K.hairColours.length),
                    pants: Math.floor(seatRoll(side, riser, col, 8) * K.pants.length),
                    turn: (seatRoll(side, riser, col, 9) * 2 - 1) * K.turn,
                });
            }
        }
    }
    return { seats, cols };
}

/**
 * WHO CHEERS A PLAY, decided once at the whistle: `{ team, big }` or null.
 *
 * The Mongooses' fans go up for anything gained and go wild for a fifty. The
 * Crows' fans go up for anything stopped and go wild for a pick or a sack,
 * which are the defense's two big moments. `occasion` is celebration.js's
 * `occasionFor`, so the stands and the field agree on what a big play is.
 */
export function cheerFor(result, occasion = '') {
    if (!result) return null;
    if (occasion === 'fifty') return { team: 0, big: true };
    if (occasion === 'pick' || occasion === 'sack') return { team: 1, big: true };
    return (result.points || 0) > 0 ? { team: 0, big: false } : { team: 1, big: false };
}

/** Seconds from the whistle until the last fan is back in their seat. */
export function cheerLength(cheer) {
    if (!cheer) return 0;
    const C = CFG.crowd.cheer;
    return (cheer.big ? C.big.length : C.small.length) + C.stagger;
}

/**
 * WHERE A FAN'S ARMS ARE, `t` seconds after the whistle: 'up' for as long as
 * they are cheering and 'down' otherwise. Up a beat after they start jumping
 * and down a beat before they land, so the arms never snap while the feet are
 * on the riser. Still, like the hop, for somebody who asked for less motion.
 */
export function cheerArms(t, seat, cheer, { calm = false } = {}) {
    if (!cheer || calm || !(t >= 0)) return 'down';
    if (seat.team !== cheer.team && !(cheer.big && seat.team === NEUTRAL)) return 'down';
    const C = CFG.crowd.cheer;
    const { length } = cheer.big ? C.big : C.small;
    const local = t - seat.phase * C.stagger;
    const beat = Math.min(C.ease * 0.4, length / 4);
    return local > beat && local < length - beat ? 'up' : 'down';
}

/**
 * WHERE THE CARDS ARE HELD, in metres above the riser: the centres of the
 * upper and lower card, half a riser apart so the rows tile, and how far in
 * front of the fan they are held.
 */
export function cardHeights() {
    const S = standLayout();
    const K = CFG.crowd;
    const upper = K.cardsAt * K.scale;
    return { upper, lower: upper - S.stepUp / 2, half: 0.17, forward: 0.46 * K.scale, columns: K.fanEvery };
}

/** How high above the riser a fan can reach at 500: arms up, mid-bounce. */
export function crowdReach() {
    const K = CFG.crowd;
    return (K.reach + K.bounce) * K.scale;
}

/**
 * HOW HIGH ONE FAN IS OFF THEIR SEAT, `t` seconds after the whistle, in metres.
 *
 * Only the fans of the cheering team jump, and fans in no colour join in for a
 * big one. Each starts a little after the whistle by their own `phase`, so the
 * section goes up as a ripple rather than a block. The hop is eased in and out
 * by an envelope that is zero at both ends, so nobody pops off or onto a seat.
 * Somebody who asked not to be moved about sees the stands keep still.
 */
export function cheerHop(t, seat, cheer, { calm = false } = {}) {
    if (!cheer || calm || !(t >= 0)) return 0;
    if (seat.team !== cheer.team && !(cheer.big && seat.team === NEUTRAL)) return 0;
    const C = CFG.crowd.cheer;
    const { length } = cheer.big ? C.big : C.small;
    const hop = (cheer.big ? C.big.hop : C.small.hop) * CFG.crowd.scale;
    const local = t - seat.phase * C.stagger;
    if (local <= 0 || local >= length) return 0;
    const envelope = Math.min(1, local / C.ease, (length - local) / C.ease);
    return hop * envelope * Math.abs(Math.sin(Math.PI * C.rate * local));
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
 *
 * A regular was already there, so the perfect game fills in the empty seats
 * around them and never makes somebody arrive twice.
 */
export function fanArrival(t, seat, cols, { calm = false } = {}) {
    if (seat.regular) return 1;
    const [from, to] = CFG.milestones.finale.fill;
    if (calm) return t >= from ? 1 : 0;
    const start = from + (seat.col / Math.max(1, cols - 1)) * (to - from - 0.3) + seat.riser * 0.06;
    return clamp01((t - start) / 0.3);
}
