// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * clip.js - the share clip's script and its words (M2, PRD The share).
 *
 * THE SCRIPT, about thirteen seconds of 9:16:
 *   car    the visitor's car at the gate, the camera circling it, its name
 *   heat   its best heat: staged, the gate, the run, and the finish again
 *          slowly (a rival within 0.05 s kept in the frame), its time
 *          stamped on as it crosses
 *   board  the final standings, big bold averages, the visitor's row lit
 *   end    scenexp.com/derby, and "Can you beat it?"
 *
 * A REPLAY, NEVER A RE-RACE. The heat is the recorded run the board scored
 * (sim.runRace with `record`), played back at the clip's own pace, so the
 * time in the clip is the time on the board (PLANNING, The sim to the
 * screen).
 *
 * THE WORDS ARE BURNED IN (PRD, Accessibility: it reads with the sound
 * off). main.js renders the hall into the clip's WebGL canvas, draws that
 * into a 2D canvas, and `drawClipFrame` writes the words over it. The 2D
 * canvas is what is recorded. Canvas text is drawn, never parsed, so a
 * visitor's own car name (M3) is safe here.
 *
 * PURE apart from drawing into the 2D context it is handed.
 */

import { DERBY_CONFIG } from './config.min.js';
import { shotFor, framing } from './director.min.js';
import { clock, placeWord } from './copy.min.js';
import { heatOrder } from './playback.min.js';

/**
 * The clip's timeline for the car at index `focus`: which heat (its best),
 * which lane, when it crosses, and the segments, each { kind, from, to },
 * the run and the slow finish carrying the run time they show.
 */
export function planClip(race, focus, C = DERBY_CONFIG) {
    const K = C.clip;
    const best = race.best[focus];
    const heatIndex = Math.max(0, race.heats.findIndex((heat) => heat[focus] === best));
    const heat = race.heats[heatIndex];
    const lane = heat[focus].lane;
    const crossing = race.runs[focus][lane].time;
    // The closest rival, if close enough to share the slow finish.
    let rival = null;
    for (const r of heat) {
        if (r.car === focus) continue;
        const t = race.runs[r.car][r.lane].time;
        if (Math.abs(t - crossing) <= K.rivalWithin && (rival === null || Math.abs(t - crossing) < Math.abs(rival - crossing))) rival = t;
    }
    const lo = rival === null ? crossing : Math.min(crossing, rival);
    const hi = rival === null ? crossing : Math.max(crossing, rival);
    const order = heatOrder(heat);
    const segments = [];
    let t = 0;
    const add = (kind, seconds, extra = {}) => {
        segments.push({ kind, from: t, to: t + seconds, ...extra });
        t += seconds;
    };
    add('car', K.carSeconds);
    add('staging', K.stagingSeconds);
    add('gate', C.timing.gate);
    add('run', crossing + K.runTail, { runFrom: 0, runTo: crossing + K.runTail });
    const slowFrom = Math.max(0, lo - K.slowLead);
    const slowTo = hi + K.slowTail;
    add('slow', (slowTo - slowFrom) / K.slowRate, { runFrom: slowFrom, runTo: slowTo, rate: K.slowRate });
    add('board', K.boardSeconds);
    add('end', K.endSeconds);
    return {
        focus, heatIndex, lane, crossing, rival,
        time: heat[focus].time,
        place: order.indexOf(heat[focus]) + 1,
        segments, total: t
    };
}

/** What the clip shows at second `t`: the segment, how far through it
 *  (0 to 1), the run time the cars are at, and whether the clip is over. */
export function clipMoment(plan, t) {
    let seg = plan.segments[plan.segments.length - 1];
    for (const s of plan.segments) {
        if (t < s.to) {
            seg = s;
            break;
        }
    }
    const span = seg.to - seg.from;
    const progress = span > 0 ? Math.min(1, Math.max(0, (t - seg.from) / span)) : 1;
    const run = plan.segments.find((s) => s.kind === 'run');
    let runTime = 0;
    if (seg.kind === 'run') runTime = Math.min(seg.runTo, t - seg.from);
    else if (seg.kind === 'slow') runTime = Math.min(seg.runTo, seg.runFrom + (t - seg.from) * seg.rate);
    else if (seg.kind === 'board' || seg.kind === 'end') runTime = run.runTo + 2;
    return { kind: seg.kind, segment: seg, progress, runTime, done: t >= plan.total };
}

/**
 * Where the clip's camera goes. The car shot circles the visitor's car at
 * the gate from the open side of the track (its lane's edge, so no neighbor
 * stands between), the rest are the director's shots at the clip's aspect.
 * `pose` is the focus car's (track.carPose), `carLength` its length.
 */
export function clipFraming(moment, { path, pose, carLength, leadS, aspect }, C = DERBY_CONFIG) {
    const O = C.clip.orbit;
    if (moment.kind === 'car') {
        const half = carLength / 2;
        const center = {
            x: pose.x - half * Math.cos(pose.angle),
            y: pose.y - half * Math.sin(pose.angle) + 0.03,
            z: pose.z
        };
        const side = pose.z < 0 ? -1 : 1;
        const a = O.from + O.sweep * moment.progress;
        return {
            target: center,
            position: { x: center.x + O.radius * Math.cos(a), y: center.y + O.height, z: center.z + side * O.radius * Math.sin(a) }
        };
    }
    const kind = moment.kind === 'slow' ? 'replay' : moment.kind === 'board' || moment.kind === 'end' ? 'times' : moment.kind;
    // The race's own framing, without the live view's pull-back: the cars
    // stay as large in the clip as they were (D54).
    return framing(shotFor(kind, leadS, {}, C), path, leadS, aspect, C, { pullBack: 1 });
}

// ---- The words ----------------------------------------------------------------

const GOLD = '#ffd45c';
const CREAM = '#fff4e6';
const BLUE = '#1f4e8c';
const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

/** The largest size up to `size` at which `text` fits `width`. */
function fitFont(g, text, size, width, weight, family = FONT) {
    let s = size;
    for (; s > 10; s -= 2) {
        g.font = `${weight} ${s}px ${family}`;
        if (g.measureText(text).width <= width) break;
    }
    return s;
}

function say(g, text, x, y, { size, weight = 700, color = CREAM, align = 'center', family = FONT, max = null }) {
    const s = max ? fitFont(g, text, size, max, weight, family) : size;
    g.font = `${weight} ${s}px ${family}`;
    g.fillStyle = color;
    g.textAlign = align;
    g.textBaseline = 'middle';
    g.fillText(text, x, y);
    return s;
}

/** A dark band behind words, fading out toward `toward` ('down' or 'up'). */
function band(g, w, y0, y1, alpha, toward) {
    const grad = g.createLinearGradient(0, toward === 'down' ? y0 : y1, 0, toward === 'down' ? y1 : y0);
    grad.addColorStop(0, `rgba(12, 9, 6, ${alpha})`);
    grad.addColorStop(1, 'rgba(12, 9, 6, 0)');
    g.fillStyle = grad;
    g.fillRect(0, Math.min(y0, y1), w, Math.abs(y1 - y0));
}

/**
 * Write the clip's words over the frame in `g` (w by h). `f` is { kind,
 * progress, carName, eventLabel, heatLabel, crossed, time, place, rows,
 * url } where rows are { place, name, average, mine } fastest first.
 */
export function drawClipFrame(g, w, h, f) {
    const u = w / 720;
    if (f.kind === 'car') {
        band(g, w, 0, 260 * u, 0.7, 'down');
        say(g, 'DERBY DAY', w / 2, 92 * u, { size: 40 * u, weight: 800, color: GOLD });
        band(g, w, h, h - 420 * u, 0.85, 'up');
        say(g, f.carName, w / 2, h - 230 * u, { size: 88 * u, weight: 900, max: w * 0.88 });
        say(g, f.eventLabel, w / 2, h - 140 * u, { size: 36 * u, weight: 600, color: '#f2c496' });
        return;
    }
    if (f.kind === 'board') {
        g.fillStyle = `rgba(20, 15, 10, ${0.55 + 0.3 * Math.min(1, f.progress * 4)})`;
        g.fillRect(0, 0, w, h);
        say(g, f.eventLabel.toUpperCase(), w / 2, 230 * u, { size: 34 * u, weight: 800, color: '#f2c496' });
        say(g, 'Final standings', w / 2, 300 * u, { size: 60 * u, weight: 900 });
        const top = 420 * u;
        const rowH = 190 * u;
        f.rows.forEach((r, i) => {
            const y = top + i * rowH;
            if (r.mine) {
                g.fillStyle = 'rgba(240, 167, 101, 0.28)';
                g.fillRect(40 * u, y - rowH * 0.42, w - 80 * u, rowH * 0.84);
            }
            say(g, placeWord(r.place), 70 * u, y, { size: 46 * u, weight: 900, color: r.place === 1 ? GOLD : CREAM, align: 'left' });
            say(g, r.name, 200 * u, y - 18 * u, { size: 38 * u, weight: 700, align: 'left', max: 280 * u });
            if (r.mine) say(g, 'You', 200 * u, y + 30 * u, { size: 26 * u, weight: 800, color: GOLD, align: 'left' });
            say(g, clock(r.average), w - 70 * u, y, { size: 66 * u, weight: 900, align: 'right', family: MONO });
        });
        say(g, 'Average of four heats, every car in every lane', w / 2, top + 4 * rowH, { size: 26 * u, weight: 500, color: '#bfb2a3', max: w * 0.9 });
        return;
    }
    if (f.kind === 'end') {
        g.fillStyle = BLUE;
        g.globalAlpha = Math.min(1, f.progress * 3);
        g.fillRect(0, 0, w, h);
        say(g, 'Can you beat it?', w / 2, h * 0.42, { size: 84 * u, weight: 900, color: GOLD, max: w * 0.9 });
        say(g, f.url, w / 2, h * 0.53, { size: 44 * u, weight: 700 });
        say(g, 'Derby Day', w / 2, h * 0.6, { size: 30 * u, weight: 600, color: '#c9d6ea' });
        g.globalAlpha = 1;
        return;
    }
    // The heat: which heat and lane, the slow finish named, the time once in.
    band(g, w, 0, 230 * u, 0.75, 'down');
    say(g, f.heatLabel, w / 2, 86 * u, { size: 38 * u, weight: 800 });
    if (f.kind === 'slow') say(g, 'PHOTO FINISH', w / 2, 146 * u, { size: 32 * u, weight: 800, color: GOLD });
    if (f.crossed) {
        band(g, w, h, h - 400 * u, 0.85, 'up');
        say(g, clock(f.time), w / 2, h - 230 * u, { size: 150 * u, weight: 900, color: GOLD, family: MONO });
        say(g, `${placeWord(f.place)} in this heat · ${f.carName}`, w / 2, h - 110 * u, { size: 34 * u, weight: 700, max: w * 0.9 });
    }
}

/**
 * The still picture (M2.4, 1080 by 1350): the scene's frame behind, the car
 * and the board over it. `f` is { carName, eventLabel, rows, url }.
 */
export function drawStill(g, w, h, f) {
    const u = w / 1080;
    band(g, w, 0, 330 * u, 0.8, 'down');
    say(g, 'DERBY DAY', w / 2, 90 * u, { size: 44 * u, weight: 800, color: GOLD });
    say(g, f.carName, w / 2, 190 * u, { size: 96 * u, weight: 900, max: w * 0.9 });
    say(g, f.eventLabel, w / 2, 270 * u, { size: 40 * u, weight: 600, color: '#f2c496' });
    const top = h - 640 * u;
    g.fillStyle = 'rgba(20, 15, 10, 0.86)';
    g.fillRect(0, top - 60 * u, w, h - top + 60 * u);
    const rowH = 118 * u;
    f.rows.forEach((r, i) => {
        const y = top + 40 * u + i * rowH;
        if (r.mine) {
            g.fillStyle = 'rgba(240, 167, 101, 0.28)';
            g.fillRect(50 * u, y - rowH * 0.42, w - 100 * u, rowH * 0.84);
        }
        say(g, placeWord(r.place), 90 * u, y, { size: 52 * u, weight: 900, color: r.place === 1 ? GOLD : CREAM, align: 'left' });
        say(g, r.name, 240 * u, y, { size: 44 * u, weight: 700, align: 'left', max: 430 * u });
        say(g, clock(r.average), w - 90 * u, y, { size: 70 * u, weight: 900, align: 'right', family: MONO });
    });
    say(g, `Can you beat it? ${f.url}`, w / 2, h - 70 * u, { size: 38 * u, weight: 700, color: GOLD, max: w * 0.9 });
}
