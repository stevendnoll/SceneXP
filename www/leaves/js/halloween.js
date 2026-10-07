// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * halloween.js - Halloween in the yard (M6): when it is, and Halloween
 * week itself, from October 24 to 31 by the visitor's own calendar. (The
 * decorations that are up all October are decorations.js.)
 *
 * Halloween week's two extras, kind spooky and never scary: the porch
 * pumpkins are carved into jack-o-lanterns lit from inside, and a plastic
 * skeleton hand is hidden under the leaves (one of the finds, finds.js).
 *
 * The trick-or-treaters are here too, though they walk WHENEVER THE
 * DECORATIONS ARE UP, not only that week (Steve's M6 QA: "I didn't see the
 * trick-or-treaters in this last run"): every so often a pair of them, a
 * little ghost and a little witch with their pumpkin pails, walks the
 * sidewalk and stops at the end of our walk to look at the house before
 * going on. They wait politely for anybody standing in
 * their way. Blown at with the leaf blower (Steve's M6 QA), they stagger
 * along with the air, backs to it, the ghost's sheet billowing and the
 * witch holding onto her hat, then hurry off the way it sent them.
 *
 * The scene has no dusk (its light is a fixed autumn afternoon), so the
 * jack-o-lanterns glow all day: their faces are drawn unlit, which reads as
 * a candle inside in daylight too.
 *
 * The date and the walk are pure and tested under Node. carvePumpkins() and
 * createTreaterFigures() are the drawing.
 */
import { createPerson } from '../../shared/js/people-1.0.0.min.js';

const between = (pair, r) => pair[0] + (pair[1] - pair[0]) * r;

// ---- When, and the walk (pure) ---------------------------------------------------

/** Whether `date` falls in Halloween week by its own (local) calendar. */
export function isHalloweenWeek(date, H) {
    if (!date || typeof date.getMonth !== 'function') return false;
    const day = date.getDate();
    return date.getMonth() === H.month && day >= H.firstDay && day <= H.lastDay;
}

/** Whether the decorations are up: all of October, and still on November
 *  1st, the morning after (Steve's M6 QA: "displayed until November 1st"). */
export function isDecorated(date, H) {
    if (!date || typeof date.getMonth !== 'function') return false;
    const m = date.getMonth();
    const U = H.decorUntil;
    return m === H.month || (m === U.month && date.getDate() <= U.day);
}

/**
 * The season for this visit: { decor, week }. The decorations are up from
 * October 1st through November 1st and Halloween week's extras come on the
 * 24th, by the date, or on
 * a QA host by the address: `?halloween=1` for everything, `0` for none.
 */
export function seasonFor(search, date, H, qa) {
    if (qa) {
        const ask = new URLSearchParams(search || '').get('halloween');
        if (ask === '1') return { decor: true, week: true };
        if (ask === '0') return { decor: false, week: false };
    }
    const week = isHalloweenWeek(date, H);
    return { decor: week || isDecorated(date, H), week };
}

/** The trick-or-treaters, out of sight, the first pair a little way off. */
export function createTreaters(H, random) {
    return {
        state: 'wait', t: 0, timer: between(H.first, random()), dir: 1, x: H.fromX, z: H.z, heading: Math.PI / 2, speed: 0, stride: 0, paused: false, walks: 0,
        // Which of the two is out in front (0 the ghost, 1 the witch).
        lead: 0,
        // Blown: how hard (0 to 1, eased), which way (eased), how far off the
        // sidewalk's middle it has pushed them, whether they are hurrying
        // off, and whether this walk has been blown yet (for the event).
        blown: 0, gust: { x: 0, z: 0 }, dz: 0, hurrying: false, blownThisWalk: false
    };
}

const wrap = (a) => a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2));

/** Turn toward `want` at no more than `rate` radians a second. */
function turnTo(tr, want, rate, step) {
    const d = wrap(want - tr.heading);
    const max = rate * step;
    tr.heading = wrap(tr.heading + (d < -max ? -max : d > max ? max : d));
}

/** The blowers' air at the pair, at a child's middle: the way it blows,
 *  averaged over both of them by how hard it blows on each (so it does not
 *  flick between them), and the hardest it blows on either. { x, z, speed }
 *  or null. */
function windAt(tr, input, H) {
    if (!input.wind) return null;
    let x = 0;
    let z = 0;
    let speed = 0;
    for (const p of treaterSpots(tr)) {
        const w = input.wind(p.x, H.blowHeight, p.z);
        if (!w || !(w.speed > 0)) continue;
        const len = Math.hypot(w.x, w.z) || 1;
        x += (w.x / len) * w.speed;
        z += (w.z / len) * w.speed;
        speed = Math.max(speed, w.speed);
    }
    return speed > 0 ? { x, z, speed } : null;
}

/** Walking the other way: the one behind becomes the one in front, so
 *  neither of them moves (a turn about the leader put the other 1.7 m away
 *  in one frame, Steve's M6 QA: "glitchy"). */
function turnAround(tr, dir) {
    if (dir === tr.dir) return;
    tr.x -= tr.dir * 0.85;
    tr.dir = dir;
    tr.lead = 1 - tr.lead;
}

/**
 * Advance them by `dt`. `input`:
 *   active   the yard is in view
 *   person   { x, z }: they wait rather than walk through them
 *   walkX    where they stop to look at the house
 *   random   () => 0..1
 *   wind     (x, y, z) => { x, z, speed }: the blowers' air there (optional)
 * Returns 'start', 'pause', 'blown' (the first time a walk is), 'gone' or
 * null.
 *
 * EVERYTHING EASES (Steve's M6 QA: the blown animation was "glitchy"). They
 * turn at `turnRate`, the wind's direction and how hard they are blown ease
 * in and out, and once blown they stay blown until the air drops well below
 * what started it (`keepAir` of it), so the edge of the blower's reach does
 * not flick them in and out of it.
 */
export function stepTreaters(tr, dt, input, H) {
    const step = dt > 0 && input.active ? dt : 0;
    tr.t += step;
    const ease = (from, to, rate) => from + (to - from) * Math.min(1, rate * step);
    // BLOWN AT, walking or paused: they stagger with the air, backs to it.
    let event = null;
    if (tr.state !== 'wait' && step > 0) {
        const w = windAt(tr, input, H);
        const enough = tr.state === 'blown' ? H.blownAir * H.keepAir : H.blownAir;
        if (w && w.speed >= enough) {
            const len = Math.hypot(w.x, w.z) || 1;
            const gx = tr.state === 'blown' ? ease(tr.gust.x, w.x / len, 4) : w.x / len;
            const gz = tr.state === 'blown' ? ease(tr.gust.z, w.z / len, 4) : w.z / len;
            const g = Math.hypot(gx, gz) || 1;
            tr.gust = { x: gx / g, z: gz / g };
            tr.blownTarget = Math.min(1, w.speed / H.blownFull);
            tr.state = 'blown';
            tr.t = 0;
            if (!tr.blownThisWalk) event = 'blown';
            tr.blownThisWalk = true;
        }
    }
    if (tr.state === 'blown') {
        tr.blown = ease(tr.blown, tr.t < H.blownTime * 0.5 ? tr.blownTarget || 0 : 0, tr.t < H.blownTime * 0.5 ? 6 : 2);
        const push = H.push * tr.blown;
        tr.x += tr.gust.x * push * step;
        tr.dz = Math.min(H.drift.max, Math.max(H.drift.min, tr.dz + tr.gust.z * push * step));
        tr.speed = push;
        tr.stride += push * step;
        turnTo(tr, Math.atan2(tr.gust.x, tr.gust.z), H.turnRate, step);
        if (tr.t >= H.blownTime) {
            // Off they go, the way it sent them, and no stopping at our walk.
            if (Math.abs(tr.gust.x) > 0.2) turnAround(tr, tr.gust.x > 0 ? 1 : -1);
            tr.state = 'walk';
            tr.hurrying = true;
            tr.paused = true;
        }
        return event;
    }
    tr.blown = ease(tr.blown, 0, 2);
    if (tr.state === 'wait') {
        tr.timer -= step;
        tr.speed = 0;
        if (tr.timer > 0 || !input.active) return null;
        tr.dir = input.random() < 0.5 ? 1 : -1;
        tr.x = tr.dir > 0 ? H.fromX : H.toX;
        tr.heading = tr.dir * Math.PI / 2;
        tr.paused = false;
        tr.state = 'walk';
        tr.walks += 1;
        Object.assign(tr, { blown: 0, dz: 0, hurrying: false, blownThisWalk: false, lead: 0 });
        return 'start';
    }
    if (tr.state === 'pause') {
        tr.speed = 0;
        turnTo(tr, Math.PI, H.turnRate, step);
        if (tr.t >= H.pause) tr.state = 'walk';
        return null;
    }
    turnTo(tr, tr.dir * Math.PI / 2, H.turnRate, step);
    // Walking. Somebody in the way, and they wait.
    const p = input.person;
    const ahead = p ? (p.x - tr.x) * tr.dir : Infinity;
    if (p && ahead > 0 && ahead < H.room + 0.4 && Math.abs(p.z - tr.z) < 0.6) {
        tr.speed = 0;
        return null;
    }
    const before = tr.x;
    const pace = H.speed * (tr.hurrying ? H.hurry : 1);
    tr.x += tr.dir * pace * step;
    tr.speed = step > 0 ? pace : 0;
    tr.stride += pace * step;
    // Back toward the middle of the sidewalk as they go.
    tr.dz *= Math.max(0, 1 - step * 0.8);
    if (!tr.paused && (before - input.walkX) * (tr.x - input.walkX) <= 0 && step > 0) {
        tr.paused = true;
        tr.x = input.walkX;
        tr.state = 'pause';
        tr.t = 0;
        return 'pause';
    }
    if ((tr.dir > 0 && tr.x >= H.toX) || (tr.dir < 0 && tr.x <= H.fromX)) {
        tr.state = 'wait';
        tr.timer = between(H.every, input.random());
        tr.speed = 0;
        tr.hurrying = false;
        return 'gone';
    }
    return null;
}

/** Where each of the pair stands, the ghost first and the witch second:
 *  whichever leads (`lead`) is at `x`, the other a step behind, each always
 *  on its own side of the sidewalk. */
export function treaterSpots(tr) {
    const z = tr.z + (tr.dz || 0);
    const lead = tr.lead || 0;
    const behind = tr.x - tr.dir * 0.85;
    return [
        { x: lead === 0 ? tr.x : behind, z: z - 0.15 },
        { x: lead === 1 ? tr.x : behind, z: z + 0.3 }
    ];
}

// ---- Drawing -----------------------------------------------------------------

const lambert = (color) => new THREE.MeshLambertMaterial({ color });

function mesh(geometry, material, x, y, z, shadow = true) {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    return m;
}

/** A jack-o-lantern's face, drawn in `color` on a clear canvas (eyes, a
 *  nose, a grin with two teeth), or null where there is no document (under
 *  test). Carved and lit on the porch, printed on the neighbor's inflatable
 *  (decorations.js). */
export function faceTexture(color) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 96;
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return null;
    ctx.clearRect(0, 0, 128, 96);
    ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    const tri = (a, b, c) => {
        ctx.beginPath();
        ctx.moveTo(...a);
        ctx.lineTo(...b);
        ctx.lineTo(...c);
        ctx.closePath();
        ctx.fill();
    };
    tri([26, 38], [50, 38], [38, 18]);
    tri([78, 38], [102, 38], [90, 18]);
    tri([58, 52], [70, 52], [64, 42]);
    ctx.beginPath();
    ctx.moveTo(22, 60);
    ctx.quadraticCurveTo(64, 96, 106, 60);
    ctx.lineTo(92, 64);
    ctx.lineTo(88, 72);
    ctx.lineTo(80, 69);
    ctx.quadraticCurveTo(64, 80, 48, 69);
    ctx.lineTo(40, 72);
    ctx.lineTo(36, 64);
    ctx.closePath();
    ctx.fill();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

/**
 * Faces on the porch pumpkins named in `H.carved` (by index into
 * yard.pumpkins), toward the street, glowing. Returns a group to add to the
 * scene.
 *
 * Each face is a finely divided patch wrapped onto the front of its
 * pumpkin (house.js draws a sphere squashed to 0.72 as tall as wide), a few
 * millimeters proud of the skin, with the face cut out of it by the
 * texture's alpha. A flat face would stand centimeters off the curve at
 * its corners, and a carved outline sinks into it between its vertices.
 * `map` is the face (a test can hand in its own, having no canvas).
 */
export function carvePumpkins(pumpkins, H, map = faceTexture(H.glow)) {
    const group = new THREE.Group();
    group.name = 'jack-o-lanterns';
    if (!map) return group;
    const glow = new THREE.MeshBasicMaterial({ map, alphaTest: 0.5 });
    for (const k of H.carved) {
        const p = pumpkins[k];
        if (!p) continue;
        const face = faceOnPumpkin(p.r, 0.72, glow);
        face.position.set(p.x, p.y + p.r * 0.72, p.z);
        group.add(face);
    }
    return group;
}

/**
 * A face patch for the front (+z) of a sphere of radius `r` squashed to
 * `squash` as tall as wide, centered on its middle: finely divided and laid
 * onto the skin, a few millimeters proud of it.
 */
export function faceOnPumpkin(r, squash, material, proud = 0.003) {
    const geometry = new THREE.PlaneGeometry(1.4 * r, 1.05 * r * squash, 14, 10);
    const at = geometry.attributes && geometry.attributes.position;
    if (at && typeof at.count === 'number') {
        for (let v = 0; v < at.count; v++) {
            const x = at.getX(v);
            const y = at.getY(v);
            const inside = 1 - (x * x) / (r * r) - (y * y) / (squash * squash * r * r);
            at.setXYZ(v, x, y, r * Math.sqrt(Math.max(0, inside)) + proud);
        }
        at.needsUpdate = true;
    }
    return new THREE.Mesh(geometry, material);
}

/** A pumpkin pail with a handle, its bottom at the origin. */
function pail() {
    const group = new THREE.Group();
    group.add(mesh(new THREE.CylinderGeometry(0.1, 0.085, 0.13, 12), lambert(0xe2731f), 0, 0.065, 0));
    const handle = mesh(new THREE.TorusGeometry(0.085, 0.007, 4, 14, Math.PI), lambert(0x1c1d1f), 0, 0.13, 0, false);
    group.add(handle);
    return group;
}

/** A little ghost: a sheet with eye holes, sneakers peeking out. */
function ghost() {
    const group = new THREE.Group();
    group.name = 'ghost';
    const profile = [[0.001, 1.12], [0.1, 1.1], [0.16, 1.03], [0.185, 0.9], [0.2, 0.7], [0.23, 0.45], [0.28, 0.18], [0.31, 0.06], [0.3, 0.04]]
        .map(([r, y]) => new THREE.Vector2(r, y));
    const sheet = mesh(new THREE.LatheGeometry(profile, 18), new THREE.MeshLambertMaterial({ color: 0xf4f3ee, side: THREE.DoubleSide }), 0, 0, 0);
    group.add(sheet);
    group.userData.sheet = sheet;
    const dark = lambert(0x16161a);
    for (const s of [-1, 1]) {
        const eye = mesh(new THREE.SphereGeometry(0.028, 8, 6), dark, s * 0.06, 0.93, 0.172, false);
        eye.scale.set(0.8, 1.2, 0.4);
        group.add(eye);
        group.add(mesh(new THREE.BoxGeometry(0.08, 0.05, 0.14), lambert(0x7a2fbf), s * 0.08, 0.025, 0.14));
    }
    const bucket = pail();
    bucket.position.set(0.3, 0.42, 0.06);
    group.add(bucket);
    return { group, legs: [], bob: true };
}

/** A little witch: the person rig at a child's size, a purple dress, a
 *  pointed hat. */
function witch(scale) {
    const group = new THREE.Group();
    group.name = 'witch';
    const person = createPerson({
        role: 'trick-or-treater', shirtColor: 0x5b2c83, pantsColor: 0x1d1d1f, hasSkirt: true,
        skinTone: 0xc68a5e, hairColor: 0xb4532a, hairStyle: 'long', shoulderRound: 0.4, sleeveColor: 0x5b2c83
    });
    person.scale.setScalar(scale);
    group.add(person);
    const black = lambert(0x1c1d1f);
    const brim = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.015, 18), black, 0, 1.76, 0);
    const cone = mesh(new THREE.ConeGeometry(0.12, 0.34, 14), black, 0, 1.93, -0.02);
    cone.rotation.x = -0.18;
    const hat = new THREE.Group();
    hat.name = 'witch-hat';
    hat.add(brim, cone);
    hat.scale.setScalar(scale);
    group.add(hat);
    const bucket = pail();
    bucket.position.set(-0.17, 0.3, 0.05);
    group.add(bucket);
    const legs = [];
    const arms = [];
    person.traverse((o) => {
        if (o.userData && o.userData.isLeg) legs.push(o);
        if (o.userData && o.userData.isArm) arms.push(o);
    });
    return { group, legs, base: legs.map((l) => l.rotation.x), arms, armRest: arms.map((a) => a.rotation.clone()), bob: false };
}

/**
 * The pair of trick-or-treaters. Returns { group, update(tr, time) }.
 */
export function createTreaterFigures(H) {
    const group = new THREE.Group();
    group.name = 'trick-or-treaters';
    const kids = [ghost(), witch(H.scale)];
    kids.forEach((k) => {
        // Turned first, then leaned, so a lean is always forward or back.
        k.group.rotation.order = 'YXZ';
        group.add(k.group);
    });
    group.visible = false;

    function update(tr, time) {
        group.visible = tr.state !== 'wait';
        if (!group.visible) return;
        const spots = treaterSpots(tr);
        kids.forEach((kid, k) => {
            kid.group.position.set(spots[k].x, 0, spots[k].z);
            kid.group.rotation.y = tr.heading;
            const swing = tr.speed > 0 ? 0.45 * Math.sin(tr.stride * 5 + k) : 0;
            kid.legs.forEach((l, i) => { l.rotation.x = kid.base[i] + (l.userData.legSide === 1 ? swing : -swing); });
            if (kid.bob) kid.group.position.y = tr.speed > 0 ? 0.015 * Math.abs(Math.sin(tr.stride * 5)) : 0.005 * Math.sin(time * 2);
            // Blown at: leaning with the air (their backs are to it), the
            // ghost's sheet billowing, the witch holding onto her hat.
            const b = tr.blown || 0;
            // Leaning with the air.
            kid.group.rotation.x = 0.22 * b;
            const sheet = kid.group.userData.sheet;
            if (sheet) {
                const flap = 1 + 0.12 * b * (0.7 + 0.3 * Math.sin(time * 9 + k));
                sheet.scale.set(flap, 1 - 0.05 * b, flap);
            }
            if (kid.arms) {
                kid.arms.forEach((a, i) => {
                    const rest = kid.armRest[i];
                    const s = a.userData.armSide || 1;
                    // Holding her hat in the wind.
                    a.rotation.set(rest.x + (-2.7 - rest.x) * b, rest.y, rest.z + (-s * 0.3 - rest.z) * b);
                });
            }
        });
    }
    return { group, update };
}
