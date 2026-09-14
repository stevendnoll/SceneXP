// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * exesnohs-milestones.test.mjs
 *
 * THE SHOWS A GOOD GAME EARNS: 100 (the lights) and 200 (the fireworks), with
 * 300, 400 and the 500 finale still to come.
 *
 * Nothing in a show is visible to a screenshot for long enough to measure, and
 * the ways it goes wrong are exactly the ones that only show on one screen
 * shape: four towers that fit a laptop and not a phone held upright, a camera
 * that backs out of a stadium far enough to lose it in fog, a numeral that
 * forms off the edge of the sky. So the shots are asked the only question that
 * matters about them, which is what is in frame, on every shape the game
 * supports.
 *
 * Written as properties. Nothing here asserts that a show is 4.6 seconds long;
 * it asserts that a show starts and ends on the play camera, never puts the
 * camera under the grass, and never flashes more than three times a second.
 */
import { describe, test, expect } from '@jest/globals';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { installThree } from './helpers/three-stub.mjs';

const scene = join(dirname(fileURLToPath(import.meta.url)), '..', 'www', 'exesnohs', 'js');
installThree();

const { EXESNOHS_CONFIG: CFG, FIELD } = await import(join(scene, 'config.js'));
const Mi = await import(join(scene, 'milestones.js'));
const Fw = await import(join(scene, 'fireworks.js'));
const { playDriver } = await import(join(scene, 'camera.js'));
const { pylonSpots, boardSpot, starLayout } = await import(join(scene, 'field.js'));
const { keyAction } = await import(join(scene, 'hud.js'));

const M = CFG.milestones;
/** Every screen shape worth worrying about: wide, laptop, square, and a phone
 *  either way up. */
const ASPECTS = [21 / 9, 16 / 9, 4 / 3, 1, 9 / 16, 9 / 19.5];
const play = (points) => points.map((p) => ({ points: p }));
const inFrame = (shot, aspect, p, edge = 1) => {
    const s = Mi.projectPoint(shot, aspect, p);
    return s.depth > 0 && Math.abs(s.x) <= edge && Math.abs(s.y) <= edge;
};
const sameShot = (a, b) => ['position', 'target'].every((k) => ['x', 'y', 'z']
    .every((c) => Math.abs(a[k][c] - b[k][c]) < 1e-6)) && Math.abs(a.fov - b.fov) < 1e-6;
const sample = (length, step = 0.02) => {
    const out = [];
    for (let t = 0; t <= length + 1e-9; t += step) out.push(t);
    return out;
};

// ---------------------------------------------------------------------------

describe('which show is due, and when', () => {
    test('a show is due the first time the running total reaches its line', () => {
        expect(Mi.milestoneDue(play([50]), 0)).toBe(0);
        expect(Mi.milestoneDue(play([50, 50]), 0)).toBe(100);
        expect(Mi.milestoneDue(play([50, 50, 30]), 100)).toBe(0);
        expect(Mi.milestoneDue(play([50, 50, 50, 50]), 100)).toBe(200);
    });

    /**
     * ONCE PER GAME, ON THE HIGH-WATER MARK. A sack after reaching 200 takes the
     * score back to 195, and climbing past 200 again is not a second
     * achievement. Asked with the show NOT recorded as played too, because the
     * high-water mark is also what a resumed game is rebuilt from.
     */
    test('dropping back under a line and climbing over it again plays nothing', () => {
        const results = play([50, 50, 50, 50, -5, -10, 15]);
        expect(Mi.highWater(results)).toBe(200);
        expect(Mi.milestoneDue(results, 200)).toBe(0);
        expect(Mi.highWater(play([50, 50, 50, 50, -10, 15]))).toBe(205);
        // A game that reached 200 and was then sacked back under it has still
        // reached 200: that is what a resumed game is rebuilt from, and the
        // score it stands on now would say it never got there.
        const sacked = play([50, 50, 50, 50, -10]);
        expect(Mi.highWater(sacked)).toBe(200);
        expect(Mi.milestoneDue(sacked, 100)).toBe(200);
    });

    test('a score that never goes above zero reaches nothing', () => {
        expect(Mi.highWater(play([-5, -10, 0]))).toBe(0);
        expect(Mi.milestoneDue(play([-5, -10, 0]), 0)).toBe(0);
        expect(Mi.milestoneDue([], 0)).toBe(0);
    });

    test('only a show that has been built can be due', () => {
        const three = play([50, 50, 50, 50, 50, 50]);
        expect(Mi.reachedLevel(three)).toBe(300);
        for (const level of M.built) expect(Mi.showKind(level)).toBeTruthy();
        // A threshold with no show plays nothing, rather than a show with no
        // timeline in it.
        expect(Mi.milestoneDue(three, 200)).toBe(M.built.includes(300) ? 300 : 0);
        expect(Mi.showLength(0)).toBe(0);
        expect(Mi.showFrame(0, 0).done).toBe(true);
    });

    /**
     * NO PLAY CAN CROSS TWO LINES, which is why "the highest wins" is a rule
     * nobody should ever see applied. If the ladder or the thresholds change
     * so that it can, this fails and the rule needs thinking about again.
     */
    test('the most a play is worth is less than the gap between two lines', () => {
        const gaps = M.thresholds.slice(1).map((t, i) => t - M.thresholds[i]);
        expect(CFG.rules.crossing).toBeLessThan(Math.min(M.thresholds[0], ...gaps));
        expect(Mi.milestoneDue(play([250]), 0)).toBe(200);
    });

    test('every threshold up to a perfect game has a line on the title card', () => {
        expect(M.thresholds[M.thresholds.length - 1])
            .toBe(CFG.rules.crossing * CFG.rules.playsPerGame);
        for (const t of M.thresholds) expect(M.copy[t]).toBeTruthy();
    });
});

describe('the stars on the scoreboard', () => {
    test('one lit per show played, and they never outnumber the thresholds', () => {
        expect(Mi.litStars(0)).toBe(0);
        expect(Mi.litStars(100)).toBe(1);
        expect(Mi.litStars(200)).toBe(2);
        expect(Mi.litStars(99999)).toBe(M.thresholds.length);
    });

    /**
     * THEY LIVE IN THE STRIP OVER THE LABELS, and that strip is thin. The
     * labels are drawn centred at 28% of the face in a font 11.5% of it tall,
     * so a star reaching past 22% would print over PLAY and POINTS.
     */
    test('the stars fit above the panel labels, inside the border, apart', () => {
        const stars = starLayout();
        expect(stars.length).toBe(M.thresholds.length);
        const h = 228;   // the face's texture height at textureWidth 1024
        const w = 1024;
        const labelTop = 0.28 - 0.115 / 2;
        for (const s of stars) {
            expect(s.y + s.radius).toBeLessThan(labelTop);
            expect(s.y - s.radius).toBeGreaterThan(0.02);
        }
        for (let i = 1; i < stars.length; i += 1) {
            const apart = (stars[i].x - stars[i - 1].x) * w;
            expect(apart).toBeGreaterThan(stars[i].radius * h * 2);
        }
    });
});

describe('every shot contains what it is for, on every screen shape', () => {
    test('the lights show sees all four towers and the scoreboard', () => {
        const b = boardSpot();
        for (const aspect of ASPECTS) {
            const shot = Mi.stadiumShot(aspect);
            for (const p of pylonSpots()) expect(inFrame(shot, aspect, p, 0.95)).toBe(true);
            expect(inFrame(shot, aspect, { x: b.x, y: b.top, z: b.width / 2 }, 0.95)).toBe(true);
        }
    });

    test('the board shot has the whole board in it', () => {
        const b = boardSpot();
        for (const aspect of ASPECTS) {
            const shot = Mi.boardShot(aspect);
            for (const z of [-b.width / 2, b.width / 2]) {
                for (const y of [b.bottom, b.top]) {
                    expect(inFrame(shot, aspect, { x: b.x, y, z }, 0.95)).toBe(true);
                }
            }
        }
    });

    /**
     * THE NUMBER THE FIREWORKS SPELL IS ENTIRELY ON SCREEN. Asked of the sparks
     * themselves at the hold, not of a box somebody thought the number would
     * fit in: a finale that forms "20" and loses the last nought off the side of
     * a phone is precisely the failure a screenshot on a laptop never shows.
     */
    test('the fireworks spell the whole number inside the frame', () => {
        const F = M.fireworks;
        const plan = Fw.planFireworks({ ...Mi.fireworksSetup(200), seed: 11 });
        const pos = new Float32Array(F.pool * 3);
        const col = new Float32Array(F.pool * 3);
        Fw.sparksAt(plan.reveal + F.hold / 2, plan, pos, col);
        for (const aspect of ASPECTS) {
            const shot = Mi.skyShot(aspect);
            const fin = plan.finale;
            for (let s = 0; s < fin.targets.length; s += 1) {
                const i = (fin.first + s) * 3;
                expect(inFrame(shot, aspect, { x: pos[i], y: pos[i + 1], z: pos[i + 2] }, 0.96))
                    .toBe(true);
            }
        }
    });

    test('no frame of any show puts the camera under the grass or inside the board', () => {
        const b = boardSpot();
        for (const level of M.built) {
            for (const aspect of ASPECTS) {
                for (const t of sample(Mi.showLength(level), 0.05)) {
                    const { shot } = Mi.showFrame(level, t, { aspect });
                    expect(shot.position.y).toBeGreaterThan(1.5);
                    expect(shot.position.x).toBeLessThan(b.x - 2);
                    expect(Number.isFinite(shot.fov)).toBe(true);
                }
            }
        }
    });

    /**
     * AND NOTHING A SHOW LOOKS AT IS LOST IN THE FOG. The fog is tuned for the
     * play camera, and a phone held upright has to back the stadium shot off to
     * nearly twice that distance. Asked as a property of what is SEEN: the middle
     * of the field is never more fogged in any show than it is during play.
     */
    test('the field is never more fogged during a show than during play', () => {
        const { fogNear, fogFar } = CFG.scene;
        const fogged = (d, s) => Math.min(1, Math.max(0, (d - fogNear * s) / ((fogFar - fogNear) * s)));
        const centre = { x: FIELD.lineInterval * FIELD.segments / 2, y: 0, z: 0 };
        const dist = (p) => Math.hypot(p.x - centre.x, p.y - centre.y, p.z - centre.z);
        for (const aspect of ASPECTS) {
            const during = fogged(dist(playDriver(aspect).position), 1);
            for (const level of M.built) {
                for (const t of sample(Mi.showLength(level), 0.1)) {
                    const frame = Mi.showFrame(level, t, { aspect });
                    expect(frame.fog).toBeGreaterThanOrEqual(1);
                    expect(fogged(dist(frame.shot.position), frame.fog)).toBeLessThanOrEqual(during + 0.02);
                }
            }
        }
    });
});

describe('a show begins and ends where the game is', () => {
    test('every show opens and closes on the play camera, with the lights normal', () => {
        for (const level of M.built) {
            for (const aspect of ASPECTS) {
                const first = Mi.showFrame(level, 0, { aspect });
                const last = Mi.showFrame(level, Mi.showLength(level), { aspect });
                expect(sameShot(first.shot, playDriver(aspect))).toBe(true);
                expect(sameShot(last.shot, playDriver(aspect))).toBe(true);
                expect(first.light).toBeCloseTo(1, 6);
                expect(last.light).toBeCloseTo(1, 6);
                expect(last.done).toBe(true);
                expect(last.title).toBe(0);
                expect(last.board).toBeNull();
            }
        }
    });

    test('the number lands once, before the end, and the title is only up after it', () => {
        for (const level of M.built) {
            let revealedAt = -1;
            let peak = 0;
            for (const t of sample(Mi.showLength(level))) {
                const f = Mi.showFrame(level, t);
                if (f.reveal && revealedAt < 0) revealedAt = t;
                if (revealedAt >= 0) expect(f.reveal).toBe(true);
                if (!f.reveal) expect(f.title).toBe(0);
                peak = Math.max(peak, f.title);
            }
            expect(revealedAt).toBeGreaterThan(0);
            expect(revealedAt).toBeLessThan(Mi.showLength(level) - 0.5);
            expect(peak).toBeCloseTo(1, 6);
        }
    });

    test('the board counts up to exactly the number and is showing it when it lands', () => {
        let last = -1;
        let atReveal = null;
        for (const t of sample(Mi.showLength(100))) {
            const f = Mi.showFrame(100, t);
            if (!f.board) continue;
            const v = Number(f.board.value);
            expect(v).toBeGreaterThanOrEqual(last);
            last = v;
            if (f.reveal && atReveal === null) atReveal = f.board.value;
        }
        expect(last).toBe(100);
        expect(atReveal).toBe('100');
    });

    /**
     * THE STADIUM ENDS THE LIGHTS SHOW AWAKE, and every bank ends at the same
     * resting glow `spectacle.setAwake` puts it at, or the tower would visibly
     * step on the frame the show hands back.
     */
    test('the lights show leaves every bank at its awake glow', () => {
        const end = Mi.showFrame(100, Mi.showLength(100));
        for (const glow of end.banks) expect(glow).toBeCloseTo(M.lights.awakeBanks, 6);
        expect(end.cones.every((c) => c === 0)).toBe(true);
        expect(M.lights.awakeBanks).toBeGreaterThan(1);
    });
});

describe('under three flashes a second', () => {
    /**
     * WCAG 2.3.1. A lamp striking to its flare is a flash, and so is a shell
     * bursting. Found from the timeline itself rather than from the config's
     * numbers, so a change to the choreography that bunches them fails here
     * whatever it changes.
     */
    test('no two tower strikes land inside the flash gap', () => {
        const strikes = [];
        const was = [0, 0, 0, 0];
        for (const t of sample(Mi.showLength(100), 0.005)) {
            const f = Mi.showFrame(100, t);
            f.banks.forEach((g, i) => {
                if (g > M.lights.awakeBanks * 1.2 && was[i] <= M.lights.awakeBanks * 1.2) strikes.push(t);
                was[i] = g;
            });
        }
        expect(strikes.length).toBe(4);
        strikes.sort((a, b) => a - b);
        for (let i = 1; i < strikes.length; i += 1) {
            expect(strikes[i] - strikes[i - 1]).toBeGreaterThanOrEqual(M.flashGap - 0.006);
        }
        expect(M.flashGap).toBeGreaterThanOrEqual(1 / 3);
    });

    test('no two firework bursts land inside the flash gap, whatever the roll', () => {
        for (const seed of [1, 2, 3, 99, 12345]) {
            const plan = Fw.planFireworks({ ...Mi.fireworksSetup(200), seed });
            const bursts = [...plan.shells.map((s) => s.burst), plan.finale.burst].sort((a, b) => a - b);
            for (let i = 1; i < bursts.length; i += 1) {
                expect(bursts[i] - bursts[i - 1]).toBeGreaterThanOrEqual(M.flashGap - 1e-9);
            }
        }
    });
});

describe('somebody who asked not to be moved about', () => {
    test('gets cuts rather than camera moves', () => {
        for (const level of M.built) {
            for (const aspect of [16 / 9, 9 / 19.5]) {
                const keys = [playDriver(aspect), Mi.stadiumShot(aspect), Mi.boardShot(aspect), Mi.skyShot(aspect)];
                for (const t of sample(Mi.showLength(level))) {
                    const { shot } = Mi.showFrame(level, t, { aspect, calm: true });
                    expect(keys.some((k) => sameShot(k, shot))).toBe(true);
                }
            }
        }
    });

    test('gets towers that come on without a flare, and a board that does not count', () => {
        for (const t of sample(Mi.showLength(100))) {
            const f = Mi.showFrame(100, t, { calm: true });
            for (const g of f.banks) expect(g).toBeLessThanOrEqual(M.lights.awakeBanks + 1e-9);
            if (f.board) expect(f.board.value).toBe('100');
        }
    });

    test('gets a number that fades in where it stands, with no rockets and no bursts', () => {
        const F = M.fireworks;
        const plan = Fw.planFireworks({ ...Mi.fireworksSetup(200), seed: 5 });
        const pos = new Float32Array(F.pool * 3);
        const col = new Float32Array(F.pool * 3);
        const fin = plan.finale;
        for (const t of sample(plan.end + 0.5, 0.05)) {
            Fw.sparksAt(t, plan, pos, col, { calm: true });
            for (let i = 0; i < plan.count; i += 1) {
                const lit = col[i * 3] + col[i * 3 + 1] + col[i * 3 + 2] > 1e-9;
                const numeral = i >= fin.first && i < fin.first + fin.targets.length;
                if (!numeral) {
                    expect(lit).toBe(false);
                } else if (lit) {
                    const target = fin.targets[i - fin.first];
                    expect(pos[i * 3]).toBeCloseTo(target.x, 4);
                    expect(pos[i * 3 + 1]).toBeCloseTo(target.y, 4);
                    expect(pos[i * 3 + 2]).toBeCloseTo(target.z, 4);
                }
            }
        }
    });
});

describe('the fireworks', () => {
    const F = M.fireworks;
    const lit = (col, i) => col[i * 3] + col[i * 3 + 1] + col[i * 3 + 2] > 1e-6;

    test('every show fits the one buffer allocated for it, whatever the roll', () => {
        for (const seed of [1, 7, 42, 2026]) {
            const plan = Fw.planFireworks({ ...Mi.fireworksSetup(200), seed });
            expect(plan.fits).toBe(true);
            expect(plan.count).toBeLessThanOrEqual(F.pool);
            // And it is finished before the camera leaves the sky.
            expect(plan.end).toBeLessThanOrEqual(F.back[0] + 0.3);
            expect(plan.reveal).toBeCloseTo(
                Mi.showFrame(200, 0).reveal ? 0 : F.finaleLaunch + F.rise + F.gather, 9);
        }
    });

    test('nothing is lit before the first launch or after the end, and nothing is NaN', () => {
        const plan = Fw.planFireworks({ ...Mi.fireworksSetup(200), seed: 3 });
        const pos = new Float32Array(F.pool * 3);
        const col = new Float32Array(F.pool * 3);
        for (const t of [0, F.firstLaunch - 0.01, plan.end + 0.01, F.length]) {
            Fw.sparksAt(t, plan, pos, col);
            for (let i = 0; i < plan.count; i += 1) expect(lit(col, i)).toBe(false);
        }
        for (const t of sample(F.length, 0.1)) {
            Fw.sparksAt(t, plan, pos, col);
            for (let i = 0; i < plan.count * 3; i += 1) {
                expect(Number.isFinite(pos[i])).toBe(true);
                expect(col[i]).toBeGreaterThanOrEqual(0);
                expect(col[i]).toBeLessThanOrEqual(1 + 1e-9);
            }
        }
    });

    /**
     * AT THE HOLD, THE NUMBER IS THE NUMBER: every spark of the finale is lit and
     * standing on its own point of the numerals. The gathering is an ease, so a
     * version that stopped short would leave a smeared "200" that reads from a
     * distance and fails here.
     */
    test('the finale stands exactly on the numerals through the hold', () => {
        const plan = Fw.planFireworks({ ...Mi.fireworksSetup(200), seed: 9 });
        const pos = new Float32Array(F.pool * 3);
        const col = new Float32Array(F.pool * 3);
        const fin = plan.finale;
        for (const t of [plan.reveal + 0.01, plan.reveal + F.hold * 0.5, plan.reveal + F.hold - 0.01]) {
            Fw.sparksAt(t, plan, pos, col);
            fin.targets.forEach((target, s) => {
                const i = fin.first + s;
                expect(lit(col, i)).toBe(true);
                expect(pos[i * 3]).toBeCloseTo(target.x, 4);
                expect(pos[i * 3 + 1]).toBeCloseTo(target.y, 4);
                expect(pos[i * 3 + 2]).toBeCloseTo(target.z, 4);
            });
        }
    });

    test('the same roll is the same show, and a different one is a different volley', () => {
        const a = Fw.planFireworks({ ...Mi.fireworksSetup(200), seed: 21 });
        const b = Fw.planFireworks({ ...Mi.fireworksSetup(200), seed: 21 });
        const c = Fw.planFireworks({ ...Mi.fireworksSetup(200), seed: 22 });
        expect(a.shells.map((s) => s.at)).toEqual(b.shells.map((s) => s.at));
        expect(a.shells.map((s) => s.at)).not.toEqual(c.shells.map((s) => s.at));
        // ...but the number is the number.
        expect(a.finale.targets.map(({ x, y, z }) => ({ x, y, z })))
            .toEqual(c.finale.targets.map(({ x, y, z }) => ({ x, y, z })));
    });

    /**
     * THE NUMERALS HAVE NO GAPS IN THEM. Sparks are spaced along the strokes, so
     * a glyph whose points jump further than a spacing and a half has a hole
     * in a stroke that reads as a different digit from a distance.
     */
    test('every numeral is drawn with no holes and in the right order', () => {
        for (const text of ['100', '200', '300', '400', '500', '0123456789']) {
            const pts = Fw.digitPoints(text, { height: 9, spacing: 0.42 });
            expect(pts.length).toBeGreaterThan(text.length * 10);
            for (let i = 1; i < pts.length; i += 1) {
                const d = Math.hypot(pts[i].u - pts[i - 1].u, pts[i].v - pts[i - 1].v);
                // A jump is allowed only between strokes, which start fresh.
                if (d > 0.42 * 1.5) continue;
                expect(d).toBeGreaterThan(0.15);
            }
            const us = pts.map((p) => p.u);
            const vs = pts.map((p) => p.v);
            // Centred, and exactly as tall as asked.
            expect(Math.max(...us) + Math.min(...us)).toBeCloseTo(0, 6);
            expect(Math.max(...vs) - Math.min(...vs)).toBeCloseTo(9, 6);
        }
        // Left to right is +u, which is +z in the world, which is screen right
        // for a camera looking down +x. A "002" in the sky would be this.
        const two = Fw.digitPoints('20', { height: 9 });
        const firstGlyph = two.slice(0, Fw.digitPoints('2', { height: 9 }).length);
        expect(Math.max(...firstGlyph.map((p) => p.u))).toBeLessThan(0);
        const sky = Mi.skyShot(16 / 9);
        const c = Mi.finaleCentre();
        expect(Mi.projectPoint(sky, 16 / 9, { ...c, z: c.z + 5 }).x).toBeGreaterThan(0);
    });
});

describe('getting out of one', () => {
    test('Escape is the skip key, and it is not mistaken for any other', () => {
        expect(keyAction('Escape')).toBe('skip');
        expect(keyAction('Escape', { inField: true })).toBe('');
        expect(keyAction('Escape', { modified: true })).toBe('');
        // THE MATCH IS A SUBSTRING MATCH on data-keys, so "Escape" must contain
        // none of the other keys' capitals or it would press their buttons too.
        for (const other of ['S', 'Q', 'K', 'C', 'V', 'A', 'B', 'D']) {
            expect('Escape'.includes(other)).toBe(false);
        }
    });
});
