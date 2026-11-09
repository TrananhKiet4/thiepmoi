import assert from 'node:assert/strict';
import {appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, renameSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

function packageVersions(packages) {
  if (!Array.isArray(packages) || packages.some(item => typeof item?.name !== 'string' || typeof item?.version !== 'string')) return null;
  return packages.map(item => [item.name, item.version, item.dist?.reference ?? item.source?.reference ?? '', item.dist?.shasum ?? ''])
    .sort((first, second) => first[0].localeCompare(second[0]));
}

export function dependenciesMatch(composer, lock, remoteComposer, installed) {
  const expected = packageVersions(lock.packages);
  const actual = packageVersions(installed?.packages);
  const services = composer.extra?.['aws/aws-sdk-php'] ?? [];
  const remoteServices = remoteComposer?.extra?.['aws/aws-sdk-php'] ?? [];
  return expected !== null && actual !== null
    && JSON.stringify(expected) === JSON.stringify(actual)
    && Array.isArray(services) && Array.isArray(remoteServices)
    && JSON.stringify([...services].sort()) === JSON.stringify([...remoteServices].sort());
}

function main() {
  assert(process.env.RUNNER_TEMP && process.env.GITHUB_OUTPUT, 'Run this preparation step in GitHub Actions');
  const temporary = resolve(process.env.RUNNER_TEMP, 'dataonline');
  const app = resolve(temporary, 'release/thiepmoi-app');
  const composer = JSON.parse(readFileSync(resolve(app, 'composer.json'), 'utf8'));
  const lock = JSON.parse(readFileSync(resolve(app, 'composer.lock'), 'utf8'));
  const remoteComposer = JSON.parse(readFileSync(resolve(process.env.RUNNER_TEMP, 'dataonline-remote-composer.json'), 'utf8'));
  let installed = null;
  try {
    installed = JSON.parse(readFileSync(resolve(process.env.RUNNER_TEMP, 'dataonline-remote-installed.json'), 'utf8'));
  } catch {
    // Missing or invalid installation metadata requires a complete vendor sync.
  }
  assert(composer.name === 'trananhkiet4/thiepmoi' && remoteComposer.name === composer.name, 'Unexpected deployment destination');
  const changed = !dependenciesMatch(composer, lock, remoteComposer, installed);
  const vendor = resolve(temporary, 'vendor');
  assert(!existsSync(vendor), 'Vendor staging directory already exists');
  renameSync(resolve(app, 'vendor'), vendor);
  mkdirSync(resolve(app, 'vendor/composer'), {recursive: true});
  cpSync(resolve(vendor, 'composer'), resolve(app, 'vendor/composer'), {recursive: true});
  cpSync(resolve(vendor, 'autoload.php'), resolve(app, 'vendor/autoload.php'));
  appendFileSync(process.env.GITHUB_OUTPUT, `dependencies_changed=${changed}\n`);
  console.log(changed ? 'Dependency versions changed. Vendor sync required.' : 'Installed dependency versions match. Reusing vendor and refreshing autoload metadata.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
