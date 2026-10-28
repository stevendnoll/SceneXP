// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * avatar-expressions.js - a face for the moment (specs/meme PLANNING 5.2,
 * 2026-10-27): what an avatar's face does in one scene without the saved
 * avatar changing. A saved avatar should look like the person; a meme face,
 * a celebration or a wince is a moment laid over it.
 *
 * AN EXPRESSION IS TWO THINGS, AND NEITHER IS SURGERY ON THE FACE:
 *
 *  1. OVERRIDES the figure is built with (`expressionOverrides`): the mouth
 *     the figure part already draws (a shocked face is the "surprised" mouth,
 *     and the figure part raises the brows for that mouth by itself). The
 *     figure is built once per panel anyway, so the face is right from its
 *     first frame, with nothing rebuilt or cut.
 *  2. TWEAKS on the built figure (`applyExpression`), found by the rig's own
 *     tags and the figure part's names on the head group: the eyes scaled
 *     about their own middles, the irises and pupils with them or slid to a
 *     corner, a sleepy lid hidden for an eye thrown open, each brow turned
 *     or lifted about its own middle (on a pivot, never by editing its
 *     geometry), the mouth flattened or turned over about its own middle,
 *     and a tear or a drop of sweat added. Every tweak returns an `undo`,
 *     so an editor can switch faces on one figure without building another.
 *
 * Nothing here writes to the avatar store, and nothing reaches outside the
 * head group. The avatar page's own saved face is `none`.
 *
 * M1 (2026-10-27) shipped `none` and `shocked`; M2 the rest.
 */

import { withOverrides } from './avatar-1.0.0.min.js';

/** Every expression, in the order a picker shows them. `none` is the saved
 *  face, untouched. */
export const EXPRESSIONS = Object.freeze([
    { id: 'none', label: 'As saved' },
    { id: 'shocked', label: 'Shocked' },
    { id: 'rage', label: 'Rage' },
    { id: 'smug', label: 'Smug' },
    { id: 'deadpan', label: 'Deadpan' },
    { id: 'crying', label: 'Crying' },
    { id: 'sideEye', label: 'Side-eye' },
    { id: 'raisedBrow', label: 'One brow raised' },
    { id: 'sweat', label: 'Sweating' },
    { id: 'bigGrin', label: 'Big grin' }
]);

/** The rig's head radius, meters: a drop laid on the face sits on it. */
export const HEAD_R = 0.12;

/**
 * The tweaks each expression makes on a built face, as factors on the rig's
 * own sizes (so an eye shape already wide gets wider still, and the lens on
 * it stays a lens):
 *
 *   eyes       scales the whites across and up (one number, or [across, up])
 *   pupils     scales the iris and the pupil on each eye
 *   pupilShift slides both lenses toward the figure's left, meters (side-eye)
 *   openLids   hides a sleepy eye's lid
 *   browTilt   turns each brow about its middle, radians, the inner end
 *              down when positive (anger) and up when negative (worry)
 *   browLift   lifts a brow, meters: { left, right } (the figure's own)
 *   mouthFlat  squashes the mouth to this share of its height, about its
 *              middle (a line for deadpan)
 *   mouthFlip  turns the mouth over about its middle (a smile to a frown)
 *   tears      a tear under each eye
 *   sweat      drops on the forehead and temple
 */
export const EXPRESSION_SIZE = Object.freeze({
    shocked: Object.freeze({ eyes: 1.3, pupils: 0.75, openLids: true }),
    rage: Object.freeze({ eyes: Object.freeze([1.05, 0.72]), browTilt: 0.5 }),
    smug: Object.freeze({ eyes: Object.freeze([1, 0.6]), browTilt: 0.12 }),
    deadpan: Object.freeze({ eyes: Object.freeze([1, 0.72]), mouthFlat: 0.22 }),
    crying: Object.freeze({ mouthFlip: true, browTilt: -0.4, tears: true }),
    sideEye: Object.freeze({ eyes: Object.freeze([1, 0.8]), pupilShift: 0.0055 }),
    raisedBrow: Object.freeze({ eyes: Object.freeze([1, 0.85]), browLift: Object.freeze({ left: 0.007, right: -0.0015 }) }),
    sweat: Object.freeze({ browTilt: -0.3, mouthFlat: 0.3, sweat: true }),
    bigGrin: Object.freeze({ eyes: Object.freeze([1, 0.85]) })
});

/** The avatar fields an expression sets before the figure is built. */
const OVERRIDES = Object.freeze({
    shocked: Object.freeze({ mouth: 'surprised' }),
    rage: Object.freeze({ mouth: 'grin' }),
    smug: Object.freeze({ mouth: 'smirk' }),
    deadpan: Object.freeze({ mouth: 'smile' }),
    crying: Object.freeze({ mouth: 'smile' }),
    sideEye: Object.freeze({ mouth: 'smirk' }),
    raisedBrow: Object.freeze({ mouth: 'smirk' }),
    sweat: Object.freeze({ mouth: 'smile' }),
    bigGrin: Object.freeze({ mouth: 'bigSmile' })
});

/** The tears and the drops: a small ball stretched tall, `r` across, in a
 *  watery blue, `below` an eye's middle for a tear; the sweat `at` [x, y]
 *  on the forehead and the temple, laid on the head's sphere. */
export const DROP_SIZE = Object.freeze({
    r: 0.004, stretch: Object.freeze([1, 1.9, 0.7]), color: 0x8fc4ee, opacity: 0.85,
    tearBelow: 0.028,
    sweatAt: Object.freeze([Object.freeze([0.055, 0.058]), Object.freeze([0.068, 0.032]), Object.freeze([-0.048, 0.066])])
});

/** The expression `id` names, or `none` for one this version does not know. */
export function expressionOf(id) {
    return EXPRESSIONS.find((e) => e.id === id) || EXPRESSIONS[0];
}

/** The overrides for `createAvatar` (its `overrides` option) that give a
 *  figure this expression's mouth: `{}` for `none` or an unknown id. */
export function expressionOverrides(id) {
    return { ...(OVERRIDES[expressionOf(id).id] || {}) };
}

/** `avatar` wearing the expression's overrides, made valid. */
export function withExpression(avatar, id) {
    return withOverrides(avatar, expressionOverrides(id));
}

/** The head group of a built figure (avatar-figure's `createAvatar` result),
 *  or of any object that holds one, or null. */
function headOf(figure) {
    if (!figure) return null;
    const root = figure.person || figure.group || figure;
    if (typeof root.getObjectByName !== 'function') return null;
    return root.name === 'head' ? root : root.getObjectByName('head');
}

/** The middle of a mesh's or a group's own vertices, in its parent's
 *  coordinates (the figure part builds a face piece about the head's
 *  middle with its vertices where they are, so a piece's own position is
 *  zero and its middle is in its geometry). */
export function middleOf(object) {
    let min = [Infinity, Infinity, Infinity];
    let max = [-Infinity, -Infinity, -Infinity];
    const take = (mesh) => {
        const p = mesh.geometry && mesh.geometry.attributes && mesh.geometry.attributes.position;
        if (!p) return;
        for (let i = 0; i < p.count; i++) {
            const v = [p.getX(i) + mesh.position.x, p.getY(i) + mesh.position.y, p.getZ(i) + mesh.position.z];
            min = min.map((m, k) => Math.min(m, v[k]));
            max = max.map((m, k) => Math.max(m, v[k]));
        }
    };
    if (object.isMesh) take(object);
    else for (const child of object.children || []) if (child.isMesh) take(child);
    if (min[0] === Infinity) return null;
    return { x: (min[0] + max[0]) / 2, y: (min[1] + max[1]) / 2, z: (min[2] + max[2]) / 2 };
}

/** A drop of water on the face at `[x, y, z]` in the head's coordinates. */
function drop(name, at, material) {
    const D = DROP_SIZE;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(D.r, 10, 8), material);
    mesh.scale.set(D.stretch[0], D.stretch[1], D.stretch[2]);
    mesh.position.set(at[0], at[1], at[2]);
    mesh.name = name;
    mesh.castShadow = false;
    return mesh;
}

/**
 * Lay an expression's tweaks over a built figure's face. Returns `undo()`,
 * which puts back exactly what was changed (and nothing for `none`, an
 * unknown id, or a figure with no head to find). Safe to call again after
 * undoing, and undoing twice is nothing.
 */
export function applyExpression(figure, id) {
    const spec = EXPRESSION_SIZE[expressionOf(id).id];
    const head = headOf(figure);
    if (!spec || !head) return () => {};
    const changed = [];
    const remember = (o) => {
        changed.push({ o, position: { x: o.position.x, y: o.position.y, z: o.position.z }, scale: { x: o.scale.x, y: o.scale.y, z: o.scale.z }, visible: o.visible });
    };
    const added = [];
    const pivots = [];
    const eyes = head.children.filter((o) => o.userData.isEye);
    const lenses = head.children.filter((o) => o.userData.isIris || o.userData.isPupil);
    const brows = head.getObjectByName('brows');
    const mouth = head.getObjectByName('mouth');

    if (spec.eyes) {
        const [sx, sy] = Array.isArray(spec.eyes) ? spec.eyes : [spec.eyes, spec.eyes];
        for (const e of eyes) {
            remember(e);
            e.scale.x *= sx;
            e.scale.y *= sy;
        }
    }
    if (spec.pupils || spec.pupilShift) {
        for (const l of lenses) {
            remember(l);
            if (spec.pupils) {
                l.scale.x *= spec.pupils;
                l.scale.y *= spec.pupils;
            }
            if (spec.pupilShift) l.position.x += spec.pupilShift;
        }
    }
    if (spec.openLids) {
        for (const lid of head.children.filter((o) => o.name === 'lid')) {
            remember(lid);
            lid.visible = false;
        }
    }
    if (brows && (spec.browTilt || spec.browLift)) {
        for (const brow of brows.children.slice()) {
            const c = middleOf(brow);
            if (!c) continue;
            const side = c.x >= 0 ? 'left' : 'right';
            const sign = side === 'left' ? 1 : -1;
            // A pivot at the brow's middle, the brow hung from it, so a turn
            // or a lift is about the brow itself.
            const pivot = new THREE.Group();
            pivot.name = 'brow-pivot';
            pivot.position.set(c.x, c.y, c.z);
            brows.add(pivot);
            pivot.add(brow);
            brow.position.set(-c.x, -c.y, -c.z);
            pivots.push({ brow, pivot, parent: brows });
            if (spec.browTilt) pivot.rotation.z = sign * spec.browTilt;
            if (spec.browLift && spec.browLift[side]) pivot.position.y += spec.browLift[side];
        }
    }
    if (mouth && (spec.mouthFlat || spec.mouthFlip)) {
        const c = middleOf(mouth);
        if (c) {
            remember(mouth);
            const s = spec.mouthFlip ? -1 : spec.mouthFlat;
            // Scaled about its own middle: the group scales about the head's
            // middle, so the middle is moved back to where it was.
            mouth.scale.y *= s;
            mouth.position.y += c.y * (1 - s);
        }
    }
    if (spec.tears || spec.sweat) {
        const D = DROP_SIZE;
        const water = new THREE.MeshStandardMaterial({ color: D.color, roughness: 0.2, transparent: true, opacity: D.opacity });
        if (spec.tears) {
            for (const e of eyes) {
                const y = e.position.y - D.tearBelow;
                const z = Math.sqrt(Math.max(0, HEAD_R * HEAD_R - e.position.x * e.position.x - y * y)) + D.r * 0.4;
                added.push(drop('tear', [e.position.x, y, z], water));
            }
        }
        if (spec.sweat) {
            for (const [x, y] of D.sweatAt) {
                const z = Math.sqrt(Math.max(0, HEAD_R * HEAD_R - x * x - y * y)) + D.r * 0.4;
                added.push(drop('sweat', [x, y, z], water));
            }
        }
        for (const d of added) head.add(d);
    }

    let undone = false;
    return () => {
        if (undone) return;
        undone = true;
        for (const c of changed) {
            c.o.position.set(c.position.x, c.position.y, c.position.z);
            c.o.scale.set(c.scale.x, c.scale.y, c.scale.z);
            c.o.visible = c.visible;
        }
        for (const { brow, pivot, parent } of pivots) {
            parent.add(brow);
            brow.position.set(0, 0, 0);
            parent.remove(pivot);
        }
        for (const d of added) {
            head.remove(d);
            d.geometry.dispose();
        }
        if (added.length) added[0].material.dispose();
    };
}
