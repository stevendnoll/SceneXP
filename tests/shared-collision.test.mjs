// © 2026 Continuum Commerce LLC. MIT licensed.
/**
 * Unit tests for www/shared/js/collision-1.0.0.js — the player AABB collision
 * with wall-sliding.
 *
 * The module is pure with respect to world state (the caller supplies the
 * collider list), but it does real box math, so the THREE stub here is a
 * working Vector3/Box3 rather than a chainable proxy: intersections must
 * actually intersect for the slide logic to mean anything.
 */
import { jest } from '@jest/globals';

class MiniVector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
}

class MiniBox3 {
  constructor(min = { x: 0, y: 0, z: 0 }, max = { x: 0, y: 0, z: 0 }) {
    this.min = { ...min };
    this.max = { ...max };
  }
  setFromCenterAndSize(center, size) {
    this.min = { x: center.x - size.x / 2, y: center.y - size.y / 2, z: center.z - size.z / 2 };
    this.max = { x: center.x + size.x / 2, y: center.y + size.y / 2, z: center.z + size.z / 2 };
    return this;
  }
  intersectsBox(other) {
    return this.min.x <= other.max.x && this.max.x >= other.min.x &&
           this.min.y <= other.max.y && this.max.y >= other.min.y &&
           this.min.z <= other.max.z && this.max.z >= other.min.z;
  }
}

let checkCollision;

beforeAll(async () => {
  globalThis.THREE = { Vector3: MiniVector3, Box3: MiniBox3 };
  jest.resetModules();
  ({ checkCollision } = await import('../www/shared/js/collision-1.0.0.js'));
});

afterAll(() => {
  delete globalThis.THREE;
});

// A wall as the world modules register them: an { box } entry.
const wall = (minX, maxX, minZ, maxZ) =>
  ({ box: new MiniBox3({ x: minX, y: 0, z: minZ }, { x: maxX, y: 3, z: maxZ }) });

const pos = (x, z) => ({ x, y: 1.7, z });
const RADIUS = 0.35;

test('a clear move passes through untouched', () => {
  const out = checkCollision(pos(0, 0), pos(0.5, -0.5), RADIUS, [wall(5, 6, -10, 10)]);
  expect(out.x).toBeCloseTo(0.5);
  expect(out.z).toBeCloseTo(-0.5);
});

test('walking obliquely into a north wall slides along X', () => {
  // Wall across z = -2; the player strafes diagonally toward it.
  const out = checkCollision(pos(0, -1), pos(0.4, -1.8), RADIUS, [wall(-10, 10, -2.2, -2)]);
  expect(out.x).toBeCloseTo(0.4);  // the X component survives
  expect(out.z).toBeCloseTo(-1);   // the Z component is stopped
});

test('walking obliquely into an east wall slides along Z', () => {
  const out = checkCollision(pos(1, 0), pos(1.8, 0.4), RADIUS, [wall(2, 2.2, -10, 10)]);
  expect(out.x).toBeCloseTo(1);
  expect(out.z).toBeCloseTo(0.4);
});

test('a corner pocket stops the player where they stand', () => {
  const boxes = [wall(-10, 10, -2.2, -2), wall(2, 2.2, -10, 10)];
  const out = checkCollision(pos(1.8, -1.8), pos(2.1, -2.1), RADIUS, boxes);
  expect(out.x).toBeCloseTo(1.8);
  expect(out.z).toBeCloseTo(-1.8);
});

test('grazing an outside corner prefers the larger slide', () => {
  // A pillar clipped only by the combined diagonal: each single-axis slide is
  // clear on its own, and the more substantial one (X here) wins.
  const boxes = [wall(0.9, 1.4, 0.8, 1.3)];
  const out = checkCollision(pos(0.3, 0.3), pos(0.9, 0.5), RADIUS, boxes);
  expect(out.x).toBeCloseTo(0.9);
  expect(out.z).toBeCloseTo(0.3);
});

test('a flying player passes over a low box (Y matters)', () => {
  const lowBox = { box: new MiniBox3({ x: -1, y: 0, z: -1 }, { x: 1, y: 0.2, z: 1 }) };
  // Player center is at newPos.y - 0.85 with a 1.7m tall box: feet at ~0.85.
  const out = checkCollision({ x: -2, y: 2.6, z: 0 }, { x: 0, y: 2.6, z: 0 }, RADIUS, [lowBox]);
  expect(out.x).toBeCloseTo(0);
});
