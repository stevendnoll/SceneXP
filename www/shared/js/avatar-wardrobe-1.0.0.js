// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * avatar-wardrobe.js - more to wear (Steve's QA, 2026-10-25: "more shoe
 * options... more shirt and pants/shorts/skirt options"), each drawn OVER
 * the rig's own figure the way avatar-figure's boots and sneakers are: the
 * rig's block shoe, its cylinder arms and legs, its slab torso and its
 * collar are found by their tags and measures, and pieces are laid on them
 * in the leg's, the arm's or the person's own coordinates. Nothing here
 * changes a scene's rig.
 *
 *   shoes    crocs, basketball shoes (high tops), hiking boots, cleats
 *   shirts   sweater, turtleneck, jersey, button-down, hoodie (the rig's
 *            long, short and tank top stay avatar-figure's)
 *   bottoms  cargo pants and shorts, sweatpants, leggings, basketball
 *            shorts, a long skirt (the rig's pants, skirt and shorts stay)
 *
 * The block-shoe helpers (`block`, `legParts`, `blockShoes`) moved here from
 * avatar-figure, which imports them back; avatar-figure keeps the rest.
 *
 * Uses the global THREE.
 */

import { solidGrid } from './avatar-shapes-1.0.0.min.js';

// ---- Finding the rig's parts ------------------------------------------------------

/** A box `size` [w, h, d] standing on `y` at depth `z`, named. */
export function block(size, y, z, material, name) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    m.position.set(0, y + size[1] / 2, z);
    m.name = name;
    m.castShadow = true;
    return m;
}

/** A leg's thigh, knee, shin and shoe, as the rig built them (the two
 *  unnamed cylinders, top first; the ball between; the tagged shoe). */
export function legParts(leg) {
    const cylinders = leg.children.filter((m) => m.isMesh && !m.name && m.geometry.type === 'CylinderGeometry')
        .sort((a, b) => b.position.y - a.position.y);
    return {
        thigh: cylinders[0],
        shin: cylinders[1],
        knee: leg.children.find((m) => m.isMesh && !m.name && m.geometry.type === 'SphereGeometry'),
        shoe: leg.children.find((m) => m.userData.isShoe)
    };
}

/** Each block shoe, with its leg and its box's measures. */
export function blockShoes(person) {
    const out = [];
    for (const leg of person.children.filter((o) => o.userData.isLeg)) {
        const parts = legParts(leg);
        if (!parts.shoe || !parts.shoe.isMesh) continue;
        const { width: w, height: h, depth: l } = parts.shoe.geometry.parameters;
        out.push({ leg, ...parts, w, h, l, floor: parts.shoe.position.y - h / 2, z: parts.shoe.position.z });
    }
    return out;
}

/** A shaft round the shin from `y0` up to `y1` (a leg's coordinates),
 *  `over` meters proud of it, its top widened by `flare`. */
export function shaft(shin, y0, y1, over, material, flare = 0) {
    const { radiusTop, radiusBottom, height } = shin.geometry.parameters;
    const low = shin.position.y - height / 2;
    const rAt = (y) => radiusBottom + ((y - low) / height) * (radiusTop - radiusBottom);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rAt(y1) + over + flare, rAt(y0) + over, y1 - y0, 16), material);
    mesh.position.set(shin.position.x, (y0 + y1) / 2, shin.position.z);
    mesh.name = 'shaft';
    mesh.castShadow = true;
    mesh.userData.over = over;
    return mesh;
}

/** The rig's torso (the one slab or box the shirt is), its collar (the
 *  half torus), and the arms with their forearm groups. */
export function bodyParts(person) {
    const torso = person.children.find((o) => o.isMesh && (o.geometry.type === 'ExtrudeGeometry' || o.geometry.type === 'BoxGeometry') && o.position.y > 0.5 && o.position.y < 1.2 && !o.name);
    const collar = person.children.find((o) => o.isMesh && o.geometry.type === 'TorusGeometry');
    const arms = person.children.filter((o) => o.userData.isArm);
    return { torso, collar, arms };
}

const material = (color, roughness = 0.8, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
const shade = (color, k) => new THREE.Color(color).multiplyScalar(k);
/** Whether a display color is light (so trim goes dark on it). */
const isLight = (color) => (((color >> 16) & 255) * 0.299 + ((color >> 8) & 255) * 0.587 + (color & 255) * 0.114) / 255 > 0.6;

// ---- Shoes ------------------------------------------------------------------------

/**
 * Each from the rig's block shoe, in a leg's coordinates:
 *
 *   crocs       a clog: a rounded toe, a thick sole proud all round, a row
 *               of `holes` dark dots over the toes, and a heel strap
 *   highTops    a sneaker up over the ankle: a white sole and toe cap, a
 *               shaft to `rise` with laces up it and a padded collar
 *   hikingBoots a work boot with a thick lugged sole (`lugs` either side),
 *               a darker toe cap, laces and a padded collar in the darker
 *               shade; the boot itself in the shoe's color
 *   cleats      a low shoe on `studs` studs under its sole; the figure is
 *               stood up on them (as on platforms), so they show from the
 *               side and never sink into the floor
 */
export const EXTRA_SHOES = Object.freeze({
    crocs: { sole: 0.016, proud: 0.005, toe: 0.026, holes: 5, hole: 0.0035, strap: 0.006, shade: 0.7 },
    highTops: { rise: 0.07, over: 0.006, sole: 0.02, proud: 0.004, cap: 0.045, laces: 3, white: 0xf2f0ea, trim: 0xd9d6cf },
    hikingBoots: { rise: 0.1, over: 0.008, sole: 0.03, proud: 0.007, lugs: 5, lug: [0.006, 0.012, 0.012], lace: 0xd8c9a8, shade: 0.45 },
    cleats: { sole: 0.012, proud: 0.003, studs: 6, stud: [0.006, 0.012], shade: 0.35 }
});

/** Dress the block shoes as `kind`; returns how far the figure stands up
 *  (the cleats' studs), else 0. */
export function dressExtraShoes(person, kind, color, skin) {
    const spec = EXTRA_SHOES[kind];
    const shoeMat = material(color, 0.6);
    const dark = material(shade(color, spec.shade || 0.6).getHex(), 0.75);
    let lift = 0;
    for (const { shoe, shin, w, h, l, floor, z } of blockShoes(person)) {
        const leg = shoe.parent;
        const top = floor + h;
        if (kind === 'crocs') {
            // The clog: the block a touch lower, a rounded toe, and a thick
            // sole proud all round in a darker shade.
            shoe.scale.y = 0.85;
            shoe.position.y = floor + (h * 0.85) / 2;
            leg.add(block([w + 2 * spec.proud, spec.sole, l + 2 * spec.proud], floor, z, dark, 'sole'));
            const toe = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), shoeMat);
            toe.scale.set(w / 2 + 0.001, (h * 0.85) / 2 + 0.001, spec.toe);
            toe.position.set(0, floor + (h * 0.85) / 2, z + l / 2 - 0.004);
            toe.name = 'toe';
            toe.castShadow = true;
            leg.add(toe);
            // The holes, over the toes, dark.
            const holeMat = material(shade(color, 0.35).getHex(), 1);
            for (let k = 0; k < spec.holes; k++) {
                const a = ((k + 0.5) / spec.holes - 0.5) * Math.PI * 0.8;
                const hole = new THREE.Mesh(new THREE.CylinderGeometry(spec.hole, spec.hole, 0.002, 8), holeMat);
                hole.position.set(Math.sin(a) * w * 0.38, floor + h * 0.85 + 0.0005, z + l * 0.2 + Math.cos(a) * 0.02);
                hole.name = 'hole';
                leg.add(hole);
            }
            // The heel strap: a bar round the back, up at the ankle.
            const strap = block([w + 0.01, spec.strap, 0.005], top - 0.004, z - l / 2 - 0.003, dark, 'strap');
            leg.add(strap);
        } else if (kind === 'highTops') {
            const white = material(spec.white, 0.7);
            leg.add(block([w + 2 * spec.proud, spec.sole, l + 2 * spec.proud], floor, z, white, 'sole'));
            leg.add(block([w + 0.003, h * 0.5, spec.cap], floor, z + l / 2 - spec.cap / 2 + 0.002, white, 'toe-cap'));
            leg.add(shaft(shin, top - 0.004, top + spec.rise, spec.over, shoeMat));
            const r = shin.geometry.parameters.radiusBottom + spec.over;
            const lace = material(spec.trim, 0.8);
            for (let i = 0; i < spec.laces; i++) leg.add(block([0.028, 0.004, 0.006], top + 0.006 + i * (spec.rise - 0.02) / spec.laces, r + 0.002, lace, 'lace'));
            const collar = new THREE.Mesh(new THREE.TorusGeometry(r + 0.001, 0.006, 6, 16), white);
            collar.rotation.x = Math.PI / 2;
            collar.position.y = top + spec.rise;
            collar.name = 'collar';
            leg.add(collar);
        } else if (kind === 'hikingBoots') {
            leg.add(block([w + 2 * spec.proud, spec.sole, l + 2 * spec.proud], floor, z, dark, 'sole'));
            // Lugs along either side of the sole, standing proud of it.
            for (let k = 0; k < spec.lugs; k++) {
                for (const s of [-1, 1]) {
                    const lug = block(spec.lug, floor, z - l / 2 + ((k + 0.5) / spec.lugs) * l, dark, 'lug');
                    lug.position.x = s * (w / 2 + spec.proud + spec.lug[0] / 2 - 0.001);
                    leg.add(lug);
                }
            }
            leg.add(block([w + 0.004, h * 0.55, 0.05], floor + spec.sole - 0.002, z + l / 2 - 0.025, dark, 'toe-cap'));
            leg.add(shaft(shin, top - 0.004, top + spec.rise, spec.over, shoeMat));
            const r = shin.geometry.parameters.radiusBottom + spec.over;
            const lace = material(spec.lace, 0.8);
            for (let i = 0; i < 4; i++) leg.add(block([0.026, 0.004, 0.006], top + 0.012 + i * 0.022, r + 0.002, lace, 'lace'));
            const collar = new THREE.Mesh(new THREE.TorusGeometry(r + 0.002, 0.008, 6, 16), dark);
            collar.rotation.x = Math.PI / 2;
            collar.position.y = top + spec.rise;
            collar.name = 'collar';
            leg.add(collar);
        } else if (kind === 'cleats') {
            leg.add(block([w + 2 * spec.proud, spec.sole, l + 2 * spec.proud], floor - spec.sole, z, dark, 'sole'));
            // The studs under the sole, two rows, the figure stood up on them.
            for (let k = 0; k < spec.studs; k++) {
                const row = k % 2 ? 1 : -1;
                const along = Math.floor(k / 2) / Math.max(1, Math.ceil(spec.studs / 2) - 1);
                const stud = new THREE.Mesh(new THREE.CylinderGeometry(spec.stud[0] * 0.7, spec.stud[0], spec.stud[1], 8), dark);
                stud.position.set(row * w * 0.3, floor - spec.sole - spec.stud[1] / 2, z - l * 0.38 + along * l * 0.76);
                stud.name = 'stud';
                stud.castShadow = true;
                leg.add(stud);
            }
            leg.add(block([w + 0.003, h * 0.45, 0.04], floor, z + l / 2 - 0.02 + 0.002, dark, 'toe-cap'));
            lift = spec.sole + spec.stud[1];
        }
        shoe.material = shoeMat;
    }
    return lift;
}

// ---- Shirts -----------------------------------------------------------------------

/**
 * Each over the rig's slab torso, in the shirt's color:
 *
 *   sweater     knit: a thick ribbed band at the hem and round each wrist,
 *               a crew-neck band in place of the collar, a rough surface
 *   turtleneck  a tall soft collar up the neck, and cuffs
 *   jersey      a V-neck trim, a band round each sleeve and a stripe down
 *               each side, in a contrasting trim (white on a dark shirt,
 *               dark on a light one); short sleeves
 *   buttonDown  the rig's own placket and buttons (`dressShirt`), long
 *               sleeves, and a pointed collar
 *   hoodie      a hood down behind the neck (HOOD), a kangaroo pocket, two
 *               drawstrings, and cuffs
 *   vneck       the collar cut away to a V of skin (`v` wide and deep),
 *               a band of the shirt's darker shade along each edge; short
 *               sleeves
 */
export const SHIRT_SIZE = Object.freeze({
    sweater: { band: 0.035, cuff: 0.03, proud: 0.006, shade: 0.88, neck: 0.012 },
    turtleneck: { collar: 0.075, radius: 0.06, cuff: 0.025, proud: 0.005 },
    jersey: { trim: 0.012, band: 0.03, stripe: 0.016, light: 0xf2f0ea, dark: 0x1f2024 },
    buttonDown: { collar: [0.055, 0.03, 0.006], shade: 0.9 },
    hoodie: { pocket: [0.2, 0.09, 0.012], string: 0.12, cuff: 0.03, proud: 0.006, shade: 0.9 },
    vneck: { v: [0.1, 0.075], band: 0.009, shade: 0.85 }
});

/**
 * The hood, down (Steve's QA, 2026-10-25: the back half of a ball "looks
 * like half of an oval, missing the other half"): one closed solid
 * (solidGrid) of cloth that stands up behind the neck as a rolled collar,
 * folds over the shoulders and lies down the back in a rounded pouch that
 * narrows to the hood's crown, creased down its middle. Its inner surface
 * runs from a ring `rim.r` round the neck, `rim.up` above the shoulders
 * behind the neck and draping down to `rim.front` of that at its ends,
 * `rim.half` radians round from the back, over a fold at `fold` above
 * the shoulders onto the back, `sink` inside the torso's back, down to
 * `drop` below the shoulders; the cloth is `thick(v)` thick down it
 * ([down the hood 0 to 1, meters] points), thinner toward its edges, with a
 * `crease` down the middle. `width` is the pouch's half width down it.
 */
export const HOOD = Object.freeze({
    rim: { r: 0.08, up: 0.05, front: 0.35, half: 1.25 },
    fold: 0.012,
    sink: 0.004,
    drop: 0.175,
    width: [[0, 0.075], [0.3, 0.105], [0.6, 0.098], [1, 0.012]],
    thick: [[0, 0.028], [0.15, 0.036], [0.45, 0.026], [1, 0.01]],
    crease: { depth: 0.3, width: 0.22 },
    grid: [28, 18]
});

/** The styles here whose sleeves are long (the rig covers the forearms in
 *  the shirt). */
export const LONG_SLEEVED = Object.freeze(['sweater', 'turtleneck', 'buttonDown', 'hoodie']);

/** `points` ([x, y] pairs, x rising) read at `x`, straight between them
 *  and flat past the ends. */
function along(points, x) {
    if (x <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
        const [x1, y1] = points[i];
        if (x <= x1) {
            const [x0, y0] = points[i - 1];
            return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
        }
    }
    return points[points.length - 1][1];
}

const smooth = (t) => {
    const x = Math.min(1, Math.max(0, t));
    return x * x * (3 - 2 * x);
};

/**
 * The hood's geometry, in the person's coordinates, for a torso whose
 * shoulders are at `top` and whose back is `back` behind its middle (z).
 * The pouch's last stretch rounds off to the crown.
 */
export function hoodGeometry(top, back) {
    const H = HOOD;
    const [nu, nv] = H.grid;
    const width = (v) => (v < 0.6 ? along(H.width, v) : 0.012 + (along(H.width, 0.6) - 0.012) * Math.sqrt(Math.max(0, 1 - ((v - 0.6) / 0.4) ** 2)));
    const inner = (u, v) => {
        // The rim ring round the neck, the fold over the shoulders, the
        // back: a curve through the three in height and depth, and the
        // pouch's width across.
        const a = u * H.rim.half;
        const rimX = H.rim.r * Math.sin(a);
        const rimZ = -H.rim.r * Math.cos(a);
        const backZ = -back - H.sink;
        const blend = smooth(v / 0.3);
        const droop = 1 - (1 - H.rim.front) * Math.abs(u) ** 1.5;
        const A = [top + H.rim.up * droop, rimZ];
        const B = [top + H.fold, backZ - 0.03];
        const C = [top - H.drop, backZ];
        const w = 1 - v;
        const y = w * w * A[0] + 2 * w * v * B[0] + v * v * C[0];
        const z = w * w * A[1] + 2 * w * v * B[1] + v * v * C[1];
        const x = rimX + (u * width(v) - rimX) * blend;
        return [x, y, z];
    };
    const thick = (u, v) => {
        const across = 1 - 0.65 * u ** 4;
        const crease = 1 - H.crease.depth * smooth((v - 0.2) / 0.25) * Math.exp(-((u / H.crease.width) ** 2));
        return along(H.thick, v) * across * crease;
    };
    const normal = (u, v) => {
        const h = 1e-3;
        const p = (du, dv) => inner(Math.max(-1, Math.min(1, u + du)), Math.max(0, Math.min(1, v + dv)));
        const [ax, ay, az] = p(h, 0);
        const [bx, by, bz] = p(-h, 0);
        const [cx, cy, cz] = p(0, h);
        const [dx, dy, dz] = p(0, -h);
        const du = [ax - bx, ay - by, az - bz];
        const dv = [cx - dx, cy - dy, cz - dz];
        let n = [du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]];
        const len = Math.hypot(...n) || 1;
        n = n.map((k) => k / len);
        // Away from the body: out from the neck's axis, which every part of
        // the sheet stands round (the roll) or behind (the back).
        const [px, , pz] = inner(u, v);
        if (n[0] * px + n[2] * pz < 0) n = n.map((k) => -k);
        return n;
    };
    return solidGrid(nu, nv, (i, j, side) => {
        const u = (i / nu) * 2 - 1;
        const v = j / nv;
        const p = inner(u, v);
        if (!side) return p;
        const n = normal(u, v);
        const t = thick(u, v);
        return [p[0] + n[0] * t, p[1] + n[1] * t, p[2] + n[2] * t];
    });
}

/** A ring round a forearm's wrist end (an arm's forearm group), `thick` tall. */
function cuff(arm, thick, proud, mat) {
    const fore = arm.userData.forearm;
    const forearm = fore.children.find((m) => m.isMesh && m.geometry.type === 'CylinderGeometry');
    const { radiusTop, height } = forearm.geometry.parameters;
    const r = radiusTop * forearm.scale.x + proud;
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.96, thick, 12), mat);
    ring.position.set(forearm.position.x, forearm.position.y - height / 2 + thick / 2 + 0.004, forearm.position.z);
    ring.name = 'cuff';
    ring.castShadow = true;
    fore.add(ring);
    return ring;
}

/** Dress the torso as `style` (SHIRT_SIZE); `skin` is the figure's skin
 *  material, for a V-neck's opening. */
export function dressShirt(person, style, color, skin = null) {
    const spec = SHIRT_SIZE[style];
    const { torso, collar, arms } = bodyParts(person);
    if (!torso) return;
    const { width, height, depth } = torsoBox(torso);
    const top = torso.position.y + height / 2;
    const bottom = torso.position.y - height / 2;
    const front = depth / 2;
    const shirt = material(color, 0.85);
    const darker = material(shade(color, spec.shade || 0.88).getHex(), 0.9);
    const add = (mesh, name) => {
        mesh.name = name;
        mesh.castShadow = true;
        person.add(mesh);
        return mesh;
    };
    if (style === 'sweater') {
        torso.material.roughness = 1;
        for (const arm of arms) cuff(arm, spec.cuff, spec.proud, darker);
        const band = add(new THREE.Mesh(new THREE.BoxGeometry(width + 2 * spec.proud, spec.band, depth + 2 * spec.proud), darker), 'band');
        band.position.set(0, bottom + spec.band / 2, 0);
        if (collar) collar.visible = false;
        const neck = add(new THREE.Mesh(new THREE.TorusGeometry(0.058, spec.neck, 8, 20), darker), 'neckband');
        neck.rotation.x = Math.PI / 2;
        neck.position.set(0, top - 0.002, 0);
    } else if (style === 'turtleneck') {
        for (const arm of arms) cuff(arm, spec.cuff, spec.proud, shirt);
        if (collar) collar.visible = false;
        const roll = add(new THREE.Mesh(new THREE.CylinderGeometry(spec.radius, spec.radius * 1.05, spec.collar, 16, 1, true), material(color, 0.95, { side: THREE.DoubleSide })), 'turtleneck');
        roll.position.set(0, top + spec.collar / 2 - 0.01, 0);
        const lip = add(new THREE.Mesh(new THREE.TorusGeometry(spec.radius, 0.008, 8, 20), shirt), 'turtleneck');
        lip.rotation.x = Math.PI / 2;
        lip.position.set(0, top + spec.collar - 0.01, 0);
    } else if (style === 'jersey') {
        const trimColor = isLight(color) ? spec.dark : spec.light;
        const trim = material(trimColor, 0.8);
        if (collar) collar.visible = false;
        // The V-neck: two bars spreading up from under the throat (a
        // positive turn about z leans a bar's top toward -x, so the bar on
        // +x turns the other way to open upward: it drew a Λ before,
        // 2026-10-25).
        for (const s of [-1, 1]) {
            const bar = add(new THREE.Mesh(new THREE.BoxGeometry(spec.trim, 0.075, 0.008), trim), 'trim');
            bar.position.set(s * 0.021, top - 0.03, front + 0.004);
            bar.rotation.z = -s * 0.6;
        }
        // A band round each upper arm, and a stripe down each side.
        for (const arm of arms) {
            const upper = arm.children.find((m) => m.isMesh && m.geometry.type === 'CylinderGeometry');
            const { radiusBottom, height: ah } = upper.geometry.parameters;
            const r = radiusBottom * upper.scale.x + 0.003;
            const band = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.02, spec.band, 12), trim);
            band.position.set(upper.position.x, upper.position.y - ah / 2 + spec.band / 2 + 0.002, upper.position.z);
            band.name = 'band';
            band.castShadow = true;
            arm.add(band);
        }
        for (const s of [-1, 1]) {
            const stripe = add(new THREE.Mesh(new THREE.BoxGeometry(0.006, height * 0.82, spec.stripe), trim), 'stripe');
            stripe.position.set(s * (width / 2 + 0.002), torso.position.y - height * 0.05, 0);
        }
    } else if (style === 'buttonDown') {
        // The rig drew the placket and the buttons; a pointed collar over
        // its round one, two wings meeting at the throat.
        if (collar) collar.visible = false;
        for (const s of [-1, 1]) {
            const wing = add(new THREE.Mesh(new THREE.BoxGeometry(spec.collar[0] * 0.6, spec.collar[1], spec.collar[2]), darker), 'collar');
            wing.position.set(s * 0.03, top - spec.collar[1] / 2 + 0.004, front + 0.006);
            wing.rotation.z = -s * 0.55;
        }
    } else if (style === 'hoodie') {
        for (const arm of arms) cuff(arm, spec.cuff, spec.proud, darker);
        if (collar) collar.visible = false;
        // The hood, down: one closed solid from a roll behind the neck
        // over the shoulders and down the back (HOOD).
        add(new THREE.Mesh(hoodGeometry(top, depth / 2), material(color, 0.95)), 'hood');
        // The kangaroo pocket, low on the front; two drawstrings hanging
        // from the neck.
        const pocket = add(new THREE.Mesh(new THREE.BoxGeometry(...spec.pocket), darker), 'pocket');
        pocket.position.set(0, bottom + spec.pocket[1] / 2 + 0.03, front + spec.pocket[2] / 2 - 0.002);
        const stringMat = material(isLight(color) ? 0x55524d : 0xe8e4dc, 0.9);
        for (const s of [-1, 1]) {
            const string = add(new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, spec.string, 6), stringMat), 'drawstring');
            string.position.set(s * 0.03, top - spec.string / 2 - 0.01, front + 0.006);
            const tip = add(new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.012, 6), stringMat), 'drawstring');
            tip.position.set(s * 0.03, top - spec.string - 0.012, front + 0.006);
        }
    } else if (style === 'vneck') {
        if (collar) collar.visible = false;
        const [vw, vd] = spec.v;
        // The opening: a wedge of skin let into the chest from the neck,
        // and a band of the darker shade down each edge of the cut, the
        // two meeting at its point (a V, open at the top).
        if (skin) {
            const shape = new THREE.Shape([new THREE.Vector2(-vw / 2, 0), new THREE.Vector2(vw / 2, 0), new THREE.Vector2(0, -vd)]);
            const wedge = add(new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.004, bevelEnabled: false }), skin), 'vneck');
            wedge.position.set(0, top + 0.002, front - 0.001);
        }
        const length = Math.hypot(vw / 2, vd);
        for (const s of [-1, 1]) {
            const bar = add(new THREE.Mesh(new THREE.BoxGeometry(spec.band, length, 0.006), darker), 'trim');
            bar.position.set((s * vw) / 4, top + 0.002 - vd / 2, front + 0.003);
            bar.rotation.z = -s * Math.atan2(vw / 2, vd);
        }
    }
}

/** The rig's torso measures: its box is exactly (width, height, depth)
 *  whether a plain box or the rounded slab. */
function torsoBox(torso) {
    torso.geometry.computeBoundingBox();
    const b = torso.geometry.boundingBox;
    return { width: b.max.x - b.min.x, height: b.max.y - b.min.y, depth: b.max.z - b.min.z };
}

// ---- Bottoms ----------------------------------------------------------------------

/**
 * Each over the rig's cylinder legs (avatar-figure has already bared the
 * shins for shorts and the legs for a skirt):
 *
 *   cargoPants, cargoShorts   a pocket with a flap on the outside of each
 *                             thigh
 *   sweatpants                baggy (`baggy` wider), an elastic cuff at
 *                             each ankle and a drawstring at the waist
 *   leggings                  close (`close` narrower), a waistband
 *   basketballShorts          wide, a stripe down each side in a
 *                             contrasting trim, a wide hem
 *   longSkirt                 the rig's skirt drawn down to the ankles
 */
export const BOTTOM_SIZE = Object.freeze({
    cargoPants: { pocket: [0.012, 0.075, 0.07], flap: 0.018, shade: 0.85 },
    cargoShorts: { pocket: [0.012, 0.06, 0.065], flap: 0.016, shade: 0.85 },
    sweatpants: { baggy: 1.14, cuff: 0.03, shade: 0.8 },
    leggings: { close: 0.9, waist: 0.03, shade: 0.85 },
    basketballShorts: { wide: 1.18, stripe: 0.014, hem: 0.02, light: 0xf2f0ea, dark: 0x1f2024 },
    longSkirt: { height: 0.72, bottom: 0.27 }
});

/** Dress the legs as `style` (BOTTOM_SIZE). */
export function dressBottom(person, style, color) {
    const spec = BOTTOM_SIZE[style];
    const darker = material(shade(color, spec.shade || 0.85).getHex(), 0.9);
    const legs = person.children.filter((o) => o.userData.isLeg);
    if (style === 'longSkirt') {
        const skirt = person.children.find((o) => o.userData.isSkirt);
        if (!skirt) return;
        const { radiusTop, height } = skirt.geometry.parameters;
        const top = skirt.position.y + height / 2;
        skirt.geometry.dispose();
        skirt.geometry = new THREE.CylinderGeometry(radiusTop, spec.bottom, spec.height, 16);
        skirt.position.y = top - spec.height / 2;
        return;
    }
    for (const leg of legs) {
        const { thigh, shin, knee } = legParts(leg);
        const side = leg.userData.legSide || Math.sign(leg.position.x) || 1;
        if (style === 'cargoPants' || style === 'cargoShorts') {
            const { radiusTop, height } = thigh.geometry.parameters;
            const pocket = block(spec.pocket, thigh.position.y - height * 0.3, 0, darker, 'pocket');
            pocket.position.x = side * (radiusTop * thigh.scale.x + spec.pocket[0] / 2 - 0.002);
            leg.add(pocket);
            const flap = block([spec.pocket[0] + 0.004, spec.flap, spec.pocket[2] + 0.004], thigh.position.y - height * 0.3 + spec.pocket[1] - spec.flap + 0.002, 0, darker, 'flap');
            flap.position.x = pocket.position.x;
            leg.add(flap);
        } else if (style === 'sweatpants') {
            for (const m of [thigh, knee, shin]) {
                m.scale.x *= spec.baggy;
                m.scale.z *= spec.baggy;
            }
            const { radiusBottom, height } = shin.geometry.parameters;
            const r = radiusBottom * shin.scale.x;
            const ankle = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r * 0.86, spec.cuff, 12), darker);
            ankle.position.set(shin.position.x, shin.position.y - height / 2 + spec.cuff / 2 - 0.002, shin.position.z);
            ankle.name = 'cuff';
            ankle.castShadow = true;
            leg.add(ankle);
        } else if (style === 'leggings') {
            for (const m of [thigh, knee, shin]) {
                m.scale.x *= spec.close;
                m.scale.z *= spec.close;
            }
        } else if (style === 'basketballShorts') {
            thigh.scale.x *= spec.wide;
            thigh.scale.z *= spec.wide;
            const hem = leg.children.find((m) => m.name === 'hem');
            if (hem) {
                hem.scale.x *= spec.wide;
                hem.scale.z *= spec.wide;
                hem.scale.y *= spec.hem / 0.022;
            }
            const trim = material(isLight(color) ? spec.dark : spec.light, 0.8);
            const { radiusTop, height } = thigh.geometry.parameters;
            const stripe = block([0.005, height * 0.9, spec.stripe], thigh.position.y - height * 0.45, 0, trim, 'stripe');
            stripe.position.x = side * (radiusTop * thigh.scale.x + 0.001);
            leg.add(stripe);
        }
    }
    if (style === 'sweatpants' || style === 'leggings') {
        // A waistband over the belt line, with a drawstring on sweatpants.
        const { torso } = bodyParts(person);
        if (!torso) return;
        const { width, height, depth } = torsoBox(torso);
        const bottom = torso.position.y - height / 2;
        const band = new THREE.Mesh(new THREE.BoxGeometry(width + 0.016, spec.waist || 0.035, depth + 0.016), darker);
        band.position.set(0, bottom + (spec.waist || 0.035) / 2 - 0.004, 0);
        band.name = 'waistband';
        band.castShadow = true;
        person.add(band);
        if (style === 'sweatpants') {
            const stringMat = material(isLight(color) ? 0x55524d : 0xe8e4dc, 0.9);
            for (const s of [-1, 1]) {
                const string = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.07, 6), stringMat);
                string.position.set(s * 0.018, bottom - 0.02, depth / 2 + 0.012);
                string.rotation.z = s * 0.15;
                string.name = 'drawstring';
                person.add(string);
            }
        }
    }
}
