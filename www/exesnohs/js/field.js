// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * field.js - The standing scene: turf, markings, sidelines, goal posts and the
 * empty stands shell.
 *
 * ONE CANVAS TEXTURE CARRIES EVERY MARKING. Yard lines, hash marks, sidelines
 * and end zones are painted once into a 2D canvas and mapped onto a single
 * plane, rather than built as geometry. That is the cheapest lever in the
 * performance plan (PLANNING section 11) and the line positions come from the
 * same `lineInterval` arithmetic the 2D game already uses, so the markings and
 * the simulation cannot drift apart.
 *
 * THE STANDS ARE EMPTY ON PURPOSE. The 2D game's crowd did not look right and
 * was dropped (D8). A shell keeps the field from floating in a void, and empty
 * night stands read as a practice facility rather than as an apology.
 *
 * NO GAME RULES LIVE HERE. This module builds meshes and returns them. It
 * never reads player state and never runs a tick.
 */
import { EXESNOHS_CONFIG as CFG, FIELD } from './config.min.js';

let group = null;

/** Metres to texture pixels, so the paint lands exactly where the simulation
 *  thinks the lines are. */
function pxPerMetre(canvasWidth, worldWidth) {
    return canvasWidth / worldWidth;
}

/**
 * Paint the field markings.
 *
 * The canvas covers the WHOLE surface (playing area plus both end zones plus
 * both sideline margins), because the turf plane does. Everything inside is
 * positioned from FIELD, so changing `FIELD.width` in M1 repaints correctly
 * with no numbers to chase in here.
 */
export function paintMarkings(doc = document) {
    const turf = CFG.turf;
    const playLength = FIELD.lineInterval * FIELD.segments;
    const totalLength = playLength + FIELD.endZone * 2;
    const totalWidth = FIELD.width + FIELD.sideline * 2;

    const canvas = doc.createElement('canvas');
    canvas.width = turf.textureWidth;
    canvas.height = Math.round(turf.textureWidth * (totalWidth / totalLength));
    const ctx = canvas.getContext('2d');
    if (!ctx) return { canvas, ctx: null };

    const k = pxPerMetre(canvas.width, totalLength);
    const originX = FIELD.endZone * k;          // left goal line, in pixels
    const originY = FIELD.sideline * k;         // near sideline, in pixels
    const fieldW = playLength * k;
    const fieldH = FIELD.width * k;

    // Grass, then the mown bands. The bands run across the field the way a
    // roller leaves them, which also gives the eye something to judge depth
    // against once the camera is raked over.
    ctx.fillStyle = turf.grass;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const bandW = fieldW / turf.stripes;
    ctx.fillStyle = turf.stripe;
    for (let i = 0; i < turf.stripes; i += 2) {
        ctx.fillRect(originX + i * bandW, 0, bandW, canvas.height);
    }

    // End zones.
    ctx.fillStyle = turf.endZone;
    ctx.fillRect(0, 0, originX, canvas.height);
    ctx.fillRect(originX + fieldW, 0, originX, canvas.height);

    ctx.strokeStyle = turf.paint;
    ctx.fillStyle = turf.paint;
    ctx.lineCap = 'butt';

    // Sidelines and goal lines. Goal lines are drawn heavier because they are
    // the two lines that matter to the scoring.
    ctx.lineWidth = Math.max(2, 0.16 * k);
    ctx.strokeRect(originX, originY, fieldW, fieldH);

    // Yard lines, one per interval. `segments` of them means `segments - 1`
    // interior lines plus the two goal lines already drawn above.
    ctx.lineWidth = Math.max(1, 0.11 * k);
    for (let s = 1; s < FIELD.segments; s += 1) {
        const x = originX + (fieldW / FIELD.segments) * s;
        ctx.beginPath();
        ctx.moveTo(x, originY);
        ctx.lineTo(x, originY + fieldH);
        ctx.stroke();
    }

    // Hash marks: short ticks at the quarter points across, halfway between
    // each pair of yard lines. They do nothing mechanically and they are the
    // single strongest cue that this is a football field rather than a lawn.
    const tick = 0.9 * k;
    const hashRows = [originY + fieldH * 0.33, originY + fieldH * 0.67];
    const step = fieldW / (FIELD.segments * 5);
    ctx.lineWidth = Math.max(1, 0.09 * k);
    for (let x = originX + step; x < originX + fieldW; x += step) {
        for (const y of hashRows) {
            ctx.beginPath();
            ctx.moveTo(x, y - tick / 2);
            ctx.lineTo(x, y + tick / 2);
            ctx.stroke();
        }
    }

    return { canvas, ctx };
}

/** The turf plane, markings and all. */
function buildTurf() {
    const playLength = FIELD.lineInterval * FIELD.segments;
    const totalLength = playLength + FIELD.endZone * 2;
    const totalWidth = FIELD.width + FIELD.sideline * 2;

    const { canvas } = paintMarkings();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;

    const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(totalLength, totalWidth),
        new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95, metalness: 0 })
    );
    // The plane is born standing up, so lay it down. The field's long axis is
    // world X (downfield) and its short axis is world Z (sideline to
    // sideline), which is the mapping view.js relies on.
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(playLength / 2, 0, 0);
    mesh.receiveShadow = true;
    mesh.name = 'turf';
    return mesh;
}

/** A goal post at a goal line. Simple uprights on a gooseneck, because at the
 *  play camera's distance nobody is counting the pipes. */
function buildGoalPost(x, facing) {
    const post = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({
        color: 0xf2c53d, roughness: 0.5, metalness: 0.3,
    });
    const pipe = (h, r = 0.09) =>
        new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 8), material);

    const stand = pipe(3.2);
    stand.position.y = 1.6;
    post.add(stand);

    const crossbar = pipe(5.6, 0.08);
    crossbar.rotation.x = Math.PI / 2;
    crossbar.position.y = 3.05;
    post.add(crossbar);

    for (const side of [-1, 1]) {
        const upright = pipe(5.2, 0.08);
        upright.position.set(0, 5.6, side * 2.8);
        post.add(upright);
    }

    post.position.set(x, 0, 0);
    post.rotation.y = facing;
    post.name = 'goalPost';
    return post;
}

/**
 * The stands. A raked shell down both sidelines and nothing in them (D8).
 *
 * SHRUNK ON 2026-09-08 after the first screenshot. They were six rows stepping
 * 1.4m outward from 2.5m off the margin, so they reached 11.4m beyond the
 * sideline on each side and the built scene came out roughly 55m across for a
 * field 30m wide. From the play camera they took the outer third of the frame
 * down each edge, which is a great deal of screen for a structure that is
 * deliberately empty.
 *
 * Now four rows stepping 1.0m from 1.2m off the margin, reaching 5.2m. Along
 * with the wider field that takes the field from about half the frame width to
 * roughly two thirds of it, which is where the attention belongs.
 *
 * The deck also came up a little in value. At 0x2a3140 under this lighting the
 * rows read as black voids rather than as structure, and an empty stand should
 * look empty rather than look like a hole in the world.
 */
function buildStands() {
    const stands = new THREE.Group();
    const playLength = FIELD.lineInterval * FIELD.segments;
    const totalLength = playLength + FIELD.endZone * 2;
    const half = FIELD.width / 2 + FIELD.sideline;

    const ROWS = 4;
    const STEP_OUT = 1.0;      // metres further out per riser
    const STEP_UP = 0.7;       // metres higher per riser
    const STANDOFF = 1.2;      // metres from the sideline margin to row one

    const deck = new THREE.MeshStandardMaterial({
        color: 0x3a4356, roughness: 0.9, metalness: 0.05,
    });
    const wall = new THREE.MeshStandardMaterial({
        color: 0x232b38, roughness: 0.95, metalness: 0,
    });

    for (const side of [-1, 1]) {
        for (let row = 0; row < ROWS; row += 1) {
            const step = new THREE.Mesh(
                new THREE.BoxGeometry(totalLength, 0.8, 1.1), deck
            );
            step.position.set(
                playLength / 2,
                0.4 + row * STEP_UP,
                side * (half + STANDOFF + row * STEP_OUT)
            );
            step.receiveShadow = true;
            stands.add(step);
        }
        // The blank wall behind, so the camera never sees past the stand into
        // empty space. Sized to finish just above the top riser.
        const backZ = half + STANDOFF + ROWS * STEP_OUT;
        const backH = ROWS * STEP_UP + 1.6;
        const back = new THREE.Mesh(
            new THREE.BoxGeometry(totalLength, backH, 0.5), wall
        );
        back.position.set(playLength / 2, backH / 2, side * backZ);
        stands.add(back);
    }

    stands.name = 'stands';
    return stands;
}

/** Floodlight pylons at the corners. Geometry only: the light itself is a
 *  directional rig in main.js, because four real lights would cost more than
 *  the whole rest of the scene. */
function buildPylons() {
    const pylons = new THREE.Group();
    const playLength = FIELD.lineInterval * FIELD.segments;
    // Just outside the back of the stand rather than far out in the dark, now
    // that the stand itself only reaches 5.2m past the sideline margin.
    const half = FIELD.width / 2 + FIELD.sideline + 7.5;
    const mast = new THREE.MeshStandardMaterial({
        color: 0x39424f, roughness: 0.8, metalness: 0.4,
    });
    const lamp = new THREE.MeshStandardMaterial({
        color: 0xfff6d8, emissive: 0xfff2c8, emissiveIntensity: 1.6,
    });
    const aim = new THREE.Vector3(playLength / 2, 0, 0);

    for (const x of [playLength * 0.12, playLength * 0.88]) {
        for (const z of [-half, half]) {
            const pylon = new THREE.Group();
            const pole = new THREE.Mesh(
                new THREE.CylinderGeometry(0.35, 0.5, 26, 6), mast
            );
            pole.position.y = 13;
            pylon.add(pole);

            const bank = new THREE.Mesh(new THREE.BoxGeometry(5.5, 2.6, 0.5), lamp);
            bank.position.y = 26;
            pylon.add(bank);

            // POSITION THE PYLON BEFORE AIMING THE LAMP. `lookAt` resolves the
            // object's WORLD position by walking up its parents, so aiming a
            // child before its parent has been moved aims from the origin.
            // Every bank was pointing at the same wrong place.
            pylon.position.set(x, 0, z);
            pylons.add(pylon);
            pylon.updateMatrixWorld(true);
            bank.lookAt(aim);
        }
    }

    pylons.name = 'pylons';
    return pylons;
}

/**
 * Build the standing scene and add it to `scene`.
 *
 * Returns the group so a caller can dispose it, and so the S1 camera spike can
 * drop figures onto a real field rather than a placeholder.
 */
export function initField(scene) {
    group = new THREE.Group();
    group.name = 'field';
    group.add(buildTurf());
    group.add(buildStands());
    group.add(buildPylons());

    // ON THE END LINE, AT THE BACK OF THE END ZONE, which is where a real goal
    // post stands and where it stays out of the way. They were at 0.4 of the
    // end zone's depth, so the near one sat 2m in front of the goal line and
    // filled the bottom of the first screenshot from a camera 22m behind it.
    const playLength = FIELD.lineInterval * FIELD.segments;
    group.add(buildGoalPost(-FIELD.endZone, 0));
    group.add(buildGoalPost(playLength + FIELD.endZone, Math.PI));

    scene.add(group);
    return group;
}

export function getFieldGroup() {
    return group;
}

/** Release everything this module made. Safe to call more than once. */
export function disposeField() {
    if (!group) return;
    group.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
            const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
            materials.forEach((m) => {
                if (m.map) m.map.dispose();
                m.dispose();
            });
        }
    });
    if (group.parent) group.parent.remove(group);
    group = null;
}
