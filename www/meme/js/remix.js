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
 *   #m=1/panic/first+line|second|third/-,rage,-,-,-,-&a=1.fair.darkBrown....
 *
 * `m=` is the meme: the link's version, the template's id, the captions by
 * slot joined with `|` (each percent-encoded, a space written `+` so a line
 * of words stays readable in a chat), and the faces by cell joined with
 * `,` (`-` for the template's own). `a=` is the avatar part's own link, so
 * the avatar page would read the same fragment.
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

export const REMIX_VERSION = 1;

/** A caption as it travels: percent-encoded, a space as `+`. */
export function encodeCaption(text) {
    return encodeURIComponent(String(text == null ? '' : text)).replace(/%20/g, '+');
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
    const captions = meme.captions.map(encodeCaption).join('|');
    const faces = meme.expressions.map((e) => e || '-').join(',');
    return `m=${REMIX_VERSION}/${meme.template}/${captions}/${faces}`;
}

/**
 * The fragment (without the `#`) for `meme` and the maker's `avatar`
 * (null for none), trimmed to `max` characters by shortening the longest
 * caption a character at a time.
 */
export function encodeRemix(meme, avatar = null, { max = 2000 } = {}) {
    const captions = meme.captions.slice();
    const build = () => {
        const part = encodeMeme({ ...meme, captions });
        return avatar ? `${part}&${encodeLink(avatar)}` : part;
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
 * valid by `rules` (state.js's normalizeMeme's), or null when there is no
 * meme in it, it is too long, or its version or template is not one this
 * reads. `avatar` is null when the link carries none.
 */
export function decodeRemix(hash, rules, { max = 2000, normalize } = {}) {
    if (typeof hash !== 'string' || hash.length > max) return null;
    const part = hash.replace(/^#/, '').split('&').find((p) => p.startsWith('m='));
    if (!part) return null;
    const [version, template, captionText = '', faceText = ''] = part.slice(2).split('/');
    if (version !== String(REMIX_VERSION)) return null;
    if (!rules.templates.some((t) => t.id === template)) return null;
    const decoded = captionText === '' ? [] : captionText.split('|').map(decodeCaption);
    const captions = decoded.some((c) => c === null) ? [] : decoded;
    const expressions = faceText === '' ? [] : faceText.split(',').map((f) => (f === '-' ? null : f));
    const meme = normalize({ template, captions, expressions }, rules);
    // The avatar part alone goes to the avatar's decoder: its own ceiling
    // is sized for a link that holds nothing else.
    const avatarPart = hash.replace(/^#/, '').split('&').find((p) => p.startsWith('a='));
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
