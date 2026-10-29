// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * A face for the moment (shared/js/avatar-expressions-1.0.0.js), from
 * SOURCE, measured on the REAL three.js (specs/meme M1 and M2).
 *
 * What is held here, and why:
 * - A SHOCKED FACE IS BUILT RIGHT, NOT CUT: the overrides give the figure
 *   the "o" mouth and the figure part raises the brows, so the brows still
 *   clear the widened eyes.
 * - THE TWEAKS STAY INSIDE THE EYE: a shrunk pupil sits within its widened
 *   white, a slid pupil too, the whites never touch, and a sleepy lid
 *   steps aside.
 * - A BROW TURNS ABOUT ITS OWN MIDDLE: anger brings the inner ends down,
 *   worry brings them up, and one brow can rise alone. The mouth flattens
 *   or turns over about its own middle, so a frown sits where the smile
 *   was. Tears and sweat sit on the face, not inside it or off it.
 * - UNDO PUTS BACK EXACTLY WHAT WAS CHANGED, once, for every expression,
 *   and nothing is left in the head.
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

/** Every vertex of a mesh in the head's coordinates. */
function vertices(mesh, head) {
    head.updateMatrixWorld(true);
    const toHead = new THREE.Matrix4().copy(head.matrixWorld).invert().multiply(mesh.matrixWorld);
    const p = mesh.geometry.attributes.position;
    const out = [];
    for (let i = 0; i < p.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(toHead));
    return out;
}

/** The brow meshes, with their inner and outer ends' heights. */
function browEnds(head) {
    const out = [];
    head.getObjectByName('brows').traverse((o) => {
        if (o.name !== 'brow') return;
        const vs = vertices(o, head);
        const side = Math.sign(vs.reduce((s, v) => s + v.x, 0));
        const inner = vs.reduce((a, v) => (Math.abs(v.x) < Math.abs(a.x) ? v : a));
        const outer = vs.reduce((a, v) => (Math.abs(v.x) > Math.abs(a.x) ? v : a));
        const middle = vs.reduce((s, v) => s + v.y, 0) / vs.length;
        out.push({ side, inner: inner.y, outer: outer.y, middle });
    });
    return out.sort((a, b) => a.side - b.side);
}

/** The mouth's lips' lowest, highest and middle, in the head's coordinates. */
function mouthShape(head) {
    const lips = head.getObjectByName('mouth').children.find((m) => m.name === 'lips');
    const vs = vertices(lips, head);
    const ys = vs.map((v) => v.y);
    const corners = vs.filter((v) => Math.abs(v.x) > 0.018).map((v) => v.y);
    const middle = vs.filter((v) => Math.abs(v.x) < 0.004).map((v) => v.y);
    const avg = (a) => a.reduce((s, y) => s + y, 0) / a.length;
    return { low: Math.min(...ys), high: Math.max(...ys), height: Math.max(...ys) - Math.min(...ys), corners: avg(corners), middle: avg(middle) };
}

/** What the head holds, so an undo can be checked exactly. */
function snapshot(head) {
    const out = [];
    head.traverse((o) => {
        out.push([o.name, o.uuid, o.parent && o.parent.uuid, o.position.x, o.position.y, o.position.z, o.scale.x, o.scale.y, o.scale.z, o.rotation.z, o.visible]);
    });
    return out;
}

test('the list leads with the saved face, and an unknown id is that face', () => {
    expect(X.EXPRESSIONS[0].id).toBe('none');
    expect(X.EXPRESSIONS.map((e) => e.id)).toEqual(['none', 'shocked', 'rage', 'smug', 'deadpan', 'crying', 'sideEye', 'raisedBrow', 'sweat', 'bigGrin', 'ooh']);
    expect(X.expressionOf('shocked').label).toBe('Shocked');
    expect(X.expressionOf('nope')).toBe(X.EXPRESSIONS[0]);
    expect(X.expressionOf(undefined)).toBe(X.EXPRESSIONS[0]);
    for (const e of X.EXPRESSIONS) expect(e.label).not.toMatch(/[;—]/);
});

test('the overrides are the figure part\'s own mouths, and nothing for the saved face', () => {
    expect(X.expressionOverrides('shocked')).toEqual({ mouth: 'surprised' });
    // Rage is a smile turned over, a frown (a grin read as glee, 2026-10-28).
    expect(X.expressionOverrides('rage')).toEqual({ mouth: 'smile' });
    expect(X.EXPRESSION_SIZE.rage.mouthFlip).toBe(true);
    // Ooh is the surprised mouth without the thrown-open eyes.
    expect(X.expressionOverrides('ooh')).toEqual({ mouth: 'surprised' });
    expect(X.EXPRESSION_SIZE.ooh.openLids).toBeUndefined();
    expect(X.expressionOverrides('bigGrin')).toEqual({ mouth: 'bigSmile' });
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
    const mouth = head.getObjectByName('mouth');
    expect(mouth.children.some((m) => m.geometry.type === 'TorusGeometry')).toBe(true);
    for (const lens of lensesOf(head)) {
        const eye = eyes.find((e) => Math.abs(e.position.x - lens.position.x) < 1e-6);
        const er = eye.geometry.parameters.radius;
        const lr = lens.geometry.parameters.radius;
        expect(lr * lens.scale.x).toBeLessThan(er * eye.scale.x);
        expect(lr * lens.scale.y).toBeLessThan(er * eye.scale.y);
    }
    const [l, r] = eyes.slice().sort((a, b) => a.position.x - b.position.x);
    expect(l.position.x + l.geometry.parameters.radius * l.scale.x).toBeLessThan(r.position.x - r.geometry.parameters.radius * r.scale.x);
    for (const brow of browEnds(head)) {
        const eye = eyes.find((e) => Math.sign(e.position.x) === brow.side);
        expect(Math.min(brow.inner, brow.outer)).toBeGreaterThan(eye.position.y + eye.geometry.parameters.radius * eye.scale.y);
    }
    figure.dispose();
});

test('rage brings the inner ends of the brows down, worry and crying bring them up, and one brow can rise alone', () => {
    const level = (figure) => browEnds(headOf(figure));
    const rage = F.createAvatar({}, { overrides: X.expressionOverrides('rage') });
    const flat = level(rage);
    X.applyExpression(rage, 'rage');
    for (const [i, brow] of level(rage).entries()) {
        expect(brow.inner).toBeLessThan(brow.outer);
        // Turned about its own middle: the middle stays put.
        expect(brow.middle).toBeCloseTo(flat[i].middle, 3);
    }
    rage.dispose();
    for (const id of ['crying', 'sweat']) {
        const f = F.createAvatar({}, { overrides: X.expressionOverrides(id) });
        X.applyExpression(f, id);
        for (const brow of level(f)) expect(brow.inner).toBeGreaterThan(brow.outer);
        f.dispose();
    }
    const one = F.createAvatar({}, { overrides: X.expressionOverrides('raisedBrow') });
    const rest = level(one);
    X.applyExpression(one, 'raisedBrow');
    const raised = level(one);
    const left = raised.find((b) => b.side > 0);
    const right = raised.find((b) => b.side < 0);
    expect(left.middle - rest.find((b) => b.side > 0).middle).toBeCloseTo(X.EXPRESSION_SIZE.raisedBrow.browLift.left, 4);
    expect(left.middle).toBeGreaterThan(right.middle + 0.005);
    one.dispose();
});

test('deadpan flattens the mouth to a line about its middle, and crying turns the smile into a frown where it was', () => {
    const plain = F.createAvatar({}, { overrides: X.expressionOverrides('deadpan') });
    const was = mouthShape(headOf(plain));
    expect(was.corners).toBeGreaterThan(was.middle);   // a smile: the corners up
    X.applyExpression(plain, 'deadpan');
    const flat = mouthShape(headOf(plain));
    expect(flat.height).toBeLessThan(was.height * 0.3);
    expect((flat.low + flat.high) / 2).toBeCloseTo((was.low + was.high) / 2, 3);
    plain.dispose();
    const sad = F.createAvatar({}, { overrides: X.expressionOverrides('crying') });
    const smile = mouthShape(headOf(sad));
    X.applyExpression(sad, 'crying');
    const frown = mouthShape(headOf(sad));
    expect(frown.corners).toBeLessThan(frown.middle);   // the corners down
    expect(frown.height).toBeCloseTo(smile.height, 4);
    expect((frown.low + frown.high) / 2).toBeCloseTo((smile.low + smile.high) / 2, 3);
    sad.dispose();
});

test('side-eye slides both pupils the same way and keeps them inside the whites', () => {
    const figure = F.createAvatar({ eyeShape: 'almond' }, { overrides: X.expressionOverrides('sideEye') });
    const head = headOf(figure);
    const eyes = eyesOf(head);
    const before = lensesOf(head).map((l) => l.position.x);
    X.applyExpression(figure, 'sideEye');
    lensesOf(head).forEach((lens, i) => {
        expect(lens.position.x - before[i]).toBeCloseTo(X.EXPRESSION_SIZE.sideEye.pupilShift, 9);
        const eye = eyes.find((e) => Math.abs(e.position.x - before[i]) < 1e-6);
        const reach = Math.abs(lens.position.x - eye.position.x) + lens.geometry.parameters.radius * lens.scale.x;
        expect(reach).toBeLessThan(eye.geometry.parameters.radius * eye.scale.x);
    });
    figure.dispose();
});

test('tears sit under the eyes and sweat on the forehead, each on the face, and all go with undo', () => {
    const onFace = (d) => Math.hypot(d.position.x, d.position.y, d.position.z);
    const cry = F.createAvatar({}, { overrides: X.expressionOverrides('crying') });
    const head = headOf(cry);
    const undo = X.applyExpression(cry, 'crying');
    const tears = head.children.filter((o) => o.name === 'tear');
    expect(tears).toHaveLength(2);
    for (const t of tears) {
        const eye = eyesOf(head).find((e) => Math.abs(e.position.x - t.position.x) < 1e-6);
        expect(t.position.y).toBeLessThan(eye.position.y - 0.02);
        expect(onFace(t)).toBeGreaterThan(X.HEAD_R);
        expect(onFace(t)).toBeLessThan(X.HEAD_R + 0.01);
        expect(t.material.transparent).toBe(true);
    }
    undo();
    expect(head.children.filter((o) => o.name === 'tear')).toHaveLength(0);
    cry.dispose();
    const nervous = F.createAvatar({}, { overrides: X.expressionOverrides('sweat') });
    const h2 = headOf(nervous);
    X.applyExpression(nervous, 'sweat');
    const drops = h2.children.filter((o) => o.name === 'sweat');
    expect(drops).toHaveLength(X.DROP_SIZE.sweatAt.length);
    for (const d of drops) {
        expect(d.position.y).toBeGreaterThan(0.02);
        expect(onFace(d)).toBeGreaterThan(X.HEAD_R);
        expect(onFace(d)).toBeLessThan(X.HEAD_R + 0.01);
    }
    nervous.dispose();
});

test('a sleepy eye is thrown open, and undo puts back everything exactly, once, for every expression', () => {
    for (const { id } of X.EXPRESSIONS) {
        const figure = F.createAvatar({ eyeShape: 'sleepy' }, { overrides: X.expressionOverrides(id) });
        const head = headOf(figure);
        const before = snapshot(head);
        const undo = X.applyExpression(figure, id);
        if (id === 'shocked') expect(head.children.filter((o) => o.name === 'lid').every((l) => l.visible === false)).toBe(true);
        if (id !== 'none') expect(snapshot(head)).not.toEqual(before);
        undo();
        expect({ [id]: snapshot(head) }).toEqual({ [id]: before });
        undo();
        expect(snapshot(head)).toEqual(before);
        // Applied again after an undo, and undone again.
        const again = X.applyExpression(figure, id);
        again();
        expect(snapshot(head)).toEqual(before);
        figure.dispose();
    }
});

test('the saved face, an unknown id, and a figure with no head change nothing', () => {
    const figure = F.createAvatar({});
    const head = headOf(figure);
    const before = snapshot(head);
    for (const id of ['none', 'nope', undefined]) {
        const undo = X.applyExpression(figure, id);
        expect(snapshot(head)).toEqual(before);
        undo();
    }
    expect(typeof X.applyExpression(null, 'shocked')).toBe('function');
    expect(typeof X.applyExpression({}, 'shocked')).toBe('function');
    expect(typeof X.applyExpression(new THREE.Group(), 'shocked')).toBe('function');
    // The head group itself, or a group holding it, is found too.
    const undo = X.applyExpression(head, 'shocked');
    expect(snapshot(head)).not.toEqual(before);
    undo();
    const holder = new THREE.Group();
    holder.add(figure.group);
    const undo2 = X.applyExpression(holder, 'shocked');
    expect(snapshot(head)).not.toEqual(before);
    undo2();
    expect(snapshot(head)).toEqual(before);
    // A head with no brows and no mouth (a crowd's) takes the eye tweaks only.
    const bare = new THREE.Group();
    bare.name = 'head';
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8));
    eye.userData.isEye = true;
    bare.add(eye);
    const undo3 = X.applyExpression(bare, 'rage');
    expect(eye.scale.y).toBeCloseTo(0.72, 9);
    undo3();
    expect(eye.scale.y).toBe(1);
    expect(X.middleOf(new THREE.Group())).toBeNull();
    figure.dispose();
});
