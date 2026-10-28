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

/**
 * The glow (Galaxy Brain). THE GLOW IS BEHIND THE HEAD, NOT IN IT (QA
 * 2026-10-28: lit from within, the skull hid under any hat or hair, and
 * bare it read as a tinted head). A `halo` disc of `color` stands `behind`
 * the head's middle, its radius from `least` to `most` by the figure's
 * `glow`, and from `rays.from` up, `rays.count` rays reach out from it to
 * `rays.least`..`rays.most`, both drawn additive so they bloom on a dark
 * backdrop. The head's own light (`intensity` times glow, reaching
 * `distance`) and the skin's `emissive` tint stay, for the face.
 */
export const GLOW = Object.freeze({
    color: 0xffd27a, intensity: 2.4, distance: 1.6, emissive: 0.7,
    halo: Object.freeze({ least: 0.2, most: 0.5, behind: 0.22, opacity: 0.95, texels: 64 }),
    rays: Object.freeze({ from: 0.5, count: 14, least: 0.4, most: 1.1, width: 0.05, opacity: 0.6 })
});

let haloMap = null;

/** The halo's soft disc, drawn in code once a session as a data texture
 *  (no picture file ships, and the preview rasterizer can read it): white,
 *  its alpha fading from the middle to the rim. */
export function haloTexture(n = GLOW.halo.texels) {
    if (haloMap) return haloMap;
    const data = new Uint8Array(n * n * 4);
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            const r = Math.hypot(((x + 0.5) / n) * 2 - 1, ((y + 0.5) / n) * 2 - 1);
            const k = Math.max(0, Math.min(1, 1 - r));
            const a = k * k * (3 - 2 * k);
            const o = (y * n + x) * 4;
            data[o] = 255;
            data[o + 1] = 255;
            data[o + 2] = 255;
            data[o + 3] = Math.round(255 * a);
        }
    }
    haloMap = new THREE.DataTexture(data, n, n);
    haloMap.needsUpdate = true;
    return haloMap;
}

/** The rays' fan: `count` thin triangles from radius `inner` to `outer`,
 *  `width` wide at the base, in the x-y plane about the origin. */
export function raysGeometry(count, inner, outer, width) {
    const pos = [];
    for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + 0.2;
        const c = Math.cos(a);
        const s = Math.sin(a);
        // The triangle's base across the ray, its tip along it.
        pos.push(c * inner - s * width, s * inner + c * width, 0);
        pos.push(c * inner + s * width, s * inner - c * width, 0);
        pos.push(c * outer, s * outer, 0);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return geometry;
}

/**
 * The glow behind a head for `glow` (0 to 1): a group holding the `halo`
 * and, from `GLOW.rays.from` up, the `rays`, facing +z, to stand at the
 * head's middle. Null for no glow.
 */
export function buildGlow(glow) {
    if (!(glow > 0)) return null;
    const G = GLOW;
    const group = new THREE.Group();
    group.name = 'glow';
    const additive = (opacity, map = null) => new THREE.MeshBasicMaterial({
        color: G.color, map, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
    });
    const radius = G.halo.least + (G.halo.most - G.halo.least) * glow;
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), additive(G.halo.opacity * Math.min(1, 0.6 + glow), haloTexture()));
    halo.name = 'halo';
    group.add(halo);
    if (glow >= G.rays.from) {
        const reach = G.rays.least + (G.rays.most - G.rays.least) * glow;
        const rays = new THREE.Mesh(raysGeometry(G.rays.count, radius * 0.6, reach, G.rays.width), additive(G.rays.opacity * glow));
        rays.name = 'rays';
        rays.position.z = -0.01;
        group.add(rays);
    }
    return group;
}

/**
 * An open box: back wall, floor, ceiling and two sides, its origin at the
 * middle of its floor and its open side toward +z. `backdrop` colors the
 * back wall; the rest take the box's own colors.
 */
export function buildBox(B, backdrop = B.wall) {
    const group = new THREE.Group();
    group.name = 'box';
    group.userData.isBox = true;
    // THE PLANES CAST AS WELL AS RECEIVE (QA 2026-10-28): the ceiling and
    // the sides keep the sun, and so a neighbor's shadow, out of the box,
    // which is lit only through its opening (config.light). A plane casts
    // from either side, so the sun's side of it never matters.
    const material = (color, roughness) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, shadowSide: THREE.DoubleSide });
    const wall = material(B.wall, 0.95);
    const back = material(backdrop, 0.95);
    const floor = material(B.floor, 0.9);
    const plane = (w, h, mat, name) => {
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
        mesh.name = name;
        mesh.receiveShadow = true;
        mesh.castShadow = true;
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
 * posed on the spec's `side`, its head turned the spec's `look` (toward the
 * leading arm when unsaid), standing `at` and turned `turn` in the box, and
 * glowing when `glow` is above zero (the halo behind the head, the head's
 * light and tint). Returns the shared figure with `undoExpression`,
 * `glow` (the halo group, or null), `glowLight` and `spec` added.
 */
export function makeFigure(avatar, spec) {
    const figure = createAvatar(avatar, { overrides: { ...expressionOverrides(spec.expression), ...(spec.overrides || {}) } });
    figure.spec = spec;
    figure.undoExpression = applyExpression(figure, spec.expression);
    // The template's side and look, never the avatar's handedness (poses.js).
    const side = spec.side || 'right';
    figure.setPose(armsFor(spec.pose, side));
    const head = figure.person.getObjectByName('head');
    if (head) head.rotation.y = headTurnFor(spec.pose, spec.look === undefined ? side : spec.look);
    figure.glow = buildGlow(spec.glow);
    if (figure.glow) {
        // Behind the head's middle, in the figure's own meters (the group
        // still stands at the origin here).
        const middle = figure.head();
        figure.glow.position.set(middle.x, middle.y, middle.z - GLOW.halo.behind);
        figure.group.add(figure.glow);
    }
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

/** Where a label pins to a figure: over its chest, `below` meters under
 *  the head's middle, in world meters. */
export function labelAnchor(figure, below) {
    const head = figure.head();
    return [head.x, head.y - below, head.z];
}

/** A world point on a `w` by `h` picture through `camera`, in pixels, or
 *  null behind it. */
export function projectPoint(point, camera, w, h) {
    camera.updateMatrixWorld(true);
    const p = new THREE.Vector3(point[0], point[1], point[2]).project(camera);
    if (p.z > 1) return null;
    return { x: ((p.x + 1) / 2) * w, y: ((1 - p.y) / 2) * h };
}

/** Where a box's opening lands on a `w` by `h` picture through `camera`:
 *  the rect round its four front corners, or null when one is behind the
 *  camera. `B` is config.box. */
export function boxRect(box, B, camera, w, h) {
    box.updateMatrixWorld(true);
    let min = [Infinity, Infinity];
    let max = [-Infinity, -Infinity];
    for (const [x, y] of [[-B.width / 2, 0], [B.width / 2, 0], [-B.width / 2, B.height], [B.width / 2, B.height]]) {
        const world = box.localToWorld(new THREE.Vector3(x, y, B.depth / 2));
        const p = projectPoint([world.x, world.y, world.z], camera, w, h);
        if (!p) return null;
        min = [Math.min(min[0], p.x), Math.min(min[1], p.y)];
        max = [Math.max(max[0], p.x), Math.max(max[1], p.y)];
    }
    return { x: min[0], y: min[1], w: max[0] - min[0], h: max[1] - min[1] };
}

/**
 * One panel: the box with its figures inside and its props (`cell.scene`,
 * built after the figures so a prop can be fitted to one), `avatarFor(roleId)`
 * giving the avatar each role wears, `mobile` for props that scale down.
 * Returns `{ group, box, figures, props, replaceFigure, tick, dispose }`.
 */
export function buildPanel(cell, config, avatarFor, { mobile = false } = {}) {
    const box = buildBox(config.box, cell.backdrop || config.box.wall);
    const figures = cell.figures.map((spec) => {
        const figure = makeFigure(avatarFor(spec.role), spec);
        box.add(figure.group);
        return figure;
    });
    const props = cell.scene && SCENES[cell.scene] ? SCENES[cell.scene](box, config, { figures, mobile }) : null;
    return {
        group: box,
        box,
        figures,
        props,
        /** Move the props that move. True when something did. */
        tick(dt) {
            if (props && props.userData && typeof props.userData.tick === 'function') {
                props.userData.tick(dt);
                return true;
            }
            return false;
        },
        /** Figure `i` built again with `changes` laid over its spec (a new
         *  expression), the old one let go. Returns the new figure. */
        replaceFigure(i, changes, avatar = avatarFor(cell.figures[i].role)) {
            const old = figures[i];
            if (!old) return null;
            old.dispose();
            const figure = makeFigure(avatar, { ...cell.figures[i], ...changes });
            box.add(figure.group);
            figures[i] = figure;
            // A prop fitted to the figure (a helmet) is fitted again.
            if (props && props.userData && typeof props.userData.fit === 'function') props.userData.fit(figure);
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
