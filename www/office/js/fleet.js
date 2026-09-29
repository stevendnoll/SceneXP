// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * fleet.js - The things that move out there, as meshes: two ferries, the
 * container ships, the sailboats, the seaplane, the jet, the traffic and
 * its lights, and the wakes behind whatever is under way. life.js says
 * where they are, and world.js puts them there.
 *
 * Each craft is a few boxes merged into one geometry colored by its
 * vertices, built bow toward -z at its true size and then scaled up where
 * life.js says (small craft are a pixel or two at true size). A craft's
 * lit windows are their own mesh with an emissive glow that the evening
 * turns up. Every craft starts hidden and far below the water, so nothing
 * waits at the office's own spot before the clock places it (the "a
 * raycaster meets hidden things" note).
 */

/* global THREE */

import { LIFE, JET, LIVERIES } from './life.min.js';
import { seeded } from './city.min.js';

/**
 * One geometry from a list of boxes, each `[x, y, z, w, h, d, color]` in
 * meters (y from the waterline up, the box's middle), colored per box.
 */
export function boxesGeometry(boxes) {
    const positions = [];
    const normals = [];
    const colors = [];
    const c = new THREE.Color();
    for (const [x, y, z, w, h, d, color] of boxes) {
        const box = new THREE.BoxGeometry(w, h, d).toNonIndexed();
        box.translate(x, y, z);
        c.setHex(color, THREE.SRGBColorSpace);
        positions.push(...box.attributes.position.array);
        normals.push(...box.attributes.normal.array);
        for (let i = 0; i < box.attributes.position.count; i++) colors.push(c.r, c.g, c.b);
        box.dispose();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return g;
}

/** Join geometries (unindexed, with positions, normals and colors) into one. */
export function joinGeometries(parts) {
    const g = new THREE.BufferGeometry();
    for (const [name, size] of [['position', 3], ['normal', 3], ['color', 3]]) {
        const arrays = parts.map((p) => p.attributes[name].array);
        const array = new Float32Array(arrays.reduce((n, a) => n + a.length, 0));
        let at = 0;
        for (const a of arrays) {
            array.set(a, at);
            at += a.length;
        }
        g.setAttribute(name, new THREE.Float32BufferAttribute(array, size));
    }
    return g;
}

const HIDDEN_Y = -10000;

/**
 * A light's glow, for a point sprite: a bright round core fading softly to
 * nothing, as RGBA bytes (white, tinted by each light's own color). A point
 * sprite without one is a square, and at three pixels a jet's lights read
 * as square ones (QA, 2026-09-29). `core` is how much of its radius burns
 * fully; made once.
 */
export const LIGHT_DOT = { size: 32, core: 0.28 };

let dotMade = null;
export function lightDot() {
    if (!dotMade) {
        const n = LIGHT_DOT.size;
        const data = new Uint8Array(n * n * 4);
        for (let j = 0; j < n; j++) {
            for (let i = 0; i < n; i++) {
                const r = Math.hypot((i + 0.5) / n - 0.5, (j + 0.5) / n - 0.5) * 2;
                const fall = Math.max(0, 1 - (r - LIGHT_DOT.core) / (1 - LIGHT_DOT.core));
                const a = r <= LIGHT_DOT.core ? 1 : fall * fall;
                const k = (j * n + i) * 4;
                data[k] = 255;
                data[k + 1] = 255;
                data[k + 2] = 255;
                data[k + 3] = Math.round(255 * a);
            }
        }
        dotMade = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
        dotMade.magFilter = THREE.LinearFilter;
        dotMade.minFilter = THREE.LinearFilter;
        dotMade.generateMipmaps = false;
        dotMade.needsUpdate = true;
    }
    return dotMade;
}

/**
 * A few lights as round glows (lightDot) of `size` pixels whatever the
 * distance, each `[x, y, z, [r, g, b]]` in a craft's own frame; hidden
 * until the evening turns them on. The glow is about twice its bright
 * core, so a size of 6 burns a spot three pixels across.
 */
export function glowPoints(name, points, size = 6) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(points.flatMap((p) => p.slice(0, 3)), 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(points.flatMap((p) => p[3]), 3));
    const lights = new THREE.Points(g, new THREE.PointsMaterial({
        size, sizeAttenuation: false, vertexColors: true, map: lightDot(), transparent: true, depthWrite: false, fog: true, toneMapped: false
    }));
    lights.name = name;
    lights.visible = false;
    lights.raycast = () => {};
    return lights;
}

/** The running lights' colors, in the working (linear) space. */
export const RUNNING = { red: [1, 0.15, 0.1], green: [0.3, 1, 0.45], white: [1, 1, 1], warm: [1, 0.8, 0.5] };

/** A craft: its body, its windows (lit by night), and optionally a wake.
 *  `sided` draws the body from both sides (a sailboat's sails). */
function craft(name, body, windows, { wake = 0, scale = 1, sided = false } = {}) {
    const group = new THREE.Group();
    group.name = name;
    group.rotation.order = 'YXZ';
    const hull = new THREE.Mesh(body, new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.6, metalness: 0.1, side: sided ? THREE.DoubleSide : THREE.FrontSide
    }));
    group.add(hull);
    let lit = null;
    if (windows) {
        lit = new THREE.Mesh(windows, new THREE.MeshStandardMaterial({
            color: 0x28323c, roughness: 0.3, emissive: 0xffd9a0, emissiveIntensity: 0
        }));
        group.add(lit);
    }
    let trail = null;
    if (wake) {
        trail = new THREE.Mesh(wakeGeometry(wake), new THREE.MeshBasicMaterial({
            vertexColors: true, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide
        }));
        trail.name = `${name}-wake`;
        group.add(trail);
    }
    group.scale.setScalar(scale);
    // Its own enlargement, which the binoculars take away (world.js
    // setTrueScale).
    group.userData.scale = scale;
    group.position.y = HIDDEN_Y;
    group.visible = false;
    return { group, lit, trail };
}

/**
 * A wake: two white arms spreading back from the stern of a craft
 * `length` long, fading to nothing behind it, lying on the water. RGBA
 * vertex colors, so the fade is in the geometry.
 */
export function wakeGeometry(length) {
    const back = length * 3;
    const spread = length * 0.9;
    const stern = length / 2;
    const y = 0.3;
    const positions = [];
    const colors = [];
    const arm = (side) => {
        const inner = [side * 2, y, stern];
        const outer = [side * 8, y, stern];
        const farOuter = [side * spread, y, stern + back];
        const farInner = [side * (spread - 20), y, stern + back];
        for (const [p, a] of [[inner, 0.8], [outer, 0.8], [farOuter, 0], [inner, 0.8], [farOuter, 0], [farInner, 0]]) {
            positions.push(...p);
            colors.push(1, 1, 1, a);
        }
    };
    arm(1);
    arm(-1);
    // The churned water right behind the stern.
    for (const [p, a] of [[[-6, y, stern], 0.7], [[6, y, stern], 0.7], [[0, y, stern + back * 0.4], 0]]) {
        positions.push(...p);
        colors.push(1, 1, 1, a);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
    g.computeVertexNormals();
    return g;
}

/** A ferry: navy hull, white decks, a funnel, and two rows of windows each
 *  side. Double-ended, as harbor ferries are. */
function ferry(i) {
    const L = LIFE.ferry.length;
    const body = boxesGeometry([
        [0, 2, 0, 26, 5, L, 0x1f2a3a],
        [0, 7, 0, 25, 5, L * 0.92, 0xf4f5f2],
        [0, 12, 0, 22, 5, L * 0.7, 0xf4f5f2],
        [0, 16, 0, 16, 3, L * 0.22, 0xf4f5f2],
        [0, 21, 0, 5, 8, 7, 0x2e3f58]
    ]);
    const windows = boxesGeometry([
        [12.7, 7.4, 0, 0.4, 1.6, L * 0.86, 0], [-12.7, 7.4, 0, 0.4, 1.6, L * 0.86, 0],
        [11.2, 12.4, 0, 0.4, 1.6, L * 0.64, 0], [-11.2, 12.4, 0, 0.4, 1.6, L * 0.64, 0]
    ]);
    return craft(`ferry-${i}`, body, windows, { wake: L, scale: LIFE.ferry.scale });
}

/** A container ship: a colored hull, rows of containers, and the white
 *  accommodation block and funnel at the stern. */
function ship(i) {
    const L = LIFE.ship.length;
    const hulls = [0x7a2a26, 0x1f3e5a, 0x2d4a3a, 0x333a44];
    const boxes = [
        [0, 3, 0, 40, 12, L, hulls[i % hulls.length]],
        [0, 9.5, -L * 0.47, 30, 3, 14, hulls[i % hulls.length]]
    ];
    const cargo = [0xb33a2e, 0x2f6fa8, 0xe0a33a, 0x3f8f5a, 0xd8d8d0, 0x8a5a9a, 0x2a2f36];
    let n = i * 7;
    for (let row = 0; row < 11; row++) {
        const z = -L * 0.4 + row * 18;
        const tiers = 2 + ((row + i) % 3);
        for (let col = -1; col <= 1; col++) {
            boxes.push([col * 12.5, 9 + tiers * 1.3, z, 12, tiers * 2.6, 16, cargo[n++ % cargo.length]]);
        }
    }
    boxes.push([0, 22, L * 0.4, 34, 26, 22, 0xeef0ee], [0, 38, L * 0.43, 7, 8, 7, 0x2a2f36]);
    // The foremast at the bow, for its masthead light.
    boxes.push([0, 16, -L * 0.44, 1.2, 14, 1.2, 0xd8d8d0]);
    const windows = boxesGeometry([[0, 30, L * 0.4 - 11.2, 30, 1.4, 0.4, 0], [0, 26, L * 0.4 - 11.2, 30, 1.4, 0.4, 0]]);
    const c = craft(`ship-${i}`, boxesGeometry(boxes), windows, { wake: L });
    c.navLights = runningLights(`ship-${i}-lights`, {
        foremast: [0, 23.5, -L * 0.44], mainmast: [0, 43, L * 0.43], wings: [17.5, 33, L * 0.4 - 11], stern: [0, 11, L / 2],
        glow: [[0, 30, L * 0.4 - 11.6], [0, 26, L * 0.4 - 11.6]]
    });
    c.group.add(c.navLights);
    return c;
}

/** The cruise lines' colors: the hull under the white decks, the band at
 *  the waterline, and the funnel and its cap. Made up, not any real
 *  line's. */
export const CRUISE_LIVERIES = [
    { hull: 0x1c2c4c, band: 0x1c2c4c, funnel: 0xf2f3f1, cap: 0x1c2c4c },
    { hull: 0xf2f3f1, band: 0x23395f, funnel: 0x2f64a8, cap: 0x1d1f22 },
    { hull: 0xf2f3f1, band: 0x3a3d42, funnel: 0xb8322a, cap: 0xf2f3f1 }
];

/**
 * A smooth surface through a grid of points, `grid[i][j]` = [x, y, z]: each
 * cell two triangles, colored `colorOf(i, j)` (an sRGB hex), turned to face
 * `outward(point)` (a direction at the triangle's middle), and shaded
 * smooth across the grid (a hull's curve) but not past its edges (a deck's
 * edge). Cells closed to a line (a bow's point) are left out.
 */
export function surfaceGeometry(grid, colorOf, outward) {
    const normals = grid.map((row) => row.map(() => [0, 0, 0]));
    const tris = [];
    for (let i = 0; i + 1 < grid.length; i++) {
        for (let j = 0; j + 1 < grid[i].length; j++) {
            const cell = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
            for (const corners of [[cell[0], cell[1], cell[2]], [cell[0], cell[2], cell[3]]]) {
                const [a, b, c] = corners.map(([r, s]) => grid[r][s]);
                const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
                const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
                let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
                if (Math.hypot(...n) < 1e-9) continue;
                const out = outward([0, 1, 2].map((k) => (a[k] + b[k] + c[k]) / 3));
                const flip = n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0;
                if (flip) n = n.map((x) => -x);
                // Weighted by area (n is unnormalized), so a sliver near
                // the point does not bend its neighbors.
                for (const [r, s] of corners) for (let k = 0; k < 3; k++) normals[r][s][k] += n[k];
                tris.push({ corners: flip ? [corners[0], corners[2], corners[1]] : corners, color: colorOf(i, j) });
            }
        }
    }
    const positions = [];
    const norms = [];
    const colors = [];
    const col = new THREE.Color();
    for (const { corners, color } of tris) {
        col.setHex(color, THREE.SRGBColorSpace);
        for (const [r, s] of corners) {
            positions.push(...grid[r][s]);
            const n = normals[r][s];
            const len = Math.hypot(...n) || 1;
            norms.push(n[0] / len, n[1] / len, n[2] / len);
            colors.push(col.r, col.g, col.b);
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return g;
}

/**
 * A cruise ship's lines, in meters (QA, 2026-09-29: "the front of it" did
 * not look right, a flat wedge ahead of a ten-deck staircase). `beam` wide;
 * the bow is the forward `bow` of its length, curving in to the stem in
 * plan (`entry`, higher is fuller) and narrower at the waterline than at
 * the deck (`flare`); the stem leans `rake` forward from the waterline to
 * the deck, and the deck rises `sheer` toward it from `deck`; the band at
 * the waterline is `band` high, and the transom is `stern` of the beam.
 * The superstructure's front is rounded in plan to `nose` deep and leans
 * back `lean` a deck, with the decks aft terraced `terrace` a deck from
 * the sixth up.
 */
export const CRUISE_LINES = {
    beam: 36, bow: 0.22, entry: 2.4, flare: 0.2, rake: 12, sheer: 4, deck: 13, band: 5, stern: 0.93,
    decks: 10, height: 3.1, front: 0.15, nose: 12, lean: 1.2, terrace: 7
};

/**
 * A cruise ship, bow toward -z: a hull with a raked, flared bow curving in
 * to its stem and the line's band at the waterline running right up to it,
 * a pale deck, ten white decks above with a rounded front (its rows of
 * windows wrapping round) and terraces stepping down toward the stern, a
 * row of cabin windows down each side (lit by night), the bridge wings out
 * over the sides, a row of orange lifeboats, a mast, and the funnel aft,
 * raked and in the line's colors. Also where its running lights go.
 */
export function cruiseParts(livery = CRUISE_LIVERIES[0], L = LIFE.cruise.length) {
    const white = 0xf2f3f1;
    const glass = 0x39424d;
    const S = CRUISE_LINES;
    const W = S.beam;
    const bow = -L / 2;
    const stern = L / 2;
    const bowLen = L * S.bow;
    const stemTop = S.deck + S.sheer;

    // The hull's stations from the stem aft, closer together where the bow
    // curves: at each, its deck height, and where it is along the ship and
    // how far out its side is at a height y.
    const stations = [];
    for (let k = 0; k <= 12; k++) {
        const u = (k / 12) ** 1.5;
        const top = S.deck + S.sheer * (1 - u) ** 2;
        stations.push({
            top,
            z: (y) => {
                const stem = bow + S.rake * (1 - y / stemTop);
                return stem + (bow + bowLen - stem) * u;
            },
            half: (y) => (W / 2) * (1 - (1 - u) ** S.entry) * (1 - S.flare * (1 - u) * (1 - y / top))
        });
    }
    for (const [z, half] of [[stern - 30, W / 2], [stern, (W / 2) * S.stern]]) {
        stations.push({ top: S.deck, z: () => z, half: () => half });
    }
    const levels = (s) => [0, S.band, s.top];
    const hullColor = (i, j) => (j === 0 ? livery.band : livery.hull);
    const parts = [];
    for (const side of [-1, 1]) {
        parts.push(surfaceGeometry(stations.map((s) => levels(s).map((y) => [side * s.half(y), y, s.z(y)])),
            hullColor, () => [side, 0, 0]));
    }
    const aft = stations[stations.length - 1];
    parts.push(surfaceGeometry([-1, 1].map((side) => levels(aft).map((y) => [side * aft.half(y), y, stern])), hullColor, () => [0, 0, 1]));
    parts.push(surfaceGeometry(stations.map((s) => [-1, 1].map((side) => [side * s.half(s.top), s.top, s.z(s.top)])),
        () => 0xbfc3c7, () => [0, 1, 0]));

    // The decks: each a slab rounded in front, its windows a dark band
    // round the nose and a strip down each side.
    const windows = [];
    const frontOf = (d) => bow + L * S.front + d * S.lean + (d === S.decks - 1 ? 14 : 0);
    for (let d = 0; d < S.decks; d++) {
        const y0 = S.deck + d * S.height;
        const y1 = y0 + S.height;
        const front = frontOf(d);
        const back = stern - 5 - Math.max(0, d - 5) * S.terrace;
        const width = d < 8 ? W - 1 : W - 6;
        const R = S.nose;
        // Its outline from the back on the port side, round the nose, and
        // back down the starboard side.
        const nose = [];
        for (let k = 0; k <= 8; k++) {
            const phi = (k / 8) * (Math.PI / 2);
            nose.push([(width / 2) * Math.sin(phi), front + R * (1 - Math.cos(phi))]);
        }
        const outline = [[-width / 2, back, false], ...nose.slice().reverse().map(([x, z]) => [-x, z, true]),
            ...nose.slice(1).map(([x, z]) => [x, z, true]), [width / 2, back, false]];
        const glazed = d < S.decks - 1;
        const rise = [y0, y0 + 1.1, y0 + 2.3, y1];
        parts.push(surfaceGeometry(outline.map(([x, z]) => rise.map((y) => [x, y, z])),
            (i, j) => (glazed && j === 1 && outline[i][2] && outline[i + 1][2] ? glass : white),
            ([x, , z]) => [x, 0, Math.min(0, z - (front + R))]));
        parts.push(surfaceGeometry([-1, 1].map((side) => [y0, y1].map((y) => [side * width / 2, y, back])), () => white, () => [0, 0, 1]));
        parts.push(surfaceGeometry([...nose.map(([x, z]) => [[-x, y1, z], [x, y1, z]]), [[-width / 2, y1, back], [width / 2, y1, back]]],
            () => white, () => [0, 1, 0]));
        if (glazed) {
            for (const side of [-1, 1]) windows.push([side * (width / 2 + 0.2), y0 + 1.7, (front + R + back) / 2, 0.4, 1.2, back - front - R - 4, 0]);
        }
    }
    const boxes = [];
    // The bridge is the eighth deck's glazed front; its wings reach out
    // over the sides just behind it, each with a window looking forward.
    const bridgeY = S.deck + 7 * S.height + 1.6;
    const wingZ = frontOf(7) + S.nose - 2;
    for (const side of [-1, 1]) {
        boxes.push([side * (W / 2 + 0.5), bridgeY, wingZ, 7, 3.2, 6, white]);
        windows.push([side * (W / 2 + 0.5), bridgeY + 0.4, wingZ - 3.1, 6, 1.2, 0.4, 0]);
    }
    // The lifeboats, down each side over the hull.
    for (const side of [-1, 1]) {
        for (let b = 0; b < 9; b++) boxes.push([side * (W / 2 + 0.6), 17.5, bow + L * 0.3 + b * 17, 2.4, 2.6, 10, 0xe8742a]);
    }
    // The mast on the top deck, and the funnel aft, raked, with its cap.
    const top = S.deck + S.decks * S.height;
    const mastZ = frontOf(S.decks - 1) + 6;
    boxes.push([0, top + 5, mastZ, 1.2, 10, 1.2, white]);
    parts.push(boxesGeometry(boxes));
    const funnelZ = stern - L * 0.2;
    const raked = (y0, y1, color) => sweptBox((ix, iy, iz) => {
        const t = (iy ? y1 : y0) / 14;
        return [(ix ? 1 : -1) * (5.5 - t), top + (iy ? y1 : y0), funnelZ + 5 * t + (iz ? 1 : -1) * (11 - 2 * t)];
    }, color);
    parts.push(raked(0, 12, livery.funnel), raked(12, 14, livery.cap));
    return {
        body: joinGeometries(parts),
        windows: boxesGeometry(windows),
        lights: { foremast: [0, 16, -L * 0.42], mainmast: [0, top + 10.5, mastZ], wings: [W / 2 + 4, bridgeY, wingZ], stern: [0, 12, stern] }
    };
}

function cruiseShip(i) {
    const L = LIFE.cruise.length;
    const { body, windows, lights } = cruiseParts(CRUISE_LIVERIES[i % CRUISE_LIVERIES.length]);
    const c = craft(`cruise-${i}`, body, windows, { wake: L, scale: LIFE.cruise.scale });
    c.navLights = runningLights(`cruise-${i}-lights`, lights);
    c.group.add(c.navLights);
    return c;
}

/**
 * A ship's running lights by night, in its own frame (bow toward -z, so its
 * port side, on the left as it sails, is -x): a white masthead light on
 * the foremast and a second, higher one aft (`foremast`, `mainmast`), the
 * red port and green starboard sidelights out on the bridge wings
 * (`wings`, its starboard one), a white stern light, and the warm glow of
 * the lit cabins (`glow`) that the windows alone are too small to show
 * from across the bay.
 */
export function runningLights(name, { foremast, mainmast, wings, stern, glow = [] }) {
    const { red, green, white, warm } = RUNNING;
    const [wx, wy, wz] = wings;
    const lights = glowPoints(name, [
        [...foremast, white], [...mainmast, white], [-wx, wy, wz, red], [wx, wy, wz, green], [...stern, white],
        ...glow.map((p) => [...p, warm])
    ], 6);
    // Each light's arc, as the rules of the road give them (degrees off
    // the bow, starboard positive): the mastheads forward, a sidelight on
    // its own side from dead ahead to abaft the beam, the stern light
    // astern; the cabins all round. Where each sits, to put it back.
    lights.userData.arcs = [[-112.5, 112.5], [-112.5, 112.5], [-112.5, 0], [0, 112.5], [112.5, 247.5], ...glow.map(() => null)];
    lights.userData.at = lights.geometry.attributes.position.array.slice();
    lights.frustumCulled = false;
    return lights;
}

/** Which of a ship's running lights an eye at `bearing` degrees off its bow
 *  (starboard positive) can see, one flag a light. */
export function runningLightsSeen(arcs, bearing) {
    const b = ((bearing % 360) + 360) % 360;
    return arcs.map((arc) => {
        if (!arc) return true;
        const [lo, hi] = arc;
        for (const turn of [-360, 0, 360]) if (b + turn >= lo && b + turn <= hi) return true;
        return false;
    });
}

const HIDE_LIGHT = -1e5;
const eyeLocal = new THREE.Vector3();

/** Show a ship's running lights as they look from `eye` (the camera's
 *  place), the ones it is outside the arc of put out of sight. */
export function aimRunningLights(c, eye) {
    const lights = c.navLights;
    if (!lights || !lights.visible || !c.group.visible) return null;
    c.group.updateMatrixWorld(true);
    eyeLocal.copy(eye);
    c.group.worldToLocal(eyeLocal);
    // Off the bow (-z), toward starboard (+x).
    const bearing = (Math.atan2(eyeLocal.x, -eyeLocal.z) * 180) / Math.PI;
    const seen = runningLightsSeen(lights.userData.arcs, bearing);
    const pos = lights.geometry.attributes.position;
    const at = lights.userData.at;
    seen.forEach((on, i) => pos.setXYZ(i, at[i * 3], on ? at[i * 3 + 1] : HIDE_LIGHT, at[i * 3 + 2]));
    pos.needsUpdate = true;
    return seen;
}

/** A sailboat: a white hull, a mast, a mainsail and a jib, one mesh drawn
 *  from both sides (the sails are single sheets). */
function sailboat(i) {
    const hull = boxesGeometry([[0, 0.8, 0, 3.6, 1.6, 12, 0xf6f6f2], [0, 9, -0.5, 0.25, 16, 0.25, 0xcfd2d4]]);
    const sails = new THREE.BufferGeometry();
    // Main aft of the mast, jib forward of it, both in the boat's middle plane.
    sails.setAttribute('position', new THREE.Float32BufferAttribute([
        0, 2, -0.3, 0, 16.5, -0.3, 0, 2, 4.8,
        0, 2, -0.8, 0, 14, -0.8, 0, 2, -5.6
    ], 3));
    sails.computeVertexNormals();
    const white = new THREE.Color().setHex(0xfbfbf6, THREE.SRGBColorSpace);
    sails.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: 6 }, () => [white.r, white.g, white.b]).flat(), 3));
    return craft(`sailboat-${i}`, joinGeometries([hull, sails]), null, { scale: LIFE.sailboat.scale, sided: true });
}

/** A floatplane: fuselage, high wing, tail and two floats. No livery. */
function seaplane() {
    const body = boxesGeometry([
        [0, 3.2, 0, 1.8, 1.8, 10, 0xf2f2ee],
        [0, 4.3, -0.8, 15, 0.3, 2, 0xf2f2ee],
        [0, 4.2, 4.6, 0.2, 2.2, 1.4, 0xc23a2e],
        [0, 3.4, 4.8, 4.6, 0.2, 1.2, 0xf2f2ee],
        [1.6, 0.6, -0.5, 0.7, 0.7, 8, 0xd9d9d4],
        [-1.6, 0.6, -0.5, 0.7, 0.7, 8, 0xd9d9d4],
        [1.6, 1.8, -0.5, 0.2, 1.8, 0.2, 0x8a8f94],
        [-1.6, 1.8, -0.5, 0.2, 1.8, 0.2, 0x8a8f94]
    ]);
    return craft('seaplane', body, null, { scale: LIFE.seaplane.scale });
}

/** The cars' lights: one point a car, red going away, white coming. */
function carLights(cars) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(cars.length * 3), 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cars.flatMap((c) => (c.red ? [1, 0.18, 0.12] : [1, 0.95, 0.82])), 3));
    const points = new THREE.Points(g, new THREE.PointsMaterial({
        size: 5, sizeAttenuation: false, vertexColors: true, map: lightDot(), transparent: true, depthWrite: false, fog: true, toneMapped: false
    }));
    points.name = 'cars';
    points.visible = false;
    points.frustumCulled = false;
    return points;
}

/** The colors cars come in, most of them white, black, silver and gray. */
export const CAR_COLORS = [0xe9e9e6, 0xe9e9e6, 0x1d1e21, 0x1d1e21, 0xa7abaf, 0xa7abaf, 0x5c6065, 0x243a5e, 0x8e2323, 0x2f5d8a, 0xb5a98f];

/** The colors the buses come in: no operator's livery, only paint. */
export const BUS_COLORS = [0xeef0ee, 0xe6e3da, 0x3a6f8f, 0x3d7358];

const GLASS = 0x1a2027;
const TIRE = 0x141414;
const BUMPER = 0x2a2c30;
const HEADLAMP = 0xf1eee2;
const TAILLAMP = 0xa3221b;

/**
 * A car, built bow toward -z standing on y = 0, in two parts: the paint
 * (white, so each car's own color is all of it) and the trim (the glass
 * all round the cabin, the tires, the bumpers and the lamps). From forty
 * floors up, the dark glass framing a colored roof is what reads as a car
 * (QA, 2026-09-25: the one box a car was "a little more detail" short).
 */
export function carParts() {
    const paint = boxesGeometry([
        [0, 0.56, 0, 1.84, 0.6, 4.4, 0xffffff],
        [0, 1.365, 0.3, 1.44, 0.07, 1.8, 0xffffff]
    ]);
    const trim = boxesGeometry([
        [0, 1.1, 0.25, 1.6, 0.48, 2.4, GLASS],
        [0.83, 0.32, -1.42, 0.26, 0.64, 0.66, TIRE], [-0.83, 0.32, -1.42, 0.26, 0.64, 0.66, TIRE],
        [0.83, 0.32, 1.42, 0.26, 0.64, 0.66, TIRE], [-0.83, 0.32, 1.42, 0.26, 0.64, 0.66, TIRE],
        [0, 0.4, -2.24, 1.8, 0.22, 0.1, BUMPER], [0, 0.4, 2.24, 1.8, 0.22, 0.1, BUMPER],
        [0.6, 0.72, -2.2, 0.4, 0.1, 0.06, HEADLAMP], [-0.6, 0.72, -2.2, 0.4, 0.1, 0.06, HEADLAMP],
        [0.62, 0.76, 2.2, 0.42, 0.1, 0.06, TAILLAMP], [-0.62, 0.76, 2.2, 0.42, 0.1, 0.06, TAILLAMP]
    ]);
    return { paint, trim };
}

/** A city bus, the same way: the paint, and a band of windows down each
 *  side, the windshield under an amber destination sign, and the rest. */
export function busParts() {
    const paint = boxesGeometry([
        [0, 1.8, 0, 2.55, 2.5, 11.8, 0xffffff],
        [0, 3.1, 0.2, 2.35, 0.1, 11, 0xf4f4f4],
        [0, 3.29, 1.5, 1.7, 0.28, 2.8, 0xe6e6e6]
    ]);
    const trim = boxesGeometry([
        [0, 0.45, 0, 2.5, 0.3, 11.7, BUMPER],
        [1.285, 2.2, 0.4, 0.02, 1.0, 9.2, GLASS], [-1.285, 2.2, 0.4, 0.02, 1.0, 9.2, GLASS],
        [0, 2.05, -5.915, 2.3, 1.6, 0.04, GLASS],
        [0, 2.95, -5.915, 1.7, 0.22, 0.04, 0xd9b44a],
        [0, 2.5, 5.915, 1.9, 0.7, 0.04, GLASS],
        [1.18, 0.5, -3.7, 0.3, 1.0, 1.0, TIRE], [-1.18, 0.5, -3.7, 0.3, 1.0, 1.0, TIRE],
        [1.18, 0.5, 3.4, 0.3, 1.0, 1.0, TIRE], [-1.18, 0.5, 3.4, 0.3, 1.0, 1.0, TIRE],
        [0, 0.5, -5.95, 2.5, 0.3, 0.12, BUMPER], [0, 0.5, 5.95, 2.5, 0.3, 0.12, BUMPER],
        [0.9, 0.85, -5.93, 0.4, 0.14, 0.05, HEADLAMP], [-0.9, 0.85, -5.93, 0.4, 0.14, 0.05, HEADLAMP],
        [1.0, 1.0, 5.93, 0.25, 0.4, 0.05, TAILLAMP], [-1.0, 1.0, 5.93, 0.25, 0.4, 0.05, TAILLAMP]
    ]);
    return { paint, trim };
}

/**
 * The vehicles themselves, by day and by night: for each kind, its paint
 * and its trim as two instanced meshes (so all the traffic is four draw
 * calls), each vehicle its own color. `slot[i]` is vehicle i's instance
 * in its kind's meshes. Their lights (carLights) ride on them by night.
 */
function vehicleMeshes(cars) {
    const random = seeded(20260931);
    const c = new THREE.Color();
    // Far below the water until placed, like every craft.
    const away = new THREE.Matrix4().makeTranslation(0, HIDDEN_Y, 0);
    const kinds = { car: { parts: carParts(), colors: CAR_COLORS }, bus: { parts: busParts(), colors: BUS_COLORS } };
    const slot = new Int32Array(cars.length);
    const out = { slot, meshes: [] };
    for (const [kind, { parts, colors }] of Object.entries(kinds)) {
        const mine = cars.map((car, i) => (car.kind === kind ? i : -1)).filter((i) => i >= 0);
        const room = Math.max(1, mine.length);
        const paint = new THREE.InstancedMesh(parts.paint, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.4 }), room);
        const trim = new THREE.InstancedMesh(parts.trim, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.25 }), room);
        mine.forEach((car, k) => {
            slot[car] = k;
            paint.setColorAt(k, c.setHex(colors[Math.floor(random() * colors.length)], THREE.SRGBColorSpace));
            paint.setMatrixAt(k, away);
            trim.setMatrixAt(k, away);
        });
        for (const [mesh, part] of [[paint, 'bodies'], [trim, 'trim']]) {
            mesh.count = mine.length;
            mesh.name = `${kind}-${part}`;
            mesh.frustumCulled = false;
            out.meshes.push(mesh);
        }
        out[kind] = { paint, trim };
    }
    return out;
}

/**
 * A solid between two corners' worth of points: a box whose eight corners
 * are wherever `corner(u, v, w)` puts them (u, v and w each 0 or 1, along
 * x, y and z). A wing or a fin is a box stretched and swept this way. Each
 * of `corner`'s three directions must run the same way as its axis, or the
 * faces turn inside out. Colored `color`, flat shaded.
 */
export function sweptBox(corner, color) {
    const g = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const p = corner(pos.getX(i) > 0 ? 1 : 0, pos.getY(i) > 0 ? 1 : 0, pos.getZ(i) > 0 ? 1 : 0);
        pos.setXYZ(i, p[0], p[1], p[2]);
    }
    g.deleteAttribute('uv');
    g.computeVertexNormals();
    return painted(g, () => color);
}

/** Give a geometry (unindexed) a color per vertex, from its position. */
function painted(g, colorAt) {
    const c = new THREE.Color();
    const pos = g.attributes.position;
    const colors = [];
    for (let i = 0; i < pos.count; i++) {
        c.setHex(colorAt(pos.getX(i), pos.getY(i), pos.getZ(i)), THREE.SRGBColorSpace);
        colors.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return g;
}

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * A wing-like panel from a root section to a tip section. Each section is
 * `{ at, lead, trail, y, thick }`: where it is along the span (x, or y for
 * a fin), its leading and trailing edges (z), and its middle and thickness
 * across the span. `fin` stands it upright.
 */
function panel(root, tip, color, fin = false) {
    const [lo, hi] = root.at < tip.at ? [root, tip] : [tip, root];
    return sweptBox((u, v, w) => {
        if (fin) {
            const s = v ? hi : lo;
            return [s.y + (u - 0.5) * s.thick, s.at, lerp(s.lead, s.trail, w)];
        }
        const s = u ? hi : lo;
        return [s.at, s.y + (v - 0.5) * s.thick, lerp(s.lead, s.trail, w)];
    }, color);
}

// A white airliner all but vanishes against a pale sky, so its belly,
// wings and engines are a shade darker than life, and the fin and winglets
// carry the one strong color.
const JET_WING = 0xaeb4bb;

/**
 * A passenger jet: a twin-engined narrow-body of an everyday airliner's
 * proportions, meters, bow toward -z, its middle on the fuselage's axis.
 * The fuselage is turned from a profile (a round nose, a long parallel
 * cabin, the tail cone swept up), the wings are low and swept with winglets
 * turned up at their tips, the two engines hang ahead of the wings, and the
 * tall fin rises over the tail. Painted in a `livery` (life.js LIVERIES): its
 * fuselage and belly, a stripe along each side, its fin and winglets, and
 * its engines. Every livery paints the same vertices in the same order, so
 * a jet's colors can be swapped for another's (fleet.flyJets).
 */
export function jetParts(livery = LIVERIES[0]) {
    const profile = [
        [0.02, -19.8], [0.7, -19.4], [1.2, -18.6], [1.6, -17.4], [1.85, -15.6], [1.88, -14],
        [1.88, 12], [1.7, 14.5], [1.25, 16.8], [0.75, 18.6], [0.3, 19.8]
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const lathe = new THREE.LatheGeometry(profile, 16);
    lathe.rotateX(Math.PI / 2);
    // The tail cone sweeps up toward the fin.
    const lp = lathe.attributes.position;
    for (let i = 0; i < lp.count; i++) {
        const z = lp.getZ(i);
        if (z > 12) lp.setY(i, lp.getY(i) + (z - 12) * 0.13);
    }
    lathe.computeVertexNormals();
    // The belly under the sides' middle, and the stripe along it (the ring
    // of the fuselage's points at its widest, softened to the next).
    const fuselage = painted(lathe.toNonIndexed(), (x, y) => (y < -0.7 ? livery.belly : Math.abs(y) < 0.35 ? livery.stripe : livery.body));
    fuselage.deleteAttribute('uv');
    const parts = [fuselage];
    for (const side of [-1, 1]) {
        const tipX = side * 17.9;
        parts.push(panel(
            { at: side * 1.7, lead: -3.2, trail: 3.6, y: -1.0, thick: 0.5 },
            { at: tipX, lead: 4.35, trail: 5.75, y: 0.7, thick: 0.14 }, JET_WING));
        // The winglet, turned up from the tip, leaning a little outboard.
        parts.push(sweptBox((u, v, w) => {
            // Across its thickness always toward +x, on either wing.
            const out = (u - 0.5) * 0.12;
            const lean = side * v * 0.35;
            const lead = v ? 5.5 : 4.4;
            const trail = v ? 6.1 : 5.7;
            return [tipX + out + lean, 0.7 + v * 2.4, lerp(lead, trail, w)];
        }, livery.tail));
        parts.push(panel(
            { at: side * 1.0, lead: 13.6, trail: 17.4, y: 0.95, thick: 0.25 },
            { at: side * 7.2, lead: 17.2, trail: 18.4, y: 1.7, thick: 0.1 }, JET_WING));
        // The engine, ahead of and under the wing, on its pylon.
        const engine = new THREE.CylinderGeometry(0.8, 0.95, 4.2, 14).toNonIndexed();
        engine.rotateX(Math.PI / 2);
        engine.translate(side * 5.1, -1.9, -3.9);
        engine.deleteAttribute('uv');
        parts.push(painted(engine, () => livery.engine));
        parts.push(boxesGeometry([[side * 5.1, -1.3, -2.4, 0.25, 0.8, 2.6, JET_WING]]));
    }
    parts.push(panel(
        { at: 1.4, lead: 11.0, trail: 18.6, y: 0, thick: 0.36 },
        { at: 7.6, lead: 15.3, trail: 17.7, y: 0, thick: 0.16 }, livery.tail, true));
    // Its cabin windows, a line down each side, which glow by night.
    const windows = boxesGeometry([
        [1.86, 0.45, -1.5, 0.06, 0.28, 26, 0], [-1.86, 0.45, -1.5, 0.06, 0.28, 26, 0]
    ]);
    return { body: joinGeometries(parts), windows, parts };
}

/**
 * The jet, and its lights: the steady red and green at the wingtips and
 * white at the tail, the white strobes and the red beacons that flash
 * (life.js jetFlashing), and the landing lights ahead of the wings, burning
 * on the approach and the rollout, the brightest thing coming in over the
 * bay. The lights are drawn only by night.
 */
function jet() {
    const { body, windows } = jetParts(LIVERIES[0]);
    const c = craft('jet', body, windows, { scale: JET.scale });
    c.hull = c.group.children[0];
    c.livery = 0;
    const dots = (name, points, size) => {
        const lights = glowPoints(name, points, size);
        c.group.add(lights);
        return lights;
    };
    const { red, green, white } = RUNNING;
    c.navLights = dots('jet-lights', [[-17.9, 0.8, 5.0, red], [17.9, 0.8, 5.0, green], [0, 1.0, 19.9, white]], 6);
    c.strobes = dots('jet-strobes', [[-18.1, 0.8, 5.4, white], [18.1, 0.8, 5.4, white], [0, 2.1, 0, red], [0, -2.1, 0, red]], 7);
    c.landing = dots('jet-landing', [[0, -1.6, -17.5, [1, 0.98, 0.9]]], 12);
    return c;
}

/**
 * Build the fleet into `scene`: two ferries, a pool of three ships (as
 * many as can be in sight at once), the sailboats, the seaplane, the jets
 * and the traffic. Returns them, and `light(level)` to turn the windows and
 * the traffic's lights on for the evening (daylight.js cityLights).
 */
export function buildFleet(scene, cars) {
    const vehicles = vehicleMeshes(cars);
    const fleet = {
        ferries: [ferry(0), ferry(1)],
        ships: [ship(0), ship(1), ship(2)],
        // One for each line's colors; the timetable says which is out.
        cruises: CRUISE_LIVERIES.map((_, i) => cruiseShip(i)),
        sailboats: Array.from({ length: LIFE.sailboat.count }, (_, i) => sailboat(i)),
        seaplane: seaplane(),
        // Enough for the flights that are out at once, and one called by hand.
        jets: Array.from({ length: JET.fleet + 1 }, () => jet()),
        cars: carLights(cars),
        vehicles
    };
    const all = [...fleet.ferries, ...fleet.ships, ...fleet.cruises, ...fleet.sailboats, fleet.seaplane, ...fleet.jets];
    for (const c of all) scene.add(c.group);
    scene.add(fleet.cars, ...vehicles.meshes);
    const matrix = new THREE.Matrix4();
    const turn = new THREE.Quaternion();
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    const at = new THREE.Vector3();
    const size = new THREE.Vector3();
    let lightsOn = false;
    /** Stand every vehicle at its place (life.js carPositions: its middle
     *  at the lanes' height, 1.2 m up) facing along its lane, tilted with
     *  the street by `pitches` when given. */
    fleet.moveCars = (centers, yaws, pitches = null) => {
        for (let i = 0; i < yaws.length; i++) {
            const car = cars[i];
            const { paint, trim } = vehicles[car.kind];
            const k = vehicles.slot[i];
            at.set(centers[i * 3], centers[i * 3 + 1] - 1.2, centers[i * 3 + 2]);
            turn.setFromEuler(euler.set(pitches ? pitches[i] : 0, yaws[i], 0));
            matrix.compose(at, turn, size.fromArray(car.scale));
            paint.setMatrixAt(k, matrix);
            trim.setMatrixAt(k, matrix);
        }
        for (const mesh of vehicles.meshes) mesh.instanceMatrix.needsUpdate = true;
    };
    fleet.light = (level) => {
        for (const c of all) if (c.lit) c.lit.material.emissiveIntensity = level * 1.4;
        lightsOn = level > 0.3;
        fleet.cars.visible = lightsOn;
        for (const c of [...fleet.ships, ...fleet.cruises]) c.navLights.visible = lightsOn;
        for (const jet of fleet.jets) {
            jet.navLights.visible = lightsOn;
            if (!lightsOn) {
                jet.strobes.visible = false;
                jet.landing.visible = false;
            }
        }
    };
    // Each livery's colors for the jet's body, worked out once: a jet taking
    // a new flight takes that flight's colors, the same points in the same
    // order.
    const liveryColors = LIVERIES.map((l) => jetParts(l).body.attributes.color.array);
    /** Fly the jets (life.js jetsAt, each null to hide it), each in its
     *  flight's livery, their strobes lit when `flashing` and their landing
     *  lights while they come in fast, when it is dark enough to see them. */
    fleet.flyJets = (ats, flashing = false) => {
        fleet.jets.forEach((jet, i) => {
            const at = ats[i] || null;
            if (at && Number.isInteger(at.livery) && at.livery !== jet.livery) {
                const color = jet.hull.geometry.attributes.color;
                color.array.set(liveryColors[at.livery]);
                color.needsUpdate = true;
                jet.livery = at.livery;
            }
            place(jet, at);
            jet.strobes.visible = lightsOn && flashing && !!at;
            jet.landing.visible = lightsOn && !!at && at.fast === true;
        });
    };
    return fleet;
}

/** Stand a craft at a place (life.js), or hide it when it is not out. */
export function place(c, at) {
    if (!at) {
        c.group.visible = false;
        c.group.position.y = HIDDEN_Y;
        return;
    }
    c.group.visible = at.out !== false;
    c.group.position.set(at.x, at.y, at.z);
    c.group.rotation.set(at.pitch || 0, at.yaw || 0, at.heel || 0);
    if (c.trail) {
        // A wake at rest is nothing to draw, and would still cost a draw call.
        c.trail.material.opacity = 0.55 * (at.speed || 0);
        c.trail.visible = c.trail.material.opacity > 0.01;
    }
}

/** The window washers' machines: aluminum and white, their hoists dark. */
export const WASHER_COLORS = { frame: 0xd3d6da, panel: 0xeceeef, dark: 0x3f4349, cable: 0x2b2e33 };

/**
 * One gondola, built in its own frame (meters: x along the glass, y up from
 * its deck, z out from the glass), as boxes: the deck, a white front panel
 * under the top rail, the back rail, the end frames and the two hoists the
 * cables run into.
 */
export function gondolaBoxes(width = 7) {
    const { frame, panel, dark } = WASHER_COLORS;
    const half = width / 2;
    return [
        [0, 0, 0, width, 0.2, 0.9, frame],
        [0, 0.6, 0.45, width, 1.0, 0.05, panel],
        [0, 1.12, 0.45, width, 0.08, 0.08, frame],
        [0, 1.12, -0.45, width, 0.08, 0.08, frame],
        [-half, 0.6, 0, 0.12, 1.25, 0.9, frame],
        [half, 0.6, 0, 0.12, 1.25, 0.9, frame],
        [-half + 0.4, 0.45, 0, 0.45, 0.6, 0.5, dark],
        [half - 0.4, 0.45, 0, 0.45, 0.6, 0.5, dark]
    ];
}

/**
 * The machine on the roof, in the same frame with y from the roof: a
 * carriage back from the parapet on its track, its mast, and the jib
 * reaching out over the edge to a head beam as wide as the gondola, `stand`
 * out from the glass and `lift` over the roof.
 */
export function rigBoxes(width = 7, stand = 1.4, lift = 4.6) {
    const { frame, dark } = WASHER_COLORS;
    const back = -4;
    return [
        [0, 1.1, back, 3.2, 2.2, 3.6, frame],
        [0, 0.15, back, 3.8, 0.3, 4.2, dark],
        [0, 3.2, back + 0.8, 0.6, 2.2, 0.6, frame],
        [0, lift, (back + 0.8 + stand) / 2, 0.45, 0.45, stand - back - 0.8, frame],
        [0, lift - 0.1, stand, width + 0.4, 0.35, 0.35, frame]
    ];
}

/**
 * The gondolas and their machines on the faces the crews work (washers.js
 * washerFaces): each a rig on the roof and a gondola under it, and their
 * cables as lines. Returns them and `hang(ats)` to put each where
 * washers.js washerAt says.
 */
export function buildWashers(scene, faces, { width = 7, stand = 1.4, lift = 4.6, parked = 2.4 } = {}) {
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.2 });
    const crews = faces.map((face, i) => {
        const group = new THREE.Group();
        group.name = `washer-${i}`;
        group.position.set(face.x, face.roof, face.z);
        group.rotation.y = face.yaw;
        const rig = new THREE.Mesh(boxesGeometry(rigBoxes(width, stand, lift)), material);
        rig.name = 'washer-rig';
        const gondola = new THREE.Mesh(boxesGeometry(gondolaBoxes(width)), material);
        gondola.name = 'washer-gondola';
        group.add(rig, gondola);
        scene.add(group);
        return { face, group, rig, gondola };
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(faces.length * 4 * 3), 3));
    const cables = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: WASHER_COLORS.cable }));
    cables.name = 'washer-cables';
    cables.frustumCulled = false;
    cables.raycast = () => {};
    scene.add(cables);
    const cable = (i, end, top, bottom) => {
        const p = geometry.attributes.position;
        p.setXYZ(i * 4 + end * 2, top.x, top.y, top.z);
        p.setXYZ(i * 4 + end * 2 + 1, bottom.x, bottom.y, bottom.z);
    };
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    /** Put each gondola `along` its face and `down` from its parked place,
     *  and its rig above it, with the cables between. */
    const hang = (ats) => {
        crews.forEach((crew, i) => {
            const at = ats[i];
            crew.rig.position.set(at.along, 0, 0);
            crew.gondola.position.set(at.along, -parked - at.down, stand);
            crew.group.updateMatrixWorld(true);
            for (const end of [0, 1]) {
                const x = at.along + (end ? 1 : -1) * (width / 2 - 0.4);
                cable(i, end, a.set(x, lift - 0.25, stand).applyMatrix4(crew.group.matrixWorld),
                    b.set(x, 0.75 - parked - at.down, stand).applyMatrix4(crew.group.matrixWorld));
            }
        });
        geometry.attributes.position.needsUpdate = true;
    };
    return { crews, cables, hang };
}

/**
 * The gulls (gulls.js): the whole flock one mesh, two-sided, its points
 * written afresh each frame (a few hundred). `fly(poses, y0, scale)` puts
 * them where gulls.js gullPose says, `scale` times life (gulls.js
 * GULLS.scale when not given); `null` hides them.
 */
export function buildGulls(scene, count, shape, flockTriangles) {
    const n = count * shape.length * 3;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    const colors = new Float32Array(n * 3);
    const c = new THREE.Color();
    for (let g = 0; g < count; g++) {
        shape.forEach(([, hex], t) => {
            c.setHex(hex, THREE.SRGBColorSpace);
            for (let v = 0; v < 3; v++) colors.set([c.r, c.g, c.b], ((g * shape.length + t) * 3 + v) * 3);
        });
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.8, side: THREE.DoubleSide
    }));
    mesh.name = 'gulls';
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.raycast = () => {};
    scene.add(mesh);
    const fly = (poses, y0, scale) => {
        if (!poses) {
            mesh.visible = false;
            return;
        }
        mesh.visible = true;
        flockTriangles(poses, y0, geometry.attributes.position.array, geometry.attributes.normal.array, shape, scale);
        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.normal.needsUpdate = true;
    };
    return { mesh, fly };
}

/** An orca's colors, sRGB: the black, the white of its belly and eye patch,
 *  and the gray saddle behind its fin. */
export const ORCA_COLORS = { black: 0x141517, white: 0xf2f2ee, saddle: 0x6f7378 };

/**
 * One orca, life size, its nose toward -z and its middle at the origin: a
 * body turned on a lathe, flattened a little from side to side, colored by
 * where each point is (the white belly and eye patch, the gray saddle); a
 * dorsal fin, tall and straight on a bull (`bull`), shorter and swept back
 * on the others; the tail flukes and the flippers. One geometry, colored by
 * its vertices.
 */
export function orcaParts(bull = false, L = 7.5) {
    const R = 0.95;
    // The outline from tail to nose, drawn smooth through its points.
    const knots = [[0, -0.5], [0.18, -0.46], [0.3, -0.36], [0.55, -0.22], [0.82, -0.06], [0.95, 0.08],
        [0.92, 0.2], [0.78, 0.32], [0.55, 0.42], [0.25, 0.48], [0, 0.5]];
    const spline = new THREE.SplineCurve(knots.map(([r, y]) => new THREE.Vector2(r, y)));
    const profile = spline.getPoints(28).map((p) => new THREE.Vector2(Math.max(0, p.x) * R, p.y * L));
    const body = new THREE.LatheGeometry(profile, 28).toNonIndexed();
    body.rotateX(-Math.PI / 2);
    body.scale(0.82, 1, 1);
    const c = new THREE.Color();
    const pos = body.attributes.position;
    const colors = [];
    // Each face one color, by where its middle is, so a marking has a clean
    // edge rather than a blend zigzagging across the triangles.
    for (let i = 0; i < pos.count; i += 3) {
        const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
        const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
        const z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3 / L;
        let hex = ORCA_COLORS.black;
        // The belly, white from the chin back past the middle.
        if (y < -0.3 * R && z < 0.2) hex = ORCA_COLORS.white;
        // The eye patch, an oval on each side above and behind the eye.
        const eye = ((z + 0.3) / 0.055) ** 2 + ((y - 0.27 * R) / (0.17 * R)) ** 2;
        if (Math.abs(x) > 0.4 * R && eye < 1) hex = ORCA_COLORS.white;
        // The saddle behind the fin.
        if (y > 0.62 * R && z > 0.06 && z < 0.2) hex = ORCA_COLORS.saddle;
        c.setHex(hex, THREE.SRGBColorSpace);
        for (let k = 0; k < 3; k++) colors.push(c.r, c.g, c.b);
    }
    body.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    body.deleteAttribute('uv');
    // The fins, as thin wedges: `pts` their outline in the plane x = 0.
    const positions = [];
    const fcolors = [];
    c.setHex(ORCA_COLORS.black, THREE.SRGBColorSpace);
    const wedge = (pts, thick, axis = 'x') => {
        const at = (p, s) => (axis === 'x' ? [s * thick, p[0], p[1]] : [p[0], s * thick, p[1]]);
        for (let i = 1; i < pts.length - 1; i++) {
            for (const s of [1, -1]) {
                const tri = [pts[0], pts[i], pts[i + 1]].map((p) => at(p, s));
                if (s < 0) tri.reverse();
                for (const q of tri) {
                    positions.push(...q);
                    fcolors.push(c.r, c.g, c.b);
                }
            }
        }
    };
    const top = 0.82 * R;
    if (bull) wedge([[top, -0.06 * L], [top + 1.8, 0.0 * L], [top, 0.08 * L]], 0.05);
    else wedge([[top, -0.07 * L], [top + 0.7, 0.02 * L], [top + 0.9, 0.08 * L], [top, 0.07 * L]], 0.05);
    // The flukes, flat at the tail, and the flippers, low on the sides.
    wedge([[0, 0.46 * L], [-1.1, 0.56 * L], [0, 0.5 * L], [1.1, 0.56 * L]], 0.04, 'y');
    for (const side of [-1, 1]) {
        const pts = [[side * 0.5, -0.2 * L], [side * 1.4, -0.12 * L], [side * 0.55, -0.1 * L]];
        const flipper = pts.map(([px, pz]) => [px, -0.45 * R, pz]);
        for (const q of flipper) {
            positions.push(...q);
            fcolors.push(c.r, c.g, c.b);
        }
    }
    const fins = new THREE.BufferGeometry();
    fins.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    fins.setAttribute('color', new THREE.Float32BufferAttribute(fcolors, 3));
    fins.computeVertexNormals();
    body.computeVertexNormals();
    return joinGeometries([body, fins]);
}

/**
 * The pod (orcas.js): an orca each, wet-dark and two-sided (their fins are
 * single sheets), and their spouts and splashes as one set of soft white
 * glows. `place(poses, scale, y0)` puts each where orcas.js orcaPose says,
 * `scale` times life; `null` poses hide them.
 */
export function buildOrcas(scene, count, { spoutHeight = 3.5 } = {}) {
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.05, side: THREE.DoubleSide });
    const animals = Array.from({ length: count }, (_, i) => {
        const group = new THREE.Group();
        group.name = `orca-${i}`;
        group.rotation.order = 'YXZ';
        group.add(new THREE.Mesh(orcaParts(i === 0), material));
        group.visible = false;
        group.position.y = HIDDEN_Y;
        scene.add(group);
        return group;
    });
    // Each animal's spout (a column of puffs) and splash (a ring thrown up).
    const PUFFS = 8;
    const DROPS = 14;
    const per = PUFFS + DROPS;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(count * per * 3), 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(count * per * 4), 4));
    const spray = new THREE.Points(g, new THREE.PointsMaterial({
        size: 1.6, sizeAttenuation: true, vertexColors: true, map: lightDot(), transparent: true, depthWrite: false, fog: true
    }));
    spray.name = 'orca-spray';
    spray.visible = false;
    spray.frustumCulled = false;
    spray.raycast = () => {};
    scene.add(spray);
    const place = (poses, scale, y0) => {
        const pos = g.attributes.position.array;
        const col = g.attributes.color.array;
        col.fill(0);
        let any = false;
        animals.forEach((group, i) => {
            const p = poses && poses[i];
            if (!p) {
                group.visible = false;
                group.position.y = HIDDEN_Y;
                return;
            }
            group.visible = p.y + 3 > -1;
            group.position.set(p.x, y0 + p.y * scale, p.z);
            group.rotation.set(p.pitch, p.yaw, p.roll);
            group.scale.setScalar(scale);
            const base = i * per;
            const put = (k, x, y, z, a) => {
                pos[(base + k) * 3] = x;
                pos[(base + k) * 3 + 1] = y;
                pos[(base + k) * 3 + 2] = z;
                col[(base + k) * 4] = 1;
                col[(base + k) * 4 + 1] = 1;
                col[(base + k) * 4 + 2] = 1;
                col[(base + k) * 4 + 3] = a;
            };
            if (p.spout != null) {
                any = true;
                // The blow, from the blowhole ahead of the fin: up fast, then
                // hanging and spreading as it fades.
                const bx = p.x - Math.sin(p.yaw) * 2.2 * scale;
                const bz = p.z - Math.cos(p.yaw) * 2.2 * scale;
                const rise = Math.min(1, p.spout * 2.2);
                for (let k = 0; k < PUFFS; k++) {
                    const f = k / (PUFFS - 1);
                    const spread = (0.2 + 0.8 * p.spout) * f * 0.9 * scale;
                    put(k, bx + Math.sin(k * 2.4) * spread, y0 + (0.5 + spoutHeight * rise * f) * scale, bz + Math.cos(k * 2.4) * spread,
                        0.75 * (1 - p.spout) * (0.6 + 0.4 * f));
                }
            }
            if (p.splash != null) {
                any = true;
                for (let k = 0; k < DROPS; k++) {
                    const a = (k / DROPS) * Math.PI * 2;
                    const out = (1.5 + 4 * p.splash) * scale;
                    const up = Math.sin(Math.PI * p.splash) * 3 * scale;
                    put(PUFFS + k, p.x + Math.cos(a) * out, y0 + up, p.z + Math.sin(a) * out, 0.85 * (1 - p.splash));
                }
            }
        });
        g.attributes.position.needsUpdate = true;
        g.attributes.color.needsUpdate = true;
        spray.visible = any;
    };
    return { animals, spray, place };
}
