// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * fans.js - A fan in the stands, built from the same figure as the players.
 *
 * THE SAME PERSON, BAKED. Every fan is a `createPerson` from the shared people
 * part: hair, eyes, pupils, nose, ears, neck, rounded shoulders, elbows, hands,
 * knees and shoes, the rig the players are made of. What differs is how it is
 * drawn. A player is about forty meshes, which is fine for fourteen of them and
 * impossible for a stadium: two hundred fans drawn that way is eight thousand
 * draw calls. So one fan is built, every mesh in it is baked into its place,
 * and the pieces are merged by what colour they take:
 *
 *   body   shirt, skin, trousers, and `fixed` (eyes, pupils, shoes, belt,
 *          buckle, which keep their own colours as vertex colours)
 *   hair   one merged cap per style
 *   arms   sleeve and hand, once per arm pose
 *
 * spectacle.js draws each piece as ONE InstancedMesh and tints it per fan, so
 * the whole crowd is a dozen draw calls however many fans are in it. A fan
 * cheering is the same fan drawn in the arms-up pieces instead of the arms-down
 * ones, which is a matrix moving from one mesh to another and nothing more.
 *
 * FEWER SEGMENTS, NOT FEWER PARTS. A fan's head is a few pixels across from the
 * play camera, so every sphere and cylinder is rebuilt with the segment counts
 * capped (`LIGHTER`) before it is baked. Nothing is left out. What goes is the
 * roundness nobody at that distance can see, and it is most of the vertices.
 *
 * NOTHING HERE TOUCHES THE SHARED PART. `people-1.0.0.js` is used by twelve
 * other rooms, so the fan is dressed through its own options and read back out
 * of the scene graph it returns, the way roster.js reads its arms.
 */
import { createPerson } from '../../shared/js/people-1.0.0.min.js';
import { XO_CONFIG as CFG } from './config.min.js';

/** The arm poses a fan can be drawn in. */
export const POSES = ['down', 'up', 'cards'];

/** The hair styles a fan can wear, besides none at all. */
export const HAIR = ['short', 'long', 'buzz'];

/**
 * THE COLOURS A FAN IS DRESSED IN TO FIND ITS PARTS AGAIN. Not colours anybody
 * sees: each is a tag on a material, read back after the build to sort every
 * mesh into the piece it belongs to. Everything else (the eye whites, the
 * shoes, the belt) keeps the colour the shared part gave it.
 *
 * MID-RANGE ON EVERY CHANNEL ON PURPOSE. three stores colours linear and
 * `getHex` converts back to sRGB, and near black two tags one step apart can
 * come back as the same number.
 */
export const TAG = {
    shirt: 0x20c040,
    sleeve: 0x40c020,
    pants: 0x6040c0,
    skin: 0xc06040,
    hair: 0x40a0c0,
    pupil: 0xa0c060,
};

/** The pupils are dark, and are drawn in the fixed piece in this colour. */
const PUPIL = 0x1c140e;

/** Segment caps, by what the part is. */
const LIGHTER = {
    head: { width: 10, height: 7 },
    small: { width: 5, height: 3 },
    sphere: { width: 6, height: 4 },
    radial: 6,
    torus: { radial: 4, tubular: 8 },
    curve: 2,
};

/**
 * THE ARM POSES, as the shoulder and elbow angles the shared rig takes.
 *
 *   down   the rig's own resting arms, read off it rather than written here
 *   up     both arms overhead in a V, which is what a touchdown looks like
 *   cards  forearms up in front of the face, holding a card at 500
 *
 * `z` swings an arm out to the side (times the arm's side), `x` swings it
 * forward when negative, and `fore` bends the elbow.
 */
const ARM_POSES = {
    up: { x: -0.15, z: 2.75, fore: -0.35 },
    cards: { x: -1.35, z: 0.25, fore: -1.35 },
};

const clampSegments = (value, cap) => Math.max(3, Math.min(value, cap));

/** The same primitive with its segment counts capped, or the original. */
function lighter(geometry) {
    const p = geometry.parameters;
    if (!p) return geometry;
    if (geometry.type === 'SphereGeometry') {
        const cap = p.radius >= 0.1 ? LIGHTER.head : p.radius < 0.03 ? LIGHTER.small : LIGHTER.sphere;
        return new THREE.SphereGeometry(
            p.radius, clampSegments(p.widthSegments, cap.width), clampSegments(p.heightSegments, cap.height),
            p.phiStart, p.phiLength, p.thetaStart, p.thetaLength
        );
    }
    if (geometry.type === 'CylinderGeometry') {
        return new THREE.CylinderGeometry(
            p.radiusTop, p.radiusBottom, p.height, clampSegments(p.radialSegments, LIGHTER.radial),
            1, p.openEnded, p.thetaStart, p.thetaLength
        );
    }
    if (geometry.type === 'ConeGeometry') {
        return new THREE.ConeGeometry(p.radius, p.height, clampSegments(p.radialSegments, LIGHTER.radial));
    }
    /**
     * THE ROUNDED TORSO IS AN EXTRUSION, and at the shared part's settings it
     * is half the vertices in the whole fan. Rebuilt from its own shape with
     * fewer curve and bevel steps, then moved back onto the original's centre,
     * because the part translates it after building and that is not recorded
     * in the parameters.
     */
    if (geometry.type === 'ExtrudeGeometry' && p.shapes && p.options) {
        const rebuilt = new THREE.ExtrudeGeometry(p.shapes, {
            ...p.options, curveSegments: LIGHTER.curve, bevelSegments: 1,
        });
        geometry.computeBoundingBox();
        rebuilt.computeBoundingBox();
        const was = geometry.boundingBox.getCenter(new THREE.Vector3());
        const now = rebuilt.boundingBox.getCenter(new THREE.Vector3());
        rebuilt.translate(was.x - now.x, was.y - now.y, was.z - now.z);
        return rebuilt;
    }
    if (geometry.type === 'TorusGeometry') {
        return new THREE.TorusGeometry(
            p.radius, p.tube, clampSegments(p.radialSegments, LIGHTER.torus.radial),
            clampSegments(p.tubularSegments, LIGHTER.torus.tubular), p.arc
        );
    }
    return geometry;
}

/** Whether a mesh hangs from an arm, at any depth. */
function onArm(obj, root) {
    for (let o = obj.parent; o && o !== root; o = o.parent) {
        if (o.userData && o.userData.isArm) return true;
    }
    return false;
}

/** Which piece a mesh belongs to, by the tag on its material. */
function pieceFor(mesh) {
    const hex = mesh.material && mesh.material.color ? mesh.material.color.getHex() : -1;
    if (hex === TAG.shirt) return 'shirt';
    if (hex === TAG.sleeve) return 'sleeve';
    if (hex === TAG.pants) return 'pants';
    if (hex === TAG.skin) return 'skin';
    if (hex === TAG.hair) return 'hair';
    return 'fixed';
}

/**
 * ONE MESH, BAKED: its lighter geometry moved to where it sits in the figure,
 * with only the attributes a fan is drawn with.
 */
function bake(mesh) {
    const source = lighter(mesh.geometry);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', source.attributes.position.clone());
    g.setAttribute('normal', source.attributes.normal.clone());
    if (source.index) g.setIndex(source.index.clone());
    g.applyMatrix4(mesh.matrixWorld);
    if (source !== mesh.geometry) source.dispose();
    let colour = null;
    if (mesh.material && mesh.material.color) {
        colour = mesh.material.color.getHex() === TAG.pupil ? new THREE.Color(PUPIL) : mesh.material.color.clone();
    }
    return { geometry: g, colour };
}

/**
 * MERGE BAKED PIECES INTO ONE GEOMETRY, with an index whether or not the pieces
 * had one (the rounded torso is an extrusion and does not). `lift` moves the
 * whole thing up so the soles of the shoes are at y = 0. With `vertexColours`
 * every piece keeps its own colour in a colour attribute.
 */
export function mergePieces(pieces, { lift = 0, vertexColours = false } = {}) {
    let vertices = 0;
    let indices = 0;
    for (const { geometry } of pieces) {
        const n = geometry.attributes.position.count;
        vertices += n;
        indices += geometry.index ? geometry.index.count : n;
    }
    const position = new Float32Array(vertices * 3);
    const normal = new Float32Array(vertices * 3);
    const colour = vertexColours ? new Float32Array(vertices * 3) : null;
    const index = vertices > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
    let v = 0;
    let i = 0;
    for (const { geometry, colour: c } of pieces) {
        const p = geometry.attributes.position;
        const nrm = geometry.attributes.normal;
        for (let k = 0; k < p.count; k += 1) {
            position[(v + k) * 3] = p.getX(k);
            position[(v + k) * 3 + 1] = p.getY(k) + lift;
            position[(v + k) * 3 + 2] = p.getZ(k);
            normal[(v + k) * 3] = nrm.getX(k);
            normal[(v + k) * 3 + 1] = nrm.getY(k);
            normal[(v + k) * 3 + 2] = nrm.getZ(k);
            if (colour) {
                colour[(v + k) * 3] = c ? c.r : 1;
                colour[(v + k) * 3 + 1] = c ? c.g : 1;
                colour[(v + k) * 3 + 2] = c ? c.b : 1;
            }
        }
        if (geometry.index) {
            for (let k = 0; k < geometry.index.count; k += 1) index[i + k] = geometry.index.getX(k) + v;
            i += geometry.index.count;
        } else {
            for (let k = 0; k < p.count; k += 1) index[i + k] = v + k;
            i += p.count;
        }
        v += p.count;
        geometry.dispose();
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(position, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    if (colour) merged.setAttribute('color', new THREE.BufferAttribute(colour, 3));
    merged.setIndex(new THREE.BufferAttribute(index, 1));
    merged.computeBoundingSphere();
    return merged;
}

/** A fan as the shared part builds it, at crowd scale, standing at the origin. */
function buildFigure(hairStyle) {
    const person = createPerson({
        role: 'customer',
        shirtColor: TAG.shirt,
        // Long sleeves, for the players' reason: a bare forearm under the
        // floodlights reads as a separate stick, or as nothing (see roster.js).
        sleeveColor: TAG.sleeve,
        pantsColor: TAG.pants,
        skinTone: TAG.skin,
        hairColor: TAG.hair,
        eyeColor: TAG.pupil,
        hairStyle,
        shoulderRound: 0.35,
        handScale: 1.3,
    });
    person.position.set(0, 0, 0);
    person.rotation.set(0, 0, 0);
    person.scale.setScalar(CFG.crowd.scale);
    return person;
}

function arms(person) {
    return person.children.filter((c) => c.userData && c.userData.isArm);
}

/** Put a figure's arms into `pose`, from the rig's own resting angles. */
function poseArms(person, pose, rest) {
    arms(person).forEach((arm, k) => {
        const side = arm.userData.armSide || 1;
        const angles = ARM_POSES[pose];
        arm.rotation.x = angles ? angles.x : rest[k].x;
        arm.rotation.z = angles ? side * angles.z : rest[k].z;
        if (arm.userData.forearm) arm.userData.forearm.rotation.x = angles ? angles.fore : 0;
    });
    person.updateMatrixWorld(true);
}

/** Every mesh under `root` that passes `keep`, sorted into pieces and baked. */
function collect(root, keep) {
    const out = {};
    root.traverse((obj) => {
        if (!obj.isMesh || !keep(obj)) return;
        const piece = pieceFor(obj);
        (out[piece] = out[piece] || []).push(bake(obj));
    });
    return out;
}

function lowestY(pieces) {
    let low = Infinity;
    for (const list of Object.values(pieces)) {
        for (const { geometry } of list) {
            const p = geometry.attributes.position;
            for (let k = 0; k < p.count; k += 1) low = Math.min(low, p.getY(k));
        }
    }
    return low;
}

/**
 * THE FAN, IN PIECES, ready to instance. Built once per visit.
 *
 *   body.shirt / body.skin / body.pants   tinted per fan
 *   body.fixed                             vertex coloured
 *   hair[style]                            tinted per fan
 *   arms[pose].sleeve / arms[pose].hand    tinted per fan
 *   eyeHeight, top                         metres above the soles, at crowd scale
 *
 * Returns null where there is no real geometry to read (the test stub).
 */
export function buildFanParts() {
    const probe = new THREE.SphereGeometry(1, 3, 2);
    const real = probe.attributes && probe.attributes.position
        && ArrayBuffer.isView(probe.attributes.position.array);
    if (probe.dispose) probe.dispose();
    if (!real) return null;

    const person = buildFigure('short');
    person.updateMatrixWorld(true);
    const rest = arms(person).map((a) => ({ x: a.rotation.x, z: a.rotation.z }));

    const body = collect(person, (m) => !onArm(m, person) && pieceFor(m) !== 'hair');
    const lift = -lowestY(body);

    const parts = {
        body: {
            shirt: mergePieces(body.shirt || [], { lift }),
            skin: mergePieces(body.skin || [], { lift }),
            pants: mergePieces(body.pants || [], { lift }),
            fixed: mergePieces(body.fixed || [], { lift, vertexColours: true }),
        },
        hair: {},
        arms: {},
        eyeHeight: 0,
        top: 0,
    };

    for (const pose of POSES) {
        poseArms(person, pose, rest);
        const limb = collect(person, (m) => onArm(m, person));
        parts.arms[pose] = {
            sleeve: mergePieces([...(limb.sleeve || []), ...(limb.shirt || [])], { lift }),
            hand: mergePieces(limb.skin || [], { lift }),
        };
    }

    for (const style of HAIR) {
        const figure = buildFigure(style);
        figure.updateMatrixWorld(true);
        parts.hair[style] = mergePieces(collect(figure, (m) => pieceFor(m) === 'hair').hair || [], { lift });
    }

    // Where the face is, read off the head itself: the largest skin sphere.
    let head = null;
    person.traverse((obj) => {
        if (obj.isMesh && pieceFor(obj) === 'skin' && obj.geometry.type === 'SphereGeometry'
            && (!head || obj.geometry.parameters.radius > head.geometry.parameters.radius)) head = obj;
    });
    if (head) {
        const at = new THREE.Vector3().setFromMatrixPosition(head.matrixWorld);
        const r = head.geometry.parameters.radius * CFG.crowd.scale;
        parts.eyeHeight = at.y + lift;
        parts.top = at.y + r + lift;
    }
    return parts;
}

/** Vertices and triangles in one fan as drawn in one pose, for the budget. */
export function fanCost(parts, pose = 'down', hair = 'short') {
    const list = [...Object.values(parts.body), parts.hair[hair], parts.arms[pose].sleeve, parts.arms[pose].hand];
    let vertices = 0;
    let triangles = 0;
    for (const g of list) {
        vertices += g.attributes.position.count;
        triangles += g.index.count / 3;
    }
    return { vertices, triangles };
}
