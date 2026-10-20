// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * derby-field.mjs - Derby Day's physics bench (M0): prints the neighbors'
 * nine cars as the sim weighs and times them, what each thing a builder
 * controls is worth, and the Outlaw extremes, so the tuning in
 * www/derby/js/config.js can be checked against the PRD's targets table.
 *
 *   npm run build && node scripts/derby-field.mjs
 *
 * Reads the built modules (the sources import each other's .min builds).
 */
import { DERBY_CONFIG as C, IN, OZ } from '../www/derby/js/config.min.js';
import { describeCar, buildFromField, buildFromDesign, checkRules } from '../www/derby/js/car.min.js';
import { runCar, runRace, startHeight } from '../www/derby/js/sim.min.js';

const oz = (kg) => (kg / OZ).toFixed(2);
const inch = (m) => (m / IN).toFixed(3);
const sec = (s) => s.toFixed(4);
const neutral = (car) => runCar(car, null).time;

console.log(`Track: start ${inch(startHeight())} in high, course ${(C.track.courseLength / 0.3048).toFixed(1)} ft\n`);

console.log('THE FIELD (slowest first, as config lists them)');
console.log('#  car            design      oz    bal in  CdA cm2  axle mu  time      finish m/s  legal');
const field = C.field.map((entry) => describeCar(buildFromField(entry)));
field.forEach((car, i) => {
    const e = C.field[i];
    const run = runCar(car, null);
    const legal = checkRules(car).every((c) => c.ok) ? 'yes' : 'NO';
    console.log(`${i + 1}  ${e.name.padEnd(14)} ${e.design.padEnd(10)} ${oz(car.mass)}  ${inch(car.balance).padStart(6)}  ${(car.cdA * 1e4).toFixed(2).padStart(7)}  ${car.axleMu.toFixed(4)}   ${sec(run.time)}  ${run.speed.toFixed(3)}       ${legal}`);
});
const times = field.map(neutral);
const inOrder = times.every((t, i) => i === 0 || t < times[i - 1]);
console.log(`\nIn order, slowest to fastest: ${inOrder ? 'yes' : 'NO'}`);
console.log('Gaps (s): ' + times.slice(1).map((t, i) => (times[i] - t).toFixed(4)).join('  '));

for (const [name, idx] of Object.entries(C.divisions)) {
    const r = runRace(idx.map((i) => field[i]));
    console.log(`\n${name}: averages ${r.average.join('  ')}   lanes ${r.laneAverage.join('  ')}`);
}

console.log('\nWHAT EACH THING IS WORTH (one change, neutral lane)');
const ref = (patch = {}, ballast = { mass: 5.0, balance: 1.0 }, design = 'wedge') =>
    describeCar(buildFromDesign(design, { tune: { deburr: true, polish: 5, graphite: true, align: true, ...patch }, ballast }));
const base = neutral(ref());
const worth = (label, car) => console.log(`${label.padEnd(44)} ${(neutral(car) - base).toFixed(4)} s`);
worth('4.0 oz instead of 5.0', ref({}, { mass: 4.0, balance: 1.0 }));
// The balance set directly, as the Why lines do: Auto-weigh cannot always
// reach a far-back balance on a light body (the weights reach the tail).
const atBalance = (b) => { const car = ref(); return { ...car, balance: b * IN, comX: car.rearAxle - b * IN }; };
console.log(`(reference car: wedge, 5.00 oz, balance ${inch(ref().balance)} in)`);
for (const b of [2.1875, 1.5, 0.875, 0.75, 0.5, 0.25]) worth(`balance ${b} in instead of 1.0`, atBalance(b));
worth('stock axles instead of fully tuned', ref({ deburr: false, polish: 0, graphite: false }));
worth('graphite only', ref({ deburr: false, polish: 0, graphite: true }));
worth('misaligned', ref({ align: false }));
worth('block shape instead of wedge', ref({}, { mass: 5.0, balance: 1.0 }, 'block'));
worth('bullet shape instead of wedge', ref({}, { mass: 5.0, balance: 1.0 }, 'bullet'));
worth('thin wedge instead of wedge', ref({}, { mass: 5.0, balance: 1.0 }, 'thinWedge'));

console.log('\nOUTLAW EXTREMES');
for (const [label, ballast] of [['16 oz, balance 0.875', { mass: 16, balance: 0.875 }], ['16 oz, balance -0.3 (behind the axle)', { mass: 16, balance: -0.3 }], ['bare kit block, stock', null]]) {
    const car = describeCar(buildFromDesign(ballast ? 'thinWedge' : 'block', { rules: 'outlaw', ballast, tune: ballast ? { deburr: true, polish: 5, graphite: true, align: true } : {} }));
    const run = runCar(car, null);
    console.log(`${label.padEnd(40)} ${oz(car.mass)} oz  bal ${inch(car.balance)}  ${sec(run.time)} s  ${run.dnf ? 'DNF' : ''}`);
}
