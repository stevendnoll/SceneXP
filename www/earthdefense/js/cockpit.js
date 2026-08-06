// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * cockpit.js - The canopy the visitor looks out of, and where the guns sit.
 *
 * M4 DRAFT. This is the first pass of three or four. It exists now, rather than
 * at M7, for two reasons: the canopy needs judging by eye at several aspect
 * ratios and that takes iterations, and `weapons` needs muzzle positions from
 * somewhere before it can fire a tracer that reads as coming from a ship.
 *
 * IT LIVES IN THE OVERLAY SCENE. The world camera's near plane is 100 units,
 * so anything a metre from the eye would be clipped away entirely. The overlay
 * camera (near 0.1, far 100) draws after a depth clear, which is the whole
 * reason space-1.0.0 carries two cameras. Everything built here is therefore in
 * OVERLAY units, a couple of units from the eye, and it never moves: the
 * overlay camera stays at the origin looking down -Z while the world camera
 * flies, so the canopy is simply always there.
 *
 * NOTHING HERE IS LIT. The overlay scene has no lights in it, on purpose, so
 * every material is `MeshBasicMaterial` and the canopy reads as a dark
 * silhouette with a warm glow rather than as a surface catching the sun.
 *
 * THE CENTRE OF THE SCREEN IS THE WEAPON, so the middle of the frame is left
 * completely clear and every piece is pushed out to the edges. The frame is
 * rebuilt on resize rather than scaled, because a portrait phone and a wide
 * desktop want different shapes, not the same shape stretched.
 *
 * THE MUZZLES ARE NOT IN THIS SCENE. Tracers cross thousands of kilometres, so
 * they belong to the world. What the cockpit owns is where the guns sit
 * relative to the ship, in WORLD units, and `muzzleWorldPositions` turns that
 * into two points using the world camera's own transform.
 */

import { EARTHDEFENSE_CONFIG } from './config.min.js';

// The canopy plane sits this far in front of the eye in overlay units. Far
// enough that it does not distort at the corners, near enough to stay inside
// the overlay camera's 100 unit far plane with room to spare.
const CANOPY_Z = -3;

let scene = null;
let frame = null;
let glow = null;
let parts = null;
let localMuzzles = [];
// Held from init, so a resize lays out against the SAME config the canopy was
// built from rather than reaching back to the import and half-ignoring what
// the caller passed.
let active = null;

/** Build the canopy and return the overlay scene to hand to renderSpace(). */
export function initCockpit(config = EARTHDEFENSE_CONFIG) {
    disposeCockpit();

    active = config;
    scene = new THREE.Scene();
    frame = new THREE.Group();
    frame.name = 'canopy';
    scene.add(frame);

    const cfg = config.cockpit || {};
    parts = buildParts(cfg);
    glow = parts.glow;

    // Muzzles in ship-local world units: right and left, below the eye line,
    // and well ahead of it. See config.js for why they are so far out.
    const m = cfg.muzzle || { lateral: 84, drop: 66, forward: 300 };
    localMuzzles = [
        { x: m.lateral, y: -m.drop, z: -m.forward },
        { x: -m.lateral, y: -m.drop, z: -m.forward }
    ];

    layout(currentAspect(), cfg);
    return scene;
}

function buildParts(cfg) {
    const shell = new THREE.MeshBasicMaterial({
        color: cfg.frameColor === undefined ? 0x14181f : cfg.frameColor
    });
    const strut = new THREE.MeshBasicMaterial({
        color: cfg.strutColor === undefined ? 0x2a323d : cfg.strutColor,
        transparent: true,
        opacity: 0.9
    });
    const warm = new THREE.MeshBasicMaterial({
        color: cfg.glowColor === undefined ? 0xff9a5c : cfg.glowColor,
        transparent: true,
        opacity: 0.55,
        depthWrite: false
    });

    const unitBox = new THREE.BoxGeometry(1, 1, 0.06);

    // The dash: a low slab along the bottom edge. Low is the whole brief. It
    // reads as the top of an instrument binnacle rather than as a wall, and it
    // is the only piece allowed to eat any real vertical space.
    const dash = new THREE.Mesh(unitBox, shell);
    dash.name = 'dash';
    frame.add(dash);

    // Two struts rising from the lower corners toward the canopy sides. They
    // do the work of telling the eye it is inside something, at almost no cost
    // in obscured sky.
    const struts = [new THREE.Mesh(unitBox, strut), new THREE.Mesh(unitBox, strut)];
    struts.forEach((s, i) => { s.name = `strut-${i}`; frame.add(s); });

    // A warm indicator strip along the top of the dash, which is the "warm
    // indicator glow rather than a wall of instruments" from the PRD.
    const glowStrip = new THREE.Mesh(unitBox, warm);
    glowStrip.name = 'indicator-glow';
    frame.add(glowStrip);

    return { shell, strut, warm, unitBox, dash, struts, glow: glowStrip };
}

/** Reposition every piece for an aspect ratio.
 *
 *  Rebuilt rather than scaled: the half-height of the frame at the canopy
 *  plane is fixed by the vertical field of view, so only the half-width moves,
 *  and a portrait phone therefore wants the struts tucked in while a wide
 *  desktop wants them out at the edges. Scaling one layout to fit both is what
 *  produces a canopy that looks stretched on a phone. */
export function resizeCockpit(aspect) {
    if (!scene) return;
    layout(aspect || currentAspect(), (active.cockpit || {}));
}

function layout(aspect, cfg) {
    if (!parts) return;
    const fov = (active.space.overlayCamera.fov * Math.PI) / 180;
    const halfHeight = Math.abs(CANOPY_Z) * Math.tan(fov / 2);
    const halfWidth = halfHeight * aspect;

    // The dash occupies the bottom `dashFraction` of the frame. A twelfth is
    // the M4 starting value: enough to read as a cockpit, little enough that
    // Earth's limb in the opening frame (which sits about a third of the way up)
    // is nowhere near it.
    const dashFraction = cfg.dashFraction === undefined ? 0.12 : cfg.dashFraction;
    const dashHeight = halfHeight * 2 * dashFraction;

    parts.dash.scale.set(halfWidth * 2.4, dashHeight, 1);
    parts.dash.position.set(0, -halfHeight + dashHeight * 0.5, CANOPY_Z);

    parts.glow.scale.set(halfWidth * 1.5, dashHeight * 0.09, 1);
    parts.glow.position.set(0, -halfHeight + dashHeight, CANOPY_Z + 0.01);

    // The struts lean inward as they rise, meeting nothing: they run off the
    // top of the frame rather than closing into an arch, which is what keeps
    // the upper sky (where Mars sits) completely open.
    //
    // The lean is derived from the aspect, not fixed. A fixed ANGLE looks
    // right on a desktop and then swings a portrait phone's struts a third of
    // the way to the centre, because the frame is much taller than it is wide.
    // Fixing the top INSET as a fraction of the half-width instead gives the
    // same silhouette at every shape.
    const strutWidth = halfWidth * 0.055;
    const topInset = cfg.strutTopInset === undefined ? 0.28 : cfg.strutTopInset;
    const rise = halfHeight * 1.1;
    const lean = Math.atan((topInset * halfWidth) / rise);
    parts.struts.forEach((s, i) => {
        const side = i === 0 ? 1 : -1;
        s.scale.set(strutWidth, rise * 2, 1);
        s.position.set(side * halfWidth * 1.02, 0, CANOPY_Z);
        s.rotation.z = side * lean;
    });
}

/** The two gun positions in WORLD space, for weapons to fire tracers from.
 *
 *  `camera` is the world camera, so this follows the ship exactly without the
 *  cockpit having to know anything about flight. Returns the same two objects
 *  every call, rewritten in place, because this runs once a frame. */
const muzzleOut = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }];
const muzzleScratch = { v: null };

export function muzzleWorldPositions(camera) {
    if (!camera || localMuzzles.length === 0) return muzzleOut;
    if (!muzzleScratch.v) muzzleScratch.v = new THREE.Vector3();

    for (let i = 0; i < localMuzzles.length; i++) {
        const m = localMuzzles[i];
        muzzleScratch.v.set(m.x, m.y, m.z);
        camera.localToWorld(muzzleScratch.v);
        muzzleOut[i].x = muzzleScratch.v.x;
        muzzleOut[i].y = muzzleScratch.v.y;
        muzzleOut[i].z = muzzleScratch.v.z;
    }
    return muzzleOut;
}

/** Pulse the indicator glow while the guns are firing. The only moving part in
 *  the canopy, and it is deliberately slow and shallow: nothing in this
 *  experience may flash anywhere near the photosensitivity thresholds. */
export function setCockpitFiring(firing) {
    if (!glow) return;
    glow.material.opacity = firing ? 0.85 : 0.55;
}

export function getCockpitScene() { return scene; }
export function getCanopy() { return frame; }
export function getLocalMuzzles() { return localMuzzles; }

export function disposeCockpit() {
    if (parts) {
        parts.unitBox.dispose();
        parts.shell.dispose();
        parts.strut.dispose();
        parts.warm.dispose();
    }
    parts = null;
    active = null;
    scene = null;
    frame = null;
    glow = null;
    localMuzzles = [];
    muzzleScratch.v = null;
}

function currentAspect() {
    if (typeof window === 'undefined' || !window.innerHeight) return 16 / 9;
    return window.innerWidth / window.innerHeight;
}

export const __test__ = { layout, CANOPY_Z, currentAspect };
