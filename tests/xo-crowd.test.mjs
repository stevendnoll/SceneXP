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

/**
 * THE STANDS BEFORE THE WHISTLE (Steve, 2026-10-30): every fan up from the
 * line-up to the whistle, each on their own turn, lower and looser than the
 * cheer that answers the play.
 */
describe('before the whistle', () => {
    const B = K.buzz;
    const hop = B.hop * K.scale;
    const sample = seats.filter((_, i) => i % 4 === 0);
    /** When this fan's turn begins, a cycle or more in. */
    const turnStart = (seat) => (1 - seat.phase) * B.cycle + B.cycle;

    test('every fan gets up, on both sides and in plain jackets, under a hop lower than the cheer\'s', () => {
        expect(hop).toBeLessThan(K.cheer.small.hop * K.scale);
        for (const seat of sample) {
            let top = 0;
            for (let t = -0.2; t <= B.cycle * 2; t += 0.02) {
                const h = St.buzzHop(t, seat);
                expect(h).toBeGreaterThanOrEqual(0);
                expect(h).toBeLessThanOrEqual(hop + 1e-9);
                if (t <= 0) expect(h).toBe(0);
                top = Math.max(top, h);
            }
            expect(top).toBeGreaterThan(hop * 0.6);
        }
    });

    test('each fan takes turns, up for the duty share of a cycle, so about that share of the crowd is up at any moment', () => {
        for (const seat of sample) {
            let up = 0;
            let n = 0;
            for (let t = B.cycle; t < B.cycle * 2; t += 0.01) {
                n += 1;
                if (St.buzzTurn(t, seat) > 0) up += 1;
            }
            expect(up / n).toBeCloseTo(B.duty, 1);
        }
        for (const t of [1.5, 3, 4.7, 6.2, 9]) {
            const share = seats.filter((s) => St.buzzTurn(t, s) >= 0.5).length / seats.length;
            expect(share).toBeGreaterThan(0.4);
            expect(share).toBeLessThan(0.85);
        }
        // Their turns are their own, not a block: at one instant some are
        // seated, some are up, and the ones up are at different points of
        // their hop.
        const forty = seats.slice(0, 40);
        expect(forty.some((s) => St.buzzTurn(2, s) === 0)).toBe(true);
        expect(forty.some((s) => St.buzzTurn(2, s) === 1)).toBe(true);
        expect(new Set(forty.map((s) => St.buzzHop(2, s).toFixed(3))).size).toBeGreaterThan(20);
    });

    test('no fan pops: the hop never jumps more than a small step between frames, the start included', () => {
        const frame = 1 / 30;
        for (const seat of sample) {
            let was = St.buzzHop(0, seat);
            for (let t = frame; t <= B.cycle * 1.5; t += frame) {
                const h = St.buzzHop(t, seat);
                expect(Math.abs(h - was)).toBeLessThan(hop * 0.5);
                was = h;
            }
        }
    });

    test('arms go up once a turn, only while the fan is well into it, and come down before it ends', () => {
        for (const seat of sample) {
            const from = turnStart(seat);
            let before = 'down';
            let changes = 0;
            let raised = false;
            for (let t = from; t < from + B.cycle; t += 0.01) {
                const arms = St.buzzArms(t, seat);
                if (arms === 'up') {
                    raised = true;
                    expect(St.buzzTurn(t, seat)).toBeGreaterThanOrEqual(0.5);
                }
                if (arms !== before) changes += 1;
                before = arms;
            }
            expect(raised).toBe(true);
            expect(changes).toBe(2);
            // ...and never in the first beat of the buzz, while they are still rising.
            expect(St.buzzArms(B.ease * 0.2, seat)).toBe('down');
        }
    });

    test('somebody who asked for less motion sees the stands keep still', () => {
        for (const seat of sample) {
            for (let t = 0; t <= B.cycle; t += 0.1) {
                expect(St.buzzHop(t, seat, { calm: true })).toBe(0);
                expect(St.buzzArms(t, seat, { calm: true })).toBe('down');
                expect(St.fanPose(seat, { buzzT: t, calm: true })).toEqual({ hop: 0, arms: 'down' });
            }
        }
    });
});

/**
 * THE HAND-OFF AT THE WHISTLE: the cheering side carries on into its cheer, the
 * rest sit down, and nobody is moved in one frame either way.
 */
describe('the hand-off at the whistle', () => {
    const C = K.cheer;
    const cheers = [{ team: 0, big: true }, { team: 1, big: false }];
    const buzzAt = 7.3;   // the buzz had run this long when the whistle went
    const joins = (seat, cheer) => seat.team === cheer.team || (cheer.big && seat.team === St.NEUTRAL);

    test('with no cheer a fan is where the buzz has them, and with no buzz where the cheer has them', () => {
        for (const seat of seats.filter((_, i) => i % 5 === 0)) {
            expect(St.fanPose(seat, { buzzT: 3.3 })).toEqual({ hop: St.buzzHop(3.3, seat), arms: St.buzzArms(3.3, seat) });
            const cheer = cheers[0];
            expect(St.fanPose(seat, { cheer, cheerT: 0.9 })).toEqual({ hop: St.cheerHop(0.9, seat, cheer), arms: St.cheerArms(0.9, seat, cheer) });
            expect(St.fanPose(seat, {})).toEqual({ hop: 0, arms: 'down' });
        }
    });

    test('at the whistle every fan is exactly where the buzz had them, and nobody moves far in one frame after it', () => {
        const frame = 1 / 30;
        const biggest = Math.max(C.big.hop, K.buzz.hop) * K.scale;
        for (const cheer of cheers) {
            for (const seat of seats.filter((_, i) => i % 3 === 0)) {
                const at = St.fanPose(seat, { buzzT: buzzAt, cheer, cheerT: 0 });
                expect(at.hop).toBeCloseTo(St.buzzHop(buzzAt, seat), 9);
                expect(at.arms).toBe(St.buzzArms(buzzAt, seat));
                let was = at.hop;
                for (let t = frame; t <= St.cheerLength(cheer) + 0.5; t += frame) {
                    const { hop } = St.fanPose(seat, { buzzT: buzzAt + t, cheer, cheerT: t });
                    expect(Math.abs(hop - was)).toBeLessThan(biggest * 0.5);
                    was = hop;
                }
            }
        }
    });

    test('the other side sits down in a ripple and stays down, while the cheering side carries on into its cheer', () => {
        for (const cheer of cheers) {
            const settled = C.stagger + C.ease;
            for (const seat of seats.filter((_, i) => i % 3 === 0)) {
                for (let t = settled; t <= St.cheerLength(cheer) + 0.5; t += 0.02) {
                    const pose = St.fanPose(seat, { buzzT: buzzAt + t, cheer, cheerT: t });
                    if (!joins(seat, cheer)) {
                        expect(pose).toEqual({ hop: 0, arms: 'down' });
                    } else {
                        expect(pose.hop).toBeCloseTo(St.cheerHop(t, seat, cheer), 9);
                        expect(pose.arms).toBe(St.cheerArms(t, seat, cheer));
                    }
                }
                // A ripple: a fan late in the stagger is still in the buzz just after the whistle.
                if (seat.phase > 0.5) {
                    const early = St.fanPose(seat, { buzzT: buzzAt + 0.05, cheer, cheerT: 0.05 });
                    expect(early.hop).toBeCloseTo(St.buzzHop(buzzAt + 0.05, seat), 9);
                }
            }
        }
    });

    test('arms never flicker through the hand-off: up stays up until the cheer has them, down goes up at most once', () => {
        for (const cheer of cheers) {
            for (const seat of seats.filter((_, i) => i % 2 === 0)) {
                let before = St.fanPose(seat, { buzzT: buzzAt, cheer, cheerT: 0 }).arms;
                let changes = 0;
                for (let t = 0.01; t <= St.cheerLength(cheer) + 0.3; t += 0.01) {
                    const { arms } = St.fanPose(seat, { buzzT: buzzAt + t, cheer, cheerT: t });
                    if (arms !== before) changes += 1;
                    before = arms;
                }
                expect(changes).toBeLessThanOrEqual(joins(seat, cheer) ? 2 : 1);
                expect(before).toBe('down');
            }
        }
    });
});
