// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * decorations.js - Halloween decorations, up all October (M6, Steve's QA:
 * "What if we remove the cat and squirrel and add some Halloween
 * decorations?").
 *
 * OURS ARE TASTEFUL, in the house's own black, white and stone: a flight of
 * black paper bats up the white siding beside the porch, warm orange string
 * lights along the porch roof, a cobweb in each of the porch's corners with
 * a spider on a thread, three crows on the ridge, and in two windows a lamp
 * lit behind a silhouette, a cat in one and a witch across the moon in the
 * other.
 *
 * THE NEIGHBOR GOES ALL OUT, on purpose, the way his butter yellow house is
 * traditional to our modern one: orange and purple lights along his eaves,
 * a little ghost hanging by his windows, a giant spider on his roof, a big
 * inflatable jack-o-lantern, and a foam graveyard past his lawn with a
 * skeleton lounging on a hay bale, waving. Those last are the reward for the
 * view widening when he comes out.
 *
 * DOWN THE BLOCK the street joins in (Steve's M6 QA: "could we please add
 * more decorations?"): a witch who flew into the maple over the hedge (her
 * striped legs and boots are all that show), and pumpkins, lights and a web
 * at the two houses down the street.
 *
 * NOTHING HERE IS ON OUR LAWN. The leaves would blow through it (the sim
 * knows only the boxes in config.yard), and the dive runs straight at the
 * pile from wherever the person stands. So everything hangs on a house,
 * sits on a roof, or stands past the edge of the sim's ground.
 *
 * Halloween week's extras (the carved, lit faces on the porch pumpkins and
 * the trick-or-treaters) are halloween.js's. Everything here is drawing:
 * buildDecorations() places it all from config, and update() gives the
 * things that hang or perch a little life.
 */
import { faceTexture, faceOnPumpkin } from './halloween.min.js';
import { makeRandom } from './sim.min.js';
import { pumpkin, streetHouseParts, OUR_WINDOWS, facadeZ } from './house.min.js';

const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

function mesh(geometry, material, x, y, z, shadow = false) {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = shadow;
    return m;
}

/** A bat cut out of black paper, a wingspan of 1, facing +z: ears, a body,
 *  and wings with scalloped trailing edges. */
function batShape() {
    const right = [[0.035, 0.17], [0.06, 0.1], [0.2, 0.15], [0.36, 0.19], [0.5, 0.2],
        [0.4, 0.06], [0.33, 0.1], [0.26, -0.01], [0.17, 0.03], [0.1, -0.08], [0.03, -0.15]];
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.12);
    right.forEach(([x, y]) => shape.lineTo(x, y));
    shape.lineTo(0, -0.18);
    [...right].reverse().forEach(([x, y]) => shape.lineTo(-x, y));
    shape.closePath();
    return shape;
}

/**
 * Where each bat flies up our wall: from low beside the porch, rising and
 * curving over the first window toward the eave, larger as they go, each
 * tipped its own way. Pure. Returns [{ x, y, size, tilt }] in the wall's
 * plane.
 */
export function batFlight(D, house, porchMaxX, seed = 31) {
    const random = makeRandom(seed);
    const out = [];
    const n = D.bats;
    for (let k = 0; k < n; k++) {
        const t = k / (n - 1);
        out.push({
            x: porchMaxX + 0.5 + 2.9 * t * t + (random() - 0.5) * 0.22,
            y: 1.0 + 1.95 * Math.sin((t * Math.PI) / 2) + (random() - 0.5) * 0.14,
            size: 0.15 + 0.17 * t + random() * 0.04,
            tilt: 0.35 + (random() - 0.5) * 0.9
        });
    }
    return out.filter((b) => b.y + b.size * 0.2 < house.wall - 0.15);
}

/** Bulbs on a wire hung in scallops through `anchors` (points at the wire's
 *  height), sagging `sag` between each pair, a bulb every `every` meters.
 *  Pure. Returns { bulbs: [{ x, y, z }], wire: [[x, y, z], ...] }. */
export function stringLights(anchors, sag, every) {
    const bulbs = [];
    const wire = [];
    for (let k = 0; k < anchors.length - 1; k++) {
        const a = anchors[k];
        const b = anchors[k + 1];
        const span = Math.hypot(b.x - a.x, b.z - a.z);
        const steps = Math.max(2, Math.round(span / 0.1));
        for (let i = 0; i <= steps; i++) {
            const u = i / steps;
            wire.push([a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u - sag * 4 * u * (1 - u), a.z + (b.z - a.z) * u]);
        }
        const count = Math.max(1, Math.round(span / every));
        for (let i = 0; i < count; i++) {
            const u = (i + 0.5) / count;
            bulbs.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u - sag * 4 * u * (1 - u) - 0.04, z: a.z + (b.z - a.z) * u });
        }
    }
    return { bulbs, wire };
}

/** One instanced mesh of glowing bulbs at `bulbs`, every other one in the
 *  second color if there is one. */
function bulbMeshes(bulbs, colors, radius = 0.035) {
    const geometry = new THREE.SphereGeometry(radius, 8, 6);
    return colors.map((color, c) => {
        const mine = bulbs.filter((_, k) => k % colors.length === c);
        const m = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial({ color }), mine.length);
        const at = new THREE.Matrix4();
        mine.forEach((b, k) => {
            at.makeTranslation(b.x, b.y, b.z);
            m.setMatrixAt(k, at);
        });
        return m;
    });
}

function wireLine(points, color) {
    const geometry = new THREE.BufferGeometry().setFromPoints(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
    return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color }));
}

/** A quarter cobweb in a corner at (x, y, z), spokes fanning from along
 *  the roof (toward `side`, +1 for +x) to down the post (-y), and threads
 *  across them. */
function cobweb(x, y, z, size, color, side = 1) {
    const spokes = 6;
    const rings = [0.18, 0.34, 0.52, 0.7, 0.88];
    const at = (r, k) => {
        const a = (k / (spokes - 1)) * (Math.PI / 2);
        return [x + side * Math.cos(a) * r * size, y - Math.sin(a) * r * size, z];
    };
    const points = [];
    for (let k = 0; k < spokes; k++) points.push([x, y, z], at(1, k));
    rings.forEach((r) => {
        for (let k = 0; k < spokes - 1; k++) {
            // Each thread sags a little toward the corner.
            const mid = at(r * 0.93, k + 0.5);
            points.push(at(r, k), mid, mid, at(r, k + 1));
        }
    });
    const geometry = new THREE.BufferGeometry().setFromPoints(points.map(([px, py, pz]) => new THREE.Vector3(px, py, pz)));
    return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color }));
}

/** A spider: a body, a head and eight legs, hung on a thread from (x, top,
 *  z) down to `y`. Returns { group, body }. */
function spider(x, top, y, z, black, thread) {
    const group = new THREE.Group();
    group.add(wireLine([[x, top, z], [x, y + 0.05, z]], thread));
    const body = new THREE.Group();
    body.position.set(x, y, z);
    body.add(mesh(new THREE.SphereGeometry(0.05, 10, 8), black, 0, 0, 0));
    body.add(mesh(new THREE.SphereGeometry(0.03, 8, 6), black, 0, 0.055, 0.01));
    for (const s of [-1, 1]) {
        for (let k = 0; k < 4; k++) {
            const leg = mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.12, 4), black, s * 0.06, 0.03 - k * 0.02, 0);
            leg.rotation.z = s * (1.1 - k * 0.25);
            body.add(leg);
        }
    }
    group.add(body);
    return { group, body };
}

/** A crow on the ridge, facing +z: body, head (which turns), beak, tail. */
function crow(black, beak) {
    const group = new THREE.Group();
    const body = mesh(new THREE.SphereGeometry(1, 10, 8), black, 0, 0.13, 0, true);
    body.scale.set(0.085, 0.09, 0.17);
    group.add(body);
    const tail = mesh(new THREE.BoxGeometry(0.09, 0.02, 0.18), black, 0, 0.11, -0.2, true);
    tail.rotation.x = 0.35;
    group.add(tail);
    const head = new THREE.Group();
    head.position.set(0, 0.24, 0.13);
    head.add(mesh(new THREE.SphereGeometry(0.06, 10, 8), black, 0, 0, 0, true));
    const bill = mesh(new THREE.ConeGeometry(0.02, 0.08, 6), beak, 0, -0.005, 0.085);
    bill.rotation.x = Math.PI / 2;
    head.add(bill);
    group.add(head);
    for (const s of [-1, 1]) group.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.06, 4), beak, s * 0.03, 0.03, 0.02));
    return { group, head };
}

/** A little ghost, a sheet about `tall` meters, hung from a string. */
function hangingGhost(tall, ink, sheetColor, thread, stringLength) {
    const group = new THREE.Group();
    const profile = [[0.001, 1], [0.13, 0.97], [0.2, 0.86], [0.22, 0.65], [0.27, 0.35], [0.33, 0.08], [0.36, 0]]
        .map(([r, y]) => new THREE.Vector2(r * tall, y * tall));
    group.add(mesh(new THREE.LatheGeometry(profile, 16), lambert(sheetColor, { side: THREE.DoubleSide }), 0, -tall - stringLength, 0));
    for (const s of [-1, 1]) {
        const eye = mesh(new THREE.SphereGeometry(0.025 * tall * 1.6, 8, 6), ink, s * 0.07 * tall, -0.2 * tall - stringLength, 0.2 * tall);
        eye.scale.set(0.8, 1.2, 0.4);
        group.add(eye);
    }
    group.add(wireLine([[0, 0, 0], [0, -stringLength, 0]], thread));
    return group;
}

/** A foam tombstone: 'round' (a rounded top), 'square', or a 'cross', its
 *  front toward +z, `rip` a texture for the front or null. */
function tombstone(kind, foam, rip) {
    const group = new THREE.Group();
    if (kind === 'cross') {
        group.add(mesh(new THREE.BoxGeometry(0.12, 0.85, 0.1), foam, 0, 0.42, 0, true));
        group.add(mesh(new THREE.BoxGeometry(0.46, 0.12, 0.1), foam, 0, 0.6, 0, true));
        return group;
    }
    const w = kind === 'round' ? 0.55 : 0.5;
    const h = kind === 'round' ? 0.5 : 0.68;
    group.add(mesh(new THREE.BoxGeometry(w, h, 0.1), foam, 0, h / 2, 0, true));
    if (kind === 'round') {
        const top = mesh(new THREE.CylinderGeometry(w / 2, w / 2, 0.1, 20, 1, false, 0, Math.PI), foam, 0, h, 0, true);
        top.rotation.set(Math.PI / 2, Math.PI / 2, 0);
        group.add(top);
    }
    if (rip) {
        const label = mesh(new THREE.PlaneGeometry(w * 0.7, w * 0.35), new THREE.MeshLambertMaterial({ map: rip, alphaTest: 0.5 }), 0, h * 0.62, 0.052);
        group.add(label);
    }
    return group;
}

/** "R.I.P." carved into the foam, or null where there is no document. */
function ripTexture(ink) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return null;
    ctx.clearRect(0, 0, 128, 64);
    ctx.fillStyle = `#${ink.toString(16).padStart(6, '0')}`;
    ctx.font = 'bold 34px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('R.I.P.', 64, 34);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

/** A round bone (or a leg, a strut) from point a to point b, as a
 *  cylinder of radius r. */
function bone(a, b, r, material, shadow = false) {
    const from = new THREE.Vector3(...a);
    const span = new THREE.Vector3(...b).sub(from);
    const m = mesh(new THREE.CylinderGeometry(r, r, span.length(), 6), material, 0, 0, 0, shadow);
    m.position.copy(from).addScaledVector(span, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), span.normalize());
    return m;
}

/** A window's silhouette, lamp lit behind it: 'cat' (a cat on the sill,
 *  its back arched) or 'witch' (a witch on her broom across the moon), or
 *  null where there is no document. */
function silhouetteTexture(kind, D) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 176;
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return null;
    const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;
    const glow = ctx.createRadialGradient(64, 80, 10, 64, 88, 110);
    glow.addColorStop(0, hex(D.lamp));
    glow.addColorStop(1, hex(D.lampEdge));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 128, 176);
    ctx.fillStyle = hex(D.black);
    if (kind === 'cat') {
        ctx.fillRect(0, 160, 128, 16);
        ctx.beginPath();
        ctx.ellipse(62, 132, 30, 24, 0, Math.PI, 0);
        ctx.lineTo(92, 160);
        ctx.lineTo(32, 160);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.arc(88, 112, 13, 0, Math.PI * 2);
        ctx.fill();
        for (const x of [80, 94]) {
            ctx.beginPath();
            ctx.moveTo(x - 6, 104);
            ctx.lineTo(x, 90);
            ctx.lineTo(x + 6, 104);
            ctx.fill();
        }
        ctx.lineWidth = 6;
        ctx.strokeStyle = hex(D.black);
        ctx.beginPath();
        ctx.moveTo(34, 150);
        ctx.quadraticCurveTo(8, 140, 18, 104);
        ctx.stroke();
    } else {
        ctx.fillStyle = hex(D.moon);
        ctx.beginPath();
        ctx.arc(70, 70, 38, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = hex(D.black);
        ctx.strokeStyle = hex(D.black);
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(18, 96);
        ctx.lineTo(112, 72);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(18, 96);
        ctx.lineTo(4, 92);
        ctx.lineTo(6, 108);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(48, 90);
        ctx.lineTo(80, 82);
        ctx.lineTo(70, 56);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.arc(70, 52, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(56, 48);
        ctx.lineTo(84, 46);
        ctx.lineTo(66, 22);
        ctx.closePath();
        ctx.fill();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

/** A witch who flew into a tree: a scrap of black skirt at the trunk and
 *  her striped legs and pointed boots sticking out of it, along +z. */
function crashedWitch(D) {
    const group = new THREE.Group();
    // The skirt's waist is in the bark and its hem flares over her legs.
    const skirt = mesh(new THREE.ConeGeometry(0.17, 0.26, 10, 1, true), lambert(D.black, { side: THREE.DoubleSide }), 0, 0, 0.1);
    skirt.rotation.x = -Math.PI / 2;
    group.add(skirt);
    const stripes = [lambert(D.stocking), lambert(D.black)];
    for (const s of [-1, 1]) {
        const hip = [s * 0.05, 0, 0.12];
        const foot = [s * 0.16, -0.22, 0.85];
        const n = 7;
        for (let k = 0; k < n; k++) {
            const a = hip.map((v, i) => v + ((foot[i] - v) * k) / n);
            const b = hip.map((v, i) => v + ((foot[i] - v) * (k + 1)) / n);
            group.add(bone(a, b, 0.032 - k * 0.002, stripes[k % 2], true));
        }
        const boot = new THREE.Group();
        boot.position.set(...foot);
        boot.add(mesh(new THREE.BoxGeometry(0.08, 0.16, 0.08), lambert(D.black), 0, 0.02, 0.02, true));
        const toe = mesh(new THREE.ConeGeometry(0.035, 0.14, 6), lambert(D.black), 0, -0.04, 0.1, true);
        toe.rotation.x = Math.PI / 2 - 0.5;
        boot.add(toe);
        group.add(boot);
    }
    return group;
}

/** A giant black spider, its feet on y = 0, its head toward +z. Returns
 *  { group, legs } for a little twitch of its front legs. */
function giantSpider(D) {
    const group = new THREE.Group();
    const black = lambert(D.black);
    const abdomen = mesh(new THREE.SphereGeometry(0.42, 16, 12), black, 0, 0.34, -0.4, true);
    abdomen.scale.set(1, 0.8, 1.1);
    group.add(abdomen);
    group.add(mesh(new THREE.SphereGeometry(0.24, 12, 10), black, 0, 0.26, 0.2, true));
    for (const s of [-1, 1]) group.add(mesh(new THREE.SphereGeometry(0.035, 8, 6), lambert(D.eyes), s * 0.08, 0.34, 0.42));
    const legs = [];
    for (const s of [-1, 1]) {
        [0.32, 0.12, -0.08, -0.28].forEach((z, k) => {
            const leg = new THREE.Group();
            leg.position.set(s * 0.18, 0.26, 0.2 + z * 0.4);
            const spread = 1 + (k === 0 || k === 3 ? 0.25 : 0);
            const knee = [s * 0.55, 0.42, z * 1.6 * spread];
            const foot = [s * 1.0, -0.26, z * 2.6 * spread];
            leg.add(bone([0, 0, 0], knee, 0.035, black, true), bone(knee, foot, 0.028, black, true));
            group.add(leg);
            legs.push(leg);
        });
    }
    return { group, legs };
}

/** A skeleton lounging on a hay bale, one hand on its knee and the other
 *  up in a wave. Returns { group, wave } (the waving forearm). */
function skeletonOnBale(D) {
    const group = new THREE.Group();
    const straw = lambert(D.straw);
    group.add(mesh(new THREE.BoxGeometry(1.0, 0.45, 0.55), straw, 0, 0.225, 0, true));
    for (const x of [-0.25, 0.25]) group.add(mesh(new THREE.BoxGeometry(0.02, 0.46, 0.56), lambert(D.twine), x, 0.225, 0));
    const bones = lambert(D.bone);
    const dark = lambert(D.black);
    group.add(mesh(new THREE.BoxGeometry(0.24, 0.08, 0.13), bones, 0, 0.5, -0.05));
    group.add(bone([0, 0.5, -0.06], [0, 1.0, -0.1], 0.02, bones));
    for (let k = 0; k < 4; k++) {
        const rib = mesh(new THREE.TorusGeometry(0.115 - k * 0.012, 0.012, 4, 14), bones, 0, 0.72 + k * 0.065, -0.07);
        rib.rotation.x = Math.PI / 2;
        rib.scale.set(1, 0.7, 1);
        group.add(rib);
    }
    group.add(mesh(new THREE.SphereGeometry(0.1, 12, 10), bones, 0, 1.12, -0.08));
    group.add(mesh(new THREE.BoxGeometry(0.1, 0.04, 0.08), bones, 0, 1.03, -0.04));
    for (const s of [-1, 1]) group.add(mesh(new THREE.SphereGeometry(0.025, 6, 5), dark, s * 0.038, 1.13, 0.008));
    group.add(bone([-0.17, 0.96, -0.08], [0.17, 0.96, -0.08], 0.014, bones));
    // One hand on its knee.
    group.add(bone([0.17, 0.96, -0.08], [0.22, 0.72, 0.08], 0.017, bones), bone([0.22, 0.72, 0.08], [0.13, 0.57, 0.33], 0.014, bones));
    // The other up in a wave, the forearm swinging.
    group.add(bone([-0.17, 0.96, -0.08], [-0.34, 1.12, -0.02], 0.017, bones));
    const wave = new THREE.Group();
    wave.position.set(-0.34, 1.12, -0.02);
    wave.add(bone([0, 0, 0], [-0.04, 0.24, 0.02], 0.014, bones));
    group.add(wave);
    for (const s of [-1, 1]) {
        group.add(bone([s * 0.08, 0.5, 0], [s * 0.12, 0.53, 0.4], 0.02, bones), bone([s * 0.12, 0.53, 0.4], [s * 0.13, 0.08, 0.46], 0.017, bones));
        group.add(mesh(new THREE.BoxGeometry(0.07, 0.04, 0.14), bones, s * 0.13, 0.04, 0.51));
    }
    return { group, wave };
}

/** A bat with wings that flap: { group, left, right } (the wings' hinges,
 *  turned about z to flap). Wingspan 1 before scaling, facing +z. */
function flappingBat(black) {
    const group = new THREE.Group();
    const body = mesh(new THREE.SphereGeometry(0.08, 8, 6), black, 0, 0, 0);
    body.scale.set(0.8, 0.9, 1.4);
    group.add(body);
    const half = new THREE.Shape();
    [[0.04, 0.05], [0.2, 0.12], [0.36, 0.15], [0.5, 0.14], [0.4, 0.03], [0.32, 0.06], [0.24, -0.02], [0.15, 0.02], [0.06, -0.06]]
        .forEach(([x, y], k) => (k ? half.lineTo(x, y) : half.moveTo(x, y)));
    half.closePath();
    const geometry = new THREE.ShapeGeometry(half);
    const wing = (side) => {
        const hinge = new THREE.Group();
        const w = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color: black.color, side: THREE.DoubleSide }));
        // Lying flat, spread out to `side`.
        w.rotation.x = -Math.PI / 2;
        w.scale.x = side;
        hinge.add(w);
        group.add(hinge);
        return hinge;
    };
    return { group, left: wing(1), right: wing(-1) };
}

/** A giant inflatable ghost, about `tall` meters, arms out, eyes and an
 *  "oh" of a mouth, facing +z. */
function inflatableGhost(tall, D) {
    const group = new THREE.Group();
    const white = lambert(D.sheet);
    const profile = [[0.001, 1], [0.16, 0.98], [0.25, 0.9], [0.28, 0.75], [0.3, 0.5], [0.33, 0.25], [0.36, 0.06], [0.34, 0]]
        .map(([r, y]) => new THREE.Vector2(r * tall, y * tall));
    group.add(mesh(new THREE.LatheGeometry(profile, 24), white, 0, 0, 0, true));
    for (const s of [-1, 1]) {
        const arm = mesh(new THREE.CapsuleGeometry(0.09 * tall, 0.22 * tall, 4, 10), white, s * 0.36 * tall, 0.6 * tall, 0, true);
        arm.rotation.z = s * 1.0;
        group.add(arm);
        const eye = mesh(new THREE.SphereGeometry(0.045 * tall, 10, 8), lambert(D.black), s * 0.09 * tall, 0.82 * tall, 0.25 * tall);
        eye.scale.set(0.8, 1.3, 0.35);
        group.add(eye);
    }
    const mouth = mesh(new THREE.SphereGeometry(0.05 * tall, 10, 8), lambert(D.black), 0, 0.68 * tall, 0.27 * tall);
    mouth.scale.set(0.8, 1.1, 0.3);
    group.add(mouth);
    return group;
}

/** Stretchy cobweb pulled over the top of the hedge (the box `hedge`, x
 *  from minX to maxX, top at `top`), between z `from` and `to`: strands
 *  between random points just over its top, kept off our side of it. */
function hedgeWeb(hedge, W, color, seed = 17) {
    const random = makeRandom(seed);
    const at = () => [hedge.minX + 0.04 + random() * (hedge.maxX - hedge.minX - 0.08),
        hedge.top + 0.01 + random() * 0.05, W.from + random() * (W.to - W.from)];
    const points = [];
    for (let k = 0; k < W.strands; k++) {
        const a = at();
        // Short strands, mostly along the hedge, as stretched web lies.
        const b = [Math.min(hedge.maxX - 0.03, Math.max(hedge.minX + 0.03, a[0] + (random() - 0.5) * 0.5)),
            hedge.top + 0.01 + random() * 0.05, a[2] + (random() - 0.5) * 1.1];
        points.push(new THREE.Vector3(...a), new THREE.Vector3(...b));
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color }));
}

/** A string of lights wound up a post (box `p`) from `from` to `to` high,
 *  `turns` times round at radius `r` from its middle. Pure. */
export function postSpiral(p, from, to, P) {
    const cx = (p.minX + p.maxX) / 2;
    const cz = (p.minZ + p.maxZ) / 2;
    const at = (u) => {
        const a = u * P.turns * Math.PI * 2;
        return [cx + Math.cos(a) * P.r, from + (to - from) * u, cz + Math.sin(a) * P.r];
    };
    const wire = [];
    for (let k = 0; k <= P.turns * 16; k++) wire.push(at(k / (P.turns * 16)));
    const bulbs = [];
    for (let k = 0; k < P.bulbs; k++) {
        const [x, y, z] = at((k + 0.5) / P.bulbs);
        bulbs.push({ x, y, z });
    }
    return { wire, bulbs };
}

/** A scarecrow on a post: a straw hat, a burlap head with a stitched face,
 *  a shirt hung on the crossbar with straw at the cuffs, and patched pants. */
function scarecrow(K, D) {
    const group = new THREE.Group();
    const wood = lambert(0x6b4f33);
    const straw = lambert(D.straw);
    group.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.95, 6), wood, 0, 0.975, 0, true));
    group.add(mesh(new THREE.BoxGeometry(1.25, 0.06, 0.06), wood, 0, 1.45, 0, true));
    group.add(mesh(new THREE.BoxGeometry(0.42, 0.5, 0.22), lambert(K.shirt), 0, 1.27, 0, true));
    for (const s of [-1, 1]) {
        const sleeve = mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.42, 8), lambert(K.shirt), s * 0.4, 1.45, 0, true);
        sleeve.rotation.z = Math.PI / 2;
        group.add(sleeve);
        const tuft = mesh(new THREE.ConeGeometry(0.06, 0.14, 6), straw, s * 0.66, 1.45, 0, true);
        tuft.rotation.z = -s * Math.PI / 2;
        group.add(tuft);
        group.add(mesh(new THREE.BoxGeometry(0.15, 0.55, 0.17), lambert(K.pants), s * 0.1, 0.77, 0, true));
    }
    group.add(mesh(new THREE.SphereGeometry(0.17, 12, 10), lambert(K.burlap), 0, 1.7, 0, true));
    const ink = lambert(D.black);
    for (const s of [-1, 1]) group.add(mesh(new THREE.BoxGeometry(0.04, 0.04, 0.02), ink, s * 0.06, 1.74, 0.16));
    for (let k = -2; k <= 2; k++) group.add(mesh(new THREE.BoxGeometry(0.02, 0.012, 0.02), ink, k * 0.03, 1.62 - Math.abs(k) * -0.006, 0.155));
    group.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 18), lambert(K.hat), 0, 1.83, 0, true));
    group.add(mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.16, 14), lambert(K.hat), 0, 1.92, 0, true));
    return group;
}

/**
 * Every decoration, from config. Returns { group, update(time, motion) }.
 */
export function buildDecorations(config) {
    const D = config.halloween.decor;
    const Y = config.yard;
    const H = Y.house;
    const NH = Y.neighborHouse;
    // Each house's face, set back behind where the leaves rest (house.js).
    const front = facadeZ(Y.lawn.minZ, H);
    const hisFront = facadeZ(Y.neighbor.minZ, NH);
    const group = new THREE.Group();
    group.name = 'decorations';
    const black = lambert(D.black);
    const named = (name) => (Y.boxes || []).filter((b) => b.name === name);
    const porch = named('porch')[0];
    const posts = named('post').filter((p) => p.maxX <= H.maxX);
    const roofY = posts.length ? posts[0].height : 2.8;
    const roofFront = porch ? porch.maxZ + 0.25 : front + 2;

    // Bats up the wall beside the porch, just proud of the battens and the
    // window frames.
    if (porch) {
        const flight = batFlight(D, H, porch.maxX);
        const bats = new THREE.InstancedMesh(new THREE.ShapeGeometry(batShape()), black, flight.length);
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const zAxis = new THREE.Vector3(0, 0, 1);
        flight.forEach((b, k) => {
            q.setFromAxisAngle(zAxis, -b.tilt);
            m.compose(new THREE.Vector3(b.x, b.y, front + 0.13), q, new THREE.Vector3(b.size, b.size, 1));
            bats.setMatrixAt(k, m);
        });
        bats.name = 'bats';
        group.add(bats);
    }

    // Warm lights along the front edge of the porch roof, in two even
    // scallops, corner to middle to corner.
    if (porch) {
        const z = roofFront - 0.03;
        const y = roofY - 0.02;
        const anchors = [porch.minX - 0.1, (porch.minX + porch.maxX) / 2, porch.maxX + 0.1].map((x) => ({ x, y, z }));
        const lights = stringLights(anchors, D.sag, D.bulbEvery);
        group.add(wireLine(lights.wire, D.black));
        bulbMeshes(lights.bulbs, [D.bulb]).forEach((b) => group.add(b));
    }

    // A cobweb in each corner of the posts and the porch roof, and a spider
    // on a thread beside the left one.
    let hanging = null;
    if (posts.length) {
        const left = posts.reduce((a, b) => (a.minX < b.minX ? a : b));
        const right = posts.reduce((a, b) => (a.maxX > b.maxX ? a : b));
        const z = (left.minZ + left.maxZ) / 2;
        group.add(cobweb(left.maxX, roofY - 0.01, z, D.web, D.webColor));
        if (right !== left) group.add(cobweb(right.minX, roofY - 0.01, (right.minZ + right.maxZ) / 2, D.web * 0.8, D.webColor, -1));
        hanging = spider(left.maxX + D.web * 0.85, roofY - 0.01, roofY - 0.55, z + 0.05, black, D.webColor);
        group.add(hanging.group);
    }

    // A lamp lit behind a silhouette in two of our windows: just behind the
    // mullions, in front of the glass.
    for (const w of D.windows || []) {
        const map = silhouetteTexture(w.kind, D);
        if (!map) continue;
        const pane = mesh(new THREE.PlaneGeometry(OUR_WINDOWS.w - 0.14, OUR_WINDOWS.h - 0.14), new THREE.MeshBasicMaterial({ map }),
            (H.minX + H.maxX) / 2 + OUR_WINDOWS.xs[w.index], OUR_WINDOWS.y, front + 0.1);
        pane.name = `window-${w.kind}`;
        group.add(pane);
    }

    // Lights wound up both porch posts, from the porch floor to its roof.
    if (porch) {
        for (const p of posts) {
            const spiral = postSpiral(p, porch.height + 0.08, roofY - 0.08, D.postLights);
            group.add(wireLine(spiral.wire, D.black));
            bulbMeshes(spiral.bulbs, [D.bulb], 0.025).forEach((b) => group.add(b));
        }
    }

    // Stretchy cobweb along the top of our hedge, and a spider or two in it.
    const hedgeWall = Y.walls.find((w) => w.axis === 'x' && w.height >= 1.2);
    if (hedgeWall) {
        const hedge = { minX: hedgeWall.at - 0.9, maxX: hedgeWall.at, top: hedgeWall.height };
        group.add(hedgeWeb(hedge, D.hedgeWeb, D.webColor));
        for (let k = 0; k < D.hedgeWeb.spiders; k++) {
            const z = D.hedgeWeb.from + ((k + 0.6) / (D.hedgeWeb.spiders + 0.2)) * (D.hedgeWeb.to - D.hedgeWeb.from);
            group.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), black, hedge.minX + 0.3 + k * 0.25, hedge.top + 0.05, z));
        }
    }

    // Crows along our ridge, looking about.
    const crows = (D.crows || []).map((c) => {
        const bird = crow(black, lambert(D.beak));
        bird.group.position.set(c.x, H.ridge - 0.02, front - H.depth / 2);
        bird.group.rotation.y = c.turn;
        group.add(bird.group);
        return { ...bird, c };
    });

    // The neighbor's: orange and purple lights all along his eaves.
    const eave = { y: NH.wall - 0.17, z: hisFront + 0.42 };
    const anchors = [];
    for (let x = NH.minX - 0.3; x <= NH.maxX + 0.31; x += (NH.maxX - NH.minX + 0.6) / 6) anchors.push({ x, y: eave.y, z: eave.z });
    const his = stringLights(anchors, D.sag * 0.8, D.bulbEvery);
    group.add(wireLine(his.wire, D.black));
    bulbMeshes(his.bulbs, [D.bulb, D.purple]).forEach((b) => group.add(b));

    // A little ghost by his windows.
    const ghost = hangingGhost(D.ghost.tall, black, D.sheet, D.webColor, D.ghost.string);
    ghost.position.set(D.ghost.x, eave.y + 0.05, hisFront + 0.55);
    group.add(ghost);

    // His inflatable jack-o-lantern, past the sim's ground, swaying a little.
    const I = D.inflatable;
    const inflatable = new THREE.Group();
    inflatable.position.set(I.x, 0, I.z);
    inflatable.rotation.y = I.turn;
    const squash = 0.85;
    const ball = mesh(new THREE.SphereGeometry(I.r, 24, 16), lambert(D.orange), 0, I.r * squash, 0, true);
    ball.scale.set(1, squash, 1);
    inflatable.add(ball);
    inflatable.add(mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.3, 8), lambert(D.stem), 0, I.r * squash * 2 + 0.1, 0, true));
    const printed = faceTexture(D.ink);
    if (printed) {
        const face = faceOnPumpkin(I.r, squash, lambert(0xffffff, { map: printed, alphaTest: 0.5 }), 0.006);
        face.position.y = I.r * squash;
        inflatable.add(face);
    }
    group.add(inflatable);

    // And his foam graveyard, with a skeleton taking it easy on a hay bale.
    const rip = ripTexture(D.ink);
    const foam = lambert(D.foam);
    for (const g of D.graves || []) {
        const stone = tombstone(g.kind, foam, rip);
        stone.position.set(g.x, 0, g.z);
        stone.rotation.set(g.lean || 0, g.turn || 0, g.tilt || 0);
        group.add(stone);
    }
    // His giant inflatable ghost, beside the pumpkin, swaying.
    const G = D.ghostInflatable;
    const bigGhost = inflatableGhost(G.tall, D);
    bigGhost.position.set(G.x, 0, G.z);
    bigGhost.rotation.y = G.turn;
    group.add(bigGhost);

    // A flock of bats circling over his roof.
    const F = D.flock;
    const flock = [];
    for (let k = 0; k < F.bats; k++) {
        const bat = flappingBat(black);
        bat.group.scale.setScalar(0.55 + (k % 3) * 0.12);
        group.add(bat.group);
        flock.push({ ...bat, phase: (k / F.bats) * Math.PI * 2, lift: (k % 3) * 0.35, rate: 1 + (k % 2) * 0.15 });
    }

    const lounger = skeletonOnBale(D);
    lounger.group.position.set(D.skeleton.x, 0, D.skeleton.z);
    lounger.group.rotation.y = D.skeleton.turn;
    group.add(lounger.group);

    // A giant spider on his roof, laid on the front slope, head down it.
    const S = D.roofSpider;
    const slope = Math.atan2(NH.ridge - NH.wall + 0.05, 4.4);
    const along = S.along;
    const crawler = giantSpider(D);
    crawler.group.position.set(S.x, NH.wall - 0.05 + along * (NH.ridge - NH.wall + 0.05), hisFront + 0.4 - along * 4.4);
    crawler.group.rotation.set(slope, S.turn, 0, 'XYZ');
    group.add(crawler.group);

    // The witch who flew into the maple over the hedge.
    const tree = Y.trees.find((t) => t.x < Y.bounds.minX && t.z > Y.lawn.minZ && t.z < Y.lawn.maxZ);
    if (tree) {
        const witch = crashedWitch(D);
        const a = D.witch.facing;
        witch.position.set(tree.x + Math.sin(a) * D.witch.out, D.witch.y, tree.z + Math.cos(a) * D.witch.out);
        witch.rotation.y = a;
        group.add(witch);
    }

    // Down the street: pumpkins by each door, lights along the sage house's
    // eave and a scarecrow in its yard, and on the gray one a web across the
    // garage's corner and little ghosts along its eave.
    const K = D.scarecrow;
    const crow2 = scarecrow(K, D);
    crow2.position.set(K.x, 0, K.z);
    crow2.rotation.y = K.turn;
    group.add(crow2);
    const bale = mesh(new THREE.BoxGeometry(1.0, 0.45, 0.55), lambert(D.straw), K.x + 0.9, 0.225, K.z + 0.5, true);
    bale.rotation.y = K.turn;
    group.add(bale);
    group.add(pumpkin({ x: K.x + 0.75, z: K.z + 0.5, y: 0.45, r: 0.16, color: 0xe0701f }));
    group.add(pumpkin({ x: K.x + 1.25, z: K.z + 1.0, y: 0, r: 0.2, color: 0xd9832a }));
    const littleGhosts = [];
    for (const h of Y.street || []) {
        const parts = streetHouseParts(h);
        D.streetPumpkins.forEach((p) => group.add(pumpkin({ ...p, x: parts.doorX + p.dx, z: h.front + p.dz, y: 0 })));
        if (h.garage < 0) {
            const row = [];
            for (let x = h.minX - 0.3; x <= h.maxX + 0.31; x += (h.maxX - h.minX + 0.6) / 5) row.push({ x, y: h.wall - 0.17, z: h.front + 0.42 });
            const lit = stringLights(row, D.sag * 0.8, D.bulbEvery);
            group.add(wireLine(lit.wire, D.black));
            bulbMeshes(lit.bulbs, [D.bulb]).forEach((b) => group.add(b));
        } else {
            group.add(cobweb(parts.gx - parts.gw / 2, 2.2, h.front + 0.1, 1.1, D.webColor));
            for (const dx of D.streetGhosts) {
                const g = hangingGhost(0.45, black, D.sheet, D.webColor, 0.3);
                g.position.set(parts.doorX + dx, h.wall - 0.12, h.front + 0.5);
                group.add(g);
                littleGhosts.push(g);
            }
        }
    }

    function update(time, motion = 1) {
        if (hanging) hanging.body.position.y = roofY - 0.55 + 0.04 * motion * Math.sin(time * 1.1);
        crows.forEach(({ head, c }, k) => {
            // A look this way, then that, in steps, each its own rhythm.
            const beat = Math.floor((time + k * 1.7) / (2.2 + k * 0.6));
            head.rotation.y = motion * 0.9 * Math.sin(beat * 2.4 + k);
        });
        ghost.rotation.z = 0.12 * motion * Math.sin(time * 0.9);
        ghost.rotation.y = 0.3 * motion * Math.sin(time * 0.4);
        inflatable.rotation.z = 0.025 * motion * Math.sin(time * 0.8);
        inflatable.rotation.x = 0.018 * motion * Math.sin(time * 0.63 + 1);
        lounger.wave.rotation.z = 0.5 * motion * Math.sin(time * 4);
        bigGhost.rotation.z = 0.04 * motion * Math.sin(time * 0.7 + 2);
        littleGhosts.forEach((g, k) => { g.rotation.z = 0.15 * motion * Math.sin(time * (0.8 + k * 0.17) + k); });
        // The flock wheels over his roof, wings beating, each a little apart.
        flock.forEach((b) => {
            const a = b.phase + time * F.speed * motion;
            b.group.position.set(F.x + Math.cos(a) * F.r * b.rate, F.y + b.lift + 0.2 * Math.sin(a * 2), F.z + Math.sin(a) * F.r * 0.6);
            b.group.rotation.y = -a;
            const flap = 0.9 * Math.sin(time * 14 * b.rate + b.phase) * (motion > 0.5 ? 1 : 0.3);
            b.left.rotation.z = flap;
            b.right.rotation.z = -flap;
        });
        // Now and then the spider's front legs twitch.
        const twitch = motion * 0.12 * Math.max(0, Math.sin(time * 0.7)) * Math.sin(time * 9);
        crawler.legs.forEach((leg, k) => { leg.rotation.y = k % 4 === 0 ? twitch : 0; });
    }
    // Everything that moves starts where it moves, not at the origin (the
    // flock would sit on our lawn until the first frame).
    update(0, 1);
    return { group, update };
}

