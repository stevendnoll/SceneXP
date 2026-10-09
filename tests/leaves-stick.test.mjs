// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The walking joystick on a touch screen (www/leaves/js/stick.js). Steve's
 * QA, 2026-10-08: "add a left joystick for the player movement instead of
 * tapping/swiping around the screen", "the positions of the left joystick
 * and the blow button can mirror the positions of the joysticks in our
 * scenes with the dual joystick layout", and "let's remove the tapping and
 * dragging to walk option". The page's side is in tests/leaves-init.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installThree } from './helpers/three-stub.mjs';

installThree();
const St = await import('../www/leaves/js/stick.js');
const Op = await import('../www/leaves/js/blower.js');
const { LEAVES_CONFIG: C } = await import('../www/leaves/js/config.js');

const K = C.touch.stick;

describe('the stick', () => {
    test('a finger\'s offset is the stick\'s way and reach, as far as the rim', () => {
        expect(St.stickVector(0, 0, K.radius)).toEqual({ x: 0, y: 0, m: 0 });
        const half = St.stickVector(K.radius / 2, 0, K.radius);
        expect(half.x).toBeCloseTo(0.5, 9);
        expect(half.m).toBeCloseTo(0.5, 9);
        // Past the rim is the rim.
        const far = St.stickVector(0, -K.radius * 3, K.radius);
        expect(far.y).toBeCloseTo(-1, 9);
        expect(far.m).toBe(1);
    });

    test('nothing for a hair, a turn in place for a light push, a walk past that, faster further out', () => {
        expect(St.stickAim(null, K)).toBe(null);
        expect(St.stickAim(St.stickVector(K.radius * K.dead * 0.5, 0, K.radius), K)).toBe(null);
        const turn = St.stickAim(St.stickVector(K.radius * (K.dead + K.turn) / 2, 0, K.radius), K);
        expect(turn).toEqual({ mode: 'face', x: 1, z: 0 });
        const crawl = St.stickAim(St.stickVector(0, K.radius * (K.turn + 0.01), K.radius), K);
        const full = St.stickAim(St.stickVector(0, K.radius, K.radius), K);
        expect(crawl.mode).toBe('keys');
        expect(crawl.z).toBeGreaterThan(K.crawl - 0.01);
        expect(crawl.z).toBeLessThan(K.crawl + 0.05);
        expect(full.z).toBeCloseTo(1, 9);
        // Screen up is toward the house (-z), as the up key walks.
        expect(St.stickAim(St.stickVector(0, -K.radius, K.radius), K).z).toBeCloseTo(-1, 9);
    });

    test('a turn in place turns the person and walks them nowhere', () => {
        const B = C.blower;
        const op = { ...Op.createOperator(B), heading: Math.PI };
        const area = { minX: -9.5, maxX: 9.6, minZ: -5.4, maxZ: 9 };
        for (let i = 0; i < 60; i++) Op.stepOperator(op, { mode: 'face', x: 1, z: 0 }, 1 / 30, B, area);
        expect(op.x).toBe(B.start.x);
        expect(op.z).toBe(B.start.z);
        expect(op.heading).toBeCloseTo(Math.PI / 2, 6);
        expect(op.speed).toBe(0);
    });
});

describe('the stick, held', () => {
    /** A stand-in element that keeps its listeners and its classes. */
    function element(rect = null) {
        const listeners = {};
        const classes = new Set();
        return {
            listeners,
            style: {},
            classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), has: (c) => classes.has(c) },
            addEventListener: (type, fn) => { listeners[type] = fn; },
            setPointerCapture() {},
            getBoundingClientRect: () => rect,
            fire(type, e = {}) {
                const event = { cancelable: true, defaultPrevented: false, preventDefault() { event.defaultPrevented = true; }, ...e };
                listeners[type](event);
                return event;
            }
        };
    }

    test('one finger at a time, measured from the ring\'s middle, the thumb following to the rim, and let go', () => {
        const zone = element();
        const base = element({ left: 30, top: 500, width: 120, height: 120 });
        const thumb = element();
        let started = 0;
        const stick = St.createStick(zone, base, thumb, K, { onStart: () => { started++; } });
        expect(stick.active()).toBe(false);
        const down = zone.fire('pointerdown', { pointerId: 7, clientX: 90, clientY: 560 - K.radius });
        expect(down.defaultPrevented).toBe(true);
        expect(started).toBe(1);
        expect(stick.active()).toBe(true);
        expect(zone.classList.has('stick-on')).toBe(true);
        expect(stick.vector().y).toBeCloseTo(-1, 9);
        expect(thumb.style.transform).toBe(`translate(0px, ${-K.radius}px)`);
        // A second finger is not taken while the first holds it.
        zone.fire('pointerdown', { pointerId: 8, clientX: 200, clientY: 560 });
        expect(started).toBe(1);
        zone.fire('pointermove', { pointerId: 8, clientX: 200, clientY: 560 });
        expect(stick.vector().y).toBeCloseTo(-1, 9);
        // Far past the rim, the thumb stops at it.
        zone.fire('pointermove', { pointerId: 7, clientX: 90 + K.radius * 4, clientY: 560 });
        expect(stick.vector().x).toBeCloseTo(1, 9);
        expect(thumb.style.transform).toBe(`translate(${K.radius}px, 0px)`);
        // Another finger's lift is not this one's.
        zone.fire('pointerup', { pointerId: 8 });
        expect(stick.active()).toBe(true);
        zone.fire('lostpointercapture', { pointerId: 7 });
        expect(stick.active()).toBe(false);
        expect(stick.vector()).toEqual({ x: 0, y: 0, m: 0 });
        expect(zone.classList.has('stick-on')).toBe(false);
        expect(thumb.style.transform).toBe('translate(0px, 0px)');
        expect(zone.fire('contextmenu').defaultPrevented).toBe(true);
    });

    test('no zone, no stick, and nothing breaks', () => {
        const stick = St.createStick(null, null, null, K);
        expect(stick.active()).toBe(false);
        expect(stick.vector().m).toBe(0);
        expect(() => stick.reset()).not.toThrow();
    });
});

describe('where the controls sit', () => {
    const shared = readFileSync(join(process.cwd(), 'www/shared/css/styles-1.0.0.css'), 'utf8');
    const ours = readFileSync(join(process.cwd(), 'www/leaves/css/experience.css'), 'utf8');
    const html = readFileSync(join(process.cwd(), 'www/leaves/index.html'), 'utf8');
    const rule = (css, sel) => (css.match(new RegExp(`(?:^|\\n)${sel.replace(/[.#]/g, '\\$&')}\\s*\\{([^}]*)\\}`)) || [])[1] || '';
    const px = (block, prop) => Number((block.match(new RegExp(`(?:^|\\s|;)${prop}:\\s*(?:calc\\()?(\\d+)px`)) || [])[1]);

    test('the walking joystick is the shared one, in the shared place', () => {
        expect(html).toMatch(/<div id="touch-controls"[^>]*>\s*<div id="joystick-zone">\s*<div class="joystick-base-fixed">\s*<div class="joystick-thumb-fixed">/);
        // No right joystick: the blow button stands in its place.
        expect(html).not.toMatch(/look-joystick-zone/);
    });

    test('the blow button mirrors it: the shared ring\'s size, as far in from the right as the joystick is from the left', () => {
        const base = rule(shared, '.joystick-base-fixed');
        const blow = rule(ours, '.blow-btn');
        expect(px(blow, 'width')).toBe(px(base, 'width'));
        expect(px(blow, 'height')).toBe(px(base, 'height'));
        expect(px(blow, 'right')).toBe(px(base, 'left'));
        expect(px(blow, 'bottom')).toBe(px(base, 'bottom'));
        // And ours, clear of a notched phone's edges, keep the shared numbers.
        const ring = rule(ours, '#joystick-zone .joystick-base-fixed');
        expect(px(ring, 'left')).toBe(px(base, 'left'));
        expect(px(ring, 'bottom')).toBe(px(base, 'bottom'));
    });

    test('the welcome card tells a touch screen about the joystick and the button, not a finger on the lawn', () => {
        expect(html).toMatch(/joystick in the lower left walks you/);
        expect(html).toMatch(/blow button in the lower right/);
        expect(html).not.toMatch(/drag a finger across it/);
    });
});
