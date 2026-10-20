// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * copy.js - every word Derby Day shows or says (M1 onward), in one place,
 * so the house style can be checked in one place: American spelling, no
 * em-dashes or semicolons, a host's courtesy, and never the word the name
 * decision rules out (PRD, The name). tests/derby-sim.test.mjs scans the
 * folder for it, and tests/derby-playback.test.mjs checks the sentences
 * built here.
 */

/** The events a visitor can enter (PRD, What a visitor can enter). The
 *  Outlaw exhibition (D4) takes Outlaw cars only, and says so. */
export const EVENTS = Object.freeze([
    { id: 'easy', label: 'Easy', blurb: 'Against the three slowest cars in the hall' },
    { id: 'medium', label: 'Medium', blurb: 'Against three cars from the middle of the pack' },
    { id: 'hard', label: 'Hard', blurb: 'Against the three fastest, last year’s champion among them' },
    { id: 'trial', label: 'Time Trial', blurb: 'Your own cars against each other, or one alone' },
    { id: 'outlaw', label: 'Outlaw exhibition', blurb: 'An Outlaw car against the three fastest, marked as an exhibition' }
]);

/**
 * CHALLENGE LINKS (M8): the friend's invitation, the head to head's results,
 * and the challenge sent. `rival` is the rival's name as the board shows it
 * ("Steve’s Blue Wedge", challenge.rivalName).
 */
export const CHALLENGE = Object.freeze({
    event: 'Head to head',
    blurb: (rival) => `Your car against ${rival}: four heats, each car in every lane`,
    invite: (from, car) => (from ? `${from} has challenged you to a race against ${car}!` : `A friend has challenged you to a race against ${car}!`),
    inviteMore: 'Choose your car and press Go, or tune it at the workbench first.',
    bad: 'That challenge link did not come through whole, so here is your workbench instead. Ask your friend to send it again.',
    heading: 'How the two cars compared',
    won: (rival, gap) => `You beat ${rival} by ${gap} seconds!`,
    lost: (rival, gap) => `${rival} wins by ${gap} seconds.`,
    // A dead heat: the two shared the win (Steve, 2026-10-20). A tie on the
    // board: the timer's finer reading decided it, and the results say so.
    tie: (rival, average) => `A dead heat with ${rival}! Both cars averaged ${average} seconds, to the timer’s finest reading, so you share the win.`,
    alike: 'Nothing separated them: the two cars ran exactly alike.',
    boardWon: (rival, average, by) => `Tied with ${rival} at ${average} seconds on the board! The timer’s finer reading gave it to you, by ${fineWords(by)}.`,
    boardLost: (rival, average, by) => `Tied with ${rival} at ${average} seconds on the board! The timer’s finer reading gave it to them, by ${fineWords(by)}.`,
    theirEdge: (what, worth) => `The biggest difference was their ${what}. On your car, it would be worth about ${worth} seconds.`,
    yourEdge: (what, worth) => `Your ${what} made the biggest difference, worth about ${worth} seconds on their car.`,
    even: 'Your axles were tuned alike, so the difference was in the shapes and the weights.',
    // The results' buttons.
    send: 'Challenge a friend',
    sendBack: 'Send a challenge back',
    // The card that sends one.
    title: 'Challenge a friend',
    text: (car) => `Send ${car} to a friend. They race their own car against it, head to head.`,
    fromLabel: 'Your first name (optional)',
    share: 'Send the challenge',
    copy: 'Copy the link',
    done: 'Done',
    note: 'The link holds your car and the name you type, nothing else. Nothing is uploaded.',
    shareText: (from, car, average) => (from
        ? `${from} challenges you to a derby race! Can your car beat ${car}? It averaged ${average} seconds at Derby Day.`
        : `Can your derby car beat ${car}? It averaged ${average} seconds at Derby Day.`),
    shared: 'Sent. Good luck to them!',
    copied: 'The link is copied. Paste it into a message to a friend.',
    manual: 'Copy the link below and paste it into a message to a friend.'
});

/** What a tune-up is called in the results' comparison. */
export function edgeWords(edge) {
    if (!edge) return '';
    if (edge.id === 'polish') return `axles polished to ${POLISH[edge.level]}`;
    return { deburr: 'de-burred axles', graphite: 'graphite on the axles', align: 'aligned wheels', sand: 'sanded edges' }[edge.id] || '';
}

/** The harder division after each, for "Try the Medium division". */
export const HARDER = Object.freeze({ easy: 'medium', medium: 'hard' });

export const UI = Object.freeze({
    title: 'DERBY DAY',
    subtitle: 'Race a wooden derby car down a four-lane track',
    raceLegend: 'Your race',
    carLegend: 'Your car',
    carsLegend: 'Your cars, up to four',
    go: 'Go!',
    pickOne: 'Please pick at least one car for the Time Trial.',
    tooMany: 'The track has four lanes, so four cars at most.',
    skip: 'Skip to results',
    you: 'You',
    replay: 'Slow motion',
    photo: 'Photo finish',
    resultsTitle: 'Results',
    raceAgain: 'Race again',
    another: 'Choose another race',
    lanesHeading: 'Each lane’s average',
    whyHeading: 'Why your car ran as it did',
    trialHeading: 'How your cars compared',
    place: 'Place',
    car: 'Car',
    average: 'Average',
    heats: 'Heats',
    seconds: 'seconds',
    // M3, the bench and the garage.
    benchTitle: 'Your workbench',
    raceIt: 'Race it',
    toBench: 'Back to the workbench',
    tune: 'Tune my car',
    garage: 'Your garage',
    newCar: 'New car',
    copyCar: 'Copy this car',
    deleteCar: 'Delete this car',
    shape: 'Shape',
    paint: 'Paint',
    bodyColor: 'Body',
    stripe: 'Stripe',
    noStripe: 'No stripe',
    customColor: 'Custom color',
    finish: 'Finish',
    weights: 'Weights',
    autoWeigh: 'Auto-weigh',
    allOut: 'Take them all out',
    takeOut: 'Take out',
    front: 'Front',
    rear: 'Rear',
    axleMark: 'Axle',
    axles: 'Axles and wheels',
    rules: 'Rules',
    standard: 'Standard',
    standardBlurb: 'The house rule sheet: 5 ounces, the kit’s wheels and axles',
    outlaw: 'Outlaw',
    outlawBlurb: 'No rule sheet, only what the track allows. Races the Time Trial and the Outlaw exhibition',
    alsoMeasured: 'Also measured',
    settings: 'Settings',
    units: 'Units',
    forget: 'Forget my cars',
    forgetSure: 'Tap again to forget every car, result and trophy',
    explore: 'More 3D worlds to explore at SceneXP.com',
    trophies: 'Trophies',
    noTrophies: 'No trophies yet. Win a division to put one on the shelf.',
    // M4, the workshop.
    drawOwn: 'Or draw your own',
    view: 'Look at it',
    fromSide: 'From the side',
    fromAbove: 'From above',
    carveHelp: 'Drag a point up or down, or tab to it and use the arrow keys. The points beside the axles keep enough wood to hold them. The drawing is twice as tall as the block so there is room to work, and the turntable shows it true.',
    cut: 'Cut along the line',
    rubOut: 'Rub out the line',
    sand: 'Sand the edges',
    livery: 'Decals and name',
    carName: 'Its name, on both sides',
    carNumber: 'Its number, on the nose',
    decals: 'Decals',
    addDecal: 'Stick it on',
    onTheCar: 'On the car',
    along: 'Along the car',
    upDown: 'Up and down',
    size: 'Size',
    peel: 'Peel it off',
    // M5, the tune-ups and the weigh-in.
    doDeburr: 'File off the burrs',
    doGraphite: 'Puff in graphite',
    doAlign: 'Roll it and align it',
    freshAxles: 'Fresh axles from the kit',
    tuneHelp: 'One tap a step. Each one shows what it does, and the host says what it was worth on the track.',
    tuneupsHeading: 'What each tune-up was worth',
    skipWeighIn: 'Skip the weigh-in',
    weighInBack: 'Back to the workbench',
    // M6, the family card.
    family: 'Your family',
    dressing: 'Dressing',
    grownUp: 'The grown-up',
    kid: 'The kid',
    shirt: 'Shirt',
    pants: 'Pants',
    skin: 'Skin tone',
    hairColor: 'Hair color',
    hairLength: 'Hair'
});

/**
 * What the scene shows, as the day moves on: the canvas's name for a screen
 * reader (M7.1), which hears it whenever the scene holds focus (the weigh-in
 * and the race). The check-in's is the page's own, in index.html.
 */
export const SCENE = Object.freeze({
    checkin: 'A four-lane aluminum derby track running down the length of a community hall, with wooden derby cars at the starting gate',
    bench: 'Your derby car on a turntable at the workbench, with the rule sheet on the pegboard and the scale beside it',
    weighin: 'The registration table at the derby, where a volunteer sets each of your cars on the scale',
    race: 'The derby race on the four-lane track, with families cheering beside the lanes and a crowd in the bleachers',
    results: 'The finish line after the race, with families cheering beside the track'
});

/**
 * The announcer (M6.5), a few more calls than M1's: the gate, a different
 * one each heat, the leader as the field comes off the slope, and a finish
 * by a nose.
 */
export const CALLS = Object.freeze({
    off: Object.freeze(['And they’re off!', 'There goes the gate!', 'Off they go!', 'Here they come, one last time!']),
    lead: (name) => `${name} out in front!`,
    leadMine: (name) => `${name} out in front, and the family is on its feet!`,
    close: (n, name, time) => `By a nose! ${name} takes heat ${n} in ${clock(time)} seconds.`,
    /** The photo finish (Steve's QA, 2026-10-20), frozen on the crossing. */
    photo: (name, gap) => `Photo finish! ${name} by ${gapWords(gap)}.`,
    weighIn: 'Cars to the registration table, please.',
    /** After the last heat, the winner's grown-up dancing (dance-1.0.0 names
     *  the dance: "the Robot"). */
    /** The winning finale: the grown-up and the kid in step. */
    danceDuet: (name, dance) => `${name} wins the day! Your family breaks out the routine they practiced: ${dance}!`,
    dance: (name, dance, mine) => (mine
        ? `${name} wins the day, and your family breaks out ${dance}!`
        : `${name} wins the day, and here comes ${dance}!`)
});

/** A margin finer than the board reads, in ten-thousandths, or as less. */
export function fineWords(by) {
    return by < 0.00005 ? 'less than a ten-thousandth of a second' : `${by.toFixed(4)} seconds`;
}

/** A place the board shows as shared: "1st (tie)". */
export function tiedPlace(n) {
    return `${placeWord(n)} (tie)`;
}

/**
 * A tie on the board said in the results (Steve, 2026-10-20): `tie` is
 * sim.runRace's ({ dead, by }) with the two cars' names, their average and
 * the place it was for. A dead heat shares the place; any other tie went to
 * the faster unrounded time.
 */
export function tieLine({ dead, by }, first, second, average, place) {
    return dead
        ? `A dead heat! ${first} and ${second} both averaged ${average} seconds, to the timer’s finest reading, so they share ${placeWord(place)} place.`
        : `Tied at ${average} seconds on the board! The timer’s finer reading gave ${placeWord(place)} place to ${first}, by ${fineWords(by)}.`;
}

/** A winning margin said aloud: in thousandths, or, under one, as less. */
export function gapWords(gap) {
    return gap < 0.0005 ? 'less than a thousandth of a second' : `${clock(gap)} seconds`;
}

/** The gate's call for heat `n` of `total`. */
export function gateCall(n, total) {
    return n === total ? CALLS.off[3] : CALLS.off[(n - 1) % 3];
}

/** The polish button for the next step (four grits, then compound). */
export function polishButton(level) {
    const next = ['Polish with 400 grit', 'Polish with 800 grit', 'Polish with 1200 grit', 'Polish with 2000 grit', 'Polish with compound'];
    return next[level] || '';
}

/** The sanding slider's five steps (M4.4). */
export const SAND = Object.freeze(['Square, as cut', 'Lightly sanded', 'Softened', 'Rounded', 'Well rounded']);

export function eventLabel(id) {
    if (id === 'challenge') return CHALLENGE.event;
    const e = EVENTS.find((x) => x.id === id);
    if (!e) return '';
    return id === 'trial' || id === 'outlaw' ? e.label : `${e.label} division`;
}

/** The polish steps, as a builder says them (config physics.axleFriction
 *  .polish: four grits, then compound). */
export const POLISH = Object.freeze(['Not polished', '400 grit', '800 grit', '1200 grit', '2000 grit', '2000 grit and polishing compound']);

/** A time as the timer shows it: to the thousandth. */
export function clock(seconds) {
    return seconds.toFixed(3);
}

export function placeWord(n) {
    const tens = n % 100;
    if (tens >= 11 && tens <= 13) return `${n}th`;
    return `${n}${['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
}

export function heatOf(n, total) {
    return `Heat ${n} of ${total}`;
}

/** The announcer, before a heat. The first one says why every car races
 *  every lane (D9: the lane defect, quiet but explained). */
export function staging(n, total) {
    if (n === 1) return 'Cars on the track. Lane 4 runs a hair slow, so every car will race in every lane.';
    if (n === total) return 'The last heat. One more lane each.';
    return `Heat ${n}. Every car moves over one lane.`;
}

export const OFF = 'And they’re off!';

/** The countdown before each heat: the last word on screen, and the one
 *  line a screen reader hears as the staging begins (it lasts 3 seconds). */
export const COUNT = Object.freeze({
    go: 'Go!',
    spoken: (n, total) => `${heatOf(n, total)} starts in 3 seconds.`
});

/** The announcer, a heat's winner. */
export function heatWinner(n, name, time) {
    return `${name} takes heat ${n} in ${clock(time)} seconds.`;
}

/** What a screen reader hears when a heat's times are up. `rows` are
 *  { name, time, place } fastest first. */
export function heatSpoken(n, rows) {
    const parts = rows.map((r) => `${r.name} ${placeWord(r.place)}, ${clock(r.time)} seconds`);
    return `Heat ${n}: ${parts.join('. ')}.`;
}

/** What a screen reader hears when the results are up. */
export function resultsSpoken(eventId, rows) {
    const parts = rows.map((r) => `${placeWord(r.place)}${r.tied ? ', tied' : ''}, ${r.name}, averaging ${clock(r.average)} seconds`);
    return `${eventLabel(eventId)} results. ${parts.join('. ')}.`;
}

const s3 = (t) => `${clock(t)} seconds`;

/** Below this, a line is not worth saying. */
const WORTH = 0.0005;

/** The Why line for a car too bulky to move its weight back (M4.6, PRD A
 *  lesson the model found on its own). */
export function carveLine(t) {
    return `Weight further back would save ${s3(t)}, but this body has no room for it there. Carve some wood out of the middle and the weights can sit further back.`;
}

/**
 * What one change still on the table would save, as a sentence: `line` is
 * one of sim.explain's ({ id, more }). `car` tells which way its weight
 * would move, `maxMass` and `idealText` say the limit and the sweet spot in
 * the sheet's and the visitor's words.
 */
export function moreLine(line, car, idealBalance, { maxMass = '5 ounces', idealText = 'three quarters of an inch', bulky = false } = {}) {
    const t = line.more;
    const back = car.balance > idealBalance;
    if (line.id === 'balance' && back && bulky) return carveLine(t);
    switch (line.id) {
        case 'weight': return `Weights up to the full ${maxMass} would save ${s3(t)}.`;
        case 'balance': return back
            ? `Moving the weight back, to about ${idealText} in front of the rear axle, would save ${s3(t)}.`
            : `Moving the weight forward a little, to about ${idealText} in front of the rear axle, would save ${s3(t)}.`;
        case 'axles': return `Polished axles and graphite would save ${s3(t)}.`;
        case 'alignment': return `Aligning the wheels would save ${s3(t)}.`;
        default: return `A slimmer shape would save ${s3(t)}.`;
    }
}

/** sim.explain's lines still worth something, the biggest gain first. */
export function gains(explained) {
    return explained.lines.filter((l) => l.more > WORTH).sort((a, b) => b.more - a.more);
}

/**
 * The Why lines for the visitor's car (PRD, The results): the one thing
 * its build did best, and the two things that would gain it the most,
 * from sim.explain's lines. Returns a list of sentences.
 */
export function whyLines(explained, car, idealBalance, opts = {}) {
    const saved = explained.lines.filter((l) => l.saved !== null && l.saved > WORTH).sort((a, b) => b.saved - a.saved);
    const more = gains(explained);
    const out = [];
    const SAVED = {
        weight: (t) => `Its extra weight was worth ${s3(t)} over the kit’s own weight.`,
        balance: (t) => `Weight toward the back was worth ${s3(t)} over a car balanced in the middle.`,
        axles: (t) => `The work on its axles was worth ${s3(t)}.`,
        alignment: (t) => `Straight wheels were worth ${s3(t)}.`,
        shape: (t) => `Its shape was worth ${s3(t)} over a plain block.`
    };
    if (saved.length) out.push(SAVED[saved[0].id](saved[0].saved));
    const shown = more.slice(0, 2);
    for (const l of shown) out.push(moreLine(l, car, idealBalance, opts));
    // A body too bulky for its weight to go back hears so even when the
    // balance is not among the two biggest gains (M4.6): carving is the
    // way to it, and the lesson the model found on its own.
    const balance = more.find((l) => l.id === 'balance');
    if (opts.bulky && balance && car.balance > idealBalance && !shown.includes(balance)) out.push(carveLine(balance.more));
    if (!more.length || more[0].more < 0.002) out.push('There is very little left to find. This car is about as fast as the rules allow.');
    return out;
}

/** The Time Trial's comparison, each car against the one behind it.
 *  `rows` are { name, average } fastest first. */
export function trialLines(rows) {
    if (rows.length === 1) return [`${rows[0].name} averaged ${s3(rows[0].average)} over the four lanes.`];
    const out = [];
    for (let i = 1; i < rows.length; i++) {
        const gap = rows[i].average - rows[i - 1].average;
        out.push(gap > WORTH
            ? `${rows[i - 1].name} beat ${rows[i].name} by ${s3(gap)}.`
            : `${rows[i - 1].name} and ${rows[i].name} tied.`);
    }
    return out;
}

// ---- M3: the host at the bench --------------------------------------------

/** Where on the bench each Why line's fix is (bench.js opens it). */
export const FIX_SECTION = Object.freeze({ weight: 'weights', balance: 'weights', axles: 'axles', alignment: 'axles', shape: 'shape' });
const SECTION_NAME = Object.freeze({ weights: 'Weights', axles: 'Axles and wheels', shape: 'Shape' });

/** The host's greeting on a first visit (PRD, Time to first race). */
export function hostFirst(name, massText) {
    return `Welcome to Derby Day! This is your car, ${name}, already weighed to ${massText}. Choose a shape and a color, then race it whenever you’re ready.`;
}

/**
 * The host's greeting on a return (PRD; the "every arrival needs a next
 * step" lesson): where things stand, then the way on. `last` is the car's
 * last result { event, place, average }, or null.
 */
export function hostBack(name, last) {
    if (!last) return `Welcome back! ${name} is on the bench, ready when you are.`;
    if (last.event === 'trial') return `Welcome back! ${name} averaged ${s3(last.average)} in the Time Trial. Would you like to tune it, or race again?`;
    const where = last.event === 'outlaw' ? 'the Outlaw exhibition' : `the ${eventLabel(last.event)}`;
    return `Welcome back! Your car, ${name}, finished ${placeWord(last.place)} in ${where}. Would you like to tune it, or race again?`;
}

/** Back from check-in: the car, and the two ways on. */
export function hostStep(name) {
    return `Here’s ${name} on the bench, ready for another change or another race.`;
}

/**
 * Back from the results by Tune my car: the one change worth the most, and
 * where it is on the bench (PRD: the host offers tune-ups after the first
 * race). `top` is { id, more } from sim.explain's lines, or null.
 */
export function hostTune(name, top, sentence) {
    if (!top || top.more < 0.002) {
        return `Here’s ${name} back on the bench. It’s about as fast as the rules allow. Try a harder race, or build a second car to compare in the Time Trial.`;
    }
    return `Here’s ${name} back on the bench. ${sentence} You’ll find that under ${SECTION_NAME[FIX_SECTION[top.id]]}.`;
}

/** The host after a change on the bench. */
export const SAY = Object.freeze({
    autoWeighed: (massText, balanceText) => `Auto-weigh brought it to ${massText}, the weight ${balanceText} in front of the rear axle. Weight toward the back keeps the car higher on the slope for longer, so it has further to fall.`,
    autoShort: (massText, balanceText) => `Auto-weigh did what this shape allows: ${massText}, the weight ${balanceText} in front of the rear axle. A bulky body has no room further back, but carving wood out of the middle would make some.`,
    allOut: (massText) => `Every weight is out. The car weighs ${massText} now.`,
    shapeAuto: (label) => `A ${label} now, and Auto-weigh moved the weights to suit it.`,
    shapeHand: (label, dropped) => (dropped
        ? `A ${label} now. ${dropped === 1 ? 'One weight no longer fits, so it’s' : `${dropped} weights no longer fit, so they’re`} back in the box.`
        : `A ${label} now. Every weight still fits.`),
    outlaw: (massText) => `Outlaw class. The rule sheet is off, so the weight can go up to ${massText}, the most the track will take. Outlaw cars race in the Time Trial and the Outlaw exhibition.`,
    standard: (massText) => `Standard class: ${massText} at most, and the house rule sheet.`,
    noWood: 'There isn’t enough wood there for a pocket.',
    full: 'That pocket is full.',
    stripsFull: 'Two strips is all that spot takes.',
    empty: 'That pocket is already empty.',
    newCar: (name, massText) => `A new car on the bench: ${name}, weighed to ${massText}. Your other cars wait in the garage.`,
    copied: (from, name) => `A copy of ${from}, called ${name}. Change one thing, then race the two in the Time Trial to see what it was worth.`,
    full4: 'The garage holds four cars. Please delete one to make room.',
    deleteSure: (name) => `Tap Delete again to remove ${name}.`,
    deleted: (name, next) => `${name} is gone. ${next} is on the bench now.`,
    picked: (name) => `${name} is on the bench.`,
    forgetSure: 'Tap Forget again to clear every car, result and trophy from this browser.',
    forgot: (name) => `Everything is forgotten. Here’s a fresh car to start with, ${name}.`,
    // M4, the workshop.
    cutting: 'Cutting along your line…',
    cutAuto: (massText) => `Cut! Auto-weigh moved the weights to suit the new shape, ${massText} in all.`,
    cutHand: (dropped, massText) => (dropped
        ? `Cut! ${dropped === 1 ? 'One weight lost its pocket, so it’s' : `${dropped} weights lost their pockets, so they’re`} back in the box. The car weighs ${massText} now.`
        : `Cut! Every weight still has its pocket. The car weighs ${massText} now.`),
    sanded: (step) => `Sanded: ${step.toLowerCase()}. Rounder edges let the air slip past a little more easily, and the wood that came off came off the weight.`,
    decalsFull: 'That’s as many decals as a car this size can wear. Please peel one off to make room.',
    decalOn: (label) => `${label} stuck on. Move it with the sliders, or drag it on the picture.`,
    decalOff: (label) => `${label} peeled off.`,
    // M5, a tune-up step done, and what it is worth on the track.
    deburred: (t) => `The burrs are filed off every axle. That’s worth ${s3(t)} on the track.`,
    polished: (grit, t) => `Polished with ${grit}. That’s worth ${s3(t)} more.`,
    graphited: (t) => `A puff of graphite in every wheel, spun to work it in. That’s worth ${s3(t)}.`,
    aligned: (t) => `It drifted toward the rail, so the axles were tapped straight. Now it rolls true, worth ${s3(t)}.`,
    fresh: 'Fresh axles from the kit, burrs, crimp marks and all, and the wheels as they go on.'
});

/**
 * The results' list of what each tune-up was worth (M5's Done-when), from
 * sim.tuneupWorth's rows: done, what it was worth, or not done, what it
 * would save.
 */
export function tuneupLines(rows) {
    const out = [];
    for (const r of rows) {
        if (r.id === 'deburr') out.push(r.done ? `De-burred axles: worth ${s3(r.saved)}.` : `Filing off the burrs would save ${s3(r.more)}.`);
        if (r.id === 'polish') {
            if (!r.done) out.push(`Polishing the axles would save ${s3(r.more)}.`);
            else if (r.more > WORTH) out.push(`Axles polished to ${POLISH[r.level]}: worth ${s3(r.saved)}. Polishing on through the compound would save ${s3(r.more)} more.`);
            else out.push(`Axles polished through the compound: worth ${s3(r.saved)}.`);
        }
        if (r.id === 'graphite') out.push(r.done ? `Graphite in the wheels: worth ${s3(r.saved)}.` : `A puff of graphite would save ${s3(r.more)}.`);
        if (r.id === 'align') out.push(r.done ? `Straight wheels: worth ${s3(r.saved)}.` : `Aligning the wheels would save ${s3(r.more)}.`);
    }
    return out;
}

// ---- M5: the weigh-in ------------------------------------------------------

export const WEIGH = Object.freeze({
    onScale: (name) => `${name} on the scale…`,
    reading: (massText) => `${massText} on the scale.`,
    gauge: 'Through the gauge box…',
    passed: (name) => `${name} passes the weigh-in. Good luck!`,
    over: (name, by) => `${name} weighs in ${by} over the limit, so it can’t race just yet. Please take a weight out on the bench and come back.`,
    shape: (name, note) => `${name} won’t pass the gauge box: ${note} Please fix it on the bench and come back.`,
    sentBack: (name, why) => `The weigh-in sent ${name} back to the bench. ${why}`,
    spoken: (name, massText, ok) => (ok ? `${name} weighs ${massText} and passes the gauge box.` : `${name} does not pass the weigh-in.`)
});

/**
 * A polite note for a failed rule check, in the visitor's units (`by` is
 * the amount over or under, already written).
 */
export function ruleNote(rule, by) {
    switch (rule) {
        case 'mass': return `${by} over. Please take a weight out.`;
        case 'length': return `${by} too long.`;
        case 'width': return `${by} too wide.`;
        case 'wheelGap': return `${by} too narrow between the wheels.`;
        default: return `${by} too low to the track.`;
    }
}

/** The rule names, as the sheet prints them. */
export const RULE_NAMES = Object.freeze({
    mass: 'Weight', length: 'Length', width: 'Width', wheelGap: 'Between the wheels', clearance: 'Ground clearance'
});

/** The check-in card's line under a car, and why it cannot enter. */
export const ENTRY = Object.freeze({
    outlawOnly: 'Outlaw cars race in the Time Trial and the Outlaw exhibition.',
    standardOnly: 'The Outlaw exhibition is for Outlaw cars. Switch a car to Outlaw on the bench.',
    illegal: 'Over the rule sheet’s limits, so the weigh-in will hand it back.',
    noneEligible: 'None of your cars can enter this race yet. The bench can change that.',
    benchFirst: 'Please fix your car on the bench first.'
});

/** A results line for a win (PRD: a trophy on the shelf). */
export function trophyLine(eventId, isNew) {
    const where = eventId === 'outlaw' ? 'the Outlaw exhibition' : `the ${eventLabel(eventId)}`;
    if (!isNew) return `First place in ${where} again!`;
    return `First place! A trophy for ${where} is waiting on your workbench shelf.`;
}

/** "Try the Medium division" */
export function harderLabel(eventId) {
    return HARDER[eventId] ? `Try the ${eventLabel(HARDER[eventId])}` : '';
}

/** What the trophy shelf holds, in words. */
export function trophyList(trophies) {
    const won = ['easy', 'medium', 'hard', 'outlaw'].filter((e) => trophies[e]).map((e) => (e === 'outlaw' ? 'Outlaw exhibition' : EVENTS.find((x) => x.id === e).label));
    return won.length ? `${UI.trophies}: ${won.join(', ')}.` : UI.noTrophies;
}

/** A car's best results, in words, or ''. `results` is garage.results. */
export function bestLine(name, results) {
    const parts = [];
    for (const e of ['easy', 'medium', 'hard', 'outlaw']) {
        const r = results[e];
        if (r && r.place) parts.push(`${placeWord(r.place)} in ${e === 'outlaw' ? 'the Outlaw exhibition' : eventLabel(e)}`);
    }
    if (results.trial) parts.push(`${s3(results.trial.average)} in the Time Trial`);
    return parts.length ? `${name}’s best: ${parts.join(', ')}.` : `${name} hasn’t raced yet.`;
}

/**
 * The rule sheet pinned to the pegboard (M3.5), line by line: the house
 * sheet, or the Outlaw's red one. `R` is the sheet (config rules), and
 * `fmt` writes a limit in the sheet's own units.
 */
export function sheetLines(rules, R, fmt) {
    if (rules === 'outlaw') {
        return {
            title: 'OUTLAW CLASS',
            lines: [
                'No rule sheet. Only the track:',
                `Weight: up to ${fmt.mass(R.maxMass)}`,
                `Fits the lane: ${fmt.length(R.maxWidth)} wide`,
                `Clears the center strip: ${fmt.length(R.minWheelGap)}`,
                'Four wheels on the track'
            ]
        };
    }
    return {
        title: 'HOUSE RULES',
        lines: [
            `Weight: ${fmt.mass(R.maxMass)} at most`,
            `Length: ${fmt.length(R.maxLength)} at most`,
            `Width: ${fmt.length(R.maxWidth)} at most`,
            `Between the wheels: ${fmt.length(R.minWheelGap)}`,
            `Ground clearance: ${fmt.length(R.minClearance)}`,
            'The kit’s own wheels and axles',
            'Dry graphite only'
        ]
    };
}
