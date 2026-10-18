// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * layout.js - Where everything sits on the house model (PLANNING 6.2).
 *
 * THE MODEL MUST LOOK GOOD FOR ANY HOME A VISITOR DESCRIBES, so nothing on
 * it is placed by hand. This file turns a checklist into numbers, and
 * model.js only draws them:
 *
 *   slabs    one per level, the same footprint, stacked bottom to top in the
 *            taxonomy's order with a fixed gap between them (an exploded
 *            view). The garage is a lower annex beside the main floor, and a
 *            detached garage a small slab of its own beside the house.
 *   neighbors  for a townhome or a condo (PRD 8.9), where the plain white
 *            massing beside the home stands: the next units in the row, or
 *            in the building. Counted in the model's extent, so the whole
 *            group fits the turntable.
 *
 * THE KIND OF RESIDENCE SHAPES THE FOOTPRINT. A townhome is narrower and
 * deeper than a house, its garage tucked under the main floor as a story of
 * its own; a condo is wider and shallower.
 *   tiles    each room's tile on its slab, packed by a squarified treemap
 *            weighted by the kind of room (a kitchen 3, a closet 0.5), with a
 *            small gap all round.
 *   markers  one small pin per task, on a grid inside its room's tile,
 *            starred tasks taller.
 *
 * STABLE AND LOCAL. Rooms are laid out in a fixed total order (roomOrder),
 * so the same home always comes out the same, and adding a room changes its
 * own level only: every other level stays exactly where it was, and the rooms
 * on its own level keep their order. A task changes its own room's markers
 * only. (A treemap re-flows its whole level when a room is added, so that is
 * the strongest "local" a treemap can promise, and the tests hold exactly
 * that.)
 *
 * Model units are meters at model scale. x runs left to right across the
 * model, z front to back, y up from the plinth's top. Every x and z is a
 * center.
 *
 * Pure.
 */

import { serviceType } from './taxonomy.min.js';

/** Sizes in model meters (PLANNING 6.2): a slab about 1.2 by 0.8. */
export const MODEL = Object.freeze({
    footprint: Object.freeze({ width: 1.2, depth: 0.8 }),
    /** A townhome's and a condo's own footprints (a house has `footprint`). */
    footprints: Object.freeze({
        townhome: Object.freeze({ width: 0.74, depth: 0.95 }),
        condo: Object.freeze({ width: 1.2, depth: 0.7 })
    }),
    /** The massing beside a townhome or a condo: how much of each neighbor
     *  shows, and how far back from the home's front it stands, so the home
     *  reads as its own. */
    neighbor: Object.freeze({
        townhome: Object.freeze({ width: 0.3, setback: 0.03 }),
        condo: Object.freeze({ width: 0.22, setback: 0.025 })
    }),
    slabThickness: 0.04,
    levelGap: 0.2,
    margin: 0.03,           // the slab's rim, inside which tiles are packed
    tileGap: 0.012,         // between neighboring tiles
    tileHeight: 0.018,
    minShare: 0.5,          // no room's weight below half its level's mean (flooredWeights)
    annex: Object.freeze({ width: 0.5, depth: 0.6, gap: 0.06, drop: 0.012 }),
    detached: Object.freeze({ width: 0.45, depth: 0.45, gap: 0.22 }),
    marker: Object.freeze({ size: 0.028, height: 0.03, starHeight: 0.055, minSize: 0.012, fill: 0.55 })
});

// ---- The squarified treemap ---------------------------------------------------

/** The worst aspect ratio in a row of areas laid along a side of `side`. */
function worst(row, side) {
    const sum = row.reduce((s, a) => s + a, 0);
    const max = Math.max(...row);
    const min = Math.min(...row);
    const s2 = side * side;
    return Math.max((s2 * max) / (sum * sum), (sum * sum) / (s2 * min));
}

/**
 * Pack areas (in the order given) into a rectangle, returning one rectangle
 * per area: { x, z, width, depth } with x, z the min corner. The squarified
 * algorithm of Bruls, Huizing and van Wijk: a row grows along the shorter
 * side while that improves its worst aspect ratio, then the rest of the
 * rectangle is filled the same way. It works best with the areas largest
 * first, which is how roomOrder hands them over.
 */
export function squarify(areas, rect) {
    const out = new Array(areas.length);
    const total = areas.reduce((s, a) => s + a, 0);
    if (!areas.length || total <= 0) return [];
    const scale = (rect.width * rect.depth) / total;
    const scaled = areas.map((a) => a * scale);
    let r = { ...rect };
    let i = 0;
    while (i < scaled.length) {
        const side = Math.min(r.width, r.depth);
        const row = [scaled[i]];
        let j = i + 1;
        while (j < scaled.length && worst([...row, scaled[j]], side) <= worst(row, side)) {
            row.push(scaled[j]);
            j++;
        }
        const sum = row.reduce((s, a) => s + a, 0);
        if (r.width >= r.depth) {
            // A column on the left, as tall as the rectangle.
            const w = j === scaled.length ? r.width : sum / r.depth;
            let z = r.z;
            row.forEach((a, k) => {
                const d = k === row.length - 1 ? r.z + r.depth - z : a / w;
                out[i + k] = { x: r.x, z, width: w, depth: d };
                z += d;
            });
            r = { x: r.x + w, z: r.z, width: r.width - w, depth: r.depth };
        } else {
            // A row along the front, as wide as the rectangle.
            const d = j === scaled.length ? r.depth : sum / r.width;
            let x = r.x;
            row.forEach((a, k) => {
                const w = k === row.length - 1 ? r.x + r.width - x : a / d;
                out[i + k] = { x, z: r.z, width: w, depth: d };
                x += w;
            });
            r = { x: r.x, z: r.z + d, width: r.width, depth: r.depth - d };
        }
        i = j;
    }
    return out;
}

// ---- The slabs ----------------------------------------------------------------

/** The kind of residence a checklist is, as a key (none is a house). */
export function kindOf(checklist) {
    const r = checklist && checklist.residence;
    return r && (r.kind === 'townhome' || r.kind === 'condo') ? r.kind : 'house';
}

/** Whether a townhome's garage is tucked under its main floor: a story of
 *  its own, under the main floor, rather than an annex beside it. */
export function tuckedGarage(checklist) {
    return kindOf(checklist) === 'townhome' && checklist.levels.includes('garage');
}

/**
 * One slab per level the home has. Stories stack from the lowest; the garage
 * sits beside the main floor (or the lowest story), slightly lower, or in a
 * townhome under the main floor; a detached garage stands apart on the
 * other side, at ground level. The footprint is the kind of residence's.
 */
export function slabsFor(checklist, model = MODEL) {
    const type = serviceType(checklist.serviceType);
    const levels = type.levels.filter((l) => checklist.levels.includes(l.key));
    const tucked = tuckedGarage(checklist);
    let stories = levels.filter((l) => !l.annex);
    if (tucked) {
        // Under the main floor: above a basement, below everything else.
        const garage = levels.find((l) => l.key === 'garage');
        const at = stories.findIndex((l) => l.key !== 'basement');
        stories = [...stories.slice(0, at < 0 ? stories.length : at), garage, ...stories.slice(at < 0 ? stories.length : at)];
    }
    const step = model.slabThickness + model.levelGap;
    const { width, depth } = (model.footprints && model.footprints[kindOf(checklist)]) || model.footprint;
    const slabs = stories.map((l, i) => ({
        level: l.key, kind: 'story', x: 0, z: 0, width, depth, y: i * step + model.slabThickness, thickness: model.slabThickness
    }));
    const ground = slabs.length ? slabs[0].y : model.slabThickness;
    for (const l of levels.filter((x) => x.annex && !(tucked && x.key === 'garage'))) {
        if (l.key === 'detached-garage') {
            const d = model.detached;
            slabs.push({
                level: l.key, kind: 'detached',
                x: -(width / 2 + d.gap + d.width / 2), z: (depth - d.depth) / 2,
                width: d.width, depth: d.depth, y: ground, thickness: model.slabThickness
            });
        } else {
            const a = model.annex;
            const beside = slabs.find((s) => s.level === 'main') || slabs.find((s) => s.kind === 'story');
            slabs.push({
                level: l.key, kind: 'annex',
                x: width / 2 + a.gap + a.width / 2, z: (depth - a.depth) / 2,
                width: a.width, depth: a.depth, y: (beside ? beside.y : ground) - a.drop, thickness: model.slabThickness
            });
        }
    }
    return slabs;
}

// ---- Rooms and tasks -----------------------------------------------------------

/**
 * The stable order rooms are laid out in: the larger kinds of room first
 * (the squarified treemap's own rule, which keeps every tile near square),
 * then the taxonomy's order, then label, then id.
 *
 * MEASURED, NOT ASSUMED. Laying rooms out in the taxonomy's order alone was
 * tried first, as PLANNING 6.2 suggested. Over 2,000 random homes of 1 to 12
 * rooms it left about 1 tile in 200 a sliver, up to 15 to 1, whenever a small
 * room came last and was handed the strip left over. Largest first ends that
 * (whitestone-layout.test.mjs holds the bound), and the order is still a
 * fixed total order, so the same home always lays out the same way and a new
 * room never reorders the rest.
 */
export function roomOrder(type, rooms) {
    const rank = new Map(type.areas.map((a, i) => [a.key, i]));
    const weight = new Map(type.areas.map((a) => [a.key, a.weight]));
    return rooms.slice().sort((a, b) => (weight.get(b.area) - weight.get(a.area))
        || (rank.get(a.area) - rank.get(b.area))
        || String(a.label).localeCompare(String(b.label))
        || String(a.id).localeCompare(String(b.id)));
}

/**
 * The weights a level is packed by, each raised to at least `share` of the
 * level's mean. A closet beside three big rooms still reads as the smallest
 * tile, but never as a sliver: without the floor, 2,000 random homes still
 * left a small room alone in a 10 to 1 strip now and then (measured).
 */
export function flooredWeights(weights, share) {
    if (!weights.length) return [];
    const mean = weights.reduce((s, w) => s + w, 0) / weights.length;
    return weights.map((w) => Math.max(w, mean * share));
}

/**
 * Markers on a grid inside a tile, as many cells as the tasks need and as
 * square as the tile allows, each marker smaller than its cell so neighbors
 * never touch.
 */
export function markerGrid(tile, items, model = MODEL) {
    const n = items.length;
    if (!n) return [];
    const m = model.marker;
    const inner = { width: Math.max(0, tile.width - 2 * m.minSize), depth: Math.max(0, tile.depth - 2 * m.minSize) };
    let cols = Math.max(1, Math.round(Math.sqrt((n * inner.width) / Math.max(inner.depth, 1e-6))));
    cols = Math.min(cols, n);
    const rows = Math.ceil(n / cols);
    const cellW = inner.width / cols;
    const cellD = inner.depth / rows;
    const size = Math.max(Math.min(m.size, cellW * m.fill, cellD * m.fill), 0);
    return items.map((item, k) => {
        const c = k % cols;
        const r = Math.floor(k / cols);
        return {
            itemId: item.id,
            roomId: tile.roomId,
            x: tile.x - inner.width / 2 + (c + 0.5) * cellW,
            z: tile.z - inner.depth / 2 + (r + 0.5) * cellD,
            y: tile.y + model.tileHeight,
            size,
            height: item.important ? m.starHeight : m.height,
            important: Boolean(item.important)
        };
    });
}

/**
 * The massing beside a townhome or a condo (PRD 8.9): a rectangle per
 * neighbor, `{ side, x, z, width, depth }`, against the home's side walls
 * and set back from its front and its back: a roof of the same pitch on a
 * footprint flush with the home's would lie in the plane of the home's own,
 * and the two would fight. A townhome's end unit has one neighbor, on
 * the right; between two, and a condo, one each side. A house, none.
 */
export function neighborsFor(checklist, model = MODEL) {
    const kind = kindOf(checklist);
    const n = model.neighbor && model.neighbor[kind];
    if (!n) return [];
    const fp = model.footprints[kind];
    const sides = kind === 'townhome' && checklist.residence.attached !== 'middle' ? [1] : [-1, 1];
    return sides.map((side) => ({
        side,
        x: side * (fp.width / 2 + n.width / 2),
        z: 0,
        width: n.width,
        depth: fp.depth - 2 * n.setback
    }));
}

/**
 * The whole model for a checklist: { slabs, tiles, markers, neighbors,
 * kind }. Only live
 * rooms and live tasks appear. Tiles and markers come out in the stable
 * order, slab by slab.
 */
export function layoutHome(checklist, model = MODEL) {
    const type = serviceType(checklist.serviceType);
    const weight = new Map(type.areas.map((a) => [a.key, a.weight]));
    const slabs = slabsFor(checklist, model);
    const rooms = (checklist.rooms || []).filter((r) => !r.deletedAt);
    const liveRoomIds = new Set(rooms.map((r) => r.id));
    const items = (checklist.items || []).filter((i) => !i.deletedAt && liveRoomIds.has(i.roomId));
    const tiles = [];
    const markers = [];
    for (const slab of slabs) {
        const here = roomOrder(type, rooms.filter((r) => r.level === slab.level));
        if (!here.length) continue;
        const inner = {
            x: slab.x - slab.width / 2 + model.margin,
            z: slab.z - slab.depth / 2 + model.margin,
            width: slab.width - 2 * model.margin,
            depth: slab.depth - 2 * model.margin
        };
        const rects = squarify(flooredWeights(here.map((r) => weight.get(r.area) || 1), model.minShare), inner);
        here.forEach((room, k) => {
            const rect = rects[k];
            const g = model.tileGap / 2;
            const tile = {
                roomId: room.id,
                level: slab.level,
                x: rect.x + rect.width / 2,
                z: rect.z + rect.depth / 2,
                width: Math.max(rect.width - 2 * g, 0),
                depth: Math.max(rect.depth - 2 * g, 0),
                y: slab.y
            };
            tiles.push(tile);
            // By the customer's order, and by id where two orders tie, so the
            // same tasks always land in the same cells.
            const own = items.filter((i) => i.roomId === room.id)
                .sort((a, b) => (a.order - b.order) || String(a.id).localeCompare(String(b.id)));
            markers.push(...markerGrid(tile, own, model));
        });
    }
    return { slabs, tiles, markers, neighbors: neighborsFor(checklist, model), kind: kindOf(checklist) };
}

/** The model's overall extent, for framing a camera on it:
 *  { minX, maxX, minZ, maxZ, top }. */
export function extentOf(layout, model = MODEL) {
    const all = [...layout.slabs, ...(layout.neighbors || [])];
    const xs = all.flatMap((s) => [s.x - s.width / 2, s.x + s.width / 2]);
    const zs = all.flatMap((s) => [s.z - s.depth / 2, s.z + s.depth / 2]);
    const top = Math.max(0, ...layout.slabs.map((s) => s.y), ...layout.markers.map((m) => m.y + m.height)) + model.tileHeight;
    return {
        minX: xs.length ? Math.min(...xs) : -model.footprint.width / 2,
        maxX: xs.length ? Math.max(...xs) : model.footprint.width / 2,
        minZ: zs.length ? Math.min(...zs) : -model.footprint.depth / 2,
        maxZ: zs.length ? Math.max(...zs) : model.footprint.depth / 2,
        top
    };
}
