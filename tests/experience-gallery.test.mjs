// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Coverage for the per-experience gallery.js adapters (dad, family,
 * interstate, roqui, seedtoseed, steve). Since the framed-piece machinery
 * moved to the shared part (covered in shared-gallery.test.mjs), each
 * experience's gallery.js is a thin content module: it owns GALLERY_SECTIONS
 * and hands the shared builder its room dimensions.
 *
 * Per adapter this verifies the contract main.js relies on: the shipped
 * array is empty, initGallery() wires the experience's STORE_CONFIG through
 * to the shared part (the built .min sibling, whose module state these
 * re-exported accessors read), the sections array is a live binding a
 * contributor can populate, and every re-export behaves.
 */
import { jest } from '@jest/globals';
import { installThree, installCanvas, installBrowserGlobals, uninstallAll } from './helpers/three-stub.mjs';

const EXPERIENCES = ['dad', 'family', 'interstate', 'roqui', 'seedtoseed', 'steve'];

beforeEach(() => {
  installThree();
  installCanvas();
  installBrowserGlobals();
  globalThis.document.addEventListener = () => {};
  globalThis.document.removeEventListener = () => {};
  globalThis.document.getElementById = () => null;
  globalThis.sessionStorage = { getItem: () => null, setItem: () => {} };
});

afterEach(() => {
  uninstallAll();
  delete globalThis.sessionStorage;
});

describe.each(EXPERIENCES.map((e) => [e]))('%s gallery.js adapter', (exp) => {
  test('ships empty, builds through the shared part, and re-exports the full surface', async () => {
    jest.resetModules();
    const scene = await import('../www/shared/js/scene-1.0.0.min.js');
    const gallery = await import(`../www/${exp}/js/gallery.js`);

    // The shipped content model is empty, and every re-export is present.
    expect(gallery.GALLERY_SECTIONS).toEqual([]);
    for (const fn of ['initGallery', 'getGalleryGroup', 'getMatsGroup', 'getGalleryPieces',
      'getViewingWaypoints', 'resolveGalleryPiece', 'setPieceHighlight']) {
      expect(typeof gallery[fn]).toBe('function');
    }
    expect(gallery.__test__).toBeTruthy();

    // Before initScene() the shared part declines politely.
    gallery.initGallery();
    expect(gallery.getGalleryGroup()).toBeNull();

    scene.initScene({}, { name: `${exp}-adapter-test` });

    // Shipped path: plumbing builds, nothing hangs, no waypoints.
    gallery.initGallery();
    expect(gallery.getGalleryGroup()).not.toBeNull();
    expect(gallery.getMatsGroup()).not.toBeNull();
    expect(gallery.getGalleryPieces()).toHaveLength(0);
    expect(gallery.getViewingWaypoints()).toEqual([]);

    // GALLERY_SECTIONS is a live binding: a contributor pushing a section and
    // rebuilding gets a piece, proving the adapter passes the array (and the
    // experience's STORE_CONFIG) through at call time rather than at import.
    gallery.GALLERY_SECTIONS.push({
      id: 'first', title: 'First', subtitle: 'A test piece',
      url: '/first.html', accent: '#e05252', motif: 'portrait',
    });
    gallery.initGallery();
    const pieces = gallery.getGalleryPieces();
    expect(pieces).toHaveLength(1);
    expect(pieces[0].section.id).toBe('first');
    expect(gallery.getViewingWaypoints()).toHaveLength(1);

    // The re-exported behaviors answer like the part itself.
    const data = { isGalleryPiece: true, galleryId: 'first' };
    const child = { userData: {}, parent: { userData: data, parent: null } };
    expect(gallery.resolveGalleryPiece(child)).toBe(data);
    expect(gallery.resolveGalleryPiece(null)).toBeNull();
    const fake = { artMesh: { material: { emissiveIntensity: 0 } }, baseEmissive: 0.32 };
    gallery.setPieceHighlight(fake, true);
    expect(fake.artMesh.material.emissiveIntensity).toBe(0.8);
    expect(gallery.__test__.STORE_CONFIG_HEIGHT_FALLBACK(undefined)).toBe(6);
  });
});
