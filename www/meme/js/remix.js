// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * remix.js - the remix link (specs/meme PLANNING 4.3): the meme and the
 * maker's avatar in the address's fragment, so a friend opens the same
 * meme and can make it theirs. Pure, no THREE and no DOM.
 *
 * A FRAGMENT, NEVER A QUERY. What follows the `#` never reaches the server
 * or its logs (the avatar page's precedent, and the telemetry part reads
 * the path alone). The link reads:
 *
 *   #m=2/panic/first+line~second~third/-,rage,-,-,-,-&a=1.fair.darkBrown....
 *
 * `m=` is the meme: the link's version, the template's id, the captions by
 * slot joined with `~` (each percent-encoded, a `~` of its own as well, and
 * a space written `+` so a line of words stays readable in a chat), the
 * faces by cell joined with `,`
 * (`-` for the template's own), and, only when one was picked, the
 * background color as six hex digits (M8: `.../-,-,-,-,-,-,-,-/1b2a55`; a
 * link without it reads as the template's own, so older links still do).
 * `a=` is the avatar part's own link, so the avatar page would read the
 * same fragment. The other people the maker chose (M8: a friend pasted,
 * opened or brought along, anyone dressed by hand with Customize) follow,
 * each in the avatar link's own shape under its role's id
 * (`&friend=1.deep.black...&other=1.fair....`), so the meme opens with the
 * very people it was made with; a crowd role with nobody chosen is left
 * out, and the friend who opens it gets someone from their own crowd.
 *
 * EVERY CHARACTER IS ONE A URL CARRIES AS IT IS (Steve's QA, 2026-10-28).
 * Version 1 joined the captions with `|`, which is not one, so a browser
 * or an app on the way may write it `%7C`, and three captions arrived as
 * one: "ME|WORK|MEMES". A `~` is unreserved: nothing has cause to touch
 * it, and since a caption's own `~` is escaped, a bare one is always the
 * join. A version 1 link is still read, its joins as `|` or `%7C` (one
 * from before the change has no other way to say it).
 *
 * NOTHING IN A LINK IS TRUSTED. The decoder gives up on anything over
 * `max`, an unknown version, no template or an unknown one, and hands what
 * is left to `normalizeMeme`. A link with a known template and broken
 * captions degrades to that template with empty captions, which is better
 * than a blank page for a shared link. Captions come back as text and are
 * only ever put into inputs' values and drawn with fillText.
 *
 * A link that would run past `max` is trimmed by the encoder, the longest
 * caption first, so a share never fails for a long line: a chat shows the
 * first part of it rather than nothing.
 */

import { encodeLink, decodeLink } from '../../shared/js/avatar-1.0.0.min.js';

export const REMIX_VERSION = 2;

/** What joins the captions, by the link's version. */
const JOIN = Object.freeze({ 1: /\||%7C/i, 2: '~' });

/** A caption as it travels: percent-encoded, a `~` too (the join), a space
 *  as `+`. */
export function encodeCaption(text) {
    return encodeURIComponent(String(text == null ? '' : text)).replace(/~/g, '%7E').replace(/%20/g, '+');
}

/** A caption read back, or null for one that cannot be read. */
export function decodeCaption(text) {
    try {
        return decodeURIComponent(String(text).replace(/\+/g, '%20'));
    } catch (e) {
        return null;
    }
}

/** The `m=` part alone for a meme (the normalized object from state.js). */
export function encodeMeme(meme) {
    const captions = meme.captions.map(encodeCaption).join(JOIN[REMIX_VERSION]);
    const faces = meme.expressions.map((e) => e || '-').join(',');
    const tint = meme.tint ? `/${meme.tint.slice(1)}` : '';
    return `m=${REMIX_VERSION}/${meme.template}/${captions}/${faces}${tint}`;
}

/** The people part of a link: each chosen person's avatar link under the
 *  role's id (`friend=1.deep....`), the friend first, then the cast by
 *  role id. Empty for nobody. With the catalog (`templates`), only the
 *  people the meme's own template has a crowd role for go: a meme keeps
 *  everyone dressed this visit, and one with no role for them would carry
 *  them for nothing, at the captions' expense near the ceiling. */
export function encodePeople(meme, templates = null) {
    const template = templates ? templates.find((t) => t.id === meme.template) : null;
    const wanted = (id) => !templates || Boolean(template && template.roles.some((r) => r.id === id && r.cast === 'random'));
    const people = [];
    if (meme.friend && wanted('friend')) people.push(['friend', meme.friend]);
    for (const id of Object.keys(meme.cast || {}).sort()) if (wanted(id)) people.push([id, meme.cast[id]]);
    return people.map(([id, a]) => `&${id}=${encodeLink(a).slice(2)}`).join('');
}

/**
 * The fragment (without the `#`) for `meme` (its people with it, only those
 * its template has a role for when `templates` is given) and the maker's
 * `avatar` (null for none), trimmed to `max` characters by shortening the
 * longest caption a character at a time.
 */
export function encodeRemix(meme, avatar = null, { max = 2000, templates = null } = {}) {
    const captions = meme.captions.slice();
    const people = encodePeople(meme, templates);
    const build = () => {
        const part = encodeMeme({ ...meme, captions });
        return `${avatar ? `${part}&${encodeLink(avatar)}` : part}${people}`;
    };
    let out = build();
    while (out.length > max) {
        let k = -1;
        captions.forEach((c, i) => { if (c.length && (k < 0 || c.length > captions[k].length)) k = i; });
        if (k < 0) break;
        captions[k] = captions[k].slice(0, -1);
        out = build();
    }
    return out;
}

/**
 * The meme and the avatar a fragment carries (`#m=...`, with or without
 * the `#`, among other `&` parts), as `{ meme, avatar }` with `meme` made
 * valid by `rules` (state.js's normalizeMeme's), the people the maker
 * chose in its `friend` and `cast`, or null when there is no meme in it, it
 * is too long, or its version or template is not one this reads. `avatar`
 * is null when the link carries none.
 */
export function decodeRemix(hash, rules, { max = 2000, normalize } = {}) {
    if (typeof hash !== 'string' || hash.length > max) return null;
    const part = hash.replace(/^#/, '').split('&').find((p) => p.startsWith('m='));
    if (!part) return null;
    const [version, template, captionText = '', faceText = '', tintText = ''] = part.slice(2).split('/');
    if (!Object.prototype.hasOwnProperty.call(JOIN, version)) return null;
    if (!rules.templates.some((t) => t.id === template)) return null;
    const decoded = captionText === '' ? [] : captionText.split(JOIN[version]).map(decodeCaption);
    const captions = decoded.some((c) => c === null) ? [] : decoded;
    const expressions = faceText === '' ? [] : faceText.split(',').map((f) => (f === '-' ? null : f));
    const tint = /^[0-9a-fA-F]{6}$/.test(tintText) ? `#${tintText}` : null;
    // Each part alone goes to the avatar's decoder: its own ceiling is sized
    // for a link that holds nothing else. A person is read for a crowd role
    // of this template alone, under the role's own id.
    const parts = hash.replace(/^#/, '').split('&');
    const personOf = (id) => {
        const p = parts.find((x) => x.startsWith(`${id}=`));
        return p ? decodeLink(`a=${p.slice(id.length + 1)}`) : null;
    };
    const roles = rules.templates.find((t) => t.id === template).roles.filter((r) => r.cast === 'random');
    let friend = null;
    const cast = {};
    for (const role of roles) {
        const person = personOf(role.id);
        if (!person) continue;
        if (role.id === 'friend') friend = person;
        else cast[role.id] = person;
    }
    const meme = normalize({ template, captions, expressions, tint, friend, cast }, rules);
    const avatarPart = parts.find((p) => p.startsWith('a='));
    return { meme, avatar: avatarPart ? decodeLink(avatarPart) : null };
}

/** The whole address of the page carrying `meme` and `avatar`, from the
 *  page's own `href` (an explicit index.html resolved away). */
export function remixUrl(meme, avatar, href, options) {
    let base;
    try {
        base = new URL('.', href).href;
    } catch (e) {
        base = String(href || '');
    }
    return `${base}#${encodeRemix(meme, avatar, options)}`;
}
