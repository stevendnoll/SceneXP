// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * spectacle.js - Draws the milestone shows, and the stadium they wake up.
 *
 * milestones.js says what a show looks like at time `t` and fireworks.js says
 * where every spark is. This file owns the meshes and does nothing but apply
 * those answers, in the same split view.js keeps with the simulation.
 *
 * BUILT ON FIRST USE, NOT AT LOAD. Most visitors never reach 200, and a phone
 * loading the page should not pay for a spark buffer and four light cones that
 * may never be drawn. Everything here is created the first time a show needs it
 * and then kept for the rest of the visit. The one exception is the crowd,
 * which is in the stands from the first frame and which the finale fills up.
 *
 * THE STADIUM STAYS AWAKE. Once a show has played, what it switched on stays
 * switched on for the rest of the game (`setAwake`): after 100 the lamp banks
 * glow brighter and carry a halo. The rest of what a level leaves behind is on
 * the scoreboard, which is the one part of the stadium the play camera always
 * has in frame (see `field.updateScoreboard`).
 */
import { XO_CONFIG as CFG, FIELD } from './config.min.js';
import { getPylonBanks, pylonSpots, BANK_GLOW, standLayout } from './field.min.js';
import { ballProfile, buildLaces } from './ball.min.js';
import {
    planFireworks, sparksAt, planBulbs, bulbsAt, planConfetti, confettiAt,
} from './fireworks.min.js';
import {
    fireworksSetup, finaleFireworksSetup, turfSetup, trophySpot, blimpOrbitPosition,
} from './milestones.min.js';
import {
    crowdSeats, pixelMessage, cardRow, cardAt, messageColumn, fanArrival, cheerHop, cheerArms, cheerLength,
    cardLayout, cardSpot, NEUTRAL,
} from './stunt.min.js';
import { buildFanParts, POSES, HAIR } from './fans.min.js';

const M = CFG.milestones;

let scene = null;
let lights = null;
let base = null;
let cones = null;
let halos = null;
let sparks = null;
let glow = null;
let plan = null;
let calmShow = false;
let awake = 0;
/** True between `beginShow` and `endShow`. */
let inShow = false;

/**
 * Hand over the scene and the lights the shows dim and raise. `lights` is
 * `{ ambient, key, fill }`, and their intensities as they are now are what "normal"
 * means for the rest of the visit.
 */
export function initSpectacle(target, handles = {}) {
    scene = target;
    lights = handles;
    base = {};
    for (const [name, light] of Object.entries(lights)) {
        if (light) base[name] = Number(light.intensity) || 0;
    }
    base.fog = scene && scene.fog ? { near: scene.fog.near, far: scene.fog.far } : null;
    awake = 0;
    // THE ONE THING BUILT AT LOAD. The regulars are part of the stadium, not
    // of a show, so they are in their seats behind the welcome card.
    buildCrowd();
    poseCrowd(null);
}

function setFog(scale = 1) {
    if (!scene || !scene.fog || !base || !base.fog) return;
    scene.fog.near = base.fog.near * scale;
    scene.fog.far = base.fog.far * scale;
}

/** A soft round glow, drawn once and shared by the sparks and the halos. */
function glowTexture() {
    if (glow) return glow;
    if (typeof document === 'undefined' || !document.createElement) return null;
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx || !ctx.createRadialGradient) return null;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.75)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    glow = new THREE.CanvasTexture(canvas);
    glow.colorSpace = THREE.SRGBColorSpace;
    return glow;
}

/**
 * THE LIGHT CONES, one from each bank down to the middle of the field.
 *
 * Only ever drawn DURING the lights show. A beam across the top of the frame for
 * the rest of the game would sit over the play, and real floodlights only show
 * a beam in haze anyway. They are brightest at the lamp and fade to nothing at
 * the grass, which additive blending does with vertex colours alone: black adds
 * nothing, so there is no transparency sorting to get wrong.
 */
function buildCones() {
    if (cones || !scene) return cones;
    const len = FIELD.lineInterval * FIELD.segments;
    const aim = new THREE.Vector3(len / 2, 0, 0);
    cones = pylonSpots().map((spot) => {
        const reach = Math.hypot(aim.x - spot.x, spot.y, spot.z);
        const geometry = new THREE.CylinderGeometry(0.6, 11, reach, 20, 6, true);
        // Axis along +z, narrow end at the origin, so `lookAt` aims it.
        geometry.rotateX(-Math.PI / 2);
        geometry.translate(0, 0, reach / 2);
        const position = geometry.attributes && geometry.attributes.position;
        if (position && position.count) {
            const colours = new Float32Array(position.count * 3);
            for (let i = 0; i < position.count; i += 1) {
                const along = 1 - Math.min(1, Math.max(0, position.getZ(i) / reach));
                const v = along * along;
                colours[i * 3] = v;
                colours[i * 3 + 1] = v * 0.95;
                colours[i * 3 + 2] = v * 0.82;
            }
            geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
        }
        const material = new THREE.MeshBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
            fog: false,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(spot.x, spot.y, spot.z);
        mesh.lookAt(aim);
        mesh.visible = false;
        mesh.name = 'milestone-cone';
        scene.add(mesh);
        return mesh;
    });
    return cones;
}

/** A glow around each bank, which is how a lamp reads as ON from far away. */
function buildHalos() {
    if (halos || !scene) return halos;
    halos = pylonSpots().map((spot) => {
        const material = new THREE.SpriteMaterial({
            map: glowTexture(),
            color: 0xfff0c8,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            fog: false,
        });
        const sprite = new THREE.Sprite(material);
        sprite.position.set(spot.x, spot.y, spot.z);
        sprite.scale.set(16, 16, 1);
        sprite.visible = false;
        sprite.name = 'milestone-halo';
        scene.add(sprite);
        return sprite;
    });
    return halos;
}

/** One buffer for every spark of every show, sized once. */
function buildSparks() {
    if (sparks || !scene) return sparks;
    const F = M.fireworks;
    const positions = new Float32Array(F.pool * 3);
    const colours = new Float32Array(F.pool * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    const material = new THREE.PointsMaterial({
        size: F.size,
        map: glowTexture(),
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
        fog: false,
        toneMapped: false,
    });
    const points = new THREE.Points(geometry, material);
    // The buffer is rewritten every frame and spans half the sky, so its
    // bounding sphere would be stale the moment it was computed.
    points.frustumCulled = false;
    points.visible = false;
    points.name = 'milestone-sparks';
    scene.add(points);
    sparks = { points, geometry, positions, colours };
    return sparks;
}

/**
 * GET READY FOR A SHOW. `seed` rolls the fireworks, so every game's are its own;
 * `calm` is somebody who asked not to be moved about.
 */
export function beginShow(level, { seed = 1, calm = false } = {}) {
    calmShow = !!calm;
    inShow = true;
    plan = null;
    // A CHEER STOPS FOR A SHOW, SEATED. Only the finale poses the crowd, so a
    // cheer merely dropped here would leave fans hanging in mid-air through
    // the lights, the fireworks, the blimp or the numbers.
    if (cheering) {
        cheering = null;
        poseCrowd(null);
    }
    if (level === 100) {
        buildCones();
        buildHalos();
    }
    if (level === 200) {
        buildSparks();
        plan = planFireworks({ ...fireworksSetup(level), seed });
    }
    if (level === 300) {
        buildBlimp();
        paintScreen(false);
    }
    if (level === 400) {
        bulbPlan = planBulbs(turfSetup(level));
        buildBulbs(bulbPlan.count);
    }
    if (level === 500) {
        buildSparks();
        plan = planFireworks({
            ...finaleFireworksSetup(),
            seed,
            F: { ...M.fireworks, ...M.finale.fireworks },
        });
        buildCrowd();
        buildTrophy();
        const F = M.finale;
        const len = FIELD.lineInterval * FIELD.segments;
        confettiPlan = planConfetti({
            pieces: F.confetti.pieces,
            area: { fromX: len / 2 - 17, toX: len / 2 + 17, fromZ: -12, toZ: 9 },
            from: F.confetti.from,
            seed: seed + 1,
            palette: [...F.confetti.palette, M.fireworks.palette[0]],
        });
        buildConfetti(confettiPlan.count);
        stuntMessages = crowd ? {
            perfect: pixelMessage('PERFECT', crowd.cols).lit,
            five: pixelMessage('500', crowd.cols).lit,
        } : null;
    }
}

// ---- The blimp (300) ---------------------------------------------------------

let blimp = null;
let showingBlimp = false;
let screenLit = null;

/**
 * A LOW-POLY BLIMP: an envelope, four fins, a gondola, a tail light, and a lit
 * screen down each side. Nose along +z, so a heading is `atan2(vx, vz)` like
 * every other facing in this scene.
 */
function buildBlimp() {
    if (blimp || !scene) return blimp;
    const B = M.blimp;
    const group = new THREE.Group();
    group.name = 'milestone-blimp';
    const skin = new THREE.MeshStandardMaterial({ color: 0xd9dee6, roughness: 0.55, metalness: 0.1 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x39424f, roughness: 0.7, metalness: 0.2 });

    const envelope = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 14), skin);
    envelope.scale.set(B.size.girth / 2, B.size.girth / 2, B.size.long / 2);
    group.add(envelope);

    // Four fins in a cross at the tail.
    const tailZ = -B.size.long / 2 + 2.4;
    for (let i = 0; i < 4; i += 1) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.4, 3.8), trim);
        const a = (i * Math.PI) / 2;
        fin.position.set(Math.sin(a) * 3.2, Math.cos(a) * 3.2, tailZ);
        fin.rotation.z = -a;
        group.add(fin);
    }

    const gondola = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.1, 4.4), trim);
    gondola.position.set(0, -B.size.girth / 2 - 0.25, 1.5);
    group.add(gondola);

    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xff3b30, fog: false }));
    tail.position.set(0, 0, -B.size.long / 2 - 0.2);
    group.add(tail);

    // THE SCREENS. One canvas for both, so they always say the same thing.
    let texture = null;
    let canvas = null;
    if (typeof document !== 'undefined' && document.createElement) {
        canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 150;
        texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
    }
    const face = new THREE.MeshBasicMaterial({ map: texture, color: 0xffffff, toneMapped: false });
    for (const side of [-1, 1]) {
        const screen = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.6), face);
        screen.position.set(side * (B.size.girth / 2 + 0.08), 0.2, 0.5);
        // A plane faces +z; turned a quarter to face out of its own side.
        screen.rotation.y = side * Math.PI / 2;
        group.add(screen);
    }

    group.visible = false;
    scene.add(group);
    blimp = { group, tail, canvas, texture };
    return blimp;
}

/** The side screens: the game's name until its number lands, then the number. */
function paintScreen(lit) {
    if (!blimp || screenLit === lit) return;
    screenLit = lit;
    const { canvas, texture } = blimp;
    const ctx = canvas && canvas.getContext && canvas.getContext('2d');
    if (!ctx) return;
    const S = CFG.scoreboard;
    ctx.fillStyle = '#05070b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const text = lit ? '300' : "X'S AND O'S";
    const size = lit ? 118 : 72;
    ctx.font = `bold ${size}px Tahoma, Geneva, sans-serif`;
    ctx.shadowColor = lit ? S.gold : S.glow;
    ctx.shadowBlur = lit ? 26 : 14;
    ctx.fillStyle = lit ? S.gold : S.glow;
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 4);
    ctx.shadowBlur = 6;
    ctx.fillStyle = S.ink;
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 4);
    ctx.shadowBlur = 0;
    if (texture) texture.needsUpdate = true;
}

function placeBlimp(at, t) {
    if (!blimp) return;
    blimp.group.visible = true;
    blimp.group.position.set(at.x, at.y, at.z);
    blimp.group.rotation.y = at.heading || 0;
    // A slow blink, well under three a second. Held on for somebody who asked
    // not to be moved about.
    blimp.tail.visible = calmShow || Math.sin(Math.PI * 2 * M.blimp.blinkHz * t) > 0;
}

/**
 * THE STADIUM'S OWN CLOCK, called every frame. After 300 the blimp circles high
 * over the stadium for the rest of the game, except while a show is flying it.
 */
export function tickAwake(elapsed) {
    tickCheer(elapsed);
    if (!blimp || awake < 300 || showingBlimp) return;
    placeBlimp(blimpOrbitPosition(elapsed), elapsed);
    paintScreen(true);
}

// ---- The bulbs (400) -----------------------------------------------------------

let bulbs = null;
let bulbPlan = null;

function buildPoints(count, { size, additive = true, map = null, name }) {
    const positions = new Float32Array(Math.max(1, count) * 3);
    const colours = new Float32Array(Math.max(1, count) * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    const material = new THREE.PointsMaterial({
        size,
        map,
        vertexColors: true,
        transparent: additive,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        depthWrite: !additive,
        sizeAttenuation: true,
        fog: false,
        toneMapped: !additive,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    points.visible = false;
    points.name = name;
    scene.add(points);
    return { points, geometry, positions, colours, count };
}

function buildBulbs(count) {
    if (!scene) return;
    if (bulbs && bulbs.count >= count) return;
    if (bulbs) { scene.remove(bulbs.points); bulbs.geometry.dispose(); bulbs.points.material.dispose(); }
    bulbs = buildPoints(count, { size: M.turf.size, map: glowTexture(), name: 'milestone-bulbs' });
}

// ---- The crowd, and its card stunt (500) -----------------------------------------

let crowd = null;
let stuntMessages = null;
/** The cheer after the last play: `{ cheer, start }` in `tickAwake`'s clock. */
let cheering = null;
const dummy = { current: null };

function scratch() {
    if (!dummy.current) dummy.current = new THREE.Object3D();
    return dummy.current;
}

/**
 * A FAN FOR EVERY SEAT IN BOTH STANDS, and a card in each hand on the far one.
 *
 * EACH FAN IS A WHOLE PERSON from fans.js, drawn as a dozen instanced pieces
 * shared by the entire crowd: four for the body, one per hair style, and a
 * sleeve and a hand per arm pose. Instance `i` of every body and arm piece is
 * the same fan, `crowd.order[i]`; hair is indexed separately, because only the
 * fans wearing a style are in its mesh.
 *
 * REGULARS FIRST IN EVERY INSTANCE BUFFER, so before 500 the meshes simply draw
 * fewer instances (`count`) rather than drawing the empty seats at all.
 */
function buildCrowd() {
    if (crowd || !scene) return crowd;
    const parts = buildFanParts();
    if (!parts) return null;
    const K = CFG.crowd;
    const { seats, cols } = crowdSeats();
    const order = [...seats.filter((s) => s.regular), ...seats.filter((s) => !s.regular)];
    const regulars = seats.filter((s) => s.regular).length;
    const far = seats.filter((s) => s.side > 0);

    const tinted = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0 });
    const painted = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0, vertexColors: true });
    const all = [];
    const instanced = (geometry, material, capacity, name) => {
        const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, capacity));
        mesh.frustumCulled = false;
        mesh.visible = false;
        mesh.name = name;
        scene.add(mesh);
        all.push(mesh);
        return mesh;
    };

    const body = {};
    for (const [piece, geometry] of Object.entries(parts.body)) {
        body[piece] = instanced(geometry, piece === 'fixed' ? painted : tinted, order.length, `crowd-${piece}`);
    }
    const arms = {};
    for (const pose of POSES) {
        arms[pose] = {
            sleeve: instanced(parts.arms[pose].sleeve, tinted, order.length, `crowd-sleeves-${pose}`),
            hand: instanced(parts.arms[pose].hand, tinted, order.length, `crowd-hands-${pose}`),
        };
    }
    const hairSlot = new Array(order.length).fill(-1);
    const hair = {};
    for (const style of HAIR) {
        const wearing = order.map((seat, i) => (seat.hair === style ? i : -1)).filter((i) => i >= 0);
        wearing.forEach((i, k) => { hairSlot[i] = k; });
        hair[style] = {
            mesh: instanced(parts.hair[style], tinted, wearing.length, `crowd-hair-${style}`),
            total: wearing.length,
            regulars: wearing.filter((i) => i < regulars).length,
        };
    }
    /**
     * THE CARDS ARE A SIGN, NOT A SURFACE. Unlit, so the dimmed finale lights
     * leave them bright; out of the tone mapping and the fog, so navy stays navy
     * and orange stays orange at 50m. With both on, orange came out a pale tan
     * and navy a slate grey, and PERFECT was white on tan.
     */
    const cards = instanced(new THREE.PlaneGeometry(K.pitch * 0.9, cardLayout().half * 2 - 0.04),
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, toneMapped: false, fog: false }),
        far.length * 2 * K.fanEvery, 'milestone-cards');

    const colours = (list) => list.map((h) => new THREE.Color(h));
    const shirts = { 0: colours(K.shirts[0]), 1: colours(K.shirts[1]), [NEUTRAL]: colours(K.shirts.neutral) };
    const skins = colours(K.skins);
    const trousers = colours(K.pants);
    const hairColours = colours(K.hairColours);
    order.forEach((seat, i) => {
        const shirt = shirts[seat.team][seat.shirt];
        const skin = skins[seat.skin];
        body.shirt.setColorAt(i, shirt);
        body.skin.setColorAt(i, skin);
        body.pants.setColorAt(i, trousers[seat.pants]);
        for (const pose of POSES) {
            arms[pose].sleeve.setColorAt(i, shirt);
            arms[pose].hand.setColorAt(i, skin);
        }
        if (hairSlot[i] >= 0) hair[seat.hair].mesh.setColorAt(hairSlot[i], hairColours[seat.hairColour]);
    });

    crowd = { order, regulars, far, cols, body, arms, hair, hairSlot, cards, all, materials: [tinted, painted] };
    return crowd;
}

const HIDDEN = { current: null };

/** A matrix that draws nothing: a fan's arms in the poses they are not in. */
function hidden() {
    if (!HIDDEN.current) HIDDEN.current = new THREE.Matrix4().makeScale(0, 0, 0);
    return HIDDEN.current;
}

/**
 * The crowd at time `t` into the finale, or at rest (`t` null).
 *
 * At rest that is the regulars before 500 and every seat after it, each fan
 * lifted and waving by the cheer after the last play if there is one. In the
 * finale the rest of the seats fill in around the regulars, the far stand puts
 * its cards up in front of its faces, everybody bounces once the number has
 * landed, and the near stand throws its arms up.
 */
function poseCrowd(t, { bouncing = false, cardsUp = false, cheer = null, cheerT = 0 } = {}) {
    if (!crowd) return;
    const o = scratch();
    const full = t !== null || awake >= 500;
    const count = full ? crowd.order.length : crowd.regulars;
    const holding = cardsUp && t !== null && t >= M.finale.perfect[0] - 0.2;
    const bounce = bouncing && !calmShow && t !== null;
    for (let i = 0; i < count; i += 1) {
        const seat = crowd.order[i];
        const here = t === null ? 1 : fanArrival(t, seat, crowd.cols, { calm: calmShow });
        let hop;
        let pose;
        if (t !== null) {
            hop = bounce ? CFG.crowd.bounce * CFG.crowd.scale * Math.abs(Math.sin(Math.PI * 2 * (seat.phase + 1.6 * t))) : 0;
            pose = seat.side > 0 && holding ? 'cards' : (bounce ? 'up' : 'down');
        } else {
            hop = cheerHop(cheerT, seat, cheer);
            pose = cheerArms(cheerT, seat, cheer);
        }
        const s = Math.max(0.001, here);
        // The figure faces +z, so the near stand (z < 0) faces the field as
        // built and the far stand turns round. A fan holding a card squares up.
        const facing = (seat.side > 0 ? Math.PI : 0) + (pose === 'cards' ? 0 : seat.turn);
        o.position.set(seat.x, seat.y + hop, seat.z);
        o.rotation.set(0, facing, 0);
        o.scale.set(s, s, s);
        o.updateMatrix();
        for (const mesh of Object.values(crowd.body)) mesh.setMatrixAt(i, o.matrix);
        for (const p of POSES) {
            const m = p === pose ? o.matrix : hidden();
            crowd.arms[p].sleeve.setMatrixAt(i, m);
            crowd.arms[p].hand.setMatrixAt(i, m);
        }
        const slot = crowd.hairSlot[i];
        if (slot >= 0) crowd.hair[seat.hair].mesh.setMatrixAt(slot, o.matrix);
    }
    for (const mesh of crowd.all) {
        if (mesh === crowd.cards) continue;
        mesh.count = count;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.visible = true;
    }
    for (const style of HAIR) {
        const h = crowd.hair[style];
        h.mesh.count = full ? h.total : h.regulars;
    }

    crowd.cards.visible = cardsUp;
    if (!cardsUp || !stuntMessages) return;
    const at = cardLayout();
    const colour = new THREE.Color();
    const K = CFG.crowd;
    const S = standLayout();
    let i = 0;
    for (const seat of crowd.far) {
        // Every column of cards this fan stands in front of, so the letters
        // keep their pixels however wide a fan is.
        for (let column = seat.col; column < Math.min(seat.col + at.columns, crowd.cols); column += 1) {
            for (const upper of [true, false]) {
                const row = cardRow(seat.riser, upper);
                // Mirrored, so the message reads left to right from the field.
                const card = cardAt(t, row, messageColumn(column, crowd.cols), crowd.cols, stuntMessages, { calm: calmShow });
                const spot = cardSpot(seat, upper);
                o.position.set(S.fromX + (column + 0.5) * K.pitch, spot.y, spot.out);
                // A plane faces +z. Turned to face the field (-z), then laid
                // back up the slope of the stand about its own x axis.
                o.rotation.set(-at.tilt, Math.PI, 0, 'YXZ');
                o.scale.set(1, Math.max(0.001, card.turn), 1);
                o.updateMatrix();
                crowd.cards.setMatrixAt(i, o.matrix);
                // THE COLOURS ARE sRGB, AND SAID SO. Unmarked, three reads them
                // as linear and they come out washed: the other half of why
                // neither message could be read.
                colour.setRGB(card.colour[0], card.colour[1], card.colour[2], THREE.SRGBColorSpace);
                crowd.cards.setColorAt(i, colour);
                i += 1;
            }
        }
    }
    crowd.cards.count = i;
    crowd.cards.instanceMatrix.needsUpdate = true;
    if (crowd.cards.instanceColor) crowd.cards.instanceColor.needsUpdate = true;
}

/**
 * THE STANDS ANSWER A PLAY. `cheer` is `stunt.cheerFor`'s, decided once at the
 * whistle, and `elapsed` is the clock `tickAwake` is handed every frame.
 * Somebody who asked not to be moved about gets stands that keep still.
 */
export function cheerCrowd(cheer, elapsed, { calm = false } = {}) {
    const was = cheering;
    cheering = cheer && !calm && !inShow ? { cheer, start: elapsed } : null;
    // A CHEER STOPPED SHORT SITS DOWN. A replay rewinds to the snap and calls
    // this with nothing, and the fans have to be back in their seats for it:
    // `tickCheer` only poses a crowd while somebody is cheering, so merely
    // dropping the cheer would leave them frozen mid-hop through the replay.
    // Same reason `beginShow` seats them. A show owns the crowd while it runs.
    if (was && !cheering && crowd && !inShow) poseCrowd(null);
}

/** The cheer running now, and the clock it started on, or null. For the suite:
 *  the crowd is instanced geometry, which the Three stub cannot measure. */
export function cheerState() {
    return cheering ? { ...cheering.cheer, start: cheering.start } : null;
}

/** Only while somebody is jumping: a crowd at rest is not reposed per frame. */
function tickCheer(elapsed) {
    if (!cheering || !crowd || inShow) return;
    const t = elapsed - cheering.start;
    if (!(t < cheerLength(cheering.cheer))) {
        cheering = null;
        poseCrowd(null);
        return;
    }
    poseCrowd(null, { cheer: cheering.cheer, cheerT: t });
}

// ---- The trophy and the confetti (500) ---------------------------------------------

let trophy = null;
let confetti = null;
let confettiPlan = null;

function buildTrophy() {
    if (trophy || !scene) return trophy;
    const group = new THREE.Group();
    group.name = 'milestone-trophy';
    const gold = new THREE.MeshStandardMaterial({
        color: 0xffc23a, metalness: 0.35, roughness: 0.3, emissive: 0x7a4a00, emissiveIntensity: 0.65,
    });
    // About 4.3m end to end, which is a third of the orbit's frame: the ball the
    // game is played with, made into the thing it was all for. Built the way
    // ball.js builds that ball, long axis on x and laces on top, so the two are
    // one shape at two sizes.
    const ball = new THREE.Group();
    // SMOOTHER THAN THE GAME BALL. That one is a dozen pixels; this one fills
    // a third of the frame, and at the game ball's segment counts its outline
    // showed as flat facets in QA's 500-3.
    const leather = new THREE.Mesh(
        new THREE.LatheGeometry(ballProfile(32).map((p) => new THREE.Vector2(p.r, p.y)), 40), gold);
    leather.rotation.z = Math.PI / 2;
    ball.add(leather);
    // THE LACES, which QA asked for (500-3): the game ball's cross stitches and
    // the seam they cross, in a pale gold that reads against the ball and still
    // looks like part of one trophy. A little emissive, because the finale dims
    // the lights while the ball is up.
    const laceGold = new THREE.MeshStandardMaterial({
        color: 0xfff1cc, metalness: 0.15, roughness: 0.45, emissive: 0x6e5a32, emissiveIntensity: 0.55,
    });
    ball.add(buildLaces(laceGold, { seam: true }));
    ball.scale.set(9, 9, 9);
    group.add(ball);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture(), color: 0xffd46a, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    halo.scale.set(16, 16, 1);
    group.add(halo);
    group.visible = false;
    scene.add(group);
    trophy = { group, halo };
    return trophy;
}

function buildConfetti(count) {
    if (!scene) return;
    if (confetti && confetti.count >= count) return;
    if (confetti) { scene.remove(confetti.points); confetti.geometry.dispose(); confetti.points.material.dispose(); }
    // Plain squares with ordinary blending: paper, not light.
    confetti = buildPoints(count, { size: M.finale.confetti.size, additive: false, name: 'milestone-confetti' });
}

/** Apply one frame of `milestones.showFrame`, `t` seconds in. */
export function applyShow(frame, t) {
    if (!frame) return;
    setLights(frame.light);
    setFog(frame.fog);

    const banks = getPylonBanks();
    if (frame.banks) {
        frame.banks.forEach((v, i) => {
            if (banks[i] && banks[i].material) banks[i].material.emissiveIntensity = BANK_GLOW * v;
            if (halos && halos[i]) {
                halos[i].visible = v > 0.01;
                halos[i].material.opacity = Math.min(1, v * 0.32);
            }
        });
    }
    if (cones) {
        cones.forEach((cone, i) => {
            const v = frame.cones ? frame.cones[i] || 0 : 0;
            cone.visible = v > 0.001;
            cone.material.opacity = v;
        });
    }
    if (sparks) {
        sparks.points.visible = !!(frame.sparks && plan);
        if (sparks.points.visible) {
            sparksAt(t, plan, sparks.positions, sparks.colours, { calm: calmShow });
            sparks.geometry.setDrawRange(0, Math.min(plan.count, M.fireworks.pool));
            sparks.geometry.attributes.position.needsUpdate = true;
            sparks.geometry.attributes.color.needsUpdate = true;
        }
    }

    showingBlimp = !!frame.blimp;
    if (frame.blimp && blimp) {
        placeBlimp(frame.blimp, t);
        paintScreen(!!frame.blimp.lit);
    }

    if (bulbs) {
        bulbs.points.visible = !!(frame.bulbs && bulbPlan);
        if (bulbs.points.visible) {
            bulbsAt(t, bulbPlan, bulbs.positions, bulbs.colours,
                { light: M.turf.light, out: M.turf.out, calm: calmShow });
            bulbs.geometry.setDrawRange(0, bulbPlan.count);
            bulbs.geometry.attributes.position.needsUpdate = true;
            bulbs.geometry.attributes.color.needsUpdate = true;
        }
    }

    if (frame.crowd) poseCrowd(t, { bouncing: frame.reveal, cardsUp: true });

    if (confetti) {
        confetti.points.visible = !!(frame.confetti && confettiPlan);
        if (confetti.points.visible) {
            confettiAt(t, confettiPlan, confetti.positions, confetti.colours);
            confetti.geometry.setDrawRange(0, confettiPlan.count);
            confetti.geometry.attributes.position.needsUpdate = true;
            confetti.geometry.attributes.color.needsUpdate = true;
        }
    }

    if (trophy) {
        trophy.group.visible = !!frame.trophy;
        if (frame.trophy) {
            const at = trophySpot();
            const r = frame.trophy.rise;
            trophy.group.position.set(at.x, at.y - (1 - r) * 5, at.z);
            trophy.group.scale.set(Math.max(0.001, r), Math.max(0.001, r), Math.max(0.001, r));
            trophy.group.rotation.y = frame.trophy.spin;
            trophy.halo.material.opacity = 0.5 * r;
        }
    }
}

function setLights(fraction = 1) {
    if (!lights || !base) return;
    for (const [name, light] of Object.entries(lights)) {
        if (light && base[name] !== undefined) light.intensity = base[name] * fraction;
    }
}

/**
 * THE STADIUM AS IT STANDS BETWEEN SHOWS, woken up to `level`.
 *
 * Called when a show ends or is skipped, and when a game starts or is resumed,
 * so it is the only place the resting state is decided. Zero is the stadium as
 * it was before any of this existed, exactly.
 */
export function setAwake(level = 0) {
    awake = level;
    const on = level >= 100;
    if (on) buildHalos();
    getPylonBanks().forEach((bank, i) => {
        if (bank && bank.material) {
            bank.material.emissiveIntensity = BANK_GLOW * (on ? M.lights.awakeBanks : 1);
        }
        if (halos && halos[i]) {
            halos[i].visible = on;
            halos[i].material.opacity = on ? M.lights.awakeBanks * 0.32 : 0;
        }
    });

    // After 300 the blimp stays up (its position is `tickAwake`'s), and after
    // 500 every seat stays full. Below either, the blimp goes away and the
    // stands go back to the regulars, which is what a new game asks for.
    if (level >= 300) buildBlimp();
    if (blimp && level < 300) blimp.group.visible = false;
    // NOT DURING A SHOW. The number lands mid-show and wakes the stadium on
    // that frame, and posing the crowd at rest here would drop the card stunt
    // for one frame before the show put it back. `endShow` calls this again.
    if (inShow) return;
    buildCrowd();
    cheering = null;
    poseCrowd(null, { cardsUp: false });
}

export function awakeLevel() {
    return awake;
}

/** The show is over, however it ended. Everything it borrowed goes back. */
export function endShow() {
    setLights(1);
    setFog(1);
    if (cones) cones.forEach((c) => { c.visible = false; c.material.opacity = 0; });
    if (sparks) sparks.points.visible = false;
    if (bulbs) bulbs.points.visible = false;
    if (confetti) confetti.points.visible = false;
    if (trophy) trophy.group.visible = false;
    if (crowd) crowd.cards.visible = false;
    showingBlimp = false;
    inShow = false;
    plan = null;
    setAwake(awake);
}

export function disposeSpectacle() {
    const drop = (obj) => {
        if (!obj) return;
        if (scene) scene.remove(obj);
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
    };
    (cones || []).forEach(drop);
    (halos || []).forEach(drop);
    if (sparks) drop(sparks.points);
    if (bulbs) drop(bulbs.points);
    if (confetti) drop(confetti.points);
    if (crowd) {
        crowd.all.forEach((mesh) => { if (scene) scene.remove(mesh); mesh.geometry.dispose(); });
        crowd.materials.forEach((m) => m.dispose());
        crowd.cards.material.dispose();
    }
    if (blimp && scene) scene.remove(blimp.group);
    if (trophy && scene) scene.remove(trophy.group);
    if (glow) glow.dispose();
    cones = null;
    halos = null;
    sparks = null;
    bulbs = null;
    confetti = null;
    crowd = null;
    cheering = null;
    blimp = null;
    trophy = null;
    glow = null;
    plan = null;
    scene = null;
}
