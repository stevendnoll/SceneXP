// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Coverage for the shared gallery part (www/shared/js/gallery-1.0.0.js), the
 * framed-wall-art machinery every explorable experience's thin gallery.js
 * adapter drives. All shipped adapters carry an empty GALLERY_SECTIONS array,
 * so the live sites only ever run the "no wall pieces" path -- but the full
 * pipeline (frames, mats, placards, procedural canvas art, faked spotlights,
 * floor mats, viewing waypoints) is the seam future contributors will hang
 * art on, so it gets a full synthetic build here.
 *
 * Two passes:
 *  1. the builds: declined before initScene, the empty no-args build, then a
 *     populated build covering both wall layouts and every drawIcon motif
 *     including the default;
 *  2. the pure exports: resolveGalleryPiece's parent-chain walk,
 *     setPieceHighlight's observable emissive writes, and the __test__
 *     helpers (spreadAcross, computeLayout, STORE_CONFIG_HEIGHT_FALLBACK).
 *
 * Under the chainable THREE proxy nothing renders, but every build function
 * runs, so a broken import or a refactor leftover throws here first.
 */
import { jest } from '@jest/globals';
import { installThree, installCanvas, installBrowserGlobals, uninstallAll } from './helpers/three-stub.mjs';

// A room the size the experiences use, in the shape initGallery destructures.
const FAKE_STORE_CONFIG = {
  width: 20,
  depth: 30,
  positionX: 0,
  positionZ: 0,
  wallThickness: 0.3,
  height: 6,
};

// Synthetic content model: five side-wall sections (odd count, so the last
// row holds a single left-wall piece) and two back-wall sections. Together
// they hit every drawIcon motif plus the default branch ('mystery').
const TEST_SECTIONS = [
  { id: 'about', title: 'About', subtitle: 'The story', url: '/about.html', accent: '#e05252', motif: 'portrait' },
  { id: 'work', title: 'Work', subtitle: 'The tiles', url: '/work.html', accent: '#52a7e0', motif: 'grid' },
  { id: 'blog', title: 'Blog', subtitle: 'The page', url: '/blog.html', accent: '#67b26f', motif: 'lines' },
  { id: 'contact', title: 'Contact', subtitle: 'The envelope', url: '/contact.html', accent: '#e0a852', motif: 'nodes' },
  { id: 'three', title: '3D', subtitle: 'The cube', url: '/3d.html', accent: '#8e6fd8', motif: 'cube' },
  { id: 'ai', title: 'AI', subtitle: 'The sparkle', url: '/ai.html', accent: '#d86fb8', motif: 'spark', wall: 'back' },
  { id: 'else', title: 'Else', subtitle: 'The fallback dot', url: '/else.html', accent: '#556677', motif: 'mystery', wall: 'back' },
];

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

test('builds nothing before the scene, plumbing when empty, and full walls when fed sections', async () => {
  jest.resetModules();
  // The part imports getScene from the BUILT scene module, so drive that same
  // instance here (the reason `npm run build` precedes `npm test`).
  const scene = await import('../www/shared/js/scene-1.0.0.min.js');
  const gallery = await import('../www/shared/js/gallery-1.0.0.js');

  // Before initScene() there is no scene: initGallery() declines politely.
  gallery.initGallery({ sections: TEST_SECTIONS, storeConfig: FAKE_STORE_CONFIG });
  expect(gallery.getGalleryGroup()).toBeNull();
  expect(gallery.getMatsGroup()).toBeNull();

  scene.initScene({}, { name: 'gallery-part-test' });

  // The shipped path: no arguments at all (every adapter's array is empty, and
  // the defaults must hold on their own). Plumbing builds, nothing hangs.
  gallery.initGallery();
  expect(gallery.getGalleryGroup()).not.toBeNull();
  expect(gallery.getMatsGroup()).not.toBeNull();
  expect(gallery.getGalleryPieces()).toHaveLength(0);
  expect(gallery.getViewingWaypoints()).toEqual([]);

  // The populated path runs createPiece, createPieceMat, addSpotlight,
  // makeArtTexture/drawIcon (every motif), and makePlacard.
  gallery.initGallery({ sections: TEST_SECTIONS.map((s) => ({ ...s })), storeConfig: FAKE_STORE_CONFIG });

  const pieces = gallery.getGalleryPieces();
  expect(pieces).toHaveLength(TEST_SECTIONS.length);
  pieces.forEach((p) => {
    expect(p.group).toBeTruthy();
    expect(p.artMesh).toBeTruthy();
    expect(p.baseEmissive).toBe(0.32);
  });
  expect(pieces.map((p) => p.section.id).sort()).toEqual(
    TEST_SECTIONS.map((s) => s.id).sort()
  );

  // One viewing waypoint per piece, at both the default and a custom
  // standoff; positions are finite numbers and every piece is represented.
  const waypoints = gallery.getViewingWaypoints();
  expect(waypoints).toHaveLength(TEST_SECTIONS.length);
  waypoints.forEach((w) => {
    // x/z come out as real numbers (the arithmetic coerces the stubbed
    // position fields); lookAtX/lookAtZ are the raw stubbed fields, so
    // coerce before asserting.
    [w.x, w.z].forEach((n) => expect(Number.isFinite(n)).toBe(true));
    [w.lookAtX, w.lookAtZ].forEach((n) => expect(Number.isFinite(Number(n))).toBe(true));
  });
  expect(new Set(waypoints.map((w) => w.pieceId))).toEqual(
    new Set(TEST_SECTIONS.map((s) => s.id))
  );
  expect(gallery.getViewingWaypoints(1.2)).toHaveLength(TEST_SECTIONS.length);

  // The highlight runs against real (stubbed) pieces in both directions,
  // and the guards swallow null and mesh-less arguments.
  gallery.setPieceHighlight(pieces[0], true);
  gallery.setPieceHighlight(pieces[0], false);
  gallery.setPieceHighlight(null, true);
  gallery.setPieceHighlight({ baseEmissive: 0.32 }, true);
});

test('resolveGalleryPiece walks parents, highlight writes are observable, layout helpers hold', async () => {
  jest.resetModules();
  const gallery = await import('../www/shared/js/gallery-1.0.0.js');
  const { spreadAcross, computeLayout, STORE_CONFIG_HEIGHT_FALLBACK } = gallery.__test__;

  // resolveGalleryPiece: a tagged object resolves to its own userData, a
  // descendant climbs to the tagged ancestor, and untagged chains (or no
  // object at all) resolve to null.
  const data = { isGalleryPiece: true, galleryId: 'about', galleryUrl: '/about.html', galleryTitle: 'About' };
  const root = { userData: data, parent: null };
  const child = { userData: {}, parent: root };
  const grandchild = { userData: {}, parent: child };
  expect(gallery.resolveGalleryPiece(root)).toBe(data);
  expect(gallery.resolveGalleryPiece(child)).toBe(data);
  expect(gallery.resolveGalleryPiece(grandchild)).toBe(data);
  expect(gallery.resolveGalleryPiece({ userData: {}, parent: null })).toBeNull();
  expect(gallery.resolveGalleryPiece({ parent: null })).toBeNull();
  expect(gallery.resolveGalleryPiece(null)).toBeNull();

  // setPieceHighlight against a plain fake, so the write is readable.
  const fake = { artMesh: { material: { emissiveIntensity: 0 } }, baseEmissive: 0.32 };
  gallery.setPieceHighlight(fake, true);
  expect(fake.artMesh.material.emissiveIntensity).toBe(0.8);
  gallery.setPieceHighlight(fake, false);
  expect(fake.artMesh.material.emissiveIntensity).toBe(0.32);

  // spreadAcross: a single piece centers, several spread symmetrically
  // across half the width (the corners stay clear), evenly stepped.
  expect(spreadAcross(1, 4, 20)).toEqual([4]);
  const xs = spreadAcross(4, 0, 20);
  expect(xs).toHaveLength(4);
  expect(xs[0]).toBeCloseTo(-5, 6);
  expect(xs[3]).toBeCloseTo(5, 6);
  for (let i = 1; i < xs.length; i++) {
    expect(xs[i] - xs[i - 1]).toBeCloseTo(10 / 3, 6);
  }

  // computeLayout: a single row sits at the room center; several rows march
  // from the entrance pad toward the back pad in even steps.
  expect(computeLayout(1, 30, 2)).toEqual([2]);
  const rows = computeLayout(3, 30, 0);
  expect(rows).toHaveLength(3);
  expect(rows[0]).toBeCloseTo(9, 6);    // depth/2 - frontPad(6)
  expect(rows[2]).toBeCloseTo(-10, 6);  // back row, backPad(5) short of the wall
  expect(rows[0]).toBeGreaterThan(rows[1]);
  expect(rows[1]).toBeGreaterThan(rows[2]);

  // The room-height fallback: reads the config's height, defaults to 6 when
  // the config is missing or silent.
  expect(STORE_CONFIG_HEIGHT_FALLBACK({ height: 4 })).toBe(4);
  expect(STORE_CONFIG_HEIGHT_FALLBACK({})).toBe(6);
  expect(STORE_CONFIG_HEIGHT_FALLBACK(undefined)).toBe(6);
});
