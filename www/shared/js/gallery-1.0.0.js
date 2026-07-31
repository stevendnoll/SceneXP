// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * gallery.js (shared part)
 *
 * Builds an art-gallery interior: framed pieces hung on the side and back
 * walls, each acting as a link to a section of the site. Art is generated
 * procedurally onto <canvas> textures so the gallery has zero external image
 * dependencies and stays crisp at any resolution.
 *
 * The CONTENT lives with each experience: its `gallery.js` owns a
 * GALLERY_SECTIONS array (id, title, subtitle, url, accent, motif, optional
 * wall: 'back') and hands it to initGallery() together with its room
 * dimensions. This part owns only the machinery — frames, mats, placards,
 * canvas art, faked picture lights, clickable floor mats, and the viewing
 * waypoints the shared NPC visitors stroll between.
 */

import { getScene } from './scene-1.0.0.min.js';

// Module state
let galleryGroup = null;
let matsGroup = null;       // floor mats in front of the pieces (clickable scenery)
const galleryPieces = [];   // [{ group, artMesh, baseEmissive, section }]

// Visual constants for a clean, modern, white-wall gallery look
const ART_HEIGHT = 1.5;          // meters
const ART_WIDTH = 1.5 * 0.78;    // portrait-ish aspect
const MAT_BORDER = 0.12;         // white matting around the art
const FRAME_BORDER = 0.04;       // slim dark frame
const FRAME_DEPTH = 0.06;

function STORE_CONFIG_HEIGHT_FALLBACK(storeConfig) {
    // The room height is a constant defined by the experience's store config,
    // safe to read at build time (default 6 if the config leaves it out).
    return (storeConfig && storeConfig.height) || 6;
}

/**
 * Build all gallery pieces and add them to the scene.
 * Call after initStore() so the store config's depth/positionZ are finalized.
 *
 * @param {Object}   options
 * @param {Array}    options.sections     the experience's GALLERY_SECTIONS
 * @param {Object}   options.storeConfig  the experience's STORE_CONFIG
 *                   (width, depth, positionX, positionZ, wallThickness, height)
 */
export function initGallery({ sections = [], storeConfig = null } = {}) {
    const scene = getScene();
    if (!scene) return;

    galleryGroup = new THREE.Group();
    galleryGroup.name = 'gallery';

    const cfg = storeConfig || {};
    const { width, depth, positionX, positionZ, wallThickness } = cfg;
    const wallOffset = 0.08; // distance off the wall to avoid z-fighting
    const pieceCenterY = STORE_CONFIG_HEIGHT_FALLBACK(cfg) / 2 + 0.35;

    const rightWallX = positionX + width / 2 - wallThickness / 2 - wallOffset;
    const leftWallX = positionX - width / 2 + wallThickness / 2 + wallOffset;
    const backWallZ = positionZ - depth / 2 + wallThickness / 2 + wallOffset;

    const sideSections = sections.filter(s => s.wall !== 'back');
    const backSections = sections.filter(s => s.wall === 'back');

    // Floor mats sit in front of each piece. They're tagged as clickable scenery
    // (see createPieceMat) so a click pops a little message, but they're kept in
    // their own group — registered for raycasting separately in main.js.
    matsGroup = new THREE.Group();
    matsGroup.name = 'pieceMats';

    // Side-wall pieces: hung in left/right pairs at matching depths, so each
    // left-wall piece sits directly across the hall from its right-wall partner
    // (sections alternate L/R, so consecutive pairs share a depth slot). An odd
    // count simply leaves the last row with a single left-wall piece.
    const rowCount = Math.ceil(sideSections.length / 2);
    const rowZ = computeLayout(rowCount, depth, positionZ);
    sideSections.forEach((section, index) => {
        const onLeft = index % 2 === 0;
        const row = Math.floor(index / 2);
        const piece = createPiece(section);
        piece.group.position.set(
            onLeft ? leftWallX : rightWallX,
            pieceCenterY,
            rowZ[row]
        );
        piece.group.rotation.y = onLeft ? Math.PI / 2 : -Math.PI / 2; // face into the room
        addSpotlight(piece.group);
        matsGroup.add(createPieceMat(section, piece.group.position, piece.group.rotation.y));
        galleryGroup.add(piece.group);
        galleryPieces.push(piece);
    });

    // Back-wall pieces: spread across the width, facing the entrance (+Z).
    const backXs = spreadAcross(backSections.length, positionX, width);
    backSections.forEach((section, index) => {
        const piece = createPiece(section);
        piece.group.position.set(backXs[index], pieceCenterY, backWallZ);
        piece.group.rotation.y = 0; // face +Z, toward the entrance
        addSpotlight(piece.group);
        matsGroup.add(createPieceMat(section, piece.group.position, piece.group.rotation.y));
        galleryGroup.add(piece.group);
        galleryPieces.push(piece);
    });

    scene.add(galleryGroup);
    scene.add(matsGroup);
}

/**
 * Build a floor mat that sits in front of a piece: a dark field framed by a thin
 * border tinted to the section's accent color. Two stacked flat planes (border
 * base + dark inset), oriented to the piece's wall and pushed out into the room.
 * Purely decorative — flat on the floor, no collision.
 */
function createPieceMat(section, piecePos, rotY) {
    const group = new THREE.Group();
    group.name = `mat-${section.id}`;
    // Clickable scenery: a click pops a one-liner (handled in main.js). No hover.
    group.userData.isScenery = true;
    group.userData.sceneryKind = 'mat';

    const matWidth = 1.7;   // along the wall
    const matDepth = 2.4;   // out into the room
    const trim = 0.16;      // accent border thickness
    const matOffset = 0.4 + matDepth / 2; // near edge ~0.4 m off the wall

    // Accent border base.
    const base = new THREE.Mesh(
        new THREE.PlaneGeometry(matWidth, matDepth),
        new THREE.MeshLambertMaterial({ color: section.accent })
    );
    base.rotation.x = -Math.PI / 2;
    base.position.y = 0.018;
    group.add(base);

    // Dark field inset, slightly higher so the accent reads as a clean frame.
    const field = new THREE.Mesh(
        new THREE.PlaneGeometry(matWidth - trim * 2, matDepth - trim * 2),
        new THREE.MeshLambertMaterial({ color: 0x2e3946 })
    );
    field.rotation.x = -Math.PI / 2;
    field.position.y = 0.028;
    group.add(field);

    // Orient to the wall and push out in front of the piece. A piece's local +Z
    // (its facing into the room) maps to (sin rotY, cos rotY) in world space.
    group.rotation.y = rotY;
    const nx = Math.sin(rotY);
    const nz = Math.cos(rotY);
    group.position.set(piecePos.x + nx * matOffset, 0, piecePos.z + nz * matOffset);

    return group;
}

/**
 * Evenly spread N pieces across the interior width, centered on centerX and
 * kept clear of the corners. Returns an array of X positions.
 */
function spreadAcross(count, centerX, width) {
    if (count <= 1) return [centerX];
    const usable = width * 0.5; // keep pieces away from the corners/plants
    const step = usable / (count - 1);
    const start = centerX - usable / 2;
    const xs = [];
    for (let i = 0; i < count; i++) xs.push(start + i * step);
    return xs;
}

/**
 * Evenly distribute N pieces along the usable interior depth, leaving padding
 * near the entrance (front) and back wall.
 */
function computeLayout(count, depth, positionZ) {
    const frontPad = 6;  // space near the doors
    const backPad = 5;   // space near the back wall
    const usable = depth - frontPad - backPad;
    const start = positionZ + depth / 2 - frontPad; // nearest entrance
    const positions = [];
    if (count === 1) return [positionZ];
    const step = usable / (count - 1);
    for (let i = 0; i < count; i++) {
        positions.push(start - i * step);
    }
    return positions;
}

/**
 * Create one framed, clickable piece: dark frame + white mat + procedural art
 * + a placard beneath it. Returns { group, artMesh, baseEmissive, section }.
 */
function createPiece(section) {
    const group = new THREE.Group();
    group.name = `gallery-${section.id}`;

    const matW = ART_WIDTH + MAT_BORDER * 2;
    const matH = ART_HEIGHT + MAT_BORDER * 2;
    const frameW = matW + FRAME_BORDER * 2;
    const frameH = matH + FRAME_BORDER * 2;

    // Slim dark frame (front face block)
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.6, metalness: 0.15 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(frameW, frameH, FRAME_DEPTH), frameMat);
    group.add(frame);

    // White mat board, slightly proud of the frame
    const matDepth = FRAME_DEPTH * 0.6;
    const matMat = new THREE.MeshStandardMaterial({ color: 0xf7f7f4, roughness: 0.85, metalness: 0.0 });
    const mat = new THREE.Mesh(new THREE.BoxGeometry(matW, matH, matDepth), matMat);
    mat.position.z = FRAME_DEPTH / 2;
    group.add(mat);
    // Front face of the mat board — the artwork must sit in front of this plane.
    const matFrontZ = mat.position.z + matDepth / 2;

    // The artwork itself, on a canvas texture
    const artTexture = makeArtTexture(section);
    // Self-illuminated art so each piece "pops" without needing a real spotlight
    // (real per-piece lights were a major performance cost — emissive is free).
    const artMat = new THREE.MeshStandardMaterial({
        map: artTexture,
        roughness: 0.45,
        metalness: 0.0,
        emissive: 0xffffff,
        emissiveMap: artTexture,
        emissiveIntensity: 0.32
    });
    const artMesh = new THREE.Mesh(new THREE.PlaneGeometry(ART_WIDTH, ART_HEIGHT), artMat);
    artMesh.position.z = matFrontZ + 0.012; // sit just in front of the mat board
    group.add(artMesh);

    // Placard beneath the frame (title + subtitle)
    const placard = makePlacard(section);
    placard.position.set(0, -frameH / 2 - 0.20, FRAME_DEPTH / 2 + 0.005);
    group.add(placard);

    // Tag every descendant so a raycast hit on any sub-mesh resolves to the piece
    const userData = {
        isGalleryPiece: true,
        galleryId: section.id,
        galleryUrl: section.url,
        galleryTitle: section.title,
        gallerySubtitle: section.subtitle
    };
    group.traverse((obj) => { obj.userData = { ...obj.userData, ...userData }; });

    return { group, artMesh, baseEmissive: 0.32, section };
}

/**
 * Artwork for a piece: a crisp line-art icon (keyed to the section) drawn with
 * Canvas 2D, in the section's accent color, over a soft gallery wash.
 *
 * NOTE: we draw the icon with Canvas 2D path commands rather than rasterizing an
 * SVG image. Drawing an SVG <img> onto a canvas taints it, which makes the
 * subsequent WebGL texture upload fail silently (blank piece). Pure Canvas 2D
 * never taints, so the texture uploads reliably.
 */
function makeArtTexture(section) {
    const W = 768;
    const H = Math.round(W * (ART_HEIGHT / ART_WIDTH));
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Soft gallery-canvas wash
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#fbfbf9');
    bg.addColorStop(1, '#eceae4');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    drawIcon(ctx, section);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
}

/**
 * Draw the section's icon onto the 768×985 art canvas in its accent color.
 * Coordinates are tuned for that fixed canvas size.
 */
function drawIcon(ctx, section) {
    const a = section.accent;
    ctx.save();
    ctx.strokeStyle = a;
    ctx.fillStyle = a;
    ctx.lineWidth = 16;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    switch (section.motif) {
        case 'portrait': // About — head & shoulders
            ctx.beginPath();
            ctx.arc(384, 385, 118, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.ellipse(384, 678, 170, 150, 0, Math.PI, 2 * Math.PI);
            ctx.stroke();
            break;
        case 'grid': // Portfolio — 2×2 work tiles
            fillTile(ctx, 214, 322, 1.0);
            fillTile(ctx, 404, 322, 0.4);
            fillTile(ctx, 214, 512, 0.4);
            fillTile(ctx, 404, 512, 1.0);
            break;
        case 'lines': // Blog — a page of writing
            strokeRoundRect(ctx, 244, 300, 280, 392, 22);
            strokeLine(ctx, 300, 392, 468, 392);
            strokeLine(ctx, 300, 458, 468, 458);
            strokeLine(ctx, 300, 524, 420, 524);
            strokeLine(ctx, 300, 590, 468, 590);
            break;
        case 'nodes': // Contact — envelope
            strokeRoundRect(ctx, 224, 368, 320, 248, 22);
            ctx.beginPath();
            ctx.moveTo(236, 392);
            ctx.lineTo(384, 512);
            ctx.lineTo(532, 392);
            ctx.stroke();
            break;
        case 'cube': { // 3D — wireframe cube
            const dx = 70, dy = -70;            // back-face offset
            // front face
            const fx = 300, fy = 420, s = 168;
            strokeLine(ctx, fx, fy, fx + s, fy);
            strokeLine(ctx, fx + s, fy, fx + s, fy + s);
            strokeLine(ctx, fx + s, fy + s, fx, fy + s);
            strokeLine(ctx, fx, fy + s, fx, fy);
            // back face
            strokeLine(ctx, fx + dx, fy + dy, fx + s + dx, fy + dy);
            strokeLine(ctx, fx + s + dx, fy + dy, fx + s + dx, fy + s + dy);
            strokeLine(ctx, fx + s + dx, fy + s + dy, fx + dx, fy + s + dy);
            strokeLine(ctx, fx + dx, fy + s + dy, fx + dx, fy + dy);
            // connecting edges
            strokeLine(ctx, fx, fy, fx + dx, fy + dy);
            strokeLine(ctx, fx + s, fy, fx + s + dx, fy + dy);
            strokeLine(ctx, fx + s, fy + s, fx + s + dx, fy + s + dy);
            strokeLine(ctx, fx, fy + s, fx + dx, fy + s + dy);
            break;
        }
        case 'spark': // AI — a four-point "sparkle", the modern AI glyph
            drawSparkle(ctx, 384, 470, 175, false); // large hollow sparkle
            drawSparkle(ctx, 548, 300, 58, true);   // small solid sparkle
            break;
        default:
            ctx.beginPath();
            ctx.arc(384, 492, 120, 0, Math.PI * 2);
            ctx.fill();
    }
    ctx.restore();
}

/**
 * Draw a four-pointed "sparkle" (AI glyph) centered at (cx, cy) with tip radius
 * R. Concave sides are formed by pulling the curve control points toward the
 * center. `fill` strokes a hollow sparkle when false, fills it when true.
 */
function drawSparkle(ctx, cx, cy, R, fill) {
    const c = R * 0.16; // how far the control points sit off-center (waist size)
    ctx.beginPath();
    ctx.moveTo(cx, cy - R);                          // top tip
    ctx.quadraticCurveTo(cx + c, cy - c, cx + R, cy); // → right tip
    ctx.quadraticCurveTo(cx + c, cy + c, cx, cy + R); // → bottom tip
    ctx.quadraticCurveTo(cx - c, cy + c, cx - R, cy); // → left tip
    ctx.quadraticCurveTo(cx - c, cy - c, cx, cy - R); // → back to top
    ctx.closePath();
    if (fill) ctx.fill();
    else ctx.stroke();
}

function fillTile(ctx, x, y, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    roundRectPath(ctx, x, y, 150, 150, 18);
    ctx.fill();
    ctx.restore();
}

function strokeRoundRect(ctx, x, y, w, h, r) {
    roundRectPath(ctx, x, y, w, h, r);
    ctx.stroke();
}

function strokeLine(ctx, x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
}

// Build a rounded-rect path (manual arcs — avoids relying on ctx.roundRect)
function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

/**
 * Placard mesh: a small light plaque with engraved-looking title + subtitle.
 */
function makePlacard(section) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#f2f0ea';
    ctx.fillRect(0, 0, 1024, 200);
    ctx.fillStyle = '#1d1d1d';
    ctx.font = 'bold 160px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(section.title.toUpperCase(), 512, 104);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4; // keep the text crisp when viewed at an angle

    // Wide plate + large bold title (just the page name now) so it reads from
    // across the room; the title stands ~0.20m tall in world space.
    const w = 1.3, h = w * (200 / 1024);
    const group = new THREE.Group();
    const plate = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide })
    );
    group.add(plate);
    return group;
}

/**
 * Add a ceiling spotlight that washes the piece in light — the signature look
 * of a modern gallery. The light is parented to the piece group so it stays
 * aligned regardless of wall placement.
 */
function addSpotlight(pieceGroup) {
    // A picture light over the piece: a slim track-light fixture, a warm emissive
    // lens (the visible "on" glow), and a soft beam cone washing down over the
    // art. We still deliberately avoid a real THREE.SpotLight per piece — extra
    // real-time lights multiply fragment-shading cost across the gallery's large
    // bright surfaces and were the main performance regression. The lit look comes
    // from the artwork's emissive material (see createPiece) plus this faked,
    // unlit glow, which costs almost nothing. Only the housing is clickable
    // scenery; the glow/beam have raycasting disabled so they never block clicks.
    const warm = 0xffe6b8;

    // Mounting arm reaching up and forward off the wall. This is the clickable
    // bit: a click pops a how-to hint rather than opening the piece. Added AFTER
    // createPiece()'s userData tagging, so it is deliberately NOT flagged
    // isGalleryPiece — main.js checks isScenery first.
    const fixture = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.05, 0.34, 10),
        new THREE.MeshLambertMaterial({ color: 0x222222 })
    );
    fixture.position.set(0, 1.0, 0.22);
    fixture.rotation.x = Math.PI / 3.2;
    fixture.userData.isScenery = true;
    fixture.userData.sceneryKind = 'light';
    pieceGroup.add(fixture);

    // Lamp head: a small dark housing at the end of the arm, tilted down at the art.
    const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.1, 0.14),
        new THREE.MeshLambertMaterial({ color: 0x2a2a2a })
    );
    head.position.set(0, 1.1, 0.38);
    head.rotation.x = 0.5;
    pieceGroup.add(head);

    // Warm lens on the underside of the head — the visible "on" glow (unlit, so
    // it reads as lit even when the room is dimmed via the brightness control).
    const lens = new THREE.Mesh(
        new THREE.PlaneGeometry(0.3, 0.1),
        new THREE.MeshBasicMaterial({ color: warm })
    );
    lens.position.set(0, 1.06, 0.45);
    lens.rotation.x = -Math.PI / 2 + 0.5; // face down/forward toward the art
    lens.raycast = () => {};                // purely visual, never intercept clicks
    pieceGroup.add(lens);

    // Soft beam: a translucent additive cone widening from the lamp down over the
    // art. Subtle in daylight, reads more as the room dims. Raycasting disabled so
    // it never blocks clicks on the art beneath it.
    const beam = new THREE.Mesh(
        new THREE.ConeGeometry(0.55, 1.15, 18, 1, true),
        new THREE.MeshBasicMaterial({
            color: warm, transparent: true, opacity: 0.07,
            side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending
        })
    );
    beam.position.set(0, 0.5, 0.3);
    beam.rotation.x = 0.16; // lean the beam slightly back toward the wall/art
    beam.raycast = () => {};
    pieceGroup.add(beam);
}

// ---- public accessors ----------------------------------------------------

export function getGalleryGroup() {
    return galleryGroup;
}

/** The group of clickable floor mats, for raycasting in main.js. */
export function getMatsGroup() {
    return matsGroup;
}

/** Returns the array of pieces for raycast/hover/click handling in main.js. */
export function getGalleryPieces() {
    return galleryPieces;
}

/**
 * Viewing waypoints for the gallery visitors (the wandering NPCs): one standing
 * spot in front of each piece, where a visitor pauses to "admire" it. Each
 * waypoint also records the piece position so the visitor turns to face the art
 * on arrival. `standoff` is how far off the wall (meters) the visitor stands.
 *
 * Derived from each piece's world position + facing (rotation.y), so it stays
 * correct no matter how the pieces are laid out along the walls.
 */
export function getViewingWaypoints(standoff = 2.6) {
    return galleryPieces.map((p) => {
        const pos = p.group.position;
        const rotY = p.group.rotation.y;
        // A piece's local +Z (the way it faces into the room) maps to this
        // world-space direction. Stepping `standoff` along it puts the visitor
        // squarely in front of the piece.
        const nx = Math.sin(rotY);
        const nz = Math.cos(rotY);
        return {
            x: pos.x + nx * standoff,
            z: pos.z + nz * standoff,
            lookAtX: pos.x,
            lookAtZ: pos.z,
            pieceId: p.section.id
        };
    });
}

/**
 * Given a raycast-hit object, climb its ancestry to find the gallery piece it
 * belongs to. Returns the section userData ({ galleryUrl, galleryTitle, ... })
 * or null if the object isn't part of a piece.
 */
export function resolveGalleryPiece(object) {
    let o = object;
    while (o) {
        if (o.userData && o.userData.isGalleryPiece) return o.userData;
        o = o.parent;
    }
    return null;
}

/** Subtle hover highlight: brighten the artwork's emissive when looked at. */
export function setPieceHighlight(piece, on) {
    if (!piece || !piece.artMesh) return;
    piece.artMesh.material.emissiveIntensity = on ? 0.8 : piece.baseEmissive;
}

// Exposed for unit tests only; production code uses the named exports above.
export const __test__ = { spreadAcross, computeLayout, STORE_CONFIG_HEIGHT_FALLBACK };
