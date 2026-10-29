// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * scenes/plan.js - the props of The Plan (template 7): a flip chart on an
 * easel beside the figure, on the camera's right (Steve, 2026-10-28: where
 * the board usually is), a white sheet in a dark frame, the caption drawn
 * over the panel standing in for what is written on it. Generic (PRD
 * section 7): an easel is an easel.
 */

/** The chart's measures, meters: the sheet `w` by `h` at `at` (its middle),
 *  tipped back `lean` radians, on two legs. Big enough to carry the
 *  panel's caption (Steve, 2026-10-28: the words go on the board). */
export const CHART = Object.freeze({
    at: Object.freeze([0.48, 1.3, -0.1]), w: 0.96, h: 0.8, depth: 0.03, lean: 0.12,
    frame: 0x2a2d31, sheet: 0xfbfaf6, leg: 0x6b5a48, legR: 0.012, sheetShare: Object.freeze([0.92, 0.9])
});

/** The sheet's four corners in the box's own meters (the board's lean
 *  applied), for a caption drawn on it (panels.js `propRects`). */
export function sheetCorners(C = CHART) {
    const hw = (C.w * C.sheetShare[0]) / 2;
    const hh = (C.h * C.sheetShare[1]) / 2;
    const z = C.depth / 2 + 0.001;
    const out = [];
    for (const [x, y] of [[-hw, hh], [hw, hh], [hw, -hh], [-hw, -hh]]) {
        // A turn of -lean about x: the top tips back.
        const c = Math.cos(-C.lean);
        const s = Math.sin(-C.lean);
        out.push([C.at[0] + x, C.at[1] + y * c - z * s, C.at[2] + y * s + z * c]);
    }
    return out;
}

/** The easel and its chart in `box` (a shadowbox group). Returns the group. */
export function build(box) {
    const C = CHART;
    const group = new THREE.Group();
    group.name = 'plan';
    const frame = new THREE.Mesh(new THREE.BoxGeometry(C.w, C.h, C.depth), new THREE.MeshStandardMaterial({ color: C.frame, roughness: 0.7 }));
    frame.name = 'frame';
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(C.w * C.sheetShare[0], C.h * C.sheetShare[1]), new THREE.MeshStandardMaterial({ color: C.sheet, roughness: 0.95 }));
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
    // The sheet is a surface a caption can be drawn on (templates.js: a
    // caption slot `{ prop: 'board' }`).
    group.userData.surfaces = { board: sheetCorners(C) };
    box.add(group);
    return group;
}
