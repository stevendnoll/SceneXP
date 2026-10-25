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
 * THE WAVE AND THE LIPS' TINT ARE MAYA'S (www/whitestone/js/cast.js),
 * promoted here with Steve's leave on 2026-10-23 (PRD section 11, question
 * 3): her lips are a rose a little deeper than her skin, and every skin tone
 * gets the same tint of its own (`lipsColor`). The rig has no mouth, so
 * without one a face looks blank in a portrait; the mouths are this part's
 * own (`MOUTH_SIZE`).
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
    personConfig, withOverrides, normalizeAvatar, validPortraitSrc, colorOf
} from './avatar-1.0.0.min.js';
import { createPerson } from './people-1.0.0.min.js';
import { eachVertex } from './avatar-shapes-1.0.0.min.js';
import { buildHair, HAIR_DRAWN } from './avatar-hair-1.0.0.min.js';
import { buildHat, HAT_SIZE, trimUnder } from './avatar-hats-1.0.0.min.js';

// The hats and the hair are their own parts (2026-10-24); these are passed
// on for the scenes and the tests that read them here.
export { HAT_SIZE, trimUnder, HAIR_DRAWN };

/**
 * The portrait's render version. Bump it whenever the figure's look changes,
 * so a portrait drawn before is drawn again (PLANNING 3.5): /avatar/ and the
 * scenes compare it with the one stored. 2 (2026-10-24): the pieces, and
 * a closer portrait. 3 (2026-10-24): the mouths, bare legs, boots. 4
 * (2026-10-24): the mouths redrawn as crescents and rounded pills. 5
 * (2026-10-24): the face (brows on every face, eyes, noses, cheeks, shape).
 * 6 (2026-10-24): a smoother head, solid beards.
 * 7 (2026-10-24): the hair styles (avatar-hair) and the hats (avatar-hats).
 * 8 (2026-10-24): the hair's solids turned right side out, and the parts.
 */
export const RENDER_VERSION = 8;

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

// ---- The mouth ----------------------------------------------------------------

/** How much of each channel of the skin the lips keep: Maya's lips over her
 *  skin (#A3564F over #BF8A66), so every tone gets a rose of its own. */
export const LIPS_TINT = Object.freeze([0.853, 0.623, 0.775]);

/** The lips' color for a skin color (display hex). */
export function lipsColor(skin) {
    const ch = [(skin >> 16) & 255, (skin >> 8) & 255, skin & 255].map((c, i) => Math.round(c * LIPS_TINT[i]));
    return (ch[0] << 16) | (ch[1] << 8) | ch[2];
}

/**
 * The mouths (Steve's QA, 2026-10-24), in meters on the rig's 0.12 m head.
 * EVERY MOUTH BUT THE "O" IS ONE SHAPE: a band across the face between a
 * top and a bottom edge (`mouthEdges`), bent up `lift` at the corners,
 * `top` above and `depth` below its middle line, which sits `drop` below the
 * head's middle. `round` sets how full its ends are (2 is an ellipse's): the
 * edges meet with an upright tangent, so the ends are round, never pointed.
 *
 *   smile      a soft crescent: no tube and no balls at its ends (QA: the
 *              first, a tube, looked like a worm, and its capped ends worse)
 *   smirk      the crescent with one side lifted (`skew`)
 *   bigSmile   open, the top teeth filling most of it, no tongue
 *   grin       wider and shallower, both rows of teeth
 *   surprised  a small round "o"
 *
 * THE SHAPES ARE BUILT AS A FINE GRID and laid onto the head's sphere point
 * by point (`onHead`). Built as a few long triangles across the mouth (the
 * first try), their middles sagged up to 2.6 mm inside the head, so the skin
 * showed through the open mouth (it read as a tongue) and the dark inside
 * through the teeth (QA, 2026-10-24). Each layer then sits a fraction of a
 * millimeter outside the last: the inside, the teeth, the lips.
 */
export const MOUTH_SIZE = Object.freeze({
    smile: { width: 0.042, lift: 0.0075, top: 0.0013, depth: 0.0029, round: 2.2, drop: 0.054 },
    smirk: { width: 0.04, lift: 0.006, skew: 0.0042, top: 0.0012, depth: 0.0026, round: 2.2, drop: 0.053 },
    bigSmile: { width: 0.048, lift: 0.009, top: 0.0015, depth: 0.0125, round: 2.4, lip: 0.0028, teeth: 0.0085, drop: 0.052 },
    grin: { width: 0.054, lift: 0.006, top: 0.0015, depth: 0.0105, round: 2.4, lip: 0.0026, teeth: 0.0055, lower: 0.0035, drop: 0.054 },
    surprised: { r: 0.0085, tube: 0.0035, drop: 0.057 },
    /** How far out from the head's middle each layer lies. */
    layers: { inside: 0.1205, teeth: 0.1209, lips: 0.1213 },
    inside: 0x2a1013,
    teeth: 0xf3efe6
});

/**
 * A mouth's top and bottom edges at `u` (-1 to 1 across it). `grow` widens
 * it all round (the lips round an open mouth).
 */
export function mouthEdges(m, u, grow = 0) {
    const bulge = (1 - Math.min(1, Math.abs(u)) ** m.round) ** (1 / m.round);
    const bend = m.lift * u * u + (m.skew || 0) * u;
    return { top: bend + (m.top + grow) * bulge, bottom: bend - (m.depth + grow) * bulge };
}

/** Points across a mouth, close together at the ends, where the edges turn
 *  fastest. */
function across(n = 32) {
    return Array.from({ length: n + 1 }, (_, i) => -Math.cos((Math.PI * i) / n));
}

/** A point (x across, y up, in meters from the mouth's middle) laid onto the
 *  head's sphere at `r` from its middle `c`. */
function onHead(x, y, c, r, drop, R = 0.12) {
    const t = Math.acos(-drop / R) - y / R;
    const a = x / R;
    return [c.x + r * Math.sin(t) * Math.sin(a), c.y + r * Math.cos(t), c.z + r * Math.sin(t) * Math.cos(a)];
}

/**
 * A grid laid onto the head: `columns` from left to right, each the same
 * number of [x, y] points from bottom to top. Every cell is small, so it
 * stays on the sphere.
 */
function sheet(columns, c, r, drop) {
    const positions = [];
    const index = [];
    const n = columns[0].length;
    columns.forEach((column, i) => {
        column.forEach(([x, y], j) => {
            positions.push(...onHead(x, y, c, r, drop));
            if (i > 0 && j > 0) {
                const a = (i - 1) * n + j - 1;
                const b = i * n + j - 1;
                index.push(a, b, b + 1, a, b + 1, a + 1);
            }
        });
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    return geometry;
}

/** The grid between two edges, `low(u)` and `high(u)`, across `hw` either
 *  side of the middle, `rows` points from one to the other. */
function between(hw, low, high, rows = 5, cx = 0, n = 32) {
    return across(n).map((u) => {
        const y0 = low(u);
        const y1 = Math.max(y0, high(u));
        return Array.from({ length: rows }, (_, j) => [cx + u * hw, y0 + ((y1 - y0) * j) / (rows - 1)]);
    });
}

/** The ring round an open mouth: from its own outline out to the outline
 *  grown by `lip`, all the way round. */
function ring(m) {
    const loop = (grow) => {
        const hw = m.width / 2 + grow;
        const us = across();
        const top = us.map((u) => [u * hw, mouthEdges(m, u, grow).top]);
        const bottom = us.slice(1, -1).reverse().map((u) => [u * hw, mouthEdges(m, u, grow).bottom]);
        return top.concat(bottom);
    };
    const inner = loop(0);
    const outer = loop(m.lip);
    const columns = inner.map((p, i) => [p, outer[i]]);
    return columns.concat([columns[0]]);
}

/** The mouth: a group named 'mouth' on the person, its lips colored
 *  `color`. */
function buildMouth(kind, head, color) {
    const M = MOUTH_SIZE;
    const L = M.layers;
    const c = head.position;
    const group = new THREE.Group();
    group.name = 'mouth';
    const material = (hex, roughness) => new THREE.MeshStandardMaterial({ color: hex, roughness, side: THREE.DoubleSide });
    const lipsMaterial = material(color, 0.55);
    const add = (geometry, mat, name) => {
        const mesh = new THREE.Mesh(geometry, mat);
        mesh.name = name;
        mesh.castShadow = false;
        group.add(mesh);
        return mesh;
    };
    if (kind === 'surprised') {
        const m = M.surprised;
        // Stood on the face, tipped to its slope at that height.
        const tilt = Math.asin(m.drop / 0.12);
        const z = Math.sqrt(0.12 * 0.12 - m.drop * m.drop);
        const lips = add(new THREE.TorusGeometry(m.r, m.tube, 8, 20), lipsMaterial, 'lips');
        lips.position.set(c.x, c.y - m.drop, c.z + z);
        lips.rotation.x = tilt;
        const hole = add(new THREE.CircleGeometry(m.r, 16), material(M.inside, 0.9), 'inside');
        hole.position.set(c.x, c.y - m.drop, c.z + z + 0.0008);
        hole.rotation.x = tilt;
        return group;
    }
    const m = M[kind];
    const hw = m.width / 2;
    const edge = (side) => (u) => mouthEdges(m, u)[side];
    if (kind === 'smile' || kind === 'smirk') {
        // A closed mouth: the crescent itself is the lips.
        add(sheet(between(hw, edge('bottom'), edge('top')), c, L.lips, m.drop), lipsMaterial, 'lips');
        return group;
    }
    add(sheet(between(hw, edge('bottom'), edge('top')), c, L.inside, m.drop), material(M.inside, 0.9), 'inside');
    const teeth = material(M.teeth, 0.35);
    // The top teeth: from the top of the opening down `teeth`, never past
    // its bottom. The grin's bottom teeth: up from its bottom `lower`,
    // leaving a dark line between the rows.
    add(sheet(between(hw, (u) => Math.max(edge('top')(u) - m.teeth, edge('bottom')(u)), edge('top')), c, L.teeth, m.drop), teeth, 'teeth');
    if (m.lower) {
        const high = (u) => Math.min(edge('bottom')(u) + m.lower, edge('top')(u) - m.teeth - 0.0012);
        add(sheet(between(hw, edge('bottom'), high), c, L.teeth, m.drop), teeth, 'teeth');
    }
    add(sheet(ring(m), c, L.lips, m.drop), lipsMaterial, 'lips');
    return group;
}

// ---- The face: its shape, the eyes, the eyebrows, the nose, the cheeks ----------
//
// Steve's QA, 2026-10-24. Everything here is built about the head's own
// middle, inside the HEAD GROUP (`gatherHead`), so an oval face is that group
// drawn taller and narrower, and every feature on it (and the hair, the
// glasses, the beard and the hat) follows without being moved one by one.

/** The avatar's head's sides, around and top to bottom (the rig's are 16
 *  by 12). */
export const HEAD_SEGMENTS = Object.freeze([32, 24]);

/** Each face shape's stretch of the head, across, up and out. Round is the
 *  rig's own sphere. */
export const FACE_SCALE = Object.freeze({ round: Object.freeze([1, 1, 1]), oval: Object.freeze([0.94, 1.09, 0.97]) });

/**
 * Gather the head and everything on it (the eyes, the pupils, the nose, the
 * ears, the hair) into one group at the head's middle, stretched to `scale`.
 * Each keeps its place: its position becomes its offset from the middle, and
 * the hair's own pieces are re-based the same way, so the group's coordinates
 * ARE the head's (the hats and the trims read them). Returns the group.
 */
function gatherHead(person, scale) {
    const head = person.children.find((o) => o.userData.isHead);
    // A smoother head than the rig's (16 by 12 sides), the same size: the
    // rig's flat sides sit up to 3 mm inside the round head every face piece
    // is fitted to, and showed as gaps under a beard (Steve's QA,
    // 2026-10-24). One figure a scene can afford it; a crowd keeps the rig's.
    const { radius } = head.geometry.parameters;
    head.geometry.dispose();
    head.geometry = new THREE.SphereGeometry(radius, HEAD_SEGMENTS[0], HEAD_SEGMENTS[1]);
    const c = head.position.clone();
    const group = new THREE.Group();
    group.name = 'head';
    group.position.copy(c);
    group.scale.set(...scale);
    const parts = person.children.filter((o) => o.userData.isHead || o.userData.isEye || o.userData.isPupil
        || o.userData.isNose || o.userData.isEar || o.userData.isHair);
    for (const o of parts) {
        person.remove(o);
        if (o.userData.isHair) {
            for (const piece of o.children) piece.position.sub(c);
            o.name = 'hair';
        } else {
            o.position.sub(c);
        }
        group.add(o);
    }
    person.add(group);
    return group;
}

/**
 * The eyes' shapes, made from the rig's own eye (a white, flattened ball) and
 * pupil:
 *
 *   almond  wider and shorter
 *   wide    larger all round
 *   sleepy  a lid of skin over the top half, pupil and all
 *   lashes  the round eye with a dark lash line over it, flicked at the
 *           outer corner
 */
export const EYE_SIZE = Object.freeze({
    almond: { eye: [1.25, 0.72], pupil: [1, 0.9] },
    wide: { eye: [1.2, 1.2], pupil: [1.15, 1.15] },
    // Tipped back a touch, so the lid stops just above the eye's middle and
    // the lower part of the pupil shows (preview, 2026-10-24: tipped forward
    // it closed the eye).
    sleepy: { lid: 0.0196, reach: 1.32, tilt: -0.08 },
    lashes: { r: 0.0192, tube: 0.0016, from: 0.2, to: 0.8, flick: [0.007, 0.0016], color: 0x1a1412 }
});

function shapeEyes(face, kind, skin) {
    const E = EYE_SIZE;
    const eyes = face.children.filter((o) => o.userData.isEye);
    const pupils = face.children.filter((o) => o.userData.isPupil);
    if (E[kind] && E[kind].eye) {
        for (const e of eyes) e.scale.set(E[kind].eye[0], E[kind].eye[1], e.scale.z);
        for (const p of pupils) p.scale.set(E[kind].pupil[0], E[kind].pupil[1], p.scale.z);
    }
    if (kind === 'sleepy') {
        for (const e of eyes) {
            // The top half of a ball the eye's size, reaching forward past
            // the pupil.
            const lid = new THREE.Mesh(new THREE.SphereGeometry(E.sleepy.lid, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), skin);
            lid.position.copy(e.position);
            lid.scale.z = E.sleepy.reach;
            lid.rotation.x = E.sleepy.tilt;
            lid.name = 'lid';
            face.add(lid);
        }
    }
    if (kind === 'lashes') {
        const L = E.lashes;
        const dark = new THREE.MeshStandardMaterial({ color: L.color, roughness: 0.8 });
        for (const e of eyes) {
            const side = Math.sign(e.position.x);
            const line = new THREE.Mesh(new THREE.TorusGeometry(L.r, L.tube, 5, 14, Math.PI * (L.to - L.from)), dark);
            line.rotation.z = Math.PI * L.from;
            line.position.set(e.position.x, e.position.y, e.position.z + 0.009);
            line.name = 'lashes';
            face.add(line);
            const flick = new THREE.Mesh(new THREE.BoxGeometry(L.flick[0], L.flick[1], L.flick[1]), dark);
            const end = Math.PI * (side > 0 ? L.from : L.to);
            flick.position.set(e.position.x + Math.cos(end) * L.r + side * 0.002, e.position.y + Math.sin(end) * L.r + 0.0015, e.position.z + 0.009);
            flick.rotation.z = side * 0.6;
            flick.name = 'lashes';
            face.add(flick);
        }
    }
    face.traverse((o) => {
        if (o.name === 'lid' || o.name === 'lashes') o.castShadow = false;
    });
}

/**
 * The eyebrows, in the hair's color a shade darker, laid on the head like the
 * mouth: each a tapered band `width` wide, `x` either side of the middle and
 * `y` above it, its middle `arch` higher than its ends, its inner end `tilt`
 * lower than its outer, `thick` at its fullest. A surprised face raises them
 * `surprised`.
 */
export const BROW_SIZE = Object.freeze({
    // A little wider than the eye and full enough to read at a distance
    // (preview, 2026-10-24: narrower and thinner, they all but vanished).
    x: 0.037, y: 0.046, width: 0.034, round: 2.4, darker: 0.75, surprised: 0.004,
    natural: { arch: 0.003, thick: 0.0047, tilt: 0.0015 },
    straight: { arch: 0, thick: 0.0047, tilt: 0 },
    arched: { arch: 0.0068, thick: 0.004, tilt: 0.002 },
    bold: { arch: 0.003, thick: 0.0072, tilt: 0.0015 },
    thin: { arch: 0.0035, thick: 0.0025, tilt: 0.0015 }
});

function buildBrows(kind, color, raised = false) {
    const B = BROW_SIZE;
    const spec = B[kind];
    const group = new THREE.Group();
    group.name = 'brows';
    const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(B.darker), roughness: 0.95, side: THREE.DoubleSide });
    const hw = B.width / 2;
    for (const side of [-1, 1]) {
        // u runs left to right; the inner end is the one nearer the nose.
        const line = (u) => spec.arch * (1 - u * u) - spec.tilt * u * side;
        const bulge = (u) => (1 - Math.abs(u) ** B.round) ** (1 / B.round);
        const brow = new THREE.Mesh(sheet(between(hw, (u) => line(u) - (spec.thick / 2) * bulge(u), (u) => line(u) + (spec.thick / 2) * bulge(u), 4, side * B.x, 16),
            new THREE.Vector3(), 0.1212, -(B.y + (raised ? B.surprised : 0))), material);
        brow.name = 'brow';
        brow.castShadow = false;
        group.add(brow);
    }
    return group;
}

/** The noses other than the rig's own pointed one: a ball, `r` across,
 *  stretched by `scale`, its middle `at` from the head's. */
export const NOSE_SIZE = Object.freeze({
    button: { r: 0.011, scale: [1, 1, 1], at: [0, -0.012, 0.118] },
    round: { r: 0.016, scale: [1, 0.85, 0.8], at: [0, -0.012, 0.114] },
    wide: { r: 0.015, scale: [1.5, 0.75, 0.7], at: [0, -0.014, 0.113] }
});

function shapeNose(face, kind, skin) {
    const spec = NOSE_SIZE[kind];
    if (!spec) return;
    const rig = face.children.find((o) => o.userData.isNose);
    rig.visible = false;
    const nose = new THREE.Mesh(new THREE.SphereGeometry(spec.r, 14, 10), skin);
    nose.scale.set(...spec.scale);
    nose.position.set(...spec.at);
    nose.name = 'nose';
    face.add(nose);
}

/** The cheeks: a soft see-through blush, or a scatter of freckles a shade of
 *  the skin's own, `x` either side and `y` below the head's middle. */
export const CHEEK_SIZE = Object.freeze({
    x: 0.058, y: 0.012, blush: { r: 0.016, color: 0xe2737a, opacity: 0.32 },
    freckles: { r: 0.0025, darker: 0.62, dots: [[-0.012, 0.004], [-0.004, 0.009], [0.005, 0.005], [0.012, 0.001], [-0.008, -0.004], [0.002, -0.002], [0.009, -0.007], [-0.002, 0.012]] }
});

function buildCheeks(kind, skinColor) {
    const K = CHEEK_SIZE;
    const group = new THREE.Group();
    group.name = 'cheeks';
    const round = (r) => (u) => r * Math.sqrt(Math.max(0, 1 - u * u));
    const disc = (cx, cy, r, material, n = 12) => {
        const mesh = new THREE.Mesh(sheet(between(r, (u) => -round(r)(u), round(r), 4, cx, n), new THREE.Vector3(), 0.1211, cy), material);
        mesh.castShadow = false;
        group.add(mesh);
        return mesh;
    };
    if (kind === 'blush') {
        const material = new THREE.MeshStandardMaterial({ color: K.blush.color, roughness: 1, transparent: true, opacity: K.blush.opacity, depthWrite: false, side: THREE.DoubleSide });
        for (const side of [-1, 1]) disc(side * K.x, K.y, K.blush.r, material, 24).name = 'blush';
    } else if (kind === 'freckles') {
        const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(skinColor).multiplyScalar(K.freckles.darker), roughness: 1, side: THREE.DoubleSide });
        for (const side of [-1, 1]) {
            for (const [dx, dy] of K.freckles.dots) disc(side * (K.x + dx), K.y - dy, K.freckles.r, material, 6).name = 'freckle';
        }
    }
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
 *  lower cylinders), the knee, and the shoe. THE RIG'S OWN PARTS ONLY: they
 *  are the leg's unnamed meshes, and everything this part adds is named.
 *  (Steve's QA, 2026-10-24: in shorts the hem was taken for the shin, and
 *  every boot came out the width of the hem.) */
function legParts(leg) {
    const cylinders = leg.children.filter((m) => m.isMesh && !m.name && m.geometry.type === 'CylinderGeometry')
        .sort((a, b) => b.position.y - a.position.y);
    return {
        thigh: cylinders[0],
        shin: cylinders[1],
        knee: leg.children.find((m) => m.isMesh && !m.name && m.geometry.type === 'SphereGeometry'),
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
 * A band with THICKNESS: its outer surface `rOut` from the head's middle,
 * its inner one `rIn` (on the skin), and walls closing it all the way round
 * its edge. A beard drawn as a single shell stood off the face with air
 * under its edges, which showed as a gap at the jaw and the cheeks (Steve's
 * QA, 2026-10-24); a closed band sits on the face like hair does.
 */
function solidBand(c, rIn, rOut, { half, top, bottom }, material, across = 36, down = 10) {
    const at = (i, j) => {
        const a = -half + (2 * half * i) / across;
        const t0 = along(top, Math.abs(a));
        const t1 = along(bottom, Math.abs(a));
        return [a, t0 + ((t1 - t0) * j) / down];
    };
    const point = ([a, t], r) => [c.x + r * Math.sin(t) * Math.sin(a), c.y + r * Math.cos(t), c.z + r * Math.sin(t) * Math.cos(a)];
    const positions = [];
    const index = [];
    const surface = (r, flip) => {
        const base = positions.length / 3;
        for (let i = 0; i <= across; i++) {
            for (let j = 0; j <= down; j++) {
                positions.push(...point(at(i, j), r));
                if (i > 0 && j > 0) {
                    const p = base + i * (down + 1) + j;
                    const q = base + (i - 1) * (down + 1) + j;
                    if (flip) index.push(q - 1, p, p - 1, q - 1, q, p);
                    else index.push(q - 1, p - 1, p, q - 1, p, q);
                }
            }
        }
    };
    surface(rOut, false);
    surface(rIn, true);
    // The walls: round the edge of the grid, inner to outer.
    const edge = [];
    for (let i = 0; i <= across; i++) edge.push(at(i, 0));
    for (let j = 1; j <= down; j++) edge.push(at(across, j));
    for (let i = across - 1; i >= 0; i--) edge.push(at(i, down));
    for (let j = down - 1; j >= 1; j--) edge.push(at(0, j));
    const base = positions.length / 3;
    edge.forEach((p) => positions.push(...point(p, rIn), ...point(p, rOut)));
    for (let k = 0; k < edge.length; k++) {
        const n = (k + 1) % edge.length;
        const a = base + 2 * k;
        const d = base + 2 * n;
        index.push(a, a + 1, d + 1, a, d + 1, d);
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
    /** The goatee and the beard are solid bands, `inner` on the skin and
     *  `r` at their outside (Steve's QA, 2026-10-24: a shell 7 mm off the
     *  face showed a gap at the jaw). */
    chin: { r: 0.1245, inner: 0.1203, half: 0.32, top: [[0, 2.13]], bottom: [[0, 2.75]] },
    /** The beard: under the lips at the front, round the corners of the
     *  mouth, and up the cheeks to the sideburns by the ears. */
    beard: {
        r: 0.1255, inner: 0.1203, half: 1.66,
        top: [[0, 2.13], [0.2, 2.13], [0.36, 1.96], [1.0, 1.72], [1.5, 1.5], [1.66, 1.45]],
        bottom: [[0, 2.95]]
    },
    stubble: { r: 0.1207, lip: { half: 0.3, top: [[0, 1.82]], bottom: [[0, 1.91]] }, opacity: 0.42 }
});

/** Below the mouth, the beard, the goatee and the stubble keep this far
 *  clear of its lowest point (an open mouth reaches lower than the gentle
 *  smile: preview, 2026-10-24, the beard crossed the grin). */
export const BELOW_MOUTH = 0.006;

/** And the stubble's upper-lip shadow keeps this far above its highest. */
export const ABOVE_MOUTH = 0.003;

/** An edge's [angle, polar] points with its front (every point up to
 *  `front` radians from straight ahead) moved down to at least `polar`. */
function lowerFront(points, polar, front = 0.2) {
    return points.map(([a, t]) => [a, a <= front ? Math.max(t, polar) : t]);
}

/** `mouth` is the mouth's lowest and highest points (`bottom`, `top`),
 *  measured from the head's middle. */
function buildFacial(kind, c, color, mouth = { bottom: -MOUTH_SIZE.smile.drop - 0.003, top: -MOUTH_SIZE.smile.drop + 0.009 }) {
    const F = FACIAL_SIZE;
    // The polar angle on a sphere of radius `r` just under the mouth.
    const under = (r) => Math.acos(Math.max(-1, (mouth.bottom - BELOW_MOUTH) / r));
    // The upper lip's shadow ends a little above the mouth's highest point
    // (a smirk's raised corner reaches into it: QA by test, 2026-10-24).
    const lip = () => {
        const bottom = Math.min(along(F.stubble.lip.bottom, 0), Math.acos((mouth.top + ABOVE_MOUTH) / F.stubble.r));
        return { ...F.stubble.lip, bottom: [[0, Math.max(bottom, along(F.stubble.lip.top, 0) + 0.01)]] };
    };
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
        group.add(band(c, F.stubble.r, lip(), shadow));
    } else {
        group.add(mustache());
        if (kind === 'goatee') group.add(solidBand(c, F.chin.inner, F.chin.r, { ...F.chin, top: lowerFront(F.chin.top, under(F.chin.r), Infinity) }, solid));
        if (kind === 'beard') group.add(solidBand(c, F.beard.inner, F.beard.r, beard(F.beard.r), solid));
    }
    group.traverse((o) => {
        if (o.isMesh) o.castShadow = false;
    });
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

/**
 * More shoes (Steve, 2026-10-24: "sandals, high heels, platforms, slippers,
 * etc."), each from the rig's block shoe, in a leg's coordinates:
 *
 *   sandals     the foot itself (the block in the skin's color) on a thin
 *               sole, held by a toe strap, an instep strap and a heel strap
 *   flats       the foot in a low shoe to `rise`, a bow on the toe
 *   heels       the shoe tilted up at the back by `heel` over a slim heel
 *               column, its toe still on the floor (the figure's height is
 *               unchanged)
 *   platforms   a thick sole `sole` under the shoe, and the whole figure
 *               stood up on it (platforms make you taller)
 *   slippers    a fleece cuff round the opening and a rounded toe
 */
export const SHOE_SIZE = Object.freeze({
    sandals: { sole: 0.012, proud: 0.003, strap: 0.005, straps: [0.78, 0.42], heelStrap: 0.72 },
    flats: { rise: 0.026, proud: 0.002, bow: [0.018, 0.006, 0.007] },
    heels: { heel: 0.055, column: [0.022, 0.024], overlap: 0.014 },
    platforms: { sole: 0.04, proud: 0.004, shade: 0.72 },
    slippers: { cuff: 0.009, fleece: 0xf4ead8, toe: 0.024 }
});

function dressShoes(person, kind, color, skin) {
    const spec = SHOE_SIZE[kind];
    const shoeMat = new THREE.MeshStandardMaterial({ color, roughness: kind === 'slippers' ? 1 : 0.6 });
    const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(spec.shade || 0.6), roughness: 0.75 });
    let lift = 0;
    for (const { shoe, w, h, l, floor, z } of blockShoes(person)) {
        const leg = shoe.parent;
        if (kind === 'sandals') {
            shoe.material = skin;
            leg.add(block([w + 2 * spec.proud, spec.sole, l + 2 * spec.proud], floor, z, shoeMat, 'sole'));
            // Each strap: a bar over the top of the foot, and a bar down each
            // side, a little proud of it.
            for (const f of spec.straps) {
                const zc = z - l / 2 + f * l;
                leg.add(block([w + 0.008, spec.strap, 0.012], floor + h, zc, shoeMat, 'strap'));
                for (const s of [-1, 1]) {
                    const bar = block([0.004, h * 0.6, 0.012], floor + h * 0.4, zc, shoeMat, 'strap');
                    bar.position.x = s * (w / 2 + 0.002);
                    leg.add(bar);
                }
            }
            const back = block([w + 0.008, spec.strap, 0.004], floor + h * spec.heelStrap, z - l / 2 - 0.002, shoeMat, 'strap');
            leg.add(back);
        } else if (kind === 'flats') {
            shoe.material = skin;
            leg.add(block([w + 2 * spec.proud, spec.rise, l + 2 * spec.proud], floor, z, shoeMat, 'upper'));
            leg.add(block(spec.bow, floor + spec.rise - 0.002, z + l / 2 - 0.012, dark, 'bow'));
        } else if (kind === 'heels') {
            // Tilted about its toe: turned up at the back by `heel`, and
            // raised so the toe's bottom edge stays on the floor.
            const angle = Math.asin(Math.min(0.9, spec.heel / l));
            shoe.rotation.x = angle;
            shoe.position.y = floor + (h / 2) * Math.cos(angle) + (l / 2) * Math.sin(angle);
            shoe.position.z = z - (h / 2) * Math.sin(angle);
            const column = block([spec.column[0], spec.heel + spec.overlap, spec.column[1]], floor, z - l / 2 + spec.column[1] / 2 + 0.004, dark, 'heel');
            leg.add(column);
        } else if (kind === 'platforms') {
            leg.add(block([w + 2 * spec.proud, spec.sole, l + 2 * spec.proud], floor - spec.sole, z, dark, 'sole'));
            lift = spec.sole;
        } else if (kind === 'slippers') {
            const fleece = new THREE.MeshStandardMaterial({ color: spec.fleece, roughness: 1 });
            const cuff = new THREE.Mesh(new THREE.TorusGeometry(w / 2 + 0.002, spec.cuff, 8, 18), fleece);
            cuff.rotation.x = Math.PI / 2;
            cuff.scale.set(1, 1.15, 0.75);
            cuff.position.set(0, floor + h + 0.002, z - l / 2 + w / 2 + 0.01);
            cuff.name = 'cuff';
            cuff.castShadow = true;
            leg.add(cuff);
            const toe = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), shoeMat);
            toe.scale.set(w / 2 + 0.001, h / 2 + 0.001, spec.toe);
            toe.position.set(0, floor + h / 2, z + l / 2 - 0.004);
            toe.name = 'toe';
            toe.castShadow = true;
            leg.add(toe);
            shoe.material = shoeMat;
        }
    }
    return lift;
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
    // A style drawn by avatar-hair (the short cut among them, since the
    // rig's is a bowl) asks the rig for none of its own.
    const ownHair = HAIR_DRAWN.includes(a.length);
    const person = createPerson({ ...personConfig(a), role, ...extra, ...(ownHair ? { bald: true } : {}) });
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

    // The head and everything on it in one group at its middle (the face's
    // shape is that group's stretch). From here on, every piece of the face
    // is built about that middle, at the origin of the group.
    const face = gatherHead(person, FACE_SCALE[a.faceShape]);
    const c = head.position;
    const skinColor = colorOf('skin', a.skin);
    const hairColor = colorOf('hair', a.hair);
    if (ownHair) face.add(buildHair(a.length, hairColor, { skin: skinColor }));
    shapeEyes(face, a.eyeShape, skin);
    shapeNose(face, a.nose, skin);
    face.add(buildBrows(a.brows, hairColor, a.mouth === 'surprised'));
    if (a.cheeks !== 'none') face.add(buildCheeks(a.cheeks, skinColor));
    face.add(buildMouth(a.mouth, head, colorOf('lips', a.lips) ?? lipsColor(skinColor)));

    // The pieces the rig has no option for (M5), after the shadows above:
    // none of them casts one (a hat's shadow would darken the whole face).
    if (a.glasses !== 'none') face.add(buildGlasses(a.glasses, c));
    if (a.facial !== 'none') {
        const mouth = { bottom: Infinity, top: -Infinity };
        eachVertex([face.children.find((o) => o.name === 'mouth')], (v) => {
            mouth.bottom = Math.min(mouth.bottom, v.y - c.y);
            mouth.top = Math.max(mouth.top, v.y - c.y);
        });
        face.add(buildFacial(a.facial, c, colorOf('facialColor', a.facialColor) ?? hairColor, mouth));
    }
    if (a.hat !== 'none') {
        const hair = face.children.find((o) => o.userData.isHair) || null;
        face.add(buildHat(a.hat, colorOf('hatColor', a.hatColor), head, hair));
    }
    const shoeColor = colorOf('shoeColor', a.shoeColor);
    // A white or nearly white shoe (a custom one too) gets the gray trim. The
    // display color's own lightness: three's Color holds it in linear light,
    // where white reads darker than it looks.
    const light = (((shoeColor >> 16) & 255) * 0.299 + ((shoeColor >> 8) & 255) * 0.587 + (shoeColor & 255) * 0.114) / 255;
    if (a.shoes === 'sneakers') dressSneakers(person, light > 0.85);
    else if (BOOT_SIZE[a.shoes]) dressBoots(person, a.shoes, shoeColor);
    // Platforms stand the whole figure up by their sole.
    else if (SHOE_SIZE[a.shoes]) person.position.y += dressShoes(person, a.shoes, shoeColor, skin);

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
