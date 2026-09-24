// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * posting.js - What can be found for certain in a pasted job posting.
 *
 * A visitor pastes a whole posting into the form. The office keeps the text
 * as it is and offers two things it can find WITHOUT GUESSING: a link, and a
 * salary range written as numbers. It never guesses the company or the role,
 * because a wrong guess costs more to notice and fix than typing two words.
 *
 * Pure. Nothing here fetches anything: the office never follows a link on
 * the visitor's behalf.
 */

import { safeUrl } from './store.min.js';

const URL_RE = /\bhttps?:\/\/[^\s<>"'()[\]{}]+/i;

/** A money amount with a currency sign in front: "$120,000", "$120k",
 *  "$58.50", "USD 95,000". */
const SIGNED = /(?:\$|\bUSD\s?)\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?([kK]\b)?/g;
/** What joins the two ends of a range, then the second amount, whose sign is
 *  optional ("$120,000 - 150,000"). */
const JOIN_THEN_AMOUNT = /^\s*(?:-|\u2013|\u2014|to|and)\s*(?:\$|USD\s?)?\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?([kK]\b)?/i;
const HOURLY_RE = /^[\s.,]*(?:\/\s?(?:hr|hour|h)\b|per\s+hour|an\s+hour|hourly)/i;

function amount(digits, k) {
    const n = Number(String(digits).replace(/,/g, ''));
    if (!Number.isFinite(n)) return null;
    return Math.round(k ? n * 1000 : n);
}

/** The first http or https link in the text, made safe, or ''. */
export function findUrl(text) {
    const m = URL_RE.exec(String(text || ''));
    if (!m) return '';
    return safeUrl(m[0].replace(/[.,;:!?]+$/, ''));
}

/**
 * The first salary RANGE written with a currency sign, as
 * `{ min, max, period }`, or null. A single figure is not offered, since a
 * lone "$25" in a posting is as likely a fee or a stipend as a wage. The
 * period is `hour` when the posting says so after the range, or when the top
 * of the range is too small to be a yearly salary.
 */
export function findSalary(text) {
    const src = String(text || '');
    SIGNED.lastIndex = 0;
    let m;
    while ((m = SIGNED.exec(src)) !== null) {
        const rest = src.slice(m.index + m[0].length);
        const second = JOIN_THEN_AMOUNT.exec(rest);
        if (!second) continue;
        const highK = Boolean(second[2]);
        let min = amount(m[1], m[2]);
        const max = amount(second[1], highK);
        if (!min || !max) continue;
        // "$120-150k" means 120k to 150k: the k is written once, on the second.
        if (!m[2] && highK && min < 1000) min *= 1000;
        const after = rest.slice(second[0].length, second[0].length + 24);
        const period = HOURLY_RE.test(after) || Math.max(min, max) < 1000 ? 'hour' : 'year';
        return { min: Math.min(min, max), max: Math.max(min, max), period };
    }
    return null;
}

/** Everything the office can offer from a posting. */
export function readPosting(text) {
    return { url: findUrl(text), salary: findSalary(text) };
}
