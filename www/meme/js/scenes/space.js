// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * scenes/space.js - the props of Always Has Been (template 6): the box's
 * back wall is the dark of space, a field of stars hangs inside it, the
 * Earth turns below, and every figure wears a glass helmet. Generic (PRD
 * section 7): a planet is a planet.
 */

export const SPACE = Object.freeze({
    stars: 220, starSize: 0.012, starColor: 0xffffff,
    earth: Object.freeze({ r: 0.55, at: Object.freeze([-0.35, 0.35, -0.45]), sea: 0x2f6fc4, land: 0x4f9a5a, cloud: 0xffffff }),
    helmet: Object.freeze({ r: 0.175, color: 0xbfe3ff, opacity: 0.22 })
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
    /** A helmet on a figure's head (and on a figure built again later). */
    const fit = (figure) => {
        const head = figure.person.getObjectByName('head');
        if (!head) return null;
        const helmet = new THREE.Mesh(new THREE.SphereGeometry(S.helmet.r, 24, 18), glass);
        helmet.name = 'helmet';
        helmet.renderOrder = 2;
        head.add(helmet);
        return helmet;
    };
    for (const figure of figures) fit(figure);
    group.userData.fit = fit;
    box.add(group);
    return group;
}
