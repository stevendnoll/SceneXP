// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * stick.js - the walking joystick on a touch screen (Steve's QA, 2026-10-08:
 * "add a left joystick for the player movement instead of tapping/swiping
 * around the screen", placed where the dual-joystick scenes put theirs).
 *
 * The ring and its thumb are the shared ones (#touch-controls, #joystick-zone
 * and .joystick-base-fixed in styles-1.0.0.css, as www/interstate has them),
 * low in the left corner, and the blow button takes the right one's place.
 * The shared controls-1.0.0.js walks and looks in the first person, so the
 * steering here is the scene's own:
 *
 *   - the stick's way is the way they walk, screen up toward the house,
 *     down toward the street, as the keys walk them;
 *   - the further it goes the faster, from a crawl to a walk;
 *   - a light push, inside `turn` of the ring, only turns them where they
 *     stand, so a visitor can face a pile without walking into it, and
 *     the blower points the way they face;
 *   - a hair's push, inside `dead`, does nothing.
 *
 * A finger on the lawn no longer walks (Steve: "let's remove the tapping and
 * dragging to walk option"). Two of them still pinch to zoom.
 *
 * PURE: stickVector and stickAim are plain numbers. createStick does the
 * listening and moves the thumb.
 */

/** Where a finger `dx`, `dy` pixels from the ring's middle puts the stick:
 *  { x, y, m }, each axis -1 to 1 (y down the screen), `m` how far out, 0 to
 *  1, as far as `radius` pixels counts as all the way. */
export function stickVector(dx, dy, radius) {
    const d = Math.hypot(dx, dy);
    if (d < 1e-9) return { x: 0, y: 0, m: 0 };
    const m = Math.min(1, d / radius);
    return { x: (dx / d) * m, y: (dy / d) * m, m };
}

/**
 * What the stick asks of the person (blower.js stepOperator's aim): nothing
 * inside `K.dead`, a turn to face its way inside `K.turn` ({ mode: 'face',
 * x, z }), and past that a walk its way ({ mode: 'keys', x, z }) from a
 * crawl at `K.turn` to full pace at the rim. Screen right is +x, screen
 * down is +z, toward the street.
 */
export function stickAim(v, K) {
    if (!v || v.m < K.dead) return null;
    const ux = v.x / v.m;
    const uz = v.y / v.m;
    if (v.m < K.turn) return { mode: 'face', x: ux, z: uz };
    const k = Math.min(1, (v.m - K.turn) / (1 - K.turn) * (1 - K.crawl) + K.crawl);
    return { mode: 'keys', x: ux * k, z: uz * k };
}

/**
 * Listen on `zone` (#joystick-zone) for one finger at a time, measured from
 * the middle of `base` (its ring), moving `thumb` to follow it as far as
 * the rim. `onStart` hears when a finger takes it. Returns { vector(),
 * active(), reset() }.
 */
export function createStick(zone, base, thumb, K, { signal, onStart } = {}) {
    const stick = { id: null, cx: 0, cy: 0, v: { x: 0, y: 0, m: 0 } };
    const show = () => {
        if (thumb && thumb.style) thumb.style.transform = `translate(${stick.v.x * K.radius}px, ${stick.v.y * K.radius}px)`;
    };
    const reset = () => {
        stick.id = null;
        stick.v = { x: 0, y: 0, m: 0 };
        show();
        if (zone && zone.classList) zone.classList.remove('stick-on');
    };
    if (!zone || !zone.addEventListener) return { vector: () => stick.v, active: () => false, reset };
    zone.addEventListener('pointerdown', (event) => {
        if (stick.id !== null) return;
        if (event.cancelable) event.preventDefault();
        stick.id = event.pointerId;
        const r = base && base.getBoundingClientRect ? base.getBoundingClientRect() : null;
        stick.cx = r ? r.left + r.width / 2 : event.clientX;
        stick.cy = r ? r.top + r.height / 2 : event.clientY;
        stick.v = stickVector(event.clientX - stick.cx, event.clientY - stick.cy, K.radius);
        show();
        if (zone.classList) zone.classList.add('stick-on');
        if (zone.setPointerCapture) {
            try { zone.setPointerCapture(event.pointerId); } catch (e) { /* not capturable */ }
        }
        if (onStart) onStart();
    }, { signal });
    zone.addEventListener('pointermove', (event) => {
        if (event.pointerId !== stick.id) return;
        if (event.cancelable) event.preventDefault();
        stick.v = stickVector(event.clientX - stick.cx, event.clientY - stick.cy, K.radius);
        show();
    }, { signal });
    const lift = (event) => {
        if (event.pointerId === stick.id) reset();
    };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((type) => zone.addEventListener(type, lift, { signal }));
    // A long press must not open the browser's menu over it.
    zone.addEventListener('contextmenu', (event) => event.preventDefault(), { signal });
    return { vector: () => stick.v, active: () => stick.id !== null, reset };
}
