// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * interior.js - The light inside the office (QA, 2026-09-25: "anything we
 * can do to make the scene look even more realistic?").
 *
 * THE SUN COMES IN BY THE WINDOWS. `sunbeam` is the real sun's direction
 * (sky.js) as a light main.js hangs over the room, casting shadows. Every
 * wall and the ceiling cast shadows too (room.js castShadows), so direct
 * sun reaches only what the windows let it: this is the northwest corner,
 * so it streams in through the west glass in the afternoon and evening,
 * and through the north glass on a summer morning, and never at noon.
 *
 * THE SHINY THINGS SEE A ROOM. The brass, the steel and the desk's lacquer
 * reflect `interiorEnvironment`, a plain box the office's size whose
 * windows glow with the sky of the hour (and the lamp by night), captured
 * by main.js. Only they are given it, so the look of everything else is
 * as it was.
 *
 * THE GLASS IS A MIRROR BY NIGHT. `mirrorCamera` stands a camera where the
 * eye's reflection in a pane would be, and `layMirror` lays what it sees
 * onto the pane, corner by corner (room.js buildReflectionPanes).
 */

/* global THREE */

const DEG = Math.PI / 180;

/** The sun's beam: how strong at full sun, and over how many degrees of
 *  the sun's height it comes up from nothing. The shadow map's reach (half
 *  its width, meters, enough for the whole room from any angle) and its
 *  size, desktop and phone. */
export const SUNBEAM = { strength: 2.4, riseDegrees: 5, reach: 4.6, mapSize: 2048, mapSizeMobile: 1024 };

/** The glass's mirror: how strongly it reflects the room at full night. */
export const MIRROR = { strength: 0.3 };

const smooth = (t) => {
    const x = Math.min(1, Math.max(0, t));
    return x * x * (3 - 2 * x);
};

/**
 * The sun's beam at a moment: `dir`, the direction toward the sun (sky.js
 * `sun`), its `intensity` (nothing below the horizon, coming up over the
 * first few degrees, and dimmed by an overcast sky), and its `color` (the
 * light's own, daylight.js). `look` is the weathered light (weather.js).
 */
export function sunbeam(sky, look) {
    const up = smooth(sky.sunHeight / (SUNBEAM.riseDegrees * DEG));
    const clear = 1 - Math.min(1, Math.max(0, look.overcast || 0));
    return { dir: sky.sun, intensity: SUNBEAM.strength * up * clear, color: look.sunColor };
}

/** How strongly the glass mirrors the room: only as the city outside goes
 *  darker than the room (daylight.js `cityLights`, 1 by night). */
export function mirrorLevel(look) {
    return MIRROR.strength * smooth((look.cityLights - 0.3) / 0.6);
}

/**
 * A plain box the room's size, seen from `from` (in the room's frame), that
 * the room's shiny things reflect: walls, floor and ceiling in their own
 * colors, the two windows glowing with the sky over the city below it, and
 * the lamp. `set(look, lampOn)` colors it for the hour. Everything in it is
 * placed relative to `from`, because a capture looks out from the origin.
 */
export function interiorEnvironment(config, windows, from) {
    const { width, depth, height } = config.room;
    const scene = new THREE.Scene();
    const flat = () => new THREE.MeshBasicMaterial({ side: THREE.BackSide, toneMapped: false, fog: false });
    const faces = { wall: flat(), floor: flat(), ceiling: flat() };
    // The box's faces: +x, -x, +y, -y, +z, -z.
    const room = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth),
        [faces.wall, faces.wall, faces.ceiling, faces.floor, faces.wall, faces.wall]);
    room.position.set(0, height / 2, 0);
    scene.add(room);
    const glow = () => new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false, fog: false });
    const sky = glow();
    const city = glow();
    const hw = width / 2;
    const hd = depth / 2;
    const mid = (windows.sill + windows.head) / 2;
    const half = (windows.head - windows.sill) / 2;
    const band = (w, h, material, x, y, z, turn) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
        m.position.set(x, y, z);
        m.rotation.y = turn;
        scene.add(m);
    };
    // Each window: the sky over its top half, the city across its bottom.
    const bw = windows.back.x1 - windows.back.x0;
    const bx = (windows.back.x0 + windows.back.x1) / 2;
    band(bw, half, sky, bx, mid + half / 2, -hd + 0.01, 0);
    band(bw, half, city, bx, mid - half / 2, -hd + 0.01, 0);
    const rw = windows.right.z1 - windows.right.z0;
    const rz = (windows.right.z0 + windows.right.z1) / 2;
    band(rw, half, sky, hw - 0.01, mid + half / 2, rz, -Math.PI / 2);
    band(rw, half, city, hw - 0.01, mid - half / 2, rz, -Math.PI / 2);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), glow());
    const d = config.room.desk;
    // Under the LED lamp's head (room.js LAMP).
    lamp.position.set(d.x + d.width / 2 - 0.2, d.height + 0.33, d.z - d.depth / 2 + 0.35);
    scene.add(lamp);
    scene.position.set(-from[0], -from[1], -from[2]);
    scene.updateMatrixWorld(true);
    const linear = (hex, k) => new THREE.Color().setHex(hex, THREE.SRGBColorSpace).multiplyScalar(k);
    return {
        scene,
        from,
        parts: { faces, sky, city, lamp },
        /** Color it for a light level (daylight.js `lighting`, weathered)
         *  and the lamp. The windows' light is what the room is lit by; by
         *  night the lamp is. */
        set(look, lampOn) {
            const day = 1 - look.cityLights;
            // The white walls at the brightness the old beige ones were tuned
            // to (it is about 6% brighter), so the windows still outshine them.
            faces.wall.color.copy(linear(0xf3f2ef, 0.113 + 0.375 * day));
            faces.ceiling.color.copy(linear(0xf6f5f2, 0.1 + 0.45 * day));
            faces.floor.color.copy(linear(0xcfcbc4, 0.08 + 0.3 * day));
            sky.color.copy(linear(look.skyTop, 0.25 + 2.6 * day));
            city.color.copy(linear(look.cityNear, 0.3 + 1.2 * day)).add(linear(0xffc98a, 0.25 * look.cityLights));
            lamp.visible = !!lampOn;
            lamp.material.color.copy(linear(0xffd9a0, 4));
            return this;
        }
    };
}

/**
 * Stand `out` (a PerspectiveCamera) where `camera`'s reflection in a pane
 * is: the pane is `{ normal, point }`, its plane, the normal into the room.
 * Position, aim and up are all mirrored (as three's Reflector does), so
 * `out` is an ordinary camera looking back into the room through the pane.
 * False, and `out` untouched, when the camera is not on the room's side.
 */
export function mirrorCamera(camera, pane, out) {
    const n = new THREE.Vector3(...pane.normal);
    const p = new THREE.Vector3(...pane.point);
    camera.updateMatrixWorld();
    const eye = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
    if (eye.clone().sub(p).dot(n) <= 0) return false;
    const turn = new THREE.Matrix4().extractRotation(camera.matrixWorld);
    const mirror = (v) => v.clone().sub(n.clone().multiplyScalar(2 * v.clone().sub(p).dot(n)));
    const ahead = new THREE.Vector3(0, 0, -1).applyMatrix4(turn).add(eye);
    out.position.copy(mirror(eye));
    out.up.set(0, 1, 0).applyMatrix4(turn).reflect(n);
    out.lookAt(mirror(ahead));
    out.near = camera.near;
    out.far = camera.far;
    out.updateMatrixWorld();
    out.projectionMatrix.copy(camera.projectionMatrix);
    out.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    return true;
}

/**
 * Lay the mirror camera's picture onto a pane: each of the pane's grid
 * points takes the place in the picture where that camera sees it, so the
 * texel at a point of the glass is what the reflected ray through it meets.
 */
export function layMirror(mesh, mirrorCam) {
    mesh.updateMatrixWorld();
    const pos = mesh.geometry.attributes.position;
    const uv = mesh.geometry.attributes.uv;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).project(mirrorCam);
        uv.setXY(i, (v.x + 1) / 2, (v.y + 1) / 2);
    }
    uv.needsUpdate = true;
    return uv;
}
