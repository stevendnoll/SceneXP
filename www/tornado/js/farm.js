// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * farm.js - the farmstead and the fence line.
 *
 * A white farmhouse, a red barn with its gambrel end to the camera, a silo, a
 * windmill, and a barbed-wire fence across the foreground. The farm stands
 * about 450 m out and the tornado about 1800 m, so the storm is well beyond
 * it: nothing here is in the tornado's path, which is the PRD's promise.
 *
 * SILHOUETTES FIRST. At 450 m the barn is about 30 pixels tall and the house
 * about 20, so what reads is the outline: the gambrel, the gable, the silo's
 * dome, the windmill's wheel. Windows and doors are dark rectangles, there
 * for texture rather than detail.
 *
 * LIT BY THE SCENE'S LIGHTS (MeshStandardMaterial) and hazed by three's fog,
 * which main.js matches to the funnel's own haze. The windmill is the one
 * thing that moves: its head turns into the wind and its wheel spins with it.
 */
import { TORNADO_CONFIG } from './config.min.js';

const lit = (color, roughness = 0.88) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });

let windmill = null;

/** A mesh positioned in one call. */
function place(geometry, material, x, y, z) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    return mesh;
}

/** A shape in the x-y plane pushed `depth` along z, centered on z = 0. */
function extrude(points, depth) {
    const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    geometry.translate(0, 0, -depth / 2);
    return geometry;
}

/** The farmhouse: long side to the camera, a gable roof along its length. */
export function buildHouse(H) {
    const group = new THREE.Group();
    group.name = 'farmhouse';
    const walls = lit(H.wall);
    group.add(place(new THREE.BoxGeometry(H.width, H.eave, H.depth), walls, 0, H.eave / 2, 0));

    // The roof's profile runs front to back, so it is drawn across z and
    // turned a quarter so its length runs along x.
    const o = 0.5;
    const half = H.depth / 2 + o;
    const roof = extrude([[-half, H.eave - 0.15], [half, H.eave - 0.15], [0, H.ridge]], H.width + o * 2);
    roof.rotateY(Math.PI / 2);
    group.add(place(roof, lit(H.roof), 0, 0, 0));

    // A door and three windows on the side facing the camera.
    const dark = lit(H.trim, 0.6);
    const front = H.depth / 2 + 0.03;
    const pane = new THREE.BoxGeometry(1.1, 1.3, 0.06);
    for (const x of [-4, -1.2, 3.8]) group.add(place(pane, dark, x, H.eave * 0.55, front));
    group.add(place(new THREE.BoxGeometry(1.1, 2.2, 0.06), dark, 1.3, 1.1, front));
    group.position.set(H.x, 0, H.z);
    return group;
}

/** The gambrel outline of the barn's end wall, from the ground up. */
export function gambrelProfile(B) {
    const w = B.width / 2;
    const kx = w * 0.62;
    return [[-w, 0], [w, 0], [w, B.eave], [kx, B.knee], [0, B.ridge], [-kx, B.knee], [-w, B.eave]];
}

/** The barn: red walls, a gambrel roof, the big door on the end we see. */
export function buildBarn(B) {
    const group = new THREE.Group();
    group.name = 'barn';
    group.add(place(extrude(gambrelProfile(B), B.depth), lit(B.wall), 0, 0, 0));

    // The roof: a band just outside the upper outline, from eave to eave.
    const w = B.width / 2;
    const kx = w * 0.62;
    const band = [
        [w + 0.45, B.eave - 0.25], [kx + 0.35, B.knee + 0.3], [0, B.ridge + 0.45],
        [-kx - 0.35, B.knee + 0.3], [-w - 0.45, B.eave - 0.25],
        [-w, B.eave], [-kx, B.knee], [0, B.ridge], [kx, B.knee], [w, B.eave]
    ];
    group.add(place(extrude(band, B.depth + 0.8), lit(B.roof), 0, 0, 0));

    const dark = lit(0x241d1a, 0.7);
    const front = B.depth / 2 + 0.03;
    group.add(place(new THREE.BoxGeometry(4.6, 4.2, 0.06), dark, 0, 2.1, front));
    group.add(place(new THREE.BoxGeometry(2.0, 1.8, 0.06), dark, 0, B.knee - 0.6, front));
    // White trim around the big door, the one detail that says "barn".
    const trim = lit(B.trim, 0.8);
    group.add(place(new THREE.BoxGeometry(5.0, 0.25, 0.08), trim, 0, 4.3, front + 0.01));
    group.add(place(new THREE.BoxGeometry(0.25, 4.3, 0.08), trim, -2.4, 2.15, front + 0.01));
    group.add(place(new THREE.BoxGeometry(0.25, 4.3, 0.08), trim, 2.4, 2.15, front + 0.01));
    group.position.set(B.x, 0, B.z);
    return group;
}

export function buildSilo(S) {
    const group = new THREE.Group();
    group.name = 'silo';
    group.add(place(new THREE.CylinderGeometry(S.radius, S.radius, S.height, 24), lit(S.color, 0.7),
        0, S.height / 2, 0));
    group.add(place(new THREE.SphereGeometry(S.radius, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        lit(S.cap, 0.55), 0, S.height, 0));
    group.position.set(S.x, 0, S.z);
    return group;
}

/** A leg between two points, as a thin box. */
function strut(from, to, thickness, material) {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const length = a.distanceTo(b);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(thickness, length, thickness), material);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return mesh;
}

/**
 * The windmill: a lattice tower, and a head that turns into the wind with a
 * wheel of blades and a tail vane. Returns { group, head, wheel }.
 */
export function buildWindmill(M) {
    const group = new THREE.Group();
    group.name = 'windmill';
    const steel = lit(M.color, 0.55);
    const base = 1.3;
    const top = 0.3;
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        group.add(strut([sx * base, 0, sz * base], [sx * top, M.height, sz * top], 0.12, steel));
    }
    // Two rings of bracing, so it reads as a tower rather than four sticks.
    for (const t of [0.35, 0.7]) {
        const r = base + (top - base) * t;
        const y = M.height * t;
        const corners = [[r, r], [r, -r], [-r, -r], [-r, r]];
        corners.forEach(([x, z], i) => {
            const [nx, nz] = corners[(i + 1) % 4];
            group.add(strut([x, y, z], [nx, y, nz], 0.07, steel));
        });
    }

    const head = new THREE.Group();
    head.position.set(0, M.height + 0.3, 0);
    const wheel = new THREE.Group();
    wheel.position.set(0, 0, -0.5);
    const blade = new THREE.BoxGeometry(0.32, M.rotor * 0.62, 0.03);
    for (let i = 0; i < M.blades; i++) {
        const arm = new THREE.Mesh(blade, steel);
        const a = (i / M.blades) * Math.PI * 2;
        const r = M.rotor * 0.62;
        arm.position.set(Math.sin(a) * r, Math.cos(a) * r, 0);
        arm.rotation.z = -a;
        wheel.add(arm);
    }
    wheel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.4, 12).rotateX(Math.PI / 2), steel));
    head.add(wheel);
    // The vane trails downwind, so the wheel faces into it.
    head.add(place(new THREE.BoxGeometry(0.04, 1.2, 2.2), steel, 0, 0.3, 1.6));
    group.add(head);
    group.position.set(M.x, 0, M.z);
    return { group, head, wheel };
}

/** Fence posts along the foreground, and three strands of wire. */
export function buildFence(F) {
    const group = new THREE.Group();
    group.name = 'fence';
    const count = Math.floor((F.to - F.from) / F.spacing) + 1;
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, F.postHeight, 0.12),
        lit(F.post), count);
    const m = new THREE.Matrix4();
    const xs = [];
    for (let i = 0; i < count; i++) {
        const x = F.from + i * F.spacing;
        // A little lean on each post, so the line does not look ruled.
        const lean = Math.sin(i * 12.9898) * 0.04;
        m.makeRotationZ(lean);
        m.setPosition(x, F.postHeight / 2, F.z);
        posts.setMatrixAt(i, m);
        xs.push(x);
    }
    posts.instanceMatrix.needsUpdate = true;
    group.add(posts);

    // The wire sags a little between posts: two segments a span.
    const points = [];
    for (const h of F.wires) {
        for (let i = 0; i < xs.length - 1; i++) {
            const a = xs[i];
            const b = xs[i + 1];
            const mid = (a + b) / 2;
            points.push(a, h, F.z, mid, h - 0.04, F.z, mid, h - 0.04, F.z, b, h, F.z);
        }
    }
    const wire = new THREE.BufferGeometry();
    wire.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    group.add(new THREE.LineSegments(wire, new THREE.LineBasicMaterial({ color: F.wire })));
    return group;
}

/** Build the farm and the fence into `scene`. */
export function initFarm(scene, config = TORNADO_CONFIG) {
    const F = config.farm;
    scene.add(buildHouse(F.house));
    scene.add(buildBarn(F.barn));
    scene.add(buildSilo(F.silo));
    windmill = buildWindmill(F.windmill);
    windmill.angle = 0;
    scene.add(windmill.group);
    scene.add(buildFence(config.fence));
}

/**
 * The windmill's head turns into `wind` ({ x, z, speed }) and its wheel
 * spins with the speed. The spin is accumulated, the one thing in the scene
 * that is: a wheel's angle has no meaning a seek could get wrong.
 */
export function updateFarm(wind, delta, config = TORNADO_CONFIG) {
    if (!windmill) return;
    if (wind.speed > 0.001) {
        // The wheel faces local -z, so -z must point upwind.
        windmill.head.rotation.y = Math.atan2(wind.x, wind.z);
    }
    windmill.angle += wind.speed * config.farm.windmill.spin * Math.max(0, delta);
    windmill.wheel.rotation.z = windmill.angle;
}
