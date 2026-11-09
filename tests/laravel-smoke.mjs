import {spawnSync} from 'node:child_process';
import {createCipheriv, createHmac, randomBytes, randomUUID} from 'node:crypto';
import {demoContent} from '../backend/prisma/data/demo.ts';

const invitationId = randomUUID();
const token = randomBytes(32).toString('base64url');
const encrypt = value => {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.alloc(32, 'k'), nonce);
  cipher.setAAD(Buffer.from(invitationId));
  const bytes = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), bytes]).toString('base64');
};
const legacy = {
  invitationId, token, ciphertext: encrypt(token), codeCiphertext: encrypt('Ab123'),
  codeHash: createHmac('sha256', Buffer.alloc(32, 'k')).update('invitation-link:v1\0khach-cu\0Ab123').digest('hex'),
};
const result = spawnSync(process.env.PHP_BINARY || 'php', ['-d', 'zend.assertions=1', '-d', 'assert.exception=1', 'tests/laravel-smoke.php', ...process.argv.slice(2)], {
  input: JSON.stringify({content: demoContent('00000000-0000-4000-8000-000000000001'), legacy}), encoding: 'utf8', windowsHide: true,
});
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
process.exitCode = result.status ?? 1;
