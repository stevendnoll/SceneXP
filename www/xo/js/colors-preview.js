// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * colors-preview.js - The X's and the O's player turning in the Team colors
 * card, each on a disc of the chosen field, in the colors being chosen.
 *
 * ONE WEBGL CONTEXT FOR THE WHOLE PAGE. The players are drawn into a corner of
 * the game's own drawing buffer and copied out to the card's two small
 * canvases, before the game's frame is drawn over that corner. It is the
 * Fractal Garden's method, down to its two lessons: three's viewport takes CSS
 * pixels, not buffer pixels, and the copy has to happen BEFORE the main render
 * or the frame is presented with a ghost player stamped in the corner.
 *
 * THE DISC IS THE POINT OF IT. A jersey is judged against the field it will be
 * played on, under the same kind of light, so a green jersey on green turf looks
 * as hard to see here as it will be out there.
 */
import { XO_CONFIG as CFG } from './config.min.js';
import { buildKitFigure, dressKitFigure } from './roster.min.js';
import { turfFrom, fieldColor } from './colors.min.js';

let stage = null;

/**
 * The preview rectangle, in the two units that both have a claim on it: CSS
 * pixels for three's viewport and scissor, which multiply by the pixel ratio
 * themselves, and buffer pixels for `drawImage`, which reads a canvas in its own
 * intrinsic pixels. `device` is derived from `css` by the same floor three
 * applies, so they cannot describe two different rectangles. WebGL counts from
 * the bottom of the buffer and drawImage from the top, which is why `cssTop` is
 * not zero while the copy reads from (0, 0).
 */
export function previewRect(bufferWidth, bufferHeight, pixelRatio, wanted = CFG.colors.preview.px) {
    const pr = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
    const bw = Number.isFinite(bufferWidth) && bufferWidth > 0 ? bufferWidth : wanted;
    const bh = Number.isFinite(bufferHeight) && bufferHeight > 0 ? bufferHeight : wanted;
    const css = Math.max(1, Math.min(Math.floor(wanted / pr), Math.floor(bw / pr), Math.floor(bh / pr)));
    const device = Math.max(1, Math.floor(css * pr));
    const cssTop = (bh - device + 0.5) / pr;
    return { css, device, cssTop };
}

function build() {
    if (stage) return stage;
    const P = CFG.colors.preview;
    const L = CFG.lighting;
    const scene = new THREE.Scene();
    // The field's kind of light: the same ambient, a key from above and in
    // front, and the fill, so a color reads here the way it reads out there.
    scene.add(new THREE.AmbientLight(L.ambient.color, L.ambient.intensity));
    const key = new THREE.DirectionalLight(L.key.color, L.key.intensity);
    key.position.set(1.5, 4, 3);
    scene.add(key);
    const fill = new THREE.DirectionalLight(L.fill.color, L.fill.intensity);
    fill.position.set(-2, 2, -1.5);
    scene.add(fill);

    const turf = new THREE.MeshStandardMaterial({ color: turfFrom(fieldColor()).grass, roughness: 0.95, metalness: 0 });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(P.disc, 40), turf);
    disc.rotation.x = -Math.PI / 2;
    scene.add(disc);

    const figures = { 0: buildKitFigure(0), 1: buildKitFigure(1) };
    for (const team of [0, 1]) scene.add(figures[team]);

    // FRAMED ON THE FIGURE THAT WAS BUILT, helmet and all, rather than on a
    // height written down here.
    const box = new THREE.Box3().setFromObject(figures[0]);
    const camera = previewCamera(box.max.y);

    stage = {
        scene, camera, figures, turf,
        saved: {
            clear: new THREE.Color(), viewport: new THREE.Vector4(), scissor: new THREE.Vector4(),
        },
        contexts: new Map(),
    };
    return stage;
}

/** The camera that frames a player `height` metres tall standing at the origin. */
export function previewCamera(height) {
    const P = CFG.colors.preview;
    const h = Math.max(0.5, Number(height) || 0);
    const camera = new THREE.PerspectiveCamera(P.fov, 1, 0.1, 50);
    const distance = ((h * P.margin) / 2) / Math.tan((P.fov * Math.PI) / 360);
    camera.position.set(0, h * P.aim + h * P.lookDown, distance);
    camera.lookAt(0, h * P.aim, 0);
    camera.updateMatrixWorld();
    return camera;
}

/** How far round a player is at `seconds`: turning slowly, or held at three
 *  quarters for anybody who asked not to be moved about. */
export function previewYaw(seconds, { calm = false } = {}) {
    const P = CFG.colors.preview;
    return calm ? P.calmYaw : P.calmYaw + seconds * P.turn;
}

/** Draw `scene` into the corner of the main buffer and copy it to `target`. */
function drawIntoCorner(renderer, target, s) {
    const rect = previewRect(renderer.domElement.width, renderer.domElement.height, renderer.getPixelRatio());
    // RESTORED FROM WHAT WAS THERE, never from numbers rebuilt by hand.
    s.saved.clear.copy(renderer.getClearColor(s.saved.clear));
    const alpha = renderer.getClearAlpha();
    renderer.getViewport(s.saved.viewport);
    renderer.getScissor(s.saved.scissor);
    const scissorTest = renderer.getScissorTest();
    const clear = s.saved.clear.clone();

    renderer.setScissorTest(true);
    renderer.setViewport(0, rect.cssTop, rect.css, rect.css);
    renderer.setScissor(0, rect.cssTop, rect.css, rect.css);
    renderer.setClearColor(CFG.colors.preview.clear, 1);
    renderer.clear();
    renderer.render(s.scene, s.camera);
    renderer.setScissorTest(scissorTest);
    renderer.setViewport(s.saved.viewport);
    renderer.setScissor(s.saved.scissor);
    renderer.setClearColor(clear, alpha);

    if (target.width !== rect.device) {
        target.width = rect.device;
        target.height = rect.device;
        s.contexts.delete(target);
    }
    if (!s.contexts.has(target)) s.contexts.set(target, target.getContext && target.getContext('2d'));
    const ctx = s.contexts.get(target);
    // Same task as the render, so the drawing buffer is still valid without
    // `preserveDrawingBuffer` costing every frame of the game.
    if (ctx) ctx.drawImage(renderer.domElement, 0, 0, rect.device, rect.device, 0, 0, rect.device, rect.device);
}

/**
 * DRAW BOTH PLAYERS, dressed as colors.js has them now, turned to `seconds`.
 * Call it before the game's own render, and only while the card is open.
 * Returns how many were drawn.
 */
export function drawColorsPreviews(renderer, seconds, { calm = false } = {}) {
    if (!renderer || typeof document === 'undefined') return 0;
    const s = build();
    s.turf.color.set(turfFrom(fieldColor()).grass);
    let drawn = 0;
    for (const [team, id] of [[0, 'x'], [1, 'o']]) {
        const target = document.getElementById(`colors-${id}-preview`);
        if (!target) continue;
        dressKitFigure(s.figures[team], team);
        for (const other of [0, 1]) s.figures[other].visible = other === team;
        s.figures[team].rotation.y = previewYaw(seconds, { calm });
        drawIntoCorner(renderer, target, s);
        drawn += 1;
    }
    return drawn;
}
