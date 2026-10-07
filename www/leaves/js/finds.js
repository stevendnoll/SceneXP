// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * finds.js - things lost under the leaves (M6): a set of car keys, a garden
 * gnome, a dog's tennis ball, a $20 bill, and in Halloween week a plastic
 * skeleton hand.
 *
 * NOTHING POINTS AT THEM. Each round hides every find at a fresh spot where
 * the leaves cover it, and a visitor comes across one by clearing the lawn
 * over it. Only then does it show, rising out of the grass as the last
 * leaves blow off it, with its name under the HUD and a sentence for a
 * screen reader. The end card lists what was found, and so does the share.
 *
 * "COVERED" IS MEASURED, NOT ASSUMED. A find is a disc on the lawn, and the
 * share of it that shows is the share of points across that disc no resting
 * leaf lies over (a leaf hides the ground within `leafReach` of its size of
 * its middle). A find is only hidden where almost none of it shows, and it
 * is found once most of it does. Counting leaves would not do: at the
 * shipped count about half of the sim's cells hold no leaf at all, and the
 * lawn still looks buried, because a leaf is wider than a cell.
 *
 * THE LEAVES DO NOT KNOW THE FINDS ARE THERE. They are low and flat (the
 * gnome is lying down) and appear only once the leaves over them are gone,
 * so the sim's rules are untouched.
 *
 * The placing and the finding are pure and measured under Node with the
 * real sim. buildFindModels() is the drawing.
 */
import { makeRandom, inBox, solidBoxes } from './sim.min.js';

const TAU = Math.PI * 2;
const inRect = (r, x, z, m = 0) => x >= r.minX - m && x <= r.maxX + m && z >= r.minZ - m && z <= r.maxZ + m;

// ---- Which, where, and whether they show (pure) -------------------------------

/** The finds out this visit: Halloween's only in Halloween week. */
export function findsFor(F, halloween) {
    return F.list.filter((f) => !f.halloween || halloween);
}

/** Whether a resting leaf lies over the ground at (x, z). */
export function coveredAt(sim, x, z, reach) {
    const b = sim.bounds;
    const ix = Math.floor((x - b.minX) / sim.cell);
    const iz = Math.floor((z - b.minZ) / sim.cell);
    // The biggest leaf reaches 0.15 m, which is within two cells.
    for (let dz = -2; dz <= 2; dz++) {
        const cz = iz + dz;
        if (cz < 0 || cz >= sim.nz) continue;
        for (let dx = -2; dx <= 2; dx++) {
            const cx = ix + dx;
            if (cx < 0 || cx >= sim.nx) continue;
            for (let j = sim.cellHead[cz * sim.nx + cx]; j !== -1; j = sim.cellNext[j]) {
                const r = reach * sim.size[j];
                const ex = sim.px[j] - x;
                const ez = sim.pz[j] - z;
                if (ex * ex + ez * ez < r * r) return true;
            }
        }
    }
    return false;
}

/** The points a find's disc is judged at: its middle and two rings. */
function footprint(r) {
    const points = [[0, 0]];
    for (let k = 0; k < 6; k++) points.push([Math.cos((k * TAU) / 6) * r * 0.5, Math.sin((k * TAU) / 6) * r * 0.5]);
    for (let k = 0; k < 10; k++) points.push([Math.cos((k * TAU) / 10 + 0.3) * r * 0.9, Math.sin((k * TAU) / 10 + 0.3) * r * 0.9]);
    return points;
}

/** The share of a find's disc (radius `r` at x, z) that no leaf hides. */
export function shownShare(sim, x, z, r, reach) {
    const points = footprint(r);
    let shown = 0;
    for (const [dx, dz] of points) {
        if (!coveredAt(sim, x + dx, z + dz, reach)) shown++;
    }
    return shown / points.length;
}

/**
 * Hide each find in `list` at a spot in one of its areas: on our lawn, off
 * the tarp (it starts clear), out of the patch the opening blow clears
 * (`avoid`), clear of anything solid and of the other finds, and as nearly
 * covered as the tries can find. A find that cannot be
 * hidden this round (no spot where `hidden` or less of it shows) sits the
 * round out rather than lying half in view from the start.
 * Returns [{ id, def, x, z, yaw, shown, found: false }].
 */
export function placeFinds(sim, config, list, seed, tries = 60) {
    const F = config.finds;
    const Y = config.yard;
    const random = makeRandom(seed);
    const solids = solidBoxes(Y);
    const placed = [];
    for (const def of list) {
        let best = null;
        for (let k = 0; k < tries; k++) {
            const area = def.areas[Math.floor(random() * def.areas.length)];
            const x = area.minX + random() * (area.maxX - area.minX);
            const z = area.minZ + random() * (area.maxZ - area.minZ);
            if (!inRect(Y.lawn, x, z, -def.r) || inRect(Y.tarp, x, z, def.r)) continue;
            if (inBox(solids, x, z, def.r + F.clear)) continue;
            if ((F.avoid || []).some((a) => inRect(a, x, z, def.r))) continue;
            if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < F.apart)) continue;
            const shown = shownShare(sim, x, z, def.r, F.leafReach);
            if (!best || shown < best.shown) best = { x, z, shown };
            if (shown <= F.hidden) break;
        }
        if (!best || best.shown > F.hidden) continue;
        placed.push({ id: def.id, def, x: best.x, z: best.z, yaw: random() * TAU, shown: best.shown, found: false });
    }
    return placed;
}

/**
 * Look at every find not yet found: any that now shows `seen` or more is
 * found. Returns the ones found this time (usually none).
 */
export function stepFinds(finds, sim, F) {
    const fresh = [];
    for (const f of finds) {
        if (f.found) continue;
        f.shown = shownShare(sim, f.x, f.z, f.def.r, F.leafReach);
        if (f.shown >= F.seen) {
            f.found = true;
            fresh.push(f);
        }
    }
    return fresh;
}

// ---- The finds themselves (drawing) --------------------------------------------

const lambert = (color) => new THREE.MeshLambertMaterial({ color });
const steel = () => new THREE.MeshStandardMaterial({ color: 0xc9ccd0, metalness: 0.8, roughness: 0.35 });

function part(geometry, material, x, y, z, shadow = true) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    return mesh;
}

/** A key on its side, its bow at the origin and its blade along +x. */
function key(material) {
    const group = new THREE.Group();
    group.add(part(new THREE.CylinderGeometry(0.02, 0.02, 0.005, 14), material, 0, 0.004, 0, false));
    group.add(part(new THREE.BoxGeometry(0.075, 0.004, 0.017), material, 0.055, 0.004, 0, false));
    // The bitting along one edge of the blade.
    for (const x of [0.045, 0.06, 0.075]) group.add(part(new THREE.BoxGeometry(0.007, 0.004, 0.008), material, x, 0.004, 0.011, false));
    return group;
}

/** Car keys: a ring, two keys and a black fob. */
function keysModel() {
    const group = new THREE.Group();
    const metal = steel();
    const ring = part(new THREE.TorusGeometry(0.03, 0.004, 6, 22), metal, 0, 0.004, 0, false);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    const a = key(metal);
    a.position.set(0.025, 0, -0.01);
    a.rotation.y = -0.35;
    group.add(a);
    const b = key(metal);
    b.position.set(0.02, 0.003, 0.02);
    b.rotation.y = 0.5;
    group.add(b);
    const fob = part(new THREE.BoxGeometry(0.035, 0.016, 0.065), lambert(0x1c1d1f), -0.055, 0.008, 0.01);
    fob.rotation.y = 0.3;
    group.add(fob);
    group.add(part(new THREE.CylinderGeometry(0.008, 0.008, 0.003, 12), metal, -0.055, 0.017, 0.01, false));
    return { group, depth: 0.03 };
}

/** A garden gnome lying on his back, his hat toward +x. */
function gnomeModel() {
    const group = new THREE.Group();
    const coat = part(new THREE.CylinderGeometry(0.07, 0.09, 0.2, 12), lambert(0x2f5fa8), 0, 0.085, 0);
    coat.rotation.z = Math.PI / 2;
    group.add(coat);
    const belt = part(new THREE.CylinderGeometry(0.083, 0.083, 0.025, 12), lambert(0x2b2118), -0.02, 0.085, 0);
    belt.rotation.z = Math.PI / 2;
    group.add(belt);
    group.add(part(new THREE.SphereGeometry(0.055, 14, 10), lambert(0xf0c8a0), 0.14, 0.09, 0));
    group.add(part(new THREE.SphereGeometry(0.018, 8, 6), lambert(0xe5a58a), 0.155, 0.145, 0));
    const beard = part(new THREE.ConeGeometry(0.055, 0.12, 12), lambert(0xf4f1ea), 0.07, 0.125, 0);
    beard.rotation.z = Math.PI / 2;
    beard.scale.set(1, 1, 0.8);
    group.add(beard);
    const hat = part(new THREE.ConeGeometry(0.062, 0.17, 12), lambert(0xc23a2b), 0.26, 0.09, 0);
    hat.rotation.z = -Math.PI / 2;
    group.add(hat);
    for (const s of [-1, 1]) group.add(part(new THREE.BoxGeometry(0.06, 0.05, 0.045), lambert(0x4a3020), -0.13, 0.05, s * 0.038));
    // From his boots to the tip of his hat, centered on the find's middle.
    group.position.set(-0.09, 0.006, 0);
    const outer = new THREE.Group();
    outer.add(group);
    return { group: outer, depth: 0.2 };
}

/** A tennis ball, well chewed. */
function ballModel() {
    const group = new THREE.Group();
    const r = 0.045;
    // A hair up, so the seam's ring stays out of the grass.
    const y = r + 0.003;
    group.add(part(new THREE.SphereGeometry(r, 16, 12), new THREE.MeshStandardMaterial({ color: 0xd2de45, roughness: 0.95 }), 0, y, 0));
    const seam = part(new THREE.TorusGeometry(r * 0.99, 0.0035, 4, 28), lambert(0xf4f1ea), 0, y, 0, false);
    seam.rotation.set(0.9, 0.4, 0);
    group.add(seam);
    return { group, depth: 0.1 };
}

/** The bill's face: a pale green note with its corner numbers, drawn on a
 *  canvas, or null where there is no document (under test). */
function billTexture() {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 110;
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#cfd8bf';
    ctx.fillRect(0, 0, 256, 110);
    ctx.strokeStyle = '#4f6b4a';
    ctx.lineWidth = 4;
    ctx.strokeRect(6, 6, 244, 98);
    ctx.lineWidth = 1;
    ctx.strokeRect(14, 14, 228, 82);
    ctx.fillStyle = '#8d9a7e';
    ctx.beginPath();
    ctx.ellipse(128, 55, 30, 36, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#3d5a3a';
    ctx.font = 'bold 26px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText('20', 22, 30);
    ctx.fillText('20', 200, 80);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

/** A $20 bill, a little crumpled: two halves on a gentle fold. */
function billModel() {
    const group = new THREE.Group();
    const map = billTexture();
    const material = new THREE.MeshLambertMaterial({ color: map ? 0xffffff : 0xb9c7a6, map, side: THREE.DoubleSide });
    const w = 0.24;
    const d = 0.105;
    [-1, 1].forEach((s) => {
        const geometry = new THREE.PlaneGeometry(w / 2, d);
        // Each half shows its own half of the note.
        const uv = geometry.attributes && geometry.attributes.uv;
        if (uv && uv.setX) {
            for (let k = 0; k < uv.count; k++) uv.setX(k, s < 0 ? uv.getX(k) * 0.5 : 0.5 + uv.getX(k) * 0.5);
        }
        // Tipped up from the fold, its outer edge resting on the grass.
        const half = part(geometry, material, (s * w) / 4, 0.009, 0, false);
        half.rotation.set(-Math.PI / 2, s * 0.12, 0);
        group.add(half);
    });
    return { group, depth: 0.03 };
}

/** A plastic skeleton hand, palm down, its fingers curled a little. */
function handModel() {
    const group = new THREE.Group();
    const bone = lambert(0xeee8d8);
    group.add(part(new THREE.BoxGeometry(0.075, 0.016, 0.07), bone, 0, 0.012, 0));
    // The wrist's two bones, reaching back.
    for (const z of [-0.015, 0.015]) {
        const arm = part(new THREE.CylinderGeometry(0.008, 0.01, 0.12, 6), bone, -0.1, 0.012, z);
        arm.rotation.z = Math.PI / 2;
        group.add(arm);
    }
    // Four fingers ahead, a thumb out to the side, three bones each.
    const fingers = [[-0.026, 0.06], [-0.009, 0.068], [0.009, 0.064], [0.026, 0.052]];
    fingers.forEach(([z, length]) => {
        let x = 0.04;
        let y = 0.012;
        [0.45, 0.33, 0.22].forEach((share, k) => {
            const l = length * share;
            const bit = part(new THREE.CylinderGeometry(0.0055, 0.0065, l, 6), bone, x + l / 2, y + k * 0.004, z);
            bit.rotation.z = Math.PI / 2 - k * 0.25;
            group.add(bit);
            x += l * 0.95;
            y += 0.002;
        });
    });
    const thumb = part(new THREE.CylinderGeometry(0.006, 0.007, 0.05, 6), bone, 0.01, 0.012, 0.055);
    thumb.rotation.set(Math.PI / 2, 0, 0.5);
    group.add(thumb);
    // From the wrist to the fingertips, centered on the find's middle.
    group.position.x = 0.027;
    const outer = new THREE.Group();
    outer.add(group);
    return { group: outer, depth: 0.04 };
}

const MODELS = { keys: keysModel, gnome: gnomeModel, ball: ballModel, bill: billModel, hand: handModel };

/**
 * One model per find in `list`, each a group standing on the ground at its
 * middle, hidden: { [id]: { group, depth } }. `depth` is how far below the
 * lawn it waits, so it can rise out of it.
 */
export function buildFindModels(list) {
    const out = {};
    for (const def of list) {
        const make = MODELS[def.id];
        if (!make) continue;
        const model = make();
        model.group.name = `find-${def.id}`;
        model.group.visible = false;
        out[def.id] = model;
    }
    return out;
}
