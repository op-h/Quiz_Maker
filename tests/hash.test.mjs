// Pins the answer-hashing to known SHA-256 values so the builder's hashing
// (challenges.js) can never silently drift from the exam runtime's grader.
// Run: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Load challenges.js into a minimal window shim (it attaches to window.CTF_DATA).
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'challenges.js'), 'utf8');
const win = {};
const sandbox = { window: win, localStorage: { getItem: () => null, setItem: () => {} }, TextEncoder, console };
new Function('window', 'localStorage', 'TextEncoder', 'console', src)(win, sandbox.localStorage, TextEncoder, console);
const C = win.CTF_DATA;

test('CTF_DATA exposes the hashing API', () => {
  assert.equal(typeof C.encodeInput, 'function');
  assert.equal(typeof C.verifyInput, 'function');
  assert.equal(typeof C.normalizeInput, 'function');
});

test('encodeInput matches canonical SHA-256 (lowercased+trimmed)', () => {
  // Canonical SHA-256 test vectors.
  assert.equal(C.encodeInput('hello'), '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  assert.equal(C.encodeInput('hello world'), 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
  assert.equal(C.encodeInput(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});

test('normalization: case + surrounding whitespace ignored', () => {
  const h = C.encodeInput('hello');
  assert.equal(C.encodeInput('  HELLO  '), h);
  assert.equal(C.encodeInput('Hello'), h);
});

test('multi-word + unicode are stable', () => {
  // Spaces preserved inside; only ends trimmed.
  assert.equal(C.encodeInput('responsive design'), C.encodeInput('  Responsive Design '));
  // Unicode should hash deterministically (not asserting a literal, just stability + length).
  const u = C.encodeInput('café');
  assert.match(u, /^[0-9a-f]{64}$/);
  assert.equal(u, C.encodeInput('CAFÉ'.toLowerCase()));
});

test('verifyInput accepts the correct answer and rejects wrong ones', () => {
  const hash = C.encodeInput('paris');
  assert.equal(C.verifyInput('Paris', hash), true);
  assert.equal(C.verifyInput('  paris ', hash), true);
  assert.equal(C.verifyInput('london', hash), false);
  assert.equal(C.verifyInput('paris', ''), false);
});

test('legacy 8-char FNV hashes still verify (backward compat)', () => {
  const legacy = C.legacyEncodeInput('body');
  assert.match(legacy, /^[0-9a-f]{8}$/);
  assert.equal(C.verifyInput('body', legacy), true);
  assert.equal(C.verifyInput('span', legacy), false);
});
