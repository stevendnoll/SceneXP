// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * scenes/plan.js - the props of The Plan (template 7): a flip chart on an
 * easel beside the figure, a white sheet in a dark frame, the caption drawn
 * over the panel standing in for what is written on it. Generic (PRD
 * section 7): an easel is an easel.
 */

/** The chart's measures, meters: the sheet `w` by `h` at `at` (its middle),
 *  tipped back `lean` radians, on two legs. */
export const CHART = Object.freeze({
    at: Object.freeze([-0.55, 1.25, -0.1]), w: 0.82, h: 0.66, depth: 0.03, lean: 0.12,
    frame: 0x2a2d31, sheet: 0xfbfaf6, leg: 0x6b5a48, legR: 0.012
});

/** The easel and its chart in `box` (a shadowbox group). Returns the group. */
export function build(box) {
    const C = CHART;
    const group = new THREE.Group();
    group.name = 'plan';
    const frame = new THREE.Mesh(new THREE.BoxGeometry(C.w, C.h, C.depth), new THREE.MeshStandardMaterial({ color: C.frame, roughness: 0.7 }));
    frame.name = 'frame';
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(C.w * 0.92, C.h * 0.9), new THREE.MeshStandardMaterial({ color: C.sheet, roughness: 0.95 }));
    sheet.name = 'sheet';
    sheet.position.z = C.depth / 2 + 0.001;
    const board = new THREE.Group();
    board.name = 'board';
    board.add(frame);
    board.add(sheet);
    board.position.set(C.at[0], C.at[1], C.at[2]);
    board.rotation.x = -C.lean;
    group.add(board);
    const legMat = new THREE.MeshStandardMaterial({ color: C.leg, roughness: 0.8 });
    const legH = C.at[1] + C.h / 2;
    for (const dx of [-C.w * 0.42, C.w * 0.42]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(C.legR, C.legR, legH, 8), legMat);
        leg.name = 'leg';
        leg.position.set(C.at[0] + dx, legH / 2, C.at[2] - C.depth);
        leg.rotation.x = -C.lean;
        group.add(leg);
    }
    group.traverse((o) => {
        if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
        }
    });
    box.add(group);
    return group;
}
