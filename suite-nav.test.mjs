import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('Stolen Minutes kicker links to 5M Control', () => {
  assert.match(html, /class="family-control" href="https:\/\/control\.hope-johnstone\.com"/);
  assert.match(html, /5 Million Minutes/);
});
