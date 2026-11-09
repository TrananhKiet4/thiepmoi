import assert from 'node:assert/strict';
import {photoPaths, validateDestination, curlQuote} from '../scripts/publish-dataonline-photos.mjs';
import {companionPhotos} from '../packages/contracts/src/companion-photos.ts';

const paths = photoPaths();
assert.equal(paths.length, new Set(paths).size);
assert(paths.includes('invitation-assets/photos/demo.webp'));
assert(paths.includes('invitation-assets/photos/anh-bia-59a24693-1280.webp'));
assert(paths.every(path => path.endsWith('.webp') && path.startsWith('invitation-assets/photos/')));
for (const photo of companionPhotos) {
  assert(paths.includes(`invitation-assets/photos/companions/${photo.file}.webp`));
  assert(paths.includes(`invitation-assets/photos/companions/${photo.file}-small.webp`));
}
assert.throws(() => photoPaths([{file: '../../.env'}]));
const settings = {FTPS_SERVER: 'sv66.dataonline.vn', FTPS_USERNAME: 'fixture', FTPS_PASSWORD: 'fixture-pass', FTPS_SERVER_DIR: '/domains/trananhkiet.id.vn/'};
validateDestination(settings);
validateDestination({...settings, FTPS_SERVER_DIR: '/'});
assert.throws(() => validateDestination({...settings, FTPS_SERVER_DIR: '/domains/../'}));
assert.throws(() => validateDestination({...settings, FTPS_PASSWORD: 'line\nbreak'}));
assert.throws(() => validateDestination({...settings, FTPS_SERVER: 'other.example'}));
assert.equal(curlQuote('a"b\\c'), '"a\\"b\\\\c"');
assert.throws(() => curlQuote('line\rbreak'));
console.log('Direct photo path selection and FTPS input checks passed.');
