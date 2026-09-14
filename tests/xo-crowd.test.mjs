// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * xo-crowd.test.mjs - the fans in the stands, and who they cheer for.
 *
 * THE STANDS SHIPPED EMPTY (D8) and got a crowd on 2026-09-14: regulars in
 * every game, orange for the Mongooses on one side and blue for the Crows on
 * the other, who jump when their team does something. The perfect game at 500
 * already filled every seat, so the two crowds have to share one seat grid
 * without ever putting two fans in one seat or leaving 500 nothing to fill.
 *
 * Written as properties of stunt.js, which is pure. spectacle.js only copies
 * these answers into instanced meshes, and the Three stub would swallow
 * anything asserted about those (see xo-gameplay.test.mjs).
 */
import { describe, test, expect } from '@jest/globals';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { installThree } from './helpers/three-stub.mjs';

const scene = join(dirname(fileURLToPath(import.meta.url)), '..', 'www', 'xo', 'js');
installThree();

const { XO_CONFIG: CFG } = await import(join(scene, 'config.js'));
const St = await import(join(scene, 'stunt.js'));
const { occasionFor } = await import(join(scene, 'celebration.js'));
const Fans = await import(join(scene, 'fans.js'));

const K = CFG.crowd;
const { seats, cols } = St.crowdSeats();
const stand = (side) => seats.filter((s) => s.side === side);
const share = (list, test) => list.filter(test).length / Math.max(1, list.length);

describe('who sits where', () => {
    test('every seat holds one fan, so the regulars and the perfect game never share one', () => {
        const keys = new Set(seats.map((s) => `${s.side}:${s.riser}:${s.col}`));
        const spots = new Set(seats.map((s) => `${s.x.toFixed(3)}:${s.y.toFixed(3)}:${s.z.toFixed(3)}`));
        expect(keys.size).toBe(seats.length);
        expect(spots.size).toBe(seats.length);
        for (const s of seats) {
            expect(typeof s.regular).toBe('boolean');
            expect([0, 1, St.NEUTRAL]).toContain(s.team);
            const shirts = s.team === St.NEUTRAL ? K.shirts.neutral : K.shirts[s.team];
            expect(shirts[s.shirt]).toBeTruthy();
            expect(K.skins[s.skin]).toBeTruthy();
            expect(s.phase).toBeGreaterThanOrEqual(0);
            expect(s.phase).toBeLessThan(1);
            expect([...Fans.HAIR, 'bald']).toContain(s.hair);
            expect(K.hairColours[s.hairColour]).toBeTruthy();
            expect(K.pants[s.pants]).toBeTruthy();
            expect(Math.abs(s.turn)).toBeLessThanOrEqual(K.turn);
        }
    });

    test('the same crowd turns up every time', () => {
        expect(St.crowdSeats().seats).toEqual(seats);
    });

    test('before 500 each stand has people in it but under half its seats, fuller at midfield than at the ends', () => {
        for (const side of [-1, 1]) {
            const all = stand(side);
            const busy = share(all, (s) => s.regular);
            expect(busy).toBeGreaterThan(0.15);
            // Fewer, player-sized fans (2026-09-14), and room left for the
            // perfect game to pack the house.
            expect(busy).toBeLessThan(0.5);
            const middle = all.filter((s) => Math.abs(s.col - cols / 2) < cols / 6);
            const ends = all.filter((s) => Math.abs(s.col - cols / 2) > cols / 3);
            expect(share(middle, (s) => s.regular)).toBeGreaterThan(share(ends, (s) => s.regular));
        }
    });

    test('each stand roots for its own team, with a few of the other team\'s fans in it', () => {
        const homes = new Set();
        for (const side of [-1, 1]) {
            const home = St.homeTeam(side);
            homes.add(home);
            const regulars = stand(side).filter((s) => s.regular);
            expect(share(regulars, (s) => s.team === home)).toBeGreaterThan(0.6);
            expect(share(regulars, (s) => s.team === 1 - home)).toBeGreaterThan(0.08);
        }
        expect(seats.some((s) => s.regular && s.team === St.NEUTRAL)).toBe(true);
        // One stand each, rather than both stands for one team.
        expect([...homes].sort()).toEqual([0, 1]);
    });

    test('the near end of each stand, which is most of what a phone held upright sees, is its home colour', () => {
        for (const side of [-1, 1]) {
            const home = St.homeTeam(side);
            const near = stand(side).filter((s) => s.regular && s.col < cols / 4);
            expect(near.length).toBeGreaterThan(6);
            expect(share(near, (s) => s.team === home)).toBeGreaterThan(0.6);
        }
    });
    test('fans are the players\' size, and every column of cards at 500 has a fan holding it', () => {
        expect(K.scale).toBe(CFG.figureScale);
        const far = stand(1);
        for (let riser = 0; riser < 4; riser += 1) {
            const held = new Set();
            for (const s of far.filter((f) => f.riser === riser)) {
                for (let c = s.col; c < Math.min(s.col + K.fanEvery, cols); c += 1) held.add(c);
            }
            expect(held.size).toBe(cols);
        }
        // Far enough apart that two player-sized fans do not stand in each other.
        const xs = far.filter((f) => f.riser === 0).map((f) => f.x).sort((a, b) => a - b);
        for (let i = 1; i < xs.length - 1; i += 1) expect(xs[i] - xs[i - 1]).toBeGreaterThan(0.38 * K.scale * 1.5);
    });
});

describe('who cheers', () => {
    const result = (points, kind = 'pass') => ({ points, result: kind });

    test('the stands and the field agree on the big moments', () => {
        const fifty = result(50);
        expect(St.cheerFor(fifty, occasionFor(fifty))).toEqual({ team: 0, big: true });
        const pick = result(-10, 'interception');
        expect(St.cheerFor(pick, occasionFor(pick))).toEqual({ team: 1, big: true });
        const sack = result(-5, 'sack');
        expect(St.cheerFor(sack, occasionFor(sack, true))).toEqual({ team: 1, big: true });
    });

    test('a gain is a small cheer for the Mongooses and anything else a small one for the Crows', () => {
        expect(St.cheerFor(result(20), '')).toEqual({ team: 0, big: false });
        expect(St.cheerFor(result(0), '')).toEqual({ team: 1, big: false });
        const expired = result(-5, 'sack');
        expect(St.cheerFor(expired, occasionFor(expired, false, true))).toEqual({ team: 1, big: false });
        expect(St.cheerFor(null)).toBeNull();
    });
});

describe('how they cheer', () => {
    const cheers = [
        { team: 0, big: true }, { team: 1, big: true },
        { team: 0, big: false }, { team: 1, big: false },
    ];
    const step = 0.01;

    test('only the cheering team jumps, and plain jackets only join the big ones', () => {
        for (const cheer of cheers) {
            const length = St.cheerLength(cheer);
            for (const seat of seats.filter((_, i) => i % 7 === 0)) {
                let top = 0;
                for (let t = 0; t <= length; t += step) top = Math.max(top, St.cheerHop(t, seat, cheer));
                const joins = seat.team === cheer.team || (cheer.big && seat.team === St.NEUTRAL);
                if (!joins) expect(top).toBe(0);
            }
        }
    });

    test('every fan who cheers leaves the seat, stays under the hop, and lands back on it', () => {
        for (const cheer of cheers) {
            const hop = (cheer.big ? K.cheer.big.hop : K.cheer.small.hop) * K.scale;
            const length = St.cheerLength(cheer);
            for (const seat of seats.filter((s) => s.team === cheer.team)) {
                let top = 0;
                for (let t = -0.2; t <= length + 0.5; t += step) {
                    const h = St.cheerHop(t, seat, cheer);
                    expect(h).toBeGreaterThanOrEqual(0);
                    expect(h).toBeLessThanOrEqual(hop + 1e-9);
                    if (t <= 0 || t >= length) expect(h).toBe(0);
                    top = Math.max(top, h);
                }
                // Not vacuous: they actually get up.
                expect(top).toBeGreaterThan(hop * 0.8);
            }
        }
    });

    test('no fan pops into the air: the hop never jumps more than a small step between frames', () => {
        const cheer = { team: 0, big: true };
        const hop = K.cheer.big.hop * K.scale;
        // At 30 frames a second, a quarter of the hop is the most one frame may move.
        const frame = 1 / 30;
        for (const seat of stand(1).filter((s) => s.team === 0).slice(0, 40)) {
            let was = St.cheerHop(0, seat, cheer);
            for (let t = frame; t <= St.cheerLength(cheer); t += frame) {
                const h = St.cheerHop(t, seat, cheer);
                expect(Math.abs(h - was)).toBeLessThan(hop * 0.5);
                was = h;
            }
        }
    });

    test('somebody who asked for less motion sees the stands keep still', () => {
        for (const cheer of cheers) {
            for (const seat of seats.filter((_, i) => i % 5 === 0)) {
                for (let t = 0; t <= St.cheerLength(cheer); t += 0.05) {
                    expect(St.cheerHop(t, seat, cheer, { calm: true })).toBe(0);
                    expect(St.cheerArms(t, seat, cheer, { calm: true })).toBe('down');
                }
            }
        }
    });

    test('arms go up only for a fan who is cheering, and never while their feet are on the riser', () => {
        for (const cheer of cheers) {
            const length = St.cheerLength(cheer);
            for (const seat of seats.filter((_, i) => i % 3 === 0)) {
                let raised = false;
                let before = 'down';
                let changes = 0;
                for (let t = -0.2; t <= length + 0.5; t += step) {
                    const arms = St.cheerArms(t, seat, cheer);
                    const joins = seat.team === cheer.team || (cheer.big && seat.team === St.NEUTRAL);
                    if (!joins) expect(arms).toBe('down');
                    if (t <= 0 || t >= length) expect(arms).toBe('down');
                    if (arms === 'up') raised = true;
                    if (arms !== before) changes += 1;
                    before = arms;
                }
                // One up and one down, never a flicker.
                expect(changes === 0 || changes === 2).toBe(true);
                if (seat.team === cheer.team) expect(raised).toBe(true);
            }
        }
    });
});
