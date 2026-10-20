// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * crowd.js - the people at the derby (M6.2, M6.3, PRD The social event): the
 * crowd standing on the bleachers, the three neighbors' families cheering for
 * their cars by the far side of the track near the finish, the visitor's own
 * family (a grown-up and a kid, dressed on the family card) at the front,
 * and the volunteer behind the weigh-in table.
 *
 * EVERY ONE IS THE SAME BAKED PERSON (shared/js/crowd-1.0.0.js, the "crowd
 * is baked, not built" lesson): one figure in a dozen instanced pieces,
 * tinted per member, so the whole hall is a handful of draw calls however
 * many are in it. A child is the same figure at a child's size. A cheer is a
 * member's matrix moving from the arms-down pieces to the arms-up ones, and
 * a hop.
 *
 * WHAT THEY HOLD is a few small meshes of their own (a thermos, a sign, a
 * camcorder, a megaphone, a foam finger, a clipboard, last year's trophy),
 * set in the hands the shared part says each pose has. A prop holder keeps
 * the pose that holds it, and hops.
 *
 * THE PLANNING IS PURE (`bleacherSeats`, `crowdLooks`, `familyOf`,
 * `familyPlaces`, `poseAt`), so who stands where, wearing what, and who
 * cheers when, is tested without three. `createCrowd` draws it.
 */

import { DERBY_CONFIG } from './config.min.js';
import { SHIRTS, PANTS, SKINS, HAIR_COLORS, optionOf, normalizeChoice } from '../../shared/js/cast-1.0.0.min.js';
import { buildCrowdParts, HAIR, ARM_POSES } from '../../shared/js/crowd-1.0.0.min.js';

/** The arm poses the crowd is baked in. */
export const POSES = Object.freeze(['down', 'up', 'clap', 'hold']);

/**
 * HOLDING A SIGN UP (Steve's QA, 2026-10-19: the sign floated over the
 * kid's head). The cheer's arms are a wide V, the hands 0.85 m apart, wider
 * than any sign, so a sign is held in its own pose: arms raised nearly
 * straight and a little forward, the hands 0.57 m apart just over the
 * head (measured against real three). The board is then made to that grip.
 */
export const HOLD = Object.freeze({ x: -0.15, z: 3.0, fore: -0.6 });

/** The pose each prop is held in, and which hand holds it. The trophy is
 *  held up in one hand, the other arm up too: a champion's victory. */
export const PROPS = Object.freeze({
    thermos: Object.freeze({ pose: 'down', hand: 'right' }),
    sign: Object.freeze({ pose: 'hold', hand: 'both' }),
    camcorder: Object.freeze({ pose: 'clap', hand: 'both' }),
    megaphone: Object.freeze({ pose: 'clap', hand: 'both' }),
    finger: Object.freeze({ pose: 'up', hand: 'right' }),
    clipboard: Object.freeze({ pose: 'clap', hand: 'both' }),
    trophy: Object.freeze({ pose: 'up', hand: 'right' })
});

/** A sign's board for hands `grip` apart: the hands on its bottom
 *  corners, a little in from each edge, overlapping its lower edge and
 *  just in front of it, where the camera sees them. Pure. */
export function signBoard(grip) {
    const w = grip + 0.09;
    const h = 0.32;
    return { w, h, y: h / 2 - 0.06, z: -0.03 };
}

/** A small seeded random, the same crowd on every visit. */
export function seeded(seed) {
    let s = seed >>> 0 || 1;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

/** A look from cast-1.0.0 ids (a family card choice): hex colors and a
 *  hair style, or null hair for none. */
export function lookOf(choice, { kid = false, shirt = null } = {}, C = DERBY_CONFIG) {
    const c = normalizeChoice(choice);
    return {
        shirt: shirt === null ? optionOf(SHIRTS, c.shirt).color : shirt,
        pants: optionOf(PANTS, c.pants).color,
        skin: optionOf(SKINS, c.skin).color,
        hair: optionOf(HAIR_COLORS, c.hair).color,
        style: c.length === 'bald' ? null : c.length,
        scale: kid ? C.crowd.kidScale : 1
    };
}

/**
 * Where the crowd stands on the bleachers (hall.js's four steps): a place
 * every `spacing` along each step, a `fill` share of them taken, facing the
 * track. Returns [{ x, y, z }] in the hall. Pure.
 */
export function bleacherSeats(C = DERBY_CONFIG) {
    const K = C.crowd;
    const rand = seeded(K.seed);
    const seats = [];
    for (let row = 0; row < 4; row++) {
        for (let x = 0.4; x <= 13.6; x += K.spacing) {
            if (rand() > K.fill) continue;
            seats.push({ x: x + (rand() - 0.5) * 0.2, y: 0.42 * (row + 1), z: -2.2 - row * 0.8 + (rand() - 0.5) * 0.12 });
        }
    }
    return seats;
}

/** A look for each of `n` crowd members, from the cast palettes, a share of
 *  them children. Pure. */
export function crowdLooks(n, C = DERBY_CONFIG) {
    const rand = seeded(C.crowd.seed + 7);
    const pick = (list) => list[Math.floor(rand() * list.length)];
    const styles = [...HAIR, null];
    const out = [];
    for (let i = 0; i < n; i++) {
        const kid = rand() < C.crowd.kids;
        out.push({
            shirt: pick(SHIRTS).color,
            pants: pick(PANTS).color,
            skin: pick(SKINS).color,
            hair: pick(HAIR_COLORS).color,
            style: kid ? pick(HAIR) : pick(styles),
            scale: kid ? C.crowd.kidScale : 1
        });
    }
    return out;
}

/** A neighbor's family, from config: [{ look, prop, sign }]. Pure. */
export function familyOf(fieldId, C = DERBY_CONFIG) {
    const list = C.families[fieldId] || [];
    const paint = C.fieldColors[fieldId];
    return list.map((m) => ({
        look: lookOf({ shirt: 'rust', pants: m.pants, skin: m.skin, hair: m.hair, length: m.length }, { kid: Boolean(m.kid), shirt: m.shirt === undefined ? paint : m.shirt }, C),
        prop: m.prop || null,
        sign: m.sign || null
    }));
}

/**
 * Where each family stands for a race: the visitor's at the front, nearest
 * the finish, then each neighbor's in entry order back up the track, each
 * a little cluster facing the track. `groups` is [{ key, members }].
 * Returns [{ key, at: [{ x, y, z }] }]. Pure.
 */
export function familyPlaces(groups, C = DERBY_CONFIG) {
    const K = C.crowd;
    // From just before the finish line back up the track, a family at a
    // time, side by side, the second of each pair a step further back.
    let cursor = C.track.courseLength - K.familyFrom;
    return groups.map((g) => {
        const at = g.members.map((m, i) => ({ x: cursor - i * 0.42, y: 0, z: K.familyZ - (i % 2) * 0.28 }));
        cursor -= g.members.length * 0.42 + K.familyGap;
        return { key: g.key, at };
    });
}

/**
 * How a member stands in a moment of the race day: { pose, hop } (hop 0
 * to 1). `moment` is { kind, t, cheering (a set of group keys whose car is
 * running), won (the key of the group whose car just won, or null), still
 * (reduced motion: no beat, so no hop and no arms going up and down) }. A
 * prop holder keeps its prop's pose. Pure.
 */
export function poseAt(member, moment) {
    const held = member.prop ? PROPS[member.prop].pose : null;
    const beat = (rate) => {
        if (moment.still) return 0;
        const v = Math.sin((moment.t + member.phase) * rate);
        return v > 0 ? v : 0;
    };
    const { kind } = moment;
    if (member.group === 'crowd') {
        if (kind === 'run' || kind === 'replay') return { pose: member.keen ? 'up' : 'clap', hop: member.keen ? beat(9) * 0.6 : 0 };
        if (kind === 'times' || kind === 'dance') return { pose: member.keen ? 'up' : 'clap', hop: 0 };
        return { pose: 'down', hop: 0 };
    }
    if (member.group === 'volunteer') return { pose: 'down', hop: 0 };
    // The day's winner dancing (dances.js): the family cheers as for a heat.
    if (kind === 'times' || kind === 'dance') {
        const won = moment.won === member.group;
        // A win: up and jumping. A loss: arms down, still (the groan).
        return { pose: held || (won ? 'up' : 'down'), hop: won ? beat(11) : 0 };
    }
    if ((kind === 'run' || kind === 'replay') && moment.cheering && moment.cheering.has(member.group)) {
        return { pose: held || (beat(5) > 0.3 ? 'up' : 'clap'), hop: beat(10) * 0.7 };
    }
    if (kind === 'staging' || kind === 'gate') return { pose: held || 'clap', hop: 0 };
    return { pose: held || 'down', hop: 0 };
}

// ---- Drawing ----------------------------------------------------------------

const hexColor = (h) => new THREE.Color(h);

/** A prop's mesh, its hold point (the hand, or between the hands) at the
 *  origin. `text` for a sign, `grip` how far apart the hands hold it. */
function buildProp(kind, text, made, grip = 0.57) {
    const mat = (color, roughness = 0.5, metalness = 0) => {
        const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
        made.push(m);
        return m;
    };
    const mesh = (geo, m) => {
        made.push(geo);
        return new THREE.Mesh(geo, m);
    };
    const g = new THREE.Group();
    if (kind === 'thermos') {
        const body = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.26, 12), mat(0x2f6fd6, 0.4, 0.4));
        body.position.y = -0.06;
        g.add(body);
    } else if (kind === 'sign') {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 128;
        const c2 = canvas.getContext('2d');
        c2.fillStyle = '#fbf4e4';
        c2.fillRect(0, 0, 256, 128);
        c2.fillStyle = '#c8322b';
        c2.textAlign = 'center';
        c2.textBaseline = 'middle';
        let size = 54;
        c2.font = `900 ${size}px system-ui, sans-serif`;
        const w = c2.measureText(text).width;
        if (w > 236) {
            size *= 236 / w;
            c2.font = `900 ${size}px system-ui, sans-serif`;
        }
        c2.fillText(text, 128, 66);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        made.push(tex);
        const boardMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
        made.push(boardMat);
        const b = signBoard(grip);
        const board = mesh(new THREE.BoxGeometry(b.w, b.h, 0.01), boardMat);
        board.position.set(0, b.y, b.z);
        g.add(board);
    } else if (kind === 'camcorder') {
        g.add(mesh(new THREE.BoxGeometry(0.08, 0.07, 0.14), mat(0x26262c, 0.5)));
        const lens = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.04, 12), mat(0x111111, 0.3, 0.4));
        lens.rotation.x = Math.PI / 2;
        lens.position.z = 0.09;
        g.add(lens);
    } else if (kind === 'megaphone') {
        const cone = mesh(new THREE.CylinderGeometry(0.09, 0.025, 0.24, 14, 1, true), mat(0xf2c230, 0.5));
        cone.rotation.x = Math.PI / 2;
        cone.position.z = 0.12;
        g.add(cone);
    } else if (kind === 'finger') {
        const hand = mesh(new THREE.BoxGeometry(0.13, 0.14, 0.05), mat(0xd63c3c, 0.8));
        // Worn over the hand, the finger pointing up.
        hand.position.y = 0.01;
        const finger = mesh(new THREE.BoxGeometry(0.045, 0.16, 0.045), hand.material);
        finger.position.y = 0.15;
        g.add(hand, finger);
    } else if (kind === 'clipboard') {
        const board = mesh(new THREE.BoxGeometry(0.22, 0.3, 0.01), mat(0xc99a5e, 0.7));
        board.rotation.x = -0.9;
        board.position.z = 0.06;
        g.add(board);
    } else if (kind === 'trophy') {
        const pts = [[0.05, 0], [0.05, 0.02], [0.012, 0.03], [0.01, 0.1], [0.06, 0.13], [0.07, 0.22]].map(([r, y]) => new THREE.Vector2(r, y));
        const cup = mesh(new THREE.LatheGeometry(pts, 18), mat(0xe2b33c, 0.3, 0.6));
        // The hand round the stem.
        cup.position.y = -0.06;
        g.add(cup);
    }
    return g;
}

/**
 * The crowd, drawn: `capacity` members at most. Returns { group, ready,
 * set(members), pose(moment), stepAside(index), dispose }. Each member is { group (a key),
 * look, at: { x, y, z, ry }, prop, sign, keen, phase }. Under the test stub
 * (no geometry to bake) nothing is drawn and every call is safe.
 */
export function createCrowd(C = DERBY_CONFIG, { capacity = 160 } = {}) {
    const group = new THREE.Group();
    group.name = 'crowd';
    const parts = buildCrowdParts({ scale: 1, poses: POSES, armPoses: { ...ARM_POSES, hold: HOLD } });
    const made = [];
    if (!parts) {
        return { group, ready: false, set() {}, pose() {}, stepAside() {}, dispose() {} };
    }
    const lit = (vertexColors = false) => {
        const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, vertexColors });
        made.push(m);
        return m;
    };
    const instanced = (geometry, vertexColors = false) => {
        const mesh = new THREE.InstancedMesh(geometry, lit(vertexColors), capacity);
        mesh.count = 0;
        // The members are spread over the whole hall and the bench room:
        // a bounding sphere for the piece would cull the far ones.
        mesh.frustumCulled = false;
        group.add(mesh);
        made.push(geometry);
        return mesh;
    };
    const body = Object.fromEntries(Object.entries(parts.body).map(([k, g]) => [k, instanced(g, k === 'fixed')]));
    const hair = Object.fromEntries(HAIR.map((s) => [s, instanced(parts.hair[s])]));
    const arms = Object.fromEntries(POSES.map((p) => [p, { sleeve: instanced(parts.arms[p].sleeve), hand: instanced(parts.arms[p].hand) }]));
    const props = new THREE.Group();
    group.add(props);

    let members = [];
    // The props' geometries, materials and textures, let go at the next set.
    let propMade = [];
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();

    // The member who steps out of the crowd to dance (dancer.js takes its
    // place), or -1.
    let aside = -1;

    function matrixOf(m, hop) {
        q.setFromAxisAngle(up, m.at.ry || 0);
        v.set(m.at.x, m.at.y + hop * C.crowd.hop, m.at.z);
        sc.setScalar(m.look.scale);
        return m4.compose(v, q, sc);
    }

    function clearProps() {
        for (const p of props.children.slice()) props.remove(p);
        for (const m of propMade) m.dispose();
        propMade = [];
    }

    const api = {
        group,
        ready: true,
        parts,
        /** Put these members in the hall, dressed, and posed for `moment`
         *  at once: a member left unposed until the next frame would stand
         *  at the hall's origin for that frame. */
        set(list, moment = { kind: 'idle', t: 0 }) {
            members = list.slice(0, capacity).map((m) => ({ ...m, pose: null, hop: -1 }));
            aside = -1;
            const n = members.length;
            for (const mesh of [...Object.values(body), ...Object.values(hair), ...POSES.flatMap((p) => [arms[p].sleeve, arms[p].hand])]) mesh.count = n;
            clearProps();
            members.forEach((m, i) => {
                const L = m.look;
                body.shirt.setColorAt(i, hexColor(L.shirt));
                body.skin.setColorAt(i, hexColor(L.skin));
                body.pants.setColorAt(i, hexColor(L.pants));
                for (const p of POSES) {
                    arms[p].sleeve.setColorAt(i, hexColor(L.shirt));
                    arms[p].hand.setColorAt(i, hexColor(L.skin));
                }
                for (const s of HAIR) hair[s].setColorAt(i, hexColor(L.hair));
                if (m.prop) {
                    const [a, b] = parts.hands[PROPS[m.prop].pose];
                    m.propMesh = buildProp(m.prop, m.sign || '', propMade, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
                    props.add(m.propMesh);
                }
            });
            for (const mesh of [...Object.values(body), ...Object.values(hair), ...POSES.flatMap((p) => [arms[p].sleeve, arms[p].hand])]) {
                if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
            }
            api.pose(moment);
        },
        /** Pose everyone for the moment (see poseAt); only members whose pose
         *  or hop changed are redrawn. */
        pose(moment) {
            let dirty = false;
            members.forEach((m, i) => {
                const p = poseAt(m, moment);
                const away = i === aside;
                if (p.pose === m.pose && Math.abs(p.hop - m.hop) < 0.01 && away === Boolean(m.away)) return;
                m.pose = p.pose;
                m.hop = p.hop;
                m.away = away;
                dirty = true;
                const mat = away ? zero : matrixOf(m, p.hop);
                if (m.propMesh) m.propMesh.visible = !away;
                for (const k of Object.keys(body)) body[k].setMatrixAt(i, mat);
                for (const s of HAIR) hair[s].setMatrixAt(i, m.look.style === s ? mat : zero);
                for (const pose of POSES) {
                    arms[pose].sleeve.setMatrixAt(i, pose === p.pose ? mat : zero);
                    arms[pose].hand.setMatrixAt(i, pose === p.pose ? mat : zero);
                }
                if (m.propMesh) {
                    const hold = PROPS[m.prop];
                    const [a, b] = parts.hands[p.pose];
                    const at = hold.hand === 'right' ? (a[0] < b[0] ? a : b) : [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
                    v.set(at[0], at[1], at[2]).multiplyScalar(m.look.scale).applyAxisAngle(up, m.at.ry || 0);
                    m.propMesh.position.set(m.at.x + v.x, m.at.y + v.y + p.hop * C.crowd.hop, m.at.z + v.z);
                    m.propMesh.rotation.y = m.at.ry || 0;
                    m.propMesh.scale.setScalar(m.look.scale);
                }
            });
            if (!dirty) return;
            for (const mesh of [...Object.values(body), ...Object.values(hair), ...POSES.flatMap((p) => [arms[p].sleeve, arms[p].hand])]) {
                mesh.instanceMatrix.needsUpdate = true;
            }
        },
        /** Member `index` out of the crowd (drawn by nobody until the next
         *  pose, which a dancer standing in its place draws), or everyone
         *  back (-1). Its prop goes with it. */
        stepAside(index) {
            aside = index;
        },
        dispose() {
            clearProps();
            for (const m of made) m.dispose();
        }
    };
    return api;
}
