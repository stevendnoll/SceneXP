// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * checkin.js - the weigh-in (M5.2, PRD Check-in): the registration table
 * near the start of the track, its scale and the gauge box, and the
 * tap-then-watch beat of a car being weighed in.
 *
 *   place   the car set on the scale
 *   count   the reading counts up to its weight
 *   hold    the reading held: under the limit, a little cheer, or over it,
 *           a buzz, and the car goes back to the bench with a kind note
 *   gauge   the car slides through the gauge box, the rule sheet's width
 *           and clearance made wood
 *   result  each check shown: passed, or the one it failed
 *
 * THE VERDICT IS car.js's RULE CHECK, the same one the bench shows, so the
 * weigh-in never disagrees with the sheet: the scale judges the weight, the
 * gauge box everything else. A Time Trial weighs each of the visitor's cars
 * in turn, a little faster, and stops at the first that fails. Reduced
 * motion holds each car still at its final reading (PRD, Accessibility).
 *
 * The volunteer who sets the car down joins with the dressed hall (M6).
 */

import { DERBY_CONFIG } from './config.min.js';
import { describeCar, checkRules } from './car.min.js';
import { fitDistance } from './director.min.js';

/** A build's verdict at the weigh-in: { ok, failed: null | 'mass' |
 *  'shape', checks } from its own sheet's checks. Pure. */
export function verdictOf(build, C = DERBY_CONFIG) {
    const car = describeCar(build, C);
    const checks = checkRules(car, build.rules, C);
    const mass = checks.find((c) => c.rule === 'mass');
    const shapeFails = checks.filter((c) => c.rule !== 'mass' && !c.ok);
    return { ok: mass.ok && !shapeFails.length, failed: !mass.ok ? 'mass' : shapeFails.length ? 'shape' : null, checks, car };
}

/**
 * The weigh-in's timeline for the visitor's builds: a run of segments for
 * each car, { car, kind, from, to }, stopping after the first car that
 * fails. Returns { segments, total, verdicts, failedAt (a car index or
 * -1) }. Pure.
 */
export function planWeighIn(builds, { reducedMotion = false } = {}, C = DERBY_CONFIG) {
    const K = C.weighIn;
    const pace = builds.length > 1 ? K.several : 1;
    const segments = [];
    const verdicts = builds.map((b) => verdictOf(b, C));
    let t = 0;
    const add = (car, kind, seconds) => {
        segments.push({ car, kind, from: t, to: t + seconds });
        t += seconds;
    };
    let failedAt = -1;
    for (let i = 0; i < builds.length; i++) {
        const v = verdicts[i];
        if (reducedMotion) {
            add(i, v.failed === 'mass' ? 'over' : v.failed ? 'stuck' : 'still', K.still);
        } else {
            add(i, 'place', K.place * pace);
            add(i, 'count', K.count * pace);
            if (v.failed === 'mass') {
                add(i, 'over', K.hold + K.result);
            } else {
                add(i, 'hold', K.hold * pace);
                add(i, 'gauge', K.gauge * pace);
                add(i, v.failed ? 'stuck' : 'result', K.result * (v.failed ? 1 : pace));
            }
        }
        if (!v.ok) {
            failedAt = i;
            break;
        }
    }
    return { segments, total: t, verdicts, failedAt };
}

/** What the weigh-in shows at second `t`: the segment, how far through it
 *  (0 to 1), and whether it is over. Pure. */
export function weighMoment(plan, t) {
    let seg = plan.segments[plan.segments.length - 1];
    for (const s of plan.segments) {
        if (t < s.to) {
            seg = s;
            break;
        }
    }
    const span = seg.to - seg.from;
    const progress = span > 0 ? Math.min(1, Math.max(0, (t - seg.from) / span)) : 1;
    return { segment: seg, car: seg.car, kind: seg.kind, progress, done: t >= plan.total };
}

/** How much of the weight the scale shows during a moment, 0 to 1. Pure. */
export function readingShare(kind, progress) {
    if (kind === 'place') return 0;
    if (kind === 'count') return 1 - (1 - progress) * (1 - progress);
    return 1;
}

/** The scale's readout on a canvas: green on black, or red when over. */
function drawReadout(g, w, h, text, over) {
    g.fillStyle = '#121a14';
    g.fillRect(0, 0, w, h);
    g.fillStyle = over ? '#ff5a4f' : '#7dff9a';
    g.font = 'bold 60px ui-monospace, Menlo, Consolas, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
}

/**
 * The registration table, in the hall: the scale on the left, the gauge
 * box on the right. Returns { group, carAt(kind, progress, car) (where the
 * car's nose goes: a world { x, y, z }), setReading(text, over), shot(aspect)
 * (the camera's { position, target }) }.
 */
export function buildCheckinTable(C = DERBY_CONFIG) {
    const W = C.weighIn;
    const K = C.kit;
    const group = new THREE.Group();
    group.name = 'registration';
    group.position.set(W.at.x, 0, W.at.z);
    const mat = (color, roughness = 0.6, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });

    const top = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.04, 0.7), mat(0xe9e4da, 0.7));
    top.position.y = W.top - 0.02;
    group.add(top);
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(1.52, W.top - 0.06, 0.02), mat(0x1f4e8c, 0.9));
    cloth.position.set(0, (W.top - 0.06) / 2, 0.35);
    group.add(cloth);
    for (const x of [-0.7, 0.7]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, W.top - 0.04, 0.6), mat(0x8a8f96, 0.5, 0.4));
        leg.position.set(x, (W.top - 0.04) / 2, 0);
        group.add(leg);
    }

    // The scale, its pan the car stands on, its readout facing the camera.
    const scaleX = -0.32;
    const pan = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.12), mat(0xe8e4dc, 0.35, 0.2));
    pan.position.set(scaleX, W.top + 0.015, 0);
    group.add(pan);
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    const readout = new THREE.CanvasTexture(canvas);
    readout.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.035), new THREE.MeshBasicMaterial({ map: readout }));
    screen.position.set(scaleX, W.top + 0.02, 0.0605);
    screen.rotation.x = -0.4;
    group.add(screen);
    const panTop = W.top + 0.03;

    // The gauge box: two walls the sheet's width apart, a bar over them,
    // and a sill the sheet's clearance high, so a car that is too wide or
    // too low cannot pass.
    const gaugeX = 0.28;
    const R = C.rules.standard;
    const wood = mat(0xd9b07a, 0.7);
    for (const s of [-1, 1]) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.07, 0.012), wood);
        wall.position.set(gaugeX, W.top + 0.035, s * (R.maxWidth / 2 + 0.006));
        group.add(wall);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.012, R.maxWidth + 0.024), wood);
    bar.position.set(gaugeX, W.top + 0.076, 0);
    group.add(bar);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(K.length + 0.5, 0.003, 0.05), mat(0xc7ccd3, 0.4, 0.5));
    rail.position.set((scaleX + gaugeX) / 2 + 0.05, W.top + 0.0015, 0);
    group.add(rail);

    const world = (x, y, z) => ({ x: W.at.x + x, y, z: W.at.z + z });
    return {
        group,
        /** Where the car's nose goes in the moment, the car frame's nose
         *  pointing down the table toward the gauge box (+x). */
        carAt(kind, progress) {
            const onScale = scaleX + K.length / 2;
            const past = gaugeX + 0.11 + K.length + 0.02;
            if (kind === 'gauge') return world(onScale + (past - onScale) * (progress * progress * (3 - 2 * progress)), W.top + 0.003, 0);
            if (kind === 'result') return world(past, W.top + 0.003, 0);
            if (kind === 'stuck') return world(gaugeX - 0.11 - 0.005, W.top + 0.003, 0);
            if (kind === 'place') return world(onScale, panTop + 0.04 * (1 - progress), 0);
            return world(onScale, panTop, 0);
        },
        setReading(text, over = false) {
            drawReadout(canvas.getContext('2d'), canvas.width, canvas.height, text, over);
            readout.needsUpdate = true;
        },
        /** The camera on the table, holding the scale and the gauge box. */
        shot(aspect) {
            const target = world(0, W.top + 0.04, 0);
            const d = Math.max(0.7, fitDistance(0.55, C.camera.fov, aspect));
            const dir = [0.12, 0.42, 1];
            const n = Math.hypot(...dir);
            return { target, position: { x: target.x + (dir[0] / n) * d, y: target.y + (dir[1] / n) * d, z: target.z + (dir[2] / n) * d } };
        }
    };
}
