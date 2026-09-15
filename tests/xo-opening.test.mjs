// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * The opening before the welcome card: its camera and its title, as numbers.
 *
 * opening.js is pure, so "does it end on the shot the welcome card sits over",
 * "does every shot see over the fans" and "is the calm version only cuts" are
 * all questions a test can answer without a screen.
 */
import { describe, test, expect } from '@jest/globals';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { installThree } from './helpers/three-stub.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const scene = join(here, '..', 'www', 'xo', 'js');

installThree();

const { XO_CONFIG: CFG } = await import(join(scene, 'config.min.js'));
const { playDriver } = await import(join(scene, 'camera.min.js'));
const { stadiumShot } = await import(join(scene, 'milestones.min.js'));
const { TEAMS } = await import(join(scene, 'roster.min.js'));
const {
    openingShot, shotAt, titleAt, openingFrame, openingLength, clearsStands, midfield,
    planOpening, castAt, propsAt, swipeSpin,
} = await import(join(scene, 'opening.js'));
const { projectPoint } = await import(join(scene, 'milestones.min.js'));
const { createPlay, lineUp } = await import(join(scene, 'play.min.js'));
const { simToWorld } = await import(join(scene, 'config.min.js'));

const O = CFG.opening;
/** Landscape, a tablet, a phone on its side and a phone held upright. */
const ASPECTS = [1.78, 1.33, 2.17, 0.46];
const NAMES = Object.keys(O.shots);

const close = (a, b) => {
    for (const k of ['x', 'y', 'z']) {
        expect(a.position[k]).toBeCloseTo(b.position[k], 6);
        expect(a.target[k]).toBeCloseTo(b.target[k], 6);
    }
    expect(a.fov).toBeCloseTo(b.fov, 6);
};

describe('the opening arrives, it does not cut', () => {
    test('the last frame is the play camera, which the welcome card sits over', () => {
        for (const aspect of ASPECTS) {
            for (const calm of [false, true]) {
                const end = openingFrame(openingLength({ calm }), { aspect, calm });
                expect(end.done).toBe(true);
                close(end.shot, playDriver(aspect));
            }
        }
    });

    test('and it opens on the whole stadium', () => {
        for (const aspect of ASPECTS) close(shotAt(0, { aspect }), stadiumShot(aspect));
    });

    test('the camera never jumps between frames except at a written cut', () => {
        const cuts = new Set();
        O.keys.forEach(([t], i) => { if (i && O.keys[i - 1][0] === t) cuts.add(t); });
        expect(cuts.size).toBeGreaterThan(0);
        for (const aspect of ASPECTS) {
            let last = shotAt(0, { aspect });
            for (let t = 1 / 60; t <= O.length; t += 1 / 60) {
                const shot = shotAt(t, { aspect });
                const jump = Math.hypot(shot.position.x - last.position.x,
                    shot.position.y - last.position.y, shot.position.z - last.position.z);
                const away = Math.hypot(shot.position.x - shot.target.x,
                    shot.position.y - shot.target.y, shot.position.z - shot.target.z);
                const atCut = [...cuts].some((c) => c > t - 1 / 60 && c <= t);
                // MEASURED AGAINST HOW FAR AWAY IT IS LOOKING, because a hundred
                // metres out a metre a frame is a drift and three metres out it
                // is a whip. The swing round to the away side as the visitors
                // march in is the fastest move at about 4.5% a frame.
                const fast = jump / Math.max(1, away) > 0.05;
                if (!atCut) expect({ aspect, t: +t.toFixed(3), fast }).toEqual({ aspect, t: +t.toFixed(3), fast: false });
                last = shot;
            }
        }
    });

    test('a cut is a cut: the frame before holds one shot and the frame on it the next', () => {
        const at = O.keys.find(([t], i) => i && O.keys[i - 1][0] === t);
        const i = O.keys.indexOf(at);
        close(shotAt(at[0] - 1e-3), openingShot(O.keys[i - 1][1]));
        close(shotAt(at[0]), openingShot(at[1]));
    });
});

describe('every shot in it', () => {
    test('is written down, and the keys run forward in time to the play camera', () => {
        for (const keys of [O.keys, O.calm.keys]) {
            for (let i = 1; i < keys.length; i += 1) expect(keys[i][0]).toBeGreaterThanOrEqual(keys[i - 1][0]);
            for (const [, name] of keys) expect(['wide', 'play', ...NAMES]).toContain(name);
            expect(keys[keys.length - 1][1]).toBe('play');
        }
        expect(O.keys[O.keys.length - 1][0]).toBe(O.length);
        expect(O.calm.keys[O.calm.keys.length - 1][0]).toBe(O.calm.length);
    });

    /**
     * THE FANS ARE PLAYER SIZE, and a low shot across the field on a phone held
     * upright backs out through a stand to fit everything in. Every shot must
     * see the heads and shoulders it frames over both stands.
     */
    test('sees what it frames over the fans, on every screen shape', () => {
        const m = midfield();
        for (const aspect of ASPECTS) {
            for (const name of NAMES) {
                const spec = O.shots[name];
                const c = { x: m.x + spec.at.x, z: m.z + spec.at.z };
                const halfX = aspect < 1 && spec.narrow ? spec.half.x * spec.narrow : spec.half.x;
                const heads = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => ({
                    x: c.x + sx * halfX, y: spec.top, z: c.z + sz * spec.half.z,
                })));
                expect({ aspect, name, clear: clearsStands(openingShot(name, aspect), heads) })
                    .toEqual({ aspect, name, clear: true });
            }
        }
    });

    test('a shot that would look through the stand is refused', () => {
        const through = { position: { x: 17.5, y: 1.5, z: -30 }, target: { x: 17.5, y: 2, z: 0 }, fov: 40 };
        expect(clearsStands(through, [{ x: 17.5, y: 3, z: 0 }])).toBe(false);
    });

    test('the calm version holds named shots and never anything in between', () => {
        const named = (aspect) => [...O.calm.keys.map(([, n]) => openingShot(n, aspect))];
        for (const aspect of ASPECTS) {
            for (let t = 0; t <= O.calm.length; t += 0.05) {
                const shot = shotAt(t, { aspect, calm: true });
                expect(named(aspect).some((s) => s.position.x === shot.position.x
                    && s.position.z === shot.position.z && s.fov === shot.fov)).toBe(true);
            }
        }
    });
});

describe('the title', () => {
    test('is not up at the start or at the end, and is fully up in its window', () => {
        for (const calm of [false, true]) {
            const T = calm ? O.calm.title : O.title;
            expect(titleAt(0, { calm })).toBe(0);
            expect(titleAt(openingLength({ calm }), { calm })).toBe(0);
            expect(titleAt((T[0] + T[1]) / 2, { calm })).toBe(1);
            expect(T[1]).toBeLessThanOrEqual(openingLength({ calm }));
        }
    });

    test('says "Make them pay." and never names a team', () => {
        expect(O.copy.title).toBe('Make them pay.');
        const names = Object.values(TEAMS).map((t) => t.name.replace(/^The /, ''));
        for (const line of Object.values(O.copy)) {
            for (const name of names) expect(line).not.toContain(name);
        }
    });

    test('is spoken from the moment it starts to arrive', () => {
        expect(openingFrame(O.title[0] - 0.01).speak).toBe(false);
        expect(openingFrame(O.title[0]).speak).toBe(true);
    });
});

describe('how long it takes', () => {
    test('is short enough to sit through on a tenth visit, and the calm one is shorter', () => {
        expect(openingLength()).toBeLessThanOrEqual(12);
        expect(openingLength({ calm: true })).toBeLessThan(openingLength());
    });
});

/**
 * THE CAST, AGAINST REAL FORMATIONS. Every play lines up differently and the
 * scene has to end on whichever one is behind the welcome card, so these run
 * the plan against the library's own line-ups rather than an invented one.
 */
const LINEUPS = [
    ['pass2', 'cover2'], ['run1', 'man1'], ['jumbo1', 'cover9'], ['screen1', 'cover4'],
    ['slant2', 'cover12'], ['pass8', 'man1'], ['run3', 'cover12'],
];
const formation = (slug, defense) => {
    const play = createPlay();
    lineUp(play, slug, defense);
    return play.game.objects
        .filter((o) => o.settings.position !== 'ball' && !o.settings.benched)
        .map((o) => {
            const at = simToWorld(o.coords.x, o.coords.y, 0);
            return { position: o.settings.position, team: o.settings.team, x: at.x, z: at.z };
        });
};
const plans = LINEUPS.map(([slug, defense]) => {
    const men = formation(slug, defense);
    return { slug, defense, men, plan: planOpening(men, { aspect: 1.78 }) };
});
const STEP = 1 / 60;

describe('the cast', () => {
    test('everybody in the formation is in it, and ends exactly on his spot', () => {
        for (const { slug, men, plan } of plans) {
            const end = castAt(plan, O.length);
            expect(end.size).toBe(men.length);
            for (const man of men) {
                const at = end.get(man.position);
                expect({ slug, p: man.position, off: Math.hypot(at.x - man.x, at.z - man.z) < 1e-3 })
                    .toEqual({ slug, p: man.position, off: true });
            }
        }
    });

    test('the parts go to the right sides: a visitor gives the shoulder and takes the cooler', () => {
        for (const { men, plan } of plans) {
            const team = (p) => men.find((m) => m.position === p).team;
            expect(team(plan.captain)).toBe(1);
            expect(team(plan.bumper)).toBe(1);
            expect(team(plan.bumped)).toBe(0);
            expect(plan.bumper).not.toBe(plan.captain);
        }
    });

    /**
     * NOBODY WALKS THROUGH ANYBODY. The paths are written one man at a time and
     * crossed everywhere until `bake` kept the bodies apart. Two men may be
     * closer than a body only where they are meant to be: the shoulder, and two
     * formation spots the formation itself put close together.
     */
    test('bodies stay a body apart, except the shoulder and the formation\'s own gaps', () => {
        const body = 1.1;
        for (const { slug, men, plan } of plans) {
            for (let t = 0; t <= O.length; t += STEP) {
                const cast = castAt(plan, t);
                for (let i = 0; i < men.length; i += 1) {
                    for (let j = i + 1; j < men.length; j += 1) {
                        const a = cast.get(men[i].position);
                        const b = cast.get(men[j].position);
                        const d = Math.hypot(a.x - b.x, a.z - b.z);
                        if (d >= body) continue;
                        const names = [men[i].position, men[j].position];
                        const shoulder = names.includes(plan.bumper) && names.includes(plan.bumped)
                            && Math.abs(t - plan.contact) < 0.5;
                        const gap = Math.hypot(men[i].x - men[j].x, men[i].z - men[j].z);
                        const home = t >= O.beats.homeBack[0] && d >= Math.min(body, gap) - 0.05;
                        expect({ slug, names, t: +t.toFixed(2), ok: shoulder || home })
                            .toEqual({ slug, names, t: +t.toFixed(2), ok: true });
                    }
                }
            }
        }
    });

    test('and nobody moves faster than a man that size can run', () => {
        for (const { slug, men, plan } of plans) {
            let last = castAt(plan, 0);
            for (let t = STEP; t <= O.length - O.bake.settle; t += STEP) {
                const cast = castAt(plan, t);
                for (const man of men) {
                    const a = last.get(man.position);
                    const b = cast.get(man.position);
                    const speed = Math.hypot(b.x - a.x, b.z - a.z) / STEP;
                    expect({ slug, p: man.position, fast: speed > O.bake.fastest + 0.5 })
                        .toEqual({ slug, p: man.position, fast: false });
                }
                last = cast;
            }
        }
    });

    test('the shoulder lands while the camera is on it', () => {
        const on = O.keys.filter(([, name]) => name === 'contact').map(([t]) => t);
        for (const { slug, plan } of plans) {
            expect({ slug, from: plan.contact >= Math.min(...on) }).toEqual({ slug, from: true });
            expect({ slug, to: plan.contact <= Math.max(...on) }).toEqual({ slug, to: true });
            // ...and the two of them really are shoulder to shoulder at that moment.
            const cast = castAt(plan, plan.contact);
            const a = cast.get(plan.bumper);
            const b = cast.get(plan.bumped);
            expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(1.45);
        }
    });

    test('the shoulder moves the man who takes it, and he stays moved', () => {
        for (const { slug, plan } of plans) {
            const before = castAt(plan, plan.contact - 0.05).get(plan.bumped);
            const after = castAt(plan, plan.contact + 0.6).get(plan.bumped);
            const later = castAt(plan, O.beats.toLine[0] - 0.1).get(plan.bumped);
            const moved = (a) => Math.hypot(a.x - before.x, a.z - before.z);
            expect({ slug, knocked: moved(after) > O.stage.knock * 0.6 }).toEqual({ slug, knocked: true });
            expect({ slug, held: moved(later) > O.stage.knock * 0.6 }).toEqual({ slug, held: true });
            // ...and he rocks with it.
            expect(Math.abs(castAt(plan, plan.contact + 0.15).get(plan.bumped).pose.roll)).toBeGreaterThan(0.05);
        }
    });

    test('the captain is at the cooler for the swipe and turned to the lens for the point', () => {
        for (const { plan } of plans) {
            const swipe = castAt(plan, plan.hit).get(plan.captain);
            expect(Math.hypot(swipe.x - plan.table.x, swipe.z - plan.table.z)).toBeLessThan(0.3);
            expect(swipe.pose.face).toBeCloseTo(Math.atan2(plan.cooler.x - swipe.x, plan.cooler.z - swipe.z), 3);
            const point = castAt(plan, O.beats.point[1] - 0.2).get(plan.captain);
            expect(point.pose.arms).toBe('point');
            expect(point.pose.face).toBeCloseTo(Math.atan2(plan.lens.x - point.x, plan.lens.z - point.z), 3);
        }
    });

    test('the home team is turned on the visitors when it answers', () => {
        const { men, plan } = plans[0];
        const cast = castAt(plan, (O.beats.menace[0] + O.beats.menace[1]) / 2);
        for (const man of men.filter((m) => m.team === 0)) {
            const at = cast.get(man.position);
            // Facing +z, which is toward the cooler and the men around it.
            expect(Math.cos(at.pose.face)).toBeGreaterThan(0.9);
            expect(at.pose.arms).not.toBe('');
        }
    });

    test('at the end nobody is holding a pose, and every man faces the way his formation does', () => {
        for (const { men, plan } of plans) {
            const end = castAt(plan, O.length);
            for (const man of men) {
                const at = end.get(man.position);
                expect(at.pose.arms).toBe('');
                expect(at.pose.y).toBe(0);
                expect(at.pose.face).toBeCloseTo(man.team === 0 ? Math.PI / 2 : -Math.PI / 2, 6);
            }
        }
    });

    test('the calm version is a tableau: nobody walks and nobody hops', () => {
        const { men } = plans[0];
        const plan = planOpening(men, { aspect: 1.78, calm: true });
        const first = castAt(plan, 0);
        for (let t = 0; t <= O.calm.length; t += 0.1) {
            const cast = castAt(plan, t);
            for (const man of men) {
                const a = first.get(man.position);
                const b = cast.get(man.position);
                expect(Math.hypot(a.x - b.x, a.z - b.z)).toBe(0);
                expect(b.pose.y).toBe(0);
                expect(b.pose.running).toBe(false);
            }
        }
    });

    test('the stands cheer in order, all inside the scene', () => {
        let last = -1;
        for (const c of O.cheers) {
            expect(c.at).toBeGreaterThan(last);
            expect(c.at).toBeLessThan(O.length);
            expect([0, 1]).toContain(c.team);
            last = c.at;
        }
    });
});

describe('the cooler', () => {
    const P = O.props;
    const { men, plan } = plans[0];
    const done = plan.hit + P.tipTime + P.fallTime;

    test('stands on its table until the arm reaches it, and lies on the grass beyond it after', () => {
        const before = propsAt(plan, plan.hit - 0.01);
        expect(before.cooler.tip).toBe(0);
        expect(before.cooler.y).toBeCloseTo(P.table.height + P.cooler.height / 2, 6);
        expect(before.lid).toBeNull();

        const after = propsAt(plan, done + 0.5);
        expect(after.cooler.tip).toBeCloseTo(Math.PI / 2, 6);
        expect(after.cooler.y).toBeCloseTo(P.cooler.radius, 6);
        const out = (after.cooler.x - plan.cooler.x) * plan.tipDir.x + (after.cooler.z - plan.cooler.z) * plan.tipDir.z;
        expect(out).toBeGreaterThan(P.table.width / 2);
    });

    /**
     * THE ARM HAS TO HIT IT. The rig's arms go where a pose puts them, so the
     * swipe is a turn with both arms out, and the arm on his left points where
     * he faces when he is turned a quarter round. At the hit it must point at
     * the cooler, be long enough to reach it, and be travelling the way the
     * cooler then falls.
     */
    test('the arm crosses the cooler at the hit, within reach, moving the way it falls', () => {
        for (const { plan: p } of plans) {
            const captain = castAt(p, p.hit).get(p.captain);
            const yaw = captain.pose.face + captain.pose.spin;
            const arm = { x: Math.cos(yaw), z: -Math.sin(yaw) };
            const to = { x: p.cooler.x - captain.x, z: p.cooler.z - captain.z };
            const far = Math.hypot(to.x, to.z);
            expect((arm.x * to.x + arm.z * to.z) / far).toBeGreaterThan(0.99);
            // The drawn hand settles 1.07m out (measured with real three in
            // xo-opening-drawn), and it has to get past the cooler's near side.
            expect(far - P.cooler.radius).toBeLessThan(1.0);
            expect(captain.pose.arms).toBe('wide');
            // Moving: the arm a moment later has swung toward the tip direction.
            const later = castAt(p, p.hit + 0.02).get(p.captain);
            const y2 = later.pose.face + later.pose.spin;
            const swing = { x: Math.cos(y2) - arm.x, z: -Math.sin(y2) - arm.z };
            expect(swing.x * p.tipDir.x + swing.z * p.tipDir.z).toBeGreaterThan(0);
        }
    });

    test('the swipe turns him and turns him back before he points', () => {
        expect(swipeSpin(O.beats.swipeWind[0] - 0.01)).toBe(0);
        expect(swipeSpin(O.beats.swipeBack[1])).toBe(0);
        expect(swipeSpin(plan.hit)).toBeCloseTo(-Math.PI / 2, 6);
        expect(O.beats.swipeBack[1]).toBeLessThanOrEqual(O.beats.point[0]);
    });

    test('the lid comes off and lands flat on the grass', () => {
        const flying = propsAt(plan, plan.hit + P.lid.at + 0.1).lid;
        expect(flying.y).toBeGreaterThan(P.cooler.lid / 2);
        const landed = propsAt(plan, done + 2).lid;
        expect(landed.y).toBeCloseTo(P.cooler.lid / 2, 6);
        expect(Math.cos(landed.tip)).toBeCloseTo(1, 6);
    });

    test('the water is only in the air after the hit, never under the grass, and not for long', () => {
        const air = (t) => {
            const drops = propsAt(plan, t).splash;
            const up = [];
            for (let i = 0; i < drops.length; i += 3) if (drops[i + 1] > -1) up.push(i);
            return { drops, up };
        };
        expect(air(plan.hit - 0.01).up.length).toBe(0);
        const mid = air(plan.hit + P.tipTime + 0.2);
        expect(mid.up.length).toBeGreaterThan(10);
        const mouth = propsAt(plan, done).cooler;
        for (const i of mid.up) {
            expect(mid.drops[i + 1]).toBeGreaterThanOrEqual(0.03);
            expect(Math.hypot(mid.drops[i] - mouth.x, mid.drops[i + 2] - mouth.z)).toBeLessThan(8);
        }
        const last = plan.hit + P.tipTime * 0.6 + P.splash.over + P.splash.life + 0.01;
        expect(air(last).up.length).toBe(0);
    });

    test('the puddle spreads and never shrinks, and stays out from under the visitors\' feet', () => {
        let size = -1;
        for (let t = plan.hit; t <= O.length; t += 0.05) {
            const p = propsAt(plan, t).puddle;
            expect(p.size).toBeGreaterThanOrEqual(size - 1e-9);
            size = p.size;
        }
        expect(size).toBeCloseTo(1, 6);
        const puddle = propsAt(plan, O.length).puddle;
        const cast = castAt(plan, (O.beats.dance[0] + O.beats.dance[1]) / 2);
        for (const position of plan.dancers) {
            const at = cast.get(position);
            const dx = at.x - puddle.x;
            const dz = at.z - puddle.z;
            const u = dx * plan.tipDir.x + dz * plan.tipDir.z;
            const v = -dx * plan.tipDir.z + dz * plan.tipDir.x;
            const inside = (u / (P.puddle.radius * P.puddle.stretch)) ** 2 + (v / P.puddle.radius) ** 2;
            expect({ position, clear: inside > 1 }).toEqual({ position, clear: true });
        }
    });

    test('nobody walks through the table', () => {
        for (const { slug, men: cast0, plan: p } of plans) {
            for (let t = 0; t <= O.length; t += STEP) {
                const cast = castAt(p, t);
                for (const man of cast0) {
                    const at = cast.get(man.position);
                    // Half a body clear of the edge, until the last blend onto
                    // the formation, by which time the table is on its way out.
                    if (t >= O.length - O.bake.settle) continue;
                    const inX = Math.abs(at.x - p.tableAt.x) < P.table.width / 2 + 0.6;
                    const inZ = Math.abs(at.z - p.tableAt.z) < P.table.depth / 2 + 0.6;
                    expect({ slug, p: man.position, t: +t.toFixed(2), through: inX && inZ })
                        .toEqual({ slug, p: man.position, t: +t.toFixed(2), through: false });
                }
            }
        }
    });

    test('the camera is on it when it goes, on every screen shape', () => {
        const at = shotAt(plan.hit, { aspect: 1.78 });
        for (const aspect of ASPECTS) {
            const shot = shotAt(plan.hit, { aspect });
            for (const t of [plan.hit, done]) {
                const c = propsAt(plan, t).cooler;
                const p = projectPoint(shot, aspect, { x: c.x, y: c.y, z: c.z });
                expect({ aspect, t, inFrame: Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && p.depth > 0 })
                    .toEqual({ aspect, t, inFrame: true });
            }
        }
        expect(at).toBeTruthy();
    });

    test('the calm version is the aftermath, held: over, lid off, puddle out, no water in the air', () => {
        const calm = planOpening(men, { aspect: 1.78, calm: true });
        const a = propsAt(calm, 0);
        const b = propsAt(calm, O.calm.length);
        expect(a.cooler.tip).toBeCloseTo(Math.PI / 2, 6);
        expect(a.lid).not.toBeNull();
        expect(a.puddle.size).toBe(1);
        expect(b.cooler).toEqual(a.cooler);
        for (let i = 1; i < a.splash.length; i += 3) expect(a.splash[i]).toBeLessThan(-1);
    });
});
