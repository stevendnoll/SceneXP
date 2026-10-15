// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * rooms.js - What furnishes each kind of room on the house model (PRD 8.10,
 * PLANNING 6.3a): a kitchen with its cabinets, counter, sink, range and
 * hood, refrigerator, dishwasher and island; a bathroom by its type, with
 * its tub or shower, toilet and vanity; and every other kind of room, each
 * recognizable at a glance.
 *
 * LAID OUT FOR THE ROOM, NOT STAMPED IN IT. A kit is built for the room's
 * own width and the depth before its task dots (the front of every room is
 * the dots', HOUSE.taskBand), so a long kitchen gets a long counter run and
 * an island, and a small one a short run. Pieces keep real proportions (the
 * model is about one tenth of real size across, its heights a little
 * squat, as model.js's walls are), and a kit too big for its room is
 * shrunk evenly by model.js, which drops it altogether below a point.
 *
 * Pure: plain numbers in, plain pieces out. Each piece is `{ role, x, z, w,
 * d, h, up, color, shape, rot }` in the room's own frame: `x` across from
 * the room's middle, `z` the piece's middle measured from the back wall
 * toward the front, `up` its foot above the floor. `shape` is 'round' for
 * a cylinder (a sink's basin, a stool, a lamp), 'blob' for leaves, else a
 * box. `rot` turns a round piece to face the room (a washer's door), or
 * slopes a box about its middle (a stair's handrail), and
 * `wall` marks what hangs on the back wall (a mirror, a hood). Every
 * color is a key of CONFIG.model.palette, or `accent` and `accent2`, the
 * room's own colors.
 */

/** How far a kit keeps off the room's side walls, model meters. */
export const SIDE = 0.01;

/** The kinds of bath (PRD 8.10): a full bath has a tub, a shower bath a
 *  shower stall. A half bath is the powder room. */
export const BATHS = Object.freeze(['tub', 'shower']);

/** A room kind's kit (model.js uses the kind's own if listed here). */
export const KIT_OF = Object.freeze({
    kitchen: 'kitchen',
    bathroom: 'bath', 'primary-bathroom': 'primaryBath', 'powder-room': 'halfBath',
    'primary-bedroom': 'primaryBed', bedroom: 'bed', nursery: 'nursery',
    living: 'living', family: 'living', bonus: 'media',
    dining: 'dining', patio: 'patio', office: 'office', laundry: 'laundry',
    closet: 'closet', pantry: 'pantry', entry: 'entry', mudroom: 'mudroom', hallway: 'hallway',
    playroom: 'playroom', gym: 'gym', garage: 'garage', stairs: 'stairs', other: 'other'
});

/** A plant in a white pot, as model.js always drew them, on the floor or
 *  on a surface `up` high, its leaves clear of the wall behind it. */
function plant(P, x, z, up = 0) {
    const at = Math.max(z, 0.021);
    P.push({ role: 'pot', x, z: at, w: 0.022, d: 0.022, h: 0.024, up, color: 'pot', shape: 'round' });
    P.push({ role: 'plant', x, z: at, w: 0.042, d: 0.042, h: 0.046, up: up + 0.024, color: 'plant', shape: 'blob' });
}

/** A lamp: a round base, a slim stem, a pale shade. */
function lamp(P, x, z, up, tall = 0.03) {
    P.push({ role: 'lamp', x, z, w: 0.008, d: 0.008, h: tall, up, color: 'charcoal', shape: 'round' });
    P.push({ role: 'shade', x, z, w: 0.018, d: 0.018, h: 0.012, up: up + tall, color: 'lampshade', shape: 'round' });
}

/** A toilet against the back wall at `x`: tank, bowl, seat. */
function toilet(P, x) {
    P.push({ role: 'toilet', x, z: 0.007, w: 0.026, d: 0.012, h: 0.03, up: 0.012, color: 'white' });
    P.push({ role: 'toilet', x, z: 0.026, w: 0.022, d: 0.03, h: 0.022, up: 0, color: 'white', shape: 'round' });
    P.push({ role: 'seat', x, z: 0.027, w: 0.024, d: 0.032, h: 0.002, up: 0.022, color: 'white', shape: 'round' });
}

/** A vanity `w` wide against the back wall: cabinet, stone top, one or
 *  two basins and faucets, and the mirror on the wall above. */
function vanity(P, x, w, basins = 1) {
    P.push({ role: 'vanity', x, z: 0.019, w, d: 0.038, h: 0.03, up: 0, color: 'white' });
    P.push({ role: 'vanity-top', x, z: 0.0205, w: w + 0.004, d: 0.041, h: 0.004, up: 0.03, color: 'counter' });
    for (let i = 0; i < basins; i++) {
        const bx = x + (basins === 1 ? 0 : (i - 0.5) * w * 0.5);
        P.push({ role: 'basin', x: bx, z: 0.022, w: 0.022, d: 0.022, h: 0.002, up: 0.034, color: 'water', shape: 'round' });
        P.push({ role: 'faucet', x: bx, z: 0.006, w: 0.003, d: 0.003, h: 0.012, up: 0.034, color: 'steel' });
    }
    P.push({ role: 'mirror', x, z: 0.0012, w: w * 0.86, d: 0.002, h: 0.034, up: 0.05, color: 'mirror', wall: true });
}

/** A tub `w` wide at `x` against the back wall, with its shower head and a
 *  slim steel rail for its curtain. (Glass cannot be seen through on the
 *  model, so it would read as a wall: a frame reads as glass does.) */
function tub(P, x, w) {
    P.push({ role: 'tub', x, z: 0.028, w, d: 0.055, h: 0.03, up: 0, color: 'white' });
    P.push({ role: 'tub-water', x, z: 0.028, w: w - 0.012, d: 0.043, h: 0.002, up: 0.029, color: 'water' });
    P.push({ role: 'shower-head', x: x + w * 0.25, z: 0.004, w: 0.01, d: 0.008, h: 0.006, up: 0.07, color: 'steel', wall: true });
    P.push({ role: 'rail', x, z: 0.054, w, d: 0.002, h: 0.002, up: 0.075, color: 'steel', wall: true });
}

/** A shower stall `s` square at `x` against the back wall: its tray and
 *  curb, and the steel frame of its glass, the corner post and the top
 *  rails. */
function stall(P, x, s) {
    P.push({ role: 'shower', x, z: s / 2, w: s, d: s, h: 0.004, up: 0, color: 'white' });
    P.push({ role: 'shower', x, z: s - 0.002, w: s, d: 0.004, h: 0.007, up: 0, color: 'white' });
    P.push({ role: 'shower-head', x, z: 0.004, w: 0.01, d: 0.008, h: 0.006, up: 0.07, color: 'steel', wall: true });
    P.push({ role: 'glass', x: x + s / 2 - 0.0015, z: s - 0.0015, w: 0.003, d: 0.003, h: 0.072, up: 0.004, color: 'steel' });
    P.push({ role: 'glass', x, z: s - 0.0015, w: s, d: 0.0025, h: 0.0025, up: 0.074, color: 'steel' });
    P.push({ role: 'glass', x: x + s / 2 - 0.0015, z: s / 2, w: 0.0025, d: s, h: 0.0025, up: 0.074, color: 'steel' });
    P.push({ role: 'handle', x: x - s * 0.2, z: s - 0.002, w: 0.002, d: 0.003, h: 0.018, up: 0.03, color: 'steel' });
}

/** A bath mat in front of `x`. */
function mat(P, x, z) {
    P.push({ role: 'rug', x, z, w: 0.045, d: 0.025, h: 0.002, up: 0, color: 'accent' });
}

/**
 * The kitchen: a run of white cabinets under a stone counter along the back
 * wall, with the sink and a dishwasher beside it, the range with its
 * burners and a hood with its chimney, and the refrigerator at the end; an
 * island with stools where the room is deep and wide enough.
 */
function kitchen(P, W, B) {
    const cd = 0.05;
    const bh = 0.036;
    const top = 0.006;
    let x0 = -W / 2;
    let x1 = W / 2;
    // The refrigerator at the right end of the run.
    if (W >= 0.15) {
        const fw = 0.056;
        const fx = x1 - fw / 2;
        P.push({ role: 'fridge', x: fx, z: 0.029, w: fw, d: 0.058, h: 0.09, up: 0, color: 'steel' });
        P.push({ role: 'fridge-door', x: fx, z: 0.0585, w: 0.002, d: 0.001, h: 0.07, up: 0.012, color: 'appliance' });
        P.push({ role: 'handle', x: fx - 0.005, z: 0.06, w: 0.002, d: 0.003, h: 0.03, up: 0.035, color: 'appliance' });
        P.push({ role: 'handle', x: fx + 0.005, z: 0.06, w: 0.002, d: 0.003, h: 0.03, up: 0.035, color: 'appliance' });
        x1 -= fw + 0.004;
    }
    const run = x1 - x0;
    const rw = 0.05;
    const sw = 0.06;
    let dw = 0.045;
    let rest = run - rw - sw - dw;
    if (rest < 0.03) {
        dw = 0;
        rest = run - rw - sw;
    }
    if (rest < 0) {
        // Too short for a sink and a range apart: a counter with its sink.
        P.push({ role: 'cabinets', x: (x0 + x1) / 2, z: cd / 2, w: run, d: cd, h: bh, up: 0, color: 'white' });
        P.push({ role: 'counter', x: (x0 + x1) / 2, z: cd / 2 + 0.001, w: run, d: cd + 0.002, h: top, up: bh, color: 'counter' });
        P.push({ role: 'sink', x: (x0 + x1) / 2, z: cd * 0.55, w: Math.min(0.04, run * 0.6), d: cd * 0.55, h: 0.002, up: bh + top, color: 'sinkBasin' });
        return;
    }
    // Left to right: a cabinet, the sink, the dishwasher, a cabinet, the
    // range, a short cabinet.
    const segs = [['cab', rest * 0.3], ['sink', sw], ['dishwasher', dw], ['cab', rest * 0.45], ['range', rw], ['cab', rest * 0.25]].filter(([, w]) => w > 0.001);
    let at = x0;
    let counterFrom = x0;
    for (const [kind, w] of segs) {
        const cx = at + w / 2;
        if (kind === 'range') {
            if (cx - w / 2 > counterFrom + 0.001) P.push({ role: 'counter', x: (counterFrom + at) / 2, z: cd / 2 + 0.001, w: at - counterFrom, d: cd + 0.002, h: top, up: bh, color: 'counter' });
            P.push({ role: 'range', x: cx, z: cd / 2, w, d: cd, h: bh + top, up: 0, color: 'steel' });
            P.push({ role: 'cooktop', x: cx, z: cd / 2, w: w - 0.004, d: cd - 0.006, h: 0.002, up: bh + top, color: 'appliance' });
            for (const [ox, oz] of [[-0.012, -0.011], [0.012, -0.011], [-0.012, 0.01], [0.012, 0.01]]) {
                P.push({ role: 'burner', x: cx + ox, z: cd / 2 + oz, w: 0.012, d: 0.012, h: 0.0015, up: bh + top + 0.002, color: 'charcoal', shape: 'round' });
            }
            P.push({ role: 'oven-door', x: cx, z: cd + 0.0008, w: w - 0.01, d: 0.0015, h: 0.018, up: 0.008, color: 'appliance' });
            P.push({ role: 'hood', x: cx, z: 0.02, w: w + 0.004, d: 0.04, h: 0.01, up: 0.082, color: 'steel', wall: true });
            P.push({ role: 'hood', x: cx, z: 0.008, w: 0.016, d: 0.016, h: 0.06, up: 0.092, color: 'steel', wall: true });
            counterFrom = at + w;
        } else {
            P.push({ role: kind === 'cab' ? 'cabinets' : kind, x: cx, z: cd / 2, w, d: cd, h: bh, up: 0, color: 'white' });
            if (kind === 'sink') {
                P.push({ role: 'sink', x: cx, z: cd * 0.55, w: w * 0.62, d: cd * 0.55, h: 0.0025, up: bh + top - 0.0005, color: 'sinkBasin' });
                P.push({ role: 'faucet', x: cx, z: 0.008, w: 0.004, d: 0.004, h: 0.02, up: bh + top, color: 'steel' });
                P.push({ role: 'faucet', x: cx, z: 0.015, w: 0.003, d: 0.012, h: 0.003, up: bh + top + 0.017, color: 'steel' });
            }
            if (kind === 'dishwasher') P.push({ role: 'dishwasher', x: cx, z: cd + 0.0008, w: w - 0.004, d: 0.0015, h: bh - 0.008, up: 0.004, color: 'steel' });
        }
        at += w;
    }
    if (x1 > counterFrom + 0.001) P.push({ role: 'counter', x: (counterFrom + x1) / 2, z: cd / 2 + 0.001, w: x1 - counterFrom, d: cd + 0.002, h: top, up: bh, color: 'counter' });
    // The island, and its stools on the front side.
    if (B >= 0.15 && W >= 0.26) {
        const iw = Math.min(0.17, W * 0.45);
        const iz = cd + 0.032 + 0.02;
        P.push({ role: 'island', x: 0, z: iz, w: iw, d: 0.04, h: bh, up: 0, color: 'accent' });
        P.push({ role: 'island-top', x: 0, z: iz + 0.004, w: iw + 0.008, d: 0.05, h: top, up: bh, color: 'counter' });
        const n = iw >= 0.13 ? 3 : 2;
        for (let i = 0; i < n; i++) {
            const sx = (i - (n - 1) / 2) * (iw / n);
            P.push({ role: 'stool', x: sx, z: iz + 0.037, w: 0.003, d: 0.003, h: 0.026, up: 0, color: 'charcoal', shape: 'round' });
            P.push({ role: 'stool', x: sx, z: iz + 0.037, w: 0.014, d: 0.014, h: 0.003, up: 0.026, color: 'charcoal', shape: 'round' });
        }
    }
}

/** A bathroom by its type: a tub (full bath) or a stall (shower bath), a
 *  vanity between, a toilet at the end, and a mat. */
function bathroom(P, W, kind) {
    const x0 = -W / 2;
    const wet = kind === 'shower' ? Math.min(0.065, W * 0.32) : Math.min(0.11, W * 0.46);
    const wx = x0 + wet / 2;
    if (kind === 'shower') stall(P, wx, wet);
    else tub(P, wx, wet);
    toilet(P, W / 2 - 0.018);
    const space = W - wet - 0.04;
    if (space >= 0.04) vanity(P, x0 + wet + 0.004 + Math.min(0.065, space - 0.006) / 2, Math.min(0.065, space - 0.006));
    mat(P, wx, kind === 'shower' ? wet + 0.016 : 0.07);
}

/** The primary bath: a double vanity where there is room, its tub or
 *  stall, and the toilet. */
function primaryBath(P, W, kind) {
    const x0 = -W / 2;
    const wet = kind === 'shower' ? Math.min(0.075, W * 0.3) : Math.min(0.12, W * 0.4);
    const wx = W / 2 - wet / 2;
    if (kind === 'shower') stall(P, wx, wet);
    else tub(P, wx, wet);
    const space = W - wet - 0.045;
    const vw = Math.min(0.11, space - 0.01);
    if (vw >= 0.04) vanity(P, x0 + vw / 2 + 0.002, vw, vw >= 0.09 ? 2 : 1);
    if (space - vw >= 0.035) toilet(P, x0 + vw + 0.006 + (space - vw) / 2);
    mat(P, wx, kind === 'shower' ? wet + 0.016 : 0.07);
}

/** A half bath: a toilet and a pedestal sink, and a mirror over it. */
function halfBath(P, W) {
    toilet(P, W / 2 - 0.018);
    const sx = -W / 2 + Math.min(0.035, W * 0.25);
    P.push({ role: 'pedestal', x: sx, z: 0.016, w: 0.01, d: 0.01, h: 0.03, up: 0, color: 'white', shape: 'round' });
    P.push({ role: 'basin', x: sx, z: 0.016, w: 0.03, d: 0.026, h: 0.006, up: 0.03, color: 'white', shape: 'round' });
    P.push({ role: 'faucet', x: sx, z: 0.004, w: 0.003, d: 0.003, h: 0.01, up: 0.036, color: 'steel' });
    P.push({ role: 'mirror', x: sx, z: 0.0012, w: 0.026, d: 0.002, h: 0.032, up: 0.05, color: 'mirror', wall: true });
    if (W >= 0.2) plant(P, 0, 0.02);
}

/** A bed against the back wall, its nightstands and lamps, and (in a
 *  primary bedroom) a bench at its foot; a dresser on a side wall where
 *  there is room. */
function bed(P, W, B, primary) {
    const bw = primary ? 0.15 : 0.12;
    const bl = 0.17;
    P.push({ role: 'rug', x: 0, z: 0.11, w: bw + 0.09, d: 0.2, h: 0.002, up: 0, color: 'rug' });
    P.push({ role: 'bed', x: 0, z: 0.008, w: bw + 0.012, d: 0.014, h: 0.06, up: 0, color: 'fabric' });
    P.push({ role: 'bed', x: 0, z: 0.012 + bl / 2, w: bw, d: bl, h: 0.014, up: 0, color: 'oak' });
    P.push({ role: 'mattress', x: 0, z: 0.012 + bl / 2, w: bw - 0.004, d: bl - 0.004, h: 0.014, up: 0.014, color: 'duvet' });
    P.push({ role: 'pillow', x: -bw / 4, z: 0.03, w: bw * 0.4, d: 0.024, h: 0.01, up: 0.028, color: 'duvet' });
    P.push({ role: 'pillow', x: bw / 4, z: 0.03, w: bw * 0.4, d: 0.024, h: 0.01, up: 0.028, color: 'duvet' });
    P.push({ role: 'throw', x: 0, z: 0.012 + bl - 0.022, w: bw, d: 0.036, h: 0.003, up: 0.028, color: 'accent' });
    for (const side of [-1, 1]) {
        const nx = side * (bw / 2 + 0.024);
        P.push({ role: 'nightstand', x: nx, z: 0.016, w: 0.03, d: 0.03, h: 0.03, up: 0, color: 'oak' });
        lamp(P, nx, 0.016, 0.03, 0.018);
    }
    if (primary) P.push({ role: 'bench', x: 0, z: 0.012 + bl + 0.016, w: bw * 0.8, d: 0.022, h: 0.02, up: 0, color: 'accent2' });
    if (W >= bw + 0.06 + 0.1 && B >= 0.1) {
        const dx = W / 2 - 0.016;
        P.push({ role: 'dresser', x: dx, z: 0.09, w: 0.03, d: 0.08, h: 0.04, up: 0, color: 'white' });
        P.push({ role: 'dresser-top', x: dx, z: 0.09, w: 0.031, d: 0.081, h: 0.003, up: 0.04, color: 'oak' });
    }
}

/** A sofa against the back wall facing the room, its coffee table and rug,
 *  an armchair and a floor lamp where there is room, and a plant. */
function living(P, W, B) {
    const sw = Math.min(0.2, W * 0.55);
    P.push({ role: 'rug', x: 0, z: 0.1, w: sw + 0.04, d: 0.13, h: 0.002, up: 0, color: 'rug' });
    P.push({ role: 'sofa', x: 0, z: 0.04, w: sw, d: 0.06, h: 0.022, up: 0, color: 'fabric' });
    P.push({ role: 'sofa', x: 0, z: 0.01, w: sw, d: 0.016, h: 0.045, up: 0, color: 'fabric' });
    for (const side of [-1, 1]) P.push({ role: 'sofa', x: side * (sw / 2 - 0.007), z: 0.04, w: 0.014, d: 0.06, h: 0.032, up: 0, color: 'fabric' });
    P.push({ role: 'cushion', x: -sw * 0.25, z: 0.026, w: 0.035, d: 0.012, h: 0.022, up: 0.022, color: 'accent' });
    P.push({ role: 'cushion', x: sw * 0.25, z: 0.026, w: 0.035, d: 0.012, h: 0.022, up: 0.022, color: 'accent2' });
    P.push({ role: 'coffee-table', x: 0, z: 0.115, w: Math.min(0.08, sw * 0.45), d: 0.04, h: 0.016, up: 0, color: 'oak' });
    if (W >= sw + 0.1) {
        const ax = -(sw / 2 + 0.045);
        P.push({ role: 'armchair', x: ax, z: 0.09, w: 0.045, d: 0.045, h: 0.022, up: 0, color: 'accent2' });
        P.push({ role: 'armchair', x: ax - 0.018, z: 0.09, w: 0.01, d: 0.045, h: 0.04, up: 0, color: 'accent2' });
        lamp(P, sw / 2 + 0.03, 0.02, 0, 0.07);
    }
    if (W >= sw + 0.16) plant(P, W / 2 - 0.022, 0.02);
}

/** A media room: a sofa facing a low console with a screen on the side
 *  wall, so both read from the front. */
function media(P, W, B) {
    living(P, W, B);
    if (W >= 0.24) {
        const cx = W / 2 - 0.014;
        P.push({ role: 'console', x: cx, z: 0.09, w: 0.024, d: 0.08, h: 0.018, up: 0, color: 'oak' });
        P.push({ role: 'tv', x: cx + 0.006, z: 0.09, w: 0.004, d: 0.07, h: 0.04, up: 0.024, color: 'appliance' });
    }
}

/** A dining table with its chairs all round, a sideboard on the back wall,
 *  and a pendant over the table. */
function dining(P, W, B) {
    const tw = Math.min(0.16, W * 0.55);
    const tz = 0.1;
    P.push({ role: 'rug', x: 0, z: tz, w: tw + 0.07, d: 0.14, h: 0.002, up: 0, color: 'rug' });
    P.push({ role: 'table', x: 0, z: tz, w: tw, d: 0.075, h: 0.005, up: 0.032, color: 'oak' });
    for (const side of [-1, 1]) P.push({ role: 'table', x: side * (tw / 2 - 0.02), z: tz, w: 0.006, d: 0.06, h: 0.032, up: 0, color: 'oak' });
    const per = tw >= 0.13 ? 3 : 2;
    for (const side of [-1, 1]) {
        for (let i = 0; i < per; i++) {
            const cx = (i - (per - 1) / 2) * (tw / per);
            const cz = tz + side * 0.053;
            P.push({ role: 'chair', x: cx, z: cz, w: 0.022, d: 0.022, h: 0.02, up: 0, color: 'charcoal' });
            P.push({ role: 'chair', x: cx, z: cz + side * 0.009, w: 0.022, d: 0.004, h: 0.04, up: 0, color: 'charcoal' });
        }
    }
    if (W >= tw + 0.1) {
        for (const side of [-1, 1]) P.push({ role: 'chair', x: side * (tw / 2 + 0.018), z: tz, w: 0.022, d: 0.022, h: 0.02, up: 0, color: 'charcoal' });
    }
    if (W >= 0.2) {
        P.push({ role: 'sideboard', x: 0, z: 0.012, w: Math.min(0.12, W * 0.5), d: 0.024, h: 0.034, up: 0, color: 'white' });
        plant(P, Math.min(0.12, W * 0.5) / 2 - 0.014, 0.012, 0.034);
    }
    P.push({ role: 'pendant', x: 0, z: tz, w: 0.002, d: 0.002, h: 0.05, up: 0.1, color: 'charcoal' });
    P.push({ role: 'pendant', x: 0, z: tz, w: 0.028, d: 0.028, h: 0.012, up: 0.088, color: 'appliance', shape: 'round' });
}

/** A desk on the back wall with its screen and chair, a bookshelf on a side
 *  wall where there is room, a rug and a plant. */
function office(P, W, B) {
    const dw = Math.min(0.12, W * 0.6);
    P.push({ role: 'rug', x: 0, z: 0.07, w: dw + 0.05, d: 0.11, h: 0.002, up: 0, color: 'rug' });
    P.push({ role: 'desk', x: 0, z: 0.025, w: dw, d: 0.046, h: 0.005, up: 0.032, color: 'oak' });
    for (const side of [-1, 1]) P.push({ role: 'desk', x: side * (dw / 2 - 0.006), z: 0.025, w: 0.008, d: 0.044, h: 0.032, up: 0, color: 'white' });
    P.push({ role: 'screen', x: 0, z: 0.01, w: 0.05, d: 0.003, h: 0.03, up: 0.042, color: 'appliance' });
    P.push({ role: 'screen', x: 0, z: 0.012, w: 0.006, d: 0.006, h: 0.006, up: 0.037, color: 'appliance' });
    P.push({ role: 'chair', x: 0, z: 0.065, w: 0.024, d: 0.024, h: 0.004, up: 0.022, color: 'charcoal', shape: 'round' });
    P.push({ role: 'chair', x: 0, z: 0.065, w: 0.004, d: 0.004, h: 0.022, up: 0, color: 'charcoal', shape: 'round' });
    P.push({ role: 'chair', x: 0, z: 0.077, w: 0.022, d: 0.004, h: 0.026, up: 0.026, color: 'charcoal' });
    if (W >= dw + 0.07) {
        const sx = -W / 2 + 0.014;
        P.push({ role: 'bookshelf', x: sx, z: 0.06, w: 0.024, d: 0.1, h: 0.07, up: 0, color: 'white' });
        ['accent', 'oak', 'accent2', 'accent'].forEach((color, i) => {
            P.push({ role: 'books', x: sx + 0.002, z: 0.03 + i * 0.022, w: 0.018, d: 0.018, h: 0.014, up: 0.02 + (i % 2) * 0.025, color });
        });
    }
    if (W >= dw + 0.05) plant(P, dw / 2 + 0.022, 0.016);
}

/** A washer and a dryer side by side, their round doors facing the room, a
 *  shelf over them, and a utility sink where there is room. */
function laundry(P, W) {
    for (const [i, x] of [[0, -0.024], [1, 0.024]]) {
        P.push({ role: i ? 'dryer' : 'washer', x, z: 0.023, w: 0.044, d: 0.046, h: 0.046, up: 0, color: 'white' });
        P.push({ role: 'door', x, z: 0.0465, w: 0.026, d: 0.026, h: 0.002, up: 0.01, color: 'carGlass', shape: 'round', rot: [Math.PI / 2, 0, 0] });
    }
    P.push({ role: 'shelf', x: 0, z: 0.012, w: 0.1, d: 0.024, h: 0.004, up: 0.075, color: 'oak', wall: true });
    P.push({ role: 'basket', x: -0.025, z: 0.012, w: 0.03, d: 0.02, h: 0.014, up: 0.079, color: 'accent', wall: true });
    if (W >= 0.17) {
        const ux = 0.07;
        P.push({ role: 'utility-sink', x: ux, z: 0.022, w: 0.04, d: 0.044, h: 0.036, up: 0, color: 'white' });
        P.push({ role: 'basin', x: ux, z: 0.024, w: 0.03, d: 0.03, h: 0.002, up: 0.036, color: 'sinkBasin' });
        P.push({ role: 'faucet', x: ux, z: 0.006, w: 0.003, d: 0.003, h: 0.014, up: 0.036, color: 'steel' });
    }
}

/** A crib, a changing dresser with its pad, and a rocking chair. */
function nursery(P, W) {
    P.push({ role: 'rug', x: 0, z: 0.08, w: 0.14, d: 0.12, h: 0.002, up: 0, color: 'rug' });
    // An open crib: a low base, its mattress, four corner posts and the
    // rails between them, so it reads as a crib and not a box.
    const cx = -0.02;
    const cz = 0.04;
    P.push({ role: 'crib', x: cx, z: cz, w: 0.09, d: 0.06, h: 0.014, up: 0, color: 'white' });
    P.push({ role: 'crib-mattress', x: cx, z: cz, w: 0.084, d: 0.054, h: 0.005, up: 0.014, color: 'accent' });
    for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) P.push({ role: 'crib', x: cx + sx * 0.043, z: cz + sz * 0.028, w: 0.004, d: 0.004, h: 0.044, up: 0, color: 'white' });
        P.push({ role: 'crib', x: cx + sx * 0.043, z: cz, w: 0.003, d: 0.056, h: 0.003, up: 0.04, color: 'white' });
        P.push({ role: 'crib', x: cx, z: cz + sx * 0.028, w: 0.086, d: 0.003, h: 0.003, up: 0.04, color: 'white' });
    }
    if (W >= 0.18) {
        P.push({ role: 'changer', x: 0.07, z: 0.02, w: 0.05, d: 0.04, h: 0.036, up: 0, color: 'white' });
        P.push({ role: 'changer', x: 0.07, z: 0.02, w: 0.044, d: 0.03, h: 0.006, up: 0.036, color: 'accent2' });
        P.push({ role: 'rocker', x: 0.06, z: 0.09, w: 0.035, d: 0.035, h: 0.02, up: 0, color: 'fabric' });
    }
}

/** A closet's shelves and a rail of clothes, or a pantry's shelves of jars. */
function closet(P, W, pantry) {
    const w = Math.min(0.16, W - 0.01);
    P.push({ role: 'shelves', x: 0, z: 0.012, w, d: 0.022, h: 0.055, up: 0, color: 'white' });
    const n = Math.max(2, Math.floor(w / 0.025));
    for (let i = 0; i < n; i++) {
        const x = -w / 2 + (i + 0.5) * (w / n);
        if (pantry) P.push({ role: 'jar', x, z: 0.012, w: 0.012, d: 0.012, h: 0.012, up: 0.056, color: i % 2 ? 'accent' : 'oak', shape: 'round' });
        else P.push({ role: 'clothes', x, z: 0.03, w: 0.016, d: 0.018, h: 0.04, up: 0.02, color: i % 3 === 0 ? 'accent' : i % 3 === 1 ? 'fabric' : 'accent2' });
    }
}

/** An entry: a console with a mirror, a runner, a plant. A mudroom: a bench
 *  with coats on hooks over it. A hall: a runner and a console. */
function entry(P, W, kind) {
    P.push({ role: 'rug', x: 0, z: 0.07, w: Math.min(0.12, W * 0.6), d: 0.05, h: 0.002, up: 0, color: 'accent' });
    if (kind === 'mudroom') {
        P.push({ role: 'bench', x: 0, z: 0.016, w: 0.1, d: 0.03, h: 0.022, up: 0, color: 'oak' });
        ['accent', 'charcoal', 'accent2'].forEach((color, i) => P.push({ role: 'coat', x: (i - 1) * 0.03, z: 0.006, w: 0.018, d: 0.01, h: 0.035, up: 0.04, color, wall: true }));
        return;
    }
    P.push({ role: 'console', x: 0, z: 0.012, w: 0.08, d: 0.022, h: 0.032, up: 0, color: 'oak' });
    if (kind === 'entry') P.push({ role: 'mirror', x: 0, z: 0.0012, w: 0.05, d: 0.002, h: 0.04, up: 0.045, color: 'mirror', wall: true });
    lamp(P, -0.03, 0.012, 0.032, 0.016);
    if (W >= 0.16) plant(P, W / 2 - 0.022, 0.016);
}

/** A play room's rug, a low shelf of bright bins, a bean bag and a table. */
function playroom(P, W) {
    P.push({ role: 'rug', x: 0, z: 0.09, w: Math.min(0.18, W * 0.7), d: 0.12, h: 0.002, up: 0, color: 'accent' });
    P.push({ role: 'shelf', x: 0, z: 0.012, w: Math.min(0.12, W * 0.55), d: 0.022, h: 0.026, up: 0, color: 'white' });
    ['accent', 'maple2', 'accent2', 'hydrangea'].forEach((color, i) => P.push({ role: 'bin', x: -0.042 + i * 0.028, z: 0.014, w: 0.022, d: 0.018, h: 0.014, up: 0.006, color }));
    P.push({ role: 'beanbag', x: -0.05, z: 0.08, w: 0.045, d: 0.045, h: 0.03, up: 0.015, color: 'accent2', shape: 'blob' });
    if (W >= 0.18) P.push({ role: 'table', x: 0.05, z: 0.085, w: 0.04, d: 0.04, h: 0.018, up: 0, color: 'white', shape: 'round' });
}

/** A gym's rubber floor, a treadmill, a bench and its weights. */
function gym(P, W) {
    P.push({ role: 'mat', x: 0, z: 0.08, w: Math.min(0.18, W * 0.8), d: 0.12, h: 0.003, up: 0, color: 'charcoal' });
    P.push({ role: 'treadmill', x: -0.04, z: 0.05, w: 0.04, d: 0.09, h: 0.01, up: 0, color: 'appliance' });
    P.push({ role: 'treadmill', x: -0.04, z: 0.01, w: 0.04, d: 0.008, h: 0.05, up: 0, color: 'appliance' });
    if (W >= 0.16) {
        P.push({ role: 'bench', x: 0.05, z: 0.07, w: 0.02, d: 0.06, h: 0.016, up: 0, color: 'charcoal' });
        P.push({ role: 'weights', x: 0.05, z: 0.015, w: 0.012, d: 0.012, h: 0.03, up: 0, color: 'steel', shape: 'round' });
    }
}

/** A garage: a car (two in a wide one), and a workbench and shelves on the
 *  back wall. */
function garage(P, W, B) {
    const two = W >= 0.36;
    for (const x of two ? [-W / 4, W / 4] : [0]) {
        P.push({ role: 'car', x, z: 0.13, w: 0.09, d: 0.2, h: 0.03, up: 0.006, color: 'car' });
        P.push({ role: 'car', x, z: 0.135, w: 0.075, d: 0.1, h: 0.025, up: 0.036, color: 'carGlass' });
        for (const [ox, oz] of [[-0.046, 0.07], [0.046, 0.07], [-0.046, 0.19], [0.046, 0.19]]) {
            P.push({ role: 'wheel', x: x + ox, z: oz, w: 0.022, d: 0.022, h: 0.006, up: 0.0, color: 'appliance', shape: 'round', rot: [0, 0, Math.PI / 2] });
        }
    }
    if (W >= 0.2) {
        P.push({ role: 'workbench', x: -W / 2 + 0.05, z: 0.012, w: 0.08, d: 0.022, h: 0.034, up: 0, color: 'oak' });
        P.push({ role: 'shelves', x: W / 2 - 0.04, z: 0.01, w: 0.06, d: 0.018, h: 0.07, up: 0, color: 'concrete' });
    }
}

/** A patio's table and chairs under an umbrella. */
function patio(P) {
    P.push({ role: 'table', x: 0, z: 0.08, w: 0.05, d: 0.05, h: 0.03, up: 0, color: 'white', shape: 'round' });
    for (const [x, z] of [[-0.045, 0.08], [0.045, 0.08], [0, 0.03]]) P.push({ role: 'chair', x, z, w: 0.022, d: 0.022, h: 0.02, up: 0, color: 'charcoal' });
    P.push({ role: 'umbrella', x: 0, z: 0.08, w: 0.003, d: 0.003, h: 0.08, up: 0.03, color: 'charcoal', shape: 'round' });
    P.push({ role: 'umbrella', x: 0, z: 0.08, w: 0.11, d: 0.11, h: 0.006, up: 0.105, color: 'accent', shape: 'round' });
}

/** The stairs' sizes: `steps` steps of `run` deep and `rise` high, `w`
 *  wide, an oak tread `tread` thick with a `nose` over the riser below,
 *  black stringers `side` thick standing `lip` proud of the treads, and a
 *  handrail `rail` over each tread's nose. */
export const STAIR = Object.freeze({ steps: 6, run: 0.02, rise: 0.011, w: 0.07, tread: 0.0025, nose: 0.0015, side: 0.003, lip: 0.004, rail: 0.03 });

/**
 * The stairs, climbing toward the back wall: white risers under oak
 * treads, so every step is its own line, between black stringers that
 * draw the flight's outline against the oak floor and the white wall, and
 * a black handrail on balusters down the open side, like the porch's (QA,
 * 2026-10-15: four oak blocks on an oak floor read as a lump).
 */
function stairs(P) {
    const S = STAIR;
    const n = S.steps;
    const railAt = (z) => S.rail + S.rise * n - ((z - S.run / 2) / S.run) * S.rise;
    for (let i = 0; i < n; i++) {
        const z = (n - 1 - i + 0.5) * S.run;      // step 0 at the front, the last at the wall
        const top = (i + 1) * S.rise;
        P.push({ role: 'stairs', x: 0, z, w: S.w, d: S.run, h: top - S.tread, up: 0, color: 'white' });
        // Short of the riser behind it by a hair, so the two never share a face.
        P.push({ role: 'tread', x: 0, z: z + S.nose / 2 + 0.0003, w: S.w, d: S.run + S.nose - 0.0006, h: S.tread, up: top - S.tread, color: 'oak' });
        for (const sx of [-1, 1]) {
            P.push({ role: 'stringer', x: sx * (S.w + S.side) / 2, z, w: S.side, d: S.run, h: top + S.lip, up: 0, color: 'frame' });
        }
        // A baluster from each tread up to the rail, on the open side.
        P.push({ role: 'baluster', x: (S.w + S.side) / 2, z, w: 0.0018, d: 0.0018, h: railAt(z) - top - S.lip, up: top + S.lip, color: 'frame' });
    }
    // The rail, sloped from over the bottom step to over the top one.
    const z0 = (n - 0.5) * S.run;
    const z1 = 0.5 * S.run;
    const y0 = railAt(z0);
    const y1 = railAt(z1);
    const length = Math.hypot(z0 - z1, y1 - y0);
    const h = 0.0025;
    P.push({
        role: 'rail', x: (S.w + S.side) / 2, z: (z0 + z1) / 2, w: 0.003, d: length, h,
        up: (y0 + y1) / 2 - h / 2, color: 'frame', rot: [Math.atan2(y1 - y0, z0 - z1), 0, 0]
    });
}

/**
 * The kit for a room of kind `area` that is `w` wide and `d` deep (model
 * meters), and for a bathroom its `bath` type. Returns the pieces, or [] for
 * a kind with none. `band` is the share of its depth, from the back wall,
 * the kit may use (model.js HOUSE.fixtureBand): the front is the dots'.
 * `wall` is the back wall's height: what hangs on it (`wall: true`) is left
 * out where it is only a low partition.
 */
export function kitFor(area, w, d, { bath = 'tub', band = 0.45, wall = Infinity } = {}) {
    const kind = KIT_OF[area];
    if (!kind) return [];
    const W = Math.max(0, w - 2 * SIDE);
    const B = Math.max(0, d * band - 0.006);
    const type = BATHS.includes(bath) ? bath : 'tub';
    const P = [];
    switch (kind) {
    case 'kitchen': kitchen(P, W, B); break;
    case 'bath':
        if (bath === 'half') halfBath(P, W);
        else bathroom(P, W, type);
        break;
    case 'primaryBath': primaryBath(P, W, type); break;
    case 'halfBath': halfBath(P, W); break;
    case 'primaryBed': bed(P, W, B, true); break;
    case 'bed': bed(P, W, B, false); break;
    case 'nursery': nursery(P, W); break;
    case 'living': living(P, W, B); break;
    case 'media': media(P, W, B); break;
    case 'dining': dining(P, W, B); break;
    case 'office': office(P, W, B); break;
    case 'laundry': laundry(P, W); break;
    case 'closet': closet(P, W, false); break;
    case 'pantry': closet(P, W, true); break;
    case 'entry': entry(P, W, 'entry'); break;
    case 'mudroom': entry(P, W, 'mudroom'); break;
    case 'hallway': entry(P, W, 'hallway'); break;
    case 'playroom': playroom(P, W); break;
    case 'gym': gym(P, W); break;
    case 'garage': garage(P, W, B); break;
    case 'patio': patio(P); break;
    case 'stairs': stairs(P); break;
    case 'other': plant(P, 0, 0.02); break;
    default: break;
    }
    // A mirror, a hood or a shelf hangs on the back wall, so it goes where
    // that wall is only a low partition.
    return P.filter((p) => !p.wall || p.up + p.h <= wall);
}

/** How far a kit reaches: its half width across the middle and its depth
 *  from the back wall, round pieces turned on their sides included. */
export function kitExtent(pieces) {
    let half = 0;
    let deep = 0;
    for (const p of pieces) {
        half = Math.max(half, Math.abs(p.x) + p.w / 2);
        deep = Math.max(deep, p.z + p.d / 2);
    }
    return { half, deep };
}
