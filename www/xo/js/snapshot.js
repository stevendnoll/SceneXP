// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * snapshot.js - WHAT WAS DRAWN, KEPT (specs/xo-photos-plan, Step 3).
 *
 * A MOMENT IS A SNAPSHOT OF WHAT WAS DRAWN, NOT A RE-SIMULATION. The pose of a
 * man diving into a tackle or going up for a ball is built over many frames by
 * view.js, from clocks and eased values the recording does not keep, so the
 * only way to have that frame again exactly is to keep it. This copies the
 * position, rotation, scale and visibility of every node under the roots it is
 * handed (the roster, the ball, the markers) and can write them back.
 *
 * CHEAP WHERE IT HAS TO BE. Taking one is a walk of about a thousand nodes and
 * ten numbers each, on the frame it happens, with no extra render during the
 * play: the picture is made later, only if somebody asks for it.
 *
 * EXACT BOTH WAYS. Doubles rather than floats, and the Euler angles rather than
 * the quaternion, so putting the live frame back after a photo leaves every
 * figure exactly as it was: a quaternion round trip rewraps a yaw past half a
 * turn, and the view eases from the yaw it finds.
 *
 * No THREE import: it reads and writes the fields every Object3D has, so the
 * suite measures it against a real three.
 */

const STRIDE = 10;

/** Every node under `roots`, in traversal order, and its transform. A root
 *  that is missing is skipped. */
export function captureDrawn(roots) {
    const nodes = [];
    for (const root of roots || []) {
        if (root && typeof root.traverse === 'function') root.traverse((o) => nodes.push(o));
    }
    const data = new Float64Array(nodes.length * STRIDE);
    nodes.forEach((o, i) => {
        const k = i * STRIDE;
        data[k] = o.position.x;
        data[k + 1] = o.position.y;
        data[k + 2] = o.position.z;
        data[k + 3] = o.rotation.x;
        data[k + 4] = o.rotation.y;
        data[k + 5] = o.rotation.z;
        data[k + 6] = o.scale.x;
        data[k + 7] = o.scale.y;
        data[k + 8] = o.scale.z;
        data[k + 9] = o.visible ? 1 : 0;
    });
    return { nodes, data };
}

/** Put a snapshot back on the nodes it was taken from. The rotation keeps
 *  each node's own Euler order, which `set` does not touch. */
export function applyDrawn(snap) {
    if (!snap || !snap.nodes) return false;
    const { nodes, data } = snap;
    nodes.forEach((o, i) => {
        const k = i * STRIDE;
        o.position.set(data[k], data[k + 1], data[k + 2]);
        o.rotation.set(data[k + 3], data[k + 4], data[k + 5]);
        o.scale.set(data[k + 6], data[k + 7], data[k + 8]);
        o.visible = data[k + 9] === 1;
    });
    return true;
}

/** How many nodes a snapshot holds, which is how big it is. */
export function snapshotSize(snap) {
    return snap && snap.nodes ? snap.nodes.length : 0;
}
