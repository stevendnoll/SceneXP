// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * scenes/wear.js - measures for things a figure wears in a panel (a medal, a
 * cloak): where the front of its chest is, on whatever build it has.
 */

/** Whether `o` is the rig's arm, leg or head, whose vertices are not the
 *  chest's. */
const limb = (o) => Boolean(o.userData && (o.userData.isArm || o.userData.isLeg || o.userData.isHead)) || o.name === 'head';

/**
 * How far forward of its middle `figure`'s chest stands, meters in the
 * figure's own frame: the most any vertex of its body reaches between heights
 * `from` and `to`, over the rig's own depth `least` (a round build stands
 * deeper than a slim one). A band and not one height, since a box-sided torso
 * has vertices only at its ends, and no arm or leg counts. Pieces are read at
 * their own positions, as the rig stacks them without turning them.
 */
export function chestFront(figure, { from = 1.0, to = 1.4, least = 0.11 } = {}) {
    let front = least;
    const walk = (o, y, z) => {
        if (limb(o)) return;
        const [py, pz] = [y + o.position.y, z + o.position.z];
        const position = o.isMesh && o.geometry && o.geometry.attributes && o.geometry.attributes.position;
        if (position) {
            for (let i = 0; i < position.count; i++) {
                const vy = position.getY(i) + py;
                if (vy >= from && vy <= to) front = Math.max(front, position.getZ(i) + pz);
            }
        }
        for (const child of o.children || []) walk(child, py, pz);
    };
    for (const child of (figure.person && figure.person.children) || []) walk(child, 0, 0);
    return front;
}
