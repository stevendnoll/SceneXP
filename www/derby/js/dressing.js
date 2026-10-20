// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * dressing.js - the community hall dressed for a Saturday morning derby
 * (M6.1, PRD The venue): strings of pennants across the hall, morning light
 * through the high windows, the basketball hoops at either end (it is a
 * community gym, white nets on the rims), folding chairs in front of the bleachers, the trophy table
 * by the finish, the snack table by the start, a WELCOME RACERS banner, and
 * the electronic timer over the finish line on its gantry.
 *
 * A HANDFUL OF DRAW CALLS. Everything repeated is one InstancedMesh (the
 * pennants, the windows, the chairs), tinted per instance where it varies,
 * and everything drawn on is a small canvas, so nothing is downloaded.
 *
 * THE TIMER IS THE BOARD THE RACE IS READ FROM in the hall: `timer.set` is
 * handed what the page's timer shows (board.js), and redraws only when that
 * changes. The page's own timer stays, for a phone's small screen.
 */

import { DERBY_CONFIG } from './config.min.js';
import { mergePieces } from '../../shared/js/crowd-1.0.0.min.js';
import { HALL } from './hall.min.js';
import { clock, placeWord } from './copy.min.js';

const PENNANTS = [0xd63c3c, 0xf2c230, 0x3a7be8, 0x39b54a, 0xee7a2a, 0xf2f2ee];

/**
 * Where the pennants hang: along each string across the hall, sagging in
 * the middle. Returns [{ x, y, z }], every pennant's top. Pure.
 */
export function pennantSpots(C = DERBY_CONFIG) {
    const out = [];
    for (const x of [-1, 3, 7, 11, 15]) {
        const z0 = HALL.z0 + 0.2;
        const z1 = HALL.z1 - 0.2;
        for (let z = z0; z <= z1 + 1e-9; z += 0.45) {
            const u = (z - z0) / (z1 - z0);
            out.push({ x, y: 4.8 - 0.6 * (1 - (2 * u - 1) * (2 * u - 1)), z });
        }
    }
    return out;
}

/** The timer board's words, row by row: the heat, then each lane's car
 *  time and place once it is across. Pure, for the canvas and the tests. */
export function timerRows(state) {
    const head = state && state.heat ? `HEAT ${state.heat} OF ${state.total}` : 'DERBY DAY';
    const lanes = (state && state.lanes) || [];
    const rows = [0, 1, 2, 3].map((k) => {
        const r = lanes[k];
        if (!r) return `${k + 1}`;
        return r.time === null || r.time === undefined ? `${k + 1}  -.---` : `${k + 1}  ${clock(r.time)}  ${placeWord(r.place)}`;
    });
    return [head, ...rows];
}

/**
 * THE DONUTS (Steve's QA, 2026-10-20: "more detail to the donuts"): a dozen
 * in an open bakery box, three rows of four, each its own. `kind` says what
 * is on it: an icing (strawberry, chocolate, vanilla or maple, some with
 * sprinkles), or none (a powdered donut, a cinnamon sugar one). The size is a
 * real donut's, about 10 cm across. Pure and seeded, the same box every
 * visit.
 */
export const DONUT = Object.freeze({ ring: 0.031, tube: 0.016, flat: 0.85, spacing: 0.098, rows: 3, cols: 4 });
export const DONUT_KINDS = Object.freeze({
    strawberry: Object.freeze({ dough: 0xd29a5b, icing: 0xf2a0c4, sprinkles: true }),
    chocolate: Object.freeze({ dough: 0xd29a5b, icing: 0x5a3320, sprinkles: true }),
    vanilla: Object.freeze({ dough: 0xd29a5b, icing: 0xf6ecdc, sprinkles: true }),
    glazedChocolate: Object.freeze({ dough: 0xd29a5b, icing: 0x4a2a1a, sprinkles: false }),
    maple: Object.freeze({ dough: 0xd29a5b, icing: 0xc47b34, sprinkles: false }),
    powdered: Object.freeze({ dough: 0xf4f0ea, icing: null, sprinkles: false }),
    cinnamon: Object.freeze({ dough: 0xb98448, icing: null, sprinkles: false })
});
export const SPRINKLES = Object.freeze([0xe8413c, 0xf5d33b, 0x3b7be8, 0x46b35a, 0xffffff, 0xf08a24, 0xb05ce0]);

export function donutBox(seed = 11) {
    let s = seed;
    const rand = () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
    const order = ['strawberry', 'chocolate', 'vanilla', 'powdered', 'maple', 'strawberry', 'glazedChocolate', 'cinnamon', 'chocolate', 'vanilla', 'strawberry', 'maple'];
    const D = DONUT;
    const donuts = [];
    for (let r = 0; r < D.rows; r++) {
        for (let c = 0; c < D.cols; c++) {
            const kind = order[r * D.cols + c];
            const x = (r - (D.rows - 1) / 2) * D.spacing + (rand() - 0.5) * 0.003;
            const z = (c - (D.cols - 1) / 2) * D.spacing + (rand() - 0.5) * 0.003;
            const sprinkles = [];
            if (DONUT_KINDS[kind].sprinkles) {
                // On the icing's top: round the ring, across the top of the tube.
                for (let k = 0; k < 22; k++) {
                    const around = rand() * Math.PI * 2;
                    const across = (rand() - 0.5) * 2.0;
                    sprinkles.push({ around, across, turn: rand() * Math.PI, color: SPRINKLES[Math.floor(rand() * SPRINKLES.length)] });
                }
            }
            donuts.push({ kind, x, z, ry: rand() * Math.PI * 2, sprinkles });
        }
    }
    return donuts;
}

/** The icing: the dough's ring with a slightly fatter, flattened tube,
 *  lifted so only its top shows, like a donut dipped face down. */
const ICING = Object.freeze({ grow: 1.07, flat: 0.62, lift: 0.4 });

/** Where a sprinkle sits on a donut, in the donut's own space (y up, the
 *  ring flat): on the icing's surface `across` radians from its top. */
export function sprinkleAt(sp, D = DONUT) {
    const t = D.tube * ICING.grow;
    const rr = D.ring + t * Math.sin(sp.across);
    return {
        x: rr * Math.cos(sp.around),
        y: ICING.lift * D.tube + t * ICING.flat * Math.cos(sp.across) + 0.0012,
        z: rr * Math.sin(sp.around)
    };
}

function canvasTex(w, h, draw) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext('2d');
    draw(g, w, h);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return { tex, g, canvas };
}

/** A box, as a piece for mergePieces. */
function boxPiece(w, h, d, x, y, z) {
    const geometry = new THREE.BoxGeometry(w, h, d);
    geometry.translate(x, y, z);
    return { geometry, colour: null };
}

/**
 * The open box of donuts (donutBox), its middle at the table's top: a pink
 * box with wax paper, the lid standing open behind it (on the -x side, away
 * from the start camera), and the dozen in three instanced pieces (dough,
 * icing, sprinkles), each tinted per instance.
 */
function buildDonuts(mat) {
    const g = new THREE.Group();
    g.name = 'donuts';
    g.position.set(0.25, 0.74, 0);
    const D = DONUT;
    const W = { x: D.rows * D.spacing + 0.03, z: D.cols * D.spacing + 0.02, h: 0.05, t: 0.004 };
    const pink = mat(0xe8609c, 0.75);
    const box = mergePieces([
        boxPiece(W.x, W.t, W.z, 0, W.t / 2, 0),
        boxPiece(W.t, W.h, W.z, -W.x / 2, W.h / 2, 0), boxPiece(W.t, W.h, W.z, W.x / 2, W.h / 2, 0),
        boxPiece(W.x, W.h, W.t, 0, W.h / 2, -W.z / 2), boxPiece(W.x, W.h, W.t, 0, W.h / 2, W.z / 2)
    ]);
    g.add(new THREE.Mesh(box, pink));
    const paper = new THREE.Mesh(new THREE.BoxGeometry(W.x - 0.012, 0.001, W.z - 0.012), mat(0xf7f3ea, 0.6));
    paper.position.y = W.t + 0.0005;
    g.add(paper);
    // The lid, hinged at the back edge and standing open, leaning back.
    const lid = new THREE.Group();
    lid.position.set(-W.x / 2, W.h, 0);
    lid.rotation.z = Math.PI / 2 + 0.18;
    const lidTop = new THREE.Mesh(new THREE.BoxGeometry(W.x, W.t, W.z), pink);
    lidTop.position.x = W.x / 2;
    lid.add(lidTop);
    g.add(lid);

    const list = donutBox();
    const ring = new THREE.TorusGeometry(D.ring, D.tube, 10, 26);
    ring.rotateX(Math.PI / 2);
    ring.scale(1, D.flat, 1);
    const icing = new THREE.TorusGeometry(D.ring, D.tube * ICING.grow, 10, 26);
    icing.rotateX(Math.PI / 2);
    icing.scale(1, ICING.flat, 1);
    icing.translate(0, ICING.lift * D.tube, 0);
    const sprinkle = new THREE.CylinderGeometry(0.0017, 0.0017, 0.008, 5);
    sprinkle.rotateZ(Math.PI / 2);
    const iced = list.filter((d) => DONUT_KINDS[d.kind].icing !== null);
    const count = list.reduce((n, d) => n + d.sprinkles.length, 0);
    const dough = new THREE.InstancedMesh(ring, mat(0xffffff, 0.85), list.length);
    const tops = new THREE.InstancedMesh(icing, mat(0xffffff, 0.35), iced.length);
    const bits = new THREE.InstancedMesh(sprinkle, mat(0xffffff, 0.5), count);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const one = new THREE.Vector3(1, 1, 1);
    const color = new THREE.Color();
    // Resting on the paper: the dough's underside on it.
    const rest = W.t + 0.001 + D.tube * D.flat;
    let i = 0;
    let k = 0;
    list.forEach((d, n) => {
        const at = new THREE.Vector3(d.x, rest, d.z);
        q.setFromAxisAngle(up, d.ry);
        m4.compose(at, q, one);
        dough.setMatrixAt(n, m4);
        dough.setColorAt(n, color.setHex(DONUT_KINDS[d.kind].dough));
        if (DONUT_KINDS[d.kind].icing !== null) {
            tops.setMatrixAt(i, m4);
            tops.setColorAt(i, color.setHex(DONUT_KINDS[d.kind].icing));
            i++;
        }
        for (const sp of d.sprinkles) {
            const p = sprinkleAt(sp);
            const local = new THREE.Vector3(p.x, p.y, p.z).applyAxisAngle(up, d.ry).add(at);
            m4.compose(local, new THREE.Quaternion().setFromAxisAngle(up, sp.turn + d.ry), one);
            bits.setMatrixAt(k, m4);
            bits.setColorAt(k, color.setHex(sp.color));
            k++;
        }
    });
    g.add(dough, tops, bits);
    return g;
}

/**
 * Dress the hall. Returns { group, timer: { set(state) } }, `state` being
 * { heat, total, lanes: [{ time, place } | null] } or null between races.
 */
export function buildDressing(C = DERBY_CONFIG) {
    const group = new THREE.Group();
    group.name = 'dressing';
    const mat = (color, roughness = 0.6, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

    // Pennants: one instanced triangle, a color each.
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.13, 0, 0, 0.13, 0, -0.3, 0], 3));
    tri.computeVertexNormals();
    const spots = pennantSpots(C);
    const pennants = new THREE.InstancedMesh(tri, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide }), spots.length);
    const m4 = new THREE.Matrix4();
    spots.forEach((p, i) => {
        pennants.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z));
        pennants.setColorAt(i, new THREE.Color(PENNANTS[i % PENNANTS.length]));
    });
    group.add(pennants);
    const line = [];
    for (let i = 1; i < spots.length; i++) {
        const a = spots[i - 1];
        const b = spots[i];
        if (a.x === b.x) line.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    const strings = new THREE.BufferGeometry();
    strings.setAttribute('position', new THREE.Float32BufferAttribute(line, 3));
    group.add(new THREE.LineSegments(strings, new THREE.LineBasicMaterial({ color: 0x3a3330 })));

    // Morning light through the high windows on the far wall.
    const windowCount = 7;
    const windows = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.7, 1.1), new THREE.MeshBasicMaterial({ color: 0xeaf3ff }), windowCount);
    for (let i = 0; i < windowCount; i++) windows.setMatrixAt(i, m4.makeTranslation(-2 + i * 3.2, 4.4, HALL.z0 + 0.02));
    group.add(windows);

    // The hoops at either end, a gym's.
    const board = canvasTex(256, 150, (g, w, h) => {
        g.fillStyle = '#f6f6f2';
        g.fillRect(0, 0, w, h);
        g.strokeStyle = '#e8641e';
        g.lineWidth = 8;
        g.strokeRect(6, 6, w - 12, h - 12);
        g.strokeRect(w * 0.35, h * 0.45, w * 0.3, h * 0.42);
    });
    const boardMat = new THREE.MeshStandardMaterial({ map: board.tex, roughness: 0.5 });
    const rimMat = mat(0xe8641e, 0.4, 0.5);
    // The net: white cord in diamonds, hanging from the rim and narrowing.
    const cord = canvasTex(128, 64, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        g.strokeStyle = '#ffffff';
        g.lineWidth = 5;
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(w, h);
        g.moveTo(w, 0);
        g.lineTo(0, h);
        g.moveTo(-w, 0);
        g.lineTo(w, 2 * h);
        g.stroke();
    });
    cord.tex.wrapS = THREE.RepeatWrapping;
    cord.tex.wrapT = THREE.RepeatWrapping;
    cord.tex.repeat.set(8, 3);
    const netMat = new THREE.MeshBasicMaterial({ map: cord.tex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide });
    const netGeo = new THREE.CylinderGeometry(0.23, 0.15, 0.42, 16, 1, true);
    for (const [x, ry] of [[HALL.x0, Math.PI / 2], [HALL.x1, -Math.PI / 2]]) {
        const hoop = new THREE.Group();
        hoop.position.set(x, 0, 0);
        hoop.rotation.y = ry;
        const back = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.05, 0.05), boardMat);
        back.position.set(0, 3.45, 0.35);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.012, 6, 24), rimMat);
        rim.rotation.x = Math.PI / 2;
        rim.position.set(0, 3.05, 0.65);
        const net = new THREE.Mesh(netGeo, netMat);
        net.position.set(0, 3.05 - 0.21, 0.65);
        hoop.add(back, rim, net);
        group.add(hoop);
    }

    // Folding chairs in front of the bleachers, facing the track.
    const chair = mergePieces([
        boxPiece(0.42, 0.03, 0.4, 0, 0.45, 0),
        boxPiece(0.42, 0.3, 0.03, 0, 0.68, -0.2),
        boxPiece(0.025, 0.45, 0.025, -0.19, 0.225, 0.18), boxPiece(0.025, 0.45, 0.025, 0.19, 0.225, 0.18),
        boxPiece(0.025, 0.82, 0.025, -0.19, 0.41, -0.2), boxPiece(0.025, 0.82, 0.025, 0.19, 0.41, -0.2)
    ]);
    const chairXs = [];
    for (let x = 0.8; x <= 10.4; x += 0.75) chairXs.push(x);
    const chairs = new THREE.InstancedMesh(chair, mat(0x55657a, 0.5, 0.4), chairXs.length);
    chairXs.forEach((x, i) => chairs.setMatrixAt(i, m4.makeTranslation(x, 0, -1.45)));
    group.add(chairs);

    // A table: a top on a skirt of cloth, `cloth` a color or a texture.
    const table = (x, z, w, d, cloth) => {
        const t = new THREE.Group();
        t.position.set(x, 0, z);
        const clothMat = typeof cloth === 'number' ? mat(cloth, 0.9) : new THREE.MeshStandardMaterial({ map: cloth, roughness: 0.9 });
        const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.74, d), clothMat);
        top.position.y = 0.37;
        t.add(top);
        group.add(t);
        return t;
    };

    // The trophy table by the finish: this year's three, largest first.
    const trophies = table(12.9, -1.25, 1.6, 0.65, 0x1f4e8c);
    [[0xe2b33c, 0.48, 0], [0xc9ccd2, 0.4, -0.45], [0xc98a4b, 0.34, 0.45]].forEach(([color, hgt, dx]) => {
        const pts = [[0.09, 0], [0.09, 0.05], [0.025, 0.07], [0.02, hgt * 0.45], [0.1, hgt * 0.55], [0.12, hgt]].map(([r, y]) => new THREE.Vector2(r, y));
        const cup = new THREE.Mesh(new THREE.LatheGeometry(pts, 20), mat(color, 0.3, 0.6));
        cup.position.set(dx, 0.74, 0);
        trophies.add(cup);
    });

    // The snack table by the start: a checked cloth, juice, a box of donuts.
    const checked = canvasTex(128, 128, (g) => {
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
            g.fillStyle = (r + c) % 2 ? '#d63c3c' : '#fbf4e4';
            g.fillRect(c * 16, r * 16, 16, 16);
        }
    });
    checked.tex.wrapS = THREE.RepeatWrapping;
    checked.tex.wrapT = THREE.RepeatWrapping;
    checked.tex.repeat.set(3, 2);
    const snacks = table(-2.4, -1.6, 1.5, 0.7, checked.tex);
    const jug = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.26, 16), mat(0xee7a2a, 0.2, 0, { transparent: true, opacity: 0.85 }));
    jug.position.set(-0.45, 0.87, 0);
    snacks.add(jug, buildDonuts(mat));

    // WELCOME RACERS! on the start wall.
    const welcome = canvasTex(1024, 200, (g, w, h) => {
        g.fillStyle = '#c8322b';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#fff4d6';
        g.font = '900 120px system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('WELCOME RACERS!', w / 2, h / 2 + 6);
    });
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(5, 1), new THREE.MeshBasicMaterial({ map: welcome.tex }));
    banner.position.set(HALL.x0 + 0.03, 4.3, 0);
    banner.rotation.y = Math.PI / 2;
    group.add(banner);

    // The timer over the finish line, on its gantry, facing the crowd.
    const fx = C.track.courseLength - 0.12;
    const post = mat(0x3a3d42, 0.5, 0.5);
    for (const z of [-0.42, 0.42]) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.3, 0.04), post);
        p.position.set(fx, 0.65, z);
        group.add(p);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.9), post);
    beam.position.set(fx, 1.3, 0);
    group.add(beam);
    const led = canvasTex(512, 256, () => {});
    const display = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.38, 0.78), [post, post, post, post,
        new THREE.MeshBasicMaterial({ map: led.tex }), post]);
    display.position.set(fx, 1.52, 0);
    display.rotation.y = -Math.PI / 2;
    group.add(display);
    let shown = timerRows(null).join('|');
    const draw = (rows) => {
        const g = led.g;
        g.fillStyle = '#0c0c0e';
        g.fillRect(0, 0, 512, 256);
        g.textBaseline = 'middle';
        g.font = 'bold 34px ui-monospace, Menlo, Consolas, monospace';
        g.fillStyle = '#ffcf6e';
        g.textAlign = 'center';
        g.fillText(rows[0], 256, 30);
        g.textAlign = 'left';
        g.fillStyle = '#ff5a4f';
        rows.slice(1).forEach((r, k) => g.fillText(r, 40, 80 + k * 46));
        led.tex.needsUpdate = true;
    };
    draw(timerRows(null));

    return {
        group,
        timer: {
            /** What the timer shows: redrawn only when it changes. */
            set(state) {
                const rows = timerRows(state);
                const key = rows.join('|');
                if (key === shown) return false;
                shown = key;
                draw(rows);
                return true;
            }
        }
    };
}
