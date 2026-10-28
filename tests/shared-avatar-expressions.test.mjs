// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * A face for the moment (shared/js/avatar-expressions-1.0.0.js), from
 * SOURCE, measured on the REAL three.js (specs/meme M1).
 *
 * What is held here, and why:
 * - A SHOCKED FACE IS BUILT RIGHT, NOT CUT: the overrides give the figure
 *   the "o" mouth and the figure part raises the brows, so the brows still
 *   clear the widened eyes.
 * - THE TWEAKS STAY INSIDE THE EYE: a shrunk pupil sits within its widened
 *   white, the whites never touch, and a sleepy lid steps aside.
 * - UNDO PUTS BACK EXACTLY WHAT WAS CHANGED, once, and nothing else.
 * - NOTHING HAPPENS FOR `none`, an unknown id, or a figure with no head.
 */
import { loadRealThree } from './helpers/real-three.mjs';

let THREE;
let X;
let F;

beforeAll(async () => {
    THREE = await loadRealThree();
    globalThis.THREE = THREE;
    X = await import('../www/shared/js/avatar-expressions-1.0.0.js');
    F = await import('../www/shared/js/avatar-figure-1.0.0.min.js');
});

afterAll(() => {
    delete globalThis.THREE;
});

const headOf = (figure) => figure.person.getObjectByName('head');
const eyesOf = (head) => head.children.filter((o) => o.userData.isEye);
const lensesOf = (head) => head.children.filter((o) => o.userData.isIris || o.userData.isPupil);

/** The lowest y of a mesh's vertices, in the head's coordinates. */
function lowest(mesh) {
    let low = Infinity;
    const p = mesh.geometry.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrix);
        low = Math.min(low, v.y);
    }
    return low;
}

test('the list leads with the saved face, and an unknown id is that face', () => {
    expect(X.EXPRESSIONS[0].id).toBe('none');
    expect(X.EXPRESSIONS.map((e) => e.id)).toContain('shocked');
    expect(X.expressionOf('shocked').label).toBe('Shocked');
    expect(X.expressionOf('nope')).toBe(X.EXPRESSIONS[0]);
    expect(X.expressionOf(undefined)).toBe(X.EXPRESSIONS[0]);
});

test('the overrides are the figure part\'s own mouth, and nothing for the saved face', () => {
    expect(X.expressionOverrides('shocked')).toEqual({ mouth: 'surprised' });
    expect(X.expressionOverrides('none')).toEqual({});
    expect(X.expressionOverrides('nope')).toEqual({});
    // A copy each time, so a caller cannot change the part's table.
    const a = X.expressionOverrides('shocked');
    a.mouth = 'grin';
    expect(X.expressionOverrides('shocked')).toEqual({ mouth: 'surprised' });
    expect(X.withExpression({ mouth: 'grin', skin: 'deep' }, 'shocked')).toMatchObject({ mouth: 'surprised', skin: 'deep' });
    expect(X.withExpression({ mouth: 'grin' }, 'none').mouth).toBe('grin');
});

test('a shocked figure has the "o" mouth, wide eyes with small pupils inside them, and brows that clear the eyes', () => {
    const figure = F.createAvatar({ eyeShape: 'wide' }, { overrides: X.expressionOverrides('shocked') });
    const head = headOf(figure);
    const eyes = eyesOf(head);
    const before = eyes.map((e) => e.scale.clone());
    const undo = X.applyExpression(figure, 'shocked');
    expect(typeof undo).toBe('function');
    const K = X.EXPRESSION_SIZE.shocked;
    eyes.forEach((e, i) => {
        expect(e.scale.x).toBeCloseTo(before[i].x * K.eyes, 9);
        expect(e.scale.y).toBeCloseTo(before[i].y * K.eyes, 9);
        expect(e.scale.z).toBe(before[i].z);
    });
    // The mouth is the surprised torus.
    const mouth = head.getObjectByName('mouth');
    expect(mouth.children.some((m) => m.geometry.type === 'TorusGeometry')).toBe(true);
    // Every lens sits inside its eye's widened outline, across and up.
    for (const lens of lensesOf(head)) {
        const eye = eyes.find((e) => Math.abs(e.position.x - lens.position.x) < 1e-6);
        const er = eye.geometry.parameters.radius;
        const lr = lens.geometry.parameters.radius;
        expect(lr * lens.scale.x).toBeLessThan(er * eye.scale.x);
        expect(lr * lens.scale.y).toBeLessThan(er * eye.scale.y);
    }
    // The two whites never meet across the nose.
    const [l, r] = eyes.slice().sort((a, b) => a.position.x - b.position.x);
    expect(l.position.x + l.geometry.parameters.radius * l.scale.x).toBeLessThan(r.position.x - r.geometry.parameters.radius * r.scale.x);
    // The brows, raised for the surprised mouth, still clear the eyes' tops.
    head.updateMatrixWorld(true);
    const brows = head.getObjectByName('brows').children;
    expect(brows).toHaveLength(2);
    const sideOf = (mesh) => {
        const p = mesh.geometry.attributes.position;
        let x = 0;
        for (let i = 0; i < p.count; i++) x += p.getX(i);
        return Math.sign(x);
    };
    for (const brow of brows) {
        const eye = eyes.find((e) => Math.sign(e.position.x) === sideOf(brow));
        expect(eye).toBeTruthy();
        const top = eye.position.y + eye.geometry.parameters.radius * eye.scale.y;
        expect(lowest(brow)).toBeGreaterThan(top);
    }
    figure.dispose();
});

test('a sleepy eye is thrown open, and undo puts back the lid, the eyes and the lenses exactly, once', () => {
    const figure = F.createAvatar({ eyeShape: 'sleepy' }, { overrides: X.expressionOverrides('shocked') });
    const head = headOf(figure);
    const lids = head.children.filter((o) => o.name === 'lid');
    expect(lids).toHaveLength(2);
    const snapshot = () => head.children.map((o) => [o.scale.x, o.scale.y, o.scale.z, o.visible]);
    const before = snapshot();
    const undo = X.applyExpression(figure, 'shocked');
    expect(lids.every((l) => l.visible === false)).toBe(true);
    expect(snapshot()).not.toEqual(before);
    undo();
    expect(snapshot()).toEqual(before);
    expect(lids.every((l) => l.visible === true)).toBe(true);
    // A second undo is nothing, and the face can be shocked again after.
    undo();
    expect(snapshot()).toEqual(before);
    const again = X.applyExpression(figure, 'shocked');
    expect(snapshot()).not.toEqual(before);
    again();
    expect(snapshot()).toEqual(before);
    figure.dispose();
});

test('the saved face, an unknown id, and a figure with no head change nothing', () => {
    const figure = F.createAvatar({});
    const head = headOf(figure);
    const before = head.children.map((o) => [o.scale.x, o.scale.y, o.visible]);
    for (const id of ['none', 'nope', undefined]) {
        const undo = X.applyExpression(figure, id);
        expect(head.children.map((o) => [o.scale.x, o.scale.y, o.visible])).toEqual(before);
        undo();
    }
    expect(typeof X.applyExpression(null, 'shocked')).toBe('function');
    expect(typeof X.applyExpression({}, 'shocked')).toBe('function');
    expect(typeof X.applyExpression(new THREE.Group(), 'shocked')).toBe('function');
    // The head group itself, or a group holding it, is found too.
    const undo = X.applyExpression(head, 'shocked');
    expect(head.children.map((o) => [o.scale.x, o.scale.y, o.visible])).not.toEqual(before);
    undo();
    const holder = new THREE.Group();
    holder.add(figure.group);
    const undo2 = X.applyExpression(holder, 'shocked');
    expect(head.children.map((o) => [o.scale.x, o.scale.y, o.visible])).not.toEqual(before);
    undo2();
    expect(head.children.map((o) => [o.scale.x, o.scale.y, o.visible])).toEqual(before);
    figure.dispose();
});
