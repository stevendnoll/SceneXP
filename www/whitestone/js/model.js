// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * model.js - The house model on the plinth (PLANNING 6.2): the open
 * checklist as a white architectural model, drawn from layout.js's numbers.
 *
 *   slabs    one per level, stacked and exploded
 *   tiles    one per room, a thin raised block on its level
 *   markers  one per task, a small pin in its room, starred tasks taller
 *
 * THREE DRAW CALLS FOR ANY HOME. Slabs, tiles and markers are each one
 * instanced mesh, sized for the most a checklist may hold (CONFIG.limits),
 * so a home of forty rooms and two hundred tasks costs what a studio
 * apartment does. Each marker's color is its own (`instanceColor`): the
 * brand accent now, and green, amber or gray while a visit report is shown
 * (M5).
 *
 * A LEVEL CAN BE LIFTED. Lifting one raises it a little and every story
 * above it a lot, so its rooms can be seen and named from the model station
 * (main.js puts their names over them). The move is eased, and instant
 * under reduced motion. `levelOffsets` is the arithmetic, pure, and `tick`
 * moves the levels toward it.
 *
 * The model is centered on the plinth's top, whatever the home: a detached
 * garage on one side and a garage on the other would otherwise push it off
 * the plinth's middle.
 */

import { layoutHome, extentOf, MODEL } from './layout.min.js';
import { smoothstep } from './stations.min.js';
import { roomName } from './taxonomy.min.js';

/** The home shown when no checklist is open: one empty main floor, so the
 *  plinth is never bare. */
export const EMPTY_HOME = Object.freeze({ serviceType: 'cleaning', levels: Object.freeze(['main']), rooms: Object.freeze([]), items: Object.freeze([]) });

/**
 * How far each level is lifted (meters) when `lifted` is the lifted level:
 * a Map of level key to offset. A lifted story rises by `raise` and every
 * story above it by `open`, so there is room to see into it. A lifted garage
 * (an annex beside the house, or a detached one) rises by `open` alone:
 * nothing stands on it. Nothing is lifted for an unknown level.
 */
export function levelOffsets(slabs, lifted, lift) {
    const out = new Map(slabs.map((s) => [s.level, 0]));
    const chosen = slabs.find((s) => s.level === lifted);
    if (!chosen) return out;
    if (chosen.kind !== 'story') {
        out.set(chosen.level, lift.open);
        return out;
    }
    for (const s of slabs) {
        if (s.kind !== 'story') continue;
        if (s.level === lifted) out.set(s.level, lift.raise);
        else if (s.y > chosen.y) out.set(s.level, lift.open);
    }
    return out;
}

/**
 * The shift that centers a layout on the plinth, in model meters, and
 * stands its lowest slab on the plinth's top. The garage sits a step below
 * the floor beside it (layout.js), which beside the lowest story would sink
 * it into the stone, so the whole model rises by that step instead.
 */
export function centerOf(layout) {
    const e = extentOf(layout);
    const lowest = layout.slabs.length ? Math.min(...layout.slabs.map((s) => s.y - s.thickness)) : 0;
    return [-(e.minX + e.maxX) / 2, -lowest, -(e.minZ + e.maxZ) / 2];
}

/**
 * Every instance's place and size, from a layout and the levels' offsets:
 * `{ slabs, tiles, markers }`, each a list of `{ position, scale, level }`
 * (markers with `important` and `itemId` too, tiles with `roomId`). The
 * position is the box's middle (a marker's base) in the model's own frame:
 * centered, y up from the plinth's top. Pure, so the tests can check that
 * every tile sits on its slab and every marker on its tile, lifted or not.
 */
export function instancesFor(layout, offsets) {
    const [cx, cy, cz] = centerOf(layout);
    const lift = (level) => cy + (offsets.get(level) || 0);
    const tileLevel = new Map(layout.tiles.map((t) => [t.roomId, t.level]));
    return {
        slabs: layout.slabs.map((s) => ({
            level: s.level,
            position: [s.x + cx, s.y - s.thickness / 2 + lift(s.level), s.z + cz],
            scale: [s.width, s.thickness, s.depth]
        })),
        tiles: layout.tiles.map((t) => ({
            level: t.level,
            roomId: t.roomId,
            position: [t.x + cx, t.y + MODEL.tileHeight / 2 + lift(t.level), t.z + cz],
            scale: [t.width, MODEL.tileHeight, t.depth]
        })),
        markers: layout.markers.map((m) => {
            const level = tileLevel.get(m.roomId);
            return {
                level,
                itemId: m.itemId,
                important: m.important,
                position: [m.x + cx, m.y + lift(level), m.z + cz],
                scale: [m.size, m.height, m.size]
            };
        })
    };
}

/** A key for what the model shows, so the instances are rewritten only
 *  when the home changes. */
function layoutKey(checklist) {
    const rooms = (checklist.rooms || []).filter((r) => !r.deletedAt).map((r) => [r.id, r.level, r.area, r.label]);
    const items = (checklist.items || []).filter((i) => !i.deletedAt).map((i) => [i.id, i.roomId, i.order, Boolean(i.important)]);
    return JSON.stringify([checklist.id || '', checklist.levels, rooms, items]);
}

/**
 * Build the model. `at` is the plinth's top, `config` the scene's CONFIG.
 * Returns the controller main.js drives:
 *
 *   group               add it to the scene
 *   show(checklist)     draw this home (null for the empty plinth); returns
 *                       whether anything changed
 *   lift(level, now)    lift a level (null to set it down), `now` to skip
 *                       the move; returns whether it is a level of the home
 *   lifted              the lifted level, or null
 *   tick(delta)         move the levels toward their lift; returns whether
 *                       anything moved this frame
 *   labels()            the lifted level's rooms: [{ roomId, text, point }]
 *                       with `point` over the room in world meters
 *   pickable            the meshes a tap on the model can meet (piece 4)
 *   levelOfHit(hit)     the level a raycast hit on the model belongs to
 */
export function buildModel(config, at) {
    const colors = config.model;
    const limits = config.limits;
    const levelCount = 8;
    const group = new THREE.Group();
    group.name = 'house-model';
    group.position.set(at[0], at[1], at[2]);
    const inner = new THREE.Group();
    group.add(inner);

    const box = new THREE.BoxGeometry(1, 1, 1);
    const pin = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
    pin.translate(0, 0.5, 0);
    const make = (geometry, material, capacity, name) => {
        const mesh = new THREE.InstancedMesh(geometry, material, capacity);
        mesh.name = name;
        mesh.count = 0;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.pick = 'model';
        inner.add(mesh);
        return mesh;
    };
    const slabs = make(box, new THREE.MeshStandardMaterial({ color: colors.slab, roughness: 0.65 }), levelCount, 'model-slabs');
    const tiles = make(box, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55 }), limits.rooms, 'model-tiles');
    const markers = make(pin, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }), limits.items, 'model-markers');
    // Colors from the start, even with nothing to color: three builds a
    // different shader once a mesh has them, and that build belongs behind
    // the loading screen, not on the visitor's first room.
    for (const mesh of [tiles, markers]) {
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(mesh.instanceMatrix.count * 3).fill(1), 3);
    }

    const tileColor = new THREE.Color(colors.tile);
    const liftedColor = new THREE.Color(colors.lifted);
    const markerColor = new THREE.Color(colors.marker);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const turn = new THREE.Quaternion();

    let checklist = null;
    let layout = layoutHome(EMPTY_HOME);
    let key = '';
    let lifted = null;
    /** Each level's lift now, and the move toward its target. */
    const now = new Map();
    let move = null;
    let placed = { slabs: [], tiles: [], markers: [] };

    function place(mesh, list, colorOf) {
        const n = Math.min(list.length, mesh.instanceMatrix.count);
        for (let i = 0; i < n; i++) {
            const p = list[i];
            position.set(p.position[0], p.position[1], p.position[2]);
            // A box or a pin scaled to nothing is never drawn as a speck.
            scale.set(Math.max(p.scale[0], 1e-4), Math.max(p.scale[1], 1e-4), Math.max(p.scale[2], 1e-4));
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
        placed = instancesFor(layout, now);
        place(slabs, placed.slabs, null);
        place(tiles, placed.tiles, (t) => (t.level === lifted ? liftedColor : tileColor));
        place(markers, placed.markers, () => markerColor);
    }

    function targets() {
        return levelOffsets(layout.slabs, lifted, colors.lift);
    }

    function settle() {
        move = null;
        for (const [level, y] of targets()) now.set(level, y);
    }

    const api = {
        group,
        pickable: [slabs, tiles, markers],
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
            // A different home, or the lifted level gone from this one, sets
            // the level down at once.
            if (!sameHome || !layout.slabs.some((s) => s.level === lifted)) lifted = null;
            for (const level of [...now.keys()]) if (!layout.slabs.some((s) => s.level === level)) now.delete(level);
            settle();
            draw();
            return true;
        },
        lift(level, instant = false) {
            const exists = level === null || layout.slabs.some((s) => s.level === level);
            if (!exists) return false;
            lifted = level;
            if (instant || !(colors.lift.seconds > 0)) {
                settle();
            } else {
                const from = new Map(layout.slabs.map((s) => [s.level, now.get(s.level) || 0]));
                move = { from, to: targets(), elapsed: 0 };
            }
            draw();
            return true;
        },
        tick(delta) {
            if (!move) return false;
            move.elapsed += Math.max(0, delta);
            const t = smoothstep(move.elapsed / colors.lift.seconds);
            for (const [level, to] of move.to) {
                const from = move.from.get(level) || 0;
                now.set(level, from + (to - from) * t);
            }
            if (t >= 1) move = null;
            draw();
            return true;
        },
        get moving() {
            return Boolean(move);
        },
        /** The home's levels, bottom to top and then the garages: the order
         *  a tap on the model's halo lifts them in. */
        levels() {
            return layout.slabs.map((s) => s.level);
        },
        /** Where the model's halo sits: over its middle, a hand above its
         *  highest point, lifted or not. In world meters. */
        anchor() {
            const tops = [...placed.slabs, ...placed.tiles].map((b) => b.position[1] + b.scale[1] / 2)
                .concat(placed.markers.map((m) => m.position[1] + m.scale[1]));
            return [at[0], at[1] + Math.max(0, ...tops) + 0.14, at[2]];
        },
        labels() {
            if (!lifted || !checklist) return [];
            const rooms = new Map((checklist.rooms || []).map((r) => [r.id, r]));
            return placed.tiles
                .filter((t) => t.level === lifted && rooms.has(t.roomId))
                .map((t) => ({
                    roomId: t.roomId,
                    text: roomName(checklist.serviceType, rooms.get(t.roomId)),
                    point: [
                        at[0] + t.position[0],
                        at[1] + t.position[1] + t.scale[1] / 2,
                        at[2] + t.position[2]
                    ]
                }));
        },
        levelOfHit(hit) {
            if (!hit || hit.instanceId === undefined) return null;
            const list = hit.object === slabs ? placed.slabs : hit.object === tiles ? placed.tiles : hit.object === markers ? placed.markers : null;
            const p = list && list[hit.instanceId];
            return p ? p.level : null;
        }
    };
    api.show(null);
    return api;
}
