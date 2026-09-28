// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * paint.js - The pictures the office paints on canvases: the monitor's face,
 * the city beyond the glass, and the sticky notes.
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
import { FACADE_TILE } from './city.min.js';
import { wrappedPuffs } from './sky.min.js';

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
    ctx.fillStyle = '#c9d2de';
    ctx.font = `600 ${Math.round(H * 0.075)}px system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillText('Corner Office', W * 0.05, H * 0.07);

    ctx.fillStyle = '#e8eef6';
    lines.forEach((line, i) => {
        ctx.font = `${i === 0 ? 700 : 500} ${Math.round(H * (i === 0 ? 0.11 : 0.075))}px system-ui, sans-serif`;
        ctx.fillText(line, W * 0.07, H * (0.3 + i * 0.15), W * 0.86);
    });
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

/** Paint the pinboard's header: the column names across a white strip in
 *  graphite, the first column on the left. */
export function drawBoardHeader(ctx, W, H, labels) {
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, W, H);
    const w = W / labels.length;
    ctx.fillStyle = '#2b2d31';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    labels.forEach((label, i) => {
        let size = Math.round(H * 0.42);
        ctx.font = `600 ${size}px system-ui, sans-serif`;
        while (size > 8 && ctx.measureText && ctx.measureText(label).width > w * 0.9) {
            size -= 2;
            ctx.font = `600 ${size}px system-ui, sans-serif`;
        }
        ctx.fillText(label, w * (i + 0.5), H / 2);
        if (i) {
            ctx.fillStyle = 'rgba(43, 45, 49, 0.18)';
            ctx.fillRect(w * i - 1, H * 0.25, 2, H * 0.5);
            ctx.fillStyle = '#2b2d31';
        }
    });
    ctx.textAlign = 'left';
}

/**
 * Paint one card into its cell of the board's atlas: a crisp white card with
 * a slim band of its status's color, a small steel pin, the company, the
 * role, and a line saying if it has gone quiet or is a sample.
 */
export function drawCardFace(ctx, x, y, w, h, card) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = card.band || '#6fa8dc';
    ctx.fillRect(x, y, w, h * 0.06);
    // The pin.
    ctx.fillStyle = '#5b6068';
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h * 0.12, h * 0.035, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b2d31';
    ctx.textBaseline = 'top';
    ctx.font = `700 ${Math.round(h * 0.17)}px system-ui, sans-serif`;
    wrap(ctx, card.title, w * 0.88, 2).forEach((line, i) => ctx.fillText(line, x + w * 0.06, y + h * (0.17 + i * 0.18)));
    ctx.font = `500 ${Math.round(h * 0.12)}px system-ui, sans-serif`;
    ctx.fillStyle = '#5a5f66';
    wrap(ctx, card.subtitle || '', w * 0.88, 1).forEach((line) => ctx.fillText(line, x + w * 0.06, y + h * 0.56));
    if (card.note) {
        ctx.font = `700 ${Math.round(h * 0.11)}px system-ui, sans-serif`;
        ctx.fillStyle = '#b5473a';
        ctx.fillText(card.note, x + w * 0.06, y + h * 0.78);
    }
}

/**
 * Paint the glass whiteboard in clean type (QA, 2026-09-29: the marker hand
 * did not suit the room): the funnel, the weeks against the goal line, and
 * the two big numbers, where whiteboard.js LAYOUT says. The pieces
 * come in already measured (funnelBars, weekChart, bigNumbers), so the
 * drawing and the tap targets can never disagree.
 */
export function drawWhiteboard(ctx, W, H, { title, funnel, chart, numbers, goal, layout }) {
    const INK = '#26282c';
    const BLUE = '#3a6fc4';
    const RED = '#c8453b';
    const hand = (size, weight = 600) => `${weight} ${Math.round(size)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.fillStyle = '#f8f9f8';
    ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = INK;
    ctx.font = hand(H * 0.07, 700);
    ctx.fillText(title, W * layout.title.x, H * layout.title.y);

    // The funnel: a label, a bar, its count.
    ctx.font = hand(H * 0.045);
    ctx.fillStyle = INK;
    ctx.fillText('How far they got', W * layout.funnel.x0, H * (layout.funnel.y0 - 0.04));
    for (const bar of funnel) {
        ctx.fillStyle = INK;
        ctx.font = hand(H * 0.04, 500);
        ctx.fillText(bar.label, W * layout.funnel.x0, H * (bar.y + bar.h / 2));
        ctx.fillStyle = BLUE;
        ctx.fillRect(W * bar.x, H * bar.y, W * bar.w, H * bar.h);
        ctx.fillStyle = INK;
        ctx.fillText(String(bar.count), W * (bar.x + bar.w) + W * 0.01, H * (bar.y + bar.h / 2));
    }

    // The weeks, against the goal.
    ctx.font = hand(H * 0.045);
    ctx.fillText('Sent each week', W * layout.weeks.x0, H * (layout.weeks.y0 - 0.06));
    ctx.fillStyle = INK;
    ctx.fillRect(W * chart.x0, H * chart.baseline, W * (chart.x1 - chart.x0), 2);
    for (const bar of chart.bars) {
        ctx.fillStyle = BLUE;
        if (bar.h > 0) ctx.fillRect(W * bar.x, H * bar.y, W * bar.w, H * bar.h);
        ctx.fillStyle = INK;
        ctx.textAlign = 'center';
        ctx.font = hand(H * 0.032, bar.current ? 700 : 400);
        ctx.fillText(bar.current ? 'now' : bar.label.split(' ')[1], W * (bar.x + bar.w / 2), H * (chart.baseline + 0.035));
        if (bar.count) ctx.fillText(String(bar.count), W * (bar.x + bar.w / 2), H * (bar.y - 0.025));
    }
    ctx.textAlign = 'left';
    ctx.strokeStyle = RED;
    ctx.lineWidth = Math.max(2, H * 0.006);
    if (ctx.setLineDash) ctx.setLineDash([W * 0.012, W * 0.008]);
    ctx.beginPath();
    ctx.moveTo(W * chart.x0, H * chart.goalY);
    ctx.lineTo(W * chart.x1, H * chart.goalY);
    ctx.stroke();
    if (ctx.setLineDash) ctx.setLineDash([]);
    // The label sits on the line's right end, ending where the line does:
    // written after it, it ran off the board (QA, 2026-09-25).
    ctx.fillStyle = RED;
    ctx.font = hand(H * 0.036, 700);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`goal ${goal}`, W * chart.x1, H * (chart.goalY - 0.008));
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    // The two big numbers.
    numbers.forEach((n, i) => {
        const x = W * (layout.numbers.x0 + i * ((layout.numbers.x1 - layout.numbers.x0) / 2));
        ctx.fillStyle = INK;
        ctx.font = hand(H * 0.08, 700);
        ctx.fillText(n.value, x, H * (layout.numbers.y0 + 0.05));
        ctx.font = hand(H * 0.035, 500);
        ctx.fillText(n.label, x, H * (layout.numbers.y0 + 0.13));
    });
}

// ---- The city's glass and streets (M6.5 stage 2) -------------------------------

/** A seeded random source, so every visit paints the same facades. */
function paintRandom(seed) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return () => {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

/**
 * The three curtain walls, each a tile of `cols` panels by `rows` floors that
 * repeats up and along every tower (world.js gives the towers their UVs in
 * real meters, so a panel is a panel on every tower). Three maps per style,
 * painted from ONE layout so they always line up:
 *   color  the glass (light, so each tower's own tint shows) with a little
 *          variation from panel to panel, the mullions and the spandrels;
 *   rm     roughness in green and metalness in blue, three's channels: the
 *          glass polished and metallic, the frames and the spandrels matte;
 *   lit    black with the offices whose lights are on, warm or cool; `lit`
 *          (0 to 1) is the share of them, and main.js repaints it as the
 *          night goes on.
 */
export const FACADE = FACADE_TILE;

/** The glass's roughness in the rm map (0 to 255): polished, so it gives a
 *  sharp reflection (Steve, 2026-09-24: "like polished glass"). */
export const GLASS_ROUGHNESS = 6;

export const FACADE_STYLES = ['grid', 'bands', 'fins'];

/** An office's light as the night sees it: mostly warm, some cool, and
 *  never full white, so a lit tower glows rather than glares. */
export function officeLamp(warm, tint) {
    return warm ? `rgb(226, ${Math.round(178 + tint * 26)}, 128)` : `rgb(${Math.round(160 + tint * 20)}, 186, 214)`;
}

function facadeLayout(style) {
    // Fractions of a panel (w) and of a floor (h) for the frame parts.
    if (style === 'bands') return { mullion: 0.02, spandrel: 0.34, fin: 0 };
    if (style === 'fins') return { mullion: 0.1, spandrel: 0.05, fin: 1 };
    return { mullion: 0.04, spandrel: 0.18, fin: 0 };
}

export function drawFacade(ctx, W, H, style, map, seed = 1, lit = 0.38) {
    const random = paintRandom(seed);
    const { cols, rows } = FACADE;
    const pw = W / cols;
    const ph = H / rows;
    const f = facadeLayout(style);
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const x = c * pw;
            const y = r * ph;
            // Panels differ by a few percent, as real glazing does: enough to
            // read as panes, not so much the reflection looks broken up.
            const shade = 0.97 + random() * 0.06;
            // Each office has its place in the order the lights go out, and
            // a lamp of its own, drawn whatever the share lit, so a smaller
            // share is always some of the same offices (the lights go out
            // one by one as the night goes on, daylight.js officesLit).
            const order = random();
            const warm = random() < 0.7;
            const tint = random();
            // The glass.
            if (map === 'color') {
                const g = Math.min(255, Math.round(236 * shade));
                ctx.fillStyle = `rgb(${g}, ${Math.round(g * 1.03)}, ${Math.round(g * 1.08)})`;
            } else if (map === 'rm') {
                ctx.fillStyle = `rgb(0, ${GLASS_ROUGHNESS}, 245)`;
            } else {
                ctx.fillStyle = order < lit ? officeLamp(warm, tint) : 'rgb(0, 0, 0)';
            }
            ctx.fillRect(x, y, pw, ph);
            // The spandrel: the band at the floor line.
            ctx.fillStyle = map === 'color' ? 'rgb(70, 78, 88)' : map === 'rm' ? 'rgb(0, 160, 80)' : 'rgb(0, 0, 0)';
            ctx.fillRect(x, y + ph * (1 - f.spandrel), pw, ph * f.spandrel);
            // The mullions: thin at each panel's edge, or a deep fin.
            const mw = Math.max(1, pw * f.mullion);
            ctx.fillStyle = map === 'color' ? (f.fin ? 'rgb(150, 156, 162)' : 'rgb(52, 58, 66)') : map === 'rm' ? 'rgb(0, 120, 160)' : 'rgb(0, 0, 0)';
            ctx.fillRect(x, y, mw, ph);
        }
    }
}

/**
 * One tile of the cloud deck (sky.js), seen from below: each puff a soft
 * white disc, and then, only where there is cloud, a gray shade at the
 * thick middles, the way a cumulus's base darkens under a bright edge.
 * Transparent everywhere else, so the sky shows through.
 */
export function drawClouds(ctx, W, H, puffs) {
    ctx.clearRect(0, 0, W, H);
    const all = wrappedPuffs(puffs);
    const disc = (x, y, radius, stops) => {
        const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
        for (const [at, color] of stops) g.addColorStop(at, color);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    };
    for (const [u, v, r, a] of all) {
        disc(u * W, v * H, r * W, [[0, `rgba(255, 255, 255, ${a})`], [0.6, `rgba(255, 255, 255, ${a * 0.7})`], [1, 'rgba(255, 255, 255, 0)']]);
    }
    ctx.globalCompositeOperation = 'source-atop';
    for (const [u, v, r, a] of all) {
        disc(u * W, v * H, r * W * 0.8, [[0, `rgba(150, 160, 174, ${a * 0.55})`], [1, 'rgba(150, 160, 174, 0)']]);
    }
    ctx.globalCompositeOperation = 'source-over';
}

/**
 * Rain on a window pane: a scatter of beads, each a pale disc with a
 * darker rim below and a bright point of light above (a drop is a lens,
 * lit from the sky over it), and a few that have run down the glass,
 * leaving a thin wet trail. Transparent between, so the city shows. The tile repeats across the
 * glass (room.js RAIN_TILE), so a bead over an edge is painted on both
 * sides of it.
 */
export function drawRainOnGlass(ctx, W, H, seed = 7) {
    const random = paintRandom(seed);
    ctx.clearRect(0, 0, W, H);
    const bead = (x, y, r) => {
        ctx.fillStyle = 'rgba(214, 224, 234, 0.32)';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(40, 48, 58, 0.28)';
        ctx.beginPath();
        ctx.arc(x, y + r * 0.35, r * 0.7, 0, Math.PI);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.beginPath();
        ctx.arc(x - r * 0.3, y - r * 0.35, Math.max(0.6, r * 0.22), 0, Math.PI * 2);
        ctx.fill();
    };
    // A bead near an edge is painted again across it, so the tiles meet.
    const wrapped = (x, y, r) => {
        for (const dx of [-W, 0, W]) {
            for (const dy of [-H, 0, H]) {
                if (x + dx + r >= 0 && x + dx - r <= W && y + dy + r >= 0 && y + dy - r <= H) bead(x + dx, y + dy, r);
            }
        }
    };
    for (let i = 0; i < 420; i++) wrapped(random() * W, random() * H, 0.8 + random() ** 3 * 4.5);
    // The runs: a trail down the glass, and the drop at its foot.
    ctx.strokeStyle = 'rgba(214, 224, 234, 0.22)';
    for (let i = 0; i < 9; i++) {
        const x = random() * W;
        const y0 = random() * H * 0.5;
        const y1 = Math.min(H - 8, y0 + H * (0.2 + random() * 0.4));
        ctx.lineWidth = 1 + random() * 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y0);
        for (let y = y0; y < y1; y += 8) ctx.lineTo(x + Math.sin(y * 0.09 + i) * 1.6, y);
        ctx.stroke();
        wrapped(x, y1, 3.2 + random() * 2);
    }
}

/**
 * The moon at a phase, with the sun off to the RIGHT of the tile (world.js
 * turns the disc so its right faces the sun). `elongation` is the moon's
 * angle from the sun: 0 new, pi full. The lit part runs from the
 * terminator, an ellipse cos(elongation) of the way across, to the right
 * limb. The dark part keeps a faint earthshine, and a few gray seas mark
 * the lit face (clipped to it).
 */
export function drawMoon(ctx, W, H, elongation) {
    const cx = W / 2;
    const cy = H / 2;
    const r = W * 0.46;
    const k = Math.cos(elongation);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(70, 80, 100, 0.25)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    if (k < 0.995) {
        ctx.fillStyle = 'rgb(236, 234, 222)';
        ctx.beginPath();
        ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, false);
        // Back up the terminator: bulging right (a crescent) or left (gibbous).
        ctx.ellipse(cx, cy, r * Math.abs(k), r, 0, Math.PI / 2, k > 0 ? -Math.PI / 2 : Math.PI * 1.5, k > 0);
        ctx.closePath();
        ctx.fill();
        // The seas, only on the lit part.
        ctx.save();
        ctx.clip();
        ctx.fillStyle = 'rgba(150, 150, 150, 0.35)';
        for (const [x, y, s] of [[-0.25, -0.2, 0.2], [0.15, -0.3, 0.14], [0.05, 0.05, 0.22], [-0.3, 0.25, 0.12], [0.3, 0.2, 0.1]]) {
            ctx.beginPath();
            ctx.arc(cx + x * r, cy + y * r, s * r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
}

/** The glow about the sun: a bright core fading softly to nothing, added
 *  over the sky (world.js colors it). */
export function drawGlow(ctx, W, H) {
    ctx.clearRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2);
    g.addColorStop(0, 'rgba(255, 255, 255, 1)');
    g.addColorStop(0.08, 'rgba(255, 255, 255, 0.55)');
    g.addColorStop(0.3, 'rgba(255, 255, 255, 0.12)');
    g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
}

/** The street lamps' light: warm, but nearer white than orange. */
export const STREET_LAMP = 'rgb(255, 222, 176)';

/** Lamps along each street, a block long: STREET_LAMPS - 1 between the
 *  crossings (about 25 m apart on a 98 m block). */
export const STREET_LAMPS = 4;

/**
 * The streets: one city block with half a street round it, repeated across
 * the land (world.js sets the repeat so the block sits under its towers).
 * `lit` paints the street lights' glow for night instead.
 */
/**
 * One board-formed concrete panel for the ceiling (room.js CONCRETE_PANEL,
 * 1.2 by 2.4 m a tile): a pale warm gray, mottled as poured concrete is,
 * the faint grain of the formwork's boards along it, a darker joint round
 * its edge where the panels met, and its six tie holes, each a dark pit in
 * a paler ring. Seeded: the same ceiling every visit.
 */
export function drawConcrete(ctx, W, H) {
    const random = paintRandom(20260930);
    ctx.fillStyle = 'rgb(202, 200, 195)';
    ctx.fillRect(0, 0, W, H);
    // Mottling: soft patches lighter and darker.
    for (let i = 0; i < 140; i++) {
        const x = random() * W;
        const y = random() * H;
        const r = (0.04 + random() * 0.12) * W;
        const light = random() < 0.5;
        const glow = ctx.createRadialGradient(x, y, 0, x, y, r);
        glow.addColorStop(0, light ? 'rgba(214, 212, 207, 0.22)' : 'rgba(170, 168, 162, 0.16)');
        glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    // The boards' faint grain, along the panel.
    for (let x = 0; x < W; x += W / 8) {
        ctx.fillStyle = `rgba(140, 138, 132, ${0.03 + random() * 0.04})`;
        ctx.fillRect(x, 0, Math.max(1, W * 0.004), H);
    }
    // Fine speckle.
    for (let i = 0; i < W * H * 0.004; i++) {
        ctx.fillStyle = random() < 0.5 ? 'rgba(140, 138, 132, 0.22)' : 'rgba(224, 222, 217, 0.22)';
        ctx.fillRect(random() * W, random() * H, 1, 1);
    }
    // The joint round the panel's edge.
    ctx.fillStyle = 'rgba(128, 126, 121, 0.5)';
    const j = Math.max(1, W * 0.008);
    ctx.fillRect(0, 0, W, j);
    ctx.fillRect(0, 0, j, H);
    // The tie holes: two across, three along.
    for (const u of [0.25, 0.75]) {
        for (const v of [1 / 6, 0.5, 5 / 6]) {
            const x = u * W;
            const y = v * H;
            // About 3 cm across, a real tie hole's size (drawn larger, they
            // read as downlights: QA, 2026-09-29).
            const r = W * 0.012;
            ctx.fillStyle = 'rgba(214, 212, 206, 0.6)';
            ctx.beginPath();
            ctx.arc(x, y, r * 1.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgb(122, 120, 115)';
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

/** The street paint, meters and colors: the double yellow's `gap` between
 *  its two lines, the parking lane's line `from` the middle, and the
 *  crosswalk's stripes (`inset` from the corner, `length` across the
 *  walk, `stripe` wide with a `gap`). */
export const STREET_PAINT = {
    yellow: { gap: 0.3, width: 0.15, color: 'rgb(214, 180, 72)' },
    edge: { from: 6.2, width: 0.15, color: 'rgb(214, 214, 208)' },
    crosswalk: { inset: 1, length: 3.5, stripe: 0.6, gap: 0.6, color: 'rgb(222, 222, 216)' }
};

/**
 * The paint on the streets (QA, 2026-09-29: "street lines and crosswalk
 * lines"), in meters as STREET_PAINT lays it: a double yellow line
 * down each street's middle (the tile's edge, so half of it in this tile
 * and half in the next), a white line where the parking lane begins, and at
 * every corner a zebra crosswalk across each street. (No stop bars: a tile
 * holds one direction's half of each street, and a bar at both ends would
 * put one on the wrong side.) Drawn no thinner than 1.4 px, so from forty
 * floors up the lines hold.
 */
export function drawStreetMarkings(ctx, W, H, { block, street }) {
    const pitch = block + street;
    const px = W / pitch;
    const P = STREET_PAINT;
    const thick = (m) => Math.max(1.4, m * px);
    const half = street / 2;
    // Along one street, which runs along an edge: `across(d)` is the tile
    // coordinate `d` meters in from that edge, `along` the length.
    const edges = [
        // [the edge's coordinate, inward sign, runs along x?]
        [0, 1, true], [H, -1, true], [0, 1, false], [W, -1, false]
    ];
    for (const [edge, inward, alongX] of edges) {
        const at = (d) => edge + inward * d * px;
        const band = (d0, d1, from, to, style) => {
            ctx.fillStyle = style;
            const a = Math.min(at(d0), at(d1));
            const b = Math.max(at(d0), at(d1));
            if (alongX) ctx.fillRect(from, a, to - from, Math.max(thick(0), b - a));
            else ctx.fillRect(a, from, Math.max(thick(0), b - a), to - from);
        };
        const crossing = (half + 0.5) * px;
        const z = P.crosswalk;
        // The lines stop a meter short of the crosswalks.
        const clear = crossing + (z.inset + z.length + 1) * px;
        const from = clear;
        const to = (alongX ? W : H) - clear;
        // The double yellow line: two lines either side of the middle.
        const y = P.yellow;
        band(y.gap / 2, y.gap / 2 + thick(y.width) / px, from, to, y.color);
        // The parking lane's white line.
        const w = P.edge;
        band(w.from, w.from + thick(w.width) / px, from, to, w.color);
        // At each end, the zebra crosswalk.
        const length = (alongX ? W : H);
        for (const end of [0, 1]) {
            const s0 = end ? length - crossing : crossing;
            const dir = end ? -1 : 1;
            // Stripes along the street, laid across it, from the middle to
            // the curb.
            for (let d = z.stripe / 2; d < half - 0.3; d += z.stripe + z.gap) {
                const a = s0 + dir * z.inset * px;
                const b = a + dir * z.length * px;
                band(d, d + z.stripe, Math.min(a, b), Math.max(a, b), z.color);
            }
        }
    }
}

export function drawStreets(ctx, W, H, { block, street }, lit = false) {
    const pitch = block + street;
    const s = (street / 2 / pitch) * W;
    ctx.fillStyle = lit ? 'rgb(0, 0, 0)' : 'rgb(96, 102, 104)';
    ctx.fillRect(0, 0, W, H);
    if (lit) {
        // Every street runs along an edge of the tile (its middle ON the
        // edge, half of it in this tile and half in the next), so whatever
        // is drawn on an edge is drawn on the opposite one too.
        const [r, g, b] = STREET_LAMP.match(/\d+/g).map(Number);
        const lamp = (a) => `rgba(${r}, ${g}, ${b}, ${a})`;
        // A faint warm band down every street: the lamps' light running
        // together on the wet-dark asphalt.
        for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [
            [0, 0, 0, s, 0, 0, W, s], [0, H, 0, H - s, 0, H - s, W, s],
            [0, 0, s, 0, 0, 0, s, H], [W, 0, W - s, 0, W - s, 0, s, H]
        ]) {
            const band = ctx.createLinearGradient(x0, y0, x1, y1);
            band.addColorStop(0, lamp(0.28));
            band.addColorStop(1, lamp(0));
            ctx.fillStyle = band;
            ctx.fillRect(rx, ry, rw, rh);
        }
        // Soft pools under the lamps along each street, and a brighter one
        // where the streets cross (the tile's corners).
        const pool = (x, y, radius, a) => {
            const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
            glow.addColorStop(0, lamp(a));
            glow.addColorStop(1, lamp(0));
            ctx.fillStyle = glow;
            ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        };
        for (let i = 1; i < STREET_LAMPS; i++) {
            const t = (i / STREET_LAMPS) * W;
            for (const [x, y] of [[t, 0], [t, H], [0, t], [W, t]]) pool(x, y, s * 1.1, 0.7);
        }
        for (const [x, y] of [[0, 0], [W, 0], [0, H], [W, H]]) pool(x, y, s * 1.7, 0.95);
        return;
    }
    // Asphalt round the edges, a sidewalk inside it, the block within.
    ctx.fillStyle = 'rgb(46, 49, 53)';
    ctx.fillRect(0, 0, W, s);
    ctx.fillRect(0, H - s, W, s);
    ctx.fillRect(0, 0, s, H);
    ctx.fillRect(W - s, 0, s, H);
    ctx.fillStyle = 'rgb(150, 150, 146)';
    ctx.strokeStyle = 'rgb(150, 150, 146)';
    ctx.lineWidth = Math.max(1, W * 0.012);
    ctx.strokeRect(s, s, W - 2 * s, H - 2 * s);
    drawStreetMarkings(ctx, W, H, { block, street });
    // A few trees along the sidewalks.
    ctx.fillStyle = 'rgb(62, 92, 58)';
    for (let i = 1; i < 6; i++) {
        const t = (i / 6) * (W - 2 * s) + s;
        for (const [x, y] of [[t, s * 1.4], [t, H - s * 1.4], [s * 1.4, t], [W - s * 1.4, t]]) {
            ctx.beginPath();
            ctx.arc(x, y, W * 0.012, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}
