// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * The gentle warnings (www/whitestone/js/guards.js): what reads like an
 * entry code, a hidden key or health information, and, just as important,
 * the ordinary cleaning notes that must pass without a word.
 */
import { hintsFor } from '../www/whitestone/js/guards.js';

test.each([
    ['The garage code is 4417.', ['code']],
    ['Alarm code: 0420', ['code']],
    ['door code 12-34-56', ['code']],
    ['Keypad combination is on the fridge.', ['code']],
    ['The lockbox code is 7781', ['code']],
    ['PIN 9921 for the side gate', ['code']],
    ['combo is 1 2 3 4', ['code']],
    ['There is a spare key under the mat.', ['hidden-key']],
    ['The key is in the planter by the front steps', ['hidden-key']],
    ["Key's under the gnome", ['hidden-key']],
    ['Hidden key behind the porch light.', ['hidden-key']],
    ['My son has asthma, so no sprays please.', ['health']],
    ['Mild latex allergy, please use the nitrile gloves.', ['health']],
    ['I am pregnant and prefer fragrance-free products', ['health']],
    ['Alarm code 4417, and the spare key is under the mat. Mild allergies.', ['code', 'hidden-key', 'health']]
])('"%s" calls for %j', (text, hints) => {
    expect(hintsFor(text)).toEqual(hints);
});

test.each([
    'Please use the blue cloth on the marble.',
    'No abrasives on the stovetop.',
    'The dog is friendly, just say hello.',
    'Supplies are under the kitchen sink.',
    'Please water the plants by the steps if you have time.',
    'Leave the keys on the hook when you go.',
    'Room 2 has 3 windows and 1 mirror.',
    'Use the code-free vacuum mode on the rug.',
    'The thermostat is set to 68.',
    'Pin the curtains back to clean the windows.',
    'Shoes off at the door, please.',
    ''
])('"%s" passes without a hint', (text) => {
    expect(hintsFor(text)).toEqual([]);
});

test('anything that is not text has no hints', () => {
    expect(hintsFor(null)).toEqual([]);
    expect(hintsFor(42)).toEqual([]);
    expect(hintsFor('   ')).toEqual([]);
});
