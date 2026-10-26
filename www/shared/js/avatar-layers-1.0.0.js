// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * avatar-layers.js - the one-pieces and the underlayer (Steve's QA,
 * 2026-10-26: "a leotard/bodysuit option so avatars can look like wrestlers
 * or ballerinas", and "socks, nylons, fishnets, thigh highs, long johns" so
 * they can "resemble goth/punk personas"). Each is drawn OVER the rig's own
 * figure the way the wardrobe's pieces are, found by its tags and measures,
 * and nothing here changes a scene's rig.
 *
 *   one-pieces  leotard (sleeveless) and bodysuit (long sleeves): the
 *               shirt's color carried down over the hips in a brief that
 *               hides the belt, so the figure can wear bare legs, or a
 *               skirt or shorts over it
 *   legwear     crew socks, knee socks, thigh highs, sheer tights, tights,
 *               fishnets, long johns, leg warmers: thin shells over the
 *               legs' cylinders WHERE THE LEG IS BARE (the shirt's and the
 *               bottom's cloth stays on top; under pants only what shows at
 *               the ankle is drawn), in a chosen color
 *   armwear     fishnet sleeves, long gloves, arm warmers, thermal sleeves:
 *               the same over the arms where they are bare
 *
 * Fishnets are the one pattern: a diamond lattice drawn once onto a small
 * canvas (`fishnetMaterial`) and repeated round every shell. Where there is
 * no document to draw on (the tests, the preview renderer) a fishnet is a
 * sheer in its color instead, and says so (`userData.sheerFallback`).
 *
 * Uses the global THREE.
 */

import { legParts, bodyParts, torsoBox, torsoWidthAt, partShell } from './avatar-wardrobe-1.0.0.min.js';

/** The shirt styles that are one-pieces (SLEEVES ids). */
export const ONE_PIECE = Object.freeze(['leotard', 'bodysuit']);

/**
 * Every measure, meters:
 *
 *   brief       the one-piece's brief: `drop` below the torso's bottom,
 *               `proud` of the torso's width and depth, rounded by `round`
 *   shell       how far a thin layer stands off the skin
 *   crew        a crew sock's height above the ankle, and its cuff
 *   thighHigh   how far up the thigh a thigh high reaches (a share), and
 *               its band at the top, a shade darker
 *   sheer       a sheer tight's opacity
 *   fishnet     the lattice: `cells` diamonds across the canvas, the line's
 *               width as a share of a cell, and how many times it repeats
 *               round and down a shell; `fallback` is the sheer's opacity
 *               without a canvas
 *   longJohns   thicker than a tight, with an ankle cuff a shade darker
 *   legWarmers  baggy over the shin, flaring toward the knee, ribbed
 *   gloves      a long glove's shell over the forearm
 *   armWarmers  baggy over the forearm up to `up` of it, ribbed
 */
export const LAYER_SIZE = Object.freeze({
    brief: { drop: 0.1, proud: 0.012, round: 0.02 },
    shell: 0.0025,
    crew: { height: 0.09, cuff: 0.012 },
    thighHigh: { up: 0.55, band: 0.018, shade: 0.72 },
    sheer: 0.4,
    fishnet: { cells: 4, line: 0.1, repeat: [6, 5], fallback: 0.55 },
    longJohns: { over: 0.005, cuff: 0.025, shade: 0.82 },
    legWarmers: { over: 0.014, flare: 1.1, up: 0.92, rings: 3, shade: 0.85 },
    gloves: { over: 0.003 },
    armWarmers: { over: 0.008, up: 0.78, rings: 3, shade: 0.85 }
});

const material = (color, roughness = 0.9, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
const shade = (color, k) => new THREE.Color(color).multiplyScalar(k).getHex();
const isBare = (mesh, skin) => Boolean(mesh) && mesh.material === skin;

// ---- The one-pieces -----------------------------------------------------------------

/**
 * A leotard or a bodysuit: the collar hidden, the arms bared for the
 * leotard (the rig draws the shoulders and the upper arms in the shirt, as a
 * tank top does), and a brief in the shirt's `color` over the hips, from
 * the torso's bottom down, rounded, hiding the rig's belt. Named 'brief'.
 */
export function dressOnePiece(person, style, color, skin) {
    const { torso, collar, arms } = bodyParts(person);
    if (!torso) return null;
    if (collar) collar.visible = false;
    if (style === 'leotard') {
        for (const arm of arms) for (const m of arm.children) if (m.isMesh) m.material = skin;
    }
    const { height, depth } = torsoBox(torso);
    const bottom = torso.position.y - height / 2;
    const B = LAYER_SIZE.brief;
    const width = torsoWidthAt(torso, -height / 2, -height / 2 + 0.02) + 2 * B.proud;
    const d = depth + 2 * B.proud;
    const r = Math.min(B.round, width / 4, B.drop / 2);
    const shape = new THREE.Shape();
    const hw = width / 2;
    shape.moveTo(-hw, 0);
    shape.lineTo(hw, 0);
    shape.lineTo(hw, -B.drop + r);
    shape.absarc(hw - r, -B.drop + r, r, 0, -Math.PI / 2, true);
    shape.lineTo(-hw + r, -B.drop);
    shape.absarc(-hw + r, -B.drop + r, r, -Math.PI / 2, -Math.PI, true);
    shape.lineTo(-hw, 0);
    const brief = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false }), material(color, 0.85));
    brief.position.set(0, bottom + 0.004, -d / 2);
    brief.name = 'brief';
    brief.castShadow = true;
    person.add(brief);
    // The belt and its buckle, the rig's unnamed boxes at the belt line.
    for (const m of person.children) {
        if (m.isMesh && !m.name && m.geometry.type === 'BoxGeometry' && Math.abs(m.position.y - (bottom + 0.02)) < 0.005) m.visible = false;
    }
    return brief;
}

// ---- The pattern --------------------------------------------------------------------

/**
 * A fishnet in `color`: a diamond lattice on a transparent canvas, repeated
 * round and down whatever wears it. Without a document (tests, the preview
 * renderer) a sheer of the color, marked `userData.sheerFallback`.
 */
export function fishnetMaterial(color, doc = typeof document === 'undefined' ? null : document) {
    const F = LAYER_SIZE.fishnet;
    if (!doc || typeof doc.createElement !== 'function') {
        const sheer = material(color, 0.7, { transparent: true, opacity: F.fallback });
        sheer.userData.sheerFallback = true;
        return sheer;
    }
    const size = 64;
    const canvas = doc.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    ctx.strokeStyle = `#${(color >>> 0).toString(16).padStart(6, '0')}`;
    ctx.lineWidth = Math.max(1, (size / F.cells) * F.line);
    ctx.lineCap = 'square';
    const step = size / F.cells;
    // Two families of diagonals, each a cell apart, drawn past the edges so
    // the repeat has no seam.
    for (let k = -F.cells; k <= 2 * F.cells; k++) {
        const o = k * step;
        ctx.beginPath();
        ctx.moveTo(o, 0);
        ctx.lineTo(o + size, size);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(o, size);
        ctx.lineTo(o + size, 0);
        ctx.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(F.repeat[0], F.repeat[1]);
    if ('colorSpace' in texture && THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
    const net = material(0xffffff, 0.8, { map: texture, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });
    net.userData.fishnet = true;
    return net;
}

/** The material a layer `kind` is drawn in, in `color`. */
function layerMaterial(kind, color) {
    if (kind === 'fishnets' || kind === 'fishnetSleeves') return fishnetMaterial(color);
    if (kind === 'sheerTights') return material(color, 0.6, { transparent: true, opacity: LAYER_SIZE.sheer });
    return material(color, 0.9);
}

/** A ring a shade darker round a part, `from` to `to` of its height. */
function ring(part, over, from, to, color, k, name) {
    return partShell(part, over, from, to, material(shade(color, k), 0.95), name);
}

// ---- Legwear ------------------------------------------------------------------------

/**
 * The legwear `kind` (avatar-1.0.0's LEGWEAR ids) in `color` on every leg,
 * where the leg is bare (`skin` is the figure's skin material): a thigh
 * under shorts keeps the shorts, a shin under pants the pants. Every piece
 * is named for its kind. Returns the pieces.
 */
export function dressLegwear(person, kind, color, skin) {
    if (!kind || kind === 'none') return [];
    const S = LAYER_SIZE;
    const mat = layerMaterial(kind, color);
    const out = [];
    for (const leg of person.children.filter((o) => o.userData.isLeg)) {
        const { thigh, knee, shin } = legParts(leg);
        if (!shin) continue;
        const add = (mesh) => {
            if (!mesh) return;
            mesh.userData.layer = kind;
            leg.add(mesh);
            out.push(mesh);
        };
        const shinH = shin.geometry.parameters.height * shin.scale.y;
        const bareShin = isBare(shin, skin);
        const bareKnee = isBare(knee, skin);
        const bareThigh = isBare(thigh, skin);
        if (kind === 'crewSocks') {
            if (!bareShin) continue;
            const to = S.crew.height / shinH;
            add(partShell(shin, S.shell, 0, to, mat, kind));
            add(partShell(shin, S.shell + 0.002, to, to + S.crew.cuff / shinH, mat, 'cuff'));
        } else if (kind === 'kneeSocks') {
            if (!bareShin) continue;
            add(partShell(shin, S.shell, 0, 1, mat, kind));
            add(partShell(shin, S.shell + 0.002, 1 - S.crew.cuff / shinH, 1, mat, 'cuff'));
        } else if (kind === 'thighHighs') {
            if (bareShin) add(partShell(shin, S.shell, 0, 1, mat, kind));
            if (bareKnee) add(partShell(knee, S.shell, 0, 1, mat, kind));
            if (bareThigh) {
                add(partShell(thigh, S.shell, 0, S.thighHigh.up, mat, kind));
                const thighH = thigh.geometry.parameters.height * thigh.scale.y;
                add(ring(thigh, S.shell + 0.003, S.thighHigh.up - S.thighHigh.band / thighH, S.thighHigh.up, color, S.thighHigh.shade, 'band'));
            }
        } else if (kind === 'tights' || kind === 'sheerTights' || kind === 'fishnets' || kind === 'longJohns') {
            const over = kind === 'longJohns' ? S.longJohns.over : S.shell;
            if (bareThigh) add(partShell(thigh, over, 0, 1, mat, kind));
            if (bareKnee) add(partShell(knee, over, 0, 1, mat, kind));
            if (bareShin) {
                add(partShell(shin, over, 0, 1, mat, kind));
                if (kind === 'longJohns') add(ring(shin, over + 0.002, 0, S.longJohns.cuff / shinH, color, S.longJohns.shade, 'cuff'));
            }
        } else if (kind === 'legWarmers') {
            if (!bareShin) continue;
            const warmer = partShell(shin, S.legWarmers.over, 0, S.legWarmers.up, mat, kind);
            warmer.scale.x *= 1;
            add(warmer);
            // Flared toward the knee: the shell's top widened.
            warmer.geometry.dispose();
            const p = shin.geometry.parameters;
            const sx = shin.scale.x;
            const rTop = (p.radiusBottom + (p.radiusTop - p.radiusBottom) * S.legWarmers.up) * sx + S.legWarmers.over * S.legWarmers.flare;
            const rBottom = p.radiusBottom * sx + S.legWarmers.over;
            warmer.geometry = new THREE.CylinderGeometry(rTop, rBottom, shinH * S.legWarmers.up, 16);
            for (let k = 0; k < S.legWarmers.rings; k++) {
                const at = ((k + 0.5) / S.legWarmers.rings) * S.legWarmers.up;
                add(ring(shin, S.legWarmers.over + 0.0015, at - 0.012 / shinH, at + 0.012 / shinH, color, S.legWarmers.shade, 'rib'));
            }
        }
    }
    return out;
}

// ---- Armwear ------------------------------------------------------------------------

/** An arm's parts as the rig built them: the upper arm (the arm group's
 *  cylinder), the elbow and the forearm (the forearm group's sphere and
 *  cylinder) and the tagged hand. */
export function armParts(arm) {
    const fore = arm.userData.forearm;
    return {
        upper: arm.children.find((m) => m.isMesh && !m.name && m.geometry.type === 'CylinderGeometry'),
        elbow: fore ? fore.children.find((m) => m.isMesh && !m.name && m.geometry.type === 'SphereGeometry') : null,
        forearm: fore ? fore.children.find((m) => m.isMesh && !m.name && m.geometry.type === 'CylinderGeometry') : null,
        hand: fore ? fore.children.find((m) => m.isMesh && m.userData.isHand) : null,
        fore
    };
}

/**
 * The armwear `kind` (avatar-1.0.0's ARMWEAR ids) in `color` on both arms,
 * where the arm is bare: under long sleeves only a glove's hand shows.
 * Every piece is named for its kind. Returns the pieces.
 */
export function dressArmwear(person, kind, color, skin) {
    if (!kind || kind === 'none') return [];
    const S = LAYER_SIZE;
    const mat = layerMaterial(kind, color);
    const out = [];
    for (const arm of person.children.filter((o) => o.userData.isArm)) {
        const { upper, elbow, forearm, hand, fore } = armParts(arm);
        if (!fore || !forearm) continue;
        const add = (parent, mesh) => {
            if (!mesh) return;
            mesh.userData.layer = kind;
            parent.add(mesh);
            out.push(mesh);
        };
        const bareUpper = isBare(upper, skin);
        const bareFore = isBare(forearm, skin);
        const bareElbow = isBare(elbow, skin);
        if (kind === 'longGloves') {
            if (hand && isBare(hand, skin)) {
                hand.material = mat;
                hand.userData.layer = kind;
            }
            if (bareFore) add(fore, partShell(forearm, S.gloves.over, 0, 1, mat, kind));
        } else if (kind === 'armWarmers') {
            if (!bareFore) continue;
            add(fore, partShell(forearm, S.armWarmers.over, 0, S.armWarmers.up, mat, kind));
            const h = forearm.geometry.parameters.height * forearm.scale.y;
            for (let k = 0; k < S.armWarmers.rings; k++) {
                const at = ((k + 0.5) / S.armWarmers.rings) * S.armWarmers.up;
                add(fore, ring(forearm, S.armWarmers.over + 0.0015, at - 0.008 / h, at + 0.008 / h, color, S.armWarmers.shade, 'rib'));
            }
        } else if (kind === 'fishnetSleeves' || kind === 'thermalSleeves') {
            if (bareUpper) add(arm, partShell(upper, S.shell, 0, 1, mat, kind));
            if (bareElbow) add(fore, partShell(elbow, S.shell, 0, 1, mat, kind));
            if (bareFore) add(fore, partShell(forearm, S.shell, 0, 1, mat, kind));
        }
    }
    return out;
}
