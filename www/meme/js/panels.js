// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * panels.js - a meme's panels as shadowboxes (specs/meme PLANNING 5.1 and
 * 5.3): each cell of the template is an open box with a lit scene inside,
 * its figures dressed from avatars and wearing the cell's expression, and a
 * camera of its own in the box's coordinates. The composite (compose.js)
 * draws each panel through that camera; the live stage looks through it
 * too (M1), or at the whole arrangement (M2).
 *
 * THE BOX IS THE BACKDROP. Its back wall fills a cell's frame, so nothing
 * from a neighboring box shows at the edge, and a template's own color on
 * that wall is what makes a panel read at thumbnail size.
 *
 * Every figure is the shared avatar figure built with the expression's
 * overrides, then tweaked (avatar-expressions). Nothing here writes to the
 * avatar store.
 */

import { createAvatar } from '../../shared/js/avatar-figure-1.0.0.min.js';
import { expressionOverrides, applyExpression } from '../../shared/js/avatar-expressions-1.0.0.min.js';

/**
 * An open box: back wall, floor, ceiling and two sides, its origin at the
 * middle of its floor and its open side toward +z. `backdrop` colors the
 * back wall; the rest take the box's own colors.
 */
export function buildBox(B, backdrop = B.wall) {
    const group = new THREE.Group();
    group.name = 'box';
    group.userData.isBox = true;
    const wall = new THREE.MeshStandardMaterial({ color: B.wall, roughness: 0.95, metalness: 0 });
    const back = new THREE.MeshStandardMaterial({ color: backdrop, roughness: 0.95, metalness: 0 });
    const floor = new THREE.MeshStandardMaterial({ color: B.floor, roughness: 0.9, metalness: 0 });
    const plane = (w, h, material, name) => {
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
        mesh.name = name;
        mesh.receiveShadow = true;
        group.add(mesh);
        return mesh;
    };
    const backWall = plane(B.width, B.height, back, 'back');
    backWall.position.set(0, B.height / 2, -B.depth / 2);
    const bottom = plane(B.width, B.depth, floor, 'floor');
    bottom.rotation.x = -Math.PI / 2;
    const top = plane(B.width, B.depth, wall, 'ceiling');
    top.rotation.x = Math.PI / 2;
    top.position.y = B.height;
    const left = plane(B.depth, B.height, wall, 'left');
    left.rotation.y = Math.PI / 2;
    left.position.set(-B.width / 2, B.height / 2, 0);
    const right = plane(B.depth, B.height, wall, 'right');
    right.rotation.y = -Math.PI / 2;
    right.position.set(B.width / 2, B.height / 2, 0);
    return group;
}

/**
 * Where each cell's box stands in the arrangement, in meters: the grid laid
 * out on the stage with the top row highest, a box a column wide (a spanning
 * cell as wide as its span, centered on it), `gap` between, the whole
 * centered on x = 0 and standing on y = 0. Returns `[{ x, y, z }]` in cell
 * order. One cell stands at the origin.
 */
export function layoutPanels(template, B) {
    const columns = template.grid[0].reduce((n, c) => n + c.span, 0);
    const rows = template.grid.length;
    const unit = B.width + B.gap;
    const totalW = columns * B.width + (columns - 1) * B.gap;
    const out = [];
    template.grid.forEach((row, r) => {
        let col = 0;
        for (const cell of row) {
            const left = -totalW / 2 + col * unit;
            const width = cell.span * B.width + (cell.span - 1) * B.gap;
            out.push({ x: left + width / 2, y: (rows - 1 - r) * (B.height + B.gap), z: 0 });
            col += cell.span;
        }
    });
    return out;
}

/** A cell's camera in world meters, `{ eye, aim, fov }`, from its own in
 *  the box's coordinates. */
export function cellCamera(cell, box) {
    box.updateMatrixWorld(true);
    const world = (v) => box.localToWorld(new THREE.Vector3(v[0], v[1], v[2])).toArray();
    return { eye: world(cell.camera.eye), aim: world(cell.camera.aim), fov: cell.camera.fov };
}

/**
 * A figure for a cell's figure spec: the avatar built with the expression's
 * mouth, the expression's tweaks laid on, standing `at` and turned `turn`
 * in the box. Returns the shared figure with `undoExpression` added.
 */
export function makeFigure(avatar, spec) {
    const figure = createAvatar(avatar, { overrides: expressionOverrides(spec.expression) });
    figure.undoExpression = applyExpression(figure, spec.expression);
    const at = spec.at || [0, 0];
    figure.group.position.set(at[0], 0, at[1]);
    figure.group.rotation.y = spec.turn || 0;
    return figure;
}

/**
 * One panel: the box with its figures inside, `avatarFor(roleId)` giving
 * the avatar each role wears. Returns `{ group, box, figures, dispose }`.
 */
export function buildPanel(cell, config, avatarFor) {
    const box = buildBox(config.box, cell.backdrop || config.box.wall);
    const figures = cell.figures.map((spec) => {
        const figure = makeFigure(avatarFor(spec.role), spec);
        box.add(figure.group);
        return figure;
    });
    return {
        group: box,
        box,
        figures,
        dispose() {
            for (const f of figures) f.dispose();
            box.traverse((o) => {
                if (o.geometry) o.geometry.dispose();
                if (o.material && o.material.dispose) o.material.dispose();
            });
            if (box.parent) box.parent.remove(box);
        }
    };
}
