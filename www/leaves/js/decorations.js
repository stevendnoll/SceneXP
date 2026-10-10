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
 * A WITCH flew headfirst into our hedge: her striped legs and boots kick up
 * out of its top, her broom stuck in beside her.
 *
 * DOWN THE BLOCK the street joins in (Steve's M6 QA: "could we please add
 * more decorations?"): pumpkins, lights, a scarecrow and little ghosts at
 * the two houses down the street.
 *
 * NOTHING HERE IS ON OUR LAWN. The leaves would blow through it (the sim
 * knows only the boxes in config.yard), and the dive runs straight at the
 * pile from wherever the person stands. So everything hangs on a house,
 * sits on a roof, stands behind the hedge, or stands on a box the sim knows
 * (yardDecorBoxes on our lawn, theirDecorBoxes on the others).
 *
 * Halloween week's extras (the carved, lit faces on the porch pumpkins and
 * the trick-or-treaters) are halloween.js's. Everything here is drawing:
 * buildDecorations() places it all from config, and update() gives the
 * things that hang or perch a little life.
 */
import { faceTexture, faceOnPumpkin } from './halloween.min.js';
import { makeRandom } from './sim.min.js';
import { pumpkin, ribbedPumpkin, streetHouseParts, OUR_WINDOWS, facadeZ, MAILBOX, mailboxSpot, mailboxShape, neighborWindows } from './house.min.js';

const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

function mesh(geometry, material, x, y, z, shadow = false) {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = shadow;
    return m;
}

// ---- What stands on our lawn (pure) ---------------------------------------------

/** The stack of pumpkins at `t`: each pumpkin's middle and radius, bottom up,
 *  each sitting on the one below (house.js draws one 0.72 as tall as wide). */
export function towerStack(t, D) {
    let y = 0;
    return D.towerPumpkins.map((p) => {
        const at = { x: t.x, z: t.z, y, r: p.r, color: p.color };
        y += p.r * 1.44 * 0.92;
        return at;
    });
}

/**
 * The boxes our yard's decorations stand on, as config.yard.boxes entries:
 * each lantern, each pumpkin stack, each skeleton on the lawn. Main.js adds them to the
 * yard the sim is built from while the decorations are up, and draws the
 * decorations from the same numbers, so the leaves meet what is drawn.
 * Each is a platform: a leaf blown onto one lies on top.
 */
export function yardDecorBoxes(config) {
    const D = config.halloween.decor;
    const out = [];
    const Ln = D.lanterns;
    if (Ln) {
        for (const x of Ln.xs) {
            for (const z of Ln.zs) {
                out.push({ name: 'lantern', minX: x - Ln.size / 2, maxX: x + Ln.size / 2, minZ: z - Ln.size / 2, maxZ: z + Ln.size / 2, height: Ln.height, platform: true });
            }
        }
    }
    for (const t of D.towers || []) {
        const stack = towerStack(t, D);
        const top = stack[stack.length - 1];
        const half = stack[0].r * 0.75;
        out.push({ name: 'pumpkins', minX: t.x - half, maxX: t.x + half, minZ: t.z - half, maxZ: t.z + half, height: top.y + top.r * 1.44, platform: true });
    }
    // Our graves (2026-10-08): each stone a wall, each mound a low platform.
    for (const g of (D.ourGraves && D.ourGraves.list) || []) {
        const t = STONE[g.kind];
        out.push({ name: 'tombstone', minX: g.x - t.w / 2 - 0.03, maxX: g.x + t.w / 2 + 0.03, minZ: g.z - 0.08, maxZ: g.z + 0.08, height: t.h });
        const M = D.ourGraves.mound;
        // A hand's width of lawn between the stone and its mound.
        const front = g.z + 0.16;
        out.push({ name: 'grave', minX: g.x - M.w / 2, maxX: g.x + M.w / 2, minZ: front, maxZ: front + M.d, height: M.height, platform: true });
    }
    // The skeletons on the lawn: walls a leaf meets, not shelves it lies on
    // (a leaf on a 1.7 m shelf over the raker would hang in the air).
    const K = D.skeletons || {};
    if (K.riser) {
        const b = K.riser.box;
        out.push({ name: 'skeleton', minX: K.riser.x - b.x, maxX: K.riser.x + b.x, minZ: K.riser.z - b.z, maxZ: K.riser.z + b.z, height: b.height });
    }
    if (K.raker) {
        const b = K.raker.box;
        out.push({ name: 'skeleton', minX: K.raker.x - b.x, maxX: K.raker.x + b.x, minZ: K.raker.z + b.minZ, maxZ: K.raker.z + b.maxZ, height: b.height });
    }
    return out;
}

/**
 * The solid boxes of the decorations on the other lawns (2026-10-08), on the
 * sim's ground since it was widened past them: his inflatable jack-o-lantern
 * (a platform over the square inside its belly, as the pumpkins are), his
 * inflatable ghost (a wall around its middle), his foam stones (each a wall,
 * as ours are), the hay bale his skeleton sits on (inside its turned
 * footprint, as tall as he sits), and the scarecrow's post at the sage house.
 */
export function theirDecorBoxes(config) {
    const D = config.halloween.decor;
    const out = [];
    const square = (name, x, z, half, height, platform = false) => out.push({ name, minX: x - half, maxX: x + half, minZ: z - half, maxZ: z + half, height, ...(platform ? { platform } : {}) });
    const I = D.inflatable;
    if (I) square('inflatable', I.x, I.z, I.r * 0.75, I.r * 1.7, true);
    const G = D.ghostInflatable;
    if (G) square('ghost', G.x, G.z, G.tall * 0.22, G.tall);
    for (const g of D.graves || []) {
        const t = STONE[g.kind];
        out.push({ name: 'foam-stone', minX: g.x - t.w / 2 - 0.03, maxX: g.x + t.w / 2 + 0.03, minZ: g.z - 0.08, maxZ: g.z + 0.08, height: t.h });
    }
    if (D.skeleton) square('bale', D.skeleton.x, D.skeleton.z, 0.3, 1.1);
    if (D.scarecrow) square('scarecrow', D.scarecrow.x, D.scarecrow.z, 0.06, 1.95);
    return out;
}

/** The config with the decorations among its solid boxes, ours and the
 *  other lawns': the world the sim is built from while they are up. */
export function decoratedConfig(config) {
    return { ...config, yard: { ...config.yard, boxes: [...config.yard.boxes, ...yardDecorBoxes(config), ...theirDecorBoxes(config)] } };
}

/** How far into our window the clown has slid at `time`, 0 (out of sight)
 *  to 1: hidden, sliding in, staying, sliding out, round again. Pure. */
export function clownPeek(time, P) {
    const cycle = P.hidden + P.slide * 2 + P.stay;
    const t = ((time % cycle) + cycle) % cycle;
    const ease = (u) => u * u * (3 - 2 * u);
    if (t < P.hidden) return 0;
    if (t < P.hidden + P.slide) return ease((t - P.hidden) / P.slide);
    if (t < P.hidden + P.slide + P.stay) return 1;
    return ease(1 - (t - P.hidden - P.slide - P.stay) / P.slide);
}

/** Where on the window figures' canvases the faces are drawn, in pixels:
 *  the middle, the whole head (hair and hat too) as [x0, y0, x1, y1], the
 *  canvas's size, and the pane's in meters. The watcher's in the upper left
 *  pane, the clown's in the upper right, each clear of the window's cross
 *  of mullions (tests/leaves-halloween). */
export const WINDOW_FACES = Object.freeze({
    watcher: { cx: 33, cy: 50, box: [12, 19, 54, 72], w: 128, h: 176, pane: [0.96, 1.36] },
    clown: { cx: 104, cy: 48, box: [68, 6, 128, 76], w: 128, h: 172, pane: [1.16, 1.56] }
});

/** Whether the figure in the window is there at `time`: `seen` seconds of
 *  every `seen + gone`, starting there. Pure. */
export function watcherThere(time, W) {
    const cycle = W.seen + W.gone;
    return ((time % cycle) + cycle) % cycle < W.seen;
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

/** Each tombstone's width and full height (a round one's to the top of its
 *  arch), for drawing it and for its box. */
const STONE = Object.freeze({
    round: { w: 0.55, h: 0.775, body: 0.5 },
    square: { w: 0.5, h: 0.68, body: 0.68 },
    cross: { w: 0.46, h: 0.85, body: 0.85 }
});

/** A foam tombstone: 'round' (a rounded top), 'square', or a 'cross', its
 *  front toward +z, `rip` a texture for the front or null. */
function tombstone(kind, foam, rip) {
    const group = new THREE.Group();
    if (kind === 'cross') {
        group.add(mesh(new THREE.BoxGeometry(0.12, 0.85, 0.1), foam, 0, 0.42, 0, true));
        group.add(mesh(new THREE.BoxGeometry(0.46, 0.12, 0.1), foam, 0, 0.6, 0, true));
        return group;
    }
    const w = STONE[kind].w;
    const h = STONE[kind].body;
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

/** A grave plot: a long, low mound of earth, `w` by `d` meters and
 *  `height` tall, its corners and top edges rounded, its foot at y = 0 and
 *  its middle at the origin. Drawn a bevel inside its outline, since a bevel
 *  grows a shape outward by as much, so it fills its box exactly. */
function gravePlot(M) {
    const bt = 0.04;
    const r = 0.1;
    const x0 = -M.w / 2 + bt;
    const x1 = M.w / 2 - bt;
    const y0 = -M.d / 2 + bt;
    const y1 = M.d / 2 - bt;
    const shape = new THREE.Shape();
    shape.moveTo(x0 + r, y0);
    shape.lineTo(x1 - r, y0);
    shape.absarc(x1 - r, y0 + r, r, -Math.PI / 2, 0, false);
    shape.lineTo(x1, y1 - r);
    shape.absarc(x1 - r, y1 - r, r, 0, Math.PI / 2, false);
    shape.lineTo(x0 + r, y1);
    shape.absarc(x0 + r, y1 - r, r, Math.PI / 2, Math.PI, false);
    shape.lineTo(x0, y0 + r);
    shape.absarc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5, false);
    const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: Math.max(0.01, M.height - 2 * bt), bevelEnabled: true, bevelThickness: bt, bevelSize: bt, bevelSegments: 3, curveSegments: 6
    });
    // Lying down: its extrusion up, its foot on the lawn.
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, bt, 0);
    return geometry;
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

/** A witch who flew headfirst into a hedge: a flare of black skirt on its
 *  top, her striped legs kicking up out of it in a V, pointed boots, and her
 *  broom stuck in beside her. Built at the hedge top's middle, the street
 *  toward +z, the V across x. */
function hedgeWitch(D) {
    const group = new THREE.Group();
    const black = lambert(D.black);
    // Upside down, her skirt falls into the hedge: what shows is its flare.
    group.add(mesh(new THREE.ConeGeometry(0.22, 0.2, 12, 1, true), lambert(D.black, { side: THREE.DoubleSide }), 0, 0.08, 0));
    const stripes = [lambert(D.stocking), black];
    for (const s of [-1, 1]) {
        const hip = [s * 0.05, 0.1, 0];
        const knee = [s * 0.13, 0.42, 0.05];
        const foot = [s * 0.2, 0.74, 0.02];
        const n = 4;
        [[hip, knee], [knee, foot]].forEach(([from, to], part) => {
            for (let k = 0; k < n; k++) {
                const a = from.map((v, i) => v + ((to[i] - v) * k) / n);
                const b2 = from.map((v, i) => v + ((to[i] - v) * (k + 1)) / n);
                group.add(bone(a, b2, 0.032 - (part * n + k) * 0.0015, stripes[(part * n + k) % 2], true));
            }
        });
        // A pointed boot, sole to the sky, toe toward the street.
        const boot = new THREE.Group();
        boot.position.set(...foot);
        boot.add(mesh(new THREE.BoxGeometry(0.075, 0.15, 0.08), black, 0, 0.05, 0, true));
        const toe = mesh(new THREE.ConeGeometry(0.035, 0.15, 6), black, 0, 0.1, 0.1, true);
        toe.rotation.x = Math.PI / 2 - 0.35;
        boot.add(toe);
        group.add(boot);
    }
    // Her broom, handle down in the hedge, bristles up.
    const handleFrom = [-0.15, -0.25, 0.5];
    const handleTo = [-0.05, 0.75, 0.62];
    group.add(bone(handleFrom, handleTo, 0.018, lambert(0x6b4f33), true));
    const bristles = mesh(new THREE.ConeGeometry(0.11, 0.32, 10), lambert(D.straw), handleTo[0], handleTo[1] + 0.12, handleTo[2], true);
    bristles.rotation.x = 0.12;
    group.add(bristles);
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

/** A standing skeleton, 1.7 m, feet on y = 0, facing +z, holding a rake
 *  out in front of it, its tines on the lawn. */
function rakingSkeleton(D) {
    const group = new THREE.Group();
    const bones = lambert(D.bone);
    const dark = lambert(D.black);
    group.add(mesh(new THREE.SphereGeometry(0.11, 14, 10), bones, 0, 1.6, 0.01, true));
    group.add(mesh(new THREE.BoxGeometry(0.1, 0.045, 0.09), bones, 0, 1.49, 0.04, true));
    for (const s of [-1, 1]) group.add(mesh(new THREE.SphereGeometry(0.026, 6, 5), dark, s * 0.04, 1.62, 0.1));
    group.add(bone([0, 0.95, -0.02], [0, 1.47, -0.02], 0.02, bones, true));
    for (let k = 0; k < 5; k++) {
        const rib = mesh(new THREE.TorusGeometry(0.13 - k * 0.008, 0.012, 4, 14), bones, 0, 1.12 + k * 0.06, 0, true);
        rib.rotation.x = Math.PI / 2;
        rib.scale.set(1, 0.7, 1);
        group.add(rib);
    }
    group.add(bone([-0.18, 1.42, -0.01], [0.18, 1.42, -0.01], 0.014, bones, true));
    group.add(mesh(new THREE.BoxGeometry(0.26, 0.09, 0.13), bones, 0, 0.95, 0, true));
    for (const s of [-1, 1]) {
        group.add(bone([s * 0.09, 0.93, 0], [s * 0.1, 0.5, 0.03], 0.022, bones, true), bone([s * 0.1, 0.5, 0.03], [s * 0.1, 0.07, 0], 0.018, bones, true));
        group.add(mesh(new THREE.BoxGeometry(0.08, 0.04, 0.17), bones, s * 0.1, 0.03, 0.05, true));
    }
    // The rake, from high at its chest to its tines on the lawn ahead.
    const A = [0.02, 1.3, 0.2];
    const B = [0.02, 0.05, 0.78];
    const on = (t) => A.map((v, i) => v + (B[i] - v) * t);
    group.add(bone(A, B, 0.016, lambert(0x8a6748), true));
    group.add(mesh(new THREE.BoxGeometry(0.46, 0.03, 0.04), lambert(D.black), B[0], B[1], B[2], true));
    for (let k = -4; k <= 4; k++) group.add(mesh(new THREE.BoxGeometry(0.012, 0.06, 0.012), lambert(D.black), B[0] + k * 0.055, 0.02, B[2] + 0.02));
    // Both hands on the handle, the elbows out.
    [[1, 0.18], [-1, 0.42]].forEach(([s, t]) => {
        const hand = on(t);
        const elbow = [s * 0.24, (1.42 + hand[1]) / 2, 0.12];
        group.add(bone([s * 0.17, 1.42, -0.01], elbow, 0.016, bones, true), bone(elbow, hand, 0.014, bones, true));
        group.add(mesh(new THREE.SphereGeometry(0.03, 6, 5), bones, ...hand));
    });
    return group;
}

/** A skeleton breaking out of the lawn: a mound of earth, the top of its
 *  ribs and its skull out of it, one hand on the ground and one reaching
 *  up. Built about its middle, facing +z. */
function risingSkeleton(D) {
    const group = new THREE.Group();
    const bones = lambert(D.bone);
    const mound = mesh(new THREE.SphereGeometry(0.45, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), lambert(D.soil), 0, 0, 0, true);
    mound.scale.y = 0.35;
    group.add(mound);
    for (let k = 0; k < 3; k++) {
        const rib = mesh(new THREE.TorusGeometry(0.12 - k * 0.01, 0.012, 4, 14), bones, 0, 0.18 + k * 0.06, 0, true);
        rib.rotation.x = Math.PI / 2 + 0.25;
        rib.scale.set(1, 0.7, 1);
        group.add(rib);
    }
    group.add(bone([0, 0.1, -0.05], [0, 0.42, 0.02], 0.02, bones, true));
    const skull = mesh(new THREE.SphereGeometry(0.11, 14, 10), bones, 0, 0.53, 0.05, true);
    group.add(skull);
    for (const s of [-1, 1]) group.add(mesh(new THREE.SphereGeometry(0.026, 6, 5), lambert(D.black), s * 0.04, 0.55, 0.14));
    group.add(mesh(new THREE.BoxGeometry(0.09, 0.04, 0.08), bones, 0, 0.43, 0.09, true));
    // Reaching up, and pushing itself out.
    group.add(bone([0.16, 0.36, 0], [0.27, 0.6, 0.08], 0.016, bones, true), bone([0.27, 0.6, 0.08], [0.24, 0.84, 0.14], 0.014, bones, true));
    group.add(mesh(new THREE.SphereGeometry(0.035, 6, 5), bones, 0.24, 0.86, 0.15));
    group.add(bone([-0.16, 0.36, 0], [-0.3, 0.24, 0.1], 0.016, bones, true), bone([-0.3, 0.24, 0.1], [-0.3, 0.08, 0.24], 0.014, bones, true));
    group.add(mesh(new THREE.BoxGeometry(0.07, 0.02, 0.09), bones, -0.3, 0.07, 0.27));
    return group;
}

/** A skeleton peeking over a hedge toward +x: its skull resting on the top,
 *  the fingers of both hands curled over the edge. */
function peekingSkeleton(D) {
    const group = new THREE.Group();
    const bones = lambert(D.bone);
    group.add(mesh(new THREE.SphereGeometry(0.11, 14, 10), bones, -0.2, 0.08, 0, true));
    for (const s of [-1, 1]) group.add(mesh(new THREE.SphereGeometry(0.026, 6, 5), lambert(D.black), -0.11, 0.1, s * 0.04));
    for (const s of [-1, 1]) {
        for (let k = 0; k < 4; k++) {
            const z = s * 0.22 + (k - 1.5) * 0.03;
            group.add(bone([-0.12, 0.01, z], [0.05, 0.02, z], 0.008, bones), bone([0.05, 0.02, z], [0.09, -0.05, z], 0.007, bones));
        }
    }
    return group;
}

/** A window's view into a dim room, with or without a still figure in it:
 *  dark coveralls, a blank pale mask with dark eye holes. Null where there
 *  is no document (under test). */
function watcherTexture(W, withFigure) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 176;
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return null;
    const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;
    const room = ctx.createLinearGradient(0, 0, 0, 176);
    room.addColorStop(0, hex(W.roomLight));
    room.addColorStop(1, hex(W.room));
    ctx.fillStyle = room;
    ctx.fillRect(0, 0, 128, 176);
    if (withFigure) {
        // In the upper left pane, his face clear of the window's cross of
        // mullions (centered, they covered most of it: Steve's M6 QA). The
        // vertical bar is at x 64 and the crossbar at y 88, so the mask sits
        // up and to the left of both, and his shoulders run behind them.
        const { cx, cy } = WINDOW_FACES.watcher;
        ctx.fillStyle = hex(W.coveralls);
        ctx.beginPath();
        ctx.moveTo(cx - 40, 176);
        ctx.quadraticCurveTo(cx - 34, cy + 36, cx, cy + 32);
        ctx.quadraticCurveTo(cx + 34, cy + 36, cx + 40, 176);
        ctx.closePath();
        ctx.fill();
        ctx.fillRect(cx - 8, cy + 20, 16, 16);
        // Dark hair, and the mask over the face.
        ctx.fillStyle = hex(W.hair);
        ctx.beginPath();
        ctx.ellipse(cx, cy - 6, 21, 25, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = hex(W.mask);
        ctx.beginPath();
        ctx.ellipse(cx, cy, 17, 22, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = hex(W.room);
        for (const x of [cx - 7, cx + 7]) {
            ctx.beginPath();
            ctx.ellipse(x, cy - 4, 4, 2.6, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 0.25;
        ctx.fillRect(cx - 2, cy, 4, 9);
        ctx.globalAlpha = 1;
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

/** A lamp lit room seen through a window, `h` pixels tall. Null where there
 *  is no document. */
function roomTexture(P, h) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = h;
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return null;
    const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;
    const glow = ctx.createRadialGradient(40, h * 0.3, 6, 64, h * 0.5, 120);
    glow.addColorStop(0, hex(P.roomLight));
    glow.addColorStop(1, hex(P.room));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 128, h);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

/** A clown on a clear canvas, peeking in from its right edge: a white face,
 *  a red nose and grin, wild orange hair, a little hat, a ruff, a dotted
 *  suit, a gloved hand on the frame. Its left column is left clear, so a
 *  texture slid to the right shows nothing past its edge. Null where there
 *  is no document. */
function clownTexture(P) {
    if (typeof document === 'undefined') return null;
    const { cx, cy, h } = WINDOW_FACES.clown;
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = h;
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return null;
    const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;
    const disc = (x, y, r, color) => {
        ctx.fillStyle = hex(color);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    };
    ctx.clearRect(0, 0, 128, h);
    // The suit, its dots, and the ruff, below the window's crossbar.
    ctx.fillStyle = hex(P.suit);
    ctx.fillRect(cx - 28, cy + 38, 128 - (cx - 28), h - (cy + 38));
    for (let y = cy + 50; y < h; y += 18) for (let x = cx - 20; x < 128; x += 18) disc(x + ((y / 18) % 2) * 9, y, 3.5, P.dots);
    for (let k = 0; k < 7; k++) disc(cx - 24 + k * 9, cy + 36, 6, k % 2 ? P.nose : P.face);
    // Wild hair either side, the face, a little hat.
    disc(cx - 24, cy - 6, 12, P.hair);
    disc(cx + 24, cy - 6, 12, P.hair);
    disc(cx - 18, cy + 8, 9, P.hair);
    disc(cx + 18, cy + 8, 9, P.hair);
    disc(cx, cy, 20, P.face);
    ctx.fillStyle = hex(P.hat);
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy - 17);
    ctx.lineTo(cx + 10, cy - 17);
    ctx.lineTo(cx + 3, cy - 38);
    ctx.closePath();
    ctx.fill();
    disc(cx + 3, cy - 39, 3.5, P.dots);
    // Hollow eyes with a pale pinprick in each, sharp brows, red streaks
    // run down from them, a dark nose, and a wide grin full of points.
    for (const s of [-1, 1]) {
        ctx.fillStyle = hex(P.socket);
        ctx.beginPath();
        ctx.ellipse(cx + s * 8, cy - 5, 5.5, 7, s * 0.35, 0, Math.PI * 2);
        ctx.fill();
        disc(cx + s * 8, cy - 4, 1.4, P.pupil);
        ctx.strokeStyle = hex(P.socket);
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(cx + s * 2, cy - 11);
        ctx.lineTo(cx + s * 15, cy - 17);
        ctx.stroke();
        ctx.strokeStyle = hex(P.nose);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(cx + s * 8, cy + 2);
        ctx.lineTo(cx + s * 9, cy + 13);
        ctx.stroke();
    }
    disc(cx, cy + 3, 4.5, P.nose);
    ctx.fillStyle = hex(P.socket);
    ctx.beginPath();
    ctx.moveTo(cx - 17, cy + 6);
    ctx.quadraticCurveTo(cx, cy + 27, cx + 17, cy + 6);
    ctx.quadraticCurveTo(cx, cy + 15, cx - 17, cy + 6);
    ctx.fill();
    ctx.strokeStyle = hex(P.nose);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Pointed teeth along the top of the grin.
    ctx.fillStyle = hex(P.pupil);
    for (let k = -3; k <= 3; k++) {
        const x = cx + k * 4.2;
        const y = cy + 11.5 + Math.abs(k) * -0.9;
        ctx.beginPath();
        ctx.moveTo(x - 1.8, y);
        ctx.lineTo(x + 1.8, y);
        ctx.lineTo(x, y + 3.6);
        ctx.closePath();
        ctx.fill();
    }
    // A white glove on the window frame.
    disc(124, cy + 30, 7, P.face);
    // All of him in shadow, deepest at the bottom: only painted pixels are
    // darkened, so what is clear stays clear.
    ctx.globalCompositeOperation = 'source-atop';
    const dusk = ctx.createLinearGradient(0, 0, 0, h);
    dusk.addColorStop(0, `rgba(0, 0, 0, ${P.shade * 0.6})`);
    dusk.addColorStop(1, `rgba(0, 0, 0, ${Math.min(0.9, P.shade * 1.6)})`);
    ctx.fillStyle = dusk;
    ctx.fillRect(0, 0, 128, h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, 2, h);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    // Clamped, so sliding it right shows the clear left column, not a wrap.
    texture.wrapS = THREE.ClampToEdgeWrapping;
    return texture;
}

/** Pieces `[geometry, x, y, z, turn]` as ONE geometry: each piece turned
 *  `turn` about y and moved to (x, y, z). Positions and normals only. A
 *  lantern of twenty pieces is then one draw, not twenty. */
function merged(pieces) {
    const position = [];
    const normal = [];
    for (const [geometry, x, y, z, turn = 0] of pieces) {
        const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
        if (turn) g.rotateY(turn);
        g.translate(x, y, z);
        position.push(...g.attributes.position.array);
        normal.push(...g.attributes.normal.array);
        g.dispose();
        geometry.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
    return out;
}

/**
 * A black carriage lantern `size` square and `height` tall (Steve's QA,
 * 2026-10-09: "slightly more detail"): a stepped base, corner posts, a
 * window bar across and down each glass side, a candle burning behind warm
 * glass, a top plate, a pyramid cap with a ball finial, and a ring to carry
 * it by. Four draws, one for each material: the iron (merged), the glass,
 * the candle and its flame.
 */
function lantern(Ln, black) {
    const group = new THREE.Group();
    const s = Ln.size;
    const h = Ln.height;
    const y0 = 0.06;
    const y1 = y0 + h * 0.55;
    const mid = (y0 + y1) / 2;
    const bar = 0.008;
    const iron = [
        [new THREE.BoxGeometry(s * 1.12, 0.03, s * 1.12), 0, 0.015, 0],
        [new THREE.BoxGeometry(s, 0.03, s), 0, 0.045, 0],
        [new THREE.BoxGeometry(s * 1.06, 0.025, s * 1.06), 0, y1 + 0.0125, 0],
        [new THREE.ConeGeometry(s * 0.74, h * 0.2, 4), 0, y1 + 0.025 + h * 0.1, 0, Math.PI / 4],
        [new THREE.SphereGeometry(0.016, 8, 6), 0, y1 + 0.025 + h * 0.2 + 0.01, 0],
        [new THREE.TorusGeometry(0.024, 0.005, 4, 12), 0, h, 0]
    ];
    for (const x of [-1, 1]) {
        for (const z of [-1, 1]) iron.push([new THREE.BoxGeometry(0.02, y1 - y0, 0.02), x * (s / 2 - 0.01), mid, z * (s / 2 - 0.01)]);
    }
    // The window bars: across and down the middle of each side.
    for (let k = 0; k < 4; k++) {
        const turn = (k * Math.PI) / 2;
        const out = s / 2 - 0.004;
        const ox = Math.sin(turn) * out;
        const oz = Math.cos(turn) * out;
        iron.push([new THREE.BoxGeometry(s - 0.02, bar, bar), ox, mid, oz, turn]);
        iron.push([new THREE.BoxGeometry(bar, y1 - y0, bar), ox, mid, oz, turn]);
    }
    group.add(mesh(merged(iron), black, 0, 0, 0, true));
    // Warm glass, see-through, so the candle shows.
    const glass = new THREE.MeshBasicMaterial({ color: Ln.glass, transparent: true, opacity: Ln.glassOpacity, depthWrite: false });
    group.add(mesh(new THREE.BoxGeometry(s - 0.018, y1 - y0, s - 0.018), glass, 0, mid, 0));
    group.add(mesh(new THREE.CylinderGeometry(0.026, 0.028, Ln.candle, 10), lambert(Ln.wax), 0, y0 + Ln.candle / 2, 0));
    const flame = mesh(new THREE.SphereGeometry(0.016, 8, 6), new THREE.MeshBasicMaterial({ color: Ln.flame }), 0, y0 + Ln.candle + 0.02, 0);
    flame.scale.set(1, 1.7, 1);
    group.add(flame);
    return group;
}

/** A witch's hat floating on a thread, a lit candle hanging under it. */
function floatingHat(D, black) {
    const group = new THREE.Group();
    group.add(mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.015, 18), black, 0, 0, 0));
    const cone = mesh(new THREE.ConeGeometry(0.12, 0.32, 14), black, 0, 0.16, 0);
    cone.rotation.z = 0.12;
    group.add(cone);
    group.add(mesh(new THREE.CylinderGeometry(0.122, 0.122, 0.035, 14), lambert(D.stocking), 0, 0.03, 0));
    group.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.12, 8), lambert(0xf4f1ea), 0, -0.2, 0));
    group.add(mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: D.lanterns.glow }), 0, -0.12, 0));
    group.add(wireLine([[0, 0.3, 0], [0, 0.3 + D.hatString, 0]], D.webColor));
    return group;
}

/** Mummy wrappings for our mailbox (house.js draws its arched box on the
 *  post's plank), round its arch, with googly eyes on its door. */
function mummyMailbox(m, D) {
    const group = new THREE.Group();
    const at = mailboxSpot(m);
    const gauze = lambert(D.mummy);
    [-0.19, -0.09, 0.01, 0.11, 0.2].forEach((dz, k) => {
        const band = new THREE.Mesh(new THREE.ExtrudeGeometry(mailboxShape(0.012), { depth: 0.035, bevelEnabled: false, curveSegments: 10 }), gauze);
        band.position.set(at.x, at.y, at.z + dz - 0.0175);
        band.rotation.z = (k % 2 ? 1 : -1) * 0.07;
        group.add(band);
    });
    const front = at.z + MAILBOX.long / 2 + 0.02;
    for (const s of [-1, 1]) {
        group.add(mesh(new THREE.SphereGeometry(0.032, 10, 8), lambert(0xffffff), at.x + s * 0.05, at.y + MAILBOX.side - 0.01, front));
        group.add(mesh(new THREE.SphereGeometry(0.016, 8, 6), lambert(D.black), at.x + s * 0.05 + 0.008, at.y + MAILBOX.side - 0.02, front + 0.025));
    }
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

    // A witch who flew headfirst into our hedge (Steve's M6 QA: her legs
    // out of the maple's trunk were "in a weird spot"). The stretchy cobweb
    // that was along the hedge's top is gone too ("don't look right").
    const hedgeWall = Y.walls.find((w) => w.axis === 'x' && w.height >= 1.2);
    if (hedgeWall) {
        const witch = hedgeWitch(D);
        witch.position.set(hedgeWall.at - 0.45, hedgeWall.height, D.witch.z);
        group.add(witch);
    }

    // ON OUR LAWN, each on the box the sim knows it by (yardDecorBoxes): the
    // lanterns along the walk and the pumpkin stacks.
    if (D.lanterns) {
        for (const x of D.lanterns.xs) {
            for (const z of D.lanterns.zs) {
                const lamp = lantern(D.lanterns, black);
                lamp.position.set(x, 0, z);
                lamp.name = 'lantern';
                group.add(lamp);
            }
        }
    }
    for (const t of D.towers || []) {
        const stack = new THREE.Group();
        stack.name = 'pumpkins';
        const pile = towerStack(t, D);
        // Ribbed (house.js), each turned its own way, the stem on the top one.
        pile.forEach((p, k) => {
            const spec = D.towerPumpkins[k];
            stack.add(ribbedPumpkin(p, { ...spec, stem: k === pile.length - 1, turn: (p.x * 7.1 + p.y * 3.3) % (Math.PI * 2) }));
        });
        group.add(stack);
    }
    // Our graves before the window right of the porch (2026-10-08): slate
    // stones, each with a mound of earth, on their boxes.
    if (D.ourGraves) {
        const slate = lambert(D.ourGraves.stone);
        const earth = lambert(D.soil);
        const ourRip = ripTexture(D.ink);
        const M = D.ourGraves.mound;
        for (const g of D.ourGraves.list) {
            const stone = tombstone(g.kind, slate, ourRip);
            stone.position.set(g.x, 0, g.z);
            stone.rotation.set(0, g.turn || 0, g.tilt || 0);
            stone.name = 'tombstone';
            group.add(stone);
            const mound = mesh(gravePlot(M), earth, g.x, 0, g.z + 0.16 + M.d / 2, true);
            mound.name = 'grave';
            group.add(mound);
        }
    }
    // A clown in our far right window, peeking in from its edge.
    let clown = null;
    const P = D.clown;
    const clownRoom = P && roomTexture(P, WINDOW_FACES.clown.h);
    const clownMap = P && clownTexture(P);
    if (clownRoom && clownMap) {
        const x = (H.minX + H.maxX) / 2 + OUR_WINDOWS.xs[P.window];
        const pane = (material, z) => mesh(new THREE.PlaneGeometry(OUR_WINDOWS.w - 0.14, OUR_WINDOWS.h - 0.14), material, x, OUR_WINDOWS.y, z);
        group.add(pane(new THREE.MeshBasicMaterial({ map: clownRoom }), front + 0.098));
        clown = pane(new THREE.MeshBasicMaterial({ map: clownMap, alphaTest: 0.5 }), front + 0.1);
        clown.name = 'clown';
        group.add(clown);
    }

    // The skeletons: breaking out of the lawn, raking, and peeking over the
    // hedge.
    const SK = D.skeletons || {};
    if (SK.riser) {
        const riser = risingSkeleton(D);
        riser.position.set(SK.riser.x, 0, SK.riser.z);
        riser.rotation.y = SK.riser.turn || 0;
        riser.name = 'skeleton';
        group.add(riser);
    }
    if (SK.raker) {
        const raker = rakingSkeleton(D);
        raker.position.set(SK.raker.x, 0, SK.raker.z);
        raker.name = 'skeleton';
        group.add(raker);
    }
    const hedgeLine = Y.walls.find((w) => w.axis === 'x' && w.height >= 1.2);
    if (SK.peeker && hedgeLine) {
        const peeker = peekingSkeleton(D);
        // Its fingers just short of the hedge's wall, over our lawn's side.
        peeker.position.set(hedgeLine.at - 0.12, hedgeLine.height, SK.peeker.z);
        peeker.name = 'skeleton';
        group.add(peeker);
    }

    // Witch hats floating under our maple, each with a candle.
    const hats = (D.hats || []).map((h, k) => {
        const hat = floatingHat(D, black);
        hat.position.set(h.x, h.y, h.z);
        hat.rotation.y = k * 1.3;
        group.add(hat);
        return { hat, h, k };
    });
    // The mailbox, wrapped as a mummy.
    const mailbox = (Y.boxes || []).find((b) => b.name === 'mailbox');
    if (mailbox) {
        const mummy = mummyMailbox(mailbox, D);
        mummy.name = 'mummy-mailbox';
        group.add(mummy);
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

    // A masked figure standing still in his left window, now and then gone.
    let watcher = null;
    const W = D.watcher;
    const room = W && watcherTexture(W, false);
    const figure = W && watcherTexture(W, true);
    if (room && figure) {
        const at = neighborWindows(config.neighbor.door.x)[W.window];
        const pane = (map, z) => mesh(new THREE.PlaneGeometry(0.96, 1.36), new THREE.MeshBasicMaterial({ map }), at, 1.75, z);
        const empty = pane(room, hisFront + 0.098);
        empty.name = 'watcher-room';
        group.add(empty);
        watcher = pane(figure, hisFront + 0.1);
        watcher.name = 'watcher';
        group.add(watcher);
    }

    // A little ghost by his windows.
    const ghost = hangingGhost(D.ghost.tall, black, D.sheet, D.webColor, D.ghost.string);
    ghost.position.set(D.ghost.x, eave.y + 0.05, hisFront + 0.55);
    group.add(ghost);

    // His inflatable jack-o-lantern, swaying a little (a box the sim knows,
    // theirDecorBoxes).
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
        if (watcher) watcher.visible = watcherThere(time, W);
        // Sliding the clown's picture to the right puts him out past the
        // window's edge; under reduced motion he simply comes and goes.
        if (clown) {
            const peek = clownPeek(time, P);
            const shown = motion < 0.5 ? (peek > 0.5 ? 1 : 0) : peek;
            clown.material.map.offset.x = -0.55 * (1 - shown);
            clown.visible = shown > 0;
        }
        hats.forEach(({ hat, h, k }) => {
            hat.position.y = h.y + 0.06 * motion * Math.sin(time * 0.9 + k * 2);
            hat.rotation.y = k * 1.3 + 0.2 * motion * Math.sin(time * 0.5 + k);
        });
        bigGhost.rotation.z = 0.04 * motion * Math.sin(time * 0.7 + 2);
        littleGhosts.forEach((g, k) => { g.rotation.z = 0.15 * motion * Math.sin(time * (0.8 + k * 0.17) + k); });
        // Now and then the spider's front legs twitch.
        const twitch = motion * 0.12 * Math.max(0, Math.sin(time * 0.7)) * Math.sin(time * 9);
        crawler.legs.forEach((leg, k) => { leg.rotation.y = k % 4 === 0 ? twitch : 0; });
    }
    // Everything that moves starts where it moves, not at the origin.
    update(0, 1);
    return { group, update };
}

