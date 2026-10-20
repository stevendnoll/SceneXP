// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * fans.js - A fan in the stands, built from the same figure as the players.
 *
 * THE BAKING IS SHARED NOW (www/shared/js/crowd-1.0.0.js, promoted from
 * here on 2026-10-19 for Derby Day's crowd). This keeps what is X's and O's
 * own: the fans' scale (config `crowd.scale`) and their three arm poses
 * (down, up, and holding a card), with the names spectacle.js and the
 * suites have always used. The shared part's defaults ARE this scene's
 * settings, so a fan is built exactly as it was.
 */
import { buildCrowdParts, crowdCost, mergePieces as merge, TAG as TAGS, HAIR as STYLES } from '../../shared/js/crowd-1.0.0.min.js';
import { XO_CONFIG as CFG } from './config.min.js';

/** The arm poses a fan can be drawn in. */
export const POSES = ['down', 'up', 'cards'];

/** The hair styles a fan can wear, besides none at all. */
export const HAIR = [...STYLES];

/** The colours a fan is dressed in to find its parts again (shared). */
export const TAG = TAGS;

/** Merge baked pieces into one geometry (shared). */
export const mergePieces = merge;

/**
 * THE FAN, IN PIECES, ready to instance, built once per visit (see the
 * shared part for every piece). Returns null under the test stub.
 */
export function buildFanParts() {
    return buildCrowdParts({ scale: CFG.crowd.scale, poses: POSES });
}

/** Vertices and triangles in one fan as drawn in one pose, for the budget. */
export function fanCost(parts, pose = 'down', hair = 'short') {
    return crowdCost(parts, pose, hair);
}
