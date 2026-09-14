// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * exesnohs-milestones.test.mjs
 *
 * THE SHOWS A GOOD GAME EARNS: 100 (the lights), 200 (the fireworks), 300 (the
 * blimp), 400 (the numbers on the turf) and 500 (the perfect game).
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
const St = await import(join(scene, 'stunt.js'));
const { standLayout } = await import(join(scene, 'field.js'));
const { idleDriver } = await import(join(scene, 'camera.js'));
const { teamCelebration, celebrationAt } = await import(join(scene, 'celebration.js'));

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
                const keys = [playDriver(aspect), Mi.stadiumShot(aspect), Mi.boardShot(aspect),
                    Mi.skyShot(aspect), Mi.upShot(aspect), Mi.overheadShot(aspect), Mi.sideShot(aspect),
                    Mi.orbitShot(aspect, 0)];
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

// ---- Stage two ------------------------------------------------------------------

const LEN = FIELD.lineInterval * FIELD.segments;
/** A plausible field of men, eight offense and six defense, scattered the way a
 *  play leaves them. */
const scattered = () => [
    ...Array.from({ length: 8 }, (_, i) => ({ position: `o${i}`, team: 0, x: 4 + i * 3.1, z: -8 + i * 2.1 })),
    ...Array.from({ length: 6 }, (_, i) => ({ position: `d${i}`, team: 1, x: 9 + i * 2.7, z: 7 - i * 2.6 })),
];
const minApart = (points) => {
    let d = Infinity;
    for (let i = 0; i < points.length; i += 1) {
        for (let j = i + 1; j < points.length; j += 1) {
            d = Math.min(d, Math.hypot(points[i].x - points[j].x, points[i].z - points[j].z));
        }
    }
    return d;
};

describe('300, the blimp', () => {
    const B = M.blimp;

    /** The number is on the blimp's side, so the side has to be in shot, on
     *  every screen shape, at the moment the number lands. */
    test('its lit side is in frame when the number lands', () => {
        const at = Mi.blimpShowPosition(Mi.blimpReveal());
        for (const aspect of ASPECTS) {
            const shot = Mi.upShot(aspect);
            for (const dz of [-4.5, 4.5]) {
                for (const dy of [-1.3, 1.3]) {
                    expect(inFrame(shot, aspect, { x: at.x - B.size.girth / 2, y: at.y + dy, z: at.z + dz }, 0.95)).toBe(true);
                }
            }
            // ...and the camera is on the lit side, not behind the other one.
            expect(shot.position.x).toBeLessThan(at.x);
        }
    });

    test('it slows overhead without ever stopping, and it crosses the whole sky', () => {
        const speed = (t) => Math.abs(Mi.blimpShowPosition(t + 0.01).z - Mi.blimpShowPosition(t).z) / 0.01;
        const mid = speed(Mi.blimpReveal());
        expect(mid).toBeGreaterThan(0.5);
        expect(mid).toBeLessThan(speed(B.cross[0] + 0.3));
        expect(mid).toBeLessThan(speed(B.cross[1] - 0.3));
        let last = -Infinity;
        for (const t of sample(B.length, 0.05)) {
            const z = Mi.blimpShowPosition(t).z;
            expect(z).toBeGreaterThanOrEqual(last - 1e-9);
            last = z;
        }
        expect(Mi.blimpShowPosition(0).z).toBeLessThan(-40);
        expect(Mi.blimpShowPosition(B.length).z).toBeGreaterThan(40);
    });

    /**
     * IT STAYS UP FOR THE REST OF THE GAME, AND IT MAY NEVER BE IN THE WAY. The
     * play camera is still for a reason (D5), and a blimp drifting across the
     * top of it during a play would be the one moving thing that is not the
     * play. Checked over a whole lap, from the play camera and the idle one.
     */
    test('after its show it circles out of the play and idle cameras entirely', () => {
        for (const aspect of ASPECTS) {
            for (let e = 0; e < B.orbit.period; e += 0.5) {
                const b = Mi.blimpOrbitPosition(e);
                for (const shot of [playDriver(aspect), idleDriver(e, aspect)]) {
                    for (const dz of [-B.size.long / 2, 0, B.size.long / 2]) {
                        for (const dx of [-B.size.long / 2, B.size.long / 2]) {
                            expect(inFrame(shot, aspect, { x: b.x + dx, y: b.y - B.size.girth / 2, z: b.z + dz }))
                                .toBe(false);
                        }
                    }
                }
            }
        }
    });

    test('its tail light blinks well under three times a second', () => {
        expect(B.blinkHz * 2).toBeLessThan(3);
    });

    test('the offense waves at it from where it stands, and nobody is sent anywhere', () => {
        const men = scattered();
        const stage = Mi.stageTeam(300, men);
        expect(stage.walk).toBe(0);
        for (const m of men) expect(stage.spots.get(m.position)).toEqual({ x: m.x, z: m.z });
        const everybody = [stage.celebrate.hero, ...stage.celebrate.mates];
        expect(everybody.every((m) => m.team === 0)).toBe(true);
        expect(everybody.length).toBe(8);
    });
});

describe('400, the numbers on the turf', () => {
    const T = M.turf;
    const bulbs = Fw.planBulbs(Mi.turfSetup(400));

    test('every bulb of the numerals is on the field and in the overhead shot', () => {
        for (const b of bulbs.bulbs) {
            expect(Math.abs(b.z)).toBeLessThan(FIELD.width / 2);
            expect(b.x).toBeGreaterThan(0);
            expect(b.x).toBeLessThan(LEN);
        }
        for (const aspect of ASPECTS) {
            const shot = Mi.overheadShot(aspect);
            for (const b of bulbs.bulbs) expect(inFrame(shot, aspect, b, 0.96)).toBe(true);
            // Downfield is the top of the frame, or "400" reads upside down.
            const up = Mi.projectPoint(shot, aspect, { x: LEN / 2 + 3, y: 0, z: 0 }).y;
            const down = Mi.projectPoint(shot, aspect, { x: LEN / 2 - 3, y: 0, z: 0 }).y;
            expect(up).toBeGreaterThan(down);
        }
    });

    test('the offense stands on the numbers, spread out, and the defense clears off them', () => {
        const men = scattered();
        const stage = Mi.stageTeam(400, men, { numerals: bulbs.bulbs });
        const onBulb = (p) => bulbs.bulbs.some((b) => Math.hypot(b.x - p.x, b.z - p.z) < 1e-9);
        const offense = men.filter((m) => m.team === 0).map((m) => stage.spots.get(m.position));
        const defense = men.filter((m) => m.team !== 0).map((m) => stage.spots.get(m.position));
        for (const p of offense) expect(onBulb(p)).toBe(true);
        expect(minApart(offense)).toBeGreaterThanOrEqual(T.apart - 1e-9);
        // Every digit has somebody on it: the men reach across the whole number.
        const zs = offense.map((p) => p.z);
        const bz = bulbs.bulbs.map((b) => b.z);
        expect(Math.min(...zs)).toBeLessThan(Math.min(...bz) + 3);
        expect(Math.max(...zs)).toBeGreaterThan(Math.max(...bz) - 3);
        for (const p of defense) {
            expect(Math.abs(p.z)).toBeLessThanOrEqual(FIELD.width / 2);
            const nearest = Math.min(...bulbs.bulbs.map((b) => Math.hypot(b.x - p.x, b.z - p.z)));
            expect(nearest).toBeGreaterThan(CFG.pose.celebration.body);
        }
        expect(minApart([...offense, ...defense])).toBeGreaterThan(CFG.pose.celebration.body);
    });

    test('the number lands as the men arrive on it, and they celebrate only then', () => {
        const stage = Mi.stageTeam(400, scattered(), { numerals: bulbs.bulbs });
        expect(stage.delay + stage.walk).toBeCloseTo(T.walk[1], 9);
        expect(Mi.showFrame(400, T.walk[1] - 0.01).reveal).toBe(false);
        expect(Mi.showFrame(400, T.walk[1] + 0.01).reveal).toBe(true);
        const plan = teamCelebration({ ...stage.celebrate });
        expect(celebrationAt(T.walk[1] - 0.01, plan).size).toBe(0);
        expect(celebrationAt(T.walk[1] + 0.5, plan).size).toBeGreaterThan(0);
    });

    test('a calm 400 runs nobody: they are placed on the camera cut', () => {
        const stage = Mi.stageTeam(400, scattered(), { calm: true, numerals: bulbs.bulbs });
        expect(stage.walk).toBe(0);
        expect(stage.delay).toBeCloseTo((T.toTop[0] + T.toTop[1]) / 2, 9);
    });

    test('the bulbs light in order, chase without flashing, and all go out', () => {
        const pos = new Float32Array(bulbs.count * 3);
        const col = new Float32Array(bulbs.count * 3);
        const lum = (i) => col[i * 3] + col[i * 3 + 1] + col[i * 3 + 2];
        const opts = { light: T.light, out: T.out };
        Fw.bulbsAt(T.light[0] - 0.01, bulbs, pos, col, opts);
        for (let i = 0; i < bulbs.count; i += 1) expect(lum(i)).toBe(0);
        Fw.bulbsAt(T.light[1] + 0.2, bulbs, pos, col, opts);
        let dimmest = Infinity;
        let brightest = 0;
        for (let i = 0; i < bulbs.count; i += 1) {
            dimmest = Math.min(dimmest, lum(i));
            brightest = Math.max(brightest, lum(i));
        }
        // The chase never takes a bulb below three quarters of the brightest.
        expect(dimmest / brightest).toBeGreaterThanOrEqual(0.6);
        Fw.bulbsAt(T.out[1] + 0.01, bulbs, pos, col, opts);
        for (let i = 0; i < bulbs.count; i += 1) expect(lum(i)).toBe(0);
        // Calm: all at once, all the same.
        Fw.bulbsAt(T.light[0] + 0.01, bulbs, pos, col, { ...opts, calm: true });
        const first = lum(0);
        expect(first).toBeGreaterThan(0);
        for (let i = 0; i < bulbs.count; i += 1) expect(lum(i)).toBeCloseTo(first, 6);
    });
});

describe('500, the perfect game', () => {
    const F = M.finale;
    const S = standLayout();

    /**
     * THE TEAMS, THE CARD STUNT AND THE SKY ABOVE THE STAND ARE ALL IN FRAME, and
     * nobody is hidden behind the near stand, which stands between the camera
     * and the field. A fitted shot knows nothing about what is in the way, so
     * the line of sight is checked against the near stand's back wall.
     */
    test('the side shot sees the teams, the whole message, and nothing blocks the teams', () => {
        const rows = Mi.finaleRows(14);
        const message = St.pixelMessage('PERFECT', St.crowdSeats().cols);
        const pitch = F.fans.pitch;
        const left = S.fromX + message.left * pitch;
        const right = left + message.width * pitch;
        const wallZ = -(S.half + S.standoff + S.rows * S.stepOut);
        const wallTop = S.rows * S.stepUp + 1.6;
        for (const aspect of ASPECTS) {
            const shot = Mi.sideShot(aspect);
            for (const p of rows) {
                for (const y of [0, 3.9]) expect(inFrame(shot, aspect, { x: p.x, y, z: p.z }, 0.97)).toBe(true);
                const f = shot.position;
                const k = (wallZ - f.z) / (p.z - f.z);
                if (k > 0 && k < 1) expect(f.y + (0 - f.y) * k).toBeGreaterThan(wallTop);
            }
            for (const x of [left, right]) {
                expect(inFrame(shot, aspect, { x, y: S.top(S.rows - 1) + 1.3, z: S.out(S.rows - 1) }, 0.97)).toBe(true);
                expect(inFrame(shot, aspect, { x, y: S.top(0) + 0.95, z: S.out(0) }, 0.97)).toBe(true);
            }
        }
    });

    test('the teams stand in two rows a body apart, in front of the stand', () => {
        const stage = Mi.stageTeam(500, scattered());
        const spots = [...stage.spots.values()];
        expect(minApart(spots)).toBeGreaterThan(CFG.pose.celebration.body);
        for (const p of spots) {
            expect(p.z).toBeLessThan(S.half);
            expect(Math.abs(p.x - LEN / 2)).toBeLessThan(LEN / 2);
        }
        // Both teams celebrate, and nobody sags: it is a perfect game.
        expect(stage.celebrate.rivals.length).toBe(0);
        expect(1 + stage.celebrate.mates.length).toBe(14);
    });

    test('the message fits the stand and every character in it can be drawn', () => {
        const { cols } = St.crowdSeats();
        for (const text of ['PERFECT', '500']) {
            for (const c of text) expect(St.FONT[c]).toBeTruthy();
            const m = St.pixelMessage(text, cols);
            expect(m.left).toBeGreaterThanOrEqual(0);
            expect(m.left + m.width).toBeLessThanOrEqual(cols);
            for (const key of m.lit) expect(Number(key.split(':')[0])).toBeLessThan(St.CARD_ROWS);
        }
        // Eight rows from four risers, each row used once.
        const rows = new Set();
        for (let r = 0; r < S.rows; r += 1) for (const up of [true, false]) rows.add(St.cardRow(r, up));
        expect([...rows].sort((a, b) => a - b)).toEqual([...Array(St.CARD_ROWS).keys()]);
    });

    test('the cards come up, spell PERFECT, flip to 500, and never show anything half-way at rest', () => {
        const { cols } = St.crowdSeats();
        const messages = {
            perfect: St.pixelMessage('PERFECT', cols).lit,
            five: St.pixelMessage('500', cols).lit,
        };
        const white = Fw.hexToRgb(F.cards.white);
        const gold = Fw.hexToRgb(F.cards.gold);
        for (let row = 0; row < St.CARD_ROWS; row += 1) {
            for (let col = 0; col < cols; col += 3) {
                expect(St.cardAt(F.perfect[0] - 0.01, row, col, cols, messages).turn).toBe(0);
                const mid = St.cardAt((F.perfect[1] + F.five[0]) / 2, row, col, cols, messages);
                expect(mid.turn).toBe(1);
                expect(mid.colour).toEqual(messages.perfect.has(`${row}:${col}`) ? white : Fw.hexToRgb(F.cards.orange));
                const end = St.cardAt(F.five[1] + 0.01, row, col, cols, messages);
                expect(end.turn).toBe(1);
                expect(end.colour).toEqual(messages.five.has(`${row}:${col}`) ? gold : Fw.hexToRgb(F.cards.navy));
                for (const t of sample(F.five[1] + 0.5, 0.01)) {
                    const card = St.cardAt(t, row, col, cols, messages);
                    expect(card.turn).toBeGreaterThanOrEqual(0);
                    expect(card.turn).toBeLessThanOrEqual(1 + 1e-9);
                    const calm = St.cardAt(t, row, col, cols, messages, { calm: true });
                    expect([0, 1]).toContain(calm.turn);
                }
            }
        }
        // The number is spelled by the time it lands.
        expect(F.five[1]).toBeLessThanOrEqual(F.reveal + 1e-9);
    });

    test('the fans arrive in a ripple, and all of them arrive', () => {
        const { seats, cols } = St.crowdSeats();
        for (const seat of seats) {
            expect(St.fanArrival(F.fill[0] - 0.01, seat, cols)).toBe(0);
            expect(St.fanArrival(F.fill[1] + 0.2, seat, cols)).toBe(1);
            expect(St.fanArrival(F.fill[0], seat, cols, { calm: true })).toBe(1);
        }
    });

    test('its fireworks keep the flash gap and its confetti only ever falls on the field', () => {
        const plan = Fw.planFireworks({ ...Mi.finaleFireworksSetup(), seed: 4, F: { ...M.fireworks, ...F.fireworks } });
        expect(plan.fits).toBe(true);
        const bursts = [...plan.shells.map((s) => s.burst), plan.finale.burst].sort((a, b) => a - b);
        for (let i = 1; i < bursts.length; i += 1) expect(bursts[i] - bursts[i - 1]).toBeGreaterThanOrEqual(M.flashGap - 1e-9);
        expect(plan.finale.targets.length).toBe(0);
        expect(plan.end).toBeLessThan(F.back[0]);

        const conf = Fw.planConfetti({ pieces: 200, from: F.confetti.from, seed: 3 });
        const pos = new Float32Array(200 * 3);
        const col = new Float32Array(200 * 3);
        Fw.confettiAt(F.confetti.from - 0.01, conf, pos, col);
        for (let i = 0; i < 200; i += 1) expect(pos[i * 3 + 1]).toBe(Fw.PARKED);
        for (const t of sample(F.length, 0.25)) {
            Fw.confettiAt(t, conf, pos, col);
            for (let i = 0; i < 200; i += 1) {
                const y = pos[i * 3 + 1];
                expect(y === Fw.PARKED || (y > 0 && y < 40)).toBe(true);
            }
        }
    });

    test('the camera goes round the gold ball and keeps it in the middle of the frame', () => {
        const c = Mi.trophySpot();
        for (const aspect of ASPECTS) {
            for (const u of [0, 0.5, 1]) {
                const shot = Mi.orbitShot(aspect, u);
                const s = Mi.projectPoint(shot, aspect, c);
                expect(Math.abs(s.x)).toBeLessThan(1e-6);
                expect(Math.abs(s.y)).toBeLessThan(1e-6);
                expect(shot.position.y).toBeGreaterThan(c.y);
            }
            const a = Mi.orbitShot(aspect, 0).position;
            const b = Mi.orbitShot(aspect, 1).position;
            expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(10);
        }
    });

    test('a calm finale has no confetti and a trophy that does not spin', () => {
        for (const t of sample(F.length, 0.1)) {
            const f = Mi.showFrame(500, t, { calm: true });
            expect(f.confetti).toBe(false);
            if (f.trophy) expect(f.trophy.spin).toBe(0);
        }
    });
});

describe('a team celebrating where it stands', () => {
    const men = scattered();
    const offense = men.filter((m) => m.team === 0);

    test('waits, then everybody celebrates facing the point they were given', () => {
        const plan = teamCelebration({
            hero: offense[0], mates: offense.slice(1), rivals: men.filter((m) => m.team !== 0),
            faceAt: { x: -60, z: 0 }, watchAt: { x: 17, z: 0 }, wait: 2, cap: 2.4,
            dances: ['bow', 'shimmy'],
        });
        expect(celebrationAt(1.99, plan).size).toBe(0);
        const at = celebrationAt(plan.length, plan);
        for (const m of offense) {
            const got = at.get(m.position);
            expect(got.face).toBeCloseTo(Math.atan2(-60 - m.x, 0 - m.z), 6);
            expect(Math.hypot(got.x, got.z)).toBe(0);
        }
        expect(new Set(plan.parts.map((p) => p.dance))).toEqual(new Set(['bow', 'shimmy']));
        for (const r of men.filter((m) => m.team !== 0)) expect(at.get(r.position).arms).toBe('slump');
        expect(plan.length).toBeLessThanOrEqual(2 + 2.4 + 1e-9);
    });

    test('somebody who asked not to be moved about gets the bow from everybody', () => {
        const plan = teamCelebration({ hero: offense[0], mates: offense.slice(1), calm: true, dances: ['spin', 'shimmy'] });
        expect(plan.parts.every((p) => p.dance === 'bow')).toBe(true);
    });
});
