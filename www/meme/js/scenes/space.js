// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * scenes/space.js - the props of Always Has Been (template 6): the box's
 * back wall is the dark of space, a field of stars hangs inside it, the
 * Earth hangs up to one side, every figure wears a glass helmet, and the
 * one that aims holds a cartoon blaster. Generic (PRD section 7): a planet
 * is a planet, and the ray gun is nobody's.
 */

export const SPACE = Object.freeze({
    stars: 220, starSize: 0.012, starColor: 0xffffff,
    // The Earth hangs up on the camera's left, clear of the floor, where
    // a figure turned away can gaze at it (Steve, 2026-10-28).
    earth: Object.freeze({ r: 0.3, at: Object.freeze([-0.85, 1.72, -0.36]), sea: 0x2f6fc4, land: 0x4f9a5a, cloud: 0xffffff }),
    helmet: Object.freeze({ r: 0.175, color: 0xbfe3ff, opacity: 0.22 }),
    /** The blaster a figure in the `aim` pose holds: a cartoon ray gun
     *  (chunky, a ring round the muzzle, a fin on top, no real firearm's
     *  shape), in the hand's own frame, which the pose's twist stands
     *  thumb up (poses.js): the barrel along the fingers' -y out past the
     *  knuckles of the fist (hands.js), the body `body` [across, along,
     *  deep] meters round the fist, the fin on the thumb side (up), the
     *  `grip` [thick, long, deep] handle out of the bottom, `barrel`
     *  beyond. Upright, not on its side (Steve, 2026-10-28). */
    blaster: Object.freeze({ body: Object.freeze([0.06, 0.15, 0.065]), barrel: 0.13, barrelR: 0.017, ringR: 0.032, fin: 0.04, grip: Object.freeze([0.045, 0.07, 0.05]), color: 0xd9dde3, trim: 0xff8a3d })
});

/** A seeded roll, so the stars stand still between builds. */
function rng(seed) {
    let s = seed;
    return () => {
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
    };
}

/** The Earth's own texture: sea, a few continents, a little cloud, drawn
 *  on a canvas when there is one (none under test), else plain sea. */
function earthMaterial(E) {
    if (typeof document === 'undefined') return new THREE.MeshStandardMaterial({ color: E.sea, roughness: 0.7 });
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const g = c.getContext('2d');
    if (!g || typeof g.fillRect !== 'function') return new THREE.MeshStandardMaterial({ color: E.sea, roughness: 0.7 });
    const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
    g.fillStyle = hex(E.sea);
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = hex(E.land);
    const roll = rng(11);
    for (let i = 0; i < 14; i++) {
        g.beginPath();
        g.ellipse(roll() * 256, 20 + roll() * 88, 10 + roll() * 28, 8 + roll() * 16, roll() * Math.PI, 0, Math.PI * 2);
        g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 18; i++) {
        g.beginPath();
        g.ellipse(roll() * 256, roll() * 128, 6 + roll() * 18, 3 + roll() * 6, 0, 0, Math.PI * 2);
        g.fill();
    }
    const map = new THREE.CanvasTexture(c);
    map.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map, roughness: 0.8 });
}

/** The stars, the Earth and the helmets in `box`. Returns the group. */
export function build(box, config, { figures = [] } = {}) {
    const S = SPACE;
    const B = config.box;
    const group = new THREE.Group();
    group.name = 'space';
    const roll = rng(7);
    const positions = [];
    for (let i = 0; i < S.stars; i++) {
        positions.push((roll() - 0.5) * B.width * 0.96, roll() * B.height * 0.98, -B.depth / 2 + 0.02 + roll() * B.depth * 0.5);
    }
    const stars = new THREE.Points(
        new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)),
        new THREE.PointsMaterial({ color: S.starColor, size: S.starSize, sizeAttenuation: true })
    );
    stars.name = 'stars';
    group.add(stars);
    const earth = new THREE.Mesh(new THREE.SphereGeometry(S.earth.r, 32, 24), earthMaterial(S.earth));
    earth.name = 'earth';
    earth.position.set(...S.earth.at);
    earth.rotation.z = 0.4;
    earth.castShadow = true;
    group.add(earth);
    const glass = new THREE.MeshStandardMaterial({ color: S.helmet.color, transparent: true, opacity: S.helmet.opacity, roughness: 0.1, metalness: 0.1, depthWrite: false });
    const shell = new THREE.MeshStandardMaterial({ color: S.blaster.color, roughness: 0.5, metalness: 0.2 });
    const trim = new THREE.MeshStandardMaterial({ color: S.blaster.trim, roughness: 0.6 });
    /** The blaster in `hand` (the rig's hand mesh, made a fist), `inner`
     *  the thumb's side (+1 or -1 along the hand's x, which the pose
     *  stands up): the barrel along the fingers, out past the knuckles,
     *  the body round the fist, the fin on the thumb side. */
    const arm = (hand, inner) => {
        const Bl = S.blaster;
        const gun = new THREE.Group();
        gun.name = 'blaster';
        const [bw, bl, bh] = Bl.body;
        // The fist's middle is a little under the hand's origin.
        const grip = -0.03;
        const body = new THREE.Mesh(new THREE.BoxGeometry(bw, bl, bh), shell);
        body.position.set(0, grip - bl * 0.25, 0);
        gun.add(body);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(Bl.barrelR, Bl.barrelR * 1.2, Bl.barrel, 12), shell);
        barrel.position.set(0, grip - bl * 0.75 - Bl.barrel / 2, 0);
        gun.add(barrel);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(Bl.ringR, Bl.barrelR * 0.45, 8, 16), trim);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(0, grip - bl * 0.75 - Bl.barrel * 0.6, 0);
        gun.add(ring);
        const fin = new THREE.Mesh(new THREE.BoxGeometry(Bl.fin, bl * 0.55, bh * 0.3), trim);
        fin.position.set(inner * (bw / 2 + Bl.fin / 2), grip - bl * 0.35, 0);
        gun.add(fin);
        // The handle, down out of the bottom of the fist (the pinky side,
        // which the thumb-up twist points at the floor), so the gun reads
        // as held upright (Steve, 2026-10-28).
        const [gw, gl, gd] = Bl.grip;
        const handle = new THREE.Mesh(new THREE.BoxGeometry(gl, gw, gd), trim);
        handle.position.set(-inner * (bw / 2 + gl / 2 + 0.035), grip + bl * 0.05, 0);
        handle.rotation.z = inner * 0.25;
        gun.add(handle);
        gun.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        hand.add(gun);
        return gun;
    };
    /** A helmet on a figure's head (and on a figure built again later),
     *  and the blaster in the leading hand of one that aims. */
    const fit = (figure) => {
        const head = figure.person.getObjectByName('head');
        if (!head) return null;
        const helmet = new THREE.Mesh(new THREE.SphereGeometry(S.helmet.r, 24, 18), glass);
        helmet.name = 'helmet';
        helmet.renderOrder = 2;
        head.add(helmet);
        if (figure.spec && figure.spec.pose === 'aim') {
            let hand = null;
            const side = figure.spec.side || 'right';
            const limb = figure.arms && figure.arms[side];
            if (limb) limb.traverse((o) => { if (!hand && o.userData && o.userData.isHand) hand = o; });
            if (hand) arm(hand, side === 'left' ? -1 : 1);
        }
        return helmet;
    };
    for (const figure of figures) fit(figure);
    group.userData.fit = fit;
    box.add(group);
    return group;
}
