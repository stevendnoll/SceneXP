// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * hud.js - The counters, markers, and alerts drawn over the scene.
 *
 * DOM RATHER THAN CANVAS. Every element here is a real node styled by the
 * shared stylesheet, which means it inherits the theme tokens, the focus rings,
 * the reduced-motion rules, and the text scaling for free, and it means a
 * screen reader can be told what is happening rather than being shown a
 * texture. A canvas HUD would have to reimplement all of that badly.
 *
 * NOTHING IS WRITTEN THAT HAS NOT CHANGED. Layout is the expensive part of a
 * DOM overlay, so every counter, banner, and class toggle is compared against
 * what is already on screen first. The positions of the markers do change every
 * frame, which is what transforms are for: they composite without reflowing.
 *
 * THE PROJECTION LIVES HERE, once, for everyone. Turning a world point into a
 * screen pixel has one classic bug in it, and it is nasty: `camera.project()`
 * happily returns coordinates for a point BEHIND the eye, mirrored through the
 * origin, so a marker for something behind you appears on the opposite edge
 * pointing confidently the wrong way. `writeProjection` checks the sign of the
 * view-space z first, unmirrors it, and reports the point as off-screen, which
 * is exactly what an edge chevron wants to be told. main.js uses the same
 * function for the target lock bracket rather than keeping a second copy.
 *
 * NOTHING IS CARRIED BY COLOUR ALONE (PRD 8.5). A hostile pip is a diamond and
 * a nav marker is a ring, so the two are told apart by shape at a glance and by
 * someone who cannot separate the hues at all. Every counter and every alert is
 * also present as a sentence in a polite live region.
 */

import { EARTHDEFENSE_CONFIG } from './config.min.js';

let cfg = null;
let el = null;
let pips = [];
let livesPips = [];
let navMarkers = [];

// What is currently on screen, so nothing is written twice.
const shown = {
    structures: null,
    ships: null,
    lives: null,
    clock: null,
    alert: null,
    spoken: null
};

// Reused, because this runs sixty times a second.
const projected = { x: 0, y: 0, onScreen: false, behind: false };
const edge = { x: 0, y: 0, angle: 0 };
let scratchVec = null;

// ---- Pure core --------------------------------------------------------------

/** Finish a projection: normalised device coordinates in, CSS pixels out.
 *
 *  `behind` is the sign of the view-space z, decided by the caller before the
 *  projection matrix is applied. A point behind the eye comes back mirrored
 *  through the origin, so it is flipped back here (which points a chevron the
 *  right way) and reported as off-screen (which stops a pip being drawn on top
 *  of something that is nowhere near it). */
export function writeProjection(out, ndcX, ndcY, behind, viewport) {
    const x = behind ? -ndcX : ndcX;
    const y = behind ? -ndcY : ndcY;
    out.x = (x * 0.5 + 0.5) * viewport.width;
    out.y = (-y * 0.5 + 0.5) * viewport.height;
    out.behind = behind;
    out.onScreen = !behind && x >= -1 && x <= 1 && y >= -1 && y <= 1;
    return out;
}

/** Slide a screen point onto the border of an inset rectangle, and give the
 *  bearing to it, so a chevron can sit at the edge pointing outward.
 *
 *  Always lands ON the border, whether the point started inside or outside, so
 *  the caller decides when a chevron is warranted rather than the maths
 *  deciding by accident. */
export function clampToEdge(x, y, viewport, inset, out = {}) {
    const cx = viewport.width / 2;
    const cy = viewport.height / 2;
    let dx = x - cx;
    let dy = y - cy;
    // Dead centre has no bearing at all. Pointing up is the least misleading
    // answer, and it cannot persist for more than a frame.
    if (dx === 0 && dy === 0) dy = -1;

    const halfWidth = Math.max(1, cx - inset);
    const halfHeight = Math.max(1, cy - inset);
    const scale = Math.min(
        halfWidth / Math.max(Math.abs(dx), 1e-6),
        halfHeight / Math.max(Math.abs(dy), 1e-6)
    );

    out.x = cx + dx * scale;
    out.y = cy + dy * scale;
    // Zero points right, which is what a chevron drawn pointing right expects.
    out.angle = Math.atan2(dy, dx);
    return out;
}

/** Seconds to m:ss. Minutes are not padded, because a run is minutes long and
 *  "07:04" reads like a stopwatch rather than like a clock. */
export function formatClock(seconds) {
    const total = Math.max(0, Math.floor(seconds || 0));
    const minutes = Math.floor(total / 60);
    return `${minutes}:${String(total % 60).padStart(2, '0')}`;
}

/** A distance in world units, which are kilometres (config.js, SCALE). Rounded
 *  hard on purpose: nobody is navigating to the metre, and a readout whose last
 *  digits churn every frame is noise sitting next to the reticle. */
export function formatDistance(units) {
    const km = Math.max(0, Math.round(units || 0));
    if (km >= 10000) return `${Math.round(km / 1000).toLocaleString()}k km`;
    return `${km.toLocaleString()} km`;
}

// ---- Build ------------------------------------------------------------------

/** Find the markup, build the per-ship and per-body markers, and start empty.
 *  Safe on a page that is missing any of it: every write below is guarded, so a
 *  cut-down page renders the scene and simply has no HUD. */
export function initHud(config = EARTHDEFENSE_CONFIG) {
    disposeHud();
    cfg = config;

    el = {
        structures: document.getElementById('structures-count'),
        ships: document.getElementById('ships-count'),
        clock: document.getElementById('elapsed-time'),
        alert: document.getElementById('alert-banner'),
        lives: document.getElementById('lives-pips'),
        pipLayer: document.getElementById('hostile-pips'),
        navLayer: document.getElementById('nav-markers'),
        alertChevron: document.getElementById('chevron-alert'),
        hostileChevron: document.getElementById('chevron-hostile'),
        status: document.getElementById('objective-status')
    };

    buildPips(config.fleet ? config.fleet.total : 0);
    buildLives(config.player ? config.player.lives : 0);
    buildNavMarkers((config.hud && config.hud.navPoints) || []);
    return el;
}

/** Lives, as pips that EMPTY rather than vanish, so how many the visitor
 *  started with stays readable at a glance. Shape carries it as well as colour:
 *  a spent pip is a hollow outline, not a dimmer dot. */
function buildLives(total) {
    if (!el.lives) return;
    el.lives.textContent = '';
    for (let i = 0; i < total; i++) {
        const pip = document.createElement('span');
        pip.className = 'life-pip';
        el.lives.appendChild(pip);
        livesPips.push(pip);
    }
}

/** One pip per raider, built once. They are diamonds rather than dots so they
 *  are not the same shape as a nav marker, which is a ring. */
function buildPips(total) {
    if (!el.pipLayer) return;
    el.pipLayer.textContent = '';
    for (let i = 0; i < total; i++) {
        const pip = document.createElement('div');
        pip.className = 'hostile-pip hidden';
        el.pipLayer.appendChild(pip);
        pips.push(pip);
    }
}

function buildNavMarkers(points) {
    if (!el.navLayer) return;
    el.navLayer.textContent = '';
    for (const point of points) {
        const marker = document.createElement('div');
        marker.className = 'nav-marker hidden';

        const ring = document.createElement('span');
        ring.className = 'nav-ring';
        marker.appendChild(ring);

        const label = document.createElement('span');
        label.className = 'nav-label';
        label.textContent = point.label;
        marker.appendChild(label);

        const distance = document.createElement('span');
        distance.className = 'nav-distance';
        marker.appendChild(distance);

        el.navLayer.appendChild(marker);
        navMarkers.push({ id: point.id, label: point.label, marker, distance, shown: null });
    }
}

// ---- One frame --------------------------------------------------------------

/** Redraw everything from a snapshot of the game.
 *
 *  `view` is `{ camera, elapsed, structuresRemaining, shipsRemaining, ships,
 *  bodies, alert, event, playerPosition }`. It is a plain object rather than a set of
 *  imports so the HUD can be driven from a test with numbers, and so nothing
 *  here has any opinion about where the counts came from. */
export function updateHud(view) {
    if (!el || !view) return;

    setText(el.structures, view.structuresRemaining, 'structures');
    setText(el.ships, view.shipsRemaining, 'ships');
    updateLives(view.lives);

    const clock = formatClock(view.elapsed);
    if (clock !== shown.clock) {
        shown.clock = clock;
        if (el.clock) el.clock.textContent = clock;
    }

    updateAlert(view);
    speak(view);

    if (!view.camera) return;
    const viewport = currentViewport();
    updatePips(view, viewport);
    updateNav(view, viewport);
    updateChevrons(view, viewport);
}

function setText(node, value, key) {
    if (value === undefined || value === null || value === shown[key]) return;
    shown[key] = value;
    if (node) node.textContent = String(value);
}

function updateLives(remaining) {
    if (remaining === undefined || remaining === null || remaining === shown.lives) return;
    shown.lives = remaining;
    for (let i = 0; i < livesPips.length; i++) {
        livesPips[i].classList.toggle('spent', i >= remaining);
    }
}

function updateAlert(view) {
    const text = view.alert
        ? `${view.alert.label} is under attack`
        : null;
    if (text === shown.alert) return;
    shown.alert = text;
    if (!el.alert) return;
    if (text) {
        el.alert.textContent = text;
        el.alert.classList.remove('hidden');
    } else {
        el.alert.classList.add('hidden');
    }
}

/** The whole HUD as one sentence, for a visitor who is not reading the pixels.
 *
 *  Recomposed only when something in it changed, or a polite live region would
 *  chatter continuously and become useless.
 *
 *  `event` is news that just happened ("Northwatch destroyed") and leads,
 *  because it is the thing worth interrupting for. It lives here rather than in
 *  the combat region alongside the lock state, which is written on every change
 *  of target and would overwrite a one-off announcement within a frame or two.
 *  Two regions, two jobs. */
function speak(view) {
    if (!el.status) return;
    const counts =
        `${view.structuresRemaining} installations standing, ${view.shipsRemaining} raiders left.`;
    const parts = [];
    if (view.event) parts.push(view.event);
    parts.push(counts);
    if (view.lives !== undefined && view.lives !== null) {
        parts.push(`${view.lives} ${view.lives === 1 ? 'hull' : 'hulls'} left.`);
    }
    if (view.alert) parts.push(`${view.alert.label} is under attack.`);

    const sentence = parts.join(' ');
    if (sentence === shown.spoken) return;
    shown.spoken = sentence;
    el.status.textContent = sentence;
}

/** One pip per living raider, AT ANY DISTANCE (PRD 8.1). That is the whole
 *  point of them: a ship 200,000 units out is a few pixels of running light
 *  and would otherwise be indistinguishable from a star. */
function updatePips(view, viewport) {
    const ships = view.ships || [];
    for (let i = 0; i < pips.length; i++) {
        const ship = ships[i];
        if (!ship || !ship.alive) {
            hide(pips[i]);
            continue;
        }
        projectToScreen(ship.position, view.camera, viewport);
        if (!projected.onScreen) {
            hide(pips[i]);
            continue;
        }
        place(pips[i], projected.x, projected.y);
    }
}

function updateNav(view, viewport) {
    const bodies = view.bodies || {};
    for (const nav of navMarkers) {
        const position = bodies[nav.id];
        if (!position) { hide(nav.marker); continue; }

        projectToScreen(position, view.camera, viewport);
        if (!projected.onScreen) { hide(nav.marker); continue; }

        place(nav.marker, projected.x, projected.y);

        // Live, every frame. The Moon is moving at 838 units a second, and a
        // cached distance is what makes an interception feel broken (PRD 5.2).
        if (view.playerPosition) {
            const text = formatDistance(distanceBetween(view.playerPosition, position));
            if (text !== nav.shown) {
                nav.shown = text;
                nav.distance.textContent = text;
            }
        }
    }
}

/** Two chevrons, and only two: the installation under attack, and the nearest
 *  raider. A chevron for every hostile would ring the screen and say nothing. */
function updateChevrons(view, viewport) {
    placeChevron(el.alertChevron, view.alert ? view.alert.position : null, view, viewport);
    placeChevron(el.hostileChevron, nearestHostile(view), view, viewport);
}

function placeChevron(node, position, view, viewport) {
    if (!node) return;
    if (!position) { hide(node); return; }

    projectToScreen(position, view.camera, viewport);
    // On screen already: the pip or the marker is doing the job, and a chevron
    // as well would be pointing at something the visitor is looking at.
    if (projected.onScreen) { hide(node); return; }

    clampToEdge(projected.x, projected.y, viewport, cfg.hud.chevronInset, edge);
    node.classList.remove('hidden');
    node.style.transform =
        `translate(-50%, -50%) translate(${edge.x.toFixed(1)}px, ${edge.y.toFixed(1)}px) rotate(${edge.angle.toFixed(3)}rad)`;
}

function nearestHostile(view) {
    const ships = view.ships || [];
    if (!view.playerPosition) return null;
    let best = null;
    let bestDistance = Infinity;
    for (const ship of ships) {
        if (!ship || !ship.alive) continue;
        const distance = distanceBetween(view.playerPosition, ship.position);
        if (distance >= bestDistance) continue;
        bestDistance = distance;
        best = ship.position;
    }
    return best;
}

function place(node, x, y) {
    node.classList.remove('hidden');
    node.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
}

function hide(node) {
    if (node && !node.classList.contains('hidden')) node.classList.add('hidden');
}

function distanceBetween(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

// ---- Projection -------------------------------------------------------------

/** A world point to CSS pixels, into the shared `projected` record.
 *
 *  Exported because main.js positions the target lock bracket with it. One
 *  implementation, so the view-space z check above is got right in one place
 *  instead of being reimplemented per feature. */
export function projectToScreen(point, camera, viewport = currentViewport()) {
    if (!scratchVec) scratchVec = new THREE.Vector3();
    const v = scratchVec;
    v.set(point.x, point.y, point.z);
    camera.updateMatrixWorld();
    v.applyMatrix4(camera.matrixWorldInverse);
    const behind = v.z >= 0;
    v.applyMatrix4(camera.projectionMatrix);
    return writeProjection(projected, v.x, v.y, behind, viewport);
}

export function getProjection() { return projected; }

function currentViewport() {
    if (typeof window === 'undefined') return { width: 1280, height: 720 };
    return { width: window.innerWidth, height: window.innerHeight };
}

// ---- Lifecycle --------------------------------------------------------------

export function disposeHud() {
    if (el) {
        if (el.pipLayer) el.pipLayer.textContent = '';
        if (el.navLayer) el.navLayer.textContent = '';
        if (el.lives) el.lives.textContent = '';
    }
    cfg = null;
    el = null;
    pips = [];
    livesPips = [];
    navMarkers = [];
    scratchVec = null;
    shown.structures = null;
    shown.ships = null;
    shown.lives = null;
    shown.clock = null;
    shown.alert = null;
    shown.spoken = null;
}

export const __test__ = {
    edge,
    getPips: () => pips,
    getLivesPips: () => livesPips,
    getNavMarkers: () => navMarkers,
    getElements: () => el,
    shown
};
