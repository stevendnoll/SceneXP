// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * workbench.js - the workbench in 3D (M3, graybox): a table in a small warm
 * room of its own, beyond the hall's start wall, with the car on a turntable
 * in the middle, a pegboard behind it, the rule sheet pinned there (cream
 * for Standard, red for Outlaw, M3.5), a shelf for the trophies won, a
 * little digital scale reading the car's weight, and a few paint pots.
 * Dressed with the workshop (M4): the vise, the coping saw, the sandpaper.
 *
 * A MINIATURE, SO WARM AND COLORFUL (Steve, 2026-10-13: a model inside a
 * room should be), light maple and a tan pegboard, never dark walnut.
 *
 * THE CAMERA FRAMES THE CAR IN THE CLEAR PART OF THE SCREEN. The bench's
 * panel covers the bottom of a phone and the left of a computer, so
 * `benchFraming` says how far back the camera stands to hold the turntable
 * in what is left, and how far to slide the picture (setViewOffset) so the
 * car sits in the middle of it.
 */

import { DERBY_CONFIG } from './config.min.js';

/**
 * Where the camera goes for the bench on a `width` by `height` screen with
 * the panel covering `panel` ({ side: 'left' | 'bottom' | 'none', size } in
 * CSS pixels). Returns { distance, offsetX, offsetY }: the offsets are what
 * camera.setViewOffset takes to move the car into the clear part. Pure.
 */
export function benchFraming({ width, height, panel = { side: 'none', size: 0 } }, C = DERBY_CONFIG) {
    const B = C.workbench;
    const left = panel.side === 'left' ? Math.min(panel.size, width * 0.8) : 0;
    const bottom = panel.side === 'bottom' ? Math.min(panel.size, height * 0.8) : 0;
    const freeW = width - left;
    const freeH = height - bottom;
    const tan = Math.tan((C.camera.fov * Math.PI) / 360);
    const aspect = width / height;
    const half = tan * Math.min(freeH / height, aspect * (freeW / width));
    return {
        distance: Math.max(B.minDistance, B.holdRadius / (B.fill * half)),
        offsetX: width / 2 - (left + freeW / 2),
        offsetY: height / 2 - freeH / 2
    };
}

/** A canvas texture with something drawn on it, and a way to redraw. */
function canvasTexture(w, h, draw) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const redraw = (...args) => {
        draw(g, w, h, ...args);
        tex.needsUpdate = true;
    };
    return { tex, redraw };
}

/** The pegboard's holes, on tan. */
function drawPegboard(g, w, h) {
    g.fillStyle = '#d9b88a';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#8a6a44';
    for (let y = 8; y < h; y += 16) {
        for (let x = 8; x < w; x += 16) {
            g.beginPath();
            g.arc(x, y, 2.2, 0, Math.PI * 2);
            g.fill();
        }
    }
}

/** The rule sheet: `sheet` is copy.sheetLines' { title, lines }. */
function drawSheet(g, w, h, sheet, outlaw) {
    g.fillStyle = outlaw ? '#c8322b' : '#fbf4e4';
    g.fillRect(0, 0, w, h);
    g.fillStyle = outlaw ? '#fff3e6' : '#2b2420';
    g.textAlign = 'center';
    g.textBaseline = 'top';
    g.font = 'bold 44px system-ui, sans-serif';
    g.fillText(sheet.title, w / 2, 34);
    g.textAlign = 'left';
    g.font = '27px system-ui, sans-serif';
    sheet.lines.forEach((line, i) => g.fillText(line, 30, 120 + i * 52, w - 60));
}

/** The scale's readout, green on black. */
function drawScale(g, w, h, text) {
    g.fillStyle = '#121a14';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#7dff9a';
    g.font = 'bold 60px ui-monospace, Menlo, Consolas, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
}

/** A trophy cup, turned on a lathe. */
function trophy(material) {
    const pts = [[0.018, 0], [0.018, 0.008], [0.005, 0.012], [0.004, 0.035], [0.006, 0.04], [0.02, 0.05], [0.024, 0.075], [0.022, 0.077]]
        .map(([r, y]) => new THREE.Vector2(r, y));
    return new THREE.Mesh(new THREE.LatheGeometry(pts, 20), material);
}

/**
 * Build the workbench. Returns { group, spinner (where the car goes; it
 * turns), target (what the camera looks at), carY (the turntable's top),
 * setSheet(sheet, outlaw), setScale(text), setTrophies(trophies) }.
 */
export function buildWorkbench(C = DERBY_CONFIG) {
    const B = C.workbench;
    const L = B.look;
    const group = new THREE.Group();
    group.name = 'workbench';
    group.position.set(B.at.x, 0, B.at.z);
    const mat = (color, roughness = 0.7, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });

    // The room: walls all round, and a warm wood floor.
    const room = new THREE.Mesh(new THREE.BoxGeometry(4, 2.8, 4), new THREE.MeshStandardMaterial({ color: L.room, roughness: 0.95, side: THREE.BackSide }));
    room.position.y = 1.4;
    group.add(room);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(3.98, 3.98), mat(L.floor, 0.8));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.002;
    group.add(floor);

    // The table.
    const top = B.top;
    const table = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 0.75), mat(L.table, 0.6));
    table.position.y = top - 0.025;
    group.add(table);
    const legMat = mat(0xc99a5e, 0.7);
    for (const [x, z] of [[-0.64, -0.32], [0.64, -0.32], [-0.64, 0.32], [0.64, 0.32]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, top - 0.05, 0.05), legMat);
        leg.position.set(x, (top - 0.05) / 2, z);
        group.add(leg);
    }

    // The pegboard behind it.
    const peg = canvasTexture(512, 256, drawPegboard);
    peg.redraw();
    const pegboard = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), new THREE.MeshStandardMaterial({ map: peg.tex, roughness: 0.85 }));
    pegboard.position.set(0, top + 0.35, -0.36);
    group.add(pegboard);

    // The rule sheet, pinned on the left.
    const sheet = canvasTexture(384, 512, drawSheet);
    const sheetMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.24), new THREE.MeshStandardMaterial({ map: sheet.tex, roughness: 0.9 }));
    sheetMesh.position.set(-0.42, top + 0.4, -0.355);
    sheetMesh.rotation.z = 0.03;
    group.add(sheetMesh);

    // The trophy shelf, on the right.
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.018, 0.09), mat(L.table, 0.6));
    shelf.position.set(0.4, top + 0.42, -0.31);
    group.add(shelf);
    const cups = new THREE.Group();
    cups.position.set(0.4, top + 0.429, -0.31);
    group.add(cups);
    const metals = {
        easy: mat(0xc98a4b, 0.35, 0.45),
        medium: mat(0xc9ccd2, 0.3, 0.5),
        hard: mat(0xe2b33c, 0.3, 0.5),
        outlaw: mat(0xc8322b, 0.35, 0.3)
    };

    // The turntable the car stands on.
    const spinBase = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.15, 0.012, 40), mat(L.turntable, 0.5, 0.2));
    spinBase.position.y = top + 0.006;
    group.add(spinBase);
    const spinner = new THREE.Group();
    spinner.position.y = top + 0.012;
    group.add(spinner);
    const mark = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.002, 40), mat(0x51617a, 0.6));
    mark.position.y = 0.001;
    spinner.add(mark);

    // The scale, reading the car's weight, at the front right.
    const scaleBody = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.024, 0.12), mat(L.scale, 0.4));
    scaleBody.position.set(0.42, top + 0.012, 0.1);
    group.add(scaleBody);
    const readout = canvasTexture(256, 96, drawScale);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.03), new THREE.MeshBasicMaterial({ map: readout.tex }));
    screen.rotation.x = -Math.PI / 2 + 0.35;
    screen.position.set(0.42, top + 0.026, 0.135);
    group.add(screen);

    // Paint pots, lids in the palette's colors, at the front left.
    C.paint.colors.slice(0, 4).forEach((c, i) => {
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.045, 20), mat(0xdedad2, 0.5, 0.3));
        pot.position.set(-0.52 + i * 0.065, top + 0.0225, 0.12 + (i % 2) * 0.05);
        group.add(pot);
        const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.027, 0.006, 20), mat(c.color, 0.4));
        lid.position.set(pot.position.x, top + 0.048, pot.position.z);
        group.add(lid);
    });

    // A warm lamp over the bench, reaching only this room.
    const lamp = new THREE.PointLight(L.light, 2.4, 3.5, 2);
    lamp.position.set(0.15, top + 0.95, 0.35);
    group.add(lamp);

    return {
        group,
        spinner,
        carY: top + 0.012,
        target: { x: B.at.x, y: top + 0.045, z: B.at.z },
        setSheet(lines, outlaw) {
            sheet.redraw(lines, outlaw);
        },
        setScale(text) {
            readout.redraw(text);
        },
        /** One cup a division won, in order along the shelf. */
        setTrophies(won) {
            for (const c of cups.children.slice()) {
                cups.remove(c);
                c.geometry.dispose();
            }
            const list = ['easy', 'medium', 'hard', 'outlaw'].filter((e) => won[e]);
            list.forEach((e, i) => {
                const cup = trophy(metals[e]);
                cup.position.x = (i - (list.length - 1) / 2) * 0.1;
                cups.add(cup);
            });
        }
    };
}
