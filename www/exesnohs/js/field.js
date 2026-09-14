// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * field.js - The standing scene: turf, markings, sidelines and the
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
import { EXESNOHS_CONFIG as CFG, FIELD, SIM, UNITS_TO_METRES } from './config.min.js';
import { ladderBands } from './scoring.min.js';

let group = null;
let band = null;
let boardFace = null;

/**
 * THE LINE OF SCRIMMAGE, MEASURED RATHER THAN ASSUMED.
 *
 * Lining up pass2, run3 and jumbo1 puts the centre at sim x = 200 every time,
 * with the rest of the line inside 5 units either side and the quarterback 15
 * behind. 200 units is one lineInterval, so the ball is snapped from the first
 * yard line and camera.js has been assuming the same number all along.
 */
export const SCRIMMAGE_X = FIELD.lineInterval;

/**
 * WHERE THE SCORING LADDER FALLS ON THE GRASS, in world metres.
 *
 * scoring.js works in field units because that is what the simulation hands it,
 * so this is the one conversion. The paint cannot claim a rung the arithmetic
 * does not award, which is the entire reason this is not a list of numbers
 * typed into the turf painter.
 *
 * CLIPPED TO THE PLAYING SURFACE, both ends. The outer bands run to infinity in
 * the arithmetic, which is correct for deciding a score and useless for
 * deciding where to put paint: unclipped, the 50 band's midpoint lands three
 * metres inside the far end zone. Every caller here wants the visible stretch,
 * and `pointsForPosition` is still the only thing that decides what a carrier
 * is worth.
 */
let ladderMetres = null;

export function ladderInMetres() {
    // Worked out once. Config is frozen and the ladder is a constant, and this
    // is read on every frame of every play by the lit band.
    if (ladderMetres) return ladderMetres;
    const playLength = FIELD.lineInterval * FIELD.segments;
    const clip = (v) => Math.min(Math.max(v, 0), playLength);
    ladderMetres = ladderBands(SIM.lineInterval).map((b) => ({
        points: b.points,
        from: clip(b.from === -Infinity ? 0 : b.from * UNITS_TO_METRES),
        to: clip(b.to === Infinity ? playLength : b.to * UNITS_TO_METRES),
    }));
    return ladderMetres;
}

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

    /**
     * ...AND THE END LINES, WHICH THE PAINT NEVER HAD.
     *
     * The end zones were filled to the edge of the texture and stopped there,
     * so the back of each one was a colour change rather than a line. That was
     * invisible while the near end sat in the last 2% of the frame, and the
     * portrait lift (see `camera.solve.headroom`) brought it up to 84%, where a
     * red block simply ending reads as the world running out.
     *
     * Inset by half the stroke, because the canvas edge IS the end line and a
     * centred stroke would paint half of itself off the texture.
     */
    const endInset = ctx.lineWidth / 2;
    for (const x of [endInset, canvas.width - endInset]) {
        ctx.beginPath();
        ctx.moveTo(x, originY);
        ctx.lineTo(x, originY + fieldH);
        ctx.stroke();
    }

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

    paintLadder(ctx, k, originX, originY, fieldH);
    paintScrimmage(ctx, k, originX, originY, fieldH);

    return { canvas, ctx };
}

/**
 * What each stretch of field is worth, written on the grass.
 *
 * THE NUMERALS ARE TURNED AND STRETCHED, and both are forced by the camera.
 *
 * TURNED, because this camera stands behind an end zone rather than on a
 * touchline. A real field's numbers read from the side; these have to read from
 * the end, so the glyph's top points downfield. Working that out by
 * transforming the axes rather than trying rotations: after `rotate(PI/2)` the
 * text's own up vector, local (0,-1), lands on canvas +x, and canvas +x is
 * world +X, which is up the screen. Its baseline runs across the field, which
 * is the direction that is not foreshortened.
 *
 * STRETCHED, because the glyph's HEIGHT now runs downfield, and downfield is
 * the axis the rake eats: a length there projects as sin(pitch), which is 0.47
 * at the 28 degrees a wide screen uses and 0.87 at the 60-odd a phone does. An
 * unstretched number reads as a squashed smudge on desktop. Scaling local y
 * before drawing stretches exactly that axis and nothing else.
 *
 * TWO OF EACH, one inside each touchline, for the same reason a real field has
 * two: whichever side the play goes to, a number is near it. The middle is left
 * clear because the middle is where the football happens.
 */
function paintLadder(ctx, k, originX, originY, fieldH) {
    const turf = CFG.turf;
    const rows = [
        originY + turf.ladderInset * k,
        originY + fieldH - turf.ladderInset * k,
    ];

    ctx.save();
    ctx.fillStyle = turf.ladderInk;
    ctx.font = `bold ${Math.round(turf.ladderHeight * k)}px Tahoma, Geneva, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const rung of ladderInMetres()) {
        // The band worth nothing gets no numeral. A "0" painted on the grass is
        // visual noise for a fact nobody is aiming at, and the 2D game only had
        // room for it because its labels sat in a bar under the field rather
        // than on it.
        if (rung.points <= 0) continue;
        const cx = originX + ((rung.from + rung.to) / 2) * k;
        for (const cy of rows) {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(Math.PI / 2);
            ctx.scale(1, turf.ladderStretch);
            ctx.fillText(`${rung.points}`, 0, 0);
            ctx.restore();
        }
    }
    ctx.restore();
}

/**
 * The line the ball is snapped from, in the 2D game's yellow.
 *
 * Painted LAST so it sits over the white yard line it shares a position with,
 * and wider than one, because it is the only line on this field that a visitor
 * has to be able to find at a glance.
 */
function paintScrimmage(ctx, k, originX, originY, fieldH) {
    const x = originX + SCRIMMAGE_X * k;
    ctx.save();
    ctx.strokeStyle = CFG.turf.scrimmage;
    ctx.lineWidth = Math.max(2, CFG.turf.scrimmageWidth * k);
    ctx.beginPath();
    ctx.moveTo(x, originY);
    ctx.lineTo(x, originY + fieldH);
    ctx.stroke();
    ctx.restore();
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

/**
 * The ground the stadium stands on, outside the paint.
 *
 * ONE UNTEXTURED PLANE UNDER EVERYTHING, because it is dark, it is out of
 * focus, and nothing about it is ever read. It sits a hair below the turf so
 * the two can never fight over the same pixels, and it runs past the stands on
 * both sides so their ends have something to rest on rather than hanging over a
 * void. See `CFG.turf.apron` for why it is here at all.
 */
function buildApron() {
    const apron = CFG.turf.apron;
    const playLength = FIELD.lineInterval * FIELD.segments;
    const length = playLength + FIELD.endZone * 2 + apron.beyond * 2;
    const width = FIELD.width + FIELD.sideline * 2 + apron.beyond * 2;

    const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(length, width),
        new THREE.MeshStandardMaterial({
            color: apron.colour, roughness: 1, metalness: 0,
        })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(playLength / 2, -0.02, 0);
    mesh.receiveShadow = true;
    mesh.name = 'apron';
    return mesh;
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
/**
 * THE STANDS, AS NUMBERS: where each riser is, so the finale can put fans on
 * them and a card stunt in their hands without a copy of these getting out of
 * step with the geometry.
 *
 *   rows       risers per side
 *   top(r)     world y of riser r's standing surface
 *   out(r)     world |z| of riser r's centre line
 *   fromX/toX  the length of the stand along the field
 */
export function standLayout() {
    const playLength = FIELD.lineInterval * FIELD.segments;
    // AS LONG AS THE GROUND THEY STAND ON, which used to be the field exactly.
    // A stand that stops on the end line has two cut ends, and the portrait
    // camera now looks at the near pair (see `camera.solve.headroom`). Running
    // them the length of the apron is also what a real stand does.
    const totalLength = playLength + FIELD.endZone * 2 + CFG.turf.apron.beyond * 2;
    const half = FIELD.width / 2 + FIELD.sideline;
    const ROWS = 4;
    const STEP_OUT = 1.0;      // metres further out per riser
    const STEP_UP = 0.7;       // metres higher per riser
    const STANDOFF = 1.2;      // metres from the sideline margin to row one
    return {
        rows: ROWS,
        stepOut: STEP_OUT,
        stepUp: STEP_UP,
        standoff: STANDOFF,
        half,
        totalLength,
        fromX: playLength / 2 - totalLength / 2,
        toX: playLength / 2 + totalLength / 2,
        top: (r) => 0.8 + r * STEP_UP,
        out: (r) => half + STANDOFF + r * STEP_OUT,
    };
}

function buildStands() {
    const stands = new THREE.Group();
    const playLength = FIELD.lineInterval * FIELD.segments;
    const { rows: ROWS, stepOut: STEP_OUT, stepUp: STEP_UP, standoff: STANDOFF, half, totalLength } = standLayout();

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
/**
 * WHERE THE FOUR LAMP BANKS ARE, in world metres, near end first.
 *
 * Pure and exported because the lights show has to keep all four in frame, and
 * a shot solved against a copy of these numbers is one edit away from framing
 * four towers that have moved.
 */
export function pylonSpots() {
    const playLength = FIELD.lineInterval * FIELD.segments;
    // Just outside the back of the stand rather than far out in the dark, now
    // that the stand itself only reaches 5.2m past the sideline margin.
    const half = FIELD.width / 2 + FIELD.sideline + 7.5;
    const out = [];
    for (const x of [playLength * 0.12, playLength * 0.88]) {
        for (const z of [-half, half]) out.push({ x, y: PYLON_HEIGHT, z });
    }
    return out;
}

/** The scoreboard's face, in world metres, for the same reason. */
export function boardSpot() {
    const S = CFG.scoreboard;
    return {
        x: FIELD.lineInterval * FIELD.segments + FIELD.endZone + S.beyond,
        bottom: S.standHeight,
        top: S.standHeight + S.height,
        width: S.width,
    };
}

const PYLON_HEIGHT = 26;
/** The four lamp banks, once built, so the shows can switch them. */
let banks = [];
/** What a bank glows at before anything wakes the stadium up. */
export const BANK_GLOW = 1.6;

export function getPylonBanks() {
    return banks;
}

function buildPylons() {
    const pylons = new THREE.Group();
    const playLength = FIELD.lineInterval * FIELD.segments;
    const mast = new THREE.MeshStandardMaterial({
        color: 0x39424f, roughness: 0.8, metalness: 0.4,
    });
    const aim = new THREE.Vector3(playLength / 2, 0, 0);
    banks = [];

    for (const spot of pylonSpots()) {
        const { x, z } = spot;
        {
            const pylon = new THREE.Group();
            const pole = new THREE.Mesh(
                new THREE.CylinderGeometry(0.35, 0.5, PYLON_HEIGHT, 6), mast
            );
            pole.position.y = PYLON_HEIGHT / 2;
            pylon.add(pole);

            // ONE MATERIAL PER BANK, where there used to be one shared by all
            // four. The lights show strikes them up one at a time, and a shared
            // material can only ever switch all four together.
            const lamp = new THREE.MeshStandardMaterial({
                color: 0xfff6d8, emissive: 0xfff2c8, emissiveIntensity: BANK_GLOW,
            });
            const bank = new THREE.Mesh(new THREE.BoxGeometry(5.5, 2.6, 0.5), lamp);
            bank.position.y = PYLON_HEIGHT;
            pylon.add(bank);
            banks.push(bank);

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
 * THE LIT BAND, which is the half of the 2D game's touchline labels that paint
 * alone cannot do.
 *
 * The numerals say where the rungs are. This says which one the ball is on, and
 * it says it while the play is running, which is the only moment it matters.
 *
 * ONE MESH THAT MOVES, not a repaint. The markings are baked into a single
 * 2048px canvas texture, so lighting a band by repainting would re-upload the
 * whole field every time a carrier crossed a line.
 */
function buildBand() {
    const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
            color: CFG.band.ink,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            toneMapped: false,
        })
    );
    // Local X runs downfield and local Y across, once it is laid down.
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = CFG.band.lift;
    // Under the player markers (renderOrder 2), over the turf.
    mesh.renderOrder = 1;
    mesh.scale.set(FIELD.lineInterval, FIELD.width, 1);
    mesh.name = 'band';
    mesh.visible = false;
    mesh.userData.lit = false;
    return mesh;
}

/**
 * Light the band a carrier at `x` metres is standing in, or put it out.
 *
 * Takes the bands from the same list the numerals were painted from, so the lit
 * stretch and the number written on it can never disagree.
 */
export function setBandAt(x, visible = true) {
    if (!band) return null;

    const rung = visible
        ? ladderInMetres().find((b) => x >= b.from && x < b.to) : null;
    // Behind the first rung there is nothing to light: a band worth nothing is
    // not news, and lighting it at the snap would make the highlight look like
    // decoration rather than like a score.
    if (!rung || rung.points <= 0 || rung.to <= rung.from) {
        // WANTED OUT, NOT HIDDEN. `fadeBand` owns `visible`, because a mesh
        // switched off here would take its own fade with it: the opacity would
        // ease down over something nobody could see and the band would simply
        // vanish at the whistle. Config carries a fade time for both
        // directions and this is what lets the second one happen.
        band.userData.lit = false;
        return null;
    }

    band.scale.set(rung.to - rung.from, FIELD.width, 1);
    band.position.set((rung.from + rung.to) / 2, CFG.band.lift, 0);
    band.userData.lit = true;
    return rung;
}

/** Ease the band in and out rather than switching it, so crossing a line reads
 *  as arriving somewhere rather than as a flicker. */
export function fadeBand(delta) {
    if (!band) return;
    const target = band.userData.lit ? CFG.band.opacity : 0;
    const rate = CFG.band.fade > 0 ? delta / CFG.band.fade : 1;
    const gap = target - band.material.opacity;
    band.material.opacity += gap * Math.min(1, Math.max(0, rate));
    // Below this it contributes nothing and is only a draw call.
    band.visible = band.material.opacity > 0.002;
}

/**
 * THE SCOREBOARD BEYOND THE FAR END ZONE.
 *
 * It is here to fill a hole and it does a job while it is there. The hole is
 * real: the play camera looks downfield and slightly up, so the top quarter of
 * every frame is empty black above the far end zone, and the crowd that fills
 * the same strip in the 2D game was dropped (D8) and never replaced.
 *
 * ITS FACE IS A CANVAS TEXTURE, redrawn on the two occasions the numbers change
 * rather than per frame. It carries what the HUD carries, which is what lets it
 * be small and far away: nothing here is the only place a number is readable,
 * so it is allowed to be atmosphere.
 */
function buildScoreboard() {
    const S = CFG.scoreboard;
    const playLength = FIELD.lineInterval * FIELD.segments;
    const board = new THREE.Group();

    const frame = new THREE.MeshStandardMaterial({
        color: S.frame, roughness: 0.85, metalness: 0.15,
    });
    for (const side of [-1, 1]) {
        const post = new THREE.Mesh(
            new THREE.CylinderGeometry(0.32, 0.4, S.standHeight, 6), frame
        );
        post.position.set(0, S.standHeight / 2, side * (S.width / 2 - 1.4));
        board.add(post);
    }

    const shell = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, S.height + 0.7, S.width + 0.7), frame
    );
    shell.position.y = S.standHeight + S.height / 2;
    board.add(shell);

    boardFace = paintScoreboard();
    const texture = new THREE.CanvasTexture(boardFace.canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const face = new THREE.Mesh(
        new THREE.PlaneGeometry(S.width, S.height),
        // Unlit, so the board reads as a lit sign rather than as a painted
        // panel that happens to be facing away from both floodlights.
        new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })
    );
    // Turned to face back down the field, at the near side of the shell.
    face.rotation.y = -Math.PI / 2;
    face.position.set(-0.28, S.standHeight + S.height / 2, 0);
    board.add(face);
    boardFace.texture = texture;
    // Paint it once here rather than waiting for the first play, or the board
    // stands blank behind the welcome card and the whole first playbook.
    updateScoreboard({ play: 1, of: CFG.rules.playsPerGame, score: 0 });

    board.position.set(playLength + FIELD.endZone + S.beyond, 0, 0);
    board.name = 'scoreboard';
    return board;
}

/** Draw the board's face. Returns the canvas and its context so the numbers can
 *  be redrawn without rebuilding anything. */
function paintScoreboard(doc = (typeof document === 'undefined' ? null : document)) {
    const S = CFG.scoreboard;
    // Headless, the board is simply not drawn, which is the same answer the
    // markers give and for the same reason.
    if (!doc || !doc.createElement) return { canvas: null, ctx: null, texture: null };
    const canvas = doc.createElement('canvas');
    canvas.width = S.textureWidth;
    canvas.height = Math.round(S.textureWidth * (S.height / S.width));
    const ctx = canvas.getContext && canvas.getContext('2d');
    return { canvas, ctx, texture: null };
}

/**
 * THE BOARD'S THREE PANELS, AS PLAIN NUMBERS.
 *
 * Separated from the painting so the layout can be measured without a canvas.
 * Headless there is no `document`, so `paintScoreboard` hands back a null
 * context and `updateScoreboard` returns early: every question about where the
 * panels are and how wide they end up would otherwise be unanswerable in a test,
 * which is how the old version came to draw a five-hundred-pixel play count into
 * a five-hundred-and-twelve-pixel half and nobody noticed.
 *
 * THE COLUMNS ARE WEIGHTED, NOT EQUAL. PLAY carries "10 / 10" and the other two
 * carry two or three characters, so equal thirds would shrink the play count to
 * fit a panel the clock leaves two thirds empty. CLOCK matches POINTS exactly,
 * which is what QA asked for.
 */
export function boardColumns(width, { play = 1, of = 10, score = 0, clock = '' } = {}) {
    const columns = [
        { weight: 1.5, label: 'PLAY', value: `${play} / ${of}` },
        { weight: 1, label: 'POINTS', value: `${score}` },
        { weight: 1, label: 'CLOCK', value: `${clock}` },
    ];
    const total = columns.reduce((sum, c) => sum + c.weight, 0);
    let edge = 0;
    for (const col of columns) {
        col.span = (width * col.weight) / total;
        col.centre = edge + col.span / 2;
        edge += col.span;
        col.edge = edge;
    }
    return columns;
}

/**
 * WHERE THE STARS SIT ON THE BOARD, as fractions of its face. Pure, so the one
 * question that can go wrong (do they collide with the labels under them) is a
 * test rather than a screenshot.
 */
export function starLayout(count = CFG.milestones.thresholds.length) {
    const radius = 0.052;          // of the face's height
    const y = 0.115;
    const step = 0.052;            // of the face's width
    return Array.from({ length: count }, (_, i) => ({
        x: 0.5 + (i - (count - 1) / 2) * step,
        y,
        radius,
    }));
}

function starPath(ctx, cx, cy, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 === 0 ? r : r * 0.45;
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
}

function paintStars(ctx, w, h, lit) {
    const S = CFG.scoreboard;
    starLayout().forEach((star, i) => {
        const cx = star.x * w;
        const cy = star.y * h;
        const r = star.radius * h;
        starPath(ctx, cx, cy, r);
        if (i < lit) {
            ctx.shadowColor = S.gold;
            ctx.shadowBlur = Math.round(h * 0.06);
            ctx.fillStyle = S.gold;
            ctx.fill();
            ctx.shadowBlur = 0;
        } else {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
            ctx.fill();
        }
    });
}

function paintTakeover(ctx, w, h, { value = '', label = 'POINTS', glow = 1 } = {}) {
    const S = CFG.scoreboard;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = S.label;
    ctx.font = `600 ${Math.round(h * 0.1)}px Tahoma, Geneva, sans-serif`;
    ctx.fillText(label, w / 2, h * 0.28);

    let size = Math.round(h * 0.56);
    ctx.font = `bold ${size}px Tahoma, Geneva, sans-serif`;
    const wide = ctx.measureText(value).width;
    if (wide > w * 0.8) {
        size = Math.floor(size * ((w * 0.8) / wide));
        ctx.font = `bold ${size}px Tahoma, Geneva, sans-serif`;
    }
    const baseline = h * 0.68;
    ctx.shadowColor = S.gold;
    ctx.shadowBlur = Math.round(h * (0.1 + 0.12 * glow));
    ctx.fillStyle = S.gold;
    ctx.fillText(value, w / 2, baseline);
    ctx.shadowBlur = Math.round(h * 0.04);
    ctx.fillStyle = S.ink;
    ctx.fillText(value, w / 2, baseline);
    ctx.shadowBlur = 0;
}

/**
 * Put the play count, the score and the play clock on the board.
 *
 * Called from main.js at exactly the moments the HUD is told the same thing, so
 * the board can never be a play behind.
 *
 * THE CLOCK ARRIVES AS A STRING, ALREADY FORMATTED, and that is deliberate: this
 * file paints a board and has no business deciding what a stopped clock reads or
 * how many seconds are left. main.js owns the one and play.js owns the other.
 */
export function updateScoreboard({
    play = 1, of = 10, score = 0, clock = '', stars = 0, takeover = null,
} = {}) {
    if (!boardFace || !boardFace.ctx) return null;
    const S = CFG.scoreboard;
    const { ctx, canvas } = boardFace;
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = S.face;
    ctx.fillRect(0, 0, w, h);

    // A hairline border, which is what makes an unlit rectangle read as a
    // screen rather than as a hole in the structure, and a rule down the middle
    // so the two readings are two panels rather than one crowded row.
    ctx.strokeStyle = S.rule;
    ctx.lineWidth = Math.max(2, h * 0.014);
    ctx.strokeRect(ctx.lineWidth, ctx.lineWidth, w - ctx.lineWidth * 2, h - ctx.lineWidth * 2);

    /**
     * THE STARS, ONE PER HUNDRED, ALONG THE TOP.
     *
     * Five of them, dim until a show lights one, and they stay lit for the
     * rest of the game. They are the part of the stadium waking up that the
     * play camera can always see: the towers and the stands are out of frame
     * on a phone, and the board never is. Unlit ones are drawn too, faintly,
     * so there is something to earn before anybody has earned it.
     */
    paintStars(ctx, w, h, stars);

    /**
     * AND DURING A SHOW, THE BOARD IS TAKEN OVER BY THE NUMBER.
     *
     * One reading filling the face, in gold rather than the usual amber, with
     * its label above. It is drawn from the same lamp recipe as the panels so
     * it reads as the board saying it rather than as something stuck on it.
     */
    if (takeover) {
        paintTakeover(ctx, w, h, takeover);
        if (boardFace.texture) boardFace.texture.needsUpdate = true;
        return boardFace.canvas;
    }

    /**
     * THREE PANELS NOW, AND THEY ARE NOT EQUAL.
     *
     * The board was two halves with a rule down the middle. It has gained a play
     * clock, and three equal thirds would be wrong: PLAY carries "10 / 10",
     * seven characters, while POINTS and CLOCK carry two or three. Equal columns
     * would shrink the play count to fit a panel the clock leaves two thirds
     * empty.
     *
     * So the columns are WEIGHTED, the clock is sized to match POINTS exactly as
     * QA asked, and the rules are drawn between whatever columns there are
     * rather than at a hard-coded middle.
     */
    const COLUMNS = boardColumns(w, { play, of, score, clock });
    ctx.beginPath();
    for (const col of COLUMNS.slice(0, -1)) {
        ctx.moveTo(col.edge, h * 0.16);
        ctx.lineTo(col.edge, h * 0.84);
    }
    ctx.stroke();

    /**
     * THE NUMERALS ARE LAMPS, WHICH IS WHY THEY ARE DRAWN TWICE.
     *
     * A scoreboard is a grid of bulbs behind a dark panel, so the glyph itself
     * is near-white and the COLOUR is the halo it throws. Painting flat amber
     * type made the board read as a user interface element, the same amber as
     * the buttons at the bottom of the screen, sitting seventy metres away in a
     * night sky. A shadow of the glow colour under a hot core costs one extra
     * fill and does the whole job.
     */
    /**
     * EVERY CELL IS FITTED TO ITS OWN HALF, and it was not before.
     *
     * The numerals were drawn at a fixed 46% of the board's height and centred
     * on each half, with nothing checking that they fit. "1 / 10" at that size
     * is about five hundred pixels wide in a half only five hundred and twelve
     * across, so it ran to both edges and past the left one, and a two-digit
     * score sat in the middle of a half that a five-character play count had
     * already overflowed. It read as off-centre because part of it was outside
     * the panel.
     *
     * Measuring the string and scaling down to fit is four lines and it cannot
     * be wrong for any score the game can produce, including a three-digit
     * negative one on the worst possible afternoon.
     */
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const SAFE = 0.78;               // of a half-panel, so the rule has air

    const cell = (cx, span, label, value) => {
        ctx.fillStyle = S.label;
        ctx.font = `600 ${Math.round(h * 0.115)}px Tahoma, Geneva, sans-serif`;
        // Tracked out, because a small label in caps is the one place letter
        // spacing does real work.
        ctx.save();
        ctx.translate(cx, h * 0.28);
        ctx.scale(1.16, 1);
        ctx.fillText(label, 0, 0);
        ctx.restore();

        const room = span * SAFE;
        let size = Math.round(h * 0.42);
        ctx.font = `bold ${size}px Tahoma, Geneva, sans-serif`;
        const wide = ctx.measureText(value).width;
        if (wide > room) {
            size = Math.max(12, Math.floor(size * (room / wide)));
            ctx.font = `bold ${size}px Tahoma, Geneva, sans-serif`;
        }

        // The numerals are lamps: a hot near-white core over a halo of the
        // colour, rather than flat amber type, which read as an interface
        // element sitting seventy metres away in a night sky.
        const baseline = h * 0.665;
        ctx.shadowColor = S.glow;
        ctx.shadowBlur = Math.round(h * 0.13);
        ctx.fillStyle = S.glow;
        ctx.fillText(value, cx, baseline);
        ctx.shadowBlur = Math.round(h * 0.05);
        ctx.fillStyle = S.ink;
        ctx.fillText(value, cx, baseline);
        ctx.shadowBlur = 0;
    };
    for (const col of COLUMNS) cell(col.centre, col.span, col.label, col.value);

    if (boardFace.texture) boardFace.texture.needsUpdate = true;
    return boardFace.canvas;
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
    // The ground first, then the field on top of it.
    group.add(buildApron());
    group.add(buildTurf());
    group.add(buildStands());
    group.add(buildPylons());
    group.add(buildScoreboard());

    band = buildBand();
    group.add(band);

    /**
     * AND NO GOAL POSTS, WHICH IS A RULES DECISION RATHER THAN A LOOK.
     *
     * There were two, on the end line at the back of each end zone. NOTHING IN
     * THIS GAME IS EVER KICKED: the ladder pays for carrying the ball and the
     * only ways a play ends are a catch, a run, a sack, a pick or the whistle,
     * so a post is a piece of equipment for a rule the game does not have.
     *
     * They were also the most expensive furniture in the frame. The far one
     * stood directly in front of the scoreboard from the play camera and drew a
     * yellow cross over the one thing up there a visitor has to read, and the
     * near one put two yellow pipes through the bottom of every replay.
     * Removed on QA's own call, 2026-09-12.
     */

    scene.add(group);
    return group;
}

export function getFieldGroup() {
    return group;
}

/** Release everything this module made. Safe to call more than once. */
export function disposeField() {
    band = null;
    boardFace = null;
    banks = [];
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
