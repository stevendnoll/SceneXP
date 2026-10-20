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

import { createPerson } from '../../shared/js/people-1.0.0.min.js';
import { FIGURE } from '../../shared/js/crowd-1.0.0.min.js';
import { jointPerson, applyPose, danceAt, danceOf, REST } from '../../shared/js/dance-1.0.0.min.js';

/** The crowd's pupils (crowd-1.0.0 draws them in this color). */
const PUPIL = 0x1c140e;

/**
 * The figure for `look` (crowd.js's look: shirt, pants, skin, hair, style,
 * scale), dressed as the crowd dresses it and jointed (dance-1.0.0's rig),
 * the soles on y = 0 as the crowd's are.
 */
export function buildDancer(look) {
    const rig = jointPerson(createPerson({
        ...FIGURE,
        shirtColor: look.shirt,
        // Long sleeves, as the crowd wears them.
        sleeveColor: look.shirt,
        pantsColor: look.pants,
        skinTone: look.skin,
        hairColor: look.hair,
        eyeColor: PUPIL,
        hairStyle: look.style || 'short',
        bald: !look.style
    }));
    rig.root.scale.setScalar(look.scale || 1);
    return rig;
}

/**
 * The dancer in the hall: hidden until `start`. Returns { group,
 * start(look, at, danceId), pose(t), stop(), dancing(), dispose }. `pose(t)`
 * takes the seconds since the dance began. One figure is kept per look, so
 * the same family dancing again builds nothing.
 */
export function createDancer() {
    const group = new THREE.Group();
    group.name = 'dancers';
    let rig = null;
    let rigKey = '';
    let at = null;
    let dance = null;

    function dispose(r) {
        if (!r) return;
        group.remove(r.root);
        r.root.traverse((o) => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) o.material.dispose();
        });
    }

    const api = {
        group,
        /** Dress the dancer as `look`, stand it at `at`, ready to dance. */
        start(look, spot, danceId) {
            const key = JSON.stringify(look);
            if (key !== rigKey) {
                dispose(rig);
                rig = buildDancer(look);
                rigKey = key;
                group.add(rig.root);
            }
            at = spot;
            dance = danceOf(danceId);
            rig.root.visible = true;
            applyPose(rig, dance ? danceAt(dance, 0) : REST, at);
        },
        pose(t) {
            if (!rig || !dance || !rig.root.visible) return;
            applyPose(rig, danceAt(dance, t), at);
        },
        stop() {
            if (rig) rig.root.visible = false;
            dance = null;
        },
        dancing: () => Boolean(rig && dance && rig.root.visible),
        /** The figure, for measuring (tests). */
        rig: () => rig,
        dispose() {
            dispose(rig);
            rig = null;
            rigKey = '';
        }
    };
    return api;
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
