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
 *  Outlaw exhibition joins with the Outlaw class (M3). */
export const EVENTS = Object.freeze([
    { id: 'easy', label: 'Easy', blurb: 'Against the three slowest cars in the hall' },
    { id: 'medium', label: 'Medium', blurb: 'Against three cars from the middle of the pack' },
    { id: 'hard', label: 'Hard', blurb: 'Against the three fastest, last year’s champion among them' },
    { id: 'trial', label: 'Time Trial', blurb: 'Your own cars against each other, or one alone' }
]);

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
    replay: 'Photo finish',
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
    seconds: 'seconds'
});

export function eventLabel(id) {
    const e = EVENTS.find((x) => x.id === id);
    if (!e) return '';
    return id === 'trial' ? e.label : `${e.label} division`;
}

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
    const parts = rows.map((r) => `${placeWord(r.place)}, ${r.name}, averaging ${clock(r.average)} seconds`);
    return `${eventLabel(eventId)} results. ${parts.join('. ')}.`;
}

const s3 = (t) => `${clock(t)} seconds`;

/** Below this, a line is not worth saying. */
const WORTH = 0.0005;

/**
 * The Why lines for the visitor's car (PRD, The results): the one thing
 * its build did best, and the two things that would gain it the most,
 * from sim.explain's lines. `car` tells which way its weight would move.
 * Returns a list of sentences.
 */
export function whyLines(explained, car, idealBalance) {
    const saved = explained.lines.filter((l) => l.saved !== null && l.saved > WORTH).sort((a, b) => b.saved - a.saved);
    const more = explained.lines.filter((l) => l.more > WORTH).sort((a, b) => b.more - a.more);
    const out = [];
    const SAVED = {
        weight: (t) => `Its extra weight was worth ${s3(t)} over the kit’s own weight.`,
        balance: (t) => `Weight toward the back was worth ${s3(t)} over a car balanced in the middle.`,
        axles: (t) => `The work on its axles was worth ${s3(t)}.`,
        alignment: (t) => `Straight wheels were worth ${s3(t)}.`,
        shape: (t) => `Its shape was worth ${s3(t)} over a plain block.`
    };
    const back = car.balance > idealBalance;
    const MORE = {
        weight: (t) => `Weights up to the full 5 ounces would save ${s3(t)}.`,
        balance: (t) => (back
            ? `Moving the weight back, to about three quarters of an inch in front of the rear axle, would save ${s3(t)}.`
            : `Moving the weight forward a little, to about three quarters of an inch in front of the rear axle, would save ${s3(t)}.`),
        axles: (t) => `Polished axles and graphite would save ${s3(t)}.`,
        alignment: (t) => `Aligning the wheels would save ${s3(t)}.`,
        shape: (t) => `A slimmer shape would save ${s3(t)}.`
    };
    if (saved.length) out.push(SAVED[saved[0].id](saved[0].saved));
    for (const l of more.slice(0, 2)) out.push(MORE[l.id](l.more));
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
