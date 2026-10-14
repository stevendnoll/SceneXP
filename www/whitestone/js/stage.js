// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * stage.js - Where the house stands (PLANNING 6.1): a seamless white studio
 * and a round stone turntable, and the soft daylight over them.
 *
 * NOTHING BUT THE HOUSE (Steve, 2026-10-13: "too much emphasis on the
 * surrounding environment"). The room, its furniture and the street gave way
 * to an infinity cove: one white surface, a floor curving up into a wall
 * with no corner to be seen, lit evenly from an unseen skylight. On it, a
 * low round turntable of pale stone on a dark recessed toe, so it seems to
 * float a little, and the house on its lawn on top.
 *
 * THE TURNTABLE IS THE `spin` GROUP. The house model stands in it, and the
 * visitor's drag turns it (turntable.js), so the camera never moves round
 * the cove and the cove only has to be behind the house.
 *
 * ONLY THE HOUSE ANSWERS A TAP. Nothing here carries a pick key: a tap on
 * the stone, the lawn's edge or the cove is a tap on empty space, which
 * steps back (main.js). `firstPick` and `pickOf` read the model's keys.
 *
 * The shapes are plain numbers first (`coveProfile`, `contactAlpha`), so the
 * tests check the cove is seamless and the shadow soft without a renderer.
 * Every number is in CONFIG.stage and CONFIG.light.
 */

import { smoothstep } from './turntable.min.js';

// ---- The cove (pure) ----------------------------------------------------------

/**
 * The cove's profile, front to back and up, as [z, y] points in meters: the
 * floor from `front` back to where the curve begins, a quarter circle of
 * `radius` rising to the wall, and the wall up to `height`. Each point
 * carries its normal [nz, ny], facing the room, for a smooth light across
 * the curve. `segments` points make the curve.
 */
export function coveProfile(cove, segments = 24) {
    const r = cove.radius;
    const back = -cove.back;
    const pts = [
        { z: cove.front, y: 0, n: [0, 1] },
        { z: back + r, y: 0, n: [0, 1] }
    ];
    for (let i = 1; i < segments; i++) {
        // From straight down (the floor) to straight back (the wall) about
        // the curve's middle.
        const a = (Math.PI * 3) / 2 - (i / segments) * (Math.PI / 2);
        const z = back + r + Math.cos(a) * r;
        const y = r + Math.sin(a) * r;
        pts.push({ z, y, n: [-Math.cos(a), -Math.sin(a)] });
    }
    pts.push({ z: back, y: r, n: [1, 0] });
    pts.push({ z: back, y: cove.height, n: [1, 0] });
    return pts;
}

// ---- The contact shadow (pure) ------------------------------------------------

/**
 * How dark the soft shadow under the turntable is at `r` meters from its
 * middle: `alpha` under the turntable, fading smoothly to nothing over
 * `soft` meters past its rim.
 */
export function contactAlpha(r, radius, contact) {
    const t = (r - (radius - contact.inside)) / (contact.soft + contact.inside);
    return contact.alpha * (1 - smoothstep(t));
}

/** The radii of the shadow's rings: a few across the flat middle, many
 *  across the fade. */
export function contactRings(radius, contact, steps = 10) {
    const rs = [0, (radius - contact.inside) * 0.5];
    for (let i = 0; i <= steps; i++) rs.push(radius - contact.inside + ((contact.soft + contact.inside) * i) / steps);
    return rs;
}

// ---- Picking (pure over three's hits) ----------------------------------------

/** The pick key of the nearest ancestor (or the object itself) that has
 *  one, or null. */
export function pickOf(object) {
    for (let o = object; o; o = o.parent) {
        if (o.userData && o.userData.pick) return o.userData.pick;
    }
    return null;
}

/**
 * What a ray's hits (nearest first) say was tapped: the first one shown
 * decides. Returns `{ key, hit }` or null. A hit on something hidden
 * (three's raycaster does not skip them) is passed over.
 */
export function firstPick(hits) {
    for (const hit of hits || []) {
        let shown = true;
        for (let o = hit.object; o; o = o.parent) if (o.visible === false) { shown = false; break; }
        if (!shown) continue;
        const key = pickOf(hit.object);
        return key ? { key, hit } : null;
    }
    return null;
}

// ---- Building it (three) --------------------------------------------------------

/** The cove as one mesh: the profile swept across its width. */
function buildCove(cove, material) {
    const pts = coveProfile(cove);
    const half = cove.width / 2;
    const positions = [];
    const normals = [];
    const index = [];
    pts.forEach((p, i) => {
        positions.push(-half, p.y, p.z, half, p.y, p.z);
        normals.push(0, p.n[1], p.n[0], 0, p.n[1], p.n[0]);
        if (i > 0) {
            const a = (i - 1) * 2;
            // Wound to face the room.
            index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setIndex(index);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'cove';
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    return mesh;
}

/** The soft shadow under the turntable: rings of vertices, dark in the
 *  middle and clear at the edge, laid just over the floor. */
function buildContact(radius, contact) {
    const rings = contactRings(radius, contact);
    const seg = 64;
    const positions = [];
    const colors = [];
    const index = [];
    rings.forEach((r, j) => {
        const a = contactAlpha(r, radius, contact);
        for (let i = 0; i < seg; i++) {
            const t = (i / seg) * Math.PI * 2;
            positions.push(Math.cos(t) * r, contact.lift, Math.sin(t) * r);
            colors.push(0, 0, 0, a);
        }
        if (j > 0) {
            const b0 = (j - 1) * seg;
            const b1 = j * seg;
            for (let i = 0; i < seg; i++) {
                const n = (i + 1) % seg;
                index.push(b0 + i, b0 + n, b1 + i, b0 + n, b1 + n, b1 + i);
            }
        }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
    geometry.setIndex(index);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
        color: 0xffffff, vertexColors: true, transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
    }));
    mesh.name = 'contact-shadow';
    mesh.raycast = () => {};
    mesh.renderOrder = -1;
    return mesh;
}

/**
 * The turntable: a stone drum on a dark toe set `inset` in, with a slim
 * chamfer round its top edge to catch the light. Its top is at `height`.
 */
function buildTurntable(t) {
    const stone = new THREE.MeshPhysicalMaterial({ color: t.stone, roughness: 0.42, clearcoat: 0.25, clearcoatRoughness: 0.35 });
    stone.name = 'turntable-stone';
    const toeMaterial = new THREE.MeshStandardMaterial({ color: t.toeColor, roughness: 0.9 });
    const seg = 128;
    const body = t.height - t.toe - t.chamfer;
    const parts = [];
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(t.radius, t.radius, body, seg), stone);
    drum.position.y = t.toe + body / 2;
    parts.push(drum);
    const chamfer = new THREE.Mesh(new THREE.CylinderGeometry(t.radius - t.chamfer, t.radius, t.chamfer, seg), stone);
    chamfer.position.y = t.height - t.chamfer / 2;
    parts.push(chamfer);
    const toe = new THREE.Mesh(new THREE.CylinderGeometry(t.radius - t.inset, t.radius - t.inset, t.toe, seg), toeMaterial);
    toe.position.y = t.toe / 2;
    parts.push(toe);
    for (const p of parts) {
        p.castShadow = true;
        p.receiveShadow = true;
    }
    return { parts, shiny: [stone] };
}

/**
 * The daylight: an even sky over the white, and one soft sun from high in
 * front whose shadow covers the turntable and no more. Returns the lights
 * to add and the sun (its shadow map is drawn on demand by main.js).
 */
export function buildLights(config, mobile = false) {
    const { sky, sun: s, fill } = config.light;
    const lights = [];
    lights.push(new THREE.HemisphereLight(sky.color, sky.ground, sky.intensity));
    const sun = new THREE.DirectionalLight(s.color, s.intensity);
    sun.position.set(s.position[0], s.position[1], s.position[2]);
    sun.target.position.set(s.target[0], s.target[1], s.target[2]);
    sun.castShadow = true;
    const size = mobile ? s.shadow.sizeMobile : s.shadow.size;
    sun.shadow.mapSize.set(size, size);
    const cam = sun.shadow.camera;
    cam.left = -s.shadow.reach;
    cam.right = s.shadow.reach;
    cam.top = s.shadow.reach;
    cam.bottom = -s.shadow.reach;
    cam.near = s.shadow.near;
    cam.far = s.shadow.far;
    sun.shadow.bias = s.shadow.bias;
    sun.shadow.normalBias = s.shadow.normalBias;
    sun.shadow.radius = s.shadow.radius;
    lights.push(sun, sun.target);
    const fillLight = new THREE.DirectionalLight(fill.color, fill.intensity);
    fillLight.position.set(fill.position[0], fill.position[1], fill.position[2]);
    lights.push(fillLight);
    return { lights, sun };
}

/**
 * Build the stage. Returns `{ group, spin, top, shiny, background }`: `spin`
 * the turntable's group the house model is added to, `top` the height of
 * the turntable's top, where the model stands, and `background` the cove's
 * white for the scene behind it.
 */
export function buildStage(config) {
    const { cove, turntable, contact } = config.stage;
    const group = new THREE.Group();
    group.name = 'stage';
    const white = new THREE.MeshStandardMaterial({ color: cove.color, roughness: 0.95, metalness: 0 });
    white.name = 'cove';
    group.add(buildCove(cove, white));
    group.add(buildContact(turntable.radius, contact));
    const spin = new THREE.Group();
    spin.name = 'turntable';
    const table = buildTurntable(turntable);
    for (const p of table.parts) spin.add(p);
    group.add(spin);
    return { group, spin, top: turntable.height, shiny: table.shiny, background: cove.color };
}
