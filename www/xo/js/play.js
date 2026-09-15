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
    XO_CONFIG as CFG, UNITS_TO_METRES,
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

/** The ball is a member of the object list like anybody else, and four separate
 *  places have to tell it apart from a person. Asked once, here, because the
 *  library writes the answer in two fields and a caller that checks only one of
 *  them is a caller that treats the ball as a player. */
const isBall = (obj) => !!obj && !!obj.settings
    && (obj.settings.position === 'ball' || obj.settings.type === 'ball');

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
        /** Did the play clock run out on this one? See `tick`. */
        expired: false,
    };
}

/**
 * HOW HARD THE GAME IS LEANING, FROM -1 TO +1.
 *
 * Set before a line-up, because the lean is applied where every player's random
 * speed and acceleration are rolled, and that happens once per line-up. Setting
 * it mid-play would do nothing at all, which is worth saying out loud: this is
 * a dial on the NEXT play, not on this one.
 *
 * It is written onto the settings object the ported formations class was
 * constructed with, which is the same route `collisionScale` takes.
 */
export function setDifficulty(play, value) {
    const lean = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
    if (play.formations && play.formations.settings) {
        play.formations.settings.difficulty = lean;
    }
    return lean;
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
    // WHAT WAS ACTUALLY LINED UP, for the usage log. An empty `defensive` is the
    // library's own signal to roll one, and the roll is only knowable here: the
    // library keeps the last formation it set on its state, and the defense is
    // set second.
    play.offense = offensive;
    play.defense = (play.formations.state && play.formations.state.formation) || defensive || '';

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
    play.expired = false;

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
    landLeaps(play);
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
        /**
         * ...AND NEITHER DOES A BALL SOMEBODY IS ALREADY HOLDING.
         *
         * THE 2D GAME DELETES IT. `runObjectAnimations` splices the ball out of
         * the object list on the first frame `ball.caught` goes true, and that
         * one line was not ported. So the ball went on flying to wherever it
         * had been aimed and then lay there for the rest of the play, with
         * `moveBallObject` asking `checkCatch` about it on every frame.
         *
         * WHICH MEANS ANYBODY COULD CATCH IT AGAIN, INCLUDING THE OTHER TEAM.
         * `handleCatchResult` does not care that the ball already belongs to
         * somebody: it writes `ball.team = 1` and raises the whistle. A
         * defender crossing the spot where the pass was aimed, seconds after a
         * receiver caught it thirty metres away, scored an interception, and
         * because the receiver's own `hasBall` is never lowered he was still
         * drawn carrying it while the card said the Crows had taken it away.
         * Reported from a screenshot showing exactly that, and measured at one
         * play in 816 and one in 1632 over two headless sweeps.
         *
         * Stopping it rather than deleting it, because the 3D game keeps the
         * object: `showBall` draws the ball at the carrier when anybody has
         * `hasBall` and falls back to this one, and the recording expects a
         * stable roster. Stopped, it is exactly what `showBall` already
         * documents, a ball that "stops where it was caught".
         */
        if (isBall(obj) && play.playState.state.ball
            && play.playState.state.ball.caught) continue;
        if (obj.anim === 'formation') play.routes.runFormation(obj, play.game);
        else if (obj.anim === 'run-around') play.routes.runAround(obj, play.game);
    }

    // AFTER EVERYONE HAS MOVED, NOT INSIDE ONE PLAYER'S STEP. The ported model
    // damps speed on a collision and never resolves the overlap, so this is the
    // half that keeps bodies out of each other. Running it per player would let
    // whoever moved last be the only one who ends up where he asked.
    //
    /**
     * ...AND NOT ON THE FRAME THE WHISTLE GOES, WHICH COST A TOUCHDOWN.
     *
     * THE SHOVE IS THE PORT'S, NOT THE GAME'S. The 2D game has no separation
     * pass at all: it never needed one, because its players were letterforms
     * rather than bodies 2.2 times life size. So this is the one thing in the
     * frame that can move a man AFTER his own route has finished with him.
     *
     * THE LADDER IS READ OFF A COORDINATE, and the routes raise the whistle by
     * comparing that same coordinate to a rung. `runWrFormation` and
     * `runQbFormation` both end the play the instant the carrier is at or past
     * `-4 + lineInterval * 4`, and `scoring.pointsForPosition` then awards 50
     * for being at or past exactly that number. Those two agreed until a
     * defender leaning on the carrier pushed him four centimetres back over the
     * line between the whistle and the scoring, at which point the play ended
     * at the goal line, no tackle, the carrier at full speed, and the card said
     * "+30". Measured at one crossing in 149 for the quarterback and one in 103
     * for a receiver.
     *
     * So the whistle is the last word on where everybody is. The touchline
     * clamp below still runs, because a body half over the paint is a thing a
     * visitor can see and the clamp cannot move anybody across a rung.
     */
    if (!isDone(play)) separate(play, separationUnits(), SEPARATION.live);
    // AND THE TOUCHLINE IS THE LAST WORD, after the shove rather than before
    // it: separation can push a man off the edge of the field, so a clamp that
    // ran first would be undone by it on the same frame.
    keepInbounds(play);
    // AND LAST OF ALL, a receiver who has run out of route stops running in
    // circles. It reads the position AFTER the shove and the clamp, because
    // those move him too and a man being shoved is not a man who has arrived.
    settleArrived(play);
    // AND WHOEVER HAS HAD SOMEBODY HANGING ON HIM LONG ENOUGH GETS OUT OF IT.
    // Also after the shove, because the shove is what decides how far apart two
    // men actually are this frame, and that is the whole question here.
    breakContact(play, 1 / CFG.simHz);
    // ...and once everybody has finished being moved, record where each of them
    // is actually going, which is what a pass is led off. It has to be the last
    // thing in the frame for the same reason `settleArrived` is late: separate
    // and keepInbounds move people, and a heading measured before them is a
    // heading for a journey the player did not take.
    markHeading(play);

    // OUT OF TIME IS A WHISTLE LIKE ANY OTHER. See `decisionLeft`: a play that
    // reaches zero with nobody having thrown it or run with it is a sack, and
    // `classifyPlay` already says exactly that without being told.
    if (outOfTime(play)) {
        play.playState.state.anim.done = true;
        /**
         * AND IT IS REMEMBERED, BECAUSE THE BOARD STOPPED ON ONE.
         *
         * `decisionLeft` returns null for a finished play, which is right for
         * every other ending and wrong for this one: the whistle is raised on
         * the same simulation step that reaches zero, so by the time main.js
         * asks, the play is already over and the answer is "nothing to say".
         * The board keeps the last number it painted and the countdown reads
         * 10 9 8 7 6 5 4 3 2 1 and stops, which is a play clock that never
         * reaches zero. Reported exactly that way.
         *
         * A flag rather than a special case inside `decisionLeft`, because the
         * clock genuinely has stopped: this says what it stopped ON.
         */
        play.expired = true;
    }

    // AND THE WHISTLE DROPS EVERY POSE, on the frame it blows rather than
    // whenever somebody next asks. Both halves matter: `tackled` is a carrier
    // going down mid-stiff-arm, which is the one QA watched keep his arm out,
    // and `isDone` is every other way a play can end. See `clearEscapes` for why
    // the escape's own clock cannot do this.
    if (isDone(play) || play.playState.state.tackled) clearEscapes(play);
}

/**
 * HAS THE VISITOR DECIDED YET? The clock times HIM, not the play.
 *
 * It stops the moment the ball is thrown or the quarterback tucks it and runs,
 * because after that there is no further input to wait for: the rest is the
 * play happening. That is why a twenty-metre run does not run the clock out.
 */
export function undecided(play) {
    return !play.game.throwTo && !play.game.runForYourLife;
}

/**
 * SECONDS LEFT ON THE PLAY CLOCK, or null once he has decided.
 *
 * Null rather than zero, deliberately: zero is a real value that means OUT OF
 * TIME, and a HUD that cannot tell the two apart would flash a red nought over
 * every completed pass. Null means "this clock has nothing left to say".
 */
export function decisionLeft(play) {
    // A finished play has no clock. `live` is lowered by main.js on the next
    // frame rather than by the whistle itself, so without the `isDone` test this
    // reads a flat 0 for a frame after a sack, which is a red nought flashed
    // over a result that has already been decided.
    if (!play.live || isDone(play) || !undecided(play)) return null;
    const spent = play.frame / CFG.simHz;
    const left = CFG.clock.decide - spent;
    return left > 0 ? left : 0;
}

/**
 * WHAT A SCOREBOARD SHOULD READ, which is not always what the clock says.
 *
 * `left` is `decisionLeft`, `shown` is the number the board is already
 * carrying, and `expired` is `play.expired`. The three cases are the three
 * things a play clock does:
 *
 *   counting     round UP, so a tenth of a second left still reads one
 *   stopped      hold the number it stopped on, the way a real board does
 *   ran out      zero, because that is what it ran out AT
 *
 * PURE, AND HERE RATHER THAN IN main.js, because the third case is the one
 * that was wrong for the life of the game and a rule that lives in a render
 * loop cannot be asserted. See `tick` for how the whistle and the zero arrive
 * on the same simulation step.
 */
export function clockReading(left, shown, expired) {
    if (left !== null && left !== undefined) return Math.max(0, Math.ceil(left));
    return expired ? 0 : shown;
}

/** ...and the whistle itself. Separated so the HUD and the rule cannot drift:
 *  the number the visitor watches reach zero is the number that ends the play. */
export function outOfTime(play) {
    return play.live && undecided(play) && decisionLeft(play) === 0;
}

/**
 * WHAT A BREAK DOES TO A MAN'S SPEED, ON EVERY FRAME OF ITS GRACE.
 *
 * Re-asserted rather than struck once, because his route re-derives his velocity
 * every frame and would otherwise wipe the move out within five (see the note in
 * `breakContact`). The envelope eases to nothing across the grace, so he finishes
 * the move travelling on his route again rather than snapping back onto it.
 *
 * A JUKE IS SIDEWAYS AND A STIFF-ARM IS FORWARD, which is the difference between
 * changing your line and holding it.
 */
function driveEscape(obj, escape, E) {
    const s = obj.state;
    const top = obj.physics.maxSpeed;
    // 1 at the moment of the break, 0 at the end of it, smooth at both ends.
    const envelope = Math.cos(Math.min(1, escape.at / E.grace) * (Math.PI / 2));
    if (escape.kind !== 'shove') {
        /**
         * FORWARD ONLY, AND NOTHING IS ADDED TO HIS LATERAL SPEED.
         *
         * AN EARLIER VERSION DID `s.ySpeed +=` HERE and it was a bad bug rather
         * than a bad number. This runs on EVERY frame of the grace, so a `+=`
         * accumulates: thirty-six frames of a quarter of top speed compounded to
         * roughly six times his maximum, and carriers were flung off the field
         * sideways. Measured, it took fifty-point plays from 1.8% of throws to
         * ZERO and the mean play from 12.16 points to 8.63.
         *
         * A stiff-arm is a man HOLDING HIS LINE through contact, so holding his
         * line is all it does. `Math.max` cannot slow him down either, which
         * matters because his own route is usually asking for more than this.
         */
        s.xSpeed = Math.max(s.xSpeed, top * E.drive * envelope);
    } else {
        // A SHOVE moves him off his line, so this one is an assignment. Clamped
        // to his own top speed for the same reason: nothing here may make a man
        // faster than he is.
        const want = escape.away * top * E.shove * envelope;
        s.ySpeed = Math.max(-top, Math.min(top, want));
    }
}

/**
 * A MAN WHO HAS BEEN COVERED FOR TWO SECONDS BREAKS FREE. QA, 2026-09-11.
 *
 * WHAT HE IS BREAKING OUT OF IS A LATCH, NOT A COLLISION. The ported
 * `checkCollisions` fires on box overlap, and a non-lineman's box reaches 0.81m
 * by 0.88m, so two of them find each other up to 1.76m apart. `separate` rests
 * bodies at 1.45m, INSIDE that. Two men running alongside each other are
 * therefore colliding on every single frame, and every frame the receiver's
 * ySpeed is hard-set to 40% of his top speed. He cannot get away, because the
 * thing holding him is not a push he can out-run: it is an assignment that
 * re-fires forever.
 *
 * THE MEASURED SHAPE PROVES IT. Over 340 plays, lock episodes are bimodal: the
 * median lasts 0.03 seconds and the 99th percentile 4.25, the longest running
 * the whole play. Physics gives a spread; a latch gives two outcomes. 1.37 locks
 * a play last two seconds or more, and 25% of every lock on the ball CARRIER
 * does, which is the "stuck together all the way up the field" that was
 * reported.
 *
 * WHAT THIS DOES NOT DO IS SHRINK ANY BOX. The 1.76m detection against the
 * 1.45m rest distance is load-bearing: `separate`'s own note explains that the
 * separation must stay INSIDE the collision boxes or a tackle could never fire
 * and no play would ever end. So the geometry stays exactly as it is and the
 * man is given a way OUT of it instead, which is also the thing that is worth
 * watching.
 *
 * IT IS EARNED, BRIEF, AND THEN UNAVAILABLE. Two seconds of unbroken contact
 * with the SAME opponent, a fraction of a second of freedom, then a cooldown.
 * That is the same discipline `rushShed` is written with, and for the same
 * reason: a permanent exemption from being covered is not a football game.
 *
 * ONLY THE OFFENCE'S SKILL PLAYERS, never the line. A lineman who could shed
 * his man is a lineman not blocking, and `rushShed`'s own note records what
 * happened the last time pass protection was loosened by accident.
 */
export function breakContact(play, dt) {
    const E = CFG.escape;
    const st = play.playState.state;
    const step = dt > 0 ? dt : 1 / CFG.simHz;
    // The same box test `motion.checkCollisions` builds, which is the thing
    // actually doing the holding. Half-extents are the ported 5 and 6 for a
    // non-lineman, scaled and padded exactly as motion.js scales and pads them.
    const hx = 5 * CFG.collisionScale + CFG.collisionPad;
    const hy = 6 * CFG.collisionScale + CFG.collisionPad;
    let broke = 0;

    for (const obj of play.game.objects) {
        if (!obj.state || !obj.settings || obj.settings.benched) continue;
        if (obj.settings.team !== 0) continue;
        const skill = obj.settings.positionGroup === 'wr'
            || obj.settings.position === 'qb';
        if (!skill) continue;
        const s = obj.state;

        /**
         * A BREAK IS HELD FOR ITS WHOLE LENGTH, NOT STRUCK ONCE.
         *
         * THE FIRST VERSION SET THE SPEED ON ONE FRAME AND IT BOUGHT ALMOST
         * NOTHING: measured, a pair 1.90m apart at the break were 2.00m apart
         * when the grace ended and 2.11m a second later, against a box that
         * finds them again at 1.76m. He had not got away at all.
         *
         * The reason is that a velocity written once means nothing to a
         * controller that re-derives velocity every frame. His route steers him
         * back at his own line at `accel` per frame, and against a juke worth
         * about 2 units that is gone in five frames. So the drive is re-asserted
         * every frame of the grace, under an ease-out envelope, and what the
         * route gets to do is bend it rather than erase it.
         */
        if (s.escape) {
            s.escape.at += step;
            if (s.escape.at >= E.grace) {
                s.escape = null;
            } else {
                driveEscape(obj, s.escape, E);
                // He is getting away, not being held: no clock runs.
                s.contact = null;
                continue;
            }
        }

        /**
         * A CLOCK PER OPPONENT, AND THE FIRST VERSION KEPT ONE FOR "THE NEAREST
         * MAN" INSTEAD. That was measurably wrong and it is worth saying why,
         * because it looked completely reasonable.
         *
         * Tracking only the closest defender means the clock restarts every time
         * somebody else drifts a few centimetres nearer, and in a game where a
         * receiver is routinely inside two defenders' boxes at once that is
         * constant: measured, the nearest man changes six times a play. So the
         * clock never ran: across 85 plays the highest `lockedFor` ANY receiver
         * reached was 2.00 seconds against a 2.00 threshold, and the feature
         * fired 14 times in 340 plays while 1.37 genuine two-second locks were
         * happening per play. The pair was locked the whole time. The bookkeeping
         * was watching the wrong thing.
         *
         * One clock per opponent is what "entangled with a defender for two
         * seconds" actually means, and a man brushing past resets only his own.
         */
        const contact = s.contact || (s.contact = {});
        const touching = new Set();
        for (const other of play.game.objects) {
            if (other.settings.benched || other.settings.team !== 1) continue;
            if (Math.abs(other.coords.x - obj.coords.x) > hx * 2) continue;
            if (Math.abs(other.coords.y - obj.coords.y) > hy * 2) continue;
            touching.add(other.settings.position);
        }

        /**
         * A FRAME OF DAYLIGHT IS NOT LETTING GO, and the first version thought
         * it was. `separate` settles a covered pair at very nearly the exact
         * distance at which the collision boxes stop touching, so a genuinely
         * locked pair flickers across the test on ALTERNATE FRAMES: traced, a
         * wr1/db1 pair sat at 50.0 then 50.8 units apart against a box reaching
         * 50.4, for the whole play. Dropping the clock on the first frame out
         * therefore reset it every other frame, and no receiver ever got past
         * 2.00 seconds against a 2.00 threshold. See `escape.forgive`.
         *
         * ELAPSED TIME SINCE THE CONTACT BEGAN is what counts, not a sum of the
         * frames he was touching. "Entangled for more than two seconds" is a
         * statement about how long he has been stuck, and with contact flickering
         * every other frame a sum of touching frames accrues at HALF RATE and
         * reads two seconds off a four second lock. The entry only survives while
         * he is genuinely held, because a real gap longer than `forgive` deletes
         * it outright.
         */
        let on = null;
        let held = 0;
        for (const other of play.game.objects) {
            if (other.settings.benched || other.settings.team !== 1) continue;
            const pos = other.settings.position;
            const near = touching.has(pos);
            const c = contact[pos];
            if (!near && !c) continue;
            // A NEW CONTACT COUNTS ON THE FRAME IT STARTS, rather than being
            // recorded and then skipped. Skipping it left `on` unset for that
            // frame, which is harmless for the clock (it simply arrives a frame
            // later) and not harmless for a CARRIER, whose trigger is his tackle
            // progress and can be satisfied the instant somebody reaches him:
            // he had to wait a frame for a move he had already earned.
            const seen = c || (contact[pos] = { held: 0, off: 0 });
            seen.held += step;
            if (near) seen.off = 0; else seen.off += step;
            if (seen.off > E.forgive) { delete contact[pos]; continue; }
            // Whoever has been on him LONGEST is the one he is breaking from,
            // rather than whoever happens to be closest this frame.
            if (seen.held > held) { held = seen.held; on = other; }
        }

        /**
         * A CARRIER IS ON HIS TACKLE PROGRESS, NOT ON THE CLOCK, and he has to
         * be: `checkCollisions` brings him down within `settings.tackled` frames
         * of contact, which is at most an eighth of a second, so two seconds of
         * being entangled is a state he cannot reach. See `escape.stiffAt`.
         */
        const carrying = s.hasBall === true;
        const limit = obj.settings.tackled || 0;
        const grabbed = carrying && limit > 0 && s.tackle >= limit * E.stiffAt;

        // NO SEPARATE COOLDOWN IS NEEDED. The clocks are dropped on the break
        // below and held empty for the grace above, so the earliest a man can do
        // this twice is `grace` plus a further `after` of unbroken contact. See
        // config's `escape` block for the cooldown that was written and removed
        // for being unable to bind.
        if (!on || !(grabbed || held >= E.after)) continue;

        /**
         * HE IS OUT. A STIFF-ARM IF HE HAS THE BALL, A JUKE IF HE DOES NOT.
         *
         * The impulse is the part that actually separates them. The grace alone
         * only stops him being slowed down, and two men running alongside at the
         * same speed who are no longer being slowed are still two men running
         * alongside: nothing in the ported steer would ever take him away from a
         * defender, because his route does not know a defender exists.
         */
        // Away from the man he is leaving. `away` is -1 or +1 across the field.
        const away = (obj.coords.y - on.coords.y) >= 0 ? 1 : -1;
        s.escape = {
            at: 0, kind: carrying ? 'stiff-arm' : 'shove',
            away, against: on.settings.position,
        };
        driveEscape(obj, s.escape, E);

        // FIGHTING OFF A TACKLE IS WHAT A STIFF-ARM IS FOR. Part of the progress
        // toward being brought down comes off, never all of it: a carrier who
        // could reset the count every time could not be tackled at all.
        if (carrying) s.tackle = Math.max(0, s.tackle * (1 - E.relief));

        /**
         * ...AND THE MAN BEING SHOVED IS STAGGERED, NOT NUDGED.
         *
         * This is where the separation comes from, and a single frame of it is
         * worth nothing: his cover route re-accelerates him at the receiver on
         * the very next frame and undoes the damping inside five. So being
         * shoved is a STATE with its own clock, read by `holdStagger` below,
         * and he spends `escape.stagger` seconds unable to run at the man who
         * pushed him off.
         *
         * He is pushed off as well as slowed, because a defender who merely
         * decelerates on the spot reads as a man who lost interest rather than
         * one who has been beaten.
         */
        on.state.ySpeed = on.state.ySpeed * E.shed - away * on.physics.maxSpeed * E.shed;
        on.state.xSpeed *= E.shed;
        on.state.shoved = { at: 0, away };
        s.contact = null;
        broke += 1;
    }

    holdStagger(play, step, E);
    return broke;
}

/**
 * A SHOVED DEFENDER STAYS SHOVED FOR HALF A SECOND.
 *
 * THE SAME LESSON AS THE ESCAPE DRIVE, ON THE OTHER MAN. Damping a defender's
 * speed on the frame he is pushed is undone by his own cover route within five
 * frames, because that route re-derives his velocity every frame and it is
 * pointed straight at the receiver. Measured with a one-frame shove, a pair
 * 1.90m apart at the break were 2.00m apart when the move ended.
 *
 * So the damping is re-applied across `escape.stagger`, easing back to nothing,
 * and it is applied to his SPEED rather than to his target. He still tries to
 * cover, he just cannot get there, which is what being shoved off looks like.
 */
function holdStagger(play, step, E) {
    let held = 0;
    for (const obj of play.game.objects) {
        const s = obj.state;
        if (!s || !s.shoved) continue;
        s.shoved.at += step;
        if (s.shoved.at >= E.stagger) { s.shoved = null; continue; }
        // 1 at the moment of the shove, easing to no damping at all by the end.
        const bite = Math.cos(Math.min(1, s.shoved.at / E.stagger) * (Math.PI / 2));
        const keep = 1 - (1 - E.shed) * bite;
        s.xSpeed *= keep;
        s.ySpeed *= keep;
        held += 1;
    }
    return held;
}

/**
 * NOBODY HOLDS A POSE AFTER THE WHISTLE. QA, 2026-09-11.
 *
 * `state.escape` is cleared by its own clock inside `breakContact`, and
 * `breakContact` only runs from `tick`, and `tick` returns immediately once the
 * play is dead. So a man who was mid-move when he was brought down keeps the
 * flag FOREVER: measured, 0.64 players a play were still holding one when the
 * whistle went, and what QA saw was a tackled carrier lying there with his
 * stiff-arm still locked out.
 *
 * Called from the whistle rather than left to the clock, because the clock is
 * exactly the thing that has stopped running.
 */
export function clearEscapes(play) {
    let cleared = 0;
    for (const obj of play.game.objects) {
        if (!obj.state) continue;
        if (obj.state.escape) cleared += 1;
        obj.state.escape = null;
        obj.state.shoved = null;
        obj.state.contact = null;
    }
    return cleared;
}

/**
 * WHERE EACH PLAYER IS ACTUALLY GOING, AVERAGED OVER `lead.window`.
 *
 * THE PORTED THROW LEADS OFF ONE FRAME. `formations.generateBallObject` reads
 * `receiverObj.state.ySpeed` at the instant the visitor pressed the button and
 * multiplies it by as much as 45. One frame of a velocity is the wrong thing to
 * ask even of a clean simulation, and this one is not clean: the ported steer
 * has no deceleration term anywhere (see `steerDeadband` in motion.js), so a
 * receiver asked to run straight holds his line by crossing it at full speed in
 * alternate directions. Sampling that square wave once, the SAME MAN ON THE
 * SAME STRAIGHT ROUTE was led anywhere between 0.08m and 3.78m sideways
 * depending only on which frame of an 11-frame cycle the tap landed on. The
 * visitor sees a receiver running straight up the field and a pass thrown four
 * metres wide of him, and nothing on screen explains why.
 *
 * A WINDOW, NOT A SMOOTHING FACTOR. Net displacement over the window divided by
 * its length is the average velocity over it, which is the plain-English answer
 * to "where is he going": a wobble that ends where it started contributes
 * nothing, and a man genuinely crossing the field contributes all of it. An
 * exponential average would not have that property, and the wobble is a square
 * wave rather than noise, so cancelling it exactly is worth having.
 *
 * IT IS WRITTEN AS A PLAIN FIELD ON A PLAIN OBJECT, exactly like
 * `state.airborne`, and the ported formations class reads it and asks no
 * further questions. Nothing here knows what a mesh is and PLANNING D1 holds.
 * A player with no history yet has no `heading`, and the port falls back to the
 * ported single-frame speeds, which is the 2D game's own behaviour.
 */
export function markHeading(play) {
    const frames = Math.max(1, Math.round(CFG.simHz * CFG.lead.window));
    let marked = 0;
    for (const obj of play.game.objects) {
        if (!obj.state || !obj.settings) continue;
        // The ball is not running anywhere, it is on rails.
        if (isBall(obj)) continue;
        if (obj.settings.benched) continue;
        const s = obj.state;
        if (!s.track) s.track = [];
        s.track.push(obj.coords.x, obj.coords.y);
        while (s.track.length > (frames + 1) * 2) s.track.splice(0, 2);
        // Not enough history to average yet. Leave `heading` absent rather than
        // writing a bad one: absent means "use the ported speeds".
        if (s.track.length < (frames + 1) * 2) continue;
        const span = (s.track.length / 2) - 1;
        s.heading = {
            x: (obj.coords.x - s.track[0]) / span,
            y: (obj.coords.y - s.track[1]) / span,
        };
        marked += 1;
    }
    return marked;
}

/**
 * WHO IS OFF THE GROUND, TOLD RATHER THAN WORKED OUT.
 *
 * The jump is decided by the view, because it is the only half that knows where
 * the ball really is: it reads the drawn parabola against the man's real reach,
 * where this side has only `getZIndex`, a clamped ramp that view.js itself
 * stopped believing. A catch that then refused him would be a receiver leaving
 * his feet with the ball half a metre away and coming down with nothing, which
 * is what QA watched.
 *
 * It arrives as a set of POSITION NAMES and lands as a plain boolean on a plain
 * object, so nothing here has to know what a mesh is and PLANNING D1 holds.
 *
 * WHAT ARRIVES IS WHO HAS LEFT HIS FEET, NOT WHO MAY CATCH YET. That is
 * `state.leaping`. `motion.checkCatch` reads `state.airborne`, and `landLeaps`
 * raises it on the simulation's own clock once the ball gets to him. See
 * `ballArrived` for why that moved out of the render loop.
 */
export function markAirborne(play, positions) {
    const up = positions || new Set();
    let count = 0;
    for (const obj of play.game.objects) {
        if (!obj.state || !obj.settings) continue;
        const now = up.has(obj.settings.position);
        if (now && !obj.state.leaping) obj.state.leapFor = 0;
        obj.state.leaping = now;
        // Back on the grass is back to the ported boxes, at once.
        if (!now) obj.state.airborne = false;
        if (now) count += 1;
    }
    return count;
}

/**
 * HOW LONG A LEAPING MAN WAITS FOR THE BALL AT MOST, in seconds.
 *
 * `jump.backstop` is written as a fraction of the lift, because that is how it
 * reads on screen. This is the moment on the rise that he reaches it, off the
 * same warped sine `view.jumpLift` draws: the rise is the first `peakAt` of the
 * hang and covers the first half of the sine.
 */
export function leapBackstop() {
    const J = CFG.pose.jump;
    const back = typeof J.backstop === 'number' ? Math.min(1, Math.max(0, J.backstop)) : 1;
    const raw = typeof J.peakAt === 'number' ? J.peakAt : 0.5;
    const peak = Math.min(0.95, Math.max(0.05, raw));
    return J.hang * peak * 2 * (Math.asin(back) / Math.PI);
}

/**
 * ...AND WHETHER THE SIMULATION MAY HAND HIM THE BALL YET.
 *
 * QA ROUND TWENTY-SEVEN, ITEM 6. `motion.checkCatch` gives an airborne receiver
 * a box as wide as the jump's own range in every direction and excuses him the
 * height gate, and the jump only fires when the ball is ALREADY inside that
 * range. So a man reported airborne on his first frame has the ball before he
 * has left the grass: a receiver catching a pass and then leaping.
 *
 * HE WAITS FOR THE BALL TO ARRIVE RATHER THAN FOR A CLOCK. A fixed delay was
 * measured and refused (see `jump.arriveFirst`); the ball's CLOSEST APPROACH
 * costs nothing, because the nearest point of a path that came inside the box
 * is inside the box. `gap` is this step's distance from the ball and `was` is
 * the last step's, so "it has stopped getting closer" is the whole test, and
 * `since` against `leapBackstop` covers an arc that never turns over.
 *
 * AND IT IS ASKED ON THE SIMULATION'S CLOCK, NEVER THE DISPLAY'S. It used to
 * run in view.js once per rendered frame, and the answer reached the catch one
 * rendered frame later again. The ball is inside a leaping man's reach for a
 * median of 75 milliseconds, so the game's hardest catches depended on the
 * visitor's frame rate. Measured over 2,868 throws, 15 point completions ran
 * 49% at 30fps against 67% at 60, with 124 incompletions after a jump against
 * 32, and a display dropping frames was exactly "he jumps and it goes through
 * his hands". On the simulation's clock that is 79% and 80%, and 2 and 9.
 *
 * PURE, AND THE LATCH IS THE CALLER'S. Once he is airborne he stays airborne
 * for the rest of the jump.
 */
export function ballArrived(gap, was, since) {
    const J = CFG.pose.jump;
    if (J.arriveFirst === false) return true;
    if (since >= leapBackstop()) return true;
    if (!(was >= 0) || !(gap >= 0)) return false;
    return gap >= was;
}

/**
 * ONE STEP OF EVERY LEAP, run at the top of `tick` so the catch below it sees
 * the answer on the same step.
 *
 * The man the ball was thrown at has his distance from it kept on every step of
 * the flight, not only once he is up, so the first step of a leap already has
 * something to compare against and a ball that is past its nearest point is
 * his straight away rather than one step later.
 */
export function landLeaps(play) {
    const game = play.game;
    const ball = game.objects.find(isBall);
    const st = play.playState.state;
    const flying = !!ball && !(st.ball && st.ball.caught);
    const step = 1 / CFG.simHz;
    for (const obj of game.objects) {
        if (!obj.state || !obj.settings || isBall(obj)) continue;
        const s = obj.state;
        if (!s.leaping && obj.settings.position !== game.throwTo) continue;
        const gap = flying
            ? Math.hypot(ball.coords.x - obj.coords.x, ball.coords.y - obj.coords.y) : -1;
        if (s.leaping) {
            if (!s.airborne) {
                s.airborne = ballArrived(gap, s.ballGap >= 0 ? s.ballGap : -1, s.leapFor || 0);
            }
            s.leapFor = (s.leapFor || 0) + step;
        }
        s.ballGap = gap;
    }
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
    const on = play.game.objects.filter((o) => !o.settings.benched && !isBall(o));
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
 *
 * BOTH AXES NOW. See the note beside the downfield clamp for why the sentence
 * that used to say "the cross-field axis only" was wrong.
 */
export function keepInbounds(play) {
    const height = play.playState.state.measurements.height;
    const width = play.playState.state.measurements.width;
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

    /**
     * AND THE ENDS OF THE FIELD, WHICH THIS AXIS NEVER HAD.
     *
     * The note above used to finish "the cross-field axis only, because nobody
     * has ever come close to the ends". Measured against plays where the
     * visitor simply HOLDS the ball, which the game explicitly lets them do,
     * the quarterback's own back edge reaches 15.4m behind the goal line and he
     * drags three linemen out with him. The earlier measurement missed it
     * because it always threw or ran at 1.4 seconds: nobody had asked what
     * happens if you never do either, and the drop-back has no end.
     *
     * THE WALL IS THE GREEN, NOT THE PAINT. The end zones are off limits too,
     * which is QA's call and is the simpler rule to state.
     *
     * IT DOES NOT COST THE TOUCHDOWN, which had to be checked rather than
     * assumed: `runWrFormation` awards it at `-4 + lineInterval * 4`, which is
     * 27.9m, well inside the far wall at 35m. What it does make unreachable is
     * the ported `coords.x > 0` out-of-bounds branch at the BACK, and that is
     * accounted for rather than overlooked: measured, no receiver ever gets
     * near it, and the men who do are the quarterback before he has thrown and
     * the line in front of him, neither of whom is on that branch.
     *
     * The same half a shoulder width does both axes. A body is deeper than it
     * is wide from some angles and the figure turns, so the larger of the two
     * is the one that keeps him on the paint whichever way he is facing.
     */
    const back = Math.min(body, width / 2);
    const front = Math.max(width - body, width / 2);
    let moved = 0;
    for (const obj of play.game.objects) {
        if (!obj.settings || obj.settings.benched) continue;
        if (isBall(obj)) continue;
        if (obj.coords.y < lo) {
            obj.coords.y = lo;
            if (obj.state) obj.state.ySpeed = 0;
            moved += 1;
        } else if (obj.coords.y > hi) {
            obj.coords.y = hi;
            if (obj.state) obj.state.ySpeed = 0;
            moved += 1;
        }
        if (!(width > 0)) continue;
        if (obj.coords.x < back) {
            obj.coords.x = back;
            // Zeroed for the same reason the cross-field one is: the model goes
            // on accelerating into the paint, so a player left with speed
            // sticks to the wall and then leaves it like a slingshot when his
            // route turns him round.
            if (obj.state) obj.state.xSpeed = 0;
            moved += 1;
        } else if (obj.coords.x > front) {
            obj.coords.x = front;
            if (obj.state) obj.state.xSpeed = 0;
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
