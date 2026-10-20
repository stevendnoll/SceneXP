// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * hall.js - the community hall around the track (M1): a gym floor with its
 * court lines (M6), the walls, bleachers along the far side, a banner, and
 * the lights. Its dressing for the day (pennants, windows, hoops, chairs,
 * the trophy and snack tables, the timer over the finish) is dressing.js,
 * and the people in it are crowd.js.
 *
 * The cameras all sit on the +z side of the track (director.js), so the
 * bleachers stand on the -z side, behind the track in every shot, where a
 * crowd will be seen (M6).
 */

import { DERBY_CONFIG } from './config.min.js';

/** The hall's footprint: x from the start end wall to the far end wall, z
 *  across. */
export const HALL = Object.freeze({ x0: -5, x1: 19, z0: -7, z1: 7, height: 6 });

/**
 * Build the hall and light it. Returns { group, sun } (the sun is the one
 * shadowed light).
 */
export function buildHall(C = DERBY_CONFIG, { shadows = false } = {}) {
    const L = C.look;
    const group = new THREE.Group();
    group.name = 'hall';
    const w = HALL.x1 - HALL.x0;
    const d = HALL.z1 - HALL.z0;
    const cx = (HALL.x0 + HALL.x1) / 2;

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: courtTexture(L.floor), roughness: 0.55 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, 0);
    floor.receiveShadow = shadows;
    group.add(floor);

    const wallMat = new THREE.MeshStandardMaterial({ color: L.wall, roughness: 0.9 });
    const wall = (width, x, z, rotY) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(width, HALL.height), wallMat);
        m.position.set(x, HALL.height / 2, z);
        m.rotation.y = rotY;
        group.add(m);
    };
    wall(w, cx, HALL.z0, 0);
    wall(w, cx, HALL.z1, Math.PI);
    wall(d, HALL.x0, 0, Math.PI / 2);
    wall(d, HALL.x1, 0, -Math.PI / 2);

    // Bleachers: four rising steps along the far side.
    const benchMat = new THREE.MeshStandardMaterial({ color: L.bleachers, roughness: 0.7 });
    for (let row = 0; row < 4; row++) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(14, 0.42 * (row + 1), 0.8), benchMat);
        step.position.set(7, 0.21 * (row + 1), -2.2 - row * 0.8);
        step.receiveShadow = shadows;
        group.add(step);
    }

    // The banner over the bleachers.
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.2), new THREE.MeshBasicMaterial({ map: bannerTexture('DERBY DAY') }));
    banner.position.set(7, 4.2, HALL.z0 + 0.02);
    group.add(banner);

    group.add(new THREE.HemisphereLight(0xfff4e6, 0x6b5640, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(4, 9, 5);
    sun.target.position.set(6, 0, 0);
    group.add(sun.target);
    if (shadows) {
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        const cam = sun.shadow.camera;
        cam.left = -8;
        cam.right = 8;
        cam.top = 3;
        cam.bottom = -3;
        cam.near = 1;
        cam.far = 25;
        sun.shadow.bias = -0.0004;
    }
    group.add(sun);
    return { group, sun };
}

/** The gym floor: maple planks and a basketball court's lines, on a
 *  canvas the size of the hall (24 m by 14 m, 40 px a meter). */
function courtTexture(color) {
    const canvas = document.createElement('canvas');
    canvas.width = 960;
    canvas.height = 560;
    const g = canvas.getContext('2d');
    const px = 40;
    g.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    g.fillRect(0, 0, canvas.width, canvas.height);
    // The planks, a shade either way of the floor.
    for (let y = 0; y < canvas.height; y += 6) {
        g.fillStyle = (y / 6) % 3 === 0 ? 'rgba(90, 55, 20, 0.08)' : 'rgba(255, 240, 210, 0.05)';
        g.fillRect(0, y, canvas.width, 3);
    }
    // The court: a center circle and two keys, the long way down the hall.
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    g.strokeStyle = 'rgba(250, 250, 245, 0.85)';
    g.lineWidth = 3;
    g.strokeRect(1 * px, 1 * px, canvas.width - 2 * px, canvas.height - 2 * px);
    g.beginPath();
    g.moveTo(cx, 1 * px);
    g.lineTo(cx, canvas.height - 1 * px);
    g.stroke();
    g.beginPath();
    g.arc(cx, cy, 1.8 * px, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = 'rgba(31, 78, 140, 0.8)';
    for (const x of [1 * px, canvas.width - 1 * px - 5.8 * px]) g.strokeRect(x, cy - 2.4 * px, 5.8 * px, 4.8 * px);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
}

/** A banner's words on canvas. */
function bannerTexture(words) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 204;
    const g = canvas.getContext('2d');
    g.fillStyle = '#1f4e8c';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = '#ffd45c';
    g.font = 'bold 132px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(words, canvas.width / 2, canvas.height / 2 + 6);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}
