// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * cockpit.js - The canopy the visitor looks out of, and where the guns sit.
 *
 * DRAFTED AT M4, MADE TUNABLE AT M7. The shape is still a judgement call made
 * against screenshots at three aspect ratios, so the job of this file is to put
 * every proportion of that judgement into config.js and keep none of it here.
 * A design pass should be editing numbers and reloading. What lives in this
 * file is only the arithmetic that turns those numbers into a frame, plus the
 * two rules the arithmetic is not allowed to break: the centre stays clear, and
 * Earth's limb in the opening frame stays uncovered.
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
        opacity: fraction(cfg, 'glowOpacity', 0.85),
        depthWrite: false
    });
    // The lit edge. Not a light and not emissive, just a lighter value, which
    // is all a canopy edge ever is at night.
    const edge = new THREE.MeshBasicMaterial({
        color: cfg.edgeColor === undefined ? 0x46525f : cfg.edgeColor
    });

    const unitBox = new THREE.BoxGeometry(1, 1, 0.06);

    // The dash: a low slab along the bottom edge. Low is the whole brief. It
    // reads as the top of an instrument binnacle rather than as a wall, and it
    // is the only piece allowed to eat any real vertical space.
    const dash = new THREE.Mesh(unitBox, shell);
    dash.name = 'dash';
    frame.add(dash);

    // The lit top edge of the dash. Without it the dash is the same value as
    // empty space and simply is not there.
    const lip = new THREE.Mesh(unitBox, edge);
    lip.name = 'dash-lip';
    frame.add(lip);

    // The console rising toward the side windows. Two short bars at the ends of
    // the dash, tilted up and outward, and they do more for the silhouette than
    // their size suggests: without them the bottom edge is a black stripe, and
    // with them it is a moulded thing the visitor is sitting behind.
    const flares = [new THREE.Mesh(unitBox, shell), new THREE.Mesh(unitBox, shell)];
    flares.forEach((f, i) => { f.name = `dash-flare-${i}`; frame.add(f); });

    // The brow along the top edge, thin on purpose. PRD 7 asks for a frame that
    // BRACKETS the view, and a bottom edge with nothing opposite it reads as a
    // dashboard rather than as a canopy. Thin enough that the sky above Mars
    // stays open.
    const brow = new THREE.Mesh(unitBox, shell);
    brow.name = 'brow';
    frame.add(brow);

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

    return { shell, strut, warm, edge, unitBox, dash, lip, flares, brow, struts, glow: glowStrip };
}

/** A config fraction, with a fallback. Every proportion in the canopy comes
 *  through here, so a config with a piece missing is a canopy without that
 *  piece rather than a canopy full of NaN. */
function fraction(cfg, key, fallback) {
    const value = cfg[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
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
    const dashHeight = halfHeight * 2 * fraction(cfg, 'dashFraction', 0.12);

    parts.dash.scale.set(halfWidth * 2.4, dashHeight, 1);
    parts.dash.position.set(0, -halfHeight + dashHeight * 0.5, CANOPY_Z);

    // The lit edge sits ON the dash's top line and spans the same width, so the
    // dash gets a defined upper boundary instead of fading into the sky.
    const lipHeight = dashHeight * fraction(cfg, 'dashLipFraction', 0.055);
    parts.lip.visible = lipHeight > 0;
    parts.lip.scale.set(halfWidth * 2.4, Math.max(lipHeight, 0.0001), 1);
    parts.lip.position.set(0, -halfHeight + dashHeight + lipHeight * 0.5, CANOPY_Z + 0.005);

    // Narrow and bright: an indicator, not a plank across the screen.
    parts.glow.scale.set(halfWidth * fraction(cfg, 'glowWidth', 0.5), dashHeight * 0.07, 1);
    parts.glow.position.set(0, -halfHeight + dashHeight * 0.62, CANOPY_Z + 0.01);

    // The dash flares. Tilted so the OUTER end rises, which is why the rotation
    // takes the side's sign: for the right-hand flare the outer end is the one
    // at local +x, and for the left-hand one it is at local -x, so the same
    // signed angle lifts the correct end of each.
    const flareAngle = fraction(cfg, 'dashFlareAngle', 0.32);
    const flareLength = halfWidth * fraction(cfg, 'dashFlareLength', 0.6);
    const flareOffset = halfWidth * fraction(cfg, 'dashFlareOffset', 0.72);
    parts.flares.forEach((f, i) => {
        const side = i === 0 ? 1 : -1;
        f.visible = flareAngle !== 0 && flareLength > 0;
        f.scale.set(flareLength, dashHeight * 0.55, 1);
        f.position.set(side * flareOffset, -halfHeight + dashHeight * 0.9, CANOPY_Z - 0.01);
        f.rotation.z = side * flareAngle;
    });

    const browHeight = halfHeight * 2 * fraction(cfg, 'browFraction', 0.055);
    parts.brow.visible = browHeight > 0;
    parts.brow.scale.set(halfWidth * 2.4, Math.max(browHeight, 0.0001), 1);
    parts.brow.position.set(0, halfHeight - browHeight * 0.5, CANOPY_Z);

    // The struts lean inward as they rise, meeting nothing: they run off the
    // top of the frame rather than closing into an arch, which is what keeps
    // the upper sky open and what keeps the brow reading as a separate edge
    // rather than as the top of a windscreen.
    //
    // The lean is derived from the aspect, not fixed. A fixed ANGLE looks
    // right on a desktop and then swings a portrait phone's struts a third of
    // the way to the centre, because the frame is much taller than it is wide.
    // Fixing the top INSET as a fraction of the half-width instead gives the
    // same silhouette at every shape.
    const strutWidth = halfWidth * fraction(cfg, 'strutWidth', 0.055);
    const topInset = fraction(cfg, 'strutTopInset', 0.28);
    const rise = halfHeight * fraction(cfg, 'strutRise', 1.1);
    const lean = Math.atan((topInset * halfWidth) / rise);
    parts.struts.forEach((s, i) => {
        const side = i === 0 ? 1 : -1;
        s.visible = strutWidth > 0;
        s.scale.set(Math.max(strutWidth, 0.0001), rise * 2, 1);
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
        parts.edge.dispose();
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
