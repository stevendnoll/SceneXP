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
    SKINS, BUILDS, HAIR_COLORS, SHIRTS
} from './avatar-1.0.0.min.js';
import { createPerson } from './people-1.0.0.min.js';

/**
 * The portrait's render version. Bump it whenever the figure's look changes,
 * so a portrait drawn before is drawn again (PLANNING 3.5): /avatar/ and the
 * scenes compare it with the one stored. 2 (2026-10-24): the pieces, and
 * a closer portrait.
 */
export const RENDER_VERSION = 2;

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

/** The lips on the front of `head` (the rig's head mesh): a slim arc, lowest
 *  in the middle, sunk a little into the face so it reads as lips. */
function buildSmile(head, color, s = SMILE) {
    const headR = head.geometry.parameters.radius;
    const { radius: r, arc } = smileArc(s.width, s.lift);
    const lips = new THREE.Mesh(
        new THREE.TorusGeometry(r, s.thickness, 6, 20, arc),
        new THREE.MeshStandardMaterial({ color, roughness: 0.55 })
    );
    lips.name = 'smile';
    // The torus's arc starts at +x and runs counterclockwise: turned so its
    // middle points straight down, its center `r` above the smile's middle.
    lips.rotation.z = Math.PI * 1.5 - arc / 2;
    const y = head.position.y - s.drop;
    lips.position.set(0, y + r, Math.sqrt(headR * headR - s.drop * s.drop) - s.thickness * 0.4);
    lips.castShadow = false;
    return lips;
}

// ---- The skirt ----------------------------------------------------------------

/**
 * How much wider the skirt is drawn per unit of the build's `hips`. The
 * rig's skirt was sized for straight legs: with hips at 1 (Curvy) the thighs
 * came 2 cm through it at the top, measured against real three. 1.18 clears
 * them with about a centimeter to spare (tests/shared-avatar-figure).
 */
export const SKIRT_FLARE = 0.18;

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
 * Sunglasses are square frames a size up with dark lenses.
 */
export const GLASSES_SIZE = Object.freeze({
    x: 0.035, y: 0.02, z: 0.143, tube: 0.0026, bridgeLift: 0.004,
    round: { r: 0.021, sides: 16, turn: 0, frame: 0x3b2a20 },
    square: { r: 0.027, sides: 4, turn: Math.PI / 4, frame: 0x1d1d1f },
    sunglasses: { r: 0.029, sides: 4, turn: Math.PI / 4, frame: 0x161618, lens: 0x22262c },
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

function buildFacial(kind, c, color) {
    const F = FACIAL_SIZE;
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
        group.add(band(c, F.stubble.r, F.beard, shadow));
        group.add(band(c, F.stubble.r, F.stubble.lip, shadow));
    } else {
        group.add(mustache());
        if (kind === 'goatee') group.add(band(c, F.chin.r, F.chin, solid));
        if (kind === 'beard') group.add(band(c, F.beard.r, F.beard, solid));
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
 * Sneakers, over the rig's block shoe: a white sole a little proud of the
 * upper all round (light gray under a white shoe, so it still reads), and a
 * lace panel on top toward the toe. Sized from each shoe's own box, so a
 * slender build's narrower shoe gets a narrower sole.
 */
export const SNEAKER_SIZE = Object.freeze({ sole: 0.02, proud: 0.004, toe: 0.006, soleColor: 0xf4f3ef, soleOnWhite: 0xc9c5bd, laceColor: 0xf4f3ef });

function dressSneakers(person, whiteShoe) {
    const S = SNEAKER_SIZE;
    const sole = new THREE.MeshStandardMaterial({ color: whiteShoe ? S.soleOnWhite : S.soleColor, roughness: 0.7 });
    const lace = new THREE.MeshStandardMaterial({ color: S.laceColor, roughness: 0.8 });
    const shoes = [];
    person.traverse((o) => {
        if (o.isMesh && o.userData.isShoe && o.geometry.type === 'BoxGeometry') shoes.push(o);
    });
    for (const shoe of shoes) {
        const { width: w, height: h, depth: l } = shoe.geometry.parameters;
        const s = new THREE.Mesh(new THREE.BoxGeometry(w + 2 * S.proud, S.sole, l + 2 * S.toe), sole);
        s.position.set(shoe.position.x, shoe.position.y - h / 2 + S.sole / 2, shoe.position.z);
        s.name = 'sole';
        shoe.parent.add(s);
        const laces = new THREE.Mesh(new THREE.BoxGeometry(w * 0.45, 0.004, l * 0.34), lace);
        laces.position.set(shoe.position.x, shoe.position.y + h / 2 + 0.002, shoe.position.z + l * 0.1);
        laces.name = 'laces';
        shoe.parent.add(laces);
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
    person.add(buildSmile(head, lipsColor(optionOf(SKINS, a.skin).color)));

    if (a.bottom === 'skirt') {
        const skirt = person.children.find((o) => o.userData.isSkirt);
        const k = 1 + SKIRT_FLARE * optionOf(BUILDS, a.build).hips;
        skirt.scale.set(k, 1, k);
    }

    person.traverse((o) => {
        if (o.isMesh && o.name !== 'smile') o.castShadow = true;
    });

    // The pieces the rig has no option for (M5), after the shadows above:
    // none of them casts one (a hat's shadow would darken the whole face).
    const c = head.position;
    if (a.glasses !== 'none') person.add(buildGlasses(a.glasses, c));
    if (a.facial !== 'none') person.add(buildFacial(a.facial, c, optionOf(HAIR_COLORS, a.hair).color));
    if (a.hat !== 'none') {
        const hair = person.children.find((o) => o.userData.isHair);
        person.add(buildHat(a.hat, c, optionOf(SHIRTS, a.hatColor).color, head, hair));
    }
    if (a.shoes === 'sneakers') dressSneakers(person, a.shoeColor === 'white');

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
