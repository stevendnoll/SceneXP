// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * decorations.js - Halloween decorations, up all October (M6, Steve's QA:
 * "What if we remove the cat and squirrel and add some Halloween
 * decorations?").
 *
 * OURS ARE TASTEFUL, in the house's own black, white and stone: a flight of
 * black paper bats up the white siding beside the porch, warm orange string
 * lights along the porch roof, a cobweb in the porch's corner with a spider
 * on a thread, and three crows on the ridge.
 *
 * THE NEIGHBOR GOES ALL OUT, on purpose, the way his butter yellow house is
 * traditional to our modern one: orange and purple lights along his eaves,
 * a little ghost hanging by his windows, a big inflatable jack-o-lantern
 * and a foam graveyard past his lawn. Those two are the reward for the view
 * widening when he comes out.
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
function bulbMeshes(bulbs, colors) {
    const geometry = new THREE.SphereGeometry(0.035, 8, 6);
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
 *  the roof (+x) to down the post (-y), and threads across them. */
function cobweb(x, y, z, size, color) {
    const spokes = 6;
    const rings = [0.18, 0.34, 0.52, 0.7, 0.88];
    const at = (r, k) => {
        const a = (k / (spokes - 1)) * (Math.PI / 2);
        return [x + Math.cos(a) * r * size, y - Math.sin(a) * r * size, z];
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

/**
 * Every decoration, from config. Returns { group, update(time, motion) }.
 */
export function buildDecorations(config) {
    const D = config.halloween.decor;
    const Y = config.yard;
    const H = Y.house;
    const NH = Y.neighborHouse;
    const front = Y.lawn.minZ;
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

    // A cobweb in the corner of the left post and the porch roof, and a
    // spider on a thread beside it.
    let hanging = null;
    if (posts.length) {
        const left = posts.reduce((a, b) => (a.minX < b.minX ? a : b));
        const z = (left.minZ + left.maxZ) / 2;
        group.add(cobweb(left.maxX, roofY - 0.01, z, D.web, D.webColor));
        hanging = spider(left.maxX + D.web * 0.85, roofY - 0.01, roofY - 0.55, z + 0.05, black, D.webColor);
        group.add(hanging.group);
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
    const eave = { y: NH.wall - 0.17, z: Y.neighbor.minZ + 0.42 };
    const anchors = [];
    for (let x = NH.minX - 0.3; x <= NH.maxX + 0.31; x += (NH.maxX - NH.minX + 0.6) / 6) anchors.push({ x, y: eave.y, z: eave.z });
    const his = stringLights(anchors, D.sag * 0.8, D.bulbEvery);
    group.add(wireLine(his.wire, D.black));
    bulbMeshes(his.bulbs, [D.bulb, D.purple]).forEach((b) => group.add(b));

    // A little ghost by his windows.
    const ghost = hangingGhost(D.ghost.tall, black, D.sheet, D.webColor, D.ghost.string);
    ghost.position.set(D.ghost.x, eave.y + 0.05, Y.neighbor.minZ + 0.55);
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

    // And his foam graveyard.
    const rip = ripTexture(D.ink);
    const foam = lambert(D.foam);
    for (const g of D.graves || []) {
        const stone = tombstone(g.kind, foam, rip);
        stone.position.set(g.x, 0, g.z);
        stone.rotation.set(g.lean || 0, g.turn || 0, g.tilt || 0);
        group.add(stone);
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
    }
    return { group, update };
}

