import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const distIndexPath = join(process.cwd(), 'dist', 'index.html');

assert.equal(existsSync(distIndexPath), true, 'dist/index.html must exist; run npm run build before this check');

const html = readFileSync(distIndexPath, 'utf8');

assert.doesNotMatch(html, /(?:src|href)="\/assets\//, 'built asset paths must be relative for GitHub Pages project paths');
assert.match(html, /(?:src|href)="\.\/assets\//, 'built asset paths should point to ./assets/');

console.log('static build asset paths passed');
