// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * avatar-hats.js - the avatar's hats (specs/avatar; Steve's QA of
 * 2026-10-24 asked for many more, and a ball cap that fits and reads).
 *
 * EVERY HAT IS FITTED TO THE HAIR UNDER IT: a crown's size is the farthest
 * the hair (or the head, bald) reaches from the crown's middle, above the
 * hat's rim, plus `ease`, so a hat sits snug on a buzz cut and roomy over an
 * afro, and no hair ever comes through it (tests/shared-avatar-hats measures
 * every hat over every hair style). Three ways to fit:
 *
 *   dome    a crown that is part of a ball, tipped by `tilt`, down to `edge`
 *           (radians from its top), squashed by `scale` for a beret or a
 *           flat cap: the beanie, the ball cap, the trucker cap, the hard
 *           hat, the beret, the ivy cap
 *   crown   an upright crown from `base` (above the head's middle) up, as
 *           wide as the hair above that height, and a brim: the sun hat,
 *           the top hat, the fedora, the cowboy hat, the fez, the chef's hat
 *   perch   sitting on the top of the hair: the birthday hat
 *
 * A piece of hair a hat would squash (a bun, a spike, a mohawk's fin:
 * `userData.hatHides`, avatar-hair) is tucked away under it, and the rig's
 * long hair's box-shaped hanks are trimmed to hang from its rim
 * (`trimUnder`). NO HAT IS ONE FLAT COLOR (Steve, 2026-10-24: the cap's bill
 * vanished straight on): seams, a darker underside, a band, a contrasting
 * stitch.
 *
 * Built in the head's own coordinates (avatar-figure's head group): the
 * middle of the 0.12 m head at the origin, the face toward +z.
 */

import { solidGrid, taperTube, eachVertex } from './avatar-shapes-1.0.0.min.js';

export { eachVertex };

export const HAT_SIZE = Object.freeze({
    ease: 0.004,
    beanie: { fit: 'dome', center: [0, 0.022, -0.008], edge: 1.65, tilt: -0.3, cuff: 0.03 },
    /** Snug on the brow (Steve's QA, 2026-10-24: it sat high and loose), six
     *  panels with darker seams, a button, and a curved bill, pitched down,
     *  its top a shade darker than the crown, its underside darker still,
     *  and a pale stitch along it, so it reads straight on (preview,
     *  2026-10-24: level and one color, it was a thin line from the front).
     *  The bill reaches about 9 cm past the rim (Steve's QA, 2026-10-25: at
     *  6 cm "too short"; a real cap's 7 cm bill scales to 9 on this 24 cm
     *  head), curving down more at its sides as it goes. `BILL_REACH` holds
     *  the least past the rim for the tests. */
    cap: { fit: 'dome', center: [0, 0.026, -0.004], edge: 1.62, tilt: -0.2, seams: 6, bill: { length: 0.105, droop: 0.03, thick: 0.0065, pitch: 0.2, width: 0.86, shade: 0.8 } },
    trucker: { fit: 'dome', center: [0, 0.03, -0.004], edge: 1.6, tilt: -0.18, seams: 4, mesh: 0xf3f2ee, bill: { length: 0.105, droop: 0.022, thick: 0.0065, pitch: 0.14, width: 0.86, shade: 0.8 } },
    hardHat: { fit: 'dome', center: [0, 0.03, -0.004], edge: 1.46, tilt: -0.1, lift: 0.006, lip: 0.012, peak: 0.032, ridge: { width: 0.012, height: 0.007 } },
    /** Sitting high on the head, over its top (preview, 2026-10-24: fitted
     *  round all the hair from lower down, it was an enormous pancake). */
    beret: { fit: 'dome', center: [0, 0.075, -0.014], edge: 1.75, tilt: -0.1, scale: [1.12, 0.55, 1.1], lean: 0.14, rise: 0.06, stem: 0.012 },
    /** Flat, sloping forward into a short bill at the brows. */
    ivyCap: { fit: 'dome', center: [0, 0.052, 0.0], edge: 1.66, tilt: 0.04, scale: [1.06, 0.6, 1.2], rise: 0.06, bill: { length: 0.036, droop: 0.006, thick: 0.006, pitch: 0.25, width: 0.88 } },
    sunHat: { fit: 'crown', center: [0, 0, -0.012], base: 0.07, height: 0.1, taper: 0.88, brim: 0.235, droop: 0.025, band: 0.02, bandColor: 0x2a2622 },
    topHat: { fit: 'crown', center: [0, 0, -0.008], base: 0.056, height: 0.17, flare: 1.05, brim: 0.048, curl: 0.016, band: 0.03 },
    fedora: { fit: 'crown', center: [0, 0, -0.008], base: 0.058, height: 0.105, taper: 0.9, dent: 0.016, brim: 0.058, snap: 0.012, oval: 1.1, band: 0.022 },
    cowboy: { fit: 'crown', center: [0, 0, -0.008], base: 0.058, height: 0.12, taper: 0.88, dent: 0.026, brim: 0.09, curl: 0.042, oval: 1.12, band: 0.018 },
    /** The tassel: black, or `gold` on a dark fez, where black vanished
     *  (Steve's QA, 2026-10-24: "not noticeable enough"); its cord `cord`
     *  thick, hanging `hang` of the way down the side. */
    fez: { fit: 'crown', center: [0, 0, -0.006], base: 0.06, height: 0.11, taper: 0.78, tassel: 0x1a1a1a, gold: 0xe8c04a, cord: 0.003, hang: 0.75, tuft: [0.013, 0.05], side: 1.75 },
    /** A pleated band, and a toque over it: a tall soft cylinder `puff`
     *  times the band's width, `rise` tall, bulging out just above the
     *  band and rounding in over the top, pleated up its side (Steve's QA,
     *  2026-10-24: a ball ringed with lobes "looks really weird"). */
    chef: { fit: 'crown', center: [0, 0, -0.006], base: 0.06, height: 0.05, puff: 1.18, rise: 0.17, pleats: 10 },
    birthday: { fit: 'perch', height: 0.17, radius: 0.055, sink: 0.012, lean: 0.14, stripes: 5, pompom: 0.013 }
});

/** How far past the rim a ball cap's or a trucker cap's bill reaches, at
 *  least (meters, along the bill's middle). The ivy cap's stays short. */
export const BILL_REACH = 0.085;

// ---- Measuring the hair under a hat -------------------------------------------

/** What a hat is fitted over: the shown meshes of the hair and the head,
 *  but not the rig's long hair's box-shaped hanks, whose top corners stand
 *  out past any round crown (they are trimmed to hang from the rim
 *  instead). */
export function fitsUnder(m) {
    for (let p = m; p; p = p.parent) if (p.visible === false) return false;
    return m.geometry.type !== 'BoxGeometry';
}

/** The farthest any vertex of `objects` above `aboveY` reaches from
 *  `center`: straight (measured in a ball squashed by `scale`), or across
 *  (`horizontal`). */
export function reach(objects, center, aboveY, { horizontal = false, scale = [1, 1, 1] } = {}) {
    let far = 0;
    eachVertex(objects, (v) => {
        if (v.y < aboveY) return;
        const dx = v.x - center.x;
        const dz = v.z - center.z;
        far = Math.max(far, horizontal ? Math.hypot(dx, dz) : Math.hypot(dx / scale[0], (v.y - center.y) / scale[1], dz / scale[2]));
    }, fitsUnder);
    return far;
}

/** The highest any shown vertex of `objects` reaches. */
export function highest(objects) {
    let top = -Infinity;
    eachVertex(objects, (v) => {
        top = Math.max(top, v.y);
    }, fitsUnder);
    return top;
}

/**
 * Cut each box-shaped hank of `hair` down so its top sits just under the
 * hat's rim (`rimAt(z)`, the rim's height at a depth, taken at the lower of
 * the hank's front and back), so it hangs out from under the hat as hair
 * does, and never through it. A hank wholly above the rim is hidden.
 */
export function trimUnder(hair, rimAt, tuck = 0.004) {
    hair.traverse((m) => {
        if (!m.isMesh || m.geometry.type !== 'BoxGeometry') return;
        const { height, depth } = m.geometry.parameters;
        const h = height * m.scale.y;
        const d = (depth * m.scale.z) / 2;
        const bottom = m.position.y - h / 2;
        const top = m.position.y + h / 2;
        const rim = Math.min(rimAt(m.position.z - d), rimAt(m.position.z + d)) - tuck;
        if (top <= rim) return;
        if (rim <= bottom + 0.01) {
            m.visible = false;
            return;
        }
        m.scale.y *= (rim - bottom) / h;
        m.position.y = (rim + bottom) / 2;
    });
}

// ---- The pieces hats are made of ------------------------------------------------

/** `color` a shade darker (`k` below 1) or toward white (`k` above 1). */
export function shade(color, k) {
    const c = new THREE.Color(color);
    return k <= 1 ? c.multiplyScalar(k) : c.lerp(new THREE.Color(0xffffff), Math.min(1, k - 1));
}

const material = (color, roughness = 0.9, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, side: THREE.DoubleSide, ...extra });

/** Seams down a dome of radius `R` to `edge`: `count` thin raised lines
 *  from the top, evenly round it. */
function seams(R, edge, count, mat) {
    const group = new THREE.Group();
    for (let k = 0; k < count; k++) {
        const holder = new THREE.Group();
        holder.rotation.y = (k / count) * Math.PI * 2 + Math.PI / count;
        // A torus arc stands in its xy-plane from +x round: turned to run
        // from the top down to `edge`.
        const arc = new THREE.Mesh(new THREE.TorusGeometry(R + 0.0006, 0.0009, 4, 28, edge), mat);
        arc.rotation.z = Math.PI / 2 - edge;
        holder.add(arc);
        group.add(holder);
    }
    group.name = 'seams';
    return group;
}

/**
 * A curved bill: `width` across (as a share of `across`, the rim's
 * diameter), `length` out from its root at `root` [y, z], drooping `droop`
 * at its sides and pitched down `pitch`, `thick` thick, rounded at its
 * front. Its top in `top`, its underside in `under`, and a pale stitch
 * along its front. ITS ROOT FOLLOWS THE RIM: the rim is a circle, so a
 * straight root across the front stood clear of the crown at its sides
 * (Steve's QA, 2026-10-24: "disconnected from the rest of the hat at its
 * edges"); the root is set as far inside the rim's circle at every point
 * across as `root`'s depth is at the middle, and the droop grows along the
 * bill's length, so the root stays at the rim's height all the way round.
 */
function bill(spec, across, root, top, under, stitchColor) {
    const half = (across * spec.width) / 2;
    const rim = across / 2;
    const inset = rim - root[1];
    const point = (u, v, lift) => {
        const x = u * half * (1 - 0.22 * v * v);
        const x0 = u * half;
        const rootZ = Math.sqrt(Math.max(0, rim * rim - x0 * x0)) - inset;
        const z = rootZ + spec.length * v * (1 - 0.38 * u * u);
        const y = root[0] - spec.droop * u * u * v - spec.pitch * spec.length * v + lift;
        return [x, y, z];
    };
    const geometry = solidGrid(16, 6, (i, j, side) => point(-1 + (2 * i) / 16, j / 6, side ? spec.thick / 2 : -spec.thick / 2));
    const mesh = new THREE.Mesh(geometry, [top, under, top]);
    mesh.name = 'bill';
    const group = new THREE.Group();
    group.add(mesh);
    // Two rows of stitching along the front, on top.
    for (const v of [0.82, 0.68]) {
        const points = Array.from({ length: 9 }, (_, k) => point(-0.86 + (1.72 * k) / 8, v, spec.thick / 2 + 0.0004));
        const stitch = new THREE.Mesh(taperTube(points, () => 0.0007, { segments: 24, radial: 4 }), material(stitchColor, 0.8));
        stitch.name = 'stitch';
        group.add(stitch);
    }
    return group;
}

/** A brim all the way round an upright crown: from radius `r` out `width`,
 *  its height at angle `a` and share `v` of the way out given by
 *  `rise(a, v)`, `thick` thick. */
function brimRing(r, width, rise, thick, mat, oval = 1) {
    const geometry = solidGrid(48, 4, (i, j, side) => {
        const a = -Math.PI + (2 * Math.PI * i) / 48;
        const v = j / 4;
        const rr = r + width * v;
        return [rr * Math.sin(a), rise(a, v) + (side ? thick / 2 : -thick / 2), rr * Math.cos(a) * oval];
    }, { wrap: true });
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.name = 'brim';
    return mesh;
}

/** An upright crown turned from a profile ([radius, height] points from
 *  the base up), squashed front to back by `oval`. */
function crownFrom(profile, mat, oval = 1) {
    const mesh = new THREE.Mesh(new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), 40), mat);
    mesh.scale.z = oval;
    mesh.name = 'crown';
    return mesh;
}

// ---- The hats -------------------------------------------------------------------

/**
 * The hat `kind` in `color` (display hex), fitted over `head` and `hair`
 * (the hair group, or null when bald), as a group named 'hat'. Its fit is
 * kept in `userData.fit` for the tests: `{ fit, center, r, ... }`.
 */
export function buildHat(kind, color, head, hair) {
    const H = HAT_SIZE;
    const spec = H[kind];
    if (hair) {
        hair.traverse((m) => {
            if (m.userData && m.userData.hatHides) m.visible = false;
        });
    }
    const cover = hair ? [head, hair] : [head];
    const group = new THREE.Group();
    group.name = 'hat';
    const felt = material(color);
    const darker = material(shade(color, 0.72));
    const stitchColor = shade(color, 1.6);
    const center = new THREE.Vector3(...(spec.center || [0, 0, 0]));

    if (spec.fit === 'perch') {
        // On the top of the hair, leaning a little, in stripes.
        const top = highest(cover) - spec.sink;
        const hat = new THREE.Group();
        hat.position.set(0, top, -0.01);
        hat.rotation.z = spec.lean;
        const white = material(0xf6f4ef);
        for (let k = 0; k < spec.stripes; k++) {
            const y0 = (k / spec.stripes) * spec.height;
            const y1 = ((k + 1) / spec.stripes) * spec.height;
            const r0 = spec.radius * (1 - y0 / spec.height);
            const r1 = spec.radius * (1 - y1 / spec.height);
            const band = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(r1, 0.0005), r0, y1 - y0, 24, 1, k < spec.stripes - 1), k % 2 ? white : felt);
            band.position.y = (y0 + y1) / 2;
            band.name = k % 2 ? 'stripe' : 'crown';
            hat.add(band);
        }
        const pompom = new THREE.Mesh(new THREE.SphereGeometry(spec.pompom, 12, 8), white);
        pompom.position.y = spec.height;
        pompom.name = 'pompom';
        hat.add(pompom);
        group.add(hat);
        group.userData.fit = { kind, fit: 'perch', base: top };
        return finish(group);
    }

    if (spec.fit === 'crown') {
        const baseY = spec.base;
        const oval = spec.oval || 1;
        // As wide as the hair above the base (measured across, and allowing
        // for an oval crown), and above the hair's top.
        const r = reach(cover, center, baseY, { horizontal: true }) + H.ease + 0.004;
        const height = Math.max(spec.height, highest(cover) + 0.012 - baseY);
        const holder = new THREE.Group();
        holder.position.set(center.x, baseY, center.z);
        group.add(holder);
        if (kind === 'sunHat') {
            const crown = new THREE.Mesh(new THREE.CylinderGeometry(r * spec.taper, r, height, 32), felt);
            crown.position.y = height / 2;
            crown.name = 'crown';
            holder.add(crown);
            const band = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.0015, r + 0.002, spec.band, 32, 1, true), material(spec.bandColor, 0.6));
            band.position.y = spec.band / 2 + 0.002;
            band.name = 'band';
            holder.add(band);
            const brim = new THREE.Mesh(new THREE.CylinderGeometry(r, spec.brim, spec.droop, 40, 1, true), felt);
            brim.position.y = -spec.droop / 2;
            brim.name = 'brim';
            holder.add(brim);
        } else if (kind === 'topHat') {
            holder.add(crownFrom([[r, 0], [r * spec.flare, height], [0, height]], material(color, 0.5)));
            const band = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.0018, r + 0.0018, spec.band, 40, 1, true), material(shade(color, 0.45), 0.4));
            band.position.y = spec.band / 2 + 0.003;
            band.name = 'band';
            holder.add(band);
            holder.add(brimRing(r - 0.002, spec.brim, (a, v) => spec.curl * Math.sin(a) ** 2 * v * v, 0.005, material(color, 0.5)));
        } else if (kind === 'fedora' || kind === 'cowboy') {
            // A crown with a crease down its top, a band, and a brim: the
            // fedora's snapped down in front and behind, the cowboy hat's
            // curled up at the sides.
            const h = height;
            holder.add(crownFrom([[r, 0], [r * 0.97, h * 0.6], [r * spec.taper, h], [r * 0.5, h - spec.dent * 0.6], [0, h - spec.dent]], felt, oval));
            const band = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.0018, r + 0.0018, spec.band, 40, 1, true), darker);
            band.scale.z = oval;
            band.position.y = spec.band / 2 + 0.003;
            band.name = 'band';
            holder.add(band);
            const rise = kind === 'fedora'
                ? (a, v) => (-spec.snap * Math.cos(a) ** 2 + 0.006 * Math.sin(a) ** 2) * v
                : (a, v) => spec.curl * Math.sin(a) ** 2 * v ** 1.6 - 0.008 * Math.cos(a) ** 2 * v;
            holder.add(brimRing(r - 0.002, spec.brim, rise, 0.005, felt, oval));
        } else if (kind === 'fez') {
            holder.add(crownFrom([[r, 0], [r * spec.taper, height], [0, height]], felt));
            // The tassel, in black, or gold where black would vanish
            // against a dark fez.
            const dark = new THREE.Color(color).getHSL({}).l < 0.3;
            const silk = material(dark ? spec.gold : spec.tassel, 0.6);
            const knob = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 8), silk);
            knob.position.y = height + 0.004;
            knob.name = 'tassel';
            holder.add(knob);
            // Hanging beside the head, `side` radians round from the front
            // (preview, 2026-10-24: behind, no view showed it), and clear
            // of the crown, which is wider at its base than at its top (a
            // tassel dropped straight from the top edge hung inside it).
            const edge = r * spec.taper;
            const low = height * (1 - spec.hang);
            const coneR = (y) => r + (edge - r) * (y / height);
            const at = (d, y) => [d * Math.sin(spec.side), y, d * Math.cos(spec.side)];
            const mid = low + spec.tuft[1] * 0.5;
            const cord = new THREE.Mesh(taperTube([[0, height + 0.005, 0], at(edge * 0.6, height + 0.008), at(edge + 0.006, height - 0.01), at(coneR(mid) + 0.015, mid)], () => spec.cord, { segments: 20, radial: 6 }), silk);
            cord.name = 'tassel';
            holder.add(cord);
            const tuft = new THREE.Mesh(new THREE.ConeGeometry(spec.tuft[0], spec.tuft[1], 10), silk);
            tuft.position.set(...at(coneR(low) + spec.tuft[0] + 0.003, low));
            tuft.name = 'tassel';
            holder.add(tuft);
        } else if (kind === 'chef') {
            // The band reaches up to the puff, however tall the hair under it
            // (preview, 2026-10-24: over an afro, the puff floated over a
            // ring of hair).
            const top = Math.max(spec.height, height - 0.02);
            const band = new THREE.Mesh(new THREE.CylinderGeometry(r, r, top, 40), felt);
            band.position.y = top / 2;
            band.name = 'crown';
            holder.add(band);
            for (let k = 0; k < spec.pleats; k++) {
                const a = (k / spec.pleats) * Math.PI * 2;
                const pleat = new THREE.Mesh(new THREE.BoxGeometry(0.0016, top * 0.9, 0.0016), darker);
                pleat.position.set((r + 0.0006) * Math.sin(a), top / 2, (r + 0.0006) * Math.cos(a));
                pleat.name = 'pleat';
                holder.add(pleat);
            }
            // The toque: a tall soft cylinder over the band, wider than it,
            // bulging out just above the band, nearly straight up its side
            // and rounding in over the top, closed; pleats up its side.
            const R = r * spec.puff;
            const h = spec.rise;
            const profile = [[0, 0], [r, 0], [R * 0.97, h * 0.1], [R, h * 0.42], [R * 0.97, h * 0.74], [R * 0.8, h * 0.92], [R * 0.45, h], [0, h]];
            const puff = crownFrom(profile, felt);
            puff.position.y = top - 0.004;
            puff.name = 'puff';
            holder.add(puff);
            for (let k = 0; k < spec.pleats; k++) {
                const a = ((k + 0.5) / spec.pleats) * Math.PI * 2;
                const points = profile.slice(1, 7).map(([x, y]) => [(x + 0.0008) * Math.sin(a), top - 0.004 + y, (x + 0.0008) * Math.cos(a)]);
                const pleat = new THREE.Mesh(taperTube(points, (s) => 0.0024 * (1 - 0.5 * s), { segments: 16, radial: 5 }), darker);
                pleat.name = 'pleat';
                holder.add(pleat);
            }
        }
        if (hair) trimUnder(hair, () => baseY);
        group.userData.fit = { kind, fit: 'crown', center: new THREE.Vector3(center.x, 0, center.z), r, oval, baseY, top: baseY + height, taper: kind === 'topHat' ? spec.flare : spec.taper || 1 };
        return finish(group);
    }

    // A dome: the crown is part of a ball (squashed by `scale`), tipped. A
    // flat one (a beret, a flat cap) sits up on big hair, raised as far as
    // `rise` while that makes it smaller, rather than spreading round it
    // (tests, 2026-10-24: over an afro, the ivy cap's brim reached 27 cm out
    // and came down over the eyes).
    // It always covers the hair down to the same height, wherever it sits.
    const scale = spec.scale || [1, 1, 1];
    const floor = center.y - 0.02;
    let R = reach(cover, center, floor, { scale });
    const start = center.y;
    for (let dy = 0.004; dy <= (spec.rise || 0) + 1e-9; dy += 0.004) {
        const c = new THREE.Vector3(center.x, start + dy, center.z);
        const r = reach(cover, c, floor, { scale });
        if (r < R) {
            R = r;
            center.copy(c);
        }
    }
    R += H.ease + (spec.lift || 0);
    const dome = new THREE.Group();
    dome.position.copy(center);
    dome.rotation.x = spec.tilt;
    if (spec.lean) dome.rotation.z = spec.lean;
    group.add(dome);
    const squash = new THREE.Group();
    squash.scale.set(...scale);
    dome.add(squash);
    const shell = new THREE.Mesh(new THREE.SphereGeometry(R, 40, 16, 0, Math.PI * 2, 0, spec.edge), kind === 'hardHat' ? material(color, 0.32, { metalness: 0.08 }) : felt);
    shell.name = 'crown';
    squash.add(shell);
    const rimY = R * Math.cos(spec.edge);
    const rimR = R * Math.sin(spec.edge);
    if (kind === 'beanie') {
        const cuff = new THREE.Mesh(new THREE.CylinderGeometry(rimR + 0.006, rimR + 0.004, spec.cuff, 32, 1, true), material(shade(color, 0.86), 0.95));
        cuff.position.y = rimY + spec.cuff / 2;
        cuff.name = 'cuff';
        squash.add(cuff);
    } else if (kind === 'cap' || kind === 'trucker') {
        if (kind === 'trucker') {
            // The pale foam front panel, and the mesh back in the hat's
            // color, like its bill (Steve's QA, 2026-10-24: the other way
            // round, "the colors seem to be reversed").
            shell.geometry.dispose();
            shell.geometry = new THREE.SphereGeometry(R, 40, 16, 0, Math.PI, 0, spec.edge);
            shell.material = material(spec.mesh, 0.95);
            const back = new THREE.Mesh(new THREE.SphereGeometry(R, 40, 16, Math.PI, Math.PI, 0, spec.edge), felt);
            back.name = 'back';
            squash.add(back);
        }
        // Piping along the seams: a shade darker, or the hat's own color
        // over a trucker cap's pale front.
        squash.add(seams(R, spec.edge, spec.seams, kind === 'trucker' ? felt : material(shade(color, 0.62))));
        const button = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 6), felt);
        button.position.y = R;
        button.name = 'button';
        squash.add(button);
        squash.add(bill(spec.bill, rimR * 2, [rimY + 0.002, rimR - 0.014], material(shade(color, spec.bill.shade || 1)), material(shade(color, 0.5)), stitchColor));
    } else if (kind === 'hardHat') {
        const gloss = shell.material;
        // A lip all the way round, wider into a peak at the front, and a
        // ridge over the top.
        squash.add(brimRingDome(rimR, rimY, (a) => spec.lip + spec.peak * Math.max(0, Math.cos(a)) ** 4, gloss));
        const ridge = new THREE.Mesh(solidGrid(2, 24, (i, j, side) => {
            const u = -1 + i;
            const t = -spec.edge * 0.92 + (2 * spec.edge * 0.92 * j) / 24;
            const rr = R + (side ? spec.ridge.height : 0) * Math.cos(t * 0.6);
            return [u * spec.ridge.width / 2, rr * Math.cos(t), rr * Math.sin(t)];
        }), material(shade(color, 0.8), 0.32, { metalness: 0.08 }));
        ridge.name = 'ridge';
        squash.add(ridge);
    } else if (kind === 'beret') {
        // A band of piping round its edge, a shade darker.
        const piping = new THREE.Mesh(new THREE.TorusGeometry(rimR, 0.004, 6, 48), darker);
        piping.rotation.x = Math.PI / 2;
        piping.position.y = rimY;
        piping.name = 'band';
        squash.add(piping);
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.004, spec.stem, 8), felt);
        stem.position.y = R + spec.stem / 2;
        stem.name = 'stem';
        squash.add(stem);
    } else if (kind === 'ivyCap') {
        const seam = new THREE.Mesh(new THREE.TorusGeometry(R + 0.0006, 0.0009, 4, 28, spec.edge * 1.6), material(shade(color, 0.62)));
        seam.rotation.y = Math.PI / 2;
        seam.rotation.z = Math.PI / 2 - spec.edge * 0.6;
        seam.name = 'seams';
        squash.add(seam);
        squash.add(bill(spec.bill, rimR * 2, [rimY + 0.004, rimR - 0.01], material(color), material(shade(color, 0.5)), stitchColor));
    }
    // The rim is the dome's edge, a circle in a plane tipped by `tilt`: its
    // height at a depth `z`, from (y - cy) cos t + (z - cz) sin t = rimY.
    const t = spec.tilt;
    const rimLocal = rimY * scale[1];
    if (hair) trimUnder(hair, (z) => center.y + (rimLocal - (z - center.z) * Math.sin(t)) / Math.cos(t));
    group.userData.fit = { kind, fit: 'dome', center: center.clone(), r: R, tilt: t, lean: spec.lean || 0, edge: spec.edge, scale };
    return finish(group);
}

/** A hard hat's lip: a ring round the dome's rim, `width(a)` wide at each
 *  angle, sloping a little down. */
function brimRingDome(rimR, rimY, width, mat) {
    const geometry = solidGrid(48, 3, (i, j, side) => {
        const a = -Math.PI + (2 * Math.PI * i) / 48;
        const v = j / 3;
        const rr = rimR - 0.002 + width(a) * v;
        return [rr * Math.sin(a), rimY - 0.006 * v + (side ? 0.003 : -0.003), rr * Math.cos(a)];
    }, { wrap: true });
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.name = 'brim';
    return mesh;
}

/** No hat casts a shadow (it would darken the whole face). */
function finish(group) {
    group.traverse((o) => {
        if (o.isMesh) o.castShadow = false;
    });
    return group;
}
