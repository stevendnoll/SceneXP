// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * panels.js - a meme's panels as shadowboxes (specs/meme PLANNING 5.1 and
 * 5.3): each cell of the template is an open box with a lit scene inside,
 * its figures dressed from avatars, posed, and wearing the cell's
 * expression, and a camera of its own in the box's coordinates. The
 * composite (compose.js) draws each panel through that camera; the live
 * stage looks at the whole arrangement or glides into one.
 *
 * THE BOX IS THE BACKDROP. Its back wall fills a cell's frame, so nothing
 * from a neighboring box shows at the edge, and a template's own color on
 * that wall is what makes a panel read at thumbnail size. A cell with no
 * figures is a plain wall for a caption (the text cells of Panic / Calm).
 *
 * Every figure is the shared avatar figure built with the expression's
 * overrides and the figure's own (a slim build, a buff one), then tweaked
 * (avatar-expressions), posed (poses.js), and lit from within for a glow
 * (Galaxy Brain). Nothing here writes to the avatar store.
 */

import { createAvatar } from '../../shared/js/avatar-figure-1.0.0.min.js';
import { expressionOverrides, applyExpression } from '../../shared/js/avatar-expressions-1.0.0.min.js';
import { armsFor, headTurnFor } from './poses.min.js';
import { SCENES } from './scenes/index.min.js';

/** The glow (Galaxy Brain): the head's own light, `color` at `intensity`
 *  times the figure's `glow`, reaching `distance`, and the head's skin lit
 *  from within by `emissive` of it. */
export const GLOW = Object.freeze({ color: 0xffd27a, intensity: 2.4, distance: 1.6, emissive: 0.55 });

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

/** The boxes' span, meters: `columns` across and `rows` up, `gap` between. */
export function arrangementSize(template, B) {
    const columns = template.grid[0].reduce((n, c) => n + c.span, 0);
    const rows = template.grid.length;
    return {
        columns,
        rows,
        width: columns * B.width + (columns - 1) * B.gap,
        height: rows * B.height + (rows - 1) * B.gap
    };
}

/**
 * Where each cell's box stands in the arrangement, in meters: the grid laid
 * out on the stage with the top row highest, a box a column wide (a spanning
 * cell as wide as its span, centered on it), `gap` between, the whole
 * centered on x = 0 and standing on y = 0. Returns `[{ x, y, z }]` in cell
 * order. One cell stands at the origin.
 */
export function layoutPanels(template, B) {
    const { width, rows } = arrangementSize(template, B);
    const unit = B.width + B.gap;
    const out = [];
    template.grid.forEach((row, r) => {
        let col = 0;
        for (const cell of row) {
            const left = -width / 2 + col * unit;
            const cellW = cell.span * B.width + (cell.span - 1) * B.gap;
            out.push({ x: left + cellW / 2, y: (rows - 1 - r) * (B.height + B.gap), z: 0 });
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
 * mouth and the spec's own `overrides`, the expression's tweaks laid on,
 * posed, its head turned, standing `at` and turned `turn` in the box, and
 * glowing when `glow` is above zero. Returns the shared figure with
 * `undoExpression`, `glowLight` and `spec` added.
 */
export function makeFigure(avatar, spec) {
    const figure = createAvatar(avatar, { overrides: { ...expressionOverrides(spec.expression), ...(spec.overrides || {}) } });
    figure.spec = spec;
    figure.undoExpression = applyExpression(figure, spec.expression);
    figure.setPose(armsFor(spec.pose, figure.avatar.handedness));
    const head = figure.person.getObjectByName('head');
    if (head) head.rotation.y = headTurnFor(spec.pose, figure.avatar.handedness);
    const at = spec.at || [0, 0];
    figure.group.position.set(at[0], 0, at[1]);
    figure.group.rotation.y = spec.turn || 0;
    figure.glowLight = null;
    if (spec.glow > 0 && head) {
        const skull = head.children.find((o) => o.userData.isHead);
        if (skull) {
            // The head's own skin, lit from within: a material of its own,
            // so the arms and the legs keep the shared one.
            skull.material = skull.material.clone();
            skull.material.emissive = new THREE.Color(GLOW.color);
            skull.material.emissiveIntensity = GLOW.emissive * spec.glow;
        }
        const light = new THREE.PointLight(GLOW.color, GLOW.intensity * spec.glow, GLOW.distance, 1.5);
        light.name = 'glow';
        light.position.set(0, 0.1, 0.1);
        head.add(light);
        figure.glowLight = light;
    }
    return figure;
}

/**
 * One panel: the box with its props (`cell.scene`) and its figures inside,
 * `avatarFor(roleId)` giving the avatar each role wears. Returns
 * `{ group, box, figures, props, dispose }`.
 */
export function buildPanel(cell, config, avatarFor) {
    const box = buildBox(config.box, cell.backdrop || config.box.wall);
    const props = cell.scene && SCENES[cell.scene] ? SCENES[cell.scene](box, config) : null;
    const figures = cell.figures.map((spec) => {
        const figure = makeFigure(avatarFor(spec.role), spec);
        box.add(figure.group);
        return figure;
    });
    return {
        group: box,
        box,
        figures,
        props,
        /** Figure `i` built again with `changes` laid over its spec (a new
         *  expression), the old one let go. Returns the new figure. */
        replaceFigure(i, changes, avatar = avatarFor(cell.figures[i].role)) {
            const old = figures[i];
            if (!old) return null;
            old.dispose();
            const figure = makeFigure(avatar, { ...cell.figures[i], ...changes });
            box.add(figure.group);
            figures[i] = figure;
            return figure;
        },
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
