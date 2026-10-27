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
 *
 * WHAT IS SHARED (crowd-1.0.0, 2026-10-20): the drawing (createCrowdView),
 * the arm poses, the cheers and the clap. What is the derby's own is here:
 * who stands where, what they hold, and who cheers when.
 */

import { DERBY_CONFIG } from './config.min.js';
import { SHIRTS, PANTS, SKINS, HAIR_COLORS, optionOf, normalizeChoice } from '../../shared/js/cast-1.0.0.min.js';
import { buildCrowdParts, createCrowdView, cheerAt, heldCheerAt, clapAt, HAIR, CHEER_POSES, HELD_POSES } from '../../shared/js/crowd-1.0.0.min.js';

// The cheers are the shared crowd's (2026-10-20); main.js picks them.
export { CHEERS, pickCheers } from '../../shared/js/crowd-1.0.0.min.js';

/** The arm poses the hall is baked in (shared ARM_POSES): the shared
 *  cheers' (CHEER_POSES), clapping (`apart`) and holding a sign up (`hold`). */
export const POSES = Object.freeze(['down', 'up', 'clap', 'hold', 'holdLow', 'apart', 'roof', 'clapHigh', 'flex', 'point']);
for (const p of [...CHEER_POSES, ...HELD_POSES]) if (!POSES.includes(p)) throw new Error(`crowd.js: the cheers need the '${p}' pose baked`);

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
    // By the finish, close to the camera: the rig's fingered hands, not
    // the crowd's box (Steve's QA, 2026-10-26).
    return list.map((m) => ({
        look: { ...lookOf({ shirt: 'rust', pants: m.pants, skin: m.skin, hair: m.hair, length: m.length }, { kid: Boolean(m.kid), shirt: m.shirt === undefined ? paint : m.shirt }, C), hands: 'real' },
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
 * How a member stands in a moment of the race day: { pose, hop, lean } (hop
 * a share of config crowd.hop, lean a sway in radians, the bleachers' only).
 * `moment` is { kind, t, cheering (a set of group keys whose car is
 * running), won (the key of the group whose car just won, or null), still
 * (reduced motion: no beat, so no hop, no sway and no arms going up and
 * down) }. A prop holder keeps its prop's pose. Pure.
 *
 * THE FAMILIES BY THE TRACK DO NOT JUMP WHILE THE CARS RUN (Steve's QA,
 * 2026-10-20: it drew the eye from the cars). Their arms still pump. They
 * jump for a win in the crowd shot after a heat, and in the finale, where
 * the shot is about them.
 *
 * THE BLEACHERS CHEER (the same QA: they stood still). Through a heat and
 * its times the keen ones pump their arms and jump, higher than a family
 * (they are further from the camera), and the rest clap and sway. At the
 * gate the keen ones clap and the rest sway a little.
 */
export function poseAt(member, moment, C = DERBY_CONFIG) {
    const held = member.prop ? PROPS[member.prop].pose : null;
    const wave = (rate) => (moment.still ? 0 : Math.sin((moment.t + member.phase) * rate));
    const beat = (rate) => {
        const v = wave(rate);
        return v > 0 ? v : 0;
    };
    const { kind } = moment;
    if (member.group === 'crowd') {
        const K = C.crowd.stands;
        const clap = clapAt(moment.t, { phase: member.phase, rate: K.clapRate, still: moment.still });
        const sway = (amount) => amount * wave(K.swayRate);
        // Through the finale the whole bleachers clap and sway, the keen
        // ones too, so the dancers among them stand out (Steve, 2026-10-20).
        if (kind === 'dance') return { pose: clap, hop: 0, lean: sway(K.sway) };
        if (kind === 'run' || kind === 'replay' || kind === 'times') {
            if (member.keen) return { pose: beat(K.pumpRate) > 0.3 ? 'up' : 'clap', hop: beat(K.pumpRate * 2) * K.hop, lean: 0 };
            return { pose: clap, hop: 0, lean: sway(K.sway) };
        }
        if (kind === 'staging' || kind === 'gate') {
            return member.keen ? { pose: clap, hop: 0, lean: 0 } : { pose: 'down', hop: 0, lean: sway(K.sway * 0.6) };
        }
        return { pose: 'down', hop: 0, lean: 0 };
    }
    if (member.group === 'volunteer') return { pose: 'down', hop: 0 };
    // The day's winner dancing (dancer.js): the family cheers as for a heat.
    if (kind === 'times' || kind === 'dance') {
        // A shared win (a dead heat) cheers both families.
        const won = Array.isArray(moment.won) ? moment.won.includes(member.group) : moment.won === member.group;
        // A loss: arms down, still (the groan).
        if (!won) return { pose: held || 'down', hop: 0 };
        // A win: the heat's cheer (Steve's QA, 2026-10-20). A sign held up
        // in both hands does its own move with each cheer (the same QA: the
        // kid's sign drew the eye and always did the same thing); anything
        // else held keeps its pose and bounces along.
        const opts = { t: moment.t, phase: member.phase, rank: member.rank || 0, still: moment.still };
        if (held === 'hold') return heldCheerAt(moment.cheer || 'jump', opts);
        const c = cheerAt(moment.cheer || 'jump', opts);
        return held ? { pose: held, hop: c.hop, lean: 0 } : c;
    }
    if ((kind === 'run' || kind === 'replay') && moment.cheering && moment.cheering.has(member.group)) {
        return { pose: held || (beat(5) > 0.3 ? 'up' : 'clap'), hop: 0 };
    }
    if (kind === 'staging' || kind === 'gate') return { pose: held || 'clap', hop: 0 };
    return { pose: held || 'down', hop: 0 };
}

// ---- Drawing ----------------------------------------------------------------

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
 * The crowd, drawn (the shared crowd's view, createCrowdView): `capacity`
 * members at most, each { group (a key), look, at: { x, y, z, ry }, prop,
 * sign, keen, phase, rank }, posed by poseAt, holding the props above.
 * Returns the view: { group, ready, parts, set(members, moment),
 * pose(moment), stepAside(index, { drop }), propOf(index), dispose }. Under
 * the test stub (no geometry to bake) nothing is drawn and every call is
 * safe.
 */
export function createCrowd(C = DERBY_CONFIG, { capacity = 160 } = {}) {
    // The fingered hands too (Steve's QA, 2026-10-26): the families stand
    // by the camera at the finish, where the crowd's box hands read as flat
    // paddles. Their looks say `hands: 'real'` (familyOf, familyMembers);
    // the bleachers keep the box.
    const parts = buildCrowdParts({ scale: 1, poses: POSES, realHands: true });
    const grip = (pose) => {
        const [a, b] = parts.hands[pose];
        return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    };
    return createCrowdView({
        parts,
        poses: POSES,
        capacity,
        hopHeight: C.crowd.hop,
        poseOf: (m, moment) => poseAt(m, moment, C),
        propFor: (m) => {
            if (!m.prop) return null;
            const hold = PROPS[m.prop];
            const made = [];
            const mesh = buildProp(m.prop, m.sign || '', made, grip(hold.pose));
            return { mesh, pose: hold.pose, hand: hold.hand, made };
        }
    });
}
