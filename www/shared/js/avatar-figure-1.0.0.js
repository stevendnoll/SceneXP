// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * avatar-figure.js - the visitor's avatar as a figure (specs/avatar PLANNING
 * 2.2): the shared person rig dressed from an avatar (avatar-1.0.0), with the
 * pieces the rig does not draw, a wave, and its round portrait.
 *
 * THE RIG DOES THE BODY. `createPerson` builds the figure from the avatar's
 * settings (avatar-1.0.0's `personConfig`), and this part adds what it has no
 * option for, found by the rig's own tags (`userData.isHead`, `isSkirt`), never
 * by matching a radius. So people-1.0.0 grows only its tags, and every scene
 * already built on it is untouched.
 *
 * THE SMILE AND THE WAVE ARE MAYA'S (www/whitestone/js/cast.js), promoted
 * here with Steve's leave on 2026-10-23 (PRD section 11, question 3): the rig
 * has no mouth, so without one a face looks blank in a portrait. Her lips are
 * a rose a little deeper than her skin, and every skin tone gets the same
 * tint of its own (`lipsColor`).
 *
 * THE PORTRAIT IS DRAWN ON THE PAGE'S OWN CANVAS. A render target in three
 * r186 is drawn in linear color with no tone mapping, so a portrait read back
 * from one comes out darker and harsher than the figure on screen. Instead
 * `renderPortrait` draws a small square into a corner of the renderer's own
 * canvas, copies it out in the same task (before the browser shows the
 * canvas), and puts the viewport back. The caller draws its scene again
 * straight after, so the square is never seen. One WebGL context, not two.
 *
 * THE PIECES (M5, 2026-10-24): glasses, facial hair, hats and sneakers, each
 * checked by eye with scripts/avatar-preview.mjs and measured against the
 * real three.js. Hats are FITTED to the hair under them, so every hat fits
 * every hair style by construction. `DRAWN` can hold back the options of a
 * piece added to the lists before its figure is ready; the editor offers
 * only what is drawn.
 *
 * Every number a scene might tune is a named constant at the top of its block.
 */

import {
    personConfig, withOverrides, optionOf, normalizeAvatar, validPortraitSrc,
    SKINS, HAIR_COLORS, SHIRTS, SHOE_COLORS, LIP_COLORS
} from './avatar-1.0.0.min.js';
import { createPerson } from './people-1.0.0.min.js';

/**
 * The portrait's render version. Bump it whenever the figure's look changes,
 * so a portrait drawn before is drawn again (PLANNING 3.5): /avatar/ and the
 * scenes compare it with the one stored. 2 (2026-10-24): the pieces, and
 * a closer portrait. 3 (2026-10-24): the mouths, bare legs, boots.
 */
export const RENDER_VERSION = 3;

/** The options of a field this version draws, when it draws only some (a
 *  piece added to the lists before its figure is ready). A field not named
 *  here draws every option. Every piece is drawn since M5 (2026-10-24). */
export const DRAWN = Object.freeze({});

/** The options of `list` that `field` draws today, for the editor. */
export function drawnOptions(field, list, drawn = DRAWN) {
    const only = drawn[field];
    return only ? list.filter((o) => only.includes(o.id)) : list.slice();
}

export function smoothstep(t) {
    const x = Math.min(1, Math.max(0, t));
    return x * x * (3 - 2 * x);
}

// ---- The smile ----------------------------------------------------------------

/** Maya's smile (QA, 2026-10-15: friendlier, no teeth), in meters on the
 *  rig's 0.12 m head: `width` across the corners, the corners `lift` above
 *  its middle, its middle `drop` below the head's middle. */
export const SMILE = Object.freeze({ width: 0.04, lift: 0.0072, drop: 0.054, thickness: 0.0049 });

/** How much of each channel of the skin the lips keep: Maya's lips over her
 *  skin (#A3564F over #BF8A66), so every tone gets a rose of its own. */
export const LIPS_TINT = Object.freeze([0.853, 0.623, 0.775]);

/** The lips' color for a skin color (display hex). */
export function lipsColor(skin) {
    const ch = [(skin >> 16) & 255, (skin >> 8) & 255, skin & 255].map((c, i) => Math.round(c * LIPS_TINT[i]));
    return (ch[0] << 16) | (ch[1] << 8) | ch[2];
}

/**
 * The arc of a smile, `{ radius, arc }`: the part of a circle whose chord is
 * `width` and whose ends rise `lift` above its lowest point.
 */
export function smileArc(width, lift) {
    const half = width / 2;
    const radius = (half * half + lift * lift) / (2 * lift);
    return { radius, arc: 2 * Math.asin(half / radius) };
}

/** The gentle smile's lips on the front of `head` (the rig's head mesh): a
 *  slim arc, lowest in the middle, sunk a little into the face so it reads
 *  as lips. */
function buildSmile(head, color, s = SMILE) {
    const headR = head.geometry.parameters.radius;
    const { radius: r, arc } = smileArc(s.width, s.lift);
    const lips = new THREE.Mesh(
        new THREE.TorusGeometry(r, s.thickness, 6, 20, arc),
        new THREE.MeshStandardMaterial({ color, roughness: 0.55 })
    );
    lips.name = 'lips';
    // The torus's arc starts at +x and runs counterclockwise: turned so its
    // middle points straight down, its center `r` above the smile's middle.
    lips.rotation.z = Math.PI * 1.5 - arc / 2;
    const y = head.position.y - s.drop;
    lips.position.set(0, y + r, Math.sqrt(headR * headR - s.drop * s.drop) - s.thickness * 0.4);
    return lips;
}

/**
 * The other mouths (Steve's QA, 2026-10-24), in meters on the 0.12 m head:
 *
 *   smirk      the gentle smile tipped by `turn`, one corner up
 *   bigSmile   open, the top teeth showing
 *   grin       wider and shallower, both rows of teeth showing
 *   surprised  a small round "o"
 *
 * An open mouth is an outline (`width` across, its top rising `lift` to the
 * corners, `depth` deep in the middle, its upper middle `drop` below the
 * head's middle), drawn flat and then WRAPPED ONTO THE HEAD'S SPHERE: a flat
 * shape on a round head floats up to 4 mm off it at the corners. The lips
 * are a ring `lip` wide round the opening, over a dark inside and the teeth.
 */
export const MOUTH_SIZE = Object.freeze({
    smirk: { turn: 0.22, shift: 0.004 },
    bigSmile: { width: 0.05, lift: 0.009, depth: 0.017, lip: 0.0035, teeth: 0.0075, drop: 0.052 },
    grin: { width: 0.058, lift: 0.006, depth: 0.013, lip: 0.003, teeth: 0.0055, lower: 0.0035, drop: 0.054 },
    surprised: { r: 0.0085, tube: 0.0035, drop: 0.057 },
    inside: 0x3d1418,
    teeth: 0xf3efe6
});

/** The open mouth's outline, as [x, y] points round it: the top from left to
 *  right, then the bottom back. `grow` widens it all round (the lips). */
function mouthOutline(m, grow = 0, n = 14) {
    const hw = m.width / 2 + grow;
    const pts = [];
    for (let i = 0; i <= n; i++) {
        const x = -hw + (2 * hw * i) / n;
        pts.push([x, m.lift * (x / hw) ** 2 + grow]);
    }
    for (let i = n - 1; i > 0; i--) {
        const x = -hw + (2 * hw * i) / n;
        const t = (x / hw) ** 2;
        pts.push([x, m.lift * t + grow - (m.depth + 2 * grow) * (1 - t)]);
    }
    return pts;
}

/** A shape from [x, y] points. */
function shapeOf(points) {
    const shape = new THREE.Shape();
    points.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
    return shape;
}

/** A flat shape's geometry wrapped onto the head's sphere: its (x, y) read as
 *  meters across and up the face from the mouth's middle (`drop` below the
 *  head's middle), at `r` from the head's middle `c`. */
function wrapped(shape, c, r, drop, R = 0.12) {
    const geometry = new THREE.ShapeGeometry(shape);
    const pos = geometry.attributes.position;
    const polar = Math.acos(-drop / R);
    for (let i = 0; i < pos.count; i++) {
        const t = polar - pos.getY(i) / R;
        const a = pos.getX(i) / R;
        pos.setXYZ(i, c.x + r * Math.sin(t) * Math.sin(a), c.y + r * Math.cos(t), c.z + r * Math.sin(t) * Math.cos(a));
    }
    geometry.computeVertexNormals();
    return geometry;
}

/** The mouth: a group named 'mouth' on the person, its lips colored
 *  `color`. */
function buildMouth(kind, head, color) {
    const M = MOUTH_SIZE;
    const c = head.position;
    const group = new THREE.Group();
    group.name = 'mouth';
    const lipsMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.55, side: THREE.DoubleSide });
    const inside = new THREE.MeshStandardMaterial({ color: M.inside, roughness: 0.9, side: THREE.DoubleSide });
    const teethMaterial = new THREE.MeshStandardMaterial({ color: M.teeth, roughness: 0.35, side: THREE.DoubleSide });
    if (kind === 'smile' || kind === 'smirk') {
        const lips = buildSmile(head, color);
        if (kind === 'smirk') {
            lips.rotation.z += M.smirk.turn;
            lips.position.x += M.smirk.shift;
        }
        group.add(lips);
    } else if (kind === 'surprised') {
        const m = M.surprised;
        // Stood on the face, tipped to its slope at that height.
        const tilt = Math.asin(m.drop / 0.12);
        const z = Math.sqrt(0.12 * 0.12 - m.drop * m.drop);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(m.r, m.tube, 8, 20), lipsMaterial);
        ring.position.set(c.x, c.y - m.drop, c.z + z);
        ring.rotation.x = tilt;
        ring.name = 'lips';
        const hole = new THREE.Mesh(new THREE.CircleGeometry(m.r, 16), inside);
        hole.position.set(c.x, c.y - m.drop, c.z + z + 0.0008);
        hole.rotation.x = tilt;
        hole.name = 'inside';
        group.add(ring, hole);
    } else {
        const m = M[kind];
        const opening = mouthOutline(m);
        const ring = shapeOf(mouthOutline(m, m.lip));
        ring.holes.push(shapeOf(opening));
        const lips = new THREE.Mesh(wrapped(ring, c, 0.1214, m.drop), lipsMaterial);
        lips.name = 'lips';
        const dark = new THREE.Mesh(wrapped(shapeOf(opening), c, 0.1204, m.drop), inside);
        dark.name = 'inside';
        group.add(lips, dark);
        // The top teeth: from the top of the opening down `teeth`, never past
        // its bottom; the grin's bottom teeth up from its bottom.
        const hw = m.width / 2;
        const top = [];
        const under = [];
        const bottomTeeth = [];
        for (let i = 0; i <= 14; i++) {
            const x = -hw + (2 * hw * i) / 14;
            const t = (x / hw) ** 2;
            const u = m.lift * t;
            const l = u - m.depth * (1 - t);
            top.push([x, u]);
            under.push([x, Math.max(u - m.teeth, l)]);
            if (m.lower) bottomTeeth.push([x, l], [x, Math.min(l + m.lower, u - m.teeth - 0.0015)]);
        }
        const teeth = new THREE.Mesh(wrapped(shapeOf(top.concat(under.reverse())), c, 0.1208, m.drop), teethMaterial);
        teeth.name = 'teeth';
        group.add(teeth);
        if (m.lower) {
            const lowEdge = bottomTeeth.filter((p, i) => i % 2 === 0);
            const highEdge = bottomTeeth.filter((p, i) => i % 2 === 1).map(([x, y], i) => [x, Math.max(y, lowEdge[i][1])]);
            const lower = new THREE.Mesh(wrapped(shapeOf(lowEdge.concat(highEdge.reverse())), c, 0.1208, m.drop), teethMaterial);
            lower.name = 'teeth';
            group.add(lower);
        }
    }
    group.traverse((o) => {
        if (o.isMesh) o.castShadow = false;
    });
    return group;
}

// ---- The skirt, the shorts, the tank top and the arms ---------------------------

/** How far inside the skirt the legs stay, at the least, in meters. */
export const SKIRT_CLEARANCE = 0.008;

/**
 * The rig's skirt was sized for straight legs, and a fuller leg (Curvy's
 * hips, Buff's thighs) came 2 cm through it (measured against real three).
 * So it is MEASURED, not tuned: drawn just wide enough that every point of
 * the legs within its height stays `SKIRT_CLEARANCE` inside it, and never
 * narrower than the rig made it.
 */
function fitSkirt(person, skirt) {
    const { radiusTop: rTop, radiusBottom: rBottom, height } = skirt.geometry.parameters;
    const top = skirt.position.y + height / 2;
    const bottom = top - height;
    const rAt = (y) => rTop + ((top - y) / height) * (rBottom - rTop);
    let k = 1;
    eachVertex(person.children.filter((o) => o.userData.isLeg), (v) => {
        if (v.y > top || v.y < bottom) return;
        k = Math.max(k, (Math.hypot(v.x, v.z) + SKIRT_CLEARANCE) / rAt(v.y));
    });
    skirt.scale.set(k, 1, k);
    return k;
}

/** A leg's parts by what they are: the thigh and the shin (the upper and
 *  lower cylinders), the knee, and the shoe. */
function legParts(leg) {
    const cylinders = leg.children.filter((m) => m.isMesh && m.geometry.type === 'CylinderGeometry')
        .sort((a, b) => b.position.y - a.position.y);
    return {
        thigh: cylinders[0],
        shin: cylinders[1],
        knee: leg.children.find((m) => m.isMesh && m.geometry.type === 'SphereGeometry'),
        shoe: leg.children.find((m) => m.userData.isShoe)
    };
}

/**
 * Bare legs: under a skirt, the whole leg is skin (Steve's QA, 2026-10-24:
 * the rig colored it the skirt's, as matching tights); in shorts the knee
 * and the shin are, and the thigh keeps the shorts' color, finished with a
 * hem a little proud of it at the knee.
 */
function dressLegs(person, bottom, skin) {
    for (const leg of person.children.filter((o) => o.userData.isLeg)) {
        const { thigh, shin, knee } = legParts(leg);
        knee.material = skin;
        shin.material = skin;
        if (bottom === 'skirt') {
            thigh.material = skin;
            continue;
        }
        const { radiusBottom, height } = thigh.geometry.parameters;
        const hem = new THREE.Mesh(new THREE.CylinderGeometry(radiusBottom * 1.07, radiusBottom * 1.1, 0.022, 14, 1, true), thigh.material);
        hem.position.y = thigh.position.y - height / 2 + 0.011;
        hem.name = 'hem';
        leg.add(hem);
    }
}

/** A tank top: the shoulders and the upper arms bare (the rig draws them in
 *  the shirt), and no collar. */
function dressTank(person, skin) {
    person.traverse((o) => {
        if (!o.userData.isArm) return;
        for (const m of o.children) if (m.isMesh) m.material = skin;
    });
    const collar = person.children.find((o) => o.isMesh && o.geometry.type === 'TorusGeometry');
    if (collar) collar.visible = false;
}

/** How much thicker an Athletic arm is than the rig's (Buff is the rig's own
 *  `muscular`). */
export const ATHLETIC_ARMS = 1.28;

/** Thicker arms: every part of each arm but the hand widened by `k`, and
 *  the arm moved out by what its upper arm gained, so it grows away from
 *  the body rather than into it. */
function strengthenArms(person, k) {
    person.traverse((arm) => {
        if (!arm.userData.isArm) return;
        let radius = 0;
        arm.traverse((m) => {
            if (!m.isMesh) return;
            const hand = m.parent === arm.userData.forearm && m === arm.userData.forearm.children[arm.userData.forearm.children.length - 1];
            if (hand) return;
            if (m.geometry.type === 'CylinderGeometry' && m.parent === arm) radius = m.geometry.parameters.radiusTop;
            m.scale.x *= k;
            m.scale.z *= k;
            if (m.geometry.type === 'SphereGeometry') m.scale.y *= k;
        });
        arm.position.x += arm.userData.armSide * radius * (k - 1);
    });
}

// ---- The pieces (M5): glasses, facial hair, hats, sneakers ----------------------
//
// Every piece is built in the person's own coordinates around the rig's head
// (its middle `c`, radius 0.12): x across, y up, z out of the face. The rig's
// face, measured: the eyes 0.02 above the middle at x +-0.035, their pupils'
// fronts and the nose's tip 0.135 out; the ears at x +-0.11; the smile's
// middle 0.054 below.

/** A rod of radius `r` from `a` to `b` (arrays), for the glasses' bridge and
 *  arms. */
function rod(a, b, r, material) {
    const from = new THREE.Vector3(...a);
    const to = new THREE.Vector3(...b);
    const length = from.distanceTo(to);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, length, 6), material);
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    return mesh;
}

/** `points` ([x, y] pairs, x rising) read at `x`, straight between them
 *  and flat past the ends. */
function along(points, x) {
    if (x <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
        const [x1, y1] = points[i];
        if (x <= x1) {
            const [x0, y0] = points[i - 1];
            return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
        }
    }
    return points[points.length - 1][1];
}

/**
 * A band of a sphere of radius `r` about the head's middle `c`, `half`
 * radians either side of straight ahead, its edges `top` and `bottom` (each
 * [angle from the front, radians down from the crown] points, so an edge can
 * slope: a beard's line rises from the corners of the mouth to the
 * sideburns).
 */
function band(c, r, { half, top, bottom }, material, across = 36, down = 10) {
    const positions = [];
    const index = [];
    for (let i = 0; i <= across; i++) {
        const a = -half + (2 * half * i) / across;
        const t0 = along(top, Math.abs(a));
        const t1 = along(bottom, Math.abs(a));
        for (let j = 0; j <= down; j++) {
            const t = t0 + ((t1 - t0) * j) / down;
            positions.push(c.x + r * Math.sin(t) * Math.sin(a), c.y + r * Math.cos(t), c.z + r * Math.sin(t) * Math.cos(a));
            if (i > 0 && j > 0) {
                const p = i * (down + 1) + j;
                const q = (i - 1) * (down + 1) + j;
                index.push(q - 1, p - 1, p, q - 1, p, q);
            }
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, material);
}

/**
 * The glasses: each frame round (a ring) or square (a ring of four sides,
 * turned to stand square), `x` either side of the nose and `y` above the
 * head's middle (the eyes), `z` out (in front of the pupils and the nose's
 * tip), a bridge over the nose, and arms back past the sides of the head to
 * the ears, kept outside it (tests/shared-avatar-figure measures them).
 * Sunglasses are square frames a size up with dark lenses, and round
 * sunglasses round ones (Steve's QA, 2026-10-24).
 */
export const GLASSES_SIZE = Object.freeze({
    x: 0.035, y: 0.02, z: 0.143, tube: 0.0026, bridgeLift: 0.004,
    round: { r: 0.021, sides: 16, turn: 0, frame: 0x3b2a20 },
    square: { r: 0.027, sides: 4, turn: Math.PI / 4, frame: 0x1d1d1f },
    sunglasses: { r: 0.029, sides: 4, turn: Math.PI / 4, frame: 0x161618, lens: 0x22262c },
    roundSun: { r: 0.024, sides: 18, turn: 0, frame: 0x161618, lens: 0x22262c },
    /** Where each arm bends at the side of the head, and where it ends at
     *  the ear, as [x, y, z] from the head's middle (x for the right side). */
    side: [0.121, 0.02, 0.06],
    ear: [0.12, 0.014, -0.03]
});

function buildGlasses(kind, c) {
    const G = GLASSES_SIZE;
    const spec = G[kind];
    const group = new THREE.Group();
    group.name = 'glasses';
    const frame = new THREE.MeshStandardMaterial({ color: spec.frame, roughness: 0.35, metalness: 0.2 });
    // Half a frame's width: a ring's radius, or a square's half side.
    const halfW = spec.sides === 4 ? spec.r / Math.SQRT2 : spec.r;
    for (const s of [-1, 1]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(spec.r, G.tube, 6, spec.sides), frame);
        ring.rotation.z = spec.turn;
        ring.position.set(c.x + s * G.x, c.y + G.y, c.z + G.z);
        group.add(ring);
        if (spec.lens) {
            const lens = new THREE.Mesh(
                new THREE.CircleGeometry(spec.r, spec.sides),
                new THREE.MeshStandardMaterial({ color: spec.lens, roughness: 0.15, metalness: 0.4, side: THREE.DoubleSide })
            );
            lens.rotation.z = spec.turn;
            lens.position.set(c.x + s * G.x, c.y + G.y, c.z + G.z - 0.001);
            lens.name = 'lens';
            group.add(lens);
        }
        const outer = [c.x + s * (G.x + halfW + G.tube), c.y + G.y, c.z + G.z];
        const side = [c.x + s * G.side[0], c.y + G.side[1], c.z + G.side[2]];
        const ear = [c.x + s * G.ear[0], c.y + G.ear[1], c.z + G.ear[2]];
        group.add(rod(outer, side, G.tube * 0.9, frame));
        group.add(rod(side, ear, G.tube * 0.9, frame));
    }
    const inner = G.x - halfW - G.tube;
    group.add(rod([c.x - inner, c.y + G.y + G.bridgeLift, c.z + G.z], [c.x + inner, c.y + G.y + G.bridgeLift, c.z + G.z], G.tube * 0.9, frame));
    group.traverse((o) => {
        if (o.isMesh) o.castShadow = false;
    });
    return group;
}

/**
 * Facial hair, in the hair's color. All of it sits on the head's sphere, in
 * angles down from the crown (the smile's lips run from about 1.95 to 2.08,
 * so nothing solid crosses that band):
 *
 *   mustache  an arc over the lip, its ends just above the smile's corners
 *   goatee    the mustache, and a patch on the chin
 *   beard     the mustache, and the jaw and cheeks from ear to ear and
 *             under the chin, its line rising from the mouth to the sideburns
 *   stubble   the beard's places, close to the skin and see-through, and the
 *             upper lip
 */
export const FACIAL_SIZE = Object.freeze({
    /** A wide, shallow arc over the lip, just under the nose: wider than the
     *  smile, so it never reads as a second mouth (QA by preview,
     *  2026-10-24: a small arc did). */
    mustache: { r: 0.06, tube: 0.0065, arc: 0.85, y: -0.029, flat: 0.7 },
    chin: { r: 0.1235, half: 0.32, top: [[0, 2.13]], bottom: [[0, 2.75]] },
    /** The beard: under the lips at the front, round the corners of the
     *  mouth, and up the cheeks to the sideburns by the ears. */
    beard: {
        r: 0.127, half: 1.66,
        top: [[0, 2.13], [0.2, 2.13], [0.36, 1.96], [1.0, 1.72], [1.5, 1.5], [1.66, 1.45]],
        bottom: [[0, 2.95]]
    },
    stubble: { r: 0.1213, lip: { half: 0.3, top: [[0, 1.82]], bottom: [[0, 1.91]] }, opacity: 0.42 }
});

/** Below the mouth, the beard, the goatee and the stubble keep this far
 *  clear of its lowest point (an open mouth reaches lower than the gentle
 *  smile: preview, 2026-10-24, the beard crossed the grin). */
export const BELOW_MOUTH = 0.006;

/** An edge's [angle, polar] points with its front (every point up to
 *  `front` radians from straight ahead) moved down to at least `polar`. */
function lowerFront(points, polar, front = 0.2) {
    return points.map(([a, t]) => [a, a <= front ? Math.max(t, polar) : t]);
}

/** `mouthBottom` is the mouth's lowest point, below the head's middle. */
function buildFacial(kind, c, color, mouthBottom = -SMILE.drop - SMILE.thickness) {
    const F = FACIAL_SIZE;
    // The polar angle on a sphere of radius `r` just under the mouth.
    const under = (r) => Math.acos(Math.max(-1, (mouthBottom - BELOW_MOUTH) / r));
    const beard = (r) => ({ ...F.beard, top: lowerFront(F.beard.top, under(r)) });
    const group = new THREE.Group();
    group.name = 'facial';
    const solid = new THREE.MeshStandardMaterial({ color, roughness: 0.95, side: THREE.DoubleSide });
    const mustache = () => {
        const m = F.mustache;
        const arc = new THREE.Mesh(new THREE.TorusGeometry(m.r, m.tube, 6, 16, m.arc), solid);
        // The arc starts at +x and runs round: turned so its middle is on top,
        // the ends drooping toward the corners of the smile.
        arc.rotation.z = Math.PI / 2 - m.arc / 2;
        const z = Math.sqrt(0.12 * 0.12 - m.y * m.y) + 0.002;
        arc.position.set(c.x, c.y + m.y - m.r, c.z + z);
        arc.scale.z = m.flat;
        arc.name = 'mustache';
        return arc;
    };
    if (kind === 'stubble') {
        const shadow = new THREE.MeshStandardMaterial({
            color, roughness: 1, transparent: true, opacity: F.stubble.opacity, depthWrite: false, side: THREE.DoubleSide
        });
        group.add(band(c, F.stubble.r, beard(F.stubble.r), shadow));
        group.add(band(c, F.stubble.r, F.stubble.lip, shadow));
    } else {
        group.add(mustache());
        if (kind === 'goatee') group.add(band(c, F.chin.r, { ...F.chin, top: lowerFront(F.chin.top, under(F.chin.r), Infinity) }, solid));
        if (kind === 'beard') group.add(band(c, F.beard.r, beard(F.beard.r), solid));
    }
    group.traverse((o) => {
        if (o.isMesh) o.castShadow = false;
    });
    return group;
}

/**
 * The hats, each FITTED TO THE HAIR UNDER IT: a crown's radius is the
 * farthest the hair (or the head, bald) reaches from the crown's middle,
 * above the hat's rim, plus `ease`. So a hat sits snug on a buzz cut and
 * roomy over long hair, and no hair ever comes through it
 * (tests/shared-avatar-figure measures every hat over every hair style).
 *
 *   beanie  a dome down over the tops of the ears, its front tipped up
 *           (`tilt`) off the brow, and a turned-up cuff
 *   cap     a shallower crown, a brim out over the brow, and a button
 *   sunHat  a crown, a dark band, and a wide brim drooping a little
 *
 * `center` is the crown's middle from the head's, `edge` how far down the
 * dome runs (radians from the top).
 */
export const HAT_SIZE = Object.freeze({
    ease: 0.004,
    beanie: { center: [0, 0.022, -0.008], edge: 1.65, tilt: -0.3, cuff: 0.03 },
    cap: { center: [0, 0.035, -0.005], edge: 1.5, tilt: -0.12, brim: 0.09, reach: 0.035, pitch: 0.14 },
    sunHat: { center: [0, 0, -0.012], base: 0.07, height: 0.1, taper: 0.88, brim: 0.235, droop: 0.025, band: 0.02, bandColor: 0x2a2622 }
});

/** Call `fn(v)` for every vertex of `objects` (meshes and groups that are
 *  the person's children), in the person's coordinates, for the meshes
 *  `keep` keeps. */
function eachVertex(objects, fn, keep = () => true) {
    const v = new THREE.Vector3();
    for (const o of objects) {
        o.updateMatrix();
        o.traverse((m) => {
            if (!m.isMesh || !keep(m)) return;
            // Its own offset too: a mesh's matrix is stale until updated, and
            // the hair's meshes carry their whole height in it.
            m.updateMatrix();
            const matrix = m.matrix.clone();
            for (let p = m.parent; p && p !== o.parent; p = p.parent) {
                p.updateMatrix();
                matrix.premultiply(p.matrix);
            }
            const pos = m.geometry.attributes.position;
            for (let i = 0; i < pos.count; i++) fn(v.fromBufferAttribute(pos, i).applyMatrix4(matrix));
        });
    }
}

/** The farthest any vertex of `objects` above `aboveY` reaches from
 *  `center`, straight or (`horizontal`) across. */
function reach(objects, center, aboveY, horizontal = false, keep = undefined) {
    let far = 0;
    eachVertex(objects, (v) => {
        if (v.y < aboveY) return;
        far = Math.max(far, horizontal ? Math.hypot(v.x - center.x, v.z - center.z) : v.distanceTo(center));
    }, keep);
    return far;
}

/** The highest any vertex of `objects` reaches. */
function highest(objects, keep = undefined) {
    let top = -Infinity;
    eachVertex(objects, (v) => {
        top = Math.max(top, v.y);
    }, keep);
    return top;
}

/** The rounded parts of the hair (and the head): what a hat is fitted
 *  over. The rig's long hair also has box-shaped hanks (the curtain down
 *  the back, the locks by the face), whose top corners stand out past any
 *  round crown, so a hat fitted to them balloons (preview, 2026-10-24).
 *  Under a hat they are trimmed to hang from its rim instead (`trimUnder`). */
const rounded = (m) => m.geometry.type !== 'BoxGeometry';

/**
 * Cut each box-shaped hank of `hair` down so its top sits just under the
 * hat's rim (`rimAt(z)`, the rim's height at a depth, taken at the lower
 * of the hank's front and back), so it hangs out from under the hat as
 * hair does, and never through it. A hank wholly above the rim is hidden.
 */
export function trimUnder(hair, rimAt, tuck = 0.004) {
    hair.traverse((m) => {
        if (!m.isMesh || rounded(m)) return;
        const { height, depth } = m.geometry.parameters;
        const h = height * m.scale.y;
        const d = (depth * m.scale.z) / 2;
        const bottom = m.position.y - h / 2;
        const top = m.position.y + h / 2;
        const rim = Math.min(rimAt(m.position.z - d), rimAt(m.position.z + d)) - tuck;
        if (top <= rim) return;
        if (rim <= bottom + 0.01) {
            m.visible = false;
            return;
        }
        m.scale.y *= (rim - bottom) / h;
        m.position.y = (rim + bottom) / 2;
    });
}

function buildHat(kind, c, color, head, hair) {
    const cover = hair ? [head, hair] : [head];
    const H = HAT_SIZE;
    const spec = H[kind];
    const group = new THREE.Group();
    group.name = 'hat';
    const felt = new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide });
    const center = new THREE.Vector3(c.x + spec.center[0], c.y + spec.center[1], c.z + spec.center[2]);
    if (kind === 'sunHat') {
        const baseY = c.y + spec.base;
        const r = reach(cover, center, baseY, true, rounded) + H.ease + 0.004;
        const top = Math.max(baseY + spec.height, highest(cover, rounded) + 0.012);
        const height = top - baseY;
        const crown = new THREE.Mesh(new THREE.CylinderGeometry(r * spec.taper, r, height, 32), felt);
        crown.position.set(center.x, baseY + height / 2, center.z);
        group.add(crown);
        const band = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.0015, r + 0.002, spec.band, 32, 1, true),
            new THREE.MeshStandardMaterial({ color: spec.bandColor, roughness: 0.6, side: THREE.DoubleSide }));
        band.position.set(center.x, baseY + spec.band / 2 + 0.002, center.z);
        band.name = 'band';
        group.add(band);
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(r, spec.brim, spec.droop, 40, 1, true), felt);
        brim.position.set(center.x, baseY - spec.droop / 2, center.z);
        brim.name = 'brim';
        group.add(brim);
        if (hair) trimUnder(hair, () => baseY);
        group.userData.fit = { kind, center: center.clone(), r, top, baseY };
    } else {
        // The rim: the dome's edge, tipped by `tilt`. Hair below the lowest
        // point of it hangs out from under the hat, as it would.
        const R = reach(cover, center, center.y - 0.02, false, rounded) + H.ease;
        const dome = new THREE.Group();
        dome.position.copy(center);
        dome.rotation.x = spec.tilt;
        const shell = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 14, 0, Math.PI * 2, 0, spec.edge), felt);
        shell.name = 'crown';
        dome.add(shell);
        const rimY = R * Math.cos(spec.edge);
        const rimR = R * Math.sin(spec.edge);
        if (kind === 'beanie') {
            const cuffMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.86), roughness: 0.95, side: THREE.DoubleSide });
            const cuff = new THREE.Mesh(new THREE.CylinderGeometry(rimR + 0.006, rimR + 0.004, spec.cuff, 32, 1, true), cuffMaterial);
            cuff.position.y = rimY + spec.cuff / 2;
            cuff.name = 'cuff';
            dome.add(cuff);
        } else {
            const brim = new THREE.Mesh(new THREE.CylinderGeometry(spec.brim, spec.brim, 0.008, 24, 1, false, -Math.PI / 2, Math.PI), felt);
            brim.scale.x = (rimR / spec.brim) * 0.96;
            brim.position.set(0, rimY + 0.003, rimR - spec.reach);
            brim.rotation.x = spec.pitch;
            brim.name = 'brim';
            dome.add(brim);
            const button = new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 6), felt);
            button.position.y = R;
            dome.add(button);
        }
        group.add(dome);
        // The rim is the dome's edge, a circle in a plane tipped by `tilt`:
        // its height at a depth `z`, from (y - cy) cos t + (z - cz) sin t = rimY.
        const t = spec.tilt;
        if (hair) trimUnder(hair, (z) => center.y + (rimY - (z - center.z) * Math.sin(t)) / Math.cos(t));
        group.userData.fit = { kind, center: center.clone(), r: R, tilt: t, edge: spec.edge };
    }
    return group;
}

/**
 * Sneakers, over the rig's block shoe (Steve's QA, 2026-10-24: they looked
 * the same as the classic shoe): a thick white sole a little proud of the
 * upper all round, a white toe cap and heel, and white laces. Under a white
 * shoe the white parts are a light gray, so they still read. Sized from each
 * shoe's own box, so a slender build's narrower shoe gets a narrower sole.
 */
export const SNEAKER_SIZE = Object.freeze({
    sole: 0.024, proud: 0.005, toe: 0.009, cap: 0.032, capHeight: 0.036, heel: 0.03, heelHeight: 0.042,
    trim: 0xf4f3ef, trimOnWhite: 0xc9c5bd
});

/** A box `size` [w, h, l] in `material`, its bottom at `y` and middle at `z`
 *  in a leg's coordinates, named. */
function block(size, y, z, material, name) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    m.position.set(0, y + size[1] / 2, z);
    m.name = name;
    m.castShadow = true;
    return m;
}

/** Each block shoe, with its leg and its box's measures. */
function blockShoes(person) {
    const out = [];
    for (const leg of person.children.filter((o) => o.userData.isLeg)) {
        const parts = legParts(leg);
        if (!parts.shoe || !parts.shoe.isMesh) continue;
        const { width: w, height: h, depth: l } = parts.shoe.geometry.parameters;
        out.push({ leg, ...parts, w, h, l, floor: parts.shoe.position.y - h / 2, z: parts.shoe.position.z });
    }
    return out;
}

function dressSneakers(person, whiteShoe) {
    const S = SNEAKER_SIZE;
    const trim = new THREE.MeshStandardMaterial({ color: whiteShoe ? S.trimOnWhite : S.trim, roughness: 0.7 });
    const shoes = blockShoes(person);
    for (const { leg, w, h, l, floor, z } of shoes) {
        leg.add(block([w + 2 * S.proud, S.sole, l + 2 * S.toe], floor, z, trim, 'sole'));
        leg.add(block([w + 0.003, S.capHeight, S.cap], floor, z + l / 2 - S.cap / 2 + 0.002, trim, 'toe-cap'));
        leg.add(block([w + 0.004, S.heelHeight, S.heel], floor, z - l / 2 + S.heel / 2 - 0.002, trim, 'heel'));
        leg.add(block([w * 0.45, 0.004, l * 0.3], floor + h, z + l * 0.08, trim, 'laces'));
    }
    return shoes.length;
}

/**
 * The boots (Steve's QA, 2026-10-24), named by style. Each starts from the
 * rig's block shoe and adds a shaft up the leg, drawn OVER the trouser leg:
 * its radius at every height is the shin's (read from the rig's own
 * cylinder) plus `over`, so it fits any build. `rise` is how far the shaft
 * reaches above the shoe; the tall boot's reaches to just under the knee.
 *
 *   ankleBoots   to the ankle, with elastic side panels
 *   workBoots    over the ankle, a chunky sole, laces and a padded collar
 *   cowboyBoots  to mid-calf, a pointed toe, a heel, and a stitched band
 *   tallBoots    slim, to just under the knee, with a low heel
 */
export const BOOT_SIZE = Object.freeze({
    ankleBoots: { rise: 0.075, over: 0.006 },
    workBoots: { rise: 0.095, over: 0.008, sole: 0.024, lace: 0xd8c9a8 },
    cowboyBoots: { rise: 0.21, over: 0.005, flare: 0.005, toe: 0.05, heel: 0.034 },
    tallBoots: { over: 0.005, belowKnee: 0.5, heel: 0.022 },
    /** How much darker the sole and the trim are than the boot. */
    shade: 0.5
});

/** A shaft round the shin from `y0` up to `y1` (a leg's coordinates),
 *  `over` meters proud of it, its top widened by `flare`. */
function shaft(shin, y0, y1, over, material, flare = 0) {
    const { radiusTop, radiusBottom, height } = shin.geometry.parameters;
    const low = shin.position.y - height / 2;
    const rAt = (y) => radiusBottom + ((y - low) / height) * (radiusTop - radiusBottom);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rAt(y1) + over + flare, rAt(y0) + over, y1 - y0, 16), material);
    mesh.position.set(shin.position.x, (y0 + y1) / 2, shin.position.z);
    mesh.name = 'shaft';
    mesh.castShadow = true;
    mesh.userData.over = over;
    return mesh;
}

function dressBoots(person, kind, color) {
    const B = BOOT_SIZE;
    const spec = B[kind];
    const leather = new THREE.MeshStandardMaterial({ color, roughness: 0.55 });
    const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(B.shade), roughness: 0.7 });
    const shoes = blockShoes(person);
    for (const { leg, shin, knee, w, h, l, floor, z } of shoes) {
        const top = floor + h;
        if (kind === 'tallBoots') {
            const kneeR = knee.geometry.parameters.radius;
            leg.add(shaft(shin, top - 0.004, knee.position.y - kneeR * spec.belowKnee, spec.over, leather));
            leg.add(block([w + 0.004, spec.heel, 0.04], floor, z - l / 2 + 0.022, dark, 'heel'));
            continue;
        }
        leg.add(shaft(shin, top - 0.004, top + spec.rise, spec.over, leather, spec.flare || 0));
        if (kind === 'ankleBoots') {
            const r = shin.geometry.parameters.radiusBottom + spec.over;
            for (const s of [-1, 1]) {
                const panel = block([0.004, spec.rise * 0.7, 0.028], top + spec.rise * 0.15, 0, dark, 'panel');
                panel.position.x = s * (r + 0.001);
                leg.add(panel);
            }
            leg.add(block([w + 0.004, 0.012, l + 0.006], floor, z, dark, 'sole'));
        } else if (kind === 'workBoots') {
            leg.add(block([w + 0.012, spec.sole, l + 0.014], floor, z, dark, 'sole'));
            const lace = new THREE.MeshStandardMaterial({ color: spec.lace, roughness: 0.8 });
            const r = shin.geometry.parameters.radiusBottom + spec.over;
            for (let i = 0; i < 4; i++) {
                leg.add(block([0.026, 0.004, 0.006], top + 0.012 + i * 0.022, r + 0.002, lace, 'lace'));
            }
            const collar = new THREE.Mesh(new THREE.TorusGeometry(r + 0.002, 0.007, 6, 16), dark);
            collar.rotation.x = Math.PI / 2;
            collar.position.y = top + spec.rise;
            collar.name = 'collar';
            leg.add(collar);
        } else if (kind === 'cowboyBoots') {
            // The pointed toe: a cone lying forward, its base the shoe's
            // whole front face (round, flattened to the shoe's height), its
            // point `toe` past it (preview, 2026-10-24: a rounded toe read as
            // a bump).
            const base = w / 2 + 0.002;
            const toe = new THREE.Mesh(new THREE.ConeGeometry(base, spec.toe, 14), leather);
            toe.rotation.x = Math.PI / 2;
            // Flattened to exactly the shoe's height, so it stands on the floor.
            toe.scale.z = h / 2 / base;
            toe.position.set(0, floor + h / 2, z + l / 2 + spec.toe / 2 - 0.002);
            toe.name = 'toe';
            toe.castShadow = true;
            leg.add(toe);
            leg.add(block([w + 0.006, spec.heel, 0.05], floor, z - l / 2 + 0.027, dark, 'heel'));
            const band = shaft(shin, top + spec.rise * 0.72, top + spec.rise * 0.8, spec.over + 0.0015, dark, spec.flare * 0.7);
            band.name = 'band';
            leg.add(band);
        }
    }
    return shoes.length;
}

// ---- The wave -----------------------------------------------------------------

/** The rig's resting arm: splayed a little, a touch forward, the elbow
 *  straight. */
export const REST = Object.freeze({ z: 0.15, x: 0.1, fore: 0 });

/** How long each gesture lasts, seconds. */
export const GESTURES = Object.freeze({ wave: 2.2 });

/**
 * Each arm's angles `t` seconds into a gesture: `{ right, left }`, the
 * figure's own right and left. `z` is the swing out from the side (before
 * the side's sign), `x` the swing forward (negative is forward), `fore` the
 * elbow's bend. Up over the first 0.35 s, down over the last 0.45 s, so a
 * gesture never snaps.
 *
 *   wave   the right arm raised high, swinging side to side (Maya's wave)
 */
export function poseFor(gesture, t) {
    const rest = { right: { ...REST }, left: { ...REST } };
    const total = GESTURES[gesture];
    if (!total || !(t >= 0) || t >= total) return rest;
    const up = smoothstep(t / 0.35);
    const down = 1 - smoothstep((t - (total - 0.45)) / 0.45);
    const k = Math.min(up, down);
    const mix = (a, b) => a + (b - a) * k;
    const swing = 0.22 * Math.sin(t * Math.PI * 2 * 1.6) * k;
    return { right: { z: mix(REST.z, 2.55) + swing, x: mix(REST.x, -0.12), fore: mix(0, -0.12) }, left: rest.left };
}

// ---- The figure ---------------------------------------------------------------

/**
 * Build the avatar's figure. `overrides` are avatar fields a scene forces
 * (`{ sleeves: 'long' }`, `{ hat: 'none' }`), `role` the rig's role, `extra`
 * any other createPerson settings. Returns:
 *
 *   avatar         the avatar it was built from, overrides laid over
 *   group          add it to the scene; position and turn it freely
 *   person         the rig's own figure inside it
 *   arms           { right, left }, the rig's arm groups
 *   head()         the head's middle, in world meters (a THREE.Vector3)
 *   setPose(pose)  arms to a poseFor() pose
 *   gesture(name)  start one ('wave'); false for one it does not know
 *   tick(dt, { reducedMotion })  move on by dt seconds; true when anything
 *                  moved. Under reduced motion a gesture ends at rest.
 *   dispose()      let its geometry and materials go
 */
export function createAvatar(avatar, { overrides = {}, role = 'avatar', extra = {} } = {}) {
    const a = withOverrides(normalizeAvatar(avatar), overrides);
    const person = createPerson({ ...personConfig(a), role, ...extra });
    const head = person.children.find((o) => o.userData.isHead);
    // The skin's own material, for bare legs and arms.
    const skin = head.material;
    if (a.bottom !== 'pants') dressLegs(person, a.bottom, skin);
    if (a.sleeves === 'tank') dressTank(person, skin);
    if (a.muscles === 'athletic') strengthenArms(person, ATHLETIC_ARMS);
    if (a.bottom === 'skirt') fitSkirt(person, person.children.find((o) => o.userData.isSkirt));

    person.traverse((o) => {
        if (o.isMesh) o.castShadow = true;
    });

    const lips = optionOf(LIP_COLORS, a.lips).color;
    person.add(buildMouth(a.mouth, head, lips === null ? lipsColor(optionOf(SKINS, a.skin).color) : lips));

    // The pieces the rig has no option for (M5), after the shadows above:
    // none of them casts one (a hat's shadow would darken the whole face).
    const c = head.position;
    if (a.glasses !== 'none') person.add(buildGlasses(a.glasses, c));
    if (a.facial !== 'none') {
        let bottom = Infinity;
        eachVertex([person.children.find((o) => o.name === 'mouth')], (v) => {
            bottom = Math.min(bottom, v.y - c.y);
        });
        person.add(buildFacial(a.facial, c, optionOf(HAIR_COLORS, a.hair).color, bottom));
    }
    if (a.hat !== 'none') {
        const hair = person.children.find((o) => o.userData.isHair);
        person.add(buildHat(a.hat, c, optionOf(SHIRTS, a.hatColor).color, head, hair));
    }
    if (a.shoes === 'sneakers') dressSneakers(person, a.shoeColor === 'white');
    else if (BOOT_SIZE[a.shoes]) dressBoots(person, a.shoes, optionOf(SHOE_COLORS, a.shoeColor).color);

    const group = new THREE.Group();
    group.name = 'avatar';
    group.add(person);

    const arms = {};
    person.traverse((o) => {
        if (o.userData.isArm) arms[o.userData.armSide < 0 ? 'right' : 'left'] = o;
    });
    const side = { right: -1, left: 1 };

    function setPose(pose) {
        for (const key of ['right', 'left']) {
            const arm = arms[key];
            if (!arm || !pose || !pose[key]) continue;
            arm.rotation.z = side[key] * pose[key].z;
            arm.rotation.x = pose[key].x;
            if (arm.userData.forearm) arm.userData.forearm.rotation.x = pose[key].fore;
        }
    }
    setPose(poseFor(null, 0));

    let gesture = null;
    let elapsed = 0;

    return {
        avatar: a,
        group,
        person,
        arms,
        head() {
            group.updateMatrixWorld(true);
            return head.getWorldPosition(new THREE.Vector3());
        },
        setPose,
        get gesturing() {
            return gesture;
        },
        gesture(name) {
            if (!GESTURES[name]) return false;
            gesture = name;
            elapsed = 0;
            return true;
        },
        tick(dt, { reducedMotion = false } = {}) {
            if (!gesture) return false;
            if (reducedMotion) {
                gesture = null;
                setPose(poseFor(null, 0));
                return true;
            }
            elapsed += Math.max(0, dt);
            setPose(poseFor(gesture, elapsed));
            if (elapsed >= GESTURES[gesture]) gesture = null;
            return true;
        },
        dispose() {
            group.traverse((o) => {
                if (o.geometry && o.geometry.dispose) o.geometry.dispose();
                if (o.material && o.material.dispose) o.material.dispose();
            });
            if (group.parent) group.parent.remove(group);
        }
    };
}

// ---- The portrait -------------------------------------------------------------

/**
 * The portrait's framing (PLANNING 2.2): the face and the tops of the
 * shoulders, square, for a round chip. In meters on a figure standing at the
 * origin facing +z: the camera `distance` in front, aimed at `aimY`, raised
 * `lift`, `fov` degrees tall. `size` pixels square, about three times the
 * 56 px chip on a phone's screen. `background` is the studio's soft white.
 */
export const PORTRAIT = Object.freeze({
    size: 160,
    fov: 22,
    // Close enough that the head fills about three quarters of the frame
    // (preview, 2026-10-24: at 1.3 m it was under half, a small face in a
    // 56 px chip), and a sun hat's crown still inside the circle.
    distance: 1.1,
    aimY: 1.565,
    lift: 0.03,
    background: 0xe9e6e0
});

/** Above this many characters a PNG portrait is kept as a JPEG instead. */
export const JPEG_ABOVE = 60000;

/** The portrait camera, `{ eye, aim, fov }`, pure, so a test can check what
 *  it frames. */
export function portraitPose(P = PORTRAIT) {
    return { eye: [0, P.aimY + P.lift, P.distance], aim: [0, P.aimY, 0], fov: P.fov };
}

/** The portrait's own small studio: a soft sky, a key light from the
 *  figure's front left and above, and a fill. */
function portraitLights() {
    const hemi = new THREE.HemisphereLight(0xf6f8fb, 0xe7e1d8, 2.2);
    const key = new THREE.DirectionalLight(0xfff4e6, 2.0);
    key.position.set(-1.2, 2.6, 2.2);
    const fill = new THREE.DirectionalLight(0xe6edf5, 0.6);
    fill.position.set(1.6, 1.8, 1.4);
    return [hemi, key, fill];
}

/**
 * The avatar's portrait as a data URL (PNG, or JPEG when the PNG is large),
 * or null where it cannot be drawn (the canvas is smaller than the portrait,
 * or the browser will not). Draws on `renderer`'s own canvas, in its bottom
 * left corner, and copies the square out straight away: THE CALLER MUST DRAW
 * ITS OWN SCENE AGAIN BEFORE THE TASK ENDS, so the square is never shown.
 * `jpegAbove` is the PNG's length past which a JPEG is kept instead
 * (Infinity for a PNG whatever its size), `doc` makes the copy's canvas (a
 * test passes its own).
 */
export function renderPortrait(renderer, avatar, { overrides = {}, P = PORTRAIT, jpegAbove = JPEG_ABOVE, doc = typeof document === 'undefined' ? null : document } = {}) {
    let figure = null;
    try {
        const canvas = renderer && renderer.domElement;
        const size = P.size;
        if (!canvas || !doc || canvas.width < size || canvas.height < size) return null;
        const ratio = renderer.getPixelRatio();

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(P.background);
        for (const light of portraitLights()) scene.add(light);
        figure = createAvatar(avatar, { overrides });
        scene.add(figure.group);
        const pose = portraitPose(P);
        const camera = new THREE.PerspectiveCamera(pose.fov, 1, 0.05, 10);
        camera.position.set(pose.eye[0], pose.eye[1], pose.eye[2]);
        camera.lookAt(pose.aim[0], pose.aim[1], pose.aim[2]);

        const viewport = new THREE.Vector4();
        const scissor = new THREE.Vector4();
        renderer.getViewport(viewport);
        renderer.getScissor(scissor);
        const scissorTest = renderer.getScissorTest();
        const target = renderer.getRenderTarget();

        // three's viewport takes CSS pixels, multiplies by the ratio and
        // rounds (r186), so `size / ratio` is exactly `size` device pixels,
        // the square copied out below.
        const css = size / ratio;
        renderer.setRenderTarget(null);
        renderer.setViewport(0, 0, css, css);
        renderer.setScissor(0, 0, css, css);
        renderer.setScissorTest(true);
        renderer.render(scene, camera);

        const out = doc.createElement('canvas');
        out.width = size;
        out.height = size;
        const ctx = out.getContext('2d');
        // GL's origin is the bottom left; the canvas's is the top left.
        ctx.drawImage(canvas, 0, canvas.height - size, size, size, 0, 0, size, size);

        renderer.setViewport(viewport);
        renderer.setScissor(scissor);
        renderer.setScissorTest(scissorTest);
        renderer.setRenderTarget(target);

        let src = out.toDataURL('image/png');
        if (src.length > jpegAbove) src = out.toDataURL('image/jpeg', 0.9);
        return validPortraitSrc(src) ? src : null;
    } catch (e) {
        return null;
    } finally {
        if (figure) figure.dispose();
    }
}
