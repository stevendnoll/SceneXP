// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * scenes/fine.js - the props of Everything Is Fine (template 10): a small
 * table with a mug, and flames licking up the walls of the box, each a
 * sprite with a soft radial glow (drawn in code; no picture file ships).
 * Generic (PRD section 7): a room on fire is a room on fire.
 *
 * The flames are `config.fire.count` sprites, half on a phone, and they
 * rise and flicker when the stage ticks them (`tick(dt)`); the picture
 * takes them as they stand.
 */

export const FINE = Object.freeze({
    table: Object.freeze({ at: Object.freeze([-0.55, 0, 0.15]), w: 0.7, h: 0.74, d: 0.5, top: 0x8a6a4e, leg: 0x5a4332 }),
    mug: Object.freeze({ r: 0.045, h: 0.09, color: 0xf3efe6 }),
    flame: Object.freeze({ colors: Object.freeze([0xffb347, 0xff7a1a, 0xffd36b]), floor: 0.05, spread: 0.9 })
});

/** A seeded roll, so the flames stand where they stood last build. */
function rng(seed) {
    let s = seed;
    return () => {
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
    };
}

/** A soft glow for a flame, drawn on a canvas when there is one (none
 *  under test), else the sprite's plain color. */
function flameMaterial(color) {
    const base = { color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
    if (typeof document === 'undefined') return new THREE.SpriteMaterial({ ...base, opacity: 0.8 });
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const g = c.getContext('2d');
    if (!g || typeof g.createRadialGradient !== 'function') return new THREE.SpriteMaterial({ ...base, opacity: 0.8 });
    const grad = g.createRadialGradient(32, 36, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.35, 'rgba(255,220,120,0.75)');
    grad.addColorStop(1, 'rgba(255,120,30,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const map = new THREE.CanvasTexture(c);
    return new THREE.SpriteMaterial({ ...base, map, opacity: 0.9 });
}

/** The table, the mug and the flames in `box`. Returns the group, with
 *  `tick(dt)` to move the flames. */
export function build(box, config, { mobile = false } = {}) {
    const B = config.box;
    const Fi = config.fire;
    const group = new THREE.Group();
    group.name = 'fine';
    const T = FINE.table;
    const top = new THREE.Mesh(new THREE.BoxGeometry(T.w, 0.04, T.d), new THREE.MeshStandardMaterial({ color: T.top, roughness: 0.7 }));
    top.name = 'table';
    top.position.set(T.at[0], T.h - 0.02, T.at[2]);
    group.add(top);
    const legMat = new THREE.MeshStandardMaterial({ color: T.leg, roughness: 0.8 });
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, T.h - 0.04, 0.04), legMat);
        leg.name = 'leg';
        leg.position.set(T.at[0] + dx * (T.w / 2 - 0.05), (T.h - 0.04) / 2, T.at[2] + dz * (T.d / 2 - 0.05));
        group.add(leg);
    }
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(FINE.mug.r, FINE.mug.r * 0.9, FINE.mug.h, 16), new THREE.MeshStandardMaterial({ color: FINE.mug.color, roughness: 0.5 }));
    mug.name = 'mug';
    mug.position.set(T.at[0] + 0.1, T.h + FINE.mug.h / 2, T.at[2]);
    group.add(mug);
    group.traverse((o) => {
        if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
        }
    });
    // The flames, along the back wall and the sides.
    const count = mobile ? Fi.countMobile : Fi.count;
    const roll = rng(3);
    const materials = FINE.flame.colors.map(flameMaterial);
    const flames = [];
    for (let i = 0; i < count; i++) {
        const sprite = new THREE.Sprite(materials[i % materials.length]);
        sprite.name = 'flame';
        const side = roll();
        const x = side < 0.6 ? (roll() - 0.5) * B.width * FINE.flame.spread : (side < 0.8 ? -1 : 1) * (B.width / 2 - 0.1);
        const z = side < 0.6 ? -B.depth / 2 + 0.12 : (roll() - 0.5) * B.depth * 0.8;
        const size = Fi.size * (0.7 + roll() * 0.6);
        sprite.scale.set(size, size * 1.3, 1);
        sprite.position.set(x, FINE.flame.floor + roll() * 0.8, z);
        sprite.userData.phase = roll() * Math.PI * 2;
        sprite.userData.base = sprite.position.y;
        sprite.userData.size = size;
        group.add(sprite);
        flames.push(sprite);
    }
    let t = 0;
    group.userData.tick = (dt) => {
        t += dt;
        for (const f of flames) {
            const u = f.userData;
            f.position.y = u.base + ((t * Fi.rise + u.phase) % 0.5);
            const flick = 1 + 0.12 * Math.sin(t * 9 + u.phase);
            f.scale.set(u.size * flick, u.size * 1.3 / flick, 1);
        }
    };
    box.add(group);
    return group;
}
