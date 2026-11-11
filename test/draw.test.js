'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { draw, canGive } = require('../lib/draw');

const family = [
  { id: 'a', name: 'Alice', household: 'Smith' },
  { id: 'b', name: 'Bob', household: 'Smith' },
  { id: 'c', name: 'Carol', household: 'Jones' },
  { id: 'd', name: 'Dan', household: 'jones ' },
  { id: 'e', name: 'Eve', household: '' },
  { id: 'f', name: 'Frank', household: '', exclusions: ['e'] },
];

function check(people, result) {
  const byId = Object.fromEntries(people.map((p) => [p.id, p]));
  assert.deepStrictEqual(Object.keys(result).sort(), people.map((p) => p.id).sort());
  assert.strictEqual(new Set(Object.values(result)).size, people.length, 'each person drawn exactly once');
  for (const [g, r] of Object.entries(result)) assert.ok(canGive(byId[g], byId[r]), `${g} -> ${r}`);
}

test('everyone gets exactly one valid person, many times over', () => {
  for (let i = 0; i < 500; i++) check(family, draw(family));
});

test('households and exclusions are respected (case/space-insensitive)', () => {
  assert.strictEqual(canGive(family[0], family[1]), false);
  assert.strictEqual(canGive(family[2], family[3]), false);
  assert.strictEqual(canGive(family[4], family[5]), false); // Frank excludes Eve, so Eve can't draw Frank either
  assert.strictEqual(canGive(family[4], family[0]), true);
  assert.strictEqual(canGive(family[0], family[0]), false);
});

test('impossible draws throw a helpful error', () => {
  assert.throws(() => draw([{ id: 'a', name: 'A' }]), /at least 2/);
  assert.throws(() => draw([
    { id: 'a', name: 'A', household: 'x' }, { id: 'b', name: 'B', household: 'x' },
  ]), /Loosen|No valid draw/);
  assert.throws(() => draw([
    { id: 'a', name: 'A', household: 'x' }, { id: 'b', name: 'B', household: 'x' }, { id: 'c', name: 'C' },
  ]), /No valid draw/);
});

test('is reasonably random', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(JSON.stringify(draw(family)));
  assert.ok(seen.size > 5);
});
