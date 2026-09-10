// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * play.js - The lifecycle of one play: line up, snap, tick, whistle.
 *
 * NOT IN PLANNING'S ORIGINAL MODULE MAP. It was going to live in main.js, but
 * main.js is the orchestrator and this is simulation: it owns the roster of
 * plain objects, hands them to the ported library, and steps them. Keeping it
 * separate keeps it PURE, which means the most interesting logic in the game
 * stays testable with plain numbers (PLANNING D1).
 *
 * NO THREE, NO DOM. view.js reads what this produces and moves meshes to match.
 *
 * THE WHOLE PER-FRAME TICK IS ONE LINE PER PLAYER. The 2D game's loop does
 * exactly this and nothing else, because routes.js drives motion.js internally
 * (55 calls to moveObject alone), so there is no separate physics step to run
 * here. Resisting the urge to add one is the point.
 */
import {
    measurements, containerWidth, containerHeight, formationSettings, SIM,
    EXESNOHS_CONFIG as CFG, UNITS_TO_METRES,
} from './config.min.js';
import { TeamFormationsClass } from './formations.min.js';
import { ObjectAnimationsClass } from './routes.min.js';
import { MotionClass } from './motion.min.js';
import { ExesAndOhsStateClass } from './playstate.min.js';
import { classifyPlay } from './scoring.min.js';

/** How many resolution passes, and how far apart bodies are held. The distance
 *  is config's, in metres, and the simulation works in field units, so this is
 *  the one conversion in the file. */
const SEPARATION = CFG.separationPasses;
const separationUnits = () => CFG.separation / UNITS_TO_METRES;

/** Offense, then defense. Position group drives which route method runs. */
const ROSTER = [
    ['qb', 'qb', 0], ['wr', 'wr1', 0], ['wr', 'wr2', 0], ['wr', 'wr3', 0], ['wr', 'wr4', 0],
    ['x', 'x1', 0], ['x', 'x2', 0], ['x', 'x3', 0], ['x', 'x4', 0], ['x', 'x5', 0], ['x', 'x6', 0],
    ['db', 'db1', 1], ['db', 'db2', 1], ['db', 'db3', 1], ['db', 'db4', 1],
    ['db', 'db5', 1], ['db', 'db6', 1], ['s', 's1', 1], ['s', 's2', 1],
];

/**
 * Every offensive play the library will run, which is all seventeen.
 *
 * IT WAS TEN, ON A MISREADING OF `formationRouteQb`. That switch names ten
 * slugs, and the conclusion drawn was that the other seven "have diagrams but
 * no routes". It has a `default:` that gives the quarterback a full drop-back
 * with boundaries, so the seven run perfectly well: played end to end they
 * produce catches, incompletes and receivers travelling 4 to 22 metres. The
 * named cases are variations on the default, not the only way in.
 */
export const OFFENSIVE_PLAYS = [
    'pass1', 'pass2', 'pass3', 'pass4', 'pass5', 'pass6', 'pass7', 'pass8',
    'run1', 'run2', 'run3',
    'jumbo1', 'jumbo2', 'screen1', 'screen2', 'slant1', 'slant2',
];

/**
 * The object `generateTeamFormationObject` reads while building a player.
 *
 * `window.width` is not the browser's: it is the 2D game's canvas width, and
 * it selects a speed tier (700 and 900 are the thresholds). 1000 picks the
 * fastest tier, which is the same reference canvas the 200-unit scale in
 * config.js was chosen against, so the two assumptions agree.
 *
 * The fonts are vestigial. The 2D renderer drew each player as a letter, and
 * nothing in 3D reads them, but the factory asks for them so they are here.
 */
const factoryState = () => ({
    window: { width: 1000 },
    game: {
        teams: [
            { style: { text: { font: '', fontX: '' } } },
            { style: { text: { font: '' } } },
        ],
    },
});

/**
 * Everything one play needs, wired together.
 *
 * AUDIO IS INJECTED, NEVER IMPORTED. motion.js and routes.js call into an
 * audio object from inside the physics, and audio.js touches Audio and
 * localStorage, so importing it here would drag the DOM into the simulation and
 * break the one rule the architecture rests on (PLANNING D1). main.js passes
 * `simAudio()` in; the default is silence, which is also what the headless
 * gates run with.
 */
export function createPlay(audioObject = null) {
    const playState = new ExesAndOhsStateClass();
    playState.state.measurements = measurements();

    const audio = audioObject
        || { catch: () => {}, collide: () => {}, incomplete: () => {} };
    const motion = new MotionClass(formationSettings(), playState, audio);
    const routes = new ObjectAnimationsClass(formationSettings(), playState, motion, audio);
    const formations = new TeamFormationsClass(formationSettings(), routes, playState);

    // BOTH OBJECTS NEED THE CONTAINER, and missing one is silent.
    //
    // The 2D game sets it on `animations` AND `formations`
    // (exes-and-ohs.class.tsx:978 and :980). Only formations was wired up here
    // at first, so routes.state.container sat at its constructed zeroes: width
    // 0, height 0, centre 0. Every route that steers toward
    // `container.y` for the middle of the field was steering at the sideline,
    // and every boundary derived from `container.width` was nonsense.
    //
    // It does not throw and it does not look broken in an obvious way. It
    // looks like 39% of receivers deciding to run the wrong way, which is a
    // very long way from "an initialiser is missing".
    //
    // Note the two implementations differ and that is faithful to the source:
    // formations puts the cross-field centre at (height - gutterY * 5) / 2,
    // routes puts it at height / 2.
    for (const target of [routes, formations]) {
        target.setContainerDimensions(
            containerHeight(), containerWidth(), SIM.gutter, SIM.gutter
        );
    }

    return {
        playState, motion, routes, formations,
        game: { objects: [], throwTo: '', runForYourLife: false, ...factoryState().game },
        frame: 0,
        live: false,
    };
}

/**
 * Line both teams up.
 *
 * Pass no defensive formation and the library picks one at random, which is
 * the 2D game's default and the behaviour the playbook screen will expose at
 * M3.
 */
export function lineUp(play, offensive = 'pass2', defensive = '') {
    const st = factoryState();
    st.game = play.game;
    play.game.objects = ROSTER.map(([group, position, team], i) =>
        play.formations.generateTeamFormationObject(st, team, i, group, position));

    play.formations.setTeamFormation(play.game.objects, 0, offensive);
    play.formations.setTeamFormation(play.game.objects, 1, defensive);

    // WHO IS BENCHED IS DECIDED HERE, ONCE, AND REMEMBERED.
    //
    // The library parks a player who is not in this formation at y = -1e4, or
    // at (-100, -50) when there is no formation at all. It then keeps running
    // their route anyway, so they DRIFT: over a seven second play a benched
    // lineman travels about a thousand units back toward the field.
    //
    // That is harmless in 2D, where they were simply never drawn. In 3D a
    // view that decides "is this player benched" by testing how far away they
    // are would watch them cross the threshold and pop into the stands
    // mid-play. So the answer is recorded at line-up, when it is unambiguous,
    // and never inferred from a coordinate again.
    for (const obj of play.game.objects) {
        obj.settings.benched = obj.coords.y <= -9000 || obj.coords.x <= -9000
            || (obj.coords.x === -100 && obj.coords.y === -50);
    }
    play.game.throwTo = '';
    play.game.runForYourLife = false;
    play.frame = 0;
    play.live = false;

    // RESET THE SIMULATION'S OWN END-OF-PLAY FLAGS TOO. They live on playState,
    // not on `game`, so clearing the game object alone leaves `anim.done` set
    // from the previous whistle and the next play finishes on frame one.
    const sim = play.playState.state;
    sim.anim.done = false;
    sim.anim.run50 = false;
    sim.tackled = false;
    sim.result = '';
    sim.ball = { caught: false, position: 'qb', team: 0 };

    // AND SETTLE THE FORMATION BEFORE ANYBODY SEES IT. The library places both
    // teams by their own designed spacing, which was tuned for a life-size
    // figure, so at this figure scale ten of fourteen players began the play
    // inside their nearest neighbour. Nothing pushes before the snap, so
    // without this the crowd is exactly what the pre-snap frame shows.
    separate(play, separationUnits(), SEPARATION.lineUp);
    keepInbounds(play);
    return play.game.objects;
}

/** Snap it. From here the routes run themselves. */
export function snap(play) {
    play.live = true;
    play.frame = 0;
}

/**
 * One frame.
 *
 * This is the entire game loop, and it is the 2D game's loop verbatim: ask
 * each object to run its route, and let routes.js do the moving. There is no
 * separate physics pass because motion.js is called from inside the routes.
 */
export function tick(play) {
    if (!play.live) return;
    play.frame += 1;
    for (const obj of play.game.objects) {
        // BENCHED PLAYERS DO NOT TICK.
        //
        // They are not in this formation, so animating them was never doing
        // anything useful, and it was doing two harmful things. It drifted them
        // roughly a thousand units back toward the field over a play, and it
        // crashed: db5's case in setObjectFormationPosition is commented out,
        // so it never receives a route, and the first time a play went to
        // `runForYourLife` or completed a catch, clearBoundaries dereferenced
        // `route.boundaries` on null.
        //
        // The ball is not a rostered player and carries no `benched` flag, so
        // it still ticks, which is what makes its arc run.
        if (obj.settings && obj.settings.benched) continue;
        if (obj.anim === 'formation') play.routes.runFormation(obj, play.game);
        else if (obj.anim === 'run-around') play.routes.runAround(obj, play.game);
    }

    // AFTER EVERYONE HAS MOVED, NOT INSIDE ONE PLAYER'S STEP. The ported model
    // damps speed on a collision and never resolves the overlap, so this is the
    // half that keeps bodies out of each other. Running it per player would let
    // whoever moved last be the only one who ends up where he asked.
    separate(play, separationUnits(), SEPARATION.live);
    // AND THE TOUCHLINE IS THE LAST WORD, after the shove rather than before
    // it: separation can push a man off the edge of the field, so a clamp that
    // ran first would be undone by it on the same frame.
    keepInbounds(play);
    // AND LAST OF ALL, a receiver who has run out of route stops running in
    // circles. It reads the position AFTER the shove and the clamp, because
    // those move him too and a man being shoved is not a man who has arrived.
    settleArrived(play);
}

/**
 * A RECEIVER WHO HAS FINISHED HIS ROUTE STOPS. QA ITEM 3.
 *
 * WHAT HE WAS DOING INSTEAD, MEASURED. Every route in the ported library
 * steers by comparing a coordinate to a target and accelerating one way or the
 * other. There is no deadzone and nothing ever decelerates, so arriving means
 * overshooting, being accelerated back, and overshooting again. Traced frame
 * by frame, jumbo2's wr1 orbits a 0.4m circle at 6 m/s with a 27 frame period
 * and never leaves it. Across the 17 plays, 38 of 61 receivers spend the last
 * second turning through more than 180 degrees while covering under 1.5m, and
 * the worst turns 4,355 degrees in one second. That is QA's "spins around in a
 * circle while standing in one place", and it is not an animation fault: the
 * simulation genuinely runs him round in a circle.
 *
 * IT CAPS HIS SPEED RATHER THAN STOPPING HIM, and that is the whole design.
 * The radius of that orbit is v squared over twice the acceleration, so
 * holding him to a tenth of his top speed shrinks it a hundredfold, to a few
 * millimetres, which is a man standing still. But a receiver who genuinely has
 * somewhere to be still travels at the capped speed, covers more than `net`
 * within one window, and is released with nothing having to know his route.
 * Nothing is frozen and nobody is exempted by name, so the worst a false
 * reading can do is make a man jog for half a second.
 *
 * ZEROING THE SPEED WAS TRIED AND IS WORSE. This runs after the routes have
 * already moved everybody, so a zeroed speed only affects the next frame, and
 * the route re-accelerates from zero every single frame: he jitters at one
 * acceleration step per frame forever and the release test can never fire,
 * because a frozen man never covers any ground.
 *
 * IT LIVES HERE, like `separate` and `keepInbounds`, rather than in motion.js,
 * which is a port and stays one.
 */
export function settleArrived(play) {
    const S = CFG.settle;
    const window = Math.max(1, Math.round(CFG.simHz * S.window));
    const net = S.net / UNITS_TO_METRES;
    const st = play.playState.state;
    // ONCE THE BALL IS LOOSE NOBODY IS RUNNING A ROUTE ANY MORE. A catch or a
    // quarterback taking off turns every receiver into a blocker, and the
    // library's own route code tests the same two flags to decide it.
    const loose = play.game.runForYourLife === true
        || !!(st.ball && st.ball.caught);
    let held = 0;

    for (const obj of play.game.objects) {
        if (!obj.settings || obj.settings.benched) continue;
        if (obj.settings.positionGroup !== 'wr') continue;
        const s = obj.state;

        // The man the ball is on its way to has somewhere to be, and so does
        // anybody carrying it. Both drop their history, so a receiver who is
        // thrown at while settled starts the test again from scratch rather
        // than from where he was standing.
        if (loose || s.hasBall || play.game.throwTo === obj.settings.position) {
            s.arrival = null;
            continue;
        }

        if (!s.arrival) s.arrival = [];
        s.arrival.push(obj.coords.x, obj.coords.y);
        while (s.arrival.length > (window + 1) * 2) s.arrival.splice(0, 2);
        if (s.arrival.length <= window * 2) continue;

        const moved = Math.hypot(
            obj.coords.x - s.arrival[0], obj.coords.y - s.arrival[1]
        );
        if (moved >= net) continue;

        const cap = S.speed * obj.physics.maxSpeed;
        if (Math.abs(s.xSpeed) > cap) s.xSpeed = Math.sign(s.xSpeed) * cap;
        if (Math.abs(s.ySpeed) > cap) s.ySpeed = Math.sign(s.ySpeed) * cap;
        held += 1;
    }
    return held;
}

/**
 * KEEP BODIES OUT OF EACH OTHER. THE ONE THING THE PORTED MODEL DOES NOT DO.
 *
 * `motion.checkCollisions` detects an overlap and responds by DAMPING SPEED:
 * it multiplies `xSpeed` by 0.2, or nudges an opponent along by one frame's
 * travel. It never resolves the overlap it just found, and the route that
 * owns the player re-accelerates him at his target on the very next frame, so
 * two figures settle happily inside one another. Measured over 400 plays,
 * players reached 0.01m apart at every collision radius from 0.46m to 1.5m,
 * which is what proves the radius was never the lever: widening a box that
 * only damps speed detects the same overlap earlier and still permits it.
 *
 * So this is a SEPARATION PASS, run once after every object has moved. Any two
 * players closer than `minSeparation` are pushed apart along the line between
 * them, half the shortfall each. It is the standard resolution step and it is
 * the only piece of physics in this project that the 2D game did not have.
 *
 * IT LIVES HERE RATHER THAN IN motion.js, which is a port. It also has to run
 * after the whole roster has moved rather than inside one player's step, or
 * the last player to move would be the only one who ends up where he asked.
 *
 * THE SEPARATION MUST STAY SMALLER THAN THE COLLISION BOXES, and that is not a
 * detail. A tackle fires when a carrier's box overlaps a tackler's, so pushing
 * bodies further apart than the boxes reach would mean nobody could ever be
 * brought down and no play would ever end. The pad in `collisionScale`'s
 * sibling exists to keep that margin: at a 0.35m pad two receivers still
 * detect each other 1.62m apart while their bodies are held 1.5m apart.
 */
export function separate(play, minSeparation, passes = 2) {
    if (!(minSeparation > 0)) return 0;
    const on = play.game.objects.filter((o) => !o.settings.benched
        && o.settings.position !== 'ball' && o.settings.type !== 'ball');
    let moved = 0;

    /**
     * THE MAN THE BALL WAS THROWN AT IS EXEMPT WHILE IT IS IN THE AIR.
     *
     * A throw aims at where the receiver is PROJECTED to be, and the catch is
     * tested against the ball reaching that point. Anything that moves him
     * afterwards is aiming the pass at a place he no longer runs through, and
     * separation moves him every frame. Measured, that alone took completions
     * from 41% to 33%: not a physics problem, a bookkeeping one, because the
     * ball was thrown before the shove existed.
     *
     * It ends the moment somebody catches it, at which point he is the carrier
     * and the carrier rules above take over.
     */
    const chasing = play.game.throwTo
        && !(play.playState.state.ball && play.playState.state.ball.caught)
        ? play.game.throwTo : '';

    // MORE THAN ONE PASS, because every route re-accelerates its player at his
    // target on the next frame and pushes straight back in. A single
    // half-shortfall resolution reaches equilibrium well short of what it asked
    // for: measured, one pass held bodies 0.86m apart against a 1.5m request,
    // and two reach 1.4m. Three buys almost nothing over two.
    for (let pass = 0; pass < passes; pass += 1) {
        for (let i = 0; i < on.length; i += 1) {
            for (let j = i + 1; j < on.length; j += 1) {
                const a = on[i];
                const b = on[j];

                // A TACKLE IS CONTACT, AND CONTACT IS THE POINT OF IT.
                //
                // Holding a defender off the ball carrier does not read as good
                // blocking, it reads as the play never ending: the ported model
                // counts `state.tackle` up over consecutive frames of box
                // overlap, so a tackler shoved out every frame never
                // accumulates one.
                //
                // ONLY AGAINST OPPONENTS, and that limit was measured rather
                // than assumed. Exempting the carrier from his OWN side too
                // sounded right, on the grounds that a runner should not be
                // jostled by his blockers, and it was worse on every count: the
                // quarterback ended up standing inside his own line before the
                // snap, bodies reached 0.03m during a play, and MORE plays ran
                // out the backstop rather than fewer.
                if (a.settings.team !== b.settings.team
                    && (a.state.hasBall || b.state.hasBall)) continue;
                if (chasing && (a.settings.position === chasing
                    || b.settings.position === chasing)) continue;

                let dx = b.coords.x - a.coords.x;
                let dy = b.coords.y - a.coords.y;
                let d = Math.hypot(dx, dy);
                if (d >= minSeparation) continue;

                // Exactly coincident happens: cover12 puts db2 and db3 on the
                // same spot against run3. A zero vector has no direction to
                // push along, so pick one rather than dividing by zero and
                // sending both to NaN, which would take the play with it.
                if (d < 1e-6) { dx = 1; dy = 0; d = 1; }

                const push = (minSeparation - d) / 2;
                const ux = (dx / d) * push;
                const uy = (dy / d) * push;
                a.coords.x -= ux; a.coords.y -= uy;
                b.coords.x += ux; b.coords.y += uy;
                moved += 1;
            }
        }
    }
    return moved;
}

/**
 * KEEP EVERYBODY ON THE FIELD.
 *
 * QA ITEM 4 REPORTED THE QUARTERBACK STEPPING OUT OF BOUNDS ON A DROP-BACK, and
 * he is simply the one anybody watches. Measured over 190 plays, EVERY position
 * group leaves the field: quarterbacks on 0.71% of frames, receivers on 0.86,
 * the line on 1.00 and the secondary on 1.04, with a worst case of 14.53m
 * against a touchline at 10.50 and a sideline strip that runs out at 12.05. So
 * roughly one frame in a hundred has somebody standing in the crowd.
 *
 * THE ROUTES ARE NOT WRONG, THEY ARE UNBOUNDED. Several formations hand a
 * player a boundary at `height - gutterY`, which is the touchline itself, and
 * the ported motion model overshoots a target it is accelerating toward. There
 * is nothing anywhere that says the field has edges.
 *
 * So this says it, in the one place a positional constraint belongs: after
 * everybody has moved, exactly like `separate`. The cross-field axis only,
 * because nobody has ever come close to the ends. `ySpeed` is zeroed with the
 * position, or the model keeps accelerating into the paint and the player
 * sticks there and then leaves like a slingshot when his route turns him round.
 *
 * IT IS A WALL AND NOT A RULE. In real football a ball carrier who steps out is
 * down at that spot, and adding that would change how plays end and what they
 * score, which is a bigger decision than a fix for a drop-back. Recorded as an
 * open question rather than smuggled in here.
 */
export function keepInbounds(play) {
    const height = play.playState.state.measurements.height;
    if (!(height > 0)) return 0;
    /**
     * THE WALL HOLDS A BODY, NOT A COORDINATE, AND IT DID NOT BEFORE.
     *
     * The clamp works exactly as written: measured over 17 plays against three
     * defences, nobody's centre ever crosses the touchline and plenty of them
     * reach it to the centimetre. That is the fault. A figure is 1.45m across
     * at `figureScale`, so a man pinned to the paint has three quarters of a
     * metre of himself, and all of his shadow, out past the line, and a
     * quarterback backpedalling into it parks there with half his body over the
     * side. QA reported it as the quarterback escaping the boundary, and he had
     * not: the boundary simply never knew how wide he was.
     *
     * Same lesson as `collisionScale` and the catch box (see config): a number
     * tuned against a letterform on a canvas is not a number about a person.
     * Half a shoulder width, in field units, from the one factor that says how
     * big a figure is drawn.
     */
    const body = (SIM.bodyWidth * CFG.figureScale / 2) / UNITS_TO_METRES;
    const lo = Math.min(body, height / 2);
    const hi = Math.max(height - body, height / 2);
    let moved = 0;
    for (const obj of play.game.objects) {
        if (!obj.settings || obj.settings.benched) continue;
        if (obj.settings.position === 'ball' || obj.settings.type === 'ball') continue;
        if (obj.coords.y < lo) {
            obj.coords.y = lo;
            if (obj.state) obj.state.ySpeed = 0;
            moved += 1;
        } else if (obj.coords.y > hi) {
            obj.coords.y = hi;
            if (obj.state) obj.state.ySpeed = 0;
            moved += 1;
        }
    }
    return moved;
}

/** The carrier, for the camera and for scoring. Null before the snap. */
export function ballCarrier(play) {
    return play.game.objects.find((o) => o.state && o.state.hasBall) || null;
}

/** Has the simulation blown the whistle? The ported routes raise this
 *  themselves on a catch, a drop, a tackle or a crossing, so the game does not
 *  need to work out when a play is over: it needs to notice. */
export function isDone(play) {
    return play.playState.state.anim.done === true;
}

/**
 * Throw to a receiver.
 *
 * Ported from throwBallTo in exes-and-ohs.class.tsx: refuse a second throw,
 * refuse a benched target, name the target, build the ball as a real object in
 * the world, and take it out of the quarterback's hands. The ball then runs its
 * own route like any other object, which is why `getZIndex` is its arc.
 *
 * Returns false when the throw was not legal, so the caller can leave the
 * button enabled rather than pretending something happened.
 */
export function throwTo(play, position) {
    const game = play.game;
    if (game.throwTo || game.runForYourLife) return false;

    const target = play.routes.getObjectByPosition(game.objects, position);
    if (!target || target.settings.benched) return false;
    if (target.settings.route && target.settings.route.type === 'bench') return false;

    game.throwTo = position;
    const ballObj = play.formations.generateBallObject({ ...factoryState(), game }, play.routes);
    if (ballObj) game.objects.push(ballObj);

    const qb = play.routes.getObjectByPosition(game.objects, 'qb');
    if (qb) qb.state.hasBall = false;
    return true;
}

/** Keep it and run. The quarterback's own route takes over from here. */
export function keepAndRun(play) {
    if (play.game.throwTo || play.game.runForYourLife) return false;
    const qb = play.routes.getObjectByPosition(play.game.objects, 'qb');
    if (qb) qb.state.run = true;
    play.game.runForYourLife = true;
    return true;
}

/** Which receivers can actually be thrown to on this play. Benched players are
 *  on the roster and must never appear as a target. */
export function eligibleReceivers(play) {
    return ['wr1', 'wr2', 'wr3', 'wr4'].filter((pos) => {
        const o = play.routes.getObjectByPosition(play.game.objects, pos);
        return !!o && !o.settings.benched
            && !(o.settings.route && o.settings.route.type === 'bench');
    });
}

/**
 * What just happened, and what it was worth.
 *
 * Gathers the five facts scoring.js needs and hands them over. The carrier is
 * whoever the ball ended up with: the receiver named in `ball.position` on a
 * catch, the quarterback on a run.
 */
export function outcome(play) {
    const st = play.playState.state;
    const game = play.game;
    const carrierPos = game.runForYourLife ? 'qb' : (st.ball && st.ball.position);
    const carrier = carrierPos
        ? play.routes.getObjectByPosition(game.objects, carrierPos) : null;
    return classifyPlay({
        ranWithBall: !!game.runForYourLife,
        threwTo: game.throwTo || '',
        ball: st.ball,
        carrierX: carrier ? carrier.coords.x : 0,
        lineInterval: st.measurements.lineInterval,
        reached50: st.anim.run50 === true,
    });
}
