// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * filing.js - The folders in the filing cabinet, moving.
 *
 * cabinet.js decides where every folder belongs. This keeps where each one
 * IS, moves it there over a few frames (a refile hops between drawers, a
 * found folder rises), and writes the instanced meshes room.js built.
 *
 * EVERY POSITION IS KEPT ON A PLAIN RECORD as well as in the instance
 * matrices, because a matrix cannot be read back under the test stub (and a
 * record is what a test can check: where is Acme's folder now).
 *
 * Instances are handed out by id and kept, so a folder keeps its instance
 * while it moves, and a folder that goes away gives its instance back.
 */

import { folderPose, tabPose, slotsOf, refilePose, TAB_COLORS } from './cabinet.min.js';

const DIM = 0.42;

/** How far a move at `rate` (per second) goes in `delta` seconds. An
 *  infinite rate (reduced motion) always finishes, even on a frame of zero. */
function stepOf(delta, rate) {
    return rate === Infinity ? 1 : Math.max(0, delta) * rate;
}
const MANILA = [0xe4 / 255, 0xc0 / 255, 0x7a / 255];

/**
 * A controller for one cabinet (room.js `buildCabinet`'s result). `config`
 * is the whole config, `reducedMotion` makes every move land at once.
 */
export function createFiling(cabinet, config, { reducedMotion = false } = {}) {
    const cab = config.room.cabinet;
    /** id to { index, at, from, to, t, lift, liftTo, status, dim } */
    const folders = new Map();
    let order = [];
    let open = 0;
    let openTo = 0;
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();

    const refileRate = reducedMotion ? Infinity : 1 / config.view.refileSeconds;
    const liftRate = reducedMotion ? Infinity : 1 / config.view.liftSeconds;

    function write(f) {
        matrix.makeTranslation(f.at.x, f.at.y, f.at.z);
        cabinet.bodies.setMatrixAt(f.index, matrix);
        const tab = tabPose(f.at, f.status, cab);
        matrix.makeTranslation(tab.x, tab.y, tab.z);
        cabinet.tabs.setMatrixAt(f.index, matrix);
    }

    function paint(f) {
        const k = f.dim ? DIM : 1;
        color.setRGB(MANILA[0] * k, MANILA[1] * k, MANILA[2] * k, THREE.SRGBColorSpace);
        cabinet.bodies.setColorAt(f.index, color);
        color.setHex(TAB_COLORS[f.status] || TAB_COLORS.applied, THREE.SRGBColorSpace);
        if (f.dim) color.multiplyScalar(DIM);
        cabinet.tabs.setColorAt(f.index, color);
    }

    function flush() {
        cabinet.bodies.count = order.length;
        cabinet.tabs.count = order.length;
        cabinet.bodies.instanceMatrix.needsUpdate = true;
        cabinet.tabs.instanceMatrix.needsUpdate = true;
        if (cabinet.bodies.instanceColor) cabinet.bodies.instanceColor.needsUpdate = true;
        if (cabinet.tabs.instanceColor) cabinet.tabs.instanceColor.needsUpdate = true;
    }

    /**
     * File every folder by `plan` (cabinet.drawerPlan). `status` maps id to
     * the status to show, `lifted` is the set of ids a search found, and
     * `searching` says whether anything is being looked for (so the rest
     * dim). Returns whether anything will move.
     */
    function sync(plan, status, lifted, searching) {
        const slots = slotsOf(plan);
        // Folders gone from the office give back their instance.
        const kept = order.filter((id) => slots.has(id));
        const added = [...slots.keys()].filter((id) => !folders.has(id));
        for (const id of order) if (!slots.has(id)) folders.delete(id);
        order = [...kept, ...added];
        let moving = false;
        order.forEach((id, index) => {
            const liftTo = lifted.has(id) ? 1 : 0;
            const to = folderPose(slots.get(id), cab, 0);
            let f = folders.get(id);
            if (!f) {
                // A new folder appears in its place, not flying in from nowhere.
                f = { index, at: { ...to }, from: { ...to }, to, t: 1, lift: liftTo, liftTo };
                folders.set(id, f);
            } else if (f.to.x !== to.x || f.to.z !== to.z) {
                f.from = { ...f.at, y: folderPose(slots.get(id), cab, 0).y };
                f.to = to;
                f.t = 0;
                moving = true;
            }
            f.index = index;
            f.liftTo = liftTo;
            if (f.lift !== liftTo) moving = true;
            f.status = status.get(id) || 'applied';
            f.dim = searching && !liftTo;
            place(f);
            paint(f);
            write(f);
        });
        flush();
        if (refileRate === Infinity) {
            update(0);
            return false;
        }
        return moving;
    }

    function place(f) {
        const base = refilePose(f.from, f.to, f.t);
        f.at = { x: base.x, y: base.y + cab.lift * f.lift, z: base.z };
    }

    /** Advance every move by `delta` seconds. Returns true while anything is
     *  still moving, so the scene keeps drawing frames only as long as it
     *  must. */
    function update(delta) {
        let moving = false;
        for (const f of folders.values()) {
            const before = `${f.t}:${f.lift}`;
            if (f.t < 1) f.t = Math.min(1, f.t + stepOf(delta, refileRate));
            if (f.lift !== f.liftTo) {
                const step = stepOf(delta, liftRate);
                f.lift = f.liftTo > f.lift ? Math.min(f.liftTo, f.lift + step) : Math.max(f.liftTo, f.lift - step);
            }
            if (`${f.t}:${f.lift}` !== before) {
                place(f);
                write(f);
            }
            if (f.t < 1 || f.lift !== f.liftTo) moving = true;
        }
        if (open !== openTo) {
            const step = stepOf(delta, reducedMotion ? Infinity : 2);
            open = openTo > open ? Math.min(openTo, open + step) : Math.max(openTo, open - step);
            cabinet.drawers.position.z = cab.pull * open;
            moving = moving || open !== openTo;
        }
        flush();
        return moving;
    }

    /** Slide the drawers out (true) or back in. */
    function setOpen(on) {
        openTo = on ? 1 : 0;
        if (reducedMotion) {
            open = openTo;
            cabinet.drawers.position.z = cab.pull * open;
        }
        return open !== openTo;
    }

    return {
        sync,
        update,
        setOpen,
        /** The application an instance stands for, or null. */
        idAt: (index) => (index >= 0 && index < order.length ? order[index] : null),
        /** Where a folder is now, for tests and for the lifted list. */
        folder: (id) => folders.get(id) || null,
        get count() { return order.length; },
        get open() { return open; }
    };
}
