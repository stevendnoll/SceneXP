// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * gallery.js — this experience's gallery content model.
 *
 * The framed-piece machinery (procedural canvas art, placards, picture
 * lights, clickable floor mats, NPC viewing waypoints) lives in the shared
 * part ../../shared/js/gallery-1.0.0.js. This thin module owns only the
 * content: the GALLERY_SECTIONS array below, handed to the shared builder
 * together with this experience's room dimensions. To hang art on the
 * walls, add entries here (id, title, subtitle, url, accent, motif, and an
 * optional wall: 'back').
 */

import { STORE_CONFIG } from './store.min.js';
import { initGallery as buildGallery } from '../../shared/js/gallery-1.0.0.min.js';

// Tire shop theme: the waiting room's framed decor is built in store.js,
// so no generated pieces hang here and the array stays empty. An empty array means
// the shared builder hangs no wall pieces (and no floor mats) while keeping
// the gallery plumbing (raycast seam, viewing waypoints) intact.
export const GALLERY_SECTIONS = [];

/**
 * Build the gallery pieces and add them to the scene.
 * Call after initStore() so STORE_CONFIG.depth/positionZ are finalized.
 */
export function initGallery() {
    buildGallery({ sections: GALLERY_SECTIONS, storeConfig: STORE_CONFIG });
}

// The accessors main.js and the shared parts consume, straight from the part.
export {
    getGalleryGroup, getMatsGroup, getGalleryPieces, getViewingWaypoints,
    resolveGalleryPiece, setPieceHighlight, __test__
} from '../../shared/js/gallery-1.0.0.min.js';
