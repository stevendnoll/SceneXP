// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * model.js - The house model on the turntable (PLANNING 6.3): the open
 * checklist as a white architectural model of a modern home, drawn from
 * layout.js's numbers.
 *
 * A HOUSE FIRST (QA, 2026-10-13: floating trays with pins in them "did not
 * look much like a model home", and nobody knew what it was until they
 * tapped it). Closed, it is a little house like the ones across the street:
 * white floor plates and walls, dark windows, a front door, garage doors,
 * and a brushed-aluminum gable roof. Inside, each room is its own floor
 * with low walls and a doorway, one small fixture that says what kind of
 * room it is (a bed, a sofa, a table, counters, a tub, a car), and a dot
 * for each task, a little flag over the starred ones.
 *
 * A LEVEL OPENS LIKE A DOLLHOUSE. Lifting a level raises every story above
 * it, roof and all, and its front wall steps aside, so its rooms can be seen
 * and named (main.js puts their names over them).
 * The move is eased, and instant under reduced motion. `levelOffsets` is
 * the arithmetic, pure, and `tick` moves the levels toward it.
 *
 * AN EASTSIDE NEW BUILD (QA, 2026-10-13: Steve chose it from four real
 * styles and two Seattle ones, specs/whitestone/previews/houses.html, after
 * "I don't think I've ever seen a house in real life that has that color
 * palette"). The developer home of Bothell, Sammamish and Woodinville: gray
 * lap siding, a white board-and-batten cross gable over the left wing, a
 * dark asphalt roof, black windows chosen by the rooms behind them (a
 * picture window for a living room, a pair for a bedroom, a small high one
 * for a bath), a black door under a black metal porch roof on cedar posts
 * and stone piers, a stone base, a cedar garage door. Clipped shrubs and
 * white hydrangeas, a Japanese maple in front, Douglas firs behind. Inside,
 * white oak and white, each room with one muted accent. The white stage
 * round it (stage.js) leaves the house all the color. Every color is in
 * CONFIG.model.palette.
 *
 * WHERE THINGS GO IS layout.js's (which room where, which task in which
 * cell), and how tall they are is this file's: `restack` stands each level
 * on the walls of the one below. Everything is plain numbers first
 * (`instancesFor`), so the tests check every wall, window and dot without a
 * renderer, and each kind of part is then ONE instanced mesh, sized for the
 * most a checklist may hold: eighteen draw calls for any home.
 *
 * ON A ROUND LAWN. The model stands on the turntable's top, on a lawn disc
 * inside its stone rim, the house a little back of the middle so the front
 * yard has room (`siteFor`), drawn up to CONFIG.model.scale.max times
 * layout.js's size and small enough to fit the lawn however it is turned
 * (`fitScale`).
 */

import { layoutHome, extentOf, markerGrid, MODEL } from './layout.min.js';
import { smoothstep } from './turntable.min.js';
import { roomName } from './taxonomy.min.js';
import { kitFor, kitExtent } from './rooms.min.js';

/** The home shown when no checklist is open: one empty main floor under
 *  its roof, so the turntable holds a house waiting to be filled. */
export const EMPTY_HOME = Object.freeze({ serviceType: 'cleaning', levels: Object.freeze(['main']), rooms: Object.freeze([]), items: Object.freeze([]) });

/**
 * The house's own sizes, in model meters (layout.js's footprint is about
 * 1.2 by 0.8). Stories are a little squat for their footprint, as a model's
 * often are, so a three-story home still sits below the eye.
 */
export const HOUSE = Object.freeze({
    wall: 0.17,                 // a story's walls, plate to plate
    knee: 0.05,                 // an attic's low walls, under the roof
    garageWall: 0.136,
    wallThickness: 0.012,
    partition: Object.freeze({ height: 0.05, door: 0.07 }),
    window: Object.freeze({ depth: 0.004 }),
    door: Object.freeze({ width: 0.07, height: 0.125 }),
    garageDoor: Object.freeze({ width: 0.72, height: 0.12, glass: 0.018 }),
    roof: Object.freeze({ pitch: 0.45, overhang: 0.035, thickness: 0.012 }),
    /** The white board-and-batten cross gable over the top story's left
     *  wing: its share of the front, and how far back it runs: to the
     *  main ridge and no farther (QA, 2026-10-15: at 0.75 its end showed
     *  through the back slope). It stands `clear` in from the side wall
     *  past its own eave and gutter, so they stay under the main roof
     *  (they showed along the gable end as a bar). */
    cross: Object.freeze({ share: 0.44, maxWidth: 0.52, reach: 0.5, clear: 0.006, batten: 0.022, window: Object.freeze({ w: 0.05, h: 0.04, up: 0.3 }) }),
    lap: Object.freeze({ every: 0.012, line: 0.0016 }),
    stone: Object.freeze({ base: 0.05 }),
    frame: 0.006,               // a window frame's border round its glass
    windowEvery: 0.28,          // a room's wall this long gets its window again
    /** Windows line up in columns, the same columns on every story of a
     *  wall, about this far apart (QA: "window locations ... could be a
     *  little better"). */
    column: 0.2,
    corner: 0.014,              // a corner board's width
    band: 0.012,                // the white band between floors
    sidelight: Object.freeze({ width: 0.018 }),
    rail: Object.freeze({ height: 0.045, size: 0.004 }),
    lamp: Object.freeze({ size: 0.012, height: 0.09, beside: 0.075 }),
    porch: Object.freeze({ width: 0.15, depth: 0.065, thickness: 0.008, above: 0.014, post: 0.011, pier: 0.026 }),
    /** A townhome's garage door, tucked under the main floor: its share of
     *  the front, on the side away from the front door's stoop. */
    tucked: Object.freeze({ share: 0.56, inset: 0.03, clear: 0.025, min: 0.2 }),
    /** A condo (PRD 8.9): one plain story of the building under the unit,
     *  one over it with a capping ledge, and a balcony on the unit's front
     *  with a black railing. */
    condo: Object.freeze({
        podium: 0.21,            // a slab and a story's walls
        above: 0.17,
        cap: Object.freeze({ height: 0.012, over: 0.008 }),
        balcony: Object.freeze({ share: 0.4, depth: 0.08, thickness: 0.012, rail: 0.05, post: 0.004, every: 0.06 })
    }),
    /** The context's sketch: its edges' thickness. */
    context: Object.freeze({ edge: 0.004 }),
    /** A condo's plaza: planters, each a concrete box with clipped shrubs. */
    plaza: Object.freeze({ planter: Object.freeze({ width: 0.16, depth: 0.07, height: 0.04 }), angles: Object.freeze([118, 62, -125, -55]) }),
    step: Object.freeze({ width: 0.11, depth: 0.03, height: 0.01 }),
    trim: Object.freeze({ ridge: 0.014, gutter: 0.01 }),
    site: Object.freeze({
        lawn: 0.006,
        path: Object.freeze({ width: 0.075, height: 0.008 }),
        stoop: Object.freeze({ rise: 0.032, tread: 0.022, landing: 0.045, aheadUpTo: 2 }),
        drive: Object.freeze({ height: 0.007 }),
        bed: Object.freeze({ depth: 0.05, height: 0.01, shrub: 0.022, every: 0.05 }),
        tree: Object.freeze({ trunk: 0.11, trunkWidth: 0.012, radius: 0.06, inset: 0.085, clear: 0.025 }),
        fir: Object.freeze({ height: 0.36, radius: 0.07 }),
        /** The trees stand round the lawn's edge, this far in from it. */
        edge: 0.02,
        /** Where each tree may stand, in degrees round the lawn (0 to the
         *  right, 90 to the front), tried in order: the maple at a front
         *  corner, a fir at each back corner, a shade tree at each side. */
        angles: Object.freeze({
            maple: Object.freeze([128, 52, 145, 35]),
            firs: Object.freeze([Object.freeze([-128, -145, -110]), Object.freeze([-52, -35, -70])]),
            shade: Object.freeze([Object.freeze([180, 165, 195]), Object.freeze([0, 15, -15])])
        }),
        yard: 0.75              // of the room in front and behind the house, the share in front
    }),
    dot: Object.freeze({ height: 0.008, selected: 1.6 }),
    /** The border round a selected or hovered room, just inside its floor. */
    outline: Object.freeze({ width: 0.013, height: 0.006, inset: 0.004 }),
    flag: Object.freeze({ pole: 0.06, poleWidth: 0.004, width: 0.03, height: 0.02, depth: 0.004 }),
    /** Tasks in the front of a room, its fixture against the back. */
    taskBand: 0.5,
    fixtureBand: 0.45
});

/**
 * The windows a room has on each outside wall it touches, by kind of room,
 * as a real house has them: a picture window for a living room, a wide one
 * over a kitchen counter, a pair for a bedroom, a small high one for a
 * bath, a tall narrow one at the stairs. A closet has none. Sizes in the
 * model's meters: width, height, sill (above the floor), and for a pair how
 * many and the gap between them.
 */
export const WINDOW_OF = Object.freeze({
    living: 'picture', family: 'picture', bonus: 'picture', playroom: 'picture', patio: 'picture',
    kitchen: 'wide', dining: 'pair', 'primary-bedroom': 'pair', bedroom: 'pair',
    nursery: 'single', office: 'single', gym: 'single', other: 'single',
    'primary-bathroom': 'small', bathroom: 'small', 'powder-room': 'small', laundry: 'small', mudroom: 'small', pantry: 'small',
    stairs: 'tall', hallway: 'tall', entry: 'tall', garage: 'small'
});
export const WINDOWS = Object.freeze({
    // Every window's head at the same height on a story, as builders set
    // them (QA, 2026-10-13: short windows left bands of blank siding).
    picture: Object.freeze({ w: 0.17, h: 0.118, sill: 0.03, split: true }),
    wide: Object.freeze({ w: 0.14, h: 0.066, sill: 0.082 }),
    pair: Object.freeze({ w: 0.05, h: 0.108, sill: 0.04, count: 2, gap: 0.012 }),
    single: Object.freeze({ w: 0.062, h: 0.108, sill: 0.04 }),
    small: Object.freeze({ w: 0.045, h: 0.048, sill: 0.1 }),
    tall: Object.freeze({ w: 0.038, h: 0.13, sill: 0.018 }),
    basement: Object.freeze({ w: 0.09, h: 0.04, sill: 0.11 })
});

/** Each kind of room's floor: white oak where people live and sleep,
 *  light tile in a kitchen and a bath, concrete where there is a car. */
export const FLOOR_OF = Object.freeze({
    // A white kitchen on white oak, so its cabinets stand out (QA of the
    // first kits, by eye).
    kitchen: 'oak', 'primary-bathroom': 'tileBath', bathroom: 'tileBath', 'powder-room': 'tileBath',
    laundry: 'tile', mudroom: 'tile', pantry: 'tile',
    garage: 'concrete', patio: 'counter'
});

/**
 * A task dot's paint (M5 piece 3): the chosen one darker; while a visit's
 * report is shown (`results`, item id to `done`, `skipped` or
 * `not-reached`), green, amber or gray; else the tasks' blue.
 */
export function markerPaintKey(marker, results) {
    if (marker.selected) return 'markerSelected';
    const status = results ? results.get(marker.itemId) : null;
    if (status === 'done') return 'markerDone';
    if (status === 'skipped') return 'markerSkipped';
    if (status === 'not-reached') return 'markerNotReached';
    return 'marker';
}

/** How many accent colors the palette carries (accent1 to accent6). */
export const ACCENTS = 6;

/**
 * A room's own two colors, from its id, so the same home is always
 * furnished the same: { accent, accent2 } as palette keys, never the same
 * color twice in one room.
 */
export function accentsFor(roomId) {
    let h = 2166136261;
    for (const ch of String(roomId)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    const i = h % ACCENTS;
    return { accent: `accent${i + 1}`, accent2: `accent${((i + 2) % ACCENTS) + 1}` };
}


// ---- The stack (pure) ------------------------------------------------------------

/** A story's wall height: an attic's are low, under the roof, and a
 *  townhome's tucked-under garage is a garage's height. */
export function wallHeight(level) {
    if (level === 'attic') return HOUSE.knee;
    return level === 'garage' ? HOUSE.garageWall : HOUSE.wall;
}

/**
 * Where each level's floor plate tops out, standing each story on the
 * walls of the one below (layout.js gives their order, not their height):
 * { tops: Map level -> y, roof: y where the roof sits }. A garage stands on
 * the ground: a step below the story beside it when that is the ground
 * floor (as layout.js has it), and level with the ground floor over a
 * basement. A detached garage stands on the ground too. A condo's unit
 * stands on a story of its building (HOUSE.condo.podium).
 */
export function restack(layout) {
    const t = MODEL.slabThickness;
    const stories = layout.slabs.filter((s) => s.kind === 'story').sort((a, b) => a.y - b.y);
    const tops = new Map();
    let base = layout.kind === 'condo' ? HOUSE.condo.podium : 0;
    for (const s of stories) {
        tops.set(s.level, base + t);
        base += t + wallHeight(s.level);
    }
    const ground = stories.length ? tops.get(stories[0].level) : t;
    for (const s of layout.slabs) {
        if (s.kind === 'annex') {
            // A garage stands on the ground, a step below the story beside it
            // when that story is the ground floor, and level with the ground
            // floor when the story beside it stands on a basement (QA,
            // 2026-10-13: over a basement it floated beside the main floor).
            const beside = stories.find((st) => Math.abs(st.y - (s.y + MODEL.annex.drop)) < 1e-9);
            tops.set(s.level, !beside || beside === stories[0] ? ground - MODEL.annex.drop : ground);
        } else if (s.kind === 'detached') {
            tops.set(s.level, ground);
        }
    }
    return { tops, roof: stories.length ? base : null };
}

/**
 * How far each part of the house is lifted (meters) when `lifted` is the
 * lifted level: a Map of level key to offset, with the roofs as `roof` (the
 * house's) and `roof:<level>` (a garage's). A lifted story rises by `raise`,
 * and every story above it and the house's roof by `open`, so there is room
 * to see into it. A lifted garage rises by `raise` and its own roof by
 * `open`. Nothing is lifted for an unknown level.
 */
export function levelOffsets(slabs, lifted, lift) {
    const out = new Map(slabs.map((s) => [s.level, 0]));
    out.set('roof', 0);
    for (const s of slabs) if (s.kind !== 'story') out.set(`roof:${s.level}`, 0);
    const chosen = slabs.find((s) => s.level === lifted);
    if (!chosen) return out;
    out.set(chosen.level, lift.raise);
    if (chosen.kind !== 'story') {
        out.set(`roof:${chosen.level}`, lift.open);
        return out;
    }
    for (const s of slabs) {
        if (s.kind === 'story' && s.y > chosen.y) out.set(s.level, lift.open);
    }
    out.set('roof', lift.open);
    return out;
}

/**
 * An open floor, measured for the closer view (turntable.js focusPoints):
 * `{ bottom, top, radius }`, its floor plate's underside and the top of
 * whatever stands highest on it (its walls, or under an attic's low walls a
 * tall fixture), over the turntable's top, and how far its farthest corner
 * reaches from the turntable's middle, in the stage's meters (the model's
 * parts `inst` as instancesFor gives them, times its scale `k`). Null for a
 * level with no parts. Its roof is not its own: that is lifted away.
 */
export function focusOf(inst, level, k) {
    const of = (list) => (list || []).filter((p) => p.level === level);
    const shell = [...of(inst.slabs), ...of(inst.tiles), ...of(inst.walls)];
    if (!shell.length) return null;
    const on = [...shell, ...of(inst.fixtures), ...of(inst.rounds), ...of(inst.blooms), ...of(inst.markers), ...of(inst.flags)];
    let bottom = Infinity;
    let top = -Infinity;
    let radius = 0;
    for (const p of shell) bottom = Math.min(bottom, p.position[1] - p.scale[1] / 2);
    for (const p of on) {
        const [x, , z] = p.position;
        const [w, , d] = p.scale;
        top = Math.max(top, p.top);
        radius = Math.max(radius, Math.hypot(Math.abs(x) + w / 2, Math.abs(z) + d / 2));
    }
    return { bottom: bottom * k, top: top * k, radius: radius * k };
}

/**
 * The shift that centers a layout on the turntable, in model meters, and
 * stands its lowest slab on the turntable's top. The garage sits a step below
 * the floor beside it (layout.js), which beside the lowest story would sink
 * it into the stone, so the whole model rises by that step instead.
 */
export function centerOf(layout) {
    const e = extentOf(layout);
    const lowest = layout.slabs.length ? Math.min(...layout.slabs.map((s) => s.y - s.thickness)) : 0;
    return [-(e.minX + e.maxX) / 2, -lowest, -(e.minZ + e.maxZ) / 2];
}

/** The lawn's radius on the turntable, in the stage's meters: the
 *  turntable's top inside its stone rim. */
export function lawnRadius(turntable) {
    return turntable.radius - turntable.rim;
}

/**
 * How large the model is drawn: up to `scale.max` times layout.js's
 * numbers, and smaller only when the house's half-diagonal would come
 * within `scale.margin` of the lawn's edge, so it fits however far it is
 * turned. Taken over the slabs as they stand unlifted, so a lift never
 * changes it.
 */
export function fitScale(layout, turntable, scale) {
    const e = extentOf(layout);
    const half = Math.hypot((e.maxX - e.minX) / 2, (e.maxZ - e.minZ) / 2);
    return Math.min(scale.max, (lawnRadius(turntable) - scale.margin) / Math.max(half, 1e-6));
}

/**
 * The site the house stands on, in the model's meters at scale `k`: the
 * round lawn (`radius`), and the yard inside it (`halfWidth`, `halfDepth`),
 * the house's own footprint grown by the same margin on every side until
 * its corners reach the lawn's edge, so the trees in its corners and the
 * path to its front all stay on the grass.
 */
export function siteFor(layout, turntable, k) {
    const e = extentOf(layout);
    const a = (e.maxX - e.minX) / 2;
    const b = (e.maxZ - e.minZ) / 2;
    const r = lawnRadius(turntable) / k;
    // (a + g)^2 + (b + g)^2 = r^2, for the margin g.
    const sum = a + b;
    const g = Math.max(0, (-sum + Math.sqrt(Math.max(0, sum * sum - 2 * (a * a + b * b - r * r)))) / 2);
    return { halfWidth: a + g, halfDepth: b + g, radius: r };
}

// ---- Every part in its place (pure) --------------------------------------------------

/** A box record: its middle, its size, its level, and how high it reaches. */
function part(level, x, y, z, w, h, d, extra = {}) {
    return { level, position: [x, y + h / 2, z], scale: [w, h, d], top: y + h, ...extra };
}

/**
 * Where the windows go on one outside wall, by the rooms behind it: one
 * opening per room that touches the wall, its kind by the kind of room
 * (WINDOW_OF), centered on the room's stretch of the wall. A basement's are
 * all small and high. A level with no rooms yet has plain windows evenly
 * spaced, so an empty house still looks lived in. `along` is the wall's
 * axis (0 for x, 2 for z), `a` and `b` its ends, `touches` which room tiles
 * meet it. Returns [{ a, b, kind, roomId }] in the wall's own coordinate.
 */
export function openingsFor(tiles, areas, { a, b, along, basement }) {
    if (!tiles.length) {
        const n = Math.max(1, Math.floor((b - a) / 0.26));
        return Array.from({ length: n }, (_, i) => ({ a: a + ((b - a) * i) / n, b: a + ((b - a) * (i + 1)) / n, kind: basement ? 'basement' : 'single', roomId: null }));
    }
    const g = MODEL.tileGap / 2;
    return tiles.map((t) => {
        const c = along === 0 ? t.x : t.z;
        const half = (along === 0 ? t.width : t.depth) / 2 + g;
        const kind = basement ? 'basement' : WINDOW_OF[areas.get(t.roomId)] || null;
        return { a: Math.max(a, c - half), b: Math.min(b, c + half), kind, roomId: t.roomId };
    }).filter((o) => o.kind).sort((p, q) => p.a - q.a);
}

/** How many window columns a wall of this length has. */
export function columnsFor(len) {
    return Math.max(2, Math.round(len / HOUSE.column));
}

/**
 * The walls, windows and siding round one level. `front` is the +z side,
 * the one facing the camera at first; a lifted level leaves it out (the dollhouse's
 * open side) along with its windows and its door. `openings` gives each
 * side's windows by room (openingsFor); `door` the room the front door is
 * in (its id), or true for the middle of an empty front. Gray lap siding is
 * drawn as fine courses, a basement's stone as coarser ones. Returns
 * { walls, windows, siding, trims, door, garage }, with `door` where the
 * front door is ({ x, z }, z on the wall's outside face, whether or not the
 * wall is showing) or null, and `garage` where a garage door is.
 */
function shell(s, y, h, cx, cz, { open, door, garage, garageAt = null, basement, attic, base = false, band = false, openings = {} }) {
    const t = HOUSE.wallThickness;
    const x0 = s.x + cx - s.width / 2;
    const x1 = s.x + cx + s.width / 2;
    const z0 = s.z + cz - s.depth / 2;
    const z1 = s.z + cz + s.depth / 2;
    const color = 'wall';
    const out = { walls: [], windows: [], siding: [], trims: [], door: null, garage: null };
    const faces = [
        { side: 'front', along: 'x', a: x0, b: x1, at: z1 - t / 2, out: 1, shift: cx },
        { side: 'back', along: 'x', a: x0, b: x1, at: z0 + t / 2, out: -1, shift: cx },
        { side: 'left', along: 'z', a: z0 + t, b: z1 - t, at: x0 + t / 2, out: -1, shift: cz },
        { side: 'right', along: 'z', a: z0 + t, b: z1 - t, at: x1 - t / 2, out: 1, shift: cz }
    ];
    for (const f of faces) {
        const len = f.b - f.a;
        const mid = (f.a + f.b) / 2;
        const outside = (depth, proud) => f.at + f.out * (t / 2 + proud + depth / 2);
        const onFace = (c, py, pw, ph, depth, proud, extra) => (f.along === 'x'
            ? part(s.level, c, y + py, outside(depth, proud), pw, ph, depth, { side: f.side, ...extra })
            : part(s.level, outside(depth, proud), y + py, c, depth, ph, pw, { side: f.side, ...extra }));
        // The wall's columns: every window (and the door) snaps to the
        // nearest one that fits inside its room, and every story of the same
        // footprint has the same columns, so windows stack floor over floor.
        const cols = columnsFor(len);
        const snap = (c, half, a, b) => {
            let best = c;
            let gap = Infinity;
            for (let i = 0; i < cols; i++) {
                const cc = f.a + ((i + 0.5) * len) / cols;
                if (cc - half < a + 0.012 || cc + half > b - 0.012) continue;
                if (Math.abs(cc - c) < gap) {
                    gap = Math.abs(cc - c);
                    best = cc;
                }
            }
            return best;
        };
        // Where the front door goes: in its room, toward the room's left
        // when the room is wide enough for a window beside it too.
        const opens = (openings[f.side] || []).map((o) => ({ ...o, a: o.a + f.shift, b: o.b + f.shift }));
        let doorAt = null;
        let doorRoom = null;
        if (f.side === 'front' && door && !garage) {
            doorRoom = opens.find((o) => o.roomId === door) || null;
            const doorHalf = HOUSE.door.width / 2 + HOUSE.sidelight.width + 0.006;
            if (doorRoom) {
                const wide = doorRoom.b - doorRoom.a >= 0.3;
                doorAt = snap(wide ? doorRoom.a + 0.07 : (doorRoom.a + doorRoom.b) / 2, doorHalf, doorRoom.a, wide ? doorRoom.a + 0.16 : doorRoom.b);
            } else {
                doorAt = snap(mid - len * 0.12, doorHalf, f.a, f.b);
            }
            out.door = { x: doorAt, z: f.at + t / 2 };
        }
        // The door's casing (round the door and its sidelight), and the
        // stretch of wall the door and its lamps keep for themselves.
        const sl = HOUSE.sidelight.width;
        const casing = doorAt === null ? null
            : { c: doorAt + sl / 2, w: HOUSE.door.width + sl + 0.016 };
        const doorKeeps = (c, half) => doorAt !== null
            && c + half > doorAt - HOUSE.lamp.beside - HOUSE.lamp.size && c - half < doorAt + HOUSE.lamp.beside + HOUSE.lamp.size;
        // The garage door: across the middle of a garage's front, or where
        // `garageAt` puts it (a townhome's, beside the stoop).
        const gdoor = garage && f.side === 'front' ? (garageAt ? { c: garageAt.c, w: garageAt.w } : { c: mid, w: len * HOUSE.garageDoor.width }) : null;
        if (gdoor) out.garage = { x: gdoor.c, width: gdoor.w, z: f.at + t / 2, y };
        if (f.side === 'front' && open) continue;
        out.walls.push(f.along === 'x'
            ? part(s.level, mid, y, f.at, len, h, t, { role: 'wall', side: f.side, color })
            : part(s.level, f.at, y, mid, t, h, len, { role: 'wall', side: f.side, color }));
        // The siding's courses, a hair proud of the wall.
        const course = HOUSE.lap;
        for (let cy2 = course.every; cy2 < h - course.line; cy2 += course.every) {
            out.siding.push(onFace(mid, cy2, len, course.line, course.line, 0, { color: 'lapLine', role: 'course' }));
        }
        // A stone base along the front of the lowest story, as along the
        // garage and under the porch posts, laid once the door and windows
        // are placed (`layStone`). It stops at the door's casing and at
        // every window frame that comes down into it, as stone is cut round
        // a frame: run across, it stood a tenth of a millimeter proud of the
        // door and the glass and fought them (QA, 2026-10-14).
        const stoneCuts = casing ? [[casing.c - casing.w / 2, casing.c + casing.w / 2]] : [];
        // A millimeter short of each corner, so its ends never lie in the
        // plane of the siding's.
        const layStone = () => {
            if (!base || f.side !== 'front') return;
            const end = f.b - 0.001;
            let from = f.a + 0.001;
            for (const [cut, cb] of stoneCuts.slice().sort((p2, q) => p2[0] - q[0])) {
                const ca = Math.min(cut, end);
                if (ca - from > 1e-6) out.siding.push(onFace((from + ca) / 2, 0, ca - from, HOUSE.stone.base, 0.006, 0.0005, { color: 'stone', role: 'stoneBase' }));
                from = Math.max(from, cb);
            }
            if (end - from > 1e-6) out.siding.push(onFace((from + end) / 2, 0, end - from, HOUSE.stone.base, 0.006, 0.0005, { color: 'stone', role: 'stoneBase' }));
        };
        // White trim: a corner board at each end of the wall, and a band
        // along the floor line of each story above the lowest.
        for (const end of [f.a + HOUSE.corner / 2, f.b - HOUSE.corner / 2]) {
            out.siding.push(onFace(end, 0, HOUSE.corner, h, 0.004, 0.0008, { color: 'whiteTrim', role: 'corner' }));
        }
        if (band) out.siding.push(onFace(mid, -HOUSE.band / 2, len, HOUSE.band, 0.005, 0.0008, { color: 'whiteTrim', role: 'band' }));
        if (attic) continue;
        // A window: its black frame and its glass, a little proud of the
        // siding; a pair side by side; a picture window split down the middle.
        const pane = (c, w, sill, ph, kind = 'glass', extra = {}) => {
            if (kind === 'glass') out.windows.push(onFace(c, sill - HOUSE.frame, w + 2 * HOUSE.frame, ph + 2 * HOUSE.frame, HOUSE.window.depth * 0.6, 0.0022, { color: 'frame', role: 'frame', ...extra }));
            out.windows.push(onFace(c, sill, w, ph, HOUSE.window.depth, 0.0024, { color: kind, ...extra }));
        };
        if (garage) {
            if (gdoor) {
                const gd = HOUSE.garageDoor;
                // The stone stops at the door, as at the front door.
                stoneCuts.push([gdoor.c - gdoor.w / 2, gdoor.c + gdoor.w / 2]);
                out.windows.push(onFace(gdoor.c, 0, gdoor.w, gd.height, HOUSE.window.depth, 0.0024, { color: 'cedar', role: 'garageDoor' }));
                out.windows.push(onFace(gdoor.c, gd.height - gd.glass - 0.008, gdoor.w * 0.92, gd.glass, HOUSE.window.depth, 0.0034, { color: 'lite' }));
            }
            layStone();
            if (f.side === 'back') {
                // A garage's walls are lower than a story's, so its window
                // sits lower too.
                pane(mid, WINDOWS.small.w, h - WINDOWS.small.h - 0.03, WINDOWS.small.h);
            }
            continue;
        }
        if (doorAt !== null) {
            // A white casing, the black door with its glass, and a glass
            // sidelight beside it.
            out.windows.push(onFace(casing.c, 0, casing.w, HOUSE.door.height + 0.008, HOUSE.window.depth * 0.5, 0.0012, { color: 'whiteTrim', role: 'casing' }));
            out.windows.push(onFace(doorAt, 0, HOUSE.door.width, HOUSE.door.height, HOUSE.window.depth, 0.0024, { color: 'door' }));
            out.windows.push(onFace(doorAt, HOUSE.door.height * 0.55, HOUSE.door.width * 0.5, HOUSE.door.height * 0.3, HOUSE.window.depth, 0.0034, { color: 'lite' }));
            out.windows.push(onFace(doorAt + HOUSE.door.width / 2 + 0.004 + sl / 2, 0.008, sl, HOUSE.door.height - 0.012, HOUSE.window.depth, 0.0024, { color: 'lite', role: 'sidelight' }));
            const l = HOUSE.lamp;
            for (const side of [-1, 1]) {
                out.trims.push(onFace(doorAt + side * l.beside, l.height, l.size, l.size * 1.4, l.size, 0.0024, { color: 'lamp', role: 'lamp' }));
            }
        }
        for (const o of opens) {
            let a = o.a;
            let b = o.b;
            if (o === doorRoom) {
                if (b - a < 0.3) continue;
                a = doorAt + HOUSE.door.width / 2 + HOUSE.lamp.beside;
            }
            const win = WINDOWS[o.kind];
            // The facade decides first: a room takes the columns behind it
            // that its window fits on, as many as a real room of its size
            // has windows (a long living room two or three, a bath one),
            // spread across them, so windows stack floor over floor. A room
            // no column fits takes its window at its middle.
            const count = win.count || 1;
            const total = win.w * count + (win.gap || 0) * (count - 1);
            const k = Math.min(1, (b - a - 0.03) / total);
            if (k * win.w < 0.025) continue;
            const half = (k * total) / 2;
            // Never over the door: a door in no room of its own (an empty
            // floor) had a window drawn on it, glass on black at the same
            // depth (QA, 2026-10-14).
            const fits = [];
            for (let i = 0; i < cols; i++) {
                const cc = f.a + ((i + 0.5) * len) / cols;
                if (cc - half >= a + 0.012 && cc + half <= b - 0.012 && !doorKeeps(cc, half)) fits.push(cc);
            }
            const wanted = ['small', 'tall', 'basement'].includes(o.kind) ? 1 : Math.max(1, Math.round((b - a) / HOUSE.windowEvery));
            let at;
            if (!fits.length) at = doorKeeps((a + b) / 2, half) ? [] : [(a + b) / 2];
            else if (fits.length <= wanted) at = fits;
            else if (wanted === 1) at = [fits.slice().sort((p2, q) => Math.abs(p2 - (a + b) / 2) - Math.abs(q - (a + b) / 2))[0]];
            else at = Array.from({ length: wanted }, (_, j) => fits[Math.round((j * (fits.length - 1)) / (wanted - 1))]);
            for (const c of at) placeWindow(win, c, k, total, { at: c, roomId: o.roomId, onColumn: fits.includes(c) });
        }
        layStone();
        function placeWindow(win, c, k, total, extra) {
            const count = win.count || 1;
            for (let i = 0; i < count; i++) {
                const wc = c - (k * total) / 2 + k * (win.w / 2 + i * (win.w + (win.gap || 0)));
                pane(wc, win.w * k, win.sill, win.h, 'glass', extra);
                const reach = (win.w * k) / 2 + HOUSE.frame;
                if (win.sill - HOUSE.frame < HOUSE.stone.base) stoneCuts.push([wc - reach, wc + reach]);
                if (win.split) out.windows.push(onFace(wc, win.sill, HOUSE.frame * 0.8, win.h, HOUSE.window.depth * 0.6, 0.0042, { color: 'frame', role: 'mullion' }));
            }
        }
    }
    return out;
}

/**
 * A gable roof over a footprint: the gable's mass in the siding's gray and
 * two asphalt slopes, with a ridge cap and gutters. The ridge runs across
 * (along x), or with `alongZ` front to back, for a cross gable whose
 * triangle faces the street. `faceColor` colors the gable's mass.
 */
function gable(level, x, y, z, w, d, { alongZ = false, faceColor = 'wall', role = 'roof' } = {}) {
    const r = HOUSE.roof;
    const span = alongZ ? w : d;       // across the slopes
    const run = alongZ ? d : w;        // along the ridge
    const h = r.pitch * (span / 2);
    const angle = Math.atan2(h, span / 2);
    const slope = Math.hypot(span / 2, h) + r.overhang;
    const plates = [1, -1].map((side) => {
        // The slope's middle, pushed out along its normal by half the plate
        // and down toward its eave by half the overhang.
        const out = side * (span / 4) + side * Math.cos(angle) * (r.overhang / 2) + side * Math.sin(angle) * (r.thickness / 2);
        const midY = y + h / 2 - Math.sin(angle) * (r.overhang / 2) + Math.cos(angle) * (r.thickness / 2);
        return alongZ
            ? { level, role, position: [x + out, midY, z], scale: [slope, r.thickness, run + r.overhang], rotation: [0, 0, -side * angle], top: y + h + r.thickness }
            : { level, role, position: [x, midY, z + out], scale: [run + 2 * r.overhang, r.thickness, slope], rotation: [side * angle, 0, 0], top: y + h + r.thickness };
    });
    const t = HOUSE.trim;
    const trims = [alongZ
        ? part(level, x, y + h + r.thickness * 0.4, z, t.ridge, t.ridge * 0.7, run + r.overhang, { color: 'trim', role: 'ridge' })
        : part(level, x, y + h + r.thickness * 0.4, z, run + 2 * r.overhang, t.ridge * 0.7, t.ridge, { color: 'trim', role: 'ridge' })];
    for (const side of [1, -1]) {
        const eave = side * (span / 2 + Math.cos(angle) * r.overhang);
        const eaveY = y - Math.sin(angle) * r.overhang;
        trims.push(alongZ
            ? part(level, x + eave, eaveY - t.gutter, z, t.gutter, t.gutter, run + r.overhang, { color: 'whiteTrim', role: 'gutter' })
            : part(level, x, eaveY - t.gutter, z + eave, run + 2 * r.overhang, t.gutter, t.gutter, { color: 'whiteTrim', role: 'gutter' }));
    }
    const mass = { level, role, position: [x, y, z], scale: alongZ ? [run, h, w] : [w, h, d], top: y + h, color: faceColor };
    if (alongZ) mass.rotation = [0, Math.PI / 2, 0];
    return { gables: [mass], roofs: plates, trims, height: h };
}

/**
 * The cross gable over the top story's left wing: its triangle faces the
 * street in white board and batten, it runs back into the main roof, and
 * its own slopes meet the main roof's below its ridge. Returns the gable's
 * parts and the battens on its face.
 */
function crossGable(level, top, roofY, cx, cz) {
    const c = HOUSE.cross;
    const r = HOUSE.roof;
    // Its valleys meet the main roof before the main ridge, since it is
    // narrower than the story is deep (the model test holds it so).
    const w = Math.min(c.maxWidth, top.width * c.share);
    // Its outer eave and gutter inside the side wall, under the main roof.
    const inset = r.overhang * Math.cos(Math.atan(r.pitch)) + HOUSE.trim.gutter + c.clear;
    const x = top.x + cx - top.width / 2 + inset + w / 2;
    const d = top.depth * c.reach;
    const zFront = top.z + cz + top.depth / 2;
    const g = gable(level, x, roofY, zFront - d / 2, w, d, { alongZ: true, faceColor: 'gable', role: 'cross' });
    const battens = [];
    const n = Math.floor(w / c.batten);
    for (let i = 1; i < n; i++) {
        const bx = x - w / 2 + (i * w) / n;
        const bh = g.height * (1 - Math.abs(bx - x) / (w / 2));
        if (bh > 0.01) battens.push(part(level, bx, roofY, zFront + 0.0012, 0.0025, bh - 0.004, 0.0024, { color: 'batten', role: 'batten' }));
    }
    // A small window high in the gable, framed in black over the battens.
    const gw = c.window;
    const wy = roofY + g.height * gw.up;
    battens.push(part(level, x, wy - HOUSE.frame, zFront + 0.003, gw.w + 2 * HOUSE.frame, gw.h + 2 * HOUSE.frame, 0.002, { color: 'frame', role: 'gableWindow' }));
    battens.push(part(level, x, wy, zFront + 0.0045, gw.w, gw.h, 0.002, { color: 'glass', role: 'gableWindow' }));
    return { ...g, battens };
}

/**
 * Every part of the house, from a layout, the levels' lifts and the lifted
 * level: `{ slabs, tiles, markers, flags, walls, windows, siding, roofs,
 * gables, fixtures, trims, site, canopies, blooms, firs }`, each a list of
 * `{ level, position, scale, top }` (a roof slope and a cross gable with
 * `rotation` too; tiles with `roomId`; markers and flags with `itemId`).
 * Positions are box middles, except a marker's and a gable's, which are
 * their bases. All in the model's own frame: centered, y up from the
 * turntable's top. `areas` maps a room id to its kind (for its fixture and
 * its windows); `site` the yard's half width and depth (siteFor), and the
 * round lawn's radius when it has one.
 */
export function instancesFor(layout, offsets, { lifted = null, areas = new Map(), site = null, selection = null, baths = new Map() } = {}) {
    const [cx, cy, cz0] = centerOf(layout);
    // On a site, the house stands back a little, so the front yard has room
    // for its path, its drive and its beds (HOUSE.site.yard).
    const extent = extentOf(layout);
    const spare = site ? Math.max(0, site.halfDepth - (extent.maxZ - extent.minZ) / 2) : 0;
    const cz = cz0 - spare * (2 * HOUSE.site.yard - 1);
    const { tops, roof } = restack(layout);
    const lift = (key) => offsets.get(key) || 0;
    const floorOf = (level) => cy + tops.get(level) + lift(level);
    const slabByLevel = new Map(layout.slabs.map((s) => [s.level, s]));
    const stories = layout.slabs.filter((s) => s.kind === 'story');
    // The kind of residence (PRD 8.9): a townhome's garage is a story under
    // its main floor, and a condo has no front door of its own (its
    // building's entrance is not the visitor's home).
    const kind = layout.kind || 'house';
    const tuckedOf = (s) => s.kind === 'story' && s.level === 'garage';
    const living = stories.filter((s) => s.level !== 'attic').sort((a, b) => a.y - b.y);
    const doorLevel = kind === 'condo' ? null
        : (stories.find((s) => s.level === 'main') || living.find((s) => !tuckedOf(s)) || stories[0] || {}).level;
    const lowest = living[0] || stories[0];
    // The side walls a neighbor stands against have no windows.
    const attached = new Set((layout.neighbors || []).map((n) => (n.side < 0 ? 'left' : 'right')));
    const out = {
        slabs: [], tiles: [], markers: [], flags: [], walls: [], windows: [], siding: [], roofs: [], gables: [],
        fixtures: [], trims: [], site: [], canopies: [], blooms: [], firs: [], lawn: [], outlines: [], rounds: [], massing: [],
        contextRoofs: [], edges: []
    };
    let door = null;
    const garages = [];
    const tilesOn = (level) => layout.tiles.filter((t) => t.level === level);

    // The front door's story first, so a townhome's garage below it can
    // take the side away from the stoop.
    const order = layout.slabs.slice().sort((a, b) => Number(b.level === doorLevel) - Number(a.level === doorLevel));
    for (const s of order) {
        const y = floorOf(s.level);
        out.slabs.push(part(s.level, s.x + cx, y - s.thickness, s.z + cz, s.width, s.thickness, s.depth, { color: 'wall' }));
        const isGarage = s.kind !== 'story';
        const tucked = tuckedOf(s);
        const h = isGarage ? HOUSE.garageWall : wallHeight(s.level);
        // Which rooms touch which outside wall, and the windows they want.
        const inner = { x0: s.x - s.width / 2 + MODEL.margin, x1: s.x + s.width / 2 - MODEL.margin, z0: s.z - s.depth / 2 + MODEL.margin, z1: s.z + s.depth / 2 - MODEL.margin };
        const g = MODEL.tileGap / 2;
        const near = (v, w2) => Math.abs(v - w2) < 1e-6;
        const here = tilesOn(s.level);
        const basement = s.level === 'basement';
        const sides = {
            front: { tiles: here.filter((t) => near(t.z + t.depth / 2 + g, inner.z1)), a: s.x - s.width / 2, b: s.x + s.width / 2, along: 0 },
            back: { tiles: here.filter((t) => near(t.z - t.depth / 2 - g, inner.z0)), a: s.x - s.width / 2, b: s.x + s.width / 2, along: 0 },
            left: { tiles: here.filter((t) => near(t.x - t.width / 2 - g, inner.x0)), a: s.z - s.depth / 2, b: s.z + s.depth / 2, along: 2 },
            right: { tiles: here.filter((t) => near(t.x + t.width / 2 + g, inner.x1)), a: s.z - s.depth / 2, b: s.z + s.depth / 2, along: 2 }
        };
        const openings = {};
        for (const [side, v] of Object.entries(sides)) openings[side] = attached.has(side) ? [] : openingsFor(v.tiles, areas, { ...v, basement });
        // The front door is in the entry, else in the front room nearest
        // the left of the middle, else in the middle of an empty front.
        let doorRoom = null;
        if (s.level === doorLevel) {
            const front = openings.front.length ? openings.front : sides.front.tiles.map((t) => ({ roomId: t.roomId, a: t.x - t.width / 2, b: t.x + t.width / 2 }));
            const entry = front.find((o) => areas.get(o.roomId) === 'entry');
            const aim = s.x - s.width * 0.12;
            doorRoom = entry ? entry.roomId : (front.slice().sort((p, q) => Math.abs((p.a + p.b) / 2 - aim) - Math.abs((q.a + q.b) / 2 - aim))[0] || {}).roomId || true;
            // A door in a room with no window kind still needs its opening.
            if (doorRoom !== true && !openings.front.some((o) => o.roomId === doorRoom)) {
                const t = sides.front.tiles.find((x) => x.roomId === doorRoom);
                if (t) openings.front = [...openings.front, { a: t.x - t.width / 2 - g, b: t.x + t.width / 2 + g, kind: 'tall', roomId: doorRoom }].sort((p, q) => p.a - q.a);
            }
        }
        // A tucked garage's door on the side away from the front door, no
        // wider than leaves its stoop clear, so the drive and the stair
        // never meet (measured: at its full share it ran under the stoop).
        let garageAt = null;
        if (tucked) {
            const T = HOUSE.tucked;
            const x0 = s.x + cx - s.width / 2;
            const x1 = s.x + cx + s.width / 2;
            const onLeft = Boolean(door) && door.x > (x0 + x1) / 2;
            const stoop = door ? HOUSE.porch.width / 2 + T.clear : 0;
            const room = door ? (onLeft ? door.x - stoop - (x0 + T.inset) : x1 - T.inset - (door.x + stoop)) : Infinity;
            const w = Math.max(T.min, Math.min(s.width * T.share, room));
            garageAt = { c: onLeft ? x0 + T.inset + w / 2 : x1 - T.inset - w / 2, w };
        }
        const sh = shell(s, y, h, cx, cz, {
            open: s.level === lifted,
            door: s.level === doorLevel ? doorRoom : null,
            garage: isGarage || tucked,
            garageAt,
            basement,
            attic: s.level === 'attic',
            base: kind !== 'condo' && Boolean(lowest) && s.level === lowest.level,
            band: s.kind === 'story' && Boolean(lowest) && s.level !== lowest.level,
            openings
        });
        out.walls.push(...sh.walls);
        out.windows.push(...sh.windows);
        out.siding.push(...sh.siding);
        out.trims.push(...sh.trims);
        // Where the door and the garages meet the site, as the house stands
        // closed (a lift opens the house, not the garden).
        if (sh.door) door = { ...sh.door, y: cy + tops.get(s.level) };
        if (sh.garage) garages.push({ ...sh.garage, y: cy + tops.get(s.level) });
        if (kind === 'condo' && s.level === (lowest || {}).level && s.level !== lifted) balcony(out, s, y, cx, cz);
        if (isGarage) {
            if (s.kind === 'annex') {
                // A short wall joining the garage to the house, so it reads
                // as attached.
                const house = stories.find((st) => Math.abs(st.y - (s.y + MODEL.annex.drop)) < 1e-9) || stories[0];
                if (house) {
                    const gap0 = house.x + house.width / 2;
                    const gap1 = s.x - s.width / 2;
                    out.walls.push(part(s.level, (gap0 + gap1) / 2 + cx, y - s.thickness, s.z + cz, gap1 - gap0, h + s.thickness, s.depth * 0.6, { role: 'link', color: 'wall' }));
                }
            }
            const gr = gable(s.level, s.x + cx, y + h + lift(`roof:${s.level}`), s.z + cz, s.width, s.depth);
            out.gables.push(...gr.gables);
            out.roofs.push(...gr.roofs);
            out.trims.push(...gr.trims);
            // A stone base along the garage's front, as the porch piers have,
            // either side of its door: run across, it stood 0.4 mm behind
            // the door's face and fought it (measured, 2026-10-14).
            if (s.level !== lifted) {
                const fz = s.z + cz + s.depth / 2 + 0.003;
                const a = s.x + cx - s.width / 2;
                const b = s.x + cx + s.width / 2;
                const gd = sh.garage;
                const runs = gd ? [[a, gd.x - gd.width / 2], [gd.x + gd.width / 2, b]] : [[a, b]];
                for (const [r0, r1] of runs) {
                    if (r1 - r0 > 1e-6) out.siding.push(part(s.level, (r0 + r1) / 2, y, fz, r1 - r0, HOUSE.stone.base * 0.6, 0.006, { color: 'stone', role: 'stoneBase', side: 'front' }));
                }
            }
        }
    }
    if (roof !== null && stories.length && kind !== 'condo') {
        const top = stories.slice().sort((a, b) => b.y - a.y)[0];
        const roofY = cy + roof + lift('roof');
        const g = gable(top.level, top.x + cx, roofY, top.z + cz, top.width, top.depth);
        out.gables.push(...g.gables);
        out.roofs.push(...g.roofs);
        out.trims.push(...g.trims);
        const cg = crossGable(top.level, top, roofY, cx, cz);
        out.gables.push(...cg.gables);
        out.roofs.push(...cg.roofs);
        out.trims.push(...cg.trims);
        out.siding.push(...cg.battens);
    }
    if (roof !== null) massing(out, layout, { cx, cy, cz, wallTop: cy + roof, raised: lift('roof'), kind });
    const front = lowest ? { x0: lowest.x + cx - lowest.width / 2, x1: lowest.x + cx + lowest.width / 2, z: lowest.z + cz + lowest.depth / 2, z0: lowest.z + cz - lowest.depth / 2 } : null;
    if (site && kind === 'condo') plaza(out, site, layout, cx, cz);
    else if (site) landscape(out, site, layout, cx, cz, door, garages, front, lifted !== null && lifted === doorLevel, { forward: kind === 'townhome' });

    // The rooms: a floor each, low walls between them with a doorway, a
    // fixture against the back, and the tasks in the front.
    const byRoom = new Map();
    for (const m of layout.markers) {
        if (!byRoom.has(m.roomId)) byRoom.set(m.roomId, []);
        byRoom.get(m.roomId).push(m);
    }
    for (const t of layout.tiles) {
        const s = slabByLevel.get(t.level);
        const y = floorOf(t.level);
        const x = t.x + cx;
        const z = t.z + cz;
        out.tiles.push(part(t.level, x, y, z, t.width, MODEL.tileHeight, t.depth, { roomId: t.roomId, color: FLOOR_OF[areas.get(t.roomId)] || 'oak' }));
        const floorTop = y + MODEL.tileHeight;
        out.walls.push(...partitions(t, s, y, cx, cz).map((p) => ({ ...p, color: 'interior' })));
        // Its fixture carries the room's id (fixtureFor), so a tap on its
        // bed or its sofa is a tap on the room.
        // Against an outside wall, or only a low partition (what hangs on
        // a wall goes where there is one).
        const outer = Math.abs(t.z - t.depth / 2 - MODEL.tileGap / 2 - (s.z - s.depth / 2 + MODEL.margin)) < 1e-6;
        const wall = outer ? (s.kind === 'story' ? wallHeight(t.level) : HOUSE.garageWall) : HOUSE.partition.height;
        const fx = fixtureFor(areas.get(t.roomId), t, floorTop, x, z, baths.get(t.roomId), wall);
        out.fixtures.push(...fx.boxes);
        out.blooms.push(...fx.blobs);
        out.rounds.push(...fx.rounds);
        // The selected room outlined in the accent, a hovered one more
        // faintly: a thin raised border just inside the room's floor.
        if (selection && (selection.roomId === t.roomId || selection.hoverRoomId === t.roomId)) {
            const O = HOUSE.outline;
            const color = selection.roomId === t.roomId ? 'outline' : 'outlineHover';
            const fw = t.width - O.inset * 2;
            const fd = t.depth - O.inset * 2;
            const extra = { roomId: t.roomId, color, role: color };
            out.outlines.push(
                part(t.level, x, floorTop, z - fd / 2 + O.width / 2, fw, O.height, O.width, extra),
                part(t.level, x, floorTop, z + fd / 2 - O.width / 2, fw, O.height, O.width, extra),
                part(t.level, x - fw / 2 + O.width / 2, floorTop, z, O.width, O.height, fd, extra),
                part(t.level, x + fw / 2 - O.width / 2, floorTop, z, O.width, O.height, fd, extra)
            );
        }
        // The tasks, on a grid in the front of the room (layout.js's grid,
        // the same order and the same cells, in the front band).
        const items = (byRoom.get(t.roomId) || []).map((m) => ({ id: m.itemId, important: m.important }));
        const band = { ...t, x, z: z + t.depth * (1 - HOUSE.taskBand) / 2, depth: t.depth * HOUSE.taskBand, y: 0, roomId: t.roomId };
        for (const m of markerGrid(band, items)) {
            // The selected task's dot stands out: larger, and darker.
            const chosen = Boolean(selection && selection.itemId === m.itemId);
            const size = chosen ? m.size * HOUSE.dot.selected : m.size;
            out.markers.push({
                level: t.level, itemId: m.itemId, roomId: t.roomId, important: m.important, selected: chosen,
                position: [m.x, floorTop, m.z], scale: [size, HOUSE.dot.height, size], top: floorTop + HOUSE.dot.height
            });
            if (m.important) {
                const f = HOUSE.flag;
                const px = m.x + m.size * 0.3;
                out.flags.push(part(t.level, px, floorTop, m.z, f.poleWidth, f.pole, f.poleWidth, { itemId: m.itemId, roomId: t.roomId }));
                out.flags.push(part(t.level, px + f.width / 2, floorTop + f.pole - f.height, m.z, f.width, f.height, f.depth, { itemId: m.itemId, roomId: t.roomId }));
            }
        }
    }
    return out;
}

/**
 * The low walls between rooms: along each room's right and front edges
 * that are not the outside wall (every edge between two rooms is one room's
 * right or front edge), each with a doorway in its middle where it is long
 * enough. Their ends reach the outside walls.
 */
function partitions(t, s, y, cx, cz) {
    const g = MODEL.tileGap;
    const p = HOUSE.partition;
    const innerX1 = s.x + s.width / 2 - MODEL.margin;
    const innerZ1 = s.z + s.depth / 2 - MODEL.margin;
    const innerX0 = s.x - s.width / 2 + MODEL.margin;
    const innerZ0 = s.z - s.depth / 2 + MODEL.margin;
    const reach = MODEL.margin - HOUSE.wallThickness;
    const out = [];
    const run = (a, b, place) => {
        const len = b - a;
        if (len <= 0) return;
        if (len > p.door * 2.2) {
            const mid = (a + b) / 2;
            place(a, mid - p.door / 2);
            place(mid + p.door / 2, b);
        } else {
            place(a, b);
        }
    };
    const xEdge = t.x + t.width / 2 + g / 2;
    if (xEdge < innerX1 - 1e-6) {
        let a = t.z - t.depth / 2 - g / 2;
        let b = t.z + t.depth / 2 + g / 2;
        if (a <= innerZ0 + 1e-6) a -= reach;
        if (b >= innerZ1 - 1e-6) b += reach;
        run(a, b, (u, v) => out.push(part(t.level, xEdge + cx, y, (u + v) / 2 + cz, g, p.height, v - u, { role: 'partition' })));
    }
    const zEdge = t.z + t.depth / 2 + g / 2;
    if (zEdge < innerZ1 - 1e-6) {
        let a = t.x - t.width / 2 - g / 2;
        let b = t.x + t.width / 2 + g / 2;
        if (a <= innerX0 + 1e-6) a -= reach;
        if (b >= innerX1 - 1e-6) b += reach;
        run(a, b, (u, v) => out.push(part(t.level, (u + v) / 2 + cx, y, zEdge + cz, v - u, p.height, g, { role: 'partition' })));
    }
    return out;
}

/** A room's fixture against its back wall, scaled down to fit a small
 *  room, or none when the room is too small to show one: { boxes, blobs },
 *  the leaves of its plants as blobs, its colors resolved to the room's own. */
function fixtureFor(area, t, floorTop, x, z, bath = 'tub', wall = Infinity) {
    const none = { boxes: [], blobs: [], rounds: [] };
    const pieces = kitFor(area, t.width, t.depth, { bath, band: HOUSE.fixtureBand, wall });
    if (!pieces.length) return none;
    const { half, deep } = kitExtent(pieces);
    const gap = 0.006;   // off the back wall
    // Shrunk evenly to fit, and left out below a point.
    const k = Math.min(1, (t.width / 2 - 0.004) / half, (t.depth * HOUSE.fixtureBand - gap) / deep);
    if (k < 0.4) return none;
    const back = z - t.depth / 2 + gap;
    const own = accentsFor(t.roomId);
    const out = { boxes: [], blobs: [], rounds: [] };
    for (const p of pieces) {
        const extra = { roomId: t.roomId, color: own[p.color] || p.color, role: p.role };
        if (p.rot) extra.rotation = p.rot;
        const r = part(t.level, x + p.x * k, floorTop + p.up * k, back + p.z * k, p.w * k, p.h * k, p.d * k, extra);
        if (p.rot && p.shape === 'round') {
            // Turned on its side: its height is its diameter, not its depth.
            const tall = (p.rot[0] ? p.d : p.w) * k;
            r.position[1] = floorTop + p.up * k + tall / 2;
            r.top = floorTop + p.up * k + tall;
        }
        if (p.shape === 'blob') out.blobs.push(r);
        else if (p.shape === 'round') out.rounds.push(r);
        else out.boxes.push(r);
    }
    return out;
}

/**
 * How a home assembles itself (the example, M2 step 2): each level, lifted
 * apart, settling into place in turn, bottom first, then the garages, each
 * with its own roof, and the house's roof last. `[{ key, from, delay }]`:
 * the offset key (a level, `roof:<garage>`, or `roof`), how high above its
 * place it starts, and when it starts to settle. A later key always starts
 * higher and settles later, so no level passes through the one above it.
 */
export function assemblyPlan(slabs, { rise, step, stagger }) {
    const stories = slabs.filter((s) => s.kind === 'story').sort((a, b) => a.y - b.y).map((s) => s.level);
    const garages = slabs.filter((s) => s.kind !== 'story').flatMap((s) => [s.level, `roof:${s.level}`]);
    return [...stories, ...garages, 'roof'].map((key, i) => ({ key, from: rise + i * step, delay: i * stagger }));
}

/** A box's twelve edges as thin beams, `e` thick, for the sketch. */
function boxEdges(b, e) {
    const [x, y, z] = b.position;
    const [w, h, d] = b.scale;
    const out = [];
    const beam = (px, py, pz, sx, sy, sz) => out.push({ level: null, role: 'edge', color: 'contextEdge', position: [px, py, pz], scale: [sx, sy, sz], top: py + sy / 2 });
    for (const sy of [-1, 1]) for (const sz of [-1, 1]) beam(x, y + (sy * h) / 2, z + (sz * d) / 2, w + e, e, e);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) beam(x + (sx * w) / 2, y, z + (sz * d) / 2, e, h + e, e);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) beam(x + (sx * w) / 2, y + (sy * h) / 2, z, e, e, d + e);
    return out;
}

/** A gable's ridge and its four sloped edges (its eaves are its box's). */
function gableEdges(g, e) {
    const [x, y, z] = g.position;
    const [w, h, d] = g.scale;
    const out = [{ level: null, role: 'edge', color: 'contextEdge', position: [x, y + h, z], scale: [w + e, e, e], top: y + h + e / 2 }];
    const len = Math.hypot(d / 2, h);
    const angle = Math.atan2(h, d / 2);
    for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
            out.push({ level: null, role: 'edge', color: 'contextEdge', position: [x + (sx * w) / 2, y + h / 2, z + (sz * d) / 4], scale: [e, e, len], rotation: [sz * angle, 0, 0], top: y + h });
        }
    }
    return out;
}

/**
 * The context round a townhome or a condo (PRD 8.9), drawn as a sketch:
 * slate edges over a faint see-through fill, so it can never be taken for
 * part of the visitor's home, the only solid, colored thing on the
 * turntable (Steve's choice, 2026-10-14, of three tried in the preview: a
 * white massing blended into the white studio, and beside a townhome read
 * as more house). Never tappable (no level). A townhome's neighbors to the
 * eaves under gables of the home's pitch; a condo's units beside it, the
 * story of the building under it, and the story over it with its capping
 * ledge, which rises with the roof when a floor opens. `out.massing` holds
 * the fills, `out.contextRoofs` the gables' fills, `out.edges` the lines.
 */
function massing(out, layout, { cx, cy, cz, wallTop, raised, kind }) {
    const ns = layout.neighbors || [];
    if (!ns.length) return;
    const e = HOUSE.context.edge;
    const fill = (p) => {
        out.massing.push(p);
        out.edges.push(...boxEdges(p, e));
    };
    const ground = cy + (kind === 'condo' ? HOUSE.condo.podium : 0);
    for (const n of ns) {
        fill(part(null, n.x + cx, ground, n.z + cz, n.width, wallTop - ground, n.depth, { color: 'massing', role: 'neighbor' }));
        if (kind === 'townhome') {
            const h = HOUSE.roof.pitch * (n.depth / 2);
            const roofPart = { level: null, role: 'neighborRoof', color: 'massing', position: [n.x + cx, wallTop, n.z + cz], scale: [n.width, h, n.depth], top: wallTop + h };
            out.contextRoofs.push(roofPart);
            out.edges.push(...gableEdges(roofPart, e));
        }
    }
    if (kind !== 'condo') return;
    const all = [...layout.slabs, ...ns];
    const x0 = Math.min(...all.map((s) => s.x - s.width / 2));
    const x1 = Math.max(...all.map((s) => s.x + s.width / 2));
    const unit = layout.slabs[0];
    const x = (x0 + x1) / 2 + cx;
    const z = unit.z + cz;
    const C = HOUSE.condo;
    fill(part(null, x, cy, z, x1 - x0, C.podium, unit.depth, { color: 'massing', role: 'podium' }));
    const up = wallTop + raised;
    fill(part(null, x, up, z, x1 - x0, C.above, unit.depth, { color: 'massing', role: 'above' }));
    fill(part(null, x, up + C.above, z, x1 - x0 + 2 * C.cap.over, C.cap.height, unit.depth + 2 * C.cap.over, { color: 'massing', role: 'cap' }));
}

/**
 * A condo's balcony on the front of its lowest story: a white slab level
 * with the floor, and a black railing round its open sides, posts along the
 * front. It is the story's, so it lifts with it (and steps aside while that
 * story is open, as the porch does).
 */
function balcony(out, s, y, cx, cz) {
    const B = HOUSE.condo.balcony;
    const w = s.width * B.share;
    const x = s.x + cx + s.width * 0.18;
    const zf = s.z + cz + s.depth / 2;
    const p = B.post;
    out.walls.push(part(s.level, x, y - B.thickness, zf + B.depth / 2, w, B.thickness, B.depth, { color: 'plate', role: 'balcony' }));
    const top = y + B.rail - p;
    const front = zf + B.depth - p / 2 - 0.001;
    out.trims.push(part(s.level, x, top, front, w - 0.002, p, p, { color: 'frame', role: 'balconyRail' }));
    for (const side of [-1, 1]) {
        // From a little off the wall, clear of the siding's courses.
        out.trims.push(part(s.level, x + side * (w / 2 - p / 2 - 0.001), top, zf + 0.004 + (B.depth - 0.005) / 2, p, p, B.depth - 0.005, { color: 'frame', role: 'balconyRail' }));
    }
    const n = Math.max(2, Math.round(w / B.every));
    for (let i = 0; i <= n; i++) {
        const px = x - w / 2 + p / 2 + 0.001 + (i * (w - p - 0.002)) / n;
        out.trims.push(part(s.level, px, y, front, p, B.rail - p, p, { color: 'frame', role: 'balconyPost' }));
    }
}

/**
 * A condo's site (PRD 8.9): no yard and no garage of its own, so the
 * turntable's top is a paved plaza, with concrete planters of clipped
 * shrubs round its edge where they stand clear of the building.
 */
function plaza(out, site, layout, cx, cz) {
    const S = HOUSE.site;
    const R = site.radius > 0 ? site.radius : Math.hypot(site.halfWidth, site.halfDepth);
    out.lawn.push(part(null, 0, 0, 0, 2 * R, S.lawn, 2 * R, { color: 'paving', role: 'plaza' }));
    const P = HOUSE.plaza.planter;
    const keep = [...layout.slabs, ...(layout.neighbors || [])].map((s) => [s.x + cx - s.width / 2, s.z + cz - s.depth / 2, s.x + cx + s.width / 2, s.z + cz + s.depth / 2]);
    const reach = Math.hypot(P.width, P.depth) / 2;
    for (const angle of HOUSE.plaza.angles) {
        const a = (angle * Math.PI) / 180;
        const rho = R - reach - S.edge;
        const x = Math.cos(a) * rho;
        const z = Math.sin(a) * rho;
        const clear = keep.every(([x0, z0, x1, z1]) => x + P.width / 2 < x0 - 0.01 || x - P.width / 2 > x1 + 0.01 || z + P.depth / 2 < z0 - 0.01 || z - P.depth / 2 > z1 + 0.01);
        if (!clear) continue;
        out.site.push(part(null, x, S.lawn, z, P.width, P.height, P.depth, { color: 'concrete', role: 'planter' }));
        for (const dx of [-0.25, 0.25]) {
            const r = S.bed.shrub * 1.15;
            out.canopies.push(part(null, x + dx * P.width, S.lawn + P.height - r * 0.25, z, 2 * r, 1.6 * r, 2 * r, { color: 'shrub', role: 'shrub' }));
        }
    }
}

/**
 * The site the house stands on, filling the turntable's top inside its rim
 * (`site` gives the yard's half width and depth, and the lawn's radius, in
 * the model's meters): a round lawn, a
 * concrete path from the front door to the front edge (with a landing and
 * steps down beside the house to a door above the lawn), a black metal
 * porch roof over the door on cedar posts and stone piers, a driveway from
 * each garage door, a bed of clipped shrubs and white hydrangeas along the
 * front, a Japanese maple in the front yard, and Douglas firs behind the
 * house, each where it stands clear. Never lifted, though the porch's roof
 * and posts step aside while the door's floor is open (`doorOpen`). With
 * `forward` (a townhome, its neighbors at its sides) the stoop's steps come
 * down toward the street, between railings, instead of beside the house.
 */
function landscape(out, site, layout, cx, cz, door, garages, front, doorOpen = false, { forward = false } = {}) {
    const S = HOUSE.site;
    const W = site.halfWidth;
    const D = site.halfDepth;
    const lawnTop = S.lawn;
    // The lawn: a disc filling the turntable inside its rim, or, with no
    // radius given, the yard's own rectangle.
    const R = site.radius;
    if (R > 0) out.lawn.push(part(null, 0, 0, 0, 2 * R, S.lawn, 2 * R, { color: 'lawn', role: 'lawn' }));
    else out.site.push(part(null, 0, 0, 0, 2 * W, S.lawn, 2 * D, { color: 'lawn', role: 'lawn' }));
    const gaps = [];
    if (door) {
        // A landing at the door, and from it steps down alongside the house
        // (outward, away from the middle), so a door over a basement has a
        // proper stair, and the path leaves from its foot.
        const st = S.stoop;
        const rise = Math.max(0, door.y - lawnTop);
        const n = Math.max(1, Math.ceil(rise / st.rise));
        // The landing is the porch: as wide as its roof, its posts on it.
        const P = HOUSE.porch;
        const width = P.width;
        const z = door.z + P.depth / 2;
        // The landing: a stone-clad base under a concrete top, like the
        // stone base along the house (QA: it read as a concrete block).
        const landingTop = Math.max(rise, HOUSE.step.height);
        out.site.push(part(null, door.x, lawnTop, z, width, landingTop, P.depth, { color: rise > 0.05 ? 'stone' : 'path', role: 'stoop' }));
        if (rise > 0.05) out.site.push(part(null, door.x, lawnTop + landingTop - 0.006, z, width + 0.006, 0.008, P.depth + 0.006, { color: 'path', role: 'landingTop' }));
        // Outward, away from the middle, unless the yard is too narrow
        // there for the stair and the path at its foot.
        let dir = door.x <= 0 ? -1 : 1;
        const reach = width / 2 + (n - 1) * st.tread + S.path.width / 2;
        if (Math.abs(door.x + dir * reach) > W - 0.01) dir = -dir;
        let foot = door.x;
        let from = door.z + P.depth;
        const sw = width * 0.62;   // a stair toward the street, narrower than its landing
        // A step or two comes straight down in front of the door, so the
        // path leaves from the door's middle (QA, 2026-10-15: one step
        // turned sideways put the path off center). A real stair, over a
        // basement, runs alongside the house as before.
        const ahead = forward || n <= HOUSE.site.stoop.aheadUpTo;
        for (let k = 1; k < n; k++) {
            if (ahead) {
                const zk = door.z + P.depth + (k - 0.5) * st.tread;
                out.site.push(part(null, door.x, lawnTop, zk, sw, (rise * (n - k)) / n, st.tread, { color: 'path', role: 'stoop' }));
                from = zk + st.tread / 2;
            } else {
                foot = door.x + dir * (width / 2 + (k - 0.5) * st.tread);
                out.site.push(part(null, foot, lawnTop, z, st.tread, (rise * (n - k)) / n, P.depth, { color: 'path', role: 'stoop' }));
            }
        }
        if (D > from) out.site.push(part(null, foot, lawnTop, (from + D) / 2, S.path.width, S.path.height, D - from, { color: 'path', role: 'path' }));
        if (forward && n > 2) {
            // A sloped black railing down each side of the stair, a post at
            // each foot.
            const R = HOUSE.rail;
            const railY = lawnTop + landingTop + R.height;
            const run = (n - 1) * st.tread;
            const drop = rise - rise / n;
            const angle = Math.atan2(drop, run);
            const len = Math.hypot(run, drop);
            const z0 = door.z + P.depth;
            for (const side of [-1, 1]) {
                const x = door.x + side * (sw / 2 - R.size / 2 - 0.001);
                out.site.push({
                    level: null, role: 'rail', color: 'frame',
                    position: [x, railY - drop / 2, z0 + run / 2], scale: [R.size, R.size, len], rotation: [angle, 0, 0], top: railY
                });
                out.site.push(part(null, x, lawnTop, z0 + run - R.size / 2 - 0.001, R.size, rise / n + R.height, R.size, { color: 'frame', role: 'rail' }));
            }
        }
        // Black railings: along the landing's open front and down the
        // stair, on its open side, once the stair is more than a step or two.
        if (n > 2 && !forward) {
            const R = HOUSE.rail;
            const railY = lawnTop + landingTop + R.height;
            // A clear millimeter in front of the piers' faces and behind the
            // landing's: at the pier's own depth the two fought (QA,
            // 2026-10-14).
            const front = door.z + P.depth - R.size / 2 - 0.001;
            const inner = door.x - dir * (width / 2 - 0.01);
            const outer = door.x + dir * (width / 2);
            out.site.push(part(null, (inner + outer) / 2, railY, front, Math.abs(outer - inner), R.size, R.size, { color: 'frame', role: 'rail' }));
            for (const x of [inner, outer]) out.site.push(part(null, x, lawnTop + landingTop, front, R.size, R.height, R.size, { color: 'frame', role: 'rail' }));
            // Down the stair: a sloped rail from the landing's corner to the
            // foot, a post at the foot.
            const run = (n - 1) * st.tread;
            const drop = rise - rise / n;
            const angle = Math.atan2(drop, run);
            const len = Math.hypot(run, drop);
            out.site.push({
                level: null, role: 'rail', color: 'frame',
                position: [outer + dir * run / 2, railY - drop / 2, front],
                scale: [len, R.size, R.size], rotation: [0, 0, -dir * angle], top: railY
            });
            out.site.push(part(null, foot + dir * st.tread / 2, lawnTop, front, R.size, rise / n + R.height, R.size, { color: 'frame', role: 'rail' }));
        }
        // The porch roof, black metal, over the door, on two cedar posts
        // standing on short stone piers at the landing's front corners. It
        // is the front's, so it steps aside with the front wall while the
        // door's floor is open, or it would hide the room behind it.
        const floorY = lawnTop + Math.max(rise, HOUSE.step.height);
        const roofY = door.y + HOUSE.door.height + P.above;
        if (!doorOpen) out.site.push(part(null, door.x, roofY, z, width + 0.01, P.thickness, P.depth + 0.008, { color: 'porch', role: 'porch' }));
        for (const side of doorOpen ? [] : [-1, 1]) {
            const px = door.x + side * (width / 2 - P.post);
            const pz = door.z + P.depth - P.post;
            out.site.push(part(null, px, floorY, pz, P.post * 1.6, P.pier, P.post * 1.6, { color: 'stone', role: 'pier' }));
            out.site.push(part(null, px, floorY + P.pier, pz, P.post, roofY - floorY - P.pier, P.post, { color: 'cedar', role: 'post' }));
        }
        const left = Math.min(door.x - width / 2, foot - S.path.width / 2);
        const right = Math.max(door.x + width / 2, foot + S.path.width / 2);
        gaps.push([left, right]);
    }
    for (const g of garages) {
        const width = g.width + 0.02;
        // A garage a story up (a townhome's, over a basement) is reached by a
        // ramp down to the street; any other by a drive on the lawn.
        const up = (g.y || 0) - lawnTop;
        if (D > g.z && up > 0.06) {
            const run = D - g.z;
            out.site.push({
                level: null, role: 'drive', color: 'drive',
                position: [g.x, lawnTop + up / 2, (g.z + D) / 2], scale: [width, S.drive.height, Math.hypot(run, up)],
                rotation: [Math.atan2(up, run), 0, 0], top: lawnTop + up
            });
        } else if (D > g.z) {
            out.site.push(part(null, g.x, lawnTop, (g.z + D) / 2, width, S.drive.height, D - g.z, { color: 'drive', role: 'drive' }));
        }
        gaps.push([g.x - width / 2, g.x + width / 2]);
    }
    // A bed of clipped shrubs along the front of the house, a white
    // hydrangea every third, broken by the stair and the porch.
    if (front) {
        const B = S.bed;
        const bz = front.z + B.depth / 2;
        let a = front.x0 + 0.015;
        const runs = [];
        for (const [g0, g1] of gaps.slice().sort((p, q) => p[0] - q[0])) {
            if (g0 - 0.01 > a) runs.push([a, Math.min(g0 - 0.01, front.x1 - 0.015)]);
            a = Math.max(a, g1 + 0.01);
        }
        if (front.x1 - 0.015 > a) runs.push([a, front.x1 - 0.015]);
        let k = 0;
        for (const [r0, r1] of runs) {
            if (r1 - r0 < 0.04) continue;
            out.site.push(part(null, (r0 + r1) / 2, lawnTop, bz, r1 - r0, B.height, B.depth, { color: 'mulch', role: 'bed' }));
            const n = Math.max(1, Math.floor((r1 - r0) / B.every));
            for (let i = 0; i < n; i++) {
                const fx = r0 + (i + 0.5) * ((r1 - r0) / n);
                const r = B.shrub * (0.9 + ((i * 7) % 3) * 0.08);
                const color = k++ % 3 === 1 ? 'hydrangea' : 'shrub';
                out.canopies.push(part(null, fx, lawnTop + B.height - r * 0.2, bz, 2 * r, 1.6 * r, 2 * r, { color, role: 'shrub' }));
            }
        }
    }
    // The trees: a Japanese maple in the front yard, firs behind the house,
    // a green shade tree at the sides, each only where it stands clear of
    // the house, the paving and the beds.
    const T = S.tree;
    const ring = R > 0 ? R : Math.hypot(W, D);
    const keepOut = [
        ...[...layout.slabs, ...(layout.neighbors || [])].map((s) => [s.x + cx - s.width / 2, s.z + cz - s.depth / 2, s.x + cx + s.width / 2, s.z + cz + s.depth / 2]),
        ...out.site.filter((p) => ['path', 'drive', 'stoop', 'bed', 'porch', 'post', 'pier'].includes(p.role))
            .map((p) => {
                const box = [p.position[0] - p.scale[0] / 2, p.position[2] - p.scale[2] / 2, p.position[0] + p.scale[0] / 2, p.position[2] + p.scale[2] / 2];
                // A walk runs on toward the street, past the yard to the
                // lawn's edge, so nothing stands at its end either (QA,
                // 2026-10-16: with the door far left, the maple stood
                // across the walk, just past where it stopped).
                if (p.role === 'path') box[3] = Math.max(box[3], ring);
                return box;
            })
    ];
    const clearOf = (x, z, r) => keepOut.every(([x0, z0, x1, z1]) => Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1)) >= r);
    const placed = [];
    const room = (x, z, r) => clearOf(x, z, r) && placed.every(([px, pz, pr]) => Math.hypot(px - x, pz - z) >= pr + r);
    const trunk = (x, z, height) => out.site.push(part(null, x, lawnTop, z, T.trunkWidth, height, T.trunkWidth, { color: 'trunk', role: 'trunk' }));
    // ROUND THE LAWN'S EDGE (`ring`), where a round garden has its room: a
    // spot at `angle` degrees (0 to the right, 90 to the front) as near the
    // edge as a tree of `reach` fits, inside a small margin.
    const spot = (angle, reach) => {
        const a = (angle * Math.PI) / 180;
        const rho = ring - reach - S.edge;
        return [Math.cos(a) * rho, Math.sin(a) * rho];
    };
    // The maple, at a front corner, the left one first.
    for (const angle of S.angles.maple) {
        const r = T.radius * 1.05;
        const [x, z] = spot(angle, r * 1.3);
        if (!room(x, z, r + T.clear)) continue;
        trunk(x, z, T.trunk * 0.65);
        // A Japanese maple's crown: low, round and layered.
        const ty = lawnTop + T.trunk * 0.6;
        for (const [dx, dy, dz, k, color] of [[0, 0.45, 0, 1, 'maple1'], [0.55, 0.15, 0.25, 0.7, 'maple2'], [-0.5, 0.2, -0.2, 0.65, 'maple2'], [0.1, 0.85, -0.1, 0.6, 'maple1']]) {
            const rr = r * k;
            out.canopies.push({ level: null, position: [x + dx * r, ty + dy * r, z + dz * r], scale: [2 * rr, 1.5 * rr, 2 * rr], top: ty + dy * r + 0.75 * rr, color, role: 'maple' });
        }
        placed.push([x, z, r * 1.3]);
        break;
    }
    // Firs, tall and dark, one at each back corner where one fits.
    const F = S.fir;
    S.angles.firs.forEach((angles, side) => {
        for (const angle of angles) {
            const [x, z] = spot(angle, F.radius);
            if (!room(x, z, F.radius + 0.01)) continue;
            trunk(x, z, F.height * 0.18);
            out.firs.push({ level: null, position: [x, lawnTop + F.height * 0.12 + F.height * 0.44, z], scale: [2 * F.radius, F.height * 0.88, 2 * F.radius], top: lawnTop + F.height, color: side === 0 ? 'fir1' : 'fir2', role: 'fir' });
            placed.push([x, z, F.radius]);
            break;
        }
    });
    // A shade tree at each side, where one fits.
    for (const angles of S.angles.shade) {
        for (const angle of angles) {
            const [x, z] = spot(angle, T.radius);
            if (!room(x, z, T.radius + T.clear)) continue;
            trunk(x, z, T.trunk);
            out.canopies.push({ level: null, position: [x, lawnTop + T.trunk + T.radius * 0.55, z], scale: [2 * T.radius, 1.7 * T.radius, 2 * T.radius], top: lawnTop + T.trunk + T.radius * 1.4, color: 'leaves', role: 'shade' });
            placed.push([x, z, T.radius]);
            break;
        }
    }
}

/** A key for what the model shows, so the instances are rewritten only
 *  when the home changes (a bathroom's type of bath too). */
export function layoutKey(checklist) {
    const rooms = (checklist.rooms || []).filter((r) => !r.deletedAt).map((r) => [r.id, r.level, r.area, r.label, r.bath || null]);
    const items = (checklist.items || []).filter((i) => !i.deletedAt).map((i) => [i.id, i.roomId, i.order, Boolean(i.important)]);
    const r = checklist.residence || null;
    return JSON.stringify([checklist.id || '', checklist.levels, r ? [r.kind, r.attached] : null, rooms, items]);
}

/** Each bathroom's type of bath by room id (store.js `bath`), for
 *  `instancesFor`. A room without one is left out, and draws a full bath. */
export function bathsOf(checklist) {
    return new Map((checklist.rooms || []).filter((r) => r.bath).map((r) => [r.id, r.bath]));
}

// ---- Building it (three) -------------------------------------------------------------

/** A triangular prism, base on y = 0, apex at y = 1 over z = 0, running
 *  x from -0.5 to 0.5: a gable's mass, scaled to fit. */
function prismGeometry() {
    const shape = new THREE.Shape();
    shape.moveTo(-0.5, 0);
    shape.lineTo(0.5, 0);
    shape.lineTo(0, 1);
    shape.lineTo(-0.5, 0);
    const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
    g.rotateY(Math.PI / 2);
    g.translate(-0.5, 0, 0);
    return g;
}

/**
 * Build the model. `at` is the turntable's top in its own frame, `config`
 * the scene's CONFIG.
 * Returns the controller main.js drives:
 *
 *   group               add it to the scene
 *   show(checklist)     draw this home (null for an empty one); returns
 *                       whether anything changed
 *   lift(level, now)    lift a level (null to set it down), `now` to skip
 *                       the move; returns whether it is a level of the home
 *   lifted              the lifted level, or null
 *   focus()             the lifted level measured for the closer view
 *                       (focusOf), or null
 *   tick(delta)        move the levels toward their lift; returns whether
 *                       anything moved this frame
 *   labels()            the lifted level's rooms: [{ roomId, text, point }]
 *                       with `point` over the room in world meters
 *   levels()            the home's levels, bottom to top, then garages
 *   anchor()            a point a hand above the house's middle
 *   height              the house's highest point over the turntable's top,
 *                       unlifted, in the stage's meters (the frame's)
 *   pickable            the meshes a tap on the model can meet
 *   levelOfHit(hit)     the level a raycast hit on the model belongs to
 *   itemOfHit(hit)      the task a hit on a dot or its flag belongs to
 *   hitOf(hit)          { level, roomId, itemId } of whatever a hit met
 *   select({ roomId, itemId })  outline a room, enlarge a task's dot
 *   hover(roomId)       outline the room under the pointer, faintly
 *   shiny               the materials that should mirror the room
 */
export function buildModel(config, at) {
    const colors = config.model;
    const limits = config.limits;
    const group = new THREE.Group();
    group.name = 'house-model';
    group.position.set(at[0], at[1], at[2]);
    const inner = new THREE.Group();
    group.add(inner);

    const box = new THREE.BoxGeometry(1, 1, 1);
    const dot = new THREE.CylinderGeometry(0.5, 0.5, 1, 16);
    dot.translate(0, 0.5, 0);
    const prism = prismGeometry();
    const std = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...opts });
    const make = (kind, geometry, material, capacity, colored = false) => {
        const mesh = new THREE.InstancedMesh(geometry, material, capacity);
        mesh.name = `model-${kind}`;
        mesh.count = 0;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.pick = 'model';
        // Colors from the start, even with nothing to color: three builds a
        // different shader once a mesh has them, and that build belongs
        // behind the loading screen, not on the visitor's first room.
        if (colored) mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
        // Every slot starts at nothing, not three's identity (a unit box):
        // a slot drawn before its part is written can never show (QA,
        // 2026-10-16: a gray box over an open floor, see `outlines`).
        const slots = mesh.instanceMatrix.array;
        slots.fill(0);
        for (let i = 15; i < slots.length; i += 16) slots[i] = 1;
        inner.add(mesh);
        return mesh;
    };
    const pal = colors.palette;
    const levelsCap = 8;
    const sketchFill = { transparent: true, opacity: colors.context.opacity, depthWrite: false };
    const context = (mesh) => {
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.userData.pick = null;
        mesh.userData.through = true;
        return mesh;
    };
    const colored = (roughness, extra = {}) => std(0xffffff, { roughness, ...extra });
    const roofMaterial = std(pal.roof, { roughness: 0.85 });
    const meshes = {
        slabs: make('slabs', box, colored(0.85), levelsCap, true),
        walls: make('walls', box, colored(0.85), levelsCap * 5 + limits.rooms * 4, true),
        siding: make('siding', box, colored(0.85), 900, true),
        tiles: make('tiles', box, colored(0.7), limits.rooms, true),
        windows: make('windows', box, colored(0.25, { metalness: 0.2 }), 600, true),
        roofs: make('roofs', box, roofMaterial, 12),
        gables: make('gables', prism, colored(0.85), 10, true),
        fixtures: make('fixtures', box, colored(0.7), limits.rooms * 40, true),
        // The round things in the rooms: basins, bowls, burners, stools,
        // lamps, a washer's door.
        rounds: make('rounds', new THREE.CylinderGeometry(0.5, 0.5, 1, 18), colored(0.55), limits.rooms * 24, true),
        trims: make('trims', box, colored(0.5), 64, true),
        site: make('site', box, colored(0.9), 80, true),
        canopies: make('canopies', new THREE.IcosahedronGeometry(0.5, 1), colored(0.8, { flatShading: true }), 120, true),
        blooms: make('blooms', new THREE.IcosahedronGeometry(0.5, 0), colored(0.8, { flatShading: true }), 80, true),
        firs: make('firs', new THREE.ConeGeometry(0.5, 1, 9), colored(0.85, { flatShading: true }), 4, true),
        lawn: make('lawn', new THREE.CylinderGeometry(0.5, 0.5, 1, 96), colored(0.95), 1, true),
        // The context round a townhome or a condo (PRD 8.9), a sketch: a
        // faint see-through fill (its walls, its gables) and slate edges.
        // No shadows, and never met by a tap, which goes through to the
        // house.
        massing: context(make('massing', box, colored(0.95, sketchFill), 12, true)),
        contextRoofs: context(make('contextRoofs', prism, colored(0.95, sketchFill), 4, true)),
        edges: context(make('edges', box, colored(0.7), 220, true)),
        // The selected and hovered rooms' borders, lit a little so they read
        // on a shaded floor.
        outlines: make('outlines', box, colored(0.5, { emissive: config.colors.accent, emissiveIntensity: 0.35 }), 8, true),
        markers: make('markers', dot, std(0xffffff, {
            roughness: 0.4, emissive: colors.marker, emissiveIntensity: colors.markerGlow || 0
        }), limits.items, true),
        flags: make('flags', box, std(colors.marker, { roughness: 0.5, emissive: colors.marker, emissiveIntensity: colors.markerGlow || 0 }), limits.items * 2)
    };
    const paint = Object.fromEntries(Object.entries(pal).map(([k, v]) => [k, new THREE.Color(v)]));
    paint.marker = new THREE.Color(colors.marker);
    paint.markerSelected = new THREE.Color(config.colors.accent);
    // The report's colors (PLANNING 13): done green, skipped amber, not
    // reached gray.
    paint.markerDone = new THREE.Color(config.colors.done);
    paint.markerSkipped = new THREE.Color(config.colors.attention);
    paint.markerNotReached = new THREE.Color(config.colors.skipped);
    paint.outline = new THREE.Color(config.colors.accent);
    paint.outlineHover = new THREE.Color(colors.outlineHover || '#9FB3C4');
    // The borders round a room cast no shadow (they are a highlight, not a
    // thing), so they are left out of the shadow pass. That pass uploads a
    // mesh's instances under the NEXT render's frame number (three r186
    // counts the frame between its main and shadow passes), so a mesh it
    // touched and then changed before the next render (the first hover
    // after a floor opened, which refreshes the shadows) was drawn from its
    // old data: unwritten slots, a gray box over the open floor (QA,
    // 2026-10-16). Out of that pass, the main pass uploads it every time.
    meshes.outlines.castShadow = false;
    const paintOf = (p) => paint[p.color] || paint.wall;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const turn = new THREE.Quaternion();
    const euler = new THREE.Euler();

    let checklist = null;
    let layout = layoutHome(EMPTY_HOME);
    let areas = new Map();
    /** A bathroom's type of bath by room id, for the kit it draws. */
    let baths = new Map();
    let key = '';
    let lifted = null;
    /** The selected room and task, and the room under the pointer. */
    const selection = { roomId: null, itemId: null, hoverRoomId: null };
    /** A visit's report on the dots (`report`), or null. */
    let results = null;
    /** Each part's lift now, and the move toward its target. */
    const now = new Map();
    let move = null;
    /** The home assembling itself (assemble), or null. */
    let build = null;
    let placed = { slabs: [], tiles: [], markers: [], flags: [], walls: [], windows: [], siding: [], roofs: [], gables: [], fixtures: [], trims: [], site: [], canopies: [], blooms: [], firs: [], lawn: [], outlines: [], rounds: [], massing: [], contextRoofs: [], edges: [] };
    const turntable = config.stage.turntable;
    let scaled = 1;
    let restHeight = 0;
    /** A point in the model's own frame, in world meters. */
    const toWorld = (p) => [at[0] + p[0] * scaled, at[1] + p[1] * scaled, at[2] + p[2] * scaled];

    function place(mesh, list, colorOf) {
        const n = Math.min(list.length, mesh.instanceMatrix.count);
        for (let i = 0; i < n; i++) {
            const p = list[i];
            position.set(p.position[0], p.position[1], p.position[2]);
            // A part scaled to nothing is never drawn as a speck.
            scale.set(Math.max(p.scale[0], 1e-4), Math.max(p.scale[1], 1e-4), Math.max(p.scale[2], 1e-4));
            if (p.rotation) turn.setFromEuler(euler.set(p.rotation[0], p.rotation[1], p.rotation[2]));
            else turn.identity();
            matrix.compose(position, turn, scale);
            mesh.setMatrixAt(i, matrix);
            if (colorOf) mesh.setColorAt(i, colorOf(p));
        }
        mesh.count = n;
        mesh.instanceMatrix.needsUpdate = true;
        if (colorOf && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.computeBoundingBox();
    }

    function draw() {
        placed = instancesFor(layout, now, { lifted, areas, baths, site: siteFor(layout, turntable, scaled), selection });
        place(meshes.slabs, placed.slabs, paintOf);
        place(meshes.walls, placed.walls, paintOf);
        place(meshes.siding, placed.siding, paintOf);
        place(meshes.tiles, placed.tiles, paintOf);
        place(meshes.windows, placed.windows, paintOf);
        place(meshes.roofs, placed.roofs);
        place(meshes.gables, placed.gables, paintOf);
        place(meshes.fixtures, placed.fixtures, paintOf);
        place(meshes.trims, placed.trims, paintOf);
        place(meshes.site, placed.site, paintOf);
        place(meshes.canopies, placed.canopies, paintOf);
        place(meshes.blooms, placed.blooms, paintOf);
        place(meshes.firs, placed.firs, paintOf);
        place(meshes.rounds, placed.rounds, paintOf);
        place(meshes.lawn, placed.lawn, paintOf);
        place(meshes.massing, placed.massing, paintOf);
        place(meshes.contextRoofs, placed.contextRoofs, paintOf);
        place(meshes.edges, placed.edges, paintOf);
        place(meshes.markers, placed.markers, (p) => paint[markerPaintKey(p, results)]);
        place(meshes.outlines, placed.outlines, paintOf);
        place(meshes.flags, placed.flags);
    }

    function targets() {
        return levelOffsets(layout.slabs, lifted, colors.lift);
    }

    function settle() {
        move = null;
        build = null;
        now.clear();
        for (const [k, y] of targets()) now.set(k, y);
    }

    const api = {
        group,
        pickable: Object.values(meshes),
        meshes,
        // Asphalt and siding mirror nothing; the list stays for main.js.
        shiny: [],
        get lifted() {
            return lifted;
        },
        get placed() {
            return placed;
        },
        show(next) {
            const home = next || EMPTY_HOME;
            const nextKey = next ? layoutKey(next) : 'empty';
            const sameHome = Boolean(checklist && next && checklist.id === next.id);
            checklist = next;
            if (nextKey === key) return false;
            key = nextKey;
            layout = layoutHome(home);
            areas = new Map((home.rooms || []).map((r) => [r.id, r.area]));
            baths = bathsOf(home);
            scaled = fitScale(layout, turntable, colors.scale);
            group.scale.set(scaled, scaled, scaled);
            const rest = instancesFor(layout, new Map(), { areas, baths, site: siteFor(layout, turntable, scaled) });
            restHeight = Math.max(0, ...Object.values(rest).flat().map((p) => p.top)) * scaled;
            // A different home, or the lifted level gone from this one, sets
            // the level down at once.
            if (!sameHome || !layout.slabs.some((s) => s.level === lifted)) lifted = null;
            if (!sameHome) Object.assign(selection, { roomId: null, itemId: null, hoverRoomId: null });
            settle();
            draw();
            return true;
        },
        /** The home builds itself: its levels lifted apart, settling into
         *  place one by one, the roof last (assemblyPlan). A lift takes over
         *  from wherever they are. */
        assemble() {
            lifted = null;
            move = null;
            const plan = assemblyPlan(layout.slabs, colors.assemble);
            settle();
            for (const p of plan) now.set(p.key, p.from);
            build = { plan, elapsed: 0 };
            draw();
            return plan;
        },
        lift(level, instant = false) {
            const exists = level === null || layout.slabs.some((s) => s.level === level);
            if (!exists) return false;
            build = null;
            lifted = level;
            if (instant || !(colors.lift.seconds > 0)) {
                settle();
            } else {
                const to = targets();
                const from = new Map([...to.keys()].map((k) => [k, now.get(k) || 0]));
                move = { from, to, elapsed: 0 };
            }
            draw();
            return true;
        },
        tick(delta) {
            if (build) {
                build.elapsed += Math.max(0, delta);
                const A = colors.assemble;
                let done = true;
                for (const p of build.plan) {
                    const t = Math.min(1, Math.max(0, (build.elapsed - p.delay) / A.seconds));
                    if (t < 1) done = false;
                    now.set(p.key, p.from * (1 - smoothstep(t)));
                }
                if (done) build = null;
                draw();
                return true;
            }
            if (!move) return false;
            move.elapsed += Math.max(0, delta);
            const t = smoothstep(move.elapsed / colors.lift.seconds);
            for (const [k, to] of move.to) {
                const from = move.from.get(k) || 0;
                now.set(k, from + (to - from) * t);
            }
            if (t >= 1) move = null;
            draw();
            return true;
        },
        get moving() {
            return Boolean(move || build);
        },
        get assembling() {
            return Boolean(build);
        },
        /** The home's levels, bottom to top and then the garages. */
        levels() {
            return layout.slabs.map((s) => s.level);
        },
        /** A point over the house's middle, a hand above its highest point
         *  (the roof's ridge), lifted or not, in the turntable's frame. */
        anchor() {
            const tops = Object.values(placed).flat().map((p) => p.top);
            return toWorld([0, Math.max(0, ...tops) + 0.14 / scaled, 0]);
        },
        /** The open floor as it will stand once lifted, for the closer
         *  view (focusOf), or null with no floor open. */
        focus() {
            if (!lifted) return null;
            const inst = instancesFor(layout, targets(), { lifted, areas, baths, site: siteFor(layout, turntable, scaled) });
            return focusOf(inst, lifted, scaled);
        },
        /** How tall the house stands, unlifted (turntable.js frames it). */
        get height() {
            return restHeight;
        },
        /** How large the model is drawn (fitScale). */
        get scale() {
            return scaled;
        },
        toWorld,
        /**
         * Where a touch point is, in the turntable's frame, for its halo:
         * `{ kind: 'floor', level }` the middle of that floor's front edge,
         * `{ kind: 'dot', itemId }` the top of that task's dot. Null when
         * the model does not show it.
         */
        pointOf(target) {
            if (!target) return null;
            if (target.kind === 'floor') {
                const s = placed.slabs.find((p) => p.level === target.level);
                return s ? toWorld([s.position[0], s.position[1] + s.scale[1] / 2, s.position[2] + s.scale[2] / 2]) : null;
            }
            if (target.kind === 'dot') {
                const m = placed.markers.find((p) => p.itemId === target.itemId);
                return m ? toWorld([m.position[0], m.top, m.position[2]]) : null;
            }
            return null;
        },
        labels() {
            if (!lifted || !checklist) return [];
            const rooms = new Map((checklist.rooms || []).map((r) => [r.id, r]));
            return placed.tiles
                .filter((t) => t.level === lifted && rooms.has(t.roomId))
                .map((t) => ({
                    roomId: t.roomId,
                    text: roomName(checklist.serviceType, rooms.get(t.roomId)),
                    point: toWorld([t.position[0], t.position[1] + t.scale[1] / 2, t.position[2]])
                }));
        },
        levelOfHit(hit) {
            if (!hit || hit.instanceId === undefined) return null;
            const kind = Object.keys(meshes).find((k) => meshes[k] === hit.object);
            const p = kind ? placed[kind][hit.instanceId] : null;
            return p ? p.level : null;
        },
        /**
         * What a hit on the model met: `{ level, roomId, itemId }`, the
         * room of anything inside one (its floor, its fixture, a dot), the
         * task of a dot or its flag, and the level of anything at all.
         */
        hitOf(hit) {
            if (!hit || hit.instanceId === undefined) return null;
            const kind = Object.keys(meshes).find((k) => meshes[k] === hit.object);
            const p = kind ? placed[kind][hit.instanceId] : null;
            if (!p) return null;
            return { level: p.level || null, roomId: p.roomId || null, itemId: p.itemId || null };
        },
        /** Select a room and a task (either null): outlined and enlarged.
         *  Returns whether anything changed. */
        /** A visit's report on the dots (`results`: item id to its
         *  outcome), or null for the tasks' own blue. Returns whether
         *  anything changed. */
        report(next = null) {
            const map = next instanceof Map && next.size ? next : null;
            if (!map && !results) return false;
            results = map;
            draw();
            return true;
        },
        /** Whether a report is on the dots. */
        get reporting() {
            return Boolean(results);
        },
        select({ roomId = null, itemId = null } = {}) {
            if (selection.roomId === roomId && selection.itemId === itemId) return false;
            selection.roomId = roomId;
            selection.itemId = itemId;
            draw();
            return true;
        },
        /** The room under the pointer (null for none), outlined faintly.
         *  Returns whether anything changed. */
        hover(roomId = null) {
            const next = roomId === selection.roomId ? null : roomId;
            if (selection.hoverRoomId === next) return false;
            selection.hoverRoomId = next;
            draw();
            return true;
        },
        get selection() {
            return { ...selection };
        },
        /** The task a hit on a dot or its flag belongs to, else null. */
        itemOfHit(hit) {
            if (!hit || hit.instanceId === undefined) return null;
            const kind = hit.object === meshes.markers ? 'markers' : hit.object === meshes.flags ? 'flags' : null;
            const p = kind ? placed[kind][hit.instanceId] : null;
            return p && p.itemId ? p.itemId : null;
        }
    };
    api.show(null);
    return api;
}
