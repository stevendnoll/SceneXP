// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * units.js - a car's figures in the visitor's units (M3, D3): inches and
 * ounces by default, centimeters and grams when the metric toggle is on.
 *
 * EVERYTHING INSIDE IS SI (config.js), so this is only how a figure is
 * written. The rule sheet keeps its own units with the conversion beside
 * them, "5.00 oz (141.7 g)", because the limits really are written in
 * ounces and inches (D3). A visitor's own figures follow the toggle.
 *
 * PURE.
 */

import { IN, OZ } from './config.min.js';

export const UNITS = Object.freeze(['us', 'metric']);

/** Any stored value made one of the two. */
export function normalizeUnits(units) {
    return units === 'metric' ? 'metric' : 'us';
}

const fixed = (value, places) => {
    // -0.00 reads as a bug.
    const s = value.toFixed(places);
    return /^-0\.?0*$/.test(s) ? s.slice(1) : s;
};

/** A mass: ounces to two places, or grams to one. */
export function mass(kg, units = 'us') {
    return normalizeUnits(units) === 'metric' ? `${fixed(kg * 1000, 1)} g` : `${fixed(kg / OZ, 2)} oz`;
}

/** A length: inches to two places, or centimeters to one. */
export function length(m, units = 'us') {
    return normalizeUnits(units) === 'metric' ? `${fixed(m * 100, 1)} cm` : `${fixed(m / IN, 2)} in`;
}

/** A limit on the rule sheet: its own ounces, then the grams. */
export function sheetMass(kg) {
    return `${fixed(kg / OZ, 2)} oz (${fixed(kg * 1000, 1)} g)`;
}

/** A limit on the rule sheet: its own inches, then the centimeters.
 *  Inches to as many places as the sheet writes (2.75, 0.375, 7). */
export function sheetLength(m) {
    const inches = Math.round((m / IN) * 1000) / 1000;
    return `${inches} in (${fixed(m * 100, 1)} cm)`;
}

/** The names a sentence uses for the two systems. */
export function unitsLabel(units) {
    return normalizeUnits(units) === 'metric' ? 'Centimeters and grams' : 'Inches and ounces';
}
