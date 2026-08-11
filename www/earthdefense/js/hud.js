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

// The rotation that turns a 9px square into a diamond. It lives here rather
// than only in the stylesheet because an inline transform REPLACES the CSS one,
// so the shape has to be reapplied on every placement. See `place`.
const PIP_SPIN = ' rotate(45deg)';

let cfg = null;
let el = null;
let pips = [];
let livesPips = [];
let hullPips = [];
let navMarkers = [];

// What is currently on screen, so nothing is written twice.
const shown = {
    structures: null,
    ships: null,
    lives: null,
    hull: null,
    clock: null,
    alert: null,
    // The nearest raider's pip index, and the rounded range printed under it.
    nearest: -1,
    range: null
};

// The INPUTS to the spoken sentence rather than the sentence itself, so the
// "has anything changed" test costs no string building. See `speak`.
const spoken = {
    event: undefined,
    structures: undefined,
    ships: undefined,
    lives: undefined,
    alert: undefined
};

// Reused, because this runs sixty times a second.
const projected = { x: 0, y: 0, onScreen: false, behind: false };
// Which raider is closest, and how far, decided ONCE a frame. The range readout
// and the edge chevron both ask, and two answers to the same question is how a
// number ends up describing a ship the arrow is not pointing at.
const nearest = { index: -1, distance: Infinity, position: null };
const edge = { x: 0, y: 0, angle: 0 };
const viewport = { width: 0, height: 0 };
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
        hull: document.getElementById('hull-pips'),
        hullRow: document.getElementById('hull-row'),
        pipLayer: document.getElementById('hostile-pips'),
        hostileRange: document.getElementById('hostile-range'),
        navLayer: document.getElementById('nav-markers'),
        alertChevron: document.getElementById('chevron-alert'),
        hostileChevron: document.getElementById('chevron-hostile'),
        status: document.getElementById('objective-status')
    };

    buildPips(config.fleet ? config.fleet.total : 0);
    buildLives(config.player ? config.player.lives : 0);
    buildHull(config.player ? config.player.hullPoints : 0);
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

/** The hull buffer ONE ship carries, as segments. Built once and then only
 *  shown or hidden, because the row spends most of a run at full and a row that
 *  is rebuilt is a row that flickers. */
function buildHull(total) {
    if (!el.hull) return;
    el.hull.textContent = '';
    for (let i = 0; i < total; i++) {
        const pip = document.createElement('span');
        pip.className = 'hull-pip';
        el.hull.appendChild(pip);
        hullPips.push(pip);
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
    updateHull(view.hull);

    // Compare the SECOND, not the string it would make. Formatting first and
    // comparing after built and threw away a clock string on 59 frames out of
    // 60, which is the shape of most of the garbage the M8 audit found: the DOM
    // write was already guarded, the allocation was not.
    const second = Math.max(0, Math.floor(view.elapsed || 0));
    if (second !== shown.clock) {
        shown.clock = second;
        if (el.clock) el.clock.textContent = formatClock(second);
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

/** Hull, which is on screen ONLY while it is damaged.
 *
 *  A full hull says nothing a visitor needs, and this HUD already asks a lot of
 *  a phone in portrait, so the row leaves rather than sitting there full. It
 *  comes straight back on the frame a shot lands, and a respawn refills the
 *  buffer, which takes it away again without anything having to remember to. */
function updateHull(remaining) {
    if (remaining === undefined || remaining === null || remaining === shown.hull) return;
    shown.hull = remaining;
    for (let i = 0; i < hullPips.length; i++) {
        hullPips[i].classList.toggle('spent', i >= remaining);
    }
    // A hull of zero is the frame the ship is lost on. Hide it then too: the
    // news is "Ship lost", and an empty row under it would only compete.
    const damaged = remaining > 0 && remaining < hullPips.length;
    if (el.hullRow) el.hullRow.classList.toggle('hidden', !damaged);
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

    // NOTHING IS BUILT UNTIL SOMETHING HAS CHANGED. The four values below are
    // everything the sentence is made of, so comparing them is the same test as
    // comparing the finished string, minus an array, a join, and three or four
    // template literals on every frame that says exactly what the last one did.
    // That was the single biggest allocator left in the HUD.
    const alertLabel = view.alert ? view.alert.label : null;
    if (view.event === spoken.event
        && view.structuresRemaining === spoken.structures
        && view.shipsRemaining === spoken.ships
        && view.lives === spoken.lives
        && alertLabel === spoken.alert) return;
    spoken.event = view.event;
    spoken.structures = view.structuresRemaining;
    spoken.ships = view.shipsRemaining;
    spoken.lives = view.lives;
    spoken.alert = alertLabel;

    const parts = [];
    if (view.event) parts.push(view.event);
    parts.push(`${view.structuresRemaining} installations standing, ${view.shipsRemaining} raiders left.`);
    // "lives", matching the pip label. `view.lives` is ships in reserve, not
    // the four-point hull buffer a single ship carries. See the note beside the
    // lives row in index.html for why the two had to stop sharing a word.
    if (view.lives !== undefined && view.lives !== null) {
        parts.push(`${view.lives} ${view.lives === 1 ? 'life' : 'lives'} left.`);
    }
    if (alertLabel) parts.push(`${alertLabel} is under attack.`);
    el.status.textContent = parts.join(' ');
}

/** One pip per living raider, AT ANY DISTANCE (PRD 8.1). That is the whole
 *  point of them: a ship 200,000 units out is a few pixels of running light
 *  and would otherwise be indistinguishable from a star.
 *
 *  AND EXACTLY ONE OF THEM CARRIES A NUMBER. Twelve identical diamonds say
 *  where the raiders are and nothing at all about which one is the problem,
 *  which was the report: "it's hard to tell which ship is the closest". Marking
 *  the nearest and printing its range answers that without turning the screen
 *  into a wall of digits, and it is the same ship the edge chevron already
 *  means, so the two can never point at different raiders. */
function updatePips(view, viewport) {
    const ships = view.ships || [];
    const closest = findNearestHostile(view);
    let rangeShown = false;

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
        // The rotation is what makes a pip a diamond rather than a square, and
        // it has to come through `place` or the inline transform drops it.
        place(pips[i], projected.x, projected.y, PIP_SPIN);

        if (i === closest) {
            placeRange(projected.x, projected.y, nearest.distance);
            rangeShown = true;
        }
    }

    // Off screen, or nothing left to fight. The chevron is still saying which
    // way to look, and a number pinned to an edge the raider is not at would be
    // answering a question nobody asked.
    if (!rangeShown) hide(el.hostileRange);

    // Only the two pips that changed hands, rather than a class write on every
    // diamond every frame.
    if (closest !== shown.nearest) {
        if (pips[shown.nearest]) pips[shown.nearest].classList.remove('nearest');
        if (pips[closest]) pips[closest].classList.add('nearest');
        shown.nearest = closest;
    }
}

/** The range readout, under the diamond it belongs to.
 *
 *  Rounded the same way the nav distances are, and compared the same way: past
 *  10,000 km the readout moves in thousands, so at closing speed most frames
 *  would format an identical string and throw it away. */
function placeRange(x, y, distance) {
    const node = el.hostileRange;
    if (!node) return;
    place(node, x, y, ' translate(0, 14px)');

    const km = Math.max(0, Math.round(distance));
    const quantum = km >= 10000 ? Math.round(km / 1000) * 1000 : km;
    if (quantum !== shown.range) {
        shown.range = quantum;
        node.textContent = formatDistance(km);
    }
}

/** The living raider closest to the visitor, as an index into `view.ships`,
 *  with its distance and position left in `nearest` for the callers that want
 *  them. -1 when there is nothing alive to measure. */
function findNearestHostile(view) {
    const ships = view.ships || [];
    nearest.index = -1;
    nearest.distance = Infinity;
    nearest.position = null;
    if (!view.playerPosition) return -1;

    for (let i = 0; i < ships.length; i++) {
        const ship = ships[i];
        if (!ship || !ship.alive) continue;
        const distance = distanceBetween(view.playerPosition, ship.position);
        if (distance >= nearest.distance) continue;
        nearest.distance = distance;
        nearest.index = i;
        nearest.position = ship.position;
    }
    return nearest.index;
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
        //
        // The DISTANCE is read every frame; the string is not. Past 10,000 km
        // the readout is rounded to the nearest thousand, so at cruising speed
        // fifteen frames out of sixteen would have formatted the same text and
        // thrown it away, and `toLocaleString` is not a cheap way to do that.
        // Comparing the quantum the readout actually shows is the same test as
        // comparing the finished string.
        if (view.playerPosition) {
            const km = Math.max(0, Math.round(distanceBetween(view.playerPosition, position)));
            const quantum = km >= 10000 ? Math.round(km / 1000) * 1000 : km;
            if (quantum !== nav.shown) {
                nav.shown = quantum;
                nav.distance.textContent = formatDistance(km);
            }
        }
    }
}

/** Two chevrons, and only two: the installation under attack, and the nearest
 *  raider. A chevron for every hostile would ring the screen and say nothing.
 *
 *  Reads the nearest raider that `updatePips` already found this frame, rather
 *  than looking again. Same ship, by construction. */
function updateChevrons(view, viewport) {
    placeChevron(el.alertChevron, view.alert ? view.alert.position : null, view, viewport);
    placeChevron(el.hostileChevron, nearest.position, view, viewport);
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

/** Put a marker at a screen point.
 *
 *  `extra` IS NOT DECORATION. An inline `transform` replaces the stylesheet's
 *  outright rather than composing with it, so a mark whose shape comes from a
 *  rotation loses that shape the first frame it is placed. That is exactly what
 *  happened to the hostile pips: `.hostile-pip` is a 9px square turned 45
 *  degrees, and every raider on screen drew as an axis-aligned BLOCK from the
 *  moment it was positioned. Nothing threw, the stylesheet was right, and the
 *  only way to catch it was to look. Any caller whose CSS transform carries
 *  meaning has to pass that meaning through here, whether that meaning is a
 *  shape (the pips' 45 degrees) or an offset (the range readout, which hangs
 *  below the diamond it belongs to rather than on top of it). */
function place(node, x, y, extra) {
    node.classList.remove('hidden');
    node.style.transform =
        `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)${extra || ''}`;
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

/** The viewport, into a reused record. It was a fresh object per frame, which
 *  is one allocation for two numbers that are read and thrown away inside the
 *  same call. */
function currentViewport() {
    if (typeof window === 'undefined') {
        viewport.width = 1280;
        viewport.height = 720;
    } else {
        viewport.width = window.innerWidth;
        viewport.height = window.innerHeight;
    }
    return viewport;
}

// ---- Lifecycle --------------------------------------------------------------

export function disposeHud() {
    if (el) {
        if (el.pipLayer) el.pipLayer.textContent = '';
        if (el.navLayer) el.navLayer.textContent = '';
        if (el.lives) el.lives.textContent = '';
        if (el.hull) el.hull.textContent = '';
        // Back to absent, or a restart would begin with the previous run's
        // damage row still on screen until the first shot landed.
        if (el.hullRow) el.hullRow.classList.add('hidden');
        // The range readout outlives the pip layer, being a sibling of it, so
        // it has to be put away by hand rather than by the clearing above.
        if (el.hostileRange) el.hostileRange.classList.add('hidden');
    }
    cfg = null;
    el = null;
    pips = [];
    livesPips = [];
    hullPips = [];
    navMarkers = [];
    scratchVec = null;
    shown.structures = null;
    shown.ships = null;
    shown.lives = null;
    shown.hull = null;
    shown.clock = null;
    shown.alert = null;
    // The index is into a pip array that is about to be rebuilt, so keeping it
    // would mark whichever raider inherits the slot on the next run.
    shown.nearest = -1;
    shown.range = null;
    nearest.index = -1;
    nearest.distance = Infinity;
    nearest.position = null;
    spoken.event = undefined;
    spoken.structures = undefined;
    spoken.ships = undefined;
    spoken.lives = undefined;
    spoken.alert = undefined;
}

export const __test__ = {
    edge,
    getPips: () => pips,
    getLivesPips: () => livesPips,
    getHullPips: () => hullPips,
    getNavMarkers: () => navMarkers,
    getElements: () => el,
    shown,
    spoken
};
