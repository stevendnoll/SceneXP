// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * dancer.js - the day's winning grown-up, dancing after the last heat
 * (Steve, 2026-10-20). The dances and the jointing are shared
 * (shared/js/dance-1.0.0.js, promoted from here the same day); this is
 * what is Derby Day's own: dressing a crowd member as the dancer, who in a
 * family dances, and the dancer in the hall.
 *
 * THE CROWD CANNOT DANCE. It is baked (crowd-1.0.0): each member is a
 * matrix over a few shared pieces, and its arms are one of a few poses
 * baked in advance, so a member can only snap from one to another. A dance
 * needs every joint free, so the member who dances steps out of the crowd
 * (crowd.js `stepAside`) and this figure takes its place: the shared person
 * from people-1.0.0, dressed as the member was, standing where it stood,
 * about forty draw calls for the few seconds it is on screen.
 */

import { FIGURE } from '../../shared/js/crowd-1.0.0.min.js';
import { createDancers, dressedPerson, buildDancer as buildSharedDancer } from '../../shared/js/dance-1.0.0.min.js';

/** The crowd's pupils (crowd-1.0.0 draws them in this color). */
const PUPIL = 0x1c140e;

/** The crowd's own dressing: its figure and its pupils' color. */
const dress = (look) => dressedPerson(look, { ...FIGURE, eyeColor: PUPIL });

/**
 * The figure for `look` (crowd.js's look: shirt, pants, skin, hair, style,
 * scale), dressed as the crowd dresses it and jointed (dance-1.0.0's rig),
 * the soles on y = 0 as the crowd's are. Baked to a mesh a joint unless
 * `bake` is false (the tests that measure single parts).
 */
export function buildDancer(look, { bake = true } = {}) {
    return buildSharedDancer(look, { dress, bake });
}

/** The dancers in the hall (dance-1.0.0 createDancers), dressed as the
 *  crowd is: slot 0 the day's winner's grown-up; in a winning finale, 1 the
 *  kid and 2 to 4 dancers on the bleachers. */
export function createDancer({ bake = true } = {}) {
    return createDancers({ dress, bake });
}

/**
 * Who dances in a family: its grown-up (Steve, 2026-10-20), the first one
 * not holding anything if there is one, so a sign or a camcorder is not
 * left hanging in the air. `members` is the family's list ({ look, prop });
 * a kid is drawn at a child's scale. Returns an index, or -1.
 */
export function dancerOf(members, kidScale) {
    const grownUps = members.map((m, i) => ({ m, i })).filter(({ m }) => m.look.scale > kidScale);
    if (!grownUps.length) return -1;
    const free = grownUps.find(({ m }) => !m.prop);
    return (free || grownUps[0]).i;
}
