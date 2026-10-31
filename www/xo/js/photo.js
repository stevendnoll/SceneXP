// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * photo.js - THE PICTURE OF A MOMENT (specs/xo-photos-plan, Step 4).
 *
 * A moment (moments.js) is a snapshot of what was drawn (snapshot.js). This
 * puts that snapshot back on the field for one frame, draws it through a
 * photographer's camera at 1080 by 1350, stamps the wordmark in the corner,
 * and puts the live field back, all in one task, so the screen never shows it.
 *
 * WHY NOT THE PLAY CAMERA. From where the game is watched a player is a few
 * dozen pixels tall on a phone, which nobody would post. The recording knows
 * exactly what happened, so the picture can be taken from where a sideline
 * photographer would stand, after the fact.
 *
 * THE CANVAS IS BORROWED, NOT DUPLICATED, the way Corner Office makes its week
 * card: the drawing buffer is resized, drawn, copied out with `drawImage`, and
 * given back. A render target would skip the tone mapping and the sRGB encode
 * and hand back a washed-out picture, and a second WebGL context would compile
 * the whole stadium again on a phone. It must be called from inside the frame
 * loop BEFORE the frame's own draw, which then paints the live field over the
 * borrowed buffer before anything reaches the screen.
 *
 * `photoShot` is pure, and is where the camera is decided. `drawPhoto` is the
 * only part that touches THREE.
 */
import { XO_CONFIG as CFG, FIELD } from './config.min.js';
import { fitShot, projectPoint } from './milestones.min.js';
import { captureDrawn, applyDrawn } from './snapshot.min.js';
import { drawWordmark } from '../../shared/js/wordmark-1.0.0.min.js';

const P = () => CFG.photo;

/**
 * THE POINTS A PICTURE MUST CONTAIN: each body from its feet to its raised
 * hands, a body's width either side, following its lean. A diving tackler is
 * nearly flat, and his head is metres from his feet along the way he dived.
 *
 * A body is `{ x, y, z, yaw, pitch }`, its root as drawn: `y` includes the
 * lift that stands him on the grass and any jump, `yaw` faces him along
 * (sin, cos) on (x, z), and a positive `pitch` tips him forward.
 */
export function bodyPoints(bodies) {
    const half = CFG.separation / 2;
    const reach = P().reach * CFG.figureScale;
    const out = [];
    for (const b of bodies) {
        const pitch = Number.isFinite(b.pitch) ? b.pitch : 0;
        const fx = Math.sin(b.yaw || 0);
        const fz = Math.cos(b.yaw || 0);
        const top = {
            x: b.x + fx * Math.sin(pitch) * reach,
            y: b.y + Math.cos(pitch) * reach,
            z: b.z + fz * Math.sin(pitch) * reach,
        };
        for (const end of [{ x: b.x, y: Math.max(0, b.y - 0.15), z: b.z }, top]) {
            for (const dx of [-half, half]) {
                for (const dz of [-half, half]) out.push({ x: end.x + dx, y: end.y, z: end.z + dz });
            }
        }
    }
    return out;
}

/** Is this camera standing somewhere a photographer could: on the grass,
 *  short of the stands at the sides and the ends. */
export function onTheGrass(position) {
    const len = FIELD.lineInterval * FIELD.segments;
    const side = FIELD.width / 2 + FIELD.sideline - 0.3;
    return Math.abs(position.z) <= side
        && position.x >= -FIELD.endZone - FIELD.sideline
        && position.x <= len + FIELD.endZone + FIELD.sideline;
}

/** How many other players stand within `clear` of the line from the camera
 *  to the aim, between the two. */
function blockers(shot, others) {
    const a = shot.position;
    const b = shot.target;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz || 1;
    let n = 0;
    for (const o of others || []) {
        const t = ((o.x - a.x) * dx + (o.z - a.z) * dz) / len2;
        if (t <= 0.05 || t >= 0.95) continue;
        if (Math.hypot(a.x + dx * t - o.x, a.z + dz * t - o.z) < P().clear) n += 1;
    }
    return n;
}

/**
 * WHERE THE PHOTOGRAPHER MAY STAND, as degrees round from the way the hero is
 * facing, best first: to his side and in front, so the picture has his face
 * and the way he is going; then nearer his side, then nearer his front, then
 * head on, which is the runner coming at the lens. Behind him comes last, for
 * the one place nothing else fits: a tackle on the goal line, where in front
 * of him is the end of the stadium. In a tackle the two men face each other,
 * so behind the carrier is in front of the man bringing him down. Both sides
 * of him are tried at every angle.
 *
 * ONE SIDE ONLY WAS NOT ENOUGH, measured: across 240 positions, headings and
 * pairs, a man near a touchline facing it, or a tackle that needed the
 * distance, left the photographer off the grass on 62 of them even at the
 * widest lens, because the only two places tried were both in the stands.
 * The fan without the last two left 4, every one a tackle at the goal line.
 */
const ANGLES = [65, 45, 90, 25, 110, 0, 135, 160];

/**
 * THE PHOTOGRAPHER'S SHOT OF A MOMENT, at `aspect` (the picture's own, 0.8).
 *
 * Every angle in `ANGLES`, on both sides, each with the longest lens that
 * keeps the photographer on the grass (`fitShot` backs them away until every
 * point is in frame). The best is scored: on the grass above all, then nobody
 * in the way, then the angle's own rank, then the longer lens, which is the
 * tighter, more compressed picture. `moment` carries `bodies` (the hero
 * first) and `others`, every other player's drawn position, `{ x, z }`.
 */
export function photoShot(moment, aspect = P().width / P().height) {
    const C = P();
    const bodies = moment.bodies && moment.bodies.length ? moment.bodies : [{ x: 0, y: 0, z: 0, yaw: 0 }];
    const hero = bodies[0];
    const points = bodyPoints(bodies);
    const cx = bodies.reduce((s, b) => s + b.x, 0) / bodies.length;
    const cz = bodies.reduce((s, b) => s + b.z, 0) / bodies.length;
    const fx = Math.sin(hero.yaw || 0);
    const fz = Math.cos(hero.yaw || 0);
    const target = {
        x: cx + fx * C.lead,
        y: hero.y + C.reach * CFG.figureScale * C.aimAt,
        z: cz + fz * C.lead,
    };
    const inShot = new Set(bodies.map((b) => `${b.x},${b.z}`));
    const others = (moment.others || []).filter((o) => !inShot.has(`${o.x},${o.z}`));

    const heading = Math.atan2(fx, fz);
    let best = null;
    ANGLES.forEach((deg, rank) => {
        for (const side of deg === 0 ? [1] : [1, -1]) {
            const a = heading + side * (deg * Math.PI) / 180;
            const from = { x: Math.sin(a), y: C.rise, z: Math.cos(a) };
            let fov = C.fov;
            let shot = fitShot({ target, from, fov, points, aspect, margin: C.margin, floor: C.floor });
            while (!onTheGrass(shot.position) && fov < C.maxFov) {
                fov = Math.min(C.maxFov, fov * C.widen);
                shot = fitShot({ target, from, fov, points, aspect, margin: C.margin, floor: C.floor });
            }
            // A step of rank is worth about eight degrees of lens.
            const score = (onTheGrass(shot.position) ? 0 : 1000)
                + blockers(shot, others) * 10 + rank + (fov - C.fov) / 8;
            if (!best || score < best.score) best = { score, shot };
        }
    });
    return best.shot;
}

/** Where on the picture every point of a moment lands, for the suite. */
export function framed(moment, shot, aspect = P().width / P().height) {
    return bodyPoints(moment.bodies).map((p) => projectPoint(shot, aspect, p));
}

/**
 * Run `paint` with the renderer's drawing buffer at `w` by `h` pixels and a
 * pixel ratio of 1, then give back the size and ratio it had even if `paint`
 * throws (Corner Office's `atSize`). The CSS size is never touched, so the
 * page's layout does not move.
 */
function atSize(renderer, w, h, paint) {
    const ratio = renderer.getPixelRatio();
    const size = renderer.getSize(new THREE.Vector2());
    const back = { x: size.x, y: size.y };
    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false);
    try {
        return paint();
    } finally {
        renderer.setPixelRatio(ratio);
        renderer.setSize(back.x, back.y, false);
    }
}

let photoCamera = null;

/**
 * DRAW A MOMENT AS A PHOTO, onto a fresh 1080 by 1350 canvas, or null when
 * anything fails. `roots` are what the moment's snapshot was taken of; `hide`
 * are put out of sight for the picture (the rings on the grass, the end of
 * play spot). FROM INSIDE THE FRAME LOOP, before the frame's own draw (see
 * the note at the top).
 *
 * Whatever happens, the live field and the renderer are given back exactly as
 * they were: the live frame is snapped first and put back last.
 */
export function drawPhoto({ renderer, scene, canvas, moment, roots, hide = [], doc = typeof document === 'undefined' ? null : document }) {
    const C = P();
    if (!renderer || !scene || !canvas || !moment || !moment.snapshot || !doc) return null;
    const W = C.width;
    const H = C.height;
    const ss = Math.max(1, Math.round(C.supersample));
    const shot = photoShot(moment, W / H);
    if (!photoCamera) photoCamera = new THREE.PerspectiveCamera(shot.fov, W / H, C.near, C.far);
    photoCamera.fov = shot.fov;
    photoCamera.aspect = W / H;
    photoCamera.near = C.near;
    photoCamera.far = C.far;
    photoCamera.updateProjectionMatrix();
    photoCamera.position.set(shot.position.x, shot.position.y, shot.position.z);
    photoCamera.lookAt(shot.target.x, shot.target.y, shot.target.z);
    photoCamera.updateMatrixWorld();

    const live = captureDrawn([...roots, ...hide]);
    let out = null;
    try {
        applyDrawn(moment.snapshot);
        for (const node of hide) if (node) node.visible = false;
        out = atSize(renderer, W * ss, H * ss, () => {
            renderer.render(scene, photoCamera);
            const picture = doc.createElement('canvas');
            picture.width = W;
            picture.height = H;
            const g = picture.getContext && picture.getContext('2d');
            if (!g) return null;
            g.imageSmoothingEnabled = true;
            g.imageSmoothingQuality = 'high';
            // From the WebGL canvas in the same task as its draw, which is what
            // makes it readable without preserveDrawingBuffer, and drawn down
            // from the supersampled buffer, which is the antialiasing.
            g.drawImage(canvas, 0, 0, W * ss, H * ss, 0, 0, W, H);
            drawWordmark(g, W, H, { text: C.wordmark });
            return picture;
        });
    } catch (e) {
        out = null;
    } finally {
        applyDrawn(live);
    }
    return out;
}

/** A drawn photo as a file: a Blob, or null where the browser cannot make
 *  one. */
export function photoBlob(picture) {
    const C = P();
    if (!picture || typeof picture.toBlob !== 'function') return Promise.resolve(null);
    return new Promise((resolve) => {
        try {
            picture.toBlob((blob) => resolve(blob || null), C.type, C.quality);
        } catch (e) {
            resolve(null);
        }
    });
}

/** "scenexp-xo-catch-1080x1350.jpg". */
export function photoName(kind) {
    const C = P();
    const ext = String(C.type).split('/')[1] === 'jpeg' ? 'jpg' : String(C.type).split('/')[1] || 'jpg';
    return `scenexp-xo-${kind || 'photo'}-${C.width}x${C.height}.${ext}`;
}
