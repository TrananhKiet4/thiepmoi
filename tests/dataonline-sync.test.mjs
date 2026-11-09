import assert from 'node:assert/strict';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {join, resolve, sep} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {dependenciesMatch} from '../scripts/prepare-dataonline-sync.mjs';

const composer = {name: 'trananhkiet4/thiepmoi', extra: {'aws/aws-sdk-php': ['S3']}};
const first = {name: 'vendor/first', version: '1.0.0', dist: {reference: 'first-sha', shasum: ''}};
const second = {name: 'vendor/second', version: '2.0.0', source: {reference: 'second-sha'}};
const lock = {packages: [first, second]};
assert(dependenciesMatch(composer, lock, composer, {packages: [second, first]}));
assert(!dependenciesMatch(composer, lock, composer, null));
assert(!dependenciesMatch(composer, lock, composer, {packages: [first]}));
assert(!dependenciesMatch(composer, lock, composer, {packages: [first, {...second, version: '2.1.0'}]}));
assert(!dependenciesMatch(composer, lock, composer, {packages: [first, {...second, source: {reference: 'different'}}]}));
assert(!dependenciesMatch(composer, lock, {extra: {'aws/aws-sdk-php': ['S3', 'Ses']}}, {packages: [first, second]}));
assert(!dependenciesMatch(composer, lock, composer, {packages: [null]}));
const temporary = mkdtempSync(join(tmpdir(), 'dataonline-sync-test-'));
try {
  const app = join(temporary, 'dataonline/release/thiepmoi-app');
  mkdirSync(join(app, 'vendor/composer'), {recursive: true});
  mkdirSync(join(app, 'vendor/example'), {recursive: true});
  writeFileSync(join(app, 'composer.json'), JSON.stringify(composer));
  writeFileSync(join(app, 'composer.lock'), JSON.stringify(lock));
  writeFileSync(join(app, 'vendor/autoload.php'), 'autoload fixture');
  writeFileSync(join(app, 'vendor/composer/metadata.php'), 'metadata fixture');
  writeFileSync(join(app, 'vendor/example/library.php'), 'dependency fixture');
  writeFileSync(join(temporary, 'dataonline-remote-composer.json'), JSON.stringify(composer));
  writeFileSync(join(temporary, 'dataonline-remote-installed.json'), JSON.stringify({packages: [second, first]}));
  const output = join(temporary, 'output.txt');
  const result = spawnSync(process.execPath, ['scripts/prepare-dataonline-sync.mjs'], {
    env: {...process.env, RUNNER_TEMP: temporary, GITHUB_OUTPUT: output}, encoding: 'utf8', windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(output, 'utf8'), 'dependencies_changed=false\n');
  assert(!existsSync(join(app, 'vendor/example')));
  assert.equal(readFileSync(join(app, 'vendor/composer/metadata.php'), 'utf8'), 'metadata fixture');
  assert.equal(readFileSync(join(temporary, 'dataonline/vendor/example/library.php'), 'utf8'), 'dependency fixture');
} finally {
  assert(resolve(temporary).startsWith(resolve(tmpdir()) + sep + 'dataonline-sync-test-'));
  rmSync(temporary, {recursive: true, force: true});
}
console.log('Data Online dependency reuse checks passed.');
