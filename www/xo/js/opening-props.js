// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * opening-props.js - The home team's water cooler, its table, the water and
 * the puddle, drawn from `opening.propsAt`.
 *
 * THE ONE THING THE VISITORS TAKE. Everything else they do in the opening is
 * rude; knocking over the home team's cooler is the wrong the title answers.
 *
 * Nothing here decides anything: where the cooler is, how far over, where every
 * drop of water is, all come from the pure timeline in opening.js, so a skipped
 * or stalled opening draws the right frame. Built the first time the opening
 * plays and put away when the welcome card comes up. A table, a cooler, a lid,
 * one disc and a few dozen points, so there is nothing to download.
 */
import { XO_CONFIG as CFG } from './config.min.js';
import { jerseyOf } from './colors.min.js';

let scene = null;
let props = null;
/** Kept here rather than read back off the group, which a test's stand-in
 *  THREE cannot remember. */
let showing = false;

export function initOpeningProps(target) {
    scene = target;
}

function build() {
    if (props || !scene) return props;
    const P = CFG.opening.props;
    const T = P.table;
    const C = P.cooler;
    const group = new THREE.Group();
    group.name = 'opening-props';

    // THE TABLE: a top and four legs, long side along the way the cooler goes.
    const tableMat = new THREE.MeshStandardMaterial({ color: P.colors.table, roughness: 0.7 });
    const legMat = new THREE.MeshStandardMaterial({ color: P.colors.legs, roughness: 0.6, metalness: 0.2 });
    const table = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(T.width, T.top, T.depth), tableMat);
    top.position.y = T.height - T.top / 2;
    table.add(top);
    const legGeo = new THREE.BoxGeometry(T.leg, T.height - T.top, T.leg);
    for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
            const leg = new THREE.Mesh(legGeo, legMat);
            leg.position.set(sx * (T.width / 2 - T.leg), (T.height - T.top) / 2, sz * (T.depth / 2 - T.leg));
            table.add(leg);
        }
    }
    group.add(table);

    // THE COOLER, in the home orange, with a white lid and a white band. Its
    // own origin is its middle, so tipping it is one rotation.
    // The home team's cooler, in the home team's jersey color.
    const coolerMat = new THREE.MeshStandardMaterial({ color: jerseyOf(0), roughness: 0.45 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: P.colors.lid, roughness: 0.5 });
    const cooler = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(C.radius, C.radius * 0.94, C.height, 20), coolerMat);
    cooler.add(body);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(C.radius * 1.01, C.radius * 1.0, C.height * 0.14, 20), whiteMat);
    band.position.y = C.height * 0.18;
    cooler.add(band);
    group.add(cooler);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(C.radius * 1.04, C.radius * 1.04, C.lid, 20), whiteMat);
    group.add(lid);

    // THE PUDDLE: wet grass is darker grass. A disc just above the turf, drawn
    // over it without fighting it for depth.
    const puddle = new THREE.Mesh(
        new THREE.CircleGeometry(1, 28),
        new THREE.MeshBasicMaterial({
            color: P.puddle.color, transparent: true, opacity: P.puddle.opacity,
            depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
        })
    );
    puddle.rotation.x = -Math.PI / 2;
    puddle.position.y = 0.02;
    group.add(puddle);

    // THE WATER, one point per drop.
    const S = P.splash;
    const positions = new Float32Array(S.count * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const splash = new THREE.Points(geometry, new THREE.PointsMaterial({
        color: S.color, size: S.size, transparent: true, opacity: 0.9, depthWrite: false,
    }));
    splash.frustumCulled = false;
    group.add(splash);

    group.visible = false;
    scene.add(group);
    props = { group, table, cooler, lid, puddle, splash, positions, coolerMat };
    return props;
}

/** Draw the props as `state` from `opening.propsAt` describes them. */
export function applyOpeningProps(state) {
    const p = build();
    if (!p || !state) return;
    const P = CFG.opening.props;
    p.group.visible = true;
    showing = true;
    // Asked every frame, because the visitor can change it between openings.
    p.coolerMat.color.set(jerseyOf(0));
    p.table.position.set(state.table.x, 0, state.table.z);

    // Tipped toward `angle` on the grass: yaw the cooler to face that way, then
    // pitch it over about its own sideways axis.
    const yaw = state.puddle.angle;
    p.cooler.rotation.order = 'YXZ';
    p.cooler.position.set(state.cooler.x, state.cooler.y, state.cooler.z);
    p.cooler.rotation.set(state.cooler.tip, yaw, 0);

    if (state.lid) {
        p.lid.position.set(state.lid.x, state.lid.y, state.lid.z);
        p.lid.rotation.order = 'YXZ';
        p.lid.rotation.set(state.lid.tip, yaw, 0);
    } else {
        // Still on: at the top of the cooler, along its axis.
        const along = P.cooler.height / 2 + P.cooler.lid / 2;
        const lean = state.cooler.tip;
        p.lid.position.set(
            state.cooler.x + Math.sin(yaw) * Math.sin(lean) * along,
            state.cooler.y + Math.cos(lean) * along,
            state.cooler.z + Math.cos(yaw) * Math.sin(lean) * along
        );
        p.lid.rotation.order = 'YXZ';
        p.lid.rotation.set(lean, yaw, 0);
    }

    const size = state.puddle.size;
    p.puddle.visible = size > 0.001;
    p.puddle.position.set(state.puddle.x, 0.02, state.puddle.z);
    // Laid flat, the disc's own y runs along -z turned by its z rotation, so a
    // rotation of `yaw` stretches it along the way the cooler fell.
    p.puddle.rotation.set(-Math.PI / 2, 0, yaw);
    p.puddle.scale.set(P.puddle.radius * size, P.puddle.radius * P.puddle.stretch * size, 1);

    if (state.splash !== p.positions) p.positions.set(state.splash);
    p.splash.geometry.attributes.position.needsUpdate = true;
}

/** The scratch buffer `propsAt` can write the water into, so a frame allocates nothing. */
export function splashBuffer() {
    const p = build();
    return p ? p.positions : null;
}

/** Put it all away, which is what the welcome card comes up over. */
export function hideOpeningProps() {
    if (props) props.group.visible = false;
    showing = false;
}

/** Whether anything is on show, for the suite. */
export function openingPropsShowing() {
    return showing;
}
