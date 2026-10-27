// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * crowd.js - a crowd made of the shared person, baked to be drawn cheaply.
 *
 * PROMOTED FROM www/xo/js/fans.js on 2026-10-19 for Derby Day's community
 * hall, which needed a crowd and three families from the same figure. X's
 * and O's runs on it through its own thin fans.js, with the settings it had
 * (every option here defaults to X's and O's).
 *
 * THE SAME PERSON, BAKED. Every member is a `createPerson` from
 * people-1.0.0: hair, eyes, pupils, nose, ears, neck, rounded shoulders,
 * elbows, hands, knees and shoes. What differs is how it is drawn. A person
 * is about forty meshes, which is fine for a handful and impossible for a
 * crowd: two hundred people drawn that way is eight thousand draw calls. So
 * one person is built, every mesh in it is baked into its place, and the
 * pieces are merged by what colour they take:
 *
 *   body   shirt, skin, trousers, and `fixed` (eyes, pupils, shoes, belt,
 *          buckle, which keep their own colours as vertex colours)
 *   hair   one merged cap per style
 *   arms   sleeve and hand, once per arm pose
 *
 * A scene draws each piece as ONE InstancedMesh and tints it per member, so
 * the whole crowd is a dozen draw calls however many are in it. A member
 * cheering is the same member drawn in the arms-up pieces instead of the
 * arms-down ones: a matrix moving from one mesh to another and nothing more.
 * `hands` says where each pose puts the two hands, for a scene to set a prop
 * in them (Derby Day's signs, megaphone and thermos).
 *
 * FEWER SEGMENTS, NOT FEWER PARTS. A member's head is a few pixels across at
 * a crowd's distance, so every sphere and cylinder is rebuilt with its
 * segment counts capped (`LIGHTER`) before it is baked. Nothing is left out.
 *
 * NOTHING HERE TOUCHES people-1.0.0. The figure is dressed through its own
 * options and read back out of the scene graph it returns.
 *
 * ALSO HERE, from www/derby (2026-10-20), for any scene's crowd: more arm
 * poses (ARM_POSES), the cheers (`CHEERS`, `pickCheers`, `cheerAt`) and a
 * clap (`clapAt`), all pure; and `createCrowdView`, the instanced drawing
 * with each member posed by the scene, props in hand, and members stepping
 * aside for a dancer (dance-1.0.0) to stand in. X's and O's keeps its own
 * drawing and its own three poses, unchanged.
 */
import { createPerson } from './people-1.0.0.min.js';

/** The hair styles a member can wear, besides none at all. */
export const HAIR = Object.freeze(['short', 'long', 'buzz']);

/**
 * THE COLOURS A MEMBER IS DRESSED IN TO FIND ITS PARTS AGAIN. Not colours
 * anybody sees: each is a tag on a material, read back after the build to
 * sort every mesh into the piece it belongs to. Everything else (the eye
 * whites, the shoes, the belt) keeps the colour the shared part gave it.
 *
 * MID-RANGE ON EVERY CHANNEL ON PURPOSE. three stores colours linear and
 * `getHex` converts back to sRGB, and near black two tags one step apart can
 * come back as the same number.
 */
export const TAG = Object.freeze({
    shirt: 0x20c040,
    sleeve: 0x40c020,
    pants: 0x6040c0,
    skin: 0xc06040,
    hair: 0x40a0c0,
    pupil: 0xa0c060
});

/** The pupils are dark, and are drawn in the fixed piece in this colour. */
const PUPIL = 0x1c140e;

/** Segment caps, by what the part is. */
const LIGHTER = {
    head: { width: 10, height: 7 },
    small: { width: 5, height: 3 },
    sphere: { width: 6, height: 4 },
    radial: 6,
    torus: { radial: 4, tubular: 8 },
    curve: 2
};

/**
 * THE ARM POSES a crowd can be drawn in, as the shoulder and elbow angles
 * the shared rig takes. `down` is the rig's own resting arms, read off it.
 * `z` swings an arm out to the side (times the arm's side), `x` swings it
 * forward when negative, and `fore` bends the elbow.
 *
 *   up        both arms overhead in a V, a touchdown or a heat won
 *   cards     forearms up in front of the face, holding a card (X's and O's)
 *   clap      hands together in front, below the chin
 *   apart     the clap's arms with the hands a shoulder's width apart: a
 *             clap is `clap` and `apart` swapped a few times a second
 *   hold      arms raised nearly straight and a little forward, the hands
 *             0.57 m apart just over the head: holding a sign up
 *   holdLow   the same grip at the chest, held out in front: a sign
 *             pumped from `hold` to here and back
 *   roof      elbows in, hands up at the shoulders, palms up: raise the roof
 *   clapHigh  the hands together high over the head
 *   flex      upper arms out level, forearms up: the strongman
 *   point     both arms out ahead and up
 *
 * The rig bends an elbow only forward, so an arm turned forward first
 * (x -1.57) bends it upward instead (roof, flex). A scene bakes only the
 * poses it names (`buildCrowdParts({ poses })`): each is two draw calls.
 * apart to point came from www/derby (2026-10-19 and 20), every hand
 * measured against real three in tests/shared-crowd.test.mjs.
 */
export const ARM_POSES = Object.freeze({
    up: Object.freeze({ x: -0.15, z: 2.75, fore: -0.35 }),
    cards: Object.freeze({ x: -1.35, z: 0.25, fore: -1.35 }),
    // Measured against real three: the hands meet 0.04 m apart (touching),
    // a little below the chin.
    clap: Object.freeze({ x: -0.95, z: -0.55, fore: -1.25 }),
    apart: Object.freeze({ x: -0.95, z: -0.1, fore: -1.25 }),
    hold: Object.freeze({ x: -0.15, z: 3.0, fore: -0.6 }),
    // Searched against real three for hold's grip (0.56 of its 0.57 m) at
    // the chest.
    holdLow: Object.freeze({ x: -0.9, z: 0.15, fore: -0.9 }),
    roof: Object.freeze({ x: -1.57, z: 0.75, fore: -2.35 }),
    clapHigh: Object.freeze({ x: -0.1, z: 3.42, fore: -0.3 }),
    flex: Object.freeze({ x: -1.57, z: 1.57, fore: -1.65 }),
    point: Object.freeze({ x: -2.05, z: 0.3, fore: 0 })
});

/** X's and O's poses, the defaults. */
export const POSES = Object.freeze(['down', 'up', 'cards']);

/** X's and O's figure, the default dressing beyond the tags. */
export const FIGURE = Object.freeze({ role: 'customer', shoulderRound: 0.35, handScale: 1.3 });

const clampSegments = (value, cap) => Math.max(3, Math.min(value, cap));

/** The same primitive with its segment counts capped, or the original. */
export function lighter(geometry) {
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
     * is half the vertices in the whole figure. Rebuilt from its own shape
     * with fewer curve and bevel steps, then moved back onto the original's
     * centre, because the part translates it after building and that is not
     * recorded in the parameters.
     */
    if (geometry.type === 'ExtrudeGeometry' && p.shapes && p.options) {
        const rebuilt = new THREE.ExtrudeGeometry(p.shapes, {
            ...p.options, curveSegments: LIGHTER.curve, bevelSegments: 1
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

/** The rig's hand (a palm, four fingers and a thumb since 2026-10-26, some
 *  hundreds of triangles) as the crowd draws it: one block the size of the
 *  hand's box, twelve triangles. A crowd member is a few pixels tall; nobody
 *  can see its fingers, and a thousand of them is a thousand hands. The box
 *  reaches exactly where the hand's own box does, so a fan is the figure's
 *  size to the millimeter. */
export function handStandIn(geometry) {
    geometry.computeBoundingBox();
    const b = geometry.boundingBox;
    const g = new THREE.BoxGeometry(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z);
    g.translate((b.max.x + b.min.x) / 2, (b.max.y + b.min.y) / 2, (b.max.z + b.min.z) / 2);
    return g;
}

/** ONE MESH, BAKED: its lighter geometry moved to where it sits in the
 *  figure, with only the attributes a crowd is drawn with. A hand is the
 *  stand-in box unless `realHands` (the rig's fingered hand, for the few
 *  members who stand near the camera: Steve's QA, 2026-10-26, the derby's
 *  families' hands read as flat paddles up close). */
function bake(mesh, { realHands = false } = {}) {
    const source = mesh.userData.isHand && !realHands ? handStandIn(mesh.geometry) : lighter(mesh.geometry);
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
 * MERGE BAKED PIECES INTO ONE GEOMETRY, with an index whether or not the
 * pieces had one (the rounded torso is an extrusion and does not). `lift`
 * moves the whole thing up so the soles of the shoes are at y = 0. With
 * `vertexColours` every piece keeps its own colour in a colour attribute.
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

/** A member as the shared part builds it, at `scale`, at the origin. */
function buildFigure(hairStyle, scale, figure) {
    const person = createPerson({
        ...figure,
        shirtColor: TAG.shirt,
        // Long sleeves: a bare forearm at a distance reads as a separate
        // stick, or as nothing (X's and O's roster.js).
        sleeveColor: TAG.sleeve,
        pantsColor: TAG.pants,
        skinTone: TAG.skin,
        hairColor: TAG.hair,
        eyeColor: TAG.pupil,
        hairStyle
    });
    person.position.set(0, 0, 0);
    person.rotation.set(0, 0, 0);
    person.scale.setScalar(scale);
    return person;
}

function arms(person) {
    return person.children.filter((c) => c.userData && c.userData.isArm);
}

/** Put a figure's arms into `pose`, from the rig's own resting angles. */
function poseArms(person, pose, rest, armPoses) {
    arms(person).forEach((arm, k) => {
        const side = arm.userData.armSide || 1;
        const angles = armPoses[pose];
        arm.rotation.x = angles ? angles.x : rest[k].x;
        arm.rotation.z = angles ? side * angles.z : rest[k].z;
        if (arm.userData.forearm) arm.userData.forearm.rotation.x = angles ? angles.fore : 0;
    });
    person.updateMatrixWorld(true);
}

/** Every mesh under `root` that passes `keep`, sorted into pieces and baked. */
function collect(root, keep, options = {}) {
    const out = {};
    root.traverse((obj) => {
        if (!obj.isMesh || !keep(obj)) return;
        const piece = pieceFor(obj);
        (out[piece] = out[piece] || []).push(bake(obj, options));
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

/** Where each hand is in the pose now: the skin mesh on each arm furthest
 *  from its shoulder, as [x, y, z] with `lift`. */
function handsOf(person, lift) {
    return arms(person).map((arm) => {
        const shoulder = new THREE.Vector3().setFromMatrixPosition(arm.matrixWorld);
        let best = null;
        let far = -1;
        arm.traverse((obj) => {
            if (!obj.isMesh || pieceFor(obj) !== 'skin') return;
            const at = new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld);
            const d = at.distanceTo(shoulder);
            if (d > far) {
                far = d;
                best = at;
            }
        });
        return best ? [best.x, best.y + lift, best.z] : [0, 0, 0];
    });
}

/**
 * THE CROWD, IN PIECES, ready to instance. Built once per visit.
 *
 *   body.shirt / body.skin / body.pants   tinted per member
 *   body.fixed                             vertex coloured
 *   hair[style]                            tinted per member
 *   arms[pose].sleeve / arms[pose].hand    tinted per member
 *   arms[pose].fingers                     with `realHands`: the rig's own
 *                                          fingered hands, for a member whose
 *                                          look says `hands: 'real'`
 *   hands[pose]                            [[x, y, z], [x, y, z]], each arm's hand
 *   eyeHeight, top                         metres above the soles
 *
 * `scale` sizes the figure, `poses` names the arm poses to bake ('down' and
 * any of `armPoses`), `figure` adds createPerson options. `realHands` also
 * bakes the fingered hands (some 1,100 triangles a pair against the box's
 * 24), for a scene whose few near members would show the box. Returns null
 * where there is no real geometry to read (the test stub).
 */
export function buildCrowdParts({ scale = 1, poses = POSES, armPoses = ARM_POSES, hair = HAIR, figure = FIGURE, realHands = false } = {}) {
    const probe = new THREE.SphereGeometry(1, 3, 2);
    const real = probe.attributes && probe.attributes.position
        && ArrayBuffer.isView(probe.attributes.position.array);
    if (probe.dispose) probe.dispose();
    if (!real) return null;

    const person = buildFigure('short', scale, figure);
    person.updateMatrixWorld(true);
    const rest = arms(person).map((a) => ({ x: a.rotation.x, z: a.rotation.z }));

    const body = collect(person, (m) => !onArm(m, person) && pieceFor(m) !== 'hair');
    const lift = -lowestY(body);

    const parts = {
        body: {
            shirt: mergePieces(body.shirt || [], { lift }),
            skin: mergePieces(body.skin || [], { lift }),
            pants: mergePieces(body.pants || [], { lift }),
            fixed: mergePieces(body.fixed || [], { lift, vertexColours: true })
        },
        hair: {},
        arms: {},
        hands: {},
        eyeHeight: 0,
        top: 0
    };

    for (const pose of poses) {
        poseArms(person, pose, rest, armPoses);
        const limb = collect(person, (m) => onArm(m, person));
        parts.arms[pose] = {
            sleeve: mergePieces([...(limb.sleeve || []), ...(limb.shirt || [])], { lift }),
            hand: mergePieces(limb.skin || [], { lift })
        };
        if (realHands) {
            const fingered = collect(person, (m) => onArm(m, person) && m.userData.isHand, { realHands: true });
            parts.arms[pose].fingers = mergePieces(fingered.skin || [], { lift });
        }
        parts.hands[pose] = handsOf(person, lift);
    }

    for (const style of hair) {
        const member = buildFigure(style, scale, figure);
        member.updateMatrixWorld(true);
        parts.hair[style] = mergePieces(collect(member, (m) => pieceFor(m) === 'hair').hair || [], { lift });
    }

    // Where the face is, read off the head itself: the largest skin sphere.
    let head = null;
    person.traverse((obj) => {
        if (obj.isMesh && pieceFor(obj) === 'skin' && obj.geometry.type === 'SphereGeometry'
            && (!head || obj.geometry.parameters.radius > head.geometry.parameters.radius)) head = obj;
    });
    if (head) {
        const at = new THREE.Vector3().setFromMatrixPosition(head.matrixWorld);
        const r = head.geometry.parameters.radius * scale;
        parts.eyeHeight = at.y + lift;
        parts.top = at.y + r + lift;
    }
    return parts;
}

/** Vertices and triangles in one member as drawn in one pose, for a budget
 *  (with the fingered hands, where they are baked and `realHands` asks). */
export function crowdCost(parts, pose = 'down', hair = 'short', { realHands = false } = {}) {
    const arm = parts.arms[pose];
    const list = [...Object.values(parts.body), parts.hair[hair], arm.sleeve, realHands && arm.fingers ? arm.fingers : arm.hand];
    let vertices = 0;
    let triangles = 0;
    for (const g of list) {
        vertices += g.attributes.position.count;
        triangles += g.index.count / 3;
    }
    return { vertices, triangles };
}

// ---- Cheering ---------------------------------------------------------------

/**
 * CHEERS: how a cheering member moves, for any crowd baked in the poses
 * each names (www/derby's families after a heat, 2026-10-20: "the cheering
 * after each heat is too repetitive"). Pure choreography.
 *
 *   jump      arms up in a V, jumping                  (up)
 *   clapHigh  clapping high over the head, a bounce    (clapHigh, up)
 *   roof      raising the roof, pushing up and up      (roof, up)
 *   flex      the strongman, swaying side to side      (flex)
 *   point     both arms out ahead, bouncing            (point)
 *   wave      arms up one after another along a group, and round again,
 *             by each member's `rank`                  (up, clap)
 *   sway      arms up, swaying slowly                  (up)
 */
export const CHEERS = Object.freeze(['jump', 'clapHigh', 'roof', 'flex', 'point', 'wave', 'sway']);

/** The arm poses `cheerAt` uses, for a scene to bake (plus 'down'). */
export const CHEER_POSES = Object.freeze(['up', 'clap', 'clapHigh', 'roof', 'flex', 'point']);

/** A cheer for each of `count` moments from `rand` (a function giving 0 to
 *  1), none the same as the one before it, and the first not `last`. Pure. */
export function pickCheers(count, rand, last = null) {
    const out = [];
    let prev = last;
    for (let i = 0; i < count; i++) {
        const pool = CHEERS.filter((c) => c !== prev);
        prev = pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
        out.push(prev);
    }
    return out;
}

/**
 * How a member moves in cheer `id` at second `t`: { pose, hop, lean }, the
 * hop a share of the scene's own hop height, the lean a sway from the feet
 * in radians. `phase` puts each member on its own beat; `rank` is its
 * place along its group (the wave). `still` (reduced motion) holds each
 * cheer in its own first pose, no hop and no sway. Pure.
 */
export function cheerAt(id, { t = 0, phase = 0, rank = 0, still = false } = {}) {
    const wave = (rate) => (still ? 0 : Math.sin((t + phase) * rate));
    const beat = (rate) => Math.max(0, wave(rate));
    switch (id) {
    case 'clapHigh':
        return { pose: still || wave(19) >= 0 ? 'clapHigh' : 'up', hop: beat(19) * 0.25, lean: 0 };
    case 'roof':
        return { pose: still || wave(8) >= 0 ? 'roof' : 'up', hop: beat(8) * 0.4, lean: 0 };
    case 'flex':
        return { pose: 'flex', hop: 0, lean: 0.12 * wave(4) };
    case 'point':
        return { pose: 'point', hop: beat(12) * 0.5, lean: 0 };
    case 'wave': {
        if (still) return { pose: 'up', hop: 0, lean: 0 };
        const u = (((t * 1.6 - rank * 0.28) % 1) + 1) % 1;
        return u < 0.45 ? { pose: 'up', hop: Math.sin((u / 0.45) * Math.PI) * 0.7, lean: 0 } : { pose: 'clap', hop: 0, lean: 0 };
    }
    case 'sway':
        return { pose: 'up', hop: 0, lean: 0.18 * wave(3.4) };
    default:
        return { pose: 'up', hop: beat(11), lean: 0 };
    }
}

/**
 * A cheer for a member HOLDING SOMETHING UP in both hands (a sign, a banner,
 * www/derby's kid, 2026-10-20: "the kid holding the sign seems too similar
 * after each heat"). The hands never leave it, so each cheer is a move they
 * can make together: { pose ('hold' or 'holdLow'), hop, lean (the whole
 * figure, the prop leaning with it), pitch (the prop tipped toward the front
 * about the line between the hands, so the hands stay on it) }. Every cheer
 * its own move, so a held sign never does the same thing two cheers running.
 *
 *   jump      raised high, jumping
 *   clapHigh  pumped fast, overhead to the chest and back
 *   roof      pumped slowly, with a big bounce
 *   flex      shaken, a quick rock side to side
 *   point     tipped toward the front, again and again
 *   wave      waved overhead, a lean one way and the other
 *   sway      swayed slowly at the chest
 */
export function heldCheerAt(id, { t = 0, phase = 0, still = false } = {}) {
    const wave = (rate) => (still ? 0 : Math.sin((t + phase) * rate));
    const beat = (rate) => Math.max(0, wave(rate));
    const held = (pose, hop = 0, lean = 0, pitch = 0) => ({ pose, hop, lean, pitch });
    if (still) return held(id === 'sway' ? 'holdLow' : 'hold');
    switch (id) {
    case 'clapHigh':
        return held(wave(10) >= 0 ? 'hold' : 'holdLow', beat(10) * 0.25);
    case 'roof':
        return held(wave(5) >= 0 ? 'hold' : 'holdLow', beat(5) * 0.6);
    case 'flex':
        return held('hold', 0, 0.07 * wave(22));
    case 'point':
        return held('hold', beat(6) * 0.3, 0, 0.45 * beat(6));
    case 'wave':
        return held('hold', 0, 0.22 * wave(3.6));
    case 'sway':
        return held('holdLow', 0, 0.14 * wave(2.2));
    default:
        return held('hold', beat(11));
    }
}

/** The arm poses `heldCheerAt` uses, for a scene to bake. */
export const HELD_POSES = Object.freeze(['hold', 'holdLow']);

/** A clapping member's arms at second `t`: 'clap' (together) or 'apart',
 *  swapped `rate` radians a second on its own `phase`; under `still`
 *  (reduced motion), together. Bake both. Pure. */
export function clapAt(t, { phase = 0, rate = 15, still = false } = {}) {
    return !still && Math.sin((t + phase) * rate) < 0 ? 'apart' : 'clap';
}

// ---- Drawing ----------------------------------------------------------------

/**
 * A CROWD ON SCREEN: up to `capacity` members drawn from `parts`
 * (buildCrowdParts', baked in `poses`), every piece one InstancedMesh tinted
 * per member, so the whole crowd is a dozen draw calls and two more a pose.
 * Promoted from www/derby (2026-10-20); X's and O's draws its stands its own
 * way and is not on it.
 *
 * THE SCENE SAYS HOW EACH STANDS: `poseOf(member, moment, index)` returns
 * { pose, hop, lean, pitch } for whatever `moment` the scene passes to
 * `pose` (pitch tips a held prop toward the front, heldCheerAt); a member
 * is redrawn only when that changes. `hop` is a share of `hopHeight`
 * meters, `lean` a sway from the feet. A member is { look: { shirt, pants,
 * skin, hair, style (or null), scale, hands }, at: { x, y, z, ry }, ... }
 * with anything else the scene's own. A look's `hands: 'real'` draws the
 * rig's fingered hands in place of the box, where the parts were baked
 * with `realHands` (the derby's families, who stand by the camera).
 *
 * PROPS: `propFor(member)` gives { mesh, pose, hand ('right' or 'both'),
 * made (things to dispose) } or null; the mesh is set in the hand the pose
 * puts it, every redraw. `grip(pose)` tells a scene how far apart a pose's
 * hands are, to make a sign to fit them.
 *
 * STEPPING ASIDE: `stepAside(indices, { drop })` draws those members as
 * nobody (a dancer, say, stands in for each, dance-1.0.0), their props going
 * with them, except those in `drop`, left where they were for the scene to
 * move (`propOf`). `stepAside(-1)` brings everyone back.
 *
 * Returns { group, ready, parts, set(members, moment), pose(moment),
 * stepAside, propOf, grip, dispose }. Without real geometry to read (the
 * test stub), `ready` is false and every call is safe.
 */
export function createCrowdView({ parts, poses, poseOf, propFor = () => null, hopHeight = 0.07, capacity = 160, name = 'crowd' }) {
    const group = new THREE.Group();
    group.name = name;
    const none = { group, ready: false, parts: null, set() {}, pose() {}, stepAside() {}, propOf: () => null, grip: () => 0, dispose() {} };
    if (!parts) return none;
    const made = [];
    const lit = (vertexColors = false) => {
        const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, vertexColors });
        made.push(m);
        return m;
    };
    const instanced = (geometry, vertexColors = false) => {
        const mesh = new THREE.InstancedMesh(geometry, lit(vertexColors), capacity);
        mesh.count = 0;
        // A crowd spreads wide: one bounding sphere for a piece would cull
        // the far members.
        mesh.frustumCulled = false;
        group.add(mesh);
        made.push(geometry);
        return mesh;
    };
    const body = Object.fromEntries(Object.entries(parts.body).map(([k, g]) => [k, instanced(g, k === 'fixed')]));
    const hair = Object.fromEntries(Object.keys(parts.hair).map((s) => [s, instanced(parts.hair[s])]));
    const arms = Object.fromEntries(poses.map((p) => [p, {
        sleeve: instanced(parts.arms[p].sleeve),
        hand: instanced(parts.arms[p].hand),
        fingers: parts.arms[p].fingers ? instanced(parts.arms[p].fingers) : null
    }]));
    const pieces = [...Object.values(body), ...Object.values(hair), ...poses.flatMap((p) => [arms[p].sleeve, arms[p].hand, ...(arms[p].fingers ? [arms[p].fingers] : [])])];
    const realHands = (m) => m.look.hands === 'real';
    const props = new THREE.Group();
    group.add(props);

    let members = [];
    let propMade = [];
    let aside = new Set();
    let dropped = new Set();
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const qLean = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3(0, 0, 1);
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const colour = (h) => new THREE.Color(h);

    function matrixOf(m, hop, lean) {
        q.setFromAxisAngle(up, m.at.ry || 0);
        // A sway side to side, from the feet.
        if (lean) q.multiply(qLean.setFromAxisAngle(side, lean));
        v.set(m.at.x, m.at.y + hop * hopHeight, m.at.z);
        sc.setScalar(m.look.scale || 1);
        return m4.compose(v, q, sc);
    }

    function clearProps() {
        for (const p of props.children.slice()) props.remove(p);
        for (const m of propMade) m.dispose();
        propMade = [];
    }

    const grip = (pose) => {
        const [a, b] = parts.hands[pose];
        return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    };

    const api = {
        group,
        ready: true,
        parts,
        grip,
        /** These members, dressed, and posed for `moment` at once: a member
         *  left unposed until the next frame would stand at the origin. */
        set(list, moment = {}) {
            members = list.slice(0, capacity).map((m) => ({ ...m, _pose: null, _hop: -1, _lean: 0, _pitch: 0, _away: false, _dropped: false }));
            aside = new Set();
            dropped = new Set();
            for (const mesh of pieces) mesh.count = members.length;
            clearProps();
            members.forEach((m, i) => {
                const L = m.look;
                body.shirt.setColorAt(i, colour(L.shirt));
                body.skin.setColorAt(i, colour(L.skin));
                body.pants.setColorAt(i, colour(L.pants));
                for (const p of poses) {
                    arms[p].sleeve.setColorAt(i, colour(L.shirt));
                    arms[p].hand.setColorAt(i, colour(L.skin));
                    if (arms[p].fingers) arms[p].fingers.setColorAt(i, colour(L.skin));
                }
                for (const s of Object.keys(hair)) hair[s].setColorAt(i, colour(L.hair));
                const prop = propFor(m);
                if (prop) {
                    m._prop = prop;
                    props.add(prop.mesh);
                    propMade.push(...(prop.made || []));
                }
            });
            for (const mesh of pieces) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
            api.pose(moment);
        },
        pose(moment) {
            let dirty = false;
            members.forEach((m, i) => {
                const p = poseOf(m, moment, i);
                const lean = p.lean || 0;
                const pitch = p.pitch || 0;
                const away = aside.has(i);
                const left = dropped.has(i);
                if (p.pose === m._pose && Math.abs(p.hop - m._hop) < 0.01 && Math.abs(lean - m._lean) < 0.002 && Math.abs(pitch - m._pitch) < 0.002 && away === m._away && left === m._dropped) return;
                m._pose = p.pose;
                m._hop = p.hop;
                m._lean = lean;
                m._pitch = pitch;
                m._away = away;
                m._dropped = left;
                dirty = true;
                const mat = away ? zero : matrixOf(m, p.hop, lean);
                for (const k of Object.keys(body)) body[k].setMatrixAt(i, mat);
                for (const s of Object.keys(hair)) hair[s].setMatrixAt(i, m.look.style === s ? mat : zero);
                // The hands: the box, or the fingered pair where the look
                // asks and the pose has them baked.
                const fingered = realHands(m);
                for (const pose of poses) {
                    const on = pose === p.pose;
                    const real = on && fingered && Boolean(arms[pose].fingers);
                    arms[pose].sleeve.setMatrixAt(i, on ? mat : zero);
                    arms[pose].hand.setMatrixAt(i, on && !real ? mat : zero);
                    if (arms[pose].fingers) arms[pose].fingers.setMatrixAt(i, real ? mat : zero);
                }
                const prop = m._prop;
                if (!prop) return;
                // A prop goes with its member, unless it was left behind;
                // away, a prop left behind is the scene's to move.
                prop.mesh.visible = !away || left;
                if (away) return;
                const [a, b] = parts.hands[p.pose];
                const at = prop.hand === 'right' ? (a[0] < b[0] ? a : b) : [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
                // In the hands, leaning as the figure leans (from the feet),
                // tipped about the line between the hands.
                v.set(at[0], at[1], at[2]).multiplyScalar(m.look.scale || 1);
                if (lean) v.applyAxisAngle(side, lean);
                v.applyAxisAngle(up, m.at.ry || 0);
                prop.mesh.position.set(m.at.x + v.x, m.at.y + v.y + p.hop * hopHeight, m.at.z + v.z);
                prop.mesh.rotation.order = 'YZX';
                prop.mesh.rotation.set(pitch, m.at.ry || 0, lean);
                prop.mesh.scale.setScalar(m.look.scale || 1);
            });
            if (!dirty) return;
            for (const mesh of pieces) mesh.instanceMatrix.needsUpdate = true;
        },
        stepAside(index, { drop = [] } = {}) {
            aside = new Set(Array.isArray(index) ? index : index >= 0 ? [index] : []);
            dropped = new Set(drop.filter((i) => aside.has(i)));
        },
        propOf(index) {
            const m = members[index];
            return m && m._prop ? m._prop.mesh : null;
        },
        dispose() {
            clearProps();
            for (const m of made) m.dispose();
        }
    };
    return api;
}
