// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * markers.js - The disc under each player, the letter in front of it, and the
 * spot where the play ended.
 *
 * WHY THESE EXIST AT ALL, measured rather than guessed. From the play camera on
 * a phone in portrait a standing figure projects to between 2 and 21 pixels
 * tall depending on where on the field they are: the camera has to pitch about
 * 66 degrees to fit a 35m field into a tall narrow frame, and at that angle a
 * vertical object is being viewed almost end on. Sweeping every one of the 1155
 * camera positions that show the whole field, the best worst-case player is
 * still about 9 pixels, so no amount of camera work fixes it.
 *
 * A DISC LYING ON THE GRASS DOES NOT FORESHORTEN THE SAME WAY. Measured at the
 * same four spots, a 0.6m disc holds 16 to 23 pixels across the whole field
 * while the figure above it swings by a factor of ten. So the marker, not the
 * figure, is what actually carries who is where.
 *
 * IT IS ALSO WHAT THE 2D GAME LOOKED LIKE. exesnohs.com draws every player as a
 * coloured letter on a plan view, so a coloured disc under each figure is not a
 * heads-up-display bolted onto a simulation, it is the original game showing
 * through. The receivers carry their A, B, C and D exactly as the playbook
 * diagrams label them, which is what makes "Throw B" mean something.
 *
 * THE LETTER USED TO BE UNDER THE PLAYER, WHICH IS TO SAY IT WAS NOWHERE.
 * It was drawn at the middle of the disc, and the middle of the disc is where
 * the player stands. Cropping and enlarging a screenshot shows what the camera
 * shows: five coloured ovals with a pair of legs on each and no glyph on any of
 * them. The paragraph above was the intent and it had never once been true, so
 * "Throw C" named a receiver a visitor had no way of picking out.
 *
 * SO THE LETTER MOVED IN FRONT, AND WHICH WAY IS "IN FRONT" IS THE WHOLE TRICK.
 * A standing figure hides the ground BEHIND it, downfield, and by a long way:
 * a 3.85m player at a 45 degree rake covers 3.85m of turf up the screen. Toward
 * the camera it hides only its own feet. So the letter sits on a tag on the
 * near side of the ring, at x - 1.2m, on grass that nothing can stand on.
 *
 * THE RING STAYS UNDER THE FEET. Every player has one, named or not, and the
 * eye reads a row of them as the line of scrimmage. Moving only the lettered
 * ones would have put five discs out of step with twelve.
 *
 * THEY ARE NOT CHILDREN OF THE FIGURES, deliberately. A marker parented to a
 * player would inherit that player's yaw, and a letter that spins as its
 * receiver turns is unreadable. They live in their own group in world space and
 * view.js slides them under the right feet each frame, so a letter always reads
 * the same way up.
 */
import { EXESNOHS_CONFIG as CFG } from './config.min.js';

/**
 * WHO GETS A LETTER AND IN WHAT COLOUR NOW LIVES IN CONFIG, because hud.js
 * paints the same table onto the throw buttons and two copies of it would agree
 * only until somebody edited one. This file used to own it, and a button
 * labelled B while nothing on the grass was is exactly what that ownership
 * bought. See `CFG.receivers`.
 */

/**
 * THE TEXTURE LAYOUT, IN CANVAS PIXELS, AND HOW IT REACHES THE WORLD.
 *
 * A named marker's texture is TALLER THAN IT IS WIDE: the ring near the top and
 * the letter tag below it. Everything else follows from three numbers.
 *
 * The plane is scaled so `WIDTH` pixels span `namedRadius * 2` metres, which is
 * 0.0122m per pixel, so the painted ring keeps exactly the size it had when the
 * texture was square. `HEIGHT` then decides how much grass the tag gets.
 *
 * WHICH WAY THE CANVAS POINTS. After the rotation applied below, the texture's
 * top runs to world +X (downfield, up the screen) and its bottom toward the
 * camera. That is verified by transforming the plane's own axes rather than by
 * guessing at Euler order, and it is the reason the tag is drawn BELOW the
 * ring: below is toward the viewer, which is the side a player does not hide.
 */
const TEX = {
    WIDTH: 128,
    HEIGHT: 224,
    RING_Y: 60,          // centre of the ring
    RING_R: 52,
    TAG_Y: 158,          // centre of the lettered tag
    TAG_R: 40,
    LETTER: 60,          // cap height in canvas pixels
};

/** How far the ring's centre sits ahead of the plane's own centre, as a
 *  fraction of the plane's downfield extent. The mesh is positioned by its
 *  centre, so `seat()` subtracts this to leave the RING on the player's feet. */
const RING_BIAS = (TEX.HEIGHT / 2 - TEX.RING_Y) / TEX.HEIGHT;

/**
 * The named marker's layout in WORLD METRES, which is the only form in which
 * the question worth asking can be asked.
 *
 * That question is "is the letter clear of the player standing on the ring",
 * and it is not answerable from the canvas constants above without knowing what
 * a canvas pixel is worth, nor from the mesh without a scene graph. Pure, so a
 * suite can assert the thing that was actually wrong for a whole milestone: the
 * glyph sat at offset zero, under a figure whose contact shadow is 0.75m across
 * at this figure scale, and no screenshot of a 20-pixel disc was ever going to
 * show that.
 */
export function markerGeometry(radius = CFG.markers.namedRadius) {
    const perPixel = (radius * 2) / TEX.WIDTH;
    return {
        perPixel,
        /** How far the ring sits ahead of the plane's own centre. */
        ringOffset: (TEX.HEIGHT / 2 - TEX.RING_Y) * perPixel,
        /** How far the letter sits TOWARD THE CAMERA from the ring. */
        tagOffset: (TEX.TAG_Y - TEX.RING_Y) * perPixel,
        tagRadius: TEX.TAG_R * perPixel,
        letterHeight: TEX.LETTER * perPixel,
        ringRadius: TEX.RING_R * perPixel,
        /** The plane's two world extents, across the field and downfield. */
        across: radius * 2,
        along: radius * 2 * (TEX.HEIGHT / TEX.WIDTH),
    };
}

let group = null;
let spot = null;
const markers = new Map();      // position -> THREE.Mesh
const textures = [];

/** Paint a filled circle with a dark rim, which is what stops a bright disc
 *  dissolving into pale paint when a player stands on a yard line. */
function disc(ctx, x, y, r, ink) {
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(10, 14, 10, 0.85)';
    ctx.lineWidth = 7;
    ctx.stroke();
}

/**
 * Draw one marker onto a canvas.
 *
 * A ring rather than a filled disc for the plain ones, so seventeen of them do
 * not read as seventeen holes cut in the pitch. The named ones are filled and
 * get a lettered tag on the near side, because a letter needs a ground to sit
 * on to be legible at twenty pixels and it needs grass nobody is standing on.
 */
function markerTexture(ink, letter) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    const canvas = document.createElement('canvas');
    canvas.width = TEX.WIDTH;
    canvas.height = letter ? TEX.HEIGHT : TEX.WIDTH;
    const ctx = canvas.getContext && canvas.getContext('2d');
    // Under the test stub getContext returns null. A marker without a texture
    // is simply not drawn, which is the correct headless behaviour.
    if (!ctx) return null;

    const mid = TEX.WIDTH / 2;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (letter) {
        disc(ctx, mid, TEX.RING_Y, TEX.RING_R, ink);
        // The tag. Smaller than the ring on purpose: it is a label on the
        // player, and a second disc of equal weight would double the visual
        // mass of every named figure on a field that has five of them.
        disc(ctx, mid, TEX.TAG_Y, TEX.TAG_R, ink);

        ctx.fillStyle = '#10140f';
        ctx.font = `bold ${TEX.LETTER}px Tahoma, Geneva, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(letter, mid, TEX.TAG_Y + 2);
    } else {
        ctx.strokeStyle = ink;
        ctx.lineWidth = 16;
        ctx.beginPath();
        ctx.arc(mid, mid, 48, 0, Math.PI * 2);
        ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    textures.push(tex);
    return tex;
}

/** Lay a plane flat on the grass with its texture's top running downfield.
 *
 *  THE Z TERM IS WHAT MAKES THE LETTER READABLE, and it is not optional.
 *  Laying a plane down with rotation.x alone sends the texture's top to world
 *  -Z, which from a camera looking downfield is to the LEFT, so every A, B, C
 *  and D lies on its side. Turning a further -90 degrees about z sends the
 *  texture's top to +X, which is downfield, which is up the screen. */
function layFlat(mesh) {
    mesh.rotation.set(-Math.PI / 2, 0, -Math.PI / 2);
}

/**
 * Put a marker's RING on a pair of feet.
 *
 * The mesh is positioned by the centre of its plane, and on a named marker the
 * ring is NOT at that centre: the plane runs on toward the camera to carry the
 * tag, so the ring sits `RING_BIAS` of the plane's length downfield of it. The
 * mesh therefore has to be pulled back toward the camera by exactly that, which
 * leaves the ring where the caller asked for it and the tag out in front.
 *
 * IT IS RECOMPUTED FROM THE PLANE'S CURRENT SCALE, so `setPulse` growing a
 * marker cannot walk it off the feet. That would be a wobble in step with the
 * breath, which is the kind of motion the eye is very good at noticing and very
 * bad at explaining.
 */
function seat(mesh) {
    const at = mesh.userData.at;
    if (!at) return;
    mesh.position.set(
        at.x - mesh.scale.y * (mesh.userData.ringBias || 0),
        CFG.markers.lift,
        at.z
    );
}

/**
 * Build one marker per player.
 *
 * `objects` is the simulation's roster, the same list roster.js is handed, so
 * the two stay in step without either knowing about the other.
 */
export function initMarkers(scene, objects) {
    disposeMarkers();
    group = new THREE.Group();
    group.name = 'markers';

    const M = CFG.markers;
    // One geometry for all of them. They differ only in their texture and in
    // how far they are stretched downfield.
    const plane = new THREE.PlaneGeometry(1, 1);

    for (const obj of objects) {
        const { position, team } = obj.settings;
        const receiver = CFG.receivers[position];
        const isQb = position === 'qb';
        const letter = receiver ? receiver.letter : (isQb ? CFG.qb.letter : '');
        const ink = receiver ? receiver.ink
            : (isQb ? CFG.qb.ink : CFG.teamInk[team]);
        const tex = markerTexture(ink, letter);
        if (!tex) continue;

        const mesh = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            opacity: letter ? M.namedOpacity : M.plainOpacity,
            depthWrite: false,
            // Lit markers would go grey at the far end where the floodlights
            // fall off, which is exactly where legibility is already worst.
            toneMapped: false,
        }));
        layFlat(mesh);
        mesh.userData.ringBias = letter ? RING_BIAS : 0;
        mesh.userData.named = !!letter;
        applyScale(mesh, letter ? M.namedRadius : M.plainRadius);
        mesh.position.y = M.lift;
        mesh.renderOrder = 2;
        mesh.visible = false;
        mesh.name = `marker-${position}`;
        group.add(mesh);
        markers.set(position, mesh);
    }

    scene.add(group);
    return markers;
}

/** Size a marker from one radius. A named plane is taller than it is wide, so
 *  its two axes do not take the same number. */
function applyScale(mesh, radius) {
    const across = radius * 2;
    mesh.scale.set(
        across,
        mesh.userData.named ? across * (TEX.HEIGHT / TEX.WIDTH) : across,
        1
    );
}

/**
 * Slide a marker under a player, in world metres.
 *
 * view.js calls this rather than writing to `mesh.position` itself, because
 * where the mesh has to sit to put its RING on a pair of feet is a fact about
 * the texture layout, and the texture layout lives here.
 */
export function placeMarker(position, x, z) {
    const mesh = markers.get(position);
    if (!mesh) return null;
    mesh.userData.at = { x, z };
    seat(mesh);
    mesh.visible = true;
    return mesh;
}

export function hideMarker(position) {
    const mesh = markers.get(position);
    if (mesh) mesh.visible = false;
}

/**
 * Breathe the markers of whoever can be tapped right now.
 *
 * `live` is a Set of positions and `amount` runs 0 to 1. Everybody not in the
 * set is returned to their resting opacity, which is what stops a receiver
 * still glowing after the ball has left.
 */
export function setPulse(live, amount) {
    const M = CFG.markers;
    for (const [position, mesh] of markers) {
        const named = mesh.userData.named;
        const rest = named ? M.namedOpacity : M.plainOpacity;
        mesh.material.opacity = live.has(position)
            ? rest * (M.pulseFloor + (1 - M.pulseFloor) * amount)
            : rest;
        // A tappable player's disc also sits a shade larger, which reads even
        // when the opacity swing is switched off for reduced motion.
        applyScale(mesh, (named ? M.namedRadius : M.plainRadius)
            * (live.has(position) ? M.pulseScale : 1));
        seat(mesh);
    }
}

// ---- Where the play ended ---------------------------------------------------

/**
 * THE SPOT, AND WHY IT IS A COLUMN RATHER THAN A RING.
 *
 * The result card opens in the middle of the screen over the middle of the
 * field, which is roughly where a play tends to finish, so the one thing a
 * visitor wants to see at that moment is the one thing the card is standing on.
 * A ring on the grass has the same problem the letters had: it is on the floor,
 * and the floor is what gets covered.
 *
 * A soft column of light rises out of the ring, so wherever the card sits the
 * spot still says "here" above it. It is also the only vertical thing on this
 * field besides the players and the posts, which is exactly why it reads.
 *
 * Built once and moved, rather than made per play: this is the same object on
 * every one of the ten, and a play should not allocate.
 */
export function initSpot(scene) {
    disposeSpot();
    spot = new THREE.Group();
    spot.name = 'spot';

    const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.55, 0.85, 28),
        new THREE.MeshBasicMaterial({
            color: CFG.band.ink, transparent: true, opacity: 0.85,
            depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
        })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = CFG.markers.lift * 2;
    ring.renderOrder = 3;
    spot.add(ring);

    // Open at the top and fading out, so it reads as light rather than as a
    // pillar somebody left on the pitch.
    const column = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.68, 7.5, 14, 1, true),
        new THREE.MeshBasicMaterial({
            color: CFG.band.ink, transparent: true, opacity: 0.16,
            depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
        })
    );
    column.position.y = 3.75;
    column.renderOrder = 3;
    spot.add(column);

    spot.visible = false;
    scene.add(spot);
    return spot;
}

/** Stand the spot at a point on the field, or take it away. */
export function showSpot(x, z, visible = true) {
    if (!spot) return;
    spot.position.set(x, 0, z);
    spot.visible = visible;
}

export function hideSpot() {
    if (spot) spot.visible = false;
}

export function getMarkerGroup() {
    return group;
}

function disposeGroup(target) {
    if (!target) return;
    const seen = new Set();
    target.traverse((o) => {
        if (o.geometry && !seen.has(o.geometry.uuid)) { seen.add(o.geometry.uuid); o.geometry.dispose(); }
        if (o.material && !seen.has(o.material.uuid)) { seen.add(o.material.uuid); o.material.dispose(); }
    });
    if (target.parent) target.parent.remove(target);
}

export function disposeMarkers() {
    if (!group) return;
    disposeGroup(group);
    textures.forEach((t) => t.dispose());
    textures.length = 0;
    group = null;
    markers.clear();
}

export function disposeSpot() {
    if (!spot) return;
    disposeGroup(spot);
    spot = null;
}
