// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * transfer.js - taking the avatar to another device (PRD section 6), and the
 * way back to the scene that sent the visitor here.
 *
 * THE WAY BACK IS CHECKED, so `?return=` can never send a visitor anywhere a
 * stranger chose (an open redirect). Only the home page and the scenes in the
 * site's own catalog (promo-1.0.0's EXPERIENCES, which the directory suite
 * holds to the home page) are accepted, written exactly as `/leaves/`.
 *
 * A FILE IS READ ONLY WHEN IT IS SMALL. The size is checked before a byte is
 * read, and what is read goes through avatar-1.0.0's `fromFile` (JSON parsed
 * inside try, the marker checked, every field reduced to a known id). The
 * avatar it holds is never kept until the visitor says so.
 */

import { fromFile, MAX_FILE } from '../../shared/js/avatar-1.0.0.min.js';
import { EXPERIENCES } from '../../shared/js/promo-1.0.0.min.js';

/**
 * Where "Back to ..." goes, from the page's query string: `{ path, name }`,
 * or null when there is no `return`, or it is not the home page or one of
 * the site's scenes, written exactly.
 */
export function returnTarget(search, experiences = EXPERIENCES) {
    let path = null;
    try {
        path = new URLSearchParams(String(search || '')).get('return');
    } catch (e) {
        return null;
    }
    if (!path) return null;
    if (path === '/') return { path: '/', name: 'SceneXP' };
    const found = experiences.find((e) => `/${e.slug}/` === path);
    return found ? { path, name: found.title } : null;
}

/**
 * The avatar in a file the visitor opened: `{ avatar }`, or `{ error }`:
 * 'none' (no file), 'large' (bigger than any avatar file), 'unreadable' (the
 * browser could not read it), or 'not-avatar' (not a SceneXP avatar).
 */
export async function readAvatarFile(file) {
    if (!file) return { error: 'none' };
    if (!(file.size <= MAX_FILE)) return { error: 'large' };
    let text;
    try {
        text = await file.text();
    } catch (e) {
        return { error: 'unreadable' };
    }
    const avatar = fromFile(text);
    return avatar ? { avatar } : { error: 'not-avatar' };
}

/** What the page says when a file cannot be used. */
export const FILE_ERRORS = Object.freeze({
    none: '',
    large: 'That file is too large to be an avatar file. Please choose scenexp-avatar.json.',
    unreadable: 'This browser could not read that file. Please try it again.',
    'not-avatar': "That file doesn't hold a SceneXP avatar. Please choose scenexp-avatar.json."
});
