// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * yard.js - the front yard the leaves fall in: the lawn, the house, the
 * neighbor's yard past a picket fence, the hedge, the sidewalk and the
 * street, the tarp, and the low autumn sun.
 *
 * A STAND-IN FOR M0. The lab is about the leaves, so the yard is plain
 * boxes and planes in the right places, sized to the walls the sim already
 * knows about (config.yard.walls). The real street is built once the leaves
 * have passed their test.
 */

/** A grassy canvas texture: mottled greens with short strokes for blades. */
function lawnTexture(base, dark, seed = 1) {
    if (typeof document === 'undefined') return null;
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return null;
    let s = seed;
    const random = () => {
        s = (s * 16807) % 2147483647;
        return s / 2147483647;
    };
    const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;
    ctx.fillStyle = hex(base);
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = hex(dark);
    for (let i = 0; i < 900; i++) {
        ctx.globalAlpha = 0.15 + random() * 0.25;
        ctx.fillRect(random() * size, random() * size, 1 + random() * 3, 1 + random() * 3);
    }
    ctx.lineWidth = 1;
    for (let i = 0; i < 2200; i++) {
        const light = random() < 0.5;
        ctx.strokeStyle = light ? 'rgba(160,190,100,0.35)' : 'rgba(30,50,20,0.3)';
        const x = random() * size;
        const y = random() * size;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (random() - 0.5) * 2, y - 2 - random() * 3);
        ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
    return texture;
}

function box(w, h, d, color, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
    mesh.position.set(x, y, z);
    return mesh;
}

/** A flat rectangle lying on the ground at height y. */
function ground(r, color, y, map) {
    const w = r.maxX - r.minX;
    const d = r.maxZ - r.minZ;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d),
        new THREE.MeshLambertMaterial({ color: map ? 0xffffff : color, map }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((r.minX + r.maxX) / 2, y, (r.minZ + r.maxZ) / 2);
    mesh.receiveShadow = true;
    if (map) map.repeat.set(w / 2, d / 2);
    return mesh;
}

/** A house whose front wall stands at z = front, reaching back `depth`,
 *  with a gable roof whose ridge runs along x. */
function house(h, front, look, siding, withDoor) {
    const group = new THREE.Group();
    const w = h.maxX - h.minX;
    const cx = (h.minX + h.maxX) / 2;
    const cz = front - h.depth / 2;
    const body = box(w, h.wall, h.depth, siding, cx, h.wall / 2, cz);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // The roof: a triangular prism over the walls, with a little overhang.
    const over = 0.35;
    const shape = new THREE.Shape();
    shape.moveTo(-h.depth / 2 - over, 0);
    shape.lineTo(h.depth / 2 + over, 0);
    shape.lineTo(0, h.ridge - h.wall);
    shape.closePath();
    const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: w + over * 2, bevelEnabled: false });
    const roof = new THREE.Mesh(roofGeo, new THREE.MeshLambertMaterial({ color: look.roof }));
    roof.rotation.y = Math.PI / 2;
    roof.position.set(h.minX - over, h.wall, cz);
    roof.castShadow = true;
    group.add(roof);

    // Windows along the front, each with a white frame.
    const windows = withDoor ? [-6.2, -3.4, 2.4, 5.2] : [h.minX + 2.2 - cx, h.minX + 5 - cx];
    windows.forEach((wx) => {
        group.add(box(1.5, 1.3, 0.06, look.trim, cx + wx, 1.75, front + 0.03));
        group.add(box(1.3, 1.1, 0.08, look.window, cx + wx, 1.75, front + 0.04));
    });
    if (withDoor) {
        group.add(box(1.3, 2.3, 0.06, look.trim, cx - 0.5, 1.15, front + 0.03));
        group.add(box(1.0, 2.1, 0.09, look.door, cx - 0.5, 1.05, front + 0.05));
        const step = box(2.2, 0.18, 0.9, 0xbdb7ad, cx - 0.5, 0.09, front + 0.45);
        step.receiveShadow = true;
        group.add(step);
    }
    return group;
}

/** The picket fence along a wall at x = at, from z = from to z = to. */
function picketFence(wall, look) {
    const group = new THREE.Group();
    const material = new THREE.MeshLambertMaterial({ color: look.fence });
    const length = wall.to - wall.from;
    const spacing = 0.13;
    const count = Math.floor(length / spacing);
    const picket = new THREE.BoxGeometry(0.035, wall.height, 0.08);
    const pickets = new THREE.InstancedMesh(picket, material, count);
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
        m.makeTranslation(wall.at, wall.height / 2, wall.from + (i + 0.5) * spacing);
        pickets.setMatrixAt(i, m);
    }
    pickets.castShadow = true;
    pickets.receiveShadow = true;
    group.add(pickets);
    [0.25, wall.height - 0.2].forEach((y) => {
        const rail = box(0.04, 0.07, length, look.fence, wall.at - 0.04, y, (wall.from + wall.to) / 2);
        rail.castShadow = true;
        group.add(rail);
    });
    return group;
}

/**
 * Build the yard into `scene`. Returns { sun } so main.js can size its
 * shadows.
 */
export function buildYard(scene, config, { shadows = true, mobile = false } = {}) {
    const Y = config.yard;
    const look = config.look;
    const b = Y.bounds;

    const lawn = ground(Y.lawn, look.lawn, 0, lawnTexture(look.lawn, look.lawnDark, 7));
    lawn.name = 'lawn';
    scene.add(lawn);
    scene.add(ground(Y.neighbor, look.neighborLawn, 0, lawnTexture(look.neighborLawn, look.lawnDark, 11)));
    // The strip of lawn between the yards' edge and the sidewalk.
    scene.add(ground({ minX: b.minX, maxX: b.maxX, minZ: Y.lawn.maxZ, maxZ: Y.sidewalk.minZ },
        look.lawn, 0, lawnTexture(look.lawn, look.lawnDark, 13)));
    scene.add(ground({ minX: b.minX - 20, maxX: b.maxX + 20, minZ: Y.sidewalk.minZ, maxZ: Y.sidewalk.maxZ },
        look.sidewalk, 0.01, null));
    scene.add(ground({ minX: b.minX - 60, maxX: b.maxX + 60, minZ: Y.sidewalk.maxZ, maxZ: b.maxZ + 40 },
        look.street, -0.02, null));
    // Lawn beyond the hedge, so the left edge of the view is not a cliff.
    scene.add(ground({ minX: b.minX - 30, maxX: b.minX, minZ: b.minZ - 20, maxZ: Y.sidewalk.minZ },
        look.neighborLawn, -0.005, null));

    const tarp = ground(Y.tarp, look.tarp, 0.004, null);
    tarp.name = 'tarp';
    scene.add(tarp);

    scene.add(house(Y.house, Y.lawn.minZ, look, look.siding, true));
    scene.add(house(Y.neighborHouse, Y.neighbor.minZ, look, look.neighborSiding, false));
    // The gap between the two houses is a side fence.
    const gate = box(Y.neighborHouse.minX - Y.house.maxX, 1.8, 0.08, look.fence,
        (Y.house.maxX + Y.neighborHouse.minX) / 2, 0.9, Y.lawn.minZ - 0.05);
    gate.castShadow = true;
    scene.add(gate);

    Y.walls.forEach((wall) => {
        if (wall.axis === 'x' && wall.height < 1.2) scene.add(picketFence(wall, look));
    });
    const hedgeWall = Y.walls.find((w) => w.axis === 'x' && w.height >= 1.2);
    if (hedgeWall) {
        const hedge = box(0.9, hedgeWall.height, hedgeWall.to - hedgeWall.from, look.hedge,
            hedgeWall.at - 0.45, hedgeWall.height / 2, (hedgeWall.from + Y.sidewalk.minZ) / 2);
        hedge.scale.z = (Y.sidewalk.minZ - hedgeWall.from) / (hedgeWall.to - hedgeWall.from);
        hedge.castShadow = true;
        hedge.receiveShadow = true;
        scene.add(hedge);
    }

    // The low autumn sun, and the sky's fill.
    const L = config.lights;
    const sun = new THREE.DirectionalLight(L.sun.color, L.sun.intensity);
    const target = new THREE.Object3D();
    target.position.set((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
    scene.add(target);
    sun.target = target;
    sun.position.set(target.position.x + L.sun.from.x, L.sun.from.y, target.position.z + L.sun.from.z);
    if (shadows) {
        const S = config.shadows;
        sun.castShadow = true;
        const size = mobile ? S.mapSize.mobile : S.mapSize.desktop;
        sun.shadow.mapSize.set(size, size);
        const half = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * 0.62;
        const cam = sun.shadow.camera;
        cam.left = -half;
        cam.right = half;
        cam.top = half;
        cam.bottom = -half;
        cam.near = 1;
        cam.far = 80;
        sun.shadow.bias = S.bias;
        sun.shadow.normalBias = S.normalBias;
    }
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(L.sky.color, L.sky.ground, L.sky.intensity));
    return { sun };
}
