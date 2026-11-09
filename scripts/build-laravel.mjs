import {cpSync, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join, relative, resolve} from 'node:path';
import {staticMedia} from '../packages/contracts/src/static-media.ts';
import {companionPhotos} from '../packages/contracts/src/companion-photos.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const vite = join(root, 'node_modules/vite/bin/vite.js');
const result = spawnSync(process.execPath, [vite, 'build'], {
  cwd: join(root, 'frontend'), stdio: 'inherit', windowsHide: true,
});
if (result.status !== 0) process.exit(result.status ?? 1);

const target = join(root, 'public');
mkdirSync(target, {recursive: true});
cpSync(join(root, 'frontend/dist'), target, {
  recursive: true,
  filter(source) {
    const path = relative(join(root, 'frontend/dist'), source).replaceAll('\\', '/');
    if (!path.startsWith('invitation-assets/')) return true;
    return ['invitation-assets/photos', 'invitation-assets/photos/demo.webp', 'invitation-assets/photos/.htaccess'].includes(path);
  },
});
const companion_paths = companionPhotos.filter(photo => photo.file).flatMap(photo => [
  `/invitation-assets/photos/companions/${photo.file}.webp`,
  `/invitation-assets/photos/companions/${photo.file}-small.webp`,
]);
const catalog = join(root, 'bootstrap/cache/invitation-media.json');
mkdirSync(resolve(catalog, '..'), {recursive: true});
writeFileSync(catalog, JSON.stringify({media: staticMedia, companion_paths}));
if (!existsSync(join(target, 'index.html')) || !readFileSync(catalog, 'utf8').includes('companion_paths')) {
  throw new Error('Laravel web build is incomplete');
}
console.log('Laravel frontend and media catalog built in public/.');
