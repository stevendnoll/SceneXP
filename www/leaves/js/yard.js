// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * yard.js - the front yard the leaves fall in: the lawn, the house, the
 * neighbor's yard past a picket fence, the hedge, the sidewalk and the
 * street, the tarp, and the low autumn sun.
 *
 * The ground is plain planes in the right places, sized to the walls the
 * sim already knows about (config.yard.walls). The houses and the street
 * are house.js's (M5), the trees trees.js's.
 */
import { buildOurHouse, buildNeighborHouse, buildStreet, buildStreetHouse, facadeZ } from './house.min.js';
import { buildHedge } from './hedge.min.js';

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

/** The sky (M5): deeper blue at the top of the view and paling to a warm
 *  haze by a little under halfway down, stretched over the background. The
 *  camera looks down from the street, so the sky it shows is only the band
 *  over the roofs, at the top of the view: a dome in the world would show
 *  one color there, so the fade is the screen's.
 *
 *  WITH CLOUDS (M6, Steve's QA: "Could we add some clouds to the sky?"):
 *  soft heaps of white in the blue, thinning toward the haze, drawn twice
 *  across the seam so the picture repeats sideways and can drift
 *  (main.js slides it, and sets how much of it a screen's width shows, so
 *  a cloud keeps its shape on any screen). */
function skyTexture(sky, clouds) {
    if (typeof document === 'undefined' || !sky) return null;
    const W = 512;
    const H = 256;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return null;
    const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;
    const fade = ctx.createLinearGradient(0, 0, 0, H);
    fade.addColorStop(0, hex(sky.top));
    fade.addColorStop(0.45, hex(sky.horizon));
    fade.addColorStop(1, hex(sky.horizon));
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, W, H);
    if (clouds) {
        let seed = clouds.seed;
        const random = () => {
            seed = (seed * 16807) % 2147483647;
            return seed / 2147483647;
        };
        for (let c = 0; c < clouds.count; c++) {
            const x0 = random() * W;
            const y0 = clouds.top + random() * (clouds.bottom - clouds.top);
            const size = clouds.size[0] + random() * (clouds.size[1] - clouds.size[0]);
            // Paler and thinner the lower it is, into the haze.
            const alpha = clouds.alpha * (1 - 0.6 * (y0 - clouds.top) / (clouds.bottom - clouds.top));
            const puffs = 6 + Math.floor(random() * 5);
            for (let k = 0; k < puffs; k++) {
                const px = x0 + (random() - 0.5) * size * 2.6;
                // A flat underside, heaped on top.
                const py = y0 - random() * size * 0.7;
                const r = size * (0.45 + random() * 0.55);
                for (const dx of [-W, 0, W]) {
                    const puff = ctx.createRadialGradient(px + dx, py, 0, px + dx, py, r);
                    puff.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
                    puff.addColorStop(0.6, `rgba(255, 255, 255, ${alpha * 0.55})`);
                    puff.addColorStop(1, 'rgba(255, 255, 255, 0)');
                    ctx.fillStyle = puff;
                    ctx.fillRect(px + dx - r, py - r, r * 2, r * 2);
                }
            }
        }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    return texture;
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

/** The neighbor's front door (M2), between his windows: a frame, a dark
 *  hall behind, his step (a platform in config.yard.boxes), and the door
 *  itself hung on a hinge at its left edge. Returns the hinge, which main.js swings open (rotation.y down
 *  to about -1.7, the door swinging out toward the street). */
function buildNeighborDoor(scene, config) {
    const N = config.neighbor;
    // On his set back front wall (house.js facadeZ), his step reaching
    // back to meet it.
    const edge = config.yard.neighbor.minZ;
    const front = facadeZ(edge, config.yard.neighborHouse);
    const width = 1.0;
    const tall = 2.1;
    scene.add(box(1.3, 2.3, 0.06, config.look.trim, N.door.x, 1.15, front + 0.03));
    scene.add(box(width, tall, 0.02, 0x15110d, N.door.x, tall / 2, front + 0.065));
    for (const b of config.yard.boxes || []) {
        if (b.name !== 'step' || N.door.x < b.minX || N.door.x > b.maxX) continue;
        const minZ = b.minZ <= edge + 1e-6 ? front : b.minZ;
        const step = box(b.maxX - b.minX, b.height, b.maxZ - minZ, config.look.porch,
            (b.minX + b.maxX) / 2, b.height / 2, (minZ + b.maxZ) / 2);
        step.castShadow = true;
        step.receiveShadow = true;
        step.userData.solid = true;
        scene.add(step);
    }
    const hinge = new THREE.Group();
    hinge.name = 'neighbor-door';
    hinge.position.set(N.door.x - width / 2, 0, front + 0.08);
    const door = box(width, tall, 0.06, N.look.door, width / 2, tall / 2, 0);
    door.castShadow = true;
    hinge.add(door);
    scene.add(hinge);
    return hinge;
}

/**
 * Every flat piece of ground, as { name, rect, color, y, grass }: our lawn,
 * the neighbor's, the strip along the sidewalk, the sidewalk, the street,
 * and UNDER ALL OF IT THE REST OF THE BLOCK, a lawn reaching well past both
 * neighbors and back behind the houses. The camera slides to keep the
 * person's sides in view and widens to keep the neighbor in frame, and
 * where the ground stopped it showed the sky through the lawn (Steve's M6
 * QA: "an empty blue void around the halfway point of his yard"). Pure, so
 * a test checks the ground covers every view the camera can take.
 */
export function groundRects(config) {
    const Y = config.yard;
    const L = config.look;
    const b = Y.bounds;
    const block = Y.block;
    return [
        { name: 'block', rect: { minX: block.minX, maxX: block.maxX, minZ: block.minZ, maxZ: Y.sidewalk.minZ }, color: L.neighborLawn, y: -0.01, grass: 17 },
        { name: 'lawn', rect: Y.lawn, color: L.lawn, y: 0, grass: 7 },
        { name: 'neighbor-lawn', rect: Y.neighbor, color: L.neighborLawn, y: 0, grass: 11 },
        // The strip of lawn between the yards' edge and the sidewalk.
        { name: 'strip', rect: { minX: b.minX, maxX: b.maxX, minZ: Y.lawn.maxZ, maxZ: Y.sidewalk.minZ }, color: L.lawn, y: 0, grass: 13 },
        { name: 'sidewalk', rect: { minX: block.minX, maxX: block.maxX, minZ: Y.sidewalk.minZ, maxZ: Y.sidewalk.maxZ }, color: L.sidewalk, y: 0.01 },
        { name: 'street', rect: { minX: block.minX - 30, maxX: block.maxX + 30, minZ: Y.sidewalk.maxZ, maxZ: b.maxZ + 40 }, color: L.street, y: -0.02 }
    ];
}

/** The sidewalk's expansion joints: a thin dark line across it every
 *  `every` meters, one instanced mesh. */
function sidewalkJoints(Y, look, every = 1.6) {
    const span = Y.sidewalk.maxZ - Y.sidewalk.minZ;
    const xs = [];
    for (let x = Y.block.minX + every; x < Y.block.maxX; x += every) xs.push(x);
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.03, span),
        new THREE.MeshLambertMaterial({ color: look.sidewalkJoint }), xs.length);
    const m = new THREE.Matrix4();
    const turn = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
    xs.forEach((x, k) => {
        m.makeTranslation(x, 0.012, (Y.sidewalk.minZ + Y.sidewalk.maxZ) / 2).multiply(turn);
        mesh.setMatrixAt(k, m);
    });
    mesh.receiveShadow = true;
    return mesh;
}

/** A lattice of crossed white slats on clear, for the top of the side gate:
 *  one tile, repeated along it. Null where there is no canvas. */
function latticeTexture() {
    if (typeof document === 'undefined') return null;
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return null;
    ctx.clearRect(0, 0, size, size);
    ctx.lineCap = 'square';
    // Each slat drawn twice, offset by a tile, so the tile repeats cleanly.
    const slat = (x0, y0, x1, y1) => {
        for (const d of [-size, 0, size]) {
            ctx.strokeStyle = 'rgba(150,146,138,1)';
            ctx.lineWidth = 9;
            ctx.beginPath();
            ctx.moveTo(x0 + d, y0);
            ctx.lineTo(x1 + d, y1);
            ctx.stroke();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 7;
            ctx.beginPath();
            ctx.moveTo(x0 + d, y0);
            ctx.lineTo(x1 + d, y1);
            ctx.stroke();
        }
    };
    slat(0, 0, size, size);
    slat(size, 0, 0, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
}

/**
 * The side gate between the houses (Steve's QA, 2026-10-08: the fence "just
 * looks like a white rectangle"). White posts with caps at each end and
 * where the picket fence meets it, a run of boards with narrow gaps, a rail,
 * a band of lattice under a capped top rail, and in our half a gate with
 * black strap hinges and a latch. All of it behind the line the leaves bank
 * against (the neighbor's set back face), so it hides none of them. Named
 * 'side-gate'.
 */
export function sideGate(Y, look) {
    const G = Y.gate;
    const group = new THREE.Group();
    group.name = 'side-gate';
    const x0 = Y.house.maxX;
    const x1 = Y.neighborHouse.minX;
    const z = facadeZ(Y.neighbor.minZ, Y.neighborHouse) - G.back;
    const white = new THREE.MeshLambertMaterial({ color: look.fence });
    const black = new THREE.MeshLambertMaterial({ color: look.frame });
    const add = (geometry, material, x, y, zz, shadow = true) => {
        const m = new THREE.Mesh(geometry, material);
        m.position.set(x, y, zz);
        m.castShadow = shadow;
        m.receiveShadow = true;
        group.add(m);
        return m;
    };
    // The middle post stands where the picket fence between the yards ends.
    const picket = Y.walls.find((w) => w.axis === 'x' && w.height < 1.2);
    const mid = picket ? picket.at : (x0 + x1) / 2;
    const p = G.post;
    // The end posts' caps (4 cm wider) stop at the house walls.
    const posts = [x0 + p / 2 + 0.02, mid, x1 - p / 2 - 0.02];
    for (const x of posts) {
        add(new THREE.BoxGeometry(p, G.height + 0.06, p), white, x, (G.height + 0.06) / 2, z);
        add(new THREE.BoxGeometry(p + 0.04, 0.035, p + 0.04), white, x, G.height + 0.075, z);
        const point = add(new THREE.ConeGeometry(p * 0.62, 0.07, 4), white, x, G.height + 0.125, z);
        point.rotation.y = Math.PI / 4;
    }
    // The bands, bottom to top: boards, a rail, lattice, the top rail.
    const boardTop = G.height - G.lattice - G.rail * 2;
    const latticeMap = latticeTexture();
    const panels = [[posts[0] + p / 2, posts[1] - p / 2], [posts[1] + p / 2, posts[2] - p / 2]];
    for (const [a, b] of panels) {
        const w = b - a;
        const n = Math.max(1, Math.round(w / (G.board + G.gap)));
        const bw = w / n - G.gap;
        const boards = new THREE.InstancedMesh(new THREE.BoxGeometry(bw, boardTop - G.lift, G.thick), white, n);
        const m = new THREE.Matrix4();
        for (let k = 0; k < n; k++) {
            m.makeTranslation(a + (k + 0.5) * (w / n), (boardTop + G.lift) / 2, z);
            boards.setMatrixAt(k, m);
        }
        boards.castShadow = true;
        boards.receiveShadow = true;
        group.add(boards);
        add(new THREE.BoxGeometry(w, G.rail, G.thick + 0.02), white, (a + b) / 2, boardTop + G.rail / 2, z);
        add(new THREE.BoxGeometry(w, G.rail, G.thick + 0.02), white, (a + b) / 2, G.height - G.rail / 2, z);
        add(new THREE.BoxGeometry(w + 0.02, 0.025, G.thick + 0.05), white, (a + b) / 2, G.height + 0.0125, z);
        // The lattice, or slats where there is no canvas to draw it.
        const lh = G.height - G.rail - (boardTop + G.rail);
        const ly = boardTop + G.rail + lh / 2;
        if (latticeMap) {
            const tile = latticeMap.clone();
            tile.needsUpdate = true;
            tile.repeat.set(w / lh, 1);
            add(new THREE.PlaneGeometry(w, lh), new THREE.MeshLambertMaterial({ color: look.fence, map: tile, alphaTest: 0.5, side: THREE.DoubleSide }), (a + b) / 2, ly, z, true);
        }
    }
    // The gate is our half: two black strap hinges by the house, a latch
    // and a ring pull by the middle post.
    const [ga, gb] = panels[0];
    const face = z + G.thick / 2 + 0.006;
    for (const y of [G.lift + 0.3, boardTop - 0.3]) {
        add(new THREE.BoxGeometry(0.3, 0.035, 0.012), black, ga + 0.15, y, face, false);
        add(new THREE.BoxGeometry(0.03, 0.08, 0.016), black, ga + 0.01, y, face, false);
    }
    add(new THREE.BoxGeometry(0.12, 0.03, 0.014), black, gb - 0.1, boardTop - 0.45, face, false);
    const ring = add(new THREE.TorusGeometry(0.035, 0.006, 6, 14), black, gb - 0.16, boardTop - 0.52, face + 0.004, false);
    ring.rotation.x = 0.2;
    return group;
}

/**
 * Build the yard into `scene`. Returns { sun, neighborDoor, sky }: the sun
 * for its shadows, the hinge of the neighbor's door for main.js to swing,
 * and the sky's picture (or null), for its clouds to drift.
 */
export function buildYard(scene, config, { shadows = true, mobile = false } = {}) {
    const Y = config.yard;
    const look = config.look;
    const b = Y.bounds;

    for (const g of groundRects(config)) {
        const mesh = ground(g.rect, g.color, g.y, g.grass ? lawnTexture(g.color, look.lawnDark, g.grass) : null);
        mesh.name = g.name;
        scene.add(mesh);
    }
    scene.add(sidewalkJoints(Y, look));

    const tarp = ground(Y.tarp, look.tarp, 0.004, null);
    tarp.name = 'tarp';
    scene.add(tarp);

    scene.add(buildOurHouse(Y, look));
    scene.add(buildNeighborHouse(Y, look, config.neighbor.door.x));
    const neighborDoor = buildNeighborDoor(scene, config);
    scene.add(buildStreet(Y, look));
    for (const h of Y.street || []) scene.add(buildStreetHouse(h, look, Y));
    const sky = skyTexture(look.sky, look.clouds);
    if (sky) scene.background = sky;
    // The gap between the two houses is a side fence and gate, set back with
    // them so it stands behind the leaves resting against the sim's wall.
    scene.add(sideGate(Y, look));

    Y.walls.forEach((wall) => {
        if (wall.axis === 'x' && wall.height < 1.2) {
            const fence = picketFence(wall, look);
            fence.name = 'fence';
            scene.add(fence);
        }
    });
    const hedgeWall = Y.walls.find((w) => w.axis === 'x' && w.height >= 1.2);
    if (hedgeWall) {
        // From the sidewalk all the way back along the property line, past
        // the backs of the houses (Steve's M6 QA: it "ended pretty abruptly"
        // at the front of the house). The sim's wall only needs the part
        // beside the lawn.
        // A clipped hedge, rounded and leafy (hedge.js), no longer a box.
        const back = Y.hedgeBack ?? hedgeWall.from;
        scene.add(buildHedge(hedgeWall, Y.hedgeShape, back, Y.sidewalk.minZ, look));
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
    return { sun, neighborDoor, sky };
}
