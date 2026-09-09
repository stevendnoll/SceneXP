// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * markers.js - The flat disc under each player, and the letter on it.
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
 * THEY ARE NOT CHILDREN OF THE FIGURES, deliberately. A marker parented to a
 * player would inherit that player's yaw, and a letter that spins as its
 * receiver turns is unreadable. They live in their own group in world space and
 * view.js slides them under the right feet each frame, so a letter always reads
 * the same way up.
 */
import { EXESNOHS_CONFIG as CFG } from './config.min.js';

/**
 * The receivers' letters, and their colours.
 *
 * THE HUES ARE THE 2D GAME'S OWN, read off playbook.class.tsx where each route
 * is drawn: A is rgb(125, 0, 0), B is rgb(0, 0, 125), C is rgb(125, 0, 125) and
 * D is rgb(0, 125, 0). Those are picked for dark ink on a near-white diagram,
 * so they are lifted here to sit on floodlit grass at night, but the hue is
 * unchanged. A receiver's disc and their route on the playbook card are the
 * same colour, which is the whole point of labelling them.
 */
export const RECEIVER_LETTERS = { wr1: 'A', wr2: 'B', wr3: 'C', wr4: 'D' };
const LETTER_INK = {
    wr1: '#ff6a5e',   // was 125, 0, 0
    wr2: '#6d9cff',   // was 0, 0, 125
    wr3: '#e57bff',   // was 125, 0, 125
    wr4: '#5fd873',   // was 0, 125, 0
};

/** The quarterback gets one too, because he is the other thing a visitor
 *  presses and an unmarked figure does not look pressable. */
const QB_INK = '#ffd166';

const TEAM_INK = { 0: '#ff992c', 1: '#9bcfff' };

let group = null;
const markers = new Map();      // position -> THREE.Mesh
const textures = [];

/**
 * Draw one marker onto a canvas.
 *
 * A ring rather than a filled disc for the plain ones, so seventeen of them do
 * not read as seventeen holes cut in the pitch. The lettered ones are filled,
 * because a letter needs a ground to sit on to be legible at twenty pixels.
 */
function markerTexture(ink, letter) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext && canvas.getContext('2d');
    // Under the test stub getContext returns null. A marker without a texture
    // is simply not drawn, which is the correct headless behaviour.
    if (!ctx) return null;

    const mid = 64;
    ctx.clearRect(0, 0, 128, 128);

    if (letter) {
        ctx.fillStyle = ink;
        ctx.beginPath();
        ctx.arc(mid, mid, 52, 0, Math.PI * 2);
        ctx.fill();
        // A dark rim, so a bright disc still has an edge against pale paint.
        ctx.strokeStyle = 'rgba(10, 14, 10, 0.85)';
        ctx.lineWidth = 7;
        ctx.stroke();

        ctx.fillStyle = '#10140f';
        ctx.font = 'bold 74px Tahoma, Geneva, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(letter, mid, mid + 3);
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
    // One geometry for all of them. They differ only in their texture.
    const disc = new THREE.PlaneGeometry(1, 1);

    for (const obj of objects) {
        const { position, team } = obj.settings;
        const letter = RECEIVER_LETTERS[position];
        const isQb = position === 'qb';
        const ink = letter ? LETTER_INK[position] : (isQb ? QB_INK : TEAM_INK[team]);
        const tex = markerTexture(ink, letter || (isQb ? 'Q' : ''));
        if (!tex) continue;

        const mesh = new THREE.Mesh(disc, new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            opacity: letter || isQb ? M.namedOpacity : M.plainOpacity,
            depthWrite: false,
            // Lit markers would go grey at the far end where the floodlights
            // fall off, which is exactly where legibility is already worst.
            toneMapped: false,
        }));
        // Flat on the grass, and just above it: the turf, the painted lines and
        // this all want to be at y = 0, and the marker must win.
        //
        // THE Z TERM IS WHAT MAKES THE LETTER READABLE, and it is not optional.
        // Laying a plane down with rotation.x alone sends the texture's top to
        // world -Z, which from a camera looking downfield is to the LEFT, so
        // every A, B, C and D lies on its side. Turning a further -90 degrees
        // about z sends the texture's top to +X, which is downfield, which is
        // up the screen. Verified by transforming the plane's own axes rather
        // than by guessing at Euler order.
        mesh.rotation.set(-Math.PI / 2, 0, -Math.PI / 2);
        const size = (letter || isQb ? M.namedRadius : M.plainRadius) * 2;
        mesh.scale.set(size, size, 1);
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

export function markerFor(position) {
    return markers.get(position) || null;
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
        const named = position === 'qb' || RECEIVER_LETTERS[position];
        const rest = named ? M.namedOpacity : M.plainOpacity;
        mesh.material.opacity = live.has(position)
            ? rest * (M.pulseFloor + (1 - M.pulseFloor) * amount)
            : rest;
        // A tappable player's disc also sits a shade larger, which reads even
        // when the opacity swing is switched off for reduced motion.
        const size = (named ? M.namedRadius : M.plainRadius)
            * (live.has(position) ? M.pulseScale : 1) * 2;
        mesh.scale.set(size, size, 1);
    }
}

export function getMarkerGroup() {
    return group;
}

export function disposeMarkers() {
    if (!group) return;
    const seen = new Set();
    group.traverse((o) => {
        if (o.geometry && !seen.has(o.geometry.uuid)) { seen.add(o.geometry.uuid); o.geometry.dispose(); }
        if (o.material && !seen.has(o.material.uuid)) { seen.add(o.material.uuid); o.material.dispose(); }
    });
    textures.forEach((t) => t.dispose());
    textures.length = 0;
    if (group.parent) group.parent.remove(group);
    group = null;
    markers.clear();
}
