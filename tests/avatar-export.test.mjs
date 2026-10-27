// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Export my avatar (www/avatar/js/export.js, 2026-10-26): a picture or a
 * clip of the figure on screen, made on the device.
 *
 * What is held here, and why:
 * - THE FRAMINGS ARE MEASURED ON THE REAL THREE: the whole figure inside a
 *   square picture, and the head inside the portrait, on the page's own
 *   stage. A stub would pass with nothing in the frame.
 * - EVERY BORDER IS DRAWN AS DESIGNED: the picture cut to the shape, the
 *   ring the width it says, a double ring two rings, a badge filled and not
 *   stroked, and no border just the picture.
 * - THE DIALOG IS DRIVEN END TO END with fakes: open draws the preview, a
 *   choice redraws it, a picture is made at the chosen size and handed on
 *   (shared where the sheet takes it, saved otherwise), a clip is recorded
 *   frame by frame with the wave and the turn at their times, and closing
 *   lets the stage go. Nothing is stored.
 * - EVERY ID THE DIALOG LOOKS UP IS IN ITS MARKUP, once: the DOM stub
 *   invents any id it is asked for.
 */
import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { loadRealThree } from './helpers/real-three.mjs';
import { installThree, keepPropRecords } from './helpers/three-stub.mjs';
import { installDom, flushAsync, fire } from './helpers/dom-stub.mjs';

const HTML = readFileSync('www/avatar/index.html', 'utf8');

/** A 2D context that records what is drawn. */
function recordingContext() {
    const calls = [];
    const ctx = {
        calls,
        lineWidth: 0,
        strokeStyle: '',
        fillStyle: '',
        lineCap: 'butt',
        createLinearGradient: () => {
            calls.push(['createLinearGradient']);
            return { addColorStop() {} };
        }
    };
    for (const m of ['clearRect', 'save', 'restore', 'beginPath', 'closePath', 'arc', 'clip', 'drawImage', 'stroke', 'fill', 'setLineDash', 'moveTo', 'lineTo', 'arcTo']) {
        ctx[m] = (...args) => { calls.push([m, ...args, { lineWidth: ctx.lineWidth, strokeStyle: ctx.strokeStyle, fillStyle: ctx.fillStyle }]); };
    }
    return ctx;
}

describe('the framings, on the real three', () => {
    let THREE;
    let X;
    let S;
    let F;
    let CONFIG;

    beforeAll(async () => {
        THREE = await loadRealThree();
        globalThis.THREE = THREE;
        jest.resetModules();
        X = await import('../www/avatar/js/export.js');
        S = await import('../www/avatar/js/studio.js');
        F = await import('../www/shared/js/avatar-figure-1.0.0.js');
        ({ AVATAR_PAGE: CONFIG } = await import('../www/avatar/js/config.js'));
    });
    afterAll(() => {
        delete globalThis.THREE;
    });

    const inside = (pose, aspect, box, margin = 0.98) => {
        const cam = new THREE.PerspectiveCamera(pose.fov, aspect, 0.05, 60);
        cam.position.fromArray(pose.eye);
        cam.lookAt(...pose.aim);
        cam.updateMatrixWorld(true);
        for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
            const p = new THREE.Vector3(x, y, z).project(cam);
            if (Math.abs(p.x) >= margin || Math.abs(p.y) >= margin) return false;
        }
        return true;
    };

    test('the stage is the studio\'s, and the whole figure fits a square, a story and the portrait frames the head', async () => {
        const stage = S.buildStage(CONFIG);
        expect(stage.scene.getObjectByName('cove')).toBeTruthy();
        expect(stage.scene.getObjectByName('plinth')).toBeTruthy();
        expect(stage.turntable.name).toBe('turntable');
        expect(stage.standY).toBe(CONFIG.studio.plinth.height);
        expect(Object.keys(stage.set).sort()).toEqual(['contact', 'cove', 'plinth']);
        const figure = F.createAvatar({ hat: 'sunHat', length: 'afro', build: 'broad' });
        figure.group.position.y = stage.standY;
        stage.turntable.add(figure.group);
        figure.setPose({ right: { z: 2.77, x: -0.12, fore: -0.12 }, left: { z: 0.15, x: 0.1, fore: 0 } });
        stage.scene.updateMatrixWorld(true);
        const whole = new THREE.Box3().setFromObject(figure.group);
        for (const aspect of [1, 1080 / 1920]) {
            expect(`figure ${aspect}: ${inside(X.pictureCamera('figure', aspect, CONFIG.camera, stage.standY), aspect, whole)}`).toBe(`figure ${aspect}: true`);
        }
        figure.dispose();
        // The portrait is the chip's framing, lifted onto the plinth, and
        // backed off for whatever is on the head: every hat over the two
        // biggest styles fits the square (the chip, being round, crops a
        // brim: a picture must not), and a bare head keeps the chip's
        // close framing.
        const A = await import('../www/shared/js/avatar-1.0.0.js');
        const fill = (pose, box) => {
            const cam = new THREE.PerspectiveCamera(pose.fov, 1, 0.05, 60);
            cam.position.fromArray(pose.eye);
            cam.lookAt(...pose.aim);
            cam.updateMatrixWorld(true);
            let most = 0;
            for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
                const q = new THREE.Vector3(x, y, z).project(cam);
                most = Math.max(most, Math.abs(q.x), Math.abs(q.y));
            }
            return most;
        };
        const headOf = (look, angle = 0) => {
            const f = F.createAvatar(look);
            f.group.position.y = stage.standY;
            stage.turntable.add(f.group);
            stage.turntable.rotation.y = angle;
            stage.scene.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(f.person.getObjectByName('head'));
            f.dispose();
            return { min: { x: box.min.x, y: box.min.y, z: box.min.z }, max: { x: box.max.x, y: box.max.y, z: box.max.z } };
        };
        for (const hat of A.HATS.map((h) => h.id)) {
            for (const length of ['short', 'afro', 'long']) {
                const head = headOf({ hat, length });
                const most = fill(X.pictureCamera('portrait', 1, CONFIG.camera, stage.standY, head), head);
                expect(`${hat}/${length}: ${most < 0.95}`).toBe(`${hat}/${length}: true`);
            }
        }
        const bare = headOf({});
        const close = X.pictureCamera('portrait', 1, CONFIG.camera, stage.standY, bare);
        expect(close.fov).toBe(F.PORTRAIT.fov);
        expect(close.aim[1]).toBeCloseTo(F.PORTRAIT.aimY + stage.standY, 9);
        expect(close.eye[2]).toBe(F.PORTRAIT.distance);
        expect(fill(close, bare)).toBeGreaterThan(0.6);
        // A sun hat stands the camera back; without a head to measure, the
        // chip's framing.
        expect(X.pictureCamera('portrait', 1, CONFIG.camera, stage.standY, headOf({ hat: 'sunHat' })).eye[2]).toBeGreaterThan(F.PORTRAIT.distance * 1.3);
        expect(X.pictureCamera('portrait', 1, CONFIG.camera, stage.standY).eye[2]).toBe(F.PORTRAIT.distance);
        // Turned for a side profile (2026-10-26), the head is measured
        // turned, so a brim or a long style still fits.
        for (const angle of [Math.PI / 2, Math.PI / 4, Math.PI]) {
            for (const look of [{ hat: 'sunHat' }, { hat: 'cowboy', length: 'long' }, { length: 'afro', hat: 'topHat' }]) {
                const head = headOf(look, angle);
                const most = fill(X.pictureCamera('portrait', 1, CONFIG.camera, stage.standY, head), head);
                expect(`${JSON.stringify(look)} at ${angle.toFixed(2)}: ${most < 0.95}`).toBe(`${JSON.stringify(look)} at ${angle.toFixed(2)}: true`);
            }
        }
        stage.turntable.rotation.y = 0;
    });

    test('a dressed avatar, jointed, keeps every piece and dances every dance within reach (2026-10-26)', async () => {
        const D = await import('../www/shared/js/dance-1.0.0.js');
        const look = { hat: 'sunHat', length: 'long', glasses: 'round', facial: 'beard', sleeves: 'jersey', jerseyNumber: 'n8', legwear: 'kneeSocks', shoes: 'platforms', bottom: 'shorts', armwear: 'longGloves' };
        const figure = F.createAvatar(look);
        const meshesBefore = [];
        figure.group.traverse((o) => { if (o.isMesh) meshesBefore.push(o); });
        const rig = D.jointPerson(figure.person);
        figure.group.add(rig.root);
        // Nothing lost, the head group (and its hat) under the neck.
        const meshesAfter = new Set();
        figure.group.traverse((o) => { if (o.isMesh) meshesAfter.add(o); });
        for (const m of meshesBefore) expect(meshesAfter.has(m)).toBe(true);
        const head = figure.person.getObjectByName('head');
        expect(head.parent).toBe(rig.neck);
        expect(figure.person.getObjectByName('hat').parent).toBe(head);
        expect(rig.arms.L && rig.arms.R && rig.legs.L && rig.legs.R).toBeTruthy();
        // Every moment of every dance: the figure finite, on the plinth, and
        // within arm's reach of where it stands.
        for (const dance of D.DANCES) {
            const loop = D.loopOf(dance);
            for (let k = 0; k < 12; k++) {
                D.applyPose(rig, D.danceAt(dance, (loop * k) / 12));
                figure.group.updateMatrixWorld(true);
                const box = new THREE.Box3().setFromObject(figure.group);
                const ok = Number.isFinite(box.min.x) && Number.isFinite(box.max.y) && box.max.y < 2.4 && box.min.y > -0.1
                    && Math.abs(box.min.x) < 1.2 && Math.abs(box.max.x) < 1.2 && Math.abs(box.min.z) < 1.2 && Math.abs(box.max.z) < 1.2;
                expect(`${dance.id} ${k}: ${ok}`).toBe(`${dance.id} ${k}: true`);
            }
        }
        figure.dispose();
    });
});

describe('the pure parts', () => {
    let X;
    let A;
    let CONFIG;

    beforeAll(async () => {
        installThree();
        jest.resetModules();
        X = await import('../www/avatar/js/export.js');
        A = await import('../www/shared/js/avatar-1.0.0.js');
        ({ AVATAR_PAGE: CONFIG } = await import('../www/avatar/js/config.js'));
    });
    afterAll(() => {
        delete globalThis.THREE;
    });

    test('the choices: borders with a shape each, no border first, and the colors with the shirt\'s first', () => {
        expect(X.BORDERS[0]).toMatchObject({ id: 'none', shape: 'square', width: 0 });
        expect(new Set(X.BORDERS.map((b) => b.id)).size).toBe(X.BORDERS.length);
        for (const b of X.BORDERS) expect(['circle', 'square']).toContain(b.shape);
        expect(X.BORDERS.length).toBeGreaterThanOrEqual(7);
        expect(X.BORDER_COLORS[0]).toMatchObject({ id: 'match', color: null });
        expect(X.FRAMINGS.map((f) => f.id)).toEqual(['portrait', 'figure']);
        expect(X.BACKGROUNDS.map((b) => b.id)).toEqual(['studio', 'clear']);
        expect(CONFIG.export.pictures.map((p) => p.px)).toEqual([512, 1024, 2048]);
        expect(CONFIG.export.clip.sizes.map((s) => `${s.w}x${s.h}`)).toEqual(['720x720', '1080x1080', '1080x1920']);
    });

    test('the border\'s color: the shirt\'s for match, a listed one, or any custom color', () => {
        expect(X.borderColor({ shirt: 'rust' }, 'match')).toBe(A.colorOf('shirt', 'rust'));
        expect(X.borderColor({ shirt: 'teal' }, 'match')).toBe(A.colorOf('shirt', 'teal'));
        expect(X.borderColor({}, 'white')).toBe(0xffffff);
        expect(X.borderColor({}, 'x123abc')).toBe(0x123abc);
        expect(X.borderColor({ shirt: 'teal' }, 'nope')).toBe(A.colorOf('shirt', 'teal'));
        expect(X.hexCss(0x2a3a56)).toBe('#2a3a56');
        expect(X.hexCss(0x1a)).toBe('#00001a');
        expect(X.mixHex(0x000000, 0xffffff, 0.5)).toBe(0x808080);
        expect(X.mixHex(0x102030, 0x102030, 0.3)).toBe(0x102030);
    });

    test('file names say what they are', () => {
        expect(X.pictureName(1024)).toBe('scenexp-avatar-1024.png');
        expect(X.clipName({ w: 1080, h: 1920 }, 'mp4')).toBe('scenexp-avatar-wave-1080x1920.mp4');
        expect(X.clipName({ w: 720, h: 720 }, 'webm', 'floss')).toBe('scenexp-avatar-floss-720x720.webm');
    });

    test('the clip: still, a wave, then once round, ending as it began', () => {
        const C = CONFIG.export.clip;
        expect(X.clipAngle(0, C)).toBe(0);
        expect(X.clipAngle(C.turnFrom, C)).toBe(0);
        expect(X.clipAngle(C.turnFrom + C.turnSeconds, C)).toBeCloseTo(Math.PI * 2, 9);
        expect(X.clipAngle(C.seconds, C)).toBeCloseTo(Math.PI * 2, 9);
        let last = 0;
        for (let t = 0; t <= C.seconds; t += 0.05) {
            const a = X.clipAngle(t, C);
            expect(a).toBeGreaterThanOrEqual(last);
            last = a;
        }
        expect(X.clipMoment(0, C)).toEqual({ angle: 0, waving: false, done: false, pose: null });
        expect(X.clipMoment(C.waveAt, C).waving).toBe(true);
        expect(X.clipMoment(C.seconds - 0.01, C).done).toBe(false);
        expect(X.clipMoment(C.seconds, C).done).toBe(true);
        // The wave is over before the clip ends, and the turn ends with it.
        expect(C.waveAt + 2.2).toBeLessThan(C.seconds);
        expect(C.turnFrom + C.turnSeconds).toBeLessThanOrEqual(C.seconds);
        // No motion: the turn alone, never a wave.
        const still = X.clipPlan('none', C);
        expect(still).toMatchObject({ motion: 'none', seconds: C.seconds, dance: null });
        expect(X.clipMoment(C.waveAt + 1, C, still).waving).toBe(false);
        expect(X.clipMoment(C.seconds / 2, C, still).angle).toBeGreaterThan(0);
        expect(X.clipPlan('nope', C).motion).toBe('none');
    });

    test('the motions: none, the wave, then every shared dance by name', async () => {
        const D = await import('../www/shared/js/dance-1.0.0.js');
        expect(X.MOTIONS.slice(0, 2).map((m) => m.id)).toEqual(['none', 'wave']);
        expect(X.MOTIONS.slice(2).map((m) => m.id)).toEqual(D.DANCES.map((d) => d.id));
        for (const m of X.MOTIONS.slice(2)) expect(m.label).toMatch(/^The /);
        expect(X.MOTIONS.find((m) => m.id === 'floss').label).toBe('The Floss');
    });

    test('a dance plays whole loops between rest and rest, facing the front, within the longest clip', async () => {
        const D = await import('../www/shared/js/dance-1.0.0.js');
        const C = CONFIG.export.clip;
        for (const dance of D.DANCES) {
            const plan = X.clipPlan(dance.id, C);
            const loop = D.loopOf(dance);
            expect(plan.dance.id).toBe(dance.id);
            expect(plan.loops).toBeGreaterThanOrEqual(1);
            expect(plan.seconds).toBeCloseTo(2 * C.ease + plan.loops * loop, 9);
            expect(plan.seconds).toBeLessThanOrEqual(C.longest + 1e-9);
            // The nearest whole number of loops to the plain clip's length,
            // unless that is too long.
            const wanted = Math.max(1, Math.round((C.seconds - 2 * C.ease) / loop));
            expect(plan.loops === wanted || 2 * C.ease + wanted * loop > C.longest).toBe(true);
            // Rest at the start and the end, the dance between, no turn.
            const at = (t) => X.clipMoment(t, C, plan);
            expect(at(0).pose).toEqual(D.REST);
            expect(at(0).angle).toBe(0);
            expect(at(plan.seconds / 2).angle).toBe(0);
            expect(at(plan.seconds / 2).waving).toBe(false);
            expect(at(plan.seconds / 2).pose).toEqual(D.danceAt(dance, plan.seconds / 2 - C.ease));
            expect(at(plan.seconds).done).toBe(true);
            expect(at(plan.seconds).pose).toEqual(D.REST);
        }
        // The Floss's loop is under a second: several loops, not one.
        expect(X.clipPlan('floss', C).loops).toBeGreaterThan(3);
    });

    test('every border is drawn as designed', () => {
        const size = 400;
        const image = { width: size, height: size };
        const draw = (id, color = 0x2a3a56) => {
            const ctx = recordingContext();
            X.composePicture(ctx, image, size, { border: X.BORDERS.find((b) => b.id === id), color });
            return ctx.calls;
        };
        const names = (calls) => calls.map((c) => c[0]);
        // No border: cleared, then the picture, nothing else.
        expect(names(draw('none'))).toEqual(['clearRect', 'drawImage']);
        // A ring: the picture clipped under the ring's inner half, then one
        // stroke of the ring's width in the color.
        const ring = X.BORDERS.find((b) => b.id === 'ring');
        const r = draw('ring');
        const w = ring.width * size;
        const clipArc = r.find((c) => c[0] === 'arc');
        expect(clipArc[3]).toBeCloseTo(size / 2 - w / 2, 9);
        expect(names(r).indexOf('clip')).toBeLessThan(names(r).indexOf('drawImage'));
        const strokes = r.filter((c) => c[0] === 'stroke');
        expect(strokes).toHaveLength(1);
        expect(strokes[0][strokes[0].length - 1]).toMatchObject({ lineWidth: w, strokeStyle: '#2a3a56' });
        // A double ring strokes twice; a dotted one dashes; a gradient one
        // paints with a gradient; a badge fills its scallops and strokes nothing.
        expect(draw('double').filter((c) => c[0] === 'stroke')).toHaveLength(2);
        expect(draw('dotted').some((c) => c[0] === 'setLineDash' && c[1].length === 2 && c[1][1] > 0)).toBe(true);
        expect(names(draw('gradient'))).toContain('createLinearGradient');
        const badge = draw('badge');
        expect(badge.filter((c) => c[0] === 'fill')).toHaveLength(1);
        expect(badge.filter((c) => c[0] === 'stroke')).toHaveLength(0);
        expect(names(badge).indexOf('fill')).toBeLessThan(names(badge).indexOf('drawImage'));
        // A rounded square: the picture clipped to the rounded rectangle, then
        // a frame of twice the width (half of it outside the picture).
        const sq = draw('square');
        expect(names(sq)).toContain('arcTo');
        const frame = sq.find((c) => c[0] === 'stroke');
        expect(frame[frame.length - 1].lineWidth).toBeCloseTo(X.BORDERS.find((b) => b.id === 'square').width * size * 2, 9);
        // An unknown border is no border.
        expect(names(draw('nope'))).toEqual(['clearRect', 'drawImage']);
    });

    test('a canvas becomes a Blob through toBlob, or from its data URL, or not at all', async () => {
        const blob = new Blob(['png'], { type: 'image/png' });
        expect(await X.canvasBlob({ toBlob: (cb) => cb(blob) }, 'image/png', null)).toBe(blob);
        expect(await X.canvasBlob({ toBlob: (cb) => cb(null) }, 'image/png', null)).toBeNull();
        const win = { atob: (s) => Buffer.from(s, 'base64').toString('binary'), Blob };
        const made = await X.canvasBlob({ toDataURL: () => `data:image/png;base64,${Buffer.from('hello').toString('base64')}` }, 'image/png', win);
        expect(made.type).toBe('image/png');
        expect(made.size).toBe(5);
        expect(await X.canvasBlob({ toDataURL: () => 'data:,' }, 'image/png', win)).toBeNull();
        expect(await X.canvasBlob({ toDataURL: () => { throw new Error('no'); } }, 'image/png', win)).toBeNull();
    });

    test('every id the dialog looks up is in the markup once, and every word keeps the house style', () => {
        const ids = X.dialogIds(CONFIG);
        const all = Object.values(ids).flat();
        expect(all.length).toBeGreaterThan(30);
        for (const id of all) {
            const count = HTML.split(`id="${id}"`).length - 1;
            expect(`${id}: ${count}`).toBe(`${id}: 1`);
        }
        // The dialog is a real dialog, the tabs a real tab list, and the
        // export button sits beside Surprise me.
        expect(HTML).toMatch(/<dialog id="av-export" class="av-export" aria-labelledby="av-export-title">/);
        expect(HTML).toMatch(/id="av-random"[^>]*>Surprise me<\/button>\s*<button id="av-export-open"/);
        for (const word of Object.values(X.WORDS)) {
            const w = typeof word === 'function' ? word(5) : word;
            expect(w).not.toMatch(/[;—]/);
            expect(w).not.toMatch(/\b(colour|grey|centre|favourite)/i);
        }
        expect(X.WORDS.clipMaking(4.5)).toBe('Making your clip. It takes about 5 seconds.');
        expect(X.WORDS.clipMaking(7.6)).toBe('Making your clip. It takes about 8 seconds.');
    });
});

describe('the dialog, end to end with fakes', () => {
    let X;
    let CONFIG;
    let dom;
    let renderers;
    let canvases;
    let made;

    /** A renderer that draws nothing and counts. */
    function fakeRenderer(canvas) {
        const r = {
            domElement: canvas,
            renders: 0,
            sizes: [],
            clears: [],
            shadowMap: {},
            setPixelRatio() {},
            setSize(w, h) { r.sizes.push([w, h]); canvas.width = w; canvas.height = h; },
            setClearColor(c, a) { r.clears.push(a); },
            render() { r.renders++; },
            dispose() { r.disposed = true; },
            forceContextLoss() { r.lost = true; }
        };
        renderers.push(r);
        return r;
    }

    beforeEach(async () => {
        installThree();
        // The stage's set is hidden for a clear picture: a mesh's `visible`
        // must be real under the stub.
        keepPropRecords();
        dom = installDom();
        renderers = [];
        canvases = [];
        made = [];
        // Canvases that can give a Blob and a stream, as a browser's can.
        const create = document.createElement;
        document.createElement = (tag) => {
            const el = create(tag);
            if (tag === 'canvas') {
                el.toBlob = (cb, type) => cb(new Blob(['picture'], { type: type || 'image/png' }));
                el.captureStream = () => ({ stream: true });
                canvases.push(el);
            }
            if (tag === 'a') made.push(el);
            return el;
        };
        window.URL = { createObjectURL: () => 'blob:avatar', revokeObjectURL: () => {} };
        // The address is let go ten seconds on: no real timer to hold Jest.
        window.setTimeout = () => 0;
        jest.resetModules();
        X = await import('../www/avatar/js/export.js');
        ({ AVATAR_PAGE: CONFIG } = await import('../www/avatar/js/config.js'));
    });
    afterEach(() => {
        dom.uninstall();
    });

    const exporter = (opts = {}) => X.createExporter(CONFIG, { doc: document, win: window, nav: navigator, makeRenderer: fakeRenderer, now: () => clock.t, ...opts });
    const clock = { t: 100 };
    const check = (id) => {
        const input = dom.el(id);
        input.checked = true;
        fire(input, 'change');
        return input;
    };

    test('opening draws the preview on a stage of its own, a choice redraws it, and closing lets the stage go', async () => {
        const ex = exporter();
        expect(ex.state.open).toBe(false);
        expect(renderers).toHaveLength(0);
        // The radios' default choices.
        dom.el('av-export-framing-portrait').checked = true;
        dom.el('av-export-background-studio').checked = true;
        dom.el('av-export-border-none').checked = true;
        dom.el('av-export-color-match').checked = true;
        dom.el('av-export-size-p1024').checked = true;
        dom.el('av-export-clip-size-c1080').checked = true;
        // The stub does not parse markup: the shirt's swatch is given its
        // label and its swatch span by hand, as the markup has them.
        const label = document.createElement('label');
        label.appendChild(dom.el('av-export-color-match'));
        label.appendChild(document.createElement('span'));
        ex.open({ shirt: 'teal' });
        expect(ex.state.open).toBe(true);
        expect(dom.el('av-export').getAttribute('open')).toBe('');
        expect(renderers).toHaveLength(1);
        expect(renderers[0].renders).toBe(1);
        expect(renderers[0].sizes[0]).toEqual([CONFIG.export.preview, CONFIG.export.preview]);
        expect(dom.el('av-export-preview').width).toBe(CONFIG.export.preview);
        // The studio behind it, opaque.
        expect(renderers[0].clears[0]).toBe(1);
        // The shirt's swatch is the shirt's color, and the border color
        // group waits for a border.
        const A = await import('../www/shared/js/avatar-1.0.0.js');
        expect(dom.el('av-export-color-match').parentNode.children[1].style.getPropertyValue('--swatch')).toBe(X.hexCss(A.colorOf('shirt', 'teal')));
        expect(dom.el('av-export-color-group').hidden).toBe(true);
        expect(dom.el('av-export-picture').hidden).toBe(false);
        expect(dom.el('av-export-clip').hidden).toBe(true);
        expect(dom.el('av-export-picture-save').textContent).toBe('Save picture');
        // A border: redrawn, the colors shown; a clear background: drawn
        // over nothing with the stage's set hidden.
        dom.el('av-export-border-none').checked = false;
        check('av-export-border-ring');
        expect(ex.state.border).toBe('ring');
        expect(dom.el('av-export-color-group').hidden).toBe(false);
        expect(renderers[0].renders).toBe(2);
        dom.el('av-export-background-studio').checked = false;
        check('av-export-background-clear');
        expect(renderers[0].clears[renderers[0].clears.length - 1]).toBe(0);
        expect(ex.stage.set.cove.visible).toBe(false);
        // The custom color takes over from the swatches, once a frame.
        const custom = dom.el('av-export-color-custom');
        custom.value = '#11aa33';
        const frames = dom.loops.length;
        fire(custom, 'input');
        fire(custom, 'input');
        expect(dom.loops.length).toBe(frames + 1);
        dom.loops[frames]();
        expect(ex.state.color).toBe('x11aa33');
        expect(dom.el('av-export-color-match').checked).toBe(false);
        // The turn buttons turn the picture's plinth in the page's steps,
        // round and back, redrawing each time; opening again faces front.
        const step = CONFIG.turntable.step;
        const drawn = renderers[0].renders;
        dom.el('av-export-turn-right').click();
        expect(ex.state.angle).toBeCloseTo(step, 9);
        expect(renderers[0].renders).toBe(drawn + 1);
        dom.el('av-export-turn-left').click();
        dom.el('av-export-turn-left').click();
        expect(ex.state.angle).toBeCloseTo(Math.PI * 2 - step, 9);
        for (let i = 0; i < 7; i++) dom.el('av-export-turn-left').click();
        expect(ex.state.angle).toBe(0);
        dom.el('av-export-turn-right').click();
        expect(ex.state.angle).toBeCloseTo(step, 9);
        // The tabs: the clip's panel, and back by the arrow keys.
        ex.select('clip');
        expect(dom.el('av-export-picture').hidden).toBe(true);
        expect(dom.el('av-export-tab-clip').getAttribute('aria-selected')).toBe('true');
        fire(dom.el('av-export-tabs'), 'keydown', { key: 'ArrowRight' });
        expect(ex.state.tab).toBe('picture');
        // Closing: the stage gone, the dialog shut, nothing stored.
        expect(ex.close()).toBe(true);
        expect(renderers[0].disposed).toBe(true);
        expect(renderers[0].lost).toBe(true);
        expect(ex.stage).toBeNull();
        expect(dom.el('av-export').getAttribute('open')).toBeNull();
        expect(ex.close()).toBe(false);
        expect(globalThis.localStorage.getItem('scenexp-avatar')).toBeNull();
        // Opened again: a fresh stage, facing the front.
        ex.open({});
        expect(renderers).toHaveLength(2);
        expect(ex.state.angle).toBe(0);
    });

    test('a picture is made at the chosen size and saved, or shared where the sheet takes it', async () => {
        const ex = exporter();
        dom.el('av-export-size-p2048').checked = true;
        dom.el('av-export-border-badge').checked = true;
        ex.open({ shirt: 'rust' });
        const picture = await ex.makePicture();
        expect(picture.name).toBe('scenexp-avatar-2048.png');
        expect(picture.blob.type).toBe('image/png');
        const r = renderers[0];
        expect(r.sizes[r.sizes.length - 1]).toEqual([2048, 2048]);
        // Saved through a download link, and said so.
        expect(await ex.savePicture()).toBe('saved');
        const link = made[made.length - 1];
        expect(link.download).toBe('scenexp-avatar-2048.png');
        expect(link.href).toBe('blob:avatar');
        expect(dom.el('av-export-status').textContent).toBe(X.WORDS.pictureSaved);
        // Where the share sheet takes a PNG, it is shared instead.
        const shares = [];
        globalThis.navigator.canShare = () => true;
        globalThis.navigator.share = async (data) => { shares.push(data); };
        window.File = class { constructor(parts, name, opts) { this.name = name; this.type = opts.type; } };
        ex.close();
        ex.open({ shirt: 'rust' });
        expect(dom.el('av-export-picture-save').textContent).toBe('Share picture');
        expect(await ex.savePicture()).toBe('shared');
        expect(shares[0].files[0].name).toBe('scenexp-avatar-2048.png');
        expect(dom.el('av-export-status').textContent).toBe(X.WORDS.pictureShared);
        // Backing out of the sheet is the visitor's decision, not a failure.
        globalThis.navigator.share = async () => { const e = new Error('no'); e.name = 'AbortError'; throw e; };
        expect(await ex.savePicture()).toBe('cancelled');
        // A canvas that cannot give a Blob is said politely.
        delete globalThis.navigator.canShare;
        for (const c of canvases) c.toBlob = (cb) => cb(null);
        const create = document.createElement;
        document.createElement = (tag) => { const el = create(tag); if (tag === 'canvas') el.toBlob = (cb) => cb(null); return el; };
        expect(await ex.savePicture()).toBe('failed');
        expect(dom.el('av-export-status').textContent).toBe(X.WORDS.pictureFailed);
    });

    test('a clip is recorded frame by frame, waving and turning once round, then handed on', async () => {
        class FakeRecorder {
            constructor(stream, options) { this.options = options; this.mimeType = options.mimeType; this.stopped = false; FakeRecorder.last = this; }
            start() {}
            stop() {
                if (this.stopped) return;
                this.stopped = true;
                this.ondataavailable({ data: new Blob(['clip'], { type: 'video/mp4' }) });
                this.onstop();
            }
        }
        FakeRecorder.isTypeSupported = (t) => t === 'video/mp4';
        window.MediaRecorder = FakeRecorder;
        window.HTMLCanvasElement = function () {};
        window.HTMLCanvasElement.prototype.captureStream = () => ({});
        window.Blob = Blob;
        const ex = exporter();
        dom.el('av-export-clip-size-story').checked = true;
        ex.open({});
        expect(ex.clipMime()).toBe('video/mp4');
        clock.t = 100;
        dom.el('av-export-motion-wave').checked = true;
        const pending = ex.makeClip();
        expect(dom.el('av-export-status').textContent).toBe(X.WORDS.clipMaking(CONFIG.export.clip.seconds));
        expect(ex.state.recording.rig).toBeNull();
        // Busy, never disabled (the accessibility sweep, 2026-10-26): a
        // disabled button drops the focus that pressed it. A press while
        // the clip is made is nothing.
        const makeBtn = dom.el('av-export-clip-make');
        expect(makeBtn.disabled).toBeFalsy();
        expect(makeBtn.getAttribute('aria-disabled')).toBe('true');
        const first = FakeRecorder.last;
        fire(makeBtn, 'click');
        expect(FakeRecorder.last).toBe(first);
        expect(ex.state.recording).toBeTruthy();
        expect(FakeRecorder.last.options).toEqual({ mimeType: 'video/mp4', videoBitsPerSecond: CONFIG.export.clip.bitrate });
        // Seen: the recording is watched unless motion is reduced.
        expect(dom.el('av-export-stage').children[0].classList.contains('is-unseen')).toBe(false);
        // The stage holds the recording canvas, at the story's size.
        const out = dom.el('av-export-stage').children[0];
        expect([out.width, out.height]).toEqual([1080, 1920]);
        const r = renderers[0];
        const before = r.renders;
        // Frames, driven by the clock: before the wave, nothing waves; after
        // it, the figure is waving; the plinth turns; at the end it stops.
        const C = CONFIG.export.clip;
        const frame = () => { const cb = dom.loops[dom.loops.length - 1]; cb(); };
        frame();
        expect(r.renders).toBe(before + 1);
        expect(ex.stage.figure.gesturing).toBeNull();
        clock.t = 100 + C.waveAt + 0.01;
        frame();
        expect(ex.stage.figure.gesturing).toBe('wave');
        // The plinth's angle each frame (the stub's rotation absorbs a set,
        // so the recording keeps the angle it drew).
        expect(ex.state.recording.angle).toBe(0);
        clock.t = 100 + C.turnFrom + C.turnSeconds / 2;
        frame();
        expect(ex.state.recording.angle).toBeCloseTo(Math.PI, 6);
        expect(FakeRecorder.last.stopped).toBe(false);
        clock.t = 100 + C.seconds;
        const loops = dom.loops.length;
        frame();
        expect(FakeRecorder.last.stopped).toBe(true);
        expect(dom.loops.length).toBe(loops);
        const clip = await pending;
        expect(clip.name).toBe('scenexp-avatar-wave-1080x1920.mp4');
        expect(ex.state.clip).toBe(clip);
        expect(dom.el('av-export-clip-save').hidden).toBe(false);
        expect(dom.el('av-export-clip-save').textContent).toBe('Save video');
        expect(dom.el('av-export-clip-make').getAttribute('aria-disabled')).toBeNull();
        expect(dom.el('av-export-status').textContent).toBe(X.WORDS.clipReady);
        expect(await ex.saveClip()).toBe('saved');
        expect(made[made.length - 1].download).toBe('scenexp-avatar-wave-1080x1920.mp4');
        expect(dom.el('av-export-status').textContent).toBe(X.WORDS.clipSaved);
        // A dance (2026-10-26): the figure jointed, posed each frame from
        // rest into the dance, no wave and no turn, as long as its loops.
        const D = await import('../www/shared/js/dance-1.0.0.js');
        dom.el('av-export-motion-wave').checked = false;
        dom.el('av-export-motion-floss').checked = true;
        dom.el('av-export-clip-size-story').checked = false;
        dom.el('av-export-clip-size-c720').checked = true;
        clock.t = 200;
        const dancing = ex.makeClip();
        const plan = X.clipPlan('floss', C);
        expect(dom.el('av-export-status').textContent).toBe(X.WORDS.clipMaking(plan.seconds));
        expect(ex.state.recording.rig).toBeTruthy();
        // The stub absorbs a name: the rig holds the figure's own person.
        expect(ex.state.recording.rig.person).toBe(ex.stage.figure.person);
        frame();
        expect(ex.state.recording.pose).toEqual(D.REST);
        clock.t = 200 + plan.seconds / 2;
        frame();
        expect(ex.state.recording.angle).toBe(0);
        expect(ex.state.recording.pose).toEqual(D.danceAt(plan.dance, plan.seconds / 2 - C.ease));
        expect(ex.stage.figure.gesturing).toBeNull();
        clock.t = 200 + plan.seconds;
        frame();
        const danced = await dancing;
        expect(danced.name).toBe('scenexp-avatar-floss-720x720.mp4');
        // Closing mid-clip cancels it quietly, and the button is free again.
        const again = ex.makeClip();
        expect(dom.el('av-export-clip-make').getAttribute('aria-disabled')).toBe('true');
        ex.close();
        expect(await again).toBeNull();
        expect(dom.el('av-export-clip-make').getAttribute('aria-disabled')).toBeNull();
        // Under reduced motion the clip is recorded unseen (Derby Day's way,
        // the accessibility sweep 2026-10-26): the canvas is laid out in
        // the stage and drawn, with the unseen class on it.
        const still = exporter({ reducedMotion: () => true });
        still.open({});
        const quiet = still.makeClip();
        const unseen = dom.el('av-export-stage').children[0];
        expect(unseen.classList.contains('is-unseen')).toBe(true);
        frame();
        expect(still.state.recording.angle).toBe(0);
        still.close();
        expect(await quiet).toBeNull();
    });

    test('a browser that cannot record is told so, and a recorder that fails too', async () => {
        const ex = exporter();
        ex.open({});
        expect(ex.clipMime()).toBe('');
        expect(await ex.makeClip()).toBeNull();
        expect(dom.el('av-export-status').textContent).toBe(X.WORDS.noClip);
        class Failing {
            constructor(s, o) { this.mimeType = o.mimeType; Failing.last = this; }
            start() { setTimeout(() => this.onerror({ error: new Error('boom') }), 0); }
            stop() {}
        }
        Failing.isTypeSupported = () => true;
        window.MediaRecorder = Failing;
        window.HTMLCanvasElement = function () {};
        window.HTMLCanvasElement.prototype.captureStream = () => ({});
        window.Blob = Blob;
        expect(await ex.makeClip()).toBeNull();
        expect(dom.el('av-export-status').textContent).toBe(X.WORDS.clipFailed);
        expect(dom.el('av-export-clip-make').getAttribute('aria-disabled')).toBeNull();
    });
});

describe('the page', () => {
    let dom;

    afterEach(() => {
        if (dom) dom.uninstall();
        dom = null;
    });

    test('Export my avatar opens the dialog on the figure on screen, and Done closes it', async () => {
        installThree();
        dom = installDom();
        jest.resetModules();
        const main = await import('../www/avatar/js/main.js');
        await flushAsync(30);
        const { state } = main.__test__;
        expect(state.exporter).toBeNull();
        dom.el('av-export-open').click();
        expect(state.exporter).toBeTruthy();
        expect(state.exporter.state.open).toBe(true);
        expect(state.exporter.state.avatar).toEqual(state.current);
        expect(dom.el('av-export').getAttribute('open')).toBe('');
        dom.el('av-export-close').click();
        expect(state.exporter.state.open).toBe(false);
        // Nothing about the avatar moved.
        expect(dom.el('av-unsaved').textContent).toBe('');
        expect(globalThis.localStorage.getItem('scenexp-avatar')).toBeNull();
    });
});
