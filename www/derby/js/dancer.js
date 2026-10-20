// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * dancer.js - one member of the crowd, drawn whole so it can dance
 * (dances.js has the dances).
 *
 * THE CROWD CANNOT DANCE. It is baked (crowd-1.0.0): each member is a
 * matrix over a few shared pieces, and its arms are one of a few poses
 * baked in advance, so a member can only snap from one to another. A dance
 * needs every joint free, so the member who dances steps out of the crowd
 * (crowd.js `stepAside`) and this figure takes its place: the shared person
 * from people-1.0.0, dressed as the member was, standing where it stood,
 * about forty draw calls for the few seconds it is on screen.
 *
 * A WAIST AND A NECK OF ITS OWN. The shared rig hangs its arms at the
 * shoulders and its legs at the hips, and nothing else bends: the head and
 * the torso are the person's own children. This figure wraps everything but
 * the legs in a waist at the hips, and everything above the neck's base in
 * a neck, each child kept exactly where it was (tests/derby-dance.test.mjs
 * measures that against real three). The rig itself is untouched: what is
 * found is found by the rig's own tags (isArm, isLeg, forearm) and by where
 * each child is drawn, never by its order.
 *
 * THE ARMS TURN TWIST FIRST. An arm's rotation order is XZY here, so `y`
 * (a twist along the arm, which turns the way the elbow bends) happens
 * before the swing out and the swing forward. With no twist it is the very
 * rotation the crowd's baked poses use.
 */

import { createPerson } from '../../shared/js/people-1.0.0.min.js';
import { FIGURE } from '../../shared/js/crowd-1.0.0.min.js';
import { danceAt, danceOf, REST } from './dances.min.js';

/** The crowd's pupils (crowd-1.0.0 draws them in this color). */
const PUPIL = 0x1c140e;

/** The shared rig's measurements: the hips, and the neck's base (the top
 *  of the torso), and anything drawn above this is the head's. */
export const RIG = Object.freeze({ hip: 0.75, neck: 1.33, headFrom: 1.36 });

/** The middle of what a child draws, in the figure's own space, or null. */
function middleY(obj) {
    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) return null;
    return (box.min.y + box.max.y) / 2;
}

/**
 * The figure for `look` (crowd.js's look: shirt, pants, skin, hair, style),
 * jointed. Returns { root, person, waist, neck, arms: { L, R }, legs: { L, R } }
 * with the soles on y = 0, as the crowd's are. The rig's side +1 is the
 * figure's left (it faces +z).
 */
export function buildDancer(look) {
    const person = createPerson({
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
    });
    person.position.set(0, 0, 0);
    person.rotation.set(0, 0, 0);
    const arms = {};
    const legs = {};
    for (const c of person.children) {
        const u = c.userData || {};
        if (u.isArm) arms[u.armSide > 0 ? 'L' : 'R'] = c;
        if (u.isLeg) legs[u.legSide > 0 ? 'L' : 'R'] = c;
    }

    const waist = new THREE.Group();
    waist.name = 'waist';
    waist.position.y = RIG.hip;
    const neck = new THREE.Group();
    neck.name = 'neck';
    neck.position.y = RIG.neck - RIG.hip;
    // What the head is, read before anything moves: every child that is not
    // a limb and is drawn above the neck's base.
    person.updateMatrixWorld(true);
    const head = person.children.filter((c) => !c.userData.isArm && !c.userData.isLeg && (middleY(c) ?? 0) > RIG.headFrom);
    for (const c of person.children.slice()) {
        if (c.userData.isLeg) continue;
        person.remove(c);
        if (head.includes(c)) {
            c.position.y -= RIG.neck;
            neck.add(c);
        } else {
            c.position.y -= RIG.hip;
            waist.add(c);
        }
    }
    waist.add(neck);
    person.add(waist);
    for (const limb of [...Object.values(arms), ...Object.values(legs)]) limb.rotation.order = 'XZY';

    const root = new THREE.Group();
    root.name = 'dancer';
    root.rotation.order = 'YXZ';
    root.add(person);
    // The soles on the floor, as the crowd stands (it lifts its pieces by
    // their lowest point the same way).
    person.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(person);
    person.position.y = box.isEmpty() ? 0.055 : -box.min.y;
    root.scale.setScalar(look.scale || 1);
    return { root, person, waist, neck, arms, legs };
}

/** Put a jointed figure (buildDancer's) in `p` (a dances.js pose), standing
 *  at `at` ({ x, y, z, ry }). */
export function applyPose(rig, p, at = { x: 0, y: 0, z: 0, ry: 0 }) {
    const s = rig.root.scale.x;
    const ry = at.ry || 0;
    const c = Math.cos(ry);
    const n = Math.sin(ry);
    // A step is the dancer's own: turned with the way it faces.
    rig.root.position.set(at.x + (p.root.x * c + p.root.z * n) * s, at.y + p.root.y * s, at.z + (p.root.z * c - p.root.x * n) * s);
    rig.root.rotation.set(p.root.rx, ry + p.root.ry, p.root.rz);
    rig.waist.rotation.set(p.waist.x, p.waist.y, p.waist.z);
    rig.neck.rotation.set(p.neck.x, p.neck.y, p.neck.z);
    for (const [k, side] of [['L', 1], ['R', -1]]) {
        const arm = rig.arms[k];
        const a = p[`arm${k}`];
        if (arm) {
            arm.rotation.set(a.x, side * a.y, side * a.z);
            if (arm.userData.forearm) arm.userData.forearm.rotation.x = a.fore;
        }
        const leg = rig.legs[k];
        const l = p[`leg${k}`];
        if (leg) leg.rotation.set(l.x, 0, side * l.z);
    }
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
