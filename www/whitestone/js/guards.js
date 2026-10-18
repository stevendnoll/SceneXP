// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * guards.js - Gentle warnings about what a note should not hold (PRD 15).
 *
 * A checklist is shared with a cleaner, and a share link can be forwarded.
 * So when a household note or a task note looks like it holds a door, alarm,
 * gate or lockbox code, or tells where a spare key is hidden, the studio
 * suggests sharing that directly instead. When a note reads like health
 * information, it says there is no need. The studio never asks about health.
 *
 * HINTS, NEVER BLOCKS. A false alarm costs a visitor one line of polite text,
 * and a missed one costs nothing that was not already typed, so the patterns
 * lean toward catching and the copy (copy.js GUARDS) stays courteous.
 *
 * Returns codes: 'code', 'hidden-key', 'health', in that order, each at
 * most once.
 *
 * Pure.
 */

const CODE_WORDS = '(?:code|combo|combination|pin|passcode|password|passkey)';
const ENTRY_WORDS = '(?:door|front door|back door|side door|alarm|security|gate|garage|lockbox|lock box|key ?box|keypad|entry|access|building|smart lock)';

const PATTERNS = [
    // "garage code", "alarm code is 4417", "keypad combination", "gate pin"
    ['code', new RegExp(`\\b${ENTRY_WORDS}\\s+${CODE_WORDS}\\b`, 'i')],
    // "code: 4417", "the combo is 12-34-56", "PIN 0420"
    ['code', new RegExp(`\\b${CODE_WORDS}\\b[\\s:#=-]*(?:is\\s+)?[\\s:#=-]*\\d(?:[\\s-]?\\d){2,9}\\b`, 'i')],
    // "spare key", "hidden key"
    ['hidden-key', /\b(?:spare|hidden|extra|backup)\s+(?:house\s+|door\s+)?key\b/i],
    // "key is under the mat", "the key's in the planter by the steps"
    ['hidden-key', /\bkeys?\b(?:'s)?[^.!?\n]{0,40}\b(?:under|beneath|inside|behind|in|on top of)\b[^.!?\n]{0,25}\b(?:mat|doormat|rock|stone|plant|planter|pot|flowerpot|mailbox|gnome|step|steps|ledge|light|lantern|frame|grill)\b/i],
    // health conditions, never asked for
    ['health', /\b(?:allerg\w*|asthma\w*|medical|medication\w*|illness\w*|disease\w*|diabet\w*|epilep\w*|seizure\w*|pregnan\w*|immun\w*|chemo\w*|copd|eczema|migraine\w*|disabilit\w*|diagnos\w*)\b/i]
];

/** The hints a piece of free text calls for. */
export function hintsFor(text) {
    if (typeof text !== 'string' || !text.trim()) return [];
    const found = [];
    for (const [code, pattern] of PATTERNS) {
        if (!found.includes(code) && pattern.test(text)) found.push(code);
    }
    return found;
}
