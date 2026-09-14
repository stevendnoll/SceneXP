// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * celebration.js - What happens after the two whistles that have no tackle in
 * them.
 *
 * WHY THIS EXISTS. Every other ending in this game is a man being brought down,
 * and `takedown.js` covers it. Two are not. An interception stops the play on
 * the frame the ball is caught (`routes.js` raises `anim.done` right there), and
 * a fifty stops it with the carrier over the line and nobody near enough to
 * touch him. So the best thing and the worst thing that can happen in a game of
 * X's and O's were the two endings where the field simply went still and a card
 * opened over it.
 *
 * MEASURED FIRST, over 4,000 headless pass plays, because two of the three
 * modes below looked unaffordable until they were:
 *
 *   interceptions                3.6% of pass plays, median 16.3m downfield
 *   fifties                      6.7%
 *   the run home from a pick     median 19.8m, which is 2.8 seconds
 *   mates within 8m of the man   median 4, at least one on 99% of picks
 *
 * The run home is short because the field is compressed to 35m (see
 * `config.FIELD`), and it is worth having because it runs TOWARD THE CAMERA:
 * the play camera sits behind the defense's own end zone, so a defense breaking
 * for the house grows in the frame the whole way. And the mob always has a mob.
 *
 * WHAT THE RIG CAN ACTUALLY DO, WHICH IS WHAT EVERY DANCE HERE IS BUILT FROM.
 * `roster.js` says it plainly: the shared figure groups each arm at the shoulder
 * and the legs are bare meshes with no pivot. So the whole vocabulary is arms,
 * whole-body yaw, pitch and roll, a vertical hop, and travel. That rules out a
 * strut and rules in the four dances below, each of which changes the figure's
 * SILHOUETTE rather than its detail, because a player is about 34 pixels tall on
 * a phone and a silhouette is what survives that.
 *
 * PURE, exactly as takedown.js is: given a clock and a plan it returns where
 * each man should be drawn and what his arms are doing. Everything comes back as
 * an OFFSET from where he was standing at the whistle, so a caller holding a
 * REPLAY frame rebuilt from six floats gets the same answer as the live play.
 * view.js does nothing but apply it.
 */
import { EXESNOHS_CONFIG as CFG } from './config.min.js';

/** Ease in, ease out. Every run and every ramp in this file uses it. */
const smooth = (t) => {
    const c = t < 0 ? 0 : (t > 1 ? 1 : t);
    return c * c * (3 - 2 * c);
};
const clamp = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));

/** The three modes, in the order they were asked for. */
export const MODES = ['solo', 'mob', 'house'];
/** ...and the four dances the man with the ball may pull out. */
export const DANCES = ['bow', 'spin', 'point', 'shimmy'];

/**
 * PICK ONE, BY WEIGHT, FROM A PLAIN OBJECT OF THEM.
 *
 * Exported because the weighting is the part worth asserting: a mode with a
 * weight of zero must never come up, which is how a fifty is stopped from
 * sending the offense on a run home to an end zone the scorer is already
 * standing in.
 */
export function weightedPick(weights, roll) {
    const keys = Object.keys(weights).filter((k) => weights[k] > 0);
    if (!keys.length) return '';
    const total = keys.reduce((s, k) => s + weights[k], 0);
    let at = clamp(roll, 0, 0.999999) * total;
    for (const key of keys) {
        at -= weights[key];
        if (at < 0) return key;
    }
    return keys[keys.length - 1];
}

/**
 * WORK OUT WHAT IS ABOUT TO HAPPEN, ONCE, AT THE WHISTLE.
 *
 * DECIDED ONCE AND THEN CARRIED, for the same reason the tackle is: the replay
 * has to end on the celebration the live play ended on. A dance rolled fresh
 * every time it is drawn would give a visitor a different party on the rewatch,
 * and `main.js` already holds `cycle.tackle` for exactly this reason.
 *
 *   hero      { position, x, z } the man holding the ball, in world metres
 *   mates     his team, the same shape, him excluded
 *   rivals    the other team, who watch
 *   homeX     world x of the end zone his team is running at
 *   toward    -1 or +1, the direction of that end zone along x
 *   blameAt   who the hero addresses: the quarterback on a pick, or null
 *   bounds    { minX, maxX, halfZ } nobody may be sent outside
 *   scored    true for a fifty, which has no run home in it
 *   calm      the visitor asked not to be moved about
 *   roll      () => 0..1, injected so a test can pin every choice
 *
 * Returns null when there is nothing to celebrate, which a caller should treat
 * as "carry on as before".
 */
export function chooseCelebration({
    hero, mates = [], rivals = [], homeX = 0, toward = -1,
    blameAt = null, crowdAt = null,
    bounds = null, scored = false, calm = false, roll = Math.random,
} = {}) {
    if (!hero || !hero.position) return null;
    const C = CFG.pose.celebration;
    const lim = bounds || { minX: -Infinity, maxX: Infinity, halfZ: Infinity };

    /**
     * REDUCED MOTION IS NOT A SHORTER PARTY, IT IS A STILL ONE.
     *
     * A spin, a hop and eleven men sprinting at the camera are precisely what
     * somebody who set that preference asked not to see, and trimming the
     * seconds would leave all three in. So the whole thing collapses to the one
     * mode with no travel in it and the one dance with no motion: arms up,
     * held, and the card. The pose still says what happened, which is the part
     * that was missing before any of this existed.
     */
    const mode = calm ? 'solo'
        : weightedPick(scored ? C.scoredWeights : C.weights, roll());
    const dance = calm ? 'bow' : DANCES[Math.floor(clamp(roll(), 0, 0.999999) * DANCES.length)];
    if (!mode) return null;

    // WHERE THE PARTY IS. In a mob it is the man with the ball, standing still.
    // In a run home it is wherever he gets to, because his mates are aiming at
    // a moving target and have to be given the one he will be at.
    const heroTo = mode === 'house'
        ? {
            x: clamp(toward < 0 ? Math.max(homeX, hero.x - C.houseRun)
                : Math.min(homeX, hero.x + C.houseRun), lim.minX, lim.maxX),
            z: clamp(hero.z, -lim.halfZ, lim.halfZ),
        }
        : { x: hero.x, z: hero.z };

    // Who is close enough to be part of it, nearest first. The distance is
    // measured to where the hero IS rather than where he is going, because it
    // is answering "did he see it happen".
    const near = mates
        .map((m) => ({ ...m, gap: Math.hypot(m.x - hero.x, m.z - hero.z) }))
        .sort((a, b) => a.gap - b.gap);
    const joining = mode === 'mob'
        ? near.filter((m) => m.gap <= C.joinWithin).slice(0, C.joinMost)
        : [];
    /**
     * WHERE EACH OF THEM STANDS ON THE RING, AND THEY HAVE TO BE PUSHED APART.
     *
     * Keeping each man's own bearing from the hero is the right instinct: it
     * means nobody crosses anybody's line on the way in. It is not enough. Two
     * defenders converging from the same direction have very nearly the same
     * bearing, so they were sent to very nearly the same point on the ring, and
     * measured over 400 real interceptions the closest pair ended up ZERO
     * metres apart: two men standing inside each other for the whole
     * celebration, with nothing left running to separate them.
     */
    const joiners = spreadRing(joining, heroTo, C);

    const seats = [];

    /**
     * THE MAN WITH THE BALL. He never waits behind anybody, so his delay is
     * zero, and his dance is the one that was rolled.
     *
     * HIS FACE IS THE CHARACTER OF THE WHOLE THING. On a pick he turns and
     * addresses the quarterback who threw it, which is the one beat here that
     * is about the visitor rather than about the defense. With nobody to blame
     * he plays to the crowd instead.
     *
     * EXCEPT IN A RUN HOME, WHERE HE FACES THE WAY HIS TEAM IS FACING. The
     * whole point of that mode is eleven men arriving together, and turning the
     * one worth watching back upfield puts his back to everybody who came to
     * see it. Where the crowd IS is the caller's business, not this file's: it
     * is a fact about where the camera stands.
     */
    const running = { x: heroTo.x + toward * 12, z: heroTo.z };
    const addressing = mode === 'house' ? running : (blameAt || crowdAt || running);
    seats.push({
        who: hero, to: heroTo, delay: 0, dance, faceAt: addressing, lead: true,
    });

    for (let i = 0; i < near.length; i += 1) {
        const mate = near[i];
        let to = { x: mate.x, z: mate.z };
        let faceAt = heroTo;

        if (mode === 'house') {
            /**
             * EVERY MAN RUNS HIS OWN LINE HOME, pulled part of the way toward
             * the hero's.
             *
             * Sending them all at one point would arrive as a pile, because
             * NOTHING SEPARATES BODIES AFTER THE WHISTLE: `play.separate` runs
             * from `tick` and `tick` returns the moment the play is dead. Their
             * own spacing is already correct, so keeping most of it and closing
             * a little reads as a team running together rather than a queue.
             */
            to = {
                x: clamp(toward < 0 ? Math.max(homeX, mate.x - C.houseRun)
                    : Math.min(homeX, mate.x + C.houseRun), lim.minX, lim.maxX),
                z: clamp(mate.z + (heroTo.z - mate.z) * C.houseConverge,
                    -lim.halfZ, lim.halfZ),
            };
            // Facing the way they are all going, which is at the camera.
            faceAt = { x: to.x + toward * 12, z: to.z };
        } else if (joiners.has(mate.position)) {
            // AND A MOB STOPS ON A RING RATHER THAN ON THE MAN, at the bearing
            // `spreadRing` gave him.
            const spot = joiners.get(mate.position);
            to = {
                x: clamp(spot.x, lim.minX, lim.maxX),
                z: clamp(spot.z, -lim.halfZ, lim.halfZ),
            };
        }

        seats.push({
            who: mate,
            to,
            // Staggered, and capped: a whole defense leaving on the same frame
            // is a formation rather than a reaction, and eleven men at 85ms
            // each would spend most of a second just setting off.
            delay: Math.min(i * C.stagger, C.staggerMax),
            // EVERYBODY ELSE PUTS HIS ARMS UP, whatever the hero is doing. Four
            // men each doing a different dance is noise at this size, and a
            // field of raised arms around one man doing something distinctive
            // is the picture.
            dance: 'bow',
            faceAt,
            lead: false,
        });
    }

    /**
     * AND NOW PUSH ANYBODY WHO ENDS UP INSIDE SOMEBODY BACK OUT.
     *
     * `spreadRing` fixes the mob's own crowding and does not fix everything.
     * Measured over 369 real plans, a run home still put a pair 0.15m apart,
     * because the converge pulls men toward one line and two who were already
     * close arrive closer, and a mob still put a joiner on the ring on top of a
     * man who had NOT joined and had therefore not been spread.
     *
     * This is the pass `play.separate` would have done, except that
     * `play.separate` runs from `tick` and `tick` returns the moment the play is
     * dead. A celebration is the only time in this game that men move with
     * nothing keeping them apart, so it keeps them apart itself.
     *
     * THE MAN BEING CELEBRATED DOES NOT GIVE WAY. He is the subject, everybody
     * else came to him, and letting him be shoved off his own mark would move
     * the one figure the shot is composed around.
     */
    relax(seats, lim, C);
    const parts = seats.map((s) => part({ ...s, C }));

    /**
     * AND THE OTHER TEAM WATCHES IT HAPPEN.
     *
     * The emotional other half of the same moment, and it costs one pose: hands
     * to the helmet, a small forward pitch, and he turns to watch the man who
     * took it off him. Without it the offense stands to attention through a
     * celebration aimed squarely at them.
     */
    const slump = rivals
        // Nearest first, so it spreads outward from the man it happened to
        // rather than eleven men folding up on the same frame.
        .map((r) => ({ ...r, gap: Math.hypot(r.x - hero.x, r.z - hero.z) }))
        .sort((a, b) => a.gap - b.gap)
        .map((r, i) => ({
            position: r.position,
            faceAt: heroTo,
            delay: Math.min(i * C.stagger, C.staggerMax),
        }));

    return fit({ mode, dance, hero: hero.position, parts, slump, calm }, C);
}

/**
 * PUT THE MOB ON THE RING WITHOUT ANYBODY STANDING IN ANYBODY.
 *
 * Each man keeps the bearing he already has from the hero, because that is what
 * stops two of them crossing on the way in. Then the bearings are walked in
 * order and each is pushed round until it clears the one before it by a body
 * width, measured as the angle a body subtends at the ring's radius. If the
 * whole set will not fit that way, which needs five men arriving down one
 * corridor, they are simply spaced evenly instead: a ring is a ring.
 *
 * Returns a Map of position -> { x, z }, in world metres.
 */
function spreadRing(joining, at, C) {
    const out = new Map();
    if (!joining.length) return out;

    const r = C.ring;
    // The angle one body takes up on this ring. Two men closer than this are
    // touching, and nothing separates bodies after the whistle.
    const body = Math.min(r * 2, C.body);
    const minGap = 2 * Math.asin(Math.min(1, body / (2 * r)));

    // A PLACEMENT ANGLE, NOT A FACING. `atan2(z, x)` pairs with the `cos, sin`
    // below to put a point on a circle; a facing in this codebase is
    // `atan2(dx, dz)`, because the rig looks down +z. The two are not the same
    // number and neither is used for the other's job.
    const men = joining
        .map((m) => ({ m, a: Math.atan2(m.z - at.z, m.x - at.x) }))
        .sort((p, q) => p.a - q.a);

    // Walk round once, pushing each clear of the one before.
    for (let i = 1; i < men.length; i += 1) {
        const want = men[i - 1].a + minGap;
        if (men[i].a < want) men[i].a = want;
    }
    // ...and the last one has to clear the first one the long way round too.
    const spanFits = men.length < 2
        || (men[men.length - 1].a - men[0].a) <= (Math.PI * 2 - minGap);
    if (!spanFits) {
        const step = (Math.PI * 2) / men.length;
        for (let i = 0; i < men.length; i += 1) men[i].a = men[0].a + i * step;
    }

    for (const { m, a } of men) {
        out.set(m.position, { x: at.x + Math.cos(a) * r, z: at.z + Math.sin(a) * r });
    }
    return out;
}

/**
 * KEEP A BODY'S WIDTH BETWEEN EVERY PAIR OF DESTINATIONS.
 *
 * A handful of relaxation passes, each pushing an overlapping pair apart along
 * the line between them by half the shortfall each. Four is plenty for at most
 * eleven men who start nearly right, and stopping early when nothing moved
 * means the ordinary case costs one comparison sweep.
 *
 * The man with the ball is pinned and his neighbour takes the whole push, which
 * is what `lead` is doing in the weights.
 */
function relax(seats, lim, C) {
    const body = C.body;
    const fence = () => {
        for (const s of seats) {
            s.to = {
                x: clamp(s.to.x, lim.minX, lim.maxX),
                z: clamp(s.to.z, -lim.halfZ, lim.halfZ),
            };
        }
    };
    for (let pass = 0; pass < C.relaxPasses; pass += 1) {
        /**
         * THE TOUCHLINE IS PART OF THE RELAXATION, NOT SOMETHING DONE TO IT
         * AFTERWARDS, AND THAT ORDER IS THE WHOLE FIX.
         *
         * Clamping once at the end undoes the work: two men near the same
         * sideline are both pulled back to the same z, and a pair that had just
         * been pushed a body apart ends up 5cm apart instead. Measured, that
         * was the entire remaining overlap. Clamped first, the next pass sees
         * where they REALLY are and pushes them apart along the touchline
         * rather than through it.
         *
         * It is the same ordering `play.tick` documents for `separate` and
         * `keepInbounds`, arrived at the other way round.
         */
        fence();
        let shoved = false;
        for (let i = 0; i < seats.length; i += 1) {
            for (let j = i + 1; j < seats.length; j += 1) {
                const a = seats[i];
                const b = seats[j];
                let dx = b.to.x - a.to.x;
                let dz = b.to.z - a.to.z;
                let d = Math.hypot(dx, dz);
                if (d >= body) continue;
                // Exactly on top of each other has no line to push along, so
                // one is invented. It cannot be left to chance: a zero vector
                // would divide to NaN and put two men nowhere at all.
                if (d < 1e-6) { dx = 1; dz = 0; d = 1; }
                const push = (body - d) / 2;
                const ux = (dx / d) * push;
                const uz = (dz / d) * push;
                const aw = a.lead ? 0 : (b.lead ? 2 : 1);
                const bw = b.lead ? 0 : (a.lead ? 2 : 1);
                a.to = { x: a.to.x - ux * aw, z: a.to.z - uz * aw };
                b.to = { x: b.to.x + ux * bw, z: b.to.z + uz * bw };
                shoved = true;
            }
        }
        if (!shoved) break;
    }
    // ...and it still has the last word, because the final pass shoved.
    fence();
}

/** One man's part in it, before the whole thing is fitted to the time budget. */
function part({ who, to, delay, dance, faceAt, lead, C }) {
    let dx = to.x - who.x;
    let dz = to.z - who.z;
    const gap = Math.hypot(dx, dz);
    /**
     * A MAN WHO IS GOING NOWHERE DOES NOT GO ANYWHERE, and BOTH the clock and
     * the offset have to say so.
     *
     * Zeroing only the DURATION leaves the distance in, and a part with no
     * duration counts as having arrived, so the distance was applied on the very
     * first frame: an instant sidestep, measured on 38 men out of 400 plans.
     *
     * THE THRESHOLD IS AN EPSILON AND NOT A TOLERANCE, which is the second
     * lesson. It was five centimetres, on the reasoning that a man shuffling
     * three of them should not be charged `travel.min` for it. But `relax`
     * above settles overlaps in nudges of exactly that size, and a tolerance
     * here threw them away: a pair it had just separated snapped back into each
     * other, and the crowding this whole pass exists to fix came back on the
     * cases that needed it most. A man who moves three centimetres may take a
     * third of a second over it.
     */
    const still = gap <= 1e-4;
    if (still) { dx = 0; dz = 0; }
    return {
        position: who.position,
        lead: !!lead,
        dance,
        dx,
        dz,
        from: { x: who.x, z: who.z },
        to: still ? { x: who.x, z: who.z } : to,
        faceAt,
        delay,
        travel: still ? 0 : clamp(gap / C.sprint, C.travel.min, C.travel.max),
    };
}

/**
 * MAKE IT FIT, AND GIVE UP THE DANCE BEFORE THE RUN.
 *
 * `cap` is the agreed budget: a celebration sits between the whistle and the
 * visitor being told what happened, so it may not run as long as the arithmetic
 * would like. Something has to give, and the order matters.
 *
 * THE DANCE GIVES FIRST, down to a floor that is still long enough to see arms
 * go up and a man land once. A run that is cut short strands eleven men in the
 * middle of the field having set off somewhere and not arrived, which reads as
 * the animation breaking; a dance that is shorter simply ends sooner.
 *
 * ONLY THEN DOES THE RUN SPEED UP, proportionally, so everybody still arrives
 * in the order and the spacing they were going to. Nobody is ever stopped
 * short.
 */
function fit(plan, C) {
    const beat = C.beat;
    const arrive = plan.parts.reduce((m, p) => Math.max(m, p.delay + p.travel), 0);
    let danceFor = plan.calm ? Math.max(C.danceFloor, C.dance * 0.6) : C.dance;
    const settle = C.settle;

    let over = (beat + arrive + danceFor + settle) - C.cap;
    if (over > 0) {
        const give = Math.max(0, Math.min(over, danceFor - C.danceFloor));
        danceFor -= give;
        over -= give;
    }
    if (over > 0 && arrive > 0) {
        const room = Math.max(0.1, C.cap - beat - danceFor - settle);
        const scale = room / arrive;
        for (const p of plan.parts) {
            p.delay *= scale;
            p.travel *= scale;
        }
    }

    const last = plan.parts.reduce((m, p) => Math.max(m, p.delay + p.travel), 0);
    /**
     * `danceFor`, NOT `dance`, AND THE NAME IS THE WHOLE POINT.
     *
     * This spread `{ ...plan, dance }` with `dance` holding the SECONDS, over a
     * plan whose `dance` was the NAME of the dance. Nothing threw. The plan
     * came out carrying `dance: 1.55` where `'spin'` had been, and `danceAt`
     * went on reading the duration out of config, so the squeeze above changed
     * the advertised LENGTH of a celebration without changing the animation it
     * was measuring: a run home would have been cut off by the result card
     * partway through its dance, every time.
     */
    return {
        ...plan,
        beat,
        danceFor,
        settle,
        length: beat + last + danceFor + settle,
    };
}

/** How long the whole thing lasts, which is what main.js has to hold the frame
 *  for before it puts a card over the top of it. */
export function celebrationLength(plan) {
    return plan && plan.length > 0 ? plan.length : 0;
}

/**
 * WHERE EVERYBODY IS AT TIME `t`, in seconds since the whistle.
 *
 * Keyed by POSITION, not by object, which is the same choice takedown.js makes
 * and for the same reason: playback rebuilds a frame from six floats per player
 * and stores positions, so a recording can be handed to this and get the answer
 * the live play got.
 *
 *   x, z      metres to add to where he was standing
 *   y         metres off the grass, which is the hop
 *   face      the world angle he should be turned to, or null to leave him
 *   spin      radians to add to that, for the turn
 *   lean      radians of forward pitch
 *   roll      radians of sideways roll, for the shimmy
 *   arms      which hand pose, or '' for none
 *   amount    0 to 1, how far into that pose he is
 *   raised    true when he is holding the ball over his head
 */
export function celebrationAt(t, plan) {
    const out = new Map();
    if (!plan) return out;
    const C = CFG.pose.celebration;
    const now = Math.max(0, t);

    for (const p of plan.parts) {
        const start = plan.beat + p.delay;
        const run = p.travel > 0 ? clamp((now - start) / p.travel, 0, 1) : 1;
        const going = smooth(run);
        // Dancing begins the moment he arrives, so a man who had no distance to
        // cover starts on the beat and one who ran across the field starts when
        // he gets there.
        const since = now - (start + p.travel);
        const step = danceAt(p, Math.max(0, since), plan, C);

        // WHICH WAY HE IS TURNED, and the two halves are different questions.
        // A man running somewhere faces the way he is going; a man who has
        // arrived faces whatever he came to look at.
        const moving = p.travel > 0 && run < 1;
        const face = moving
            ? Math.atan2(p.dx, p.dz)
            : bearing(p.to, p.faceAt);

        out.set(p.position, {
            x: p.dx * going,
            z: p.dz * going,
            y: step.y,
            face,
            spin: step.spin,
            lean: step.lean,
            roll: step.roll,
            arms: since >= 0 ? step.arms : '',
            amount: since >= 0 ? step.amount : 0,
            raised: since >= 0 && step.raised,
            running: moving,
        });
    }

    /**
     * AND THE OTHER TEAM, WHO FOLD UP WHILE EVERYBODY ELSE GOES UP.
     *
     * THIS USED TO BE A SECOND CELEBRATION AND QA SAW IT AS ONE. Hands on the
     * helmet is the picture a person imagines and it is the wrong one to draw:
     * at 34 pixels a hand beside the head and a hand in the air are the same
     * outline, so a defense watching a touchdown appeared to be enjoying it.
     * See `pose.celebration.dejection` for the measurement that settled what to
     * do instead, which is that the ARMS CANNOT CARRY IT: a running arm already
     * hangs lower than any reachable dejected pose, so there is nowhere for
     * them to be thrown.
     *
     * The pitch carries it. A celebrant rises, hops and reaches; these tip
     * forward and get shorter, which is a difference in the SHAPE of the figure
     * rather than in the position of a hand. The shake is the whole body,
     * because the shared rig has no neck joint.
     *
     * `watch` IS A POINT RATHER THAN AN ANGLE, which is the one place this
     * differs from a celebrant. A celebrant's facing can be solved here because
     * this file decided where he would be standing; a man who has not moved is
     * wherever the whistle left him, and only the caller knows that.
     */
    const D = C.dejection;
    for (const s of plan.slump) {
        const since = now - (plan.beat + s.delay);
        const grief = smooth(since / D.sink);
        /**
         * THE SHAKE FILLS WHATEVER IS LEFT, AND IT IS SOLVED PER MAN.
         *
         * Running it for a fixed stretch does not work: a man near the back of
         * the stagger would still be swinging when the plan ended, and the pose
         * is HELD through the settle, so he would freeze turned to one side
         * looking away from everything. So the window is what remains of the
         * celebration after he has finished sinking, and the cycle count is a
         * whole number of that, which is the same rule the spin follows and for
         * the same reason. It also means no two of them shake in unison.
         */
        const from = plan.beat + s.delay + D.sink;
        const window = plan.length - from;
        const shaking = window > 0.4 && !plan.calm;
        const cycles = Math.max(1, Math.round(window * D.shake.hz));
        const swing = shaking ? clamp((now - from) / window, 0, 1) : 0;
        out.set(s.position, {
            x: 0,
            z: 0,
            y: 0,
            face: null,
            watch: s.faceAt,
            // Somebody who asked not to be moved about gets the posture and not
            // the motion, exactly as a celebrant does.
            spin: shaking
                ? D.shake.yaw * Math.sin(Math.PI * 2 * cycles * swing) * grief
                : 0,
            lean: D.lean * grief,
            roll: 0,
            arms: 'slump',
            amount: grief,
            raised: false,
            running: false,
        });
    }

    return out;
}

/** The angle from one world point to another, or null when there is nothing to
 *  look at. `z` first, because the rig faces +z (see view.js `targetFacing`). */
function bearing(at, target) {
    if (!target) return null;
    const dx = target.x - at.x;
    const dz = target.z - at.z;
    if (Math.abs(dx) < 1e-6 && Math.abs(dz) < 1e-6) return null;
    return Math.atan2(dx, dz);
}

/**
 * THE DANCES, AND EVERY ONE OF THEM ENDS WHERE IT STARTED.
 *
 * That is the constraint that shapes all four. The motion stops at `dance` and
 * the pose is then HELD through the settle while the result card opens over it,
 * so a hop that freezes at the top leaves a man hanging in the air and a spin
 * that stops three quarters round leaves him facing the wrong way for the last
 * third of a second. So the hop count and the turn count are whole numbers
 * solved against the duration rather than rates applied to it.
 *
 * `bow`     both arms up in a V, and he bounces. The one everybody reads.
 * `spin`    one arm out and a full turn or two, which is the biggest change of
 *           silhouette available to a figure with no waist.
 * `point`   he turns and points at whoever is responsible, and jabs it twice.
 * `shimmy`  arms out low and the shoulders swing, which the roll axis gives
 *           for free (it is the same axis the juke uses).
 */
function danceAt(p, since, plan, C) {
    // THE FITTED DURATION, NOT THE CONFIGURED ONE. `fit` shortens the dance to
    // keep the whole thing inside `cap`, and a dance drawn against the longer
    // number would still be running when the card opened over it.
    const dur = Math.max(0.01, plan.danceFor);
    // Clamped, so every term below is at its resting value once the dance is
    // over and the pose is simply held through the settle.
    const u = Math.min(since, dur) / dur;
    const amount = smooth(since / C.blend);
    const carrying = p.lead;

    /**
     * AND SOMEBODY WHO ASKED NOT TO BE MOVED ABOUT GETS THE POSE AND NOTHING
     * ELSE.
     *
     * `chooseCelebration` already refuses them the run and the mob, which is
     * the travel. This is the other half: a hop, a spin and a shimmy are all
     * motion for its own sake, and they are exactly what the preference is
     * about. What is left is both arms raised and held, which still says what
     * happened.
     */
    if (plan.calm) {
        return { y: 0, spin: 0, lean: 0, roll: 0, arms: 'up', amount, raised: carrying };
    }

    if (p.dance === 'spin') {
        const turns = C.spin.turns;
        return {
            y: C.hop.height * 0.55 * Math.abs(Math.sin(Math.PI * u)),
            spin: Math.PI * 2 * turns * smooth(u),
            lean: 0,
            roll: 0,
            // THE BALL ARM STAYS TUCKED AND THE OTHER ONE GOES OUT. `carryHold`
            // pins the ball to a fixed point in the rig's own space rather than
            // to the hand, so a carrier who throws that arm wide leaves the ball
            // hanging beside him. It is the same rule `stiffSide` follows.
            arms: 'wide',
            amount,
            raised: false,
        };
    }

    if (p.dance === 'point') {
        // Two jabs, each one a small pitch forward and back. Ends upright.
        const jabs = 2;
        return {
            y: C.hop.height * 0.3 * Math.abs(Math.sin(Math.PI * u)),
            spin: 0,
            lean: 0.13 * Math.sin(Math.PI * 2 * jabs * u) * smooth(since / C.blend),
            roll: 0,
            arms: 'point',
            amount,
            raised: false,
        };
    }

    if (p.dance === 'shimmy') {
        const cycles = Math.max(1, Math.round(dur * C.shimmy.hz));
        return {
            y: C.hop.height * 0.22 * Math.abs(Math.sin(Math.PI * cycles * u)),
            spin: 0,
            lean: 0,
            roll: C.shimmy.roll * Math.sin(Math.PI * 2 * cycles * u) * amount,
            arms: 'low',
            amount,
            raised: false,
        };
    }

    // `bow`, and it is the default on purpose: an unknown dance should still be
    // a celebration rather than a man standing still.
    const hops = Math.max(1, Math.round(dur * C.hop.hz));
    return {
        y: C.hop.height * Math.abs(Math.sin(Math.PI * hops * u)) * amount,
        spin: 0,
        lean: 0,
        roll: 0,
        arms: 'up',
        amount,
        // AND THE BALL GOES UP WITH HIM. Only the man holding it can raise it,
        // and this is the one dance that puts that arm over his head, which is
        // why the other three leave it tucked. See `pose.raise`, which is a
        // fourth carry rather than a special case.
        raised: carrying,
    };
}
