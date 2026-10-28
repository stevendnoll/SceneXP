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
 *     tags on the head group: the eyes scaled about their own middles, the
 *     irises and pupils with them, a sleepy lid hidden for an eye thrown
 *     open. Every tweak returns an `undo`, so an editor can switch faces on
 *     one figure without building another.
 *
 * Nothing here writes to the avatar store, and nothing reaches outside the
 * head group. The avatar page's own saved face is `none`.
 *
 * M1 (the meme's first panel) ships `none` and `shocked`. M2 adds rage,
 * smug, deadpan, crying, side-eye, one raised brow, sweat and the big grin.
 */

import { withOverrides } from './avatar-1.0.0.min.js';

/** Every expression, in the order a picker shows them. `none` is the saved
 *  face, untouched. */
export const EXPRESSIONS = Object.freeze([
    { id: 'none', label: 'As saved' },
    { id: 'shocked', label: 'Shocked' }
]);

/**
 * The tweaks each expression makes on a built face, as factors on the rig's
 * own sizes (so an eye shape already wide gets wider still, and the lens on
 * it stays a lens): `eyes` scales the whites across and up, `pupils` the
 * iris and pupil on each (small pupils in a wide eye read as shock), and
 * `openLids` hides a sleepy eye's lid.
 */
export const EXPRESSION_SIZE = Object.freeze({
    shocked: Object.freeze({ eyes: 1.3, pupils: 0.75, openLids: true })
});

/** The avatar fields an expression sets before the figure is built. */
const OVERRIDES = Object.freeze({
    shocked: Object.freeze({ mouth: 'surprised' })
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
    const scaleBy = (o, k) => {
        changed.push({ o, scale: { x: o.scale.x, y: o.scale.y, z: o.scale.z } });
        o.scale.x *= k;
        o.scale.y *= k;
    };
    for (const o of head.children) {
        if (o.userData.isEye && spec.eyes) scaleBy(o, spec.eyes);
        if ((o.userData.isIris || o.userData.isPupil) && spec.pupils) scaleBy(o, spec.pupils);
        if (o.name === 'lid' && spec.openLids) {
            changed.push({ o, visible: o.visible });
            o.visible = false;
        }
    }
    let undone = false;
    return () => {
        if (undone) return;
        undone = true;
        for (const c of changed) {
            if (c.scale) c.o.scale.set(c.scale.x, c.scale.y, c.scale.z);
            if (c.visible !== undefined) c.o.visible = c.visible;
        }
    };
}
