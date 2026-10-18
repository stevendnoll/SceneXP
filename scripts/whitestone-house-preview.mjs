// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * whitestone-house-preview.mjs - The house model's style, chosen by eye
 * before it is built in 3D (QA, 2026-10-13: "I don't think I've ever seen a
 * house in real life that has that color palette ... We really need to nail
 * the house").
 *
 *   node scripts/whitestone-house-preview.mjs
 *
 * Writes specs/whitestone/previews/houses.html (git-ignored): the same home
 * (two stories, an attached garage, a front garden) as a front elevation in
 * four real architectural styles, each in the handful of colors a real
 * house of that style wears, with its windows following the rooms behind
 * them. One self-contained file of inline SVG, no scripts, so it opens
 * straight from the disk.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'specs', 'whitestone', 'previews', 'houses.html');

const W = 600;
const H = 360;
const G = 300;                  // the ground line
const HOUSE = { x0: 110, x1: 390, floor1: 205, top: 110 };
const GARAGE = { x0: 390, x1: 510, top: 215 };

// ---- Drawing ---------------------------------------------------------------------

const el = (tag, attrs, inner = '') => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}${inner ? `>${inner}</${tag}>` : '/>'}`;
const rect = (x, y, w, h, fill, extra = {}) => el('rect', { x, y, width: w, height: h, fill, ...extra });
const poly = (pts, fill, extra = {}) => el('polygon', { points: pts.map((p) => p.join(',')).join(' '), fill, ...extra });
const line = (x1, y1, x2, y2, stroke, width = 1) => el('line', { x1, y1, x2, y2, stroke, 'stroke-width': width });
const circle = (cx, cy, r, fill) => el('circle', { cx, cy, r, fill });

/** A window: a frame, its glass, and (as the style has it) muntins or a
 *  split down the middle. */
function windowAt(x, y, w, h, s, { grille = false, split = false } = {}) {
    const f = s.frameWidth;
    let out = rect(x - f, y - f, w + 2 * f, h + 2 * f, s.frame);
    out += rect(x, y, w, h, s.glass);
    // A soft reflection, so glass reads as glass.
    out += poly([[x, y + h * 0.65], [x + w * 0.45, y], [x + w * 0.62, y], [x, y + h]], 'rgba(255,255,255,0.12)');
    if (split) out += line(x + w / 2, y, x + w / 2, y + h, s.frame, Math.max(1.5, f * 0.7));
    if (grille) {
        out += line(x, y + h / 2, x + w, y + h / 2, s.frame, 1.6);
        for (let i = 1; i < 3; i++) out += line(x + (w * i) / 3, y, x + (w * i) / 3, y + h, s.frame, 1.2);
    }
    if (s.sill) out += rect(x - f - 2, y + h + f, w + 2 * f + 4, 3, s.sill);
    return out;
}

/** The siding's texture, as an SVG pattern. */
function siding(id, kind, base, line2) {
    if (kind === 'batten') return `<pattern id="${id}" width="11" height="10" patternUnits="userSpaceOnUse">${rect(0, 0, 11, 10, base)}${line(0, 0, 0, 10, line2, 1.4)}</pattern>`;
    if (kind === 'lap') return `<pattern id="${id}" width="10" height="7" patternUnits="userSpaceOnUse">${rect(0, 0, 10, 7, base)}${line(0, 6.5, 10, 6.5, line2, 1)}</pattern>`;
    if (kind === 'shingle') return `<pattern id="${id}" width="14" height="9" patternUnits="userSpaceOnUse">${rect(0, 0, 14, 9, base)}${line(0, 8.5, 14, 8.5, line2, 1)}${line(4, 0, 4, 4.5, line2, 0.8)}${line(11, 4.5, 11, 9, line2, 0.8)}</pattern>`;
    if (kind === 'panel') return `<pattern id="${id}" width="46" height="34" patternUnits="userSpaceOnUse">${rect(0, 0, 46, 34, base)}${line(0, 0, 46, 0, line2, 1.2)}${line(0, 0, 0, 34, line2, 1.2)}</pattern>`;
    if (kind === 'stone') return `<pattern id="${id}" width="24" height="12" patternUnits="userSpaceOnUse">${rect(0, 0, 24, 12, base)}${rect(1, 1, 13, 4.5, line2)}${rect(15, 1, 8, 4.5, line2)}${rect(1, 6.5, 7, 4.5, line2)}${rect(9, 6.5, 14, 4.5, line2)}</pattern>`;
    if (kind === 'vertical') return `<pattern id="${id}" width="6" height="10" patternUnits="userSpaceOnUse">${rect(0, 0, 6, 10, base)}${line(0, 0, 0, 10, line2, 1)}</pattern>`;
    return `<pattern id="${id}" width="10" height="10" patternUnits="userSpaceOnUse">${rect(0, 0, 10, 10, base)}</pattern>`;
}

/** The garden in front: lawn, a path to the door, a drive, shrubs, a tree. */
function garden(s) {
    let out = rect(0, G, W, H - G, s.lawn);
    if (s.gravel) out += rect(100, G, 300, 10, s.gravel);
    out += poly([[248, G], [262, G], [282, H], [228, H]], s.path);
    out += poly([[405, G], [495, G], [520, H], [380, H]], s.drive);
    for (const [x, r] of [[128, 9], [146, 11], [196, 9], [214, 8], [300, 9], [322, 11], [352, 9]]) {
        if (s.grasses) {
            for (let i = -2; i <= 2; i++) out += line(x, G, x + i * 4, G - r * 1.9 + Math.abs(i) * 3, s.shrub, 2);
            continue;
        }
        out += circle(x, G - r * 0.6, r, s.shrub);
        if (s.bloom) for (let i = 0; i < 3; i++) out += circle(x - r * 0.5 + i * r * 0.5, G - r * 1.1 + (i % 2) * 3, 2.2, s.bloom);
    }
    out += s.tree(48, G);
    return out;
}

function deciduous(trunk, leaves) {
    return (x, g) => rect(x - 3, g - 95, 6, 95, trunk) + circle(x, g - 112, 34, leaves[0]) + circle(x - 20, g - 95, 22, leaves[1]) + circle(x + 22, g - 98, 24, leaves[1]);
}

function birch(x, g) {
    let out = rect(x - 3, g - 120, 6, 120, '#EEEAE2');
    for (let i = 0; i < 6; i++) out += rect(x - 3, g - 110 + i * 18, 4, 2, '#3A3936');
    return out + circle(x, g - 128, 26, '#8FAA5E') + circle(x - 14, g - 110, 16, '#9DB66A') + circle(x + 16, g - 112, 18, '#86A257');
}

function japaneseMaple(x, g) {
    return rect(x - 3, g - 60, 6, 60, '#4E433C') + el('ellipse', { cx: x, cy: g - 78, rx: 40, ry: 24, fill: '#A2452F' })
        + el('ellipse', { cx: x - 22, cy: g - 66, rx: 22, ry: 14, fill: '#B8563A' }) + el('ellipse', { cx: x + 24, cy: g - 68, rx: 22, ry: 14, fill: '#8F3A28' });
}

function olive(x, g) {
    return rect(x - 3, g - 70, 7, 70, '#6B6158') + circle(x, g - 88, 30, '#9AA582') + circle(x - 22, g - 74, 18, '#A7B18F') + circle(x + 20, g - 76, 20, '#8E9A76');
}

/**
 * The house in a style. The rooms behind the front wall are the example
 * home's: a living room and the front door and a kitchen downstairs, two
 * bedrooms and a bath upstairs, and the windows follow them: a picture
 * window for the living room, a wide window over the kitchen counter, a
 * pair for each bedroom, a small high one for the bath.
 */
function house(s) {
    const defs = siding(`${s.key}-body`, s.siding, s.body, s.sidingLine) + siding(`${s.key}-upper`, s.upperSiding || s.siding, s.upper || s.body, s.upperLine || s.sidingLine)
        + (s.extraDefs ? s.extraDefs() : '');
    let out = '';
    // Roof behind and over the walls.
    out += s.roof();
    // Walls.
    out += rect(HOUSE.x0, HOUSE.floor1, HOUSE.x1 - HOUSE.x0, G - HOUSE.floor1, `url(#${s.key}-body)`);
    out += rect(HOUSE.x0, HOUSE.top, HOUSE.x1 - HOUSE.x0, HOUSE.floor1 - HOUSE.top, `url(#${s.key}-upper)`);
    out += rect(GARAGE.x0, GARAGE.top, GARAGE.x1 - GARAGE.x0, G - GARAGE.top, `url(#${s.key}-body)`);
    if (s.cornerBoards) {
        for (const x of [HOUSE.x0, HOUSE.x1 - 6, GARAGE.x1 - 6]) out += rect(x, x === GARAGE.x1 - 6 ? GARAGE.top : HOUSE.top, 6, G - (x === GARAGE.x1 - 6 ? GARAGE.top : HOUSE.top), s.trim);
        out += rect(HOUSE.x0, HOUSE.floor1 - 3, HOUSE.x1 - HOUSE.x0, 5, s.trim);
    }
    if (s.band) out += rect(HOUSE.x0, HOUSE.floor1 - 4, HOUSE.x1 - HOUSE.x0, 7, s.band);
    out += s.garageRoof();
    // Windows, by room.
    for (const [x, y, w, h, opts] of s.windows) out += windowAt(x, y, w, h, s, opts);
    // The front door, and what dresses it.
    out += s.entry();
    // The garage door.
    out += s.garageDoor();
    // Lights by the door.
    for (const x of [226, 290]) out += rect(x, 248, 5, 9, s.lamp) + rect(x + 1, 257, 3, 3, '#FFE7A6');
    out += garden(s);
    if (s.extras) out += s.extras();
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs>${defs}</defs>${rect(0, 0, W, H, s.sky)}${out}</svg>`;
}

// ---- The four styles ---------------------------------------------------------------

const STYLES = [
    {
        key: 'seattle',
        name: 'Seattle new build (the city "modern box")',
        about: 'What developers build across Ballard, Fremont and West Seattle: a flat roof with a rooftop deck behind a glass railing, white fiber-cement panels above, charcoal lap siding below, a cedar box round the entry under a black steel canopy, black windows in different sizes, a glass-panel garage door, a horizontal cedar fence, grasses and a Japanese maple.',
        palette: [['Panels, white', '#EEEDEA'], ['Lap siding, charcoal', '#3F4246'], ['Cedar accent', '#B07A4D'], ['Windows, canopy, black', '#1F2124'], ['Japanese maple', '#A2452F']],
        sky: '#E6ECF0', siding: 'lap', body: '#3F4246', sidingLine: '#34373A', upperSiding: 'panel', upper: '#EEEDEA', upperLine: '#D2D0CB',
        trim: '#1F2124', band: '#1F2124',
        frame: '#1F2124', frameWidth: 3, glass: '#7A8E9B', lamp: '#1F2124',
        lawn: '#93AE6E', path: '#CFCBC3', drive: '#C7C3BB', shrub: '#A9A46E', grasses: true, gravel: '#B7B2A8',
        tree: japaneseMaple,
        roof: () => rect(106, 104, 288, 8, '#1F2124')
            // The rooftop deck: a glass railing and the stair's little penthouse.
            + rect(112, 82, 210, 22, 'rgba(180,205,215,0.45)') + rect(112, 80, 210, 3, '#1F2124') + [112, 182, 252, 319].map((x) => rect(x, 80, 3, 24, '#1F2124')).join('')
            + rect(326, 66, 62, 38, '#3F4246') + rect(326, 62, 62, 5, '#1F2124') + rect(336, 74, 26, 30, '#7A8E9B'),
        garageRoof: () => rect(386, 209, 128, 7, '#1F2124'),
        windows: [
            [124, 226, 30, 64, {}], [160, 226, 30, 64, {}],
            [304, 238, 76, 26, {}],
            [124, 124, 70, 56, { split: true }],
            [214, 122, 16, 60, {}],
            [312, 130, 66, 30, {}]
        ],
        entry: () => {
            // The cedar box round the entry, full height, and the canopy.
            let out = rect(232, 110, 62, 190, 'url(#seattle-cedar)');
            out += rect(244, 232, 30, 68, '#1F2124') + rect(276, 232, 8, 68, '#7A8E9B') + rect(276, 232, 8, 2, '#1F2124');
            out += rect(226, 222, 76, 5, '#1F2124');
            out += rect(248, 128, 30, 46, '#1F2124') + rect(251, 131, 24, 40, '#7A8E9B');
            return out;
        },
        extraDefs: () => `<pattern id="seattle-cedar" width="7" height="10" patternUnits="userSpaceOnUse">${rect(0, 0, 7, 10, '#B07A4D')}${line(0, 0, 0, 10, '#956541', 1.2)}</pattern>`,
        garageDoor: () => rect(404, 232, 92, 68, '#1F2124') + [0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((c) => rect(407 + c * 22.5, 235 + r * 16.5, 19.5, 13.5, '#C9D2D6')).join('')).join(''),
        extras: () => rect(14, 262, 82, 38, 'url(#seattle-cedar-fence)') + `<defs><pattern id="seattle-cedar-fence" width="10" height="6" patternUnits="userSpaceOnUse">${rect(0, 0, 10, 6, '#B07A4D')}${line(0, 5.5, 10, 5.5, '#7E5536', 1.2)}</pattern></defs>`
    },
    {
        key: 'eastside',
        name: 'Eastside new build (the suburban developer home)',
        about: 'What builders put up in Bothell, Sammamish and Woodinville: gray lap siding with a white board-and-batten front gable, a dark gray roof, black windows, a stacked-stone base at the porch and the garage, cedar porch posts under a black metal porch roof, and a cedar-stained garage door.',
        palette: [['Lap siding, gray', '#6E7276'], ['Gable, white board and batten', '#F2F1EC'], ['Roof, dark gray', '#3E4042'], ['Stone base', '#A49C90'], ['Cedar posts and garage', '#A8714A'], ['Windows, black', '#1F2124']],
        sky: '#E8EEF2', siding: 'lap', body: '#6E7276', sidingLine: '#5E6266', trim: '#F2F1EC',
        frame: '#1F2124', frameWidth: 3.5, glass: '#7A8E9B', lamp: '#1F2124',
        lawn: '#91AD6C', path: '#D3CFC7', drive: '#C9C5BD', shrub: '#50703F', bloom: null,
        tree: deciduous('#5E544B', ['#5F8A48', '#6E9752']),
        roof: () => poly([[96, 114], [112, 70], [388, 70], [404, 114]], '#3E4042')
            // The front gable over the left wing, white board and batten.
            + poly([[104, 116], [176, 46], [248, 116]], '#3E4042') + poly([[114, 112], [176, 56], [238, 112]], 'url(#eastside-gable)'),
        extraDefs: () => siding('eastside-gable', 'batten', '#F2F1EC', '#DCD9D1') + siding('eastside-stone', 'stone', '#8E877C', '#A49C90'),
        garageRoof: () => poly([[384, 217], [450, 180], [516, 217]], '#3E4042'),
        windows: [
            [126, 226, 92, 52, { split: true }],
            [304, 236, 70, 28, {}],
            [130, 128, 30, 48, {}], [168, 128, 30, 48, {}],
            [240, 132, 22, 22, {}],
            [304, 128, 30, 48, {}], [342, 128, 30, 48, {}]
        ],
        entry: () => {
            let out = rect(244, 236, 30, 64, '#1F2124') + rect(250, 242, 18, 22, '#7A8E9B');
            // A black metal porch roof on cedar posts, on stone piers.
            out += poly([[222, 214], [298, 214], [302, 224], [218, 224]], '#1F2124');
            for (const x of [224, 290]) out += rect(x, 224, 8, 48, '#A8714A') + rect(x - 3, 272, 14, 28, 'url(#eastside-stone)');
            // The stone base across the garage.
            out += rect(390, 280, 120, 20, 'url(#eastside-stone)');
            return out;
        },
        garageDoor: () => rect(404, 232, 92, 48, '#A8714A') + [1, 2, 3].map((i) => line(404, 232 + i * 12, 496, 232 + i * 12, '#8C5B39', 1.2)).join('') + rect(404, 232, 92, 9, '#7A8E9B')
    },
    {
        key: 'farmhouse',
        name: 'Modern farmhouse',
        about: 'The most common new-build look in America. White board and batten, a steep black standing-seam roof, black-framed windows, a natural white oak door under a small black porch roof. Color comes from the oak and the garden.',
        palette: [['Body and trim, warm white', '#F3F1EB'], ['Roof, windows, lamps', '#2A2B2D'], ['Front door and garage, white oak', '#B98A5E'], ['Shrubs', '#4F6E3F']],
        sky: '#E9F0F5', siding: 'batten', body: '#F3F1EB', sidingLine: '#DEDAD0', trim: '#F3F1EB',
        frame: '#25272A', frameWidth: 3.5, glass: '#7E929F', lamp: '#25272A',
        lawn: '#93AE6E', path: '#D9D6CF', drive: '#CFCBC3', shrub: '#4F6E3F', bloom: '#F4F1EA',
        tree: deciduous('#6A5E52', ['#6E8F4E', '#7C9A58']),
        // A front-facing gable: the triangle is the house's own white board
        // and batten, edged by black rake boards, with a small attic window.
        gableFront: true,
        roof: () => poly([[110, 112], [250, 30], [390, 112]], 'url(#farmhouse-upper)')
            + el('polyline', { points: '98,118 250,24 402,118', fill: 'none', stroke: '#2A2B2D', 'stroke-width': 9, 'stroke-linejoin': 'miter' })
            + rect(238, 66, 24, 26, '#25272A') + rect(241, 69, 18, 20, '#7E929F'),
        garageRoof: () => poly([[384, 217], [450, 178], [516, 217]], '#2A2B2D'),
        windows: [
            [128, 228, 88, 50, { split: true }],
            [302, 236, 72, 28, { split: true }],
            [128, 132, 30, 48, {}], [166, 132, 30, 48, {}],
            [236, 134, 26, 22, {}],
            [304, 132, 30, 48, {}], [342, 132, 30, 48, {}]
        ],
        entry: () => rect(240, 236, 32, 64, '#B98A5E') + rect(246, 242, 20, 16, '#7E929F') + rect(222, 222, 72, 6, '#2A2B2D') + rect(224, 228, 3, 72, '#2A2B2D') + rect(289, 228, 3, 72, '#2A2B2D'),
        garageDoor: () => rect(404, 232, 92, 68, '#B98A5E') + [1, 2, 3].map((i) => line(404, 232 + i * 17, 496, 232 + i * 17, '#9C734D', 1.2)).join('') + rect(404, 232, 92, 12, '#7E929F')
    },
    {
        key: 'california',
        name: 'California modern',
        about: 'Mid-century roots: warm white stucco below, horizontal cedar above, a low shed roof with a dark fascia, big bronze-framed picture windows, a teal front door with a glass sidelight, a garden of grasses and an olive tree.',
        palette: [['Stucco', '#ECE6DA'], ['Cedar', '#A9774F'], ['Fascia', '#3B3E41'], ['Bronze frames', '#4B4038'], ['Front door, teal', '#2E6E73'], ['Grasses', '#B9AF7A']],
        sky: '#EEF2EE', siding: 'plain', body: '#ECE6DA', sidingLine: '#ECE6DA', upperSiding: 'lap', upper: '#A9774F', upperLine: '#93643F',
        trim: '#ECE6DA', band: '#3B3E41',
        frame: '#4B4038', frameWidth: 3, glass: '#7D8F98', lamp: '#4B4038',
        lawn: '#A5B57F', path: '#D6D0C3', drive: '#CCC6BA', shrub: '#B9AF7A', bloom: null,
        tree: olive,
        roof: () => poly([[96, 112], [96, 96], [404, 80], [404, 112]], '#3B3E41') + rect(110, 112, 280, 2, '#3B3E41'),
        garageRoof: () => rect(384, 207, 132, 9, '#3B3E41'),
        windows: [
            [124, 222, 96, 70, { split: true }],
            [300, 230, 78, 30, {}],
            [124, 128, 78, 46, { split: true }],
            [232, 122, 34, 14, {}],
            [298, 128, 78, 46, { split: true }]
        ],
        entry: () => rect(238, 226, 30, 74, '#2E6E73') + rect(270, 226, 10, 74, '#4B4038') + rect(272, 228, 6, 70, '#7D8F98'),
        garageDoor: () => rect(404, 230, 92, 70, '#A9774F') + [...Array(9)].map((_, i) => line(404, 236 + i * 7.5, 496, 236 + i * 7.5, '#8D603D', 1)).join('')
    },
    {
        key: 'coastal',
        name: 'Coastal shingle',
        about: 'New England and the shore: weathered gray cedar shingles, crisp white trim and corner boards, a charcoal roof, white double-hung windows, a navy door under a little white portico. Window boxes, but only under the two downstairs windows, with blue hydrangeas.',
        palette: [['Shingles, weathered gray', '#A39E94'], ['Trim, white', '#F6F4EE'], ['Roof, charcoal', '#4D4D4B'], ['Front door, navy', '#2D3F5A'], ['Hydrangeas', '#7F9CC9']],
        sky: '#E8EFF4', siding: 'shingle', body: '#A39E94', sidingLine: '#8F8A80', trim: '#F6F4EE', cornerBoards: true,
        frame: '#F6F4EE', frameWidth: 5, glass: '#6F8493', lamp: '#2B2D30', sill: '#F6F4EE',
        lawn: '#8FAE6E', path: '#D8D3C8', drive: '#CBC6BC', shrub: '#4E6B40', bloom: '#7F9CC9',
        tree: deciduous('#6A5E52', ['#6A8A4C', '#789854']),
        // A side gable: from the street, a band of roof with two dormers.
        roof: () => poly([[98, 114], [114, 54], [386, 54], [402, 114]], '#4D4D4B') + rect(114, 52, 272, 4, '#3E3E3C')
            + [170, 300].map((x) => poly([[x - 4, 74], [x + 18, 56], [x + 40, 74]], '#4D4D4B') + rect(x, 74, 36, 30, '#A39E94')
                + rect(x + 7, 78, 22, 22, '#F6F4EE') + rect(x + 10, 81, 16, 16, '#6F8493') + line(x + 18, 81, x + 18, 97, '#F6F4EE', 1.4)).join(''),
        garageRoof: () => poly([[384, 217], [450, 182], [516, 217]], '#4D4D4B'),
        windows: [
            [130, 232, 34, 46, { grille: true }], [176, 232, 34, 46, { grille: true }],
            [310, 234, 34, 40, { grille: true }],
            [130, 134, 34, 46, { grille: true }],
            [236, 138, 24, 24, {}],
            [330, 134, 34, 46, { grille: true }]
        ],
        entry: () => rect(240, 238, 30, 62, '#2D3F5A') + poly([[230, 236], [255, 220], [280, 236]], '#F6F4EE') + rect(232, 236, 4, 64, '#F6F4EE') + rect(274, 236, 4, 64, '#F6F4EE')
            // Window boxes under the two living room windows only.
            + [130, 176].map((x) => rect(x - 4, 283, 42, 8, '#F6F4EE') + [0, 1, 2, 3].map((i) => circle(x + 4 + i * 10, 282, 4, i % 2 ? '#F4F1EA' : '#7F9CC9')).join('')).join(''),
        garageDoor: () => rect(404, 234, 44, 66, '#F6F4EE') + rect(452, 234, 44, 66, '#F6F4EE') + [404, 452].map((x) => rect(x + 4, 238, 36, 14, '#6F8493')).join('')
    },
    {
        key: 'nordic',
        name: 'Scandinavian modern',
        about: 'A simple gable with no overhang, the whole house in black-stained vertical boards, deep light oak window surrounds and an oak door, big windows, a birch in the garden. Two colors and the trees.',
        palette: [['Cladding and roof, black stain', '#2C2B29'], ['Window surrounds and door, light oak', '#C9A06F'], ['Glass', '#8FA3AE'], ['Birch', '#EEEAE2']],
        sky: '#EAF0F3', siding: 'vertical', body: '#2C2B29', sidingLine: '#3A3936', trim: '#2C2B29',
        frame: '#C9A06F', frameWidth: 5, glass: '#8FA3AE', lamp: '#C9A06F',
        lawn: '#8FAA66', path: '#CFCAC0', drive: '#C4BFB5', shrub: '#5B7A48', bloom: null,
        tree: birch,
        roof: () => poly([[110, 112], [250, 26], [390, 112]], '#2C2B29') + line(110, 112, 250, 26, '#3A3936', 2) + line(250, 26, 390, 112, '#3A3936', 2),
        garageRoof: () => poly([[390, 217], [450, 182], [510, 217]], '#2C2B29'),
        windows: [
            [126, 224, 92, 64, {}],
            [302, 232, 74, 30, {}],
            [128, 128, 64, 52, {}],
            [234, 130, 22, 30, {}],
            [304, 128, 64, 52, {}]
        ],
        entry: () => rect(238, 230, 34, 70, '#C9A06F') + line(255, 234, 255, 296, '#B08757', 1),
        garageDoor: () => rect(404, 232, 92, 68, '#C9A06F') + [...Array(11)].map((_, i) => line(408 + i * 8, 232, 408 + i * 8, 300, '#B08757', 1)).join('')
    }
];

// ---- The page ------------------------------------------------------------------------

const swatches = (palette) => `<div class="swatches">${palette.map(([name, hex]) => `<div class="swatch"><span style="background:${hex}"></span>${name}<code>${hex}</code></div>`).join('')}</div>`;

const page = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Whitestone house styles</title>
<style>
body { margin: 24px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #22252A; background: #F4F2EE; }
h1 { margin: 0 0 6px; } .lead { margin: 0 0 24px; max-width: 900px; color: #5E5952; line-height: 1.45; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(620px, 1fr)); gap: 24px; }
section { padding: 16px 20px 20px; background: #FFFFFF; border-radius: 12px; }
h2 { margin: 0 0 6px; font-size: 20px; } section p { margin: 0 0 12px; color: #5E5952; font-size: 14px; line-height: 1.45; }
svg { display: block; width: 100%; height: auto; border-radius: 8px; }
.swatches { display: flex; flex-wrap: wrap; gap: 10px 18px; margin-top: 12px; font-size: 13px; }
.swatch { display: flex; align-items: center; gap: 8px; } .swatch span { width: 22px; height: 22px; border-radius: 5px; border: 1px solid rgba(0,0,0,0.12); }
code { color: #8A857D; font-size: 12px; }
</style></head><body>
<h1>The house model, six real styles</h1>
<p class="lead">Generated by scripts/whitestone-house-preview.mjs. The same home in each: two stories and an attached garage, the example home's rooms behind the front wall. Windows follow the rooms: a picture window for the living room, a wide one over the kitchen counter, a pair for each bedroom, a small high one for the bath. Each style uses the three to five colors a real house of that style wears, and the garden brings the rest. The first two are what developers are building around Seattle now. Pick one, or name what to take from each, and the 3D model follows it.</p>
<div class="grid">
${STYLES.map((s) => `<section><h2>${s.name}</h2><p>${s.about}</p>${house(s)}${swatches(s.palette)}</section>`).join('\n')}
</div>
</body></html>
`;

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, page);
console.log(`Wrote ${path.relative(ROOT, OUT)} with ${STYLES.length} styles.`);
