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
import { jointPerson, applyPose, bakeJoints, blendPoses, danceAt, danceOf, REST } from '../../shared/js/dance-1.0.0.min.js';

/** The crowd's pupils (crowd-1.0.0 draws them in this color). */
const PUPIL = 0x1c140e;

/** One material for every baked dancer (vertex colored). */
let SHARED = null;
const sharedMaterial = () => (SHARED ||= new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, vertexColors: true }));

/**
 * The figure for `look` (crowd.js's look: shirt, pants, skin, hair, style,
 * scale), dressed as the crowd dresses it and jointed (dance-1.0.0's rig),
 * the soles on y = 0 as the crowd's are. Baked to a mesh a joint unless
 * `bake` is false (the tests that measure single parts).
 */
export function buildDancer(look, { bake = true } = {}) {
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
    if (bake) bakeJoints(rig, { material: sharedMaterial() });
    rig.root.scale.setScalar(look.scale || 1);
    return rig;
}

/**
 * The dancers in the hall, hidden until they start: one in a slot (slot 0
 * the day's winner's grown-up; in a winning finale, 1 the kid and 2 to 4
 * dancers on the bleachers). Returns { group, prepare(slot, look),
 * start(look, at, danceId, { slot, intro }), pose(t), stop(), dancing(),
 * rig(slot), dispose }. `pose(t)` takes the seconds since the dances began;
 * every slot dances on the same clock, so a duet is in step. `intro` is
 * { pose, seconds }: a pose to ease out of into the dance (the kid's sign
 * held up, before it is thrown down). A slot keeps its figure while the
 * look is the same, so the same family dancing again builds nothing.
 */
export function createDancer({ bake = true } = {}) {
    const group = new THREE.Group();
    group.name = 'dancers';
    const slots = new Map();

    function release(slot) {
        const s = slots.get(slot);
        if (!s) return;
        group.remove(s.rig.root);
        s.rig.root.traverse((o) => {
            if (o.geometry) o.geometry.dispose();
            if (o.material && o.material !== SHARED) o.material.dispose();
        });
        slots.delete(slot);
    }

    /** The slot's figure for `look`, built only when the look changes. */
    function prepare(slot, look) {
        const key = JSON.stringify(look);
        const s = slots.get(slot);
        if (s && s.key === key) return s;
        release(slot);
        const rig = buildDancer(look, { bake });
        rig.root.visible = false;
        group.add(rig.root);
        const made = { rig, key, at: null, dance: null, intro: null };
        slots.set(slot, made);
        return made;
    }

    function poseOf(s, t) {
        const p = danceAt(s.dance, t);
        if (!s.intro || t >= s.intro.seconds) return p;
        // Ease out of the intro's pose into where the dance will be.
        const f = Math.max(0, t) / s.intro.seconds;
        return blendPoses(s.intro.pose, danceAt(s.dance, s.intro.seconds), f * f * (3 - 2 * f));
    }

    const api = {
        group,
        prepare: (slot, look) => prepare(slot, look).rig,
        /** Dress a slot's dancer as `look`, stand it at `spot`, ready. */
        start(look, spot, danceId, { slot = 0, intro = null } = {}) {
            const s = prepare(slot, look);
            s.at = spot;
            s.dance = danceOf(danceId);
            s.intro = intro;
            s.rig.root.visible = Boolean(s.dance);
            applyPose(s.rig, s.dance ? poseOf(s, 0) : REST, spot);
        },
        pose(t) {
            for (const s of slots.values()) if (s.dance && s.rig.root.visible) applyPose(s.rig, poseOf(s, t), s.at);
        },
        stop() {
            for (const s of slots.values()) {
                s.rig.root.visible = false;
                s.dance = null;
            }
        },
        dancing: () => [...slots.values()].some((s) => s.dance && s.rig.root.visible),
        /** How many are dancing now. */
        count: () => [...slots.values()].filter((s) => s.dance && s.rig.root.visible).length,
        /** A slot's figure, for measuring (tests). */
        rig: (slot = 0) => (slots.get(slot) ? slots.get(slot).rig : null),
        /** The dance a slot is dancing, by id. */
        danceIn: (slot = 0) => (slots.get(slot) && slots.get(slot).dance ? slots.get(slot).dance.id : null),
        dispose() {
            for (const slot of [...slots.keys()]) release(slot);
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
