// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * carmesh.js - a car's mesh from its build (M1): the body is the side
 * profile, the same stations car.js weighs, extruded across the body's
 * width, with four wheels at the axle slots. The workshop's carving (M4)
 * will change the stations and the mesh follows, because it is the same
 * data.
 *
 * THE CAR'S OWN FRAME: the nose at the origin, the car reaching back along
 * -x, y up from the track under its wheels, z across. track.carPose places
 * that frame on the track.
 *
 * M1 IS GRAYBOX: one paint color, plain wheels. Decals, the number, the
 * top profile and weights in their pockets come with the workshop.
 */

import { DERBY_CONFIG } from './config.min.js';

/** The side outline in the car's frame, nose to tail along the top and back
 *  along the bottom: [[x, y], ...]. Pure, for tests. */
export function outlineOf(stations, C = DERBY_CONFIG) {
    const K = C.kit;
    const base = K.wheel.radius - K.axleHeight;
    const top = stations.map(([x, , t]) => [-x, base + t]);
    const bottom = stations.slice().reverse().map(([x, b]) => [-x, base + b]);
    return top.concat(bottom);
}

/** Where the four wheels sit in the car's frame: [[x, y, z], ...], front
 *  pair first. */
export function wheelSpots(car, C = DERBY_CONFIG) {
    const W = C.kit.wheel;
    const half = car.dims.wheelGap / 2 + W.thickness / 2 + 0.001;
    const spots = [];
    for (const x of [car.frontAxle, car.rearAxle]) {
        spots.push([-x, W.radius, -half], [-x, W.radius, half]);
    }
    return spots;
}

let wheelGeometry = null;

/**
 * The car's mesh: a group in the car's own frame. `color` is its paint.
 * Returns { group, dispose }.
 */
export function buildCarMesh(build, car, { color = 0xcccccc, shadows = false } = {}, C = DERBY_CONFIG) {
    const group = new THREE.Group();
    group.name = 'car';
    const outline = outlineOf(build.stations, C);
    const shape = new THREE.Shape();
    shape.moveTo(outline[0][0], outline[0][1]);
    for (let i = 1; i < outline.length; i++) shape.lineTo(outline[i][0], outline[i][1]);
    shape.closePath();
    const width = car.body.width;
    const bodyGeometry = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 1 });
    bodyGeometry.translate(0, 0, -width / 2);
    const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.08 });
    const body = new THREE.Mesh(bodyGeometry, paint);
    body.castShadow = shadows;
    group.add(body);

    const W = C.kit.wheel;
    if (!wheelGeometry) {
        wheelGeometry = new THREE.CylinderGeometry(W.radius, W.radius, W.thickness, 20);
        wheelGeometry.rotateX(Math.PI / 2);
    }
    const tire = new THREE.MeshStandardMaterial({ color: C.look.wheel, roughness: 0.6 });
    const wheels = wheelSpots(car, C).map(([x, y, z]) => {
        const w = new THREE.Mesh(wheelGeometry, tire);
        w.position.set(x, y, z);
        w.castShadow = shadows;
        group.add(w);
        return w;
    });

    return {
        group,
        wheels,
        /** Spin the wheels for `meters` rolled. */
        roll(meters) {
            const a = -meters / W.radius;
            for (const w of wheels) w.rotation.z = a;
        },
        dispose() {
            bodyGeometry.dispose();
            paint.dispose();
            tire.dispose();
        }
    };
}
