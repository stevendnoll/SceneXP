// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The opening, measured on the DRAWN figures rather than on the script.
 *
 * THIS NEEDS A REAL THREE AND CANNOT USE THE STUB. The stub absorbs every
 * assignment made to a mesh, so a figure's position, its turn and where its hand
 * ends up all read back as nothing. And the question these ask is exactly the
 * one the script cannot answer: the swipe was first staged from the pose's own
 * hand numbers and the drawn arm passed 0.4m short of the cooler, because with
 * both arms out the rig's hand settles 1.07m from his middle, not 1.65m.
 */
import { describe, test, expect, beforeAll } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const js = (name) => join(root, 'www/xo/js', name);

let THREE;
let CFG;
let V;
let O;
let figureFor;
let objects;
let men;
let plan;
const STEP = 1 / 60;

/** Where each forearm's hand is in the world: the child furthest from the elbow. */
function handsOf(figure) {
    figure.updateMatrixWorld(true);
    const out = [];
    figure.traverse((node) => {
        if (!node.userData || !node.userData.forearm) return;
        let far = null;
        for (const child of node.children) {
            if (!far || child.position.length() > far.position.length()) far = child;
        }
        if (far) out.push(far.getWorldPosition(new THREE.Vector3()));
    });
    return out;
}

beforeAll(async () => {
    const ctx = vm.createContext({ self: {}, window: {}, console: { warn() {} } });
    vm.runInContext(readFileSync(join(root, 'www/lib/three.min.js'), 'utf8'), ctx);
    THREE = ctx.THREE || ctx.self.THREE || ctx.window.THREE;
    globalThis.THREE = THREE;
    // The jersey letters are drawn on a canvas; nothing here looks at them.
    const quiet = () => new Proxy(function () {}, {
        get: (_t, p) => (p === Symbol.toPrimitive ? () => 0 : (p === 'then' ? undefined : quiet())),
        set: () => true, apply: () => quiet(), construct: () => quiet(),
    });
    globalThis.document = { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => quiet() }) };

    CFG = (await import(js('config.min.js'))).XO_CONFIG;
    const P = await import(js('play.min.js'));
    V = await import(js('view.min.js'));
    O = await import(js('opening.min.js'));
    const roster = await import(js('roster.min.js'));
    const { initBall } = await import(js('ball.min.js'));
    const { simToWorld } = await import(js('config.min.js'));
    figureFor = roster.figureFor;

    const scene = new THREE.Scene();
    const play = P.createPlay();
    objects = P.lineUp(play, 'pass2', 'cover2');
    roster.initRoster(scene, objects);
    initBall(scene);
    V.syncFigures(objects, 0, { presnap: true });
    men = objects.filter((o) => o.settings.position !== 'ball' && !o.settings.benched).map((o) => {
        const at = simToWorld(o.coords.x, o.coords.y, 0);
        return { position: o.settings.position, team: o.settings.team, x: at.x, z: at.z };
    });
    plan = O.planOpening(men, { aspect: 1.78 });
});

describe('the opening, as drawn', () => {
    test('every figure is drawn where the script puts him, and the swiping hand goes into the cooler', () => {
        const P = CFG.opening.props;
        const captain = figureFor(plan.captain);
        let off = 0;
        let closest = { d: Infinity, t: 0, y: 0 };
        for (let t = 0; t <= plan.hit + 0.15; t += STEP) {
            const cast = O.castAt(plan, t);
            V.setScripted(cast);
            V.syncFigures(objects, t === 0 ? 0 : STEP, {});
            for (const [position, at] of cast) {
                const f = figureFor(position);
                off = Math.max(off, Math.hypot(f.position.x - at.x, f.position.z - at.z));
            }
            if (Math.abs(t - plan.hit) < 0.1) {
                for (const hand of handsOf(captain)) {
                    const d = Math.hypot(hand.x - plan.cooler.x, hand.z - plan.cooler.z);
                    if (d < closest.d) closest = { d, t, y: hand.y };
                }
            }
        }
        expect(off).toBeLessThan(1e-6);
        // INSIDE the cooler's outline, at a height the cooler occupies, and on
        // the frame of the hit give or take the turn's own easing.
        expect(closest.d).toBeLessThan(P.cooler.radius);
        expect(closest.y).toBeGreaterThan(P.table.height);
        expect(closest.y).toBeLessThan(P.table.height + P.cooler.height);
        expect(Math.abs(closest.t - plan.hit)).toBeLessThan(0.05);
    });

    /**
     * THE ROTATIONS ARE CHECKED ON REAL MATRICES, because each of them was
     * worked out on paper: a yaw then a pitch to tip the cooler toward
     * `tipDir`, and a flat disc whose stretch has to end up along the same line.
     * Got backwards, the cooler falls into the captain and the puddle spreads
     * sideways.
     */
    test('the cooler falls the way it was pushed, the puddle spreads that way, and it all goes away', async () => {
        const Props = await import(js('opening-props.js'));
        const scene = new THREE.Scene();
        Props.initOpeningProps(scene);
        const P = CFG.opening.props;

        Props.applyOpeningProps(O.propsAt(plan, plan.hit - 0.01));
        const group = scene.children.find((c) => c.name === 'opening-props');
        expect(group.visible).toBe(true);
        expect(Props.openingPropsShowing()).toBe(true);
        const [table, cooler, lid, puddle] = group.children;
        const up = (node) => {
            node.updateMatrixWorld(true);
            const a = node.localToWorld(new THREE.Vector3(0, 0, 0));
            return node.localToWorld(new THREE.Vector3(0, 1, 0)).sub(a).normalize();
        };
        expect(up(cooler).y).toBeCloseTo(1, 6);
        expect(table.position.x).toBeCloseTo(plan.tableAt.x, 6);

        Props.applyOpeningProps(O.propsAt(plan, plan.hit + P.tipTime + P.fallTime + 2));
        const top = up(cooler);
        expect(top.y).toBeCloseTo(0, 6);
        expect(top.x * plan.tipDir.x + top.z * plan.tipDir.z).toBeCloseTo(1, 6);
        // The lid lies flat on the grass beyond it.
        expect(Math.abs(up(lid).y)).toBeCloseTo(1, 6);
        expect(lid.position.y).toBeCloseTo(P.cooler.lid / 2, 6);
        // The puddle's long axis runs along the fall.
        puddle.updateMatrixWorld(true);
        const o = puddle.localToWorld(new THREE.Vector3(0, 0, 0));
        const long = puddle.localToWorld(new THREE.Vector3(0, 1, 0)).sub(o);
        const wide = puddle.localToWorld(new THREE.Vector3(1, 0, 0)).sub(o);
        expect(long.length()).toBeGreaterThan(wide.length());
        expect(Math.abs(long.x * plan.tipDir.x + long.z * plan.tipDir.z) / long.length()).toBeCloseTo(1, 6);
        expect(Math.abs(long.y)).toBeLessThan(1e-9);

        Props.hideOpeningProps();
        expect(group.visible).toBe(false);
        expect(Props.openingPropsShowing()).toBe(false);
    });

    test('put back, every figure stands on his formation spot facing the way it faces', () => {
        V.resetScripted();
        for (let i = 0; i < CFG.opening.settleFrames; i += 1) V.syncFigures(objects, 1 / 30, { presnap: true });
        for (const man of men) {
            const f = figureFor(man.position);
            expect(Math.hypot(f.position.x - man.x, f.position.z - man.z)).toBeLessThan(1e-6);
            expect(Math.cos(f.rotation.y - (man.team === 0 ? Math.PI / 2 : -Math.PI / 2))).toBeGreaterThan(0.999);
        }
    });
});
