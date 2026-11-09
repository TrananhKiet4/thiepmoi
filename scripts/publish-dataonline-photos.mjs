import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {posix, resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {staticMedia} from '../packages/contracts/src/static-media.ts';
import {companionPhotos} from '../packages/contracts/src/companion-photos.ts';

export function photoPaths(photos = companionPhotos) {
  const paths = [];
  for (const asset of Object.values(staticMedia).filter(asset => asset.type === 'IMAGE')) {
    paths.push(asset.url);
    for (const source of (asset.srcSet || '').split(',').map(value => value.trim()).filter(Boolean)) paths.push(source.split(/\s+/)[0]);
  }
  for (const photo of photos) {
    paths.push(`/invitation-assets/photos/companions/${photo.file}.webp`, `/invitation-assets/photos/companions/${photo.file}-small.webp`);
  }
  return [...new Set(paths.map(path => path.replace(/^\//, '')))].map(path => {
    assert(/^invitation-assets\/photos\/(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.webp$/.test(path), 'Invalid photo path');
    return path;
  });
}

export function validateDestination(settings) {
  assert(settings.FTPS_SERVER === 'sv66.dataonline.vn', 'Use the configured Data Online FTPS hostname');
  for (const name of ['FTPS_USERNAME', 'FTPS_PASSWORD', 'FTPS_SERVER_DIR']) {
    assert(settings[name] && !/[\r\n]/.test(settings[name]), 'Missing or invalid setting ' + name);
  }
  assert(settings.FTPS_SERVER_DIR.startsWith('/') && settings.FTPS_SERVER_DIR.endsWith('/'), 'FTP directory must start and end with /');
  assert(/^\/[A-Za-z0-9._/-]*$/.test(settings.FTPS_SERVER_DIR), 'Invalid FTP directory');
  assert(!settings.FTPS_SERVER_DIR.split('/').some(part => part === '.' || part === '..'), 'Relative FTP path segments are forbidden');
}

export function curlQuote(value) {
  assert(!/[\r\n]/.test(value), 'Control characters are forbidden in FTP settings');
  return '"' + value.replaceAll('\\', '\\\\').replaceAll('"', '\\"') + '"';
}

const digest = data => createHash('sha256').update(data).digest('hex');

async function main() {
  const settings = process.env;
  validateDestination(settings);
  const port = Number(settings.FTPS_PORT || 21);
  assert(Number.isInteger(port) && port > 0 && port < 65536, 'Invalid FTPS port');
  const base = `ftp://${settings.FTPS_SERVER}:${port}/${settings.FTPS_SERVER_DIR}`;
  const origin = 'https://www.trananhkiet.id.vn/';
  const staging = resolve('.data/dataonline/photo-upload');
  mkdirSync(staging, {recursive: true});

  function curl(options, allowMissing = false) {
    const config = ['silent', 'show-error', 'fail', 'ssl-reqd', 'tlsv1.2',
      'connect-timeout=10', 'max-time=90',
      'user=' + curlQuote(settings.FTPS_USERNAME + ':' + settings.FTPS_PASSWORD),
      ...options.map(([name, value]) => value === null ? name : name + '=' + curlQuote(value)),
    ].join('\n');
    return new Promise((resolvePromise, reject) => {
      const child = spawn(process.platform === 'win32' ? 'curl.exe' : 'curl', ['--config', '-'], {windowsHide: true});
      const chunks = [];
      let length = 0;
      child.stdout.on('data', chunk => {
        length += chunk.length;
        if (length > 20 * 1024 * 1024) child.kill();
        else chunks.push(chunk);
      });
      child.stderr.resume();
      child.on('error', () => reject(new Error('Unable to start curl')));
      child.on('close', code => {
        if (code === 0) resolvePromise(Buffer.concat(chunks));
        // curl reports 9 for a missing parent directory and 78 for a missing file.
        else if (allowMissing && (code === 78 || code === 9)) resolvePromise(null);
        else reject(new Error('FTPS operation failed with curl code ' + code));
      });
      child.stdin.on('error', () => {});
      child.stdin.end(config);
    });
  }

  async function upload(local, remote) {
    const temporary = posix.join(posix.dirname(remote), '.' + posix.basename(remote) + '.upload-' + randomUUID());
    try {
      await curl([['ftp-create-dirs', null], ['upload-file', local], ['url', base + temporary]]);
      await curl([
        ['quote', 'RNFR ' + settings.FTPS_SERVER_DIR + temporary],
        ['quote', 'RNTO ' + settings.FTPS_SERVER_DIR + remote],
        ['url', base + posix.dirname(remote) + '/'], ['output', process.platform === 'win32' ? 'NUL' : '/dev/null'],
      ]);
    } finally {
      await curl([
        ['quote', '*DELE ' + settings.FTPS_SERVER_DIR + temporary],
        ['url', base + posix.dirname(remote) + '/'], ['output', process.platform === 'win32' ? 'NUL' : '/dev/null'],
      ]);
    }
  }

  const remoteComposer = JSON.parse((await curl([['url', base + 'thiepmoi-app/composer.json']])).toString('utf8'));
  assert(remoteComposer.name === 'trananhkiet4/thiepmoi', 'FTP destination does not match this application');
  let photos = companionPhotos;
  if (existsSync('đồng hành')) {
    const {prepareCompanionPhotos} = await import('./companion-photos.mjs');
    photos = await prepareCompanionPhotos();
    assert(photos.length > 0, 'The companion photo directory is empty');
  }
  const keys = photoPaths(photos);
  const {default: sharp} = await import('sharp');
  const images = [];
  for (const key of keys) {
    const local = resolve('frontend/public', key);
    const size = statSync(local).size;
    assert(size > 0 && size <= 20 * 1024 * 1024, 'Invalid image size for ' + key);
    assert((await sharp(local).metadata()).format === 'webp', 'Expected WebP photo ' + key);
    images.push({key, local, bytes: size, hash: digest(readFileSync(local))});
  }

  const headerPath = 'public_html/invitation-assets/photos/.htaccess';
  const previousHeaders = await curl([['url', base + headerPath]], true);
  const headersChanged = previousHeaders === null || !previousHeaders.equals(readFileSync('frontend/public/invitation-assets/photos/.htaccess'));
  if (headersChanged) await upload(resolve('frontend/public/invitation-assets/photos/.htaccess'), headerPath);
  try {
    const headerCheck = await fetch(origin + 'invitation-assets/photos/demo.webp', {redirect: 'manual', signal: AbortSignal.timeout(15000)});
    assert(headerCheck.status === 200, 'Photo directory configuration failed');
    await headerCheck.arrayBuffer();
  } catch (error) {
    if (headersChanged && previousHeaders !== null) {
      const backup = resolve(staging, 'previous-headers.htaccess');
      writeFileSync(backup, previousHeaders);
      await upload(backup, headerPath);
    } else if (headersChanged) {
      await curl([['quote', '*DELE ' + settings.FTPS_SERVER_DIR + headerPath], ['url', base + 'public_html/invitation-assets/photos/'], ['output', process.platform === 'win32' ? 'NUL' : '/dev/null']]);
    }
    throw error;
  }
  let uploaded = 0;
  let skipped = 0;
  for (let index = 0; index < images.length; index += 3) {
    const outcomes = await Promise.allSettled(images.slice(index, index + 3).map(async image => {
      const remote = 'public_html/' + image.key;
      const existing = await curl([['url', base + remote]], true);
      if (existing !== null) {
        assert(digest(existing) === image.hash, 'Photo path already contains different content. Generate a new filename for ' + image.key);
        skipped++;
      } else {
        await upload(image.local, remote);
        uploaded++;
      }
      const response = await fetch(origin + image.key, {method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(15000)});
      assert(response.status === 200 && !response.headers.has('location'), 'Photo is not served directly: ' + image.key);
      assert(Number(response.headers.get('content-length')) === image.bytes, 'Uploaded photo size differs: ' + image.key);
      assert(response.headers.get('content-type')?.startsWith('image/webp'), 'Unexpected photo content type');
    }));
    for (const outcome of outcomes) if (outcome.status === 'rejected') throw outcome.reason;
    console.log(JSON.stringify({verified: Math.min(index + 3, images.length), total: images.length, uploaded, skipped}));
  }
  if (JSON.stringify(photos) !== JSON.stringify(companionPhotos)) {
    const rows = photos.map(({id, file, width, height, smallWidth}) => `  { id: '${id}', file: '${file}', width: ${width}, height: ${height}, smallWidth: ${smallWidth} },`);
    writeFileSync('packages/contracts/src/companion-photos.ts', '// Generated by scripts/publish-dataonline-photos.mjs.\nexport const companionPhotos = [\n' + rows.join('\n') + '\n] as const;\n');
  }
  console.log(JSON.stringify({completed: true, companionPhotos: photos.length, files: images.length, bytes: images.reduce((sum, image) => sum + image.bytes, 0), uploaded, skipped}));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {console.error(error.message); process.exitCode = 1;});
}
