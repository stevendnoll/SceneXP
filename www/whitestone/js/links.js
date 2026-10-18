// © 2026 Continuum Commerce LLC. All rights reserved.
/**
 * links.js - The share link and the edit link (PLANNING 7.3).
 *
 *   share  <origin>/whitestone/tasks/?c=<id>#k=<key>
 *   edit   <origin>/whitestone/?edit=<id>#k=<key>&o=<ownerToken>
 *
 * THE SECRETS RIDE IN THE FRAGMENT. Browsers never send the part after `#`
 * to a server, and link previews in messaging apps never see it. The query
 * string does reach the web server's log, which is fine, because an id alone
 * opens nothing.
 *
 * STRICT ON THE WAY IN. A link arrives from a message, so it is untrusted
 * text: the parsers accept exactly the shape above (the right page, exactly
 * the expected parameters, each once, each the right length of base64url)
 * and return null for anything else.
 *
 * After reading a link, a page stores what it needs and takes the fragment
 * out of the address bar (`withoutFragment` gives the address to put back),
 * so a key is not left on screen during a screen share.
 *
 * Pure.
 */

export const ID = /^[A-Za-z0-9_-]{22}$/;        // 128 bits
export const SECRET = /^[A-Za-z0-9_-]{43}$/;    // 256 bits
const ORIGIN = /^https?:\/\/[A-Za-z0-9.-]+(:\d{1,5})?$/;
const MAX_LENGTH = 512;

function originOf(origin) {
    if (typeof origin !== 'string' || !ORIGIN.test(origin)) throw new Error('not a site address');
    return origin;
}

function need(pattern, value, what) {
    if (typeof value !== 'string' || !pattern.test(value)) throw new Error(`not a ${what}`);
    return value;
}

/** The link a customer shares with their cleaner. */
export function buildShare(origin, config, id, key) {
    return `${originOf(origin)}${config.links.share}?c=${need(ID, id, 'checklist id')}#k=${need(SECRET, key, 'key')}`;
}

/** The private link that edits a checklist from another device. */
export function buildEdit(origin, config, id, key, ownerToken) {
    return `${originOf(origin)}${config.links.edit}?edit=${need(ID, id, 'checklist id')}`
        + `#k=${need(SECRET, key, 'key')}&o=${need(SECRET, ownerToken, 'owner token')}`;
}

/**
 * `name=value` pairs, exactly the names in `expected`, each once, with
 * values matching their patterns. null for anything else.
 */
function readPairs(text, expected) {
    if (!text) return null;
    const out = {};
    for (const part of text.split('&')) {
        const eq = part.indexOf('=');
        if (eq < 1) return null;
        const name = part.slice(0, eq);
        const value = part.slice(eq + 1);
        // Own properties only: `'constructor' in {}` is true.
        const has = (o) => Object.prototype.hasOwnProperty.call(o, name);
        if (!has(expected) || has(out) || !expected[name].test(value)) return null;
        out[name] = value;
    }
    return Object.keys(out).length === Object.keys(expected).length ? out : null;
}

/** Path, query and fragment of a link, or null. Accepts a full address or
 *  a location-like { pathname, search, hash }. */
function partsOf(link) {
    if (link && typeof link === 'object') {
        const { pathname, search, hash } = link;
        if ([pathname, search, hash].every((p) => typeof p === 'string')) return { pathname, search, hash };
        return null;
    }
    if (typeof link !== 'string' || link.length > MAX_LENGTH) return null;
    try {
        const url = new URL(link);
        if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
        if (url.username || url.password) return null;
        return { pathname: url.pathname, search: url.search, hash: url.hash };
    } catch (e) {
        return null;
    }
}

const onPage = (pathname, page) => pathname === page || pathname === `${page}index.html`;

/** { id, key } from a share link, or null. */
export function parseShare(link, config) {
    const p = partsOf(link);
    if (!p || !onPage(p.pathname, config.links.share)) return null;
    const query = readPairs(p.search.replace(/^\?/, ''), { c: ID });
    const fragment = readPairs(p.hash.replace(/^#/, ''), { k: SECRET });
    return query && fragment ? { id: query.c, key: fragment.k } : null;
}

/** { id, key, ownerToken } from an edit link, or null. */
export function parseEdit(link, config) {
    const p = partsOf(link);
    if (!p || !onPage(p.pathname, config.links.edit)) return null;
    const query = readPairs(p.search.replace(/^\?/, ''), { edit: ID });
    const fragment = readPairs(p.hash.replace(/^#/, ''), { k: SECRET, o: SECRET });
    return query && fragment ? { id: query.edit, key: fragment.k, ownerToken: fragment.o } : null;
}

/** The address with its fragment taken off, for history.replaceState. */
export function withoutFragment(location) {
    return `${location.pathname}${location.search}`;
}
