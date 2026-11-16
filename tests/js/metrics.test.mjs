import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  earFromPoints,
  eulerFromMatrix,
  marFromPoints,
  median,
  mean,
  blendshapeMean,
  landmarksBox,
} from '../../web/js/metrics.js';
import { angleDiff } from '../../web/js/fatigue.js';

const fixtures = JSON.parse(readFileSync(new URL('../fixtures/metrics_cases.json', import.meta.url)));
const P = ([x, y]) => ({ x, y });

test('EAR matches the shared fixtures', () => {
  for (const c of fixtures.ear) {
    const got = earFromPoints(c.points.map(P), c.width, c.height);
    assert.ok(Math.abs(got - c.expected) < 1e-6, `${c.name}: ${got} != ${c.expected}`);
  }
});

test('MAR matches the shared fixtures', () => {
  for (const c of fixtures.mar) {
    const pairs = c.pairs.map(([u, d]) => [P(u), P(d)]);
    const got = marFromPoints(P(c.left), P(c.right), pairs, c.width, c.height);
    assert.ok(Math.abs(got - c.expected) < 1e-6, `${c.name}: ${got} != ${c.expected}`);
  }
});

test('EAR returns null for a degenerate eye', () => {
  const p = Array.from({ length: 6 }, () => ({ x: 0.5, y: 0.5 }));
  assert.equal(earFromPoints(p), null);
});

function rotX(deg, colMajor, tz = -40) {
  const a = (deg * Math.PI) / 180;
  const R = [
    [1, 0, 0],
    [0, Math.cos(a), -Math.sin(a)],
    [0, Math.sin(a), Math.cos(a)],
  ];
  const M = [
    [...R[0], 0],
    [...R[1], 0],
    [...R[2], tz],
    [0, 0, 0, 1],
  ];
  const data = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) data.push(colMajor ? M[j][i] : M[i][j]);
  return { rows: 4, columns: 4, data };
}

test('head pitch is recovered in both matrix layouts', () => {
  for (const colMajor of [true, false]) {
    const { pitch, yaw, roll } = eulerFromMatrix(rotX(30, colMajor));
    assert.ok(Math.abs(Math.abs(pitch) - 30) < 1e-6, `pitch ${pitch}`);
    assert.ok(Math.abs(yaw) < 1e-6);
    assert.ok(Math.abs(roll) < 1e-6);
  }
  assert.deepEqual(eulerFromMatrix(null), { pitch: null, yaw: null, roll: null });
});

test('angleDiff wraps around ±180°', () => {
  assert.equal(angleDiff(179, -179), -2);
  assert.equal(angleDiff(-179, 179), 2);
  assert.equal(angleDiff(10, 0), 10);
});

test('statistics helpers ignore missing values', () => {
  assert.equal(median([3, null, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([null]), null);
  assert.equal(mean([1, 2, undefined, 3]), 2);
});

test('blendshapeMean and landmarksBox', () => {
  const cats = [
    { categoryName: 'eyeBlinkLeft', score: 0.2 },
    { categoryName: 'eyeBlinkRight', score: 0.4 },
  ];
  assert.ok(Math.abs(blendshapeMean(cats, ['eyeBlinkLeft', 'eyeBlinkRight']) - 0.3) < 1e-9);
  assert.equal(blendshapeMean(cats, ['jawOpen']), null);
  const box = landmarksBox([{ x: 0.2, y: 0.3 }, { x: 0.6, y: 0.9 }]);
  assert.ok(Math.abs(box.w - 0.4) < 1e-9 && Math.abs(box.h - 0.6) < 1e-9);
});
