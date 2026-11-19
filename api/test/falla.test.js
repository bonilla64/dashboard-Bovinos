import { test } from 'node:test';
import assert from 'node:assert/strict';

test('prueba que falla a propósito', () => {
  assert.equal(1 + 1, 3);
});